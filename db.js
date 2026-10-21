// Camada de dados: Firestore se houver configuração, senão localStorage (modo demo).
// Votantes não fazem login: escolhem o perfil e provam-no UMA vez com o PIN (liga o browser ao jogador).
// Só o admin faz login (Google).
import { FIREBASE_CONFIG } from './config.js?v=7';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function sha256hex(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
}
export const novoPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');

export function novoToken(n = 22) {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (x) => abc[x % abc.length]).join('');
}

// ---------- MODO DEMO ----------
function demoDb() {
  const KEY = 'futebol-demo-v2';
  const VAZIO = () => ({ players: {}, perfis: {}, claims: {}, votes: {}, public: {}, games: {}, resultados: {}, segredos: {}, partilha: {}, jogos: {}, minhacarta: {}, saude: {}, treinos: {}, tickets: {} });
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let s = Object.assign(VAZIO(), load());
  const save = () => localStorage.setItem(KEY, JSON.stringify(s));
  const list = (c) => Object.entries(s[c]).map(([id, d]) => ({ id, ...d }));
  let uid = localStorage.getItem('futebol-demo-uid') || novoToken();
  localStorage.setItem('futebol-demo-uid', uid);
  return {
    demo: true,
    async uid() { return uid; },
    async user() { return { email: 'demo' }; },
    async login() {}, async logout() {},
    async isAdmin(u) { return !!u; },
    async listPlayers() { return list('players'); },
    async savePlayer(p) { const id = p.id || novoToken(10); const { id: _, ...d } = p; s.players[id] = d; save(); return id; },
    async deletePlayer(id) { delete s.players[id]; save(); },
    async listPerfis() { return list('perfis'); },
    async savePerfil(id, d) { s.perfis[id] = d; save(); },
    async listClaims() { return list('claims'); },
    async reclamar(id) { if (s.claims[id] && s.claims[id].uid !== uid) throw new Error('Perfil já escolhido'); s.claims[id] = { uid, ts: Date.now() }; save(); },
    async libertar(id) { delete s.claims[id]; save(); },
    // PIN: imita as regras (o PIN certo liga este browser ao jogador).
    async ligar(id, pin) {
      const h = await sha256hex(pin + id);
      if (!s.pins?.[id] || s.pins[id].h !== h) throw new Error('PIN errado');
      s.ligacao = { player: id, h }; save();
    },
    async ligacaoOk(id) { return s.ligacao?.player === id && s.ligacao.h === s.pins?.[id]?.h; },
    async desligar() { delete s.ligacao; save(); },
    async mudarPin(id, pin) {
      if (!(await this.ligacaoOk(id))) throw new Error('Sem PIN');
      const h = await sha256hex(pin + id); (s.pins ||= {})[id] = { h }; s.ligacao = { player: id, h }; save();
    },
    async listPins() { return Object.entries(s.pins || {}).map(([id, d]) => ({ id, ...d })); },
    async definirPin(id, pin) { (s.pins ||= {})[id] = { h: await sha256hex(pin + id), pin }; save(); },
    async novoTicket(d) { const id = novoToken(12); (s.tickets ||= {})[id] = d; save(); return id; },
    async listTickets() { return Object.entries(s.tickets || {}).map(([id, d]) => ({ id, ...d })); },
    async setTicket(id, d) { (s.tickets ||= {})[id] = d; save(); },
    async deleteTicket(id) { delete s.tickets?.[id]; save(); },
    async getSaude(id) { return (s.saude ||= {})[id] || null; },
    async listSaude() { return Object.entries(s.saude || {}).map(([id, d]) => ({ id, ...d })); },
    async setSaude(id, d) { (s.saude ||= {})[id] = d; save(); },
    async listTreinos(id) { return Object.entries((s.treinos ||= {})[id] || {}).map(([tid, d]) => ({ id: tid, ...d })); },
    async saveTreino(id, t, d) { ((s.treinos ||= {})[id] ||= {})[t] = d; save(); },
    async deleteTreino(id, t) { delete s.treinos?.[id]?.[t]; save(); },
    async apagarSaude(id) { delete s.saude?.[id]; delete s.treinos?.[id]; save(); },
    async getMinhaCarta(id) { return (s.minhacarta ||= {})[id] || null; },
    async listMinhasCartas() { return Object.entries(s.minhacarta || {}).map(([id, d]) => ({ id, ...d })); },
    async setMinhaCarta(id, d) { (s.minhacarta ||= {})[id] = d; save(); },
    async getVotes(id) { return s.votes[id] || null; },
    async listVotes() { return list('votes'); },
    async saveVote(voter, target, rating) {
      if (voter === target) throw new Error('Não se vota em si próprio');
      const v = s.votes[voter] || { voter, r: {} };
      v.r[target] = { ...(v.r[target] || {}), ...rating }; v.ts = Date.now(); s.votes[voter] = v; save();
    },
    async getPublic(d) { return s.public[d] || null; },
    async setPublic(d, v) { s.public[d] = v; save(); },
    async saveGame(g) { const id = g.id || novoToken(10); const { id: _, ...d } = g; s.games[id] = d; save(); return id; },
    async deleteGame(id) { delete s.games[id]; save(); },
    async listGames() { return list('games'); },
    async listResultados() { return list('resultados'); },
    async deleteResultado(id) { delete s.resultados[id]; save(); },
    async setChaveRelogio() {},
    async getSegredo(d) { return s.segredos[d] || null; },
    async setSegredo(d, v) { s.segredos[d] = v; save(); },
    async listPart(k, c) { return Object.entries(s.partilha[k]?.[c] || {}).map(([id, d]) => ({ id, ...d })); },
    async getPart(k, c, id) { return s.partilha[k]?.[c]?.[id] || null; },
    async setPart(k, c, id, d) { ((s.partilha[k] ||= {})[c] ||= {})[id] = d; save(); return id; },
    async saveResultado(id, d) { s.resultados[id] = d; save(); },
    async listJogosPub() { return list('jogos'); },
    async saveJogoPub(id, d) { s.jogos[id] = d; save(); },
    async deleteJogoPub(id) { delete s.jogos[id]; save(); },
    // Jogo de hoje ao vivo (moderadores) e chave do link para os moderadores.
    // (Na demo fica numa chave à parte, para dois separadores — dois "telemóveis" — não se pisarem.)
    async getAoVivo() { try { return JSON.parse(localStorage.getItem(KEY + '-aovivo')); } catch { return null; } },
    async setAoVivo(d, junta = true) { const v = junta ? { ...((await this.getAoVivo()) || {}), ...d } : d; localStorage.setItem(KEY + '-aovivo', JSON.stringify(v)); },
    ouvirAoVivo(cb) {
      let ult;
      const ver = () => { const v = localStorage.getItem(KEY + '-aovivo'); if (v !== ult) { ult = v; cb(v ? JSON.parse(v) : null); } };
      ver(); const t = setInterval(ver, 700); return () => clearInterval(t);
    },
    async getModeracao(d) { return (s.moderacao ||= {})[d] || null; },
    async setModeracao(d, v) { (s.moderacao ||= {})[d] = v; save(); },
    // Só para testes: simula outro browser.
    trocarUid() { uid = novoToken(); localStorage.setItem('futebol-demo-uid', uid); },
    resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '-aovivo'); s = VAZIO(); },
  };
}

// ---------- FIRESTORE ----------
async function fireDb() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-firestore.js'),
    import(SDK + 'firebase-auth.js'),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  const { doc, getDoc, getDocs, setDoc, deleteDoc, collection, writeBatch } = fs;
  const list = async (c) => (await getDocs(collection(db, c))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const get = async (c, id) => { const d = await getDoc(doc(db, c, id)); return d.exists() ? d.data() : null; };
  const atual = () => new Promise((res) => { const off = au.onAuthStateChanged(auth, (u) => { off(); res(u); }); });
  return {
    demo: false,
    async uid() { const u = (await atual()) || (await au.signInAnonymously(auth)).user; return u.uid; },
    async user() { const u = await atual(); return u && !u.isAnonymous ? u : null; },
    login: () => au.signInWithPopup(auth, new au.GoogleAuthProvider()),
    logout: () => au.signOut(auth),
    // Admin = quem as regras deixam listar os votos (o e-mail só está nas regras).
    async isAdmin(u) { if (!u) return false; try { await getDocs(collection(db, 'votes')); return true; } catch { return false; } },
    listPlayers: () => list('players'),
    async savePlayer(p) { const id = p.id || novoToken(10); const { id: _, ...d } = p; await setDoc(doc(db, 'players', id), d); return id; },
    deletePlayer: (id) => deleteDoc(doc(db, 'players', id)),
    listPerfis: () => list('perfis'),
    savePerfil: (id, d) => setDoc(doc(db, 'perfis', id), d),
    listClaims: () => list('claims'),
    async reclamar(id) { const uid = await this.uid(); await setDoc(doc(db, 'claims', id), { uid, ts: Date.now() }); },
    libertar: (id) => deleteDoc(doc(db, 'claims', id)),
    // PIN: as regras só aceitam a ligação se h = sha256(PIN certo + id).
    async ligar(id, pin) {
      const uid = await this.uid();
      try { await setDoc(doc(db, 'ligacoes', uid), { player: id, h: await sha256hex(pin + id), ts: Date.now() }); }
      catch (e) { throw new Error('PIN errado'); }
    },
    // Ligação válida = consigo ler o meu voto (as regras confirmam o PIN atual).
    async ligacaoOk(id) { try { await this.uid(); await getDoc(doc(db, 'votes', id)); return true; } catch { return false; } },
    async desligar() { try { const u = await atual(); if (u) await deleteDoc(doc(db, 'ligacoes', u.uid)); } catch {} },
    // O próprio muda o PIN: no mesmo lote, o PIN (só o hash) e a ligação deste browser.
    async mudarPin(id, pin) {
      const uid = await this.uid(), h = await sha256hex(pin + id), b = writeBatch(db);
      b.set(doc(db, 'pins', id), { h });
      b.set(doc(db, 'ligacoes', uid), { player: id, h, ts: Date.now() });
      await b.commit();
    },
    // Admin: PINs (aleatórios guardam 'pin' para reenviar; os escolhidos pelo jogador só têm 'h').
    listPins: () => list('pins'),
    definirPin: async (id, pin) => setDoc(doc(db, 'pins', id), { h: await sha256hex(pin + id), pin }),
    // Carta de cada um (sem votos individuais) + histórico mensal: escreve o admin, lê só o próprio (PIN).
    // Tickets (problemas reportados): qualquer pessoa cria (com login anónimo); só o admin lê.
    async novoTicket(d) { await this.uid(); const id = novoToken(12); await setDoc(doc(db, 'tickets', id), d); return id; },
    listTickets: () => list('tickets'),
    setTicket: (id, d) => setDoc(doc(db, 'tickets', id), d),
    deleteTicket: (id) => deleteDoc(doc(db, 'tickets', id)),
    // Dados de saúde e treinos do relógio: escreve só o próprio (PIN); o admin só lê.
    getSaude: (id) => get('saude', id),
    listSaude: () => list('saude'),
    setSaude: (id, d) => setDoc(doc(db, 'saude', id), d),
    listTreinos: async (id) => (await getDocs(collection(db, 'saude', id, 'treinos'))).docs.map((d) => ({ id: d.id, ...d.data() })),
    saveTreino: (id, t, d) => setDoc(doc(db, 'saude', id, 'treinos', t), d),
    deleteTreino: (id, t) => deleteDoc(doc(db, 'saude', id, 'treinos', t)),
    async apagarSaude(id) {
      for (const d of (await getDocs(collection(db, 'saude', id, 'treinos'))).docs) await deleteDoc(d.ref);
      await deleteDoc(doc(db, 'saude', id));
    },
    getMinhaCarta: (id) => get('minhacarta', id),
    listMinhasCartas: () => list('minhacarta'),
    setMinhaCarta: (id, d) => setDoc(doc(db, 'minhacarta', id), d),
    getVotes: (id) => get('votes', id),
    listVotes: () => list('votes'),
    saveVote: (voter, target, rating) =>
      setDoc(doc(db, 'votes', voter), { voter, r: { [target]: rating }, ts: Date.now() }, { merge: true }),
    getPublic: (d) => get('public', d),
    setPublic: (d, v) => setDoc(doc(db, 'public', d), v),
    async saveGame(g) { const id = g.id || novoToken(10); const { id: _, ...d } = g; await setDoc(doc(db, 'games', id), d); return id; },
    deleteGame: (id) => deleteDoc(doc(db, 'games', id)),
    listGames: () => list('games'),
    listResultados: () => list('resultados'),
    deleteResultado: (id) => deleteDoc(doc(db, 'resultados', id)),
    setChaveRelogio: (chave) => setDoc(doc(db, 'segredos', 'relogio'), { chave }),
    getSegredo: (d) => get('segredos', d),
    setSegredo: (d, v) => setDoc(doc(db, 'segredos', d), v),
    // Link de colaborador: tudo debaixo de partilha/{chave}/… (só quem sabe a chave lê/escreve).
    listPart: async (k, c) => (await getDocs(collection(db, 'partilha', k, c))).docs.map((d) => ({ id: d.id, ...d.data() })),
    getPart: async (k, c, id) => { const d = await getDoc(doc(db, 'partilha', k, c, id)); return d.exists() ? d.data() : null; },
    setPart: async (k, c, id, d) => { await setDoc(doc(db, 'partilha', k, c, id), d); return id; },
    saveResultado: (id, d) => setDoc(doc(db, 'resultados', id), d),
    // Resumo público de cada jogo (sem dados de saúde): alimenta as estatísticas do link geral.
    listJogosPub: () => list('jogos'),
    saveJogoPub: (id, d) => setDoc(doc(db, 'jogos', id), d),
    deleteJogoPub: (id) => deleteDoc(doc(db, 'jogos', id)),
    // Jogo de hoje ao vivo: aovivo/jogo (todos leem; escrevem moderadores e admin), em tempo real.
    getAoVivo: () => get('aovivo', 'jogo'),
    setAoVivo: (d, junta = true) => setDoc(doc(db, 'aovivo', 'jogo'), d, { merge: junta }),
    ouvirAoVivo: (cb) => fs.onSnapshot(doc(db, 'aovivo', 'jogo'), (x) => cb(x.exists() ? x.data() : null), (e) => console.error(e)),
    // moderacao/chave = chave do link (só moderadores com PIN e o admin leem; só o admin escreve).
    getModeracao: (d) => get('moderacao', d),
    setModeracao: (d, v) => setDoc(doc(db, 'moderacao', d), v),
  };
}

// ?demo no endereço força o modo demo (para testes, sem tocar nos dados reais).
const forcarDemo = new URLSearchParams(location.search).has('demo');
export const DB = FIREBASE_CONFIG && !forcarDemo ? await fireDb() : demoDb();
