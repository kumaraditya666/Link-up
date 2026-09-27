/* Link Up — Three.js 3D campus renderer (offline-first, vendored three).
 *
 * Geography follows the verified reference layout: North Gate NW, Main Gate SW,
 * Design + Boys Hostels north, Canteen/APJ/Smart north-central, Amul Ground,
 * Moksha Ground central (main fest venue), Admin + Academic Blocks + SAC/Library
 * mid-campus, Gym east, Sports Complex far east with track, NESCII halls,
 * Guest House + Girls Hostel south. Stylized miniature — footprints approximate.
 */
import * as THREE from 'three';
import { loadGLB } from './load-glb.js';
import { ROADS } from './route.js';
import { BUILDINGS, FRIENDS } from './data.js';
import { EventStore, eventStatus, festivalState } from './events.js';

const GX = (x) => x - 500;
const GZ = (y) => y - 350;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* approximate campus boundary (from reference outline — never drawn raw) */
const BOUNDARY = [[40, 120], [300, 130], [430, 60], [560, 20], [660, 60], [645, 180], [665, 260], [615, 345], [830, 365], [905, 435], [835, 620], [700, 665], [100, 665], [35, 640], [35, 560], [35, 470], [35, 380], [35, 250], [35, 180]];
const GATES = [{ x: 30, y: 133 }, { x: 30, y: 450 }];
function inPoly(x, y) {
  let inside = false;
  for (let i = 0, j = BOUNDARY.length - 1; i < BOUNDARY.length; j = i++) {
    const [xi, yi] = BOUNDARY[i], [xj, yj] = BOUNDARY[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const MODES = {
  day: { sky: 0xcfd6dd, fog: 0xd8d2c4, tintOut: 0xffffff, tintIn: 0xffffff, sun: 0xfff1dc, sunI: 2.5, hemiSky: 0xbfd4e6, hemiGnd: 0x9a8f7a, hemiI: 0.9, glow: 0.08, beams: 0, stars: false },
  evening: { sky: 0x38324e, fog: 0x9a7f72, tintOut: 0xd8c2ae, tintIn: 0xcfae90, sun: 0xffb37a, sunI: 1.6, hemiSky: 0x7a6f9a, hemiGnd: 0x4a423a, hemiI: 0.55, glow: 1.1, beams: 0.35, stars: false },
  night: { sky: 0x05070f, fog: 0x0a1226, tintOut: 0x5a6a8a, tintIn: 0x4a5a76, sun: 0xb9ccff, sunI: 0.4, hemiSky: 0x2a3a5e, hemiGnd: 0x101a14, hemiI: 0.35, glow: 1.7, beams: 0.6, stars: true },
};
const SUNPOS = { day: [600, 950, 350], evening: [-850, 260, 250], night: [450, 750, -350] };

const PLAZAS = [
  { x: 345, y: 428, w: 110, d: 32 },  // admin forecourt (south of the vertical block)
  { x: 460, y: 202, w: 110, d: 30 },  // canteen apron
  { x: 550, y: 422, w: 120, d: 30 },  // sac apron
];
const PARKING = { x: 250, y: 438, w: 70, d: 26 };
const FIELDS = [
  { id: 'sports', x: 780, y: 470, w: 150, d: 100, track: true, goals: true },
  { id: 'moksha-ground', x: 475, y: 288, w: 270, d: 56, markings: true, dirt: true },
  { id: 'amul-ground', x: 230, y: 235, w: 140, d: 80, plain: true },
  { id: 'nescii2', x: 210, y: 300, w: 110, d: 70, plain: true },
  { id: 'nescii1', x: 270, y: 420, w: 110, d: 70, plain: true, dirt: true },
];
/* model placements: {m: model file id, id: pick/map id, x, y, ry?} */
const PLACEMENTS = [
  { m: 'admin', id: 'admin', x: 345, y: 355 },
  { m: 'library', id: 'sac-lib', x: 550, y: 395 },
  { m: 'apj', id: 'apj', x: 425, y: 225 },
  { m: 'canteen', id: 'canteen', x: 460, y: 180 },
  { m: 'hostel', id: 'boys-a', x: 200, y: 160 },
  { m: 'hostel', id: 'boys-b', x: 300, y: 190 },
  { m: 'hostel', id: 'girls', x: 470, y: 540 },
  { m: 'gate', id: 'north-gate', x: 32, y: 133, ry: Math.PI / 2 },
  { m: 'gate', id: 'main-gate', x: 32, y: 450, ry: Math.PI / 2 },
  { m: 'kiosk', id: 'safal', x: 380, y: 205 },
  { m: 'kiosk', id: 'stationary', x: 510, y: 215 },
  { m: 'academic', id: 'academic-a', x: 430, y: 400 },
  { m: 'academic', id: 'academic-b', x: 490, y: 360 },
  { m: 'gym', id: 'gym', x: 632, y: 405 },
  { m: 'guest', id: 'guest', x: 400, y: 490 },
  { m: 'design', id: 'design', x: 130, y: 100 },
  { m: 'smart', id: 'smart', x: 550, y: 238 },
  { m: 'flag', id: 'flag', x: 300, y: 358 },
];
/* tree-avoid rects [cx, cy, hw, hd] */
const FOOT = [
  [345, 355, 36, 62], [550, 395, 70, 40], [425, 225, 70, 45], [460, 180, 65, 32],
  [200, 160, 60, 40], [300, 190, 60, 40], [470, 540, 60, 40], [130, 100, 55, 35],
  [430, 400, 55, 45], [490, 360, 55, 45],
  [632, 405, 28, 24], [400, 490, 40, 30], [550, 238, 40, 30], [300, 358, 22, 22],  [380, 205, 16, 14], [510, 215, 16, 14],
];
const HEIGHTS = {
  admin: 17, 'sac-lib': 15, apj: 16, smart: 12, canteen: 9,
  'boys-a': 19, 'boys-b': 19, girls: 16, design: 14, 'north-gate': 16, 'main-gate': 16,
  safal: 6, stationary: 6, 'academic-a': 15, 'academic-b': 15, nescii2: 3, nescii1: 3, gym: 7,
  guest: 9, flag: 22, 'moksha-ground': 4, 'amul-ground': 4, sports: 6,
};
const ME_POS = { x: 350, y: 400 };

export function createMap(canvas, opts = {}) {
  const onSelect = opts.onSelect || (() => {});
  const onHover = opts.onHover || (() => {});
  const friendsRef = { list: FRIENDS };
  const state = {
    layer: 'friends', ghost: false, mokshaFilter: false, selected: null,
    t: 0, w: 0, h: 0, dpr: 1, timeOfDay: 'day',
    highlightId: null, route: null, mokshaEventId: null,
    cam: null,
  };
  const cam = (state.cam = { tx: 470, ty: 350, dist: 1250, yaw: -0.62, pitch: 0.96 });
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
  scene.background = new THREE.Color(MODES.day.sky);
  scene.fog = new THREE.Fog(MODES.day.fog, 1400, 4200);
  const camera = new THREE.PerspectiveCamera(48, 1, 2, 8000);

  const hemi = new THREE.HemisphereLight(0xbfd4e6, 0x9a8f7a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.5);
  sun.position.set(600, 950, 350);
  sun.castShadow = true;
  sun.shadow.mapSize.set(window.innerWidth < 700 ? 1024 : 2048, window.innerWidth < 700 ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 10, far: 4000 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

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
      const nx = (-dy * w) / 2, ny = (dx * w) / 2;
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
  /* procedural ground textures (canvas-baked, zero assets): soft blotches + speckle */
  function groundTexture(base, blobs, seed, repeat) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const rng = mulberry(seed);
    for (let i = 0; i < 90; i++) {
      const r = 8 + rng() * 30;
      g.fillStyle = blobs[Math.floor(rng() * blobs.length)];
      g.globalAlpha = 0.05 + rng() * 0.08;
      g.beginPath();
      g.ellipse(rng() * 256, rng() * 256, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 0.05;
    for (let i = 0; i < 800; i++) { g.fillStyle = rng() > 0.5 ? '#000' : '#fff'; g.fillRect(rng() * 256, rng() * 256, 1.5, 1.5); }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(repeat, repeat);
    return t;
  }
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  {
    const P = MODES.day;
    const terrainTex = groundTexture('#D8D2C4', ['#CFC9BA', '#DDD8CC', '#C4B99B', '#E4DED2'], 5, 32);
    const lawnTex = groundTexture('#7cab5e', ['#6b9a4e', '#86b366', '#5f8f47', '#8fae62'], 9, 0.012);
    const outer = flat(5200, 5200, 0xffffff, -0.6);
    outer.material.map = terrainTex; outer.material.color.set(P.tintOut);
    scene.add(outer);
    // campus ground follows the boundary polygon (urban grey-green outside)
    const shape = new THREE.Shape();
    BOUNDARY.forEach(([x, y], i) => { const vx = GX(x), vz = GZ(y); if (i === 0) shape.moveTo(vx, -vz); else shape.lineTo(vx, -vz); });
    const campusGeo = new THREE.ShapeGeometry(shape);
    campusGeo.rotateX(-Math.PI / 2);
    const campus = new THREE.Mesh(campusGeo, new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 }));
    campus.material.color.set(P.tintIn);
    campus.position.y = 0; campus.receiveShadow = true;
    // ShapeGeometry lies in XY; after rotateX(-90°), shape Y maps to -Z. We built with -vz so it lands right.
    scene.add(campus);
    scene.userData.ground = [outer, campus];
    // boundary hedge wall (natural edge, not the reference's cyan line)
    const hedgePts = [];
    for (let i = 0; i < BOUNDARY.length; i++) {
      const [ax, ay] = BOUNDARY[i], [bx, by] = BOUNDARY[(i + 1) % BOUNDARY.length];
      const L = Math.hypot(bx - ax, by - ay);
      for (let d = 3; d < L - 2; d += 7) {
        const x = ax + ((bx - ax) * d) / L, y = ay + ((by - ay) * d) / L;
        if (GATES.some((g) => Math.hypot(x - g.x, y - g.y) < 16)) continue; // gate gaps
        hedgePts.push({ x, y, a: Math.atan2(by - ay, bx - ax) });
      }
    }
    const hedge = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4.5, 5, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x2e6b34, roughness: 1 }),
      hedgePts.length,
    );
    {
      const d = new THREE.Object3D(), col = new THREE.Color();
      hedgePts.forEach((p, i) => {
        d.position.set(GX(p.x), 2.2, GZ(p.y)); d.rotation.y = -p.a;
        d.scale.set(1, 0.85 + ((i * 37) % 10) / 28, 1); d.updateMatrix();
        hedge.setMatrixAt(i, d.matrix);
        hedge.setColorAt(i, col.set(i % 3 ? 0x2e6b34 : 0x3a7d40));
      });
    }
    hedge.instanceMatrix.needsUpdate = true;
    if (hedge.instanceColor) hedge.instanceColor.needsUpdate = true;
    hedge.castShadow = true;
    scene.add(hedge);
    // surrounding city: low-detail blocks + scrub trees so campus sits in a real place
    {
      const rng = mulberry(4242);
      const spots = [];
      let guard = 0;
      while (spots.length < 130 && guard++ < 4000) {
        const a = rng() * TAU, rr = 640 + rng() * 480;
        const x = 470 + Math.cos(a) * rr, y = 345 + Math.sin(a) * rr * 0.8;
        if (x < -600 || x > 1600 || y < -500 || y > 1200) continue;
        if (inPoly(x, y)) continue;
        let nearEdge = false;
        for (let i = 0; i < BOUNDARY.length; i++) {
          const [ax, ay] = BOUNDARY[i], [bx, by] = BOUNDARY[(i + 1) % BOUNDARY.length];
          if (segDist2(x, y, ax, ay, bx, by) < 55) { nearEdge = true; break; }
        }
        if (nearEdge) continue;
        spots.push({ x, y, w: 22 + rng() * 42, h: 8 + rng() * 26, d: 22 + rng() * 42, r: rng() * 0.6 - 0.3, tone: rng() });
      }
      const cityGeo = new THREE.BoxGeometry(1, 1, 1);
      cityGeo.translate(0, 0.5, 0);
      const city = new THREE.InstancedMesh(cityGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), spots.length);
      const cityCols = [0xcfc8b8, 0xbdb5a4, 0xd8d2c4, 0xa8a094, 0xc4bcac];
      const d = new THREE.Object3D(), col = new THREE.Color();
      const treeSpots = [];
      spots.forEach((s, i) => {
        d.position.set(GX(s.x), 0, GZ(s.y)); d.rotation.y = s.r; d.scale.set(s.w, s.h, s.d); d.updateMatrix();
        city.setMatrixAt(i, d.matrix);
        city.setColorAt(i, col.set(cityCols[Math.floor(s.tone * cityCols.length)]));
        if (s.tone > 0.45) treeSpots.push({ x: s.x + s.w * 0.9, y: s.y, r: 5 + s.tone * 3 });
      });
      city.instanceMatrix.needsUpdate = true;
      if (city.instanceColor) city.instanceColor.needsUpdate = true;
      scene.add(city);
      // distant scrub trees (canopy blobs, no trunks at this LOD)
      const scrub = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ roughness: 1 }),
        treeSpots.length,
      );
      treeSpots.forEach((t, i) => {
        d.position.set(GX(t.x), t.r * 0.5, GZ(t.y)); d.rotation.y = 0; d.scale.set(t.r, t.r * 0.7, t.r); d.updateMatrix();
        scrub.setMatrixAt(i, d.matrix);
        scrub.setColorAt(i, col.set(i % 2 ? 0x5d7a44 : 0x6b8a4e));
      });
      scrub.instanceMatrix.needsUpdate = true;
      if (scrub.instanceColor) scrub.instanceColor.needsUpdate = true;
      scene.add(scrub);
      // outer arterials: west highway + south road
      for (const pts of [[[-140, -200], [-140, 900]], [[-200, 860], [1200, 860]]]) {
        const m = new THREE.Mesh(ribbonGeo(pts, 18, 0.1), new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 1 }));
        m.receiveShadow = true; scene.add(m);
      }
    }
    for (const pz of PLAZAS) {
      const q = flat(pz.w, pz.d, 0xb9b3a4, 0.25); q.position.set(GX(pz.x), 0.25, GZ(pz.y)); scene.add(q);
    }
    const pk = flat(PARKING.w, PARKING.d, 0x4a4f5c, 0.25); pk.position.set(GX(PARKING.x), 0.25, GZ(PARKING.y)); scene.add(pk);
    for (const r of ROADS) {
      const curb = new THREE.Mesh(ribbonGeo(r.pts, r.w + 3, 0.15), new THREE.MeshStandardMaterial({ color: 0xcfc9ba, roughness: 1 }));
      curb.receiveShadow = true; scene.add(curb);
      const top = new THREE.Mesh(ribbonGeo(r.pts, r.w, 0.3), new THREE.MeshStandardMaterial({ color: r.kind === 'path' ? 0xc9bd9f : 0x6b7280, roughness: 1 }));
      top.receiveShadow = true; scene.add(top);
      if (r.kind === 'road') {
        const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f0dc });
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
          const L = Math.hypot(bx - ax, by - ay);
          for (let dd = 4; dd < L - 4; dd += 16) {
            const t = dd / L;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 7), dashMat);
            m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(by - ay, bx - ax);
            m.position.set(GX(ax + (bx - ax) * t), 0.45, GZ(ay + (by - ay) * t));
            scene.add(m);
          }
        }
      }
    }
    drawFields(P);
  }

  function drawFields(P) {
    for (const F of FIELDS) {
      if (F.track) {
        // running track: terracotta ring around a striped pitch
        const outer = new THREE.Shape();
        outer.absellipse(0, 0, F.w / 2 + 22, F.d / 2 + 22, 0, TAU);
        const hole = new THREE.Path();
        hole.absellipse(0, 0, F.w / 2 + 4, F.d / 2 + 4, 0, TAU);
        outer.holes.push(hole);
        const tg = new THREE.ShapeGeometry(outer, 48);
        tg.rotateX(-Math.PI / 2);
        const track = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x9a5a34, roughness: 1 }));
        track.position.set(GX(F.x), 0.32, GZ(F.y)); track.receiveShadow = true;
        scene.add(track);
      }
      const stripes = F.plain ? 4 : 8;
      for (let i = 0; i < stripes; i++) {
        const col = F.dirt ? (i % 2 ? 0x9c7f47 : 0xa8894f) : i % 2 ? 0x35803f : 0x2f7539;
        const s = flat(F.w / stripes, F.d, col, 0.22);
        s.position.set(GX(F.x - F.w / 2 + (F.w / stripes) * (i + 0.5)), 0.22, GZ(F.y));
        scene.add(s);
      }
      if (F.markings || F.goals) {
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
        const line = (x0, y0, x1, y1) => {
          const len = Math.hypot(x1 - x0, y1 - y0);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, len), lineMat);
          m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
          m.position.set(GX((x0 + x1) / 2), 0.4, GZ((y0 + y1) / 2)); scene.add(m);
        };
        line(F.x - F.w / 2 + 3, F.y - F.d / 2 + 3, F.x + F.w / 2 - 3, F.y - F.d / 2 + 3);
        line(F.x - F.w / 2 + 3, F.y + F.d / 2 - 3, F.x + F.w / 2 - 3, F.y + F.d / 2 - 3);
        line(F.x - F.w / 2 + 3, F.y - F.d / 2 + 3, F.x - F.w / 2 + 3, F.y + F.d / 2 - 3);
        line(F.x + F.w / 2 - 3, F.y - F.d / 2 + 3, F.x + F.w / 2 - 3, F.y + F.d / 2 - 3);
        if (F.goals) {
          line(F.x, F.y - F.d / 2 + 3, F.x, F.y + F.d / 2 - 3);
          const goalMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.6 });
          for (const gx of [F.x - F.w / 2 + 1, F.x + F.w / 2 - 1]) {
            for (const dz of [-4.5, 4.5]) {
              const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 8), goalMat);
              post.position.set(GX(gx), 1.7, GZ(F.y + dz)); post.castShadow = true; scene.add(post);
            }
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9.7, 8), goalMat);
            bar.rotation.x = Math.PI / 2; bar.position.set(GX(gx), 3.4, GZ(F.y)); scene.add(bar);
          }
          // fence posts around the stadium
          const fenceMat = new THREE.MeshStandardMaterial({ color: 0x5b6472, roughness: 1 });
          for (let x = F.x - F.w / 2 - 30; x <= F.x + F.w / 2 + 30; x += 18) {
            for (const y of [F.y - F.d / 2 - 30, F.y + F.d / 2 + 30]) {
              const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4, 6), fenceMat);
              post.position.set(GX(x), 2, GZ(y)); scene.add(post);
            }
          }
        } else {
          // centre circle for fest/sports grounds
          const pts = [];
          for (let i = 0; i <= 26; i++) { const a = (i / 26) * TAU; pts.push([F.x + Math.cos(a) * 13, F.y + Math.sin(a) * 13]); }
          for (let i = 0; i < pts.length - 1; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        }
      }
      // pickable ground marker (invisible hit plane)
      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(F.w, F.d),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      tag.rotation.x = -Math.PI / 2;
      tag.position.set(GX(F.x), 2, GZ(F.y));
      tag.userData = { kind: 'place', id: F.id };
      scene.add(tag); pickTargets.push(tag);
    }
  }

  /* ---------- GLB landmarks + LOD (LOW now, HIGH lazily by proximity) ---------- */
  const lodObjs = [];
  const cache = new Map(); // model id -> {lo}
  const lodByModel = new Map(); // model id -> [{lod, loObj}]
  const hiLoaded = new Set();
  async function loadModels() {
    const ids = [...new Set(PLACEMENTS.filter((p) => !p.skip).map((p) => p.m))];
    await Promise.all(ids.map(async (id) => {
      try {
        const lo = await loadGLB(`models/${id}-low.glb`);
        cache.set(id, { lo });
      } catch (e) { console.warn('model load failed', id, e); }
    }));
    for (const p of PLACEMENTS) {
      if (p.skip || !cache.has(p.m)) continue;
      const { lo } = cache.get(p.m);
      const lod = new THREE.LOD();
      const loObj = lo.group.clone();
      lod.addLevel(loObj, 0);
      lod.position.set(GX(p.x), 0, GZ(p.y));
      if (p.ry) lod.rotation.y = p.ry;
      lod.userData = { kind: 'place', id: p.id };
      lod.traverse((o) => { o.userData.pickRoot = lod; });
      scene.add(lod); lodObjs.push(lod); pickTargets.push(lod);
      if (!lodByModel.has(p.m)) lodByModel.set(p.m, []);
      lodByModel.get(p.m).push({ lod, loObj, x: p.x, y: p.y });
    }
  }
  async function ensureHigh(id) {
    if (hiLoaded.has(id) || !lodByModel.has(id)) return;
    hiLoaded.add(id);
    try {
      const { group, windowMats: wm } = await loadGLB(`models/${id}-high.glb`);
      for (const m of wm) windowMats.push(m);
      for (const { lod, loObj } of lodByModel.get(id)) {
        lod.addLevel(group.clone(), 0);
        for (const lv of lod.levels) if (lv.object === loObj) lv.distance = 950;
      }
      applyMode(); // restyle fresh window glow for current time of day
    } catch (e) { console.warn('high model failed', id, e); }
  }
  function lazyHighTick() {
    for (const [id, list] of lodByModel) {
      if (hiLoaded.has(id)) continue;
      if (list.some((p) => Math.hypot(p.x - cam.tx, p.y - cam.ty) < 1300)) ensureHigh(id);
    }
  }
  loadModels();
  let stageGroup = null, stageMats = [], stageLoading = false;
  function ensureStage() {
    if (stageGroup || stageLoading) return;
    stageLoading = true;
    loadGLB('models/moksha-stage-high.glb').then(({ group, windowMats: wm }) => {
      stageGroup = group; stageMats = wm; stageGroup.visible = false; scene.add(stageGroup);
      applyMode();
      refreshMoksha();
    }).catch(() => { stageLoading = false; });
  }

  /* ---------- trees (inside boundary only) ---------- */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  {
    const rng = mulberry(20260327);
    const spots = [];
    let guard = 0;
    while (spots.length < 170 && guard++ < 5000) {
      const x = 20 + rng() * 900, y = 10 + rng() * 670;
      if (!inPoly(x, y)) continue;
      if (FOOT.some(([fx, fy, hw, hd]) => Math.abs(x - fx) < hw + 10 && Math.abs(y - fy) < hd + 10)) continue;
      if (FIELDS.some((F) => Math.abs(x - F.x) < F.w / 2 + 10 && Math.abs(y - F.y) < F.d / 2 + 10)) continue;
      if (PLAZAS.some((p) => Math.abs(x - p.x) < p.w / 2 + 5 && Math.abs(y - p.y) < p.d / 2 + 5)) continue;
      if (Math.abs(x - PARKING.x) < PARKING.w / 2 + 5 && Math.abs(y - PARKING.y) < PARKING.d / 2 + 5) continue;
      if (ROADS.some((r) => { for (let i = 0; i < r.pts.length - 1; i++) if (segDist(x, y, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) < r.w / 2 + 6) return true; return false; })) continue;
      spots.push({ x, y, h: 8 + rng() * 6, r: 5 + rng() * 3, tone: rng(), rot: rng() * TAU });
    }
    const trunkG = new THREE.CylinderGeometry(0.7, 1.0, 5, 6);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });    const trunks = new THREE.InstancedMesh(trunkG, trunkM, spots.length);
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
    const spots = [[460, 200], [475, 300], [550, 415], [230, 260], [780, 500], [300, 382], [600, 348]];
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
    const carCols = [0x7d8aa0, 0xa33d1f, 0x31437c, 0xc9ced7, 0x5d6673, 0x7c4a12];
    const carPos = [[232, 438, 0], [244, 438, 0], [256, 438, 0], [268, 438, 0], [240, 447, 0], [262, 447, 0]];
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
    const dot = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), new THREE.MeshBasicMaterial({ color: 0xb7ff2a }));
    dot.position.y = 4; meGroup.add(dot);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6, 8.5, 40), new THREE.MeshBasicMaterial({ color: 0xb7ff2a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; meGroup.add(ring);
    meGroup.position.set(GX(ME_POS.x), 0, GZ(ME_POS.y));
    scene.add(meGroup);
  }
  function pinTexture(text, bg, fg) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(48, 48, 44, 0, TAU); g.fillStyle = 'rgba(183,255,42,.22)'; g.fill();
    g.beginPath(); g.arc(48, 48, 32, 0, TAU); g.fillStyle = bg; g.fill();
    g.lineWidth = 4; g.strokeStyle = '#b7ff2a'; g.stroke();
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
  const crowdDot = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xb7ff2a }),
  );
  crowdDot.visible = false;
  mokGroup.add(crowdDot);
  {
    mokPulse = new THREE.Mesh(new THREE.RingGeometry(46, 50, 64), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    mokPulse.rotation.x = -Math.PI / 2; mokGroup.add(mokPulse);
    venueRing = new THREE.Mesh(new THREE.RingGeometry(30, 34, 64), new THREE.MeshBasicMaterial({ color: 0xb7ff2a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    venueRing.rotation.x = -Math.PI / 2; venueRing.visible = false; mokGroup.add(venueRing);
  }
  function markerTexture(ev) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const live = eventStatus(ev) === 'live';
    g.fillStyle = 'rgba(7,11,22,.94)';
    g.strokeStyle = live ? '#b7ff2a' : '#7dd3fc'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(28, 8, 200, 84, 16); g.fill(); g.stroke();
    g.font = '30px system-ui'; g.textAlign = 'center'; g.fillText('🎭', 128, 42);
    g.fillStyle = '#fff'; g.font = '800 24px system-ui'; g.fillText('MOKSHA', 128, 68);
    g.fillStyle = live ? '#b7ff2a' : '#7dd3fc'; g.font = '800 15px system-ui';
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
  const RING_SIZE = {
    admin: 3.2, 'sac-lib': 2.4, 'moksha-ground': 3.6, 'amul-ground': 2.6, sports: 3.2,
    canteen: 2.2, apj: 2.2, gym: 1.8, flag: 1.4, nescii1: 2.2, nescii2: 2.2,
    'academic-a': 1.9, 'academic-b': 1.9,
  };
  function refreshMoksha() {
    const evs = mokshaEvents();
    const active = festivalState('Moksha') !== 'ended' && evs.length;
    mokGroup.visible = !!active;
    if (!active) { if (stageGroup) stageGroup.visible = false; return; }
    ensureStage();
    const main = evs.find((e) => eventStatus(e) === 'live') || evs[0];
    const st = eventStatus(main);
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
    // reliable crowd data only — never fabricated (hidden otherwise)
    if (['low', 'moderate', 'high'].includes(main.crowd)) {
      crowdDot.visible = true;
      crowdDot.position.set(GX(main.campus_x) + 26, 8, GZ(main.campus_y) - 14);
      crowdDot.material.color.set(main.crowd === 'low' ? 0x34d399 : main.crowd === 'moderate' ? 0xfbbf24 : 0xef4444);
      const cs = 1 + 0.18 * Math.sin(state.t * 3);
      crowdDot.scale.set(cs, cs, cs);
    } else crowdDot.visible = false;
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
    const wantBeams = MODES[state.timeOfDay].beams > 0 && st !== 'ended';
    if (wantBeams && beams.length === 0 && stageGroup) {
      const bm = new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: MODES[state.timeOfDay].beams * 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
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
    const corners = [[30, 20], [920, 20], [30, 680], [920, 680]];
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
  const hoverTick = {};
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    fly = null; downT = performance.now();
    drag = { x: e.clientX, y: e.clientY, tx: goal.tx, ty: goal.ty, yaw: goal.yaw, pitch: goal.pitch, orbit: e.button === 2 || e.shiftKey, grab: groundPoint(e.clientX, e.clientY) };
    moved = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      // hover preview (throttled): building/friend name near cursor
      const nowT = performance.now();
      if (nowT - (hoverTick._l || 0) > 90 && e.pointerType !== 'touch') {
        hoverTick._l = nowT;
        const r = canvas.getBoundingClientRect();
        onHover(pick(e.clientX - r.left, e.clientY - r.top), e.clientX, e.clientY);
      }
      return;
    }
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
    scene.userData.ground[0].material.color.set(P.tintOut);
    scene.userData.ground[1].material.color.set(P.tintIn);
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
    const mesh = new THREE.Mesh(ribbonGeo(r.pts, 6, 0.7), new THREE.MeshBasicMaterial({ color: 0xb7ff2a, transparent: true, opacity: 0.85 }));
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
  const labelDefs = BUILDINGS.map((b) => ({
    id: b.id, short: b.label, full: b.label.toUpperCase(), x: b.x, y: b.y, h: (HEIGHTS[b.id] || 10) + 8,
  }));
  function updateLabels() {
    const v = new THREE.Vector3();
    let li = 0;
    const pxPerUnit = (state.h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / cam.dist;
    const use = (x, y, z, text, dimmed, person) => {
      v.set(GX(x), z, GZ(y)).project(camera);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) return;
      const el = getLabel(li++);
      el.style.display = 'block';
      el.style.left = ((v.x * 0.5 + 0.5) * state.w) + 'px';
      el.style.top = ((-v.y * 0.5 + 0.5) * state.h) + 'px';
      el.textContent = (person && person !== 'you' ? '● ' : '') + text;
      el.style.opacity = dimmed ? 0.4 : 1;
      if (person === 'you') { el.style.background = '#0b0e05'; el.style.borderColor = '#b7ff2a'; el.style.color = '#b7ff2a'; }
      else if (person) { el.style.background = '#b7ff2a'; el.style.borderColor = '#b7ff2a'; el.style.color = '#0b0e05'; }
      else { el.style.background = 'rgba(6,10,21,0.8)'; el.style.borderColor = 'rgba(255,255,255,0.18)'; el.style.color = '#e6ebff'; }
    };
    for (const L of labelDefs) {
      const d = Math.hypot(camera.position.x - GX(L.x), camera.position.z - GZ(L.y));
      const s = pxPerUnit * (cam.dist / Math.max(1, d));
      let txt = null;
      if (s > 0.85) txt = L.full;
      else if (s > 0.42) txt = L.short;
      else if ((L.id === 'sac-lib' || L.id === 'moksha-ground') && s > 0.25) txt = L.short;
      if (!txt) continue;
      const dimmed = state.layer === 'food' && !(L.id === 'canteen' || L.id === 'safal');
      use(L.x, L.y, L.h, txt, dimmed);
    }
    if (!state.ghost && (state.layer === 'friends' || state.layer === 'events')) {
      for (const f of friendsRef.list) {
        if (!f.online) continue;
        use(f.x, f.y, 26, f.name.split(' ')[0], false, 'friend');
      }
    }
    use(ME_POS.x, ME_POS.y, 14, 'YOU', false, 'you');
    if (state.mokshaEventId) {
      const ev = EventStore.get(state.mokshaEventId);
      if (ev && ev.campus_x != null) use(ev.campus_x, ev.campus_y, 26, `📍 ${ev.venue_name}`, false);
    }
    for (let i = li; i < labelPool.length; i++) labelPool[i].style.display = 'none';
  }

  /* ---------- main loop ---------- */
  const clock = new THREE.Clock();
  let refreshAt = 0, lazyTick = 0;
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
    lazyTick += dt;
    if (lazyTick > 2) { lazyTick = 0; lazyHighTick(); }
    if (mokPulse && mokGroup.visible) {
      const s = 1 + 0.35 * Math.sin(state.t * 2.6);
      mokPulse.scale.set(s, s, 1);
      mokPulse.material.opacity = 0.45 + 0.2 * Math.sin(state.t * 2.6);
    }
    if (venueRing.visible) venueRing.material.opacity = 0.5 + 0.3 * Math.sin(state.t * 4);
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
    const showFriendsLayer = state.layer === 'friends' || state.layer === 'events';
    state.ghostMix += (((state.ghost ? 0 : 1) - (state.ghostMix ?? 1)) * Math.min(1, dt * 4));
    const gm = state.ghostMix ?? 1;
    friendSprites.forEach((sp, i) => {
      sp.visible = showFriendsLayer && gm > 0.03;
      sp.material.opacity = gm;
      const s = 22 * (1 + 0.07 * Math.sin(state.t * 3 + i * 1.7));
      sp.scale.set(s, s, 1);
    });
    meGroup.visible = true;
    meGroup.position.set(GX(ME_POS.x), 0, GZ(ME_POS.y));
    renderer.render(scene, camera);
    updateLabels();
  }

  /* ---------- public API ---------- */
  function setLayer(l) { state.layer = l; }
  function setGhost(v) { state.ghost = v; }
  function zoomBy(f) { fly = null; goal.dist = clamp(goal.dist * f, 220, 2600); }
  function locate() { flyTo(ME_POS.x, ME_POS.y, { dist: 620 }); }
  function toggleTilt() { const n = goal.pitch > 0.75 ? 0.42 : 1.08; goal.pitch = n; return n; }
  function focus(x, y, z = 1.5) { flyTo(x, y, { dist: Math.max(380, 900 / z) }); }
  function setMePos(x, y) { ME_POS.x = x; ME_POS.y = y; }
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
    state, friendsRef, setLayer, setGhost, focus, setMePos,
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
      state, friendsRef, setLayer: noop, setGhost: noop, focus: noop, setMePos: noop,
      zoomIn: noop, zoomOut: noop, locate: noop, toggleTilt: () => 1, rotateBy: noop,
      flyTo: noop, cycleTimeOfDay: () => state.timeOfDay,
      setMokshaFilter: noop, setHighlight: noop, focusMoksha: noop,
      clearMokshaFocus: noop, setRoute: noop,
      mePos: ME_POS, metersPerUnit: 0.9,
    };
  }
}
