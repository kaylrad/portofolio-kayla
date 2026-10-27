const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const THREE = require('three')

// Exercise the real model and Three.js mixer, without loading textures or WebGL.
const loaderSource = fs.readFileSync('node_modules/three/examples/jsm/loaders/GLTFLoader.js', 'utf8')
  .replace(/import \{([\s\S]*?)\} from 'three';/, 'const {$1} = require("three");')
  .replace('export { GLTFLoader };', 'return GLTFLoader;')
const GLTFLoader = new Function('require', loaderSource)(require)
const loader = new GLTFLoader()
loader.register(parser => ({ name: 'texture-free-test', beforeRoot() {
  parser.json.materials = []
  parser.json.meshes.forEach(mesh => mesh.primitives.forEach(p => { delete p.material }))
} }))
const bytes = fs.readFileSync('public/buatportooo.glb')
loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', gltf => {
  const source = fs.readFileSync('src/portfolio.js', 'utf8')
  for (const device of [{ touch: false, width: 1280, height: 720 }, { touch: true, width: 390, height: 844 }]) {
    const state = { model: gltf.scene.clone(true), nodes: {}, interactions: {}, originalY: {}, mixers: [],
      maxAnimDuration: 0, scroll: 0, smoothScroll: 0, elapsedTime: 0, itemsVisible: true,
      parallax: { x: 0, y: 0 } }
    const context = vm.createContext({ THREE, state, IS_TOUCH: device.touch, window: { innerWidth: device.width, innerHeight: device.height } })
    for (const name of ['OBJECT_SCALE_MULTIPLIERS', 'FLOATING_OBJECTS', 'INTERACTION_ROOTS', 'CAMERA_PATH', 'MOBILE_CAMERA_PATH', 'SKIPPED_ANIMATIONS']) {
      vm.runInContext(source.match(new RegExp(`const ${name} = [\\s\\S]*?(?=\\n(?:const|\\n))`))[0], context)
    }
    for (const name of ['centerModel', 'traverseModel', 'setupMixers', 'scrubAnimations', 'tickScrollAnimation', 'tickFloatingObjects', 'tickLaptopPose', 'tickObjectInteractions', 'setCameraFromScroll', 'clamp', 'easeInOut']) {
      vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || source.match(new RegExp(`function ${name}[^\\n]+`))[0], context)
    }
    context.centerModel(state.model)
    context.traverseModel(state.model)
    context.setupMixers(gltf.animations)
    const camera = new THREE.PerspectiveCamera(50, device.width / device.height, 0.01, 100)
    function pose(progress) {
      state.scroll = progress
      for (let i = 0; i < 180; i++) {
        context.tickScrollAnimation()
        context.tickFloatingObjects()
        context.tickLaptopPose()
        context.tickObjectInteractions()
      }
      context.setCameraFromScroll(state.smoothScroll, camera)
      camera.updateMatrixWorld(true)
      state.model.updateMatrixWorld(true)
      return { y: state.nodes.Base.position.y, scale: state.nodes.Base.scale.x,
        center: new THREE.Box3().setFromObject(state.nodes.Base).getCenter(new THREE.Vector3()).project(camera).toArray() }
    }
    const first = pose(1)
    pose(0.3)
    const second = pose(1)
    assert.ok(Math.abs(first.y - second.y) < 1e-6, 'Laptop must return to the same height')
    assert.ok(Math.abs(first.scale - second.scale) < 1e-6, 'Laptop scale must not accumulate')
    assert.ok(Math.abs(second.center[0]) < 1 && Math.abs(second.center[1]) < 1, 'Laptop must stay in frame')
    console.log(`${device.touch ? 'Mobile' : 'Desktop'} scroll round-trip regression checks passed`)
  }
}, error => { throw error })
