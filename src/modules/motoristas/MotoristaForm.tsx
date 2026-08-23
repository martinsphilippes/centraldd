import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDB, salvarMotorista, uid, useDB } from '../../core/db'
import { criarContaMotorista, salvarPerfilMotorista } from '../../core/firebase'
import { OPERACOES, VEICULOS } from '../../core/constants'
import { Button, Card, Field, Input, Select } from '../../components/ui'

const ERROS_CONTA: Record<string, string> = {
  'auth/email-already-in-use': 'Este e-mail já possui uma conta. Use outro e-mail.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/weak-password': 'Senha muito fraca — use pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
}

export function MotoristaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const db = useDB()
  const existente = id ? getDB().motoristas.find((m) => m.id === id) : undefined

  const [nome, setNome] = useState(existente?.nome ?? '')
  const [telefone, setTelefone] = useState(existente?.telefone ?? '')
  const [cidade, setCidade] = useState(existente?.cidade ?? '')
  const [equipe, setEquipe] = useState(existente?.equipe ?? '')
  const [operacao, setOperacao] = useState(existente?.operacao ?? OPERACOES[0])
  const [veiculo, setVeiculo] = useState(existente?.veiculo ?? VEICULOS[0])
  // Opções cadastradas pelo coordenador (Tipos) + o valor atual do motorista.
  const doSistema = (categoria: 'veiculo' | 'operacao', padrao: string[]): string[] => {
    const lista = db.tipos.filter((t) => t.categoria === categoria).map((t) => t.nome)
    return lista.length > 0 ? lista.sort((a, b) => a.localeCompare(b, 'pt-BR')) : padrao
  }
  const veiculosOpcoes = [...new Set([...doSistema('veiculo', VEICULOS), veiculo].filter(Boolean))]
  const operacoesOpcoes = [...new Set([...doSistema('operacao', OPERACOES), operacao].filter(Boolean))]
  const [ativo, setAtivo] = useState(existente?.ativo ?? true)
  const [cidadesBloqueadas, setCidadesBloqueadas] = useState(existente?.cidadesBloqueadas ?? '')
  const [cidadesPreferidas, setCidadesPreferidas] = useState(existente?.cidadesPreferidas ?? '')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const criarAcesso = !existente && email.trim() !== ''

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    if (criarAcesso && senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
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
        id: novoId,
        nome: nome.trim(),
        telefone: telefone.replace(/\D/g, ''),
        cidade: cidade.trim(),
        equipe: equipe.trim(),
        operacao,
        veiculo,
        ativo,
        // Cadastro feito pelo coordenador já nasce aprovado; edição preserva o estado.
        aprovado: existente ? (existente.aprovado ?? true) : true,
        cidadesBloqueadas: cidadesBloqueadas.trim(),
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="📍 Cidade">
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} required placeholder="Ex.: Guarulhos" />
            </Field>
            <Field label="👥 Equipe">
              <Input value={equipe} onChange={(e) => setEquipe(e.target.value)} required placeholder="Ex.: Equipe Alfa" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="📦 Operação padrão">
              <Select value={operacao} onChange={(e) => setOperacao(e.target.value)}>
                {operacoesOpcoes.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            </Field>
            <Field label="🚐 Veículo">
              <Select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>
                {veiculosOpcoes.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="🚫 Cidades bloqueadas (não pode ir — separe por vírgula)">
              <Input
                value={cidadesBloqueadas}
                onChange={(e) => setCidadesBloqueadas(e.target.value)}
                placeholder="Ex.: Capinópolis, Ipiaçu"
              />
            </Field>
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
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
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
            <Button type="submit" variante="ml" disabled={salvando}>
              {salvando ? 'Salvando…' : '💾 Salvar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
