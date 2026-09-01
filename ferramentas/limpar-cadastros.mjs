/*
 * Apaga os cadastros de teste do Central DD: contas de login, perfis,
 * cadastros de motorista e o histórico que aponta para eles.
 *
 * Roda na SUA máquina, com a SUA chave — nenhum segredo passa por chat.
 *
 * COMO USAR
 *   1. Firebase Console → ⚙️ Configurações do projeto → Contas de serviço
 *      → "Gerar nova chave privada". Salve como chave.json NESTA pasta.
 *   2. npm install firebase-admin
 *   3. node limpar-cadastros.mjs              ← só MOSTRA o que faria
 *   4. node limpar-cadastros.mjs --apagar     ← apaga de verdade
 *
 *   Modos:
 *     (padrão)   contas, perfis, motoristas e tudo que referencia motorista
 *     --tudo     o acima MAIS chamadas, rotas, programação, resumos e limites
 *
 * O QUE NUNCA É APAGADO
 *   - A conta do DONO (e-mail abaixo) e o perfil dela.
 *   - config (parâmetros), cidades e tipos (opções de cadastro) — é a
 *     configuração da operação, não dado de teste.
 *
 * Antes de apagar qualquer coisa, grava um backup .json nesta pasta. No
 * Firestore e no Auth não existe lixeira: o que sai não volta.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const DONO = 'martinsphilippes@gmail.com'

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
const colecoes = incluirDia ? [...DE_PESSOAS, ...DO_DIA] : DE_PESSOAS

initializeApp({ credential: cert(JSON.parse(readFileSync('./chave.json', 'utf8'))) })
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
const dono = contas.find((c) => (c.email ?? '').toLowerCase() === DONO)
const contasParaApagar = contas.filter((c) => c.uid !== dono?.uid)

console.log('\n=== O QUE EXISTE HOJE ===')
console.log(`contas de login: ${contas.length}`)
if (dono) console.log(`  o dono (${DONO}) fica: ${dono.uid}`)
else console.log(`  ⚠️  NÃO achei a conta do dono (${DONO}) — confira o e-mail no topo do script`)
console.log(`  a apagar: ${contasParaApagar.length}`)
for (const c of contasParaApagar.slice(0, 40)) console.log(`    · ${c.email ?? '(sem e-mail)'}`)
if (contasParaApagar.length > 40) console.log(`    … e mais ${contasParaApagar.length - 40}`)

console.log('\ncoleções:')
const inventario = {}
for (const colecao of [...colecoes, ...PRESERVADAS]) {
  inventario[colecao] = await documentosDe(colecao)
  const preservada = PRESERVADAS.includes(colecao)
  const manter = colecao === 'perfis' && dono ? 1 : 0
  console.log(
    `  ${colecao.padEnd(16)} ${String(inventario[colecao].length).padStart(5)} documento(s)` +
      (preservada ? '   ← preservada' : manter ? `   (${manter} do dono fica)` : ''),
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
    { geradoEm: new Date().toISOString(), contas: contas.map((c) => ({ uid: c.uid, email: c.email })), colecoes: inventario },
    null,
    2,
  ),
)
console.log(`\n💾 Backup gravado em ${arquivo}`)

const pergunta = createInterface({ input: process.stdin, output: process.stdout })
const resposta = await pergunta.question(
  `\n⚠️  Apagar ${contasParaApagar.length} conta(s) e o conteúdo de ${colecoes.length} coleção(ões)?\n` +
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
  const manter = colecao === 'perfis' && dono ? new Set([dono.uid]) : new Set()
  const n = await apagarColecao(colecao, manter)
  console.log(`  ${colecao.padEnd(16)} ${String(n).padStart(5)} apagado(s)`)
}

console.log('\n✅ Terminado. Backup em', arquivo, '\n')
