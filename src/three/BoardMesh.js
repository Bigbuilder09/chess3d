import * as THREE from 'three'

// ─── Board style definitions ──────────────────────────────────────────────────
const BOARD_STYLES = {
  wood: {
    light: '#D4B896', dark: '#6B4226', base: '#2C1810',
    lightRoughness: 0.8, darkRoughness: 0.8,
    lightEmissive: null, lightEmissiveIntensity: 0,
    darkEmissive: null, darkEmissiveIntensity: 0
  },
  marble: {
    light: '#E8E5E0', dark: '#5A5A6A', base: '#2A2A35',
    lightRoughness: 0.6, darkRoughness: 0.4,
    lightEmissive: null, lightEmissiveIntensity: 0,
    darkEmissive: null, darkEmissiveIntensity: 0
  },
  neon: {
    light: '#0D2137', dark: '#071524', base: '#050D18',
    lightRoughness: 0.8, darkRoughness: 0.8,
    lightEmissive: '#1A4A6A', lightEmissiveIntensity: 0.15,
    darkEmissive: '#0A1E30', darkEmissiveIntensity: 0.08
  },
  blush: {
    light: '#eee4e1', dark: '#695a5b', base: '#3a2c2d',
    lightRoughness: 0.75, darkRoughness: 0.75,
    lightEmissive: null, lightEmissiveIntensity: 0,
    darkEmissive: null, darkEmissiveIntensity: 0
  },
  dawn: {
    light: '#fff0ca', dark: '#c6cfe0', base: '#8a97aa',
    lightRoughness: 0.75, darkRoughness: 0.75,
    lightEmissive: null, lightEmissiveIntensity: 0,
    darkEmissive: null, darkEmissiveIntensity: 0
  },
  pearl: {
    light: '#fff8e1', dark: '#ead7d1', base: '#c4b0aa',
    lightRoughness: 0.75, darkRoughness: 0.75,
    lightEmissive: null, lightEmissiveIntensity: 0,
    darkEmissive: null, darkEmissiveIntensity: 0
  }
}

let boardGroup = null
const squareMeshes = {} // key: "a1" → mesh

// Module-level material refs for live style updates
let lightMaterial = null
let darkMaterial  = null
let baseMaterial  = null

/**
 * Convert chess square ("a1") to (col, row) [0-7]
 */
function squareToColRow(square) {
  const col = square.charCodeAt(0) - 97 // 'a'=0 .. 'h'=7
  const row = parseInt(square[1]) - 1   // '1'=0 .. '8'=7
  return { col, row }
}

/**
 * Convert (col, row) to THREE.js world position
 */
export function squareToWorld(square) {
  const { col, row } = squareToColRow(square)
  return new THREE.Vector3(col - 3.5, 0.1, 7 - row - 3.5)
}

/**
 * Hit-test a world position to a chess square string.
 */
export function worldToSquare(x, z) {
  const col = Math.round(x + 3.5)
  const row = 7 - Math.round(z + 3.5)
  if (col < 0 || col > 7 || row < 0 || row > 7) return null
  const file = String.fromCharCode(97 + col)
  const rank = (row + 1).toString()
  return file + rank
}

export function createBoard(scene, boardStyle = 'wood') {
  const style = BOARD_STYLES[boardStyle] || BOARD_STYLES.wood

  boardGroup = new THREE.Group()
  boardGroup.name = 'board'

  // Board base
  const baseGeo = new THREE.BoxGeometry(8.4, 0.2, 8.4)
  baseMaterial = new THREE.MeshStandardMaterial({
    color: style.base,
    roughness: 0.9,
    metalness: 0.05
  })
  const base = new THREE.Mesh(baseGeo, baseMaterial)
  base.position.set(0, -0.15, 0)
  base.receiveShadow = true
  base.castShadow = true
  boardGroup.add(base)

  // Edge trim
  const edgeGeo = new THREE.BoxGeometry(8.6, 0.05, 8.6)
  const edgeMat = new THREE.MeshStandardMaterial({
    color: '#C8A96E',
    roughness: 0.75,
    metalness: 0.1
  })
  const edge = new THREE.Mesh(edgeGeo, edgeMat)
  edge.position.set(0, -0.025, 0)
  edge.receiveShadow = true
  boardGroup.add(edge)

  // Squares
  lightMaterial = new THREE.MeshStandardMaterial({
    color: style.light,
    roughness: style.lightRoughness || 0.8,
    metalness: 0.02,
    emissive: style.lightEmissive ? new THREE.Color(style.lightEmissive) : new THREE.Color(0x000000),
    emissiveIntensity: style.lightEmissiveIntensity || 0
  })
  darkMaterial = new THREE.MeshStandardMaterial({
    color: style.dark,
    roughness: style.darkRoughness || 0.8,
    metalness: 0.02,
    emissive: style.darkEmissive ? new THREE.Color(style.darkEmissive) : new THREE.Color(0x000000),
    emissiveIntensity: style.darkEmissiveIntensity || 0
  })
  const squareGeo = new THREE.BoxGeometry(1, 0.1, 1)

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (col + row) % 2 === 0
      const mesh = new THREE.Mesh(squareGeo, isLight ? lightMaterial : darkMaterial)
      mesh.position.set(col - 3.5, 0, row - 3.5)
      mesh.receiveShadow = true
      mesh.castShadow = false

      const file = String.fromCharCode(97 + col)
      const rank = (8 - row).toString()
      const squareName = file + rank
      mesh.userData.square = squareName
      mesh.userData.isSquare = true
      mesh.name = `sq_${squareName}`

      squareMeshes[squareName] = mesh
      boardGroup.add(mesh)
    }
  }

  scene.add(boardGroup)
  return boardGroup
}

/**
 * Live-update board square colors without rebuilding the whole board.
 * Updates module-level material refs and marks them dirty.
 */
export function updateBoardStyle(scene, boardStyle) {
  const style = BOARD_STYLES[boardStyle] || BOARD_STYLES.wood

  if (lightMaterial) {
    lightMaterial.color.set(style.light)
    lightMaterial.roughness = style.lightRoughness || 0.8
    lightMaterial.emissive.set(style.lightEmissive || '#000000')
    lightMaterial.emissiveIntensity = style.lightEmissiveIntensity || 0
    lightMaterial.needsUpdate = true
  }

  if (darkMaterial) {
    darkMaterial.color.set(style.dark)
    darkMaterial.roughness = style.darkRoughness || 0.8
    darkMaterial.emissive.set(style.darkEmissive || '#000000')
    darkMaterial.emissiveIntensity = style.darkEmissiveIntensity || 0
    darkMaterial.needsUpdate = true
  }

  if (baseMaterial) {
    baseMaterial.color.set(style.base)
    baseMaterial.needsUpdate = true
  }
}

export function getSquareMesh(square) {
  return squareMeshes[square] || null
}

export function getAllSquareMeshes() {
  return squareMeshes
}

// Highlight overlays
const highlightOverlays = {}

export function highlightSquare(square, color = '#C8A96E', opacity = 0.4) {
  clearHighlight(square)
  const geo = new THREE.PlaneGeometry(0.95, 0.95)
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = -Math.PI / 2
  const pos = squareToWorld(square)
  mesh.position.set(pos.x, 0.06, pos.z)
  mesh.name = `highlight_${square}`
  boardGroup.add(mesh)
  highlightOverlays[square] = mesh
}

export function clearHighlight(square) {
  if (highlightOverlays[square]) {
    boardGroup.remove(highlightOverlays[square])
    highlightOverlays[square].geometry.dispose()
    highlightOverlays[square].material.dispose()
    delete highlightOverlays[square]
  }
}

export function clearAllHighlights() {
  Object.keys(highlightOverlays).forEach(clearHighlight)
}

// Legal move dots
const legalDotMeshes = []

export function showLegalDots(squares) {
  clearLegalDots()
  squares.forEach(square => {
    const geo = new THREE.SphereGeometry(0.18, 8, 8)
    const mat = new THREE.MeshBasicMaterial({
      color: '#4CAF7D',
      transparent: true,
      opacity: 0.75
    })
    const dot = new THREE.Mesh(geo, mat)
    const pos = squareToWorld(square)
    dot.position.set(pos.x, 0.12, pos.z)
    dot.userData.isLegalDot = true
    dot.userData.legalSquare = square
    boardGroup.add(dot)
    legalDotMeshes.push(dot)
  })
}

export function clearLegalDots() {
  legalDotMeshes.forEach(dot => {
    boardGroup.remove(dot)
    dot.geometry.dispose()
    dot.material.dispose()
  })
  legalDotMeshes.length = 0
}

export function getBoardGroup() {
  return boardGroup
}

/**
 * Dispose all board geometry/materials and remove the board from the scene.
 * Also clears highlight overlays, legal dot meshes, and the square mesh map.
 */
export function disposeBoard(scene) {
  if (!boardGroup) return

  // Dispose overlays/dots first (they call boardGroup.remove internally)
  clearAllHighlights()
  clearLegalDots()

  // Collect unique geometries and materials to avoid double-disposing shared resources
  const geometries = new Set()
  const materials = new Set()
  boardGroup.traverse(child => {
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
  materials.forEach(m => m.dispose())

  scene.remove(boardGroup)
  boardGroup = null

  // Clear module-level material refs
  lightMaterial = null
  darkMaterial  = null
  baseMaterial  = null

  // Clear the square mesh index
  Object.keys(squareMeshes).forEach(k => delete squareMeshes[k])
}
