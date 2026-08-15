const DIAS = ["Domingo", "Segunda-feira", "Ter\xE7a-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "S\xE1bado"];
function hojeISO(offsetDias = 0) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + offsetDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatarData(iso) {
  const d = parseISODate(iso);
  return d.toLocaleDateString("pt-BR");
}
function formatarDataLonga(iso) {
  const d = parseISODate(iso);
  return `${DIAS[d.getDay()]} \u2022 ${d.toLocaleDateString("pt-BR")}`;
}
function formatarDataHora(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
function ehHoje(iso) {
  return iso === hojeISO();
}
function rotuloDia(iso) {
  if (iso === hojeISO()) return `Hoje \u2022 ${formatarData(iso)}`;
  if (iso === hojeISO(1)) return `Amanh\xE3 \u2022 ${formatarData(iso)}`;
  return formatarDataLonga(iso);
}
export {
  ehHoje,
  formatarData,
  formatarDataHora,
  formatarDataLonga,
  hojeISO,
  parseISODate,
  rotuloDia
};
