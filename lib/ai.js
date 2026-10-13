/**
 * Leilômetro — assistente de IA (roda só no service worker; a chave nunca vai
 * para o content script nem para a página do leiloeiro)
 *
 * Provedores: OpenAI (Chat Completions) e Google Gemini (generateContent).
 * Os modelos disponíveis são listados da conta do usuário em "Testar conexão".
 */
;(function (root) {
  "use strict"

  const PROVEDORES = {
    openai: {
      nome: "OpenAI",
      origem: "https://api.openai.com/*",
      modeloPadrao: "gpt-5-mini",
      chaveUrl: "https://platform.openai.com/api-keys"
    },
    gemini: {
      nome: "Google Gemini",
      origem: "https://generativelanguage.googleapis.com/*",
      modeloPadrao: "gemini-flash-latest",
      chaveUrl: "https://aistudio.google.com/apikey"
    }
  }

  const TIMEOUT_MS = 90000

  // ─── PROMPTS ───────────────────────────────────────────────────────────────
  const SYSTEM = `Você é o assistente do Leilômetro, extensão que ajuda arrematantes de leilões de veículos no Brasil (principalmente leilo.com.br).
Regras:
- Responda em português do Brasil, de forma direta e prática. Use listas curtas e **negrito** para o essencial. Sem tabelas.
- Use SOMENTE os números do contexto JSON. Não invente FIPE, preços de mercado, histórico ou dados ausentes; quando faltar algo importante, diga o que falta.
- Valores em reais no formato R$ 12.345.
- Considere: custo total = lance + comissão + taxas do leilão + custos pós-arremate (conserto, documentação, IPVA). KM/ano alto indica frota ou aplicativo. "Recuperado de financiamento" costuma ter manutenção atrasada. Observações no laudo cautelar (corrosão, remarcação, sinistro, leilão anterior) reduzem liquidez e valor de revenda. Veículo sem chave gera custo extra.
- "precoLimite" é o maior lance em que o usuário ainda lucra a margem desejada; "meuTeto" é o teto que ele definiu (pode ser nulo).
- Você não garante resultado. Em respostas de decisão, termine com um lembrete curto de ler o edital e vistoriar o veículo.`

  const TAREFAS = {
    veredito: {
      json: true,
      prompt: `Avalie se vale a pena disputar este lote. Responda APENAS com um objeto JSON válido, sem texto fora dele, neste formato:
{"veredito":"comprar|cautela|evitar","resumo":"2 a 3 frases","pontosFortes":["..."],"riscos":["..."],"tetoSugerido":12345,"perguntasVistoria":["..."],"confianca":"alta|media|baixa"}
"tetoSugerido" é o lance máximo que você recomendaria, em reais inteiros, ou null se não houver dados para calcular. Até 4 itens por lista.`
    },
    riscos: {
      prompt:
        "Liste os principais riscos deste lote (até 6), do mais grave ao menos grave. Para cada um: por que é um risco aqui e como checar antes de dar lance."
    },
    teto: {
      prompt:
        "Quanto devo dar no máximo neste lote? Mostre o raciocínio com os números (preço limite calculado, margem, custos, taxas) e sugira um teto em reais. Se você discordar do preço limite calculado, explique por quê."
    },
    vistoria: {
      prompt:
        "Monte um checklist objetivo (até 10 itens) do que verificar na visitação/vistoria e no edital deste lote específico, priorizando o que os dados indicam."
    },
    comparar: {
      prompt:
        'Compare o lote atual com os lotes em "outrosLotes". Faça um ranking do melhor para o pior negócio, com uma linha de motivo para cada, e diga em qual você focaria e com qual teto.'
    },
    relatorio: {
      maxTokens: 6000,
      prompt:
        "Escreva um parecer para o relatório deste lote (300 a 450 palavras) com as seções: ### Resumo, ### Números, ### Riscos, ### Recomendação. Use os números do contexto."
    },
    ranking: {
      json: true,
      prompt: `Compare os lotes em "lotes" como oportunidades de compra para revenda. Responda APENAS com um objeto JSON válido neste formato:
{"ranking":[{"id":"<id do lote>","posicao":1,"motivo":"uma frase"}],"resumo":"3 a 5 frases dizendo onde focar e por quê"}
Inclua todos os lotes no ranking, do melhor (posição 1) para o pior.`
    },
    livre: { prompt: null }
  }

  function montarSystem(contexto) {
    return `${SYSTEM}\n\nContexto (JSON):\n${JSON.stringify(contexto, null, 1)}`
  }

  // ─── CHAMADAS HTTP ─────────────────────────────────────────────────────────
  class ErroIA extends Error {
    constructor(msg, codigo) {
      super(msg)
      this.codigo = codigo
    }
  }

  async function http(url, opcoes, provedor) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    // chamadas a APIs da extensão mantêm o service worker acordado durante a espera
    const keepAlive = setInterval(() => chrome.runtime?.getPlatformInfo?.(() => {}), 20000)
    let res
    try {
      res = await fetch(url, { ...opcoes, signal: ctrl.signal })
    } catch (e) {
      if (e.name === "AbortError") throw new ErroIA("O provedor demorou demais para responder. Tente de novo.", "timeout")
      throw new ErroIA(`Sem conexão com ${PROVEDORES[provedor].nome}.`, "rede")
    } finally {
      clearTimeout(timer)
      clearInterval(keepAlive)
    }
    let corpo = null
    try {
      corpo = await res.json()
    } catch {}
    if (!res.ok) {
      const detalhe = corpo?.error?.message || corpo?.[0]?.error?.message || ""
      if (res.status === 401 || res.status === 403)
        throw new ErroIA(`Chave inválida ou sem permissão (${PROVEDORES[provedor].nome}). ${detalhe}`.trim(), "chave")
      if (res.status === 429)
        throw new ErroIA(`Limite de uso ou saldo esgotado na sua conta ${PROVEDORES[provedor].nome}. ${detalhe}`.trim(), "limite")
      if (res.status === 404)
        throw new ErroIA(`Modelo não encontrado. Escolha outro em Configurações › IA. ${detalhe}`.trim(), "modelo")
      throw new ErroIA(`Erro ${res.status} do provedor. ${detalhe}`.trim(), "http")
    }
    return corpo
  }

  async function chamarOpenAI({ chave, modelo, system, mensagens, json, maxTokens }) {
    const body = {
      model: modelo,
      messages: [{ role: "system", content: system }, ...mensagens],
      max_completion_tokens: maxTokens
    }
    if (json) body.response_format = { type: "json_object" }
    const r = await http(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
        body: JSON.stringify(body)
      },
      "openai"
    )
    const escolha = r?.choices?.[0]
    const texto = escolha?.message?.content || ""
    if (!texto && escolha?.finish_reason === "length")
      throw new ErroIA("A resposta foi cortada pelo limite de tokens. Tente um modelo sem raciocínio estendido.", "vazio")
    if (!texto) throw new ErroIA("O provedor devolveu uma resposta vazia.", "vazio")
    return texto
  }

  async function chamarGemini({ chave, modelo, system, mensagens, json, maxTokens }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: mensagens.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      })),
      generationConfig: { maxOutputTokens: maxTokens }
    }
    if (json) body.generationConfig.responseMimeType = "application/json"
    const id = String(modelo).replace(/^models\//, "")
    const r = await http(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify(body)
      },
      "gemini"
    )
    if (r?.promptFeedback?.blockReason) throw new ErroIA(`Pergunta bloqueada pelo provedor (${r.promptFeedback.blockReason}).`, "bloqueio")
    const cand = r?.candidates?.[0]
    const texto = (cand?.content?.parts || [])
      .filter((p) => !p.thought)
      .map((p) => p.text || "")
      .join("")
    if (!texto && cand?.finishReason === "MAX_TOKENS")
      throw new ErroIA("A resposta foi cortada pelo limite de tokens. Tente outro modelo.", "vazio")
    if (!texto) throw new ErroIA("O provedor devolveu uma resposta vazia.", "vazio")
    return texto
  }

  async function chamar(cfg, args) {
    if (cfg.provedor === "gemini") return chamarGemini({ ...cfg, ...args })
    return chamarOpenAI({ ...cfg, ...args })
  }

  function extrairJson(texto) {
    try {
      return JSON.parse(texto)
    } catch {}
    const m = String(texto).match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {}
    }
    return null
  }

  // ─── API PÚBLICA (background) ──────────────────────────────────────────────
  async function configAtual() {
    const ai = await root.LM.storage.getAi()
    const prov = PROVEDORES[ai.provedor] ? ai.provedor : "openai"
    const temPermissao = await chrome.permissions.contains({ origins: [PROVEDORES[prov].origem] })
    return {
      provedor: prov,
      chave: ai.chave || "",
      modelo: ai.modelo || PROVEDORES[prov].modeloPadrao,
      incluirNotas: ai.incluirNotas !== false,
      temPermissao
    }
  }

  async function status() {
    const c = await configAtual()
    return {
      configurado: !!c.chave && c.temPermissao,
      semPermissao: !!c.chave && !c.temPermissao,
      provedor: c.provedor,
      provedorNome: PROVEDORES[c.provedor].nome,
      modelo: c.modelo,
      incluirNotas: c.incluirNotas
    }
  }

  async function perguntar({ tarefa = "livre", contexto = {}, pergunta = "", historico = [] }) {
    const cfg = await configAtual()
    if (!cfg.chave) throw new ErroIA("Configure sua chave de IA em Configurações › IA.", "sem-chave")
    if (!cfg.temPermissao) throw new ErroIA("Permissão de acesso ao provedor não concedida. Salve a chave de novo em Configurações › IA.", "permissao")

    const t = TAREFAS[tarefa] || TAREFAS.livre
    const mensagens = historico
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .slice(-10)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000) }))
    mensagens.push({ role: "user", content: t.prompt || String(pergunta).slice(0, 4000) })

    const texto = await chamar(cfg, {
      system: montarSystem(contexto),
      mensagens,
      json: !!t.json,
      maxTokens: t.maxTokens || 4000
    })
    const json = t.json ? extrairJson(texto) : null
    return { texto, json, modelo: cfg.modelo, provedor: cfg.provedor, em: Date.now() }
  }

  async function listarModelos(provedor, chave) {
    if (provedor === "gemini") {
      const r = await http(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
        { headers: { "x-goog-api-key": chave } },
        "gemini"
      )
      return (r?.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((id) => /gemini/i.test(id) && !/embed|image|tts|audio|live|robotics/i.test(id))
        .sort()
    }
    const r = await http("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${chave}` } }, "openai")
    return (r?.data || [])
      .map((m) => m.id)
      .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id))
      .filter((id) => !/audio|realtime|tts|transcribe|image|search|embedding|moderation|instruct|codex|computer/i.test(id))
      .sort()
  }

  // Valida chave (listando modelos) e modelo (chamada mínima)
  async function testar({ provedor, chave, modelo }) {
    const modelos = await listarModelos(provedor, chave)
    const escolhido = modelo || PROVEDORES[provedor].modeloPadrao
    const texto = await chamar(
      { provedor, chave, modelo: escolhido },
      { system: "Responda apenas com a palavra: ok", mensagens: [{ role: "user", content: "teste" }], json: false, maxTokens: 2000 }
    )
    return { ok: true, modelos, modelo: escolhido, amostra: texto.slice(0, 40) }
  }

  ;(root.LM = root.LM || {}).ai = { PROVEDORES, TAREFAS, status, perguntar, listarModelos, testar, ErroIA }
})(globalThis)
