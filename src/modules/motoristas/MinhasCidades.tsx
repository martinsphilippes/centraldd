// Tela do MOTORISTA: preferência por cidade (Prefiro / Posso / Nunca).
// É parametrização — vale para todos os dias e alimenta a alocação
// automática: "Prefiro" pontua a favor, "Nunca" tira o motorista da cidade.

import { useState } from 'react'
import { useSessao } from '../../context/SessaoContext'
import { salvarPreferenciasCidades, useDB } from '../../core/db'
import { normalizarTexto } from '../../core/texto'
import { Card, EmptyState } from '../../components/ui'

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

const chave = normalizarTexto

export function MinhasCidades() {
  const { motoristaId } = useSessao()
  const db = useDB()
  const [aviso, setAviso] = useState('')

  const eu = db.motoristas.find((m) => m.id === motoristaId)
  if (!eu) return <EmptyState icone="🚚" titulo="Cadastro não encontrado" />

  const preferidas = lista(eu.cidadesPreferidas)
  const bloqueadas = lista(eu.cidadesBloqueadas)

  // A lista vem do coordenador (tela Cidades da operação) — o motorista só
  // qualifica o que a operação atende, não inventa cidade.
  const cidades = db.cidades
    .map((c) => c.nome)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const preferenciaDe = (cidade: string): Preferencia => {
    if (bloqueadas.some((c) => chave(c) === chave(cidade))) return 'nunca'
    // Só a primeira vale como preferida (cadastros antigos podiam ter várias).
    if (preferidas[0] && chave(preferidas[0]) === chave(cidade)) return 'prefiro'
    return 'posso'
  }

  const definir = (cidade: string, valor: Preferencia) => {
    const semCidade = (arr: string[]) => arr.filter((c) => chave(c) !== chave(cidade))
    const anterior = preferidas[0]
    // ⭐ Prefiro é UMA só: escolher outra troca a estrela de lugar.
    const novasPreferidas = valor === 'prefiro' ? [cidade] : semCidade(preferidas)
    const novasBloqueadas = valor === 'nunca' ? [...semCidade(bloqueadas), cidade] : semCidade(bloqueadas)
    salvarPreferenciasCidades(eu.id, novasPreferidas.join(', '), novasBloqueadas.join(', '))
    setAviso(
      valor === 'prefiro'
        ? `⭐ ${cidade} é a sua cidade preferida${
            anterior && chave(anterior) !== chave(cidade) ? ` (antes era ${anterior})` : ''
          }.`
        : valor === 'nunca'
          ? `🚫 ${cidade} marcada como cidade que você não faz.`
          : `👍 ${cidade} voltou para "posso fazer".`,
    )
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
        <div className="mb-2 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-slate-500">
          <span>⭐ Prefiro — só uma cidade</span>
          <span>👍 Posso — quantas quiser</span>
          <span>🚫 Nunca — quantas quiser</span>
        </div>
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {preferidas.length > 0 ? (
            <>
              ⭐ Sua cidade preferida hoje é <strong>{preferidas[0]}</strong>. Marcar outra como
              “Prefiro” <strong>troca</strong> — só vale uma.
            </>
          ) : (
            <>⭐ Escolha <strong>uma</strong> cidade preferida. As demais podem ficar como “Posso” ou “Nunca”.</>
          )}
        </p>

        {cidades.length === 0 ? (
          <EmptyState
            icone="📍"
            titulo="Nenhuma cidade cadastrada ainda"
            descricao="Assim que a coordenação cadastrar as cidades da operação, elas aparecem aqui para você marcar onde prefere entregar."
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

      </Card>

      <p className="text-center text-[11px] text-slate-400">
        Salva na hora. A coordenação pode ajustar em casos excepcionais.
      </p>
    </div>
  )
}
