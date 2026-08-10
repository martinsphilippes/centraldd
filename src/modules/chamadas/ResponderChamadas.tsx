import { useState } from 'react'
import { responderChamada, useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { rotuloDia } from '../../core/dates'
import { ORDEM_STATUS, STATUS_RESPOSTA } from '../../core/constants'
import type { Chamada, Periodo, StatusResposta } from '../../core/types'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '../../components/ui'
import { StatusPill } from '../../components/StatusPill'

interface Complemento {
  chamada: Chamada
  status: StatusResposta
}

export function ResponderChamadas() {
  const db = useDB()
  const { motoristaId } = useSessao()
  const [complemento, setComplemento] = useState<Complemento | null>(null)
  const [horario, setHorario] = useState('12:00')
  const [periodo, setPeriodo] = useState<Periodo>('manha')
  const [observacao, setObservacao] = useState('')

  const motorista = db.motoristas.find((m) => m.id === motoristaId)
  if (!motorista) return <EmptyState icone="🚚" titulo="Nenhum motorista selecionado" />

  const abertas = db.chamadas
    .filter((c) => c.status === 'aberta')
    .sort((a, b) => a.data.localeCompare(b.data))

  const minhaResposta = (c: Chamada) =>
    db.respostas.find((r) => r.chamadaId === c.id && r.motoristaId === motorista.id)

  const responder = (c: Chamada, status: StatusResposta) => {
    // Status que precisam de complemento abrem o modal; os demais são um toque só.
    if (status === 'apos_horario' || status === 'meio_periodo' || status === 'outro') {
      setHorario('12:00')
      setPeriodo('manha')
      setObservacao('')
      setComplemento({ chamada: c, status })
      return
    }
    responderChamada({ chamadaId: c.id, motoristaId: motorista.id, status })
  }

  const confirmarComplemento = () => {
    if (!complemento) return
    responderChamada({
      chamadaId: complemento.chamada.id,
      motoristaId: motorista.id,
      status: complemento.status,
      horario: complemento.status === 'apos_horario' ? horario : undefined,
      periodo: complemento.status === 'meio_periodo' ? periodo : undefined,
      observacao: complemento.status === 'outro' ? observacao : undefined,
    })
    setComplemento(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">✋ Olá, {motorista.nome.split(' ')[0]}!</h1>
        <p className="text-sm text-slate-500">Informe sua disponibilidade em um toque. Você pode alterar enquanto a chamada estiver aberta.</p>
      </div>

      {abertas.length === 0 && (
        <EmptyState icone="🎉" titulo="Nenhuma chamada aberta" descricao="Quando a coordenação abrir uma chamada, ela aparece aqui." />
      )}

      {abertas.map((c) => {
        const r = minhaResposta(c)
        return (
          <Card key={c.id} className="overflow-hidden">
            <div className="border-b border-yellow-200 bg-gradient-to-r from-ml-amarelo/70 to-yellow-100 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-slate-900">{c.titulo}</h2>
                {r && <Badge className="border-emerald-300 bg-white text-emerald-700">✔️ Respondido</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-slate-700">
                📅 {rotuloDia(c.data)}
                <br />📦 {c.operacao} • 🕖 {c.horarioInicio} às {c.horarioFim} • 🚚 {c.qtdNecessaria} motoristas
              </p>
            </div>
            <div className="p-4">
              {r && (
                <p className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                  Sua resposta: <StatusPill resposta={r} />
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ORDEM_STATUS.map((s) => {
                  const info = STATUS_RESPOSTA[s]
                  const ativo = r?.status === s
                  return (
                    <button
                      key={s}
                      onClick={() => responder(c, s)}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center text-xs font-semibold transition-all active:scale-95 ${
                        ativo
                          ? 'border-ml-azul bg-blue-50 text-ml-azul shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-2xl">{info.emoji}</span>
                      {info.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
        )
      })}

      <Modal
        aberto={!!complemento}
        titulo={complemento ? `${STATUS_RESPOSTA[complemento.status].emoji} ${STATUS_RESPOSTA[complemento.status].label}` : ''}
        onFechar={() => setComplemento(null)}
      >
        {complemento?.status === 'apos_horario' && (
          <Field label="Disponível a partir de que horário?">
            <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </Field>
        )}
        {complemento?.status === 'meio_periodo' && (
          <Field label="Qual período?">
            <Select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
              <option value="manha">🌅 Manhã</option>
              <option value="tarde">🌇 Tarde</option>
            </Select>
          </Field>
        )}
        {complemento?.status === 'outro' && (
          <Field label="Escreva uma observação">
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ml-azul focus:ring-2 focus:ring-ml-azul/20"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: veículo em manutenção até quinta"
            />
          </Field>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setComplemento(null)}>
            Cancelar
          </Button>
          <Button
            variante="ml"
            onClick={confirmarComplemento}
            disabled={complemento?.status === 'outro' && !observacao.trim()}
          >
            Confirmar resposta
          </Button>
        </div>
      </Modal>
    </div>
  )
}
