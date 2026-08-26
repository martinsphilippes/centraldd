// Sessão real com Firebase Auth (e-mail/senha).
// O papel do usuário vem da coleção `perfis` do Firestore:
//   - contas criadas no Console sem perfil → viram dispatcher no 1º login;
//   - contas de motorista são criadas pelo dispatcher no app, já com perfil.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { auth, firestore } from '../core/firebase'
import { EMAILS_DISPATCHER } from '../core/firebase-config'
import { iniciarSincronizacao, pararSincronizacao } from '../core/db'
import { papelDe } from '../core/papel'
import type { Papel } from '../core/types'

export type StatusAuth = 'carregando' | 'deslogado' | 'logado'

interface Sessao {
  statusAuth: StatusAuth
  papel: Papel
  motoristaId: string | null
  usuarioEmail: string | null
  erroSessao: string | null
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => Promise<void>
}

const Ctx = createContext<Sessao | null>(null)

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [statusAuth, setStatusAuth] = useState<StatusAuth>('carregando')
  const [papel, setPapel] = useState<Papel>('dispatcher')
  const [motoristaId, setMotoristaId] = useState<string | null>(null)
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null)
  const [erroSessao, setErroSessao] = useState<string | null>(null)

  useEffect(() => {
    let pararPerfil: (() => void) | null = null
    const pararAuth = onAuthStateChanged(auth, (user) => {
      pararPerfil?.()
      pararPerfil = null
      if (!user) {
        pararSincronizacao()
        setUsuarioEmail(null)
        setMotoristaId(null)
        setStatusAuth('deslogado')
        return
      }

      // Atalho de velocidade: perfil já conhecido deste aparelho → entra na hora,
      // sem esperar a rede. A validação com o servidor segue em segundo plano.
      const chaveCache = `mldisponibilidade:perfil:${user.uid}`
      const emCache = localStorage.getItem(chaveCache)
      if (emCache) {
        try {
          const p = JSON.parse(emCache) as { papel: string; motoristaId: string | null }
          const papelCache = papelDe(p.papel)
          setPapel(papelCache)
          setMotoristaId(p.motoristaId)
          setUsuarioEmail(user.email)
          setErroSessao(null)
          iniciarSincronizacao(papelCache === 'dispatcher')
          setStatusAuth('logado')
        } catch {
          localStorage.removeItem(chaveCache)
        }
      }

      // Escuta o perfil EM TEMPO REAL: se o papel mudar (ex.: motorista
      // aprovado vira dispatcher), a tela troca na hora, sem novo login.
      const ref = doc(firestore, 'perfis', user.uid)
      pararPerfil = onSnapshot(
        ref,
        async (snap) => {
          if (snap.exists()) {
            const p = snap.data() as { papel?: string; motoristaId?: string | null }
            const papelLido = papelDe(p.papel)
            setPapel(papelLido)
            setMotoristaId(p.motoristaId ?? null)
            localStorage.setItem(
              chaveCache,
              JSON.stringify({ papel: papelLido, motoristaId: p.motoristaId ?? null }),
            )
            setErroSessao(null)
            setUsuarioEmail(user.email)
            iniciarSincronizacao(papelLido === 'dispatcher')
            setStatusAuth('logado')
          } else if (user.email && EMAILS_DISPATCHER.includes(user.email.toLowerCase())) {
            // E-mail autorizado sem perfil → dispatcher no primeiro login
            // (o snapshot dispara de novo após a criação e conclui o login).
            await setDoc(ref, { papel: 'dispatcher', motoristaId: null, email: user.email })
          } else {
            // Conta sem perfil e sem autorização: bloqueia o acesso.
            localStorage.removeItem(chaveCache)
            setErroSessao('Sua conta ainda não foi liberada. Fale com o Dispatcher.')
            await signOut(auth)
          }
        },
        async () => {
          // Sem rede agora: se o perfil era conhecido, mantém a sessão do cache.
          if (!emCache) {
            setErroSessao('Não foi possível carregar seus dados. Tente novamente em instantes.')
            await signOut(auth)
          }
        },
      )
    })
    return () => {
      pararPerfil?.()
      pararAuth()
    }
  }, [])

  const entrar = async (email: string, senha: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), senha)
  }

  const sair = async () => {
    await signOut(auth)
  }

  return (
    <Ctx.Provider value={{ statusAuth, papel, motoristaId, usuarioEmail, erroSessao, entrar, sair }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSessao(): Sessao {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSessao fora do SessaoProvider')
  return ctx
}
