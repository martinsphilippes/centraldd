import { useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { importarRotas, removerRota, salvarRota, uid, useDB } from '../../core/db'
import { parsearPlanilhaRotas, type RotaImportada } from '../../core/planilha'
import { VEICULOS } from '../../core/constants'
import type { Rota } from '../../core/types'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../../core/export'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '../../components/ui'

const VEICULOS_ROTA = ['Utilitários', 'Vuc', 'Veículo de Passeio', ...VEICULOS]

export function Rotas() {
  const db = useDB()
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [transportadora, setTransportadora] = useState('')
  const [modalImportar, setModalImportar] = useState(false)
  const [textoColado, setTextoColado] = useState('')
  const [previa, setPrevia] = useState<{ rotas: RotaImportada[]; ignoradas: number } | null>(null)
  const [importando, setImportando] = useState(false)
  const [editando, setEditando] = useState<Rota | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const motoristas = db.motoristas
    .filter((m) => m.ativo && m.aprovado !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome))
  const porMotorista = new Map(motoristas.map((m) => [m.id, m]))

  const cidades = [...new Set(db.rotas.map((r) => r.cidade))].filter(Boolean).sort()
  const transportadoras = [...new Set(db.rotas.map((r) => r.transportadora))].filter(Boolean).sort()
  const veiculosOpcoes = [...new Set([...VEICULOS_ROTA, ...db.rotas.map((r) => r.veiculo)])]
    .filter(Boolean)
    .sort()

  const rotas = db.rotas
    .filter(
      (r) =>
        !busca ||
        r.rotaExpedicao.toLowerCase().includes(busca.toLowerCase()) ||
        r.rotaOriginal.toLowerCase().includes(busca.toLowerCase()) ||
        r.cidade.toLowerCase().includes(busca.toLowerCase()),
    )
    .filter((r) => !cidade || r.cidade === cidade)
    .filter((r) => !transportadora || r.transportadora === transportadora)
    .sort((a, b) => a.rotaExpedicao.localeCompare(b.rotaExpedicao, 'pt-BR', { numeric: true }))

  const semMotorista = rotas.filter((r) => !r.motoristaId).length

  const atualizarPrevia = (texto: string) => {
    setTextoColado(texto)
    setPrevia(texto.trim() ? parsearPlanilhaRotas(texto) : null)
  }

  const lerArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    const leitor = new FileReader()
    leitor.onload = () => atualizarPrevia(String(leitor.result ?? ''))
    leitor.readAsText(arquivo)
  }

  const confirmarImportacao = async () => {
    if (!previa || previa.rotas.length === 0) return
    setImportando(true)
    try {
      await importarRotas(previa.rotas)
      setModalImportar(false)
      setTextoColado('')
      setPrevia(null)
    } finally {
      setImportando(false)
    }
  }

  const tabela = (): Tabela => ({
    titulo: 'Rotas da operação',
    colunas: ['Cidade', 'Rota expedição', 'Rota original', 'Base', 'Veículo', 'Km', 'DPS', 'Ocupação %', 'Transportadora', 'Motorista'],
    linhas: rotas.map((r) => [
      r.cidade,
      r.rotaExpedicao,
      r.rotaOriginal,
      r.base,
      r.veiculo,
      r.km,
      r.dps,
      r.ocupacao,
      r.transportadora,
      r.motoristaId ? (porMotorista.get(r.motoristaId)?.nome ?? '—') : 'Sem motorista',
    ]),
  })

  const novaRota = () =>
    setEditando({
      id: uid(),
      cidade: '',
      rotaExpedicao: '',
      rotaOriginal: '',
      base: '',
      veiculo: veiculosOpcoes[0] ?? 'Utilitários',
      km: '',
      dps: '',
      ocupacao: '',
      transportadora: '',
      motoristaId: null,
      atualizadaEm: new Date().toISOString(),
    })

  const CELULA = 'px-2 py-2 text-slate-700 whitespace-nowrap'
  const SELETOR = 'rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-ml-azul'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🛣️ Rotas da operação</h1>
          <p className="text-sm text-slate-500">
            {db.rotas.length} rota(s) cadastrada(s)
            {db.rotas.length > 0 && semMotorista > 0 && ` • ${semMotorista} sem motorista direcionado`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => exportarCSV(tabela())}>⬇️ CSV</Button>
          <Button variante="secundario" onClick={() => exportarExcel(tabela())}>⬇️ Excel</Button>
          <Button variante="secundario" onClick={() => exportarPDF(tabela())}>🖨️ PDF</Button>
          <Button variante="secundario" onClick={novaRota}>➕ Nova rota</Button>
          <Button variante="ml" onClick={() => setModalImportar(true)}>📥 Importar planilha</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-52 flex-1">
          <Input placeholder="🔍 Buscar rota ou cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={cidade} onChange={(e) => setCidade(e.target.value)} style={{ width: 'auto' }}>
          <option value="">📍 Todas as cidades</option>
          {cidades.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select value={transportadora} onChange={(e) => setTransportadora(e.target.value)} style={{ width: 'auto' }}>
          <option value="">🚛 Todas as transportadoras</option>
          {transportadoras.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </div>

      {db.rotas.length === 0 ? (
        <EmptyState
          icone="🛣️"
          titulo="Nenhuma rota cadastrada"
          descricao="Use “Importar planilha” para trazer as rotas — cole direto do Excel ou envie o CSV."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2.5">Cidade</th>
                <th className="px-2 py-2.5">Rota expedição</th>
                <th className="px-2 py-2.5">Rota original</th>
                <th className="px-2 py-2.5">Base</th>
                <th className="px-2 py-2.5">Veículo</th>
                <th className="px-2 py-2.5 text-right">Km</th>
                <th className="px-2 py-2.5 text-center">DPS</th>
                <th className="px-2 py-2.5 text-right">Ocupação %</th>
                <th className="px-2 py-2.5">Transportadora</th>
                <th className="px-2 py-2.5">🚚 Motorista</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rotas.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={CELULA}>{r.cidade}</td>
                  <td className={`${CELULA} font-bold text-slate-900`}>{r.rotaExpedicao}</td>
                  <td className={`${CELULA} bg-yellow-50`}>{r.rotaOriginal}</td>
                  <td className={CELULA}>{r.base}</td>
                  <td className={CELULA}>
                    <select
                      className={SELETOR}
                      value={r.veiculo}
                      onChange={(e) => salvarRota({ ...r, veiculo: e.target.value })}
                      title="Trocar o tipo de veículo"
                    >
                      {[...new Set([r.veiculo, ...veiculosOpcoes])].filter(Boolean).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td className={`${CELULA} text-right`}>{r.km}</td>
                  <td className={`${CELULA} text-center`}>{r.dps}</td>
                  <td className={`${CELULA} text-right`}>{r.ocupacao}</td>
                  <td className={CELULA}>
                    <Badge
                      className={
                        /extra/i.test(r.transportadora)
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                          : 'border-red-200 bg-red-100 text-red-800'
                      }
                    >
                      {r.transportadora || '—'}
                    </Badge>
                  </td>
                  <td className={CELULA}>
                    <select
                      className={`${SELETOR} ${r.motoristaId ? '' : 'border-amber-300 bg-amber-50'}`}
                      value={r.motoristaId ?? ''}
                      onChange={(e) => salvarRota({ ...r, motoristaId: e.target.value || null })}
                      title="Direcionar motorista para esta rota"
                    >
                      <option value="">— sem motorista —</option>
                      {motoristas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={`${CELULA} text-right`}>
                    <button
                      onClick={() => setEditando(r)}
                      className="rounded-lg px-1.5 py-1 hover:bg-slate-200"
                      title="Editar todos os campos"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Excluir a rota ${r.rotaExpedicao}?`)) removerRota(r.id)
                      }}
                      className="rounded-lg px-1.5 py-1 text-red-600 hover:bg-red-50"
                      title="Excluir rota"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Importação */}
      <Modal aberto={modalImportar} titulo="📥 Importar planilha de rotas" onFechar={() => setModalImportar(false)}>
        <p className="mb-2 text-sm text-slate-600">
          <strong>Cole aqui as linhas da planilha</strong> (selecione no Excel/Sheets e Ctrl+C → Ctrl+V abaixo)
          ou envie o arquivo CSV. Ordem das colunas:
        </p>
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
          Cidade • Rota expedição • Rota original • Base • Veículo • Km • DPS • Ocupação % • Transportadora
        </p>
        <textarea
          className="h-40 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-ml-azul"
          placeholder={'Ituiutaba\tD11_AM1\tAM1_133\tEMG13\tVeículo de Passeio\t21,481\t5:00\t53,46\tEnvios Extra\n…'}
          value={textoColado}
          onChange={(e) => atualizarPrevia(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <input ref={arquivoRef} type="file" accept=".csv,.txt,.tsv" onChange={lerArquivo} className="hidden" />
          <Button variante="secundario" onClick={() => arquivoRef.current?.click()}>
            📄 Enviar arquivo CSV
          </Button>
          {previa && (
            <span className="text-sm font-semibold text-slate-700">
              ✅ {previa.rotas.length} rota(s) reconhecida(s)
              {previa.ignoradas > 0 && ` • ${previa.ignoradas} linha(s) ignorada(s)`}
            </span>
          )}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          💡 Reimportar a planilha <strong>atualiza</strong> as rotas existentes (pela Rota expedição) sem duplicar
          e sem perder os motoristas já direcionados.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setModalImportar(false)}>
            Cancelar
          </Button>
          <Button variante="ml" onClick={() => void confirmarImportacao()} disabled={!previa || previa.rotas.length === 0 || importando}>
            {importando ? 'Importando…' : `📥 Importar ${previa?.rotas.length ?? 0} rota(s)`}
          </Button>
        </div>
      </Modal>

      {/* Edição completa */}
      <Modal
        aberto={!!editando}
        titulo={editando?.rotaExpedicao ? `✏️ Rota ${editando.rotaExpedicao}` : '➕ Nova rota'}
        onFechar={() => setEditando(null)}
      >
        {editando && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cidade">
                <Input value={editando.cidade} onChange={(e) => setEditando({ ...editando, cidade: e.target.value })} />
              </Field>
              <Field label="Base">
                <Input value={editando.base} onChange={(e) => setEditando({ ...editando, base: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rota expedição">
                <Input
                  value={editando.rotaExpedicao}
                  onChange={(e) => setEditando({ ...editando, rotaExpedicao: e.target.value })}
                />
              </Field>
              <Field label="Rota original">
                <Input
                  value={editando.rotaOriginal}
                  onChange={(e) => setEditando({ ...editando, rotaOriginal: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Km">
                <Input value={editando.km} onChange={(e) => setEditando({ ...editando, km: e.target.value })} />
              </Field>
              <Field label="DPS">
                <Input value={editando.dps} onChange={(e) => setEditando({ ...editando, dps: e.target.value })} />
              </Field>
              <Field label="Ocupação %">
                <Input value={editando.ocupacao} onChange={(e) => setEditando({ ...editando, ocupacao: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Veículo (livre)">
                <Input value={editando.veiculo} onChange={(e) => setEditando({ ...editando, veiculo: e.target.value })} />
              </Field>
              <Field label="Transportadora">
                <Input
                  value={editando.transportadora}
                  onChange={(e) => setEditando({ ...editando, transportadora: e.target.value })}
                />
              </Field>
            </div>
            <Field label="🚚 Motorista direcionado">
              <Select
                value={editando.motoristaId ?? ''}
                onChange={(e) => setEditando({ ...editando, motoristaId: e.target.value || null })}
              >
                <option value="">— sem motorista —</option>
                {motoristas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} ({m.veiculo} • {m.cidade})
                  </option>
                ))}
              </Select>
            </Field>
            {editando.motoristaId && (
              <p className="text-xs text-slate-500">
                Perfil:{' '}
                <Link to={`/motoristas/${editando.motoristaId}`} className="font-semibold text-ml-azul hover:underline">
                  {porMotorista.get(editando.motoristaId)?.nome} →
                </Link>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variante="secundario" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button
                variante="ml"
                onClick={() => {
                  salvarRota(editando)
                  setEditando(null)
                }}
                disabled={!editando.rotaExpedicao.trim()}
              >
                💾 Salvar rota
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
