// Campo de cidade com sugestão, conferido contra a lista oficial do IBGE.
//
// Por que não deixar digitar livre: a cidade decide preferência, rodízio e
// relatório. "Guarulhos", "guarulhos " e "Guarulos" viravam três cidades
// diferentes no banco, e ninguém percebia até o relatório sair errado.
//
// O que fica GRAVADO é só o nome ("Guarulhos"), sem a UF — é assim que o resto
// do app compara cidade de motorista com cidade de rota. A UF aparece só na
// lista, para separar as cidades homônimas (existem 5 "Bom Jesus" no Brasil).

import { useEffect, useRef, useState } from 'react'
import { normalizarTexto } from '../../core/texto'
import type { CidadeBR } from '../../core/cidades-brasil'
import { Input } from '../../components/ui'

/** Quantas sugestões mostrar — o suficiente para achar sem virar rolagem. */
const MAXIMO = 8

export function CampoCidade({
  valor,
  onChange,
}: {
  valor: string
  /** Devolve o texto e se ele é um município de verdade — quem chama decide o que fazer. */
  onChange: (cidade: string, valida: boolean) => void
}) {
  // A lista dos 5.570 municípios só é carregada quando o cadastro abre — não
  // pesa no app de quem só vai fazer login.
  const [cidades, setCidades] = useState<CidadeBR[]>([])
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
      if (valor.trim() !== '') onChange(valor, cidadeExiste(valor, lista))
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

  const busca = normalizarTexto(valor)
  // Quem começa com o que foi digitado vem primeiro; depois quem só contém.
  // Digitar "campinas" tem que mostrar Campinas antes de "Campinas do Sul".
  const sugestoes = busca
    ? [
        ...cidades.filter((c) => normalizarTexto(c.nome).startsWith(busca)),
        ...cidades.filter(
          (c) =>
            !normalizarTexto(c.nome).startsWith(busca) && normalizarTexto(c.nome).includes(busca),
        ),
      ].slice(0, MAXIMO)
    : []

  const exata = cidadeExiste(valor, cidades)

  return (
    <div ref={caixa} className="relative">
      <Input
        value={valor}
        onChange={(e) => {
          onChange(e.target.value, cidadeExiste(e.target.value, cidades))
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
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
  const alvo = normalizarTexto(valor)
  if (!alvo) return false
  if (cidades.length === 0) return true
  return cidades.some((c) => normalizarTexto(c.nome) === alvo)
}
