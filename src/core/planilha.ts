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
  /** TOTAL ROTAS lido do modelo — usado para conferir/completar o AM. */
  totalRotas?: string
  /** Total de posições lido no rodapé do MM. */
  posicoesTotal?: string
  transportadoras: { nome: string; utilitarios: string; vuc: string }[]
  mm: { tipo: string; quantidade: string; posicoesPorUnidade: string }[]
  camposDetectados: number
}

/** Nome canônico dos veículos MM pelo número de posições (OCR erra o nome, não o xN). */
const MM_POR_POSICOES: Record<string, string> = { '8': '3/4', '12': 'TOCO', '16': 'TRUCK', '28': 'CARRETA' }

/**
 * Lê o MODELO do resumo do dia (o card EMG13 com pacotes, SPR, AM e MM) a
 * partir de texto colado, CSV, PDF ou foto. Reconhece pelos rótulos, então
 * a ordem das linhas não importa e linhas extras são ignoradas.
 */
/**
 * Conserta número em que o OCR trocou dígito por letra parecida ("5C" → 50,
 * "1O" → 10). Só age em texto curto de célula numérica que já tem algum
 * dígito — nunca transforma palavra em número.
 */
export function repararNumero(bruto: string): string {
  const s = bruto.trim()
  if (!/\d/.test(s)) return s
  if (!/^[0-9OoQDIilLZzSsBbGgCcTtАЕ.,]{1,6}$/.test(s)) return s
  const trocas: Record<string, string> = {
    O: '0', o: '0', Q: '0', D: '0', C: '0', c: '0',
    I: '1', i: '1', l: '1', L: '1',
    Z: '2', z: '2', S: '5', s: '5', B: '8', b: '6', G: '6', g: '9', T: '7', t: '7',
  }
  const convertido = s.replace(/[^\d.,]/g, (ch) => trocas[ch] ?? '')
  return /^\d/.test(convertido) ? convertido : s
}

export function parsearModeloResumo(texto: string): ModeloResumo {
  const r: ModeloResumo = { transportadoras: [], mm: [], camposDetectados: 0 }
  const IGNORAR = /^(PACOTES|VE.?CULOS|SPR|TOTAL|POSI|MM$|AM\b|TRANSPORTADORA|UTILIT|VUC|DATA)/i
  let dentroAM = false

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue
    const celulas = linha.split(/\t+|;/).map((c) => c.trim()).filter(Boolean)
    const primeira = celulas[0] ?? ''
    // Célula numérica com ruído de OCR ("5C") vira número antes de entrar.
    const numeros = celulas
      .slice(1)
      .map((c) => repararNumero(c))
      .filter((c) => /^[\d.,]+$/.test(c))

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
    // SPR de referência (o rótulo sai torto no OCR: SPR, SER, 5PR…)
    if ((/SPR/i.test(linha) || /REFER[EÊ]NCIA/i.test(linha)) && !r.sprReferencia) {
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
    // Normaliza ruído comum de OCR: "xi2posições" → "x12", "xsposições" → "x8".
    const linhaMM = linha.replace(/x[il](\d)/gi, 'x1$1').replace(/x[sb$]\s*(?=posi)/gi, 'x8 ')
    const mPos = linhaMM.match(/x\s*(\d+)\s*posi/i)
    if (mPos) {
      const quantidade = numeros.find((n) => n !== mPos[1]) ?? ''
      // O nome lido vale quando é legível; o mapa por posições só entra como
      // socorro (cada base tem seu layout — há modelos com x6 e x10).
      const nomeLegivel = !/^x\s*\d/i.test(primeira) && (primeira.length >= 3 || primeira === '3/4')
      const tipo = nomeLegivel ? primeira : (MM_POR_POSICOES[mPos[1]] ?? 'MM')
      // Não duplica entre passadas de OCR: completa a quantidade se faltava.
      const existente = r.mm.find((m) => m.posicoesPorUnidade === mPos[1])
      if (existente) {
        if (!existente.quantidade && quantidade) existente.quantidade = quantidade
      } else {
        r.mm.push({ tipo, quantidade, posicoesPorUnidade: mPos[1] })
        r.camposDetectados++
      }
      continue
    }
    // Rodapé do MM: "Posições  72" (total, editável no card).
    if (/^POSI/i.test(primeira) && !r.posicoesTotal && numeros[0]) {
      r.posicoesTotal = numeros[0]
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
      if (!r.totalRotas && numeros[0]) {
        r.totalRotas = numeros[0]
        r.camposDetectados++
      }
      continue
    }
    // Linhas de transportadora: "RODACOOP  50  4" / "ME EXTRA  1"
    if (dentroAM && !IGNORAR.test(primeira) && /[A-ZÀ-Ú]{3,}/.test(primeira) && numeros.length >= 1) {
      const nomeNorm = primeira.toUpperCase()
      const existente = r.transportadoras.find((t) => t.nome.toUpperCase() === nomeNorm)
      if (existente) {
        if (!existente.utilitarios && numeros[0]) existente.utilitarios = numeros[0]
        if (!existente.vuc && numeros[1]) existente.vuc = numeros[1]
      } else {
        r.transportadoras.push({ nome: primeira, utilitarios: numeros[0] ?? '', vuc: numeros[1] ?? '' })
        r.camposDetectados++
      }
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

  // Foto/OCR: às vezes o código da rota vem quebrado em duas células
  // ("D11 AM1" → "D11" | "AM1"), empurrando base, veículo e km uma coluna
  // para a direita. O sinal é a base curta (EMG13) na casa do veículo.
  const SUFIXO_ROTA = /^[A-Z]{0,3}[MW][I1L]{0,2}\d{0,2}$/i
  const BASE_CURTA = /^[A-Z]{2,5}\d{1,3}$/

  for (const linha of linhas) {
    const sep = detectarSeparador(linha)
    const celulas = linha.split(sep).map(limpar)
    // Cabeçalho: primeira célula "Cidade" (ou similar) → pula.
    if (/^cidade$/i.test(celulas[0] ?? '')) continue
    if (
      celulas.length >= COLUNAS.length &&
      SUFIXO_ROTA.test(celulas[2] ?? '') &&
      BASE_CURTA.test((celulas[4] ?? '').trim()) &&
      !BASE_CURTA.test((celulas[3] ?? '').trim())
    ) {
      celulas.splice(1, 2, `${celulas[1]} ${celulas[2]}`)
    }
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
  // A mesma rota lida duas vezes (passadas de OCR, fotos com sobreposição)
  // vira UMA linha: a leitura extra só preenche as células que faltavam.
  const porChave = new Map<string, RotaImportada>()
  const ordem: string[] = []
  for (const rota of rotas) {
    const chave = rota.rotaExpedicao.toUpperCase().replace(/\s+/g, ' ').trim()
    const existente = porChave.get(chave)
    if (existente) {
      for (const c of COLUNAS) if (!existente[c] && rota[c]) existente[c] = rota[c]
    } else {
      porChave.set(chave, rota)
      ordem.push(chave)
    }
  }
  const finais = ordem.map((c) => porChave.get(c)!)
  // Ruído de OCR no nome da transportadora ("RodaCuop") converge para a
  // grafia mais comum entre as linhas parecidas da própria leitura.
  const chaveTransp = (s: string) => s.toUpperCase().replace(/[^A-ZÀ-Ú]/g, '').slice(0, 4)
  const grafias = new Map<string, Map<string, number>>()
  for (const r of finais) {
    const t = r.transportadora.trim()
    if (!t) continue
    const g = grafias.get(chaveTransp(t)) ?? new Map<string, number>()
    g.set(t, (g.get(t) ?? 0) + 1)
    grafias.set(chaveTransp(t), g)
  }
  for (const r of finais) {
    const t = r.transportadora.trim()
    if (!t) continue
    const g = grafias.get(chaveTransp(t))!
    r.transportadora = [...g.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  return { rotas: finais, ignoradas }
}
