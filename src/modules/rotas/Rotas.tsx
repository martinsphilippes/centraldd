import { useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { enviarNotificacao, importarRotas, registrarDiagnosticoOcr, removerRota, salvarRota, uid, useDB } from '../../core/db'
import { parsearPlanilhaRotas, type RotaImportada } from '../../core/planilha'
import { extrairTextoDeArquivos, obterUltimaMiniaturaOcr } from '../../core/pdf'
import { alocarMotoristasNasRotas, parametrosAtuais } from '../../core/alocacao'
import { VEICULOS } from '../../core/constants'
import { formatarData } from '../../core/dates'
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
  const [lendoPdf, setLendoPdf] = useState('')
  const [erroArquivo, setErroArquivo] = useState('')
  const [editando, setEditando] = useState<Rota | null>(null)
  const [avisoAuto, setAvisoAuto] = useState('')
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

  // ---------- Direcionamento automático a partir da chamada ----------
  // Candidatos = quem respondeu "disponível" na chamada mais recente
  // (aberta tem prioridade). As rotas já direcionadas à mão são preservadas.
  const chamadaBase = db.chamadas
    .slice()
    .sort((a, b) =>
      a.status === b.status ? b.data.localeCompare(a.data) : a.status === 'aberta' ? -1 : 1,
    )[0]
  // A ordem da esteira manda: primeiro a ESCALA da chamada é montada;
  // só então o direcionamento entra em cena, usando os escalados.
  const escalaDaChamada = chamadaBase
    ? db.escalas.find((e) => e.chamadaId === chamadaBase.id)
    : undefined
  const candidatosChamada = escalaDaChamada
    ? motoristas.filter((m) => escalaDaChamada.motoristaIds.includes(m.id))
    : []

  const direcionarAutomatico = () => {
    const vagas = db.rotas.filter((r) => !r.motoristaId)
    // Rota FINALIZADA libera o motorista para uma nova; pendente segura.
    const comPendencia = new Set(
      db.rotas.filter((r) => r.motoristaId && !r.finalizadaEm).map((r) => r.motoristaId),
    )
    const livres = candidatosChamada.filter((m) => !comPendencia.has(m.id))
    const alocacoes = alocarMotoristasNasRotas(db, vagas, livres, parametrosAtuais(db))
    if (alocacoes.length === 0) {
      setAvisoAuto('⚠️ Nenhuma rota vaga com motorista disponível compatível — confira as travas nos ⚙️ Parâmetros da Programação.')
      return
    }
    if (!confirm(`Direcionar automaticamente ${alocacoes.length} rota(s) com os escalados da escala de ${formatarData(chamadaBase.data)}?`))
      return
    for (const a of alocacoes) salvarRota({ ...a.rota, motoristaId: a.motorista.id, finalizadaEm: null, resultadoFinalizacao: null })
    const sobraram = livres.length - alocacoes.length
    setAvisoAuto(
      `⚡ ${alocacoes.length} rota(s) direcionada(s) com os escalados da escala de ${formatarData(chamadaBase.data)}.` +
        (sobraram > 0 ? ` ${sobraram} motorista(s) ficaram de reserva.` : ''),
    )
  }

  /**
   * Duplica a rota na mesma linha (mesma rota original): parte dos pacotes
   * fica com um segundo motorista. A cópia nasce sem motorista direcionado.
   */
  const duplicarRota = (r: Rota) => {
    salvarRota({ ...r, id: uid(), motoristaId: null, finalizadaEm: null, resultadoFinalizacao: null, atualizadaEm: new Date().toISOString() })
    setAvisoAuto(`➕ Rota ${r.rotaExpedicao} duplicada — direcione o segundo motorista na nova linha.`)
  }

  const limparDirecionamentos = () => {
    const direcionadas = db.rotas.filter((r) => r.motoristaId)
    if (direcionadas.length === 0) return
    if (!confirm(`Tirar o motorista de ${direcionadas.length} rota(s)? (as rotas continuam cadastradas)`)) return
    for (const r of direcionadas) salvarRota({ ...r, motoristaId: null, finalizadaEm: null, resultadoFinalizacao: null })
    setAvisoAuto('🧹 Direcionamentos limpos.')
  }

  /**
   * A COORDENAÇÃO encerra uma rota que o motorista não finalizou: fica
   * registrada como finalizada COM PENDÊNCIA (entregas que não saíram),
   * e o motorista é avisado na hora.
   */
  const finalizarPelaCoordenacao = (r: Rota) => {
    const nome = r.motoristaId ? (porMotorista.get(r.motoristaId)?.nome ?? '') : ''
    if (!confirm(`Encerrar a rota ${r.rotaExpedicao} pela coordenação? Ela fica registrada como PENDENTE (o motorista ${nome} não finalizou).`))
      return
    salvarRota({ ...r, finalizadaEm: new Date().toISOString(), resultadoFinalizacao: 'pendente' })
    if (r.motoristaId) {
      enviarNotificacao({
        motoristaId: r.motoristaId,
        titulo: `Rota ${r.rotaExpedicao} encerrada pela coordenação`,
        mensagem: `⚠️ A rota ${r.rotaExpedicao} foi finalizada pela coordenação com entregas pendentes. Qualquer dúvida, fale com a coordenação.`,
      })
    }
    setAvisoAuto(`🏁 Rota ${r.rotaExpedicao} encerrada como pendente.`)
  }

  /** Encerra TODAS as rotas em andamento de uma vez (fim do dia). */
  const encerrarRotasDoDia = () => {
    const emAndamento = db.rotas.filter((r) => r.motoristaId && !r.finalizadaEm)
    if (emAndamento.length === 0) return
    const entregues = db.rotas.filter((r) => r.finalizadaEm && r.resultadoFinalizacao !== 'pendente').length
    if (
      !confirm(
        `Encerrar as ${emAndamento.length} rota(s) ainda em andamento? Elas ficam registradas como PENDENTES (os motoristas não finalizaram). ${entregues} já foram entregues pelos motoristas.`,
      )
    )
      return
    const agora = new Date().toISOString()
    for (const r of emAndamento) {
      salvarRota({ ...r, finalizadaEm: agora, resultadoFinalizacao: 'pendente' })
      if (r.motoristaId) {
        enviarNotificacao({
          motoristaId: r.motoristaId,
          titulo: `Rota ${r.rotaExpedicao} encerrada pela coordenação`,
          mensagem: `⚠️ A rota ${r.rotaExpedicao} foi finalizada pela coordenação com entregas pendentes. Qualquer dúvida, fale com a coordenação.`,
        })
      }
    }
    setAvisoAuto(
      `🏁 Dia encerrado: ${emAndamento.length} rota(s) marcadas como pendentes • ${entregues} entregues pelos motoristas.`,
    )
  }

  /** Apaga TODAS as rotas — para carregar a planilha de outra operação do zero. */
  const apagarTodasAsRotas = () => {
    if (db.rotas.length === 0) return
    if (
      !confirm(
        `Apagar TODAS as ${db.rotas.length} rota(s) cadastradas? Use para trocar de operação — depois é só importar a nova planilha.`,
      )
    )
      return
    for (const r of db.rotas) removerRota(r.id)
    setAvisoAuto('🗑️ Rotas apagadas — importe a planilha da nova operação.')
  }

  const atualizarPrevia = (texto: string) => {
    setTextoColado(texto)
    setPrevia(texto.trim() ? parsearPlanilhaRotas(texto) : null)
  }

  const lerArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = '' // permite reenviar os mesmos arquivos
    if (arquivos.length === 0) return
    setErroArquivo('')
    setLendoPdf('⏳ Lendo…')
    void (async () => {
      try {
        // As leituras se SOMAM: enviar outra foto acrescenta as linhas dela
        // (no iPad a galeria costuma deixar escolher uma por vez).
        const texto = await extrairTextoDeArquivos(arquivos, setLendoPdf)
        registrarDiagnosticoOcr('rotas', texto, {
          arquivo: arquivos.map((a) => a.name).join(', '),
          miniatura: obterUltimaMiniaturaOcr().slice(0, 700000),
        })
        const anterior = textoColado.trim() ? textoColado.replace(/\s+$/, '') + '\n' : ''
        atualizarPrevia(anterior + texto)
      } catch (err) {
        const detalhe = err instanceof Error ? err.message : String(err)
        setErroArquivo(`Não consegui ler (${detalhe}). Tente uma foto/PDF mais nítido, cole os dados ou use CSV.`)
      } finally {
        setLendoPdf('')
      }
    })()
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
    colunas: ['Cidade', 'Rota expedição', 'Rota original', 'Base', 'Motorista', 'Veículo', 'Km', 'DPS', 'Ocupação %', 'Transportadora'],
    linhas: rotas.map((r) => [
      r.cidade,
      r.rotaExpedicao,
      r.rotaOriginal,
      r.base,
      r.motoristaId ? (porMotorista.get(r.motoristaId)?.nome ?? '—') : 'Sem motorista',
      r.veiculo,
      r.km,
      r.dps,
      r.ocupacao,
      r.transportadora,
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
          {chamadaBase && !escalaDaChamada && (
            // Sem escala ainda: a esteira manda montar a escala primeiro.
            <Link
              to={`/chamadas/${chamadaBase.id}`}
              className="rounded-lg bg-ml-amarelo px-4 py-2 text-sm font-bold text-slate-900 hover:opacity-90"
            >
              📋 Fazer escala ({formatarData(chamadaBase.data)}) →
            </Link>
          )}
          {escalaDaChamada && candidatosChamada.length > 0 && semMotorista > 0 && (
            <Button variante="ml" onClick={direcionarAutomatico}>
              ⚡ Direcionar escalados ({candidatosChamada.length})
            </Button>
          )}
          {db.rotas.some((r) => r.motoristaId && !r.finalizadaEm) && (
            <Button variante="secundario" onClick={encerrarRotasDoDia}>
              🏁 Encerrar rotas ({db.rotas.filter((r) => r.motoristaId && !r.finalizadaEm).length})
            </Button>
          )}
          {db.rotas.some((r) => r.motoristaId) && (
            <Button variante="secundario" onClick={limparDirecionamentos}>🧹 Limpar</Button>
          )}
          {db.rotas.length > 0 && (
            <Button variante="secundario" onClick={apagarTodasAsRotas}>🗑️ Apagar todas</Button>
          )}
          <Button variante="secundario" onClick={() => exportarCSV(tabela())}>⬇️ CSV</Button>
          <Button variante="secundario" onClick={() => exportarExcel(tabela())}>⬇️ Excel</Button>
          <Button variante="secundario" onClick={() => exportarPDF(tabela())}>🖨️ PDF</Button>
          <Button variante="secundario" onClick={novaRota}>➕ Nova rota</Button>
          <Button variante="ml" onClick={() => setModalImportar(true)}>📥 Importar planilha</Button>
        </div>
      </div>

      {avisoAuto && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {avisoAuto}
        </p>
      )}

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
                <th className="px-2 py-2.5">🚚 Motorista</th>
                <th className="px-2 py-2.5">Veículo</th>
                <th className="px-2 py-2.5 text-right">Km</th>
                <th className="px-2 py-2.5 text-center">DPS</th>
                <th className="px-2 py-2.5 text-right">Ocupação %</th>
                <th className="px-2 py-2.5">Transportadora</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rotas.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={CELULA}>{r.cidade}</td>
                  <td className={`${CELULA} font-bold text-slate-900`}>{r.rotaExpedicao}</td>
                  <td className={`${CELULA} bg-yellow-50`}>
                    <div className="flex items-center justify-between gap-1.5">
                      <span>{r.rotaOriginal}</span>
                      <button
                        onClick={() => duplicarRota(r)}
                        className="rounded-full border border-slate-300 bg-white px-1.5 py-0.5 font-bold text-slate-600 hover:border-ml-azul hover:text-ml-azul"
                        title="Adicionar outra rota igual nesta linha — para dividir os pacotes com um segundo motorista"
                      >
                        ＋
                      </button>
                    </div>
                  </td>
                  <td className={CELULA}>{r.base}</td>
                  <td className={CELULA}>
                    <div className="flex items-center gap-1">
                      <select
                        className={`${SELETOR} ${r.motoristaId ? '' : 'border-amber-300 bg-amber-50'}`}
                        value={r.motoristaId ?? ''}
                        onChange={(e) => salvarRota({ ...r, motoristaId: e.target.value || null, finalizadaEm: null, resultadoFinalizacao: null })}
                        title="Direcionar motorista para esta rota"
                      >
                        <option value="">— sem motorista —</option>
                        {motoristas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                      {r.motoristaId && r.finalizadaEm && (
                        <span
                          title={
                            r.resultadoFinalizacao === 'pendente'
                              ? `Encerrada pela coordenação com PENDÊNCIA às ${new Date(r.finalizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                              : `Entregue — finalizada pelo motorista às ${new Date(r.finalizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                          }
                        >
                          {r.resultadoFinalizacao === 'pendente' ? '⚠️' : '✅'}
                        </span>
                      )}
                      {r.motoristaId && !r.finalizadaEm && (
                        <button
                          onClick={() => finalizarPelaCoordenacao(r)}
                          className="rounded px-0.5 hover:bg-slate-200"
                          title="Encerrar pela coordenação (fica registrada como pendente)"
                        >
                          🏁
                        </button>
                      )}
                    </div>
                  </td>
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={arquivoRef} type="file" multiple accept=".csv,.txt,.tsv,.pdf,image/*" onChange={lerArquivo} className="hidden" />
          <Button variante="secundario" onClick={() => arquivoRef.current?.click()} disabled={!!lendoPdf}>
            {lendoPdf || (previa ? '📄 Enviar MAIS um arquivo (soma às linhas)' : '📄 Enviar CSV, PDF ou fotos')}
          </Button>
          {previa && (
            <>
              <span className="text-sm font-semibold text-slate-700">
                ✅ {previa.rotas.length} rota(s) reconhecida(s)
                {previa.ignoradas > 0 && ` • ${previa.ignoradas} linha(s) ignorada(s)`}
              </span>
              <button
                onClick={() => atualizarPrevia('')}
                className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                title="Descartar tudo o que foi lido e recomeçar"
              >
                🧹 Recomeçar
              </button>
            </>
          )}
        </div>
        {erroArquivo && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroArquivo}</p>
        )}
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
