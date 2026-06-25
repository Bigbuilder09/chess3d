import React, { useEffect, useRef, useState } from 'react'

export default function MoveLog({ moves = [], onFlipBoard, onResign, onOfferDraw, drawOfferSent = false }) {
  const bottomRef = useRef(null)
  const [resignConfirm, setResignConfirm] = useState(false)
  const [resignTimer, setResignTimer] = useState(null)

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [moves])

  const handleResignClick = () => {
    setResignConfirm(true)
    const t = setTimeout(() => setResignConfirm(false), 8000)
    setResignTimer(t)
  }

  const handleResignConfirm = () => {
    clearTimeout(resignTimer)
    setResignConfirm(false)
    onResign?.()
  }

  const handleResignCancel = () => {
    clearTimeout(resignTimer)
    setResignConfirm(false)
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#14141F', borderLeft: '1px solid #2A2A3C' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid #2A2A3C' }}
      >
        <span className="text-ash font-inter text-xs tracking-widest uppercase">Move Log</span>
        <button
          onClick={onFlipBoard}
          className="text-ash hover:text-gold font-mono text-xs transition-colors px-2 py-1 rounded hover:bg-charcoal"
          title="Flip board"
        >
          ⇅
        </button>
      </div>

      {/* Moves list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {moves.length === 0 ? (
          <p className="text-ash font-inter text-xs text-center mt-4">No moves yet</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {moves.map((move, i) => (
                <tr key={i} className="hover:bg-charcoal transition-colors">
                  <td className="text-ash font-mono text-xs py-0.5 px-1 w-6">{move.number}.</td>
                  <td className="text-ivory font-mono text-xs py-0.5 px-1 w-14">{move.white}</td>
                  <td className="text-ivory font-mono text-xs py-0.5 px-1 w-14">
                    {move.black || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Controls */}
      <div
        className="px-3 py-3 flex flex-col gap-2 flex-shrink-0"
        style={{ borderTop: '1px solid #2A2A3C' }}
      >
        {resignConfirm ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-crimson font-inter text-xs text-center">Confirm resign?</p>
            <div className="flex gap-2">
              <button
                onClick={handleResignConfirm}
                className="flex-1 py-1.5 rounded text-xs font-inter bg-crimson text-ivory hover:brightness-110 transition-all"
              >
                Yes
              </button>
              <button
                onClick={handleResignCancel}
                className="flex-1 py-1.5 rounded text-xs font-inter border border-carbon text-ash hover:text-ivory transition-colors"
              >
                No
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={onOfferDraw}
              disabled={drawOfferSent}
              className={`w-full py-2 text-xs font-inter border rounded transition-colors
                ${drawOfferSent
                  ? 'border-carbon text-ash opacity-50 cursor-not-allowed'
                  : 'border-carbon text-ash hover:border-ash hover:text-ivory'}`}
            >
              {drawOfferSent ? 'Draw offered...' : 'Offer Draw'}
            </button>
            <button
              onClick={handleResignClick}
              className="w-full py-2 text-xs font-inter border border-crimson text-crimson rounded hover:bg-crimson hover:text-ivory transition-all"
            >
              Resign
            </button>
          </>
        )}
      </div>
    </div>
  )
}
