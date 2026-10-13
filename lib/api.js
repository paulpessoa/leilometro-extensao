/**
 * Leilômetro — leitura da API pública do leilo.com.br
 * Amostra real da resposta em docs/amostra-api-lote.json
 */
;(function (root) {
  "use strict"

  const API_LOTE = "https://api.leilo.com.br/v1/lote/by-id/"
  const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  const cache = new Map()

  const num = (v) => (v != null && v !== "" && !isNaN(v) ? Number(v) : null)
  const data = (v) => {
    const t = v ? Date.parse(v) : NaN
    return isNaN(t) ? null : t
  }

  function normalizarCombustivel(c) {
    if (!c) return null
    if (/^fle/i.test(c)) return "Flex"
    if (/gasol/i.test(c)) return "Gasolina"
    if (/diesel/i.test(c)) return "Diesel"
    if (/el[eé]tr/i.test(c)) return "Elétrico"
    if (/h[ií]brid/i.test(c)) return "Híbrido"
    if (/[aá]lcool|etanol/i.test(c)) return "Etanol"
    return c
  }

  // Converte a resposta da API no "snapshot" usado pelo resto da extensão
  function snapshotDaApi(l) {
    if (!l || !l.id) return null
    const v = l.valor || {}
    const vei = l.veiculo || {}

    const lance = num(v.lance?.valor) || num(v.valorProposta) || num(v.minimo) || null

    // totalDespesas já inclui a comissão; as taxas do leilão são só os itens abaixo
    const itens = {
      depositoBens: num(v.depositoDeBens),
      taxaRemocao: num(v.remocao),
      taxaVistoria: num(v.vistoria),
      taxaDespachante: num(v.despachante),
      taxaOutros: num(v.outros)
    }
    let taxasLeilao = Object.values(itens).reduce((s, x) => s + (x || 0), 0)
    if (!taxasLeilao && num(v.totalDespesas) && num(v.comissaoValorCalculado) != null) {
      taxasLeilao = Math.max(0, num(v.totalDespesas) - num(v.comissaoValorCalculado))
    }

    const comissaoBase = num(v.comissaoPorcentagem)
    const comissaoExtra = num(v.comissaoExtraPorcentagem) || 0
    const comissaoPage = comissaoBase != null ? (comissaoBase + comissaoExtra) / 100 : null

    let km = null
    const kmCand = vei.km ?? vei.itensDetalhados?.quilometragem ?? null
    if (typeof kmCand === "number" && kmCand > 0) km = kmCand
    else if (typeof kmCand === "string" && !/inacess[ií]vel|sem|n[aã]o/i.test(kmCand)) {
      const n = parseInt(kmCand.replace(/\D/g, ""))
      if (n > 0) km = n
    }

    const anoRaw = vei.anoModelo || vei.anoFabricacao
    const ano = anoRaw ? parseInt(String(anoRaw).match(/\d{4}/)?.[0]) || null : null

    return {
      modelo: String(l.nome || vei.modelo || "Veículo").replace(/\s+/g, " ").trim().slice(0, 80),
      ano,
      anoFabricacao: num(vei.anoFabricacao),
      km,
      combustivel: normalizarCombustivel(vei.combustivel),
      cor: vei.cor || null,
      lance,
      temLance: !!num(v.lance?.valor),
      lanceMinimo: num(v.minimo),
      qtdLances: num(v.lance?.quantidade),
      ultimoLanceEm: data(v.lance?.data),
      ultimoLanceCidade: v.lance?.cidade || null,
      incremento: num(v.incremento),
      fipeScraped: num(vei.valorMercado),
      fipeNome: vei.infocarFipeNome || null,
      fipeCodigo: vei.infocarFipeCodigo || null,
      comissaoPage,
      ...itens,
      taxasLeilao: taxasLeilao || null,
      totalAPagar: num(v.totalAPagar),
      laudo: l.laudoCautelarResultado || null,
      laudoObs: l.laudoCautelarObservacao || null,
      tipoRetomada: vei.retomada || null,
      comitente: l.comitente?.nome || null,
      possuiChave: typeof vei.possuiChave === "boolean" ? vei.possuiChave : null,
      local: [l.localizacao?.cidade, l.localizacao?.estado].filter(Boolean).join("/") || null,
      situacao: l.situacao || null,
      dataInicio: data(l.dataInicio),
      dataFim: data(l.dataFim),
      leilaoNome: l.leilao?.nome || null,
      leilaoData: data(l.leilao?.data),
      foto: Array.isArray(l.fotosUrls) ? l.fotosUrls[0] || null : null,
      numeroLote: num(l.numero),
      fonte: "API",
      lidoEm: Date.now()
    }
  }

  async function buscarLote(id, { forcar = false, maxIdadeMs = 30000 } = {}) {
    if (!id || !UUID_RE.test(id)) return null
    const c = cache.get(id)
    if (!forcar && c && Date.now() - c.t < maxIdadeMs) return { ...c.snapshot }
    const res = await fetch(API_LOTE + id, {
      headers: { Accept: "application/json, text/plain, */*" },
      cache: "no-store"
    })
    if (!res.ok) return null
    const snapshot = snapshotDaApi(await res.json())
    if (snapshot) cache.set(id, { t: Date.now(), snapshot })
    return snapshot ? { ...snapshot } : null
  }

  const api = { snapshotDaApi, buscarLote, normalizarCombustivel, UUID_RE }

  if (typeof module !== "undefined" && module.exports) module.exports = api
  else (root.LM = root.LM || {}).api = api
})(globalThis)
