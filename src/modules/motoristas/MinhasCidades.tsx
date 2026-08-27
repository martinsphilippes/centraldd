// Tela do MOTORISTA: preferência por cidade (Prefiro / Posso / Não tenho preferência).
// É parametrização — vale para todos os dias e alimenta a alocação automática:
// "Prefiro" pontua alto, "Posso" pontua um pouco, "Não tenho preferência" é
// neutro (nem ajuda nem atrapalha — é o estado padrão de toda cidade).
//
// Nenhuma das três opções impede nada: toda cidade da operação continua
// disponível para todo motorista.

import { useState } from 'react'
import { useSessao } from '../../context/SessaoContext'
import { salvarPreferenciasCidades, useDB } from '../../core/db'
import { normalizarTexto } from '../../core/texto'
import { Card, EmptyState } from '../../components/ui'

type Preferencia = 'prefiro' | 'posso' | 'indiferente'

const OPCOES: { valor: Preferencia; rotulo: string; emoji: string; ativo: string }[] = [
  { valor: 'prefiro', rotulo: 'Prefiro', emoji: '⭐', ativo: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { valor: 'posso', rotulo: 'Posso', emoji: '👍', ativo: 'border-ml-azul bg-blue-50 text-ml-azul' },
  {
    valor: 'indiferente',
    rotulo: 'Não tenho preferência',
    emoji: '😐',
    ativo: 'border-slate-400 bg-slate-100 text-slate-700',
  },
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
  const possiveis = lista(eu.cidadesPossiveis)

  // A lista vem do Dispatcher (tela Cidades da operação) — o motorista só
  // qualifica o que a operação atende, não inventa cidade.
  const cidades = db.cidades.map((c) => c.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const preferenciaDe = (cidade: string): Preferencia => {
    // Só a primeira vale como preferida (cadastros antigos podiam ter várias).
    if (preferidas[0] && chave(preferidas[0]) === chave(cidade)) return 'prefiro'
    if (possiveis.some((c) => chave(c) === chave(cidade))) return 'posso'
    return 'indiferente'
  }

  const definir = (cidade: string, valor: Preferencia) => {
    const semCidade = (arr: string[]) => arr.filter((c) => chave(c) !== chave(cidade))
    const anterior = preferidas[0]
    // ⭐ Prefiro é UMA só: escolher outra troca a estrela de lugar. A cidade que
    // vira preferida sai da lista de "posso" para não contar duas vezes.
    const novasPreferidas = valor === 'prefiro' ? [cidade] : semCidade(preferidas)
    const novasPossiveis = valor === 'posso' ? [...semCidade(possiveis), cidade] : semCidade(possiveis)
    salvarPreferenciasCidades(eu.id, novasPreferidas.join(', '), novasPossiveis.join(', '))
    setAviso(
      valor === 'prefiro'
        ? `⭐ ${cidade} é a sua cidade preferida${
            anterior && chave(anterior) !== chave(cidade) ? ` (antes era ${anterior})` : ''
          }.`
        : valor === 'posso'
          ? `👍 ${cidade} marcada como cidade que você faz.`
          : `😐 ${cidade} ficou sem preferência — você entra nela normalmente.`,
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">📍 Cidades preferidas</h1>
        <p className="text-sm text-slate-500">
          Diga de antemão onde você prefere entregar. O Dispatcher vê isso e a distribuição
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
          <span>😐 Sem preferência — o padrão</span>
        </div>
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {preferidas.length > 0 ? (
            <>
              ⭐ Sua cidade preferida hoje é <strong>{preferidas[0]}</strong>. Marcar outra como
              “Prefiro” <strong>troca</strong> — só vale uma.
            </>
          ) : (
            <>
              ⭐ Escolha <strong>uma</strong> cidade preferida. As demais podem ficar como “Posso” ou
              “Não tenho preferência”.
            </>
          )}
          <br />
          😐 Nenhuma opção <strong>impede</strong> nada: você continua podendo ser direcionado para
          qualquer cidade — a preferência só decide quem tem prioridade em cada uma.
        </p>

        {cidades.length === 0 ? (
          <EmptyState
            icone="📍"
            titulo="Nenhuma cidade cadastrada ainda"
            descricao="Assim que o Dispatcher cadastrar as cidades da operação, elas aparecem aqui para você marcar onde prefere entregar."
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
        Salva na hora. O Dispatcher pode ajustar em casos excepcionais.
      </p>
    </div>
  )
}
