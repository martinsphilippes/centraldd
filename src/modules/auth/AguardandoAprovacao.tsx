import { useSessao } from '../../context/SessaoContext'
import { Button, Card } from '../../components/ui'

/**
 * Tela de quem ainda não tem acesso liberado: pré-cadastro aguardando
 * aprovação, cadastro desativado pelo Dispatcher, ou conta sem cadastro
 * vinculado. Em nenhum desses casos o app abre.
 */
export function AguardandoAprovacao({
  nome,
  funcao,
  desativado,
  semCadastro,
}: {
  nome: string
  funcao?: string
  desativado?: boolean
  semCadastro?: boolean
}) {
  const { sair, usuarioEmail } = useSessao()
  const ehDispatcher = funcao === 'dispatcher'
  const primeiroNome = nome.trim() ? nome.trim().split(' ')[0] : ''

  if (semCadastro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy p-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <span className="text-5xl">🔒</span>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Acesso ainda não liberado</h1>
          <p className="mt-2 text-sm text-slate-600">
            Esta conta ({usuarioEmail}) não tem cadastro vinculado na operação. Fale com a
            Dispatcher para liberar o seu acesso.
          </p>
          <Button variante="secundario" className="mt-4 w-full" onClick={() => void sair()}>
            Sair
          </Button>
        </Card>
      </div>
    )
  }

  if (desativado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy p-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <span className="text-5xl">⛔</span>
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            Acesso pausado{primeiroNome && `, ${primeiroNome}`}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Seu cadastro está <strong>desativado</strong> na operação. Fale com o Dispatcher para
            reativar — assim que reativarem, esta tela libera sozinha.
          </p>
          <Button variante="secundario" className="mt-4 w-full" onClick={() => void sair()}>
            Sair
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy p-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <span className="text-5xl">⏳</span>
        <h1 className="mt-3 text-xl font-bold text-slate-900">
          Cadastro enviado{primeiroNome && `, ${primeiroNome}`}!
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Seu cadastro {ehDispatcher && <strong>de dispatcher </strong>}está{' '}
          <strong>aguardando a aprovação do Dispatcher</strong>. Assim que for aprovado, esta tela
          libera automaticamente o seu acesso{ehDispatcher && <> ao <strong>painel completo do dispatcher</strong></>} —
          não precisa criar conta de novo.
        </p>
        <p className="mt-3 rounded-lg border border-orange-300 bg-marca-suave p-3 text-xs text-slate-600">
          💡 Dica: avise o Dispatcher pelo WhatsApp que você concluiu o cadastro,
          para acelerar a liberação.
        </p>
        <Button variante="secundario" className="mt-4 w-full" onClick={() => void sair()}>
          Sair
        </Button>
      </Card>
    </div>
  )
}
