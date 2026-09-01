// Ondas de carregamento e docas.
//
// A operação carrega em ONDAS porque só existem 10 docas. Cada onda leva 10
// rotas de entrega, e a doca é o lugar físico onde o veículo encosta.
//
// As regras da casa, na ordem em que mandam:
//
//  1. VUC vai na PRIMEIRA onda, sempre. É o veículo maior, sai antes.
//  2. Fora os VUCs, cada onda leva 10 rotas.
//  3. Quem tem mais KM entra primeiro — a rota longa precisa sair cedo para
//     caber no dia.
//  4. A doca é compartilhada: cabe 1 VUC E 1 utilitário na mesma doca. Por
//     isso as duas listas numeram as docas a partir de 1, em paralelo. Com 3
//     VUCs e 10 utilitários na onda 1, as docas 1, 2 e 3 recebem dois veículos
//     cada, e as docas 4 a 10 recebem só o utilitário.

import type { Rota } from './types'

/** Docas físicas do galpão. */
export const DOCAS = 10
/** Rotas de entrega por onda (fora os VUCs, que vão todos na primeira). */
export const ROTAS_POR_ONDA = 10

export interface PostoDeCarga {
  onda: number
  doca: number
}

/**
 * Km da rota como número. A planilha escreve em português — '150,046' são
 * 150 quilômetros e pouco, não cento e cinquenta mil. Quando houver separador
 * de milhar ('1.150,046'), o ponto sai antes da vírgula virar decimal.
 */
export function kmDaRota(bruto: string): number {
  const n = Number(
    String(bruto ?? '')
      .trim()
      .replace(/\./g, '')
      .replace(',', '.'),
  )
  return Number.isFinite(n) ? n : 0
}

function ehVuc(veiculo: string): boolean {
  return String(veiculo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .includes('VUC')
}

/** Mais KM primeiro; empate desempata pelo código, para a ordem não dançar. */
function porDistancia(a: Rota, b: Rota): number {
  const d = kmDaRota(b.km) - kmDaRota(a.km)
  if (d !== 0) return d
  return (a.rotaExpedicao || a.id).localeCompare(b.rotaExpedicao || b.id)
}

/** Distribui uma lista em ondas de `porOnda`, numerando as docas a partir de 1. */
function distribuir(rotas: Rota[], porOnda: number, saida: Map<string, PostoDeCarga>) {
  rotas.forEach((r, i) => {
    saida.set(r.id, { onda: Math.floor(i / porOnda) + 1, doca: (i % porOnda) + 1 })
  })
}

/**
 * A onda e a doca de cada rota do dia.
 *
 * VUC e utilitário são distribuídos SEPARADAMENTE, e é isso que faz a doca ser
 * dividida entre os dois: o primeiro VUC e o primeiro utilitário caem os dois
 * na doca 1.
 *
 * Se algum dia houver mais de 10 VUCs, eles passam para a onda seguinte pelo
 * mesmo caminho — não é possível colocar todos na primeira quando não há doca
 * para tanto, e a regra "VUC na primeira onda" já terá dado o que podia.
 */
export function ondasEDocas(rotas: Rota[]): Map<string, PostoDeCarga> {
  const saida = new Map<string, PostoDeCarga>()
  const vucs = rotas.filter((r) => ehVuc(r.veiculo)).sort(porDistancia)
  const demais = rotas.filter((r) => !ehVuc(r.veiculo)).sort(porDistancia)
  distribuir(vucs, DOCAS, saida)
  distribuir(demais, ROTAS_POR_ONDA, saida)
  return saida
}

/** Quantas ondas o dia tem. */
export function totalDeOndas(postos: Map<string, PostoDeCarga>): number {
  let maior = 0
  for (const p of postos.values()) if (p.onda > maior) maior = p.onda
  return maior
}
