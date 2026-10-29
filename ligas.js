// Ligas e épocas (decisões do Rui, 29/10/2026 — ver LIGAS.md). Só cálculos e nomes; a base de dados está no db.js.
// A liga principal ("Futebolada semanal") fica na raiz da base de dados (como sempre esteve, para o relógio e o marcador
// continuarem a funcionar); as outras ligas ficam em ligas/{id}/… com os mesmos nomes de coleções.
import { epocaDe } from './conquistas.js?v=3';

export const LIGA_PRINCIPAL = { id: null, nome: 'Futebolada semanal' };
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
export const idLiga = (nome) => `${(nome || 'liga').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'liga'}-${Math.random().toString(36).slice(2, 6)}`;
