// Campo de cidade com sugestão, conferido contra a lista oficial do IBGE.
//
// Por que não deixar digitar livre: a cidade decide preferência, rodízio e
// relatório. "Guarulhos", "guarulhos " e "Guarulos" viravam três cidades
// diferentes no banco, e ninguém percebia até o relatório sair errado.
//
// O que fica GRAVADO é só o nome oficial ("Guarulhos"), sem a UF — é assim que
// o resto do app compara cidade de motorista com cidade de rota. A UF aparece
// só na lista, para separar as cidades homônimas (existem 5 "Bom Jesus" no
// Brasil). E é o nome OFICIAL mesmo quando a pessoa digita "guarulhos" por
// inteiro em vez de clicar na lista — o campo troca pela grafia da lista.
//
// A ordem das sugestões está em core/sugestao-cidade.ts: cidades da operação
// primeiro, depois quem começa com o texto, nome mais curto na frente.

import { useEffect, useRef, useState } from 'react'
import type { CidadeBR } from '../../core/cidades-brasil'
import {
  ehCidadeDaOperacao,
  nomeOficialCidade,
  sugerirCidades,
} from '../../core/sugestao-cidade'
import { carregarCidadesOperacaoPublicas } from '../../core/firebase'
import { Input } from '../../components/ui'

export function CampoCidade({
  valor,
  onChange,
}: {
  valor: string
  /**
   * Devolve o texto (já na grafia oficial quando é um município) e se ele é
   * um município de verdade — quem chama decide o que fazer.
   */
  onChange: (cidade: string, valida: boolean) => void
}) {
  // A lista dos 5.570 municípios só é carregada quando o cadastro abre — não
  // pesa no app de quem só vai fazer login.
  const [cidades, setCidades] = useState<CidadeBR[]>([])
  // Cidades que a operação atende: vão para o topo da lista. Sem rede (ou
  // sem a regra pública publicada), fica vazio e a ordem é a geral.
  const [cidadesOperacao, setCidadesOperacao] = useState<string[]>([])
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    void import('../../core/cidades-brasil').then((m) => {
      if (!vivo) return
      const lista = m.cidadesDoBrasil()
      setCidades(lista)
      // A lista chegou depois de alguém já ter digitado: reavalia agora, senão
      // o cadastro seguiria com uma cidade nunca conferida.
      if (valor.trim() !== '') {
        const oficial = nomeOficialCidade(valor, lista)
        onChange(oficial ?? valor, oficial !== null)
      }
    })
    void carregarCidadesOperacaoPublicas().then((nomes) => {
      if (vivo) setCidadesOperacao(nomes)
    })
    return () => {
      vivo = false
    }
  }, [])

  // Clique fora fecha a lista.
  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [])

  const sugestoes = sugerirCidades(valor, cidades, cidadesOperacao)
  const exata = cidadeExiste(valor, cidades)

  const aoDigitar = (texto: string) => {
    const oficial = nomeOficialCidade(texto, cidades)
    // Troca pela grafia oficial só quando não há espaço no fim: "Campinas "
    // é alguém a caminho de "Campinas do Sul", e trocar agora engoliria o
    // espaço. Quem parar aí é acertado ao sair do campo (aoSair).
    const trocar = oficial !== null && texto === texto.trimEnd()
    // Lista ainda não carregou: aceita o que foi digitado (ver cidadeExiste).
    onChange(trocar ? oficial : texto, oficial !== null || cidadeExiste(texto, cidades))
    setAberto(true)
  }

  /** Ao sair do campo, o que bate com um município fica na grafia oficial. */
  const aoSair = () => {
    const oficial = nomeOficialCidade(valor, cidades)
    if (oficial !== null && oficial !== valor) onChange(oficial, true)
  }

  return (
    <div ref={caixa} className="relative">
      <Input
        value={valor}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => setAberto(true)}
        onBlur={aoSair}
        autoComplete="off"
        placeholder="Ex.: Guarulhos"
        aria-label="Cidade"
      />
      {aberto && sugestoes.length > 0 && !exata && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {sugestoes.map((c) => (
            <li key={`${c.nome}-${c.uf}`}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-marca-suave"
                onClick={() => {
                  onChange(c.nome, true)
                  setAberto(false)
                }}
              >
                <span className="font-medium text-slate-800">{c.nome}</span>
                <span className="text-xs text-slate-500">{c.uf}</span>
                {ehCidadeDaOperacao(c.nome, cidadesOperacao) && (
                  <span className="ml-auto rounded-full bg-marca-suave px-1.5 text-[10px] font-semibold text-marca-texto">
                    operação
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {valor.trim() !== '' && !exata && cidades.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          Escolha uma cidade da lista.
        </p>
      )}
    </div>
  )
}

/**
 * O que foi digitado é um município de verdade?
 *
 * Compara sem acento e sem caixa, então "sao paulo" vale por "São Paulo". Se a
 * lista ainda não carregou, devolve `true`: melhor aceitar do que travar o
 * cadastro de quem está com a internet ruim.
 */
export function cidadeExiste(valor: string, cidades: CidadeBR[]): boolean {
  if (!valor.trim()) return false
  if (cidades.length === 0) return true
  return nomeOficialCidade(valor, cidades) !== null
}
