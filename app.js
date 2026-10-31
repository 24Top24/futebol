import { DB, novoToken, novoPin } from './db.js?v=47';
import { paginaLigas, abrirConvite, ligaGuardada, TODAS, dadosTodas, espelharVoto, montarSeletorLiga, souVisitante, slugLiga, LINK_LIGA, ligaDoLink, irParaLiga, campoSinc, publicarNotasFora, notasFora, comNotaFora, registarPessoa, paginaContas, jogosDeFora, paraEmprestar, promoverEmprestados, JOGOS_EMPRESTADO } from './ligas-ui.js?v=24';
import { epocasDe, filtrarEpoca, nomeEpoca, epocaAtual, aplicarTema, temaEscolhido } from './ligas.js?v=2';
import { AREAS, NIVEIS, POSICOES, calcularCartas, gerarEquipas, tier, notaDe, calcularElo, aplicarForma, ajusteElo, ELO, contarConvivio, pontosConvivio, pesoVoto, placarDe, vencedorDe, marcaDe, sortearLado, textoLado } from './ranking.js?v=33';
import { paginaMarcador, hojeLocal, campoLados } from './marcador.js?v=26';
import { resumoFisico, campoDeNuvem, somarGrelhas } from './fisico.js?v=2';
import { htmlDNAJogo, htmlFisicoJogo, htmlHeatmap, htmlConquistas, imagemCartao, jogosDe as jogosConq, htmlDesafiosAntes, htmlDesafiosJogo, htmlDesafioMes } from './conquistas-ui.js?v=5';
import { dnaJogo } from './conquistas.js?v=3';
import { atribuirDesafios, completarDesafiosMes } from './desafios.js?v=3';
import { lerFicheiro, zonas, ZONAS, fcMaxIdade, mediasTreinos, idadeDe } from './treinos.js?v=27';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASE = location.origin + location.pathname;
if (DB.demo) document.getElementById('demo').hidden = false;

function toast(t) {
  const el = document.getElementById('toast');
  el.textContent = t; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 1800);
}
// Prova de autorização sem expor a chave: sha256(chave + id) em hex (as regras do Firestore refazem a conta).
async function prova(chave, id) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chave + id));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const nomeDe = (p) => p.alias || p.alcunha || p.nome;
// Data de um jogo: o dia em que começou (a 'data' guardada pode ser a do dia em que se fizeram as equipas).
const dataDe = (j) => (j.inicioEpoch ? new Date(j.inicioEpoch).toLocaleDateString('pt-PT') : j.data || '');
const LOGO = { B: '<img class="logo" src="brancos.svg?v=2" alt="Brancos">', P: '<img class="logo" src="pretos.svg?v=2" alt="Pretos">' };
const foto = (p) => (p?.fotoPropria || p?.foto ? `<img src="${p.fotoPropria || p.foto}" alt="">` : `<span class="foto0">${esc((nomeDe(p || {}) || '?')[0])}</span>`);
// Partilha imagem + texto: no telemóvel abre a folha de partilha (escolhe-se o WhatsApp);
// sem isso, copia a imagem (o texto vai em seguida) ou descarrega-a.
async function partilharWhatsApp(png, texto, nome) {
  const f = png ? new File([png], nome, { type: 'image/png' }) : null;
  if (f && navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], text: texto }); return; }
    catch (e) { if (e.name === 'AbortError') return; console.error(e); }
  }
  if (png && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast('Imagem copiada — cola no WhatsApp (Ctrl+V)');
      return;
    } catch (e) { console.error(e); }
  }
  if (png) { const a = document.createElement('a'); a.href = URL.createObjectURL(png); a.download = nome; a.click(); }
  copiar(texto);
}
async function copiar(t) {
  try { await navigator.clipboard.writeText(t); toast('Copiado ✔'); } catch { prompt('Copia:', t); }
}

// Baralha de forma estável (sempre a mesma ordem para o mesmo votante).
function baralhar(arr, seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Redimensiona a foto para 200×200 (recorte central) em JPEG ~10 KB.
function fotoParaDataURL(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const S = 200, c = document.createElement('canvas');
      c.width = c.height = S;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
      res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================================
// VOTAÇÃO  (página inicial: escolher perfil → alias/foto → votar área a área)
// =====================================================================
const juntarPerfis = (players, perfis) => players.map((p) => {
  const pf = perfis.find((x) => x.id === p.id);
  if (!pf) return p;
  // foto '-' = o jogador pediu para não ter foto (nem a própria nem a do WhatsApp).
  if (pf.foto === '-') return { ...p, alias: pf.alias || '', fotoPropria: '', foto: '', semFoto: true };
  return { ...p, alias: pf.alias || '', fotoPropria: pf.foto || '' };
});
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

// =====================================================================
// PÁGINAS PÚBLICAS  (Início · Jogos · Jogadores · Tabela · Eu) — barra de navegação em baixo / ao lado
// =====================================================================
// Numa liga extra, o título leva o nome da liga por baixo (para nunca se confundir com a principal).
let NOME_LIGA = null, MODO_TODAS = false;
// Visitante (sem PIN nem Google, Rui 31/10): vê o Início geral, a Classificação e os Jogos por cima (resultado e marcadores).
// Não vê desafios, destaques, conquistas nem os jogadores: no lugar disso, o convite para entrar. Recalcula-se a cada página.
// No demo há sempre "conta": ?visitante força o modo para testar.
let VISITANTE = false;
function conviteEntrar(txt = 'Com conta vês a tua liga: os teus desafios, o teu último jogo, os jogadores e os destaques de cada jogo.') {
  return `<section class="cartao convite-entrar"><div class="v-cab"><span class="ic">👋</span><div><b>Entra para veres a tua liga</b><p>${txt}</p></div></div>
    <div class="v-botoes"><a class="btn prim" href="#eu">Entrar com o PIN</a>${DB.demo ? '' : '<button class="btn v-google">🔐 Entrar com o Google</button>'}
      <a class="btn" href="#ligas">Criar a minha liga</a></div></section>`;
}
// O botão do Google do convite (está em várias páginas): entra e recarrega; com a conta ligada a um jogador, fica logo esse perfil.
document.addEventListener('click', async (e) => {
  const b = e.target.closest?.('.v-google');
  if (!b) return;
  b.disabled = true;
  try {
    const c = await DB.entrarGoogle();
    if (c?.player) { lsSet('meu-perfil', c.player); lsSet('perfil-ok-' + c.player, '1'); }
    location.reload();
  } catch (err) { console.error(err); b.disabled = false; toast(err.code === 'auth/popup-blocked' ? 'O telemóvel bloqueou a janela do Google — tenta outra vez' : 'Não deu para entrar com o Google'); }
});
const titulo = (t) => { const el = document.getElementById('titulo'); el.textContent = t; if (NOME_LIGA) el.insertAdjacentHTML('beforeend', ` <small style="font-size:11px;opacity:.7">🏆 ${esc(NOME_LIGA)}</small>`); };
const av = (p) => `<span class="av">${foto(p)}</span>`;
const vazio = (ic, t, extra = '') => `<div class="vazio"><span class="ic">${ic}</span>${t}${extra ? `<div style="margin-top:12px">${extra}</div>` : ''}</div>`;
// Jogos terminados (resumo público), do mais recente para o mais antigo.
const lerRes = (jogosPub) => jogosPub.map((r) => ({ id: r.id, jogo: JSON.parse(r.json || '{}') })).filter((r) => r.jogo.fase === 'fim')
  .sort((a, b) => (b.jogo.inicioEpoch || 0) - (a.jogo.inicioEpoch || 0));
async function dadosPublicos() {
  // 🌍 Todas as ligas juntas: jogadores, jogos e equipas de todas as ligas da pessoa, com a mesma pessoa junta.
  const [players, perfis, jogosPub, games] = MODO_TODAS ? await dadosTodas().then((d) => [d.players, d.perfis, d.jogosPub, d.games])
    : await Promise.all([DB.listPlayers(), DB.listPerfis(), DB.listJogosPub(), DB.listGames()]);
  return { todos: juntarPerfis(players, perfis), res: lerRes(jogosPub), games };
}
const minuto = (t) => Math.floor(t / 60000) + 1;
// Posições com empates (Rui, 23/10): quem tem o mesmo valor fica com o mesmo lugar (1, 1, 1, 4…) e ninguém fica de fora.
// L já vem ordenada; v(x) = o valor que conta (maior = melhor). Devolve o lugar de cada um, pela mesma ordem.
// v2 (opcional) = desempate: só ficam no mesmo lugar se também empatarem nele.
const lugares = (L, v, v2 = () => 0) => L.map((x) => 1 + L.filter((y) => v(y) > v(x) || (v(y) === v(x) && v2(y) > v2(x))).length);
// Minutos que cada um jogou em jogos com os golos registados (os fechados só com o vencedor não contam).
// Desempate de golos e assistências (Rui, 23/10): quem marcou/assistiu mais por minuto jogado fica à frente.
function minutosJogados(res) {
  const M = {};
  for (const { jogo: j } of res) {
    if (!j || j.fase !== 'fim' || j.semGolos || !(j.eventos || []).length) continue;
    const ult = Math.max(0, ...(j.eventos || []).map((e) => e.t || 0));
    const dur = Math.max(j.fimEpoch && j.inicioEpoch ? j.fimEpoch - j.inicioEpoch - (j.pausaTotal || 0) : 0, ult) / 60000;
    for (const x of [...(j.brancos || []), ...(j.pretos || [])]) M[x.id] = (M[x.id] || 0) + dur;
  }
  return M;
}
// Por minuto (golos ou assistências), para desempatar; sem minutos registados = 0.
const porMin = (M, s, k) => (M[s.id] ? s[k] / M[s.id] : 0);
const esqueleto = () => `<div class="esq" aria-busy="true" aria-label="A carregar"><i class="e-cab"></i><i></i><i></i><i class="e-curta"></i><i></i></div>`;

// Marcadores de cada lado por baixo do resultado (como na FotMob): nome e minutos. Nunca o pé; penálti sim.
function marcadoresHTML(j) {
  const nome = (id) => esc([...(j.brancos || []), ...(j.pretos || [])].find((x) => x.id === id)?.nome || '?');
  const lado = (e) => {
    const por = new Map();
    for (const ev of (j.eventos || []).filter((x) => x.equipa === e)) {
      const ag = ev.tipo === 'autogolo', k = (ag ? 'ag:' : '') + ev.marcador;
      if (!por.has(k)) por.set(k, { nm: (ag ? 'AG ' : '') + nome(ev.marcador), m: [] });
      por.get(k).m.push(`${minuto(ev.t)}'${ev.parte === 'pen' ? ' (pen.)' : ''}`);
    }
    return [...por.values()].map((x) => `<div>${x.nm} ${x.m.join(', ')}</div>`).join('');
  };
  const B = lado('B'), P = lado('P');
  return B || P ? `<div class="mj-marc"><div>${B}</div><div class="bolinha">⚽</div><div>${P}</div></div>` : '';
}

// Cartão de jogo ao estilo FotMob: emblemas, resultado (ou VS), marcadores e as duas equipas.
// o = { estado, data, j (jogo terminado ou ao vivo, opcional), B: [p], P: [p], rodape }
function cartaoJogo(o) {
  const j = o.j;
  let meio = '<span class="mj-vs">VS</span>';
  if (j) {
    const v = j.fase === 'fim' ? vencedorDe(j) : null;
    const n = (e) => `<span class="${v && v !== 'E' && v !== e ? 'perde' : ''}">${j.fase === 'fim' ? marcaDe(j, e) : (j.eventos || []).filter((x) => x.equipa === e).length}</span>`;
    meio = j.semGolos ? `<div class="mj-res" style="font-size:20px">${v === 'E' ? 'Empate' : `Ganharam os ${v === 'B' ? 'Brancos' : 'Pretos'}`}<small>sem golos registados</small></div>`
      : `<div class="mj-res">${n('B')} – ${n('P')}${j.fase === 'fim' ? '<small>Terminado</small>' : ''}</div>`;
  }
  const lista = (ps) => ps.map((p) => (p.id ? `<a class="jl" href="#jogador=${esc(p.id)}">${av(p)}<span>${esc(nomeDe(p))}</span></a>` : `<div class="jl">${av(p)}<span>${esc(nomeDe(p))}</span></div>`)).join('');
  return `<article class="mjogo">
    <div class="mj-topo"><div class="mj-estado"><span>${o.estado}</span><span>${esc(o.data || '')}</span></div>
      <div class="mj-placar"><div class="mj-eq">${LOGO.B}<span>Brancos</span></div>${meio}<div class="mj-eq">${LOGO.P}<span>Pretos</span></div></div>
      ${j && !j.semGolos ? marcadoresHTML(j) : ''}</div>
    ${o.B.length || o.P.length ? `<div class="mj-corpo"><div class="mj-lados"><div><h4>${LOGO.B} Brancos · ${o.B.length}</h4>${lista(o.B)}</div><div><h4>Pretos · ${o.P.length} ${LOGO.P}</h4>${lista(o.P)}</div></div></div>` : ''}
    ${o.rodape ? `<div class="mj-rodape">${o.rodape}</div>` : ''}</article>`;
}

// Cartões do topo (Início e Jogos): jogo aberto à espera de equipas, e o jogo das equipas mais recentes (próximo / ao vivo / último).
// desafiosPrimeiro: os meus desafios por cima do cartão do próximo jogo (Início do próprio).
function cartoesTopo(todos, res, games, vivo, { desafiosPrimeiro = false } = {}) {
  const aoVivo = vivo?.fase === 'jogo' && vivo.live ? JSON.parse(vivo.live) : null;
  const pessoa = (id, nome) => todos.find((p) => p.id === id) || { nome: nome || '?' };   // sem id = não abre perfil
  const ult = [...games].sort((a, b) => (b.criado || 0) - (a.criado || 0))[0];
  let html = '', mostrado = null;
  if (vivo && vivo.fase === 'aberto' && !vivo.gameId)
    html += `<div class="aviso"><span class="ic">📋</span><div><b>Jogo de ${esc(diaPT(vivo.data))}</b><p>Aberto por ${esc(vivo.por?.nome || '?')} — as equipas estão a ser feitas.</p></div></div>`;
  if (ult) {
    const r = res.find((x) => x.jogo.gameId === ult.id);
    const vv = !r && aoVivo?.gameId === ult.id ? aoVivo : null;
    const eqs = (ids) => (ids || []).map((id) => pessoa(id, ult.nomes?.[id]));
    if (r) mostrado = r.id;
    const card = cartaoJogo({ estado: vv ? '<span class="ao-vivo"></span>Ao vivo' : r ? 'Último jogo' : 'Próximo jogo', data: r ? dataDe(r.jogo) : diaPT(ult.data),
      j: r?.jogo || vv, B: eqs(ult.brancos), P: eqs(ult.pretos), rodape: r ? `<span class="mute">${res.length} jogos registados</span><a href="#jogo=${esc(r.id)}">Ver o jogo →</a>`
        : campoLados(vv?.ladoInicio || ult.ladoInicio) });
    // Antes do jogo: os desafios que me calharam (games/{id}.desafios, desafios.js).
    const euId = lsGet('meu-perfil');
    const des = !r && euId && !VISITANTE && ult.desafios?.[euId] ? htmlDesafiosAntes(ult.desafios[euId], ult.nomes || {}) : '';
    html += desafiosPrimeiro ? des + card : card + des;
  }
  return { html, mostrado, pessoa };
}

// Início (Rui, 29/10): quem entrou no seu perfil vê o que é seu — o próximo jogo com os seus desafios, o seu último jogo
// (resultado, desafios ✅/❌ e destaques) e o desafio do mês. Quem não entrou vê o geral (próximo jogo, votação, líderes).
async function paginaInicio() {
  titulo('Futebolada');
  const [estado, { todos, res, games }, vivo] = await Promise.all([DB.getPublic('estado').then((x) => x || {}), dadosPublicos(), DB.getAoVivo().catch(() => null)]);
  let { html: principal, mostrado, pessoa } = cartoesTopo(todos, res, games, vivo);
  // Último resultado registado (quando o cartão de cima é de um jogo que ainda não acabou).
  const r0 = res[0];
  if (r0 && r0.id !== mostrado) {
    const eqs = (l) => (l || []).map((x) => pessoa(x.id, x.nome));
    principal += cartaoJogo({ estado: 'Último resultado', data: dataDe(r0.jogo), j: r0.jogo, B: eqs(r0.jogo.brancos), P: eqs(r0.jogo.pretos),
      rodape: `<a href="#jogos">Todos os jogos</a><a href="#jogo=${esc(r0.id)}">Ver o jogo →</a>` });
  }
  if (!principal) principal = `<div class="cartao">${vazio('📋', 'Ainda não há equipas feitas.<br><small>Aparecem aqui quando o Rui ou um moderador as fizer, antes do jogo.</small>')}</div>`;
  // Votação (sempre aberta): nos colegas todos e, a quem jogou, ajustar as notas dos colegas do último jogo e avaliar esse jogo.
  const euId = lsGet('meu-perfil');
  const ultMeu = euId ? res.find((r) => [...(r.jogo.brancos || []), ...(r.jogo.pretos || [])].some((x) => x.id === euId)) : null;
  const votar = `<section class="cartao votacao"><div class="v-cab"><span class="ic">🗳</span><div><b>Votação dos colegas</b><p>Sempre aberta. As notas fazem as equipas saírem equilibradas — só o Rui as vê.</p></div></div>
    <div class="v-botoes"><a class="btn prim" href="#votar">Votar nos colegas</a>
      ${ultMeu ? `<a class="btn" href="#votar=${esc(ultMeu.id)}">Ajustar os do último jogo <small>${esc(dataDe(ultMeu.jogo).slice(0, 5))}</small></a>
        <a class="btn" href="#jogo=${esc(ultMeu.id)}&avaliar">⭐ Avaliar o último jogo</a>` : ''}</div></section>`;
  const euOk = !VISITANTE && euId && lsGet('perfil-ok-' + euId) && (await DB.ligacaoOk(euId).catch(() => false));
  if (euOk) return inicioEu(euId, { todos, res, games, vivo, votar });
  const entrar = VISITANTE ? '' : euId ? '' : `<div class="aviso"><span class="ic">👤</span><div><b>Entra no teu perfil</b><p>Para veres aqui o teu último jogo e os teus desafios.</p></div><a class="btn peq" href="#eu">Entrar</a></div>`;
  // Líderes (só golos e assistências: são públicos) e últimos resultados.
  const S = estatisticas(res);
  const nm = (s) => esc(nomeDe(todos.find((p) => p.id === s.id) || { nome: s.nome }));
  // Só os 5 primeiros; em empate fica à frente quem tem mais por minuto jogado (G/min ou A/min).
  const M = minutosJogados(res);
  const lideres = (k, t) => {
    const T = S.filter((s) => s[k] > 0).sort((a, b) => b[k] - a[k] || porMin(M, b, k) - porMin(M, a, k) || nm(a).localeCompare(nm(b), 'pt'));
    const pos = lugares(T, (x) => x[k], (x) => porMin(M, x, k));
    const L = T.slice(0, 5);
    const dica = (s) => (M[s.id] ? `${n1(porMin(M, s, k) * 90, 2)} por 90 min (${Math.round(M[s.id])} min jogados)` : '');
    return L.length ? `<section class="cartao"><div class="cartao-tit">${t}<a href="#tabela">Tabela →</a></div><ol class="lideres">
    ${L.map((s, i) => `<li><a href="#jogador=${esc(s.id)}" title="${dica(s)}"><span class="pos">${pos[i]}</span>${av(todos.find((p) => p.id === s.id) || { nome: s.nome })}<span class="nm">${nm(s)}</span><span class="v">${s[k]}</span></a></li>`).join('')}</ol>
    <p class="mute" style="font-size:11px;margin:6px 0 0">Em empate, fica à frente quem ${k === 'g' ? 'marcou' : 'assistiu'} mais por minuto jogado.</p></section>` : '';
  };
  const ultimos = res.length ? `<section class="cartao"><div class="cartao-tit">Últimos resultados<a href="#jogos">Ver todos →</a></div>
    ${res.slice(0, 5).map((r) => linhaResultado(r, todos.find((p) => p.id === euId))).join('')}</section>` : '';
  $app.innerHTML = `${VISITANTE ? conviteEntrar() : ''}<div class="grelha2"><div>${entrar}${VISITANTE ? '' : votar}${principal}</div><aside>${lideres('g', '⚽ Melhores marcadores')}${lideres('a', '🅰️ Mais assistências')}${ultimos}</aside></div>`;
}

// Início do próprio jogador.
async function inicioEu(eu, { todos, res, games, vivo, votar }) {
  const topo = cartoesTopo(todos, res, games, vivo, { desafiosPrimeiro: true });
  // O cartão de cima só fica se o jogo ainda não acabou (o acabado aparece em baixo, se joguei).
  const cima = topo.mostrado ? topo.html.replace(/<article class="mjogo">[\s\S]*<\/article>/, '') : topo.html;
  const fis = (await DB.getMinhaCarta(eu).catch(() => null))?.fisico || {};
  const r = res.find((x) => [...(x.jogo.brancos || []), ...(x.jogo.pretos || [])].some((y) => y.id === eu));
  let ultimo = '';
  if (r) {
    const j = r.jogo, lado = (j.brancos || []).some((x) => x.id === eu) ? 'B' : 'P', v = vencedorDe(j);
    const fisJ = fis[j.gameId || r.id] || null;
    const f = dnaJogo(j, eu, jogosConq(res), { publico: false, fis: fisJ });
    const resTxt = v === 'E' ? 'Empate' : v === lado ? 'Vitória' : 'Derrota';
    ultimo = cartaoJogo({ estado: 'O teu último jogo', data: dataDe(j), j, B: [], P: [],
      rodape: `<span class="mute">Jogaste nos ${lado === 'B' ? 'Brancos' : 'Pretos'} · <b>${resTxt}</b></span><a href="#jogo=${esc(r.id)}">Ver o jogo →</a>` })
      + htmlDesafiosJogo(j, eu, games.find((g) => g.id === j.gameId), { fis: fisJ })
      + (f.length ? `<section class="cartao"><div class="cartao-tit">🧬 Os teus destaques</div><ul class="dna-curto">${f.map((x) => `<li>${esc(x.txt)}</li>`).join('')}</ul></section>` : '');
  }
  const mes = htmlDesafioMes(res, games, eu, { fisPorJogo: fis });
  const nada = !cima && !ultimo ? `<div class="cartao">${vazio('📋', 'Ainda não há equipas nem jogos teus.<br><small>O próximo jogo e os teus desafios aparecem aqui.</small>')}</div>` : '';
  $app.innerHTML = `<div class="grelha2"><div>${cima}${nada}${ultimo}</div><aside>${mes}${votar}
    <div class="linha" style="justify-content:center;gap:16px;margin:8px 0"><a href="#tabela">Classificação →</a><a href="#jogos">Todos os jogos →</a></div></aside></div>`;
}

const lnkJog = (p) => (p.id ? `<a class="lnk-j" href="#jogador=${esc(p.id)}">${esc(p.nome)}</a>` : esc(p.nome));
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemana = (j) => (j.inicioEpoch ? DIAS[new Date(j.inicioEpoch).getDay()] : '');
// Resultado numa linha (estilo lista de jogos da FotMob): abre a página do jogo. O vencedor fica a negrito.
// eu (opcional): o meu jogador — a minha cara aparece ao lado da equipa em que joguei.
function linhaResultado(r, eu = null) {
  const j = r.jogo, v = vencedorDe(j);
  const ladoEu = eu ? ((j.brancos || []).some((x) => x.id === eu.id) ? 'B' : (j.pretos || []).some((x) => x.id === eu.id) ? 'P' : null) : null;
  const cara = (e) => (ladoEu === e ? `<span class="jr-eu" title="Jogaste nos ${e === 'B' ? 'Brancos' : 'Pretos'}">${foto(eu)}</span>` : '');
  const meio = j.semGolos ? (v === 'E' ? 'E' : v === 'B' ? 'V – D' : 'D – V') : `${marcaDe(j, 'B')} – ${marcaDe(j, 'P')}`;
  return `<a class="jrow" href="#jogo=${esc(r.id)}"><span class="jr-dt"><b>${diaSemana(j)}</b>${esc(dataDe(j).slice(0, 5))}</span>
    <span class="jr-eq ${v === 'B' ? 'ganha' : ''}">${cara('B')}<span>Brancos</span></span>${LOGO.B}<b class="jr-res">${meio}</b>${LOGO.P}<span class="jr-eq dir ${v === 'P' ? 'ganha' : ''}"><span>Pretos</span>${cara('P')}</span><span class="jr-seta" aria-hidden="true">›</span></a>`;
}
// Jogos: o próximo / ao vivo no topo e todos os resultados, agrupados por mês.
async function paginaJogos() {
  titulo('Jogos');
  const [{ todos, res, games }, vivo] = await Promise.all([dadosPublicos(), DB.getAoVivo().catch(() => null)]);
  const topo = cartoesTopo(todos, res, games, vivo);
  const eu = todos.find((p) => p.id === lsGet('meu-perfil')) || null;
  // O cartão de cima só interessa aqui se o jogo ainda não acabou (os acabados estão na lista).
  const cima = topo.mostrado ? topo.html.replace(/<article class="mjogo">[\s\S]*<\/article>/, '') : topo.html;
  if (!res.length) { $app.innerHTML = cima + vazio('⚽', 'Ainda não há jogos registados.<br><small>Aparecem aqui quando o marcador do telemóvel ou o relógio enviar o primeiro jogo.</small>'); return; }
  const meses = new Map();
  for (const r of res) {
    const k = r.jogo.inicioEpoch ? new Date(r.jogo.inicioEpoch).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }) : 'Sem data';
    if (!meses.has(k)) meses.set(k, []);
    meses.get(k).push(r);
  }
  $app.innerHTML = `${cima ? `<div class="jogos-topo">${cima}</div>` : ''}<div class="lista-jogos">${[...meses].map(([m, L]) => `<section class="cartao mes">
    <div class="cartao-tit"><span>${esc(m[0].toUpperCase() + m.slice(1))}</span><small class="mute">${L.length} jogo${L.length > 1 ? 's' : ''}</small></div>${L.map((r) => linhaResultado(r, eu)).join('')}</section>`).join('')}</div>`;
}

// =====================================================================
// PÁGINA DO JOGO  (#jogo=<id>) — cabeçalho FotMob, gráfico do jogo, resumo, estatísticas e equipas
// Só o resumo público do jogo; o pé com que se marcou só aparece nos golos do próprio (com PIN).
// =====================================================================
async function paginaJogoPub(id) {
  titulo('Jogo');
  // "#jogo=<id>&avaliar" (vindo do Início): abre logo a avaliação dos colegas.
  const avaliarJa = id.endsWith('&avaliar');
  id = id.replace(/&avaliar$/, '');
  const [{ todos, res, games }, euLs, posPub] = await Promise.all([dadosPublicos(), Promise.resolve(lsGet('meu-perfil')), DB.getPublic('posicoes').catch(() => null)]);
  const eu = !VISITANTE && euLs && (await DB.ligacaoOk(euLs).catch(() => false)) ? euLs : null;
  const i = res.findIndex((r) => r.id === id);
  if (i < 0) { $app.innerHTML = vazio('🤷', 'Este jogo não existe (ou ainda não terminou).', '<a class="btn" href="#jogos">Ver os jogos</a>'); return; }
  const j = res[i].jogo, v = vencedorDe(j);
  const quem = Object.fromEntries([...(j.brancos || []), ...(j.pretos || [])].map((x) => [x.id, { ...x, ...(todos.find((p) => p.id === x.id) || {}), nomeJogo: x.nome }]));
  const nome = (pid) => esc(quem[pid]?.nomeJogo || '?');
  const lnk = (pid) => (quem[pid] ? `<a class="lnk-j" href="#jogador=${esc(pid)}">${nome(pid)}</a>` : nome(pid));
  const ev = [...(j.eventos || [])].sort((a, b) => a.t - b.t);
  const dur = Math.max(j.fimEpoch && j.inicioEpoch ? j.fimEpoch - j.inicioEpoch - (j.pausaTotal || 0) : 0, (ev.at(-1)?.t || 0) + 60000, 60000);
  const parte = (e) => (e.parte && (!PES.includes(e.parte) || e.marcador === eu) ? PARTE[e.parte] : '');
  // Navegação para o jogo anterior / seguinte (res vem do mais recente para o mais antigo).
  const ant = res[i + 1], seg = res[i - 1];
  const nav = `<div class="jnav">${ant ? `<a href="#jogo=${esc(ant.id)}">‹ ${esc(dataDe(ant.jogo))}</a>` : '<span></span>'}<a href="#jogos">Todos os jogos</a>${seg ? `<a href="#jogo=${esc(seg.id)}">${esc(dataDe(seg.jogo))} ›</a>` : '<span></span>'}</div>`;
  // Cabeçalho (com o botão para avaliar os colegas, se joguei e entrei com o PIN)
  const joguei = eu ? ((j.brancos || []).some((x) => x.id === eu) ? 'B' : (j.pretos || []).some((x) => x.id === eu) ? 'P' : null) : null;
  const n = (e) => `<span class="${v !== 'E' && v !== e ? 'perde' : ''}">${marcaDe(j, e)}</span>`;
  const meio = j.semGolos ? `<div class="mj-res" style="font-size:22px">${v === 'E' ? 'Empate' : `Ganharam os ${v === 'B' ? 'Brancos' : 'Pretos'}`}<small>sem golos registados</small></div>`
    : `<div class="mj-res">${n('B')} – ${n('P')}<small>Terminado${j.fimEpoch ? ` · ${Math.round(dur / 60000)} min` : ''}</small></div>`;
  const cab = `<section class="mjogo jcab"><div class="mj-topo"><div class="mj-estado"><span>${esc(diaSemana(j))} · ${esc(dataDe(j))}</span><span>${j.inicioEpoch ? new Date(j.inicioEpoch).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
    <div class="mj-placar"><div class="mj-eq">${LOGO.B}<span>Brancos</span>${v === 'B' ? '<small class="jvenc">Vencedor</small>' : ''}</div>${meio}<div class="mj-eq">${LOGO.P}<span>Pretos</span>${v === 'P' ? '<small class="jvenc">Vencedor</small>' : ''}</div></div>
    ${j.semGolos ? '' : marcadoresHTML(j)}</div>
    ${joguei ? `<div class="mj-rodape"><span class="mute">Jogaste nos ${joguei === 'B' ? 'Brancos' : 'Pretos'}.</span><span class="linha"><button class="peq" id="j-cartao">📤 O meu cartão</button><button class="prim peq" id="j-aval">⭐ Avaliar os colegas neste jogo</button></span></div>`
      : !eu && !VISITANTE ? '<div class="mj-rodape"><span class="mute">Jogaste? Entra no teu perfil para avaliar os colegas neste jogo.</span><a class="btn peq" href="#eu">Entrar</a></div>' : ''}</section>`;
  if (VISITANTE) { $app.innerHTML = `${nav}${cab}${conviteEntrar('Com conta vês o resto do jogo: o desenrolar, as equipas, os destaques e os teus desafios.')}`; return; }
  // Painéis
  const graf = ev.length ? `<section class="cartao"><div class="cartao-tit">Desenrolar do jogo <small class="mute">toca num golo</small></div>${graficoJogo(j, ev, dur, nome)}
    <div class="gdet mute" id="g-det">Diferença no marcador ao longo do jogo: para cima a favor dos Brancos, para baixo a favor dos Pretos.</div></section>` : '';
  const resumo = `<section class="cartao"><div class="cartao-tit">Resumo${(j.turnos || []).length ? '<label class="tgr"><input type="checkbox" id="r-gr"> trocas de GR</label>' : ''}</div>${resumoJogoHTML(j, ev, dur, lnk, parte)}</section>`;
  const stats = `<section class="cartao"><div class="cartao-tit">Estatísticas da equipa</div>${statsJogoHTML(j, ev, dur)}</section>`;
  const equipas = `<section class="cartao"><div class="cartao-tit">Equipas</div>${campoHTML(j, ev, quem, posPub?.pos || {})}</section>`;
  // Destaques (Match DNA) de cada jogador; quem jogou e tem relógio vê também o seu físico deste jogo (só ele).
  const jogosC = jogosConq(res);
  const fisTodos = joguei ? (await DB.getMinhaCarta(eu).catch(() => null))?.fisico || {} : {};
  // Chave dos dados físicos: a mesma com que o admin os grava (gameId ou o id do jogo); a data lá vem em dd/mm/aaaa.
  const kJ = j.gameId || res[i].id, iso = (x) => (String(x || '').includes('/') ? x.split('/').reverse().join('-') : x || '');
  const fisEu = fisTodos[kJ] || null;
  const fisAntes = Object.entries(fisTodos).filter(([k, f]) => k !== kJ && iso(f?.data) < iso(j.data || dataDe(j))).map(([, f]) => f);
  const dnaH = htmlDNAJogo(j, jogosC, quem, { eu: joguei ? eu : null, fisEu, fisAntes });
  const fisH = joguei ? htmlFisicoJogo(fisEu, j) : '';
  const desH = joguei ? htmlDesafiosJogo(j, eu, games.find((g) => g.id === j.gameId), { fis: fisEu }) : '';
  $app.innerHTML = `${nav}${cab}
    <div class="tabs jtabs" role="tablist"><button data-ja="resumo" class="on">Resumo</button><button data-ja="stats">Estatísticas</button><button data-ja="equipas">Equipas</button></div>
    <div class="jgrid"><div class="jcol"><div class="jp on" data-jp="resumo">${graf}${desH}${dnaH}${fisH}${resumo}</div></div>
      <div class="jcol"><div class="jp" data-jp="stats">${stats}</div><div class="jp" data-jp="equipas">${equipas}</div></div></div>`;
  $app.querySelectorAll('[data-ja]').forEach((b) => (b.onclick = () => {
    $app.querySelectorAll('[data-ja]').forEach((x) => x.classList.toggle('on', x === b));
    $app.querySelectorAll('[data-jp]').forEach((x) => x.classList.toggle('on', x.dataset.jp === b.dataset.ja));
  }));
  document.getElementById('r-gr')?.addEventListener('change', (e) => $app.querySelector('.resumo').classList.toggle('com-gr', e.target.checked));
  document.getElementById('j-aval')?.addEventListener('click', () => abrirAvaliacao(id, j, eu, quem));
  // Cartão partilhável do próprio (imagem para o WhatsApp); os dados do relógio só entram porque é o próprio que partilha.
  document.getElementById('j-cartao')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const img = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
      const [B, P] = await Promise.all([img('brancos.svg?v=2'), img('pretos.svg?v=2')]);
      const png = await imagemCartao(j, eu, res, { fis: fisEu, fisAntes, proprio: true, logos: { B, P } });
      if (png) await partilharWhatsApp(png, `⚽ O meu jogo de ${dataDe(j)}`, `o-meu-jogo-${(j.data || '').replace(/-/g, '')}.png`);
    } catch (err) { console.error(err); toast('Não deu para fazer o cartão'); }
    e.target.disabled = false;
  });
  if (avaliarJa && joguei) abrirAvaliacao(id, j, eu, quem);
  // Tocar num golo do gráfico: quem marcou, quem assistiu e o resultado nesse momento.
  const det = document.getElementById('g-det');
  $app.querySelectorAll('[data-g]').forEach((g) => {
    const mostrar = () => {
      const e = ev[g.dataset.g], k = ev.indexOf(e) + 1, B = ev.slice(0, k).filter((x) => x.equipa === 'B').length, P = k - B;
      $app.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('sel', x === g));
      det.classList.remove('mute');
      det.innerHTML = `<b>${minuto(e.t)}'</b> ${e.equipa === 'B' ? LOGO.B : LOGO.P} ${e.tipo === 'autogolo' ? `Autogolo de ${lnk(e.marcador)}` : `⚽ ${lnk(e.marcador)}`}${parte(e) ? ` <small class="mute">(${parte(e)})</small>` : ''}${e.assist ? ` · 🅰️ ${lnk(e.assist)}` : ''} <span class="gdet-res">${B} – ${P}</span>`;
    };
    g.onclick = mostrar;
    g.onkeydown = (k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); mostrar(); } };
  });
}

// Gráfico do jogo (o "ímpeto" possível com os dados que há): a diferença no marcador ao longo do tempo,
// com cada golo marcado em cima (Brancos) ou em baixo (Pretos).
function graficoJogo(j, ev, dur, nome) {
  // No telemóvel o desenho é mais estreito, para os golos não ficarem minúsculos.
  const W = innerWidth < 600 ? 360 : 640, H = innerWidth < 600 ? 190 : 170, m = 18, mid = H / 2, amp = mid - 34;
  const x = (t) => m + (t / dur) * (W - 2 * m);
  let d = 0, maxD = 1;
  const pts = [[0, 0]];
  for (const e of ev) { pts.push([e.t, d]); d += e.equipa === 'B' ? 1 : -1; pts.push([e.t, d]); maxD = Math.max(maxD, Math.abs(d)); }
  pts.push([dur, d]);
  const y = (v) => mid - (v / maxD) * amp;
  const linha = pts.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${x(0)},${mid} ${linha} ${x(dur)},${mid}`;
  const ticks = [];
  for (let k = 0; k <= dur / 60000; k += 10) ticks.push(`<line x1="${x(k * 60000)}" x2="${x(k * 60000)}" y1="${m}" y2="${H - m}" class="g-tick"/><text x="${x(k * 60000)}" y="${H - 3}" class="g-min">${k}'</text>`);
  const golos = ev.map((e, i) => {
    const cx = x(e.t), cy = e.equipa === 'B' ? 16 : H - 24;
    return `<g class="g-golo ${e.equipa === 'B' ? 'gb' : 'gp'}" data-g="${i}" tabindex="0" role="button" aria-label="${minuto(e.t)}' ${e.tipo === 'autogolo' ? 'autogolo de ' : 'golo de '}${nome(e.marcador)}">
      <line x1="${cx}" x2="${cx}" y1="${cy}" y2="${mid}" class="g-haste"/><circle cx="${cx}" cy="${cy}" r="8"/><text x="${cx}" y="${cy + 3.5}">${e.tipo === 'autogolo' ? 'A' : '⚽'}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="gjogo" role="img" aria-label="Golos ao longo do jogo">
    <defs><clipPath id="g-cima"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath><clipPath id="g-baixo"><rect x="0" y="${mid}" width="${W}" height="${mid}"/></clipPath></defs>
    ${ticks.join('')}<polygon points="${area}" class="g-area-b" clip-path="url(#g-cima)"/><polygon points="${area}" class="g-area-p" clip-path="url(#g-baixo)"/>
    <line x1="${m}" x2="${W - m}" y1="${mid}" y2="${mid}" class="g-meio"/><polyline points="${linha}" class="g-linha"/>${golos}
    <text x="${W - m}" y="${mid - 6}" class="g-eq" text-anchor="end">BRANCOS ▲</text><text x="${W - m}" y="${mid + 14}" class="g-eq" text-anchor="end">PRETOS ▼</text></svg>`;
}

// Resumo minuto a minuto (estilo FotMob): Brancos à esquerda, Pretos à direita, o minuto ao centro.
function resumoJogoHTML(j, ev, dur, lnk, parte) {
  const L = [];
  let B = 0, P = 0;
  for (const e of ev) {
    if (e.equipa === 'B') B++; else P++;
    L.push({ t: e.t, e: e.equipa, html: `<span class="ri">⚽</span><div><b>${lnk(e.marcador)}</b> <span class="rres">${B}-${P}</span>${e.tipo === 'autogolo' ? ' <span class="mute">(autogolo)</span>' : ''}${e.assist ? ` <span class="rassist">(assistência de ${lnk(e.assist)})</span>` : ''}${parte(e) ? `<div class="mute">${parte(e)}</div>` : ''}</div>` });
  }
  for (const pn of (j.penaltis || []).filter((x) => x.resultado !== 'golo'))
    L.push({ t: pn.t, e: pn.equipa, html: `<span class="ri">${pn.resultado === 'defendido' ? '🧤' : '❌'}</span><div><b>Penálti ${pn.resultado === 'defendido' ? 'defendido' : 'falhado'}</b><div class="mute">${lnk(pn.marcador)}${pn.resultado === 'defendido' && pn.gr ? ` · defende ${lnk(pn.gr)}` : ''}</div></div>` });
  for (const tu of j.turnos || [])
    L.push({ t: tu.de, e: tu.equipa, gr: true, html: `<span class="ri">🧤</span><div class="mute">${lnk(tu.jogador)} vai à baliza</div>` });
  L.sort((a, b) => a.t - b.t || (a.gr ? -1 : 1));
  const linha = (x) => `<div class="rl ${x.e === 'B' ? 'rb' : 'rp'}${x.gr ? ' rgr' : ''}"><div class="rlado">${x.e === 'B' ? x.html : ''}</div><span class="rmin">${minuto(x.t)}'</span><div class="rlado">${x.e === 'P' ? x.html : ''}</div></div>`;
  return `<div class="resumo"><div class="rmarco">Início</div>${L.map(linha).join('')}<div class="rmarco">Fim${j.fimEpoch ? ` · ${Math.round(dur / 60000)}'` : ''} · ${j.semGolos ? 'sem golos registados' : `${marcaDe(j, 'B')} – ${marcaDe(j, 'P')}`}</div></div>`;
}

// Estatísticas das duas equipas frente a frente, só com o que o marcador regista.
function statsJogoHTML(j, ev, dur) {
  const de = (e) => ev.filter((x) => x.equipa === e);
  const pens = (e) => (j.penaltis || []).filter((x) => x.equipa === e);
  // Maior série de golos seguidos e tempo a ganhar.
  const serie = { B: 0, P: 0 }, ganhar = { B: 0, P: 0 };
  let cur = null, n = 0, d = 0, tAnt = 0;
  for (const e of ev) {
    if (d > 0) ganhar.B += e.t - tAnt; else if (d < 0) ganhar.P += e.t - tAnt;
    tAnt = e.t; d += e.equipa === 'B' ? 1 : -1;
    n = e.equipa === cur ? n + 1 : 1; cur = e.equipa; serie[cur] = Math.max(serie[cur], n);
  }
  if (d > 0) ganhar.B += dur - tAnt; else if (d < 0) ganhar.P += dur - tAnt;
  const gr = (e) => (j.turnos || []).filter((x) => x.equipa === e);
  const linhas = [
    ['Golos', placarDe(j).B, placarDe(j).P, true],
    ['Golos com assistência', de('B').filter((x) => x.assist).length, de('P').filter((x) => x.assist).length],
    ['Marcadores diferentes', new Set(de('B').filter((x) => x.tipo !== 'autogolo').map((x) => x.marcador)).size, new Set(de('P').filter((x) => x.tipo !== 'autogolo').map((x) => x.marcador)).size],
    ['Golos de cabeça', de('B').filter((x) => x.parte === 'cab').length, de('P').filter((x) => x.parte === 'cab').length],
    ['Penáltis marcados', `${pens('B').filter((x) => x.resultado === 'golo').length}/${pens('B').length}`, `${pens('P').filter((x) => x.resultado === 'golo').length}/${pens('P').length}`, false, pens('B').length + pens('P').length],
    ['Penáltis defendidos', pens('P').filter((x) => x.resultado === 'defendido').length, pens('B').filter((x) => x.resultado === 'defendido').length],
    ['Autogolos a favor', de('B').filter((x) => x.tipo === 'autogolo').length, de('P').filter((x) => x.tipo === 'autogolo').length],
    ['Maior série de golos seguidos', serie.B, serie.P],
    ['Minutos a ganhar', Math.round(ganhar.B / 60000), Math.round(ganhar.P / 60000)],
    ['Guarda-redes usados', new Set(gr('B').map((x) => x.jogador)).size, new Set(gr('P').map((x) => x.jogador)).size],
  ].filter(([, a, b, sempre, extra]) => sempre || (extra ?? (Number(a) + Number(b))) > 0);
  if (ev.length === 0 && !j.semGolos) return '<p class="mute">Sem golos registados neste jogo.</p>';
  return `<div class="hh-cab"><span>${LOGO.B} Brancos</span><span>Pretos ${LOGO.P}</span></div>${linhas.map(([nm, a, b]) => {
    const na = parseFloat(a) || 0, nb = parseFloat(b) || 0, tot = na + nb || 1;
    return `<div class="hh"><div class="hh-v"><b class="${na > nb ? 'mais b' : ''}">${a}</b><span>${nm}</span><b class="${nb > na ? 'mais p' : ''}">${b}</b></div>
      <div class="hh-b"><i class="b" style="width:${(na / tot) * 100}%"></i><i class="p" style="width:${(nb / tot) * 100}%"></i></div></div>`;
  }).join('')}${j.semGolos ? '<p class="mute">Jogo fechado sem golos registados: só se sabe quem ganhou.</p>' : ''}`;
}

// As duas equipas desenhadas num campo (Brancos em cima, Pretos em baixo). Na baliza fica quem mais minutos lá esteve
// (todos rodam; empate → quem entrou primeiro);
// os outros distribuem-se pela posição indicativa da carta (defesa, médio, avançado — public/posicoes, publicada pelo admin).
// Quem não tem posição fica no meio-campo. É só para ficar bonito: as posições no jogo não são registadas.
function campoHTML(j, ev, quem, pos = {}) {
  const ORD = ['DEF', 'MED', 'AVA'];
  const meio = (e, ids) => {
    const tur = (j.turnos || []).filter((x) => x.equipa === e).sort((a, b) => a.de - b.de);
    const minGR = (pid) => Math.round(tur.filter((x) => x.jogador === pid).reduce((s, x) => s + x.ate - x.de, 0) / 60000);
    const g1 = [...new Set(tur.map((x) => x.jogador))].filter((pid) => ids.includes(pid))
      .reduce((m, pid) => (m == null || minGR(pid) > minGR(m) ? pid : m), null);
    const resto = ids.filter((pid) => pid !== g1);
    const temPos = resto.some((pid) => pos[pid]);
    const linhas = temPos ? ORD.map((k) => resto.filter((pid) => (ORD.includes(pos[pid]) ? pos[pid] : 'MED') === k)).filter((l) => l.length)
      : resto.length <= 3 ? [resto] : [resto.slice(0, Math.ceil(resto.length / 2)), resto.slice(Math.ceil(resto.length / 2))];
    const jog = (pid) => {
      const p = quem[pid] || { nome: '?' }, g = ev.filter((x) => x.marcador === pid && x.tipo !== 'autogolo').length, a = ev.filter((x) => x.assist === pid).length, mg = minGR(pid);
      return `<a class="cj" href="#jogador=${esc(pid)}"><span class="cj-av">${foto(p)}${g ? `<i class="cj-g" title="${g} golo${g > 1 ? 's' : ''}">⚽${g > 1 ? '×' + g : ''}</i>` : ''}${a ? `<i class="cj-a" title="${a} assistência${a > 1 ? 's' : ''}">🅰️${a > 1 ? '×' + a : ''}</i>` : ''}${mg ? `<i class="cj-gr" title="${mg} min na baliza">🧤 ${mg}'</i>` : ''}</span>
        <span class="cj-n">${esc(p.nomeJogo || p.nome)}</span>${temPos && pos[pid] ? `<small class="cj-pos">${pos[pid]}</small>` : ''}</a>`;
    };
    const rows = [g1 ? `<div class="cl gr">${jog(g1)}</div>` : '', ...linhas.map((l) => `<div class="cl">${l.map(jog).join('')}</div>`)];
    return `<div class="cmeio ${e === 'B' ? 'cb' : 'cp'}"><div class="ceq">${LOGO[e]} ${e === 'B' ? 'Brancos' : 'Pretos'}</div>${(e === 'B' ? rows : rows.reverse()).join('')}</div>`;
  };
  const ids = (l) => (l || []).map((x) => x.id);
  const algumaPos = [...ids(j.brancos), ...ids(j.pretos)].some((pid) => pos[pid]);
  return `<div class="campo"><div class="cbaliza cima"></div>${meio('B', ids(j.brancos))}<div class="clinha"></div>${meio('P', ids(j.pretos))}<div class="cbaliza baixo"></div></div>
    <p class="mute" style="font-size:12px;margin:8px 0 0">⚽ golos · 🅰️ assistências · 🧤 minutos na baliza${(j.turnos || []).length ? ' (na baliza está quem lá esteve mais tempo)' : ''}.
      ${algumaPos ? 'Os outros estão pela posição indicativa da carta (DEF, MED, AVA); no jogo as posições não são registadas.' : 'As posições no campo não são registadas.'}</p>`;
}

// ⭐ Avaliar os colegas NESTE jogo (Rui, 23/10): um toque por colega — pior (−1), igual (0) ou melhor (+1) do que o normal
// dele (as áreas que tem na carta). Guarda sozinho em votosJogo/{jogo}_{votante} = { r: { id: { d } } }. À parte: não entra em
// calcularCartas; por agora só junta dados.
async function abrirAvaliacao(jogoId, j, euId, quem) {
  const atual = (await DB.getVotoJogo(jogoId, euId).catch(() => null)) || {};
  const r = { ...(atual.r || {}) };
  const { el: f } = abrirFolha(`⭐ Os colegas no jogo de ${dataDe(j)}`, '<div id="av-corpo"></div>');
  const corpo = f.querySelector('#av-corpo');
  const OP = [[-1, '▼', 'Pior'], [0, '=', 'Normal'], [1, '▲', 'Melhor']];
  const outros = [...(j.brancos || []), ...(j.pretos || [])].filter((x) => x.id !== euId);
  const nm = (pid) => esc(nomeDe(quem[pid] || { nome: '?' }));
  const desenhar = () => {
    const n = outros.filter((x) => [-1, 0, 1].includes(r[x.id]?.d)).length;
    const lado = (e, L) => `<h4 class="av-eq">${LOGO[e]} ${e === 'B' ? 'Brancos' : 'Pretos'}</h4>${L.filter((x) => x.id !== euId).map((x) => `<div class="av-j">${av(quem[x.id] || x)}<span>${nm(x.id)}</span>
      <div class="av-op" role="group" aria-label="${nm(x.id)}">${OP.map(([d, s, t]) => `<button class="av-${d < 0 ? 'pior' : d > 0 ? 'melhor' : 'igual'} ${r[x.id]?.d === d ? 'on' : ''}" data-p="${esc(x.id)}" data-d="${d}" title="${t} do que o normal">${s}<small>${t}</small></button>`).join('')}</div></div>`).join('')}`;
    corpo.innerHTML = `<p class="mute" style="margin-top:0">Como jogou cada um <b>comparado com o normal dele</b>? Um toque basta — grava sozinho. Fica à parte e <b>não mexe nas cartas</b>.</p>
      <div class="prog"><i style="width:${(n / (outros.length || 1)) * 100}%"></i></div><p class="mute" style="font-size:12px;margin:0 0 6px">${n} de ${outros.length} avaliados</p>
      ${lado('B', j.brancos || [])}${lado('P', j.pretos || [])}`;
    corpo.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => {
      const pid = b.dataset.p, d = Number(b.dataset.d);
      if (r[pid]?.d === d) delete r[pid]; else r[pid] = { d };   // tocar outra vez no mesmo desfaz
      desenhar();
      try { await DB.saveVotoJogo(jogoId, euId, { r, ts: Date.now() }); }
      catch (err) { console.error(err); toast(/permission/i.test(err.message || '') ? 'A avaliação dos jogos ainda não está ligada no servidor' : 'Não deu para guardar — tenta outra vez'); }
    }));
  };
  desenhar();
}

// Jogadores (pedido do Rui, 22/10): as cartas de todos, quando o Rui as publicou; com as cartas escondidas, só a foto e o
// número de jogos (sem rating). Pesquisa e ordenação sempre; filtro por posição só com cartas (a posição vem da carta).
async function paginaJogadores() {
  titulo('Jogadores');
  const [pub, { todos, res }] = await Promise.all([DB.getPublic('cartas'), dadosPublicos()]);
  const comCartas = !!pub?.visivel;
  const S = Object.fromEntries(estatisticas(res).map((s) => [s.id, s]));
  const lista = todos.filter((p) => p.ativo !== false && !p.convidado).map((p) => ({ p, j: S[p.id]?.j || 0, c: comCartas ? cartaPublica(pub, p) : null }));
  const posicoes = POSICOES.filter((x) => lista.some((l) => l.c?.posicao === x.k));
  const ORD = [...(comCartas ? [['ov', 'Overall']] : []), ['nome', 'Nome'], ['j', 'Jogos']];
  A.jOrd = ORD.some(([k]) => k === A.jOrd) ? A.jOrd : ORD[0][0];
  A.jPos ||= ''; A.jBusca ??= '';
  $app.innerHTML = `<div class="jfiltros"><input id="j-busca" type="search" placeholder="🔎 Procurar jogador…" value="${esc(A.jBusca)}" aria-label="Procurar jogador">
      <label class="jord">Ordenar <select id="j-ord">${ORD.map(([k, n]) => `<option value="${k}" ${k === A.jOrd ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    ${posicoes.length ? `<div class="chips jpos"><button class="chip ${!A.jPos ? 'on' : ''}" data-pos="">Todos</button>${posicoes.map((x) => `<button class="chip ${A.jPos === x.k ? 'on' : ''}" data-pos="${x.k}">${x.nome}</button>`).join('')}</div>` : ''}
    ${comCartas ? '' : '<p class="mute" style="font-size:12px;margin:0 0 10px">🔒 As cartas são privadas: cada um vê a sua no seu perfil.</p>'}
    <div id="j-lista"></div>`;
  const val = (l, k) => (k === 'ov' ? l.c?.overall ?? -1 : k === 'j' ? l.j : 0);
  const desenhar = () => {
    const q = A.jBusca.trim().toLowerCase(), k = A.jOrd;
    const L = lista.filter((l) => (!q || `${l.p.nome} ${nomeDe(l.p)}`.toLowerCase().includes(q)) && (!A.jPos || l.c?.posicao === A.jPos))
      .sort((a, b) => (k === 'nome' ? 0 : val(b, k) - val(a, k)) || nomeDe(a.p).localeCompare(nomeDe(b.p), 'pt'));
    const item = (l) => (l.c
      ? `<a class="carta-link" href="#jogador=${esc(l.p.id)}">${htmlCarta(l.p, l.c)}<span class="carta-j">${l.j} jogo${l.j === 1 ? '' : 's'}</span></a>`
      : `<a class="pj" href="#jogador=${esc(l.p.id)}">${av(l.p)}<b>${esc(nomeDe(l.p))}</b><span class="pj-jogos"><b>${l.j}</b> jogo${l.j === 1 ? '' : 's'}</span></a>`);
    document.getElementById('j-lista').innerHTML = L.length ? `<p class="mute" style="margin:0 0 8px">${L.length} jogador${L.length > 1 ? 'es' : ''}</p>
      <div class="${comCartas ? 'cartas' : 'plantel'}">${L.map(item).join('')}</div>` : vazio('🔎', 'Nenhum jogador encontrado.');
  };
  desenhar();
  document.getElementById('j-busca').oninput = (e) => { A.jBusca = e.target.value; desenhar(); };
  document.getElementById('j-ord').onchange = (e) => { A.jOrd = e.target.value; desenhar(); };
  $app.querySelectorAll('[data-pos]').forEach((b) => (b.onclick = () => { A.jPos = b.dataset.pos; $app.querySelectorAll('[data-pos]').forEach((x) => x.classList.toggle('on', x === b)); desenhar(); }));
}

// Classificação: filtros por período, os 3 melhores em pódio (o do meio é o 1.º) e a tabela com a forma. Nunca o pé.
async function paginaTabela() {
  titulo('Classificação');
  const { todos, res } = await dadosPublicos();
  // Épocas de setembro a agosto (decisão do Rui, 29/10): por defeito a época atual; "Sempre" junta todas.
  const PER = [...epocasDe(res).map((e) => ['ep:' + e, 'Época ' + nomeEpoca(e)]), ['tudo', 'Sempre'], ['10', 'Últimos 10 jogos'], ['30d', 'Últimos 30 dias']];
  const CAT = [['pts', 'Pontos'], ['g', 'Golos'], ['a', 'Assistências'], ['pv', '% vitórias']];
  A.cPer ||= 'ep:' + epocaAtual(); A.cCat ||= 'pts';   // por defeito: Pontos (pedido do Rui, 23/10)
  const resF = A.cPer.startsWith('ep:') ? filtrarEpoca(res, A.cPer.slice(3)) : A.cPer === '10' ? res.slice(0, 10) : A.cPer === '30d' ? res.filter((r) => (r.jogo.inicioEpoch || 0) >= Date.now() - 30 * 864e5) : res;
  // % vitórias só conta a partir de 3 jogos no período (1 jogo ganho não é 100 %).
  const minJ = A.cCat === 'pv' ? Math.min(3, Math.max(1, ...estatisticas(resF).map((s) => s.j))) : 1;
  const pessoa = (s) => todos.find((p) => p.id === s.id) || { nome: s.nome };
  const nomeP = (s) => nomeDe(pessoa(s));
  const M = minutosJogados(resF);
  const desemp = (x) => (A.cCat === 'g' || A.cCat === 'a' ? porMin(M, x, A.cCat) : 0);   // golos/assist.: por minuto jogado
  const T = estatisticas(resF).map(comMedias).filter((s) => s.j >= minJ && s[A.cCat] > 0)
    .sort((a, b) => b[A.cCat] - a[A.cCat] || desemp(b) - desemp(a) || nomeP(a).localeCompare(nomeP(b), 'pt'));
  const pos = lugares(T, (x) => x[A.cCat], desemp);
  const L = T.slice(0, 3);
  const fmtV = (s) => (A.cCat === 'pv' ? Math.round(s.pv * 100) + '%' : s[A.cCat]);
  // Também empatados com o último do pódio, mas que não cabem nele.
  const fora = L.length === 3 ? T.slice(3).filter((s) => s[A.cCat] === L[2][A.cCat]) : [];
  const podio = L.length ? `<div class="podio" aria-label="Os 3 melhores em ${esc(CAT.find(([k]) => k === A.cCat)[1])}">${[1, 0, 2].map((i) => (L[i]
    ? `<a class="pd pd${Math.min(pos[i], 3)}" href="#jogador=${esc(L[i].id)}"><span class="pd-av">${foto(pessoa(L[i]))}${pos[i] === 1 ? '<i class="pd-coroa">👑</i>' : ''}</span>
        <b class="pd-nome">${esc(nomeP(L[i]))}</b><span class="pd-v">${fmtV(L[i])}</span><div class="pd-base"><span>${pos[i]}.º</span></div></a>`
    : '<div class="pd pd-vazio"></div>')).join('')}</div>
    ${fora.length ? `<p class="mute pd-nota">Também ${pos[2]}.º, com ${fmtV(L[2])}: ${fora.map((x) => esc(nomeP(x))).join(', ')}.</p>` : ''}` : '';
  const chips = (L2, atual, attr) => `<div class="chips cfiltro">${L2.map(([k, n]) => `<button class="chip ${atual === k ? 'on' : ''}" ${attr}="${k}">${n}</button>`).join('')}</div>`;
  $app.innerHTML = `<div class="cfiltros">${chips(PER, A.cPer, 'data-per')}${chips(CAT, A.cCat, 'data-cat')}</div>
    ${resF.length ? `${podio}<div class="cartao" id="pub"></div>` : vazio('📊', 'Sem jogos neste período.')}`;
  if (resF.length) tabelaStats(document.getElementById('pub'), resF, todos, A.cCat, lsGet('meu-perfil'), 'publico');
  $app.querySelectorAll('[data-per]').forEach((b) => (b.onclick = () => { A.cPer = b.dataset.per; paginaTabela(); }));
  $app.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { A.cCat = b.dataset.cat; A.statsInv = false; paginaTabela(); }));
}

// ⚙ Definições (roda dentada do topo): os meus dados (alcunha, foto, PIN, trocar de perfil), instalar a app e a administração.
async function paginaDefinicoes() {
  titulo('Definições');
  $app.innerHTML = '<div id="pub"></div>';
  const el = document.getElementById('pub');
  const [players, perfis] = await Promise.all([DB.listPlayers(), DB.listPerfis()]);
  const todos = juntarPerfis(players, perfis).filter((p) => p.ativo !== false && !p.convidado);
  const eu = todos.find((p) => p.id === lsGet('meu-perfil'));
  if (eu && (await DB.ligacaoOk(eu.id))) editarPerfil(eu, todos, () => { toast('Guardado ✔'); paginaDefinicoes(); });
  else el.innerHTML = `<div class="cartao">${vazio('🔑', 'Ainda não entraste no teu perfil neste telemóvel.', '<a class="btn prim" href="#eu">Entrar com o meu PIN</a>')}</div>`;
  el.insertAdjacentHTML('beforeend', `<section class="cartao def-lista" style="margin-top:16px">
    <button id="def-ticket"><span>🐞</span><div><b>Reportar um problema</b><small>Vai direto para o Rui, com o ecrã onde estavas.</small></div></button>
    <button id="def-instalar"><span>📲</span><div><b>Instalar a app</b><small>Fica no ecrã do telemóvel como uma app.</small></div></button>
    <a href="#ligas"><span>🏆</span><div><b>Ligas e épocas</b><small>As tuas ligas, criar uma liga e as tuas estatísticas por liga e época.</small></div></a>
    <a href="#admin"><span>🔧</span><div><b>Administração</b><small>Só para o Rui (entra com a conta Google do administrador).</small></div></a></section>
    <p class="mute" style="font-size:12px">Privacidade: as notas que dás só o organizador as vê; a idade, a altura, o peso e o pé com que marcas só tu (e o Rui) os vês.</p>`);
  document.getElementById('def-ticket').onclick = abrirTicket;
  document.getElementById('def-instalar').onclick = () => document.getElementById('instalar').click();
}

// Eu (perfil, com PIN) e Votar (sempre aberta). jogoId: votar só nos colegas desse jogo (ajustar as notas depois de jogar com eles).
async function paginaEu(modo, jogoId = null) {
  A.pubTab = modo;
  A.votarJogo = jogoId;
  titulo(modo === 'votar' ? 'Votar' : 'O meu perfil');
  $app.innerHTML = '<div id="pub"></div>';
  return paginaVotar(document.getElementById('pub'));
}
// Separadores que não cabem no ecrã: o ativo fica sempre à vista (sem mexer na página na vertical).
function tabAtivoVisivel() {
  const b = $app.querySelector('.tabs .on'), t = b?.parentElement;
  if (b && t.scrollWidth > t.clientWidth) t.scrollLeft = b.offsetLeft - (t.clientWidth - b.offsetWidth) / 2;
}
// 'AAAA-MM-DD' → 'DD/MM/AAAA' (como os jogos registados).
const diaPT = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('/') : d || '');

// Golos (minuto, equipa, marcador, assistência, parte do corpo) e penáltis falhados/defendidos de um jogo.
// O pé com que se marcou só aparece nos golos do próprio (decisão do Rui, 21/10); cabeça e penálti aparecem sempre.
const PES = ['pd', 'pe'];
function linhasEventos(j, euId = null) {
  const nome = (id) => esc([...(j.brancos || []), ...(j.pretos || [])].find((x) => x.id === id)?.nome || '?');
  return `${(j.eventos || []).map((ev) => `<div>${Math.floor(ev.t / 60000) + 1}' ${ev.equipa === 'B' ? '⚪' : '⚫'} ${ev.tipo === 'autogolo' ? `AG ${nome(ev.marcador)}` : nome(ev.marcador)}${ev.assist ? ` <span class="mute">(${nome(ev.assist)})</span>` : ''}${ev.parte && (!PES.includes(ev.parte) || ev.marcador === euId) ? ` <small class="mute">${PARTE[ev.parte]}</small>` : ''}</div>`).join('')}
    ${(j.penaltis || []).filter((pn) => pn.resultado !== 'golo').map((pn) => `<div class="mute">${Math.floor(pn.t / 60000) + 1}' ${pn.equipa === 'B' ? '⚪' : '⚫'} penálti de ${nome(pn.marcador)} ${pn.resultado === 'defendido' ? `defendido por ${nome(pn.gr)} 🧤` : 'falhado'}</div>`).join('')}`;
}

async function paginaVotar(el) {
  const $app = el;
  const [players, perfis] = await Promise.all([DB.listPlayers(), DB.listPerfis()]);
  const todos = juntarPerfis(players, perfis).filter((p) => p.ativo !== false && !p.convidado);
  let eu = todos.find((p) => p.id === lsGet('meu-perfil'));
  // Conta Google ligada a um jogador: entra sem PIN (em qualquer telemóvel).
  if (!eu || !(await DB.ligacaoOk(eu.id))) {
    const c = await DB.minhaConta().catch(() => null), p = c && todos.find((x) => x.id === c.player);
    if (p) { lsSet('meu-perfil', p.id); lsSet('perfil-ok-' + p.id, '1'); eu = p; }
  }
  if (!eu) return escolherPerfil(todos);
  // Sem ligação válida (outro telemóvel, ou o Rui mudou o PIN) → pede o PIN outra vez.
  if (!(await DB.ligacaoOk(eu.id))) return pedirPin(eu, todos);
  if (!lsGet('perfil-ok-' + eu.id)) return editarPerfil(eu, todos);
  seguir(eu, todos);
}

function escolherPerfil(todos) {
  const $app = document.getElementById('pub') || document.getElementById('app');
  const lista = [...todos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  $app.innerHTML = `<h2>Quem és tu?</h2>
    <p class="mute">Escolhe o teu nome. Vais avaliar de 1 a 10 todos os outros jogadores que conheces, para as equipas serem feitas de forma automática e equilibrada. Os outros jogadores não veem as tuas notas.</p>
    ${DB.demo ? '' : '<button id="g-entrar" style="width:100%;margin-bottom:12px">🔐 Já liguei a minha conta Google — entrar com o Google</button>'}
    <div class="chips">${lista.map((p) => `<button class="chip" data-id="${p.id}">${foto(p)}${esc(p.nome)}</button>`).join('')}</div>
    <p class="mute" style="margin-top:14px">O teu nome não aparece? Fala com o Rui.</p>`;
  document.getElementById('g-entrar')?.addEventListener('click', async () => {
    try {
      let c = await DB.entrarGoogle();
      // O Rui (admin) ainda sem conta ligada: liga-se já ao seu perfil.
      if (!c && (await DB.isAdmin(await DB.user()))) { const pf = await DB.getSegredo('perfil').catch(() => null); if (pf?.eu) { await DB.contaAdmin(pf.eu); c = await DB.minhaConta(); } }
      const p = c && lista.find((x) => x.id === c.player);
      if (!p) return toast('Esta conta Google ainda não está ligada a nenhum jogador. Entra com o PIN e liga-a nos teus dados.');
      lsSet('meu-perfil', p.id); lsSet('perfil-ok-' + p.id, '1'); seguir(p, todos);
    } catch (e) { console.error(e); toast('Não deu para entrar com o Google'); }
  });
  $app.querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
    const p = lista.find((x) => x.id === b.dataset.id);
    $app.innerHTML = `<div class="fim"><div class="alvo" style="justify-content:center">${foto(p)}</div>
      <h2>És o ${esc(p.nome)}?</h2>
      <div class="linha" style="justify-content:center"><button id="nao">Não</button><button class="prim" id="sim">Sim, sou eu</button></div></div>`;
    document.getElementById('nao').onclick = () => escolherPerfil(todos);
    document.getElementById('sim').onclick = () => pedirPin(p, todos);
  }));
}

// PIN de 4 algarismos que o Rui envia a cada um em privado. Pede-se uma vez por telemóvel.
function pedirPin(p, todos) {
  const $app = document.getElementById('pub') || document.getElementById('app');
  $app.innerHTML = `<div class="fim"><div class="alvo" style="justify-content:center">${foto(p)}</div>
    <h2>${esc(p.nome)}, qual é o teu PIN?</h2>
    <p class="mute">São 4 algarismos que o Rui te enviou em privado. Só pedimos uma vez neste telemóvel.</p>
    <input id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="4" placeholder="••••"
      style="font-size:28px;text-align:center;letter-spacing:10px;max-width:180px;margin:0 auto;display:block">
    <div class="linha" style="justify-content:center;margin-top:14px"><button id="pin-voltar">← Não sou eu</button><button class="prim" id="pin-ok">Entrar</button></div>
    <p class="mute" style="margin-top:12px">Não tens PIN ou esqueceste-te? Pede ao Rui.</p></div>`;
  const inp = document.getElementById('pin');
  inp.focus();
  document.getElementById('pin-voltar').onclick = () => { lsDel('meu-perfil'); escolherPerfil(todos); };
  let aEntrar = false;
  const entrar = async () => {
    const pin = inp.value.trim();
    if (!/^\d{4}$/.test(pin)) return toast('São 4 algarismos');
    if (aEntrar) return; aEntrar = true;
    try { await DB.ligar(p.id, pin); }
    catch { aEntrar = false; inp.value = ''; inp.focus(); return toast('PIN errado'); }
    lsSet('meu-perfil', p.id);
    if (lsGet('perfil-ok-' + p.id)) seguir(p, todos); else editarPerfil(p, todos);
  };
  document.getElementById('pin-ok').onclick = entrar;
  inp.onkeydown = (e) => { if (e.key === 'Enter') entrar(); };
  inp.oninput = () => { if (/^\d{4}$/.test(inp.value)) entrar(); };
}

// Conta Google ligada ao perfil: entra-se em qualquer telemóvel sem PIN (e, mais tarde, é precisa para criar ligas).
async function blocoGoogle(eu) {
  const el = document.getElementById('pf-google');
  if (!el) return;
  const c = await DB.minhaConta().catch(() => null);
  if (c && c.player === eu.id) {
    el.innerHTML = `<b>🔐 Conta Google ligada</b><div class="mute">${esc(c.email || '')} — entras em qualquer telemóvel com o Google, sem PIN.</div>
      <button class="peq" id="g-desligar" style="margin-top:6px">Desligar a conta Google</button>`;
    document.getElementById('g-desligar').onclick = async () => {
      if (!confirm('Desligar a conta Google? Voltas a precisar do PIN.')) return;
      await DB.desligarGoogle(); await DB.logout(); lsDel('meu-perfil'); location.hash = '#eu'; location.reload();
    };
    return;
  }
  el.innerHTML = `<b>🔐 Ligar à minha conta Google</b><div class="mute">Passas a entrar com o Google em qualquer telemóvel, sem PIN. Só guardamos o e-mail.</div>
    <button class="peq prim" id="g-ligar" style="margin-top:6px">Ligar ao Google</button>`;
  document.getElementById('g-ligar').onclick = async () => {
    try { const email = await DB.ligarGoogle(eu.id); toast(`Ligado a ${email} ✔`); blocoGoogle(eu); }
    catch (e) { console.error(e); toast(e.code === 'auth/popup-blocked' ? 'O telemóvel bloqueou a janela do Google — tenta outra vez' : 'Não deu para ligar ao Google'); }
  };
}

// depois: o que fazer depois de guardar (nas ⚙ Definições fica lá; no primeiro acesso segue para o perfil / votação).
function editarPerfil(eu, todos, depois = null) {
  const $app = document.getElementById('pub') || document.getElementById('app');
  let novaFoto = null;
  $app.innerHTML = `<h2>${depois ? 'Os meus dados' : 'O teu perfil'}</h2>
    <div class="alvo"><span id="pf-foto">${foto(eu)}</span><div><div class="nome">${esc(nomeDe(eu))}</div><div class="mute">${esc(eu.nome)}</div></div></div>
    <label>Como queres ser tratado? (opcional)</label><input id="pf-alias" maxlength="20" placeholder="${esc(eu.nome)}" value="${esc(eu.alias || '')}">
    <label>Foto melhor do que a do WhatsApp? (opcional)</label><input id="pf-file" type="file" accept="image/*">
    <button id="pf-semfoto" class="peq" style="margin-top:8px">🗑 Apagar a minha foto (fica só a inicial)</button>
    <button class="prim" id="pf-ok" style="width:100%;margin-top:16px">${depois ? 'Guardar' : 'Guardar e continuar'}</button>
    <p class="mute" style="margin-top:12px;font-size:12px">Privacidade: guardamos o teu nome, a foto (se quiseres) e as notas que dás e recebes.
      As notas que dás só o organizador as vê. Para apagares tudo, pede ao organizador do grupo.</p>
    <details style="margin-top:12px"><summary>🔑 Mudar o meu PIN</summary>
      <p class="mute" style="font-size:12px">Escolhe 4 algarismos que fixes. Não uses o PIN do multibanco. Nem o Rui fica a saber o teu PIN novo.</p>
      <div class="linha"><input id="pf-pin1" inputmode="numeric" maxlength="4" placeholder="novo PIN" style="max-width:120px">
        <input id="pf-pin2" inputmode="numeric" maxlength="4" placeholder="repetir" style="max-width:120px">
        <button class="peq" id="pf-pin-ok">Mudar PIN</button></div></details>
    ${DB.demo ? '' : '<div id="pf-google" class="opcao" style="margin-top:12px"></div>'}
    <button id="pf-trocar" style="width:100%;margin-top:10px">← Não sou eu / escolher outro perfil</button>`;
  document.getElementById('pf-trocar').onclick = async () => {
    lsDel('meu-perfil'); await DB.desligar();
    if (await DB.minhaConta().catch(() => null)) await DB.logout();   // com conta Google, sai dela (senão voltava a entrar sozinho)
    escolherPerfil(todos);
  };
  blocoGoogle(eu);
  document.getElementById('pf-pin-ok').onclick = async () => {
    const a = document.getElementById('pf-pin1').value.trim(), b = document.getElementById('pf-pin2').value.trim();
    if (!/^\d{4}$/.test(a)) return toast('O PIN são 4 algarismos');
    if (a !== b) return toast('Os dois PINs não são iguais');
    if (/^(\d)\1{3}$/.test(a) || '0123456789'.includes(a) || '9876543210'.includes(a)) return toast('Demasiado fácil — escolhe outro');
    try { await DB.mudarPin(eu.id, a); } catch (e) { console.error(e); return toast('Não deu para mudar o PIN'); }
    document.getElementById('pf-pin1').value = document.getElementById('pf-pin2').value = '';
    toast('PIN mudado ✔');
  };
  document.getElementById('pf-semfoto').onclick = () => {
    novaFoto = '-';
    document.getElementById('pf-file').value = '';
    document.getElementById('pf-foto').innerHTML = foto({ nome: eu.nome, alias: eu.alias });
    toast('Foto apagada — carrega em Guardar');
  };
  document.getElementById('pf-file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    novaFoto = await fotoParaDataURL(f);
    document.getElementById('pf-foto').innerHTML = `<img src="${novaFoto}" alt="">`;
  };
  document.getElementById('pf-ok').onclick = async () => {
    const alias = document.getElementById('pf-alias').value.trim().slice(0, 20);
    const fotoP = novaFoto || eu.fotoPropria || (eu.semFoto ? '-' : '');
    try { await DB.savePerfil(eu.id, { alias, foto: fotoP }); } catch (e) { console.error(e); return toast('Erro a guardar o perfil'); }
    eu.alias = alias; eu.fotoPropria = fotoP === '-' ? '' : fotoP;
    if (fotoP === '-') { eu.foto = ''; eu.semFoto = true; }
    lsSet('perfil-ok-' + eu.id, '1');
    if (depois) depois(); else seguir(eu, todos);
  };
}

// Jogadores a quem devo voltar a dar nota: já joguei com eles 3+ jogos desde a última nota que lhes dei
// (ou nunca lhes dei nota / disse "não conheço" — agora já nos vimos jogar). Notas antigas sem data usam a data do voto.
const JOGOS_PARA_ATUALIZAR = 3;
function paraAtualizar(euId, r, tsVoto, jogos) {
  const conta = {};
  for (const j of jogos) {
    if (j.fase !== 'fim') continue;
    const ids = [...(j.brancos || []), ...(j.pretos || [])].map((x) => x.id);
    if (!ids.includes(euId)) continue;
    for (const o of ids) {
      if (o === euId) continue;
      const desde = r[o] ? (r[o].t ?? tsVoto ?? 0) : 0;
      if ((j.inicioEpoch || 0) > desde) conta[o] = (conta[o] || 0) + 1;
    }
  }
  return Object.entries(conta).filter(([, n]) => n >= JOGOS_PARA_ATUALIZAR).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);
}

// Jogadores ativos a quem ainda não dei nota completa (novos na base, ou notas a meio). "Não conheço" conta como feito:
// esses voltam a aparecer pelo "⟳ atualizar" quando jogarmos juntos. Assim um jogador novo pede votos a todos e vota em todos.
const notaCompleta = (rr) => rr?.skip || AREAS.every((a) => typeof rr?.[a.k] === 'number');
const porVotar = (euId, r, todos) => todos.filter((p) => p.id !== euId && !notaCompleta(r[p.id]));

// Depois do PIN: vai para onde o jogador estava (votar ou o perfil "Eu").
const seguir = (eu, todos) => (A.pubTab === 'eu' ? perfilEu(eu, todos) : votar(eu, todos));

// Setas como no FIFA: o valor novo, a seta e o valor antigo riscado (antes = carta antes do último jogo).
const seta = (novo, velho) => (velho == null || novo == null || novo === velho ? ''
  : `<i class="seta ${novo > velho ? 'sobe' : 'desce'}">${novo > velho ? '▲' : '▼'}</i><s class="antigo">${velho}</s>`);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m) => MESES[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(2, 4);

// Gráfico simples do overall mês a mês (SVG, sem bibliotecas).
function graficoEvolucao(hist) {
  const pts = hist.filter((h) => h.ov != null);
  if (pts.length < 2) return `<p class="mute">O gráfico começa quando houver dois meses. Este mês: <b>${pts[0]?.ov ?? '–'}</b>.</p>`;
  const W = 320, H = 120, m = 24, vs = pts.map((h) => h.ov), lo = Math.min(...vs) - 3, hi = Math.max(...vs) + 3;
  const x = (i) => m + (i * (W - 2 * m)) / (pts.length - 1), y = (v) => H - m - ((v - lo) * (H - 2 * m)) / (hi - lo || 1);
  return `<svg viewBox="0 0 ${W} ${H}" class="evol" role="img" aria-label="Evolução do overall">
    <polyline fill="none" stroke="var(--verde)" stroke-width="2.5" points="${pts.map((h, i) => `${x(i)},${y(h.ov)}`).join(' ')}"/>
    ${pts.map((h, i) => `<circle cx="${x(i)}" cy="${y(h.ov)}" r="3.5" fill="var(--verde)"/><text x="${x(i)}" y="${y(h.ov) - 8}" text-anchor="middle">${h.ov}</text>
      <text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="mes">${nomeMes(h.mes)}</text>`).join('')}</svg>`;
}

// Resumo de um jogo visto por um jogador: resultado, o que ele fez e os golos do jogo.
// Só usa o resumo público do jogo (nada dos dados de saúde do relógio).
function resumoJogo(j, euId, aberto, extra = '') {
  const lado = (j.brancos || []).some((x) => x.id === euId) ? 'B' : 'P';
  const v = vencedorDe(j), r = v === 'E' ? 'E' : v === lado ? 'V' : 'D';
  const ev = j.eventos || [];
  const golos = ev.filter((e) => e.tipo !== 'autogolo' && e.marcador === euId).length;
  const ag = ev.filter((e) => e.tipo === 'autogolo' && e.marcador === euId).length;
  const ass = ev.filter((e) => e.assist === euId).length;
  const grMin = Math.round((j.turnos || []).filter((t) => t.jogador === euId).reduce((s, t) => s + t.ate - t.de, 0) / 60000);
  const sofr = ev.filter((e) => grSofreu(j, e) === euId).length;
  const pens = (j.penaltis || []).filter((p) => p.marcador === euId);
  const pDef = (j.penaltis || []).filter((p) => p.gr === euId && p.resultado === 'defendido').length;
  const dur = j.fimEpoch && j.inicioEpoch ? Math.round((j.fimEpoch - j.inicioEpoch - (j.pausaTotal || 0)) / 60000) : null;
  const meu = [golos && `⚽ ${golos} golo${golos > 1 ? 's' : ''}`, ass && `🅰️ ${ass} assist.`, ag && `${ag} autogolo`,
    pens.length && `penáltis ${pens.filter((p) => p.resultado === 'golo').length}/${pens.length}`,
    grMin && `🧤 ${grMin} min na baliza (sofreste ${sofr})`, pDef && `defendeste ${pDef} penálti${pDef > 1 ? 's' : ''}`].filter(Boolean);
  const eq = (e) => (e === 'B' ? j.brancos : j.pretos || []).map((p) => (p.id === euId ? `<b class="eu-nome">${esc(p.nome)}</b>` : esc(p.nome))).join('<br>');
  const data = dataDe(j);
  return `<details class="opcao jogo-eu"${aberto ? ' open' : ''}><summary><b class="res res-${r}">${r}</b> ${esc(data)} · ${LOGO.B} ${marcaDe(j, 'B')} – ${marcaDe(j, 'P')} ${LOGO.P}</summary>
    <p><b>O teu jogo:</b> ${meu.length ? meu.join(' · ') : 'sem golos nem assistências'}${dur ? ` · ⏱ ${dur} min de jogo` : ''}</p>
    ${extra}
    <div class="equipas"><div class="eq branco"><h4>${LOGO.B} Brancos</h4>${eq('B')}</div><div class="eq preto"><h4>${LOGO.P} Pretos</h4>${eq('P')}</div></div>
    ${linhasEventos(j, euId)}</details>`;
}

// ---------- Dados físicos e treinos do relógio ----------
// Dados de saúde (RGPD, categoria especial): só com consentimento; só o próprio e o organizador veem;
// o organizador só lê. O ficheiro do relógio é lido no browser e não é guardado — só o resumo.
const fmtMin = (s) => (s ? Math.round(s / 60) + ' min' : '–');
const n1 = (x, d = 0) => (x == null ? '–' : Number(x).toFixed(d).replace('.', ','));
const SENS = ['', '😫 péssimo', '😕 mal', '😐 normal', '🙂 bem', '💪 muito bem'];

function graficoFC(fc) {
  const v = (fc || []).map((x, i) => [i, x]).filter(([, x]) => x);
  if (v.length < 2) return '';
  const W = 300, H = 70, lo = Math.min(...v.map(([, x]) => x)) - 5, hi = Math.max(...v.map(([, x]) => x)) + 5, n = fc.length - 1 || 1;
  return `<svg viewBox="0 0 ${W} ${H}" class="fcg" role="img" aria-label="Frequência cardíaca ao longo do jogo">
    <polyline fill="none" stroke="var(--vermelho)" stroke-width="1.8" points="${v.map(([i, x]) => `${(i / n) * W},${H - ((x - lo) / (hi - lo)) * H}`).join(' ')}"/></svg>`;
}
function htmlZonas(z) {
  if (!z) return '';
  return `<div class="zonas">${z.map((p, i) => (p ? `<i class="z${i + 1}" style="width:${p}%" title="${ZONAS[i]}: ${p}%"></i>` : '')).join('')}</div>
    <div class="mute zleg">${z.map((p, i) => `<span><i class="z${i + 1}"></i>${ZONAS[i].split(' ')[0]} ${p}%</span>`).join('')}</div>`;
}
const fcRef = (saude) => fcMaxIdade(idadeDe(saude?.ano));
function htmlTreino(t, saude) {
  const z = zonas(t.fc, fcRef(saude), saude?.fcRep);
  const pre = [t.sensacao && SENS[t.sensacao], t.sono && `${n1(t.sono, 1)} h de sono`, t.dores && `dores: ${esc(t.dores)}`].filter(Boolean);
  return `<div class="treino"><b>⌚ Relógio</b> <small class="mute">(${t.origem === 'manual' ? 'à mão' : '.' + t.origem})</small><br>
    ${fmtMin(t.dur)} · ❤️ ${n1(t.fcMed)} média (máx ${n1(t.fcMax)}) · 🔥 ${n1(t.kcal)} kcal · 👟 ${n1(t.km, 2)} km
    ${graficoFC(t.fc)}${htmlZonas(z)}${!z && t.fc?.length ? '<div class="mute">Mete o ano de nascimento para veres as zonas de esforço.</div>' : ''}
    ${pre.length ? `<div class="mute">${pre.join(' · ')}</div>` : ''}</div>`;
}
// O que aparece dentro do resumo de cada jogo: o treino ligado a esse jogo (+ botões, se for o próprio).
function extraTreino(jogoId, treinos, saude, leitura) {
  const t = treinos.find((x) => x.jogoId === jogoId);
  const bt = leitura || !saude ? '' : `<button class="peq" data-tr="${esc(jogoId)}">${t ? '✏️ Editar treino / pré-pós' : '⌚ Juntar treino do relógio'}</button>`;
  return (t ? htmlTreino(t, saude) : '') + bt;
}
// Bloco "Dados físicos": consentimento, dados pessoais, médias dos treinos e treinos fora dos jogos.
function blocoFisico(saude, treinos, meus, leitura) {
  if (!saude) return leitura ? '<p class="mute">Este jogador não ativou os dados físicos.</p>' : `<div class="opcao">
    <p>Podes guardar aqui os treinos do teu relógio (Garmin, Apple Watch, Wear OS, Samsung, Fitbit… ou à mão), o peso, a altura e como te sentiste em cada jogo.
      Isto entra nas tuas estatísticas individuais.</p>
    <p class="mute" style="font-size:12px">São dados de saúde: só tu e o organizador (Rui) os veem — ele só os pode ler, não mexe em nada.
      Os ficheiros do relógio não são guardados, só o resumo. Podes apagar tudo quando quiseres.</p>
    <label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="fs-ok" style="width:auto;margin-top:3px"> Aceito guardar os meus dados físicos e de saúde para isto.</label>
    <button class="prim" id="fs-ativar" style="margin-top:8px">Ativar</button></div>`;
  const idade = idadeDe(saude.ano), ult = (saude.pesos || []).at(-1);
  const M = mediasTreinos(treinos);
  const zt = (() => { const todas = treinos.flatMap((t) => t.fc || []); return zonas(todas, fcRef(saude), saude.fcRep); })();
  const fora = treinos.filter((t) => !t.jogoId || !meus.some((r) => r.id === t.jogoId)).sort((a, b) => (b.inicio || 0) - (a.inicio || 0));
  return `<div class="opcao">
    ${leitura ? `<p>Altura <b>${n1(saude.altura)} cm</b> · idade <b>${idade ?? '–'}</b> · FC repouso <b>${n1(saude.fcRep)}</b> · peso <b>${ult ? n1(ult.kg, 1) + ' kg' : '–'}</b></p>` : `
    <div class="fgrid"><label>Altura (cm)<input id="fs-alt" inputmode="numeric" value="${saude.altura ?? ''}"></label>
      <label>Ano de nascimento<input id="fs-ano" inputmode="numeric" value="${saude.ano ?? ''}"></label>
      <label>FC em repouso<input id="fs-rep" inputmode="numeric" value="${saude.fcRep ?? ''}" placeholder="ao acordar"></label>
      <label>Peso hoje (kg)<input id="fs-peso" inputmode="decimal" value="${ult?.kg ?? ''}"></label></div>
    <button class="peq prim" id="fs-gravar">Guardar dados</button>`}
    ${(saude.pesos || []).length > 1 ? `<p class="mute">Peso: ${saude.pesos.slice(-6).map((p) => `${n1(p.kg, 1)} (${p.data.slice(8, 10)}/${p.data.slice(5, 7)})`).join(' → ')}</p>` : ''}
    ${idade ? `<p class="mute">FC máxima estimada pela idade: ${fcRef(saude)} bpm${saude.fcRep ? '' : ' · mete a FC em repouso para zonas mais certas'}</p>` : ''}
    </div>
    ${M.n ? `<div class="opcao"><b>${leitura ? 'Médias' : 'As tuas médias'} com relógio</b> <small class="mute">(${M.n} treino${M.n > 1 ? 's' : ''})</small>
      <div class="fgrid medias"><span>⏱ <b>${fmtMin(M.dur)}</b></span><span>❤️ <b>${n1(M.fcMed)}</b> média</span><span>❤️ <b>${n1(M.fcMax)}</b> máx</span>
        <span>🔥 <b>${n1(M.kcal)}</b> kcal/jogo</span><span>👟 <b>${n1(M.km, 2)}</b> km/jogo</span><span>👟 <b>${n1(M.kmTotal, 1)}</b> km no total</span>
        ${M.sensacao ? `<span>🙂 <b>${n1(M.sensacao, 1)}</b>/5 sensação</span>` : ''}${M.sono ? `<span>😴 <b>${n1(M.sono, 1)}</b> h sono</span>` : ''}</div>
      ${zt ? `<div class="mute" style="margin-top:6px">Tempo em cada zona (todos os treinos)</div>${htmlZonas(zt)}` : ''}
      <p class="mute" style="font-size:12px;margin-bottom:0">Em pavilhão o GPS não funciona: os km são estimados pelo relógio e variam de marca para marca.</p></div>` : ''}
    ${fora.length ? `<b>Treinos fora dos jogos</b>${fora.map((t) => `<div class="opcao">${esc(new Date(t.inicio || t.ts).toLocaleDateString('pt-PT'))} ${htmlTreino(t, saude)}${leitura ? '' : `<button class="peq" data-tr-id="${esc(t.id)}">✏️ Editar</button>`}</div>`).join('')}` : ''}
    ${leitura ? '' : `<div class="linha"><button class="peq" id="fs-novo">⌚ Carregar treino</button><button class="peq perigo" id="fs-apagar">🗑 Apagar os meus dados físicos</button></div>`}`;
}

// Liga os botões da parte física do perfil.
function ligarFisico(eu, todos, saude, treinos, meus) {
  const g = (id) => document.getElementById(id);
  const refrescar = () => perfilEu(eu, todos);
  g('fs-ativar')?.addEventListener('click', async () => {
    if (!g('fs-ok').checked) return toast('Tens de aceitar primeiro');
    try { await DB.setSaude(eu.id, { consentimento: { ts: Date.now(), versao: 1 }, pesos: [] }); } catch (e) { console.error(e); return toast('Não deu para ativar'); }
    refrescar();
  });
  g('fs-gravar')?.addEventListener('click', async () => {
    const nr = (id, lo, hi) => { const v = g(id).value.trim().replace(',', '.'); if (!v) return null; const x = Number(v); return x >= lo && x <= hi ? x : NaN; };
    const alt = nr('fs-alt', 120, 230), ano = nr('fs-ano', 1930, new Date().getFullYear() - 10), rep = nr('fs-rep', 30, 110), kg = nr('fs-peso', 35, 200);
    if ([alt, ano, rep, kg].some((x) => Number.isNaN(x))) return toast('Há um valor fora do normal — confirma');
    const pesos = [...(saude.pesos || [])], hoje = new Date().toISOString().slice(0, 10);
    if (kg != null && pesos.at(-1)?.kg !== kg) { if (pesos.at(-1)?.data === hoje) pesos.pop(); pesos.push({ data: hoje, kg }); }
    try { await DB.setSaude(eu.id, { ...saude, altura: alt, ano, fcRep: rep, pesos }); } catch (e) { console.error(e); return toast('Erro a guardar'); }
    toast('Guardado ✔'); refrescar();
  });
  g('fs-apagar')?.addEventListener('click', async () => {
    if (!confirm('Apagar TODOS os teus dados físicos e treinos? Não há volta atrás.')) return;
    try { await DB.apagarSaude(eu.id); } catch (e) { console.error(e); return toast('Erro a apagar'); }
    toast('Apagado'); refrescar();
  });
  g('fs-novo')?.addEventListener('click', () => formTreino(eu, saude, treinos, meus, null, refrescar));
  document.querySelectorAll('[data-tr]').forEach((b) => (b.onclick = () => formTreino(eu, saude, treinos, meus, b.dataset.tr, refrescar)));
  document.querySelectorAll('[data-tr-id]').forEach((b) => (b.onclick = () => formTreino(eu, saude, treinos, meus, null, refrescar, treinos.find((t) => t.id === b.dataset.trId))));
  // Ficheiro que chegou por "Partilhar → Futebolada": abre o formulário já preenchido (o jogo escolhe-se pela hora).
  if (saude) ficheiroPartilhado().then((f) => {
    if (!f) return;
    document.querySelector('[data-pa="fis"]')?.click();
    formTreino(eu, saude, treinos, meus, null, refrescar, null, f);
  });
  else temPartilhado().then((sim) => sim && toast('Para juntar o treino partilhado, ativa primeiro os dados físicos (separador Físico).'));
}

// "Partilhar → Futebolada" (Android): o service worker guarda o ficheiro na cache 'partilha'; lê-se uma vez e apaga-se.
const PARTILHA = './ficheiro-partilhado';
async function temPartilhado() {
  try { return !!(await (await caches.open('partilha')).match(PARTILHA)); } catch { return false; }
}
async function ficheiroPartilhado() {
  try {
    const c = await caches.open('partilha'), r = await c.match(PARTILHA);
    if (!r) return null;
    await c.delete(PARTILHA);
    return new File([await r.blob()], decodeURIComponent(r.headers.get('X-Nome') || 'treino'));
  } catch (e) { console.error(e); return null; }
}

// Formulário de um treino: ficheiro do relógio (preenche tudo) ou à mão, mais o pré/pós jogo.
function formTreino(eu, saude, treinos, meus, jogoId, depois, existente = null, partilhado = null) {
  const el = document.getElementById('eu-form');
  const t = existente || treinos.find((x) => jogoId && x.jogoId === jogoId) || {};
  let fc = t.fc || [], origem = t.origem || 'manual', inicio = t.inicio || null;
  const dataJogo = (r) => dataDe(r.jogo);
  const jSel = jogoId || t.jogoId || '';
  el.innerHTML = `<div class="opcao form-treino"><b>⌚ Treino do relógio</b>
    <label>Ficheiro do relógio (.FIT, .TCX ou .GPX)</label><input type="file" id="tr-fich" accept=".fit,.tcx,.gpx">
    <details class="mute" style="font-size:12px"><summary>Como tiro o ficheiro do meu relógio?</summary>
      <b>Atalho no Android</b> (com a Futebolada instalada no ecrã inicial): em qualquer app onde tenhas o ficheiro, Partilhar → Futebolada, e o treino abre aqui já ligado ao jogo.<br>
      <b>Garmin:</b> Garmin Connect no browser → a atividade → ⚙ → Exportar original (.FIT).<br>
      <b>Apple Watch:</b> a app HealthFit (iPhone) exporta o treino em .FIT; ou liga ao Strava e usa o passo do Strava.<br>
      <b>Wear OS / Samsung / Pixel / Huawei / Amazfit:</b> liga a app do relógio ao Strava → strava.com no browser → a atividade → ⋯ → Exportar GPX.<br>
      <b>Fitbit:</b> fitbit.com → o treino → ⋯ → Exportar TCX.<br>
      <b>Não consegues?</b> Escreve os números à mão em baixo (vê-os na app do relógio).</details>
    <div id="tr-lido" class="mute"></div>
    <label>Jogo</label><select id="tr-jogo"><option value="">Treino fora dos jogos</option>
      ${meus.map((r) => `<option value="${esc(r.id)}" ${r.id === jSel ? 'selected' : ''}>${esc(dataJogo(r))}</option>`).join('')}</select>
    <div class="fgrid"><label>Duração (min)<input id="tr-dur" inputmode="numeric" value="${t.dur ? Math.round(t.dur / 60) : ''}"></label>
      <label>FC média<input id="tr-fcm" inputmode="numeric" value="${t.fcMed ?? ''}"></label>
      <label>FC máxima<input id="tr-fcx" inputmode="numeric" value="${t.fcMax ?? ''}"></label>
      <label>Calorias<input id="tr-kcal" inputmode="numeric" value="${t.kcal ?? ''}"></label>
      <label>Km<input id="tr-km" inputmode="decimal" value="${t.km ?? ''}"></label></div>
    <b>Pré / pós jogo</b>
    <div class="fgrid"><label>Como te sentiste<select id="tr-sens"><option value="">—</option>${[1, 2, 3, 4, 5].map((k) => `<option value="${k}" ${t.sensacao === k ? 'selected' : ''}>${SENS[k]}</option>`).join('')}</select></label>
      <label>Horas de sono<input id="tr-sono" inputmode="decimal" value="${t.sono ?? ''}"></label></div>
    <label>Dores / lesão (opcional)<input id="tr-dores" maxlength="120" value="${esc(t.dores || '')}"></label>
    <div class="linha" style="margin-top:10px"><button class="prim" id="tr-ok">Guardar</button><button id="tr-cancel">Cancelar</button>
      ${t.id ? '<button class="perigo" id="tr-del">Apagar treino</button>' : ''}</div></div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const g = (id) => document.getElementById(id);
  const lerFich = async (f) => {
    try {
      const r = await lerFicheiro(f);
      fc = r.fc; origem = r.origem; inicio = r.inicio;
      if (r.dur) g('tr-dur').value = Math.round(r.dur / 60);
      if (r.fcMed) g('tr-fcm').value = r.fcMed;
      if (r.fcMax) g('tr-fcx').value = r.fcMax;
      if (r.kcal) g('tr-kcal').value = r.kcal;
      if (r.km) g('tr-km').value = r.km;
      // Junta ao jogo que começou até 3 h antes/depois do treino.
      const jogo = r.inicio && meus.find((x) => Math.abs((x.jogo.inicioEpoch || 0) - r.inicio) < 3 * 3600000);
      if (jogo && !jogoId) g('tr-jogo').value = jogo.id;
      g('tr-lido').innerHTML = `✔ Lido: ${r.inicio ? new Date(r.inicio).toLocaleString('pt-PT') : ''} · ${fc.filter(Boolean).length ? `FC em ${fc.length} blocos de 30 s` : 'sem FC'}${jogo ? ' · ligado ao jogo do mesmo dia' : ''}`;
    } catch (err) { console.error(err); toast(err.message || 'Não deu para ler o ficheiro'); }
  };
  g('tr-fich').onchange = (e) => { if (e.target.files[0]) lerFich(e.target.files[0]); };
  if (partilhado) lerFich(partilhado);
  g('tr-cancel').onclick = () => (el.innerHTML = '');
  g('tr-del')?.addEventListener('click', async () => {
    if (!confirm('Apagar este treino?')) return;
    await DB.deleteTreino(eu.id, t.id); depois();
  });
  g('tr-ok').onclick = async () => {
    const nr = (id) => { const v = g(id).value.trim().replace(',', '.'); return v === '' ? null : Number(v); };
    const d = { jogoId: g('tr-jogo').value || null, origem, inicio, dur: nr('tr-dur') != null ? nr('tr-dur') * 60 : null, fcMed: nr('tr-fcm'), fcMax: nr('tr-fcx'),
      kcal: nr('tr-kcal'), km: nr('tr-km'), fc: fc || [], sensacao: nr('tr-sens'), sono: nr('tr-sono'), dores: g('tr-dores').value.trim() || null, ts: Date.now() };
    if (Object.entries(d).some(([k, v]) => typeof v === 'number' && Number.isNaN(v))) return toast('Há um número mal escrito');
    if (d.fcMed && (d.fcMed < 40 || d.fcMed > 230)) return toast('FC média fora do normal');
    const id = d.jogoId || t.id || 't' + (inicio || Date.now());
    if (d.jogoId && treinos.some((x) => x.jogoId === d.jogoId && x.id !== t.id && x.id !== id)) return toast('Esse jogo já tem um treino — edita-o');
    try {
      await DB.saveTreino(eu.id, id, d);
      if (t.id && t.id !== id) await DB.deleteTreino(eu.id, t.id);
    } catch (e) { console.error(e); return toast('Erro a guardar'); }
    toast('Treino guardado ✔'); depois();
  };
}

// O que mudou na carta desde o último jogo, separado em peso dos votos (jogos novos) e notas novas/alteradas.
function htmlMudanca(mc) {
  const m = mc?.mudanca;
  if (!m) return '<p class="mute" style="text-align:center">As setas ▲▼ comparam com a tua carta antes do último jogo.</p>';
  const sg = (x) => (x > 0 ? '+' : '') + x;
  const tot = m.pesos + m.notas;
  const quando = /^\d{4}-\d{2}-\d{2}$/.test(m.desde || '') ? `${m.desde.slice(8, 10)}/${m.desde.slice(5, 7)}` : m.desde || '';
  if (!tot && !m.pesos && !m.notas) return `<p class="mute" style="text-align:center">Sem mudanças desde o jogo de ${esc(quando)}.</p>`;
  const partes = [m.pesos ? `${sg(m.pesos)} pelo peso dos votos (quem joga mais contigo conta mais)` : '',
    m.notas ? `${sg(m.notas)} por notas novas ou alteradas${m.quantos ? ` (${m.quantos} colega${m.quantos > 1 ? 's' : ''})` : ''}` : ''].filter(Boolean);
  return `<p class="mute mudanca">Desde o jogo de ${esc(quando)}: <b>${sg(tot)}</b> no global — ${partes.join(' e ')}.</p>`;
}

function eloMini(elo) {
  const j = elo?.jogos || 0, pct = elo?.pct ?? 0, max = ELO.maxPct * 100;
  const n = !j || Math.abs(pct) < 1 ? 0 : Math.abs(pct) < max / 3 ? 1 : Math.abs(pct) < (2 * max) / 3 ? 2 : 3;
  const s = !j ? '–' : !n ? '=' : (pct > 0 ? '▲' : '▼').repeat(n);
  return `<div class="elo-mini ${!n ? 'igual' : pct > 0 ? 'sobe' : 'desce'}" title="Elo: ${j} jogo(s)">Elo ${s}${n ? ` <small>${pct > 0 ? '+' : ''}${n1(elo.ajuste, 1)}</small>` : ''}</div>`;
}

// Seta do Elo: a "forma" pelos resultados — ▲ conta acima da carta a fazer as equipas no próximo jogo, ▼ abaixo.
// Nunca mexe na carta. 10 pontos de Elo = 1 ponto de overall.
// Setas pelo peso do ajuste face ao máximo permitido (10 % do overall): ▲ até 1/3, ▲▲ até 2/3, ▲▲▲ perto do máximo.
function htmlElo(elo, ligado) {
  const j = elo?.jogos || 0, pct = elo?.pct ?? 0, aj = elo?.ajuste ?? 0, max = ELO.maxPct * 100;
  const n = Math.abs(pct) < 1 ? 0 : Math.abs(pct) < max / 3 ? 1 : Math.abs(pct) < (2 * max) / 3 ? 2 : 3;
  const s = !j ? '<b class="elo-s igual">–</b>' : !n ? '<b class="elo-s igual">=</b>'
    : `<b class="elo-s ${pct > 0 ? 'sobe' : 'desce'}">${`<i>${pct > 0 ? '▲' : '▼'}</i>`.repeat(n)}</b>`;   // empilhadas
  const q = ['', 'um pouco', 'bastante', 'muito'][n];
  const txt = !j ? 'Ainda sem jogos registados.'
    : !n ? 'Neutro: contas como a tua carta a fazer as equipas.'
    : pct > 0 ? `${q[0].toUpperCase() + q.slice(1)} valorizado no próximo jogo: contas como +${n1(aj, 1)} (${n1(pct, 1)} %) acima da tua carta a fazer as equipas.`
    : `${q[0].toUpperCase() + q.slice(1)} desvalorizado no próximo jogo: contas como ${n1(aj, 1)} (${n1(pct, 1)} %) abaixo da tua carta a fazer as equipas.`;
  return `<div class="opcao elo">${s}<div><b>Elo (forma pelos resultados)</b> <small class="mute">${j} jogo${j === 1 ? '' : 's'} · no máximo ±${max} % da carta</small>
    <div class="mute">${txt}${j && !ligado ? ' O ajuste pelo Elo ainda não está ligado.' : ''} Não mexe na carta.</div></div></div>`;
}

// =====================================================================
// PERFIL DO JOGADOR  (#jogador=<id> e 👤 Eu) — cabeçalho ao estilo zerozero/FotMob e separadores
// Público: só nome, foto, jogos, golos, assistências, resultados e a carta se o Rui as publicou.
// O próprio (com PIN): também a carta pessoal, a idade/altura/peso, o pé com que marca e os dados físicos.
// =====================================================================
async function paginaJogador(id) {
  titulo('Jogador');
  $app.innerHTML = '<div id="pub"><p class="mute">A carregar…</p></div>';
  const [players, perfis] = await Promise.all([DB.listPlayers(), DB.listPerfis()]);
  const todos = juntarPerfis(players, perfis);
  const p = todos.find((x) => x.id === id);
  if (!p) { document.getElementById('pub').innerHTML = vazio('🤷', 'Este jogador não existe.', '<a class="btn" href="#jogadores">Ver os jogadores</a>'); return; }
  // O meu próprio perfil (PIN válido neste telemóvel) abre como no 👤 Eu.
  if (lsGet('meu-perfil') === id && lsGet('perfil-ok-' + id) && (await DB.ligacaoOk(id))) {
    A.pubTab = 'eu';
    return perfilEu(p, todos.filter((x) => x.ativo !== false && !x.convidado));
  }
  const [jogosPub, pub] = await Promise.all([DB.listJogosPub(), DB.getPublic('cartas')]);
  renderPerfil(document.getElementById('pub'), p, { todos, res: lerRes([...jogosPub, ...(await jogosDeFora(p).catch(() => []))]), pub });
}

// Carta publicada pelo Rui (Jogadores › Cartas): as cartas públicas não têm id, liga-se pelo nome.
const cartaPublica = (pub, p) => (pub?.visivel ? pub.cartas?.find((x) => x.p.nome === p.nome)?.c || null : null);
const NOME_POS = Object.fromEntries(POSICOES.map((x) => [x.k, x.nome]));

// Jogos de um jogador (mais recente primeiro) com o lado, o resultado e o que fez.
function jogosDe(id, res) {
  return res.filter((r) => [...(r.jogo.brancos || []), ...(r.jogo.pretos || [])].some((x) => x.id === id)).map((r) => {
    const j = r.jogo, lado = (j.brancos || []).some((x) => x.id === id) ? 'B' : 'P';
    const v = vencedorDe(j), ev = j.eventos || [];
    return { id: r.id, j, lado, r: v === 'E' ? 'E' : v === lado ? 'V' : 'D',
      g: ev.filter((e) => e.tipo !== 'autogolo' && e.marcador === id).length, a: ev.filter((e) => e.assist === id).length,
      gr: (j.turnos || []).some((t) => t.jogador === id) };
  });
}
// Percentil de um valor no plantel (0–100): quantos estão abaixo (empates contam metade).
function percentil(v, todos, maiorMelhor = true) {
  const L = todos.filter((x) => x != null);
  if (v == null || L.length < 2 || L.every((x) => x === L[0])) return null;   // sem variação (ex.: ninguém com trocas de GR): não há comparação
  const abaixo = L.filter((x) => (maiorMelhor ? x < v : x > v)).length, iguais = L.filter((x) => x === v).length - 1;
  return Math.round(((abaixo + iguais / 2) / (L.length - 1)) * 100);
}

// d = { todos, res, pub, proprio?, estado?, mc?, saude?, treinos?, pedido?, carta? }
function renderPerfil(el, p, d) {
  const proprio = !!d.proprio;
  titulo(proprio ? 'O meu perfil' : nomeDe(p));
  const meus = jogosDe(p.id, d.res);
  const S = estatisticas(d.res).map(comMedias), s = S.find((x) => x.id === p.id);
  const m = s || comMedias({ j: 0, jReg: 0, jGR: 0, v: 0, e: 0, d: 0, g: 0, a: 0, ag: 0, grMs: 0, sofr: 0, gm: 0, gs: 0, pd: 0, pe: 0, cab: 0, pen: 0, penT: 0, penDef: 0 });
  // Carta visível: a pública (se o Rui publicou as cartas); o próprio vê a pessoal quando o Rui as mostrar.
  const cartaVis = (proprio && d.estado?.cartasPessoais ? d.mc?.carta : null) || cartaPublica(d.pub, p);
  const pos = cartaVis?.posicao || null;
  const nB = meus.filter((x) => x.lado === 'B').length, nP = meus.length - nB;
  const equipa = meus.length ? (nB >= nP ? 'B' : 'P') : null;
  const idade = proprio && d.saude ? idadeDe(d.saude.ano) : null;
  const est = estatuto(p, meus, d.res);
  const chips = [
    est ? `<span class="pchip">${est.ic} ${est.nome}</span>` : '',
    pos ? `<span class="pchip">${esc(pos)} · ${esc(NOME_POS[pos] || '')}</span>` : '',
    equipa ? `<span class="pchip">${LOGO[equipa]} ${equipa === 'B' ? 'Brancos' : 'Pretos'} <small>${equipa === 'B' ? nB : nP}/${meus.length}</small></span>` : '',
    p.moderador ? '<span class="pchip">🛡 Moderador</span>' : '', p.convidado ? '<span class="pchip">Convidado</span>' : '',
    idade ? `<span class="pchip priv" title="Só tu vês">🔒 ${idade} anos</span>` : '',
  ].join('');
  const real = nomeDe(p) !== p.nome ? `<div class="pnome-real">${esc(p.nome)}</div>` : '';
  const acoes = proprio ? `<div class="pacoes"><a class="btn peq prim" href="#votar">🗳 Votar nos colegas</a><a class="btn peq" href="#definicoes">⚙ Definições</a></div>` : '';
  const cab = `<section class="pcab"><div class="pcab-relva">
      <div class="pfoto">${foto(p)}</div>
      <div class="pinfo"><h1>${esc(nomeDe(p))}</h1>${real}<div class="pchips">${chips}</div></div></div>
    <div class="pnums"><div><b>${m.j}</b><span>Jogos</span></div><div><b>${m.g}</b><span>Golos</span></div><div><b>${m.a}</b><span>Assist.</span></div><div><b>${m.j ? Math.round(m.pv * 100) + '%' : '–'}</b><span>Vitórias</span></div></div>
    ${acoes}</section>`;
  const abas = [['geral', 'Resumo'], ['jogos', `Jogos${meus.length ? ` (${meus.length})` : ''}`], ['stats', 'Estatísticas'], ['conq', '🏅 Conquistas'], ...(proprio ? [['fis', '🔒 Físico']] : [])];
  const fisPorJogo = proprio ? d.mc?.fisico || {} : {};
  if (!abas.some(([k]) => k === A.pAba)) A.pAba = 'geral';
  // Desafios (por jogo e do mês): precisam dos games/.
  DB.listGames().then((games) => { const c = el.querySelector('#p-conq'); if (c) c.innerHTML = htmlConquistas(d.res, p.id, { proprio, fisPorJogo, games }); }).catch(() => {});
  el.innerHTML = `${cab}<div class="tabs ptabs" role="tablist">${abas.map(([k, n]) => `<button role="tab" data-pa="${k}" class="${A.pAba === k ? 'on' : ''}" aria-selected="${A.pAba === k}">${n}</button>`).join('')}</div>
    <div data-painel="geral" ${A.pAba === 'geral' ? '' : 'hidden'}>${painelGeral(p, d, meus, m, proprio, S, cartaVis, est)}</div>
    <div data-painel="jogos" ${A.pAba === 'jogos' ? '' : 'hidden'}>${painelJogos(p, d, meus, proprio)}</div>
    <div data-painel="stats" ${A.pAba === 'stats' ? '' : 'hidden'}>${painelStats(p, S, m, proprio)}</div>
    <div data-painel="conq" id="p-conq" ${A.pAba === 'conq' ? '' : 'hidden'}>${htmlConquistas(d.res, p.id, { proprio, fisPorJogo })}</div>
    ${proprio ? `<div data-painel="fis" ${A.pAba === 'fis' ? '' : 'hidden'}>${Object.keys(fisPorJogo).length ? htmlHeatmap(somarGrelhas(Object.values(fisPorJogo).map((f) => f?.grelha)), 'Onde andaste (todos os jogos)') : ''}<div class="cartao"><div class="cartao-tit">🩺 Dados físicos e relógio <span class="tag">🔒 só tu e o Rui</span></div><div id="eu-form"></div>
      ${blocoFisico(d.saude, d.treinos, meus.map((x) => ({ id: x.id, jogo: x.j })), false)}</div></div>` : ''}`;
  const mostrar = (k) => {
    A.pAba = k;
    el.querySelectorAll('[data-pa]').forEach((b) => { b.classList.toggle('on', b.dataset.pa === k); b.setAttribute('aria-selected', b.dataset.pa === k); });
    el.querySelectorAll('[data-painel]').forEach((x) => (x.hidden = x.dataset.painel !== k));
  };
  el.querySelectorAll('[data-pa]').forEach((b) => (b.onclick = () => mostrar(b.dataset.pa)));
  el.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); mostrar(b.dataset.ir); window.scrollTo(0, 0); }));
  return { mostrar, meus };
}

// Estatuto pela presença: quantos dos jogos registados desde o 1.º jogo dele é que jogou.
function estatuto(p, meus, res) {
  if (!meus.length) return null;
  const desde = meus.at(-1).j.inicioEpoch || 0;
  const total = res.filter((r) => (r.jogo.inicioEpoch || 0) >= desde).length || 1;
  const pc = meus.length / total;
  const [ic, nome] = pc >= 0.75 ? ['⭐', 'Habitual'] : pc >= 0.4 ? ['🔁', 'Regular'] : ['🕐', 'Ocasional'];
  return { ic, nome, pc, total, desde };
}

// Recordes e parcerias, só com os jogos registados (públicos): séries, máximos, com quem joga melhor, quem lhe dá golos.
function recordes(p, meus) {
  const cron = [...meus].reverse();
  const serie = (f) => { let best = 0, cur = 0; for (const x of cron) { cur = f(x) ? cur + 1 : 0; best = Math.max(best, cur); } return best; };
  const comGolos = cron.filter((x) => (x.j.eventos || []).length && !x.j.semGolos);
  let serieMarcar = 0, cur = 0;
  for (const x of comGolos) { cur = x.g > 0 ? cur + 1 : 0; serieMarcar = Math.max(serieMarcar, cur); }
  const maxG = meus.reduce((b, x) => (x.g > (b?.g || 0) ? x : b), null);
  // Colegas de equipa (mesmo lado) e adversários, com o resultado.
  const par = {}, contra = {}, deu = {}, recebeu = {};
  for (const x of meus) {
    const meusLado = x.lado === 'B' ? x.j.brancos : x.j.pretos, outros = x.lado === 'B' ? x.j.pretos : x.j.brancos;
    for (const q of meusLado || []) if (q.id !== p.id) { const o = (par[q.id] ||= { nome: q.nome, j: 0, v: 0 }); o.j++; if (x.r === 'V') o.v++; }
    for (const q of outros || []) { const o = (contra[q.id] ||= { nome: q.nome, j: 0, v: 0 }); o.j++; if (x.r === 'V') o.v++; }
    for (const e of x.j.eventos || []) {
      if (e.assist === p.id && e.marcador) { const o = (deu[e.marcador] ||= { nome: (x.j.brancos || []).concat(x.j.pretos || []).find((y) => y.id === e.marcador)?.nome, n: 0 }); o.n++; }
      if (e.marcador === p.id && e.assist && e.tipo !== 'autogolo') { const o = (recebeu[e.assist] ||= { nome: (x.j.brancos || []).concat(x.j.pretos || []).find((y) => y.id === e.assist)?.nome, n: 0 }); o.n++; }
    }
  }
  const melhor = (o, f) => Object.entries(o).filter(([, v]) => v.j >= 3).sort((a, b) => f(b[1]) - f(a[1]) || b[1].j - a[1].j)[0];
  const top = (o) => Object.entries(o).sort((a, b) => b[1].n - a[1].n)[0];
  return { vit: serie((x) => x.r === 'V'), invicto: serie((x) => x.r !== 'D'), serieMarcar, maxG,
    parceiro: melhor(par, (v) => v.v / v.j), maisJuntos: Object.entries(par).sort((a, b) => b[1].j - a[1].j)[0],
    dificil: melhor(contra, (v) => -v.v / v.j), deu: top(deu), recebeu: top(recebeu) };
}

// Pontos fortes: as melhores áreas da carta (só se a carta estiver visível) e o que os números dizem face ao plantel.
function pontosFortes(p, m, S, carta, est) {
  const L = [];
  if (carta?.stats) {
    const top = AREAS.filter((a) => carta.stats[a.k] != null).sort((a, b) => carta.stats[b.k] - carta.stats[a.k]).slice(0, 2);
    for (const a of top) L.push(['🃏', `${a.nome} ${Math.round(carta.stats[a.k] * 10)}`, 'uma das melhores áreas da carta']);
  }
  if (m.j >= 3) {
    const pop = S.filter((x) => x.j >= 3);
    const pc = (v, arr, maior = true) => percentil(v, arr, maior);
    const g = pc(m.gj, pop.map((x) => x.gj)), a = pc(m.a / m.j, pop.map((x) => x.a / x.j)), v = pc(m.pv, pop.map((x) => x.pv));
    const gr = m.jGR >= 2 ? pc(m.sofr10, pop.filter((x) => x.jGR >= 2).map((x) => x.sofr10), false) : null;
    if (g >= 75) L.push(['⚽', 'Goleador', `${fmtStat('gj', m.gj, m)} golos por jogo — melhor do que ${g}% do plantel`]);
    if (a >= 75 && m.a) L.push(['🅰️', 'Assistente', `${n1(m.a / m.j, 1)} assistências por jogo — melhor do que ${a}% do plantel`]);
    if (v >= 75) L.push(['🏆', 'Ganhador', `${Math.round(m.pv * 100)}% de vitórias — melhor do que ${v}% do plantel`]);
    if (gr >= 75) L.push(['🧤', 'Seguro na baliza', `${fmtStat('sofr10', m.sofr10, m)} golos sofridos por 10 min — melhor do que ${gr}% do plantel`]);
  }
  if (est?.pc >= 0.8 && est.total >= 4) L.push(['📅', 'Sempre presente', `jogou ${Math.round(est.pc * 100)}% dos jogos desde que entrou`]);
  return L;
}

function painelGeral(p, d, meus, m, proprio, S, cartaVis, est) {
  // Última partida
  const u = meus[0];
  const ultima = u ? (() => {
    const outro = u.lado === 'B' ? 'P' : 'B';
    const fez = [u.g && `⚽ ${u.g} golo${u.g > 1 ? 's' : ''}`, u.a && `🅰️ ${u.a} assist.`, u.gr && '🧤 esteve na baliza'].filter(Boolean).join(' · ');
    return `<section class="cartao ultima"><div class="cartao-tit">Última partida<a href="#jogo=${esc(u.id)}">Ver o jogo →</a></div>
      <a class="up" href="#jogo=${esc(u.id)}"><span class="res res-${u.r}">${u.r}</span><span class="up-placar">${LOGO[u.lado]}<b>${marcaDe(u.j, u.lado)} – ${marcaDe(u.j, outro)}</b>${LOGO[outro]}</span>
        <span class="up-data">${esc(diaSemana(u.j))} ${esc(dataDe(u.j))}</span></a>
      <p class="up-fez">${fez || '<span class="mute">Sem golos nem assistências neste jogo.</span>'}</p>
      ${(() => { const f = dnaJogo(u.j, p.id, jogosConq(d.res), { publico: !proprio, fis: proprio ? d.mc?.fisico?.[u.j.gameId || u.id] : null });
        return f.length ? `<ul class="dna-curto">${f.map((x) => `<li>🧬 ${esc(x.txt)}</li>`).join('')}</ul>` : ''; })()}</section>`;
  })() : '';
  const forma = meus.slice(0, 5).reverse();
  const formaH = forma.length ? `<section class="cartao"><div class="cartao-tit">Forma <small class="mute">últimos ${forma.length} · mais recente à direita</small></div>
    <div class="forma">${forma.map((x) => `<a class="fj" href="#jogo=${esc(x.id)}"><span class="res res-${x.r}">${x.r}</span><small>${marcaDe(x.j, x.lado)}–${marcaDe(x.j, x.lado === 'B' ? 'P' : 'B')}</small><small class="mute">${esc(dataDe(x.j).slice(0, 5))}</small></a>`).join('')}</div></section>` : '';
  // Estatuto
  const estH = est ? `<section class="cartao estatuto"><div class="cartao-tit">Estatuto</div><div class="est"><span class="est-ic">${est.ic}</span><div><b>${est.nome}</b>
      <small class="mute">jogou ${meus.length} dos ${est.total} jogos desde o 1.º jogo registado (${esc(new Date(est.desde).toLocaleDateString('pt-PT'))})</small></div>
      <span class="est-pc">${Math.round(est.pc * 100)}%</span></div><div class="pbar-b"><i class="alto" style="width:${Math.round(est.pc * 100)}%"></i></div></section>` : '';
  // Pontos fortes
  const pf = pontosFortes(p, m, S, cartaVis, est);
  const pfH = meus.length ? `<section class="cartao"><div class="cartao-tit">Pontos fortes</div>${pf.length ? `<ul class="pfortes">${pf.map(([ic, t, sub]) => `<li><span>${ic}</span><div><b>${esc(t)}</b><small class="mute">${esc(sub)}</small></div></li>`).join('')}</ul>`
    : `<p class="mute" style="margin:0">${m.j < 3 ? 'Precisa de pelo menos 3 jogos para se destacarem pontos fortes.' : 'Nada acima de 75% do plantel por agora.'}${cartaVis ? '' : ' As áreas da carta entram aqui quando as cartas forem mostradas.'}</p>`}</section>` : '';
  // Recordes e parcerias
  const R = meus.length ? recordes(p, meus) : null;
  const lk = (e) => (e ? `<a class="lnk-j" href="#jogador=${esc(e[0])}">${esc(e[1].nome || '?')}</a>` : '–');
  const recH = R ? `<section class="cartao"><div class="cartao-tit">Recordes e parcerias</div><table class="tficha">
      ${R.maxG?.g ? `<tr><th>Mais golos num jogo</th><td>${R.maxG.g} <small class="mute">(${esc(dataDe(R.maxG.j))})</small></td></tr>` : ''}
      <tr><th>Maior série de vitórias</th><td>${R.vit}</td></tr><tr><th>Jogos seguidos sem perder</th><td>${R.invicto}</td></tr>
      ${R.serieMarcar ? `<tr><th>Jogos seguidos a marcar</th><td>${R.serieMarcar}</td></tr>` : ''}
      ${R.maisJuntos ? `<tr><th>Mais jogos na mesma equipa com</th><td>${lk(R.maisJuntos)} <small class="mute">(${R.maisJuntos[1].j})</small></td></tr>` : ''}
      ${R.parceiro ? `<tr><th>Melhor parceiro <small class="mute">(3+ jogos)</small></th><td>${lk(R.parceiro)} <small class="mute">(${Math.round((R.parceiro[1].v / R.parceiro[1].j) * 100)}% vit.)</small></td></tr>` : ''}
      ${R.dificil ? `<tr><th>Adversário mais difícil</th><td>${lk(R.dificil)} <small class="mute">(${Math.round((R.dificil[1].v / R.dificil[1].j) * 100)}% vit.)</small></td></tr>` : ''}
      ${R.recebeu ? `<tr><th>Quem mais lhe passou para golo</th><td>${lk(R.recebeu)} <small class="mute">(${R.recebeu[1].n})</small></td></tr>` : ''}
      ${R.deu ? `<tr><th>A quem mais deu golos</th><td>${lk(R.deu)} <small class="mute">(${R.deu[1].n})</small></td></tr>` : ''}</table></section>` : '';
  // Ficha de dados: públicos para todos; idade, altura, peso e pé só para o próprio.
  const ult1 = meus.at(-1);
  const linhas = [['Nome', esc(p.nome)], nomeDe(p) !== p.nome ? ['Tratado por', esc(nomeDe(p))] : null,
    ult1 ? ['Primeiro jogo registado', esc(dataDe(ult1.j))] : null, ['Jogos registados', meus.length]];
  if (proprio) {
    const sd = d.saude, pk = (sd?.pesos || []).at(-1);
    if (sd) linhas.push(['Idade', idadeDe(sd.ano) ? idadeDe(sd.ano) + ' anos' : '–', 1], ['Altura', sd.altura ? n1(sd.altura) + ' cm' : '–', 1], ['Peso', pk ? n1(pk.kg, 1) + ' kg' : '–', 1]);
    if (m.pd || m.pe) linhas.push(['Pé com que marca', `${m.pd >= m.pe ? 'direito' : 'esquerdo'} <small class="mute">(dir. ${m.pd} · esq. ${m.pe}${m.cab ? ` · cabeça ${m.cab}` : ''})</small>`, 1]);
  }
  const ficha = `<section class="cartao"><div class="cartao-tit">Dados pessoais</div><table class="tficha">${linhas.filter(Boolean).map(([k, v, priv]) => `<tr><th>${k}${priv ? ' <span title="Só tu vês">🔒</span>' : ''}</th><td>${v}</td></tr>`).join('')}</table>
    ${proprio ? `<p class="mute" style="font-size:12px;margin:8px 0 0">🔒 = só tu (e o Rui) vês.${d.saude ? '' : ' A idade, a altura e o peso aparecem quando ativares os dados físicos (separador 🔒 Físico).'} Para mudar a alcunha, a foto ou o PIN: <a href="#definicoes">⚙ Definições</a>.</p>` : ''}</section>`;
  // Carta de jogador
  let carta = '';
  if (proprio) carta = `<section class="cartao">${d.carta}</section>`;
  else if (cartaVis) carta = `<section class="cartao"><div class="cartao-tit">Carta de jogador</div><div class="eu-carta">${htmlCarta(p, cartaVis)}</div></section>`;
  else carta = `<section class="cartao"><div class="cartao-tit">Carta de jogador</div><p class="mute" style="margin:0">🔒 As cartas são privadas: cada um vê a sua no seu perfil.</p></section>`;
  const sem = !meus.length ? `<div class="cartao">${vazio('⚽', 'Ainda sem jogos registados.')}</div>` : '';
  return `${proprio ? d.pedido || '' : ''}<div class="grelha2"><div>${sem}${ultima}${formaH}${pfH}${recH}${estH}${ficha}</div><aside>${carta}</aside></div>`;
}

// Uma linha de jogo (estilo lista de partidas da FotMob); abre para ver os golos e as equipas.
function linhaJogo(x, id, extra = '', aberto = false, proprio = false) {
  const j = x.j, outro = x.lado === 'B' ? 'P' : 'B';
  const fez = [x.g && `⚽${x.g > 1 ? '×' + x.g : ''}`, x.a && `🅰️${x.a > 1 ? '×' + x.a : ''}`, x.gr && '🧤'].filter(Boolean).join(' ');
  const eq = (e) => (e === 'B' ? j.brancos : j.pretos || []).map((q) => (q.id === id ? `<b class="eu-nome">${esc(q.nome)}</b>` : `<a href="#jogador=${esc(q.id)}">${esc(q.nome)}</a>`)).join('<br>');
  return `<details class="hj"${aberto ? ' open' : ''}><summary><span class="res res-${x.r}">${x.r}</span><span class="hj-data">${esc(dataDe(j))}</span>
      <span class="hj-placar">${LOGO[x.lado]}<b>${marcaDe(j, x.lado)} – ${marcaDe(j, outro)}</b>${LOGO[outro]}</span><span class="hj-fez">${fez}</span></summary>
    <div class="hj-corpo"><a class="hj-ver" href="#jogo=${esc(x.id)}">Ver o jogo completo →</a>${extra}<div class="equipas"><div class="eq branco"><h4>${LOGO.B} Brancos</h4>${eq('B')}</div><div class="eq preto"><h4>${LOGO.P} Pretos</h4>${eq('P')}</div></div>
      ${linhasEventos(j, proprio ? id : null)}</div></details>`;
}
function painelJogos(p, d, meus, proprio) {
  if (!meus.length) return `<div class="cartao">${vazio('⚽', 'Ainda sem jogos registados.')}</div>`;
  return `<section class="cartao lista-hj">${meus.map((x, i) => linhaJogo(x, p.id, proprio ? extraTreino(x.id, d.treinos, d.saude, false) : '', i === 0, proprio)).join('')}</section>`;
}

// Estatísticas: números principais, barras de percentil face ao plantel e a tabela completa.
function painelStats(p, S, m, proprio) {
  if (!m.j) return `<div class="cartao">${vazio('📊', 'As estatísticas aparecem depois do primeiro jogo registado.')}</div>`;
  const comJ = S.filter((x) => x.j > 0);
  const barras = [
    ['Golos por jogo', m.gj, comJ.map((x) => x.gj), (v) => fmtStat('gj', v, m)],
    ['Assistências por jogo', m.j ? m.a / m.j : null, comJ.map((x) => x.a / x.j), (v) => n1(v, 1)],
    ['Vitórias', m.pv, comJ.map((x) => x.pv), (v) => Math.round(v * 100) + '%'],
    ['Pontos por jogo', m.pts / m.j, comJ.map((x) => x.pts / x.j), (v) => n1(v, 1)],
    ['Min. na baliza por jogo', m.grJ, comJ.map((x) => x.grJ), (v) => fmtStat('grJ', v, m)],
    ['Sofridos por 10 min na baliza', m.sofr10, comJ.map((x) => x.sofr10), (v) => fmtStat('sofr10', v, m), false],
  ].map(([nome, v, todos, f, maior = true]) => {
    const pc = percentil(v, todos, maior);
    if (v == null || pc == null) return '';
    const cor = pc >= 67 ? 'alto' : pc >= 34 ? 'medio' : 'baixo';
    return `<div class="pbar"><div class="pbar-t"><span>${nome}</span><b>${f(v)}</b></div><div class="pbar-b"><i class="${cor}" style="width:${Math.max(4, pc)}%"></i></div><small class="mute">melhor do que ${pc}% do plantel</small></div>`;
  }).join('');
  const TOP = ['j', 'pts', 'pv', 'g', 'a', 'gj'];
  // O pé com que marca só para o próprio (decisão do Rui, 21/10).
  const resto = COLS_STATS.filter(([k]) => !TOP.includes(k) && (proprio || !PES.includes(k)));
  return `<div class="destaques">${TOP.map((k) => `<span><b>${fmtStat(k, m[k], m)}</b>${{ pv: '% vitórias', j: 'Jogos', pts: 'Pontos', gj: 'Golos/jogo' }[k] || COLS_STATS.find(([c]) => c === k)[1]}</span>`).join('')}</div>
    <div class="grelha2" style="margin-top:12px"><section class="cartao"><div class="cartao-tit">Comparado com o plantel <small class="mute">${comJ.length} jogadores</small></div>${barras}</section>
    <section class="cartao"><div class="cartao-tit">Tudo</div><table class="tficha">${resto.map(([k, n]) => `<tr><th>${n}${PES.includes(k) ? ' 🔒' : ''}</th><td>${fmtStat(k, m[k], m)}</td></tr>`).join('')}</table>
      <p class="mute" style="font-size:12px;margin:8px 0 0">G/J só conta jogos com golos registados; Min GR/J e Sofr./10min só jogos com as trocas de GR registadas.${proprio ? ' 🔒 = só tu vês.' : ''}</p></section></div>`;
}

// Perfil do próprio (com PIN): o mesmo perfil, mais a carta pessoal, a votação, o Elo e os dados físicos.
// Nunca mostra quem votou nem as notas de cada um — só a carta final, calculada pelo admin.
async function perfilEu(eu, todos) {
  const $app = document.getElementById('pub') || document.getElementById('app');
  confirmarModerador();   // acabou de entrar com o PIN: mostra o separador 🛡 se for moderador
  $app.innerHTML = '<p class="mute">A carregar…</p>';
  const [estado, mc, jogosPub, saude, treinos, pub, players, perfis] = await Promise.all([DB.getPublic('estado'), DB.getMinhaCarta(eu.id).catch(() => null), DB.listJogosPub(),
    DB.getSaude(eu.id).catch(() => null), DB.listTreinos(eu.id).catch(() => []), DB.getPublic('cartas'), DB.listPlayers(), DB.listPerfis()]);
  const res = lerRes([...jogosPub, ...(await jogosDeFora(eu).catch(() => []))]);   // + os jogos da mesma pessoa noutras ligas
  const d = mc?.ref || null;   // carta antes do último jogo: { ov, st, data }
  // Pedido para votar nos novos / atualizar notas.
  let pedido = '';
  {
    const meuVoto = await DB.getVotes(eu.id).catch(() => null);
    const ativos = new Set(todos.map((p) => p.id));
    const L = paraAtualizar(eu.id, meuVoto?.r || {}, meuVoto?.ts, res.map((x) => x.jogo)).filter((x) => ativos.has(x.id));
    const N = porVotar(eu.id, meuVoto?.r || {}, todos);
    const nomes = (ps) => ps.slice(0, 5).map((p) => esc(nomeDe(p))).join(', ') + (ps.length > 5 ? ` e mais ${ps.length - 5}` : '');
    const linhas = [];
    if (N.length) linhas.push(`Ainda não deste nota a ${N.length === 1 ? '' : `${N.length} jogadores: `}<b>${nomes(N)}</b>. Se não conheces, carrega em "Não conheço".`);
    if (L.length) linhas.push(`Já jogaste ${JOGOS_PARA_ATUALIZAR}+ jogos com ${nomes(L.map((x) => todos.find((p) => p.id === x.id)))} desde a última nota que lhes deste.`);
    if (linhas.length) pedido = `<div class="opcao pedido"><b>🗳 ${N.length ? 'Tens jogadores por votar' : 'Atualiza as tuas notas'}</b>
      ${linhas.map((t) => `<p class="mute" style="margin:4px 0 8px">${t}</p>`).join('')}
      <button class="prim peq" id="eu-pedido">Votar agora (leva um minuto)</button></div>`;
  }
  let carta;
  // Cartas escondidas: a mesma carta com tudo a 0 (fictícia) — quando o Rui as mostrar, só mudam os valores.
  if (!estado?.cartasPessoais) carta = `<div class="cartao-tit">Carta de jogador <span class="tag">🔒 só tu</span></div><div class="eu-carta">${htmlCarta(eu, { ficticia: true, overall: 0, stats: Object.fromEntries(AREAS.map((a) => [a.k, 0])) })}</div>
    <p class="mute" style="text-align:center">Carta fictícia — os valores reais aparecem quando o Rui mostrar as cartas.</p>`;
  else if (!mc?.carta) carta = '<div class="cartao-tit">Carta de jogador</div><p class="mute">Ainda não há carta para ti (faltam votos).</p>';
  else carta = `<div class="cartao-tit">Carta de jogador <span class="tag">🔒 só tu</span></div><div class="eu-carta">${htmlCarta(eu, mc.carta, d)}</div>
    ${htmlMudanca(mc)}
    <p class="mute" style="text-align:center">${mc.carta.conhecem ? `Conhecem-te ${mc.carta.conhecem} jogadores.` : ''}</p>`;
  carta += htmlElo(mc?.elo, estado?.usarElo !== false);
  if (estado?.cartasPessoais && mc?.carta) carta += `<h3>Evolução</h3>${graficoEvolucao(mc.hist || [])}`;
  const tudo = juntarPerfis(players, perfis);
  const { meus } = renderPerfil($app, eu, { todos: tudo, res, pub, proprio: true, estado, mc, saude, treinos, pedido, carta });
  ligarFisico(eu, todos, saude, treinos, meus.map((x) => ({ id: x.id, jogo: x.j })));
  // "Juntar treino do relógio" num jogo: o formulário está no separador Físico.
  $app.querySelectorAll('[data-tr]').forEach((b) => b.addEventListener('click', () => {
    $app.querySelector('[data-pa="fis"]').click(); document.getElementById('eu-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.getElementById('eu-pedido')?.addEventListener('click', () => { location.hash = '#votar'; });
}

// Todos os jogadores numa lista com todas as áreas. "Não conheço" ou "OK" fecham o jogador numa linha
// (a seta ▾ volta a abri-lo). Filtro por área opcional, para comparar só o remate, por exemplo.
async function votar(eu, todos) {
  const $app = document.getElementById('pub') || document.getElementById('app');
  const [meuVoto, jogosPub] = await Promise.all([DB.getVotes(eu.id), DB.listJogosPub()]);
  const r = meuVoto?.r || {};
  // Primeiro os jogadores com quem mais jogo (mesma equipa ou contra), no fim aqueles com quem menos jogo.
  const jogos = jogosPub.map((x) => { try { return JSON.parse(x.json || '{}'); } catch { return {}; } }).filter((j) => j.fase === 'fim');
  const juntos = contarConvivio(jogos)[eu.id] || {};
  const atualizar = new Set(paraAtualizar(eu.id, r, meuVoto?.ts, jogos).map((x) => x.id));
  // Vindo do Início ("ajustar os do último jogo"): só os colegas desse jogo.
  const jSo = A.votarJogo ? jogosPub.find((x) => x.id === A.votarJogo) : null;
  const jogoSo = jSo ? JSON.parse(jSo.json || '{}') : null;
  const so = jogoSo ? new Set([...(jogoSo.brancos || []), ...(jogoSo.pretos || [])].map((x) => x.id)) : null;
  // Os que ainda não têm nota minha (jogadores novos) vêm primeiro; depois por jogos juntos.
  const novos = new Set(porVotar(eu.id, r, todos).map((p) => p.id));
  const alvos = todos.filter((p) => p.id !== eu.id && (!so || so.has(p.id)))
    .sort((a, b) => novos.has(b.id) - novos.has(a.id) || (juntos[b.id] || 0) - (juntos[a.id] || 0) || nomeDe(a).localeCompare(nomeDe(b), 'pt'));
  let filtro = 'todos';
  const abertos = new Set();          // abertos à mão depois de fechados
  atualizar.forEach((id) => abertos.add(id));   // os que estão para atualizar aparecem logo abertos
  const fechadosAgora = new Set();    // fechados nesta sessão com OK
  const completo = (p) => notaCompleta(r[p.id]);
  const fechado = (p) => !abertos.has(p.id) && (r[p.id]?.skip || completo(p) || fechadosAgora.has(p.id));

  async function guardar(p, parcial) {
    const antes = r[p.id];
    r[p.id] = { ...(r[p.id] || {}), ...parcial };
    r[p.id].t = Date.now(); atualizar.delete(p.id);
    $app.querySelector(`.vrow[data-id="${p.id}"] .tag-atual`)?.remove();
    try { await DB.saveVote(eu.id, p.id, { ...parcial, t: r[p.id].t }); espelharVoto(p.id, { ...parcial, t: r[p.id].t }); }   // a mesma nota nas outras ligas onde estamos os dois
    catch (e) { console.error(e); r[p.id] = antes; toast('Erro a guardar — tenta outra vez'); }
    atualizarTopo();
  }
  function atualizarTopo() {
    const n = alvos.filter(completo).length;
    const pg = document.getElementById('v-prog'); if (!pg) return;
    pg.style.width = Math.round((n / alvos.length) * 100) + '%';
    document.getElementById('v-cont').textContent = `${n} / ${alvos.length} jogadores feitos`;
  }

  const botoes = (p, k) => `<div class="notas">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
    `<button data-k="${k}" data-n="${n}" class="${r[p.id]?.[k] === n ? 'on' : ''}">${n}</button>`).join('')}</div>`;

  // "Não conheço" (Rui, 23/10): quem já jogou comigo, conheço — não há essa opção. Para os outros fica no fundo do cartão,
  // longe da seta ▾ que se toca para abrir (assim não se carrega nele sem querer).
  const jogouComigo = (p) => (juntos[p.id] || 0) > 0;
  const btnNc = (p, rr) => (rr.skip ? '<button class="nc">Afinal conheço</button>' : jogouComigo(p) ? '' : '<button class="nc">Não conheço</button>');
  function cartao(p) {
    const rr = r[p.id] || {};
    const cab = `${foto(p)}<b>${esc(nomeDe(p))}</b>${atualizar.has(p.id) ? ' <small class="tag-atual" title="Já jogaram 3+ jogos desde a tua nota">⟳ atualizar</small>'
      : novos.has(p.id) && !completo(p) ? ` <small class="tag-atual" title="Ainda não lhe deste nota">${r[p.id] ? '◐ a meio' : '🆕 por votar'}</small>` : ''}`;
    // Fechado: uma linha com o resumo e a seta para reabrir.
    if (fechado(p)) {
      const resumo = rr.skip ? 'não conheço' : AREAS.map((a) => `${a.ab} ${rr[a.k] ?? '–'}`).join(' · ');
      return `<div class="vrow fechado" data-id="${p.id}"><div class="vtop">${cab}<small class="mute vres">${resumo}</small>
        <button class="peq abrir" title="Abrir">▾</button></div></div>`;
    }
    if (filtro !== 'todos') {
      const a = AREAS.find((x) => x.k === filtro);
      return `<div class="vrow" data-id="${p.id}"><div class="vtop">${cab}</div>
        <div class="lbl mute">${a.nome}</div>${botoes(p, a.k)}${btnNc(p, rr) ? `<div class="v-acoes">${btnNc(p, rr)}</div>` : ''}</div>`;
    }
    return `<div class="vrow aberto" data-id="${p.id}">
      <div class="vtop">${cab}${jogouComigo(p) ? `<small class="mute" title="Jogos juntos (mesma equipa ou contra)">${juntos[p.id]} ${juntos[p.id] > 1 ? 'jogos juntos' : 'jogo junto'}</small>` : ''}</div>
      ${rr.skip ? '' : AREAS.map((a) => `<div class="area"><div class="lbl"><span>${a.nome}</span></div>${botoes(p, a.k)}</div>`).join('')}
      <div class="v-acoes"><button class="prim ok">${rr.skip ? 'Fechar' : 'OK ✔'}</button>${btnNc(p, rr)}</div></div>`;
  }

  function redesenhar(p) {
    const velho = $app.querySelector(`.vrow[data-id="${p.id}"]`);
    if (!velho) return;
    const tmp = document.createElement('div'); tmp.innerHTML = cartao(p);
    const novo = tmp.firstElementChild; velho.replaceWith(novo); ligar(novo);
  }

  function ligar(row) {
    const p = alvos.find((x) => x.id === row.dataset.id);
    row.querySelector('.abrir')?.addEventListener('click', () => { abertos.add(p.id); fechadosAgora.delete(p.id); redesenhar(p); });
    row.querySelector('.nc')?.addEventListener('click', async () => {
      const skip = !r[p.id]?.skip;
      await guardar(p, { skip });
      abertos.delete(p.id);
      if (!skip) abertos.add(p.id);       // "afinal conheço" → fica aberto para votar
      redesenhar(p);
    });
    row.querySelector('.ok')?.addEventListener('click', () => {
      abertos.delete(p.id); fechadosAgora.add(p.id); redesenhar(p);
      if (!completo(p) && !r[p.id]?.skip) toast('Ficou incompleto — podes voltar a abrir');
    });
    row.querySelectorAll('.notas button').forEach((b) => (b.onclick = () => {
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      guardar(p, { [b.dataset.k]: Number(b.dataset.n), skip: false });
    }));
  }

  function render() {
    $app.innerHTML = `
      <div class="vcab">
        <div class="linha mute" style="justify-content:space-between"><span id="v-cont"></span>
          <span>${so ? `Colegas do jogo de ${esc(dataDe(jogoSo))} · <a href="#votar" style="color:inherit">votar em todos</a>` : `Olá, ${esc(nomeDe(eu))}`}</span></div>
        <div class="prog"><i id="v-prog"></i></div>
        <div class="atabs"><button class="${filtro === 'todos' ? 'on' : ''}" data-f="todos">Todos</button>
          ${AREAS.map((a) => `<button class="${filtro === a.k ? 'on' : ''}" data-f="${a.k}">${a.nome}</button>`).join('')}</div>
      </div>
      <p class="mute">${filtro === 'todos' ? 'Dá as notas e carrega em OK. "Não conheço" esconde o jogador. A seta ▾ volta a abrir.' : 'Só esta área — sobe e desce para comparar.'} Grava sozinho.</p>
      <div id="lista">${alvos.map(cartao).join('')}</div>
      <button class="prim" id="fim" style="width:100%;margin-top:10px">Terminar</button>`;
    atualizarTopo();
    $app.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filtro = b.dataset.f; render(); }));
    $app.querySelectorAll('#lista .vrow').forEach(ligar);
    document.getElementById('fim').onclick = fim;
  }

  function fim() {
    const faltam = alvos.filter((p) => !completo(p));
    const nc = alvos.filter((p) => r[p.id]?.skip).length;
    $app.innerHTML = `<div class="fim"><div class="grande">⚽</div><h2>Obrigado, ${esc(nomeDe(eu))}!</h2>
      <p>Não conheces: <b>${nc}</b>${faltam.length ? ` · ficaram por fazer: <b>${faltam.length}</b> (${faltam.slice(0, 6).map((p) => esc(nomeDe(p))).join(', ')}${faltam.length > 6 ? '…' : ''})` : ''}</p>
      <p class="mute">Os outros jogadores não veem as tuas notas. Podes voltar a este link quando quiseres para mudar notas — fica sempre a tua última votação.</p>
      <button id="rever">Rever as notas</button></div>`;
    document.getElementById('rever').onclick = render;
  }

  render();
}

// =====================================================================
// CARTAS (#cartas — só existe depois de o admin as publicar)
// =====================================================================
function htmlCarta(p, c, d = null) {
  const st = c?.stats || {};
  const ov = c?.overall;
  return `<div class="carta ${tier(ov)}">
    <div class="ov">${ov ?? '–'}${d ? seta(ov, d.ov) : ''}${c?.posicao ? `<small title="Posição indicativa: ${POSICOES.find((x) => x.k === c.posicao)?.nome}">${c.posicao}</small>` : ''}</div>${c?.ficticia ? '<div class="prov">fictícia</div>' : c?.provisoria || c?.estimada ? `<div class="prov">${c.estimada ? 'estimada' : 'provisória'}</div>` : ''}
    ${foto(p)}<div class="nm">${esc(nomeDe(p))}</div>
    <div class="st">${AREAS.map((a) => `<span><b>${st[a.k] != null ? Math.round(st[a.k] * 10) : '–'}</b>${d ? seta(st[a.k] != null ? Math.round(st[a.k] * 10) : null, d.st?.[a.k]) : ''}<em>${a.ab}</em></span>`).join('')}</div>
  </div>`;
}

// =====================================================================
// ADMIN  (#admin)
// =====================================================================
const A = { tab: 'jog', players: [], votes: [], games: [], sel: new Set(), restr: null };

async function paginaAdmin() {
  document.getElementById('titulo').textContent = 'Admin';
  const u = await DB.user();
  if (!(await DB.isAdmin(u))) {
    $app.innerHTML = `<div class="centro"><p>${u ? `Sem acesso (${esc(u.email)}).` : 'Entra com a conta do administrador.'}</p>
      <button class="prim" id="login">Entrar com Google</button></div>`;
    document.getElementById('login').onclick = async () => { await DB.login(); paginaAdmin(); };
    return;
  }
  // O Rui (admin, Google) fica ligado ao seu perfil de jogador: nunca precisa de PIN.
  DB.getSegredo('perfil').then((p) => p?.eu && DB.contaAdmin(p.eu)).catch((e) => console.error(e));
  await recarregar();
  A.usarElo ??= (await DB.getPublic('estado'))?.usarElo !== false;   // por defeito: ligado (Rui, 28/10)
  renderAdmin();
  publicarRetrato().catch((e) => console.error(e));
  publicarCartasPessoais().then(async () => {
    A.minhas = Object.fromEntries((await DB.listMinhasCartas()).map((x) => [x.id, x]));
    if (A.tab === 'jog' && A.plVista === 'cartas') renderAdmin();
  }).catch((e) => console.error(e));
  publicarPosicoes().catch((e) => console.error(e));
}
async function recarregar() {
  let perfis;
  let jogos;
  let minhas;
  [A.players, perfis, A.votes, A.games, jogos, minhas] = await Promise.all([DB.listPlayers(), DB.listPerfis(), DB.listVotes(), DB.listGames(), DB.listJogosPub(),
    DB.listMinhasCartas().catch(() => [])]);
  A.minhas = Object.fromEntries(minhas.map((x) => [x.id, x]));   // setas (ref. antes do último jogo) e Elo de cada um
  // Quem jogou com quem: só jogos terminados e registados (relógio/telemóvel) — equipas escolhidas não contam (Rui, 14/10).
  const reg = jogos.map((r) => { try { return JSON.parse(r.json || '{}'); } catch { return {}; } }).filter((j) => j.fase === 'fim');
  A.conv = pontosConvivio(reg);      // pontos para o peso dos votos (sobem e descem)
  A.juntos = contarConvivio(reg);    // jogos juntos (só para mostrar)
  // RGPD: quem pediu "sem foto" fica sem a foto do WhatsApp também na base de dados.
  for (const p of A.players) {
    if (p.foto && perfis.find((x) => x.id === p.id)?.foto === '-') {
      const { id, ...d } = p;
      DB.savePlayer({ id, ...d, foto: '' }).catch((e) => console.error(e));
    }
  }
  A.players = juntarPerfis(A.players, perfis);
  A.players.sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt'));
}
async function ctxAdmin() {
  const K = (await DB.getSegredo('partilha'))?.chave;
  const conv = K ? (await DB.listPart(K, 'convidados')).filter((c) => !A.players.some((p) => p.id === c.id)).map((c) => ({ ...c, convidado: true, ativo: c.ativo !== false })) : [];
  const ps0 = [...A.players, ...conv];
  // Quem ainda não tem carta cá (convidado, carta provisória) joga com a nota que tem nas outras ligas.
  const players = comNotaFora(ps0, calcularCartas(ps0.filter((p) => p.ativo !== false), A.votes, A.conv), await notasFora());
  const cartasEq = calcularCartas(players.filter((p) => p.ativo !== false), A.votes, A.conv);
  return {
    players, cartas: cartasEq, games: A.games,
    elo: calcularElo((await DB.listResultados()).map((r) => JSON.parse(r.json || '{}').jogo), cartasEq),
    relogio: [((await DB.getSegredo('perfil')) || {}).eu].filter(Boolean),   // quem tem relógio (por agora o Rui) → desafios ⌚
    async addConvidado(d) { const id = await DB.savePlayer(d); await recarregar(); A.ctxEq = await ctxAdmin(); return id; },
    async notaConvidado(id, n) {
      const p = A.players.find((x) => x.id === id);
      if (p) { const { alias, fotoPropria, ...base } = p; await DB.savePlayer({ ...base, nota100: n }); return; }
      const c = conv.find((x) => x.id === id);
      if (c && K) { const { id: _, convidado, ativo, ...d } = c; await DB.setPart(K, 'convidados', id, { ...d, nota100: n }); }
    },
    async saveGame(g) {
      const id = await DB.saveGame(g);
      if (K) await DB.setPart(K, 'games', id, g);   // o marcador do telemóvel também as vê
      await recarregar(); A.ctxEq = await ctxAdmin();
    },
  };
}

// Carta de cada jogador para o seu perfil (sem votos individuais) + histórico mensal para as setas e o gráfico.
// Corre sempre que o admin abre a app: o mês atual é atualizado, os anteriores ficam como estavam.
async function publicarCartasPessoais() {
  promoverEmprestados().then((n) => n && toast(`${n} emprestado(s) passaram a jogador da liga ✔`)).catch((e) => console.error(e));
  const ativos = A.players.filter((p) => p.ativo !== false && !p.convidado);
  const cartas = calcularCartas(A.players.filter((p) => p.ativo !== false), A.votes, A.conv);
  publicarNotasFora(cartas, A.players).catch((e) => console.error(e));   // a nota geral de cada um para as outras ligas onde joga
  const antes = Object.fromEntries((await DB.listMinhasCartas()).map((x) => [x.id, x]));
  const mes = new Date().toISOString().slice(0, 7);
  const brutos = (await DB.listResultados()).map((r) => { try { return { id: r.id, ...JSON.parse(r.json || '{}') }; } catch { return null; } }).filter((r) => r?.jogo);
  const elo = calcularElo(brutos.map((r) => r.jogo), cartas);
  const fisicoDe = await resumosFisicos(brutos).catch((e) => { console.error(e); return {}; });
  // Último jogo terminado e a carta de cada um com os votos de agora mas os pesos de ANTES desse jogo:
  // separa o que mudou por causa do peso dos votos (o jogo) do que mudou por notas novas/alteradas.
  const jogos = (await DB.listJogosPub()).map((x) => { try { return { id: x.id, ...JSON.parse(x.json || '{}') }; } catch { return null; } })
    .filter((j) => j?.fase === 'fim').sort((a, b) => (a.inicioEpoch || 0) - (b.inicioEpoch || 0));
  const ultimo = jogos.at(-1);
  const cartasPesosAntes = ultimo ? calcularCartas(A.players.filter((p) => p.ativo !== false), A.votes,
    pontosConvivio(jogos.filter((j) => (j.inicioEpoch || 0) < ultimo.inicioEpoch))) : cartas;
  const foto10 = (cc) => ({ ov: cc?.overall ?? null, st: Object.fromEntries(AREAS.map((a) => [a.k, cc?.stats[a.k] != null ? Math.round(cc.stats[a.k] * 10) : null])) });
  const dataJogo = ultimo ? dataDe(ultimo) : null;
  for (const p of ativos) {
    const c = cartas[p.id];
    if (!c || c.overall == null) continue;
    const carta = { stats: c.stats, overall: c.overall, posicao: c.posicao || null, provisoria: !!c.provisoria, estimada: !!c.estimada, conhecem: c.conhecem || 0 };
    const foto = { mes, ov: c.overall, st: Object.fromEntries(AREAS.map((a) => [a.k, c.stats[a.k] != null ? Math.round(c.stats[a.k] * 10) : null])) };
    const hist = [...(antes[p.id]?.hist || [])];
    if (hist.at(-1)?.mes === mes) hist[hist.length - 1] = foto; else hist.push(foto);
    // Referência das setas: a carta como estava antes do último jogo. Muda quando aparece um jogo novo.
    let ref = antes[p.id]?.ref || null;
    if (ref && ultimo && ref.jogoId === ultimo.id && ref.data !== dataJogo) ref = { ...ref, data: dataJogo };
    if (ultimo && ref?.jogoId !== ultimo.id) {
      // Base: a carta guardada, se for de antes deste jogo (já houve uma referência, ou foi gravada antes de ele começar);
      // senão, a melhor aproximação = votos de agora com os pesos de antes do jogo.
      const guardada = antes[p.id]?.carta && (ref || (antes[p.id].ts || 0) < ultimo.inicioEpoch);
      const base = guardada ? foto10(antes[p.id].carta) : foto10(cartasPesosAntes[p.id]);
      ref = { jogoId: ultimo.id, data: dataJogo, ...base };
    }
    const agora = foto10(c), semPesos = foto10(cartasPesosAntes[p.id]);
    const desde = ultimo?.inicioEpoch || 0;
    const quantos = A.votes.filter((v) => v.voter !== p.id && v.r?.[p.id]?.t > desde).length;   // só o número, nunca quem
    const mudanca = ref ? { desde: ref.data, pesos: agora.ov - semPesos.ov, notas: semPesos.ov - ref.ov, quantos } : null;
    const e = elo[p.id];
    const aj = e ? ajusteElo(c.overall, e.forma) : 0;   // pontos de overall que o Elo soma/tira (já com o teto)
    const novo = { carta, hist, ref, mudanca, elo: e ? { forma: Math.round(e.forma), jogos: e.jogos, ultimo: Math.round(e.ultimo), ajuste: Math.round(aj * 10) / 10, pct: Math.round((aj / c.overall) * 1000) / 10 } : null,
      ...(fisicoDe[p.id] ? { fisico: fisicoDe[p.id] } : {}) };
    const { id: _, ts: __, ...velho } = antes[p.id] || {};
    if (JSON.stringify(velho) === JSON.stringify(novo)) continue;   // nada mudou: não gasta escritas
    await DB.setMinhaCarta(p.id, { ...novo, ts: Date.now() });
  }
}

// Resumo físico de cada jogo de quem tem relógio (velocidade, zonas, sprints, heatmap em grelha) → minhacarta/{id}.fisico,
// que só o próprio e o admin leem. O dono do fit é fit.dono (relógios de vários jogadores) ou, por agora, o perfil do Rui.
// O retângulo do campo calcula-se do GPS de todos os jogos juntos e fica em segredos/campo (tem a localização do pavilhão).
async function resumosFisicos(brutos) {
  const P = { ...PERFIL0, ...((await DB.getSegredo('perfil')) || {}) };
  const temFit = (f) => f && ((f.bins || []).length || (f.serie1s || []).length || (f.gps || []).length);
  const comFit = brutos.filter((r) => temFit(r.fit)).sort((a, b) => (a.jogo.inicioEpoch || 0) - (b.jogo.inicioEpoch || 0));
  if (!comFit.length) return {};
  const guardado = (await DB.getSegredo('campo')) || null;
  let campo = guardado;
  // Só se juntam jogos com o GPS no mesmo referencial (formato e origem do relógio) — o do jogo com GPS mais recente.
  const ult = [...comFit].reverse().find((r) => (r.fit.gps || []).length);
  const mesmo = (f) => !!f.gpsXY === !!ult?.fit.gpsXY && (f.gpsRef || null) === (ult?.fit.gpsRef || null);
  const doRef = comFit.filter((r) => ult && mesmo(r.fit));
  const gps = doRef.flatMap((r) => r.fit.gps || []);
  if (guardado && ult && (!!guardado.xy !== !!ult.fit.gpsXY || (guardado.ref || null) !== (ult.fit.gpsRef || null))) campo = null;
  // Ponta dos balneários: enviada pelo relógio no aquecimento (fit.balnearios, no mesmo formato do GPS) ou guardada antes.
  const balnearios = doRef.map((r) => r.fit.balnearios).find(Boolean) || (campo ? guardado?.balnearios : null) || null;
  if (gps.length && (gps.length !== campo?.nPontos || balnearios !== (campo?.balnearios || null))) {
    const novo = campoDeNuvem(gps, balnearios, { xy: !!ult.fit.gpsXY, ref: ult.fit.gpsRef || null });
    if (novo) { campo = { ...novo, nPontos: gps.length, balnearios, ts: Date.now() }; await DB.setSegredo('campo', campo); }
  }
  const out = {};
  for (const r of comFit) {
    const dono = r.fit.dono || P.eu;
    if (!dono) continue;
    const res = resumoFisico(r.jogo, r.fit, dono, { campo });
    if (res) (out[dono] ||= {})[r.jogo.gameId || r.id] = { ...res, data: dataDe(r.jogo) };
  }
  return out;
}

// Atualiza o "retrato" que o link de colaborador lê (notas finais, sem votos individuais).
async function publicarRetrato() {
  const K = (await DB.getSegredo('partilha'))?.chave;
  if (!K) return;
  // Os moderadores (com PIN) leem a chave em moderacao/chave para fazer equipas e marcar sem o link.
  if ((await DB.getModeracao('chave').catch(() => null))?.chave !== K) await DB.setModeracao('chave', { chave: K });
  const fora = await notasFora();
  const ativos0 = A.players.filter((p) => p.ativo !== false);
  const ativos = comNotaFora(ativos0, calcularCartas(ativos0, A.votes, A.conv), fora);
  const cartas = calcularCartas(ativos, A.votes, A.conv);
  // fora: a nota de fora dos convidados do link (não estão no plantel), já feita — o moderador não lê as outras ligas.
  await DB.setPart(K, 'dados', 'retrato', { ts: Date.now(), fora, jogadores: ativos.map((p) => ({
    id: p.id, nome: p.nome, alias: p.alias || '', foto: p.fotoPropria || p.foto || '', convidado: !!p.convidado,
    notaConvidado: p.notaConvidado || null, nota100: p.nota100 ?? null, overall: cartas[p.id]?.overall ?? null, stats: cartas[p.id]?.stats || {},
  })) });
}

// Ícones de traço (o mesmo desenho da barra de navegação) para o menu do admin.
const ICA = {
  plantel: '<path d="M8.5 3 4 5 2.5 10l3 1V21h13V11l3-1L20 5l-4.5-2a3.5 3.5 0 0 1-7 0z"/>',
  equipas: '<path d="M12 3v18M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0zM8 21h8"/>',
  jogos: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  elo: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  saude: '<path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 0 0-7.1 7.1L12 21l8.4-8.3a5 5 0 0 0 0-7.1z"/><path d="M3.5 12h4l1.5-3 3 6 1.5-3h7"/>',
  tickets: '<path d="M8 7.5V6a4 4 0 0 1 8 0v1.5"/><rect x="6.5" y="7.5" width="11" height="12.5" rx="5.5"/><path d="M12 11v9M3 12h3.5M17.5 12H21"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
const ic = (k) => `<svg class="ica" viewBox="0 0 24 24" aria-hidden="true">${ICA[k]}</svg>`;
// Menu do admin por grupos: no computador, lista de cima para baixo à esquerda; no telemóvel, os grupos em cima e as secções por baixo.
const MENU_ADMIN = [
  ['Plantel', [['jog', 'Plantel e cartas', 'plantel']]],
  ['Jogo', [['equipas', 'Equipas', 'equipas'], ['jogos', 'Jogos', 'jogos']]],
  ['Dados', [['stats', 'Elo', 'elo'], ['saude', 'Saúde', 'saude']]],
  ['Sistema', [['tickets', 'Tickets', 'tickets'], ['part', 'Link de colaborador', 'link']]],
];
function renderAdmin() {
  if (A.tab === 'cartas') A.tab = 'jog';   // as Cartas passaram para o Plantel
  if (A.tab === 'vot') { A.tab = 'jog'; A.plVista = 'votacao'; }   // e a Votação também
  const grupo = MENU_ADMIN.find(([, L]) => L.some(([k]) => k === A.tab)) || MENU_ADMIN[0];
  A.ultimoDoGrupo ||= {};
  A.ultimoDoGrupo[grupo[0]] = A.tab;
  const botao = (k, n, i) => `<button role="tab" aria-selected="${A.tab === k}" data-t="${k}" class="${A.tab === k ? 'on' : ''}">${ic(i)}<span>${n}</span></button>`;
  $app.innerHTML = `<div class="adm">
    <nav class="amenu-d" aria-label="Secções do admin">${MENU_ADMIN.map(([g, L]) => `<div class="ag"><div class="agt">${g}</div>${L.map(([k, n, i]) => botao(k, n, i)).join('')}</div>`).join('')}</nav>
    <div class="acorpo">
      <div class="amenu-m"><div class="seg" role="tablist">${MENU_ADMIN.map(([g]) => `<button data-g="${g}" class="${g === grupo[0] ? 'on' : ''}">${g}</button>`).join('')}</div>
        ${grupo[1].length > 1 ? `<div class="tabs" role="tablist">${grupo[1].map(([k, n, i]) => botao(k, n, i)).join('')}</div>` : ''}</div>
      <div id="sec"></div></div></div>`;
  $app.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { A.tab = b.dataset.t; renderAdmin(); }));
  $app.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => {
    const L = MENU_ADMIN.find(([g]) => g === b.dataset.g)[1];
    A.tab = A.ultimoDoGrupo[b.dataset.g] || L[0][0]; renderAdmin();
  }));
  tabAtivoVisivel();
  const sec = document.getElementById('sec');
  if (A.tab === 'equipas') { sec.innerHTML = '<p class="mute">A carregar…</p>'; ctxAdmin().then((X) => { A.ctxEq = X; secEquipas(sec, X); }); return; }
  ({ jog: secJogadores, jogos: secJogos, stats: secEstatisticas, saude: secSaude, tickets: secTickets, part: secPartilhar })[A.tab](sec);
}

// GR que sofreu: o relógio grava-o no golo; jogos antigos deduzem-no pelos turnos.
const PARTE = { pd: 'pé dir.', pe: 'pé esq.', cab: 'cabeça', out: 'outro', pen: 'penálti' };
const grSofreu = (j, ev) => ev.gr || (j.turnos || []).find((x) => x.equipa !== ev.equipa && ev.t >= x.de && ev.t < x.ate)?.jogador;

// ---------- Estatísticas de todos os jogos (a partir do que o relógio envia) ----------
export function estatisticas(resultados) {
  const S = {};
  const linha = (id, nome) => (S[id] ||= { id, nome, j: 0, jReg: 0, jGR: 0, v: 0, e: 0, d: 0, g: 0, a: 0, ag: 0, grMs: 0, sofr: 0, gm: 0, gs: 0, pd: 0, pe: 0, cab: 0, pen: 0, penT: 0, penDef: 0 });
  for (const { jogo: j } of resultados) {
    if (!j || j.fase !== 'fim') continue;
    const { B: gB, P: gP } = placarDe(j), venc = vencedorDe(j);
    // Só contam para as médias os jogos com registos (decisão do Rui, 21/10): golos registados (não "só o vencedor")
    // e trocas de GR registadas (sem turnos não se sabe quem esteve na baliza).
    const reg = !j.semGolos, temGR = (j.turnos || []).length > 0;
    for (const [e, lista] of [['B', j.brancos || []], ['P', j.pretos || []]]) {
      const meus = e === 'B' ? gB : gP, deles = e === 'B' ? gP : gB;
      for (const p of lista) {
        const s = linha(p.id, p.nome);
        s.nome = p.nome; s.j++; if (reg) { s.jReg++; s.gm += meus; s.gs += deles; } if (temGR) s.jGR++;
        if (venc === e) s.v++; else if (venc === 'E') s.e++; else s.d++;
      }
    }
    for (const ev of j.eventos) {
      if (ev.tipo === 'autogolo') { if (S[ev.marcador]) S[ev.marcador].ag++; continue; }
      if (S[ev.marcador]) { S[ev.marcador].g++; if (ev.parte && ev.parte !== 'out') S[ev.marcador][ev.parte]++; }
      if (ev.assist && S[ev.assist]) S[ev.assist].a++;
      const q = temGR ? grSofreu(j, ev) : null;
      if (q && S[q]) S[q].sofr++;
    }
    for (const t of j.turnos || []) if (S[t.jogador]) S[t.jogador].grMs += t.ate - t.de;
    // Penáltis: marcados/tentados por quem bate; defesas para o GR.
    for (const pn of j.penaltis || []) {
      if (S[pn.marcador]) { S[pn.marcador].penT++; if (pn.resultado === 'golo') S[pn.marcador].pen++; }
      if (pn.resultado === 'defendido' && S[pn.gr]) S[pn.gr].penDef++;
    }
  }
  return Object.values(S);
}

// Médias e totais de cada jogador a partir das estatísticas dos jogos.
const comMedias = (s) => ({ ...s, pts: s.v * 3 + s.e, pv: s.j ? s.v / s.j : 0, gj: s.jReg ? s.g / s.jReg : null, grJ: s.jGR ? s.grMs / s.jGR : null,
  sofr10: s.grMs ? s.sofr / (s.grMs / 600000) : null });
const fmtStat = (k, v, s) => k === 'pen' ? (s.penT ? `${v}/${s.penT}` : '–') : v == null ? '–' : k === 'pv' ? Math.round(v * 100) + '%' : k === 'gj' || k === 'sofr10' ? v.toFixed(1).replace('.', ',') : k === 'grJ' ? Math.round(v / 60000) : v;
const COLS_STATS = [['j', 'J'], ['v', 'V'], ['e', 'E'], ['d', 'D'], ['pts', 'Pts'], ['pv', '%V'], ['g', 'Golos'], ['gj', 'G/J'], ['a', 'Assist.'], ['pd', 'Pé D'], ['pe', 'Pé E'], ['cab', 'Cab.'], ['pen', 'Pen.'], ['ag', 'AG'], ['grJ', 'Min GR/J'], ['sofr10', 'Sofr./10min'], ['penDef', 'Pen. def.']];

// Últimos 5 resultados de um jogador (do mais antigo para o mais recente), para a coluna Forma da tabela.
function formaDe(id, res) {
  return res.map((r) => r.jogo).filter((j) => j?.fase === 'fim' && [...(j.brancos || []), ...(j.pretos || [])].some((x) => x.id === id))
    .sort((a, b) => (b.inicioEpoch || 0) - (a.inicioEpoch || 0)).slice(0, 5).reverse()
    .map((j) => { const lado = (j.brancos || []).some((x) => x.id === id) ? 'B' : 'P', v = vencedorDe(j); return v === 'E' ? 'E' : v === lado ? 'V' : 'D'; });
}
// modo 'publico': nunca o pé; cabeça e penáltis só com "Mais informações" (decisão do Rui, 21/10). 'admin': tudo.
const MAIS_INFO = ['cab', 'pen', 'penDef'];
function tabelaStats(el, res, players, ord = 'pts', destaque = null, modo = 'admin') {
  const nomeAtual = (s) => nomeDe(players.find((p) => p.id === s.id) || { nome: s.nome });
  const L = estatisticas(res).map(comMedias);
  const cols = [['nome', 'Jogador'], ...COLS_STATS].filter(([k]) => modo !== 'publico' || (!PES.includes(k) && (A.statsMais || !MAIS_INFO.includes(k))));
  // Ordem: por defeito Pontos (maior primeiro); tocar de novo na mesma coluna inverte. Desempate: %V, golos, nome.
  // Nome e Sofr./10min começam do menor para o maior. Sem valor (–) fica sempre no fim.
  const cresce = (ord === 'nome' || ord === 'sofr10') !== !!A.statsInv;
  const Mmin = minutosJogados(res);
  const desemp = (x) => (ord === 'g' || ord === 'a' ? porMin(Mmin, x, ord) : 0);   // golos/assist.: por minuto jogado
  const val = (s) => (ord === 'nome' ? null : s[ord]);
  L.sort((x, y) => {
    if (ord === 'nome') return (cresce ? 1 : -1) * nomeAtual(x).localeCompare(nomeAtual(y), 'pt');
    const a = val(x), b = val(y);
    if (a == null || b == null) return (a == null) - (b == null);
    // Golos/assist.: depois por minuto jogado e por fim o nome (Rui, 23/10). O resto: %V, golos e nome.
    if (ord === 'g' || ord === 'a') return (cresce ? a - b : b - a) || (cresce ? desemp(x) - desemp(y) : desemp(y) - desemp(x)) || nomeAtual(x).localeCompare(nomeAtual(y), 'pt');
    return (cresce ? a - b : b - a) || y.pv - x.pv || y.g - x.g || nomeAtual(x).localeCompare(nomeAtual(y), 'pt');
  });
  const fmt = fmtStat, pub = modo === 'publico';
  const lugar = ord === 'nome' ? L.map((_, i) => i + 1) : lugares(L, (x) => (x[ord] == null ? -Infinity : cresce ? -x[ord] : x[ord]), (x) => (cresce ? -desemp(x) : desemp(x)));
  const jogos = res.filter((r) => r.jogo?.fase === 'fim').length;
  // Telemóvel (pedido do Rui, 23/10: nada de arrastar para o lado): a tabela pública mostra só as colunas que cabem,
  // com a forma por baixo do nome. "Mais informações" troca para as outras colunas; tudo o resto está no perfil de cada um.
  const estreito = pub && innerWidth < 600;
  const CURTO = { j: 'J', v: 'V', e: 'E', d: 'D', pts: 'Pts', pv: '%V', g: 'G', gj: 'G/J', a: 'A', ag: 'AG', cab: 'Cab', pen: 'Pen', grJ: 'GR', sofr10: 'Sofr', penDef: 'PD' };
  let vis = cols;
  if (estreito) {
    const base = A.statsMais ? ['nome', 'v', 'e', 'd', 'gj', 'ag', 'cab', 'pen'] : ['nome', 'j', 'pts', 'g', 'a', 'pv'];
    if (!base.includes(ord)) base[base.length - 1] = ord;   // a coluna por que se ordena fica sempre à vista
    vis = base.map((k) => cols.find(([c]) => c === k)).filter(Boolean).map(([k, n]) => [k, k === 'nome' ? n : CURTO[k] || n]);
  }
  const forma = (id) => formaDe(id, res).map((r) => `<i class="res-${r}" title="${r === 'V' ? 'Vitória' : r === 'E' ? 'Empate' : 'Derrota'}">${r}</i>`).join('');
  el.innerHTML = `<p class="mute">${jogos} jogos registados. Toca num cabeçalho (ou usa "Ordenar por") para ordenar; tocar outra vez inverte.<br><small>G/J só conta jogos com golos registados; Min GR/J e Sofr./10min só jogos com as trocas de GR registadas.</small></p>
    <div class="linha" style="margin-bottom:8px"><label style="margin:0">Ordenar por <select id="st-ord" style="width:auto">${cols.map(([k, n]) => `<option value="${k}" ${k === ord ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="peq" id="st-inv" title="Inverter a ordem">${cresce ? '▲ menor primeiro' : '▼ maior primeiro'}</button>
      ${modo === 'publico' ? `<button class="peq" id="st-mais">${A.statsMais ? '▾ Menos informações' : '▸ Mais informações'}</button>` : ''}</div>
    <div class="tscroll"><table class="tstats${pub ? ' liga' : ''}${estreito ? ' estreita' : ''}"><tr>${vis.map(([k, n]) => `<th data-o="${k}" style="cursor:pointer;${k === ord ? 'color:var(--verde)' : ''}">${n}${k === ord ? (cresce ? ' ▲' : ' ▼') : ''}</th>`).join('')}${pub && !estreito ? '<th>Forma</th>' : ''}</tr>
    ${L.map((s, i) => `<tr${s.id === destaque ? ' class="eu"' : ''}>${vis.map(([k]) => `<td${k === ord ? ' class="ord"' : ''}>${k === 'nome' ? (pub ? `<span class="tpos p${lugar[i]}">${lugar[i]}</span><a class="lnk-j" href="#jogador=${esc(s.id)}">${esc(nomeAtual(s))}</a>${estreito ? `<span class="tforma mini">${forma(s.id)}</span>` : ''}` : esc(nomeAtual(s))) : fmt(k, s[k], s)}</td>`).join('')}${pub && !estreito ? `<td class="tforma">${forma(s.id)}</td>` : ''}</tr>`).join('')}</table></div>
    ${estreito ? `<p class="mute" style="font-size:12px;margin:8px 0 0">${A.statsMais ? 'V/E/D = vitórias, empates, derrotas · AG = autogolos · Cab = golos de cabeça · Pen = penáltis marcados.' : 'J = jogos · Pts = pontos (3 por vitória, 1 por empate) · G = golos · A = assistências.'} Toca num nome para ver tudo.</p>` : ''}`;
  el.querySelectorAll('[data-o]').forEach((th) => (th.onclick = () => { if (th.dataset.o === ord) A.statsInv = !A.statsInv; else A.statsInv = false; tabelaStats(el, res, players, th.dataset.o, destaque, modo); }));
  el.querySelector('#st-ord').onchange = (e) => { A.statsInv = false; tabelaStats(el, res, players, e.target.value, destaque, modo); };
  el.querySelector('#st-inv').onclick = () => { A.statsInv = !A.statsInv; tabelaStats(el, res, players, ord, destaque, modo); };
  el.querySelector('#st-mais')?.addEventListener('click', () => { A.statsMais = !A.statsMais; tabelaStats(el, res, players, ord, destaque, modo); });
}

// ---------- Jogos (resultados enviados pelo relógio) ----------
const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- Saúde: análise de um jogo a partir do que o relógio envia ----------
// Perfil do Rui (guardado em segredos/perfil). FC máx. por defeito: Tanaka (208 − 0,7 × idade).
const PERFIL0 = { idade: 35, sexo: 'M', altura: 186, peso: 92, fcMax: 184, fcRep: 60 };

// Zonas por % da FC máx.; TRIMP de Banister (homem): Σ min × FCr × 0,64 × e^(1,92 FCr), FCr = FC de reserva.
function analisarFC(amostras, P, intervalos = null) {
  const pts = intervalos ? amostras.filter(([t]) => intervalos.some(([a, b]) => t >= a && t < b)) : amostras;
  if (pts.length < 2) return null;
  const zonas = [0, 0, 0, 0, 0, 0];
  let trimp = 0, acima85 = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = Math.min(pts[i][0] - pts[i - 1][0], 10000); // ignora buracos > 10 s
    const hr = pts[i][1], pct = hr / P.fcMax;
    zonas[pct >= 0.9 ? 5 : pct >= 0.8 ? 4 : pct >= 0.7 ? 3 : pct >= 0.6 ? 2 : pct >= 0.5 ? 1 : 0] += dt;
    if (pct >= 0.85) acima85 += dt;
    const r = Math.max(0, Math.min(1, (hr - P.fcRep) / (P.fcMax - P.fcRep)));
    trimp += (dt / 60000) * r * 0.64 * Math.exp(1.92 * r);
  }
  const bpm = pts.map((p) => p[1]);
  return { media: Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length), max: Math.max(...bpm), zonas, trimp: Math.round(trimp), acima85 };
}

// Movimento a partir dos bins de 5 s: [t, passos, accMédia, accPico, pressão, temperatura].
const BANDAS = [['parado', 0], ['a andar', 30], ['trote', 120], ['corrida', 150], ['sprint', 175]];
function analisarMovimento(f) {
  const bins = f.bins || [];
  if (!bins.length) return null;
  const a = f.calib?.a ?? -0.385, b = f.calib?.b ?? 0.0105;
  const passada = (cad) => Math.max(0.45, Math.min(2.2, a + b * cad));
  const porBanda = BANDAS.map(([n]) => ({ n, m: 0, ms: 0 }));
  let dist = 0, passos = 0, sprints = 0, emSprint = false, melhor1min = 0, temp = [];
  bins.forEach((x, i) => {
    const cad = x[1] * 12;                     // passos/min (bin de 5 s)
    const m = x[1] ? x[1] * passada(cad) : 0;
    dist += m; passos += x[1];
    const k = BANDAS.reduce((acc, [, lim], j) => (cad >= lim ? j : acc), 0);
    porBanda[k].m += m; porBanda[k].ms += 5000;
    if (k === 4 && !emSprint) sprints++;
    emSprint = k === 4;
    const janela = bins.slice(Math.max(0, i - 11), i + 1).reduce((s, y) => s + (y[1] ? y[1] * passada(y[1] * 12) : 0), 0);
    melhor1min = Math.max(melhor1min, janela);
    if (x[5] > 20 && x[5] < 45) temp.push(x[5]);
  });
  return { dist, passos, sprints, porBanda, melhor1min, calibrado: (f.calib?.pontos || []).length >= 2,
    temp: temp.length ? temp.reduce((s, v) => s + v, 0) / temp.length : null,
    cad: passos / (bins.length * 5 / 60) };
}

function htmlSaude(j, f, P, eu) {
  const fc = analisarFC(f.hr || [], P);
  const mov = analisarMovimento(f);
  if (!fc && !mov) return '';
  const meusGR = (j.turnos || []).filter((t) => t.jogador === eu).map((t) => [t.de, t.ate]);
  const naBaliza = eu && meusGR.length ? analisarFC(f.hr || [], P, meusGR) : null;
  const durMin = (j.fimEpoch - j.inicioEpoch - (j.pausaTotal || 0)) / 60000;
  const recup = f.hrFim && f.hr60 ? f.hrFim - f.hr60 : null;
  const recupTxt = recup == null ? '' : recup >= 25 ? 'muito boa' : recup >= 18 ? 'boa' : recup >= 12 ? 'normal' : 'fraca';
  const zn = ['<50%', '50–60', '60–70', '70–80', '80–90', '90+'];
  const km = (m) => (m / 1000).toFixed(2);
  return `<h3>A minha saúde neste jogo</h3>
    ${fc ? `<p>❤ média <b>${fc.media}</b> · máx <b>${fc.max}</b> (${Math.round(fc.max / P.fcMax * 100)}% da máx.) · acima de 85%: <b>${mmss(fc.acima85)}</b><br>
      Carga de treino (TRIMP): <b>${fc.trimp}</b> <span class="mute">${fc.trimp < 50 ? 'leve' : fc.trimp < 100 ? 'moderada' : fc.trimp < 150 ? 'alta' : 'muito alta'}</span>
      ${recup != null ? `<br>Recuperação 1 min: ${f.hrFim} → ${f.hr60} (<b>−${recup}</b> bpm, ${recupTxt})` : ''}
      ${naBaliza ? `<br>Na baliza ❤ ${naBaliza.media} vs jogo todo ${fc.media}` : ''}</p>
      <table><tr><th>% FC máx</th>${zn.map((z) => `<th>${z}</th>`).join('')}</tr><tr><td>tempo</td>${fc.zonas.map((ms) => `<td>${mmss(ms)}</td>`).join('')}</tr></table>` : ''}
    ${mov ? `<p>🏃 <b>${km(mov.dist)} km</b> ${mov.calibrado ? '' : '<span class="mute">(sem calibração — faz o aquecimento)</span>'} · ${mov.passos} passos · cadência média ${Math.round(mov.cad)}/min<br>
      Sprints: <b>${mov.sprints}</b> · melhor minuto: ${Math.round(mov.melhor1min)} m · ritmo médio ${durMin ? Math.round(mov.dist / durMin) : 0} m/min
      ${f.calorias ? ` · ${Math.round(f.calorias)} kcal` : ''}${mov.temp ? ` · pulso ${mov.temp.toFixed(1)} °C` : ''}
      ${f.distancia ? `<br><span class="mute">Distância pelo próprio relógio: ${km(f.distancia)} km</span>` : ''}</p>
      <table><tr><th></th>${mov.porBanda.map((x) => `<th>${x.n}</th>`).join('')}</tr>
        <tr><td>tempo</td>${mov.porBanda.map((x) => `<td>${mmss(x.ms)}</td>`).join('')}</tr>
        <tr><td>metros</td>${mov.porBanda.map((x) => `<td>${Math.round(x.m)}</td>`).join('')}</tr></table>` : ''}`;
}

// ---------- Jogos (admin): lista compacta (data + resultado); tocar abre o editor para corrigir ----------
async function secJogos(el) {
  const [brutos, pubs] = await Promise.all([DB.listResultados(), DB.listJogosPub()]);
  const res = brutos.map((r) => ({ id: r.id, bruto: r, ...JSON.parse(r.json || '{}') })).filter((r) => r.jogo)
    .sort((a, b) => (b.jogo.inicioEpoch || 0) - (a.jogo.inicioEpoch || 0));
  const P = { ...PERFIL0, ...((await DB.getSegredo('perfil')) || {}) };
  const eu = P.eu || A.players.find((p) => p.nome === 'Bessa')?.id || '';
  const ORIG = { telemovel: '📱 telemóvel', relogio: '⌚ relógio', manual: '✍️ à mão', simulado: '🧪 simulado' };
  const linha = (r) => {
    const j = r.jogo, nG = (j.eventos || []).length;
    const meio = j.semGolos ? (vencedorDe(j) === 'E' ? 'E' : vencedorDe(j) === 'B' ? 'V – D' : 'D – V') : `${marcaDe(j, 'B')} – ${marcaDe(j, 'P')}`;
    return `<button class="jadm" data-j="${esc(r.id)}"><span class="jr-dt"><b>${diaSemana(j)}</b>${esc(dataDe(j))}</span>${LOGO.B}<b class="jr-res">${meio}</b>${LOGO.P}
      <span class="mute jadm-info">${ORIG[j.origem || r.origem] || esc(j.origem || r.origem || '')}${nG ? ` · ${nG} golo${nG > 1 ? 's' : ''}` : ''}</span><span class="jr-seta">›</span></button>`;
  };
  el.innerHTML = `<div class="secbar"><div><h2>Jogos</h2><p class="mute">${res.length} registados · toca num jogo para corrigir o resultado, um minuto, um golo, uma assistência ou o guarda-redes.</p></div></div>
    <div id="j-abertos"></div>
    <section class="cartao lista-adm">${res.length ? res.map(linha).join('') : '<p class="mute" style="margin:0">Ainda não chegou nenhum jogo do relógio nem do marcador do telemóvel.</p>'}</section>
    <details class="cartao"><summary><b>⌚ Relógio e o meu perfil físico</b> <span class="mute">(para a análise de esforço dos teus jogos)</span></summary>
      <div class="linha" style="margin-top:10px">
        <span class="mute">Perfil: ${P.idade} anos · ${P.altura} cm · ${P.peso} kg</span>
        <label style="margin:0" title="Frequência cardíaca máxima (batimentos por minuto). Estimada: 208 − 0,7 × idade.">❤ FC máx.</label><input id="fcmax" type="number" value="${P.fcMax}" style="width:80px">
        <label style="margin:0" title="Batimentos em repouso, de manhã ao acordar (o relógio mostra).">FC repouso</label><input id="fcrep" type="number" value="${P.fcRep}" style="width:80px">
        <label style="margin:0">Eu sou</label><select id="eu" style="width:auto"><option value="">—</option>${A.players.map((p) => `<option value="${p.id}" ${p.id === eu ? 'selected' : ''}>${esc(nomeDe(p))}</option>`).join('')}</select></div>
      <div class="linha" style="margin-top:8px"><input id="chave" placeholder="cola a chave do relógio" style="flex:1"><button id="gchave" class="peq">Guardar chave do relógio</button></div></details>`;
  el.querySelectorAll('[data-j]').forEach((b) => (b.onclick = () => editarJogo(res.find((r) => r.id === b.dataset.j), pubs.find((x) => x.id === b.dataset.j), P, eu, () => secJogos(el))));
  // ---- Jogos em aberto: equipas escolhidas sem resultado. Fechar = entra nas estatísticas, Elo e peso dos votos.
  const fechados = new Set(res.map((r) => r.jogo?.gameId).filter(Boolean));
  const abertos = [...A.games].filter((g) => !fechados.has(g.id)).sort((a, b) => (b.criado || 0) - (a.criado || 0));
  const nmG = (g, id) => esc(g.nomes?.[id] || nomeDe(A.players.find((p) => p.id === id) || { nome: '?' }));
  document.getElementById('j-abertos').innerHTML = abertos.length ? `<h3 style="margin-top:0">Em aberto (${abertos.length}) <span class="mute" style="text-transform:none;letter-spacing:0;font-weight:500">— equipas feitas, sem resultado</span></h3>
    ${abertos.map((g) => `<details class="cartao" data-aberto="${g.id}"><summary><b>${esc(diaPT(g.data || ''))}</b> <span class="tag">em aberto</span></summary>
      <div class="equipas"><div class="eq branco"><h4>${LOGO.B} Brancos</h4>${(g.brancos || []).map((id) => nmG(g, id)).join('<br>')}</div>
        <div class="eq preto"><h4>${LOGO.P} Pretos</h4>${(g.pretos || []).map((id) => nmG(g, id)).join('<br>')}</div></div>
      <label>Dia em que se jogou</label><input type="date" class="pD" value="${esc(g.data || hojeLocal())}" style="width:auto">
      <label>Resultado (opcional — deixa vazio se ninguém contou os golos)</label>
      <div class="linha"><input type="number" min="0" class="pB" placeholder="⚪" style="width:70px"> – <input type="number" min="0" class="pP" placeholder="⚫" style="width:70px"></div>
      <div class="linha" style="margin-top:8px">
        <button class="prim peq" data-fechar="B">Fechar: ganhou ⚪</button>
        <button class="peq" data-fechar="E">Fechar: empate</button>
        <button class="prim peq" data-fechar="P">Fechar: ganhou ⚫</button>
        <button class="peq perigo" data-apagar-g>Apagar (não se jogou)</button></div></details>`).join('')}` : '';
  el.querySelectorAll('[data-aberto]').forEach((box) => {
    const g = abertos.find((x) => x.id === box.dataset.aberto);
    box.querySelectorAll('[data-fechar]').forEach((b) => (b.onclick = async () => {
      const K = (await DB.getSegredo('partilha'))?.chave;
      const nomeP = (id) => nomeDe(A.players.find((p) => p.id === id) || { nome: id });
      if (!(await fecharManual(box, g, b.dataset.fechar, K || '', nomeP))) return;
      await recarregar(); secJogos(el);
    }));
    box.querySelector('[data-apagar-g]').onclick = async () => {
      if (!confirm('Apagar estas equipas? (o jogo não se realizou)')) return;
      await DB.deleteGame(g.id); await recarregar(); secJogos(el);
    };
  });
  const gravarPerfil = async (d) => { await DB.setSegredo('perfil', { ...P, ...d }); secJogos(el); };
  document.getElementById('fcmax').onchange = (e) => gravarPerfil({ fcMax: Number(e.target.value) });
  document.getElementById('fcrep').onchange = (e) => gravarPerfil({ fcRep: Number(e.target.value) });
  document.getElementById('eu').onchange = (e) => gravarPerfil({ eu: e.target.value });
  document.getElementById('gchave').onclick = async () => {
    const c = document.getElementById('chave').value.trim();
    if (c.length < 16) return toast('Chave demasiado curta');
    await DB.setChaveRelogio(c); toast('Chave guardada');
  };
}

// Editor de um jogo registado: data, resultado (jogos sem golos), golos (minuto, equipa, marcador, assistência, parte do corpo)
// e quem esteve na baliza (de/até ao minuto). Grava em resultados/ e na cópia pública jogos/ (mantém a prova e o resto).
async function editarJogo(r, pub, P, euFisico, depois) {
  const j0 = r.jogo;
  const j = JSON.parse(JSON.stringify(j0));
  const todosJ = [...(j.brancos || []), ...(j.pretos || [])];
  const op = (sel, vazio = '') => `${vazio ? `<option value="">${vazio}</option>` : ''}${todosJ.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
  const minDe = (t) => Math.floor((t || 0) / 60000) + 1;
  const tDe = (min, tAnt) => (Math.max(1, Number(min) || 1) - 1) * 60000 + ((tAnt || 0) % 60000);
  const avs = (await DB.listVotosJogo().catch(() => [])).filter((x) => x.jogo === r.id);
  const { el: f, fechar } = abrirFolha(`Jogo de ${dataDe(j0)}`, '<div id="ej"></div>');
  const box = f.querySelector('#ej');
  const desenhar = () => {
    const semEv = !(j.eventos || []).length;
    box.innerHTML = `
      <label>Dia do jogo</label><input type="date" id="ej-data" value="${esc(j.data || (j.inicioEpoch ? new Date(j.inicioEpoch).toLocaleDateString('sv-SE') : ''))}" style="width:auto">
      <h3>Resultado</h3>
      ${semEv ? `<p class="mute" style="margin:0 0 6px">Sem golos registados: escreve o resultado (ou só quem ganhou).</p>
        <div class="linha"><input type="number" min="0" id="ej-pB" value="${j.placar?.B ?? ''}" placeholder="⚪" style="width:70px"> – <input type="number" min="0" id="ej-pP" value="${j.placar?.P ?? ''}" placeholder="⚫" style="width:70px">
          <select id="ej-venc" style="width:auto"><option value="B" ${vencedorDe(j) === 'B' ? 'selected' : ''}>ganhou ⚪</option><option value="E" ${vencedorDe(j) === 'E' ? 'selected' : ''}>empate</option><option value="P" ${vencedorDe(j) === 'P' ? 'selected' : ''}>ganhou ⚫</option></select></div>`
        : `<p style="margin:0"><b class="ej-res">${LOGO.B} ${(j.eventos || []).filter((e) => e.equipa === 'B').length} – ${(j.eventos || []).filter((e) => e.equipa === 'P').length} ${LOGO.P}</b> <span class="mute">— vem dos golos em baixo</span></p>`}
      <h3>Golos</h3>
      <div class="ej-lista">${(j.eventos || []).map((e, i) => `<div class="ej-golo" data-i="${i}">
        <label>Min.<input type="number" min="1" data-c="min" value="${minDe(e.t)}"></label>
        <label>Equipa<select data-c="equipa"><option value="B" ${e.equipa === 'B' ? 'selected' : ''}>⚪ Brancos</option><option value="P" ${e.equipa === 'P' ? 'selected' : ''}>⚫ Pretos</option></select></label>
        <label>Marcador<select data-c="marcador">${op(e.marcador)}</select></label>
        <label>Tipo<select data-c="tipo"><option value="golo" ${e.tipo !== 'autogolo' ? 'selected' : ''}>golo</option><option value="autogolo" ${e.tipo === 'autogolo' ? 'selected' : ''}>autogolo</option></select></label>
        <label>Assistência<select data-c="assist">${op(e.assist, '—')}</select></label>
        <label>Como<select data-c="parte"><option value="">—</option>${Object.entries(PARTE).map(([k, n]) => `<option value="${k}" ${e.parte === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="peq perigo" data-del="${i}" aria-label="Apagar este golo">✕</button></div>`).join('') || '<p class="mute">Nenhum golo registado.</p>'}</div>
      <button class="peq" id="ej-mais">＋ Golo</button>
      <h3>Guarda-redes</h3>
      <div class="ej-lista">${(j.turnos || []).map((t, i) => `<div class="ej-gr" data-t="${i}">
        <label>Equipa<select data-c="equipa"><option value="B" ${t.equipa === 'B' ? 'selected' : ''}>⚪</option><option value="P" ${t.equipa === 'P' ? 'selected' : ''}>⚫</option></select></label>
        <label>Na baliza<select data-c="jogador">${op(t.jogador)}</select></label>
        <label>Do min.<input type="number" min="1" data-c="de" value="${minDe(t.de)}"></label>
        <label>ao min.<input type="number" min="1" data-c="ate" value="${Math.round((t.ate || 0) / 60000)}"></label>
        <button class="peq perigo" data-delt="${i}" aria-label="Apagar">✕</button></div>`).join('') || '<p class="mute">Sem trocas de guarda-redes registadas.</p>'}</div>
      <button class="peq" id="ej-maisgr">＋ Guarda-redes</button>
      ${avs.length ? `<h3>⭐ Avaliações deste jogo <span class="mute" style="text-transform:none;letter-spacing:0">(${avs.length} colega${avs.length > 1 ? 's' : ''} — melhor/igual/pior do que o normal; à parte, não mexem nas cartas)</span></h3>${avaliacoesHTML(avs, todosJ)}` : ''}
      ${euFisico ? `<details style="margin-top:12px"><summary class="mute">❤ Esforço físico (relógio)</summary>${htmlSaude(j, r.fit || {}, P, euFisico)}</details>` : ''}
      <div class="linha" style="margin-top:16px;justify-content:space-between"><span class="linha"><button class="prim" id="ej-ok">Guardar</button><button id="ej-cancel">Cancelar</button></span>
        <button class="perigo peq" id="ej-apagar">Apagar o jogo</button></div>`;
    // Ler o que está nos campos antes de redesenhar (para não perder o que se escreveu).
    const ler = () => {
      box.querySelectorAll('.ej-golo').forEach((row) => {
        const e = j.eventos[row.dataset.i], v = (c) => row.querySelector(`[data-c="${c}"]`).value;
        e.t = tDe(v('min'), e.t); e.equipa = v('equipa'); e.marcador = v('marcador'); e.tipo = v('tipo'); e.assist = v('assist') || null; e.parte = v('parte') || null;
      });
      box.querySelectorAll('.ej-gr').forEach((row) => {
        const t = j.turnos[row.dataset.t], v = (c) => row.querySelector(`[data-c="${c}"]`).value;
        t.equipa = v('equipa'); t.jogador = v('jogador'); t.de = tDe(v('de'), 0); t.ate = Math.max(t.de + 60000, Number(v('ate')) * 60000);
      });
      j.data = box.querySelector('#ej-data').value || j.data;
    };
    box.querySelector('#ej-mais').onclick = () => { ler(); const ult = j.eventos?.at(-1); (j.eventos ||= []).push({ t: (ult?.t || 0) + 60000, tipo: 'golo', equipa: 'B', marcador: (j.brancos || [])[0]?.id, assist: null, gr: null, parte: null }); desenhar(); };
    box.querySelector('#ej-maisgr').onclick = () => { ler(); (j.turnos ||= []).push({ equipa: 'B', jogador: (j.brancos || [])[0]?.id, de: 0, ate: 6 * 60000 }); desenhar(); };
    box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { ler(); j.eventos.splice(Number(b.dataset.del), 1); desenhar(); }));
    box.querySelectorAll('[data-delt]').forEach((b) => (b.onclick = () => { ler(); j.turnos.splice(Number(b.dataset.delt), 1); desenhar(); }));
    box.querySelector('#ej-cancel').onclick = fechar;
    box.querySelector('#ej-apagar').onclick = async () => {
      if (!confirm('Apagar este jogo? Sai também das estatísticas.')) return;
      await DB.deleteResultado(r.id); await DB.deleteJogoPub(r.id).catch(() => {}); fechar(); toast('Jogo apagado'); depois();
    };
    box.querySelector('#ej-ok').onclick = async (ev) => {
      ler();
      ev.target.disabled = true;
      // O dia mudou: muda também o início/fim (mantém a hora).
      const diaAntes = j0.inicioEpoch ? new Date(j0.inicioEpoch).toLocaleDateString('sv-SE') : j0.data;
      if (j.data && diaAntes && j.data !== diaAntes && j.inicioEpoch) {
        const d = new Date(`${j.data}T12:00`).getTime() - new Date(`${diaAntes}T12:00`).getTime();
        j.inicioEpoch += d; if (j.fimEpoch) j.fimEpoch += d;
      }
      j.eventos = (j.eventos || []).sort((a, b) => a.t - b.t);
      j.turnos = (j.turnos || []).sort((a, b) => a.de - b.de);
      // Quem estava na baliza a sofrer cada golo, pelas trocas de GR corrigidas.
      if (j.turnos.length) for (const e of j.eventos) e.gr = j.turnos.find((x) => x.equipa !== e.equipa && e.t >= x.de && e.t < x.ate)?.jogador || e.gr || null;
      // Penáltis marcados que já não têm golo: saem.
      j.penaltis = (j.penaltis || []).filter((pn) => pn.resultado !== 'golo' || j.eventos.some((e) => e.parte === 'pen' && e.marcador === pn.marcador));
      if (j.eventos.length) { delete j.placar; delete j.semGolos; delete j.vencedor; }
      else {
        const sB = box.querySelector('#ej-pB').value, sP = box.querySelector('#ej-pP').value;
        if (sB !== '' && sP !== '') { j.placar = { B: Number(sB), P: Number(sP) }; delete j.semGolos; delete j.vencedor; }
        else { delete j.placar; j.semGolos = true; j.vencedor = box.querySelector('#ej-venc').value; }
      }
      const { id: _i, bruto: _b, ...resto } = r;
      const { id: _bid, ...brutoSem } = r.bruto;
      try {
        await DB.saveResultado(r.id, { ...brutoSem, json: JSON.stringify({ ...resto, jogo: j }) });
        const { id: _p, ...pubDoc } = pub || {};
        await DB.saveJogoPub(r.id, { ...pubDoc, ts: Date.now(), json: JSON.stringify(j) });
      } catch (err) { console.error(err); ev.target.disabled = false; return toast('Erro a guardar: ' + err.message); }
      fechar(); toast('Jogo corrigido ✔'); depois();
    };
  };
  desenhar();
}

// Avaliações de um jogo (votosJogo): para cada jogador, quantos o acharam pior / igual / melhor do que o normal. Só o admin vê.
function avaliacoesHTML(avs, jogadores) {
  const c = {};
  for (const v of avs) for (const [pid, x] of Object.entries(v.r || {})) if ([-1, 0, 1].includes(x?.d)) { const o = (c[pid] ||= { '-1': 0, 0: 0, 1: 0 }); o[x.d]++; }
  const ids = Object.keys(c).sort((a, b) => (c[b][1] - c[b][-1]) - (c[a][1] - c[a][-1]));
  if (!ids.length) return '<p class="mute">Ainda sem avaliações.</p>';
  return `<table><tr><th>Jogador</th><th title="melhor do que o normal">▲</th><th title="normal">=</th><th title="pior do que o normal">▼</th><th>Saldo</th></tr>
    ${ids.map((pid) => { const o = c[pid], sd = o[1] - o[-1]; return `<tr><td>${esc(jogadores.find((p) => p.id === pid)?.nome || '?')}</td><td>${o[1]}</td><td>${o[0]}</td><td>${o[-1]}</td><td class="${sd > 0 ? 'sobe' : sd < 0 ? 'desce' : ''}">${sd > 0 ? '+' : ''}${sd}</td></tr>`; }).join('')}</table>`;
}

// Fechar um jogo à mão (ninguém marcou): só o vencedor ou o resultado. Conta nas estatísticas, Elo e peso dos votos.
// box tem .pD (dia em que se jogou), .pB e .pP (golos, opcionais). Usado no admin e pelos moderadores.
async function fecharManual(box, g, venc, K, nomeP) {
  const sB = box.querySelector('.pB').value, sP = box.querySelector('.pP').value, data = box.querySelector('.pD')?.value || g.data || hojeLocal();
  const comPlacar = sB !== '' && sP !== '';
  if (comPlacar) {
    const pv = Number(sB) > Number(sP) ? 'B' : Number(sB) < Number(sP) ? 'P' : 'E';
    if (pv !== venc && !confirm(`O resultado ${sB}–${sP} não bate com o botão. Usar o resultado (${pv === 'E' ? 'empate' : pv === 'B' ? 'ganhou ⚪' : 'ganhou ⚫'})?`)) return false;
    venc = pv;
  } else if (!confirm(`Fechar o jogo de ${diaPT(data)} como ${venc === 'E' ? 'empate' : venc === 'B' ? 'vitória dos Brancos' : 'vitória dos Pretos'}, sem golos?`)) return false;
  const lado = (ids) => (ids || []).map((id) => ({ id, nome: g.nomes?.[id] || nomeP(id) }));
  // O jogo fica datado pelo dia em que se jogou (inicioEpoch), não pelo dia em que se fizeram as equipas.
  const t0 = new Date(`${data}T21:00`).getTime();
  const jogo = { gameId: g.id, data, brancos: lado(g.brancos), pretos: lado(g.pretos), fase: 'fim', inicioEpoch: t0, fimEpoch: t0,
    pausaTotal: 0, eventos: [], turnos: [], penaltis: [], vencedor: venc, ...(comPlacar ? { placar: { B: Number(sB), P: Number(sP) } } : { semGolos: true }), origem: 'manual' };
  const id = 'manual-' + g.id;
  try {
    await DB.saveResultado(id, { chave: K, gameId: g.id, ts: Date.now(), origem: 'manual', json: JSON.stringify({ jogo, fit: {} }) });
    await DB.saveJogoPub(id, { ...(K ? { prova: await prova(K, id) } : {}), ts: Date.now(), json: JSON.stringify(jogo) });
  } catch (e) { console.error(e); toast('Erro a fechar: ' + e.message); return false; }
  toast('Jogo fechado — já conta nas estatísticas');
  return true;
}

// ---------- Jogadores ----------
// Folha por cima da página (telemóvel: sobe de baixo; computador: janela ao centro). Fecha com ✕, Esc ou tocando fora.
function abrirFolha(tit, html) {
  const f = document.createElement('div');
  f.className = 'folha-fundo';
  f.innerHTML = `<div class="folha" role="dialog" aria-modal="true" aria-label="${esc(tit)}"><div class="folha-cab"><h3>${esc(tit)}</h3><button class="fechar" aria-label="Fechar">✕</button></div>${html}</div>`;
  document.body.appendChild(f);
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  const fechar = () => { f.remove(); document.removeEventListener('keydown', tecla); };
  document.addEventListener('keydown', tecla);
  f.onclick = (e) => { if (e.target === f) fechar(); };
  f.querySelector('.fechar').onclick = fechar;
  return { el: f.querySelector('.folha'), fechar };
}

// ---------- Plantel: jogadores e cartas num só sítio ----------
// Lista (mini-carta + nome) ou cartas; "＋ Adicionar jogador"; tocar num jogador abre a ficha (editar, carta, votos recebidos).
function secJogadores(el) {
  const ativos = A.players.filter((p) => p.ativo !== false);
  const cartas = calcularCartas(ativos, A.votes, A.conv);
  const porOvr = [...ativos].sort((a, b) => (cartas[b.id]?.overall ?? 0) - (cartas[a.id]?.overall ?? 0));
  A.plVista ||= 'lista';
  A.plBusca ??= '';
  const vista = A.plVista;
  const mini = (c) => `<span class="ovr ${tier(c?.overall)}" title="Overall${c?.posicao ? ' · posição indicativa' : ''}">${c?.overall ?? '–'}${c?.posicao ? `<small>${c.posicao}</small>` : ''}</span>`;
  const linha = (x) => `<div class="jog clic ${x.ativo === false ? 'inativo' : ''}" data-ed="${x.id}">${mini(cartas[x.id])}${foto(x)}<div class="info"><b>${esc(nomeDe(x))}</b><small>${esc(x.alcunha ? x.nome : '')}
      ${x.convidado ? '<span class="tag">convidado</span>' : ''}${x.ativo === false ? '<span class="tag">inativo</span>' : ''}${x.nivel ? `<span class="tag">${NIVEIS.find((n) => n.v === Number(x.nivel))?.nome}</span>` : ''}${x.moderador ? '<span class="tag">🛡 moderador</span>' : ''}${cartas[x.id]?.provisoria ? '<span class="tag">provisória</span>' : cartas[x.id]?.estimada ? '<span class="tag">estimada</span>' : ''}</small></div>
      ${x.convidado ? '' : `<button class="peq ${x.moderador ? 'on' : ''}" data-mod="${x.id}" title="Moderador: faz equipas e marca o jogo" aria-label="Moderador">🛡</button>`}
      <button class="peq" data-ed="${x.id}">Editar</button></div>`;
  el.innerHTML = `
    <div class="secbar"><div><h2>Plantel e cartas</h2><p class="mute">${ativos.length} ativos · ${A.players.length} no total</p></div>
      <button class="prim" id="pl-add">＋ Adicionar jogador</button></div>
    <div class="secbar"><div class="seg" role="tablist"><button data-v="lista" class="${vista === 'lista' ? 'on' : ''}">Jogadores</button><button data-v="cartas" class="${vista === 'cartas' ? 'on' : ''}">Cartas</button><button data-v="votacao" class="${vista === 'votacao' ? 'on' : ''}">Votação e PINs</button></div>
      ${vista === 'votacao' ? '' : `<input id="pl-busca" type="search" placeholder="Procurar jogador…" value="${esc(A.plBusca)}" style="max-width:240px;flex:1">`}</div>
    ${vista === 'cartas' ? `<div class="cartao"><div class="cartao-tit">🃏 Mostrar as cartas</div>
      <div class="linha"><span>Cartas pessoais <span class="mute">(cada um vê só a sua, no 👤 Eu)</span>:</span><span id="cp-estado" class="mute">…</span><button class="peq" id="cp-toggle">…</button></div>
      <p class="mute" style="font-size:12px;margin:8px 0 0">As cartas de todos nunca são públicas: cada um só vê a sua.<br>"Provisória" = menos de 3 votos numa área. "Estimada" = completada pelo nível que deste.</p></div>` : ''}
    <div id="pl-corpo"></div>
    ${vista === 'votacao' ? `<details class="cartao"><summary><b>Votos por votante</b> <span class="mute">(só tu vês)</span></summary>
      <select id="vsel" style="margin-top:10px"><option value="">— escolhe —</option>${A.votes.map((v) => `<option value="${v.id}">${esc(nomeDe(A.players.find((p) => p.id === v.voter) || { nome: '?' }))}</option>`).join('')}</select>
      <div id="vdet" style="overflow-x:auto"></div></details>` : ''}
    ${vista === 'lista' ? `<details class="cartao"><summary><b>📥 Importar jogadores de um ficheiro</b></summary>
      <p class="mute" style="font-size:13px">Para carregar de uma vez a lista do grupo do WhatsApp (ficheiro <code>jogadores-iniciais.json</code>). Junta só os que ainda não existem e completa fotos que faltem; não apaga nem muda notas.</p>
      <input id="imp" type="file" accept=".json" style="width:auto"></details>
      ${DB.demo ? `<section class="cartao demo-box"><div class="cartao-tit">🧪 Dados de teste <span class="tag">só nesta demonstração</span></div>
        <p class="mute" style="font-size:13px;margin:0 0 8px">Na app real isto não aparece. Aqui serve para encher a app de jogadores, votos e jogos a fingir.</p>
        <div class="linha"><button id="demo-seed" class="peq">Criar 14 jogadores + votos de teste</button><button id="demo-jogos" class="peq">Simular 10 jogos</button><button id="demo-reset" class="peq perigo">Apagar tudo</button></div></section>` : ''}` : ''}`;
  const g = (id) => document.getElementById(id);
  const corpo = () => {
    const c = g('pl-corpo');
    if (vista === 'votacao') return secVotacao(c);
    const q = A.plBusca.trim().toLowerCase();
    const bate = (p) => !q || `${p.nome} ${p.alcunha || ''} ${p.alias || ''}`.toLowerCase().includes(q);
    if (vista === 'cartas') c.innerHTML = `<div class="cartas clic">${porOvr.filter(bate).map((p) => `<div data-ed="${p.id}" role="button" tabindex="0">${htmlCarta(p, cartas[p.id], A.minhas?.[p.id]?.ref || null)}${eloMini(A.minhas?.[p.id]?.elo)}</div>`).join('')}</div>
      <p class="mute" style="font-size:12px;margin:8px 0 0">▲▼ nas notas = comparado com a carta antes do último jogo. Por baixo de cada carta, a seta do Elo (forma pelos resultados, conta a fazer equipas).</p>`;
    else c.innerHTML = `<div class="plant-lista">${A.players.filter(bate).map(linha).join('')}</div>`;
    if (!c.firstElementChild?.children.length) c.innerHTML = vazio('🔎', A.players.length ? 'Nenhum jogador com esse nome.' : 'Ainda não há jogadores — carrega em "＋ Adicionar jogador".');
    c.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); fichaJogador(el, A.players.find((x) => x.id === b.dataset.ed), cartas); }));
    c.querySelectorAll('[data-ed][tabindex]').forEach((b) => (b.onkeydown = (e) => { if (e.key === 'Enter') b.click(); }));
    // 🛡 Moderador (decisão do Rui, 21/10): faz equipas e marca o jogo, no separador 🛡 Moderador (com o PIN).
    c.querySelectorAll('[data-mod]').forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      const x = A.players.find((y) => y.id === b.dataset.mod); if (!x) return;
      const { alias: _a, fotoPropria: _f, ...base } = x;
      if (!x.moderador && !confirm(`${nomeDe(x)} passa a moderador: faz equipas e marca o jogo. Continuar?`)) return;
      await DB.savePlayer({ ...base, moderador: !x.moderador });
      await recarregar(); toast(x.moderador ? 'Já não é moderador' : '🛡 Moderador'); secJogadores(el);
    }));
  };
  corpo();
  g('pl-add').onclick = () => fichaJogador(el, null, cartas);
  el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { A.plVista = b.dataset.v; secJogadores(el); }));
  if (g('pl-busca')) g('pl-busca').oninput = (e) => { A.plBusca = e.target.value; corpo(); };
  if (g('cp-toggle')) {
    (async () => {
      const estado = (await DB.getPublic('estado')) || {}, on = !!estado.cartasPessoais;
      if (!g('cp-estado')) return;
      g('cp-estado').textContent = on ? '🟢 Visíveis' : '🔴 Escondidas';
      const b = g('cp-toggle');
      b.textContent = on ? 'Esconder' : 'Mostrar a cada um a sua';
      b.className = 'peq ' + (on ? 'perigo' : 'prim');
      b.onclick = async () => { await DB.setPublic('estado', { ...estado, cartasPessoais: !on }); await publicarCartasPessoais(); secJogadores(el); };
    })();
  }
  if (g('vsel')) g('vsel').onchange = (e) => {
    const v = A.votes.find((x) => x.id === e.target.value);
    g('vdet').innerHTML = !v ? '' : `<table><tr><th>Jogador</th>${AREAS.map((a) => `<th>${a.ab}</th>`).join('')}</tr>
      ${Object.entries(v.r || {}).map(([id, r]) => `<tr><td>${esc(nomeDe(A.players.find((p) => p.id === id) || { nome: '?' }))}</td>${r.skip ? `<td colspan="${AREAS.length}" class="mute">não conhece</td>` : AREAS.map((a) => `<td>${r[a.k] ?? ''}</td>`).join('')}</tr>`).join('')}</table>`;
  };
  if (g('imp')) g('imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const lista = JSON.parse(await f.text());
    let n = 0, m = 0;
    for (const x of lista) {
      if (!x.nome) continue;
      const ja = A.players.find((y) => y.nome.toLowerCase() === x.nome.toLowerCase());
      if (!ja) {
        await DB.savePlayer({ nome: x.nome, alcunha: '', foto: x.foto || '', ativo: x.ativo !== false, convidado: !!x.convidado, nivel: null });
        n++;
      } else if ((x.foto && !ja.foto) || (x.ativo !== false && ja.ativo === false)) {
        const { alias, fotoPropria, ...base } = ja;
        await DB.savePlayer({ ...base, foto: ja.foto || x.foto || '', ativo: ja.ativo !== false || x.ativo !== false });
        m++;
      }
    }
    await recarregar(); toast(`${n} novos, ${m} atualizados`); secJogadores(el);
  };
  if (g('demo-seed')) {
    g('demo-seed').onclick = async () => { await semearDemo(); await recarregar(); renderAdmin(); };
    g('demo-reset').onclick = async () => { if (!confirm('Apagar todos os dados de teste?')) return; DB.resetDemo(); await recarregar(); renderAdmin(); };
    g('demo-jogos').onclick = async () => { await simularJogos(); toast('10 jogos simulados'); };
  }
}

// Quem votou num jogador e que notas lhe deu (mais a média aparada que entra na carta). Só o admin vê.
function votosRecebidosHTML(id, cartas) {
  const nmv = (v) => esc(nomeDe(A.players.find((p) => p.id === v.voter) || { nome: '?' }));
  const deram = A.votes.filter((v) => v.voter !== id && v.r?.[id] && !v.r[id].skip).sort((x, y) => nmv(x).localeCompare(nmv(y), 'pt'));
  const nc = A.votes.filter((v) => v.voter !== id && v.r?.[id]?.skip);
  const media = (v) => { const n = AREAS.map((a) => v.r[id][a.k]).filter((x) => typeof x === 'number'); return n.length ? (n.reduce((a, b) => a + b, 0) / n.length).toFixed(1) : '–'; };
  const c = cartas[id];
  return `<p class="mute">${deram.length} votaram · ${nc.length} não conhecem${nc.length ? ` (${nc.map(nmv).join(', ')})` : ''}</p>
    <div style="overflow-x:auto"><table><tr><th>Votante</th>${AREAS.map((a) => `<th>${a.ab}</th>`).join('')}<th>Média</th><th title="Jogos em que o votante e este jogador estiveram juntos (mesma equipa ou contra)">Jogos juntos</th><th>Peso</th></tr>
    ${deram.map((v) => { const n = A.juntos?.[v.voter]?.[id] || 0, pts = A.conv?.[v.voter]?.[id] || 0; return `<tr><td>${nmv(v)}</td>${AREAS.map((a) => `<td>${v.r[id][a.k] ?? ''}</td>`).join('')}<td><b>${media(v)}</b></td><td>${n}</td><td>${Math.round(pesoVoto(pts) * 100)}%</td></tr>`; }).join('')}
    ${c ? `<tr><td><b>Carta</b> <small class="mute">(média aparada e pesada)</small></td>${AREAS.map((a) => `<td><b>${c.stats[a.k] != null ? c.stats[a.k].toFixed(1) : '–'}</b></td>`).join('')}<td><b>${c.overall ?? '–'}</b></td></tr>` : ''}</table></div>`;
}

// Ficha de um jogador (ou novo jogador): dados, foto, convidado/nível, ativo; a carta e os votos recebidos.
function fichaJogador(sec, edit, cartas) {
  const p = edit || {};
  const c = edit ? cartas[edit.id] : null;
  const { el: f, fechar } = abrirFolha(edit ? nomeDe(edit) : 'Novo jogador', `
    ${c ? `<div class="eu-carta" style="margin:4px 0 8px">${htmlCarta(edit, c)}</div>` : ''}
    <label>Nome</label><input id="f-nome" value="${esc(p.nome)}">
    <label>Alcunha (como aparece)</label><input id="f-alc" value="${esc(p.alcunha)}">
    <label>Foto (guarda a do WhatsApp e escolhe-a aqui)</label><input id="f-foto" type="file" accept="image/*">
    <div class="linha" style="margin-top:10px"><label style="margin:0"><input type="checkbox" id="f-conv" ${p.convidado ? 'checked' : ''} style="width:auto"> Convidado (não vota nem é votado)</label></div>
    <div class="linha" style="margin-top:6px"><label style="margin:0"><input type="checkbox" id="f-sogr" ${p.soGR ? 'checked' : ''} style="width:auto"> 🧤 Só joga à baliza <span class="mute">(fica GR o jogo todo e as equipas equilibram com isso)</span></label></div>
    <label>Nível estimado (convidados ou quem tiver poucos votos)</label>
    <select id="f-nivel"><option value="">—</option>${NIVEIS.map((n) => `<option value="${n.v}" ${Number(p.nivel) === n.v ? 'selected' : ''}>${n.nome}</option>`).join('')}</select>
    <div id="f-sinc"></div>
    <div class="linha" style="margin-top:14px">
      <button class="prim" id="f-gravar">${edit ? 'Guardar' : '＋ Adicionar'}</button><button id="f-cancel">Cancelar</button>
      ${edit ? `<label style="margin:0"><input type="checkbox" id="f-ativo" ${p.ativo !== false ? 'checked' : ''} style="width:auto"> Ativo</label>` : ''}
      ${edit ? '<button class="perigo" id="f-apagar" style="margin-left:auto">🗑 Apagar</button>' : ''}
    </div>
    ${edit && !edit.convidado ? `<h3>Votos recebidos <span class="mute">(só tu vês)</span></h3>${votosRecebidosHTML(edit.id, cartas)}` : ''}`);
  const g = (id) => f.querySelector('#' + id);
  if (!edit) g('f-nome').focus();
  // Mesmo jogador noutra liga (p. ex. fixo aqui e convidado na Futebolada semanal): fica junto nas estatísticas de todas as ligas.
  let sincEscolhido = () => undefined;
  campoSinc(g('f-sinc'), p, esc).then((fn) => (sincEscolhido = fn)).catch(() => {});
  g('f-cancel').onclick = fechar;
  // Apagar (enganos): os jogos já registados ficam; os votos nele deixam de contar. Numa liga, tira também a ligação da conta.
  if (edit) g('f-apagar').onclick = async () => {
    if (!confirm(`Apagar ${nomeDe(edit)}? Os jogos já registados ficam; os votos nele deixam de contar.`)) return;
    try {
      const liga = DB.ligaAtual();
      if (liga) for (const m of (await DB.listMembros(liga).catch(() => [])).filter((x) => x.player === edit.id)) await DB.tirarMembro(liga, m.uid).catch(() => {});
      await DB.deletePlayer(edit.id);
      fechar(); await recarregar(); toast('Apagado ✔'); secJogadores(sec);
    } catch (e) { console.error(e); toast('Não deu para apagar (sem permissão?)'); }
  };
  g('f-gravar').onclick = async (e) => {
    const nome = g('f-nome').value.trim();
    if (!nome) return toast('Falta o nome');
    e.target.disabled = true;
    const { alias: _a, fotoPropria: _f, ...base } = p;
    const d = { ...base, nome, alcunha: g('f-alc').value.trim(), convidado: g('f-conv').checked, soGR: g('f-sogr').checked, nivel: g('f-nivel').value ? Number(g('f-nivel').value) : null };
    if (edit) d.ativo = g('f-ativo').checked; else d.ativo = true;
    const sc = sincEscolhido();
    if (sc === null) delete d.sinc;
    else if (sc) { const { foto, pessoa: _p, ...sinc } = sc; if (sinc.id) d.sinc = sinc; if (foto && !d.foto) d.foto = foto; }
    try {
      const fl = g('f-foto').files[0];
      if (fl) d.foto = await fotoParaDataURL(fl);
      const novoId = await DB.savePlayer(d);
      // 👥 Contas: a pessoa escolhida passa a ter este jogador nesta liga; um jogador novo sem pessoa fica como pessoa nova.
      await registarPessoa(novoId, nome, sc?.pessoa, !edit && !sc?.id).catch((err) => console.error(err));
    } catch (err) { console.error(err); e.target.disabled = false; return toast('Não deu para gravar (sem permissão?)'); }
    fechar();
    await recarregar(); toast(edit ? 'Guardado' : `${nome} adicionado ✔`); secJogadores(sec);
  };
}

async function semearDemo() {
  const nomes = ['Rui', 'Tiago', 'Nuno', 'Pedro', 'Hugo', 'Bruno', 'Filipe', 'Miguel', 'André', 'Ricardo', 'Sérgio', 'Paulo', 'Vítor', 'Zé'];
  const ids = [];
  for (const n of nomes) ids.push(await DB.savePlayer({ nome: n, alcunha: '', ativo: true, convidado: false }));
  ids.push(await DB.savePlayer({ nome: 'Convidado do Hugo', ativo: true, convidado: true, nivel: 3 }));
  const forca = ids.map(() => 4 + Math.random() * 5);
  for (let v = 0; v < nomes.length - 2; v++) {
    for (let a = 0; a < nomes.length; a++) {
      if (a === v) continue;
      if (Math.random() < 0.3) { await DB.saveVote(ids[v], ids[a], { skip: true }); continue; }
      const r = {};
      for (const ar of AREAS) r[ar.k] = Math.max(1, Math.min(10, Math.round(forca[a] + (Math.random() - 0.5) * 4)));
      await DB.saveVote(ids[v], ids[a], r);
    }
  }
  await DB.setPublic('estado', { votacaoAberta: true });
}

// Demo: jogos simulados (para testar estatísticas e Elo). Força "real" = carta + um desvio escondido.
async function simularJogos(n = 10) {
  const ativos = A.players.filter((p) => p.ativo !== false);
  if (ativos.length < 10) return toast('Cria primeiro os jogadores de teste');
  const cartas = calcularCartas(ativos, A.votes, A.conv);
  const desvio = Object.fromEntries(ativos.map((p) => [p.id, (Math.random() - 0.5) * 20]));
  for (let k = 0; k < n; k++) {
    const ids = [...ativos].sort(() => Math.random() - 0.5).slice(0, 10).map((p) => p.id);
    const [o] = gerarEquipas(ids, cartas, [], 1);
    const forca = (eq) => eq.reduce((s, id) => s + (cartas[id]?.overall ?? 60) + desvio[id], 0) / eq.length;
    const lado = (eq) => eq.map((id) => ({ id, nome: nomeDe(ativos.find((p) => p.id === id)) }));
    const pB = 1 / (1 + 10 ** ((forca(o.B) - forca(o.A)) / 40));
    const eventos = [];
    for (let t = 0; t < 14; t++) {
      const e = Math.random() < pB ? 'B' : 'P', eq = e === 'B' ? o.A : o.B;
      eventos.push({ t: (t + 1) * 240000, tipo: 'golo', equipa: e, marcador: eq[Math.floor(Math.random() * 5)], assist: null, gr: null, parte: 'pd' });
    }
    const ini = Date.now() - (n - k) * 7 * 864e5;
    const jogo = { gameId: '', data: new Date(ini).toISOString().slice(0, 10), brancos: lado(o.A), pretos: lado(o.B), fase: 'fim',
      inicioEpoch: ini, fimEpoch: ini + 3600000, pausaTotal: 0, eventos, turnos: [], origem: 'simulado' };
    const id = 'sim-' + ini;
    await DB.saveResultado(id, { json: JSON.stringify({ jogo, fit: {} }) });
    await DB.saveJogoPub(id, { json: JSON.stringify(jogo) });
  }
}

// ---------- Tickets (problemas reportados pelos jogadores) ----------
// "Copiar para o Claude" junta os abertos num texto para colar na conversa e serem corrigidos.
async function secTickets(el) {
  el.innerHTML = '<p class="mute">A carregar…</p>';
  const L = (await DB.listTickets()).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const nome = (id) => (id ? nomeDe(A.players.find((p) => p.id === id) || { nome: '?' }) : 'sem perfil');
  const quando = (t) => new Date(t.ts).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
  const abertos = L.filter((t) => t.estado !== 'resolvido');
  el.innerHTML = `<div class="linha"><b>${abertos.length} aberto${abertos.length === 1 ? '' : 's'}</b> · ${L.length - abertos.length} resolvidos
      ${abertos.length ? '<button class="prim peq" id="tk-copiar">📋 Copiar abertos para o Claude</button>' : ''}</div>
    <p class="mute">Cola o texto na conversa com o Claude para ele corrigir. As imagens não vão no texto — se forem precisas, abre-as aqui.</p>
    ${L.map((t) => `<div class="opcao ticket ${t.estado === 'resolvido' ? 'resolvido' : ''}">
      <div class="linha" style="justify-content:space-between"><b>${t.estado === 'resolvido' ? '✔' : '🐞'} ${esc(nome(t.quem))}</b><small class="mute">${quando(t)} · ${esc(t.ecra || '')}</small></div>
      <p style="white-space:pre-wrap;margin:6px 0">${esc(t.texto)}</p>
      ${t.foto ? `<a href="${t.foto}" target="_blank"><img src="${t.foto}" class="tk-foto" alt="Imagem do ticket"></a>` : ''}
      ${t.erros ? `<details class="mute"><summary>Erros técnicos da app</summary><pre>${esc(t.erros)}</pre></details>` : ''}
      <details class="mute"><summary>Telemóvel / browser</summary><small>${esc(t.ua || '')}</small></details>
      <div class="linha" style="margin-top:6px"><button class="peq" data-tk-estado="${t.id}">${t.estado === 'resolvido' ? 'Reabrir' : '✔ Resolvido'}</button>
        <button class="peq perigo" data-tk-del="${t.id}">Apagar</button></div></div>`).join('') || '<p class="mute">Ainda não há tickets. 🎉</p>'}`;
  document.getElementById('tk-copiar')?.addEventListener('click', () => copiar(
    `Tickets da app do futebol (${abertos.length} abertos):\n\n` + abertos.map((t, i) => `#${i + 1} · ${quando(t)} · ${nome(t.quem)} · ecrã ${t.ecra || '?'}\n${t.texto}`
      + `${t.foto ? '\n(tem imagem — ver no Admin → Tickets)' : ''}${t.erros ? `\nErros:\n${t.erros}` : ''}\nBrowser: ${t.ua || '?'}`).join('\n\n---\n\n')));
  el.querySelectorAll('[data-tk-estado]').forEach((b) => (b.onclick = async () => {
    const t = L.find((x) => x.id === b.dataset.tkEstado); const { id, ...d } = t;
    await DB.setTicket(id, { ...d, estado: t.estado === 'resolvido' ? 'aberto' : 'resolvido' }); secTickets(el);
  }));
  el.querySelectorAll('[data-tk-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Apagar este ticket?')) return;
    await DB.deleteTicket(b.dataset.tkDel); secTickets(el);
  }));
}

// ---------- Saúde (só leitura: os dados são de cada jogador; o admin não altera nada) ----------
async function secSaude(el) {
  el.innerHTML = '<p class="mute">A carregar…</p>';
  const lista = await DB.listSaude();
  const nome = (id) => nomeDe(A.players.find((p) => p.id === id) || { nome: '?' });
  el.innerHTML = `<p class="mute">Só leitura. Cada jogador ativa e gere os seus dados no perfil (👤 Eu); tu não podes alterar nada.</p>
    ${lista.length ? `<select id="sd-sel"><option value="">— escolhe o jogador (${lista.length} com dados) —</option>
      ${lista.sort((a, b) => nome(a.id).localeCompare(nome(b.id), 'pt')).map((s) => `<option value="${s.id}">${esc(nome(s.id))}</option>`).join('')}</select>` : '<p>Ainda ninguém ativou os dados físicos.</p>'}
    <div id="sd-det"></div>`;
  document.getElementById('sd-sel')?.addEventListener('change', async (e) => {
    const id = e.target.value, det = document.getElementById('sd-det');
    if (!id) return (det.innerHTML = '');
    const [treinos, jogosPub] = await Promise.all([DB.listTreinos(id), DB.listJogosPub()]);
    const saude = lista.find((s) => s.id === id);
    const meus = jogosPub.map((r) => ({ id: r.id, jogo: JSON.parse(r.json || '{}') })).filter((r) => r.jogo.fase === 'fim'
      && [...(r.jogo.brancos || []), ...(r.jogo.pretos || [])].some((x) => x.id === id)).sort((a, b) => (b.jogo.inicioEpoch || 0) - (a.jogo.inicioEpoch || 0));
    det.innerHTML = blocoFisico(saude, treinos, meus, true) + meus.filter((r) => treinos.some((t) => t.jogoId === r.id))
      .map((r) => resumoJogo(r.jogo, id, false, extraTreino(r.id, treinos, saude, true))).join('');
  });
}

// ---------- Partilhar (link de colaborador) ----------
// Elo (só o admin vê): a forma de cada um pelos resultados. É o que só existe aqui; a tabela completa (com o pé de todos)
// fica fechada por baixo — o resto das estatísticas já está na Classificação pública.
async function secEstatisticas(el) {
  const res = (await DB.listResultados()).map((r) => JSON.parse(r.json || '{}'));
  const cartas = calcularCartas(A.players.filter((p) => p.ativo !== false), A.votes, A.conv);
  const L = Object.values(calcularElo(res.map((r) => r.jogo), cartas)).sort((a, b) => b.elo - a.elo);
  el.innerHTML = `<div class="secbar"><div><h2>Elo</h2><p class="mute">Só tu vês. A forma de cada um pelos resultados — parte da carta e mexe com os jogos.</p></div></div>
    ${L.length ? `<section class="cartao"><p class="mute" style="margin-top:0;font-size:13px">Overall 60 = 1000; 10 pontos de carta = 100 de Elo. "Forma" = quanto os jogos mexeram: ganhar contra o previsto sobe, perder desce.
      Nas Equipas há a opção "Ajustar pela forma": soma a forma ÷ 10 ao overall, no máximo ±10 % da carta. Cada jogador vê só a sua seta no perfil.</p>
    <div class="tscroll"><table class="liga"><tr><th>Jogador</th><th>Elo</th><th>Forma</th><th>J</th><th>Último</th></tr>
    ${L.map((x, i) => `<tr><td><span class="tpos p${i + 1}">${i + 1}</span>${esc(nomeDe(A.players.find((p) => p.id === x.id) || { nome: x.nome }))}</td><td><b>${x.elo}</b></td><td class="${x.forma > 0 ? 'sobe' : x.forma < 0 ? 'desce' : ''}">${x.forma > 0 ? '+' : ''}${Math.round(x.forma)}</td><td>${x.jogos}</td><td>${x.ultimo > 0 ? '▲' : x.ultimo < 0 ? '▼' : '='}</td></tr>`).join('')}</table></div></section>`
      : `<div class="cartao">${vazio('📈', 'O Elo aparece depois do primeiro jogo registado.')}</div>`}
    <details class="cartao"><summary><b>Tabela completa com o pé de todos</b> <span class="mute">(só aqui se vê o pé de cada um)</span></summary><div id="st-t" style="margin-top:10px"></div></details>`;
  tabelaStats(document.getElementById('st-t'), res, A.players);
}

// Link de colaborador (antigo "Partilhar"). Serve para alguém SEM PIN de moderador fazer as equipas e marcar o jogo
// (ex.: o Rui não vai e nenhum moderador vai). A mesma chave é a que os moderadores usam por trás (moderacao/chave):
// gerar uma nova corta o link antigo E o acesso de quem deixou de ser moderador.
async function secPartilhar(el) {
  const K = (await DB.getSegredo('partilha'))?.chave;
  const url = K ? `${BASE}#${LINK}/c=${K}` : '';
  const mods = A.players.filter((p) => p.moderador && p.ativo !== false);
  el.innerHTML = `<div class="secbar"><div><h2>Link de colaborador</h2><p class="mute">Para fazer equipas e marcar o jogo sem ser moderador.</p></div></div>
    <section class="cartao"><div class="cartao-tit">Para que serve</div>
      <ul class="explica">
        <li><b>Moderadores (🛡) não precisam dele:</b> entram com o PIN e têm o separador 🛡 Moderador.</li>
        <li><b>É para quem não é moderador</b> marcar um jogo (ex.: não vais tu nem nenhum moderador). Quem tiver o link faz equipas e marca golos, assistências e GR — sem login. Não vê votos, cartas nem saúde.</li>
        <li><b>Gerar um link novo</b> anula o antigo e corta também o acesso de quem deixou de ser moderador (é a mesma chave por trás). Faz isto quando tirares o 🛡 a alguém.</li>
      </ul></section>
    <section class="cartao"><div class="cartao-tit">Link atual</div>
      ${K ? `<input readonly value="${url}" id="p-url" style="margin-bottom:8px">
        <div class="linha"><button class="prim" id="p-cp">Copiar link</button>
          <a class="btn" target="_blank" href="https://wa.me/?text=${encodeURIComponent('⚽ Link para fazer as equipas e marcar o jogo de hoje:\n' + url)}">Enviar no WhatsApp</a>
          <a class="btn" target="_blank" href="${url}">Abrir</a></div>` : '<p class="mute">Ainda não há link — sem ele os moderadores também não conseguem abrir o jogo.</p>'}
      <button id="p-novo" class="${K ? 'perigo' : 'prim'}" style="margin-top:10px">${K ? 'Gerar link novo (anula o antigo)' : 'Criar link'}</button></section>
    <section class="cartao"><div class="cartao-tit">🛡 Moderadores (${mods.length})</div>
      ${mods.length ? `<div class="chips">${mods.map((p) => `<span class="chip">${foto(p)}${esc(nomeDe(p))}</span>`).join('')}</div>` : '<p class="mute" style="margin:0">Nenhum.</p>'}
      <p class="mute" style="font-size:12px;margin:8px 0 0">Marcam-se em Plantel e cartas → Jogadores, com o botão 🛡.</p></section>`;
  document.getElementById('p-cp')?.addEventListener('click', () => copiar(url));
  document.getElementById('p-novo').onclick = async () => {
    if (K && !confirm('O link atual deixa de funcionar (e quem deixou de ser moderador perde o acesso). Continuar?')) return;
    await DB.setSegredo('partilha', { chave: novoToken(24) });
    await publicarRetrato();
    secPartilhar(el);
  };
}

// Posição indicativa de cada um (DEF/MED/AVA, sem notas) para desenhar as equipas no campo da página do jogo.
// Fica em public/posicoes (só a letra da posição; o rating continua escondido). Corre quando o admin abre a app.
async function publicarPosicoes() {
  const ativos = A.players.filter((p) => p.ativo !== false);
  const cartas = calcularCartas(ativos, A.votes, A.conv);
  const pos = Object.fromEntries(ativos.filter((p) => !p.convidado && cartas[p.id]?.posicao).map((p) => [p.id, cartas[p.id].posicao]));
  const antes = (await DB.getPublic('posicoes').catch(() => null))?.pos || {};
  if (JSON.stringify(antes) === JSON.stringify(pos)) return;
  await DB.setPublic('posicoes', { ts: Date.now(), pos });
}

// ---------- Votação ----------
const msgGrupo = () => `⚽ Malta, inspirei-me no grupo de segunda-feira e vamos passar a ter as equipas feitas de forma automática e equilibrada. Para isso preciso que cada um dê nota de 1 a 10 a todos os outros jogadores (menos a si próprio). Quem não conhecerem, carreguem em "Não conheço". Leva poucos minutos:\n👉 ${BASE}#${LINK}/\nEscolham o vosso nome, metam o PIN de 4 algarismos que vos mando em privado, deem as notas e carreguem em OK. Podem voltar ao link para mudar.`;
const msgPin = (p, pin) => `⚽ Olá ${nomeDe(p)}! O teu PIN para a votação da futebolada é *${pin}* — é só teu, não o partilhes.
👉 ${BASE}#${LINK}/`;

async function secVotacao(el) {
  const votantes = A.players.filter((p) => !p.convidado && p.ativo !== false);
  const total = votantes.length - 1;
  const linhas = votantes.map((p) => {
    const r = A.votes.find((x) => x.id === p.id)?.r || {};
    const n = Object.values(r).filter((v) => v.skip || AREAS.every((a) => typeof v[a.k] === 'number')).length;
    return { p, c: Object.keys(r).length > 0, n };
  });
  const feitos = linhas.filter((l) => l.n >= total).length;
  const pins = Object.fromEntries((await DB.listPins()).map((x) => [x.id, x]));
  const semPin = votantes.filter((p) => !pins[p.id] && !p.temPin && !p.pinEm);
  el.innerHTML = `
    <div class="opcao">
      <b>Votação 🟢 sempre aberta</b>
      <p class="mute">Um só link para o grupo. Cada um escolhe o seu nome e vota área a área, quando quiser; os jogadores novos aparecem a todos como "por votar".</p>
      <div class="linha"><button class="prim" id="cpgrupo">Copiar mensagem p/ grupo</button>
        <a class="btn" target="_blank" href="https://wa.me/?text=${encodeURIComponent(msgGrupo())}">Abrir no WhatsApp</a></div>
    </div>
    <div class="opcao">
      <b>PINs (4 algarismos, um por jogador)</b>
      <p class="mute">Sem o PIN ninguém vota nem muda o perfil de outro. Envia a cada um <b>em privado</b> (o botão 💬 abre o WhatsApp com a mensagem; escolhes o contacto).
        Cada um pode mudar o seu PIN no perfil — aí deixas de o ver (🔒). "Reset" dá um PIN aleatório novo e anula o antigo (esqueceu-se, ou espalhou-se).</p>
      ${semPin.length ? `<button class="prim" id="pins-gerar">Gerar PINs em falta (${semPin.length})</button>` : '<small class="mute">Todos têm PIN.</small>'}
    </div>
    <h3>${linhas.filter((l) => l.c).length} já começaram · ${feitos}/${votantes.length} terminaram</h3>
    ${linhas.map(({ p, c, n }) => `<div class="jog">${foto(p)}<div class="info"><b>${esc(nomeDe(p))}</b>
      <small>${c ? `${n}/${total} ${n >= total ? '✅' : ''}` : 'ainda não votou'}${nomeDe(p) !== p.nome ? ` · ${esc(p.nome)}` : ''}</small></div>
      ${p.pinEm && !pins[p.id]?.h ? '<small class="mute" title="É a mesma pessoa de outra liga: usa o PIN que já tinha (👥 Contas)">🌍 PIN da conta</small>'
        : !pins[p.id] ? (p.temPin ? '<small class="mute" title="Já entrou: o PIN só o administrador geral vê">🔒 já entrou</small>' : '<small class="mute">sem PIN</small>') : pins[p.id].pin
        ? `<code style="font-size:16px;margin-right:6px">${esc(pins[p.id].pin)}</code>
          <a class="btn peq" target="_blank" title="Enviar o PIN no WhatsApp" href="https://wa.me/?text=${encodeURIComponent(msgPin(p, pins[p.id].pin))}">💬</a>`
        : '<small class="mute" title="Escolhido pelo jogador — não fica guardado">🔒 escolhido</small>'}
      ${(pins[p.id] || p.temPin) && !p.pinEm ? `<button class="peq" data-resetpin="${p.id}">Reset</button>` : ''}
      </div>`).join('')}`;
  document.getElementById('pins-gerar')?.addEventListener('click', async () => {
    for (const p of semPin) await DB.definirPin(p.id, novoPin());
    toast(`${semPin.length} PINs gerados`); secVotacao(el);
  });
  el.querySelectorAll('[data-resetpin]').forEach((b) => (b.onclick = async () => {
    const p = votantes.find((x) => x.id === b.dataset.resetpin);
    if (!confirm(`Reset ao PIN de ${nomeDe(p)}? Fica com um PIN aleatório novo e o antigo deixa de funcionar.`)) return;
    await DB.definirPin(p.id, novoPin()); toast('PIN novo — envia-lho com 💬'); secVotacao(el);
  }));
  document.getElementById('cpgrupo').onclick = () => copiar(msgGrupo());
}

// ---------- Cartas ----------
// ---------- Equipas ----------
// A.restr guarda as opções desta sessão: separar [[a,b]], juntar [[a,b,c?]], cor {id:'B'|'P'}.
// X = { players, cartas, games, addConvidado(d) → id, saveGame(g) } — vem do admin ou do link de colaborador.
function secEquipas(el, X = A.ctxEq) {
  // Moderadores: seleção, opções e equipa escolhida vêm do jogo ao vivo (iguais em todos os telemóveis).
  const VV = X.vivo;
  if (VV) { A.sel = new Set(VV.sel || []); try { A.restr = VV.restr ? JSON.parse(VV.restr) : null; } catch { A.restr = null; } }
  const pub = () => { if (!VV) return; VV.sel = [...A.sel]; VV.restr = JSON.stringify(A.restr); X.publicar({ sel: VV.sel, restr: VV.restr }); };
  A.restr ||= { separar: [], juntar: [], cor: {} };
  const R = A.restr;
  const cartas = X.cartas;
  const ativos = X.players.filter((p) => p.ativo !== false);
  const grupo = ativos.filter((p) => !p.convidado), convidados = ativos.filter((p) => p.convidado);
  const ov = (id) => cartas[id]?.overall ?? '–';
  // Elo (Rui, 29/10): a pontuação da carta e, ao lado, +x / −y que a forma soma ou tira para equilibrar (já com o teto de 10 %).
  // Quem anda a perder desce ainda mais → o gerador dá-lhe colegas mais fortes e fica mais perto de ganhar.
  const ajE = (id) => (A.usarElo && X.elo && cartas[id]?.overall != null ? Math.round(cartas[id].overall + ajusteElo(cartas[id].overall, X.elo[id]?.forma || 0)) - cartas[id].overall : 0);
  const ovElo = (id) => { const d = ajE(id); return `${ov(id)}${d ? ` <b title="Ajuste pela forma (Elo): conta ${ov(id) + d} a fazer as equipas" style="color:${d > 0 ? '#16a34a' : '#dc2626'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</b>` : ''}`; };
  const pid = (id) => X.players.find((p) => p.id === id);
  const nm = (id) => esc(nomeDe(pid(id) || { nome: '?' }));
  const sel = [...A.sel].filter(pid);
  const chip = (p) => `<button class="chip ${A.sel.has(p.id) ? 'on' : ''}" data-id="${p.id}">${foto(p)}${esc(nomeDe(p))}${p.soGR ? ' <span title="Só joga à baliza">🧤</span>' : ''}${p.emprestado ? ` <span title="Emprestado de outra liga: perfil próprio ao ${JOGOS_EMPRESTADO}.º jogo">🔁</span>` : ''} <small class="mute">${ovElo(p.id)}</small></button>`;
  const opts = (vazio) => `<option value="">${vazio}</option>` + sel.map((id) => `<option value="${id}">${nm(id)}</option>`).join('');
  // 🧤 Só joga à baliza NESTE jogo: por defeito o que está no plantel (players.soGR); aqui troca-se só para este jogo (R.gr).
  R.gr ||= {};
  const soGR = (id) => (id in R.gr ? R.gr[id] : !!pid(id)?.soGR);
  const nOpc = R.separar.length + R.juntar.length + Object.keys(R.cor).filter((id) => A.sel.has(id)).length + Object.keys(R.gr).filter((id) => A.sel.has(id)).length;

  el.innerHTML = `
    <p class="mute">Toca nos que vão jogar (da sondagem do WhatsApp).</p>
    <div class="linha"><b id="cont"></b><button class="peq" id="limpar">Limpar</button></div>
    <div class="chips" style="margin:10px 0">${grupo.map(chip).join('')}</div>
    <h3>Convidados (+1)</h3>
    <div class="chips" style="margin-bottom:8px">${convidados.map(chip).join('') || '<span class="mute">Nenhum ainda.</span>'}</div>
    <details class="opcao" id="d-conv"><summary><b>+ Novo convidado</b></summary>
      <label>Nome (ex.: Amigo do Boni)</label><input id="c-nome">
      <label>Nota provisória: <b id="c-nv">60</b>/100</label><input id="c-nota" type="range" min="0" max="100" value="60">
      <label style="margin-top:6px"><input type="checkbox" id="c-sogr" style="width:auto"> 🧤 Só joga à baliza</label>
      <button class="prim" id="c-add" style="margin-top:8px">Adicionar e selecionar</button>
      <p class="mute">Fica guardado para reaproveitar noutros jogos.</p></details>
    <details class="opcao" id="d-emp"><summary><b>🔁 Jogador de outra liga</b> <span class="mute">(emprestado)</span></summary>
      <p class="mute">Entra só com a nota geral que tem nas outras ligas. Ao ${JOGOS_EMPRESTADO}.º jogo aqui passa a ter perfil próprio nesta liga.</p>
      <div id="emp-cx"><p class="mute">A carregar…</p></div></details>
    <details class="opcao" ${nOpc ? 'open' : ''}><summary><b>Opções (opcional)</b> ${nOpc ? `<span class="tag">${nOpc} ativas</span>` : '<span class="mute">por defeito nada</span>'}</summary>
      ${sel.length < 2 ? '<p class="mute">Seleciona primeiro os jogadores.</p>' : `
      <label>Não juntar na mesma equipa</label>
      <div class="linha"><select id="s1" style="width:auto">${opts('—')}</select><select id="s2" style="width:auto">${opts('—')}</select><button class="peq" id="s-add">Adicionar</button></div>
      ${R.separar.map(([a, b], i) => `<div class="linha"><span>🚫 ${nm(a)} ≠ ${nm(b)}</span><button class="peq" data-rs="${i}">✕</button></div>`).join('')}
      <label>Juntar na mesma equipa</label>
      <div class="linha"><select id="j1" style="width:auto">${opts('—')}</select><select id="j2" style="width:auto">${opts('—')}</select><select id="j3" style="width:auto">${opts('(opcional)')}</select><button class="peq" id="j-add">Adicionar</button></div>
      ${R.juntar.map((g, i) => `<div class="linha"><span>🤝 ${g.map(nm).join(' + ')}</span><button class="peq" data-rj="${i}">✕</button></div>`).join('')}
      <label>🧤 Só joga à baliza (neste jogo)</label>
      <div class="chips">${sel.map((id) => `<button class="chip ${soGR(id) ? 'on' : ''}" data-sogr="${id}">${soGR(id) ? '🧤 ' : ''}${nm(id)}</button>`).join('')}</div>
      <p class="mute" style="font-size:12px;margin-top:4px">Fica na baliza o jogo todo. Com dois, fica um em cada equipa; com um, a equipa dele leva jogadores de campo um pouco mais fracos (e conta mais a stamina, porque não descansam na baliza).</p>
      <label>Só trouxe camisola…</label>
      <div class="cores">${sel.map((id) => `<div class="linha"><span style="flex:1">${nm(id)}</span>
        ${['', 'B', 'P'].map((c) => `<button class="peq ${(R.cor[id] || '') === c ? 'on' : ''}" data-cor="${id}" data-c="${c}">${c === 'B' ? '⚪' : c === 'P' ? '⚫' : 'qualquer'}</button>`).join('')}</div>`).join('')}</div>`}
    </details>
    ${X.elo && Object.keys(X.elo).length ? `<label style="margin:6px 0"><input type="checkbox" id="usar-elo" ${A.usarElo ? 'checked' : ''} style="width:auto"> Ajustar pela forma (Elo dos jogos registados, no máximo ±10 % da carta de cada um)</label>` : ''}
    <button class="prim" id="gerar" style="width:100%">Gerar equipas equilibradas</button>
    <div id="res"></div>`;

  const cont = () => (document.getElementById('cont').textContent = `${A.sel.size} selecionados`);
  cont();
  el.querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
    A.sel.has(b.dataset.id) ? A.sel.delete(b.dataset.id) : A.sel.add(b.dataset.id);
    pub(); secEquipas(el, X);
  }));
  document.getElementById('limpar').onclick = () => { A.sel.clear(); A.restr = null; pub(); secEquipas(el, X); };
  const g = (id) => document.getElementById(id);
  g('c-nota').oninput = (e) => (g('c-nv').textContent = e.target.value);
  // 🔁 Emprestado: alguém de outra liga (👥 Contas), só com a nota geral de lá.
  g('d-emp').ontoggle = async () => {
    if (!g('d-emp').open || g('emp-sel')) return;
    const L = (await paraEmprestar().catch(() => [])).filter((x) => !X.players.some((p) => p.emprestado?.pessoa === x.pessoa));
    g('emp-cx').innerHTML = L.length ? `<select id="emp-sel">${L.map((x, i) => `<option value="${i}">${esc(x.nome)}${x.conv ? ' (convidado)' : ''} — ${esc(x.ligas)}${x.ov != null ? ` · ${x.ov}` : ''}</option>`).join('')}</select>
      <button class="prim" id="emp-add" style="margin-top:8px">Emprestar e selecionar</button>`
      : '<p class="mute">Não há ninguém de outras ligas para emprestar (ou só o admin pode ver a lista).</p>';
    g('emp-add')?.addEventListener('click', async () => {
      const x = L[Number(g('emp-sel').value)]; if (!x) return;
      const id = await X.addConvidado({ nome: x.nome, alcunha: '', foto: '', ativo: true, convidado: true, nota100: x.ov ?? 60, nivel: null,
        emprestado: { pessoa: x.pessoa, ts: Date.now() }, ...(x.sinc ? { sinc: x.sinc } : {}) });
      await DB.ligarPessoa(x.pessoa, id).catch(() => {});   // fica na pessoa (👥 Contas): o histórico junta-se
      A.sel.add(id); toast(`${x.nome} emprestado ✔`); pub(); secEquipas(el, X);
    });
  };
  g('c-add').onclick = async () => {
    const nome = g('c-nome').value.trim();
    if (!nome) return toast('Falta o nome');
    const id = await X.addConvidado({ nome, alcunha: '', foto: '', ativo: true, convidado: true, nota100: Number(g('c-nota').value), nivel: null, ...(g('c-sogr').checked ? { soGR: true } : {}) });
    A.sel.add(id); pub(); secEquipas(el, X);
  };
  g('s-add')?.addEventListener('click', () => {
    const a = g('s1').value, b = g('s2').value;
    if (!a || !b || a === b) return toast('Escolhe dois jogadores diferentes');
    R.separar.push([a, b]); pub(); secEquipas(el, X);
  });
  g('j-add')?.addEventListener('click', () => {
    const gr = [...new Set([g('j1').value, g('j2').value, g('j3').value].filter(Boolean))];
    if (gr.length < 2) return toast('Escolhe pelo menos dois jogadores');
    R.juntar.push(gr); pub(); secEquipas(el, X);
  });
  el.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = () => { R.separar.splice(b.dataset.rs, 1); pub(); secEquipas(el, X); }));
  el.querySelectorAll('[data-rj]').forEach((b) => (b.onclick = () => { R.juntar.splice(b.dataset.rj, 1); pub(); secEquipas(el, X); }));
  el.querySelectorAll('[data-sogr]').forEach((b) => (b.onclick = () => { const id = b.dataset.sogr; R.gr[id] = !soGR(id); pub(); secEquipas(el, X); }));
  el.querySelectorAll('[data-cor]').forEach((b) => (b.onclick = () => {
    if (b.dataset.c) R.cor[b.dataset.cor] = b.dataset.c; else delete R.cor[b.dataset.cor];
    pub(); secEquipas(el, X);
  }));

  g('usar-elo')?.addEventListener('change', async (e) => {
    A.usarElo = e.target.checked;
    try {
      const estado = (await DB.getPublic('estado')) || {};
      await DB.setPublic('estado', { ...estado, usarElo: A.usarElo });   // o perfil de cada um diz se o Elo está a contar
    } catch { /* moderador/colaborador: sem permissão, vale só para estas equipas */ }
    el.querySelectorAll('.chip[data-id]').forEach((b) => { const sm = b.querySelector('small'); if (sm) sm.innerHTML = ovElo(b.dataset.id); });
  });
  g('gerar').onclick = () => {
    const ids = [...A.sel];
    if (ids.length < 4 || ids.length % 2) return toast('Escolhe um número par de jogadores (10)');
    const restr = {
      separar: R.separar.filter((p) => p.every((x) => A.sel.has(x))),
      juntar: R.juntar.map((gr) => gr.filter((x) => A.sel.has(x))).filter((gr) => gr.length > 1),
      cor: Object.fromEntries(Object.entries(R.cor).filter(([id]) => A.sel.has(id))),
      // Quem só joga à baliza (players/{id}.soGR, marcado no plantel): o gerador põe-no a GR e equilibra com isso.
      soGR: [...A.sel].filter(soGR),
    };
    const anteriores = [...X.games].sort((a, b) => (b.criado || 0) - (a.criado || 0)).slice(0, 3).map((x) => [x.brancos || [], x.pretos || []]);
    const ops = gerarEquipas(ids, A.usarElo && X.elo ? aplicarForma(cartas, X.elo) : cartas, anteriores, 3, restr);
    if (!ops.length) return (g('res').innerHTML = '<p class="opcao">Não há nenhuma divisão que cumpra todas as opções. Tira alguma.</p>');
    if (VV) { VV.opcoes = ops.map(opcaoPub); VV.escolhida = null; X.publicar({ opcoes: VV.opcoes, escolhida: null }); }
    mostrar(ops);
  };
  // Depois de ver as equipas: afinar a nota dos convidados (0–100) e voltar a gerar.
  function ajusteConv() {
    const L = [...A.sel].filter((id) => pid(id)?.convidado);
    if (!L.length) return '';
    return `<div class="opcao"><b>Ajustar convidados</b> <span class="mute">e voltar a gerar</span>
      ${L.map((id) => `<label>${nm(id)}: <b id="nv-${id}">${cartas[id]?.overall ?? 60}</b>/100</label>
        <input type="range" min="0" max="100" value="${cartas[id]?.overall ?? 60}" data-nv="${id}">`).join('')}
      <button class="prim" id="regerar" style="width:100%;margin-top:8px">Re-gerar equipas</button></div>`;
  }
  function ligarAjuste() {
    el.querySelectorAll('[data-nv]').forEach((r) => (r.oninput = () => (g('nv-' + r.dataset.nv).textContent = r.value)));
    g('regerar')?.addEventListener('click', () => {
      for (const r of el.querySelectorAll('[data-nv]')) {
        const id = r.dataset.nv, n = Number(r.value);
        if (cartas[id]?.overall === n) continue;
        cartas[id] = { ...(cartas[id] || {}), overall: n, stats: Object.fromEntries(AREAS.map((a) => [a.k, n / 10])), estimada: true };
        const p = pid(id); if (p) p.nota100 = n;
        X.notaConvidado?.(id, n).catch((e) => console.error(e));   // fica guardado para os próximos jogos
      }
      g('gerar').click();
    });
  }
  // Cartão do jogo: emblemas + rating da equipa com estrelas, barras espelhadas por área
  // (Brancos à esquerda, Pretos à direita) e os plantéis em pequeno. Rating = média do overall sem GR
  // (o que o gerador equilibra). 🧤 = melhor GR da equipa (só informativo, não conta).
  const medE = (eq, f) => { const v = eq.map(f).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const areaE = (eq, k) => (k === 'gr' ? Math.max(...eq.map((id) => (cartas[id]?.stats.gr ?? 6) * 10)) : medE(eq, (id) => cartas[id]?.stats[k] != null ? cartas[id].stats[k] * 10 : null));
  const estrelas = (ov) => { const n = Math.max(0.5, Math.min(5, Math.round(((ov ?? 0) / 20) * 2) / 2));
    return '<span class="on">' + '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') + '</span>' + '★'.repeat(5 - Math.ceil(n)); };
  const melhorGR = (eq) => eq.reduce((m, id) => ((cartas[id]?.stats.gr ?? 0) > (cartas[m]?.stats.gr ?? 0) ? id : m), eq[0]);
  // GR fixo (só joga à baliza, ranking.js): o.grFixo = { A, B } na opção; no jogo fica { B: brancos, P: pretos }.
  // 🧤 GR = fixo (o jogo todo na baliza); 🧤 sozinho = melhor GR de uma equipa que roda (só informativo).
  const fixoDe = (o, eq) => (eq === o.A ? o.grFixo?.A : o.grFixo?.B) || null;
  const marcaGR = (o, eq, id) => (id === fixoDe(o, eq) ? '🧤 GR' : !fixoDe(o, eq) && id === melhorGR(eq) ? '🧤' : '');
  const grFixoJogo = (o) => (o.grFixo?.A || o.grFixo?.B ? { B: o.grFixo.A || null, P: o.grFixo.B || null } : null);
  const opcaoPub = (o) => ({ A: o.A, B: o.B, ovA: o.ovA, ovB: o.ovB, ...(o.grFixo ? { grFixo: o.grFixo } : {}) });
  const textoEquipas = (titulo, o, nomes, lado) => `⚽ ${titulo}\n\n⚪ BRANCOS\n${o.A.map((id) => nomes[id] + (id === fixoDe(o, o.A) ? ' 🧤 GR' : '')).join('\n')}`
    + `\n\n⚫ PRETOS\n${o.B.map((id) => nomes[id] + (id === fixoDe(o, o.B) ? ' 🧤 GR' : '')).join('\n')}${lado?.B ? `\n\n${textoLado(lado)}` : ''}`;
  // Imagem 1080×1350 do cartão (para o WhatsApp), desenhada em canvas.
  async function imagemJogo(o, nomes, data, lado = null) {
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1d2a1f'); gr.addColorStop(0.6, '#0b120d'); gr.addColorStop(1, '#070a08');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    const img = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
    const [lB, lP] = await Promise.all([img('brancos.svg?v=2'), img('pretos.svg?v=2')]);
    const F = (px, peso = 800) => `${peso} ${px}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    const txt = (t, x, y, px, cor = '#fff', al = 'center', peso = 800) => { c.font = F(px, peso); c.fillStyle = cor; c.textAlign = al; c.fillText(t, x, y); };
    txt('EQUIPAS DE HOJE', W / 2, 70, 34, '#9aa3ab', 'center', 900);
    txt(new Date(data).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }), W / 2, 112, 28, '#6b7280', 'center', 600);
    const cols = [[270, lB, 'BRANCOS', o.ovA], [810, lP, 'PRETOS', o.ovB]];
    for (const [x, logo, nome, ovr] of cols) {
      c.drawImage(logo, x - 85, 145, 170, 204);
      txt(nome, x, 395, 36, '#fff', 'center', 900);
      txt(String(Math.round(ovr)), x, 495, 100, '#f1c40f', 'center', 900);
      const n = Math.max(0.5, Math.min(5, Math.round((ovr / 20) * 2) / 2));
      // Lado de início (não há troca de campo): 🚪 = começa do lado dos balneários.
      if (lado?.B) { const bal = (nome === 'BRANCOS') === (lado.B === 'balnearios');
        txt(bal ? '🚪 LADO DOS BALNEÁRIOS' : 'BALIZA DO OUTRO LADO', x, 592, 22, bal ? '#f1c40f' : '#9aa3ab', 'center', 900); }
      for (let k = 0; k < 5; k++) txt('★', x - 96 + k * 48, 552, 44, k < n ? '#f1c40f' : '#3a3f45');
    }
    txt('VS', W / 2, 470, 54, '#6b7280', 'center', 900);
    let y = lado?.B ? 645 : 620;   // espaço para a linha do lado de início
    for (const a of AREAS) {
      const vA = areaE(o.A, a.k), vB = areaE(o.B, a.k), d = (vA ?? 0) - (vB ?? 0);
      c.globalAlpha = a.k === 'gr' ? 0.5 : 1;
      const larg = (v) => Math.max(10, Math.min(1, ((v ?? 0) - 30) / 60) * 330);
      c.fillStyle = '#ffffff18'; c.fillRect(140, y - 18, 330, 18); c.fillRect(610, y - 18, 330, 18);
      c.fillStyle = d > 1 ? '#4ade80' : '#9aa3ab'; c.fillRect(470 - larg(vA), y - 18, larg(vA), 18);
      c.fillStyle = d < -1 ? '#4ade80' : '#9aa3ab'; c.fillRect(610, y - 18, larg(vB), 18);
      txt(vA == null ? '–' : String(Math.round(vA)), 105, y, 34, d > 1 ? '#4ade80' : '#ddd', 'center', 800);
      txt(vB == null ? '–' : String(Math.round(vB)), 975, y, 34, d < -1 ? '#4ade80' : '#ddd', 'center', 800);
      txt(a.k === 'gr' ? 'GR' : a.ab, W / 2, y, 28, '#aaa', 'center', 900);
      c.globalAlpha = 1; y += 52;
    }
    c.fillStyle = '#ffffff22'; c.fillRect(80, y + 4, W - 160, 2);
    y += 64;
    for (let k = 0; k < Math.max(o.A.length, o.B.length); k++) {
      const mA = o.A[k] && marcaGR(o, o.A, o.A[k]), mB = o.B[k] && marcaGR(o, o.B, o.B[k]);
      if (o.A[k]) txt(nomes[o.A[k]] + (mA ? ' ' + mA : ''), 90, y, 40, '#fff', 'left', 700);
      if (o.B[k]) txt((mB ? mB + ' ' : '') + nomes[o.B[k]], W - 90, y, 40, '#fff', 'right', 700);
      y += lado?.B ? 53 : 56;
    }
    txt(grFixoJogo(o) ? '🧤 GR = só joga à baliza · 🧤 = melhor GR da equipa' : '🧤 = melhor guarda-redes da equipa', W / 2, H - 22, 24, '#6b7280', 'center', 600);
    return new Promise((ok) => cv.toBlob(ok, 'image/png'));
  }
  function cartaoJogo(o) {
    const barra = (v, lado, ganha) => `<div class="fb ${lado}"><i style="width:${Math.max(4, Math.min(100, ((v ?? 0) - 30) / 0.6))}%" class="${ganha ? 'ganha' : ''}"></i></div>`;
    const linha = (a) => {
      const vA = areaE(o.A, a.k), vB = areaE(o.B, a.k), d = (vA ?? 0) - (vB ?? 0);
      return `<div class="fl${a.k === 'gr' ? ' gr' : ''}"><b class="${d > 1 ? 'ganha' : ''}">${vA == null ? '–' : Math.round(vA)}</b>${barra(vA, 'esq', d > 1)}
        <span>${a.k === 'gr' ? '🧤 GR' : a.ab}</span>${barra(vB, 'dir', d < -1)}<b class="${d < -1 ? 'ganha' : ''}">${vB == null ? '–' : Math.round(vB)}</b></div>`;
    };
    const plantel = (eq) => eq.map((id) => { const m = marcaGR(o, eq, id);
      return `<div>${nm(id)}${m ? ` <span title="${m === '🧤' ? 'Melhor GR da equipa' : 'Só joga à baliza: GR o jogo todo'}">${m}</span>` : ''} <small class="mute">${ovElo(id)}</small></div>`; }).join('');
    return `<div class="cjogo">
      <div class="ftopo">
        <div class="fequipa">${LOGO.B}<div class="fnome">BRANCOS</div><div class="frat">${o.ovA.toFixed(0)}</div><div class="festr">${estrelas(o.ovA)}</div></div>
        <div class="fvs">VS</div>
        <div class="fequipa">${LOGO.P}<div class="fnome">PRETOS</div><div class="frat">${o.ovB.toFixed(0)}</div><div class="festr">${estrelas(o.ovB)}</div></div>
      </div>
      <div class="fbarras">${AREAS.map(linha).join('')}<div class="mute fnota">${grFixoJogo(o) ? '🧤 GR fixo o jogo todo — já conta para equilibrar (a outra equipa roda na baliza)' : '🧤 GR só informativo — não conta para equilibrar'}</div></div>
      <div class="fplant"><div>${plantel(o.A)}</div><div>${plantel(o.B)}</div></div>
    </div>`;
  }
  function mostrar(ops) {
    g('res').innerHTML = ops.map((o, k) => `<div class="opcao"><b>Opção ${k + 1}</b>
      ${cartaoJogo(o)}
      <div class="linha"><button class="prim peq" data-k="${k}">${X.vivo ? '✅ Escolher estas' : '✅ Escolher e partilhar no WhatsApp'}</button>${Object.keys(A.restr.cor).length ? '' : `<button class="peq" data-tr="${k}">Trocar cores</button>`}</div></div>`).join('') + ajusteConv();
    ligarAjuste();
    el.querySelectorAll('[data-tr]').forEach((b) => (b.onclick = () => {
      const o = ops[b.dataset.tr]; [o.A, o.B] = [o.B, o.A]; [o.ovA, o.ovB] = [o.ovB, o.ovA];
      if (o.grFixo) o.grFixo = { A: o.grFixo.B, B: o.grFixo.A };
      if (VV) X.publicar({ opcoes: ops.map(opcaoPub) });
      mostrar(ops);
    }));
    if (VV) return el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = async () => {
      const k = Number(b.dataset.k), o = ops[k];
      const nomes = Object.fromEntries([...o.A, ...o.B].map((id) => [id, nomeDe(pid(id))]));
      b.disabled = true;
      const ladoInicio = sortearLado(), criado = Date.now();
      const dataJ = VV.data || hojeLocal(), outros = (X.games || []).filter((x) => x.id !== VV.gameId);
      const desafios = atribuirDesafios({ id: VV.gameId, brancos: o.A, pretos: o.B, criado }, outros, { relogio: X.relogio || [] });
      const desafiosMes = completarDesafiosMes(dataJ.slice(0, 7), [...o.A, ...o.B], outros, { relogio: X.relogio || [] });
      const grFixo = grFixoJogo(o);
      const id = await X.saveGame({ data: dataJ, brancos: o.A, pretos: o.B, nomes, estado: 'marcado', criado, ladoInicio, desafios, desafiosMes, ...(grFixo ? { grFixo } : {}) }, VV.gameId || undefined);
      Object.assign(VV, { escolhida: k, gameId: id, partilhado: null });
      VV.ladoInicio = ladoInicio;
      await X.publicar({ escolhida: k, gameId: id, partilhado: null, nomes, ladoInicio });   // o marcador começa com o lado sorteado
      escolhidas(o);
    }));
    el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = async () => {
      const o = ops[b.dataset.k];
      const data = X.vivo?.data || hojeLocal();
      const nomes = Object.fromEntries([...o.A, ...o.B].map((id) => [id, nomeDe(pid(id))]));
      const ladoInicio = sortearLado();
      const texto = textoEquipas('Equipas de hoje', o, nomes, ladoInicio);
      // Primeiro a partilha (o telemóvel só a deixa abrir logo a seguir ao toque), depois guarda.
      let png = null;
      try { png = await imagemJogo(o, nomes, data, ladoInicio); } catch (e) { console.error(e); }
      await partilharWhatsApp(png, texto, `equipas-${data}.png`);
      // Desafios do jogo (1 a 3 por convocado, sem repetir entre jogadores nem do jogo anterior) — desafios.js.
      const criado = Date.now(), desafios = atribuirDesafios({ brancos: o.A, pretos: o.B, criado }, X.games || [], { relogio: X.relogio || [] });
      const desafiosMes = completarDesafiosMes(data.slice(0, 7), [...o.A, ...o.B], X.games || [], { relogio: X.relogio || [] });   // só os que ainda não têm o do mês
      const grFixo = grFixoJogo(o);
      await X.saveGame({ data, brancos: o.A, pretos: o.B, nomes, estado: 'marcado', criado, ladoInicio, desafios, desafiosMes, ...(grFixo ? { grFixo } : {}) });
      // Confirmação: as equipas ficam como as do próximo jogo; daqui vai-se direto para o marcador.
      g('res').innerHTML = `<div class="opcao" style="text-align:center"><h3 style="margin:4px 0">✅ Equipas escolhidas</h3>
        ${cartaoJogo(o)}
        ${campoLados(ladoInicio)}<p class="mute" style="margin-top:4px">Pode trocar-se no ecrã do START do marcador.</p>
        <p class="mute">Ficam como as equipas do jogo de hoje (link geral, relógio e marcador).</p>
        ${X.irMarcador ? '<button class="prim" id="ir-marc" style="width:100%;padding:14px;font-size:18px">⏱ Abrir o marcador com estas equipas</button>'
          : '<p class="mute">No relógio: "Descarregar equipas" e START GAME.</p>'}
        <button class="peq" id="refazer" style="margin-top:8px">Refazer equipas</button></div>`;
      g('ir-marc')?.addEventListener('click', X.irMarcador);
      g('refazer').onclick = () => g('gerar').click();
      window.scrollTo(0, g('res').offsetTop - 60);
    }));
  }
  // Moderadores: equipas escolhidas (iguais para todos). Qualquer um envia para o grupo, abre o marcador
  // ou, se ninguém marcou, fecha o jogo só com o vencedor.
  function escolhidas(o) {
    const v = X.vivo, hora = (t) => new Date(t).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    g('res').innerHTML = `<div class="opcao" style="text-align:center"><h3 style="margin:4px 0">✅ Equipas escolhidas</h3>
      ${cartaoJogo(o)}
      ${campoLados(v.ladoInicio)}
      ${v.partilhado ? `<p class="mute">📤 Enviadas para o grupo por ${esc(v.partilhado.nome)} às ${hora(v.partilhado.ts)}.</p>` : '<p><b>⚠️ Ainda ninguém as enviou para o grupo.</b></p>'}
      <button class="${v.partilhado ? '' : 'prim'}" id="partilhar" style="width:100%;margin-bottom:8px">📤 ${v.partilhado ? 'Enviar outra vez' : 'Enviar'} para o grupo (WhatsApp)</button>
      ${v.fase === 'fim' ? (X.teste ? '<p>🧪 Teste terminado (não foi registado).</p>' : '<p>✅ Jogo terminado e registado.</p>') : '<button class="prim" id="ir-marc" style="width:100%;padding:14px;font-size:18px">⏱ Abrir o marcador</button>'}
      ${v.fase === 'fim' ? '' : '<button class="peq" id="refazer" style="margin-top:8px">Refazer equipas</button>'}
      ${v.fase === 'fim' ? '' : `<details class="opcao" style="text-align:left;margin-top:10px"><summary><b>Ninguém marcou? Fechar só com o vencedor</b></summary>
        <label>Dia em que se jogou</label><input type="date" class="pD" value="${esc(v.data || hojeLocal())}" style="width:auto">
        <label>Resultado (opcional)</label>
        <div class="linha"><input type="number" min="0" class="pB" placeholder="⚪" style="width:70px"> – <input type="number" min="0" class="pP" placeholder="⚫" style="width:70px"></div>
        <div class="linha" style="margin-top:8px"><button class="prim peq" data-fm="B">Ganhou ⚪</button><button class="peq" data-fm="E">Empate</button><button class="prim peq" data-fm="P">Ganhou ⚫</button></div></details>`}</div>`;
    g('partilhar').onclick = async () => {
      // Jogo de teste: não abre o WhatsApp (não se mandam equipas a fingir para o grupo); só marca como enviado.
      if (X.teste) { v.partilhado = { nome: nomeDe(X.eu), ts: Date.now() }; await X.publicar({ partilhado: v.partilhado }); toast('🧪 Teste: fica marcado como enviado (nada foi enviado)'); return escolhidas(o); }
      const data = v.data || hojeLocal();
      const nomes = Object.fromEntries([...o.A, ...o.B].map((id) => [id, nomeDe(pid(id))]));
      const texto = textoEquipas(`Equipas de ${diaPT(data)}`, o, nomes, v.ladoInicio);
      let png = null;
      try { png = await imagemJogo(o, nomes, data, v.ladoInicio); } catch (e) { console.error(e); }
      await partilharWhatsApp(png, texto, `equipas-${data}.png`);
      v.partilhado = { nome: nomeDe(X.eu), ts: Date.now() };
      await X.publicar({ partilhado: v.partilhado });
      escolhidas(o);
    };
    g('ir-marc')?.addEventListener('click', X.irMarcador);
    g('refazer')?.addEventListener('click', () => {
      if (!confirm('Refazer as equipas? As escolhidas deixam de valer (para todos).')) return;
      v.escolhida = null; X.publicar({ escolhida: null, partilhado: null }); v.partilhado = null;
      mostrar(v.opcoes || []);
    });
    el.querySelectorAll('[data-fm]').forEach((b) => (b.onclick = async () => {
      const box = b.closest('details'), gm = { id: v.gameId, data: v.data, brancos: o.A, pretos: o.B, nomes: Object.fromEntries([...o.A, ...o.B].map((id) => [id, nomeDe(pid(id))])) };
      if (X.teste) { await X.publicar({ fase: 'fim' }); v.fase = 'fim'; toast('🧪 Teste fechado (não conta)'); return escolhidas(o); }
      if (!(await fecharManual(box, gm, b.dataset.fm, X.K, (id) => nomeDe(pid(id) || { nome: id })))) return;
      await X.publicar({ fase: 'fim' }); v.fase = 'fim'; escolhidas(o);
    }));
  }
  if (VV?.opcoes?.length) {
    if (VV.gameId && VV.escolhida != null && VV.opcoes[VV.escolhida]) escolhidas(VV.opcoes[VV.escolhida]);
    else mostrar(VV.opcoes.map((o) => ({ ...o })));
  }
}

// =====================================================================
// COLABORADOR (#c=CHAVE): fazer equipas + marcador no telemóvel, sem login
// =====================================================================
async function paginaColab(K, mod = null) {
  // Moderador: desenha dentro do separador 🛡 Moderador; o link de colaborador ocupa a página toda.
  const $app = mod ? document.getElementById('pub') : document.getElementById('app');
  if (!$app) return;
  if (!mod) document.getElementById('titulo').textContent = 'Futebol';
  const retrato = await DB.getPart(K, 'dados', 'retrato');
  if (!retrato) { $app.innerHTML = '<p class="centro">Este link já não é válido. Pede um novo ao Rui.</p>'; return; }
  // Moderadores: o jogo de hoje (aovivo/jogo) está igual em todos os telemóveis, em tempo real.
  if (mod && !A.offVivo) {
    let primeiro = true;
    A.offVivo = () => {};
    A.offVivo = DB.ouvirAoVivo((v) => {
      A.vivo = v;
      if (primeiro) { primeiro = false; return paginaColab(K, mod); }
      aoVivoMudou(K, mod);
    }, docVivo());
    return;
  }
  const V = mod ? A.vivo : null;
  // Sem jogo aberto, o moderador só vê a barra (abrir jogo).
  if (mod && !V) { $app.innerHTML = `<div class="mod-barra ${A.teste ? 'teste' : ''}" id="mod-barra"></div><p class="mute">Abre um jogo novo para fazer as equipas e marcar. Os outros moderadores veem tudo ao mesmo tempo.</p>`; return barraModerador(K, mod); }
  A.colabTab ||=mod ? (V?.gameId && V.fase !== 'fim' ? 'marc' : 'eq') : 'marc';
  $app.innerHTML = `${mod ? `<div class="mod-barra ${A.teste ? 'teste' : ''}" id="mod-barra"></div>` : ''}<div class="tabs"><button data-ct="marc" class="${A.colabTab === 'marc' ? 'on' : ''}">⏱ Marcador do jogo</button>
    <button data-ct="eq" class="${A.colabTab === 'eq' ? 'on' : ''}">👥 Fazer equipas</button></div><div id="sec"></div>`;
  $app.querySelectorAll('[data-ct]').forEach((b) => (b.onclick = () => { A.colabTab = b.dataset.ct; paginaColab(K, mod); }));
  if (mod) barraModerador(K, mod);
  const sec = document.getElementById('sec');
  const ultimasEquipas = async () => {
    const VV = A.vivo;
    if (mod && VV?.gameId && VV.opcoes?.[VV.escolhida]) {
      const o = VV.opcoes[VV.escolhida], n = (id) => ({ id, nome: VV.nomes?.[id] || retrato.jogadores.find((p) => p.id === id)?.alias || retrato.jogadores.find((p) => p.id === id)?.nome || id });
      const grFixo = o.grFixo?.A || o.grFixo?.B ? { B: o.grFixo.A || null, P: o.grFixo.B || null } : null;
      return { id: VV.gameId, data: VV.data, brancos: o.A.map(n), pretos: o.B.map(n), ladoInicio: VV.ladoInicio, grFixo };
    }
    const todas = [...(await DB.listPart(K, 'games')), ...(await DB.listGames().catch(() => []))];
    const g = (A.vivo?.gameId && todas.find((x) => x.id === A.vivo.gameId)) || todas.sort((a, b) => (b.criado || 0) - (a.criado || 0))[0];
    if (!g) return null;
    const n = (id) => ({ id, nome: g.nomes?.[id] || id });
    return { id: g.id, data: g.data, brancos: (g.brancos || []).map(n), pretos: (g.pretos || []).map(n), ladoInicio: g.ladoInicio, grFixo: g.grFixo || null };
  };
  if (A.colabTab === 'marc') {
    let carregarJa = A.carregarJa; A.carregarJa = false;
    // Moderador: as equipas escolhidas entram sozinhas no marcador (se este telemóvel não estiver a meio de outro jogo).
    const local = (() => { try { return JSON.parse(localStorage.getItem(lsMarcador())); } catch { return null; } })();
    if (mod && V?.gameId && local?.gameId !== V.gameId) carregarJa = true;
    return paginaMarcador({ el: sec, carregarEquipas: ultimasEquipas, carregarJa, ls: lsMarcador(), teste: !!(mod && A.teste),
      enviar: async (id, jogo) => {
        if (mod && A.teste) return;   // jogo de teste: não vai para os resultados
        await DB.saveResultado(id, { chave: K, gameId: jogo.gameId || '', ts: Date.now(), origem: 'telemovel', json: JSON.stringify({ jogo, fit: {} }) });
        await DB.saveJogoPub(id, { prova: await prova(K, id), ts: Date.now(), json: JSON.stringify(jogo) });
      },
      ...(mod ? { mudou: (j) => publicarMarcacao(j, mod), outro: () => outroAMarcar() } : {}) });
  }
  const ctx = async () => {
    const teste = !!(mod && A.teste);
    // No jogo de teste os convidados novos só existem neste telemóvel (não ficam guardados).
    const conv = [...(await DB.listPart(K, 'convidados')), ...(teste ? A.convTeste || [] : [])].map((c) => ({ ...c, convidado: true, ativo: true }));
    const base = retrato.jogadores.map((p) => ({ ...p, ativo: true }));
    const players = [...base, ...conv.filter((c) => !base.some((b) => b.id === c.id))];
    const cartas = Object.fromEntries(retrato.jogadores.map((p) => [p.id, { overall: p.overall, stats: p.stats || {} }]));
    for (const c of conv) { const n = retrato.fora?.[c.id] != null ? retrato.fora[c.id] / 10 : notaDe(c) ?? 6; cartas[c.id] = { overall: Math.round(n * 10), stats: Object.fromEntries(AREAS.map((a) => [a.k, n])), estimada: true }; }
    // Elo também para quem faz equipas sem ser admin: a partir dos jogos fechados (públicos, sem saúde).
    const [jogosPub, estado] = await Promise.all([DB.listJogosPub().catch(() => []), DB.getPublic('estado').catch(() => null)]);
    const fechados = jogosPub.map((r) => { try { return JSON.parse(r.json || '{}'); } catch { return {}; } }).filter((j) => j.fase === 'fim');
    A.usarElo ??= estado?.usarElo !== false;
    return {
      players, cartas, games: await DB.listPart(K, 'games'),
      elo: calcularElo(fechados, cartas),
      irMarcador() { A.colabTab = 'marc'; A.carregarJa = true; paginaColab(K, mod); window.scrollTo(0, 0); },
      async addConvidado(d) {
        const id = novoToken(10);
        if (teste) (A.convTeste ||= []).push({ id, ...d }); else await DB.setPart(K, 'convidados', id, d);
        Object.assign(X, await ctx()); if (mod && !teste) X.publicar({ conv: Date.now() }); return id;
      },
      async notaConvidado(id, n) { if (teste) return; const c = conv.find((x) => x.id === id); if (!c) return; const { id: _, convidado, ativo, ...d } = c; await DB.setPart(K, 'convidados', id, { ...d, nota100: n }); },
      // id: o moderador que refaz as equipas grava por cima do mesmo jogo (não fica um jogo em aberto a mais).
      async saveGame(g, id = novoToken(10)) {
        if (teste) return id.startsWith('teste-') ? id : 'teste-' + id;   // jogo de teste: não grava equipas
        await DB.setPart(K, 'games', id, g);
        await DB.saveGame({ ...g, id, prova: await prova(K, id) });
        Object.assign(X, await ctx());
        return id;
      },
      ...(mod ? { vivo: A.vivo || {}, eu: mod.eu, K, teste, publicar: (d) => DB.setAoVivo(d, true, docVivo()).catch((e) => { console.error(e); toast('Sem rede? ' + e.message); }) } : {}),
    };
  };
  const X = await ctx();
  A.ctxColab = X;
  secEquipas(sec, X);
}

// ---------- Moderadores: o jogo de hoje ao vivo ----------
// aovivo/jogo = { fase: 'aberto'|'jogo'|'fim', data, por, ts, sel, restr, opcoes, escolhida, gameId, partilhado, marcador, live }
// Jogo de teste (🧪): outro documento ao vivo (aovivo/teste), outro jogo guardado no telemóvel, e nada vai para
// equipas, resultados, estatísticas, Elo ou peso dos votos. Os moderadores em teste veem-se uns aos outros.
A.teste = lsGet('mod-teste') === '1';
const docVivo = () => (A.teste ? 'teste' : 'jogo');
const lsMarcador = () => (A.teste ? 'futebol-marcador-teste' : 'futebol-marcador-jogo');
function pararAoVivo() { A.offVivo?.(); A.offVivo = null; A.vivo = null; }
// O separador 🛡 só aparece a moderadores: confirma (sem atrasar a página) e redesenha se mudou.
async function confirmarModerador() {
  const id = lsGet('meu-perfil'); const antes = lsGet('sou-moderador') === '1';
  let agora = false;
  try { agora = !!id && !!(await DB.listPlayers()).find((p) => p.id === id)?.moderador; } catch { return; }
  if (agora !== antes) lsSet('sou-moderador', agora ? '1' : '');
  document.querySelector('#nav a[data-r="mod"]').hidden = !agora;
}
// À entrada, mostra logo o separador 🛡 a quem já se sabe que é moderador (confirmarModerador confirma depois).
document.querySelector('#nav a[data-r="mod"]').hidden = lsGet('sou-moderador') !== '1';
const MOD_DISP = (() => { let d = lsGet('futebol-disp'); if (!d) { d = novoToken(10); lsSet('futebol-disp', d); } return d; })();

// Mudou no telemóvel de outro moderador: redesenha a barra e, se não houver nada a meio aqui, a secção aberta.
function aoVivoMudou(K, mod) {
  if (A.pubTab !== 'mod' || !document.getElementById('mod-barra')) return;
  if (!document.getElementById('sec') || !A.vivo) return paginaColab(K, mod);   // jogo aberto (ou fechado) agora
  barraModerador(K, mod);
  const local = (() => { try { return JSON.parse(localStorage.getItem(lsMarcador())); } catch { return null; } })();
  const escrever = document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (A.colabTab === 'eq' && !escrever && A.ctxColab) {
    if (A.vivo?.conv && A.vivo.conv !== A.convVisto) { A.convVisto = A.vivo.conv; return paginaColab(K, mod); }   // convidado novo
    A.ctxColab.vivo = A.vivo || {};
    const y = window.scrollY; secEquipas(document.getElementById('sec'), A.ctxColab); window.scrollTo(0, y);
  }
  if (A.colabTab === 'marc' && (!local || local.fase === 'prep' || (local.fase === 'fim' && local.enviado))) {
    if (document.querySelector('.mfundo')) return;
    paginaColab(K, mod);
  }
}

function outroAMarcar() {
  const v = A.vivo;
  if (!v?.marcador || v.marcador.disp === MOD_DISP || v.fase !== 'jogo' || !v.live) return null;
  try { return { nome: v.marcador.nome, jogo: JSON.parse(v.live) }; } catch { return null; }
}

// O telemóvel que marca publica o jogo (no máximo de 1,5 em 1,5 s) para os outros moderadores verem e poderem assumir.
let pubMarc = null;
function publicarMarcacao(j, mod) {
  if (j.fase === 'prep' || !j.gameId || j.gameId !== A.vivo?.gameId) return;
  const enviar = () => {
    pubMarc = null;
    DB.setAoVivo({ fase: j.fase === 'fim' && (j.enviado || A.teste) ? 'fim' : 'jogo', live: JSON.stringify(j),
      marcador: { id: mod.eu.id, nome: nomeDe(mod.eu), disp: MOD_DISP, ts: Date.now() } }, true, docVivo()).catch((e) => console.error(e));
  };
  clearTimeout(pubMarc);
  if (j.fase === 'fim') enviar(); else pubMarc = setTimeout(enviar, 1500);
}

// Barra do topo: o jogo de hoje (passos) e abrir um jogo novo.
async function barraModerador(K, mod) {
  const el = document.getElementById('mod-barra'); if (!el) return;
  const v = A.vivo;
  if (!document.getElementById('mod-barra')) return;
  const hora = (t) => (t ? new Date(t).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '');
  const ativo = v && v.fase !== 'fim';
  let live = null; try { live = v?.live ? JSON.parse(v.live) : null; } catch {}
  const golosL = (e) => (live?.eventos || []).filter((x) => x.equipa === e).length;
  const passos = [['Aberto', !!ativo || v?.fase === 'fim'], ['Opções', !!v?.opcoes?.length], ['Escolhidas', !!v?.gameId], ['No grupo', !!v?.partilhado],
    ['A jogar', v?.fase === 'jogo' || v?.fase === 'fim'], ['Fim', v?.fase === 'fim']];
  el.classList.toggle('teste', !!A.teste);
  el.innerHTML = `
    <label class="linha" style="margin:0 0 8px;gap:8px;flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" id="mb-teste" ${A.teste ? 'checked' : ''} style="width:auto;flex:none;margin-top:3px">
      <span>🧪 <b>Jogo de teste</b> <span class="mute">— não conta para nada; para experimentar e mostrar à malta</span></span></label>
    ${A.teste ? '<div class="teste-faixa">🧪 MODO DE TESTE — nada fica nas equipas, resultados nem estatísticas. Os outros moderadores em teste veem o mesmo.</div>' : ''}
    ${v ? `<div class="linha" style="justify-content:space-between"><b>⚽ ${A.teste ? 'Teste' : 'Jogo'} de ${esc(diaPT(v.data))}</b><span class="mute">aberto por ${esc(v.por?.nome || '?')} ${hora(v.ts)}</span></div>
      ${v.fase === 'jogo' && live ? `<div style="margin-top:6px"><span class="ao-vivo"></span><b>⚪ ${golosL('B')} – ${golosL('P')} ⚫</b> <span class="mute">· marca ${esc(v.marcador?.nome || '?')}${v.marcador?.disp === MOD_DISP ? ' (este telemóvel)' : ''}</span></div>` : ''}
      ${v.fase === 'fim' && live ? `<div style="margin-top:6px">✅ Final: <b>⚪ ${golosL('B')} – ${golosL('P')} ⚫</b></div>` : ''}
      ${v.gameId && !v.partilhado && v.fase !== 'fim' ? '<div class="mute" style="margin-top:6px">⚠️ Equipas escolhidas mas ainda ninguém as enviou para o grupo.</div>' : ''}
      ${v.partilhado ? `<div class="mute" style="margin-top:4px">📤 Enviadas para o grupo por ${esc(v.partilhado.nome)} ${hora(v.partilhado.ts)}</div>` : ''}
      <div class="passos">${passos.map(([n, ok]) => `<span class="${ok ? 'feito' : ''}">${ok ? '✓ ' : ''}${n}</span>`).join('')}</div>` : '<b>Nenhum jogo aberto.</b>'}
    <div class="linha" style="margin-top:10px;justify-content:space-between">
      <span></span>
      ${ativo ? '<button class="peq" id="mb-novo">Abrir outro jogo</button>' : ''}</div>
    ${ativo ? '' : `<div class="linha" style="margin-top:8px"><input type="date" id="mb-data" value="${hojeLocal()}" style="width:auto"><button class="prim" id="mb-abrir">⚽ Abrir ${A.teste ? 'jogo de teste' : 'jogo novo'}</button></div>`}`;
  el.querySelector('#mb-teste').onchange = (e) => {
    A.teste = e.target.checked; lsSet('mod-teste', A.teste ? '1' : '');
    pararAoVivo(); A.colabTab = null; A.sel = new Set(); A.restr = null;
    paginaColab(K, mod);
  };
  const abrir = async (data) => {
    await DB.setAoVivo({ fase: 'aberto', data, por: { id: mod.eu.id, nome: nomeDe(mod.eu) }, ts: Date.now(), sel: [], restr: '', opcoes: null,
      escolhida: null, gameId: null, partilhado: null, marcador: null, live: null, nomes: null }, false, docVivo());
    A.sel = new Set(); A.restr = null; A.colabTab = 'eq';
  };
  el.querySelector('#mb-abrir')?.addEventListener('click', () => abrir(el.querySelector('#mb-data').value || hojeLocal()));
  el.querySelector('#mb-novo')?.addEventListener('click', () => {
    if (v.fase === 'jogo' && !confirm('Há um jogo a ser marcado. Abrir outro mesmo assim?')) return;
    if (confirm(`Fechar o jogo de ${diaPT(v.data)} aqui e abrir um novo (hoje)?`)) abrir(hojeLocal());
  });
}

// Separador 🛡 Moderador (com o PIN no 👤 Eu): abrir jogo, fazer equipas e marcar, tudo partilhado entre moderadores.
async function paginaJogo(el) {
  const $app = el;
  const [players, perfis] = await Promise.all([DB.listPlayers(), DB.listPerfis()]);
  const todos = juntarPerfis(players, perfis);
  const eu = todos.find((p) => p.id === lsGet('meu-perfil'));
  const sair = (t) => { $app.innerHTML = `<div class="fim"><p>${t}</p><button class="prim" id="ir-eu">👤 Ir para o meu perfil</button></div>`;
    document.getElementById('ir-eu').onclick = () => { location.hash = '#eu'; }; };
  if (!eu || !(await DB.ligacaoOk(eu.id))) return sair('Entra primeiro no teu perfil com o PIN.');
  if (!eu.moderador) return sair('Este separador é só para os moderadores. Fala com o Rui.');
  const K = (await DB.getModeracao('chave').catch(() => null))?.chave;
  if (!K) return sair('Ainda não está pronto: o Rui tem de abrir o admin uma vez.');
  return paginaColab(K, { eu });
}

// =====================================================================
// Destino da barra de navegação de cada rota; as outras são subpáginas (com ← no topo).
const NAV = { '': 'inicio', '#': 'inicio', '#jogos': 'jogos', '#jogadores': 'jogadores', '#cartas': 'jogadores', '#tabela': 'tabela', '#eu': 'eu', '#admin': 'admin',
  '#votar': 'eu', '#jogo': 'mod' };
const PRINCIPAIS = ['', '#', '#jogos', '#jogadores', '#cartas', '#tabela', '#eu', '#admin', '#jogo'];
const PAI = { '#votar': '#eu', '#definicoes': '#eu', '#ligas': '#definicoes', '#contas': '#ligas' };
const paiDe = (h) => PAI[h] || (h.startsWith('#jogador=') ? '#jogadores' : h.startsWith('#jogo=') ? '#jogos' : h.startsWith('#votar=') ? '#' : '#');
// Profundidade dentro da app, guardada no histórico: o ← só volta atrás se viemos de uma página da app.
// Veio de "Partilhar → Futebolada": tira o ?partilha=1 do endereço (o ficheiro espera na cache até o perfil o ler).
if (new URLSearchParams(location.search).has('partilha')) history.replaceState(null, '', location.pathname + (location.hash || '#eu'));
// Liga ativa (escolhida em ⚙️ → Ligas): tudo o que se lê e grava passa a ser dessa liga.
// Todas as ligas são iguais; a "Futebolada semanal" só fica na raiz da base de dados. Cada liga tem as suas cores (o jogador pode trocar).
// Link de uma liga (#<liga>/<página>): abre essa liga, como escolhê-la no menu. Se não existir (ou for privada), avisa e fica a que estava.
let LINK_MAU = false;
{
  const m = location.hash.match(LINK_LIGA);
  if (m) {
    if (!DB.demo) await DB.uid().catch(() => {});
    const id = await ligaDoLink(m[1]).catch(() => undefined);
    if (id === undefined) LINK_MAU = true; else if (id !== ligaGuardada()) irParaLiga(id);
  }
}
{
  const lg = ligaGuardada();
  if (lg && !DB.demo) await DB.uid().catch(() => {});   // ler uma liga das novas (mesmo pública) pede sessão (anónima serve)
  if (lg === TODAS) { MODO_TODAS = true; NOME_LIGA = 'Todas as ligas'; try { localStorage.removeItem('meu-perfil'); } catch {} }
  else if (lg) { DB.usarLiga(lg); NOME_LIGA = (await DB.getLiga(lg).catch(() => null))?.nome || null; if (!NOME_LIGA) { DB.usarLiga(null); try { localStorage.removeItem('liga'); } catch {} } }
  if (!MODO_TODAS) { const cfg = await DB.getConfigLiga().catch(() => null); aplicarTema(temaEscolhido(DB.ligaAtual()) || cfg?.cor); if (cfg?.nome && DB.ligaAtual()) NOME_LIGA = cfg.nome; }
}
const NOME_MENU = NOME_LIGA || (MODO_TODAS ? 'Todas as ligas' : (await DB.getConfigLiga().catch(() => null))?.nome);
// Nome curto da liga aberta no endereço: #<liga>/<página>.
const LINK = MODO_TODAS ? 'todas' : slugLiga(NOME_MENU || 'Futebolada semanal');
const paginaDe = (hash) => { const m = hash.match(LINK_LIGA); return m ? '#' + m[2] : hash; };
montarSeletorLiga(NOME_MENU);   // título do menu = liga; lista para quem está em 2+
if (!DB.demo && !lsGet('meu-perfil')) await DB.minhaConta().then((c) => c && (lsSet('meu-perfil', c.player), lsSet('perfil-ok-' + c.player, '1'))).catch(() => {});
if (history.state?.n == null) history.replaceState({ n: 0 }, '');
let profundidade = history.state.n;
document.getElementById('voltar').onclick = () => { if (profundidade > 0) history.back(); else location.hash = paiDe(paginaDe(location.hash)); };
async function rota() {
  // Link de outra liga colado com a app aberta: muda para essa liga.
  const m = location.hash.match(LINK_LIGA);
  if (m && m[1] !== LINK) {
    const id = await ligaDoLink(m[1]).catch(() => undefined);
    if (id === undefined) LINK_MAU = true; else if (id !== ligaGuardada()) { irParaLiga(id); location.reload(); return; }
  }
  if (LINK_MAU) { LINK_MAU = false; toast('Essa liga não existe ou é privada — abriu a tua liga'); }
  const h = paginaDe(location.hash);
  history.replaceState(history.state, '', '#' + LINK + '/' + h.replace(/^#/, ''));
  const destino = NAV[h] || (h.startsWith('#jogador=') ? 'jogadores' : h.startsWith('#jogo=') ? 'jogos' : h.startsWith('#votar=') ? 'inicio' : null);
  document.querySelectorAll('#nav a[data-r]').forEach((a) => (a.dataset.r === destino ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.getElementById('voltar').hidden = PRINCIPAIS.includes(h);
  document.getElementById('lnk-def').classList.toggle('on', h === '#definicoes');
  $app.className = ['#votar', '#jogo', '#definicoes'].includes(h) || h.startsWith('#votar=') || h.startsWith('#c=') ? 'estreito' : '';
  document.body.classList.remove('modo-jogo');
  document.querySelectorAll('.folha-fundo').forEach((f) => f.remove());   // uma folha aberta não passa para a página seguinte
  // Esqueleto enquanto os dados chegam (páginas públicas), em vez de ficar a página anterior.
  if (['', '#', '#jogos', '#jogadores', '#cartas', '#tabela'].includes(h) || h.startsWith('#jogador=') || h.startsWith('#jogo=')) $app.innerHTML = esqueleto();
  pararAoVivo();
  confirmarModerador();
  VISITANTE = (await souVisitante().catch(() => false)) || (DB.demo && /[?&]visitante/.test(location.search));
  try {
    if (VISITANTE && (h === '#jogadores' || h === '#cartas' || h.startsWith('#jogador='))) {
      titulo('Jogadores'); $app.innerHTML = conviteEntrar('Os jogadores, as cartas e as conquistas só se veem com conta. Entra com o PIN ou com o Google.'); return;
    }
    if (h === '#jogo') { A.pubTab = 'mod'; titulo('🛡 Moderador'); $app.innerHTML = '<div id="pub"></div>'; return await paginaJogo(document.getElementById('pub')); }
    if (h === '#admin') return await paginaAdmin();
    if (h.startsWith('#c=')) return await paginaColab(h.slice(3));
    if (h === '#jogos') return await paginaJogos();
    if (h === '#jogadores' || h === '#cartas') return await paginaJogadores();
    if (h === '#tabela') return await paginaTabela();
    if (h === '#definicoes') return await paginaDefinicoes();
    if (h === '#ligas') return await paginaLigas($app, { esc, toast, titulo, htmlCarta });
    if (h === '#contas') return await paginaContas($app, { esc, toast, titulo });
    if (h.startsWith('#liga=') || h.startsWith('#entrar=')) { if (!(await abrirConvite(decodeURIComponent(h.split('=')[1])))) $app.innerHTML = vazio('🤷', 'Esta liga não existe (ou o link está errado).'); return; }
    // No modo "todas as ligas" só se vê: votar, o perfil e a administração são de uma liga.
    if (MODO_TODAS && (h === '#eu' || h === '#votar' || h.startsWith('#votar=') || h === '#admin' || h === '#jogo'))
      { titulo('Todas as ligas'); $app.innerHTML = vazio('🌍', 'Estás a ver todas as tuas ligas juntas. Para votar, ver o teu perfil ou administrar, abre uma liga.', '<a class="btn prim" href="#ligas">🏆 Escolher a liga</a>'); return; }
    if (h.startsWith('#jogador=')) return await paginaJogador(decodeURIComponent(h.slice(9)));
    if (h.startsWith('#jogo=')) return await paginaJogoPub(decodeURIComponent(h.slice(6)));
    if (h === '#eu' || h === '#votar' || h.startsWith('#votar=')) return await paginaEu(h === '#eu' ? 'eu' : 'votar', h.startsWith('#votar=') ? decodeURIComponent(h.slice(7)) : null);
    return await paginaInicio();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<p class="centro">Erro: ${esc(e.message)}</p>`;
  }
}
window.addEventListener('hashchange', () => {
  if (history.state?.n == null) history.replaceState({ n: profundidade + 1 }, '');
  profundidade = history.state.n;
  window.scrollTo(0, 0);
  rota();
});
rota();

// ---------- Reportar um problema (ticket) ----------
// Guarda os últimos erros da app para irem com o ticket (ajudam a perceber o que falhou).
const ERROS = [];
const guardarErro = (m) => { ERROS.push(`${new Date().toTimeString().slice(0, 8)} ${String(m).slice(0, 300)}`); if (ERROS.length > 12) ERROS.shift(); };
window.addEventListener('error', (e) => guardarErro(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => guardarErro(e.reason?.message || e.reason));
const erroOriginal = console.error.bind(console);
console.error = (...a) => { guardarErro(a.map((x) => x?.message || x).join(' ')); erroOriginal(...a); };

// Imagem do ecrã (opcional), reduzida para caber no ticket.
function printParaDataURL(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      let L = 900, q = 0.6, url;
      do {
        const k = Math.min(1, L / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        url = c.toDataURL('image/jpeg', q); L -= 150; q -= 0.05;
      } while (url.length > 240000 && L > 300);
      res(url);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

function abrirTicket() {
  if (document.getElementById('tk-modal')) return;
  const m = document.createElement('div');
  m.id = 'tk-modal'; m.className = 'modal';
  m.innerHTML = `<div class="modal-caixa"><h3 style="margin-top:0">🐞 Reportar um problema</h3>
    <p class="mute">Diz o que estavas a fazer e o que correu mal (ou uma ideia para melhorar). Vai direto para o Rui.</p>
    <textarea id="tk-texto" rows="5" maxlength="2000" placeholder="Ex.: carreguei em Guardar no perfil e deu erro…"></textarea>
    <label>Imagem do ecrã (opcional)</label><input type="file" id="tk-foto" accept="image/*">
    <div class="linha" style="margin-top:12px"><button class="prim" id="tk-enviar">Enviar</button><button id="tk-cancelar">Cancelar</button></div></div>`;
  document.body.appendChild(m);
  const fechar = () => m.remove();
  m.onclick = (e) => { if (e.target === m) fechar(); };
  document.getElementById('tk-cancelar').onclick = fechar;
  document.getElementById('tk-texto').focus();
  document.getElementById('tk-enviar').onclick = async (e) => {
    const texto = document.getElementById('tk-texto').value.trim();
    if (texto.length < 5) return toast('Escreve o que aconteceu');
    e.target.disabled = true;
    try {
      const f = document.getElementById('tk-foto').files[0];
      await DB.novoTicket({ texto, ecra: (location.hash || '#') + (A.pubTab && !paginaDe(location.hash).startsWith('#admin') ? ' · ' + A.pubTab : ''),
        quem: lsGet('meu-perfil') || null, ua: navigator.userAgent.slice(0, 250), erros: ERROS.join('\n').slice(-4000),
        foto: f ? await printParaDataURL(f) : '', ts: Date.now(), estado: 'aberto' });
      fechar(); toast('Enviado — obrigado! 👍');
    } catch (err) { erroOriginal(err); e.target.disabled = false; toast('Não deu para enviar — tenta outra vez'); }
  };
}
document.getElementById('ticket').onclick = abrirTicket;

// ---------- App instalável (PWA) ----------
// Android/Chrome/Edge: botão "Instalar app" quando o browser deixa. iPhone: o Safari não tem botão — explica-se o caminho.
// App instalável: o service worker só existe no site real (na cópia de demonstração não há sw.js).
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !DB.demo) navigator.serviceWorker.register('sw.js').catch((e) => console.error(e));
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const $inst = document.getElementById('instalar');
let pedidoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; $inst.hidden = false; });
window.addEventListener('appinstalled', () => { $inst.hidden = true; toast('App instalada ✔'); });
const iPhone = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (iPhone && !instalada()) $inst.hidden = false;
$inst.onclick = async () => {
  if (pedidoInstalar) { pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; $inst.hidden = true; return; }
  alert('Para instalar no iPhone:\n1. Abre este link no Safari\n2. Toca em Partilhar (o quadrado com a seta ↑)\n3. "Adicionar ao ecrã principal"');
};
