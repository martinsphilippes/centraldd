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

// PWA: registra o service worker (necessário para instalar na tela de início).
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
