import type { Resposta } from '../core/types'
import { STATUS_RESPOSTA } from '../core/constants'
import { Badge } from './ui'

/** Renderização padronizada do status de uma resposta (com horário/período/observação). */
export function StatusPill({ resposta }: { resposta: Resposta }) {
  const info = STATUS_RESPOSTA[resposta.status]
  let detalhe = ''
  if (resposta.status === 'apos_horario' && resposta.horario) detalhe = ` após ${resposta.horario}`
  if (resposta.status === 'meio_periodo' && resposta.periodo)
    detalhe = ` (${resposta.periodo === 'manha' ? 'manhã' : 'tarde'})`
  return (
    <Badge className={info.cor}>
      <span>{info.emoji}</span>
      <span>
        {info.label}
        {detalhe}
      </span>
    </Badge>
  )
}
