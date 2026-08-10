// Dados de demonstração: frota realista, chamadas do dia e respostas parciais,
// para o app abrir já "vivo" e permitir testar todos os fluxos.

import type { DB, Motorista, Resposta, StatusResposta } from './types'
import { hojeISO } from './dates'

const NOMES = [
  'Carlos Silva', 'André Souza', 'Marcos Oliveira', 'João Pereira', 'Rafael Costa',
  'Bruno Almeida', 'Felipe Santos', 'Lucas Rodrigues', 'Thiago Lima', 'Diego Fernandes',
  'Gustavo Araújo', 'Eduardo Ribeiro', 'Renato Carvalho', 'Paulo Gomes', 'Vinícius Martins',
  'Leandro Barbosa', 'Rodrigo Rocha', 'Fábio Dias', 'Alexandre Moreira', 'Sérgio Nunes',
  'Juliana Mendes', 'Patrícia Ramos', 'Fernanda Cardoso', 'Camila Teixeira', 'Aline Freitas',
  'Roberta Pinto', 'Daniel Azevedo', 'Márcio Correia', 'Wesley Cavalcanti', 'Igor Monteiro',
]

const CIDADES = ['São Paulo', 'Guarulhos', 'Osasco', 'Barueri']
const EQUIPES = ['Equipe Alfa', 'Equipe Bravo', 'Equipe Charlie']
const VEICULOS = ['Van', 'Fiorino', 'HR', 'Van', 'Fiorino', 'Moto']

export function criarSeed(): DB {
  const motoristas: Motorista[] = NOMES.map((nome, i) => ({
    id: `mot-${i + 1}`,
    nome,
    telefone: `119${String(80000000 + i * 137137).slice(0, 8)}`,
    cidade: CIDADES[i % CIDADES.length],
    equipe: EQUIPES[i % EQUIPES.length],
    operacao: '📦 Mercado Livre',
    veiculo: VEICULOS[i % VEICULOS.length],
    ativo: true,
    criadoEm: new Date(Date.now() - (60 - i) * 86400000).toISOString(),
  }))

  const hoje = hojeISO()
  const amanha = hojeISO(1)

  const chamadas = [
    {
      id: 'cha-1',
      titulo: 'Disponibilidade para Entregas',
      data: hoje,
      operacao: '📦 Mercado Livre',
      horarioInicio: '07:00',
      horarioFim: '18:00',
      qtdNecessaria: 20,
      status: 'aberta' as const,
      criadaEm: new Date(Date.now() - 4 * 3600000).toISOString(),
    },
    {
      id: 'cha-2',
      titulo: 'Disponibilidade para Coletas',
      data: amanha,
      operacao: '📬 Coletas',
      horarioInicio: '08:00',
      horarioFim: '17:00',
      qtdNecessaria: 12,
      status: 'aberta' as const,
      criadaEm: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
  ]

  // ~75% da frota já respondeu a chamada de hoje, com distribuição realista.
  const distribuicao: [StatusResposta, number][] = [
    ['disponivel', 14],
    ['apos_horario', 2],
    ['meio_periodo', 2],
    ['indisponivel', 2],
    ['folga', 1],
    ['atestado', 1],
    ['ferias', 1],
  ]
  const respostas: Resposta[] = []
  let idx = 0
  for (const [status, qtd] of distribuicao) {
    for (let k = 0; k < qtd; k++, idx++) {
      const m = motoristas[idx]
      respostas.push({
        id: `res-${idx + 1}`,
        chamadaId: 'cha-1',
        motoristaId: m.id,
        status,
        horario: status === 'apos_horario' ? (k % 2 === 0 ? '12:00' : '14:00') : undefined,
        periodo: status === 'meio_periodo' ? (k % 2 === 0 ? 'manha' : 'tarde') : undefined,
        observacao: undefined,
        respondidaEm: new Date(Date.now() - (200 - idx * 7) * 60000).toISOString(),
      })
    }
  }

  return {
    motoristas,
    chamadas,
    respostas,
    escalas: [],
    notificacoes: [
      {
        id: 'not-1',
        motoristaId: null,
        titulo: 'Bem-vindo ao MLDisponibilidade',
        mensagem: 'Responda a chamada de hoje em um toque na aba Responder.',
        lida: false,
        criadaEm: new Date().toISOString(),
      },
    ],
  }
}
