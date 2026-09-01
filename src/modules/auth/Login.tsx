import { useEffect, useState, type FormEvent } from 'react'
import { useSessao } from '../../context/SessaoContext'
import { configPendente } from '../../core/firebase-config'
import { cadastrarPreCadastro, carregarTiposPublicos } from '../../core/firebase'
import { OPERACOES, VEICULOS } from '../../core/constants'
import { CampoCidade } from './CampoCidade'
import { Button, Card, Field, Input, Select } from '../../components/ui'
import { InstalarBanner } from '../../components/InstalarApp'
import { MarcaEmpilhada } from '../../components/Marca'

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

/**
 * O primeiro campo obrigatório que está faltando, já como frase para a tela —
 * ou string vazia quando está tudo preenchido.
 *
 * A ordem segue a do formulário: reclamar do e-mail enquanto o nome está vazio
 * faria a pessoa corrigir de trás para frente.
 */
function primeiroCampoVazio(d: {
  nome: string
  telefone: string
  cidade: string
  email: string
  veiculo: string
  funcao: 'motorista' | 'dispatcher'
}): string {
  if (!d.nome.trim()) return 'Preencha seu nome completo.'
  const digitos = d.telefone.replace(/\D/g, '')
  if (!digitos) return 'Preencha seu telefone de WhatsApp.'
  // DDD + número: 10 dígitos no fixo, 11 no celular. Telefone pela metade é o
  // mesmo que telefone nenhum na hora de chamar para a rota.
  if (digitos.length < 10) return 'O telefone está incompleto — informe o DDD e o número.'
  if (!d.cidade.trim()) return 'Informe sua cidade.'
  if (!d.email.trim()) return 'Preencha o e-mail, que será seu login.'
  if (d.funcao === 'motorista' && !d.veiculo) return 'Escolha o veículo que você dirige.'
  return ''
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
  const [funcao, setFuncao] = useState<'motorista' | 'dispatcher'>('motorista')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [cidadeValida, setCidadeValida] = useState(false)
  // Os veículos vêm do que o Dispatcher cadastrou (tela Tipos); os padrões
  // (Utilitário e VUC) só valem enquanto ele não tiver cadastrado a frota.
  const [veiculosOpcoes, setVeiculosOpcoes] = useState<string[]>(VEICULOS)
  // Começa VAZIO de propósito: escolher o veículo é obrigatório, e um valor
  // já preenchido faria todo mundo passar batido no primeiro da lista.
  const [veiculo, setVeiculo] = useState('')

  useEffect(() => {
    void carregarTiposPublicos().then(({ veiculos }) => {
      if (veiculos.length > 0) setVeiculosOpcoes(veiculos)
    })
  }, [])

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
    // Tudo aqui é obrigatório de verdade: cadastro pela metade vira motorista
    // sem telefone na hora de chamar para a rota, ou sem veículo na hora de
    // distribuir. Melhor barrar agora do que descobrir no dia da operação.
    const faltando = primeiroCampoVazio({ nome, telefone, cidade, email, veiculo, funcao })
    if (faltando) {
      setErro(faltando)
      return
    }
    if (!cidadeValida) {
      setErro('Escolha a cidade na lista que aparece enquanto você digita.')
      return
    }
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setEnviando(true)
    try {
      await cadastrarPreCadastro({
        nome,
        telefone,
        cidade,
        operacao: OPERACOES[0],
        veiculo,
        email,
        senha,
        funcao,
      })
      // Ao concluir, a sessão entra automaticamente e cai na tela de aguardando aprovação.
    } catch (err) {
      setErro(codigoParaMensagem(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy p-4">
      {/* Brilho laranja atrás do cartão: dá profundidade ao azul-noite sem
          roubar contraste do formulário, que fica em branco por cima. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-marca/10 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          <MarcaEmpilhada />
        </div>
        <div className="mb-3">
          <InstalarBanner />
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
              <Button type="submit" variante="marca" className="w-full" disabled={enviando}>
                {enviando ? 'Entrando…' : '➡️ Entrar'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setErro('')
                  setTela('cadastro')
                }}
                className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-semibold text-marca-texto transition-colors hover:bg-orange-50"
              >
                🚚 Sou motorista novo — fazer meu cadastro
              </button>
            </form>
          ) : (
            <form onSubmit={fazerCadastro} className="space-y-3">
              <p className="text-sm text-slate-600">
                Preencha seus dados. Seu acesso será liberado <strong>após a aprovação do Dispatcher</strong>.
              </p>
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Qual é a sua função?
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFuncao('motorista')}
                    className={`rounded-xl border-2 p-2.5 text-sm font-semibold transition-colors ${
                      funcao === 'motorista'
                        ? 'border-marca-texto bg-orange-50 text-marca-texto'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    🚚 Motorista
                  </button>
                  <button
                    type="button"
                    onClick={() => setFuncao('dispatcher')}
                    className={`rounded-xl border-2 p-2.5 text-sm font-semibold transition-colors ${
                      funcao === 'dispatcher'
                        ? 'border-marca-texto bg-orange-50 text-marca-texto'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    🧑 Dispatcher
                  </button>
                </div>
                {funcao === 'dispatcher' && (
                  <p className="mt-1.5 rounded-lg bg-marca-suave px-2.5 py-1.5 text-[11px] text-slate-600">
                    Cadastro de dispatcher é aprovado <strong>somente pelo dono da operação</strong>.
                    Aprovado, você recebe o painel completo (programação, chamadas, planejamento e rotas).
                  </p>
                )}
              </div>
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
              <Field label="📍 Cidade">
                <CampoCidade
                  valor={cidade}
                  onChange={(c, valida) => {
                    setCidade(c)
                    setCidadeValida(valida)
                  }}
                />
              </Field>
              {funcao === 'motorista' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="📦 Operação">
                    {/* Fixa: a frota inteira roda Mercado Livre. Aparece só
                        para a pessoa conferir, não para escolher. */}
                    <div className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                      📦 {OPERACOES[0]}
                    </div>
                  </Field>
                  <Field label="🚐 Veículo">
                    <Select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>
                      <option value="">Selecione…</option>
                      {veiculosOpcoes.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
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
              <Button type="submit" variante="marca" className="w-full" disabled={enviando}>
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
          Esqueceu a senha? Fale com o Dispatcher.
        </p>
      </div>
    </div>
  )
}
