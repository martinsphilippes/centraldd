// Tela do DONO: quem tem acesso de COORDENADOR no sistema.
// Espelha a de motoristas — lista quem já está ativo e os pedidos pendentes,
// que só o dono aprova.

import { useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { removerPerfil, promoverParaCoordenador } from '../../core/firebase'
import { removerMotorista, enviarNotificacao } from '../../core/db'
import { EMAILS_COORDENADOR } from '../../core/firebase-config'
import { formatarTelefone } from '../../core/comunicacao'
import { formatarData } from '../../core/dates'
import type { Motorista } from '../../core/types'
import { Avatar, Badge, Button, Card, EmptyState } from '../../components/ui'

const pedeCoordenador = (funcao?: string) => funcao === 'coordenador' || funcao === 'dispatcher'

export function CoordenadoresList() {
  const db = useDB()
  const { usuarioEmail } = useSessao()
  const souDono = EMAILS_COORDENADOR.includes((usuarioEmail ?? '').toLowerCase())

  const coordenadores = db.perfis
    .filter((p) => p.papel === 'coordenador')
    .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))

  // Pedidos de acesso de coordenador ainda aguardando (pré-cadastro).
  const pendentes = db.motoristas
    .filter((m) => m.aprovado === false && pedeCoordenador(m.funcao))
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))

  const aprovar = (m: Motorista) => {
    if (!souDono) return
    if (
      !confirm(
        `Aprovar ${m.nome} como COORDENADOR?\nEle terá acesso total ao painel: programação, rotas, escalas, parâmetros e aprovações.`,
      )
    )
      return
    void promoverParaCoordenador(m.id)
    enviarNotificacao({
      motoristaId: m.id,
      titulo: 'Acesso de coordenador liberado! 🎉',
      mensagem: `${m.nome.split(' ')[0]}, seu acesso de coordenador foi aprovado — o painel completo já está disponível.`,
    })
  }

  const recusar = (m: Motorista) => {
    if (!confirm(`Recusar o pedido de ${m.nome}? A conta perderá o acesso.`)) return
    removerMotorista(m.id)
    void removerPerfil(m.id)
  }

  const rebaixar = (uid: string, email?: string) => {
    if (!souDono) return
    if (
      !confirm(
        `Remover o acesso de coordenador de ${email ?? uid}?\nA conta continua existindo, mas fica sem acesso até você liberar de novo.`,
      )
    )
      return
    void removerPerfil(uid)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">🧑‍💼 Coordenadores</h1>
        <p className="text-sm text-slate-500">
          Quem tem acesso ao painel completo da operação. Só você, como dono, aprova ou remove
          acesso de coordenador.
        </p>
      </div>

      {pendentes.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-1 font-bold text-slate-900">
            ⏳ Pedidos de acesso de coordenador ({pendentes.length})
          </h2>
          <p className="mb-3 text-xs text-slate-600">
            {souDono
              ? 'Só você pode aprovar estes pedidos.'
              : 'Aguardando a decisão do dono da operação.'}
          </p>
          <ul className="space-y-2">
            {pendentes.map((m) => (
              <li key={m.id} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar nome={m.nome} tamanho="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{m.nome}</p>
                    <p className="text-[11px] text-slate-500">
                      📱 {formatarTelefone(m.telefone)} • 📍 {m.cidade} • pedido em{' '}
                      {formatarData(m.criadoEm.slice(0, 10))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {souDono ? (
                      <Button variante="ml" onClick={() => aprovar(m)}>
                        ✅ Aprovar como coordenador
                      </Button>
                    ) : (
                      <Badge className="border-slate-300 bg-slate-100 text-slate-600">
                        🔒 Aguardando o dono
                      </Badge>
                    )}
                    <Button variante="perigo" onClick={() => recusar(m)}>
                      ✕ Recusar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {coordenadores.length === 0 ? (
        <EmptyState
          icone="🧑‍💼"
          titulo="Nenhum coordenador cadastrado"
          descricao="Quando alguém se cadastrar escolhendo “Coordenador” e você aprovar, o acesso aparece aqui."
        />
      ) : (
        <Card className="p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            {coordenadores.length} com acesso de coordenador
          </p>
          <ul className="space-y-2">
            {coordenadores.map((p) => {
              const ehDono = EMAILS_COORDENADOR.includes((p.email ?? '').toLowerCase())
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2.5"
                >
                  <Avatar nome={p.email ?? '?'} tamanho="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {p.email ?? 'conta sem e-mail registrado'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {ehDono ? '👑 Dono da operação' : '🧑‍💼 Coordenador'}
                      {p.email?.toLowerCase() === (usuarioEmail ?? '').toLowerCase() && ' • é você'}
                    </p>
                  </div>
                  {ehDono ? (
                    <Badge className="border-amber-300 bg-amber-100 text-amber-800">👑 Dono</Badge>
                  ) : (
                    souDono && (
                      <Button variante="perigo" onClick={() => rebaixar(p.id, p.email)}>
                        ✕ Remover acesso
                      </Button>
                    )
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
