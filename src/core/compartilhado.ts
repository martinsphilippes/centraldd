// Arquivo que chegou pelo botão COMPARTILHAR do celular.
//
// Android: o sistema entrega o arquivo ao service worker, que o guarda no
// aparelho e abre o app na Conferência. Aqui é onde o app pega esse arquivo.
//
// iPhone: a Apple não implementou o compartilhamento para aplicativo instalado,
// então lá o caminho é um Atalho que abre o app com o conteúdo no endereço
// (`#/minha-conferencia?dados=…`). Os dois caminhos terminam na mesma função,
// para a tela não precisar saber de qual celular veio.

// O nome do depósito mudou junto com o nome do app. O antigo continua sendo
// consultado porque um arquivo compartilhado ANTES da atualização chegar ao
// aparelho ficou guardado com o nome velho — sem isto, esse arquivo sumiria e
// a motorista teria enviado a conferência para o vazio.
const CACHES = ['centraldd-compartilhado', 'mldisponibilidade-compartilhado']
const CHAVE = '/__arquivo-compartilhado'

export interface ArquivoCompartilhado {
  nome: string
  texto: string
  origem: 'compartilhar' | 'atalho'
}

/** Lê (e consome) o arquivo guardado pelo service worker no Android. */
async function doServiceWorker(): Promise<ArquivoCompartilhado | null> {
  if (typeof caches === 'undefined') return null
  try {
    for (const nomeCache of CACHES) {
      const cache = await caches.open(nomeCache)
      const resp = await cache.match(CHAVE)
      if (!resp) continue
      const texto = await resp.text()
      const nome = decodeURIComponent(resp.headers.get('x-nome-arquivo') ?? 'compartilhado.csv')
      // Consome: um arquivo compartilhado vale uma vez só. Se ficasse guardado,
      // reabrir o app tentaria enviar de novo o que já foi enviado.
      await cache.delete(CHAVE)
      if (texto.trim()) return { nome, texto, origem: 'compartilhar' }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Conteúdo vindo pelo endereço, que é como o Atalho do iPhone entrega.
 * Aceita texto puro (`?dados=`) e texto em base64 (`?dados64=`), porque o
 * Atalho monta a URL de um jeito ou de outro conforme o passo escolhido.
 */
function doEndereco(): ArquivoCompartilhado | null {
  try {
    // HashRouter: o que interessa vem depois do '?' dentro do '#'.
    const hash = window.location.hash
    const pos = hash.indexOf('?')
    if (pos < 0) return null
    const params = new URLSearchParams(hash.slice(pos + 1))
    const cru = params.get('dados')
    const base64 = params.get('dados64')
    if (!cru && !base64) return null
    let texto = cru ?? ''
    if (base64) {
      const bytes = Uint8Array.from(atob(base64.replace(/ /g, '+')), (c) => c.charCodeAt(0))
      texto = new TextDecoder().decode(bytes)
    }
    // Tira os dados do endereço: a lista de pacotes não fica no histórico nem
    // volta a ser lida se a motorista atualizar a tela.
    params.delete('dados')
    params.delete('dados64')
    const base = hash.slice(0, pos)
    const resto = params.toString()
    window.history.replaceState(null, '', `${base}${resto ? `?${resto}` : ''}`)
    return texto.trim()
      ? { nome: params.get('nome') ?? 'compartilhado.csv', texto, origem: 'atalho' }
      : null
  } catch {
    return null
  }
}

/**
 * O arquivo compartilhado que está esperando, venha ele do Android ou do
 * Atalho do iPhone. Devolve null quando o app foi aberto normalmente.
 */
export async function arquivoCompartilhado(): Promise<ArquivoCompartilhado | null> {
  return doEndereco() ?? (await doServiceWorker())
}
