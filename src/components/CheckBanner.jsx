import React, { useEffect, useState } from 'react'

export default function CheckBanner({ isInCheck, isCheckmate }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isInCheck || isCheckmate) {
      setVisible(true)
    } else {
      // Hide with delay to allow animation
      const t = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(t)
    }
  }, [isInCheck, isCheckmate])

  if (!visible) return null

  return (
    <div
      className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center py-3 select-none pointer-events-none"
      style={{
        background: isCheckmate
          ? 'rgba(232,64,64,0.95)'
          : 'rgba(232,64,64,0.85)',
        animation: 'slideDown 0.3s ease-out',
        backdropFilter: 'blur(4px)'
      }}
    >
      <span className="font-cinzel text-ivory tracking-[0.25em] text-sm font-bold">
        {isCheckmate ? 'CHECKMATE' : 'YOUR KING IS IN CHECK'}
      </span>
    </div>
  )
}
