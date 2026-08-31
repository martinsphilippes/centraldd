import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  aprenderComResumo,
  enviarNotificacao,
  removerResumoDia,
  salvarChamada,
  salvarResumoDia,
  uid,
  useDB,
} from '../../core/db'
import { ImportarRotasModal } from '../rotas/ImportarRotasModal'
import { OPERACOES, STATUS_DISPONIVEIS } from '../../core/constants'
import { respostasDaChamada } from '../../core/stats'
import { formatarData, formatarDataLonga, hojeISO, rotuloDia } from '../../core/dates'
import { abrirImpressao } from '../../core/impressao'
import { amDoDia } from '../../core/resumo-auto'
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
    amAutomatico: true,
    transportadoras: [{ nome: 'RODACOOP', utilitarios: '', vuc: '' }],
    mm: MM_PADRAO.map((m) => ({ ...m })),
    atualizadoEm: '',
  }
}

const num = (s?: string) => Number(String(s ?? '').replace(/\D/g, '')) || 0


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

  // Importação das ROTAS do dia (o mesmo importador da tela de Rotas). É a
  // única importação da Programação: o resumo sai dela.
  const [modalRotas, setModalRotas] = useState(false)
  const [avisoAplicado, setAvisoAplicado] = useState('')

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

  // O AM sai sozinho da planilha do dia: as ROTAS quando existem (veículo e
  // transportadora vêm na mesma linha), senão a programação do Meli.
  const am = amDoDia(db, data)
  const auto = r.amAutomatico !== false && am.fonte !== null

  const linhasAM = auto ? am.linhas : r.transportadoras
  const outrosAM = auto ? am.outros : []

  const totalUtil = auto ? am.utilitarios : r.transportadoras.reduce((s, t) => s + num(t.utilitarios), 0)
  const totalVuc = auto ? am.vuc : r.transportadoras.reduce((s, t) => s + num(t.vuc), 0)
  // Total de rotas: informado à mão manda; senão vem da planilha (quando
  // automático) ou da soma das transportadoras.
  const totalRotasCalculado = auto
    ? am.total
    : r.transportadoras.reduce((s, t) => s + num(t.utilitarios) + num(t.vuc), 0)
  const totalRotas = num(r.totalRotas) > 0 ? num(r.totalRotas) : totalRotasCalculado
  // Posições: soma das quantidades × posições do veículo, a menos que o
  // dispatcher tenha informado o total à mão (o card traz um campo só para isso).
  const posicoesCalculadas = r.mm.reduce((s, m) => s + num(m.quantidade) * num(m.posicoesPorUnidade), 0)
  const totalPosicoes = num(r.posicoesTotal) > 0 ? num(r.posicoesTotal) : posicoesCalculadas
  // Base e Veículos DIV: o que o Dispatcher escreveu manda; em branco, a
  // planilha responde (uma rota = um veículo).
  const baseExibida = r.base && r.base !== 'BASE - CIDADE' ? r.base : am.base || r.base
  const veiculosDivExibido = r.veiculosDiv || (auto ? String(am.total) : '')

  /**
   * O dia é editável no formulário; o id do resumo é a própria data.
   * Dia passado não se programa — a troca para trás é ignorada.
   */
  const mudarDia = (novoDia: string) => {
    if (!novoDia || novoDia < hojeISO()) return
    setRascunho({ ...rascunho, id: novoDia, data: novoDia })
  }

  const salvar = () => {
    // Posições por unidade é característica do veículo: se ficou vazia ou
    // zerada (digitação no campo errado, leitura falha), volta ao padrão.
    const mm = rascunho.mm.map((linha) => {
      if (num(linha.posicoesPorUnidade) > 0) return linha
      const padrao = MM_PADRAO.find((p) => p.tipo.toUpperCase() === linha.tipo.trim().toUpperCase())
      return padrao ? { ...linha, posicoesPorUnidade: padrao.posicoesPorUnidade } : linha
    })
    const salvo = { ...rascunho, id: rascunho.data, mm }
    const mudouDeDia = salvo.data !== data
    // Trocar o dia MOVE o resumo. Se o destino já tem um, confirma antes de
    // substituir — é o único jeito de perder trabalho sem querer aqui.
    if (mudouDeDia) {
      const noDestino = db.resumos.find((x) => x.id === salvo.data)
      if (
        noDestino &&
        !confirm(
          `Já existe um resumo para ${formatarData(salvo.data)}.\n\nSubstituir pelo que está na tela?`,
        )
      )
        return
    }
    salvarResumoDia(salvo)
    if (mudouDeDia && existente) removerResumoDia(data)
    // Ensina o sistema: a estrutura conferida à mão vale para as próximas
    // leituras desta base (transportadoras e posições por veículo).
    aprenderComResumo(salvo)
    setEditando(false)
    setAvisoAplicado('')
    if (mudouDeDia) aoMudarDia?.(salvo.data)
  }

  // ---------- Chamada automática a partir do resumo ----------
  // A meta vem do próprio card (TOTAL ROTAS); a frota inteira é notificada.
  const chamadaDoDia = db.chamadas.find((c) => c.data === data)
  // Conta também quem marcou disponibilidade na disponibilidade daquele dia.
  const respostasDoDia = chamadaDoDia ? respostasDaChamada(db, chamadaDoDia.id) : []
  const disponiveisNaChamada = respostasDoDia.filter((resp) =>
    STATUS_DISPONIVEIS.includes(resp.status),
  ).length

  const chamarMotoristas = () => {
    if (chamadaDoDia) return
    const id = uid()
    const meta = totalRotas > 0 ? totalRotas : 45
    const titulo = `Disponibilidade — ${baseExibida}`
    salvarChamada({
      id,
      titulo,
      data,
      operacao: OPERACOES[0],
      horarioInicio: '07:00',
      horarioFim: '18:00',
      qtdNecessaria: meta,
      status: 'aberta',
      criadaEm: new Date().toISOString(),
    })
    enviarNotificacao({
      motoristaId: null,
      chamadaId: id,
      titulo: `Nova chamada: ${titulo}`,
      mensagem: `📅 ${formatarDataLonga(data)} • ${OPERACOES[0]} • 🚚 ${meta} motoristas necessários. Responda sua disponibilidade!`,
    })
  }

  const imprimir = () => {
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
    abrirImpressao(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo ${formatarData(data)}</title>
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
    <table><tr><td class="cab" colspan="3">${baseExibida}</td></tr></table>
    <table>
      <tr><td class="lbl">SPR DE REFERÊNCIA</td><td class="val" colspan="2">${r.sprReferencia}</td></tr>
    </table>
    <table>
      <tr><td class="sub" colspan="3">${baseExibida}</td></tr>
      <tr><td class="lbl">PACOTES</td><td class="val" colspan="2">${r.pacotes}</td></tr>
      <tr><td class="lbl">Veículos DIV</td><td class="val" colspan="2">${veiculosDivExibido}</td></tr>
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
  }

  // ---------- Modo edição ----------
  if (editando) {
    const posicoesCalculadasRascunho = rascunho.mm.reduce(
      (s, m) => s + num(m.quantidade) * num(m.posicoesPorUnidade),
      0,
    )
    const totalRotasSomado = rascunho.transportadoras.reduce(
      (s, t) => s + num(t.utilitarios) + num(t.vuc),
      0,
    )
    const setT = (i: number, campo: 'nome' | 'utilitarios' | 'vuc', v: string) =>
      setRascunho({
        ...rascunho,
        transportadoras: rascunho.transportadoras.map((t, j) => (j === i ? { ...t, [campo]: v } : t)),
      })
    const setM = (i: number, campo: 'tipo' | 'quantidade' | 'posicoesPorUnidade', v: string) =>
      setRascunho({ ...rascunho, mm: rascunho.mm.map((m, j) => (j === i ? { ...m, [campo]: v } : m)) })
    return (
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">✏️ Editar resumo</h2>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            📅 Dia
            <Input
              type="date"
              value={rascunho.data}
              min={hojeISO()}
              onChange={(e) => mudarDia(e.target.value)}
              style={{ width: 'auto' }}
            />
          </label>
        </div>
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            rascunho.data > hojeISO()
              ? 'border border-slate-300 bg-slate-100 font-semibold text-slate-700'
              : 'bg-slate-50 text-slate-600'
          }`}
        >
          {rascunho.data > hojeISO() ? '🔮 Planejamento antecipado: ' : '📅 '}
          <strong>{rotuloDia(rascunho.data)}</strong>
          {rascunho.data !== data && (
            <>
              {' '}— ao salvar, o resumo {existente ? 'passa deste dia para' : 'é criado em'}{' '}
              <strong>{formatarData(rascunho.data)}</strong> e o card salta para lá.
            </>
          )}
        </p>
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
            <label className="mb-2 flex items-center gap-2 rounded-lg border border-marca bg-marca-suave px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={rascunho.amAutomatico !== false}
                onChange={(e) => setRascunho({ ...rascunho, amAutomatico: e.target.checked })}
              />
              🔄 Puxar Utilitários/VUC automaticamente da planilha do dia
            </label>
            {rascunho.amAutomatico !== false ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {am.fonte ? (
                  <>
                    {am.fonte === 'rotas'
                      ? 'Da planilha de Rotas de '
                      : 'Da programação do Meli de '}
                    {formatarData(data)}: <strong>{am.utilitarios} utilitários</strong> +{' '}
                    <strong>{am.vuc} VUC</strong>
                    {am.outros.length > 0 && ` + ${am.outros.map(([t, q]) => `${q} ${t}`).join(', ')}`} ={' '}
                    <strong>{am.total} rotas</strong>, agrupado por transportadora:{' '}
                    <strong>{am.linhas.map((l) => l.nome).join(', ')}</strong>. Atualiza sozinho a cada
                    importação.
                  </>
                ) : (
                  <>
                    Ainda não há planilha importada para este dia — importe as{' '}
                    <strong>Rotas</strong> (ou a programação do Meli), ou desmarque acima para preencher à
                    mão.
                  </>
                )}
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <span className="flex-1">AM — Transportadora</span>
              <span className="w-28 text-marca-texto">Utilitários ✏️</span>
              <span className="w-24 text-marca-texto">VUC ✏️</span>
              <span className="w-7" />
            </div>
            <div className="space-y-2">
              {rascunho.transportadoras.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Transportadora" value={t.nome} onChange={(e) => setT(i, 'nome', e.target.value)} />
                  <Input placeholder="Utilitários" value={t.utilitarios} onChange={(e) => setT(i, 'utilitarios', e.target.value)} inputMode="numeric" className="w-28 border-marca-texto bg-orange-50/40 font-bold" />
                  <Input placeholder="VUC" value={t.vuc} onChange={(e) => setT(i, 'vuc', e.target.value)} inputMode="numeric" className="w-24 border-marca-texto bg-orange-50/40 font-bold" />
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

            {/* Total de rotas: calculado pela soma, mas sempre editável. */}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-marca bg-marca-suave px-3 py-2.5">
              <span className="text-sm font-bold uppercase tracking-wide text-slate-700">Total rotas</span>
              <Input
                value={rascunho.totalRotas ?? ''}
                onChange={(e) => setRascunho({ ...rascunho, totalRotas: e.target.value })}
                inputMode="numeric"
                placeholder={String(totalRotasSomado)}
                className="w-28 text-center text-lg font-bold"
              />
              <span className="text-[11px] text-slate-600">
                {num(rascunho.totalRotas) > 0 ? (
                  <>
                    valor informado à mão — a soma das transportadoras daria{' '}
                    <strong>{totalRotasSomado}</strong>.{' '}
                    <button
                      onClick={() => setRascunho({ ...rascunho, totalRotas: '' })}
                      className="font-semibold text-marca-texto hover:underline"
                    >
                      voltar ao calculado
                    </button>
                  </>
                ) : (
                  <>
                    em branco = soma das transportadoras (<strong>{totalRotasSomado}</strong>).
                  </>
                )}
              </span>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">MM — veículos grandes</p>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <span className="w-32">Veículo</span>
              <span className="w-24 text-marca-texto">Quantidade ✏️</span>
              <span className="w-20 text-marca-texto">Posições ✏️</span>
            </div>
            <div className="space-y-2">
              {rascunho.mm.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Tipo" value={m.tipo} onChange={(e) => setM(i, 'tipo', e.target.value)} className="w-32" />
                  <Input
                    placeholder="Qtd"
                    value={m.quantidade}
                    onChange={(e) => setM(i, 'quantidade', e.target.value)}
                    inputMode="numeric"
                    className="w-24 border-marca-texto bg-orange-50/40 font-bold"
                  />
                  <Input
                    placeholder="Posições"
                    value={m.posicoesPorUnidade}
                    onChange={(e) => setM(i, 'posicoesPorUnidade', e.target.value)}
                    inputMode="numeric"
                    className="w-20 text-center"
                  />
                  <span className="text-xs text-slate-400">posições cada</span>
                </div>
              ))}
            </div>

            {/* Uma linha só, no fim: o total de posições — calculado, mas
                sempre editável quando o dia fugir da conta. */}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-marca bg-marca-suave px-3 py-2.5">
              <span className="text-sm font-bold uppercase tracking-wide text-slate-700">Posições (total)</span>
              <Input
                value={rascunho.posicoesTotal ?? ''}
                onChange={(e) => setRascunho({ ...rascunho, posicoesTotal: e.target.value })}
                inputMode="numeric"
                placeholder={String(posicoesCalculadasRascunho)}
                className="w-28 text-center text-lg font-bold"
              />
              <span className="text-[11px] text-slate-600">
                {num(rascunho.posicoesTotal) > 0 ? (
                  <>
                    valor informado à mão — pelas quantidades daria{' '}
                    <strong>{posicoesCalculadasRascunho}</strong>.{' '}
                    <button
                      onClick={() => setRascunho({ ...rascunho, posicoesTotal: '' })}
                      className="font-semibold text-marca-texto hover:underline"
                    >
                      voltar ao calculado
                    </button>
                  </>
                ) : (
                  <>
                    em branco = calculado pelas quantidades (<strong>{posicoesCalculadasRascunho}</strong>).
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variante="secundario" onClick={() => { setEditando(false); setRascunho(existente ?? novoResumo(data, '')) }}>
              Cancelar
            </Button>
            <Button variante="marca" onClick={salvar}>💾 Salvar resumo</Button>
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
  const DEST = 'bg-marca font-bold text-center text-slate-900'
  const cel = 'border border-slate-300 px-3 py-1.5 text-sm'

  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
          📋 Resumo do dia
          <span className="text-sm font-semibold text-slate-500">{rotuloDia(data)}</span>
          {data > hojeISO() && (
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
              🔮 planejamento antecipado
            </span>
          )}
        </h2>
        <div className="flex flex-wrap gap-2">
          {/* Importar rotas é a PRIMEIRA opção: é dela que sai o resumo do
              dia inteiro — o modelo deixou de ser importado à parte. */}
          <Button variante="marca" onClick={() => setModalRotas(true)}>
            🛣️ Importar rotas
          </Button>
          <Button variante="secundario" onClick={imprimir}>🖨️ Imprimir / PDF</Button>
          {existente && (
            <Button
              variante="fantasma"
              onClick={() => {
                if (
                  confirm(
                    `Limpar o resumo de ${formatarData(data)}?\n\nOs números digitados à mão saem do dia e a Programação volta a aparecer como pendente na esteira. As rotas importadas e a chamada não são afetadas.`,
                  )
                )
                  removerResumoDia(data)
              }}
            >
              🗑️ Limpar
            </Button>
          )}
          <Button variante="secundario" onClick={() => { setRascunho(existente ?? novoResumo(data, '')); setEditando(true) }}>
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
          Ainda não há resumo para {formatarData(data)}. Toque em <strong>🛣️ Importar rotas</strong> —
          o card se preenche sozinho com o que a planilha traz. Pacotes, SPR e MM entram em{' '}
          <strong>Preencher</strong>.
        </p>
      )}

      <div className="mx-auto grid max-w-md gap-3">
        <table className="w-full border-collapse">
          <tbody>
            <tr><td className={`${cel} ${CAB} text-base`}>{baseExibida}</td></tr>
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
            <tr><td className={`${cel} ${SUB}`} colSpan={2}>{baseExibida}</td></tr>
            <tr>
              <td className={`${cel} ${LBL}`}>PACOTES</td>
              <td className={`${cel} ${VAL}`}>{r.pacotes || '—'}</td>
            </tr>
            <tr>
              <td className={`${cel} ${LBL}`}>Veículos DIV</td>
              <td className={`${cel} ${VAL}`}>{veiculosDivExibido || '—'}</td>
            </tr>
            <tr><td className={`${cel} ${DEST}`} colSpan={2}>{formatarData(data)}</td></tr>
          </tbody>
        </table>

        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={`${cel} ${SUB} text-left`}>
                AM {auto ? '· por transportadora (automático)' : '· Transportadora'}
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
          {auto
            ? `🔄 AM automático (${am.fonte === 'rotas' ? 'planilha de Rotas' : 'programação do Meli'}): `
            : 'Total do resumo: '}
          {totalUtil} utilitários + {totalVuc} VUC = {totalRotas} rotas
          {!auto && am.fonte && ` • a planilha do dia tem ${am.total} rota(s)`}
        </p>

        {/* Do resumo direto para a chamada: um toque convoca a frota do dia. */}
        {chamadaDoDia ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2">
            <p className="text-sm font-semibold text-emerald-800">
              📢 Chamada de {formatarData(data)} {chamadaDoDia.status === 'aberta' ? 'aberta' : 'encerrada'} —{' '}
              {disponiveisNaChamada}/{chamadaDoDia.qtdNecessaria} disponíveis
            </p>
            <Link
              to={`/chamadas/${chamadaDoDia.id}`}
              className="rounded-lg bg-marca-texto px-3 py-1.5 text-sm font-bold text-white hover:opacity-90"
            >
              Ver respostas →
            </Link>
          </div>
        ) : (
          <Button variante="marca" className="w-full" onClick={chamarMotoristas}>
            📢 Chamar motoristas{totalRotas > 0 ? ` — meta ${totalRotas} (TOTAL ROTAS)` : ''}
          </Button>
        )}
      </div>

      {/* Importar as rotas do dia (mesmo importador da tela de Rotas) */}
      <ImportarRotasModal aberto={modalRotas} onFechar={() => setModalRotas(false)} data={data} />

    </Card>
  )
}
