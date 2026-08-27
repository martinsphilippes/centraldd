// Tela do DISPATCHER: as cidades que a operação atende.
// É essa lista que aparece para o motorista qualificar (Prefiro/Posso/Nunca) —
// ele não inventa cidade, só opina sobre as que existem aqui.

import { useState } from 'react'
import { removerCidadeOperacao, salvarCidadeOperacao, useDB } from '../../core/db'
import { cidadesDoTexto } from '../../core/planilha'
import { normalizarTexto } from '../../core/texto'
import { Badge, Button, Card, EmptyState, Input } from '../../components/ui'

const chave = normalizarTexto

export function CidadesOperacao() {
  const db = useDB()
  const [nova, setNova] = useState('')
  const [aviso, setAviso] = useState('')

  const cidades = [...db.cidades].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const cadastradas = new Set(cidades.map((c) => chave(c.nome)))

  // Cidades que aparecem nas rotas/programação e ainda não estão na lista.
  const detectadas = [
    ...db.rotas.flatMap((r) => cidadesDoTexto(r.cidade)),
    ...db.programacao.flatMap((p) => cidadesDoTexto(p.cidade)),
  ]
    .map((c) => c.trim())
    .filter(Boolean)
  const sugestoes = [...new Map(detectadas.map((c) => [chave(c), c])).values()]
    .filter((c) => !cadastradas.has(chave(c)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const acrescentar = (nome: string) => {
    const limpo = nome.trim()
    if (!limpo) return
    if (cadastradas.has(chave(limpo))) {
      setAviso(`⚠️ ${limpo} já está na lista.`)
      return
    }
    salvarCidadeOperacao(limpo)
    setAviso(`✅ ${limpo} entrou na lista — já aparece para os motoristas qualificarem.`)
  }

  /** Quantos motoristas preferem ou fazem a cidade. */
  const contarMarcacoes = (nome: string) => {
    let preferem = 0
    let podem = 0
    for (const m of db.motoristas) {
      const lista = (t?: string) => (t ?? '').split(/[,;\n]/).map((c) => chave(c))
      if (lista(m.cidadesPreferidas).includes(chave(nome))) preferem++
      if (lista(m.cidadesPossiveis).includes(chave(nome))) podem++
    }
    return { preferem, podem }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">📍 Cidades da operação</h1>
        <p className="text-sm text-slate-500">
          A lista que os motoristas qualificam como <strong>Prefiro / Posso / Não tenho
          preferência</strong> na tela
          deles. Só o que estiver aqui aparece para eles.
        </p>
      </div>

      {aviso && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {aviso}
        </p>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Nome da cidade…"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                acrescentar(nova)
                setNova('')
              }
            }}
            className="min-w-52 flex-1"
          />
          <Button
            variante="ml"
            onClick={() => {
              acrescentar(nova)
              setNova('')
            }}
            disabled={!nova.trim()}
          >
            ➕ Adicionar cidade
          </Button>
        </div>

        {sugestoes.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-semibold text-amber-800">
              🔎 {sugestoes.length} cidade(s) aparecem nas rotas/programação e ainda não estão na lista:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sugestoes.map((c) => (
                <button
                  key={c}
                  onClick={() => acrescentar(c)}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                >
                  ➕ {c}
                </button>
              ))}
            </div>
            <Button
              variante="secundario"
              className="mt-2"
              onClick={() => {
                for (const c of sugestoes) salvarCidadeOperacao(c)
                setAviso(`✅ ${sugestoes.length} cidade(s) acrescentadas de uma vez.`)
              }}
            >
              ➕ Adicionar todas
            </Button>
          </div>
        )}
      </Card>

      {cidades.length === 0 ? (
        <EmptyState
          icone="📍"
          titulo="Nenhuma cidade cadastrada"
          descricao="Acrescente as cidades que a operação atende — elas aparecem na tela dos motoristas para eles marcarem onde preferem entregar."
        />
      ) : (
        <Card className="p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            {cidades.length} cidade(s) na operação
          </p>
          <ul className="space-y-2">
            {cidades.map((c) => {
              const { preferem, podem } = contarMarcacoes(c.nome)
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5"
                >
                  <span className="font-semibold text-slate-800">{c.nome}</span>
                  <div className="flex items-center gap-2">
                    {preferem > 0 && (
                      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
                        ⭐ {preferem} preferem
                      </Badge>
                    )}
                    {podem > 0 && (
                      <Badge className="border-blue-200 bg-blue-100 text-blue-700">👍 {podem} fazem</Badge>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Remover ${c.nome} da lista? Ela deixa de aparecer para os motoristas.`))
                          removerCidadeOperacao(c.id)
                      }}
                      className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-50"
                      title="Remover cidade"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
