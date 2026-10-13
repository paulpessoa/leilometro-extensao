/**
 * Leilômetro — service worker
 * Abre páginas da extensão, badge do ícone, notificações do Modo Leilão e
 * chamadas de IA (a chave do usuário só é lida aqui).
 */
importScripts("lib/util.js", "lib/calc.js", "lib/storage.js", "lib/ai.js")

const LM = globalThis.LM

// ─── INSTALAÇÃO ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (det) => {
  try {
    await LM.storage.migrarIndiceLegado()
  } catch {}
  if (det.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") })
  }
})

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
      notificar(tabId, msg.title, msg.message)
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
// O id carrega a aba de origem para o clique voltar ao lote mesmo se o
// service worker tiver sido reiniciado entre o alerta e o clique.
function notificar(tabId, title, message) {
  const id = `lm|${tabId ?? ""}|${Date.now()}`
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: String(title || "Leilômetro").slice(0, 120),
    message: String(message || "").slice(0, 300),
    priority: 2
  })
}

chrome.notifications.onClicked.addListener(async (id) => {
  const [, tab] = id.split("|")
  const tabId = parseInt(tab)
  chrome.notifications.clear(id)
  if (!tabId) return
  try {
    const t = await chrome.tabs.update(tabId, { active: true })
    if (t?.windowId != null) await chrome.windows.update(t.windowId, { focused: true })
  } catch {}
})

// ─── SITE leilometro.com.br (verifica se a extensão está instalada) ──────────
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message === "leilometro_ping") {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version })
    return true
  }
})
