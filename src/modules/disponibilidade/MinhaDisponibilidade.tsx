import { useState } from 'react'
import { removerDiaDisponibilidade, salvarDiaDisponibilidade, useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { hojeISO, formatarDataLonga, formatarQuando, rotuloDia } from '../../core/dates'
import { ORDEM_STATUS, STATUS_DISPONIVEIS, STATUS_RESPOSTA } from '../../core/constants'
import { parametrosAtuais } from '../../core/alocacao'
import { calcularLimiteDoDia } from '../../core/limites'
import { prazoDisponibilidade } from '../../core/corte'
import type { Periodo, StatusResposta } from '../../core/types'
import { Button, EmptyState, Field, Input, Modal, Select } from '../../components/ui'

const DIAS_VISIVEIS = 14

/** O motorista marca sua disponibilidade por data, sem depender de chamada aberta. */
export function MinhaDisponibilidade() {
  const db = useDB()
  const { motoristaId } = useSessao()
  const [dataSelecionada, setDataSelecionada] = useState<string | null>(null)
  const [statusEscolhido, setStatusEscolhido] = useState<StatusResposta | null>(null)
  const [horario, setHorario] = useState('12:00')
  const [periodo, setPeriodo] = useState<Periodo>('manha')
  const [observacao, setObservacao] = useState('')
  const [erroVaga, setErroVaga] = useState('')

  if (!motoristaId) return <EmptyState icone="🚚" titulo="Cadastro não encontrado" />

  const params = parametrosAtuais(db)
  const dias = Array.from({ length: DIAS_VISIVEIS }, (_, i) => hojeISO(i))
  /** Prazo para se declarar DISPONÍVEL no dia (indisponibilidade nunca trava). */
  const prazoDe = (data: string) => prazoDisponibilidade(data, params)
  const minha = (data: string) => db.disponibilidade.find((a) => a.motoristaId === motoristaId && a.data === data)
  const precisaComplemento = (s: StatusResposta) => s === 'apos_horario' || s === 'meio_periodo' || s === 'outro'

  // O limite do dia vem do planejamento + reserva parametrizada (ou manual).
  const limiteDe = (data: string) => {
    const calc = calcularLimiteDoDia(db, data, parametrosAtuais(db))
    return calc.limite !== null ? { maxDisponiveis: calc.limite } : undefined
  }
  const disponiveisEm = (data: string) =>
    db.disponibilidade.filter((a) => a.data === data && STATUS_DISPONIVEIS.includes(a.status)).length

  // Limite de dias marcados: só conta dias marcados como DISPONÍVEL cujo
  // ciclo ainda não fechou. Dia trabalhado (data passou) OU com a planejamento do
  // dia concluída sai da conta e libera nova marcação na hora.
  // Indisponível e Outro motivo são sempre livres.
  const maxDiasMarcados = parametrosAtuais(db).maxDiasDisponiveis
  // "Dia concluído" = planejamento daquele dia concluída com ele, OU (para o dia de
  // hoje) todas as rotas direcionadas a ele já finalizadas/encerradas.
  const minhasRotas = db.rotas.filter((r) => r.motoristaId === motoristaId && r.data === hojeISO())
  const trabalhoDeHojeEncerrado = minhasRotas.length > 0 && minhasRotas.every((r) => r.finalizadaEm)
  const diaConcluido = (data: string) =>
    db.planejamento.some(
      (e) => e.data === data && e.status === 'concluida' && e.motoristaIds.includes(motoristaId),
    ) ||
    (data === hojeISO() && trabalhoDeHojeEncerrado)
  const meusDiasMarcados = db.disponibilidade.filter(
    (a) =>
      a.motoristaId === motoristaId &&
      a.data >= hojeISO() &&
      STATUS_DISPONIVEIS.includes(a.status) &&
      !diaConcluido(a.data),
  ).length

  /** true se o motorista já usou todas as vagas de marcação (e este dia não é uma delas). */
  const cotaEstourada = (data: string) => {
    if (maxDiasMarcados <= 0) return false
    const minha = db.disponibilidade.find((a) => a.motoristaId === motoristaId && a.data === data)
    const jaConta = !!minha && STATUS_DISPONIVEIS.includes(minha.status) && !diaConcluido(data)
    return !jaConta && meusDiasMarcados >= maxDiasMarcados
  }

  /** true se as vagas de disponibilidade da data acabaram (e eu ainda não ocupo uma). */
  const vagasEsgotadas = (data: string) => {
    const limite = limiteDe(data)
    if (!limite) return false
    const minhaMarcacao = minha(data)
    const jaOcupoVaga = !!minhaMarcacao && STATUS_DISPONIVEIS.includes(minhaMarcacao.status)
    return !jaOcupoVaga && disponiveisEm(data) >= limite.maxDisponiveis
  }

  const escolher = (s: StatusResposta) => {
    if (!dataSelecionada) return
    const prazo = prazoDe(dataSelecionada)
    if (STATUS_DISPONIVEIS.includes(s) && prazo.encerrado) {
      setErroVaga(
        `🔒 O prazo para se declarar disponível neste dia terminou em ${prazo.texto}. Você ainda pode marcar indisponível ou deixar uma mensagem em Outro motivo — para entrar no dia, fale com o Dispatcher.`,
      )
      return
    }
    if (STATUS_DISPONIVEIS.includes(s) && cotaEstourada(dataSelecionada)) {
      setErroVaga(
        `📌 Você já tem ${maxDiasMarcados} dia(s) marcado(s) como DISPONÍVEL — esse é o limite. Quando o dia for trabalhado e o planejamento/rota for encerrado, a vaga é liberada na hora para marcar outro dia. Marcar indisponível ou Outro motivo continua livre, em quantos dias quiser.`,
      )
      return
    }
    if (STATUS_DISPONIVEIS.includes(s) && vagasEsgotadas(dataSelecionada)) {
      setErroVaga('😕 As vagas de disponibilidade deste dia já foram preenchidas. Você ainda pode marcar indisponível ou deixar uma mensagem em Outro motivo.')
      return
    }
    if (precisaComplemento(s)) {
      setStatusEscolhido(s)
      setHorario('12:00')
      setPeriodo('manha')
      setObservacao('')
      return
    }
    salvarDiaDisponibilidade({ motoristaId, data: dataSelecionada, status: s })
    fechar()
  }

  const confirmarComplemento = () => {
    if (!dataSelecionada || !statusEscolhido) return
    salvarDiaDisponibilidade({
      motoristaId,
      data: dataSelecionada,
      status: statusEscolhido,
      horario: statusEscolhido === 'apos_horario' ? horario : undefined,
      periodo: statusEscolhido === 'meio_periodo' ? periodo : undefined,
      observacao: statusEscolhido === 'outro' ? observacao : undefined,
    })
    fechar()
  }

  const fechar = () => {
    setDataSelecionada(null)
    setStatusEscolhido(null)
    setErroVaga('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">📅 Minha disponibilidade</h1>
        <p className="text-sm text-slate-500">
          Marque com antecedência os dias em que você está (ou não) disponível. O Dispatcher vê tudo em tempo real.
        </p>
      </div>

      {maxDiasMarcados > 0 && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
            meusDiasMarcados >= maxDiasMarcados
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <span className="text-lg">📌</span>
          <span className="flex-1">
            Dias marcados como DISPONÍVEL: <strong>{meusDiasMarcados}/{maxDiasMarcados}</strong>
            {meusDiasMarcados >= maxDiasMarcados
              ? ' — limite atingido. Quando o planejamento/rota de um dia marcado for encerrado, a vaga libera sozinha. Indisponível segue livre.'
              : ` — você ainda pode marcar ${maxDiasMarcados - meusDiasMarcados} dia(s) disponível. Indisponível é livre.`}
          </span>
        </div>
      )}

      {params.horarioCorteDisponibilidade.trim() && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          🔒 <strong>Prazo para se declarar disponível:</strong> até as{' '}
          <strong>{params.horarioCorteDisponibilidade}</strong>
          {params.diasAntecedenciaCorte === 1
            ? ' do dia anterior'
            : params.diasAntecedenciaCorte === 0
              ? ' do próprio dia'
              : ` de ${params.diasAntecedenciaCorte} dias antes`}
          . Depois disso o dia fecha para novas disponibilidades — avisar indisponibilidade continua
          liberado a qualquer hora.
        </p>
      )}

      <div className="space-y-2">
        {dias.map((data) => {
          const marcado = minha(data)
          const prazo = prazoDe(data)
          const info = marcado ? STATUS_RESPOSTA[marcado.status] : null
          const limite = limiteDe(data)
          const ocupadas = limite ? Math.min(disponiveisEm(data), limite.maxDisponiveis) : 0
          let detalhe = ''
          if (marcado?.status === 'apos_horario' && marcado.horario) detalhe = ` após ${marcado.horario}`
          if (marcado?.status === 'meio_periodo' && marcado.periodo)
            detalhe = ` (${marcado.periodo === 'manha' ? 'manhã' : 'tarde'})`
          return (
            <button
              key={data}
              onClick={() => setDataSelecionada(data)}
              className={`flex w-full items-center justify-between rounded-xl border-2 bg-white p-3 text-left transition-colors active:scale-[0.99] ${
                info ? 'border-slate-200' : 'border-dashed border-slate-300 hover:border-ml-azul'
              }`}
            >
              <span>
                <span className="block text-sm font-bold text-slate-800">{rotuloDia(data)}</span>
                {marcado && diaConcluido(data) && (
                  <span className="block text-[11px] font-semibold text-emerald-700">
                    🏁 dia encerrado — vaga liberada
                  </span>
                )}
                {prazo.encerrado && (
                  <span className="block text-[11px] font-semibold text-amber-700">
                    🔒 prazo encerrado em {prazo.texto} — só dá para avisar indisponibilidade
                  </span>
                )}
                {limite && (
                  <span
                    className={`text-[11px] font-semibold ${
                      vagasEsgotadas(data) ? 'text-red-600' : 'text-slate-500'
                    }`}
                  >
                    🎯 {ocupadas}/{limite.maxDisponiveis} vagas
                    {vagasEsgotadas(data) ? ' — esgotadas' : ''}
                  </span>
                )}
                {marcado && (
                  <span className="block text-[11px] text-slate-400">
                    🕒 marcado em <strong>{formatarQuando(marcado.atualizadaEm)}</strong>
                  </span>
                )}
                {marcado?.observacao && (
                  <span className="block text-[11px] italic text-slate-500">“{marcado.observacao}”</span>
                )}
              </span>
              {info ? (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${info.cor}`}>
                  {info.emoji} {info.label}
                  {detalhe}
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-400">Toque para marcar</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Escolha de status */}
      <Modal
        aberto={!!dataSelecionada && !statusEscolhido}
        titulo={dataSelecionada ? `📅 ${formatarDataLonga(dataSelecionada)}` : ''}
        onFechar={fechar}
      >
        {erroVaga && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erroVaga}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ORDEM_STATUS.map((s) => {
            const info = STATUS_RESPOSTA[s]
            const atual = dataSelecionada ? minha(dataSelecionada)?.status === s : false
            const bloqueado =
              !!dataSelecionada &&
              STATUS_DISPONIVEIS.includes(s) &&
              (vagasEsgotadas(dataSelecionada) ||
                cotaEstourada(dataSelecionada) ||
                prazoDe(dataSelecionada).encerrado)
            return (
              <button
                key={s}
                onClick={() => escolher(s)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center text-xs font-semibold transition-all active:scale-95 ${
                  atual
                    ? 'border-ml-azul bg-blue-50 text-ml-azul'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                } ${bloqueado ? 'opacity-40' : ''}`}
              >
                <span className="text-2xl">{info.emoji}</span>
                {info.label}
              </button>
            )
          })}
        </div>
        {dataSelecionada && minha(dataSelecionada) && (
          <Button
            variante="fantasma"
            className="mt-3 w-full"
            onClick={() => {
              const m = minha(dataSelecionada)
              if (m) removerDiaDisponibilidade(m.id)
              fechar()
            }}
          >
            🗑️ Limpar marcação deste dia
          </Button>
        )}
      </Modal>

      {/* Complemento (horário / período / observação) */}
      <Modal
        aberto={!!statusEscolhido}
        titulo={statusEscolhido ? `${STATUS_RESPOSTA[statusEscolhido].emoji} ${STATUS_RESPOSTA[statusEscolhido].label}` : ''}
        onFechar={fechar}
      >
        {statusEscolhido === 'apos_horario' && (
          <Field label="Disponível a partir de que horário?">
            <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </Field>
        )}
        {statusEscolhido === 'meio_periodo' && (
          <Field label="Qual período?">
            <Select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
              <option value="manha">🌅 Manhã</option>
              <option value="tarde">🌇 Tarde</option>
            </Select>
          </Field>
        )}
        {statusEscolhido === 'outro' && (
          <Field label="💬 Mensagem para o Dispatcher">
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ml-azul focus:ring-2 focus:ring-ml-azul/20"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: veículo em manutenção, consulta médica, viagem…"
            />
          </Field>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="secundario" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            variante="ml"
            onClick={confirmarComplemento}
            disabled={statusEscolhido === 'outro' && !observacao.trim()}
          >
            Confirmar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
