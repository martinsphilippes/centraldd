const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

/** YYYY-MM-DD do dia local (não UTC). */
export function hojeISO(offsetDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "13/08/2026" */
export function formatarData(iso: string): string {
  const d = parseISODate(iso)
  return d.toLocaleDateString('pt-BR')
}

/** "Quinta-feira • 13/08/2026" */
export function formatarDataLonga(iso: string): string {
  const d = parseISODate(iso)
  return `${DIAS[d.getDay()]} • ${d.toLocaleDateString('pt-BR')}`
}

/** "13/08 14:32" a partir de um ISO datetime. */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** "22/08/2026 às 18:43" — data e horário exatos de um ISO datetime. */
export function formatarQuando(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export function ehHoje(iso: string): boolean {
  return iso === hojeISO()
}

/** Rótulo amigável: Hoje / Amanhã / data longa. */
export function rotuloDia(iso: string): string {
  if (iso === hojeISO()) return `Hoje • ${formatarData(iso)}`
  if (iso === hojeISO(1)) return `Amanhã • ${formatarData(iso)}`
  return formatarDataLonga(iso)
}
