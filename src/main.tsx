import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './app/App'
import { SessaoProvider } from './context/SessaoContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <SessaoProvider>
        <App />
      </SessaoProvider>
    </HashRouter>
  </StrictMode>,
)

// Vigia de versão: o app do Dispatcher fica aberto o dia inteiro no tablet e
// nunca "renavega" — sem isso, uma versão nova só chegava fechando e abrindo.
// A cada volta ao app (e a cada 10 min), compara o bundle do servidor com o
// que está rodando: mudou e o app está em segundo plano → recarrega sozinho;
// mudou com o app em uso → mostra um aviso de um toque, sem interromper.
function vigiarVersao() {
  const meuBundle = /index-[A-Za-z0-9_-]+\.js/.exec(
    document.querySelector<HTMLScriptElement>('script[src*="index-"]')?.src ?? '',
  )?.[0]
  if (!meuBundle) return
  let avisou = false

  const verificar = async (recarregarDireto: boolean) => {
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text()
      const doServidor = /index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0]
      if (!doServidor || doServidor === meuBundle) return
      if (recarregarDireto) {
        location.reload()
        return
      }
      if (avisou) return
      avisou = true
      const aviso = document.createElement('button')
      aviso.textContent = '🔄 Nova versão disponível — toque para atualizar'
      aviso.style.cssText =
        'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:9999;' +
        'background:#ffe600;color:#1e293b;font-weight:700;font-size:14px;border:none;' +
        'border-radius:12px;padding:10px 16px;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer'
      aviso.onclick = () => location.reload()
      document.body.appendChild(aviso)
    } catch {
      // sem rede agora — tenta na próxima
    }
  }

  document.addEventListener('visibilitychange', () => {
    // Voltou para o app: recarregar aqui é invisível para quem usa.
    if (document.visibilityState === 'visible') void verificar(true)
  })
  setInterval(() => void verificar(false), 10 * 60 * 1000)
}
vigiarVersao()

// PWA: registra o service worker (necessário para instalar na tela de início).
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
  // Quando uma versão nova assume o controle, recarrega UMA vez — assim o app
  // instalado nunca fica preso numa versão antiga.
  const tinhaControlador = !!navigator.serviceWorker.controller
  let recarregou = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (tinhaControlador && !recarregou) {
      recarregou = true
      location.reload()
    }
  })
}
