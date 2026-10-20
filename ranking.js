// Cálculo das cartas e gerador de equipas (puro, sem acesso a dados).

export const AREAS = [
  { k: 'rem', nome: 'Remate', ab: 'REM', peso: 1 },
  { k: 'pas', nome: 'Passe', ab: 'PAS', peso: 1 },
  { k: 'tec', nome: 'Técnica', ab: 'TEC', peso: 1 },
  { k: 'def', nome: 'Defesa', ab: 'DEF', peso: 1 },
  { k: 'for', nome: 'Físico/Força', ab: 'FOR', peso: 0.8 },
  { k: 'sta', nome: 'Stamina', ab: 'STA', peso: 1 },
  { k: 'gr', nome: 'Guarda-redes', ab: 'GR', peso: 0.6 },
];
export const MIN_VOTOS = 3; // abaixo disto a área é "provisória"
export const NIVEIS = [
  { v: 1, nome: 'Fraco', pct: 0.2 },
  { v: 2, nome: 'Médio', pct: 0.5 },
  { v: 3, nome: 'Bom', pct: 0.75 },
  { v: 4, nome: 'Muito bom', pct: 0.9 },
];

// Média aparada: com ≥5 votos corta o mais alto e o mais baixo. vals = números ou [nota, peso].
export function mediaAparada(vals) {
  if (!vals.length) return null;
  const v = vals.map((x) => (Array.isArray(x) ? x : [x, 1])).sort((a, b) => a[0] - b[0]);
  const u = v.length >= 5 ? v.slice(1, -1) : v;
  const w = u.reduce((a, [, p]) => a + p, 0);
  return u.reduce((a, [n, p]) => a + n * p, 0) / w;
}

// Peso de um voto (decisão do Rui, 20/10/2026): conta mais quem joga com/contra o votado (viu-o jogar).
// Pontos de convívio do par: +1 por jogo juntos (mesma equipa ou contra), até 10;
// −0,5 por cada jogo em que QUEM VOTA joga e o votado não está (lesionado/parado não perde nada), até 0.
// Peso = 20 % + 6 % por ponto → 20 % (nunca jogaram) … 80 % (10 jogos juntos). Sobe em 10 jogos, desce em 20.
export const PESO = { min: 0.2, max: 0.8, sobe: 1, desce: 0.5, teto: 10 };
export const pesoVoto = (pts) => PESO.min + (PESO.max - PESO.min) * Math.min(pts, PESO.teto) / PESO.teto;

// Pontos de convívio de cada par, jogo a jogo por ordem de data. Devolve P[votante][votado].
export function pontosConvivio(jogos) {
  const P = {}, vistos = new Set(), todos = new Set();
  const ord = [...jogos].sort((a, b) => (a.inicioEpoch || 0) - (b.inicioEpoch || 0));
  for (const j of ord) {
    const chave = j.gameId || j.id;
    if (chave && vistos.has(chave)) continue;
    if (chave) vistos.add(chave);
    const ids = [...(j.brancos || []), ...(j.pretos || [])].map((x) => (typeof x === 'string' ? x : x.id)).filter(Boolean);
    const aqui = new Set(ids);
    ids.forEach((x) => todos.add(x));
    for (const a of aqui) for (const b of todos) {
      if (a === b) continue;
      const v = (P[a] ||= {})[b] || 0;
      P[a][b] = aqui.has(b) ? Math.min(PESO.teto, v + PESO.sobe) : Math.max(0, v - PESO.desce);
    }
  }
  return P;
}

// Quantos jogos cada par jogou junto (mesma equipa ou contra). jogos: [{ id, gameId?, brancos, pretos }] com ids ou {id}.
export function contarConvivio(jogos) {
  const C = {}, vistos = new Set();
  for (const j of jogos) {
    const chave = j.gameId || j.id;
    if (chave && vistos.has(chave)) continue;
    if (chave) vistos.add(chave);
    const ids = [...(j.brancos || []), ...(j.pretos || [])].map((x) => (typeof x === 'string' ? x : x.id)).filter(Boolean);
    for (const a of ids) for (const b of ids) if (a !== b) { (C[a] ||= {})[b] = (C[a][b] || 0) + 1; }
  }
  return C;
}

export function overallDe(stats) {
  let s = 0, p = 0;
  for (const a of AREAS) if (stats[a.k] != null) { s += stats[a.k] * a.peso; p += a.peso; }
  return p ? Math.round((s / p) * 10) : null;
}

function percentil(arr, q) {
  if (!arr.length) return 6;
  const v = [...arr].sort((a, b) => a - b);
  const i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

// players: [{id,nome,convidado,nivel,...}], votes: [{voter, r:{targetId:{skip}|{rem..}}}]
export function calcularCartas(players, votes, convivio = {}) {
  const cartas = {};
  for (const p of players) {
    const st = {}, n = {};
    let conhecem = 0;
    for (const a of AREAS) {
      const vals = [];
      for (const v of votes) {
        if (v.voter === p.id) continue; // nunca conta voto em si próprio
        const r = v.r && v.r[p.id];
        if (r && !r.skip && typeof r[a.k] === 'number') vals.push([r[a.k], pesoVoto(convivio[v.voter]?.[p.id] || 0)]);
      }
      st[a.k] = mediaAparada(vals);
      n[a.k] = vals.length;
    }
    for (const v of votes) { const r = v.r && v.r[p.id]; if (r && !r.skip) conhecem++; }
    const provisoria = AREAS.some((a) => n[a.k] < MIN_VOTOS);
    cartas[p.id] = { id: p.id, stats: st, n, conhecem, provisoria, overall: overallDe(st) };
  }
  // Convidados com nota provisória (1–10): igual em todas as áreas sem votos suficientes.
  for (const p of players) {
    const c = cartas[p.id];
    const nota = notaDe(p);
    if (nota == null) continue;
    for (const a of AREAS) if (c.n[a.k] < MIN_VOTOS) c.stats[a.k] = nota;
    c.overall = overallDe(c.stats);
    c.estimada = true;
  }
  // Convidados e jogadores sem votos suficientes: nível dado pelo admin → percentil do grupo.
  const base = Object.values(cartas).filter((c) => !c.provisoria && !c.estimada);
  for (const p of players) {
    const c = cartas[p.id];
    if (notaDe(p) != null || !(p.convidado || (c.provisoria && p.nivel))) continue;
    const nv = NIVEIS.find((x) => x.v === Number(p.nivel)) || NIVEIS[1];
    for (const a of AREAS) {
      if (c.n[a.k] >= MIN_VOTOS) continue;
      const ref = base.map((b) => b.stats[a.k]).filter((x) => x != null);
      c.stats[a.k] = ref.length ? percentil(ref, nv.pct) : 4 + nv.v; // sem grupo ainda: escala fixa
    }
    c.overall = overallDe(c.stats);
    c.estimada = true;
  }
  posicoes(Object.values(cartas));
  return cartas;
}

// Nota do convidado em escala 1–10 (internamente). nota100 = 0–100 (novo); notaConvidado = 1–10 (antigo).
export function notaDe(p) {
  if (p.nota100 != null && p.nota100 !== '') return Math.max(0, Math.min(100, Number(p.nota100))) / 10;
  return p.notaConvidado ? Number(p.notaConvidado) : null;
}

// Posição indicativa pelo PERFIL de cada um (onde se destaca face às suas próprias notas), não pelo nível.
// Cada área é posta na escala do grupo (desvios-padrão) e tira-se a média do próprio jogador.
// Médio = o perfil de médio é o melhor, ou não pende claramente nem para a defesa nem para o ataque.
// Stamina conta para médio (muito) e avançado (pouco); quase nada para defesa (decisão do Rui, 14/10).
export const POSICOES = [
  { k: 'DEF', nome: 'Defesa', pesos: { def: 0.65, for: 0.25, pas: 0.1 } },
  { k: 'MED', nome: 'Médio', pesos: { pas: 0.35, sta: 0.35, tec: 0.2, def: 0.1 } },
  { k: 'AVA', nome: 'Avançado', pesos: { rem: 0.55, tec: 0.3, sta: 0.1, for: 0.05 } },
];
const LIMIAR_MED = 0.3;
function posicoes(lista) {
  const AR = ['rem', 'pas', 'tec', 'def', 'for', 'sta'];
  const ok = lista.filter((c) => AR.every((a) => c.stats[a] != null));
  if (ok.length < 3) return;
  const est = Object.fromEntries(AR.map((a) => {
    const v = ok.map((c) => c.stats[a]); const m = v.reduce((x, y) => x + y, 0) / v.length;
    return [a, { m, dp: Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length) || 1 }];
  }));
  for (const c of ok) {
    const z = Object.fromEntries(AR.map((a) => [a, (c.stats[a] - est[a].m) / est[a].dp]));
    const mz = AR.reduce((s, a) => s + z[a], 0) / AR.length;
    const sc = Object.fromEntries(POSICOES.map((P) => [P.k, Object.entries(P.pesos).reduce((s, [a, w]) => s + (z[a] - mz) * w, 0)]));
    const d = sc.AVA - sc.DEF;
    c.posicao = (sc.MED >= sc.AVA && sc.MED >= sc.DEF) || Math.abs(d) < LIMIAR_MED ? 'MED' : d > 0 ? 'AVA' : 'DEF';
  }
}

export function tier(ov) {
  if (ov == null) return 'sem';
  if (ov >= 80) return 'ouro-raro';
  if (ov >= 70) return 'ouro';
  if (ov >= 60) return 'prata';
  return 'bronze';
}

// Gera equipas equilibradas testando todas as divisões (126 com 10 jogadores).
// anteriores: [[brancos],[pretos]] de jogos passados (penaliza repetir).
// restr (opcional): { separar: [[a,b]], juntar: [[a,b,c]], cor: { id: 'B'|'P' } } — regras obrigatórias.
// Devolve A = Brancos, B = Pretos.
export function gerarEquipas(ids, cartas, anteriores = [], top = 3, restr = {}) {
  const N = ids.length, metade = Math.floor(N / 2);
  if (N < 2) return [];
  const { separar = [], juntar = [], cor = {} } = restr;
  // O GR não conta para equilibrar (decisão do Rui, 14/10): overall recalculado sem a área GR
  // (mantendo ajustes feitos ao overall, como a forma/Elo).
  const semGR = AREAS.filter((a) => a.k !== 'gr');
  const ovSemGR = (c) => {
    if (!c || c.overall == null) return 60;
    let s = 0, p = 0;
    for (const a of semGR) if (c.stats[a.k] != null) { s += c.stats[a.k] * a.peso; p += a.peso; }
    return p ? c.overall - (overallDe(c.stats) ?? c.overall) + (s / p) * 10 : c.overall;
  };
  const val = (id, k) => (k === 'ov' ? ovSemGR(cartas[id]) : (cartas[id]?.stats[k] ?? 6) * 10);
  const somar = (eq, k) => eq.reduce((s, id) => s + val(id, k), 0);
  const ok = (A, B) => {
    const sA = new Set(A);
    if (separar.some(([a, b]) => sA.has(a) === sA.has(b))) return false;
    if (juntar.some((g) => g.some((x) => sA.has(x) !== sA.has(g[0])))) return false;
    return Object.entries(cor).every(([id, c]) => (c === 'B') === sA.has(id));
  };
  const res = [];
  const avaliar = (A0) => {
    const B0 = ids.filter((x) => !A0.includes(x));
    // ids[0] fica sempre do mesmo lado para não repetir divisões; as cores decidem-se aqui.
    const [A, B] = ok(A0, B0) ? [A0, B0] : ok(B0, A0) ? [B0, A0] : [null, null];
    if (!A) return;
    let custo = 3 * Math.abs(somar(A, 'ov') - somar(B, 'ov'));
    for (const a of semGR) custo += 0.5 * Math.abs(somar(A, a.k) - somar(B, a.k));
    for (const [pa, pb] of anteriores) {
      const sA = new Set(A);
      if (Math.max(pa.filter((x) => sA.has(x)).length, pb.filter((x) => sA.has(x)).length) === metade) custo += 40;
    }
    res.push({ A, B, custo, ovA: somar(A, 'ov') / A.length, ovB: somar(B, 'ov') / B.length });
  };
  const rec = (start, esc) => {
    if (esc.length === metade - 1) return avaliar([ids[0], ...esc]);
    for (let i = start; i < N; i++) rec(i + 1, [...esc, ids[i]]);
  };
  rec(1, []);
  res.sort((a, b) => a.custo - b.custo);
  return res.slice(0, top);
}

// Resultado de um jogo: placar dado à mão (fechar jogo) ou contado pelos golos registados.
// vencedor: 'B' | 'P' | 'E' — num jogo fechado sem golos conta só quem ganhou.
export const placarDe = (j) => j.placar || { B: (j.eventos || []).filter((x) => x.equipa === 'B').length, P: (j.eventos || []).filter((x) => x.equipa === 'P').length };
export const vencedorDe = (j) => { if (j.vencedor) return j.vencedor; const p = placarDe(j); return p.B > p.P ? 'B' : p.B < p.P ? 'P' : 'E'; };
// O que mostrar no lugar dos golos: número, ou V/E/D num jogo fechado sem golos.
export const marcaDe = (j, e) => (j.semGolos ? (vencedorDe(j) === 'E' ? 'E' : vencedorDe(j) === e ? 'V' : 'D') : placarDe(j)[e]);

// ---------- Elo de equipa ("forma") ----------
// Ponto de partida = a carta (10 pontos de overall = 100 de Elo). Cada jogo mexe só na "forma" de cada um:
// quem ganha mais do que as cartas previam sobe, quem perde contra o previsto desce. Diferença de golos pesa (log2).
// Desligado por defeito nas equipas: o admin liga no separador Equipas ("Ajustar pela forma").
// O Elo nunca substitui as pontuações: o ajuste ao overall está limitado a maxPct do próprio overall (decisão do Rui, 21/10).
export const ELO = { k: 24, escala: 10, limite: 150, maxPct: 0.10 };
// Pontos de overall a somar pela forma (com o teto de maxPct). Ex.: carta 70, forma +150 → +7 (e não +15).
export const ajusteElo = (overall, forma) => {
  if (overall == null || !forma) return 0;
  const teto = ELO.maxPct * overall;
  return Math.max(-teto, Math.min(teto, forma / ELO.escala));
};

// jogos: [{fase:'fim', inicioEpoch, brancos:[{id,nome}], pretos:[...], eventos:[{equipa}]}] (formato do relógio/marcador)
export function calcularElo(jogos, cartas = {}) {
  const F = {};
  const base = (id) => 1000 + ((cartas[id]?.overall ?? 60) - 60) * ELO.escala;
  const lin = (p) => (F[p.id] ||= { id: p.id, nome: p.nome, forma: 0, jogos: 0, ultimo: 0 });
  const ord = jogos.filter((j) => j?.fase === 'fim' && j.brancos?.length && j.pretos?.length)
    .sort((a, b) => (a.inicioEpoch || 0) - (b.inicioEpoch || 0));
  for (const j of ord) {
    const B = j.brancos.map(lin), P = j.pretos.map(lin);
    const media = (eq) => eq.reduce((s, x) => s + base(x.id) + x.forma, 0) / eq.length;
    const esperado = 1 / (1 + 10 ** ((media(P) - media(B)) / 400));
    const { B: gB, P: gP } = placarDe(j), v = vencedorDe(j);
    const real = v === 'B' ? 1 : v === 'E' ? 0.5 : 0;
    const d = ELO.k * Math.max(1, Math.log2(Math.abs(gB - gP) + 1)) * (real - esperado);
    const mexer = (x, v) => { x.forma = Math.max(-ELO.limite, Math.min(ELO.limite, x.forma + v)); x.jogos++; x.ultimo = v; };
    B.forEach((x) => mexer(x, d)); P.forEach((x) => mexer(x, -d));
  }
  for (const x of Object.values(F)) x.elo = Math.round(base(x.id) + x.forma);
  return F;
}

// Cartas com o overall corrigido pela forma (para gerar equipas), no máximo ±maxPct. Não mexe nas áreas.
export function aplicarForma(cartas, elo) {
  const out = {};
  for (const [id, c] of Object.entries(cartas)) {
    const f = elo[id]?.forma || 0;
    out[id] = c.overall == null || !f ? c : { ...c, overall: Math.round(c.overall + ajusteElo(c.overall, f)) };
  }
  return out;
}
