// CIDADE/OPERAÇÃO: a lista que só o DONO mantém e que o cadastro pergunta em
// dois passos — primeiro a cidade, depois a operação dentro dela. Uma cidade
// pode ter várias operações (Ituiutaba: Mercado Livre e Shopee, por exemplo).
//
// Aqui ficam só as leituras da lista, sem interface e sem banco, para o
// cadastro do motorista (antes do login), o do Dispatcher e a tela do dono
// concordarem sempre.

import { normalizarTexto } from './texto'

export interface ParCidadeOperacao {
  cidade: string
  operacao: string
}

const ordenar = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

/** As cidades da lista, sem repetir, em ordem alfabética. */
export function cidadesDaLista(pares: ParCidadeOperacao[]): string[] {
  const vistas = new Map<string, string>()
  for (const p of pares) {
    const chave = normalizarTexto(p.cidade)
    if (chave && !vistas.has(chave)) vistas.set(chave, p.cidade)
  }
  return [...vistas.values()].sort(ordenar)
}

/** As operações de UMA cidade, em ordem alfabética. */
export function operacoesDaCidade(pares: ParCidadeOperacao[], cidade: string): string[] {
  const alvo = normalizarTexto(cidade)
  if (!alvo) return []
  return pares
    .filter((p) => normalizarTexto(p.cidade) === alvo)
    .map((p) => p.operacao)
    .sort(ordenar)
}

/** O par já existe? (sem acento, sem caixa) */
export function parExiste(pares: ParCidadeOperacao[], cidade: string, operacao: string): boolean {
  const c = normalizarTexto(cidade)
  const o = normalizarTexto(operacao)
  return pares.some((p) => normalizarTexto(p.cidade) === c && normalizarTexto(p.operacao) === o)
}
