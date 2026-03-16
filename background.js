chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message === "leilometro_ping") {
    const manifest = chrome.runtime.getManifest()
    sendResponse({
      installed: true,
      version: manifest.version,
    })
    return true
  }
})

