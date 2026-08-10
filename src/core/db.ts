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
import type { DB, Chamada, Escala, Motorista, Notificacao, Resposta } from './types'

const VAZIO: DB = { motoristas: [], chamadas: [], respostas: [], escalas: [], notificacoes: [] }

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
  const colecoes: (keyof DB)[] = ['motoristas', 'chamadas', 'respostas', 'escalas', 'notificacoes']
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
