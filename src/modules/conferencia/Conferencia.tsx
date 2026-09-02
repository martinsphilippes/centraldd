// Tela do DISPATCHER: cria a conferência com a lista do que deve sair e
// acompanha o resultado quando o motorista envia a dele.

import { useState } from 'react'
import { removerConferencia, salvarConferencia, uid, useDB } from '../../core/db'
import { compararConferencia } from '../../core/conferencia'
import { formatarData, hojeISO, rotuloDia } from '../../core/dates'
import type { Conferencia as Conf } from '../../core/types'
import { ParadasDetalhadas, SeloOndaDoca, SeloParadas } from '../../components/SeloParadas'
import { PainelDocas } from './PainelDocas'
import { ondasEDocas } from '../../core/ondas'
import { contarParadas } from '../../core/conferencia'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '../../components/ui'
import { normalizarTexto } from '../../core/texto'
import type { RotaMeliLida } from '../../core/meli-rota'
import { DetalheConferencia } from './DetalheConferencia'
import { EntradaNumeracoes } from './EntradaNumeracoes'
import { CarimbosConferencia, ResultadoConferencia } from './ResultadoConferencia'

/** Selo de situação, o mesmo critério do resultado detalhado. */
/** Por onde a lista de conferências pode ser ordenada. */
type CampoOrdem = 'data' | 'motorista' | 'titulo' | 'situacao' | 'paradas' | 'onda' | 'doca'

const ROTULOS_ORDEM: Record<CampoOrdem, string> = {
  data: '📅 Data',
  motorista: '🚚 Motorista',
  titulo: '📋 Título da rota',
  situacao: '🚦 Situação',
  paradas: '📍 Paradas (PD)',
  onda: '🌊 Onda',
  doca: '🚪 Doca',
}

/**
 * Situação como NÚMERO, para ordenar na ordem que interessa ao Dispatcher:
 * primeiro o que precisa de atenção, por último o que já fechou.
 */
function pesoDaSituacao(c: Conf): number {
  if (c.conferidos === null) return 1 // em stand-by, esperando o motorista
  return compararConferencia(c.esperados, c.conferidos).bateu ? 3 : 2 // 2 = não bateu
}

function SeloSituacao({ c }: { c: Conf }) {
  if (c.conferidos === null)
    return <Badge className="border-amber-300 bg-amber-100 text-amber-800">⏳ Em stand-by</Badge>
  return compararConferencia(c.esperados, c.conferidos).bateu ? (
    <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">✅ Bateu</Badge>
  ) : (
    <Badge className="border-red-300 bg-red-100 text-red-800">⚠️ Não bateu</Badge>
  )
}

export function Conferencia() {
  const db = useDB()
  const [novo, setNovo] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  // Data decrescente é o padrão: o dia de hoje no topo.
  const [ordem, setOrdem] = useState<{ campo: CampoOrdem; desc: boolean }>({
    campo: 'data',
    desc: true,
  })
  const [filtroMotorista, setFiltroMotorista] = useState('')
  const [motoristaId, setMotoristaId] = useState('')
  const [data, setData] = useState(hojeISO())
  const [titulo, setTitulo] = useState('')
  const [rotaId, setRotaId] = useState('')
  const [esperados, setEsperados] = useState<string[]>([])
  const [arquivo, setArquivo] = useState('')
  const [rotaMeli, setRotaMeli] = useState<RotaMeliLida | null>(null)

  const motoristas = db.motoristas
    .filter((m) => m.ativo && m.aprovado !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const nomeDe = (id: string) => db.motoristas.find((m) => m.id === id)?.nome ?? '—'

  // Histórico completo, sempre acessível — o que o motorista limpou da tela
  // dele continua aqui, apenas com o selo 🧹.
  const chaveBusca = normalizarTexto(busca)
  // Onda e doca vêm do dia de cada conferência, não de um dia só: a lista
  // mistura datas, e cada uma tem o próprio carregamento.
  const postoDaConferencia = (c: Conf) => {
    const rota = db.rotas.find((r) => r.id === c.rotaId)
    if (!rota) return undefined
    return ondasEDocas(db.rotas.filter((r) => r.data === rota.data)).get(rota.id)
  }
  const valorDaOrdem = (c: Conf, campo: CampoOrdem): string | number => {
    switch (campo) {
      case 'motorista':
        return nomeDe(c.motoristaId)
      case 'titulo':
        return c.titulo
      case 'situacao':
        return pesoDaSituacao(c)
      case 'paradas':
        return contarParadas(c).total
      case 'onda':
        return postoDaConferencia(c)?.onda ?? 0
      case 'doca':
        return postoDaConferencia(c)?.doca ?? 0
      default:
        return c.data
    }
  }

  const lista = [...db.conferencias]
    .filter((c) => !filtroMotorista || c.motoristaId === filtroMotorista)
    .filter(
      (c) =>
        !chaveBusca ||
        normalizarTexto(`${c.titulo} ${nomeDe(c.motoristaId)} ${c.data}`).includes(chaveBusca),
    )
    .sort((a, b) => {
      const va = valorDaOrdem(a, ordem.campo)
      const vb = valorDaOrdem(b, ordem.campo)
      const c =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' })
      // Empate cai no envio mais recente — é a ordem que o Dispatcher espera
      // quando o critério escolhido não distingue duas conferências.
      return (ordem.desc ? -c : c) || b.enviadaEm.localeCompare(a.enviadaEm)
    })

  const abrir = () => {
    // Começa SEM motorista: quem escolhe é o documento, pelo código da rota.
    // Um nome pré-selecionado aqui fazia a caixa aparecer verde com o
    // primeiro da lista quando o vínculo falhava — e a carga ia para a
    // pessoa errada sem aviso.
    setMotoristaId('')
    setData(hojeISO())
    setTitulo('')
    setRotaId('')
    setEsperados([])
    setArquivo('')
    setRotaMeli(null)
    setNovo(true)
  }

  /**
   * A rota do dia cujo código bate com o do documento. O mesmo código volta em
   * dias diferentes, então a mais RECENTE ganha — é a que está sendo carregada.
   */
  const acharRotaPeloCodigo = (codigo: string) => {
    const alvo = (codigo ?? '').trim().toUpperCase()
    if (!alvo) return undefined
    return db.rotas
      .filter(
        (r) =>
          r.rotaExpedicao.trim().toUpperCase() === alvo ||
          r.rotaOriginal.trim().toUpperCase() === alvo,
      )
      .sort((a, b) => b.data.localeCompare(a.data))[0]
  }

  /**
   * Página do Meli lida: o documento JÁ DIZ de quem é a carga.
   *
   * Ele traz o código da rota, e a rota importada traz o motorista direcionado
   * e o dia. Perguntar o nome de novo era pedir ao Dispatcher que repetisse
   * uma informação que o arquivo tinha — e abria espaço para escolher a pessoa
   * errada numa lista de dezenas de nomes parecidos.
   *
   * O nome escrito no documento é a segunda opção, para a rota que ainda não
   * tem motorista direcionado.
   */
  const aplicarRotaMeli = (rota: RotaMeliLida | undefined) => {
    setRotaMeli(rota ?? null)
    // Cada leitura recomeça do zero: o vínculo do arquivo anterior não pode
    // sobrar para um arquivo novo que não trouxe código.
    setMotoristaId('')
    setRotaId('')
    if (!rota) return
    if (rota.rota) setTitulo((t) => t.trim() || `Rota ${rota.rota}`)
    const achada = acharRotaPeloCodigo(rota.rota)
    if (achada) {
      setRotaId(achada.id)
      setData(achada.data)
      if (achada.motoristaId) setMotoristaId(achada.motoristaId)
    }
    if (!achada?.motoristaId && rota.motorista) {
      const alvo = normalizarTexto(rota.motorista)
      const achado = motoristas.find((m) => normalizarTexto(m.nome) === alvo)
      if (achado) setMotoristaId(achado.id)
    }
  }

  const criar = () => {
    if (!motoristaId || esperados.length === 0) return
    const rota = db.rotas.find((r) => r.id === rotaId)
    salvarConferencia({
      id: uid(),
      data,
      motoristaId,
      rotaId: rotaId || null,
      titulo: titulo.trim() || (rota ? `Rota ${rota.rotaExpedicao}` : `Conferência ${formatarData(data)}`),
      esperados,
      origem: rotaMeli
        ? {
            rota: rotaMeli.rota,
            motorista: rotaMeli.motorista,
            transportadora: rotaMeli.transportadora,
            placa: rotaMeli.placa,
            veiculo: rotaMeli.veiculo,
            baseLat: rotaMeli.baseLat,
            baseLng: rotaMeli.baseLng,
          }
        : undefined,
      // O detalhe de cada pacote (PD-n, cidade, endereço) vem junto quando a
      // lista nasceu da página do Meli — é o que enriquece a lista de faltas.
      pacotes: rotaMeli
        ? rotaMeli.pacotes.map((x) => ({
            numeracao: x.numeracao,
            etiqueta: x.etiqueta,
            cidade: x.cidade,
            endereco: x.endereco,
            destinatario: x.destinatario,
            naoEntregue: x.naoEntregue,
            reclamacoes: x.reclamacoes,
            lat: x.lat,
            lng: x.lng,
            ordemMeli: x.ordemMeli,
            comercial: x.comercial,
            abre: x.abre,
            fecha: x.fecha,
            sempreAberto: x.sempreAberto,
          }))
        : [],
      arquivoDispatcher: arquivo,
      enviadaEm: new Date().toISOString(),
      conferidos: null,
      arquivoMotorista: '',
      conferidaEm: null,
    })
    setNovo(false)
  }

  const apagar = (c: Conf) => {
    if (confirm(`Apagar a conferência "${c.titulo}" de ${nomeDe(c.motoristaId)}?`))
      removerConferencia(c.id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🔍 Conferência de pacotes</h1>
          <p className="text-sm text-slate-500">
            Suba a lista do que deve sair. Ela fica em stand-by até o motorista conferir no aparelho
            dele — aí o sistema aponta o que não bateu, para os dois.
          </p>
        </div>
        <Button variante="marca" onClick={abrir} disabled={motoristas.length === 0}>
          ➕ Nova conferência
        </Button>
      </div>

      {/* O painel das docas usa SEMPRE o dia de hoje: ele é o quadro do
          carregamento que está acontecendo agora, e não pode mudar quando o
          Dispatcher escolhe outra data para abrir uma conferência nova. */}
      <PainelDocas data={hojeISO()} />

      {db.conferencias.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {/* A lista é de CARTÕES, não uma tabela: sem cabeçalho para clicar,
              a escolha da ordem vira um seletor com o botão de inverter ao
              lado. */}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            Ordenar por
            <Select
              value={ordem.campo}
              onChange={(e) => setOrdem((o) => ({ ...o, campo: e.target.value as CampoOrdem }))}
              style={{ width: 'auto' }}
            >
              {(Object.keys(ROTULOS_ORDEM) as CampoOrdem[]).map((campo) => (
                <option key={campo} value={campo}>
                  {ROTULOS_ORDEM[campo]}
                </option>
              ))}
            </Select>
          </label>
          <Button
            variante="secundario"
            onClick={() => setOrdem((o) => ({ ...o, desc: !o.desc }))}
            title={ordem.desc ? 'Do maior para o menor — clique para inverter' : 'Do menor para o maior — clique para inverter'}
          >
            {ordem.desc ? '▼ Z → A' : '▲ A → Z'}
          </Button>
          <Select value={filtroMotorista} onChange={(e) => setFiltroMotorista(e.target.value)} style={{ width: 'auto' }}>
            <option value="">🚚 Todos os motoristas</option>
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
          <Input
            placeholder="🔎 Buscar por rota, motorista ou data…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-72 max-w-full"
          />
          <span className="text-xs text-slate-500">{lista.length} conferência(s)</span>
        </div>
      )}

      {lista.length === 0 ? (
        <EmptyState
          icone="🔍"
          titulo={db.conferencias.length === 0 ? 'Nenhuma conferência ainda' : 'Nada com esse filtro'}
          descricao="Crie uma conferência com a lista de numerações que devem sair. O motorista recebe na tela dele e envia o CSV do que tem em mãos."
        />
      ) : (
        <div className="space-y-3">
          {lista.map((c) => (
            <Card key={c.id} className="p-4">
              {/* Cabeçalho clicável: um toque abre o detalhe pacote a pacote. */}
              {/* Fechado é UMA linha; tudo o mais só aparece ao abrir. */}
              <button
                className="-m-1 flex w-full items-center justify-between gap-2 rounded-lg p-1 text-left transition-colors hover:bg-slate-50"
                onClick={() => setAberta((a) => (a === c.id ? null : c.id))}
              >
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="font-bold text-slate-900">{c.titulo}</span>
                  <span className="truncate text-sm font-semibold text-slate-500">
                    🚚 {nomeDe(c.motoristaId)}
                  </span>
                  <span className="text-xs text-slate-400">📅 {rotuloDia(c.data)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SeloOndaDoca c={c} />
                  <SeloParadas c={c} />
                  {c.ocultaMotorista && aberta === c.id && (
                    <Badge className="border-slate-200 bg-slate-100 text-slate-500">
                      🧹 limpa pelo motorista
                    </Badge>
                  )}
                  <SeloSituacao c={c} />
                  <span className="text-slate-400">{aberta === c.id ? '▲' : '▼'}</span>
                </span>
              </button>
              {aberta === c.id && (
                <>
                  <div className="mt-2 space-y-2">
                    <ParadasDetalhadas c={c} />
                    <ResultadoConferencia c={c} />
                    <CarimbosConferencia c={c} />
                  </div>
                  <DetalheConferencia c={c} podeExcluir />
                  <div className="mt-2 flex justify-end">
                    <Button variante="fantasma" onClick={() => apagar(c)}>
                      🗑️ Apagar conferência
                    </Button>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal aberto={novo} titulo="➕ Nova conferência" onFechar={() => setNovo(false)}>
        <div className="space-y-3">
          {/*
            * O documento manda. Ele traz o CÓDIGO DA ROTA, e a rota importada
            * traz o motorista direcionado. Não há campo de motorista, de rota
            * nem de título: pedir de novo o que o arquivo já diz é convite
            * para escolher a pessoa errada numa lista de dezenas de nomes.
            *
            * O DIA fica, porque é a única coisa que o documento pode não
            * trazer — e é ele que separa a mesma rota de dias diferentes.
            */}
          <Field label="📅 Dia">
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Field>

          <div>
            <p className="mb-1 text-sm font-semibold text-slate-700">📄 Lista do que deve sair</p>
            <EntradaNumeracoes
              aoLer={(v, a, rotaLida) => {
                setEsperados(v)
                setArquivo(a)
                aplicarRotaMeli(rotaLida)
              }}
              placeholder="Cole aqui a página da rota do Meli (do bloco de notas), envie o arquivo salvo, ou cole as numerações…"
            />
          </div>

          {esperados.length > 0 && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                motoristaId
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-red-300 bg-red-50 text-red-800'
              }`}
            >
              {motoristaId ? (
                <>
                  <p className="font-bold">✅ Reconheci no arquivo</p>
                  <p className="mt-0.5">
                    🛣️ <strong>{rotaMeli?.rota || titulo}</strong> · 🚚{' '}
                    <strong>{nomeDe(motoristaId)}</strong> · 📅 {formatarData(data)} · 📦{' '}
                    {esperados.length} pacote(s)
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold">⚠️ Não consegui vincular esta carga</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    {!rotaMeli?.rota ? (
                      <>
                        O arquivo não trouxe o <strong>código da rota</strong>. Envie a página da
                        rota do Meli, que é onde esse código aparece.
                      </>
                    ) : !acharRotaPeloCodigo(rotaMeli.rota) ? (
                      <>
                        A rota <strong>{rotaMeli.rota}</strong> não está importada. Importe as rotas
                        em <strong>Programação → 🛣️ Importar rotas</strong> e volte aqui.
                      </>
                    ) : (
                      <>
                        A rota <strong>{rotaMeli.rota}</strong> está importada, mas ainda{' '}
                        <strong>sem motorista direcionado</strong>. Direcione em{' '}
                        <strong>Rotas</strong> e volte aqui.
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variante="secundario" onClick={() => setNovo(false)}>
              Cancelar
            </Button>
            <Button variante="marca" onClick={criar} disabled={!motoristaId || esperados.length === 0}>
              💾 Enviar para conferência ({esperados.length})
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
