// Instalação do PWA com um toque (Android/Chrome) via evento beforeinstallprompt.
// No iOS o evento não existe — mostramos a instrução curta do Safari.

import { useEffect, useState } from 'react'

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let eventoGuardado: EventoInstalacao | null = null
const ouvintes = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    eventoGuardado = e as EventoInstalacao
    for (const o of ouvintes) o()
  })
  window.addEventListener('appinstalled', () => {
    eventoGuardado = null
    for (const o of ouvintes) o()
  })
}

function jaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

const CHAVE_DISPENSADO = 'mldisponibilidade:instalar-dispensado'

/** Banner "Instalar aplicativo" — some sozinho quando já instalado ou dispensado. */
export function InstalarBanner() {
  const [, forcar] = useState(0)
  const [dispensado, setDispensado] = useState(() => sessionStorage.getItem(CHAVE_DISPENSADO) === '1')

  useEffect(() => {
    const ouvinte = () => forcar((n) => n + 1)
    ouvintes.add(ouvinte)
    return () => {
      ouvintes.delete(ouvinte)
    }
  }, [])

  if (dispensado || jaInstalado() || !eventoGuardado) return null

  const instalar = async () => {
    const evento = eventoGuardado
    if (!evento) return
    await evento.prompt()
    const escolha = await evento.userChoice
    if (escolha.outcome === 'accepted') eventoGuardado = null
    forcar((n) => n + 1)
  }

  const dispensar = () => {
    sessionStorage.setItem(CHAVE_DISPENSADO, '1')
    setDispensado(true)
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-yellow-300 bg-ml-amarelo/80 px-3 py-2.5 shadow-sm">
      <span className="text-xl">📲</span>
      <p className="min-w-0 flex-1 text-xs font-semibold leading-tight text-slate-800">
        Instale o app na tela de início — um toque e pronto!
      </p>
      <button
        onClick={() => void instalar()}
        className="rounded-lg bg-ml-navy px-3 py-2 text-xs font-bold text-white transition-transform active:scale-95"
      >
        Instalar
      </button>
      <button
        onClick={dispensar}
        className="rounded-full p-1 text-slate-600 hover:bg-black/10"
        aria-label="Dispensar"
        title="Agora não"
      >
        ✕
      </button>
    </div>
  )
}
