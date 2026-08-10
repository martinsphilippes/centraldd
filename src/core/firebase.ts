import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth'
import { doc, getFirestore, setDoc } from 'firebase/firestore'
import { firebaseConfig } from './firebase-config'

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const firestore = getFirestore(app)

/** Grava o perfil de acesso de um motorista (papel + vínculo com o cadastro). */
export async function salvarPerfilMotorista(uid: string, email: string) {
  await setDoc(doc(firestore, 'perfis', uid), { papel: 'motorista', motoristaId: uid, email })
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
