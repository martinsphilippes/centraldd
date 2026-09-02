// Regras do cadastro de motorista — valem para os DOIS formulários: o
// pré-cadastro que o motorista faz na tela de login e o cadastro que o
// Dispatcher faz em Motoristas → Novo. Uma regra só, num lugar só: quando
// os dois divergiam, o motorista cadastrado pelo Dispatcher entrava sem
// veículo e com a cidade escrita de qualquer jeito.

/** Só os dígitos do telefone — é assim que ele fica gravado. */
export function digitosTelefone(telefone: string): string {
  return telefone.replace(/\D/g, '')
}

/**
 * O primeiro campo obrigatório que está faltando, já como frase para a tela —
 * ou string vazia quando está tudo preenchido.
 *
 * A ordem segue a do formulário: reclamar do e-mail enquanto o nome está vazio
 * faria a pessoa corrigir de trás para frente.
 *
 * `email` e `veiculo` aceitam null quando o formulário NÃO os exige: e-mail é
 * opcional no cadastro pelo Dispatcher (acesso pode vir depois) e veículo não
 * se aplica a quem pede acesso de dispatcher.
 */
export function primeiroCampoVazio(d: {
  nome: string
  telefone: string
  cidade: string
  email?: string | null
  veiculo?: string | null
}): string {
  if (!d.nome.trim()) return 'Preencha o nome completo.'
  const digitos = digitosTelefone(d.telefone)
  if (!digitos) return 'Preencha o telefone de WhatsApp.'
  // DDD + número: 10 dígitos no fixo, 11 no celular. Telefone pela metade é o
  // mesmo que telefone nenhum na hora de chamar para a rota.
  if (digitos.length < 10) return 'O telefone está incompleto — informe o DDD e o número.'
  if (!d.cidade.trim()) return 'Informe a cidade.'
  if (d.email !== null && d.email !== undefined && !d.email.trim())
    return 'Preencha o e-mail, que será o login.'
  if (d.veiculo !== null && d.veiculo !== undefined && !d.veiculo)
    return 'Escolha o veículo.'
  return ''
}

/** Recado para cidade que não é município da lista. */
export const MENSAGEM_CIDADE_INVALIDA = 'Escolha a cidade na lista que aparece enquanto você digita.'

/** Recado para senha curta. */
export const MENSAGEM_SENHA_CURTA = 'A senha precisa ter pelo menos 6 caracteres.'
