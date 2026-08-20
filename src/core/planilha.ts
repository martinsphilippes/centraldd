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

export interface ModeloResumo {
  data?: string
  base?: string
  sprReferencia?: string
  pacotes?: string
  veiculosDiv?: string
  transportadoras: { nome: string; utilitarios: string; vuc: string }[]
  mm: { tipo: string; quantidade: string; posicoesPorUnidade: string }[]
  camposDetectados: number
}

/**
 * Lê o MODELO do resumo do dia (o card EMG13 com pacotes, SPR, AM e MM) a
 * partir de texto colado, CSV, PDF ou foto. Reconhece pelos rótulos, então
 * a ordem das linhas não importa e linhas extras são ignoradas.
 */
export function parsearModeloResumo(texto: string): ModeloResumo {
  const r: ModeloResumo = { transportadoras: [], mm: [], camposDetectados: 0 }
  const IGNORAR = /^(PACOTES|VE.?CULOS|SPR|TOTAL|POSI|MM$|AM\b|TRANSPORTADORA|UTILIT|VUC|DATA)/i
  let dentroAM = false

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue
    const celulas = linha.split(/\t+|;/).map((c) => c.trim()).filter(Boolean)
    const primeira = celulas[0] ?? ''
    const numeros = celulas.slice(1).filter((c) => /^[\d.,]+$/.test(c))

    // Data (dd/mm/aaaa em qualquer lugar da linha)
    const mData = linha.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (mData && !r.data) {
      r.data = `${mData[3]}-${mData[2].padStart(2, '0')}-${mData[1].padStart(2, '0')}`
      r.camposDetectados++
    }

    // Base: "EMG13 - ITUIUTABA" (tolerante a ruído de OCR em volta). O modelo
    // costuma repetir a base — quando houver mais de uma leitura, fica a mais
    // curta, que tende a ser a sem ruído (EMG13 em vez de EMGA13).
    const mBase = linha.match(/([A-Za-z]{2,}\d+\s*[-–—]\s*[A-Za-zÀ-ú][A-Za-zÀ-ú\s.]*)/)
    if (mBase && !/SPR|PACOTE|VE.?CULO/i.test(linha)) {
      const candidata = mBase[1].replace(/\s+/g, ' ').trim().toUpperCase()
      if (!r.base) {
        r.base = candidata
        r.camposDetectados++
      } else if (candidata.length < r.base.length) {
        r.base = candidata
      }
      continue
    }
    // SPR de referência
    if (/SPR/i.test(linha) && !r.sprReferencia) {
      const n = linha.match(/([\d.,]+)\s*$/)
      if (n) {
        r.sprReferencia = n[1]
        r.camposDetectados++
      }
      continue
    }
    // Pacotes
    if (/^PACOTES/i.test(primeira) && !r.pacotes && numeros[0]) {
      r.pacotes = numeros[0]
      r.camposDetectados++
      continue
    }
    // Veículos DIV
    if (/VE.?CULOS?\s*DIV/i.test(primeira) && !r.veiculosDiv && numeros[0]) {
      r.veiculosDiv = numeros[0]
      r.camposDetectados++
      continue
    }
    // Seção MM: "TRUCK  1  x16 posições" (quantidade pode faltar).
    // Normaliza ruído comum de OCR: "xi2posições" → "x12posições".
    const linhaMM = linha.replace(/x[il](\d)/gi, 'x1$1')
    const mPos = linhaMM.match(/x\s*(\d+)\s*posi/i)
    if (mPos) {
      const quantidade = numeros.find((n) => n !== mPos[1]) ?? ''
      r.mm.push({ tipo: primeira, quantidade, posicoesPorUnidade: mPos[1] })
      r.camposDetectados++
      continue
    }
    // Cabeçalho da seção AM liga o modo transportadora até o TOTAL.
    if (/TRANSPORTADORA/i.test(linha)) {
      dentroAM = true
      continue
    }
    if (/^TOTAL/i.test(primeira)) {
      dentroAM = false
      continue
    }
    // Linhas de transportadora: "RODACOOP  50  4" / "ME EXTRA  1"
    if (dentroAM && !IGNORAR.test(primeira) && /[A-ZÀ-Ú]{3,}/.test(primeira) && numeros.length >= 1) {
      r.transportadoras.push({ nome: primeira, utilitarios: numeros[0] ?? '', vuc: numeros[1] ?? '' })
      r.camposDetectados++
    }
  }
  return r
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
