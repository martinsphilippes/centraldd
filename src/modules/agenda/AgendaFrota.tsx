import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { removerLimiteDia, salvarLimiteDia, useDB } from '../../core/db'
import { hojeISO, formatarData, parseISODate, rotuloDia } from '../../core/dates'
import { STATUS_DISPONIVEIS, STATUS_RESPOSTA } from '../../core/constants'
import type { DiaAgenda, Motorista } from '../../core/types'
import { formatarTelefone, linkWhatsApp } from '../../core/comunicacao'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../../core/export'
import { Avatar, Badge, Button, Card, EmptyState, ProgressBar, Select, StatCard } from '../../components/ui'

const DIAS_VISIVEIS = 14

function detalheDe(a: DiaAgenda): string {
  if (a.status === 'apos_horario' && a.horario) return `após ${a.horario}`
  if (a.status === 'meio_periodo' && a.periodo) return a.periodo === 'manha' ? 'manhã' : 'tarde'
  return a.observacao ?? ''
}

/** Visão do coordenador: dia a dia, quem trabalha e quem não trabalha (agenda dos motoristas). */
export function AgendaFrota() {
  const db = useDB()
  const dias = useMemo(() => Array.from({ length: DIAS_VISIVEIS }, (_, i) => hojeISO(i)), [])
  const [diaSelecionado, setDiaSelecionado] = useState(dias[0])
  const [cidade, setCidade] = useState('')
  const [equipe, setEquipe] = useState('')
  const [editandoLimite, setEditandoLimite] = useState(false)
  const [novoLimite, setNovoLimite] = useState(40)

  const limiteDoDia = db.limites.find((l) => l.data === diaSelecionado)
  // Total de disponíveis do dia SEM filtros (é o número que consome as vagas).
  const disponiveisTotais = db.agenda.filter(
    (a) => a.data === diaSelecionado && STATUS_DISPONIVEIS.includes(a.status),
  ).length

  const frota = db.motoristas
    .filter((m) => m.ativo && m.aprovado !== false)
    .filter((m) => !cidade || m.cidade === cidade)
    .filter((m) => !equipe || m.equipe === equipe)
    .sort((a, b) => a.nome.localeCompare(b.nome))

  const cidades = [...new Set(db.motoristas.map((m) => m.cidade))].sort()
  const equipes = [...new Set(db.motoristas.map((m) => m.equipe))].filter(Boolean).sort()

  const marcacaoDe = (m: Motorista, data: string) =>
    db.agenda.find((a) => a.motoristaId === m.id && a.data === data)

  const doDia = frota.map((m) => ({ motorista: m, marcacao: marcacaoDe(m, diaSelecionado) }))
  const trabalham = doDia.filter((x) => x.marcacao && STATUS_DISPONIVEIS.includes(x.marcacao.status))
  const naoTrabalham = doDia.filter((x) => x.marcacao && !STATUS_DISPONIVEIS.includes(x.marcacao.status))
  const semMarcacao = doDia.filter((x) => !x.marcacao)

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
    titulo: `Agenda da frota ${formatarData(diaSelecionado)}`,
    colunas: ['Motorista', 'Telefone', 'Cidade', 'Equipe', 'Veículo', 'Vai trabalhar?', 'Status', 'Detalhe'],
    linhas: [...trabalham, ...naoTrabalham, ...semMarcacao].map(({ motorista: m, marcacao }) => [
      m.nome,
      formatarTelefone(m.telefone),
      m.cidade,
      m.equipe,
      m.veiculo,
      marcacao ? (STATUS_DISPONIVEIS.includes(marcacao.status) ? 'SIM' : 'NÃO') : 'Não informou',
      marcacao ? STATUS_RESPOSTA[marcacao.status].label : '—',
      marcacao ? detalheDe(marcacao) : '',
    ]),
  })

  const tabelaPeriodo = (): Tabela => ({
    titulo: `Agenda da frota ${formatarData(dias[0])} a ${formatarData(dias[dias.length - 1])}`,
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

  const LinhaMotorista = ({ m, a }: { m: Motorista; a?: DiaAgenda }) => (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5">
      <Avatar nome={m.nome} tamanho="sm" />
      <div className="min-w-0 flex-1">
        <Link to={`/motoristas/${m.id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-ml-azul">
          {m.nome}
        </Link>
        <p className="truncate text-[11px] text-slate-500">
          {m.cidade} • {m.equipe} • {m.veiculo}
        </p>
      </div>
      {a ? (
        <Badge className={STATUS_RESPOSTA[a.status].cor}>
          {STATUS_RESPOSTA[a.status].emoji} {STATUS_RESPOSTA[a.status].label}
          {detalheDe(a) ? ` — ${detalheDe(a)}` : ''}
        </Badge>
      ) : (
        <a
          href={linkWhatsApp(
            m,
            `Olá, ${m.nome.split(' ')[0]}! 🚚 Marque sua disponibilidade para ${rotuloDia(diaSelecionado).toLowerCase()} na Agenda do app MLDisponibilidade, por favor. 🙏`,
          )}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          title="Cobrar pelo WhatsApp"
        >
          💬 Cobrar
        </a>
      )}
    </li>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">📅 Agenda da frota</h1>
          <p className="text-sm text-slate-500">
            O que cada motorista marcou na própria agenda — dia a dia, em tempo real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => exportarCSV(tabelaDia())}>⬇️ CSV do dia</Button>
          <Button variante="secundario" onClick={() => exportarExcel(tabelaDia())}>⬇️ Excel do dia</Button>
          <Button variante="secundario" onClick={() => exportarPDF(tabelaDia(), rotuloDia(diaSelecionado))}>
            🖨️ PDF do dia
          </Button>
          <Button variante="ml" onClick={() => exportarExcel(tabelaPeriodo())}>
            📊 Relatório do período (Excel)
          </Button>
        </div>
      </div>

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
                ativo ? 'border-ml-navy bg-ml-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase ${ativo ? 'text-ml-amarelo' : 'text-slate-400'}`}>
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
      <Card className={`p-4 ${limiteDoDia ? 'border-ml-amarelo bg-yellow-50' : ''}`}>
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
                    cor={disponiveisTotais >= limiteDoDia.maxDisponiveis ? 'bg-red-500' : 'bg-ml-azul'}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Sem limite — qualquer quantidade de motoristas pode se marcar disponível neste dia.
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
                className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-ml-azul"
              />
              <Button
                variante="ml"
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
                {limiteDoDia ? '✏️ Alterar limite' : '🎯 Definir limite'}
              </Button>
              {limiteDoDia && (
                <Button variante="perigo" onClick={() => removerLimiteDia(diaSelecionado)}>
                  ✕ Remover
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Indicadores do dia */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icone="✅"
          valor={limiteDoDia ? `${trabalham.length}/${limiteDoDia.maxDisponiveis}` : trabalham.length}
          rotulo="Vão trabalhar"
          destaque
        />
        <StatCard icone="❌" valor={naoTrabalham.length} rotulo="Não vão trabalhar" />
        <StatCard icone="❔" valor={semMarcacao.length} rotulo="Não informaram" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{rotuloDia(diaSelecionado)} • Filtrar:</span>
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
        {(cidade || equipe) && (
          <Button variante="fantasma" onClick={() => { setCidade(''); setEquipe('') }}>
            Limpar
          </Button>
        )}
      </div>

      {/* Listas do dia */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-emerald-700">✅ Vão trabalhar ({trabalham.length})</h2>
          {trabalham.length === 0 ? (
            <EmptyState icone="🕐" titulo="Ninguém confirmado ainda" />
          ) : (
            <ul className="space-y-2">
              {trabalham.map(({ motorista, marcacao }) => (
                <LinhaMotorista key={motorista.id} m={motorista} a={marcacao} />
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-red-600">❌ Não vão trabalhar ({naoTrabalham.length})</h2>
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
            <EmptyState icone="✅" titulo="Todos marcaram a agenda!" />
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
