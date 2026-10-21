import { DB, novoToken, novoPin } from './db.js?v=30';
import { AREAS, NIVEIS, POSICOES, calcularCartas, gerarEquipas, tier, notaDe, calcularElo, aplicarForma, ajusteElo, ELO, contarConvivio, pontosConvivio, pesoVoto, placarDe, vencedorDe, marcaDe } from './ranking.js?v=29';
import { paginaMarcador, hojeLocal } from './marcador.js?v=23';
import { lerFicheiro, zonas, ZONAS, fcMaxIdade, mediasTreinos, idadeDe } from './treinos.js?v=26';

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

// Página inicial (link geral): equipas, estatísticas, resultados e — quando aberta — a votação.
async function paginaInicio() {
  document.getElementById('titulo').textContent = 'Futebolada';
  const estado = (await DB.getPublic('estado')) || {};
  const tabs = [['eu', '👤 Eu'], ['eq', 'Equipas'], ['stats', 'Estatísticas'], ['jogos', 'Resultados'], ...(estado.votacaoAberta ? [['votar', '🗳 Votar']] : [])];
  A.pubTab ||= estado.votacaoAberta ? 'votar' : 'eq';
  if (!tabs.some(([k]) => k === A.pubTab)) A.pubTab = 'eq';
  $app.innerHTML = `<div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" aria-selected="${A.pubTab === k}" data-pt="${k}" class="${A.pubTab === k ? 'on' : ''}">${n}</button>`).join('')}</div><div id="pub"></div>`;
  $app.querySelectorAll('[data-pt]').forEach((b) => (b.onclick = () => { A.pubTab = b.dataset.pt; paginaInicio(); }));
  tabAtivoVisivel();
  const el = document.getElementById('pub');
  if (A.pubTab === 'votar' || A.pubTab === 'eu') return paginaVotar(el);
  const [players, perfis, jogosPub, games] = await Promise.all([DB.listPlayers(), DB.listPerfis(), DB.listJogosPub(), DB.listGames()]);
  const todos = juntarPerfis(players, perfis);
  const res = jogosPub.map((r) => ({ id: r.id, jogo: JSON.parse(r.json || '{}') })).filter((r) => r.jogo.fase === 'fim')
    .sort((a, b) => b.jogo.inicioEpoch - a.jogo.inicioEpoch);
  if (A.pubTab === 'stats') return tabelaStats(el, res, todos, 'pts', null, 'publico');
  if (A.pubTab === 'jogos') return listaResultados(el, res);
  // Equipas: as mais recentes (próximo jogo) e, se já houver resultado, o marcador.
  const ult = [...games].sort((a, b) => (b.criado || 0) - (a.criado || 0)).slice(0, 2);
  const nm = (g, id) => esc(nomeDe(todos.find((p) => p.id === id) || { nome: g.nomes?.[id] || '?' }));
  const vivo = await DB.getAoVivo().catch(() => null);
  const aoVivo = vivo?.fase === 'jogo' && vivo.live ? JSON.parse(vivo.live) : null;
  const aberto = vivo && vivo.fase === 'aberto' && !vivo.gameId
    ? `<div class="opcao"><b>⚽ Jogo de ${esc(diaPT(vivo.data))}</b><p class="mute" style="margin:4px 0 0">Aberto por ${esc(vivo.por?.nome || '?')} — as equipas estão a ser feitas.</p></div>` : '';
  el.innerHTML = aberto + (ult.length ? ult.map((g, i) => {
    const r = res.find((x) => x.jogo.gameId === g.id);
    const vv = !r && aoVivo?.gameId === g.id ? aoVivo : null;
    const gol = (e) => r ? marcaDe(r.jogo, e) : vv ? vv.eventos.filter((x) => x.equipa === e).length : '';
    return `<div class="opcao"><b>${vv ? '<span class="ao-vivo"></span>Ao vivo' : i === 0 && !r ? 'Próximo jogo' : 'Jogo'} · ${esc(r ? dataDe(r.jogo) : diaPT(g.data))}</b>
      <div class="equipas"><div class="eq branco"><h4>${LOGO.B} Brancos ${gol('B')}</h4>${(g.brancos || []).map((id) => nm(g, id)).join('<br>')}</div>
        <div class="eq preto"><h4>${LOGO.P} Pretos ${gol('P')}</h4>${(g.pretos || []).map((id) => nm(g, id)).join('<br>')}</div></div></div>`;
  }).join('') : '<div class="opcao"><b>Ainda não há equipas feitas.</b><p class="mute" style="margin:4px 0 0">Aparecem aqui quando o Rui ou um moderador as fizer, antes do jogo.</p></div>');
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

// Marcador grande ao centro (⚪ Brancos 4 – 10 Pretos ⚫); o vencedor em destaque.
function htmlPlacar(j) {
  const v = vencedorDe(j), c = (e) => (v === e ? 'ganha' : '');
  const n = (e) => `<span class="${v !== 'E' && v !== e ? 'perde' : ''}">${marcaDe(j, e)}</span>`;
  // Jogo fechado sem golos registados: só se sabe quem ganhou.
  const meio = j.semGolos ? `<small class="mute">${v === 'E' ? 'empate' : 'sem golos registados'}</small>` : `${n('B')} – ${n('P')}`;
  return `<div class="placar"><span class="lado ${c('B')}">${LOGO.B} Brancos</span><span class="golos">${meio}</span><span class="lado ${c('P')}">Pretos ${LOGO.P}</span></div>`;
}
function listaResultados(el, res) {
  el.innerHTML = res.length ? res.map(({ jogo: j }) => {
    const v = vencedorDe(j), nGol = (j.eventos || []).length;
    const ev = linhasEventos(j);
    return `<div class="opcao resultado"><b>${esc(dataDe(j))}</b>${htmlPlacar(j)}
      <div class="equipas"><div class="eq branco ${v === 'B' ? 'ganha' : ''}">${(j.brancos || []).map((p) => esc(p.nome)).join('<br>')}</div>
        <div class="eq preto ${v === 'P' ? 'ganha' : ''}">${(j.pretos || []).map((p) => esc(p.nome)).join('<br>')}</div></div>
      ${ev.trim() ? `<details><summary>⚽ Golos minuto a minuto${nGol ? ` (${nGol})` : ''}</summary>${ev}</details>` : ''}</div>`;
  }).join('') : '<p class="mute">Ainda não há jogos registados.</p>';
}

async function paginaVotar(el) {
  const $app = el;
  const [players, perfis] = await Promise.all([DB.listPlayers(), DB.listPerfis()]);
  const todos = juntarPerfis(players, perfis).filter((p) => p.ativo !== false && !p.convidado);
  const eu = todos.find((p) => p.id === lsGet('meu-perfil'));
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
    <div class="chips">${lista.map((p) => `<button class="chip" data-id="${p.id}">${foto(p)}${esc(p.nome)}</button>`).join('')}</div>
    <p class="mute" style="margin-top:14px">O teu nome não aparece? Fala com o Rui.</p>`;
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

function editarPerfil(eu, todos) {
  const $app = document.getElementById('pub') || document.getElementById('app');
  let novaFoto = null;
  $app.innerHTML = `<h2>O teu perfil</h2>
    <div class="alvo"><span id="pf-foto">${foto(eu)}</span><div><div class="nome">${esc(nomeDe(eu))}</div><div class="mute">${esc(eu.nome)}</div></div></div>
    <label>Como queres ser tratado? (opcional)</label><input id="pf-alias" maxlength="20" placeholder="${esc(eu.nome)}" value="${esc(eu.alias || '')}">
    <label>Foto melhor do que a do WhatsApp? (opcional)</label><input id="pf-file" type="file" accept="image/*">
    <button id="pf-semfoto" class="peq" style="margin-top:8px">🗑 Apagar a minha foto (fica só a inicial)</button>
    <button class="prim" id="pf-ok" style="width:100%;margin-top:16px">Guardar e continuar</button>
    <p class="mute" style="margin-top:12px;font-size:12px">Privacidade: guardamos o teu nome, a foto (se quiseres) e as notas que dás e recebes.
      As notas que dás só o organizador as vê. Para apagares tudo, pede ao organizador do grupo.</p>
    <details style="margin-top:12px"><summary>🔑 Mudar o meu PIN</summary>
      <p class="mute" style="font-size:12px">Escolhe 4 algarismos que fixes. Não uses o PIN do multibanco. Nem o Rui fica a saber o teu PIN novo.</p>
      <div class="linha"><input id="pf-pin1" inputmode="numeric" maxlength="4" placeholder="novo PIN" style="max-width:120px">
        <input id="pf-pin2" inputmode="numeric" maxlength="4" placeholder="repetir" style="max-width:120px">
        <button class="peq" id="pf-pin-ok">Mudar PIN</button></div></details>
    <button id="pf-trocar" style="width:100%;margin-top:10px">← Não sou eu / escolher outro perfil</button>`;
  document.getElementById('pf-trocar').onclick = async () => { lsDel('meu-perfil'); await DB.desligar(); escolherPerfil(todos); };
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
    seguir(eu, todos);
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
}

// Formulário de um treino: ficheiro do relógio (preenche tudo) ou à mão, mais o pré/pós jogo.
function formTreino(eu, saude, treinos, meus, jogoId, depois, existente = null) {
  const el = document.getElementById('eu-form');
  const t = existente || treinos.find((x) => jogoId && x.jogoId === jogoId) || {};
  let fc = t.fc || [], origem = t.origem || 'manual', inicio = t.inicio || null;
  const dataJogo = (r) => dataDe(r.jogo);
  const jSel = jogoId || t.jogoId || '';
  el.innerHTML = `<div class="opcao form-treino"><b>⌚ Treino do relógio</b>
    <label>Ficheiro do relógio (.FIT, .TCX ou .GPX)</label><input type="file" id="tr-fich" accept=".fit,.tcx,.gpx">
    <details class="mute" style="font-size:12px"><summary>Como tiro o ficheiro do meu relógio?</summary>
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
  g('tr-fich').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
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

// Perfil do jogador (com PIN): a sua carta com setas do último mês, a evolução, os seus jogos e as estatísticas.
// Nunca mostra quem votou nem as notas de cada um — só a carta final, calculada pelo admin.
async function perfilEu(eu, todos) {
  const $app = document.getElementById('pub') || document.getElementById('app');
  $app.innerHTML = '<p class="mute">A carregar…</p>';
  const [estado, mc, jogosPub, saude, treinos] = await Promise.all([DB.getPublic('estado'), DB.getMinhaCarta(eu.id).catch(() => null), DB.listJogosPub(),
    DB.getSaude(eu.id).catch(() => null), DB.listTreinos(eu.id).catch(() => [])]);
  const res = jogosPub.map((r) => ({ id: r.id, jogo: JSON.parse(r.json || '{}') })).filter((r) => r.jogo.fase === 'fim');
  const meus = res.filter((r) => [...(r.jogo.brancos || []), ...(r.jogo.pretos || [])].some((x) => x.id === eu.id))
    .sort((a, b) => (b.jogo.inicioEpoch || 0) - (a.jogo.inicioEpoch || 0));
  const d = mc?.ref || null;   // carta antes do último jogo: { ov, st, data }
  // Pedido para atualizar notas (só faz sentido com a votação aberta).
  let pedido = '';
  if (estado?.votacaoAberta) {
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
  if (!estado?.cartasPessoais) carta = `<div class="eu-carta">${htmlCarta(eu, { ficticia: true, overall: 0, stats: Object.fromEntries(AREAS.map((a) => [a.k, 0])) })}</div>
    <p class="mute" style="text-align:center">Carta fictícia — os valores reais aparecem quando o Rui mostrar as cartas.</p>`;
  else if (!mc?.carta) carta = '<div class="opcao"><b>A tua carta</b><p class="mute">Ainda não há carta para ti (faltam votos).</p></div>';
  else carta = `<div class="eu-carta">${htmlCarta(eu, mc.carta, d)}</div>
    ${htmlMudanca(mc)}
    <p class="mute" style="text-align:center">${mc.carta.conhecem ? `Conhecem-te ${mc.carta.conhecem} jogadores.` : ''}</p>`;
  carta += htmlElo(mc?.elo, !!estado?.usarElo);
  if (estado?.cartasPessoais && mc?.carta) carta += `<h3>Evolução</h3>${graficoEvolucao(mc.hist || [])}`;
  $app.innerHTML = `<div class="linha mute" style="justify-content:space-between"><span>Olá, ${esc(nomeDe(eu))}</span>
      <span><a href="#" id="eu-perfil" style="color:inherit">editar perfil / PIN</a>${estado?.votacaoAberta ? ' · <a href="#" id="eu-votar" style="color:inherit">votar</a>' : ''}</span></div>
    ${eu.moderador ? `<a class="btn prim" href="#jogo" style="display:block;text-align:center;padding:14px;margin-bottom:12px;font-size:17px">🛡 Moderador · ⚽ Jogo de hoje</a>` : ''}
    ${pedido}${carta}
    <h3>Os teus jogos (${meus.length})</h3>
    ${meus.length ? meus.map((r, i) => resumoJogo(r.jogo, eu.id, i === 0, extraTreino(r.id, treinos, saude, false))).join('') : '<p class="mute">Ainda não tens jogos registados.</p>'}
    <h3>As tuas estatísticas</h3><div id="eu-stats"></div>
    <h3>🩺 Dados físicos e relógio</h3><div id="eu-form"></div>${blocoFisico(saude, treinos, meus, false)}`;
  ligarFisico(eu, todos, saude, treinos, meus);
  minhasStats(document.getElementById('eu-stats'), res, eu.id);
  document.getElementById('eu-perfil').onclick = (e) => { e.preventDefault(); editarPerfil(eu, todos); };
  document.getElementById('eu-votar')?.addEventListener('click', (e) => { e.preventDefault(); A.pubTab = 'votar'; paginaInicio(); });
  document.getElementById('eu-pedido')?.addEventListener('click', () => { A.pubTab = 'votar'; paginaInicio(); });
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
  // Os que ainda não têm nota minha (jogadores novos) vêm primeiro; depois por jogos juntos.
  const novos = new Set(porVotar(eu.id, r, todos).map((p) => p.id));
  const alvos = todos.filter((p) => p.id !== eu.id)
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
    try { await DB.saveVote(eu.id, p.id, { ...parcial, t: r[p.id].t }); }
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
      return `<div class="vrow" data-id="${p.id}"><div class="vtop">${cab}<button class="peq nc">Não conheço</button></div>
        <div class="lbl mute">${a.nome}</div>${botoes(p, a.k)}</div>`;
    }
    return `<div class="vrow aberto" data-id="${p.id}">
      <div class="vtop">${cab}${rr.skip ? '<button class="peq nc">Afinal conheço</button>' : '<button class="peq nc">Não conheço</button>'}</div>
      ${rr.skip ? '' : AREAS.map((a) => `<div class="area"><div class="lbl"><span>${a.nome}</span></div>${botoes(p, a.k)}</div>`).join('')}
      <button class="prim ok" style="width:100%;margin-top:6px">${rr.skip ? 'Fechar' : 'OK ✔'}</button></div>`;
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
          <span>Olá, ${esc(nomeDe(eu))} · <a href="#" id="perfil" style="color:inherit">perfil</a></span></div>
        <div class="prog"><i id="v-prog"></i></div>
        <div class="atabs"><button class="${filtro === 'todos' ? 'on' : ''}" data-f="todos">Todos</button>
          ${AREAS.map((a) => `<button class="${filtro === a.k ? 'on' : ''}" data-f="${a.k}">${a.nome}</button>`).join('')}</div>
      </div>
      <p class="mute">${filtro === 'todos' ? 'Dá as notas e carrega em OK. "Não conheço" esconde o jogador. A seta ▾ volta a abrir.' : 'Só esta área — sobe e desce para comparar.'} Grava sozinho.</p>
      <div id="lista">${alvos.map(cartao).join('')}</div>
      <button class="prim" id="fim" style="width:100%;margin-top:10px">Terminar</button>`;
    atualizarTopo();
    document.getElementById('perfil').onclick = (e) => { e.preventDefault(); editarPerfil(eu, todos); };
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
    <div class="st">${AREAS.map((a) => `<span><b>${st[a.k] != null ? Math.round(st[a.k] * 10) : '–'}</b> ${a.ab}${d ? seta(st[a.k] != null ? Math.round(st[a.k] * 10) : null, d.st?.[a.k]) : ''}</span>`).join('')}</div>
  </div>`;
}

async function paginaCartas() {
  const pub = await DB.getPublic('cartas');
  if (!pub?.visivel) return paginaInicio();
  document.getElementById('titulo').textContent = 'Cartas';
  const lista = [...pub.cartas].sort((a, b) => (b.c.overall ?? 0) - (a.c.overall ?? 0));
  $app.innerHTML = `<h2>Cartas dos jogadores</h2><div class="cartas">${lista.map((x) => htmlCarta(x.p, x.c)).join('')}</div>`;
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
  await recarregar();
  A.usarElo ??= !!(await DB.getPublic('estado'))?.usarElo;
  renderAdmin();
  publicarRetrato().catch((e) => console.error(e));
  publicarCartasPessoais().catch((e) => console.error(e));
}
async function recarregar() {
  let perfis;
  let jogos;
  [A.players, perfis, A.votes, A.games, jogos] = await Promise.all([DB.listPlayers(), DB.listPerfis(), DB.listVotes(), DB.listGames(), DB.listJogosPub()]);
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
  const conv = K ? (await DB.listPart(K, 'convidados')).map((c) => ({ ...c, convidado: true, ativo: c.ativo !== false })) : [];
  const players = [...A.players, ...conv];
  return {
    players, cartas: calcularCartas(players.filter((p) => p.ativo !== false), A.votes, A.conv), games: A.games,
    elo: calcularElo((await DB.listResultados()).map((r) => JSON.parse(r.json || '{}').jogo), calcularCartas(players.filter((p) => p.ativo !== false), A.votes, A.conv)),
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
  const ativos = A.players.filter((p) => p.ativo !== false && !p.convidado);
  const cartas = calcularCartas(A.players.filter((p) => p.ativo !== false), A.votes, A.conv);
  const antes = Object.fromEntries((await DB.listMinhasCartas()).map((x) => [x.id, x]));
  const mes = new Date().toISOString().slice(0, 7);
  const elo = calcularElo((await DB.listResultados()).map((r) => { try { return JSON.parse(r.json || '{}').jogo; } catch { return null; } }).filter(Boolean), cartas);
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
    const novo = { carta, hist, ref, mudanca, elo: e ? { forma: Math.round(e.forma), jogos: e.jogos, ultimo: Math.round(e.ultimo), ajuste: Math.round(aj * 10) / 10, pct: Math.round((aj / c.overall) * 1000) / 10 } : null };
    const { id: _, ts: __, ...velho } = antes[p.id] || {};
    if (JSON.stringify(velho) === JSON.stringify(novo)) continue;   // nada mudou: não gasta escritas
    await DB.setMinhaCarta(p.id, { ...novo, ts: Date.now() });
  }
}

// Atualiza o "retrato" que o link de colaborador lê (notas finais, sem votos individuais).
async function publicarRetrato() {
  const K = (await DB.getSegredo('partilha'))?.chave;
  if (!K) return;
  // Os moderadores (com PIN) leem a chave em moderacao/chave para fazer equipas e marcar sem o link.
  if ((await DB.getModeracao('chave').catch(() => null))?.chave !== K) await DB.setModeracao('chave', { chave: K });
  const ativos = A.players.filter((p) => p.ativo !== false);
  const cartas = calcularCartas(ativos, A.votes, A.conv);
  await DB.setPart(K, 'dados', 'retrato', { ts: Date.now(), jogadores: ativos.map((p) => ({
    id: p.id, nome: p.nome, alias: p.alias || '', foto: p.fotoPropria || p.foto || '', convidado: !!p.convidado,
    notaConvidado: p.notaConvidado || null, nota100: p.nota100 ?? null, overall: cartas[p.id]?.overall ?? null, stats: cartas[p.id]?.stats || {},
  })) });
}

function renderAdmin() {
  const tabs = [['jog', 'Jogadores'], ['vot', 'Votação'], ['cartas', 'Cartas'], ['equipas', 'Equipas'], ['jogos', 'Jogos'], ['stats', 'Estatísticas'], ['saude', 'Saúde'], ['tickets', '🐞 Tickets'], ['part', 'Partilhar']];
  $app.innerHTML = `<div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" aria-selected="${A.tab === k}" data-t="${k}" class="${A.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div><div id="sec"></div>`;
  $app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { A.tab = b.dataset.t; renderAdmin(); }));
  tabAtivoVisivel();
  const sec = document.getElementById('sec');
  if (A.tab === 'equipas') { sec.innerHTML = '<p class="mute">A carregar…</p>'; ctxAdmin().then((X) => { A.ctxEq = X; secEquipas(sec, X); }); return; }
  ({ jog: secJogadores, vot: secVotacao, cartas: secCartas, jogos: secJogos, stats: secEstatisticas, saude: secSaude, tickets: secTickets, part: secPartilhar })[A.tab](sec);
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

async function secEstatisticas(el) {
  const res = (await DB.listResultados()).map((r) => JSON.parse(r.json || '{}'));
  el.innerHTML = '<div id="st-t"></div><div id="st-elo"></div>';
  tabelaStats(document.getElementById('st-t'), res, A.players);
  const cartas = calcularCartas(A.players.filter((p) => p.ativo !== false), A.votes, A.conv);
  const L = Object.values(calcularElo(res.map((r) => r.jogo), cartas)).sort((a, b) => b.elo - a.elo);
  if (!L.length) return;
  document.getElementById('st-elo').innerHTML = `<h3>Elo / forma <span class="mute">(só tu vês)</span></h3>
    <p class="mute">Parte da carta (overall 60 = 1000; 10 pontos de carta = 100 de Elo). "Forma" = quanto os jogos mexeram: ganhar contra o previsto sobe, perder desce.
      Nas Equipas há a opção "Ajustar pela forma": soma a forma ÷ 10 ao overall, no máximo ±10 % da carta.</p>
    <div style="overflow-x:auto"><table><tr><th>Jogador</th><th>Elo</th><th>Forma</th><th>J</th><th>Último</th></tr>
    ${L.map((x) => `<tr><td>${esc(nomeDe(A.players.find((p) => p.id === x.id) || { nome: x.nome }))}</td><td>${x.elo}</td><td>${x.forma > 0 ? '+' : ''}${Math.round(x.forma)}</td><td>${x.jogos}</td><td>${x.ultimo > 0 ? '▲' : x.ultimo < 0 ? '▼' : '='}</td></tr>`).join('')}</table></div>`;
}

// Médias e totais de cada jogador a partir das estatísticas dos jogos.
const comMedias = (s) => ({ ...s, pts: s.v * 3 + s.e, pv: s.j ? s.v / s.j : 0, gj: s.jReg ? s.g / s.jReg : null, grJ: s.jGR ? s.grMs / s.jGR : null,
  sofr10: s.grMs ? s.sofr / (s.grMs / 600000) : null });
const fmtStat = (k, v, s) => k === 'pen' ? (s.penT ? `${v}/${s.penT}` : '–') : v == null ? '–' : k === 'pv' ? Math.round(v * 100) + '%' : k === 'gj' || k === 'sofr10' ? v.toFixed(1).replace('.', ',') : k === 'grJ' ? Math.round(v / 60000) : v;
const COLS_STATS = [['j', 'J'], ['v', 'V'], ['e', 'E'], ['d', 'D'], ['pts', 'Pts'], ['pv', '%V'], ['g', 'Golos'], ['gj', 'G/J'], ['a', 'Assist.'], ['pd', 'Pé D'], ['pe', 'Pé E'], ['cab', 'Cab.'], ['pen', 'Pen.'], ['ag', 'AG'], ['grJ', 'Min GR/J'], ['sofr10', 'Sofr./10min'], ['penDef', 'Pen. def.']];

// Só as estatísticas do próprio (perfil 👤 Eu) — é o único sítio, além do admin, onde aparece o pé.
function minhasStats(el, res, id) {
  const s = estatisticas(res).find((x) => x.id === id);
  if (!s) { el.innerHTML = '<p class="mute">Ainda não tens jogos registados.</p>'; return; }
  const m = comMedias(s);
  // As principais em grande; o resto em mosaicos pequenos.
  const TOP = ['j', 'pts', 'pv', 'g', 'a', 'gj'];
  el.innerHTML = `<div class="destaques">${TOP.map((k) => `<span><b>${fmtStat(k, m[k], m)}</b>${COLS_STATS.find(([c]) => c === k)[1]}</span>`).join('')}</div>
    <div class="fgrid medias">${COLS_STATS.filter(([k]) => !TOP.includes(k)).map(([k, n]) => `<span>${n} <b>${fmtStat(k, m[k], m)}</b></span>`).join('')}</div>
    <p class="mute" style="font-size:12px">G/J só conta jogos com golos registados; Min GR/J e Sofr./10min só jogos com as trocas de GR registadas.</p>`;
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
  const val = (s) => (ord === 'nome' ? null : s[ord]);
  L.sort((x, y) => {
    if (ord === 'nome') return (cresce ? 1 : -1) * nomeAtual(x).localeCompare(nomeAtual(y), 'pt');
    const a = val(x), b = val(y);
    if (a == null || b == null) return (a == null) - (b == null);
    return (cresce ? a - b : b - a) || y.pv - x.pv || y.g - x.g || nomeAtual(x).localeCompare(nomeAtual(y), 'pt');
  });
  const fmt = fmtStat;
  const jogos = res.filter((r) => r.jogo?.fase === 'fim').length;
  el.innerHTML = `<p class="mute">${jogos} jogos registados. Toca num cabeçalho (ou usa "Ordenar por") para ordenar; tocar outra vez inverte.<br><small>G/J só conta jogos com golos registados; Min GR/J e Sofr./10min só jogos com as trocas de GR registadas.</small></p>
    <div class="linha" style="margin-bottom:8px"><label style="margin:0">Ordenar por <select id="st-ord" style="width:auto">${cols.map(([k, n]) => `<option value="${k}" ${k === ord ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="peq" id="st-inv" title="Inverter a ordem">${cresce ? '▲ menor primeiro' : '▼ maior primeiro'}</button>
      ${modo === 'publico' ? `<button class="peq" id="st-mais">${A.statsMais ? '▾ Menos informações' : '▸ Mais informações'}</button>` : ''}</div>
    <div style="overflow-x:auto"><table class="tstats"><tr>${cols.map(([k, n]) => `<th data-o="${k}" style="cursor:pointer;${k === ord ? 'color:var(--verde)' : ''}">${n}${k === ord ? (cresce ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>
    ${L.map((s) => `<tr${s.id === destaque ? ' class="eu"' : ''}>${cols.map(([k]) => `<td>${k === 'nome' ? esc(nomeAtual(s)) : fmt(k, s[k], s)}</td>`).join('')}</tr>`).join('')}</table></div>`;
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

async function secJogos(el) {
  const res = (await DB.listResultados()).map((r) => ({ id: r.id, ...JSON.parse(r.json || '{}') })).sort((a, b) => (b.jogo?.inicioEpoch || 0) - (a.jogo?.inicioEpoch || 0));
  const P = { ...PERFIL0, ...((await DB.getSegredo('perfil')) || {}) };
  const eu = P.eu || A.players.find((p) => p.nome === 'Bessa')?.id || '';
  el.innerHTML = `
    <div class="opcao"><div class="linha">
      <span class="mute">Perfil: ${P.idade} anos · ${P.altura} cm · ${P.peso} kg</span>
      <label style="margin:0" title="Frequência cardíaca máxima (batimentos por minuto). Estimada: 208 − 0,7 × idade.">❤ FC máx.</label><input id="fcmax" type="number" value="${P.fcMax}" style="width:80px">
      <label style="margin:0" title="Batimentos em repouso, de manhã ao acordar (o relógio mostra).">FC repouso</label><input id="fcrep" type="number" value="${P.fcRep}" style="width:80px">
      <label style="margin:0">Eu sou</label><select id="eu" style="width:auto"><option value="">—</option>${A.players.map((p) => `<option value="${p.id}" ${p.id === eu ? 'selected' : ''}>${esc(nomeDe(p))}</option>`).join('')}</select>
    </div>
    <details style="margin-top:8px"><summary class="mute">Chave do relógio</summary>
      <div class="linha" style="margin-top:6px"><input id="chave" placeholder="cola a chave do relógio"><button id="gchave" class="peq">Guardar</button></div></details></div>
    <p class="mute">Cada cartão é um jogo enviado pelo relógio ou pelo marcador do telemóvel: resultado, golos (com quem estava na baliza a sofrer), tempo de cada um na baliza e o teu esforço físico (batimentos, zonas, km). As contas por jogador estão em Estatísticas.</p>
    ${res.length ? '' : '<p class="mute">Ainda não chegou nenhum jogo do relógio.</p>'}
    ${res.map((r) => {
      const j = r.jogo, f = r.fit || {};
      const nome = (id) => [...(j.brancos || []), ...(j.pretos || [])].find((x) => x.id === id)?.nome || '?';
      const golos = (e) => marcaDe(j, e);
      const gr = {};
      for (const t of j.turnos || []) gr[t.jogador] = (gr[t.jogador] || 0) + (t.ate - t.de);
      const sofridos = {};
      for (const ev of j.eventos) { const q = grSofreu(j, ev); if (q) sofridos[q] = (sofridos[q] || 0) + 1; }
      return `<div class="opcao">
        <div class="linha" style="justify-content:space-between"><span><b>${esc(dataDe(j))}</b> · ${mmss(j.fimEpoch - j.inicioEpoch - (j.pausaTotal || 0))} de jogo${f.tipo ? ` · <span class="mute">${esc(f.tipo)}</span>` : ''}</span>
          <button class="peq perigo" data-del="${r.id}">Apagar</button></div>
        <div class="equipas"><div class="eq branco"><h4>${LOGO.B} ${golos('B')}</h4>${(j.brancos || []).map((p) => esc(p.nome)).join('<br>')}</div>
          <div class="eq preto"><h4>${LOGO.P} ${golos('P')}</h4>${(j.pretos || []).map((p) => esc(p.nome)).join('<br>')}</div></div>
        <table><tr><th>Min</th><th>Golo</th><th>Assist.</th><th>GR sofreu</th></tr>${j.eventos.map((ev) => `<tr><td>${mmss(ev.t)}</td><td>${ev.equipa === 'B' ? '⚪' : '⚫'} ${esc(nome(ev.marcador))}${ev.tipo === 'autogolo' ? ' (AG)' : ''}${ev.parte ? ` <small class="mute">${PARTE[ev.parte]}</small>` : ''}</td><td>${esc(ev.assist ? nome(ev.assist) : '')}</td><td>${esc(grSofreu(j, ev) ? nome(grSofreu(j, ev)) : '')}</td></tr>`).join('')}</table>
        <h3>Baliza</h3><table><tr><th>Jogador</th><th>Tempo</th><th>Sofridos</th></tr>${Object.entries(gr).map(([id, ms]) => `<tr><td>${esc(nome(id))}</td><td>${mmss(ms)}</td><td>${sofridos[id] || 0}</td></tr>`).join('')}</table>
        ${htmlSaude(j, f, P, eu)}
      </div>`;
    }).join('')}`;
  // ---- Jogos em aberto: equipas escolhidas sem resultado. Fechar = entra nas estatísticas, Elo e peso dos votos.
  const fechados = new Set(res.map((r) => r.jogo?.gameId).filter(Boolean));
  const abertos = [...A.games].filter((g) => !fechados.has(g.id)).sort((a, b) => (b.criado || 0) - (a.criado || 0));
  const nmG = (g, id) => esc(g.nomes?.[id] || nomeDe(A.players.find((p) => p.id === id) || { nome: '?' }));
  el.insertAdjacentHTML('afterbegin', `<h3 style="margin-top:0">Jogos em aberto (${abertos.length})</h3>
    ${abertos.length ? '' : '<p class="mute">Nenhum. Quando se escolhem equipas, o jogo fica aqui até ser marcado no relógio/telemóvel ou fechado à mão.</p>'}
    ${abertos.map((g) => `<div class="opcao" data-aberto="${g.id}">
      <div class="linha" style="justify-content:space-between"><b>${esc(g.data || '')}</b><span class="tag">em aberto</span></div>
      <div class="equipas"><div class="eq branco"><h4>${LOGO.B} Brancos</h4>${(g.brancos || []).map((id) => nmG(g, id)).join('<br>')}</div>
        <div class="eq preto"><h4>${LOGO.P} Pretos</h4>${(g.pretos || []).map((id) => nmG(g, id)).join('<br>')}</div></div>
      <label>Dia em que se jogou</label><input type="date" class="pD" value="${esc(g.data || hojeLocal())}" style="width:auto">
      <label>Resultado (opcional — deixa vazio se ninguém contou os golos)</label>
      <div class="linha"><input type="number" min="0" class="pB" placeholder="⚪" style="width:70px"> – <input type="number" min="0" class="pP" placeholder="⚫" style="width:70px"></div>
      <div class="linha" style="margin-top:8px">
        <button class="prim peq" data-fechar="B">Fechar: ganhou ⚪</button>
        <button class="peq" data-fechar="E">Fechar: empate</button>
        <button class="prim peq" data-fechar="P">Fechar: ganhou ⚫</button>
        <button class="peq perigo" data-apagar-g>Apagar (não se jogou)</button></div></div>`).join('')}
    <h3>Jogos fechados</h3>`);
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
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Apagar este jogo? Sai também das estatísticas.')) return;
    await DB.deleteResultado(b.dataset.del); await DB.deleteJogoPub(b.dataset.del).catch(() => {}); secJogos(el);
  }));
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
function secJogadores(el, edit = null) {
  const p = edit || {};
  el.innerHTML = `
    <div class="opcao">
      <h3 style="margin-top:0">${edit ? 'Editar' : 'Novo'} jogador</h3>
      <label>Nome</label><input id="f-nome" value="${esc(p.nome)}">
      <label>Alcunha (como aparece)</label><input id="f-alc" value="${esc(p.alcunha)}">
      <label>Foto (guarda a do WhatsApp e escolhe-a aqui)</label><input id="f-foto" type="file" accept="image/*">
      <div class="linha" style="margin-top:10px"><label style="margin:0"><input type="checkbox" id="f-conv" ${p.convidado ? 'checked' : ''} style="width:auto"> Convidado (não vota nem é votado)</label></div>
      <label>Nível estimado (convidados ou quem tiver poucos votos)</label>
      <select id="f-nivel"><option value="">—</option>${NIVEIS.map((n) => `<option value="${n.v}" ${Number(p.nivel) === n.v ? 'selected' : ''}>${n.nome}</option>`).join('')}</select>
      <div class="linha" style="margin-top:12px">
        <button class="prim" id="f-gravar">${edit ? 'Guardar' : 'Adicionar'}</button>
        ${edit ? `<button id="f-cancel">Cancelar</button><label style="margin:0"><input type="checkbox" id="f-ativo" ${p.ativo !== false ? 'checked' : ''} style="width:auto"> Ativo</label>` : ''}
      </div>
    </div>
    ${DB.demo ? '<div class="linha"><button id="demo-seed" class="peq">🧪 Criar 14 jogadores + votos de teste</button><button id="demo-jogos" class="peq">🧪 Simular 10 jogos</button><button id="demo-reset" class="peq perigo">Apagar demo</button></div>' : ''}
    <div class="linha" style="margin-top:8px"><label style="margin:0">Importar ficheiro (jogadores-iniciais.json)</label><input id="imp" type="file" accept=".json" style="width:auto"></div>
    <h3>${A.players.length} jogadores</h3>
    ${A.players.map((x) => `<div class="jog">${foto(x)}<div class="info"><b>${esc(nomeDe(x))}</b><small>${esc(x.alcunha ? x.nome : '')}
      ${x.convidado ? '<span class="tag">convidado</span>' : ''}${x.ativo === false ? '<span class="tag">inativo</span>' : ''}${x.nivel ? `<span class="tag">${NIVEIS.find((n) => n.v === Number(x.nivel))?.nome}</span>` : ''}${x.moderador ? '<span class="tag">🛡 moderador</span>' : ''}</small></div>
      ${x.convidado ? '' : `<button class="peq ${x.moderador ? 'on' : ''}" data-mod="${x.id}" title="Moderador: faz equipas, abre a votação e marca o jogo">🛡</button>`}
      <button class="peq" data-ed="${x.id}">Editar</button></div>`).join('')}`;
  const g = (id) => document.getElementById(id);
  g('f-gravar').onclick = async () => {
    const nome = g('f-nome').value.trim();
    if (!nome) return toast('Falta o nome');
    const { alias: _a, fotoPropria: _f, ...base } = p;
    const d = { ...base, nome, alcunha: g('f-alc').value.trim(), convidado: g('f-conv').checked, nivel: g('f-nivel').value ? Number(g('f-nivel').value) : null };
    if (edit) d.ativo = g('f-ativo').checked; else d.ativo = true;
    const f = g('f-foto').files[0];
    if (f) d.foto = await fotoParaDataURL(f);
    await DB.savePlayer(d);
    await recarregar(); toast('Guardado'); secJogadores(el);
  };
  if (edit) g('f-cancel').onclick = () => secJogadores(el);
  g('imp').onchange = async (e) => {
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
  el.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => { secJogadores(el, A.players.find((x) => x.id === b.dataset.ed)); window.scrollTo(0, 0); }));
  // 🛡 Moderador (decisão do Rui, 21/10): faz equipas, abre/fecha a votação e marca o jogo, no próprio perfil (com o PIN).
  el.querySelectorAll('[data-mod]').forEach((b) => (b.onclick = async () => {
    const x = A.players.find((y) => y.id === b.dataset.mod); if (!x) return;
    const { alias: _a, fotoPropria: _f, ...base } = x;
    if (!x.moderador && !confirm(`${nomeDe(x)} passa a moderador: faz equipas, abre e fecha a votação e marca o jogo. Continuar?`)) return;
    await DB.savePlayer({ ...base, moderador: !x.moderador });
    await recarregar(); toast(x.moderador ? 'Já não é moderador' : '🛡 Moderador'); secJogadores(el);
  }));
  if (DB.demo) {
    g('demo-seed').onclick = async () => { await semearDemo(); await recarregar(); renderAdmin(); };
    g('demo-reset').onclick = async () => { DB.resetDemo(); await recarregar(); renderAdmin(); };
    g('demo-jogos').onclick = async () => { await simularJogos(); toast('10 jogos simulados'); };
  }
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
async function secPartilhar(el) {
  const K = (await DB.getSegredo('partilha'))?.chave;
  const url = K ? `${BASE}#c=${K}` : '';
  el.innerHTML = `
    <div class="opcao">
      <b>Link de colaborador</b>
      <p class="mute">Quem tiver este link pode, sem login: fazer equipas e marcar o jogo no telemóvel (golos, assistências, GR).
        Não vê votos nem cartas. Gera um novo quando quiseres — o antigo deixa de funcionar.</p>
      ${K ? `<input readonly value="${url}" id="p-url" style="margin-bottom:8px">
        <div class="linha"><button class="prim" id="p-cp">Copiar link</button>
          <a class="btn" target="_blank" href="https://wa.me/?text=${encodeURIComponent('⚽ Link para fazer as equipas e marcar o jogo:\n' + url)}">Enviar no WhatsApp</a>
          <a class="btn" target="_blank" href="${url}">Abrir</a></div>` : '<p>Ainda não há link.</p>'}
      <button id="p-novo" class="${K ? 'perigo' : 'prim'}" style="margin-top:10px">${K ? 'Gerar link novo (anula o antigo)' : 'Criar link'}</button>
    </div>`;
  document.getElementById('p-cp')?.addEventListener('click', () => copiar(url));
  document.getElementById('p-novo').onclick = async () => {
    if (K && !confirm('O link atual deixa de funcionar. Continuar?')) return;
    await DB.setSegredo('partilha', { chave: novoToken(24) });
    await publicarRetrato();
    secPartilhar(el);
  };
}

// ---------- Votação ----------
const msgGrupo = () => `⚽ Malta, inspirei-me no grupo de segunda-feira e vamos passar a ter as equipas feitas de forma automática e equilibrada. Para isso preciso que cada um dê nota de 1 a 10 a todos os outros jogadores (menos a si próprio). Quem não conhecerem, carreguem em "Não conheço". Leva poucos minutos:\n👉 ${BASE}\nEscolham o vosso nome, metam o PIN de 4 algarismos que vos mando em privado, deem as notas e carreguem em OK. Podem voltar ao link para mudar.`;
const msgPin = (p, pin) => `⚽ Olá ${nomeDe(p)}! O teu PIN para a votação da futebolada é *${pin}* — é só teu, não o partilhes.
👉 ${BASE}`;

async function secVotacao(el) {
  const estado = (await DB.getPublic('estado')) || {};
  const aberta = !!estado.votacaoAberta;
  const votantes = A.players.filter((p) => !p.convidado && p.ativo !== false);
  const total = votantes.length - 1;
  const linhas = votantes.map((p) => {
    const r = A.votes.find((x) => x.id === p.id)?.r || {};
    const n = Object.values(r).filter((v) => v.skip || AREAS.every((a) => typeof v[a.k] === 'number')).length;
    return { p, c: Object.keys(r).length > 0, n };
  });
  const feitos = linhas.filter((l) => l.n >= total).length;
  const pins = Object.fromEntries((await DB.listPins()).map((x) => [x.id, x]));
  const semPin = votantes.filter((p) => !pins[p.id]);
  el.innerHTML = `
    <div class="opcao">
      <div class="linha"><b>Votação ${aberta ? '🟢 ABERTA' : '🔴 FECHADA'}</b>
        <button class="${aberta ? 'perigo' : 'prim'}" id="toggle">${aberta ? 'Fechar votação' : 'Abrir votação'}</button></div>
      <p class="mute">Um só link para o grupo. Cada um escolhe o seu nome e vota área a área.</p>
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
      ${!pins[p.id] ? '<small class="mute">sem PIN</small>' : pins[p.id].pin
        ? `<code style="font-size:16px;margin-right:6px">${esc(pins[p.id].pin)}</code>
          <a class="btn peq" target="_blank" title="Enviar o PIN no WhatsApp" href="https://wa.me/?text=${encodeURIComponent(msgPin(p, pins[p.id].pin))}">💬</a>`
        : '<small class="mute" title="Escolhido pelo jogador — não fica guardado">🔒 escolhido</small>'}
      ${pins[p.id] ? `<button class="peq" data-resetpin="${p.id}">Reset</button>` : ''}
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
  document.getElementById('toggle').onclick = async () => { await DB.setPublic('estado', { ...estado, votacaoAberta: !aberta }); secVotacao(el); };
  document.getElementById('cpgrupo').onclick = () => copiar(msgGrupo());
}

// ---------- Cartas ----------
function secCartas(el) {
  const cartas = calcularCartas(A.players.filter((p) => p.ativo !== false), A.votes, A.conv);
  const lista = A.players.filter((p) => p.ativo !== false).sort((a, b) => (cartas[b.id].overall ?? 0) - (cartas[a.id].overall ?? 0));
  el.innerHTML = `
    <div class="opcao"><b>Cartas pessoais (cada um vê só a sua, no separador 👤 Eu)</b>
      <div class="linha" style="margin-top:6px"><span id="cp-estado" class="mute">…</span><button class="peq" id="cp-toggle">…</button></div></div>
    <div class="linha"><button class="prim" id="pub">Publicar cartas de todos</button><button id="esconder">Esconder</button>
      </div>
    <p class="mute">Só tu vês isto. Ninguém sabe das cartas até carregares em Publicar (ficam em ${BASE}#cartas).<br>"Provisória" = menos de 3 votos numa área. "Estimada" = completada pelo nível que deste.</p>
    <div class="cartas">${lista.map((p) => htmlCarta(p, cartas[p.id])).join('')}</div>
    <h3>Votos por votante (só tu vês)</h3>
    <select id="vsel"><option value="">— escolhe —</option>${A.votes.map((v) => `<option value="${v.id}">${esc(nomeDe(A.players.find((p) => p.id === v.voter) || { nome: '?' }))}</option>`).join('')}</select>
    <div id="vdet"></div>
    <h3>Votos recebidos por jogador (só tu vês)</h3>
    <select id="rsel"><option value="">— escolhe o jogador —</option>${[...A.players].filter((p) => !p.convidado).map((p) => `<option value="${p.id}">${esc(nomeDe(p))}</option>`).join('')}</select>
    <div id="rdet"></div>`;
  document.getElementById('pub').onclick = async () => {
    await DB.setPublic('cartas', { visivel: true, ts: Date.now(), cartas: lista.filter((p) => !p.convidado).map((p) => ({ p: { nome: p.nome, alias: p.alias || '', foto: p.fotoPropria || p.foto || '' }, c: cartas[p.id] })) });
    toast('Cartas publicadas');
  };
  document.getElementById('esconder').onclick = async () => { await DB.setPublic('cartas', { visivel: false }); toast('Cartas escondidas'); };
  (async () => {
    const estado = (await DB.getPublic('estado')) || {}, on = !!estado.cartasPessoais;
    document.getElementById('cp-estado').textContent = on ? '🟢 Visíveis' : '🔴 Escondidas';
    const b = document.getElementById('cp-toggle');
    b.textContent = on ? 'Esconder' : 'Mostrar a cada um a sua';
    b.className = 'peq ' + (on ? 'perigo' : 'prim');
    b.onclick = async () => { await DB.setPublic('estado', { ...estado, cartasPessoais: !on }); await publicarCartasPessoais(); secCartas(el); };
  })();
  // Quem votou num jogador e que notas lhe deu (mais a média aparada que entra na carta).
  document.getElementById('rsel').onchange = (e) => {
    const id = e.target.value, el2 = document.getElementById('rdet');
    if (!id) return (el2.innerHTML = '');
    const nmv = (v) => esc(nomeDe(A.players.find((p) => p.id === v.voter) || { nome: '?' }));
    const deram = A.votes.filter((v) => v.voter !== id && v.r?.[id] && !v.r[id].skip).sort((x, y) => nmv(x).localeCompare(nmv(y), 'pt'));
    const nc = A.votes.filter((v) => v.voter !== id && v.r?.[id]?.skip);
    const media = (v) => { const n = AREAS.map((a) => v.r[id][a.k]).filter((x) => typeof x === 'number'); return n.length ? (n.reduce((a, b) => a + b, 0) / n.length).toFixed(1) : '–'; };
    const c = cartas[id];
    el2.innerHTML = `<p class="mute">${deram.length} votaram · ${nc.length} não conhecem${nc.length ? ` (${nc.map(nmv).join(', ')})` : ''}</p>
      <div style="overflow-x:auto"><table><tr><th>Votante</th>${AREAS.map((a) => `<th>${a.ab}</th>`).join('')}<th>Média</th><th title="Jogos em que o votante e este jogador estiveram juntos (mesma equipa ou contra)">Jogos juntos</th><th>Peso</th></tr>
      ${deram.map((v) => { const n = A.juntos?.[v.voter]?.[id] || 0, pts = A.conv?.[v.voter]?.[id] || 0; return `<tr><td>${nmv(v)}</td>${AREAS.map((a) => `<td>${v.r[id][a.k] ?? ''}</td>`).join('')}<td><b>${media(v)}</b></td><td>${n}</td><td>${Math.round(pesoVoto(pts) * 100)}%</td></tr>`; }).join('')}
      ${c ? `<tr><td><b>Carta</b> <small class="mute">(média aparada e pesada)</small></td>${AREAS.map((a) => `<td><b>${c.stats[a.k] != null ? c.stats[a.k].toFixed(1) : '–'}</b></td>`).join('')}<td><b>${c.overall ?? '–'}</b></td></tr>` : ''}</table></div>`;
  };
  document.getElementById('vsel').onchange = (e) => {
    const v = A.votes.find((x) => x.id === e.target.value);
    document.getElementById('vdet').innerHTML = !v ? '' : `<table><tr><th>Jogador</th>${AREAS.map((a) => `<th>${a.ab}</th>`).join('')}</tr>
      ${Object.entries(v.r || {}).map(([id, r]) => `<tr><td>${esc(nomeDe(A.players.find((p) => p.id === id) || { nome: '?' }))}</td>${r.skip ? `<td colspan="${AREAS.length}" class="mute">não conhece</td>` : AREAS.map((a) => `<td>${r[a.k] ?? ''}</td>`).join('')}</tr>`).join('')}</table>`;
  };
}

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
  const pid = (id) => X.players.find((p) => p.id === id);
  const nm = (id) => esc(nomeDe(pid(id) || { nome: '?' }));
  const sel = [...A.sel].filter(pid);
  const chip = (p) => `<button class="chip ${A.sel.has(p.id) ? 'on' : ''}" data-id="${p.id}">${foto(p)}${esc(nomeDe(p))} <small class="mute">${ov(p.id)}</small></button>`;
  const opts = (vazio) => `<option value="">${vazio}</option>` + sel.map((id) => `<option value="${id}">${nm(id)}</option>`).join('');
  const nOpc = R.separar.length + R.juntar.length + Object.keys(R.cor).filter((id) => A.sel.has(id)).length;

  el.innerHTML = `
    <p class="mute">Toca nos que vão jogar (da sondagem do WhatsApp).</p>
    <div class="linha"><b id="cont"></b><button class="peq" id="limpar">Limpar</button></div>
    <div class="chips" style="margin:10px 0">${grupo.map(chip).join('')}</div>
    <h3>Convidados (+1)</h3>
    <div class="chips" style="margin-bottom:8px">${convidados.map(chip).join('') || '<span class="mute">Nenhum ainda.</span>'}</div>
    <details class="opcao" id="d-conv"><summary><b>+ Novo convidado</b></summary>
      <label>Nome (ex.: Amigo do Boni)</label><input id="c-nome">
      <label>Nota provisória: <b id="c-nv">60</b>/100</label><input id="c-nota" type="range" min="0" max="100" value="60">
      <button class="prim" id="c-add" style="margin-top:8px">Adicionar e selecionar</button>
      <p class="mute">Fica guardado para reaproveitar noutros jogos.</p></details>
    <details class="opcao" ${nOpc ? 'open' : ''}><summary><b>Opções (opcional)</b> ${nOpc ? `<span class="tag">${nOpc} ativas</span>` : '<span class="mute">por defeito nada</span>'}</summary>
      ${sel.length < 2 ? '<p class="mute">Seleciona primeiro os jogadores.</p>' : `
      <label>Não juntar na mesma equipa</label>
      <div class="linha"><select id="s1" style="width:auto">${opts('—')}</select><select id="s2" style="width:auto">${opts('—')}</select><button class="peq" id="s-add">Adicionar</button></div>
      ${R.separar.map(([a, b], i) => `<div class="linha"><span>🚫 ${nm(a)} ≠ ${nm(b)}</span><button class="peq" data-rs="${i}">✕</button></div>`).join('')}
      <label>Juntar na mesma equipa</label>
      <div class="linha"><select id="j1" style="width:auto">${opts('—')}</select><select id="j2" style="width:auto">${opts('—')}</select><select id="j3" style="width:auto">${opts('(opcional)')}</select><button class="peq" id="j-add">Adicionar</button></div>
      ${R.juntar.map((g, i) => `<div class="linha"><span>🤝 ${g.map(nm).join(' + ')}</span><button class="peq" data-rj="${i}">✕</button></div>`).join('')}
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
  g('c-add').onclick = async () => {
    const nome = g('c-nome').value.trim();
    if (!nome) return toast('Falta o nome');
    const id = await X.addConvidado({ nome, alcunha: '', foto: '', ativo: true, convidado: true, nota100: Number(g('c-nota').value), nivel: null });
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
  el.querySelectorAll('[data-cor]').forEach((b) => (b.onclick = () => {
    if (b.dataset.c) R.cor[b.dataset.cor] = b.dataset.c; else delete R.cor[b.dataset.cor];
    pub(); secEquipas(el, X);
  }));

  g('usar-elo')?.addEventListener('change', async (e) => {
    A.usarElo = e.target.checked;
    const estado = (await DB.getPublic('estado')) || {};
    await DB.setPublic('estado', { ...estado, usarElo: A.usarElo });   // o perfil de cada um diz se o Elo está a contar
  });
  g('gerar').onclick = () => {
    const ids = [...A.sel];
    if (ids.length < 4 || ids.length % 2) return toast('Escolhe um número par de jogadores (10)');
    const restr = {
      separar: R.separar.filter((p) => p.every((x) => A.sel.has(x))),
      juntar: R.juntar.map((gr) => gr.filter((x) => A.sel.has(x))).filter((gr) => gr.length > 1),
      cor: Object.fromEntries(Object.entries(R.cor).filter(([id]) => A.sel.has(id))),
    };
    const anteriores = [...X.games].sort((a, b) => (b.criado || 0) - (a.criado || 0)).slice(0, 3).map((x) => [x.brancos || [], x.pretos || []]);
    const ops = gerarEquipas(ids, A.usarElo && X.elo ? aplicarForma(cartas, X.elo) : cartas, anteriores, 3, restr);
    if (!ops.length) return (g('res').innerHTML = '<p class="opcao">Não há nenhuma divisão que cumpra todas as opções. Tira alguma.</p>');
    if (VV) { VV.opcoes = ops.map((o) => ({ A: o.A, B: o.B, ovA: o.ovA, ovB: o.ovB })); VV.escolhida = null; X.publicar({ opcoes: VV.opcoes, escolhida: null }); }
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
  // Imagem 1080×1350 do cartão (para o WhatsApp), desenhada em canvas.
  async function imagemJogo(o, nomes, data) {
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
      for (let k = 0; k < 5; k++) txt('★', x - 96 + k * 48, 552, 44, k < n ? '#f1c40f' : '#3a3f45');
    }
    txt('VS', W / 2, 470, 54, '#6b7280', 'center', 900);
    let y = 620;
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
    const gA = melhorGR(o.A), gB = melhorGR(o.B);
    for (let k = 0; k < Math.max(o.A.length, o.B.length); k++) {
      if (o.A[k]) txt(nomes[o.A[k]] + (o.A[k] === gA ? ' 🧤' : ''), 90, y, 40, '#fff', 'left', 700);
      if (o.B[k]) txt((o.B[k] === gB ? '🧤 ' : '') + nomes[o.B[k]], W - 90, y, 40, '#fff', 'right', 700);
      y += 56;
    }
    txt('🧤 = melhor guarda-redes da equipa', W / 2, H - 40, 24, '#6b7280', 'center', 600);
    return new Promise((ok) => cv.toBlob(ok, 'image/png'));
  }
  function cartaoJogo(o) {
    const barra = (v, lado, ganha) => `<div class="fb ${lado}"><i style="width:${Math.max(4, Math.min(100, ((v ?? 0) - 30) / 0.6))}%" class="${ganha ? 'ganha' : ''}"></i></div>`;
    const linha = (a) => {
      const vA = areaE(o.A, a.k), vB = areaE(o.B, a.k), d = (vA ?? 0) - (vB ?? 0);
      return `<div class="fl${a.k === 'gr' ? ' gr' : ''}"><b class="${d > 1 ? 'ganha' : ''}">${vA == null ? '–' : Math.round(vA)}</b>${barra(vA, 'esq', d > 1)}
        <span>${a.k === 'gr' ? '🧤 GR' : a.ab}</span>${barra(vB, 'dir', d < -1)}<b class="${d < -1 ? 'ganha' : ''}">${vB == null ? '–' : Math.round(vB)}</b></div>`;
    };
    const plantel = (eq) => { const g1 = melhorGR(eq);
      return eq.map((id) => `<div>${nm(id)}${id === g1 ? ' <span title="Melhor GR da equipa">🧤</span>' : ''} <small class="mute">${ov(id)}</small></div>`).join(''); };
    return `<div class="cjogo">
      <div class="ftopo">
        <div class="fequipa">${LOGO.B}<div class="fnome">BRANCOS</div><div class="frat">${o.ovA.toFixed(0)}</div><div class="festr">${estrelas(o.ovA)}</div></div>
        <div class="fvs">VS</div>
        <div class="fequipa">${LOGO.P}<div class="fnome">PRETOS</div><div class="frat">${o.ovB.toFixed(0)}</div><div class="festr">${estrelas(o.ovB)}</div></div>
      </div>
      <div class="fbarras">${AREAS.map(linha).join('')}<div class="mute fnota">🧤 GR só informativo — não conta para equilibrar</div></div>
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
      if (VV) X.publicar({ opcoes: ops.map((x) => ({ A: x.A, B: x.B, ovA: x.ovA, ovB: x.ovB })) });
      mostrar(ops);
    }));
    if (VV) return el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = async () => {
      const k = Number(b.dataset.k), o = ops[k];
      const nomes = Object.fromEntries([...o.A, ...o.B].map((id) => [id, nomeDe(pid(id))]));
      b.disabled = true;
      const id = await X.saveGame({ data: VV.data || hojeLocal(), brancos: o.A, pretos: o.B, nomes, estado: 'marcado', criado: Date.now() }, VV.gameId || undefined);
      Object.assign(VV, { escolhida: k, gameId: id, partilhado: null });
      await X.publicar({ escolhida: k, gameId: id, partilhado: null });
      escolhidas(o);
    }));
    el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = async () => {
      const o = ops[b.dataset.k];
      const data = X.vivo?.data || hojeLocal();
      const nomes = Object.fromEntries([...o.A, ...o.B].map((id) => [id, nomeDe(pid(id))]));
      const texto = `⚽ Equipas de hoje\n\n⚪ BRANCOS\n${o.A.map((id) => nomes[id]).join('\n')}\n\n⚫ PRETOS\n${o.B.map((id) => nomes[id]).join('\n')}`;
      // Primeiro a partilha (o telemóvel só a deixa abrir logo a seguir ao toque), depois guarda.
      let png = null;
      try { png = await imagemJogo(o, nomes, data); } catch (e) { console.error(e); }
      await partilharWhatsApp(png, texto, `equipas-${data}.png`);
      await X.saveGame({ data, brancos: o.A, pretos: o.B, nomes, estado: 'marcado', criado: Date.now() });
      // Confirmação: as equipas ficam como as do próximo jogo; daqui vai-se direto para o marcador.
      g('res').innerHTML = `<div class="opcao" style="text-align:center"><h3 style="margin:4px 0">✅ Equipas escolhidas</h3>
        ${cartaoJogo(o)}
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
      ${v.partilhado ? `<p class="mute">📤 Enviadas para o grupo por ${esc(v.partilhado.nome)} às ${hora(v.partilhado.ts)}.</p>` : '<p><b>⚠️ Ainda ninguém as enviou para o grupo.</b></p>'}
      <button class="${v.partilhado ? '' : 'prim'}" id="partilhar" style="width:100%;margin-bottom:8px">📤 ${v.partilhado ? 'Enviar outra vez' : 'Enviar'} para o grupo (WhatsApp)</button>
      ${v.fase === 'fim' ? '<p>✅ Jogo terminado e registado.</p>' : '<button class="prim" id="ir-marc" style="width:100%;padding:14px;font-size:18px">⏱ Abrir o marcador</button>'}
      ${v.fase === 'fim' ? '' : '<button class="peq" id="refazer" style="margin-top:8px">Refazer equipas</button>'}
      ${v.fase === 'fim' ? '' : `<details class="opcao" style="text-align:left;margin-top:10px"><summary><b>Ninguém marcou? Fechar só com o vencedor</b></summary>
        <label>Dia em que se jogou</label><input type="date" class="pD" value="${esc(v.data || hojeLocal())}" style="width:auto">
        <label>Resultado (opcional)</label>
        <div class="linha"><input type="number" min="0" class="pB" placeholder="⚪" style="width:70px"> – <input type="number" min="0" class="pP" placeholder="⚫" style="width:70px"></div>
        <div class="linha" style="margin-top:8px"><button class="prim peq" data-fm="B">Ganhou ⚪</button><button class="peq" data-fm="E">Empate</button><button class="prim peq" data-fm="P">Ganhou ⚫</button></div></details>`}</div>`;
    g('partilhar').onclick = async () => {
      const data = v.data || hojeLocal();
      const nomes = Object.fromEntries([...o.A, ...o.B].map((id) => [id, nomeDe(pid(id))]));
      const texto = `⚽ Equipas de ${diaPT(data)}\n\n⚪ BRANCOS\n${o.A.map((id) => nomes[id]).join('\n')}\n\n⚫ PRETOS\n${o.B.map((id) => nomes[id]).join('\n')}`;
      let png = null;
      try { png = await imagemJogo(o, nomes, data); } catch (e) { console.error(e); }
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
  document.getElementById('titulo').textContent = mod ? 'Jogo de hoje' : 'Futebol';
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
    });
    return;
  }
  const V = mod ? A.vivo : null;
  // Sem jogo aberto, o moderador só vê a barra (abrir jogo, votação).
  if (mod && !V) { $app.innerHTML = '<div class="mod-barra" id="mod-barra"></div><p class="mute">Abre o jogo para fazer as equipas e marcar. Os outros moderadores veem tudo ao mesmo tempo.</p>'; return barraModerador(K, mod); }
  A.colabTab ||=mod ? (V?.gameId && V.fase !== 'fim' ? 'marc' : 'eq') : 'marc';
  $app.innerHTML = `${mod ? '<div class="mod-barra" id="mod-barra"></div>' : ''}<div class="tabs"><button data-ct="marc" class="${A.colabTab === 'marc' ? 'on' : ''}">⏱ Marcador do jogo</button>
    <button data-ct="eq" class="${A.colabTab === 'eq' ? 'on' : ''}">👥 Fazer equipas</button></div><div id="sec"></div>`;
  $app.querySelectorAll('[data-ct]').forEach((b) => (b.onclick = () => { A.colabTab = b.dataset.ct; paginaColab(K, mod); }));
  if (mod) barraModerador(K, mod);
  const sec = document.getElementById('sec');
  const ultimasEquipas = async () => {
    const todas = [...(await DB.listPart(K, 'games')), ...(await DB.listGames().catch(() => []))];
    const g = (A.vivo?.gameId && todas.find((x) => x.id === A.vivo.gameId)) || todas.sort((a, b) => (b.criado || 0) - (a.criado || 0))[0];
    if (!g) return null;
    const n = (id) => ({ id, nome: g.nomes?.[id] || id });
    return { id: g.id, data: g.data, brancos: (g.brancos || []).map(n), pretos: (g.pretos || []).map(n) };
  };
  if (A.colabTab === 'marc') {
    let carregarJa = A.carregarJa; A.carregarJa = false;
    // Moderador: as equipas escolhidas entram sozinhas no marcador (se este telemóvel não estiver a meio de outro jogo).
    const local = (() => { try { return JSON.parse(localStorage.getItem('futebol-marcador-jogo')); } catch { return null; } })();
    if (mod && V?.gameId && local?.gameId !== V.gameId) carregarJa = true;
    return paginaMarcador({ el: sec, carregarEquipas: ultimasEquipas, carregarJa,
      enviar: async (id, jogo) => {
        await DB.saveResultado(id, { chave: K, gameId: jogo.gameId || '', ts: Date.now(), origem: 'telemovel', json: JSON.stringify({ jogo, fit: {} }) });
        await DB.saveJogoPub(id, { prova: await prova(K, id), ts: Date.now(), json: JSON.stringify(jogo) });
      },
      ...(mod ? { mudou: (j) => publicarMarcacao(j, mod), outro: () => outroAMarcar() } : {}) });
  }
  const ctx = async () => {
    const conv = (await DB.listPart(K, 'convidados')).map((c) => ({ ...c, convidado: true, ativo: true }));
    const base = retrato.jogadores.map((p) => ({ ...p, ativo: true }));
    const players = [...base, ...conv.filter((c) => !base.some((b) => b.id === c.id))];
    const cartas = Object.fromEntries(retrato.jogadores.map((p) => [p.id, { overall: p.overall, stats: p.stats || {} }]));
    for (const c of conv) { const n = notaDe(c) ?? 6; cartas[c.id] = { overall: Math.round(n * 10), stats: Object.fromEntries(AREAS.map((a) => [a.k, n])), estimada: true }; }
    return {
      players, cartas, games: await DB.listPart(K, 'games'),
      irMarcador() { A.colabTab = 'marc'; A.carregarJa = true; paginaColab(K, mod); window.scrollTo(0, 0); },
      async addConvidado(d) { const id = novoToken(10); await DB.setPart(K, 'convidados', id, d); Object.assign(X, await ctx()); if (mod) DB.setAoVivo({ conv: Date.now() }); return id; },
      async notaConvidado(id, n) { const c = conv.find((x) => x.id === id); if (!c) return; const { id: _, convidado, ativo, ...d } = c; await DB.setPart(K, 'convidados', id, { ...d, nota100: n }); },
      // id: o moderador que refaz as equipas grava por cima do mesmo jogo (não fica um jogo em aberto a mais).
      async saveGame(g, id = novoToken(10)) {
        await DB.setPart(K, 'games', id, g);
        await DB.saveGame({ ...g, id, prova: await prova(K, id) });
        Object.assign(X, await ctx());
        return id;
      },
      ...(mod ? { vivo: A.vivo || {}, eu: mod.eu, K, publicar: (d) => DB.setAoVivo(d).catch((e) => { console.error(e); toast('Sem rede? ' + e.message); }) } : {}),
    };
  };
  const X = await ctx();
  A.ctxColab = X;
  secEquipas(sec, X);
}

// ---------- Moderadores: o jogo de hoje ao vivo ----------
// aovivo/jogo = { fase: 'aberto'|'jogo'|'fim', data, por, ts, sel, restr, opcoes, escolhida, gameId, partilhado, marcador, live }
const MOD_DISP = (() => { let d = lsGet('futebol-disp'); if (!d) { d = novoToken(10); lsSet('futebol-disp', d); } return d; })();

// Mudou no telemóvel de outro moderador: redesenha a barra e, se não houver nada a meio aqui, a secção aberta.
function aoVivoMudou(K, mod) {
  if (location.hash !== '#jogo' || !document.getElementById('mod-barra')) return;
  if (!document.getElementById('sec') || !A.vivo) return paginaColab(K, mod);   // jogo aberto (ou fechado) agora
  barraModerador(K, mod);
  const local = (() => { try { return JSON.parse(localStorage.getItem('futebol-marcador-jogo')); } catch { return null; } })();
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
    DB.setAoVivo({ fase: j.fase === 'fim' && j.enviado ? 'fim' : 'jogo', live: JSON.stringify(j),
      marcador: { id: mod.eu.id, nome: nomeDe(mod.eu), disp: MOD_DISP, ts: Date.now() } }).catch((e) => console.error(e));
  };
  clearTimeout(pubMarc);
  if (j.fase === 'fim') enviar(); else pubMarc = setTimeout(enviar, 1500);
}

// Barra do topo: o jogo de hoje (passos), votação e abrir um jogo novo.
async function barraModerador(K, mod) {
  const el = document.getElementById('mod-barra'); if (!el) return;
  const v = A.vivo, estado = (await DB.getPublic('estado').catch(() => null)) || {};
  if (!document.getElementById('mod-barra')) return;
  const hora = (t) => (t ? new Date(t).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '');
  const ativo = v && v.fase !== 'fim';
  let live = null; try { live = v?.live ? JSON.parse(v.live) : null; } catch {}
  const golosL = (e) => (live?.eventos || []).filter((x) => x.equipa === e).length;
  const passos = [['Aberto', !!ativo || v?.fase === 'fim'], ['Opções', !!v?.opcoes?.length], ['Escolhidas', !!v?.gameId], ['No grupo', !!v?.partilhado],
    ['A jogar', v?.fase === 'jogo' || v?.fase === 'fim'], ['Fim', v?.fase === 'fim']];
  el.innerHTML = `
    ${v ? `<div class="linha" style="justify-content:space-between"><b>⚽ Jogo de ${esc(diaPT(v.data))}</b><span class="mute">aberto por ${esc(v.por?.nome || '?')} ${hora(v.ts)}</span></div>
      ${v.fase === 'jogo' && live ? `<div style="margin-top:6px"><span class="ao-vivo"></span><b>⚪ ${golosL('B')} – ${golosL('P')} ⚫</b> <span class="mute">· marca ${esc(v.marcador?.nome || '?')}${v.marcador?.disp === MOD_DISP ? ' (este telemóvel)' : ''}</span></div>` : ''}
      ${v.fase === 'fim' && live ? `<div style="margin-top:6px">✅ Final: <b>⚪ ${golosL('B')} – ${golosL('P')} ⚫</b></div>` : ''}
      ${v.gameId && !v.partilhado && v.fase !== 'fim' ? '<div class="mute" style="margin-top:6px">⚠️ Equipas escolhidas mas ainda ninguém as enviou para o grupo.</div>' : ''}
      ${v.partilhado ? `<div class="mute" style="margin-top:4px">📤 Enviadas para o grupo por ${esc(v.partilhado.nome)} ${hora(v.partilhado.ts)}</div>` : ''}
      <div class="passos">${passos.map(([n, ok]) => `<span class="${ok ? 'feito' : ''}">${ok ? '✓ ' : ''}${n}</span>`).join('')}</div>` : '<b>Nenhum jogo aberto.</b>'}
    <div class="linha" style="margin-top:10px;justify-content:space-between">
      <span>🗳 Votação <b>${estado.votacaoAberta ? 'aberta' : 'fechada'}</b> <button class="peq" id="mb-vot">${estado.votacaoAberta ? 'Fechar' : 'Abrir'}</button></span>
      ${ativo ? '<button class="peq" id="mb-novo">Abrir outro jogo</button>' : ''}</div>
    ${ativo ? '' : `<div class="linha" style="margin-top:8px"><input type="date" id="mb-data" value="${hojeLocal()}" style="width:auto"><button class="prim" id="mb-abrir">⚽ Abrir jogo</button></div>`}`;
  const abrir = async (data) => {
    await DB.setAoVivo({ fase: 'aberto', data, por: { id: mod.eu.id, nome: nomeDe(mod.eu) }, ts: Date.now(), sel: [], restr: '', opcoes: null,
      escolhida: null, gameId: null, partilhado: null, marcador: null, live: null }, false);
    A.sel = new Set(); A.restr = null; A.colabTab = 'eq';
  };
  el.querySelector('#mb-abrir')?.addEventListener('click', () => abrir(el.querySelector('#mb-data').value || hojeLocal()));
  el.querySelector('#mb-novo')?.addEventListener('click', () => {
    if (v.fase === 'jogo' && !confirm('Há um jogo a ser marcado. Abrir outro mesmo assim?')) return;
    if (confirm(`Fechar o jogo de ${diaPT(v.data)} aqui e abrir um novo (hoje)?`)) abrir(hojeLocal());
  });
  el.querySelector('#mb-vot').onclick = async () => {
    const e2 = (await DB.getPublic('estado')) || {};
    if (!confirm(e2.votacaoAberta ? 'Fechar a votação para todos?' : 'Abrir a votação para todos?')) return;
    try { await DB.setPublic('estado', { ...e2, votacaoAberta: !e2.votacaoAberta }); toast(e2.votacaoAberta ? 'Votação fechada' : 'Votação aberta'); }
    catch (e) { console.error(e); toast('Não deu: ' + e.message); }
    barraModerador(K, mod);
  };
}

// #jogo — página dos moderadores (com o PIN no 👤 Eu): fazer equipas, votação e marcar o jogo, tudo partilhado.
async function paginaJogo() {
  document.getElementById('titulo').textContent = 'Jogo de hoje';
  const [players, perfis] = await Promise.all([DB.listPlayers(), DB.listPerfis()]);
  const todos = juntarPerfis(players, perfis);
  const eu = todos.find((p) => p.id === lsGet('meu-perfil'));
  const sair = (t) => { $app.innerHTML = `<div class="fim"><p>${t}</p><a class="btn prim" href="#eu">👤 Ir para o meu perfil</a></div>`; };
  if (!eu || !(await DB.ligacaoOk(eu.id))) return sair('Entra primeiro no teu perfil com o PIN.');
  if (!eu.moderador) return sair('Esta página é só para os moderadores. Fala com o Rui.');
  const K = (await DB.getModeracao('chave').catch(() => null))?.chave;
  if (!K) return sair('Ainda não está pronto: o Rui tem de abrir o admin uma vez.');
  return paginaColab(K, { eu });
}

// =====================================================================
async function rota() {
  const h = location.hash;
  // No admin, o botão do topo leva ao próprio perfil (👤); fora dele, ao admin (⚙).
  const lnk = document.getElementById('lnk-admin');
  if (h === '#admin') { lnk.textContent = '👤'; lnk.href = '#eu'; lnk.title = 'O meu perfil'; }
  else { lnk.textContent = '⚙'; lnk.href = '#admin'; lnk.title = 'Administração'; }
  lnk.setAttribute('aria-label', lnk.title);
  if (h === '#eu') A.pubTab = 'eu';
  document.body.classList.remove('modo-jogo');
  if (h !== '#jogo') { A.offVivo?.(); A.offVivo = null; A.vivo = null; }
  try {
    if (h === '#jogo') return await paginaJogo();
    if (h === '#admin') return await paginaAdmin();
    if (h === '#cartas') return await paginaCartas();
    if (h.startsWith('#c=')) return await paginaColab(h.slice(3));
    return await paginaInicio();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<p class="centro">Erro: ${esc(e.message)}</p>`;
  }
}
window.addEventListener('hashchange', rota);
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
      await DB.novoTicket({ texto, ecra: (location.hash || '#') + (A.pubTab && !location.hash.startsWith('#admin') ? ' · ' + A.pubTab : ''),
        quem: lsGet('meu-perfil') || null, ua: navigator.userAgent.slice(0, 250), erros: ERROS.join('\n').slice(-4000),
        foto: f ? await printParaDataURL(f) : '', ts: Date.now(), estado: 'aberto' });
      fechar(); toast('Enviado — obrigado! 👍');
    } catch (err) { erroOriginal(err); e.target.disabled = false; toast('Não deu para enviar — tenta outra vez'); }
  };
}
document.getElementById('ticket').onclick = abrirTicket;

// ---------- App instalável (PWA) ----------
// Android/Chrome/Edge: botão "Instalar app" quando o browser deixa. iPhone: o Safari não tem botão — explica-se o caminho.
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch((e) => console.error(e));
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
