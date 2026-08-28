// Leitura das planilhas da operação: aceita texto colado do Excel/Sheets
// (separado por TAB) ou arquivo CSV (; ou ,). Preserva os valores como estão.

import { normalizarTexto, parecidoCom } from './texto'
import type { ProgramacaoItem, Rota } from './types'

export type RotaImportada = Omit<Rota, 'id' | 'data' | 'motoristaId' | 'atualizadaEm'>

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
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
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

/**
 * Conserta o código da rota de expedição lido por OCR.
 *
 * O formato real (foto da planilha e página do Meli) é PREFIXO + número +
 * "_" + período: I15_AM1, VN9_AM1, D13_AM1, G7_AM1, VD2_PM1, B26_PM1. O OCR
 * erra de três jeitos recorrentes:
 *  - a letra I vira o dígito 1 ("I15_AM1" → "115 AM1");
 *  - "AM1"/"PM1" viram "AMI", "AMl", "AM11";
 *  - o "_" some ou vira espaço.
 * Aqui a gramática é remontada; o que não se encaixa nela passa intocado.
 */
export function repararRotaExpedicao(bruto: string): string {
  const t = bruto.toUpperCase().replace(/[_\s]+/g, ' ').trim()
  // separa "corpo" e "período" (o período pode vir colado: "VD2PM1")
  const m = /^(.*?)[ ]?([AP])[M1IL|]{1,3}$/i.exec(t.replace(/[ ]?([AP])M[I1L|]{1,2}$/i, ' $1M1'))
  const m2 = /^(.+?)[ ]([AP]M)[I1L|]{0,2}(\d)?$/.exec(t)
  let corpo = ''
  let periodo = ''
  if (m2) {
    corpo = m2[1].trim()
    periodo = `${m2[2]}${m2[3] ?? '1'}`.replace(/[IL|]/g, '1')
  } else {
    const colado = /^([A-Z]{0,2}\d{1,3})([AP]M)([I1L|\d]?)$/.exec(t.replace(/ /g, ''))
    if (!colado) return bruto.trim()
    corpo = colado[1]
    periodo = `${colado[2]}${colado[3] || '1'}`.replace(/[IL|]/g, '1')
  }
  void m
  // "AMI" sem dígito nenhum → AM1
  if (!/\d$/.test(periodo)) periodo += '1'

  // Corpo: prefixo de letras + número. O OCR também troca dígito por letra
  // parecida ("G8" → "GB", "I4" → "lá") — na parte numérica, letra sósia
  // vira o dígito de volta; acento se perde antes de tudo.
  let limpo = corpo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/ /g, '')
  let pm = /^([A-Z]{0,2})(\d{1,3})$/.exec(limpo)
  if (!pm) {
    const misto = /^([A-Z]{0,2})([0-9OILZABSGT]{1,3})$/.exec(limpo)
    if (!misto) return bruto.trim()
    const SOSIA: Record<string, string> = { O: '0', I: '1', L: '1', Z: '2', A: '4', B: '8', S: '5', G: '9', T: '7' }
    const numeroReparado = misto[2].replace(/[A-Z]/g, (c) => SOSIA[c] ?? c)
    if (!/^\d+$/.test(numeroReparado)) return bruto.trim()
    limpo = `${misto[1]}${numeroReparado}`
    pm = /^([A-Z]{0,2})(\d{1,3})$/.exec(limpo)
    if (!pm) return bruto.trim()
  }
  let prefixo = pm[1]
  let numero = pm[2]
  // "115" → "I15": sem prefixo, o 1 inicial era a letra I.
  if (!prefixo && numero.length >= 2 && numero.startsWith('1')) {
    prefixo = 'I'
    numero = numero.slice(1)
  }
  // "l" minúsculo lido no lugar de "I".
  if (prefixo === 'L') prefixo = 'I'
  if (!prefixo || Number(numero) === 0) return bruto.trim()
  return `${prefixo}${Number(numero)}_${periodo}`
}

/** Letras que o OCR troca entre si. Só as visualmente parecidas mesmo. */
const LETRAS_SOSIA: Record<string, string[]> = {
  I: ['J', 'L', 'T', 'F'],
  J: ['I', 'L'],
  L: ['I', 'J'],
  O: ['D', 'Q', 'C'],
  D: ['O'],
  S: ['G', '5'],
  G: ['S', 'C', '6'],
  B: ['R', 'E', '8'],
  R: ['B', 'P'],
  V: ['U', 'Y'],
  U: ['V'],
  H: ['N', 'M'],
  N: ['H', 'M'],
  M: ['N', 'H'],
  C: ['G', 'O'],
  E: ['B', 'F'],
  F: ['E', 'I'],
  P: ['R'],
  T: ['I'],
}

/**
 * Corrige o PREFIXO da rota usando os códigos que a operação já usou antes.
 *
 * É a única saída para letra trocada: "VJ" e "VI" são idênticos numa foto, e
 * nenhuma regra interna da planilha desempata. Mas se esta base sempre teve
 * VJ e nunca VI, a leitura "VI" é erro — e o histórico sabe disso.
 *
 * Também desfaz o prefixo comprido demais: "DI4" vira "D14" quando "D" é
 * prefixo conhecido e "DI" não é.
 */
export function repararComHistorico(codigo: string, conhecidos: Set<string>): string {
  if (conhecidos.size === 0) return codigo

  // Código que veio SÓ com números ("822_PM1"): a primeira letra virou dígito
  // na foto. Se a sósia dela for um prefixo conhecido, era isso.
  const soNumero = /^(\d)(\d+)[ _]([AP]M[I1L|]?\d?)$/.exec(codigo)
  if (soNumero) {
    const DIGITO_SOSIA: Record<string, string[]> = {
      '8': ['B'], '0': ['O', 'D'], '1': ['I', 'L'], '5': ['S'], '6': ['G'], '2': ['Z'], '4': ['A'], '7': ['T'],
    }
    const candidatos = (DIGITO_SOSIA[soNumero[1]] ?? []).filter((l) => conhecidos.has(l))
    if (candidatos.length === 1) {
      const onda = soNumero[3].replace(/[IL|]/g, '1')
      return `${candidatos[0]}${Number(soNumero[2])}_${/\d$/.test(onda) ? onda : onda + '1'}`
    }
  }

  const m = /^([A-Z]+)(\d+)_([AP]M\d)$/.exec(codigo)
  if (!m) return codigo
  const [, prefixo, numero, onda] = m
  if (conhecidos.has(prefixo)) return codigo

  // 1. A última letra do prefixo era, na verdade, um dígito ("DI4" → "D14").
  const SOSIA_DIGITO: Record<string, string> = { I: '1', L: '1', O: '0', S: '5', B: '8', G: '6', Z: '2', T: '7', A: '4' }
  if (prefixo.length >= 2) {
    const menor = prefixo.slice(0, -1)
    const virouDigito = SOSIA_DIGITO[prefixo[prefixo.length - 1]]
    if (conhecidos.has(menor) && virouDigito) return `${menor}${Number(virouDigito + numero)}_${onda}`
  }

  // 2. Uma letra trocada por outra parecida — só vale se a resposta for única.
  const candidatos = new Set<string>()
  for (let i = 0; i < prefixo.length; i++) {
    for (const letra of LETRAS_SOSIA[prefixo[i]] ?? []) {
      const tentativa = prefixo.slice(0, i) + letra + prefixo.slice(i + 1)
      if (conhecidos.has(tentativa)) candidatos.add(tentativa)
    }
  }
  return candidatos.size === 1 ? `${[...candidatos][0]}${numero}_${onda}` : codigo
}

/** "AM1 89" / "AMI_89" → "AM1_89" (rota original: período + sequência). */
export function repararRotaOriginal(bruto: string): string {
  // A onda (o dígito depois de AM/PM) é DADO, não ruído: existe AM1 e AM2 na
  // mesma planilha. Só as sósias do OCR (I, L, |) viram 1.
  const m = /^([AP])M[ ]?([I1L|]|\d)?[ _]+(\d{1,3})$/i.exec(bruto.trim())
  if (!m) return bruto.trim()
  const onda = /\d/.test(m[2] ?? '') ? m[2] : '1'
  return `${m[1].toUpperCase()}M${onda}_${m[3]}`
}

/** Nomes que cada coluna da planilha de rotas pode ter no cabeçalho. */
const COLUNAS_ROTA: Record<(typeof COLUNAS)[number], string[]> = {
  cidade: ['cidade', 'municipio', 'cidades'],
  rotaExpedicao: ['rota expedicao', 'rota de expedicao', 'expedicao', 'rota exp'],
  rotaOriginal: ['rota original', 'original', 'rota orig'],
  base: ['base', 'cd', 'centro'],
  veiculo: ['veiculo', 'tipo de veiculo', 'tipo veiculo'],
  km: ['km', 'distancia', 'kms'],
  dps: ['dps', 'tempo', 'duracao'],
  ocupacao: ['ocupacao', 'ocupacao %', 'ocupacao(%)', '% ocupacao'],
  transportadora: ['transportadora', 'transp', 'fornecedor'],
}

/**
 * Cabeçalho → de que coluna é cada posição.
 *
 * Sem isto a leitura era por POSIÇÃO fixa, e uma foto de PARTE da planilha
 * (só "Rota expedição" e "Rota original", por exemplo) entrava toda torta: o
 * código da rota caía na casa da cidade. Lendo o cabeçalho, qualquer recorte
 * de colunas — em qualquer ordem — entra no lugar certo.
 */
function mapearCabecalho(celulas: string[]): Map<number, (typeof COLUNAS)[number]> | null {
  const mapa = new Map<number, (typeof COLUNAS)[number]>()
  celulas.forEach((celula, i) => {
    const chave = normalizarTexto(celula)
    if (!chave) return
    for (const coluna of COLUNAS) {
      if (mapa.has(i)) break
      // Comparação frouxa: no OCR o cabeçalho vem mastigado ("Rota expedição"
      // virou "Roraexpedção"), e ele é justamente a linha que NÃO pode virar
      // dado. Basta o cabeçalho conter o nome sem espaços, ou vice-versa.
      const semEspaco = chave.replace(/ /g, '')
      if (
        COLUNAS_ROTA[coluna].some((nome) => {
          const alvo = normalizarTexto(nome).replace(/ /g, '')
          return semEspaco === alvo || (alvo.length >= 8 && parecidoCom(semEspaco, alvo))
        })
      )
        mapa.set(i, coluna)
    }
  })
  // Duas colunas reconhecidas já bastam: é cabeçalho, não linha de dados.
  return mapa.size >= 2 ? mapa : null
}

/**
 * O que a operação já conhece — é o que deixa a foto ser lida sem cabeçalho.
 * Cidades e veículos vêm do cadastro; os prefixos, das rotas já importadas.
 */
export interface ContextoLeitura {
  prefixos?: string[]
  cidades?: string[]
  veiculos?: string[]
}

/** "B15 PM1", "VD10_PM1" — o jeitão de um código de rota de expedição. */
const CARA_DE_ROTA = /^[A-Z]{0,3}[0-9OILZABSGT]{1,3}[ _]?[AP]M[I1L|]{0,2}\d?$/i
/** "PM1_21", "AM1 53" — o jeitão de uma rota original. */
const CARA_DE_ORIGINAL = /^[AP]M[I1L|]{0,2}\d?[ _]+\d{1,3}$/i

/**
 * Recorte de foto: pega o código da rota e a rota original pelo FORMATO deles,
 * onde quer que estejam na linha.
 *
 * Em foto, o OCR não entrega coluna firme — "B19 PMI1 PM1 17" às vezes vem
 * com o 17 numa célula, às vezes colado na anterior. Procurar o padrão na
 * linha inteira acerta nos dois casos; contar casinha, não.
 */
function lerRecorte(linha: string): { rotaExpedicao: string; rotaOriginal: string } | null {
  const t = linha.replace(/[\t;]+/g, ' ').replace(/\s+/g, ' ').trim()
  const original = /\b([AP]M[I1L|]{0,2}\d?)[ _]+(\d{1,3})\b/i.exec(t)
  // O código da rota é "letras + número + onda"; a rota original começa pela
  // onda, então nunca é confundida com ele.
  const codigo = /\b([A-Z]{1,3}[0-9OILZABSGT]{1,3})[ _]?([AP]M[I1L|]{0,2}\d?)\b/i.exec(t)
  if (!codigo) return null
  return {
    rotaExpedicao: `${codigo[1]}_${codigo[2]}`,
    rotaOriginal: original ? `${original[1]}_${original[2]}` : '',
  }
}

const CARA_DE_HORA = /^\d{1,2}:\d{2}$/
const CARA_DE_NUMERO = /^\d{1,3}([.,]\d{1,3})?$/
const CARA_DE_BASE = /^[A-Z]{2,5}\d{1,3}$/i

/**
 * Descobre as colunas pelo CONTEÚDO delas, sem depender do cabeçalho.
 *
 * Numa foto de planilha o cabeçalho é o primeiro a se perder: é texto claro
 * sobre faixa colorida, e o OCR devolve coisas como "Base ado verde". Já o
 * conteúdo se identifica sozinho — "PM1_21" só pode ser rota original, "5:58"
 * só pode ser DPS — e o que é ambíguo (cidade × veículo × transportadora) o
 * app resolve com o que ele já tem cadastrado.
 */
function mapearPeloConteudo(
  linhas: string[][],
  ctx: ContextoLeitura = {},
): Map<number, (typeof COLUNAS)[number]> | null {
  const total = linhas.length
  if (total < 2) return null
  const cidades = new Set((ctx.cidades ?? []).map(normalizarTexto))
  const veiculos = new Set((ctx.veiculos ?? []).map(normalizarTexto))
  const quantas = Math.max(...linhas.map((l) => l.length))
  const mapa = new Map<number, (typeof COLUNAS)[number]>()
  const maioria = (valores: string[], teste: (v: string) => boolean) =>
    valores.filter(teste).length >= valores.length * 0.7

  // Um veículo do cadastro pode aparecer abreviado na foto ("Veículo de
  // Passeio" cortado em "Passeio"), então basta uma das palavras bater.
  const pareceVeiculo = (v: string) => {
    const chave = normalizarTexto(v)
    if (veiculos.has(chave)) return true
    return [...veiculos].some((c) => c.includes(chave) || chave.includes(c))
  }

  const numericas: number[] = []
  for (let i = 0; i < quantas; i++) {
    const valores = linhas.map((l) => l[i] ?? '').filter(Boolean)
    if (valores.length < total * 0.6) continue
    if (maioria(valores, (v) => CARA_DE_ORIGINAL.test(v))) mapa.set(i, 'rotaOriginal')
    else if (maioria(valores, (v) => CARA_DE_ROTA.test(v))) mapa.set(i, 'rotaExpedicao')
    else if (maioria(valores, (v) => CARA_DE_HORA.test(v))) mapa.set(i, 'dps')
    else if (maioria(valores, (v) => pareceVeiculo(v))) mapa.set(i, 'veiculo')
    else if (cidades.size > 0 && maioria(valores, (v) => cidades.has(normalizarTexto(v))))
      mapa.set(i, 'cidade')
    else if (maioria(valores, (v) => CARA_DE_NUMERO.test(v) || /^\d{1,3}[.,]\d{1,3}$/.test(v)))
      numericas.push(i)
    // Base é o mesmo código repetido em todas as linhas (EMG13, EMG13, …).
    else if (maioria(valores, (v) => CARA_DE_BASE.test(v)) && new Set(valores).size <= 3)
      mapa.set(i, 'base')
  }

  // Km e Ocupação são os dois decimais. Na planilha o DPS fica ENTRE eles, e
  // essa vizinhança resolve sem cabeçalho. Se as duas caírem do mesmo lado do
  // DPS (ou não houver DPS na foto), vale a ordem da planilha: Km vem antes.
  const posDps = [...mapa.entries()].find(([, c]) => c === 'dps')?.[0]
  const ordenadas = [...numericas].sort((a, b) => a - b)
  const antes = ordenadas.filter((i) => posDps !== undefined && i < posDps)
  const depois = ordenadas.filter((i) => posDps === undefined || i > posDps)
  if (antes.length === 1 && depois.length === 1) {
    mapa.set(antes[0], 'km')
    mapa.set(depois[0], 'ocupacao')
  } else {
    ordenadas.forEach((i, n) => mapa.set(i, n === 0 ? 'km' : 'ocupacao'))
  }

  return mapa.size > 0 ? mapa : null
}

/**
 * Linha que não se parece com nenhuma das colunas detectadas é sobra da foto
 * (o cabeçalho mastigado, um rodapé) e não pode virar rota.
 */
function pareceLinhaDeDados(
  celulas: string[],
  mapa: Map<number, (typeof COLUNAS)[number]>,
): boolean {
  let fortes = 0
  let batem = 0
  for (const [i, coluna] of mapa) {
    const v = celulas[i] ?? ''
    if (coluna === 'rotaExpedicao') { fortes++; if (CARA_DE_ROTA.test(v)) batem++ }
    else if (coluna === 'rotaOriginal') { fortes++; if (CARA_DE_ORIGINAL.test(v)) batem++ }
    else if (coluna === 'dps') { fortes++; if (CARA_DE_HORA.test(v)) batem++ }
    else if (coluna === 'km' || coluna === 'ocupacao') { fortes++; if (/\d/.test(v)) batem++ }
  }
  return fortes === 0 || batem > 0
}

/** Nomes internos das colunas — o bloco da foto é decidido comparando estes. */
export type ColunaRota = (typeof COLUNAS)[number]

/**
 * Lê UMA foto: que colunas ela traz e quais linhas. É o mesmo caminho que a
 * montagem usa, exposto para a tela poder decidir em que BLOCO a foto entra
 * no momento em que ela chega — e não pela ordem da fila, que muda quando se
 * apaga uma foto do meio.
 */
export function lerFotoDaPlanilha(
  texto: string,
  ctx: ContextoLeitura = {},
): { colunas: ColunaRota[]; linhas: string[][]; mapa: Map<number, ColunaRota> | null } {
  const grade = texto
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => l.split(detectarSeparador(l)).map(limpar))
  if (grade.length === 0) return { colunas: [], linhas: [], mapa: null }

  let mapa: Map<number, ColunaRota> | null = null
  let inicio = 0
  for (let i = 0; i < Math.min(grade.length, 5); i++) {
    const achado = mapearCabecalho(grade[i])
    if (achado) {
      mapa = achado
      inicio = i + 1
      break
    }
  }
  if (!mapa) mapa = mapearPeloConteudo(grade, ctx)
  if (!mapa) return { colunas: [], linhas: grade, mapa: null }
  return {
    colunas: [...new Set([...mapa.values()])],
    linhas: grade.slice(inicio).filter((l) => l.some((c) => c !== '') && pareceLinhaDeDados(l, mapa)),
    mapa,
  }
}

/** O que uma foto trouxe: quais colunas e quantas linhas. */
export interface FotoColuna {
  colunas: string[]
  linhas: number
  /** Sem cabeçalho reconhecido não dá para saber de que coluna a foto é. */
  reconhecida: boolean
  /** Em que bloco de linhas esta foto entrou (1, 2, 3…). */
  bloco: number
}

const ROTULO_COLUNA: Record<(typeof COLUNAS)[number], string> = {
  cidade: 'Cidade',
  rotaExpedicao: 'Rota expedição',
  rotaOriginal: 'Rota original',
  base: 'Base',
  veiculo: 'Veículo',
  km: 'Km',
  dps: 'DPS',
  ocupacao: 'Ocupação %',
  transportadora: 'Transportadora',
}

/**
 * Junta fotos TIRADAS POR COLUNA lado a lado, em vez de empilhar.
 *
 * Fotografar a planilha inteira obriga a afastar, e aí letra e número somem.
 * Fotografando 2 ou 3 colunas de cada vez, cada foto sai grande e o OCR acerta
 * — desde que o app recomponha a tabela. É o que esta função faz: cada foto
 * diz, pelo próprio cabeçalho, de que colunas ela é, e as linhas se encaixam.
 *
 * O encaixe é pela ORDEM das linhas, que é como as fotos foram tiradas. Se
 * duas fotos tiverem uma coluna em comum (a Rota expedição, por exemplo), essa
 * coluna vira a âncora e o encaixe passa a ser conferido, não presumido —
 * por isso vale a pena repetir uma coluna em todas as fotos.
 */
/**
 * Texto colado com UMA CÉLULA POR LINHA.
 *
 * É o que sai quando se copia a planilha de uma tela (o reconhecimento de
 * texto do iPad, um PDF, uma página): as colunas viram uma coluna só,
 * empilhada. Não dá para contar casinha — mas dá para montar a linha em volta
 * do CÓDIGO DA ROTA, que é inconfundível, classificando o resto pelo formato:
 * "PM1_21" só é rota original, "5:58" só é DPS, "EMG13" só é base.
 *
 * Devolve a tabela no formato normal, ou null quando o texto não é vertical.
 */
function verticalParaTabela(texto: string, ctx: ContextoLeitura): string | null {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (linhas.length < 8) return null
  // Texto com separador é tabela de verdade — este caminho não é para ele.
  const comSeparador = linhas.filter((l) => /[\t;]/.test(l) || (l.match(/,/g)?.length ?? 0) >= 3).length
  if (comSeparador > linhas.length * 0.2) return null

  const ancoras = linhas.map((l, i) => (CARA_DE_ROTA.test(l) ? i : -1)).filter((i) => i >= 0)
  if (ancoras.length < 2) return null

  const ROTULOS = new Set(
    ['cidade', 'rota expedicao', 'rota original', 'base', 'veiculo', 'km', 'dps', 'ocupacao', 'ocupacao %', 'transportadora'].map(
      (r) => r.replace(/ /g, ''),
    ),
  )
  const ehRotulo = (l: string) => ROTULOS.has(normalizarTexto(l).replace(/[= %]/g, ''))
  const cidades = new Set((ctx.cidades ?? []).map(normalizarTexto))
  const veiculos = (ctx.veiculos ?? []).filter(Boolean)
  const pareceVeiculo = (v: string) => {
    const chave = normalizarTexto(v)
    return veiculos.some((c) => {
      const k = normalizarTexto(c)
      return k === chave || k.includes(chave) || chave.includes(k)
    })
  }

  const saida: string[][] = []
  ancoras.forEach((posCodigo, k) => {
    const inicio = k === 0 ? 0 : ancoras[k - 1] + 1
    const fim = k === ancoras.length - 1 ? linhas.length : ancoras[k + 1] - 1
    const linha = COLUNAS.map(() => '')
    const por = (c: (typeof COLUNAS)[number], v: string) => {
      if (!linha[COLUNAS.indexOf(c)]) linha[COLUNAS.indexOf(c)] = v
    }
    por('rotaExpedicao', linhas[posCodigo])

    // Antes do código vem a cidade; o rótulo do cabeçalho não conta.
    for (let i = posCodigo - 1; i >= inicio; i--) {
      const l = linhas[i]
      if (ehRotulo(l) || CARA_DE_ROTA.test(l)) continue
      if (cidades.has(normalizarTexto(l)) || /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{2,}$/.test(l)) {
        por('cidade', l)
        break
      }
    }
    // Depois do código, cada valor cai na coluna pelo formato dele.
    const soltos: string[] = []
    for (let i = posCodigo + 1; i < fim; i++) {
      const l = linhas[i]
      if (ehRotulo(l)) continue
      if (CARA_DE_ORIGINAL.test(l)) por('rotaOriginal', l)
      else if (CARA_DE_HORA.test(l)) por('dps', l)
      else if (CARA_DE_BASE.test(l) && !pareceVeiculo(l)) por('base', l)
      else if (pareceVeiculo(l)) por('veiculo', l)
      else if (/^\d{1,3}[.,]\d{1,3}$/.test(l) || /^\d{1,3}$/.test(l)) {
        // Km vem antes da Ocupação na planilha; o primeiro decimal é o Km.
        if (!linha[COLUNAS.indexOf('km')]) por('km', l)
        else por('ocupacao', l)
      } else if (/[A-Za-zÀ-ÿ]/.test(l)) soltos.push(l)
    }
    // Texto que não bateu com nada: na planilha, Veículo vem antes de
    // Transportadora. Um veículo que o cadastro ainda não conhece ("Vuc" lido
    // como "Wile") não pode empurrar a transportadora para fora da linha.
    if (soltos.length > 0) {
      if (!linha[COLUNAS.indexOf('veiculo')] && soltos.length > 1) por('veiculo', soltos[0])
      por('transportadora', soltos[soltos.length - 1])
    }
    saida.push(linha)
  })

  const cabecalho = COLUNAS.map((c) => ROTULO_COLUNA[c]).join('\t')
  return [cabecalho, ...saida.map((l) => l.join('\t'))].join('\n')
}

export function juntarFotosPorColuna(
  /** Cada foto com o bloco de linhas a que ela pertence (1, 2, 3…). */
  entradas: { texto: string; bloco: number }[],
  ctx: ContextoLeitura = {},
): {
  texto: string
  fotos: FotoColuna[]
  avisos: string[]
} {
  const avisos: string[] = []
  const fotos: FotoColuna[] = []
  const soltos: string[][] = []
  type Bloco = { mapa: Map<number, ColunaRota>; linhas: string[][]; foto: number; bloco: number }
  const lidos: Bloco[] = []

  for (const entrada of entradas) {
    const { mapa, linhas: grade } = lerFotoDaPlanilha(entrada.texto, ctx)
    if (grade.length === 0) continue
    if (!mapa) {
      // Sem reconhecer as colunas, ainda dá para pescar o código de rota pelo
      // padrão, linha a linha. O que sai daqui já vem no formato final — nada
      // de texto cru misturado com tabela montada, que era o que embaralhava.
      const pescadas = grade
        .map((l) => lerRecorte(l.join('\t')))
        .filter((r): r is NonNullable<typeof r> => !!r)
      for (const r of pescadas) {
        const linha = COLUNAS.map(() => '')
        linha[COLUNAS.indexOf('rotaExpedicao')] = r.rotaExpedicao
        if (r.rotaOriginal) linha[COLUNAS.indexOf('rotaOriginal')] = r.rotaOriginal
        soltos.push(linha)
      }
      fotos.push({ colunas: [], linhas: pescadas.length, reconhecida: false, bloco: 0 })
      continue
    }
    lidos.push({ mapa, linhas: grade, foto: fotos.length, bloco: entrada.bloco })
    fotos.push({
      colunas: [...new Set([...mapa.values()])].map((c) => ROTULO_COLUNA[c]),
      linhas: grade.length,
      reconhecida: true,
      bloco: entrada.bloco,
    })
  }

  const cabecalho = COLUNAS.map((c) => ROTULO_COLUNA[c]).join('\t')
  if (lidos.length === 0) {
    const corpo = soltos.map((l) => l.join('\t')).join('\n')
    return { texto: corpo ? [cabecalho, corpo].join('\n') : '', fotos, avisos }
  }

  // O BLOCO de cada foto vem decidido de fora, no momento em que ela chega.
  // Inferir pela ordem da fila era frágil: bastava apagar uma foto do meio e
  // reenviá-la para o app casar as colunas de uma leva com as linhas de outra.
  const grupos: Bloco[][] = []
  for (const numero of [...new Set(lidos.map((b) => b.bloco))].sort((a, b) => a - b)) {
    grupos.push(lidos.filter((b) => b.bloco === numero))
  }

  const saida: string[][] = []
  grupos.forEach((blocos, iGrupo) => {
    const rotulo = grupos.length > 1 ? `bloco ${blocos[0]?.bloco ?? iGrupo + 1}: ` : ''

    // Dentro do bloco, todas as fotos precisam ter as MESMAS linhas. Quando
    // uma leu menos, ela é a culpada — e é ela que precisa ser refeita.
    const cheia = Math.max(...blocos.map((b) => b.linhas.length))
    const curtas = blocos.filter((b) => b.linhas.length < cheia)
    for (const b of curtas) {
      avisos.push(
        `${rotulo}a Foto ${b.foto + 1} leu ${b.linhas.length} linha(s) e as outras deste bloco leram ${cheia} — alguma linha ficou de fora dela. Refaça SÓ essa foto (🗑️ ao lado dela), senão as linhas se encaixam trocadas a partir da que faltou.`,
      )
    }

    // Âncora: coluna repetida entre as fotos do bloco serve de conferência.
    const contagem = new Map<(typeof COLUNAS)[number], number>()
    for (const b of blocos)
      for (const c of new Set(b.mapa.values())) contagem.set(c, (contagem.get(c) ?? 0) + 1)
    const ancora = [...contagem.entries()].find(
      ([c, n]) => n > 1 && (c === 'rotaExpedicao' || c === 'rotaOriginal'),
    )?.[0]

    const altura = Math.max(...blocos.map((b) => b.linhas.length))
    for (let i = 0; i < altura; i++) {
      const linha = COLUNAS.map(() => '')
      for (const b of blocos) {
        const celulas = b.linhas[i]
        if (!celulas) continue
        for (const [pos, coluna] of b.mapa) {
          const valor = celulas[pos] ?? ''
          if (valor) linha[COLUNAS.indexOf(coluna)] = valor
        }
        // Numa foto estreita a célula escorrega ("B15 PM1 PM1 21" às vezes vem
        // em duas células, às vezes em quatro). Onde o código de rota não saiu
        // com cara de código, vale o padrão lido na linha inteira.
        const temCodigo = [...b.mapa.values()].some(
          (c) => c === 'rotaExpedicao' || c === 'rotaOriginal',
        )
        if (temCodigo && b.mapa.size <= 3) {
          const achado = lerRecorte(celulas.join('\t'))
          if (achado) {
            const iExp = COLUNAS.indexOf('rotaExpedicao')
            const iOrig = COLUNAS.indexOf('rotaOriginal')
            if (!CARA_DE_ROTA.test(linha[iExp])) linha[iExp] = achado.rotaExpedicao
            if (achado.rotaOriginal && !CARA_DE_ORIGINAL.test(linha[iOrig]))
              linha[iOrig] = achado.rotaOriginal
          }
        }
      }
      saida.push(linha)
    }

    if (ancora) {
      // Com âncora dá para conferir de verdade: se as fotos discordarem na
      // mesma linha, o encaixe escorregou e é melhor o Dispatcher saber.
      let divergiu = 0
      for (let i = 0; i < altura; i++) {
        const vistos = new Set<string>()
        for (const b of blocos) {
          const idx = [...b.mapa.entries()].find(([, c]) => c === ancora)?.[0]
          if (idx === undefined) continue
          const v = normalizarTexto(b.linhas[i]?.[idx] ?? '')
          if (v) vistos.add(v)
        }
        if (vistos.size > 1) divergiu++
      }
      if (divergiu > 0) {
        avisos.push(
          `${rotulo}${divergiu} linha(s) em que as fotos discordam na coluna ${ROTULO_COLUNA[ancora]} — o encaixe pode ter escorregado; confira ou tire as fotos de novo com as mesmas linhas`,
        )
      }
    } else if (blocos.length > 1) {
      avisos.push(
        `${rotulo}as fotos não têm nenhuma coluna em comum, então o encaixe é pela ordem das linhas — para o app poder CONFERIR o encaixe, inclua a coluna "Rota expedição" em todas as fotos`,
      )
    }
  })

  const corpo = [...saida, ...soltos].map((l) => l.join('\t')).join('\n')
  return { texto: [cabecalho, corpo].filter(Boolean).join('\n'), fotos, avisos }
}

export function parsearPlanilhaRotas(
  texto: string,
  /** O que a operação já conhece: prefixos de rota, cidades e veículos. */
  ctx: ContextoLeitura = {},
): {
  rotas: RotaImportada[]
  ignoradas: number
  avisos: string[]
  /**
   * O que foi descartado, o motivo e a linha como ela foi lida — assim o
   * Dispatcher consegue INCLUIR a linha à mão e completar o que faltou, em vez
   * de perder os dados que estavam certos nela.
   */
  descartadas: { conteudo: string; motivo: string; linha: RotaImportada }[]
} {
  const conhecidos = new Set((ctx.prefixos ?? []).map((p) => p.toUpperCase()))
  const descartadas: { conteudo: string; motivo: string; linha: RotaImportada }[] = []
  const vazia = (): RotaImportada => {
    const r = {} as RotaImportada
    for (const c of COLUNAS) r[c] = ''
    return r
  }
  const descartar = (conteudo: string, motivo: string, linha?: RotaImportada) => {
    ignoradas++
    // Só o que tem alguma substância vira relatório; linha em branco não.
    if (conteudo.replace(/[\t;,\s]+/g, ' ').trim().length > 1) {
      descartadas.push({
        conteudo: conteudo.replace(/\t/g, ' · ').trim().slice(0, 120),
        motivo,
        linha: linha ?? vazia(),
      })
    }
  }
  // Sem trim na LINHA: numa linha que começa com coluna vazia ("\tB14…"), o
  // trim comia a tabulação e todas as colunas escorregavam uma casa para a
  // esquerda — a rota original acabava lida como código de expedição.
  // Colagem VERTICAL (uma célula por linha) vira tabela antes de tudo.
  const linhas = (verticalParaTabela(texto, ctx) ?? texto)
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  const rotas: RotaImportada[] = []
  let ignoradas = 0

  // Foto/OCR: às vezes o código da rota vem quebrado em duas células
  // ("D11 AM1" → "D11" | "AM1"), empurrando base, veículo e km uma coluna
  // para a direita. O sinal é a base curta (EMG13) na casa do veículo.
  const SUFIXO_ROTA = /^[A-Z]{0,3}[MW][I1L]{0,2}\d{0,2}$/i
  const BASE_CURTA = /^[A-Z]{2,5}\d{1,3}$/

  // Descobre as colunas ANTES de ler: pelo cabeçalho, se ele veio na foto;
  // senão, pelo formato do conteúdo. Só cai na posição fixa se nada casar.
  const grade = linhas.map((l) => l.split(detectarSeparador(l)).map(limpar))
  let mapa: Map<number, (typeof COLUNAS)[number]> | null = null
  let primeiraLinha = 0
  for (let i = 0; i < Math.min(grade.length, 5); i++) {
    const achado = mapearCabecalho(grade[i])
    if (achado) {
      mapa = achado
      primeiraLinha = i + 1
      break
    }
  }
  if (!mapa) mapa = mapearPeloConteudo(grade, ctx)

  for (const linha of linhas.slice(primeiraLinha)) {
    const sep = detectarSeparador(linha)
    const celulas = linha.split(sep).map(limpar)
    // Cabeçalho: primeira célula "Cidade" (ou similar) → pula.
    if (/^cidade$/i.test(celulas[0] ?? '')) continue
    if (mapa) {
      const rota = {} as Record<(typeof COLUNAS)[number], string>
      for (const c of COLUNAS) rota[c] = ''
      for (const [i, coluna] of mapa) rota[coluna] = celulas[i] ?? ''
      // Recorte estreito (foto de duas ou três colunas): o padrão manda, porque
      // a casinha da célula não é confiável no OCR.
      if (celulas.length <= 4 && mapa.size <= 3) {
        const achado = lerRecorte(linha)
        if (achado) {
          rota.rotaExpedicao = achado.rotaExpedicao
          if (achado.rotaOriginal) rota.rotaOriginal = achado.rotaOriginal
        }
      }
      if (!rota.rotaExpedicao || !/\d/.test(rota.rotaExpedicao)) {
        descartar(
          linha,
          rota.rotaExpedicao
            ? `"${rota.rotaExpedicao}" não tem número, então não é código de rota`
            : 'ficou sem código de rota — nesta linha nenhuma foto trouxe a coluna Rota expedição',
          { ...rota, rotaOriginal: repararRotaOriginal(rota.rotaOriginal) },
        )
        continue
      }
      rota.rotaExpedicao = repararComHistorico(repararRotaExpedicao(rota.rotaExpedicao), conhecidos)
      rota.rotaOriginal = repararRotaOriginal(rota.rotaOriginal)
      rotas.push(rota)
      continue
    }
    if (
      celulas.length >= COLUNAS.length &&
      SUFIXO_ROTA.test(celulas[2] ?? '') &&
      BASE_CURTA.test((celulas[4] ?? '').trim()) &&
      !BASE_CURTA.test((celulas[3] ?? '').trim())
    ) {
      celulas.splice(1, 2, `${celulas[1]} ${celulas[2]}`)
    }
    // Precisa de pelo menos cidade + rota expedição — e um código de rota
    // sempre tem número, então "Rota expedição" lido da foto não vira linha.
    if (celulas.length < 2 || !celulas[0] || !celulas[1] || !/\d/.test(celulas[1])) {
      descartar(linha, 'não reconheci cidade + código de rota nesta linha')
      continue
    }
    const rota = {} as Record<(typeof COLUNAS)[number], string>
    COLUNAS.forEach((c, i) => {
      rota[c] = celulas[i] ?? ''
    })
    rota.rotaExpedicao = repararComHistorico(repararRotaExpedicao(rota.rotaExpedicao), conhecidos)
    rota.rotaOriginal = repararRotaOriginal(rota.rotaOriginal)
    rotas.push(rota)
  }
  // A mesma rota lida duas vezes (passadas de OCR, fotos com sobreposição)
  // vira UMA linha: a leitura extra só preenche as células que faltavam.
  const porChave = new Map<string, RotaImportada>()
  const ordem: string[] = []
  for (const rota of rotas) {
    const chave = `${rota.rotaExpedicao.toUpperCase().replace(/\s+/g, ' ').trim()}|${rota.rotaOriginal}`
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
  // Uma rota ORIGINAL ("PM1_21") nunca é um código de expedição. Se sobrou
  // alguma na coluna errada — encaixe de foto que escorregou, coluna trocada —
  // ela sai aqui, em vez de virar rota inventada no dia.
  const validas = finais.filter((r) => {
    const ehOriginal = CARA_DE_ORIGINAL.test(r.rotaExpedicao.replace(/_/g, ' '))
    if (ehOriginal) {
      descartar(
        `${r.rotaExpedicao} ${r.rotaOriginal}`,
        `"${r.rotaExpedicao}" é uma rota ORIGINAL, não um código de expedição — as colunas escorregaram nesta linha`,
        { ...r, rotaExpedicao: '' },
      )
    }
    return !ehOriginal
  })
  conferirColuna(validas)
  ajustarPorColuna(validas, ctx)
  // Código repetido = uma das linhas teve o código mal lido e a máquina não
  // tem como saber qual. Avisar é honesto; escolher no chute, não.
  const vezes = new Map<string, number>()
  for (const r of validas) vezes.set(r.rotaExpedicao, (vezes.get(r.rotaExpedicao) ?? 0) + 1)
  const avisos = [...vezes.entries()]
    .filter(([, n]) => n > 1)
    .map(([codigo, n]) => `${codigo} apareceu ${n}× — confira essas linhas, o código pode ter sido lido errado`)

  // Cidade que não existe na operação: a leitura torceu o nome ("mulutaDa"),
  // e a preferência de cidade do motorista não vai casar com ela.
  const oficiais = ctx.cidades ?? []
  if (oficiais.length > 0) {
    const estranhas = [
      ...new Set(
        validas
          .map((r) => r.cidade.trim())
          .filter(
            (c) =>
              c &&
              !oficiais.some((o) => normalizarTexto(o) === normalizarTexto(c) || parecidoCom(o, c)),
          ),
      ),
    ]
    if (estranhas.length > 0) {
      avisos.push(
        `${estranhas.join(', ')} — não é cidade da operação. A leitura pode ter torcido o nome; acerte na tela de Rotas, senão a preferência de cidade do motorista não vai casar.`,
      )
    }
  }

  // Mesma ideia para o veículo: "Vuc" lido como "Wile" não casa com motorista
  // nenhum na hora de direcionar.
  const veiculosOperacao = ctx.veiculos ?? []
  if (veiculosOperacao.length > 0) {
    const estranhos = [
      ...new Set(
        validas
          .map((r) => r.veiculo.trim())
          .filter(
            (v) =>
              v &&
              !veiculosOperacao.some((o) => {
                const a = normalizarTexto(o)
                const b = normalizarTexto(v)
                return a === b || a.includes(b) || b.includes(a)
              }),
          ),
      ),
    ]
    if (estranhos.length > 0) {
      avisos.push(
        `${estranhos.join(', ')} — não é veículo cadastrado. Confira na tela de Rotas: veículo torto atrapalha o direcionamento do motorista.`,
      )
    }
  }

  // Número fora de escala dentro do mesmo prefixo (VJ1…VJ13 e de repente um
  // VJ114): quase sempre é dígito duplicado pela foto. Avisa, não adivinha.
  const porPrefixo = new Map<string, number[]>()
  for (const r of validas) {
    const m = /^([A-Z]+)(\d+)_/.exec(r.rotaExpedicao)
    if (m) porPrefixo.set(m[1], [...(porPrefixo.get(m[1]) ?? []), Number(m[2])])
  }
  for (const [prefixo, numeros] of porPrefixo) {
    if (numeros.length < 4) continue
    const ordenados = [...numeros].sort((a, b) => a - b)
    const mediana = ordenados[Math.floor(ordenados.length / 2)]
    for (const n of ordenados) {
      if (mediana > 0 && n > mediana * 3) {
        avisos.push(
          `${prefixo}${n} destoa dos outros ${prefixo} (${ordenados[0]} a ${ordenados[ordenados.length - 2]}) — confira esse número`,
        )
      }
    }
  }
  return { rotas: validas, ignoradas, avisos, descartadas }
}

/**
 * Ajustes que dependem de olhar a coluna inteira e o que a operação conhece:
 * o veículo cortado pela foto volta ao nome completo, e a ocupação que perdeu
 * a vírgula é recomposta (é sempre uma porcentagem, nunca passa de 100).
 */
function ajustarPorColuna(rotas: RotaImportada[], ctx: ContextoLeitura) {
  const veiculos = [...new Set(ctx.veiculos ?? [])].filter(Boolean)
  for (const r of rotas) {
    if (r.veiculo && veiculos.length > 0) {
      const chave = normalizarTexto(r.veiculo)
      // "Passeio" na foto é o "Veículo de Passeio" do cadastro — só completa
      // quando a resposta é única, senão fica como foi lido.
      const iguais = veiculos.filter((v) => normalizarTexto(v) === chave)
      const contidos = veiculos.filter((v) => normalizarTexto(v).includes(chave))
      if (iguais.length === 0 && contidos.length === 1) r.veiculo = contidos[0]
    }
    // Ocupação é % e nunca passa de 100: "431" perdeu a vírgula, é 4,31.
    const oc = r.ocupacao.trim()
    if (oc && !/[.,]/.test(oc) && /^\d{3,}$/.test(oc) && Number(oc) > 100) {
      r.ocupacao = `${oc.slice(0, -2)},${oc.slice(-2)}`
    }
  }
}

/**
 * Conferência pela COERÊNCIA DA PRÓPRIA COLUNA — o que sobra depois do reparo
 * linha a linha. Uma planilha de rotas tem duas regularidades fortes:
 *
 * 1. a onda (_AM1 / _PM1) é a MESMA em todas as linhas — quem discordar da
 *    maioria foi erro de leitura;
 * 2. os números da rota original formam um bloco corrido (ex.: 28 a 61) — um
 *    valor fora do bloco que, trocando um dígito, cai exatamente no número que
 *    está faltando, é esse número.
 *
 * Só corrige quando a resposta é ÚNICA: na dúvida, mantém o que foi lido.
 */
function conferirColuna(rotas: RotaImportada[]) {
  if (rotas.length < 4) return

  // 1. A onda de cada linha vem da rota original DELA — as duas colunas sempre
  // falam da mesma onda, e isso vale por linha. Maioria da planilha não serve
  // aqui: um dia pode ter AM1 e AM2 juntos, e o AM2 seria atropelado.
  const votos = new Map<string, number>()
  for (const r of rotas) {
    const daOriginal = /^([AP]M\d)_/.exec(r.rotaOriginal)?.[1]
    if (daOriginal) {
      r.rotaExpedicao = r.rotaExpedicao.replace(/_[AP]M\d$/, `_${daOriginal}`)
      votos.set(daOriginal, (votos.get(daOriginal) ?? 0) + 1)
    }
  }
  // Só quem ficou sem rota original segue a onda mais comum do lote.
  const vencedora = [...votos.entries()].sort((a, b) => b[1] - a[1])[0]
  if (vencedora && vencedora[1] >= rotas.length * 0.7) {
    for (const r of rotas) {
      if (!r.rotaOriginal) r.rotaExpedicao = r.rotaExpedicao.replace(/_[AP]M\d$/, `_${vencedora[0]}`)
    }
  }

  // 2. Bloco corrido da rota original — POR ONDA. AM1 e PM1 têm numerações
  // independentes; misturá-las fazia a régua de uma "consertar" o número da
  // outra (um AM1_38 legítimo virava AM1_18 para tapar um furo do PM1).
  const porOnda = new Map<string, RotaImportada[]>()
  for (const r of rotas) {
    const onda = /^([AP]M\d)_/.exec(r.rotaOriginal)?.[1]
    if (onda) porOnda.set(onda, [...(porOnda.get(onda) ?? []), r])
  }

  for (const [, doGrupo] of porOnda) {
    const numeroDe = (r: RotaImportada) => Number(/_(\d{1,3})$/.exec(r.rotaOriginal)?.[1] ?? NaN)
    const numeros = doGrupo.map(numeroDe).filter((n) => !Number.isNaN(n))
    if (numeros.length < 6) continue
    const presentes = new Set(numeros)
    // A régua é a MAIOR sequência corrida (aceitando furo de até 2). Assim o
    // próprio número errado não entra na conta e vira "dentro do bloco".
    const ordenados = [...presentes].sort((a, b) => a - b)
    let inicio = ordenados[0]
    let fim = ordenados[0]
    let iniAtual = ordenados[0]
    for (let i = 1; i <= ordenados.length; i++) {
      const quebrou = i === ordenados.length || ordenados[i] - ordenados[i - 1] > 2
      if (quebrou) {
        if (ordenados[i - 1] - iniAtual > fim - inicio) {
          inicio = iniAtual
          fim = ordenados[i - 1]
        }
        if (i < ordenados.length) iniAtual = ordenados[i]
      }
    }
    // Régua curta não é régua: sem um bloco de verdade, não corrige nada.
    if (fim - inicio < 5) continue
    const faltando = new Set<number>()
    for (let n = inicio; n <= fim; n++) if (!presentes.has(n)) faltando.add(n)
    if (faltando.size === 0) continue

    for (const r of doGrupo) {
      const n = numeroDe(r)
      if (Number.isNaN(n) || (n >= inicio && n <= fim)) continue
      const digitos = String(n)
      const candidatos = new Set<number>()
      for (let i = 0; i < digitos.length; i++) {
        for (const d of '0123456789') {
          const trocado = Number(digitos.slice(0, i) + d + digitos.slice(i + 1))
          if (faltando.has(trocado)) candidatos.add(trocado)
        }
      }
      // Uma resposta só, senão deixa como está: chutar seria pior que avisar.
      if (candidatos.size === 1) {
        const certo = [...candidatos][0]
        r.rotaOriginal = r.rotaOriginal.replace(/_\d{1,3}$/, `_${certo}`)
        faltando.delete(certo)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Importação da planilha de MOTORISTAS (cadastro em lote)
// ---------------------------------------------------------------------------

export interface MotoristaImportado {
  nome: string
  telefone: string
  cidade: string
  operacao: string
  veiculo: string
  ativo: boolean
  cidadesPreferidas: string
  email: string
  senha: string
  /** Linha de origem na planilha, para o dispatcher achar o erro. */
  linha: number
}

/** Cabeçalhos aceitos por campo — sem acento, minúsculo, sem pontuação. */
const COLUNAS_MOTORISTA: Record<keyof Omit<MotoristaImportado, 'linha' | 'ativo'>, string[]> = {
  nome: ['nome', 'nome completo', 'motorista', 'entregador'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'telefone whatsapp'],
  cidade: ['cidade', 'municipio', 'cidade base'],
  operacao: ['operacao', 'operacao logistica'],
  veiculo: ['veiculo', 'tipo de veiculo', 'carro'],
  cidadesPreferidas: ['cidades preferidas', 'cidade preferida', 'preferidas', 'prefiro'],
  email: ['email', 'e mail', 'e-mail', 'login'],
  senha: ['senha', 'password', 'senha inicial'],
}
const COLUNAS_ATIVO = ['ativo', 'situacao', 'status']

/** Ordem usada quando a planilha vem SEM cabeçalho. */
const ORDEM_PADRAO: (keyof MotoristaImportado)[] = [
  'nome', 'telefone', 'cidade', 'operacao', 'veiculo', 'email', 'senha',
]

const chaveColuna = (s: string) => normalizarTexto(s).toLowerCase().trim()

/** "Sim"/"Não"/"1"/"0"/"ativo"/"inativo" → boolean. Vazio = ativo. */
function lerAtivo(valor: string): boolean {
  const v = chaveColuna(valor)
  if (!v) return true
  return !['nao', 'n', '0', 'false', 'inativo', 'desativado', 'off'].includes(v)
}

/** Só os dígitos, como o cadastro manual grava. */
function soDigitos(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * Lê a planilha de motoristas colada do Excel (TAB) ou de um CSV (; ou ,).
 * O cabeçalho manda: as colunas podem vir em qualquer ordem e só `nome` é
 * obrigatório. Sem cabeçalho reconhecível, vale a ORDEM_PADRAO.
 */
export function parsearPlanilhaMotoristas(texto: string): {
  motoristas: MotoristaImportado[]
  ignoradas: number
  colunasReconhecidas: string[]
} {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim())
  if (linhas.length === 0) return { motoristas: [], ignoradas: 0, colunasReconhecidas: [] }

  // Separador: TAB (colagem do Excel) tem prioridade; senão ; e por fim ,
  const primeira = linhas[0]
  const sep = primeira.includes('\t') ? '\t' : primeira.includes(';') ? ';' : ','
  /** Divide respeitando aspas: "Silva, Junior" continua sendo uma célula só. */
  const celulas = (l: string) => {
    const saida: string[] = []
    let atual = ''
    let dentroDeAspas = false
    for (let i = 0; i < l.length; i++) {
      const c = l[i]
      if (c === '"') {
        // Aspas dobradas ("") são uma aspa literal dentro do campo.
        if (dentroDeAspas && l[i + 1] === '"') {
          atual += '"'
          i++
        } else dentroDeAspas = !dentroDeAspas
      } else if (c === sep && !dentroDeAspas) {
        saida.push(atual)
        atual = ''
      } else atual += c
    }
    saida.push(atual)
    return saida.map((c) => c.trim())
  }

  // O cabeçalho é reconhecido se pelo menos uma coluna conhecida aparecer.
  const cab = celulas(primeira).map(chaveColuna)
  const mapa = new Map<keyof MotoristaImportado | 'ativo', number>()
  cab.forEach((titulo, i) => {
    for (const [campo, nomes] of Object.entries(COLUNAS_MOTORISTA)) {
      if (nomes.includes(titulo)) mapa.set(campo as keyof MotoristaImportado, i)
    }
    if (COLUNAS_ATIVO.includes(titulo)) mapa.set('ativo', i)
  })
  const temCabecalho = mapa.size > 0
  if (!temCabecalho) ORDEM_PADRAO.forEach((campo, i) => mapa.set(campo, i))

  const colunasReconhecidas = [...mapa.keys()].map(String)
  const corpo = temCabecalho ? linhas.slice(1) : linhas
  const motoristas: MotoristaImportado[] = []
  let ignoradas = 0

  corpo.forEach((linha, i) => {
    const c = celulas(linha)
    const pegar = (campo: keyof MotoristaImportado | 'ativo') => {
      const idx = mapa.get(campo)
      return idx === undefined ? '' : (c[idx] ?? '').trim()
    }
    const nome = pegar('nome')
    // Linha sem nome não vira cadastro (rodapé, total, linha em branco no meio).
    if (!nome || /^(total|nome)$/i.test(nome)) {
      ignoradas++
      return
    }
    motoristas.push({
      nome,
      telefone: soDigitos(pegar('telefone')),
      cidade: pegar('cidade'),
      operacao: pegar('operacao'),
      veiculo: pegar('veiculo'),
      ativo: lerAtivo(pegar('ativo')),
      cidadesPreferidas: pegar('cidadesPreferidas'),
      email: pegar('email').toLowerCase(),
      senha: pegar('senha'),
      linha: (temCabecalho ? 2 : 1) + i,
    })
  })

  return { motoristas, ignoradas, colunasReconhecidas }
}
