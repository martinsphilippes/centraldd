// Gráficos em SVG puro — leves, sem dependências externas.

export interface FatiaDonut {
  rotulo: string
  valor: number
  cor: string
}

export function DonutChart({ fatias, tamanho = 160 }: { fatias: FatiaDonut[]; tamanho?: number }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0)
  const raio = 40
  const circ = 2 * Math.PI * raio
  let acumulado = 0
  return (
    <div className="flex items-center gap-4">
      <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" role="img" aria-label="Gráfico de distribuição">
        <circle cx="50" cy="50" r={raio} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        {total > 0 &&
          fatias
            .filter((f) => f.valor > 0)
            .map((f) => {
              const frac = f.valor / total
              const el = (
                <circle
                  key={f.rotulo}
                  cx="50"
                  cy="50"
                  r={raio}
                  fill="none"
                  stroke={f.cor}
                  strokeWidth="14"
                  strokeDasharray={`${frac * circ} ${circ}`}
                  strokeDashoffset={-acumulado * circ}
                  transform="rotate(-90 50 50)"
                />
              )
              acumulado += frac
              return el
            })}
        <text x="50" y="47" textAnchor="middle" className="fill-slate-900" fontSize="16" fontWeight="700">
          {total}
        </text>
        <text x="50" y="60" textAnchor="middle" className="fill-slate-500" fontSize="7">
          respostas
        </text>
      </svg>
      <ul className="space-y-1 text-xs">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.cor }} />
            <span className="text-slate-600">{f.rotulo}</span>
            <span className="font-semibold text-slate-900">{f.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface BarraDia {
  rotulo: string
  valores: { valor: number; cor: string }[]
}

/** Barras agrupadas por dia (disponíveis × indisponíveis × pendentes). */
export function BarChart({ barras, altura = 140 }: { barras: BarraDia[]; altura?: number }) {
  const max = Math.max(1, ...barras.flatMap((b) => b.valores.map((v) => v.valor)))
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-3" style={{ height: altura + 24 }}>
        {barras.map((b, i) => (
          <div key={i} className="flex min-w-10 flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: altura }}>
              {b.valores.map((v, j) => (
                <div
                  key={j}
                  title={String(v.valor)}
                  className="w-full max-w-4 rounded-t transition-all"
                  style={{ height: `${Math.max(2, (v.valor / max) * 100)}%`, background: v.cor }}
                />
              ))}
            </div>
            <span className="whitespace-nowrap text-[10px] font-medium text-slate-500">{b.rotulo}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Legenda({ itens }: { itens: { rotulo: string; cor: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
      {itens.map((i) => (
        <span key={i.rotulo} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  )
}
