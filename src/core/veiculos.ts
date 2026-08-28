// Um veículo, um nome só.
//
// "Utilitário", "Utilitario" e "UTILITARIO" são o mesmo veículo, mas gravados
// diferente viravam itens distintos nas listas e opções repetidas no seletor do
// cadastro. A lista oficial é a de 🏷️ Opções de cadastro (Tipos); qualquer
// variação de acento ou caixa é trazida para a grafia oficial ANTES de salvar,
// então a bagunça não volta pelo uso normal do app.

import type { DB } from './types'
import { VEICULOS } from './constants'
import { normalizarTexto } from './texto'

/** A lista oficial: o que o Dispatcher cadastrou em Tipos, ou o padrão do app. */
export function veiculosOficiais(db: DB): string[] {
  const doSistema = db.tipos.filter((t) => t.categoria === 'veiculo').map((t) => t.nome)
  const lista = doSistema.length > 0 ? doSistema : [...VEICULOS]
  return lista.sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/**
 * Traz o valor para a grafia oficial. Se o veículo não estiver na lista da
 * operação (ex.: '3/4' antes de alguém cadastrar o tipo), devolve como veio —
 * limpo, mas sem inventar nem descartar a informação do motorista.
 */
export function nomeOficialVeiculo(valor: string | undefined | null, db: DB): string {
  const limpo = (valor ?? '').trim()
  if (!limpo) return ''
  return veiculosOficiais(db).find((v) => mesmoVeiculo(v, limpo)) ?? limpo
}

/**
 * Dois nomes falam do mesmo veículo?
 *
 * Além de acento e caixa, o plural conta: a planilha do Meli escreve
 * "Utilitários" e o cadastro tem "Utilitário". Sem isto, o seletor mostrava as
 * duas — e cada rota casava com metade da frota.
 */
export function mesmoVeiculo(a: string, b: string): boolean {
  const x = normalizarTexto(a)
  const y = normalizarTexto(b)
  if (!x || !y) return false
  if (x === y) return true
  // Plural: "utilitarios" = "utilitario"; "vans" = "van".
  if (x === `${y}s` || y === `${x}s` || x === `${y}es` || y === `${x}es`) return true
  // Um contido no outro só vale com nome longo — "van" dentro de "vanguarda"
  // não é o mesmo veículo.
  const menor = x.length <= y.length ? x : y
  const maior = x.length <= y.length ? y : x
  return menor.length >= 5 && maior.includes(menor)
}

/**
 * Opções do seletor: a lista oficial mais o valor que o cadastro já tem, sem
 * repetir variação. Quem estiver com 'Utilitario' vê uma única "Utilitário".
 */
export function opcoesDeVeiculo(db: DB, atual?: string): string[] {
  const saida: string[] = []
  for (const v of [...veiculosOficiais(db), (atual ?? '').trim()]) {
    if (!v.trim() || saida.some((j) => mesmoVeiculo(j, v))) continue
    saida.push(v)
  }
  return saida
}

/** Junta uma lista qualquer de veículos numa só grafia por veículo. */
export function unificarVeiculos(valores: (string | undefined)[], db: DB): string[] {
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const v of valores) {
    const oficial = nomeOficialVeiculo(v, db)
    const chave = normalizarTexto(oficial)
    if (!chave || vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(oficial)
  }
  return saida.sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
