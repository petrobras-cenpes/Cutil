// Versão do cache. INCREMENTE este número (v1 -> v2 -> v3...) sempre que
// atualizar o data.json, app.js, style.css ou index.html, para forçar
// o Service Worker a buscar e cachear as versões novas dos arquivos.
const CACHE_VERSION = "cutil-v1";

// Lista de arquivos essenciais para o app funcionar completamente offline.
const FILES_TO_CACHE = [
  "./index.html",
  "./app.js",
  "./style.css",
  "./data.json",
  "./manifest.json",
  "./icon-512.png"
];

// Instalação: baixa e guarda em cache todos os arquivos essenciais.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

// Ativação: remove caches de versões antigas, evitando acúmulo de lixo.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Estratégia: cache primeiro (resposta instantânea, funciona offline),
// com atualização em segundo plano quando há internet disponível.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => null);

      // Se existe versão em cache, retorna ela imediatamente (offline-first).
      // Caso contrário, espera a resposta da rede.
      return cachedResponse || networkFetch;
    })
  );
});
