// Marcador de jogo no telemóvel (para quando o Rui não vai): o mesmo que a app do relógio, sem sensores.
// Guarda tudo no browser a cada toque (sobrevive a refrescar a página) e envia para resultados/ no fim.

const LS = 'futebol-marcador-jogo';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const minuto = (ms) => `${Math.floor(ms / 60000) + 1}'`;
const outra = (e) => (e === 'B' ? 'P' : 'B');
const DUR = [6, 5, 4, 3, 2, 1];
const PARTES = { pd: 'Pé direito', pe: 'Pé esquerdo', cab: 'Cabeça', out: 'Outro', pen: 'Penálti' };

// ---------- estado (mesmo formato que o relógio envia) ----------
function novoJogo(eq) {
  return { gameId: eq?.id || '', data: eq?.data || new Date().toISOString().slice(0, 10), brancos: eq?.brancos || [], pretos: eq?.pretos || [],
    minTurno: 6, rondas: 2, fase: 'prep', inicioEpoch: 0, fimEpoch: 0, pausadoEm: 0, pausaTotal: 0,
    eventos: [], penaltis: [], baliza: {}, turnos: [], enviado: false, origem: 'telemovel' };
}
const ler = () => { try { return JSON.parse(localStorage.getItem(LS)); } catch { return null; } };
const gravar = (j) => { try { localStorage.setItem(LS, JSON.stringify(j)); } catch {} };
const jogs = (j, e) => (e === 'B' ? j.brancos : j.pretos);
const nome = (j, id) => [...j.brancos, ...j.pretos].find((p) => p.id === id)?.nome || '?';
const golos = (j, e) => j.eventos.filter((x) => x.equipa === e).length;
const decorrido = (j, agora = Date.now()) =>
  j.fase === 'prep' ? 0 : (j.fase === 'fim' ? j.fimEpoch : j.pausadoEm || agora) - j.inicioEpoch - j.pausaTotal;
function proximoGR(j, e) {
  const l = jogs(j, e); const i = l.findIndex((p) => p.id === j.baliza[e]?.atual);
  return l[(i + 1) % l.length].id;
}
function trocarGR(j, e, novo) {
  const b = j.baliza[e];
  if (j.fase !== 'jogo') { j.baliza[e] = { atual: novo, inicio: 0, expirou: false, dur: j.minTurno }; return; }
  const t = decorrido(j);
  if (b && t > b.inicio) j.turnos.push({ equipa: e, jogador: b.atual, de: b.inicio, ate: t });
  j.baliza[e] = { atual: novo, inicio: t, expirou: false, dur: j.minTurno };
}
function pausar(j) {
  if (j.pausadoEm) { j.pausaTotal += Date.now() - j.pausadoEm; j.pausadoEm = 0; } else j.pausadoEm = Date.now();
}
function terminar(j) {
  if (j.pausadoEm) pausar(j);
  const t = decorrido(j);
  for (const e of ['B', 'P']) { const b = j.baliza[e]; if (b) j.turnos.push({ equipa: e, jogador: b.atual, de: b.inicio, ate: t }); }
  j.fase = 'fim'; j.fimEpoch = Date.now();
}

// ---------- alarme (vibração + bip) ----------
let audio;
function bip() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let k = 0; k < 3; k++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      const t0 = audio.currentTime + k * 0.45;
      g.gain.setValueAtTime(0.5, t0); g.gain.setValueAtTime(0, t0 + 0.3);
      o.start(t0); o.stop(t0 + 0.32);
    }
  } catch {}
  try { navigator.vibrate?.([600, 250, 600, 250, 600]); } catch {}
}

// =====================================================================
// opts: { el, carregarEquipas: async () => equipa|null, enviar: async (id, doc) => void }
export function paginaMarcador(opts) {
  const { el } = opts;
  let j = ler() || novoJogo(null);
  let modal = null;           // { tipo, ... }
  const abertos = new Set();  // trocas de GR já abertas automaticamente
  const ultimoAlarme = {};
  let wake = null;
  const salvar = () => gravar(j);

  async function pedirEcraLigado() { try { wake = await navigator.wakeLock?.request('screen'); } catch {} }

  async function carregar() {
    const eq = await opts.carregarEquipas();
    if (!eq) { alert('Ainda não há equipas feitas.'); return; }
    const keep = { minTurno: j.minTurno, rondas: j.rondas };
    j = { ...novoJogo(eq), ...keep }; salvar(); render();
  }

  // ---------- render ----------
  function render() {
    if (j.fase === 'prep') return renderPrep();
    if (j.fase === 'fim') return renderFim();
    renderJogo();
  }

  function renderPrep() {
    const gr = (e) => j.baliza[e]?.atual || jogs(j, e)[0]?.id;
    el.innerHTML = `
      <h2>⚽ Marcador do jogo</h2>
      <div class="opcao"><div class="linha" style="justify-content:space-between"><b>Equipas ${esc(j.data)}</b><button class="peq" id="m-eq">Carregar as mais recentes</button></div>
        ${j.brancos.length ? `<div class="equipas"><div class="eq branco"><h4>⚪ Brancos</h4>${j.brancos.map((p) => esc(p.nome)).join('<br>')}</div>
          <div class="eq preto"><h4>⚫ Pretos</h4>${j.pretos.map((p) => esc(p.nome)).join('<br>')}</div></div>` : '<p class="mute">Carrega as equipas feitas no site.</p>'}</div>
      ${j.brancos.length ? `
      <label>Minutos por turno de GR</label><div class="linha">${DUR.map((m) => `<button class="peq ${j.minTurno === m ? 'on' : ''}" data-min="${m}">${m}</button>`).join('')}</div>
      <label>Rondas de baliza</label><div class="linha">${[2, 3].map((r) => `<button class="peq ${j.rondas === r ? 'on' : ''}" data-ron="${r}">${r}</button>`).join('')}
        <span class="mute">${j.rondas * j.brancos.length * j.minTurno} min de jogo</span></div>
      <label>1.º GR ⚪</label><select id="m-grB">${j.brancos.map((p) => `<option value="${p.id}" ${gr('B') === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <label>1.º GR ⚫</label><select id="m-grP">${j.pretos.map((p) => `<option value="${p.id}" ${gr('P') === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <button class="prim" id="m-start" style="width:100%;margin-top:16px;padding:16px;font-size:20px">START GAME</button>
      <p class="mute">O ecrã fica ligado durante o jogo. No fim o jogo é enviado para o site.</p>` : ''}`;
    el.querySelector('#m-eq').onclick = carregar;
    el.querySelectorAll('[data-min]').forEach((b) => (b.onclick = () => { j.minTurno = Number(b.dataset.min); salvar(); render(); }));
    el.querySelectorAll('[data-ron]').forEach((b) => (b.onclick = () => { j.rondas = Number(b.dataset.ron); salvar(); render(); }));
    el.querySelector('#m-start')?.addEventListener('click', () => {
      j.baliza = { B: { atual: el.querySelector('#m-grB').value, inicio: 0, expirou: false, dur: j.minTurno },
                   P: { atual: el.querySelector('#m-grP').value, inicio: 0, expirou: false, dur: j.minTurno } };
      j.fase = 'jogo'; j.inicioEpoch = Date.now(); salvar(); bipDesbloquear(); pedirEcraLigado(); render();
    });
  }
  // O áudio só toca depois de um toque do utilizador: "acorda-o" no START.
  function bipDesbloquear() { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {} }

  function renderJogo() {
    const t = decorrido(j);
    el.innerHTML = `
      <div class="mtopo" id="m-tempo">${j.pausadoEm ? '⏸ PAUSA — toca para retomar' : mmss(t)}</div>
      <div class="mplacar">${['B', 'P'].map((e) => `<button class="mgolo ${e === 'B' ? 'branco' : 'preto'}" data-golo="${e}">${golos(j, e)}</button>`).join('')}</div>
      <div class="mplacar">${['B', 'P'].map((e) => {
        const b = j.baliza[e]; const resta = b.dur * 60000 - (t - b.inicio);
        return `<button class="mgr ${b.expirou || resta < 30000 ? 'alerta' : ''}" data-gr="${e}">🧤 ${esc(nome(j, b.atual))}<b>${b.expirou ? 'TROCA!' : mmss(resta)}</b></button>`;
      }).join('')}</div>
      <div class="linha" style="margin:10px 0">
        <button class="peq" id="m-pausa">${j.pausadoEm ? '▶ Retomar' : '⏸ Pausa'}</button>
        <button class="peq" id="m-dur">⏱ Turnos GR: ${j.minTurno} min</button>
        ${j.eventos.length ? '<button class="peq" id="m-undo">↩ Anular último golo</button>' : ''}
        <button class="peq perigo" id="m-stop">⏹ Terminar</button></div>
      <div class="mlista">${[...j.eventos].reverse().map((ev) => `<div>${minuto(ev.t)} ${descr(ev)}</div>`).join('')}</div>
      ${modal ? renderModal() : ''}`;
    el.querySelector('#m-tempo').onclick = () => { pausar(j); salvar(); render(); };
    el.querySelector('#m-pausa').onclick = () => { pausar(j); salvar(); render(); };
    el.querySelector('#m-dur').onclick = () => { j.minTurno = DUR[(DUR.indexOf(j.minTurno) + 1) % DUR.length]; salvar(); render(); };
    el.querySelector('#m-undo')?.addEventListener('click', () => { if (confirm('Anular o último golo?')) { const ev = j.eventos.pop(); if (ev?.parte === 'pen') j.penaltis = (j.penaltis || []).filter((pn) => pn.t !== ev.t); salvar(); render(); } });
    el.querySelector('#m-stop').onclick = () => { if (confirm('Terminar o jogo?')) { terminar(j); salvar(); render(); enviar(); } };
    el.querySelectorAll('[data-golo]').forEach((b) => (b.onclick = () => { modal = { tipo: 'marcador', e: b.dataset.golo }; render(); }));
    el.querySelectorAll('[data-gr]').forEach((b) => (b.onclick = () => { modal = { tipo: 'gr', e: b.dataset.gr }; render(); }));
    ligarModal();
  }

  const descr = (ev) => `${ev.equipa === 'B' ? '⚪' : '⚫'} ${ev.tipo === 'autogolo' ? `AG ${esc(nome(j, ev.marcador))}`
    : esc(nome(j, ev.marcador)) + (ev.assist ? ` (${esc(nome(j, ev.assist))})` : '')}${ev.parte ? ` · ${PARTES[ev.parte]}` : ''}`;

  function renderModal() {
    const m = modal, cor = m.e === 'B' ? '⚪' : '⚫';
    const lista = (ps, attr) => ps.map((p) => `<button class="mopc" ${attr}="${p.id}">${esc(p.nome)}</button>`).join('');
    let corpo = '';
    if (m.tipo === 'marcador') corpo = `<h3>Golo ${cor} — quem marcou?</h3>${lista(jogs(j, m.e), 'data-marc')}<button class="mopc auto" id="m-ag">Autogolo</button><button class="mopc sem" id="m-pen">⚽ Penálti</button>`;
    if (m.tipo === 'assist') corpo = `<h3>Assistência?</h3><button class="mopc sem" data-as="">Sem assistência</button>${lista(jogs(j, m.e).filter((p) => p.id !== m.marcador), 'data-as')}`;
    if (m.tipo === 'parte') corpo = `<h3>Como foi?</h3><div class="mpartes">${Object.entries(PARTES).map(([k, n]) => `<button class="mopc" data-parte="${k}">${n}</button>`).join('')}</div>`;
    if (m.tipo === 'pen') corpo = `<h3>Penálti ${cor} — quem bate?</h3>${lista(jogs(j, m.e), 'data-penm')}`;
    if (m.tipo === 'penres') corpo = `<h3>Penálti de ${esc(nome(j, m.marcador))}</h3>
      <button class="mopc" data-penr="golo">⚽ GOLO</button>
      <button class="mopc sug" data-penr="defendido">🧤 Defendido por ${esc(nome(j, j.baliza[outra(m.e)]?.atual))}</button>
      <button class="mopc sem" data-penr="fora">Fora / poste</button>`;
    if (m.tipo === 'auto') corpo = `<h3>Autogolo de quem?</h3>${lista(jogs(j, outra(m.e)), 'data-autog')}`;
    if (m.tipo === 'gr') {
      const b = j.baliza[m.e], sug = proximoGR(j, m.e);
      const ordem = [...jogs(j, m.e)].sort((a, c) => (a.id === sug ? -1 : c.id === sug ? 1 : 0));
      corpo = `<h3>${b.expirou ? `⏰ Troca ${cor}: novo GR?` : `Baliza ${cor} — quem vai?`}</h3>
        ${b.expirou ? '<button class="mopc sem" id="m-golo1">⚽ Marcar golo primeiro</button>' : ''}
        <button class="mopc" id="m-durgr">⏱ Este turno: ${j.minTurno} min (toca para mudar)</button>
        ${ordem.map((p) => `<button class="mopc ${p.id === sug ? 'sug' : ''}" data-novogr="${p.id}">${esc(p.nome)}${p.id === b.atual ? ' · está na baliza' : p.id === sug ? ' · próximo' : ''}</button>`).join('')}`;
    }
    return `<div class="mfundo"><div class="mcaixa">${corpo}<button class="mopc fechar" id="m-fechar">Cancelar</button></div></div>`;
  }

  function ligarModal() {
    if (!modal) return;
    const q = (s) => el.querySelectorAll(s);
    el.querySelector('#m-fechar').onclick = () => { modal = null; render(); };
    q('[data-marc]').forEach((b) => (b.onclick = () => { modal = { tipo: 'assist', e: modal.e, marcador: b.dataset.marc }; render(); }));
    el.querySelector('#m-ag')?.addEventListener('click', () => { modal = { tipo: 'auto', e: modal.e }; render(); });
    el.querySelector('#m-pen')?.addEventListener('click', () => { modal = { tipo: 'pen', e: modal.e }; render(); });
    q('[data-penm]').forEach((b) => (b.onclick = () => { modal = { tipo: 'penres', e: modal.e, marcador: b.dataset.penm }; render(); }));
    q('[data-penr]').forEach((b) => (b.onclick = () => {
      const t = decorrido(j), gr = j.baliza[outra(modal.e)]?.atual || null, r = b.dataset.penr;
      (j.penaltis ||= []).push({ t, equipa: modal.e, marcador: modal.marcador, gr, resultado: r });
      if (r === 'golo') j.eventos.push({ t, tipo: 'golo', equipa: modal.e, marcador: modal.marcador, assist: null, gr, parte: 'pen' });
      try { navigator.vibrate?.(120); } catch {}
      modal = null; salvar(); render();
    }));
    q('[data-as]').forEach((b) => (b.onclick = () => { modal = { ...modal, tipo: 'parte', assist: b.dataset.as || null }; render(); }));
    q('[data-parte]').forEach((b) => (b.onclick = () => {
      const t = decorrido(j);
      j.eventos.push({ t, tipo: 'golo', equipa: modal.e, marcador: modal.marcador, assist: modal.assist, gr: j.baliza[outra(modal.e)]?.atual || null, parte: b.dataset.parte });
      try { navigator.vibrate?.(120); } catch {}
      modal = null; salvar(); render();
    }));
    q('[data-autog]').forEach((b) => (b.onclick = () => {
      j.eventos.push({ t: decorrido(j), tipo: 'autogolo', equipa: modal.e, marcador: b.dataset.autog, assist: null, gr: j.baliza[outra(modal.e)]?.atual || null, parte: null });
      modal = null; salvar(); render();
    }));
    el.querySelector('#m-golo1')?.addEventListener('click', () => { modal = null; render(); });
    el.querySelector('#m-durgr')?.addEventListener('click', () => { j.minTurno = DUR[(DUR.indexOf(j.minTurno) + 1) % DUR.length]; salvar(); render(); });
    q('[data-novogr]').forEach((b) => (b.onclick = () => { trocarGR(j, modal.e, b.dataset.novogr); modal = null; salvar(); render(); }));
  }

  // ---------- fim / envio ----------
  async function enviar() {
    try {
      await opts.enviar('tel-' + j.inicioEpoch, j);
      j.enviado = true; salvar();
    } catch (e) { console.error(e); }
    render();
  }

  function renderFim() {
    el.innerHTML = `<div class="fim"><h2>Final: ⚪ ${golos(j, 'B')} – ${golos(j, 'P')} ⚫</h2>
      <p>${mmss(decorrido(j))} de jogo</p>
      <p>${j.enviado ? '✅ Enviado para o site' : '⚠️ Ainda não enviado (sem rede?)'}</p>
      ${j.enviado ? '' : '<button class="prim" id="m-env">Enviar agora</button>'}
      <div class="mlista" style="text-align:left">${j.eventos.map((ev) => `<div>${minuto(ev.t)} ${descr(ev)}</div>`).join('')}</div>
      <button id="m-novo" style="margin-top:16px">Novo jogo</button></div>`;
    el.querySelector('#m-env')?.addEventListener('click', enviar);
    el.querySelector('#m-novo').onclick = () => {
      if (!j.enviado && !confirm('Este jogo ainda não foi enviado. Apagar mesmo?')) return;
      j = novoJogo(null); salvar(); render();
    };
  }

  // ---------- relógio interno: tempos, alarmes ----------
  const timer = setInterval(() => {
    if (!el.isConnected) { clearInterval(timer); try { wake?.release(); } catch {} return; }
    if (j.fase !== 'jogo') return;
    if (!j.pausadoEm) {
      const t = decorrido(j);
      for (const e of ['B', 'P']) {
        const b = j.baliza[e];
        if (!b) continue;
        if (!b.expirou && b.dur * 60000 - (t - b.inicio) <= 0) { b.expirou = true; salvar(); bip(); ultimoAlarme[e] = Date.now(); }
        else if (b.expirou && Date.now() - (ultimoAlarme[e] || 0) > 15000) { bip(); ultimoAlarme[e] = Date.now(); }
        if (b.expirou && !modal && !abertos.has(`${e}-${b.inicio}`)) { abertos.add(`${e}-${b.inicio}`); modal = { tipo: 'gr', e }; }
      }
    }
    // Só redesenha o necessário quando não há janela aberta (não estragar toques a meio).
    if (!modal || modal.tipo === 'gr') render();
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && j.fase === 'jogo') pedirEcraLigado(); });
  // Vindo de "Abrir o marcador com estas equipas": carrega-as já (nunca por cima de um jogo a decorrer ou por enviar).
  if (opts.carregarJa && (j.fase === 'prep' || (j.fase === 'fim' && j.enviado))) { carregar(); return; }
  if (j.fase === 'jogo') pedirEcraLigado();
  render();
}
