// Importador da planilha de ROTAS (colar / CSV / PDF / fotos) — o mesmo
// modal serve a tela de Rotas e a Programação do dia, para as duas
// importações do dia (rotas + resumo) ficarem lado a lado.

import { useRef, useState, type ChangeEvent } from 'react'
import { importarRotas, registrarDiagnosticoOcr } from '../../core/db'
import { parsearPlanilhaRotas, type RotaImportada } from '../../core/planilha'
import { extrairTextoDeArquivos, obterUltimaMiniaturaOcr } from '../../core/pdf'
import { formatarData } from '../../core/dates'
import { Button, Modal } from '../../components/ui'

export function ImportarRotasModal({
  aberto,
  onFechar,
  data,
}: {
  aberto: boolean
  onFechar: () => void
  /** Dia da operação: a roteirização importada fica SÓ neste dia. */
  data: string
}) {
  const [textoColado, setTextoColado] = useState('')
  const [previa, setPrevia] = useState<{ rotas: RotaImportada[]; ignoradas: number } | null>(null)
  const [importando, setImportando] = useState(false)
  const [lendoPdf, setLendoPdf] = useState('')
  const [erroArquivo, setErroArquivo] = useState('')
  const arquivoRef = useRef<HTMLInputElement>(null)

  const atualizarPrevia = (texto: string) => {
    setTextoColado(texto)
    setPrevia(texto.trim() ? parsearPlanilhaRotas(texto) : null)
  }

  const lerArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = '' // permite reenviar os mesmos arquivos
    if (arquivos.length === 0) return
    setErroArquivo('')
    setLendoPdf('⏳ Lendo…')
    void (async () => {
      try {
        // As leituras se SOMAM: enviar outra foto acrescenta as linhas dela
        // (no iPad a galeria costuma deixar escolher uma por vez).
        const texto = await extrairTextoDeArquivos(arquivos, setLendoPdf)
        registrarDiagnosticoOcr('rotas', texto, {
          arquivo: arquivos.map((a) => a.name).join(', '),
          miniatura: obterUltimaMiniaturaOcr().slice(0, 700000),
        })
        const anterior = textoColado.trim() ? textoColado.replace(/\s+$/, '') + '\n' : ''
        atualizarPrevia(anterior + texto)
      } catch (err) {
        const detalhe = err instanceof Error ? err.message : String(err)
        setErroArquivo(`Não consegui ler (${detalhe}). Tente uma foto/PDF mais nítido, cole os dados ou use CSV.`)
      } finally {
        setLendoPdf('')
      }
    })()
  }

  const confirmarImportacao = async () => {
    if (!previa || previa.rotas.length === 0) return
    setImportando(true)
    try {
      await importarRotas(previa.rotas, data)
      setTextoColado('')
      setPrevia(null)
      onFechar()
    } finally {
      setImportando(false)
    }
  }

  return (
    <Modal aberto={aberto} titulo="📥 Importar planilha de rotas" onFechar={onFechar}>
      <p className="mb-2 rounded-lg border border-ml-amarelo bg-yellow-50 px-3 py-2 text-sm font-semibold text-slate-800">
        📅 As rotas entram no dia <strong>{formatarData(data)}</strong> — e ficam só nele.
      </p>
      <p className="mb-2 text-sm text-slate-600">
        <strong>Cole aqui as linhas da planilha</strong> (selecione no Excel/Sheets e Ctrl+C → Ctrl+V abaixo)
        ou envie o arquivo CSV. Ordem das colunas:
      </p>
      <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
        Cidade • Rota expedição • Rota original • Base • Veículo • Km • DPS • Ocupação % • Transportadora
      </p>
      <textarea
        className="h-40 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-ml-azul"
        placeholder={'Ituiutaba\tD11_AM1\tAM1_133\tEMG13\tVeículo de Passeio\t21,481\t5:00\t53,46\tEnvios Extra\n…'}
        value={textoColado}
        onChange={(e) => atualizarPrevia(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input ref={arquivoRef} type="file" multiple accept=".csv,.txt,.tsv,.pdf,image/*" onChange={lerArquivo} className="hidden" />
        <Button variante="secundario" onClick={() => arquivoRef.current?.click()} disabled={!!lendoPdf}>
          {lendoPdf || (previa ? '📄 Enviar MAIS um arquivo (soma às linhas)' : '📄 Enviar CSV, PDF ou fotos')}
        </Button>
        {previa && (
          <>
            <span className="text-sm font-semibold text-slate-700">
              ✅ {previa.rotas.length} rota(s) reconhecida(s)
              {previa.ignoradas > 0 && ` • ${previa.ignoradas} linha(s) ignorada(s)`}
            </span>
            <button
              onClick={() => atualizarPrevia('')}
              className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
              title="Descartar tudo o que foi lido e recomeçar"
            >
              🧹 Recomeçar
            </button>
          </>
        )}
      </div>
      {erroArquivo && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroArquivo}</p>
      )}
      <p className="mt-3 text-[11px] text-slate-500">
        💡 Reimportar a planilha <strong>atualiza</strong> as rotas existentes (pela Rota expedição) sem duplicar
        e sem perder os motoristas já direcionados.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variante="secundario" onClick={onFechar}>
          Cancelar
        </Button>
        <Button variante="ml" onClick={() => void confirmarImportacao()} disabled={!previa || previa.rotas.length === 0 || importando}>
          {importando ? 'Importando…' : `📥 Importar ${previa?.rotas.length ?? 0} rota(s)`}
        </Button>
      </div>
    </Modal>
  )
}
