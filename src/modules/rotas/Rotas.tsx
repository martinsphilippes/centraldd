import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { enviarNotificacao, removerRota, salvarRota, uid, useDB } from '../../core/db'
import { nomeOficialVeiculo, opcoesDeVeiculo } from '../../core/veiculos'
import { kmDaRota, ondasEDocas, totalDeOndas } from '../../core/ondas'
import { alocarMotoristasNasRotas, parametrosAtuais } from '../../core/alocacao'
import { formatarData, hojeISO, rotuloDia } from '../../core/dates'
import { lerDiaProgramacao, gravarDiaProgramacao } from '../../core/dia-selecionado'
import type { Rota } from '../../core/types'

/** Colunas por onde a tabela pode ser ordenada. */
type CampoOrdem =
  | 'cidade'
  | 'rotaExpedicao'
  | 'rotaOriginal'
  | 'base'
  | 'motorista'
  | 'veiculo'
  | 'km'
  | 'dps'
  | 'ocupacao'
  | 'transportadora'
  | 'onda'
  | 'doca'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../../core/export'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '../../components/ui'


export function Rotas() {
  const db = useDB()
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [transportadora, setTransportadora] = useState('')
  const [editando, setEditando] = useState<Rota | null>(null)
  const [avisoAuto, setAvisoAuto] = useState('')

  const motoristas = db.motoristas
    .filter((m) => m.ativo && m.aprovado !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome))
  const porMotorista = new Map(motoristas.map((m) => [m.id, m]))

  // A roteirização pertence ao DIA em que foi importada. A tela trabalha
  // sempre num dia só — o mesmo dia da Programação, preservado entre telas.
  const [dia, setDia] = useState<string>(() => lerDiaProgramacao() || hojeISO())
  const trocarDia = (d: string) => {
    const alvo = d || hojeISO()
    gravarDiaProgramacao(alvo)
    setDia(alvo)
  }
  const rotasDoDia = db.rotas.filter((r) => r.data === dia)
  // Onda e doca são CALCULADAS a partir do dia inteiro, não da lista filtrada:
  // filtrar por cidade não pode reordenar o carregamento do galpão.
  const postos = ondasEDocas(rotasDoDia)
  const ondas = totalDeOndas(postos)
  const diasComRota = [...new Set(db.rotas.map((r) => r.data).filter(Boolean))].sort().reverse()

  const cidades = [...new Set(rotasDoDia.map((r) => r.cidade))].filter(Boolean).sort()
  const transportadoras = [...new Set(rotasDoDia.map((r) => r.transportadora))].filter(Boolean).sort()
  // As opções do veículo vêm de 🏷️ Opções de cadastro, e só de lá. Uma lista
  // fixa no código mostrava oito escolhas para uma operação que tem três, e
  // ainda repetia o mesmo veículo em duas grafias ("Vuc" e "VUC").
  const veiculosOpcoes = opcoesDeVeiculo(db)

  // Ordenação por qualquer coluna. O primeiro toque ordena crescente; o
  // segundo inverte. Só uma coluna manda por vez — ordenar por duas ao mesmo
  // tempo confunde mais do que ajuda em tabela operacional.
  const [ordem, setOrdem] = useState<{ campo: CampoOrdem; desc: boolean }>({
    campo: 'rotaExpedicao',
    desc: false,
  })
  const alternarOrdem = (campo: CampoOrdem) =>
    setOrdem((o) => (o.campo === campo ? { campo, desc: !o.desc } : { campo, desc: false }))

  /**
   * O valor que entra na comparação. Número e hora saem como NÚMERO, senão
   * '9' viria depois de '10' e '7:04' não se compararia com '11:20'.
   */
  const valorDaColuna = (r: Rota, campo: CampoOrdem): string | number => {
    switch (campo) {
      case 'motorista':
        return r.motoristaId ? (porMotorista.get(r.motoristaId)?.nome ?? '') : ''
      case 'km':
        return kmDaRota(r.km)
      case 'ocupacao':
        return kmDaRota(r.ocupacao)
      case 'dps': {
        const [h, m] = String(r.dps ?? '').split(':')
        return (Number(h) || 0) * 60 + (Number(m) || 0)
      }
      case 'onda':
        return postos.get(r.id)?.onda ?? 0
      case 'doca':
        return postos.get(r.id)?.doca ?? 0
      default:
        return r[campo] ?? ''
    }
  }

  /**
   * Cabeçalho que ordena. A seta mostra o estado: ↕ quando a coluna não manda,
   * ▲/▼ quando manda. Sem isso ninguém descobre que dá para clicar.
   */
  const Coluna = ({
    campo,
    alinhar = 'esquerda',
    children,
  }: {
    campo: CampoOrdem
    alinhar?: 'esquerda' | 'centro' | 'direita'
    children: ReactNode
  }) => {
    const ativa = ordem.campo === campo
    return (
      <th
        className={`px-2 py-2.5 ${
          alinhar === 'centro' ? 'text-center' : alinhar === 'direita' ? 'text-right' : ''
        }`}
      >
        <button
          onClick={() => alternarOrdem(campo)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-marca-texto ${
            ativa ? 'font-bold text-marca-texto' : ''
          }`}
          title={
            ativa
              ? ordem.desc
                ? 'Ordenado do maior para o menor — clique para inverter'
                : 'Ordenado do menor para o maior — clique para inverter'
              : 'Clique para ordenar por esta coluna'
          }
        >
          {children}
          <span className={ativa ? '' : 'text-slate-300'}>{ativa ? (ordem.desc ? '▼' : '▲') : '↕'}</span>
        </button>
      </th>
    )
  }

  const rotas = rotasDoDia
    .filter(
      (r) =>
        !busca ||
        r.rotaExpedicao.toLowerCase().includes(busca.toLowerCase()) ||
        r.rotaOriginal.toLowerCase().includes(busca.toLowerCase()) ||
        r.cidade.toLowerCase().includes(busca.toLowerCase()),
    )
    .filter((r) => !cidade || r.cidade === cidade)
    .filter((r) => !transportadora || r.transportadora === transportadora)
    .sort((a, b) => {
      const va = valorDaColuna(a, ordem.campo)
      const vb = valorDaColuna(b, ordem.campo)
      const c =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : // numeric: 'D9_AM1' vem antes de 'D10_AM1'; sensitivity 'base'
            // ignora acento e caixa, para Ituiutaba e ITUIUTABA não separarem.
            String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' })
      return ordem.desc ? -c : c
    })

  const semMotorista = rotas.filter((r) => !r.motoristaId).length

  // ---------- Direcionamento automático a partir da chamada ----------
  // Candidatos = quem respondeu "disponível" na chamada mais recente
  // (aberta tem prioridade). As rotas já direcionadas à mão são preservadas.
  const chamadaBase = db.chamadas
    .slice()
    .sort((a, b) =>
      a.status === b.status ? b.data.localeCompare(a.data) : a.status === 'aberta' ? -1 : 1,
    )[0]
  // A ordem da esteira manda: primeiro o PLANEJAMENTO da chamada é montado;
  // só então o direcionamento entra em cena, usando quem está no planejamento.
  const planejamentoDaChamada = chamadaBase
    ? db.planejamento.find((e) => e.chamadaId === chamadaBase.id)
    : undefined
  const candidatosChamada = planejamentoDaChamada
    ? motoristas.filter((m) => planejamentoDaChamada.motoristaIds.includes(m.id))
    : []

  const direcionarAutomatico = () => {
    const vagas = rotasDoDia.filter((r) => !r.motoristaId)
    // Rota FINALIZADA libera o motorista para uma nova; pendente segura.
    const comPendencia = new Set(
      rotasDoDia.filter((r) => r.motoristaId && !r.finalizadaEm).map((r) => r.motoristaId),
    )
    const livres = candidatosChamada.filter((m) => !comPendencia.has(m.id))
    const alocacoes = alocarMotoristasNasRotas(db, vagas, livres, parametrosAtuais(db))
    if (alocacoes.length === 0) {
      setAvisoAuto('⚠️ Nenhuma rota vaga com motorista disponível compatível — confira as travas nos ⚙️ Parâmetros da Programação.')
      return
    }
    if (!confirm(`Direcionar automaticamente ${alocacoes.length} rota(s) com quem está no planejamento do planejamento de ${formatarData(chamadaBase.data)}?`))
      return
    for (const a of alocacoes) salvarRota({ ...a.rota, motoristaId: a.motorista.id, finalizadaEm: null, resultadoFinalizacao: null })
    const sobraram = livres.length - alocacoes.length
    const emPreferida = alocacoes.filter((a) => a.preferida).length
    const semMotoristaAinda = vagas.length - alocacoes.length
    setAvisoAuto(
      `⚡ ${alocacoes.length} rota(s) direcionada(s) com quem está no planejamento do planejamento de ${formatarData(chamadaBase.data)}` +
        ` • ⭐ ${emPreferida} em cidade que o motorista prefere` +
        (semMotoristaAinda > 0 ? ` • ${semMotoristaAinda} rota(s) seguem sem motorista (ninguém elegível)` : '') +
        (sobraram > 0 ? ` • ${sobraram} motorista(s) de reserva` : ''),
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
    const direcionadas = rotasDoDia.filter((r) => r.motoristaId)
    if (direcionadas.length === 0) return
    if (!confirm(`Tirar o motorista de ${direcionadas.length} rota(s)? (as rotas continuam cadastradas)`)) return
    for (const r of direcionadas) salvarRota({ ...r, motoristaId: null, finalizadaEm: null, resultadoFinalizacao: null })
    setAvisoAuto('🧹 Direcionamentos limpos.')
  }

  /**
   * A DISPATCH encerra uma rota que o motorista não finalizou: fica
   * registrada como finalizada COM PENDÊNCIA (entregas que não saíram),
   * e o motorista é avisado na hora.
   */
  const finalizarPeloDispatcher = (r: Rota) => {
    const nome = r.motoristaId ? (porMotorista.get(r.motoristaId)?.nome ?? '') : ''
    if (!confirm(`Encerrar a rota ${r.rotaExpedicao} pelo Dispatcher? Ela fica registrada como PENDENTE (o motorista ${nome} não finalizou).`))
      return
    salvarRota({ ...r, finalizadaEm: new Date().toISOString(), resultadoFinalizacao: 'pendente' })
    if (r.motoristaId) {
      enviarNotificacao({
        motoristaId: r.motoristaId,
        titulo: `Rota ${r.rotaExpedicao} encerrada pelo Dispatcher`,
        mensagem: `⚠️ A rota ${r.rotaExpedicao} foi finalizada pelo Dispatcher com entregas pendentes. Qualquer dúvida, fale com o Dispatcher.`,
      })
    }
    setAvisoAuto(`🏁 Rota ${r.rotaExpedicao} encerrada como pendente.`)
  }

  /**
   * Encerra a operação do dia a qualquer momento: toda rota ainda aberta —
   * com motorista em campo ou sequer direcionada — fica registrada como
   * encerrada com pendência. O que o motorista finalizou continua entregue.
   */
  const encerrarRotasDoDia = () => {
    const abertas = rotasDoDia.filter((r) => !r.finalizadaEm)
    const entregues = rotasDoDia.filter((r) => r.finalizadaEm && r.resultadoFinalizacao !== 'pendente').length
    if (abertas.length === 0) {
      setAvisoAuto(`🏁 Todas as ${rotasDoDia.length} rota(s) já estão encerradas — ${entregues} entregues.`)
      return
    }
    const comMotorista = abertas.filter((r) => r.motoristaId).length
    const semMotoristaAinda = abertas.length - comMotorista
    if (
      !confirm(
        `Encerrar a operação do dia?\n\n` +
          `• ${comMotorista} rota(s) em andamento viram PENDENTES (o motorista não finalizou)\n` +
          `• ${semMotoristaAinda} rota(s) sem motorista ficam registradas como não realizadas\n` +
          `• ${entregues} já entregues continuam como estão`,
      )
    )
      return
    const agora = new Date().toISOString()
    for (const r of abertas) {
      salvarRota({ ...r, finalizadaEm: agora, resultadoFinalizacao: 'pendente' })
      if (r.motoristaId) {
        enviarNotificacao({
          motoristaId: r.motoristaId,
          titulo: `Rota ${r.rotaExpedicao} encerrada pelo Dispatcher`,
          mensagem: `⚠️ A rota ${r.rotaExpedicao} foi finalizada pelo Dispatcher com entregas pendentes. Qualquer dúvida, fale com o Dispatcher.`,
        })
      }
    }
    setAvisoAuto(
      `🏁 Dia encerrado: ${abertas.length} rota(s) marcadas como pendentes • ${entregues} entregues pelos motoristas.`,
    )
  }

  /** Apaga TODAS as rotas — para carregar a planilha de outra operação do zero. */
  const apagarTodasAsRotas = () => {
    if (rotasDoDia.length === 0) return
    if (
      !confirm(
        `Apagar TODAS as ${rotasDoDia.length} rota(s) cadastradas? Use para trocar de operação — depois é só importar a nova planilha.`,
      )
    )
      return
    for (const r of rotasDoDia) removerRota(r.id)
    setAvisoAuto('🗑️ Rotas apagadas — importe a planilha da nova operação.')
  }


  const tabela = (): Tabela => ({
    titulo: 'Rotas da operação',
    colunas: ['Cidade', 'Rota expedição', 'Rota original', 'Base', 'Motorista', 'Veículo', 'Km', 'DPS', 'Ocupação %', 'Transportadora', 'Onda', 'Doca'],
    // Ordenado por ONDA e DOCA: é a folha que vai para o galpão, e lá a
    // pergunta é "quem encosta agora", não "qual rota vem antes no alfabeto".
    linhas: [...rotas]
      .sort((a, b) => {
        const pa = postos.get(a.id)
        const pb = postos.get(b.id)
        if (!pa || !pb) return 0
        return pa.onda - pb.onda || pa.doca - pb.doca
      })
      .map((r) => [
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
        postos.get(r.id) ? `${postos.get(r.id)!.onda}ª` : '',
        postos.get(r.id)?.doca ?? '',
      ]),
  })

  const novaRota = () =>
    setEditando({
      id: uid(),
      data: dia,
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
  const SELETOR = 'rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-marca-texto'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🛣️ Rotas da operação</h1>
          <p className="text-sm text-slate-500">
            {rotasDoDia.length} rota(s) em {rotuloDia(dia)}
            {rotasDoDia.length > 0 && semMotorista > 0 && ` • ${semMotorista} sem motorista direcionado`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {chamadaBase && !planejamentoDaChamada && (
            // Sem planejamento ainda: a esteira manda montar a planejamento primeiro.
            <Link
              to={`/chamadas/${chamadaBase.id}`}
              className="rounded-lg bg-marca px-4 py-2 text-sm font-bold text-slate-900 hover:opacity-90"
            >
              📋 Fazer planejamento ({formatarData(chamadaBase.data)}) →
            </Link>
          )}
          {planejamentoDaChamada && candidatosChamada.length > 0 && semMotorista > 0 && (
            <Button variante="marca" onClick={direcionarAutomatico}>
              ⚡ Direcionar quem está no planejamento ({candidatosChamada.length})
            </Button>
          )}
          {rotasDoDia.length > 0 && (
            <Button
              variante="secundario"
              onClick={encerrarRotasDoDia}
              title="Encerrar a operação do dia — as rotas abertas ficam registradas como pendentes"
            >
              🏁 Encerrar dia
              {rotasDoDia.some((r) => !r.finalizadaEm)
                ? ` (${rotasDoDia.filter((r) => !r.finalizadaEm).length} aberta(s))`
                : ''}
            </Button>
          )}
          {rotasDoDia.some((r) => r.motoristaId) && (
            <Button variante="secundario" onClick={limparDirecionamentos}>🧹 Limpar</Button>
          )}
          {rotasDoDia.length > 0 && (
            <Button variante="secundario" onClick={apagarTodasAsRotas}>🗑️ Apagar todas</Button>
          )}
          <Button variante="secundario" onClick={() => exportarCSV(tabela())}>⬇️ CSV</Button>
          <Button variante="secundario" onClick={() => exportarExcel(tabela())}>⬇️ Excel</Button>
          <Button variante="secundario" onClick={() => exportarPDF(tabela())}>🖨️ PDF</Button>
          {/* A roteirização entra pelo planejamento; aqui só se ACRESCENTA
              uma rota avulsa depois que a planilha do dia já foi carregada. */}
          {rotasDoDia.length > 0 && (
            <Button variante="secundario" onClick={novaRota}>➕ Acrescentar rota</Button>
          )}
        </div>
      </div>

      {rotasDoDia.some((r) => !r.rotaExpedicao.trim()) && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          ⚠️ <strong>
            {rotasDoDia.filter((r) => !r.rotaExpedicao.trim()).length} rota(s) sem código de
            expedição
          </strong>{' '}
          — vieram de linhas que a leitura não conseguiu completar. Clique em{' '}
          <strong>⚠️ sem código</strong> na linha para preencher: sem o código não dá para
          direcionar motorista nem reimportar a planilha sem duplicar a rota.
        </p>
      )}
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

      {/* A roteirização é POR DIA: importada num dia, vale só nele. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Dia:</span>
        {diasComRota.length > 0 && (
          <Select
            value={diasComRota.includes(dia) ? dia : ''}
            onChange={(e) => trocarDia(e.target.value)}
            style={{ width: 'auto' }}
          >
            {!diasComRota.includes(dia) && <option value="">{rotuloDia(dia)} — sem rotas</option>}
            {diasComRota.map((d) => (
              <option key={d} value={d}>
                {rotuloDia(d)} ({db.rotas.filter((r) => r.data === d).length})
              </option>
            ))}
          </Select>
        )}
        <input
          type="date"
          value={dia}
          onChange={(e) => trocarDia(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-marca-texto"
        />
      </div>

      {rotasDoDia.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icone="🛣️"
            titulo="Nenhuma rota cadastrada"
            descricao="A roteirização do dia entra pelo planejamento: na Programação, use 🛣️ Importar rotas (planilha .xlsx ou colar) junto com o resumo do dia."
          />
          <div className="text-center">
            <Link to="/programacao">
              <Button variante="marca">📆 Ir para a Programação →</Button>
            </Link>
          </div>
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <Coluna campo="cidade">Cidade</Coluna>
                <Coluna campo="rotaExpedicao">Rota expedição</Coluna>
                <Coluna campo="rotaOriginal">Rota original</Coluna>
                <Coluna campo="base">Base</Coluna>
                <Coluna campo="motorista">🚚 Motorista</Coluna>
                <Coluna campo="veiculo">Veículo</Coluna>
                <Coluna campo="km" alinhar="direita">Km</Coluna>
                <Coluna campo="dps" alinhar="centro">DPS</Coluna>
                <Coluna campo="ocupacao" alinhar="direita">Ocupação %</Coluna>
                <Coluna campo="transportadora">Transportadora</Coluna>
                <Coluna campo="onda" alinhar="centro">🌊 Onda</Coluna>
                <Coluna campo="doca" alinhar="centro">🚪 Doca</Coluna>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rotas.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={CELULA}>{r.cidade}</td>
                  <td className={`${CELULA} font-bold text-slate-900`}>
                    {r.rotaExpedicao.trim() ? (
                      r.rotaExpedicao
                    ) : (
                      // Rota que entrou pela importação sem código (a planilha não
                      // trouxe a coluna). Sem ele não dá para direcionar nem
                      // reimportar sem duplicar, então ela pede para ser aberta.
                      <button
                        onClick={() => setEditando(r)}
                        className="rounded-lg border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-100"
                        title="Esta rota entrou sem código. Clique para completar."
                      >
                        ⚠️ sem código — completar
                      </button>
                    )}
                  </td>
                  <td className={`${CELULA} bg-marca-suave`}>
                    <div className="flex items-center justify-between gap-1.5">
                      <span>{r.rotaOriginal}</span>
                      <button
                        onClick={() => duplicarRota(r)}
                        className="rounded-full border border-slate-300 bg-white px-1.5 py-0.5 font-bold text-slate-600 hover:border-marca-texto hover:text-marca-texto"
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
                              ? `Encerrada pelo Dispatcher com PENDÊNCIA às ${new Date(r.finalizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                              : `Entregue — finalizada pelo motorista às ${new Date(r.finalizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                          }
                        >
                          {r.resultadoFinalizacao === 'pendente' ? '⚠️' : '✅'}
                        </span>
                      )}
                      {r.motoristaId && !r.finalizadaEm && (
                        <button
                          onClick={() => finalizarPeloDispatcher(r)}
                          className="rounded px-0.5 hover:bg-slate-200"
                          title="Encerrar pelo Dispatcher (fica registrada como pendente)"
                        >
                          🏁
                        </button>
                      )}
                    </div>
                  </td>
                  <td className={CELULA}>
                    <select
                      className={SELETOR}
                      value={nomeOficialVeiculo(r.veiculo, db)}
                      onChange={(e) => salvarRota({ ...r, veiculo: e.target.value })}
                      title="Trocar o tipo de veículo"
                    >
                      {opcoesDeVeiculo(db, r.veiculo).map((v) => (
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
                  <td className={`${CELULA} text-center`}>
                    {postos.get(r.id) ? (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                          postos.get(r.id)!.onda === 1
                            ? 'bg-marca text-navy'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                        title={`Onda ${postos.get(r.id)!.onda} de ${ondas}`}
                      >
                        {postos.get(r.id)!.onda}ª
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={`${CELULA} text-center font-bold text-slate-700`}>
                    {postos.get(r.id)?.doca ?? '—'}
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

      {/* Importação (modal compartilhado com a Programação) */}

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
              <Field label="Veículo">
                <Select
                  value={nomeOficialVeiculo(editando.veiculo, db)}
                  onChange={(e) => setEditando({ ...editando, veiculo: e.target.value })}
                >
                  {opcoesDeVeiculo(db, editando.veiculo).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
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
                <Link to={`/motoristas/${editando.motoristaId}`} className="font-semibold text-marca-texto hover:underline">
                  {porMotorista.get(editando.motoristaId)?.nome} →
                </Link>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variante="secundario" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button
                variante="marca"
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
