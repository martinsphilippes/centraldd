// Service worker do MLDisponibilidade.
// Estratégia de velocidade:
//  - Arquivos estáticos (JS/CSS com hash, ícones): CACHE PRIMEIRO — depois da
//    1ª visita, abrem do aparelho, sem rede.
//  - Página (index.html): REDE PRIMEIRO com cache de reserva — atualizações
//    chegam na hora, e o app ainda abre offline.
//  - Firebase/dados: sempre direto na rede (tempo real).

const CACHE = 'mldisponibilidade-v2'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const chaves = await caches.keys()
      await Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return // dados/Firebase: rede direta

  // Navegação (abrir o app): rede primeiro, reserva do cache para offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const resp = await fetch(req)
          const cache = await caches.open(CACHE)
          cache.put('/index.html', resp.clone())
          return resp
        } catch {
          const reserva = await caches.match('/index.html')
          return reserva ?? Response.error()
        }
      })(),
    )
    return
  }

  // Estáticos: cache primeiro (os nomes têm hash — nunca ficam desatualizados).
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(
      (async () => {
        const emCache = await caches.match(req)
        if (emCache) return emCache
        const resp = await fetch(req)
        if (resp.ok) {
          const cache = await caches.open(CACHE)
          cache.put(req, resp.clone())
        }
        return resp
      })(),
    )
  }
})
