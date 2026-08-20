import { useRef, useState, type ChangeEvent } from 'react'
import { aplicarModeloResumo, registrarDiagnosticoOcr, salvarResumoDia, useDB } from '../../core/db'
import { formatarData } from '../../core/dates'
import { parsearModeloResumo, type ModeloResumo } from '../../core/planilha'
import { extrairTextoDeImagem, extrairTextoTabularDePdf, obterUltimaMiniaturaOcr } from '../../core/pdf'
import type { ResumoDia } from '../../core/types'
import { Button, Card, Input, Modal } from '../../components/ui'

const MM_PADRAO = [
  { tipo: '3/4', quantidade: '', posicoesPorUnidade: '8' },
  { tipo: 'TOCO', quantidade: '', posicoesPorUnidade: '12' },
  { tipo: 'TRUCK', quantidade: '', posicoesPorUnidade: '16' },
  { tipo: 'CARRETA', quantidade: '', posicoesPorUnidade: '28' },
]

function novoResumo(data: string, base: string): ResumoDia {
  return {
    id: data,
    data,
    base: base || 'BASE - CIDADE',
    sprReferencia: '',
    pacotes: '',
    veiculosDiv: '',
    amAutomatico: true,
    transportadoras: [{ nome: 'RODACOOP', utilitarios: '', vuc: '' }],
    mm: MM_PADRAO.map((m) => ({ ...m })),
    atualizadoEm: '',
  }
}

const num = (s: string) => Number(String(s).replace(/\D/g, '')) || 0

function normVeic(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

/** Conta os veículos da programação do dia por tipo (base do AM automático). */
function contarVeiculos(prog: { veiculo: string }[]) {
  let utilitarios = 0
  let vuc = 0
  const outros = new Map<string, number>()
  for (const p of prog) {
    const v = normVeic(p.veiculo)
    if (v.includes('UTIL')) utilitarios++
    else if (v.includes('VUC')) vuc++
    else {
      const nome = p.veiculo.trim() || 'Outros'
      outros.set(nome, (outros.get(nome) ?? 0) + 1)
    }
  }
  return { utilitarios, vuc, outros: [...outros.entries()], total: prog.length }
}

/** Código-base da rota (antes do sufixo _AM1/_PM1) para cruzar as duas planilhas. */
function chaveRota(s: string): string {
  return (s || '').trim().toUpperCase().split(/[_\s/]+/)[0]
}

/**
 * Cruza a programação do Meli (rota + veículo) com a planilha de Rotas
 * (rota → transportadora) para agrupar Utilitários/VUC por transportadora.
 */
function resumoPorTransportadora(
  prog: { rota: string; veiculo: string }[],
  rotas: { rotaExpedicao: string; rotaOriginal: string; transportadora: string }[],
) {
  const transpDe = new Map<string, string>()
  for (const r of rotas) {
    const t = r.transportadora.trim()
    if (!t) continue
    for (const k of [chaveRota(r.rotaExpedicao), chaveRota(r.rotaOriginal)]) {
      if (k && !transpDe.has(k)) transpDe.set(k, t)
    }
  }
  const grupos = new Map<string, { util: number; vuc: number }>()
  const outros = new Map<string, number>()
  let comTransp = 0
  for (const p of prog) {
    const v = normVeic(p.veiculo)
    if (!v.includes('UTIL') && !v.includes('VUC')) {
      const n = p.veiculo.trim() || 'Outros'
      outros.set(n, (outros.get(n) ?? 0) + 1)
      continue
    }
    const t = transpDe.get(chaveRota(p.rota)) ?? ''
    if (t) comTransp++
    const nome = t || 'Sem transportadora'
    const g = grupos.get(nome) ?? { util: 0, vuc: 0 }
    if (v.includes('UTIL')) g.util++
    else g.vuc++
    grupos.set(nome, g)
  }
  const ordenados = [...grupos.entries()].sort((a, b) => {
    if (a[0] === 'Sem transportadora') return 1
    if (b[0] === 'Sem transportadora') return -1
    return b[1].util + b[1].vuc - (a[1].util + a[1].vuc)
  })
  return { grupos: ordenados, outros: [...outros.entries()], comTransp, total: prog.length }
}

export function ResumoDiaCard({
  data,
  aoMudarDia,
}: {
  data: string
  /** Chamado quando um modelo importado pertence a outra data (o card salta para ela). */
  aoMudarDia?: (novaData: string) => void
}) {
  const db = useDB()
  const [editando, setEditando] = useState(false)
  const existente = db.resumos.find((r) => r.id === data)

  // Importação do modelo (colar / CSV / PDF / foto)
  const [modalModelo, setModalModelo] = useState(false)
  const [textoModelo, setTextoModelo] = useState('')
  const [previaModelo, setPreviaModelo] = useState<ModeloResumo | null>(null)
  const [lendoModelo, setLendoModelo] = useState('')
  const [erroModelo, setErroModelo] = useState('')
  const [avisoAplicado, setAvisoAplicado] = useState('')
  const arquivoModeloRef = useRef<HTMLInputElement>(null)

  // Base sugerida a partir da programação (primeira que aparecer) — só como padrão.
  const [rascunho, setRascunho] = useState<ResumoDia>(() => existente ?? novoResumo(data, ''))

  // Sincroniza o rascunho quando muda o dia ou chega dado do servidor.
  const chaveAtual = existente?.atualizadoEm ?? ''
  const [ultimaChave, setUltimaChave] = useState(chaveAtual + data)
  if (ultimaChave !== chaveAtual + data && !editando) {
    setRascunho(existente ?? novoResumo(data, ''))
    setUltimaChave(chaveAtual + data)
  }

  const r = editando ? rascunho : existente ?? novoResumo(data, '')

  // Programação importada do dia → base do AM automático.
  const progDoDia = db.programacao.filter((p) => p.data === data)
  const rotasProg = progDoDia.length
  const cont = contarVeiculos(progDoDia)
  const auto = r.amAutomatico !== false && rotasProg > 0

  // Cruza com a planilha de Rotas para agrupar por transportadora (quando possível).
  const amT = resumoPorTransportadora(progDoDia, db.rotas)
  const usarTransp = auto && amT.comTransp > 0

  // Linhas AM: por transportadora (cruzando as planilhas), por veículo (só Meli), ou manual.
  const linhasAM = usarTransp
    ? amT.grupos.map(([nome, g]) => ({ nome, utilitarios: String(g.util), vuc: g.vuc ? String(g.vuc) : '' }))
    : auto
      ? [{ nome: 'Programação (Meli)', utilitarios: String(cont.utilitarios), vuc: cont.vuc ? String(cont.vuc) : '' }]
      : r.transportadoras
  const outrosAM = usarTransp ? amT.outros : auto ? cont.outros : []

  const totalUtil = auto ? cont.utilitarios : r.transportadoras.reduce((s, t) => s + num(t.utilitarios), 0)
  const totalVuc = auto ? cont.vuc : r.transportadoras.reduce((s, t) => s + num(t.vuc), 0)
  const totalRotas = auto
    ? cont.total
    : r.transportadoras.reduce((s, t) => s + num(t.utilitarios) + num(t.vuc), 0)
  const totalPosicoes = r.mm.reduce((s, m) => s + num(m.quantidade) * num(m.posicoesPorUnidade), 0)

  const salvar = () => {
    salvarResumoDia(rascunho)
    setEditando(false)
    setAvisoAplicado('')
  }

  // ---------- Importação do modelo ----------
  const atualizarPreviaModelo = (texto: string) => {
    setTextoModelo(texto)
    setPreviaModelo(texto.trim() ? parsearModeloResumo(texto) : null)
  }

  const lerArquivoModelo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setErroModelo('')
    const nome = arquivo.name.toLowerCase()
    const ehPdf = nome.endsWith('.pdf')
    const ehImagem = arquivo.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|heic|heif)$/.test(nome)
    // Arquivo enviado: se a leitura reconhecer o modelo, PREENCHE SOZINHO —
    // sem depender de mais nenhum toque (o modal fecha e o card confirma).
    const aplicarDireto = (texto: string) => {
      const modelo = parsearModeloResumo(texto)
      registrarDiagnosticoOcr('resumo-modelo', texto, {
        arquivo: arquivo.name,
        camposDetectados: modelo.camposDetectados,
        miniatura: obterUltimaMiniaturaOcr().slice(0, 700000),
      })
      if (modelo.camposDetectados > 0) {
        // A data escrita NO MODELO manda: o card daquele dia é preenchido
        // e a tela salta para ele.
        const dia = modelo.data ?? data
        const salvo = aplicarModeloResumo(dia, modelo)
        if (dia !== data) aoMudarDia?.(dia)
        setModalModelo(false)
        setTextoModelo('')
        setPreviaModelo(null)
        // O que a foto não entregou abre direto para completar — sem caçar campo.
        const faltando: string[] = []
        if (!salvo.sprReferencia) faltando.push('SPR de referência')
        if (!salvo.veiculosDiv) faltando.push('Veículos DIV')
        if (!salvo.transportadoras.some((t) => num(t.utilitarios) > 0 || num(t.vuc) > 0))
          faltando.push('Utilitários/VUC')
        if (!salvo.mm.some((mLinha) => num(mLinha.quantidade) > 0)) faltando.push('quantidades do MM')
        if (faltando.length > 0) {
          setRascunho(salvo)
          setEditando(true)
          setAvisoAplicado(
            `⚠️ Preenchi o que a foto permitiu (${modelo.camposDetectados} campo(s)). Complete: ${faltando.join(', ')} — e toque em Salvar.`,
          )
        } else {
          setAvisoAplicado(
            `✅ Card de ${formatarData(dia)} preenchido automaticamente (${modelo.camposDetectados} campo(s) reconhecido(s)). Confira e ajuste no ✏️ Editar se precisar.`,
          )
          setTimeout(() => setAvisoAplicado(''), 10000)
        }
      } else {
        atualizarPreviaModelo(texto)
        setErroModelo(
          'Li o arquivo, mas não reconheci os rótulos do modelo (PACOTES, SPR, Veículos DIV, MM…). O texto lido está na caixa acima — tente uma imagem mais nítida (print em vez de foto da tela) ou cole o texto.',
        )
      }
    }
    if (ehPdf || ehImagem) {
      setLendoModelo(ehPdf ? '⏳ Lendo PDF…' : '🔍 Lendo imagem…')
      void (async () => {
        try {
          const texto = ehPdf
            ? await extrairTextoTabularDePdf(await arquivo.arrayBuffer(), setLendoModelo)
            : await extrairTextoDeImagem(arquivo, setLendoModelo)
          aplicarDireto(texto)
        } catch (err) {
          setErroModelo(`Não consegui ler esse arquivo (${(err as Error).message ?? 'erro'}). Tente uma foto mais nítida ou cole o texto.`)
        } finally {
          setLendoModelo('')
        }
      })()
      return
    }
    const leitor = new FileReader()
    leitor.onload = () => aplicarDireto(String(leitor.result ?? ''))
    leitor.readAsText(arquivo)
  }

  const aplicarModelo = () => {
    if (!previaModelo) return
    const dia = previaModelo.data ?? data
    aplicarModeloResumo(dia, previaModelo)
    if (dia !== data) aoMudarDia?.(dia)
    setModalModelo(false)
    setTextoModelo('')
    setPreviaModelo(null)
  }

  const imprimir = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const linhaT =
      linhasAM
        .map((t) => `<tr><td>${t.nome}</td><td class="c">${t.utilitarios || ''}</td><td class="c">${t.vuc || ''}</td></tr>`)
        .join('') +
      outrosAM.map(([tipo, qtd]) => `<tr><td>${tipo}</td><td class="c" colspan="2">${qtd}</td></tr>`).join('')
    const linhaMM = r.mm
      .map(
        (m) =>
          `<tr><td>${m.tipo}</td><td class="c">${m.quantidade || ''}</td><td class="c">x${m.posicoesPorUnidade} posições</td></tr>`,
      )
      .join('')
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo ${formatarData(data)}</title>
    <style>
      body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;padding:20px;color:#1e293b}
      table{border-collapse:collapse;width:340px;margin:0 auto 10px}
      td,th{border:1px solid #94a3b8;padding:6px 10px;font-size:13px}
      .cab{background:#334155;color:#fff;font-weight:700;text-align:center;font-size:15px}
      .sub{background:#475569;color:#fff;font-weight:700;text-align:center}
      .lbl{background:#e2e8f0;font-weight:700}
      .val{background:#f1f5f9;text-align:center}
      .c{text-align:center}
      .destaque{background:#fde68a;font-weight:700;text-align:center}
    </style></head><body>
    <table><tr><td class="cab" colspan="3">${r.base}</td></tr></table>
    <table>
      <tr><td class="lbl">SPR DE REFERÊNCIA</td><td class="val" colspan="2">${r.sprReferencia}</td></tr>
    </table>
    <table>
      <tr><td class="sub" colspan="3">${r.base}</td></tr>
      <tr><td class="lbl">PACOTES</td><td class="val" colspan="2">${r.pacotes}</td></tr>
      <tr><td class="lbl">Veículos DIV</td><td class="val" colspan="2">${r.veiculosDiv}</td></tr>
      <tr><td class="destaque" colspan="3">${formatarData(data)}</td></tr>
    </table>
    <table>
      <tr><td class="sub">AM · Transportadora</td><td class="sub c">Utilitários</td><td class="sub c">VUC</td></tr>
      ${linhaT}
      <tr><td class="lbl">TOTAL ROTAS</td><td class="destaque" colspan="2">${totalRotas}</td></tr>
    </table>
    <table>
      <tr><td class="sub" colspan="3">MM</td></tr>
      ${linhaMM}
      <tr><td class="lbl">Posições</td><td class="destaque" colspan="2">${totalPosicoes}</td></tr>
    </table>
    </body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  // ---------- Modo edição ----------
  if (editando) {
    const setT = (i: number, campo: 'nome' | 'utilitarios' | 'vuc', v: string) =>
      setRascunho({
        ...rascunho,
        transportadoras: rascunho.transportadoras.map((t, j) => (j === i ? { ...t, [campo]: v } : t)),
      })
    const setM = (i: number, campo: 'tipo' | 'quantidade' | 'posicoesPorUnidade', v: string) =>
      setRascunho({ ...rascunho, mm: rascunho.mm.map((m, j) => (j === i ? { ...m, [campo]: v } : m)) })
    return (
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">✏️ Editar resumo — {formatarData(rascunho.data)}</h2>
        </div>
        {avisoAplicado && (
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {avisoAplicado}
          </p>
        )}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">
              Base
              <Input value={rascunho.base} onChange={(e) => setRascunho({ ...rascunho, base: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              SPR de referência
              <Input value={rascunho.sprReferencia} onChange={(e) => setRascunho({ ...rascunho, sprReferencia: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Pacotes
              <Input value={rascunho.pacotes} onChange={(e) => setRascunho({ ...rascunho, pacotes: e.target.value })} inputMode="numeric" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Veículos DIV
              <Input value={rascunho.veiculosDiv} onChange={(e) => setRascunho({ ...rascunho, veiculosDiv: e.target.value })} inputMode="numeric" />
            </label>
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 rounded-lg border border-ml-amarelo bg-yellow-50 px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={rascunho.amAutomatico !== false}
                onChange={(e) => setRascunho({ ...rascunho, amAutomatico: e.target.checked })}
              />
              🔄 Puxar Utilitários/VUC automaticamente da programação do Meli
            </label>
            {rascunho.amAutomatico !== false ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {rotasProg > 0 ? (
                  <>
                    Da programação de {formatarData(data)}: <strong>{cont.utilitarios} utilitários</strong> +{' '}
                    <strong>{cont.vuc} VUC</strong>
                    {cont.outros.length > 0 && ` + ${cont.outros.map(([t, q]) => `${q} ${t}`).join(', ')}`} ={' '}
                    <strong>{cont.total} rotas</strong>.
                    {usarTransp ? (
                      <>
                        {' '}
                        Agrupado por transportadora (cruzando com a planilha de Rotas):{' '}
                        <strong>{amT.grupos.map(([n]) => n).join(', ')}</strong>.
                      </>
                    ) : (
                      <>
                        {' '}
                        <span className="text-amber-700">
                          Para separar por transportadora, importe/atualize a aba <strong>Rotas</strong> — o sistema
                          cruza as duas planilhas pela rota.
                        </span>
                      </>
                    )}{' '}
                    Atualiza sozinho a cada importação.
                  </>
                ) : (
                  <>Ainda não há programação importada para este dia — importe a planilha do Meli, ou desmarque acima para preencher à mão.</>
                )}
              </p>
            ) : (
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">AM — por transportadora (manual)</p>
            )}
          </div>

          {rascunho.amAutomatico === false && (
          <div>
            <div className="space-y-2">
              {rascunho.transportadoras.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Transportadora" value={t.nome} onChange={(e) => setT(i, 'nome', e.target.value)} />
                  <Input placeholder="Utilitários" value={t.utilitarios} onChange={(e) => setT(i, 'utilitarios', e.target.value)} inputMode="numeric" className="w-28" />
                  <Input placeholder="VUC" value={t.vuc} onChange={(e) => setT(i, 'vuc', e.target.value)} inputMode="numeric" className="w-24" />
                  <button
                    onClick={() => setRascunho({ ...rascunho, transportadoras: rascunho.transportadoras.filter((_, j) => j !== i) })}
                    className="rounded-lg px-2 text-red-600 hover:bg-red-50"
                    title="Remover"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button
                variante="secundario"
                onClick={() => setRascunho({ ...rascunho, transportadoras: [...rascunho.transportadoras, { nome: '', utilitarios: '', vuc: '' }] })}
              >
                ➕ Transportadora
              </Button>
            </div>
          </div>
          )}

          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">MM — veículos grandes (quantidade × posições por unidade)</p>
            <div className="space-y-2">
              {rascunho.mm.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Tipo" value={m.tipo} onChange={(e) => setM(i, 'tipo', e.target.value)} className="w-32" />
                  <Input placeholder="Qtd" value={m.quantidade} onChange={(e) => setM(i, 'quantidade', e.target.value)} inputMode="numeric" className="w-20" />
                  <span className="text-slate-400">×</span>
                  <Input placeholder="Posições" value={m.posicoesPorUnidade} onChange={(e) => setM(i, 'posicoesPorUnidade', e.target.value)} inputMode="numeric" className="w-24" />
                  <span className="text-xs text-slate-500">= {num(m.quantidade) * num(m.posicoesPorUnidade)} posições</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variante="secundario" onClick={() => { setEditando(false); setRascunho(existente ?? novoResumo(data, '')) }}>
              Cancelar
            </Button>
            <Button variante="ml" onClick={salvar}>💾 Salvar resumo</Button>
          </div>
        </div>
      </Card>
    )
  }

  // ---------- Modo exibição (estilo da imagem) ----------
  const CAB = 'bg-slate-700 text-white font-bold text-center'
  const SUB = 'bg-slate-600 text-white font-bold text-center'
  const LBL = 'bg-slate-100 font-bold text-slate-700'
  const VAL = 'bg-slate-50 text-center font-semibold text-slate-900'
  const DEST = 'bg-ml-amarelo font-bold text-center text-slate-900'
  const cel = 'border border-slate-300 px-3 py-1.5 text-sm'

  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">📋 Resumo do dia</h2>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={imprimir}>🖨️ Imprimir / PDF</Button>
          <Button variante="secundario" onClick={() => { setErroModelo(''); setModalModelo(true) }}>
            📥 Importar modelo
          </Button>
          <Button variante="ml" onClick={() => { setRascunho(existente ?? novoResumo(data, '')); setEditando(true) }}>
            ✏️ {existente ? 'Editar' : 'Preencher'}
          </Button>
        </div>
      </div>

      {avisoAplicado && (
        <p className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {avisoAplicado}
        </p>
      )}
      {!existente && !avisoAplicado && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ainda não há resumo para {formatarData(data)}. Toque em <strong>📥 Importar modelo</strong> (foto/PDF) ou{' '}
          <strong>Preencher</strong>.
        </p>
      )}

      <div className="mx-auto grid max-w-md gap-3">
        <table className="w-full border-collapse">
          <tbody>
            <tr><td className={`${cel} ${CAB} text-base`}>{r.base}</td></tr>
          </tbody>
        </table>

        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={`${cel} ${LBL}`}>SPR DE REFERÊNCIA</td>
              <td className={`${cel} ${VAL}`}>{r.sprReferencia || '—'}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse">
          <tbody>
            <tr><td className={`${cel} ${SUB}`} colSpan={2}>{r.base}</td></tr>
            <tr>
              <td className={`${cel} ${LBL}`}>PACOTES</td>
              <td className={`${cel} ${VAL}`}>{r.pacotes || '—'}</td>
            </tr>
            <tr>
              <td className={`${cel} ${LBL}`}>Veículos DIV</td>
              <td className={`${cel} ${VAL}`}>{r.veiculosDiv || '—'}</td>
            </tr>
            <tr><td className={`${cel} ${DEST}`} colSpan={2}>{formatarData(data)}</td></tr>
          </tbody>
        </table>

        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={`${cel} ${SUB} text-left`}>
                AM {usarTransp ? '· por transportadora' : auto ? '· automático' : '· Transportadora'}
              </td>
              <td className={`${cel} ${SUB}`}>Utilitários</td>
              <td className={`${cel} ${SUB}`}>VUC</td>
            </tr>
            {linhasAM.map((t, i) => (
              <tr key={i}>
                <td className={`${cel} font-semibold text-slate-700`}>{t.nome || '—'}</td>
                <td className={`${cel} text-center`}>{t.utilitarios || ''}</td>
                <td className={`${cel} text-center`}>{t.vuc || ''}</td>
              </tr>
            ))}
            {outrosAM.map(([tipo, qtd]) => (
              <tr key={tipo}>
                <td className={`${cel} font-semibold text-slate-700`}>{tipo}</td>
                <td className={`${cel} text-center text-slate-600`} colSpan={2}>{qtd}</td>
              </tr>
            ))}
            <tr>
              <td className={`${cel} ${LBL}`}>TOTAL ROTAS</td>
              <td className={`${cel} ${DEST}`} colSpan={2}>{totalRotas}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse">
          <tbody>
            <tr><td className={`${cel} ${SUB}`} colSpan={3}>MM</td></tr>
            {r.mm.map((m, i) => (
              <tr key={i}>
                <td className={`${cel} ${LBL}`}>{m.tipo}</td>
                <td className={`${cel} text-center`}>{m.quantidade || ''}</td>
                <td className={`${cel} text-center text-slate-600`}>x{m.posicoesPorUnidade} posições</td>
              </tr>
            ))}
            <tr>
              <td className={`${cel} ${LBL}`}>Posições</td>
              <td className={`${cel} ${DEST}`} colSpan={2}>{totalPosicoes}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-center text-[11px] text-slate-400">
          {usarTransp
            ? '🔄 AM automático por transportadora (Meli × Rotas): '
            : auto
              ? '🔄 AM automático da programação: '
              : 'Total do resumo: '}
          {totalUtil} utilitários + {totalVuc} VUC = {totalRotas} rotas
          {!auto && rotasProg > 0 && ` • programação importada tem ${rotasProg} rota(s)`}
        </p>
      </div>

      {/* Importar o modelo do resumo (colar / CSV / PDF / foto) */}
      <Modal aberto={modalModelo} titulo={`📥 Importar modelo — ${formatarData(data)}`} onFechar={() => setModalModelo(false)}>
        <p className="mb-2 text-sm text-slate-600">
          Cole o texto do modelo do dia, ou envie o arquivo (CSV, PDF ou foto). O sistema reconhece pelos
          rótulos: <strong>base, SPR, pacotes, veículos DIV, transportadoras (AM) e MM</strong>.
        </p>
        <textarea
          className="h-32 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-ml-azul"
          placeholder={'EMG13 - ITUIUTABA\nSPR DE REFERÊNCIA\t100\nPACOTES\t6653\nVeículos DIV\t54\n…'}
          value={textoModelo}
          onChange={(e) => atualizarPreviaModelo(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={arquivoModeloRef} type="file" accept=".csv,.txt,.tsv,.pdf,image/*" onChange={lerArquivoModelo} className="hidden" />
          <Button variante="secundario" onClick={() => arquivoModeloRef.current?.click()} disabled={!!lendoModelo}>
            {lendoModelo || '📄 Enviar CSV, PDF ou foto'}
          </Button>
        </div>
        {erroModelo && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroModelo}</p>
        )}
        {previaModelo && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700">
            <p className="font-bold text-emerald-800">✅ Reconhecido no modelo:</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {previaModelo.base && <li>🏢 Base: <strong>{previaModelo.base}</strong></li>}
              {previaModelo.sprReferencia && <li>🎯 SPR de referência: <strong>{previaModelo.sprReferencia}</strong></li>}
              {previaModelo.pacotes && <li>📦 Pacotes: <strong>{previaModelo.pacotes}</strong></li>}
              {previaModelo.veiculosDiv && <li>🚐 Veículos DIV: <strong>{previaModelo.veiculosDiv}</strong></li>}
              {previaModelo.transportadoras.length > 0 && (
                <li>
                  🚛 AM:{' '}
                  <strong>
                    {previaModelo.transportadoras
                      .map((t) => `${t.nome} (${t.utilitarios || 0}${t.vuc ? `+${t.vuc} VUC` : ''})`)
                      .join(', ')}
                  </strong>
                </li>
              )}
              {previaModelo.mm.length > 0 && (
                <li>
                  🚚 MM:{' '}
                  <strong>
                    {previaModelo.mm.map((m) => `${m.tipo}${m.quantidade ? ` ${m.quantidade}` : ''} (x${m.posicoesPorUnidade})`).join(', ')}
                  </strong>
                </li>
              )}
              {previaModelo.data && previaModelo.data !== data && (
                <li className="text-amber-700">
                  ⚠️ O modelo indica {formatarData(previaModelo.data)} — será aplicado ao dia selecionado ({formatarData(data)}).
                </li>
              )}
            </ul>
            {previaModelo.camposDetectados === 0 ? (
              <p className="mt-1 text-xs text-amber-700">Nenhum campo reconhecido — confira se o texto tem os rótulos do modelo.</p>
            ) : (
              <Button variante="ml" className="mt-2 w-full" onClick={aplicarModelo}>
                📥 Preencher o card agora
              </Button>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setModalModelo(false)}>
            Cancelar
          </Button>
          <Button variante="ml" onClick={aplicarModelo} disabled={!previaModelo || previaModelo.camposDetectados === 0}>
            📥 Preencher o card
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
