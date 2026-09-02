// O que a planilha de rotas trouxe que o cadastro da operação ainda não tem.
//
// A planilha do Meli é a fonte da verdade sobre QUAIS cidades e QUAIS veículos
// a operação usa no dia. Cidade que está na rota e não está em Cidades não
// aparece para o motorista qualificar; veículo que está na rota e não está em
// Opções não entra no cadastro. Em vez de o Dispatcher descobrir isso depois
// e digitar à mão, o app aponta a diferença e deixa incluir com um toque.

import type { DB } from './types'
import { cidadesDoTexto } from './planilha'
import { normalizarTexto } from './texto'
import { mesmoVeiculo, nomeOficialVeiculo } from './veiculos'

export interface NovidadesPlanilha {
  /** Cidades das rotas que não estão na tela Cidades, como vieram na planilha. */
  cidades: string[]
  /**
   * Veículos das rotas que não estão em Opções, já na grafia que vai ser
   * gravada: "Utilitários" da planilha vira "Utilitário" quando esse é o
   * padrão do app — o plural da planilha não pode virar um segundo veículo.
   */
  veiculos: string[]
}

export function novidadesDaPlanilha(
  linhas: { cidade: string; veiculo: string }[],
  db: DB,
): NovidadesPlanilha {
  const cidadesCadastradas = new Set(db.cidades.map((c) => normalizarTexto(c.nome)))
  const cidades = new Map<string, string>()
  for (const linha of linhas)
    for (const c of cidadesDoTexto(linha.cidade)) {
      const chave = normalizarTexto(c)
      if (!chave || cidadesCadastradas.has(chave) || cidades.has(chave)) continue
      cidades.set(chave, c.trim())
    }

  // Só o que o Dispatcher CADASTROU conta como existente. Os padrões do app
  // (Utilitário/VUC) valem enquanto a lista está vazia, mas não estão
  // gravados — e é isso que se está conferindo aqui.
  const veiculosCadastrados = db.tipos.filter((t) => t.categoria === 'veiculo').map((t) => t.nome)
  const veiculos: string[] = []
  for (const linha of linhas) {
    const oficial = nomeOficialVeiculo(linha.veiculo, db)
    if (!oficial) continue
    if (veiculosCadastrados.some((v) => mesmoVeiculo(v, oficial))) continue
    if (veiculos.some((v) => mesmoVeiculo(v, oficial))) continue
    veiculos.push(oficial)
  }

  const ordenar = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
  return { cidades: [...cidades.values()].sort(ordenar), veiculos: veiculos.sort(ordenar) }
}
