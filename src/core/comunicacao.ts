// Canais de comunicação com o motorista: WhatsApp, ligação e notificação in-app.

import type { Chamada, Planejamento, Motorista } from './types'
import { formatarDataLonga } from './dates'

function fone55(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '')
  return digitos.startsWith('55') ? digitos : `55${digitos}`
}

export function linkWhatsApp(m: Motorista, mensagem?: string): string {
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''
  return `https://wa.me/${fone55(m.telefone)}${texto}`
}

export function linkLigacao(m: Motorista): string {
  return `tel:+${fone55(m.telefone)}`
}

export function formatarTelefone(telefone: string): string {
  const d = telefone.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone
}

export function mensagemCobranca(m: Motorista, c: Chamada): string {
  return (
    `Olá, ${m.nome.split(' ')[0]}! 🚚\n\n` +
    `Ainda não recebemos sua resposta para a chamada *${c.titulo}*.\n\n` +
    `📅 ${formatarDataLonga(c.data)}\n` +
    `📦 Operação: ${c.operacao}\n` +
    `🕖 Horário: ${c.horarioInicio} às ${c.horarioFim}\n\n` +
    `Por favor, responda sua disponibilidade no app MLDisponibilidade. 🙏`
  )
}

export function mensagemPlanejamento(m: Motorista, e: Planejamento, c: Chamada | undefined): string {
  return (
    `Olá, ${m.nome.split(' ')[0]}! ✅\n\n` +
    `Você está no *planejamento*: *${e.nome}*\n\n` +
    `📅 ${formatarDataLonga(e.data)}\n` +
    (c ? `📦 Operação: ${c.operacao}\n🕖 Horário: ${c.horarioInicio} às ${c.horarioFim}\n` : '') +
    `\nQualquer imprevisto, avise o Dispatcher. Boa rota! 🚚📦`
  )
}

/** Texto consolidado do planejamento para colar no grupo do WhatsApp. */
export function textoPlanejamentoParaGrupo(e: Planejamento, c: Chamada | undefined, motoristas: Motorista[]): string {
  const lista = motoristas.map((m, i) => `${String(i + 1).padStart(2, '0')}. ${m.nome} — ${m.veiculo} (${m.cidade})`).join('\n')
  return (
    `📋 *${e.nome}*\n` +
    `📅 ${formatarDataLonga(e.data)}\n` +
    (c ? `📦 ${c.operacao} • 🕖 ${c.horarioInicio} às ${c.horarioFim}\n` : '') +
    `🚚 ${motoristas.length} motorista(s) no planejamento:\n\n${lista}`
  )
}
