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

/** Cria o worker de OCR em português, configurado para ler tabelas. */
async function criarWorkerOcr(onProgresso?: (mensagem: string) => void) {
  const { createWorker } = await import('tesseract.js')
  onProgresso?.('🔍 Preparando OCR (1ª vez demora um pouco)…')
  const worker = await createWorker('por')
  // PSM 4 (coluna única, tamanhos variados) lê tabelas muito melhor que o padrão.
  await worker.setParameters({ tessedit_pageseg_mode: '4' as never })
  return worker
}

/**
 * Lê uma IMAGEM (JPG, PNG, foto de celular, print…) com OCR e devolve o texto
 * tabular. Fotos pequenas são ampliadas antes da leitura para melhorar o acerto.
 */
export async function extrairTextoDeImagem(
  arquivo: Blob,
  onProgresso?: (mensagem: string) => void,
): Promise<string> {
  const bitmap = await createImageBitmap(arquivo)
  const escala = bitmap.width < 1600 ? Math.min(3, 1600 / bitmap.width) : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('canvas indisponível')
  contexto.imageSmoothingEnabled = true
  contexto.imageSmoothingQuality = 'high'
  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const worker = await criarWorkerOcr(onProgresso)
  try {
    onProgresso?.('🔍 Lendo a imagem com OCR…')
    const resultado = await worker.recognize(canvas, {}, { tsv: true, text: false })
    return ocrTsvParaTexto(resultado.data.tsv ?? '')
  } finally {
    await worker.terminate()
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
