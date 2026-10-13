const test = require("node:test")
const assert = require("node:assert")
const calc = require("../lib/calc.js")
const api = require("../lib/api.js")
const amostra = require("../docs/amostra-api-lote.json")

const CONFIG = { ...calc.CONFIG_DEFAULTS }

test("no preço limite o lucro é exatamente a margem desejada", () => {
  const snapshot = { lance: 30000, fipeScraped: 60000, comissaoPage: 0.05, taxasLeilao: 2350 }
  const params = calc.resolverParametros(snapshot, {}, CONFIG)
  const r = calc.calcularOportunidade(snapshot, params)
  const noLimite = calc.calcularOportunidade({ ...snapshot, lance: r.precoLimite }, params)
  assert.ok(Math.abs(noLimite.potencialLucro - 60000 * CONFIG.margemRevenda) < 1)
})

test("o preço limite considera a comissão", () => {
  const snapshot = { lance: 30000, fipeScraped: 60000, comissaoPage: 0.05, taxasLeilao: 350 }
  const params = calc.resolverParametros(snapshot, {}, CONFIG)
  const r = calc.calcularOportunidade(snapshot, params)
  const semComissao = 60000 * (1 - 0.15) - 350 - 2500 - 800 - 1200
  assert.ok(r.precoLimite < semComissao)
  assert.ok(Math.abs(r.precoLimite - semComissao / 1.05) < 0.01)
})

test("taxas detectadas substituem a taxa de pátio padrão", () => {
  const comTaxas = calc.resolverParametros({ taxasLeilao: 2350 }, {}, CONFIG)
  assert.strictEqual(comTaxas.taxasLeilao, 2350)
  assert.strictEqual(comTaxas.taxasAuto, true)
  const semTaxas = calc.resolverParametros({}, {}, CONFIG)
  assert.strictEqual(semTaxas.taxasLeilao, CONFIG.taxaPatio)
  assert.strictEqual(semTaxas.taxasAuto, false)
})

test("sem FIPE não há limite, score nem lucro (não inventa FIPE)", () => {
  const snapshot = { lance: 30000 }
  const params = calc.resolverParametros(snapshot, {}, CONFIG)
  const r = calc.calcularOportunidade(snapshot, params)
  assert.strictEqual(params.fipe, null)
  assert.strictEqual(r.precoLimite, null)
  assert.strictEqual(r.score, null)
  assert.strictEqual(r.potencialLucro, null)
  assert.ok(r.custoArremate > 30000)
})

test("FIPE editada pelo usuário tem prioridade sobre a detectada", () => {
  const params = calc.resolverParametros({ fipeScraped: 50000 }, { fipe: 55000 }, CONFIG)
  assert.strictEqual(params.fipe, 55000)
  assert.strictEqual(params.fipeOrigem, "editado")
})

test("lance acima do limite deixa zero lances restantes", () => {
  const snapshot = { lance: 80000, fipeScraped: 60000, comissaoPage: 0.05 }
  const params = calc.resolverParametros(snapshot, {}, CONFIG)
  const r = calc.calcularOportunidade(snapshot, params)
  assert.strictEqual(r.lancesRestantes, 0)
  assert.ok(r.folga < 0)
})

test("meu teto substitui o preço limite na contagem de lances", () => {
  const snapshot = { lance: 30000, fipeScraped: 60000, incremento: 500 }
  const params = calc.resolverParametros(snapshot, { tetoLance: 32000 }, CONFIG)
  const r = calc.calcularOportunidade(snapshot, params)
  assert.strictEqual(r.teto, 32000)
  assert.strictEqual(r.lancesRestantes, 4)
})

test("preço limite negativo resulta em score 0", () => {
  assert.strictEqual(calc.calcularScore(10000, -500, null), 0)
})

test("classificação de KM/ano nas fronteiras", () => {
  assert.strictEqual(calc.classifyKmAno(9999).curto, "Particular")
  assert.strictEqual(calc.classifyKmAno(10000).curto, "Normal")
  assert.strictEqual(calc.classifyKmAno(35000).curto, "Extremo/App")
  assert.strictEqual(calc.classifyKmAno(null).curto, "—")
})

test("API: taxas do leilão não incluem a comissão (totalDespesas já inclui)", () => {
  const s = api.snapshotDaApi(amostra)
  assert.strictEqual(s.lance, 38300)
  assert.strictEqual(s.comissaoPage, 0.05)
  assert.strictEqual(s.taxasLeilao, 2350)
  const { calc: r } = calc.analisar(s, {}, CONFIG)
  // custo no leilão deve bater com o "total a pagar" informado pelo site
  assert.strictEqual(Math.round(r.custoArremate), amostra.valor.totalAPagar)
})

test("API: lote sem vídeo vira sinal de atenção alto (pode não ligar/andar)", () => {
  const comVideo = api.snapshotDaApi(amostra)
  assert.strictEqual(comVideo.temVideo, true)
  assert.ok(!calc.sinaisDeAtencao(comVideo).some((x) => x.id === "sem-video"))

  const semVideo = api.snapshotDaApi({ ...amostra, video: null })
  assert.strictEqual(semVideo.temVideo, false)
  const sinal = calc.sinaisDeAtencao(semVideo).find((x) => x.id === "sem-video")
  assert.ok(sinal)
  assert.strictEqual(sinal.nivel, "alto")

  const vazio = api.snapshotDaApi({ ...amostra, video: "  " })
  assert.strictEqual(vazio.temVideo, false)
})

test("sinais: sem chave, laudo reprovado e laudo com observações", () => {
  const ids = (s) => calc.sinaisDeAtencao(s).map((x) => x.id)
  assert.deepStrictEqual(ids({ possuiChave: false }), ["sem-chave"])
  assert.deepStrictEqual(ids({ laudo: "REPROVADO", laudoObs: "x" }), ["laudo-reprovado"])
  assert.deepStrictEqual(ids({ laudo: "APROVADO", laudoObs: "CORROSÃO" }), ["laudo-obs"])
  assert.deepStrictEqual(ids({ laudo: "AUSENTE" }), ["sem-laudo"])
  // dado ausente (ex.: lido só da página) não gera alerta
  assert.deepStrictEqual(ids({}), [])
})

test("API: combustível abreviado em 3 letras", () => {
  const n = api.normalizarCombustivel
  assert.strictEqual(n("Fle"), "Flex")
  assert.strictEqual(n("Die"), "Diesel")
  assert.strictEqual(n("Gas"), "Gasolina")
  assert.strictEqual(n("GNV"), "GNV")
  assert.strictEqual(n("Ele"), "Elétrico")
  assert.strictEqual(n("Alc"), "Etanol")
  assert.strictEqual(n(null), null)
})

test("contexto da IA inclui o vídeo e os sinais", () => {
  const s = api.snapshotDaApi({ ...amostra, video: null })
  const ctx = calc.contextoIa(s, {}, CONFIG)
  assert.strictEqual(ctx.veiculo.temVideo, false)
  assert.ok(ctx.sinaisDeAtencao.some((x) => x.startsWith("Lote sem vídeo")))
})

test("API: campos do veículo e do lote", () => {
  const s = api.snapshotDaApi(amostra)
  assert.strictEqual(s.ano, 2021)
  assert.strictEqual(s.km, 113602)
  assert.strictEqual(s.combustivel, "Flex")
  assert.strictEqual(s.fipeScraped, 69099)
  assert.strictEqual(s.fipeCodigo, "011201-1")
  assert.strictEqual(s.qtdLances, 2)
  assert.ok(s.dataFim > 0)
})
