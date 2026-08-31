import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { removerLimiteDia, salvarDiaDisponibilidade, salvarLimiteDia, useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { calcularLimiteDoDia } from '../../core/limites'
import { parametrosAtuais } from '../../core/alocacao'
import { hojeISO, formatarData, formatarQuandoCurto, parseISODate, rotuloDia } from '../../core/dates'
import { ORDEM_STATUS, STATUS_DISPONIVEIS, STATUS_RESPOSTA } from '../../core/constants'
import type { DiaDisponibilidade, Motorista, StatusResposta } from '../../core/types'
import { formatarTelefone, linkWhatsApp } from '../../core/comunicacao'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../../core/export'
import { Avatar, Badge, Button, Card, EmptyState, ProgressBar, Select, StatCard } from '../../components/ui'

const DIAS_VISIVEIS = 14

function detalheDe(a: DiaDisponibilidade): string {
  if (a.status === 'apos_horario' && a.horario) return `após ${a.horario}`
  if (a.status === 'meio_periodo' && a.periodo) return a.periodo === 'manha' ? 'manhã' : 'tarde'
  return a.observacao ?? ''
}

/** Visão do dispatcher: dia a dia, quem trabalha e quem não trabalha (disponibilidade dos motoristas). */
export function DisponibilidadeFrota() {
  const db = useDB()
  const { usuarioEmail } = useSessao()
  const dias = useMemo(() => Array.from({ length: DIAS_VISIVEIS }, (_, i) => hojeISO(i)), [])
  const [diaSelecionado, setDiaSelecionado] = useState(dias[0])
  const [cidade, setCidade] = useState('')
  const [editandoLimite, setEditandoLimite] = useState(false)
  const [novoLimite, setNovoLimite] = useState(40)
  const [avisoSimulacao, setAvisoSimulacao] = useState('')
  const [marcarTodos, setMarcarTodos] = useState(false)
  const [statusMassa, setStatusMassa] = useState<StatusResposta>('disponivel')
  const [alcanceMassa, setAlcanceMassa] = useState<'sem-marcacao' | 'todos'>('sem-marcacao')

  // 🧪 Só o dono vê: marca todos os motoristas FICTÍCIOS (teste-*) como
  // disponíveis no dia selecionado, para simular a operação em um clique.
  const souDono = usuarioEmail?.toLowerCase() === 'martinsphilippes@gmail.com'
  const ficticios = db.motoristas.filter((m) => m.id.startsWith('teste-') && m.ativo)
  // A simulação segue a esteira: só faz sentido depois que o dia tem
  // programação lançada (planilha de rotas importada ou resumo do dia).
  const temProgramacao =
    db.programacao.some((p) => p.data === diaSelecionado) ||
    db.resumos.some((r) => r.id === diaSelecionado)
  /**
   * ⚡ Só o DONO: marca a disponibilidade da frota inteira de uma vez no dia
   * selecionado. Respeita o filtro de cidade da tela, e por padrão só
   * preenche quem ainda não marcou — quem respondeu não é atropelado sem
   * o dono pedir explicitamente.
   */
  const aplicarMarcacaoEmMassa = () => {
    const alvo = frota.filter(
      (m) => alcanceMassa === 'todos' || !marcacaoDe(m, diaSelecionado),
    )
    const rotulo = STATUS_RESPOSTA[statusMassa].label.toUpperCase()
    if (alvo.length === 0) {
      setAvisoSimulacao('⚡ Ninguém para marcar — todos os motoristas do filtro já têm marcação neste dia.')
      setMarcarTodos(false)
      return
    }
    if (
      !confirm(
        `Marcar ${alvo.length} motorista(s) como ${rotulo} em ${rotuloDia(diaSelecionado)}?` +
          (alcanceMassa === 'todos' ? '\n\nATENÇÃO: isso SOBRESCREVE quem já marcou.' : ''),
      )
    )
      return
    for (const m of alvo) {
      salvarDiaDisponibilidade({ motoristaId: m.id, data: diaSelecionado, status: statusMassa })
    }
    setAvisoSimulacao(`⚡ ${alvo.length} motorista(s) marcados como ${rotulo} em ${rotuloDia(diaSelecionado)}.`)
    setMarcarTodos(false)
  }

  const simularDisponiveis = () => {
    if (!temProgramacao) return
    if (
      !confirm(
        `Marcar os ${ficticios.length} motoristas fictícios como DISPONÍVEL em ${rotuloDia(diaSelecionado)}?`,
      )
    )
      return
    for (const m of ficticios) {
      salvarDiaDisponibilidade({ motoristaId: m.id, data: diaSelecionado, status: 'disponivel' })
    }
    setAvisoSimulacao(
      `🧪 ${ficticios.length} fictícios marcados como disponíveis em ${rotuloDia(diaSelecionado)}.`,
    )
  }

  // Limite = planejamento + reserva parametrizada (ou o valor manual do dia).
  const limiteCalc = calcularLimiteDoDia(db, diaSelecionado, parametrosAtuais(db))
  const limiteDoDia = limiteCalc.limite !== null ? { maxDisponiveis: limiteCalc.limite } : null
  // Total de disponíveis do dia SEM filtros (é o número que consome as vagas).
  const disponiveisTotais = db.disponibilidade.filter(
    (a) => a.data === diaSelecionado && STATUS_DISPONIVEIS.includes(a.status),
  ).length

  const frota = db.motoristas
    .filter((m) => m.ativo && m.aprovado !== false)
    .filter((m) => !cidade || m.cidade === cidade)
    .sort((a, b) => a.nome.localeCompare(b.nome))

  const cidades = [...new Set(db.motoristas.map((m) => m.cidade))].sort()

  const marcacaoDe = (m: Motorista, data: string) =>
    db.disponibilidade.find((a) => a.motoristaId === m.id && a.data === data)

  const doDia = frota.map((m) => ({ motorista: m, marcacao: marcacaoDe(m, diaSelecionado) }))
  // Quem entrou no planejamento do dia (e quem ficou na fila) — declarado
  // ANTES de qualquer uso: era usado abaixo antes de existir e derrubava a tela.
  const doPlanejamentoDoDia = new Set(
    db.planejamento.filter((e) => e.data === diaSelecionado).flatMap((e) => e.motoristaIds),
  )
  const naEsperaDoDia = new Set(
    db.planejamento.filter((e) => e.data === diaSelecionado).flatMap((e) => e.esperaIds ?? []),
  )

  const trabalham = doDia.filter((x) => x.marcacao && STATUS_DISPONIVEIS.includes(x.marcacao.status))
  const naoTrabalham = doDia.filter((x) => x.marcacao && !STATUS_DISPONIVEIS.includes(x.marcacao.status))
  const semMarcacao = doDia.filter((x) => !x.marcacao)
  // A fila de espera vira coluna própria: disponível que NÃO foi selecionado
  // (excedente da meta) sai da coluna de disponíveis e aparece aguardando.
  const filaEspera = trabalham.filter((x) => naEsperaDoDia.has(x.motorista.id))
  const disponiveisSelecionados = trabalham.filter((x) => !naEsperaDoDia.has(x.motorista.id))

  const resumoDoDia = (data: string) => {
    let sim = 0
    let nao = 0
    for (const m of frota) {
      const a = marcacaoDe(m, data)
      if (!a) continue
      if (STATUS_DISPONIVEIS.includes(a.status)) sim++
      else nao++
    }
    return { sim, nao }
  }

  const tabelaDia = (): Tabela => ({
    titulo: `Disponibilidade da frota ${formatarData(diaSelecionado)}`,
    colunas: ['Motorista', 'Telefone', 'Cidade', 'Veículo', 'Disponível?', 'Status', 'Detalhe'],
    linhas: [...trabalham, ...naoTrabalham, ...semMarcacao].map(({ motorista: m, marcacao }) => [
      m.nome,
      formatarTelefone(m.telefone),
      m.cidade,
      m.veiculo,
      marcacao ? (STATUS_DISPONIVEIS.includes(marcacao.status) ? 'SIM' : 'NÃO') : 'Não informou',
      marcacao ? STATUS_RESPOSTA[marcacao.status].label : '—',
      marcacao ? detalheDe(marcacao) : '',
    ]),
  })

  const tabelaPeriodo = (): Tabela => ({
    titulo: `Disponibilidade da frota ${formatarData(dias[0])} a ${formatarData(dias[dias.length - 1])}`,
    colunas: [
      'Motorista',
      ...dias.map((d) => parseISODate(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
    ],
    linhas: frota.map((m) => [
      m.nome,
      ...dias.map((d) => {
        const a = marcacaoDe(m, d)
        if (!a) return ''
        const info = STATUS_RESPOSTA[a.status]
        const detalhe = detalheDe(a)
        return `${info.emoji} ${info.label}${detalhe ? ` (${detalhe})` : ''}`
      }),
    ]),
  })

  // Fecha o ciclo com a esteira: quem já está na planejamento do dia fica marcado.

  // Ciclo do dia FECHADO: planejamento do dia concluída com o motorista, ou (hoje)
  // todas as rotas direcionadas a ele finalizadas/encerradas — interligado
  // com as telas de Rotas e Planejamento.
  const concluidosDoDia = new Set<string>(
    db.planejamento
      .filter((e) => e.data === diaSelecionado && e.status === 'concluida')
      .flatMap((e) => e.motoristaIds),
  )
  if (diaSelecionado === hojeISO()) {
    for (const m of frota) {
      const rotasDele = db.rotas.filter((r) => r.motoristaId === m.id && r.data === diaSelecionado)
      if (rotasDele.length > 0 && rotasDele.every((r) => r.finalizadaEm)) concluidosDoDia.add(m.id)
    }
  }

  const LinhaMotorista = ({ m, a }: { m: Motorista; a?: DiaDisponibilidade }) => (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5">
      <Avatar nome={m.nome} tamanho="sm" />
      <div className="min-w-0 flex-1">
        <Link to={`/motoristas/${m.id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-marca-texto">
          {m.nome}
        </Link>
        <p className="truncate text-[11px] text-slate-500">
          {m.cidade} • {m.veiculo}
        </p>
      </div>
      {concluidosDoDia.has(m.id) ? (
        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">🏁 dia encerrado</Badge>
      ) : (
        doPlanejamentoDoDia.has(m.id) ? (
          <Badge className="border-orange-200 bg-orange-100 text-orange-900">🚚 vai trabalhar</Badge>
        ) : (
          naEsperaDoDia.has(m.id) && (
            <Badge className="border-amber-300 bg-amber-100 text-amber-800">🕐 fila de espera</Badge>
          )
        )
      )}
      {a ? (
        <Badge className={STATUS_RESPOSTA[a.status].cor}>
          {STATUS_RESPOSTA[a.status].emoji} {STATUS_RESPOSTA[a.status].label}
          {detalheDe(a) ? ` — ${detalheDe(a)}` : ''}
        </Badge>
      ) : (
        <a
          href={linkWhatsApp(
            m,
            `Olá, ${m.nome.split(' ')[0]}! 🚚 Marque sua disponibilidade para ${rotuloDia(diaSelecionado).toLowerCase()} na tela Disponibilidade do app Central DD, por favor. 🙏`,
          )}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          title="Cobrar pelo WhatsApp"
        >
          💬 Cobrar
        </a>
      )}
      {a && (
        <span className="basis-full rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
          🕒 Marcou <strong className="text-slate-800">{formatarQuandoCurto(a.atualizadaEm)}</strong>
        </span>
      )}
    </li>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">📅 Disponibilidade da frota</h1>
          <p className="text-sm text-slate-500">
            O que cada motorista marcou na própria disponibilidade — dia a dia, em tempo real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => exportarCSV(tabelaDia())}>⬇️ CSV do dia</Button>
          <Button variante="secundario" onClick={() => exportarExcel(tabelaDia())}>⬇️ Excel do dia</Button>
          <Button variante="secundario" onClick={() => exportarPDF(tabelaDia(), rotuloDia(diaSelecionado))}>
            🖨️ PDF do dia
          </Button>
          {souDono && ficticios.length > 0 && (
            <Button
              variante="marca"
              onClick={simularDisponiveis}
              disabled={!temProgramacao}
              title={
                temProgramacao
                  ? 'Marca os motoristas fictícios como disponíveis neste dia'
                  : 'Lance a programação do dia (importe as rotas ou preencha o resumo) para liberar a simulação'
              }
            >
              🧪 Simular disponíveis ({ficticios.length})
            </Button>
          )}
          {souDono && (
            <Button variante="marca" onClick={() => setMarcarTodos((v) => !v)}>
              ⚡ Marcar todos
            </Button>
          )}
          <Button variante="marca" onClick={() => exportarExcel(tabelaPeriodo())}>
            📊 Relatório do período (Excel)
          </Button>
        </div>
      </div>

      {souDono && marcarTodos && (
        <Card className="border-marca bg-marca-suave p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">
            ⚡ Marcar a frota em massa — {rotuloDia(diaSelecionado)}
            {cidade && <span className="font-semibold text-slate-600"> · filtro: {cidade}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusMassa}
              onChange={(e) => setStatusMassa(e.target.value as StatusResposta)}
              style={{ width: 'auto' }}
            >
              {ORDEM_STATUS.map((valor) => (
                <option key={valor} value={valor}>
                  {STATUS_RESPOSTA[valor].emoji} {STATUS_RESPOSTA[valor].label}
                </option>
              ))}
            </Select>
            <Select
              value={alcanceMassa}
              onChange={(e) => setAlcanceMassa(e.target.value as 'sem-marcacao' | 'todos')}
              style={{ width: 'auto' }}
            >
              <option value="sem-marcacao">
                só quem ainda não marcou ({doDia.filter((x) => !x.marcacao).length})
              </option>
              <option value="todos">TODOS — sobrescreve quem já marcou ({frota.length})</option>
            </Select>
            <Button variante="marca" onClick={aplicarMarcacaoEmMassa}>
              ✅ Aplicar
            </Button>
            <Button variante="secundario" onClick={() => setMarcarTodos(false)}>
              Cancelar
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Vale para os motoristas do filtro atual da tela. Cada marcação fica registrada com data e
            hora, como se o motorista tivesse marcado — ajuste individual continua na lista abaixo.
          </p>
        </Card>
      )}

      {avisoSimulacao && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {avisoSimulacao}
        </p>
      )}
      {souDono && ficticios.length > 0 && !temProgramacao && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          🧪 A simulação de disponíveis libera depois que o dia tiver{' '}
          <Link to="/programacao" className="font-semibold text-marca-texto hover:underline">
            programação lançada
          </Link>{' '}
          (planilha de rotas ou resumo do dia) — {rotuloDia(diaSelecionado).toLowerCase()}.
        </p>
      )}

      {/* Seletor de dias */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {dias.map((d) => {
          const r = resumoDoDia(d)
          const ativo = d === diaSelecionado
          const dt = parseISODate(d)
          return (
            <button
              key={d}
              onClick={() => setDiaSelecionado(d)}
              className={`flex min-w-16 shrink-0 flex-col items-center rounded-xl border-2 px-3 py-2 transition-colors ${
                ativo ? 'border-navy bg-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase ${ativo ? 'text-marca' : 'text-slate-400'}`}>
                {dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className="text-lg font-bold leading-tight">{dt.getDate()}</span>
              <span className={`text-[10px] font-semibold ${ativo ? 'text-slate-300' : 'text-slate-400'}`}>
                {dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
              </span>
              <span className="mt-1 whitespace-nowrap text-[10px] font-bold">
                <span className={ativo ? 'text-emerald-300' : 'text-emerald-600'}>✓{r.sim}</span>{' '}
                <span className={ativo ? 'text-red-300' : 'text-red-500'}>✕{r.nao}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Limite de vagas do dia */}
      <Card className={`p-4 ${limiteDoDia ? 'border-marca bg-marca-suave' : ''}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">Limite de disponíveis — {rotuloDia(diaSelecionado)}</p>
            {limiteDoDia ? (
              <>
                <p className="text-xs text-slate-600">
                  {Math.min(disponiveisTotais, limiteDoDia.maxDisponiveis)}/{limiteDoDia.maxDisponiveis} vagas preenchidas
                  {disponiveisTotais >= limiteDoDia.maxDisponiveis && ' — esgotadas, novos motoristas não conseguem mais se marcar disponíveis'}
                </p>
                <div className="mt-1.5 max-w-64">
                  <ProgressBar
                    valor={disponiveisTotais}
                    total={limiteDoDia.maxDisponiveis}
                    cor={disponiveisTotais >= limiteDoDia.maxDisponiveis ? 'bg-red-500' : 'bg-marca-texto'}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Sem limite — o dia ainda não tem planejamento (importe as rotas ou o resumo na
                Programação) e não há limite manual definido.
              </p>
            )}
            {limiteDoDia && (
              <p className="mt-1 text-[11px] text-slate-500">
                {limiteCalc.origem === 'manual' ? (
                  <>✏️ Limite manual deste dia (ignora o cálculo automático).</>
                ) : (
                  <>
                    🎯 Automático: <strong>{limiteCalc.base}</strong> veículo(s) planejado(s) ({limiteCalc.fonte})
                    {limiteCalc.reserva > 0 ? (
                      <>
                        {' '}
                        + <strong>{limiteCalc.reserva}</strong> de reserva
                      </>
                    ) : (
                      ' sem reserva'
                    )}{' '}
                    = <strong>{limiteDoDia.maxDisponiveis}</strong>.{' '}
                    <Link to="/programacao" className="font-semibold text-marca-texto hover:underline">
                      Parametrizar
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
          {editandoLimite ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={novoLimite}
                onChange={(e) => setNovoLimite(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-marca-texto"
              />
              <Button
                variante="marca"
                onClick={() => {
                  if (novoLimite >= 1) {
                    salvarLimiteDia(diaSelecionado, novoLimite)
                    setEditandoLimite(false)
                  }
                }}
              >
                💾 Salvar
              </Button>
              <Button variante="fantasma" onClick={() => setEditandoLimite(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variante="secundario"
                onClick={() => {
                  setNovoLimite(limiteDoDia?.maxDisponiveis ?? 40)
                  setEditandoLimite(true)
                }}
              >
                {limiteCalc.origem === 'manual' ? '✏️ Alterar limite' : '✏️ Definir manual'}
              </Button>
              {limiteCalc.origem === 'manual' && (
                <Button
                  variante="secundario"
                  onClick={() => removerLimiteDia(diaSelecionado)}
                  title="Voltar a calcular pelo planejamento + reserva parametrizada"
                >
                  ↩️ Voltar ao automático
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Indicadores do dia. DISPONÍVEL é quem se ofereceu; VAI TRABALHAR é
          quem entrou no planejamento — os números podem (e devem) diferir. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icone="✅"
          valor={limiteDoDia ? `${trabalham.length}/${limiteDoDia.maxDisponiveis}` : trabalham.length}
          rotulo="Disponíveis (vagas)"
        />
        <StatCard
          icone="🚚"
          valor={doPlanejamentoDoDia.size > 0 ? doPlanejamentoDoDia.size : '—'}
          rotulo={doPlanejamentoDoDia.size > 0 ? 'Vão trabalhar (no planejamento)' : 'Vão trabalhar (monte o planejamento)'}
          destaque
        />
        <StatCard
          icone="🕐"
          valor={naEsperaDoDia.size}
          rotulo="Fila de espera"
        />
        <StatCard icone="❌" valor={naoTrabalham.length} rotulo="Indisponíveis" />
      </div>
      {doPlanejamentoDoDia.size > 0 && trabalham.length > doPlanejamentoDoDia.size && (
        <p className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800">
          ℹ️ <strong>{trabalham.length} disponíveis</strong>, mas{' '}
          <strong>{doPlanejamentoDoDia.size} vão trabalhar</strong> — os{' '}
          {trabalham.length - doPlanejamentoDoDia.size} além da meta{' '}
          {naEsperaDoDia.size > 0 ? 'estão na fila de espera do planejamento' : 'ficaram fora do planejamento'}.
        </p>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{rotuloDia(diaSelecionado)} • Filtrar:</span>
        <Select value={cidade} onChange={(e) => setCidade(e.target.value)} style={{ width: 'auto' }}>
          <option value="">📍 Todas as cidades</option>
          {cidades.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        {cidade && (
          <Button variante="fantasma" onClick={() => setCidade('')}>
            Limpar
          </Button>
        )}
      </div>

      {/* Listas do dia */}
      <div className={`grid gap-4 ${filaEspera.length > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-emerald-700">✅ Disponíveis ({disponiveisSelecionados.length})</h2>
          {disponiveisSelecionados.length === 0 ? (
            <EmptyState icone="🕐" titulo="Ninguém confirmado ainda" />
          ) : (
            <ul className="space-y-2">
              {disponiveisSelecionados.map(({ motorista, marcacao }) => (
                <LinhaMotorista key={motorista.id} m={motorista} a={marcacao} />
              ))}
            </ul>
          )}
        </Card>
        {filaEspera.length > 0 && (
          <Card className="border-amber-200 p-4">
            <h2 className="mb-1 font-bold text-amber-700">🕐 Fila de espera ({filaEspera.length})</h2>
            <p className="mb-3 text-xs text-slate-500">
              Disponíveis além da meta — não foram selecionados no planejamento e aguardam falta.
            </p>
            <ul className="space-y-2">
              {filaEspera.map(({ motorista, marcacao }) => (
                <LinhaMotorista key={motorista.id} m={motorista} a={marcacao} />
              ))}
            </ul>
          </Card>
        )}
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-red-600">❌ Indisponíveis ({naoTrabalham.length})</h2>
          {naoTrabalham.length === 0 ? (
            <EmptyState icone="🎉" titulo="Nenhuma ausência marcada" />
          ) : (
            <ul className="space-y-2">
              {naoTrabalham.map(({ motorista, marcacao }) => (
                <LinhaMotorista key={motorista.id} m={motorista} a={marcacao} />
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-slate-600">❔ Não informaram ({semMarcacao.length})</h2>
          {semMarcacao.length === 0 ? (
            <EmptyState icone="✅" titulo="Todos marcaram a disponibilidade!" />
          ) : (
            <ul className="space-y-2">
              {semMarcacao.map(({ motorista }) => (
                <LinhaMotorista key={motorista.id} m={motorista} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
