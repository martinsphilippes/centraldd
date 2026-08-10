import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth'
import { deleteDoc, doc, getFirestore, setDoc } from 'firebase/firestore'
import { firebaseConfig } from './firebase-config'
import type { Motorista } from './types'

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const firestore = getFirestore(app)

/** Grava o perfil de acesso de um motorista (papel + vínculo com o cadastro). */
export async function salvarPerfilMotorista(uid: string, email: string) {
  await setDoc(doc(firestore, 'perfis', uid), { papel: 'motorista', motoristaId: uid, email })
}

/** Remove o perfil de acesso (usado ao recusar um pré-cadastro). */
export async function removerPerfil(uid: string) {
  await deleteDoc(doc(firestore, 'perfis', uid))
}

/**
 * Cria uma conta de acesso (e-mail/senha) para um motorista SEM derrubar a
 * sessão do coordenador: usa uma instância secundária do app só para o cadastro.
 * Retorna o uid do novo usuário.
 */
export async function criarContaMotorista(email: string, senha: string): Promise<string> {
  const secundario = initializeApp(firebaseConfig, `criar-conta-${Date.now()}`)
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(secundario), email, senha)
    await fbSignOut(getAuth(secundario))
    return cred.user.uid
  } finally {
    await deleteApp(secundario)
  }
}

export interface DadosPreCadastro {
  nome: string
  telefone: string
  cidade: string
  equipe: string
  operacao: string
  veiculo: string
  email: string
  senha: string
}

/**
 * Pré-cadastro feito pelo PRÓPRIO motorista na tela de login:
 * cria a conta, o perfil e o cadastro com aprovado=false — tudo numa instância
 * secundária (autenticada como o novo usuário, como as regras exigem) — e por
 * fim entra na conta. O acesso real só é liberado quando o coordenador aprovar.
 */
export async function cadastrarPreCadastro(dados: DadosPreCadastro): Promise<void> {
  const secundario = initializeApp(firebaseConfig, `pre-cadastro-${Date.now()}`)
  try {
    const authSec = getAuth(secundario)
    const fsSec = getFirestore(secundario)
    const cred = await createUserWithEmailAndPassword(authSec, dados.email.trim(), dados.senha)
    const uid = cred.user.uid
    await setDoc(doc(fsSec, 'perfis', uid), {
      papel: 'motorista',
      motoristaId: uid,
      email: dados.email.trim(),
    })
    const motorista: Motorista = {
      id: uid,
      nome: dados.nome.trim(),
      telefone: dados.telefone.replace(/\D/g, ''),
      cidade: dados.cidade.trim(),
      equipe: dados.equipe.trim(),
      operacao: dados.operacao,
      veiculo: dados.veiculo,
      ativo: false,
      aprovado: false,
      criadoEm: new Date().toISOString(),
    }
    await setDoc(doc(fsSec, 'motoristas', uid), motorista)
    await fbSignOut(authSec)
  } finally {
    await deleteApp(secundario)
  }
  // Entra na conta recém-criada (cai na tela de "aguardando aprovação").
  await signInWithEmailAndPassword(auth, dados.email.trim(), dados.senha)
}
