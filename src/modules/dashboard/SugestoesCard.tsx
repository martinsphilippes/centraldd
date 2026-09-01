// Sugestões de melhoria que os motoristas mandaram.
//
// A lista mostra QUEM escreveu; o texto só aparece ao tocar no nome. É de
// propósito: a caixa fica curta mesmo com muita sugestão, e ninguém lê o
// desabafo de um motorista por acidente enquanto passa o olho no Dashboard.
//
// Abrir CARIMBA como lida. Assim o contador de novas cai sozinho, sem o
// Dispatcher precisar marcar nada à mão.

import { useState } from 'react'
import { marcarSugestaoLida, removerSugestao, useDB } from '../../core/db'
import { formatarQuandoCurto } from '../../core/dates'
import { Avatar, Badge, Button, Card, EmptyState } from '../../components/ui'

export function SugestoesCard() {
  const db = useDB()
  const [aberta, setAberta] = useState<string | null>(null)

  const sugestoes = [...db.sugestoes].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
  const novas = sugestoes.filter((s) => !s.lidaEm).length
  const nomeDe = (id: string) => db.motoristas.find((m) => m.id === id)?.nome ?? 'Motorista removido'

  const abrir = (id: string, jaLida: boolean) => {
    setAberta((a) => (a === id ? null : id))
    if (!jaLida) marcarSugestaoLida(id)
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">💡 Sugestões dos motoristas</h2>
        {novas > 0 && (
          <Badge className="border-marca bg-marca-suave text-marca-texto">
            {novas} nova(s)
          </Badge>
        )}
      </div>

      {sugestoes.length === 0 ? (
        <EmptyState
          icone="💡"
          titulo="Nenhuma sugestão ainda"
          descricao="Quando um motorista mandar uma ideia pelo Meu perfil, ela aparece aqui."
        />
      ) : (
        <ul className="space-y-2">
          {sugestoes.map((s) => {
            const estaAberta = aberta === s.id
            return (
              <li
                key={s.id}
                className={`rounded-lg border ${
                  s.lidaEm ? 'border-slate-200' : 'border-marca bg-marca-suave/40'
                }`}
              >
                <button
                  onClick={() => abrir(s.id, !!s.lidaEm)}
                  className="flex w-full items-center gap-2 p-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <Avatar nome={nomeDe(s.motoristaId)} tamanho="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {nomeDe(s.motoristaId)}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {formatarQuandoCurto(s.criadaEm)}
                      {!s.lidaEm && <strong className="text-marca-texto"> · não lida</strong>}
                    </span>
                  </span>
                  <span className="shrink-0 text-slate-400">{estaAberta ? '▲' : '▼'}</span>
                </button>
                {estaAberta && (
                  <div className="border-t border-slate-200 p-3">
                    {/* whitespace-pre-line: o motorista escreve em linhas, e
                        juntar tudo num parágrafo só atrapalha a leitura. */}
                    <p className="whitespace-pre-line text-sm text-slate-700">{s.texto}</p>
                    <div className="mt-2 flex justify-end">
                      <Button
                        variante="fantasma"
                        onClick={() => {
                          if (confirm(`Apagar a sugestão de ${nomeDe(s.motoristaId)}?`))
                            removerSugestao(s.id)
                        }}
                      >
                        🗑️ Apagar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
