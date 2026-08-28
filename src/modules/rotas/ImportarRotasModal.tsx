// Importador da planilha de ROTAS (colar / CSV / PDF / fotos) — o mesmo
// modal serve a tela de Rotas e a Programação do dia, para as duas
// importações do dia (rotas + resumo) ficarem lado a lado.

import { useRef, useState, type ChangeEvent } from 'react'
import { importarRotas, registrarDiagnosticoOcr, useDB } from '../../core/db'
import {
  juntarFotosPorColuna,
  lerFotoDaPlanilha,
  parsearPlanilhaRotas,
  type ColunaRota,
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
  const [pedacos, setPedacos] = useState<{ texto: string; bloco: number }[]>([])
  const [fotos, setFotos] = useState<FotoColuna[]>([])
  const [avisosFotos, setAvisosFotos] = useState<string[]>([])
  // Ligado pelo botão: a PRÓXIMA foto começa um bloco de linhas novo mesmo que
  // as colunas dela não repitam nenhuma das que já vieram.
  const [forcarBlocoNovo, setForcarBlocoNovo] = useState(false)
  const [previa, setPrevia] = useState<{
    rotas: RotaImportada[]
    ignoradas: number
    avisos: string[]
    descartadas: { conteudo: string; motivo: string; linha: RotaImportada }[]
  } | null>(null)
  // Linhas que o Dispatcher decidiu incluir à mão (as que a leitura descartou).
  const [manuais, setManuais] = useState<RotaImportada[]>([])

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
  const recalcular = (novosPedacos: { texto: string; bloco: number }[], novoTexto: string) => {
    const ultimo = Math.max(0, ...novosPedacos.map((p) => p.bloco))
    const partes = [
      ...novosPedacos,
      ...(novoTexto.trim() ? [{ texto: novoTexto, bloco: ultimo + 1 }] : []),
    ]
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

  /**
   * Em que bloco esta foto entra? No bloco que AINDA NÃO TEM nenhuma das
   * colunas dela — é o que faz uma foto refeita voltar para o lugar de origem,
   * mesmo chegando por último. Se todos os blocos já têm essas colunas, é
   * porque a foto é de outras linhas: abre bloco novo.
   */
  const blocoPara = (texto: string, atuais: { texto: string; bloco: number }[]): number => {
    const numeros = [...new Set(atuais.map((p) => p.bloco))].sort((a, b) => a - b)
    if (forcarBlocoNovo) return (numeros[numeros.length - 1] ?? 0) + 1
    const minhas = new Set<ColunaRota>(lerFotoDaPlanilha(texto, contexto).colunas)
    if (minhas.size === 0) return numeros[numeros.length - 1] ?? 1
    for (const n of numeros) {
      const doBloco = new Set<ColunaRota>()
      for (const p of atuais.filter((x) => x.bloco === n))
        for (const c of lerFotoDaPlanilha(p.texto, contexto).colunas) doBloco.add(c)
      if (![...minhas].some((c) => doBloco.has(c))) return n
    }
    return (numeros[numeros.length - 1] ?? 0) + 1
  }

  /** O cartão de uma foto: o que ela trouxe e o botão de tirar da montagem. */
  const LINHA_FOTO = (f: FotoColuna, i: number) => (
    <div
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
          não reconheci as colunas desta foto — ela entrou como linha solta. Tente de novo, mais de
          perto.
        </span>
      )}
      <button
        className="ml-auto rounded px-1.5 text-slate-500 hover:bg-white hover:text-red-600"
        title="Tirar esta foto da montagem"
        onClick={() => {
          // As outras fotos NÃO são renumeradas: cada uma guarda o bloco dela,
          // então a que for reenviada volta para o lugar certo.
          const restantes = pedacos.filter((_, j) => j !== i)
          setPedacos(restantes)
          recalcular(restantes, textoColado)
        }}
      >
        🗑️
      </button>
    </div>
  )

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
        let todos = [...pedacos]
        for (const texto of novos.filter((t) => t.trim())) {
          todos = [...todos, { texto, bloco: blocoPara(texto, todos) }]
        }
        setForcarBlocoNovo(false)
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

  // O que vai ser importado: o lido mais as linhas que o Dispatcher mandou
  // entrar mesmo sem código. Corrigir é na tela de Rotas, que já tem o editor
  // completo (e o motorista direcionado) — aqui só se decide o que entra.
  const rotasFinais: RotaImportada[] = [...(previa?.rotas ?? []), ...manuais]

  const confirmarImportacao = async () => {
    if (rotasFinais.length === 0) return
    setImportando(true)
    try {
      await importarRotas(rotasFinais, data)
      setTextoColado('')
      setPedacos([])
      setFotos([])
      setAvisosFotos([])
      setForcarBlocoNovo(false)
      setManuais([])
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
        uma foto de cada — o app reconhece as colunas sozinho e encaixa lado a lado. A única regra
        é <strong>as mesmas linhas, na mesma ordem</strong>, dentro de cada rodada.
        <br />
        <strong>Acabou uma parte da planilha?</strong> Role para as próximas linhas e continue
        mandando fotos: elas viram um <strong>bloco novo</strong> e as rotas{' '}
        <strong>somam</strong> às anteriores — nada é substituído. O app abre bloco novo sozinho
        quando uma coluna se repete; se as colunas forem outras, avise no botão{' '}
        <strong>🧱 Próxima foto é de outras linhas</strong>. Repetir a coluna{' '}
        <strong>Rota expedição</strong> em cada foto deixa o app conferir o encaixe.
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
        {pedacos.length > 0 && (
          <Button
            variante={forcarBlocoNovo ? 'ml' : 'secundario'}
            onClick={() => setForcarBlocoNovo((v) => !v)}
            title="Marque quando a próxima foto for de OUTRAS linhas da planilha e as colunas dela não repetirem nenhuma das que já vieram"
          >
            {forcarBlocoNovo ? '🧱 Próxima foto abre bloco novo ✓' : '🧱 Próxima foto é de outras linhas'}
          </Button>
        )}
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
                setForcarBlocoNovo(false)
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
          {fotos.map((f, i) => {
            const abreBloco = f.bloco > 0 && (i === 0 || fotos[i - 1].bloco !== f.bloco)
            const doBloco = fotos.filter((x) => x.bloco === f.bloco)
            return (
              <div key={i}>
                {abreBloco && (
                  <p className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    🧱 Bloco {f.bloco} · {Math.max(...doBloco.map((x) => x.linhas))} rota(s)
                  </p>
                )}
                {LINHA_FOTO(f, i)}
              </div>
            )
          })}
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
      {previa && previa.descartadas.length > 0 && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-bold text-red-900">
            🚫 {previa.ignoradas} linha(s) ficaram de fora — e por quê:
          </p>
          <ul className="mt-1 space-y-1">
            {previa.descartadas.map((d, i) => (
              <li key={i} className="text-xs text-red-800">
                <span className="font-mono font-semibold">{d.conteudo || '(linha vazia)'}</span>
                <br />
                <span className="text-red-700">↳ {d.motivo}</span>
                <button
                  className="ml-2 rounded-lg border border-red-300 bg-white px-2 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-100"
                  title="Importa a linha assim mesmo, sem código — você completa depois na tela de Rotas"
                  onClick={() => setManuais((m) => [...m, { ...d.linha }])}
                >
                  ➕ Incluir assim mesmo
                </button>
              </li>
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
      {manuais.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <span className="text-xs text-amber-900">
            ➕ <strong>{manuais.length} linha(s)</strong> vão entrar <strong>sem código de rota</strong>,
            com o resto dos dados que a foto trouxe. Elas aparecem em destaque na tela de{' '}
            <strong>Rotas</strong>, onde você completa o código e o que mais precisar.
          </span>
          <button
            className="ml-auto rounded-lg px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            onClick={() => setManuais([])}
          >
            ↩️ Desfazer
          </button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-500">
        💡 Reimportar a planilha <strong>atualiza</strong> as rotas existentes (pela Rota expedição) sem duplicar
        e sem perder os motoristas já direcionados.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variante="secundario" onClick={onFechar}>
          Cancelar
        </Button>
        <Button variante="ml" onClick={() => void confirmarImportacao()} disabled={rotasFinais.length === 0 || importando}>
          {importando ? 'Importando…' : `📥 Importar ${rotasFinais.length} rota(s)`}
        </Button>
      </div>
    </Modal>
  )
}
