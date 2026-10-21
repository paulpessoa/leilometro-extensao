/**
 * Leilômetro — assistente de IA (roda só no service worker; a chave nunca vai
 * para o content script nem para a página do leiloeiro)
 *
 * Modos (ai.modo):
 *   "externo"    — sem chave: o content script copia a pergunta e abre um chat de IA (lib/prompt.js)
 *   "leilometro" — IA do Leilômetro: chama a leilometro-api, com cota grátis por instalação
 *   "chave"      — chave própria (BYOK): OpenAI (Chat Completions) ou Google Gemini (generateContent)
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

  // IA do Leilômetro (leilometro-api, ver docs/IA_GERENCIADA.md naquele repositório)
  const SERVIDOR = {
    nome: "IA do Leilômetro",
    base: "https://leilometro-api.onrender.com",
    origem: "https://leilometro-api.onrender.com/*"
  }

  // O plano gratuito do Render "dorme" e a primeira chamada pode levar ~1 min
  const TIMEOUT_MS = 90000

  const { SYSTEM, TAREFAS } = root.LM.prompt

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

  const nomeDe = (provedor) => (provedor === "leilometro" ? SERVIDOR.nome : PROVEDORES[provedor]?.nome || provedor)

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
      throw new ErroIA(`Sem conexão com ${nomeDe(provedor)}.`, "rede")
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
      if (provedor === "leilometro") {
        const msg = corpo?.detail?.mensagem || corpo?.mensagem || ""
        if (res.status === 429)
          throw new ErroIA(msg || "Você usou as análises grátis de hoje. Use “Perguntar ao ChatGPT” ou volte amanhã.", "cota")
        throw new ErroIA(msg || `A IA do Leilômetro está indisponível agora (erro ${res.status}). Tente o modo sem chave.`, "servidor")
      }
      if (res.status === 401 || res.status === 403)
        throw new ErroIA(`Chave inválida ou sem permissão (${nomeDe(provedor)}). ${detalhe}`.trim(), "chave")
      if (res.status === 429)
        throw new ErroIA(`Limite de uso ou saldo esgotado na sua conta ${nomeDe(provedor)}. ${detalhe}`.trim(), "limite")
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

  // A API monta os prompts do lado dela (só aceita as tarefas conhecidas)
  async function chamarServidor({ tarefa, contexto, pergunta, historico }) {
    const r = await http(
      `${SERVIDOR.base}/ia/analisar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instalacao: await root.LM.storage.getInstalacaoId(),
          versao: chrome.runtime.getManifest().version,
          tarefa,
          contexto,
          pergunta: String(pergunta || "").slice(0, 1000),
          historico: historico.slice(-6)
        })
      },
      "leilometro"
    )
    if (!r?.texto) throw new ErroIA("A IA do Leilômetro devolveu uma resposta vazia.", "vazio")
    return r
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
    const modo = ai.modo || (ai.chave ? "chave" : "externo")
    const origem = modo === "leilometro" ? SERVIDOR.origem : PROVEDORES[prov].origem
    const temPermissao = await chrome.permissions.contains({ origins: [origem] })
    return {
      modo,
      destino: root.LM.prompt.DESTINOS[ai.destino] ? ai.destino : "chatgpt",
      provedor: prov,
      chave: ai.chave || "",
      modelo: ai.modelo || PROVEDORES[prov].modeloPadrao,
      incluirNotas: ai.incluirNotas !== false,
      temPermissao
    }
  }

  // configurado = responde dentro do painel; externo = abre um chat de IA no navegador
  async function status() {
    const c = await configAtual()
    const destino = root.LM.prompt.DESTINOS[c.destino]
    if (c.modo === "leilometro") {
      return {
        modo: c.modo,
        configurado: c.temPermissao,
        semPermissao: !c.temPermissao,
        externo: false,
        destino: c.destino,
        destinoNome: destino.nome,
        provedor: "leilometro",
        provedorNome: SERVIDOR.nome,
        modelo: "cota grátis",
        incluirNotas: c.incluirNotas
      }
    }
    const configurado = c.modo === "chave" && !!c.chave && c.temPermissao
    return {
      modo: c.modo,
      configurado,
      semPermissao: c.modo === "chave" && !!c.chave && !c.temPermissao,
      externo: !configurado,
      destino: c.destino,
      destinoNome: destino.nome,
      provedor: c.provedor,
      provedorNome: PROVEDORES[c.provedor].nome,
      modelo: c.modelo,
      incluirNotas: c.incluirNotas
    }
  }

  async function perguntar({ tarefa = "livre", contexto = {}, pergunta = "", historico = [] }) {
    const cfg = await configAtual()
    const historicoLimpo = historico
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .slice(-10)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000) }))

    if (cfg.modo === "leilometro") {
      if (!cfg.temPermissao) throw new ErroIA("Falta autorizar a IA do Leilômetro em Configurações › IA.", "permissao")
      const r = await chamarServidor({ tarefa, contexto, pergunta, historico: historicoLimpo })
      const json = TAREFAS[tarefa]?.json ? r.json || extrairJson(r.texto) : null
      return { texto: r.texto, json, modelo: r.modelo || SERVIDOR.nome, provedor: "leilometro", restantes: r.restantes, em: Date.now() }
    }

    if (cfg.modo !== "chave" || !cfg.chave) throw new ErroIA("Configure sua chave de IA em Configurações › IA.", "sem-chave")
    if (!cfg.temPermissao) throw new ErroIA("Permissão de acesso ao provedor não concedida. Salve a chave de novo em Configurações › IA.", "permissao")

    const t = TAREFAS[tarefa] || TAREFAS.livre
    const mensagens = historicoLimpo
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

  ;(root.LM = root.LM || {}).ai = { PROVEDORES, SERVIDOR, TAREFAS, status, perguntar, listarModelos, testar, ErroIA }
})(globalThis)
