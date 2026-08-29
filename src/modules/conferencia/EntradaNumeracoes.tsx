// Entrada das numerações, usada pelos dois lados: cola do Excel, envia CSV,
// ou digita uma por linha. Mostra o que entendeu e deixa trocar a coluna
// quando a escolha automática não é a certa.

import { useRef, useState, type ChangeEvent } from 'react'
import { extrairNumeracoes } from '../../core/conferencia'
import { parsearRotaMeli, pareceRotaMeli, type RotaMeliLida } from '../../core/meli-rota'
import { Button, Select } from '../../components/ui'

interface Props {
  /**
   * Chamado a cada leitura, com as numerações e o nome do arquivo. Quando o
   * texto é a página de rota do Meli, `rota` vem junto com os detalhes.
   */
  aoLer: (valores: string[], arquivo: string, rota?: RotaMeliLida) => void
  placeholder?: string
}

export function EntradaNumeracoes({ aoLer, placeholder }: Props) {
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState('')
  const [coluna, setColuna] = useState<number | undefined>(undefined)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const rotaMeli = texto.trim() && pareceRotaMeli(texto) ? parsearRotaMeli(texto) : null
  const leitura = texto.trim() && !rotaMeli ? extrairNumeracoes(texto, coluna) : null

  const atualizar = (t: string, novaColuna?: number, nome = arquivo) => {
    setTexto(t)
    setColuna(novaColuna)
    setArquivo(nome)
    if (!t.trim()) {
      aoLer([], nome)
      return
    }
    // Página de rota do Meli (Ctrl+S / colada do bloco de notas): a extração
    // vem completa — numerações, motorista, rota e o detalhe de cada pacote.
    const rota = pareceRotaMeli(t) ? parsearRotaMeli(t) : null
    if (rota) {
      aoLer(rota.pacotes.map((x) => x.numeracao), nome, rota)
      return
    }
    aoLer(extrairNumeracoes(t, novaColuna).valores, nome)
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
        <input ref={arquivoRef} type="file" accept=".csv,.txt,.html,.htm,text/csv,text/plain,text/html" hidden onChange={lerArquivo} />
        {texto && (
          <Button variante="fantasma" onClick={() => { setArquivo(''); atualizar('', undefined, '') }}>
            🗑️ Limpar
          </Button>
        )}
      </div>

      <textarea
        className="h-32 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs outline-none focus:border-marca-texto"
        value={texto}
        onChange={(e) => atualizar(e.target.value, coluna)}
        placeholder={placeholder ?? 'Cole aqui as numerações (Ctrl+C no Excel → Ctrl+V), ou uma por linha…'}
      />

      {rotaMeli && (
        <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-sm font-bold text-emerald-900">
            🛣️ Página de rota do Meli reconhecida — {rotaMeli.pacotes.length} pacote(s)
          </p>
          <p className="text-xs text-emerald-800">
            Rota <strong>{rotaMeli.rota || '—'}</strong>
            {rotaMeli.motorista && <> · 🚚 {rotaMeli.motorista}</>}
            {rotaMeli.veiculo && <> · 🚐 {rotaMeli.veiculo}</>}
            {rotaMeli.placa && <> · {rotaMeli.placa}</>}
          </p>
          <p className="text-xs text-emerald-800">
            📍 {Object.entries(
              rotaMeli.pacotes.reduce<Record<string, number>>((acc, x) => {
                if (x.cidade) acc[x.cidade] = (acc[x.cidade] ?? 0) + 1
                return acc
              }, {}),
            )
              .map(([cid, n]) => `${cid} (${n})`)
              .join(' · ') || 'cidades não informadas'}
            {arquivo && <span className="text-emerald-700"> · {arquivo}</span>}
          </p>
        </div>
      )}

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
