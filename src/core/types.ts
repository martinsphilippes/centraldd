// Entidades do domínio. Campos de expansão multi-tenant (transportadoraId, cdId)
// são opcionais e ignorados pela UI atual.

export type StatusResposta =
  | 'disponivel'
  | 'apos_horario'
  | 'meio_periodo'
  | 'indisponivel'
  | 'folga'
  | 'atestado'
  | 'ferias'
  | 'outro'

export type Periodo = 'manha' | 'tarde'

export interface Motorista {
  id: string
  nome: string
  telefone: string
  cidade: string
  equipe: string
  operacao: string
  veiculo: string
  ativo: boolean
  criadoEm: string
  transportadoraId?: string
  cdId?: string
}

export type StatusChamada = 'aberta' | 'encerrada'

export interface Chamada {
  id: string
  titulo: string
  data: string // YYYY-MM-DD
  operacao: string
  horarioInicio: string // HH:mm
  horarioFim: string // HH:mm
  qtdNecessaria: number
  status: StatusChamada
  criadaEm: string
  transportadoraId?: string
  cdId?: string
}

export interface Resposta {
  id: string
  chamadaId: string
  motoristaId: string
  status: StatusResposta
  horario?: string // para apos_horario
  periodo?: Periodo // para meio_periodo
  observacao?: string
  respondidaEm: string
}

export type StatusEscala = 'rascunho' | 'publicada' | 'concluida'

export interface Escala {
  id: string
  chamadaId: string
  nome: string
  data: string
  motoristaIds: string[]
  status: StatusEscala
  criadaEm: string
}

export interface Notificacao {
  id: string
  motoristaId: string | null // null = todos
  titulo: string
  mensagem: string
  lida: boolean
  criadaEm: string
}

export interface DB {
  motoristas: Motorista[]
  chamadas: Chamada[]
  respostas: Resposta[]
  escalas: Escala[]
  notificacoes: Notificacao[]
}

export type Papel = 'coordenador' | 'motorista'
