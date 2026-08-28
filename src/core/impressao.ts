// Serviço de impressão do app.
//
// Antes, cada tela chamava window.open('', '_blank') para montar a folha de
// impressão. No app INSTALADO (PWA) essa janela abre sem barra de navegador:
// não há voltar, não há fechar — o usuário fica preso e precisa matar o app.
//
// Agora o documento é publicado aqui e a prévia abre DENTRO do app, num
// overlay com ✕, Esc e botão de imprimir. Nunca se sai da tela.

import { useSyncExternalStore } from 'react'

let documentoAtual: string | null = null
const ouvintes = new Set<() => void>()

function avisar() {
  for (const o of ouvintes) o()
}

/** Abre a prévia de impressão com um documento HTML completo. */
export function abrirImpressao(html: string) {
  documentoAtual = html
  avisar()
}

export function fecharImpressao() {
  documentoAtual = null
  avisar()
}

export function useDocumentoImpressao(): string | null {
  return useSyncExternalStore(
    (l) => {
      ouvintes.add(l)
      return () => ouvintes.delete(l)
    },
    () => documentoAtual,
  )
}
