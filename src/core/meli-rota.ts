// Leitura da página "Detalhe de Rota" do painel do Meli (envios.adminml.com),
// salva pelo Dispatcher como texto (Ctrl+S / copiar para o bloco de notas).
// O Meli embute os dados da rota em JSON dentro do HTML — a extração é por
// varredura de padrões, porque o arquivo é HTML com JSON no meio, não JSON puro.

export interface PacoteRotaMeli {
  numeracao: string
  /** Parada da rota (PD-1, PD-2…) — onde procurar o pacote no veículo. */
  etiqueta: string
  cidade: string
  endereco: string
  destinatario: string
  /** true = a página (de rota já encerrada) diz que este não foi entregue. */
  naoEntregue: boolean
  /** Reclamações abertas pelo cliente neste pacote (claims do Meli). */
  reclamacoes: number
  /** Coordenadas do endereço (precisão de telhado, vem do Meli). */
  lat: number | null
  lng: number | null
  /** Posição desta parada na sequência planejada pelo Meli (1, 2, 3…). */
  ordemMeli: number | null
  /** true = endereço COMERCIAL (business) segundo o Meli. */
  comercial: boolean
  /** Horário de funcionamento informado pelo Meli (HH:MM), quando houver. */
  abre: string | null
  fecha: string | null
  /** true = o Meli marca o local como aberto o tempo todo. */
  sempreAberto: boolean
}

export interface RotaMeliLida {
  /** Nome da rota (cluster), ex.: B26_PM1. */
  rota: string
  motorista: string
  transportadora: string
  placa: string
  veiculo: string
  /** Ponto de partida/chegada da rota (a base), quando a página informa. */
  baseLat: number | null
  baseLng: number | null
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
/**
 * A etiqueta do documento do Meli vira a PARADA da rota: PD-1, PD-2…
 *
 * O Meli escreve o prefixo conforme a base (AI-1, CD-1…), e essa letra não diz
 * nada para quem está no veículo. O que importa é o NÚMERO da parada, então o
 * app fala uma língua só: PD. Etiqueta sem número fica como veio.
 */
export function etiquetaParada(bruto: string): string {
  const numero = /(\d+)/.exec(bruto ?? '')?.[1]
  return numero ? `PD-${Number(numero)}` : (bruto ?? '').trim()
}

export function parsearRotaMeli(texto: string): RotaMeliLida | null {
  if (!pareceRotaMeli(texto)) return null

  // Dados do destinatário, indexados pela numeração.
  const recebedor = new Map<
    string,
    { destinatario: string; endereco: string; cidade: string; lat: number | null; lng: number | null }
  >()
  const reInfo =
    /"shipment_id":(\d+),"receiver_name":"([^"]*)","street_name":"([^"]*)","street_number":"([^"]*)","latitude":(-?[\d.]+),"longitude":(-?[\d.]+)[^}]*?"neighborhood":"([^"]*)","city":"([^"]*)"/g
  for (const m of texto.matchAll(reInfo)) {
    const [, id, nome, rua, numero, lat, lng, bairro, cidade] = m
    recebedor.set(id, {
      destinatario: nome,
      endereco: [rua, numero].filter(Boolean).join(', ') + (bairro ? ` — ${bairro}` : ''),
      cidade,
      lat: Number(lat) || null,
      lng: Number(lng) || null,
    })
  }

  // Sequência das paradas: cada bloco de pacote pertence à última parada
  // ("sequence":N) aberta antes dele no texto.
  const sequencias = [...texto.matchAll(/"sequence":(\d+)/g)].map((m) => ({
    posicao: m.index ?? 0,
    valor: Number(m[1]),
  }))
  const sequenciaEm = (posicao: number): number | null => {
    let atual: number | null = null
    for (const s of sequencias) {
      if (s.posicao > posicao) break
      atual = s.valor
    }
    return atual
  }

  // Horário de funcionamento: vem no pedido, logo ANTES do bloco do pacote —
  // vale o último 'locationHours' aberto antes da posição.
  const horarios = [
    ...texto.matchAll(
      /"locationHours":\{"isOpenAllTime":(true|false),"isClosed":(true|false),"openHoursRanges":\{"from":(null|"[0-9:]+"),"to":(null|"[0-9:]+")\}\}/g,
    ),
  ].map((m) => ({
    posicao: m.index ?? 0,
    sempreAberto: m[1] === 'true',
    abre: m[3] === 'null' ? null : m[3].slice(1, -1),
    fecha: m[4] === 'null' ? null : m[4].slice(1, -1),
  }))
  const horarioEm = (posicao: number) => {
    let atual: (typeof horarios)[number] | null = null
    for (const h of horarios) {
      if (h.posicao > posicao) break
      atual = h
    }
    return atual
  }

  // Cada pacote aparece como relatedEntity; a etiqueta vem logo depois, no
  // mesmo bloco do transporte — por isso a associação é por posição.
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
    const etiqueta = etiquetaParada(pega(bloco, /"printedLabel":"([^"]*)"/))
    const info = recebedor.get(id)
    pacotes.push({
      numeracao: id,
      etiqueta,
      cidade: info?.cidade ?? '',
      endereco: info?.endereco ?? '',
      destinatario: info?.destinatario ?? '',
      naoEntregue: substatus === 'missing',
      reclamacoes: Number(pega(bloco, /"claimsAmount":(\d+)/)) || 0,
      lat: info?.lat ?? null,
      lng: info?.lng ?? null,
      ordemMeli: sequenciaEm(inicio),
      comercial: pega(bloco, /"addressType":"([a-z_]+)"/) === 'business',
      abre: horarioEm(inicio)?.abre ?? null,
      fecha: horarioEm(inicio)?.fecha ?? null,
      sempreAberto: horarioEm(inicio)?.sempreAberto ?? false,
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
    baseLat:
      Number(pega(texto, /"destinationFacility":\{[^}]*?"latitude":(-?[\d.]+)/)) || null,
    baseLng:
      Number(pega(texto, /"destinationFacility":\{[^}]*?"longitude":(-?[\d.]+)/)) || null,
    pacotes,
  }
}
