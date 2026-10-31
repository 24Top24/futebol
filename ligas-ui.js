// Ecrãs e lógica das ligas (29/10/2026, pedidos do Rui; decisões em LIGAS.md).
// Não há liga principal: todas as ligas são iguais (a "Futebolada semanal" só fica guardada na raiz da base de dados).
//  #ligas        — as minhas ligas (abrir uma, ou ver todas juntas), cores, definições da liga (admin), convite,
//                  as minhas cartas (por liga + geral), estatísticas por liga e época, criar liga e (Rui) quem pode criar.
//  #liga=<id>    — link de convite: abre a liga; o jogador escolhe o seu nome e entra com o PIN (como sempre).
// A liga ativa guarda-se no telemóvel (localStorage 'liga'): vazio = Futebolada semanal, '*' = todas juntas.
import { DB } from './db.js?v=43';
import { historico } from './conquistas.js?v=3';
import { LIGA_PRINCIPAL, TEMAS, aplicarTema, temaEscolhido, escolherTema, epocaAtual, epocaDoJogo, nomeEpoca, idLiga, MAX_LIGAS_EXTRA } from './ligas.js?v=2';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
export const TODAS = '*';
export const ligaGuardada = () => lsGet('liga') || null;
// Visitante = não entrou com PIN nem com conta Google: vê só tabelas, estatísticas e jogos (sem desafios nem dados de jogadores).
export const souVisitante = async () => !lsGet('meu-perfil') && !(await DB.user());

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

// Links por liga (Rui, 31/10): #<liga>/<página>, p. ex. #futebolada-semanal/admin ou #ce-erre-setes/jogos.
// O nome curto vem do nome da liga (mudar o nome muda o link; o id da liga também serve: #<id>/jogos). 'todas' = todas as ligas.
export const slugLiga = (nome) => (nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'liga';
export const LINK_LIGA = /^#([a-z0-9-]+)\/(.*)$/;
// Liga de um link: o id (null = Futebolada semanal), TODAS, ou undefined se não existe (ou é privada e não é minha).
export async function ligaDoLink(s) {
  if (s === 'todas') return TODAS;
  const ls = await asMinhasLigas().catch(() => []);
  const l = ls.find((x) => x.id && x.id === s) || ls.find((x) => slugLiga(x.nome) === s);
  return l ? (l.id || null) : undefined;
}
// Abre a liga de um link (como escolhê-la no menu, sem recarregar).
export function irParaLiga(id) { trocarPerfil(id); lsSet('liga', id); }

// Faz fn() com a liga id ativa no DB e volta à que estava.
// fn recebe uma vista da base de dados presa a essa liga (DB.para) — a liga da app nunca muda a meio (31/10: mudá-la fazia a
// página que estava a carregar ler a liga errada).
async function naLiga(id, fn) { return fn(DB.para(id)); }

// Ligas desta pessoa (com a Futebolada semanal sempre na lista). Cada uma: { id, nome, player, admin }.
async function asMinhasLigas() {
  // Sem conta (visitante): a Futebolada semanal e as ligas públicas, só para ver tabelas, estatísticas e jogos.
  if (!(await DB.user()) && !lsGet('meu-perfil')) {
    const pub = await naLiga(null, (db) => db.ligasPublicas()).catch(() => []);
    const nomeFS = (await naLiga(null, (db) => db.getConfigLiga().catch(() => null)))?.nome || LIGA_PRINCIPAL.nome;
    return [{ id: null, nome: nomeFS, publica: true }, ...pub.map((l) => ({ ...l, publica: true }))];
  }
  const ls = await naLiga(null, (db) => db.minhasLigas());
  // O Rui é admin global: vê todas as ligas (mesmo as que não são dele).
  if (await naLiga(null, async (db) => db.isAdmin(await DB.user())).catch(() => false))
    for (const l of await naLiga(null, (db) => db.todasLigas())) if (!ls.some((x) => x.id === l.id)) ls.push({ ...l, admin: true, global: true });
  if (!ls.some((l) => l.id == null)) ls.unshift({ id: null, player: null });
  const nomeFS = (await naLiga(null, (db) => db.getConfigLiga().catch(() => null)))?.nome || LIGA_PRINCIPAL.nome;
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
  const dados = [];
  for (const l of ligas) {
    const r = await naLiga(l.id, async (db) => {
      const [players, perfis, jogosPub, games, membros] = await Promise.all([db.listPlayers().catch(() => []), db.listPerfis().catch(() => []),
        db.listJogosPub().catch(() => []), db.listGames().catch(() => []), db.listMembros(l.id).catch(() => [])]);
      return { players, perfis, jogosPub, games, membros };
    }).catch((e) => { console.error(e); return null; });
    if (r) dados.push({ l, ...r });
  }
  // Quem é quem: a mesma pessoa pela conta Google ('u:<uid>') ou pelo "sincronizar com outra liga" do admin (players.sinc = { liga, id }).
  const uidDe = {}, sincDe = {};
  for (const d of dados) {
    for (const m of d.membros) uidDe[(d.l.id || 'fs') + '|' + m.player] = 'u:' + m.uid;
    for (const p of d.players) if (p.sinc?.id) sincDe[(d.l.id || 'fs') + '|' + p.id] = (p.sinc.liga || 'fs') + '|' + p.sinc.id;
  }
  const canon = (k, n = 0) => uidDe[k] || (sincDe[k] && n < 5 ? canon(sincDe[k], n + 1) : k.split('|')[1]);
  for (const d of dados) {
    const lk = d.l.id || 'fs';
    const m = {};
    for (const p of d.players) m[p.id] = canon(lk + '|' + p.id);
    for (const mb of d.membros) m[mb.player] = 'u:' + mb.uid;
    // o alvo de uma sincronização (p. ex. um convidado, que não está em players/) passa a ter o id da pessoa
    for (const k of Object.keys(sincDe)) { const alvo = sincDe[k]; if (alvo.startsWith(lk + '|')) m[alvo.split('|')[1]] ||= canon(k); }
    for (const p of d.players) { const id = m[p.id] || p.id; if (!vistos.has(id)) { vistos.add(id); out.players.push({ ...p, id, liga: d.l.id }); } }
    for (const p of d.perfis) out.perfis.push({ ...p, id: m[p.id] || p.id });
    for (const j of d.jogosPub) { try { out.jogosPub.push({ ...j, id: lk + '~' + j.id, json: JSON.stringify(trocarIds(JSON.parse(j.json || '{}'), m)) }); } catch {} }
    out.games.push(...d.games.map((g) => ({ ...g, id: lk + '~' + g.id, liga: d.l.id })));
  }
  return out;
}
// "Eu" no modo todas as ligas = a pessoa ('u:<uid>').
export async function euTodas() { const u = await DB.user(); return u ? 'u:' + u.uid : null; }

// ---------- Seletor de liga (topo do menu no PC, topo da página no telemóvel) ----------
// Só aparece a quem está em mais do que uma liga (com a conta Google). Mudar de liga recarrega a app nessa liga; "Todas" junta-as.
export async function montarSeletorLiga(nomeAtual) {
  try {
    // O título do menu (onde dizia "Futebolada") passa a ser o nome da liga aberta; quem está em 2+ ligas escolhe-a aí.
    if (!document.getElementById('sel-liga-css')) document.head.insertAdjacentHTML('beforeend', `<style id="sel-liga-css">
      .marca-liga { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      select.sel-liga { font: inherit; color: var(--txt); background: transparent; border: 0; padding: 0 18px 0 0; min-width: 0; max-width: 100%;
        appearance: none; -webkit-appearance: none; cursor: pointer; text-overflow: ellipsis;
        background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
        background-position: calc(100% - 9px) 55%, calc(100% - 4px) 55%; background-size: 5px 5px; background-repeat: no-repeat; }
      #nav .marca .marca-liga { font-size: 16px; flex: 1 1 auto; width: 100%; } #nav .marca:has(select) .ic-bola { display: none; }
      select.sel-liga option { background: var(--bg2); color: var(--txt); font-size: 15px; font-weight: 600; }
      .sel-liga-topo { font-size: 13px !important; font-weight: 700; background-color: var(--bg3) !important; border: 1px solid var(--borda) !important;
        border-radius: 10px; padding: 6px 22px 6px 8px !important; max-width: 46vw; margin-left: auto; }
      @media (min-width: 900px) { .sel-liga-topo { display: none; } }</style>`);
    const span = document.querySelector('#nav .marca span');
    if (span) { span.textContent = nomeAtual || LIGA_PRINCIPAL.nome; span.classList.add('marca-liga'); }
    const ligas = await asMinhasLigas();
    if (ligas.length < 2) return;
    const atual = ligaGuardada();
    const html = `${ligas.map((l) => `<option value="${(l.id ?? '').replace(/"/g, '')}" ${(l.id || null) === (atual === TODAS ? '§' : atual) ? 'selected' : ''}>${(l.nome || l.id || LIGA_PRINCIPAL.nome).replace(/</g, '&lt;')}</option>`).join('')}
      <option value="${TODAS}" ${atual === TODAS ? 'selected' : ''}>🌍 Todas as ligas</option>`;
    // No PC: o próprio título vira a lista (o clique no título deixa de ir para o Início; o Início está logo abaixo).
    const marca = document.querySelector('#nav .marca');
    if (marca && span && !marca.querySelector('select')) {
      span.outerHTML = `<select class="sel-liga marca-liga" aria-label="Liga">${html}</select>`;
      marca.addEventListener('click', (e) => { if (e.target.closest('select')) e.preventDefault(); });
    }
    // No telemóvel o menu de baixo não tem título: a lista fica no topo da página.
    const topo = document.getElementById('ticket');
    if (topo && !document.querySelector('.sel-liga-topo')) topo.insertAdjacentHTML('beforebegin', `<select class="sel-liga sel-liga-topo" aria-label="Liga">${html}</select>`);
    document.querySelectorAll('select.sel-liga').forEach((el) => (el.onchange = () => mudarLiga(el.value || null)));
  } catch (e) { console.error(e); }
}

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
      await naLiga(l.id, async (db) => {
        const alvoL = (await db.listMembros(l.id).catch(() => [])).find((m) => m.uid === alvoUid)?.player;
        if (alvoL && alvoL !== l.player) await db.saveVote(l.player, alvoL, nota);
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
    const mc = await naLiga(l.id, (db) => db.getMinhaCarta(l.player)).catch(() => null);
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
  return naLiga(ligaId, async (db) => {
    const jogos = (await db.listJogosPub()).map((r) => ({ ...JSON.parse(r.json || '{}'), _id: r.id })).filter((j) => j.fase === 'fim');
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
  const [ligas, limite, souRui] = await Promise.all([asMinhasLigas(), naLiga(null, (db) => db.meuLimite()), naLiga(null, (db) => db.isAdmin(u))]);
  const nomeL = (l) => l.nome || l.id || LIGA_PRINCIPAL.nome;
  const porLiga = [];
  for (const l of ligas.filter((x) => x.player)) porLiga.push({ l, s: await statsNaLiga(l.id, l.player) });
  const tot = { j: 0, v: 0, e: 0, d: 0, g: 0, a: 0 }, linhas = [];
  for (const { l, s } of porLiga) for (const [e, x] of Object.entries(s).sort().reverse()) {
    for (const k in tot) tot[k] += x[k];
    linhas.push(`<tr><td>${esc(nomeL(l))}</td><td>${esc(nomeEpoca(e))}</td><td>${x.j}</td><td>${x.v}-${x.e}-${x.d}</td><td>${x.g}</td><td>${x.a}</td></tr>`);
  }
  const cartas = await asMinhasCartas().catch(() => ({ por: [], geral: null }));
  const podeCriar = !limite || (limite.criadas || 0) < (limite.max || 0);   // qualquer pessoa com conta Google cria até 2
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
      ${podeCriar ? `<p class="mute">Ficas administrador: crias os jogadores e os PINs, fazes as equipas e registas os jogos, como na Futebolada semanal. Podes criar mais ${limite ? limite.max - (limite.criadas || 0) : MAX_LIGAS_EXTRA}.</p>
        <label>Nome da liga</label><input id="lg-nome" maxlength="60" placeholder="ex.: Futebol de segunda">
        <label>O teu nome nessa liga</label><input id="lg-eu" maxlength="30" value="${esc(u.displayName || '')}">
        <label>Cores</label><select id="lg-cor">${Object.entries(TEMAS).map(([k, t]) => `<option value="${k}">${esc(t.nome)}</option>`).join('')}</select>
        <button class="prim" id="lg-criar" style="margin-top:8px">Criar liga</button>`
        : `<p class="mute">Já criaste ${limite.criadas} liga(s), o máximo (${limite.max}). Se precisares de mais, pede ao Rui.</p>`}
    </section>
    ${souRui ? '<section class="cartao"><h3>⌚ O meu relógio</h3><div id="lg-rel"><p class="mute">A carregar…</p></div></section>' : ''}
    <div id="lg-rui"></div>`;

  $app.querySelectorAll('[data-liga]').forEach((b) => (b.onclick = () => mudarLiga(b.dataset.liga || null)));
  ligarTema($app, atual, cfg);
  document.getElementById('lg-criar')?.addEventListener('click', async (e) => {
    const nome = document.getElementById('lg-nome').value.trim(), meuNome = document.getElementById('lg-eu').value.trim(), cor = document.getElementById('lg-cor').value;
    if (!nome) return toast('Dá um nome à liga');
    e.target.disabled = true;
    try { const r = await naLiga(null, (db) => db.criarLiga(idLiga(nome), { nome, meuNome })); await DB.setLiga(r.id, { cor }); toast('Liga criada ✔'); mudarLiga(r.id); }
    catch (err) { console.error(err); e.target.disabled = false; toast(err.message || 'Não deu para criar a liga'); }
  });
  if (souRui) relogios(document.getElementById('lg-rel'), { esc, toast });
  // Ligas criadas antes de "pública por defeito" (31/10) não têm o campo: grava-se publico = true (o admin pode mudar).
  if (souAdmin && cfg && !cfg.raiz && !cfg.publicoDefinido) DB.setConfigLiga({ publico: true }).catch((e) => console.error(e));
  if (souRui) for (const l of ligas) if (l.id && !('publico' in l)) DB.setLiga(l.id, { publico: true }).catch((e) => console.error(e));
  // 31/10: o erro da liga trocada gravou o nome e as cores da Ce Erre Setes na Futebolada semanal — repõe-se uma vez (Rui).
  if (souRui) { const fs = DB.para(null); fs.getConfigLiga().then((c) => c?.nome === 'Ce Erre Setes' && fs.setConfigLiga({ nome: 'Futebolada semanal', cor: 'vermelho' })).catch((e) => console.error(e)); }
  if (souAdmin) definicoesLiga(document.getElementById('lg-def'), cfg, atual, { esc, toast, refazer });
  if (souRui) naLiga(null, (db) => autorizacoes(db, document.getElementById('lg-rui'), { esc, toast, refazer }));
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
  if (atual) importarJogadores(el, atual, { esc, toast, refazer });
  gerirJogadores(el, atual, { esc, toast, refazer });
  document.getElementById('ld-copiar').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado ✔'); } catch { document.getElementById('ld-link').select(); } };
}

// Jogadores de uma liga, incluindo os convidados (para sincronizar com eles).
async function jogadoresDaLiga(lid) {
  const db = DB.para(lid);
  const [jog, segredo] = await Promise.all([db.listPlayers().catch(() => []), db.getSegredo('partilha').catch(() => null)]);
  const conv = segredo?.chave ? await db.listPart(segredo.chave, 'convidados').catch(() => []) : [];
  return [...jog.map((x) => ({ id: x.id, nome: x.nome || '?', foto: x.foto || '' })), ...conv.map((x) => ({ id: x.id, nome: x.nome || '?', conv: true, foto: x.foto || '' }))]
    .sort((a, c) => a.nome.localeCompare(c.nome, 'pt'));
}

// Campo "É o mesmo jogador noutra liga" (ficha do jogador, admin): escolhe a liga e o jogador de lá.
// Devolve uma função que dá o `sinc` escolhido ({ liga, id, nome, foto }), null = nenhum, undefined = não mexer (ainda a carregar).
export async function campoSinc(el, p, esc) {
  const liga = ligaGuardada();
  if (liga === TODAS) return () => undefined;
  const outras = (await asMinhasLigas().catch(() => [])).filter((l) => (l.id || null) !== (liga || null));
  if (!outras.length) return () => undefined;
  const atual = p.sinc ? (p.sinc.liga ?? '') : '-';
  el.innerHTML = `<label>🔗 É o mesmo jogador noutra liga?</label>
    <select class="s-liga"><option value="-">Não</option>${outras.map((l) => `<option value="${esc(l.id ?? '')}" ${atual === (l.id ?? '') ? 'selected' : ''}>${esc(l.nome || LIGA_PRINCIPAL.nome)}</option>`).join('')}</select>
    <select class="s-jog" hidden style="margin-top:6px"></select>`;
  const sl = el.querySelector('.s-liga'), sj = el.querySelector('.s-jog');
  let lista = [], pronto = true;
  const carregar = async () => {
    sj.hidden = sl.value === '-'; if (sj.hidden) return;
    pronto = false; sj.innerHTML = '<option>a carregar…</option>';
    lista = await jogadoresDaLiga(sl.value || null);
    const primeiro = (p.nome || '').toLowerCase().split(' ')[0];
    sj.innerHTML = '<option value="">— escolhe o jogador —</option>' + lista.map((x) => `<option value="${esc(x.id)}" ${p.sinc?.id === x.id || (!p.sinc && primeiro && x.nome.toLowerCase().startsWith(primeiro)) ? 'selected' : ''}>${esc(x.nome)}${x.conv ? ' (convidado)' : ''}</option>`).join('');
    pronto = true;
  };
  sl.onchange = carregar; await carregar();
  return () => {
    if (sl.value === '-') return null;
    if (!pronto) return undefined;
    const x = lista.find((y) => y.id === sj.value);
    return x ? { liga: sl.value || null, id: x.id, nome: x.nome, foto: x.foto } : undefined;
  };
}

// 🧑‍🤝‍🧑 Jogadores desta liga (admin): apagar (por engano) e sincronizar com o mesmo jogador noutra liga — p. ex. o Alex é fixo aqui e
// convidado na Futebolada semanal. Sincronizado = a mesma pessoa no "Todas as ligas" e nas estatísticas globais; a foto copia-se
// de lá. A carta e os votos continuam a ser de cada liga.
async function gerirJogadores(el, liga, { esc, toast, refazer }) {
  const [players, membros, ligas] = await Promise.all([DB.listPlayers(), DB.listMembros(liga).catch(() => []), asMinhasLigas()]);
  const outras = ligas.filter((l) => (l.id || null) !== (liga || null));
  const nomeL = (id) => ligas.find((l) => (l.id || null) === (id || null))?.nome || LIGA_PRINCIPAL.nome;
  el.insertAdjacentHTML('beforeend', `<section class="cartao" id="gj"><h3>🧑‍🤝‍🧑 Jogadores desta liga</h3>
    <p class="mute">🔗 Sincronizar: é o mesmo jogador noutra liga (fica junto nas estatísticas de todas as ligas; a foto vem de lá). 🗑 Apagar: só para enganos — os jogos já registados ficam.</p>
    ${[...players].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt')).map((p) => `<div class="opcao linha" style="justify-content:space-between;align-items:center;gap:6px">
      <div style="min-width:0"><b>${esc(p.nome || '?')}</b>${p.sinc ? ` <small class="mute">🔗 ${esc(nomeL(p.sinc.liga))}: ${esc(p.sinc.nome || '')}</small>` : ''}${membros.some((m) => m.player === p.id) ? ' <small title="Tem conta">🔐</small>' : ''}</div>
      <div class="linha" style="gap:4px;flex:none">${outras.length ? `<button class="peq" data-sinc="${esc(p.id)}" title="Sincronizar com outra liga">🔗</button>` : ''}<button class="peq perigo" data-apagar="${esc(p.id)}" title="Apagar">🗑</button></div></div>
      <div data-caixa="${esc(p.id)}"></div>`).join('')}
  </section>`);
  const sec = el.querySelector('#gj');
  sec.querySelectorAll('[data-apagar]').forEach((b) => (b.onclick = async () => {
    const p = players.find((x) => x.id === b.dataset.apagar);
    if (!confirm(`Apagar ${p?.nome || 'este jogador'} desta liga? Os jogos já registados ficam; os votos nele deixam de contar.`)) return;
    try {
      for (const m of membros.filter((x) => x.player === p.id)) await DB.tirarMembro(liga, m.uid).catch(() => {});
      await DB.deletePlayer(p.id); toast('Apagado ✔'); refazer();
    } catch (e) { console.error(e); toast('Não deu para apagar'); }
  }));
  sec.querySelectorAll('[data-sinc]').forEach((b) => (b.onclick = async () => {
    const p = players.find((x) => x.id === b.dataset.sinc);
    const caixa = [...sec.querySelectorAll('[data-caixa]')].find((x) => x.dataset.caixa === p.id);
    caixa.innerHTML = `<div class="opcao"><label>Liga</label><select class="s-liga">${outras.map((l) => `<option value="${esc(l.id ?? '')}">${esc(l.nome || LIGA_PRINCIPAL.nome)}</option>`).join('')}</select>
      <label>É este jogador</label><select class="s-jog"><option>a carregar…</option></select>
      <div class="linha" style="margin-top:6px"><button class="peq prim s-ok">Sincronizar</button>${p.sinc ? '<button class="peq s-tirar">Tirar sincronização</button>' : ''}</div></div>`;
    let lista = [];
    const carregar = async () => {
      lista = await jogadoresDaLiga(caixa.querySelector('.s-liga').value || null);
      const primeiro = (p.nome || '').toLowerCase().split(' ')[0];
      caixa.querySelector('.s-jog').innerHTML = lista.map((x) => `<option value="${esc(x.id)}" ${primeiro && x.nome.toLowerCase().startsWith(primeiro) ? 'selected' : ''}>${esc(x.nome)}${x.conv ? ' (convidado)' : ''}</option>`).join('');
    };
    caixa.querySelector('.s-liga').onchange = carregar; await carregar();
    caixa.querySelector('.s-ok').onclick = async () => {
      const lid = caixa.querySelector('.s-liga').value || null, alvo = lista.find((x) => x.id === caixa.querySelector('.s-jog').value);
      if (!alvo) return toast('Escolhe o jogador');
      const { id: _, ...resto } = p;
      try {
        await DB.savePlayer({ ...resto, id: p.id, sinc: { liga: lid, id: alvo.id, nome: alvo.nome }, ...(alvo.foto && !p.foto ? { foto: alvo.foto } : {}) });
        toast('Sincronizado ✔'); refazer();
      } catch (e) { console.error(e); toast('Não deu para sincronizar'); }
    };
    caixa.querySelector('.s-tirar')?.addEventListener('click', async () => { const { id: _, sinc, ...resto } = p; await DB.savePlayer({ ...resto, id: p.id }); toast('Feito ✔'); refazer(); });
  }));
}

// 👥 Importar jogador de outra liga (admin da liga): uma pessoa com conta passa a ser este jogador da liga — a foto e o nome
// vêm do perfil dela, a liga aparece-lhe na lista; a carta e os votos são desta liga. Serve também para ligar um jogador já criado.
async function importarJogadores(el, liga, { esc, toast, refazer }) {
  const [pessoas, players, membros] = await Promise.all([DB.pessoasComConta(), DB.listPlayers(), DB.listMembros(liga).catch(() => [])]);
  const jaCa = new Set(membros.map((m) => m.uid)), ligados = new Set(membros.map((m) => m.player));
  const livres = pessoas.filter((p) => !jaCa.has(p.uid));
  el.insertAdjacentHTML('beforeend', `<section class="cartao"><h3>👥 Importar jogador de outra liga</h3>
    <p class="mute">Para quem já tem conta (p. ex. na Futebolada semanal): fica a mesma pessoa, com a foto e o nome do perfil dela. A carta e as votações são desta liga.</p>
    ${livres.length ? `<label>Pessoa</label><select id="imp-pessoa">${livres.map((p) => `<option value="${esc(p.uid)}">${esc(p.nome)}</option>`).join('')}</select>
      <label>É qual jogador desta liga?</label><select id="imp-jog"><option value="">➕ Novo jogador</option>${players.filter((p) => !ligados.has(p.id)).map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select>
      <button class="prim peq" id="imp-ok" style="margin-top:8px">Importar</button>` : '<p class="mute">Não há mais ninguém com conta para importar.</p>'}
  </section>`);
  document.getElementById('imp-ok')?.addEventListener('click', async () => {
    const uid = document.getElementById('imp-pessoa').value, player = document.getElementById('imp-jog').value || null;
    const p = livres.find((x) => x.uid === uid);
    try { await DB.importarPessoa(liga, uid, { player, nome: p?.nome }); toast(`${p?.nome || 'Jogador'} importado ✔`); refazer(); }
    catch (e) { console.error(e); toast('Não deu para importar'); }
  });
}

// O Rui (admin global) vê quantas ligas cada pessoa criou e pode dar mais.
async function autorizacoes(db, el, { esc, toast, refazer }) {
  const [contas, aut, players, ligas] = await Promise.all([db.listContas(), db.listAutorizados(), db.listPlayers(), db.todasLigas()]);
  const nome = (uid) => { const c = contas.find((x) => x.id === uid); return players.find((p) => p.id === c?.player)?.nome || c?.email || aut.find((x) => x.id === uid)?.nome || uid.slice(0, 6) + '…'; };
  el.innerHTML = `<section class="cartao"><h3>🌍 Todas as ligas <small class="mute">(só tu vês — admin global)</small></h3>
    ${ligas.length ? ligas.map((l) => `<div class="opcao"><b>${esc(l.nome || l.id)}</b> <small class="mute">criada por ${esc(nome(l.criador || ''))}${l.publico ? ' · pública' : ' · privada'}</small></div>`).join('') : '<p class="mute">Ainda não há outras ligas.</p>'}
    <h4>Ligas criadas por pessoa</h4><p class="mute">Qualquer pessoa com conta Google pode criar até 2. Podes dar mais a quem precisar.</p>
    ${aut.length ? aut.map((a) => `<div class="opcao linha" style="justify-content:space-between;align-items:center"><div><b>${esc(nome(a.id))}</b> <small class="mute">${a.criadas || 0}/${a.max} criadas</small></div>
      <button class="peq" data-mais="${esc(a.id)}">+1 liga</button></div>`).join('') : '<p class="mute">Ninguém criou ligas ainda.</p>'}</section>`;
  el.querySelectorAll('[data-mais]').forEach((b) => (b.onclick = async () => { const a = aut.find((x) => x.id === b.dataset.mais); await naLiga(null, (db) => db.autorizar(a.id, a.nome, (a.max || 2) + 1)); toast('Feito ✔'); refazer(); }));
}

// ⌚ O relógio do Rui liga-se sozinho às ligas dele com a chave do relógio (a do Admin → Relógio). Aqui só se veem os relógios.
async function relogios(el, { esc, toast }) {
  const L = await naLiga(null, (db) => db.listRelogios()).catch(() => []);
  el.innerHTML = `<p class="mute">O teu relógio liga-se sozinho às tuas ligas com a chave do relógio (🔧 Administração → Relógio): vê as equipas do próximo jogo de qualquer liga e guarda lá o jogo.</p>
    ${L.length ? L.map((r) => `<div class="opcao linha" style="justify-content:space-between;align-items:center"><div>⌚ Relógio ${esc(r.id.slice(0, 6))}… <small class="mute">desde ${esc(new Date(r.ts || 0).toLocaleDateString('pt-PT'))}</small></div>
      <button class="peq perigo" data-desrel="${esc(r.id)}">Desligar</button></div>`).join('') : ''}`;
  el.querySelectorAll('[data-desrel]').forEach((b) => (b.onclick = async () => { if (!confirm('Desligar este relógio? Volta a ligar-se se ainda tiver a chave — para o cortar de vez, muda a chave no Admin.')) return; await naLiga(null, (db) => db.desligarRelogio(b.dataset.desrel)); relogios(el, { esc, toast }); }));
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
