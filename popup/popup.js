;(function () {
  "use strict"
  const LM = globalThis.LM
  const { esc, BRL0, tempoRelativo } = LM.util
  const $ = (s) => document.querySelector(s)

  $("#versao").textContent = LM.util.versao()

  // ─── TABS ──────────────────────────────────────────────────────────────────
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"))
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"))
      tab.classList.add("active")
      document.getElementById("panel-" + tab.dataset.tab).classList.add("active")
    })
  })

  const abrir = (path) => chrome.tabs.create({ url: chrome.runtime.getURL(path) })
  $("#btnComparar").addEventListener("click", () => abrir("compare/compare.html"))
  $("#btnConfig").addEventListener("click", () => chrome.runtime.openOptionsPage())
  $("#linkBoasVindas").addEventListener("click", (e) => {
    e.preventDefault()
    abrir("welcome/welcome.html")
  })

  // ─── LOTES ─────────────────────────────────────────────────────────────────
  let filtro = "todos"
  document.querySelectorAll("[data-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      filtro = b.dataset.filtro
      document.querySelectorAll("[data-filtro]").forEach((x) => x.classList.toggle("on", x === b))
      renderizar()
    })
  )

  async function renderizar() {
    const [lotes, config] = await Promise.all([LM.storage.listLots(), LM.storage.getConfig()])
    $("#nComparar").textContent = lotes.filter((l) => l.comparar).length
    const lista = filtro === "favoritos" ? lotes.filter((l) => l.favorito) : lotes
    $("#lotes-counter").textContent = lotes.length ? `Lotes salvos · ${lotes.length}` : "Lotes salvos"
    $("#lotes-empty").style.display = lista.length ? "none" : "block"

    $("#lotes-list").innerHTML = lista
      .map((lot) => {
        const { snapshot: s, calc: c } = LM.calc.analisar(lot.snapshot || {}, lot.user || {}, config)
        const info = LM.calc.getScoreLabel(c.score)
        const graves = LM.calc.sinaisDeAtencao(s).filter((x) => x.nivel === "alto")
        const meta = [
          graves.length ? `<span class="lot-alerta" title="${esc(graves.map((x) => x.titulo).join(" · "))}">⚠️ ${esc(graves[0].titulo.toLowerCase())}</span>` : null,
          c.lance ? `<b>${BRL0(c.lance)}</b>` : null,
          s.ano,
          tempoRelativo(lot.updatedAt)
        ]
          .filter(Boolean)
          .join(" · ")
        return `
        <div class="lot-item">
          <div class="lot-score" style="background:${c.score != null ? info.color : "#30363d"}" title="Score ${c.score ?? "—"}">${c.score ?? "—"}</div>
          <div class="lot-info" data-abrir="${esc(lot.url || "")}" title="${esc(s.modelo)}">
            <span class="lot-modelo">${esc(s.modelo || "Veículo")}</span>
            <span class="lot-meta">${meta}</span>
          </div>
          <div class="lot-acoes">
            <button class="ibtn ${lot.favorito ? "on" : ""}" data-fav="${esc(lot.id)}" title="${lot.favorito ? "Desmarcar (cancela o lembrete)" : "Marcar e lembrar antes do encerramento"}">${lot.favorito ? "★" : "☆"}</button>
            <button class="ibtn ${lot.comparar ? "on" : ""}" data-cmp="${esc(lot.id)}" title="${lot.comparar ? "Tirar do comparador" : "Adicionar ao comparador"}">⚖️</button>
            <button class="ibtn del" data-del="${esc(lot.id)}" title="Remover">×</button>
          </div>
        </div>`
      })
      .join("")
  }

  $("#lotes-list").addEventListener("click", async (e) => {
    const el = e.target.closest("[data-abrir],[data-fav],[data-cmp],[data-del]")
    if (!el) return
    if (el.dataset.abrir !== undefined) {
      if (el.dataset.abrir) chrome.tabs.create({ url: el.dataset.abrir })
      return
    }
    if (el.dataset.fav) {
      const lot = await LM.storage.getLot(el.dataset.fav)
      await LM.storage.saveLot(el.dataset.fav, { favorito: !lot?.favorito })
    } else if (el.dataset.cmp) {
      const lot = await LM.storage.getLot(el.dataset.cmp)
      await LM.storage.saveLot(el.dataset.cmp, { comparar: !lot?.comparar })
    } else if (el.dataset.del) {
      if (!confirm("Remover este lote e as anotações dele?")) return
      await LM.storage.deleteLot(el.dataset.del)
    }
    renderizar()
  })

  LM.storage.migrarIndiceLegado().finally(renderizar)
})()
