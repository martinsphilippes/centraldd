import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSessao } from '../context/SessaoContext'
import { useDB } from '../core/db'
import { hojeISO } from '../core/dates'
import { EMAILS_DISPATCHER } from '../core/firebase-config'
import { Avatar } from '../components/ui'
import { InstalarBanner } from '../components/InstalarApp'
import { PreviaImpressao } from '../components/PreviaImpressao'

// O menu segue a ESTEIRA da operação: partida (disponibilidade ∥ programação),
// depois chamada → planejamento → rotas, e por fim cadastro e análise.
interface ItemNav {
  para: string
  rotulo: string
  icone: string
  grupo: string
  /** true = item exclusivo do DONO da operação. */
  soDono?: boolean
  /**
   * Rótulo da barra inferior (celular), onde não cabe o nome inteiro.
   * Só os nomes compridos precisam — os demais usam o `rotulo`.
   */
  curto?: string
}

const NAV_DISPATCHER: ItemNav[] = [
  { para: '/', rotulo: 'Dashboard', icone: '📊', grupo: 'Painel' },
  { para: '/programacao', rotulo: 'Programação', curto: 'Program.', icone: '📆', grupo: 'Fluxo do dia' },
  { para: '/disponibilidade', rotulo: 'Disponibilidade', curto: 'Disponib.', icone: '📅', grupo: 'Fluxo do dia' },
  { para: '/chamadas', rotulo: 'Chamadas', icone: '⏰', grupo: 'Fluxo do dia' },
  { para: '/planejamento', rotulo: 'Planejamento', curto: 'Planej.', icone: '📋', grupo: 'Fluxo do dia' },
  { para: '/rotas', rotulo: 'Rotas', icone: '🛣️', grupo: 'Fluxo do dia' },
  { para: '/conferencia', rotulo: 'Conferência', icone: '🔍', curto: 'Confer.', grupo: 'Fluxo do dia' },
  { para: '/motoristas', rotulo: 'Motoristas', icone: '🚚', grupo: 'Cadastro e análise' },
  { para: '/dispatchers', rotulo: 'Dispatchers', curto: 'Dispatch.', icone: '🧑', grupo: 'Cadastro e análise', soDono: true },
  { para: '/cidades', rotulo: 'Cidades', icone: '📍', grupo: 'Cadastro e análise' },
  { para: '/tipos', rotulo: 'Opções', icone: '🏷️', grupo: 'Cadastro e análise' },
  { para: '/relatorios', rotulo: 'Relatórios', icone: '📈', grupo: 'Cadastro e análise' },
]

const NAV_MOTORISTA: ItemNav[] = [
  { para: '/responder', rotulo: 'Responder', icone: '✋', grupo: 'Meu dia' },
  { para: '/minha-disponibilidade', rotulo: 'Disponibilidade', curto: 'Disponib.', icone: '📅', grupo: 'Meu dia' },
  { para: '/meu-planejamento', rotulo: 'Planejamento', curto: 'Planej.', icone: '📋', grupo: 'Meu dia' },
  { para: '/minhas-rotas', rotulo: 'Rotas', icone: '🛣️', grupo: 'Meu dia' },
  { para: '/minha-conferencia', rotulo: 'Conferência', icone: '🔍', curto: 'Confer.', grupo: 'Meu dia' },
  { para: '/notificacoes', rotulo: 'Avisos', icone: '🔔', grupo: 'Meu dia' },
  { para: '/minhas-cidades', rotulo: 'Cidades', icone: '📍', grupo: 'Minhas preferências' },
  { para: '/meu-perfil', rotulo: 'Meu perfil', icone: '👤', curto: 'Perfil', grupo: 'Minhas preferências' },
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
      ? db.rotas.filter((r) => r.motoristaId === motoristaId && !r.finalizadaEm && r.data === hojeISO()).length
      : 0

  return (
    // Casca de APP: a página em si nunca rola — só o <main> interno. Com isso
    // a barra inferior e o cabeçalho são filhos fixos do flex, e o iOS não tem
    // como soltá-los no meio da tela durante a rolagem.
    <div className="flex h-dvh flex-col overflow-hidden lg:pl-60">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-ml-navy pt-[env(safe-area-inset-top)] lg:flex">
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
      <header className="shrink-0 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ml-amarelo">🚚</span>
            <span className="text-sm font-bold">MLDisponibilidade</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* O avatar do motorista abre o Meu perfil (dados + trocar senha). */}
            {papel === 'motorista' ? (
              <NavLink
                to="/meu-perfil"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 transition-colors hover:border-ml-azul hover:bg-blue-50/50"
                title="Meu perfil — editar dados e trocar senha"
              >
                <Avatar nome={nomeExibicao || '?'} tamanho="sm" />
                <div className="hidden text-left sm:block">
                  <div className="max-w-40 truncate text-xs font-bold leading-tight text-slate-800">{nomeExibicao}</div>
                  <div className="text-[10px] leading-tight text-slate-500">🚚 Motorista · 👤 meu perfil</div>
                </div>
              </NavLink>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <Avatar nome={nomeExibicao || '?'} tamanho="sm" />
                <div className="hidden text-left sm:block">
                  <div className="max-w-40 truncate text-xs font-bold leading-tight text-slate-800">{nomeExibicao}</div>
                  <div className="text-[10px] leading-tight text-slate-500">🧑 Dispatcher</div>
                </div>
              </div>
            )}
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

      <main className="min-h-0 w-full flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 lg:p-6">
        <div className="mb-4 empty:mb-0 lg:hidden">
          <InstalarBanner />
        </div>
        {children}
        </div>
      </main>

      {/*
        Menu inferior do celular. Antes era uma fila só, rolando de lado: com 12
        itens de 60px numa tela de 390px, metade ficava fora da vista atrás de
        uma rolagem lateral que ninguém descobre — na prática, telas escondidas.
        Agora é uma grade que quebra em linhas e mostra TODAS de uma vez.
      */}
      <nav
        className="grid shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.min(nav.length, 6)}, minmax(0, 1fr))` }}
      >
        {nav.map((item) => (
          <NavLink
            key={item.para}
            to={item.para}
            end={item.para === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-0.5 py-1.5 text-[10px] font-medium ${
                isActive ? 'text-ml-azul' : 'text-slate-500'
              }`
            }
          >
            <span className="text-lg leading-none">{item.icone}</span>
            <span className="w-full truncate text-center leading-tight">{item.curto ?? item.rotulo}</span>
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

      {/* Prévia de impressão: fica por cima de tudo, com ✕ e Esc. */}
      <PreviaImpressao />
    </div>
  )
}
