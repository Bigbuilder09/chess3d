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

export function playCaptureEffect(scene, controls, square, pieceValue = 1, capturedColor = 'white') {
  const pos = squareToWorld(square)
  const isQueenCapture = pieceValue >= 9

  if (isQueenCapture) {
    playQueenCaptureEffect(scene, controls, pos)
  } else {
    playRegularCaptureEffect(scene, pos, capturedColor)
  }
}

function playRegularCaptureEffect(scene, pos, capturedColor) {
  const colors = capturedColor === 'white'
    ? ['#F0EAD6', '#D4C9A8', '#BFB49A', '#E8E0CC']
    : ['#2A2240', '#1E1B2E', '#3D3560', '#4A4270']
  spawnShards(scene, pos, 18, colors, 1.5, 700)
  spawnLightFlash(scene, pos, capturedColor === 'white' ? '#F0EAD6' : '#6B5CE7', 6, 400)
}

function playQueenCaptureEffect(scene, controls, pos) {
  spawnShards(scene, pos, 55, ['#C8A96E', '#FFD700', '#E84040', '#FF6B6B', '#FFF8DC', '#D4A043'], 3, 1100)
  spawnLightFlash(scene, pos, '#FFD700', 12, 600)

  // 3 staggered shockwave rings
  ;[0, 120, 240].forEach(delay => {
    setTimeout(() => spawnShockwave(scene, pos), delay)
  })

  shake(controls, 0.15, 350)
}

function spawnShards(scene, pos, count, colors, speed, lifetime) {
  const shards = []
  for (let i = 0; i < count; i++) {
    const geo = new THREE.OctahedronGeometry(0.04 + Math.random() * 0.05, 0)
    const c = colors[Math.floor(Math.random() * colors.length)]
    const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, flatShading: true })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(pos.x, pos.y + 0.1, pos.z)
    mesh.castShadow = false

    const angle = Math.random() * Math.PI * 2
    const r = 0.3 + Math.random() * speed
    const vy = 0.04 + Math.random() * 0.06
    mesh.userData.vel = { x: Math.cos(angle) * r * 0.04, y: vy, z: Math.sin(angle) * r * 0.04 }
    mesh.userData.rot = { x: (Math.random()-0.5)*0.2, y: (Math.random()-0.5)*0.2, z: (Math.random()-0.5)*0.2 }

    scene.add(mesh)
    shards.push(mesh)
  }

  const startTime = performance.now()
  function tick() {
    const t = (performance.now() - startTime) / lifetime
    if (t >= 1) {
      shards.forEach(m => {
        scene.remove(m)
        m.geometry.dispose()
        m.material.dispose()
      })
      return
    }
    const gravity = t * 0.015
    shards.forEach(m => {
      m.position.x += m.userData.vel.x
      m.position.y += m.userData.vel.y - gravity
      m.position.z += m.userData.vel.z
      m.rotation.x += m.userData.rot.x
      m.rotation.y += m.userData.rot.y
      m.rotation.z += m.userData.rot.z
      m.material.opacity = 1 - t
      m.material.transparent = true
    })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function spawnLightFlash(scene, pos, color, intensity, duration) {
  const light = new THREE.PointLight(color, intensity, 6)
  light.position.set(pos.x, pos.y + 0.5, pos.z)
  scene.add(light)
  gsap.to(light, {
    intensity: 0,
    duration: duration / 1000,
    ease: 'power2.out',
    onComplete: () => scene.remove(light)
  })
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

    // 80 gold/red shards from king position
    const pos = kingMesh.position.clone()
    spawnShards(scene, pos, 80, ['#C8A96E', '#E84040', '#FFD700', '#FF6B6B', '#FFFFFF'], 4, 1500)
    spawnLightFlash(scene, pos, '#FFD700', 14, 800)
  }

  // Camera shake
  shake(controls, 0.12, 300)
}
