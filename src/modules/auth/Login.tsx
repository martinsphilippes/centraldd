import { useState, type FormEvent } from 'react'
import { useSessao } from '../../context/SessaoContext'
import { configPendente } from '../../core/firebase-config'
import { Button, Card, Field, Input } from '../../components/ui'

const MENSAGENS: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
}

export function Login() {
  const { entrar, erroSessao } = useSessao()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const mensagemErro = erro || erroSessao

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await entrar(email, senha)
    } catch (err) {
      const codigo = (err as { code?: string }).code ?? ''
      setErro(MENSAGENS[codigo] ?? 'Não foi possível entrar. Tente novamente.')
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
          ) : (
            <form onSubmit={enviar} className="space-y-4">
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
            </form>
          )}
        </Card>
        <p className="mt-4 text-center text-xs text-slate-400">
          Motorista: sua conta é criada pela coordenação.
          <br />
          Esqueceu a senha? Fale com a coordenação.
        </p>
      </div>
    </div>
  )
}
