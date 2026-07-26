import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { Chess } from 'chess.js'
import { gsap } from 'gsap'
import {
  initScene, renderScene, disposeScene, markDirty, shouldRender, setSceneBg
} from '../three/ChessScene.js'
import {
  createBoard, highlightSquare, setBoardModel
} from '../three/BoardMesh.js'
import {
  buildPiecesFromBoard, clearRGBRegistry,
  preloadModels, preloadHiModels, preloadVicModels, preloadVic2Models,
  preloadChineseModels, preloadChinesePModels, preloadJapanModels,
  preloadFiberModels, preloadFiber2Models, preloadNeoPunkModels
} from '../three/PieceMesh.js'
import { initControls, updateControls, disposeControls } from '../three/CameraController.js'

async function preloadForStyle(style) {
  const loaders = {
    ok: preloadHiModels, vic: preloadVicModels, vic2: preloadVic2Models,
    chinese: preloadChineseModels, chinese_p: preloadChinesePModels,
    japan: preloadJapanModels, fiber: preloadFiberModels,
    fiber2: preloadFiber2Models, neo_punk: preloadNeoPunkModels,
  }
  try {
    await (loaders[style] ?? preloadModels)()
  } catch {}
}

export default function ReviewScreen({ settings }) {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const [showModal, setShowModal] = useState(false)

  const reviewData = (() => {
    try { return JSON.parse(sessionStorage.getItem('review_data') || 'null') } catch { return null }
  })()
  const gameType = sessionStorage.getItem('game_type') || 'bot'

  useEffect(() => {
    if (!reviewData) { navigate('/'); return }

    const canvas = canvasRef.current
    if (!canvas) return

    let loopActive = true
    const tick = () => {
      if (!loopActive) return
      updateControls()
      if (shouldRender()) renderScene()
    }
    gsap.ticker.add(tick)

    const pieceStyle = settings?.pieceStyle || 'glb'

    async function init() {
      const { scene, camera } = initScene(canvas)
      await preloadForStyle(pieceStyle)

      createBoard(scene, settings?.boardStyle || 'wood')
      setBoardModel(settings?.boardModel ?? null)
      setSceneBg(settings?.bgImage ?? null)

      const chess = new Chess()
      chess.load(reviewData.fen)
      buildPiecesFromBoard(scene, chess.board(), pieceStyle)

      initControls(camera, { domElement: canvas })

      if (reviewData.lastMove) {
        highlightSquare(reviewData.lastMove.from, '#5B8DD9', 0.5)
        highlightSquare(reviewData.lastMove.to, '#C8A96E', 0.65)
      }

      markDirty(4)
    }

    init()

    return () => {
      loopActive = false
      gsap.ticker.remove(tick)
      clearRGBRegistry()
      disposeControls()
      disposeScene()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlayAgain = () => {
    navigate(gameType === 'bot' ? '/bot-game' : '/matchmaking')
  }

  return (
    <div className="w-full h-full flex flex-col bg-obsidian overflow-hidden">
      {/* Top bar */}
      <div
        className="flex-shrink-0 h-12 flex items-center justify-between px-4"
        style={{ background: '#14141F', borderBottom: '1px solid #2A2A3C' }}
      >
        <span className="font-cinzel text-gold text-lg tracking-widest flex-shrink-0">REGICIDE</span>
        <span className="text-ash font-inter text-xs tracking-widest uppercase">Review — Last Move</span>
        <button
          onClick={() => setShowModal(true)}
          className="text-ash hover:text-ivory font-inter text-xs transition-colors"
        >
          Done →
        </button>
      </div>

      {/* Last move legend */}
      {reviewData?.lastMove && (
        <div
          className="flex-shrink-0 flex justify-center items-center gap-6 py-2"
          style={{ background: '#0D0D0F', borderBottom: '1px solid #1E1E2E' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#5B8DD9', opacity: 0.9 }} />
            <span className="text-ash font-mono text-xs">
              From: <span className="text-ivory">{reviewData.lastMove.from.toUpperCase()}</span>
            </span>
          </div>
          <div className="w-px h-4" style={{ background: '#2A2A3C' }} />
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#C8A96E' }} />
            <span className="text-ash font-mono text-xs">
              To: <span className="text-gold">{reviewData.lastMove.to.toUpperCase()}</span>
            </span>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative min-w-0 min-h-0">
        <canvas ref={canvasRef} className="w-full h-full block" style={{ touchAction: 'none' }} />

        {/* Done button */}
        <button
          onClick={() => setShowModal(true)}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-10 py-3 font-cinzel font-bold tracking-widest text-obsidian rounded-xl transition-all hover:brightness-110 hover:scale-105 active:scale-95"
          style={{ background: '#C8A96E', boxShadow: '0 0 24px rgba(200,169,110,0.35)' }}
        >
          DONE REVIEWING
        </button>

        {/* Post-review modal */}
        {showModal && (
          <div
            className="absolute inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(13,13,15,0.88)', backdropFilter: 'blur(10px)' }}
          >
            <div
              className="relative text-center px-10 py-10 rounded-2xl"
              style={{
                background: '#14141F',
                border: '1px solid #2A2A3C',
                minWidth: 280,
                animation: 'fadeIn 0.3s ease-out',
              }}
            >
              <p className="font-cinzel text-ivory tracking-[0.2em] text-lg mb-1">WHAT'S NEXT?</p>
              <p className="text-ash font-inter text-xs mb-6">Choose your next move</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handlePlayAgain}
                  className="w-full py-3 font-cinzel font-bold tracking-widest text-obsidian rounded transition-all hover:brightness-110 hover:scale-105 active:scale-95"
                  style={{ background: '#C8A96E', boxShadow: '0 0 20px rgba(200,169,110,0.3)' }}
                >
                  PLAY AGAIN
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full py-3 font-inter text-sm tracking-widest rounded border transition-all hover:scale-105"
                  style={{ borderColor: '#4A6A9C', color: '#7BA7DC', background: 'rgba(74,106,156,0.1)' }}
                >
                  Review Again
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full py-3 font-inter text-sm tracking-widest text-ash border border-carbon rounded hover:border-ash hover:text-ivory transition-colors"
                >
                  Home
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
