// Prévia de impressão dentro do app: mostra a folha pronta num quadro, com
// ✕, tecla Esc e toque no fundo para voltar — e o botão que chama a impressão
// de verdade do aparelho.
//
// O documento vive num <iframe> isolado: os estilos da folha não vazam para o
// app, e imprimir o iframe manda só a folha para a impressora/PDF.

import { useEffect, useRef } from 'react'
import { fecharImpressao, useDocumentoImpressao } from '../core/impressao'

export function PreviaImpressao() {
  const html = useDocumentoImpressao()
  const quadroRef = useRef<HTMLIFrameElement>(null)

  // Esc fecha; enquanto a prévia está aberta, o fundo não rola.
  useEffect(() => {
    if (!html) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharImpressao()
    }
    document.addEventListener('keydown', aoTeclar)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [html])

  if (!html) return null

  const imprimir = () => {
    const janela = quadroRef.current?.contentWindow
    if (!janela) return
    janela.focus()
    janela.print()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-900/70 p-2 sm:p-4"
      onClick={fecharImpressao}
    >
      <div
        className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
          <span className="text-sm font-bold text-slate-800">🖨️ Prévia de impressão</span>
          <span className="hidden text-xs text-slate-500 sm:inline">
            Esc ou ✕ para voltar ao app
          </span>
          <button
            onClick={imprimir}
            className="ml-auto rounded-lg bg-marca px-3 py-1.5 text-sm font-bold text-slate-900"
          >
            🖨️ Imprimir / salvar PDF
          </button>
          <button
            onClick={fecharImpressao}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
            title="Fechar (Esc)"
          >
            ✕ Fechar
          </button>
        </div>
        <iframe
          ref={quadroRef}
          title="Prévia de impressão"
          srcDoc={html}
          className="min-h-0 w-full flex-1 bg-white"
        />
      </div>
    </div>
  )
}
