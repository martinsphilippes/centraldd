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
  // Normaliza para ~2400px de largura: fotos gigantes (12MP) são reduzidas
  // (evita travar aparelhos fracos) e prints/fotos pequenas são ampliadas
  // (melhora muito o acerto em tabelas densas). Calibrado com planilhas reais.
  // Calibrado com os documentos reais da operação: imagens pequenas (cards,
  // prints comprimidos) precisam de até 6x para o OCR ler os números miúdos.
  const LARGURA_ALVO = 2400
  const escala = Math.min(6, LARGURA_ALVO / largura)
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
 * Reforço de contraste (tons de cinza + esticamento do histograma): recupera
 * números perdidos em fotos de tela de computador (moiré, brilho irregular).
 */
function reforcarContraste(canvas: HTMLCanvasElement) {
  const contexto = canvas.getContext('2d')
  if (!contexto) return
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
    const novo = Math.max(0, Math.min(255, (((d[i] - p5) * 255) / faixa) | 0))
    d[i] = d[i + 1] = d[i + 2] = novo
  }
  contexto.putImageData(imagem, 0, 0)
}

// Cópia reduzida da última imagem lida — vai junto no diagnóstico para dar
// para reproduzir exatamente a leitura que aconteceu no aparelho do usuário.
let ultimaMiniatura = ''

export function obterUltimaMiniaturaOcr(): string {
  return ultimaMiniatura
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

/**
 * Lê uma IMAGEM (JPG, PNG, foto de celular, print…) com OCR e devolve o texto
 * tabular. Fotos pequenas são ampliadas antes da leitura para melhorar o acerto.
 * Se a 1ª passada reconhecer poucos números (foto de tela, baixa qualidade),
 * roda uma 2ª passada com contraste reforçado e junta o que cada uma achou.
 */
export async function extrairTextoDeImagem(
  arquivo: Blob,
  onProgresso?: (mensagem: string) => void,
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
    const resultado = await comTempoLimite(worker.recognize(canvas, {}, { tsv: true, text: false }))
    let texto = ocrTsvParaTexto(resultado.data.tsv ?? '')
    // Poucos números reconhecidos? Foto muito escura/apagada — 2ª passada
    // com contraste reforçado (mesmo modo de leitura, que é o que funciona).
    // Conta só números SOLTOS (célula numérica): dígitos grudados em letra
    // (EMG13) ou em data (13/08/2026) não provam que os valores foram lidos.
    const numerosSoltos = texto
      .split(/[\s\t]+/)
      .filter((t) => /^\d+([.,]\d+)?$/.test(t)).length
    if (numerosSoltos < 6) {
      onProgresso?.('🔍 Refinando a leitura (2ª passada com contraste)…')
      reforcarContraste(canvas)
      const segunda = await comTempoLimite(worker.recognize(canvas, {}, { tsv: true, text: false }))
      // Junta as duas leituras: o leitor de rótulos usa o melhor de cada uma.
      texto = texto + '\n' + ocrTsvParaTexto(segunda.data.tsv ?? '')
    }
    return texto
  } finally {
    void worker.terminate()
  }
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
