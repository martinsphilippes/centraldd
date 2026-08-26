import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSessao } from '../context/SessaoContext'
import { useDB } from '../core/db'
import { EMAILS_DISPATCHER } from '../core/firebase-config'
import { Avatar } from '../components/ui'
import { InstalarBanner } from '../components/InstalarApp'

// O menu segue a ESTEIRA da operação: partida (agenda ∥ programação),
// depois chamada → escala → rotas, e por fim cadastro e análise.
interface ItemNav {
  para: string
  rotulo: string
  icone: string
  grupo: string
  /** Número da etapa na esteira (etapas de partida dividem o passo 1). */
  passo?: number
  /** true = item exclusivo do DONO da operação. */
  soDono?: boolean
}

const NAV_DISPATCHER: ItemNav[] = [
  { para: '/', rotulo: 'Dashboard', icone: '📊', grupo: 'Painel' },
  { para: '/programacao', rotulo: 'Programação', icone: '📆', grupo: 'Fluxo do dia', passo: 1 },
  { para: '/agenda-frota', rotulo: 'Agenda', icone: '📅', grupo: 'Fluxo do dia', passo: 1 },
  { para: '/chamadas', rotulo: 'Chamadas', icone: '⏰', grupo: 'Fluxo do dia', passo: 2 },
  { para: '/escalas', rotulo: 'Escalas', icone: '📋', grupo: 'Fluxo do dia', passo: 3 },
  { para: '/rotas', rotulo: 'Rotas', icone: '🛣️', grupo: 'Fluxo do dia', passo: 4 },
  { para: '/motoristas', rotulo: 'Motoristas', icone: '🚚', grupo: 'Cadastro e análise' },
  { para: '/dispatchers', rotulo: 'Dispatchers', icone: '🧑‍💼', grupo: 'Cadastro e análise', soDono: true },
  { para: '/cidades', rotulo: 'Cidades', icone: '📍', grupo: 'Cadastro e análise' },
  { para: '/tipos', rotulo: 'Opções', icone: '🏷️', grupo: 'Cadastro e análise' },
  { para: '/relatorios', rotulo: 'Relatórios', icone: '📈', grupo: 'Cadastro e análise' },
]

const NAV_MOTORISTA: ItemNav[] = [
  { para: '/responder', rotulo: 'Responder', icone: '✋', grupo: 'Meu dia', passo: 1 },
  { para: '/agenda', rotulo: 'Agenda', icone: '📅', grupo: 'Meu dia', passo: 1 },
  { para: '/minhas-escalas', rotulo: 'Planejamento', icone: '📋', grupo: 'Meu dia', passo: 2 },
  { para: '/minhas-rotas', rotulo: 'Rotas', icone: '🛣️', grupo: 'Meu dia', passo: 3 },
  { para: '/notificacoes', rotulo: 'Avisos', icone: '🔔', grupo: 'Meu dia' },
  { para: '/minhas-cidades', rotulo: 'Cidades', icone: '📍', grupo: 'Minhas preferências' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { papel, motoristaId, usuarioEmail, sair } = useSessao()
  const db = useDB()
  const souDono = EMAILS_DISPATCHER.includes((usuarioEmail ?? '').toLowerCase())
  const nav = (papel === 'dispatcher' ? NAV_DISPATCHER : NAV_MOTORISTA).filter(
    (item) => !item.soDono || souDono,
  )
  const motorista = db.motoristas.find((m) => m.id === motoristaId)
  const nomeExibicao = papel === 'dispatcher' ? 'Dispatcher' : (motorista?.nome ?? usuarioEmail ?? '')
  const naoLidas =
    papel === 'motorista' && motoristaId
      ? db.notificacoes.filter((n) => !n.lida && (n.motoristaId === null || n.motoristaId === motoristaId)).length
      : 0
  const minhasRotas =
    papel === 'motorista' && motoristaId
      ? db.rotas.filter((r) => r.motoristaId === motoristaId && !r.finalizadaEm).length
      : 0

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-ml-navy lg:flex">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ml-amarelo text-lg">🚚</span>
          <div>
            <div className="text-sm font-bold leading-tight text-white">MLDisponibilidade</div>
            <div className="text-[10px] font-medium text-ml-amarelo">Mercado Livre 📦</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item, i) => (
            <div key={item.para}>
              {/* Cabeçalho do grupo: separa painel, fluxo do dia e cadastros. */}
              {item.grupo !== nav[i - 1]?.grupo && (
                <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {item.grupo}
                </p>
              )}
            <NavLink
              to={item.para}
              end={item.para === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-ml-amarelo text-slate-900' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.passo ? (
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isActive ? 'bg-slate-900/15 text-slate-900' : 'bg-white/15 text-slate-200'
                      }`}
                    >
                      {item.passo}
                    </span>
                  ) : (
                    <span className="w-5 shrink-0" />
                  )}
                  <span>{item.icone}</span>
                  {item.rotulo}
                  {item.para === '/notificacoes' && naoLidas > 0 && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {naoLidas}
                    </span>
                  )}
                  {item.para === '/minhas-rotas' && minhasRotas > 0 && (
                    <span
                      className={`ml-auto rounded-full px-1.5 text-[10px] font-bold ${
                        isActive ? 'bg-slate-900 text-white' : 'bg-ml-amarelo text-slate-900'
                      }`}
                    >
                      {minhasRotas}
                    </span>
                  )}
                </>
              )}
            </NavLink>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-[10px] text-slate-400">
          Operação logística • versão {__BUILD_ID__}
        </div>
      </aside>

      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ml-amarelo">🚚</span>
            <span className="text-sm font-bold">MLDisponibilidade</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <Avatar nome={nomeExibicao || '?'} tamanho="sm" />
              <div className="hidden text-left sm:block">
                <div className="max-w-40 truncate text-xs font-bold leading-tight text-slate-800">{nomeExibicao}</div>
                <div className="text-[10px] leading-tight text-slate-500">
                  {papel === 'dispatcher' ? '🧑‍💼 Dispatcher' : '🚚 Motorista'}
                </div>
              </div>
            </div>
            <button
              onClick={() => void sair()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              title="Sair da conta"
            >
              Sair ↪
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 pb-24 lg:p-6 lg:pb-8">
        <div className="mb-4 empty:mb-0 lg:hidden">
          <InstalarBanner />
        </div>
        {children}
      </main>

      {/* Menu inferior mobile (rolável quando há muitos itens) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-slate-200 bg-white lg:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.para}
            to={item.para}
            end={item.para === '/'}
            className={({ isActive }) =>
              `relative flex min-w-16 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                isActive ? 'text-ml-azul' : 'text-slate-500'
              }`
            }
          >
            <span className="text-lg">{item.icone}</span>
            {item.rotulo}
            {item.para === '/notificacoes' && naoLidas > 0 && (
              <span className="absolute right-1/4 top-1 rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
                {naoLidas}
              </span>
            )}
            {item.para === '/minhas-rotas' && minhasRotas > 0 && (
              <span className="absolute right-1/4 top-1 rounded-full bg-ml-amarelo px-1.5 text-[9px] font-bold text-slate-900">
                {minhasRotas}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
