import { useState, type FormEvent } from 'react'
import { useSessao } from '../../context/SessaoContext'
import { configPendente } from '../../core/firebase-config'
import { cadastrarPreCadastro } from '../../core/firebase'
import { OPERACOES, VEICULOS } from '../../core/constants'
import { Button, Card, Field, Input, Select } from '../../components/ui'

const MENSAGENS: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Este e-mail já possui uma conta. Volte e faça login.',
  'auth/weak-password': 'Senha muito fraca — use pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
}

function codigoParaMensagem(err: unknown): string {
  const codigo = (err as { code?: string }).code ?? ''
  return MENSAGENS[codigo] ?? 'Algo deu errado. Tente novamente.'
}

export function Login() {
  const { entrar, erroSessao } = useSessao()
  const [tela, setTela] = useState<'login' | 'cadastro'>('login')

  // Login
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Pré-cadastro
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [equipe, setEquipe] = useState('')
  const [operacao, setOperacao] = useState(OPERACOES[0])
  const [veiculo, setVeiculo] = useState(VEICULOS[0])

  const mensagemErro = erro || erroSessao

  const fazerLogin = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await entrar(email, senha)
    } catch (err) {
      setErro(codigoParaMensagem(err))
    } finally {
      setEnviando(false)
    }
  }

  const fazerCadastro = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setEnviando(true)
    try {
      await cadastrarPreCadastro({ nome, telefone, cidade, equipe, operacao, veiculo, email, senha })
      // Ao concluir, a sessão entra automaticamente e cai na tela de aguardando aprovação.
    } catch (err) {
      setErro(codigoParaMensagem(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ml-navy p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-ml-amarelo text-3xl shadow-lg">
            🚚
          </span>
          <h1 className="mt-3 text-2xl font-bold text-white">MLDisponibilidade</h1>
          <p className="text-sm font-medium text-ml-amarelo">Mercado Livre 📦 • Gestão de motoristas</p>
        </div>
        <Card className="p-6">
          {configPendente ? (
            <p className="text-center text-sm text-slate-600">
              ⚙️ O sistema ainda não foi conectado ao banco de dados.
              <br />
              Peça ao administrador para concluir a configuração do Firebase.
            </p>
          ) : tela === 'login' ? (
            <form onSubmit={fazerLogin} className="space-y-4">
              <Field label="📧 E-mail">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                />
              </Field>
              <Field label="🔒 Senha">
                <Input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </Field>
              {mensagemErro && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {mensagemErro}
                </p>
              )}
              <Button type="submit" variante="ml" className="w-full" disabled={enviando}>
                {enviando ? 'Entrando…' : '➡️ Entrar'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setErro('')
                  setTela('cadastro')
                }}
                className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-semibold text-ml-azul transition-colors hover:bg-blue-50"
              >
                🚚 Sou motorista novo — fazer meu cadastro
              </button>
            </form>
          ) : (
            <form onSubmit={fazerCadastro} className="space-y-3">
              <p className="text-sm text-slate-600">
                Preencha seus dados. Seu acesso será liberado <strong>após a aprovação da coordenação</strong>.
              </p>
              <Field label="Nome completo">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex.: Carlos Silva" />
              </Field>
              <Field label="📱 Telefone (WhatsApp)">
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  required
                  inputMode="tel"
                  placeholder="Ex.: 11 98765-4321"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="📍 Cidade">
                  <Input value={cidade} onChange={(e) => setCidade(e.target.value)} required placeholder="Ex.: Guarulhos" />
                </Field>
                <Field label="👥 Equipe">
                  <Input value={equipe} onChange={(e) => setEquipe(e.target.value)} placeholder="Se souber" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="📦 Operação">
                  <Select value={operacao} onChange={(e) => setOperacao(e.target.value)}>
                    {OPERACOES.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="🚐 Veículo">
                  <Select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>
                    {VEICULOS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="📧 E-mail (será seu login)">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                />
              </Field>
              <Field label="🔒 Senha (mín. 6 caracteres)">
                <Input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Crie uma senha"
                />
              </Field>
              {mensagemErro && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {mensagemErro}
                </p>
              )}
              <Button type="submit" variante="ml" className="w-full" disabled={enviando}>
                {enviando ? 'Enviando…' : '📝 Enviar meu cadastro'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setErro('')
                  setTela('login')
                }}
                className="w-full py-1 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                ← Já tenho conta, voltar ao login
              </button>
            </form>
          )}
        </Card>
        <p className="mt-4 text-center text-xs text-slate-400">
          Esqueceu a senha? Fale com a coordenação.
        </p>
      </div>
    </div>
  )
}
