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
    // Conta Google (no demo não há): ver a versão Firestore.
    async minhaConta() { return null; },
    async ligarGoogle() { throw new Error('No modo de demonstração não há contas Google'); },
    async entrarGoogle() { throw new Error('No modo de demonstração não há contas Google'); },
    async desligarGoogle() {}, async contaAdmin() {}, async listContas() { return []; }, async apagarConta() {},
    // Ligas: no demo só existe a principal.
    usarLiga() {}, para() { return this; }, ligaAtual: () => null, async getLiga() { return null; }, async minhasLigas() { return []; }, async todasLigas() { return []; }, async importarPessoa() {}, async pessoasComConta() { return []; }, async ligasPublicas() { return []; }, async getConfigLiga() { return { nome: 'Futebolada semanal', cor: 'vermelho', publico: true, raiz: true }; }, async setConfigLiga() {}, async ligarRelogio() { throw new Error('No modo de demonstração não há relógios'); }, async listRelogios() { return []; }, async desligarRelogio() {},
    async listAutorizados() { return []; }, async autorizar() {}, async desautorizar() {}, async meuLimite() { return null; },
    async criarLiga() { throw new Error('No modo de demonstração não há ligas'); }, async pedirEntrada() { throw new Error('No modo de demonstração não há ligas'); },
    async listPedidos() { return []; }, async aprovarPedido() {}, async recusarPedido() {}, async listMembros() { return []; }, async listFora() { return []; }, async setFora() {}, async listPessoas() { return []; }, async minhaPessoa() { return null; }, async savePessoa() {}, async apagarPessoa() {}, async ligarPessoa() {}, async novaPessoa() {}, async pinPessoa() {}, async notaPessoa() {}, async listLigacoes() { return []; }, async definirUsado() {}, async tirarMembro() {}, async setLiga() {},
    async mudarPin(id, pin) {
      if (!(await this.ligacaoOk(id))) throw new Error('Sem PIN');
      const h = await sha256hex(pin + id); (s.pins ||= {})[id] = { h }; s.ligacao = { player: id, h }; save();
    },
    async listPins() { return Object.entries(s.pins || {}).map(([id, d]) => ({ id, ...d })); },
    async definirPin(id, pin) { (s.pins ||= {})[id] = { h: await sha256hex(pin + id), pin }; save(); },
    async novoTicket(d) { const id = novoToken(12); (s.tickets ||= {})[id] = d; save(); return id; },
    async listTickets() { return Object.entries(s.tickets || {}).map(([id, d]) => ({ id, ...d })); },
    // Avaliação de um jogo (nota de cada colega NESSE jogo): à parte, não entra nas cartas. Id = jogo_votante.
    async getVotoJogo(jogo, votante) { return s.votosJogo?.[jogo + '_' + votante] || null; },
    async saveVotoJogo(jogo, votante, d) { (s.votosJogo ||= {})[jogo + '_' + votante] = { ...d, jogo, votante }; save(); },
    async listVotosJogo() { return Object.entries(s.votosJogo || {}).map(([id, d]) => ({ id, ...d })); },
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
    // doc: 'jogo' (o a sério) ou 'teste' (jogo de teste dos moderadores, não conta para nada).
    async getAoVivo(doc = 'jogo') { try { return JSON.parse(localStorage.getItem(KEY + '-aovivo' + (doc === 'jogo' ? '' : '-' + doc))); } catch { return null; } },
    async setAoVivo(d, junta = true, doc = 'jogo') { const v = junta ? { ...((await this.getAoVivo(doc)) || {}), ...d } : d; localStorage.setItem(KEY + '-aovivo' + (doc === 'jogo' ? '' : '-' + doc), JSON.stringify(v)); },
    ouvirAoVivo(cb, doc = 'jogo') {
      let ult;
      const ver = () => { const v = localStorage.getItem(KEY + '-aovivo' + (doc === 'jogo' ? '' : '-' + doc)); if (v !== ult) { ult = v; cb(v ? JSON.parse(v) : null); } };
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
const desembrulharFis = (d) => { if (!d?.fisicoJson) return d; const { fisicoJson, ...r } = d; try { return { ...r, fisico: JSON.parse(fisicoJson) }; } catch { return r; } };
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
  // Liga ativa (29/10/2026): null = a principal, na raiz (como sempre); outra = ligas/{id}/… com as mesmas coleções.
  // contas/ e tickets/ são sempre da raiz (são da pessoa / da app, não de uma liga).
  // A liga da app (usarLiga) é uma só; para ler/gravar noutra liga SEM mexer na da app usa-se DB.para(id) (31/10: mudar a liga
  // da app a meio de uma consulta em segundo plano fazia a página ler os dados da liga errada).
  let LIGA_APP = null;
  const listRaiz = async (...c) => (await getDocs(collection(db, ...c))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const getRaiz = async (...c) => { const d = await getDoc(doc(db, ...c)); return d.exists() ? d.data() : null; };
  const atual = () => new Promise((res) => { const off = au.onAuthStateChanged(auth, (u) => { off(); res(u); }); });
  // Jogador de uma liga → jogador da Futebolada semanal da mesma pessoa (pelas contas Google), com os perfis da raiz. Guardado 5 min.
  const cacheMapa = {};
  const mapaPartilhado = async (lid) => {
    const c = cacheMapa[lid]; if (c && Date.now() - c.ts < 300000) return c.v;
    const [mL, mR, pR, fR] = await Promise.all([listRaiz('ligas', lid, 'membros').catch(() => []), listRaiz('membros').catch(() => []),
      listRaiz('players').catch(() => []), listRaiz('perfis').catch(() => [])]);
    const raizDe = Object.fromEntries(mR.map((m) => [m.uid, m.player]));
    const liga = Object.fromEntries(mL.filter((m) => raizDe[m.uid]).map((m) => [m.player, raizDe[m.uid]]));
    const v = { liga, n: Object.keys(liga).length, players: Object.fromEntries(pR.map((p) => [p.id, p])), perfis: Object.fromEntries(fR.map((p) => [p.id, p])) };
    cacheMapa[lid] = { ts: Date.now(), v };
    return v;
  };
  // Uma "vista" da base de dados presa a uma liga (fixa, ou a da app).
  const fazer = (L) => {
  const P = (...s) => (L() ? ['ligas', L(), ...s] : s);
  const D = (...s) => doc(db, ...P(...s));
  const Cl = (...s) => collection(db, ...P(...s));
  const list = async (c) => (await getDocs(Cl(c))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const get = async (c, id) => { const d = await getDoc(D(c, id)); return d.exists() ? d.data() : null; };
  return {
    demo: false,
    async uid() { const u = (await atual()) || (await au.signInAnonymously(auth)).user; return u.uid; },
    async user() { const u = await atual(); return u && !u.isAnonymous ? u : null; },
    login: () => au.signInWithPopup(auth, new au.GoogleAuthProvider()),
    logout: () => au.signOut(auth),
    // Admin = quem as regras deixam listar os votos (o e-mail só está nas regras).
    async isAdmin(u) { if (!u) return false; try { await getDocs(Cl('votes')); return true; } catch { return false; } },
    // Numa liga das novas, a pessoa é a mesma em todas as ligas: o nome a mostrar, a foto e o alias vêm do seu perfil da
    // Futebolada semanal (ligado pela conta Google: membros/ da liga ↔ membros/ da raiz). Só a carta e os votos são da liga.
    // Também vale para quem o admin sincronizou com um jogador da Futebolada semanal (players.sinc com liga null): a foto vem de lá;
    // o nome fica o desta liga (pode ser outro, p. ex. "Alex (Fontes)").
    listPlayers: async () => { const L0 = await list('players'); if (!L()) return L0; const m = await mapaPartilhado(L());
      return L0.map((p) => {
        const r = m.players[m.liga[p.id]], s = !r && p.sinc && !p.sinc.liga ? m.players[p.sinc.id] : null;
        if (s) return { ...p, foto: p.foto || s.foto || '' };
        return r ? { ...p, foto: r.foto || p.foto || '', ...(r.alcunha ? { alcunha: r.alcunha } : {}) } : p; }); },
    async savePlayer(p) { const id = p.id || novoToken(10); const { id: _, ...d } = p; await setDoc(D('players', id), d); return id; },
    deletePlayer: (id) => deleteDoc(D('players', id)),
    // Nota de fora: a nota geral de cada jogador noutras ligas (ver ligas-ui.js → publicarNotasFora).
    listFora: () => list('fora'),
    setFora: (id, d) => setDoc(D('fora', id), d),
    listPerfis: async () => { const L0 = await list('perfis'); if (!L()) return L0; const m = await mapaPartilhado(L());
      const meus = Object.fromEntries(L0.map((x) => [x.id, x]));
      const ligados = { ...Object.fromEntries((await list('players').catch(() => [])).filter((p) => p.sinc?.id && !p.sinc.liga).map((p) => [p.id, p.sinc.id])), ...m.liga };
      for (const [pl, raiz] of Object.entries(ligados)) { const r = m.perfis[raiz]; if (r) meus[pl] = { ...r, ...(meus[pl] || {}), id: pl, foto: meus[pl]?.foto || r.foto || '', alias: meus[pl]?.alias || r.alias || '' }; }
      return Object.values(meus); },
    savePerfil: (id, d) => setDoc(D('perfis', id), d),
    listClaims: () => list('claims'),
    async reclamar(id) { const uid = await this.uid(); await setDoc(D('claims', id), { uid, ts: Date.now() }); },
    libertar: (id) => deleteDoc(D('claims', id)),
    // PIN: as regras só aceitam a ligação se h = sha256(PIN certo + id).
    async ligar(id, pin) {
      const uid = await this.uid();
      // A mesma pessoa noutra liga (👥 Contas) usa o PIN que já tinha: o de players.pinEm (o hash leva o id de lá).
      const ref = L() ? (await get('players', id).catch(() => null))?.pinEm : null;
      try { await setDoc(D('ligacoes', uid), { player: id, h: await sha256hex(pin + (ref?.id || id)), ts: Date.now() }); }
      catch (e) { throw new Error('PIN errado'); }
      // 1.ª entrada: o admin da liga deixa de ver este PIN (só o Rui).
      if (L() && !ref) await setDoc(D('pins', id), { usado: true }, { merge: true }).catch(() => {});
    },
    // Ligação válida = consigo ler o meu voto (as regras confirmam o PIN atual).
    async ligacaoOk(id) { try { await this.uid(); await getDoc(D('votes', id)); return true; } catch { return false; } },
    async desligar() { try { const u = await atual(); if (u) await deleteDoc(D('ligacoes', u.uid)); } catch {} },
    // ---- Conta Google ligada ao jogador (29/10/2026): contas/{uid Google} = { player, h, email, ts }. ----
    // Com ela o jogador entra em qualquer telemóvel com o Google, sem PIN (as regras aceitam contas/{uid} no souEu()).
    // Para criar a ligação prova-se o PIN uma vez: o h vem da ligação PIN deste browser (ligacoes/{uid}); o admin não precisa.
    async minhaConta() {
      const u = await atual();
      if (!u || u.isAnonymous) return null;
      // Numa liga extra, o jogador desta pessoa é o do seu documento de membro (ligas/{id}/membros/{uid}).
      // Sem ligação nesta liga mas a pessoa (👥 Contas) tem cá jogador: entra sozinha, sem PIN.
      if (L()) { try { const m = (await getRaiz('ligas', L(), 'membros', u.uid)) || (await this.entrarPorPessoa(u).catch(() => null)); return m ? { ...m, uid: u.uid, email: u.email } : null; } catch { return null; } }
      try { const c = (await getRaiz('contas', u.uid)) || (await this.entrarPorPessoa(u).catch(() => null)); return c ? { ...c, uid: u.uid, email: c.email || u.email } : null; } catch { return null; }
    },
    // 👥 Contas: o registo global de pessoas — pessoas/{id} = { nome, uid (Google) | null, ligas: { 'fs' | <liga>: jogador }, ultimaLiga, ts }.
    async minhaPessoa() {
      const u = await atual(); if (!u || u.isAnonymous) return null;
      const q = await getDocs(fs.query(collection(db, 'pessoas'), fs.where('uid', '==', u.uid)));
      return q.docs[0] ? { id: q.docs[0].id, ...q.docs[0].data() } : null;
    },
    async entrarPorPessoa(u) {
      const p = await this.minhaPessoa(), lk = L() || 'fs', player = p?.ligas?.[lk];
      if (!player) return null;
      const b = writeBatch(db), agora = Date.now();
      if (L()) {
        b.set(doc(db, 'ligas', L(), 'membros', u.uid), { uid: u.uid, player, pessoa: p.id, ts: agora });
        b.set(doc(db, 'filiacoes', `${L()}_${u.uid}`), { uid: u.uid, liga: L(), player, ts: agora });
      } else {
        b.set(doc(db, 'contas', u.uid), { player, pessoa: p.id, email: u.email || null, ts: agora });
        b.set(doc(db, 'membros', u.uid), { uid: u.uid, player, ts: agora });
      }
      await b.commit();
      return { uid: u.uid, player };
    },
    listPessoas: () => listRaiz('pessoas'),
    savePessoa: (id, d) => setDoc(doc(db, 'pessoas', id), d),
    apagarPessoa: (id) => deleteDoc(doc(db, 'pessoas', id)),
    // Admin de uma liga: junta a sua liga a uma pessoa (só mexe na chave desta liga) ou cria a pessoa de um jogador novo.
    ligarPessoa: (id, player) => setDoc(doc(db, 'pessoas', id), { ligas: { [L() || 'fs']: player }, ultimaLiga: L() || 'fs', ts: Date.now() }, { merge: true }),
    notaPessoa: (id, ov) => setDoc(doc(db, 'pessoas', id), { notas: { [L() || 'fs']: ov }, ultimaLiga: L() || 'fs', ts: Date.now() }, { merge: true }),
    async novaPessoa(nome, player) { const id = novoToken(12); await setDoc(doc(db, 'pessoas', id), { nome, uid: null, ligas: { [L() || 'fs']: player }, ultimaLiga: L() || 'fs', ts: Date.now() }); return id; },
    async ligarGoogle(id) {
      const u = await atual(), prov = new au.GoogleAuthProvider();
      const lig = u ? await get('ligacoes', u.uid).catch(() => null) : null;
      let user;
      if (u?.isAnonymous) {
        // Converte a conta anónima deste browser em conta Google (mesmo uid). Se esse Google já tem conta, entra nela.
        try { user = (await au.linkWithPopup(u, prov)).user; }
        catch (e) {
          if (e.code !== 'auth/credential-already-in-use') throw e;
          user = (await au.signInWithCredential(auth, au.GoogleAuthProvider.credentialFromError(e))).user;
        }
      } else user = u || (await au.signInWithPopup(auth, prov)).user;
      await user.getIdToken(true);   // o token passa a dizer google.com (as regras exigem)
      if (L()) {
        // Numa liga das novas: membro (provado com o PIN deste jogador nessa liga) + a lista das ligas da pessoa, num lote.
        const b = writeBatch(db), agora = Date.now();
        b.set(doc(db, 'ligas', L(), 'membros', user.uid), { uid: user.uid, player: id, h: lig?.h || null, ts: agora });
        b.set(doc(db, 'filiacoes', `${L()}_${user.uid}`), { uid: user.uid, liga: L(), player: id, ts: agora });
        await b.commit();
      } else {
        // Futebolada semanal: conta (com e-mail, só o próprio e o Rui leem) + membros/{uid} sem e-mail (junta a pessoa entre ligas).
        const b = writeBatch(db), agora = Date.now();
        b.set(doc(db, 'contas', user.uid), { player: id, h: lig?.h || null, email: user.email || null, ts: agora });
        b.set(doc(db, 'membros', user.uid), { uid: user.uid, player: id, ts: agora });
        await b.commit();
      }
      return user.email;
    },
    // Noutro telemóvel: entra com o Google; devolve a conta (ou null se esse Google ainda não está ligado a ninguém).
    async entrarGoogle() { await au.signInWithPopup(auth, new au.GoogleAuthProvider()); return this.minhaConta(); },
    async desligarGoogle() {
      const u = await atual();
      if (!u || u.isAnonymous) return;
      if (L()) { const b = writeBatch(db); b.delete(doc(db, 'ligas', L(), 'membros', u.uid)); b.delete(doc(db, 'filiacoes', `${L()}_${u.uid}`)); await b.commit().catch(() => {}); }
      else { await deleteDoc(doc(db, 'membros', u.uid)).catch(() => {}); await deleteDoc(doc(db, 'contas', u.uid)).catch(() => {}); }
    },
    // O admin (Google) liga-se ao seu perfil de jogador sem PIN.
    async contaAdmin(id) {
      const u = await atual(); if (!u || u.isAnonymous || !id) return;
      if (!(await getRaiz('contas', u.uid).catch(() => null))) await setDoc(doc(db, 'contas', u.uid), { player: id, h: null, email: u.email || null, ts: Date.now() });
      if (!(await getRaiz('membros', u.uid).catch(() => null))) await setDoc(doc(db, 'membros', u.uid), { uid: u.uid, player: id, ts: Date.now() }).catch((e) => console.error(e));
      // O relógio do Rui (com a chave do relógio) vê as ligas desta conta: segredos/relogio.dono.
      const rel = await getRaiz('segredos', 'relogio').catch(() => null);
      if (rel && rel.dono !== u.uid) await setDoc(doc(db, 'segredos', 'relogio'), { dono: u.uid }, { merge: true }).catch((e) => console.error(e));
    },
    listContas: () => listRaiz('contas'),

    // ---- Ligas (29/10/2026, LIGAS.md) ----
    // usarLiga(null) = a principal (raiz); usarLiga(id) = ligas/{id}/… para tudo o que vem a seguir.
    usarLiga(id) { LIGA_APP = id || null; },
    ligaAtual: () => L(),
    getLiga: (id) => getRaiz('ligas', id),
    // Ligas desta pessoa (com login Google): as que administra e aquelas em que é membro (+ a principal, se tem conta lá).
    // O Rui (admin global) vê todas as ligas.
    async todasLigas() { return listRaiz('ligas').catch(() => []); },
    // Ligas que o admin pôs públicas (as que quem não tem conta pode ver).
    async ligasPublicas() { return (await getDocs(fs.query(collection(db, 'ligas'), fs.where('publico', '==', true)))).docs.map((d) => ({ id: d.id, ...d.data() })); },
    async minhasLigas() {
      const u = await atual();
      if (!u || u.isAnonymous) return [];
      const [adm, mem, conta] = await Promise.all([
        getDocs(fs.query(collection(db, 'ligas'), fs.where('admins', 'array-contains', u.uid))).then((q) => q.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
        // filiacoes/{liga}_{uid} = { uid, liga, player }: a lista das ligas de cada pessoa (sem precisar de índices).
        getDocs(fs.query(collection(db, 'filiacoes'), fs.where('uid', '==', u.uid))).then((q) => q.docs.map((d) => ({ id: d.data().liga, player: d.data().player }))).catch(() => []),
        getRaiz('contas', u.uid).catch(() => null),
      ]);
      const out = new Map();
      if (conta) out.set(null, { id: null, player: conta.player, principal: true });
      for (const m of mem) out.set(m.id, { ...(out.get(m.id) || {}), id: m.id, player: m.player });
      for (const l of adm) out.set(l.id, { ...(out.get(l.id) || {}), ...l, admin: true });
      // Nomes das ligas em que só é membro.
      await Promise.all([...out.values()].filter((l) => l.id && !l.nome).map(async (l) => Object.assign(l, (await getRaiz('ligas', l.id).catch(() => null)) || {})));
      return [...out.values()];
    },
    // O Rui autoriza uma pessoa (pelo uid da sua conta Google) a criar ligas: autorizados/{uid} = { max, criadas }.
    listAutorizados: () => listRaiz('autorizados'),
    autorizar: (uid, nome, max = 2) => setDoc(doc(db, 'autorizados', uid), { max, ...(nome ? { nome } : {}) }, { merge: true }),   // só mexe no máximo (não no contador)
    desautorizar: (uid) => deleteDoc(doc(db, 'autorizados', uid)),
    async meuLimite() { const u = await atual(); if (!u || u.isAnonymous) return null; return getRaiz('autorizados', u.uid).catch(() => null); },
    // Cria uma liga: a pessoa fica admin e jogador dela (players/{pid} com o seu nome). Num lote só, com o contador de ligas.
    async criarLiga(id, { nome, meuNome, dia = null, local = null }) {
      const u = await atual();
      if (!u || u.isAnonymous) throw new Error('Precisas de entrar com o Google');
      // Qualquer pessoa com conta Google pode criar até 2 ligas: o contador abre-se na primeira (o Rui pode subir o máximo).
      let a = await getRaiz('autorizados', u.uid);
      if (!a) { a = { max: 2, criadas: 0, ts: Date.now() }; await setDoc(doc(db, 'autorizados', u.uid), a); }
      if ((a.criadas || 0) >= (a.max || 0)) throw new Error(`Já criaste ${a.criadas} liga(s), o máximo`);
      const pid = novoToken(10), b = writeBatch(db), agora = Date.now();
      b.set(doc(db, 'ligas', id), { nome, criador: u.uid, admins: [u.uid], dia, local, ts: agora, publico: true });   // pública por defeito (Rui, 31/10)
      b.update(doc(db, 'autorizados', u.uid), { criadas: (a.criadas || 0) + 1 });
      b.set(doc(db, 'ligas', id, 'players', pid), { nome: meuNome || u.displayName || 'Eu', ativo: true });
      b.set(doc(db, 'ligas', id, 'membros', u.uid), { uid: u.uid, player: pid, ts: agora });
      b.set(doc(db, 'filiacoes', `${id}_${u.uid}`), { uid: u.uid, liga: id, player: pid, ts: agora });
      await b.commit();
      return { id, player: pid };
    },
    // Entrar numa liga: a pessoa (Google) pede; o admin aprova ligando-a a um jogador que já existe ou a um novo.
    async pedirEntrada(liga, nome) {
      const u = await atual();
      if (!u || u.isAnonymous) throw new Error('Precisas de entrar com o Google');
      await setDoc(doc(db, 'ligas', liga, 'pedidos', u.uid), { uid: u.uid, nome: nome || u.displayName || '', email: u.email || null, ts: Date.now() });
    },
    listPedidos: (liga) => listRaiz('ligas', liga, 'pedidos'),
    async aprovarPedido(liga, uid, player) {
      const b = writeBatch(db);
      b.set(doc(db, 'ligas', liga, 'membros', uid), { uid, player, ts: Date.now() });
      b.set(doc(db, 'filiacoes', `${liga}_${uid}`), { uid, liga, player, ts: Date.now() });
      b.delete(doc(db, 'ligas', liga, 'pedidos', uid));
      await b.commit();
    },
    recusarPedido: (liga, uid) => deleteDoc(doc(db, 'ligas', liga, 'pedidos', uid)),
    // Importar uma pessoa (com conta, de outra liga) para esta liga: liga-a a um jogador já criado ou cria-o com o nome dela.
    // Fica a mesma pessoa (foto e nome vêm do perfil dela; a carta e os votos são desta liga) e a liga aparece-lhe na lista.
    async importarPessoa(liga, uid, { player = null, nome = '' } = {}) {
      const b = writeBatch(db), agora = Date.now();
      if (!player) { player = novoToken(10); b.set(doc(db, 'ligas', liga, 'players', player), { nome: nome || 'Jogador', ativo: true }); }
      b.set(doc(db, 'ligas', liga, 'membros', uid), { uid, player, ts: agora });
      b.set(doc(db, 'filiacoes', `${liga}_${uid}`), { uid, liga, player, ts: agora });
      await b.commit();
      delete cacheMapa[liga];
      return player;
    },
    // Pessoas com conta na plataforma (membros/ da Futebolada semanal), com o nome e a foto de lá.
    async pessoasComConta() {
      const [m, p] = await Promise.all([listRaiz('membros').catch(() => []), listRaiz('players').catch(() => [])]);
      return m.map((x) => { const q = p.find((y) => y.id === x.player); return { uid: x.uid, nome: q?.nome || '?', foto: q?.foto || '' }; }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    },
    // Membros (pessoa Google ↔ jogador) de uma liga; null = a Futebolada semanal (membros/ na raiz).
    listMembros: (liga) => (liga ? listRaiz('ligas', liga, 'membros') : listRaiz('membros')),
    async tirarMembro(liga, uid) { const b = writeBatch(db); b.delete(doc(db, 'ligas', liga, 'membros', uid)); b.delete(doc(db, 'filiacoes', `${liga}_${uid}`)); await b.commit(); },
    setLiga: (id, d) => setDoc(doc(db, 'ligas', id), d, { merge: true }),
    // ⌚ Relógios que se apresentaram com a chave do relógio (só o admin vê); apagar um corta-lhe o acesso até voltar a entrar.
    listRelogios: () => listRaiz('relogios').catch(() => []),
    desligarRelogio: (id) => deleteDoc(doc(db, 'relogios', id)),
    // Definições da liga ativa (nome, cor, pública): a Futebolada semanal guarda-as em public/liga; as outras no próprio documento.
    async getConfigLiga() {
      if (L()) { const l = (await getRaiz('ligas', L()).catch(() => null)) || {}; return { nome: l.nome || L(), cor: l.cor || 'azul', publico: l.publico !== false, publicoDefinido: 'publico' in l, criador: l.criador, admins: l.admins || [] }; }   // pública por defeito
      const c = (await getRaiz('public', 'liga').catch(() => null)) || {};
      return { nome: c.nome || 'Futebolada semanal', cor: c.cor || 'vermelho', publico: c.publico !== false, raiz: true };
    },
    setConfigLiga: (d) => (L() ? setDoc(doc(db, 'ligas', L()), d, { merge: true }) : setDoc(doc(db, 'public', 'liga'), d, { merge: true })),
    apagarConta: (uid) => deleteDoc(doc(db, 'contas', uid)),
    // O próprio muda o PIN: no mesmo lote, o PIN (só o hash) e a ligação deste browser.
    async mudarPin(id, pin) {
      if (L() && (await get('players', id).catch(() => null))?.pinEm) throw new Error('O PIN é o mesmo em todas as ligas: muda-o na tua primeira liga');
      const uid = await this.uid(), h = await sha256hex(pin + id), b = writeBatch(db);
      b.set(D('pins', id), L() ? { h, usado: true } : { h });
      b.set(D('ligacoes', uid), { player: id, h, ts: Date.now() });
      await b.commit();
    },
    // Admin: PINs (aleatórios guardam 'pin' para reenviar; os escolhidos pelo jogador só têm 'h').
    // Numa liga, o admin só lê os PINs ainda por usar (o Rui lê todos).
    listPins: async () => { try { return await list('pins'); } catch { if (!L()) throw new Error('Sem permissão');
      return (await getDocs(fs.query(Cl('pins'), fs.where('usado', '==', false)))).docs.map((d) => ({ id: d.id, ...d.data() })); } },
    async definirPin(id, pin) {
      await setDoc(D('pins', id), L() ? { h: await sha256hex(pin + id), pin, usado: false } : { h: await sha256hex(pin + id), pin });
      await setDoc(D('players', id), { temPin: true }, { merge: true }).catch(() => {});
    },
    // 👥 Contas: o jogador desta liga usa o PIN que a pessoa já tem noutra liga (lk = 'fs' ou o id da liga; oid = o jogador de lá).
    async pinPessoa(id, lk, oid) {
      await setDoc(D('pins', id), { liga: lk, id: oid, usado: true });
      await setDoc(D('players', id), { pinEm: { liga: lk, id: oid }, temPin: true }, { merge: true });
    },
    listLigacoes: () => list('ligacoes'),
    definirUsado: (id, usado) => setDoc(D('pins', id), { usado }, { merge: true }),
    // Carta de cada um (sem votos individuais) + histórico mensal: escreve o admin, lê só o próprio (PIN).
    // Tickets (problemas reportados): qualquer pessoa cria (com login anónimo); só o admin lê.
    async novoTicket(d) { await this.uid(); const id = novoToken(12); await setDoc(doc(db, 'tickets', id), d); return id; },
    listTickets: () => listRaiz('tickets'),
    // Avaliação de um jogo (votosJogo/{jogo}_{votante}): só o próprio (com PIN) lê e escreve; o admin lê tudo. Não entra nas cartas.
    getVotoJogo: (jogo, votante) => get('votosJogo', jogo + '_' + votante),
    saveVotoJogo: (jogo, votante, d) => setDoc(D('votosJogo', jogo + '_' + votante), { ...d, jogo, votante }),
    listVotosJogo: () => list('votosJogo'),
    setTicket: (id, d) => setDoc(doc(db, 'tickets', id), d),
    deleteTicket: (id) => deleteDoc(doc(db, 'tickets', id)),
    // Dados de saúde e treinos do relógio: escreve só o próprio (PIN); o admin só lê.
    getSaude: (id) => get('saude', id),
    listSaude: () => list('saude'),
    setSaude: (id, d) => setDoc(D('saude', id), d),
    listTreinos: async (id) => (await getDocs(Cl('saude', id, 'treinos'))).docs.map((d) => ({ id: d.id, ...d.data() })),
    saveTreino: (id, t, d) => setDoc(D('saude', id, 'treinos', t), d),
    deleteTreino: (id, t) => deleteDoc(D('saude', id, 'treinos', t)),
    async apagarSaude(id) {
      for (const d of (await getDocs(Cl('saude', id, 'treinos'))).docs) await deleteDoc(d.ref);
      await deleteDoc(D('saude', id));
    },
    // O resumo físico tem listas dentro de listas (zonas, grelha), que o Firestore não aceita: guarda-se em texto (fisicoJson).
    getMinhaCarta: async (id) => desembrulharFis(await get('minhacarta', id)),
    listMinhasCartas: async () => (await list('minhacarta')).map(desembrulharFis),
    setMinhaCarta: (id, d) => { const { fisico, ...r } = d || {}; return setDoc(D('minhacarta', id), fisico ? { ...r, fisicoJson: JSON.stringify(fisico) } : r); },
    getVotes: (id) => get('votes', id),
    listVotes: () => list('votes'),
    saveVote: (voter, target, rating) =>
      setDoc(D('votes', voter), { voter, r: { [target]: rating }, ts: Date.now() }, { merge: true }),
    // public/cartas deixou de ser legível para os jogadores (cartas sempre privadas): sem permissão devolve null.
    getPublic: (d) => get('public', d).catch((e) => { if (d === 'cartas') return null; throw e; }),
    setPublic: (d, v) => setDoc(D('public', d), v),
    async saveGame(g) { const id = g.id || novoToken(10); const { id: _, ...d } = g; await setDoc(D('games', id), d); return id; },
    deleteGame: (id) => deleteDoc(D('games', id)),
    listGames: () => list('games'),
    listResultados: () => list('resultados'),
    deleteResultado: (id) => deleteDoc(D('resultados', id)),
    setChaveRelogio: (chave) => setDoc(D('segredos', 'relogio'), { chave }, { merge: true }),   // merge: guarda o dono (o relógio lê as ligas dele)
    getSegredo: (d) => get('segredos', d),
    setSegredo: (d, v) => setDoc(D('segredos', d), v),
    // Link de colaborador: tudo debaixo de partilha/{chave}/… (só quem sabe a chave lê/escreve).
    listPart: async (k, c) => (await getDocs(Cl('partilha', k, c))).docs.map((d) => ({ id: d.id, ...d.data() })),
    getPart: async (k, c, id) => { const d = await getDoc(D('partilha', k, c, id)); return d.exists() ? d.data() : null; },
    setPart: async (k, c, id, d) => { await setDoc(D('partilha', k, c, id), d); return id; },
    saveResultado: (id, d) => setDoc(D('resultados', id), d),
    // Resumo público de cada jogo (sem dados de saúde): alimenta as estatísticas do link geral.
    listJogosPub: () => list('jogos'),
    saveJogoPub: (id, d) => setDoc(D('jogos', id), d),
    deleteJogoPub: (id) => deleteDoc(D('jogos', id)),
    // Jogo de hoje ao vivo: aovivo/jogo (todos leem; escrevem moderadores e admin), em tempo real.
    // d: 'jogo' (o a sério) ou 'teste' (jogo de teste dos moderadores, não conta para nada).
    getAoVivo: (d = 'jogo') => get('aovivo', d),
    setAoVivo: (v, junta = true, d = 'jogo') => setDoc(D('aovivo', d), v, { merge: junta }),
    ouvirAoVivo: (cb, d = 'jogo') => fs.onSnapshot(D('aovivo', d), (x) => cb(x.exists() ? x.data() : null), (e) => console.error(e)),
    // moderacao/chave = chave do link (só moderadores com PIN e o admin leem; só o admin escreve).
    getModeracao: (d) => get('moderacao', d),
    setModeracao: (d, v) => setDoc(D('moderacao', d), v),
  };
  };
  const base = fazer(() => LIGA_APP);
  base.para = (id) => { const v = fazer(() => id || null); v.para = base.para; return v; };
  return base;
}

// ?demo no endereço força o modo demo (para testes, sem tocar nos dados reais).
const forcarDemo = new URLSearchParams(location.search).has('demo');
export const DB = FIREBASE_CONFIG && !forcarDemo ? await fireDb() : demoDb();
