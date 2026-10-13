/**
 * Leilômetro — painel flutuante na página do lote
 *
 * renderizar()          monta o painel inteiro (abrir lote, ↻, limpar dados)
 * atualizarFragmentos() troca só os blocos calculados ([data-frag]); os inputs
 *                       ficam fora deles, então digitar não perde o foco
 */
;(function () {
  "use strict"
  const LM = globalThis.LM
  const { esc, BRL, BRL0, NUM, PCT, tsStr, tempoRelativo, duracao, numOuNull } = LM.util

  const estado = {
    loteId: null,
    lot: null,
    snapshot: null,
    config: null,
    ui: null,
    analise: null,
    fechado: false,
    arrastando: false,
    el: null,
    tick: null,
    compararTotal: 0
  }

  // ─── TOOLTIP ───────────────────────────────────────────────────────────────
  // content é HTML montado aqui mesmo; partes dinâmicas já chegam escapadas
  function tooltip(content, icon = "ℹ️") {
    return `<span class="li-tooltip-container" tabindex="0" aria-label="Ajuda">
        <span class="li-tooltip-trigger">${icon}</span>
        <span class="li-tooltip-box"><span class="li-tooltip-content">${content}</span><span class="li-tooltip-arrow"></span></span>
      </span>`
  }

  function tagOrigem(origem) {
    if (origem === "auto") return '<span class="li-tag li-tag-auto">auto</span>'
    if (origem === "editado") return '<span class="li-tag li-tag-edit">editado</span>'
    if (origem === "padrao") return '<span class="li-tag li-tag-padrao">padrão</span>'
    return ""
  }

  // ─── FRAGMENTOS CALCULADOS ─────────────────────────────────────────────────
  function fragSub() {
    const s = estado.analise.snapshot
    const partes = [s.ano, s.km ? `${NUM(s.km)} km` : null, s.local, s.numeroLote ? `Lote ${s.numeroLote}` : null]
      .filter(Boolean)
      .map(esc)
    const fim = s.dataFim ? `<span class="li-fim" data-tick="fim"></span>` : ""
    const min = Number(estado.config.lembreteMinutos) || 0
    const lembrete =
      estado.lot?.favorito && s.dataFim && min && s.dataFim - min * 60000 > Date.now()
        ? `<br/><span class="li-lembrete">⏰ Lembrete às ${new Date(s.dataFim - min * 60000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>`
        : ""
    return `${partes.join(" · ")}${fim ? `<br/>${fim}` : ""}${lembrete}`
  }

  function fragScore() {
    const { calc } = estado.analise
    const info = LM.calc.getScoreLabel(calc.score)
    const ring =
      calc.score !== null
        ? `conic-gradient(${info.color} ${calc.score * 3.6}deg, #1e293b 0deg)`
        : "#1e293b"
    const semFipe = calc.precoLimite === null
    const risco = LM.calc.sinaisDeAtencao(estado.analise.snapshot).some((x) => x.nivel === "alto")
    return `
      <div class="li-score-ring" style="background:${ring}">
        <div class="li-score-inner">
          <span class="li-score-num">${calc.score ?? "—"}</span>
          <span class="li-score-label">SCORE</span>
        </div>
      </div>
      <div class="li-oport-badge" style="color:${info.color}; border-color:${info.color}40; background:${info.color}12">
        ${semFipe ? "SEM FIPE <strong>INFORME A FIPE</strong>" : `OPORTUNIDADE <strong>${info.label}</strong>`}
        ${risco ? '<span class="li-badge-risco">⚠️ com sinais de risco — veja abaixo</span>' : ""}
      </div>`
  }

  function fragSinais() {
    const sinais = LM.calc.sinaisDeAtencao(estado.analise.snapshot)
    if (!sinais.length) return ""
    return `
      <div class="li-sinais" role="note" aria-label="Sinais de atenção">
        ${sinais
          .map(
            (x) => `
          <div class="li-sinal li-sinal-${x.nivel}">
            <span class="li-sinal-ico">${x.icone}</span>
            <span><b>${esc(x.titulo)}</b><small>${esc(x.detalhe)}</small></span>
          </div>`
          )
          .join("")}
      </div>`
  }

  function fragValores() {
    const { snapshot: s, params: p, calc: c } = estado.analise
    const metaLance = [
      s.qtdLances != null ? `${s.qtdLances} lance${s.qtdLances === 1 ? "" : "s"}` : null,
      s.ultimoLanceEm ? `último <span data-tick="ultimo"></span>` : null,
      s.temLance === false ? "sem lances (valor mínimo)" : null
    ]
      .filter(Boolean)
      .join(" · ")

    const itens = [
      ["Depósito de bens", s.depositoBens],
      ["Remoção", s.taxaRemocao],
      ["Vistoria", s.taxaVistoria],
      ["Despachante", s.taxaDespachante],
      ["Outros", s.taxaOutros]
    ].filter(([, v]) => v)
    const taxasTip = p.taxasAuto
      ? `<strong>Taxas informadas pelo site:</strong><br/>${itens.map(([n, v]) => `${n}: ${BRL(v)}`).join("<br/>") || BRL(p.taxasLeilao)}`
      : `O site não informou taxas. Usando a <strong>taxa de pátio padrão</strong> das configurações.`

    return `
      <div class="li-item li-item-full">
        <span class="li-item-label">Lance atual</span>
        <span class="li-item-value li-lance ${!c.lance ? "li-not-found" : ""}">${c.lance ? BRL(c.lance) : "Lance não detectado — clique em ↻"}</span>
        ${metaLance ? `<span class="li-hint">${metaLance}</span>` : ""}
      </div>
      <div class="li-item">
        <span class="li-item-label">Comissão (${PCT(c.comissaoPct, 1).replace(",0%", "%")}) ${tagOrigem(p.comissaoAuto ? "auto" : "padrao")}</span>
        <span class="li-item-value li-warn">+ ${BRL(c.comissao)}</span>
      </div>
      <div class="li-item">
        <span class="li-item-label">Taxas do leilão ${tagOrigem(p.taxasAuto ? "auto" : "padrao")} ${tooltip(taxasTip)}</span>
        <span class="li-item-value li-warn">+ ${BRL(c.taxasLeilao)}</span>
      </div>
      <div class="li-item li-item-highlight li-item-full">
        <span class="li-item-label">Custo no leilão ${tooltip("Lance + comissão + taxas do leilão. É o que você paga ao leiloeiro se arrematar agora.")}</span>
        <span class="li-item-value">${BRL(c.custoArremate)}</span>
        ${s.totalAPagar && s.fonte === "API" && c.lance === s.lance && Math.abs(s.totalAPagar - c.custoArremate) > 1 ?`<span class="li-hint">Site informa total a pagar de ${BRL(s.totalAPagar)} no lance ${BRL(s.lance)}</span>` : ""}
      </div>`
  }

  function fragFipeAviso() {
    const { params: p } = estado.analise
    if (p.fipe) return ""
    return `<div class="li-aviso">⚠️ <strong>FIPE não encontrada.</strong> Digite o valor de referência acima para calcular o preço limite, o lucro e o score.</div>`
  }

  function fragResultado() {
    const { params: p, calc: c } = estado.analise
    if (!p.fipe) return ""
    const formula = `<strong>Maior lance em que você ainda lucra a margem desejada.</strong><br/>
      (FIPE ${BRL0(p.fipe)} × ${PCT(1 - p.margem)} − taxas ${BRL0(p.taxasLeilao)} − custos ${BRL0(c.custosPos)}) ÷ (1 + comissão ${PCT(p.comissaoPct, 1)})`
    const lancesTxt =
      c.lance == null
        ? "—"
        : c.folga < 0
          ? `🚨 ${BRL0(-c.folga)} acima do ${c.tetoUsuario ? "seu teto" : "limite"}`
          : c.lancesRestantes === 0
            ? "🚨 No limite!"
            : `${c.lancesRestantes} lance${c.lancesRestantes === 1 ? "" : "s"}`
    return `
      <div class="li-item">
        <span class="li-item-label">Preço limite ${tooltip(formula)}</span>
        <span class="li-item-value li-limit">${c.precoLimite > 0 ? BRL(c.precoLimite) : "Inviável"}</span>
      </div>
      <div class="li-item">
        <span class="li-item-label">Lucro potencial ${tooltip("FIPE − custo no leilão − custos pós-arremate (conserto, documentação, IPVA), no lance atual.")}</span>
        <span class="li-item-value ${c.potencialLucro > 0 ? "li-profit" : "li-loss"}">${BRL(c.potencialLucro)}</span>
        ${c.lucroPct != null ? `<span class="li-hint">${PCT(c.lucroPct, 1)} da FIPE</span>` : ""}
      </div>
      <div class="li-item li-item-full">
        <span class="li-item-label">Até o ${c.tetoUsuario ? "meu teto" : "preço limite"} (incremento ${BRL0(c.incremento)})</span>
        <div class="li-lances-badge ${c.folga != null && c.lancesRestantes === 0 ? "li-lances-danger" : ""}">
          ${lancesTxt}
          ${c.folga > 0 ? `<span class="li-lances-sub">${BRL0(c.folga)} de folga</span>` : ""}
        </div>
      </div>`
  }

  function fragUso() {
    const { snapshot: s } = estado.analise
    const ki = LM.calc.classifyKmAno(s.kmAno)
    return `
      <div class="li-item">
        <span class="li-item-label">Média anual</span>
        <span class="li-item-value">${s.kmAno ? `${NUM(s.kmAno)} km` : "—"}</span>
      </div>
      <div class="li-item">
        <span class="li-item-label">Média mensal</span>
        <span class="li-item-value">${s.kmMes ? `${NUM(s.kmMes)} km` : "—"}</span>
      </div>
      <div class="li-item li-item-full">
        <span class="li-item-label">Classificação de uso ${tooltip(`KM total ÷ idade do veículo (${esc(s.idadeVeiculo || "?")} anos). Ajuda a identificar frota, aplicativo ou uso particular.`, "❓")}</span>
        <span class="li-km-badge" style="color:${ki.color}; border-color:${ki.color}40; background:${ki.color}15">${ki.emoji} ${esc(ki.label)}</span>
      </div>`
  }

  function corSituacao(c) {
    if (c.lance == null || c.folga == null) return "neutro"
    if (c.folga < 0) return "perigo"
    if (c.lancesRestantes <= (estado.config.alertaFaltamLances || 3)) return "atencao"
    return "ok"
  }

  function fragCompacto() {
    const { calc: c } = estado.analise
    const rastreando = LM.live?.ativo?.()
    const graves = LM.calc.sinaisDeAtencao(estado.analise.snapshot).filter((x) => x.nivel === "alto")
    const aviso = graves.length
      ? `<span class="li-cb-alerta" title="${esc(graves.map((x) => x.titulo).join(" · "))}">⚠️</span>`
      : ""
    return `
      <div class="li-cb li-cb-${corSituacao(c)}">
        ${aviso}
        <button type="button" class="li-cb-live ${rastreando ? "li-on" : ""}" data-live-acao="toggle"
          title="${rastreando ? "Parar rastreio" : "Ativar rastreio e alertas"}" aria-label="${rastreando ? "Parar rastreio" : "Ativar rastreio"}">${rastreando ? '<span class="li-rec">●</span>' : "🔔"}</button>
        <span><small>Lance</small><b>${BRL0(c.lance)}</b></span>
        <span><small>${c.tetoUsuario ? "Teto" : "Limite"}</small><b>${c.teto ? BRL0(c.teto) : "—"}</b></span>
        <span><small>Lances</small><b>${c.lancesRestantes ?? "—"}</b></span>
        <span><small>Score</small><b>${c.score ?? "—"}</b></span>
      </div>`
  }

  const FRAGMENTOS = {
    sub: fragSub,
    score: fragScore,
    sinais: fragSinais,
    valores: fragValores,
    fipeAviso: fragFipeAviso,
    resultado: fragResultado,
    uso: fragUso,
    compacto: fragCompacto
  }

  function atualizarFragmentos() {
    const el = estado.el
    if (!el || !estado.analise) return
    for (const [nome, fn] of Object.entries(FRAGMENTOS)) {
      const alvo = el.querySelector(`[data-frag="${nome}"]`)
      if (alvo) alvo.innerHTML = fn()
    }
    const teto = el.querySelector("#lm-teto-input")
    if (teto && document.activeElement !== teto) {
      teto.placeholder = estado.analise.calc.precoLimite > 0 ? Math.round(estado.analise.calc.precoLimite) : "—"
    }
    atualizarTicks()
    LM.live?.atualizar?.()
  }

  function atualizarTicks() {
    const el = estado.el
    const s = estado.analise?.snapshot
    if (!el || !s) return
    const fim = el.querySelector('[data-tick="fim"]')
    if (fim && s.dataFim) {
      const falta = s.dataFim - Date.now()
      fim.textContent =
        falta > 0 ? `⏱ Encerra em ${duracao(falta)} (${tsStr(s.dataFim)})` : `⏱ Horário previsto de encerramento já passou (${tsStr(s.dataFim)})`
      fim.classList.toggle("li-fim-perto", falta > 0 && falta < 5 * 60000)
    }
    const ult = el.querySelector('[data-tick="ultimo"]')
    if (ult && s.ultimoLanceEm) ult.textContent = tempoRelativo(s.ultimoLanceEm)
  }

  // ─── MONTAGEM ──────────────────────────────────────────────────────────────
  function htmlPainel() {
    const { snapshot: s, params: p } = estado.analise
    const u = estado.lot?.user || {}
    const ui = estado.ui
    const salvo = !!estado.lot
    const comparando = !!estado.lot?.comparar
    const anoMax = new Date().getFullYear() + 1
    const valor = (v) => (v == null || v === "" ? "" : esc(v))

    const secao = (id, titulo, conteudo) => {
      const rec = ui.secoesRecolhidas?.[id]
      return `
        <div class="li-section-header" data-section="${id}" role="button" tabindex="0" aria-expanded="${!rec}">
          <div class="li-section-title">${titulo}</div>
          <span class="li-collapse-icon ${rec ? "collapsed" : ""}">▼</span>
        </div>
        <div class="li-section-content ${rec ? "collapsed" : ""}" data-section-content="${id}">${conteudo}</div>`
    }

    const fipeInfo = [
      s.fipeNome ? `<div class="li-hint li-gold">📋 ${esc(s.fipeNome)}</div>` : "",
      s.fipeCodigo
        ? `<div class="li-hint">Código FIPE <code>${esc(s.fipeCodigo)}</code> <button class="li-link-btn" data-acao="copiar-fipe" type="button">copiar</button> · <a class="li-link" href="https://veiculos.fipe.org.br/" target="_blank" rel="noopener">consultar ↗</a></div>`
        : `<span class="li-hint">Consulte em <a class="li-link" href="https://veiculos.fipe.org.br/" target="_blank" rel="noopener">veiculos.fipe.org.br ↗</a></span>`
    ].join("")

    const extrasVeiculo = [
      s.tipoRetomada && ["Origem / retomada", `🏦 ${esc(s.tipoRetomada)}`],
      s.laudo && [
        "Laudo cautelar",
        `<span style="color:${/aprovado/i.test(s.laudo) && !/reprov/i.test(s.laudo) ? "#22c55e" : "#f59e0b"}">📑 ${esc(s.laudo)}</span>${s.laudoObs ? `<span class="li-hint li-pre">${esc(s.laudoObs)}</span>` : ""}`
      ],
      s.comitente && ["Comitente", esc(s.comitente)],
      s.possuiChave != null && ["Chave", s.possuiChave ? "🔑 Possui chave" : "⚠️ Sem chave"],
      s.temVideo != null && [
        "Vídeo",
        s.temVideo
          ? `🎥 Disponível${s.videoUrl && /^https:\/\//i.test(s.videoUrl) ? ` · <a class="li-link" href="${esc(s.videoUrl)}" target="_blank" rel="noopener">assistir ↗</a>` : ""}`
          : '<span style="color:#f85149">⚠️ Sem vídeo — possível veículo que não liga/não anda</span>'
      ],
      s.combustivel && ["Combustível", esc(s.combustivel)]
    ]
      .filter(Boolean)
      .map(
        ([lbl, val]) => `
        <div class="li-item li-item-full">
          <span class="li-item-label">${lbl}</span>
          <span class="li-item-value li-item-text">${val}</span>
        </div>`
      )
      .join("")

    return `
      <div class="li-header">
        <div class="li-brand">
          <span class="li-brand-name">LEILÔMETRO</span>
          ${salvo ? '<span class="li-saved-badge">salvo</span>' : ""}
        </div>
        <div class="li-controls">
          <button type="button" class="li-btn-compact" data-acao="compacto" title="${ui.compacto ? "Modo completo" : "Modo compacto (para o pregão)"}" aria-label="Alternar modo compacto">${ui.compacto ? "▣" : "▭"}</button>
          <button type="button" data-acao="relatorio" title="Relatório / imprimir" aria-label="Abrir relatório">📄</button>
          <button type="button" data-acao="atualizar" title="Atualizar dados" aria-label="Atualizar dados">↻</button>
          <button type="button" data-acao="minimizar" title="${ui.minimizado ? "Expandir" : "Minimizar"}" aria-label="Minimizar">${ui.minimizado ? "+" : "−"}</button>
          <button type="button" class="li-btn-close" data-acao="fechar" title="Fechar (Ctrl+Shift+L reabre)" aria-label="Fechar">×</button>
        </div>
      </div>

      <div class="li-compact" data-frag="compacto"></div>

      <div class="li-body">
        <div class="li-vehicle-name" title="${esc(s.modelo)}">${esc(s.modelo)}</div>
        <div class="li-sub" data-frag="sub"></div>

        <div class="li-score-row" data-frag="score"></div>
        <div data-frag="sinais"></div>

        <div class="li-divider"></div>
        ${secao("live", "🔔 MODO LEILÃO", '<div id="lm-live-root"></div>')}

        <div class="li-divider"></div>
        ${secao("valores", "💰 VALORES", '<div class="li-grid" data-frag="valores"></div>')}

        <div class="li-divider"></div>
        ${secao(
          "fipe",
          "📊 ANÁLISE FIPE",
          `
          <div class="li-fipe-edit-box">
            <span class="li-item-label">FIPE de referência ${tagOrigem(p.fipeOrigem)}</span>
            ${fipeInfo}
            <input id="lm-fipe-input" class="li-fipe-input" type="number" min="0" step="100" inputmode="numeric"
              placeholder="${s.fipeScraped ? esc(s.fipeScraped) : "Digite a FIPE (R$)"}" value="${valor(u.fipe ?? s.fipeScraped)}"/>
          </div>
          <div data-frag="fipeAviso"></div>
          <div class="li-row-2">
            <div class="li-margem-edit-box">
              <span class="li-item-label">Margem desejada</span>
              <div class="li-margem-row">
                <input id="lm-margem-input" class="li-fipe-input" type="number" min="0" max="60" step="1"
                  value="${Math.round((u.marg ?? estado.config.margemRevenda) * 100)}"/>
                <span class="li-hint-inline">%</span>
              </div>
            </div>
            <div class="li-margem-edit-box">
              <span class="li-item-label">Incremento ${tagOrigem(u.incremento ? "editado" : s.incremento ? "auto" : "padrao")}</span>
              <input id="lm-incremento-input" class="li-fipe-input" type="number" min="1" step="50"
                value="${valor(u.incremento ?? s.incremento ?? estado.config.incrementoLance)}"/>
            </div>
          </div>
          <div class="li-margem-edit-box li-teto-box">
            <span class="li-item-label">Meu teto (quanto topo pagar) ${tooltip("Opcional. Se vazio, o teto é o preço limite calculado. Os alertas do Modo Leilão usam este valor.")}</span>
            <input id="lm-teto-input" class="li-fipe-input" type="number" min="0" step="100"
              placeholder="${estado.analise.calc.precoLimite > 0 ? Math.round(estado.analise.calc.precoLimite) : "—"}" value="${valor(u.tetoLance)}"/>
          </div>
          <div class="li-grid" data-frag="resultado"></div>`
        )}

        <div class="li-divider"></div>
        ${secao(
          "veiculo",
          "🚗 VEÍCULO",
          `
          <div class="li-grid">
            <div class="li-item">
              <span class="li-item-label">Ano</span>
              ${
                estado.snapshot.ano
                  ? `<span class="li-item-value">${esc(estado.snapshot.ano)}</span>`
                  : `<input id="lm-ano-input" class="li-fipe-input" type="number" min="1950" max="${anoMax}" placeholder="Ex: 2020" value="${valor(u.ano)}"/>`
              }
            </div>
            <div class="li-item">
              <span class="li-item-label">KM total</span>
              ${
                estado.snapshot.km
                  ? `<span class="li-item-value">${NUM(estado.snapshot.km)}</span>`
                  : `<input id="lm-km-input" class="li-fipe-input" type="number" min="0" placeholder="Ex: 74000" value="${valor(u.km)}"/>`
              }
            </div>
          </div>
          <div class="li-grid li-mt" data-frag="uso"></div>
          <div class="li-grid li-mt">${extrasVeiculo}</div>`
        )}

        <div class="li-divider"></div>
        ${secao(
          "custos",
          "🔧 CUSTOS PÓS-ARREMATE",
          `
          <div class="li-grid li-grid-3">
            <div class="li-item">
              <span class="li-item-label">Conserto</span>
              <input id="lm-custo-conserto" class="li-fipe-input" type="number" min="0" step="100" value="${valor(u.custoConserto ?? estado.config.custoConserto)}"/>
            </div>
            <div class="li-item">
              <span class="li-item-label">Documentação</span>
              <input id="lm-custo-doc" class="li-fipe-input" type="number" min="0" step="50" value="${valor(u.custoDocumentacao ?? estado.config.custoDocumentacao)}"/>
            </div>
            <div class="li-item">
              <span class="li-item-label">IPVA</span>
              <input id="lm-custo-ipva" class="li-fipe-input" type="number" min="0" step="100" value="${valor(u.custoIPVA ?? estado.config.custoIPVA)}"/>
            </div>
          </div>
          <span class="li-hint">Ajuste conforme a condição real do veículo. Os padrões ficam em Configurações.</span>`
        )}

        <div class="li-divider"></div>
        <div class="li-section-title">📝 ANOTAÇÕES DO LOTE</div>
        <div class="li-notas-box">
          <textarea id="lm-notas" class="li-textarea" placeholder="Ex: amassado no para-choque, sem chave reserva, pneus novos...">${esc(u.notas || "")}</textarea>
          <div class="li-notas-footer">
            <span class="li-hint" id="lm-save-status">${salvo ? `Salvo ${tsStr(estado.lot.updatedAt)}` : "Edições são salvas automaticamente"}</span>
          </div>
        </div>

        <div class="li-footer">
          <div class="li-footer-btns">
            <button type="button" class="li-btn-settings ${comparando ? "li-on" : ""}" data-acao="comparar">${comparando ? `✓ Comparando` : "➕ Comparar"}</button>
            <button type="button" class="li-btn-settings ${estado.lot?.favorito ? "li-on" : ""}" data-acao="favorito"
              title="Marca o lote (★) e avisa ${esc(estado.config.lembreteMinutos)} min antes do encerramento previsto, mesmo com a aba fechada">${estado.lot?.favorito ? "⏰ Lembrete ligado" : "⏰ Lembrar"}</button>
            <button type="button" class="li-btn-settings" data-acao="abrir-comparador" title="Abrir comparador">⚖️ ${estado.compararTotal || ""}</button>
            <button type="button" class="li-btn-settings" data-acao="relatorio">📄 Relatório</button>
            <button type="button" class="li-btn-reset" data-acao="limpar" title="Apagar dados salvos deste lote" aria-label="Apagar dados salvos deste lote">🗑️</button>
          </div>
          <span class="li-scrape-note">Fonte: ${esc(s.fonte || "—")} · v${esc(LM.util.versao())} · <button type="button" class="li-link-btn" data-acao="config">configurações</button></span>
        </div>
      </div>
      <div id="lm-ai-root"></div>`
  }

  async function renderizar() {
    if (estado.fechado || !estado.analise) return
    const existente = document.getElementById("leilometro-panel")
    const scroll = existente?.querySelector(".li-body")?.scrollTop || 0
    existente?.remove()

    const lotes = await LM.storage.listLots()
    estado.compararTotal = lotes.filter((l) => l.comparar).length

    const panel = document.createElement("div")
    panel.id = "leilometro-panel"
    panel.setAttribute("data-version", LM.util.versao())
    panel.setAttribute("data-lote-id", estado.loteId)
    panel.classList.toggle("li-modo-compacto", !!estado.ui.compacto)
    panel.classList.toggle("li-modo-minimizado", !!estado.ui.minimizado)
    aplicarPosicao(panel)
    panel.innerHTML = htmlPainel()
    document.body.appendChild(panel)
    estado.el = panel

    atualizarFragmentos()
    const body = panel.querySelector(".li-body")
    if (body && scroll) body.scrollTop = scroll

    ligarEventos(panel)
    LM.live?.montar?.(panel)
    LM.assistant?.montar?.(panel)
    iniciarTick()
  }

  function aplicarPosicao(panel) {
    const pos = estado.ui.posicao
    if (!pos) return
    const left = Math.min(Math.max(0, parseInt(pos.left)), window.innerWidth - 120)
    const top = Math.min(Math.max(0, parseInt(pos.top)), window.innerHeight - 60)
    panel.style.setProperty("left", `${left}px`, "important")
    panel.style.setProperty("top", `${top}px`, "important")
    panel.style.setProperty("right", "auto", "important")
  }

  function iniciarTick() {
    clearInterval(estado.tick)
    estado.tick = setInterval(atualizarTicks, 1000)
  }

  // ─── CICLO DE VIDA ─────────────────────────────────────────────────────────
  async function abrir(loteId) {
    estado.loteId = loteId
    estado.fechado = false
    estado.lot = null
    estado.analise = null
    estado.config = await LM.storage.getConfig()
    estado.ui = await LM.storage.getUi()
    await carregar({ forcar: false })
  }

  async function carregar({ forcar = false } = {}) {
    const id = estado.loteId
    if (!id) return
    const [lot, snapshot] = await Promise.all([LM.storage.getLot(id), LM.scrape.coletarDados(id, { forcar })])
    if (id !== estado.loteId) return
    estado.lot = lot
    estado.snapshot = snapshot
    if (lot) {
      estado.lot = await LM.storage.saveLot(id, { snapshot, url: LM.scrape.urlDoLote() })
    }
    recalcular()
    await renderizar()
  }

  function fechar({ peloUsuario = false } = {}) {
    clearInterval(estado.tick)
    document.getElementById("leilometro-panel")?.remove()
    estado.el = null
    if (peloUsuario) estado.fechado = true
  }

  function descarregar() {
    fechar()
    estado.loteId = null
    estado.analise = null
    enviarBadge(true)
  }

  function recalcular() {
    estado.analise = LM.calc.analisar(estado.snapshot || {}, estado.lot?.user || {}, estado.config)
    enviarBadge()
  }

  // Usado pelo Modo Leilão: aplica um lance novo sem recriar o painel
  function aplicarSnapshot(parcial) {
    estado.snapshot = { ...estado.snapshot, ...parcial }
    recalcular()
    atualizarFragmentos()
  }

  function enviarBadge(limpar = false) {
    try {
      if (limpar || !estado.analise) {
        LM.util.enviar({ type: "badge", text: "" })
        return
      }
      const { calc } = estado.analise
      const info = LM.calc.getScoreLabel(calc.score)
      const rastreando = LM.live?.ativo?.()
      LM.util.enviar({
        type: "badge",
        text: `${rastreando ? "●" : ""}${calc.score ?? ""}`,
        color: rastreando ? "#ef4444" : info.color
      })
    } catch {}
  }

  // ─── PERSISTÊNCIA DAS EDIÇÕES ──────────────────────────────────────────────
  async function salvar(patch = {}) {
    const lot = await LM.storage.saveLot(estado.loteId, {
      snapshot: estado.snapshot,
      url: LM.scrape.urlDoLote(),
      ...patch
    })
    estado.lot = lot
    recalcular()
    atualizarFragmentos()
    marcarSalvo()
    return lot
  }

  const salvarUser = (user) => salvar({ user })

  function marcarSalvo() {
    const el = estado.el
    if (!el) return
    const st = el.querySelector("#lm-save-status")
    if (st) st.textContent = `Salvo ${tsStr(Date.now())}`
    const brand = el.querySelector(".li-brand")
    if (brand && !brand.querySelector(".li-saved-badge")) {
      brand.insertAdjacentHTML("beforeend", '<span class="li-saved-badge">salvo</span>')
    }
  }

  // ─── EVENTOS ───────────────────────────────────────────────────────────────
  function ligarEventos(panel) {
    panel.querySelector(".li-header").addEventListener("mousedown", iniciarArraste)

    panel.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-acao]")
      if (!btn || !panel.contains(btn)) return
      const acao = btn.getAttribute("data-acao")
      if (acao === "fechar") fechar({ peloUsuario: true })
      else if (acao === "atualizar") carregar({ forcar: true })
      else if (acao === "minimizar") {
        estado.ui.minimizado = !estado.ui.minimizado
        LM.storage.setUi({ minimizado: estado.ui.minimizado })
        panel.classList.toggle("li-modo-minimizado", estado.ui.minimizado)
        btn.textContent = estado.ui.minimizado ? "+" : "−"
        btn.title = estado.ui.minimizado ? "Expandir" : "Minimizar"
      } else if (acao === "compacto") {
        estado.ui.compacto = !estado.ui.compacto
        LM.storage.setUi({ compacto: estado.ui.compacto })
        panel.classList.toggle("li-modo-compacto", estado.ui.compacto)
        btn.textContent = estado.ui.compacto ? "▣" : "▭"
        btn.title = estado.ui.compacto ? "Modo completo" : "Modo compacto (para o pregão)"
      } else if (acao === "comparar") {
        const novo = !estado.lot?.comparar
        await salvar({ comparar: novo })
        estado.compararTotal += novo ? 1 : -1
        btn.textContent = novo ? "✓ Comparando" : "➕ Comparar"
        btn.classList.toggle("li-on", novo)
        const cmp = panel.querySelector('[data-acao="abrir-comparador"]')
        if (cmp) cmp.textContent = `⚖️ ${Math.max(0, estado.compararTotal) || ""}`
      } else if (acao === "favorito") {
        const novo = !estado.lot?.favorito
        await salvar({ favorito: novo })
        btn.textContent = novo ? "⏰ Lembrete ligado" : "⏰ Lembrar"
        btn.classList.toggle("li-on", novo)
      } else if (acao === "abrir-comparador") {
        LM.util.enviar({ type: "open", path: "compare/compare.html" })
      } else if (acao === "relatorio") {
        await salvar()
        LM.util.enviar({ type: "open", path: `report/report.html?id=${encodeURIComponent(estado.loteId)}` })
      } else if (acao === "config") {
        LM.util.enviar({ type: "openOptions" })
      } else if (acao === "limpar") {
        if (confirm("Apagar as edições, anotações e alertas salvos deste lote?")) {
          LM.live?.parar?.()
          await LM.storage.deleteLot(estado.loteId)
          estado.lot = null
          recalcular()
          renderizar()
        }
      } else if (acao === "copiar-fipe") {
        try {
          await navigator.clipboard.writeText(estado.snapshot.fipeCodigo)
          btn.textContent = "copiado ✓"
          setTimeout(() => (btn.textContent = "copiar"), 1500)
        } catch {}
      }
    })

    // Seções recolhíveis
    panel.querySelectorAll(".li-section-header").forEach((header) => {
      const alternar = () => {
        const id = header.getAttribute("data-section")
        const content = panel.querySelector(`[data-section-content="${id}"]`)
        const recolhida = content?.classList.toggle("collapsed")
        header.querySelector(".li-collapse-icon")?.classList.toggle("collapsed", recolhida)
        header.setAttribute("aria-expanded", String(!recolhida))
        estado.ui.secoesRecolhidas = { ...estado.ui.secoesRecolhidas, [id]: recolhida }
        LM.storage.setUi({ secoesRecolhidas: estado.ui.secoesRecolhidas })
      }
      header.addEventListener("click", alternar)
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          alternar()
        }
      })
    })

    // Campos numéricos: salva ao confirmar (change)
    const campos = {
      "#lm-fipe-input": (v) => ({ fipe: v }),
      "#lm-margem-input": (v) => ({ marg: v != null ? v / 100 : null }),
      "#lm-incremento-input": (v) => ({ incremento: v }),
      "#lm-teto-input": (v) => ({ tetoLance: v }),
      "#lm-ano-input": (v) => ({ ano: v }),
      "#lm-km-input": (v) => ({ km: v }),
      "#lm-custo-conserto": (v) => ({ custoConserto: v }),
      "#lm-custo-doc": (v) => ({ custoDocumentacao: v }),
      "#lm-custo-ipva": (v) => ({ custoIPVA: v })
    }
    for (const [sel, mapear] of Object.entries(campos)) {
      panel.querySelector(sel)?.addEventListener("change", (e) => {
        salvarUser(mapear(numOuNull(e.target.value)))
      })
    }

    let notasTimer
    panel.querySelector("#lm-notas")?.addEventListener("input", (e) => {
      clearTimeout(notasTimer)
      const texto = e.target.value
      notasTimer = setTimeout(() => salvarUser({ notas: texto }), 700)
    })

    // Teclas digitadas no painel não devem acionar atalhos do site
    panel.addEventListener("keydown", (e) => e.stopPropagation())
  }

  // ─── ARRASTAR (listeners do document registrados uma única vez) ───────────
  let arraste = null
  function iniciarArraste(e) {
    if (e.target.closest("button")) return
    const el = estado.el
    if (!el) return
    const rect = el.getBoundingClientRect()
    arraste = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top }
    estado.arrastando = true
    el.classList.add("li-arrastando")
    e.preventDefault()
  }

  document.addEventListener("mousemove", (e) => {
    if (!arraste || !estado.el) return
    const left = Math.max(0, Math.min(window.innerWidth - 80, arraste.left + e.clientX - arraste.x))
    const top = Math.max(0, Math.min(window.innerHeight - 40, arraste.top + e.clientY - arraste.y))
    estado.el.style.setProperty("left", `${left}px`, "important")
    estado.el.style.setProperty("top", `${top}px`, "important")
    estado.el.style.setProperty("right", "auto", "important")
  })

  document.addEventListener("mouseup", () => {
    if (!arraste) return
    arraste = null
    estado.arrastando = false
    const el = estado.el
    if (!el) return
    el.classList.remove("li-arrastando")
    estado.ui.posicao = { left: el.style.left, top: el.style.top }
    LM.storage.setUi({ posicao: estado.ui.posicao })
  })

  // ─── SINCRONIA COM OUTRAS TELAS (popup, comparador, opções) ───────────────
  LM.storage.onConfigChanged(async () => {
    if (!estado.loteId || !estado.analise) return
    estado.config = await LM.storage.getConfig()
    recalcular()
    const focado = document.activeElement?.closest?.("#leilometro-panel")
    if (focado) atualizarFragmentos()
    else renderizar()
  })

  LM.storage.onLotsChanged(async (ids) => {
    if (!estado.loteId || !ids.includes(estado.loteId) || !estado.analise) return
    const lot = await LM.storage.getLot(estado.loteId)
    const mudouUser = JSON.stringify(lot?.user || {}) !== JSON.stringify(estado.lot?.user || {})
    const mudouComparar = !!lot?.comparar !== !!estado.lot?.comparar || !!lot?.favorito !== !!estado.lot?.favorito
    estado.lot = lot
    if (!lot || mudouComparar) {
      recalcular()
      if (!document.activeElement?.closest?.("#leilometro-panel")) renderizar()
    } else if (mudouUser) {
      recalcular()
      atualizarFragmentos()
    }
  })

  // O site (SPA) pode recriar o <body> ou remover nós ao terminar de carregar.
  // Se o painel sumiu sem o usuário fechar, monta de novo.
  let remontando = false
  async function garantir() {
    if (remontando || !estado.loteId || !estado.analise || estado.fechado) return
    if (estado.el && document.body.contains(estado.el)) return
    remontando = true
    try {
      await renderizar()
    } finally {
      remontando = false
    }
  }

  LM.panel = {
    estado,
    garantir,
    abrir,
    carregar,
    fechar,
    descarregar,
    renderizar,
    atualizarFragmentos,
    aplicarSnapshot,
    salvar,
    salvarUser,
    enviarBadge,
    tooltip,
    aberto: () => !!estado.el,
    reabrir: () => {
      estado.fechado = false
      return renderizar()
    }
  }
})()
