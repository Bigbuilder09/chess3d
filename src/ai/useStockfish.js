import { useRef, useEffect, useCallback } from 'react'

const SKILL = {
  beginner: 0, casual: 4, club: 8, advanced: 12, expert: 16, master: 20,
  // legacy keys
  easy: 2, medium: 10, hard: 20
}
const MOVETIME = {
  beginner: 100, casual: 300, club: 500, advanced: 800, expert: 1200, master: 2000,
  easy: 300, medium: 800, hard: 1500
}

export function useStockfish() {
  const sfRef      = useRef(null)
  const readyRef   = useRef(false)
  const resolveRef = useRef(null)

  useEffect(() => {
    const worker = new Worker('/stockfish-18-lite-single.js')

    worker.onmessage = ({ data }) => {
      const msg = typeof data === 'string' ? data : null
      if (!msg) return

      if (msg === 'uciok') {
        worker.postMessage('isready')
      } else if (msg === 'readyok') {
        readyRef.current = true
      } else if (msg.startsWith('bestmove') && resolveRef.current) {
        const uciMove = msg.split(' ')[1]
        resolveRef.current(uciMove === '(none)' ? null : uciMove)
        resolveRef.current = null
      }
    }

    worker.onerror = (e) => {
      console.error('[Stockfish] worker error:', e)
      if (resolveRef.current) { resolveRef.current(null); resolveRef.current = null }
    }

    worker.postMessage('uci')
    sfRef.current = worker

    return () => {
      worker.terminate()
      sfRef.current   = null
      readyRef.current = false
    }
  }, [])

  const getMove = useCallback((fen, difficulty) => {
    return new Promise((resolve) => {
      const worker = sfRef.current
      if (!worker) { resolve(null); return }

      const skill    = SKILL[difficulty]    ?? 10
      const movetime = MOVETIME[difficulty] ?? 800

      const send = () => {
        if (!readyRef.current) { setTimeout(send, 50); return }
        resolveRef.current = resolve
        worker.postMessage(`setoption name Skill Level value ${skill}`)
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go movetime ${movetime}`)
      }
      send()
    })
  }, [])

  return { getMove }
}
