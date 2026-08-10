// Sessão de demonstração: alterna entre o perfil coordenador e a visão
// de um motorista específico. Em produção, vira autenticação real —
// as telas já são separadas por papel.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Papel } from '../core/types'
import { useDB } from '../core/db'

interface Sessao {
  papel: Papel
  motoristaId: string | null
  setPapel: (p: Papel) => void
  setMotoristaId: (id: string) => void
}

const Ctx = createContext<Sessao | null>(null)

const KEY = 'mldisponibilidade:sessao'

export function SessaoProvider({ children }: { children: ReactNode }) {
  const db = useDB()
  const [papel, setPapel] = useState<Papel>(() => {
    try {
      return (JSON.parse(localStorage.getItem(KEY) ?? '{}').papel as Papel) ?? 'coordenador'
    } catch {
      return 'coordenador'
    }
  })
  const [motoristaId, setMotoristaId] = useState<string | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}').motoristaId ?? null
    } catch {
      return null
    }
  })

  // Garante um motorista selecionado para a visão do motorista.
  const idValido = motoristaId && db.motoristas.some((m) => m.id === motoristaId)
    ? motoristaId
    : db.motoristas.find((m) => m.ativo)?.id ?? null

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ papel, motoristaId: idValido }))
  }, [papel, idValido])

  return (
    <Ctx.Provider value={{ papel, motoristaId: idValido, setPapel, setMotoristaId }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSessao(): Sessao {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSessao fora do SessaoProvider')
  return ctx
}
