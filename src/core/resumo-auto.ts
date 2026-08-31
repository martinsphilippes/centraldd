// De onde sai o bloco AM do Resumo do Dia, sem ninguém digitar.
//
// Duas planilhas podem alimentar o card, e elas NÃO são equivalentes:
//
//  - A planilha de ROTAS traz, na mesma linha, o veículo E a transportadora.
//    É a fonte direta: dá para agrupar sem cruzar nada.
//  - A programação do Meli traz o veículo, mas não a transportadora. Para
//    agrupar, é preciso cruzar rota por rota com a planilha de Rotas — e o
//    que não casar cai em "Sem transportadora".
//
// Por isso as rotas mandam quando existem. Antes, o automático só ligava com
// a programação importada; quem subia só a planilha de rotas via o card vazio
// e tinha que digitar o que o arquivo já dizia.
//
// O que o AM NÃO tem como preencher, porque não está na planilha de rotas:
// pacotes, SPR de referência e o bloco MM (os veículos grandes da
// transferência). Esses continuam vindo do modelo ou da mão do Dispatcher.

import type { DB } from './types'

export interface LinhaAM {
  nome: string
  utilitarios: string
  vuc: string
}

export interface AmDoDia {
  /** null = nenhuma planilha do dia; o card fica manual. */
  fonte: 'rotas' | 'programacao' | null
  linhas: LinhaAM[]
  /** Veículos que não são Utilitário nem VUC, com a contagem de cada um. */
  outros: [string, number][]
  utilitarios: number
  vuc: number
  /**
   * Total do AM: utilitários + VUC. NÃO conta o que caiu em `outros` — um 3/4
   * na planilha é veículo de transferência, e somá-lo aqui inflaria o total de
   * rotas em relação às linhas que o próprio card mostra.
   */
  total: number
  /** Base lida da planilha (a mais frequente), vazia quando não veio. */
  base: string
}

const VAZIO: AmDoDia = {
  fonte: null,
  linhas: [],
  outros: [],
  utilitarios: 0,
  vuc: 0,
  total: 0,
  base: '',
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

/** Utilitário, VUC ou outro? É a única classificação que o AM precisa. */
function classificar(veiculo: string): 'utilitario' | 'vuc' | 'outro' {
  const v = normalizar(veiculo)
  if (v.includes('UTIL')) return 'utilitario'
  if (v.includes('VUC')) return 'vuc'
  return 'outro'
}

/** Código-base da rota (antes do sufixo _AM1/_PM1) para cruzar as planilhas. */
function chaveRota(s: string): string {
  return (s || '').trim().toUpperCase().split(/[_\s/]+/)[0]
}

const SEM_TRANSPORTADORA = 'Sem transportadora'

/** Ordena por tamanho do grupo, com "Sem transportadora" sempre por último. */
function ordenar(grupos: Map<string, { util: number; vuc: number }>): [string, { util: number; vuc: number }][] {
  return [...grupos.entries()].sort((a, b) => {
    if (a[0] === SEM_TRANSPORTADORA) return 1
    if (b[0] === SEM_TRANSPORTADORA) return -1
    return b[1].util + b[1].vuc - (a[1].util + a[1].vuc)
  })
}

function paraLinhas(grupos: Map<string, { util: number; vuc: number }>): LinhaAM[] {
  return ordenar(grupos).map(([nome, g]) => ({
    nome,
    utilitarios: String(g.util),
    // VUC zerado fica em branco: a coluna só aparece quando o dia tem VUC.
    vuc: g.vuc ? String(g.vuc) : '',
  }))
}

/** O valor que mais se repete — usado para escolher a base do dia. */
function maisComum(valores: string[]): string {
  const contagem = new Map<string, number>()
  for (const v of valores) {
    const limpo = v.trim()
    if (limpo) contagem.set(limpo, (contagem.get(limpo) ?? 0) + 1)
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

/** AM montado a partir da planilha de ROTAS: veículo e transportadora na mesma linha. */
function pelasRotas(db: DB, data: string): AmDoDia {
  const rotas = db.rotas.filter((r) => r.data === data)
  if (rotas.length === 0) return VAZIO
  const grupos = new Map<string, { util: number; vuc: number }>()
  const outros = new Map<string, number>()
  let utilitarios = 0
  let vuc = 0
  for (const rota of rotas) {
    const classe = classificar(rota.veiculo)
    if (classe === 'outro') {
      const nome = rota.veiculo.trim() || 'Outros'
      outros.set(nome, (outros.get(nome) ?? 0) + 1)
      continue
    }
    const nome = rota.transportadora.trim() || SEM_TRANSPORTADORA
    const g = grupos.get(nome) ?? { util: 0, vuc: 0 }
    if (classe === 'utilitario') {
      g.util++
      utilitarios++
    } else {
      g.vuc++
      vuc++
    }
    grupos.set(nome, g)
  }
  return {
    fonte: 'rotas',
    linhas: paraLinhas(grupos),
    outros: [...outros.entries()],
    utilitarios,
    vuc,
    total: utilitarios + vuc,
    base: maisComum(rotas.map((r) => r.base)),
  }
}

/** AM montado a partir da programação do Meli, cruzando com as rotas pela transportadora. */
function pelaProgramacao(db: DB, data: string): AmDoDia {
  const prog = db.programacao.filter((p) => p.data === data)
  if (prog.length === 0) return VAZIO
  const rotas = db.rotas.filter((r) => r.data === data)
  const transpDe = new Map<string, string>()
  for (const r of rotas) {
    const t = r.transportadora.trim()
    if (!t) continue
    for (const k of [chaveRota(r.rotaExpedicao), chaveRota(r.rotaOriginal)]) {
      if (k && !transpDe.has(k)) transpDe.set(k, t)
    }
  }
  const grupos = new Map<string, { util: number; vuc: number }>()
  const outros = new Map<string, number>()
  let utilitarios = 0
  let vuc = 0
  for (const p of prog) {
    const classe = classificar(p.veiculo)
    if (classe === 'outro') {
      const nome = p.veiculo.trim() || 'Outros'
      outros.set(nome, (outros.get(nome) ?? 0) + 1)
      continue
    }
    const nome = transpDe.get(chaveRota(p.rota)) || SEM_TRANSPORTADORA
    const g = grupos.get(nome) ?? { util: 0, vuc: 0 }
    if (classe === 'utilitario') {
      g.util++
      utilitarios++
    } else {
      g.vuc++
      vuc++
    }
    grupos.set(nome, g)
  }
  return {
    fonte: 'programacao',
    linhas: paraLinhas(grupos),
    outros: [...outros.entries()],
    utilitarios,
    vuc,
    total: utilitarios + vuc,
    base: maisComum(rotas.map((r) => r.base)),
  }
}

/**
 * O bloco AM do dia, da melhor fonte disponível: a planilha de rotas quando
 * existe, senão a programação do Meli, senão nada (card manual).
 */
export function amDoDia(db: DB, data: string): AmDoDia {
  const rotas = pelasRotas(db, data)
  if (rotas.fonte) return rotas
  return pelaProgramacao(db, data)
}
