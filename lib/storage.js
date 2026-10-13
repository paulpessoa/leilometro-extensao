/**
 * Leilômetro — armazenamento (chrome.storage)
 *
 *   sync  → configuração global (CONFIG_DEFAULTS em lib/calc.js)
 *   local → "lot:<id>"  um registro por lote (esquema abaixo)
 *           "lm_ui"     estado do painel (posição, modo compacto, seções)
 *           "lm_ai"     provedor/chave/modelo da IA (nunca em sync)
 *
 * Lot = { id, url, site, createdAt, updatedAt, favorito, comparar,
 *         snapshot: {...dados do site/API}, user: {...edições},
 *         live: { alertas: [], historico: [{ t, v }] }, ai: { cache: {} } }
 */
;(function (root) {
  "use strict"

  const LOT_PREFIX = "lot:"
  const UI_KEY = "lm_ui"
  const AI_KEY = "lm_ai"
  const MAX_LOTES = 300
  const MAX_HISTORICO = 300

  const local = () => chrome.storage.local
  const defaults = () => root.LM?.calc?.CONFIG_DEFAULTS || {}

  // Gravações em sequência para não perder atualizações concorrentes no mesmo contexto
  let fila = Promise.resolve()
  const emFila = (fn) => {
    const p = fila.then(fn, fn)
    fila = p.catch(() => {})
    return p
  }

  // ─── CONFIGURAÇÃO ──────────────────────────────────────────────────────────
  async function getConfig() {
    const salvo = await chrome.storage.sync.get(null)
    return { ...defaults(), ...salvo }
  }

  async function setConfig(patch) {
    await chrome.storage.sync.set(patch)
  }

  // ─── LOTES ─────────────────────────────────────────────────────────────────
  async function getLot(id) {
    if (!id) return null
    const k = LOT_PREFIX + id
    const r = await local().get(k)
    return r[k] || null
  }

  function saveLot(id, patch = {}) {
    return emFila(async () => {
      const k = LOT_PREFIX + id
      const atual = (await local().get(k))[k]
      const agora = Date.now()
      const lot = atual || {
        id,
        url: null,
        site: "leilo.com.br",
        createdAt: agora,
        favorito: false,
        comparar: false,
        snapshot: {},
        user: {},
        live: { alertas: [], historico: [] },
        ai: { cache: {} }
      }
      for (const [chave, valor] of Object.entries(patch)) {
        if (valor && typeof valor === "object" && !Array.isArray(valor) && lot[chave] && typeof lot[chave] === "object") {
          lot[chave] = { ...lot[chave], ...valor }
        } else {
          lot[chave] = valor
        }
      }
      if (lot.live?.historico?.length > MAX_HISTORICO) {
        lot.live.historico = lot.live.historico.slice(-MAX_HISTORICO)
      }
      lot.updatedAt = agora
      await local().set({ [k]: lot })
      if (!atual) await aplicarLimite()
      return lot
    })
  }

  function deleteLot(id) {
    return emFila(() => local().remove(LOT_PREFIX + id))
  }

  async function listLots() {
    const tudo = await local().get(null)
    return Object.entries(tudo)
      .filter(([k]) => k.startsWith(LOT_PREFIX))
      .map(([, v]) => v)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }

  async function aplicarLimite() {
    const lotes = await listLots()
    if (lotes.length <= MAX_LOTES) return
    const removiveis = lotes.filter((l) => !l.favorito && !l.comparar).reverse()
    const excesso = lotes.length - MAX_LOTES
    const chaves = removiveis.slice(0, excesso).map((l) => LOT_PREFIX + l.id)
    if (chaves.length) await local().remove(chaves)
  }

  function onLotsChanged(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return
      const ids = Object.keys(changes)
        .filter((k) => k.startsWith(LOT_PREFIX))
        .map((k) => k.slice(LOT_PREFIX.length))
      if (ids.length) cb(ids, changes)
    })
  }

  function onConfigChanged(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync") cb(changes)
    })
  }

  // ─── ESTADO DO PAINEL ──────────────────────────────────────────────────────
  async function getUi() {
    const r = await local().get(UI_KEY)
    return { posicao: null, minimizado: false, compacto: false, secoesRecolhidas: {}, ...(r[UI_KEY] || {}) }
  }

  function setUi(patch) {
    return emFila(async () => {
      const atual = await getUi()
      await local().set({ [UI_KEY]: { ...atual, ...patch } })
    })
  }

  // ─── IA (só páginas da extensão e background leem a chave) ─────────────────
  async function getAi() {
    const r = await local().get(AI_KEY)
    return { provedor: "openai", chave: "", modelo: "", incluirNotas: true, ...(r[AI_KEY] || {}) }
  }

  async function setAi(patch) {
    const atual = await getAi()
    await local().set({ [AI_KEY]: { ...atual, ...patch } })
  }

  // ─── BACKUP ────────────────────────────────────────────────────────────────
  async function exportar() {
    return {
      app: "leilometro",
      versao: root.LM?.util?.versao?.() || "",
      exportadoEm: new Date().toISOString(),
      config: await chrome.storage.sync.get(null),
      ui: await getUi(),
      lotes: await listLots()
    }
  }

  async function importar(dados) {
    if (!dados || dados.app !== "leilometro" || !Array.isArray(dados.lotes)) {
      throw new Error("Arquivo não é um backup do Leilômetro")
    }
    const set = {}
    for (const lot of dados.lotes) if (lot?.id) set[LOT_PREFIX + lot.id] = lot
    await local().set(set)
    if (dados.config) await chrome.storage.sync.set(dados.config)
    return dados.lotes.length
  }

  async function apagarTudo() {
    const tudo = await local().get(null)
    const chaves = Object.keys(tudo).filter((k) => k.startsWith(LOT_PREFIX) || k === UI_KEY)
    await local().remove(chaves)
  }

  // ─── MIGRAÇÃO DA v1.0 ──────────────────────────────────────────────────────
  // v1.0 guardava os lotes no localStorage do próprio site (só o content script
  // enxerga) e um índice "lm_lots_index" no chrome.storage.local.
  async function migrarLocalStorageDoSite() {
    let chaves = []
    try {
      chaves = Object.keys(localStorage).filter((k) => k.startsWith("lm_lote_v3_"))
    } catch {
      return 0
    }
    let n = 0
    for (const k of chaves) {
      try {
        const d = JSON.parse(localStorage.getItem(k))
        const id = k.slice("lm_lote_v3_".length)
        if (d && id) {
          const existente = await getLot(id)
          if (!existente) {
            await saveLot(id, {
              url: d.url || null,
              createdAt: d.savedAt || Date.now(),
              snapshot: { modelo: d.modelo || "" },
              user: {
                fipe: d.fipe ?? null,
                marg: d.marg ?? null,
                incremento: d.incremento ?? null,
                notas: d.notas || "",
                ano: d.ano ? parseInt(d.ano) || null : null,
                km: d.km ? parseInt(d.km) || null : null,
                custoConserto: d.custoConserto ?? null,
                custoDocumentacao: d.custoDocumentacao ?? null,
                custoIPVA: d.custoIPVA ?? null
              }
            })
            n++
          }
        }
        localStorage.removeItem(k)
      } catch {}
    }
    try {
      const sec = localStorage.getItem("lm_collapsed_sections")
      if (sec) {
        await setUi({ secoesRecolhidas: JSON.parse(sec) || {} })
        localStorage.removeItem("lm_collapsed_sections")
      }
    } catch {}
    return n
  }

  async function migrarIndiceLegado() {
    const r = await local().get("lm_lots_index")
    const indice = r.lm_lots_index
    if (!Array.isArray(indice)) return 0
    let n = 0
    for (const item of indice) {
      if (!item?.id || (await getLot(item.id))) continue
      await saveLot(item.id, {
        url: item.url || null,
        createdAt: item.savedAt || Date.now(),
        snapshot: { modelo: item.modelo || "" }
      })
      n++
    }
    await local().remove("lm_lots_index")
    return n
  }

  const api = {
    MAX_HISTORICO,
    getConfig,
    setConfig,
    getLot,
    saveLot,
    deleteLot,
    listLots,
    onLotsChanged,
    onConfigChanged,
    getUi,
    setUi,
    getAi,
    setAi,
    exportar,
    importar,
    apagarTudo,
    migrarLocalStorageDoSite,
    migrarIndiceLegado
  }

  ;(root.LM = root.LM || {}).storage = api
})(globalThis)
