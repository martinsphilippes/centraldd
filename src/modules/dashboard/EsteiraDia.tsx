// A "Esteira do Dia": o fluxo da operação de uma data, etapa por etapa.
//
//   📅 Agenda  ╲
//               ⟶  📢 Chamada  ⟶  📋 Escala  ⟶  🛣️ Rotas
//   📆 Programação ╱
//
// Agenda e Programação são PARTIDAS PARALELAS — qualquer uma pode vir
// primeiro (dá para programar antes e deixar a frota responder depois:
// a resposta da chamada preenche a agenda do dia sozinha).

import { Link } from 'react-router-dom'
import { useDB } from '../../core/db'
import { formatarData } from '../../core/dates'
import { STATUS_DISPONIVEIS } from '../../core/constants'
import { Card } from '../../components/ui'

interface Etapa {
  icone: string
  titulo: string
  resumo: string
  feita: boolean
  para: string
  acao: string
}

function CartaoEtapa({ etapa, atual }: { etapa: Etapa; atual: boolean }) {
  const tom = etapa.feita
    ? 'border-emerald-300 bg-emerald-50'
    : atual
      ? 'border-ml-amarelo bg-yellow-50'
      : 'border-slate-200 bg-white'
  return (
    <Link
      to={etapa.para}
      className={`flex min-w-36 flex-1 flex-col gap-0.5 rounded-xl border-2 p-2.5 transition-shadow hover:shadow-md ${tom}`}
    >
      <span className="text-xs font-bold text-slate-800">
        {etapa.feita ? '✅' : etapa.icone} {etapa.titulo}
      </span>
      <span className="text-[11px] leading-tight text-slate-600">{etapa.resumo}</span>
      <span className={`mt-auto text-[11px] font-bold ${atual ? 'text-amber-700' : 'text-ml-azul'}`}>
        {etapa.acao} →
      </span>
    </Link>
  )
}

const Seta = () => <span className="hidden self-center text-lg text-slate-300 sm:block">➜</span>

export function EsteiraDia({
  data,
  aoMudarData,
}: {
  data: string
  aoMudarData?: (d: string) => void
}) {
  const db = useDB()

  const agendaDisp = db.agenda.filter(
    (a) => a.data === data && STATUS_DISPONIVEIS.includes(a.status),
  ).length
  const itensProg = db.programacao.filter((p) => p.data === data).length
  const resumoDia = db.resumos.find((r) => r.id === data)

  const chamada = db.chamadas.find((c) => c.data === data)
  const dispChamada = chamada
    ? db.respostas.filter(
        (r) => r.chamadaId === chamada.id && STATUS_DISPONIVEIS.includes(r.status),
      ).length
    : 0
  const escala = chamada ? db.escalas.find((e) => e.chamadaId === chamada.id) : undefined
  const totalRotas = db.rotas.length
  const direcionadas = db.rotas.filter((r) => r.motoristaId).length

  const agenda: Etapa = {
    icone: '📅',
    titulo: 'Agenda',
    resumo: agendaDisp > 0 ? `${agendaDisp} disponível(is) no dia` : 'ninguém marcou ainda',
    feita: agendaDisp > 0,
    para: '/agenda-frota',
    acao: 'Ver agenda',
  }
  const programacao: Etapa = {
    icone: '📆',
    titulo: 'Programação',
    resumo:
      itensProg > 0 || resumoDia
        ? `${itensProg > 0 ? `${itensProg} rota(s) do Meli` : ''}${itensProg > 0 && resumoDia ? ' · ' : ''}${resumoDia ? 'resumo pronto' : ''}`
        : 'importe o Meli ou o resumo',
    feita: itensProg > 0 || !!resumoDia,
    para: '/programacao',
    acao: itensProg > 0 || resumoDia ? 'Ver programação' : 'Programar',
  }
  const partiu = agenda.feita || programacao.feita

  const etapaChamada: Etapa = {
    icone: '📢',
    titulo: 'Chamada',
    resumo: chamada
      ? `${dispChamada}/${chamada.qtdNecessaria} disponíveis${chamada.status === 'encerrada' ? ' · encerrada' : ''}`
      : 'chame os motoristas',
    feita: !!chamada && (dispChamada >= chamada.qtdNecessaria || chamada.status === 'encerrada'),
    para: chamada ? `/chamadas/${chamada.id}` : resumoDia ? '/programacao' : '/chamadas/nova',
    acao: chamada ? 'Ver respostas' : resumoDia ? 'Chamar pelo resumo' : 'Criar chamada',
  }
  const etapaEscala: Etapa = {
    icone: '📋',
    titulo: 'Escala',
    resumo: escala
      ? `${escala.motoristaIds.length} escalado(s) · ${escala.status === 'rascunho' ? 'rascunho' : escala.status}`
      : chamada
        ? 'monte a partir da chamada'
        : 'depende da chamada',
    feita: !!escala && escala.status !== 'rascunho',
    para: escala ? `/escalas/${escala.id}` : chamada ? `/chamadas/${chamada.id}` : '/escalas',
    acao: escala ? 'Ver escala' : 'Montar escala',
  }
  const etapaRotas: Etapa = {
    icone: '🛣️',
    titulo: 'Rotas',
    resumo:
      totalRotas > 0 ? `${direcionadas}/${totalRotas} direcionadas` : 'importe as rotas da operação',
    feita: totalRotas > 0 && direcionadas === totalRotas,
    para: '/rotas',
    acao: totalRotas > 0 ? 'Direcionar' : 'Importar rotas',
  }

  // A etapa "atual" é a primeira ainda não concluída na ordem da esteira.
  const atualChamada = partiu && !etapaChamada.feita
  const atualEscala = partiu && etapaChamada.feita && !etapaEscala.feita
  const atualRotas = partiu && etapaChamada.feita && etapaEscala.feita && !etapaRotas.feita

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">🧭 Esteira do dia</h2>
        <input
          type="date"
          value={data}
          onChange={(e) => aoMudarData?.(e.target.value)}
          disabled={!aoMudarData}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-ml-azul"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5 rounded-xl border border-dashed border-slate-300 p-1.5">
          <p className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Partida — qualquer ordem
          </p>
          <CartaoEtapa etapa={agenda} atual={!partiu} />
          <CartaoEtapa etapa={programacao} atual={!partiu} />
        </div>
        <Seta />
        <CartaoEtapa etapa={etapaChamada} atual={atualChamada} />
        <Seta />
        <CartaoEtapa etapa={etapaEscala} atual={atualEscala} />
        <Seta />
        <CartaoEtapa etapa={etapaRotas} atual={atualRotas} />
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Cada etapa alimenta a próxima: o resumo define a meta da chamada, a resposta preenche a
        agenda, a escala conduz o direcionamento das rotas — {formatarData(data)}.
      </p>
    </Card>
  )
}
