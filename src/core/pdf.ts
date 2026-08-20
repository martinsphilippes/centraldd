// Extração de tabelas de PDF: reconstrói linhas (pela posição vertical) e
// colunas (pelos espaços horizontais) do texto do PDF, gerando o mesmo texto
// separado por TAB que os parsers de planilha já entendem.
// O pdf.js é carregado sob demanda (só pesa quando alguém usa PDF).

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

export async function extrairTextoTabularDePdf(dados: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const doc = await pdfjs.getDocument({ data: dados }).promise
  const linhasTotais: string[] = []
  try {
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
      // Agrupa em linhas pela coordenada vertical.
      const linhas: { y: number; itens: Item[] }[] = []
      for (const item of itens) {
        const linha = linhas.find((l) => Math.abs(l.y - item.y) <= TOLERANCIA_LINHA)
        if (linha) linha.itens.push(item)
        else linhas.push({ y: item.y, itens: [item] })
      }
      // No PDF o eixo Y cresce para cima → topo da página primeiro.
      linhas.sort((a, b) => b.y - a.y)
      for (const linha of linhas) {
        linha.itens.sort((a, b) => a.x - b.x)
        let texto = ''
        let fimAnterior: number | null = null
        for (const item of linha.itens) {
          if (fimAnterior !== null) texto += item.x - fimAnterior > ESPACO_COLUNA ? '\t' : ' '
          texto += item.texto
          fimAnterior = item.fim
        }
        linhasTotais.push(texto)
      }
    }
  } finally {
    await doc.cleanup()
  }
  return linhasTotais.join('\n')
}
