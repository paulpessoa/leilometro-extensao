;(function () {
  "use strict"
  const LM = globalThis.LM
  const { esc, BRL0, NUM, PCT, tsStr, tempoRelativo, numOuNull, miniMarkdown } = LM.util
  const $ = (s) => document.querySelector(s)

  const estado = { config: null, lotes: [], colunas: [], ranking: null, carregando: false }

  // ─── LINHAS DA TABELA ──────────────────────────────────────────────────────
  // melhor: "max" | "min" | null (sem destaque)
  const LINHAS = [
    { secao: "Veículo" },
    { rotulo: "Ano", v: (a) => a.snapshot.ano, fmt: (v) => v ?? "—", melhor: "max" },
    { rotulo: "KM", v: (a) => a.snapshot.km, fmt: (v) => (v ? NUM(v) : "—"), melhor: "min" },
    { rotulo: "KM/ano", v: (a) => a.snapshot.kmAno, fmt: (v) => (v ? NUM(v) : "—"), melhor: "min" },
    { rotulo: "Uso estimado", v: (a) => LM.calc.classifyKmAno(a.snapshot.kmAno).curto, texto: true },
    { rotulo: "Combustível", v: (a) => a.snapshot.combustivel, texto: true },
    { rotulo: "Origem", v: (a) => a.snapshot.tipoRetomada, texto: true },
    { rotulo: "Laudo cautelar", v: (a) => a.snapshot.laudo, texto: true },
    { rotulo: "Chave", v: (a) => (a.snapshot.possuiChave == null ? null : a.snapshot.possuiChave ? "Sim" : "Não"), texto: true },
    { rotulo: "Local", v: (a) => a.snapshot.local, texto: true },
    { secao: "Leilão" },
    {
      rotulo: "Lance atual",
      v: (a) => a.calc.lance,
      fmt: (v, a) => `${BRL0(v)}${a.snapshot.lidoEm ? `<br/><small class="muted">lido ${tempoRelativo(a.snapshot.lidoEm)}</small>` : ""}`,
      csv: (v) => v
    },
    { rotulo: "Lances no site", v: (a) => a.snapshot.qtdLances, fmt: (v) => v ?? "—" },
    { rotulo: "Encerramento previsto", v: (a) => a.snapshot.dataFim, fmt: (v) => (v ? tsStr(v) : "—"), texto: true, csv: (v) => (v ? tsStr(v) : "") },
    { rotulo: "Comissão", v: (a) => a.params.comissaoPct, fmt: (v) => PCT(v, 1), csv: (v) => v },
    { rotulo: "Taxas do leilão", v: (a) => a.params.taxasLeilao, fmt: BRL0, melhor: "min" },
    { rotulo: "Custo no leilão", v: (a) => a.calc.custoArremate, fmt: BRL0, melhor: "min" },
    { secao: "Análise" },
    { rotulo: "FIPE", campo: "fipe", v: (a) => a.params.fipe, fmt: BRL0 },
    { rotulo: "Margem desejada", v: (a) => a.params.margem, fmt: (v) => PCT(v), csv: (v) => v },
    { rotulo: "Conserto estimado", campo: "custoConserto", v: (a) => a.params.custoConserto, fmt: BRL0 },
    { rotulo: "Custo total", v: (a) => a.calc.custoTotal, fmt: BRL0, melhor: "min" },
    { rotulo: "Preço limite", v: (a) => a.calc.precoLimite, fmt: (v) => (v > 0 ? BRL0(v) : v != null ? "Inviável" : "—"), melhor: "max" },
    { rotulo: "Meu teto", campo: "tetoLance", v: (a) => a.params.tetoLance, fmt: BRL0 },
    { rotulo: "Folga até o teto", v: (a) => a.calc.folga, fmt: BRL0, melhor: "max" },
    { rotulo: "Lucro potencial", v: (a) => a.calc.potencialLucro, fmt: BRL0, melhor: "max" },
    { rotulo: "Lucro % da FIPE", v: (a) => a.calc.lucroPct, fmt: (v) => PCT(v, 1), melhor: "max", csv: (v) => v },
    {
      rotulo: "Score",
      v: (a) => a.calc.score,
      fmt: (v) => {
        const i = LM.calc.getScoreLabel(v)
        return v == null ? "—" : `<span class="score" style="background:${i.color}">${v}</span> <small class="muted">${i.label}</small>`
      },
      melhor: "max"
    },
    { secao: "Anotações" },
    { rotulo: "Notas", v: (a, lot) => lot.user?.notas || null, texto: true }
  ]

  // ─── DADOS ─────────────────────────────────────────────────────────────────
  async function carregar() {
    estado.config = await LM.storage.getConfig()
    estado.lotes = await LM.storage.listLots()
    montarColunas()
    renderizar()
  }

  function montarColunas() {
    const marcados = estado.lotes.filter((l) => l.comparar)
    estado.colunas = marcados.map((lot) => ({ lot, a: LM.calc.analisar(lot.snapshot || {}, lot.user || {}, estado.config) }))
    const ordem = $("#ordem").value
    const chave = {
      score: (c) => c.a.calc.score ?? -1,
      lucro: (c) => c.a.calc.potencialLucro ?? -Infinity,
      custo: (c) => -(c.a.calc.custoArremate ?? Infinity),
      ia: (c) => -(posicaoIa(c.lot.id) ?? 999)
    }[ordem]
    estado.colunas.sort((x, y) => chave(y) - chave(x))
  }

  function posicaoIa(id) {
    return estado.ranking?.ranking?.find((r) => r.id === id)?.posicao ?? null
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────
  function renderizar() {
    const cols = estado.colunas
    $("#titulo").textContent = cols.length ? `Comparando ${cols.length} veículo${cols.length > 1 ? "s" : ""}` : "Comparar veículos"
    $("#ia").disabled = cols.length < 2
    $("#csv").disabled = !cols.length
    $("#relatorio").disabled = !cols.length
    $("#atualizar").disabled = !cols.length

    if (!cols.length) {
      $("#conteudo").innerHTML = `
        <div class="card vazio">
          <p style="font-size:16px; margin-top:0"><b>Nenhum veículo no comparador.</b></p>
          <p class="muted">No painel do Leilômetro, abra um lote e clique em <b>➕ Comparar</b>. Ou adicione abaixo um dos lotes que você já salvou.</p>
        </div>`
    } else {
      const cab = cols
        .map(({ lot, a }) => {
          const pos = posicaoIa(lot.id)
          const motivo = estado.ranking?.ranking?.find((r) => r.id === lot.id)?.motivo
          return `
          <th>
            <div class="cab">
              ${a.snapshot.foto ? `<img src="${esc(a.snapshot.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : ""}
              ${pos ? `<span class="rank">🤖 #${pos}</span>${motivo ? `<span class="rank-motivo">${esc(motivo)}</span>` : ""}` : ""}
              <span class="nome">${esc(a.snapshot.modelo || "Veículo")}</span>
              <div class="acoes">
                ${lot.url ? `<a class="btn btn-sm" href="${esc(lot.url)}" target="_blank" rel="noopener">Abrir ↗</a>` : ""}
                <button class="btn btn-sm" data-remover="${esc(lot.id)}" title="Tirar do comparador">✕</button>
              </div>
            </div>
          </th>`
        })
        .join("")

      const corpo = LINHAS.map((linha) => {
        if (linha.secao) return `<tr class="secao"><th>${linha.secao}</th>${cols.map(() => "<td></td>").join("")}</tr>`
        const valores = cols.map(({ lot, a }) => linha.v(a, lot))
        const numericos = valores.filter((v) => typeof v === "number" && !isNaN(v))
        let melhor = null
        let pior = null
        if (linha.melhor && numericos.length >= 2 && new Set(numericos).size > 1) {
          melhor = linha.melhor === "max" ? Math.max(...numericos) : Math.min(...numericos)
          pior = linha.melhor === "max" ? Math.min(...numericos) : Math.max(...numericos)
        }
        const celulas = cols
          .map(({ lot, a }, i) => {
            const v = valores[i]
            const cls = [linha.texto ? "texto" : "", v === melhor ? "melhor" : v === pior ? "pior" : ""].join(" ").trim()
            if (linha.campo) {
              const atual = lot.user?.[linha.campo]
              const sugestao = linha.campo === "tetoLance" ? a.calc.precoLimite : v
              return `<td class="${cls}"><input type="number" min="0" step="100" data-id="${esc(lot.id)}" data-campo="${linha.campo}"
                value="${atual != null ? esc(atual) : linha.campo === "tetoLance" ? "" : v ?? ""}" placeholder="${sugestao > 0 ? Math.round(sugestao) : "—"}"/></td>`
            }
            const html = linha.fmt ? linha.fmt(v, a) : esc(v ?? "—")
            return `<td class="${cls}">${linha.texto && !linha.fmt ? esc(v ?? "—") : html}</td>`
          })
          .join("")
        return `<tr><th>${linha.rotulo}</th>${celulas}</tr>`
      }).join("")

      $("#conteudo").innerHTML = `
        <div class="tabela-wrap">
          <table>
            <thead><tr><th></th>${cab}</tr></thead>
            <tbody>${corpo}</tbody>
          </table>
        </div>`
    }

    // Foto que não carregar some (sem handler inline: a CSP da extensão não permite)
    document.querySelectorAll(".cab img").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }))

    renderizarResumoIa()
    renderizarOutros()
  }

  function renderizarResumoIa() {
    const r = estado.ranking
    $("#iaResumo").innerHTML = r?.resumo
      ? `<div class="card ia-resumo"><p class="md-h">🤖 Análise da IA <small class="muted">· ${esc(r.modelo || "")} · ${tsStr(r.em)}</small></p>${miniMarkdown(r.resumo)}</div>`
      : ""
  }

  function renderizarOutros() {
    const outros = estado.lotes.filter((l) => !l.comparar)
    $("#outros").innerHTML = outros.length
      ? `<h2>Outros lotes salvos</h2>
         <div class="outros-lista">${outros
           .map(
             (l) => `<div class="outro"><span title="${esc(l.snapshot?.modelo)}">${esc(l.snapshot?.modelo || "Veículo")}</span>
               <button class="btn btn-sm" data-adicionar="${esc(l.id)}">➕ Comparar</button></div>`
           )
           .join("")}</div>`
      : ""
  }

  // ─── AÇÕES ─────────────────────────────────────────────────────────────────
  function mostrar(texto, tipo = "info") {
    const el = $("#msg")
    el.className = `msg ${tipo}`
    el.innerHTML = texto
    if (tipo === "ok") setTimeout(() => (el.className = "msg"), 3000)
  }

  document.addEventListener("click", async (e) => {
    const rem = e.target.closest("[data-remover]")
    const add = e.target.closest("[data-adicionar]")
    if (rem) await LM.storage.saveLot(rem.dataset.remover, { comparar: false })
    if (add) await LM.storage.saveLot(add.dataset.adicionar, { comparar: true })
    if (rem || add) carregar()
  })

  document.addEventListener("change", async (e) => {
    const input = e.target.closest("input[data-campo]")
    if (!input) return
    await LM.storage.saveLot(input.dataset.id, { user: { [input.dataset.campo]: numOuNull(input.value) } })
    carregar()
  })

  $("#ordem").addEventListener("change", () => {
    montarColunas()
    renderizar()
  })

  $("#atualizar").addEventListener("click", async () => {
    const btn = $("#atualizar")
    btn.disabled = true
    let ok = 0
    for (const [i, { lot }] of estado.colunas.entries()) {
      mostrar(`Atualizando ${i + 1} de ${estado.colunas.length}…`)
      try {
        const snap = await LM.api.buscarLote(lot.id, { forcar: true })
        if (snap) {
          await LM.storage.saveLot(lot.id, { snapshot: snap })
          ok++
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500))
    }
    mostrar(`✓ ${ok} de ${estado.colunas.length} lotes atualizados.`, "ok")
    btn.disabled = false
    carregar()
  })

  $("#ia").addEventListener("click", async () => {
    const status = await chrome.runtime.sendMessage({ type: "ai.status" })
    if (!status?.configurado) {
      mostrar('Configure sua chave de IA primeiro: <a href="../options/options.html#ia">Configurações › IA</a>', "erro")
      return
    }
    const btn = $("#ia")
    btn.disabled = true
    mostrar(`🤖 Analisando ${estado.colunas.length} lotes com ${esc(status.provedorNome)}…`)
    const lotes = estado.colunas.map(({ lot }) => ({
      id: lot.id,
      ...LM.calc.resumoIa(lot.snapshot || {}, lot.user || {}, estado.config),
      anotacoes: status.incluirNotas ? lot.user?.notas || undefined : undefined
    }))
    const r = await chrome.runtime.sendMessage({ type: "ai.ask", tarefa: "ranking", contexto: { lotes } })
    btn.disabled = false
    if (!r?.ok) {
      mostrar(`✗ ${esc(r?.erro || "Erro desconhecido")}`, "erro")
      return
    }
    if (!r.json?.ranking) {
      estado.ranking = { resumo: r.texto, ranking: [], em: r.em, modelo: r.modelo }
    } else {
      estado.ranking = { ...r.json, em: r.em, modelo: r.modelo }
      $("#ordem").value = "ia"
    }
    try {
      sessionStorage.setItem("lm_ranking", JSON.stringify(estado.ranking))
    } catch {}
    mostrar("✓ Análise pronta.", "ok")
    montarColunas()
    renderizar()
  })

  $("#relatorio").addEventListener("click", () => {
    const ids = estado.colunas.map((c) => c.lot.id).join(",")
    location.href = `../report/report.html?ids=${encodeURIComponent(ids)}`
  })

  $("#csv").addEventListener("click", () => {
    const cols = estado.colunas
    const celula = (v) => {
      if (v == null) return ""
      if (typeof v === "number") return String(Math.round(v * 10000) / 10000).replace(".", ",")
      return `"${String(v).replace(/"/g, '""')}"`
    }
    const linhas = [["", ...cols.map((c) => c.a.snapshot.modelo || "Veículo")].map(celula).join(";")]
    for (const l of LINHAS) {
      if (l.secao) continue
      const vals = cols.map(({ lot, a }) => {
        const v = l.v(a, lot)
        return l.csv ? l.csv(v) : v
      })
      linhas.push([celula(l.rotulo), ...vals.map(celula)].join(";"))
    }
    linhas.push([celula("Link"), ...cols.map((c) => celula(c.lot.url || ""))].join(";"))
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `leilometro-comparacao-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  })

  // Mudanças vindas do painel em outra aba
  let recarga
  LM.storage.onLotsChanged(() => {
    if (document.activeElement?.matches?.("input[data-campo]")) return
    clearTimeout(recarga)
    recarga = setTimeout(carregar, 400)
  })
  LM.storage.onConfigChanged(() => carregar())

  try {
    estado.ranking = JSON.parse(sessionStorage.getItem("lm_ranking") || "null")
  } catch {}
  carregar()
})()
