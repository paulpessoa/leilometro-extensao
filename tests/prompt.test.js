const test = require("node:test")
const assert = require("node:assert")
const prompt = require("../lib/prompt.js")

test("a pergunta externa leva o pedido e os dados do lote, sem nulos", () => {
  const t = prompt.promptExterno("veredito", { veiculo: { modelo: "Onix", km: null }, lista: [] })
  assert.match(t, /teto sugerido/)
  assert.match(t, /"modelo":"Onix"/)
  assert.doesNotMatch(t, /"km"|"lista"/)
})

test("pergunta livre usa o texto do usuário", () => {
  assert.match(prompt.promptExterno("livre", {}, "vale a pena?"), /Pedido: vale a pena\?/)
})

test("só abre abas para os chats conhecidos", () => {
  assert.ok(prompt.destinoPermitido(prompt.urlDestino("chatgpt", "oi")))
  assert.ok(prompt.destinoPermitido(prompt.urlDestino("gemini", "oi")))
  assert.ok(!prompt.destinoPermitido("https://evil.com/?https://chatgpt.com/"))
  assert.ok(!prompt.destinoPermitido("https://chatgpt.com.evil.com/"))
})

test("pergunta longa demais abre o chat sem pré-preencher", () => {
  assert.strictEqual(prompt.urlDestino("chatgpt", "x".repeat(10000)), "https://chatgpt.com/")
})
