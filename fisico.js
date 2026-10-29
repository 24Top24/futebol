// Dados físicos de um jogo a partir do que o relógio envia (fit): velocidade, zonas, sprints, campo e heatmap.
// Só cálculos — nada aqui lê nem grava na base de dados. Funciona com o formato de hoje (bins de 5 s: passos)
// e com o formato novo do relógio (fit.v = 2: serie1s, vMax, sprints, gps — ver watch/ANALISE-SENSORES.md).
// Decisão do Rui (28/10): só relógio; jogar com o telemóvel no bolso não existe.

export const LIM_KMH = [2, 7, 13, 18];                 // parado · andar · trote · corrida · sprint
export const ZONAS_VEL = ['Parado', 'A andar', 'Trote', 'Corrida', 'Sprint'];
const KMH = 3.6;
const VMAX_REAL = 32 / KMH;                             // acima de 32 km/h num jogo amador é erro do sensor
const SPRINT_MIN_KMH = 18, SPRINT_MIN_MS = 1500, SPRINT_JUNTA_MS = 1000;

// Série de velocidade [[t_ms, m/s, dt_ms]] — a do relógio (1 s) ou, nos jogos antigos, a dos bins de 5 s
// (cadência × passada calibrada, a mesma conta do ecrã de esforço).
export function serieVelocidade(fit = {}) {
  if (Array.isArray(fit.serie1s) && fit.serie1s.length) {
    return fit.serie1s.map((x, i, s) => [x[0], Math.max(0, x[1] || 0), i ? Math.min(5000, x[0] - s[i - 1][0]) || 1000 : 1000]);
  }
  const bins = fit.bins || [];
  const a = fit.calib?.a ?? -0.385, b = fit.calib?.b ?? 0.0105;
  const passada = (cad) => Math.max(0.45, Math.min(2.2, a + b * cad));
  return bins.map((x) => { const cad = (x[1] || 0) * 12; return [x[0], x[1] ? (x[1] * passada(cad)) / 5 : 0, 5000]; });
}

// Intervalos [de, até] (ms desde o início do jogo) em que o jogador esteve na baliza — ficam fora dos sprints.
export const naBaliza = (j, pid) => (j?.turnos || []).filter((t) => t.jogador === pid).map((t) => [t.de, t.ate]);
const dentro = (t, ints) => ints.some(([a, b]) => t >= a && t < b);

// Velocidade máxima: o melhor da média de 3 s (nunca de um passo isolado); valores irreais são descartados.
export function velMax(serie, janelaMs = 3000) {
  let melhor = null;
  for (let i = 0; i < serie.length; i++) {
    let m = 0, ms = 0;
    for (let k = i; k < serie.length && ms < janelaMs; k++) { m += serie[k][1] * serie[k][2]; ms += serie[k][2]; }
    if (ms < janelaMs && serie[i][2] < janelaMs) continue;   // janela incompleta no fim da série
    const v = m / ms;
    if (v <= VMAX_REAL && (!melhor || v > melhor.v)) melhor = { v, t: serie[i][0] };
  }
  return melhor ? { kmh: Math.round(melhor.v * KMH * 10) / 10, t: melhor.t } : null;
}

// Tempo e metros em cada zona de velocidade.
export function zonasVelocidade(serie, lim = LIM_KMH) {
  const Z = ZONAS_VEL.map((n) => ({ n, ms: 0, m: 0 }));
  for (const [, v, dt] of serie) {
    const k = lim.reduce((acc, l, i) => (v * KMH >= l ? i + 1 : acc), 0);
    Z[k].ms += dt; Z[k].m += v * dt / 1000;
  }
  return Z;
}
export const distancia = (serie) => serie.reduce((s, [, v, dt]) => s + v * dt / 1000, 0);

// Sprints: acima do limiar durante ≥ 1,5 s (com bins de 5 s: um bin inteiro); dois sprints separados por < 1 s contam como um.
// Limiar = 18 km/h, ou 85 % da máxima pessoal se for mais baixa (nunca abaixo de 14 km/h). Fora da baliza.
export function sprints(serie, { vmaxPessoal = null, baliza = [] } = {}) {
  const lim = Math.max(14, Math.min(SPRINT_MIN_KMH, vmaxPessoal ? vmaxPessoal * 0.85 : SPRINT_MIN_KMH)) / KMH;
  const L = [];
  let cur = null;
  for (const [t, v, dt] of serie) {
    const em = v >= lim && !dentro(t, baliza);
    if (em) {
      if (cur && t - cur.fim <= SPRINT_JUNTA_MS) { cur.fim = t + dt; cur.m += v * dt / 1000; cur.v = Math.max(cur.v, v); }
      else { if (cur) L.push(cur); cur = { t, fim: t + dt, m: v * dt / 1000, v }; }
    }
  }
  if (cur) L.push(cur);
  return L.filter((s) => s.fim - s.t >= SPRINT_MIN_MS)
    .map((s) => ({ t: s.t, dur: s.fim - s.t, m: Math.round(s.m), kmh: Math.round(s.v * KMH * 10) / 10 }));
}

// ---------- Campo e heatmap (precisam de GPS no jogo) ----------
// Dois formatos de fit.gps: [[t, lat, lon, precisão_m, ...]] ou, como o relógio envia (RGPD: sem a localização do pavilhão),
// [[t, x_m, y_m, precisão_m, vel, rumo, nSat]] em metros a partir de uma origem fixa que fica só no relógio (fit.gpsXY = true,
// fit.gpsRef = id dessa origem — só se juntam pontos com a mesma origem).
// Num pavilhão coberto o GPS pode não prestar: os pontos com precisão pior que GPS_MAX_M são deitados fora, e se
// sobrar pouco o heatmap não aparece (melhor nada do que um desenho inventado).
export const GPS_MAX_M = 8;
const R = 6371000, rad = Math.PI / 180;
const bons = (gps = []) => gps.filter((p) => p && p[1] != null && p[2] != null && (p[3] == null || p[3] <= GPS_MAX_M));
const plano = (lat0, lon0) => ([, lat, lon]) => [(lon - lon0) * rad * R * Math.cos(lat0 * rad), (lat - lat0) * rad * R];
const proj = (campo) => (campo.xy ? (p) => [p[1] - campo.cx, p[2] - campo.cy] : plano(campo.lat0, campo.lon0));
const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

// Retângulo do campo a partir de uma nuvem de pontos (vários jogos e jogadores juntos): o eixo maior pela
// análise de componentes principais e os limites pelos percentis 2–98 (corta os saltos do GPS).
// balnearios (opcional) = um ponto do lado dos balneários ([lat, lon] ou [x, y] no formato em metros), para saber qual das pontas é qual.
export function campoDeNuvem(gps, balnearios = null, { xy: emMetros = false, ref = null } = {}) {
  const P = bons(gps);
  if (P.length < 300) return null;
  const m1 = P.reduce((s, p) => s + p[1], 0) / P.length, m2 = P.reduce((s, p) => s + p[2], 0) / P.length;
  const base = emMetros ? { xy: true, cx: m1, cy: m2, ref } : { lat0: m1, lon0: m2 };
  const xy = P.map(proj(base));
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of xy) { sxx += x * x; syy += y * y; sxy += x * y; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);   // direção do eixo maior
  const c = Math.cos(ang), s = Math.sin(ang);
  const u = xy.map(([x, y]) => x * c + y * s), v = xy.map(([x, y]) => -x * s + y * c);
  const u0 = pct(u, 0.02), u1 = pct(u, 0.98), v0 = pct(v, 0.02), v1 = pct(v, 0.98);
  const campo = { ...base, ang, u0, u1, v0, v1, comp: Math.round((u1 - u0) * 10) / 10, larg: Math.round((v1 - v0) * 10) / 10, n: P.length, sinal: null };
  if (balnearios) { const [bu] = paraCampo(campo, [0, balnearios[0], balnearios[1]]); campo.sinal = bu < 0.5 ? -1 : 1; }
  return campo;
}

// Posição no campo de 0 a 1: u ao comprimento (0 = ponta dos balneários se o campo souber qual é), v à largura.
export function paraCampo(campo, p) {
  const [x, y] = proj(campo)(p);
  const c = Math.cos(campo.ang), s = Math.sin(campo.ang);
  let u = ((x * c + y * s) - campo.u0) / (campo.u1 - campo.u0), v = ((-x * s + y * c) - campo.v0) / (campo.v1 - campo.v0);
  if (campo.sinal === 1) { u = 1 - u; v = 1 - v; }
  return [u, v];
}

// Heatmap em grelha agregada (decisão do Rui, 28/10): NX × NY células com os segundos em cada uma.
// Orientado pela equipa: x = 0 é a baliza que o jogador defende, x = 1 a que ataca (o lado de início não muda — não há troca de campo).
// defendeBalnearios: true se a equipa do jogador começou do lado dos balneários (jogo.ladoInicio). Sem saber, fica como está.
export const NX = 8, NY = 4;
export function grelhaHeatmap(gps, campo, { defendeBalnearios = null, baliza = [] } = {}) {
  const P = bons(gps);
  if (!campo || P.length < 120) return null;
  const g = Array.from({ length: NY }, () => Array(NX).fill(0));
  const virar = campo.sinal != null && defendeBalnearios === false;
  let usados = 0;
  for (let i = 0; i < P.length; i++) {
    if (dentro(P[i][0], baliza)) continue;   // na baliza não conta (senão o heatmap de todos fica com uma mancha na baliza)
    let [u, v] = paraCampo(campo, P[i]);
    if (u < -0.1 || u > 1.1 || v < -0.15 || v > 1.15) continue;
    if (virar) { u = 1 - u; v = 1 - v; }
    const dt = i ? Math.min(2000, Math.max(0, P[i][0] - P[i - 1][0])) : 1000;
    g[Math.min(NY - 1, Math.max(0, Math.floor(v * NY)))][Math.min(NX - 1, Math.max(0, Math.floor(u * NX)))] += dt / 1000;
    usados++;
  }
  if (usados < 120) return null;
  return { nx: NX, ny: NY, s: g.map((l) => l.map((x) => Math.round(x))), orientado: campo.sinal != null && defendeBalnearios != null };
}

// Soma de várias grelhas (época, últimos N jogos).
export function somarGrelhas(gs) {
  const ok = gs.filter(Boolean);
  if (!ok.length) return null;
  const s = Array.from({ length: NY }, (_, y) => Array.from({ length: NX }, (__, x) => ok.reduce((t, g) => t + (g.s[y]?.[x] || 0), 0)));
  return { nx: NX, ny: NY, s, orientado: ok.every((g) => g.orientado), jogos: ok.length };
}

// Percentagem do tempo em cada terço (defesa · meio · ataque) — útil mesmo com a grelha pequena.
export function tercos(gr) {
  if (!gr) return null;
  const col = Array.from({ length: gr.nx }, (_, x) => gr.s.reduce((t, l) => t + l[x], 0));
  const tot = col.reduce((a, b) => a + b, 0) || 1;
  const parte = (a, b) => Math.round(col.slice(a, b).reduce((x, y) => x + y, 0) / tot * 100);
  const t = Math.round(gr.nx / 3);
  return { def: parte(0, t), meio: parte(t, gr.nx - t), ata: parte(gr.nx - t, gr.nx) };
}

// Resumo físico compacto de um jogador num jogo (o que vai para minhacarta/{id}.fisico — só o próprio e o admin leem).
export function resumoFisico(j, fit, pid, { campo = null, vmaxPessoal = null } = {}) {
  if (!fit) return null;
  const serie = serieVelocidade(fit);
  if (!serie.length && !(fit.gps || []).length) return null;
  const bal = naBaliza(j, pid);
  const eq = (j.brancos || []).some((x) => x.id === pid) ? 'B' : 'P';
  const ladoB = j.ladoInicio?.B;   // 'balnearios' | 'oposto'
  const defendeBalnearios = ladoB ? (eq === 'B') === (ladoB === 'balnearios') : null;
  const vm = fit.vMax?.v ? { kmh: Math.round(fit.vMax.v * KMH * 10) / 10, t: fit.vMax.t } : velMax(serie);
  const sp = Array.isArray(fit.sprints) ? fit.sprints.filter((s) => !dentro(s.t, bal)).map((s) => ({ t: s.t, dur: s.dur, m: Math.round(s.m || 0), kmh: Math.round((s.vMax || 0) * KMH * 10) / 10, sentido: s.sentido || null }))
    : sprints(serie, { vmaxPessoal, baliza: bal });
  const z = zonasVelocidade(serie);
  return {
    v: fit.v || 1, m: Math.round(distancia(serie)), vmax: vm, sprints: sp, nSprints: sp.length, mSprint: sp.reduce((s, x) => s + x.m, 0),
    zonas: z.map((x) => [Math.round(x.ms / 1000), Math.round(x.m)]),
    grelha: fit.gps && campo && !!fit.gpsXY === !!campo.xy && (campo.ref || null) === (fit.gpsRef || null)
      ? grelhaHeatmap(fit.gps, campo, { defendeBalnearios, baliza: bal }) : null,
    precisao: fit.calib?.metodo || ((fit.calib?.pontos || []).length >= 2 ? 'gps' : 'altura'),
  };
}
