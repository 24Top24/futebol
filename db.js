// Camada de dados: Firestore se houver configuração, senão localStorage (modo demo).
// Votantes não fazem login: escolhem o perfil (guardado no browser). Só o admin faz login (Google).
import { FIREBASE_CONFIG } from './config.js?v=7';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export function novoToken(n = 22) {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (x) => abc[x % abc.length]).join('');
}

// ---------- MODO DEMO ----------
function demoDb() {
  const KEY = 'futebol-demo-v2';
  const VAZIO = () => ({ players: {}, perfis: {}, claims: {}, votes: {}, public: {}, games: {}, resultados: {}, segredos: {}, partilha: {}, jogos: {} });
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
    // Só para testes: simula outro browser.
    trocarUid() { uid = novoToken(); localStorage.setItem('futebol-demo-uid', uid); },
    resetDemo() { localStorage.removeItem(KEY); s = VAZIO(); },
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
  const { doc, getDoc, getDocs, setDoc, deleteDoc, collection } = fs;
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
  };
}

// ?demo no endereço força o modo demo (para testes, sem tocar nos dados reais).
const forcarDemo = new URLSearchParams(location.search).has('demo');
export const DB = FIREBASE_CONFIG && !forcarDemo ? await fireDb() : demoDb();
