/**
 * Leilômetro — balão do assistente de IA no painel
 * As perguntas vão para o service worker (mensagem "ai.ask"); este script nunca vê a chave.
 */
;(function () {
  "use strict"
  const LM = globalThis.LM
  const { esc, BRL0, tsStr, hash, miniMarkdown } = LM.util

  const CHIPS = [
    ["veredito", "✅ Vale a pena?"],
    ["riscos", "⚠️ Riscos"],
    ["teto", "💰 Quanto dar no máximo?"],
    ["vistoria", "🔍 O que checar na vistoria"],
    ["comparar", "⚖️ Comparar com meus salvos"],
    ["relatorio", "📄 Gerar relatório"]
  ]
  const ROTULO = Object.fromEntries(CHIPS)

  const st = {
    aberto: false,
    status: null,
    carregando: false,
    conversas: {} // loteId → [{ role, content, tarefa?, json?, erro?, em?, cache? }]
  }

  const painel = () => LM.panel.estado
  const conversa = () => (st.conversas[painel().loteId] = st.conversas[painel().loteId] || [])

  // ─── CONTEXTO ENVIADO À IA (sem dados pessoais nem da conta do site) ──────
  async function montarContexto(tarefa) {
    const lot = painel().lot
    const config = painel().config
    const ctx = LM.calc.contextoIa(painel().snapshot || {}, lot?.user || {}, config, {
      historico: lot?.live?.historico || [],
      incluirNotas: st.status?.incluirNotas !== false
    })
    if (tarefa === "comparar") {
      const lotes = (await LM.storage.listLots()).filter((l) => l.id !== painel().loteId && l.snapshot?.modelo)
      const marcados = lotes.filter((l) => l.comparar)
      ctx.outrosLotes = (marcados.length ? marcados : lotes.slice(0, 8)).map((l) => ({
        id: l.id,
        ...LM.calc.resumoIa(l.snapshot, l.user, config)
      }))
    }
    return ctx
  }

  // ─── INTERFACE ─────────────────────────────────────────────────────────────
  function htmlMensagem(m, i) {
    if (m.role === "user") return `<div class="li-ai-msg li-ai-user">${esc(m.content)}</div>`
    if (m.erro) return `<div class="li-ai-msg li-ai-erro">⚠️ ${esc(m.content)}${m.codigo === "sem-chave" || m.codigo === "permissao" || m.codigo === "chave" || m.codigo === "modelo" ? ` <button type="button" class="li-link-btn" data-ai-acao="config">abrir configurações</button>` : ""}</div>`
    const rodape = `<div class="li-ai-meta">${m.cache ? `resposta salva de ${tsStr(m.em)} · <button type="button" class="li-link-btn" data-ai-acao="refazer" data-tarefa="${esc(m.tarefa)}">gerar de novo</button>` : `${esc(m.modelo || "")}`}</div>`
    if (m.json && m.tarefa === "veredito") return `<div class="li-ai-msg li-ai-bot">${htmlVeredito(m.json, i)}${rodape}</div>`
    return `<div class="li-ai-msg li-ai-bot li-md">${miniMarkdown(m.content)}${rodape}</div>`
  }

  function htmlVeredito(j) {
    const cores = { comprar: "#22c55e", cautela: "#f59e0b", evitar: "#ef4444" }
    const v = String(j.veredito || "").toLowerCase()
    const cor = cores[v] || "#8b949e"
    const lista = (titulo, itens) =>
      Array.isArray(itens) && itens.length ? `<p class="md-h">${titulo}</p><ul>${itens.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""
    const teto = Number(j.tetoSugerido)
    return `
      <div class="li-ai-veredito" style="border-color:${cor}55; background:${cor}14">
        <span style="color:${cor}">${esc(v ? v.toUpperCase() : "SEM VEREDITO")}</span>
        ${j.confianca ? `<small>confiança ${esc(j.confianca)}</small>` : ""}
      </div>
      ${j.resumo ? `<p>${esc(j.resumo)}</p>` : ""}
      ${lista("Pontos fortes", j.pontosFortes)}
      ${lista("Riscos", j.riscos)}
      ${teto > 0 ? `<p class="md-h">Teto sugerido: ${BRL0(teto)}</p><button type="button" class="li-ai-usar" data-ai-acao="usar-teto" data-valor="${teto}">Usar como meu teto</button>` : ""}
      ${lista("Perguntar/checar na vistoria", j.perguntasVistoria)}`
  }

  function htmlDrawer() {
    const s = st.status
    if (!s?.configurado) {
      return `
        <div class="li-ai-drawer" role="dialog" aria-label="Assistente de IA">
          <div class="li-ai-head"><b>🤖 Assistente de IA</b><button type="button" class="li-x" data-ai-acao="fechar" aria-label="Fechar">×</button></div>
          <div class="li-ai-vazio">
            <p><b>${s?.semPermissao ? "Falta autorizar o acesso ao provedor." : "Conecte sua chave da OpenAI ou do Gemini."}</b></p>
            <p>Com ela você pergunta se o lote vale a pena, pede riscos, teto sugerido, checklist de vistoria, comparação com seus lotes salvos e um parecer para o relatório.</p>
            <p class="li-hint">A chave fica só neste navegador e as consultas são cobradas na sua conta do provedor.</p>
            <button type="button" class="li-live-btn" data-ai-acao="config">Configurar IA</button>
          </div>
        </div>`
    }
    const msgs = conversa()
    return `
      <div class="li-ai-drawer" role="dialog" aria-label="Assistente de IA">
        <div class="li-ai-head">
          <b>🤖 Assistente</b><small>${esc(s.provedorNome)} · ${esc(s.modelo)}</small>
          <button type="button" class="li-x" data-ai-acao="limpar" title="Limpar conversa" aria-label="Limpar conversa">⟲</button>
          <button type="button" class="li-x" data-ai-acao="fechar" aria-label="Fechar">×</button>
        </div>
        <div class="li-ai-msgs">
          ${msgs.length ? msgs.map(htmlMensagem).join("") : '<div class="li-ai-msg li-ai-bot">Escolha uma pergunta pronta ou escreva a sua. Eu uso os números deste painel.</div>'}
          ${st.carregando ? '<div class="li-ai-msg li-ai-bot li-ai-pensando"><span></span><span></span><span></span></div>' : ""}
        </div>
        <div class="li-ai-chips">
          ${CHIPS.map(([t, r]) => `<button type="button" class="li-ai-chip" data-ai-acao="tarefa" data-tarefa="${t}" ${st.carregando ? "disabled" : ""}>${r}</button>`).join("")}
        </div>
        <form class="li-ai-form">
          <textarea id="lm-ai-input" rows="2" placeholder="Pergunte sobre este lote..." ${st.carregando ? "disabled" : ""}></textarea>
          <button type="submit" ${st.carregando ? "disabled" : ""} aria-label="Enviar">➤</button>
        </form>
      </div>`
  }

  function renderizar() {
    const panelEl = painel().el
    const root = panelEl?.querySelector("#lm-ai-root")
    if (!root) return
    panelEl.classList.toggle("li-ai-aberto", st.aberto)
    root.innerHTML = `
      <button type="button" class="li-ai-fab ${st.aberto ? "li-on" : ""}" data-ai-acao="alternar" title="Assistente de IA" aria-label="Assistente de IA">${st.aberto ? "×" : "🤖"}</button>
      ${st.aberto ? htmlDrawer() : ""}`
    const msgs = root.querySelector(".li-ai-msgs")
    if (msgs) msgs.scrollTop = msgs.scrollHeight
    root.querySelector(".li-ai-form")?.addEventListener("submit", (e) => {
      e.preventDefault()
      const input = root.querySelector("#lm-ai-input")
      const texto = input?.value?.trim()
      if (texto) perguntar("livre", texto)
    })
    root.querySelector("#lm-ai-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        root.querySelector(".li-ai-form")?.requestSubmit()
      }
    })
  }

  async function atualizarStatus() {
    try {
      st.status = await chrome.runtime.sendMessage({ type: "ai.status" })
    } catch {
      st.status = { configurado: false }
    }
  }

  function montar(panelEl) {
    panelEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-ai-acao]")
      if (!btn || !panelEl.contains(btn)) return
      const acao = btn.getAttribute("data-ai-acao")
      if (acao === "alternar") {
        st.aberto = !st.aberto
        if (st.aberto) await atualizarStatus()
        renderizar()
        if (st.aberto) panelEl.querySelector("#lm-ai-input")?.focus()
      } else if (acao === "fechar") {
        st.aberto = false
        renderizar()
      } else if (acao === "config") {
        LM.util.enviar({ type: "openOptions", hash: "ia" })
      } else if (acao === "limpar") {
        st.conversas[painel().loteId] = []
        renderizar()
      } else if (acao === "tarefa") {
        perguntar(btn.getAttribute("data-tarefa"))
      } else if (acao === "refazer") {
        perguntar(btn.getAttribute("data-tarefa"), "", { ignorarCache: true })
      } else if (acao === "usar-teto") {
        const v = Number(btn.getAttribute("data-valor"))
        if (v > 0) {
          await LM.panel.salvarUser({ tetoLance: v })
          const input = panelEl.querySelector("#lm-teto-input")
          if (input) input.value = v
          btn.textContent = "✓ Teto definido"
          btn.disabled = true
        }
      }
    })
    renderizar()
    if (!st.status) atualizarStatus().then(renderizar)
  }

  // ─── PERGUNTAR ─────────────────────────────────────────────────────────────
  async function perguntar(tarefa, texto = "", { ignorarCache = false } = {}) {
    if (st.carregando) return
    const loteId = painel().loteId
    const msgs = conversa()
    const contexto = await montarContexto(tarefa)
    const chaveCache = tarefa !== "livre" ? hash(tarefa + JSON.stringify(contexto)) : null

    msgs.push({ role: "user", content: tarefa === "livre" ? texto : ROTULO[tarefa] })

    // Mesma pergunta com os mesmos dados: usa a resposta salva (não cobra de novo)
    const cache = painel().lot?.ai?.cache?.[tarefa]
    if (!ignorarCache && chaveCache && cache?.hash === chaveCache) {
      msgs.push({ role: "assistant", content: cache.texto, json: cache.json, tarefa, em: cache.em, modelo: cache.modelo, cache: true })
      renderizar()
      if (tarefa === "relatorio") abrirRelatorio()
      return
    }

    st.carregando = true
    renderizar()
    const historico = tarefa === "livre" ? msgs.slice(0, -1).filter((m) => !m.erro && !m.json).map((m) => ({ role: m.role, content: m.content })) : []
    let r
    try {
      r = await chrome.runtime.sendMessage({ type: "ai.ask", tarefa, contexto, pergunta: texto, historico })
    } catch (e) {
      r = { ok: false, erro: "Não foi possível falar com a extensão. Recarregue a página." }
    }
    st.carregando = false
    if (painel().loteId !== loteId) return

    if (!r?.ok) {
      msgs.push({ role: "assistant", content: r?.erro || "Erro desconhecido", erro: true, codigo: r?.codigo })
      renderizar()
      return
    }

    msgs.push({ role: "assistant", content: r.texto, json: r.json, tarefa, modelo: r.modelo, em: r.em })
    renderizar()

    if (chaveCache) {
      const cacheAtual = { ...(painel().lot?.ai?.cache || {}) }
      cacheAtual[tarefa] = { hash: chaveCache, texto: r.texto, json: r.json, em: r.em, modelo: r.modelo }
      const patch = { ai: { cache: cacheAtual } }
      if (tarefa === "relatorio") patch.ai.relatorio = { texto: r.texto, em: r.em, modelo: r.modelo }
      await LM.panel.salvar(patch)
      if (tarefa === "relatorio") abrirRelatorio()
    }
  }

  async function abrirRelatorio() {
    const cache = painel().lot?.ai?.cache?.relatorio
    if (cache && !painel().lot?.ai?.relatorio) {
      await LM.panel.salvar({ ai: { relatorio: { texto: cache.texto, em: cache.em, modelo: cache.modelo } } })
    }
    LM.util.enviar({ type: "open", path: `report/report.html?id=${encodeURIComponent(painel().loteId)}` })
  }

  LM.assistant = { montar }
})()
