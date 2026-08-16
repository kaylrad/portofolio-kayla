import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import Lenis from '@studio-freight/lenis'

/* ══════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════ */
// Use relative paths so GitHub Pages subpath works
const BASE = './'
const MODEL_URL         = BASE + 'buatportooo.glb'
const HERO_IMAGE_URL    = BASE + 'background_hero.png'
const MAX_PIXEL_RATIO   = 2
const PARALLAX_STRENGTH = 0.12
const STAR_COUNT        = 160
const IS_TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches

const OBJECT_SCALE_MULTIPLIERS = { Base: 0.86 }

const CAMERA_PATH = [
  { t: 0.00, px: 0, py: 0.5,  pz: 3,   lx: 0, ly: 0.5,  lz: 0 },
  { t: 0.20, px: 0, py: 2.5,  pz: 4.0, lx: 0, ly: 0.2,  lz: 0 },
  { t: 0.45, px: 0, py: 5.5,  pz: 2.0, lx: 0, ly: -0.2, lz: 0 },
  { t: 0.65, px: 0, py: 7.5,  pz: 0.5, lx: 0, ly: -0.5, lz: 0 },
  { t: 1.00, px: 0, py: 3,    pz: 2.0, lx: 0, ly: 2,    lz: 0 },
]

const MOBILE_CAMERA_PATH = [
  { t: 0.00, px: 0, py: 0.5,  pz: 3,   lx: 0, ly: 0.5,  lz: 0 },
  { t: 0.20, px: 0, py: 2.5,  pz: 4.0, lx: 0, ly: 0.2,  lz: 0 },
  { t: 0.45, px: 0, py: 5.5,  pz: 2.5, lx: 0, ly: -0.2, lz: 0 },
  { t: 0.65, px: 0, py: 7.5,  pz: 2.0, lx: 0, ly: -0.5, lz: 0 },
  { t: 1.00, px: 0, py: 3,    pz: 2.5, lx: 0, ly: 2,    lz: 0 },
]

const CLICK_TARGETS = {
  Base: 'laptop', Screen: 'laptop',
  phone: 'phone', 'Object_4.001': 'phone',
  id_card: 'about', Object_2: 'about',
}
const LABEL_TARGETS = {
  Base: 'lbl-lp', Screen: 'lbl-lp',
  phone: 'lbl-ph', 'Object_4.001': 'lbl-ph',
  id_card: 'lbl-id', Object_2: 'lbl-id',
}
const INTERACTION_ROOTS = {
  Base: 'Base', Screen: 'Base',
  phone: 'phone', 'Object_4.001': 'phone',
  id_card: 'id_card', Object_2: 'id_card',
}
const FLOATING_OBJECTS = {
  phone:   { phase: 0.0, speed: 0.70, amplitude: 0.06 },
  id_card: { phase: 1.6, speed: 0.55, amplitude: 0.05 },
  Base:    { phase: 2.9, speed: 0.65, amplitude: 0.07 },
}
const SKIPPED_ANIMATIONS = new Set(['ScreenAction.001'])

/* ══════════════════════════════════════════════
   SHARED STATE
══════════════════════════════════════════════ */
const el = {
  canvasWrap: document.getElementById('canvas-wrap'),
  progress:   document.getElementById('progress'),
  scrollHint: document.getElementById('scroll-hint'),
  clickHint:  document.getElementById('click-hint'),
  cursor:     document.getElementById('cur'),
  cursorRing: document.getElementById('cur-ring'),
}

const state = {
  scroll: 0, smoothScroll: 0,
  model: null, maxAnimDuration: 0,
  itemsVisible: false,
  activeOverlay: null, pendingOverlay: null,
  elapsedTime: 0,
  mouseX: 0, mouseY: 0, ringX: 0, ringY: 0,
  parallax: { x: 0, y: 0 }, rawParallax: { x: 0, y: 0 },
  mixers: [], nodes: {}, originalY: {},
  interactions: {}, hoveredObjectName: null,
  starField: null,
}

/* Module-level lenis reference so closeOv() can call lenis.start() */
let lenis = null

/* Pause rendering when tab is hidden — saves CPU/battery */
let tabVisible = true
document.addEventListener('visibilitychange', () => {
  tabVisible = !document.hidden
})

/* Shared GLB cache — main scene and ID card both use the same model */
let _gltfPromise = null
function loadSharedGLTF() {
  if (!_gltfPromise) {
    _gltfPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(MODEL_URL, resolve, undefined, reject)
    })
  }
  return _gltfPromise
}

/* ══════════════════════════════════════════════
   ENTRY
══════════════════════════════════════════════ */
setLoadingProgress(5, 'Initialising scene…')

// Mobile gets a reduced-quality 3D scene (lower pixel ratio, no lenis)
if (IS_TOUCH) {
  document.body.classList.add('mobile-mode')
  initMobile3D()
} else {
  initDesktop()
}

initCardMini3D()
initSkillScrollZoom()
initViewMoreButton()
initWorkFromAPI()

/* ══════════════════════════════════════════════
   DESKTOP 3D
══════════════════════════════════════════════ */
function initDesktop() {
  lenis = new Lenis({
    duration: 1.45,
    smoothWheel: true,
    wheelMultiplier: 0.82,
    touchMultiplier: 1.15,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  })

  const renderer  = createRenderer()
  const scene     = new THREE.Scene()
  const camera    = new THREE.PerspectiveCamera(50, getAspectRatio(), 0.01, 100)
  const raycaster = new THREE.Raycaster()
  const mouse     = new THREE.Vector2()
  const clock     = new THREE.Clock()
  const accent    = setupLights(scene)
  state.starField = setupStarField(scene)

  el.canvasWrap.appendChild(renderer.domElement)
  setCameraFromScroll(0, camera)
  loadModel(scene, camera, renderer, raycaster, mouse)
  bindDesktopEvents(renderer, scene, camera, raycaster, mouse)

  ;(function loop() {
    requestAnimationFrame(loop)
    if (!tabVisible) return  // Skip all work when tab is hidden
    lenis.raf(performance.now())
    const dt = clock.getDelta()
    state.elapsedTime += dt

    // Always update cursor, but skip heavy 3D work when overlay covers scene
    updateCursorRing()
    if (state.activeOverlay) return

    smoothParallax()
    tickScrollAnimation()
    setCameraFromScroll(state.scroll, camera)
    tickFloatingObjects()
    tickLaptopPose()
    tickObjectInteractions()
    tickBackground()
    accent.intensity = 0.9 + Math.sin(state.elapsedTime * 1.6) * 0.25

    renderer.render(scene, camera)
  })()
}

/* ══════════════════════════════════════════════
   MOBILE 3D — reduced quality
   Lower pixel ratio, no starfield, no lenis,
   simplified interaction model
══════════════════════════════════════════════ */
function initMobile3D() {
  // Don't use Lenis on mobile - native scroll is smoother with touch
  lenis = null

  const renderer  = createMobileRenderer()
  const scene     = new THREE.Scene()
  scene.background = new THREE.Color(0x080808)
  const camera    = new THREE.PerspectiveCamera(50, getAspectRatio(), 0.01, 100)
  const raycaster = new THREE.Raycaster()
  const mouse     = new THREE.Vector2()
  const clock     = new THREE.Clock()
  const accent    = setupLights(scene)
  // Starfield (lighter on mobile — same count but lower draw cost with simpler renderer)
  state.starField = setupStarField(scene)

  el.canvasWrap.appendChild(renderer.domElement)
  setCameraFromScroll(0, camera)
  loadModel(scene, camera, renderer, raycaster, mouse)
  bindMobileEvents(renderer, scene, camera, raycaster, mouse)
  bindSingleSwipeReveal()

  // Scroll handler — use native scroll on mobile (smoother than Lenis)
  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    state.scroll = clamp(window.scrollY / max, 0, 1)
    const show = state.scroll > 0.60
    if (show !== state.itemsVisible) {
      state.itemsVisible = show
      el.clickHint.style.opacity = show ? '1' : '0'
    }
  }, { passive: true })

  // Throttle to ~30fps on mobile for smoother performance
  let lastFrame = 0
  const FRAME_INTERVAL = 1000 / 30  // 30fps cap

  ;(function loop(now) {
    requestAnimationFrame(loop)
    if (!tabVisible) return  // Skip all work when tab is hidden
    if (state.activeOverlay) {  // Skip 3D render when overlay covers the scene
      clock.getDelta()  // consume delta so animations don't jump
      return
    }

    // Throttle to 30fps on mobile
    if (now - lastFrame < FRAME_INTERVAL) return
    lastFrame = now

    const dt = clock.getDelta()
    state.elapsedTime += dt

    smoothParallax()
    tickScrollAnimation()
    setCameraFromScroll(state.scroll, camera)
    tickFloatingObjects()
    tickLaptopPose()
    tickObjectInteractions()
    tickBackground()
    accent.intensity = 0.9 + Math.sin(state.elapsedTime * 1.6) * 0.25
    renderer.render(scene, camera)
  })(performance.now())
}

function createMobileRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: false, alpha: true })  // No AA on mobile — big perf win
  r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))  // Cap at 1.5x for better frame rate
  r.setSize(window.innerWidth, window.innerHeight)
  r.outputEncoding       = THREE.sRGBEncoding
  r.toneMapping         = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 0.9
  return r
}

function bindMobileEvents(renderer, scene, camera, raycaster, mouse) {
  // Tap to open overlay
  renderer.domElement.addEventListener('click', (e) => {
    if (!state.itemsVisible || state.activeOverlay || state.pendingOverlay) return
    const hits = doRaycast(e, renderer, camera, raycaster, mouse, scene)
    for (const hit of hits) {
      const id = findVal(hit.object, CLICK_TARGETS); if (!id) continue
      spawnBurst(e.clientX, e.clientY)
      state.pendingOverlay = id
      setTimeout(() => openOverlay(id), 180)
      return
    }
  })

  renderer.domElement.addEventListener('touchend', (e) => {
    if (!state.itemsVisible || state.activeOverlay || state.pendingOverlay) return
    const t = e.changedTouches[0]; if (!t) return
    const hits = doRaycast({ clientX: t.clientX, clientY: t.clientY }, renderer, camera, raycaster, mouse, scene)
    for (const hit of hits) {
      const id = findVal(hit.object, CLICK_TARGETS); if (!id) continue
      state.pendingOverlay = id
      setTimeout(() => openOverlay(id), 100)
      return
    }
  }, { passive: true })

  window.addEventListener('resize', () => {
    camera.aspect = getAspectRatio(); camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

function bindSingleSwipeReveal() {
  let startY = null
  let revealTriggered = false

  window.addEventListener('touchstart', (e) => {
    if (state.activeOverlay || state.itemsVisible) return
    startY = e.touches[0]?.clientY ?? null
    revealTriggered = false
  }, { passive: true, capture: true })

  window.addEventListener('touchmove', (e) => {
    if (startY === null || revealTriggered || state.activeOverlay || state.itemsVisible) return
    const currentY = e.touches[0]?.clientY
    if (currentY === undefined || startY - currentY < 24) return

    revealTriggered = true
    const container = document.getElementById('scroll-container')
    const revealEnd = container ? container.offsetTop + container.offsetHeight - window.innerHeight : window.innerHeight
    window.scrollTo({ top: Math.max(0, revealEnd), behavior: 'smooth' })
  }, { passive: true, capture: true })

  window.addEventListener('touchend', () => {
    startY = null
  }, { passive: true, capture: true })
}

/* ══════════════════════════════════════════════
   ID CARD MINI 3D (Pendulum Physics)
══════════════════════════════════════════════ */
function initCardMini3D() {
  const canvas = document.getElementById('card-mini-canvas');
  if (!canvas) return;

  const W = 400, H = 500;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !IS_TOUCH });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));
  renderer.setSize(W, H);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W / H, 0.01, 200);

  // Lighting — bright enough to show card textures
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcce0ff, 0.8);
  fill.position.set(-4, 2, 2);
  scene.add(fill);

  // pivotGroup rotates with the pendulum angle
  const pivotGroup = new THREE.Group();
  scene.add(pivotGroup);

  let cardReady = false;

  loadSharedGLTF().then((gltf) => {
    // Find the id_card group node
    let idCardNode = null;
    gltf.scene.traverse((n) => {
      if (n.name === 'id_card' && !idCardNode) idCardNode = n;
    });
    if (!idCardNode) return;

    // Deep-clone the full hierarchy (preserves textures/materials)
    const clone = idCardNode.clone(true);

    // Reset position/scale from world transform, keep rotation neutral first
    clone.position.set(0, 0, 0);
    clone.scale.set(1, 1, 1);
    clone.rotation.set(0, 0, 0);

    // ── Corrective rotation ──
    // GLB geometry is flat/horizontal by default after reset.
    // Rotate -90° on X to stand the card upright (portrait, facing camera).
    clone.rotation.x = -Math.PI / 2;

    // Measure bounding box AFTER corrective rotation
    const tmpScene = new THREE.Scene();
    tmpScene.add(clone);
    tmpScene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    tmpScene.remove(clone);

    // Auto-scale: fit the card's height (~0.48 units) in camera view
    // size.y is now the card height (tallest after rotation)
    const autoScale = 0.48 / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(autoScale);

    // Center the card on origin (pivot = top of card)
    clone.position.set(
      -center.x * autoScale,
      -center.y * autoScale,
      -center.z * autoScale
    );
    // Shift DOWN so origin (pivot) lands at the very TOP edge of the card
    clone.position.y -= (size.y * autoScale) * 0.5;

    pivotGroup.add(clone);

    // Camera: pull back enough to see full card
    pivotGroup.position.set(0, 0.26, 0);
    camera.position.set(0, 0, 0.95);
    camera.lookAt(0, -0.02, 0);

    // Preserve all existing textures; just force double-sided
    clone.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach(mat => {
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      });
    });

    cardReady = true;
  });

  // ── Soft pendulum physics ──
  // Low spring constant → gentle, natural swing
  const phy = { angle: 0, velocity: 0, targetAngle: 0 };
  const ropeSvg = document.getElementById('card-rope-svg');

  ;(function tick() {
    requestAnimationFrame(tick);
    if (!tabVisible || state.activeOverlay !== 'about') return;

    const spring  = -0.022 * (phy.angle - phy.targetAngle);
    const damping = -0.038 *  phy.velocity;
    phy.velocity  = (phy.velocity + spring + damping) * 0.90;
    phy.angle    += phy.velocity;
    phy.angle     = clamp(phy.angle, -28, 28);

    // Rotate SVG rope around pivot dot
    if (ropeSvg) {
      ropeSvg.style.transform = `translateX(-50%) rotate(${phy.angle}deg)`;
    }

    // Rotate the 3D group around the pivot (top of card)
    if (cardReady) {
      pivotGroup.rotation.z = -(phy.angle * Math.PI / 180);
      // Very subtle 3D tilt on velocity — feels physical without being harsh
      pivotGroup.rotation.y = phy.velocity * 0.15;
    }

    renderer.render(scene, camera);
  })();

  // ── Drag interaction ──
  let grabbed = false;
  let prevClientX = 0;

  const onStart = (clientX) => {
    if (state.activeOverlay !== 'about') return;
    grabbed = true;
    prevClientX = clientX;
    phy.velocity = 0;
  };

  const onMove = (clientX) => {
    if (!grabbed || state.activeOverlay !== 'about') return;
    const rect = canvas.getBoundingClientRect();
    const pivotX = rect.left + rect.width / 2;
    // Map distance from pivot to angle; ±half-canvas = ±25°
    const raw = ((clientX - pivotX) / (rect.width * 0.5)) * 25;
    phy.angle = clamp(raw, -28, 28);
    phy.targetAngle = phy.angle;
    phy.velocity = (clientX - prevClientX) * 0.08; // gentle flick tracking
    prevClientX = clientX;
  };

  const onEnd = () => {
    if (!grabbed) return;
    grabbed = false;
    phy.targetAngle = 0; // spring back to vertical
    // keep current velocity for natural flick release
  };

  canvas.addEventListener('mousedown',  (e) => onStart(e.clientX));
  window.addEventListener('mousemove',  (e) => onMove(e.clientX));
  window.addEventListener('mouseup',    onEnd);

  canvas.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX), { passive: true });
  window.addEventListener('touchmove',  (e) => {
    if (e.touches.length > 0) onMove(e.touches[0].clientX);
  }, { passive: true });
  window.addEventListener('touchend',   onEnd, { passive: true });

  // Gyroscope tilt (mobile)
  window.addEventListener('deviceorientation', (e) => {
    if (grabbed || state.activeOverlay !== 'about' || e.gamma === null) return;
    phy.targetAngle = clamp(e.gamma / 4, -20, 20);
  });

  // ── Scroll-driven swing ──
  // The card gently swings in the scroll direction and springs back
  const overlay = document.getElementById('ov-about');
  if (overlay) {
    let lastScrollTop = overlay.scrollTop;
    let scrollDecay = null;

    overlay.addEventListener('scroll', () => {
      if (grabbed || state.activeOverlay !== 'about') return;

      const delta = overlay.scrollTop - lastScrollTop;
      lastScrollTop = overlay.scrollTop;

      // Map scroll delta to a swing angle (scroll down → swing left, up → right)
      const swingAngle = clamp(delta * 0.35, -12, 12);
      phy.velocity += swingAngle * 0.06;

      // Reset decay timer: after scrolling stops, let spring bring card back
      clearTimeout(scrollDecay);
      scrollDecay = setTimeout(() => {
        phy.targetAngle = 0;
      }, 200);
    }, { passive: true });
  }
}



/* ══════════════════════════════════════════════
   SKILL HORIZONTAL SCROLL-ZOOM
   Vertical scroll → horizontal card slide
══════════════════════════════════════════════ */
function initSkillScrollZoom() {
  const overlay = document.getElementById('ov-about')
  const spacer  = document.getElementById('skills-spacer')
  const track   = document.getElementById('skills-track')
  if (!overlay || !spacer || !track) return

  const cards = track.querySelectorAll('.skill-card')
  if (!cards.length) return

  function update() {
    const spacerTop   = spacer.offsetTop
    const spacerH     = spacer.offsetHeight
    const overlayH    = overlay.clientHeight
    const stickyH     = overlayH  // sticky element height = viewport
    const scrollDist  = spacerH - stickyH
    if (scrollDist <= 0) return

    // Progress 0→1 through the spacer
    const scrollInSpacer = overlay.scrollTop - spacerTop
    const progress = Math.max(0, Math.min(1, scrollInSpacer / scrollDist))

    // Horizontal translate distance
    const trackWidth    = track.scrollWidth
    const viewportWidth = track.parentElement.clientWidth
    const maxTranslate  = Math.max(0, trackWidth - viewportWidth)

    // Move track left
    track.style.transform = `translateX(${-progress * maxTranslate}px)`

    // Determine which cards are near-center and mark them visible
    // Wider threshold so cards appear smoothly as they approach center
    const cardWidth = 320 + 24  // card flex-basis + gap
    const threshold = cardWidth * 0.8
    cards.forEach((card, i) => {
      const cardCenter = (i * cardWidth + cardWidth / 2) - (progress * maxTranslate)
      const vpCenter   = viewportWidth / 2
      const isActive   = Math.abs(cardCenter - vpCenter) < threshold
      card.classList.toggle('visible', isActive)
    })
  }

  overlay.addEventListener('scroll', update, { passive: true })
  // Re-run on resize to recalculate layout metrics
  window.addEventListener('resize', update)
  // Delay initial run to ensure layout is settled
  requestAnimationFrame(() => requestAnimationFrame(update))
}

/* ══════════════════════════════════════════════
   VIEW MORE BUTTON
══════════════════════════════════════════════ */
function initViewMoreButton() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-work-more]')
    if (!btn) return
    const section = btn.closest('[data-work-section]')
    if (!section) return
    section.querySelectorAll('.work-card.is-hidden[data-extra]').forEach(c => c.classList.remove('is-hidden'))
    section.classList.add('is-complete')
    const countEl = section.querySelector('[data-work-count]')
    const total   = section.querySelectorAll('.work-card').length
    if (countEl) countEl.textContent = `${total} / ${total} shown`
  })
}

/* ══════════════════════════════════════════════
   OVERLAY — open / close
   FIX: phone overlay uses display:block so footer
   is always below content, not beside it.
   FIX: about/phone overlays allow native scrolling.
══════════════════════════════════════════════ */
function openOverlay(id) {
  state.activeOverlay  = id
  state.pendingOverlay = null

  const overlayEl = document.getElementById(`ov-${id}`)
  if (!overlayEl) return

  if (lenis) lenis.stop()

  // Desktop: custom wheel handler for smooth overlay scroll
  // Mobile: use native scroll (no custom handlers - much smoother)
  if (!IS_TOUCH) {
    overlayEl._scrollTarget = overlayEl.scrollTop
    overlayEl.addEventListener('wheel', handleOverlayWheel, { passive: false })
  }
  // Mobile uses native overflow scrolling via CSS

  overlayEl.classList.add('active')
  lazyLoadMedia(overlayEl)
}

function doCloseOverlay() {
  if (!state.activeOverlay) return

  const overlayEl = document.getElementById(`ov-${state.activeOverlay}`)
  if (overlayEl) {
    overlayEl.classList.remove('active')
    overlayEl.removeEventListener('wheel', handleOverlayWheel)
    // Mobile uses native scroll - no touch handlers to remove
    overlayEl.scrollTop     = 0
    overlayEl._scrollTarget = 0
    if (overlayEl._scrollRaf) {
      cancelAnimationFrame(overlayEl._scrollRaf)
      overlayEl._scrollRaf = null
    }
  }

  state.activeOverlay = null
  if (lenis) lenis.start()
}

// Expose globally for onclick="closeOv()" and mobile tiles
window.closeOv        = doCloseOverlay
window.openOverlayById = openOverlay

function handleOverlayWheel(e) {
  e.preventDefault(); e.stopPropagation()
  const ov  = e.currentTarget
  const max = ov.scrollHeight - ov.clientHeight
  ov._scrollTarget = clamp((ov._scrollTarget ?? ov.scrollTop) + e.deltaY * 0.8, 0, max)
  if (!ov._scrollRaf) animateOverlayScroll(ov)
}

function handleOverlayTouchStart(e) {
  const touch = e.touches[0]
  if (!touch) return

  e.currentTarget._touchY = touch.clientY
}

function handleOverlayTouchMove(e) {
  // Don't intercept touches on interactive elements or the 3D card canvas
  if (e.target.closest('video, button, a, input, textarea, select, canvas')) return

  const touch = e.touches[0]
  const ov = e.currentTarget
  if (!touch || ov._touchY === null || ov._touchY === undefined) return

  const delta = ov._touchY - touch.clientY
  const max = ov.scrollHeight - ov.clientHeight

  if (max <= 0) return

  e.preventDefault()
  e.stopPropagation()

  ov.scrollTop = clamp(ov.scrollTop + delta, 0, max)
  ov._touchY = touch.clientY
  updateFolderParallax(ov)
}

function animateOverlayScroll(ov) {
  const diff = ov._scrollTarget - ov.scrollTop
  if (Math.abs(diff) < 0.5) {
    ov.scrollTop = ov._scrollTarget; ov._scrollRaf = null
    updateFolderParallax(ov); return
  }
  ov.scrollTop += diff * 0.12
  updateFolderParallax(ov)
  ov._scrollRaf = requestAnimationFrame(() => animateOverlayScroll(ov))
}

function updateFolderParallax(ov) {
  if (ov.id !== 'ov-laptop') return
  ov.querySelectorAll('.work-category').forEach(cat => {
    const rect = cat.getBoundingClientRect()
    if (rect.top <= 0) {
      const d = Math.abs(rect.top)
      cat.style.transform = `scale(${clamp(1 - d / 2500, 0.92, 1)})`
      cat.style.filter    = `brightness(${clamp(1 - d / 1000, 0.4, 1)})`
    } else {
      cat.style.transform = 'scale(1)'
      cat.style.filter    = 'brightness(1)'
    }
  })
}

function lazyLoadMedia(overlayEl) {
  overlayEl.querySelectorAll('img[data-src]').forEach(img => {
    img.src = img.dataset.src; img.removeAttribute('data-src')
  })
  overlayEl.querySelectorAll('video[data-src]').forEach(v => {
    v.src = v.dataset.src; v.removeAttribute('data-src'); v.load()
  })
  overlayEl.querySelectorAll('video source[data-src]').forEach(s => {
    s.src = s.dataset.src; s.removeAttribute('data-src'); s.closest('video')?.load()
  })

  if (overlayEl.id === 'ov-laptop' && !overlayEl._hasObserver) {
    overlayEl._hasObserver = true
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in-view'), 50)
          obs.unobserve(entry.target)
        }
      })
    }, { root: overlayEl, threshold: 0.05, rootMargin: '0px 0px -40px 0px' })
    overlayEl.querySelectorAll('.work-card').forEach(c => obs.observe(c))
  }
}

/* ══════════════════════════════════════════════
   LOADING
══════════════════════════════════════════════ */
function setLoadingProgress(pct, status) {
  const bar  = document.getElementById('loading-bar-fill')
  const pEl  = document.getElementById('loading-pct')
  const sEl  = document.getElementById('loading-status')
  if (bar) bar.style.width = pct + '%'
  if (pEl) pEl.textContent = pct + '%'
  if (sEl && status) sEl.textContent = status
}

function dismissLoadingScreen() {
  const screen = document.getElementById('loading-screen')
  const app    = document.getElementById('app')
  if (screen) { screen.classList.add('loader-exit'); setTimeout(() => screen.remove(), 1150) }
  if (app)    { app.classList.remove('app-hidden'); app.classList.add('app-visible') }
}

/* ══════════════════════════════════════════════
   THREE.JS HELPERS
══════════════════════════════════════════════ */
function createRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  r.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  r.setSize(window.innerWidth, window.innerHeight)
  r.outputEncoding       = THREE.sRGBEncoding
  r.toneMapping          = THREE.ACESFilmicToneMapping
  r.toneMappingExposure  = 0.9
  return r
}

function setupLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.1))
  const key  = new THREE.DirectionalLight(0xffffff, 0);   key.position.set(4, 8, 5);   scene.add(key)
  const fill = new THREE.DirectionalLight(0xcce0ff, 3);  fill.position.set(-10, 3, 2); scene.add(fill)
  const rim  = new THREE.DirectionalLight(0xffffff, 0.25); rim.position.set(0, 4, -6); scene.add(rim)
  const pt   = new THREE.PointLight(0xfffdd0, 1.0, 18);   pt.position.set(0, 5, 3);   scene.add(pt)
  return pt
}

function setupStarField(scene) {
  const pos = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    pos[i*3]   = randomBetween(-4.8, 4.8)
    pos[i*3+1] = randomBetween(-1.2, 5.2)
    pos[i*3+2] = randomBetween(-4.2, -1.4)
  }
  const geo  = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat  = new THREE.PointsMaterial({ color: 0xb9faff, size: 0.018, transparent: true, opacity: 0.48, depthWrite: false })
  const stars = new THREE.Points(geo, mat)
  stars.renderOrder = -1; scene.add(stars)
  return stars
}

/* ══════════════════════════════════════════════
   MODEL
══════════════════════════════════════════════ */
function loadModel(scene, camera, renderer, raycaster, mouse) {
  setLoadingProgress(10, 'Loading 3D model…')

  // Fallback: if server doesn't report content-length, slowly tick progress
  let fallbackTimer = setInterval(() => {
    const bar = document.getElementById('loading-bar-fill')
    if (!bar) return
    const current = parseFloat(bar.style.width) || 10
    if (current < 70) {
      const next = current + (70 - current) * 0.04  // asymptotic approach to 70
      setLoadingProgress(Math.round(next), 'Loading 3D model…')
    }
  }, 300)

  new GLTFLoader().load(MODEL_URL,
    (gltf) => {
      clearInterval(fallbackTimer)
      state.model = gltf.scene
      setLoadingProgress(80, 'Building scene…')
      centerModel(state.model)
      scene.add(state.model)
      addHeroPlane(scene)
      traverseModel(state.model)
      setupMixers(gltf.animations)
      scrubAnimations(0)
      setLoadingProgress(100, 'Ready!')
      setTimeout(dismissLoadingScreen, 600)
    },
    (xhr) => {
      if (xhr.lengthComputable) {
        clearInterval(fallbackTimer)
        setLoadingProgress(Math.round((xhr.loaded / xhr.total) * 70) + 10, 'Loading 3D model…')
      }
    },
    (err) => {
      clearInterval(fallbackTimer)
      console.error('GLB error:', err)
      setLoadingProgress(100, 'Ready!')
      setTimeout(dismissLoadingScreen, 400)
    }
  )
}

function centerModel(m) {
  const box    = new THREE.Box3().setFromObject(m)
  const center = box.getCenter(new THREE.Vector3())
  const size   = box.getSize(new THREE.Vector3())
  // Mobile: smaller model scale so it fits on screen without being cut off
  const maxScale = IS_TOUCH ? 1.5 : 2.6
  const scale  = maxScale / Math.max(size.x, size.y, size.z)
  m.scale.setScalar(scale)
  m.position.copy(center.multiplyScalar(-scale))
  m.position.y -= 0.2
}

function addHeroPlane(scene) {
  new THREE.TextureLoader().load(HERO_IMAGE_URL, (tex) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 0.7),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    )
    mesh.position.set(0, 1.8, -2); scene.add(mesh)
  })
}

function traverseModel(model) {
  model.traverse((obj) => {
    state.nodes[obj.name] = obj
    if (!obj.isMesh) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach(mat => {
      mat.side = THREE.DoubleSide; mat.depthWrite = true
      if (mat.color) {
        const hsl = {}; mat.color.getHSL(hsl)
        if (hsl.l > 0.75 && hsl.s < 0.15) mat.color.setHSL(0.58, 0.07, 0.54)
      }
      if (mat.roughness !== undefined) mat.roughness = Math.min(mat.roughness + 0.1, 0.92)
      if (mat.metalness !== undefined) mat.metalness = Math.max(mat.metalness - 0.1, 0)
      mat.needsUpdate = true
    })
  })

  Object.values(INTERACTION_ROOTS).forEach(name => {
    const node = state.nodes[name]
    if (!node || state.interactions[name]) return
    const m = OBJECT_SCALE_MULTIPLIERS[name]
    if (m) node.scale.multiplyScalar(m)
    state.interactions[name] = { hover: 0, click: 0, baseScale: node.scale.clone() }
  })
}

function setupMixers(animations) {
  animations.forEach(clip => {
    if (SKIPPED_ANIMATIONS.has(clip.name)) return
    const mixer  = new THREE.AnimationMixer(state.model)
    const action = mixer.clipAction(clip)
    action.loop = THREE.LoopOnce; action.clampWhenFinished = true; action.play()
    state.maxAnimDuration = Math.max(state.maxAnimDuration, clip.duration)
    state.mixers.push({ mixer, action, duration: clip.duration })
  })
}

function scrubAnimations(time) {
  const p = state.maxAnimDuration > 0 ? time / state.maxAnimDuration : 0
  state.mixers.forEach(({ mixer, action, duration }) => {
    action.time = clamp(p * duration, 0, duration - 0.0001)
    mixer.update(0)
  })
}

/* ══════════════════════════════════════════════
   DESKTOP EVENTS
══════════════════════════════════════════════ */
function bindDesktopEvents(renderer, scene, camera, raycaster, mouse) {
  // Scroll
  lenis.on('scroll', ({ scroll: scrollY }) => {
    const max       = document.documentElement.scrollHeight - window.innerHeight
    state.scroll    = clamp(scrollY / max, 0, 1)
    el.progress.style.width = `${state.scroll * 100}%`
    el.scrollHint.style.opacity = state.scroll > 0.07 ? '0' : '1'
    const show = state.scroll > 0.60
    if (show !== state.itemsVisible) {
      state.itemsVisible = show
      el.clickHint.style.opacity = show ? '1' : '0'
    }
  })

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = getAspectRatio(); camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // Click / tap
  renderer.domElement.addEventListener('click', (e) => {
    if (!state.itemsVisible || state.activeOverlay || state.pendingOverlay) return
    const hits = doRaycast(e, renderer, camera, raycaster, mouse, scene)
    for (const hit of hits) {
      const id = findVal(hit.object, CLICK_TARGETS); if (!id) continue
      const name = findVal(hit.object, INTERACTION_ROOTS)
      if (name && state.interactions[name]) state.interactions[name].click = 1
      spawnBurst(e.clientX, e.clientY)
      state.pendingOverlay = id
      setTimeout(() => openOverlay(id), 180)
      return
    }
  })

  renderer.domElement.addEventListener('touchend', (e) => {
    if (!state.itemsVisible || state.activeOverlay || state.pendingOverlay) return
    const t = e.changedTouches[0]; if (!t) return
    const hits = doRaycast({ clientX: t.clientX, clientY: t.clientY }, renderer, camera, raycaster, mouse, scene)
    for (const hit of hits) {
      const id = findVal(hit.object, CLICK_TARGETS); if (!id) continue
      state.pendingOverlay = id
      setTimeout(() => openOverlay(id), 100)
      return
    }
  }, { passive: true })

  // Mouse move — cursor + parallax + hover
  window.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX; state.mouseY = e.clientY
    el.cursor.style.left = `${e.clientX}px`; el.cursor.style.top = `${e.clientY}px`
    state.rawParallax.x = (e.clientX / window.innerWidth  - 0.5) * 2
    state.rawParallax.y = (e.clientY / window.innerHeight - 0.5) * 2

    if (!state.model) return
    const hits = doRaycast(e, renderer, camera, raycaster, mouse, scene)

    // Labels
    document.querySelectorAll('.ilabel').forEach(l => { l.style.opacity = '0' })
    if (state.itemsVisible) {
      for (const hit of hits) {
        const lId = findVal(hit.object, LABEL_TARGETS); if (!lId) continue
        const label = document.getElementById(lId)
        if (label) { label.style.opacity = '1'; label.style.transform = 'translateY(0px)' }
        break
      }
    }

    // Hover name
    state.hoveredObjectName = null
    if (state.itemsVisible) {
      for (const hit of hits) {
        const n = findVal(hit.object, INTERACTION_ROOTS)
        if (n) { state.hoveredObjectName = n; break }
      }
    }

    // Custom cursor
    const hot = Boolean(state.hoveredObjectName)
    el.cursor.style.transform     = hot ? 'translate(-50%,-50%) scale(3)' : 'translate(-50%,-50%) scale(1)'
    el.cursorRing.style.width     = hot ? '52px' : '32px'
    el.cursorRing.style.height    = hot ? '52px' : '32px'
    el.cursorRing.style.borderColor = hot ? 'rgba(0,240,255,0.9)' : 'rgba(0,240,255,0.35)'
    renderer.domElement.style.cursor = hot ? 'pointer' : 'default'
  })
}

function doRaycast(event, renderer, camera, raycaster, mouse, scene) {
  mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const meshes = []; scene.traverse(c => { if (c.isMesh) meshes.push(c) })
  return raycaster.intersectObjects(meshes, true)
}

function spawnBurst(x, y) {
  const b = document.createElement('div')
  b.className = 'click-burst'; b.style.left = `${x}px`; b.style.top = `${y}px`
  b.addEventListener('animationend', () => b.remove(), { once: true })
  document.body.appendChild(b)
}

/* ══════════════════════════════════════════════
   ANIMATION TICK
══════════════════════════════════════════════ */
function updateCursorRing() {
  state.ringX += (state.mouseX - state.ringX) * 0.1
  state.ringY += (state.mouseY - state.ringY) * 0.1
  el.cursorRing.style.left = `${state.ringX}px`
  el.cursorRing.style.top  = `${state.ringY}px`
}

function smoothParallax() {
  state.parallax.x += (state.rawParallax.x * PARALLAX_STRENGTH - state.parallax.x) * 0.06
  state.parallax.y += (state.rawParallax.y * PARALLAX_STRENGTH - state.parallax.y) * 0.06
}

function tickScrollAnimation() {
  if (!state.mixers.length || !state.maxAnimDuration) return
  state.smoothScroll += (state.scroll - state.smoothScroll) * 0.4
  scrubAnimations(state.smoothScroll * state.maxAnimDuration)
}

function setCameraFromScroll(progress, camera) {
  const path = IS_TOUCH ? MOBILE_CAMERA_PATH : CAMERA_PATH
  let s = path[0], e = path[1]
  for (let i = 0; i < path.length - 1; i++) {
    if (progress >= path[i].t && progress <= path[i+1].t) {
      s = path[i]; e = path[i+1]; break
    }
  }
  const len  = e.t - s.t
  const t    = len < 0.0001 ? 1 : easeInOut((progress - s.t) / len)
  const lerp = (a, b) => a + (b - a) * t
  camera.position.set(
    lerp(s.px, e.px) + state.parallax.x,
    lerp(s.py, e.py) + state.parallax.y * 0.3,
    lerp(s.pz, e.pz)
  )
  camera.lookAt(
    lerp(s.lx, e.lx) + state.parallax.x * 0.5,
    lerp(s.ly, e.ly),
    lerp(s.lz, e.lz)
  )
}

function tickFloatingObjects() {
  if (!state.model || !state.itemsVisible) return
  Object.entries(FLOATING_OBJECTS).forEach(([name, cfg]) => {
    const node = state.nodes[name]; if (!node) return
    if (state.originalY[name] === undefined && state.scroll > 0.95) state.originalY[name] = node.position.y
    if (state.originalY[name] !== undefined)
      node.position.y = state.originalY[name] + Math.sin(state.elapsedTime * cfg.speed + cfg.phase) * cfg.amplitude
  })
}

function tickLaptopPose() {
  const laptop = state.nodes.Base
  const screen = state.nodes.Screen
  if (laptop && state.originalY.Base !== undefined)
    laptop.position.y = state.originalY.Base + clamp((state.scroll - 0.6) / 0.2, 0, 1) * 0.8
  if (screen)
    screen.rotation.x = -Math.PI * 0.6 * clamp((state.scroll - 0.8) / 0.2, 0, 1)
}

function tickObjectInteractions() {
  Object.entries(state.interactions).forEach(([name, ia]) => {
    const node = state.nodes[name]; if (!node) return
    const hT   = state.hoveredObjectName === name && state.itemsVisible ? 1 : 0
    ia.hover  += (hT - ia.hover) * 0.14
    ia.click  *= 0.82
    const lift  = ia.hover * 0.08
    const pulse = Math.sin(state.elapsedTime * 7) * ia.hover * 0.018
    const click = Math.sin(ia.click * Math.PI) * 0.12
    const sc    = 1 + ia.hover * 0.035 + click
    node.scale.set(ia.baseScale.x * sc, ia.baseScale.y * sc, ia.baseScale.z * sc)
    if (state.originalY[name] !== undefined) node.position.y += lift + pulse
  })
}

function tickBackground() {
  if (!state.starField) return
  state.starField.rotation.z      = Math.sin(state.elapsedTime * 0.08) * 0.025
  state.starField.position.x      = state.parallax.x * 0.55
  state.starField.position.y      = state.parallax.y * 0.18
  state.starField.material.opacity = 0.42 + Math.sin(state.elapsedTime * 0.9) * 0.08
}

/* ══════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════ */
function findVal(object, map) {
  let cur = object
  while (cur) { if (map[cur.name]) return map[cur.name]; cur = cur.parent }
  return null
}
function easeInOut(v)     { return v < 0.5 ? 2*v*v : -1 + (4 - 2*v) * v }
function clamp(v, a, b)   { return Math.max(a, Math.min(b, v)) }
function randomBetween(a, b) { return a + Math.random() * (b - a) }
function getAspectRatio() { return window.innerWidth / window.innerHeight }

/* ══════════════════════════════════════════════
   GOOGLE DRIVE LINK HELPERS
══════════════════════════════════════════════ */
function getDriveFileId(url) {
  if (!url) return null
  // Match: /file/d/ID/... or ?id=ID or /d/ID/
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

function isDriveLink(url) {
  return url && (url.includes('drive.google.com') || url.includes('docs.google.com'))
}

function driveImageUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`
}

function driveVideoEmbed(fileId) {
  return `<iframe src="https://drive.google.com/file/d/${fileId}/preview" allow="autoplay" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;display:block"></iframe>`
}

/* ══════════════════════════════════════════════
   WORK ITEMS — load from API (local) or data.json (deployed)
══════════════════════════════════════════════ */
async function initWorkFromAPI() {
  let items = null

  // 1) Try live API first (works on localhost with Express server)
  try {
    const res = await fetch('/api/items')
    const json = await res.json()
    if (json.success && json.data) {
      items = json.data
      console.log('[Portfolio] Loaded items from /api/items')
    }
  } catch (_) {
    // API not available (e.g. GitHub Pages) — fall through
  }

  // 2) Fallback: read static data.json (deployed via GitHub Pages)
  if (!items) {
    try {
      const res = await fetch('./data.json')
      const json = await res.json()
      if (json.success && json.data) {
        items = json.data
        console.log('[Portfolio] Loaded items from data.json')
      }
    } catch (err) {
      console.warn('[Portfolio] Could not load items from API or data.json:', err.message)
      return
    }
  }

  if (!items || !items.length) return

  // Normalize absolute paths to relative (for GitHub Pages subpath deployment)
  items.forEach(item => {
    if (item.file_path && item.file_path.startsWith('/')) {
      item.file_path = '.' + item.file_path
    }
  })

  // Group by category
  const groups = {}
  items.forEach(item => {
    if (!groups[item.category]) groups[item.category] = []
    groups[item.category].push(item)
  })

  // Find each section and populate
  document.querySelectorAll('[data-work-section][data-category]').forEach(section => {
    const catKey = section.dataset.category
    const catItems = groups[catKey] || []
    const grid = section.querySelector('[data-work-grid]')
    if (!grid) return

    const categoryLabel = (catItems[0]?.category_label || catKey).toUpperCase()

    grid.innerHTML = catItems.map(item => {
      const hiddenClass = item.is_extra ? 'is-hidden' : ''
      const extraAttr = item.is_extra ? 'data-extra' : ''
      const fileId = isDriveLink(item.file_path) ? getDriveFileId(item.file_path) : null

      let media
      if (fileId && item.file_type === 'video') {
        if (IS_TOUCH) {
          // Mobile: show thumbnail, lazy-load iframe on tap (saves massive resources)
          media = `<img src="${driveImageUrl(fileId)}" alt="${item.title}" data-drive-video="${fileId}" style="cursor:pointer">`
        } else {
          // Desktop: lazy iframe (loads only when scrolled into view)
          media = `<iframe src="https://drive.google.com/file/d/${fileId}/preview" loading="lazy" allow="autoplay" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;display:block;pointer-events:none"></iframe>`
        }
      } else if (fileId && item.file_type === 'image') {
        // Google Drive image — use thumbnail URL
        media = `<img src="${driveImageUrl(fileId)}" alt="${item.title}">`
      } else if (item.file_type === 'video') {
        // Local video
        media = `<video data-src="${item.file_path}" muted preload="metadata" controls></video>`
      } else {
        // Local image
        media = `<img data-src="${item.file_path}" alt="${item.title}">`
      }

      return `<article class="work-card ${item.size_class} ${hiddenClass}" ${extraAttr}>${media}<div class="work-meta"><strong>${item.title}</strong><span>${categoryLabel}</span></div></article>`
    }).join('')

    // Update count
    const visible = catItems.filter(i => !i.is_extra).length
    const total = catItems.length
    const countEl = section.querySelector('[data-work-count]')
    if (countEl) countEl.textContent = `${visible} / ${total} shown`

    // Hide "View More" button if no extras
    if (visible === total) {
      const actions = section.querySelector('.work-actions')
      if (actions) actions.style.display = 'none'
    }
  })
  // After all cards rendered, add mobile video play buttons
  addMobileVideoPlayButtons()
}

/* ══════════════════════════════════════════════
   MOBILE VIDEO PLAY BUTTONS
   Adds a play overlay to video cards on mobile
   so scrolling works but videos remain tappable
══════════════════════════════════════════════ */
function addMobileVideoPlayButtons() {
  if (!IS_TOUCH) return

  document.querySelectorAll('.work-card').forEach(card => {
    const video   = card.querySelector('video')
    const iframe  = card.querySelector('iframe')
    const driveImg = card.querySelector('img[data-drive-video]')
    if (!video && !iframe && !driveImg) return

    // Skip if play button already added
    if (card.querySelector('.work-card-play')) return

    const btn = document.createElement('button')
    btn.className = 'work-card-play'
    btn.innerHTML = '&#9654;'  // ▶
    btn.setAttribute('aria-label', 'Play video')

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (video) {
        video.style.pointerEvents = 'auto'
        video.removeAttribute('controls')
        video.play().catch(() => {})
        video.addEventListener('click', () => {
          if (video.paused) video.play().catch(() => {})
          else video.pause()
        })
      } else if (driveImg) {
        // Lazy-load Drive iframe on tap (replaces thumbnail)
        const fileId = driveImg.dataset.driveVideo
        const iframe = document.createElement('iframe')
        iframe.src = `https://drive.google.com/file/d/${fileId}/preview`
        iframe.allow = 'autoplay'
        iframe.allowFullscreen = true
        iframe.style.cssText = 'width:100%;border:none;display:block;pointer-events:auto'
        driveImg.replaceWith(iframe)
      } else if (iframe) {
        iframe.style.pointerEvents = 'auto'
        iframe.click()
      }
      btn.style.display = 'none'
    })

    card.appendChild(btn)
  })
}
