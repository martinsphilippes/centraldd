import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

// ---------- Botão ----------

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'marca'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-navy text-white hover:bg-navy-claro shadow-sm',
  // Laranja da marca com texto azul-noite: branco sobre laranja dá 2,9:1,
  // ilegível. Assim o botão principal fica em 5,9:1.
  marca: 'bg-marca text-navy hover:bg-marca-escura shadow-sm font-semibold',
  secundario: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  perigo: 'bg-red-600 text-white hover:bg-red-700',
  fantasma: 'text-slate-600 hover:bg-slate-100',
}

export function Button({
  variante = 'primario',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
      {...props}
    />
  )
}

// ---------- Card ----------

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(20,27,46,0.06)] ${className}`}
    >
      {children}
    </div>
  )
}

// ---------- Badge ----------

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  )
}

// ---------- Campos de formulário ----------

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  )
}

const CAMPO =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-marca-texto focus:ring-2 focus:ring-marca-texto/20'

// O className de fora SOMA ao padrão, não substitui. Espalhar `props` depois
// de className fazia o campo perder tudo — inclusive a largura — e ele voltava
// ao tamanho padrão do navegador, cortando o texto no celular.
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CAMPO} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CAMPO} ${className}`} {...props} />
}

// ---------- Indicadores ----------

export function StatCard({
  icone,
  valor,
  rotulo,
  destaque = false,
}: {
  icone: string
  valor: ReactNode
  rotulo: string
  destaque?: boolean
}) {
  return (
    <Card className={`p-4 ${destaque ? 'border-marca bg-marca-suave' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icone}</span>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight text-slate-900">{valor}</div>
          <div className="truncate text-xs font-medium text-slate-500">{rotulo}</div>
        </div>
      </div>
    </Card>
  )
}

export function ProgressBar({
  valor,
  total,
  cor = 'bg-marca-texto',
}: {
  valor: number
  total: number
  cor?: string
}) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function EmptyState({ icone, titulo, descricao }: { icone: string; titulo: string; descricao?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="mb-2 text-4xl">{icone}</span>
      <p className="font-semibold text-slate-700">{titulo}</p>
      {descricao && <p className="mt-1 max-w-sm text-sm text-slate-500">{descricao}</p>}
    </div>
  )
}

export function Avatar({ nome, tamanho = 'md' }: { nome: string; tamanho?: 'sm' | 'md' | 'lg' }) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
  const cls = tamanho === 'sm' ? 'h-7 w-7 text-[10px]' : tamanho === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-xs'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-navy font-bold text-marca ${cls}`}
    >
      {iniciais}
    </span>
  )
}

export function SegmentedControl<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: { valor: T; rotulo: string }[]
  valor: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          onClick={() => onChange(o.valor)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            valor === o.valor ? 'bg-navy text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

// ---------- Modal ----------

export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
}: {
  aberto: boolean
  titulo: string
  onFechar: () => void
  children: ReactNode
}) {
  if (!aberto) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{titulo}</h3>
          <button
            onClick={onFechar}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
