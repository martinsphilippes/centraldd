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
 * Domingo de Páscoa do ano (algoritmo de Gauss/Computus, calendário
 * gregoriano). É dele que saem os feriados móveis.
 */
function domingoDePascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somarDias(d: Date, dias: number): Date {
  const novo = new Date(d)
  novo.setDate(novo.getDate() + dias)
  return novo
}

/** Feriados nacionais fixos, no formato MM-DD. */
const FIXOS = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra (nacional desde a Lei 14.759/2023)
  '12-25', // Natal
] as const

const cachePorAno = new Map<number, Set<string>>()

/**
 * Feriados do ano — sem cadastro nenhum, porque feriado é regra e não escolha
 * da operação.
 *
 * Entram os nove fixos em lei, a Sexta-feira Santa e o Carnaval (segunda e
 * terça). O Carnaval não é feriado nacional na lei, é ponto facultativo — mas
 * entra porque a entrega para, e o dono pediu que contasse.
 *
 * Quarta-feira de Cinzas fica de fora: costuma ser meio expediente, e quando
 * pesa de verdade a regra do "faltou gente" a marca sozinha.
 */
export function feriadosNacionais(ano: number): Set<string> {
  const emCache = cachePorAno.get(ano)
  if (emCache) return emCache
  const pascoa = domingoDePascoa(ano)
  const datas = new Set(FIXOS.map((md) => `${ano}-${md}`))
  datas.add(iso(somarDias(pascoa, -2))) // Sexta-feira Santa
  datas.add(iso(somarDias(pascoa, -48))) // segunda de Carnaval
  datas.add(iso(somarDias(pascoa, -47))) // terça de Carnaval
  cachePorAno.set(ano, datas)
  return datas
}

/** A data é feriado nacional? */
export function ehFeriado(data: string): boolean {
  const ano = Number(data.slice(0, 4))
  if (!Number.isFinite(ano)) return false
  return feriadosNacionais(ano).has(data)
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
  // As duas fontes contam: quem respondeu a chamada e quem marcou na tela de
  // Disponibilidade. Só a primeira faria um dia inteiro marcado à mão parecer
  // que faltou gente — e um dia difícil inventado distorce crédito e
  // fidelidade da frota toda.
  const disponiveis = new Set([
    ...db.respostas
      .filter((r) => r.chamadaId === chamada.id && STATUS_DISPONIVEIS.includes(r.status))
      .map((r) => r.motoristaId),
    ...disponiveisEm(db, data),
  ]).size
  return disponiveis < chamada.qtdNecessaria
}

/** Domingo, feriado nacional ou dia em que faltou gente. */
export function ehDiaDificil(db: DB, data: string): boolean {
  return ehDomingo(data) || ehFeriado(data) || faltouGente(db, data)
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
  const dificeis = janela.filter((d) => ehDiaDificil(db, d))
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
): number {
  const datas = janelaDeDatas(ate, Math.max(1, janelaDias))
  // Só contam dias em que a operação existiu: dia sem rota nenhuma não é
  // falta de ninguém.
  const comOperacao = datas.filter((d) => db.rotas.some((r) => r.data === d))
  if (comOperacao.length === 0) return 0
  let possivel = 0
  let presente = 0
  for (const d of comOperacao) {
    const peso = ehDiaDificil(db, d) ? 2 : 1
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
): Map<string, number> {
  const datas = janelaDeDatas(ate, Math.max(1, janelaDias))
  const comOperacao = datas.filter((d) => db.rotas.some((r) => r.data === d))
  const saida = new Map<string, number>()
  if (comOperacao.length === 0) return saida
  let possivel = 0
  const presencas = new Map<string, number>()
  for (const d of comOperacao) {
    const peso = ehDiaDificil(db, d) ? 2 : 1
    possivel += peso
    for (const id of disponiveisEm(db, d)) presencas.set(id, (presencas.get(id) ?? 0) + peso)
  }
  if (possivel <= 0) return saida
  for (const [id, n] of presencas) saida.set(id, n / possivel)
  return saida
}
