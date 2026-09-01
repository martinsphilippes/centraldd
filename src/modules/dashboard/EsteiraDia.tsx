// A "Esteira do Dia": o fluxo da operação de uma data, etapa por etapa.
//
//   🛣️ Rotas do dia   ╲
//   📆 Programação      ⟶  📢 Chamada  ⟶  📋 Planejamento  ⟶  🛣️ Direcionamento
//   📅 Disponibilidade ╱
//
// As três são PARTIDAS PARALELAS, mas a das ROTAS vem primeiro na lista por
// ser a que carrega o dia: é dela que saem o total de rotas e o resumo, e é o
// resumo que define a meta da chamada. As outras duas podem vir em qualquer
// ordem (dá para programar antes e deixar a frota responder depois: a resposta
// da chamada preenche a disponibilidade do dia sozinha).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ImportarRotasModal } from '../rotas/ImportarRotasModal'
import { useDB } from '../../core/db'
import { amDoDia } from '../../core/resumo-auto'
import { formatarData } from '../../core/dates'
import { STATUS_DISPONIVEIS } from '../../core/constants'
import { Button, Card } from '../../components/ui'

interface Etapa {
  icone: string
  titulo: string
  resumo: string
  feita: boolean
  para: string
  acao: string
}

function CartaoEtapa({
  etapa,
  atual,
  aoTocar,
}: {
  etapa: Etapa
  atual: boolean
  /** Quando existe, o cartão ABRE algo aqui mesmo em vez de navegar. */
  aoTocar?: () => void
}) {
  const tom = etapa.feita
    ? 'border-emerald-300 bg-emerald-50'
    : atual
      ? 'border-marca bg-marca-suave'
      : 'border-slate-200 bg-white'
  const classe = `flex min-w-36 flex-1 flex-col gap-0.5 rounded-xl border-2 p-2.5 text-left transition-shadow hover:shadow-md ${tom}`
  const miolo = (
    <>
      <span className="text-xs font-bold text-slate-800">
        {etapa.feita ? '✅' : etapa.icone} {etapa.titulo}
      </span>
      <span className="text-[11px] leading-tight text-slate-600">{etapa.resumo}</span>
      <span className={`mt-auto text-[11px] font-bold ${atual ? 'text-amber-700' : 'text-marca-texto'}`}>
        {etapa.acao} →
      </span>
    </>
  )
  // Sem rotas carregadas, o cartão levava para /programacao — que é onde o
  // Dispatcher já está. O toque não fazia nada; agora abre o importador.
  return aoTocar ? (
    <button type="button" onClick={aoTocar} className={classe}>
      {miolo}
    </button>
  ) : (
    <Link to={etapa.para} className={classe}>
      {miolo}
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
  const [modalRotas, setModalRotas] = useState(false)

  const disponibilidadeMarcada = db.disponibilidade.filter(
    (a) => a.data === data && STATUS_DISPONIVEIS.includes(a.status),
  ).length
  const itensProg = db.programacao.filter((p) => p.data === data).length
  // O resumo do dia é DERIVADO da planilha de rotas: ele existe assim que as
  // rotas entram, mesmo que ninguém tenha aberto o card para salvar nada. Antes
  // isto olhava só o documento salvo, e um dia inteiro já importado aparecia
  // como pendente até alguém tocar em Salvar sem mudar nada.
  const resumoDia = db.resumos.find((r) => r.id === data) ?? (amDoDia(db, data).fonte ? {} : undefined)

  const chamada = db.chamadas.find((c) => c.data === data)
  const dispChamada = chamada
    ? db.respostas.filter(
        (r) => r.chamadaId === chamada.id && STATUS_DISPONIVEIS.includes(r.status),
      ).length
    : 0
  const planejamento = chamada ? db.planejamento.find((e) => e.chamadaId === chamada.id) : undefined
  const rotasDoDia = db.rotas.filter((r) => r.data === data)
  const totalRotas = rotasDoDia.length
  const direcionadas = rotasDoDia.filter((r) => r.motoristaId).length

  // A roteirização do dia entra ANTES da chamada: é ela que diz quantas
  // rotas existem e alimenta o direcionamento lá na frente.
  const rotasCarregadas = totalRotas > 0

  const disponibilidade: Etapa = {
    icone: '📅',
    titulo: 'Disponibilidade',
    resumo: disponibilidadeMarcada > 0 ? `${disponibilidadeMarcada} disponível(is) no dia` : 'ninguém marcou ainda',
    feita: disponibilidadeMarcada > 0,
    para: '/disponibilidade',
    acao: 'Ver disponibilidade',
  }
  const programacao: Etapa = {
    icone: '📆',
    titulo: 'Programação',
    resumo:
      itensProg > 0 || resumoDia
        ? `${itensProg > 0 ? `${itensProg} rota(s) alocada(s)` : ''}${itensProg > 0 && resumoDia ? ' · ' : ''}${resumoDia ? 'resumo pronto' : ''}`
        : 'confira o resumo do dia',
    feita: itensProg > 0 || !!resumoDia,
    para: '/programacao',
    acao: itensProg > 0 || resumoDia ? 'Ver programação' : 'Programar',
  }
  const carregarRotas: Etapa = {
    icone: '🛣️',
    titulo: 'Rotas do dia',
    resumo: rotasCarregadas ? `${totalRotas} rota(s) carregada(s)` : 'importe a roteirização',
    feita: rotasCarregadas,
    para: rotasCarregadas ? '/rotas' : '/programacao',
    acao: rotasCarregadas ? 'Ver rotas' : 'Importar rotas',
  }
  // Só faz sentido chamar a frota depois que o dia tem rota e alguma partida.
  const partiu = (disponibilidade.feita || programacao.feita) && rotasCarregadas

  const etapaChamada: Etapa = {
    icone: '📢',
    titulo: 'Chamada',
    resumo: chamada
      ? `${dispChamada}/${chamada.qtdNecessaria} disponíveis${chamada.status === 'encerrada' ? ' · encerrada' : ''}`
      : rotasCarregadas
        ? 'chame os motoristas'
        : 'carregue as rotas antes',
    feita: !!chamada && (dispChamada >= chamada.qtdNecessaria || chamada.status === 'encerrada'),
    para: chamada ? `/chamadas/${chamada.id}` : '/programacao',
    acao: chamada ? 'Ver respostas' : rotasCarregadas ? 'Chamar pelo resumo' : 'Importar rotas',
  }
  const etapaPlanejamento: Etapa = {
    icone: '📋',
    titulo: 'Planejamento',
    resumo: planejamento
      ? `${planejamento.motoristaIds.length} no planejamento · ${planejamento.status === 'rascunho' ? 'rascunho' : planejamento.status}`
      : chamada
        ? 'monte a partir da chamada'
        : 'depende da chamada',
    feita: !!planejamento && planejamento.status !== 'rascunho',
    para: planejamento ? `/planejamento/${planejamento.id}` : chamada ? `/chamadas/${chamada.id}` : '/planejamento',
    acao: planejamento ? 'Ver planejamento' : 'Montar planejamento',
  }
  const etapaDirecionamento: Etapa = {
    icone: '⚡',
    titulo: 'Direcionamento',
    resumo: rotasCarregadas ? `${direcionadas}/${totalRotas} direcionadas` : 'depende das rotas',
    feita: rotasCarregadas && direcionadas === totalRotas,
    para: '/rotas',
    acao: 'Direcionar',
  }

  // A etapa "atual" é a primeira ainda não concluída na ordem da esteira.
  const atualChamada = partiu && !etapaChamada.feita
  const atualPlanejamento = partiu && etapaChamada.feita && !etapaPlanejamento.feita
  const atualDirecionamento =
    partiu && etapaChamada.feita && etapaPlanejamento.feita && !etapaDirecionamento.feita

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold text-slate-900">🧭 Esteira do dia</h2>
          {/* A importação abre a esteira: fica junto do título, e não lá
              embaixo no card do resumo, porque é o primeiro toque do dia. */}
          <Button variante="marca" onClick={() => setModalRotas(true)}>
            🛣️ Importar rotas
          </Button>
        </div>
        <input
          type="date"
          value={data}
          onChange={(e) => aoMudarData?.(e.target.value)}
          disabled={!aoMudarData}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-marca-texto"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5 rounded-xl border border-dashed border-slate-300 p-1.5">
          <p className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Partida — qualquer ordem
          </p>
          {/* Rotas primeiro: é a importação que carrega o dia — dela saem o
              total de rotas e o resumo, que definem a meta da chamada. */}
          <CartaoEtapa
            etapa={carregarRotas}
            atual={!rotasCarregadas}
            aoTocar={rotasCarregadas ? undefined : () => setModalRotas(true)}
          />
          <CartaoEtapa etapa={programacao} atual={!partiu} />
          <CartaoEtapa etapa={disponibilidade} atual={!partiu} />
        </div>
        <Seta />
        <CartaoEtapa etapa={etapaChamada} atual={atualChamada} />
        <Seta />
        <CartaoEtapa etapa={etapaPlanejamento} atual={atualPlanejamento} />
        <Seta />
        <CartaoEtapa etapa={etapaDirecionamento} atual={atualDirecionamento} />
      </div>
      <ImportarRotasModal aberto={modalRotas} onFechar={() => setModalRotas(false)} data={data} />

      <p className="mt-2 text-center text-[11px] text-slate-400">
        A partida precisa das rotas carregadas: o resumo define a meta da chamada, a resposta
        preenche a disponibilidade e a planejamento conduz o direcionamento — {formatarData(data)}.
      </p>
    </Card>
  )
}
