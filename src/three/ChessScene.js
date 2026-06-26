import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

let scene, camera, renderer, composer
let dirLight, ambientLight

export function initScene(canvas) {
  // Guard against double-init (React StrictMode invokes effects twice).
  // Dispose any existing WebGL context before creating a new one.
  if (renderer) {
    disposeScene()
  }

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color('#06031A')
  scene.fog = new THREE.Fog('#1A3560', 32, 58)

  // Gradient sky dome — deep indigo at zenith → ocean blue at horizon
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
  scene.add(new THREE.Points(starGeo, starMat))

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
  renderer.setSize(canvas.clientWidth, canvas.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // Lighting
  ambientLight = new THREE.AmbientLight('#ffffff', 0.5)
  scene.add(ambientLight)

  dirLight = new THREE.DirectionalLight('#fff8e7', 1.5)
  dirLight.position.set(5, 12, 8)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 2048
  dirLight.shadow.mapSize.height = 2048
  dirLight.shadow.camera.near = 0.5
  dirLight.shadow.camera.far = 50
  dirLight.shadow.camera.left = -10
  dirLight.shadow.camera.right = 10
  dirLight.shadow.camera.top = 10
  dirLight.shadow.camera.bottom = -10
  dirLight.shadow.bias = -0.001
  scene.add(dirLight)

  // Rim light
  const rimLight = new THREE.DirectionalLight('#5C6BC0', 0.4)
  rimLight.position.set(-8, 6, -6)
  scene.add(rimLight)

  // Post-processing
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
    0.4,   // strength
    0.3,   // radius
    0.7    // threshold
  )
  composer.addPass(bloomPass)

  // Resize handler
  const handleResize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
  }
  window.addEventListener('resize', handleResize)

  // Store cleanup ref
  scene.userData._cleanupResize = handleResize

  return { scene, camera, renderer, composer }
}

export function renderScene() {
  if (composer) composer.render()
}

export function disposeScene() {
  if (scene?.userData._cleanupResize) {
    window.removeEventListener('resize', scene.userData._cleanupResize)
  }
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
