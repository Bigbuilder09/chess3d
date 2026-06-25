import * as THREE from 'three'
import { gsap } from 'gsap'
import { squareToWorld } from './BoardMesh.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomInRadius(radius) {
  const angle = Math.random() * Math.PI * 2
  const r = Math.random() * radius
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r }
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255
  }
}

// ─── Regular capture: stone-grey particles ────────────────────────────────────

export function playCaptureEffect(scene, controls, square, pieceValue = 1) {
  const pos = squareToWorld(square)
  const isQueenCapture = pieceValue >= 9

  if (isQueenCapture) {
    playQueenCaptureEffect(scene, controls, pos)
  } else {
    playRegularCaptureEffect(scene, pos)
  }
}

function playRegularCaptureEffect(scene, pos) {
  const count = 20
  const colors = ['#8A8A9A', '#6B6B7C', '#AAAABC', '#5A5A6A']

  const positions = new Float32Array(count * 3)
  const colorsArr = new Float32Array(count * 3)
  const velocities = []

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = pos.x
    positions[i * 3 + 1] = pos.y
    positions[i * 3 + 2] = pos.z

    const c = hexToRgb(colors[Math.floor(Math.random() * colors.length)])
    colorsArr[i * 3]     = c.r
    colorsArr[i * 3 + 1] = c.g
    colorsArr[i * 3 + 2] = c.b

    const { x, z } = randomInRadius(1.5)
    velocities.push({
      x: x * 0.03,
      y: (Math.random() * 0.04 + 0.02),
      z: z * 0.03
    })
  }

  spawnParticles(scene, positions, colorsArr, velocities, count, 600, 3)
}

function playQueenCaptureEffect(scene, controls, pos) {
  const count = 60
  const colors = ['#C8A96E', '#E84040', '#FFD700', '#FF6B6B', '#D4A043']

  const positions = new Float32Array(count * 3)
  const colorsArr = new Float32Array(count * 3)
  const velocities = []

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = pos.x
    positions[i * 3 + 1] = pos.y
    positions[i * 3 + 2] = pos.z

    const c = hexToRgb(colors[Math.floor(Math.random() * colors.length)])
    colorsArr[i * 3]     = c.r
    colorsArr[i * 3 + 1] = c.g
    colorsArr[i * 3 + 2] = c.b

    const { x, z } = randomInRadius(3)
    velocities.push({
      x: x * 0.04,
      y: (Math.random() * 0.06 + 0.04),
      z: z * 0.04
    })
  }

  spawnParticles(scene, positions, colorsArr, velocities, count, 900, 5)
  spawnShockwave(scene, pos)
  shake(controls, 0.12, 300)
}

function spawnParticles(scene, positions, colors, velocities, count, lifetime, size) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3))

  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    sizeAttenuation: true,
    depthWrite: false
  })

  const points = new THREE.Points(geo, mat)
  scene.add(points)

  const startTime = performance.now()
  const posArr = geo.attributes.position.array

  function tick() {
    const elapsed = performance.now() - startTime
    const t = elapsed / lifetime
    if (t >= 1) {
      scene.remove(points)
      geo.dispose()
      mat.dispose()
      return
    }

    mat.opacity = 1 - t

    for (let i = 0; i < count; i++) {
      posArr[i * 3]     += velocities[i].x
      posArr[i * 3 + 1] += velocities[i].y - (t * 0.02) // gravity
      posArr[i * 3 + 2] += velocities[i].z
    }
    geo.attributes.position.needsUpdate = true

    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function spawnShockwave(scene, pos) {
  const geo = new THREE.RingGeometry(0.05, 0.15, 32)
  const mat = new THREE.MeshBasicMaterial({
    color: '#C8A96E',
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  const ring = new THREE.Mesh(geo, mat)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(pos.x, pos.y + 0.05, pos.z)
  scene.add(ring)

  gsap.to(ring.scale, {
    x: 14, y: 14, z: 14,
    duration: 0.4,
    ease: 'power2.out'
  })
  gsap.to(mat, {
    opacity: 0,
    duration: 0.4,
    ease: 'power2.out',
    onComplete: () => {
      scene.remove(ring)
      geo.dispose()
      mat.dispose()
    }
  })
}

// Shake by offsetting controls.target — OrbitControls does not override target each frame,
// so the offset survives enableDamping's controls.update() call.
function shake(controls, intensity, duration) {
  const originTarget = controls.target.clone()
  const start = performance.now()

  function tick() {
    const elapsed = performance.now() - start
    const t = elapsed / duration
    if (t >= 1) {
      controls.target.copy(originTarget)
      return
    }
    const decay = 1 - t
    controls.target.x = originTarget.x + (Math.random() - 0.5) * 2 * intensity * decay
    controls.target.z = originTarget.z + (Math.random() - 0.5) * 2 * intensity * decay
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// ─── Check effect: red PointLight pulse on king ───────────────────────────────

let checkLight = null

export function playCheckEffect(scene, kingMesh) {
  if (checkLight) {
    scene.remove(checkLight)
    checkLight = null
  }

  const light = new THREE.PointLight('#E84040', 0, 3)
  if (kingMesh) {
    light.position.copy(kingMesh.position)
    light.position.y += 1
  }
  scene.add(light)
  checkLight = light

  gsap.to(light, {
    intensity: 4,
    duration: 0.2,
    ease: 'power2.out',
    yoyo: true,
    repeat: 3,
    onComplete: () => {
      gsap.to(light, {
        intensity: 1.5,
        duration: 0.3
      })
    }
  })
}

export function clearCheckEffect(scene) {
  if (checkLight) {
    scene.remove(checkLight)
    checkLight = null
  }
}

// ─── Checkmate effect ─────────────────────────────────────────────────────────

export function playCheckmateEffect(scene, controls, kingMesh) {
  // King fall animation
  if (kingMesh) {
    gsap.to(kingMesh.rotation, {
      z: Math.PI / 2,
      duration: 0.6,
      delay: 0.2,
      ease: 'power2.in'
    })
    gsap.to(kingMesh.position, {
      y: -0.3,
      duration: 0.6,
      delay: 0.2,
      ease: 'bounce.out'
    })

    // 80 gold/red particles from king position
    const pos = kingMesh.position.clone()
    const count = 80
    const colors = ['#C8A96E', '#E84040', '#FFD700', '#FF6B6B', '#FFFFFF']
    const positions = new Float32Array(count * 3)
    const colorsArr = new Float32Array(count * 3)
    const velocities = []

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = pos.x
      positions[i * 3 + 1] = pos.y
      positions[i * 3 + 2] = pos.z
      const c = hexToRgb(colors[Math.floor(Math.random() * colors.length)])
      colorsArr[i * 3]     = c.r
      colorsArr[i * 3 + 1] = c.g
      colorsArr[i * 3 + 2] = c.b
      const { x, z } = randomInRadius(4)
      velocities.push({
        x: x * 0.05,
        y: Math.random() * 0.08 + 0.05,
        z: z * 0.05
      })
    }
    spawnParticles(scene, positions, colorsArr, velocities, count, 1500, 6)
  }

  // Camera shake
  shake(controls, 0.12, 300)
}
