// Conferência de pacotes: o Dispatcher sobe a lista do que DEVE sair, o
// motorista sobe a lista do que ele realmente tem, e o sistema compara.
//
// Os dois documentos ainda não têm formato fixo, então a leitura é genérica:
// aceita colagem do Excel (TAB), CSV (; ou ,) ou uma numeração por linha, e
// escolhe sozinha a coluna que mais parece conter códigos — com a opção de o
// usuário trocar a coluna na tela, se a escolha automática errar.

/** Uma coluna candidata a conter as numerações. */
export interface ColunaLida {
  indice: number
  titulo: string
  /** Quantos valores distintos com cara de código a coluna tem. */
  codigos: number
  exemplos: string[]
}

export interface LeituraNumeracoes {
  colunas: ColunaLida[]
  /** Índice da coluna usada (escolhida automaticamente ou informada). */
  colunaUsada: number
  /** Numerações na ordem em que apareceram, sem repetição. */
  valores: string[]
  /** Quantas linhas repetidas foram descartadas. */
  repetidas: number
}

/**
 * O app de leitura de código de barras exporta o conteúdo lido na coluna
 * `text`. Num QR do Meli isso vem como JSON — {"id":"47837917383","t":"lm"} —
 * e num Code 128 vem o número cru. Aqui o JSON vira só a numeração; o resto
 * passa direto.
 */
export function decodificarPayload(bruto: string): string {
  const v = bruto.trim()
  if (!v.startsWith('{')) return v
  try {
    const obj = JSON.parse(v) as Record<string, unknown>
    const id = obj.id ?? obj.ID ?? obj.codigo ?? obj.code
    if (typeof id === 'string' || typeof id === 'number') return String(id).trim()
  } catch {
    // JSON truncado pela leitura: ainda dá para pescar o id no texto.
    const m = /"id"\s*:\s*"?([A-Za-z0-9._\-/]+)"?/i.exec(v)
    if (m) return m[1]
  }
  return v
}

/** Cabeçalhos que anunciam a coluna da numeração, em qualquer planilha. */
const TITULOS_CODIGO = [
  'text', 'texto', 'codigo', 'code', 'pacote', 'id', 'numeracao', 'numero',
  'shipment', 'remessa', 'etiqueta', 'barcode',
]

/** Cara de código de pacote: começa com letra ou dígito e tem 3+ caracteres. */
const CODIGO = /^[A-Za-z0-9][A-Za-z0-9._\-/]{2,}$/

/** Datas e horas soltas não são numeração de pacote. */
const DATA_OU_HORA = /^\d{1,4}([/-]\d{1,4}){1,2}$|^\d{1,2}:\d{2}/

/**
 * Chave de comparação: maiúsculas e só letras e dígitos. Assim "ML-123",
 * "ml 123" e "ML123" são o mesmo pacote — o que muda entre um sistema e
 * outro é a pontuação, não o código.
 */
export function chaveNumeracao(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
}

/** Divide uma linha respeitando aspas ("A, B" continua uma célula só). */
function celulas(linha: string, sep: string): string[] {
  const saida: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else aspas = !aspas
    } else if (c === sep && !aspas) {
      saida.push(atual)
      atual = ''
    } else atual += c
  }
  saida.push(atual)
  return saida.map((c) => c.trim())
}

/** Título da coluna sem acento, pontuação nem caixa. */
function chaveTitulo(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
}

function ehCodigo(v: string): boolean {
  return CODIGO.test(v) && !DATA_OU_HORA.test(v)
}

/**
 * Lê as numerações de um texto. `colunaForcada` sobrepõe a escolha automática
 * (é o que o seletor da tela manda quando o usuário corrige a coluna).
 */
export function extrairNumeracoes(texto: string, colunaForcada?: number): LeituraNumeracoes {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim())
  if (linhas.length === 0) return { colunas: [], colunaUsada: 0, valores: [], repetidas: 0 }

  const sep = linhas[0].includes('\t') ? '\t' : linhas[0].includes(';') ? ';' : ','
  // Decodifica na leitura: daí em diante toda a lógica trabalha com a
  // numeração final, não com o payload cru do leitor.
  const grade = linhas.map((l) => celulas(l, sep).map(decodificarPayload))
  const largura = Math.max(...grade.map((l) => l.length))

  // Cabeçalho: rótulo de coluna não tem número ("Pacote", "Nº do pacote"),
  // enquanto a linha de dados tem. Exigir o dígito embaixo evita decapitar
  // uma planilha sem cabeçalho cujos códigos sejam só letras.
  const primeira = grade[0]
  const temDigito = (c: string) => /\d/.test(c)
  const temCabecalho = grade.length > 1 && !primeira.some(temDigito) && grade[1].some(temDigito)
  const corpo = temCabecalho ? grade.slice(1) : grade

  const colunas: ColunaLida[] = []
  for (let i = 0; i < largura; i++) {
    const vistos = new Set<string>()
    const exemplos: string[] = []
    for (const linha of corpo) {
      const v = (linha[i] ?? '').trim()
      if (!ehCodigo(v)) continue
      const k = chaveNumeracao(v)
      if (!k || vistos.has(k)) continue
      vistos.add(k)
      if (exemplos.length < 3) exemplos.push(v)
    }
    colunas.push({
      indice: i,
      titulo: (temCabecalho ? primeira[i] : '') || `Coluna ${i + 1}`,
      codigos: vistos.size,
      exemplos,
    })
  }

  // Escolha automática: um cabeçalho conhecido ('text', 'código', 'pacote'…)
  // manda; sem ele, vale a coluna com mais códigos distintos.
  const porTitulo = temCabecalho
    ? colunas.find((c) => c.codigos > 0 && TITULOS_CODIGO.includes(chaveTitulo(c.titulo)))
    : undefined
  const melhor = porTitulo ?? colunas.reduce((a, b) => (b.codigos > a.codigos ? b : a), colunas[0])
  const usada =
    colunaForcada !== undefined && colunaForcada >= 0 && colunaForcada < largura
      ? colunaForcada
      : melhor.indice

  const vistos = new Set<string>()
  const valores: string[] = []
  let repetidas = 0
  for (const linha of corpo) {
    const v = (linha[usada] ?? '').trim()
    if (!ehCodigo(v)) continue
    const k = chaveNumeracao(v)
    if (vistos.has(k)) {
      repetidas++
      continue
    }
    vistos.add(k)
    valores.push(v)
  }
  return { colunas, colunaUsada: usada, valores, repetidas }
}

export interface ResultadoConferencia {
  /** true = tudo que o Dispatcher esperava apareceu na lista do motorista. */
  bateu: boolean
  /** Estava na lista do Dispatcher e NÃO apareceu na do motorista. */
  faltando: string[]
  /** Apareceu na lista do motorista e não estava na do Dispatcher. */
  sobrando: string[]
  /** Quantos bateram dos dois lados. */
  conferidos: number
  total: number
}

/** Compara as duas listas ignorando pontuação, maiúscula e acento. */
export function compararConferencia(esperados: string[], enviados: string[]): ResultadoConferencia {
  const mapaEnviados = new Map(enviados.map((v) => [chaveNumeracao(v), v]))
  const mapaEsperados = new Map(esperados.map((v) => [chaveNumeracao(v), v]))
  const faltando = esperados.filter((v) => !mapaEnviados.has(chaveNumeracao(v)))
  const sobrando = enviados.filter((v) => !mapaEsperados.has(chaveNumeracao(v)))
  return {
    bateu: faltando.length === 0 && sobrando.length === 0,
    faltando,
    sobrando,
    conferidos: esperados.length - faltando.length,
    total: esperados.length,
  }
}
