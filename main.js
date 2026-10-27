// The one renderer. It consumes `render.scene/1` and knows nothing about street cells, OSM or Twinton apps: nodes,
// bounds, LOD levels, interest and capabilities. The same file is meant to run on the maps page, locally and in a
// native window; the backend under it is replaceable (WebGL2 now, WebGPU/native/RTX behind the same packets).
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-US'));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- backend: WebGL2
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a0f);
scene.fog = new THREE.FogExp2(0x0a0f16, 0.0026);
const camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.4, 2600);
camera.position.set(0, 12, 60);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.5, -40);
controls.enableDamping = true; controls.dampingFactor = 0.075;
controls.minDistance = 2.2; controls.maxDistance = 500; controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

const hemi = new THREE.HemisphereLight(0xa9ccff, 0x241b12, 0.9);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x7f93aa, 0.4);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xffe3bc, 2.0);
sun.position.set(-120, 150, 70); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -180; sun.shadow.camera.right = 180; sun.shadow.camera.top = 210; sun.shadow.camera.bottom = -210;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 520; sun.shadow.bias = -0.0004;
scene.add(sun);
let skyMesh;
{
  const geo = new THREE.SphereGeometry(1500, 32, 16);
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x03060d) }, mid: { value: new THREE.Color(0x0b1a2a) }, low: { value: new THREE.Color(0x2b1d18) } },
    vertexShader: 'varying vec3 v; void main(){ v = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 v; uniform vec3 top, mid, low; void main(){ float h = normalize(v).y; vec3 c = mix(low, mid, smoothstep(-0.08, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.55, h)); gl_FragColor = vec4(c,1.0); }' });
  skyMesh = new THREE.Mesh(geo, mat);
  scene.add(skyMesh);
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, { repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noise(ctx, w, h, base, n, a = 0.14) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = Math.floor(rnd(i + 3.1) * 52); ctx.fillStyle = `rgba(${v + 16},${v + 18},${v + 22},${a})`; ctx.fillRect(rnd(i + 8.2) * w, rnd(i + 1.7) * h, 1 + rnd(i) * 2.5, 1 + rnd(i + 4) * 2.5); }
}
const asphaltTex = canvasTex(256, 256, (ctx, w, h) => noise(ctx, w, h, '#1b1f25', 1500, 0.22), { repeat: [6, 42] });
const pavingTex = canvasTex(256, 256, (ctx, w, h) => { noise(ctx, w, h, '#5d626b', 1000, 0.16); ctx.strokeStyle = 'rgba(20,24,30,.45)'; ctx.lineWidth = 2; for (let y = 0; y <= h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } for (let x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } }, { repeat: [3, 20] });
const glowTex = canvasTex(64, 64, (ctx, w, h) => { const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,220,170,1)'); g.addColorStop(.25, 'rgba(255,190,110,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); });
function signTex(text) {
  return canvasTex(512, 128, (ctx, w, h) => { ctx.fillStyle = '#0b1118'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(255,200,140,.55)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6); ctx.fillStyle = '#ffd9a0'; ctx.font = '700 62px "PingFang SC","Microsoft YaHei",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 3, w - 30); });
}
function textSprite(text, { w = 640, h = 110, fg = '#dff6ff' } = {}) {
  const tex = canvasTex(w, h, (ctx) => { ctx.fillStyle = 'rgba(6,12,18,.92)'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(84,224,255,.45)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4); ctx.fillStyle = fg; ctx.font = '600 38px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 2, w - 24); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(6.6, 1.14, 1); return s;
}

// ---------------------------------------------------------------- groups and helpers
const staticGroup = new THREE.Group(); scene.add(staticGroup);
const dynamicGroup = new THREE.Group(); scene.add(dynamicGroup);
const overlayGroup = new THREE.Group(); scene.add(overlayGroup);
const labelGroup = new THREE.Group(); scene.add(labelGroup);
const fxGroup = new THREE.Group(); scene.add(fxGroup);
const groundGroup = new THREE.Group(); scene.add(groundGroup);
const studioGroup = new THREE.Group(); scene.add(studioGroup);
let studio = false, lampView = null;

function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0.1, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 0.7 }));
  m.castShadow = !!opts.cast; m.receiveShadow = !!opts.receive; return m;
}
function ribbon(points, width, y, material) {
  if (!points || points.length < 2) return null;
  const pos = [], uvs = [], idx = []; let dist = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const nx = -dy, ny = dx;
    if (i > 0) dist += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    for (const s of [-1, 1]) { pos.push(p.x + nx * width * 0.5 * s, y, -(p.y + ny * width * 0.5 * s)); uvs.push(s < 0 ? 0 : 1, dist * 0.08); }
    if (i < points.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}
const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0xcfd5dd, roughness: 0.88, metalness: 0.04 });
const paving = new THREE.MeshStandardMaterial({ map: pavingTex, color: 0xc9cfd8, roughness: 0.86, metalness: 0.03 });

// ---------------------------------------------------------------- scene state
let doc = null, revision = -1, selected = null, lodMode = 'auto', firstScene = true;
let nodeMap = new Map(), lodItems = [], carViews = new Map(), pedViews = new Map(), signalLamps = new Map(), cellGroups = new Map();
let lastFeedKey = new Set(), lastEnd = new Map(), lastGood = 0, lodHi = 0, lodLo = 0;

function clearGroup(g) {
  while (g.children.length) { const o = g.children.pop(); o.traverse?.((x) => { x.geometry?.dispose?.(); if (x.material) [].concat(x.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); }); }
}

function build(d) {
  clearGroup(staticGroup); clearGroup(dynamicGroup); clearGroup(overlayGroup); clearGroup(labelGroup); clearGroup(fxGroup); clearGroup(groundGroup); clearGroup(studioGroup); lampView = null;
  nodeMap = new Map(); lodItems = []; carViews.clear(); pedViews.clear(); signalLamps = new Map(); cellGroups = new Map(); selected = null;
  // parents first, so a child can find its group
  for (const n of d.nodes) if (n.kind === 'group' || !n.parent) {
    const g = new THREE.Group(); g.userData.node = n; staticGroup.add(g); nodeMap.set(n.id, g);
    if (n.bounds) cellGroups.set(n.id, { node: n, group: g });
  }
  for (const n of d.nodes) buildNode(n);
  if (d.style === 'studio') enterStudio(d);
  buildOverlay();
}

function buildNode(n) {
  const parent = n.parent ? nodeMap.get(n.parent) : staticGroup;
  if (!parent) return;
  // groups were created in the first pass; the rest may still be a group with children
  if (n.kind === 'group') {
    if (!nodeMap.has(n.id)) { const g = new THREE.Group(); g.userData.node = n; parent.add(g); nodeMap.set(n.id, g); }
    return;
  }
  if (n.kind === 'ground') return buildGround(n, parent);
  if (n.kind === 'label') {
    const s = textSprite(n.text || n.id); s.position.set(n.at?.x || 0, n.at?.y || 15, n.at?.z || 0); s.userData.cell = n.parent; labelGroup.add(s); return;
  }
  if (n.kind === 'cars') {
    const g = new THREE.Group(); g.userData.cell = n.cell; parent.add(g);
    nodeMap.set(n.id, g);
    return;
  }
  if (n.lod) {
    const container = new THREE.Group(); parent.add(container);
    const levels = [];
    for (const lv of n.lod) {
      const g = new THREE.Group(); g.visible = false; container.add(g);
      buildGeometry(n, lv.geometry, g);
      levels.push({ sse: lv.sse, group: g });
    }
    const height = n.kind === 'buildings' ? Math.max(6, ...(n.lod?.[n.lod.length - 1]?.geometry?.buildings || []).map((b) => b.height_m || 12)) : n.kind === 'props' ? 7.5 : 10;
    lodItems.push({ node: n, levels, container, height, bounds: n.bounds, kind: n.kind });
    nodeMap.set(n.id, container);
    return;
  }
  buildGeometry(n, n.geometry, parent);
}

function buildGeometry(n, geo, parent) {
  if (!geo || geo.kind === 'empty') return;
  if (geo.kind === 'buildings') buildBuildingsHigh(geo.buildings || [], parent);
  else if (geo.kind === 'boxes') buildBuildingsLow(geo.boxes || [], parent);
  else if (geo.kind === 'roads') buildRoads(geo.roads || [], parent);
  else if (geo.kind === 'props') buildProps(geo.props || [], parent);
  else if (geo.kind === 'lamp') buildLamp(geo.lamp || {}, parent);
  else if (geo.kind === 'signals') buildSignals(geo.signals || [], parent, n);
}

function buildGround(n, parent) {
  const b = n.geometry?.bounds || { x0: -286, x1: 279, y0: -243, y1: 318 };
  const g = new THREE.PlaneGeometry(b.x1 - b.x0, b.y1 - b.y0); g.rotateX(-Math.PI / 2);
  const tex = new THREE.TextureLoader().load(n.geometry?.url || '/assets/huafa-satellite.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const m = new THREE.MeshBasicMaterial({ map: tex, color: 0xb9c0ca });
  const mesh = new THREE.Mesh(g, m); mesh.position.set((b.x0 + b.x1) / 2, -0.02, -(b.y0 + b.y1) / 2); parent.add(mesh);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0x06090d })); base.rotation.x = -Math.PI / 2; base.position.y = -0.08; parent.add(base);
}

function buildBuildingsHigh(bs, parent) {
  const paletteC = [0x5b6878, 0x667385, 0x536071, 0x6b7686], paletteR = [0x6a645c, 0x756e61, 0x5e5b54, 0x7a7264];
  const signs = ['便利店', '茶餐厅', '手机维修', '打印店', '五金', '水果', '裁缝', '药店'];
  const winMatrices = [], winColors = [];
  for (const b of bs) {
    const pts = b.pts || []; if (pts.length < 3) continue;
    const h = Math.max(3, b.height_m || 12);
    const shape = new THREE.Shape(); shape.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y); shape.closePath();
    let geo; try { geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }); } catch { continue; }
    geo.rotateX(-Math.PI / 2);
    const commercial = b.kind === 'commercial' || h > 32;
    const col = (commercial ? paletteC : paletteR)[hash(String(b.id)) % 4];
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, metalness: commercial ? 0.24 : 0.06, emissive: 0x070a0e, emissiveIntensity: 0.5 }));
    mesh.position.y = 0.1; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const face = cx < 0 ? x1 + 0.06 : x0 - 0.06, dir = cx < 0 ? 1 : -1;
    // a window grid on the street-facing facade, one instanced draw for the whole cell
    const span = Math.max(2, y1 - y0);
    const cols = clamp(Math.floor(span / 2.7), 1, 24);
    const rows = clamp(Math.floor((h - 6) / 3.0), 1, 38);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, dir * Math.PI / 2, 0));
    const seed = hash(String(b.id));
    const warm = [0xffd9a0, 0xffc477, 0xffe6bf, 0xbfe2ff, 0x9ccfff];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const y = 5.6 + r * 3.0; if (y > h - 1.2) break;
      const z = y0 + (c + 0.5) * (span / cols);
      const lit = (seed + r * 31 + c * 7) % 100 > 38;
      const mm = new THREE.Matrix4().compose(new THREE.Vector3(face, y, -z), q, new THREE.Vector3(1.22, 1.32, 1));
      winMatrices.push(mm);
      winColors.push(lit ? new THREE.Color(warm[(seed + r + c) % warm.length]).multiplyScalar(0.55 + rnd(seed + r * 3 + c) * 0.7) : new THREE.Color(0x1a2733).multiplyScalar(0.6));
    }
    // side facades: a corner seen up close is not a blank wall
    const spanX = Math.max(2, x1 - x0);
    const colsX = clamp(Math.floor(spanX / 3.0), 1, 18);
    for (const side of [0, 1]) {
      const qz = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side === 0 ? 0 : Math.PI, 0));
      const zz = side === 0 ? -y0 + 0.06 : -y1 - 0.06;
      for (let r = 0; r < rows; r++) for (let c = 0; c < colsX; c++) {
        const y = 5.6 + r * 3.0; if (y > h - 1.2) break;
        const xx = x0 + (c + 0.5) * (spanX / colsX);
        const lit = (seed + 101 + r * 17 + c * 5) % 100 > 50;
        winMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(xx, y, zz), qz, new THREE.Vector3(1.15, 1.28, 1)));
        winColors.push(lit ? new THREE.Color(warm[(seed + r + c) % warm.length]).multiplyScalar(0.4 + rnd(seed + r * 5 + c) * 0.5) : new THREE.Color(0x17232e).multiplyScalar(0.6));
      }
    }
    const sw = Math.min((y1 - y0) * 0.7, 12);
    const front = box(0.22, 3.2, sw, 0x4a2f1c, { emissive: 0xffb15c, ei: 0.8 }); front.position.set(face + dir * 0.1, 1.95, -cy); parent.add(front);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(sw, 9), 1.5), new THREE.MeshBasicMaterial({ map: signTex(b.name || signs[hash(String(b.id) + 'shop') % signs.length]), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(face + dir * 0.42, 4.75, -cy); sign.rotation.y = dir * Math.PI / 2; parent.add(sign);
    if (h > 18) for (let i = 0; i < 3; i++) { const ac = box(1.6 + rnd(b.id + i) * 1.8, 1.2, 1.4, 0x5b626c, { rough: 0.9 }); ac.position.set(x0 + (x1 - x0) * (0.25 + rnd(b.id + i * 2) * 0.5), h + 0.7, -(y0 + (y1 - y0) * (0.25 + rnd(b.id + i * 3) * 0.5))); parent.add(ac); }
  }
  if (winMatrices.length) {
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }), winMatrices.length);
    for (let i = 0; i < winMatrices.length; i++) { inst.setMatrixAt(i, winMatrices[i]); inst.setColorAt(i, winColors[i]); }
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false; parent.add(inst);
  }
}

function buildBuildingsLow(bs, parent) {
  for (const b of bs) {
    const w = b.x1 - b.x0, d = b.y1 - b.y0; if (w < 0.5 || d < 0.5) continue;
    const m = box(w, b.h || 12, d, b.color ? new THREE.Color(b.color).getHex() : 0x5b6470, { rough: 0.9 });
    m.position.set((b.x0 + b.x1) / 2, (b.h || 12) / 2, -(b.y0 + b.y1) / 2); m.castShadow = true; m.receiveShadow = true; parent.add(m);
  }
}

function buildRoads(roads, parent) {
  for (const r of roads) {
    if (!r.pts || r.pts.length < 2) continue;
    const m = ribbon(r.pts, r.width_m || 8, 0.035, asphalt); if (m) { m.receiveShadow = true; parent.add(m); }
    const side = ribbon(r.pts.map((p, i, a) => { const q = a[Math.max(0, i - 1)], s = a[Math.min(a.length - 1, i + 1)]; let dx = s.x - q.x, dy = s.y - q.y; const l = Math.hypot(dx, dy) || 1; return { x: p.x - (dy / l) * (r.width_m || 8) * 0.7, y: p.y + (dx / l) * (r.width_m || 8) * 0.7 }; }), 3.2, 0.1, paving);
    if (side) { side.receiveShadow = true; parent.add(side); }
  }
  // centre dashes on the main road
  for (let y = -96; y <= 146; y += 6) {
    if (Math.abs(y - 40) < 7) continue;
    const d = box(0.12, 0.012, 2.9, 0xd8d2b8, { rough: 0.7 }); d.position.set(0, 0.052, -y); parent.add(d);
  }
  for (const cy of [35.2, 44.8]) for (let i = 0; i < 8; i++) { const s = box(0.62, 0.012, 5.2, 0xe4e2d8, { rough: 0.7 }); s.position.set(-3.6 + i * 1.03, 0.054, -cy); parent.add(s); }
}

function buildProps(props, parent) {
  for (const p of props) {
    const { x, y } = p.at || {}; if (x == null) continue;
    if (p.kind === 'lamp') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, p.height_m || 7.5, 6), new THREE.MeshStandardMaterial({ color: 0x30363e, roughness: 0.8, metalness: 0.5 })); pole.position.set(x, (p.height_m || 7.5) / 2, -y); pole.castShadow = true; parent.add(pole);
      const hd = box(0.7, 0.16, 0.34, 0xffe0a8, { emissive: 0xffb45c, ei: 1.4 }); hd.position.set(x + (x < 0 ? 1.35 : -1.35), 7.3, -y); parent.add(hd);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc07a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 })); glow.position.copy(hd.position); glow.scale.set(5.5, 5.5, 1); parent.add(glow);
    } else if (p.kind === 'tree') {
      const h = p.height_m || 6; const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, h * 0.55, 6), new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 1 })); trunk.position.set(x, h * 0.275, -y); trunk.castShadow = true; parent.add(trunk);
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(h * (0.24 - i * 0.025), 0), new THREE.MeshStandardMaterial({ color: [0x243b26, 0x2d4a2b, 0x1e3320][i], roughness: 1, flatShading: true })); f.position.set(x + (rnd(x + i) - .5) * 1.6, h * (0.58 + i * 0.12), -y + (rnd(y + i) - .5) * 1.6); f.castShadow = true; parent.add(f); }
    } else if (p.kind === 'bollard') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x626a72, roughness: 0.5, metalness: 0.6 })); m.position.set(x, 0.45, -y); parent.add(m);
    } else if (p.kind === 'bench') {
      const seat = box(2.4, 0.12, 0.55, 0x5c4632, { rough: 0.9 }); seat.position.set(x, 0.45, -y); parent.add(seat);
    } else if (p.kind === 'bin') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.0, 10), new THREE.MeshStandardMaterial({ color: 0x2f3b38, roughness: 0.8, metalness: 0.3 })); m.position.set(x, 0.5, -y); parent.add(m);
    }
  }
}


// ---------------------------------------------------------------- one lamp, in a studio
// A real city lamp, built from its parts: concrete pad, cast base with bolts and a door, tapered mast,
// curved bracket arm, a bracket luminaire with a lens, heatsink fins, photocell and terminal cover, and a
// plaque with the register asset. No street, no chart: the lamp is the subject.
function canvasTexGlow(w, h) {
  return canvasTex(w, h, (ctx, cw, ch) => {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2);
    g.addColorStop(0, 'rgba(255,214,150,.95)');
    g.addColorStop(.35, 'rgba(255,190,110,.38)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  });
}

function buildLamp(lamp, parent) {
  const H = lamp?.height_m || 8.2, A = lamp?.arm_m || 1.7;
  const g = new THREE.Group();
  g.name = 'street.lamp';
  parent.add(g);

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x23282a, roughness: 0.55, metalness: 0.5 });
  const mastMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(lamp?.color || '#1e3a2f'), roughness: 0.34, metalness: 0.55 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xaab3bd, roughness: 0.28, metalness: 0.92 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x73777b, roughness: 0.95, metalness: 0.0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x11161a, roughness: 0.5, metalness: 0.6 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xffe0a8, emissive: 0xffa14a, emissiveIntensity: 1.7, roughness: 0.24, metalness: 0.0, transparent: true, opacity: 0.96 });

  const add = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
  const cyl = (rt, rb, h, seg, mat) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  const boxm = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // concrete pad, then the cast-iron base with a bolted flange
  add(cyl(0.58, 0.62, 0.06, 48, concreteMat), 0, 0.03, 0).receiveShadow = true;
  add(cyl(0.46, 0.50, 0.04, 48, concreteMat), 0, 0.08, 0).receiveShadow = true;
  const prof = [[0.30, 0], [0.345, 0.015], [0.345, 0.055], [0.31, 0.085], [0.27, 0.11], [0.25, 0.18], [0.225, 0.28], [0.20, 0.38], [0.175, 0.46], [0.155, 0.52]].map(([x, y]) => new THREE.Vector2(x, y));
  add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), ironMat), 0, 0.08, 0);
  add(cyl(0.36, 0.36, 0.025, 48, ironMat), 0, 0.075, 0);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const b = add(cyl(0.026, 0.03, 0.025, 10, steelMat), Math.cos(a) * 0.335, 0.125, Math.sin(a) * 0.335);
    b.rotation.z = Math.PI / 2;
  }

  // mast, base collar, access door, plaque
  const baseTop = 0.60;
  add(cyl(0.095, 0.145, H - baseTop, 24, mastMat), 0, baseTop + (H - baseTop) / 2, 0);
  add(cyl(0.17, 0.19, 0.09, 24, ironMat), 0, baseTop + 0.02, 0);
  const door = boxm(0.16, 0.42, 0.018, darkMat); add(door, 0, 0.96, 0.150); door.castShadow = false;
  add(cyl(0.012, 0.012, 0.012, 10, steelMat), 0.03, 0.97, 0.162);
  const plaqueTex = canvasTex(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#0c1310'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6f7f73'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#b7c5b8'; ctx.textAlign = 'center';
    ctx.font = '600 46px ui-monospace,Menlo,monospace'; ctx.fillText('43378-2110031-00', w / 2, 72);
    ctx.font = '400 27px ui-sans-serif,system-ui'; ctx.fillStyle = '#9fb3a3'; ctx.fillText('UNTER DEN LINDEN · BERLIN', w / 2, 120);
  });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.12), new THREE.MeshBasicMaterial({ map: plaqueTex }));
  add(plaque, 0, 1.64, 0.152); plaque.castShadow = false;

  // top collar and the arm root
  add(cyl(0.135, 0.095, 0.13, 24, ironMat), 0, H - 0.10, 0);
  add(cyl(0.10, 0.10, 0.05, 24, steelMat), 0, H - 0.02, 0);
  add(cyl(0.155, 0.16, 0.035, 24, ironMat), 0, H * 0.5, 0);
  const gusset = boxm(0.24, 0.30, 0.06, mastMat); add(gusset, 0.12, H - 0.30, 0); gusset.rotation.z = 0.35;

  // a real bracket arm: a tube on a curve that rises off the mast and droops to the head
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, H - 0.24, 0), new THREE.Vector3(0.22, H - 0.10, 0),
    new THREE.Vector3(0.78, H + 0.02, 0), new THREE.Vector3(A, H - 0.08, 0),
  ]);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.062, 12, false), mastMat);
  arm.castShadow = true; g.add(arm);
  const endc = add(cyl(0.075, 0.075, 0.08, 20, ironMat), A, H - 0.08, 0); endc.rotation.z = Math.PI / 2;

  // the luminaire
  const head = new THREE.Group();
  head.position.set(A + 0.40, H - 0.16, 0); head.rotation.z = -0.05; g.add(head);
  const hbox = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; head.add(m); return m; };
  // a cobra head, not a box: a side profile extruded across the width, with a flat lens underside
  const hs = new THREE.Shape();
  hs.moveTo(-0.42, -0.02);
  hs.lineTo(0.34, -0.03);
  hs.quadraticCurveTo(0.46, -0.02, 0.48, 0.03);
  hs.quadraticCurveTo(0.46, 0.11, 0.34, 0.14);
  hs.lineTo(-0.30, 0.22);
  hs.quadraticCurveTo(-0.42, 0.20, -0.42, 0.10);
  hs.lineTo(-0.42, -0.02);
  const hgeo = new THREE.ExtrudeGeometry(hs, { depth: 0.36, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, steps: 1 });
  hgeo.translate(0, 0, -0.18);
  const housing = new THREE.Mesh(hgeo, mastMat); housing.castShadow = true; head.add(housing);
  // heatsink fins on the sloped top
  for (let i = 0; i < 8; i++) { const f = hbox(0.44, 0.04, 0.018, steelMat); f.position.set(-0.02, 0.175, -0.14 + i * 0.04); f.rotation.z = -0.06; }
  // lens frame and lens under the flat bottom
  hbox(0.72, 0.03, 0.34, darkMat).position.y = -0.045;
  const lens = hbox(0.62, 0.024, 0.28, lensMat); lens.position.y = -0.068; lens.castShadow = false;
  // a rear terminal cover and the photocell on the slope
  hbox(0.16, 0.13, 0.30, darkMat).position.set(-0.34, 0.10, 0);
  const pc = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.03, 16), steelMat); pc.position.set(-0.10, 0.205, 0.02); head.add(pc);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 8), new THREE.MeshStandardMaterial({ color: 0x9fd0ff, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.8 }));
  dome.position.set(-0.10, 0.225, 0.02); head.add(dome);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa85a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  glow.position.set(0, -0.10, 0); glow.scale.set(2.0, 2.0, 1); head.add(glow);
  const light = new THREE.PointLight(0xffb469, 26, 20, 2); light.position.set(0, -0.11, 0); head.add(light);

  const pool = new THREE.Mesh(new THREE.CircleGeometry(3.8, 64), new THREE.MeshBasicMaterial({ map: canvasTexGlow(256, 256), transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(A + 0.40, 0.012, 0); g.add(pool);
  const shTex = canvasTex(256, 256, (ctx, w, h) => {
    const gr = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.72)'); gr.addColorStop(.6, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  });
  const contact = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, opacity: 0.6, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.006; g.add(contact);

  lampView = { group: g, lensMat, light, glow, pool, on: !!lamp?.on };
  setLampOn(!!lamp?.on);
  return g;
}

function setLampOn(on) {
  if (!lampView) return;
  lampView.on = on;
  lampView.lensMat.emissiveIntensity = on ? 1.7 : 0.0;
  lampView.lensMat.color.set(on ? 0xffe0a8 : 0x3a3a34);
  lampView.light.intensity = on ? 26 : 0;
  lampView.glow.material.opacity = on ? 0.5 : 0;
  lampView.pool.material.opacity = on ? 0.72 : 0;
}

// A studio: no street, no cells, no sky. A graded floor, a key light with a real shadow, a cool rim.
function enterStudio(d) {
  studio = true;
  document.body.classList.add('studio');
  scene.background = new THREE.Color(0x070a0f);
  scene.fog = null;
  if (skyMesh) skyMesh.visible = false;
  sun.visible = false; hemi.visible = false; amb.visible = false;
  renderer.toneMappingExposure = 1.12;
  clearGroup(studioGroup);

  const floorTex = canvasTex(1024, 1024, (ctx, w, h) => {
    const gr = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.55);
    gr.addColorStop(0, '#1b2430'); gr.addColorStop(.55, '#0c1119'); gr.addColorStop(1, '#05070a');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 160), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.06 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; studioGroup.add(floor);

  // a cyclorama wall: the floor edge and the horizon disappear into one dark gradient
  const wallTex = canvasTex(256, 512, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#05070a'); gr.addColorStop(.55, '#0a1017'); gr.addColorStop(1, '#131b24');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({ map: wallTex }));
  wall.position.set(0, 18, -22); studioGroup.add(wall);

  const key = new THREE.DirectionalLight(0xffe9cf, 3.2);
  key.position.set(6, 11, 8); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 14; key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 1; key.shadow.camera.far = 40; key.shadow.bias = -0.0004;
  studioGroup.add(key);
  const fill = new THREE.HemisphereLight(0x9fc4ff, 0x1a1410, 0.55); studioGroup.add(fill);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.1); rim.position.set(-7, 7, -9); studioGroup.add(rim);
  studioGroup.add(new THREE.AmbientLight(0x647080, 0.22));

  applyView(d.view, 0);
  document.title = 'Lamppost 31 · render.scene/1';
  const brand = document.querySelector('.brand');
  if (brand) brand.innerHTML = '<span class="mark">◧</span><span>ce-net <em>· one renderer</em></span>';
  $('liveTxt').textContent = d.source?.live ? 'cell live' : 'last known';
  $('live').className = 'live ' + (d.source?.live ? 'on' : 'off');
  $('caps').textContent = 'render.scene/1 · studio · street.lamp@1';
  $('hint').textContent = 'drag to orbit · scroll to zoom · 1 three-quarter / 2 front / 3 luminaire / 4 base';
}

function applyView(v, ms = 0) {
  if (!v) return;
  if (v.fov) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
  if (v.min != null) controls.minDistance = v.min;
  if (v.max != null) controls.maxDistance = v.max;
  const pos = new THREE.Vector3(...(v.pos || [6.8, 4.0, 12])), tgt = new THREE.Vector3(...(v.target || [0.3, 4.0, 0]));
  if (ms <= 0) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); return; }
  tween = { t0: performance.now(), ms, fromPos: camera.position.clone(), toPos: pos, fromTgt: controls.target.clone(), toTgt: tgt };
}

function buildSignals(signals, parent, node) {
  const list = [];
  for (const s of signals) {
    const { x, y } = s.at; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 6), new THREE.MeshStandardMaterial({ color: 0x2a3036, metalness: 0.6, roughness: 0.6 })); pole.position.set(x, 1.8, -y); parent.add(pole);
    const head = box(0.36, 1.0, 0.32, 0x15191d, { rough: 0.7 }); head.position.set(x, 3.9, -y); parent.add(head);
    const lamps = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, toneMapped: false })); l.position.set(x, 4.22 - i * 0.3, -y + 0.17); parent.add(l); lamps.push(l); }
    list.push({ lamps });
  }
  signalLamps.set(node.parent?.replace(/^cell\./, '').replace(/\.signals$/, ''), list);
}

function buildOverlay() {
  const colors = [0x54e0ff, 0x7fffd4, 0xffd166, 0xa78bfa, 0xff8fab];
  let i = 0;
  for (const [id, { node }] of cellGroups) {
    const b = node.bounds; if (!b) continue;
    const col = new THREE.Color(colors[i++ % colors.length]);
    for (const y of [b.south_m, b.north_m]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(b.east_m - b.west_m, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, toneMapped: false }));
      bar.position.set((b.west_m + b.east_m) / 2, 0.32, -y); overlayGroup.add(bar);
      for (const x of [b.west_m, b.east_m]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 17, 5), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, toneMapped: false })); post.position.set(x, 8.5, -y); overlayGroup.add(post); }
    }
  }
}

// ---------------------------------------------------------------- dynamic + LOD
function applyDynamic(d) {
  const cells = new Map((d.dynamic || []).map((c) => [c.id, c]));
  const want = new Set();
  for (const [id, c] of cells) {
    for (const car of c.cars || []) {
      want.add(car.uid);
      let v = carViews.get(car.uid);
      if (!v) {
        const color = new THREE.Color(car.color || '#c8ced8');
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, car.len_m || 4.4), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 })); body.position.y = 0.55; body.castShadow = true; g.add(body);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, (car.len_m || 4.4) * 0.46), new THREE.MeshStandardMaterial({ color: 0x1b2530, roughness: 0.2 })); cab.position.set(0, 1.0, -0.1); g.add(cab);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false })); head.position.set(0.55, 0.62, -(car.len_m || 4.4) / 2 - 0.01); g.add(head);
        dynamicGroup.add(g); v = { g, x: car.x, y: car.y, tx: car.x, ty: car.y };
        carViews.set(car.uid, v);
      }
      v.tx = car.x; v.ty = car.y; v.dir = car.dir;
    }
  }
  for (const [uid, v] of carViews) if (!want.has(uid)) { dynamicGroup.remove(v.g); v.g.traverse((x) => { x.geometry?.dispose?.(); x.material?.dispose?.(); }); carViews.delete(uid); }
  // signals
  const phase = [...cells.values()].map((c) => c.signal_phase).find(Boolean) || 'ns-green';
  for (const list of signalLamps.values()) for (const s of list) {
    const ns = phase.startsWith('ns');
    const c = ns ? (phase === 'ns-green' ? [0x2eea74, 0x201a10, 0x2a1414] : [0x203a28, 0xffb020, 0x2a1414]) : (phase === 'ew-green' ? [0x2a1414, 0x201a10, 0x2eea74] : [0x2a1414, 0xffb020, 0x203a28]);
    s.lamps.forEach((l, i) => l.material.color.setHex(c[i]));
  }
  detectHandoffs(d);
}

function detectHandoffs(d) {
  const feed = [];
  for (const c of d.dynamic || []) for (const t of c.transfers || []) {
    const key = `${c.id}:${t.at_ms}:${t.uid}:${t.to}:${t.ok}`;
    if (lastFeedKey.has(key)) continue;
    lastFeedKey.add(key);
    if (t.at_ms < Date.now() - 8000) continue;
    if (t.to === c.id && t.ok) continue;
    const end = !t.ok && /no neighbour/i.test(t.note || '');
    if (end) { const k = `${c.id}:end`; if (lastEnd.get(k) && Date.now() - lastEnd.get(k) < 5000) continue; lastEnd.set(k, Date.now()); }
    feed.push({ at: t.at_ms, from: c.id, to: end ? 'end' : t.to, uid: t.uid, ok: end ? 'end' : t.ok, rtt: t.rtt_us });
  }
  if (feed.length) renderFeed(feed);
  if (lastFeedKey.size > 800) lastFeedKey.clear();
}
let feedItems = [];
function renderFeed(items) {
  feedItems = [...items, ...feedItems].slice(0, 6);
  $('tlist').innerHTML = feedItems.map((f) => {
    const time = new Date(f.at).toLocaleTimeString('en-GB', { hour12: false });
    const end = f.ok === 'end', rtt = end ? 'street ends' : f.ok ? `${(f.rtt / 1000).toFixed(f.rtt > 999 ? 0 : 2)} ms` : 'retrying';
    return `<li class="${end ? 'end' : f.ok ? '' : 'bad'}"><span class="t">${time}</span><span class="w">${f.from} → ${f.to} · car ${f.uid}</span><span class="r">${rtt}</span></li>`;
  }).join('');
}

let lastLodUi = 0;
function updateLod(now = performance.now()) {
  const H = renderer.domElement.clientHeight, f = Math.tan((camera.fov * Math.PI / 180) / 2);
  let hi = 0, lo = 0;
  for (const it of lodItems) {
    const b = it.bounds || { south_m: 0, north_m: 0 };
    const cx = ((b.west_m ?? -38) + (b.east_m ?? 38)) / 2, cy = ((b.south_m ?? 0) + (b.north_m ?? 0)) / 2;
    const d = Math.max(8, Math.hypot(camera.position.x - cx, camera.position.z + cy));
    const sse = (it.height * H) / (2 * d * f);
    let level = 0;
    if (lodMode === 'high') level = it.levels.length - 1;
    else if (lodMode === 'low') level = 0;
    else for (let i = 0; i < it.levels.length; i++) if (sse >= it.levels[i].sse) level = i;
    it.levels.forEach((l, i) => (l.group.visible = i === level));
    const finest = level === it.levels.length - 1 && it.levels.length > 1;
    if (it.levels.length > 1) (finest ? hi++ : lo++);
  }
  lodHi = hi; lodLo = lo;
  if (now - lastLodUi < 250) return;
  lastLodUi = now;
  $('lodTxt').textContent = `${lodMode} · ${hi} high / ${lo} low`;
  $('lodHiTxt').textContent = `high ${hi}`; $('lodLoTxt').textContent = `low ${lo}`;
  const total = Math.max(1, hi + lo);
  $('lodHi').style.width = `${(hi / total) * 100}%`; $('lodLo').style.width = `${(lo / total) * 100}%`;
}

// ---------------------------------------------------------------- UI
function updatePanel() {
  if (!doc) return;
  if (doc.style === 'studio') { updateStudioPanel(); return; }
  const cells = doc.dynamic || [];
  const sum = cells.reduce((a, c) => ({ cars: a.cars + (c.cars?.length || 0), handed: a.handed + (c.counters?.handed || 0), exited: a.exited + (c.counters?.exited || 0) }), { cars: 0, handed: 0, exited: 0 });
  $('ptitle').textContent = 'Huafa Road';
  $('psub').textContent = `${doc.schema} · revision ${doc.revision} · session ${doc.session}`;
  $('pbody').innerHTML = `
    <div class="kv">
      <span>Backend</span><b>${doc.caps?.backend || '–'}</b>
      <span>Capabilities</span><b>${(doc.caps?.features || []).join(' · ')}</b>
      <span>Nodes</span><b>${doc.nodes.length} (${doc.stats?.cells_kept ?? 0}/${doc.stats?.cells_total ?? 0} cells)</b>
      <span>Cars</span><b>${sum.cars}</b>
      <span>Handoffs accepted</span><b>${sum.handed}</b>
      <span>Cars left the street</span><b>${sum.exited}</b>
      <span>Interest</span><b>${doc.interest?.lat?.toFixed(4)}, ${doc.interest?.lon?.toFixed(4)} · ${doc.interest?.radius_m} m</b>
    </div>
    ${cells.map((c) => `<button class="cellrow" data-cell="${c.id}"><i class="dot"></i><span class="n">${c.id}</span><span class="s">${(c.cars || []).length} cars · ${c.signal_phase || ''}</span></button>`).join('')}
    <div class="acts">
      <button data-view="street">Street</button><button data-view="pavement">Pavement</button><button data-view="block">Block</button><button data-view="plan">Plan</button>
      <button data-lod="auto" class="${lodMode === 'auto' ? 'on' : ''}">LOD auto</button>
      <button data-lod="high" class="${lodMode === 'high' ? 'on' : ''}">force high</button>
      <button data-lod="low" class="${lodMode === 'low' ? 'on' : ''}">force low</button>
      ${cells.length < 5 ? '<button id="expand">Add the next cell →</button>' : ''}
    </div>
    <p class="note">The renderer receives nodes with bounded LOD levels and picks by screen-space error. It does not know what a street cell is; the scene document is the only interface. Interest is sent with the camera, so the source streams only what the view needs.</p>`;
  $('pbody').querySelectorAll('[data-cell]').forEach((b) => (b.onclick = () => focusCell(b.dataset.cell)));
  $('pbody').querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  $('pbody').querySelectorAll('[data-lod]').forEach((b) => (b.onclick = () => { lodMode = b.dataset.lod; updatePanel(); }));
  const ex = $('pbody').querySelector('#expand');
  if (ex) ex.onclick = async () => {
    ex.disabled = true; ex.textContent = 'Starting the next cell…';
    try {
      const r = await fetch('/api/expand', { method: 'POST' }); const j = await r.json();
      toast(r.ok ? `Cell ${j.starting} is booting; watch the north edge` : (j.error || 'the gateway refused'));
    } catch (e) { toast(String(e.message || e)); ex.disabled = false; ex.textContent = 'Add the next cell →'; }
  };
}
let studioKey = '';
function updateStudioPanel() {
  const lamp = (doc.nodes || []).find((n) => n.geometry?.kind === 'lamp')?.geometry?.lamp || {};
  const live = doc.source?.live;
  const snapshot = staticMode || doc.source?.snapshot;
  const key = `${lamp.asset}|${lamp.on}|${live}|${doc.revision}`;
  if (key === studioKey) return;
  studioKey = key;
  $('ptitle').textContent = 'Lamppost 31';
  $('psub').textContent = `${lamp.asset || ''} · ${lamp.street || ''}, ${lamp.city || ''}`;
  $('pbody').innerHTML = `
    <div class="kv">
      <span>Asset</span><b>${lamp.asset || '–'}</b>
      <span>Height · arm</span><b>${lamp.height_m ? lamp.height_m.toFixed(1) + ' m' : '–'} · ${lamp.arm_m ? lamp.arm_m.toFixed(2) + ' m' : '–'}</b>
      <span>State</span><b>${lamp.on ? 'ON' : 'OFF'} · ${lamp.lumens || '–'} lm · ${lamp.power_w || '–'} W</b>
      <span>Cell</span><b>street.lamp@1</b>
    </div>
    <div class="acts">
      <button data-view="three-quarter">3/4</button><button data-view="front">Front</button>
      <button data-view="luminaire">Luminaire</button><button data-view="base">Base</button>
      <button id="light" class="${lamp.on ? 'on' : ''}">Lamp ${lamp.on ? 'on' : 'off'}</button>
    </div>
    <p class="note">One cell, one lamp: Berlin GDI WFS <b>beleuchtung</b>, feature <b>beleuchtung.153492</b>, dl-de/by-2-0. The mast, arm and luminaire are modelled, not a survey. The light button is a local preview.${snapshot ? ' This is a snapshot of the cell; run tools/lamp-demo.py for the live one.' : live ? '' : ' The cell is not answering; this is the last known lamp.'}</p>`;
  $('pbody').querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  const lb = $('pbody').querySelector('#light');
  if (lb) lb.onclick = () => {
    setLampOn(!(lampView?.on));
    lb.classList.toggle('on', !!lampView?.on);
    lb.textContent = `Lamp ${lampView?.on ? 'on' : 'off'}`;
  };
}

function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 5000); }

function focusCell(id) {
  const c = (doc?.dynamic || []).find((x) => x.id === id);
  const n = cellGroups.get(`cell.${id}`)?.node;
  if (!n?.bounds) return;
  const b = n.bounds; const cy = (b.south_m + b.north_m) / 2;
  tween = { t0: performance.now(), ms: 1100, fromPos: camera.position.clone(), toPos: new THREE.Vector3(0, 34, -cy + 55), fromTgt: controls.target.clone(), toTgt: new THREE.Vector3(0, 2, -cy) };
  selected = id;
}

// ---------------------------------------------------------------- camera
let tween = null;
function setView(name, ms = 1300) {
  if (doc?.style === 'studio') {
    const views = {
      'three-quarter': { pos: [7.4, 4.6, 12.8], target: [0.55, 4.05, 0] },
      'front': { pos: [0.3, 4.6, 15.5], target: [0.55, 4.1, 0] },
      'luminaire': { pos: [3.2, 7.8, 5.4], target: [2.1, 7.8, 0] },
      'base': { pos: [2.0, 1.4, 3.6], target: [0, 0.9, 0] },
    };
    applyView({ ...(views[name] || views['three-quarter']), fov: 40, min: 2.2, max: 30 }, ms);
    return;
  }
  const v = {
    street: { pos: [0, 12, 60], tgt: [0, 0.5, -40] },
    pavement: { pos: [0.6, 2.1, 30], tgt: [0, 6.2, -30] },
    block: { pos: [0, 88, 78], tgt: [0, 0, 20] },
    plan: { pos: [0, 205, 34], tgt: [0, 0, 28] },
  }[name] || { pos: [0, 12, 60], tgt: [0, 0.5, -40] };
  if (ms <= 0) { camera.position.set(...v.pos); controls.target.set(...v.tgt); controls.update(); return; }
  tween = { t0: performance.now(), ms, fromPos: camera.position.clone(), toPos: new THREE.Vector3(...v.pos), fromTgt: controls.target.clone(), toTgt: new THREE.Vector3(...v.tgt) };
}

// ---------------------------------------------------------------- loop + API
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (tween) { const k = clamp((now - tween.t0) / tween.ms, 0, 1), e = 1 - Math.pow(1 - k, 3); camera.position.lerpVectors(tween.fromPos, tween.toPos, e); controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e); if (k >= 1) tween = null; }
  const k = 1 - Math.exp(-dt * 9);
  for (const v of carViews.values()) { v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k; v.g.position.set(v.x, 0, -v.y); v.g.rotation.y = v.dir > 0 ? 0 : Math.PI; }
  for (let i = fxGroup.children.length - 1; i >= 0; i--) { const r = fxGroup.children[i], a = (now - r.userData.born) / 900; if (a >= 1) { fxGroup.remove(r); r.geometry.dispose(); r.material.dispose(); } else { const s = 1 + a * 3; r.scale.set(s, s, s); r.material.opacity = 0.8 * (1 - a); } }
  updateLod(now);
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

let staticMode = false;
async function fetchScene() {
  try {
    const r = camera.position;
    const radius = Math.round(Math.max(300, Math.hypot(r.x, r.z) + 120));
    let res = await fetch(`./api/render?backend=webgl2&lat=22.5452&lon=114.0855&r=${radius}`, { cache: 'no-store' });
    if (!res.ok) { staticMode = true; res = await fetch('./scene.json', { cache: 'no-store' }); }
    if (!res.ok) throw new Error(`renderer: HTTP ${res.status}`);
    const d = await res.json();
    if (d.schema !== 'render.scene/1') throw new Error(`renderer: got ${d.schema}`);
    if (d.revision !== revision) { revision = d.revision; doc = d; build(d); if (firstScene) { if (d.style !== 'studio') setView('street', 0); firstScene = false; } $('load').classList.add('gone'); }
    else doc = d;
    applyDynamic(d);
    const snapshot = staticMode || d.source?.snapshot;
    $('liveTxt').textContent = d.style === 'studio' ? (snapshot ? 'snapshot' : d.source?.live ? 'cell live' : 'last known') : `${d.stats?.cells_kept ?? 0}/${d.stats?.cells_total ?? 0} cells`;
    $('live').className = 'live ' + (snapshot || d.source?.live ? 'on' : 'off');
    $('caps').textContent = d.style === 'studio' ? 'render.scene/1 · studio · street.lamp@1' : `${d.schema} · ${d.caps?.backend}${navigator.gpu ? ' · webgpu available' : ''} · LOD ${(d.caps?.features || []).includes('lod') ? 'on' : 'off'}`;
    $('err').hidden = true;
    updatePanel();
    lastGood = Date.now();
  } catch (e) {
    $('live').className = 'live off'; $('liveTxt').textContent = 'scene offline';
    $('err').hidden = false; $('err').textContent = `renderer: ${e.message || e}`;
    if (!doc) $('load').querySelector('span').textContent = 'Waiting for the scene source…';
  }
  setTimeout(fetchScene, 300);
}

canvas.addEventListener('pointerdown', (e) => { canvas._down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  const d = canvas._down; canvas._down = null; if (!d) return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(cellGroups.size ? [...cellGroups.values()].map((c) => c.group) : [], true);
  if (hits.length) { const g = hits[0].object; let o = g; while (o && !o.userData.node) o = o.parent; const id = o?.userData.node?.id?.replace(/^cell\./, ''); if (id) focusCell(id); }
});
$('pclose').onclick = () => { selected = null; updatePanel(); };
addEventListener('keydown', (e) => {
  if (doc?.style === 'studio') {
    if (e.key === '1') setView('three-quarter'); if (e.key === '2') setView('front');
    if (e.key === '3') setView('luminaire'); if (e.key === '4') setView('base');
    return;
  }
  if (e.key === '1') setView('street'); if (e.key === '2') setView('pavement'); if (e.key === '3') setView('block'); if (e.key === '4') setView('plan');
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1)); renderer.setSize(innerWidth, innerHeight); });
window.__render = { scene, camera, controls, setView, get doc() { return doc; }, get lod() { return { hi: lodHi, lo: lodLo, mode: lodMode }; }, setLod(m) { lodMode = m; } };
fetchScene();
