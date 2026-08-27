// Tela do DISPATCHER: cria a conferência com a lista do que deve sair e
// acompanha o resultado quando o motorista envia a dele.

import { useState } from 'react'
import { removerConferencia, salvarConferencia, uid, useDB } from '../../core/db'
import { compararConferencia } from '../../core/conferencia'
import { formatarData, hojeISO, rotuloDia } from '../../core/dates'
import type { Conferencia as Conf } from '../../core/types'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '../../components/ui'
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
  const [motoristaId, setMotoristaId] = useState('')
  const [data, setData] = useState(hojeISO())
  const [titulo, setTitulo] = useState('')
  const [rotaId, setRotaId] = useState('')
  const [esperados, setEsperados] = useState<string[]>([])
  const [arquivo, setArquivo] = useState('')

  const motoristas = db.motoristas
    .filter((m) => m.ativo && m.aprovado !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const nomeDe = (id: string) => db.motoristas.find((m) => m.id === id)?.nome ?? '—'

  const lista = [...db.conferencias].sort(
    (a, b) => b.data.localeCompare(a.data) || b.enviadaEm.localeCompare(a.enviadaEm),
  )
  const rotasDoDia = db.rotas.filter((r) => !r.finalizadaEm)

  const abrir = () => {
    setMotoristaId(motoristas[0]?.id ?? '')
    setData(hojeISO())
    setTitulo('')
    setRotaId('')
    setEsperados([])
    setArquivo('')
    setNovo(true)
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

      {lista.length === 0 ? (
        <EmptyState
          icone="🔍"
          titulo="Nenhuma conferência ainda"
          descricao="Crie uma conferência com a lista de numerações que devem sair. O motorista recebe na tela dele e envia o CSV do que tem em mãos."
        />
      ) : (
        <div className="space-y-3">
          {lista.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-slate-900">
                    {c.titulo}
                    <span className="ml-2 text-sm font-semibold text-slate-500">
                      🚚 {nomeDe(c.motoristaId)}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">📅 {rotuloDia(c.data)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <SeloSituacao c={c} />
                  <Button variante="fantasma" onClick={() => apagar(c)} title="Apagar conferência">
                    🗑️
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <ResultadoConferencia c={c} />
                <CarimbosConferencia c={c} />
              </div>
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
              aoLer={(v, a) => {
                setEsperados(v)
                setArquivo(a)
              }}
              placeholder="Cole a lista de numerações do documento…"
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
