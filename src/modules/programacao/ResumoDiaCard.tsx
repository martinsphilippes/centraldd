import { useState } from 'react'
import { salvarResumoDia, useDB } from '../../core/db'
import { formatarData } from '../../core/dates'
import type { ResumoDia } from '../../core/types'
import { Button, Card, Input } from '../../components/ui'

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
    transportadoras: [{ nome: 'RODACOOP', utilitarios: '', vuc: '' }],
    mm: MM_PADRAO.map((m) => ({ ...m })),
    atualizadoEm: '',
  }
}

const num = (s: string) => Number(String(s).replace(/\D/g, '')) || 0

export function ResumoDiaCard({ data }: { data: string }) {
  const db = useDB()
  const [editando, setEditando] = useState(false)
  const existente = db.resumos.find((r) => r.id === data)

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

  const totalRotas = r.transportadoras.reduce((s, t) => s + num(t.utilitarios) + num(t.vuc), 0)
  const totalUtil = r.transportadoras.reduce((s, t) => s + num(t.utilitarios), 0)
  const totalVuc = r.transportadoras.reduce((s, t) => s + num(t.vuc), 0)
  const totalPosicoes = r.mm.reduce((s, m) => s + num(m.quantidade) * num(m.posicoesPorUnidade), 0)

  // Conferência com a programação importada do dia.
  const progDoDia = db.programacao.filter((p) => p.data === data)
  const rotasProg = progDoDia.length

  const salvar = () => {
    salvarResumoDia(rascunho)
    setEditando(false)
  }

  const imprimir = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const linhaT = r.transportadoras
      .map((t) => `<tr><td>${t.nome}</td><td class="c">${t.utilitarios || ''}</td><td class="c">${t.vuc || ''}</td></tr>`)
      .join('')
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
          <h2 className="font-bold text-slate-900">✏️ Editar resumo — {formatarData(data)}</h2>
        </div>
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
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">AM — por transportadora</p>
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
        <div className="flex gap-2">
          <Button variante="secundario" onClick={imprimir}>🖨️ Imprimir / PDF</Button>
          <Button variante="ml" onClick={() => { setRascunho(existente ?? novoResumo(data, '')); setEditando(true) }}>
            ✏️ {existente ? 'Editar' : 'Preencher'}
          </Button>
        </div>
      </div>

      {!existente && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ainda não há resumo para {formatarData(data)}. Toque em <strong>Preencher</strong> para montar o card.
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
              <td className={`${cel} ${SUB} text-left`}>AM · Transportadora</td>
              <td className={`${cel} ${SUB}`}>Utilitários</td>
              <td className={`${cel} ${SUB}`}>VUC</td>
            </tr>
            {r.transportadoras.map((t, i) => (
              <tr key={i}>
                <td className={`${cel} font-semibold text-slate-700`}>{t.nome || '—'}</td>
                <td className={`${cel} text-center`}>{t.utilitarios || ''}</td>
                <td className={`${cel} text-center`}>{t.vuc || ''}</td>
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
          Total de rotas no resumo: {totalUtil} utilitários + {totalVuc} VUC = {totalRotas}
          {rotasProg > 0 && ` • programação importada tem ${rotasProg} rota(s)`}
        </p>
      </div>
    </Card>
  )
}
