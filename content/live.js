/**
 * Leilômetro — Modo Leilão: rastreio ao vivo, alertas sonoros e histórico de lances
 *
 * Fontes do lance: MutationObserver no painel de lances do site (mais rápido,
 * não sofre throttling em aba oculta) + consulta à API a cada N segundos (reserva).
 */
;(function () {
  "use strict"
  const LM = globalThis.LM
  const { esc, BRL, BRL0, tempoRelativo, numOuNull } = LM.util

  const REGRAS_PADRAO = { faltam: true, teto: true, encerrando: true, novo: false }

  const live = {
    ativo: false,
    loteId: null,
    pollTimer: null,
    tickTimer: null,
    observer: null,
    ultimoValor: null,
    ultimaConsulta: null,
    erro: null,
    disparados: new Set(),
    log: [],
    tituloOriginal: null,
    consultando: false
  }

  const panel = () => LM.panel.estado
  const lotLive = () => ({ alertas: [], regras: { ...REGRAS_PADRAO }, historico: [], ...(panel().lot?.live || {}) })
  const regras = () => ({ ...REGRAS_PADRAO, ...(lotLive().regras || {}) })

  // ─── INTERFACE ─────────────────────────────────────────────────────────────
  function htmlLive() {
    const r = regras()
    const cfg = panel().config
    const ll = lotLive()
    return `
      <div class="li-live ${live.ativo ? "li-live-on" : ""}">
        <div class="li-live-top">
          <button type="button" class="li-live-btn" data-live-acao="toggle" aria-pressed="${live.ativo}">
            ${live.ativo ? "■ Parar rastreio" : "▶ Ativar rastreio"}
          </button>
          <button type="button" class="li-live-icon" data-live-acao="testar" title="Testar som" aria-label="Testar som">🔊</button>
        </div>
        ${
          live.ativo
            ? `<div class="li-live-status"><span class="li-rec">●</span> Rastreando · consulta a cada ${esc(cfg.intervaloPolling)}s · <span data-live="atualizado"></span></div>`
            : `<span class="li-hint">Ligue durante o pregão: o Leilômetro acompanha os lances e apita nos valores abaixo. Deixe esta aba aberta (pode ficar em segundo plano).</span>`
        }
        <div data-live="stats"></div>

        <div class="li-live-regras">
          <span class="li-item-label">Avisar quando:</span>
          <label class="li-check"><input type="checkbox" data-regra="faltam" ${r.faltam ? "checked" : ""}/>
            faltarem <input type="number" class="li-mini-input" data-live-cfg="faltam" min="1" max="50" value="${esc(cfg.alertaFaltamLances)}"/> lances para o teto</label>
          <label class="li-check"><input type="checkbox" data-regra="teto" ${r.teto ? "checked" : ""}/> o lance passar do teto <small>(som crítico)</small></label>
          <label class="li-check"><input type="checkbox" data-regra="encerrando" ${r.encerrando ? "checked" : ""}/> faltar 1 minuto para o encerramento previsto</label>
          <label class="li-check"><input type="checkbox" data-regra="novo" ${r.novo ? "checked" : ""}/> houver um novo lance <small>(bip curto)</small></label>
        </div>

        <div class="li-live-add">
          <span class="li-item-label">…ou quando o lance chegar em:</span>
          <div class="li-margem-row">
            <input id="lm-alerta-valor" class="li-fipe-input" type="number" min="0" step="100" placeholder="R$ ex: 40000"/>
            <button type="button" class="li-live-icon li-add" data-live-acao="add" aria-label="Adicionar alerta">＋</button>
          </div>
          <ul class="li-live-lista" data-live="lista">${htmlListaAlertas(ll.alertas)}</ul>
        </div>
        <div data-live="log">${htmlLog()}</div>
      </div>`
  }

  function htmlListaAlertas(alertas) {
    if (!alertas.length) return ""
    const lance = panel().analise?.calc?.lance || 0
    return alertas
      .slice()
      .sort((a, b) => a.valor - b.valor)
      .map(
        (a) => `
        <li class="${lance >= a.valor ? "li-atingido" : ""}">
          <span>🔔 ${BRL0(a.valor)}</span>
          <span class="li-hint-inline">${lance >= a.valor ? "atingido ✓" : `faltam ${BRL0(a.valor - lance)}`}</span>
          <button type="button" class="li-x" data-live-acao="remover" data-id="${esc(a.id)}" aria-label="Remover alerta">×</button>
        </li>`
      )
      .join("")
  }

  function htmlLog() {
    if (!live.log.length) return ""
    return `<div class="li-live-log">${live.log
      .map((l) => `<div class="li-log-${l.padrao}"><b>${new Date(l.t).toLocaleTimeString("pt-BR")}</b> ${esc(l.titulo)}</div>`)
      .join("")}</div>`
  }

  function htmlStats() {
    const hist = lotLive().historico || []
    if (!live.ativo && hist.length < 2) return ""
    const agora = Date.now()
    const janela = hist.filter((h, i) => i > 0 && agora - h.t <= 5 * 60000)
    const ritmo = janela.length / 5
    const s = panel().analise?.snapshot || {}
    const c = panel().analise?.calc || {}
    return `
      <div class="li-grid li-mt">
        <div class="li-item"><span class="li-item-label">Ritmo (5 min)</span><span class="li-item-value">${ritmo.toFixed(1).replace(".", ",")} /min</span></div>
        <div class="li-item"><span class="li-item-label">Lances no site</span><span class="li-item-value">${s.qtdLances ?? "—"}</span></div>
      </div>
      ${sparkline(hist, c.teto)}`
  }

  function sparkline(hist, teto) {
    const pts = hist.slice(-60)
    if (pts.length < 2) return ""
    const W = 290
    const H = 46
    const vals = pts.map((p) => p.v)
    let min = Math.min(...vals)
    let max = Math.max(...vals)
    const tetoVisivel = teto && teto > min * 0.9 && teto < max * 1.15
    if (tetoVisivel) {
      min = Math.min(min, teto)
      max = Math.max(max, teto)
    }
    const span = max - min || 1
    const t0 = pts[0].t
    const tspan = pts[pts.length - 1].t - t0 || 1
    const x = (t) => ((t - t0) / tspan) * (W - 4) + 2
    const y = (v) => H - 4 - ((v - min) / span) * (H - 8)
    // degraus: o lance fica no valor até o próximo lance
    let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      d += ` H${x(pts[i].t).toFixed(1)} V${y(pts[i].v).toFixed(1)}`
    }
    const linhaTeto = tetoVisivel
      ? `<line x1="0" x2="${W}" y1="${y(teto).toFixed(1)}" y2="${y(teto).toFixed(1)}" stroke="#ef4444" stroke-dasharray="4 3" stroke-width="1"/>`
      : ""
    return `
      <div class="li-spark" title="Histórico de lances (${pts.length} pontos)">
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" aria-hidden="true">
          ${linhaTeto}
          <path d="${d}" fill="none" stroke="#f0ba32" stroke-width="1.8"/>
        </svg>
        <div class="li-spark-legenda"><span>${BRL0(pts[0].v)}</span>${tetoVisivel ? `<span class="li-red">teto ${BRL0(teto)}</span>` : ""}<span>${BRL0(pts[pts.length - 1].v)}</span></div>
      </div>`
  }

  // Chamado a cada montagem completa do painel
  function montar(panelEl) {
    panelEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-live-acao]")
      if (!btn || !panelEl.contains(btn)) return
      const acao = btn.getAttribute("data-live-acao")
      if (acao === "toggle") live.ativo ? parar() : await iniciar()
      else if (acao === "testar") {
        await LM.sound.destravar()
        LM.sound.tocar("apito", panel().config.volume)
        setTimeout(() => LM.sound.tocar("critico", panel().config.volume), 1100)
      } else if (acao === "add") adicionarAlerta(panelEl)
      else if (acao === "remover") removerAlerta(btn.getAttribute("data-id"))
    })
    renderizarSecao(panelEl)
    observarDom()
  }

  // Remonta só a seção do Modo Leilão (os cliques são delegados ao painel)
  function renderizarSecao(panelEl) {
    const root = panelEl?.querySelector("#lm-live-root")
    if (!root) return
    root.innerHTML = htmlLive()

    root.querySelector("#lm-alerta-valor")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        adicionarAlerta(panelEl)
      }
    })

    root.querySelectorAll("[data-regra]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const novas = { ...regras(), [cb.getAttribute("data-regra")]: cb.checked }
        LM.panel.salvar({ live: { regras: novas } })
      })
    )

    root.querySelector('[data-live-cfg="faltam"]')?.addEventListener("change", (e) => {
      const n = numOuNull(e.target.value)
      if (n && n > 0) LM.storage.setConfig({ alertaFaltamLances: Math.round(n) })
    })

    atualizar()
  }

  function atualizar() {
    const el = panel().el
    if (!el) return
    const stats = el.querySelector('[data-live="stats"]')
    if (stats) stats.innerHTML = htmlStats()
    const lista = el.querySelector('[data-live="lista"]')
    if (lista) lista.innerHTML = htmlListaAlertas(lotLive().alertas)
    const log = el.querySelector('[data-live="log"]')
    if (log) log.innerHTML = htmlLog()
    tick()
  }

  function tick() {
    const el = panel().el
    const at = el?.querySelector('[data-live="atualizado"]')
    if (at) at.textContent = live.erro ? `⚠️ ${live.erro}` : live.ultimaConsulta ? `atualizado ${tempoRelativo(live.ultimaConsulta)}` : "consultando…"
    if (live.ativo) {
      verificarEncerramento()
      // o site pode recriar o painel de lances; reobserva se mudou
      observarDom()
    }
  }

  // ─── ALERTAS POR VALOR ─────────────────────────────────────────────────────
  async function adicionarAlerta(panelEl) {
    const input = panelEl.querySelector("#lm-alerta-valor")
    const valor = numOuNull(input?.value)
    if (!valor || valor <= 0) {
      input?.focus()
      return
    }
    const alertas = [...lotLive().alertas.filter((a) => a.valor !== valor), { id: Date.now().toString(36), valor }]
    await LM.panel.salvar({ live: { alertas } })
    // já atingido no momento da criação não apita
    if ((panel().analise?.calc?.lance || 0) >= valor) live.disparados.add(`v:${valor}`)
    if (input) input.value = ""
    atualizar()
  }

  async function removerAlerta(id) {
    const alertas = lotLive().alertas.filter((a) => a.id !== id)
    await LM.panel.salvar({ live: { alertas } })
    atualizar()
  }

  // ─── CICLO DO RASTREIO ─────────────────────────────────────────────────────
  async function iniciar() {
    await LM.sound.destravar()
    live.ativo = true
    live.loteId = panel().loteId
    live.erro = null
    live.log = []
    live.ultimoValor = panel().analise?.calc?.lance ?? null
    live.tituloOriginal = null

    // estado inicial: condições já verdadeiras não disparam (evita barulho ao ligar)
    live.disparados = new Set()
    avaliar({ silencioso: true })

    if (live.ultimoValor != null) registrarHistorico(live.ultimoValor, true)

    const cfg = panel().config
    clearInterval(live.pollTimer)
    live.pollTimer = setInterval(consultarApi, Math.max(2, Math.min(30, cfg.intervaloPolling || 3)) * 1000)
    clearInterval(live.tickTimer)
    live.tickTimer = setInterval(tick, 1000)
    observarDom()
    consultarApi()

    rerenderizar()
    LM.panel.enviarBadge()
  }

  function parar() {
    live.ativo = false
    clearInterval(live.pollTimer)
    clearInterval(live.tickTimer)
    restaurarTitulo()
    if (panel().el) {
      rerenderizar()
      LM.panel.enviarBadge()
    }
  }

  // Saída da página do lote (navegação SPA)
  function desmontar() {
    parar()
    live.observer?.disconnect()
    live.observer = null
    live.alvoObservado = null
  }

  function rerenderizar() {
    renderizarSecao(panel().el)
    LM.panel.atualizarFragmentos()
  }

  // O painel de lances do site é observado sempre que o painel está aberto:
  // com rastreio desligado só atualiza o valor; ligado, também avalia alertas.
  function observarDom() {
    const alvo = LM.scrape.elementoDoPainelDeLances()
    if (!alvo || alvo === live.alvoObservado) return
    live.observer?.disconnect()
    live.alvoObservado = alvo
    let agendado = false
    live.observer = new MutationObserver(() => {
      if (agendado) return
      agendado = true
      setTimeout(() => {
        agendado = false
        const v = LM.scrape.lerLanceDoDom()
        if (!v) return
        if (live.ativo) {
          if (v !== live.ultimoValor) registrarLance(v, { fonte: "Página (ao vivo)" })
        } else if (v !== panel().analise?.calc?.lance) {
          LM.panel.aplicarSnapshot({ lance: v, fonte: "Página (ao vivo)" })
        }
      }, 150)
    })
    live.observer.observe(alvo, { subtree: true, childList: true, characterData: true })
  }

  async function consultarApi() {
    if (!live.ativo || live.consultando) return
    live.consultando = true
    try {
      const snap = await LM.api.buscarLote(live.loteId, { forcar: true })
      if (!live.ativo || live.loteId !== panel().loteId) return
      if (!snap) throw new Error("sem resposta da API")
      live.ultimaConsulta = Date.now()
      live.erro = null
      const dom = LM.scrape.lerLanceDoDom()
      const valor = Math.max(snap.lance || 0, dom || 0) || null
      registrarLance(valor, { ...snap, fonte: dom && dom > (snap.lance || 0) ? "API + página" : "API" })
    } catch (e) {
      live.erro = "falha ao consultar, tentando de novo"
    } finally {
      live.consultando = false
    }
  }

  function registrarLance(valor, extra = {}) {
    if (!live.ativo || valor == null) return
    const mudou = valor !== live.ultimoValor
    const anterior = live.ultimoValor
    LM.panel.aplicarSnapshot({ ...extra, lance: valor })
    if (mudou) {
      live.ultimoValor = valor
      registrarHistorico(valor)
      if (anterior != null && regras().novo) LM.sound.tocar("bip", panel().config.volume)
    }
    avaliar({ silencioso: false })
    atualizar()
  }

  function registrarHistorico(valor, inicial = false) {
    const hist = [...(lotLive().historico || [])]
    const ultimo = hist[hist.length - 1]
    if (ultimo && ultimo.v === valor) return
    hist.push({ t: Date.now(), v: valor })
    LM.panel.salvar({ live: { historico: hist.slice(-LM.storage.MAX_HISTORICO) } })
  }

  // ─── AVALIAÇÃO DOS ALERTAS ─────────────────────────────────────────────────
  function avaliar({ silencioso }) {
    const a = panel().analise
    if (!a) return
    const c = a.calc
    const r = regras()
    const cfg = panel().config
    const lance = c.lance
    if (lance == null) return

    const checar = (chave, condicao, disparo) => {
      if (condicao) {
        if (!live.disparados.has(chave)) {
          live.disparados.add(chave)
          if (!silencioso) disparo()
        }
      } else {
        live.disparados.delete(chave)
      }
    }

    const nomeTeto = c.tetoUsuario ? "seu teto" : "preço limite"
    checar("teto", r.teto && c.teto != null && lance > c.teto, () =>
      disparar("critico", `Passou do ${nomeTeto}: ${BRL0(lance)} (teto ${BRL0(c.teto)})`)
    )
    checar(
      "faltam",
      r.faltam && c.teto != null && lance <= c.teto && c.lancesRestantes != null && c.lancesRestantes <= (cfg.alertaFaltamLances || 3),
      () => disparar("apito", `Faltam ${c.lancesRestantes} lance${c.lancesRestantes === 1 ? "" : "s"} para o ${nomeTeto} (${BRL0(lance)})`)
    )
    for (const al of lotLive().alertas) {
      checar(`v:${al.valor}`, lance >= al.valor, () => disparar("apito", `Lance chegou em ${BRL0(lance)} (alerta ${BRL0(al.valor)})`))
    }
  }

  function verificarEncerramento() {
    const s = panel().analise?.snapshot
    if (!s?.dataFim || !regras().encerrando) return
    const falta = s.dataFim - Date.now()
    const cond = falta > 0 && falta <= 60000
    if (cond && !live.disparados.has("fim")) {
      live.disparados.add("fim")
      disparar("apito", `Encerramento previsto em menos de 1 minuto (${BRL0(panel().analise.calc.lance)})`)
    } else if (!cond && falta > 60000) {
      live.disparados.delete("fim")
    }
  }

  function disparar(padrao, titulo) {
    const cfg = panel().config
    if (cfg.somAtivo) LM.sound.tocar(padrao, cfg.volume)

    live.log = [{ t: Date.now(), titulo, padrao }, ...live.log].slice(0, 5)

    const el = panel().el
    if (el) {
      el.classList.remove("li-flash", "li-flash-critico")
      void el.offsetWidth
      el.classList.add(padrao === "critico" ? "li-flash-critico" : "li-flash")
      setTimeout(() => el.classList.remove("li-flash", "li-flash-critico"), 3000)
    }

    if (live.tituloOriginal == null) live.tituloOriginal = document.title
    document.title = `🔔 ${titulo} — ${live.tituloOriginal}`
    if (!document.hidden) setTimeout(restaurarTitulo, 8000)

    if (cfg.notificacoes) {
      try {
        LM.util.enviar({
          type: "notify",
          title: padrao === "critico" ? "⛔ Leilômetro — passou do teto" : "🔔 Leilômetro",
          message: `${titulo}\n${panel().analise?.snapshot?.modelo || ""}`
        })
      } catch {}
    }
  }

  function restaurarTitulo() {
    if (live.tituloOriginal != null) {
      document.title = live.tituloOriginal
      live.tituloOriginal = null
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setTimeout(restaurarTitulo, 3000)
  })

  // ─── DEBUG: simular lance (só com localStorage.lm_debug = "1" na página) ──
  // No console da página: document.dispatchEvent(new CustomEvent("leilometro:simular", { detail: 40000 }))
  document.addEventListener("leilometro:simular", (e) => {
    let debug = false
    try {
      debug = localStorage.getItem("lm_debug") === "1"
    } catch {}
    if (!debug) return
    const valor = Number(e.detail)
    if (!live.ativo) {
      console.warn("[Leilômetro] ative o rastreio antes de simular")
      return
    }
    if (valor > 0) registrarLance(valor, { fonte: "Simulação", ultimoLanceEm: Date.now() })
  })

  LM.live = {
    montar,
    atualizar,
    iniciar,
    parar,
    desmontar,
    ativo: () => live.ativo,
    simularLance: (v) => registrarLance(v, { fonte: "Simulação" })
  }
})()
