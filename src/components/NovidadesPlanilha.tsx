// Aviso com botão rápido: cidades e veículos que a planilha de rotas trouxe e
// o cadastro da operação ainda não tem. Um toque inclui; "todas" inclui de
// uma vez. Some sozinho quando não sobra nada — a lista vem do banco em
// tempo real, então cada inclusão já tira o item da tela.
//
// Aparece em dois lugares: na prévia da importação (antes de confirmar) e no
// topo da tela de Rotas (para o que já foi importado sem ninguém reparar).

import { salvarCidadeOperacao, salvarTipoOperacional, useDB } from '../core/db'
import { novidadesDaPlanilha } from '../core/novidades-planilha'

export function NovidadesPlanilha({ linhas }: { linhas: { cidade: string; veiculo: string }[] }) {
  const db = useDB()
  const { cidades, veiculos } = novidadesDaPlanilha(linhas, db)
  if (cidades.length === 0 && veiculos.length === 0) return null

  const grupo = (
    icone: string,
    titulo: string,
    itens: string[],
    incluir: (nome: string) => void,
  ) =>
    itens.length > 0 && (
      <div>
        <p className="mb-1.5 text-xs font-semibold text-amber-900">
          {icone} {titulo}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {itens.map((nome) => (
            <button
              key={nome}
              type="button"
              onClick={() => incluir(nome)}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              title="Incluir no cadastro da operação"
            >
              ➕ {nome}
            </button>
          ))}
          {itens.length > 1 && (
            <button
              type="button"
              onClick={() => itens.forEach(incluir)}
              className="rounded-lg bg-amber-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-amber-900"
            >
              ➕ Adicionar todas ({itens.length})
            </button>
          )}
        </div>
      </div>
    )

  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
      <p className="text-xs font-bold text-amber-900">
        🔎 A planilha trouxe o que ainda não está no cadastro da operação:
      </p>
      {grupo(
        '📍',
        `${cidades.length} cidade(s) fora da tela Cidades — sem elas o motorista não tem como marcar Prefiro/Posso:`,
        cidades,
        salvarCidadeOperacao,
      )}
      {grupo(
        '🚐',
        `${veiculos.length} veículo(s) fora de Opções — sem eles o cadastro do motorista não oferece a opção:`,
        veiculos,
        (nome) => salvarTipoOperacional('veiculo', nome),
      )}
    </div>
  )
}
