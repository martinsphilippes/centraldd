import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth'
import {
  deleteDoc,
  doc,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
} from 'firebase/firestore'
import { firebaseConfig } from './firebase-config'
import type { Motorista } from './types'

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Cache local persistente (IndexedDB): o app abre INSTANTANEAMENTE com os dados
// da última sessão e sincroniza com o servidor em segundo plano.
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

/** Grava o perfil de acesso de um motorista (papel + vínculo com o cadastro). */
export async function salvarPerfilMotorista(uid: string, email: string) {
  await setDoc(doc(firestore, 'perfis', uid), { papel: 'motorista', motoristaId: uid, email })
}

/** Remove o perfil de acesso (usado ao recusar um pré-cadastro). */
export async function removerPerfil(uid: string) {
  await deleteDoc(doc(firestore, 'perfis', uid))
}

/**
 * Promove um pré-cadastro a DISPATCHER: troca o papel do perfil
 * (a tela da pessoa vira o painel completo na hora) e remove o registro da
 * frota — dispatcher não é motorista. O e-mail já gravado no perfil é mantido.
 */
export async function promoverParaDispatcher(uid: string) {
  await setDoc(doc(firestore, 'perfis', uid), { papel: 'dispatcher', motoristaId: null }, { merge: true })
  await deleteDoc(doc(firestore, 'motoristas', uid))
}

/**
 * Cria uma conta de acesso (e-mail/senha) para um motorista SEM derrubar a
 * sessão do dispatcher: usa uma instância secundária do app só para o cadastro.
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
  /** 'dispatcher' = ao ser aprovado, ganha o painel completo. */
  funcao: 'motorista' | 'dispatcher'
}

/**
 * Pré-cadastro feito pelo PRÓPRIO motorista na tela de login:
 * cria a conta, o perfil e o cadastro com aprovado=false — tudo numa instância
 * secundária (autenticada como o novo usuário, como as regras exigem) — e por
 * fim entra na conta. O acesso real só é liberado quando o dispatcher aprovar.
 */
/**
 * Lê as opções de cadastro (veículos/operações) ANTES do login — a tela de
 * cadastro precisa delas. A coleção 'tipos' é de leitura pública nas regras;
 * qualquer falha devolve lista vazia e a tela usa os padrões.
 */
export async function carregarTiposPublicos(): Promise<{ veiculos: string[]; operacoes: string[] }> {
  try {
    const { getDocs, collection } = await import('firebase/firestore')
    const snap = await getDocs(collection(firestore, 'tipos'))
    const veiculos: string[] = []
    const operacoes: string[] = []
    snap.forEach((d) => {
      const t = d.data() as { categoria?: string; nome?: string }
      if (!t.nome) return
      if (t.categoria === 'veiculo') veiculos.push(t.nome)
      if (t.categoria === 'operacao') operacoes.push(t.nome)
    })
    const ordenar = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
    return { veiculos: veiculos.sort(ordenar), operacoes: operacoes.sort(ordenar) }
  } catch {
    return { veiculos: [], operacoes: [] }
  }
}

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
      funcao: dados.funcao,
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
