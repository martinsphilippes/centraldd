import { useState } from 'react'
import { Link } from 'react-router-dom'
import { enviarNotificacao, removerMotorista, salvarMotorista, useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { EMAILS_DISPATCHER } from '../../core/firebase-config'
import { promoverParaDispatcher, removerPerfil } from '../../core/firebase'
import { pedeDispatcher } from '../../core/papel'
import { formatarTelefone } from '../../core/comunicacao'
import type { Motorista } from '../../core/types'
import { Avatar, Badge, Button, Card, EmptyState, Input, Select } from '../../components/ui'
import { ContactButtons } from '../../components/ContactButtons'
import { ImportarMotoristasModal } from './ImportarMotoristasModal'


export function MotoristasList() {
  const db = useDB()
  const { usuarioEmail } = useSessao()
  // Só o DONO da operação decide quem vira dispatcher.
  const souDono = EMAILS_DISPATCHER.includes((usuarioEmail ?? '').toLowerCase())
  const [importar, setImportar] = useState(false)
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')

  const pendentes = db.motoristas
    .filter((m) => m.aprovado === false)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))

  const cidades = [...new Set(db.motoristas.map((m) => m.cidade))].sort()

  const filtrados = db.motoristas
    .filter((m) => m.aprovado !== false)
    .filter((m) => m.nome.toLowerCase().includes(busca.toLowerCase()) || m.telefone.includes(busca))
    .filter((m) => !cidade || m.cidade === cidade)
    .sort((a, b) => a.nome.localeCompare(b.nome))

  const aprovar = (m: Motorista) => {
    if (pedeDispatcher(m.funcao)) {
      if (!souDono) {
        alert(
          'Somente o dono da operação aprova cadastro de DISPATCHER. Peça a ele para liberar este acesso.',
        )
        return
      }
      // Aprovado, vira DISPATCHER: painel completo, e a tela dele troca na hora.
      if (
        !confirm(
          `Aprovar ${m.nome} como DISPATCHER?\nEle terá acesso total ao painel: programação, rotas, planejamento, parâmetros e aprovações.`,
        )
      )
        return
      void promoverParaDispatcher(m.id)
      return
    }
    salvarMotorista({ ...m, aprovado: true, ativo: true })
    enviarNotificacao({
      motoristaId: m.id,
      titulo: 'Cadastro aprovado! 🎉',
      mensagem: `Bem-vindo(a) à operação, ${m.nome.split(' ')[0]}! Seu acesso foi liberado — responda as chamadas e marque sua disponibilidade de disponibilidade.`,
    })
  }

  const recusar = (m: Motorista) => {
    if (!confirm(`Recusar o pré-cadastro de ${m.nome}? A conta perderá o acesso.`)) return
    removerMotorista(m.id)
    void removerPerfil(m.id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🚚 Motoristas</h1>
          <p className="text-sm text-slate-500">
            {db.motoristas.filter((m) => m.ativo).length} ativos na frota
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => setImportar(true)}>
            📥 Importar planilha
          </Button>
          <Link to="/motoristas/novo">
            <Button variante="ml">➕ Cadastrar motorista</Button>
          </Link>
        </div>
      </div>

      <ImportarMotoristasModal aberto={importar} onFechar={() => setImportar(false)} />

      {pendentes.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-1 font-bold text-slate-900">
            ⏳ Pré-cadastros aguardando aprovação ({pendentes.length})
          </h2>
          <p className="mb-3 text-xs text-slate-600">
            Quem se cadastrou sozinho pelo app. Ninguém acessa o sistema antes da aprovação.
            {!souDono && ' Pedidos de DISPATCHER só o dono da operação aprova.'}
          </p>
          <ul className="space-y-2">
            {pendentes.map((m) => (
              <li key={m.id} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar nome={m.nome} tamanho="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-800">
                      {m.nome}
                      {pedeDispatcher(m.funcao) && (
                        <Badge className="border-blue-200 bg-blue-100 text-blue-800">🧑 Quer ser dispatcher</Badge>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      📱 {formatarTelefone(m.telefone)} • 📍 {m.cidade}
                      {pedeDispatcher(m.funcao)
                        ? ' • ao aprovar, vira DISPATCHER com painel completo'
                        : ` • 🚐 ${m.veiculo} • ${m.operacao}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {pedeDispatcher(m.funcao) && !souDono ? (
                      <Badge className="border-slate-300 bg-slate-100 text-slate-600">
                        🔒 Aguardando o dono da operação
                      </Badge>
                    ) : (
                      <Button variante="ml" onClick={() => aprovar(m)}>
                        {pedeDispatcher(m.funcao) ? '✅ Aprovar como dispatcher' : '✅ Aprovar'}
                      </Button>
                    )}
                    <Button variante="perigo" onClick={() => recusar(m)}>
                      ✕ Recusar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="min-w-52 flex-1">
          <Input placeholder="🔍 Buscar por nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={cidade} onChange={(e) => setCidade(e.target.value)} style={{ width: 'auto' }}>
          <option value="">📍 Todas as cidades</option>
          {cidades.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState icone="🔍" titulo="Nenhum motorista encontrado" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((m) => (
            <Card key={m.id} className={`p-4 ${m.ativo ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                <Avatar nome={m.nome} />
                <div className="min-w-0 flex-1">
                  <Link to={`/motoristas/${m.id}`} className="block truncate font-bold text-slate-900 hover:text-ml-azul">
                    {m.nome}
                  </Link>
                  <p className="text-xs text-slate-500">📱 {formatarTelefone(m.telefone)}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    <Badge className="border-slate-200 bg-slate-100 text-slate-600">📍 {m.cidade}</Badge>
                    <Badge className="border-slate-200 bg-slate-100 text-slate-600">🚐 {m.veiculo}</Badge>
                  </p>
                </div>
                {!m.ativo && <Badge className="border-red-200 bg-red-50 text-red-600">Inativo</Badge>}
              </div>
              <div className="mt-3">
                <ContactButtons motorista={m} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
