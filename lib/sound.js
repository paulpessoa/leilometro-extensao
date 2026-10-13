/**
 * Leilômetro — sons de alerta gerados com Web Audio (sem arquivos de áudio)
 *
 * O navegador só libera o áudio depois de um gesto do usuário na página.
 * Chame destravar() dentro de um clique (ex.: "Ativar rastreio", "Testar som").
 */
;(function (root) {
  "use strict"

  const PADROES = {
    // dois tons curtos subindo — alerta normal
    apito: [
      [1800, 0.12],
      [2400, 0.18],
      [1800, 0.12],
      [2400, 0.18]
    ],
    // três tons descendentes e longos — passou do teto
    critico: [
      [2000, 0.25],
      [1500, 0.25],
      [1000, 0.4],
      [2000, 0.25],
      [1500, 0.25],
      [1000, 0.4]
    ],
    // bip curto — novo lance
    bip: [[1200, 0.07]]
  }

  let ctx = null

  function contexto() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    return ctx
  }

  async function destravar() {
    const c = contexto()
    if (c && c.state === "suspended") {
      try {
        await c.resume()
      } catch {}
    }
    return c?.state === "running"
  }

  function tocar(padrao = "apito", volume = 0.6) {
    const c = contexto()
    if (!c) return false
    if (c.state === "suspended") c.resume().catch(() => {})
    const notas = PADROES[padrao] || PADROES.apito
    const vol = Math.max(0.01, Math.min(1, volume))
    let t = c.currentTime + 0.02
    for (const [freq, dur] of notas) {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = padrao === "critico" ? "square" : "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(vol * (padrao === "critico" ? 0.5 : 1), t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.connect(gain).connect(c.destination)
      osc.start(t)
      osc.stop(t + dur)
      t += dur + 0.05
    }
    return true
  }

  const liberado = () => ctx?.state === "running"

  ;(root.LM = root.LM || {}).sound = { tocar, destravar, liberado, PADROES }
})(globalThis)
