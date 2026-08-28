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

/**
 * Veículos planejados para a data, na melhor fonte disponível.
 *
 * O RESUMO DO DIA manda: é o documento que o Dispatcher edita à mão, e cada
 * veículo dele precisa de um motorista. Conta os dois blocos — AM
 * (utilitários + VUC por transportadora, ou o TOTAL ROTAS informado à mão) e
 * MM (as quantidades de 3/4, TOCO, TRUCK, CARRETA). Qualquer edição no card
 * muda o limite na hora, porque a conta é feita a partir do documento salvo.
 */
function basePlanejada(db: DB, data: string): { base: number; fonte: string } {
  const resumo = db.resumos.find((r) => r.id === data)
  if (resumo) {
    const somaTransportadoras = resumo.transportadoras.reduce(
      (s, t) => s + num(t.utilitarios) + num(t.vuc),
      0,
    )
    // O TOTAL ROTAS digitado à mão sobrepõe a soma, igual ao card.
    const totalRotas = num(resumo.totalRotas ?? '') > 0 ? num(resumo.totalRotas ?? '') : somaTransportadoras
    const veiculosGrandes = resumo.mm.reduce((s, m) => s + num(m.quantidade), 0)
    const total = totalRotas + veiculosGrandes
    if (total > 0) {
      const partes = [`${totalRotas} do TOTAL ROTAS`]
      if (veiculosGrandes > 0) partes.push(`${veiculosGrandes} veículo(s) grande(s) do MM`)
      return { base: total, fonte: `resumo do dia — ${partes.join(' + ')}` }
    }
  }

  const daProgramacao = db.programacao.filter((p) => p.data === data).length
  if (daProgramacao > 0) return { base: daProgramacao, fonte: 'programação do Meli' }

  const rotasDoDia = db.rotas.filter((r) => r.data === data)
  if (rotasDoDia.length > 0) return { base: rotasDoDia.length, fonte: 'roteirização carregada' }
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
