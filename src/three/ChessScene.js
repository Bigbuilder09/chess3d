import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

let scene, camera, renderer, composer
let dirLight, ambientLight
let _dirtyFrames = 0
let _bgLoadId = 0

export function markDirty(frames = 2) {
  _dirtyFrames = Math.max(_dirtyFrames, frames)
}

export function shouldRender() {
  if (_dirtyFrames > 0) { _dirtyFrames--; return true }
  return false
}

export function initScene(canvas) {
  if (renderer) {
    disposeScene()
  }
  _dirtyFrames = 4

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#06031A')
  scene.fog = new THREE.Fog('#1A3560', 32, 58)

  // Gradient sky dome
  const skyCanvas = document.createElement('canvas')
  skyCanvas.width = 1; skyCanvas.height = 256
  const skyCtx = skyCanvas.getContext('2d')
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256)
  skyGrad.addColorStop(0,    '#06031A')
  skyGrad.addColorStop(0.28, '#09112E')
  skyGrad.addColorStop(0.62, '#12245A')
  skyGrad.addColorStop(1,    '#1A3560')
  skyCtx.fillStyle = skyGrad
  skyCtx.fillRect(0, 0, 1, 256)
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(46, 32, 16),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(skyCanvas), side: THREE.BackSide, depthWrite: false })
  )
  skyDome.renderOrder = -1
  skyDome.name = 'skyDome'
  scene.add(skyDome)

  // Stars
  const starPositions = new Float32Array(1000 * 3)
  for (let i = 0; i < 1000; i++) {
    const r = 22 + Math.random() * 18
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    starPositions[i * 3 + 2] = r * Math.cos(phi)
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMat = new THREE.PointsMaterial({ color: '#D8EAFF', size: 0.065, sizeAttenuation: true, transparent: true, opacity: 0.75 })
  const stars = new THREE.Points(starGeo, starMat)
  stars.name = 'stars'
  scene.add(stars)

  // Camera
  camera = new THREE.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100
  )
  camera.position.set(0, 8, 10)
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  })
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // Lighting
  ambientLight = new THREE.AmbientLight('#ffffff', 1.2)
  scene.add(ambientLight)

  dirLight = new THREE.DirectionalLight('#fff8e7', 1.1)
  dirLight.position.set(3, 14, 10)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 1024
  dirLight.shadow.mapSize.height = 1024
  dirLight.shadow.camera.near = 0.5
  dirLight.shadow.camera.far = 50
  dirLight.shadow.camera.left = -10
  dirLight.shadow.camera.right = 10
  dirLight.shadow.camera.top = 10
  dirLight.shadow.camera.bottom = -10
  dirLight.shadow.bias = -0.001
  scene.add(dirLight)

  const rimLight = new THREE.DirectionalLight('#5C6BC0', 0.4)
  rimLight.position.set(-8, 6, -6)
  scene.add(rimLight)

  // Post-processing
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
    0.4,
    0.3,
    0.7
  )
  composer.addPass(bloomPass)

  const applySize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false) // false = don't override CSS with inline style
    composer.setSize(w, h)
    markDirty(4)
  }
  const resizeObserver = new ResizeObserver(applySize)
  resizeObserver.observe(canvas)
  scene.userData._cleanupResize = () => resizeObserver.disconnect()

  return { scene, camera, renderer, composer }
}

export function setSceneBg(url) {
  if (!scene) return
  const skyDome = scene.getObjectByName('skyDome')
  const stars   = scene.getObjectByName('stars')

  if (url) {
    const loadId = ++_bgLoadId
    new THREE.TextureLoader().load(url, (texture) => {
      // Stale load — a newer request came in, discard this texture
      if (loadId !== _bgLoadId || !scene) {
        texture.dispose()
        return
      }
      if (scene.background instanceof THREE.Texture) scene.background.dispose()
      scene.background = texture
      scene.fog = null
      if (skyDome) skyDome.visible = false
      if (stars)   stars.visible   = false
      markDirty(4)
    })
  } else {
    _bgLoadId++ // cancel any in-flight load
    if (scene.background instanceof THREE.Texture) scene.background.dispose()
    scene.background = new THREE.Color('#06031A')
    scene.fog = new THREE.Fog('#1A3560', 32, 58)
    if (skyDome) skyDome.visible = true
    if (stars)   stars.visible   = true
    markDirty(4)
  }
}

export function renderScene() {
  if (composer) composer.render()
}

export function disposeScene() {
  _bgLoadId++
  if (scene?.userData._cleanupResize) {
    scene.userData._cleanupResize()
  }
  if (scene?.background instanceof THREE.Texture) scene.background.dispose()
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  scene = null
  camera = null
  composer = null
}

export function getScene()    { return scene }
export function getCamera()   { return camera }
export function getRenderer() { return renderer }
export function getComposer() { return composer }
