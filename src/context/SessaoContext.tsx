// Sessão real com Firebase Auth (e-mail/senha).
// O papel do usuário vem da coleção `perfis` do Firestore:
//   - contas criadas no Console sem perfil → viram coordenador no 1º login;
//   - contas de motorista são criadas pelo coordenador no app, já com perfil.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { auth, firestore } from '../core/firebase'
import { EMAILS_COORDENADOR } from '../core/firebase-config'
import { iniciarSincronizacao, pararSincronizacao } from '../core/db'
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
  const [papel, setPapel] = useState<Papel>('coordenador')
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
          const p = JSON.parse(emCache) as { papel: Papel; motoristaId: string | null }
          setPapel(p.papel)
          setMotoristaId(p.motoristaId)
          setUsuarioEmail(user.email)
          setErroSessao(null)
          iniciarSincronizacao()
          setStatusAuth('logado')
        } catch {
          localStorage.removeItem(chaveCache)
        }
      }

      // Escuta o perfil EM TEMPO REAL: se o papel mudar (ex.: dispatcher
      // aprovado vira coordenador), a tela troca na hora, sem novo login.
      const ref = doc(firestore, 'perfis', user.uid)
      pararPerfil = onSnapshot(
        ref,
        async (snap) => {
          if (snap.exists()) {
            const p = snap.data() as { papel: Papel; motoristaId?: string | null }
            setPapel(p.papel)
            setMotoristaId(p.motoristaId ?? null)
            localStorage.setItem(
              chaveCache,
              JSON.stringify({ papel: p.papel, motoristaId: p.motoristaId ?? null }),
            )
            setErroSessao(null)
            setUsuarioEmail(user.email)
            iniciarSincronizacao()
            setStatusAuth('logado')
          } else if (user.email && EMAILS_COORDENADOR.includes(user.email.toLowerCase())) {
            // E-mail autorizado sem perfil → coordenador no primeiro login
            // (o snapshot dispara de novo após a criação e conclui o login).
            await setDoc(ref, { papel: 'coordenador', motoristaId: null, email: user.email })
          } else {
            // Conta sem perfil e sem autorização: bloqueia o acesso.
            localStorage.removeItem(chaveCache)
            setErroSessao('Sua conta ainda não foi liberada. Fale com a coordenação.')
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
