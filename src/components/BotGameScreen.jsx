import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { Chess } from 'chess.js'
import { initScene, renderScene, disposeScene, markDirty, shouldRender, setSceneBg } from '../three/ChessScene.js'
import { createBoard, highlightSquare, clearAllHighlights, showLegalDots, clearLegalDots, getBoardGroup, updateBoardStyle, setBoardModel } from '../three/BoardMesh.js'
import { createPiece, movePiece, removePiece, selectPiece, deselectPiece, rebuildPieces, preloadModels, preloadHiModels, preloadVicModels, updateRGBPieces, clearRGBRegistry } from '../three/PieceMesh.js'
import { initControls, updateControls, disposeControls } from '../three/CameraController.js'
import { playCaptureEffect, playCheckEffect, clearCheckEffect, playCheckmateEffect } from '../three/CaptureEffect.js'
import { playMoveSound, playCaptureSound, playQueenCaptureSound, playCheckSound, playCheckmateSound, playGameEndSound } from '../audio/sounds.js'
import { useStockfish } from '../ai/useStockfish.js'
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
  const { getMove } = useStockfish()
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
  const timerRef = useRef(null)
  const [promotionPending, setPromotionPending] = useState(null)
  const [botThinking, setBotThinking] = useState(false)

  const isMyTurn = currentTurn === myColor && !botThinkingRef.current

  // ── Three.js init ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId
    let loopActive = true

    const onVisibilityChange = () => {
      if (document.hidden) {
        loopActive = false
      } else {
        loopActive = true
        markDirty(4)
        loop()  // eslint-disable-line no-use-before-define
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    function loop() {
      if (!loopActive) return
      rafId = requestAnimationFrame(loop)
      updateControls()
      if (updateRGBPieces()) markDirty()
      if (shouldRender()) renderScene()
    }

    async function init() {
      const { scene, camera } = initScene(canvas)
      sceneRef.current = scene
      cameraRef.current = camera

      try {
        await preloadModels()
      } catch (err) {
        console.warn('GLB models failed to load, falling back to classic pieces:', err)
      }

      createBoard(scene, settings.boardStyle)
      setBoardModel(settings.boardModel ?? null)
      pieceMapRef.current = initBoardPieces(scene, settings.pieceStyle)
      controlsRef.current = initControls(camera, { domElement: canvas })
      setSceneBg(settings.bgImage ?? null)

      loop()
      animFrameRef.current = rafId
    }

    init()

    return () => {
      loopActive = false
      cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearRGBRegistry()
      disposeControls()
      disposeScene()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live board style update ──────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return
    updateBoardStyle(sceneRef.current, settings.boardStyle)
    markDirty()
  }, [settings.boardStyle])

  // ── Live piece style update ──────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return
    if (settings.pieceStyle === 'ok') {
      preloadHiModels()
        .then(() => {
          if (sceneRef.current) rebuildPieces(sceneRef.current, pieceMapRef.current, 'ok')
          markDirty()
        })
        .catch(err => console.warn('Hi model preload failed:', err))
    } else if (settings.pieceStyle === 'vic') {
      preloadVicModels()
        .then(() => {
          if (sceneRef.current) rebuildPieces(sceneRef.current, pieceMapRef.current, 'vic')
          markDirty()
        })
        .catch(err => console.warn('Vic model preload failed:', err))
    } else {
      rebuildPieces(sceneRef.current, pieceMapRef.current, settings.pieceStyle)
      markDirty()
    }
  }, [settings.pieceStyle])

  // ── Live board model update ──────────────────────────────────────────────
  useEffect(() => {
    setBoardModel(settings.boardModel ?? null)
  }, [settings.boardModel])

  // ── Live BG image update ─────────────────────────────────────────────────
  useEffect(() => {
    setSceneBg(settings.bgImage ?? null)
  }, [settings.bgImage])

  // ── Apply a move (shared between player and bot) ─────────────────────────
  const applyMove = useCallback(async (moveResult) => {
    const chess = localChessRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const map = pieceMapRef.current
    const { from, to, captured, flags, promotion, san } = moveResult
    const movedColor = moveResult.color === 'w' ? 'white' : 'black'

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

    const fen = chess.fen()

    const run = async () => {
      // getMove returns UCI format e.g. "e2e4" or "e7e8q"
      const uciMove = await getMove(fen, difficulty).catch(() => null)
        ?? getBotMove(fen, difficulty)  // fallback to local minimax if Stockfish fails

      if (!uciMove) { botThinkingRef.current = false; setBotThinking(false); return }

      const moveObj = uciMove.length === 4 || uciMove.length === 5
        ? { from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), ...(uciMove[4] && { promotion: uciMove[4] }) }
        : uciMove  // fallback minimax returns SAN

      const moveResult = chess.move(moveObj)
      if (!moveResult) { botThinkingRef.current = false; setBotThinking(false); return }

      await applyMove(moveResult)
      botThinkingRef.current = false
      setBotThinking(false)
    }

    setTimeout(run, 300)
  }, [difficulty, applyMove, getMove])

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

  const handleCanvasTouch = useCallback((e) => {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (!touch) return
    const syntheticEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY
    }
    handleCanvasClick(syntheticEvent)
  }, [handleCanvasClick])

  const handlePromotion = (p) => {
    if (!promotionPending) return
    const chess = localChessRef.current
    const moveResult = chess.move({ from: promotionPending.from, to: promotionPending.to, promotion: p })
    if (moveResult) applyMove(moveResult)
    setPromotionPending(null)
  }

  // ── Chess clock ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (gameOver) return

    const isMyTurnNow = currentTurn === myColor
    if (isMyTurnNow) {
      timerRef.current = setInterval(() => {
        setMyTimeMs(prev => {
          const next = Math.max(0, prev - 100)
          if (next <= 0) {
            clearInterval(timerRef.current)
            setGameOver({ winner: botColor, reason: 'timeout' })
            playGameEndSound('lose')
            setTimeout(() => navigate('/'), 3000)
          }
          return next
        })
      }, 100)
    } else {
      timerRef.current = setInterval(() => {
        setBotTimeMs(prev => {
          const next = Math.max(0, prev - 100)
          if (next <= 0) {
            clearInterval(timerRef.current)
            setGameOver({ winner: myColor, reason: 'timeout' })
            playGameEndSound('win')
            setTimeout(() => navigate('/'), 3000)
          }
          return next
        })
      }, 100)
    }

    return () => clearInterval(timerRef.current)
  }, [currentTurn, gameOver]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resign ────────────────────────────────────────────────────────────────
  const handleBotResign = () => {
    setGameOver({ winner: botColor, reason: 'resignation' })
    playGameEndSound('lose')
    setTimeout(() => navigate('/'), 3000)
  }

  return (
    <div className="w-full h-full flex flex-col bg-obsidian overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 h-12 flex items-center justify-between px-4" style={{ background: '#14141F', borderBottom: '1px solid #2A2A3C' }}>
        <span className="font-cinzel text-gold text-lg tracking-widest flex-shrink-0">REGICIDE</span>
        <div className="flex flex-1 min-w-0 justify-center items-center gap-2 text-ash font-mono text-xs">
          <span className={currentTurn === 'white' ? 'text-ivory' : 'text-ash'}>White</span>
          <span className="text-carbon">·</span>
          <span className={currentTurn === 'black' ? 'text-ivory' : 'text-ash'}>Black</span>
          <span className="text-carbon ml-3 hidden sm:inline">·</span>
          <span className={`ml-1 hidden sm:inline ${isMyTurn ? 'text-gold' : 'text-ash'}`}>
            {botThinking ? 'Bot thinking...' : isMyTurn ? 'Your turn' : "Bot's turn"}
          </span>
          <span className="text-carbon ml-2 hidden sm:inline">·</span>
          <span className="text-ash ml-1 capitalize hidden sm:inline">{difficulty}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Settings gear */}
          <div className="relative">
            {settingsOpen && (
              <div
                className="fixed inset-0 z-40"
                onPointerDown={() => setSettingsOpen(false)}
              />
            )}
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className="relative z-50 text-ash hover:text-gold font-inter text-sm transition-colors px-2"
              title="Customize"
            >
              ⚙
            </button>
            {settingsOpen && (
              <div
                className="absolute top-full right-0 mt-1 p-4 rounded-xl z-50"
                style={{ background: '#14141F', border: '1px solid #2A2A3C', width: 260 }}
              >
                <p className="text-ash font-inter text-xs tracking-widest uppercase mb-3">Customize</p>

                <p className="text-ivory font-inter text-xs mb-2">Piece Style</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[
                    { id: 'glb',   label: 'GLB',   desc: '3D model' },
                    { id: 'retro', label: 'Retro', desc: '3D retro' },
                    { id: 'ok',    label: 'OK',    desc: 'Hi twins' },
                    { id: 'vic',   label: 'Vic',   desc: 'Victorian' },
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSettings(prev => ({ ...prev, pieceStyle: s.id }))}
                      style={{ width: 'calc(33% - 6px)' }}
                      className={`py-2 px-1 rounded text-xs font-inter border transition-all text-center
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
                    { id: 'blush',  label: 'Blush',  color: '#695a5b' },
                    { id: 'dawn',   label: 'Dawn',   color: '#c6cfe0' },
                    { id: 'pearl',  label: 'Pearl',  color: '#ead7d1' },
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

                <p className="text-ivory font-inter text-xs mt-3 mb-2">Board Model</p>
                <div className="flex gap-2 mb-3">
                  {[
                    { id: null,       label: 'Default' },
                    { id: 'pink',     label: 'Pink' },
                    { id: 'historic', label: 'Historic' },
                    { id: 'vic',      label: 'Vic' },
                  ].map(bm => (
                    <button
                      key={bm.id ?? 'default'}
                      onClick={() => setSettings(prev => ({ ...prev, boardModel: bm.id }))}
                      style={{ flex: 1 }}
                      className={`py-2 px-1 rounded text-xs font-inter border transition-all text-center
                        ${settings.boardModel === bm.id
                          ? 'border-gold text-gold bg-charcoal'
                          : 'border-carbon text-ash hover:border-ash hover:text-ivory'}`}
                    >
                      {bm.label}
                    </button>
                  ))}
                </div>

                <p className="text-ivory font-inter text-xs mt-3 mb-2">Background</p>
                <div className="flex gap-2">
                  {[
                    { id: null,                   label: 'None' },
                    { id: '/bg/golden-smoke.jpg', label: 'Nebula' },
                    { id: '/bg/galaxy1.jpg',      label: 'Galaxy I' },
                    { id: '/bg/galaxy2.jpg',      label: 'Galaxy II' },
                    { id: '/bg/ball-room.jpg',    label: 'Ballroom' },
                    { id: '/bg/hall-way.jpg',     label: 'Hall Way' },
                  ].map(bg => (
                    <button
                      key={bg.id ?? 'none'}
                      onClick={() => setSettings(prev => ({ ...prev, bgImage: bg.id }))}
                      style={{
                        flex: 1,
                        height: 52,
                        backgroundImage: bg.id ? `url(${bg.id})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                      className={`relative rounded border transition-all overflow-hidden
                        ${settings.bgImage === bg.id
                          ? 'border-gold'
                          : 'border-carbon hover:border-ash'}`}
                    >
                      {!bg.id && <span className="text-ash text-xs">None</span>}
                      <div className="absolute bottom-0 left-0 right-0 py-0.5 text-center text-xs text-ivory font-inter"
                        style={{ background: 'rgba(0,0,0,0.6)' }}>
                        {bg.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => navigate('/')} className="text-ash hover:text-ivory font-inter text-xs transition-colors">✕ Exit</button>
        </div>
      </div>

      {/* Main area — desktop: row, mobile: column */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

        {/* Opponent (bot) panel — mobile: top strip */}
        <div className="lg:hidden flex-shrink-0 px-3 py-2 flex items-center justify-between"
             style={{ background: '#14141F', borderBottom: '1px solid #2A2A3C' }}>
          <PlayerPanel
            name={`Bot (${difficulty})`}
            rating={{ beginner: 800, casual: 1000, club: 1300, advanced: 1600, expert: 1900, master: 2200 }[difficulty] ?? 1200}
            timeMs={botTimeMs}
            isActive={currentTurn === botColor}
            isInCheck={isCheck && currentTurn === botColor}
            captures={capturedPieces[botColor] || []}
            color={botColor}
            compact
          />
        </div>
        {/* Left sidebar — desktop only */}
        <div className="hidden lg:flex flex-col justify-between py-3 px-2 flex-shrink-0" style={{ width: 220, borderRight: '1px solid #2A2A3C', background: '#14141F' }}>
          <PlayerPanel
            name={`Bot (${difficulty})`}
            rating={{ beginner: 800, casual: 1000, club: 1300, advanced: 1600, expert: 1900, master: 2200 }[difficulty] ?? 1200}
            timeMs={botTimeMs}
            isActive={currentTurn === botColor}
            isInCheck={isCheck && currentTurn === botColor}
            captures={capturedPieces[botColor] || []}
            color={botColor}
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
          />
        </div>

        {/* Center: canvas */}
        <div className="flex-1 relative min-w-0 min-h-0">
          <CheckBanner isInCheck={isCheck && currentTurn === myColor} isCheckmate={isCheckmate} />
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            onClick={handleCanvasClick}
            onTouchEnd={handleCanvasTouch}
            style={{ cursor: isMyTurn ? 'crosshair' : 'default', touchAction: 'none' }}
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

        {/* Right: move log — desktop only */}
        <div className="hidden lg:block flex-shrink-0" style={{ width: 200 }}>
          <MoveLog
            moves={moves}
            onFlipBoard={() => {}}
            onResign={handleBotResign}
            onOfferDraw={() => {}}
          />
        </div>

        {/* My panel + controls — mobile only, bottom strip */}
        <div className="lg:hidden flex-shrink-0 px-3 py-2 flex items-center justify-between gap-2"
             style={{ background: '#14141F', borderTop: '1px solid #2A2A3C' }}>
          <PlayerPanel
            name={playerInfo?.name || 'You'}
            rating={playerInfo?.rating || 1200}
            timeMs={myTimeMs}
            isActive={currentTurn === myColor}
            isInCheck={isCheck && currentTurn === myColor}
            captures={capturedPieces[myColor] || []}
            color={myColor}
            compact
          />
          <div className="flex gap-2">
            <button onClick={handleBotResign}
              className="px-3 py-1.5 text-ash border border-carbon rounded font-inter text-xs hover:border-ivory hover:text-ivory transition-colors">
              Resign
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
