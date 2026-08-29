// Tela do MOTORISTA: o próprio perfil. Edita os dados de contato (nome,
// telefone, veículo) e troca a senha da conta — com a senha atual
// confirmando que é ele mesmo. Situação (ativo/aprovado) é só do Dispatcher.

import { useState, type FormEvent } from 'react'
import { salvarMeuPerfilMotorista, useDB } from '../../core/db'
import { trocarSenha } from '../../core/firebase'
import { useSessao } from '../../context/SessaoContext'
import { OPERACOES } from '../../core/constants'
import { nomeOficialVeiculo, opcoesDeVeiculo } from '../../core/veiculos'
import { Button, Card, EmptyState, Field, Input, Select } from '../../components/ui'

const ERROS_SENHA: Record<string, string> = {
  'auth/wrong-password': 'A senha atual não confere.',
  'auth/invalid-credential': 'A senha atual não confere.',
  'auth/weak-password': 'A nova senha é muito fraca — use pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
}

export function MeuPerfil() {
  const db = useDB()
  const { motoristaId, usuarioEmail } = useSessao()
  const eu = db.motoristas.find((m) => m.id === motoristaId)

  const [nome, setNome] = useState(eu?.nome ?? '')
  const [telefone, setTelefone] = useState(eu?.telefone ?? '')
  const [veiculo, setVeiculo] = useState(nomeOficialVeiculo(eu?.veiculo, db))
  const [avisoPerfil, setAvisoPerfil] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)

  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [avisoSenha, setAvisoSenha] = useState<{ ok: boolean; texto: string } | null>(null)
  const [trocando, setTrocando] = useState(false)

  if (!eu) return <EmptyState icone="🚚" titulo="Cadastro não encontrado" />

  // Cidades da operação + a que já está no cadastro (caso não esteja na lista).
  const veiculosOpcoes = opcoesDeVeiculo(db, veiculo)

  const salvarPerfil = (e: FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return
    setSalvandoPerfil(true)
    setAvisoPerfil('')
    salvarMeuPerfilMotorista(eu.id, {
      nome: nome.trim(),
      telefone: telefone.replace(/\D/g, ''),
      veiculo,
    })
      .then(() => setAvisoPerfil('✅ Dados salvos! O Dispatcher já vê a atualização.'))
      .catch(() => setAvisoPerfil('❌ Não consegui salvar. Tente de novo; se continuar, avise o Dispatcher.'))
      .finally(() => setSalvandoPerfil(false))
  }

  const enviarSenha = (e: FormEvent) => {
    e.preventDefault()
    setAvisoSenha(null)
    if (novaSenha.length < 6) {
      setAvisoSenha({ ok: false, texto: 'A nova senha precisa ter pelo menos 6 caracteres.' })
      return
    }
    if (novaSenha !== confirmar) {
      setAvisoSenha({ ok: false, texto: 'A confirmação não confere com a nova senha.' })
      return
    }
    setTrocando(true)
    trocarSenha(senhaAtual, novaSenha)
      .then(() => {
        setAvisoSenha({ ok: true, texto: '✅ Senha trocada! Use a nova no próximo login.' })
        setSenhaAtual('')
        setNovaSenha('')
        setConfirmar('')
      })
      .catch((err: { code?: string }) => {
        setAvisoSenha({
          ok: false,
          texto: ERROS_SENHA[err.code ?? ''] ?? 'Não foi possível trocar a senha. Tente novamente.',
        })
      })
      .finally(() => setTrocando(false))
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">👤 Meu perfil</h1>
        <p className="text-sm text-slate-500">
          Seus dados de contato e a senha de acesso. Suas <strong>cidades</strong> ficam na tela
          📍 Cidades; operação e situação do cadastro quem cuida é o Dispatcher.
        </p>
      </div>

      {/* Dados do cadastro */}
      <Card className="p-5">
        <h2 className="mb-3 font-bold text-slate-900">📇 Meus dados</h2>
        <form onSubmit={salvarPerfil} className="space-y-3">
          <Field label="Nome completo">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="📱 Telefone (WhatsApp)">
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="Ex.: 34 99876-5432"
              />
            </Field>
            {/* O e-mail é o login da conta: mostrar, nunca deixar editar aqui —
                mudar o endereço tiraria o motorista do próprio acesso. */}
            <Field label="✉️ E-mail (seu login)">
              <Input value={usuarioEmail ?? ''} readOnly className="bg-slate-100 text-slate-500" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="🚐 Meu veículo">
              <Select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>
                {!veiculo && <option value="">— escolher —</option>}
                {veiculosOpcoes.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="📦 Operação">
              <Input value={eu.operacao || OPERACOES[0]} disabled className="bg-slate-50 text-slate-500" />
            </Field>
          </div>

          {avisoPerfil && (
            <p
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                avisoPerfil.startsWith('✅')
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-red-300 bg-red-50 text-red-700'
              }`}
            >
              {avisoPerfil}
            </p>
          )}
          <div className="flex justify-end">
            <Button variante="ml" disabled={salvandoPerfil}>
              {salvandoPerfil ? '⏳ Salvando…' : '💾 Salvar meus dados'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Troca de senha */}
      <Card className="p-5">
        <h2 className="mb-1 font-bold text-slate-900">🔑 Trocar senha</h2>
        <p className="mb-3 text-xs text-slate-500">
          Login: <strong>{usuarioEmail}</strong>. Por segurança, confirme a senha atual para trocar.
        </p>
        <form onSubmit={enviarSenha} className="space-y-3">
          <Field label="Senha atual">
            <Input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nova senha (mín. 6 caracteres)">
              <Input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                autoComplete="new-password"
              />
            </Field>
            <Field label="Repetir a nova senha">
              <Input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
                autoComplete="new-password"
              />
            </Field>
          </div>

          {avisoSenha && (
            <p
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                avisoSenha.ok
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-red-300 bg-red-50 text-red-700'
              }`}
            >
              {avisoSenha.texto}
            </p>
          )}
          <div className="flex justify-end">
            <Button variante="ml" disabled={trocando}>
              {trocando ? '⏳ Trocando…' : '🔑 Trocar senha'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
