// Entrada das numerações, usada pelos dois lados: cola do Excel, envia CSV,
// ou digita uma por linha. Mostra o que entendeu e deixa trocar a coluna
// quando a escolha automática não é a certa.

import { useRef, useState, type ChangeEvent } from 'react'
import { extrairNumeracoes } from '../../core/conferencia'
import { Button, Select } from '../../components/ui'

interface Props {
  /** Chamado a cada leitura, com as numerações e o nome do arquivo. */
  aoLer: (valores: string[], arquivo: string) => void
  placeholder?: string
}

export function EntradaNumeracoes({ aoLer, placeholder }: Props) {
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState('')
  const [coluna, setColuna] = useState<number | undefined>(undefined)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const leitura = texto.trim() ? extrairNumeracoes(texto, coluna) : null

  const atualizar = (t: string, novaColuna?: number, nome = arquivo) => {
    setTexto(t)
    setColuna(novaColuna)
    setArquivo(nome)
    const r = t.trim() ? extrairNumeracoes(t, novaColuna) : null
    aoLer(r?.valores ?? [], nome)
  }

  const lerArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const leitor = new FileReader()
    leitor.onload = () => atualizar(String(leitor.result ?? ''), undefined, f.name)
    leitor.readAsText(f)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variante="secundario" onClick={() => arquivoRef.current?.click()}>
          📎 Enviar CSV
        </Button>
        <input ref={arquivoRef} type="file" accept=".csv,.txt,text/csv" hidden onChange={lerArquivo} />
        {texto && (
          <Button variante="fantasma" onClick={() => { setArquivo(''); atualizar('', undefined, '') }}>
            🗑️ Limpar
          </Button>
        )}
      </div>

      <textarea
        className="h-32 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs outline-none focus:border-ml-azul"
        value={texto}
        onChange={(e) => atualizar(e.target.value, coluna)}
        placeholder={placeholder ?? 'Cole aqui as numerações (Ctrl+C no Excel → Ctrl+V), ou uma por linha…'}
      />

      {leitura && (
        <div className="space-y-1.5 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-sm font-semibold text-slate-700">
            {leitura.valores.length > 0
              ? `🔢 ${leitura.valores.length} numeração(ões) lida(s)`
              : '⚠️ Nenhuma numeração reconhecida nessa coluna'}
            {leitura.repetidas > 0 && (
              <span className="font-normal text-slate-500"> · {leitura.repetidas} repetida(s) descartada(s)</span>
            )}
            {arquivo && <span className="font-normal text-slate-500"> · {arquivo}</span>}
          </p>

          {leitura.colunas.length > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              Coluna usada:
              <Select
                value={String(leitura.colunaUsada)}
                onChange={(e) => atualizar(texto, Number(e.target.value))}
                style={{ width: 'auto' }}
              >
                {leitura.colunas.map((c) => (
                  <option key={c.indice} value={c.indice}>
                    {c.titulo} ({c.codigos})
                  </option>
                ))}
              </Select>
            </label>
          )}

          {leitura.valores.length > 0 && (
            <p className="font-mono text-[11px] text-slate-500">
              {leitura.valores.slice(0, 6).join(' · ')}
              {leitura.valores.length > 6 && ' …'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
