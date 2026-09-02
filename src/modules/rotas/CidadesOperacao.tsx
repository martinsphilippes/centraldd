// Tela de cidades — dois conceitos que NÃO se misturam:
//
//  1. OPERAÇÃO/CIDADE: a base em que motoristas e dispatchers operam. É o
//     que o cadastro pergunta (no lugar de "onde você mora"). Só o DONO
//     acrescenta e remove; os demais dispatchers só veem.
//  2. CIDADES ATENDIDAS: para onde as rotas vão. É a lista que o motorista
//     qualifica como Prefiro/Posso e que alimenta a alocação. Qualquer
//     dispatcher mantém, e a planilha de rotas sugere o que falta.

import { useState } from 'react'
import {
  removerCidadeOperacao,
  removerOperacaoCidade,
  salvarCidadeOperacao,
  salvarOperacaoCidade,
  useDB,
} from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { EMAILS_DISPATCHER } from '../../core/firebase-config'
import { cidadesDoTexto } from '../../core/planilha'
import { normalizarTexto } from '../../core/texto'
import { CampoCidade } from '../../components/CampoCidade'
import { Badge, Button, Card, EmptyState, Input } from '../../components/ui'

const chave = normalizarTexto

export function CidadesOperacao() {
  const db = useDB()
  const { usuarioEmail } = useSessao()
  const souDono = EMAILS_DISPATCHER.includes((usuarioEmail ?? '').toLowerCase())
  const [nova, setNova] = useState('')
  const [aviso, setAviso] = useState('')

  // ---------- Operação/Cidade (só o dono) ----------
  const [novaOperacao, setNovaOperacao] = useState('')
  const [novaOperacaoValida, setNovaOperacaoValida] = useState(false)
  const [avisoOperacao, setAvisoOperacao] = useState('')
  const operacoes = [...db.operacoesCidade].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  /** Quantas contas (motoristas e pedidos de dispatcher) operam nesta base. */
  const contarContas = (nome: string) => db.motoristas.filter((m) => chave(m.cidade) === chave(nome)).length

  const acrescentarOperacao = async () => {
    const limpo = novaOperacao.trim()
    if (!limpo) return
    if (!novaOperacaoValida) {
      setAvisoOperacao('⚠️ Escolha a cidade na lista que aparece enquanto você digita.')
      return
    }
    if (operacoes.some((o) => chave(o.nome) === chave(limpo))) {
      setAvisoOperacao(`⚠️ ${limpo} já está na lista.`)
      return
    }
    try {
      await salvarOperacaoCidade(limpo)
      setNovaOperacao('')
      setNovaOperacaoValida(false)
      setAvisoOperacao(`✅ ${limpo} entrou como Operação/Cidade — já aparece no cadastro.`)
    } catch {
      setAvisoOperacao('❌ Não consegui gravar. Só o dono da operação pode mexer nesta lista.')
    }
  }

  const removerOperacao = async (id: string, nome: string) => {
    const contas = contarContas(nome)
    const alerta =
      contas > 0
        ? `Remover ${nome}? ${contas} cadastro(s) apontam para esta operação e continuam apontando — só a opção some do cadastro novo.`
        : `Remover ${nome} da lista de Operação/Cidade?`
    if (!confirm(alerta)) return
    try {
      await removerOperacaoCidade(id)
    } catch {
      setAvisoOperacao('❌ Não consegui remover. Só o dono da operação pode mexer nesta lista.')
    }
  }

  // ---------- Cidades atendidas (qualquer dispatcher) ----------
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
        <h1 className="text-xl font-bold text-slate-900">📍 Cidades</h1>
        <p className="text-sm text-slate-500">
          <strong>Operação/Cidade</strong> é a base em que cada pessoa opera (pergunta do cadastro).{' '}
          <strong>Cidades atendidas</strong> são para onde as rotas vão — a lista que os motoristas
          qualificam como Prefiro / Posso.
        </p>
      </div>

      {/* ---------- Operação/Cidade ---------- */}
      <Card className="border-marca p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">🏢 Operação/Cidade</h2>
          <Badge className={souDono ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-200 bg-slate-100 text-slate-600'}>
            {souDono ? '👑 Só você edita' : '🔒 Só o dono edita'}
          </Badge>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          É o que o motorista e o dispatcher escolhem no cadastro: em qual operação vão atuar. Sem
          nenhum item aqui, ninguém consegue se cadastrar.
        </p>

        {souDono && (
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-52 flex-1">
              <CampoCidade
                valor={novaOperacao}
                onChange={(c, valida) => {
                  setNovaOperacao(c)
                  setNovaOperacaoValida(valida)
                  setAvisoOperacao('')
                }}
              />
            </div>
            <Button variante="marca" onClick={() => void acrescentarOperacao()} disabled={!novaOperacao.trim()}>
              ➕ Adicionar Operação/Cidade
            </Button>
          </div>
        )}
        {avisoOperacao && (
          <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            {avisoOperacao}
          </p>
        )}

        {operacoes.length === 0 ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Nenhuma Operação/Cidade cadastrada. O cadastro de motoristas e dispatchers fica
            travado até a primeira entrar.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {operacoes.map((o) => {
              const contas = contarContas(o.nome)
              return (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5"
                >
                  <span className="font-semibold text-slate-800">🏢 {o.nome}</span>
                  <div className="flex items-center gap-2">
                    {contas > 0 && (
                      <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                        👥 {contas} cadastro(s)
                      </Badge>
                    )}
                    {souDono && (
                      <button
                        onClick={() => void removerOperacao(o.id, o.nome)}
                        className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-50"
                        title="Remover Operação/Cidade"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* ---------- Cidades atendidas ---------- */}
      <div>
        <h2 className="font-bold text-slate-900">📍 Cidades atendidas</h2>
        <p className="text-sm text-slate-500">
          Para onde as rotas vão. Só o que estiver aqui aparece para os motoristas marcarem{' '}
          <strong>Prefiro / Posso / Não tenho preferência</strong>.
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
            variante="marca"
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
          titulo="Nenhuma cidade atendida cadastrada"
          descricao="Acrescente as cidades para onde as rotas vão — elas aparecem na tela dos motoristas para eles marcarem onde preferem entregar. Importar a planilha de rotas sugere as que faltam."
        />
      ) : (
        <Card className="p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            {cidades.length} cidade(s) atendida(s)
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
                      <Badge className="border-orange-200 bg-orange-100 text-orange-800">👍 {podem} fazem</Badge>
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
