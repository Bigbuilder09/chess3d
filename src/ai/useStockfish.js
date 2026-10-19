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
  const failedRef  = useRef(false)

  useEffect(() => {
    failedRef.current = false
    let worker
    try {
      worker = new Worker('/stockfish-18-lite-single.js')
    } catch (e) {
      console.error('[Stockfish] could not start worker:', e)
      failedRef.current = true
      return
    }

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
      // #6: mark the engine as unusable so pending/future requests resolve
      // with null immediately and the caller falls back to the local bot
      failedRef.current = true
      if (resolveRef.current) { resolveRef.current(null); resolveRef.current = null }
    }

    worker.postMessage('uci')
    sfRef.current = worker

    return () => {
      worker.terminate()
      sfRef.current   = null
      readyRef.current = false
      if (resolveRef.current) { resolveRef.current(null); resolveRef.current = null }
    }
  }, [])

  const getMove = useCallback((fen, difficulty) => {
    return new Promise((resolve) => {
      const worker = sfRef.current
      if (!worker || failedRef.current) { resolve(null); return }

      const skill    = SKILL[difficulty]    ?? 10
      const movetime = MOVETIME[difficulty] ?? 800

      // #6: never wait forever — not for the engine to become ready, and not
      // for a "bestmove" that never comes. On timeout, resolve null so the
      // caller can use its fallback instead of freezing the game.
      const READY_TIMEOUT = 5000
      const startedAt = Date.now()
      let settled = false
      let moveTimer = null
      const finish = (move) => {
        if (settled) return
        settled = true
        clearTimeout(moveTimer)
        if (resolveRef.current === finish) resolveRef.current = null
        resolve(move)
      }

      const send = () => {
        if (settled) return
        if (failedRef.current || sfRef.current !== worker) { finish(null); return }
        if (!readyRef.current) {
          if (Date.now() - startedAt > READY_TIMEOUT) {
            console.warn('[Stockfish] engine not ready — using fallback bot')
            failedRef.current = true
            finish(null)
            return
          }
          setTimeout(send, 50)
          return
        }
        resolveRef.current = finish
        worker.postMessage(`setoption name Skill Level value ${skill}`)
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go movetime ${movetime}`)
        moveTimer = setTimeout(() => {
          console.warn('[Stockfish] no bestmove in time — using fallback bot')
          worker.postMessage('stop')
          finish(null)
        }, movetime + 5000)
      }
      send()
    })
  }, [])

  return { getMove }
}
