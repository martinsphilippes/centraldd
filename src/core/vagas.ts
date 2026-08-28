// Frota do dia: quantas vagas existem POR TIPO DE VEÍCULO e quem ocupa cada uma.
//
// O limite de disponíveis (limites.ts) responde "quantas pessoas cabem no dia".
// Aqui a pergunta é outra e mais fina: "cabem quantas de CADA veículo". Se o
// modelo do dia tem 47 Utilitário e 2 VUC, não adianta o planejamento levar 8
// motoristas de VUC — só existem duas possibilidades de trabalho para eles.
//
// A segunda parte é o RODÍZIO: quando um veículo tem mais gente que vaga, quem
// está há mais tempo sem trabalhar entra primeiro. Assim os motoristas de um
// veículo escasso trabalham em dias alternados, em vez de sempre os mesmos.

import type { DB, Motorista, ParametrosAlocacao } from './types'
import { normalizarTexto } from './texto'
import { parseEquivalencias } from './alocacao'

export interface VagaVeiculo {
  /** Nome do veículo como aparece no modelo (ex.: 'VUC', 'Utilitário', '3/4'). */
  tipo: string
  vagas: number
}

export interface FrotaDoDia {
  vagas: VagaVeiculo[]
  /** Vagas sem veículo definido — servem para qualquer motorista. */
  livres: number
  total: number
  /** De onde veio a frota ('' = o dia não tem modelo, programação nem rotas). */
  fonte: string
  /**
   * Aviso quando o TOTAL ROTAS digitado à mão não bate com a soma por veículo.
   * O detalhe por veículo é a informação mais específica, então ele manda — mas
   * a divergência aparece na tela para o Dispatcher acertar o modelo.
   */
  divergencia: string
}

const num = (s: string | undefined) => Number(String(s ?? '').replace(/\D/g, '')) || 0

function somar(mapa: Map<string, VagaVeiculo>, tipo: string, qtd: number) {
  const nome = (tipo ?? '').trim()
  if (!nome || qtd <= 0) return
  const chave = normalizarTexto(nome)
  const atual = mapa.get(chave)
  if (atual) atual.vagas += qtd
  else mapa.set(chave, { tipo: nome, vagas: qtd })
}

/** Do maior grupo para o menor — o painel fica legível sem ordenar na tela. */
function ordenadas(mapa: Map<string, VagaVeiculo>): VagaVeiculo[] {
  return [...mapa.values()].sort((a, b) => b.vagas - a.vagas || a.tipo.localeCompare(b.tipo, 'pt-BR'))
}

function porVeiculoDeLista(itens: { veiculo: string }[]): { mapa: Map<string, VagaVeiculo>; livres: number } {
  const mapa = new Map<string, VagaVeiculo>()
  let livres = 0
  for (const i of itens) {
    if ((i.veiculo ?? '').trim()) somar(mapa, i.veiculo, 1)
    else livres++
  }
  return { mapa, livres }
}

/**
 * A frota planejada para a data, na mesma ordem de fontes do limite do dia:
 * resumo do dia (o modelo que o Dispatcher edita) → programação do Meli →
 * roteirização carregada. Editou o modelo, a frota muda na hora.
 */
export function frotaDoDia(db: DB, data: string): FrotaDoDia {
  const vazia: FrotaDoDia = { vagas: [], livres: 0, total: 0, fonte: '', divergencia: '' }

  const resumo = db.resumos.find((r) => r.id === data)
  if (resumo) {
    const mapa = new Map<string, VagaVeiculo>()
    let am = 0
    for (const t of resumo.transportadoras) {
      somar(mapa, 'Utilitário', num(t.utilitarios))
      somar(mapa, 'VUC', num(t.vuc))
      am += num(t.utilitarios) + num(t.vuc)
    }
    for (const m of resumo.mm) somar(mapa, m.tipo, num(m.quantidade))
    // O TOTAL ROTAS digitado à mão só acrescenta: a diferença vira vaga livre,
    // porque um número solto não diz de que veículo ele é.
    const manual = num(resumo.totalRotas)
    const livres = manual > am ? manual - am : 0
    const divergencia =
      manual > 0 && manual < am
        ? `o TOTAL ROTAS informado à mão (${manual}) é menor que a soma por veículo (${am}) — vale o detalhe por veículo`
        : ''
    const vagas = ordenadas(mapa)
    const total = vagas.reduce((s, v) => s + v.vagas, 0) + livres
    if (total > 0) return { vagas, livres, total, fonte: 'resumo do dia', divergencia }
  }

  const daProgramacao = db.programacao.filter((p) => p.data === data)
  if (daProgramacao.length > 0) {
    const { mapa, livres } = porVeiculoDeLista(daProgramacao)
    return {
      vagas: ordenadas(mapa),
      livres,
      total: daProgramacao.length,
      fonte: 'programação do Meli',
      divergencia: '',
    }
  }

  const rotasDoDia = db.rotas.filter((r) => r.data === data)
  if (rotasDoDia.length > 0) {
    const { mapa, livres } = porVeiculoDeLista(rotasDoDia)
    return {
      vagas: ordenadas(mapa),
      livres,
      total: rotasDoDia.length,
      fonte: 'roteirização carregada',
      divergencia: '',
    }
  }

  return vazia
}

/**
 * O veículo do motorista serve para a vaga? Compara sem acento nem caixa
 * ('Utilitario' = 'Utilitário') e respeita as equivalências parametrizadas
 * (ex.: 'VUC = HR, Van' deixa quem tem HR ocupar vaga de VUC).
 */
export function serveNaVaga(tipoVaga: string, veiculo: string, p: ParametrosAlocacao): boolean {
  return testeDeVaga(p)(tipoVaga, veiculo)
}

/**
 * Monta o teste uma vez só: as equivalências são lidas do texto parametrizado,
 * e isso roda para cada motorista × cada vaga — parsear a cada chamada custaria
 * caro num dia de 60 motoristas.
 */
function testeDeVaga(p: ParametrosAlocacao): (tipoVaga: string, veiculo: string) => boolean {
  const equivalencias = parseEquivalencias(p.equivalenciasVeiculo)
  return (tipoVaga, veiculo) => {
    const vaga = normalizarTexto(tipoVaga)
    const meu = normalizarTexto(veiculo)
    if (!meu) return false
    if (vaga === meu) return true
    return equivalencias.get(vaga)?.has(meu) ?? false
  }
}

/* ────────────────────────── rodízio por veículo ────────────────────────── */

export interface UltimoTrabalho {
  /** Última data em que o motorista entrou num planejamento ou teve rota ('' = nunca). */
  ultimo: string
  /** Quantos dias ele trabalhou dentro da janela olhada. */
  vezes: number
}

/**
 * Quando cada motorista trabalhou pela última vez ANTES do dia planejado.
 * Vale tanto quem entrou no planejamento quanto quem recebeu rota — os dois
 * significam "esse já teve a vez dele".
 */
export function historicoDeTrabalho(db: DB, data: string, desde = ''): Map<string, UltimoTrabalho> {
  const mapa = new Map<string, Set<string>>()
  const marcar = (id: string | null | undefined, dia: string) => {
    if (!id || !dia || dia >= data || dia < desde) return
    const dias = mapa.get(id) ?? new Set<string>()
    dias.add(dia)
    mapa.set(id, dias)
  }
  for (const e of db.planejamento) for (const id of e.motoristaIds) marcar(id, e.data)
  for (const r of db.rotas) marcar(r.motoristaId, r.data)

  const saida = new Map<string, UltimoTrabalho>()
  for (const [id, dias] of mapa) {
    const ordenadas = [...dias].sort()
    saida.set(id, { ultimo: ordenadas[ordenadas.length - 1] ?? '', vezes: ordenadas.length })
  }
  return saida
}

/**
 * Comparador do rodízio: quem está há mais tempo sem trabalhar vem primeiro
 * (nunca trabalhou vem na frente de todos), desempatando por quem trabalhou
 * menos dias na janela. É o que faz a frota alternar em dia de vaga curta.
 */
export function compararRodizio(a: string, b: string, hist: Map<string, UltimoTrabalho>): number {
  const ha = hist.get(a)
  const hb = hist.get(b)
  const ua = ha?.ultimo ?? ''
  const ub = hb?.ultimo ?? ''
  if (ua !== ub) return ua.localeCompare(ub)
  return (ha?.vezes ?? 0) - (hb?.vezes ?? 0)
}

/* ─────────────────────── distribuição nas vagas ─────────────────────── */

export interface LinhaFrota {
  tipo: string
  vagas: number
  /** Quantos motoristas já estão ocupando vagas deste veículo. */
  ocupadas: number
  /** Candidatos disponíveis que servem para este veículo. */
  candidatos: number
}

export interface DistribuicaoFrota {
  escolhidos: Motorista[]
  espera: Motorista[]
  linhas: LinhaFrota[]
  livres: number
  livresOcupadas: number
  /** Motoristas cujo veículo o dia não pede (ficam na espera, mas por outro motivo). */
  semVaga: Motorista[]
  total: number
  fonte: string
  /** false = o dia não tem frota conhecida; quem chamou deve cair na regra antiga. */
  aplicada: boolean
}

/** Tipos ordenados do mais disputado para o menos — o apertado escolhe antes. */
function ordemDeEscolha(
  frota: FrotaDoDia,
  candidatos: Motorista[],
  serve: (tipoVaga: string, veiculo: string) => boolean,
) {
  return frota.vagas
    .map((v) => ({
      ...v,
      candidatos: candidatos.filter((m) => serve(v.tipo, m.veiculo)).length,
    }))
    .sort((a, b) => a.candidatos / Math.max(1, a.vagas) - b.candidatos / Math.max(1, b.vagas))
}

/**
 * Distribui a lista JÁ ORDENADA por prioridade nas vagas do dia.
 *
 * Cada veículo só leva quantos couberem nas vagas dele; o excedente vai para a
 * fila de espera com a posição preservada. As vagas livres (sem veículo
 * definido no modelo) fecham o restante, para qualquer um.
 */
export function distribuirPorFrota(
  frota: FrotaDoDia,
  ordenados: Motorista[],
  meta: number,
  p: ParametrosAlocacao,
): DistribuicaoFrota {
  const base = {
    linhas: [] as LinhaFrota[],
    livres: frota.livres,
    livresOcupadas: 0,
    semVaga: [] as Motorista[],
    total: frota.total,
    fonte: frota.fonte,
  }
  if (frota.total === 0) {
    return {
      ...base,
      escolhidos: ordenados.slice(0, meta),
      espera: ordenados.slice(meta),
      aplicada: false,
    }
  }

  const serve = testeDeVaga(p)
  const dentro = new Set<string>()
  const linhas: LinhaFrota[] = []
  let cabemAinda = Math.min(meta, frota.total)

  for (const v of ordemDeEscolha(frota, ordenados, serve)) {
    let ocupadas = 0
    for (const m of ordenados) {
      if (ocupadas >= v.vagas || cabemAinda <= 0) break
      if (dentro.has(m.id) || !serve(v.tipo, m.veiculo)) continue
      dentro.add(m.id)
      ocupadas++
      cabemAinda--
    }
    linhas.push({ tipo: v.tipo, vagas: v.vagas, ocupadas, candidatos: v.candidatos })
  }

  // Vaga livre é coringa: fecha com quem ainda não entrou, na ordem.
  let livresOcupadas = 0
  for (const m of ordenados) {
    if (livresOcupadas >= frota.livres || cabemAinda <= 0) break
    if (dentro.has(m.id)) continue
    dentro.add(m.id)
    livresOcupadas++
    cabemAinda--
  }

  const sobra = ordenados.filter((m) => !dentro.has(m.id))
  const temVagaDoTipo = (m: Motorista) => frota.vagas.some((v) => serve(v.tipo, m.veiculo))
  return {
    ...base,
    escolhidos: ordenados.filter((m) => dentro.has(m.id)),
    espera: sobra,
    linhas: linhas.sort((a, b) => b.vagas - a.vagas || a.tipo.localeCompare(b.tipo, 'pt-BR')),
    livresOcupadas,
    semVaga: frota.livres > 0 ? [] : sobra.filter((m) => !temVagaDoTipo(m)),
    aplicada: true,
  }
}

/**
 * Confere uma seleção FEITA À MÃO contra a frota: quantas vagas de cada veículo
 * estão ocupadas e quem ficou fora do que o dia pede. É o que alimenta o painel
 * ao vivo enquanto o Dispatcher inclui e tira gente.
 */
export function ocupacaoDaFrota(
  frota: FrotaDoDia,
  selecionados: Motorista[],
  p: ParametrosAlocacao,
): { linhas: LinhaFrota[]; livres: number; livresOcupadas: number; excedentes: Motorista[]; total: number } {
  const serve = testeDeVaga(p)
  const prioridade = ordemDeEscolha(frota, selecionados, serve)
  const restante = new Map(frota.vagas.map((v) => [normalizarTexto(v.tipo), v.vagas]))
  const ocupadas = new Map<string, number>()
  const excedentes: Motorista[] = []
  let livresOcupadas = 0

  for (const m of selecionados) {
    // Entra na vaga mais apertada que ainda aceita o veículo dele.
    const alvo = prioridade.find(
      (v) => (restante.get(normalizarTexto(v.tipo)) ?? 0) > 0 && serve(v.tipo, m.veiculo),
    )
    if (alvo) {
      const chave = normalizarTexto(alvo.tipo)
      restante.set(chave, (restante.get(chave) ?? 0) - 1)
      ocupadas.set(chave, (ocupadas.get(chave) ?? 0) + 1)
    } else if (livresOcupadas < frota.livres) {
      livresOcupadas++
    } else {
      excedentes.push(m)
    }
  }

  return {
    linhas: frota.vagas.map((v) => ({
      tipo: v.tipo,
      vagas: v.vagas,
      ocupadas: ocupadas.get(normalizarTexto(v.tipo)) ?? 0,
      candidatos: selecionados.filter((m) => serve(v.tipo, m.veiculo)).length,
    })),
    livres: frota.livres,
    livresOcupadas,
    excedentes,
    total: frota.total,
  }
}
