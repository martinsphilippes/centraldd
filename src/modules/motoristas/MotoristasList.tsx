import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDB } from '../../core/db'
import { formatarTelefone } from '../../core/comunicacao'
import { Avatar, Badge, Button, Card, EmptyState, Input, Select } from '../../components/ui'
import { ContactButtons } from '../../components/ContactButtons'

export function MotoristasList() {
  const db = useDB()
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [equipe, setEquipe] = useState('')

  const cidades = [...new Set(db.motoristas.map((m) => m.cidade))].sort()
  const equipes = [...new Set(db.motoristas.map((m) => m.equipe))].sort()

  const filtrados = db.motoristas
    .filter((m) => m.nome.toLowerCase().includes(busca.toLowerCase()) || m.telefone.includes(busca))
    .filter((m) => !cidade || m.cidade === cidade)
    .filter((m) => !equipe || m.equipe === equipe)
    .sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🚚 Motoristas</h1>
          <p className="text-sm text-slate-500">
            {db.motoristas.filter((m) => m.ativo).length} ativos na frota
          </p>
        </div>
        <Link to="/motoristas/novo">
          <Button variante="ml">➕ Cadastrar motorista</Button>
        </Link>
      </div>

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
        <Select value={equipe} onChange={(e) => setEquipe(e.target.value)} style={{ width: 'auto' }}>
          <option value="">👥 Todas as equipes</option>
          {equipes.map((e) => (
            <option key={e}>{e}</option>
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
                    <Badge className="border-slate-200 bg-slate-100 text-slate-600">👥 {m.equipe}</Badge>
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
