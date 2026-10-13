;(function () {
  "use strict"
  const LM = globalThis.LM
  const $ = (s) => document.querySelector(s)
  const $$ = (s) => document.querySelectorAll(s)

  $("#versao").textContent = LM.util.versao()

  // ─── ABAS (aceita #ia, #alertas… na URL) ──────────────────────────────────
  function abrirAba(id) {
    if (!$(`#aba-${id}`)) id = "calculo"
    $$(".tab").forEach((t) => t.classList.toggle("ativa", t.dataset.aba === id))
    $$(".aba").forEach((a) => a.classList.toggle("ativa", a.id === `aba-${id}`))
    if (id === "dados") carregarEstatisticas()
  }
  $$(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      history.replaceState(null, "", `#${t.dataset.aba}`)
      abrirAba(t.dataset.aba)
    })
  )
  abrirAba(location.hash.slice(1))
  window.addEventListener("hashchange", () => abrirAba(location.hash.slice(1)))

  function mostrar(el, texto, tipo = "ok") {
    el.className = `msg ${tipo}`
    el.textContent = texto
    if (tipo === "ok") setTimeout(() => (el.className = "msg"), 2500)
  }

  // ─── CONFIGURAÇÃO (salva automaticamente) ─────────────────────────────────
  async function carregarConfig() {
    const cfg = await LM.storage.getConfig()
    $$("[data-cfg]").forEach((el) => {
      const v = cfg[el.dataset.cfg]
      const tipo = el.dataset.tipo
      if (tipo === "bool") el.checked = !!v
      else if (tipo === "pct") el.value = Math.round(v * 1000) / 10
      else if (tipo === "vol") el.value = Math.round(v * 100)
      else el.value = v
    })
  }

  $$("[data-cfg]").forEach((el) =>
    el.addEventListener("change", async () => {
      const tipo = el.dataset.tipo
      let valor
      if (tipo === "bool") valor = el.checked
      else {
        const n = parseFloat(String(el.value).replace(",", "."))
        if (isNaN(n)) return
        valor = tipo === "pct" ? n / 100 : tipo === "vol" ? n / 100 : n
      }
      await LM.storage.setConfig({ [el.dataset.cfg]: valor })
      mostrar($("#msgSalvo"), "✓ Salvo — os painéis abertos já usam o novo valor")
    })
  )

  carregarConfig()

  // ─── TESTE DE SOM ──────────────────────────────────────────────────────────
  async function testarSom(padrao) {
    await LM.sound.destravar()
    LM.sound.tocar(padrao, parseInt($("#volume").value) / 100)
  }
  $("#testarApito").addEventListener("click", () => testarSom("apito"))
  $("#testarCritico").addEventListener("click", () => testarSom("critico"))

  // ─── IA ────────────────────────────────────────────────────────────────────
  const PROV = LM.ai.PROVEDORES

  function provedorSelecionado() {
    return document.querySelector('input[name="provedor"]:checked')?.value || "openai"
  }

  function atualizarProvedorUi() {
    const p = PROV[provedorSelecionado()]
    $("#linkChave").href = p.chaveUrl
    $("#modelo").placeholder = p.modeloPadrao
  }

  async function carregarIa() {
    const ai = await LM.storage.getAi()
    const radio = document.querySelector(`input[name="provedor"][value="${ai.provedor}"]`)
    if (radio) radio.checked = true
    $("#chave").value = ai.chave || ""
    $("#modelo").value = ai.modelo || ""
    $("#incluirNotas").checked = ai.incluirNotas !== false
    atualizarProvedorUi()
    if (ai.chave) {
      const temPermissao = await chrome.permissions.contains({ origins: [PROV[ai.provedor].origem] })
      if (!temPermissao) mostrar($("#msgIa"), "A chave está salva, mas falta autorizar o acesso ao provedor. Clique em “Salvar e autorizar”.", "erro")
    }
  }

  $$('input[name="provedor"]').forEach((r) =>
    r.addEventListener("change", () => {
      $("#modelo").value = ""
      $("#listaModelos").innerHTML = ""
      atualizarProvedorUi()
    })
  )

  $("#mostrarChave").addEventListener("click", () => {
    const i = $("#chave")
    i.type = i.type === "password" ? "text" : "password"
  })

  $("#incluirNotas").addEventListener("change", (e) => LM.storage.setAi({ incluirNotas: e.target.checked }))

  // chrome.permissions.request precisa ser a primeira coisa no clique (gesto do usuário)
  function pedirPermissao() {
    return chrome.permissions.request({ origins: [PROV[provedorSelecionado()].origem] })
  }

  $("#salvarIa").addEventListener("click", async () => {
    const pedido = pedirPermissao()
    const chave = $("#chave").value.trim()
    if (!chave) {
      mostrar($("#msgIa"), "Cole a chave de API antes de salvar.", "erro")
      return
    }
    let ok = false
    try {
      ok = await pedido
    } catch {}
    await LM.storage.setAi({
      provedor: provedorSelecionado(),
      chave,
      modelo: $("#modelo").value.trim(),
      incluirNotas: $("#incluirNotas").checked
    })
    if (!ok) mostrar($("#msgIa"), "Chave salva, mas o acesso ao provedor não foi autorizado. Sem isso o assistente não funciona.", "erro")
    else mostrar($("#msgIa"), "✓ Chave salva e acesso autorizado. Use “Testar conexão” para conferir.", "ok")
  })

  $("#testarIa").addEventListener("click", async () => {
    const pedido = pedirPermissao()
    const provedor = provedorSelecionado()
    const chave = $("#chave").value.trim()
    const modelo = $("#modelo").value.trim() || PROV[provedor].modeloPadrao
    if (!chave) {
      mostrar($("#msgIa"), "Cole a chave de API para testar.", "erro")
      return
    }
    try {
      await pedido
    } catch {}
    const btn = $("#testarIa")
    btn.disabled = true
    mostrar($("#msgIa"), "Testando…", "info")
    try {
      const r = await LM.ai.testar({ provedor, chave, modelo })
      $("#listaModelos").innerHTML = r.modelos.map((m) => `<option value="${LM.util.esc(m)}"></option>`).join("")
      const naLista = r.modelos.includes(modelo)
      $("#dicaModelo").textContent = `${r.modelos.length} modelos disponíveis na sua conta — clique no campo para ver a lista.`
      mostrar(
        $("#msgIa"),
        `✓ Conexão OK com ${PROV[provedor].nome} usando "${modelo}".${naLista ? "" : " (Esse nome não apareceu na lista da conta, mas respondeu.)"} Não esqueça de salvar.`,
        "ok"
      )
      $("#msgIa").className = "msg ok"
    } catch (e) {
      mostrar($("#msgIa"), `✗ ${e.message}`, "erro")
    } finally {
      btn.disabled = false
    }
  })

  $("#apagarIa").addEventListener("click", async () => {
    if (!confirm("Apagar a chave de IA deste navegador?")) return
    await LM.storage.setAi({ chave: "" })
    $("#chave").value = ""
    try {
      await chrome.permissions.remove({ origins: Object.values(PROV).map((p) => p.origem) })
    } catch {}
    mostrar($("#msgIa"), "Chave apagada.", "ok")
  })

  carregarIa()

  // ─── DADOS ─────────────────────────────────────────────────────────────────
  async function carregarEstatisticas() {
    const lotes = await LM.storage.listLots()
    const n = (f) => lotes.filter(f).length
    const itens = [
      ["Lotes salvos", lotes.length],
      ["Com anotações", n((l) => l.user?.notas)],
      ["No comparador", n((l) => l.comparar)],
      ["Com histórico de lances", n((l) => (l.live?.historico || []).length > 1)]
    ]
    $("#estat").innerHTML = itens.map(([t, v]) => `<div class="estat"><b>${v}</b>${t}</div>`).join("")
  }

  $("#exportar").addEventListener("click", async () => {
    const dados = await LM.storage.exportar()
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `leilometro-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  })

  $("#importar").addEventListener("change", async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    try {
      const dados = JSON.parse(await arquivo.text())
      const n = await LM.storage.importar(dados)
      mostrar($("#msgDados"), `✓ ${n} lotes importados.`, "ok")
      carregarEstatisticas()
      carregarConfig()
    } catch (err) {
      mostrar($("#msgDados"), `✗ ${err.message}`, "erro")
    }
    e.target.value = ""
  })

  $("#apagarTudo").addEventListener("click", async () => {
    if (!confirm("Apagar TODOS os lotes salvos, anotações e alertas? Isso não pode ser desfeito.")) return
    await LM.storage.apagarTudo()
    mostrar($("#msgDados"), "Todos os lotes foram apagados.", "ok")
    carregarEstatisticas()
  })
})()
