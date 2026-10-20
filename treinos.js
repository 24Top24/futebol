// Treinos do relógio de cada jogador: lê ficheiros .FIT (Garmin, Coros, Suunto, Wahoo, HealthFit…), .TCX (Garmin, Fitbit)
// e .GPX (Strava — Apple Watch, Wear OS, Samsung, Pixel…) no próprio browser e tira o resumo.
// O ficheiro nunca sai do telemóvel/PC: só o resumo e a FC de 30 em 30 s vão para a base de dados.

const FIT_EPOCH = 631065600; // 31/12/1989 em segundos Unix (o "zero" dos ficheiros FIT)

// ---------- FIT (binário) ----------
// Só lê o que interessa: mensagem 20 (record: hora, FC, distância) e 18 (session: totais do treino).
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
      else if (t === 4) { x = dv.getUint32(p, d.le); if (x === 0xffffffff) x = null; }
      v[f] = x; p += t;
    }
    p += d.dev;   // campos de programador (apps Connect IQ): saltam-se
    return v;
  };
  const tratar = (num, v) => {
    if (num === 20 && v[253] != null) pontos.push({ t: (v[253] + FIT_EPOCH) * 1000, hr: v[3] || null, d: v[5] != null ? v[5] / 100 : null });
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
    return { t: Date.parse(txt(tp, 'Time')), hr: hr ? num(txt(hr, 'Value')) : null, d: d ? num(d.textContent) : null };
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
    return { t: Date.parse(txt(tp, 'time')), hr: num(txt(tp, 'hr')), d };
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
    fc,
  };
}

// Escolhe o leitor pela extensão do ficheiro.
export async function lerFicheiro(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'fit') return lerFIT(await file.arrayBuffer());
  if (ext === 'tcx') return lerTCX(await file.text());
  if (ext === 'gpx') return lerGPX(await file.text());
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
