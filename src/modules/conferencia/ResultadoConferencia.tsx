// O veredito da conferência, igual para o Dispatcher e para o motorista:
// bateu ou não bateu, e exatamente quais numerações não fecharam.
// Os dois lados precisam ver a MESMA coisa — por isso um componente só.

import { chaveNumeracao, compararConferencia } from '../../core/conferencia'
import { formatarQuando } from '../../core/dates'
import type { Conferencia } from '../../core/types'

type Pacote = NonNullable<Conferencia['pacotes']>[number]

/**
 * Faltas com o detalhe do documento do Meli: parada da rota (PD-n),
 * cidade e endereço — o motorista sabe ONDE procurar, não só o número.
 */
function FaltasDetalhadas({ valores, pacotes }: { valores: string[]; pacotes: Map<string, Pacote> }) {
  const MOSTRAR = 40
  return (
    <ul className="mt-2 space-y-1">
      {valores.slice(0, MOSTRAR).map((v) => {
        const p = pacotes.get(chaveNumeracao(v))
        return (
          <li key={v} className="rounded border border-red-200 bg-white px-2 py-1 text-[12px]">
            <span className="font-mono font-bold text-red-800">{v}</span>
            {p && (
              <span className="text-slate-600">
                {p.etiqueta && (
                  <>
                    {' '}— <strong className="text-slate-800">{p.etiqueta}</strong>
                  </>
                )}
                {p.cidade && <> · {p.cidade}</>}
                {p.endereco && <> · {p.endereco}</>}
                {p.destinatario && <> ({p.destinatario})</>}
              </span>
            )}
          </li>
        )
      })}
      {valores.length > MOSTRAR && (
        <li className="px-1 text-[11px] text-slate-500">e mais {valores.length - MOSTRAR}…</li>
      )}
    </ul>
  )
}

/** Lista de numerações em caixinhas, com corte quando é muita coisa. */
function Numeracoes({ valores, cor }: { valores: string[]; cor: string }) {
  const MOSTRAR = 60
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {valores.slice(0, MOSTRAR).map((v) => (
        <span key={v} className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold ${cor}`}>
          {v}
        </span>
      ))}
      {valores.length > MOSTRAR && (
        <span className="px-1 py-0.5 text-[11px] text-slate-500">
          e mais {valores.length - MOSTRAR}…
        </span>
      )}
    </div>
  )
}

/** Data e hora das duas importações — sempre visível nos dois lados. */
export function CarimbosConferencia({ c }: { c: Conferencia }) {
  return (
    <p className="text-[11px] leading-relaxed text-slate-500">
      📤 Dispatcher enviou em <strong>{formatarQuando(c.enviadaEm)}</strong>
      {c.arquivoDispatcher && <span className="text-slate-400"> · {c.arquivoDispatcher}</span>}
      <br />
      {c.conferidaEm ? (
        <>
          📥 Motorista conferiu em <strong>{formatarQuando(c.conferidaEm)}</strong>
          {c.arquivoMotorista && <span className="text-slate-400"> · {c.arquivoMotorista}</span>}
        </>
      ) : (
        <span className="text-amber-700">⏳ Aguardando o envio do motorista</span>
      )}
    </p>
  )
}

export function ResultadoConferencia({ c }: { c: Conferencia }) {
  if (c.conferidos === null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
        ⏳ Em stand-by — {c.esperados.length} numeração(ões) aguardando a conferência do motorista.
      </p>
    )
  }

  const r = compararConferencia(c.esperados, c.conferidos)
  if (r.bateu) {
    return (
      <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
        ✅ Bateu conferência — {r.total} numeração(ões) conferida(s), nenhuma divergência.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">
        ⚠️ Não bateu — {r.conferidos} de {r.total} conferida(s).
      </p>
      {r.faltando.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2">
          <p className="text-sm font-semibold text-red-800">
            ❌ Não apareceu na conferência ({r.faltando.length}):
          </p>
          {c.pacotes && c.pacotes.length > 0 ? (
            <FaltasDetalhadas
              valores={r.faltando}
              pacotes={new Map(c.pacotes.map((p) => [chaveNumeracao(p.numeracao), p]))}
            />
          ) : (
            <Numeracoes valores={r.faltando} cor="border-red-300 bg-white text-red-800" />
          )}
        </div>
      )}
      {r.sobrando.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <p className="text-sm font-semibold text-amber-900">
            ➕ Veio a mais, fora da lista ({r.sobrando.length}):
          </p>
          <Numeracoes valores={r.sobrando} cor="border-amber-300 bg-white text-amber-900" />
        </div>
      )}
    </div>
  )
}
