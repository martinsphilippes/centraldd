// Leitura da página "Detalhe de Rota" do painel do Meli (envios.adminml.com),
// salva pelo Dispatcher como texto (Ctrl+S / copiar para o bloco de notas).
// O Meli embute os dados da rota em JSON dentro do HTML — a extração é por
// varredura de padrões, porque o arquivo é HTML com JSON no meio, não JSON puro.

export interface PacoteRotaMeli {
  numeracao: string
  /** Etiqueta de carga (CD-1, CD-2…) — onde procurar o pacote no veículo. */
  etiqueta: string
  cidade: string
  endereco: string
  destinatario: string
  /** true = a página (de rota já encerrada) diz que este não foi entregue. */
  naoEntregue: boolean
  /** Reclamações abertas pelo cliente neste pacote (claims do Meli). */
  reclamacoes: number
}

export interface RotaMeliLida {
  /** Nome da rota (cluster), ex.: B26_PM1. */
  rota: string
  motorista: string
  transportadora: string
  placa: string
  veiculo: string
  pacotes: PacoteRotaMeli[]
}

/** true se o texto parece a página de rota do Meli. */
export function pareceRotaMeli(texto: string): boolean {
  return texto.includes('"monitoringRouteData"') ||
    (texto.includes('"relatedEntity"') && texto.includes('"shipment"'))
}

const pega = (s: string, re: RegExp): string => re.exec(s)?.[1] ?? ''

/**
 * Extrai a rota completa. Devolve null quando o texto não é a página do Meli
 * ou não tem nenhum pacote reconhecível.
 */
export function parsearRotaMeli(texto: string): RotaMeliLida | null {
  if (!pareceRotaMeli(texto)) return null

  // Dados do destinatário, indexados pela numeração.
  const recebedor = new Map<string, { destinatario: string; endereco: string; cidade: string }>()
  const reInfo =
    /"shipment_id":(\d+),"receiver_name":"([^"]*)","street_name":"([^"]*)","street_number":"([^"]*)"[^}]*?"neighborhood":"([^"]*)","city":"([^"]*)"/g
  for (const m of texto.matchAll(reInfo)) {
    const [, id, nome, rua, numero, bairro, cidade] = m
    recebedor.set(id, {
      destinatario: nome,
      endereco: [rua, numero].filter(Boolean).join(', ') + (bairro ? ` — ${bairro}` : ''),
      cidade,
    })
  }

  // Cada pacote aparece como relatedEntity; a etiqueta (CD-n) vem logo depois,
  // no mesmo bloco do transporte — por isso a associação é por posição.
  const pacotes: PacoteRotaMeli[] = []
  const vistos = new Set<string>()
  const reEntidade =
    /"relatedEntity":\{"id":(\d+),"type":"shipment","status":"[^"]*","substatus":"?([a-z_]*)"?/g
  const matches = [...texto.matchAll(reEntidade)]
  for (let i = 0; i < matches.length; i++) {
    const [, id, substatus] = matches[i]
    if (vistos.has(id)) continue
    vistos.add(id)
    const inicio = matches[i].index ?? 0
    const fim = matches[i + 1]?.index ?? texto.length
    const bloco = texto.slice(inicio, fim)
    const etiqueta = pega(bloco, /"printedLabel":"([^"]*)"/)
    const info = recebedor.get(id)
    pacotes.push({
      numeracao: id,
      etiqueta,
      cidade: info?.cidade ?? '',
      endereco: info?.endereco ?? '',
      destinatario: info?.destinatario ?? '',
      naoEntregue: substatus === 'missing',
      reclamacoes: Number(pega(bloco, /"claimsAmount":(\d+)/)) || 0,
    })
  }
  if (pacotes.length === 0) return null

  return {
    rota:
      pega(texto, /"cluster":"([^"]+)"/) ||
      pega(texto, /<title[^>]*>Detalhe de Rota \| ([^<]+)<\/title>/),
    motorista: pega(texto, /"driverName":"([^"]+)"/),
    transportadora: pega(texto, /"carrier":"([^"]+)"/),
    placa: pega(texto, /"license":"([^"]+)"/),
    veiculo: pega(texto, /"vehicleType":"([^"]+)"/),
    pacotes,
  }
}
