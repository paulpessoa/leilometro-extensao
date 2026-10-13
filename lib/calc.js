/**
 * Leilômetro — regras de cálculo (sem DOM). Usado pelo painel, popup,
 * comparador, relatório e pelos testes em Node.
 */
;(function (root) {
  "use strict"

  const CONFIG_DEFAULTS = {
    margemRevenda: 0.15,
    comissaoLeiloeiro: 0.05,
    taxaPatio: 350,
    custoDocumentacao: 800,
    custoIPVA: 1200,
    custoConserto: 2500,
    incrementoLance: 200,
    fipeMock: 0,
    // Modo Leilão
    somAtivo: true,
    volume: 0.6,
    notificacoes: true,
    intervaloPolling: 3,
    alertaFaltamLances: 3,
    // Lembrete dos lotes marcados (★), em minutos antes do encerramento previsto (0 = desligado)
    lembreteMinutos: 10
  }

  // ─── PARÂMETROS EFETIVOS DE UM LOTE ────────────────────────────────────────
  // Junta o que veio do site (snapshot), o que o usuário editou (user) e a
  // configuração global, registrando a origem de cada valor.
  function resolverParametros(snapshot = {}, user = {}, config = {}) {
    const cfg = { ...CONFIG_DEFAULTS, ...config }
    const pos = (v) => (v != null && !isNaN(v) && v > 0 ? Number(v) : null)

    let fipe = pos(user.fipe)
    let fipeOrigem = "editado"
    if (fipe == null) {
      fipe = pos(snapshot.fipeScraped)
      fipeOrigem = "auto"
    }
    if (fipe == null) {
      fipe = pos(cfg.fipeMock)
      fipeOrigem = "padrao"
    }
    if (fipe == null) fipeOrigem = null

    const margem = user.marg != null && !isNaN(user.marg) ? Number(user.marg) : cfg.margemRevenda
    const incremento = pos(user.incremento) ?? pos(snapshot.incremento) ?? cfg.incrementoLance

    const comissaoAuto = snapshot.comissaoPage != null && !isNaN(snapshot.comissaoPage)
    const comissaoPct = comissaoAuto ? Number(snapshot.comissaoPage) : cfg.comissaoLeiloeiro

    // Taxas do leilão (sem a comissão). Se o site não informar nada, usa a taxa padrão.
    const taxasDetectadas = pos(snapshot.taxasLeilao)
    const taxasAuto = taxasDetectadas != null
    const taxasLeilao = taxasAuto ? taxasDetectadas : cfg.taxaPatio

    const custo = (k) => (user[k] != null && !isNaN(user[k]) ? Number(user[k]) : cfg[k])

    return {
      fipe,
      fipeOrigem,
      margem,
      margemEditada: user.marg != null,
      incremento,
      comissaoPct,
      comissaoAuto,
      taxasLeilao,
      taxasAuto,
      custoConserto: custo("custoConserto"),
      custoDocumentacao: custo("custoDocumentacao"),
      custoIPVA: custo("custoIPVA"),
      tetoLance: pos(user.tetoLance)
    }
  }

  // ─── CÁLCULO PRINCIPAL ─────────────────────────────────────────────────────
  //   custoTotal(L) = L × (1 + comissão) + taxasLeilão + doc + IPVA + conserto
  //   lucro(L)      = FIPE − custoTotal(L)
  //   precoLimite   = maior L em que lucro(L) = FIPE × margem
  function calcularOportunidade(snapshot = {}, params) {
    const lance = snapshot.lance != null && snapshot.lance > 0 ? Number(snapshot.lance) : null
    const { fipe, margem, incremento, comissaoPct, taxasLeilao } = params
    const custosPos = params.custoConserto + params.custoDocumentacao + params.custoIPVA

    const comissao = lance != null ? lance * comissaoPct : null
    const custoArremate = lance != null ? lance + comissao + taxasLeilao : null
    const custoTotal = custoArremate != null ? custoArremate + custosPos : null

    let precoLimite = null
    let potencialLucro = null
    let lucroPct = null
    if (fipe) {
      precoLimite = (fipe * (1 - margem) - taxasLeilao - custosPos) / (1 + comissaoPct)
      if (custoTotal != null) {
        potencialLucro = fipe - custoTotal
        lucroPct = potencialLucro / fipe
      }
    }

    const tetoUsuario = params.tetoLance != null && params.tetoLance > 0
    const teto = tetoUsuario ? params.tetoLance : precoLimite != null && precoLimite > 0 ? precoLimite : null
    const folga = teto != null && lance != null ? teto - lance : null
    const lancesRestantes =
      folga != null && incremento > 0 ? Math.max(0, Math.floor(folga / incremento)) : null

    const kmAno = snapshot.kmAno ?? null
    const score = calcularScore(lance, precoLimite, kmAno)

    return {
      lance,
      fipe,
      margem,
      incremento,
      comissao,
      comissaoPct,
      taxasLeilao,
      custosPos,
      custoArremate,
      custoTotal,
      precoLimite,
      teto,
      tetoUsuario,
      folga,
      lancesRestantes,
      potencialLucro,
      lucroPct,
      score
    }
  }

  function calcularScore(lance, precoLimite, kmAno) {
    if (!lance || precoLimite == null) return null
    if (precoLimite <= 0) return 0
    const ratio = lance / precoLimite
    let score
    if (ratio < 0.7) score = 95
    else if (ratio < 0.85) score = 75
    else if (ratio < 0.95) score = 55
    else if (ratio <= 1.0) score = 35
    else score = 10
    if (kmAno) {
      if (kmAno > 30000) score -= 20
      else if (kmAno > 20000) score -= 10
    }
    return Math.max(0, Math.min(100, score))
  }

  // ─── USO DO VEÍCULO ────────────────────────────────────────────────────────
  function calcularUso(ano, km, anoAtual = new Date().getFullYear()) {
    const idadeVeiculo = ano ? Math.max(1, anoAtual - ano) : null
    const kmAno = km != null && km > 0 && idadeVeiculo ? Math.round(km / idadeVeiculo) : null
    const kmMes = kmAno ? Math.round(kmAno / 12) : null
    return { idadeVeiculo, kmAno, kmMes }
  }

  function classifyKmAno(kmAno) {
    if (!kmAno) return { label: "KM não informada", curto: "—", color: "#8b949e", emoji: "❓" }
    const fmt = kmAno.toLocaleString("pt-BR")
    if (kmAno < 10000)
      return { label: `${fmt} km/ano — Uso Particular`, curto: "Particular", color: "#22c55e", emoji: "🟢" }
    if (kmAno < 15000)
      return { label: `${fmt} km/ano — Uso Normal`, curto: "Normal", color: "#86efac", emoji: "🟢" }
    if (kmAno < 25000)
      return { label: `${fmt} km/ano — Possível Frota`, curto: "Possível frota", color: "#f59e0b", emoji: "🟡" }
    if (kmAno < 35000)
      return { label: `${fmt} km/ano — Uso Intenso`, curto: "Intenso", color: "#f97316", emoji: "🟠" }
    return { label: `${fmt} km/ano — Uso Extremo/App`, curto: "Extremo/App", color: "#ef4444", emoji: "🔴" }
  }

  function getScoreLabel(score) {
    if (score === null || score === undefined) return { label: "SEM DADOS", color: "#8b949e" }
    if (score >= 80) return { label: "EXCELENTE", color: "#22c55e" }
    if (score >= 60) return { label: "BOA", color: "#84cc16" }
    if (score >= 40) return { label: "REGULAR", color: "#f59e0b" }
    if (score >= 20) return { label: "ARRISCADA", color: "#f97316" }
    return { label: "EVITAR", color: "#ef4444" }
  }

  // ─── SINAIS DE ATENÇÃO ─────────────────────────────────────────────────────
  // Indícios no próprio lote que pedem cuidado antes do lance (não alteram o score)
  function sinaisDeAtencao(s = {}) {
    const sinais = []
    if (s.temVideo === false) {
      sinais.push({
        id: "sem-video",
        nivel: "alto",
        icone: "🎥",
        titulo: "Lote sem vídeo",
        detalhe: "Normalmente indica que o veículo não liga ou não anda. Confirme na vistoria antes de dar lance."
      })
    }
    if (s.possuiChave === false) {
      sinais.push({
        id: "sem-chave",
        nivel: "medio",
        icone: "🔑",
        titulo: "Sem chave",
        detalhe: "Conte com o custo de chave/codificação e com mais dificuldade na remoção."
      })
    }
    if (s.laudo && /ausente|sem laudo|n[aã]o (realizado|possui)/i.test(s.laudo)) {
      sinais.push({
        id: "sem-laudo",
        nivel: "medio",
        icone: "📑",
        titulo: "Sem laudo cautelar",
        detalhe: "Estrutura, chassi e motor não foram verificados por vistoria cautelar. Redobre a atenção na visitação."
      })
    } else if (s.laudo && /reprov/i.test(s.laudo)) {
      sinais.push({
        id: "laudo-reprovado",
        nivel: "alto",
        icone: "📑",
        titulo: "Laudo cautelar reprovado",
        detalhe: "Pode dificultar documentação, seguro e revenda."
      })
    } else if (s.laudoObs && String(s.laudoObs).trim()) {
      sinais.push({
        id: "laudo-obs",
        nivel: "medio",
        icone: "📑",
        titulo: "Laudo com observações",
        detalhe: String(s.laudoObs).trim().split(/\r?\n/).join(" · ")
      })
    }
    return sinais
  }

  // Atalho: snapshot + user + config → { params, calc, uso }
  function analisar(snapshot = {}, user = {}, config = {}) {
    const ano = snapshot.ano || (user.ano ? parseInt(user.ano) : null)
    const km = snapshot.km || (user.km ? parseInt(user.km) : null)
    const uso = calcularUso(ano, km)
    const snap = { ...snapshot, ano, km, ...uso }
    const params = resolverParametros(snap, user, config)
    const calc = calcularOportunidade(snap, params)
    return { snapshot: snap, params, calc, uso }
  }

  // Dados do lote enviados ao assistente de IA (sem dados pessoais nem da conta do site)
  function contextoIa(snapshot = {}, user = {}, config = {}, { historico = [], incluirNotas = true } = {}) {
    const { snapshot: s, params: p, calc: c } = analisar(snapshot, user, config)
    const r = (v) => (v != null ? Math.round(v) : null)
    const ctx = {
      veiculo: {
        modelo: s.modelo,
        ano: s.ano,
        anoFabricacao: s.anoFabricacao,
        km: s.km,
        kmAno: s.kmAno,
        kmMes: s.kmMes,
        idadeAnos: s.idadeVeiculo,
        usoEstimado: classifyKmAno(s.kmAno).curto,
        combustivel: s.combustivel,
        cor: s.cor,
        fipeNome: s.fipeNome,
        origem: s.tipoRetomada,
        comitente: s.comitente,
        laudoCautelar: s.laudo,
        laudoObservacao: s.laudoObs,
        possuiChave: s.possuiChave,
        temVideo: s.temVideo,
        local: s.local
      },
      sinaisDeAtencao: sinaisDeAtencao(s).map((x) => `${x.titulo}: ${x.detalhe}`),
      leilao: {
        situacao: s.situacao,
        lanceAtual: c.lance,
        temLance: s.temLance,
        lanceMinimo: s.lanceMinimo,
        quantidadeLances: s.qtdLances,
        incremento: c.incremento,
        encerramentoPrevisto: s.dataFim ? new Date(s.dataFim).toISOString() : null,
        comissaoPct: p.comissaoPct,
        taxasLeilao: p.taxasLeilao,
        taxasInformadasPeloSite: p.taxasAuto
      },
      analise: {
        fipe: p.fipe,
        fipeOrigem: p.fipeOrigem,
        margemDesejada: p.margem,
        custoNoLeilao: r(c.custoArremate),
        custosPosArremate: { conserto: p.custoConserto, documentacao: p.custoDocumentacao, ipva: p.custoIPVA },
        custoTotal: r(c.custoTotal),
        precoLimite: r(c.precoLimite),
        meuTeto: p.tetoLance,
        lucroPotencial: r(c.potencialLucro),
        lucroPctDaFipe: c.lucroPct,
        lancesAteOTeto: c.lancesRestantes,
        score: c.score
      },
      historicoLances: (historico || []).slice(-20).map((h) => ({ em: new Date(h.t).toISOString(), valor: h.v }))
    }
    if (incluirNotas && user?.notas) ctx.anotacoesDoUsuario = String(user.notas).slice(0, 2000)
    return ctx
  }

  // Resumo curto de um lote (comparações)
  function resumoIa(snapshot = {}, user = {}, config = {}) {
    const { snapshot: s, params: p, calc: c } = analisar(snapshot, user, config)
    const r = (v) => (v != null ? Math.round(v) : null)
    return {
      modelo: s.modelo,
      ano: s.ano,
      km: s.km,
      kmAno: s.kmAno,
      usoEstimado: classifyKmAno(s.kmAno).curto,
      origem: s.tipoRetomada,
      laudo: s.laudo,
      laudoObservacao: s.laudoObs,
      possuiChave: s.possuiChave,
      temVideo: s.temVideo,
      sinaisDeAtencao: sinaisDeAtencao(s).map((x) => x.titulo),
      lanceAtual: c.lance,
      fipe: p.fipe,
      custoNoLeilao: r(c.custoArremate),
      custoTotal: r(c.custoTotal),
      precoLimite: r(c.precoLimite),
      meuTeto: p.tetoLance,
      lucroPotencial: r(c.potencialLucro),
      score: c.score,
      encerramentoPrevisto: s.dataFim ? new Date(s.dataFim).toISOString() : null
    }
  }

  const api = {
    CONFIG_DEFAULTS,
    contextoIa,
    resumoIa,
    sinaisDeAtencao,
    resolverParametros,
    calcularOportunidade,
    calcularScore,
    calcularUso,
    classifyKmAno,
    getScoreLabel,
    analisar
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api
  else (root.LM = root.LM || {}).calc = api
})(globalThis)
