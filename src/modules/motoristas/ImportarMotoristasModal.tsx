// Cadastro de motoristas em LOTE: cola a planilha do Excel (ou envia o .xlsx/CSV)
// e o app cria/atualiza a frota inteira de uma vez.
//
// A prévia mostra linha a linha o que vai acontecer ANTES de gravar — quem é
// novo, quem já existe e vai ser atualizado, e quem vai ganhar login.

import { useRef, useState, type ChangeEvent } from 'react'
import { importarMotoristas, useDB, type ResultadoImportacaoMotoristas } from '../../core/db'
import { parsearPlanilhaMotoristas, type MotoristaImportado } from '../../core/planilha'
import { xlsxComoTexto } from '../../core/xlsx'
import { normalizarTexto } from '../../core/texto'
import { Badge, Button, Modal } from '../../components/ui'

const CABECALHO_MODELO = [
  'Nome',
  'Telefone',
  'Cidade',
  'Operação',
  'Veículo',
  'E-mail',
  'Senha',
  'Cidades preferidas',
  'Ativo',
  'Lote',
]

const EXEMPLO = [
  ['Carlos Silva', '34 99876-5432', 'Ituiutaba', 'EMG13', 'Utilitário', 'carlos@email.com', 'senha123', 'Gurinhatã', 'Sim', ''],
  ['Ana Souza', '34 98765-4321', 'Ituiutaba', 'EMG13', 'VUC', '', '', '', 'Sim', ''],
]

export function ImportarMotoristasModal({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const db = useDB()
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState<MotoristaImportado[] | null>(null)
  const [ignoradas, setIgnoradas] = useState(0)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacaoMotoristas | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const chave = normalizarTexto

  /** Mesma regra do importador: telefone manda; sem telefone, vale o nome. */
  const jaExiste = (m: MotoristaImportado) =>
    db.motoristas.find(
      (x) => (m.telefone && x.telefone === m.telefone) || chave(x.nome) === chave(m.nome),
    )

  const atualizarPrevia = (t: string) => {
    setTexto(t)
    setResultado(null)
    if (!t.trim()) {
      setPrevia(null)
      setIgnoradas(0)
      return
    }
    const lido = parsearPlanilhaMotoristas(t)
    setPrevia(lido.motoristas)
    setIgnoradas(lido.ignoradas)
  }

  const lerArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    // O modelo que eu entrego é uma planilha; ler o .xlsx direto evita obrigar
    // o Dispatcher a converter para CSV antes de importar.
    if (/\.xlsx$/i.test(arquivo.name)) {
      void xlsxComoTexto(arquivo, ['Motoristas', 'Cadastro'])
        .then(atualizarPrevia)
        .catch((err) => atualizarPrevia(`❌ Não consegui ler a planilha: ${String(err)}`))
      return
    }
    const leitor = new FileReader()
    leitor.onload = () => atualizarPrevia(String(leitor.result ?? ''))
    leitor.readAsText(arquivo)
  }

  const baixarModelo = () => {
    // Modelo em CSV com ponto e vírgula: abre direto no Excel em português.
    const linhas = [CABECALHO_MODELO, ...EXEMPLO].map((l) => l.join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + linhas], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-motoristas.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const confirmar = async () => {
    if (!previa || previa.length === 0) return
    setImportando(true)
    try {
      setResultado(await importarMotoristas(previa))
      setTexto('')
      setPrevia(null)
    } finally {
      setImportando(false)
    }
  }

  const fechar = () => {
    setTexto('')
    setPrevia(null)
    setResultado(null)
    onFechar()
  }

  const novos = previa?.filter((m) => !jaExiste(m)).length ?? 0
  const atualizar = (previa?.length ?? 0) - novos
  const comLogin = previa?.filter((m) => m.email && m.senha && !jaExiste(m)).length ?? 0
  const lotesNaPrevia = [...new Set((previa ?? []).map((m) => m.lote).filter(Boolean))]

  return (
    <Modal aberto={aberto} titulo="📥 Cadastrar motoristas em lote" onFechar={fechar}>
      {resultado ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            ✅ {resultado.criados} cadastrado(s), {resultado.atualizados} atualizado(s)
            {resultado.comLogin > 0 && `, ${resultado.comLogin} com login criado`}.
          </p>
          {resultado.erros.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">⚠️ {resultado.erros.length} linha(s) com aviso:</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {resultado.erros.map((e, i) => (
                  <li key={i}>
                    linha {e.linha} — <strong>{e.nome}</strong>: {e.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button variante="marca" onClick={fechar}>Fechar</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-600">
            <strong>Cole aqui as linhas da planilha</strong> (selecione no Excel/Sheets e Ctrl+C →
            Ctrl+V abaixo) ou envie um CSV. As colunas podem vir em <strong>qualquer ordem</strong> —
            o cabeçalho é quem manda. Só <strong>Nome</strong> é obrigatório.
          </p>
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
            {CABECALHO_MODELO.join(' • ')}
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button variante="secundario" onClick={baixarModelo}>⬇️ Baixar modelo (.csv)</Button>
            <Button variante="secundario" onClick={() => arquivoRef.current?.click()}>
              📎 Enviar Excel ou CSV
            </Button>
            <input ref={arquivoRef} type="file" accept=".xlsx,.csv,.txt,text/csv" hidden onChange={lerArquivo} />
          </div>

          <textarea
            className="h-40 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs outline-none focus:border-marca-texto"
            value={texto}
            onChange={(e) => atualizarPrevia(e.target.value)}
            placeholder={`${CABECALHO_MODELO.join('\t')}\nCarlos Silva\t34998765432\tItuiutaba\t…`}
          />

          {previa && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
                  ➕ {novos} novo(s)
                </Badge>
                {atualizar > 0 && (
                  <Badge className="border-orange-200 bg-orange-100 text-orange-900">
                    ♻️ {atualizar} já existe(m) — serão atualizados
                  </Badge>
                )}
                {comLogin > 0 && (
                  <Badge className="border-slate-300 bg-slate-100 text-slate-700">
                    🔑 {comLogin} com login
                  </Badge>
                )}
                {lotesNaPrevia.length > 0 && (
                  <Badge className="border-slate-300 bg-white text-slate-700">
                    🏷️ lote {lotesNaPrevia.join(', ')} — dá para apagar tudo de uma vez depois
                  </Badge>
                )}
                {ignoradas > 0 && (
                  <span className="text-xs text-slate-500">{ignoradas} linha(s) ignorada(s) (sem nome)</span>
                )}
              </div>

              <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-1">Nome</th>
                      <th className="px-2 py-1">Telefone</th>
                      <th className="px-2 py-1">Cidade</th>
                      <th className="px-2 py-1">Veículo</th>
                      <th className="px-2 py-1">Login</th>
                      <th className="px-2 py-1">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.map((m, i) => {
                      const existe = jaExiste(m)
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1 font-semibold text-slate-800">{m.nome}</td>
                          <td className="px-2 py-1 text-slate-600">{m.telefone || '—'}</td>
                          <td className="px-2 py-1 text-slate-600">{m.cidade || '—'}</td>
                          <td className="px-2 py-1 text-slate-600">{m.veiculo || '—'}</td>
                          <td className="px-2 py-1 text-slate-600">
                            {existe ? '—' : m.email && m.senha ? '🔑 cria' : '—'}
                          </td>
                          <td className="px-2 py-1">
                            {existe ? (
                              <span className="text-orange-800">♻️ atualiza</span>
                            ) : (
                              <span className="text-emerald-700">➕ novo</span>
                            )}
                            {!m.ativo && <span className="text-slate-400"> · inativo</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variante="secundario" onClick={fechar}>Cancelar</Button>
            <Button
              variante="marca"
              onClick={() => void confirmar()}
              disabled={importando || !previa || previa.length === 0}
            >
              {importando ? '⏳ Cadastrando…' : `💾 Cadastrar ${previa?.length ?? 0} motorista(s)`}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
