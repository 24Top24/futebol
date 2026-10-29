// Ligas e épocas (decisões do Rui, 29/10/2026 — ver LIGAS.md). Só cálculos e nomes; a base de dados está no db.js.
// A liga principal ("Futebolada semanal") fica na raiz da base de dados (como sempre esteve, para o relógio e o marcador
// continuarem a funcionar); as outras ligas ficam em ligas/{id}/… com os mesmos nomes de coleções.
import { epocaDe } from './conquistas.js?v=3';

// Não há liga principal nem secundária (Rui, 29/10/2026): a "Futebolada semanal" é uma liga como as outras; só fica guardada
// na raiz da base de dados (id null aqui) para o relógio e o marcador continuarem a funcionar.
export const LIGA_PRINCIPAL = { id: null, nome: 'Futebolada semanal' };

// Temas de cor de cada liga (o admin escolhe o da liga; cada jogador pode trocar o seu). Sempre com o preto de fundo.
export const TEMAS = {
  vermelho: { nome: 'Vermelho e preto', c: ['#c0262d', '#9b1c22', '#2a0b0d', '#f0565d'], relva: ['#2a0a0c', '#120607'] },
  azul: { nome: 'Azul e preto', c: ['#1f6feb', '#1858b8', '#0b1a2e', '#5aa2ff'], relva: ['#0a1730', '#07101c'] },
  verde: { nome: 'Verde e preto', c: ['#1f9d55', '#177a42', '#0b2416', '#4ade80'], relva: ['#0a2414', '#06140b'] },
  laranja: { nome: 'Laranja e preto', c: ['#e36414', '#b84f0f', '#2b1406', '#ff8c42'], relva: ['#2b1406', '#140a04'] },
  roxo: { nome: 'Roxo e preto', c: ['#7c3aed', '#5b21b6', '#1d1033', '#a78bfa'], relva: ['#1d1033', '#0e0819'] },
  amarelo: { nome: 'Amarelo e preto', c: ['#d4a106', '#a87f05', '#2b2203', '#f5c518'], relva: ['#2b2203', '#141002'] },
};
// Aplica o tema (as variáveis --verde* do style.css são o acento da app).
export function aplicarTema(cor) {
  const t = TEMAS[cor] || TEMAS.vermelho, r = document.documentElement.style;
  r.setProperty('--verde', t.c[0]); r.setProperty('--verde2', t.c[1]); r.setProperty('--verde-sub', t.c[2]); r.setProperty('--verde-txt', t.c[3]);
  r.setProperty('--relva', `linear-gradient(135deg, ${t.relva[0]} 0%, ${t.relva[1]} 45%, #0a0a0a 100%)`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0b0b0d');
}
// O tema que este telemóvel usa numa liga: o escolhido pelo jogador, senão o da liga.
const chaveTema = (liga) => 'tema-' + (liga || 'futebolada-semanal');
export const temaEscolhido = (liga) => { try { return localStorage.getItem(chaveTema(liga)); } catch { return null; } };
export const escolherTema = (liga, cor) => { try { if (cor) localStorage.setItem(chaveTema(liga), cor); else localStorage.removeItem(chaveTema(liga)); } catch {} };
export { epocaDe };

// Época de setembro a agosto. '2026/27' → '2026/2027'.
export const nomeEpoca = (ep) => (ep ? `${ep.slice(0, 4)}/${Number(ep.slice(0, 4)) + 1}` : '');
export const tituloLiga = (liga, ep) => `${liga?.nome || LIGA_PRINCIPAL.nome}${ep ? ' ' + nomeEpoca(ep) : ''}`;
export const epocaAtual = (hoje = new Date()) => epocaDe(hoje.toISOString().slice(0, 10));

// Data de um jogo (resumo público: jogo.data 'AAAA-MM-DD' ou inicioEpoch).
const dataJ = (j) => j?.data || (j?.inicioEpoch ? new Date(j.inicioEpoch).toISOString().slice(0, 10) : '');
export const epocaDoJogo = (j) => epocaDe(dataJ(j));

// Épocas com jogos (mais recente primeiro). res = [{ id, jogo }] (o formato do lerRes do app.js) ou jogos soltos.
export function epocasDe(res) {
  const s = new Set((res || []).map((r) => epocaDoJogo(r.jogo || r)).filter(Boolean));
  s.add(epocaAtual());
  return [...s].sort().reverse();
}
// Só os jogos de uma época ('tudo' ou vazio = todos).
export const filtrarEpoca = (res, ep) => (!ep || ep === 'tudo' ? res : (res || []).filter((r) => epocaDoJogo(r.jogo || r) === ep));

// Limite de ligas por pessoa autorizada pelo Rui: a principal + 2 extra.
export const MAX_LIGAS_EXTRA = 2;
// Id de uma liga nova a partir do nome ('Futebol de Segunda' → 'futebol-de-segunda-x7k2').
export const idLiga = (nome) => `${(nome || 'liga').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'liga'}-${crypto.getRandomValues(new Uint32Array(2)).reduce((a, x) => a + x.toString(36), '').slice(0, 10)}`;   // aleatório comprido: o link é o convite
