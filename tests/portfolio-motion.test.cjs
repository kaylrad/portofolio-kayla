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
    const labels = Object.fromEntries(['lbl-id', 'lbl-ph', 'lbl-lp'].map(id => [id, {
      style: {}, offsetWidth: 80, offsetHeight: 40,
    }]))
    const context = vm.createContext({ THREE, state, IS_TOUCH: device.touch,
      document: { getElementById: id => labels[id] },
      window: { innerWidth: device.width, innerHeight: device.height } })
    for (const name of ['OBJECT_SCALE_MULTIPLIERS', 'FLOATING_OBJECTS', 'INTERACTION_ROOTS', 'CAMERA_PATH', 'MOBILE_CAMERA_PATH', 'SKIPPED_ANIMATIONS']) {
      vm.runInContext(source.match(new RegExp(`const ${name} = [\\s\\S]*?(?=\\n(?:const|\\n))`))[0], context)
    }
    for (const name of ['centerModel', 'traverseModel', 'setupMixers', 'scrubAnimations', 'tickScrollAnimation', 'tickFloatingObjects', 'tickLaptopPose', 'tickObjectInteractions', 'setCameraFromScroll', 'updateObjectLabels', 'getObjectScreenBounds', 'clamp', 'easeInOut']) {
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
    context.updateObjectLabels(camera)
    for (const [name, id] of Object.entries({ Base: 'lbl-lp', phone: 'lbl-ph', id_card: 'lbl-id' })) {
      // Independently project the actual vertices, rather than a world-axis box.
      const screenPoints = []
      state.nodes[name].traverse(mesh => {
        if (!mesh.isMesh) return
        const positions = mesh.geometry.attributes.position
        for (let i = 0; i < positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera)
          screenPoints.push([(point.x + 1) * device.width / 2, (1 - point.y) * device.height / 2])
        }
      })
      const left = Math.min(...screenPoints.map(point => point[0]))
      const right = Math.max(...screenPoints.map(point => point[0]))
      const bottom = Math.max(...screenPoints.map(point => point[1]))
      const expectedX = Math.max(52, Math.min(device.width - 52, (left + right) / 2))
      assert.equal(labels[id].style.opacity, '0.9', `${name} label must appear with its object`)
      assert.ok(Math.abs(parseFloat(labels[id].style.left) - expectedX) < 24, `${name} label must follow the rendered silhouette horizontally`)
      assert.ok(Math.abs(parseFloat(labels[id].style.top) - (bottom + 10)) < 24, `${name} label must sit just below the rendered silhouette`)
    }
    const previousX = parseFloat(labels['lbl-ph'].style.left)
    state.model.position.x += 0.08
    context.updateObjectLabels(camera)
    assert.ok(parseFloat(labels['lbl-ph'].style.left) > previousX, 'Phone label must move with the object')
    state.activeOverlay = 'laptop'
    context.updateObjectLabels(camera)
    assert.ok(Object.values(labels).every(label => label.style.opacity === '0'), 'Labels must hide behind overlays')
    console.log(`${device.touch ? 'Mobile' : 'Desktop'} scroll round-trip regression checks passed`)
  }
}, error => { throw error })
