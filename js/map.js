/* Link Up — Three.js 3D campus renderer (offline-first, vendored three).
 *
 * A miniature digital NSUT: perspective orbit camera, GLB landmarks with LOD
 * (procedural, geographically placed — stylized approximations, not survey data),
 * real lighting + soft shadows, instanced trees, roads/paths, sports markings,
 * people + vehicles for scale, distance-based HTML labels, day/evening/night,
 * and the temporary Moksha event overlay on real campus geometry.
 */
import * as THREE from 'three';
import { loadGLB } from './load-glb.js';
import { BUILDINGS, FRIENDS } from './data.js';
import { EventStore, eventStatus, festivalState } from './events.js';

/* grid (x:0..1000, y:0..700) -> world (y-up, meters-ish, 1u ≈ 0.9m) */
const GX = (x) => x - 500;
const GZ = (y) => y - 350;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const MODES = {
  day: { sky: 0x9ec7ee, fog: 0xcfe2f5, ground: 0x79b86a, groundOut: 0x5da055, sun: 0xfff4d6, sunI: 2.6, hemiSky: 0xbdd7f2, hemiGnd: 0x6a8a5a, hemiI: 0.9, glow: 0.1, beams: 0, stars: false, road: 0x4b5261 },
  evening: { sky: 0x35306b, fog: 0x6b5580, ground: 0x4d8a4e, groundOut: 0x356636, sun: 0xffb37a, sunI: 1.7, hemiSky: 0x8a7ab8, hemiGnd: 0x3a4a3a, hemiI: 0.55, glow: 1.1, beams: 0.35, stars: false, road: 0x333845 },
  night: { sky: 0x05070f, fog: 0x0a1226, ground: 0x22402a, groundOut: 0x16281b, sun: 0xb9ccff, sunI: 0.4, hemiSky: 0x2a3a5e, hemiGnd: 0x101a14, hemiI: 0.35, glow: 1.7, beams: 0.6, stars: true, road: 0x20242e },
};
const SUNPOS = { day: [600, 950, 350], evening: [-850, 260, 250], night: [450, 750, -350] };

const ROADS = [
  { pts: [[140, 180], [880, 180]], w: 10, kind: 'road' }, { pts: [[120, 520], [880, 520]], w: 10, kind: 'road' },
  { pts: [[140, 180], [140, 520]], w: 10, kind: 'road' }, { pts: [[880, 180], [880, 520]], w: 10, kind: 'road' },
  { pts: [[500, 80], [500, 620]], w: 12, kind: 'road' }, { pts: [[160, 300], [860, 300]], w: 9, kind: 'road' },
  { pts: [[400, 180], [400, 232]], w: 4, kind: 'path' }, { pts: [[500, 80], [500, 112]], w: 5, kind: 'path' },
  { pts: [[500, 300], [500, 400]], w: 5, kind: 'path' }, { pts: [[620, 300], [710, 300], [710, 408]], w: 5, kind: 'path' },
  { pts: [[300, 300], [262, 448]], w: 4, kind: 'path' }, { pts: [[280, 520], [280, 572]], w: 4, kind: 'path' },
  { pts: [[830, 180], [830, 214]], w: 5, kind: 'path' }, { pts: [[420, 300], [372, 322]], w: 4, kind: 'path' },
  { pts: [[140, 520], [140, 620]], w: 8, kind: 'road' },
];
const PLAZAS = [{ x: 545, y: 318, w: 170, d: 96 }, { x: 400, y: 252, w: 130, d: 44 }];
const PARKING = { x: 620, y: 115, w: 90, d: 34 };
const FIELD = { x: 190, y: 445, w: 168, d: 92 };
const COURT = { x: 368, y: 562, w: 46, d: 30 };
/* footprint avoid-list for trees: [cx, cy, hw, hd] (+ amphi circle handled separately) */
const FOOT = [
  [500, 140, 80, 45], [400, 210, 80, 45], [620, 200, 85, 65], [545, 300, 65, 40],
  [620, 355, 28, 20], [500, 425, 70, 35], [280, 550, 65, 40], [830, 190, 65, 45],
  [340, 330, 55, 45], [150, 492, 25, 15], [500, 60, 22, 10], [672, 238, 14, 12],
];
const HEIGHTS = { admin: 17, library: 15, apj: 16, sac: 13, nescafe: 7, canteen: 9, sports: 12, hostel: 19, innovation: 18, amphi: 12, gate: 16, amul: 9 };
const ME_POS = { x: 560, y: 332 };

export function createMap(canvas, opts = {}) {
  const onSelect = opts.onSelect || (() => {});
  const friendsRef = { list: FRIENDS };
  const state = {
    layer: 'friends', ghost: false, mokshaFilter: false, selected: null,
    t: 0, w: 0, h: 0, dpr: 1, timeOfDay: 'evening',
    highlightId: null, route: null, mokshaEventId: null,
    cam: null,
  };
  const cam = (state.cam = { tx: 510, ty: 350, dist: 1250, yaw: -0.62, pitch: 0.96 });
  const goal = { ...cam };
  let fly = null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    canvas.parentElement.innerHTML += '<div style="position:absolute;inset:0;display:grid;place-items:center;color:#fff">3D unavailable on this device.</div>';
    return stubApi();
  }
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(MODES.evening.sky);
  scene.fog = new THREE.Fog(MODES.evening.fog, 1300, 3600);
  const camera = new THREE.PerspectiveCamera(48, 1, 2, 8000);

  const hemi = new THREE.HemisphereLight(0x8a7ab8, 0x3a4a3a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb37a, 1.7);
  sun.position.set(-850, 260, 250);
  sun.castShadow = true;
  sun.shadow.mapSize.set(window.innerWidth < 700 ? 1024 : 2048, window.innerWidth < 700 ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 10, far: 4000 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  /* labels overlay */
  const labelLayer = document.createElement('div');
  labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:4';
  canvas.parentElement.appendChild(labelLayer);
  const labelPool = [];
  function getLabel(i) {
    if (!labelPool[i]) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:800 11px system-ui;color:#fff;background:rgba(6,10,21,.78);border:1px solid rgba(255,255,255,.18);padding:3px 9px;border-radius:8px;white-space:nowrap';
      labelLayer.appendChild(d); labelPool[i] = d;
    }
    return labelPool[i];
  }

  /* ---------- static geography ---------- */
  const pickTargets = [];
  const windowMats = [];
  function ribbonGeo(pts, w, y) {
    const pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[i], [cx2, cy2] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = cx2 - ax, dy = cy2 - ay;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const nx = -dy * w / 2, ny = dx * w / 2;
      pos.push(GX(bx + nx), y, GZ(by + ny), GX(bx - nx), y, GZ(by - ny));
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function flat(w, d, color, y = 0.2) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true;
    return m;
  }
  {
    const P = MODES.evening;
    const outer = flat(5200, 5200, P.groundOut, -0.6); scene.add(outer);
    const inner = flat(1080, 740, P.ground, 0); inner.position.set(0, 0, 0); scene.add(inner);
    scene.userData.ground = [outer, inner];
    for (const pz of PLAZAS) {
      const q = flat(pz.w, pz.d, 0x9aa0ac, 0.25); q.position.set(GX(pz.x), 0.25, GZ(pz.y)); scene.add(q);
      scene.userData['plaza' + pz.x] = q;
    }
    const pk = flat(PARKING.w, PARKING.d, 0x3a3f4c, 0.25); pk.position.set(GX(PARKING.x), 0.25, GZ(PARKING.y)); scene.add(pk);
    for (const r of ROADS) {
      const curb = new THREE.Mesh(ribbonGeo(r.pts, r.w + 3, 0.15), new THREE.MeshStandardMaterial({ color: 0x8d93a0, roughness: 1 }));
      curb.receiveShadow = true; scene.add(curb);
      const top = new THREE.Mesh(ribbonGeo(r.pts, r.w, 0.3), new THREE.MeshStandardMaterial({ color: r.kind === 'path' ? 0xa89a72 : P.road, roughness: 1 }));
      top.receiveShadow = true; scene.add(top);
      (scene.userData.roads = scene.userData.roads || []).push(curb, top);
      if (r.kind === 'road') {
        const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8d9a0 });
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
          const L = Math.hypot(bx - ax, by - ay);
          for (let d = 4; d < L - 4; d += 16) {
            const t = d / L;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 7), dashMat);
            m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(by - ay, bx - ax);
            m.position.set(GX(ax + (bx - ax) * t), 0.45, GZ(ay + (by - ay) * t));
            scene.add(m);
          }
        }
      }
    }
    // football stripes + markings
    for (let i = 0; i < 8; i++) {
      const s = flat(FIELD.w / 8, FIELD.d, i % 2 ? 0x35803f : 0x2f7539, 0.22);
      s.position.set(GX(FIELD.x - FIELD.w / 2 + (FIELD.w / 8) * (i + 0.5)), 0.22, GZ(FIELD.y));
      scene.add(s);
    }
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const line = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, len), lineMat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
      m.position.set(GX((x0 + x1) / 2), 0.4, GZ((y0 + y1) / 2)); scene.add(m);
    };
    const F = FIELD;
    line(F.x - F.w / 2 + 3, F.y - F.d / 2 + 3, F.x + F.w / 2 - 3, F.y - F.d / 2 + 3);
    line(F.x - F.w / 2 + 3, F.y + F.d / 2 - 3, F.x + F.w / 2 - 3, F.y + F.d / 2 - 3);
    line(F.x - F.w / 2 + 3, F.y - F.d / 2 + 3, F.x - F.w / 2 + 3, F.y + F.d / 2 - 3);
    line(F.x + F.w / 2 - 3, F.y - F.d / 2 + 3, F.x + F.w / 2 - 3, F.y + F.d / 2 - 3);
    line(F.x, F.y - F.d / 2 + 3, F.x, F.y + F.d / 2 - 3);
    // goals
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.6 });
    for (const gx of [F.x - F.w / 2 + 1, F.x + F.w / 2 - 1]) {
      for (const dz of [-4.5, 4.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 8), goalMat);
        post.position.set(GX(gx), 1.7, GZ(F.y + dz)); post.castShadow = true; scene.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9.7, 8), goalMat);
      bar.rotation.x = Math.PI / 2; bar.position.set(GX(gx), 3.4, GZ(F.y)); scene.add(bar);
    }
    // basketball court
    const court = flat(COURT.w, COURT.d, 0x6e3d24, 0.3);
    court.position.set(GX(COURT.x), 0.3, GZ(COURT.y)); scene.add(court);
    line(COURT.x - COURT.w / 2 + 2, COURT.y, COURT.x + COURT.w / 2 - 2, COURT.y);
  }

  /* ---------- GLB landmarks + LOD ---------- */
  const MODEL_IDS = ['admin', 'library', 'apj', 'sac', 'nescafe', 'canteen', 'sports', 'hostel', 'innovation', 'gate', 'amul', 'amphi'];
  const MODEL_POS = { admin: [500, 140], library: [400, 210], apj: [620, 200], sac: [545, 300], nescafe: [620, 355], canteen: [500, 425], sports: [280, 550], hostel: [830, 190], innovation: [340, 330], gate: [500, 60], amul: [672, 238], amphi: [710, 452], pavilion: [150, 492] };
  const lodObjs = [];
  const venueGroups = {}; // buildingId -> Object3D (for highlight)
  async function loadModels() {
    for (const id of [...MODEL_IDS, 'pavilion']) {
      try {
        const [hi, lo] = await Promise.all([loadGLB(`models/${id}-high.glb`), loadGLB(`models/${id}-low.glb`)]);
        const lod = new THREE.LOD();
        lod.addLevel(hi.group, 0); lod.addLevel(lo.group, 950);
        const [gx, gy] = MODEL_POS[id];
        lod.position.set(GX(gx), 0, GZ(gy));
        lod.userData = { kind: 'place', id };
        lod.traverse((o) => { o.userData.pickRoot = lod; });
        scene.add(lod); lodObjs.push(lod); pickTargets.push(lod);
        venueGroups[id] = lod;
        for (const m of hi.windowMats) windowMats.push(m);
      } catch (e) { console.warn('model load failed', id, e); }
    }
  }
  loadModels();
  // Moksha stage (temporary furniture, loaded once, placed per event)
  let stageGroup = null, stageMats = [];
  loadGLB('models/moksha-stage-high.glb').then(({ group, windowMats: wm }) => {
    stageGroup = group; stageMats = wm; stageGroup.visible = false; scene.add(stageGroup);
  }).catch(() => {});

  /* ---------- trees (instanced, 2 draw calls) ---------- */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  {
    const rng = mulberry(20260327);
    const spots = [];
    let guard = 0;
    while (spots.length < 150 && guard++ < 4000) {
      const x = 60 + rng() * 880, y = 60 + rng() * 580;
      if (FOOT.some(([fx, fy, hw, hd]) => Math.abs(x - fx) < hw + 12 && Math.abs(y - fy) < hd + 12)) continue;
      if (Math.hypot(x - 710, y - 452) < 62) continue;
      if (Math.abs(x - FIELD.x) < FIELD.w / 2 + 12 && Math.abs(y - FIELD.y) < FIELD.d / 2 + 12) continue;
      if (PLAZAS.some((p) => Math.abs(x - p.x) < p.w / 2 + 6 && Math.abs(y - p.y) < p.d / 2 + 6)) continue;
      if (Math.abs(x - PARKING.x) < PARKING.w / 2 + 6 && Math.abs(y - PARKING.y) < PARKING.d / 2 + 6) continue;
      if (ROADS.some((r) => { for (let i = 0; i < r.pts.length - 1; i++) if (segDist(x, y, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) < r.w / 2 + 7) return true; return false; })) continue;
      spots.push({ x, y, h: 8 + rng() * 6, r: 5 + rng() * 3, tone: rng(), rot: rng() * TAU });
    }
    const trunkG = new THREE.CylinderGeometry(0.7, 1.0, 5, 6);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkG, trunkM, spots.length);
    const canG = new THREE.IcosahedronGeometry(1, 1);
    const canM = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const cans = new THREE.InstancedMesh(canG, canM, spots.length);
    const d = new THREE.Object3D(), col = new THREE.Color();
    spots.forEach((t, i) => {
      d.position.set(GX(t.x), 2.5, GZ(t.y)); d.scale.set(1, t.h / 5, 1); d.rotation.y = t.rot; d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      d.position.set(GX(t.x), t.h + 1.5, GZ(t.y)); d.scale.set(t.r, t.r * 0.85, t.r); d.updateMatrix();
      cans.setMatrixAt(i, d.matrix);
      cans.setColorAt(i, col.set(t.tone > 0.5 ? 0x2f7d3b : 0x46a04e));
    });
    trunks.castShadow = cans.castShadow = true;
    trunks.instanceMatrix.needsUpdate = cans.instanceMatrix.needsUpdate = true;
    if (cans.instanceColor) cans.instanceColor.needsUpdate = true;
    scene.add(trunks, cans);
  }

  /* ---------- people + vehicles ---------- */
  {
    const spots = [[545, 340], [500, 455], [710, 472], [400, 244], [250, 470], [620, 378], [340, 350]];
    const rng = mulberry(77);
    const geo = new THREE.CapsuleGeometry(1.1, 2.4, 3, 8);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const n = spots.length * 3;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const d = new THREE.Object3D(), col = new THREE.Color();
    const palette = [0x8a93ad, 0x7d8aa0, 0x96887a, 0x6f7f96];
    let i = 0;
    for (const [sx, sy] of spots) for (let k = 0; k < 3; k++) {
      d.position.set(GX(sx + (rng() - 0.5) * 44), 2.3, GZ(sy + (rng() - 0.5) * 26));
      d.rotation.y = rng() * TAU; d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      inst.setColorAt(i, col.set(palette[Math.floor(rng() * palette.length)]));
      i++;
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = true;
    scene.add(inst);
    scene.userData.npcs = inst;
    const carCols = [0x7d8aa0, 0xa33d1f, 0x31437c, 0xc9ced7, 0x5d6673, 0x7c4a12];
    const carPos = [[596, 115, 0], [612, 115, 0], [628, 115, 0], [644, 115, 0], [816, 236, 1.57], [816, 252, 1.57]];
    carPos.forEach(([cx, cy, a], ci) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 3.8), new THREE.MeshStandardMaterial({ color: carCols[ci], roughness: 0.5, metalness: 0.3 }));
      body.position.y = 1.6; body.castShadow = true; g.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.6, 3.2), new THREE.MeshStandardMaterial({ color: 0x274b63, roughness: 0.2, metalness: 0.4 }));
      cab.position.set(-0.4, 3.3, 0); g.add(cab);
      const wg = new THREE.CylinderGeometry(0.8, 0.8, 0.6, 10);
      const wm = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 1 });
      for (const [wx, wz] of [[-2.6, 1.9], [2.6, 1.9], [-2.6, -1.9], [2.6, -1.9]]) {
        const w = new THREE.Mesh(wg, wm); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.8, wz); g.add(w);
      }
      g.position.set(GX(cx), 0, GZ(cy)); g.rotation.y = -a;
      scene.add(g);
    });
  }

  /* ---------- me + friends ---------- */
  const meGroup = new THREE.Group();
  {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
    dot.position.y = 4; meGroup.add(dot);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6, 8.5, 40), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; meGroup.add(ring);
    meGroup.position.set(GX(ME_POS.x), 0, GZ(ME_POS.y));
    scene.add(meGroup);
  }
  function pinTexture(text, bg, fg) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(48, 48, 44, 0, TAU); g.fillStyle = 'rgba(34,211,238,.25)'; g.fill();
    g.beginPath(); g.arc(48, 48, 32, 0, TAU); g.fillStyle = bg; g.fill();
    g.lineWidth = 4; g.strokeStyle = '#22d3ee'; g.stroke();
    g.fillStyle = fg; g.font = '800 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 48, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const friendSprites = [];
  for (const f of FRIENDS) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(f.short.slice(0, 2), '#0b1122', '#fff'), transparent: true }));
    sp.scale.set(22, 22, 1); sp.position.set(GX(f.x), 12, GZ(f.y));
    sp.userData = { kind: 'friend', id: f.id };
    scene.add(sp); friendSprites.push(sp); pickTargets.push(sp);
  }

  /* ---------- Moksha 3D layer ---------- */
  const mokGroup = new THREE.Group(); scene.add(mokGroup);
  let mokMarker = null, mokPulse = null, venueRing = null, routeMesh = null, routeDots = [];
  let beams = [];
  {
    mokPulse = new THREE.Mesh(new THREE.RingGeometry(46, 50, 64), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    mokPulse.rotation.x = -Math.PI / 2; mokGroup.add(mokPulse);
    venueRing = new THREE.Mesh(new THREE.RingGeometry(30, 34, 64), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    venueRing.rotation.x = -Math.PI / 2; venueRing.visible = false; mokGroup.add(venueRing);
  }
  function markerTexture(ev) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const live = eventStatus(ev) === 'live';
    g.fillStyle = 'rgba(7,11,22,.94)';
    g.strokeStyle = live ? '#a3e635' : '#7dd3fc'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(28, 8, 200, 84, 16); g.fill(); g.stroke();
    g.font = '30px system-ui'; g.textAlign = 'center'; g.fillText('🎭', 128, 42);
    g.fillStyle = '#fff'; g.font = '800 24px system-ui'; g.fillText('MOKSHA', 128, 68);
    g.fillStyle = live ? '#a3e635' : '#7dd3fc'; g.font = '800 15px system-ui';
    g.fillText(live ? '● LIVE EVENT' : 'LIVE EVENT', 128, 86);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  let evCache = { at: 0, list: [] };
  function mokshaEvents() {
    if (Date.now() - evCache.at > 4000) evCache = { at: Date.now(), list: EventStore.mappable('Moksha') };
    return evCache.list;
  }
  window.addEventListener('linkup-events-changed', () => { evCache.at = 0; refreshMoksha(); });
  function refreshMoksha() {
    const evs = mokshaEvents();
    const active = festivalState('Moksha') !== 'ended' && evs.length;
    mokGroup.visible = !!active;
    if (!active) { if (stageGroup) stageGroup.visible = false; return; }
    const main = evs.find((e) => eventStatus(e) === 'live') || evs[0];
    const st = eventStatus(main);
    // stage furniture on real geometry; gone after the event
    if (stageGroup) {
      stageGroup.visible = st !== 'ended';
      stageGroup.position.set(GX(main.campus_x), 0, GZ(main.campus_y) + 6);
    }
    mokPulse.position.set(GX(main.campus_x), 0.7, GZ(main.campus_y));
    if (!mokMarker || mokMarker.userData.evId !== main.id || mokMarker.userData.st !== st) {
      if (mokMarker) {
        mokGroup.remove(mokMarker);
        const pi = pickTargets.indexOf(mokMarker);
        if (pi >= 0) pickTargets.splice(pi, 1);
        mokMarker.material.map.dispose(); mokMarker.material.dispose();
      }
      mokMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(main), transparent: true, depthTest: false }));
      mokMarker.renderOrder = 999; mokMarker.scale.set(120, 60, 1);
      mokMarker.userData = { kind: 'moksha', id: main.id, evId: main.id, st };
      mokGroup.add(mokMarker); pickTargets.push(mokMarker);
    }
    mokMarker.position.set(GX(main.campus_x), 52, GZ(main.campus_y));
    // venue focus ring (sized to the actual venue footprint)
    const RING_SIZE = { admin: 2.8, library: 2.5, apj: 2.8, sac: 1.9, sports: 2.3, hostel: 2.3, innovation: 1.9, amphi: 2.5, ground: 3.4, canteen: 2.3, nescafe: 1.3, gate: 1.2, amul: 1.0, pavilion: 1.2 };
    if (state.mokshaEventId) {
      const ev = EventStore.get(state.mokshaEventId);
      if (ev && ev.campus_x != null) {
        venueRing.visible = true;
        venueRing.position.set(GX(ev.campus_x), 0.7, GZ(ev.campus_y));
        const s = RING_SIZE[ev.venue_id] || 1.4;
        venueRing.scale.set(s, s, 1);
      } else venueRing.visible = false;
    } else if (state.highlightId) {
      const b = BUILDINGS.find((x) => x.id === state.highlightId);
      if (b) {
        venueRing.visible = true;
        venueRing.position.set(GX(b.x), 0.7, GZ(b.y));
        const s = RING_SIZE[state.highlightId] || 1.4;
        venueRing.scale.set(s, s, 1);
      } else venueRing.visible = false;
    } else venueRing.visible = false;
    // beams (evening/night only)
    const wantBeams = MODES[state.timeOfDay].beams > 0 && st !== 'ended';
    if (wantBeams && beams.length === 0 && stageGroup) {
      const bm = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: MODES[state.timeOfDay].beams * 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      for (const sx of [-20, 20]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 55, 12, 1, true), bm);
        cone.position.set(GX(main.campus_x) + sx, 42, GZ(main.campus_y) + 6);
        cone.rotation.z = sx < 0 ? -0.35 : 0.35;
        mokGroup.add(cone); beams.push(cone);
      }
    } else if (!wantBeams && beams.length) {
      for (const b of beams) mokGroup.remove(b);
      beams = [];
    } else if (beams.length) {
      beams[0].material.opacity = MODES[state.timeOfDay].beams * 0.5;
    }
  }

  /* ---------- camera + input ---------- */
  function applyCamera() {
    const t = new THREE.Vector3(cam.tx - 500, 0, cam.ty - 350);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    camera.position.set(
      t.x + cam.dist * cp * Math.sin(cam.yaw),
      t.y + cam.dist * sp,
      t.z + cam.dist * cp * Math.cos(cam.yaw),
    );
    camera.lookAt(t.x, 12, t.z);
    sun.target.position.set(t.x, 0, t.z);
  }
  function fitView() {
    const corners = [[80, 80], [920, 80], [80, 620], [920, 620]];
    let lo = 300, hi = 3200;
    const v = new THREE.Vector3();
    for (let i = 0; i < 14; i++) {
      cam.dist = (lo + hi) / 2; applyCamera(); camera.updateMatrixWorld();
      const ok = corners.every(([x, y]) => {
        v.set(GX(x), 0, GZ(y)).project(camera);
        return v.z < 1 && Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.9;
      });
      if (ok) hi = cam.dist; else lo = cam.dist;
    }
    cam.dist = Math.min(hi * 1.05, 2600); goal.dist = cam.dist;
  }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    state.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    state.w = Math.max(50, r.width); state.h = Math.max(50, r.height);
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(state.w, state.h, false);
    camera.aspect = state.w / state.h; camera.updateProjectionMatrix();
    if (!resize._fit) { fitView(); resize._fit = true; }
  }
  window.addEventListener('resize', resize);

  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function groundPoint(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const nd = new THREE.Vector2(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(nd, camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(groundPlane, p)) return null;
    const gx = p.x + 500, gy = p.z + 350;
    if (gx < -200 || gx > 1200 || gy < -200 || gy > 900) return null;
    return { x: gx, y: gy };
  }
  function pick(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const nd = new THREE.Vector2(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(nd, camera);
    const hits = ray.intersectObjects(pickTargets.filter((o) => o.visible !== false), true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.kind) o = o.parent;
      if (o) return { kind: o.userData.kind, id: o.userData.id };
    }
    return null;
  }
  let drag = null, moved = 0, pinchD = 0, downT = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    fly = null; downT = performance.now();
    drag = { x: e.clientX, y: e.clientY, tx: goal.tx, ty: goal.ty, yaw: goal.yaw, pitch: goal.pitch, orbit: e.button === 2 || e.shiftKey, grab: groundPoint(e.clientX, e.clientY) };
    moved = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    moved += 1;
    if (drag.orbit) {
      goal.yaw = drag.yaw - (e.clientX - drag.x) * 0.0052;
      goal.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.004, 0.28, 1.35);
    } else if (drag.grab) {
      const now = groundPoint(e.clientX, e.clientY);
      if (now) {
        goal.tx = clamp(drag.tx + (drag.grab.x - now.x), -100, 1100);
        goal.ty = clamp(drag.ty + (drag.grab.y - now.y), -100, 800);
      }
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && moved < 6 && performance.now() - downT < 350) {
      const hit = pick(e.clientX, e.clientY);
      state.selected = hit; onSelect(hit);
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => (drag = null));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); fly = null; goal.dist = clamp(goal.dist * (e.deltaY > 0 ? 1.1 : 0.9), 220, 2600); }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    const g = groundPoint(e.clientX, e.clientY);
    if (g) flyTo(g.x, g.y, { dist: Math.max(420, goal.dist * 0.6) });
  });
  canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { fly = null; pinchD = touchDist(e); } }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = touchDist(e);
      if (pinchD) goal.dist = clamp(goal.dist * (pinchD / d), 220, 2600);
      pinchD = d;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', () => (pinchD = 0));
  const touchDist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

  function flyTo(x, y, o = {}) {
    fly = { from: { ...goal }, to: { tx: x, ty: y, dist: o.dist ?? Math.min(goal.dist, 760), yaw: o.yaw ?? goal.yaw, pitch: o.pitch ?? Math.max(goal.pitch, 0.98) }, t: 0, dur: o.dur ?? 1.15 };
  }

  /* ---------- time of day ---------- */
  function applyMode() {
    const P = MODES[state.timeOfDay];
    scene.background.set(P.sky); scene.fog.color.set(P.fog);
    scene.userData.ground[0].material.color.set(P.groundOut);
    scene.userData.ground[1].material.color.set(P.ground);
    sun.color.set(P.sun); sun.intensity = P.sunI;
    sun.position.set(...SUNPOS[state.timeOfDay]);
    hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGnd); hemi.intensity = P.hemiI;
    for (const m of [...windowMats, ...stageMats]) m.emissiveIntensity = P.glow;
    stars.visible = P.stars;
    evCache.at = 0;
  }
  let stars;
  {
    const g = new THREE.BufferGeometry();
    const rng = mulberry(4), pos = [];
    for (let i = 0; i < 220; i++) {
      const a = rng() * TAU, e = 0.15 + rng() * 1.2, r = 3200;
      pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
    stars.visible = false; stars.frustumCulled = false;
    scene.add(stars);
  }

  /* ---------- route ---------- */
  function setRoute(r) {
    if (routeMesh) { scene.remove(routeMesh); routeMesh.geometry.dispose(); routeMesh = null; }
    for (const d of routeDots) scene.remove(d);
    routeDots = [];
    state.route = r;
    if (!r) return;
    const mesh = new THREE.Mesh(ribbonGeo(r.pts, 6, 0.7), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9 }));
    scene.add(mesh); routeMesh = mesh;
    const dotG = new THREE.SphereGeometry(2.2, 10, 8);
    const dotM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(dotG, dotM); scene.add(d); routeDots.push(d); }
  }
  function routeLen(pts) {
    let u = 0;
    for (let i = 0; i < pts.length - 1; i++) u += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    return u;
  }

  /* ---------- labels ---------- */
  const labelDefs = [
    ...BUILDINGS.filter((b) => b.id !== 'ground').map((b) => ({
      id: b.id, short: b.label, full: b.label.toUpperCase(), x: b.x, y: b.y, h: (HEIGHTS[b.id] || 10) + 8,
    })),
    { id: 'pavilion', short: 'Pavilion', full: 'PAVILION', x: 150, y: 492, h: 14 },
    { id: 'gate', short: 'Main Gate', full: 'NSUT MAIN GATE', x: 500, y: 60, h: 24 },
    { id: 'amul', short: 'Amul', full: 'AMUL', x: 672, y: 238, h: 16 },
  ];
  function updateLabels() {
    const v = new THREE.Vector3();
    let li = 0;
    const pxPerUnit = (state.h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / cam.dist;
    const use = (x, y, z, text, dimmed) => {
      v.set(GX(x), z, GZ(y)).project(camera);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) return;
      const el = getLabel(li++);
      el.style.display = 'block';
      el.style.left = ((v.x * 0.5 + 0.5) * state.w) + 'px';
      el.style.top = ((-v.y * 0.5 + 0.5) * state.h) + 'px';
      el.textContent = text;
      el.style.opacity = dimmed ? 0.4 : 1;
    };
    for (const L of labelDefs) {
      const d = Math.hypot(camera.position.x - GX(L.x), camera.position.z - GZ(L.y));
      const s = pxPerUnit * (cam.dist / Math.max(1, d)) * 1.0;
      let txt = null;
      if (s > 0.85) txt = L.full;
      else if (s > 0.42) txt = L.short;
      else if ((L.id === 'sac' || L.id === 'library') && s > 0.25) txt = L.short;
      if (!txt) continue;
      const dimmed = state.layer === 'food' && !(L.id === 'nescafe' || L.id === 'canteen');
      use(L.x, L.y, L.h, txt, dimmed);
    }
    if (!state.ghost && (state.layer === 'friends' || state.layer === 'events')) {
      for (const f of friendsRef.list) {
        if (!f.online) continue;
        use(f.x, f.y, 26, f.name.split(' ')[0], false);
      }
    }
    use(ME_POS.x, ME_POS.y, 14, 'YOU', false);
    if (state.mokshaEventId) {
      const ev = EventStore.get(state.mokshaEventId);
      if (ev && ev.campus_x != null) use(ev.campus_x, ev.campus_y, 26, `📍 ${ev.venue_name}`, false);
    }
    for (let i = li; i < labelPool.length; i++) labelPool[i].style.display = 'none';
  }

  /* ---------- main loop ---------- */
  const clock = new THREE.Clock();
  let refreshAt = 0;
  function draw() {
    requestAnimationFrame(draw);
    const dt = Math.min(0.05, clock.getDelta());
    state.t += dt;
    if (fly) {
      fly.t += dt / fly.dur;
      const k = ease(Math.min(1, fly.t));
      for (const key of ['tx', 'ty', 'dist', 'yaw', 'pitch']) cam[key] = fly.from[key] + (fly.to[key] - fly.from[key]) * k;
      if (fly.t >= 1) { Object.assign(goal, fly.to); fly = null; }
    } else {
      for (const key of ['tx', 'ty', 'dist', 'yaw', 'pitch']) cam[key] += (goal[key] - cam[key]) * Math.min(1, dt * 9);
    }
    applyCamera();
    for (const l of lodObjs) l.update(camera);
    if (Date.now() - refreshAt > 2500) { refreshAt = Date.now(); refreshMoksha(); }
    // marker pulse
    if (mokPulse && mokGroup.visible) {
      const s = 1 + 0.35 * Math.sin(state.t * 2.6);
      mokPulse.scale.set(s, s, 1);
      mokPulse.material.opacity = 0.45 + 0.2 * Math.sin(state.t * 2.6);
    }
    if (venueRing.visible) venueRing.material.opacity = 0.5 + 0.3 * Math.sin(state.t * 4);
    // route dots march
    if (state.route && routeDots.length) {
      const total = routeLen(state.route.pts);
      for (let i = 0; i < routeDots.length; i++) {
        let d = ((state.t * 30 + (i * total) / 3) % total);
        for (let s = 0; s < state.route.pts.length - 1; s++) {
          const [ax, ay] = state.route.pts[s], [bx, by] = state.route.pts[s + 1];
          const L = Math.hypot(bx - ax, by - ay);
          if (d <= L) {
            routeDots[i].position.set(GX(ax + ((bx - ax) * d) / L), 2.2, GZ(ay + ((by - ay) * d) / L));
            break;
          }
          d -= L;
        }
      }
    }
    // friend pins face camera automatically (sprites); dim non-matching layers
    const showFriends = !state.ghost && (state.layer === 'friends' || state.layer === 'events');
    for (const sp of friendSprites) sp.visible = showFriends;
    meGroup.visible = true;
    renderer.render(scene, camera);
    updateLabels();
  }

  /* ---------- public API (same surface as before) ---------- */
  function setLayer(l) { state.layer = l; }
  function setGhost(v) { state.ghost = v; }
  function zoomBy(f) { fly = null; goal.dist = clamp(goal.dist * f, 220, 2600); }
  function locate() { flyTo(ME_POS.x, ME_POS.y, { dist: 620 }); }
  function toggleTilt() { const n = goal.pitch > 0.75 ? 0.42 : 1.08; goal.pitch = n; return n; }
  function focus(x, y, z = 1.5) { flyTo(x, y, { dist: Math.max(380, 900 / z) }); }
  function rotateBy(a) { fly = null; goal.yaw += a; }
  function cycleTimeOfDay() {
    state.timeOfDay = state.timeOfDay === 'day' ? 'evening' : state.timeOfDay === 'evening' ? 'night' : 'day';
    applyMode(); return state.timeOfDay;
  }
  function focusMoksha(ev) {
    if (!ev || ev.campus_x == null) return;
    state.mokshaEventId = ev.id; state.highlightId = ev.venue_id;
    refreshMoksha();
    flyTo(ev.campus_x, ev.campus_y, { dist: 520, pitch: 1.02, dur: 1.2 });
  }

  resize();
  applyMode();
  refreshMoksha();
  draw();
  return {
    state, friendsRef, setLayer, setGhost, focus,
    zoomIn: () => zoomBy(0.8), zoomOut: () => zoomBy(1.25), locate, toggleTilt, rotateBy,
    flyTo, cycleTimeOfDay,
    setMokshaFilter(v) { state.mokshaFilter = v; },
    setHighlight(id) { state.highlightId = id; state.mokshaEventId = null; },
    focusMoksha,
    clearMokshaFocus() { state.mokshaEventId = null; state.highlightId = null; refreshMoksha(); },
    setRoute,
    mePos: ME_POS, metersPerUnit: 0.9,
  };

  function stubApi() {
    const noop = () => {};
    return {
      state, friendsRef, setLayer: noop, setGhost: noop, focus: noop,
      zoomIn: noop, zoomOut: noop, locate: noop, toggleTilt: () => 1, rotateBy: noop,
      flyTo: noop, cycleTimeOfDay: () => state.timeOfDay,
      setMokshaFilter: noop, setHighlight: noop, focusMoksha: noop,
      clearMokshaFocus: noop, setRoute: noop,
      mePos: ME_POS, metersPerUnit: 0.9,
    };
  }
}
