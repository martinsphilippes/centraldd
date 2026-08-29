import { abrirImpressao } from './impressao'
// Exportações CSV / Excel / PDF sem dependências externas.
// - CSV: separador ";" + BOM (abre correto no Excel pt-BR)
// - Excel: tabela HTML com content-type de Excel (.xls)
// - PDF: janela de impressão formatada (Salvar como PDF)

export type Tabela = { titulo: string; colunas: string[]; linhas: (string | number)[][] }

function baixar(conteudo: string, nome: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

export function exportarCSV(t: Tabela) {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const linhas = [t.colunas, ...t.linhas].map((l) => l.map(esc).join(';')).join('\r\n')
  baixar('﻿' + linhas, `${t.titulo}.csv`, 'text/csv;charset=utf-8')
}

function tabelaHTML(t: Tabela): string {
  const esc = (v: string | number) =>
    String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<table border="1" cellspacing="0" cellpadding="4">
    <thead><tr>${t.colunas.map((c) => `<th style="background:#ffe600">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${t.linhas.map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`
}

export function exportarExcel(t: Tabela) {
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${tabelaHTML(t)}</body></html>`
  baixar(html, `${t.titulo}.xls`, 'application/vnd.ms-excel')
}

export function exportarPDF(t: Tabela, subtitulo?: string) {
  abrirImpressao(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>${t.titulo}</title>
    <style>
      body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      p.sub { color: #64748b; margin: 0 0 16px; font-size: 13px; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; }
      th { background: #ffe600; text-align: left; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
      tr:nth-child(even) td { background: #f8fafc; }
      footer { margin-top: 16px; font-size: 11px; color: #94a3b8; }
    </style></head><body>
    <h1>🚚 Central DD — ${t.titulo}</h1>
    <p class="sub">${subtitulo ?? `Gerado em ${new Date().toLocaleString('pt-BR')}`}</p>
    ${tabelaHTML(t)}
    <footer>Central DD • Dispatcher &amp; Driver • Operação Mercado Livre 📦</footer>
    </body></html>`)
}
