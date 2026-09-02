import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDB, salvarMotorista, uid, useDB } from '../../core/db'
import { criarContaMotorista, salvarPerfilMotorista } from '../../core/firebase'
import { cidadesDaLista, operacoesDaCidade } from '../../core/cidade-operacao'
import { nomeOficialVeiculo, opcoesDeVeiculo } from '../../core/veiculos'
import { MENSAGEM_SENHA_CURTA, digitosTelefone, primeiroCampoVazio } from '../../core/cadastro'
import { Button, Card, Field, Input, Select } from '../../components/ui'

const ERROS_CONTA: Record<string, string> = {
  'auth/email-already-in-use': 'Este e-mail já possui uma conta. Use outro e-mail.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/weak-password': 'Senha muito fraca — use pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
}

// Cadastro feito pelo DISPATCHER. Segue as mesmas regras do pré-cadastro que
// o motorista faz na tela de login (core/cadastro.ts): Cidade/Operação da
// lista do dono (dois passos), veículo obrigatório e telefone com DDD. Um cadastro pela metade aqui vira o mesmo problema lá na frente:
// motorista sem veículo na hora de distribuir, cidade que não bate com nada.
export function MotoristaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const db = useDB()
  const existente = id ? getDB().motoristas.find((m) => m.id === id) : undefined

  const [nome, setNome] = useState(existente?.nome ?? '')
  const [telefone, setTelefone] = useState(existente?.telefone ?? '')
  // CIDADE/OPERAÇÃO em que o motorista atua — da lista que só o dono
  // mantém, em dois passos. Os valores atuais entram nas opções mesmo fora
  // da lista, para a edição de um cadastro antigo não travar.
  const [cidade, setCidade] = useState(existente?.cidade ?? '')
  const [operacao, setOperacao] = useState(existente?.operacao ?? '')
  const pares = [
    ...db.operacoesCidade,
    ...(existente?.cidade && existente.operacao
      ? [{ cidade: existente.cidade, operacao: existente.operacao }]
      : []),
  ]
  const cidadesOpcoes = cidadesDaLista(pares)
  const operacoesOpcoes = operacoesDaCidade(pares, cidade)
  const escolherCidade = (c: string) => {
    setCidade(c)
    const ops = operacoesDaCidade(pares, c)
    setOperacao(ops.length === 1 ? ops[0] : '')
  }
  // Começa VAZIO de propósito (como no pré-cadastro): escolher o veículo é
  // obrigatório, e um valor já preenchido faria passar batido no primeiro.
  const [veiculo, setVeiculo] = useState(nomeOficialVeiculo(existente?.veiculo, db))
  const veiculosOpcoes = opcoesDeVeiculo(db, veiculo)
  const [ativo, setAtivo] = useState(existente?.ativo ?? true)
  const [cidadesPreferidas, setCidadesPreferidas] = useState(existente?.cidadesPreferidas ?? '')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const criarAcesso = !existente && email.trim() !== ''

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    // E-mail é opcional aqui (o acesso pode vir depois), por isso null.
    const faltando = primeiroCampoVazio({ nome, telefone, cidade, operacao, email: null, veiculo })
    if (faltando) {
      setErro(faltando)
      return
    }
    if (criarAcesso && senha.length < 6) {
      setErro(MENSAGEM_SENHA_CURTA)
      return
    }
    setSalvando(true)
    try {
      let novoId = existente?.id ?? uid()
      if (criarAcesso) {
        // O id do motorista passa a ser o uid da conta — vínculo direto login ↔ cadastro.
        novoId = await criarContaMotorista(email.trim(), senha)
        await salvarPerfilMotorista(novoId, email.trim())
      }
      salvarMotorista({
        // Preserva o que este formulário não edita (as marcações de cidade que
        // o próprio motorista faz, o papel pedido no pré-cadastro, etc.) — o
        // salvamento reescreve o documento inteiro.
        ...existente,
        id: novoId,
        nome: nome.trim(),
        telefone: digitosTelefone(telefone),
        cidade: cidade.trim(),
        operacao,
        veiculo,
        ativo,
        // Cadastro feito pelo dispatcher já nasce aprovado; edição preserva o estado.
        aprovado: existente ? (existente.aprovado ?? true) : true,
        cidadesPreferidas: cidadesPreferidas.trim(),
        criadoEm: existente?.criadoEm ?? new Date().toISOString(),
      })
      navigate(`/motoristas/${novoId}`)
    } catch (err) {
      const codigo = (err as { code?: string }).code ?? ''
      setErro(ERROS_CONTA[codigo] ?? 'Não foi possível salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold text-slate-900">
        {existente ? `✏️ Editar ${existente.nome}` : '➕ Cadastrar motorista'}
      </h1>
      <Card className="p-5">
        <form onSubmit={enviar} className="space-y-4">
          <Field label="Nome completo">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex.: Carlos Silva" />
          </Field>
          <Field label="📱 Telefone (WhatsApp)">
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              required
              placeholder="Ex.: 11 98765-4321"
              inputMode="tel"
            />
          </Field>
          {/* Cidade e operação em que atua — a lista é do dono (tela Cidades). */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="🏢 Cidade">
              <Select value={cidade} onChange={(e) => escolherCidade(e.target.value)}>
                <option value="">{cidadesOpcoes.length === 0 ? 'Nenhuma cadastrada' : 'Selecione…'}</option>
                {cidadesOpcoes.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="📦 Operação">
              <Select
                value={operacao}
                onChange={(e) => setOperacao(e.target.value)}
                disabled={!cidade || operacoesOpcoes.length === 0}
              >
                <option value="">{cidade ? 'Selecione…' : 'Escolha a cidade'}</option>
                {operacoesOpcoes.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            </Field>
          </div>
          {db.operacoesCidade.length === 0 && (
            <p className="-mt-2 text-[11px] text-slate-500">
              A lista de Cidade/Operação é mantida pelo dono na tela Cidades.
            </p>
          )}
          <Field label="🚐 Veículo">
            <Select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>
              <option value="">Selecione…</option>
              {veiculosOpcoes.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="⭐ Cidades preferidas (rende melhor — separe por vírgula)">
              <Input
                value={cidadesPreferidas}
                onChange={(e) => setCidadesPreferidas(e.target.value)}
                placeholder="Ex.: São Simão, Santa Vitória"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4" />
            Motorista ativo na frota
          </label>

          {!existente && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="mb-2 text-sm font-bold text-slate-800">🔑 Acesso ao aplicativo</p>
              <p className="mb-3 text-xs text-slate-600">
                Defina e-mail e senha para o motorista entrar no app e responder as chamadas.
                Envie os dados a ele pelo WhatsApp. (Deixe em branco para cadastrar sem acesso por enquanto.)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="📧 E-mail de acesso">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="motorista@email.com"
                    autoComplete="off"
                  />
                </Field>
                <Field label="🔒 Senha (mín. 6 caracteres)">
                  <Input
                    type="text"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Ex.: rota2026"
                    autoComplete="off"
                    required={criarAcesso}
                  />
                </Field>
              </div>
            </div>
          )}

          {erro && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variante="secundario" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" variante="marca" disabled={salvando}>
              {salvando ? 'Salvando…' : '💾 Salvar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
