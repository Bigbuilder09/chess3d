import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createBoard, disposeBoard, updateBoardStyle } from '../three/BoardMesh.js'
import { createPiece, rebuildPieces, preloadModels } from '../three/PieceMesh.js'
import { useSocket } from '../hooks/useSocket.js'

export default function LandingPage({ playerInfo, setPlayerInfo, botDifficulty, setBotDifficulty, settings, setSettings }) {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const animFrameRef = useRef(null)
  const sceneRef = useRef(null)
  const pieceMapRef = useRef({})
  const [onlineCount, setOnlineCount] = useState(0)
  const [guestName, setGuestName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { on } = useSocket()

  // Three.js background scene — runs once on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0D0D0F')
    scene.fog = new THREE.FogExp2('#0D0D0F', 0.04)
    sceneRef.current = scene

    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    camera.position.set(2, 8, 12)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    renderer.outputColorSpace = THREE.SRGBColorSpace
    rendererRef.current = renderer

    // Lights
    scene.add(new THREE.AmbientLight('#ffffff', 0.4))
    const dir = new THREE.DirectionalLight('#fff8e7', 1.2)
    dir.position.set(5, 10, 5)
    dir.castShadow = true
    scene.add(dir)

    // Board — use current settings at mount time
    createBoard(scene, settings.boardStyle)

    // Place all starting pieces and track them for live style updates
    const startPos = [
      { type: 'r', color: 'black', sq: 'a8' }, { type: 'n', color: 'black', sq: 'b8' },
      { type: 'b', color: 'black', sq: 'c8' }, { type: 'q', color: 'black', sq: 'd8' },
      { type: 'k', color: 'black', sq: 'e8' }, { type: 'b', color: 'black', sq: 'f8' },
      { type: 'n', color: 'black', sq: 'g8' }, { type: 'r', color: 'black', sq: 'h8' },
      ...['a','b','c','d','e','f','g','h'].map(f => ({ type: 'p', color: 'black', sq: `${f}7` })),
      { type: 'r', color: 'white', sq: 'a1' }, { type: 'n', color: 'white', sq: 'b1' },
      { type: 'b', color: 'white', sq: 'c1' }, { type: 'q', color: 'white', sq: 'd1' },
      { type: 'k', color: 'white', sq: 'e1' }, { type: 'b', color: 'white', sq: 'f1' },
      { type: 'n', color: 'white', sq: 'g1' }, { type: 'r', color: 'white', sq: 'h1' },
      ...['a','b','c','d','e','f','g','h'].map(f => ({ type: 'p', color: 'white', sq: `${f}2` })),
    ]
    const pieceMap = {}
    startPos.forEach(({ type, color, sq }) => {
      const piece = createPiece(type, color, sq, scene, settings.pieceStyle)
      if (piece) pieceMap[sq] = piece
    })
    pieceMapRef.current = pieceMap

    // Pre-load GLB models in background so switching to glb/retro style works instantly
    preloadModels().catch(() => {})

    // Auto-rotate
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.enableZoom = false
    controls.enablePan = false
    controls.minPolarAngle = THREE.MathUtils.degToRad(30)
    controls.maxPolarAngle = THREE.MathUtils.degToRad(70)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    const handleResize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', handleResize)
      controls.dispose()

      // Dispose board geometry/materials
      disposeBoard(scene)

      // Dispose remaining piece meshes still in the scene
      const geometries = new Set()
      const materials = new Set()
      scene.traverse(child => {
        if (child.isMesh) {
          geometries.add(child.geometry)
          if (Array.isArray(child.material)) {
            child.material.forEach(m => materials.add(m))
          } else {
            materials.add(child.material)
          }
        }
      })
      geometries.forEach(g => g.dispose())
      materials.forEach(m => {
        if (m.map) m.map.dispose()
        m.dispose()
      })

      renderer.dispose()
      sceneRef.current = null
      pieceMapRef.current = {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live board style update
  useEffect(() => {
    if (!sceneRef.current) return
    updateBoardStyle(sceneRef.current, settings.boardStyle)
  }, [settings.boardStyle])

  // Live piece style update
  useEffect(() => {
    if (!sceneRef.current) return
    rebuildPieces(sceneRef.current, pieceMapRef.current, settings.pieceStyle)
  }, [settings.pieceStyle])

  // Socket online count
  useEffect(() => {
    const cleanup = on('online_count', (count) => setOnlineCount(count))
    return cleanup
  }, [on])

  const handlePlayNow = () => {
    navigate('/matchmaking')
  }

  const handlePlayGuest = () => {
    setShowNameInput(true)
  }

  const handleGuestSubmit = (e) => {
    e.preventDefault()
    const name = guestName.trim() || 'Guest'
    setPlayerInfo(prev => ({ ...prev, name }))
    navigate('/matchmaking')
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Three.js background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />

      {/* Overlay gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(13,13,15,0.6) 0%, rgba(13,13,15,0.3) 40%, rgba(13,13,15,0.8) 100%)',
          zIndex: 1
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-4">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1
            className="font-cinzel text-gold tracking-[0.3em] mb-2"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 5rem)', textShadow: '0 0 40px rgba(200,169,110,0.4)' }}
          >
            REGICIDE
          </h1>
          <p className="text-ash font-inter text-sm tracking-widest uppercase">
            3D Online Chess
          </p>
        </div>

        {/* CTA Buttons */}
        {!showNameInput ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <button
              onClick={handlePlayNow}
              className="w-full py-4 px-8 bg-gold text-obsidian font-cinzel font-bold tracking-widest text-lg rounded transition-all duration-200 hover:brightness-110 hover:scale-105 active:scale-95 shadow-lg"
              style={{ boxShadow: '0 0 30px rgba(200,169,110,0.3)' }}
            >
              PLAY NOW
            </button>
            <button
              onClick={handlePlayGuest}
              className="w-full py-3 px-8 border border-carbon text-ash font-inter tracking-widest text-sm rounded transition-all duration-200 hover:border-ash hover:text-ivory"
            >
              Play as Guest
            </button>

            {/* Separator */}
            <div className="flex items-center gap-3 my-4 w-full max-w-xs">
              <div className="flex-1 h-px" style={{background:'#2A2A3C'}} />
              <span className="text-ash font-inter text-xs">or</span>
              <div className="flex-1 h-px" style={{background:'#2A2A3C'}} />
            </div>

            {/* Bot difficulty selector */}
            <div className="flex gap-2 mb-3 w-full">
              {['easy','medium','hard'].map(d => (
                <button
                  key={d}
                  onClick={() => setBotDifficulty(d)}
                  className={`flex-1 py-1.5 text-xs font-inter rounded capitalize transition-all
                    ${botDifficulty === d
                      ? 'bg-charcoal text-ivory border border-carbon'
                      : 'text-ash border border-carbon hover:text-ivory'}`}
                >
                  {d}
                </button>
              ))}
            </div>

            <button
              onClick={() => navigate('/bot-game')}
              className="w-full py-3 border border-carbon text-ash font-inter text-sm rounded tracking-widest hover:border-ash hover:text-ivory transition-colors"
            >
              Play vs Bot
            </button>
          </div>
        ) : (
          <form onSubmit={handleGuestSubmit} className="flex flex-col items-center gap-4 w-full max-w-xs">
            <input
              autoFocus
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              className="w-full py-3 px-4 bg-charcoal border border-carbon text-ivory font-inter rounded focus:outline-none focus:border-gold transition-colors"
            />
            <button
              type="submit"
              className="w-full py-4 px-8 bg-gold text-obsidian font-cinzel font-bold tracking-widest rounded hover:brightness-110 transition-all"
            >
              ENTER
            </button>
          </form>
        )}

        {/* Stats strip */}
        <div
          className="absolute bottom-0 left-0 right-0 flex justify-center items-center gap-8 py-4 px-6"
          style={{ background: 'rgba(13,13,15,0.9)', borderTop: '1px solid #2A2A3C' }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sage animate-pulse-slow" />
            <span className="text-ash font-inter text-sm">
              <span className="text-ivory font-medium">{onlineCount}</span> players online
            </span>
          </div>
          <div className="text-carbon">|</div>
          <span className="text-ash font-inter text-sm">Matchmaking • 3D Board • Real-time</span>
        </div>
      </div>

      {/* ─── Settings gear button ─────────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-6 z-20">
        {/* Transparent overlay to close panel when clicking outside */}
        {settingsOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setSettingsOpen(false)}
          />
        )}

        {/* Floating settings panel */}
        {settingsOpen && (
          <div
            className="absolute bottom-14 right-0 p-5 rounded-xl z-50"
            style={{ background: '#14141F', border: '1px solid #2A2A3C', width: 260 }}
          >
            <p className="text-ash font-inter text-xs tracking-widest uppercase mb-4">Customize</p>

            {/* Piece style */}
            <p className="text-ivory font-inter text-xs mb-2">Piece Style</p>
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {[
                { id: 'glb',     label: 'GLB',      desc: '3D model' },
                { id: 'retro',   label: 'Retro',    desc: '3D retro' },
                { id: 'classic', label: 'Classic',  desc: '3D shapes' },
                { id: 'symbol',  label: 'Symbol',   desc: '♛ disc' },
                { id: 'lowpoly', label: 'Low-poly', desc: 'Geometric' },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSettings(prev => ({ ...prev, pieceStyle: s.id }))}
                  className={`flex-1 py-2 px-1 rounded text-xs font-inter border transition-all text-center min-w-[44px]
                    ${settings.pieceStyle === s.id
                      ? 'border-gold text-gold bg-charcoal'
                      : 'border-carbon text-ash hover:border-ash hover:text-ivory'}`}
                >
                  <div>{s.label}</div>
                  <div className="text-xs opacity-60 mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>

            {/* Board style */}
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

        {/* Gear button */}
        <button
          onClick={() => setSettingsOpen(o => !o)}
          className="relative z-50 w-10 h-10 rounded-full flex items-center justify-center border border-carbon text-ash hover:text-gold hover:border-gold transition-colors"
          style={{ background: '#14141F' }}
        >
          ⚙
        </button>
      </div>
    </div>
  )
}
