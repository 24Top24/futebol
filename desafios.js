// Desafios por jogo (pedido do Rui, 29/10/2026): cada convocado recebe 1 a 3 desafios para esse jogo, e cada jogador
// tem 1 desafio pessoal para o mês. Só cálculos — quem grava é a app (ao escolher as equipas: games/{id}.desafios).
// Regras de atribuição (sem repetições):
//  - no mesmo jogo, dois jogadores nunca têm o mesmo desafio;
//  - um desafio dado num jogo não volta a sair a ninguém no jogo seguinte;
//  - o mesmo jogador não repete a "família" (golos, assistências, baliza…) dos seus 2 jogos anteriores,
//    nem um desafio que já teve nos últimos 10 jogos, e nunca tem 2 desafios da mesma família no mesmo jogo;
//  - os ⌚ (relógio) só a quem tem relógio; níveis: 1 fácil, 2 médio, 3 difícil (1 → médio; 2 → fácil+médio ou médio+difícil; 3 → um de cada).
//  - mês: cada jogador ativo tem um desafio diferente dos outros nesse mês e diferente do seu do mês anterior.
// Desafios com {p}: o jogo escolhe um colega ou adversário desse jogo (guarda-se o id em p).
import { linhaJogo, balizaDe, historico } from './conquistas.js?v=3';

const MIN = 60000;
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const idsDe = (eq) => (eq || []).map((x) => x?.id ?? x);
const grSofreu = (j, e) => e.gr || (j.turnos || []).find((x) => x.equipa !== e.equipa && e.t >= x.de && e.t < x.ate)?.jogador;
const golos = (c) => (c.j.eventos || []).filter((e) => e.tipo !== 'autogolo');

// ---------- Base de dados ----------
// Cada desafio: id, fam (família), nv (1–3), ic (ícone), txt, ok(c) → true/false (ou null = sem dados para saber).
// c = { l: linhaJogo, b: balizaDe, f: resumo físico (ou null), j: jogo, pid, p }. rel = precisa de relógio; par = 'colega' | 'adv'.
const D = [];
const add = (fam, ic, lista) => lista.forEach(([id, nv, txt, ok, extra]) => D.push({ id, fam, nv, ic, txt, ok, ...(extra || {}) }));
const fis = (k) => (c) => (c.f ? k(c.f) : null);

// Golos
add('golos', '⚽', [
  ['g1', 1, 'Marca pelo menos 1 golo', (c) => c.l.g >= 1], ['g2', 2, 'Marca 2 golos', (c) => c.l.g >= 2],
  ['g3', 3, 'Faz um hat-trick (3 golos)', (c) => c.l.g >= 3], ['g4', 3, 'Marca 4 golos', (c) => c.l.g >= 4],
  ['g5', 3, 'Marca 5 golos — noite de artilheiro', (c) => c.l.g >= 5],
]);
add('assist', '🎯', [
  ['a1', 1, 'Faz pelo menos 1 assistência', (c) => c.l.a >= 1], ['a2', 2, 'Faz 2 assistências', (c) => c.l.a >= 2],
  ['a3', 3, 'Faz 3 assistências', (c) => c.l.a >= 3], ['a4', 3, 'Faz 4 assistências — o maestro', (c) => c.l.a >= 4],
]);
add('ga', '🔥', [
  ['ga2', 1, 'Participa em 2 golos (golo ou assistência)', (c) => c.l.g + c.l.a >= 2], ['ga3', 2, 'Participa em 3 golos', (c) => c.l.g + c.l.a >= 3],
  ['ga4', 2, 'Participa em 4 golos', (c) => c.l.g + c.l.a >= 4], ['ga5', 3, 'Participa em 5 golos', (c) => c.l.g + c.l.a >= 5],
  ['ga6', 3, 'Participa em 6 golos', (c) => c.l.g + c.l.a >= 6], ['ga8', 3, 'Participa em 8 golos', (c) => c.l.g + c.l.a >= 8],
]);
add('completo', '🧩', [
  ['g1a1', 2, 'Marca e assiste no mesmo jogo', (c) => c.l.g >= 1 && c.l.a >= 1], ['g2a1', 3, 'Marca 2 golos e faz 1 assistência', (c) => c.l.g >= 2 && c.l.a >= 1],
  ['g1a2', 3, 'Marca 1 golo e faz 2 assistências', (c) => c.l.g >= 1 && c.l.a >= 2], ['g2a2', 3, '2 golos e 2 assistências', (c) => c.l.g >= 2 && c.l.a >= 2],
  ['env50', 2, 'Participa em metade dos golos da tua equipa (mín. 2)', (c) => c.l.gm >= 2 && c.l.envolvido >= 0.5],
  ['env-todos', 3, 'Participa em todos os golos da tua equipa (mín. 3)', (c) => c.l.envolvidoTodos],
  ['env33', 1, 'Participa em um terço dos golos da tua equipa (mín. 3)', (c) => c.l.gm >= 3 && c.l.envolvido >= 1 / 3],
]);
// Como marca
add('tecnica', '🦶', [
  ['cab', 3, 'Marca de cabeça', (c) => c.l.cab >= 1], ['pd', 2, 'Marca com o pé direito', (c) => c.l.pd >= 1],
  ['pe', 2, 'Marca com o pé esquerdo', (c) => c.l.pe >= 1], ['2pes', 3, 'Marca com os dois pés', (c) => c.l.pd >= 1 && c.l.pe >= 1],
  ['cab-pe', 3, 'Marca de cabeça e de pé', (c) => c.l.cab >= 1 && c.l.pd + c.l.pe >= 1], ['pd2', 3, '2 golos de pé direito', (c) => c.l.pd >= 2],
  ['pe2', 3, '2 golos de pé esquerdo', (c) => c.l.pe >= 2], ['cab2', 3, '2 golos de cabeça', (c) => c.l.cab >= 2],
]);
// Quando marca
add('momento', '⏱', [
  ['primeiro', 2, 'Marca o primeiro golo do jogo', (c) => c.l.primeiro], ['ultimo', 2, 'Marca o último golo do jogo', (c) => c.l.ultimo],
  ['pri-ult', 3, 'Marca o primeiro e o último golo do jogo', (c) => c.l.primeiro && c.l.ultimo],
  ['cedo3', 3, 'Marca nos primeiros 3 minutos', (c) => c.l.cedo], ['cedo10', 2, 'Marca nos primeiros 10 minutos', (c) => c.l.tminGolo != null && c.l.tminGolo < 10],
  ['cedo20', 1, 'Marca nos primeiros 20 minutos', (c) => c.l.tminGolo != null && c.l.tminGolo < 20],
  ['tarde5', 2, 'Marca nos últimos 5 minutos', (c) => c.l.tarde],
  ['tarde10', 2, 'Marca nos últimos 10 minutos', (c) => { const dur = c.l.durMin * MIN; return dur > 15 * MIN && golos(c).some((e) => e.marcador === c.pid && e.t >= dur - 10 * MIN); }],
  ['1parte', 1, 'Marca na primeira metade do jogo', (c) => { const dur = c.l.durMin * MIN; return golos(c).some((e) => e.marcador === c.pid && e.t < dur / 2); }],
  ['2parte', 1, 'Marca na segunda metade do jogo', (c) => { const dur = c.l.durMin * MIN; return golos(c).some((e) => e.marcador === c.pid && e.t >= dur / 2); }],
  ['2metades', 2, 'Marca nas duas metades do jogo', (c) => { const dur = c.l.durMin * MIN, t = golos(c).filter((e) => e.marcador === c.pid).map((e) => e.t); return t.some((x) => x < dur / 2) && t.some((x) => x >= dur / 2); }],
  ['rapido', 3, 'Marca 2 golos em 3 minutos', (c) => c.l.rapido],
  ['rapido5', 3, 'Marca 2 golos em 5 minutos', (c) => { const t = golos(c).filter((e) => e.marcador === c.pid).map((e) => e.t).sort((a, b) => a - b); return t.some((x, i) => i && x - t[i - 1] <= 5 * MIN); }],
]);
// Golos que contam
add('decisivo', '🏆', [
  ['vitoria', 3, 'Marca o golo da vitória', (c) => c.l.decisivo], ['vit-assist', 3, 'Faz a assistência para o golo da vitória', (c) => c.l.decisivoAssist],
  ['vit-env', 2, 'Participa no golo da vitória (golo ou assistência)', (c) => c.l.decisivo || c.l.decisivoAssist],
  ['empate', 3, 'Marca o golo do empate final', (c) => c.l.empatou], ['reviravolta', 3, 'Marca quando a tua equipa está a perder e acaba a ganhar', (c) => c.l.virou],
  ['empata-jogo', 2, 'Marca um golo que empata o jogo', (c) => { let d = 0; for (const e of [...(c.j.eventos || [])].sort((a, b) => a.t - b.t)) { const a = d; d += e.equipa === c.l.eq ? 1 : -1; if (e.equipa === c.l.eq && e.marcador === c.pid && e.tipo !== 'autogolo' && a === -1) return true; } return false; }],
  ['poe-frente', 2, 'Marca um golo que põe a tua equipa na frente', (c) => { let d = 0; for (const e of [...(c.j.eventos || [])].sort((a, b) => a.t - b.t)) { const a = d; d += e.equipa === c.l.eq ? 1 : -1; if (e.equipa === c.l.eq && e.marcador === c.pid && e.tipo !== 'autogolo' && a === 0) return true; } return false; }],
  ['pen', 2, 'Marca um penálti', (c) => c.l.pen >= 1],
]);
// Resultado
add('resultado', '✅', [
  ['ganhar', 1, 'Ganha o jogo', (c) => c.l.res === 'V'], ['naoperder', 1, 'Não percas o jogo', (c) => c.l.res !== 'D'],
  ['ganhar2', 2, 'Ganha por 2 ou mais golos', (c) => c.l.dif >= 2], ['ganhar3', 2, 'Ganha por 3 ou mais golos', (c) => c.l.dif >= 3],
  ['ganhar5', 3, 'Ganha por 5 ou mais golos', (c) => c.l.dif >= 5], ['ganhar8', 3, 'Ganha por 8 ou mais — goleada', (c) => c.l.dif >= 8],
  ['nunca-atras', 2, 'Ganha sem nunca estar a perder', (c) => c.l.res === 'V' && c.l.pior >= 0],
  ['remontada', 3, 'Estar a perder por 2 e não perder o jogo', (c) => c.l.pior <= -2 && c.l.res !== 'D'],
  ['remontada-v', 3, 'Estar a perder e ganhar o jogo', (c) => c.l.pior < 0 && c.l.res === 'V'],
  ['perto', 2, 'Ganha um jogo renhido (por 1 ou 2 golos)', (c) => c.l.dif >= 1 && c.l.dif <= 2],
]);
add('ataque', '💥', [
  ['eq5', 1, 'A tua equipa marca 5 ou mais', (c) => c.l.gm >= 5], ['eq6', 1, 'A tua equipa marca 6 ou mais', (c) => c.l.gm >= 6],
  ['eq8', 2, 'A tua equipa marca 8 ou mais', (c) => c.l.gm >= 8], ['eq10', 2, 'A tua equipa marca 10 ou mais', (c) => c.l.gm >= 10],
  ['eq12', 3, 'A tua equipa marca 12 ou mais', (c) => c.l.gm >= 12], ['eq15', 3, 'A tua equipa marca 15 ou mais', (c) => c.l.gm >= 15],
  ['eq-mais', 1, 'A tua equipa marca mais do que sofre', (c) => c.l.gm > c.l.gs],
]);
add('defesa', '🛡', [
  ['sofre3', 3, 'A tua equipa sofre 3 ou menos', (c) => c.l.gs <= 3], ['sofre5', 2, 'A tua equipa sofre 5 ou menos', (c) => c.l.gs <= 5],
  ['sofre7', 1, 'A tua equipa sofre 7 ou menos', (c) => c.l.gs <= 7], ['sofre-v4', 3, 'Ganha a sofrer 4 ou menos', (c) => c.l.res === 'V' && c.l.gs <= 4],
  ['sofre-metade', 2, 'A tua equipa sofre menos de metade do que marca (mín. 4 marcados)', (c) => c.l.gm >= 4 && c.l.gs * 2 < c.l.gm],
]);
// Baliza (todos rodam)
add('baliza', '🧤', [
  ['limpo1', 2, 'Um turno na baliza (3+ min) sem sofrer', (c) => c.b.limpos >= 1], ['limpo2', 3, 'Dois turnos na baliza sem sofrer', (c) => c.b.limpos >= 2],
  ['muro4', 1, '4 minutos seguidos na baliza sem sofrer', (c) => c.b.melhor >= 4], ['muro6', 2, '6 minutos seguidos na baliza sem sofrer', (c) => c.b.melhor >= 6],
  ['muro8', 3, '8 minutos seguidos na baliza sem sofrer', (c) => c.b.melhor >= 8], ['muro10', 3, '10 minutos seguidos na baliza sem sofrer', (c) => c.b.melhor >= 10],
  ['gr-sofre1', 2, 'Sofre no máximo 1 golo enquanto estás na baliza', (c) => c.l.minGR > 0 && c.l.sofrGR <= 1],
  ['gr-sofre2', 1, 'Sofre no máximo 2 golos enquanto estás na baliza', (c) => c.l.minGR > 0 && c.l.sofrGR <= 2],
  ['gr-golo', 3, 'Marca um golo enquanto estás na baliza', (c) => c.l.goloGR], ['gr-assist', 3, 'Faz uma assistência enquanto estás na baliza', (c) => c.l.assistGR],
  ['gr-pen', 3, 'Defende um penálti', (c) => c.l.penDef >= 1],
  ['gr-e-golo', 3, 'Marca e faz um turno na baliza sem sofrer', (c) => c.l.g >= 1 && c.b.limpos >= 1],
  ['gr-e-assist', 3, 'Assiste e faz um turno na baliza sem sofrer', (c) => c.l.a >= 1 && c.b.limpos >= 1],
]);
// Combinações com o resultado
add('combo', '⭐', [
  ['g1-v', 2, 'Marca e ganha', (c) => c.l.g >= 1 && c.l.res === 'V'], ['g2-v', 3, 'Marca 2 golos e ganha', (c) => c.l.g >= 2 && c.l.res === 'V'],
  ['a1-v', 2, 'Assiste e ganha', (c) => c.l.a >= 1 && c.l.res === 'V'], ['a2-v', 3, '2 assistências e vitória', (c) => c.l.a >= 2 && c.l.res === 'V'],
  ['ga3-v', 3, 'Participa em 3 golos e ganha', (c) => c.l.g + c.l.a >= 3 && c.l.res === 'V'],
  ['g1-np', 1, 'Marca e não percas', (c) => c.l.g >= 1 && c.l.res !== 'D'], ['a1-np', 1, 'Assiste e não percas', (c) => c.l.a >= 1 && c.l.res !== 'D'],
  ['ga2-np', 2, 'Participa em 2 golos e não percas', (c) => c.l.g + c.l.a >= 2 && c.l.res !== 'D'],
  ['g1-g3', 3, 'Marca e ganha por 3 ou mais', (c) => c.l.g >= 1 && c.l.dif >= 3], ['a1-g3', 3, 'Assiste e ganha por 3 ou mais', (c) => c.l.a >= 1 && c.l.dif >= 3],
  ['muro-v', 3, 'Ganha e faz 5 minutos seguidos na baliza sem sofrer', (c) => c.l.res === 'V' && c.b.melhor >= 5],
  ['pri-v', 3, 'Marca o primeiro golo e ganha', (c) => c.l.primeiro && c.l.res === 'V'],
]);
// Com um colega ou adversário deste jogo ({p})
const doP = (c, f) => golos(c).some((e) => e.equipa === c.l.eq && f(e));
add('dupla', '🤝', [
  ['p-assiste', 2, 'Faz uma assistência ao {p}', (c) => doP(c, (e) => e.assist === c.pid && e.marcador === c.p), { par: 'colega' }],
  ['p-recebe', 2, 'Marca com assistência do {p}', (c) => doP(c, (e) => e.marcador === c.pid && e.assist === c.p), { par: 'colega' }],
  ['p-tabela', 3, 'Tabela com o {p}: tu assistes-lhe e ele assiste-te', (c) => doP(c, (e) => e.assist === c.pid && e.marcador === c.p) && doP(c, (e) => e.marcador === c.pid && e.assist === c.p), { par: 'colega' }],
  ['p-ambos', 2, 'Tu e o {p} marcam os dois', (c) => c.l.g >= 1 && doP(c, (e) => e.marcador === c.p), { par: 'colega' }],
  ['p-env', 1, 'Participa num golo com o {p} (um marca, o outro assiste)', (c) => doP(c, (e) => (e.marcador === c.pid && e.assist === c.p) || (e.marcador === c.p && e.assist === c.pid)), { par: 'colega' }],
  ['p-2', 3, 'Faz 2 golos com o {p} (um marca, o outro assiste)', (c) => golos(c).filter((e) => e.equipa === c.l.eq && ((e.marcador === c.pid && e.assist === c.p) || (e.marcador === c.p && e.assist === c.pid))).length >= 2, { par: 'colega' }],
]);
add('duelo', '⚔️', [
  ['adv-gr', 3, 'Marca ao {p} quando ele estiver na baliza', (c) => golos(c).some((e) => e.marcador === c.pid && grSofreu(c.j, e) === c.p), { par: 'adv' }],
  ['adv-ganha', 1, 'Duelo com o {p}: ganha-lhe', (c) => c.l.res === 'V', { par: 'adv' }],
  ['adv-mais', 2, 'Marca mais golos do que o {p}', (c) => c.l.g > golos(c).filter((e) => e.marcador === c.p).length, { par: 'adv' }],
  ['adv-ga', 2, 'Participa em mais golos do que o {p}', (c) => { const n = (q) => golos(c).filter((e) => e.marcador === q || e.assist === q).length; return n(c.pid) > n(c.p); }, { par: 'adv' }],
  ['adv-zero', 3, 'Não deixes o {p} marcar enquanto estás na baliza', (c) => c.l.minGR > 0 && !golos(c).some((e) => e.marcador === c.p && grSofreu(c.j, e) === c.pid), { par: 'adv' }],
]);
// Relógio
const zAlta = (f) => ((f.zonas?.[3]?.[0] || 0) + (f.zonas?.[4]?.[0] || 0)) / 60;   // min acima de 13 km/h
add('km', '👟', [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map((k, i) => [`km${k}`, i < 2 ? 1 : i < 5 ? 2 : 3, `Corre ${String(k).replace('.', ',')} km`, fis((f) => (f.m || 0) / 1000 >= k), { rel: true }]));
add('vmax', '⚡', [18, 20, 21, 22, 23, 24, 25, 26].map((k, i) => [`vmax${k}`, i < 2 ? 1 : i < 5 ? 2 : 3, `Passa dos ${k} km/h`, fis((f) => (f.vmax?.kmh || 0) >= k), { rel: true }]));
add('sprints', '💨', [4, 6, 8, 10, 12, 15, 18, 20].map((k, i) => [`sp${k}`, i < 2 ? 1 : i < 5 ? 2 : 3, `Faz ${k} sprints`, fis((f) => (f.nSprints || 0) >= k), { rel: true }]));
add('explosao', '🚀', [
  ...[100, 150, 200, 300].map((k, i) => [`msp${k}`, i < 1 ? 1 : i < 3 ? 2 : 3, `Faz ${k} m em sprint`, fis((f) => (f.mSprint || 0) >= k), { rel: true }]),
  ...[3, 5, 8, 10].map((k, i) => [`zalta${k}`, i < 1 ? 1 : i < 3 ? 2 : 3, `${k} minutos acima de 13 km/h`, fis((f) => zAlta(f) >= k), { rel: true }]),
]);
add('fisico-combo', '🏃', [
  ['km3-g', 2, 'Corre 3 km e marca', (c) => (c.f ? (c.f.m || 0) >= 3000 && c.l.g >= 1 : null), { rel: true }],
  ['sp6-a', 2, 'Faz 6 sprints e uma assistência', (c) => (c.f ? (c.f.nSprints || 0) >= 6 && c.l.a >= 1 : null), { rel: true }],
  ['v22-g', 3, 'Passa dos 22 km/h e marca', (c) => (c.f ? (c.f.vmax?.kmh || 0) >= 22 && c.l.g >= 1 : null), { rel: true }],
  ['km4-v', 3, 'Corre 4 km e ganha', (c) => (c.f ? (c.f.m || 0) >= 4000 && c.l.res === 'V' : null), { rel: true }],
  ['sp10-v', 3, 'Faz 10 sprints e ganha', (c) => (c.f ? (c.f.nSprints || 0) >= 10 && c.l.res === 'V' : null), { rel: true }],
]);
// Mais variedade (sobretudo fáceis e médios)
const evOrd = (c) => [...(c.j.eventos || [])].sort((a, b) => a.t - b.t);
const daEquipa = (c) => golos(c).filter((e) => e.equipa === c.l.eq);
const maxSerie = (c, f) => { let n = 0, m = 0; for (const e of evOrd(c)) { n = f(e) ? n + 1 : 0; m = Math.max(m, n); } return m; };
const maxVant = (c) => { let d = 0, m = 0; for (const e of evOrd(c)) { d += e.equipa === c.l.eq ? 1 : -1; m = Math.max(m, d); } return m; };
const grsBatidos = (c) => new Set(golos(c).filter((e) => e.marcador === c.pid).map((e) => grSofreu(c.j, e)).filter(Boolean)).size;
add('participar', '🙌', [
  ['ga1', 1, 'Participa em pelo menos 1 golo', (c) => c.l.g + c.l.a >= 1],
  ['g-assistido', 1, 'Marca um golo com assistência de um colega', (c) => golos(c).some((e) => e.marcador === c.pid && e.assist)],
  ['g-sozinho', 2, 'Marca um golo sem assistência', (c) => golos(c).some((e) => e.marcador === c.pid && !e.assist)],
  ['g-ambos', 3, 'Marca um golo sozinho e outro assistido', (c) => golos(c).some((e) => e.marcador === c.pid && !e.assist) && golos(c).some((e) => e.marcador === c.pid && e.assist)],
  ['assist-2col', 2, 'Assiste 2 colegas diferentes', (c) => new Set(golos(c).filter((e) => e.assist === c.pid).map((e) => e.marcador)).size >= 2],
  ['assist-3col', 3, 'Assiste 3 colegas diferentes', (c) => new Set(golos(c).filter((e) => e.assist === c.pid).map((e) => e.marcador)).size >= 3],
  ['recebe-2col', 3, 'Marca com assistências de 2 colegas diferentes', (c) => new Set(golos(c).filter((e) => e.marcador === c.pid && e.assist).map((e) => e.assist)).size >= 2],
  ['assist-cab', 3, 'Assiste para um golo de cabeça', (c) => golos(c).some((e) => e.assist === c.pid && e.parte === 'cab')],
  ['gr2', 2, 'Marca a 2 guarda-redes diferentes', (c) => grsBatidos(c) >= 2], ['gr3', 3, 'Marca a 3 guarda-redes diferentes', (c) => grsBatidos(c) >= 3],
  ['serie-tu2', 2, 'Participa em 2 golos seguidos da tua equipa', (c) => maxSerie(c, (e) => e.equipa === c.l.eq && e.tipo !== 'autogolo' && (e.marcador === c.pid || e.assist === c.pid)) >= 2],
  ['resposta-tu', 2, 'Marca até 2 minutos depois de a tua equipa sofrer', (c) => { let ult = null; for (const e of evOrd(c)) { if (e.equipa !== c.l.eq) ult = e.t; else if (e.marcador === c.pid && e.tipo !== 'autogolo' && ult != null && e.t - ult <= 2 * MIN) return true; } return false; }],
]);
add('coletivo', '👥', [
  ['marcadores3', 1, 'A tua equipa tem 3 ou mais marcadores diferentes', (c) => new Set(daEquipa(c).map((e) => e.marcador)).size >= 3],
  ['marcadores4', 2, 'A tua equipa tem 4 ou mais marcadores diferentes', (c) => new Set(daEquipa(c).map((e) => e.marcador)).size >= 4],
  ['marcadores5', 3, 'Todos os 5 da tua equipa marcam', (c) => new Set(daEquipa(c).map((e) => e.marcador)).size >= 5],
  ['serie3', 1, 'A tua equipa marca 3 golos seguidos', (c) => maxSerie(c, (e) => e.equipa === c.l.eq) >= 3],
  ['serie5', 2, 'A tua equipa marca 5 golos seguidos', (c) => maxSerie(c, (e) => e.equipa === c.l.eq) >= 5],
  ['serie7', 3, 'A tua equipa marca 7 golos seguidos', (c) => maxSerie(c, (e) => e.equipa === c.l.eq) >= 7],
  ['vant3', 1, 'A tua equipa chega a estar a ganhar por 3', (c) => maxVant(c) >= 3], ['vant5', 2, 'A tua equipa chega a estar a ganhar por 5', (c) => maxVant(c) >= 5],
  ['resposta', 1, 'A tua equipa responde a um golo sofrido em menos de 2 minutos', (c) => { let ult = null; for (const e of evOrd(c)) { if (e.equipa !== c.l.eq) ult = e.t; else if (ult != null && e.t - ult <= 2 * MIN) return true; } return false; }],
  ['atras1', 1, 'A tua equipa nunca está a perder por mais de 1', (c) => c.l.pior >= -1], ['perde2', 1, 'Não percas por mais de 2 golos', (c) => c.l.dif >= -2],
  ['eq4', 1, 'A tua equipa marca 4 ou mais', (c) => c.l.gm >= 4], ['sofre9', 1, 'A tua equipa sofre 9 ou menos', (c) => c.l.gs <= 9],
]);
add('baliza2', '🥅', [
  ['muro3', 1, '3 minutos seguidos na baliza sem sofrer', (c) => c.b.melhor >= 3], ['gr-sofre3', 1, 'Sofre no máximo 3 golos enquanto estás na baliza', (c) => c.l.minGR > 0 && c.l.sofrGR <= 3],
  ['gr-sofre0', 3, 'Não sofras nenhum golo em todo o tempo na baliza (mín. 3 min)', (c) => c.l.minGR >= 3 && c.l.sofrGR === 0],
  ['gr-ou-golo', 1, 'Marca um golo ou faz um turno na baliza sem sofrer', (c) => c.l.g >= 1 || c.b.limpos >= 1],
  ['gr-ou-assist', 1, 'Faz uma assistência ou um turno na baliza sem sofrer', (c) => c.l.a >= 1 || c.b.limpos >= 1],
  ['gr-v', 2, 'Ganha e sofre no máximo 1 golo na baliza', (c) => c.l.res === 'V' && c.l.minGR > 0 && c.l.sofrGR <= 1],
]);
add('combo2', '🌟', [
  ['ga2-v', 2, 'Participa em 2 golos e ganha', (c) => c.l.g + c.l.a >= 2 && c.l.res === 'V'], ['ga4-v', 3, 'Participa em 4 golos e ganha', (c) => c.l.g + c.l.a >= 4 && c.l.res === 'V'],
  ['g3-v', 3, 'Hat-trick e vitória', (c) => c.l.g >= 3 && c.l.res === 'V'], ['g2-np', 2, 'Marca 2 golos e não percas', (c) => c.l.g >= 2 && c.l.res !== 'D'],
  ['a2-np', 2, '2 assistências e não percas', (c) => c.l.a >= 2 && c.l.res !== 'D'], ['g1-eq8', 2, 'Marca e a tua equipa chega aos 8', (c) => c.l.g >= 1 && c.l.gm >= 8],
  ['a1-eq8', 2, 'Assiste e a tua equipa chega aos 8', (c) => c.l.a >= 1 && c.l.gm >= 8], ['g1-sofre5', 2, 'Marca e a tua equipa sofre 5 ou menos', (c) => c.l.g >= 1 && c.l.gs <= 5],
  ['g1-nunca', 3, 'Marca e ganha sem nunca estar a perder', (c) => c.l.g >= 1 && c.l.res === 'V' && c.l.pior >= 0],
  ['ult-v', 3, 'Marca o último golo e ganha', (c) => c.l.ultimo && c.l.res === 'V'],
]);
add('dupla2', '🫂', [
  ['p-ambos-ga', 1, 'Tu e o {p} participam os dois em golos', (c) => c.l.g + c.l.a >= 1 && golos(c).some((e) => e.marcador === c.p || e.assist === c.p), { par: 'colega' }],
  ['p-mais', 2, 'Rivalidade amiga: participa em mais golos do que o {p}', (c) => { const n = (q) => golos(c).filter((e) => e.marcador === q || e.assist === q).length; return n(c.pid) > n(c.p); }, { par: 'colega' }],
  ['p-limpo', 3, 'Tu e o {p} fazem os dois um turno na baliza sem sofrer', (c) => c.b.limpos >= 1 && balizaDe(c.j, c.p).limpos >= 1, { par: 'colega' }],
  ['p-serve', 2, 'Marca depois de o {p} te assistir ou assiste-o tu, 2 vezes no total', (c) => golos(c).filter((e) => (e.marcador === c.pid && e.assist === c.p) || (e.marcador === c.p && e.assist === c.pid)).length >= 2, { par: 'colega' }],
]);
add('duelo2', '🥊', [
  ['adv-np', 1, 'Duelo com o {p}: não percas', (c) => c.l.res !== 'D', { par: 'adv' }],
  ['adv-gr2', 3, 'Marca 2 golos ao {p} quando ele estiver na baliza', (c) => golos(c).filter((e) => e.marcador === c.pid && grSofreu(c.j, e) === c.p).length >= 2, { par: 'adv' }],
  ['adv-assist-gr', 2, 'Assiste para um golo ao {p} quando ele estiver na baliza', (c) => golos(c).some((e) => e.assist === c.pid && grSofreu(c.j, e) === c.p), { par: 'adv' }],
  ['adv-igual', 1, 'Marca pelo menos tantos golos como o {p}', (c) => c.l.g >= golos(c).filter((e) => e.marcador === c.p).length, { par: 'adv' }],
]);
const zMedia = (f) => ((f.zonas?.[2]?.[0] || 0) + (f.zonas?.[3]?.[0] || 0) + (f.zonas?.[4]?.[0] || 0)) / 60;   // min acima de 7 km/h
add('ritmo', '🫀', [
  ['km2', 1, 'Corre 2 km', fis((f) => (f.m || 0) >= 2000), { rel: true }], ['vmax16', 1, 'Passa dos 16 km/h', fis((f) => (f.vmax?.kmh || 0) >= 16), { rel: true }],
  ['sp3', 1, 'Faz 3 sprints', fis((f) => (f.nSprints || 0) >= 3), { rel: true }], ['msp50', 1, 'Faz 50 m em sprint', fis((f) => (f.mSprint || 0) >= 50), { rel: true }],
  ['zalta2', 1, '2 minutos acima de 13 km/h', fis((f) => zAlta(f) >= 2), { rel: true }],
  ...[15, 20, 25, 30].map((k, i) => [`zmed${k}`, i < 1 ? 1 : i < 3 ? 2 : 3, `${k} minutos acima de 7 km/h`, fis((f) => zMedia(f) >= k), { rel: true }]),
]);
export const DESAFIOS_JOGO = D;

// ---------- Desafio do mês (um por jogador) ----------
// medir(L, F): linhas dos jogos do mês e resumos físicos → valor; feito quando chega ao alvo.
const soma = (L, k) => L.reduce((s, l) => s + (l[k] || 0), 0);
const M = [];
const addM = (fam, ic, lista) => lista.forEach(([id, txt, alvo, medir, extra]) => M.push({ id, fam, ic, txt, alvo, medir, ...(extra || {}) }));
addM('golos', '⚽', [3, 4, 5, 6, 8, 10].map((k) => [`mg${k}`, `Marca ${k} golos este mês`, k, (L) => soma(L, 'g')]));
addM('assist', '🎯', [2, 3, 4, 5, 6].map((k) => [`ma${k}`, `Faz ${k} assistências este mês`, k, (L) => soma(L, 'a')]));
addM('ga', '🔥', [5, 8, 10, 12, 15].map((k) => [`mga${k}`, `Participa em ${k} golos este mês`, k, (L) => soma(L, 'g') + soma(L, 'a')]));
addM('jogos', '📅', [3, 4].map((k) => [`mj${k}`, `Joga ${k} jogos este mês`, k, (L) => L.length]));
addM('vitorias', '✅', [2, 3, 4].map((k) => [`mv${k}`, `Ganha ${k} jogos este mês`, k, (L) => L.filter((l) => l.res === 'V').length]));
addM('regular', '📈', [
  ['mmarca2', 'Marca em 2 jogos diferentes', 2, (L) => L.filter((l) => l.g > 0).length], ['mmarca3', 'Marca em 3 jogos diferentes', 3, (L) => L.filter((l) => l.g > 0).length],
  ['massist2', 'Assiste em 2 jogos diferentes', 2, (L) => L.filter((l) => l.a > 0).length], ['menv3', 'Participa em golos em 3 jogos diferentes', 3, (L) => L.filter((l) => l.g + l.a > 0).length],
  ['minvicto', 'Fecha o mês sem derrotas (mín. 2 jogos)', 2, (L) => (L.some((l) => l.res === 'D') ? 0 : L.length)],
]);
addM('baliza', '🧤', [
  ['mlimpo2', '2 turnos na baliza sem sofrer', 2, (L, F, B) => B.reduce((s, b) => s + b.limpos, 0)], ['mlimpo4', '4 turnos na baliza sem sofrer', 4, (L, F, B) => B.reduce((s, b) => s + b.limpos, 0)],
  ['mmuro8', '8 minutos seguidos na baliza sem sofrer', 8, (L, F, B) => Math.max(0, ...B.map((b) => b.melhor))],
]);
addM('especial', '⭐', [
  ['mcab', 'Marca 2 golos de cabeça', 2, (L) => soma(L, 'cab')], ['mprimeiro', 'Marca o primeiro golo de um jogo', 1, (L) => L.filter((l) => l.primeiro).length],
  ['mvitoria', 'Marca um golo da vitória', 1, (L) => L.filter((l) => l.decisivo).length], ['mhat', 'Faz um hat-trick', 1, (L) => L.filter((l) => l.g >= 3).length],
  ['mga-mesmo', 'Marca e assiste no mesmo jogo, 2 vezes', 2, (L) => L.filter((l) => l.g && l.a).length],
]);
addM('fisico', '👟', [
  ['mkm10', 'Corre 10 km no mês', 10, (L, F) => F.reduce((s, f) => s + (f?.m || 0), 0) / 1000, { rel: true, un: 'km' }],
  ['mkm15', 'Corre 15 km no mês', 15, (L, F) => F.reduce((s, f) => s + (f?.m || 0), 0) / 1000, { rel: true, un: 'km' }],
  ['msp25', 'Faz 25 sprints no mês', 25, (L, F) => F.reduce((s, f) => s + (f?.nSprints || 0), 0), { rel: true }],
  ['msp40', 'Faz 40 sprints no mês', 40, (L, F) => F.reduce((s, f) => s + (f?.nSprints || 0), 0), { rel: true }],
  ['mv24', 'Passa dos 24 km/h num jogo', 24, (L, F) => Math.max(0, ...F.map((f) => f?.vmax?.kmh || 0)), { rel: true, un: 'km/h' }],
]);
export const DESAFIOS_MES = M;
export const totalDesafios = () => ({ jogo: D.length, mes: M.length });

// ---------- Atribuição por jogo ----------
// jogo = { id, brancos, pretos } (ids ou {id}); anteriores = jogos já marcados (games/) com .desafios, de qualquer ordem;
// relogio = ids de quem tem relógio. Devolve { [pid]: [{ id, p? }] }.
export function atribuirDesafios(jogo, anteriores = [], { relogio = [] } = {}) {
  const B = idsDe(jogo.brancos), P = idsDe(jogo.pretos), todos = [...B, ...P];
  const chave = jogo.id || jogo.gameId || String(jogo.criado || '');
  const ord = (x) => x.criado || Date.parse(x.data || '') || 0;
  const antes = anteriores.filter((g) => g.desafios && (g.id || g.gameId) !== chave && ord(g) <= (ord(jogo) || Infinity)).sort((a, b) => ord(b) - ord(a));
  const doJogoAnterior = new Set(Object.values(antes[0]?.desafios || {}).flat().map((d) => d.id));
  const usadosJogo = new Set(), out = {};
  const rel = new Set(relogio);
  for (const pid of [...todos].sort((a, b) => hash(chave + a) - hash(chave + b))) {
    const meus = antes.map((g) => g.desafios[pid]).filter(Boolean);
    const famRecentes = new Set(meus.slice(0, 2).flat().map((d) => D.find((x) => x.id === d.id)?.fam));
    const idsRecentes = new Set(meus.slice(0, 10).flat().map((d) => d.id));
    const colegas = (B.includes(pid) ? B : P).filter((x) => x !== pid), adv = B.includes(pid) ? P : B;
    const r = hash(chave + pid + 'n') % 100, alt = hash(chave + pid + 'v') % 2;
    const niveis = r < 25 ? [2] : r < 70 ? (alt ? [1, 2] : [2, 3]) : [1, 2, 3];
    const famHoje = new Set(), lista = [];
    for (const nv of niveis) {
      const base = D.filter((d) => d.nv === nv && (!d.rel || rel.has(pid)) && !usadosJogo.has(d.id) && !famHoje.has(d.fam)
        && (d.par !== 'colega' || colegas.length) && (d.par !== 'adv' || adv.length));
      // Do mais exigente ao mais folgado: se faltar escolha, larga primeiro o histórico do próprio, depois o jogo anterior.
      const pool = [base.filter((d) => !doJogoAnterior.has(d.id) && !famRecentes.has(d.fam) && !idsRecentes.has(d.id)),
        base.filter((d) => !doJogoAnterior.has(d.id) && !famRecentes.has(d.fam)), base.filter((d) => !doJogoAnterior.has(d.id)), base].find((x) => x.length);
      if (!pool) continue;
      const d = pool.sort((a, b) => hash(chave + pid + a.id) - hash(chave + pid + b.id))[0];
      const item = { id: d.id };
      if (d.par) { const q = d.par === 'colega' ? colegas : adv; item.p = q[hash(chave + pid + d.id + 'p') % q.length]; }
      usadosJogo.add(d.id); famHoje.add(d.fam); lista.push(item);
    }
    out[pid] = lista;
  }
  return out;
}

// Texto de um desafio ({p} → nome). nomes = { id: nome } (o games/{id}.nomes serve).
export function textoDesafio(d, nomes = {}) {
  const x = D.find((y) => y.id === d.id);
  if (!x) return null;
  return { id: x.id, ic: x.ic, nv: x.nv, rel: !!x.rel, fam: x.fam, txt: x.txt.replace('{p}', nomes[d.p] || 'colega') };
}

// Resultado dos desafios de um jogador num jogo terminado. feito: true / false / null (faltam dados, p. ex. sem relógio).
// fis = resumo físico do jogador nesse jogo (só o próprio e o admin o têm; sem ele os ⌚ ficam null).
// Dados que cada desafio precisa e que nem todos os jogos têm. Sem eles, um desafio que não deu certo fica ⏳ (sem dados),
// em vez de ❌ — p. ex. o marcador não registou a parte do corpo, não houve trocas de GR ou o jogo fechou só com o vencedor.
const SO_RESULTADO = new Set(['ganhar', 'naoperder', 'adv-ganha', 'adv-np']);   // os únicos que se sabem sem os golos
const PRECISA_TURNOS = new Set(['baliza', 'baliza2']);
const IDS_TURNOS = new Set(['gr-v', 'muro-v', 'p-limpo', 'adv-gr', 'adv-gr2', 'adv-assist-gr', 'adv-zero', 'gr2', 'gr3', 'gr-e-golo', 'gr-e-assist']);
const IDS_PARTE = new Set(['assist-cab']);
function faltamDados(x, j, pid) {
  if (x.rel) return false;   // os ⌚ já dão null sem o resumo do relógio
  if (j.semGolos) return !SO_RESULTADO.has(x.id);
  if ((PRECISA_TURNOS.has(x.fam) || IDS_TURNOS.has(x.id)) && !(j.turnos || []).length) return true;
  if (x.fam === 'tecnica' || IDS_PARTE.has(x.id)) {
    const meus = (j.eventos || []).filter((e) => e.tipo !== 'autogolo' && (e.marcador === pid || (IDS_PARTE.has(x.id) && e.assist === pid)));
    if (meus.some((e) => !e.parte)) return true;
  }
  if ((x.id === 'pen' || x.id === 'gr-pen') && !Array.isArray(j.penaltis)) return true;
  return false;
}

export function avaliarDesafios(j, pid, lista = [], { fis = null, nomes = {} } = {}) {
  const l = linhaJogo(j, pid);
  if (!l) return (lista || []).map((d) => ({ ...textoDesafio(d, nomes), feito: null }));
  const c = { l, b: balizaDe(j, pid), f: fis, j, pid };
  return (lista || []).map((d) => {
    const x = D.find((y) => y.id === d.id);
    if (!x) return null;
    let feito = null;
    try { feito = x.ok({ ...c, p: d.p }); } catch { feito = null; }
    if (feito === false && faltamDados(x, j, pid)) feito = null;   // não deu certo, mas faltam dados para o saber
    return { ...textoDesafio(d, nomes), feito: feito == null ? null : !!feito };
  }).filter(Boolean);
}

// Desafios cumpridos de um jogador em todos os jogos (para a medalha "Desafiador" e o perfil).
// jogos = resumos públicos (jogos/); games = games/ com .desafios (liga-se por jogo.gameId).
export function desafiosCumpridosJogos(jogos, games, pid, { fisPorJogo = {} } = {}) {
  const porId = Object.fromEntries((games || []).map((g) => [g.id, g]));
  const out = [];
  for (const { j, l } of historico(jogos, pid)) {
    const g = porId[j.gameId];
    if (!g?.desafios?.[pid]) continue;
    for (const r of avaliarDesafios(j, pid, g.desafios[pid], { fis: fisPorJogo[l.id], nomes: g.nomes || {} })) if (r.feito) out.push({ ...r, data: l.data, jogo: j.gameId });
  }
  return out;
}

// ---------- Atribuição do mês ----------
// mes = 'AAAA-MM'; jogadores = ids dos ativos. Encadeado desde set/2026 para nunca repetir o do mês anterior.
const MES0 = '2026-09';
const mesSeguinte = (m) => { const [a, n] = m.split('-').map(Number); return n === 12 ? `${a + 1}-01` : `${a}-${String(n + 1).padStart(2, '0')}`; };
export function desafiosDoMes(mes, jogadores, { relogio = [] } = {}) {
  const rel = new Set(relogio), ids = [...new Set(jogadores)];
  let antes = {}, atual = {};
  for (let m = MES0; m <= mes; m = mesSeguinte(m)) {
    atual = {};
    const usados = new Set();
    for (const pid of [...ids].sort((a, b) => hash(m + a) - hash(m + b))) {
      const base = M.filter((d) => (!d.rel || rel.has(pid)) && !usados.has(d.id));
      const ant = M.find((d) => d.id === antes[pid]);
      const pool = [base.filter((d) => d.id !== ant?.id && d.fam !== ant?.fam), base.filter((d) => d.id !== ant?.id), base].find((x) => x.length);
      if (!pool) continue;
      const d = pool.sort((a, b) => hash(m + pid + a.id) - hash(m + pid + b.id))[0];
      atual[pid] = d.id; usados.add(d.id);
    }
    antes = atual;
    if (m === mes) break;
  }
  return atual;
}

// Progresso do desafio do mês de um jogador.
export function progressoMes(jogos, pid, id, mes, { fisPorJogo = {} } = {}) {
  const d = M.find((x) => x.id === id);
  if (!d) return null;
  const H = historico(jogos, pid).filter(({ l }) => (l.data || '').slice(0, 7) === mes);
  const L = H.map((x) => x.l), F = L.map((l) => fisPorJogo[l.id]).filter(Boolean), Bz = H.map(({ j }) => balizaDe(j, pid));
  const v = d.medir(L, F, Bz);
  return { id, ic: d.ic, txt: d.txt, alvo: d.alvo, un: d.un || '', rel: !!d.rel, mes, valor: Math.round(v * 10) / 10, feito: v >= d.alvo, pct: Math.min(100, Math.round((v / d.alvo) * 100)) };
}

// Desafios do mês já cumpridos (meses com jogos do jogador), pelo que ficou gravado em games/{id}.desafiosMes.
export function desafiosMesCumpridos(jogos, games, pid, { fisPorJogo = {} } = {}) {
  const meses = [...new Set(historico(jogos, pid).map(({ l }) => (l.data || '').slice(0, 7)).filter(Boolean))];
  return meses.map((m) => { const id = desafiosMesDeGames(games, m)[pid]; return id && progressoMes(jogos, pid, id, m, { fisPorJogo }); }).filter((x) => x?.feito);
}

// ---------- Desafio do mês gravado (estável) ----------
// O desafiosDoMes depende da lista de ativos e de quem tem relógio (que só o admin sabe) → cada telemóvel daria outro.
// Por isso grava-se: cada jogo marcado guarda games/{id}.desafiosMes = { pid: id } para os seus convocados que ainda não
// tinham desafio nesse mês. O mapa do mês = junção dos desafiosMes de todos os jogos desse mês (o primeiro que o deu vale).
const mesDoGame = (g) => (g.data || (g.criado ? new Date(g.criado).toISOString().slice(0, 10) : '')).slice(0, 7);
export function desafiosMesDeGames(games, mes) {
  const out = {};
  for (const g of [...(games || [])].filter((x) => x.desafiosMes && mesDoGame(x) === mes).sort((a, b) => (a.criado || 0) - (b.criado || 0)))
    for (const [pid, id] of Object.entries(g.desafiosMes)) out[pid] ??= id;
  return out;
}
// Para um jogo novo: devolve só os que faltam aos convocados (pids), sem repetir os já dados no mês nem o do mês anterior de cada um.
export function completarDesafiosMes(mes, pids, games, { relogio = [] } = {}) {
  const [a, n] = mes.split('-').map(Number);
  const mesAnt = n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, '0')}`;
  const atual = desafiosMesDeGames(games, mes), ant = desafiosMesDeGames(games, mesAnt), rel = new Set(relogio);
  const usados = new Set(Object.values(atual)), novos = {};
  for (const pid of [...new Set(pids)].filter((p) => !atual[p]).sort((x, y) => hash(mes + x) - hash(mes + y))) {
    const base = M.filter((d) => (!d.rel || rel.has(pid)) && !usados.has(d.id));
    const antD = M.find((d) => d.id === ant[pid]);
    const pool = [base.filter((d) => d.id !== antD?.id && d.fam !== antD?.fam), base.filter((d) => d.id !== antD?.id), base].find((x) => x.length);
    if (!pool) continue;
    const d = pool.sort((x, y) => hash(mes + pid + x.id) - hash(mes + pid + y.id))[0];
    novos[pid] = d.id; usados.add(d.id);
  }
  return novos;
}
