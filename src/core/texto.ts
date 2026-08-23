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

/** Distância de edição simples (Levenshtein) entre dois textos curtos. */
function distancia(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0]
    linha[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = linha[j]
      linha[j] = Math.min(
        linha[j] + 1,
        linha[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      anterior = temp
    }
  }
  return linha[b.length]
}

/**
 * Mesmo nome apesar do ruído do OCR ("ORODAÇEEP" ≈ "RODACOOP")? Compara sem
 * acento/pontuação e tolera até ~30% de letras trocadas.
 */
export function parecidoCom(a: string, b: string): boolean {
  const x = normalizarTexto(a).replace(/\s/g, '')
  const y = normalizarTexto(b).replace(/\s/g, '')
  if (!x || !y) return false
  if (x === y) return true
  if (x.length >= 4 && (x.startsWith(y) || y.startsWith(x))) return true
  const limite = Math.floor(Math.max(x.length, y.length) * 0.3)
  return limite >= 1 && distancia(x, y) <= limite
}
