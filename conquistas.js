// Conquistas de cada jogador: Match DNA (frases sobre o jogo), recordes pessoais, tendências da época,
// desafios semanais/mensais e os dados do cartão partilhável. Só cálculos — nada aqui lê nem grava na base de dados.
// Tudo sai dos jogos públicos (jogos/) e, para quem tem relógio, do resumo físico (fisico.js → resumoFisico).
// Pedido do Rui (28/10/2026). As medalhas ficam à parte, à espera da aprovação da lista.
import { placarDe, vencedorDe } from './ranking.js?v=30';

const MIN = 60000;
const grSofreu = (j, ev) => ev.gr || (j.turnos || []).find((x) => x.equipa !== ev.equipa && ev.t >= x.de && ev.t < x.ate)?.jogador;
export const dataDoJogo = (j) => j.data || (j.inicioEpoch ? new Date(j.inicioEpoch).toISOString().slice(0, 10) : '');
// Época de setembro a agosto: '2026/27'.
export const epocaDe = (data) => { const [a, m] = (data || '').split('-').map(Number); if (!a) return ''; const i = m >= 9 ? a : a - 1; return `${i}/${String(i + 1).slice(2)}`; };
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------- O jogo visto por um jogador ----------
export function linhaJogo(j, pid) {
  const eq = (j.brancos || []).some((x) => x.id === pid) ? 'B' : (j.pretos || []).some((x) => x.id === pid) ? 'P' : null;
  if (!eq || j.fase !== 'fim') return null;
  const outra = eq === 'B' ? 'P' : 'B';
  const ev = [...(j.eventos || [])].sort((a, b) => a.t - b.t);
  const pl = placarDe(j), venc = vencedorDe(j);
  const gm = pl[eq], gs = pl[outra], res = venc === 'E' ? 'E' : venc === eq ? 'V' : 'D';
  const dur = Math.max(0, (j.fimEpoch || 0) - (j.inicioEpoch || 0) - (j.pausaTotal || 0));
  const meusTurnos = (j.turnos || []).filter((t) => t.jogador === pid);
  const emGR = (t) => meusTurnos.some((x) => t >= x.de && t < x.ate);
  const meus = ev.filter((e) => e.tipo !== 'autogolo' && e.marcador === pid);
  const nome = (id) => [...(j.brancos || []), ...(j.pretos || [])].find((x) => x.id === id)?.nome || '?';
  // Placar ao longo do jogo, do lado do jogador.
  let d = 0, pior = 0, decisivo = null, empate = null, virou = false, nEnvolvido = 0;
  const diffs = [];
  for (const e of ev) {
    const antes = d;
    d += e.equipa === eq ? 1 : -1;
    diffs.push(d);
    pior = Math.min(pior, d);
    if (e.equipa === eq && e.tipo !== 'autogolo' && e.marcador === pid && antes < 0) virou = true;
    if (e.equipa === eq && (e.marcador === pid || e.assist === pid) && e.tipo !== 'autogolo') nEnvolvido++;
  }
  // Golo da vitória: o golo que pôs a equipa na frente pela última vez (e nunca mais deixou de estar).
  if (res === 'V') for (let i = ev.length - 1; i >= 0; i--) { const antes = i ? diffs[i - 1] : 0; if (ev[i].equipa === eq && antes <= 0 && diffs[i] > 0) { decisivo = ev[i]; break; } }
  if (res === 'E' && ev.length) { const u = ev.at(-1); if (u.equipa === eq) empate = u; }
  const parc = {};
  for (const e of meus) if (e.assist) parc[e.assist] = (parc[e.assist] || 0) + 1;
  for (const e of ev) if (e.assist === pid && e.tipo !== 'autogolo') parc[e.marcador] = (parc[e.marcador] || 0) + 1;
  const [parcId, parcN] = Object.entries(parc).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const minGR = Math.round(meusTurnos.reduce((s, t) => s + t.ate - t.de, 0) / MIN);
  const pens = (j.penaltis || []);
  const t1 = meus.map((e) => e.t);
  return {
    id: j.gameId || j.id || String(j.inicioEpoch), data: dataDoJogo(j), epoch: j.inicioEpoch || 0, eq, res, gm, gs, dif: gm - gs, reg: !j.semGolos,
    durMin: Math.round(dur / MIN), g: meus.length, a: ev.filter((e) => e.assist === pid && e.tipo !== 'autogolo').length,
    ag: ev.filter((e) => e.tipo === 'autogolo' && e.marcador === pid).length,
    cab: meus.filter((e) => e.parte === 'cab').length, pd: meus.filter((e) => e.parte === 'pd').length, pe: meus.filter((e) => e.parte === 'pe').length,
    pen: pens.filter((p) => p.marcador === pid && p.resultado === 'golo').length, penF: pens.filter((p) => p.marcador === pid && p.resultado !== 'golo').length,
    penDef: pens.filter((p) => p.gr === pid && p.resultado === 'defendido').length,
    minGR, temGR: (j.turnos || []).length > 0, sofrGR: ev.filter((e) => e.equipa !== eq && grSofreu(j, e) === pid).length,
    primeiro: ev[0]?.tipo !== 'autogolo' && ev[0]?.marcador === pid, ultimo: ev.at(-1)?.tipo !== 'autogolo' && ev.at(-1)?.marcador === pid,
    decisivo: decisivo?.marcador === pid && decisivo?.tipo !== 'autogolo', decisivoAssist: decisivo?.assist === pid, empatou: empate?.marcador === pid && empate?.tipo !== 'autogolo',
    virou: virou && res === 'V', pior, envolvidoTodos: gm >= 3 && nEnvolvido === gm, envolvido: gm ? nEnvolvido / gm : 0,
    rapido: t1.some((t, i) => i && t - t1[i - 1] <= 3 * MIN), cedo: t1.some((t) => t <= 3 * MIN), tarde: dur > 10 * MIN && t1.some((t) => t >= dur - 5 * MIN),
    goloGR: meus.some((e) => emGR(e.t)), assistGR: ev.some((e) => e.assist === pid && emGR(e.t)),
    parc: parcN >= 2 ? { nome: nome(parcId), n: parcN } : null,
    tminGolo: t1.length ? Math.round(t1[0] / MIN) : null,
  };
}

// Comparações dentro do jogo (melhor marcador, mais assistências, mais tempo na baliza).
function doJogo(j) {
  const ids = [...(j.brancos || []), ...(j.pretos || [])].map((x) => x.id);
  const L = ids.map((id) => { const l = linhaJogo(j, id); return l && { ...l, pid: id }; }).filter(Boolean);
  const topo = (k) => { const m = Math.max(0, ...L.map((l) => l[k])); const q = L.filter((l) => l[k] === m); return m > 0 && q.length === 1 ? q[0].pid : null; };
  return { topG: topo('g'), topA: topo('a'), topGR: topo('minGR'), topGA: (() => { const m = Math.max(0, ...L.map((l) => l.g + l.a)); const q = L.filter((l) => l.g + l.a === m); return m > 0 && q.length === 1 ? q[0].pid : null; })() };
}

// Histórico do jogador: as linhas de todos os jogos terminados, do mais antigo para o mais recente.
export function historico(jogos, pid) {
  return jogos.filter((j) => j.fase === 'fim').sort((a, b) => (a.inicioEpoch || 0) - (b.inicioEpoch || 0))
    .map((j) => ({ j, l: linhaJogo(j, pid) })).filter((x) => x.l);
}

// O que já vinha de trás (para "primeiro golo", "acabou o jejum", sequências e marcos).
function contexto(antes) {
  const L = antes.map((x) => x.l);
  const seq = (f) => { let n = 0; for (let i = L.length - 1; i >= 0 && f(L[i]); i--) n++; return n; };
  return {
    n: L.length, g: L.reduce((s, l) => s + l.g, 0), a: L.reduce((s, l) => s + l.a, 0),
    maxG: Math.max(0, ...L.map((l) => l.g)), maxA: Math.max(0, ...L.map((l) => l.a)),
    semMarcar: seq((l) => l.reg && l.g === 0), comGolo: seq((l) => l.g > 0), vitorias: seq((l) => l.res === 'V'),
    derrotas: seq((l) => l.res === 'D'), invicto: seq((l) => l.res !== 'D'), ultimoEpoch: L.at(-1)?.epoch || 0,
  };
}
const passou = (antes, agora, marcos) => marcos.find((m) => antes < m && agora >= m);

// ---------- Match DNA ----------
// Cada regra: id, categoria (no máximo uma frase por categoria), peso (quanto mais raro/notável, mais alto),
// priv (usa dados do relógio → só o próprio vê) e 3 maneiras de dizer o mesmo. Escolhem-se as 3 de maior peso.
// {g} golos, {a} assistências, {gm}/{gs} golos da equipa/sofridos, {min} minutos do jogo, {gr} minutos na baliza,
// {sofr} sofridos na baliza, {dif} diferença, {n} contagem da regra, {parc} parceiro, {km} distância, {kmh} vel. máx, {sp} sprints, {t} minuto.
export const DNA = [
  // Golos
  { id: 'manita', cat: 'golo', peso: 100, ok: (c) => c.l.g >= 5, t: ['🖐️ Manita! {g} golos num só jogo.', '🔥 {g} golos — noite para contar aos netos.', '⚽ {g} golos: a baliza deles ainda está a tremer.'] },
  { id: 'poker', cat: 'golo', peso: 90, ok: (c) => c.l.g === 4, t: ['🍀 Póquer: 4 golos.', '⚽⚽⚽⚽ Quatro golos, nem mais.', '🎯 4 golos — dia de pontaria afinada.'] },
  { id: 'hattrick', cat: 'golo', peso: 80, ok: (c) => c.l.g === 3, t: ['🎩 Hat-trick! 3 golos.', '⚽ Três golos — leva a bola para casa.', '🎩 3 golos: hat-trick à moda antiga.'] },
  { id: 'bis', cat: 'golo', peso: 40, ok: (c) => c.l.g === 2, t: ['✌️ Bis: 2 golos.', '⚽ Dois golos na conta.', '✌️ Marcou duas vezes.'] },
  { id: 'golo', cat: 'golo', peso: 15, ok: (c) => c.l.g === 1, t: ['⚽ Deixou a sua marca: 1 golo.', '⚽ Um golo para a estatística.', '⚽ Marcou o seu golo.'] },
  { id: 'melhorMarcador', cat: 'destaque', peso: 55, ok: (c) => c.dj.topG === c.pid, t: ['👑 Melhor marcador do jogo ({g}).', '👑 Ninguém marcou mais do que ele: {g}.', '🏅 O goleador da noite, com {g}.'] },
  { id: 'unicoMarcador', cat: 'equipa', peso: 50, ok: (c) => c.l.gm >= 2 && c.l.g === c.l.gm, t: ['🦸 Marcou todos os golos da equipa ({g}).', '🦸 A equipa só marcou pelos pés dele.', '🦸 {g} de {gm}: os golos foram todos dele.'] },
  { id: 'metade', cat: 'equipa', peso: 45, ok: (c) => c.l.gm >= 4 && c.l.g >= c.l.gm / 2 && c.l.g < c.l.gm, t: ['📊 Metade ou mais dos golos da equipa: {g} de {gm}.', '📊 {g} dos {gm} golos da equipa foram dele.', '📊 Pesou {g} em {gm} golos da equipa.'] },
  { id: 'primeiroGolo', cat: 'momento', peso: 25, ok: (c) => c.l.primeiro, t: ['🚀 Abriu o marcador.', '🚀 O primeiro golo da noite foi dele.', '🚀 Foi ele que inaugurou o placar.'] },
  { id: 'ultimoGolo', cat: 'momento', peso: 20, ok: (c) => c.l.ultimo && !c.l.decisivo && !c.l.empatou, t: ['🔚 Fechou a contagem.', '🔚 O último golo do jogo foi dele.', '🔚 Assinou o golo final.'] },
  { id: 'decisivo', cat: 'momento', peso: 60, ok: (c) => c.l.decisivo, t: ['🏆 Marcou o golo da vitória.', '🏆 O golo que decidiu o jogo foi dele.', '🏆 Pôs a equipa na frente de vez.'] },
  { id: 'decisivoAssist', cat: 'momento', peso: 45, ok: (c) => c.l.decisivoAssist && !c.l.decisivo, t: ['🎁 Assistiu para o golo da vitória.', '🎁 O passe para o golo decisivo foi dele.', '🎁 Serviu o golo que deu a vitória.'] },
  { id: 'empatou', cat: 'momento', peso: 45, ok: (c) => c.l.empatou, t: ['🤝 Marcou o golo do empate final.', '🤝 Salvou um ponto com o último golo.', '🤝 O empate tem a assinatura dele.'] },
  { id: 'virou', cat: 'momento', peso: 55, ok: (c) => c.l.virou, t: ['🔄 Marcou com a equipa a perder — e ganharam.', '🔄 Ajudou a dar a volta ao jogo.', '🔄 Golo na reviravolta.'] },
  { id: 'rapido', cat: 'estilo', peso: 50, ok: (c) => c.l.rapido, t: ['⚡ Dois golos em menos de 3 minutos.', '⚡ Bis relâmpago.', '⚡ Marcou duas vezes num abrir e fechar de olhos.'] },
  { id: 'cedo', cat: 'estilo', peso: 30, ok: (c) => c.l.cedo, t: ['⏱️ Golo nos primeiros 3 minutos.', '⏱️ Entrou a marcar.', '⏱️ Nem deu tempo para aquecer: golo logo a abrir.'] },
  { id: 'tarde', cat: 'estilo', peso: 35, ok: (c) => c.l.tarde, t: ['⌛ Golo nos últimos 5 minutos.', '⌛ Guardou o melhor para o fim.', '⌛ Marcou já com o relógio a apertar.'] },
  { id: 'cabeca2', cat: 'estilo', peso: 60, ok: (c) => c.l.cab >= 2, t: ['🗣️ {n} golos de cabeça!', '🗣️ A cabeça esteve afinada: {n} golos.', '🗣️ {n} cabeçadas certeiras.'], n: (c) => c.l.cab },
  { id: 'cabeca', cat: 'estilo', peso: 35, ok: (c) => c.l.cab === 1, t: ['🗣️ Golo de cabeça.', '🗣️ Marcou de cabeça.', '🗣️ Uma cabeçada certeira.'] },
  { id: 'ambidestro', cat: 'estilo', peso: 40, ok: (c) => c.l.pd >= 1 && c.l.pe >= 1, t: ['🦶🦶 Marcou com os dois pés.', '🦶🦶 Direito e esquerdo: tanto faz.', '🦶🦶 Ambidestro esta noite.'], priv: true },
  { id: 'perfeito', cat: 'golo', peso: 85, ok: (c) => c.l.pd >= 1 && c.l.pe >= 1 && c.l.cab >= 1, t: ['💎 Hat-trick perfeito: direito, esquerdo e cabeça.', '💎 Golo com cada pé e outro de cabeça.', '💎 O pacote completo: pés e cabeça.'], priv: true },
  { id: 'penalti', cat: 'bolaParada', peso: 25, ok: (c) => c.l.pen >= 1, t: ['🎯 Penálti convertido.', '🎯 Frio na marca de penálti.', '🎯 Não tremeu do penálti.'] },
  { id: 'penaltiFalhado', cat: 'bolaParada', peso: 18, ok: (c) => c.l.penF >= 1 && c.l.pen === 0, t: ['😬 O penálti não entrou desta vez.', '😬 Penálti falhado — fica para a próxima.', '😬 A marca de penálti não foi amiga.'] },
  { id: 'autogolo', cat: 'azar', peso: 22, ok: (c) => c.l.ag >= 1, t: ['🙃 Um autogolo para a coleção.', '🙃 Marcou… na baliza errada.', '🙃 Azar: autogolo.'] },
  { id: 'goloGR', cat: 'raro', peso: 65, ok: (c) => c.l.goloGR, t: ['🧤⚽ Marcou enquanto estava na baliza!', '🧤⚽ Golo do guarda-redes.', '🧤⚽ Saiu da baliza e marcou.'] },
  { id: 'assistGR', cat: 'raro', peso: 45, ok: (c) => c.l.assistGR && !c.l.goloGR, t: ['🧤🅰️ Assistência a partir da baliza.', '🧤🅰️ Na baliza e ainda assistiu.', '🧤🅰️ Lançou o ataque e deu golo.'] },
  { id: 'fimJejum', cat: 'historia', peso: 50, ok: (c) => c.l.g > 0 && c.h.semMarcar >= 3, t: ['🌧️→☀️ Voltou a marcar ao fim de {n} jogos.', '🌧️→☀️ Acabou o jejum de {n} jogos.', '🌧️→☀️ {n} jogos depois, golo outra vez.'], n: (c) => c.h.semMarcar },
  { id: 'primeiroCarreira', cat: 'historia', peso: 70, ok: (c) => c.l.g > 0 && c.h.n > 0 && c.h.g === 0, t: ['🎉 O primeiro golo registado na app!', '🎉 Estreou-se a marcar.', '🎉 Primeiro golo — o primeiro de muitos.'] },
  { id: 'seqGolos', cat: 'historia', peso: 60, ok: (c) => c.l.g > 0 && c.h.comGolo >= 2, t: ['🔥 {n} jogos seguidos a marcar.', '🔥 Está numa série de {n} jogos com golo.', '🔥 Não falha: {n} jogos seguidos a marcar.'], n: (c) => c.h.comGolo + 1 },
  { id: 'recordeGolos', cat: 'recorde', peso: 65, ok: (c) => c.l.g >= 2 && c.h.n >= 2 && c.l.g > c.h.maxG, t: ['📈 Recorde pessoal: {g} golos num jogo.', '📈 Nunca tinha marcado tantos: {g}.', '📈 Bateu o seu máximo de golos ({g}).'] },
  // Assistências
  { id: 'assist3', cat: 'passe', peso: 70, ok: (c) => c.l.a >= 3, t: ['🅰️ {a} assistências — o maestro.', '🎼 {a} passes para golo.', '🅰️ Distribuiu jogo: {a} assistências.'] },
  { id: 'assist2', cat: 'passe', peso: 45, ok: (c) => c.l.a === 2, t: ['🅰️ Duas assistências.', '🅰️ Serviu dois golos.', '🅰️ 2 passes que deram golo.'] },
  { id: 'assist1', cat: 'passe', peso: 15, ok: (c) => c.l.a === 1, t: ['🅰️ Uma assistência.', '🅰️ Deu um golo a marcar.', '🅰️ Passe para golo.'] },
  { id: 'maisAssist', cat: 'destaque', peso: 50, ok: (c) => c.dj.topA === c.pid && c.dj.topG !== c.pid, t: ['🎼 Quem mais assistiu no jogo ({a}).', '🎼 O rei das assistências da noite.', '🎼 Ninguém deu mais golos a marcar: {a}.'] },
  { id: 'golosEAssist', cat: 'completo', peso: 35, ok: (c) => c.l.g >= 1 && c.l.a >= 1, t: ['⚽🅰️ Marcou e assistiu.', '⚽🅰️ Golo e assistência: jogo completo.', '⚽🅰️ {g} golo(s) e {a} assistência(s).'] },
  { id: 'maisDecisivo', cat: 'destaque', peso: 58, ok: (c) => c.dj.topGA === c.pid && c.dj.topG !== c.pid && c.dj.topA !== c.pid, t: ['⭐ O mais influente do jogo: {g} golos + {a} assistências.', '⭐ Esteve em mais golos do que ninguém.', '⭐ Golos e assistências: o mais decisivo.'] },
  { id: 'envolvidoTodos', cat: 'equipa', peso: 75, ok: (c) => c.l.envolvidoTodos, t: ['🧩 Esteve em TODOS os golos da equipa ({gm}).', '🧩 Nenhum golo da equipa sem ele.', '🧩 {gm} golos da equipa, {gm} com a sua participação.'] },
  { id: 'envolvido', cat: 'equipa', peso: 55, ok: (c) => !c.l.envolvidoTodos && c.l.gm >= 3 && c.l.envolvido >= 0.6, t: ['🧩 Participou em {p}% dos golos da equipa.', '🧩 Esteve em {p}% dos golos.', '🧩 A equipa marcou e ele estava lá: {p}%.'], p: (c) => Math.round(c.l.envolvido * 100) },
  { id: 'dupla', cat: 'dupla', peso: 45, ok: (c) => !!c.l.parc, t: ['🤜🤛 Dupla do jogo com {parc} ({n} golos juntos).', '🤜🤛 Ligação afinada com {parc}.', '🤜🤛 {parc} e ele: {n} golos a meias.'], n: (c) => c.l.parc?.n },
  { id: 'recordeAssist', cat: 'recorde', peso: 60, ok: (c) => c.l.a >= 2 && c.h.n >= 2 && c.l.a > c.h.maxA, t: ['📈 Recorde pessoal de assistências: {a}.', '📈 Nunca tinha assistido tanto: {a}.', '📈 Bateu o seu máximo de assistências.'] },
  // Baliza
  { id: 'muralha', cat: 'baliza', peso: 70, ok: (c) => c.l.minGR >= 10 && c.l.sofrGR === 0, t: ['🧱 Muralha: {gr} min na baliza sem sofrer.', '🧱 {gr} minutos de baliza fechada.', '🧱 Ninguém passou: {gr} min a zeros.'] },
  { id: 'semSofrer', cat: 'baliza', peso: 45, ok: (c) => c.l.minGR >= 5 && c.l.minGR < 10 && c.l.sofrGR === 0, t: ['🧤 Baliza a zeros nos {gr} min em que lá esteve.', '🧤 {gr} min na baliza, 0 sofridos.', '🧤 Não sofreu enquanto esteve na baliza.'] },
  { id: 'penaltiDefendido', cat: 'baliza', peso: 75, ok: (c) => c.l.penDef >= 1, t: ['🧤🎯 Defendeu um penálti!', '🧤🎯 Penálti defendido.', '🧤🎯 Adivinhou o lado e defendeu o penálti.'] },
  { id: 'maisBaliza', cat: 'baliza2', peso: 22, ok: (c) => c.dj.topGR === c.pid && c.l.minGR >= 8, t: ['🧤 Quem mais tempo esteve na baliza ({gr} min).', '🧤 Aguentou a baliza {gr} minutos.', '🧤 O dono da baliza esta noite.'] },
  { id: 'grDificil', cat: 'baliza2', peso: 12, ok: (c) => c.l.sofrGR >= 5, t: ['🥵 Tarde difícil na baliza ({sofr} sofridos).', '🥵 A baliza esteve movimentada: {sofr}.', '🥵 {sofr} golos sofridos — há dias assim.'] },
  { id: 'grPoucoSofreu', cat: 'baliza', peso: 35, ok: (c) => c.l.minGR >= 10 && c.l.sofrGR === 1, t: ['🧤 {gr} min na baliza e só 1 sofrido.', '🧤 Só um golo em {gr} minutos de baliza.', '🧤 Baliza quase fechada: 1 em {gr} min.'] },
  // Resultado
  { id: 'goleada', cat: 'resultado', peso: 40, ok: (c) => c.l.res === 'V' && c.l.dif >= 5, t: ['💥 Goleada: venceram por {dif}.', '💥 Vitória por {dif} golos de diferença.', '💥 {gm}–{gs}: sem discussão.'] },
  { id: 'apertada', cat: 'resultado', peso: 30, ok: (c) => c.l.res === 'V' && c.l.dif === 1, t: ['😅 Vitória pela margem mínima.', '😅 Ganharam por um golo — sofrido até ao fim.', '😅 {gm}–{gs}: nervos até ao apito.'] },
  { id: 'vitoria', cat: 'resultado', peso: 12, ok: (c) => c.l.res === 'V' && c.l.dif > 1 && c.l.dif < 5, t: ['✅ Vitória ({gm}–{gs}).', '✅ Mais três pontos.', '✅ Saiu a ganhar.'] },
  { id: 'empate', cat: 'resultado', peso: 10, ok: (c) => c.l.res === 'E', t: ['🤝 Empate ({gm}–{gs}).', '🤝 Ninguém ganhou, ninguém perdeu.', '🤝 Divisão de pontos.'] },
  { id: 'derrotaPesada', cat: 'resultado', peso: 8, ok: (c) => c.l.res === 'D' && c.l.dif <= -5, t: ['🌧️ Noite para esquecer ({gm}–{gs}).', '🌧️ Derrota pesada — a próxima é nossa.', '🌧️ Há jogos assim.'] },
  { id: 'derrota', cat: 'resultado', peso: 6, ok: (c) => c.l.res === 'D' && c.l.dif > -5, t: ['➖ Derrota ({gm}–{gs}).', '➖ Não deu desta vez.', '➖ Ficou a faltar pouco.'] },
  { id: 'honra', cat: 'garra', peso: 35, ok: (c) => c.l.res === 'D' && c.l.g >= 2, t: ['💪 {g} golos mesmo na derrota.', '💪 Fez a parte dele: {g} golos.', '💪 Não baixou os braços: {g} golos.'] },
  { id: 'remontada', cat: 'garra', peso: 55, ok: (c) => c.l.res === 'V' && c.l.pior <= -2, t: ['🔄 Estiveram a perder por {n} e ganharam.', '🔄 Reviravolta de {n} golos.', '🔄 Recuperaram de {n} golos de desvantagem.'], n: (c) => -c.l.pior },
  { id: 'seqVitorias', cat: 'serie', peso: 55, ok: (c) => c.l.res === 'V' && c.h.vitorias >= 2, t: ['📈 {n} vitórias seguidas.', '📈 Série de {n} jogos a ganhar.', '📈 Não sabe perder: {n} vitórias seguidas.'], n: (c) => c.h.vitorias + 1 },
  { id: 'fimDerrotas', cat: 'serie', peso: 45, ok: (c) => c.l.res === 'V' && c.h.derrotas >= 3, t: ['🌅 Voltou a ganhar ao fim de {n} derrotas.', '🌅 Acabou a série negra.', '🌅 Vitória que sabe a alívio.'], n: (c) => c.h.derrotas },
  { id: 'invicto', cat: 'serie', peso: 50, ok: (c) => c.l.res !== 'D' && c.h.invicto >= 4, t: ['🛡️ {n} jogos sem perder.', '🛡️ Invicto há {n} jogos.', '🛡️ A derrota não o conhece há {n} jogos.'], n: (c) => c.h.invicto + 1 },
  { id: 'jogoLouco', cat: 'jogo', peso: 20, ok: (c) => c.l.gm + c.l.gs >= 16, t: ['🎢 Jogo de loucos: {tot} golos.', '🎢 {tot} golos — ninguém se aborreceu.', '🎢 Festival de golos ({tot}).'], tot: (c) => c.l.gm + c.l.gs },
  { id: 'equipa10', cat: 'jogo', peso: 28, ok: (c) => c.l.gm >= 10, t: ['🎯 A equipa marcou {gm}.', '🎯 {gm} golos da equipa: ataque em dia.', '🎯 Dois dígitos no marcador: {gm}.'] },
  { id: 'defesaFerro', cat: 'jogo', peso: 38, ok: (c) => c.l.durMin >= 30 && c.l.gs <= 2, t: ['🔒 A equipa só sofreu {gs}.', '🔒 Defesa de ferro: {gs} sofridos.', '🔒 Quase nada passou: {gs}.'] },
  // Marcos
  { id: 'estreia', cat: 'marco', peso: 60, ok: (c) => c.h.n === 0, t: ['🌱 Estreia na app!', '🌱 O primeiro jogo registado.', '🌱 Bem-vindo à futebolada.'] },
  { id: 'jogoN', cat: 'marco', peso: 70, ok: (c) => [10, 25, 50, 75, 100, 150, 200].includes(c.h.n + 1), t: ['🎖️ {n}.º jogo!', '🎖️ Chegou aos {n} jogos.', '🎖️ {n} jogos de futebolada.'], n: (c) => c.h.n + 1 },
  { id: 'golosN', cat: 'marco', peso: 75, ok: (c) => !!passou(c.h.g, c.h.g + c.l.g, [10, 25, 50, 75, 100, 150, 200]), t: ['🎖️ Chegou aos {n} golos!', '🎖️ {n} golos na carreira.', '🎖️ Passou a barreira dos {n} golos.'], n: (c) => passou(c.h.g, c.h.g + c.l.g, [10, 25, 50, 75, 100, 150, 200]) },
  { id: 'assistN', cat: 'marco', peso: 70, ok: (c) => !!passou(c.h.a, c.h.a + c.l.a, [10, 25, 50, 75, 100]), t: ['🎖️ {n} assistências na carreira!', '🎖️ Chegou às {n} assistências.', '🎖️ Já deu {n} golos a marcar.'], n: (c) => passou(c.h.a, c.h.a + c.l.a, [10, 25, 50, 75, 100]) },
  { id: 'regresso', cat: 'marco', peso: 35, ok: (c) => c.h.n > 0 && c.h.ultimoEpoch && c.l.epoch - c.h.ultimoEpoch > 27 * 86400000, t: ['👋 Regresso ao fim de {n} semanas.', '👋 Voltou ao campo: {n} semanas depois.', '👋 Que saudades: {n} semanas sem jogar.'], n: (c) => Math.round((c.l.epoch - c.h.ultimoEpoch) / (7 * 86400000)) },
  // Físico (relógio) — só o próprio vê
  { id: 'kmRecorde', cat: 'fisico', priv: true, peso: 60, ok: (c) => c.f && c.hf.n >= 2 && c.f.m > c.hf.maxM, t: ['🏃 Recorde de distância: {km} km.', '🏃 Nunca tinha corrido tanto num jogo: {km} km.', '🏃 {km} km — novo máximo.'] },
  { id: 'kmMuito', cat: 'fisico', priv: true, peso: 30, ok: (c) => c.f && c.f.m >= 4000, t: ['🏃 {km} km percorridos.', '🏃 Correu {km} km.', '🏃 {km} km nas pernas.'] },
  { id: 'kmPouco', cat: 'fisico', priv: true, peso: 5, ok: (c) => c.f && c.f.m > 0 && c.f.m < 4000, t: ['🏃 {km} km percorridos.', '🏃 Distância: {km} km.', '🏃 {km} km neste jogo.'] },
  { id: 'vmaxRecorde', cat: 'velocidade', priv: true, peso: 60, ok: (c) => c.f?.vmax && c.hf.n >= 2 && c.f.vmax.kmh > c.hf.maxV, t: ['💨 Recorde de velocidade: {kmh} km/h.', '💨 Nunca tinha ido tão rápido: {kmh} km/h.', '💨 {kmh} km/h — novo máximo.'] },
  { id: 'vmaxAlta', cat: 'velocidade', priv: true, peso: 40, ok: (c) => c.f?.vmax?.kmh >= 24, t: ['💨 Pico de {kmh} km/h ao minuto {t}.', '💨 Chegou aos {kmh} km/h.', '💨 Velocidade máxima de {kmh} km/h.'] },
  { id: 'vmax', cat: 'velocidade', priv: true, peso: 8, ok: (c) => c.f?.vmax?.kmh > 0 && c.f.vmax.kmh < 24, t: ['💨 Velocidade máxima: {kmh} km/h.', '💨 Pico de {kmh} km/h.', '💨 Mais rápido: {kmh} km/h ao minuto {t}.'] },
  { id: 'sprintsRecorde', cat: 'sprint', priv: true, peso: 55, ok: (c) => c.f && c.hf.n >= 2 && c.f.nSprints > c.hf.maxS && c.f.nSprints >= 3, t: ['⚡ Recorde de sprints: {sp}.', '⚡ {sp} sprints — nunca tinha feito tantos.', '⚡ Novo máximo de sprints ({sp}).'] },
  { id: 'sprintsMuitos', cat: 'sprint', priv: true, peso: 38, ok: (c) => c.f?.nSprints >= 10, t: ['⚡ {sp} sprints no jogo.', '⚡ Pegou fogo ao campo: {sp} sprints.', '⚡ {sp} arranques a fundo.'] },
  { id: 'sprints', cat: 'sprint', priv: true, peso: 10, ok: (c) => c.f?.nSprints >= 1 && c.f.nSprints < 10, t: ['⚡ {sp} sprint(s).', '⚡ Fez {sp} sprint(s).', '⚡ Sprints: {sp}.'] },
  { id: 'intenso', cat: 'intensidade', priv: true, peso: 35, ok: (c) => c.f && c.altaPct >= 15, t: ['🔥 {p}% do tempo a correr ou em sprint.', '🔥 Jogo intenso: {p}% a alta velocidade.', '🔥 {p}% do jogo no vermelho.'], p: (c) => c.altaPct },
  { id: 'atacante', cat: 'zona', priv: true, peso: 30, ok: (c) => c.ter && c.ter.ata >= 45, t: ['🗺️ {p}% do tempo no terço de ataque.', '🗺️ Viveu perto da baliza deles ({p}%).', '🗺️ Jogo de avançado: {p}% no ataque.'], p: (c) => c.ter?.ata },
  { id: 'defensivo', cat: 'zona', priv: true, peso: 30, ok: (c) => c.ter && c.ter.def >= 45, t: ['🗺️ {p}% do tempo no terço defensivo.', '🗺️ Guardou a casa: {p}% atrás.', '🗺️ Jogo de defesa: {p}% no próprio terço.'], p: (c) => c.ter?.def },
  { id: 'omnipresente', cat: 'zona', priv: true, peso: 30, ok: (c) => c.ter && [c.ter.def, c.ter.meio, c.ter.ata].every((x) => x >= 25 && x <= 42), t: ['🗺️ Esteve em todo o lado.', '🗺️ Campo todo: defesa, meio e ataque por igual.', '🗺️ Omnipresente.'] },
  // Sempre há uma frase
  { id: 'presenca', cat: 'base', peso: 1, ok: () => true, t: ['⚽ {min} minutos de futebolada.', '⚽ Mais um jogo nas pernas: {min} min.', '⚽ Esteve lá — {min} minutos.'] },
];

function preencher(txt, c, r) {
  const v = { g: c.l.g, a: c.l.a, gm: c.l.gm, gs: c.l.gs, min: c.l.durMin, gr: c.l.minGR, sofr: c.l.sofrGR, dif: Math.abs(c.l.dif),
    parc: c.l.parc?.nome || '', km: c.f ? (c.f.m / 1000).toFixed(2).replace('.', ',') : '', kmh: c.f?.vmax ? String(c.f.vmax.kmh).replace('.', ',') : '',
    sp: c.f?.nSprints ?? '', t: c.f?.vmax ? Math.max(1, Math.round(c.f.vmax.t / MIN)) : '',
    n: r.n ? r.n(c) : '', p: r.p ? r.p(c) : '', tot: r.tot ? r.tot(c) : '' };
  return txt.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
}

// DNA de um jogador num jogo. jogos = todos os jogos terminados (para o histórico); fis = resumoFisico deste jogo
// (opcional) e fisAntes = resumos físicos dos jogos anteriores. publico: true deixa de fora o que vem do relógio.
// Regra de atribuição: as regras que se aplicam, por peso (as mais raras primeiro), no máximo 1 por categoria,
// até 3 frases; a maneira de dizer escolhe-se pelo jogo + jogador (fica sempre a mesma).
export function dnaJogo(j, pid, jogos, { fis = null, fisAntes = [], publico = false, max = 3 } = {}) {
  const l = linhaJogo(j, pid);
  if (!l) return [];
  const antes = historico(jogos, pid).filter((x) => (x.j.inicioEpoch || 0) < (j.inicioEpoch || 0));
  const hf = { n: fisAntes.length, maxM: Math.max(0, ...fisAntes.map((x) => x?.m || 0)), maxV: Math.max(0, ...fisAntes.map((x) => x?.vmax?.kmh || 0)), maxS: Math.max(0, ...fisAntes.map((x) => x?.nSprints || 0)) };
  const zs = fis?.zonas || [];
  const totZ = zs.reduce((s, z) => s + z[0], 0);
  const c = { j, pid, l, h: contexto(antes), dj: doJogo(j), f: publico ? null : fis, hf,
    altaPct: totZ ? Math.round(((zs[3]?.[0] || 0) + (zs[4]?.[0] || 0)) / totZ * 100) : 0, ter: null };
  if (!publico && fis?.grelha) {
    const col = Array.from({ length: fis.grelha.nx }, (_, x) => fis.grelha.s.reduce((t, r) => t + r[x], 0));
    const tot = col.reduce((a, b) => a + b, 0) || 1, t3 = Math.round(fis.grelha.nx / 3);
    const parte = (a, b) => Math.round(col.slice(a, b).reduce((x, y) => x + y, 0) / tot * 100);
    if (fis.grelha.orientado) c.ter = { def: parte(0, t3), meio: parte(t3, fis.grelha.nx - t3), ata: parte(fis.grelha.nx - t3, fis.grelha.nx) };
  }
  const hits = DNA.filter((r) => (!publico || !r.priv) && (() => { try { return r.ok(c); } catch { return false; } })())
    .sort((a, b) => b.peso - a.peso || a.id.localeCompare(b.id));
  const out = [], cats = new Set();
  for (const r of hits) {
    if (out.length >= max) break;
    if (cats.has(r.cat) || (r.id === 'presenca' && out.length)) continue;
    cats.add(r.cat);
    const txt = r.t[hash(`${l.id}|${pid}|${r.id}`) % r.t.length];
    out.push({ id: r.id, peso: r.peso, priv: !!r.priv, txt: preencher(txt, c, r) });
  }
  return out;
}
export const totalFrasesDNA = () => DNA.reduce((s, r) => s + r.t.length, 0);

// ---------- Recordes pessoais ----------
// Por jogo (melhor marca e quando) e séries. fisPorJogo = { idDoJogo: resumoFisico } (só para o próprio).
export function recordes(jogos, pid, fisPorJogo = {}) {
  const H = historico(jogos, pid);
  if (!H.length) return [];
  const R = [];
  const melhor = (k, nome, val, fmt = (v) => v, min = 1) => {
    let m = null;
    for (const { l } of H) { const v = val(l); if (v != null && v >= min && (!m || v > m.v)) m = { v, l }; }
    if (m) R.push({ k, nome, valor: fmt(m.v), data: m.l.data, jogo: m.l.id });
  };
  melhor('g', 'Golos num jogo', (l) => l.g);
  melhor('a', 'Assistências num jogo', (l) => l.a);
  melhor('ga', 'Golos + assistências num jogo', (l) => l.g + l.a);
  melhor('gr0', 'Minutos na baliza sem sofrer', (l) => (l.sofrGR === 0 ? l.minGR : null), (v) => `${v} min`, 5);
  melhor('vit', 'Maior vitória', (l) => (l.res === 'V' ? l.dif : null), (v) => `+${v}`);
  const serie = (k, nome, f) => { let n = 0, m = 0, fim = null; for (const { l } of H) { n = f(l) ? n + 1 : 0; if (n > m) { m = n; fim = l; } } if (m >= 2) R.push({ k, nome, valor: m, data: fim.data, jogo: fim.id }); };
  serie('seqV', 'Vitórias seguidas', (l) => l.res === 'V');
  serie('seqInv', 'Jogos seguidos sem perder', (l) => l.res !== 'D');
  serie('seqG', 'Jogos seguidos a marcar', (l) => l.g > 0);
  const F = H.map(({ l }) => ({ l, f: fisPorJogo[l.id] })).filter((x) => x.f);
  const melhorF = (k, nome, val, fmt) => { let m = null; for (const { l, f } of F) { const v = val(f); if (v && (!m || v > m.v)) m = { v, l }; } if (m) R.push({ k, nome, valor: fmt(m.v), data: m.l.data, jogo: m.l.id, priv: true }); };
  melhorF('km', 'Distância num jogo', (f) => f.m, (v) => `${(v / 1000).toFixed(2).replace('.', ',')} km`);
  melhorF('vmax', 'Velocidade máxima', (f) => f.vmax?.kmh, (v) => `${String(v).replace('.', ',')} km/h`);
  melhorF('sp', 'Sprints num jogo', (f) => f.nSprints, (v) => v);
  return R;
}

// ---------- Tendências da época ----------
// Por mês: jogos, golos, assistências, pontos e % de vitórias (e km/sprints de quem tem relógio).
export function tendencias(jogos, pid, { epoca = null, fisPorJogo = {} } = {}) {
  const H = historico(jogos, pid).filter(({ l }) => !epoca || epocaDe(l.data) === epoca);
  const M = {};
  for (const { l } of H) {
    const k = l.data.slice(0, 7);
    const m = (M[k] ||= { mes: k, j: 0, jReg: 0, g: 0, a: 0, v: 0, e: 0, d: 0, minGR: 0, m: 0, nf: 0, sp: 0 });
    m.j++; if (l.reg) m.jReg++; m.g += l.g; m.a += l.a; m[l.res === 'V' ? 'v' : l.res === 'E' ? 'e' : 'd']++; m.minGR += l.minGR;
    const f = fisPorJogo[l.id]; if (f) { m.m += f.m || 0; m.sp += f.nSprints || 0; m.nf++; }
  }
  return Object.values(M).sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => ({
    ...m, pts: m.v * 3 + m.e, ptsJ: m.j ? (m.v * 3 + m.e) / m.j : 0, pv: m.j ? m.v / m.j : 0,
    gj: m.jReg ? m.g / m.jReg : null, aj: m.jReg ? m.a / m.jReg : null, kmJ: m.nf ? m.m / m.nf / 1000 : null, spJ: m.nf ? m.sp / m.nf : null,
  }));
}
// Sentido da época: compara a 1.ª metade com a 2.ª (golos/jogo e pontos/jogo). null com menos de 4 jogos.
export function sentidoEpoca(meses) {
  const L = meses.flatMap((m) => Array(m.j).fill(m));
  if (L.length < 4) return null;
  const meio = Math.floor(meses.length / 2) || 1, A = meses.slice(0, meio), B = meses.slice(meio);
  const med = (X, k) => { const j = X.reduce((s, m) => s + m.j, 0); return j ? X.reduce((s, m) => s + m[k], 0) / j : 0; };
  return { golos: med(B, 'g') - med(A, 'g'), pontos: med(B, 'pts') - med(A, 'pts') };
}

// ---------- Desafios semanais e mensais ----------
// Iguais para todos (sorteados pela semana/mês), menos os do relógio, que só aparecem a quem o usa.
// medir(L, F) recebe as linhas dos jogos do período e os resumos físicos desses jogos → valor atual.
const soma = (L, k) => L.reduce((s, l) => s + (l[k] || 0), 0);
export const DESAFIOS = [
  // Semana (um jogo por semana)
  { id: 's-golo', tipo: 'semana', txt: 'Marca pelo menos 1 golo', alvo: 1, medir: (L) => soma(L, 'g') },
  { id: 's-2golos', tipo: 'semana', txt: 'Marca 2 golos', alvo: 2, medir: (L) => soma(L, 'g') },
  { id: 's-assist', tipo: 'semana', txt: 'Faz 1 assistência', alvo: 1, medir: (L) => soma(L, 'a') },
  { id: 's-ga2', tipo: 'semana', txt: 'Participa em 2 golos (golo ou assistência)', alvo: 2, medir: (L) => soma(L, 'g') + soma(L, 'a') },
  { id: 's-ga', tipo: 'semana', txt: 'Marca e assiste no mesmo jogo', alvo: 1, medir: (L) => L.filter((l) => l.g && l.a).length },
  { id: 's-ganhar', tipo: 'semana', txt: 'Ganha o jogo', alvo: 1, medir: (L) => L.filter((l) => l.res === 'V').length },
  { id: 's-naoperder', tipo: 'semana', txt: 'Não percas o jogo', alvo: 1, medir: (L) => L.filter((l) => l.res !== 'D').length },
  { id: 's-gr0', tipo: 'semana', txt: '5 min na baliza sem sofrer', alvo: 1, medir: (L) => L.filter((l) => l.minGR >= 5 && l.sofrGR === 0).length },
  { id: 's-gr10', tipo: 'semana', txt: 'Joga 10 min na baliza', alvo: 10, medir: (L) => soma(L, 'minGR'), un: 'min' },
  { id: 's-primeiro', tipo: 'semana', txt: 'Marca o primeiro golo do jogo', alvo: 1, medir: (L) => L.filter((l) => l.primeiro).length },
  { id: 's-cabeca', tipo: 'semana', txt: 'Marca de cabeça', alvo: 1, medir: (L) => soma(L, 'cab') },
  { id: 's-equipa8', tipo: 'semana', txt: 'A tua equipa marca 8 ou mais', alvo: 1, medir: (L) => L.filter((l) => l.gm >= 8).length },
  { id: 's-km3', tipo: 'semana', rel: true, txt: 'Corre 3 km num jogo', alvo: 3, medir: (L, F) => Math.max(0, ...F.map((f) => (f?.m || 0) / 1000)), un: 'km' },
  { id: 's-sprints6', tipo: 'semana', rel: true, txt: 'Faz 6 sprints', alvo: 6, medir: (L, F) => F.reduce((s, f) => s + (f?.nSprints || 0), 0) },
  { id: 's-vmax20', tipo: 'semana', rel: true, txt: 'Passa dos 20 km/h', alvo: 20, medir: (L, F) => Math.max(0, ...F.map((f) => f?.vmax?.kmh || 0)), un: 'km/h' },
  // Mês
  { id: 'm-3jogos', tipo: 'mes', txt: 'Joga 3 jogos', alvo: 3, medir: (L) => L.length },
  { id: 'm-4golos', tipo: 'mes', txt: 'Marca 4 golos', alvo: 4, medir: (L) => soma(L, 'g') },
  { id: 'm-6golos', tipo: 'mes', txt: 'Marca 6 golos', alvo: 6, medir: (L) => soma(L, 'g') },
  { id: 'm-3assist', tipo: 'mes', txt: 'Faz 3 assistências', alvo: 3, medir: (L) => soma(L, 'a') },
  { id: 'm-ga8', tipo: 'mes', txt: 'Participa em 8 golos', alvo: 8, medir: (L) => soma(L, 'g') + soma(L, 'a') },
  { id: 'm-2vitorias', tipo: 'mes', txt: 'Ganha 2 jogos', alvo: 2, medir: (L) => L.filter((l) => l.res === 'V').length },
  { id: 'm-150min', tipo: 'mes', txt: '150 minutos em jogo', alvo: 150, medir: (L) => soma(L, 'durMin'), un: 'min' },
  { id: 'm-gr30', tipo: 'mes', txt: '30 minutos na baliza', alvo: 30, medir: (L) => soma(L, 'minGR'), un: 'min' },
  { id: 'm-marcar2', tipo: 'mes', txt: 'Marca em 2 jogos diferentes', alvo: 2, medir: (L) => L.filter((l) => l.g > 0).length },
  { id: 'm-zeros', tipo: 'mes', txt: '2 vezes 5+ min na baliza sem sofrer', alvo: 2, medir: (L) => L.filter((l) => l.minGR >= 5 && l.sofrGR === 0).length },
  { id: 'm-invicto', tipo: 'mes', txt: 'Fecha o mês sem derrotas (mín. 2 jogos)', alvo: 2, medir: (L) => (L.some((l) => l.res === 'D') ? 0 : L.length) },
  { id: 'm-km10', tipo: 'mes', rel: true, txt: 'Corre 10 km no mês', alvo: 10, medir: (L, F) => F.reduce((s, f) => s + (f?.m || 0), 0) / 1000, un: 'km' },
  { id: 'm-sprints25', tipo: 'mes', rel: true, txt: 'Faz 25 sprints no mês', alvo: 25, medir: (L, F) => F.reduce((s, f) => s + (f?.nSprints || 0), 0) },
];
const semanaISO = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia); const a = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-S${String(Math.ceil(((t - a) / 86400000 + 1) / 7)).padStart(2, '0')}`; };
const limitesSemana = (d) => { const i = new Date(d); i.setHours(0, 0, 0, 0); i.setDate(i.getDate() - ((i.getDay() + 6) % 7)); const f = new Date(i); f.setDate(f.getDate() + 7); return [i.getTime(), f.getTime()]; };
const limitesMes = (d) => [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()];
function sortear(pool, chave, n) { return [...pool].sort((a, b) => hash(chave + a.id) - hash(chave + b.id)).slice(0, n); }

// Desafios ativos de um jogador (semana e mês da data dada), com o progresso.
// temRelogio: se tem dados do relógio (senão os desafios ⌚ não lhe aparecem e entram outros no lugar).
export function desafiosAtivos(jogos, pid, { agora = new Date(), fisPorJogo = {}, temRelogio = false, nSemana = 2, nMes = 3 } = {}) {
  const H = historico(jogos, pid);
  const periodo = ([a, b]) => H.filter(({ l }) => l.epoch >= a && l.epoch < b).map(({ l }) => l);
  const faz = (tipo, chave, lim, n) => {
    const pool = DESAFIOS.filter((d) => d.tipo === tipo && (temRelogio || !d.rel));
    const L = periodo(lim), F = L.map((l) => fisPorJogo[l.id]).filter(Boolean);
    return sortear(pool, chave, n).map((d) => { const v = d.medir(L, F); return { id: d.id, tipo, periodo: chave, txt: d.txt, alvo: d.alvo, un: d.un || '', rel: !!d.rel,
      valor: Math.round(v * 10) / 10, feito: v >= d.alvo, pct: Math.min(100, Math.round((v / d.alvo) * 100)), fim: lim[1] }; });
  };
  return [...faz('semana', semanaISO(agora), limitesSemana(agora), nSemana), ...faz('mes', agora.toISOString().slice(0, 7), limitesMes(agora), nMes)];
}
// Quantos desafios já cumpriu (histórico, para mostrar "12 desafios cumpridos"): percorre semanas e meses com jogos.
export function desafiosCumpridos(jogos, pid, opts = {}) {
  const H = historico(jogos, pid);
  const vistos = new Set(), ok = [];
  for (const { l } of H) {
    const d = new Date(l.epoch);
    for (const x of desafiosAtivos(jogos, pid, { ...opts, agora: d })) {
      const k = x.periodo + x.id;
      if (vistos.has(k)) continue;
      vistos.add(k);
      if (x.feito) ok.push(x);
    }
  }
  return ok;
}

// ---------- Cartão partilhável ----------
// Tudo o que o cartão de um jogo precisa. Com proprio = false só sai o que é público (sem relógio nem pé).
export function dadosCartao(j, pid, jogos, { fis = null, fisAntes = [], proprio = false } = {}) {
  const l = linhaJogo(j, pid);
  if (!l) return null;
  const nome = [...(j.brancos || []), ...(j.pretos || [])].find((x) => x.id === pid)?.nome || '';
  return {
    nome, data: l.data, equipa: l.eq, res: l.res, placar: { nosso: l.gm, deles: l.gs }, g: l.g, a: l.a, minGR: l.minGR, sofrGR: l.sofrGR,
    dna: dnaJogo(j, pid, jogos, { fis, fisAntes, publico: !proprio }).map((x) => x.txt),
    fisico: proprio && fis ? { km: Math.round(fis.m / 10) / 100, vmax: fis.vmax?.kmh ?? null, sprints: fis.nSprints, grelha: fis.grelha || null } : null,
  };
}

// ---------- Medalhas ----------
// 15 medalhas aprovadas pelo Rui (28/10), cada uma com 3 níveis (🥉 🥈 🥇) e progresso para o seguinte.
// Guarda-redes conta turnos SEM SOFRER e a Muralha o maior período seguido sem sofrer (decisão do Rui: não minutos na baliza).
// Tudo calculado na hora a partir dos jogos (nada guardado); as do relógio só aparecem a quem o tem.
const TURNO_MIN = 3 * MIN;   // um turno na baliza só conta para o Guarda-redes se durar 3+ min
function balizaDe(j, pid) {
  const tur = (j.turnos || []).filter((t) => t.jogador === pid);
  const sofridos = (j.eventos || []).filter((e) => grSofreu(j, e) === pid && tur.some((t) => e.t >= t.de && e.t < t.ate)).map((e) => e.t);
  let limpos = 0, melhor = 0;
  for (const t of tur) {
    const dentro = sofridos.filter((x) => x >= t.de && x < t.ate).sort((a, b) => a - b);
    if (!dentro.length && t.ate - t.de >= TURNO_MIN) limpos++;
    const marcos = [t.de, ...dentro, t.ate];
    for (let i = 1; i < marcos.length; i++) melhor = Math.max(melhor, marcos[i] - marcos[i - 1]);
  }
  return { limpos, melhor: Math.floor(melhor / MIN) };
}
export const MEDALHAS = [
  { id: 'goleador', icone: '⚽', nome: 'Goleador', un: 'golos', niveis: [10, 50, 100], tipo: 'carreira', medir: (c) => c.H.reduce((s, x) => s + x.l.g, 0) },
  { id: 'assistente', icone: '🅰️', nome: 'Assistente', un: 'assistências', niveis: [10, 30, 60], tipo: 'carreira', medir: (c) => c.H.reduce((s, x) => s + x.l.a, 0) },
  { id: 'fiel', icone: '🏟️', nome: 'Fiel', un: 'jogos', niveis: [10, 50, 100], tipo: 'carreira', medir: (c) => c.H.length },
  { id: 'vencedor', icone: '🏆', nome: 'Vencedor', un: 'vitórias', niveis: [10, 30, 60], tipo: 'carreira', medir: (c) => c.H.filter((x) => x.l.res === 'V').length },
  { id: 'guardaRedes', icone: '🧤', nome: 'Guarda-redes', un: 'turnos sem sofrer', niveis: [5, 20, 50], tipo: 'carreira', medir: (c) => c.H.reduce((s, x) => s + balizaDe(x.j, c.pid).limpos, 0) },
  { id: 'muralha', icone: '🧱', nome: 'Muralha', un: 'min seguidos sem sofrer', niveis: [6, 10, 15], tipo: 'recorde', medir: (c) => Math.max(0, ...c.H.map((x) => balizaDe(x.j, c.pid).melhor)) },
  { id: 'hattrick', icone: '🎩', nome: 'Hat-trick', un: 'jogos com 3+ golos', niveis: [1, 5, 10], tipo: 'exibição', medir: (c) => c.H.filter((x) => x.l.g >= 3).length },
  { id: 'melhorEmCampo', icone: '⭐', nome: 'Melhor em campo', un: 'jogos', niveis: [1, 5, 15], tipo: 'exibição', medir: (c) => c.H.filter((x) => doJogo(x.j).topGA === c.pid).length },
  { id: 'cabeceador', icone: '🗣️', nome: 'Cabeceador', un: 'golos de cabeça', niveis: [3, 10, 25], tipo: 'carreira', medir: (c) => c.H.reduce((s, x) => s + x.l.cab, 0) },
  { id: 'dupla', icone: '🤜🤛', nome: 'Dupla', un: 'golos com o mesmo colega', niveis: [5, 15, 30], tipo: 'carreira', medir: (c) => {
    const P = {};
    for (const { j } of c.H) for (const e of j.eventos || []) {
      if (e.tipo === 'autogolo' || !e.assist) continue;
      if (e.marcador === c.pid) P[e.assist] = (P[e.assist] || 0) + 1;
      if (e.assist === c.pid) P[e.marcador] = (P[e.marcador] || 0) + 1;
    }
    return Math.max(0, ...Object.values(P));
  } },
  { id: 'emSerie', icone: '🔥', nome: 'Em série', un: 'vitórias seguidas', niveis: [3, 5, 8], tipo: 'recorde', medir: (c) => { let n = 0, m = 0; for (const { l } of c.H) { n = l.res === 'V' ? n + 1 : 0; m = Math.max(m, n); } return m; } },
  // Época: % dos jogos da época atual em que jogou; só conta a partir de 5 jogos dessa época (senão 2 em 2 já dava ouro).
  { id: 'epoca', icone: '📅', nome: 'Época completa', un: '% dos jogos da época', niveis: [50, 75, 100], tipo: 'época', medir: (c) => {
    const ep = epocaDe(c.hoje), todos = c.jogos.filter((j) => j.fase === 'fim' && epocaDe(dataDoJogo(j)) === ep).length;
    const meus = c.H.filter((x) => epocaDe(x.l.data) === ep).length;
    return meus >= 5 && todos ? Math.round((meus / todos) * 100) : 0;
  } },
  { id: 'desafiador', icone: '🎖️', nome: 'Desafiador', un: 'desafios cumpridos', niveis: [5, 20, 50], tipo: 'carreira', medir: (c) => c.desafios },
  { id: 'maratonista', icone: '⌚', nome: 'Maratonista', un: 'km', niveis: [25, 100, 250], tipo: 'relógio', rel: true, medir: (c) => Math.round(Object.values(c.fis).reduce((s, f) => s + (f?.m || 0), 0) / 100) / 10 },
  { id: 'relampago', icone: '💨', nome: 'Relâmpago', un: 'km/h', niveis: [22, 25, 28], tipo: 'relógio', rel: true, medir: (c) => Math.max(0, ...Object.values(c.fis).map((f) => f?.vmax?.kmh || 0)) },
];

// Medalhas de um jogador: nível atual (0–3), valor, próximo objetivo e % até lá.
// fisPorJogo = minhacarta.fisico (só o próprio); as medalhas do relógio só aparecem a quem tem dados do relógio.
export function medalhas(jogos, pid, { fisPorJogo = {}, hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const H = historico(jogos, pid);
  const temRelogio = Object.keys(fisPorJogo).length > 0;
  const c = { H, pid, jogos, hoje, fis: fisPorJogo, desafios: desafiosCumpridos(jogos, pid, { fisPorJogo, temRelogio }).length };
  const pt = (v) => String(v).replace('.', ',');
  return MEDALHAS.filter((m) => temRelogio || !m.rel).map((m) => {
    const valor = m.medir(c);
    const nivel = m.niveis.filter((n) => valor >= n).length;
    const prox = m.niveis[nivel] ?? null, ant = nivel ? m.niveis[nivel - 1] : 0;
    return { id: m.id, icone: m.icone, nome: m.nome, tipo: m.tipo, un: m.un, niveis: m.niveis, valor, nivel,
      medalha: ['', '🥉', '🥈', '🥇'][nivel], proximo: prox, pct: prox == null ? 100 : Math.max(0, Math.min(100, Math.round(((valor - ant) / (prox - ant)) * 100))),
      txt: prox == null ? `${m.icone} ${m.nome} 🥇 — ${pt(valor)} ${m.un}` : `${m.icone} ${m.nome}${nivel ? ' ' + ['', '🥉', '🥈', '🥇'][nivel] : ''} — ${pt(valor)}/${prox} ${m.un}` };
  });
}
