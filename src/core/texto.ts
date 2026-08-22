// Comparação de nomes na operação (cidades, sobretudo).
// A planilha, o cadastro e o motorista escrevem do jeito deles: "Gurinhatã",
// "GURINHATA", "cachoeira d." — tudo isso tem que casar.

/** Sem acento, em maiúsculas, sem pontuação e sem espaço sobrando. */
export function normalizarTexto(valor: string): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira os acentos
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // pontuação vira espaço ("D." → "D")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Tamanho mínimo do prefixo para aceitar abreviação sem confundir cidades. */
const MINIMO_PREFIXO = 5

/**
 * Mesma cidade? Ignora acento, caixa e pontuação; aceita abreviação por
 * prefixo ("CACHOEIRA D" = "CACHOEIRA DOURADA"), mas não casa nomes que só
 * compartilham o fim ("SANTA VITORIA" ≠ "VITORIA").
 */
export function mesmaCidade(a: string, b: string): boolean {
  const x = normalizarTexto(a)
  const y = normalizarTexto(b)
  if (!x || !y) return false
  if (x === y) return true
  const menor = x.length <= y.length ? x : y
  const maior = x.length <= y.length ? y : x
  return menor.length >= MINIMO_PREFIXO && maior.startsWith(menor)
}

/** Alguma das cidades da rota bate com alguma da lista do motorista? */
export function algumaCidadeBate(cidadesRota: string[], listaDoMotorista: string[]): boolean {
  return cidadesRota.some((c) => listaDoMotorista.some((f) => mesmaCidade(c, f)))
}
