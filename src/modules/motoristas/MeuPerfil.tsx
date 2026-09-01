// Tela do MOTORISTA: o próprio perfil. Edita os dados de contato (nome,
// telefone, veículo) e troca a senha da conta — com a senha atual
// confirmando que é ele mesmo. Situação (ativo/aprovado) é só do Dispatcher.

import { useState, type FormEvent } from 'react'
import { enviarSugestao, salvarMeuPerfilMotorista, useDB } from '../../core/db'
import { trocarEmail, trocarSenha } from '../../core/firebase'
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

const ERROS_EMAIL: Record<string, string> = {
  'auth/wrong-password': 'A senha atual não confere.',
  'auth/invalid-credential': 'A senha atual não confere.',
  'auth/invalid-email': 'Esse e-mail não parece válido. Confira a digitação.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail.',
  'auth/requires-recent-login': 'Por segurança, saia e entre de novo antes de trocar o e-mail.',
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

  const [sugestao, setSugestao] = useState('')
  const [enviandoSugestao, setEnviandoSugestao] = useState(false)
  const [avisoSugestao, setAvisoSugestao] = useState('')

  const [novoEmail, setNovoEmail] = useState('')
  const [senhaDoEmail, setSenhaDoEmail] = useState('')
  const [avisoEmail, setAvisoEmail] = useState<{ ok: boolean; texto: string } | null>(null)
  const [trocandoEmail, setTrocandoEmail] = useState(false)

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

  const mandarSugestao = (e: FormEvent) => {
    e.preventDefault()
    const texto = sugestao.trim()
    if (texto.length < 5) {
      setAvisoSugestao('❌ Escreva um pouco mais para o Dispatcher entender a ideia.')
      return
    }
    setEnviandoSugestao(true)
    setAvisoSugestao('')
    enviarSugestao(eu.id, texto)
      .then(() => {
        setSugestao('')
        setAvisoSugestao('✅ Sugestão enviada! Obrigado — o Dispatcher vai ler.')
      })
      .catch(() => setAvisoSugestao('❌ Não consegui enviar agora. Tente de novo daqui a pouco.'))
      .finally(() => setEnviandoSugestao(false))
  }

  const enviarEmail = (e: FormEvent) => {
    e.preventDefault()
    setAvisoEmail(null)
    const alvo = novoEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)) {
      setAvisoEmail({ ok: false, texto: 'Escreva um e-mail válido, como voce@gmail.com.' })
      return
    }
    if (alvo === (usuarioEmail ?? '').toLowerCase()) {
      setAvisoEmail({ ok: false, texto: 'Esse já é o seu e-mail atual.' })
      return
    }
    setTrocandoEmail(true)
    trocarEmail(senhaDoEmail, alvo)
      .then((resultado) => {
        setSenhaDoEmail('')
        if (resultado === 'trocado') {
          setAvisoEmail({
            ok: true,
            texto: `✅ Pronto! Seu login agora é ${alvo}. Atualizando a tela…`,
          })
          setNovoEmail('')
          // A sessão só descobre o endereço novo relendo a conta — recarregar
          // é o jeito mais simples de não deixar a tela mostrando o antigo.
          setTimeout(() => window.location.reload(), 1800)
        } else {
          setAvisoEmail({
            ok: true,
            texto: `📧 Enviei um link de confirmação para ${alvo}. Abra esse e-mail e clique no link — o login só muda depois disso. Até lá, continue entrando com o endereço atual.`,
          })
        }
      })
      .catch((err: { code?: string }) => {
        setAvisoEmail({
          ok: false,
          texto: ERROS_EMAIL[err.code ?? ''] ?? 'Não foi possível trocar o e-mail. Tente novamente.',
        })
      })
      .finally(() => setTrocandoEmail(false))
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
          <Field label="📱 Telefone (WhatsApp)">
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="Ex.: 34 99876-5432"
            />
          </Field>
          {/* O e-mail ocupa a LINHA INTEIRA: dividido em duas colunas ele não
              cabia no celular e o endereço aparecia cortado pela metade.
              Trocar é possível, mas no cartão de baixo — a troca pede a senha
              atual, e misturar isso com o salvar comum de nome e telefone
              seria pedir confusão. */}
          <Field label="✉️ E-mail (seu login)">
            <Input
              value={usuarioEmail ?? ''}
              readOnly
              className="bg-slate-100 text-slate-600"
              title={usuarioEmail ?? ''}
            />
            <p className="mt-1 text-xs text-slate-500">
              Para trocar, use <strong>Trocar e-mail de acesso</strong>, logo abaixo.
            </p>
          </Field>
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
            <Button variante="marca" disabled={salvandoPerfil}>
              {salvandoPerfil ? '⏳ Salvando…' : '💾 Salvar meus dados'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Sugestões de melhoria: canal direto do motorista para o Dispatcher */}
      <Card className="p-5">
        <h2 className="mb-1 font-bold text-slate-900">💡 Sugerir melhoria no app</h2>
        <p className="mb-3 text-xs text-slate-500">
          Achou algo confuso, faltando ou errado? Escreva aqui. Só o Dispatcher lê — nenhum outro
          motorista vê o que você mandou.
        </p>
        <form onSubmit={mandarSugestao} className="space-y-3">
          <textarea
            className="h-28 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-marca-texto"
            placeholder="Ex.: seria bom ver a rota do dia seguinte na véspera…"
            value={sugestao}
            onChange={(e) => setSugestao(e.target.value)}
            maxLength={4000}
          />
          {avisoSugestao && (
            <p
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                avisoSugestao.startsWith('✅')
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-red-300 bg-red-50 text-red-700'
              }`}
            >
              {avisoSugestao}
            </p>
          )}
          <div className="flex justify-end">
            <Button variante="marca" disabled={enviandoSugestao}>
              {enviandoSugestao ? '⏳ Enviando…' : '💡 Enviar sugestão'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Troca do e-mail de LOGIN */}
      <Card className="p-5">
        <h2 className="mb-1 font-bold text-slate-900">✉️ Trocar e-mail de acesso</h2>
        <p className="mb-3 text-xs text-slate-500">
          Este é o endereço com que você entra no app. Depois da troca, o login passa a ser o
          novo — a senha continua a mesma.
        </p>
        <form onSubmit={enviarEmail} className="space-y-3">
          <Field label="Novo e-mail">
            <Input
              type="email"
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              placeholder="voce@gmail.com"
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Senha atual (para confirmar que é você)">
            <Input
              type="password"
              value={senhaDoEmail}
              onChange={(e) => setSenhaDoEmail(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {avisoEmail && (
            <p
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                avisoEmail.ok
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-red-300 bg-red-50 text-red-700'
              }`}
            >
              {avisoEmail.texto}
            </p>
          )}
          <div className="flex justify-end">
            <Button variante="marca" disabled={trocandoEmail}>
              {trocandoEmail ? '⏳ Trocando…' : '✉️ Trocar e-mail'}
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
            <Button variante="marca" disabled={trocando}>
              {trocando ? '⏳ Trocando…' : '🔑 Trocar senha'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
