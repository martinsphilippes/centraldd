// Agregações usadas por dashboard e relatórios.

import type { Chamada, DB, Motorista, Resposta, StatusResposta } from './types'
import { STATUS_DISPONIVEIS } from './constants'

export interface ResumoChamada {
  chamada: Chamada
  total: number
  respondidos: number
  pendentes: Motorista[]
  disponiveis: number
  indisponiveis: number
  porStatus: Record<StatusResposta, number>
}

export function respostasDaChamada(db: DB, chamadaId: string): Resposta[] {
  return db.respostas.filter((r) => r.chamadaId === chamadaId)
}

export function resumoChamada(db: DB, chamada: Chamada): ResumoChamada {
  const ativos = db.motoristas.filter((m) => m.ativo)
  const respostas = respostasDaChamada(db, chamada.id)
  const respondidosIds = new Set(respostas.map((r) => r.motoristaId))
  const porStatus = {} as Record<StatusResposta, number>
  for (const r of respostas) porStatus[r.status] = (porStatus[r.status] ?? 0) + 1
  const disponiveis = respostas.filter((r) => STATUS_DISPONIVEIS.includes(r.status)).length
  return {
    chamada,
    total: ativos.length,
    respondidos: respostas.length,
    pendentes: ativos.filter((m) => !respondidosIds.has(m.id)),
    disponiveis,
    indisponiveis: respostas.length - disponiveis,
    porStatus,
  }
}

export interface EstatisticaMotorista {
  motorista: Motorista
  totalChamadas: number
  respondidas: number
  disponiveis: number
  indisponiveis: number
  taxaResposta: number // 0..1
  taxaDisponibilidade: number // 0..1 sobre as respondidas
}

/** Estatística por motorista dentro de um intervalo de datas (inclusive). */
export function estatisticasMotoristas(db: DB, dataIni: string, dataFim: string): EstatisticaMotorista[] {
  const chamadas = db.chamadas.filter((c) => c.data >= dataIni && c.data <= dataFim)
  const ids = new Set(chamadas.map((c) => c.id))
  return db.motoristas
    .filter((m) => m.ativo)
    .map((motorista) => {
      const minhas = db.respostas.filter((r) => r.motoristaId === motorista.id && ids.has(r.chamadaId))
      const disponiveis = minhas.filter((r) => STATUS_DISPONIVEIS.includes(r.status)).length
      return {
        motorista,
        totalChamadas: chamadas.length,
        respondidas: minhas.length,
        disponiveis,
        indisponiveis: minhas.length - disponiveis,
        taxaResposta: chamadas.length ? minhas.length / chamadas.length : 0,
        taxaDisponibilidade: minhas.length ? disponiveis / minhas.length : 0,
      }
    })
}

export interface PontoDia {
  data: string
  disponiveis: number
  indisponiveis: number
  pendentes: number
}

/** Série diária de disponibilidade no intervalo (para gráficos e relatórios). */
export function serieDisponibilidade(db: DB, dataIni: string, dataFim: string): PontoDia[] {
  const chamadas = db.chamadas
    .filter((c) => c.data >= dataIni && c.data <= dataFim)
    .sort((a, b) => a.data.localeCompare(b.data))
  return chamadas.map((c) => {
    const r = resumoChamada(db, c)
    return {
      data: c.data,
      disponiveis: r.disponiveis,
      indisponiveis: r.indisponiveis,
      pendentes: r.pendentes.length,
    }
  })
}

/**
 * Sugestão automática de escala: disponíveis totais primeiro (melhor histórico primeiro),
 * depois parciais. Base para a futura "escala inteligente" por score.
 */
export function sugerirEscala(db: DB, chamada: Chamada): Motorista[] {
  const respostas = respostasDaChamada(db, chamada.id)
  const hist = new Map(
    estatisticasMotoristas(db, '0000-01-01', '9999-12-31').map((e) => [e.motorista.id, e]),
  )
  const peso = (s: StatusResposta) => (s === 'disponivel' ? 0 : STATUS_DISPONIVEIS.includes(s) ? 1 : 2)
  const candidatos = respostas
    .filter((r) => STATUS_DISPONIVEIS.includes(r.status))
    .sort((a, b) => {
      const p = peso(a.status) - peso(b.status)
      if (p !== 0) return p
      const ha = hist.get(a.motoristaId)?.taxaDisponibilidade ?? 0
      const hb = hist.get(b.motoristaId)?.taxaDisponibilidade ?? 0
      return hb - ha
    })
  const porId = new Map(db.motoristas.map((m) => [m.id, m]))
  return candidatos
    .map((r) => porId.get(r.motoristaId))
    .filter((m): m is Motorista => !!m)
    .slice(0, chamada.qtdNecessaria)
}
