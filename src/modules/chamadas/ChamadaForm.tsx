import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { salvarChamada, uid, enviarNotificacao } from '../../core/db'
import { hojeISO, formatarDataLonga } from '../../core/dates'
import { OPERACOES } from '../../core/constants'
import { Button, Card, Field, Input, Select } from '../../components/ui'

export function ChamadaForm() {
  const navigate = useNavigate()
  const [titulo, setTitulo] = useState('Disponibilidade para Entregas')
  const [data, setData] = useState(hojeISO(1))
  const [operacao, setOperacao] = useState(OPERACOES[0])
  const [horarioInicio, setHorarioInicio] = useState('07:00')
  const [horarioFim, setHorarioFim] = useState('18:00')
  const [qtd, setQtd] = useState(45)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const id = uid()
    salvarChamada({
      id,
      titulo,
      data,
      operacao,
      horarioInicio,
      horarioFim,
      qtdNecessaria: qtd,
      status: 'aberta',
      criadaEm: new Date().toISOString(),
    })
    // Notifica toda a frota sobre a nova chamada.
    enviarNotificacao({
      motoristaId: null,
      titulo: `Nova chamada: ${titulo}`,
      mensagem: `📅 ${formatarDataLonga(data)} • ${operacao} • 🕖 ${horarioInicio} às ${horarioFim}. Responda sua disponibilidade!`,
    })
    navigate(`/chamadas/${id}`)
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">➕ Nova chamada de disponibilidade</h1>
        <p className="text-sm text-slate-500">
          A frota é notificada e responde em um toque — sem enquete no WhatsApp.
        </p>
      </div>
      <Card className="p-5">
        <form onSubmit={enviar} className="space-y-4">
          <Field label="Título">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="📅 Data da operação">
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
            </Field>
            <Field label="📦 Operação">
              <Select value={operacao} onChange={(e) => setOperacao(e.target.value)}>
                {OPERACOES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="🕖 Início">
              <Input type="time" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)} required />
            </Field>
            <Field label="🕕 Fim">
              <Input type="time" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)} required />
            </Field>
            <Field label="🚚 Motoristas">
              <Input
                type="number"
                min={1}
                value={qtd}
                onChange={(e) => setQtd(Number(e.target.value))}
                required
              />
            </Field>
          </div>
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-slate-700">
            <p className="font-semibold">Prévia para os motoristas:</p>
            <p className="mt-1">
              <strong>{titulo}</strong>
              <br />📅 {formatarDataLonga(data)}
              <br />📦 {operacao} • 🕖 {horarioInicio} às {horarioFim}
              <br />🚚 {qtd} motoristas necessários
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variante="secundario" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" variante="ml">
              📢 Publicar chamada
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
