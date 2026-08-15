// Leitura da planilha de rotas: aceita texto colado do Excel/Sheets (separado
// por TAB) ou arquivo CSV (; ou ,). Preserva os valores exatamente como estão.

import type { Rota } from './types'

export type RotaImportada = Omit<Rota, 'id' | 'motoristaId' | 'atualizadaEm'>

const COLUNAS = [
  'cidade',
  'rotaExpedicao',
  'rotaOriginal',
  'base',
  'veiculo',
  'km',
  'dps',
  'ocupacao',
  'transportadora',
] as const

function detectarSeparador(linha: string): string {
  if (linha.includes('\t')) return '\t'
  if ((linha.match(/;/g)?.length ?? 0) >= (linha.match(/,/g)?.length ?? 0)) return ';'
  return ','
}

function limpar(celula: string): string {
  let s = celula.trim()
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).replace(/""/g, '"')
  return s.trim()
}

/**
 * Converte o texto da planilha em rotas. Ordem esperada das colunas:
 * Cidade | Rota expedição | Rota original | Base | Veículo | Km | DPS | Ocupação % | Transportadora
 * A linha de cabeçalho (se colada junto) é ignorada automaticamente.
 */
export function parsearPlanilhaRotas(texto: string): { rotas: RotaImportada[]; ignoradas: number } {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const rotas: RotaImportada[] = []
  let ignoradas = 0

  for (const linha of linhas) {
    const sep = detectarSeparador(linha)
    const celulas = linha.split(sep).map(limpar)
    // Cabeçalho: primeira célula "Cidade" (ou similar) → pula.
    if (/^cidade$/i.test(celulas[0] ?? '')) continue
    // Precisa de pelo menos cidade + rota expedição.
    if (celulas.length < 2 || !celulas[0] || !celulas[1]) {
      ignoradas++
      continue
    }
    const rota = {} as Record<(typeof COLUNAS)[number], string>
    COLUNAS.forEach((c, i) => {
      rota[c] = celulas[i] ?? ''
    })
    rotas.push(rota)
  }
  return { rotas, ignoradas }
}
