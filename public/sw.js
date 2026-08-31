// Service worker do Central DD.
// Estratégia de velocidade:
//  - Arquivos estáticos (JS/CSS com hash, ícones): CACHE PRIMEIRO — depois da
//    1ª visita, abrem do aparelho, sem rede.
//  - Página (index.html): REDE PRIMEIRO com cache de reserva — atualizações
//    chegam na hora, e o app ainda abre offline.
//  - Firebase/dados: sempre direto na rede (tempo real).

const CACHE = 'centraldd-v13'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const chaves = await caches.keys()
      const preservar = [CACHE, CACHE_COMPARTILHADO]
      await Promise.all(
        chaves.filter((c) => !preservar.includes(c)).map((c) => caches.delete(c)),
      )
      await self.clients.claim()
    })(),
  )
})

// Onde o arquivo compartilhado espera até o app pegá-lo.
const CACHE_COMPARTILHADO = 'centraldd-compartilhado'
const CHAVE_COMPARTILHADO = '/__arquivo-compartilhado'

self.addEventListener('fetch', (event) => {
  const req = event.request
  const alvo = new URL(req.url)

  /*
   * Compartilhar do Android: o sistema entrega o arquivo aqui num POST. Este
   * endereço não existe no servidor — quem responde é este service worker, e é
   * por isso que o app continua sendo só arquivos estáticos na hospedagem.
   *
   * O arquivo é guardado no aparelho e o app abre direto na Conferência, que o
   * consome. Guardar em vez de passar pela URL evita limite de tamanho e não
   * deixa a lista de pacotes no histórico do navegador.
   */
  if (req.method === 'POST' && alvo.pathname === '/compartilhar') {
    event.respondWith(
      (async () => {
        try {
          const form = await req.formData()
          const arquivo = form.get('arquivo') || form.getAll('arquivo')[0]
          const texto = form.get('texto') || form.get('title') || ''
          const cache = await caches.open(CACHE_COMPARTILHADO)
          if (arquivo && typeof arquivo !== 'string' && arquivo.size > 0) {
            await cache.put(
              CHAVE_COMPARTILHADO,
              new Response(arquivo, {
                headers: {
                  'content-type': 'text/plain; charset=utf-8',
                  'x-nome-arquivo': encodeURIComponent(arquivo.name || 'compartilhado.csv'),
                },
              }),
            )
          } else if (typeof texto === 'string' && texto.trim()) {
            // Alguns apps compartilham as numerações como TEXTO, sem arquivo.
            await cache.put(
              CHAVE_COMPARTILHADO,
              new Response(texto, {
                headers: {
                  'content-type': 'text/plain; charset=utf-8',
                  'x-nome-arquivo': 'compartilhado.txt',
                },
              }),
            )
          }
        } catch {
          // Não deu para ler o que veio — o app avisa na tela.
        }
        return Response.redirect(new URL('/#/minha-conferencia', self.location.origin).href, 303)
      })(),
    )
    return
  }

  if (req.method !== 'GET') return
  const url = alvo
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
