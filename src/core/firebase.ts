import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateEmail,
  verifyBeforeUpdateEmail,
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
import type { ParCidadeOperacao } from './cidade-operacao'

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Cache local persistente (IndexedDB): o app abre INSTANTANEAMENTE com os dados
// da última sessão e sincroniza com o servidor em segundo plano.
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

/**
 * Troca a senha da PRÓPRIA conta logada. O Firebase exige login recente para
 * isso, então a senha atual reautentica antes — e de quebra prova que é o
 * dono da conta quem está trocando.
 */
export async function trocarSenha(senhaAtual: string, novaSenha: string): Promise<void> {
  const usuario = auth.currentUser
  if (!usuario?.email) throw new Error('sem-sessao')
  const credencial = EmailAuthProvider.credential(usuario.email, senhaAtual)
  await reauthenticateWithCredential(usuario, credencial)
  await updatePassword(usuario, novaSenha)
}

/**
 * Troca o E-MAIL DE LOGIN da própria conta. Mesma exigência da senha: o
 * Firebase pede login recente, então a senha atual reautentica antes.
 *
 * Projetos com proteção contra descoberta de e-mail recusam a troca direta.
 * Nesse caso o caminho é mandar um link de confirmação para o endereço NOVO —
 * e a troca só vale depois que a pessoa clicar nele. Devolvemos qual dos dois
 * aconteceu, porque a tela precisa dizer coisas diferentes.
 */
export async function trocarEmail(
  senhaAtual: string,
  novoEmail: string,
): Promise<'trocado' | 'confirmar-no-email-novo'> {
  const usuario = auth.currentUser
  if (!usuario?.email) throw new Error('sem-sessao')
  const credencial = EmailAuthProvider.credential(usuario.email, senhaAtual)
  await reauthenticateWithCredential(usuario, credencial)
  try {
    await updateEmail(usuario, novoEmail)
    return 'trocado'
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/operation-not-allowed') {
      await verifyBeforeUpdateEmail(usuario, novoEmail)
      return 'confirmar-no-email-novo'
    }
    throw err
  }
}

/**
 * Grava o perfil de acesso de um motorista (papel + vínculo com o cadastro).
 * Por padrão a conta aponta para o cadastro de mesmo id; `motoristaId` liga
 * a conta a um cadastro que já existia (login criado depois do cadastro).
 */
export async function salvarPerfilMotorista(uid: string, email: string, motoristaId = uid) {
  await setDoc(doc(firestore, 'perfis', uid), { papel: 'motorista', motoristaId, email })
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

/**
 * Apaga a CONTA DE LOGIN de um motorista sabendo a senha dele — o caso do
 * lote de teste, em que todos entram com a mesma senha. Apagar conta alheia
 * só o Admin SDK faz; a própria conta, ela mesma apaga depois de entrar.
 * Roda numa instância secundária para não derrubar a sessão do dispatcher.
 */
export async function apagarContaComSenha(email: string, senha: string): Promise<void> {
  const secundario = initializeApp(firebaseConfig, `apagar-conta-${Date.now()}-${Math.random()}`)
  try {
    const authSec = getAuth(secundario)
    const cred = await signInWithEmailAndPassword(authSec, email, senha)
    await deleteUser(cred.user)
  } finally {
    await deleteApp(secundario)
  }
}

export interface DadosPreCadastro {
  nome: string
  telefone: string
  cidade: string
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

/**
 * Lê as cidades da operação ANTES do login — o campo de cidade do cadastro
 * põe as da operação no topo da sugestão. A coleção 'cidades' é de leitura
 * pública nas regras (como 'tipos'); qualquer falha devolve lista vazia e a
 * ordem cai para a geral. Não trava o cadastro em hipótese nenhuma.
 */
export async function carregarCidadesOperacaoPublicas(): Promise<string[]> {
  try {
    const { getDocs, collection } = await import('firebase/firestore')
    const snap = await getDocs(collection(firestore, 'cidades'))
    const nomes: string[] = []
    snap.forEach((d) => {
      const nome = (d.data() as { nome?: string }).nome
      if (nome) nomes.push(nome)
    })
    return nomes
  } catch {
    return []
  }
}

/**
 * Lê os pares CIDADE/OPERAÇÃO antes do login — é a lista que o cadastro
 * oferece no lugar de "onde você mora". Leitura pública nas regras; falha
 * devolve lista vazia, e a tela explica que ainda não há cidade cadastrada.
 */
export async function carregarOperacoesCidadePublicas(): Promise<ParCidadeOperacao[]> {
  try {
    const { getDocs, collection } = await import('firebase/firestore')
    const snap = await getDocs(collection(firestore, 'operacoesCidade'))
    const pares: ParCidadeOperacao[] = []
    snap.forEach((d) => {
      const { cidade, operacao } = d.data() as { cidade?: string; operacao?: string }
      if (cidade && operacao) pares.push({ cidade, operacao })
    })
    return pares
  } catch {
    return []
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
