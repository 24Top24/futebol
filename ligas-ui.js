// Ecrãs e lógica das ligas (29/10/2026, pedidos do Rui; decisões em LIGAS.md).
// Não há liga principal: todas as ligas são iguais (a "Futebolada semanal" só fica guardada na raiz da base de dados).
//  #ligas        — as minhas ligas (abrir uma, ou ver todas juntas), cores, definições da liga (admin), convite,
//                  as minhas cartas (por liga + geral), estatísticas por liga e época, criar liga e (Rui) quem pode criar.
//  #liga=<id>    — link de convite: abre a liga; o jogador escolhe o seu nome e entra com o PIN (como sempre).
// A liga ativa guarda-se no telemóvel (localStorage 'liga'): vazio = Futebolada semanal, '*' = todas juntas.
import { DB } from './db.js?v=38';
import { historico } from './conquistas.js?v=3';
import { LIGA_PRINCIPAL, TEMAS, aplicarTema, temaEscolhido, escolherTema, epocaAtual, epocaDoJogo, nomeEpoca, idLiga, MAX_LIGAS_EXTRA } from './ligas.js?v=2';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
export const TODAS = '*';
export const ligaGuardada = () => lsGet('liga') || null;

// Muda de liga (ou TODAS): guarda, esquece o "quem sou eu" (é outro jogador em cada liga) e recarrega.
// O "quem sou eu" de cada liga fica guardado à parte (meu-perfil@<liga>): ao voltar a uma liga não se pede o PIN outra vez.
const trocarPerfil = (id) => {
  const k = (x) => 'meu-perfil@' + (x || 'fs');
  if (lsGet('liga') !== TODAS) lsSet(k(lsGet('liga')), lsGet('meu-perfil'));
  lsSet('meu-perfil', id === TODAS ? null : lsGet(k(id)));
};
export function mudarLiga(id) {
  trocarPerfil(id || null);
  lsSet('liga', id || null);
  location.hash = '#';
  location.reload();
}

// Faz fn() com a liga id ativa no DB e volta à que estava.
async function naLiga(id, fn) {
  const antes = DB.ligaAtual();
  DB.usarLiga(id);
  try { return await fn(); } finally { DB.usarLiga(antes); }
}

// Ligas desta pessoa (com a Futebolada semanal sempre na lista). Cada uma: { id, nome, player, admin }.
async function asMinhasLigas() {
  const ls = await naLiga(null, () => DB.minhasLigas());
  if (!ls.some((l) => l.id == null)) ls.unshift({ id: null, player: null });
  const nomeFS = (await naLiga(null, () => DB.getConfigLiga().catch(() => null)))?.nome || LIGA_PRINCIPAL.nome;
  for (const l of ls) if (l.id == null) l.nome = nomeFS;
  return ls;
}

// ---------- Todas as ligas juntas ----------
// A mesma pessoa tem um jogador diferente em cada liga; junta-se pela conta Google (membros/ de cada liga) → 'u:<uid>'.
// Ids que não estão ligados a uma conta ficam como estão (são aleatórios, não chocam entre ligas).
function trocarIds(j, m) {
  const t = (id) => m[id] || id;
  const eq = (L) => (L || []).map((x) => ({ ...x, id: t(x.id) }));
  return { ...j, brancos: eq(j.brancos), pretos: eq(j.pretos),
    eventos: (j.eventos || []).map((e) => ({ ...e, marcador: t(e.marcador), assist: e.assist && t(e.assist), gr: e.gr && t(e.gr) })),
    turnos: (j.turnos || []).map((x) => ({ ...x, jogador: t(x.jogador) })),
    penaltis: (j.penaltis || []).map((x) => ({ ...x, marcador: t(x.marcador), gr: x.gr && t(x.gr) })) };
}
// { players, perfis, jogosPub, games } de todas as ligas da pessoa, com os jogadores da mesma pessoa juntos.
export async function dadosTodas() {
  const ligas = await asMinhasLigas();
  const out = { players: [], perfis: [], jogosPub: [], games: [] }, vistos = new Set();
  for (const l of ligas) {
    const r = await naLiga(l.id, async () => {
      const [players, perfis, jogosPub, games, membros] = await Promise.all([DB.listPlayers(), DB.listPerfis().catch(() => []),
        DB.listJogosPub().catch(() => []), DB.listGames().catch(() => []), DB.listMembros(l.id).catch(() => [])]);
      return { players, perfis, jogosPub, games, membros };
    }).catch((e) => { console.error(e); return null; });
    if (!r) continue;
    const m = Object.fromEntries(r.membros.map((x) => [x.player, 'u:' + x.uid]));   // jogador desta liga → pessoa
    for (const p of r.players) { const id = m[p.id] || p.id; if (!vistos.has(id)) { vistos.add(id); out.players.push({ ...p, id, liga: l.id }); } }
    for (const p of r.perfis) out.perfis.push({ ...p, id: m[p.id] || p.id });
    for (const j of r.jogosPub) { try { out.jogosPub.push({ ...j, id: (l.id || 'fs') + '~' + j.id, json: JSON.stringify(trocarIds(JSON.parse(j.json || '{}'), m)) }); } catch {} }
    out.games.push(...r.games.map((g) => ({ ...g, id: (l.id || 'fs') + '~' + g.id, liga: l.id })));
  }
  return out;
}
// "Eu" no modo todas as ligas = a pessoa ('u:<uid>').
export async function euTodas() { const u = await DB.user(); return u ? 'u:' + u.uid : null; }

// ---------- Votos aproveitados entre ligas ----------
// Quando voto num colega numa liga, a mesma nota vai para as outras ligas onde estamos os dois (ligados por conta Google).
// As cartas de cada liga continuam a contar só os votos dessa liga (a nota é escrita lá como voto meu).
export async function espelharVoto(alvoId, nota) {
  try {
    const u = await DB.user(); if (!u) return;
    const aqui = DB.ligaAtual();
    const alvoUid = (await DB.listMembros(aqui).catch(() => [])).find((m) => m.player === alvoId)?.uid;
    if (!alvoUid || alvoUid === u.uid) return;
    for (const l of await asMinhasLigas()) {
      if ((l.id || null) === (aqui || null) || !l.player) continue;
      await naLiga(l.id, async () => {
        const alvoL = (await DB.listMembros(l.id).catch(() => [])).find((m) => m.uid === alvoUid)?.player;
        if (alvoL && alvoL !== l.player) await DB.saveVote(l.player, alvoL, nota);
      }).catch((e) => console.error(e));
    }
  } catch (e) { console.error(e); }
}

// ---------- Carta geral (mistura das cartas de cada liga) ----------
// Pesa cada liga pelo número de colegas que me conhecem lá.
export async function asMinhasCartas() {
  const ligas = (await asMinhasLigas()).filter((l) => l.player);
  const por = [];
  for (const l of ligas) {
    const mc = await naLiga(l.id, () => DB.getMinhaCarta(l.player)).catch(() => null);
    if (mc?.carta?.overall != null) por.push({ liga: l, carta: mc.carta, peso: Math.max(1, mc.carta.conhecem || 1) });
  }
  if (!por.length) return { por, geral: null };
  const tot = por.reduce((s, x) => s + x.peso, 0);
  const media = (f) => Math.round(por.reduce((s, x) => s + (f(x.carta) ?? 0) * x.peso, 0) / tot);
  const chaves = [...new Set(por.flatMap((x) => Object.keys(x.carta.stats || {})))];
  return { por, geral: { overall: media((c) => c.overall), stats: Object.fromEntries(chaves.map((k) => [k, media((c) => c.stats?.[k])])), ligas: por.length } };
}

// ---------- Estatísticas por liga e época ----------
async function statsNaLiga(ligaId, player) {
  return naLiga(ligaId, async () => {
    const jogos = (await DB.listJogosPub()).map((r) => ({ ...JSON.parse(r.json || '{}'), _id: r.id })).filter((j) => j.fase === 'fim');
    const out = {};
    for (const { j, l } of historico(jogos, player)) {
      const s = (out[epocaDoJogo(j)] ||= { j: 0, v: 0, e: 0, d: 0, g: 0, a: 0 });
      s.j++; s[l.res === 'V' ? 'v' : l.res === 'E' ? 'e' : 'd']++; s.g += l.g; s.a += l.a;
    }
    return out;
  }).catch((e) => { console.error(e); return {}; });
}

// ---------- Página #ligas ----------
export async function paginaLigas($app, { esc, toast, titulo, htmlCarta }) {
  titulo('Ligas');
  const ctx = { esc, toast, titulo, htmlCarta };
  const refazer = () => paginaLigas($app, ctx);
  const atual = ligaGuardada();
  const u = await DB.user();
  const cfg = atual === TODAS ? null : await DB.getConfigLiga().catch(() => null);
  const souAdmin = !!cfg && !!u && (cfg.raiz ? await DB.isAdmin(u) : (cfg.admins || []).includes(u.uid));
  const ep = epocaAtual();
  const cartaH = (nome, c) => (htmlCarta ? htmlCarta({ nome }, c) : `<b>${c.overall}</b>`);

  // Cores (cada jogador escolhe as suas para a liga aberta) — não precisa de conta.
  const blocoTema = atual === TODAS ? '' : `<section class="cartao"><h3>🎨 Cores desta liga</h3>
    <p class="mute">A liga usa ${esc(TEMAS[cfg?.cor]?.nome || TEMAS.vermelho.nome)}. Podes escolher outras só para ti.</p>
    <div class="chips">${Object.entries(TEMAS).map(([k, t]) => `<button class="chip${temaEscolhido(atual) === k ? ' on' : ''}" data-tema="${k}"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${t.c[0]};margin-right:6px;vertical-align:-2px"></span>${esc(t.nome)}</button>`).join('')}
      <button class="chip" data-tema="">↺ As da liga</button></div></section>`;

  if (!u) {
    $app.innerHTML = `<section class="cartao"><h3>🏆 Ligas</h3><p>Estás na <b>${esc(cfg?.nome || LIGA_PRINCIPAL.nome)}</b> ${esc(nomeEpoca(ep))}.</p>
      <p class="mute">Se jogas em mais do que uma liga, liga o teu perfil à conta Google em cada uma (👤 Eu → ⚙️ → Os meus dados →
      Ligar ao Google): passam a aparecer aqui todas, com as tuas estatísticas e cartas juntas.</p>
      <button class="prim" id="lg-google">🔐 Entrar com o Google</button></section>${blocoTema}`;
    document.getElementById('lg-google').onclick = async () => { try { await DB.entrarGoogle(); refazer(); } catch (e) { console.error(e); toast('Não deu para entrar com o Google'); } };
    ligarTema($app, atual, cfg);
    return;
  }
  $app.innerHTML = '<p class="mute">A carregar as tuas ligas…</p>';
  const [ligas, limite, souRui] = await Promise.all([asMinhasLigas(), naLiga(null, () => DB.meuLimite()), naLiga(null, () => DB.isAdmin(u))]);
  const nomeL = (l) => l.nome || l.id || LIGA_PRINCIPAL.nome;
  const porLiga = [];
  for (const l of ligas.filter((x) => x.player)) porLiga.push({ l, s: await statsNaLiga(l.id, l.player) });
  const tot = { j: 0, v: 0, e: 0, d: 0, g: 0, a: 0 }, linhas = [];
  for (const { l, s } of porLiga) for (const [e, x] of Object.entries(s).sort().reverse()) {
    for (const k in tot) tot[k] += x[k];
    linhas.push(`<tr><td>${esc(nomeL(l))}</td><td>${esc(nomeEpoca(e))}</td><td>${x.j}</td><td>${x.v}-${x.e}-${x.d}</td><td>${x.g}</td><td>${x.a}</td></tr>`);
  }
  const cartas = await asMinhasCartas().catch(() => ({ por: [], geral: null }));
  const podeCriar = limite && (limite.criadas || 0) < (limite.max || 0);
  const ativa = (id) => (id || null) === (atual || null);

  $app.innerHTML = `
    <section class="cartao"><h3>🏆 As minhas ligas</h3>
      ${ligas.map((l) => `<div class="opcao linha" style="justify-content:space-between;align-items:center">
        <div><b>${esc(nomeL(l))}</b> <small class="mute">${esc(nomeEpoca(ep))}</small>
          ${l.player ? '' : '<div class="mute" style="font-size:12px">O teu perfil desta liga ainda não está ligado à conta Google</div>'}</div>
        ${ativa(l.id) ? '<span class="tag">✔ aberta</span>' : `<button class="peq prim" data-liga="${esc(l.id ?? '')}">Abrir</button>`}</div>`).join('')}
      ${ligas.length > 1 ? `<div class="opcao linha" style="justify-content:space-between;align-items:center"><div><b>🌍 Todas juntas</b>
        <div class="mute" style="font-size:12px">Jogos, classificação e estatísticas de todas as tuas ligas misturados (só para ver).</div></div>
        ${atual === TODAS ? '<span class="tag">✔ aberta</span>' : `<button class="peq" data-liga="${TODAS}">Abrir</button>`}</div>` : ''}
    </section>
    ${blocoTema}
    <div id="lg-def"></div>
    <section class="cartao"><h3>🃏 As minhas cartas</h3>
      ${cartas.por.length ? `<p class="mute">Uma carta por liga (só com os votos dos colegas dessa liga) e a geral, que as mistura. Só tu as vês.</p>
        <div class="cartas">${cartas.geral && cartas.por.length > 1 ? `<div><div class="mute" style="text-align:center">🌍 Geral</div>${cartaH('Geral', cartas.geral)}</div>` : ''}
          ${cartas.por.map((x) => `<div><div class="mute" style="text-align:center">${esc(nomeL(x.liga))}</div>${cartaH(nomeL(x.liga), x.carta)}</div>`).join('')}</div>`
        : '<p class="mute">Ainda sem cartas (faltam votos dos colegas).</p>'}
    </section>
    <section class="cartao"><h3>📊 As minhas estatísticas</h3>
      ${linhas.length ? `<div style="overflow-x:auto"><table class="tab"><tr><th>Liga</th><th>Época</th><th>J</th><th>V-E-D</th><th>⚽</th><th>🎯</th></tr>${linhas.join('')}
        <tr><td colspan="2"><b>Total</b></td><td><b>${tot.j}</b></td><td><b>${tot.v}-${tot.e}-${tot.d}</b></td><td><b>${tot.g}</b></td><td><b>${tot.a}</b></td></tr></table></div>`
        : '<p class="mute">Ainda sem jogos nas tuas ligas.</p>'}
    </section>
    <section class="cartao"><h3>➕ Criar uma liga</h3>
      ${podeCriar ? `<p class="mute">Ficas administrador: crias os jogadores e os PINs, fazes as equipas e registas os jogos, como na Futebolada semanal. Podes criar mais ${limite.max - (limite.criadas || 0)}.</p>
        <label>Nome da liga</label><input id="lg-nome" maxlength="60" placeholder="ex.: Futebol de segunda">
        <label>O teu nome nessa liga</label><input id="lg-eu" maxlength="30" value="${esc(u.displayName || '')}">
        <label>Cores</label><select id="lg-cor">${Object.entries(TEMAS).map(([k, t]) => `<option value="${k}">${esc(t.nome)}</option>`).join('')}</select>
        <button class="prim" id="lg-criar" style="margin-top:8px">Criar liga</button>`
        : `<p class="mute">${limite ? `Já criaste ${limite.criadas} liga(s), o máximo (${MAX_LIGAS_EXTRA}).` : 'Só o Rui autoriza quem pode criar ligas. Pede-lhe.'}</p>`}
    </section>
    ${souRui ? '<section class="cartao"><h3>⌚ O meu relógio</h3><div id="lg-rel"><p class="mute">A carregar…</p></div></section>' : ''}
    <div id="lg-rui"></div>`;

  $app.querySelectorAll('[data-liga]').forEach((b) => (b.onclick = () => mudarLiga(b.dataset.liga || null)));
  ligarTema($app, atual, cfg);
  document.getElementById('lg-criar')?.addEventListener('click', async (e) => {
    const nome = document.getElementById('lg-nome').value.trim(), meuNome = document.getElementById('lg-eu').value.trim(), cor = document.getElementById('lg-cor').value;
    if (!nome) return toast('Dá um nome à liga');
    e.target.disabled = true;
    try { const r = await naLiga(null, () => DB.criarLiga(idLiga(nome), { nome, meuNome })); await DB.setLiga(r.id, { cor }); toast('Liga criada ✔'); mudarLiga(r.id); }
    catch (err) { console.error(err); e.target.disabled = false; toast(err.message || 'Não deu para criar a liga'); }
  });
  if (souRui) relogios(document.getElementById('lg-rel'), { esc, toast });
  if (souAdmin) definicoesLiga(document.getElementById('lg-def'), cfg, atual, { esc, toast, refazer });
  if (souRui) naLiga(null, () => autorizacoes(document.getElementById('lg-rui'), { esc, toast, refazer }));
}

function ligarTema($app, atual, cfg) {
  $app.querySelectorAll('[data-tema]').forEach((b) => (b.onclick = () => {
    escolherTema(atual, b.dataset.tema || null);
    aplicarTema(b.dataset.tema || cfg?.cor);
    $app.querySelectorAll('[data-tema]').forEach((x) => x.classList.toggle('on', x === b && !!b.dataset.tema));
  }));
}

// Definições da liga aberta (admin): nome, cores, classificação pública ou privada, convite.
function definicoesLiga(el, cfg, atual, { esc, toast, refazer }) {
  const link = `${location.origin}${location.pathname}#liga=${encodeURIComponent(atual || 'futebolada-semanal')}`;
  el.innerHTML = `<section class="cartao"><h3>⚙️ Definições de “${esc(cfg.nome)}”</h3>
    <label>Nome</label><input id="ld-nome" maxlength="60" value="${esc(cfg.nome)}">
    <label>Cores da liga</label><select id="ld-cor">${Object.entries(TEMAS).map(([k, t]) => `<option value="${k}" ${cfg.cor === k ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
    ${cfg.raiz ? '<p class="mute" style="font-size:12px">Esta liga fica pública por agora: o relógio lê as equipas sem login. Passa a poder ser privada quando o relógio entrar com conta.</p>'
      : `<label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="ld-pub" style="width:auto" ${cfg.publico ? 'checked' : ''}> Classificação, jogos e estatísticas públicos (quem tiver o link vê)</label>`}
    <p class="mute" style="font-size:12px">As cartas nunca são públicas: cada jogador só vê a sua.</p>
    <button class="prim peq" id="ld-ok" style="margin-top:8px">Guardar</button>
    <p style="margin-top:14px"><b>🔗 Convite</b></p><div class="linha"><input id="ld-link" readonly value="${esc(link)}"><button class="peq" id="ld-copiar">Copiar</button></div>
    <p class="mute" style="font-size:12px">Cria os jogadores e os PINs em 🔧 Administração → Plantel (como sempre) e manda o link e o PIN a cada um.
      Quem abrir o link escolhe o seu nome e entra com o PIN; depois pode ligar a conta Google (se já estiver noutra liga, fica a mesma pessoa).</p>
  </section>`;
  document.getElementById('ld-ok').onclick = async () => {
    const d = { nome: document.getElementById('ld-nome').value.trim() || cfg.nome, cor: document.getElementById('ld-cor').value };
    const pub = document.getElementById('ld-pub'); if (pub) d.publico = pub.checked;
    try { await DB.setConfigLiga(d); toast('Guardado ✔'); if (!temaEscolhido(atual)) aplicarTema(d.cor); refazer(); } catch (e) { console.error(e); toast('Não deu para guardar'); }
  };
  document.getElementById('ld-copiar').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado ✔'); } catch { document.getElementById('ld-link').select(); } };
}

// O Rui escolhe quem pode criar ligas (entre quem já ligou a conta Google), até 2 cada.
async function autorizacoes(el, { esc, toast, refazer }) {
  const [contas, aut, players] = await Promise.all([DB.listContas(), DB.listAutorizados(), DB.listPlayers()]);
  const nome = (c) => players.find((p) => p.id === c.player)?.nome || c.email || c.id;
  el.innerHTML = `<section class="cartao"><h3>🔑 Quem pode criar ligas</h3>
    <p class="mute">Só aparecem jogadores com a conta Google ligada. Cada autorizado cria no máximo ${MAX_LIGAS_EXTRA} ligas.</p>
    ${contas.length ? contas.map((c) => { const a = aut.find((x) => x.id === c.id);
      return `<div class="opcao linha" style="justify-content:space-between;align-items:center"><div><b>${esc(nome(c))}</b>${a ? ` <small class="mute">${a.criadas || 0}/${a.max} criadas</small>` : ''}</div>
        ${a ? `<button class="peq perigo" data-desaut="${esc(c.id)}">Tirar autorização</button>` : `<button class="peq prim" data-aut="${esc(c.id)}">Autorizar</button>`}</div>`; }).join('')
      : '<p class="mute">Ainda ninguém ligou a conta Google.</p>'}</section>`;
  el.querySelectorAll('[data-aut]').forEach((b) => (b.onclick = async () => { const c = contas.find((x) => x.id === b.dataset.aut); await naLiga(null, () => DB.autorizar(c.id, nome(c), MAX_LIGAS_EXTRA)); toast('Autorizado ✔'); refazer(); }));
  el.querySelectorAll('[data-desaut]').forEach((b) => (b.onclick = async () => { await naLiga(null, () => DB.desautorizar(b.dataset.desaut)); refazer(); }));
}

// ⌚ O relógio do Rui liga-se sozinho às ligas dele com a chave do relógio (a do Admin → Relógio). Aqui só se veem os relógios.
async function relogios(el, { esc, toast }) {
  const L = await naLiga(null, () => DB.listRelogios()).catch(() => []);
  el.innerHTML = `<p class="mute">O teu relógio liga-se sozinho às tuas ligas com a chave do relógio (🔧 Administração → Relógio): vê as equipas do próximo jogo de qualquer liga e guarda lá o jogo.</p>
    ${L.length ? L.map((r) => `<div class="opcao linha" style="justify-content:space-between;align-items:center"><div>⌚ Relógio ${esc(r.id.slice(0, 6))}… <small class="mute">desde ${esc(new Date(r.ts || 0).toLocaleDateString('pt-PT'))}</small></div>
      <button class="peq perigo" data-desrel="${esc(r.id)}">Desligar</button></div>`).join('') : ''}`;
  el.querySelectorAll('[data-desrel]').forEach((b) => (b.onclick = async () => { if (!confirm('Desligar este relógio? Volta a ligar-se se ainda tiver a chave — para o cortar de vez, muda a chave no Admin.')) return; await naLiga(null, () => DB.desligarRelogio(b.dataset.desrel)); relogios(el, { esc, toast }); }));
}

// Link de convite #liga=<id>: abre essa liga e vai para o "Quem és tu?" (a Futebolada semanal é 'futebolada-semanal').
export async function abrirConvite(id) {
  const lid = id === 'futebolada-semanal' ? null : id;
  if (lid && !(await DB.getLiga(lid).catch(() => null))) return false;
  if ((lsGet('liga') || null) !== lid) { trocarPerfil(lid); lsSet('liga', lid); }
  location.hash = '#eu';
  location.reload();
  return true;
}
