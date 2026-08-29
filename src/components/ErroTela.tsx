// Rede de proteção: se uma tela quebrar em execução, o app mostra um aviso
// com botão de recarregar em vez de virar uma página branca — e o resto do
// app (menu, outras telas) continua funcionando.

import { Component, type ReactNode } from 'react'

interface Estado {
  erro: Error | null
}

export class ErroTela extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-red-200 bg-red-50 p-5 text-center">
        <p className="text-3xl">😵</p>
        <p className="font-bold text-slate-900">Algo quebrou nesta tela</p>
        <p className="text-sm text-slate-600">
          O resto do app continua funcionando. Toque em recarregar — se o problema voltar, avise o
          suporte com a mensagem abaixo.
        </p>
        <p className="rounded-lg bg-white px-3 py-2 font-mono text-[11px] text-red-700">
          {this.state.erro.message}
        </p>
        <button
          onClick={() => location.reload()}
          className="rounded-lg bg-marca px-4 py-2 text-sm font-bold text-slate-900"
        >
          🔄 Recarregar o app
        </button>
      </div>
    )
  }
}
