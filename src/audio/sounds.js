// Web Audio API sound synthesizer — no external files needed
let audioCtx = null

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

function playTone({ type = 'sine', freq = 440, gain = 0.3, duration = 0.3, decay = 0.2 }) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gainNode = ctx.createGain()
  osc.connect(gainNode)
  gainNode.connect(ctx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gainNode.gain.setValueAtTime(gain, ctx.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration + decay)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration + decay)
}

export function playMoveSound() {
  // Subtle wooden click
  playTone({ type: 'triangle', freq: 300, gain: 0.15, duration: 0.05, decay: 0.05 })
}

export function playCaptureSound() {
  // Stone crack — two layered tones, slight pitch variation
  const pitch = 200 + Math.random() * 60 - 30
  playTone({ type: 'square', freq: pitch, gain: 0.25, duration: 0.1, decay: 0.2 })
  setTimeout(() => playTone({ type: 'sawtooth', freq: pitch * 0.8, gain: 0.1, duration: 0.05, decay: 0.15 }), 30)
}

export function playQueenCaptureSound() {
  // Heavy crash + shimmer
  playTone({ type: 'sawtooth', freq: 120, gain: 0.4, duration: 0.2, decay: 0.6 })
  setTimeout(() => playTone({ type: 'sine', freq: 880, gain: 0.15, duration: 0.1, decay: 0.8 }), 100)
  setTimeout(() => playTone({ type: 'sine', freq: 1320, gain: 0.08, duration: 0.05, decay: 0.6 }), 200)
}

export function playCheckSound() {
  // Single deep bell
  playTone({ type: 'sine', freq: 220, gain: 0.35, duration: 0.3, decay: 1.2 })
  setTimeout(() => playTone({ type: 'sine', freq: 330, gain: 0.15, duration: 0.2, decay: 0.8 }), 50)
}

export function playCheckmateSound() {
  // Dramatic orchestral hit — staggered chord
  const notes = [110, 138, 165, 220]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone({ type: 'sawtooth', freq, gain: 0.2, duration: 0.4, decay: 1.5 }), i * 60)
  })
  setTimeout(() => playTone({ type: 'sine', freq: 55, gain: 0.4, duration: 0.6, decay: 2.0 }), 0)
}

export function playGameEndSound(outcome) { // 'win' | 'lose' | 'draw'
  if (outcome === 'win') {
    // Major chord arpeggio up
    ;[261, 329, 392, 523].forEach((f, i) =>
      setTimeout(() => playTone({ type: 'sine', freq: f, gain: 0.2, duration: 0.3, decay: 0.5 }), i * 120)
    )
  } else if (outcome === 'lose') {
    // Minor chord arpeggio down
    ;[392, 311, 261, 220].forEach((f, i) =>
      setTimeout(() => playTone({ type: 'sine', freq: f, gain: 0.15, duration: 0.4, decay: 0.6 }), i * 120)
    )
  } else {
    // Neutral two-tone
    playTone({ type: 'sine', freq: 330, gain: 0.2, duration: 0.3, decay: 0.4 })
    setTimeout(() => playTone({ type: 'sine', freq: 330, gain: 0.2, duration: 0.3, decay: 0.4 }), 400)
  }
}
