// Tela do DISPATCHER: cria a conferência com a lista do que deve sair e
// acompanha o resultado quando o motorista envia a dele.

import { useState } from 'react'
import { removerConferencia, salvarConferencia, uid, useDB } from '../../core/db'
import { compararConferencia } from '../../core/conferencia'
import { formatarData, hojeISO, rotuloDia } from '../../core/dates'
import type { Conferencia as Conf } from '../../core/types'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '../../components/ui'
import { normalizarTexto } from '../../core/texto'
import type { RotaMeliLida } from '../../core/meli-rota'
import { DetalheConferencia } from './DetalheConferencia'
import { EntradaNumeracoes } from './EntradaNumeracoes'
import { CarimbosConferencia, ResultadoConferencia } from './ResultadoConferencia'

/** Selo de situação, o mesmo critério do resultado detalhado. */
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
  const lista = [...db.conferencias]
    .filter((c) => !filtroMotorista || c.motoristaId === filtroMotorista)
    .filter(
      (c) =>
        !chaveBusca ||
        normalizarTexto(`${c.titulo} ${nomeDe(c.motoristaId)} ${c.data}`).includes(chaveBusca),
    )
    .sort((a, b) => b.data.localeCompare(a.data) || b.enviadaEm.localeCompare(a.enviadaEm))
  const rotasDoDia = db.rotas.filter((r) => r.data === data && !r.finalizadaEm)

  const abrir = () => {
    setMotoristaId(motoristas[0]?.id ?? '')
    setData(hojeISO())
    setTitulo('')
    setRotaId('')
    setEsperados([])
    setArquivo('')
    setRotaMeli(null)
    setNovo(true)
  }

  /**
   * Página do Meli lida: preenche o que der sozinho — o título vira o nome da
   * rota e, se o motorista do documento estiver no cadastro (mesmo nome, sem
   * acento), ele já fica selecionado.
   */
  const aplicarRotaMeli = (rota: RotaMeliLida | undefined) => {
    setRotaMeli(rota ?? null)
    if (!rota) return
    if (rota.rota) setTitulo((t) => t.trim() || `Rota ${rota.rota}`)
    if (rota.motorista) {
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
        <Button variante="ml" onClick={abrir} disabled={motoristas.length === 0}>
          ➕ Nova conferência
        </Button>
      </div>

      {db.conferencias.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="🚚 Motorista">
              <Select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
                {motoristas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="📅 Dia">
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="🛣️ Rota (opcional)">
              <Select value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
                <option value="">— sem rota —</option>
                {rotasDoDia.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.rotaExpedicao} · {r.cidade}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Título (opcional)">
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Carga da manhã"
              />
            </Field>
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold text-slate-700">
              📄 Lista do que deve sair
            </p>
            <EntradaNumeracoes
              aoLer={(v, a, rotaLida) => {
                setEsperados(v)
                setArquivo(a)
                aplicarRotaMeli(rotaLida)
              }}
              placeholder="Cole aqui a página da rota do Meli (do bloco de notas), envie o arquivo salvo, ou cole as numerações…"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variante="secundario" onClick={() => setNovo(false)}>
              Cancelar
            </Button>
            <Button variante="ml" onClick={criar} disabled={!motoristaId || esperados.length === 0}>
              💾 Enviar para conferência ({esperados.length})
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
