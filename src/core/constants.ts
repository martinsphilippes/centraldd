import type { StatusResposta } from './types'

export interface StatusInfo {
  label: string
  emoji: string
  cor: string // classes tailwind do pill
  dot: string // cor sólida para gráficos
  disponibilidade: 'total' | 'parcial' | 'nenhuma'
}

export const STATUS_RESPOSTA: Record<StatusResposta, StatusInfo> = {
  disponivel: {
    label: 'Disponível',
    emoji: '🟢',
    cor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dot: '#10b981',
    disponibilidade: 'total',
  },
  apos_horario: {
    label: 'Disponível após horário',
    emoji: '🟡',
    cor: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: '#f59e0b',
    disponibilidade: 'parcial',
  },
  meio_periodo: {
    label: 'Apenas meio período',
    emoji: '🔵',
    cor: 'bg-orange-100 text-orange-900 border-orange-200',
    dot: '#3483fa',
    disponibilidade: 'parcial',
  },
  indisponivel: {
    label: 'Indisponível',
    emoji: '🔴',
    cor: 'bg-red-100 text-red-800 border-red-200',
    dot: '#ef4444',
    disponibilidade: 'nenhuma',
  },
  folga: {
    label: 'Folga',
    emoji: '🏖️',
    cor: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    dot: '#06b6d4',
    disponibilidade: 'nenhuma',
  },
  atestado: {
    label: 'Atestado',
    emoji: '🤒',
    cor: 'bg-orange-100 text-orange-800 border-orange-200',
    dot: '#f97316',
    disponibilidade: 'nenhuma',
  },
  ferias: {
    label: 'Férias',
    emoji: '✈️',
    cor: 'bg-violet-100 text-violet-800 border-violet-200',
    dot: '#8b5cf6',
    disponibilidade: 'nenhuma',
  },
  outro: {
    label: 'Outro motivo',
    emoji: '💬',
    cor: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: '#64748b',
    disponibilidade: 'nenhuma',
  },
}

/**
 * Opções que o motorista pode ESCOLHER. Os demais status do STATUS_RESPOSTA
 * (folga, férias, atestado, após horário, meio período) são legado: marcações
 * antigas ainda renderizam, mas ninguém marca mais.
 */
export const ORDEM_STATUS: StatusResposta[] = ['disponivel', 'indisponivel', 'outro']

/** Status que contam (total ou parcialmente) como disponíveis. */
export const STATUS_DISPONIVEIS: StatusResposta[] = ['disponivel', 'apos_horario', 'meio_periodo']

export const OPERACOES = ['📦 Mercado Livre', '📬 Coletas', '🔄 Reversa', '⚡ Same Day']

export const VEICULOS = ['Van', 'Fiorino', 'HR', 'Moto', 'Carro passeio']
