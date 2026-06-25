import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { Chess } from 'chess.js'
import { initScene, renderScene, disposeScene } from '../three/ChessScene.js'
import { createBoard, highlightSquare, clearAllHighlights, showLegalDots, clearLegalDots, getBoardGroup, updateBoardStyle } from '../three/BoardMesh.js'
import { createPiece, movePiece, removePiece, selectPiece, deselectPiece, rebuildPieces } from '../three/PieceMesh.js'
import { initControls, updateControls, disposeControls } from '../three/CameraController.js'
import { playCaptureEffect, playCheckEffect, clearCheckEffect, playCheckmateEffect } from '../three/CaptureEffect.js'
import { playMoveSound, playCaptureSound, playQueenCaptureSound, playCheckSound, playCheckmateSound, playGameEndSound } from '../audio/sounds.js'
import { getBotMove } from '../ai/BotEngine.js'
import { useChessGame } from '../hooks/useChessGame.js'
import PlayerPanel from './PlayerPanel.jsx'
import MoveLog from './MoveLog.jsx'
import CheckBanner from './CheckBanner.jsx'

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const INITIAL_TIME = 10 * 60 * 1000
const BOT_DELAY = { easy: 600, medium: 900, hard: 1400 }

function initBoardPieces(scene, style = 'classic') {
  const pieceMap = {}
  const startLayout = [
    ['r','n','b','q','k','b','n','r'].map((t, i) => ({ type: t, color: 'black', sq: String.fromCharCode(97+i)+'8' })),
    Array.from({length:8},(_,i) => ({ type:'p', color:'black', sq: String.fromCharCode(97+i)+'7' })),
    Array.from({length:8},(_,i) => ({ type:'p', color:'white', sq: String.fromCharCode(97+i)+'2' })),
    ['r','n','b','q','k','b','n','r'].map((t, i) => ({ type: t, color: 'white', sq: String.fromCharCode(97+i)+'1' })),
  ].flat()
  startLayout.forEach(({ type, color, sq }) => {
    const piece = createPiece(type, color, sq, scene, style)
    if (piece) pieceMap[sq] = piece
  })
  return pieceMap
}

export default function BotGameScreen({ difficulty = 'medium', playerInfo, settings, setSettings }) {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const pieceMapRef = useRef({})
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const raycaster = useRef(new THREE.Raycaster())
  const mouse = useRef(new THREE.Vector2())
  const isAnimating = useRef(false)
  const botThinkingRef = useRef(false)
  const localChessRef = useRef(new Chess())
  // Keep a ref to latest settings so async callbacks always see current values
  const settingsRef = useRef(settings)

  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const myColor = 'white'
  const botColor = 'black'

  const {
    moves, isCheck, isCheckmate, selectedSquare, legalMoves,
    capturedPieces, gameOver, setGameOver,
    applyServerMove, selectSquare, clearSelection
  } = useChessGame(myColor)

  const [myTimeMs, setMyTimeMs] = useState(INITIAL_TIME)
  const [botTimeMs, setBotTimeMs] = useState(INITIAL_TIME)
  const [currentTurn, setCurrentTurn] = useState('white')
  const [promotionPending, setPromotionPending] = useState(null)
  const [botThinking, setBotThinking] = useState(false)

  const isMyTurn = currentTurn === myColor && !botThinkingRef.current

  // ── Three.js init ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { scene, camera } = initScene(canvas)
    sceneRef.current = scene
    cameraRef.current = camera
    createBoard(scene, settings.boardStyle)
    pieceMapRef.current = initBoardPieces(scene, settings.pieceStyle)
    controlsRef.current = initControls(camera, { domElement: canvas })

    let rafId
    function loop() {
      rafId = requestAnimationFrame(loop)
      updateControls()
      renderScene()
    }
    loop()
    animFrameRef.current = rafId

    return () => {
      cancelAnimationFrame(rafId)
      disposeControls()
      disposeScene()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live board style update ──────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return
    updateBoardStyle(sceneRef.current, settings.boardStyle)
  }, [settings.boardStyle])

  // ── Live piece style update ──────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return
    rebuildPieces(sceneRef.current, pieceMapRef.current, settings.pieceStyle)
  }, [settings.pieceStyle])

  // ── Apply a move (shared between player and bot) ─────────────────────────
  const applyMove = useCallback(async (moveResult) => {
    const chess = localChessRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const map = pieceMapRef.current
    const { from, to, captured, flags, promotion, san } = moveResult

    const data = {
      from, to, san,
      fen: chess.fen(),
      captured: captured || null,
      flags: flags || '',
      promotion: promotion || null,
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw() || chess.isStalemate()
    }

    applyServerMove(data)
    setCurrentTurn(prev => prev === 'white' ? 'black' : 'white')

    const movingPiece = map[from]
    if (!movingPiece) return

    // En passant
    if (captured && flags?.includes('e')) {
      const epSq = to[0] + from[1]
      const epMesh = map[epSq]
      if (epMesh) {
        delete map[epSq]
        if (scene) {
          await removePiece(epMesh, scene)
          playCaptureEffect(scene, controls, epSq, PIECE_VALUES[captured] || 1)
        }
      }
    } else if (captured && map[to]) {
      const capMesh = map[to]
      delete map[to]
      if (scene) {
        await removePiece(capMesh, scene)
        playCaptureEffect(scene, controls, to, PIECE_VALUES[captured] || 1)
      }
    }

    map[to] = movingPiece
    delete map[from]
    movingPiece.userData.square = to
    const animations = [movePiece(movingPiece, to)]

    // Castling
    if (flags?.includes('k') || flags?.includes('q')) {
      const movedColor = chess.turn() === 'b' ? 'white' : 'black'
      const isKingside = flags.includes('k')
      const rookFrom = isKingside ? (movedColor==='white'?'h1':'h8') : (movedColor==='white'?'a1':'a8')
      const rookTo   = isKingside ? (movedColor==='white'?'f1':'f8') : (movedColor==='white'?'d1':'d8')
      const rookMesh = map[rookFrom]
      if (rookMesh) {
        map[rookTo] = rookMesh; delete map[rookFrom]
        rookMesh.userData.square = rookTo
        animations.push(movePiece(rookMesh, rookTo))
      }
    }

    await Promise.all(animations)

    // Promotion — use current style from ref so async callback stays fresh
    if (promotion && scene) {
      const pawnMesh = map[to]
      if (pawnMesh) {
        scene.remove(pawnMesh)
        pawnMesh.traverse(c => {
          if (c.isMesh) {
            c.geometry.dispose()
            const mats = Array.isArray(c.material) ? c.material : [c.material]
            mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose() })
          }
        })
        delete map[to]
      }
      const movedColor = chess.turn() === 'b' ? 'white' : 'black'
      const newPiece = createPiece(promotion, movedColor, to, scene, settingsRef.current.pieceStyle)
      if (newPiece) { newPiece.userData.square = to; map[to] = newPiece }
    }

    // Sounds
    if (captured) {
      if (captured === 'q') playQueenCaptureSound()
      else playCaptureSound()
    } else {
      playMoveSound()
    }

    const chk = chess.isCheck()
    const mate = chess.isCheckmate()

    if (mate) {
      playCheckmateSound()
      const kingColor = chess.turn() === 'b' ? 'black' : 'white'
      const kingSq = Object.entries(map).find(([, m]) => m.userData.pieceType==='k' && m.userData.color===kingColor)?.[0]
      if (kingSq && scene && controls) playCheckmateEffect(scene, controls, map[kingSq])
    } else if (chk) {
      playCheckSound()
      const kingColor = chess.turn() === 'b' ? 'black' : 'white'
      const kingSq = Object.entries(map).find(([, m]) => m.userData.pieceType==='k' && m.userData.color===kingColor)?.[0]
      if (kingSq && scene) playCheckEffect(scene, map[kingSq])
    } else {
      if (scene) clearCheckEffect(scene)
    }

    clearAllHighlights()
    clearLegalDots()

    // Check game over
    if (mate || chess.isDraw() || chess.isStalemate()) {
      const outcome = mate
        ? (chess.turn() === (myColor==='white'?'b':'w') ? 'win' : 'lose')
        : 'draw'
      const go = { winner: mate ? (outcome==='win' ? myColor : botColor) : null, reason: mate ? 'checkmate' : 'draw' }
      setGameOver(go)
      playGameEndSound(outcome)
      setTimeout(() => navigate('/'), 3000)
    }
  }, [applyServerMove, myColor, botColor, navigate, setGameOver])

  // ── Bot move ──────────────────────────────────────────────────────────────
  const makeBotMove = useCallback(() => {
    const chess = localChessRef.current
    if (chess.isGameOver()) return
    botThinkingRef.current = true
    setBotThinking(true)

    const delay = BOT_DELAY[difficulty] || 900
    setTimeout(() => {
      const san = getBotMove(chess.fen(), difficulty)
      if (!san) { botThinkingRef.current = false; setBotThinking(false); return }
      const moveResult = chess.move(san)
      if (!moveResult) { botThinkingRef.current = false; setBotThinking(false); return }
      applyMove(moveResult).then(() => {
        botThinkingRef.current = false
        setBotThinking(false)
      })
    }, delay)
  }, [difficulty, applyMove])

  // Watch for bot turn
  useEffect(() => {
    if (currentTurn === botColor && !gameOver && !botThinkingRef.current) {
      makeBotMove()
    }
  }, [currentTurn, gameOver, makeBotMove, botColor])

  // ── Canvas click / raycasting ─────────────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    if (!isMyTurn || isAnimating.current || gameOver) return
    const canvas = canvasRef.current
    const camera = cameraRef.current
    const scene = sceneRef.current
    if (!canvas || !camera || !scene) return

    const rect = canvas.getBoundingClientRect()
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.current.setFromCamera(mouse.current, camera)

    const intersects = raycaster.current.intersectObjects(scene.children, true)
    let clickedSquare = null
    for (const hit of intersects) {
      let obj = hit.object
      while (obj) {
        if (obj.userData?.square) { clickedSquare = obj.userData.square; break }
        if (obj.userData?.isSquare) { clickedSquare = obj.userData.square; break }
        if (obj.userData?.legalSquare) { clickedSquare = obj.userData.legalSquare; break }
        obj = obj.parent
      }
      if (clickedSquare) break
    }

    if (!clickedSquare) {
      const boardHits = raycaster.current.intersectObjects(
        Object.values(getBoardGroup()?.children || []), false
      )
      for (const hit of boardHits) {
        if (hit.object.userData?.square) { clickedSquare = hit.object.userData.square; break }
      }
    }

    if (!clickedSquare) {
      if (selectedSquare) { deselectPiece(pieceMapRef.current[selectedSquare]); clearSelection(); clearAllHighlights(); clearLegalDots() }
      return
    }

    const result = selectSquare(clickedSquare)
    if (!result) {
      if (selectedSquare && pieceMapRef.current[selectedSquare]) deselectPiece(pieceMapRef.current[selectedSquare])
      clearAllHighlights(); clearLegalDots(); return
    }

    if (result.isMove) {
      if (selectedSquare && pieceMapRef.current[selectedSquare]) deselectPiece(pieceMapRef.current[selectedSquare])
      clearAllHighlights(); clearLegalDots()

      const piece = pieceMapRef.current[result.from]
      const needPromo = piece?.userData.pieceType === 'p' &&
        ((piece.userData.color === 'white' && parseInt(result.to[1]) === 8) ||
         (piece.userData.color === 'black' && parseInt(result.to[1]) === 1))
      if (needPromo) { setPromotionPending({ from: result.from, to: result.to }); return }

      const chess = localChessRef.current
      const moveResult = chess.move({ from: result.from, to: result.to, promotion: 'q' })
      if (moveResult) applyMove(moveResult)
    } else if (result.selected) {
      clearAllHighlights(); clearLegalDots()
      if (selectedSquare && selectedSquare !== result.selected && pieceMapRef.current[selectedSquare])
        deselectPiece(pieceMapRef.current[selectedSquare])
      highlightSquare(result.selected, '#C8A96E', 0.4)
      showLegalDots(result.legalMoves || [])
      if (pieceMapRef.current[result.selected]) selectPiece(pieceMapRef.current[result.selected])
    }
  }, [isMyTurn, gameOver, selectedSquare, selectSquare, clearSelection, applyMove])

  const handlePromotion = (p) => {
    if (!promotionPending) return
    const chess = localChessRef.current
    const moveResult = chess.move({ from: promotionPending.from, to: promotionPending.to, promotion: p })
    if (moveResult) applyMove(moveResult)
    setPromotionPending(null)
  }

  // ── Settings mini panel ───────────────────────────────────────────────────
  const SettingsPanel = () => (
    <div
      className="absolute top-full right-0 mt-1 p-4 rounded-xl z-50"
      style={{ background: '#14141F', border: '1px solid #2A2A3C', width: 260 }}
    >
      <p className="text-ash font-inter text-xs tracking-widest uppercase mb-3">Customize</p>

      <p className="text-ivory font-inter text-xs mb-2">Piece Style</p>
      <div className="flex gap-2 mb-3">
        {[
          { id: 'classic', label: 'Classic', desc: '3D shapes' },
          { id: 'symbol',  label: 'Symbol',  desc: '♛ disc' },
          { id: 'lowpoly', label: 'Low-poly', desc: 'Geometric' },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setSettings(prev => ({ ...prev, pieceStyle: s.id }))}
            className={`flex-1 py-2 px-1 rounded text-xs font-inter border transition-all text-center
              ${settings.pieceStyle === s.id
                ? 'border-gold text-gold bg-charcoal'
                : 'border-carbon text-ash hover:border-ash hover:text-ivory'}`}
          >
            <div>{s.label}</div>
            <div className="text-xs opacity-60 mt-0.5">{s.desc}</div>
          </button>
        ))}
      </div>

      <p className="text-ivory font-inter text-xs mb-2">Board Style</p>
      <div className="flex gap-2">
        {[
          { id: 'wood',   label: 'Wood',   color: '#6B4226' },
          { id: 'marble', label: 'Marble', color: '#5A5A6A' },
          { id: 'neon',   label: 'Neon',   color: '#1A4A6A' },
        ].map(b => (
          <button
            key={b.id}
            onClick={() => setSettings(prev => ({ ...prev, boardStyle: b.id }))}
            className={`flex-1 py-2 rounded text-xs font-inter border transition-all text-center
              ${settings.boardStyle === b.id
                ? 'border-gold text-gold bg-charcoal'
                : 'border-carbon text-ash hover:border-ash hover:text-ivory'}`}
          >
            <div
              className="w-4 h-4 rounded mx-auto mb-1"
              style={{ background: b.color }}
            />
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="w-full h-full flex flex-col bg-obsidian overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 h-12 flex items-center justify-between px-4" style={{ background: '#14141F', borderBottom: '1px solid #2A2A3C' }}>
        <span className="font-cinzel text-gold text-lg tracking-widest">REGICIDE</span>
        <div className="flex items-center gap-2 text-ash font-mono text-xs">
          <span className={currentTurn === 'white' ? 'text-ivory' : 'text-ash'}>White</span>
          <span className="text-carbon">·</span>
          <span className={currentTurn === 'black' ? 'text-ivory' : 'text-ash'}>Black</span>
          <span className="text-carbon ml-3">·</span>
          <span className={`ml-1 ${isMyTurn ? 'text-gold' : 'text-ash'}`}>
            {botThinking ? 'Bot thinking...' : isMyTurn ? 'Your turn' : "Bot's turn"}
          </span>
          <span className="text-carbon ml-2">·</span>
          <span className="text-ash ml-1 capitalize">{difficulty}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Settings gear */}
          <div className="relative">
            {settingsOpen && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSettingsOpen(false)}
              />
            )}
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className="relative z-50 text-ash hover:text-gold font-inter text-sm transition-colors px-2"
              title="Customize"
            >
              ⚙
            </button>
            {settingsOpen && <SettingsPanel />}
          </div>
          <button onClick={() => navigate('/')} className="text-ash hover:text-ivory font-inter text-xs transition-colors">✕ Exit</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: player panels */}
        <div className="flex flex-col justify-between py-3 px-2 flex-shrink-0" style={{ width: 220, borderRight: '1px solid #2A2A3C', background: '#14141F' }}>
          <PlayerPanel
            name={`Bot (${difficulty})`}
            rating={{ easy: 800, medium: 1400, hard: 2000 }[difficulty]}
            timeMs={botTimeMs}
            isActive={currentTurn === botColor}
            isInCheck={isCheck && currentTurn === botColor}
            captures={capturedPieces[botColor] || []}
            color={botColor}
            onTick={t => setBotTimeMs(t)}
            onTimeout={() => {
              setGameOver({ winner: myColor, reason: 'timeout' })
              playGameEndSound('win')
              setTimeout(() => navigate('/'), 3000)
            }}
          />
          <div className="flex-1" />
          <PlayerPanel
            name={playerInfo?.name || 'You'}
            rating={playerInfo?.rating || 1200}
            timeMs={myTimeMs}
            isActive={currentTurn === myColor}
            isInCheck={isCheck && currentTurn === myColor}
            captures={capturedPieces[myColor] || []}
            color={myColor}
            onTick={t => setMyTimeMs(t)}
            onTimeout={() => {
              setGameOver({ winner: botColor, reason: 'timeout' })
              playGameEndSound('lose')
              setTimeout(() => navigate('/'), 3000)
            }}
          />
        </div>

        {/* Center: canvas */}
        <div className="flex-1 relative min-w-0">
          <CheckBanner isInCheck={isCheck && currentTurn === myColor} isCheckmate={isCheckmate} />
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            onClick={handleCanvasClick}
            style={{ cursor: isMyTurn ? 'crosshair' : 'default' }}
          />

          {/* Promotion picker */}
          {promotionPending && (
            <div className="absolute inset-0 flex items-center justify-center z-40" style={{ background: 'rgba(13,13,15,0.85)' }}>
              <div className="p-6 rounded-xl" style={{ background: '#14141F', border: '1px solid #C8A96E' }}>
                <p className="text-ash font-inter text-sm mb-4 text-center">Promote pawn to:</p>
                <div className="flex gap-3">
                  {['q','r','b','n'].map(p => (
                    <button key={p} onClick={() => handlePromotion(p)}
                      className="w-14 h-14 flex items-center justify-center text-3xl rounded-lg border border-carbon hover:border-gold hover:bg-charcoal transition-all">
                      {{'q':'♛','r':'♜','b':'♝','n':'♞'}[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {gameOver && (
            <div className="absolute inset-0 flex items-center justify-center z-40" style={{ background: 'rgba(13,13,15,0.6)', backdropFilter: 'blur(4px)' }}>
              <div className="text-center">
                <p className="font-cinzel text-gold text-2xl tracking-widest">
                  {gameOver.winner === myColor ? 'YOU WIN' : gameOver.winner === null ? 'DRAW' : 'GAME OVER'}
                </p>
                <p className="text-ash font-inter text-sm mt-2">Returning to menu...</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: move log */}
        <div className="flex-shrink-0" style={{ width: 200 }}>
          <MoveLog
            moves={moves}
            onFlipBoard={() => {}}
            onResign={() => {
              setGameOver({ winner: botColor, reason: 'resignation' })
              playGameEndSound('lose')
              setTimeout(() => navigate('/'), 3000)
            }}
            onOfferDraw={() => {}}
          />
        </div>
      </div>
    </div>
  )
}
