// Tela do MOTORISTA: as conferências que o Dispatcher mandou para ele.
// Ele envia o CSV do que tem em mãos e vê na hora se bateu — a mesma
// resposta que o Dispatcher vê do outro lado.

import { useEffect, useState } from 'react'
import {
  enviarConferenciaMotorista,
  limparEnvioConferenciaMotorista,
  mostrarConferenciaMotorista,
  ocultarConferenciaMotorista,
  useDB,
} from '../../core/db'
import { chaveNumeracao, extrairNumeracoes } from '../../core/conferencia'
import { arquivoCompartilhado } from '../../core/compartilhado'
import { useSessao } from '../../context/SessaoContext'
import { rotuloDia } from '../../core/dates'
import type { Conferencia } from '../../core/types'
import { Button, Card, EmptyState } from '../../components/ui'
import { RoteiroRota } from '../roteiro/RoteiroRota'
import { EntradaNumeracoes } from './EntradaNumeracoes'
import { CarimbosConferencia, ResultadoConferencia } from './ResultadoConferencia'

/** O envio de uma conferência: entrada, contagem e confirmação. */
function Envio({ c, recebido }: { c: Conferencia; recebido?: { nome: string; texto: string } }) {
  const [valores, setValores] = useState<string[]>(
    recebido ? extrairNumeracoes(recebido.texto).valores : [],
  )
  const [arquivo, setArquivo] = useState(recebido?.nome ?? '')
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
      {recebido && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          📤 Recebi <strong>{recebido.nome}</strong> pelo Compartilhar, com{' '}
          <strong>{valores.length} numeração(ões)</strong>. Confira e toque em conferir.
        </p>
      )}
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
  const [roteiroAberto, setRoteiroAberto] = useState<string | null>(null)
  // Arquivo que chegou pelo Compartilhar do celular (Android) ou pelo Atalho
  // do iPhone. Vem uma vez; depois de usado, some.
  const [recebido, setRecebido] = useState<{ nome: string; texto: string } | null>(null)
  // Em qual conferência o arquivo recebido entra. Com uma aberta só, é ela.
  const [destino, setDestino] = useState<string | null>(null)

  useEffect(() => {
    void arquivoCompartilhado().then((a) => {
      if (a) setRecebido({ nome: a.nome, texto: a.texto })
    })
  }, [])

  if (!motoristaId) return <EmptyState icone="🚚" titulo="Cadastro não encontrado" />

  /**
   * Quantos pacotes da lista do Dispatcher ainda não foram bipados. Enquanto
   * faltar algum, a conferência é trabalho em aberto — e trabalho em aberto não
   * pode sair da tela do motorista.
   */
  const faltando = (c: (typeof db.conferencias)[number]) => {
    if (c.conferidos === null) return c.esperados.length
    const bipados = new Set(c.conferidos.map(chaveNumeracao))
    return c.esperados.filter((e) => !bipados.has(chaveNumeracao(e))).length
  }

  const porData = (a: { data: string; enviadaEm: string }, b: { data: string; enviadaEm: string }) =>
    b.data.localeCompare(a.data) || b.enviadaEm.localeCompare(a.enviadaEm)
  const todas = db.conferencias.filter((c) => c.motoristaId === motoristaId)
  // O que o motorista tirou da tela sai daqui; o Dispatcher segue com tudo.
  const minhas = todas.filter((c) => !c.ocultaMotorista).sort(porData)
  // Onde o arquivo compartilhado deve entrar: as que ainda não fecharam. Com
  // uma só, ele já entra preenchido; com várias, a motorista escolhe.
  const aguardando = minhas.filter((c) => faltando(c) > 0)
  const alvoDoRecebido = destino ?? (aguardando.length === 1 ? aguardando[0].id : null)
  const escondidas = todas.filter((c) => c.ocultaMotorista).sort(porData)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">🔍 Minha conferência</h1>
        <p className="text-sm text-slate-500">
          Confira os pacotes da sua carga: envie a sua lista e veja na hora se bateu com o que o
          Dispatcher separou.
        </p>
      </div>

      {recebido && aguardando.length === 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            📤 Recebi <strong>{recebido.nome}</strong>, mas você não tem conferência aberta agora.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Quando o Dispatcher abrir a conferência da sua rota, é só compartilhar o arquivo de novo.
          </p>
          <div className="mt-2">
            <Button variante="secundario" onClick={() => setRecebido(null)}>
              Entendi, descartar
            </Button>
          </div>
        </Card>
      )}
      {recebido && aguardando.length > 1 && !destino && (
        <Card className="border-sky-300 bg-sky-50 p-4">
          <p className="text-sm font-semibold text-sky-900">
            📤 Recebi <strong>{recebido.nome}</strong>. De qual rota é?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {aguardando.map((c) => (
              <Button key={c.id} variante="ml" onClick={() => setDestino(c.id)}>
                {c.titulo}
              </Button>
            ))}
            <Button variante="fantasma" onClick={() => setRecebido(null)}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      {minhas.length === 0 && escondidas.length === 0 ? (
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

              {(c.pacotes ?? []).some((p) => p.lat != null) && (
                <>
                  <Button
                    variante={roteiroAberto === c.id ? 'secundario' : 'ml'}
                    onClick={() => setRoteiroAberto((a) => (a === c.id ? null : c.id))}
                  >
                    🧭 {roteiroAberto === c.id ? 'Fechar roteiro' : 'Meu roteiro de entregas'}
                  </Button>
                  {roteiroAberto === c.id && <RoteiroRota c={c} editavel />}
                </>
              )}

              {c.conferidos === null || refazer === c.id || (recebido && alvoDoRecebido === c.id) ? (
                <Envio
                  c={c}
                  recebido={recebido && alvoDoRecebido === c.id ? recebido : undefined}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* Subiu o arquivo errado? Limpar apaga SÓ o envio e devolve o
                      botão de enviar — a conferência continua aqui. */}
                  <Button
                    variante="secundario"
                    onClick={() => {
                      if (
                        confirm(
                          'Limpar o arquivo que você enviou?\n\nA conferência continua aqui e o botão de enviar volta, para você mandar o arquivo certo.',
                        )
                      ) {
                        setRefazer(null)
                        limparEnvioConferenciaMotorista(c.id)
                      }
                    }}
                  >
                    🧹 Limpar meu envio
                  </Button>
                  <Button variante="fantasma" onClick={() => setRefazer(c.id)}>
                    🔄 Enviar outro arquivo
                  </Button>
                  {/* Só sai da tela o que já FECHOU. Com pacote faltando, a
                      conferência é trabalho em aberto: sumir com ela foi o que
                      deixou uma motorista sem como enviar o arquivo certo. */}
                  {faltando(c) === 0 ? (
                    <Button
                      variante="fantasma"
                      onClick={() => {
                        if (
                          confirm(
                            'Tirar esta conferência da sua tela?\n\nEla já fechou — sai daqui só para liberar espaço, e você pode trazer de volta no fim desta tela.',
                          )
                        )
                          ocultarConferenciaMotorista(c.id)
                      }}
                    >
                      👁️ Tirar da minha tela
                    </Button>
                  ) : (
                    <span className="self-center text-xs text-slate-500">
                      Faltam {faltando(c)} pacote(s) — esta conferência fica na sua tela até fechar.
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))
      )}

      {/* Nada fica perdido: o que foi tirado da tela volta com um toque. */}
      {escondidas.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-slate-700">
            👁️ {escondidas.length} conferência(s) que você tirou da tela
          </h2>
          <ul className="mt-2 space-y-1.5">
            {escondidas.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                <span className="font-semibold text-slate-700">{c.titulo}</span>
                <span className="text-xs text-slate-500">📅 {rotuloDia(c.data)}</span>
                <button
                  className="ml-auto rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  onClick={() => mostrarConferenciaMotorista(c.id)}
                >
                  ↩️ Trazer de volta
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
