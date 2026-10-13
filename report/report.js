;(function () {
  "use strict"
  const LM = globalThis.LM
  const { esc, BRL, BRL0, NUM, PCT, tsStr, miniMarkdown } = LM.util
  const $ = (s) => document.querySelector(s)

  const params = new URLSearchParams(location.search)
  const ids = (params.get("ids") || params.get("id") || "").split(",").map((s) => s.trim()).filter(Boolean)
  const estado = { config: null, lotes: [] }

  function mostrar(texto) {
    const el = $("#msg")
    el.textContent = texto
    el.classList.toggle("on", !!texto)
  }

  function sparkline(hist, teto) {
    const pts = (hist || []).slice(-80)
    if (pts.length < 2) return ""
    const W = 700
    const H = 70
    const vals = pts.map((p) => p.v)
    let min = Math.min(...vals)
    let max = Math.max(...vals)
    const comTeto = teto && teto > min * 0.9 && teto < max * 1.15
    if (comTeto) {
      min = Math.min(min, teto)
      max = Math.max(max, teto)
    }
    const span = max - min || 1
    const t0 = pts[0].t
    const ts = pts[pts.length - 1].t - t0 || 1
    const x = (t) => ((t - t0) / ts) * (W - 4) + 2
    const y = (v) => H - 4 - ((v - min) / span) * (H - 8)
    let d = `M${x(pts[0].t)},${y(pts[0].v)}`
    for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t)} V${y(pts[i].v)}`
    return `
      <div class="sec"><div class="stitle">Histórico de lances acompanhado (${pts.length} registros)</div>
        <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          ${comTeto ? `<line x1="0" x2="${W}" y1="${y(teto)}" y2="${y(teto)}" stroke="#dc2626" stroke-dasharray="5 4"/>` : ""}
          <path d="${d}" fill="none" stroke="#b8860b" stroke-width="2"/>
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#888">
          <span>${BRL0(pts[0].v)} · ${tsStr(pts[0].t)}</span>${comTeto ? `<span class="red">teto ${BRL0(teto)}</span>` : ""}<span>${BRL0(pts[pts.length - 1].v)} · ${tsStr(pts[pts.length - 1].t)}</span>
        </div>
      </div>`
  }

  function folhaLote(lot) {
    const { snapshot: s, params: p, calc: c } = LM.calc.analisar(lot.snapshot || {}, lot.user || {}, estado.config)
    const si = LM.calc.getScoreLabel(c.score)
    const ki = LM.calc.classifyKmAno(s.kmAno)
    const linha = (rotulo, valor, cls = "") => (valor == null || valor === "" ? "" : `<tr><td>${rotulo}</td><td class="${cls}">${valor}</td></tr>`)
    const taxas = [
      ["Depósito de bens", s.depositoBens],
      ["Remoção", s.taxaRemocao],
      ["Vistoria", s.taxaVistoria],
      ["Despachante", s.taxaDespachante],
      ["Outros", s.taxaOutros]
    ].filter(([, v]) => v)
    const ia = lot.ai?.relatorio
    const sinais = LM.calc.sinaisDeAtencao(s)

    return `
      <div class="folha" data-id="${esc(lot.id)}">
        <h1>${esc(s.modelo || "Veículo")}</h1>
        <div class="sub">${[s.leilaoNome, s.local, s.numeroLote ? `Lote ${s.numeroLote}` : null, `gerado em ${new Date().toLocaleString("pt-BR")}`].filter(Boolean).map(esc).join(" · ")}</div>
        <div class="topo">
          ${s.foto ? `<img src="${esc(s.foto)}" alt="" referrerpolicy="no-referrer"/>` : ""}
          <div style="flex:1">
            <div class="score-row">
              <div class="sn" style="color:${si.color}">${c.score ?? "—"}</div>
              <div class="oport">OPORTUNIDADE<strong style="color:${si.color}">${si.label}</strong></div>
            </div>
            <div class="km-row" style="color:${ki.color}; background:${ki.color}14; border:1px solid ${ki.color}40">${ki.emoji} ${esc(ki.label)}</div>
          </div>
        </div>

        ${
          sinais.length
            ? `<div class="sec"><div class="stitle">Sinais de atenção</div>${sinais
                .map(
                  (x) =>
                    `<div class="sinal ${x.nivel}">${x.icone} <strong>${esc(x.titulo)}</strong> — ${esc(x.detalhe)}</div>`
                )
                .join("")}</div>`
            : ""
        }

        <div class="sec"><div class="stitle">Veículo</div><table>
          ${linha("Ano modelo / fabricação", [s.ano, s.anoFabricacao].filter(Boolean).join(" / "))}
          ${linha("KM", s.km ? `${NUM(s.km)} km (${NUM(s.kmAno)} km/ano)` : "—")}
          ${linha("Combustível", esc(s.combustivel))}
          ${linha("Cor", esc(s.cor))}
          ${linha("FIPE de referência", s.fipeNome ? `${esc(s.fipeNome)}${s.fipeCodigo ? ` (${esc(s.fipeCodigo)})` : ""}` : null)}
          ${linha("Origem / retomada", esc(s.tipoRetomada))}
          ${linha("Comitente", esc(s.comitente))}
          ${linha("Laudo cautelar", s.laudo ? `${esc(s.laudo)}${s.laudoObs ? `<br/><small style="font-weight:400;white-space:pre-wrap">${esc(s.laudoObs)}</small>` : ""}` : null)}
          ${linha("Chave", s.possuiChave == null ? null : s.possuiChave ? "Possui" : "Não possui", s.possuiChave === false ? "red" : "")}
          ${linha("Vídeo do lote", s.temVideo == null ? null : s.temVideo ? "Disponível" : "Sem vídeo", s.temVideo === false ? "red" : "")}
          ${linha("Encerramento previsto", s.dataFim ? tsStr(s.dataFim) : null)}
        </table></div>

        <div class="sec"><div class="stitle">Valores no leilão${s.lidoEm ? ` (lidos em ${tsStr(s.lidoEm)})` : ""}</div><table>
          ${linha("Lance atual", BRL(c.lance))}
          ${linha(`Comissão (${PCT(p.comissaoPct, 1)})${p.comissaoAuto ? "" : " — estimada"}`, `+ ${BRL(c.comissao)}`, "amber")}
          ${taxas.length ? taxas.map(([n, v]) => linha(n, `+ ${BRL(v)}`, "amber")).join("") : linha(`Taxas do leilão${p.taxasAuto ? "" : " — padrão estimado"}`, `+ ${BRL(p.taxasLeilao)}`, "amber")}
          <tr class="hl"><td><strong>Custo no leilão</strong></td><td class="gold"><strong>${BRL(c.custoArremate)}</strong></td></tr>
        </table></div>

        <div class="sec"><div class="stitle">Análise</div><table>
          ${linha("FIPE de referência", BRL(p.fipe))}
          ${linha("Margem desejada", PCT(p.margem))}
          ${linha("Conserto estimado", `+ ${BRL(p.custoConserto)}`, "red")}
          ${linha("Documentação", `+ ${BRL(p.custoDocumentacao)}`, "red")}
          ${linha("IPVA", `+ ${BRL(p.custoIPVA)}`, "red")}
          ${linha("Custo total", BRL(c.custoTotal))}
          <tr class="hl"><td><strong>Preço limite</strong></td><td class="gold"><strong>${c.precoLimite > 0 ? BRL(c.precoLimite) : c.precoLimite != null ? "Inviável" : "—"}</strong></td></tr>
          ${linha("Meu teto", p.tetoLance ? BRL(p.tetoLance) : null)}
          ${linha("Lances até o teto", c.lancesRestantes != null ? `${c.lancesRestantes} (incremento ${BRL0(c.incremento)})` : null, c.lancesRestantes > 0 ? "green" : "red")}
          ${linha("Lucro potencial", c.potencialLucro != null ? `${BRL(c.potencialLucro)} (${PCT(c.lucroPct, 1)} da FIPE)` : "—", c.potencialLucro > 0 ? "green" : "red")}
        </table></div>

        ${sparkline(lot.live?.historico, c.teto)}

        ${lot.user?.notas ? `<div class="sec"><div class="stitle">Anotações</div><div class="notas">${esc(lot.user.notas)}</div></div>` : ""}

        ${ia ? `<div class="sec"><div class="stitle">Parecer da IA</div><div class="ia">${miniMarkdown(ia.texto)}<div class="ia-meta">${esc(ia.modelo || "")} · ${tsStr(ia.em)} · gerado por IA, confira os números</div></div></div>` : ""}

        <div class="aviso">⚠️ Análise de apoio à decisão. Leia o edital completo e vistorie o veículo antes de dar lance.</div>
        <div class="rod"><span>Leilômetro v${esc(LM.util.versao())}</span><span>${esc((lot.url || "").replace(/^https?:\/\//, ""))}</span></div>
      </div>`
  }

  function folhaComparacao(lotes) {
    const linhas = lotes.map((lot) => {
      const { snapshot: s, calc: c, params: p } = LM.calc.analisar(lot.snapshot || {}, lot.user || {}, estado.config)
      return `<tr>
        <td>${esc(s.modelo || "Veículo")}</td><td>${s.ano ?? "—"}</td><td>${s.km ? NUM(s.km) : "—"}</td>
        <td>${BRL0(c.lance)}</td><td>${BRL0(p.fipe)}</td><td>${c.precoLimite > 0 ? BRL0(c.precoLimite) : "—"}</td>
        <td>${BRL0(c.potencialLucro)}</td><td>${c.score ?? "—"}</td></tr>`
    })
    return `
      <div class="folha">
        <h1>Comparação de ${lotes.length} veículos</h1>
        <div class="sub">gerado em ${new Date().toLocaleString("pt-BR")}</div>
        <table class="cmp">
          <thead><tr><th>Veículo</th><th>Ano</th><th>KM</th><th>Lance</th><th>FIPE</th><th>Limite</th><th>Lucro</th><th>Score</th></tr></thead>
          <tbody>${linhas.join("")}</tbody>
        </table>
        <div class="aviso">⚠️ Análise de apoio à decisão. Leia o edital completo e vistorie cada veículo antes de dar lance.</div>
      </div>`
  }

  function textoParaCopiar() {
    return estado.lotes
      .map((lot) => {
        const { snapshot: s, params: p, calc: c } = LM.calc.analisar(lot.snapshot || {}, lot.user || {}, estado.config)
        return [
          `🚗 *${s.modelo || "Veículo"}*${s.ano ? ` — ${s.ano}` : ""}${s.km ? ` · ${NUM(s.km)} km` : ""}`,
          `💰 Lance: ${BRL0(c.lance)} · Custo no leilão: ${BRL0(c.custoArremate)}`,
          `📊 FIPE: ${BRL0(p.fipe)} · Limite: ${c.precoLimite > 0 ? BRL0(c.precoLimite) : "—"} · Lucro: ${BRL0(c.potencialLucro)}`,
          `⭐ Score: ${c.score ?? "—"} (${LM.calc.getScoreLabel(c.score).label}) · Uso: ${LM.calc.classifyKmAno(s.kmAno).curto}`,
          s.laudo ? `📑 Laudo: ${s.laudo}` : null,
          ...LM.calc.sinaisDeAtencao(s)
            .filter((x) => x.id !== "laudo-obs")
            .map((x) => `⚠️ ${x.titulo}${x.id === "sem-video" ? " (pode não ligar/andar)" : ""}`),
          lot.user?.notas ? `📝 ${lot.user.notas}` : null,
          lot.url || null
        ]
          .filter(Boolean)
          .join("\n")
      })
      .join("\n\n")
  }

  async function renderizar() {
    estado.config = await LM.storage.getConfig()
    estado.lotes = (await Promise.all(ids.map((id) => LM.storage.getLot(id)))).filter(Boolean)
    if (!estado.lotes.length) {
      $("#conteudo").innerHTML = '<div class="folha"><h1>Lote não encontrado</h1><p>Abra o relatório pelo painel do Leilômetro ou pelo comparador.</p></div>'
      return
    }
    document.title = estado.lotes.length === 1 ? `Relatório — ${estado.lotes[0].snapshot?.modelo || "Veículo"}` : `Relatório — ${estado.lotes.length} veículos`
    $("#conteudo").innerHTML = (estado.lotes.length > 1 ? folhaComparacao(estado.lotes) : "") + estado.lotes.map(folhaLote).join("")
    document.querySelectorAll(".topo img").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }))

    // Botão de parecer da IA (um lote, ainda sem parecer)
    const btn = $("#gerarIa")
    btn.hidden = true
    if (estado.lotes.length === 1 && !estado.lotes[0].ai?.relatorio) {
      try {
        const st = await chrome.runtime.sendMessage({ type: "ai.status" })
        btn.hidden = !st?.configurado
      } catch {}
    }
  }

  $("#imprimir").addEventListener("click", () => window.print())

  $("#copiar").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textoParaCopiar())
      mostrar("✓ Texto copiado — cole no WhatsApp ou e-mail.")
      setTimeout(() => mostrar(""), 2500)
    } catch {
      mostrar("Não foi possível copiar.")
    }
  })

  $("#gerarIa").addEventListener("click", async () => {
    const lot = estado.lotes[0]
    const btn = $("#gerarIa")
    btn.disabled = true
    mostrar("🤖 Gerando parecer…")
    const st = await chrome.runtime.sendMessage({ type: "ai.status" })
    const contexto = LM.calc.contextoIa(lot.snapshot || {}, lot.user || {}, estado.config, {
      historico: lot.live?.historico || [],
      incluirNotas: st?.incluirNotas !== false
    })
    const r = await chrome.runtime.sendMessage({ type: "ai.ask", tarefa: "relatorio", contexto })
    btn.disabled = false
    if (!r?.ok) {
      mostrar(`✗ ${r?.erro || "Erro desconhecido"}`)
      return
    }
    await LM.storage.saveLot(lot.id, { ai: { relatorio: { texto: r.texto, em: r.em, modelo: r.modelo } } })
    mostrar("")
    renderizar()
  })

  renderizar()
})()
