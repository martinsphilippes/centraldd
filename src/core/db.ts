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
import type {
  DB,
  Chamada,
  CidadeOperacao,
  ModeloAprendido,
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

/**
 * Coleções renomeadas. Os documentos gravados com o nome antigo continuam
 * sendo lidos (e são copiados para o nome novo assim que um Dispatcher abre
 * o app), então a troca de nome não perde nem esconde nada.
 * Quando o Firestore não tiver mais documentos nos nomes antigos, este bloco
 * e os dois listeners extras podem sair.
 */
const RENOMEADAS: { nova: 'disponibilidade' | 'planejamento'; antiga: string }[] = [
  { nova: 'disponibilidade', antiga: 'agenda' },
  { nova: 'planejamento', antiga: 'escalas' },
]

type Linha = { id: string } & Record<string, unknown>
/** Documentos vindos do nome atual da coleção. */
const atuais: Partial<Record<keyof DB, Linha[]>> = {}
/** Documentos vindos do nome antigo (só das coleções renomeadas). */
const antigos: Partial<Record<keyof DB, Linha[]>> = {}

/** Junta os dois nomes numa lista só — em id repetido, o novo manda. */
function mesclar(nome: keyof DB) {
  const novos = atuais[nome] ?? []
  const restantes = (antigos[nome] ?? []).filter((a) => !novos.some((n) => n.id === a.id))
  state = { ...state, [nome]: [...novos, ...restantes] }
}

/** Cópias em andamento — cada delete redispara o snapshot antigo. */
const copiando = new Set<string>()

/** Copia para o nome novo o que só existe no antigo. Silencioso: sem permissão, não faz nada. */
async function copiarParaNomeNovo(nova: keyof DB, antiga: string) {
  if (copiando.has(antiga)) return
  const jaTem = new Set((atuais[nova] ?? []).map((d) => d.id))
  const pendentes = (antigos[nova] ?? []).filter((d) => !jaTem.has(d.id))
  if (pendentes.length === 0) return
  copiando.add(antiga)
  try {
    for (const linha of pendentes) {
      const { id, ...dados } = linha
      await setDoc(doc(firestore, nova, id), dados)
      await deleteDoc(doc(firestore, antiga, id))
    }
  } catch {
    // Sem permissão de escrita: fica só a leitura do nome antigo, nada se perde.
  } finally {
    copiando.delete(antiga)
  }
}

/** Liga os listeners de tempo real (chamado após o login). */
export function iniciarSincronizacao(migrar = false) {
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
  ]
  const chegaram = new Set<string>()
  for (const nome of colecoes) {
    unsubs.push(
      onSnapshot(collection(firestore, nome), (snap) => {
        atuais[nome] = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        mesclar(nome)
        chegaram.add(nome)
        if (chegaram.size === colecoes.length) carregado = true
        emit()
      }),
    )
  }

  // Coleções renomeadas: continua ouvindo o nome antigo para nada sumir da
  // tela enquanto os documentos não foram copiados.
  for (const { nova, antiga } of RENOMEADAS) {
    unsubs.push(
      onSnapshot(collection(firestore, antiga), (snap) => {
        antigos[nova] = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        mesclar(nova)
        if (migrar) void copiarParaNomeNovo(nova, antiga)
        emit()
      }),
    )
  }
}

/** Desliga os listeners e limpa o estado (chamado no logout). */
export function pararSincronizacao() {
  for (const u of unsubs) u()
  unsubs.length = 0
  for (const k of Object.keys(atuais) as (keyof DB)[]) delete atuais[k]
  for (const k of Object.keys(antigos) as (keyof DB)[]) delete antigos[k]
  state = VAZIO
  carregado = false
  emit()
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ---- Operações de domínio (gravam no Firestore; o snapshot atualiza a UI) ----

export function salvarMotorista(m: Motorista) {
  void setDoc(doc(firestore, 'motoristas', m.id), m)
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
      veiculo: ou(linha.veiculo, anterior?.veiculo),
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
  void setDoc(doc(firestore, 'conferencias', c.id), c)
}

export function removerConferencia(id: string) {
  void deleteDoc(doc(firestore, 'conferencias', id))
}

/**
 * O MOTORISTA envia a lista dele. Só esses três campos mudam — é o que as
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

/**
 * Preenche o Resumo do Dia a partir de um modelo lido (colado/CSV/PDF/foto).
 * Campos não reconhecidos preservam o que já estava no card.
 */
export function removerResumoDia(id: string) {
  void deleteDoc(doc(firestore, 'resumos', id))
}

export function aplicarModeloResumo(dataDia: string, m: import('./planilha').ModeloResumo): ResumoDia {
  const existente = state.resumos.find((r) => r.id === dataDia)
  // Estrutura já aprendida desta base (corrigida à mão nas importações
  // anteriores): transportadoras e posições por veículo entram prontas.
  const baseLida = m.base ?? existente?.base ?? ''
  const aprendido = state.modelos.find((x) => parecidoCom(x.base, baseLida))
  const esqueletoTransportadoras =
    aprendido && aprendido.transportadoras.length
      ? aprendido.transportadoras.map((nome) => ({ nome, utilitarios: '', vuc: '' }))
      : [{ nome: 'RODACOOP', utilitarios: '', vuc: '' }]
  const esqueletoMM =
    aprendido && aprendido.mm.length
      ? aprendido.mm.map((x) => ({ tipo: x.tipo, quantidade: '', posicoesPorUnidade: x.posicoesPorUnidade }))
      : [
          { tipo: '3/4', quantidade: '', posicoesPorUnidade: '8' },
          { tipo: 'TOCO', quantidade: '', posicoesPorUnidade: '12' },
          { tipo: 'TRUCK', quantidade: '', posicoesPorUnidade: '16' },
          { tipo: 'CARRETA', quantidade: '', posicoesPorUnidade: '28' },
        ]
  const base: ResumoDia = existente ?? {
    id: dataDia,
    data: dataDia,
    base: 'BASE - CIDADE',
    sprReferencia: '',
    pacotes: '',
    veiculosDiv: '',
    amAutomatico: true,
    transportadoras: esqueletoTransportadoras,
    mm: esqueletoMM,
    atualizadoEm: '',
  }
  const num = (s: string) => Number(String(s).replace(/\D/g, '')) || 0
  // A leitura só ACRESCENTA ou refina — nunca apaga o que o card já tinha.
  // Uma foto ruim que leu metade das linhas não pode destruir a outra metade.
  // Nomes com ruído de OCR ("RODACEEP" = RODACOOP) casam pelo começo do nome.
  let transportadoras = base.transportadoras.map((t) => ({ ...t }))
  for (const lida of m.transportadoras) {
    // "ORODAÇEEP" casa com "RODACOOP" aprendido — o OCR erra letras, não a linha.
    const igual = transportadoras.find((t) => parecidoCom(t.nome, lida.nome))
    if (igual) {
      if (lida.utilitarios) igual.utilitarios = lida.utilitarios
      if (lida.vuc) igual.vuc = lida.vuc
    } else {
      transportadoras.push({ ...lida })
    }
  }
  // Sobrou linha placeholder sem número junto de linhas preenchidas? Sai.
  if (transportadoras.some((t) => num(t.utilitarios) > 0 || num(t.vuc) > 0)) {
    transportadoras = transportadoras.filter((t) => num(t.utilitarios) > 0 || num(t.vuc) > 0)
  }
  // O TOTAL ROTAS lido no modelo entra como total informado — sem inventar
  // linha de transportadora para "fechar a conta".
  transportadoras = transportadoras.filter((t) => t.nome !== 'OUTRAS')
  // MM: mescla pelo número de posições (x8 = 3/4, x16 = TRUCK…) — as linhas
  // padrão ficam, e a leitura só preenche/atualiza as quantidades que achou.
  const mm = base.mm.map((linha) => {
    const lida = m.mm.find(
      (n) => n.posicoesPorUnidade === linha.posicoesPorUnidade || parecidoCom(n.tipo, linha.tipo),
    )
    return lida?.quantidade ? { ...linha, quantidade: lida.quantidade } : linha
  })
  for (const lida of m.mm) {
    const conhecida = mm.some(
      (linha) => linha.posicoesPorUnidade === lida.posicoesPorUnidade || parecidoCom(linha.tipo, lida.tipo),
    )
    if (!conhecida && lida.tipo && lida.tipo !== 'MM') mm.push({ ...lida })
  }
  const resultado: ResumoDia = {
    ...base,
    id: dataDia,
    data: dataDia,
    base: m.base ?? base.base,
    sprReferencia: m.sprReferencia ?? base.sprReferencia,
    pacotes: m.pacotes ?? base.pacotes,
    veiculosDiv: m.veiculosDiv ?? base.veiculosDiv,
    transportadoras,
    // Modelo com AM por transportadora (ou total) passa a valer o manual importado.
    amAutomatico: m.transportadoras.length || m.totalRotas ? false : base.amAutomatico,
    mm,
    // Campos opcionais nunca podem ir como undefined para o Firestore.
    totalRotas: m.totalRotas ?? base.totalRotas ?? '',
    posicoesTotal: m.posicoesTotal ?? base.posicoesTotal ?? '',
  }
  salvarResumoDia(resultado)
  return resultado
}

/**
 * Guarda o texto bruto da última leitura de OCR (foto/PDF) para diagnóstico:
 * quando uma importação "não funciona" no aparelho, dá para ver exatamente o
 * que o motor de leitura enxergou lá — sem depender de print do usuário.
 */
export function registrarDiagnosticoOcr(origem: string, texto: string, info: Record<string, unknown> = {}) {
  // Um registro por ORIGEM: a leitura das rotas não apaga a do modelo.
  const id = `ultimo-ocr-${origem}`
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

/**
 * APRENDE com o resumo que o dispatcher salvou: guarda a estrutura do
 * modelo daquela base (transportadoras e posições por veículo) para a
 * próxima leitura já nascer certa. Números do dia não são guardados.
 */
export function aprenderComResumo(r: ResumoDia) {
  const base = normalizarTexto(r.base)
  if (!base || base === normalizarTexto('BASE - CIDADE')) return
  const id = base.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  const modelo: ModeloAprendido = {
    id,
    base: r.base.trim(),
    transportadoras: r.transportadoras.map((t) => t.nome.trim()).filter(Boolean),
    mm: r.mm
      .filter((m) => m.tipo.trim() && Number(m.posicoesPorUnidade) > 0)
      .map((m) => ({ tipo: m.tipo.trim(), posicoesPorUnidade: m.posicoesPorUnidade.trim() })),
    atualizadoEm: new Date().toISOString(),
  }
  if (modelo.transportadoras.length === 0 && modelo.mm.length === 0) return
  void setDoc(doc(firestore, 'modelos', id), modelo)
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
 * Importa a programação do Meli. O id = data + rota: reimportar o mesmo dia
 * atualiza o plano sem duplicar e SEM perder os ajustes já feitos pelo
 * dispatcher (driverFinal/motoristaId são preservados quando já alterados).
 */
export async function importarProgramacao(
  itens: Omit<ProgramacaoItem, 'id' | 'driverFinal' | 'motoristaId' | 'atualizadaEm'>[],
  vincular: (driver: string) => string | null,
) {
  const agora = new Date().toISOString()
  const existentes = new Map(state.programacao.map((p) => [p.id, p]))
  await Promise.all(
    itens.map((n) => {
      const id = `${n.data}_${n.rota}`.replace(/[\s/]+/g, '-')
      const anterior = existentes.get(id)
      // Preserva a decisão do dispatcher se ele já tinha mexido neste item.
      const jaAjustado = anterior && anterior.driverFinal !== anterior.driverPlanejado
      const item: ProgramacaoItem = {
        ...n,
        id,
        driverFinal: jaAjustado ? anterior.driverFinal : n.driverPlanejado,
        motoristaId: jaAjustado ? anterior.motoristaId : vincular(n.driverPlanejado),
        atualizadaEm: agora,
      }
      return setDoc(doc(firestore, 'programacao', id), item)
    }),
  )
}

/**
 * Importa rotas em lote. O id vem da "Rota expedição" (única por planilha):
 * reimportar a mesma planilha ATUALIZA as rotas existentes em vez de duplicar,
 * preservando o motorista já direcionado em cada uma.
 */
export async function importarRotas(novas: Omit<Rota, 'id' | 'motoristaId' | 'atualizadaEm'>[]) {
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
      const id = (n.rotaExpedicao || uid()).replace(/[\s/]+/g, '-')
      const anterior = existentes.get(id)
      const rota: Rota = {
        ...n,
        id,
        cidade: cidadeOficial(n.cidade),
        // Leitura vazia não apaga a já salva; rota nova fica com a mais comum.
        transportadora: n.transportadora || anterior?.transportadora || maisComum,
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
