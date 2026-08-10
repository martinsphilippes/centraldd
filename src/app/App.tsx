import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { useSessao } from '../context/SessaoContext'
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
import { Relatorios } from '../modules/relatorios/Relatorios'
import { Notificacoes } from '../modules/notificacoes/Notificacoes'

export default function App() {
  const { papel } = useSessao()
  return (
    <Layout>
      <Routes>
        {papel === 'coordenador' ? (
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chamadas" element={<ChamadasList />} />
            <Route path="/chamadas/nova" element={<ChamadaForm />} />
            <Route path="/chamadas/:id" element={<ChamadaDetail />} />
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
            <Route path="/minhas-escalas" element={<MinhasEscalas />} />
            <Route path="/notificacoes" element={<Notificacoes />} />
            <Route path="*" element={<Navigate to="/responder" replace />} />
          </>
        )}
      </Routes>
    </Layout>
  )
}
