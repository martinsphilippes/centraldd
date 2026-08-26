// Horário de corte da disponibilidade.
//
// Regra: para dizer que está DISPONÍVEL num dia D, o motorista tem até
// `horarioCorteDisponibilidade` do dia (D − diasAntecedenciaCorte). Ex.: corte às 21:00
// com 1 dia de antecedência → a disponibilidade de amanhã fecha hoje às 21:00.
//
// Passado o prazo, só a declaração de DISPONIBILIDADE trava. Avisar que ficou
// indisponível (folga, atestado, férias, imprevisto) continua liberado a
// qualquer hora — segurar essa informação só prejudicaria a operação.
// O Dispatcher não é afetado: ele ajusta a disponibilidade de quem for preciso.

import type { ParametrosAlocacao } from './types'
import { formatarQuando, parseISODate } from './dates'

export interface PrazoDisponibilidade {
  /** Momento limite. null = nenhum corte configurado. */
  prazo: Date | null
  /** true = o prazo já passou e o dia não aceita mais "disponível". */
  encerrado: boolean
  /** "20/08/2026 às 21:00" — vazio quando não há corte. */
  texto: string
}

const SEM_CORTE: PrazoDisponibilidade = { prazo: null, encerrado: false, texto: '' }

export function prazoDisponibilidade(
  data: string,
  p: ParametrosAlocacao,
  agora: Date = new Date(),
): PrazoDisponibilidade {
  const horario = (p.horarioCorteDisponibilidade ?? '').trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(horario)
  if (!m || !data) return SEM_CORTE

  const limite = parseISODate(data)
  if (Number.isNaN(limite.getTime())) return SEM_CORTE
  limite.setDate(limite.getDate() - Math.max(0, p.diasAntecedenciaCorte ?? 0))
  limite.setHours(Number(m[1]), Number(m[2]), 0, 0)

  return {
    prazo: limite,
    encerrado: agora.getTime() > limite.getTime(),
    texto: formatarQuando(limite.toISOString()),
  }
}
