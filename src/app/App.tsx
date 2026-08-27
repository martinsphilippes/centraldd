import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { ErroTela } from '../components/ErroTela'
import { useSessao } from '../context/SessaoContext'
import { useDB, useDBCarregado } from '../core/db'
import { Login } from '../modules/auth/Login'
import { AguardandoAprovacao } from '../modules/auth/AguardandoAprovacao'
import { Dashboard } from '../modules/dashboard/Dashboard'
import { ChamadasList } from '../modules/chamadas/ChamadasList'
import { ChamadaDetail } from '../modules/chamadas/ChamadaDetail'
import { ResponderChamadas } from '../modules/chamadas/ResponderChamadas'
import { MotoristasList } from '../modules/motoristas/MotoristasList'
import { MotoristaForm } from '../modules/motoristas/MotoristaForm'
import { MotoristaDetail } from '../modules/motoristas/MotoristaDetail'
import { MinhasCidades } from '../modules/motoristas/MinhasCidades'
import { DispatchersList } from '../modules/motoristas/DispatchersList'
import { Conferencia } from '../modules/conferencia/Conferencia'
import { MinhaConferencia } from '../modules/conferencia/MinhaConferencia'
import { MeuPerfil } from '../modules/motoristas/MeuPerfil'
import { PlanejamentoList } from '../modules/planejamento/PlanejamentoList'
import { PlanejamentoDetail } from '../modules/planejamento/PlanejamentoDetail'
import { MeuPlanejamento } from '../modules/planejamento/MeuPlanejamento'
import { MinhaDisponibilidade } from '../modules/disponibilidade/MinhaDisponibilidade'
import { DisponibilidadeFrota } from '../modules/disponibilidade/DisponibilidadeFrota'
import { Rotas } from '../modules/rotas/Rotas'
import { MinhasRotas } from '../modules/rotas/MinhasRotas'
import { CidadesOperacao } from '../modules/rotas/CidadesOperacao'
import { TiposOperacao } from '../modules/rotas/TiposOperacao'
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
  // Segurança do acesso: o motorista só entra no app com cadastro ENCONTRADO,
  // APROVADO e ATIVO. Sem cadastro (ou com ele desativado/pendente) fica na
  // tela de espera — nunca cai no app por omissão de dado.
  if (papel === 'motorista') {
    if (!carregado) return <TelaCarregando />
    const meuCadastro = db.motoristas.find((m) => m.id === motoristaId)
    if (!meuCadastro) {
      return <AguardandoAprovacao nome="" semCadastro />
    }
    if (meuCadastro.aprovado === false) {
      return <AguardandoAprovacao nome={meuCadastro.nome} funcao={meuCadastro.funcao} />
    }
    if (meuCadastro.ativo === false) {
      return <AguardandoAprovacao nome={meuCadastro.nome} funcao={meuCadastro.funcao} desativado />
    }
  }

  return (
    <Layout>
      <ErroTela>
      <Routes>
        {papel === 'dispatcher' ? (
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chamadas" element={<ChamadasList />} />
            <Route path="/chamadas/:id" element={<ChamadaDetail />} />
            <Route path="/disponibilidade" element={<DisponibilidadeFrota />} />
            <Route path="/rotas" element={<Rotas />} />
            <Route path="/conferencia" element={<Conferencia />} />
            <Route path="/cidades" element={<CidadesOperacao />} />
            <Route path="/tipos" element={<TiposOperacao />} />
            <Route path="/programacao" element={<Programacao />} />
            <Route path="/motoristas" element={<MotoristasList />} />
            <Route path="/dispatchers" element={<DispatchersList />} />
            <Route path="/motoristas/novo" element={<MotoristaForm />} />
            <Route path="/motoristas/:id" element={<MotoristaDetail />} />
            <Route path="/motoristas/:id/editar" element={<MotoristaForm />} />
            <Route path="/planejamento" element={<PlanejamentoList />} />
            <Route path="/planejamento/:id" element={<PlanejamentoDetail />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/responder" element={<ResponderChamadas />} />
            <Route path="/minhas-rotas" element={<MinhasRotas />} />
            <Route path="/minha-conferencia" element={<MinhaConferencia />} />
            <Route path="/minhas-cidades" element={<MinhasCidades />} />
            <Route path="/meu-perfil" element={<MeuPerfil />} />
            <Route path="/minha-disponibilidade" element={<MinhaDisponibilidade />} />
            <Route path="/meu-planejamento" element={<MeuPlanejamento />} />
            <Route path="/notificacoes" element={<Notificacoes />} />
            <Route path="*" element={<Navigate to="/responder" replace />} />
          </>
        )}
      </Routes>
      </ErroTela>
    </Layout>
  )
}
