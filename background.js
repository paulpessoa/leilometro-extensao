/**
 * Leilômetro — service worker
 * Abre páginas da extensão, badge do ícone, notificações do Modo Leilão,
 * lembretes dos lotes marcados (★) e chamadas de IA (a chave do usuário só é lida aqui).
 */
importScripts("lib/util.js", "lib/calc.js", "lib/api.js", "lib/storage.js", "lib/prompt.js", "lib/ai.js")

const LM = globalThis.LM

// ─── INSTALAÇÃO ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (det) => {
  try {
    await LM.storage.migrarIndiceLegado()
  } catch {}
  if (det.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") })
  }
  reagendarLembretes()
})

chrome.runtime.onStartup.addListener(() => reagendarLembretes())

// ─── MENSAGENS DO CONTENT SCRIPT E DAS PÁGINAS ───────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id

  switch (msg?.type) {
    case "open":
      chrome.tabs.create({ url: chrome.runtime.getURL(msg.path) })
      return false

    case "openOptions":
      if (msg.hash) chrome.tabs.create({ url: chrome.runtime.getURL(`options/options.html#${msg.hash}`) })
      else chrome.runtime.openOptionsPage()
      return false

    case "badge":
      if (tabId != null) {
        chrome.action.setBadgeText({ tabId, text: String(msg.text || "").slice(0, 4) })
        if (msg.color) chrome.action.setBadgeBackgroundColor({ tabId, color: msg.color })
      }
      return false

    case "notify":
      notificar(`lm|${tabId ?? ""}|${Date.now()}`, msg.title, msg.message)
      return false

    // Modo sem chave: abre o chat de IA escolhido (só os endereços de LM.prompt.DESTINOS)
    case "openUrl":
      if (LM.prompt.destinoPermitido(msg.url)) chrome.tabs.create({ url: msg.url })
      return false

    case "ai.status":
      LM.ai.status().then(sendResponse, (e) => sendResponse({ configurado: false, erro: e.message }))
      return true

    case "ai.ask":
      LM.ai
        .perguntar(msg)
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, erro: e.message, codigo: e.codigo }))
      return true
  }
  return false
})

// ─── NOTIFICAÇÕES ────────────────────────────────────────────────────────────
// O id carrega o destino do clique (aba do alerta ou lote do lembrete), para
// funcionar mesmo se o service worker tiver sido reiniciado nesse meio-tempo.
function notificar(id, title, message) {
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: String(title || "Leilômetro").slice(0, 120),
    message: String(message || "").slice(0, 300),
    priority: 2
  })
}

async function focarAba(tabId) {
  const t = await chrome.tabs.update(tabId, { active: true })
  if (t?.windowId != null) await chrome.windows.update(t.windowId, { focused: true })
}

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id)
  const [tipo, alvo] = id.split("|")
  try {
    if (tipo === "lm" && parseInt(alvo)) {
      await focarAba(parseInt(alvo))
    } else if (tipo === "lmlote" && alvo) {
      // aba do lote já aberta? senão abre
      const abas = await chrome.tabs.query({ url: `*://*.leilo.com.br/lote/${alvo}*` })
      if (abas[0]?.id != null) await focarAba(abas[0].id)
      else {
        const lot = await LM.storage.getLot(alvo)
        chrome.tabs.create({ url: lot?.url || `https://leilo.com.br/lote/${alvo}/` })
      }
    }
  } catch {}
})

// ─── LEMBRETES DOS LOTES MARCADOS (★) ────────────────────────────────────────
const PREFIXO_LEMBRETE = "lembrete|"

async function reagendarLembretes() {
  const cfg = await LM.storage.getConfig()
  const minutos = Number(cfg.lembreteMinutos) || 0
  const existentes = await chrome.alarms.getAll()
  const desejados = new Map()

  if (minutos > 0) {
    const agora = Date.now()
    for (const lot of await LM.storage.listLots()) {
      const fim = lot.snapshot?.dataFim
      if (!lot.favorito || !fim) continue
      const quando = fim - minutos * 60000
      if (quando > agora + 5000) desejados.set(PREFIXO_LEMBRETE + lot.id, quando)
    }
  }

  for (const a of existentes) {
    if (!a.name.startsWith(PREFIXO_LEMBRETE)) continue
    const quando = desejados.get(a.name)
    if (quando == null || Math.abs(quando - a.scheduledTime) > 1000) await chrome.alarms.clear(a.name)
    else desejados.delete(a.name)
  }
  for (const [nome, quando] of desejados) chrome.alarms.create(nome, { when: quando })
}

chrome.alarms.onAlarm.addListener(async (alarme) => {
  if (!alarme.name.startsWith(PREFIXO_LEMBRETE)) return
  const id = alarme.name.slice(PREFIXO_LEMBRETE.length)
  const lot = await LM.storage.getLot(id)
  if (!lot?.favorito) return
  const cfg = await LM.storage.getConfig()
  const minutos = Number(cfg.lembreteMinutos) || 0

  // Confere o horário atualizado: o encerramento pode ter sido prorrogado
  let snap = lot.snapshot || {}
  try {
    const novo = await LM.api.buscarLote(id, { forcar: true })
    if (novo) {
      snap = novo
      await LM.storage.saveLot(id, { snapshot: novo })
    }
  } catch {}
  const falta = (snap.dataFim || 0) - Date.now()
  if (minutos && falta > (minutos + 1) * 60000) return // foi adiado: o reagendamento cuida

  const { calc } = LM.calc.analisar(snap, lot.user || {}, cfg)
  const quando = falta > 0 ? `encerra em ${Math.max(1, Math.round(falta / 60000))} min` : "está encerrando"
  notificar(
    `lmlote|${id}|${Date.now()}`,
    `⏰ Lote ${quando}`,
    [
      snap.modelo || "Veículo",
      calc.lance ? `Lance atual ${LM.util.BRL0(calc.lance)}` : null,
      calc.teto ? `Seu teto ${LM.util.BRL0(calc.teto)}` : null,
      "Clique para abrir e ativar o rastreio."
    ]
      .filter(Boolean)
      .join(" · ")
  )
})

// Lotes ou configuração mudaram (★ marcado, horário atualizado, minutos alterados)
let reagendamento
chrome.storage.onChanged.addListener((changes, area) => {
  const relevante =
    (area === "sync" && "lembreteMinutos" in changes) ||
    (area === "local" && Object.keys(changes).some((k) => k.startsWith("lot:")))
  if (!relevante) return
  clearTimeout(reagendamento)
  reagendamento = setTimeout(() => reagendarLembretes(), 1500)
})

// ─── SITE leilometro.com.br (verifica se a extensão está instalada) ──────────
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message === "leilometro_ping") {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version })
    return true
  }
})
