// ⚙️ Parametrização da operação, num modal compartilhado (Programação e
// Dashboard). Cada item traz a explicação embaixo, em linguagem de operador —
// a regra é: dá para entender o que o número faz sem perguntar a ninguém.

import { useState, type ReactNode } from 'react'
import { parametrosAtuais, PARAMETROS_PADRAO } from '../../core/alocacao'
import { salvarParametrosAlocacao, useDB } from '../../core/db'
import { hojeISO } from '../../core/dates'
import { frotaDoDia } from '../../core/vagas'
import type { ParametrosAlocacao } from '../../core/types'
import { Button, Input, Modal } from '../../components/ui'

/** Campo com título e explicação — todo item do modal usa este formato. */
function Item({
  titulo,
  explicacao,
  children,
}: {
  titulo: string
  explicacao: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-800">{titulo}</p>
      <p className="mb-2 mt-0.5 text-xs leading-relaxed text-slate-500">{explicacao}</p>
      {children}
    </div>
  )
}

export function ParametrosAlocacaoModal({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const db = useDB()
  const [p, setP] = useState<ParametrosAlocacao | null>(null)
  // A frota de hoje entra na explicação: o operador lê a regra já com o número
  // do dia dele na frente, em vez de um exemplo genérico.
  const frota = frotaDoDia(db, hojeISO())

  // Carrega os valores salvos quando o modal abre (e zera ao fechar).
  if (aberto && p === null) setP(parametrosAtuais(db))
  if (!aberto && p !== null) setP(null)

  const fechar = () => {
    setP(null)
    onFechar()
  }
  if (!p) return <Modal aberto={aberto} titulo="⚙️ Parametrização" onFechar={fechar}>{null}</Modal>

  const num = (campo: keyof ParametrosAlocacao, min: number, max: number, largura = 'w-24') => (
    <Input
      type="number"
      min={min}
      max={max}
      value={String(p[campo])}
      onChange={(e) => setP({ ...p, [campo]: Number(e.target.value) })}
      className={largura}
    />
  )

  return (
    <Modal aberto={aberto} titulo="⚙️ Parametrização" onFechar={fechar}>
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          Aqui você regula como o sistema <strong>distribui as rotas sozinho</strong> e as regras da
          disponibilidade. Os pesos vão de <strong>0 a 10</strong>: quanto maior, mais aquele
          critério manda na escolha do motorista — e <strong>zero desliga</strong> o critério.
          Tudo vale para a operação inteira, a partir de agora.
        </p>

        {/* ───────── Pesos ───────── */}
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pesos da distribuição</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Item
            titulo="📋 Respeitar o plano do Meli"
            explicacao="Quando a planilha do Meli já indica um motorista para a rota, este peso puxa a sugestão para manter o plano original."
          >
            {num('pesoRespeitarPlanoMeli', 0, 10)}
          </Item>
          <Item
            titulo="⭐ Cidades preferidas"
            explicacao="O que o motorista marcou na tela dele: ⭐ Prefiro pesa cheio, 👍 Posso pesa menos. Preferência decide a ORDEM — nunca impede ninguém de nenhuma cidade."
          >
            {num('pesoCidadesPreferidas', 0, 10)}
          </Item>
          <Item
            titulo="🔁 Força do rodízio"
            explicacao="Desconta pontos de quem já foi várias vezes à mesma cidade nos últimos dias, para revezar a frota. Zero desliga o rodízio."
          >
            {num('pesoRodizio', 0, 10)}
          </Item>
          <Item
            titulo="🔁 Janela do rodízio (dias)"
            explicacao="Quantos dias para trás o rodízio olha ao contar as idas repetidas. Ex.: 7 = só a última semana pesa no revezamento."
          >
            {num('janelaRodizioDias', 1, 60)}
          </Item>
          <Item
            titulo="✅ Bônus de quem marcou disponível"
            explicacao="Pontos extras para quem marcou DISPONÍVEL no dia — quem avisa primeiro sai na frente na distribuição."
          >
            {num('bonusDisponivelMarcado', 0, 10)}
          </Item>
          <Item
            titulo="🙏 Prioridade de quem ficou disponível no domingo"
            explicacao={
              p.limiarRotasPrioridadeDomingo > 0
                ? `Quem marcou DISPONÍVEL no domingo ganha ${p.pesoPrioridadeDomingo} ponto(s) de prioridade na semana seguinte — mas só nos dias FRACOS, com menos de ${p.limiarRotasPrioridadeDomingo} rota(s). Em dia cheio, com trabalho para todos, a prioridade não é necessária e não entra.`
                : 'Recompensa quem segura o domingo: na semana seguinte, ele sai na frente nos dias fracos (com menos rotas que o limiar). Preencha o limiar de rotas para ligar — 0 deixa desligada.'
            }
          >
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Peso da prioridade
                {num('pesoPrioridadeDomingo', 0, 10, 'w-20')}
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Vale em dia com menos de … rotas (0 = desligada)
                {num('limiarRotasPrioridadeDomingo', 0, 200, 'w-20')}
              </label>
            </div>
          </Item>
          <Item
            titulo="📆 Janela do histórico (dias)"
            explicacao="Até onde no passado o sistema olha para medir a experiência de cada um. 0 = considera a história inteira."
          >
            {num('janelaHistoricoDias', 0, 365)}
          </Item>
        </div>

        {/* ───────── Travas ───────── */}
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Travas — tiram o motorista da disputa
        </p>
        <div className="space-y-3">
          <Item
            titulo="✅ Só sugerir quem marcou disponível"
            explicacao="Ligada: quem não marcou DISPONÍVEL no dia nem aparece nas sugestões. Desligada: todo mundo concorre, e a marcação vira só o bônus acima."
          >
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={p.exigirDisponibilidadeMarcada}
                onChange={(e) => setP({ ...p, exigirDisponibilidadeMarcada: e.target.checked })}
              />
              {p.exigirDisponibilidadeMarcada ? 'Ligada' : 'Desligada'}
            </label>
          </Item>
          <Item
            titulo="🚐 Exigir veículo compatível"
            explicacao="Ligada: rota que pede VUC só cai para quem tem VUC (ou um equivalente da lista logo abaixo). Desligada: o veículo não trava, só conta ponto."
          >
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={p.exigirVeiculoCompativel}
                onChange={(e) => setP({ ...p, exigirVeiculoCompativel: e.target.checked })}
              />
              {p.exigirVeiculoCompativel ? 'Ligada' : 'Desligada'}
            </label>
          </Item>
          <Item
            titulo="🚫 Trava de sequência na mesma cidade"
            explicacao="Depois de N idas à mesma cidade no histórico recente, o motorista fica de fora daquela cidade até o rodízio girar. 0 = desligada."
          >
            {num('maxVezesSeguidasMesmaCidade', 0, 30)}
          </Item>
          <Item
            titulo="📌 Máximo de dias futuros marcados como disponível"
            explicacao="Quantos dias o motorista pode deixar agendados como DISPONÍVEL ao mesmo tempo. Trabalhou um dia (planejamento/rota encerrados), a vaga libera sozinha para ele marcar o próximo. 0 = sem limite."
          >
            {num('maxDiasDisponiveis', 0, 14)}
          </Item>
          <Item
            titulo="🔒 Horário de corte da disponibilidade"
            explicacao={
              p.horarioCorteDisponibilidade.trim()
                ? `Para entrar num dia, o motorista tem até as ${p.horarioCorteDisponibilidade} ${
                    p.diasAntecedenciaCorte === 0
                      ? 'do próprio dia'
                      : p.diasAntecedenciaCorte === 1
                        ? 'do dia anterior'
                        : `de ${p.diasAntecedenciaCorte} dias antes`
                  }. Depois disso ele não se declara mais disponível — mas avisar indisponibilidade continua livre, e você segue ajustando a disponibilidade de quem precisar.`
                : 'Sem corte: o motorista pode se declarar disponível a qualquer momento, até no próprio dia. Preencha o horário para fechar o dia com antecedência — ex.: 21:00 com 1 dia antes = a disponibilidade de amanhã fecha hoje às 21h.'
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Horário
                <Input
                  type="time"
                  value={p.horarioCorteDisponibilidade}
                  onChange={(e) => setP({ ...p, horarioCorteDisponibilidade: e.target.value })}
                  style={{ width: 'auto' }}
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Dias antes
                {num('diasAntecedenciaCorte', 0, 7, 'w-20')}
              </label>
              {p.horarioCorteDisponibilidade.trim() && (
                <Button variante="fantasma" onClick={() => setP({ ...p, horarioCorteDisponibilidade: '' })}>
                  🗑️ Tirar o corte
                </Button>
              )}
            </div>
          </Item>
        </div>

        {/* ───────── Frota do dia ───────── */}
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Frota do dia — quantos de cada veículo entram
        </p>
        <div className="space-y-3">
          <Item
            titulo="🚐 Respeitar a quantidade de cada veículo"
            explicacao={
              frota.total > 0
                ? `Ligada: o planejamento leva no máximo o que o dia comporta de CADA veículo, e o excedente vai para a fila de espera. Hoje o ${frota.fonte} tem ${frota.vagas
                    .map((v) => `${v.vagas} ${v.tipo}`)
                    .join(' · ')}${frota.livres > 0 ? ` · ${frota.livres} sem veículo definido` : ''} — é exatamente esse mix que o planejamento vai respeitar. Desligada: entram os melhores da meta, seja qual for o veículo.`
                : 'Ligada: o planejamento leva no máximo o que o dia comporta de CADA veículo (ex.: modelo com 2 VUC = só 2 motoristas de VUC entram, o resto vai para a fila de espera). A conta vem do modelo do dia, da programação do Meli ou da roteirização — o que existir. Hoje ainda não há nenhum dos três carregado, então a regra fica em espera.'
            }
          >
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={p.respeitarFrotaDoDia}
                onChange={(e) => setP({ ...p, respeitarFrotaDoDia: e.target.checked })}
              />
              {p.respeitarFrotaDoDia ? 'Ligada' : 'Desligada'}
            </label>
          </Item>
          <Item
            titulo="🔁 Rodízio da frota — trabalhar em dias alternados"
            explicacao="Ligada: quando um veículo tem mais motoristas que vagas, entra primeiro quem está há mais tempo sem trabalhar (quem nunca trabalhou vem na frente de todos). É o que faz, por exemplo, os motoristas de VUC se revezarem nos dias de pouca vaga em vez de serem sempre os mesmos dois. Desligada: a ordem segue só pelos outros critérios, e quem responde sempre primeiro tende a repetir."
          >
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={p.rodizioPorVeiculo}
                onChange={(e) => setP({ ...p, rodizioPorVeiculo: e.target.checked })}
              />
              {p.rodizioPorVeiculo ? 'Ligada' : 'Desligada'}
            </label>
          </Item>
        </div>

        {/* ───────── Veículos ───────── */}
        <Item
          titulo="🚐 Equivalências de veículo"
          explicacao="Ensina quais veículos do cadastro servem para cada veículo pedido na rota. Uma regra por linha: veículo da rota = veículos aceitos, separados por vírgula. Ex.: VUC = HR, Van."
        >
          <textarea
            className="h-20 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs outline-none focus:border-ml-azul"
            value={p.equivalenciasVeiculo}
            onChange={(e) => setP({ ...p, equivalenciasVeiculo: e.target.value })}
          />
        </Item>

        {/* ───────── Limite de vagas ───────── */}
        <Item
          titulo="🎯 Limite de disponíveis por dia"
          explicacao="Quantos motoristas podem se marcar DISPONÍVEL num mesmo dia. Limite = rotas planejadas + reserva. Ex.: 55 rotas com 10% e +0 fixo = 61 vagas. A reserva cobre furo de última hora sem encher demais; na tela Disponibilidade dá para sobrescrever o limite de um dia específico à mão."
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={p.limiteAutomatico}
                onChange={(e) => setP({ ...p, limiteAutomatico: e.target.checked })}
              />
              Calcular pelo planejamento do dia (rotas do Meli, resumo ou roteirização)
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Reserva sobre as rotas (%)
                {num('limiteFolgaPercentual', 0, 100, 'w-20')}
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Reserva fixa (motoristas a mais)
                {num('limiteFolgaFixa', 0, 50, 'w-20')}
              </label>
            </div>
          </div>
        </Item>

        {/* ───────── Auto-alocação ───────── */}
        <div className="rounded-lg border border-ml-amarelo bg-yellow-50 p-3">
          <p className="text-sm font-semibold text-slate-800">⚡ Auto-alocação por confiança</p>
          <p className="mb-2 mt-0.5 text-xs leading-relaxed text-slate-600">
            O sistema calcula uma confiança (0 a 100%) para cada sugestão de motorista × rota. Com
            este valor preenchido, o botão ⚡ Auto-alocar aplica sozinho as sugestões com confiança
            igual ou acima dele, deixando só as duvidosas para você revisar. Comece alto (ex.: 85) e
            vá baixando conforme a frota engrena. 0 = desligada.
          </p>
          {num('autoAplicarAcimaDe', 0, 100)}
        </div>

        <div className="flex justify-between gap-2">
          <Button variante="fantasma" onClick={() => setP({ ...PARAMETROS_PADRAO })}>
            ↩️ Restaurar padrão
          </Button>
          <div className="flex gap-2">
            <Button variante="secundario" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              variante="ml"
              onClick={() => {
                salvarParametrosAlocacao(p)
                fechar()
              }}
            >
              💾 Salvar parâmetros
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
