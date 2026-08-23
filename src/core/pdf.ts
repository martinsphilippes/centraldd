// Extração de tabelas de PDF em duas etapas:
//  1) PDFs com texto (exportados do Excel): lê o texto direto e reconstrói
//     linhas (posição vertical) e colunas (espaços horizontais).
//  2) PDFs ESCANEADOS (imagem/foto): renderiza as páginas e usa OCR em
//     português (Tesseract) para reconhecer o texto, com a mesma reconstrução.
// pdf.js e o OCR são carregados sob demanda — só pesam quando alguém usa.

interface Item {
  x: number
  y: number
  fim: number
  texto: string
}

/** Distância vertical máxima para considerar dois textos na mesma linha. */
const TOLERANCIA_LINHA = 3
/** Espaço horizontal mínimo para considerar que começou outra coluna. */
const ESPACO_COLUNA = 6
/** Escala de renderização das páginas para o OCR (maior = mais nítido). */
const ESCALA_OCR = 2.5

async function carregarPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  return pdfjs
}

function itensParaLinhas(itens: Item[]): string[] {
  const linhas: { y: number; itens: Item[] }[] = []
  for (const item of itens) {
    const linha = linhas.find((l) => Math.abs(l.y - item.y) <= TOLERANCIA_LINHA)
    if (linha) linha.itens.push(item)
    else linhas.push({ y: item.y, itens: [item] })
  }
  // No PDF o eixo Y cresce para cima → topo da página primeiro.
  linhas.sort((a, b) => b.y - a.y)
  return linhas.map((linha) => {
    linha.itens.sort((a, b) => a.x - b.x)
    let texto = ''
    let fimAnterior: number | null = null
    for (const item of linha.itens) {
      if (fimAnterior !== null) texto += item.x - fimAnterior > ESPACO_COLUNA ? '\t' : ' '
      texto += item.texto
      fimAnterior = item.fim
    }
    return texto
  })
}

/**
 * Converte a saída TSV do Tesseract em texto tabular: as palavras já vêm
 * agrupadas por linha; espaços grandes entre palavras viram separador de coluna.
 */
export function ocrTsvParaTexto(tsv: string): string {
  interface Palavra {
    left: number
    width: number
    height: number
    texto: string
  }
  const grupos = new Map<string, Palavra[]>()
  const ordem: string[] = []
  for (const linha of tsv.split('\n')) {
    const c = linha.split('\t')
    if (c.length < 12 || c[0] !== '5') continue // nível 5 = palavra
    // Remove artefatos das grades da tabela que o OCR lê como texto (| = — etc.).
    const texto = c[11].trim().replace(/^[|]+|[|]+$/g, '')
    if (!texto || /^[|=\\[\]—–_]+$/.test(texto)) continue
    const chave = `${c[1]}-${c[2]}-${c[3]}-${c[4]}` // página-bloco-parágrafo-linha
    if (!grupos.has(chave)) {
      grupos.set(chave, [])
      ordem.push(chave)
    }
    grupos.get(chave)!.push({ left: Number(c[6]), width: Number(c[8]), height: Number(c[9]), texto })
  }
  const linhas: string[] = []
  for (const chave of ordem) {
    const palavras = grupos.get(chave)!.sort((a, b) => a.left - b.left)
    let texto = ''
    let fimAnterior: number | null = null
    for (const p of palavras) {
      if (fimAnterior !== null) {
        const gap = p.left - fimAnterior
        texto += gap > p.height * 0.9 ? '\t' : ' '
      }
      texto += p.texto
      fimAnterior = p.left + p.width
    }
    linhas.push(texto)
  }
  return linhas.join('\n')
}

interface PalavraOcr {
  left: number
  top: number
  width: number
  height: number
  conf: number
  texto: string
}

function tsvParaPalavras(tsv: string): PalavraOcr[] {
  const palavras: PalavraOcr[] = []
  for (const linha of tsv.split('\n')) {
    const c = linha.split('\t')
    if (c.length < 12 || c[0] !== '5') continue
    const texto = c[11].trim().replace(/^[|]+|[|]+$/g, '')
    if (!texto || /^[|=\\[\]—–_]+$/.test(texto)) continue
    palavras.push({ left: +c[6], top: +c[7], width: +c[8], height: +c[9], conf: +c[10], texto })
  }
  return palavras
}

/**
 * Encaixa as palavras das passadas extras na ESTRUTURA DE LINHAS da 1ª: cada
 * extra entra na linha de altura mais próxima; onde há sobreposição, vence a
 * palavra de MAIOR CONFIANÇA (é o "melhor de N" por posição); o que não couber
 * em linha nenhuma vira linha própria.
 */
interface LinhaOcr {
  cy: number
  palavras: PalavraOcr[]
}

function mesclarNaEstrutura(tsv1: string, extras: PalavraOcr[]): LinhaOcr[] {
  type Linha = LinhaOcr
  const linhas: Linha[] = []
  const porChave = new Map<string, Linha>()
  for (const linha of tsv1.split('\n')) {
    const c = linha.split('\t')
    if (c.length < 12 || c[0] !== '5') continue
    const texto = c[11].trim().replace(/^[|]+|[|]+$/g, '')
    if (!texto || /^[|=\\[\]—–_]+$/.test(texto)) continue
    const chave = `${c[1]}-${c[2]}-${c[3]}-${c[4]}`
    let l = porChave.get(chave)
    if (!l) {
      l = { cy: 0, palavras: [] }
      porChave.set(chave, l)
      linhas.push(l)
    }
    l.palavras.push({ left: +c[6], top: +c[7], width: +c[8], height: +c[9], conf: +c[10], texto })
  }
  for (const l of linhas) {
    l.cy = l.palavras.reduce((s, p) => s + p.top + p.height / 2, 0) / l.palavras.length
  }
  for (const p of extras) {
    const cy = p.top + p.height / 2
    let melhor: Linha | null = null
    let distancia = Infinity
    for (const l of linhas) {
      const d = Math.abs(l.cy - cy)
      if (d < distancia) {
        melhor = l
        distancia = d
      }
    }
    if (melhor && distancia < Math.max(p.height, 14) * 0.7) {
      // Mesma posição já lida? Fica a leitura de maior confiança.
      const iguais = melhor.palavras.filter((q) => {
        const x0 = Math.max(q.left, p.left)
        const x1 = Math.min(q.left + q.width, p.left + p.width)
        return x1 - x0 > Math.min(q.width, p.width) * 0.4
      })
      if (iguais.length === 0) {
        melhor.palavras.push(p)
      } else if (iguais.every((q) => p.conf > q.conf + 8)) {
        melhor.palavras = melhor.palavras.filter((q) => !iguais.includes(q))
        melhor.palavras.push(p)
      }
    } else {
      linhas.push({ cy, palavras: [p] })
    }
  }
  return linhas.sort((a, b) => a.cy - b.cy)
}

/** Reconstrói o texto tabular a partir das linhas mescladas. */
function linhasParaTexto(linhas: LinhaOcr[]): string {
  return linhas
    .map((l) => {
      const ps = [...l.palavras].sort((a, b) => a.left - b.left)
      let texto = ''
      let fim: number | null = null
      for (const p of ps) {
        if (fim !== null) texto += p.left - fim > p.height * 0.9 ? '\t' : ' '
        texto += p.texto
        fim = p.left + p.width
      }
      return texto
    })
    .join('\n')
}

/** true quando a linha tem rótulo (palavra com letras) e nenhum número solto. */
function rotuloSemNumero(l: LinhaOcr): boolean {
  const temRotulo = l.palavras.some((p) => /[A-Za-zÀ-ú]{3,}/.test(p.texto))
  const temNumero = l.palavras.some((p) => /^[\d.,:]+$/.test(p.texto) && /\d/.test(p.texto))
  return temRotulo && !temNumero
}

/**
 * Recorta a faixa horizontal de uma linha e devolve um canvas ampliado e com
 * contraste — para reler de perto o valor que ficou ilegível na página toda.
 */
function recortarFaixa(
  canvas: HTMLCanvasElement,
  l: LinhaOcr,
  aPartirDe: number,
): { faixa: HTMLCanvasElement; x0: number; y0: number; zoom: number } | null {
  const topo = Math.min(...l.palavras.map((p) => p.top))
  const base = Math.max(...l.palavras.map((p) => p.top + p.height))
  const altura = base - topo
  const folga = Math.max(4, altura * 0.35)
  const y0 = Math.max(0, Math.round(topo - folga))
  const y1 = Math.min(canvas.height, Math.round(base + folga))
  const x0 = Math.max(0, Math.round(aPartirDe))
  const largura = canvas.width - x0
  if (largura < 10 || y1 - y0 < 6) return null
  // Amplia a faixa: número miúdo vira número grande, que o OCR lê bem.
  const zoom = Math.max(1, Math.min(6, 90 / Math.max(1, altura)))
  const c = document.createElement('canvas')
  c.width = Math.round(largura * zoom)
  c.height = Math.round((y1 - y0) * zoom)
  const cx = c.getContext('2d')
  if (!cx) return null
  cx.imageSmoothingEnabled = true
  cx.imageSmoothingQuality = 'high'
  cx.fillStyle = '#fff'
  cx.fillRect(0, 0, c.width, c.height)
  cx.drawImage(canvas, x0, y0, largura, y1 - y0, 0, 0, c.width, c.height)
  return { faixa: reforcarContraste(c) ?? c, x0, y0, zoom }
}

const ETAPAS_OCR: Record<string, string> = {
  'loading tesseract core': 'carregando o motor',
  'initializing tesseract': 'iniciando o motor',
  'loading language traineddata': 'baixando o pacote de leitura',
  'initializing api': 'preparando a leitura',
  'recognizing text': 'lendo o documento',
}

/**
 * Cria o worker de OCR em português, configurado para ler tabelas.
 * Todos os arquivos do motor são servidos pelo PRÓPRIO app (/ocr/…) —
 * sem depender de servidores externos que podem estar bloqueados.
 */
async function criarWorkerOcr(onProgresso?: (mensagem: string) => void) {
  const { createWorker } = await import('tesseract.js')
  onProgresso?.('🔍 Preparando OCR (1ª vez demora um pouco)…')
  const worker = await createWorker('por', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    gzip: true,
    logger: (m: { status?: string; progress?: number }) => {
      const etapa = ETAPAS_OCR[m.status ?? '']
      if (etapa) onProgresso?.(`🔍 OCR: ${etapa}… ${Math.round((m.progress ?? 0) * 100)}%`)
    },
  })
  // PSM 4 (coluna única, tamanhos variados) lê tabelas muito melhor que o padrão.
  await worker.setParameters({ tessedit_pageseg_mode: '4' as never })
  return worker
}

/** Decodifica uma imagem em canvas, com caminho alternativo para Safari/iOS. */
async function imagemParaCanvas(arquivo: Blob): Promise<HTMLCanvasElement> {
  let largura = 0
  let altura = 0
  let fonte: CanvasImageSource
  try {
    const bitmap = await createImageBitmap(arquivo)
    largura = bitmap.width
    altura = bitmap.height
    fonte = bitmap
  } catch {
    // Safari/iOS às vezes não decodifica via createImageBitmap → usa <img>.
    const url = URL.createObjectURL(arquivo)
    try {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      await img.decode()
      largura = img.naturalWidth
      altura = img.naturalHeight
      fonte = img
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    }
  }
  if (!largura || !altura) throw new Error('imagem vazia ou em formato não suportado pelo aparelho')
  ultimaDimensao = { largura, altura }
  // Normaliza o tamanho para o OCR: fotos gigantes (12MP) são reduzidas
  // (evita travar aparelhos fracos) e prints/fotos pequenas são ampliadas —
  // um card de 350px só fica legível com muita ampliação. Teto de pixels
  // protege a memória do celular.
  const LARGURA_ALVO = 2400
  const MAX_PIXELS = 13_000_000
  let escala = Math.min(6, LARGURA_ALVO / largura)
  if (largura * altura * escala * escala > MAX_PIXELS) {
    escala = Math.sqrt(MAX_PIXELS / (largura * altura))
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(largura * escala)
  canvas.height = Math.round(altura * escala)
  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('canvas indisponível')
  contexto.imageSmoothingEnabled = true
  contexto.imageSmoothingQuality = 'high'
  contexto.drawImage(fonte, 0, 0, canvas.width, canvas.height)
  if ('close' in fonte) (fonte as ImageBitmap).close()
  return canvas
}

/**
 * Fração de pixels com cor saturada ESCURA (selos/pílulas com texto claro,
 * como a coluna de transportadora da planilha). Amostrada para ser barata.
 */
function fracaoTextoInvertido(canvas: HTMLCanvasElement): number {
  const contexto = canvas.getContext('2d')
  if (!contexto) return 0
  const d = contexto.getImageData(0, 0, canvas.width, canvas.height).data
  let coloridos = 0
  let total = 0
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const sat = Math.max(r, g, b) - Math.min(r, g, b)
    const luz = r * 0.299 + g * 0.587 + b * 0.114
    if (sat > 60 && luz < 150) coloridos++
    total++
  }
  return total ? coloridos / total : 0
}

/**
 * Realça texto INVERTIDO (claro sobre fundo colorido escuro): o fundo, a borda
 * e o serrilhado coloridos viram branco e as letras claras de dentro viram
 * pretas — o OCR normal descarta esses selos como se fossem desenho.
 * Devolve um canvas NOVO; o original fica intacto para as outras passadas.
 */
function realcarTextoInvertido(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const origem = canvas.getContext('2d')
  if (!origem) return null
  const W = canvas.width
  const H = canvas.height
  const im = origem.getImageData(0, 0, W, H)
  const d = im.data
  const sat = new Float32Array(W * H)
  const cinza = new Float32Array(W * H)
  for (let i = 0, px = 0; i < d.length; i += 4, px++) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    sat[px] = Math.max(r, g, b) - Math.min(r, g, b)
    cinza[px] = r * 0.299 + g * 0.587 + b * 0.114
  }
  // Imagem integral da saturação → média local rápida (janela 9x9).
  const integ = new Float64Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    let soma = 0
    for (let x = 0; x < W; x++) {
      soma += sat[y * W + x]
      integ[(y + 1) * (W + 1) + (x + 1)] = integ[y * (W + 1) + (x + 1)] + soma
    }
  }
  const R = 4
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(H - 1, y + R)
    for (let x = 0; x < W; x++) {
      const px = y * W + x
      const i = px * 4
      let valor: number
      if (sat[px] > 50) {
        valor = 255 // pixel colorido (fundo/borda do selo) some
      } else {
        const x0 = Math.max(0, x - R), x1 = Math.min(W - 1, x + R)
        const n = (y1 - y0 + 1) * (x1 - x0 + 1)
        const somaLocal =
          integ[(y1 + 1) * (W + 1) + (x1 + 1)] - integ[y0 * (W + 1) + (x1 + 1)] -
          integ[(y1 + 1) * (W + 1) + x0] + integ[y0 * (W + 1) + x0]
        // Sem cor mas cercado de cor = letra dentro do selo → vira preta.
        valor = somaLocal / n > 45 ? (cinza[px] > 160 ? 0 : 255) : cinza[px]
      }
      d[i] = d[i + 1] = d[i + 2] = valor
    }
  }
  const novo = document.createElement('canvas')
  novo.width = W
  novo.height = H
  const destino = novo.getContext('2d')
  if (!destino) return null
  destino.putImageData(im, 0, 0)
  return novo
}

/**
 * Nitidez (unsharp mask leve em tons de cinza): recupera traços de fotos
 * levemente fora de foco ou tremidas, onde o OCR simplesmente não vê o texto.
 * Devolve um canvas NOVO.
 */
function realcarNitidez(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const contexto = canvas.getContext('2d')
  if (!contexto) return null
  const W = canvas.width
  const H = canvas.height
  const origem = contexto.getImageData(0, 0, W, H)
  const d = origem.data
  const cinza = new Float32Array(W * H)
  for (let i = 0, px = 0; i < d.length; i += 4, px++) {
    cinza[px] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
  }
  // Núcleo 3x3: centro reforçado, vizinhos subtraídos (realce de bordas).
  const saida = new Uint8ClampedArray(W * H * 4)
  const FORCA = 1.1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = y * W + x
      let vizinhos = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue
          vizinhos += cinza[yy * W + xx]
          n++
        }
      }
      const media = n ? vizinhos / n : cinza[px]
      const valor = cinza[px] + FORCA * (cinza[px] - media)
      const i = px * 4
      saida[i] = saida[i + 1] = saida[i + 2] = valor < 0 ? 0 : valor > 255 ? 255 : valor
      saida[i + 3] = 255
    }
  }
  const novo = document.createElement('canvas')
  novo.width = W
  novo.height = H
  const destino = novo.getContext('2d')
  if (!destino) return null
  destino.putImageData(new ImageData(saida, W, H), 0, 0)
  return novo
}

/**
 * Reforço de contraste (tons de cinza + esticamento do histograma): recupera
 * números perdidos em fotos de tela de computador (moiré, brilho irregular).
 */
function reforcarContraste(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const original = canvas.getContext('2d')
  if (!original) return null
  const novo = document.createElement('canvas')
  novo.width = canvas.width
  novo.height = canvas.height
  const contexto = novo.getContext('2d')
  if (!contexto) return null
  contexto.drawImage(canvas, 0, 0)
  const imagem = contexto.getImageData(0, 0, canvas.width, canvas.height)
  const d = imagem.data
  const histograma = new Array<number>(256).fill(0)
  for (let i = 0; i < d.length; i += 4) {
    const luz = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0
    d[i] = d[i + 1] = d[i + 2] = luz
    histograma[luz]++
  }
  const total = d.length / 4
  let acumulado = 0
  let p5 = 0
  for (let v = 0; v < 256; v++) {
    acumulado += histograma[v]
    if (acumulado / total >= 0.05) {
      p5 = v
      break
    }
  }
  acumulado = 0
  let p95 = 255
  for (let v = 255; v >= 0; v--) {
    acumulado += histograma[v]
    if (acumulado / total >= 0.05) {
      p95 = v
      break
    }
  }
  const faixa = Math.max(1, p95 - p5)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, (((d[i] - p5) * 255) / faixa) | 0))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  contexto.putImageData(imagem, 0, 0)
  return novo
}

// Cópia reduzida da última imagem lida — vai junto no diagnóstico para dar
// para reproduzir exatamente a leitura que aconteceu no aparelho do usuário.
let ultimaMiniatura = ''
let ultimaDimensao = { largura: 0, altura: 0 }

export function obterUltimaMiniaturaOcr(): string {
  return ultimaMiniatura
}

/** Tamanho ORIGINAL da última imagem lida — serve para avisar foto pequena. */
export function obterUltimaDimensaoOcr(): { largura: number; altura: number } {
  return ultimaDimensao
}

function gerarMiniatura(canvas: HTMLCanvasElement): string {
  try {
    const escala = Math.min(1, 900 / canvas.width)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(canvas.width * escala))
    c.height = Math.max(1, Math.round(canvas.height * escala))
    c.getContext('2d')?.drawImage(canvas, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.6)
  } catch {
    return ''
  }
}

export interface OpcoesLeitura {
  /** true = documento curto e crítico: roda todas as passadas de recuperação. */
  preciso?: boolean
}

/**
 * Lê uma IMAGEM (JPG, PNG, foto de celular, print…) com OCR e devolve o texto
 * tabular. Fotos pequenas são ampliadas antes da leitura para melhorar o acerto.
 * Se a 1ª passada reconhecer poucos números (foto de tela, baixa qualidade),
 * roda uma 2ª passada com contraste reforçado e junta o que cada uma achou.
 */
export async function extrairTextoDeImagem(
  arquivo: Blob,
  onProgresso?: (mensagem: string) => void,
  opcoes?: OpcoesLeitura,
): Promise<string> {
  if (!arquivo.size) {
    throw new Error('arquivo vazio — se a foto está no iCloud, abra-a na galeria antes de enviar')
  }
  onProgresso?.('🖼️ Preparando a imagem…')
  const canvas = await imagemParaCanvas(arquivo)
  ultimaMiniatura = gerarMiniatura(canvas)
  const worker = await criarWorkerOcr(onProgresso)
  try {
    onProgresso?.('🔍 Lendo a imagem com OCR…')
    // Guarda-chuva de tempo: melhor um erro claro do que ficar rodando para sempre.
    const comTempoLimite = <T,>(p: Promise<T>) =>
      Promise.race([
        p,
        new Promise<never>((_, rejeitar) =>
          setTimeout(
            () => rejeitar(new Error('a leitura demorou demais — tente uma foto menor ou mais próxima da tabela')),
            180000,
          ),
        ),
      ])
    const ler = async (alvo: HTMLCanvasElement) =>
      (await comTempoLimite(worker.recognize(alvo, {}, { tsv: true, text: false }))).data.tsv ?? ''

    const tsvBase = await ler(canvas)
    let texto = ocrTsvParaTexto(tsvBase)

    // Quantos números SOLTOS (célula numérica de verdade) a leitura entregou?
    // Dígitos grudados em letra (EMG13) ou em data não provam nada.
    const contarNumeros = (t: string) =>
      t.split(/[\s\t]+/).filter((x) => /^\d+([.,]\d+)?$/.test(x)).length

    // Documento pequeno (card, print, foto de perto) é barato de reler: vale
    // sempre tentar as variantes. Documento grande, só quando a leitura veio
    // fraca — mais passadas custam tempo no celular.
    const pequeno = canvas.width * canvas.height <= 6_000_000
    const leituraFraca = contarNumeros(texto) < 8
    // Leitura MINUCIOSA: documento curto e valioso (o card do resumo) roda
    // todas as passadas, mesmo que a 1ª leitura pareça boa.
    const minucioso = opcoes?.preciso === true || pequeno || leituraFraca

    const extras: PalavraOcr[] = []
    const juntar = (novas: PalavraOcr[], confMinima: number, tamanhoMinimo = 1) => {
      for (const p of novas) {
        if (p.conf > confMinima && p.texto.length >= tamanhoMinimo) extras.push(p)
      }
    }

    if (minucioso) {
      // Nitidez: recupera foto tremida/desfocada, onde o OCR nem vê o texto.
      onProgresso?.('🔍 Refinando a leitura (nitidez)…')
      const nitido = realcarNitidez(canvas)
      if (nitido) juntar(tsvParaPalavras(await ler(nitido)), 40)

      // Contraste: recupera número apagado em foto de tela/luz irregular.
      onProgresso?.('🔍 Refinando a leitura (contraste)…')
      const contrastado = reforcarContraste(canvas)
      if (contrastado) juntar(tsvParaPalavras(await ler(contrastado)), 40)
    }

    if (minucioso) {
      // Varredura ESPARSA só de dígitos: acha número solto em célula que a
      // leitura por blocos ignorou (é o caso clássico do card do resumo).
      onProgresso?.('🔍 Procurando os números soltos…')
      await worker.setParameters({
        tessedit_pageseg_mode: '11' as never,
        tessedit_char_whitelist: '0123456789.,:/',
      })
      const esparso = tsvParaPalavras(await ler(canvas)).filter(
        (p) => p.conf > 45 && /\d/.test(p.texto),
      )
      await worker.setParameters({
        tessedit_pageseg_mode: '4' as never,
        tessedit_char_whitelist: '',
      })
      juntar(esparso, 45)
    }

    // Selos coloridos com texto claro (ex.: coluna de transportadora): o OCR
    // normal os descarta como desenho.
    if (fracaoTextoInvertido(canvas) > 0.01) {
      onProgresso?.('🔍 Lendo os campos coloridos (passada extra)…')
      const canvasSelos = realcarTextoInvertido(canvas)
      if (canvasSelos) juntar(tsvParaPalavras(await ler(canvasSelos)), 45, 3)
    }

    // Mescla tudo pela POSIÇÃO na imagem: onde uma passada leu melhor que a
    // outra, vence a de maior confiança; o que só uma viu, entra.
    const linhas = mesclarNaEstrutura(tsvBase, extras)
    texto = linhasParaTexto(linhas)

    // Rótulo sem valor ("Veículos DIV", "TOTAL ROTAS", "TRUCK"…) quase sempre
    // é número miúdo que o OCR não enxergou na página inteira. Reler a faixa
    // daquela linha, ampliada e só com dígitos, recupera o valor.
    // Documento pequeno: relê CADA linha ampliada, só com dígitos — recupera
    // o valor miúdo que faltou, inclusive no meio da linha (ex.: a quantidade
    // entre "TRUCK" e "x16 posições"). Documento grande: só as linhas com
    // rótulo e nenhum número, para não custar caro.
    const pendentes = minucioso
      ? linhas.slice(0, 24)
      : linhas.filter(rotuloSemNumero).slice(0, 8)
    if (pendentes.length > 0) {
      onProgresso?.('🔍 Relendo os valores que faltaram…')
      await worker.setParameters({
        tessedit_pageseg_mode: '7' as never,
        tessedit_char_whitelist: '0123456789.,:/',
      })
      try {
        for (const l of pendentes) {
          const rec = recortarFaixa(canvas, l, 0)
          if (!rec) continue
          const achados = tsvParaPalavras(await ler(rec.faixa)).filter(
            (p) => p.conf > 35 && /\d/.test(p.texto),
          )
          for (const a of achados) {
            // Volta para as coordenadas da imagem inteira.
            const left = rec.x0 + a.left / rec.zoom
            const width = Math.max(4, a.width / rec.zoom)
            const sobrepostas = l.palavras.filter((q) => {
              const x0 = Math.max(q.left, left)
              const x1 = Math.min(q.left + q.width, left + width)
              return x1 - x0 > Math.min(q.width, width) * 0.3
            })
            // Lixo do OCR na célula (".", "À", "|") não bloqueia o número
            // recuperado — sai para o valor de verdade entrar no lugar.
            const lixo = sobrepostas.filter((q) => !/\d/.test(q.texto) && q.texto.length <= 2)
            if (sobrepostas.length > lixo.length) continue
            if (lixo.length > 0) l.palavras = l.palavras.filter((q) => !lixo.includes(q))
            const topo = Math.min(...l.palavras.map((p) => p.top))
            const altura = Math.max(...l.palavras.map((p) => p.height))
            l.palavras.push({ ...a, left, width, top: topo, height: altura })
          }
        }
        texto = linhasParaTexto(linhas)
      } finally {
        await worker.setParameters({
          tessedit_pageseg_mode: '4' as never,
          tessedit_char_whitelist: '',
        })
      }
    }
    return texto
  } finally {
    void worker.terminate()
  }
}

/** Lê UM arquivo qualquer (PDF, foto ou texto/CSV) e devolve o texto tabular. */
export async function extrairTextoDeArquivo(
  arquivo: File,
  onProgresso?: (mensagem: string) => void,
  opcoes?: OpcoesLeitura,
): Promise<string> {
  const nome = arquivo.name.toLowerCase()
  const ehPdf = nome.endsWith('.pdf')
  const ehImagem =
    arquivo.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|heic|heif)$/.test(nome)
  if (ehPdf) return extrairTextoTabularDePdf(await arquivo.arrayBuffer(), onProgresso)
  if (ehImagem) return extrairTextoDeImagem(arquivo, onProgresso, opcoes)
  return arquivo.text()
}

/**
 * Lê VÁRIOS arquivos em sequência (fotos, PDFs e CSVs podem vir misturados)
 * e junta tudo num texto só — planilhas longas podem chegar em várias fotos.
 */
export async function extrairTextoDeArquivos(
  arquivos: File[],
  onProgresso?: (mensagem: string) => void,
  opcoes?: OpcoesLeitura,
): Promise<string> {
  const partes: string[] = []
  for (let i = 0; i < arquivos.length; i++) {
    const prefixo = arquivos.length > 1 ? `📎 ${i + 1}/${arquivos.length} · ` : ''
    partes.push(await extrairTextoDeArquivo(arquivos[i], (m) => onProgresso?.(prefixo + m), opcoes))
  }
  return partes.join('\n')
}

/** Lê um PDF escaneado renderizando cada página e aplicando OCR (português). */
async function extrairComOcr(
  doc: { numPages: number; getPage: (n: number) => Promise<unknown> },
  onProgresso?: (mensagem: string) => void,
): Promise<string> {
  const worker = await criarWorkerOcr(onProgresso)
  const partes: string[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      onProgresso?.(`🔍 Lendo página ${p}/${doc.numPages} com OCR…`)
      const pagina = (await doc.getPage(p)) as {
        getViewport: (o: { scale: number }) => { width: number; height: number }
        render: (o: unknown) => { promise: Promise<void> }
      }
      const viewport = pagina.getViewport({ scale: ESCALA_OCR })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const contexto = canvas.getContext('2d')
      if (!contexto) throw new Error('canvas indisponível')
      await pagina.render({ canvasContext: contexto, viewport, canvas }).promise
      const resultado = await worker.recognize(canvas, {}, { tsv: true, text: false })
      partes.push(ocrTsvParaTexto(resultado.data.tsv ?? ''))
    }
  } finally {
    await worker.terminate()
  }
  return partes.join('\n')
}

export async function extrairTextoTabularDePdf(
  dados: ArrayBuffer,
  onProgresso?: (mensagem: string) => void,
): Promise<string> {
  const pdfjs = await carregarPdfjs()
  const doc = await pdfjs.getDocument({ data: dados }).promise
  try {
    // Etapa 1: texto embutido no PDF.
    const linhasTotais: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p)
      const conteudo = await pagina.getTextContent()
      const itens: Item[] = []
      for (const bruto of conteudo.items) {
        if (!('str' in bruto)) continue
        const texto = bruto.str.trim()
        if (!texto) continue
        const x = bruto.transform[4]
        itens.push({ x, y: bruto.transform[5], fim: x + bruto.width, texto })
      }
      linhasTotais.push(...itensParaLinhas(itens))
    }
    const texto = linhasTotais.join('\n')
    // PDF com conteúdo de verdade? Usa o texto direto.
    if (texto.replace(/\s/g, '').length >= 40) return texto
    // Etapa 2: praticamente sem texto → é escaneado, entra o OCR.
    return await extrairComOcr(doc, onProgresso)
  } finally {
    await doc.cleanup()
  }
}
