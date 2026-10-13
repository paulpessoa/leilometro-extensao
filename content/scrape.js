/**
 * Leilômetro — detecção da página de veículo e leitura dos dados do lote
 * Ordem: API oficial → DOM (layout "julho2026") → JSON-LD
 */
;(function () {
  "use strict"
  const LM = globalThis.LM
  const { extractNumber, extractYear, extractKM } = LM.util

  // ─── DETECÇÃO DE PÁGINA DE VEÍCULO ────────────────────────────────────────
  // Rota atual: /lote/<uuid>/  |  rota legada: /leilao/<slug>/<uuid>
  const VEHICLE_PAGE_PATTERNS = {
    "leilo.com.br":
      /\/(?:lote|leilao\/.+)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
  }

  function isVehiclePage() {
    const host = window.location.hostname
    const path = window.location.pathname
    for (const [domain, pattern] of Object.entries(VEHICLE_PAGE_PATTERNS)) {
      if (host.includes(domain) && pattern.test(path)) return true
    }
    return false
  }

  function getLoteId() {
    const m = window.location.pathname.match(
      /\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
    )
    return m ? m[1].toLowerCase() : null
  }

  // URL canônica do lote (sem a query de listagem)
  function urlDoLote() {
    return window.location.origin + window.location.pathname
  }

  // ─── SELETORES DO SITE (ver DIAGNOSTICO_LEILO.md) ──────────────────────────
  // O sufixo "-julho2026" muda a cada redesign do site — é o primeiro sintoma de quebra.
  const SELETORES = {
    lance: [
      "strong.painel-lances-julho2026__valor",
      ".painel-lances-julho2026__valor",
      "[class*='painel-lances'][class*='__valor']"
    ],
    modelo: [
      "h1.pagina-lote-julho2026__titulo",
      "[class*='pagina-lote'][class*='__titulo']",
      "h1.nome-lote",
      "h1"
    ],
    infoItem: ".informacoes-lote-julho2026__item",
    infoLabel: ".informacoes-lote-julho2026__label",
    infoValor: ".informacoes-lote-julho2026__value",
    painelLances: [".painel-lances-julho2026", ".painel-lances-julho2026__valor"]
  }

  function primeiroTexto(lista) {
    for (const sel of lista) {
      try {
        const el = document.querySelector(sel)
        const t = el?.textContent?.trim()
        if (t) return t
      } catch {}
    }
    return null
  }

  function lerLanceDoDom() {
    return extractNumber(primeiroTexto(SELETORES.lance))
  }

  function elementoDoPainelDeLances() {
    for (const sel of SELETORES.painelLances) {
      const el = document.querySelector(sel)
      if (el) return el
    }
    return null
  }

  // ─── FALLBACK: DOM ─────────────────────────────────────────────────────────
  function snapshotDoDom() {
    const info = {}
    try {
      document.querySelectorAll(SELETORES.infoItem).forEach((it) => {
        const lbl = it.querySelector(SELETORES.infoLabel)?.textContent?.trim()?.toLowerCase() || ""
        const val = it.querySelector(SELETORES.infoValor)?.textContent?.trim() || ""
        if (lbl && val) info[lbl] = val
      })
    } catch {}

    const porRotulo = (re) => {
      for (const [lbl, val] of Object.entries(info)) if (re.test(lbl)) return val
      return null
    }

    const kmTxt = porRotulo(/km|quilo/i)
    const km = kmTxt && !/inacess[ií]vel|n[aã]o|sem/i.test(kmTxt) ? extractKM(kmTxt) : null
    const modelo = primeiroTexto(SELETORES.modelo)

    return {
      modelo: modelo ? modelo.replace(/\s+/g, " ").slice(0, 80) : null,
      ano: extractYear(porRotulo(/^ano/i)),
      km,
      combustivel: LM.api.normalizarCombustivel(porRotulo(/combust/i)),
      lance: lerLanceDoDom(),
      fipeScraped: extractNumber(porRotulo(/valor\s*(de\s*)?mercado|fipe/i)),
      tipoRetomada: porRotulo(/retomada|origem/i),
      fonte: Object.keys(info).length ? "Página" : null,
      lidoEm: Date.now()
    }
  }

  // ─── FALLBACK: JSON-LD ─────────────────────────────────────────────────────
  function snapshotDoJsonLd() {
    try {
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        const j = JSON.parse(s.textContent || "null")
        const item = Array.isArray(j) ? j[0] : j
        if (!item) continue
        const tipos = [].concat(item["@type"] || [])
        if (!tipos.includes("Product") && !tipos.includes("Vehicle") && !item.offers) continue
        return {
          modelo: item.name || item.model || null,
          ano: extractYear(item.vehicleModelDate || item.productionDate),
          lance: extractNumber(item.offers?.price),
          combustivel: item.fuelType || null,
          fonte: "JSON-LD",
          lidoEm: Date.now()
        }
      }
    } catch {}
    return null
  }

  // ─── COLETA ────────────────────────────────────────────────────────────────
  async function coletarDados(loteId, { forcar = false } = {}) {
    let snapshot = null
    try {
      snapshot = await LM.api.buscarLote(loteId, { forcar })
    } catch (e) {
      console.warn("[Leilômetro] API indisponível, usando a página:", e)
    }

    const dom = snapshotDoDom()
    if (snapshot) {
      // Durante o pregão o DOM é atualizado antes da API
      if (dom.lance && dom.lance > (snapshot.lance || 0)) {
        snapshot.lance = dom.lance
        snapshot.fonte = "API + página"
      }
      return snapshot
    }

    const ld = snapshotDoJsonLd() || {}
    const mesclado = { ...ld }
    for (const [k, v] of Object.entries(dom)) if (v != null) mesclado[k] = v
    mesclado.modelo = mesclado.modelo || document.title.split(/[-|]/)[0].trim().slice(0, 80) || "Veículo"
    mesclado.fonte = dom.fonte || ld.fonte || "Página"
    return mesclado
  }

  LM.scrape = {
    isVehiclePage,
    getLoteId,
    urlDoLote,
    coletarDados,
    lerLanceDoDom,
    elementoDoPainelDeLances
  }
})()
