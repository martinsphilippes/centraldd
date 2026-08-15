const STATUS_RESPOSTA = {
  disponivel: {
    label: "Dispon\xEDvel",
    emoji: "\u{1F7E2}",
    cor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "#10b981",
    disponibilidade: "total"
  },
  apos_horario: {
    label: "Dispon\xEDvel ap\xF3s hor\xE1rio",
    emoji: "\u{1F7E1}",
    cor: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "#f59e0b",
    disponibilidade: "parcial"
  },
  meio_periodo: {
    label: "Apenas meio per\xEDodo",
    emoji: "\u{1F535}",
    cor: "bg-blue-100 text-blue-800 border-blue-200",
    dot: "#3483fa",
    disponibilidade: "parcial"
  },
  indisponivel: {
    label: "Indispon\xEDvel",
    emoji: "\u{1F534}",
    cor: "bg-red-100 text-red-800 border-red-200",
    dot: "#ef4444",
    disponibilidade: "nenhuma"
  },
  folga: {
    label: "Folga",
    emoji: "\u{1F3D6}\uFE0F",
    cor: "bg-cyan-100 text-cyan-800 border-cyan-200",
    dot: "#06b6d4",
    disponibilidade: "nenhuma"
  },
  atestado: {
    label: "Atestado",
    emoji: "\u{1F912}",
    cor: "bg-orange-100 text-orange-800 border-orange-200",
    dot: "#f97316",
    disponibilidade: "nenhuma"
  },
  ferias: {
    label: "F\xE9rias",
    emoji: "\u2708\uFE0F",
    cor: "bg-violet-100 text-violet-800 border-violet-200",
    dot: "#8b5cf6",
    disponibilidade: "nenhuma"
  },
  outro: {
    label: "Outro motivo",
    emoji: "\u{1F4DD}",
    cor: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "#64748b",
    disponibilidade: "nenhuma"
  }
};
const ORDEM_STATUS = [
  "disponivel",
  "apos_horario",
  "meio_periodo",
  "indisponivel",
  "folga",
  "atestado",
  "ferias",
  "outro"
];
const STATUS_DISPONIVEIS = ["disponivel", "apos_horario", "meio_periodo"];
const OPERACOES = ["\u{1F4E6} Mercado Livre", "\u{1F4EC} Coletas", "\u{1F504} Reversa", "\u26A1 Same Day"];
const VEICULOS = ["Van", "Fiorino", "HR", "Moto", "Carro passeio"];
export {
  OPERACOES,
  ORDEM_STATUS,
  STATUS_DISPONIVEIS,
  STATUS_RESPOSTA,
  VEICULOS
};
