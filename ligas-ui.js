// Ecrãs das ligas e épocas (29/10/2026, pedido do Rui; decisões em LIGAS.md).
//  #ligas        — as minhas ligas (mudar de liga), criar liga (autorizados), estatísticas globais + por liga e época,
//                  gestão da liga (admin: convite, pedidos, jogadores) e, para o Rui, quem pode criar ligas.
//  #entrar=<id>  — link de convite: pedir para entrar numa liga (com a conta Google).
// A liga ativa guarda-se no telemóvel (localStorage 'liga'); null = a principal.
import { DB, novoToken } from './db.js?v=35';
import { historico } from './conquistas.js?v=3';
import { LIGA_PRINCIPAL, tituloLiga, epocaAtual, epocaDoJogo, nomeEpoca, idLiga, MAX_LIGAS_EXTRA } from './ligas.js?v=1';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
export const ligaGuardada = () => lsGet('liga') || null;

// Muda de liga: guarda, limpa o "quem sou eu" desta liga e recarrega a app nessa liga.
export function mudarLiga(id) {
  lsSet('liga', id || null);
  lsSet('meu-perfil', null);   // o jogador é outro em cada liga; volta a saber-se pela conta Google
  location.hash = '#';
  location.reload();
}

// Estatísticas de uma pessoa numa liga, por época: { ep: { j, v, e, d, g, a } }.
async function statsNaLiga(ligaId, player) {
  const antes = DB.ligaAtual();
  DB.usarLiga(ligaId);
  try {
    const jogos = (await DB.listJogosPub()).map((r) => ({ ...JSON.parse(r.json || '{}'), _id: r.id })).filter((j) => j.fase === 'fim');
    const out = {};
    for (const { j, l } of historico(jogos, player)) {
      const s = (out[epocaDoJogo(j)] ||= { j: 0, v: 0, e: 0, d: 0, g: 0, a: 0 });
      s.j++; s[l.res === 'V' ? 'v' : l.res === 'E' ? 'e' : 'd']++; s.g += l.g; s.a += l.a;
    }
    return out;
  } catch (e) { console.error(e); return {}; } finally { DB.usarLiga(antes); }
}

export async function paginaLigas($app, { esc, toast, titulo }) {
  titulo('Ligas');
  const u = await DB.user();
  const atual = ligaGuardada();
  if (!u) {
    $app.innerHTML = `<div class="cartao"><h3>🏆 Ligas</h3><p>Estás na <b>${esc(LIGA_PRINCIPAL.nome)} ${nomeEpoca(epocaAtual())}</b>.</p>
      <p class="mute">Para veres as tuas ligas, criares uma ou entrares noutra, liga primeiro o teu perfil à conta Google
      (👤 Eu → ⚙️ → Os meus dados → Ligar ao Google) ou entra com o Google.</p>
      <button class="prim" id="lg-google">🔐 Entrar com o Google</button></div>`;
    document.getElementById('lg-google').onclick = async () => { try { await DB.entrarGoogle(); paginaLigas($app, { esc, toast, titulo }); } catch (e) { console.error(e); toast('Não deu para entrar com o Google'); } };
    return;
  }
  $app.innerHTML = '<p class="mute">A carregar as tuas ligas…</p>';
  DB.usarLiga(null);
  const [ligas, limite, souRui] = await Promise.all([DB.minhasLigas(), DB.meuLimite(), DB.isAdmin(u)]);
  DB.usarLiga(atual);
  if (!ligas.some((l) => l.id == null)) ligas.unshift({ id: null, principal: true, player: null });
  const nomeL = (l) => (l.id == null ? LIGA_PRINCIPAL.nome : l.nome || l.id);
  const ep = epocaAtual();

  // Estatísticas: por liga e época + o total global.
  const porLiga = [];   // uma liga de cada vez (o DB só tem uma liga ativa)
  for (const l of ligas.filter((x) => x.player)) porLiga.push({ l, s: await statsNaLiga(l.id, l.player) });
  const tot = { j: 0, v: 0, e: 0, d: 0, g: 0, a: 0 };
  const linhas = [];
  for (const { l, s } of porLiga) for (const [e, x] of Object.entries(s).sort().reverse()) {
    for (const k in tot) tot[k] += x[k];
    linhas.push(`<tr><td>${esc(nomeL(l))}</td><td>${esc(nomeEpoca(e))}</td><td>${x.j}</td><td>${x.v}-${x.e}-${x.d}</td><td>${x.g}</td><td>${x.a}</td></tr>`);
  }
  const extras = ligas.filter((l) => l.id && l.admin && l.criador === u.uid).length;
  const podeCriar = limite && (limite.criadas || 0) < (limite.max || 0);

  $app.innerHTML = `
    <section class="cartao"><h3>🏆 As minhas ligas</h3>
      ${ligas.map((l) => `<div class="opcao linha" style="justify-content:space-between;align-items:center">
        <div><b>${esc(nomeL(l))}</b> <small class="mute">${esc(nomeEpoca(ep))}</small>${l.admin || (l.id == null && souRui) ? ' <span class="tag">admin</span>' : ''}
          ${l.player ? '' : '<div class="mute" style="font-size:12px">Ainda sem perfil ligado nesta liga</div>'}</div>
        ${(l.id || null) === atual ? '<span class="tag">✔ ativa</span>' : `<button class="peq prim" data-liga="${esc(l.id ?? '')}">Abrir</button>`}</div>`).join('')}
    </section>
    <section class="cartao"><h3>📊 As minhas estatísticas</h3>
      ${linhas.length ? `<div style="overflow-x:auto"><table class="tab"><tr><th>Liga</th><th>Época</th><th>J</th><th>V-E-D</th><th>⚽</th><th>🎯</th></tr>${linhas.join('')}
        <tr><td colspan="2"><b>Total</b></td><td><b>${tot.j}</b></td><td><b>${tot.v}-${tot.e}-${tot.d}</b></td><td><b>${tot.g}</b></td><td><b>${tot.a}</b></td></tr></table></div>`
        : '<p class="mute">Ainda sem jogos nas tuas ligas.</p>'}
    </section>
    <section class="cartao"><h3>➕ Criar uma liga</h3>
      ${podeCriar ? `<p class="mute">Ficas administrador: tens os teus jogadores, a tua votação, equipas e resultados. Podes criar mais ${limite.max - (limite.criadas || 0)}.</p>
        <label>Nome da liga</label><input id="lg-nome" maxlength="60" placeholder="ex.: Futebol de segunda">
        <label>O teu nome nessa liga</label><input id="lg-eu" maxlength="30" value="${esc(u.displayName || '')}">
        <button class="prim" id="lg-criar" style="margin-top:8px">Criar liga</button>`
        : `<p class="mute">${limite ? `Já criaste ${limite.criadas} liga(s), o máximo (${MAX_LIGAS_EXTRA} além da principal).` : 'Só o Rui autoriza quem pode criar ligas. Pede-lhe.'}</p>`}
    </section>
    <div id="lg-gestao"></div><div id="lg-rui"></div>`;

  $app.querySelectorAll('[data-liga]').forEach((b) => (b.onclick = () => mudarLiga(b.dataset.liga || null)));
  document.getElementById('lg-criar')?.addEventListener('click', async (e) => {
    const nome = document.getElementById('lg-nome').value.trim(), meuNome = document.getElementById('lg-eu').value.trim();
    if (!nome) return toast('Dá um nome à liga');
    e.target.disabled = true;
    try { const r = await DB.criarLiga(idLiga(nome), { nome, meuNome }); toast('Liga criada ✔'); mudarLiga(r.id); }
    catch (err) { console.error(err); e.target.disabled = false; toast(err.message || 'Não deu para criar a liga'); }
  });

  // Gestão da liga ativa (só o admin de uma liga extra): convite, pedidos, jogadores.
  const ativa = ligas.find((l) => (l.id || null) === atual);
  if (atual && ativa?.admin) gestaoLiga(document.getElementById('lg-gestao'), ativa, { esc, toast, refazer: () => paginaLigas($app, { esc, toast, titulo }) });
  // O Rui: quem pode criar ligas.
  if (souRui && !atual) autorizacoes(document.getElementById('lg-rui'), { esc, toast, refazer: () => paginaLigas($app, { esc, toast, titulo }) });
  void extras;
}

async function gestaoLiga(el, liga, { esc, toast, refazer }) {
  const [pedidos, membros, players] = await Promise.all([DB.listPedidos(liga.id), DB.listMembros(liga.id), DB.listPlayers()]);
  const link = `${location.origin}${location.pathname}#entrar=${encodeURIComponent(liga.id)}`;
  const nomeP = (id) => players.find((p) => p.id === id)?.nome || '?';
  const livres = players.filter((p) => !membros.some((m) => m.player === p.id));
  el.innerHTML = `<section class="cartao"><h3>⚙️ Gerir “${esc(liga.nome)}”</h3>
    <p class="mute">Equipas, resultados e votação desta liga fazem-se como na principal (🔧 Administração e 🗳 Votar), com a liga aberta.</p>
    <b>🔗 Convite</b><div class="linha"><input id="lg-link" readonly value="${esc(link)}"><button class="peq" id="lg-copiar">Copiar</button></div>
    <p class="mute" style="font-size:12px">Quem abrir o link entra com o Google e pede para entrar; tu aprovas aqui.</p>
    <b>📨 Pedidos</b>${pedidos.length ? pedidos.map((p) => `<div class="opcao"><b>${esc(p.nome || p.email || p.uid)}</b> <small class="mute">${esc(p.email || '')}</small>
      <div class="linha" style="margin-top:6px"><select data-ped="${esc(p.uid)}"><option value="">➕ Novo jogador “${esc(p.nome || 'sem nome')}”</option>
        ${livres.map((x) => `<option value="${esc(x.id)}">É o ${esc(x.nome)}</option>`).join('')}</select>
        <button class="peq prim" data-aprovar="${esc(p.uid)}">Aprovar</button><button class="peq perigo" data-recusar="${esc(p.uid)}">Recusar</button></div></div>`).join('') : '<p class="mute">Sem pedidos.</p>'}
    <b>👥 Jogadores</b> <small class="mute">(${players.length})</small>
    <div class="chips">${players.map((p) => `<span class="chip">${esc(p.nome)}${membros.some((m) => m.player === p.id) ? ' 🔐' : ''}</span>`).join('')}</div>
    <div class="linha" style="margin-top:6px"><input id="lg-novo" maxlength="30" placeholder="Nome do jogador (sem conta)"><button class="peq" id="lg-add">Adicionar</button></div>
    <p class="mute" style="font-size:12px">🔐 = tem conta Google ligada. Podes adicionar jogadores sem conta (só tu votas e registas os jogos deles).</p>
    ${membros.length ? `<details><summary>Contas ligadas (${membros.length})</summary>${membros.map((m) => `<div>${esc(nomeP(m.player))} ${m.uid === liga.criador ? '<span class="tag">criador</span>' : `<button class="peq perigo" data-tirar="${esc(m.uid)}">Tirar</button>`}</div>`).join('')}</details>` : ''}
  </section>`;
  document.getElementById('lg-copiar').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado ✔'); } catch { document.getElementById('lg-link').select(); } };
  document.getElementById('lg-add').onclick = async () => {
    const nome = document.getElementById('lg-novo').value.trim();
    if (!nome) return toast('Escreve o nome');
    await DB.savePlayer({ nome, ativo: true }); toast('Adicionado ✔'); refazer();
  };
  el.querySelectorAll('[data-aprovar]').forEach((b) => (b.onclick = async () => {
    const uid = b.dataset.aprovar, p = pedidos.find((x) => x.uid === uid);
    let player = el.querySelector(`[data-ped="${CSS.escape(uid)}"]`).value;
    try {
      if (!player) player = await DB.savePlayer({ nome: p.nome || 'Jogador', ativo: true });
      await DB.aprovarPedido(liga.id, uid, player); toast('Aprovado ✔'); refazer();
    } catch (e) { console.error(e); toast('Não deu para aprovar'); }
  }));
  el.querySelectorAll('[data-recusar]').forEach((b) => (b.onclick = async () => { await DB.recusarPedido(liga.id, b.dataset.recusar); refazer(); }));
  el.querySelectorAll('[data-tirar]').forEach((b) => (b.onclick = async () => { if (!confirm('Tirar esta conta da liga? O jogador e os jogos ficam.')) return; await DB.tirarMembro(liga.id, b.dataset.tirar); refazer(); }));
}

// O Rui escolhe quem pode criar ligas (entre quem já ligou a conta Google na liga principal), até 2 cada.
async function autorizacoes(el, { esc, toast, refazer }) {
  const [contas, aut, players] = await Promise.all([DB.listContas(), DB.listAutorizados(), DB.listPlayers()]);
  const nome = (c) => players.find((p) => p.id === c.player)?.nome || c.email || c.id;
  el.innerHTML = `<section class="cartao"><h3>🔑 Quem pode criar ligas</h3>
    <p class="mute">Só aparecem jogadores com a conta Google ligada. Cada autorizado cria no máximo ${MAX_LIGAS_EXTRA} ligas além da principal.</p>
    ${contas.length ? contas.map((c) => { const a = aut.find((x) => x.id === c.id);
      return `<div class="opcao linha" style="justify-content:space-between;align-items:center"><div><b>${esc(nome(c))}</b>${a ? ` <small class="mute">${a.criadas || 0}/${a.max} criadas</small>` : ''}</div>
        ${a ? `<button class="peq perigo" data-desaut="${esc(c.id)}">Tirar autorização</button>` : `<button class="peq prim" data-aut="${esc(c.id)}">Autorizar</button>`}</div>`; }).join('')
      : '<p class="mute">Ainda ninguém ligou a conta Google.</p>'}</section>`;
  el.querySelectorAll('[data-aut]').forEach((b) => (b.onclick = async () => { const c = contas.find((x) => x.id === b.dataset.aut); await DB.autorizar(c.id, nome(c), MAX_LIGAS_EXTRA); toast('Autorizado ✔'); refazer(); }));
  el.querySelectorAll('[data-desaut]').forEach((b) => (b.onclick = async () => { await DB.desautorizar(b.dataset.desaut); refazer(); }));
}

// Link de convite: #entrar=<id da liga>.
export async function paginaEntrar($app, id, { esc, toast, titulo }) {
  titulo('Entrar numa liga');
  const liga = await DB.getLiga(id).catch(() => null);
  if (!liga) { $app.innerHTML = `<div class="cartao"><p>Esta liga não existe (ou o link está errado).</p></div>`; return; }
  const u = await DB.user();
  const m = u ? await (async () => { const a = DB.ligaAtual(); DB.usarLiga(id); try { return await DB.minhaConta(); } finally { DB.usarLiga(a); } })() : null;
  if (m) { $app.innerHTML = `<div class="cartao"><h3>🏆 ${esc(liga.nome)}</h3><p>Já és membro desta liga.</p><button class="prim" id="ent-abrir">Abrir a liga</button></div>`; document.getElementById('ent-abrir').onclick = () => mudarLiga(id); return; }
  $app.innerHTML = `<div class="cartao"><h3>🏆 ${esc(liga.nome)}</h3>
    <p>Foste convidado para esta liga. Entra com a tua conta Google e pede para entrar; o administrador aprova.</p>
    <label>O teu nome</label><input id="ent-nome" maxlength="40" value="${esc(u?.displayName || '')}">
    <button class="prim" id="ent-pedir" style="margin-top:8px">${u ? 'Pedir para entrar' : '🔐 Entrar com o Google e pedir'}</button></div>`;
  document.getElementById('ent-pedir').onclick = async () => {
    try {
      if (!(await DB.user())) await DB.entrarGoogle();
      await DB.pedirEntrada(id, document.getElementById('ent-nome').value.trim());
      $app.innerHTML = `<div class="cartao"><h3>📨 Pedido enviado</h3><p>Quando o administrador de “${esc(liga.nome)}” aprovar, a liga aparece em ⚙️ → 🏆 Ligas.</p></div>`;
    } catch (e) { console.error(e); toast(e.message || 'Não deu para pedir'); }
  };
}
export { tituloLiga, novoToken };
