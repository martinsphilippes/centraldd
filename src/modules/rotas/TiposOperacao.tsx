// Tela do DISPATCHER: as opções que aparecem nos cadastros.
// O que estiver aqui é o que a pessoa vê ao se cadastrar (veículo) e o que o
// dispatcher escolhe ao cadastrar um motorista. A operação NÃO fica aqui: ela
// vem do par Cidade/Operação que o dono mantém na tela Cidades.

import { useState } from 'react'
import { removerTipoOperacional, salvarTipoOperacional, useDB } from '../../core/db'
import { VEICULOS } from '../../core/constants'
import { normalizarTexto } from '../../core/texto'
import { Badge, Button, Card, Input } from '../../components/ui'

interface Secao {
  categoria: 'veiculo' | 'operacao'
  titulo: string
  descricao: string
  exemplo: string
  padroes: string[]
}

const SECOES: Secao[] = [
  {
    categoria: 'veiculo',
    titulo: '🚐 Veículos',
    descricao: 'Aparecem na pergunta “qual o seu veículo?” do cadastro.',
    exemplo: 'Ex.: Fiorino, Van, HR, Moto…',
    padroes: VEICULOS,
  },
]

export function TiposOperacao() {
  const db = useDB()
  const [novo, setNovo] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState('')

  const daCategoria = (categoria: 'veiculo' | 'operacao') =>
    db.tipos
      .filter((t) => t.categoria === categoria)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const acrescentar = (categoria: 'veiculo' | 'operacao', nome: string) => {
    const limpo = nome.trim()
    if (!limpo) return
    if (daCategoria(categoria).some((t) => normalizarTexto(t.nome) === normalizarTexto(limpo))) {
      setAviso(`⚠️ ${limpo} já está na lista.`)
      return
    }
    salvarTipoOperacional(categoria, limpo)
    setAviso(`✅ ${limpo} entrou na lista — já aparece no cadastro.`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">🏷️ Opções de cadastro</h1>
        <p className="text-sm text-slate-500">
          Defina os <strong>veículos</strong> que existem aqui. É exatamente isso que a pessoa vê
          na lista ao se cadastrar no app. A operação é escolhida pela Cidade/Operação, na tela
          Cidades.
        </p>
      </div>

      {aviso && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {aviso}
        </p>
      )}

      {SECOES.map((secao) => {
        const itens = daCategoria(secao.categoria)
        const faltando = secao.padroes.filter(
          (p) => !itens.some((t) => normalizarTexto(t.nome) === normalizarTexto(p)),
        )
        return (
          <Card key={secao.categoria} className="p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900">{secao.titulo}</h2>
              <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                {itens.length > 0 ? `${itens.length} cadastrado(s)` : 'usando os padrões'}
              </Badge>
            </div>
            <p className="mb-3 text-xs text-slate-500">{secao.descricao}</p>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder={secao.exemplo}
                value={novo[secao.categoria] ?? ''}
                onChange={(e) => setNovo({ ...novo, [secao.categoria]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    acrescentar(secao.categoria, novo[secao.categoria] ?? '')
                    setNovo({ ...novo, [secao.categoria]: '' })
                  }
                }}
                className="min-w-52 flex-1"
              />
              <Button
                variante="marca"
                onClick={() => {
                  acrescentar(secao.categoria, novo[secao.categoria] ?? '')
                  setNovo({ ...novo, [secao.categoria]: '' })
                }}
                disabled={!(novo[secao.categoria] ?? '').trim()}
              >
                ➕ Adicionar
              </Button>
            </div>

            {itens.length === 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="mb-2 text-xs font-semibold text-amber-800">
                  Enquanto a lista estiver vazia, o cadastro usa estes padrões do sistema:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {secao.padroes.map((p) => (
                    <span key={p} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">
                      {p}
                    </span>
                  ))}
                </div>
                <Button
                  variante="secundario"
                  className="mt-2"
                  onClick={() => {
                    for (const p of secao.padroes) salvarTipoOperacional(secao.categoria, p)
                    setAviso('✅ Padrões copiados para a lista — agora dá para editar e remover.')
                  }}
                >
                  ➕ Começar com esses
                </Button>
              </div>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {itens.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5"
                    >
                      <span className="font-semibold text-slate-800">{t.nome}</span>
                      <button
                        onClick={() => {
                          if (confirm(`Remover ${t.nome}? Deixa de aparecer no cadastro.`))
                            removerTipoOperacional(t.id)
                        }}
                        className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-50"
                        title="Remover"
                      >
                        🗑️
                      </button>
                    </li>
                  ))}
                </ul>
                {faltando.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Sugestões do sistema:</span>
                    {faltando.map((p) => (
                      <button
                        key={p}
                        onClick={() => acrescentar(secao.categoria, p)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        ➕ {p}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        )
      })}
    </div>
  )
}
