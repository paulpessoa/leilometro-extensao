;(function () {
  "use strict"
  const LM = globalThis.LM
  const $ = (s) => document.querySelector(s)

  $("#versao").textContent = LM.util.versao()

  LM.storage.getConfig().then((cfg) => {
    document.querySelectorAll("[data-cfg]").forEach((el) => {
      const v = cfg[el.dataset.cfg]
      el.value = el.dataset.tipo === "pct" ? Math.round(v * 100) : v
    })
  })

  document.querySelectorAll("[data-cfg]").forEach((el) =>
    el.addEventListener("change", async () => {
      const n = parseFloat(String(el.value).replace(",", "."))
      if (isNaN(n)) return
      await LM.storage.setConfig({ [el.dataset.cfg]: el.dataset.tipo === "pct" ? n / 100 : n })
      const msg = $("#msgSalvo")
      msg.className = "msg ok"
      msg.textContent = "✓ Salvo"
      setTimeout(() => (msg.className = "msg"), 2000)
    })
  )

  $("#testarSom").addEventListener("click", async () => {
    await LM.sound.destravar()
    const cfg = await LM.storage.getConfig()
    LM.sound.tocar("apito", cfg.volume)
  })
})()
