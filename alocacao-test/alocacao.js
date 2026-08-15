import { cidadesDoTexto } from "./planilha";
import { STATUS_DISPONIVEIS } from "./constants";
import { hojeISO } from "./dates";
const PARAMETROS_PADRAO = {
  id: "alocacao",
  janelaHistoricoDias: 90,
  pesoExperienciaCidade: 6,
  pesoExperienciaRota: 4,
  pesoRespeitarPlanoMeli: 5,
  pesoCidadesPreferidas: 3,
  pesoRodizio: 5,
  janelaRodizioDias: 7,
  maxVezesSeguidasMesmaCidade: 0,
  exigirDisponibilidadeAgenda: false,
  bonusDisponivelAgenda: 3,
  exigirVeiculoCompativel: false,
  equivalenciasVeiculo: "VUC = HR, Van\nUTILITARIO = Fiorino, Van, HR\nVE\xCDCULO DE PASSEIO = Carro passeio",
  atualizadoEm: ""
};
function parametrosAtuais(db) {
  return db.config.find((c) => c.id === "alocacao") ?? PARAMETROS_PADRAO;
}
function norm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}
function listaDeTexto(texto) {
  return (texto ?? "").split(/[,;\n]/).map((c) => norm(c)).filter(Boolean);
}
function parseEquivalencias(texto) {
  const mapa = /* @__PURE__ */ new Map();
  for (const linha of texto.split(/\n/)) {
    const [rota, cadastro] = linha.split("=");
    if (!rota || !cadastro) continue;
    mapa.set(norm(rota), new Set(cadastro.split(/[,;]/).map((v) => norm(v)).filter(Boolean)));
  }
  return mapa;
}
function sugerirAlocacao(db, data, p) {
  const itensDoDia = db.programacao.filter((i) => i.data === data);
  const dataMinima = p.janelaHistoricoDias > 0 ? hojeISO(-p.janelaHistoricoDias) : "0000-01-01";
  const historico = db.programacao.filter((i) => i.data < data && i.data >= dataMinima);
  const dataMinimaRodizio = hojeISO(-Math.max(1, p.janelaRodizioDias));
  const equivalencias = parseEquivalencias(p.equivalenciasVeiculo);
  const candidatos = db.motoristas.filter((m) => m.ativo && m.aprovado !== false);
  const porMotorista = /* @__PURE__ */ new Map();
  for (const h of historico) {
    if (!h.motoristaId) continue;
    const idx = porMotorista.get(h.motoristaId) ?? { porCidade: /* @__PURE__ */ new Map(), porRota: /* @__PURE__ */ new Map(), rodizioPorCidade: /* @__PURE__ */ new Map(), datasPorCidade: /* @__PURE__ */ new Map() };
    idx.porRota.set(h.rota, (idx.porRota.get(h.rota) ?? 0) + 1);
    for (const c of cidadesDoTexto(h.cidade)) {
      const cidade = norm(c);
      idx.porCidade.set(cidade, (idx.porCidade.get(cidade) ?? 0) + 1);
      if (h.data >= dataMinimaRodizio) idx.rodizioPorCidade.set(cidade, (idx.rodizioPorCidade.get(cidade) ?? 0) + 1);
      const datas = idx.datasPorCidade.get(cidade) ?? [];
      if (!datas.includes(h.data)) datas.push(h.data);
      idx.datasPorCidade.set(cidade, datas);
    }
    porMotorista.set(h.motoristaId, idx);
  }
  const disponiveisHoje = new Set(
    db.agenda.filter((a) => a.data === data && STATUS_DISPONIVEIS.includes(a.status)).map((a) => a.motoristaId)
  );
  const marcaramHoje = new Set(db.agenda.filter((a) => a.data === data).map((a) => a.motoristaId));
  const estourouSequencia = (motoristaId, cidades) => {
    if (p.maxVezesSeguidasMesmaCidade <= 0) return false;
    const idx = porMotorista.get(motoristaId);
    if (!idx) return false;
    return cidades.some((cidade) => {
      const datas = (idx.datasPorCidade.get(cidade) ?? []).sort().reverse();
      return datas.length >= p.maxVezesSeguidasMesmaCidade;
    });
  };
  const pares = [];
  for (const item of itensDoDia) {
    const cidades = cidadesDoTexto(item.cidade).map(norm);
    for (const m of candidatos) {
      const motivos = [];
      const alertas = [];
      const bloqueadas = listaDeTexto(m.cidadesBloqueadas);
      if (cidades.some((c) => bloqueadas.some((b) => c.includes(b) || b.includes(c)))) continue;
      if (p.exigirDisponibilidadeAgenda && !disponiveisHoje.has(m.id)) continue;
      if (marcaramHoje.has(m.id) && !disponiveisHoje.has(m.id)) continue;
      if (p.exigirVeiculoCompativel) {
        const aceitos = equivalencias.get(norm(item.veiculo));
        if (aceitos && aceitos.size > 0 && !aceitos.has(norm(m.veiculo))) continue;
      }
      if (estourouSequencia(m.id, cidades)) continue;
      let pontos = 0;
      const idx = porMotorista.get(m.id);
      const expCidade = cidades.reduce((s, c) => s + (idx?.porCidade.get(c) ?? 0), 0);
      if (expCidade > 0) {
        pontos += p.pesoExperienciaCidade * Math.min(1, expCidade / 8);
        motivos.push(`\u{1F3D9}\uFE0F ${expCidade}x nessa(s) cidade(s)`);
      } else {
        alertas.push("\u{1F195} sem hist\xF3rico na cidade");
      }
      const expRota = idx?.porRota.get(item.rota) ?? 0;
      if (expRota > 0) {
        pontos += p.pesoExperienciaRota * Math.min(1, expRota / 5);
        motivos.push(`\u{1F6E3}\uFE0F j\xE1 fez a ${item.rota} ${expRota}x`);
      }
      if (item.motoristaId === m.id || norm(item.driverPlanejado).startsWith(norm(m.nome).split(" ")[0])) {
        pontos += p.pesoRespeitarPlanoMeli;
        motivos.push("\u{1F4CB} era o plano do Meli");
      }
      const preferidas = listaDeTexto(m.cidadesPreferidas);
      if (cidades.some((c) => preferidas.some((f) => c.includes(f) || f.includes(c)))) {
        pontos += p.pesoCidadesPreferidas;
        motivos.push("\u2B50 cidade preferida dele");
      }
      const repeticao = cidades.reduce((s, c) => s + (idx?.rodizioPorCidade.get(c) ?? 0), 0);
      if (repeticao > 0) {
        pontos -= p.pesoRodizio * Math.min(1, repeticao / Math.max(1, p.janelaRodizioDias));
        alertas.push(`\u{1F501} foi ${repeticao}x nos \xFAltimos ${p.janelaRodizioDias} dias`);
      }
      if (disponiveisHoje.has(m.id)) {
        pontos += p.exigirDisponibilidadeAgenda ? 0 : p.bonusDisponivelAgenda;
        motivos.push("\u2705 dispon\xEDvel na agenda");
      }
      pares.push({ item, motorista: m, pontos, motivos, alertas });
    }
  }
  pares.sort((a, b) => b.pontos - a.pontos);
  const rotaPreenchida = /* @__PURE__ */ new Set();
  const motoristaUsado = /* @__PURE__ */ new Set();
  const escolhidos = /* @__PURE__ */ new Map();
  for (const par of pares) {
    if (rotaPreenchida.has(par.item.id) || motoristaUsado.has(par.motorista.id)) continue;
    rotaPreenchida.add(par.item.id);
    motoristaUsado.add(par.motorista.id);
    escolhidos.set(par.item.id, par);
  }
  return itensDoDia.slice().sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR", { numeric: true })).map((item) => {
    const e = escolhidos.get(item.id);
    return e ? { item, motorista: e.motorista, pontos: Math.round(e.pontos * 10) / 10, motivos: e.motivos, alertas: e.alertas } : { item, motorista: null, pontos: 0, motivos: [], alertas: ["\u274C nenhum motorista eleg\xEDvel (travas dos par\xE2metros)"] };
  });
}
export {
  PARAMETROS_PADRAO,
  parametrosAtuais,
  sugerirAlocacao
};
