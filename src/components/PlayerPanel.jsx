import React from 'react'

const PIECE_SYMBOLS = {
  p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚'
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function PlayerPanel({
  name,
  rating,
  timeMs,
  isActive,
  isInCheck,
  captures = [],
  color,
}) {
  const isLowTime = timeMs < 60000  // < 60s
  const isCritical = timeMs < 10000 // < 10s

  const borderColor = isInCheck
    ? '#E84040'
    : isActive
      ? (color === 'white' ? '#C8A96E' : '#5C6BC0')
      : 'transparent'

  const panelBg = isInCheck
    ? 'rgba(232,64,64,0.08)'
    : '#14141F'

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300"
      style={{
        background: panelBg,
        borderLeft: `3px solid ${borderColor}`,
        minHeight: 64
      }}
    >
      {/* Color indicator */}
      <div
        className="w-8 h-8 rounded-full border-2 flex-shrink-0"
        style={{
          background: color === 'white' ? '#F0EAD6' : '#1A1A2A',
          borderColor: color === 'white' ? '#C8A96E' : '#5C6BC0'
        }}
      />

      {/* Name + Rating */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-ivory font-inter font-medium text-sm truncate">{name}</span>
          {isInCheck && (
            <span className="text-crimson font-mono text-xs font-bold px-1 py-0.5 rounded"
              style={{ background: 'rgba(232,64,64,0.15)' }}>CHECK</span>
          )}
        </div>
        <div className="text-ash font-mono text-xs">{rating}</div>

        {/* Captured pieces */}
        {captures.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {captures.map((p, i) => (
              <span key={i} className="text-xs text-ash">{PIECE_SYMBOLS[p] || p}</span>
            ))}
          </div>
        )}
      </div>

      {/* Timer */}
      <div
        className={`font-mono font-semibold text-lg px-2 py-1 rounded transition-all duration-200 ${
          isCritical
            ? 'timer-pulse'
            : ''
        }`}
        style={{
          color: isLowTime ? '#E84040' : '#F0EAD6',
          background: isCritical ? 'rgba(232,64,64,0.15)' : 'transparent',
          minWidth: 56,
          textAlign: 'right'
        }}
      >
        {formatTime(timeMs)}
      </div>
    </div>
  )
}
