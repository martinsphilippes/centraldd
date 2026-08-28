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
  const chave = normalizarTexto(limpo)
  return veiculosOficiais(db).find((v) => normalizarTexto(v) === chave) ?? limpo
}

/**
 * Opções do seletor: a lista oficial mais o valor que o cadastro já tem, sem
 * repetir variação. Quem estiver com 'Utilitario' vê uma única "Utilitário".
 */
export function opcoesDeVeiculo(db: DB, atual?: string): string[] {
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const v of [...veiculosOficiais(db), (atual ?? '').trim()]) {
    const chave = normalizarTexto(v)
    if (!chave || vistos.has(chave)) continue
    vistos.add(chave)
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
