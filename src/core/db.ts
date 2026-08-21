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
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from './firebase'
import type {
  DB,
  Chamada,
  DiaAgenda,
  Escala,
  Motorista,
  Notificacao,
  ParametrosAlocacao,
  ProgramacaoItem,
  Resposta,
  ResumoDia,
  Rota,
} from './types'

const VAZIO: DB = {
  motoristas: [],
  chamadas: [],
  respostas: [],
  escalas: [],
  agenda: [],
  limites: [],
  rotas: [],
  programacao: [],
  resumos: [],
  config: [],
  notificacoes: [],
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

/** Liga os listeners de tempo real (chamado após o login). */
export function iniciarSincronizacao() {
  if (unsubs.length > 0) return
  const colecoes: (keyof DB)[] = [
    'motoristas',
    'chamadas',
    'respostas',
    'escalas',
    'agenda',
    'limites',
    'rotas',
    'programacao',
    'resumos',
    'config',
    'notificacoes',
  ]
  const chegaram = new Set<string>()
  for (const nome of colecoes) {
    unsubs.push(
      onSnapshot(collection(firestore, nome), (snap) => {
        state = {
          ...state,
          [nome]: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
        }
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
  void setDoc(doc(firestore, 'motoristas', m.id), m)
}

export function removerMotorista(id: string) {
  void deleteDoc(doc(firestore, 'motoristas', id))
}

export function salvarChamada(c: Chamada) {
  void setDoc(doc(firestore, 'chamadas', c.id), c)
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
  void setDoc(doc(firestore, 'respostas', id), dados)
}

/** Marca a disponibilidade de uma data na agenda (1 registro por motorista/data). */
export function salvarDiaAgenda(d: Omit<DiaAgenda, 'id' | 'atualizadaEm'>) {
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
  void setDoc(doc(firestore, 'agenda', id), dados)
}

export function removerDiaAgenda(id: string) {
  void deleteDoc(doc(firestore, 'agenda', id))
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

export function salvarResumoDia(r: ResumoDia) {
  void setDoc(doc(firestore, 'resumos', r.id), { ...r, atualizadoEm: new Date().toISOString() })
}

/**
 * Preenche o Resumo do Dia a partir de um modelo lido (colado/CSV/PDF/foto).
 * Campos não reconhecidos preservam o que já estava no card.
 */
export function aplicarModeloResumo(dataDia: string, m: import('./planilha').ModeloResumo): ResumoDia {
  const existente = state.resumos.find((r) => r.id === dataDia)
  const base: ResumoDia = existente ?? {
    id: dataDia,
    data: dataDia,
    base: 'BASE - CIDADE',
    sprReferencia: '',
    pacotes: '',
    veiculosDiv: '',
    amAutomatico: true,
    transportadoras: [{ nome: 'RODACOOP', utilitarios: '', vuc: '' }],
    mm: [
      { tipo: '3/4', quantidade: '', posicoesPorUnidade: '8' },
      { tipo: 'TOCO', quantidade: '', posicoesPorUnidade: '12' },
      { tipo: 'TRUCK', quantidade: '', posicoesPorUnidade: '16' },
      { tipo: 'CARRETA', quantidade: '', posicoesPorUnidade: '28' },
    ],
    atualizadoEm: '',
  }
  const num = (s: string) => Number(String(s).replace(/\D/g, '')) || 0
  // A leitura só ACRESCENTA ou refina — nunca apaga o que o card já tinha.
  // Uma foto ruim que leu metade das linhas não pode destruir a outra metade.
  // Nomes com ruído de OCR ("RODACEEP" = RODACOOP) casam pelo começo do nome.
  const chaveNome = (s: string) => s.toUpperCase().replace(/[^A-ZÀ-Ú]/g, '').slice(0, 5)
  let transportadoras = base.transportadoras.map((t) => ({ ...t }))
  for (const lida of m.transportadoras) {
    const igual = transportadoras.find((t) => chaveNome(t.nome) === chaveNome(lida.nome))
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
  // O TOTAL ROTAS lido no modelo é a verdade: se as transportadoras
  // reconhecidas não somarem, completa a diferença numa linha extra.
  if (m.totalRotas) {
    const soma = transportadoras
      .filter((t) => t.nome !== 'OUTRAS')
      .reduce((s, t) => s + num(t.utilitarios) + num(t.vuc), 0)
    const diferenca = num(m.totalRotas) - soma
    transportadoras = transportadoras.filter((t) => t.nome !== 'OUTRAS')
    if (diferenca > 0) {
      transportadoras = [...transportadoras, { nome: 'OUTRAS', utilitarios: String(diferenca), vuc: '' }]
    }
  }
  // MM: mescla pelo número de posições (x8 = 3/4, x16 = TRUCK…) — as linhas
  // padrão ficam, e a leitura só preenche/atualiza as quantidades que achou.
  const mm = base.mm.map((linha) => {
    const lida = m.mm.find((n) => n.posicoesPorUnidade === linha.posicoesPorUnidade)
    return lida?.quantidade ? { ...linha, quantidade: lida.quantidade } : linha
  })
  for (const lida of m.mm) {
    if (!mm.some((linha) => linha.posicoesPorUnidade === lida.posicoesPorUnidade)) mm.push({ ...lida })
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
  void setDoc(doc(firestore, 'diagnosticos', 'ultimo-ocr'), {
    id: 'ultimo-ocr',
    origem,
    texto: texto.slice(0, 40000),
    build: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '?',
    aparelho: typeof navigator !== 'undefined' ? navigator.userAgent : '?',
    ...info,
    registradoEm: new Date().toISOString(),
  }).catch(() => {})
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
  await Promise.all(
    novas.map((n) => {
      const id = (n.rotaExpedicao || uid()).replace(/[\s/]+/g, '-')
      const anterior = existentes.get(id)
      const rota: Rota = {
        ...n,
        id,
        // A foto costuma falhar na transportadora: leitura vazia não apaga a já salva.
        transportadora: n.transportadora || anterior?.transportadora || '',
        motoristaId: anterior?.motoristaId ?? null,
        atualizadaEm: agora,
      }
      return setDoc(doc(firestore, 'rotas', id), rota)
    }),
  )
}

export function salvarEscala(e: Escala) {
  void setDoc(doc(firestore, 'escalas', e.id), e)
}

export function removerEscala(id: string) {
  void deleteDoc(doc(firestore, 'escalas', id))
}

export function enviarNotificacao(n: Omit<Notificacao, 'id' | 'lida' | 'criadaEm'>) {
  const id = uid()
  void setDoc(doc(firestore, 'notificacoes', id), {
    ...n,
    id,
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
