import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { createPiece } from '../three/PieceMesh.js'
import { useSocket } from '../hooks/useSocket.js'

const PLAYER_ID_KEY = 'regicide_player_id'

function getOrCreatePlayerId() {
  // sessionStorage is tab-scoped — each tab gets a unique playerId
  let id = sessionStorage.getItem(PLAYER_ID_KEY)
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 10)
    sessionStorage.setItem(PLAYER_ID_KEY, id)
  }
  return id
}

export default function MatchmakingScreen({ playerInfo }) {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const { emit, on } = useSocket()

  const [elapsed, setElapsed] = useState(0)
  const [ratingRange, setRatingRange] = useState(150)
  const [matchFound, setMatchFound] = useState(null)
  const [countdown, setCountdown] = useState(3)
  const [gameData, setGameData] = useState(null)

  const animFrameRef = useRef(null)
  const startTimeRef = useRef(Date.now())

  // Spinning knight canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const w = canvas.clientWidth || 200
    const h = canvas.clientHeight || 200

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 50)
    camera.position.set(0, 1, 3.5)
    camera.lookAt(0, 0.4, 0)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    scene.add(new THREE.AmbientLight('#ffffff', 0.6))
    const dir = new THREE.DirectionalLight('#C8A96E', 1.5)
    dir.position.set(3, 5, 3)
    scene.add(dir)
    const rim = new THREE.DirectionalLight('#5C6BC0', 0.8)
    rim.position.set(-3, 2, -2)
    scene.add(rim)

    const knight = createPiece('n', 'white', 'e4', scene)
    // Move knight to center
    if (knight) {
      knight.position.set(0, 0, 0)
    }

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)
      if (knight) knight.rotation.y += 0.02
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      // M9: Dispose knight mesh geometry/materials before releasing the renderer
      if (knight) {
        knight.traverse(child => {
          if (child.isMesh) {
            child.geometry.dispose()
            child.material.dispose()
          }
        })
        scene.remove(knight)
      }
      renderer.dispose()
    }
  }, [])

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000)
      setElapsed(sec)
      setRatingRange(150 + Math.floor(sec / 30) * 50)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Socket events — run once on mount only; capture playerInfo at mount time
  useEffect(() => {
    const playerId = getOrCreatePlayerId()
    const name = playerInfo.name || 'Guest'
    const rating = playerInfo.rating || 1200

    emit('join_queue', { playerId, rating, name })

    const offMatchFound = on('match_found', (data) => {
      setMatchFound(data)
    })

    const offGameStart = on('game_start', (data) => {
      setGameData(data)
    })

    return () => {
      offMatchFound?.()
      offGameStart?.()
      emit('leave_queue', { playerId })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Countdown when match found
  useEffect(() => {
    if (!matchFound) return

    let count = 3
    setCountdown(count)
    const interval = setInterval(() => {
      count -= 1
      setCountdown(count)
      if (count <= 0) {
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [matchFound])

  // Navigate to game when game_start fires
  useEffect(() => {
    if (!gameData || !matchFound) return
    // Store game context for GameScreen
    sessionStorage.setItem('game_data', JSON.stringify({
      gameId: gameData.gameId || matchFound.gameId,
      color: gameData.color || matchFound.color,
      opponent: matchFound.opponent,
      playerId: getOrCreatePlayerId(),
      playerName: playerInfo.name,
      playerRating: playerInfo.rating
    }))
    navigate('/game')
  }, [gameData, matchFound, navigate, playerInfo])

  const handleCancel = () => {
    emit('leave_queue', { playerId: getOrCreatePlayerId() })
    navigate('/')
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-obsidian">
      {/* Match found overlay */}
      {matchFound && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(13,13,15,0.92)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="text-center p-10 rounded-xl"
            style={{ background: '#14141F', border: '1px solid #C8A96E', boxShadow: '0 0 60px rgba(200,169,110,0.2)' }}
          >
            <p className="text-ash font-inter text-sm tracking-widest mb-2 uppercase">Opponent Found</p>
            <h2 className="font-cinzel text-gold text-4xl mb-1">{matchFound.opponent?.name}</h2>
            <p className="text-ash font-mono text-sm mb-6">Rating: {matchFound.opponent?.rating}</p>
            <p className="text-ivory font-inter text-sm mb-4">
              You play as <span className={matchFound.color === 'white' ? 'text-ivory font-bold' : 'text-carbon font-bold'}>
                {matchFound.color}
              </span>
            </p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-ash font-inter text-sm">Starting in</span>
              <span className="font-cinzel text-gold text-5xl w-16 text-center">{countdown}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main panel */}
      <div
        className="flex flex-col items-center p-10 rounded-xl w-full max-w-sm"
        style={{ background: '#14141F', border: '1px solid #2A2A3C' }}
      >
        {/* Spinning knight */}
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          style={{ width: 160, height: 160 }}
          className="mb-6"
        />

        <h2 className="font-cinzel text-ivory text-2xl tracking-widest mb-1">FINDING OPPONENT</h2>

        <div className="font-mono text-gold text-3xl tracking-widest mb-2">
          {fmt(elapsed)}
        </div>

        <div className="text-ash font-inter text-sm mb-6 text-center">
          Rating range: <span className="text-ivory">{playerInfo.rating - ratingRange}–{playerInfo.rating + ratingRange}</span>
          <br />
          <span className="text-xs">(expands ±50 every 30s)</span>
        </div>

        {/* Animated searching dots */}
        <div className="flex gap-2 mb-8">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-gold animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>

        <button
          onClick={handleCancel}
          className="w-full py-3 px-6 border border-carbon text-ash font-inter text-sm rounded tracking-widest hover:border-crimson hover:text-crimson transition-colors"
        >
          CANCEL
        </button>
      </div>
    </div>
  )
}
