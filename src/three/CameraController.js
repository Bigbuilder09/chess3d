import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { gsap } from 'gsap'

let controls = null
let dblclickHandler = null

// Default camera pose
const DEFAULT_POSITION = new THREE.Vector3(0, 8, 10)
const DEFAULT_TARGET   = new THREE.Vector3(0, 0, 0)

export function initControls(camera, renderer) {
  controls = new OrbitControls(camera, renderer.domElement)

  controls.minDistance    = 4
  controls.maxDistance    = 18
  controls.minPolarAngle  = THREE.MathUtils.degToRad(15)
  controls.maxPolarAngle  = THREE.MathUtils.degToRad(85)
  controls.enableDamping  = true
  controls.dampingFactor  = 0.08
  controls.enablePan      = false
  controls.rotateSpeed    = 0.6
  controls.zoomSpeed      = 0.8

  // Set initial position
  camera.position.copy(DEFAULT_POSITION)
  controls.target.copy(DEFAULT_TARGET)
  controls.update()

  // Double-click to reset — store reference so it can be removed on dispose (M8)
  dblclickHandler = () => resetCamera(camera)
  renderer.domElement.addEventListener('dblclick', dblclickHandler)

  return controls
}

export function resetCamera(camera) {
  if (!controls) return

  gsap.to(camera.position, {
    x: DEFAULT_POSITION.x,
    y: DEFAULT_POSITION.y,
    z: DEFAULT_POSITION.z,
    duration: 0.4,
    ease: 'power2.inOut'
  })
  gsap.to(controls.target, {
    x: DEFAULT_TARGET.x,
    y: DEFAULT_TARGET.y,
    z: DEFAULT_TARGET.z,
    duration: 0.4,
    ease: 'power2.inOut',
    onUpdate: () => controls.update()
  })
}

/**
 * Flip camera to opposite side (for black player view).
 */
export function flipCamera(camera) {
  if (!controls) return

  gsap.to(camera.position, {
    x: 0,
    y: 8,
    z: -10,
    duration: 0.6,
    ease: 'power2.inOut'
  })
  gsap.to(controls.target, {
    x: 0, y: 0, z: 0,
    duration: 0.6,
    ease: 'power2.inOut',
    onUpdate: () => controls.update()
  })
}

export function updateControls() {
  if (controls) controls.update()
}

export function getControls() {
  return controls
}

export function disposeControls() {
  if (controls) {
    // M8: Remove the dblclick listener that was added in initControls
    if (dblclickHandler) {
      controls.domElement.removeEventListener('dblclick', dblclickHandler)
      dblclickHandler = null
    }
    controls.dispose()
    controls = null
  }
}
