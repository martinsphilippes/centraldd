import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  aplicarModeloResumo,
  importarProgramacao,
  removerProgramacaoItem,
  salvarParametrosAlocacao,
  salvarProgramacaoItem,
  useDB,
} from '../../core/db'
import {
  cidadesDoTexto,
  parsearModeloResumo,
  parsearPlanilhaMeli,
  type ModeloResumo,
  type ProgramacaoImportada,
} from '../../core/planilha'
import { extrairTextoDeImagem, extrairTextoTabularDePdf } from '../../core/pdf'
import {
  aderenciaHistorica,
  PARAMETROS_PADRAO,
  parametrosAtuais,
  sugerirAlocacao,
  type Sugestao,
} from '../../core/alocacao'
import { formatarData, hojeISO, rotuloDia } from '../../core/dates'
import type { ParametrosAlocacao, ProgramacaoItem } from '../../core/types'
import { ResumoDiaCard } from './ResumoDiaCard'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../../core/export'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, ProgressBar, SegmentedControl, Select, StatCard } from '../../components/ui'

/** Remove acentos e baixa a caixa para comparar nomes. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function ordemOnda(onda: string): number {
  const n = onda.match(/(\d)/)
  return n ? Number(n[1]) : 99
}

type Visao = 'dia' | 'rodizio'
type PeriodoRodizio = '7' | '30' | 'todos'

export function Programacao() {
  const db = useDB()
  const [visao, setVisao] = useState<Visao>('dia')
  const [periodoRodizio, setPeriodoRodizio] = useState<PeriodoRodizio>('30')
  const [modalImportar, setModalImportar] = useState(false)
  const [textoColado, setTextoColado] = useState('')
  const [previa, setPrevia] = useState<{ itens: ProgramacaoImportada[]; ignoradas: number } | null>(null)
  const [modeloDetectado, setModeloDetectado] = useState<ModeloResumo | null>(null)
  const [importando, setImportando] = useState(false)
  const [lendoPdf, setLendoPdf] = useState('')
  const [erroArquivo, setErroArquivo] = useState('')
  const [editando, setEditando] = useState<ProgramacaoItem | null>(null)
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [paramsEdit, setParamsEdit] = useState<ParametrosAlocacao | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const motoristas = db.motoristas
    .filter((m) => m.ativo && m.aprovado !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome))
  const porId = new Map(motoristas.map((m) => [m.id, m]))

  const datas = [...new Set(db.programacao.map((p) => p.data))].sort().reverse()
  const [dataSelecionada, setDataSelecionada] = useState<string>('')
  const dataAtiva = dataSelecionada || datas.find((d) => d >= hojeISO()) || datas[0] || hojeISO()

  const doDia = db.programacao
    .filter((p) => p.data === dataAtiva)
    .sort(
      (a, b) =>
        ordemOnda(a.onda) - ordemOnda(b.onda) ||
        a.rota.localeCompare(b.rota, 'pt-BR', { numeric: true }),
    )
  const alterados = doDia.filter((p) => p.driverFinal !== p.driverPlanejado)
  const semVinculo = doDia.filter((p) => !p.motoristaId)

  /** Vincula o nome da planilha a um motorista do cadastro (match único pelo 1º nome). */
  const vincular = (driver: string): string | null => {
    const alvo = normalizar(driver).split(' ')[0]
    if (!alvo) return null
    const candidatos = motoristas.filter((m) => {
      const nome = normalizar(m.nome)
      return nome.startsWith(normalizar(driver)) || nome.split(' ')[0] === alvo
    })
    return candidatos.length === 1 ? candidatos[0].id : null
  }

  const atualizarPrevia = (texto: string) => {
    setTextoColado(texto)
    const p = texto.trim() ? parsearPlanilhaMeli(texto) : null
    setPrevia(p)
    // Rede de proteção: se não há rotas mas o conteúdo parece o MODELO do
    // resumo do dia (pacotes/SPR/MM…), oferece preencher o card direto daqui.
    const alt = texto.trim() && (!p || p.itens.length === 0) ? parsearModeloResumo(texto) : null
    setModeloDetectado(alt && alt.camposDetectados >= 2 ? alt : null)
  }

  const preencherResumoDetectado = () => {
    if (!modeloDetectado) return
    const dia = modeloDetectado.data ?? dataAtiva
    aplicarModeloResumo(dia, modeloDetectado)
    if (modeloDetectado.data) setDataSelecionada(modeloDetectado.data)
    setModalImportar(false)
    setTextoColado('')
    setPrevia(null)
    setModeloDetectado(null)
    setVisao('dia')
  }

  const lerArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite reenviar o mesmo arquivo
    if (!arquivo) return
    setErroArquivo('')
    const nome = arquivo.name.toLowerCase()
    const ehPdf = nome.endsWith('.pdf')
    const ehImagem = arquivo.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|heic|heif)$/.test(nome)
    if (ehPdf || ehImagem) {
      setLendoPdf(ehPdf ? '⏳ Lendo PDF…' : '🔍 Lendo imagem…')
      void (async () => {
        try {
          const texto = ehPdf
            ? await extrairTextoTabularDePdf(await arquivo.arrayBuffer(), setLendoPdf)
            : await extrairTextoDeImagem(arquivo, setLendoPdf)
          atualizarPrevia(texto)
        } catch (err) {
          const detalhe = err instanceof Error ? err.message : String(err)
          setErroArquivo(`Não consegui ler esse arquivo (${detalhe}). Tente uma foto/PDF mais nítido, cole os dados ou use CSV.`)
        } finally {
          setLendoPdf('')
        }
      })()
      return
    }
    const leitor = new FileReader()
    leitor.onload = () => atualizarPrevia(String(leitor.result ?? ''))
    leitor.readAsText(arquivo)
  }

  const confirmarImportacao = async () => {
    if (!previa || previa.itens.length === 0) return
    setImportando(true)
    try {
      await importarProgramacao(previa.itens, vincular)
      setDataSelecionada(previa.itens[0].data)
      setModalImportar(false)
      setTextoColado('')
      setPrevia(null)
      setVisao('dia')
    } finally {
      setImportando(false)
    }
  }

  const definirMotorista = (p: ProgramacaoItem, motoristaId: string) => {
    if (!motoristaId) {
      // Restaura o plano original do Meli.
      salvarProgramacaoItem({ ...p, motoristaId: vincular(p.driverPlanejado), driverFinal: p.driverPlanejado })
      return
    }
    const m = porId.get(motoristaId)
    if (m) salvarProgramacaoItem({ ...p, motoristaId, driverFinal: m.nome })
  }

  const gerarSugestoes = () => {
    const s = sugerirAlocacao(db, dataAtiva, parametrosAtuais(db))
    setSugestoes(s)
    // Pré-seleciona as sugestões que mudam algo (e têm motorista elegível).
    setSelecionadas(new Set(s.filter((x) => x.motorista && x.motorista.id !== x.item.motoristaId).map((x) => x.item.id)))
  }

  const aplicarSugestoes = () => {
    if (!sugestoes) return
    for (const s of sugestoes) {
      if (s.motorista && selecionadas.has(s.item.id)) {
        salvarProgramacaoItem({ ...s.item, motoristaId: s.motorista.id, driverFinal: s.motorista.nome })
      }
    }
    setSugestoes(null)
  }

  /** Aplica automaticamente, sem revisão, as sugestões acima do % de confiança configurado. */
  const autoAlocar = () => {
    const limite = parametrosAtuais(db).autoAplicarAcimaDe
    if (!limite) {
      setParamsEdit({ ...parametrosAtuais(db) })
      return
    }
    const s = sugerirAlocacao(db, dataAtiva, parametrosAtuais(db))
    const aplicaveis = s.filter(
      (x) => x.motorista && x.confianca >= limite && x.motorista.id !== x.item.motoristaId,
    )
    if (aplicaveis.length === 0) {
      alert(`Nenhuma rota com confiança ≥ ${limite}% para alterar em ${rotoOuData()}.`)
      return
    }
    if (!confirm(`Aplicar automaticamente ${aplicaveis.length} rota(s) com confiança ≥ ${limite}%?\nAs demais continuam para revisão manual.`)) return
    for (const x of aplicaveis) {
      if (x.motorista) salvarProgramacaoItem({ ...x.item, motoristaId: x.motorista.id, driverFinal: x.motorista.nome })
    }
  }
  const rotoOuData = () => rotuloDia(dataAtiva)

  const tabelaDia = (): Tabela => ({
    titulo: `Programacao ${formatarData(dataAtiva)}`,
    colunas: ['Data', 'Driver (plano Meli)', 'Driver (definido)', 'Alterado?', 'Rota', 'Cidade', 'Veículo', 'Onda', 'Doca'],
    linhas: doDia.map((p) => [
      formatarData(p.data),
      p.driverPlanejado,
      p.driverFinal,
      p.driverFinal !== p.driverPlanejado ? 'SIM' : '',
      p.rota,
      p.cidade,
      p.veiculo,
      p.onda,
      p.doca,
    ]),
  })

  // ---- Rodízio: quantas vezes cada driver foi a cada cidade ----
  const rodizio = useMemo(() => {
    const dataMinima =
      periodoRodizio === 'todos' ? '0000-01-01' : hojeISO(-(Number(periodoRodizio) - 1))
    const itens = db.programacao.filter((p) => p.data >= dataMinima)
    const drivers = new Map<string, { nome: string; motoristaId: string | null; porCidade: Map<string, number>; total: number }>()
    const cidades = new Map<string, number>()
    for (const p of itens) {
      const chave = normalizar(p.driverFinal)
      if (!chave) continue
      const d = drivers.get(chave) ?? { nome: p.driverFinal, motoristaId: p.motoristaId, porCidade: new Map(), total: 0 }
      if (p.motoristaId) d.motoristaId = p.motoristaId
      for (const cidade of cidadesDoTexto(p.cidade)) {
        const c = cidade.toUpperCase()
        d.porCidade.set(c, (d.porCidade.get(c) ?? 0) + 1)
        d.total++
        cidades.set(c, (cidades.get(c) ?? 0) + 1)
      }
      drivers.set(chave, d)
    }
    const listaCidades = [...cidades.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
    const listaDrivers = [...drivers.values()].sort((a, b) => b.total - a.total)
    // Aderência: sugestão automática × decisão final do dispatcher, no mesmo período.
    const aderencia = aderenciaHistorica(db, parametrosAtuais(db), dataMinima)
    return { listaCidades, listaDrivers, aderencia }
  }, [db, periodoRodizio])

  const pctAderencia = (motoristaId: string | null) => {
    if (!motoristaId) return null
    const a = rodizio.aderencia.get(motoristaId)
    return a && a.total > 0 ? a : null
  }

  // Aderência geral da frota: soma de acertos / soma de rotas avaliadas.
  const aderenciaGeral = useMemo(() => {
    let acertos = 0
    let total = 0
    for (const a of rodizio.aderencia.values()) {
      acertos += a.acertos
      total += a.total
    }
    return { acertos, total, taxa: total ? acertos / total : 0 }
  }, [rodizio])

  const tabelaRodizio = (): Tabela => ({
    titulo: `Rodizio motorista x cidade (${periodoRodizio === 'todos' ? 'todo o histórico' : `últimos ${periodoRodizio} dias`})`,
    colunas: ['Driver', 'Total', 'Aderência à sugestão', ...rodizio.listaCidades],
    linhas: rodizio.listaDrivers.map((d) => {
      const a = pctAderencia(d.motoristaId)
      return [
        d.nome,
        d.total,
        a ? `${Math.round(a.taxa * 100)}% (${a.acertos}/${a.total})` : '—',
        ...rodizio.listaCidades.map((c) => d.porCidade.get(c) ?? 0),
      ]
    }),
  })

  const corCalor = (v: number, max: number) => {
    if (v === 0) return ''
    const forca = Math.min(1, v / Math.max(1, max))
    if (forca > 0.66) return 'bg-ml-azul text-white font-bold'
    if (forca > 0.33) return 'bg-blue-200 text-slate-800 font-semibold'
    return 'bg-blue-50 text-slate-700'
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">📆 Programação do dia</h1>
          <p className="text-sm text-slate-500">
            O plano do Meli + os ajustes do dispatcher — cada troca fica registrada e vira histórico.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            opcoes={[
              { valor: 'dia', rotulo: '📋 Dia' },
              { valor: 'rodizio', rotulo: '🔄 Rodízio' },
            ]}
            valor={visao}
            onChange={setVisao}
          />
          <Button variante="secundario" onClick={() => setParamsEdit({ ...parametrosAtuais(db) })}>
            ⚙️ Parâmetros
          </Button>
          <Button variante="ml" onClick={() => setModalImportar(true)}>
            📥 Importar planilha Meli
          </Button>
        </div>
      </div>

      {visao === 'dia' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Dia:</span>
            {datas.length > 0 && (
              <Select value={datas.includes(dataAtiva) ? dataAtiva : ''} onChange={(e) => setDataSelecionada(e.target.value)} style={{ width: 'auto' }}>
                {!datas.includes(dataAtiva) && <option value="">{rotuloDia(dataAtiva)}</option>}
                {datas.map((d) => (
                  <option key={d} value={d}>
                    {rotuloDia(d)}
                  </option>
                ))}
              </Select>
            )}
            <input
              type="date"
              value={dataAtiva}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-ml-azul"
              title="Escolher qualquer data"
            />
          </div>

          <ResumoDiaCard data={dataAtiva} />

          {db.programacao.length === 0 ? (
            <EmptyState
              icone="📆"
              titulo="Nenhuma programação importada"
              descricao="Cole a planilha diária do Meli em “Importar planilha Meli” para preencher a alocação por rota."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Rotas do dia:</span>
                <div className="ml-auto flex flex-wrap gap-2">
                <Button variante="secundario" onClick={() => exportarCSV(tabelaDia())}>⬇️ CSV</Button>
                <Button variante="secundario" onClick={() => exportarExcel(tabelaDia())}>⬇️ Excel</Button>
                <Button variante="secundario" onClick={() => exportarPDF(tabelaDia(), rotuloDia(dataAtiva))}>🖨️ PDF</Button>
                <Button variante="primario" onClick={gerarSugestoes} disabled={doDia.length === 0}>
                  🤖 Sugerir alocação
                </Button>
                <Button variante="ml" onClick={autoAlocar} disabled={doDia.length === 0} title="Aplica sozinho as sugestões acima do % de confiança configurado">
                  ⚡ Auto-alocar
                  {parametrosAtuais(db).autoAplicarAcimaDe > 0 && ` ≥${parametrosAtuais(db).autoAplicarAcimaDe}%`}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StatCard icone="🛣️" valor={doDia.length} rotulo="Rotas no dia" />
              <StatCard icone="🔁" valor={alterados.length} rotulo="Trocas do dispatcher" destaque={alterados.length > 0} />
              <StatCard icone="❓" valor={semVinculo.length} rotulo="Sem vínculo com cadastro" />
            </div>

            <Card className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2.5">Onda</th>
                    <th className="px-2 py-2.5">Rota</th>
                    <th className="px-2 py-2.5">🚚 Driver (definido)</th>
                    <th className="px-2 py-2.5">Plano Meli</th>
                    <th className="px-2 py-2.5">Cidade</th>
                    <th className="px-2 py-2.5">Veículo</th>
                    <th className="px-2 py-2.5 text-center">Doca</th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {doDia.map((p) => {
                    const alterado = p.driverFinal !== p.driverPlanejado
                    return (
                      <tr key={p.id} className={`border-b border-slate-100 ${alterado ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                        <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-600">{p.onda || '—'}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-bold text-slate-900">{p.rota}</td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <select
                            className={`rounded-lg border px-1.5 py-1 text-xs outline-none focus:border-ml-azul ${
                              p.motoristaId ? 'border-slate-300 bg-white' : 'border-amber-300 bg-amber-50'
                            }`}
                            value={p.motoristaId ?? ''}
                            onChange={(e) => definirMotorista(p, e.target.value)}
                            title="Definir o motorista desta rota"
                          >
                            <option value="">{p.motoristaId ? '↩️ restaurar plano Meli' : `✍️ ${p.driverFinal} (planilha)`}</option>
                            {motoristas.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nome}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                          {alterado ? (
                            <Badge className="border-amber-300 bg-amber-100 text-amber-800">🔁 era {p.driverPlanejado}</Badge>
                          ) : (
                            p.driverPlanejado
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-700">{p.cidade}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-700">{p.veiculo}</td>
                        <td className="px-2 py-2 text-center text-slate-700">{p.doca}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <button onClick={() => setEditando(p)} className="rounded-lg px-1.5 py-1 hover:bg-slate-200" title="Editar">
                            ✏️
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Excluir a rota ${p.rota} deste dia?`)) removerProgramacaoItem(p.id)
                            }}
                            className="rounded-lg px-1.5 py-1 text-red-600 hover:bg-red-50"
                            title="Excluir"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
            </>
          )}
        </>
      ) : (
        // ---- Visão de rodízio ----
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              opcoes={[
                { valor: '7', rotulo: '7 dias' },
                { valor: '30', rotulo: '30 dias' },
                { valor: 'todos', rotulo: 'Tudo' },
              ]}
              valor={periodoRodizio}
              onChange={setPeriodoRodizio}
            />
            <div className="flex gap-2">
              <Button variante="secundario" onClick={() => exportarCSV(tabelaRodizio())}>⬇️ CSV</Button>
              <Button variante="secundario" onClick={() => exportarExcel(tabelaRodizio())}>⬇️ Excel</Button>
            </div>
          </div>
          {aderenciaGeral.total > 0 && (
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🤖</span>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-3xl font-bold ${
                          aderenciaGeral.taxa >= 0.7
                            ? 'text-emerald-600'
                            : aderenciaGeral.taxa >= 0.4
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {Math.round(aderenciaGeral.taxa * 100)}%
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {aderenciaGeral.acertos} de {aderenciaGeral.total} rotas avaliadas
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Aderência média da frota</p>
                  </div>
                </div>
                <div className="min-w-40 flex-1">
                  <ProgressBar
                    valor={aderenciaGeral.acertos}
                    total={aderenciaGeral.total}
                    cor={
                      aderenciaGeral.taxa >= 0.7
                        ? 'bg-emerald-500'
                        : aderenciaGeral.taxa >= 0.4
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    }
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    {aderenciaGeral.taxa >= 0.7
                      ? '✅ A sugestão automática já acompanha bem as decisões do dispatcher — dá para confiar e revisar só as exceções.'
                      : aderenciaGeral.taxa >= 0.4
                        ? '🟡 A automação está no caminho. Ajuste os ⚙️ Parâmetros e as cidades preferidas/bloqueadas para subir a aderência.'
                        : '🔴 Ainda há muito conhecimento seu fora dos parâmetros. Calibre os pesos e restrições para o sistema aprender suas regras.'}
                  </p>
                </div>
              </div>
            </Card>
          )}
          {rodizio.listaDrivers.length === 0 ? (
            <EmptyState icone="🔄" titulo="Sem dados no período" descricao="Importe programações diárias para medir o rodízio." />
          ) : (
            <Card className="overflow-x-auto">
              <p className="px-3 pt-3 text-xs text-slate-500">
                Quantas vezes cada driver foi a cada cidade — quanto mais escuro, mais repetido. Use para planejar o rodízio.
                A <strong>Aderência</strong> mostra o quanto a sugestão automática já bate com as decisões finais do dispatcher.
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                    <th className="sticky left-0 bg-white px-2 py-2.5">Driver</th>
                    <th className="px-2 py-2.5 text-center">Total</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-center" title="Quantas vezes a sugestão do sistema bateu com a decisão final">
                      🤖 Aderência
                    </th>
                    {rodizio.listaCidades.map((c) => (
                      <th key={c} className="whitespace-nowrap px-2 py-2.5 text-center">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rodizio.listaDrivers.map((d) => {
                    const max = Math.max(...rodizio.listaCidades.map((c) => d.porCidade.get(c) ?? 0), 1)
                    const ader = pctAderencia(d.motoristaId)
                    const pct = ader ? Math.round(ader.taxa * 100) : null
                    const corAder =
                      pct === null
                        ? 'text-slate-400'
                        : pct >= 70
                          ? 'bg-emerald-100 text-emerald-800 font-bold'
                          : pct >= 40
                            ? 'bg-amber-100 text-amber-800 font-semibold'
                            : 'bg-red-100 text-red-700 font-semibold'
                    return (
                      <tr key={d.nome} className="border-b border-slate-100">
                        <td className="sticky left-0 whitespace-nowrap bg-white px-2 py-1.5 font-semibold text-slate-800">
                          {d.motoristaId ? (
                            <Link to={`/motoristas/${d.motoristaId}`} className="hover:text-ml-azul">
                              {d.nome}
                            </Link>
                          ) : (
                            d.nome
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center font-bold text-slate-900">{d.total}</td>
                        <td className={`whitespace-nowrap px-2 py-1.5 text-center ${corAder}`} title={ader ? `${ader.acertos} de ${ader.total} rotas` : 'sem vínculo com cadastro'}>
                          {pct === null ? '—' : `${pct}%`}
                        </td>
                        {rodizio.listaCidades.map((c) => {
                          const v = d.porCidade.get(c) ?? 0
                          return (
                            <td key={c} className={`px-2 py-1.5 text-center ${corCalor(v, max)}`}>
                              {v || ''}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* Importação da planilha Meli */}
      <Modal aberto={modalImportar} titulo="📥 Importar planilha do Meli" onFechar={() => setModalImportar(false)}>
        <p className="mb-2 text-sm text-slate-600">
          Cole as linhas da planilha diária (Ctrl+C no Excel → Ctrl+V abaixo) ou envie o CSV. Ordem:
        </p>
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
          DATA • DRIVER • ROTA • CIDADE • VEÍCULO • ONDAS • DOCA
        </p>
        <textarea
          className="h-40 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-ml-azul"
          placeholder={'13/08/2026\tAdalberto\tVL9\tSÃO SIMÃO/SANTA VITORIA\tVUC\t1ª ONDA\t1\n…'}
          value={textoColado}
          onChange={(e) => atualizarPrevia(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={arquivoRef} type="file" accept=".csv,.txt,.tsv,.pdf,image/*" onChange={lerArquivo} className="hidden" />
          <Button variante="secundario" onClick={() => arquivoRef.current?.click()} disabled={!!lendoPdf}>
            {lendoPdf || '📄 Enviar CSV, PDF ou foto'}
          </Button>
          {previa && (
            <span className="text-sm font-semibold text-slate-700">
              ✅ {previa.itens.length} rota(s)
              {previa.ignoradas > 0 && ` • ${previa.ignoradas} linha(s) ignorada(s)`}
            </span>
          )}
        </div>
        {erroArquivo && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroArquivo}</p>
        )}
        {modeloDetectado && (
          <div className="mt-3 rounded-lg border border-ml-amarelo bg-yellow-50 p-3">
            <p className="text-sm font-bold text-slate-800">
              🧠 Isso não é a planilha de rotas — parece o <u>MODELO do resumo do dia</u>!
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Reconheci:{' '}
              {[
                modeloDetectado.base && `base ${modeloDetectado.base}`,
                modeloDetectado.pacotes && `${modeloDetectado.pacotes} pacotes`,
                modeloDetectado.sprReferencia && `SPR ${modeloDetectado.sprReferencia}`,
                modeloDetectado.veiculosDiv && `${modeloDetectado.veiculosDiv} veículos DIV`,
                modeloDetectado.transportadoras.length > 0 && `${modeloDetectado.transportadoras.length} transportadora(s)`,
                modeloDetectado.mm.length > 0 && `MM com ${modeloDetectado.mm.length} linha(s)`,
                modeloDetectado.data && `data ${formatarData(modeloDetectado.data)}`,
              ]
                .filter(Boolean)
                .join(' • ')}
            </p>
            <Button variante="ml" className="mt-2" onClick={preencherResumoDetectado}>
              📋 Preencher o Resumo do Dia com isso
            </Button>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          💡 Linhas de seção (UTILITARIO, DUPLAS) são puladas sozinhas. Os drivers são vinculados
          automaticamente ao cadastro pelo nome. Reimportar o mesmo dia atualiza o plano sem apagar
          os ajustes que você já fez.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setModalImportar(false)}>
            Cancelar
          </Button>
          <Button variante="ml" onClick={() => void confirmarImportacao()} disabled={!previa || previa.itens.length === 0 || importando}>
            {importando ? 'Importando…' : `📥 Importar ${previa?.itens.length ?? 0} rota(s)`}
          </Button>
        </div>
      </Modal>

      {/* Sugestão automática de alocação */}
      <Modal aberto={!!sugestoes} titulo={`🤖 Sugestão de alocação — ${rotuloDia(dataAtiva)}`} onFechar={() => setSugestoes(null)}>
        <p className="mb-2 text-sm text-slate-600">
          Calculada pelo histórico + seus parâmetros (⚙️). Marque o que aplicar — nada muda sem a sua confirmação.
        </p>
        {(() => {
          const limite = parametrosAtuais(db).autoAplicarAcimaDe
          return limite > 0 ? (
            <button
              onClick={() =>
                setSelecionadas(
                  new Set(
                    (sugestoes ?? [])
                      .filter((s) => s.motorista && s.confianca >= limite && s.motorista.id !== s.item.motoristaId)
                      .map((s) => s.item.id),
                  ),
                )
              }
              className="mb-3 rounded-lg border border-dashed border-ml-azul px-3 py-1.5 text-xs font-semibold text-ml-azul hover:bg-blue-50"
            >
              ⚡ Marcar só as com confiança ≥ {limite}%
            </button>
          ) : null
        })()}
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {sugestoes?.map((s) => {
            const mudanca = s.motorista && s.motorista.id !== s.item.motoristaId
            const marcada = selecionadas.has(s.item.id)
            return (
              <li key={s.item.id}>
                <button
                  disabled={!s.motorista}
                  onClick={() => {
                    const novo = new Set(selecionadas)
                    if (marcada) novo.delete(s.item.id)
                    else novo.add(s.item.id)
                    setSelecionadas(novo)
                  }}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    !s.motorista
                      ? 'border-red-200 bg-red-50'
                      : marcada
                        ? 'border-ml-azul bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {s.motorista && <span className="text-base">{marcada ? '☑️' : '⬜'}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">
                        <strong>{s.item.rota}</strong> <span className="text-slate-500">({s.item.cidade})</span>
                      </span>
                      <span className="block text-sm font-semibold text-slate-800">
                        {s.motorista ? (
                          <>
                            → {s.motorista.nome}
                            {mudanca && <span className="font-normal text-slate-500"> (hoje: {s.item.driverFinal})</span>}
                            {!mudanca && <span className="font-normal text-emerald-600"> ✓ mantém</span>}
                          </>
                        ) : (
                          <span className="text-red-600">sem candidato elegível</span>
                        )}
                      </span>
                    </span>
                    {s.motorista && (
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <Badge
                          className={
                            s.confianca >= 70
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                              : s.confianca >= 40
                                ? 'border-amber-200 bg-amber-100 text-amber-800'
                                : 'border-red-200 bg-red-100 text-red-700'
                          }
                        >
                          {s.confianca}% confiança
                        </Badge>
                        <span className="text-[10px] text-slate-400">{s.pontos} pts</span>
                      </span>
                    )}
                  </div>
                  {(s.motivos.length > 0 || s.alertas.length > 0) && (
                    <p className="mt-1 flex flex-wrap gap-1 pl-7 text-[11px]">
                      {s.motivos.map((m, i) => (
                        <span key={i} className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{m}</span>
                      ))}
                      {s.alertas.map((a, i) => (
                        <span key={i} className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{a}</span>
                      ))}
                    </p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setSugestoes(null)}>
            Cancelar
          </Button>
          <Button variante="ml" onClick={aplicarSugestoes} disabled={selecionadas.size === 0}>
            ✅ Aplicar {selecionadas.size} sugestão(ões)
          </Button>
        </div>
      </Modal>

      {/* Parametrização da sugestão automática */}
      <Modal aberto={!!paramsEdit} titulo="⚙️ Parâmetros da alocação automática" onFechar={() => setParamsEdit(null)}>
        {paramsEdit && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Pesos de 0 a 10 — quanto maior, mais o critério influencia. Zero desliga o critério.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="🏙️ Experiência na cidade">
                <Input type="number" min={0} max={10} value={paramsEdit.pesoExperienciaCidade}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, pesoExperienciaCidade: Number(e.target.value) })} />
              </Field>
              <Field label="🛣️ Experiência na rota">
                <Input type="number" min={0} max={10} value={paramsEdit.pesoExperienciaRota}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, pesoExperienciaRota: Number(e.target.value) })} />
              </Field>
              <Field label="📋 Respeitar plano Meli">
                <Input type="number" min={0} max={10} value={paramsEdit.pesoRespeitarPlanoMeli}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, pesoRespeitarPlanoMeli: Number(e.target.value) })} />
              </Field>
              <Field label="⭐ Cidades preferidas">
                <Input type="number" min={0} max={10} value={paramsEdit.pesoCidadesPreferidas}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, pesoCidadesPreferidas: Number(e.target.value) })} />
              </Field>
              <Field label="🔁 Força do rodízio (penalidade)">
                <Input type="number" min={0} max={10} value={paramsEdit.pesoRodizio}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, pesoRodizio: Number(e.target.value) })} />
              </Field>
              <Field label="🔁 Janela do rodízio (dias)">
                <Input type="number" min={1} max={60} value={paramsEdit.janelaRodizioDias}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, janelaRodizioDias: Number(e.target.value) })} />
              </Field>
              <Field label="✅ Bônus disponível na agenda">
                <Input type="number" min={0} max={10} value={paramsEdit.bonusDisponivelAgenda}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, bonusDisponivelAgenda: Number(e.target.value) })} />
              </Field>
              <Field label="📆 Janela do histórico (dias, 0=tudo)">
                <Input type="number" min={0} max={365} value={paramsEdit.janelaHistoricoDias}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, janelaHistoricoDias: Number(e.target.value) })} />
              </Field>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Travas (excluem o motorista)</p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={paramsEdit.exigirDisponibilidadeAgenda}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, exigirDisponibilidadeAgenda: e.target.checked })} />
                Só sugerir quem marcou <strong>disponível</strong> na agenda do dia
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={paramsEdit.exigirVeiculoCompativel}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, exigirVeiculoCompativel: e.target.checked })} />
                Exigir <strong>veículo compatível</strong> (equivalências abaixo)
              </label>
              <Field label="🚫 Trava de sequência: excluir quem já foi N vezes à mesma cidade no histórico recente (0 = desligada)">
                <Input type="number" min={0} max={30} value={paramsEdit.maxVezesSeguidasMesmaCidade}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, maxVezesSeguidasMesmaCidade: Number(e.target.value) })} />
              </Field>
              <Field label="📌 Máximo de dias futuros que o motorista pode deixar agendados na agenda (0 = sem limite)">
                <Input type="number" min={0} max={14} value={paramsEdit.maxDiasAgendados}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, maxDiasAgendados: Number(e.target.value) })} />
              </Field>
              <p className="text-[11px] text-slate-500">
                📌 Com o limite em 2: o motorista agenda até 2 dias; quando trabalha um (a data passa),
                libera vaga para agendar o próximo — reduz o risco de escala furada.
                <br />💡 Motorista que marcou <strong>indisponível/folga/atestado/férias</strong> no dia nunca é sugerido.
                Cidades bloqueadas/preferidas de cada um ficam no cadastro do motorista.
              </p>
            </div>

            <Field label="🚐 Equivalências de veículo (uma por linha: veículo da rota = veículos do cadastro)">
              <textarea
                className="h-20 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs outline-none focus:border-ml-azul"
                value={paramsEdit.equivalenciasVeiculo}
                onChange={(e) => setParamsEdit({ ...paramsEdit, equivalenciasVeiculo: e.target.value })}
              />
            </Field>

            <div className="rounded-lg border border-ml-amarelo bg-yellow-50 p-3">
              <Field label="⚡ Auto-alocação: aplicar sozinho as sugestões com confiança ≥ (%) — 0 desliga">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={paramsEdit.autoAplicarAcimaDe}
                  onChange={(e) => setParamsEdit({ ...paramsEdit, autoAplicarAcimaDe: Number(e.target.value) })}
                />
              </Field>
              <p className="mt-1.5 text-[11px] text-slate-600">
                Com isso ativo, o botão <strong>⚡ Auto-alocar</strong> aplica de uma vez as rotas em que o sistema tem
                alta confiança, deixando só as duvidosas para você revisar. Comece alto (ex.: 85%) e vá baixando
                conforme a aderência da frota sobe.
              </p>
            </div>

            <div className="flex justify-between gap-2">
              <Button variante="fantasma" onClick={() => setParamsEdit({ ...PARAMETROS_PADRAO })}>
                ↩️ Restaurar padrão
              </Button>
              <div className="flex gap-2">
                <Button variante="secundario" onClick={() => setParamsEdit(null)}>
                  Cancelar
                </Button>
                <Button
                  variante="ml"
                  onClick={() => {
                    salvarParametrosAlocacao(paramsEdit)
                    setParamsEdit(null)
                  }}
                >
                  💾 Salvar parâmetros
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Edição completa de um item */}
      <Modal aberto={!!editando} titulo={editando ? `✏️ ${editando.rota} — ${rotuloDia(editando.data)}` : ''} onFechar={() => setEditando(null)}>
        {editando && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rota">
                <Input value={editando.rota} onChange={(e) => setEditando({ ...editando, rota: e.target.value })} />
              </Field>
              <Field label="Veículo">
                <Input value={editando.veiculo} onChange={(e) => setEditando({ ...editando, veiculo: e.target.value })} />
              </Field>
            </div>
            <Field label="Cidade / observações (+ AJUDA, + VD7…)">
              <Input value={editando.cidade} onChange={(e) => setEditando({ ...editando, cidade: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Onda">
                <Input value={editando.onda} onChange={(e) => setEditando({ ...editando, onda: e.target.value })} />
              </Field>
              <Field label="Doca">
                <Input value={editando.doca} onChange={(e) => setEditando({ ...editando, doca: e.target.value })} />
              </Field>
            </div>
            <Field label="Driver definido (texto livre — para quem não está no cadastro)">
              <Input
                value={editando.driverFinal}
                onChange={(e) => setEditando({ ...editando, driverFinal: e.target.value, motoristaId: null })}
              />
            </Field>
            <p className="text-xs text-slate-500">Plano Meli: <strong>{editando.driverPlanejado}</strong></p>
            <div className="flex justify-end gap-2">
              <Button variante="secundario" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button
                variante="ml"
                onClick={() => {
                  salvarProgramacaoItem(editando)
                  setEditando(null)
                }}
              >
                💾 Salvar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
