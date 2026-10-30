// Service worker da app instalável (PWA). Rede primeiro: abre sempre a versão mais recente quando há rede;
// sem rede mostra a última que viu. Os dados (Firestore) precisam sempre de rede — não são guardados aqui.
const CACHE = 'futebolada-v79';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== 'partilha').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// "Partilhar → Futebolada" (Android): o ficheiro do relógio chega aqui por POST; fica guardado na cache 'partilha'
// até o perfil o ler (app.js → ficheiroPartilhado) e a app abre no perfil.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || url.origin !== location.origin || !url.pathname.endsWith('/partilha')) return;
  e.respondWith((async () => {
    try {
      const f = (await e.request.formData()).getAll('ficheiro').find((x) => x && x.size);
      if (f) await (await caches.open('partilha')).put('./ficheiro-partilhado', new Response(f, { headers: { 'X-Nome': encodeURIComponent(f.name || 'treino') } }));
    } catch (err) { /* sem ficheiro: abre só o perfil */ }
    return Response.redirect(new URL('./?partilha=1#eu', self.registration.scope).href, 303);
  })());
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // Firebase e afins: direto à rede
  e.respondWith(
    fetch(e.request)
      .then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then((r) => r || caches.match('./'))),
  );
});
