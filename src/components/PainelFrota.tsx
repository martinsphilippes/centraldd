// Painel da frota do dia: quantas vagas de CADA veículo existem e quantas já
// estão ocupadas. Aparece nos dois lugares em que o Dispatcher decide quem
// trabalha — na montagem do planejamento e no planejamento aberto — porque uma
// parametrização que ninguém vê acontecer não vale nada.

import type { Motorista, ParametrosAlocacao } from '../core/types'
import { ocupacaoDaFrota, type FrotaDoDia } from '../core/vagas'

/** Verde = fechou certo; âmbar = falta gente; vermelho = passou da vaga. */
function cores(ocupadas: number, vagas: number): string {
  if (ocupadas > vagas) return 'border-red-300 bg-red-50 text-red-800'
  if (ocupadas === vagas) return 'border-emerald-300 bg-emerald-50 text-emerald-800'
  return 'border-amber-300 bg-amber-50 text-amber-800'
}

export function PainelFrota({
  frota,
  selecionados,
  p,
  titulo = '🚐 Frota do dia',
}: {
  frota: FrotaDoDia
  selecionados: Motorista[]
  p: ParametrosAlocacao
  titulo?: string
}) {
  if (!p.respeitarFrotaDoDia) return null

  if (frota.total === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        🚐 <strong>Sem frota conhecida para este dia</strong> — não há modelo do dia, programação do
        Meli nem roteirização carregada. O planejamento segue só pela meta da chamada; assim que o
        modelo entrar, o mix por veículo passa a valer sozinho.
      </div>
    )
  }

  const oc = ocupacaoDaFrota(frota, selecionados, p)
  const ocupadasTotal = oc.linhas.reduce((s, l) => s + l.ocupadas, 0) + oc.livresOcupadas

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-slate-800">{titulo}</span>
        <span className="text-xs text-slate-500">
          {ocupadasTotal}/{frota.total} vaga(s) ocupada(s) · fonte: {frota.fonte}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {oc.linhas.map((l) => (
          <span
            key={l.tipo}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cores(l.ocupadas, l.vagas)}`}
            title={`${l.candidatos} motorista(s) selecionado(s) dirigem ${l.tipo}`}
          >
            {l.tipo} {l.ocupadas}/{l.vagas}
          </span>
        ))}
        {frota.livres > 0 && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cores(oc.livresOcupadas, frota.livres)}`}
            title="Vagas que o modelo não separou por veículo — servem para qualquer um"
          >
            sem veículo definido {oc.livresOcupadas}/{frota.livres}
          </span>
        )}
      </div>
      {oc.excedentes.length > 0 && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
          ⚠️ <strong>{oc.excedentes.length} acima do que o dia comporta:</strong>{' '}
          {oc.excedentes.map((m) => `${m.nome} (${m.veiculo || 'sem veículo'})`).join(', ')} — não há
          vaga desse veículo hoje. O lugar deles é a fila de espera.
        </p>
      )}
      {frota.divergencia && (
        <p className="mt-2 text-xs text-amber-700">⚠️ No modelo do dia, {frota.divergencia}.</p>
      )}
    </div>
  )
}
