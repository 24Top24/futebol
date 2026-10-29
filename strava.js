// Ligar/desligar a Strava no perfil (lógica; o aspeto é da sessão equipas/golos). Preparado a 29/10/2026 — ainda NÃO ligado
// à app: falta o Rui criar a app na Strava (client id) e publicar as funções (ver STRAVA.md).
// Fluxo: botão "Ligar Strava" → strava.com (autorizar) → volta ao site com ?code=&scope=&state= → tratarRegresso() chama a função
// stravaLigar (que confirma o PIN do jogador, troca o código por tokens e guarda-os onde nenhum cliente lê).
import { FIREBASE_CONFIG } from './config.js?v=7';

export const STRAVA_CLIENT_ID = '';   // A PREENCHER pelo Rui depois de criar a app em strava.com/settings/api (não é segredo)
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const REGIAO = 'europe-west1';
const VOLTA = () => location.origin + location.pathname;   // o "Authorization Callback Domain" da app Strava = 24top24.github.io

export const stravaDisponivel = () => !!STRAVA_CLIENT_ID && !!FIREBASE_CONFIG;

// Vai à Strava pedir autorização. O state guarda-se nesta sessão do browser para recusar regressos que não começaram aqui.
export function ligarStrava() {
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  sessionStorage.setItem('strava-state', state);
  const q = new URLSearchParams({ client_id: STRAVA_CLIENT_ID, redirect_uri: VOLTA(), response_type: 'code', approval_prompt: 'auto', scope: 'activity:read', state });
  location.href = 'https://www.strava.com/oauth/authorize?' + q;
}

async function chamar(nome, dados) {
  const [{ getApp }, fn] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-functions.js')]);
  const f = fn.httpsCallable(fn.getFunctions(getApp(), REGIAO), nome);
  return (await f(dados)).data;
}

// Ao abrir o site: se vier da Strava, termina a ligação e limpa o endereço. Devolve null (nada a fazer), { ok } ou { erro }.
export async function tratarRegresso() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return null;
  const limpar = () => history.replaceState(null, '', location.pathname + location.hash);
  const esperado = sessionStorage.getItem('strava-state');
  sessionStorage.removeItem('strava-state');
  if (p.get('error')) { limpar(); return { erro: 'Não deste autorização na Strava.' }; }
  if (!esperado || p.get('state') !== esperado) { limpar(); return { erro: 'Pedido inválido — tenta ligar outra vez a partir do perfil.' }; }
  try { await chamar('stravaLigar', { code: p.get('code'), scope: p.get('scope') || '' }); limpar(); return { ok: true }; }
  catch (e) { limpar(); return { erro: e?.message || 'Não deu para ligar a Strava.' }; }
}

export const desligarStrava = (apagarTreinos = false) => chamar('stravaDesligar', { apagarTreinos });
// Estado para o perfil: saude/{id}/estado/strava = { ligado, desde, nome, ultimo } (escrito pelas funções; os tokens nunca chegam ao telemóvel).
