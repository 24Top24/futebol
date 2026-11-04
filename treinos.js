// Treinos do relógio de cada jogador: lê ficheiros .FIT (Garmin, Coros, Suunto, Wahoo, HealthFit…), .TCX (Garmin, Fitbit)
// e .GPX (Strava — Apple Watch, Wear OS, Samsung, Pixel…) no próprio browser e tira o resumo.
// O ficheiro nunca sai do telemóvel/PC: só o resumo, a FC de 30 em 30 s e a pista (GPS e velocidade) vão para a base de dados,
// em saude/{id}/treinos, que só o próprio e o admin leem.

const FIT_EPOCH = 631065600; // 31/12/1989 em segundos Unix (o "zero" dos ficheiros FIT)

// ---------- FIT (binário) ----------
// Latitude e longitude vêm em "semicírculos" (inteiro de 32 bits com sinal; o leitor lê sem sinal).
const semi = (x) => (x == null ? null : (x | 0) * (180 / 2 ** 31));

// Só lê o que interessa: mensagem 20 (record: hora, FC, distância, posição, velocidade) e 18 (session: totais do treino).
export function lerFIT(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 14 || String.fromCharCode(...new Uint8Array(buf, 8, 4)) !== '.FIT') throw new Error('Não é um ficheiro FIT');
  const hs = dv.getUint8(0);
  const fim = Math.min(buf.byteLength, hs + dv.getUint32(4, true));
  const defs = {}, pontos = [];
  let p = hs, ultimoTs = 0, sessao = null;

  const lerCampos = (d) => {
    const v = {};
    for (const [f, t] of d.campos) {
      let x = null;
      if (t === 1) { x = dv.getUint8(p); if (x === 0xff) x = null; }
      else if (t === 2) { x = dv.getUint16(p, d.le); if (x === 0xffff) x = null; }
      else if (t === 4) { x = dv.getUint32(p, d.le); if (x === 0xffffffff || x === 0x7fffffff) x = null; }
      v[f] = x; p += t;
    }
    p += d.dev;   // campos de programador (apps Connect IQ): saltam-se
    return v;
  };
  const tratar = (num, v) => {
    if (num === 20 && v[253] != null) pontos.push({ t: (v[253] + FIT_EPOCH) * 1000, hr: v[3] || null, d: v[5] != null ? v[5] / 100 : null,
      lat: semi(v[0]), lon: semi(v[1]), v: (v[73] ?? v[6]) != null ? (v[73] ?? v[6]) / 1000 : null });
    if (num === 18 && !sessao) sessao = {
      inicio: v[2] != null ? (v[2] + FIT_EPOCH) * 1000 : null,
      dur: v[8] != null ? v[8] / 1000 : v[7] != null ? v[7] / 1000 : null,
      kcal: v[11], km: v[9] != null ? v[9] / 100000 : null, fcMed: v[16], fcMax: v[17],
    };
  };

  while (p < fim) {
    const h = dv.getUint8(p++);
    if (h & 0x80) {                       // cabeçalho com hora comprimida
      const d = defs[(h >> 5) & 3];
      if (!d) throw new Error('Ficheiro FIT inválido');
      const off = h & 0x1f;
      let ts = (ultimoTs & ~0x1f) + off;
      if (off < (ultimoTs & 0x1f)) ts += 0x20;
      ultimoTs = ts;
      const v = lerCampos(d); v[253] ??= ts; tratar(d.num, v);
    } else if (h & 0x40) {                // mensagem de definição
      const le = dv.getUint8(p + 1) === 0, num = dv.getUint16(p + 2, le), n = dv.getUint8(p + 4);
      p += 5;
      const campos = [];
      for (let i = 0; i < n; i++, p += 3) campos.push([dv.getUint8(p), dv.getUint8(p + 1)]);
      let dev = 0;
      if (h & 0x20) { const nd = dv.getUint8(p++); for (let i = 0; i < nd; i++, p += 3) dev += dv.getUint8(p + 1); }
      defs[h & 0x0f] = { num, le, campos, dev };
    } else {                              // mensagem de dados
      const d = defs[h & 0x0f];
      if (!d) throw new Error('Ficheiro FIT inválido');
      const v = lerCampos(d);
      if (v[253] != null) ultimoTs = v[253];
      tratar(d.num, v);
    }
  }
  return resumir(pontos, sessao, 'fit');
}

// ---------- TCX / GPX (XML) ----------
const filhos = (el, nome) => [...el.getElementsByTagNameNS('*', nome)];
const txt = (el, nome) => filhos(el, nome)[0]?.textContent;
const num = (x) => (x == null || x === '' || isNaN(Number(x)) ? null : Number(x));

export function lerTCX(texto) {
  const x = new DOMParser().parseFromString(texto, 'application/xml');
  const voltas = filhos(x, 'Lap');
  if (!voltas.length) throw new Error('Não é um ficheiro TCX');
  const pontos = filhos(x, 'Trackpoint').map((tp) => {
    const hr = [...tp.children].find((c) => c.localName === 'HeartRateBpm');
    const d = [...tp.children].find((c) => c.localName === 'DistanceMeters');
    return { t: Date.parse(txt(tp, 'Time')), hr: hr ? num(txt(hr, 'Value')) : null, d: d ? num(d.textContent) : null,
      lat: num(txt(tp, 'LatitudeDegrees')), lon: num(txt(tp, 'LongitudeDegrees')) };
  }).filter((q) => !isNaN(q.t));
  const soma = (k) => voltas.reduce((s, v) => s + (num([...v.children].find((c) => c.localName === k)?.textContent) || 0), 0);
  const dur = soma('TotalTimeSeconds');
  const medias = voltas.map((v) => [num(txt([...v.children].find((c) => c.localName === 'AverageHeartRateBpm') || v, 'Value')), num([...v.children].find((c) => c.localName === 'TotalTimeSeconds')?.textContent) || 0]);
  const comMedia = medias.filter(([m]) => m);
  const maxs = voltas.map((v) => num(txt([...v.children].find((c) => c.localName === 'MaximumHeartRateBpm') || v, 'Value'))).filter(Boolean);
  return resumir(pontos, {
    inicio: Date.parse(voltas[0].getAttribute('StartTime')) || null,
    dur: dur || null, kcal: soma('Calories') || null, km: soma('DistanceMeters') / 1000 || null,
    fcMed: comMedia.length ? Math.round(comMedia.reduce((s, [m, t]) => s + m * (t || 1), 0) / comMedia.reduce((s, [, t]) => s + (t || 1), 0)) : null,
    fcMax: maxs.length ? Math.max(...maxs) : null,
  }, 'tcx');
}

export function lerGPX(texto) {
  const x = new DOMParser().parseFromString(texto, 'application/xml');
  const pts = filhos(x, 'trkpt');
  if (!pts.length) throw new Error('Não é um ficheiro GPX com percurso');
  let d = 0, ant = null;
  const pontos = pts.map((tp) => {
    const lat = num(tp.getAttribute('lat')), lon = num(tp.getAttribute('lon'));
    if (ant && lat != null && lon != null) d += distancia(ant, [lat, lon]);
    if (lat != null && lon != null) ant = [lat, lon];
    return { t: Date.parse(txt(tp, 'time')), hr: num(txt(tp, 'hr')), d, lat, lon };
  }).filter((q) => !isNaN(q.t));
  return resumir(pontos, null, 'gpx');
}

// Distância em metros entre dois pontos GPS (fórmula de haversine).
function distancia([a1, o1], [a2, o2]) {
  const R = 6371000, r = Math.PI / 180;
  const h = Math.sin(((a2 - a1) * r) / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(((o2 - o1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Resumo comum: totais do relógio quando existem, senão contas a partir dos pontos. FC de 30 em 30 s (média de cada bloco).
export function resumir(pontos, s, origem) {
  pontos = pontos.filter((q) => q.t).sort((a, b) => a.t - b.t);
  if (!pontos.length && !s) throw new Error('O ficheiro não tem dados do treino');
  const ini = s?.inicio || pontos[0]?.t || null;
  const hrs = pontos.filter((q) => q.hr > 30 && q.hr < 240);
  const fc = [];
  if (ini && hrs.length) {
    for (const q of hrs) { const i = Math.floor((q.t - ini) / 30000); if (i >= 0 && i < 600) (fc[i] ||= []).push(q.hr); }
    for (let i = 0; i < fc.length; i++) fc[i] = fc[i] ? Math.round(fc[i].reduce((a, b) => a + b, 0) / fc[i].length) : null;
  }
  const ultD = [...pontos].reverse().find((q) => q.d != null)?.d;
  const dur = s?.dur || (pontos.length > 1 ? (pontos.at(-1).t - pontos[0].t) / 1000 : null);
  return {
    origem, inicio: ini,
    dur: dur ? Math.round(dur) : null,
    fcMed: s?.fcMed || (hrs.length ? Math.round(hrs.reduce((a, q) => a + q.hr, 0) / hrs.length) : null),
    fcMax: s?.fcMax || (hrs.length ? Math.max(...hrs.map((q) => q.hr)) : null),
    kcal: s?.kcal || null,
    km: s?.km != null ? Math.round(s.km * 100) / 100 : ultD ? Math.round(ultD / 10) / 100 : null,
    fc, pista: pistaDe(pontos, ini),
  };
}

// Pista do treino: [[s desde o início, lat, lon, m/s], ...], no máximo de segundo a segundo. Vai em texto, porque o Firestore não
// aceita listas dentro de listas; 1 h são ~120 KB. Sem GPS nem velocidade (treino em pavilhão, por exemplo) fica null.
function pistaDe(pontos, ini) {
  const out = [];
  for (const q of pontos) {
    const s = Math.round((q.t - ini) / 1000), temPos = q.lat != null && q.lon != null;
    if (s < 0 || (!temPos && q.v == null) || (out.length && s <= out.at(-1)[0])) continue;
    out.push([s, temPos ? Math.round(q.lat * 1e6) / 1e6 : null, temPos ? Math.round(q.lon * 1e6) / 1e6 : null, q.v != null ? Math.round(q.v * 100) / 100 : null]);
  }
  return out.length >= 10 ? JSON.stringify(out) : null;
}
const pistaLida = (t) => { try { return t?.pista ? JSON.parse(t.pista) : []; } catch { return []; } };
export const temGpsPista = (t) => pistaLida(t).some((p) => p[1] != null);

// Treino ligado a um jogo, no formato do fit da app do relógio, para contar nos mesmos cartões (tempo em ms desde o apito).
// O GPS vai em metros a partir do centro da própria pista (fica sem a localização) e de segundo a segundo: há relógios que só gravam
// um ponto de vez em quando (Garmin, "gravação inteligente"), e sem preencher os intervalos curtos as retas contavam menos tempo no mapa.
export function fitDeTreino(t, j) {
  const off = (t.inicio || 0) - (j.inicioEpoch || 0), dur = (j.fimEpoch || 0) - (j.inicioEpoch || 0);
  const noJogo = (ms) => ms >= 0 && (!(dur > 0) || ms <= dur);
  const P = pistaLida(t).map(([s, lat, lon, v]) => [s * 1000 + off, lat, lon, v]).filter((p) => noJogo(p[0]));
  const G = P.filter((p) => p[1] != null);
  const fit = { v: 2, calorias: t.kcal ?? null, distancia: t.km ? t.km * 1000 : null, hr: [], treino: true };
  // A FC vem em blocos de 30 s; a conta das zonas (resumoFC) quer pontos de 5 s no máximo.
  (t.fc || []).forEach((bpm, i) => { if (bpm) for (let k = 0; k < 6; k++) { const ms = off + i * 30000 + k * 5000; if (ms > 0 && noJogo(ms)) fit.hr.push([ms, bpm]); } });
  if (G.length) {
    const lat0 = G.reduce((a, p) => a + p[1], 0) / G.length, lon0 = G.reduce((a, p) => a + p[2], 0) / G.length;
    const K = 6371000 * Math.PI / 180, kx = K * Math.cos(lat0 * Math.PI / 180);
    const xy = G.map(([ms, lat, lon]) => [ms, (lon - lon0) * kx, (lat - lat0) * K]);
    const gps = [], serie = [];
    xy.forEach((a, i) => {
      gps.push([a[0], a[1], a[2], null]);
      const b = xy[i + 1], gap = b ? (b[0] - a[0]) / 1000 : 0;
      if (b && gap > 1 && gap <= 10) for (let k = 1; k < gap; k++) gps.push([a[0] + k * 1000, a[1] + (b[1] - a[1]) * k / gap, a[2] + (b[2] - a[2]) * k / gap, null]);
      // Sem velocidade do relógio, tira-se das posições (média de 5 pontos, para o ruído do GPS não fazer sprints).
      const de = xy[Math.max(0, i - 2)], ate = xy[Math.min(xy.length - 1, i + 2)], ms = ate[0] - de[0];
      if (ms > 0) serie.push([a[0], Math.hypot(ate[1] - de[1], ate[2] - de[2]) / (ms / 1000)]);
    });
    fit.gps = gps; fit.gpsXY = true; fit.gpsRef = 'treino';
    if (!P.some((p) => p[3] != null)) fit.serie1s = serie;
  }
  if (P.some((p) => p[3] != null)) fit.serie1s = P.filter((p) => p[3] != null).map((p) => [p[0], p[3]]);
  return fit;
}

// Escolhe o leitor pela extensão do ficheiro.
export async function lerFicheiro(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'fit') return lerFIT(await file.arrayBuffer());
  if (ext === 'tcx') return lerTCX(await file.text());
  if (ext === 'gpx') return lerGPX(await file.text());
  // Sem extensão conhecida (ficheiros partilhados de outras apps às vezes vêm sem ela): vê o conteúdo.
  const buf = await file.arrayBuffer();
  if (String.fromCharCode(...new Uint8Array(buf, 8, Math.min(4, Math.max(0, buf.byteLength - 8)))) === '.FIT') return lerFIT(buf);
  const txt = new TextDecoder().decode(buf.slice(0, 4000));
  if (/<TrainingCenterDatabase/i.test(txt)) return lerTCX(new TextDecoder().decode(buf));
  if (/<gpx[\s>]/i.test(txt)) return lerGPX(new TextDecoder().decode(buf));
  throw new Error('Formato não suportado (usa .FIT, .TCX ou .GPX)');
}

// ---------- Contas de esforço ----------
// FC máxima teórica pela idade (Tanaka: 208 − 0,7 × idade) — mais certa do que 220 − idade.
export const fcMaxIdade = (idade) => (idade ? Math.round(208 - 0.7 * idade) : null);

// Zonas de esforço (% do tempo). Com FC de repouso usa a reserva cardíaca (Karvonen); sem ela, % da FC máxima.
export const ZONAS = ['Z1 leve', 'Z2 moderado', 'Z3 aeróbio', 'Z4 limiar', 'Z5 máximo'];
export function zonas(fc, fcMax, fcRep) {
  const v = (fc || []).filter((x) => x);
  if (!v.length || !fcMax) return null;
  const z = [0, 0, 0, 0, 0];
  for (const hr of v) {
    const r = fcRep ? (hr - fcRep) / (fcMax - fcRep) : hr / fcMax;
    z[r < 0.6 ? 0 : r < 0.7 ? 1 : r < 0.8 ? 2 : r < 0.9 ? 3 : 4]++;
  }
  return z.map((n) => Math.round((n / v.length) * 100));
}

// Médias e totais dos treinos (só os que têm cada valor).
export function mediasTreinos(treinos) {
  const m = (k) => { const v = treinos.map((t) => t[k]).filter((x) => x != null && x !== ''); return v.length ? v.reduce((a, b) => a + Number(b), 0) / v.length : null; };
  const s = (k) => treinos.reduce((a, t) => a + (Number(t[k]) || 0), 0);
  return { n: treinos.length, dur: m('dur'), fcMed: m('fcMed'), fcMax: m('fcMax'), kcal: m('kcal'), km: m('km'), kmTotal: s('km'), kcalTotal: s('kcal'), sensacao: m('sensacao'), sono: m('sono') };
}

// Idade a partir do ano de nascimento (aproximada ao ano).
export const idadeDe = (ano) => (ano ? new Date().getFullYear() - Number(ano) : null);
