/**
 * Leilômetro — prompts do assistente de IA (sem DOM e sem chrome.*)
 * Usado pelo service worker (lib/ai.js), pelo content script (modo "sem chave")
 * e pelos testes em Node.
 *
 * Modo "sem chave": a extensão monta uma pergunta completa com os dados do lote,
 * copia para a área de transferência e abre o ChatGPT, o Gemini ou o Claude.
 * O usuário só cola. Não precisa de chave de API nem de servidor.
 */
;(function (root) {
  "use strict"

  // ─── PROMPTS ───────────────────────────────────────────────────────────────
  const SYSTEM = `Você é o assistente do Leilômetro, extensão que ajuda arrematantes de leilões de veículos no Brasil (leilo.com.br e outras leiloeiras).
Regras:
- Responda em português do Brasil, de forma direta e prática. Use listas curtas e **negrito** para o essencial. Sem tabelas.
- Use SOMENTE os números do contexto JSON. Não invente FIPE, preços de mercado, histórico ou dados ausentes; quando faltar algo importante, diga o que falta.
- Valores em reais no formato R$ 12.345.
- Considere: custo total = lance + comissão + taxas do leilão + custos pós-arremate (conserto, documentação, IPVA). KM/ano alto indica frota ou aplicativo. "Recuperado de financiamento" costuma ter manutenção atrasada. Observações no laudo cautelar (corrosão, remarcação, sinistro, leilão anterior) reduzem liquidez e valor de revenda. Veículo sem chave gera custo extra. Lote sem vídeo (temVideo=false) normalmente indica que o veículo não liga ou não anda: trate como risco alto de mecânica e reduza o teto.
- "precoLimite" é o maior lance em que o usuário ainda lucra a margem desejada; "meuTeto" é o teto que ele definiu (pode ser nulo).
- Você não garante resultado. Em respostas de decisão, termine com um lembrete curto de ler o edital e vistoriar o veículo.`

  const TAREFAS = {
    veredito: {
      json: true,
      externo:
        "Avalie se vale a pena disputar este lote. Responda com: **veredito** (comprar, cautela ou evitar), um resumo de 2 a 3 frases, até 4 pontos fortes, até 4 riscos, o **teto sugerido** em reais (lance máximo que você recomendaria) e até 4 perguntas para a vistoria.",
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
      externo:
        'Compare os lotes em "lotes" como oportunidades de compra para revenda. Faça um ranking do melhor para o pior, com uma frase de motivo para cada, e termine com 3 a 5 frases dizendo onde focar e por quê.',
      prompt: `Compare os lotes em "lotes" como oportunidades de compra para revenda. Responda APENAS com um objeto JSON válido neste formato:
{"ranking":[{"id":"<id do lote>","posicao":1,"motivo":"uma frase"}],"resumo":"3 a 5 frases dizendo onde focar e por quê"}
Inclua todos os lotes no ranking, do melhor (posição 1) para o pior.`
    },
    livre: { prompt: null }
  }  // ─── MODO SEM CHAVE (chat de IA no navegador) ─────────────────────────────
  // "param" pré-preenche a pergunta quando o site aceita; senão o usuário cola (Ctrl+V)
  const DESTINOS = {
    chatgpt: { nome: "ChatGPT", base: "https://chatgpt.com/", param: "q" },
    gemini: { nome: "Gemini", base: "https://gemini.google.com/app", param: null },
    claude: { nome: "Claude", base: "https://claude.ai/new", param: "q" }
  }

  // URLs muito longas são cortadas por alguns navegadores e servidores
  const LIMITE_URL = 6000

  // Remove nulos, vazios e listas vazias para a pergunta ficar curta
  function compactar(v) {
    if (Array.isArray(v)) {
      const a = v.map(compactar).filter((x) => x !== undefined)
      return a.length ? a : undefined
    }
    if (v && typeof v === "object") {
      const o = {}
      for (const [k, x] of Object.entries(v)) {
        const c = compactar(x)
        if (c !== undefined) o[k] = c
      }
      return Object.keys(o).length ? o : undefined
    }
    if (v === null || v === "" || (typeof v === "number" && !isFinite(v))) return undefined
    return v
  }

  function promptExterno(tarefa, contexto = {}, pergunta = "") {
    const t = TAREFAS[tarefa] || TAREFAS.livre
    const pedido = t.externo || t.prompt || String(pergunta || "").slice(0, 2000) || "Analise este lote."
    return `${SYSTEM}

Pedido: ${pedido}

Dados do lote (JSON):
${JSON.stringify(compactar(contexto) || {})}`
  }

  function urlDestino(destino, texto) {
    const d = DESTINOS[destino] || DESTINOS.chatgpt
    if (!d.param || !texto) return d.base
    const q = encodeURIComponent(texto)
    return q.length <= LIMITE_URL ? `${d.base}?${d.param}=${q}` : d.base
  }

  // O service worker só abre abas para estes endereços (mensagem "openUrl")
  function destinoPermitido(url) {
    const u = String(url || "")
    return Object.values(DESTINOS).some((d) => u === d.base || u.startsWith(d.base + "?"))
  }

  const api = { SYSTEM, TAREFAS, DESTINOS, compactar, promptExterno, urlDestino, destinoPermitido }

  if (typeof module !== "undefined" && module.exports) module.exports = api
  else (root.LM = root.LM || {}).prompt = api
})(globalThis)
