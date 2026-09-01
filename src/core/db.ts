// Camada de dados sobre o Firestore (tempo real).
// A UI continua usando useDB()/getDB() e as operações de domínio abaixo —
// os listeners onSnapshot mantêm o estado local sincronizado com o banco
// central, então qualquer alteração aparece em todos os aparelhos na hora.

import { useSyncExternalStore } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from './firebase'
import { normalizarTexto, parecidoCom } from './texto'
import { chaveNumeracao } from './conferencia'
import { nomeOficialVeiculo } from './veiculos'
import type {
  DB,
  SugestaoMelhoria,
  Chamada,
  CidadeOperacao,
  TipoOperacional,
  DiaDisponibilidade,
  Planejamento,
  Motorista,
  Notificacao,
  ParametrosAlocacao,
  ProgramacaoItem,
  Resposta,
  ResumoDia,
  Conferencia,
  Rota,
} from './types'

const VAZIO: DB = {
  motoristas: [],
  chamadas: [],
  respostas: [],
  planejamento: [],
  disponibilidade: [],
  limites: [],
  rotas: [],
  programacao: [],
  resumos: [],
  config: [],
  cidades: [],
  tipos: [],
  perfis: [],
  modelos: [],
  notificacoes: [],
  conferencias: [],
  sugestoes: [],
}

let state: DB = VAZIO
let carregado = false
const listeners = new Set<() => void>()
const unsubs: Unsubscribe[] = []

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getDB(): DB {
  return state
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB)
}

/** true depois que todas as coleções chegaram do servidor pela primeira vez. */
export function useDBCarregado(): boolean {
  return useSyncExternalStore(subscribe, () => carregado)
}

type Linha = { id: string } & Record<string, unknown>

/**
 * Liga os listeners de tempo real (chamado após o login).
 *
 * `ehDispatcher` não é enfeite: 'sugestoes' só é ouvida por ele. A sugestão de
 * um motorista não pode chegar ao aparelho de outro, e as regras do Firestore
 * recusam essa leitura — ouvir a coleção como motorista daria erro de
 * permissão a cada abertura do app.
 */
export function iniciarSincronizacao(ehDispatcher: boolean) {
  if (unsubs.length > 0) return
  const colecoes: (keyof DB)[] = [
    'motoristas',
    'chamadas',
    'respostas',
    'planejamento',
    'disponibilidade',
    'limites',
    'rotas',
    'programacao',
    'resumos',
    'config',
    'cidades',
    'tipos',
    'perfis',
    'modelos',
    'notificacoes',
    'conferencias',
    ...(ehDispatcher ? (['sugestoes'] as const) : []),
  ]
  const chegaram = new Set<string>()
  for (const nome of colecoes) {
    unsubs.push(
      onSnapshot(collection(firestore, nome), (snap) => {
        const linhas: Linha[] = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        state = { ...state, [nome]: linhas }
        chegaram.add(nome)
        if (chegaram.size === colecoes.length) carregado = true
        emit()
      }),
    )
  }
}

/** Desliga os listeners e limpa o estado (chamado no logout). */
export function pararSincronizacao() {
  for (const u of unsubs) u()
  unsubs.length = 0
  state = VAZIO
  carregado = false
  emit()
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ---- Operações de domínio (gravam no Firestore; o snapshot atualiza a UI) ----

export function salvarMotorista(m: Motorista) {
  // A grafia oficial é gravada sempre: sem isto, 'Utilitario' e 'Utilitário'
  // viram dois veículos diferentes nas listas e no seletor do cadastro.
  void setDoc(doc(firestore, 'motoristas', m.id), {
    ...m,
    veiculo: nomeOficialVeiculo(m.veiculo, state),
  })
}

/**
 * O MOTORISTA salva as próprias preferências de cidade. Só esses campos
 * mudam — é o que as regras de segurança permitem para a conta dele.
 * Bloqueio de cidade NÃO está aqui: quem restringe é o Dispatcher.
 */
export function salvarPreferenciasCidades(
  motoristaId: string,
  cidadesPreferidas: string,
  cidadesPossiveis: string,
) {
  updateDoc(doc(firestore, 'motoristas', motoristaId), {
    cidadesPreferidas,
    cidadesPossiveis,
  }).catch(() => {
    alert('❌ Não consegui salvar suas cidades. Tente de novo; se continuar, avise o Dispatcher.')
  })
}

/** Resultado do cadastro em lote, para o dispatcher conferir o que aconteceu. */
export interface ResultadoImportacaoMotoristas {
  criados: number
  atualizados: number
  comLogin: number
  erros: { linha: number; nome: string; motivo: string }[]
}

const ERROS_CONTA: Record<string, string> = {
  'auth/email-already-in-use': 'e-mail já tem conta — cadastro salvo sem criar login',
  'auth/invalid-email': 'e-mail inválido — cadastro salvo sem login',
  'auth/weak-password': 'senha com menos de 6 caracteres — cadastro salvo sem login',
}

/**
 * Cadastro de motoristas em lote a partir da planilha.
 *
 * Não duplica: quem já existe (mesmo telefone, ou mesmo nome quando não há
 * telefone) é ATUALIZADO, e campo em branco na planilha não apaga o que já
 * estava salvo. Com e-mail e senha na linha, cria também o login — e aí o id
 * do cadastro passa a ser o uid da conta, como no cadastro manual.
 */
export async function importarMotoristas(
  linhas: import('./planilha').MotoristaImportado[],
): Promise<ResultadoImportacaoMotoristas> {
  const r: ResultadoImportacaoMotoristas = { criados: 0, atualizados: 0, comLogin: 0, erros: [] }
  const agora = new Date().toISOString()
  const chaveNome = (n: string) => normalizarTexto(n)

  for (const linha of linhas) {
    // Procura sempre no estado mais recente: duas linhas da mesma pessoa na
    // planilha caem no mesmo cadastro em vez de virarem dois.
    const anterior =
      (linha.telefone && state.motoristas.find((m) => m.telefone === linha.telefone)) ||
      state.motoristas.find((m) => chaveNome(m.nome) === chaveNome(linha.nome))

    let id = anterior?.id ?? uid()
    let criouLogin = false
    if (!anterior && linha.email && linha.senha) {
      try {
        const { criarContaMotorista, salvarPerfilMotorista } = await import('./firebase')
        id = await criarContaMotorista(linha.email, linha.senha)
        await salvarPerfilMotorista(id, linha.email)
        criouLogin = true
      } catch (err) {
        const codigo = (err as { code?: string }).code ?? ''
        r.erros.push({
          linha: linha.linha,
          nome: linha.nome,
          motivo: ERROS_CONTA[codigo] ?? `não consegui criar o login (${codigo || 'erro'})`,
        })
      }
    }

    // Valor em branco na planilha preserva o que já estava no cadastro.
    const ou = (novo: string, velho?: string) => (novo.trim() ? novo.trim() : velho ?? '')
    const motorista: Motorista = {
      ...anterior,
      id,
      nome: linha.nome,
      telefone: ou(linha.telefone, anterior?.telefone),
      cidade: ou(linha.cidade, anterior?.cidade),
      operacao: ou(linha.operacao, anterior?.operacao),
      veiculo: nomeOficialVeiculo(ou(linha.veiculo, anterior?.veiculo), state),
      ativo: linha.ativo,
      // Cadastro feito pelo Dispatcher já nasce aprovado.
      aprovado: anterior?.aprovado ?? true,
      cidadesPreferidas: ou(linha.cidadesPreferidas, anterior?.cidadesPreferidas),
      criadoEm: anterior?.criadoEm ?? agora,
    }
    try {
      await setDoc(doc(firestore, 'motoristas', id), motorista)
      if (anterior) r.atualizados++
      else r.criados++
      if (criouLogin) r.comLogin++
    } catch {
      r.erros.push({ linha: linha.linha, nome: linha.nome, motivo: 'não consegui salvar o cadastro' })
    }
  }
  return r
}

// ---- Conferência de pacotes ----

/** O DISPATCHER cria/atualiza a conferência (a lista do que deve sair). */
export function salvarConferencia(c: Conferencia) {
  // O Firestore rejeita undefined: campo opcional ausente sai do documento.
  const dados = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined))
  void setDoc(doc(firestore, 'conferencias', c.id), dados)
}

export function removerConferencia(id: string) {
  void deleteDoc(doc(firestore, 'conferencias', id))
}

/**
 * O MOTORISTA edita os próprios dados de contato — só os campos que as
 * regras de segurança liberam para a conta dele.
 */
export function salvarMeuPerfilMotorista(
  motoristaId: string,
  // Sem a cidade de propósito: quem escolhe cidade é a tela Cidades, pela
  // preferência (⭐ Prefiro / 👍 Posso), e a cidade-base do cadastro é do
  // Dispatcher. Mandar daqui sobrescreveria uma das duas.
  dados: { nome: string; telefone: string; veiculo: string },
) {
  return updateDoc(doc(firestore, 'motoristas', motoristaId), {
    ...dados,
    veiculo: nomeOficialVeiculo(dados.veiculo, state),
  })
}

/** O DISPATCHER tira UMA numeração da conferência (pacote fora da carga). */
export function removerPacoteConferencia(id: string, numeracao: string) {
  const c = state.conferencias.find((x) => x.id === id)
  if (!c) return
  const chave = chaveNumeracao(numeracao)
  void updateDoc(doc(firestore, 'conferencias', id), {
    esperados: c.esperados.filter((v) => chaveNumeracao(v) !== chave),
    pacotes: (c.pacotes ?? []).filter((p) => chaveNumeracao(p.numeracao) !== chave),
  })
}

/** O MOTORISTA registra o andamento do roteiro (entregues + próxima escolhida). */
export function salvarRoteiroConferencia(
  id: string,
  roteiro: {
    entregues: string[]
    proximaId: string | null
    seguir?: 'otimizada' | 'meli'
    avisoFechamentoMin?: number
    priorizarComercio?: boolean
  },
) {
  updateDoc(doc(firestore, 'conferencias', id), {
    roteiro: { ...roteiro, atualizadoEm: new Date().toISOString() },
  }).catch(() => {
    alert('❌ Não consegui salvar o andamento. Tente de novo; se continuar, avise o Dispatcher.')
  })
}

/** O MOTORISTA limpa a conferência da tela dele — o histórico não muda. */
export function ocultarConferenciaMotorista(id: string) {
  updateDoc(doc(firestore, 'conferencias', id), { ocultaMotorista: true }).catch(() => {
    alert('❌ Não consegui tirar da tela. Tente de novo; se continuar, avise o Dispatcher.')
  })
}

/** Traz de volta uma conferência que o motorista tinha tirado da tela dele. */
export function mostrarConferenciaMotorista(id: string) {
  updateDoc(doc(firestore, 'conferencias', id), { ocultaMotorista: false }).catch(() => {
    alert('❌ Não consegui trazer de volta. Tente de novo; se continuar, avise o Dispatcher.')
  })
}

/**
 * O MOTORISTA apaga o arquivo que enviou — é o conserto de quem subiu o CSV
 * errado. A conferência CONTINUA na tela dele, voltando ao estado de quem
 * ainda não enviou, com o botão de enviar de novo à mão. O resultado errado
 * também sai da tela do Dispatcher, que é o certo: leitura errada não pode
 * ficar valendo como conferência.
 */
export function limparEnvioConferenciaMotorista(id: string) {
  updateDoc(doc(firestore, 'conferencias', id), {
    conferidos: null,
    arquivoMotorista: '',
    conferidaEm: null,
  }).catch(() => {
    alert('❌ Não consegui limpar seu envio. Tente de novo; se continuar, avise o Dispatcher.')
  })
}

/**
 * O MOTORISTA envia a lista dele. Só esses campos mudam — é o que as
 * regras de segurança permitem para a conta dele.
 */
export function enviarConferenciaMotorista(id: string, conferidos: string[], arquivo: string) {
  updateDoc(doc(firestore, 'conferencias', id), {
    conferidos,
    arquivoMotorista: arquivo,
    conferidaEm: new Date().toISOString(),
  }).catch(() => {
    alert('❌ Não consegui enviar sua conferência. Tente de novo; se continuar, avise o Dispatcher.')
  })
}

export function removerMotorista(id: string) {
  void deleteDoc(doc(firestore, 'motoristas', id))
}

export function salvarChamada(c: Chamada) {
  void setDoc(doc(firestore, 'chamadas', c.id), c)
}

/**
 * Exclui a chamada E o que nasceu dela (respostas e planejamento vinculada),
 * para não sobrar registro órfão. A disponibilidade dos motoristas fica — é o
 * histórico deles, independente da chamada.
 */
export function removerChamada(id: string) {
  for (const r of state.respostas.filter((x) => x.chamadaId === id)) {
    void deleteDoc(doc(firestore, 'respostas', r.id))
  }
  for (const e of state.planejamento.filter((x) => x.chamadaId === id)) {
    void deleteDoc(doc(firestore, 'planejamento', e.id))
  }
  // Os avisos que a chamada gerou somem da tela dos motoristas junto com ela.
  for (const n of state.notificacoes.filter((x) => x.chamadaId === id)) {
    void deleteDoc(doc(firestore, 'notificacoes', n.id))
  }
  void deleteDoc(doc(firestore, 'chamadas', id))
}

/** Registra ou atualiza a resposta (id determinístico garante 1 por motorista/chamada). */
export function responderChamada(r: Omit<Resposta, 'id' | 'respondidaEm'>) {
  const id = `${r.chamadaId}_${r.motoristaId}`
  const dados: Record<string, unknown> = {
    id,
    chamadaId: r.chamadaId,
    motoristaId: r.motoristaId,
    status: r.status,
    respondidaEm: new Date().toISOString(),
  }
  // Firestore não aceita undefined — só inclui os complementos preenchidos.
  if (r.horario !== undefined) dados.horario = r.horario
  if (r.periodo !== undefined) dados.periodo = r.periodo
  if (r.observacao !== undefined) dados.observacao = r.observacao
  // Falha (ex.: permissão) aparece na hora — nunca "clicar e não acontecer nada".
  setDoc(doc(firestore, 'respostas', id), dados).catch(() => {
    alert('❌ Não consegui registrar sua resposta. Tente de novo; se continuar, avise o Dispatcher.')
  })
  // A resposta também preenche a DISPONIBILIDADE daquele dia: no fluxo
  // "programação primeiro", quem responde à chamada já fica com a data
  // marcada — um lado alimenta o outro sem digitar duas vezes.
  const chamada = state.chamadas.find((c) => c.id === r.chamadaId)
  if (chamada) {
    salvarDiaDisponibilidade({
      motoristaId: r.motoristaId,
      data: chamada.data,
      status: r.status,
      horario: r.horario,
      periodo: r.periodo,
      observacao: r.observacao,
    })
  }
}

/** Marca a disponibilidade de uma data na disponibilidade (1 registro por motorista/data). */
export function salvarDiaDisponibilidade(d: Omit<DiaDisponibilidade, 'id' | 'atualizadaEm'>) {
  const id = `${d.motoristaId}_${d.data}`
  const dados: Record<string, unknown> = {
    id,
    motoristaId: d.motoristaId,
    data: d.data,
    status: d.status,
    atualizadaEm: new Date().toISOString(),
  }
  if (d.horario !== undefined) dados.horario = d.horario
  if (d.periodo !== undefined) dados.periodo = d.periodo
  if (d.observacao !== undefined) dados.observacao = d.observacao
  setDoc(doc(firestore, 'disponibilidade', id), dados).catch(() => {
    alert('❌ Não consegui salvar sua disponibilidade. Tente de novo; se continuar, avise o Dispatcher.')
  })
}

export function removerDiaDisponibilidade(id: string) {
  void deleteDoc(doc(firestore, 'disponibilidade', id))
}

/** Define o limite de disponíveis de uma data (id do doc = a própria data). */
export function salvarLimiteDia(data: string, maxDisponiveis: number) {
  void setDoc(doc(firestore, 'limites', data), {
    id: data,
    data,
    maxDisponiveis,
    atualizadoEm: new Date().toISOString(),
  })
}

export function removerLimiteDia(data: string) {
  void deleteDoc(doc(firestore, 'limites', data))
}

export function salvarRota(r: Rota) {
  void setDoc(doc(firestore, 'rotas', r.id), { ...r, atualizadaEm: new Date().toISOString() })
}

export function removerRota(id: string) {
  void deleteDoc(doc(firestore, 'rotas', id))
}

/**
 * O MOTORISTA marca a própria rota como finalizada. Só esse campo muda —
 * é o que as regras de segurança permitem para a conta do motorista.
 * Finalizar libera o motorista para novas rotas e para entrar em planejamento.
 */
export function finalizarRota(id: string) {
  updateDoc(doc(firestore, 'rotas', id), { finalizadaEm: new Date().toISOString() }).catch(() => {
    alert('❌ Não consegui finalizar a rota. Tente de novo; se continuar, avise o Dispatcher.')
  })
}

/** true = o motorista tem rota direcionada ainda NÃO finalizada (pendência). */
export function temRotaPendente(rotas: Rota[], motoristaId: string): boolean {
  return rotas.some((r) => r.motoristaId === motoristaId && !r.finalizadaEm)
}

export function salvarResumoDia(r: ResumoDia) {
  // O Firestore rejeita undefined: campos opcionais em branco viram ''.
  const dados: Record<string, unknown> = { ...r, atualizadoEm: new Date().toISOString() }
  for (const chave of Object.keys(dados)) {
    if (dados[chave] === undefined) dados[chave] = ''
  }
  setDoc(doc(firestore, 'resumos', r.id), dados).catch(() => {
    alert('❌ Não consegui salvar o resumo. Tente de novo em instantes.')
  })
}

export function removerResumoDia(id: string) {
  void deleteDoc(doc(firestore, 'resumos', id))
}

/**
 * Guarda o texto bruto da última leitura de arquivo para diagnóstico: quando
 * uma importação "não funciona" no aparelho, dá para ver exatamente o que o
 * app recebeu lá — sem depender de print do usuário.
 */
export function registrarDiagnosticoLeitura(origem: string, texto: string, info: Record<string, unknown> = {}) {
  // Um registro por ORIGEM: a leitura das rotas não apaga a do modelo.
  const id = `ultima-leitura-${origem}`
  void setDoc(doc(firestore, 'diagnosticos', id), {
    id,
    origem,
    texto: texto.slice(0, 40000),
    build: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '?',
    aparelho: typeof navigator !== 'undefined' ? navigator.userAgent : '?',
    ...info,
    registradoEm: new Date().toISOString(),
  }).catch(() => {})
}

/**
 * O MOTORISTA envia uma sugestão de melhoria do app. Só ele cria; a leitura é
 * do Dispatcher (as regras do Firestore garantem os dois lados).
 */
export function enviarSugestao(motoristaId: string, texto: string): Promise<void> {
  const id = `${motoristaId}_${Date.now().toString(36)}`
  const sugestao: SugestaoMelhoria = {
    id,
    motoristaId,
    texto: texto.trim().slice(0, 4000),
    criadaEm: new Date().toISOString(),
    lidaEm: null,
  }
  return setDoc(doc(firestore, 'sugestoes', id), sugestao)
}

/** Carimba a sugestão como lida quando o Dispatcher a abre. */
export function marcarSugestaoLida(id: string) {
  void updateDoc(doc(firestore, 'sugestoes', id), { lidaEm: new Date().toISOString() }).catch(() => {})
}

/** Apaga uma sugestão já tratada. */
export function removerSugestao(id: string) {
  void deleteDoc(doc(firestore, 'sugestoes', id))
}

/** Cidades atendidas pela operação — mantidas pelo dispatcher. */
export function salvarCidadeOperacao(nome: string) {
  const limpo = nome.trim()
  if (!limpo) return
  const id = limpo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const cidade: CidadeOperacao = { id, nome: limpo, criadaEm: new Date().toISOString() }
  void setDoc(doc(firestore, 'cidades', id), cidade)
}

/** Opções de cadastro (veículos e operações) mantidas pelo dispatcher. */
export function salvarTipoOperacional(categoria: 'veiculo' | 'operacao', nome: string) {
  const limpo = nome.trim()
  if (!limpo) return
  const id = `${categoria}-${normalizarTexto(limpo).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  const tipo: TipoOperacional = { id, categoria, nome: limpo, criadoEm: new Date().toISOString() }
  void setDoc(doc(firestore, 'tipos', id), tipo)
}

export function removerTipoOperacional(id: string) {
  void deleteDoc(doc(firestore, 'tipos', id))
}

export function removerCidadeOperacao(id: string) {
  void deleteDoc(doc(firestore, 'cidades', id))
}


export function salvarParametrosAlocacao(p: ParametrosAlocacao) {
  void setDoc(doc(firestore, 'config', 'alocacao'), { ...p, id: 'alocacao', atualizadoEm: new Date().toISOString() })
}

export function salvarProgramacaoItem(p: ProgramacaoItem) {
  void setDoc(doc(firestore, 'programacao', p.id), { ...p, atualizadaEm: new Date().toISOString() })
}

export function removerProgramacaoItem(id: string) {
  void deleteDoc(doc(firestore, 'programacao', id))
}

/**
 * Importa rotas em lote. O id vem da "Rota expedição" (única por planilha):
 * reimportar a mesma planilha ATUALIZA as rotas existentes em vez de duplicar,
 * preservando o motorista já direcionado em cada uma.
 */
export async function importarRotas(
  novas: Omit<Rota, 'id' | 'data' | 'motoristaId' | 'atualizadaEm'>[],
  data: string,
) {
  const agora = new Date().toISOString()
  const existentes = new Map(state.rotas.map((r) => [r.id, r]))
  // Cidade lida por OCR converge para a grafia oficial da operação
  // ("tuiutaba" → "Ituiutaba"): é ela que casa com as preferências.
  const cidadeOficial = (lida: string): string => {
    if (!lida.trim()) return lida
    const igual = state.cidades.find((c) => normalizarTexto(c.nome) === normalizarTexto(lida))
    if (igual) return igual.nome
    const parecida = state.cidades.find((c) => parecidoCom(c.nome, lida))
    return parecida ? parecida.nome : lida
  }
  // O OCR costuma falhar na transportadora. Rota NOVA sem leitura herda a
  // transportadora mais comum da operação (na prática, quase tudo é uma só).
  const contagem = new Map<string, number>()
  for (const r of [...state.rotas, ...novas]) {
    const t = r.transportadora.trim()
    if (t) contagem.set(t, (contagem.get(t) ?? 0) + 1)
  }
  const maisComum = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  await Promise.all(
    novas.map((n) => {
      // O id carrega o dia: a mesma rota em dias diferentes são documentos
      // diferentes, e a importação de um dia nunca sobrescreve a de outro.
      const id = `${data}_${(n.rotaExpedicao || uid()).replace(/[\s/]+/g, '-')}`
      const anterior = existentes.get(id)
      // Campo VAZIO na leitura quer dizer "não veio nesta importação", e nunca
      // "apague o que está lá". O texto colado costuma trazer só parte das
      // colunas (um bloco vem com Km e sem DPS, outro o contrário), e uma
      // reimportação assim zerava em silêncio o que já estava certo.
      const ou = (novo: string, salvo: string | undefined) => (novo.trim() ? novo : (salvo ?? ''))
      const rota: Rota = {
        ...n,
        id,
        data,
        cidade: ou(cidadeOficial(n.cidade), anterior?.cidade),
        rotaOriginal: ou(n.rotaOriginal, anterior?.rotaOriginal),
        base: ou(n.base, anterior?.base),
        veiculo: nomeOficialVeiculo(ou(n.veiculo, anterior?.veiculo), state),
        km: ou(n.km, anterior?.km),
        dps: ou(n.dps, anterior?.dps),
        ocupacao: ou(n.ocupacao, anterior?.ocupacao),
        // Rota nova sem transportadora fica com a mais comum da operação.
        transportadora: ou(n.transportadora, anterior?.transportadora) || maisComum,
        motoristaId: anterior?.motoristaId ?? null,
        finalizadaEm: anterior?.finalizadaEm ?? null,
        resultadoFinalizacao: anterior?.resultadoFinalizacao ?? null,
        atualizadaEm: agora,
      }
      return setDoc(doc(firestore, 'rotas', id), rota)
    }),
  )
}

export function salvarPlanejamento(e: Planejamento) {
  void setDoc(doc(firestore, 'planejamento', e.id), e)
}

export function removerPlanejamento(id: string) {
  void deleteDoc(doc(firestore, 'planejamento', id))
}

export function enviarNotificacao(n: Omit<Notificacao, 'id' | 'lida' | 'criadaEm'>) {
  const id = uid()
  void setDoc(doc(firestore, 'notificacoes', id), {
    ...n,
    id,
    // Firestore não aceita undefined — sem vínculo, o campo fica null.
    chamadaId: n.chamadaId ?? null,
    lida: false,
    criadaEm: new Date().toISOString(),
  })
}

export function marcarNotificacoesLidas(motoristaId: string) {
  for (const n of state.notificacoes) {
    if (!n.lida && (n.motoristaId === motoristaId || n.motoristaId === null)) {
      void setDoc(doc(firestore, 'notificacoes', n.id), { ...n, lida: true })
    }
  }
}
