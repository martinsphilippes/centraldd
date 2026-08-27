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
  operacao: string
  veiculo: string
  ativo: boolean
  /** false = pré-cadastro aguardando aprovação do dispatcher (ausente = aprovado). */
  aprovado?: boolean
  /**
   * Papel solicitado no pré-cadastro. 'dispatcher' só é aprovado pelo DONO
   * da operação; 'motorista' qualquer dispatcher aprova.
   * ('coordenador' é o valor legado gravado antes da renomeação.)
   */
  funcao?: 'motorista' | 'dispatcher' | 'coordenador'
  /** Cidades onde este motorista rende melhor (separadas por vírgula). */
  cidadesPreferidas?: string
  /** Cidades marcadas como "Posso fazer" pelo motorista (lista separada por vírgula). */
  cidadesPossiveis?: string
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

export type StatusPlanejamento = 'rascunho' | 'publicada' | 'concluida'

export interface Planejamento {
  id: string
  chamadaId: string
  nome: string
  data: string
  motoristaIds: string[]
  status: StatusPlanejamento
  criadaEm: string
}

/** Disponibilidade marcada pelo próprio motorista para uma data específica. */
export interface DiaDisponibilidade {
  id: string // `${motoristaId}_${data}`
  motoristaId: string
  data: string // YYYY-MM-DD
  status: StatusResposta
  horario?: string
  periodo?: Periodo
  observacao?: string
  atualizadaEm: string
}

/**
 * Rota da operação (importada da planilha de rotas ou cadastrada à mão).
 * Os campos vindos da planilha são preservados como texto, exatamente como estão lá.
 */
export interface Rota {
  id: string
  cidade: string
  rotaExpedicao: string
  rotaOriginal: string
  base: string
  veiculo: string
  km: string
  dps: string
  ocupacao: string
  transportadora: string
  /** Motorista direcionado para esta rota (null = sem motorista definido). */
  motoristaId: string | null
  /** Quando o motorista marcou a rota como finalizada (null = em andamento). */
  finalizadaEm?: string | null
  /**
   * Como a rota foi encerrada: ausente/'entregue' = o motorista finalizou;
   * 'pendente' = o Dispatcher encerrou sem o motorista concluir (ficaram
   * entregas pendentes registradas).
   */
  resultadoFinalizacao?: 'entregue' | 'pendente' | null
  atualizadaEm: string
}

/**
 * Item da programação diária enviada pelo Meli (uma linha da planilha do dia).
 * Guarda o plano original (driverPlanejado) e a decisão final do dispatcher
 * (driverFinal/motoristaId) — a diferença entre os dois é a intervenção,
 * que alimenta a medição de rodízio e a futura parametrização automática.
 */
export interface ProgramacaoItem {
  id: string
  data: string // YYYY-MM-DD
  rota: string
  cidade: string
  veiculo: string
  onda: string
  doca: string
  /** Driver que veio na planilha do Meli (texto original). */
  driverPlanejado: string
  /** Driver definido pelo dispatcher (começa igual ao planejado). */
  driverFinal: string
  /** Vínculo com o cadastro, quando identificado. */
  motoristaId: string | null
  atualizadaEm: string
}

/**
 * Parâmetros da sugestão automática de alocação — todos ajustáveis pelo
 * dispatcher na tela de Programação (⚙️ Parâmetros). Pesos de 0 a 10.
 */
export interface ParametrosAlocacao {
  id: string // sempre 'alocacao'
  /** Quantos dias de histórico considerar (0 = tudo). */
  janelaHistoricoDias: number
  /** Valoriza quem mais conhece a(s) cidade(s) da rota. */
  pesoExperienciaCidade: number
  /** Valoriza quem já fez exatamente essa rota. */
  pesoExperienciaRota: number
  /** Valoriza manter o driver que veio no plano do Meli. */
  pesoRespeitarPlanoMeli: number
  /** Valoriza cidades marcadas como preferidas no cadastro do motorista. */
  pesoCidadesPreferidas: number
  /** Bônus menor para cidade que o motorista marcou como "Posso fazer". */
  pesoCidadePossivel: number
  /** Penaliza quem foi muitas vezes à mesma cidade recentemente (força o rodízio). */
  pesoRodizio: number
  /** Janela (dias) usada para medir a repetição do rodízio. */
  janelaRodizioDias: number
  /** Trava: depois de N dias seguidos na mesma cidade, o motorista é excluído dela (0 = desligado). */
  maxVezesSeguidasMesmaCidade: number
  /** Só sugere quem marcou disponibilidade na disponibilidade do dia. */
  exigirDisponibilidadeMarcada: boolean
  /** Bônus para quem marcou disponibilidade (quando não é obrigatório). */
  bonusDisponivelMarcado: number
  /** Só sugere motorista com veículo compatível com o da rota. */
  exigirVeiculoCompativel: boolean
  /** Equivalências "veículo da rota = veículos do cadastro", uma por linha. Ex.: VUC = HR, Van */
  equivalenciasVeiculo: string
  /** Auto-alocação: aplica sozinho as sugestões com confiança ≥ este % (0 = desligado). */
  autoAplicarAcimaDe: number
  /**
   * Máximo de dias FUTUROS que o motorista pode deixar marcados como disponível
   * na disponibilidade (0 = sem limite). Trabalhou um dia → a data passa → libera vaga.
   */
  maxDiasDisponiveis: number
  /** Horário limite para declarar disponibilidade ('' = sem corte). Ex.: '21:00'. */
  horarioCorteDisponibilidade: string
  /** Quantos dias antes do dia trabalhado o corte acontece (1 = na véspera). */
  diasAntecedenciaCorte: number
  /** Calcular o limite de disponíveis do dia a partir do planejamento. */
  limiteAutomatico: boolean
  /** Reserva em % sobre as rotas planejadas (ex.: 10 = 10% a mais). */
  limiteFolgaPercentual: number
  /** Reserva fixa somada ao limite (ex.: 2 motoristas de retaguarda). */
  limiteFolgaFixa: number
  atualizadoEm: string
}

/** Linha do desdobramento AM por transportadora no resumo do dia. */
export interface ResumoTransportadora {
  nome: string
  utilitarios: string
  vuc: string
}

/** Linha da seção MM (veículos grandes) no resumo do dia. */
export interface ResumoMM {
  tipo: string
  quantidade: string
  posicoesPorUnidade: string
}

/** Resumo operacional do dia (o "card" do dispatcher: pacotes, veículos, rotas, posições). */
export interface ResumoDia {
  id: string // = data (YYYY-MM-DD)
  data: string
  base: string
  sprReferencia: string
  pacotes: string
  veiculosDiv: string
  /** true = AM (Utilitários/VUC) contado automaticamente da programação do Meli. */
  amAutomatico?: boolean
  transportadoras: ResumoTransportadora[]
  mm: ResumoMM[]
  /** Total de rotas informado à mão (vazio = somado das transportadoras). */
  totalRotas?: string
  /** Total de posições informado à mão (vazio = calculado pelas quantidades). */
  posicoesTotal?: string
  atualizadoEm: string
}

/** Limite de motoristas disponíveis definido pelo dispatcher para uma data. */
export interface LimiteDia {
  id: string // = data (YYYY-MM-DD)
  data: string
  maxDisponiveis: number
  atualizadoEm: string
}

/**
 * Estrutura do modelo do resumo APRENDIDA com as correções manuais de cada
 * base: quais transportadoras existem e quantas posições cada veículo do MM
 * tem. Guarda só a ESTRUTURA — números do dia nunca são reaproveitados.
 */
export interface ModeloAprendido {
  id: string
  base: string
  transportadoras: string[]
  mm: { tipo: string; posicoesPorUnidade: string }[]
  atualizadoEm: string
}

/**
 * Opção de cadastro mantida pelo dispatcher (veículos e operações). É o que
 * aparece nas listas do formulário de cadastro e do cadastro de motorista.
 */
export interface TipoOperacional {
  id: string
  categoria: 'veiculo' | 'operacao'
  nome: string
  criadoEm: string
}

/** Cidade que a operação atende — a lista é mantida pelo dispatcher. */
export interface CidadeOperacao {
  id: string
  nome: string
  criadaEm: string
}

export interface Notificacao {
  id: string
  motoristaId: string | null // null = todos
  titulo: string
  mensagem: string
  /** Chamada que originou o aviso — excluir a chamada limpa os avisos dela. */
  chamadaId?: string | null
  lida: boolean
  criadaEm: string
}

export interface DB {
  motoristas: Motorista[]
  chamadas: Chamada[]
  respostas: Resposta[]
  planejamento: Planejamento[]
  disponibilidade: DiaDisponibilidade[]
  limites: LimiteDia[]
  rotas: Rota[]
  programacao: ProgramacaoItem[]
  resumos: ResumoDia[]
  config: ParametrosAlocacao[]
  cidades: CidadeOperacao[]
  tipos: TipoOperacional[]
  perfis: Perfil[]
  modelos: ModeloAprendido[]
  notificacoes: Notificacao[]
}

/** Papel da conta. 'coordenador' era o nome antigo de dispatcher — ver core/papel.ts. */
export type Papel = 'dispatcher' | 'motorista'

/** Conta com acesso ao app: define o papel e o cadastro vinculado. */
export interface Perfil {
  id: string
  papel: Papel
  motoristaId?: string | null
  email?: string
}
