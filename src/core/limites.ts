// Limite de disponíveis do dia = o que vem do PLANEJAMENTO + a reserva
// parametrizada pelo dispatcher. Um limite manual, quando existe, manda.

import type { DB, ParametrosAlocacao } from './types'

export interface LimiteDoDia {
  /** null = sem limite (nada planejado e sem limite manual). */
  limite: number | null
  /** Rotas planejadas que serviram de base. */
  base: number
  /** De onde veio a base ('' quando não há planejamento). */
  fonte: string
  /** Reserva somada à base (percentual + fixa). */
  reserva: number
  origem: 'manual' | 'automatico' | 'sem-limite'
}

const num = (s: string) => Number(String(s).replace(/\D/g, '')) || 0

/** Rotas planejadas para a data, na melhor fonte disponível. */
function basePlanejada(db: DB, data: string): { base: number; fonte: string } {
  const daProgramacao = db.programacao.filter((p) => p.data === data).length
  if (daProgramacao > 0) return { base: daProgramacao, fonte: 'programação do Meli' }

  const resumo = db.resumos.find((r) => r.id === data)
  if (resumo) {
    const doResumo = resumo.transportadoras.reduce(
      (s, t) => s + num(t.utilitarios) + num(t.vuc),
      0,
    )
    if (doResumo > 0) return { base: doResumo, fonte: 'TOTAL ROTAS do resumo do dia' }
  }

  if (db.rotas.length > 0) return { base: db.rotas.length, fonte: 'roteirização carregada' }
  return { base: 0, fonte: '' }
}

export function calcularLimiteDoDia(
  db: DB,
  data: string,
  p: ParametrosAlocacao,
): LimiteDoDia {
  const { base, fonte } = basePlanejada(db, data)
  const manual = db.limites.find((l) => l.data === data)
  const reserva = base > 0 ? Math.ceil((base * (p.limiteFolgaPercentual || 0)) / 100) + (p.limiteFolgaFixa || 0) : 0

  if (manual) {
    return { limite: manual.maxDisponiveis, base, fonte, reserva, origem: 'manual' }
  }
  if (p.limiteAutomatico && base > 0) {
    return { limite: base + reserva, base, fonte, reserva, origem: 'automatico' }
  }
  return { limite: null, base, fonte, reserva, origem: 'sem-limite' }
}
