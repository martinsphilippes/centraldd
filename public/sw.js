// Service worker mínimo: garante a instalabilidade do PWA e assume o controle
// imediatamente. As requisições seguem direto para a rede (dados são tempo real).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
