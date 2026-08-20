// Motor de sugestão automática de alocação: pontua cada par motorista × rota
// com base no histórico da programação e nos parâmetros definidos pelo
// dispatcher, e monta a melhor combinação (1 rota por motorista no dia).

import type { DB, Motorista, ParametrosAlocacao, ProgramacaoItem, Rota } from './types'
import { cidadesDoTexto } from './planilha'
import { STATUS_DISPONIVEIS } from './constants'
import { hojeISO } from './dates'

export const PARAMETROS_PADRAO: ParametrosAlocacao = {
  id: 'alocacao',
  janelaHistoricoDias: 90,
  pesoExperienciaCidade: 6,
  pesoExperienciaRota: 4,
  pesoRespeitarPlanoMeli: 5,
  pesoCidadesPreferidas: 3,
  pesoRodizio: 5,
  janelaRodizioDias: 7,
  maxVezesSeguidasMesmaCidade: 0,
  exigirDisponibilidadeAgenda: false,
  bonusDisponivelAgenda: 3,
  exigirVeiculoCompativel: false,
  equivalenciasVeiculo: 'VUC = HR, Van\nUTILITARIO = Fiorino, Van, HR\nVEÍCULO DE PASSEIO = Carro passeio',
  autoAplicarAcimaDe: 0,
  maxDiasAgendados: 2,
  atualizadoEm: '',
}

export function parametrosAtuais(db: DB): ParametrosAlocacao {
  const salvo = db.config.find((c) => c.id === 'alocacao')
  // Mescla com o padrão: configurações salvas antes de um campo novo existir
  // ganham o valor padrão desse campo automaticamente.
  return salvo ? { ...PARAMETROS_PADRAO, ...salvo } : PARAMETROS_PADRAO
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

function listaDeTexto(texto?: string): string[] {
  return (texto ?? '')
    .split(/[,;\n]/)
    .map((c) => norm(c))
    .filter(Boolean)
}

/** "VUC = HR, Van" (uma por linha) → mapa veículo-da-rota → veículos aceitos. */
function parseEquivalencias(texto: string): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>()
  for (const linha of texto.split(/\n/)) {
    const [rota, cadastro] = linha.split('=')
    if (!rota || !cadastro) continue
    mapa.set(norm(rota), new Set(cadastro.split(/[,;]/).map((v) => norm(v)).filter(Boolean)))
  }
  return mapa
}

export interface Sugestao {
  item: ProgramacaoItem
  motorista: Motorista | null
  pontos: number
  /** 0..100 — o quanto o candidato escolhido se destaca dos demais para a rota. */
  confianca: number
  motivos: string[]
  alertas: string[]
}

export function sugerirAlocacao(db: DB, data: string, p: ParametrosAlocacao): Sugestao[] {
  const itensDoDia = db.programacao.filter((i) => i.data === data)
  const dataMinima = p.janelaHistoricoDias > 0 ? hojeISO(-p.janelaHistoricoDias) : '0000-01-01'
  const historico = db.programacao.filter((i) => i.data < data && i.data >= dataMinima)
  const dataMinimaRodizio = hojeISO(-Math.max(1, p.janelaRodizioDias))
  const equivalencias = parseEquivalencias(p.equivalenciasVeiculo)

  const candidatos = db.motoristas.filter((m) => m.ativo && m.aprovado !== false)

  // Índices do histórico por motorista.
  const porMotorista = new Map<
    string,
    { porCidade: Map<string, number>; porRota: Map<string, number>; rodizioPorCidade: Map<string, number>; datasPorCidade: Map<string, string[]> }
  >()
  for (const h of historico) {
    if (!h.motoristaId) continue
    const idx =
      porMotorista.get(h.motoristaId) ??
      { porCidade: new Map(), porRota: new Map(), rodizioPorCidade: new Map(), datasPorCidade: new Map() }
    idx.porRota.set(h.rota, (idx.porRota.get(h.rota) ?? 0) + 1)
    for (const c of cidadesDoTexto(h.cidade)) {
      const cidade = norm(c)
      idx.porCidade.set(cidade, (idx.porCidade.get(cidade) ?? 0) + 1)
      if (h.data >= dataMinimaRodizio) idx.rodizioPorCidade.set(cidade, (idx.rodizioPorCidade.get(cidade) ?? 0) + 1)
      const datas = idx.datasPorCidade.get(cidade) ?? []
      if (!datas.includes(h.data)) datas.push(h.data)
      idx.datasPorCidade.set(cidade, datas)
    }
    porMotorista.set(h.motoristaId, idx)
  }

  const disponiveisHoje = new Set(
    db.agenda
      .filter((a) => a.data === data && STATUS_DISPONIVEIS.includes(a.status))
      .map((a) => a.motoristaId),
  )
  const marcaramHoje = new Set(db.agenda.filter((a) => a.data === data).map((a) => a.motoristaId))

  /** Foi à cidade nos últimos N dias de trabalho SEGUIDOS? (trava de rodízio) */
  const estourouSequencia = (motoristaId: string, cidades: string[]): boolean => {
    if (p.maxVezesSeguidasMesmaCidade <= 0) return false
    const idx = porMotorista.get(motoristaId)
    if (!idx) return false
    return cidades.some((cidade) => {
      const datas = (idx.datasPorCidade.get(cidade) ?? []).sort().reverse()
      return datas.length >= p.maxVezesSeguidasMesmaCidade
    })
  }

  // Pontua cada par (rota do dia × candidato).
  interface Par {
    item: ProgramacaoItem
    motorista: Motorista
    pontos: number
    confianca: number
    motivos: string[]
    alertas: string[]
  }
  const pares: Par[] = []

  for (const item of itensDoDia) {
    const cidades = cidadesDoTexto(item.cidade).map(norm)
    for (const m of candidatos) {
      const motivos: string[] = []
      const alertas: string[] = []

      // ---- Travas (excluem o candidato) ----
      const bloqueadas = listaDeTexto(m.cidadesBloqueadas)
      if (cidades.some((c) => bloqueadas.some((b) => c.includes(b) || b.includes(c)))) continue
      if (p.exigirDisponibilidadeAgenda && !disponiveisHoje.has(m.id)) continue
      if (marcaramHoje.has(m.id) && !disponiveisHoje.has(m.id)) continue // marcou indisponível/folga/férias
      if (p.exigirVeiculoCompativel) {
        const aceitos = equivalencias.get(norm(item.veiculo))
        if (aceitos && aceitos.size > 0 && !aceitos.has(norm(m.veiculo))) continue
      }
      if (estourouSequencia(m.id, cidades)) continue

      // ---- Pontuação ----
      let pontos = 0
      const idx = porMotorista.get(m.id)
      const expCidade = cidades.reduce((s, c) => s + (idx?.porCidade.get(c) ?? 0), 0)
      if (expCidade > 0) {
        pontos += p.pesoExperienciaCidade * Math.min(1, expCidade / 8)
        motivos.push(`🏙️ ${expCidade}x nessa(s) cidade(s)`)
      } else {
        alertas.push('🆕 sem histórico na cidade')
      }
      const expRota = idx?.porRota.get(item.rota) ?? 0
      if (expRota > 0) {
        pontos += p.pesoExperienciaRota * Math.min(1, expRota / 5)
        motivos.push(`🛣️ já fez a ${item.rota} ${expRota}x`)
      }
      if (item.motoristaId === m.id || norm(item.driverPlanejado).startsWith(norm(m.nome).split(' ')[0])) {
        pontos += p.pesoRespeitarPlanoMeli
        motivos.push('📋 era o plano do Meli')
      }
      const preferidas = listaDeTexto(m.cidadesPreferidas)
      if (cidades.some((c) => preferidas.some((f) => c.includes(f) || f.includes(c)))) {
        pontos += p.pesoCidadesPreferidas
        motivos.push('⭐ cidade preferida dele')
      }
      const repeticao = cidades.reduce((s, c) => s + (idx?.rodizioPorCidade.get(c) ?? 0), 0)
      if (repeticao > 0) {
        pontos -= p.pesoRodizio * Math.min(1, repeticao / Math.max(1, p.janelaRodizioDias))
        alertas.push(`🔁 foi ${repeticao}x nos últimos ${p.janelaRodizioDias} dias`)
      }
      if (disponiveisHoje.has(m.id)) {
        pontos += p.exigirDisponibilidadeAgenda ? 0 : p.bonusDisponivelAgenda
        motivos.push('✅ disponível na agenda')
      }

      pares.push({ item, motorista: m, pontos, confianca: 0, motivos, alertas })
    }
  }

  // Combinação gulosa: melhores pares primeiro, 1 rota por motorista.
  pares.sort((a, b) => b.pontos - a.pontos)
  const paresPorItem = new Map<string, Par[]>()
  for (const par of pares) {
    const arr = paresPorItem.get(par.item.id) ?? []
    arr.push(par) // pares já ordenados desc → cada lista fica desc
    paresPorItem.set(par.item.id, arr)
  }
  const rotaPreenchida = new Set<string>()
  const motoristaUsado = new Set<string>()
  const escolhidos = new Map<string, Par>()
  for (const par of pares) {
    if (rotaPreenchida.has(par.item.id) || motoristaUsado.has(par.motorista.id)) continue
    // Confiança = quanto o escolhido se destaca do melhor concorrente livre da rota.
    const alternativa = (paresPorItem.get(par.item.id) ?? []).find(
      (o) => o.motorista.id !== par.motorista.id && !motoristaUsado.has(o.motorista.id),
    )
    const margem = alternativa ? par.pontos - alternativa.pontos : par.pontos + 4
    let conf = (100 * margem) / (margem + 4) // saturante: margem 4 → 50%, 12 → 75%
    if (par.pontos <= 0) conf = Math.min(conf, 35) // sem histórico = palpite, confiança baixa
    par.confianca = Math.max(0, Math.min(100, Math.round(conf)))
    rotaPreenchida.add(par.item.id)
    motoristaUsado.add(par.motorista.id)
    escolhidos.set(par.item.id, par)
  }

  return itensDoDia
    .slice()
    .sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR', { numeric: true }))
    .map((item) => {
      const e = escolhidos.get(item.id)
      return e
        ? {
            item,
            motorista: e.motorista,
            pontos: Math.round(e.pontos * 10) / 10,
            confianca: e.confianca,
            motivos: e.motivos,
            alertas: e.alertas,
          }
        : { item, motorista: null, pontos: 0, confianca: 0, motivos: [], alertas: ['❌ nenhum motorista elegível (travas dos parâmetros)'] }
    })
}

export interface AlocacaoRota {
  rota: Rota
  motorista: Motorista
  motivos: string[]
}

/**
 * Direciona motoristas (ex.: os disponíveis de uma chamada) para as rotas da
 * planilha de Rotas. Mesma lógica do motor da programação, adaptada à rota fixa:
 * pontua cidade do motorista, preferências, histórico e veículo; respeita
 * cidades bloqueadas e rodízio; combina 1 rota por motorista (melhores antes).
 */
export function alocarMotoristasNasRotas(
  db: DB,
  rotas: Rota[],
  candidatos: Motorista[],
  p: ParametrosAlocacao,
): AlocacaoRota[] {
  const equivalencias = parseEquivalencias(p.equivalenciasVeiculo)
  const dataMinima = p.janelaHistoricoDias > 0 ? hojeISO(-p.janelaHistoricoDias) : '0000-01-01'
  const dataMinimaRodizio = hojeISO(-Math.max(1, p.janelaRodizioDias))

  // Histórico da programação: experiência e repetição recente por cidade.
  const expPorMotorista = new Map<string, Map<string, number>>()
  const rodizioPorMotorista = new Map<string, Map<string, number>>()
  for (const h of db.programacao) {
    if (!h.motoristaId || h.data < dataMinima) continue
    for (const c of cidadesDoTexto(h.cidade)) {
      const cidade = norm(c)
      const exp = expPorMotorista.get(h.motoristaId) ?? new Map()
      exp.set(cidade, (exp.get(cidade) ?? 0) + 1)
      expPorMotorista.set(h.motoristaId, exp)
      if (h.data >= dataMinimaRodizio) {
        const rod = rodizioPorMotorista.get(h.motoristaId) ?? new Map()
        rod.set(cidade, (rod.get(cidade) ?? 0) + 1)
        rodizioPorMotorista.set(h.motoristaId, rod)
      }
    }
  }

  interface Par {
    rota: Rota
    motorista: Motorista
    pontos: number
    motivos: string[]
  }
  const pares: Par[] = []
  for (const rota of rotas) {
    const cidades = cidadesDoTexto(rota.cidade).map(norm)
    if (cidades.length === 0 && rota.cidade.trim()) cidades.push(norm(rota.cidade))
    for (const m of candidatos) {
      const motivos: string[] = []
      const bloqueadas = listaDeTexto(m.cidadesBloqueadas)
      if (cidades.some((c) => bloqueadas.some((b) => c.includes(b) || b.includes(c)))) continue
      const aceitos = equivalencias.get(norm(rota.veiculo))
      const veiculoCompativel = !aceitos || aceitos.size === 0 || aceitos.has(norm(m.veiculo)) || norm(rota.veiculo) === norm(m.veiculo)
      if (p.exigirVeiculoCompativel && !veiculoCompativel) continue

      let pontos = 0
      if (cidades.some((c) => c.includes(norm(m.cidade)) || norm(m.cidade).includes(c))) {
        pontos += 4
        motivos.push('🏠 mora na cidade da rota')
      }
      const preferidas = listaDeTexto(m.cidadesPreferidas)
      if (cidades.some((c) => preferidas.some((f) => c.includes(f) || f.includes(c)))) {
        pontos += p.pesoCidadesPreferidas
        motivos.push('⭐ cidade preferida dele')
      }
      const exp = cidades.reduce((s, c) => s + (expPorMotorista.get(m.id)?.get(c) ?? 0), 0)
      if (exp > 0) {
        pontos += p.pesoExperienciaCidade * Math.min(1, exp / 8)
        motivos.push(`🏙️ ${exp}x nessa(s) cidade(s)`)
      }
      const repeticao = cidades.reduce((s, c) => s + (rodizioPorMotorista.get(m.id)?.get(c) ?? 0), 0)
      if (repeticao > 0) pontos -= p.pesoRodizio * Math.min(1, repeticao / Math.max(1, p.janelaRodizioDias))
      if (veiculoCompativel && aceitos && aceitos.size > 0) {
        pontos += 2
        motivos.push('🚐 veículo compatível')
      }
      pares.push({ rota, motorista: m, pontos, motivos })
    }
  }

  // Combinação gulosa: melhores pares primeiro, 1 rota por motorista.
  pares.sort((a, b) => b.pontos - a.pontos)
  const rotaPreenchida = new Set<string>()
  const motoristaUsado = new Set<string>()
  const resultado: AlocacaoRota[] = []
  for (const par of pares) {
    if (rotaPreenchida.has(par.rota.id) || motoristaUsado.has(par.motorista.id)) continue
    rotaPreenchida.add(par.rota.id)
    motoristaUsado.add(par.motorista.id)
    resultado.push({ rota: par.rota, motorista: par.motorista, motivos: par.motivos })
  }
  return resultado
}

export interface Aderencia {
  acertos: number
  total: number
  /** 0..1 — quando o dispatcher escolheu este driver, o sistema também escolheria. */
  taxa: number
}

/**
 * Mede a aderência histórica da sugestão automática: para cada dia com
 * programação no período, roda o motor e compara a sugestão de cada rota com a
 * decisão final que o dispatcher tomou. Atribui o acerto ao motorista final.
 * É o termômetro de quão confiável a automação já está, dado o histórico.
 */
export function aderenciaHistorica(
  db: DB,
  p: ParametrosAlocacao,
  dataMinima: string,
): Map<string, Aderencia> {
  const dias = [...new Set(db.programacao.filter((i) => i.data >= dataMinima).map((i) => i.data))].sort()
  const acc = new Map<string, { acertos: number; total: number }>()
  for (const dia of dias) {
    const sugestoes = sugerirAlocacao(db, dia, p)
    const sugeridoPorItem = new Map(sugestoes.map((s) => [s.item.id, s.motorista?.id ?? null]))
    for (const item of db.programacao.filter((i) => i.data === dia)) {
      if (!item.motoristaId) continue // sem vínculo: não dá para comparar
      const reg = acc.get(item.motoristaId) ?? { acertos: 0, total: 0 }
      reg.total++
      if (sugeridoPorItem.get(item.id) === item.motoristaId) reg.acertos++
      acc.set(item.motoristaId, reg)
    }
  }
  const resultado = new Map<string, Aderencia>()
  for (const [id, r] of acc) {
    resultado.set(id, { ...r, taxa: r.total ? r.acertos / r.total : 0 })
  }
  return resultado
}
