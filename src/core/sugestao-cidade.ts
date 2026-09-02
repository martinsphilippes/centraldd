// Sugestão de município para o campo de cidade do cadastro.
//
// Ordem de prioridade do que aparece na lista:
//   1. cidades DA OPERAÇÃO (as que o Dispatcher cadastrou em Cidades) — a frota
//      atende poucas cidades, então a do motorista quase sempre está aqui;
//   2. municípios cujo nome COMEÇA com o que foi digitado;
//   3. municípios cujo nome só CONTÉM o que foi digitado.
// Dentro de cada grupo, nome mais curto primeiro: "campin" tem que mostrar
// Campinas antes de "Campina da Lagoa" — em ordem alfabética pura, Campinas
// (1,2 milhão de habitantes) ficava fora das 8 primeiras e o motorista não a
// via nunca.

import type { CidadeBR } from './cidades-brasil'
import { normalizarTexto } from './texto'

/** Quantas sugestões mostrar — o suficiente para achar sem virar rolagem. */
export const MAXIMO_SUGESTOES = 8

export function sugerirCidades(
  digitado: string,
  cidades: CidadeBR[],
  /** Nomes das cidades da operação (qualquer grafia — a comparação normaliza). */
  cidadesOperacao: string[] = [],
  maximo = MAXIMO_SUGESTOES,
): CidadeBR[] {
  const busca = normalizarTexto(digitado)
  if (!busca) return []
  const prioritarias = new Set(cidadesOperacao.map(normalizarTexto))

  const candidatas: { cidade: CidadeBR; grupo: number }[] = []
  for (const cidade of cidades) {
    const nome = normalizarTexto(cidade.nome)
    const comeca = nome.startsWith(busca)
    if (!comeca && !nome.includes(busca)) continue
    const grupo = prioritarias.has(nome) ? 0 : comeca ? 1 : 2
    candidatas.push({ cidade, grupo })
  }
  candidatas.sort(
    (a, b) =>
      a.grupo - b.grupo ||
      a.cidade.nome.length - b.cidade.nome.length ||
      a.cidade.nome.localeCompare(b.cidade.nome, 'pt-BR'),
  )
  return candidatas.slice(0, maximo).map((c) => c.cidade)
}

/**
 * O nome OFICIAL do município que bate com o texto digitado, ou null se não
 * é município nenhum. "guarulhos" e "sao paulo" viram "Guarulhos" e
 * "São Paulo" — é esse nome que tem que ir para o banco, senão a mesma cidade
 * vira duas no relatório só porque uma pessoa digitou em minúsculo.
 */
export function nomeOficialCidade(digitado: string, cidades: CidadeBR[]): string | null {
  const alvo = normalizarTexto(digitado)
  if (!alvo) return null
  return cidades.find((c) => normalizarTexto(c.nome) === alvo)?.nome ?? null
}

/** true se a cidade da operação já é um município da lista (mesma grafia ou não). */
export function ehCidadeDaOperacao(nome: string, cidadesOperacao: string[]): boolean {
  const alvo = normalizarTexto(nome)
  return cidadesOperacao.some((c) => normalizarTexto(c) === alvo)
}
