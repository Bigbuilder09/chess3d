import React, {
  useEffect, useRef, useState, useCallback
} from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { initScene, renderScene, disposeScene, getScene, getCamera } from '../three/ChessScene.js'
import { createBoard, squareToWorld, worldToSquare, highlightSquare, clearAllHighlights, showLegalDots, clearLegalDots, getBoardGroup, updateBoardStyle } from '../three/BoardMesh.js'
import { createPiece, movePiece, removePiece, selectPiece, deselectPiece, rebuildPieces, preloadModels, preloadHiModels } from '../three/PieceMesh.js'
import { initControls, updateControls, disposeControls, flipCamera } from '../three/CameraController.js'
import { playCaptureEffect, playCheckEffect, clearCheckEffect, playCheckmateEffect } from '../three/CaptureEffect.js'
import { playMoveSound, playCaptureSound, playQueenCaptureSound, playCheckSound, playCheckmateSound, playGameEndSound } from '../audio/sounds.js'
import { useSocket } from '../hooks/useSocket.js'
import { useChessGame } from '../hooks/useChessGame.js'
import PlayerPanel from './PlayerPanel.jsx'
import MoveLog from './MoveLog.jsx'
import CheckBanner from './CheckBanner.jsx'

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const INITIAL_TIME = 10 * 60 * 1000 // 10 min in ms

// Map FEN board state to Three.js pieces
function initBoardPieces(scene, style = 'classic') {
  const pieceMap = {} // square → Group
  const startLayout = [
    // Black back rank
    ['r','n','b','q','k','b','n','r'].map((t, i) => ({
      type: t, color: 'black',
      sq: String.fromCharCode(97 + i) + '8'
    })),
    // Black pawns
    Array.from({ length: 8 }, (_, i) => ({
      type: 'p', color: 'black',
      sq: String.fromCharCode(97 + i) + '7'
    })),
    // White pawns
    Array.from({ length: 8 }, (_, i) => ({
      type: 'p', color: 'white',
      sq: String.fromCharCode(97 + i) + '2'
    })),
    // White back rank
    ['r','n','b','q','k','b','n','r'].map((t, i) => ({
      type: t, color: 'white',
      sq: String.fromCharCode(97 + i) + '1'
    })),
  ].flat()

  startLayout.forEach(({ type, color, sq }) => {
    const piece = createPiece(type, color, sq, scene, style)
    if (piece) pieceMap[sq] = piece
  })
  return pieceMap
}

export default function GameScreen({ setGameResult, playerInfo, settings, setSettings }) {
  const navigate = useNavigate()
  const canvasRef    = useRef(null)
  const animFrameRef = useRef(null)
  const pieceMapRef  = useRef({}) // square → THREE.Group
  const sceneRef     = useRef(null)
  const cameraRef    = useRef(null)
  const controlsRef  = useRef(null)
  const raycaster    = useRef(new THREE.Raycaster())
  const mouse        = useRef(new THREE.Vector2())
  const isAnimating  = useRef(false)
  // Keep a ref to latest settings so async callbacks always see current values
  const settingsRef  = useRef(settings)

  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // Game context from session storage
  const [gameCtx] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('game_data') || '{}')
    } catch { return {} }
  })

  const myColor    = gameCtx.color    || 'white'
  const gameId     = gameCtx.gameId   || ''
  const playerId   = gameCtx.playerId || ''
  const opponent   = gameCtx.opponent || { name: 'Opponent', rating: 1200 }

  const { emit, on } = useSocket()

  const {
    moves,
    isCheck,
    isCheckmate,
    selectedSquare,
    legalMoves,
    capturedPieces,
    gameOver,
    setGameOver,
    applyServerMove,
    selectSquare,
    clearSelection,
    getBoardState
  } = useChessGame(myColor)

  const [myTimeMs,  setMyTimeMs]  = useState(INITIAL_TIME)
  const [oppTimeMs, setOppTimeMs] = useState(INITIAL_TIME)
  const [currentTurn, setCurrentTurn] = useState('white') // whose turn
  const [drawOffered, setDrawOffered] = useState(false)
  const [myDrawOfferSent, setMyDrawOfferSent] = useState(false)
  const [isBoardFlipped, setIsBoardFlipped] = useState(myColor === 'black')
  const [promotionPending, setPromotionPending] = useState(null) // { from, to }

  const isMyTurn = currentTurn === myColor

  // M10: Stable ref so socket listeners always call the latest handleGameOver
  const handleGameOverRef = useRef()

  // ─── Three.js init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId
    async function init() {
      const { scene, camera } = initScene(canvas)
      sceneRef.current  = scene
      cameraRef.current = camera

      try {
        await preloadModels()
      } catch (err) {
        console.warn('GLB models failed to load, falling back to classic pieces:', err)
      }

      createBoard(scene, settings.boardStyle)
      pieceMapRef.current = initBoardPieces(scene, settings.pieceStyle)
      controlsRef.current = initControls(camera, { domElement: canvas })

      // Flip camera for black player
      if (myColor === 'black') {
        camera.position.set(0, 8, -10)
        camera.lookAt(0, 0, 0)
      }

      function loop() {
        rafId = requestAnimationFrame(loop)
        updateControls()
        renderScene()
      }
      loop()
      animFrameRef.current = rafId
    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      disposeControls()
      disposeScene()
    }
  }, [myColor]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Live board style update ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return
    updateBoardStyle(sceneRef.current, settings.boardStyle)
  }, [settings.boardStyle])

  // ─── Live piece style update ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return
    rebuildPieces(sceneRef.current, pieceMapRef.current, settings.pieceStyle)
  }, [settings.pieceStyle])

  // ─── Socket event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const off1 = on('move_made', async (data) => {
      const { from, to, captured, isCheck: check, isCheckmate: mate } = data

      applyServerMove(data)
      setCurrentTurn(prev => prev === 'white' ? 'black' : 'white')

      const scene    = sceneRef.current
      const camera   = cameraRef.current
      const controls = controlsRef.current
      const map      = pieceMapRef.current

      const movingPiece = map[from]
      if (!movingPiece) return

      // M2: En passant
      if (captured) {
        if (data.flags?.includes('e')) {
          const enPassantSquare = to[0] + from[1]
          const capturedMesh = map[enPassantSquare]
          if (capturedMesh) {
            delete map[enPassantSquare]
            if (scene) {
              await removePiece(capturedMesh, scene)
              playCaptureEffect(scene, controls, enPassantSquare, PIECE_VALUES[captured] || 1)
            }
          }
        } else if (map[to]) {
          const capturedMesh = map[to]
          delete map[to]
          if (scene) {
            await removePiece(capturedMesh, scene)
            playCaptureEffect(scene, controls, to, PIECE_VALUES[captured] || 1)
          }
        }
      }

      // Move king (and rook for castling) simultaneously (M3)
      if (movingPiece && scene) {
        map[to] = movingPiece
        delete map[from]
        movingPiece.userData.square = to

        const animations = [movePiece(movingPiece, to)]

        // M3: Castling — also animate the rook
        if (data.flags?.includes('k') || data.flags?.includes('q')) {
          const movedColor = data.fen.split(' ')[1] === 'b' ? 'white' : 'black'
          const isKingside = data.flags.includes('k')
          const rookFrom = isKingside
            ? (movedColor === 'white' ? 'h1' : 'h8')
            : (movedColor === 'white' ? 'a1' : 'a8')
          const rookTo = isKingside
            ? (movedColor === 'white' ? 'f1' : 'f8')
            : (movedColor === 'white' ? 'd1' : 'd8')
          const rookMesh = map[rookFrom]
          if (rookMesh) {
            map[rookTo] = rookMesh
            delete map[rookFrom]
            rookMesh.userData.square = rookTo
            animations.push(movePiece(rookMesh, rookTo))
          }
        }

        await Promise.all(animations)
      }

      // M4: Promotion — swap pawn mesh for the promoted piece type
      if (data.promotion && scene) {
        const pawnMesh = map[to]
        if (pawnMesh) {
          scene.remove(pawnMesh)
          pawnMesh.traverse(child => {
            if (child.isMesh) {
              child.geometry.dispose()
              const mats = Array.isArray(child.material) ? child.material : [child.material]
              mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose() })
            }
          })
          delete map[to]
        }
        const movedColor = data.fen.split(' ')[1] === 'b' ? 'white' : 'black'
        const newPiece = createPiece(data.promotion, movedColor, to, scene, settingsRef.current.pieceStyle)
        if (newPiece) {
          newPiece.userData.square = to
          map[to] = newPiece
        }
      }

      // Play sounds
      if (captured) {
        if (captured === 'q') playQueenCaptureSound()
        else playCaptureSound()
      } else {
        playMoveSound()
      }
      if (mate) {
        playCheckmateSound()
      } else if (check) {
        playCheckSound()
      }

      // Handle check
      if (check && !mate) {
        const kingColor = data.fen.split(' ')[1] === 'b' ? 'black' : 'white'
        const kingSquare = findKingSquare(kingColor)
        const kingMesh = kingSquare ? map[kingSquare] : null
        if (scene) playCheckEffect(scene, kingMesh)
      } else {
        if (scene) clearCheckEffect(scene)
      }

      // Checkmate effect
      if (mate && scene && controls) {
        const kingColor = data.fen.split(' ')[1] === 'b' ? 'black' : 'white'
        const kingSquare = findKingSquare(kingColor)
        const kingMesh = kingSquare ? map[kingSquare] : null
        playCheckmateEffect(scene, controls, kingMesh)
      }

      clearAllHighlights()
      clearLegalDots()
    })

    const off2 = on('invalid_move', ({ from, to }) => {
      console.warn('Invalid move:', from, to)
    })

    const off3 = on('draw_offered', () => {
      setDrawOffered(true)
    })

    const off4 = on('draw_accepted', () => {
      handleGameOverRef.current({ reason: 'draw', winner: null })
    })

    const off5 = on('draw_declined', () => {
      setDrawOffered(false)
      setMyDrawOfferSent(false)
    })

    const offDrawSent = on('draw_offer_sent', () => setMyDrawOfferSent(true))

    const off6 = on('opponent_disconnected', () => {
      handleGameOverRef.current({ reason: 'disconnect', winner: myColor })
    })

    const off7 = on('game_over', (data) => {
      handleGameOverRef.current(data)
    })

    return () => {
      off1?.(); off2?.(); off3?.(); off4?.(); off5?.(); off6?.(); off7?.(); offDrawSent?.()
    }
  }, [on, applyServerMove, myColor]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Find king square (from pieceMap) ────────────────────────────────────────
  function findKingSquare(color) {
    for (const [sq, mesh] of Object.entries(pieceMapRef.current)) {
      if (mesh.userData.pieceType === 'k' && mesh.userData.color === color) {
        return sq
      }
    }
    return null
  }

  // ─── Game over ───────────────────────────────────────────────────────────────
  const handleGameOver = useCallback((go) => {
    setGameOver(go)
    setMyDrawOfferSent(false)
    setDrawOffered(false)
    const outcome =
      go.winner === myColor ? 'win' :
      go.winner === null    ? 'draw' :
      'lose'

    playGameEndSound(outcome)

    setGameResult({
      outcome,
      reason: go.reason,
      stats: {
        moves: moves.length * 2,
      }
    })

    setTimeout(() => navigate('/end'), 2500)
  }, [myColor, moves, navigate, setGameResult, setGameOver])

  handleGameOverRef.current = handleGameOver

  // ─── Raycasting / click handling ─────────────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    if (!isMyTurn || isAnimating.current) return
    if (gameOver) return

    const canvas = canvasRef.current
    const camera = cameraRef.current
    const scene  = sceneRef.current
    if (!canvas || !camera || !scene) return

    const rect = canvas.getBoundingClientRect()
    mouse.current.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
    mouse.current.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1

    raycaster.current.setFromCamera(mouse.current, camera)

    const intersects = raycaster.current.intersectObjects(scene.children, true)

    let clickedSquare = null

    for (const hit of intersects) {
      let obj = hit.object
      while (obj) {
        if (obj.userData?.square) {
          clickedSquare = obj.userData.square
          break
        }
        if (obj.userData?.isSquare) {
          clickedSquare = obj.userData.square
          break
        }
        if (obj.userData?.legalSquare) {
          clickedSquare = obj.userData.legalSquare
          break
        }
        obj = obj.parent
      }
      if (clickedSquare) break
    }

    if (!clickedSquare) {
      const boardHits = raycaster.current.intersectObjects(
        Object.values(getBoardGroup()?.children || []), false
      )
      for (const hit of boardHits) {
        if (hit.object.userData?.square) {
          clickedSquare = hit.object.userData.square
          break
        }
      }
    }

    if (!clickedSquare) {
      if (selectedSquare) {
        deselectPiece(pieceMapRef.current[selectedSquare])
        clearSelection()
        clearAllHighlights()
        clearLegalDots()
      }
      return
    }

    const result = selectSquare(clickedSquare)

    if (!result) {
      if (selectedSquare && pieceMapRef.current[selectedSquare]) {
        deselectPiece(pieceMapRef.current[selectedSquare])
      }
      clearAllHighlights()
      clearLegalDots()
      return
    }

    if (result.isMove) {
      if (selectedSquare && pieceMapRef.current[selectedSquare]) {
        deselectPiece(pieceMapRef.current[selectedSquare])
      }
      clearAllHighlights()
      clearLegalDots()

      const needPromo = checkPromotion(result.from, result.to)
      if (needPromo) {
        setPromotionPending({ from: result.from, to: result.to })
        return
      }

      emitMove(result.from, result.to)
    } else if (result.selected) {
      clearAllHighlights()
      clearLegalDots()

      if (selectedSquare && selectedSquare !== result.selected && pieceMapRef.current[selectedSquare]) {
        deselectPiece(pieceMapRef.current[selectedSquare])
      }

      highlightSquare(result.selected, '#C8A96E', 0.4)
      showLegalDots(result.legalMoves || [])

      if (pieceMapRef.current[result.selected]) {
        selectPiece(pieceMapRef.current[result.selected])
      }
    }
  }, [isMyTurn, gameOver, selectedSquare, selectSquare, clearSelection])

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

  function checkPromotion(from, to) {
    const piece = pieceMapRef.current[from]
    if (!piece || piece.userData.pieceType !== 'p') return false
    const toRank = parseInt(to[1])
    return (piece.userData.color === 'white' && toRank === 8) ||
           (piece.userData.color === 'black' && toRank === 1)
  }

  const emitMove = useCallback((from, to, promotion = 'q') => {
    emit('move_piece', { gameId, playerId, from, to, promotion })
  }, [emit, gameId, playerId])

  const handlePromotion = (piece) => {
    if (!promotionPending) return
    emitMove(promotionPending.from, promotionPending.to, piece)
    setPromotionPending(null)
  }

  // ─── Board flip ──────────────────────────────────────────────────────────────
  const handleFlipBoard = () => {
    setIsBoardFlipped(f => !f)
    if (cameraRef.current) {
      flipCamera(cameraRef.current)
    }
  }

  // ─── Resign / Draw ───────────────────────────────────────────────────────────
  const handleResign = () => {
    emit('resign', { gameId, playerId })
  }

  const handleOfferDraw = () => {
    if (myDrawOfferSent) return
    emit('offer_draw', { gameId, playerId })
  }

  const handleAcceptDraw = () => {
    emit('offer_draw', { gameId, playerId })
    setDrawOffered(false)
  }

  const handleDeclineDraw = () => {
    emit('decline_draw', { gameId, playerId })
    setDrawOffered(false)
  }

  // ─── Panel props ─────────────────────────────────────────────────────────────
  const myPanelProps = {
    name: playerInfo?.name || gameCtx.playerName || 'You',
    rating: playerInfo?.rating || gameCtx.playerRating || 1200,
    timeMs: myTimeMs,
    isActive: isMyTurn,
    isInCheck: isCheck && currentTurn === myColor,
    captures: capturedPieces[myColor] || [],
    color: myColor,
    onTick: (t) => setMyTimeMs(t),
    onTimeout: () => emit('timeout', { gameId, playerId })
  }

  const oppPanelProps = {
    name: opponent.name,
    rating: opponent.rating,
    timeMs: oppTimeMs,
    isActive: !isMyTurn,
    isInCheck: isCheck && currentTurn !== myColor,
    captures: capturedPieces[myColor === 'white' ? 'black' : 'white'] || [],
    color: myColor === 'white' ? 'black' : 'white',
    onTick: (t) => setOppTimeMs(t)
  }

  return (
    <div className="w-full h-full flex flex-col bg-obsidian overflow-hidden">
      {/* Top bar */}
      <div
        className="flex-shrink-0 h-12 flex items-center justify-between px-4"
        style={{ background: '#14141F', borderBottom: '1px solid #2A2A3C' }}
      >
        <span className="font-cinzel text-gold text-lg tracking-widest">REGICIDE</span>
        <div className="flex items-center gap-2 text-ash font-mono text-xs">
          <span className={currentTurn === 'white' ? 'text-ivory' : 'text-ash'}>White</span>
          <span className="text-carbon">·</span>
          <span className={currentTurn === 'black' ? 'text-ivory' : 'text-ash'}>Black</span>
          <span className="text-carbon ml-3">·</span>
          <span className={`ml-1 ${isMyTurn ? 'text-gold' : 'text-ash'}`}>
            {isMyTurn ? 'Your turn' : "Opponent's turn"}
          </span>
        </div>
        <div className="flex items-center gap-2">
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
                    { id: 'glb',     label: 'GLB',      desc: '3D model' },
                    { id: 'retro',   label: 'Retro',    desc: '3D retro' },
                    { id: 'fun',     label: 'Fun',      desc: 'Aura glow' },
                    { id: 'hi',      label: 'Hi',       desc: 'Neon glow' },
                    { id: 'classic', label: 'Classic',  desc: '3D shapes' },
                    { id: 'symbol',  label: 'Symbol',   desc: '♛ disc' },
                    { id: 'lowpoly', label: 'Low-poly', desc: 'Geometric' },
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => { if (s.id === 'hi') preloadHiModels(); setSettings(prev => ({ ...prev, pieceStyle: s.id })) }}
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
            )}
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-ash hover:text-ivory font-inter text-xs transition-colors"
          >
            ✕ Exit
          </button>
        </div>
      </div>

      {/* Main area — desktop: row, mobile: column */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">

        {/* Opponent panel — mobile: top strip */}
        <div className="md:hidden flex-shrink-0 px-3 py-2 flex items-center justify-between"
             style={{ background: '#14141F', borderBottom: '1px solid #2A2A3C' }}>
          <PlayerPanel {...oppPanelProps} compact />
        </div>
        {/* Left sidebar — desktop only */}
        <div className="hidden md:flex flex-col justify-between py-3 px-2 flex-shrink-0"
             style={{ width: 220, borderRight: '1px solid #2A2A3C', background: '#14141F' }}>
          <PlayerPanel {...oppPanelProps} />
          <div className="flex-1" />
          <PlayerPanel {...myPanelProps} />
        </div>

        {/* Center: Three.js canvas */}
        <div className="flex-1 relative min-w-0 min-h-0">
          <CheckBanner isInCheck={isCheck && currentTurn === myColor} isCheckmate={isCheckmate} />

          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            onClick={handleCanvasClick}
            onTouchEnd={handleCanvasTouch}
            style={{ cursor: isMyTurn ? 'crosshair' : 'default', touchAction: 'none' }}
          />

          {/* Draw offer banner */}
          {drawOffered && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-xl"
              style={{ background: '#14141F', border: '1px solid #C8A96E' }}
            >
              <span className="text-ivory font-inter text-sm">Opponent offers a draw</span>
              <button
                onClick={handleAcceptDraw}
                className="px-3 py-1.5 bg-gold text-obsidian font-inter text-sm font-medium rounded hover:brightness-110 transition-all"
              >
                Accept
              </button>
              <button
                onClick={handleDeclineDraw}
                className="px-3 py-1.5 border border-carbon text-ash font-inter text-sm rounded hover:border-ash hover:text-ivory transition-colors"
              >
                Decline
              </button>
            </div>
          )}

          {/* Promotion picker */}
          {promotionPending && (
            <div
              className="absolute inset-0 flex items-center justify-center z-40"
              style={{ background: 'rgba(13,13,15,0.85)' }}
            >
              <div
                className="p-6 rounded-xl"
                style={{ background: '#14141F', border: '1px solid #C8A96E' }}
              >
                <p className="text-ash font-inter text-sm mb-4 text-center">Promote pawn to:</p>
                <div className="flex gap-3">
                  {['q','r','b','n'].map(p => (
                    <button
                      key={p}
                      onClick={() => handlePromotion(p)}
                      className="w-14 h-14 flex items-center justify-center text-3xl rounded-lg border border-carbon hover:border-gold hover:bg-charcoal transition-all"
                    >
                      {{ q: '♛', r: '♜', b: '♝', n: '♞' }[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {gameOver && (
            <div
              className="absolute inset-0 flex items-center justify-center z-40"
              style={{ background: 'rgba(13,13,15,0.6)', backdropFilter: 'blur(4px)' }}
            >
              <div className="text-center">
                <p className="font-cinzel text-gold text-2xl tracking-widest">
                  {gameOver.winner === myColor ? 'YOU WIN' :
                   gameOver.winner === null    ? 'DRAW'   : 'GAME OVER'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: move log — desktop only */}
        <div className="hidden md:block flex-shrink-0" style={{ width: 200 }}>
          <MoveLog
            moves={moves}
            onFlipBoard={handleFlipBoard}
            onResign={handleResign}
            onOfferDraw={handleOfferDraw}
            drawOfferSent={myDrawOfferSent}
          />
        </div>

        {/* My panel + controls — mobile only, bottom strip */}
        <div className="md:hidden flex-shrink-0 px-3 py-2 flex items-center justify-between gap-2"
             style={{ background: '#14141F', borderTop: '1px solid #2A2A3C' }}>
          <PlayerPanel {...myPanelProps} compact />
          <div className="flex gap-2">
            <button onClick={handleResign}
              className="px-3 py-1.5 text-ash border border-carbon rounded font-inter text-xs hover:border-ivory hover:text-ivory transition-colors">
              Resign
            </button>
            <button onClick={handleOfferDraw}
              className="px-3 py-1.5 text-ash border border-carbon rounded font-inter text-xs hover:border-ivory hover:text-ivory transition-colors">
              Draw
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
