// Dia difícil, crédito e fidelidade.
//
// O problema que isto resolve: quem só aparece quando o dia é bom acabava
// disputando vaga de igual para igual com quem segura domingo e feriado. E
// quem ficou disponível num dia difícil mas NÃO rodou (porque havia mais
// gente que rota) saía sem nada — nem trabalho, nem vantagem depois.
//
// São dois mecanismos, de propósito separados:
//
//  1. CRÉDITO — memória curta, de uma semana. Ficou disponível num dia
//     difícil e não rodou? Fica com um crédito na mão e passa na frente no
//     próximo dia fraco. Ao rodar num dia fraco, o crédito é GASTO e a pessoa
//     volta para o fim da fila. É isso que faz o segundo dia fraco da semana
//     cair para quem já rodou no domingo, sem ninguém precisar dizer
//     "primeiro dia" e "segundo dia".
//
//  2. FIDELIDADE — memória longa. Com que frequência a pessoa esteve
//     disponível na janela, contando dia difícil em dobro. Vale em QUALQUER
//     dia, não só nos fracos.
//
// Por que a fila em vez de dois pesos: os grupos nunca têm o tamanho das
// vagas. Se 20 ficaram de fora no domingo e o dia fraco tem 15 vagas, 5
// continuam devendo. Com dois pesos fixos esses 5 disputariam de igual para
// igual com quem já rodou; com fila, eles seguem na frente até serem pagos.

import type { DB, ParametrosAlocacao } from './types'
import { STATUS_DISPONIVEIS } from './constants'
import { parseISODate } from './dates'

/** Domingo é sempre dia difícil, por definição da operação. */
export function ehDomingo(data: string): boolean {
  const d = parseISODate(data)
  return !Number.isNaN(d.getTime()) && d.getDay() === 0
}

/**
 * Feriados cadastrados na parametrização, um por linha. Aceita a data cheia
 * ('2026-12-25') e o dia/mês ('25/12'), que vale todo ano — é o formato que
 * evita recadastrar Natal e Ano-Novo toda virada.
 */
export function ehFeriado(data: string, p: ParametrosAlocacao): boolean {
  const linhas = (p.feriados ?? '')
    .split(/[\n,;]/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (linhas.length === 0) return false
  const [ano, mes, dia] = data.split('-')
  const diaMes = `${dia}/${mes}`
  return linhas.some((l) => {
    const limpo = l.replace(/\s/g, '')
    if (limpo === data) return true
    if (/^\d{2}\/\d{2}$/.test(limpo)) return limpo === diaMes
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpo)) {
      const [d, m, a] = limpo.split('/')
      return `${a}-${m}-${d}` === `${ano}-${mes}-${dia}`
    }
    return false
  })
}

/**
 * Faltou gente no dia? Duas evidências valem:
 *  - alguma rota do dia ficou SEM motorista direcionado;
 *  - a chamada pediu mais gente do que apareceu disponível.
 * A segunda pega o dia em que todas as rotas foram cobertas no sufoco.
 */
export function faltouGente(db: DB, data: string): boolean {
  const rotas = db.rotas.filter((r) => r.data === data)
  if (rotas.length > 0 && rotas.some((r) => !r.motoristaId)) return true
  const chamada = db.chamadas.find((c) => c.data === data)
  if (!chamada || chamada.qtdNecessaria <= 0) return false
  const disponiveis = db.respostas.filter(
    (r) => r.chamadaId === chamada.id && STATUS_DISPONIVEIS.includes(r.status),
  ).length
  return disponiveis < chamada.qtdNecessaria
}

/** Domingo, feriado cadastrado ou dia em que faltou gente. */
export function ehDiaDificil(db: DB, data: string, p: ParametrosAlocacao): boolean {
  return ehDomingo(data) || ehFeriado(data, p) || faltouGente(db, data)
}

/** Quem rodou no dia (tinha rota direcionada para ele). */
function rodaramEm(db: DB, data: string): Set<string> {
  const ids = new Set<string>()
  for (const r of db.rotas) if (r.data === data && r.motoristaId) ids.add(r.motoristaId)
  return ids
}

/** Quem marcou disponível no dia. */
function disponiveisEm(db: DB, data: string): Set<string> {
  const ids = new Set<string>()
  for (const a of db.disponibilidade)
    if (a.data === data && STATUS_DISPONIVEIS.includes(a.status)) ids.add(a.motoristaId)
  return ids
}

/** As datas dos últimos `dias` dias ANTES de `ate` (mais recente primeiro). */
function janelaDeDatas(ate: string, dias: number): string[] {
  const fim = parseISODate(ate)
  if (Number.isNaN(fim.getTime())) return []
  const datas: string[] = []
  for (let i = 1; i <= dias; i++) {
    const d = new Date(fim)
    d.setDate(d.getDate() - i)
    datas.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return datas
}

/** Dia fraco = tem menos rotas do que o limiar configurado. */
function diaFraco(db: DB, data: string, p: ParametrosAlocacao): boolean {
  if (p.limiarRotasPrioridadeDomingo <= 0) return false
  return db.rotas.filter((r) => r.data === data).length < p.limiarRotasPrioridadeDomingo
}

/**
 * Quem chega ao dia `data` com crédito na mão.
 *
 * Ganha: esteve disponível num dia difícil da última semana e não rodou nele.
 * Perde: depois desse dia difícil, já rodou em algum dia FRACO — o crédito
 * existe para furar a fila do dia fraco, então é ali que ele se gasta.
 */
export function comCreditoDeDiaDificil(
  db: DB,
  data: string,
  p: ParametrosAlocacao,
): Set<string> {
  const credito = new Set<string>()
  if (p.pesoPrioridadeDomingo <= 0) return credito
  // Uma semana: o crédito não acumula de mês em mês, senão um punhado de
  // pessoas travaria a fila para o resto da frota.
  const janela = janelaDeDatas(data, 7)
  const dificeis = janela.filter((d) => ehDiaDificil(db, d, p))
  for (const dificil of dificeis) {
    const disponiveis = disponiveisEm(db, dificil)
    const rodaram = rodaramEm(db, dificil)
    for (const id of disponiveis) {
      if (rodaram.has(id)) continue
      // Já foi pago? Rodou em algum dia fraco DEPOIS do dia difícil.
      const pago = janela.some(
        (d) => d > dificil && diaFraco(db, d, p) && rodaramEm(db, d).has(id),
      )
      if (!pago) credito.add(id)
    }
  }
  return credito
}

/**
 * Fidelidade: com que frequência a pessoa esteve disponível na janela.
 *
 * Dia difícil conta EM DOBRO, dos dois lados da conta — é o que separa quem
 * aparece sempre de quem aparece só quando o dia é bom. Devolve 0..1, para o
 * peso da parametrização multiplicar direto.
 */
export function fidelidadeDe(
  db: DB,
  motoristaId: string,
  ate: string,
  janelaDias: number,
  p: ParametrosAlocacao,
): number {
  const datas = janelaDeDatas(ate, Math.max(1, janelaDias))
  // Só contam dias em que a operação existiu: dia sem rota nenhuma não é
  // falta de ninguém.
  const comOperacao = datas.filter((d) => db.rotas.some((r) => r.data === d))
  if (comOperacao.length === 0) return 0
  let possivel = 0
  let presente = 0
  for (const d of comOperacao) {
    const peso = ehDiaDificil(db, d, p) ? 2 : 1
    possivel += peso
    if (disponiveisEm(db, d).has(motoristaId)) presente += peso
  }
  return possivel > 0 ? presente / possivel : 0
}

/** Fidelidade de todos de uma vez — evita recalcular a janela por motorista. */
export function fidelidadeDeTodos(
  db: DB,
  ate: string,
  janelaDias: number,
  p: ParametrosAlocacao,
): Map<string, number> {
  const datas = janelaDeDatas(ate, Math.max(1, janelaDias))
  const comOperacao = datas.filter((d) => db.rotas.some((r) => r.data === d))
  const saida = new Map<string, number>()
  if (comOperacao.length === 0) return saida
  let possivel = 0
  const presencas = new Map<string, number>()
  for (const d of comOperacao) {
    const peso = ehDiaDificil(db, d, p) ? 2 : 1
    possivel += peso
    for (const id of disponiveisEm(db, d)) presencas.set(id, (presencas.get(id) ?? 0) + peso)
  }
  if (possivel <= 0) return saida
  for (const [id, n] of presencas) saida.set(id, n / possivel)
  return saida
}
