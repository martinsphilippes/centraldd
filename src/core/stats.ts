// Agregações usadas por dashboard e relatórios.

import type { Chamada, DB, Motorista, Resposta, StatusResposta } from './types'
import { STATUS_DISPONIVEIS } from './constants'
import { hojeISO } from './dates'
import { parametrosAtuais } from './alocacao'
import { comCreditoDeDiaDificil, fidelidadeDeTodos } from './dias-dificeis'
import { compararRodizio, distribuirPorFrota, frotaDoDia, historicoDeTrabalho, type DistribuicaoFrota } from './vagas'

export interface ResumoChamada {
  chamada: Chamada
  total: number
  respondidos: number
  pendentes: Motorista[]
  disponiveis: number
  indisponiveis: number
  porStatus: Record<StatusResposta, number>
}

/**
 * Respostas que valem para a chamada: as que o motorista deu na própria
 * chamada MAIS o que ele já tinha marcado na disponibilidade daquele dia — os dois
 * lados se alimentam, então quem se programou antes não precisa responder
 * de novo (e o Dispatcher consegue montar a planejamento).
 */
export function respostasDaChamada(db: DB, chamadaId: string): Resposta[] {
  const explicitas = db.respostas.filter((r) => r.chamadaId === chamadaId)
  const chamada = db.chamadas.find((c) => c.id === chamadaId)
  if (!chamada) return explicitas
  const jaResponderam = new Set(explicitas.map((r) => r.motoristaId))
  // Só entra quem está ativo e aprovado — cadastro inativo não vira número.
  const elegiveis = new Set(
    db.motoristas.filter((m) => m.ativo && m.aprovado !== false).map((m) => m.id),
  )
  const daDisponibilidade: Resposta[] = db.disponibilidade
    .filter(
      (a) =>
        a.data === chamada.data && !jaResponderam.has(a.motoristaId) && elegiveis.has(a.motoristaId),
    )
    .map((a) => ({
      id: `disponibilidade_${a.id}`,
      chamadaId,
      motoristaId: a.motoristaId,
      status: a.status,
      horario: a.horario,
      periodo: a.periodo,
      observacao: a.observacao ?? 'marcado na disponibilidade',
      respondidaEm: a.atualizadaEm,
    }))
  return [...explicitas, ...daDisponibilidade]
}

/** true = a "resposta" não foi dada na chamada; veio da disponibilidade do motorista. */
export function veioDaDisponibilidade(r: Resposta): boolean {
  return r.id.startsWith('disponibilidade_')
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
 * Sugestão automática de planejamento: disponíveis totais primeiro (melhor histórico primeiro),
 * depois parciais. Base para a futura "planejamento inteligente" por score.
 */
/**
 * Sugestão do planejamento: TODOS os disponíveis ranqueados pela
 * parametrização — os primeiros `qtdNecessaria` entram, o excedente vira a
 * fila de espera (pronto para substituir falta). Critérios, nesta ordem:
 * disponível cheio antes de parcial → crédito de dia difícil (quando ativo
 * para o dia) → fidelidade na janela → melhor histórico → quem respondeu antes.
 */
export function sugerirPlanejamento(
  db: DB,
  chamada: Chamada,
): { escolhidos: Motorista[]; espera: Motorista[]; frota: DistribuicaoFrota } {
  const respostas = respostasDaChamada(db, chamada.id)
  const hist = new Map(
    estatisticasMotoristas(db, '0000-01-01', '9999-12-31').map((e) => [e.motorista.id, e]),
  )
  const p = parametrosAtuais(db)
  const comCredito =
    p.limiarRotasPrioridadeDomingo > 0 &&
    p.pesoPrioridadeDomingo > 0 &&
    chamada.qtdNecessaria < p.limiarRotasPrioridadeDomingo
      ? comCreditoDeDiaDificil(db, chamada.data, p)
      : new Set<string>()
  // Fidelidade: desempata SEMPRE, não só no dia fraco. É o critério que
  // separa quem aparece todo dia de quem aparece só quando o dia é bom.
  const fidelidade =
    p.pesoFidelidade > 0
      ? fidelidadeDeTodos(db, chamada.data, p.janelaFidelidadeDias, p)
      : new Map<string, number>()
  // Rodízio: quem está há mais tempo sem trabalhar sobe na lista. É o que faz
  // a frota alternar quando há menos vaga que gente — sem isso, os mesmos
  // nomes entrariam todo dia e os outros nunca.
  const rodizio = p.rodizioPorVeiculo
    ? historicoDeTrabalho(db, chamada.data, hojeISO(-Math.max(1, p.janelaRodizioDias) * 4))
    : new Map()
  const peso = (s: StatusResposta) => (s === 'disponivel' ? 0 : STATUS_DISPONIVEIS.includes(s) ? 1 : 2)
  const candidatos = respostas
    .filter((r) => STATUS_DISPONIVEIS.includes(r.status))
    .sort((a, b) => {
      const pp = peso(a.status) - peso(b.status)
      if (pp !== 0) return pp
      const d = Number(comCredito.has(b.motoristaId)) - Number(comCredito.has(a.motoristaId))
      if (d !== 0) return d
      const fa = fidelidade.get(a.motoristaId) ?? 0
      const fb = fidelidade.get(b.motoristaId) ?? 0
      if (fb !== fa) return fb - fa
      if (p.rodizioPorVeiculo) {
        const rod = compararRodizio(a.motoristaId, b.motoristaId, rodizio)
        if (rod !== 0) return rod
      }
      const ha = hist.get(a.motoristaId)?.taxaDisponibilidade ?? 0
      const hb = hist.get(b.motoristaId)?.taxaDisponibilidade ?? 0
      if (hb !== ha) return hb - ha
      return a.respondidaEm.localeCompare(b.respondidaEm)
    })
  const porId = new Map(db.motoristas.map((m) => [m.id, m]))
  const ordenados = candidatos
    .map((r) => porId.get(r.motoristaId))
    .filter((m): m is Motorista => !!m)
  // A frota do dia manda no MIX: cada veículo só leva quantos couberem nas
  // vagas dele; o excedente vai para a fila de espera com a ordem preservada.
  const frota = distribuirPorFrota(
    p.respeitarFrotaDoDia ? frotaDoDia(db, chamada.data) : { vagas: [], livres: 0, total: 0, fonte: '', divergencia: '' },
    ordenados,
    chamada.qtdNecessaria,
    p,
  )
  return { escolhidos: frota.escolhidos, espera: frota.espera, frota }
}
