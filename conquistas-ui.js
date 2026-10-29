// Ecrãs das conquistas e do físico (sessão equipas/golos). Os cálculos são do conquistas.js e do fisico.js (sessão
// desenvolvimento); aqui só se desenha: destaques do jogo (Match DNA), medalhas, desafios, recordes, tendências,
// resumo físico do jogo (velocidade, zonas, sprints), heatmap no campo e o cartão partilhável (imagem).
import { dnaJogo, recordes, tendencias, sentidoEpoca, dadosCartao, medalhas, epocaDe } from './conquistas.js?v=3';
import { textoDesafio, avaliarDesafios, desafiosMesDeGames, progressoMes, desafiosCumpridosJogos, desafiosMesCumpridos } from './desafios.js?v=2';
import { ZONAS_VEL, LIM_KMH, tercos } from './fisico.js?v=2';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pt = (v, d = 1) => (v == null ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('pt-PT'));
const diaPT = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('/') : d || '');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const minuto = (t) => `${Math.floor((t || 0) / 60000) + 1}'`;

// A lista de jogos no formato que o conquistas.js espera (objeto do jogo com o id do documento).
export const jogosDe = (res) => res.map((r) => ({ ...r.jogo, id: r.jogo.gameId || r.id }));
export const idJogo = (j) => j.gameId || j.id || String(j.inicioEpoch);

// ---------- Destaques do jogo (Match DNA) ----------
// Para todos: só frases públicas. O próprio (eu) vê também as do relógio e do pé, se tiver fis.
export function htmlDNAJogo(j, jogos, quem, { eu = null, fisEu = null, fisAntes = [] } = {}) {
  const ids = [...(j.brancos || []), ...(j.pretos || [])].map((x) => x.id);
  const linhas = ids.map((pid) => {
    const proprio = pid === eu;
    const f = dnaJogo(j, pid, jogos, { publico: !proprio, fis: proprio ? fisEu : null, fisAntes: proprio ? fisAntes : [] });
    return f.length ? { pid, f, eq: (j.brancos || []).some((x) => x.id === pid) ? 'B' : 'P', proprio } : null;
  }).filter(Boolean).sort((a, b) => (b.proprio - a.proprio) || (b.f[0].peso - a.f[0].peso));
  if (!linhas.length) return '';
  const nome = (pid) => esc(quem[pid]?.nomeJogo || quem[pid]?.nome || '?');
  return `<section class="cartao"><div class="cartao-tit">🧬 Destaques do jogo</div><ul class="dna">
    ${linhas.map((l) => `<li class="${l.proprio ? 'eu' : ''}"><a class="lnk-j" href="#jogador=${esc(l.pid)}"><span class="dna-eq ${l.eq === 'B' ? 'b' : 'p'}"></span>${nome(l.pid)}${l.proprio ? ' <span class="tag">tu</span>' : ''}</a>
      ${l.f.map((x) => `<p>${esc(x.txt)}${x.priv ? ' <span class="tag" title="Só tu vês">🔒</span>' : ''}</p>`).join('')}</li>`).join('')}</ul></section>`;
}

// ---------- O meu físico neste jogo (só o próprio, com relógio) ----------
export function htmlFisicoJogo(fis, j) {
  if (!fis) return '';
  const dur = Math.max(1, (j.fimEpoch && j.inicioEpoch ? j.fimEpoch - j.inicioEpoch - (j.pausaTotal || 0) : 0), ...(fis.sprints || []).map((s) => s.t + (s.dur || 0)));
  const zs = fis.zonas || [], tot = zs.reduce((s, z) => s + z[0], 0) || 1;
  const lim = ['< ' + LIM_KMH[0], `${LIM_KMH[0]}–${LIM_KMH[1]}`, `${LIM_KMH[1]}–${LIM_KMH[2]}`, `${LIM_KMH[2]}–${LIM_KMH[3]}`, '> ' + LIM_KMH[3]];
  const barra = zs.map((z, i) => `<i class="z${i}" style="width:${(z[0] / tot) * 100}%" title="${ZONAS_VEL[i]}: ${Math.round(z[0] / 60)} min"></i>`).join('');
  const tl = (fis.sprints || []).map((s) => `<i class="sp" style="left:${Math.min(99, (s.t / dur) * 100)}%" title="${minuto(s.t)} · ${pt(s.kmh)} km/h · ${Math.round(s.m)} m"></i>`).join('')
    + (fis.vmax?.t != null ? `<i class="vm" style="left:${Math.min(99, (fis.vmax.t / dur) * 100)}%" title="Velocidade máxima"></i>` : '');
  const marcas = []; for (let k = 0; k <= dur / 60000; k += 10) marcas.push(`<span style="left:${(k * 60000 / dur) * 100}%">${k}'</span>`);
  return `<section class="cartao fis-jogo"><div class="cartao-tit">⌚ O teu jogo <span class="tag">🔒 só tu</span></div>
    <div class="fis-nums"><div><b>${pt((fis.m || 0) / 1000, 2)}</b><span>km</span></div>
      <div><b>${pt(fis.vmax?.kmh)}</b><span>km/h máx.${fis.vmax?.t != null ? ` · ${minuto(fis.vmax.t)}` : ''}</span></div>
      <div><b>${fis.nSprints ?? 0}</b><span>sprints · ${Math.round(fis.mSprint || 0)} m</span></div></div>
    ${zs.length ? `<div class="mute fis-leg">Zonas de velocidade (km/h)</div><div class="zbar">${barra}</div>
      <div class="zleg">${zs.map((z, i) => `<span><i class="z${i}"></i>${ZONAS_VEL[i]} <small>${lim[i]} · ${Math.round(z[0] / 60)}'</small></span>`).join('')}</div>` : ''}
    ${(fis.sprints || []).length || fis.vmax?.t != null ? `<div class="mute fis-leg">Linha do tempo: <i class="sp-ic"></i> sprint · <i class="vm-ic"></i> velocidade máxima</div>
      <div class="tline">${tl}<div class="tl-min">${marcas.join('')}</div></div>` : ''}
    ${fis.precisao === 'altura' ? '<p class="mute" style="margin:8px 0 0">Distância e velocidade estimadas pela passada (sem calibração com GPS): valores aproximados.</p>' : ''}</section>`;
}

// ---------- Heatmap 8×4 no campo vertical (x = 0 é a baliza que defende, em baixo) ----------
export function htmlHeatmap(grelha, titulo = 'Onde andaste') {
  if (!grelha) return `<section class="cartao"><div class="cartao-tit">🗺️ ${esc(titulo)}</div>
    <p class="mute" style="margin:0">Precisa do GPS no relógio. Aparece quando houver jogos gravados com GPS.</p></section>`;
  const max = Math.max(1, ...grelha.s.flat());
  // Linhas do desenho: de cima (ataque, x alto) para baixo (defesa, x = 0); colunas: largura (y).
  const cel = [];
  for (let x = grelha.nx - 1; x >= 0; x--) for (let y = 0; y < grelha.ny; y++) {
    const v = grelha.s[y]?.[x] || 0, a = v / max;
    cel.push(`<i style="background:rgba(255,${Math.round(200 - a * 170)},0,${(a * 0.85).toFixed(2)})" title="${Math.round(v / 60)} min"></i>`);
  }
  const t = grelha.orientado ? tercos(grelha) : null;
  return `<section class="cartao"><div class="cartao-tit">🗺️ ${esc(titulo)}${grelha.jogos ? ` <small class="mute">${grelha.jogos} jogo${grelha.jogos > 1 ? 's' : ''}</small>` : ''}</div>
    <div class="heat"><div class="heat-campo" style="grid-template-columns:repeat(${grelha.ny},1fr)">${cel.join('')}<span class="hm-meio"></span><span class="hm-bal cima"></span><span class="hm-bal baixo"></span></div>
      <div class="mute heat-leg">${grelha.orientado ? '⬆ ataque · a tua baliza ⬇' : 'Sem saber o lado (falta o lado de início do jogo)'}</div></div>
    ${t ? `<div class="tercos"><div><b>${t.ata}%</b><span>ataque</span></div><div><b>${t.meio}%</b><span>meio</span></div><div><b>${t.def}%</b><span>defesa</span></div></div>` : ''}</section>`;
}

// ---------- Desafios por jogo (desafios.js): antes do jogo, depois do jogo e o do mês ----------
const NIVEL = ['', 'Fácil', 'Médio', 'Difícil'];
const linhaDes = (d, est = '') => `<div class="des-j ${est}"><span class="des-ic">${est === 'feito' ? '✅' : est === 'falhou' ? '❌' : est === 'sem' ? '⏳' : d.ic}</span>
  <span class="des-txt">${esc(d.txt)}${d.rel ? ' <small title="Precisa do relógio">⌚</small>' : ''}</span><span class="des-nv n${d.nv}">${NIVEL[d.nv] || ''}</span></div>`;
// Antes do jogo (Próximo jogo): os desafios que me calharam. lista = games/{id}.desafios[eu]; nomes = games/{id}.nomes.
export function htmlDesafiosAntes(lista, nomes = {}) {
  const L = (lista || []).map((d) => textoDesafio(d, nomes)).filter(Boolean);
  return L.length ? `<section class="cartao desafios"><div class="cartao-tit">🎯 Os teus desafios <small class="mute">para este jogo</small></div>
    ${L.map((d) => linhaDes(d)).join('')}<p class="mute" style="margin:6px 0 0">Ninguém mais tem os mesmos neste jogo. Vê depois do jogo se os cumpriste.</p></section>` : '';
}
// Depois do jogo (página do jogo): ✅ / ❌ / ⏳ (sem dados, p. ex. ⌚ sem relógio). g = games/{id} deste jogo.
export function htmlDesafiosJogo(j, pid, g, { fis = null } = {}) {
  const lista = g?.desafios?.[pid];
  if (!lista?.length) return '';
  const R = avaliarDesafios(j, pid, lista, { fis, nomes: g.nomes || {} });
  // Todos os convocados (sem os ⌚, que dependem dos dados de cada um): quantos se cumpriram no jogo.
  let tot = 0, ok = 0;
  for (const [q, l] of Object.entries(g.desafios)) for (const r of avaliarDesafios(j, q, l, { nomes: g.nomes || {} })) if (r.feito != null) { tot++; if (r.feito) ok++; }
  const feitos = R.filter((r) => r.feito).length;
  return `<section class="cartao desafios"><div class="cartao-tit">🎯 Os teus desafios <small class="mute">${feitos} de ${R.length}</small></div>
    ${R.map((r) => linhaDes(r, r.feito ? 'feito' : r.feito === false ? 'falhou' : 'sem')).join('')}
    ${tot ? `<p class="mute" style="margin:6px 0 0">No jogo todo: ${ok} de ${tot} desafios cumpridos.</p>` : ''}</section>`;
}
// ---------- Separador "Conquistas" do perfil: medalhas, desafios, recordes, tendências ----------
// games = games/ (com .desafios); sem eles (ainda a carregar) não há a secção dos desafios.
export function htmlConquistas(res, pid, { proprio = false, fisPorJogo = {}, games = null } = {}) {
  const jogos = jogosDe(res);
  const fis = proprio ? fisPorJogo || {} : {};
  const temRelogio = Object.keys(fis).length > 0;
  const feitosJ = games ? desafiosCumpridosJogos(jogos, games, pid, { fisPorJogo: fis }) : [];
  const feitosM = games ? desafiosMesCumpridos(jogos, games, pid, { fisPorJogo: fis }) : [];
  const M = medalhas(jogos, pid, { fisPorJogo: fis, desafiosFeitos: games ? feitosJ.length + feitosM.length : 0 });
  const ganhas = M.filter((m) => m.nivel).length;
  const medH = `<section class="cartao"><div class="cartao-tit">🏅 Medalhas <small class="mute">${ganhas} de ${M.length}</small></div>
    <div class="medalhas">${M.map((m) => `<div class="med n${m.nivel}" title="${esc(m.txt)}">
      <div class="med-ic">${m.icone}${m.nivel ? `<span class="med-niv">${m.medalha}</span>` : ''}</div>
      <b>${esc(m.nome)}</b><small>${pt(m.valor)}${m.proximo != null ? `/${m.proximo}` : ''} ${esc(m.un)}</small>
      <div class="pbar-b"><i style="width:${m.pct}%"></i></div></div>`).join('')}</div>
    <p class="mute" style="margin:8px 0 0">🥉 🥈 🥇 três níveis por medalha. ${temRelogio ? '' : proprio ? 'As medalhas ⌚ aparecem quando o relógio enviar dados.' : ''}</p></section>`;
  let desH = '';
  if (games) {
    // Desafio do mês: o gravado nos jogos do mês (games/{id}.desafiosMes); quem ainda não o tem recebe-o no próximo jogo.
    const mes = new Date().toISOString().slice(0, 7), id = desafiosMesDeGames(games, mes)[pid];
    const d = id && progressoMes(jogos, pid, id, mes, { fisPorJogo: fis });
    const ultimos = feitosJ.slice(-3).reverse();
    desH = `<section class="cartao desafios"><div class="cartao-tit">🎯 Desafios <small class="mute">${feitosJ.length + feitosM.length} cumpridos</small></div>
      ${d && proprio ? `<h4>Desafio do mês <small class="mute">${MESES[Number(mes.slice(5, 7)) - 1]}</small></h4><div class="desafio ${d.feito ? 'feito' : ''}">
        <div class="linha" style="justify-content:space-between"><span>${d.feito ? '✅' : d.ic} ${esc(d.txt)}${d.rel ? ' ⌚' : ''}</span><b>${pt(d.valor)}/${d.alvo}${d.un ? ' ' + esc(d.un) : ''}</b></div>
        <div class="pbar-b"><i style="width:${d.pct}%"></i></div></div>` : proprio ? '<p class="mute" style="margin:0 0 6px">Recebes o teu desafio do mês no próximo jogo.</p>' : ''}
      ${ultimos.length ? `<h4>Últimos cumpridos</h4>${ultimos.map((r) => linhaDes(r, 'feito').replace('</span><span class="des-nv', ` <small class="mute">${esc(diaPT(r.data))}</small></span><span class="des-nv`)).join('')}` : ''}
      <p class="mute" style="margin:8px 0 0">${proprio ? 'Cada jogo traz 1 a 3 desafios (vês no Próximo jogo) e há 1 desafio teu por mês.' : 'Desafios dos jogos (1 a 3 por jogo) e do mês.'}</p></section>`;
  }
  const R = recordes(jogos, pid, fis);
  const recH = R.length ? `<section class="cartao"><div class="cartao-tit">🏆 Recordes pessoais</div><table class="tficha">
    ${R.map((r) => `<tr><th>${esc(r.nome)}${r.priv || ['km', 'vmax', 'sp'].includes(r.k) ? ' <span title="Só tu vês">🔒</span>' : ''}</th><td><b>${esc(r.valor)}</b> <small class="mute">${esc(diaPT(r.data))}</small></td></tr>`).join('')}</table></section>` : '';
  const ep = epocaDe(new Date().toISOString().slice(0, 10));
  const T = tendencias(jogos, pid, { epoca: ep, fisPorJogo: fis });
  const sent = sentidoEpoca(T);
  const maxP = 3, W = 100 / Math.max(1, T.length);
  const tenH = T.length ? `<section class="cartao"><div class="cartao-tit">📈 Época ${esc(ep)}</div>
    ${sent ? `<p style="margin:0 0 8px">${sent.pontos > 0.3 ? '📈 A subir' : sent.pontos < -0.3 ? '📉 A descer' : '➡️ Estável'}: ${sent.pontos >= 0 ? '+' : '−'}${pt(Math.abs(sent.pontos))} pontos e ${sent.golos >= 0 ? '+' : '−'}${pt(Math.abs(sent.golos))} golos por jogo nos meses mais recentes, face aos primeiros.</p>` : ''}
    <div class="tend">${T.map((m) => `<div class="tend-m" style="width:${W}%">
      <div class="tend-b"><i style="height:${(m.ptsJ / maxP) * 100}%" title="${pt(m.ptsJ)} pontos por jogo"></i></div>
      <b>${pt(m.ptsJ)}</b><small>${MESES[Number(m.mes.slice(5, 7)) - 1]}</small><small class="mute">${m.j} j · ${m.g} ⚽</small></div>`).join('')}</div>
    <p class="mute" style="margin:6px 0 0">Pontos por jogo em cada mês (vitória 3, empate 1).</p></section>` : '';
  if (!M.some((m) => m.valor) && !R.length && !T.length) return '<p class="mute">Ainda sem jogos registados.</p>';
  return medH + desH + recH + tenH;
}

// ---------- Cartão partilhável (imagem 1080×1350 para o WhatsApp) ----------
export async function imagemCartao(j, pid, res, { fis = null, fisAntes = [], proprio = false, logos } = {}) {
  const d = dadosCartao(j, pid, jogosDe(res), { fis, fisAntes, proprio });
  if (!d) return null;
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1d2a1f'); gr.addColorStop(0.6, '#0b120d'); gr.addColorStop(1, '#070a08');
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  const F = (px, peso = 800) => `${peso} ${px}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  const txt = (t, x, y, px, cor = '#fff', al = 'center', peso = 800) => { c.font = F(px, peso); c.fillStyle = cor; c.textAlign = al; c.fillText(t, x, y); };
  const quebra = (t, x, y, px, larg, cor) => { c.font = F(px, 700); const ps = t.split(' '); let l = ''; for (const p of ps) { const n = l ? l + ' ' + p : p; if (c.measureText(n).width > larg && l) { txt(l, x, y, px, cor, 'left', 700); y += px * 1.3; l = p; } else l = n; } if (l) { txt(l, x, y, px, cor, 'left', 700); y += px * 1.3; } return y; };
  txt('O MEU JOGO', W / 2, 80, 34, '#9aa3ab', 'center', 900);
  txt(new Date(`${d.data}T12:00`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }), W / 2, 124, 28, '#6b7280', 'center', 600);
  txt(d.nome.toUpperCase(), W / 2, 220, 70, '#fff', 'center', 900);
  const resTxt = d.res === 'V' ? 'VITÓRIA' : d.res === 'E' ? 'EMPATE' : 'DERROTA', resCor = d.res === 'V' ? '#4ade80' : d.res === 'E' ? '#f1c40f' : '#f87171';
  txt(resTxt, W / 2, 290, 40, resCor, 'center', 900);
  if (logos?.[d.equipa]) c.drawImage(logos[d.equipa], W / 2 - 330, 330, 150, 180);
  txt(d.placar.nosso != null ? `${d.placar.nosso} – ${d.placar.deles}` : '', W / 2 + 60, 470, 130, '#fff', 'center', 900);
  // Números do jogo
  const nums = [[d.g, 'GOLOS'], [d.a, 'ASSIST.'], ...(d.minGR ? [[`${d.minGR}'`, d.sofrGR != null ? `NA BALIZA · ${d.sofrGR} SOFR.` : 'NA BALIZA']] : [])];
  if (d.fisico) nums.push([pt(d.fisico.km, 2), 'KM'], [pt(d.fisico.vmax), 'KM/H MÁX.'], [d.fisico.sprints ?? 0, 'SPRINTS']);
  const porLinha = Math.min(3, nums.length), lw = (W - 160) / porLinha;
  nums.forEach(([v, n], i) => {
    const x = 80 + lw * (i % porLinha) + lw / 2, y = 640 + Math.floor(i / porLinha) * 150;
    c.fillStyle = '#ffffff12'; c.fillRect(x - lw / 2 + 10, y - 95, lw - 20, 130);
    txt(String(v), x, y, 72, '#f1c40f', 'center', 900); txt(n, x, y + 26, 22, '#9aa3ab', 'center', 800);
  });
  // Destaques (e, com GPS, o mapa de onde andou à direita: campo vertical, a minha baliza em baixo)
  let y = 640 + Math.ceil(nums.length / porLinha) * 150 + 30;
  const g = d.fisico?.grelha, larg = g ? W - 160 - 270 : W - 160;
  if (g) {
    const cw = 200, ch = 300, x0 = W - 80 - cw, y0 = y + 14, max = Math.max(1, ...g.s.flat());
    c.fillStyle = '#1c7a3a'; c.fillRect(x0, y0, cw, ch);
    for (let x = 0; x < g.nx; x++) for (let k = 0; k < g.ny; k++) {
      const a = (g.s[k]?.[x] || 0) / max;
      c.fillStyle = `rgba(255,${Math.round(200 - a * 170)},0,${(a * 0.85).toFixed(2)})`;
      c.fillRect(x0 + (k * cw) / g.ny, y0 + ch - ((x + 1) * ch) / g.nx, cw / g.ny + 1, ch / g.nx + 1);
    }
    c.strokeStyle = '#ffffffb0'; c.lineWidth = 3; c.strokeRect(x0, y0, cw, ch);
    c.beginPath(); c.moveTo(x0, y0 + ch / 2); c.lineTo(x0 + cw, y0 + ch / 2); c.stroke();
    c.strokeRect(x0 + cw / 2 - 40, y0, 80, 26); c.strokeRect(x0 + cw / 2 - 40, y0 + ch - 26, 80, 26);
    txt('⬆ ATAQUE', x0 + cw / 2, y0 - 12, 20, '#9aa3ab', 'center', 800);
  }
  if (d.dna.length) {
    txt('🧬 DESTAQUES', 80, y, 28, '#9aa3ab', 'left', 900); y += 50;
    for (const f of d.dna.slice(0, 3)) { if (y > H - 110) break; y = quebra('• ' + f, 80, y, 34, larg, '#fff') + 14; }
  }
  txt('Futebolada', W / 2, H - 40, 24, '#6b7280', 'center', 600);
  return new Promise((ok) => cv.toBlob(ok, 'image/png'));
}
