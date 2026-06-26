import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { gsap } from 'gsap'
import { squareToWorld } from './BoardMesh.js'

// ─── GLB model loader & cache ─────────────────────────────────────────────────
const draco = new DRACOLoader()
draco.setDecoderPath('/draco/')
const loader = new GLTFLoader()
loader.setDRACOLoader(draco)
const MODEL_CACHE = {}  // type → THREE.Group (template clone)

const GLB_MAP = {
  p: '/models/pawn.glb',
  r: '/models/rook.glb',
  n: '/models/knight.glb',
  b: '/models/bishop.glb',
  q: '/models/queen.glb',
  k: '/models/king.glb'
}

const RETRO_GLB_MAP = {
  p: '/models/retro_pawn.glb',
  r: '/models/retro_rook.glb',
  n: '/models/retro_knight.glb',
  b: '/models/retro_bishop.glb',
  q: '/models/retro_queen.glb',
  k: '/models/retro_king.glb'
}

const RETRO_MODEL_CACHE = {}

export function preloadModels() {
  const loadOne = (type, url, cache) =>
    new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => { cache[type] = gltf.scene; resolve() },
        undefined,
        (err) => { console.warn(`Failed to load model ${url}:`, err); resolve() }
      )
    })
  return Promise.all([
    ...Object.entries(GLB_MAP).map(([type, url]) => loadOne(type, url, MODEL_CACHE)),
    ...Object.entries(RETRO_GLB_MAP).map(([type, url]) => loadOne(type, url, RETRO_MODEL_CACHE))
  ])
}

// Gold-lacquered vs dark-steel for GLB models
const GLB_WHITE_MAT = () => new THREE.MeshPhysicalMaterial({
  color: '#C9A84C', roughness: 0.12, metalness: 0.82,
  clearcoat: 0.5, clearcoatRoughness: 0.15
})
const GLB_BLACK_MAT = () => new THREE.MeshPhysicalMaterial({
  color: '#1C2235', roughness: 0.10, metalness: 0.88,
  clearcoat: 0.7, clearcoatRoughness: 0.08
})

// Crimson vs royal-blue for retro models
const RETRO_WHITE_MAT = () => new THREE.MeshPhysicalMaterial({
  color: '#A82828', roughness: 0.22, metalness: 0.55,
  clearcoat: 0.6, clearcoatRoughness: 0.12
})
const RETRO_BLACK_MAT = () => new THREE.MeshPhysicalMaterial({
  color: '#152E70', roughness: 0.22, metalness: 0.55,
  clearcoat: 0.6, clearcoatRoughness: 0.12
})

// ─── Classic piece materials — polished ivory vs lacquered dark-walnut ─────────
const WHITE_MAT = () => new THREE.MeshPhysicalMaterial({
  color: '#F2ECD8',
  roughness: 0.18,
  metalness: 0.0,
  clearcoat: 0.85,
  clearcoatRoughness: 0.08,
})
const BLACK_MAT = () => new THREE.MeshPhysicalMaterial({
  color: '#1E2840',
  roughness: 0.18,
  metalness: 0.08,
  clearcoat: 0.90,
  clearcoatRoughness: 0.06,
})

function getMat(color) {
  return color === 'white' ? WHITE_MAT() : BLACK_MAT()
}

function addMesh(group, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  group.add(m)
  return m
}

// ─── Classic piece builders ───────────────────────────────────────────────────

function buildPawn(color) {
  const g = new THREE.Group()
  const mat = getMat(color)
  addMesh(g, new THREE.CylinderGeometry(0.22, 0.28, 0.12, 12), mat, 0, 0.06)
  addMesh(g, new THREE.CylinderGeometry(0.14, 0.2,  0.35, 10), mat, 0, 0.30)
  addMesh(g, new THREE.SphereGeometry(0.18, 10, 10),            mat, 0, 0.60)
  return g
}

function buildRook(color) {
  const g = new THREE.Group()
  const mat = getMat(color)
  addMesh(g, new THREE.CylinderGeometry(0.26, 0.32, 0.12, 12), mat, 0, 0.06)
  addMesh(g, new THREE.CylinderGeometry(0.20, 0.25, 0.48, 10), mat, 0, 0.36)
  addMesh(g, new THREE.CylinderGeometry(0.24, 0.20, 0.10, 10), mat, 0, 0.65)
  // Battlements
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.1), mat)
    b.position.set(Math.cos(angle) * 0.17, 0.80, Math.sin(angle) * 0.17)
    b.castShadow = true
    g.add(b)
  }
  return g
}

function buildKnight(color) {
  const g = new THREE.Group()
  const mat = getMat(color)
  addMesh(g, new THREE.CylinderGeometry(0.24, 0.30, 0.12, 12), mat, 0, 0.06)
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.22, 0.40, 10), mat, 0, 0.32)
  // Angled head — stylized horse
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.28), mat)
  head.position.set(0.06, 0.72, 0)
  head.rotation.z = -0.25
  head.castShadow = true
  g.add(head)
  // Snout
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.20), mat)
  snout.position.set(0.14, 0.60, 0)
  snout.castShadow = true
  g.add(snout)
  return g
}

function buildBishop(color) {
  const g = new THREE.Group()
  const mat = getMat(color)
  addMesh(g, new THREE.CylinderGeometry(0.24, 0.30, 0.12, 12), mat, 0, 0.06)
  addMesh(g, new THREE.CylinderGeometry(0.14, 0.22, 0.50, 10), mat, 0, 0.37)
  addMesh(g, new THREE.SphereGeometry(0.14, 10, 10),            mat, 0, 0.66)
  addMesh(g, new THREE.ConeGeometry(0.10, 0.32, 8),             mat, 0, 0.92)
  addMesh(g, new THREE.SphereGeometry(0.05, 8, 8),              mat, 0, 1.10)
  return g
}

function buildQueen(color) {
  const g = new THREE.Group()
  const mat = getMat(color)
  addMesh(g, new THREE.CylinderGeometry(0.28, 0.35, 0.12, 14), mat, 0, 0.06)
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.26, 0.55, 12), mat, 0, 0.40)
  addMesh(g, new THREE.SphereGeometry(0.22, 12, 12),            mat, 0, 0.76)
  addMesh(g, new THREE.CylinderGeometry(0.18, 0.22, 0.15, 10), mat, 0, 0.98)
  // Crown points
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.20, 6), mat)
    cone.position.set(Math.cos(angle) * 0.15, 1.14, Math.sin(angle) * 0.15)
    cone.castShadow = true
    g.add(cone)
  }
  return g
}

function buildKing(color) {
  const g = new THREE.Group()
  const mat = getMat(color)
  addMesh(g, new THREE.CylinderGeometry(0.28, 0.35, 0.12, 14), mat, 0, 0.06)
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.26, 0.60, 12), mat, 0, 0.42)
  addMesh(g, new THREE.CylinderGeometry(0.22, 0.18, 0.12, 10), mat, 0, 0.78)
  // Cross vertical
  addMesh(g, new THREE.BoxGeometry(0.08, 0.38, 0.08), mat, 0, 1.05)
  // Cross horizontal
  addMesh(g, new THREE.BoxGeometry(0.28, 0.08, 0.08), mat, 0, 1.16)
  return g
}

const CLASSIC_BUILDERS = {
  p: buildPawn,
  r: buildRook,
  n: buildKnight,
  b: buildBishop,
  q: buildQueen,
  k: buildKing
}

// ─── Symbol style ─────────────────────────────────────────────────────────────

const SYMBOLS = {
  white: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  black: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
}

function createSymbolTexture(type, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  const bg = color === 'white' ? '#F0EAD6' : '#1A1A2A'
  const fg = color === 'white' ? '#0D0D0F' : '#F0EAD6'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 128, 128)

  ctx.fillStyle = fg
  ctx.font = 'bold 80px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(SYMBOLS[color][type.toLowerCase()] || '?', 64, 68)

  return new THREE.CanvasTexture(canvas)
}

function createSymbolPiece(type, color, square, scene) {
  const g = new THREE.Group()
  const bgColor = color === 'white' ? '#F2ECD8' : '#14111F'

  // Flat disc — CylinderGeometry groups: 0=side, 1=top, 2=bottom
  const discGeo = new THREE.CylinderGeometry(0.42, 0.45, 0.12, 32)
  const texture  = createSymbolTexture(type, color)
  const discMats = [
    new THREE.MeshPhysicalMaterial({ color: bgColor, roughness: 0.25, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.1 }),
    new THREE.MeshPhysicalMaterial({ map: texture,   roughness: 0.30, metalness: 0.0,  clearcoat: 0.5, clearcoatRoughness: 0.15 }),
    new THREE.MeshPhysicalMaterial({ color: bgColor, roughness: 0.25, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.1 }),
  ]
  const disc = new THREE.Mesh(discGeo, discMats)
  disc.position.set(0, 0.06, 0)
  disc.castShadow = true
  disc.receiveShadow = true
  g.add(disc)

  // Thin ring underneath
  const ringGeo = new THREE.TorusGeometry(0.4, 0.04, 8, 32)
  const ringMat = new THREE.MeshPhysicalMaterial({ color: bgColor, roughness: 0.30, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.12 })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = Math.PI / 2
  ring.position.set(0, 0.01, 0)
  ring.castShadow = true
  g.add(ring)

  const pos = squareToWorld(square)
  g.position.copy(pos)
  g.userData = { pieceType: type.toLowerCase(), color, square }
  g.name = `piece_${type}_${color}_${square}`

  scene.add(g)
  return g
}

// ─── Low-poly style ───────────────────────────────────────────────────────────

function getLowPolyMat(color) {
  return color === 'white'
    ? new THREE.MeshPhysicalMaterial({
        color: '#DDD5B8', roughness: 0.55, metalness: 0.05,
        clearcoat: 0.3, clearcoatRoughness: 0.3, flatShading: true
      })
    : new THREE.MeshPhysicalMaterial({
        color: '#1A172A', roughness: 0.45, metalness: 0.10,
        clearcoat: 0.4, clearcoatRoughness: 0.25, flatShading: true
      })
}

function buildLowPolyPawn(color) {
  const g = new THREE.Group()
  const mat = getLowPolyMat(color)
  // Wide flat base
  addMesh(g, new THREE.CylinderGeometry(0.28, 0.32, 0.10, 6), mat, 0, 0.05)
  // Tapered stem
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.24, 0.38, 6), mat, 0, 0.29)
  // Round head
  addMesh(g, new THREE.SphereGeometry(0.20, 6, 5), mat, 0, 0.68)
  return g
}

function buildLowPolyRook(color) {
  const g = new THREE.Group()
  const mat = getLowPolyMat(color)
  // Base
  addMesh(g, new THREE.CylinderGeometry(0.30, 0.34, 0.10, 6), mat, 0, 0.05)
  // Column
  addMesh(g, new THREE.CylinderGeometry(0.22, 0.28, 0.52, 6), mat, 0, 0.36)
  // Wide top platform
  addMesh(g, new THREE.CylinderGeometry(0.30, 0.24, 0.12, 6), mat, 0, 0.68)
  // 4 battlements at corners
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, 0.10), mat)
    b.position.set(Math.cos(angle) * 0.18, 0.82, Math.sin(angle) * 0.18)
    b.castShadow = true
    g.add(b)
  }
  return g
}

function buildLowPolyKnight(color) {
  const g = new THREE.Group()
  const mat = getLowPolyMat(color)
  // Base
  addMesh(g, new THREE.CylinderGeometry(0.28, 0.32, 0.10, 6), mat, 0, 0.05)
  // Neck
  addMesh(g, new THREE.CylinderGeometry(0.14, 0.22, 0.36, 6), mat, 0, 0.28)
  // Head body — angled horse silhouette
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.30, 0.26), mat)
  head.position.set(0, 0.72, 0)
  head.rotation.z = -0.3
  head.castShadow = true
  g.add(head)
  // Snout — gives the horse-face look
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.18), mat)
  snout.position.set(0.10, 0.60, 0)
  snout.castShadow = true
  g.add(snout)
  return g
}

function buildLowPolyBishop(color) {
  const g = new THREE.Group()
  const mat = getLowPolyMat(color)
  // Base
  addMesh(g, new THREE.CylinderGeometry(0.28, 0.32, 0.10, 6), mat, 0, 0.05)
  // Body — tall taper
  addMesh(g, new THREE.CylinderGeometry(0.10, 0.24, 0.56, 6), mat, 0, 0.38)
  // Collar
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.12, 0.10, 6), mat, 0, 0.71)
  // Tall pointed cone
  addMesh(g, new THREE.ConeGeometry(0.13, 0.46, 6), mat, 0, 1.04)
  // Finial tip
  addMesh(g, new THREE.SphereGeometry(0.06, 6, 4), mat, 0, 1.34)
  return g
}

function buildLowPolyQueen(color) {
  const g = new THREE.Group()
  const mat = getLowPolyMat(color)
  // Base
  addMesh(g, new THREE.CylinderGeometry(0.30, 0.34, 0.10, 6), mat, 0, 0.05)
  // Stem
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.26, 0.52, 6), mat, 0, 0.36)
  // Central orb
  addMesh(g, new THREE.SphereGeometry(0.24, 7, 6), mat, 0, 0.80)
  // Crown band
  addMesh(g, new THREE.CylinderGeometry(0.22, 0.20, 0.12, 6), mat, 0, 1.06)
  // 5 crown spikes arranged in a circle
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), mat)
    spike.position.set(Math.cos(angle) * 0.14, 1.24, Math.sin(angle) * 0.14)
    spike.castShadow = true
    g.add(spike)
  }
  return g
}

function buildLowPolyKing(color) {
  const g = new THREE.Group()
  const mat = getLowPolyMat(color)
  // Base
  addMesh(g, new THREE.CylinderGeometry(0.30, 0.34, 0.10, 6), mat, 0, 0.05)
  // Stem
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.26, 0.56, 6), mat, 0, 0.38)
  // Collar
  addMesh(g, new THREE.CylinderGeometry(0.20, 0.16, 0.10, 6), mat, 0, 0.77)
  // Cross vertical bar
  addMesh(g, new THREE.BoxGeometry(0.09, 0.44, 0.09), mat, 0, 1.04)
  // Cross horizontal bar
  addMesh(g, new THREE.BoxGeometry(0.30, 0.09, 0.09), mat, 0, 1.18)
  return g
}

const LOWPOLY_BUILDERS = {
  p: buildLowPolyPawn,
  r: buildLowPolyRook,
  n: buildLowPolyKnight,
  b: buildLowPolyBishop,
  q: buildLowPolyQueen,
  k: buildLowPolyKing
}

// ─── Internal style dispatchers ───────────────────────────────────────────────

function createClassicPiece(type, color, square, scene) {
  const builder = CLASSIC_BUILDERS[type.toLowerCase()]
  if (!builder) return null

  const group = builder(color)
  const pos = squareToWorld(square)
  group.position.copy(pos)
  group.userData = { pieceType: type.toLowerCase(), color, square }
  group.name = `piece_${type}_${color}_${square}`

  scene.add(group)
  return group
}

function createLowPolyPiece(type, color, square, scene) {
  const builder = LOWPOLY_BUILDERS[type.toLowerCase()]
  if (!builder) return null

  const group = builder(color)
  const pos = squareToWorld(square)
  group.position.copy(pos)
  group.userData = { pieceType: type.toLowerCase(), color, square }
  group.name = `piece_${type}_${color}_${square}`

  scene.add(group)
  return group
}

// ─── GLB piece builder ────────────────────────────────────────────────────────

function createGLBPiece(type, color, square, scene) {
  const template = MODEL_CACHE[type.toLowerCase()]
  if (!template) return createClassicPiece(type, color, square, scene) // fallback

  const group = template.clone(true)
  const mat = color === 'white' ? GLB_WHITE_MAT() : GLB_BLACK_MAT()

  group.traverse(child => {
    if (child.isMesh) {
      child.material = mat
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  // Normalize scale — GLB models vary in size; target bounding box height ~1.0
  const box = new THREE.Box3().setFromObject(group)
  const height = box.max.y - box.min.y
  const normalizedScale = height > 0 ? 1.0 / height : 1
  group.scale.setScalar(normalizedScale)

  // Align base to y=0 and store offset so movePiece can restore it
  const box2 = new THREE.Box3().setFromObject(group)
  const baseY = -box2.min.y

  const pos = squareToWorld(square)
  group.position.set(pos.x, baseY, pos.z)

  group.userData = { pieceType: type.toLowerCase(), color, square, normalizedScale, baseY }
  group.name = `piece_${type}_${color}_${square}`

  scene.add(group)
  return group
}

// ─── Retro GLB piece builder ──────────────────────────────────────────────────

function createRetroPiece(type, color, square, scene) {
  const template = RETRO_MODEL_CACHE[type.toLowerCase()]
  if (!template) return createClassicPiece(type, color, square, scene)

  const group = template.clone(true)
  const mat = color === 'white' ? RETRO_WHITE_MAT() : RETRO_BLACK_MAT()

  group.traverse(child => {
    if (child.isMesh) {
      child.material = mat
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  const box = new THREE.Box3().setFromObject(group)
  const height = box.max.y - box.min.y
  const sizeMultiplier = type.toLowerCase() === 'p' ? 0.5 : 1.0
  const normalizedScale = (height > 0 ? 1.0 / height : 1) * sizeMultiplier
  group.scale.setScalar(normalizedScale)

  const box2 = new THREE.Box3().setFromObject(group)
  const baseY = -box2.min.y

  const pos = squareToWorld(square)
  group.position.set(pos.x, baseY, pos.z)

  group.userData = { pieceType: type.toLowerCase(), color, square, normalizedScale, baseY }
  group.name = `piece_${type}_${color}_${square}`

  scene.add(group)
  return group
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a piece Group and add it to scene at the correct square position.
 * @param {string} type  'p'|'r'|'n'|'b'|'q'|'k'
 * @param {string} color 'white'|'black'
 * @param {string} square e.g. 'e2'
 * @param {THREE.Scene} scene
 * @param {string} style 'classic'|'symbol'|'lowpoly'
 */
export function createPiece(type, color, square, scene, style = 'classic') {
  switch (style) {
    case 'glb':     return createGLBPiece(type, color, square, scene)
    case 'retro':   return createRetroPiece(type, color, square, scene)
    case 'symbol':  return createSymbolPiece(type, color, square, scene)
    case 'lowpoly': return createLowPolyPiece(type, color, square, scene)
    default:        return createClassicPiece(type, color, square, scene)
  }
}

/**
 * Rebuild all pieces in the pieceMap using a new style.
 * Removes old meshes, creates new ones, and updates the map in-place.
 * @param {THREE.Scene} scene
 * @param {Object} pieceMap  square → THREE.Group (mutated in place)
 * @param {string} style 'classic'|'symbol'|'lowpoly'
 */
export function rebuildPieces(scene, pieceMap, style) {
  for (const [square, mesh] of Object.entries(pieceMap)) {
    const { pieceType, color } = mesh.userData
    scene.remove(mesh)
    mesh.traverse(child => {
      if (child.isMesh) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach(m => {
          if (m.map) m.map.dispose()
          m.dispose()
        })
      }
    })
    const newMesh = createPiece(pieceType, color, square, scene, style)
    if (newMesh) pieceMap[square] = newMesh
  }
}

/**
 * Animate a piece to a new square.
 * @param {THREE.Group} piece
 * @param {string} toSquare
 * @param {number} duration in seconds
 * @returns Promise that resolves when animation is done
 */
export function movePiece(piece, toSquare, duration = 0.4) {
  const target = squareToWorld(toSquare)
  const current = piece.position.clone()
  // GLB pieces store their base y offset; other styles land at target.y (0)
  const landY = target.y + (piece.userData.baseY || 0)

  const dist = current.distanceTo(target)
  const arcHeight = Math.max(0.8, dist * 0.3)

  return new Promise(resolve => {
    gsap.timeline({ onComplete: resolve })
      .to(piece.position, {
        x: target.x,
        y: current.y + arcHeight,
        z: (current.z + target.z) / 2,
        duration: duration * 0.5,
        ease: 'power2.out'
      })
      .to(piece.position, {
        x: target.x,
        y: landY,
        z: target.z,
        duration: duration * 0.5,
        ease: 'power2.in'
      })
  })
}

/**
 * Remove a piece from the scene with a quick pop-out animation.
 */
export function removePiece(piece, scene) {
  return new Promise(resolve => {
    gsap.to(piece.scale, {
      x: 0, y: 0, z: 0,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => {
        scene.remove(piece)
        piece.traverse(child => {
          if (child.isMesh) {
            child.geometry.dispose()
            const mats = Array.isArray(child.material) ? child.material : [child.material]
            mats.forEach(m => {
              if (m.map) m.map.dispose()
              m.dispose()
            })
          }
        })
        resolve()
      }
    })
  })
}

/**
 * Highlight a selected piece with a subtle scale/glow pulse.
 */
export function selectPiece(piece) {
  const s = piece.userData.normalizedScale || 1
  gsap.to(piece.scale, {
    x: s * 1.12, y: s * 1.12, z: s * 1.12,
    duration: 0.2,
    ease: 'back.out(2)'
  })
}

/**
 * Deselect a piece (reset scale).
 */
export function deselectPiece(piece) {
  const s = piece.userData.normalizedScale || 1
  gsap.to(piece.scale, {
    x: s, y: s, z: s,
    duration: 0.2,
    ease: 'power2.out'
  })
}
