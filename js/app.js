/* ===== Livro-Caixa — app ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NF = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NF0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl = v => NF.format(v || 0);
const brl0 = v => NF0.format(v || 0);
const kfmt = v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : Math.round(v).toLocaleString('pt-BR');
const pct = v => v == null || !isFinite(v) ? '—' : Math.round(v * 100) + '%';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);

const CATS_PADRAO = [
  ['casa', 'Moradia e contas', 'd', 'essencial'], ['mercado', 'Mercado', 'd', 'essencial'], ['transporte', 'Transporte', 'd', 'essencial'],
  ['saude', 'Saúde', 'd', 'essencial'], ['educacao', 'Educação', 'd', 'essencial'], ['pets', 'Pets', 'd', 'essencial'],
  ['alimentacao', 'Comer fora', 'd', 'estilo'], ['delivery', 'Delivery', 'd', 'estilo'], ['assinaturas', 'Assinaturas', 'd', 'estilo'],
  ['compras', 'Compras', 'd', 'estilo'], ['pessoal', 'Cuidados pessoais', 'd', 'estilo'], ['lazer', 'Lazer', 'd', 'estilo'],
  ['viagem', 'Viagem', 'd', 'estilo'], ['presentes', 'Presentes', 'd', 'estilo'], ['taxas', 'Juros e tarifas', 'd', 'estilo'],
  ['outros', 'Outros', 'd', 'estilo'], ['investimentos', 'Investimentos e metas', 'd', 'poupanca'],
  ['salario', 'Salário', 'r', ''], ['extra', 'Renda extra', 'r', ''], ['rendimentos', 'Rendimentos', 'r', ''], ['reembolso', 'Reembolsos', 'r', ''], ['outras_r', 'Outras receitas', 'r', ''],
].map(([id, nome, t, grupo]) => ({ id, nome, t, grupo, orc: 0 }));
const GRUPOS = { essencial: 'Essencial', estilo: 'Estilo de vida', poupanca: 'Poupança' };
const cfgPadrao = () => ({ v: 1, cartao: { nome: 'Cartão de crédito', fecha: 29, vence: 5 }, metaTaxa: 0.2, cats: clone(CATS_PADRAO), fixos: [], metas: [], aprend: {} });
function mergeCfg(c) {
  const d = cfgPadrao(), x = clone(c || {});
  const out = { ...d, ...x, cartao: { ...d.cartao, ...(x.cartao || {}) } };
  for (const k of ['cats', 'fixos', 'metas']) if (!Array.isArray(out[k])) out[k] = d[k];
  out.aprend = out.aprend || {};
  return out;
}

const S = {
  cfg: cfgPadrao(), temCfg: false, items: [], ovr: {}, bucket: {}, idx: {}, cache: {},
  store: null, realStore: null, lastRaw: null, status: 'conectando', loaded: false, demo: false,
  view: 'painel', ref: null, filtro: 'todos', busca: '', user: null, fb: null, precisaLogin: false, todosInsights: false,
};
const F = () => S.cfg.cartao.fecha, V = () => S.cfg.cartao.vence;
const hoje = () => L.todayISO();
const cicloAtual = () => L.cicloDe(hoje(), F());
const catById = id => S.cfg.cats.find(c => c.id === id) || { id, nome: id || 'Sem categoria', t: 'd', grupo: 'estilo', orc: 0 };
const isPoup = id => catById(id).grupo === 'poupanca';
function recompute() { S.idx = L.indexar(S.items, F()); S.cache = {}; }
function M(s) { return S.cache[s] ||= L.mes({ cfg: S.cfg, ovr: S.ovr }, s, S.idx); }
const temDados = m => m.entradas.length > 0;

/* ===================== armazenamento ===================== */
function deepMerge(a, b) { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') deepMerge(a[k], v); else a[k] = clone(v); } return a; }
function stripNull(o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return o; const r = {}; for (const [k, v] of Object.entries(o)) if (v !== null) r[k] = stripNull(v); return r; }

function MemStore(key, seed) {
  let data = seed || { cfg: null, meses: {} };
  if (key) try { const s = localStorage.getItem(key); if (s) data = JSON.parse(s); } catch (e) { }
  let cb;
  const emit = () => cb && cb(clone(data));
  const persist = () => { if (key) try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { } };
  return {
    kind: key ? 'local' : 'demo',
    subscribe(f, st) { cb = f; setTimeout(() => { emit(); st && st(key ? 'local' : 'demo'); }, 0); },
    async mergeMes(s, patch) { data.meses[s] ||= { items: {}, ovr: {} }; deepMerge(data.meses[s], patch); persist(); emit(); },
    async setCfg(c) { data.cfg = clone(c); persist(); emit(); },
  };
}

function applyRaw(raw) {
  S.lastRaw = raw;
  if (S.demo && S.store.kind !== 'demo') return;
  S.temCfg = !!raw.cfg;
  S.cfg = mergeCfg(raw.cfg);
  S.items = []; S.ovr = {}; S.bucket = {};
  for (const [s, doc] of Object.entries(raw.meses || {})) {
    for (const [id, it] of Object.entries((doc && doc.items) || {})) if (it) { S.items.push({ ...it, id }); S.bucket[id] = s; }
    for (const [fid, o] of Object.entries((doc && doc.ovr) || {})) if (o) (S.ovr[s] ||= {})[fid] = { ...o };
  }
  S.loaded = true;
  if (!S.ref) S.ref = cicloAtual();
  recompute(); render();
}

async function act(p, okMsg) {
  try { await p; if (okMsg) toast(okMsg); return true; }
  catch (e) {
    const c = e && e.code;
    toast(c === 'quota_exceeded' ? 'Espaço cheio: exporte um backup e apague meses antigos.' : c === 'revoked' ? 'Acesso encerrado. Recarregue a página.' : 'Não salvou. Verifique a conexão e tente de novo.');
    console.error(e); return false;
  }
}
const salvarCfg = () => S.store.setCfg(S.cfg);
async function salvarItens(items) {
  const pb = {};
  for (const it of items) {
    const b = it.d.slice(0, 7), old = S.bucket[it.id];
    if (old && old !== b) (pb[old] ||= {})[it.id] = null;
    (pb[b] ||= {})[it.id] = it;
  }
  for (const [s, its] of Object.entries(pb)) await S.store.mergeMes(s, { items: its });
}
const excluirItem = it => S.store.mergeMes(S.bucket[it.id], { items: { [it.id]: null } });
const setOvr = (s, fid, o) => S.store.mergeMes(s, { ovr: { [fid]: o } });
function novoItem(o) { return { id: o.id || uid(), d: o.d, desc: o.desc || '', v: +o.v || 0, t: o.t || 'd', cat: o.cat || 'outros', pg: o.t === 'r' ? 'conta' : (o.pg || 'cc'), n: Math.max(1, +o.n || 1), p0: Math.max(1, +o.p0 || 1), fat: o.fat || null, nota: o.nota || '' }; }

/* ===================== análise ===================== */
function projecao(R) {
  const m = M(R), t = m.t, jan = L.janelaCiclo(R, F(), V()), h = hoje();
  const total = Math.max(1, L.dias(jan.ini, jan.fecha));
  const decorridos = Math.min(total, Math.max(1, L.dias(jan.ini, h) + 1));
  const fr = decorridos / total, restantes = Math.max(1, L.dias(h, jan.fecha));
  const consumo = e => e.t === 'd' && !isPoup(e.cat);
  const comprometido = sum(m.entradas.filter(e => consumo(e) && e.tipo !== 'variavel'), e => e.v);
  const varGasto = sum(m.entradas.filter(e => consumo(e) && e.tipo === 'variavel'), e => e.v);
  const permitido = t.rec * (1 - S.cfg.metaTaxa);
  const disponivel = permitido - comprometido - varGasto;
  const varProj = varGasto / fr;
  const sobraProj = t.rec - comprometido - varProj - t.poupanca;
  return { jan, fr, restantes, decorridos, total, comprometido, varGasto, varProj, permitido, disponivel, porDia: disponivel / restantes, sobraProj, taxaProj: t.rec ? (t.rec - comprometido - varProj) / t.rec : null };
}
function mesesAnteriores(R, n = 3) { return Array.from({ length: n }, (_, k) => M(L.addMonths(R, -(k + 1)))).filter(temDados); }

function insights(R) {
  const out = [], m = M(R), t = m.t, atual = cicloAtual(), meta = S.cfg.metaTaxa;
  const ant = mesesAnteriores(R);
  const media = f => ant.length ? sum(ant, f) / ant.length : null;
  const renda = t.rec || media(x => x.t.rec) || 0;
  const corrente = R === atual, p = corrente ? projecao(R) : null;
  const fator = cat => { // valor do mês, projetado até o fechamento no ciclo atual
    if (!corrente) return t.porCat[cat] || 0;
    const es = m.entradas.filter(e => e.t === 'd' && e.cat === cat);
    return sum(es.filter(e => e.tipo !== 'variavel'), e => e.v) + sum(es.filter(e => e.tipo === 'variavel'), e => e.v) / p.fr;
  };
  if (!temDados(m)) return out;
  const pre = corrente ? 'No ritmo atual, ' : '';

  // taxa de poupança
  if (renda > 0 && R <= atual) {
    const tx = corrente ? p.taxaProj : t.taxa;
    if (tx < 0) out.push({ n: 'critico', tit: corrente ? 'O mês vai fechar no vermelho' : 'Você gastou mais do que ganhou', txt: `${pre}as despesas passam a renda em ${brl0(-tx * renda)}.`, g: -tx * renda + meta * renda });
    else if (tx < meta) out.push({ n: tx < 0.1 ? 'critico' : 'atencao', tit: `Poupança de ${pct(tx)}, meta ${pct(meta)}`, txt: `${pre}faltam ${brl0((meta - tx) * renda)} para bater a meta do mês.`, g: (meta - tx) * renda });
    else out.push({ n: 'bom', tit: `Poupança de ${pct(tx)} no mês`, txt: `Acima da meta de ${pct(meta)}. Direcione a sobra para uma meta antes que vire gasto.` });
  }
  if (corrente && p.porDia < 0) out.push({ n: 'critico', tit: 'Orçamento variável do ciclo estourado', txt: `Você já passou ${brl0(-p.disponivel)} do que dava para gastar mantendo ${pct(meta)} de poupança. Segure o cartão até o fechamento em ${L.fmtDia(p.jan.fecha)}.`, g: -p.disponivel });

  // categorias: orçamento e crescimento
  for (const c of S.cfg.cats.filter(c => c.t === 'd' && c.grupo !== 'poupanca')) {
    const v = fator(c.id), avg = media(x => x.t.porCat[c.id] || 0);
    if (c.orc > 0 && v > c.orc * 1.05) out.push({ n: v > c.orc * 1.25 ? 'critico' : 'atencao', tit: `${c.nome} acima do orçamento`, txt: `${pre}${brl0(v)} contra ${brl0(c.orc)} planejados (${pct(v / c.orc - 1)} a mais).`, g: v - c.orc, cat: c.id });
    else if (avg != null && ant.length >= 2 && avg > 0 && v > avg * 1.25 && v - avg > 80) out.push({ n: 'atencao', tit: `${c.nome} subiu ${pct(v / avg - 1)}`, txt: `${pre}${brl0(v)} no mês contra média de ${brl0(avg)} nos ${ant.length} meses anteriores.`, g: v - avg, cat: c.id });
  }
  // juros
  if ((t.porCat.taxas || 0) > 0) out.push({ n: 'critico', tit: `${brl(t.porCat.taxas)} em juros, IOF e tarifas`, txt: 'Dinheiro que não compra nada. Negocie anuidade, evite rotativo e parcelamento da fatura.', g: t.porCat.taxas, cat: 'taxas' });
  // custo fixo
  if (renda > 0) {
    const fixo = sum(m.entradas.filter(e => e.t === 'd' && !isPoup(e.cat) && (e.tipo === 'fixo' || catById(e.cat).grupo === 'essencial')), e => e.v);
    const r = fixo / renda;
    if (r > 0.5) out.push({ n: r > 0.65 ? 'critico' : 'atencao', tit: `Fixos e essenciais levam ${pct(r)} da renda`, txt: `A referência é até 50%. É aqui que estão as economias grandes e duradouras: aluguel, planos, seguros, contas.`, g: fixo - renda * 0.5 });
  }
  // parcelas futuras
  const fut = [1, 2, 3, 4, 5, 6].map(k => sum((S.idx[L.addMonths(R, k)] || []).filter(e => e.tipo === 'parcela' && e.t === 'd'), e => e.v));
  if (fut[0] > 0 && renda > 0) {
    const r = fut[0] / renda;
    out.push({ n: r > 0.15 ? 'atencao' : 'info', tit: `${brl0(fut[0])} de parcelas já na próxima fatura`, txt: `${pct(r)} da renda já comprometida antes de você gastar. ${brl0(sum(fut))} nos próximos 6 meses.${r > 0.15 ? ' Evite novos parcelamentos até isso cair abaixo de 15%.' : ''}` });
  }
  // assinaturas
  const ass = t.porCat.assinaturas || 0;
  if (ass > 0) out.push({ n: 'info', tit: `Assinaturas: ${brl0(ass * 12)} por ano`, txt: `${brl(ass)} por mês. Cancele o que não usou nos últimos 30 dias; dá para assinar de novo quando quiser.`, cat: 'assinaturas' });
  // gastos formiga
  const peq = m.entradas.filter(e => e.t === 'd' && e.tipo === 'variavel' && e.v > 0 && e.v <= 50 && !isPoup(e.cat));
  if (peq.length >= 10) out.push({ n: renda && sum(peq, e => e.v) > renda * 0.05 ? 'atencao' : 'info', tit: `${peq.length} compras pequenas somam ${brl0(sum(peq, e => e.v))}`, txt: 'Gastos de até R$ 50 passam despercebidos na fatura. Delivery, café e app de corrida costumam ser os maiores.' });
  // reserva
  if (!S.cfg.metas.some(g => /reserva|emerg/i.test(g.nome))) {
    const ess = media(x => sum(x.entradas.filter(e => e.t === 'd' && !isPoup(e.cat) && (e.tipo === 'fixo' || catById(e.cat).grupo === 'essencial')), e => e.v)) ?? 0;
    const alvo = Math.ceil((ess || t.despFixa) * 6 / 500) * 500;
    if (alvo > 0) out.push({ n: 'atencao', tit: 'Sem reserva de emergência', txt: `Primeira meta recomendada: 6 meses do custo essencial, cerca de ${brl0(alvo)}. Deixe em liquidez diária (Tesouro Selic ou CDB 100% CDI).`, acao: 'reserva', alvo });
  }
  const ord = { critico: 0, atencao: 1, info: 2, bom: 3 };
  return out.sort((a, b) => ord[a.n] - ord[b.n] || (b.g || 0) - (a.g || 0));
}

/* ===================== render ===================== */
const VIEWS = [['painel', 'Painel'], ['extrato', 'Extrato'], ['fluxo', 'Fluxo de caixa'], ['fixos', 'Fixos'], ['metas', 'Metas'], ['ajustes', 'Ajustes']];
const ICON = {
  painel: '<path d="M3 13h6V3H3zM11 21h6V11h-6zM3 21h6v-6H3zM11 3v6h6V3z" transform="translate(2 0)"/>',
  extrato: '<path d="M6 4h12M6 9h12M6 14h12M6 19h8"/>',
  fluxo: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  fixos: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2"/>',
  metas: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
};
const BNAV = { painel: 'Painel', extrato: 'Extrato', fluxo: 'Fluxo', fixos: 'Fixos', metas: 'Metas', ajustes: 'Ajustes' };

function render() {
  const R = S.ref || cicloAtual();
  $('#mesLbl').textContent = L.fmtYMlong(R);
  const jan = L.janelaCiclo(R, F(), V());
  $('#cyc').innerHTML = `<span>Fatura: compras de <b>${L.fmtDia(jan.ini)}</b> a <b>${L.fmtDia(jan.fim)}</b></span><span>fecha <b>${L.fmtDia(jan.fecha)}</b> · vence <b>${L.fmtDia(jan.vence)}</b></span><span>salário <b>${L.fmtDia(L.ultimoDiaUtil(R))}</b></span>${R === cicloAtual() ? '<span class="pill acc">ciclo atual</span>' : R > cicloAtual() ? '<span class="pill">previsão</span>' : '<span class="pill">fechado</span>'}`;
  $('#tabs').innerHTML = VIEWS.map(([k, n]) => `<a href="#${k}" ${S.view === k ? 'aria-current="page"' : ''}>${n}</a>`).join('');
  $('#bnav').innerHTML = VIEWS.map(([k]) => `<a href="#${k}" ${S.view === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>${BNAV[k]}</a>`).join('');
  renderStatus();
  $('.fab').hidden = !!(S.precisaLogin && !S.demo);
  const main = $('#main');
  if (S.precisaLogin && !S.demo) { main.innerHTML = vLogin(); return; }
  if (!S.loaded) { main.innerHTML = `<div class="empty"><h2>Abrindo seu livro-caixa</h2><p>Carregando lançamentos, fixos e metas.</p></div>`; return; }
  const v = { painel: vPainel, extrato: vExtrato, fluxo: vFluxo, fixos: vFixos, metas: vMetas, ajustes: vAjustes }[S.view] || vPainel;
  main.innerHTML = v(R);
}
function renderStatus() {
  const st = { ok: ['sincronizado', 'var(--good)'], pendente: ['enviando…', 'var(--accent)'], conectando: ['conectando', 'var(--ink-3)'], lento: ['offline · salvo no aparelho', 'var(--warn)'], erro: ['erro ao sincronizar', 'var(--bad)'], local: ['só neste navegador', 'var(--warn)'], login: ['desconectado', 'var(--ink-3)'], demo: ['exemplo', 'var(--accent)'] }[S.demo ? 'demo' : S.status] || ['', ''];
  const el = $('#status'); el.textContent = st[0]; el.style.setProperty('--st', st[1]);
  const b = $('#banner');
  if (S.demo) { b.hidden = false; b.innerHTML = `<div class="wrap"><b>Dados de exemplo.</b> Nada aqui é salvo. <span class="sp"></span><button class="btn sm" data-act="sairDemo">Sair do exemplo</button></div>`; }
  else if (S.status === 'local') { b.hidden = false; b.innerHTML = `<div class="wrap">Firebase não configurado: salvando só neste navegador. Veja o README para ativar o login e a sincronização.</div>`; }
  else if (S.status === 'lento') { b.hidden = false; b.innerHTML = `<div class="wrap">Sem conexão. O que você lançar fica guardado no aparelho e sincroniza quando a internet voltar.</div>`; }
  else if (S.status === 'erro') { b.hidden = false; b.innerHTML = `<div class="wrap">O servidor recusou a sincronização. Confira se as regras do Firestore foram publicadas (README, passo 4).</div>`; }
  else b.hidden = true;
}

/* ---------- Painel ---------- */
function vOnboarding() {
  const linhas = [['Aluguel ou financiamento', 'casa', 'conta', 10], ['Condomínio', 'casa', 'conta', 10], ['Energia', 'casa', 'conta', 15], ['Água e gás', 'casa', 'conta', 15],
    ['Internet', 'casa', 'cc', 10], ['Celular', 'casa', 'cc', 10], ['Plano de saúde', 'saude', 'conta', 10], ['Academia', 'pessoal', 'cc', 5], ['Streaming e apps', 'assinaturas', 'cc', 10], ['Escola ou faculdade', 'educacao', 'conta', 10]];
  return `<div class="grid g-hero">
  <section class="card">
    <h2 style="font-size:22px">Monte seu mês em 2 minutos</h2>
    <p class="ink2">Comece pelo que se repete. Os gastos do cartão você lança no dia a dia ou importa da fatura depois.</p>
    <form id="onbForm" class="onb">
      <div class="lbl" style="margin-top:6px">Receita fixa</div>
      <div class="ln"><span>Salário líquido <small class="mut">(cai no último dia útil)</small></span><input class="i num" id="onb-sal" inputmode="decimal" placeholder="0,00"></div>
      <div class="lbl" style="margin-top:6px">Despesas fixas <small class="mut" style="text-transform:none;letter-spacing:0">deixe em branco o que não tem</small></div>
      ${linhas.map(([n, c, pg, d], i) => `<div class="ln"><span>${n}</span><input class="i num" id="onb-v${i}" data-n="${esc(n)}" data-c="${c}" data-d="${d}" inputmode="decimal" placeholder="0,00"><select class="i pgsel" id="onb-p${i}"><option value="cc" ${pg === 'cc' ? 'selected' : ''}>no cartão</option><option value="conta" ${pg === 'conta' ? 'selected' : ''}>em conta / boleto</option></select></div>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn pri" type="submit">Salvar e abrir o painel</button><button class="btn" type="button" data-act="demo">Ver com dados de exemplo</button></div>
    </form>
  </section>
  <section class="card">
    <h3>Como o Livro-Caixa conta o seu mês</h3>
    <div class="ins">
      <div class="in" data-n="info"><div><b>Mês = ciclo da fatura</b><p>Compras de ${S.cfg.cartao.fecha} do mês anterior até ${S.cfg.cartao.fecha - 1} do mês entram juntas. É a fatura que você paga com o salário do fim do mês.</p></div><span></span></div>
      <div class="in" data-n="info"><div><b>Parcelas se projetam sozinhas</b><p>Lance a compra uma vez com o número de parcelas. Cada fatura futura já mostra o valor comprometido.</p></div><span></span></div>
      <div class="in" data-n="info"><div><b>Fixos repetem todo mês</b><p>Conta de luz variou? Ajuste só aquele mês, sem mexer no padrão.</p></div><span></span></div>
      <div class="in" data-n="info"><div><b>Importe a fatura</b><p>Baixe o CSV no app do banco e importe em Lançamentos. A categoria é sugerida pela descrição e aprende com suas correções.</p></div><span></span></div>
    </div>
  </section></div>`;
}

function vPainel(R) {
  if (!S.items.length && !S.cfg.fixos.length && !S.demo) return vOnboarding();
  const m = M(R), t = m.t, atual = cicloAtual(), corrente = R === atual;
  const base = Math.max(t.rec, t.desp, 1);
  const sobraPos = Math.max(0, t.sobra);
  const jan = L.janelaCiclo(R, F(), V());
  const tile = (l, v, s, cls = '') => `<div class="card tile"><span class="lbl">${l}</span><span class="mid num ${cls}">${v}</span><span class="sub">${s}</span></div>`;
  // 50/30/20
  const g = { essencial: 0, estilo: 0, poupanca: 0 };
  for (const e of m.entradas) if (e.t === 'd') g[catById(e.cat).grupo || 'estilo'] += e.v;
  g.poupanca += Math.max(0, t.sobra);
  const gt = Math.max(1, t.rec || g.essencial + g.estilo + g.poupanca);

  let h = `<div class="grid g-hero">
  <section class="card">
    <span class="lbl">${corrente ? 'Sobra até agora' : R > atual ? 'Sobra prevista' : 'Sobra do mês'}</span>
    <div class="big num ${t.sobra < 0 ? 'neg' : ''}">${brl(t.sobra)}</div>
    <div class="sub">Receitas ${brl(t.rec)} menos despesas ${brl(t.desp)}${t.poupanca ? ` (inclui ${brl0(t.poupanca)} aplicados)` : ''}</div>
    <div class="stack" data-tip="Fatura ${brl(t.fatura)}\nEm conta ${brl(t.conta)}\nSobra ${brl(t.sobra)}">
      <span style="width:${t.fatura / base * 100}%;background:var(--accent)"></span>
      <span style="width:${t.conta / base * 100}%;background:var(--bar-2)"></span>
      <span style="width:${sobraPos / base * 100}%;background:var(--good)"></span>
    </div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Fatura ${brl0(t.fatura)}</span><span><i style="background:var(--bar-2)"></i>Em conta ${brl0(t.conta)}</span><span><i style="background:var(--good)"></i>Sobra ${brl0(sobraPos)}</span></div>
    <div class="divider"></div>
    <span class="lbl">Divisão da renda · referência 50/30/20</span>
    <div class="kv kv3">
      <div><div class="num" style="font-weight:600">${pct(g.essencial / gt)}</div><div class="sub">Essencial <span class="mut">até 50%</span></div></div>
      <div><div class="num" style="font-weight:600">${pct(g.estilo / gt)}</div><div class="sub">Estilo de vida <span class="mut">até 30%</span></div></div>
      <div><div class="num ${g.poupanca / gt >= S.cfg.metaTaxa ? 'pos' : ''}" style="font-weight:600">${pct(g.poupanca / gt)}</div><div class="sub">Poupança <span class="mut">${pct(S.cfg.metaTaxa)}+</span></div></div>
    </div>
  </section>
  ${corrente ? cardRitmo(R) : cardResumoFatura(R, jan)}
  </div>
  <div class="grid g4" style="margin-top:14px">
    ${tile('Receitas', brl(t.rec), `${brl0(t.recFixa)} fixas · ${brl0(t.recVar)} variáveis`)}
    ${tile('Fatura do cartão', brl(t.fatura), `vence ${L.fmtDia(jan.vence)} · ${brl0(sum(m.entradas.filter(e => e.pg === 'cc' && e.tipo === 'parcela' && e.t === 'd'), e => e.v))} em parcelas`)}
    ${tile('Despesas em conta', brl(t.conta), 'Pix, débito e boletos')}
    ${tile('Taxa de poupança', pct(t.taxa), `meta ${pct(S.cfg.metaTaxa)}`, t.taxa != null && t.taxa >= S.cfg.metaTaxa ? 'pos' : t.taxa != null && t.taxa < 0 ? 'neg' : '')}
  </div>`;

  const ins = insights(R);
  const mostra = S.todosInsights ? ins : ins.slice(0, 5);
  h += `<div class="grid g2 sec">
  <section class="card"><h3>Onde atacar <small>${ins.length} pontos</small></h3>
    <div class="ins">${mostra.map(i => `<div class="in" data-n="${i.n}"><div><b>${esc(i.tit)}</b><p>${esc(i.txt)}</p>${i.acao === 'reserva' ? `<button class="btn sm" style="margin-top:8px" data-act="criarReserva" data-v="${i.alvo}">Criar meta de ${brl0(i.alvo)}</button>` : ''}${i.cat ? `<button class="btn sm" style="margin-top:8px" data-act="verCat" data-cat="${esc(i.cat)}">Ver lançamentos</button>` : ''}</div><div class="g">${i.g > 0 ? `até<strong>${brl0(i.g)}</strong>/mês` : ''}</div></div>`).join('') || '<p class="mut">Lance alguns gastos para eu apontar onde economizar.</p>'}</div>
    ${ins.length > 5 ? `<button class="btn sm" style="margin-top:10px" data-act="todosIns">${S.todosInsights ? 'Mostrar menos' : `Ver todos (${ins.length})`}</button>` : ''}
  </section>
  <section class="card"><h3>Gastos por categoria</h3><div class="legend"><span><i style="background:var(--accent)"></i>mês</span><span><i style="background:var(--ink);width:2px"></i>orçamento</span><span><i style="border:2px solid var(--ink-3);border-radius:50%;background:transparent"></i>média 3 meses</span></div>${blocoCategorias(R)}</section>
  </div>
  <div class="grid g2 sec">
    <section class="card"><h3>Receitas x despesas <small>6 meses</small></h3>${graficoTendencia(R)}</section>
    <section class="card"><h3>Parcelas já comprometidas <small>próximas faturas</small></h3>${blocoParcelas(R)}</section>
  </div>
`;
  return h;
}

function cardRitmo(R) {
  const p = projecao(R), t = M(R).t;
  const ok = p.porDia >= 0;
  return `<section class="card">
    <span class="lbl">Pode gastar até o fechamento</span>
    <div class="big num ${ok ? '' : 'neg'}">${ok ? brl(p.porDia) : brl(p.porDia * p.restantes)}<span style="font-size:15px;font-weight:500" class="mut">${ok ? ' por dia' : ''}</span></div>
    <div class="sub">${ok ? `${brl0(p.disponivel)} livres em ${p.restantes} dias, mantendo ${pct(S.cfg.metaTaxa)} de poupança` : 'Acima do limite para manter a meta de poupança'}</div>
    <div class="meter" data-tip="Dia ${p.decorridos} de ${p.total} do ciclo"><span style="width:${Math.min(100, p.fr * 100)}%"></span></div>
    <div class="row" style="justify-content:space-between;font-size:11.5px;margin-top:6px"><span class="mut">${L.fmtDia(p.jan.ini)}</span><span class="mut">fecha ${L.fmtDia(p.jan.fecha)}</span></div>
    <div class="kv">
      <div><div class="lbl">Comprometido</div><div class="num">${brl0(p.comprometido)}</div><div class="sub">fixos e parcelas</div></div>
      <div><div class="lbl">Variável até hoje</div><div class="num">${brl0(p.varGasto)}</div><div class="sub">projeção ${brl0(p.varProj)}</div></div>
      <div><div class="lbl">Sobra projetada</div><div class="num ${p.sobraProj < 0 ? 'neg' : ''}">${brl0(p.sobraProj)}</div><div class="sub">${pct(p.taxaProj)} da renda</div></div>
    </div>
  </section>`;
}
function cardResumoFatura(R, jan) {
  const m = M(R), cc = m.entradas.filter(e => e.pg === 'cc' && e.t === 'd');
  const top = [...cc].filter(e => e.tipo !== 'fixo').sort((a, b) => b.v - a.v).slice(0, 5);
  return `<section class="card"><span class="lbl">Fatura ${L.fmtYMlong(R)} · vence ${L.fmtDia(jan.vence)}</span>
    <div class="big num">${brl(m.t.fatura)}</div>
    <div class="sub">${cc.length} lançamentos · ${brl0(sum(cc.filter(e => e.tipo === 'fixo'), e => e.v))} fixos · ${brl0(sum(cc.filter(e => e.tipo === 'parcela'), e => e.v))} parcelas</div>
    <div class="lbl" style="margin-top:14px">Maiores gastos</div>
    <div style="display:grid;gap:6px;margin-top:6px">${top.map(e => `<div class="row" style="flex-wrap:nowrap"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${esc(e.desc)} ${e.parc ? `<span class="pill">${e.parc}</span>` : ''}</span><span class="sp"></span><span class="num">${brl(e.v)}</span></div>`).join('') || '<span class="mut">Nada no cartão neste mês.</span>'}</div>
  </section>`;
}

function blocoCategorias(R) {
  const m = M(R), ant = mesesAnteriores(R);
  const rows = S.cfg.cats.filter(c => c.t === 'd').map(c => {
    const v = m.t.porCat[c.id] || 0, avg = ant.length ? sum(ant, x => x.t.porCat[c.id] || 0) / ant.length : null;
    return { c, v, avg, orc: c.orc || 0 };
  }).filter(r => r.v > 0 || r.orc > 0).sort((a, b) => b.v - a.v);
  if (!rows.length) return '<p class="mut">Sem despesas neste mês.</p>';
  const max = Math.max(...rows.map(r => Math.max(r.v, r.orc, r.avg || 0)), 1);
  return `<div class="cats">${rows.map(r => `<div class="cat" data-tip="${esc(r.c.nome)}\nMês: ${brl(r.v)}${r.orc ? `\nOrçamento: ${brl(r.orc)}` : ''}${r.avg != null ? `\nMédia 3m: ${brl(r.avg)}` : ''}">
    <span class="nm">${esc(r.c.nome)}</span>
    <div class="track"><span class="b ${r.orc && r.v > r.orc ? 'over' : ''}" style="width:${r.v / max * 100}%"></span>${r.orc ? `<span class="o" style="left:${r.orc / max * 100}%"></span>` : ''}${r.avg ? `<span class="a" style="left:${r.avg / max * 100}%"></span>` : ''}</div>
    <span class="vl num">${brl0(r.v)}${r.orc ? `<small>de ${brl0(r.orc)}</small>` : r.avg != null ? `<small>média ${brl0(r.avg)}</small>` : ''}</span></div>`).join('')}</div>`;
}

function graficoTendencia(R) {
  const ms = Array.from({ length: 6 }, (_, k) => L.addMonths(R, k - 5));
  const d = ms.map(s => ({ s, ...M(s).t }));
  const W = 520, H = 210, pl = 44, pr = 8, pt = 12, pb = 44;
  const max = Math.max(...d.map(x => Math.max(x.rec, x.desp)), 100);
  const step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : max / Math.pow(10, Math.floor(Math.log10(max))) > 2 ? 1 : 0.5);
  const top = Math.ceil(max / step) * step;
  const y = v => pt + (H - pt - pb) * (1 - v / top);
  const bw = (W - pl - pr) / 6, b = Math.min(20, bw / 3);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Receitas e despesas dos últimos 6 meses">`;
  for (let v = 0; v <= top + 1e-6; v += step) svg += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--ink-3)">${kfmt(v)}</text>`;
  const bar = (x, v, fill, tip) => { const h = Math.max(0, y(0) - y(v)); const r = Math.min(4, h); return `<path d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${b - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="${fill}" data-tip="${tip}"/>`; };
  d.forEach((x, i) => {
    const cx = pl + bw * i + bw / 2;
    const tip = `${L.fmtYMlong(x.s)}\nReceitas ${brl(x.rec)}\nDespesas ${brl(x.desp)}\nSobra ${brl(x.sobra)}`;
    svg += `<rect x="${pl + bw * i}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent" data-tip="${esc(tip)}"/>`;
    svg += bar(cx - b - 1, x.rec, 'var(--bar-2)', esc(tip)) + bar(cx + 1, x.desp, 'var(--accent)', esc(tip));
    svg += `<text x="${cx}" y="${H - pb + 16}" text-anchor="middle" font-size="11" fill="${x.s === R ? 'var(--ink)' : 'var(--ink-2)'}" font-weight="${x.s === R ? 700 : 500}">${L.fmtYM(x.s)}</text>`;
    if (x.rec || x.desp) svg += `<text x="${cx}" y="${H - pb + 32}" text-anchor="middle" font-size="10.5" fill="${x.sobra < 0 ? 'var(--bad)' : 'var(--good)'}">${x.sobra >= 0 ? '+' : '−'}${kfmt(Math.abs(x.sobra))}</text>`;
  });
  svg += `</svg>`;
  return `<div class="legend" style="margin-top:6px"><span><i style="background:var(--bar-2)"></i>Receitas</span><span><i style="background:var(--accent)"></i>Despesas</span><span class="mut">linha de baixo: sobra</span></div>${svg}`;
}

function blocoParcelas(R) {
  const ms = [1, 2, 3, 4, 5, 6].map(k => L.addMonths(R, k));
  const v = ms.map(s => ({ s, v: sum((S.idx[s] || []).filter(e => e.tipo === 'parcela' && e.t === 'd'), e => e.v), n: (S.idx[s] || []).filter(e => e.tipo === 'parcela').length }));
  const max = Math.max(...v.map(x => x.v), 1);
  if (!v.some(x => x.v)) return '<p class="mut" style="margin-top:10px">Nenhuma parcela futura. Cada compra parcelada que você lançar aparece aqui, fatura por fatura.</p>';
  const fim = S.items.filter(i => i.n > 1).map(i => L.parcelasDe(i, F()).slice(-1)[0].ref).sort().slice(-1)[0];
  return `<div class="cols">${v.map(x => `<div class="col" data-tip="${L.fmtYMlong(x.s)}\n${x.n} parcelas · ${brl(x.v)}"><span class="v">${x.v ? kfmt(x.v) : ''}</span><span class="bar" style="height:${x.v / max * 90}px"></span><span>${L.fmtYM(x.s)}</span></div>`).join('')}</div>
  <p class="sub" style="margin-top:10px">Última parcela termina em ${fim ? L.fmtYMlong(fim) : '—'}.</p>`;
}

/* ---------- Lançamentos ---------- */
function vExtrato(R) {
  const m = M(R);
  const f = S.filtro, q = L.norm(S.busca);
  let es = m.entradas.filter(e => f === 'todos' || (f === 'cc' && e.pg === 'cc' && e.t === 'd') || (f === 'conta' && e.pg === 'conta' && e.t === 'd') || (f === 'r' && e.t === 'r') || (f === 'fixo' && e.tipo === 'fixo') || (f === 'parcela' && e.tipo === 'parcela') || (f.startsWith('cat:') && e.cat === f.slice(4)));
  if (q) es = es.filter(e => L.norm(e.desc + ' ' + catById(e.cat).nome).includes(q));
  const tot = sum(es, e => e.t === 'r' ? e.v : -e.v);
  const chips = [['todos', 'Todos'], ['cc', 'Cartão'], ['conta', 'Em conta'], ['r', 'Receitas'], ['fixo', 'Fixos'], ['parcela', 'Parcelas']];
  if (f.startsWith('cat:')) chips.push([f, catById(f.slice(4)).nome]);
  const forma = e => e.t === 'r' ? 'Receita' : e.pg === 'cc' ? 'Cartão' : 'Conta';
  const tag = e => e.tipo === 'fixo' ? `<span class="pill acc">fixo${e.ajustado ? ' · ajustado' : ''}</span>` : e.tipo === 'parcela' ? `<span class="pill">${e.parc}</span>` : '';
  const val = e => `<span class="num ${e.t === 'r' ? 'pos' : ''}">${e.t === 'r' ? '+' : ''}${brl(e.t === 'r' ? e.v : -e.v)}</span>`;
  const key = e => `data-act="abrir" data-src="${e.src}" data-id="${esc(e.id)}"`;
  return `<div class="row" style="margin-bottom:12px"><div class="chips">${chips.map(([k, n]) => `<button data-act="filtro" data-f="${esc(k)}" aria-pressed="${f === k}">${esc(n)}</button>`).join('')}</div><span class="sp"></span>
    <input class="i" id="busca" placeholder="Buscar" value="${esc(S.busca)}" style="max-width:200px;font-size:13.5px;padding:7px 10px">
    <button class="btn sm" data-act="importar">Importar fatura CSV</button><button class="btn sm" data-act="exportCSV">Exportar CSV</button></div>
  <div class="row" style="margin-bottom:10px;font-size:13px"><span class="ink2">${es.length} lançamentos em ${L.fmtYMlong(R)}</span><span class="sp"></span><span>Saldo do filtro <b class="num ${tot < 0 ? 'neg' : 'pos'}">${brl(tot)}</b></span></div>
  ${es.length ? `<div class="tw tx-table"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th class="r">Valor</th></tr></thead><tbody>
    ${es.map(e => `<tr class="click" ${key(e)}><td class="num">${e.d ? L.fmtDia(e.d) : ''}</td><td class="desc">${esc(e.desc)} ${tag(e)}</td><td>${esc(catById(e.cat).nome)}</td><td class="ink2">${forma(e)}</td><td class="r">${val(e)}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="list">${es.map(e => `<div class="li" ${key(e)}><span class="t">${esc(e.desc)}</span><span class="v">${val(e)}</span><span class="m">${e.d ? L.fmtDia(e.d) : ''} · ${esc(catById(e.cat).nome)} · ${forma(e)} ${tag(e)}</span></div>`).join('')}</div>`
    : `<div class="card empty"><h2>Nada por aqui</h2><p>Use o botão + para lançar, ou importe o CSV da fatura.</p></div>`}`;
}

/* ---------- Fluxo de caixa ---------- */
function linhasFluxo(R) {
  const atual = cicloAtual();
  const cols = Array.from({ length: 12 }, (_, k) => L.addMonths(R, k - 5));
  const fechados = [1, 2, 3].map(k => M(L.addMonths(atual, -k))).filter(temDados);
  const varMed = fechados.length ? sum(fechados, x => x.t.despVar) / fechados.length : 0;
  const recVarMed = fechados.length ? sum(fechados, x => x.t.recVar) / fechados.length : 0;
  let acum = 0;
  const data = cols.map(s => {
    const t = M(s).t, fut = s > atual;
    const despVar = fut ? Math.max(t.despVar, varMed) : t.despVar;
    const recVar = fut ? Math.max(t.recVar, 0) : t.recVar;
    const rec = t.recFixa + recVar, desp = t.despFixa + t.despParc + despVar, sobra = rec - desp;
    acum += sobra;
    return { s, fut, t, recVar, despVar, rec, desp, sobra, acum, taxa: rec ? (rec - (desp - t.poupanca)) / rec : null };
  });
  return { cols, data, varMed, recVarMed };
}
function vFluxo(R) {
  const { data, varMed } = linhasFluxo(R), atual = cicloAtual();
  const cell = (v, cls = '') => `<td class="r num ${cls}">${v === 0 ? '<span class="mut">–</span>' : brl0(v)}</td>`;
  const row = (nome, f, cls = '', fn = cell) => `<tr class="${cls}"><td>${nome}</td>${data.map(x => fn(f(x), x.fut && /proj/.test(cls) ? 'proj' : '')).join('')}</tr>`;
  const catsD = S.cfg.cats.filter(c => c.t === 'd' && data.some(x => x.t.porCat[c.id]));
  const h = `<div class="row" style="margin-bottom:12px"><div><h2 style="font-size:18px">Fluxo de caixa</h2><p class="sub" style="margin:2px 0 0">5 meses para trás, 6 para frente. Meses futuros contam fixos, parcelas já lançadas e variáveis pela média dos últimos 3 meses fechados (${brl0(varMed)}).</p></div><span class="sp"></span><button class="btn sm" data-act="exportFluxo">Exportar CSV</button></div>
  <div class="tw"><table class="flux"><thead><tr><th>Ref. (fatura)</th>${data.map(x => `<th class="r ${x.s === atual ? 'cur' : x.fut ? 'fut' : ''}" style="cursor:pointer" data-act="irMes" data-s="${x.s}">${L.fmtYM(x.s)}${x.fut ? '*' : ''}</th>`).join('')}</tr></thead><tbody>
    <tr class="grp"><td>Entradas</td>${data.map(() => '<td></td>').join('')}</tr>
    ${row('Receitas fixas', x => x.t.recFixa)}
    ${row('Receitas variáveis', x => x.recVar)}
    ${row('Total de receitas', x => x.rec, 'tot')}
    <tr class="grp"><td>Saídas</td>${data.map(() => '<td></td>').join('')}</tr>
    ${row('Despesas fixas', x => x.t.despFixa)}
    ${row('Parcelas', x => x.t.despParc)}
    ${row('Variáveis', x => x.despVar, 'proj')}
    ${row('Total de despesas', x => x.desp, 'tot')}
    ${row('· no cartão (fatura)', x => x.fut ? x.t.fatura + (x.despVar - x.t.despVar) : x.t.fatura, 'proj')}
    ${row('· em conta', x => x.t.conta)}
    <tr class="grp"><td>Resultado</td>${data.map(() => '<td></td>').join('')}</tr>
    ${row('Sobra do mês', x => x.sobra, 'tot', (v, c) => `<td class="r num ${v < 0 ? 'neg' : 'pos'} ${c}">${brl0(v)}</td>`)}
    ${row('Sobra acumulada', x => x.acum, '', (v) => `<td class="r num ${v < 0 ? 'neg' : ''}">${brl0(v)}</td>`)}
    ${row('Taxa de poupança', x => x.taxa, '', v => `<td class="r num">${pct(v)}</td>`)}
    <tr class="grp"><td>Por categoria</td>${data.map(() => '<td></td>').join('')}</tr>
    ${catsD.map(c => row(esc(c.nome), x => x.t.porCat[c.id] || 0)).join('')}
  </tbody></table></div>
  <p class="sub">* previsão. Clique no mês para abrir o painel dele. Variáveis futuras em itálico.</p>`;
  return h;
}

/* ---------- Fixos ---------- */
function vFixos(R) {
  const fx = S.cfg.fixos, ativos = fx.filter(f => (!f.ini || f.ini <= R) && (!f.fim || f.fim >= R));
  const rec = sum(ativos.filter(f => f.t === 'r'), f => f.v), desp = sum(ativos.filter(f => f.t === 'd'), f => f.v);
  const bloco = (t, tit) => {
    const l = fx.filter(f => f.t === t).sort((a, b) => b.v - a.v);
    return `<section class="card"><h3>${tit} <small>${brl(sum(l.filter(f => ativos.includes(f)), f => f.v))}/mês</small></h3>
    ${l.length ? `<div class="tw" style="margin-top:10px;border:0"><table><thead><tr><th>Descrição</th><th>Dia</th><th>Forma</th><th class="r">Valor</th></tr></thead><tbody>
    ${l.map(f => `<tr class="click" data-act="editFixo" data-id="${esc(f.id)}" style="${ativos.includes(f) ? '' : 'opacity:.5'}"><td>${esc(f.desc)}<span class="d2">${esc(catById(f.cat).nome)}${f.fim ? ` · até ${L.fmtYM(f.fim)}` : ''}${f.ini && f.ini > R ? ` · a partir de ${L.fmtYM(f.ini)}` : ''}</span></td><td class="ink2">${f.dia === 'util' ? 'último útil' : 'dia ' + f.dia}</td><td class="ink2">${f.t === 'r' ? '—' : f.pg === 'cc' ? 'Cartão' : 'Conta'}</td><td class="r num">${brl(f.v)}</td></tr>`).join('')}
    </tbody></table></div>` : `<p class="mut">Nenhum cadastrado.</p>`}
    <button class="btn sm" style="margin-top:10px" data-act="novoFixo" data-t="${t}">Adicionar ${t === 'r' ? 'receita' : 'despesa'} fixa</button></section>`;
  };
  return `<div class="grid g4" style="margin-bottom:14px">
    <div class="card tile"><span class="lbl">Receitas fixas</span><span class="mid num">${brl(rec)}</span></div>
    <div class="card tile"><span class="lbl">Despesas fixas</span><span class="mid num">${brl(desp)}</span></div>
    <div class="card tile"><span class="lbl">Fixos / renda</span><span class="mid num ${rec && desp / rec > 0.5 ? 'neg' : ''}">${pct(rec ? desp / rec : null)}</span><span class="sub">referência: até 50%</span></div>
    <div class="card tile"><span class="lbl">Livre após fixos</span><span class="mid num">${brl(rec - desp)}</span><span class="sub">antes de parcelas e variáveis</span></div>
  </div>
  <div class="grid g2">${bloco('d', 'Despesas fixas')}${bloco('r', 'Receitas fixas')}</div>
  <p class="sub">Valor que muda todo mês, como energia: ajuste em Lançamentos tocando no item do mês. O padrão continua igual.</p>`;
}

/* ---------- Metas ---------- */
function sobraMedia() { const a = mesesAnteriores(cicloAtual(), 3); return a.length ? sum(a, x => x.t.sobra + x.t.poupanca) / a.length : null; }
function vMetas() {
  const sm = sobraMedia(), hojeYM = L.todayISO().slice(0, 7);
  const cards = S.cfg.metas.map(g => {
    const falta = Math.max(0, g.alvo - g.atual), meses = g.prazo ? Math.max(1, L.diffMonths(hojeYM, g.prazo)) : null;
    const porMes = meses ? falta / meses : null, p = g.alvo ? Math.min(1, g.atual / g.alvo) : 0;
    const st = falta <= 0 ? ['good', 'concluída'] : porMes == null ? ['', 'sem prazo'] : sm == null ? ['', ''] : porMes <= sm * 0.5 ? ['good', 'no caminho'] : porMes <= sm ? ['warn', 'apertado'] : ['bad', 'acima da sua sobra'];
    return `<section class="card goal"><div class="row"><h2 style="font-size:16px">${esc(g.nome)}</h2><span class="sp"></span>${st[1] ? `<span class="pill ${st[0]}">${st[1]}</span>` : ''}</div>
      <div class="row" style="align-items:baseline"><span class="mid num">${brl0(g.atual)}</span><span class="mut">de ${brl0(g.alvo)}</span><span class="sp"></span><span class="num">${pct(p)}</span></div>
      <div class="gb"><span style="width:${p * 100}%"></span></div>
      <div class="sub">${falta > 0 ? `Faltam ${brl0(falta)}${porMes != null ? ` · ${brl0(porMes)}/mês por ${meses} meses até ${L.fmtYMlong(g.prazo)}` : ''}` : 'Meta atingida.'}</div>
      <div class="row"><button class="btn sm pri" data-act="aportar" data-id="${esc(g.id)}">Aportar</button><button class="btn sm" data-act="editMeta" data-id="${esc(g.id)}">Editar</button></div></section>`;
  }).join('');
  return `<div class="row" style="margin-bottom:12px"><div><h2 style="font-size:18px">Metas</h2><p class="sub" style="margin:2px 0 0">${sm != null ? `Sua sobra média, somando aportes, é ${brl0(sm)}/mês nos últimos meses fechados.` : 'Feche um mês com lançamentos para eu calcular quanto cabe por mês.'}</p></div><span class="sp"></span><button class="btn pri sm" data-act="novaMeta">Nova meta</button></div>
  ${cards ? `<div class="grid g2">${cards}</div>` : `<div class="card empty"><h2>Nenhuma meta ainda</h2><p>A primeira recomendada é a reserva de emergência: 6 meses do custo essencial.</p><button class="btn pri" data-act="criarReserva" data-v="0">Criar reserva de emergência</button></div>`}
  ${S.cfg.metas.length && sm != null ? `<p class="sub">Soma dos aportes mensais necessários: <b class="num">${brl0(sum(S.cfg.metas, g => g.prazo && g.alvo > g.atual ? (g.alvo - g.atual) / Math.max(1, L.diffMonths(hojeYM, g.prazo)) : 0))}</b> contra ${brl0(sm)} de sobra média.</p>` : ''}`;
}

/* ---------- Ajustes ---------- */
function vAjustes() {
  const c = S.cfg;
  return `<div class="grid g2">
  <section class="card"><h3>Cartão de crédito</h3>
    <form id="fCartao" class="fgrid" style="margin-top:12px">
      <label class="f full">Nome<input class="i" id="cc-nome" value="${esc(c.cartao.nome)}"></label>
      <label class="f">Dia de fechamento<input class="i num" id="cc-fecha" type="number" min="1" max="31" value="${c.cartao.fecha}"></label>
      <label class="f">Dia de vencimento<input class="i num" id="cc-vence" type="number" min="1" max="31" value="${c.cartao.vence}"></label>
      <p class="hint full" style="margin:0">Compras feitas a partir do dia ${c.cartao.fecha} entram na fatura do mês seguinte. Confira no app do banco se o seu cartão segue essa regra.</p>
      <label class="f">Meta de poupança (% da renda)<input class="i num" id="cc-meta" type="number" min="0" max="90" value="${Math.round(c.metaTaxa * 100)}"></label>
      <div class="full"><button class="btn pri" type="submit">Salvar</button></div>
    </form>
  </section>
  <section class="card"><h3>Backup e dados</h3>
    <p class="ink2">${S.user ? `Conectado como <b>${esc(S.user.email)}</b>. Seus dados sincronizam entre celular e computador e só a sua conta lê.` : 'Salvando só neste navegador.'}</p>
    ${S.user ? '<div class="row" style="margin-bottom:10px"><button class="btn sm" data-act="logout">Sair da conta</button></div>' : ''}
    <div class="row"><button class="btn" data-act="exportJSON">Baixar backup (.json)</button><button class="btn" data-act="exportCSV">Lançamentos (.csv)</button></div>
    <div class="row" style="margin-top:10px"><label class="btn" for="impJSON">Restaurar backup</label><input type="file" id="impJSON" accept=".json,application/json" hidden></div>
    <div class="divider"></div>
    <button class="btn" data-act="demo">Ver com dados de exemplo</button>
  </section>
  </div>
  <section class="card sec"><h3>Categorias e orçamento mensal <small>orçamento 0 = sem limite</small></h3>
    <div class="row" style="margin-top:10px"><button class="btn sm" data-act="sugerirOrc">Sugerir orçamentos pela média</button><span class="sub">Essenciais pela média dos 3 últimos meses; estilo de vida com 10% de corte.</span></div>
    <div class="tw" style="margin-top:12px"><table><thead><tr><th>Categoria</th><th>Grupo</th><th class="r">Orçamento/mês</th></tr></thead><tbody>
    ${c.cats.filter(x => x.t === 'd').map(x => `<tr><td><input class="i" style="font-size:13.5px;padding:6px 8px" id="cn-${esc(x.id)}" data-cat="${esc(x.id)}" data-k="nome" value="${esc(x.nome)}"></td><td><select class="i" style="font-size:13.5px;padding:6px 8px" id="cg-${esc(x.id)}" data-cat="${esc(x.id)}" data-k="grupo">${Object.entries(GRUPOS).map(([k, n]) => `<option value="${k}" ${x.grupo === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td><td class="r"><input class="i num" style="font-size:13.5px;padding:6px 8px;max-width:130px;text-align:right" id="co-${esc(x.id)}" data-cat="${esc(x.id)}" data-k="orc" inputmode="decimal" value="${x.orc ? String(x.orc).replace('.', ',') : ''}" placeholder="0"></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row" style="margin-top:10px"><input class="i" id="novaCat" placeholder="Nova categoria de despesa" style="max-width:260px"><button class="btn sm" data-act="addCat">Adicionar</button><span class="sp"></span><button class="btn pri sm" data-act="salvarCats">Salvar categorias</button></div>
  </section>`;
}

/* ===================== modais ===================== */
function abrirModal(html, onMount) { $('#md').innerHTML = html; $('#ov').hidden = false; onMount && onMount(); const f = $('#md').querySelector('[autofocus]'); f && setTimeout(() => f.focus(), 30); }
function fecharModal() { $('#ov').hidden = true; $('#md').innerHTML = ''; }
const xBtn = '<button class="ibtn" data-act="fechar" aria-label="Fechar">✕</button>';
const optCats = (t, sel) => S.cfg.cats.filter(c => c.t === t).map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
const valNum = s => { const v = L.parseValor(s); return isFinite(v) ? Math.round(v * 100) / 100 : NaN; };

function modalLanc(it) {
  const ed = !!it;
  const x = it ? { ...it } : { t: 'd', pg: 'cc', d: hoje(), n: 1, cat: '', desc: '', v: '' };
  let catManual = ed;
  abrirModal(`<h2>${ed ? 'Editar lançamento' : 'Novo lançamento'}${xBtn}</h2>
  <form id="fL" class="fgrid">
    <div class="full row"><div class="seg" id="lt"><button type="button" data-v="d" aria-pressed="${x.t === 'd'}">Despesa</button><button type="button" data-v="r" aria-pressed="${x.t === 'r'}">Receita</button></div>
    <div class="seg" id="lp" ${x.t === 'r' ? 'hidden' : ''}><button type="button" data-v="cc" aria-pressed="${x.pg === 'cc'}">Cartão</button><button type="button" data-v="conta" aria-pressed="${x.pg === 'conta'}">Pix / débito</button></div></div>
    <label class="f">Valor total (R$)<input class="i num" id="l-v" inputmode="decimal" autofocus required value="${x.v !== '' ? String(x.v).replace('.', ',') : ''}" placeholder="0,00" style="font-size:20px"></label>
    <label class="f">Data da compra<input class="i" id="l-d" type="date" required value="${x.d}"></label>
    <label class="f full">Descrição<input class="i" id="l-desc" required value="${esc(x.desc)}" placeholder="Ex.: Mercado, iFood, Uber"></label>
    <label class="f">Categoria<select class="i" id="l-cat">${optCats(x.t, x.cat)}</select></label>
    <label class="f" id="l-nw" ${x.t === 'r' || x.pg !== 'cc' ? 'hidden' : ''}>Parcelas<input class="i num" id="l-n" type="number" min="1" max="48" value="${x.n || 1}"></label>
    <div class="hint full" id="l-hint"></div>
  </form>
  <div class="mfoot">${ed ? `<button class="btn dng" data-act="delLanc" data-id="${esc(x.id)}">Excluir</button>` : ''}<span class="sp"></span>${ed ? '' : '<button class="btn" data-act="salvarLanc" data-mais="1">Salvar e lançar outro</button>'}<button class="btn pri" data-act="salvarLanc">Salvar</button></div>`, () => {
    const st = { t: x.t, pg: x.pg };
    const hint = () => {
      const d = $('#l-d').value, v = valNum($('#l-v').value), n = +$('#l-n').value || 1;
      if (!d) return;
      let h;
      if (st.t === 'r') h = `Receita de ${L.fmtYMlong(d.slice(0, 7))}.`;
      else if (st.pg === 'conta') h = `Sai da conta em ${L.fmtYMlong(d.slice(0, 7))}.`;
      else { const c = x.fat && ed ? x.fat : L.cicloDe(d, F()), j = L.janelaCiclo(c, F(), V()); h = `Entra na fatura de <b>${L.fmtYMlong(c)}</b>, que vence ${L.fmtDia(j.vence)}.${n > 1 && isFinite(v) ? ` ${n}× de ${brl(v / n)} até ${L.fmtYMlong(L.addMonths(c, n - 1))}.` : ''}`; }
      $('#l-hint').innerHTML = h;
    };
    const seg = (id, k, after) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st[k] = b.dataset.v; $(id).querySelectorAll('button').forEach(z => z.setAttribute('aria-pressed', z === b)); after && after(); hint(); });
    seg('#lt', 't', () => { $('#lp').hidden = st.t === 'r'; $('#l-nw').hidden = st.t === 'r' || st.pg !== 'cc'; $('#l-cat').innerHTML = optCats(st.t, st.t === 'r' ? 'salario' : L.categorizar($('#l-desc').value, S.cfg.aprend)); });
    seg('#lp', 'pg', () => { $('#l-nw').hidden = st.pg !== 'cc'; });
    $('#l-desc').addEventListener('input', () => { if (!catManual && st.t === 'd') $('#l-cat').value = L.categorizar($('#l-desc').value, S.cfg.aprend); });
    $('#l-cat').addEventListener('change', () => { catManual = true; });
    ['#l-d', '#l-v', '#l-n'].forEach(s => $(s).addEventListener('input', hint));
    if (!ed) $('#l-cat').value = 'outros';
    hint();
    $('#fL').addEventListener('submit', e => { e.preventDefault(); $('#md [data-act="salvarLanc"]:not([data-mais])').click(); });
    modalLanc.st = st; modalLanc.orig = it; modalLanc.catManual = () => catManual;
  });
}
async function salvarLanc(mais) {
  const st = modalLanc.st, orig = modalLanc.orig;
  const v = valNum($('#l-v').value), d = $('#l-d').value, desc = $('#l-desc').value.trim(), cat = $('#l-cat').value;
  if (!isFinite(v) || v === 0) return toast('Informe um valor.');
  if (!d || !desc) return toast('Preencha data e descrição.');
  const it = novoItem({ ...(orig || {}), id: orig?.id, d, desc, v, t: st.t, pg: st.pg, cat, n: st.t === 'd' && st.pg === 'cc' ? +$('#l-n').value || 1 : 1, p0: orig?.p0, fat: orig && orig.d === d ? orig.fat : null });
  if (modalLanc.catManual() && st.t === 'd') aprender(desc, cat);
  const ok = await act(salvarItens([it]), orig ? 'Lançamento atualizado' : 'Lançado');
  if (!ok) return;
  if (mais) { $('#l-v').value = ''; $('#l-desc').value = ''; $('#l-n').value = 1; $('#l-v').focus(); } else fecharModal();
}
function aprender(desc, cat) {
  const k = L.norm(desc); if (!k || S.cfg.aprend[k] === cat) return;
  S.cfg.aprend[k] = cat;
  const ks = Object.keys(S.cfg.aprend); if (ks.length > 400) delete S.cfg.aprend[ks[0]];
  act(salvarCfg());
}

function modalFixoMes(f, R) {
  const o = (S.ovr[R] || {})[f.id];
  const atual = o && o.v != null ? o.v : f.v;
  abrirModal(`<h2>${esc(f.desc)} · ${L.fmtYMlong(R)}${xBtn}</h2>
    <p class="ink2" style="margin-top:0">${f.t === 'r' ? 'Receita' : 'Despesa'} fixa de ${brl(f.v)} por mês${f.t === 'd' ? (f.pg === 'cc' ? ', no cartão' : ', em conta') : ''}.</p>
    <label class="f">Valor só neste mês<input class="i num" id="fm-v" inputmode="decimal" value="${String(atual).replace('.', ',')}" autofocus></label>
    <div class="mfoot"><button class="btn" data-act="fmPular">Pular este mês</button>${o ? '<button class="btn" data-act="fmPadrao">Voltar ao padrão</button>' : ''}<button class="btn" data-act="editFixo" data-id="${esc(f.id)}">Editar o fixo</button><span class="sp"></span><button class="btn pri" data-act="fmSalvar">Salvar</button></div>`);
  modalFixoMes.ctx = { f, R };
}

function modalFixo(f, t) {
  const ed = !!f; const x = f ? { ...f } : { t: t || 'd', desc: '', v: '', cat: t === 'r' ? 'salario' : 'casa', pg: 'conta', dia: t === 'r' ? 'util' : 10, ini: S.ref, fim: '' };
  abrirModal(`<h2>${ed ? 'Editar fixo' : x.t === 'r' ? 'Nova receita fixa' : 'Nova despesa fixa'}${xBtn}</h2>
  <form id="fF" class="fgrid">
    <label class="f full">Descrição<input class="i" id="f-desc" required value="${esc(x.desc)}" autofocus></label>
    <label class="f">Valor mensal (R$)<input class="i num" id="f-v" inputmode="decimal" required value="${x.v !== '' ? String(x.v).replace('.', ',') : ''}"></label>
    <label class="f">Categoria<select class="i" id="f-cat">${optCats(x.t, x.cat)}</select></label>
    ${x.t === 'd' ? `<label class="f">Forma<select class="i" id="f-pg"><option value="cc" ${x.pg === 'cc' ? 'selected' : ''}>Cartão</option><option value="conta" ${x.pg === 'conta' ? 'selected' : ''}>Conta / boleto / Pix</option></select></label>` : ''}
    <label class="f">Dia<select class="i" id="f-dia"><option value="util" ${x.dia === 'util' ? 'selected' : ''}>Último dia útil</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${+x.dia === i + 1 ? 'selected' : ''}>Dia ${i + 1}</option>`).join('')}</select></label>
    <label class="f">Começa em<input class="i" id="f-ini" type="month" value="${x.ini || ''}"></label>
    <label class="f">Termina em <small class="mut">(opcional)</small><input class="i" id="f-fim" type="month" value="${x.fim || ''}"></label>
  </form>
  <div class="mfoot">${ed ? `<button class="btn" data-act="encerrarFixo">Encerrar a partir de ${L.fmtYM(S.ref)}</button><button class="btn dng" data-act="delFixo">Excluir do histórico</button>` : ''}<span class="sp"></span><button class="btn pri" data-act="salvarFixo">Salvar</button></div>`);
  modalFixo.ctx = { f, t: x.t };
}

function modalMeta(g, alvo) {
  const x = g ? { ...g } : { nome: alvo != null ? 'Reserva de emergência' : '', alvo: alvo || '', atual: 0, prazo: L.addMonths(L.todayISO().slice(0, 7), 12) };
  abrirModal(`<h2>${g ? 'Editar meta' : 'Nova meta'}${xBtn}</h2>
  <form id="fM" class="fgrid">
    <label class="f full">Nome<input class="i" id="m-nome" required value="${esc(x.nome)}" placeholder="Ex.: Reserva, viagem, troca do carro" autofocus></label>
    <label class="f">Valor alvo (R$)<input class="i num" id="m-alvo" inputmode="decimal" value="${x.alvo !== '' ? String(x.alvo).replace('.', ',') : ''}"></label>
    <label class="f">Já guardado (R$)<input class="i num" id="m-atual" inputmode="decimal" value="${String(x.atual || 0).replace('.', ',')}"></label>
    <label class="f">Prazo<input class="i" id="m-prazo" type="month" value="${x.prazo || ''}"></label>
    ${alvo != null ? `<p class="hint full" style="margin:0">Alvo sugerido: 6 meses do seu custo essencial médio. Guarde em algo com liquidez diária.</p>` : ''}
  </form>
  <div class="mfoot">${g ? '<button class="btn dng" data-act="delMeta">Excluir meta</button>' : ''}<span class="sp"></span><button class="btn pri" data-act="salvarMeta">Salvar</button></div>`);
  modalMeta.ctx = { g };
}
function modalAporte(g) {
  abrirModal(`<h2>Aportar em ${esc(g.nome)}${xBtn}</h2>
  <form id="fA" class="fgrid">
    <label class="f">Valor (R$)<input class="i num" id="a-v" inputmode="decimal" autofocus></label>
    <label class="f">Data<input class="i" id="a-d" type="date" value="${hoje()}"></label>
    <label class="full row" style="font-size:13px"><input type="checkbox" id="a-lanc" checked> Registrar também como saída em conta (categoria Investimentos e metas)</label>
  </form>
  <div class="mfoot"><span class="sp"></span><button class="btn pri" data-act="salvarAporte">Aportar</button></div>`);
  modalAporte.ctx = { g };
}

/* ---------- importação de fatura ---------- */
function modalImport() {
  const R = S.ref;
  abrirModal(`<h2>Importar fatura (CSV)${xBtn}</h2>
    <p class="ink2" style="margin-top:0">No app do banco, exporte a fatura em CSV (Nubank, Inter, C6, Itaú e outros oferecem). Colunas esperadas: data, descrição e valor.</p>
    <div class="fgrid"><label class="f">Fatura de destino<select class="i" id="imp-fat">${[-2, -1, 0, 1].map(k => L.addMonths(R, k)).map(s => `<option value="${s}" ${s === R ? 'selected' : ''}>${L.fmtYMlong(s)}</option>`).join('')}</select></label>
    <label class="f">Arquivo<input class="i" type="file" id="imp-file" accept=".csv,text/csv"></label></div>
    <div id="imp-prev"></div>`);
}
function previewImport(txt) {
  const rows = L.lerFatura(txt);
  if (!rows.length) { $('#imp-prev').innerHTML = '<p class="neg">Não reconheci lançamentos nesse arquivo. Confira se ele tem colunas de data, descrição e valor.</p>'; return; }
  const exist = S.items.filter(i => i.t === 'd');
  const linhas = rows.map((r, i) => {
    const nd = L.norm(r.desc);
    let dup = '';
    if (r.n > 1 && r.k > 1 && exist.some(e => e.n === r.n && L.norm(e.desc) === nd && Math.abs(e.v / e.n - r.v) < 0.05)) dup = 'parcela já projetada';
    else if (exist.some(e => e.d === r.d && L.norm(e.desc) === nd && Math.abs(e.v / (e.n || 1) - r.v) < 0.05)) dup = 'já lançado';
    return { ...r, i, dup, cat: L.categorizar(r.desc, S.cfg.aprend) };
  });
  previewImport.rows = linhas;
  const tot = sum(linhas.filter(l => !l.dup), l => l.v);
  $('#imp-prev').innerHTML = `<div class="row" style="margin:12px 0 8px"><b>${linhas.length} linhas</b><span class="mut">${linhas.filter(l => l.dup).length} desmarcadas por duplicidade</span><span class="sp"></span><span class="num">${brl(tot)}</span></div>
  <div class="tw" style="max-height:46vh"><table><thead><tr><th></th><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead><tbody>
  ${linhas.map(l => `<tr><td><input type="checkbox" id="imp-c${l.i}" ${l.dup ? '' : 'checked'}></td><td class="num">${L.fmtDia(l.d)}</td><td class="desc">${esc(l.desc)} ${l.n > 1 ? `<span class="pill">${l.k}/${l.n}</span>` : ''} ${l.dup ? `<span class="pill warn">${l.dup}</span>` : ''}</td><td><select class="i" id="imp-s${l.i}" style="font-size:12.5px;padding:5px 6px">${optCats('d', l.cat)}</select></td><td class="r num ${l.v < 0 ? 'pos' : ''}">${brl(l.v)}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="sub">Parcela 1/N vira uma compra parcelada e projeta as próximas faturas. Valores negativos entram como estorno.</p>
  <div class="mfoot"><span class="sp"></span><button class="btn pri" data-act="confirmarImport">Importar selecionados</button></div>`;
}
async function confirmarImport() {
  const fat = $('#imp-fat').value, novos = [];
  for (const l of previewImport.rows) {
    if (!$('#imp-c' + l.i).checked) continue;
    const cat = $('#imp-s' + l.i).value;
    if (cat !== l.cat) aprender(l.desc, cat);
    novos.push(novoItem({ d: l.d, desc: l.desc, v: Math.round(l.v * l.n * 100) / 100, t: 'd', pg: 'cc', cat, n: l.n, p0: l.k, fat }));
  }
  if (!novos.length) return toast('Nada selecionado.');
  if (await act(salvarItens(novos), `${novos.length} lançamentos importados`)) fecharModal();
}

/* ===================== exportação ===================== */
function baixar(nome, dados) {
  const tipo = nome.endsWith('.json') ? 'application/json' : 'text/csv;charset=utf-8';
  const url = URL.createObjectURL(new Blob([dados], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const csvCell = v => typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v ?? '').replace(/"/g, '""')}"`;
function exportCSV() {
  const linhas = [['data', 'descricao', 'categoria', 'tipo', 'forma', 'valor_total', 'parcelas', 'fatura']];
  for (const i of [...S.items].sort((a, b) => a.d.localeCompare(b.d))) linhas.push([i.d, i.desc, catById(i.cat).nome, i.t === 'r' ? 'receita' : 'despesa', i.t === 'r' ? '' : i.pg === 'cc' ? 'cartao' : 'conta', i.v, i.n, i.t === 'd' && i.pg === 'cc' ? (i.fat || L.cicloDe(i.d, F())) : '']);
  baixar(`livro-caixa-lancamentos-${hoje()}.csv`, '\uFEFF' + linhas.map(l => l.map(csvCell).join(';')).join('\r\n'));
}
function exportFluxo() {
  const { data } = linhasFluxo(S.ref);
  const rows = [['linha', ...data.map(x => x.s + (x.fut ? '*' : ''))], ['receitas fixas', ...data.map(x => x.t.recFixa)], ['receitas variaveis', ...data.map(x => x.recVar)], ['despesas fixas', ...data.map(x => x.t.despFixa)], ['parcelas', ...data.map(x => x.t.despParc)], ['variaveis', ...data.map(x => x.despVar)], ['sobra', ...data.map(x => x.sobra)], ['sobra acumulada', ...data.map(x => x.acum)]];
  for (const c of S.cfg.cats.filter(c => c.t === 'd')) rows.push([c.nome, ...data.map(x => x.t.porCat[c.id] || 0)]);
  baixar(`livro-caixa-fluxo-${S.ref}.csv`, '\uFEFF' + rows.map(l => l.map(v => typeof v === 'number' ? csvCell(Math.round(v * 100) / 100) : csvCell(v)).join(';')).join('\r\n'));
}
function exportJSON() { baixar(`livro-caixa-backup-${hoje()}.json`, JSON.stringify(S.lastRaw || {}, null, 1)); }
async function importJSON(txt) {
  let o; try { o = JSON.parse(txt); } catch (e) { return toast('Arquivo inválido.'); }
  if (!o || typeof o !== 'object' || !o.meses) return toast('Esse arquivo não é um backup do Livro-Caixa.');
  if (o.cfg) { S.cfg = mergeCfg(o.cfg); await act(salvarCfg()); }
  for (const [s, doc] of Object.entries(o.meses)) if (/^\d{4}-\d{2}$/.test(s) && doc) await act(S.store.mergeMes(s, { items: doc.items || {}, ovr: doc.ovr || {} }));
  toast('Backup restaurado');
}

/* ===================== exemplo ===================== */
function gerarDemo() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cfg = mergeCfg({});
  cfg.fixos = [
    { id: 'f1', desc: 'Salário', v: 8500, t: 'r', cat: 'salario', pg: 'conta', dia: 'util', ini: '2026-01' },
    { id: 'f2', desc: 'Aluguel', v: 2200, t: 'd', cat: 'casa', pg: 'conta', dia: 5, ini: '2026-01' },
    { id: 'f3', desc: 'Condomínio', v: 480, t: 'd', cat: 'casa', pg: 'conta', dia: 10, ini: '2026-01' },
    { id: 'f4', desc: 'Energia', v: 210, t: 'd', cat: 'casa', pg: 'conta', dia: 15, ini: '2026-01' },
    { id: 'f5', desc: 'Internet', v: 119.9, t: 'd', cat: 'casa', pg: 'cc', dia: 8, ini: '2026-01' },
    { id: 'f6', desc: 'Celular', v: 59.9, t: 'd', cat: 'casa', pg: 'cc', dia: 12, ini: '2026-01' },
    { id: 'f7', desc: 'Academia', v: 109.9, t: 'd', cat: 'pessoal', pg: 'cc', dia: 3, ini: '2026-01' },
    { id: 'f8', desc: 'Streaming', v: 89.8, t: 'd', cat: 'assinaturas', pg: 'cc', dia: 20, ini: '2026-01' },
    { id: 'f9', desc: 'Plano de saúde', v: 420, t: 'd', cat: 'saude', pg: 'conta', dia: 10, ini: '2026-01' },
  ];
  cfg.cats.find(c => c.id === 'delivery').orc = 350; cfg.cats.find(c => c.id === 'mercado').orc = 1100; cfg.cats.find(c => c.id === 'alimentacao').orc = 400;
  const meses = {};
  const add = it => { const s = it.d.slice(0, 7); (meses[s] ||= { items: {}, ovr: {} }).items[it.id] = it; };
  const atual = cicloAtual();
  const fim = hoje();
  const gastos = [['Mercado Pão de Açúcar', 'mercado', 180, 4], ['Atacadão', 'mercado', 320, 2], ['iFood', 'delivery', 58, 7], ['Uber', 'transporte', 24, 8], ['Posto Shell', 'transporte', 190, 2], ['Restaurante', 'alimentacao', 95, 3], ['Café', 'alimentacao', 14, 6], ['Drogasil', 'saude', 70, 1], ['Amazon', 'compras', 140, 1], ['Cinema', 'lazer', 60, 1]];
  for (let k = 6; k >= 0; k--) {
    const s = L.addMonths(atual, -k), jan = L.janelaCiclo(s, F(), V());
    const span = L.dias(jan.ini, jan.fim);
    for (const [desc, cat, base, freq] of gastos) {
      const f = cat === 'delivery' ? freq + (6 - k) : freq;
      for (let j = 0; j < f; j++) {
        const dd = new Date(jan.ini + 'T12:00'); dd.setDate(dd.getDate() + Math.floor(rnd() * (span + 1)));
        const d = L.iso(dd.getFullYear(), dd.getMonth() + 1, dd.getDate());
        if (d > fim) continue;
        add(novoItem({ id: 'x' + k + desc.slice(0, 3) + j, d, desc, v: Math.round(base * (0.6 + rnd() * 0.8) * 100) / 100, t: 'd', pg: 'cc', cat }));
      }
    }
  }
  add(novoItem({ id: 'tv', d: L.addMonths(atual, -3) + '-12', desc: 'Smart TV 55"', v: 3290, t: 'd', pg: 'cc', cat: 'compras', n: 10 }));
  add(novoItem({ id: 'pass', d: L.addMonths(atual, -1) + '-06', desc: 'Passagem aérea', v: 1860, t: 'd', pg: 'cc', cat: 'viagem', n: 6 }));
  add(novoItem({ id: 'free', d: L.addMonths(atual, -2) + '-18', desc: 'Freela site', v: 1500, t: 'r', cat: 'extra' }));
  add(novoItem({ id: 'iof', d: L.addMonths(atual, -1) + '-02', desc: 'IOF compra internacional', v: 23.4, t: 'd', pg: 'cc', cat: 'taxas' }));
  return { cfg, meses };
}
function entrarDemo() {
  if (S.demo) return;
  S.demo = true; S.realStore = S.store;
  S.store = MemStore(null, gerarDemo());
  S.store.subscribe(applyRaw, () => { });
  irPara('painel');
}
function sairDemo() {
  S.demo = false; S.store = S.realStore;
  if (S.precisaLogin || !S.store) { S.loaded = false; S.items = []; S.cfg = cfgPadrao(); recompute(); render(); return; }
  applyRaw(S.realRaw || { cfg: null, meses: {} });
}
function vLogin() {
  return `<div class="card empty" style="max-width:480px;margin:24px auto">
    <h2>Livro-Caixa</h2>
    <p>Seu planejamento pelo ciclo da fatura: fixos, parcelas projetadas, fluxo de caixa e onde economizar. Entre para sincronizar celular e computador.</p>
    <div class="row" style="justify-content:center;margin-top:16px"><button class="btn pri" data-act="login">Entrar com Google</button><button class="btn" data-act="demo">Ver exemplo</button></div>
    <p class="sub" style="margin-top:14px">Seus dados ficam numa área que só a sua conta Google lê.</p></div>`;
}

/* ===================== eventos ===================== */
let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }
const confirmar = (btn, label, fn) => { if (btn.dataset.armed) { fn(); return; } btn.dataset.armed = 1; const old = btn.textContent; btn.textContent = label; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3500); };

document.addEventListener('click', async e => {
  if (e.target.id === 'ov') return fecharModal();
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, R = S.ref;
  const precisa = () => { if (!S.loaded) { toast('Aguarde os dados carregarem.'); return false; } return true; };
  switch (a) {
    case 'mes': S.ref = L.addMonths(R, +b.dataset.k); render(); break;
    case 'hoje': S.ref = cicloAtual(); render(); break;
    case 'irMes': S.ref = b.dataset.s; irPara('painel'); break;
    case 'fechar': fecharModal(); break;
    case 'novo': if (precisa()) modalLanc(); break;
    case 'filtro': S.filtro = b.dataset.f; render(); break;
    case 'verCat': S.filtro = 'cat:' + b.dataset.cat; irPara('extrato'); break;
    case 'todosIns': S.todosInsights = !S.todosInsights; render(); break;
    case 'abrir': {
      if (b.dataset.src === 'tx') { const it = S.items.find(i => i.id === b.dataset.id); it && modalLanc(it); }
      else { const f = S.cfg.fixos.find(x => x.id === b.dataset.id); f && modalFixoMes(f, R); }
      break;
    }
    case 'salvarLanc': salvarLanc(!!b.dataset.mais); break;
    case 'delLanc': confirmar(b, 'Confirmar exclusão', async () => { const it = S.items.find(i => i.id === b.dataset.id); if (it && await act(excluirItem(it), 'Lançamento excluído')) fecharModal(); }); break;
    case 'fmSalvar': { const { f, R: r } = modalFixoMes.ctx; const v = valNum($('#fm-v').value); if (!isFinite(v)) return toast('Valor inválido.'); if (await act(setOvr(r, f.id, v === f.v ? null : { v, skip: false }), 'Valor do mês ajustado')) fecharModal(); break; }
    case 'fmPular': { const { f, R: r } = modalFixoMes.ctx; if (await act(setOvr(r, f.id, { v: null, skip: true }), `${f.desc} pulado em ${L.fmtYM(r)}`)) fecharModal(); break; }
    case 'fmPadrao': { const { f, R: r } = modalFixoMes.ctx; if (await act(setOvr(r, f.id, null), 'Voltou ao valor padrão')) fecharModal(); break; }
    case 'novoFixo': modalFixo(null, b.dataset.t); break;
    case 'editFixo': { const f = S.cfg.fixos.find(x => x.id === b.dataset.id); f && modalFixo(f); break; }
    case 'salvarFixo': {
      const { f, t } = modalFixo.ctx, v = valNum($('#f-v').value), desc = $('#f-desc').value.trim();
      if (!desc || !isFinite(v)) return toast('Preencha descrição e valor.');
      const dia = $('#f-dia').value;
      const nf = { id: f?.id || uid(), desc, v, t, cat: $('#f-cat').value, pg: t === 'r' ? 'conta' : $('#f-pg').value, dia: dia === 'util' ? 'util' : +dia, ini: $('#f-ini').value || null, fim: $('#f-fim').value || null };
      S.cfg.fixos = f ? S.cfg.fixos.map(x => x.id === f.id ? nf : x) : [...S.cfg.fixos, nf];
      if (await act(salvarCfg(), 'Fixo salvo')) fecharModal();
      break;
    }
    case 'encerrarFixo': { const { f } = modalFixo.ctx; S.cfg.fixos = S.cfg.fixos.map(x => x.id === f.id ? { ...x, fim: L.addMonths(R, -1) } : x); if (await act(salvarCfg(), `${f.desc} encerrado em ${L.fmtYM(L.addMonths(R, -1))}`)) fecharModal(); break; }
    case 'delFixo': confirmar(b, 'Apaga de todos os meses. Confirmar?', async () => { const { f } = modalFixo.ctx; S.cfg.fixos = S.cfg.fixos.filter(x => x.id !== f.id); if (await act(salvarCfg(), 'Fixo excluído')) fecharModal(); }); break;
    case 'novaMeta': modalMeta(); break;
    case 'criarReserva': {
      let v = +b.dataset.v;
      if (!v) { const ant = mesesAnteriores(cicloAtual()); const ess = ant.length ? sum(ant, x => sum(x.entradas.filter(e => e.t === 'd' && !isPoup(e.cat) && (e.tipo === 'fixo' || catById(e.cat).grupo === 'essencial')), e => e.v)) / ant.length : M(cicloAtual()).t.despFixa; v = Math.ceil(ess * 6 / 500) * 500; }
      modalMeta(null, v); break;
    }
    case 'editMeta': modalMeta(S.cfg.metas.find(g => g.id === b.dataset.id)); break;
    case 'salvarMeta': {
      const { g } = modalMeta.ctx, nome = $('#m-nome').value.trim(), alvo = valNum($('#m-alvo').value), atual = valNum($('#m-atual').value || '0');
      if (!nome || !isFinite(alvo) || alvo <= 0) return toast('Preencha nome e valor alvo.');
      const ng = { id: g?.id || uid(), nome, alvo, atual: isFinite(atual) ? atual : 0, prazo: $('#m-prazo').value || null };
      S.cfg.metas = g ? S.cfg.metas.map(x => x.id === g.id ? ng : x) : [...S.cfg.metas, ng];
      if (await act(salvarCfg(), 'Meta salva')) fecharModal();
      break;
    }
    case 'delMeta': confirmar(b, 'Confirmar exclusão', async () => { const { g } = modalMeta.ctx; S.cfg.metas = S.cfg.metas.filter(x => x.id !== g.id); if (await act(salvarCfg(), 'Meta excluída')) fecharModal(); }); break;
    case 'aportar': modalAporte(S.cfg.metas.find(g => g.id === b.dataset.id)); break;
    case 'salvarAporte': {
      const { g } = modalAporte.ctx, v = valNum($('#a-v').value), d = $('#a-d').value;
      if (!isFinite(v) || v <= 0) return toast('Informe o valor.');
      S.cfg.metas = S.cfg.metas.map(x => x.id === g.id ? { ...x, atual: Math.round((x.atual + v) * 100) / 100 } : x);
      const ok = await act(salvarCfg());
      if (ok && $('#a-lanc').checked) await act(salvarItens([novoItem({ d, desc: 'Aporte: ' + g.nome, v, t: 'd', pg: 'conta', cat: 'investimentos' })]));
      if (ok) { toast('Aporte registrado'); fecharModal(); }
      break;
    }
    case 'importar': if (precisa()) modalImport(); break;
    case 'confirmarImport': confirmarImport(); break;
    case 'exportCSV': exportCSV(); break;
    case 'exportFluxo': exportFluxo(); break;
    case 'exportJSON': exportJSON(); break;
    case 'demo': entrarDemo(); break;
    case 'sairDemo': sairDemo(); break;
    case 'login': try { await S.fb.login(); } catch (err) { console.error(err); toast(err.code === 'auth/unauthorized-domain' ? 'Domínio não autorizado no Firebase (README, passo 3).' : 'Não foi possível entrar. Tente de novo.'); } break;
    case 'logout': confirmar(b, 'Confirmar saída', async () => { await S.fb.logout(); location.reload(); }); break;
    case 'addCat': {
      const nome = $('#novaCat').value.trim(); if (!nome) return;
      const id = L.norm(nome).replace(/ /g, '_').slice(0, 24) || uid();
      if (S.cfg.cats.some(c => c.id === id)) return toast('Essa categoria já existe.');
      lerCats(); S.cfg.cats.push({ id, nome, t: 'd', grupo: 'estilo', orc: 0 });
      if (await act(salvarCfg(), 'Categoria criada')) render();
      break;
    }
    case 'salvarCats': lerCats(); act(salvarCfg(), 'Categorias salvas'); break;
    case 'sugerirOrc': {
      const ant = mesesAnteriores(cicloAtual());
      if (!ant.length) return toast('Preciso de pelo menos um mês fechado com lançamentos.');
      for (const c of S.cfg.cats.filter(c => c.t === 'd' && c.grupo !== 'poupanca')) {
        const avg = sum(ant, x => x.t.porCat[c.id] || 0) / ant.length;
        c.orc = avg > 0 ? Math.ceil(avg * (c.grupo === 'estilo' ? 0.9 : 1) / 10) * 10 : 0;
      }
      if (await act(salvarCfg(), 'Orçamentos sugeridos. Ajuste o que quiser.')) render();
      break;
    }
  }
});
function lerCats() {
  document.querySelectorAll('[data-cat][data-k]').forEach(el => {
    const c = S.cfg.cats.find(x => x.id === el.dataset.cat); if (!c) return;
    if (el.dataset.k === 'orc') { const v = valNum(el.value || '0'); c.orc = isFinite(v) ? v : 0; } else if (el.dataset.k === 'nome') c.nome = el.value.trim() || c.nome; else c.grupo = el.value;
  });
}
document.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'onbForm') {
    const fx = [];
    const sal = valNum($('#onb-sal').value);
    if (isFinite(sal) && sal > 0) fx.push({ id: uid(), desc: 'Salário', v: sal, t: 'r', cat: 'salario', pg: 'conta', dia: 'util', ini: S.ref });
    document.querySelectorAll('#onbForm input[data-n]').forEach((el, i) => { const v = valNum(el.value); if (isFinite(v) && v > 0) fx.push({ id: uid(), desc: el.dataset.n, v, t: 'd', cat: el.dataset.c, pg: $('#onb-p' + i).value, dia: +el.dataset.d, ini: S.ref }); });
    if (!fx.length) return toast('Preencha ao menos o salário.');
    S.cfg.fixos = [...S.cfg.fixos, ...fx];
    act(salvarCfg(), 'Pronto. Agora lance os gastos com o botão +');
  } else if (e.target.id === 'fCartao') {
    const fe = +$('#cc-fecha').value, ve = +$('#cc-vence').value, mt = +$('#cc-meta').value;
    if (!(fe >= 1 && fe <= 31 && ve >= 1 && ve <= 31)) return toast('Dias entre 1 e 31.');
    S.cfg.cartao = { nome: $('#cc-nome').value.trim() || 'Cartão de crédito', fecha: fe, vence: ve };
    S.cfg.metaTaxa = Math.min(0.9, Math.max(0, mt / 100));
    act(salvarCfg(), 'Cartão salvo');
  }
});
document.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { if (e.target.id === 'imp-file') previewImport(String(rd.result)); else if (e.target.id === 'impJSON') importJSON(String(rd.result)); };
  // faturas de bancos antigos vêm em latin-1; tenta UTF-8 e cai para latin-1 se aparecer caractere inválido
  if (e.target.id === 'imp-file') { f.arrayBuffer().then(buf => { let t = new TextDecoder('utf-8').decode(buf); if (t.includes('\uFFFD')) t = new TextDecoder('windows-1252').decode(buf); previewImport(t); }); return; }
  rd.readAsText(f);
});
let bt;
document.addEventListener('input', e => { if (e.target.id === 'busca') { clearTimeout(bt); bt = setTimeout(() => { S.busca = e.target.value; const pos = e.target.selectionStart; render(); const nb = $('#busca'); if (nb) { nb.focus(); nb.setSelectionRange(pos, pos); } }, 250); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ov').hidden) fecharModal(); });
// tooltip
const tip = $('#tip');
document.addEventListener('pointermove', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 12) + 'px';
  tip.style.top = (e.clientY - h - 12 < 0 ? e.clientY + 16 : e.clientY - h - 12) + 'px';
});
document.addEventListener('pointerleave', () => tip.hidden = true);

function irPara(v) { if (location.hash.slice(1) === v) { S.view = v; render(); window.scrollTo(0, 0); } else location.hash = v; }
function rota() { const h = location.hash.slice(1); S.view = VIEWS.some(([k]) => k === h) ? h : 'painel'; render(); window.scrollTo(0, 0); }
window.addEventListener('hashchange', rota);

/* ===================== início ===================== */
async function boot() {
  const h = location.hash.slice(1); if (VIEWS.some(([k]) => k === h)) S.view = h;
  S.ref = cicloAtual(); render();
  // js/firebase.js resolve com: objeto FB, null (sem configuração) ou undefined (não carregou)
  const fb = await Promise.race([fbPronto, new Promise(r => setTimeout(() => r(undefined), 15000))]);
  const ligar = store => {
    S.store = store;
    store.subscribe(raw => { S.realRaw = raw; if (!S.demo) applyRaw(raw); }, (st, e) => { S.status = st; if (e) console.error(e); renderStatus(); });
  };
  if (fb === null || (fb === undefined && !navigator.onLine)) { ligar(MemStore('livro-caixa-local')); return; }
  if (fb === undefined) { S.status = 'erro'; $('#main').innerHTML = '<div class="card empty"><h2>Não consegui carregar</h2><p>Verifique a internet e recarregue a página.</p></div>'; renderStatus(); return; }
  S.fb = fb;
  let uidAtual = null;
  fb.onUser(u => {
    if (u && u.uid === uidAtual) return;
    if (!u) { if (uidAtual) return location.reload(); S.precisaLogin = true; S.status = 'login'; render(); return; }
    uidAtual = u.uid; S.user = { uid: u.uid, email: u.email }; S.precisaLogin = false; S.status = 'conectando';
    if (S.demo) { S.realStore = fb.store(u.uid, erroGravacao); S.demo = false; }
    ligar(fb.store(u.uid, erroGravacao)); render();
  });
}
function erroGravacao(e) { console.error(e); toast(e && e.code === 'permission-denied' ? 'Gravação recusada: confira as regras do Firestore.' : 'Uma alteração não sincronizou. Tente de novo.'); }
const fbPronto = new Promise(r => { window.__fbResolve = r; });
boot();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(e => console.error('sw', e));
