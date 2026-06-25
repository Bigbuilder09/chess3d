import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

function GoldParticles() {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const particles = []
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div')
      p.className = 'gold-particle'
      p.style.left = `${Math.random() * 100}%`
      p.style.bottom = '0'
      p.style.animationDelay = `${Math.random() * 2}s`
      p.style.animationDuration = `${1.5 + Math.random() * 1.5}s`
      p.style.width = `${4 + Math.random() * 6}px`
      p.style.height = p.style.width
      p.style.background = Math.random() > 0.5 ? '#C8A96E' : '#FFD700'
      container.appendChild(p)
      particles.push(p)
    }
    return () => particles.forEach(p => p.remove())
  }, [])

  return <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden" />
}

export default function EndScreen({ result }) {
  const navigate = useNavigate()

  if (!result) {
    // Fallback — shouldn't happen normally
    return (
      <div className="w-full h-full flex items-center justify-center bg-obsidian">
        <div className="text-center">
          <p className="text-ash font-inter mb-4">Game ended</p>
          <button onClick={() => navigate('/')} className="text-gold font-cinzel">Home</button>
        </div>
      </div>
    )
  }

  const { outcome, reason, stats } = result

  const isWin  = outcome === 'win'
  const isLose = outcome === 'lose'
  const isDraw = outcome === 'draw'

  const titleText  = isWin ? 'VICTORY' : isLose ? 'DEFEAT' : 'DRAW'
  const titleColor = isWin ? '#C8A96E' : isLose ? '#7A7A8C' : '#5C6BC0'
  const titleGlow  = isWin ? '0 0 60px rgba(200,169,110,0.5)' : 'none'

  const reasonText = {
    checkmate:    'by Checkmate',
    resignation:  'by Resignation',
    disconnect:   'Opponent disconnected',
    draw:         'Mutual Agreement',
    stalemate:    'by Stalemate',
    timeout:      'on Time',
  }[reason] || reason || ''

  return (
    <div
      className="w-full h-full flex items-center justify-center relative"
      style={{ background: 'rgba(13,13,15,0.95)', backdropFilter: 'blur(12px)' }}
    >
      {isWin && <GoldParticles />}

      <div
        className="relative text-center px-12 py-14 rounded-2xl z-10 max-w-md w-full"
        style={{
          background: '#14141F',
          border: `1px solid ${isWin ? '#C8A96E' : '#2A2A3C'}`,
          boxShadow: isWin ? '0 0 80px rgba(200,169,110,0.15)' : 'none',
          animation: 'fadeIn 0.5s ease-out'
        }}
      >
        {/* Result title */}
        <h1
          className="font-cinzel tracking-[0.3em] mb-2"
          style={{
            fontSize: '3rem',
            color: titleColor,
            textShadow: titleGlow
          }}
        >
          {titleText}
        </h1>

        {/* Reason */}
        <p className="text-ash font-inter text-sm mb-8 tracking-wide">{reasonText}</p>

        {/* Stats */}
        {stats && (
          <div
            className="flex justify-around mb-8 py-4 rounded-lg"
            style={{ background: '#1E1E2E' }}
          >
            {stats.accuracy != null && (
              <div className="text-center">
                <div className="text-ivory font-mono font-semibold text-xl">{stats.accuracy}%</div>
                <div className="text-ash font-inter text-xs mt-1">Accuracy</div>
              </div>
            )}
            {stats.moves != null && (
              <div className="text-center">
                <div className="text-ivory font-mono font-semibold text-xl">{stats.moves}</div>
                <div className="text-ash font-inter text-xs mt-1">Moves</div>
              </div>
            )}
            {stats.ratingChange != null && (
              <div className="text-center">
                <div
                  className="font-mono font-semibold text-xl"
                  style={{ color: stats.ratingChange >= 0 ? '#4CAF7D' : '#E84040' }}
                >
                  {stats.ratingChange >= 0 ? '+' : ''}{stats.ratingChange}
                </div>
                <div className="text-ash font-inter text-xs mt-1">Rating</div>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate('/matchmaking')}
            className="w-full py-4 font-cinzel font-bold tracking-widest text-obsidian rounded transition-all hover:brightness-110 hover:scale-105 active:scale-95"
            style={{ background: '#C8A96E', boxShadow: '0 0 20px rgba(200,169,110,0.3)' }}
          >
            REMATCH
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 font-inter text-sm tracking-widest text-ash border border-carbon rounded hover:border-ash hover:text-ivory transition-colors"
          >
            HOME
          </button>
        </div>
      </div>
    </div>
  )
}
