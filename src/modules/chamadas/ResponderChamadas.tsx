import { useState } from 'react'
import { responderChamada, useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { formatarQuando, rotuloDia } from '../../core/dates'
import { ORDEM_STATUS, STATUS_DISPONIVEIS, STATUS_RESPOSTA } from '../../core/constants'
import { parametrosAtuais } from '../../core/alocacao'
import { prazoDisponibilidade } from '../../core/corte'
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
  // Chamada cuja resposta o motorista quis reabrir para alterar.
  const [alterando, setAlterando] = useState<string | null>(null)

  const motorista = db.motoristas.find((m) => m.id === motoristaId)
  if (!motorista) return <EmptyState icone="🚚" titulo="Nenhum motorista selecionado" />

  // Prazo para se declarar DISPONÍVEL no dia da chamada. Avisar que está
  // indisponível continua liberado depois do corte.
  const params = parametrosAtuais(db)
  const prazoDe = (c: Chamada) => prazoDisponibilidade(c.data, params)

  const abertas = db.chamadas
    .filter((c) => c.status === 'aberta')
    .sort((a, b) => a.data.localeCompare(b.data))

  const minhaResposta = (c: Chamada) =>
    db.respostas.find((r) => r.chamadaId === c.id && r.motoristaId === motorista.id)

  // Depois que o circuito anda (planejamento montada / chamada encerrada), a
  // resposta fica CONCLUÍDA — só o Dispatcher pode mudar dali em diante.
  const respostaTravada = (c: Chamada) =>
    c.status !== 'aberta' || db.planejamento.some((e) => e.chamadaId === c.id)

  const responder = (c: Chamada, status: StatusResposta) => {
    if (respostaTravada(c)) return
    const prazo = prazoDe(c)
    if (STATUS_DISPONIVEIS.includes(status) && prazo.encerrado) {
      alert(
        `🔒 O prazo para se declarar disponível neste dia terminou em ${prazo.texto}.\n\nVocê ainda pode marcar indisponível ou deixar uma mensagem em Outro motivo. Para entrar no dia, fale com o Dispatcher.`,
      )
      return
    }
    // Status que precisam de complemento abrem o modal; os demais são um toque só.
    if (status === 'apos_horario' || status === 'meio_periodo' || status === 'outro') {
      setHorario('12:00')
      setPeriodo('manha')
      setObservacao('')
      setComplemento({ chamada: c, status })
      return
    }
    responderChamada({ chamadaId: c.id, motoristaId: motorista.id, status })
    setAlterando(null)
  }

  const confirmarComplemento = () => {
    if (!complemento || respostaTravada(complemento.chamada)) return
    if (STATUS_DISPONIVEIS.includes(complemento.status) && prazoDe(complemento.chamada).encerrado) return
    setAlterando(null)
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
        <EmptyState icone="🎉" titulo="Nenhuma chamada aberta" descricao="Quando o Dispatcher abrir uma chamada, ela aparece aqui." />
      )}

      {abertas.map((c) => {
        const r = minhaResposta(c)
        const travada = respostaTravada(c)
        const prazo = prazoDe(c)
        const mostrarGrade = !r || (!travada && alterando === c.id)
        return (
          <Card key={c.id} className="overflow-hidden">
            <div className="border-b border-orange-200 bg-gradient-to-r from-marca/70 to-yellow-100 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-slate-900">{c.titulo}</h2>
                {r &&
                  (travada ? (
                    <Badge className="border-slate-300 bg-white text-slate-700">🔒 Concluída</Badge>
                  ) : (
                    <Badge className="border-emerald-300 bg-white text-emerald-700">✔️ Respondido</Badge>
                  ))}
              </div>
              <p className="mt-0.5 text-sm text-slate-700">
                📅 {rotuloDia(c.data)}
                <br />📦 {c.operacao} • 🕖 {c.horarioInicio} às {c.horarioFim} • 🚚 {c.qtdNecessaria} motoristas
              </p>
            </div>
            <div className="p-4">
              {r && !mostrarGrade ? (
                // Resposta dada: o quadrante encolhe para só o status escolhido.
                <div className="space-y-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    Sua resposta: <StatusPill resposta={r} />
                  </p>
                  <p className="text-xs text-slate-500">
                    🕒 enviada em <strong>{formatarQuando(r.respondidaEm)}</strong>
                  </p>
                  {travada ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      🔒 Resposta registrada e <strong>concluída</strong> — o planejamento do dia já foi
                      montada. Precisa mudar? Fale com o Dispatcher.
                    </p>
                  ) : (
                    <Button variante="secundario" onClick={() => setAlterando(c.id)}>
                      ✏️ Alterar resposta
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {r && (
                    <div className="mb-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        Sua resposta: <StatusPill resposta={r} />
                      </p>
                      <p className="text-xs text-slate-500">
                        🕒 enviada em <strong>{formatarQuando(r.respondidaEm)}</strong>
                      </p>
                    </div>
                  )}
                  {prazo.encerrado && (
                    <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      🔒 O prazo para se declarar <strong>disponível</strong> neste dia terminou em{' '}
                      <strong>{prazo.texto}</strong>. Avisar indisponibilidade continua liberado.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ORDEM_STATUS.map((s) => {
                      const info = STATUS_RESPOSTA[s]
                      const ativo = r?.status === s
                      const bloqueado = prazo.encerrado && STATUS_DISPONIVEIS.includes(s)
                      return (
                        <button
                          key={s}
                          onClick={() => responder(c, s)}
                          className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center text-xs font-semibold transition-all active:scale-95 ${
                            ativo
                              ? 'border-marca-texto bg-orange-50 text-marca-texto shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          } ${bloqueado ? 'opacity-40' : ''}`}
                        >
                          <span className="text-2xl">{info.emoji}</span>
                          {info.label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
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
          <Field label="💬 Mensagem para o Dispatcher">
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca-texto focus:ring-2 focus:ring-marca-texto/20"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: veículo em manutenção até quinta, consulta médica, viagem…"
            />
          </Field>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setComplemento(null)}>
            Cancelar
          </Button>
          <Button
            variante="marca"
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
