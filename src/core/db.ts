// Store reativo com persistência em localStorage.
// A UI consome via useDB()/useStore; trocar a persistência por uma API
// exige alterar apenas load()/persist() deste arquivo.

import { useSyncExternalStore } from 'react'
import type { DB, Chamada, Escala, Motorista, Notificacao, Resposta } from './types'
import { criarSeed } from './seed'

const STORAGE_KEY = 'mldisponibilidade:db:v1'

type Listener = () => void

function load(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DB
  } catch {
    // dados corrompidos → recomeça do seed
  }
  const seed = criarSeed()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
  return seed
}

let state: DB = load()
const listeners = new Set<Listener>()

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function emit() {
  for (const l of listeners) l()
}

export function getDB(): DB {
  return state
}

export function setDB(updater: (db: DB) => DB) {
  state = updater(state)
  persist()
  emit()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Sincroniza alterações feitas em outras abas (tempo real entre janelas).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      state = JSON.parse(e.newValue) as DB
      emit()
    }
  })
}

/** Hook reativo: re-renderiza quando qualquer coleção muda. */
export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB)
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ---- Operações de domínio ----

export function salvarMotorista(m: Motorista) {
  setDB((db) => {
    const existe = db.motoristas.some((x) => x.id === m.id)
    return {
      ...db,
      motoristas: existe ? db.motoristas.map((x) => (x.id === m.id ? m : x)) : [...db.motoristas, m],
    }
  })
}

export function removerMotorista(id: string) {
  setDB((db) => ({ ...db, motoristas: db.motoristas.filter((m) => m.id !== id) }))
}

export function salvarChamada(c: Chamada) {
  setDB((db) => {
    const existe = db.chamadas.some((x) => x.id === c.id)
    return {
      ...db,
      chamadas: existe ? db.chamadas.map((x) => (x.id === c.id ? c : x)) : [...db.chamadas, c],
    }
  })
}

/** Registra ou atualiza a resposta do motorista a uma chamada (1 por motorista/chamada). */
export function responderChamada(r: Omit<Resposta, 'id' | 'respondidaEm'>) {
  setDB((db) => {
    const anterior = db.respostas.find(
      (x) => x.chamadaId === r.chamadaId && x.motoristaId === r.motoristaId,
    )
    const nova: Resposta = {
      ...r,
      id: anterior?.id ?? uid(),
      respondidaEm: new Date().toISOString(),
    }
    return {
      ...db,
      respostas: anterior
        ? db.respostas.map((x) => (x.id === anterior.id ? nova : x))
        : [...db.respostas, nova],
    }
  })
}

export function salvarEscala(e: Escala) {
  setDB((db) => {
    const existe = db.escalas.some((x) => x.id === e.id)
    return {
      ...db,
      escalas: existe ? db.escalas.map((x) => (x.id === e.id ? e : x)) : [...db.escalas, e],
    }
  })
}

export function removerEscala(id: string) {
  setDB((db) => ({ ...db, escalas: db.escalas.filter((e) => e.id !== id) }))
}

export function enviarNotificacao(n: Omit<Notificacao, 'id' | 'lida' | 'criadaEm'>) {
  setDB((db) => ({
    ...db,
    notificacoes: [
      { ...n, id: uid(), lida: false, criadaEm: new Date().toISOString() },
      ...db.notificacoes,
    ],
  }))
}

export function marcarNotificacoesLidas(motoristaId: string) {
  setDB((db) => ({
    ...db,
    notificacoes: db.notificacoes.map((n) =>
      n.motoristaId === motoristaId || n.motoristaId === null ? { ...n, lida: true } : n,
    ),
  }))
}

export function resetarDemo() {
  const seed = criarSeed()
  state = seed
  persist()
  emit()
}
