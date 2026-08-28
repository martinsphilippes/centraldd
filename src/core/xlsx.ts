// Leitor de .xlsx — o arquivo do Excel lido como ele é, sem foto no meio.
//
// Fotografar a planilha e passar OCR sempre erra: I vira 1, O vira 0, G vira 6.
// O .xlsx traz o valor exato de cada célula, então a leitura deixa de ser um
// palpite. É um ZIP com XMLs dentro; o navegador já sabe descompactar
// (DecompressionStream) e ler XML (DOMParser), então isto não precisa de
// nenhuma biblioteca — nada de peso extra no app nem dependência com falha de
// segurança conhecida.
//
// Devolve a grade de texto JÁ FORMATADA como o Dispatcher vê na tela: hora
// como "5:00" e não como 0,2083; número com vírgula decimal. É o mesmo texto
// que sairia de um Ctrl+C na planilha, e é isso que os parsers esperam.

import { normalizarTexto } from './texto'

/** Uma planilha lida: nome da aba e as linhas, célula a célula. */
export interface AbaPlanilha {
  nome: string
  linhas: string[][]
}

export function suportaXlsx(): boolean {
  return typeof DecompressionStream !== 'undefined'
}

/* ─────────────────────────────── ZIP ─────────────────────────────── */

async function inflar(bytes: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}

/** Abre o ZIP e devolve o conteúdo de cada arquivo interno, por nome. */
async function abrirZip(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const dados = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // O índice do ZIP fica no FIM do arquivo: acha a assinatura do fecho.
  let fim = -1
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 65557; i--) {
    if (dados.getUint32(i, true) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new Error('arquivo .xlsx inválido (não parece um Excel)')

  const quantidade = dados.getUint16(fim + 10, true)
  let ponteiro = dados.getUint32(fim + 16, true)
  const decodificador = new TextDecoder()
  const arquivos = new Map<string, string>()

  for (let n = 0; n < quantidade; n++) {
    if (dados.getUint32(ponteiro, true) !== 0x02014b50) break
    const metodo = dados.getUint16(ponteiro + 10, true)
    const tamanhoComprimido = dados.getUint32(ponteiro + 20, true)
    const tamanhoNome = dados.getUint16(ponteiro + 28, true)
    const tamanhoExtra = dados.getUint16(ponteiro + 30, true)
    const tamanhoComentario = dados.getUint16(ponteiro + 32, true)
    const inicioLocal = dados.getUint32(ponteiro + 42, true)
    const nome = decodificador.decode(bytes.subarray(ponteiro + 46, ponteiro + 46 + tamanhoNome))

    // Só interessa o miolo da planilha — pular imagens e o resto poupa memória.
    if (nome.endsWith('.xml') || nome.endsWith('.rels')) {
      const nomeLocal = dados.getUint16(inicioLocal + 26, true)
      const extraLocal = dados.getUint16(inicioLocal + 28, true)
      const inicio = inicioLocal + 30 + nomeLocal + extraLocal
      const cru = bytes.subarray(inicio, inicio + tamanhoComprimido)
      arquivos.set(nome, decodificador.decode(metodo === 0 ? cru : await inflar(cru)))
    }
    ponteiro += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario
  }
  return arquivos
}

/* ─────────────────────────── formato das células ─────────────────────────── */

// Formatos que o Excel já traz prontos: 14-17 e 22 são data, 18-21 e 45-47 hora.
const DATA_PADRAO = new Set([14, 15, 16, 17, 22])
const HORA_PADRAO = new Set([18, 19, 20, 21, 45, 46, 47])

type Formato = 'data' | 'hora' | 'numero'

function formatosDasCelulas(xml: string | undefined): Formato[] {
  if (!xml) return []
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const personalizados = new Map<number, string>()
  for (const f of [...doc.getElementsByTagName('numFmt')]) {
    personalizados.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '')
  }
  const estilos = doc.getElementsByTagName('cellXfs')[0]
  if (!estilos) return []
  return [...estilos.getElementsByTagName('xf')].map((xf) => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0)
    const codigo = personalizados.get(id)
    if (codigo) {
      // Um código com ':' é hora; com d/m/a (sem ser o "m" de minuto) é data.
      if (codigo.includes(':')) return 'hora'
      if (/[dy]/i.test(codigo.replace(/\[[^\]]*\]/g, ''))) return 'data'
      return 'numero'
    }
    if (HORA_PADRAO.has(id)) return 'hora'
    if (DATA_PADRAO.has(id)) return 'data'
    return 'numero'
  })
}

const doisDigitos = (n: number) => String(Math.floor(n)).padStart(2, '0')

/** Número de série do Excel → o texto que o Dispatcher vê na célula. */
function valorFormatado(valor: number, formato: Formato): string {
  if (formato === 'hora') {
    // A hora é a fração do dia; arredonda no minuto para não virar 4:59:59.
    const totalMinutos = Math.round((valor % 1) * 24 * 60)
    return `${Math.floor(totalMinutos / 60)}:${doisDigitos(totalMinutos % 60)}`
  }
  if (formato === 'data') {
    // Dia 1 = 01/01/1900, com o bug histórico do ano bissexto de 1900.
    const ms = (valor - 25569) * 86400000
    const d = new Date(Math.round(ms))
    if (Number.isNaN(d.getTime())) return String(valor)
    return `${doisDigitos(d.getUTCDate())}/${doisDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
  }
  // Vírgula decimal: é assim que a planilha mostra e que o resto do app espera.
  return String(valor).replace('.', ',')
}

/* ─────────────────────────────── planilha ─────────────────────────────── */

/** 'BC' → 54. A coluna vem na referência da célula (ex.: 'BC12'). */
function colunaDe(referencia: string): number {
  const letras = /^([A-Z]+)/.exec(referencia)?.[1] ?? ''
  let n = 0
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

function textosCompartilhados(xml: string | undefined): string[] {
  if (!xml) return []
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  // Cada <si> pode vir picado em vários <t> (texto com formatação no meio).
  return [...doc.getElementsByTagName('si')].map((si) =>
    [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''),
  )
}

function lerAba(xml: string, compartilhados: string[], formatos: Formato[]): string[][] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const linhas: string[][] = []
  for (const linha of [...doc.getElementsByTagName('row')]) {
    const celulas: string[] = []
    let coluna = 0
    for (const c of [...linha.getElementsByTagName('c')]) {
      const referencia = c.getAttribute('r')
      if (referencia) coluna = colunaDe(referencia)
      // Buraco na linha vira célula vazia: as colunas não podem escorregar.
      while (celulas.length < coluna) celulas.push('')

      const tipo = c.getAttribute('t')
      let texto = ''
      if (tipo === 'inlineStr') {
        texto = [...c.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('')
      } else {
        const bruto = c.getElementsByTagName('v')[0]?.textContent ?? ''
        if (tipo === 's') texto = compartilhados[Number(bruto)] ?? ''
        else if (bruto === '') texto = ''
        else if (tipo === 'str' || tipo === 'e' || tipo === 'b') texto = bruto
        else {
          const numero = Number(bruto)
          texto = Number.isNaN(numero)
            ? bruto
            : valorFormatado(numero, formatos[Number(c.getAttribute('s') ?? 0)] ?? 'numero')
        }
      }
      // NFC: o mesmo "Santa Vitória" aparece no arquivo com o acento embutido
      // no ó e com o acento em caractere separado. São textos DIFERENTES para o
      // computador, e virariam duas cidades. Normalizar deixa um só.
      celulas.push(texto.normalize('NFC').trim())
      coluna++
    }
    linhas.push(celulas)
  }
  return linhas
}

/** Lê o arquivo .xlsx inteiro: todas as abas, cada uma como grade de texto. */
export async function lerXlsx(arquivo: File | ArrayBuffer): Promise<AbaPlanilha[]> {
  if (!suportaXlsx()) {
    throw new Error('este navegador não abre .xlsx — atualize o app ou cole os dados da planilha')
  }
  const buffer = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer()
  const arquivos = await abrirZip(buffer)
  const compartilhados = textosCompartilhados(arquivos.get('xl/sharedStrings.xml'))
  const formatos = formatosDasCelulas(arquivos.get('xl/styles.xml'))

  // Os nomes das abas estão no workbook; o caminho de cada uma, nos rels.
  const nomes = new Map<string, string>()
  const workbook = arquivos.get('xl/workbook.xml')
  const rels = arquivos.get('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const alvo = new Map(
      [...new DOMParser().parseFromString(rels, 'application/xml').getElementsByTagName('Relationship')].map(
        (r) => [r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? ''],
      ),
    )
    for (const s of [...new DOMParser().parseFromString(workbook, 'application/xml').getElementsByTagName('sheet')]) {
      const id = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
        ?? s.getAttribute('r:id')
        ?? ''
      const caminho = (alvo.get(id) ?? '').replace(/^\/?(xl\/)?/, 'xl/')
      if (caminho) nomes.set(caminho, s.getAttribute('name') ?? '')
    }
  }

  const abas: AbaPlanilha[] = []
  const caminhos = [...arquivos.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  for (const caminho of caminhos) {
    abas.push({
      nome: nomes.get(caminho) ?? caminho.replace('xl/worksheets/', '').replace('.xml', ''),
      linhas: lerAba(arquivos.get(caminho) ?? '', compartilhados, formatos),
    })
  }
  return abas
}

/**
 * Escolhe a ABA certa e devolve o conteúdo dela em TEXTO separado por
 * tabulação — exatamente o que sairia de um Ctrl+C na planilha. Assim o .xlsx
 * entra pelos mesmos leitores que já tratam o texto colado.
 *
 * A planilha do Meli vem com sete abas, e a maior delas é a "Data": 123 mil
 * células de telemetria de veículo, que não têm rota nenhuma. Por isso a aba
 * é escolhida pelo NOME primeiro; o tamanho só desempata quando o nome pedido
 * não existe no arquivo.
 */
export async function xlsxAbaEscolhida(
  arquivo: File | ArrayBuffer,
  /** Nomes (ou pedaços de nome) da aba desejada, em ordem de preferência. */
  preferidas: string[] = [],
): Promise<{ nome: string; texto: string; abas: string[] }> {
  const abas = await lerXlsx(arquivo)
  const nomes = abas.map((a) => a.nome)
  const cheias = abas.filter((a) => a.linhas.some((l) => l.some((c) => c !== '')))
  if (cheias.length === 0) return { nome: '', texto: '', abas: nomes }

  const chave = (t: string) => normalizarTexto(t).replace(/\s+/g, ' ')
  const pedida = preferidas
    .map((p) => cheias.find((a) => chave(a.nome).includes(chave(p))))
    .find(Boolean)
  const escolhida =
    pedida ??
    cheias.reduce((maior, a) =>
      a.linhas.flat().filter(Boolean).length > maior.linhas.flat().filter(Boolean).length ? a : maior,
    )

  return {
    nome: escolhida.nome,
    texto: escolhida.linhas
      .map((l) => l.join('\t'))
      .filter((l) => l.trim() !== '')
      .join('\n'),
    abas: nomes,
  }
}

/** Só o texto da aba escolhida — atalho para quem não precisa do nome dela. */
export async function xlsxComoTexto(
  arquivo: File | ArrayBuffer,
  preferidas: string[] = [],
): Promise<string> {
  return (await xlsxAbaEscolhida(arquivo, preferidas)).texto
}
