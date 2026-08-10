import { useSessao } from '../../context/SessaoContext'
import { Button, Card } from '../../components/ui'

/** Tela exibida ao motorista com pré-cadastro ainda não aprovado pela coordenação. */
export function AguardandoAprovacao({ nome }: { nome: string }) {
  const { sair } = useSessao()
  return (
    <div className="flex min-h-screen items-center justify-center bg-ml-navy p-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <span className="text-5xl">⏳</span>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Cadastro enviado, {nome.split(' ')[0]}!</h1>
        <p className="mt-2 text-sm text-slate-600">
          Seu cadastro está <strong>aguardando a aprovação da coordenação</strong>.
          Assim que for aprovado, esta tela libera automaticamente o seu acesso —
          não precisa criar conta de novo.
        </p>
        <p className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-slate-600">
          💡 Dica: avise a coordenação pelo WhatsApp que você concluiu o cadastro,
          para acelerar a liberação.
        </p>
        <Button variante="secundario" className="mt-4 w-full" onClick={() => void sair()}>
          Sair
        </Button>
      </Card>
    </div>
  )
}
