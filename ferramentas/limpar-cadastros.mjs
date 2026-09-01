/*
 * Apaga os MOTORISTAS de teste do Central DD: contas de login, perfis,
 * cadastros e o histórico que aponta para eles.
 *
 * DISPATCHERS NÃO SÃO TOCADOS. Quem manda é o campo `papel` do documento em
 * `perfis/{uid}`: 'dispatcher' e o legado 'coordenador' ficam; 'motorista'
 * sai. Conta sem perfil nenhum também FICA por padrão — pode ser um
 * dispatcher criado no Console que ainda não entrou pela primeira vez, e o
 * erro de apagar um desses tranca alguém para fora da operação.
 *
 * Roda na SUA máquina, com a SUA chave — nenhum segredo passa por chat.
 *
 * COMO USAR (Cloud Shell — funciona até do iPad, sem baixar chave)
 *   1. console.cloud.google.com → escolha o projeto → ícone >_ (Cloud Shell)
 *   2. npm install firebase-admin
 *   3. node limpar-cadastros.mjs              ← só MOSTRA o que faria
 *   4. node limpar-cadastros.mjs --apagar     ← apaga de verdade
 *
 *   Modos:
 *     (padrão)     motoristas e tudo que referencia motorista
 *     --tudo       o acima MAIS chamadas, rotas, programação, resumos e limites
 *     --sem-perfil inclui também as contas que não têm perfil nenhum
 *
 * O QUE NUNCA É APAGADO
 *   - A conta do DONO (e-mail abaixo) e o perfil dela.
 *   - Todos os DISPATCHERS: conta, perfil e acesso.
 *   - config (parâmetros), cidades e tipos (opções de cadastro) — é a
 *     configuração da operação, não dado de teste.
 *
 * Antes de apagar qualquer coisa, grava um backup .json nesta pasta. No
 * Firestore e no Auth não existe lixeira: o que sai não volta.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const DONO = 'martinsphilippes@gmail.com'
/** Papéis que ficam. 'coordenador' é o nome antigo de dispatcher. */
const PAPEIS_PRESERVADOS = ['dispatcher', 'coordenador']

/** Coleções cujo conteúdo só existe por causa de um motorista. */
const DE_PESSOAS = [
  'motoristas',
  'perfis',
  'disponibilidade',
  'respostas',
  'planejamento',
  'conferencias',
  'notificacoes',
  'sugestoes',
]
/** Dados do dia. Só saem com --tudo. */
const DO_DIA = ['chamadas', 'rotas', 'programacao', 'resumos', 'limites', 'modelos', 'diagnosticos']
/** Nunca saem: é a configuração da operação. */
const PRESERVADAS = ['config', 'cidades', 'tipos']

const apagarDeVerdade = process.argv.includes('--apagar')
const incluirDia = process.argv.includes('--tudo')
const incluirSemPerfil = process.argv.includes('--sem-perfil')
const colecoes = incluirDia ? [...DE_PESSOAS, ...DO_DIA] : DE_PESSOAS

/*
 * Duas formas de autenticar, nesta ordem:
 *
 *  1. No CLOUD SHELL (terminal do navegador) não existe chave: ele já roda
 *     autenticado como o dono do projeto. É o caminho recomendado — nenhum
 *     arquivo de credencial é criado, então nenhum arquivo pode vazar.
 *  2. Em computador próprio, com o chave.json baixado do Console.
 */
// O ID do projeto no Google. O NOME é Central DD; o id é o ENDEREÇO do banco e
// o Google não permite renomeá-lo depois de criado.
const PROJETO = 'centraldispatcherdriver'
if (existsSync('./chave.json')) {
  initializeApp({ credential: cert(JSON.parse(readFileSync('./chave.json', 'utf8'))), projectId: PROJETO })
  console.log('autenticado pelo chave.json')
} else {
  initializeApp({ credential: applicationDefault(), projectId: PROJETO })
  console.log('autenticado pela sessão do Cloud Shell (sem arquivo de chave)')
}
const auth = getAuth()
const bd = getFirestore()

/** Todas as contas de login, página por página. */
async function todasAsContas() {
  const contas = []
  let pagina = await auth.listUsers(1000)
  contas.push(...pagina.users)
  while (pagina.pageToken) {
    pagina = await auth.listUsers(1000, pagina.pageToken)
    contas.push(...pagina.users)
  }
  return contas
}

async function documentosDe(colecao) {
  const snap = await bd.collection(colecao).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Apaga em lotes de 400: o limite do Firestore por lote é 500. */
async function apagarColecao(colecao, manterIds = new Set()) {
  const snap = await bd.collection(colecao).get()
  const alvos = snap.docs.filter((d) => !manterIds.has(d.id))
  for (let i = 0; i < alvos.length; i += 400) {
    const lote = bd.batch()
    for (const d of alvos.slice(i, i + 400)) lote.delete(d.ref)
    await lote.commit()
  }
  return alvos.length
}

const contas = await todasAsContas()

// O papel vem do perfil. É a ÚNICA fonte confiável de quem é dispatcher —
// e-mail não diz nada, e o cadastro de motorista pode existir para alguém que
// virou dispatcher depois.
const perfis = await documentosDe('perfis')
const papelPorUid = new Map(perfis.map((p) => [p.id, String(p.papel ?? '')]))

const emailDono = (c) => (c.email ?? '').toLowerCase() === DONO
const ehDispatcher = (uid) => PAPEIS_PRESERVADOS.includes(papelPorUid.get(uid) ?? '')
const semPerfil = (uid) => !papelPorUid.has(uid)

const dono = contas.find(emailDono)
const dispatchers = contas.filter((c) => !emailDono(c) && ehDispatcher(c.uid))
const orfas = contas.filter((c) => !emailDono(c) && semPerfil(c.uid))
const motoristas = contas.filter(
  (c) => !emailDono(c) && !ehDispatcher(c.uid) && !semPerfil(c.uid),
)
const contasParaApagar = incluirSemPerfil ? [...motoristas, ...orfas] : motoristas

// Perfis: só os de motorista saem.
const perfisParaManter = new Set(
  perfis.filter((p) => ehDispatcher(p.id) || (dono && p.id === dono.uid)).map((p) => p.id),
)

console.log('\n=== O QUE EXISTE HOJE ===')
console.log(`contas de login: ${contas.length}`)
if (dono) console.log(`  🔑 dono (${DONO}) — FICA`)
else console.log(`  ⚠️  NÃO achei a conta do dono (${DONO}) — confira o e-mail no topo do script`)
console.log(`  🧑 dispatchers: ${dispatchers.length} — FICAM`)
for (const c of dispatchers) console.log(`      · ${c.email ?? '(sem e-mail)'}`)
console.log(`  🚚 motoristas: ${motoristas.length} — a apagar`)
for (const c of motoristas.slice(0, 40)) console.log(`      · ${c.email ?? '(sem e-mail)'}`)
if (motoristas.length > 40) console.log(`      … e mais ${motoristas.length - 40}`)
console.log(
  `  ❔ sem perfil nenhum: ${orfas.length} — ${
    incluirSemPerfil ? 'a apagar (--sem-perfil)' : 'FICAM (use --sem-perfil para incluir)'
  }`,
)
for (const c of orfas.slice(0, 20)) console.log(`      · ${c.email ?? '(sem e-mail)'}`)

console.log('\ncoleções:')
const inventario = { perfis }
for (const colecao of [...colecoes.filter((c) => c !== 'perfis'), ...PRESERVADAS]) {
  inventario[colecao] = await documentosDe(colecao)
}
for (const colecao of [...colecoes, ...PRESERVADAS]) {
  const total = inventario[colecao].length
  const fica = colecao === 'perfis' ? perfisParaManter.size : PRESERVADAS.includes(colecao) ? total : 0
  console.log(
    `  ${colecao.padEnd(16)} ${String(total).padStart(5)} documento(s)` +
      (PRESERVADAS.includes(colecao) ? '   ← preservada' : fica ? `   (${fica} ficam)` : ''),
  )
}

if (!apagarDeVerdade) {
  console.log('\n👀 Isto foi só a PRÉVIA. Nada foi apagado.')
  console.log('   Para apagar de verdade: node limpar-cadastros.mjs --apagar')
  console.log('   Para incluir os dados do dia:            --apagar --tudo\n')
  process.exit(0)
}

const arquivo = `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      contas: contas.map((c) => ({ uid: c.uid, email: c.email, papel: papelPorUid.get(c.uid) ?? null })),
      colecoes: inventario,
    },
    null,
    2,
  ),
)
console.log(`\n💾 Backup gravado em ${arquivo}`)

const pergunta = createInterface({ input: process.stdin, output: process.stdout })
const resposta = await pergunta.question(
  `\n⚠️  Apagar ${contasParaApagar.length} conta(s) de MOTORISTA e o conteúdo de ${colecoes.length} coleção(ões)?\n` +
    `    ${dispatchers.length} dispatcher(s) e o dono NÃO serão tocados.\n` +
    `    Isso NÃO tem volta. Escreva APAGAR para confirmar: `,
)
pergunta.close()
if (resposta.trim() !== 'APAGAR') {
  console.log('\nCancelado. Nada foi apagado.\n')
  process.exit(0)
}

// Contas primeiro: se travar no meio, sobra o cadastro VISÍVEL na tela, que
// você percebe. Ao contrário, sobraria um login invisível.
console.log('\napagando contas de login…')
for (let i = 0; i < contasParaApagar.length; i += 1000) {
  const uids = contasParaApagar.slice(i, i + 1000).map((c) => c.uid)
  const r = await auth.deleteUsers(uids)
  console.log(`  ${r.successCount} apagada(s), ${r.failureCount} com erro`)
  for (const e of r.errors) console.log(`    erro em ${uids[e.index]}: ${e.error.message}`)
}

console.log('\napagando documentos…')
for (const colecao of colecoes) {
  const manter = colecao === 'perfis' ? perfisParaManter : new Set()
  const n = await apagarColecao(colecao, manter)
  console.log(`  ${colecao.padEnd(16)} ${String(n).padStart(5)} apagado(s)`)
}

console.log('\n✅ Terminado. Backup em', arquivo, '\n')
