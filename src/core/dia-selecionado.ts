// O dia que o Dispatcher está trabalhando na Programação.
//
// Fica fora do componente porque a tela é desmontada ao navegar: guardado só
// no estado do React, voltar de outra tela zerava a escolha e a Programação
// pulava para HOJE — dando a impressão de que o modelo do dia seguinte havia
// sumido, quando ele estava salvo o tempo todo.
//
// Vale para a sessão do aparelho (sessionStorage): reabrir o app começa do
// dia com trabalho feito, mas ir e voltar entre telas preserva a escolha.

const CHAVE = 'centraldd:dia-programacao'

export function lerDiaProgramacao(): string {
  try {
    return sessionStorage.getItem(CHAVE) ?? ''
  } catch {
    return ''
  }
}

export function gravarDiaProgramacao(data: string) {
  try {
    if (data) sessionStorage.setItem(CHAVE, data)
    else sessionStorage.removeItem(CHAVE)
  } catch {
    // Aparelho sem sessionStorage: a escolha vale só enquanto a tela vive.
  }
}
