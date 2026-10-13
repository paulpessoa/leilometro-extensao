/**
 * Leilômetro — utilitários compartilhados (content script, páginas da extensão e Node)
 */
;(function (root) {
  "use strict"

  // ─── ESCAPE DE HTML ────────────────────────────────────────────────────────
  // Todo dado externo (site, API, usuário, IA) passa por aqui antes de ir para innerHTML
  function esc(v) {
    if (v == null) return ""
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }

  // ─── FORMATAÇÃO ────────────────────────────────────────────────────────────
  const BRL = (v) =>
    v != null && !isNaN(v)
      ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—"

  const BRL0 = (v) =>
    v != null && !isNaN(v)
      ? Number(v).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0
        })
      : "—"

  const NUM = (v) => (v != null && !isNaN(v) ? Number(v).toLocaleString("pt-BR") : "—")

  const PCT = (v, casas = 0) =>
    v != null && !isNaN(v) ? `${(v * 100).toFixed(casas).replace(".", ",")}%` : "—"

  const tsStr = (ts) =>
    ts
      ? new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : ""

  function tempoRelativo(ts) {
    if (!ts) return ""
    const diff = Date.now() - ts
    const s = Math.floor(diff / 1000)
    const min = Math.floor(diff / 60000)
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(diff / 86400000)
    if (s < 10) return "agora"
    if (s < 60) return `há ${s}s`
    if (min < 60) return `há ${min}min`
    if (h < 24) return `há ${h}h`
    if (d === 1) return "ontem"
    return `há ${d} dias`
  }

  function duracao(ms) {
    if (ms == null || isNaN(ms)) return "—"
    const neg = ms < 0
    let s = Math.floor(Math.abs(ms) / 1000)
    const d = Math.floor(s / 86400)
    s -= d * 86400
    const h = Math.floor(s / 3600)
    s -= h * 3600
    const m = Math.floor(s / 60)
    s -= m * 60
    const pad = (n) => String(n).padStart(2, "0")
    const txt = d > 0 ? `${d}d ${pad(h)}h${pad(m)}` : h > 0 ? `${h}h${pad(m)}m${pad(s)}s` : `${m}m${pad(s)}s`
    return neg ? `-${txt}` : txt
  }

  // ─── EXTRAÇÃO DE NÚMEROS DE TEXTO ──────────────────────────────────────────
  function extractNumber(str) {
    if (str == null) return null
    if (typeof str === "number") return isNaN(str) ? null : str
    const cleaned = String(str)
      .replace(/[R$\s ]/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
    const n = parseFloat(cleaned)
    return isNaN(n) ? null : n
  }

  function extractYear(str) {
    if (!str) return null
    const match = String(str).match(/\b(19[5-9]\d|20[0-4]\d)\b/)
    return match ? parseInt(match[1]) : null
  }

  function extractKM(str) {
    if (!str) return null
    const match = String(str).replace(/\./g, "").match(/(\d{3,7})/)
    return match ? parseInt(match[1]) : null
  }

  function numOuNull(v) {
    if (v === "" || v == null) return null
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."))
    return isNaN(n) ? null : n
  }

  // Hash curto e estável (para cache de respostas da IA)
  function hash(str) {
    let h = 5381
    const s = String(str)
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return (h >>> 0).toString(36)
  }

  // Mensagem "dispara e esquece" para o service worker (sem erro no console se ninguém responder)
  function enviar(msg) {
    try {
      const p = chrome.runtime.sendMessage(msg)
      if (p && typeof p.catch === "function") p.catch(() => {})
    } catch {}
  }

  function versao() {
    try {
      return chrome.runtime.getManifest().version
    } catch {
      return ""
    }
  }

  // ─── MARKDOWN MÍNIMO (saída da IA) ─────────────────────────────────────────
  // Escapa primeiro e só depois aplica negrito, títulos e listas
  function miniMarkdown(texto) {
    const linhas = esc(texto || "").split(/\r?\n/)
    let html = ""
    let emLista = false
    for (const linha of linhas) {
      const item = linha.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
      if (item) {
        if (!emLista) {
          html += "<ul>"
          emLista = true
        }
        html += `<li>${inline(item[1])}</li>`
        continue
      }
      if (emLista) {
        html += "</ul>"
        emLista = false
      }
      const titulo = linha.match(/^\s*#{1,6}\s+(.*)$/)
      if (titulo) html += `<p class="md-h">${inline(titulo[1])}</p>`
      else if (linha.trim()) html += `<p>${inline(linha)}</p>`
    }
    if (emLista) html += "</ul>"
    return html

    function inline(s) {
      return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
    }
  }

  const api = {
    esc,
    BRL,
    BRL0,
    NUM,
    PCT,
    tsStr,
    tempoRelativo,
    duracao,
    extractNumber,
    extractYear,
    extractKM,
    numOuNull,
    hash,
    enviar,
    versao,
    miniMarkdown
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api
  else (root.LM = root.LM || {}).util = api
})(globalThis)
