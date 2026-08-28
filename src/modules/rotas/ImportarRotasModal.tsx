// Importador da planilha de ROTAS (colar / CSV / PDF / fotos) — o mesmo
// modal serve a tela de Rotas e a Programação do dia, para as duas
// importações do dia (rotas + resumo) ficarem lado a lado.

import { useRef, useState, type ChangeEvent } from 'react'
import { importarRotas, registrarDiagnosticoOcr, useDB } from '../../core/db'
import {
  juntarFotosPorColuna,
  parsearPlanilhaRotas,
  type FotoColuna,
  type RotaImportada,
} from '../../core/planilha'
import { extrairTextoDeArquivo, obterUltimaMiniaturaOcr } from '../../core/pdf'
import { xlsxComoTexto } from '../../core/xlsx'
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
  const db = useDB()
  const [textoColado, setTextoColado] = useState('')
  // Cada arquivo enviado fica guardado SEPARADO: é isso que deixa o app
  // encaixar fotos tiradas por coluna lado a lado, em vez de empilhar.
  const [pedacos, setPedacos] = useState<string[]>([])
  const [fotos, setFotos] = useState<FotoColuna[]>([])
  const [avisosFotos, setAvisosFotos] = useState<string[]>([])
  const [previa, setPrevia] = useState<{
    rotas: RotaImportada[]
    ignoradas: number
    avisos: string[]
  } | null>(null)
  const [importando, setImportando] = useState(false)
  const [lendoPdf, setLendoPdf] = useState('')
  const [erroArquivo, setErroArquivo] = useState('')
  const arquivoRef = useRef<HTMLInputElement>(null)

  // Os códigos que a operação já usou corrigem a letra que a foto não mostra:
  // "VI" vira "VJ" quando esta base sempre teve VJ e nunca VI.
  // Cidades e veículos do cadastro entram junto: é com esse vocabulário que o
  // app identifica de que coluna é cada foto quando o cabeçalho não sai legível.
  const contexto = {
    prefixos: [
      ...new Set(
        db.rotas
          .map((r) => /^([A-Z]+)\d/.exec(r.rotaExpedicao.toUpperCase())?.[1])
          .filter((p): p is string => !!p),
      ),
    ],
    cidades: db.cidades.map((c) => c.nome),
    veiculos: [
      ...new Set([
        ...db.tipos.filter((t) => t.categoria === 'veiculo').map((t) => t.nome),
        ...db.motoristas.map((m) => m.veiculo),
        'Veículo de Passeio',
      ]),
    ].filter(Boolean),
  }

  /** Recompõe a tabela a partir de tudo que já entrou (fotos + texto colado). */
  const recalcular = (novosPedacos: string[], novoTexto: string) => {
    const partes = [...novosPedacos, novoTexto].filter((t) => t.trim())
    if (partes.length === 0) {
      setPrevia(null)
      setFotos([])
      setAvisosFotos([])
      return
    }
    const junto = juntarFotosPorColuna(partes, contexto)
    setFotos(junto.fotos.slice(0, novosPedacos.length))
    setAvisosFotos(junto.avisos)
    setPrevia(parsearPlanilhaRotas(junto.texto, contexto))
  }

  const atualizarPrevia = (texto: string) => {
    setTextoColado(texto)
    recalcular(pedacos, texto)
  }

  const lerArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = '' // permite reenviar os mesmos arquivos
    if (arquivos.length === 0) return
    setErroArquivo('')
    setLendoPdf('⏳ Lendo…')
    void (async () => {
      try {
        // Cada arquivo é lido em SEPARADO e guardado como um pedaço próprio:
        // assim uma foto de duas colunas pode se encaixar ao lado da outra,
        // em vez de virar mais linhas embaixo.
        const novos: string[] = []
        for (const a of arquivos) {
          setLendoPdf(`⏳ Lendo ${a.name}…`)
          if (/\.xlsx$/i.test(a.name)) {
            novos.push(await xlsxComoTexto(a))
            continue
          }
          const lido = await extrairTextoDeArquivo(a, setLendoPdf)
          registrarDiagnosticoOcr('rotas', lido, {
            arquivo: a.name,
            miniatura: obterUltimaMiniaturaOcr().slice(0, 700000),
          })
          novos.push(lido)
        }
        const todos = [...pedacos, ...novos.filter((t) => t.trim())]
        setPedacos(todos)
        recalcular(todos, textoColado)
      } catch (err) {
        const detalhe = err instanceof Error ? err.message : String(err)
        setErroArquivo(
          `Não consegui ler (${detalhe}). O caminho mais certo é enviar a planilha .xlsx ou colar as linhas — foto sempre erra letra e número.`,
        )
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
      setPedacos([])
      setFotos([])
      setAvisosFotos([])
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
        <strong>Envie a planilha .xlsx</strong> ou <strong>cole as linhas</strong> (Ctrl+C no
        Excel → Ctrl+V abaixo). Os dois caminhos leem o valor exato de cada célula. Foto e PDF
        também funcionam, mas passam por reconhecimento de imagem e podem trocar letra por número
        (I vira 1, G vira 6) — use só quando não tiver o arquivo. Ordem das colunas:
      </p>
      <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
        Cidade • Rota expedição • Rota original • Base • Veículo • Km • DPS • Ocupação % • Transportadora
      </p>
      <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
        📸 <strong>Foto por partes:</strong> em vez de afastar para pegar a planilha inteira (e
        perder nitidez), fotografe <strong>2 ou 3 colunas de cada vez, de perto</strong>, e mande
        uma foto de cada. O app encaixa lado a lado sozinho. Duas regras:{' '}
        <strong>a linha de título tem que aparecer</strong> em toda foto — é por ela que o app sabe
        de que coluna é — e <strong>as mesmas linhas, na mesma ordem</strong>, em todas. Repetir a
        coluna <strong>Rota expedição</strong> em cada foto deixa o app conferir o encaixe.
      </p>
      <textarea
        className="h-40 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-ml-azul"
        placeholder={'Ituiutaba\tD11_AM1\tAM1_133\tEMG13\tVeículo de Passeio\t21,481\t5:00\t53,46\tEnvios Extra\n…'}
        value={textoColado}
        onChange={(e) => atualizarPrevia(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input ref={arquivoRef} type="file" multiple accept=".xlsx,.csv,.txt,.tsv,.pdf,image/*" onChange={lerArquivo} className="hidden" />
        <Button variante="secundario" onClick={() => arquivoRef.current?.click()} disabled={!!lendoPdf}>
          {lendoPdf || (previa ? '📄 Enviar MAIS um arquivo (soma às linhas)' : '📄 Enviar Excel, CSV, PDF ou foto')}
        </Button>
        {previa && (
          <>
            <span className="text-sm font-semibold text-slate-700">
              ✅ {previa.rotas.length} rota(s) reconhecida(s)
              {previa.ignoradas > 0 && ` • ${previa.ignoradas} linha(s) ignorada(s)`}
            </span>
            <button
              onClick={() => {
                setPedacos([])
                setFotos([])
                setAvisosFotos([])
                atualizarPrevia('')
              }}
              className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
              title="Descartar tudo o que foi lido e recomeçar"
            >
              🧹 Recomeçar
            </button>
          </>
        )}
      </div>
      {fotos.length > 0 && (
        <div className="mt-2 space-y-1">
          {fotos.map((f, i) => (
            <div
              key={i}
              className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                f.reconhecida
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-300 bg-amber-50 text-amber-800'
              }`}
            >
              <span className="font-bold">📸 Foto {i + 1}</span>
              {f.reconhecida ? (
                <span>
                  {f.colunas.join(' · ')} — {f.linhas} linha(s)
                </span>
              ) : (
                <span>
                  não achei o cabeçalho, então não sei de que colunas é — entrou como linha solta.
                  Refaça incluindo a linha de título das colunas.
                </span>
              )}
              <button
                className="ml-auto rounded px-1.5 text-slate-500 hover:bg-white hover:text-red-600"
                title="Tirar esta foto da montagem"
                onClick={() => {
                  const restantes = pedacos.filter((_, j) => j !== i)
                  setPedacos(restantes)
                  recalcular(restantes, textoColado)
                }}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
      {avisosFotos.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs font-bold text-amber-900">⚠️ Sobre o encaixe das fotos:</p>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
            {avisosFotos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {previa && previa.avisos.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs font-bold text-amber-900">⚠️ Confira antes de importar:</p>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
            {previa.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
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
