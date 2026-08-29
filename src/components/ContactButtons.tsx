import type { Motorista } from '../core/types'
import { linkLigacao, linkWhatsApp } from '../core/comunicacao'
import { enviarNotificacao } from '../core/db'

/** Botões rápidos de contato: WhatsApp, ligação e notificação in-app. */
export function ContactButtons({
  motorista,
  mensagem,
  compacto = false,
}: {
  motorista: Motorista
  mensagem?: string
  compacto?: boolean
}) {
  const btn = `inline-flex items-center justify-center gap-1 rounded-lg border text-sm font-medium transition-colors ${
    compacto ? 'h-8 w-8' : 'px-3 py-1.5'
  }`
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={linkWhatsApp(motorista, mensagem)}
        target="_blank"
        rel="noreferrer"
        title="Conversar pelo WhatsApp"
        className={`${btn} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
      >
        💬{!compacto && ' WhatsApp'}
      </a>
      <a
        href={linkLigacao(motorista)}
        title="Ligar"
        className={`${btn} border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100`}
      >
        📞{!compacto && ' Ligar'}
      </a>
      <button
        title="Enviar notificação pelo app"
        onClick={() =>
          enviarNotificacao({
            motoristaId: motorista.id,
            titulo: 'Aviso do Dispatcher',
            mensagem: mensagem ?? 'O Dispatcher precisa falar com você. Verifique suas chamadas.',
          })
        }
        className={`${btn} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}
      >
        🔔{!compacto && ' Notificar'}
      </button>
    </div>
  )
}
