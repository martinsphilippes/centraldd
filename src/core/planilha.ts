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

/**
 * Recorte SEM cabeçalho: descobre as colunas pelo formato do conteúdo. É o
 * caso da foto tirada de perto, em que o cabeçalho ficou fora do quadro.
 */
function mapearPeloConteudo(linhas: string[][]): Map<number, (typeof COLUNAS)[number]> | null {
  const total = linhas.length
  if (total < 2) return null
  const quantas = Math.max(...linhas.map((l) => l.length))
  const mapa = new Map<number, (typeof COLUNAS)[number]>()
  for (let i = 0; i < quantas; i++) {
    const valores = linhas.map((l) => l[i] ?? '').filter(Boolean)
    if (valores.length < total * 0.6) continue
    if (valores.filter((v) => CARA_DE_ORIGINAL.test(v)).length >= valores.length * 0.7)
      mapa.set(i, 'rotaOriginal')
    else if (valores.filter((v) => CARA_DE_ROTA.test(v)).length >= valores.length * 0.7)
      mapa.set(i, 'rotaExpedicao')
  }
  return mapa.size > 0 && [...mapa.values()].includes('rotaExpedicao') ? mapa : null
}

export function parsearPlanilhaRotas(
  texto: string,
  /** Prefixos de rota que a operação já usou — vindos das importações anteriores. */
  prefixosConhecidos: string[] = [],
): { rotas: RotaImportada[]; ignoradas: number; avisos: string[] } {
  const conhecidos = new Set(prefixosConhecidos.map((p) => p.toUpperCase()))
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
  if (!mapa) mapa = mapearPeloConteudo(grade)

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
        ignoradas++
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
      ignoradas++
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
  conferirColuna(finais)
  // Código repetido = uma das linhas teve o código mal lido e a máquina não
  // tem como saber qual. Avisar é honesto; escolher no chute, não.
  const vezes = new Map<string, number>()
  for (const r of finais) vezes.set(r.rotaExpedicao, (vezes.get(r.rotaExpedicao) ?? 0) + 1)
  const avisos = [...vezes.entries()]
    .filter(([, n]) => n > 1)
    .map(([codigo, n]) => `${codigo} apareceu ${n}× — confira essas linhas, o código pode ter sido lido errado`)

  // Número fora de escala dentro do mesmo prefixo (VJ1…VJ13 e de repente um
  // VJ114): quase sempre é dígito duplicado pela foto. Avisa, não adivinha.
  const porPrefixo = new Map<string, number[]>()
  for (const r of finais) {
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
  return { rotas: finais, ignoradas, avisos }
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

  // 2. Bloco corrido da rota original.
  const numeroDe = (r: RotaImportada) => Number(/_(\d{1,3})$/.exec(r.rotaOriginal)?.[1] ?? NaN)
  const numeros = rotas.map(numeroDe).filter((n) => !Number.isNaN(n))
  if (numeros.length < 4) return
  const presentes = new Set(numeros)
  // O "bloco" é a faixa onde a coluna é densa — assim um número solto e
  // legítimo lá longe (AM1_6) não deforma a régua.
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
  const faltando = new Set<number>()
  for (let n = inicio; n <= fim; n++) if (!presentes.has(n)) faltando.add(n)
  if (faltando.size === 0) return

  for (const r of rotas) {
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
