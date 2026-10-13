/**
 * Leilômetro — inicialização do content script
 * Carregado por último (ver manifest.json → content_scripts.js)
 */
;(function () {
  "use strict"
  const LM = globalThis.LM

  // ─── EASTER EGG — CONSOLE ──────────────────────────────────────────────────
  ;(function () {
    const logo = [
      " ██╗     ███████╗██╗██╗      ██████╗ ███╗   ███╗███████╗████████╗██████╗  ██████╗ ",
      " ██║     ██╔════╝██║██║     ██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗",
      " ██║     █████╗  ██║██║     ██║   ██║██╔████╔██║█████╗     ██║   ██████╔╝██║   ██║",
      " ██║     ██╔══╝  ██║██║     ██║   ██║██║╚██╔╝██║██╔══╝     ██║   ██╔══██╗██║   ██║",
      " ███████╗███████╗██║███████╗╚██████╔╝██║ ╚═╝ ██║███████╗   ██║   ██║  ██║╚██████╔╝",
      " ╚══════╝╚══════╝╚═╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝"
    ].join("\n")
    console.log("%c" + logo, "color: #f0ba32; font-family: monospace; font-size: 11px; line-height: 1.4;")
    console.log(
      `%c  v${LM.util.versao()} — Análise de leilões de veículos em tempo real`,
      "color: #888; font-family: monospace; font-size: 11px;"
    )
  })()

  // ─── ROTA (o site é SPA: a URL muda sem recarregar a página) ──────────────
  let ultimaRota = null
  let pendente = null

  function handleRoute() {
    const rota = window.location.pathname
    if (rota === ultimaRota) return
    ultimaRota = rota

    clearTimeout(pendente)
    LM.live.desmontar()
    LM.panel.descarregar()

    if (!LM.scrape.isVehiclePage()) return
    const loteId = LM.scrape.getLoteId()
    // Aguarda o site renderizar o novo lote antes de ler o DOM
    pendente = setTimeout(() => {
      if (window.location.pathname !== rota) return
      LM.panel.abrir(loteId).catch((e) => console.error("[Leilômetro] falha ao abrir o painel:", e))
    }, 1200)
  }

  async function init() {
    try {
      await LM.storage.migrarLocalStorageDoSite()
      await LM.storage.migrarIndiceLegado()
    } catch (e) {
      console.warn("[Leilômetro] migração de dados antigos falhou:", e)
    }

    handleRoute()
    setInterval(() => {
      handleRoute()
      LM.panel.garantir()
    }, 1000)
    window.addEventListener("popstate", handleRoute)

    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l"))) return
      if (!LM.scrape.isVehiclePage()) return
      e.preventDefault()
      if (LM.panel.aberto()) LM.panel.fechar({ peloUsuario: true })
      else if (LM.panel.estado.analise) LM.panel.reabrir()
      else LM.panel.abrir(LM.scrape.getLoteId())
    })
  }

  init()
})()
