import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSessao } from '../context/SessaoContext'
import { useDB } from '../core/db'
import { Avatar } from '../components/ui'
import { InstalarBanner } from '../components/InstalarApp'

const NAV_COORDENADOR = [
  { para: '/', rotulo: 'Dashboard', icone: '📊' },
  { para: '/chamadas', rotulo: 'Chamadas', icone: '⏰' },
  { para: '/agenda-frota', rotulo: 'Agenda', icone: '📅' },
  { para: '/rotas', rotulo: 'Rotas', icone: '🛣️' },
  { para: '/motoristas', rotulo: 'Motoristas', icone: '🚚' },
  { para: '/escalas', rotulo: 'Escalas', icone: '📋' },
  { para: '/relatorios', rotulo: 'Relatórios', icone: '📈' },
]

const NAV_MOTORISTA = [
  { para: '/responder', rotulo: 'Responder', icone: '✋' },
  { para: '/agenda', rotulo: 'Agenda', icone: '📅' },
  { para: '/minhas-escalas', rotulo: 'Escalas', icone: '📋' },
  { para: '/notificacoes', rotulo: 'Avisos', icone: '🔔' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { papel, motoristaId, usuarioEmail, sair } = useSessao()
  const db = useDB()
  const nav = papel === 'coordenador' ? NAV_COORDENADOR : NAV_MOTORISTA
  const motorista = db.motoristas.find((m) => m.id === motoristaId)
  const nomeExibicao = papel === 'coordenador' ? 'Coordenação' : (motorista?.nome ?? usuarioEmail ?? '')
  const naoLidas =
    papel === 'motorista' && motoristaId
      ? db.notificacoes.filter((n) => !n.lida && (n.motoristaId === null || n.motoristaId === motoristaId)).length
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
          {nav.map((item) => (
            <NavLink
              key={item.para}
              to={item.para}
              end={item.para === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-ml-amarelo text-slate-900' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span>{item.icone}</span>
              {item.rotulo}
              {item.para === '/notificacoes' && naoLidas > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {naoLidas}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-[10px] text-slate-400">
          Operação logística • v2.0
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
                  {papel === 'coordenador' ? '🧑‍💼 Coordenador' : '🚚 Motorista'}
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

      {/* Menu inferior mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white lg:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.para}
            to={item.para}
            end={item.para === '/'}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
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
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
