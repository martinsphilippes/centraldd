// Papel da conta no sistema. O nome correto da função é DISPATCHER.
//
// Compatibilidade: até a renomeação, o papel era gravado no Firestore como
// 'coordenador'. Perfis antigos continuam válidos — tudo que LÊ o papel passa
// por `papelDe`, e tudo que ESCREVE já grava 'dispatcher'.

import type { Papel } from './types'

/** Nome antigo do papel, ainda gravado em perfis criados antes da renomeação. */
const LEGADO = 'coordenador'

/** Normaliza o valor gravado no perfil (aceita o nome antigo). */
export function papelDe(valor: string | null | undefined): Papel {
  return valor === 'motorista' ? 'motorista' : 'dispatcher'
}

/** true se o papel gravado dá acesso de dispatcher (inclui o nome antigo). */
export function ehPapelDispatcher(valor: string | null | undefined): boolean {
  return papelDe(valor) === 'dispatcher'
}

/** true se o pré-cadastro pediu acesso de dispatcher (aceita o nome antigo). */
export function pedeDispatcher(funcao?: string): boolean {
  return funcao === 'dispatcher' || funcao === LEGADO
}
