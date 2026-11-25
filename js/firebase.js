/* Conexão com o Firebase: login Google + Firestore com cache offline.
   Expõe para o app (js/app.js) um objeto FB via window.__fbResolve.
   Dados de cada usuário ficam em:
     users/{uid}/cfg/main          configurações, categorias, fixos, metas
     users/{uid}/meses/{AAAA-MM}   lançamentos do mês e ajustes de fixos */
const V = '10.12.2';
const cfg = window.FIREBASE_CONFIG;

async function iniciar() {
  if (!cfg) return null;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  const provider = new A.GoogleAuthProvider();
  A.getRedirectResult(auth).catch(e => console.error('login (redirect)', e));

  // null num mapa de lançamentos = apagar a chave
  const paraFs = patch => {
    const out = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = {};
        for (const [k2, v2] of Object.entries(v)) out[k][k2] = v2 === null ? F.deleteField() : v2;
      } else out[k] = v === null ? F.deleteField() : v;
    }
    return out;
  };

  return {
    onUser: cb => A.onAuthStateChanged(auth, cb),
    async login() {
      try { await A.signInWithPopup(auth, provider); }
      catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return A.signInWithRedirect(auth, provider);
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
      }
    },
    logout: () => A.signOut(auth),
    store(uid, onErro) {
      const raw = { cfg: null, meses: {} };
      const ref = (...p) => F.doc(db, 'users', uid, ...p);
      // gravação não espera o servidor: o Firestore aplica na hora no aparelho
      // e sincroniza quando houver rede. Erros (ex.: regra negando) vão para onErro.
      const enviar = p => { p.catch(onErro); return Promise.resolve(); };
      return {
        kind: 'db',
        subscribe(f, st) {
          const ok = { c: false, m: false }, pend = { c: false, m: false };
          let timer = setTimeout(() => st('lento'), 10000);
          const chk = () => { if (ok.c && ok.m) { clearTimeout(timer); st(pend.c || pend.m ? 'pendente' : navigator.onLine ? 'ok' : 'lento'); } };
          const err = e => { clearTimeout(timer); st('erro', e); };
          F.onSnapshot(ref('cfg', 'main'), { includeMetadataChanges: true }, s => {
            raw.cfg = s.exists() ? s.data() : null; ok.c ||= !s.metadata.fromCache; pend.c = s.metadata.hasPendingWrites; f(raw); chk();
          }, err);
          F.onSnapshot(F.collection(db, 'users', uid, 'meses'), { includeMetadataChanges: true }, s => {
            raw.meses = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); ok.m ||= !s.metadata.fromCache; pend.m = s.metadata.hasPendingWrites; f(raw); chk();
          }, err);
        },
        mergeMes: (s, patch) => enviar(F.setDoc(ref('meses', s), paraFs(patch), { merge: true })),
        setCfg: c => enviar(F.setDoc(ref('cfg', 'main'), JSON.parse(JSON.stringify(c)))),
      };
    },
  };
}

iniciar().then(fb => window.__fbResolve(fb), e => { console.error('Firebase não carregou', e); window.__fbResolve(undefined); });
