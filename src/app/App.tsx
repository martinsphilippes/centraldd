import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { useSessao } from '../context/SessaoContext'
import { useDB, useDBCarregado } from '../core/db'
import { Login } from '../modules/auth/Login'
import { AguardandoAprovacao } from '../modules/auth/AguardandoAprovacao'
import { Dashboard } from '../modules/dashboard/Dashboard'
import { ChamadasList } from '../modules/chamadas/ChamadasList'
import { ChamadaForm } from '../modules/chamadas/ChamadaForm'
import { ChamadaDetail } from '../modules/chamadas/ChamadaDetail'
import { ResponderChamadas } from '../modules/chamadas/ResponderChamadas'
import { MotoristasList } from '../modules/motoristas/MotoristasList'
import { MotoristaForm } from '../modules/motoristas/MotoristaForm'
import { MotoristaDetail } from '../modules/motoristas/MotoristaDetail'
import { EscalasList } from '../modules/escalas/EscalasList'
import { EscalaDetail } from '../modules/escalas/EscalaDetail'
import { MinhasEscalas } from '../modules/escalas/MinhasEscalas'
import { MinhaAgenda } from '../modules/agenda/MinhaAgenda'
import { AgendaFrota } from '../modules/agenda/AgendaFrota'
import { Rotas } from '../modules/rotas/Rotas'
import { MinhasRotas } from '../modules/rotas/MinhasRotas'
import { Programacao } from '../modules/programacao/Programacao'
import { Relatorios } from '../modules/relatorios/Relatorios'
import { Notificacoes } from '../modules/notificacoes/Notificacoes'

function TelaCarregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ml-navy">
      <div className="text-center">
        <span className="inline-flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-ml-amarelo text-3xl">
          🚚
        </span>
        <p className="mt-3 text-sm font-medium text-slate-300">Carregando…</p>
      </div>
    </div>
  )
}

export default function App() {
  const { statusAuth, papel, motoristaId } = useSessao()
  const db = useDB()
  const carregado = useDBCarregado()

  if (statusAuth === 'carregando') return <TelaCarregando />
  if (statusAuth === 'deslogado') return <Login />

  // Motorista com pré-cadastro ainda não aprovado: segura o acesso.
  if (papel === 'motorista') {
    if (!carregado) return <TelaCarregando />
    const meuCadastro = db.motoristas.find((m) => m.id === motoristaId)
    if (meuCadastro && meuCadastro.aprovado === false) {
      return <AguardandoAprovacao nome={meuCadastro.nome} funcao={meuCadastro.funcao} />
    }
  }

  return (
    <Layout>
      <Routes>
        {papel === 'coordenador' ? (
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chamadas" element={<ChamadasList />} />
            <Route path="/chamadas/nova" element={<ChamadaForm />} />
            <Route path="/chamadas/:id" element={<ChamadaDetail />} />
            <Route path="/agenda-frota" element={<AgendaFrota />} />
            <Route path="/rotas" element={<Rotas />} />
            <Route path="/programacao" element={<Programacao />} />
            <Route path="/motoristas" element={<MotoristasList />} />
            <Route path="/motoristas/novo" element={<MotoristaForm />} />
            <Route path="/motoristas/:id" element={<MotoristaDetail />} />
            <Route path="/motoristas/:id/editar" element={<MotoristaForm />} />
            <Route path="/escalas" element={<EscalasList />} />
            <Route path="/escalas/:id" element={<EscalaDetail />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/responder" element={<ResponderChamadas />} />
            <Route path="/minhas-rotas" element={<MinhasRotas />} />
            <Route path="/agenda" element={<MinhaAgenda />} />
            <Route path="/minhas-escalas" element={<MinhasEscalas />} />
            <Route path="/notificacoes" element={<Notificacoes />} />
            <Route path="*" element={<Navigate to="/responder" replace />} />
          </>
        )}
      </Routes>
    </Layout>
  )
}
