/**
 * Gera dist/leilometro-<versão>.zip para enviar à Chrome Web Store.
 * Sem dependências: escreve o ZIP à mão (deflate do zlib + CRC32), sempre com
 * "/" nos caminhos (o Compress-Archive do Windows PowerShell 5.1 grava "\").
 *
 * Uso: node scripts/empacotar.mjs
 */
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { fileURLToPath } from "node:url"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// Lista do que entra no pacote (o resto — docs, testes, .md, scripts — fica de fora)
const INCLUIR = [
  "manifest.json",
  "background.js",
  "styles.css",
  "icons",
  "lib",
  "content",
  "popup",
  "options",
  "compare",
  "report",
  "welcome",
  "ui"
]

function listar(rel) {
  const abs = path.join(raiz, rel)
  if (!fs.existsSync(abs)) throw new Error(`Não encontrado: ${rel}`)
  if (fs.statSync(abs).isFile()) return [rel]
  return fs
    .readdirSync(abs)
    .sort()
    .flatMap((nome) => listar(path.join(rel, nome)))
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dataDos(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { hora, dia }
}

const manifest = JSON.parse(fs.readFileSync(path.join(raiz, "manifest.json"), "utf8"))
const arquivos = INCLUIR.flatMap(listar).map((r) => r.split(path.sep).join("/"))

const locais = []
const centrais = []
let offset = 0
const { hora, dia } = dataDos(new Date())

for (const nome of arquivos) {
  const dados = fs.readFileSync(path.join(raiz, nome))
  const comprimido = zlib.deflateRawSync(dados, { level: 9 })
  const crc = crc32(dados)
  const nomeBuf = Buffer.from(nome, "utf8")

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6) // nomes em UTF-8
  local.writeUInt16LE(8, 8) // deflate
  local.writeUInt16LE(hora, 10)
  local.writeUInt16LE(dia, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(comprimido.length, 18)
  local.writeUInt32LE(dados.length, 22)
  local.writeUInt16LE(nomeBuf.length, 26)
  local.writeUInt16LE(0, 28)
  locais.push(local, nomeBuf, comprimido)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(hora, 12)
  central.writeUInt16LE(dia, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(comprimido.length, 20)
  central.writeUInt32LE(dados.length, 24)
  central.writeUInt16LE(nomeBuf.length, 28)
  central.writeUInt32LE(offset, 42)
  centrais.push(central, nomeBuf)

  offset += local.length + nomeBuf.length + comprimido.length
}

const tamanhoCentral = centrais.reduce((s, b) => s + b.length, 0)
const fim = Buffer.alloc(22)
fim.writeUInt32LE(0x06054b50, 0)
fim.writeUInt16LE(arquivos.length, 8)
fim.writeUInt16LE(arquivos.length, 10)
fim.writeUInt32LE(tamanhoCentral, 12)
fim.writeUInt32LE(offset, 16)

const destino = path.join(raiz, "dist", `leilometro-${manifest.version}.zip`)
fs.mkdirSync(path.dirname(destino), { recursive: true })
fs.writeFileSync(destino, Buffer.concat([...locais, ...centrais, fim]))
console.log(`${path.relative(raiz, destino)} — ${arquivos.length} arquivos, ${(fs.statSync(destino).size / 1024).toFixed(0)} KB`)
