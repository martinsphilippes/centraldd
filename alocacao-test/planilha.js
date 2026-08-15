const COLUNAS = [
  "cidade",
  "rotaExpedicao",
  "rotaOriginal",
  "base",
  "veiculo",
  "km",
  "dps",
  "ocupacao",
  "transportadora"
];
function detectarSeparador(linha) {
  if (linha.includes("	")) return "	";
  if ((linha.match(/;/g)?.length ?? 0) >= (linha.match(/,/g)?.length ?? 0)) return ";";
  return ",";
}
function limpar(celula) {
  let s = celula.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).replace(/""/g, '"');
  return s.trim();
}
function dataParaISO(celula) {
  const m = celula.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function parsearPlanilhaMeli(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const itens = [];
  let ignoradas = 0;
  for (const linha of linhas) {
    const sep = detectarSeparador(linha);
    const celulas = linha.split(sep).map(limpar);
    const data = dataParaISO(celulas[0] ?? "");
    if (!data) {
      if (!/^data$/i.test(celulas[0] ?? "") && celulas.filter(Boolean).length > 2) ignoradas++;
      continue;
    }
    const [, driver, rota, cidade, veiculo, onda, doca] = celulas;
    if (!driver || !rota) {
      ignoradas++;
      continue;
    }
    itens.push({
      data,
      driverPlanejado: driver,
      rota,
      cidade: cidade ?? "",
      veiculo: veiculo ?? "",
      onda: onda ?? "",
      doca: doca ?? ""
    });
  }
  return { itens, ignoradas };
}
function cidadesDoTexto(cidade) {
  return cidade.split(/[/+]/).map((c) => c.trim()).filter((c) => c.length > 1).filter((c) => !/^ajuda$/i.test(c)).filter((c) => !/^(vd|vl|vg|g|d)\d+$/i.test(c.replace(/\s/g, "")));
}
function parsearPlanilhaRotas(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const rotas = [];
  let ignoradas = 0;
  for (const linha of linhas) {
    const sep = detectarSeparador(linha);
    const celulas = linha.split(sep).map(limpar);
    if (/^cidade$/i.test(celulas[0] ?? "")) continue;
    if (celulas.length < 2 || !celulas[0] || !celulas[1]) {
      ignoradas++;
      continue;
    }
    const rota = {};
    COLUNAS.forEach((c, i) => {
      rota[c] = celulas[i] ?? "";
    });
    rotas.push(rota);
  }
  return { rotas, ignoradas };
}
export {
  cidadesDoTexto,
  parsearPlanilhaMeli,
  parsearPlanilhaRotas
};
