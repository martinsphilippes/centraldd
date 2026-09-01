// O painel VIVO das docas.
//
// As ondas dizem o PLANO do dia: quem carrega em qual doca, e em que ordem.
// Este arquivo diz o AGORA: quem está encostado, quem já bateu a conferência
// e saiu, e quem é o próximo a ser chamado.
//
// A regra que move tudo: a doca só libera quando a conferência daquela rota
// BATE — todo pacote esperado apareceu na lista do motorista. Enquanto falta
// pacote, o motorista continua na doca resolvendo, e chamar o próximo só
// criaria fila em cima de quem ainda não saiu.
//
// A fila de cada doca é a coluna dela nas ondas: a rota da onda 1 sai, entra
// a da onda 2, depois a da onda 3.

import { compararConferencia } from './conferencia'
import { ondasEDocas, type PostoDeCarga } from './ondas'
import type { Conferencia, DB, Rota } from './types'

/** Em que pé está cada rota dentro da fila da doca. */
export type EstadoNaDoca =
  /** Já bateu a conferência e liberou a doca. */
  | 'saiu'
  /** Está encostado agora: é a vez dele. */
  | 'carregando'
  /** A doca vagou e ele é o próximo — precisa ser chamado. */
  | 'chamado'
  /** Ainda na fila, atrás de alguém. */
  | 'aguardando'

export interface RotaNaDoca {
  rota: Rota
  posto: PostoDeCarga
  estado: EstadoNaDoca
  /** A conferência dessa rota, quando existe. */
  conferencia?: Conferencia
  /** Quantos pacotes já bateram, para a barra de progresso da tela. */
  conferidos: number
  total: number
}

export interface SituacaoDoca {
  doca: number
  /** Quem está encostado agora (ninguém = doca livre). */
  carregando?: RotaNaDoca
  /** O próximo da fila, já chamado porque a doca vagou. */
  chamado?: RotaNaDoca
  /** A fila inteira dessa doca, em ordem de onda. */
  fila: RotaNaDoca[]
  /** true = todo mundo dessa doca já saiu. */
  livre: boolean
}

/**
 * A conferência de uma rota. O vínculo direto (rotaId) é o caminho normal;
 * sem ele, casa pelo CÓDIGO da rota dentro do mesmo dia.
 */
export function conferenciaDaRota(rota: Rota, conferencias: Conferencia[]): Conferencia | undefined {
  const direta = conferencias.find((c) => c.rotaId === rota.id)
  if (direta) return direta
  const expedicao = rota.rotaExpedicao.trim().toUpperCase()
  const original = rota.rotaOriginal.trim().toUpperCase()
  if (!expedicao && !original) return undefined
  return conferencias.find((c) => {
    if (c.data !== rota.data) return false
    const codigo = (c.origem?.rota ?? '').trim().toUpperCase()
    return !!codigo && (codigo === expedicao || codigo === original)
  })
}

/** A conferência dessa rota bateu? Sem conferência enviada, não bateu. */
export function conferenciaBateu(c: Conferencia | undefined): boolean {
  if (!c || c.conferidos === null) return false
  return compararConferencia(c.esperados, c.conferidos).bateu
}

/**
 * O estado de cada doca no dia.
 *
 * Percorre a fila da doca em ordem de onda: enquanto a conferência bate, a
 * rota já saiu. A PRIMEIRA que não bateu é quem está carregando. Se todas as
 * anteriores saíram e essa ainda nem tem conferência aberta, ela é a
 * "chamada" — a doca vagou e o Dispatcher precisa chamar o motorista.
 */
export function situacaoDasDocas(db: DB, data: string): SituacaoDoca[] {
  const rotasDoDia = db.rotas.filter((r) => r.data === data)
  const postos = ondasEDocas(rotasDoDia)
  const conferenciasDoDia = db.conferencias.filter((c) => c.data === data)

  const porDoca = new Map<number, RotaNaDoca[]>()
  for (const rota of rotasDoDia) {
    const posto = postos.get(rota.id)
    if (!posto) continue
    const conferencia = conferenciaDaRota(rota, conferenciasDoDia)
    const comparacao =
      conferencia && conferencia.conferidos !== null
        ? compararConferencia(conferencia.esperados, conferencia.conferidos)
        : null
    const item: RotaNaDoca = {
      rota,
      posto,
      estado: 'aguardando',
      conferencia,
      conferidos: comparacao?.conferidos ?? 0,
      total: comparacao?.total ?? conferencia?.esperados.length ?? 0,
    }
    const fila = porDoca.get(posto.doca) ?? []
    fila.push(item)
    porDoca.set(posto.doca, fila)
  }

  const saida: SituacaoDoca[] = []
  for (const [doca, fila] of porDoca) {
    fila.sort((a, b) => a.posto.onda - b.posto.onda)
    let jaAchouQuemEstaNaDoca = false
    for (const item of fila) {
      if (jaAchouQuemEstaNaDoca) {
        item.estado = 'aguardando'
        continue
      }
      if (conferenciaBateu(item.conferencia)) {
        item.estado = 'saiu'
        continue
      }
      // Primeiro que não bateu: é a vez dele. Sem conferência aberta ainda,
      // ele é o CHAMADO — a doca está vaga esperando ele encostar.
      item.estado = item.conferencia ? 'carregando' : 'chamado'
      jaAchouQuemEstaNaDoca = true
    }
    const naVez = fila.find((f) => f.estado === 'carregando' || f.estado === 'chamado')
    saida.push({
      doca,
      carregando: naVez?.estado === 'carregando' ? naVez : undefined,
      chamado: naVez?.estado === 'chamado' ? naVez : undefined,
      fila,
      livre: !naVez,
    })
  }
  return saida.sort((a, b) => a.doca - b.doca)
}

/** O estado de cada ROTA, para pintar a linha da tabela. */
export function estadoPorRota(db: DB, data: string): Map<string, EstadoNaDoca> {
  const mapa = new Map<string, EstadoNaDoca>()
  for (const d of situacaoDasDocas(db, data))
    for (const item of d.fila) mapa.set(item.rota.id, item.estado)
  return mapa
}

/** Cores de cada estado — as mesmas na tabela e no painel. */
export const CORES_DOCA: Record<EstadoNaDoca, { classe: string; rotulo: string; emoji: string }> = {
  saiu: {
    classe: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    rotulo: 'saiu',
    emoji: '✅',
  },
  carregando: {
    classe: 'border-marca bg-marca-suave text-marca-texto',
    rotulo: 'carregando',
    emoji: '🔶',
  },
  chamado: {
    classe: 'border-sky-300 bg-sky-50 text-sky-800',
    rotulo: 'chamar agora',
    emoji: '📢',
  },
  aguardando: {
    classe: 'border-slate-200 bg-white text-slate-500',
    rotulo: 'na fila',
    emoji: '⏳',
  },
}
