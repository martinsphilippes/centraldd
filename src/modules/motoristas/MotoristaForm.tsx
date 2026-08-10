import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDB, salvarMotorista, uid } from '../../core/db'
import { OPERACOES, VEICULOS } from '../../core/constants'
import { Button, Card, Field, Input, Select } from '../../components/ui'

export function MotoristaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existente = id ? getDB().motoristas.find((m) => m.id === id) : undefined

  const [nome, setNome] = useState(existente?.nome ?? '')
  const [telefone, setTelefone] = useState(existente?.telefone ?? '')
  const [cidade, setCidade] = useState(existente?.cidade ?? '')
  const [equipe, setEquipe] = useState(existente?.equipe ?? '')
  const [operacao, setOperacao] = useState(existente?.operacao ?? OPERACOES[0])
  const [veiculo, setVeiculo] = useState(existente?.veiculo ?? VEICULOS[0])
  const [ativo, setAtivo] = useState(existente?.ativo ?? true)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const novoId = existente?.id ?? uid()
    salvarMotorista({
      id: novoId,
      nome: nome.trim(),
      telefone: telefone.replace(/\D/g, ''),
      cidade: cidade.trim(),
      equipe: equipe.trim(),
      operacao,
      veiculo,
      ativo,
      criadoEm: existente?.criadoEm ?? new Date().toISOString(),
    })
    navigate(`/motoristas/${novoId}`)
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold text-slate-900">
        {existente ? `✏️ Editar ${existente.nome}` : '➕ Cadastrar motorista'}
      </h1>
      <Card className="p-5">
        <form onSubmit={enviar} className="space-y-4">
          <Field label="Nome completo">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex.: Carlos Silva" />
          </Field>
          <Field label="📱 Telefone (WhatsApp)">
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              required
              placeholder="Ex.: 11 98765-4321"
              inputMode="tel"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="📍 Cidade">
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} required placeholder="Ex.: Guarulhos" />
            </Field>
            <Field label="👥 Equipe">
              <Input value={equipe} onChange={(e) => setEquipe(e.target.value)} required placeholder="Ex.: Equipe Alfa" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="📦 Operação padrão">
              <Select value={operacao} onChange={(e) => setOperacao(e.target.value)}>
                {OPERACOES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            </Field>
            <Field label="🚐 Veículo">
              <Select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>
                {VEICULOS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4" />
            Motorista ativo na frota
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variante="secundario" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" variante="ml">
              💾 Salvar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
