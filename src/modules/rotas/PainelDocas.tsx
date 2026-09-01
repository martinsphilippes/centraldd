// O painel das 10 docas, ao vivo.
//
// É a tela que o Dispatcher olha durante o carregamento: quem está encostado,
// quem já bateu a conferência e saiu, e em qual doca ele precisa chamar o
// próximo motorista AGORA.
//
// A cor faz o trabalho: azul pede ação (chame), laranja é gente carregando,
// verde é doca cumprida. Quem olha de longe vê só o azul.

import { CORES_DOCA, situacaoDasDocas, type RotaNaDoca } from '../../core/docas'
import { useDB } from '../../core/db'
import { Card } from '../../components/ui'

/*
 * Estado, rota e nome EMPILHADOS, um por linha.
 *
 * Antes o código da rota e o rótulo do estado dividiam a mesma linha, os dois
 * cortados. Numa doca estreita sobrava "V… CHAMAR AGORA" e um nome pela
 * metade — e o painel existe justamente para o Dispatcher LER quem chamar.
 * Empilhado, cada coisa tem a largura inteira do cartão e quebra em vez de
 * sumir.
 */
function Ocupante({ item, nome }: { item: RotaNaDoca; nome: string }) {
  const cor = CORES_DOCA[item.estado]
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${cor.classe}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide">
        {cor.emoji} {cor.rotulo}
      </div>
      <div className="break-words text-sm font-extrabold leading-tight">
        {item.rota.rotaExpedicao || '—'}
      </div>
      <div className="break-words text-xs leading-tight">{nome}</div>
      {item.estado === 'carregando' && item.total > 0 && (
        // O quanto já bipou: é o que diz se a doca vaga em 2 minutos ou em 20.
        <div className="mt-1 text-[11px] font-semibold">
          {item.conferidos}/{item.total} pacotes conferidos
        </div>
      )}
    </div>
  )
}

export function PainelDocas({ data }: { data: string }) {
  const db = useDB()
  const docas = situacaoDasDocas(db, data)
  if (docas.length === 0) return null

  const nomeDe = (id: string | null) =>
    id ? (db.motoristas.find((m) => m.id === id)?.nome ?? '—') : 'sem motorista'
  const aChamar = docas.filter((d) => d.chamado).length
  const livres = docas.filter((d) => d.livre).length

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">🚪 Docas — ao vivo</h2>
        <p className="text-xs text-slate-500">
          {aChamar > 0 ? (
            <strong className="text-sky-700">{aChamar} doca(s) esperando você chamar</strong>
          ) : livres === docas.length ? (
            <strong className="text-emerald-700">carregamento concluído</strong>
          ) : (
            'nenhuma doca vaga no momento'
          )}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {docas.map((d) => {
          const naVez = d.carregando ?? d.chamado
          const restam = d.fila.filter((f) => f.estado === 'aguardando').length
          return (
            <div
              key={d.doca}
              className={`rounded-xl border-2 p-2 ${
                d.chamado
                  ? 'border-sky-400 bg-sky-50/60'
                  : d.livre
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-slate-200'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-extrabold text-slate-800">Doca {d.doca}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {d.fila.filter((f) => f.estado === 'saiu').length}/{d.fila.length}
                </span>
              </div>
              {naVez ? (
                <Ocupante item={naVez} nome={nomeDe(naVez.rota.motoristaId)} />
              ) : (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-3 text-center text-xs font-bold text-emerald-800">
                  ✅ livre
                </div>
              )}
              {restam > 0 && (
                <p className="mt-1 text-center text-[10px] text-slate-500">
                  +{restam} na fila desta doca
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        A doca só libera quando a conferência da rota <strong>bate</strong> — todo pacote esperado
        apareceu na lista do motorista. Enquanto falta pacote, ele continua encostado resolvendo, e
        chamar o próximo só criaria fila em cima de quem não saiu.
      </p>
    </Card>
  )
}
