/* Service worker: faz o site abrir sem internet.
   - Arquivos do site (html, css, js): rede primeiro, cache como reserva.
     Assim uma correção publicada chega na hora, e offline ainda abre.
   - Firebase e fontes (endereços com versão fixa): cache primeiro.
   - Chamadas de dados do Firestore/login: nunca passam por aqui
     (o próprio Firebase guarda os dados offline no aparelho). */
const VERSAO = 'v2';
const CASCA = `casca-${VERSAO}`, LIBS = `libs-${VERSAO}`;
const ARQUIVOS = ['./', './index.html', './css/app.css', './js/config.js', './js/logic.js', './js/app.js', './js/firebase.js', './manifest.webmanifest', './icones/icone-192.png', './icones/icone-512.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CASCA).then(c => Promise.all(ARQUIVOS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CASCA && k !== LIBS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const lib = (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (lib) {
    ev.respondWith(caches.open(LIBS).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  ev.respondWith(fetch(req).then(r => { if (r.ok) caches.open(CASCA).then(c => c.put(req, r.clone())); return r; })
    .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
