/* ===== Lógica pura (sem DOM) — testável isolada ===== */
const L = (() => {
  const pad = n => String(n).padStart(2, '0');
  const ym = (y, m) => `${y}-${pad(m)}`;
  const parseYM = s => { const [y, m] = s.split('-').map(Number); return { y, m }; };
  const addMonths = (s, k) => { const { y, m } = parseYM(s); const t = y * 12 + (m - 1) + k; return ym(Math.floor(t / 12), (t % 12) + 1); };
  const diffMonths = (a, b) => { const A = parseYM(a), B = parseYM(b); return (B.y - A.y) * 12 + (B.m - A.m); };
  const daysIn = (y, m) => new Date(y, m, 0).getDate();
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const todayISO = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const fmtYM = s => { const { y, m } = parseYM(s); return `${MESES[m - 1]}/${String(y).slice(2)}`; };
  const fmtYMlong = s => { const { y, m } = parseYM(s); return `${MESES[m - 1]} ${y}`; };
  const fmtDia = s => { const [, m, d] = s.split('-'); return `${d}/${m}`; };

  /* ---- feriados nacionais (para o último dia útil) ---- */
  function pascoa(y) { // algoritmo de Meeus
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }
  function feriados(y) {
    const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(s => `${y}-${s}`);
    const p = pascoa(y), shift = n => { const d = new Date(p); d.setDate(d.getDate() + n); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
    return new Set([...fixos, shift(-48), shift(-47), shift(-2), shift(60)]); // carnaval seg/ter, sexta santa, corpus christi
  }
  function ultimoDiaUtil(s) {
    const { y, m } = parseYM(s), fer = feriados(y);
    for (let d = daysIn(y, m); d > 0; d--) {
      const wd = new Date(y, m - 1, d).getDay();
      if (wd !== 0 && wd !== 6 && !fer.has(iso(y, m, d))) return iso(y, m, d);
    }
  }

  /* ---- ciclo do cartão ----
     Fatura "M" fecha no dia F de M. Compras a partir do dia F entram na fatura seguinte
     (o dia do fechamento é o "melhor dia de compra"). Vence no dia V de M+1.
     Mês de referência M = salário de M + fatura M + contas pagas em M. */
  const fechaDia = (s, F) => { const { y, m } = parseYM(s); return Math.min(F, daysIn(y, m)); };
  function cicloDe(dataISO, F) {
    const [y, m, d] = dataISO.split('-').map(Number);
    return d < fechaDia(ym(y, m), F) ? ym(y, m) : addMonths(ym(y, m), 1);
  }
  function janelaCiclo(s, F, V) { // datas de compra que caem na fatura s
    const ant = addMonths(s, -1), a = parseYM(ant), b = parseYM(s), prox = parseYM(addMonths(s, 1));
    const ini = iso(a.y, a.m, fechaDia(ant, F));
    const fimDia = fechaDia(s, F) - 1;
    const fim = fimDia >= 1 ? iso(b.y, b.m, fimDia) : iso(a.y, a.m, daysIn(a.y, a.m));
    const fecha = iso(b.y, b.m, fechaDia(s, F));
    const vence = iso(prox.y, prox.m, Math.min(V, daysIn(prox.y, prox.m)));
    return { ini, fim, fecha, vence };
  }
  const dias = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);

  /* ---- montagem do mês ---- */
  // item: {id,d,desc,v,t:'d'|'r',cat,pg:'cc'|'conta',n,p0,fat}
  // fixo: {id,desc,v,t,cat,pg,dia:number|'util',ini,fim}
  function parcelasDe(it, F) {
    const n = Math.max(1, it.n || 1), p0 = Math.max(1, Math.min(n, it.p0 || 1));
    const base = it.t === 'd' && it.pg === 'cc' ? (it.fat || cicloDe(it.d, F)) : it.d.slice(0, 7);
    const vp = Math.round((it.v / n) * 100) / 100;
    const out = [];
    for (let k = p0; k <= n; k++) {
      const v = k === n ? Math.round((it.v - vp * (n - 1)) * 100) / 100 : vp; // ajusta centavos na última
      out.push({ ref: addMonths(base, k - p0), k, n, v });
    }
    return out;
  }

  function indexar(items, F) { // ref -> entradas de lançamentos (com parcelas projetadas)
    const idx = {};
    for (const it of items) {
      for (const p of parcelasDe(it, F)) {
        (idx[p.ref] ||= []).push({
          src: 'tx', id: it.id, item: it, desc: it.desc, v: p.v, t: it.t, cat: it.cat, pg: it.pg,
          d: it.d, tipo: p.n > 1 ? 'parcela' : 'variavel', parc: p.n > 1 ? `${p.k}/${p.n}` : '', k: p.k, n: p.n,
        });
      }
    }
    return idx;
  }

  function fixosDoMes(fixos, s, ovr, F) {
    const out = [];
    for (const f of fixos) {
      if (f.ini && s < f.ini) continue;
      if (f.fim && s > f.fim) continue;
      const o = (ovr || {})[f.id];
      if (o && o.skip) continue;
      const { y, m } = parseYM(s);
      let d = f.dia === 'util' ? ultimoDiaUtil(s) : iso(y, m, Math.min(+f.dia || 1, daysIn(y, m)));
      out.push({ src: 'fixo', id: f.id, fixo: f, desc: f.desc, v: o && o.v != null ? o.v : f.v, t: f.t, cat: f.cat, pg: f.pg, d, tipo: 'fixo', ajustado: !!(o && o.v != null) });
    }
    return out;
  }

  function mes(state, s, idx) {
    const F = state.cfg.cartao.fecha;
    const ovr = (state.ovr || {})[s] || {};
    const tx = idx[s] || [], fx = fixosDoMes(state.cfg.fixos, s, ovr, F);
    // Fixo de cartão reconhecido na fatura: vale o lançamento real (sem duplicar).
    // Fatura já fechada e importada sem ele: não foi cobrado, não projeta.
    const fechada = state.atual && s < state.atual && tx.some(e => e.tipo === 'variavel' && e.pg === 'cc' && e.item && (e.item.imp || e.item.fat));
    const pares = [];
    fx.forEach((f, i) => {
      if (f.t !== 'd' || f.pg !== 'cc') return;
      const k = f.fixo.chave || chaveRec(f.desc);
      tx.forEach((e, j) => {
        if (e.tipo !== 'variavel' || e.t !== 'd' || e.pg !== 'cc' || !(e.v > 0) || chaveRec(e.desc) !== k) return;
        const d = Math.abs(e.v - f.v) / Math.max(1, f.v);
        if (d <= 0.3) pares.push([d, i, j]);
      });
    });
    pares.sort((a, b) => a[0] - b[0]);
    const fU = new Map(), eU = new Map();
    for (const [, i, j] of pares) if (!fU.has(i) && !eU.has(j)) { fU.set(i, j); eU.set(j, i); }
    const entradas = [
      ...tx.map((e, j) => eU.has(j) ? { ...e, tipo: 'fixo', fixoId: fx[eU.get(j)].id, reconhecido: true } : e),
      ...fx.filter((f, i) => !fU.has(i) && !(fechada && f.t === 'd' && f.pg === 'cc')),
    ];
    const catInfo = Object.fromEntries(state.cfg.cats.map(c => [c.id, c]));
    const t = { rec: 0, recFixa: 0, recVar: 0, desp: 0, despFixa: 0, despVar: 0, despParc: 0, fatura: 0, conta: 0, poupanca: 0, porCat: {}, essenciais: 0 };
    for (const e of entradas) {
      if (e.t === 'r') { t.rec += e.v; e.tipo === 'fixo' ? (t.recFixa += e.v) : (t.recVar += e.v); continue; }
      t.desp += e.v;
      if (e.tipo === 'fixo') t.despFixa += e.v; else if (e.tipo === 'parcela') t.despParc += e.v; else t.despVar += e.v;
      e.pg === 'cc' ? (t.fatura += e.v) : (t.conta += e.v);
      t.porCat[e.cat] = (t.porCat[e.cat] || 0) + e.v;
      const g = catInfo[e.cat]?.grupo;
      if (g === 'poupanca') t.poupanca += e.v;
      if (g === 'essencial') t.essenciais += e.v;
    }
    t.consumo = t.desp - t.poupanca;
    t.sobra = t.rec - t.desp;
    t.taxa = t.rec > 0 ? (t.rec - t.consumo) / t.rec : null; // poupança = sobra + aportes
    entradas.sort((a, b) => (b.d || '').localeCompare(a.d || ''));
    return { s, entradas, t };
  }

  /* ---- importação CSV de fatura ---- */
  function parseValor(x) {
    if (x == null) return NaN;
    let s = String(x).trim().replace(/[R$\s]/g, '');
    const neg = /^-|^\(.*\)$|-$/.test(s); s = s.replace(/[()\-]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = s.replace(',', '.');
    const v = parseFloat(s); return neg ? -v : v;
  }
  function parseData(x) {
    const s = String(x).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return iso(+y, +m[2], +m[1]); }
    return null;
  }
  function splitCSV(txt) {
    const linhas = txt.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    const sep = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ',';
    return linhas.map(l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(c => c.trim()); });
  }
  function lerFatura(txt) {
    const rows = splitCSV(txt); if (!rows.length) return [];
    const head = rows[0].map(h => h.toLowerCase());
    const temHead = head.some(h => /data|date|desc|title|valor|amount|estabelec|lan[cç]amento/.test(h));
    let iD = 0, iT = 1, iV = 2;
    if (temHead) {
      iD = head.findIndex(h => /data|date/.test(h));
      iT = head.findIndex(h => /desc|title|estabelec|hist|lan[cç]amento/.test(h));
      iV = head.findIndex(h => /valor|amount|r\$/.test(h));
    }
    const out = [];
    for (const r of rows.slice(temHead ? 1 : 0)) {
      const d = parseData(r[iD]), desc = (r[iT] || '').replace(/\s+/g, ' ').trim(), v = parseValor(r[iV]);
      if (!d || !desc || !isFinite(v) || v === 0) continue;
      if (/pagamento (recebido|efetuado|de fatura)|pagto|pag fatura/i.test(desc)) continue;
      const pm = desc.match(/(?:parcela\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i);
      const okp = pm && +pm[2] > 1 && +pm[1] <= +pm[2];
      out.push({ d, desc: okp ? desc.slice(0, pm.index).replace(/[-–\s]+$/, '') : desc, v, k: okp ? +pm[1] : 1, n: okp ? +pm[2] : 1 });
    }
    return out;
  }

  /* ---- categorização automática ---- */
  const REGRAS = [
    [/ifood|rappi|z[eé] delivery|aiqfome|delivery|james/i, 'delivery'],
    [/uber|\b99 ?(app|pop|taxi)\b|cabify|posto|shell|ipiranga|petrobras|br mania|estacion|sem parar|conectcar|veloe|metr[oô]|bilhete|onibus|ped[aá]gio/i, 'transporte'],
    [/netflix|spotify|disney|prime ?video|amazon prime|hbo|max\.com|youtube|apple\.com|itunes|icloud|google ?(one|storage|play)|deezer|globoplay|paramount|crunchyroll|chatgpt|openai|claude|anthropic|microsoft|xbox|playstation|psn|steam/i, 'assinaturas'],
    [/drogaria|farm[aá]cia|droga ?raia|drogasil|pague menos|panvel|hospital|cl[ií]nica|laborat|odonto|m[eé]dic|unimed|amil|hapvida/i, 'saude'],
    [/carrefour|assa[ií]|atacad|p[aã]o de a[cç]|supermerc|mercado(?! ?livre)|hortifruti|sams club|extra |big |zaffari|savegnago|condor|muffato|bh supermerc/i, 'mercado'],
    [/restaurante|lanchonete|padaria|burger|mc ?donald|bk |outback|starbucks|caf[eé]|pizza|bar |boteco|sushi|churrasc|a[cç]a[ií]|sorvet|subway|habib|giraffas|coco bambu/i, 'alimentacao'],
    [/amazon|mercado ?livre|mercadolivre|shopee|shein|aliexpress|magalu|magazine|americanas|casas bahia|renner|zara|c&a|riachuelo|centauro|netshoes|kabum|decathlon/i, 'compras'],
    [/smart ?fit|academia|bluefit|selfit|gympass|wellhub|barbearia|sal[aã]o|cabeleir|est[eé]tica|perfum|botic[aá]rio|natura|sephora/i, 'pessoal'],
    [/petz|cobasi|pet ?shop|veterin/i, 'pets'],
    [/cinema|ingresso|sympla|eventim|show|teatro|parque|game|bilheteria/i, 'lazer'],
    [/latam|gol |azul |airbnb|booking|hotel|decolar|hurb|cvc|pousada/i, 'viagem'],
    [/vivo|claro|tim |oi |net |internet|enel|cemig|copel|sabesp|light|cpfl|energia|[aá]gua|g[aá]s|condom/i, 'casa'],
    [/curso|udemy|alura|escola|faculdade|livraria|livro/i, 'educacao'],
    [/iof|anuidade|juros|tarifa|encargo|multa/i, 'taxas'],
  ];
  function categorizar(desc, aprendidas) {
    const k = norm(desc);
    if (aprendidas && aprendidas[k]) return aprendidas[k];
    for (const [re, c] of REGRAS) if (re.test(desc)) return c;
    return 'outros';
  }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

  /* ---- recorrência e compras parceladas ---- */
  const chaveRec = s => { const n = norm(s); return n.split(' ').map(w => w.replace(/\d+/g, '')).filter(Boolean).join(' ') || n; };
  const refDe = (it, F) => it.t === 'd' && it.pg === 'cc' ? (it.fat || cicloDe(it.d, F)) : it.d.slice(0, 7);
  const origemDe = (it, F) => addMonths(refDe(it, F), -((it.p0 || 1) - 1)); // fatura da 1ª parcela
  // cobranças do cartão que se repetem: mesma descrição (sem números), valor até 3% diferente,
  // no máximo uma por fatura, em 2+ faturas quase seguidas e ainda ativa
  function recorrentes(items, F, fixos, ignorar) {
    const g = {}; let ate = '';
    for (const it of items) {
      if (it.t !== 'd' || it.pg !== 'cc' || (it.n || 1) > 1 || !(it.v > 0)) continue;
      const ref = refDe(it, F), k = chaveRec(it.desc);
      if (ref > ate) ate = ref;
      (g[k] ||= []).push({ it, ref, v: it.v });
    }
    const out = [], ign = new Set(ignorar || []);
    for (const [k, l] of Object.entries(g)) {
      l.sort((a, b) => a.v - b.v);
      const cl = [];
      for (const x of l) { const c = cl[cl.length - 1]; if (c && x.v <= c[0].v * 1.03 + 0.5) c.push(x); else cl.push([x]); }
      for (const c of cl) {
        const refs = [...new Set(c.map(x => x.ref))].sort();
        if (refs.length < 2 || refs.length !== c.length) continue;
        if (diffMonths(refs[0], refs[refs.length - 1]) > refs.length) continue;
        if (diffMonths(refs[refs.length - 1], ate) > 1) continue;
        const u = c.reduce((a, b) => (a.ref > b.ref ? a : b));
        const id = k + '|' + Math.round(u.v);
        if (ign.has(id) || (fixos || []).some(f => f.recId === id)) continue;
        if ((fixos || []).some(f => f.t === 'd' && (!f.fim || f.fim >= u.ref) && (f.chave || chaveRec(f.desc)) === k && Math.abs(f.v - u.v) <= Math.max(1, u.v * 0.1))) continue;
        out.push({ id, chave: k, desc: u.it.desc, v: u.v, cat: u.it.cat, dia: +u.it.d.slice(8, 10), refs, ini: refs[0] });
      }
    }
    return out.sort((a, b) => b.v - a.v);
  }
  // mesma compra parcelada lançada mais de uma vez (ex.: importou a 2/12 e depois a 1/12)
  function comprasDuplicadas(items, F) {
    const g = {};
    for (const it of items) if (it.t === 'd' && (it.n || 1) > 1) (g[norm(it.desc) + '|' + it.n + '|' + origemDe(it, F)] ||= []).push(it);
    return Object.values(g).filter(l => l.length > 1 && l.every(x => Math.abs(x.v / x.n - l[0].v / l[0].n) < 1)).map(l => l.sort((a, b) => (a.p0 || 1) - (b.p0 || 1)));
  }

  return { chaveRec, refDe, origemDe, recorrentes, comprasDuplicadas, pad, ym, parseYM, addMonths, diffMonths, daysIn, iso, todayISO, fmtYM, fmtYMlong, fmtDia, MESES, ultimoDiaUtil, feriados,
    fechaDia, cicloDe, janelaCiclo, dias, parcelasDe, indexar, fixosDoMes, mes, parseValor, parseData, lerFatura, categorizar, norm };
})();
