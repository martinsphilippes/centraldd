// Tela do MOTORISTA: as conferências que o Dispatcher mandou para ele.
// Ele envia o CSV do que tem em mãos e vê na hora se bateu — a mesma
// resposta que o Dispatcher vê do outro lado.

import { useState } from 'react'
import { enviarConferenciaMotorista, useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { rotuloDia } from '../../core/dates'
import type { Conferencia } from '../../core/types'
import { Button, Card, EmptyState } from '../../components/ui'
import { EntradaNumeracoes } from './EntradaNumeracoes'
import { CarimbosConferencia, ResultadoConferencia } from './ResultadoConferencia'

/** O envio de uma conferência: entrada, contagem e confirmação. */
function Envio({ c }: { c: Conferencia }) {
  const [valores, setValores] = useState<string[]>([])
  const [arquivo, setArquivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = () => {
    if (valores.length === 0) return
    setEnviando(true)
    enviarConferenciaMotorista(c.id, valores, arquivo)
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-700">
        📥 Envie a sua lista ({c.esperados.length} numeração(ões) esperada(s))
      </p>
      <p className="text-xs text-slate-500">
        📎 Mande o <strong>CSV do app de leitura</strong> do jeito que ele exporta — o sistema acha
        a numeração sozinho, tanto no QR Code quanto no código de barras, e ignora bipada repetida.
      </p>
      <EntradaNumeracoes
        aoLer={(v, a) => {
          setValores(v)
          setArquivo(a)
        }}
        placeholder="Envie o CSV do app de leitura, ou cole/digite as numerações…"
      />
      <div className="flex justify-end">
        <Button variante="ml" onClick={enviar} disabled={valores.length === 0 || enviando}>
          {enviando ? '⏳ Enviando…' : `✅ Conferir ${valores.length} numeração(ões)`}
        </Button>
      </div>
    </div>
  )
}

export function MinhaConferencia() {
  const db = useDB()
  const { motoristaId } = useSessao()
  const [refazer, setRefazer] = useState<string | null>(null)

  if (!motoristaId) return <EmptyState icone="🚚" titulo="Cadastro não encontrado" />

  const minhas = db.conferencias
    .filter((c) => c.motoristaId === motoristaId)
    .sort((a, b) => b.data.localeCompare(a.data) || b.enviadaEm.localeCompare(a.enviadaEm))

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">🔍 Minha conferência</h1>
        <p className="text-sm text-slate-500">
          Confira os pacotes da sua carga: envie a sua lista e veja na hora se bateu com o que o
          Dispatcher separou.
        </p>
      </div>

      {minhas.length === 0 ? (
        <EmptyState
          icone="🔍"
          titulo="Nenhuma conferência para você"
          descricao="Quando o Dispatcher abrir uma conferência com o seu nome, ela aparece aqui automaticamente."
        />
      ) : (
        minhas.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="mb-2">
              <h2 className="font-bold text-slate-900">{c.titulo}</h2>
              <p className="text-xs text-slate-500">📅 {rotuloDia(c.data)}</p>
            </div>

            <div className="space-y-2">
              <ResultadoConferencia c={c} />
              <CarimbosConferencia c={c} />

              {c.conferidos === null || refazer === c.id ? (
                <Envio c={c} />
              ) : (
                <Button variante="secundario" onClick={() => setRefazer(c.id)}>
                  🔄 Conferir de novo
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
