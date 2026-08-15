// Leitura das planilhas da operação: aceita texto colado do Excel/Sheets
// (separado por TAB) ou arquivo CSV (; ou ,). Preserva os valores como estão.

import type { ProgramacaoItem, Rota } from './types'

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
export type ProgramacaoImportada = Omit<
  ProgramacaoItem,
  'id' | 'driverFinal' | 'motoristaId' | 'atualizadaEm'
>

/** "13/08/2026" → "2026-08-13" (null se não for data). */
function dataParaISO(celula: string): string | null {
  const m = celula.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/**
 * Converte a planilha diária do Meli em itens de programação. Ordem esperada:
 * DATA | DRIVER | ROTA | CIDADE | VEÍCULO | ONDAS | DOCA
 * Linhas de seção (UTILITARIO, DUPLAS, cabeçalho) são ignoradas automaticamente
 * — só entram linhas que começam com uma data válida.
 */
export function parsearPlanilhaMeli(texto: string): {
  itens: ProgramacaoImportada[]
  ignoradas: number
} {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const itens: ProgramacaoImportada[] = []
  let ignoradas = 0

  for (const linha of linhas) {
    const sep = detectarSeparador(linha)
    const celulas = linha.split(sep).map(limpar)
    const data = dataParaISO(celulas[0] ?? '')
    if (!data) {
      // Cabeçalho ou linha de seção (UTILITARIO / DUPLAS) — ignora sem contar erro.
      if (!/^data$/i.test(celulas[0] ?? '') && celulas.filter(Boolean).length > 2) ignoradas++
      continue
    }
    const [, driver, rota, cidade, veiculo, onda, doca] = celulas
    if (!driver || !rota) {
      ignoradas++
      continue
    }
    itens.push({
      data,
      driverPlanejado: driver,
      rota,
      cidade: cidade ?? '',
      veiculo: veiculo ?? '',
      onda: onda ?? '',
      doca: doca ?? '',
    })
  }
  return { itens, ignoradas }
}

/**
 * Extrai as cidades de um texto de rota ("CACHOEIRA D./CAPINOPOLIS + AJUDA" →
 * ["CACHOEIRA D.", "CAPINOPOLIS"]). Marcas de ajuda e referências de rota
 * (+ VD7 etc.) não contam como cidade.
 */
export function cidadesDoTexto(cidade: string): string[] {
  return cidade
    .split(/[/+]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 1)
    .filter((c) => !/^ajuda$/i.test(c))
    .filter((c) => !/^(vd|vl|vg|g|d)\d+$/i.test(c.replace(/\s/g, '')))
}

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
