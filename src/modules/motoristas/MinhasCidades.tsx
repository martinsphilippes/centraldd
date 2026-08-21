// Tela do MOTORISTA: preferência por cidade (Prefiro / Posso / Nunca).
// É parametrização — vale para todos os dias e alimenta a alocação
// automática: "Prefiro" pontua a favor, "Nunca" tira o motorista da cidade.

import { useState } from 'react'
import { useSessao } from '../../context/SessaoContext'
import { salvarPreferenciasCidades, useDB } from '../../core/db'
import { cidadesDoTexto } from '../../core/planilha'
import { Button, Card, EmptyState, Input } from '../../components/ui'

type Preferencia = 'prefiro' | 'posso' | 'nunca'

const OPCOES: { valor: Preferencia; rotulo: string; emoji: string; ativo: string }[] = [
  { valor: 'prefiro', rotulo: 'Prefiro', emoji: '⭐', ativo: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { valor: 'posso', rotulo: 'Posso', emoji: '👍', ativo: 'border-ml-azul bg-blue-50 text-ml-azul' },
  { valor: 'nunca', rotulo: 'Nunca', emoji: '🚫', ativo: 'border-red-500 bg-red-50 text-red-700' },
]

/** "A, B" → ['A','B'] sem espaços sobrando nem vazios. */
function lista(texto?: string): string[] {
  return (texto ?? '')
    .split(/[,;\n]/)
    .map((c) => c.trim())
    .filter(Boolean)
}

const chave = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

export function MinhasCidades() {
  const { motoristaId } = useSessao()
  const db = useDB()
  const [nova, setNova] = useState('')
  const [aviso, setAviso] = useState('')

  const eu = db.motoristas.find((m) => m.id === motoristaId)
  if (!eu) return <EmptyState icone="🚚" titulo="Cadastro não encontrado" />

  const preferidas = lista(eu.cidadesPreferidas)
  const bloqueadas = lista(eu.cidadesBloqueadas)

  // Cidades da operação: das rotas carregadas, da programação e do que o
  // próprio motorista já marcou (para nada sumir da lista).
  const daOperacao = [
    ...db.rotas.flatMap((r) => cidadesDoTexto(r.cidade)),
    ...db.programacao.flatMap((p) => cidadesDoTexto(p.cidade)),
    eu.cidade,
    ...preferidas,
    ...bloqueadas,
  ]
    .map((c) => c.trim())
    .filter(Boolean)

  const cidades = [...new Map(daOperacao.map((c) => [chave(c), c])).values()].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )

  const preferenciaDe = (cidade: string): Preferencia => {
    if (bloqueadas.some((c) => chave(c) === chave(cidade))) return 'nunca'
    if (preferidas.some((c) => chave(c) === chave(cidade))) return 'prefiro'
    return 'posso'
  }

  const definir = (cidade: string, valor: Preferencia) => {
    const semCidade = (arr: string[]) => arr.filter((c) => chave(c) !== chave(cidade))
    const novasPreferidas = valor === 'prefiro' ? [...semCidade(preferidas), cidade] : semCidade(preferidas)
    const novasBloqueadas = valor === 'nunca' ? [...semCidade(bloqueadas), cidade] : semCidade(bloqueadas)
    salvarPreferenciasCidades(eu.id, novasPreferidas.join(', '), novasBloqueadas.join(', '))
    setAviso(
      valor === 'prefiro'
        ? `⭐ ${cidade} marcada como preferida.`
        : valor === 'nunca'
          ? `🚫 ${cidade} marcada como cidade que você não faz.`
          : `👍 ${cidade} voltou para "posso fazer".`,
    )
  }

  const acrescentar = () => {
    const cidade = nova.trim()
    if (!cidade) return
    if (!cidades.some((c) => chave(c) === chave(cidade))) definir(cidade, 'prefiro')
    setNova('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">📍 Cidades preferidas</h1>
        <p className="text-sm text-slate-500">
          Diga de antemão onde você prefere entregar. A coordenação vê isso e a distribuição
          automática das rotas leva em conta — vale para todos os dias, não precisa repetir.
        </p>
      </div>

      {aviso && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {aviso}
        </p>
      )}

      <Card className="p-4">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-slate-500">
          <span>⭐ Prefiro — priorizam você</span>
          <span>👍 Posso — normal</span>
          <span>🚫 Nunca — não te mandam</span>
        </div>

        {cidades.length === 0 ? (
          <EmptyState
            icone="📍"
            titulo="Nenhuma cidade na operação ainda"
            descricao="Assim que a coordenação carregar as rotas, as cidades aparecem aqui. Você também pode acrescentar abaixo."
          />
        ) : (
          <ul className="space-y-2">
            {cidades.map((cidade) => {
              const atual = preferenciaDe(cidade)
              return (
                <li
                  key={cidade}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5"
                >
                  <span className="font-semibold text-slate-800">
                    {cidade}
                    {chave(cidade) === chave(eu.cidade) && (
                      <span className="ml-1 text-[11px] font-normal text-slate-400">• sua cidade</span>
                    )}
                  </span>
                  <div className="flex gap-1.5">
                    {OPCOES.map((o) => (
                      <button
                        key={o.valor}
                        onClick={() => definir(cidade, o.valor)}
                        className={`rounded-lg border-2 px-2.5 py-1.5 text-xs font-bold transition-colors active:scale-95 ${
                          atual === o.valor ? o.ativo : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {o.emoji} {o.rotulo}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Acrescentar cidade que você prefere…"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') acrescentar()
            }}
            className="min-w-48 flex-1"
          />
          <Button variante="ml" onClick={acrescentar} disabled={!nova.trim()}>
            ➕ Acrescentar
          </Button>
        </div>
      </Card>

      <p className="text-center text-[11px] text-slate-400">
        Salva na hora. A coordenação pode ajustar em casos excepcionais.
      </p>
    </div>
  )
}
