import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSessao } from '../context/SessaoContext'
import { useDB } from '../core/db'
import { Avatar } from '../components/ui'

const NAV_COORDENADOR = [
  { para: '/', rotulo: 'Dashboard', icone: '📊' },
  { para: '/chamadas', rotulo: 'Chamadas', icone: '⏰' },
  { para: '/motoristas', rotulo: 'Motoristas', icone: '🚚' },
  { para: '/escalas', rotulo: 'Escalas', icone: '📋' },
  { para: '/relatorios', rotulo: 'Relatórios', icone: '📈' },
]

const NAV_MOTORISTA = [
  { para: '/responder', rotulo: 'Responder', icone: '✋' },
  { para: '/minhas-escalas', rotulo: 'Minhas escalas', icone: '📋' },
  { para: '/notificacoes', rotulo: 'Notificações', icone: '🔔' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { papel, motoristaId, setPapel, setMotoristaId } = useSessao()
  const db = useDB()
  const navigate = useNavigate()
  const nav = papel === 'coordenador' ? NAV_COORDENADOR : NAV_MOTORISTA
  const motorista = db.motoristas.find((m) => m.id === motoristaId)
  const naoLidas = motorista
    ? db.notificacoes.filter((n) => !n.lida && (n.motoristaId === null || n.motoristaId === motorista.id)).length
    : 0

  const trocarPapel = (novo: 'coordenador' | 'motorista') => {
    setPapel(novo)
    navigate(novo === 'coordenador' ? '/' : '/responder')
  }

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
          Operação logística • v1.0
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
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-xs font-medium">
              <button
                onClick={() => trocarPapel('coordenador')}
                className={`rounded-md px-2.5 py-1.5 transition-colors ${papel === 'coordenador' ? 'bg-ml-navy text-white shadow-sm' : 'text-slate-600'}`}
              >
                🧑‍💼 Coordenador
              </button>
              <button
                onClick={() => trocarPapel('motorista')}
                className={`rounded-md px-2.5 py-1.5 transition-colors ${papel === 'motorista' ? 'bg-ml-navy text-white shadow-sm' : 'text-slate-600'}`}
              >
                🚚 Motorista
              </button>
            </div>
            {papel === 'motorista' && motorista && (
              <div className="flex items-center gap-2">
                <select
                  value={motorista.id}
                  onChange={(e) => setMotoristaId(e.target.value)}
                  className="max-w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  title="Motorista da demonstração"
                >
                  {db.motoristas.filter((m) => m.ativo).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
                <Avatar nome={motorista.nome} tamanho="sm" />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 pb-24 lg:p-6 lg:pb-8">{children}</main>

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
