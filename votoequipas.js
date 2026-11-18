// 🗳 Votação das equipas (Rui, 18/11): o moderador abre o jogo e gera as 3 opções; cada convocado (com sessão iniciada)
// vota numa até ao prazo; depois fica escolhida a mais votada e, em empate, a mais equilibrada (e a primeira, se ainda empatar).
// Os votos ficam em votosEquipas/{chave}_{jogador} = { chave, votante, k, so, ts } — chave = opcoesTs do jogo ao vivo
// (gerar outras opções muda a chave e os votos antigos deixam de contar). so = 'B' | 'P' | null: «só tenho camisola desta cor»
// (só nos jogos do próprio dia), para os moderadores refazerem as equipas se for preciso.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DIA = 86400000;
const meiaNoite = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getTime(); };
const diaDe = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const hora = (dia, h, m = 0) => { const d = new Date(dia); d.setHours(h, m, 59 * (m === 59), 0); return d.getTime(); };

// Prazo da votação pela hora a que o jogo foi aberto e o dia do jogo (hora de Portugal, a do telemóvel):
//  · aberto antes da véspera → véspera às 21:00;
//  · aberto na véspera → 21:00, ou 23:59 se foi aberto a partir das 19:00;
//  · aberto no próprio dia → 15:00 (aberto depois das 15:00: fica 1 hora aberta);
//  · aberto depois do dia do jogo → sem votação (prazo = abertura).
export function prazoVotacao(abertoTs, diaJogo) {
  if (!abertoTs || !diaJogo) return null;
  const jogo = meiaNoite(diaJogo), vespera = jogo - DIA, aberto = diaDe(abertoTs);
  if (aberto < vespera) return hora(vespera, 21);
  if (aberto === vespera) return new Date(abertoTs).getHours() >= 19 ? hora(vespera, 23, 59) : hora(vespera, 21);
  if (aberto === jogo) return Math.max(hora(jogo, 15), abertoTs + 3600e3);
  return abertoTs;
}

// Contagem e vencedora: mais votos; empate → menor diferença de overall; ainda empate → a primeira.
export function contarVotos(opcoes, votos) {
  const n = (opcoes || []).map(() => 0);
  for (const v of votos || []) if (Number.isInteger(v.k) && v.k >= 0 && v.k < n.length) n[v.k]++;
  return n;
}
export function vencedora(opcoes, votos) {
  const n = contarVotos(opcoes, votos);
  const dif = (o) => Math.abs((o.ovA ?? 0) - (o.ovB ?? 0));
  return (opcoes || []).map((o, k) => k).sort((a, b) => n[b] - n[a] || dif(opcoes[a]) - dif(opcoes[b]) || a - b)[0] ?? null;
}

// Condicionantes que quem abriu o jogo usou (separar, juntar, cor, só baliza), em texto, para todos verem antes de votar.
export function textoRestr(restr, nome) {
  let R = restr; try { if (typeof R === 'string') R = R ? JSON.parse(R) : null; } catch { R = null; }
  if (!R) return [];
  const L = [];
  for (const [a, b] of R.separar || []) L.push(`↔️ ${nome(a)} e ${nome(b)} em equipas diferentes`);
  for (const g of R.juntar || []) if (g.length > 1) L.push(`🤝 ${g.map(nome).join(', ')} na mesma equipa`);
  for (const [id, c] of Object.entries(R.cor || {})) L.push(`👕 ${nome(id)} joga de ${c === 'B' ? '⚪ branco' : '⚫ preto'}`);
  for (const [id, gr] of Object.entries(R.gr || {})) if (gr) L.push(`🧤 ${nome(id)} fica na baliza o jogo todo`);
  return L;
}

const doisDig = (n) => String(n).padStart(2, '0');
export function faltaTexto(ms) {
  if (ms <= 0) return 'fechada';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d ? `${d} d ` : ''}${doisDig(h)}:${doisDig(m)}:${doisDig(s % 60)}`;
}
// Relógio a contar para trás em todos os [data-prazo] de el; quando chega a 0 chama aoFechar (uma vez).
export function ligarContagem(el, aoFechar) {
  let fechou = false;
  const tic = () => {
    const els = el.querySelectorAll('[data-prazo]');
    if (!els.length) return clearInterval(t);
    for (const x of els) {
      const falta = Number(x.dataset.prazo) - Date.now();
      x.textContent = faltaTexto(falta);
      if (falta <= 0 && !fechou) { fechou = true; aoFechar?.(); }
    }
  };
  const t = setInterval(tic, 1000); tic();
  return () => clearInterval(t);
}

// Cartão da votação (Início e 🛡 Moderador). v = jogo ao vivo; votos = votos desta chave; eu = o meu jogador (ou null);
// nome(id) → nome a mostrar. Quem não é convocado ou não entrou vê as opções e a contagem, sem botões.
export function htmlVotacao(v, votos, eu, nome, { moderador = false } = {}) {
  const opcoes = v.opcoes || [], n = contarVotos(opcoes, votos), prazo = v.prazo || 0;
  const aberta = Date.now() < prazo, convocado = !!eu && (v.sel || []).includes(eu.id);
  const meu = eu && votos.find((x) => x.votante === eu.id);
  const mesmoDia = v.data && diaDe(v.ts || 0) === meiaNoite(v.data);
  const lista = (ids) => ids.map((id) => esc(nome(id))).join(', ');
  const cond = textoRestr(v.restr, nome);
  const camisolas = votos.filter((x) => x.so);
  return `<section class="cartao votacao"><div class="cartao-tit">🗳 Escolhe as equipas — jogo de ${esc(v.data || '')}</div>
    <p class="mute" style="margin:0 0 6px">${aberta ? `A votação fecha daqui a <b data-prazo="${prazo}">${faltaTexto(prazo - Date.now())}</b>` : '<b>Votação fechada.</b> Fica a mais votada (em empate, a mais equilibrada).'}
      · votam os ${(v.sel || []).length} convocados, com sessão iniciada.</p>
    ${cond.length ? `<details class="mute" style="margin:0 0 8px"><summary>Condicionantes de quem abriu o jogo (${cond.length})</summary>${cond.map((c) => `<div>${c}</div>`).join('')}</details>` : ''}
    ${opcoes.map((o, k) => `<div class="opcao ${meu?.k === k ? 'on' : ''}"><b>Opção ${k + 1}</b> <span class="mute">· ⚪ ${Math.round(o.ovA ?? 0)} vs ⚫ ${Math.round(o.ovB ?? 0)} · ${n[k]} voto${n[k] === 1 ? '' : 's'}</span>
      <div>⚪ ${lista(o.A || [])}</div><div>⚫ ${lista(o.B || [])}</div>
      ${aberta && convocado ? `<button class="peq ${meu?.k === k ? 'prim' : ''}" data-voto-eq="${k}">${meu?.k === k ? '✅ O meu voto' : 'Votar nesta'}</button>` : ''}</div>`).join('')}
    ${aberta && !eu ? '<p class="mute">Entra no teu perfil (👤 Eu) para votar.</p>' : ''}
    ${aberta && eu && !convocado ? '<p class="mute">Só os convocados para este jogo votam.</p>' : ''}
    ${aberta && convocado && mesmoDia ? `<div class="linha" style="margin-top:6px"><span class="mute">Só tenho camisola:</span>
      <button class="peq ${meu?.so === 'B' ? 'on' : ''}" data-so="B">⚪</button><button class="peq ${meu?.so === 'P' ? 'on' : ''}" data-so="P">⚫</button>
      <button class="peq ${meu?.so ? '' : 'on'}" data-so="">Tenho as duas</button></div>` : ''}
    ${moderador && camisolas.length ? `<p><b>⚠️ Camisolas:</b> ${camisolas.map((x) => `${esc(nome(x.votante))} só tem ${x.so === 'B' ? '⚪' : '⚫'}`).join(' · ')}. Vê se é preciso refazer as equipas.</p>` : ''}
  </section>`;
}
