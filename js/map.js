/* Link Up — software 3D campus engine (canvas, zero deps, offline-first).
 *
 * A miniature digital NSUT: perspective orbit camera, real building footprints
 * (wings/extensions/entrances/roofs), procedural materials + windows, roads with
 * curbs & sidewalks, instanced stylized trees, sports markings, landmarks with a
 * detail hierarchy, amphitheatre bowl, people/vehicles for scale, distance-based
 * labels, zoom LOD, day/evening/night lighting, and a temporary Moksha event
 * overlay drawn ON TOP of real campus geometry (never a fake building).
 *
 * Geography first: positions come from shared campus data; visuals approximate
 * silhouettes, never claimed as survey-grade.
 */
import { BUILDINGS, FRIENDS } from './data.js';
import { EventStore, eventStatus, festivalState } from './events.js';

const METERS_PER_UNIT = 0.9;
const TAU = Math.PI * 2;

/* ---------- deterministic rng ---------- */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- palettes: day / evening / night ---------- */
const PALETTES = {
  day: {
    skyTop: '#8fc0ef', skyBot: '#e8f3fd', ground: '#79b86a', groundOut: '#5da055',
    plaza: '#cfd4dc', plazaEdge: '#aeb4bf', road: '#4b5261', curb: '#c9ced7',
    line: '#f4f6f9', path: '#d8cfae', ambient: 0.62, sun: { x: -0.55, y: -0.35, z: 0.75 },
    sunTint: '#fff4d6', shadowA: 0.22, winLit: 0.04, beams: false, stars: false,
    trunk: '#6b4a2f', leafA: '#2f7d3b', leafB: '#46a04e', field: '#4c9e52', fieldAlt: '#459548',
  },
  evening: {
    skyTop: '#2b2456', skyBot: '#e08a4e', ground: '#4d8a4e', groundOut: '#356636',
    plaza: '#9aa0ac', plazaEdge: '#787e8a', road: '#333845', curb: '#8d93a0',
    line: '#e8d9a0', path: '#a89a72', ambient: 0.42, sun: { x: -0.9, y: 0.25, z: 0.28 },
    sunTint: '#ffb37a', shadowA: 0.34, winLit: 0.35, beams: true, stars: false,
    trunk: '#4e3421', leafA: '#1f5c2c', leafB: '#2e7d3c', field: '#35803f', fieldAlt: '#2f7539',
  },
  night: {
    skyTop: '#04060f', skyBot: '#0d1730', ground: '#22402a', groundOut: '#16281b',
    plaza: '#565b66', plazaEdge: '#41454e', road: '#20242e', curb: '#4a4f5b',
    line: '#9aa2b5', path: '#5c553f', ambient: 0.3, sun: { x: 0.5, y: -0.6, z: 0.5 },
    sunTint: '#b9ccff', shadowA: 0.4, winLit: 0.55, beams: true, stars: true,
    trunk: '#2c1e12', leafA: '#12331c', leafB: '#1a4526', field: '#1d4a26', fieldAlt: '#1a4222',
  },
};

/* ---------- campus structure specs (footprints, wings, heights) ---------- */
const STRUCTS = {
  admin: { blocks: [{ ox: 0, oy: 0, w: 120, d: 46, h: 15 }, { ox: -62, oy: 6, w: 30, d: 40, h: 11 }, { ox: 62, oy: 6, w: 30, d: 40, h: 11 }], wall: '#b9a98c', roof: '#7d7466', trim: '#31437c', entrance: 'S', sign: 'ADMIN', floors: 3 },
  library: { blocks: [{ ox: 0, oy: 0, w: 112, d: 50, h: 13, glass: 'S' }, { ox: -70, oy: -4, w: 40, d: 36, h: 9 }], wall: '#c8bfae', roof: '#6f7d8c', trim: '#0e7490', entrance: 'S', sign: 'LIBRARY', floors: 3 },
  apj: { blocks: [{ ox: -10, oy: 0, w: 120, d: 42, h: 14 }, { ox: 55, oy: 34, w: 34, d: 62, h: 14 }], wall: '#b7bdc9', roof: '#5d6673', trim: '#7c3aed', entrance: 'W', sign: 'APJ', floors: 3 },
  sac: { blocks: [{ ox: 0, oy: 0, w: 72, d: 44, h: 11 }, { ox: -48, oy: 2, w: 26, d: 36, h: 8 }, { ox: 48, oy: 2, w: 26, d: 36, h: 8 }], wall: '#cfc4d8', roof: '#4c3a6e', trim: '#7c3aed', entrance: 'S', sign: 'SAC', floors: 2, landmark: true },
  nescafe: { blocks: [{ ox: 0, oy: 0, w: 42, d: 26, h: 5 }], wall: '#d8b48c', roof: '#8a5a24', trim: '#a33d1f', entrance: 'S', sign: 'NESCAFE', floors: 1, umbrellas: 3 },
  canteen: { blocks: [{ ox: -8, oy: 0, w: 100, d: 44, h: 7 }, { ox: 58, oy: -6, w: 34, d: 26, h: 5 }], wall: '#d9c39a', roof: '#8a6a34', trim: '#7c4a12', entrance: 'S', sign: 'CANTEEN', floors: 1, umbrellas: 4 },
  sports: { blocks: [{ ox: -10, oy: 0, w: 92, d: 50, h: 10 }, { ox: 55, oy: 8, w: 30, d: 34, h: 7 }], wall: '#bcc8b4', roof: '#3f5a44', trim: '#166534', entrance: 'N', sign: 'SPORTS', floors: 2 },
  hostel: { blocks: [{ ox: 0, oy: 0, w: 100, d: 36, h: 17 }, { ox: -40, oy: 24, w: 24, d: 30, h: 13 }, { ox: 40, oy: 24, w: 24, d: 30, h: 13 }], wall: '#c2b8a4', roof: '#6e6252', trim: '#334155', entrance: 'S', sign: 'BH-2', floors: 5 },
  innovation: { blocks: [{ ox: 0, oy: 8, w: 60, d: 40, h: 16, glass: 'SE' }, { ox: 0, oy: -14, w: 84, d: 30, h: 5 }], wall: '#b9c6d4', roof: '#3d4c5e', trim: '#06b6d4', entrance: 'S', sign: 'INNOVATION', floors: 4 },
  groundPavilion: { blocks: [{ ox: 0, oy: 0, w: 34, d: 14, h: 5 }], wall: '#c9c2b2', roof: '#5d6b52', trim: '#166534', entrance: 'S', sign: '', floors: 1 },
};
const FOOD_IDS = new Set(['nescafe', 'canteen']);

/* ---------- roads / paths / plaza / parking ---------- */
const ROADS = [
  { pts: [[140, 180], [880, 180]], w: 10, kind: 'road' },
  { pts: [[120, 520], [880, 520]], w: 10, kind: 'road' },
  { pts: [[140, 180], [140, 520]], w: 10, kind: 'road' },
  { pts: [[880, 180], [880, 520]], w: 10, kind: 'road' },
  { pts: [[500, 80], [500, 620]], w: 12, kind: 'road' },
  { pts: [[160, 300], [860, 300]], w: 9, kind: 'road' },
  { pts: [[400, 180], [400, 232]], w: 4, kind: 'path' },
  { pts: [[500, 80], [500, 112]], w: 5, kind: 'path' },
  { pts: [[500, 300], [500, 400]], w: 5, kind: 'path' },
  { pts: [[620, 300], [710, 300], [710, 408]], w: 5, kind: 'path' },
  { pts: [[300, 300], [262, 448]], w: 4, kind: 'path' },
  { pts: [[280, 520], [280, 572]], w: 4, kind: 'path' },
  { pts: [[830, 180], [830, 214]], w: 5, kind: 'path' },
  { pts: [[420, 300], [372, 322]], w: 4, kind: 'path' },
  { pts: [[140, 520], [140, 620]], w: 8, kind: 'road' },
];
const PLAZAS = [
  { x: 545, y: 318, w: 170, d: 96 },   // SAC forecourt
  { x: 400, y: 252, w: 130, d: 44 },   // library steps apron
];
const PARKING = { x: 620, y: 115, w: 90, d: 34 };
const FIELD = { x: 190, y: 445, w: 168, d: 92 };
const COURT = { x: 368, y: 562, w: 46, d: 30 };

export function createMap(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const onSelect = opts.onSelect || (() => {});
  const friendsRef = { list: FRIENDS };

  const cam = { tx: 510, ty: 350, dist: 1200, yaw: -0.62, pitch: 0.96 };
  const goal = { ...cam };
  let fly = null; // {from, to, t, dur}
  const state = {
    layer: 'friends', ghost: false, mokshaFilter: false,
    selected: null, hover: null, t: 0, w: 0, h: 0, dpr: 1,
    timeOfDay: 'evening', highlightId: null, route: null, mokshaEventId: null,
    cam,
  };

  /* ----- world registries built once ----- */
  const blocks = []; // {bx,by,w,d,h,wall,roof,trim,glass,bid,label,entrance,sign,floors,landmark,umbrellas}
  for (const b of BUILDINGS) {
    const spec = STRUCTS[b.id];
    if (b.id === 'amphi') continue; // custom bowl geometry
    if (b.id === 'ground') {
      blocks.push({ bx: 150, by: 492, w: 34, d: 14, h: 5, wall: '#c9c2b2', roof: '#5d6b52', trim: '#166534', bid: 'ground', label: 'Pavilion', entrance: 'S', sign: '', floors: 1 });
      continue;
    }
    if (!spec) {
      blocks.push({ bx: b.x, by: b.y, w: b.w, d: b.h, h: 9, wall: '#b9bdc9', roof: '#5d6673', trim: '#475069', bid: b.id, label: b.label, entrance: 'S', sign: '', floors: 2 });
      continue;
    }
    spec.blocks.forEach((bl, i) => blocks.push({
      bx: b.x + bl.ox, by: b.y + bl.oy, w: bl.w, d: bl.d, h: bl.h,
      wall: spec.wall, roof: spec.roof, trim: spec.trim,
      glass: bl.glass || null, bid: b.id, label: b.label,
      entrance: i === 0 ? spec.entrance : null, sign: i === 0 ? spec.sign : '',
      floors: spec.floors, landmark: !!spec.landmark, umbrellas: i === 0 ? spec.umbrellas : 0,
    }));
  }
  const blockRects = blocks.map((b) => ({ x0: b.bx - b.w / 2, x1: b.bx + b.w / 2, y0: b.by - b.d / 2, y1: b.by + b.d / 2 }));

  // trees (instanced, seeded, avoid structures/roads/fields)
  const rng = mulberry(20260327);
  const trees = [];
  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  let guard = 0;
  while (trees.length < 150 && guard++ < 3000) {
    const x = 60 + rng() * 880, y = 60 + rng() * 580;
    if (blockRects.some((r) => x > r.x0 - 14 && x < r.x1 + 14 && y > r.y0 - 14 && y < r.y1 + 14)) continue;
    if (Math.abs(x - 710) < 60 && Math.abs(y - 445) < 55) continue; // amphi bowl
    if (Math.abs(x - FIELD.x) < FIELD.w / 2 + 12 && Math.abs(y - FIELD.y) < FIELD.d / 2 + 12) continue;
    if (PLAZAS.some((p) => Math.abs(x - p.x) < p.w / 2 + 6 && Math.abs(y - p.y) < p.d / 2 + 6)) continue;
    if (Math.abs(x - PARKING.x) < PARKING.w / 2 + 6 && Math.abs(y - PARKING.y) < PARKING.d / 2 + 6) continue;
    if (ROADS.some((r) => { for (let i = 0; i < r.pts.length - 1; i++) if (segDist(x, y, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) < r.w / 2 + 7) return true; return false; })) continue;
    trees.push({ x, y, h: 7 + rng() * 6, r: 4.5 + rng() * 3, tone: rng(), lean: (rng() - 0.5) * 3, ph: rng() * TAU });
  }
  // npcs near hubs (decorative; friends are distinct pins)
  const npcSpots = [[545, 340], [500, 455], [710, 472], [400, 244], [250, 470], [620, 378], [340, 350]];
  const npcs = [];
  const rng2 = mulberry(77);
  for (const [sx, sy] of npcSpots) for (let i = 0; i < 3; i++)
    npcs.push({ x: sx + (rng2() - 0.5) * 44, y: sy + (rng2() - 0.5) * 26, c: ['#8a93ad', '#7d8aa0', '#96887a', '#6f7f96'][Math.floor(rng2() * 4)], skin: ['#e8b98d', '#c98d5f', '#8a5a34'][Math.floor(rng2() * 3)], ph: rng2() * TAU });
  const cars = [
    { x: 596, y: 115, a: 0.05, c: '#7d8aa0' }, { x: 612, y: 115, a: -0.04, c: '#a33d1f' },
    { x: 628, y: 115, a: 0.03, c: '#31437c' }, { x: 644, y: 115, a: 0, c: '#c9ced7' },
    { x: 816, y: 236, a: 1.57, c: '#5d6673' }, { x: 816, y: 252, a: 1.6, c: '#7c4a12' },
  ];
  const stars = Array.from({ length: 90 }, (_, i) => { const r = mulberry(i * 991 + 5); return { x: r(), y: r() * 0.7, tw: r() * TAU }; });

  const ME_POS = { x: 560, y: 332 };

  /* ---------- sizing / camera ---------- */
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    state.dpr = Math.min(1.75, window.devicePixelRatio || 1);
    state.w = Math.max(50, r.width); state.h = Math.max(50, r.height);
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    if (!resize._fit) { fitView(); resize._fit = true; }
  }
  window.addEventListener('resize', resize);

  function basis() {
    const { yaw, pitch, tx, ty, dist } = cam;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cxp = tx + dist * cp * Math.sin(yaw), cyp = ty + dist * cp * Math.cos(yaw), czp = dist * sp;
    const f = norm([tx - cxp, ty - cyp, -czp]);
    let r = norm(cross(f, [0, 0, 1]));
    if (!r) r = [1, 0, 0];
    const u = cross(r, f);
    return { cpos: [cxp, cyp, czp], f, r, u, focal: (state.h / 2) / Math.tan(0.46) };
  }
  function project(x, y, z) {
    const B = basis._c || (basis._c = basis());
    const vx = x - B.cpos[0], vy = y - B.cpos[1], vz = z - B.cpos[2];
    const depth = vx * B.f[0] + vy * B.f[1] + vz * B.f[2];
    if (depth < 2) return null;
    const px = vx * B.r[0] + vy * B.r[1] + vz * B.r[2];
    const py = vx * B.u[0] + vy * B.u[1] + vz * B.u[2];
    return { x: state.w / 2 + (px * B.focal) / depth, y: state.h / 2 - (py * B.focal) / depth, depth, s: B.focal / depth };
  }
  function groundPoint(sx, sy) {
    const B = basis._c || (basis._c = basis());
    const a = (sx - state.w / 2) / B.focal, b = (state.h / 2 - sy) / B.focal;
    const d = [B.f[0] + B.r[0] * a + B.u[0] * b, B.f[1] + B.r[1] * a + B.u[1] * b, B.f[2] + B.r[2] * a + B.u[2] * b];
    if (d[2] >= -1e-6) return null;
    const t = -B.cpos[2] / d[2];
    const x = B.cpos[0] + d[0] * t, y = B.cpos[1] + d[1] * t;
    if (x < -200 || x > 1200 || y < -200 || y > 900) return null;
    return { x, y };
  }
  function fitView() {
    // binary-search a distance that frames the campus
    let lo = 300, hi = 3200;
    const corners = [[80, 80], [920, 80], [80, 620], [920, 620]];
    for (let i = 0; i < 18; i++) {
      cam.dist = (lo + hi) / 2;
      basis._c = null; basis._c = basis();
      const ok = corners.every(([x, y]) => { const p = project(x, y, 0); return p && p.x > state.w * 0.03 && p.x < state.w * 0.97 && p.y > state.h * 0.05 && p.y < state.h * 0.95; });
      if (ok) hi = cam.dist; else lo = cam.dist;
    }
    cam.dist = Math.min(hi * 1.04, 2600);
    goal.dist = cam.dist;
  }

  /* ---------- interaction ---------- */
  let drag = null, moved = 0, pinchD = 0, downT = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    fly = null;
    downT = performance.now();
    const g = groundPoint(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
    drag = { x: e.clientX, y: e.clientY, tx: goal.tx, ty: goal.ty, yaw: goal.yaw, pitch: goal.pitch, orbit: e.button === 2 || e.shiftKey, grab: g };
    moved = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (drag.orbit) {
      goal.yaw = drag.yaw - (e.clientX - drag.x) * 0.0052;
      goal.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.004, 0.28, 1.35);
    } else if (drag.grab) {
      const r = canvas.getBoundingClientRect();
      const now = groundPoint(e.clientX - r.left, e.clientY - r.top);
      if (now) {
        goal.tx = clamp(drag.tx + (drag.grab.x - now.x), -100, 1100);
        goal.ty = clamp(drag.ty + (drag.grab.y - now.y), -100, 800);
      }
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const quick = performance.now() - downT < 350;
    if (drag && moved < 9 && quick) {
      const r = canvas.getBoundingClientRect();
      const hit = pick(e.clientX - r.left, e.clientY - r.top);
      state.selected = hit;
      onSelect(hit);
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => (drag = null));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); fly = null; goal.dist = clamp(goal.dist * (e.deltaY > 0 ? 1.1 : 0.9), 220, 2600); }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    const r = canvas.getBoundingClientRect();
    const g = groundPoint(e.clientX - r.left, e.clientY - r.top);
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
  function touchDist(e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }

  function flyTo(x, y, o = {}) {
    fly = {
      from: { ...goal }, to: { tx: x, ty: y, dist: o.dist ?? Math.min(goal.dist, 760), yaw: o.yaw ?? goal.yaw, pitch: o.pitch ?? Math.max(goal.pitch, 0.98) },
      t: 0, dur: o.dur ?? 1.15,
    };
  }

  /* ---------- picking (screen-space, robust in 3D) ---------- */
  const pickables = { friends: [], buildings: [], moksha: [] };
  function pick(mx, my) {
    let best = null, bestD = 1e9;
    for (const m of pickables.moksha) {
      const d = Math.hypot(mx - m.x, my - m.y);
      if (d < 40 && d < bestD) { best = { kind: 'moksha', id: m.id }; bestD = d; }
    }
    if (best) return best;
    for (const f of pickables.friends) {
      const d = Math.hypot(mx - f.x, my - f.y);
      if (d < 26 && d < bestD) { best = { kind: 'friend', id: f.id }; bestD = d; }
    }
    if (best) return best;
    for (const b of pickables.buildings) {
      if (mx > b.x0 - 6 && mx < b.x1 + 6 && my > b.y0 - 30 && my < b.y1 + 8) return { kind: 'place', id: b.id };
    }
    return null;
  }

  /* ---------- helpers ---------- */
  function pal() { return PALETTES[state.timeOfDay]; }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${c(n >> 16)},${c(((n >> 8) & 255))},${c(n & 255)})`;
  }
  function wallShade(base, nx, ny, P) {
    const s = P.sun, L = Math.hypot(s.x, s.y, s.z);
    const d = Math.max(0, (nx * s.x + ny * s.y) / L);
    return shade(base, Math.round((P.ambient - 0.55) * 90 + d * 46));
  }
  function poly(pts, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function ribbon(pts, w, z, fill) {
    // world-space ribbon along a polyline -> screen quads
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * w / 2, ny = (dx / L) * w / 2;
      const p = [project(ax + nx, ay + ny, z), project(bx + nx, by + ny, z), project(bx - nx, by - ny, z), project(ax - nx, ay - ny, z)];
      if (p.some((q) => !q)) continue;
      poly(p, fill);
    }
  }

  /* ---------- per-frame ---------- */
  let evCache = { at: 0, list: [] };
  function mokshaEvents() {
    if (Date.now() - evCache.at > 4000) { evCache = { at: Date.now(), list: EventStore.mappable('Moksha') }; }
    return evCache.list;
  }
  window.addEventListener('linkup-events-changed', () => (evCache.at = 0));

  function draw() {
    state.t += 0.016;
    basis._c = null;
    // ease camera toward goal, or follow fly animation
    if (fly) {
      fly.t += 0.016 / fly.dur;
      const k = ease(Math.min(1, fly.t));
      for (const key of ['tx', 'ty', 'dist', 'yaw', 'pitch']) cam[key] = fly.from[key] + (fly.to[key] - fly.from[key]) * k;
      if (fly.t >= 1) { Object.assign(goal, fly.to); fly = null; }
    } else {
      for (const key of ['tx', 'ty', 'dist', 'yaw', 'pitch']) cam[key] += (goal[key] - cam[key]) * 0.14;
    }
    basis._c = basis();
    const P = pal(), W = state.w, H = state.h;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, P.skyTop); sky.addColorStop(0.62, P.skyBot); sky.addColorStop(0.621, P.groundOut); sky.addColorStop(1, P.groundOut);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (P.stars) {
      ctx.fillStyle = '#ffffff';
      for (const s of stars) {
        ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(state.t * 1.4 + s.tw));
        ctx.fillRect(s.x * W, s.y * H * 0.55, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }
    const LOD = cam.dist > 1600 ? 0 : cam.dist > 850 ? 1 : 2; // 0 far, 1 mid, 2 close

    // ground slab (big, so horizon looks real)
    const g4 = [project(-500, -400, 0), project(1500, -400, 0), project(1500, 1100, 0), project(-500, 1100, 0)];
    if (g4.every(Boolean)) poly(g4, P.groundOut);
    const c4 = [project(-40, -20, 0), project(1040, -20, 0), project(1040, 720, 0), project(-40, 720, 0)];
    if (c4.every(Boolean)) poly(c4, P.ground);
    // grass variation blobs
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    const blobRng = mulberry(9);
    for (let i = 0; i < 14; i++) {
      const bx = blobRng() * 1000, by = blobRng() * 700, br = 40 + blobRng() * 70;
      const p = project(bx, by, 0.1);
      if (!p) continue;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, br * p.s, br * p.s * 0.55, 0, 0, TAU); ctx.fill();
    }
    // plazas + parking + roads
    for (const pz of PLAZAS) {
      const q = [project(pz.x - pz.w / 2, pz.y - pz.d / 2, 0.25), project(pz.x + pz.w / 2, pz.y - pz.d / 2, 0.25), project(pz.x + pz.w / 2, pz.y + pz.d / 2, 0.25), project(pz.x - pz.w / 2, pz.y + pz.d / 2, 0.25)];
      if (q.every(Boolean)) { poly(q, P.plaza, P.plazaEdge, 2); }
    }
    {
      const q = [project(PARKING.x - PARKING.w / 2, PARKING.y - PARKING.d / 2, 0.25), project(PARKING.x + PARKING.w / 2, PARKING.y - PARKING.d / 2, 0.25), project(PARKING.x + PARKING.w / 2, PARKING.y + PARKING.d / 2, 0.25), project(PARKING.x - PARKING.w / 2, PARKING.y + PARKING.d / 2, 0.25)];
      if (q.every(Boolean)) {
        poly(q, shade(P.road, 8), P.curb, 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
          const x = PARKING.x - PARKING.w / 2 + (PARKING.w / 6) * i;
          const a = project(x, PARKING.y - PARKING.d / 2 + 2, 0.4), b = project(x, PARKING.y + PARKING.d / 2 - 2, 0.4);
          if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
      }
    }
    for (const r of ROADS) {
      ribbon(r.pts, r.w + 3, 0.15, P.curb);
      ribbon(r.pts, r.w, 0.3, r.kind === 'path' ? P.path : P.road);
      if (r.kind === 'road' && LOD >= 0) {
        // centre dashes
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
          const L = Math.hypot(bx - ax, by - ay);
          for (let d = 4; d < L - 4; d += 16) {
            const t0 = d / L, t1 = Math.min(1, (d + 7) / L);
            ribbon([[ax + (bx - ax) * t0, ay + (by - ay) * t0], [ax + (bx - ax) * t1, ay + (by - ay) * t1]], 1.1, 0.45, P.line);
          }
        }
      }
    }

    drawSports(P, LOD);
    drawAmphi(P, LOD);

    /* ----- sorted 3D render list ----- */
    const items = [];
    const depthOf = (x, y, z) => {
      const B = basis._c;
      const vx = x - B.cpos[0], vy = y - B.cpos[1], vz = z - B.cpos[2];
      return vx * B.f[0] + vy * B.f[1] + vz * B.f[2];
    };
    for (const b of blocks) items.push({ d: depthOf(b.bx, b.by, b.h / 2), fn: () => drawBlock(b, P, LOD) });
    for (const t of trees) items.push({ d: depthOf(t.x, t.y, t.h / 2), fn: () => drawTree(t, P, LOD) });
    if (LOD >= 1) {
      for (const n of npcs) items.push({ d: depthOf(n.x, n.y, 1), fn: () => drawPerson(n.x, n.y, n.c, n.skin, 3.1, null, P) });
      for (const c of cars) items.push({ d: depthOf(c.x, c.y, 1), fn: () => drawCar(c, P) });
    }
    // route + highlight rings (flat, drawn in depth order of venue)
    if (state.route) items.push({ d: depthOf(state.route.to.x, state.route.to.y, 0) - 5, fn: () => drawRoute(P) });
    const moks = mokshaEvents();
    const showMoksha = moks.length > 0 && festivalState('Moksha') !== 'ended';
    if (showMoksha) {
      for (const ev of moks) items.push({ d: depthOf(ev.campus_x, ev.campus_y, 6) - 2, fn: () => drawMokshaOverlay(ev, P, LOD) });
    }
    if (!state.ghost && (state.layer === 'friends' || state.layer === 'events')) {
      for (const f of friendsRef.list) {
        if (!f.online) continue;
        items.push({ d: depthOf(f.x, f.y, 2), fn: () => drawFriendPin(f) });
      }
    }
    items.push({ d: depthOf(ME_POS.x, ME_POS.y, 1), fn: () => drawMe(P) });
    if (showMoksha) {
      const main = moks.find((e) => eventStatus(e) === 'live') || moks[0];
      items.push({ d: -1e9, fn: () => drawMokshaMarker(main, P) }); // markers always on top, never covering the map
      if (state.mokshaFilter) for (const ev of moks) if (ev.id !== main.id && eventStatus(ev) !== 'ended') items.push({ d: -1e9 + 1, fn: () => drawMokshaDot(ev) });
    }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) { if (it.d > 2) it.fn(); else if (it.d < 0) it.fn(); }

    drawLabels(P, LOD, showMoksha);
    requestAnimationFrame(draw);
  }

  /* ---------- buildings ---------- */
  function drawBlock(b, P, LOD) {
    const x0 = b.bx - b.w / 2, x1 = b.bx + b.w / 2, y0 = b.by - b.d / 2, y1 = b.by + b.d / 2, h = b.h;
    const c000 = project(x0, y0, 0), c100 = project(x1, y0, 0), c110 = project(x1, y1, 0), c010 = project(x0, y1, 0);
    const t000 = project(x0, y0, h), t100 = project(x1, y0, h), t110 = project(x1, y1, h), t010 = project(x0, y1, h);
    if (!c000 || !t110) return;
    const B = basis._c;
    // sun shadow (offset footprint, cheap + believable)
    if (LOD >= 1) {
      const sx = -P.sun.x * h * 0.45, sy = -P.sun.y * h * 0.45;
      const sh = [project(x0 + sx, y0 + sy, 0.2), project(x1 + sx, y0 + sy, 0.2), project(x1 + sx, y1 + sy, 0.2), project(x0 + sx, y1 + sy, 0.2)];
      if (sh.every(Boolean)) { ctx.fillStyle = `rgba(0,0,0,${P.shadowA})`; poly(sh); }
    }
    const vis = { S: B.f[1] > 0.12, N: B.f[1] < -0.12, E: B.f[0] > 0.12, W: B.f[0] < -0.12 };
    // walls (painter: draw visible sides)
    if (vis.S) drawWall([c000, c100, t100, t000], wallShade(b.wall, 0, 1, P), b, 'S', P, LOD);
    if (vis.N) drawWall([c110, c010, t010, t110], wallShade(b.wall, 0, -1, P), b, 'N', P, LOD);
    if (vis.E) drawWall([c100, c110, t110, t100], wallShade(b.wall, 1, 0, P), b, 'E', P, LOD);
    if (vis.W) drawWall([c010, c000, t000, t010], wallShade(b.wall, -1, 0, P), b, 'W', P, LOD);
    // roof + parapet + units
    poly([t000, t100, t110, t010], shade(b.roof, Math.round((P.ambient - 0.55) * 60)), null);
    if (LOD >= 1) {
      const inset = 0.12;
      const ix0 = b.bx - (b.w / 2) * (1 - inset), ix1 = b.bx + (b.w / 2) * (1 - inset);
      const iy0 = b.by - (b.d / 2) * (1 - inset), iy1 = b.by + (b.d / 2) * (1 - inset);
      const q = [project(ix0, iy0, h + 0.8), project(ix1, iy0, h + 0.8), project(ix1, iy1, h + 0.8), project(ix0, iy1, h + 0.8)];
      if (q.every(Boolean)) poly(q, null, shade(b.roof, 34), 1.5);
      if (LOD === 2 && b.w > 50) {
        // rooftop mechanical units
        for (const [ux, uy, uw] of [[-0.25, -0.1, 8], [0.2, 0.15, 6]]) {
          const cx = b.bx + b.w * ux, cy = b.by + b.d * uy;
          const u0 = project(cx - uw / 2, cy - uw / 2, h), u1 = project(cx + uw / 2, cy + uw / 2, h + 3);
          if (u0 && u1) { ctx.fillStyle = shade(b.roof, -20); ctx.fillRect(Math.min(u0.x, u1.x), Math.min(u0.y, u1.y), Math.abs(u1.x - u0.x), Math.abs(u1.y - u0.y)); }
        }
      }
    }
    // highlight ring for selected / venue focus
    if (state.highlightId === b.bid || (state.selected?.kind === 'place' && state.selected.id === b.bid)) {
      const m = 7, pulse = 0.55 + 0.3 * Math.sin(state.t * 4);
      const q = [project(x0 - m, y0 - m, 0.6), project(x1 + m, y0 - m, 0.6), project(x1 + m, y1 + m, 0.6), project(x0 - m, y1 + m, 0.6)];
      if (q.every(Boolean)) { ctx.setLineDash([8, 6]); poly(q, null, `rgba(34,211,238,${pulse})`, 3); ctx.setLineDash([]); }
    }
    // register pickable (top face bbox)
    const xs = [t000.x, t100.x, t110.x, t010.x], ys = [t000.y, t100.y, t110.y, t010.y];
    pickables._b = pickables._b || [];
    pickables._b.push({ id: b.bid, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  }

  function drawWall(quad, fill, b, side, P, LOD) {
    poly(quad, fill, 'rgba(0,0,0,0.25)', 1);
    const isGlass = b.glass && (b.glass === side || b.glass === 'SE' || (b.glass === 'S' && side === 'S'));
    if (isGlass) {
      // glass curtain: gradient sheen
      const g = ctx.createLinearGradient(quad[0].x, quad[0].y, quad[3].x, quad[3].y);
      const tint = state.timeOfDay === 'day' ? '#9fd4ef' : '#274b63';
      g.addColorStop(0, shade(tint, 24)); g.addColorStop(0.5, shade(tint, -6)); g.addColorStop(1, shade(tint, 18));
      poly(quad, g);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        ctx.beginPath();
        ctx.moveTo(quad[0].x + (quad[1].x - quad[0].x) * t, quad[0].y + (quad[1].y - quad[0].y) * t);
        ctx.lineTo(quad[3].x + (quad[2].x - quad[3].x) * t, quad[3].y + (quad[2].y - quad[3].y) * t);
        ctx.stroke();
      }
    }
    if (LOD >= 1 && b.floors > 0) {
      const wallLenPx = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
      if (wallLenPx > 26) drawWindows(quad, b, P, LOD, isGlass);
    }
    // entrance: door + canopy + steps + sign
    if (b.entrance === side && LOD >= 1) {
      const cx = (quad[0].x + quad[1].x) / 2;
      const baseY = Math.max(quad[0].y, quad[1].y);
      const topY = Math.min(quad[3].y, quad[2].y);
      const dh = Math.min(16, (baseY - topY) * 0.42);
      const dw = Math.max(10, Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) * 0.1);
      ctx.fillStyle = state.timeOfDay === 'night' ? '#ffd489' : '#2b3350';
      ctx.fillRect(cx - dw / 2, baseY - dh, dw, dh);
      ctx.fillStyle = b.trim;
      ctx.fillRect(cx - dw / 2 - 5, baseY - dh - 5, dw + 10, 4); // canopy slab
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(cx - dw / 2 - 8, baseY + 1, dw + 16, 2.5);
      if (b.sign && LOD === 2) {
        ctx.font = '800 10px system-ui'; ctx.textAlign = 'center';
        ctx.fillStyle = state.timeOfDay === 'day' ? '#2b3350' : '#e6ebff';
        ctx.fillText(b.sign, cx, topY + 14);
      }
    }
    // restraint trim line
    ctx.fillStyle = b.trim + '55';
    ctx.fillRect(Math.min(quad[3].x, quad[2].x), Math.min(quad[3].y, quad[2].y), Math.abs(quad[2].x - quad[3].x), 2);
  }

  function drawWindows(quad, b, P, LOD, isGlass) {
    // bilinear grid of windows clipped to the wall quad
    const floors = Math.max(1, Math.min(5, b.floors));
    const wallLenWorld = b.w > b.d ? b.w : b.d;
    let cols = Math.max(2, Math.floor(wallLenWorld / 11));
    if (LOD === 1) cols = Math.max(2, Math.floor(cols / 2));
    const lerp2 = (t, u) => {
      const ax = quad[0].x + (quad[1].x - quad[0].x) * t, ay = quad[0].y + (quad[1].y - quad[0].y) * t;
      const bx = quad[3].x + (quad[2].x - quad[3].x) * t, by = quad[3].y + (quad[2].y - quad[3].y) * t;
      return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u };
    };
    const wr = mulberry(b.bx * 13 + b.by * 7 + quad[0].x);
    for (let c = 0; c < cols; c++) {
      for (let f = 0; f < floors; f++) {
        const t0 = (c + 0.22) / cols, t1 = (c + 0.78) / cols;
        const u0 = 0.18 + (f + 0.2) / floors * 0.68, u1 = 0.18 + (f + 0.8) / floors * 0.68;
        const p00 = lerp2(t0, u0), p10 = lerp2(t1, u0), p11 = lerp2(t1, u1), p01 = lerp2(t0, u1);
        const lit = wr() < P.winLit;
        let fill;
        if (lit) fill = state.timeOfDay === 'day' ? '#cfe8ff' : '#ffd489';
        else fill = isGlass ? 'rgba(255,255,255,0.16)' : state.timeOfDay === 'day' ? '#5b6b84' : '#1d2740';
        poly([p00, p10, p11, p01], fill);
        if (lit && state.timeOfDay !== 'day') {
          ctx.fillStyle = 'rgba(255,212,137,0.25)';
          ctx.fillRect(p00.x - 1, p00.y - 1, 3, 3);
        }
      }
    }
  }

  /* ---------- sports ---------- */
  function drawSports(P, LOD) {
    // football field: striped mow + markings + goals
    const F = FIELD, stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const x0 = F.x - F.w / 2 + (F.w / stripes) * i, x1 = x0 + F.w / stripes;
      const q = [project(x0, F.y - F.d / 2, 0.22), project(x1, F.y - F.d / 2, 0.22), project(x1, F.y + F.d / 2, 0.22), project(x0, F.y + F.d / 2, 0.22)];
      if (q.every(Boolean)) poly(q, i % 2 ? P.field : P.fieldAlt);
    }
    const line = (x0, y0, x1, y1) => ribbon([[x0, y0], [x1, y1]], 0.9, 0.4, 'rgba(255,255,255,0.85)');
    line(F.x - F.w / 2 + 3, F.y - F.d / 2 + 3, F.x + F.w / 2 - 3, F.y - F.d / 2 + 3);
    line(F.x - F.w / 2 + 3, F.y + F.d / 2 - 3, F.x + F.w / 2 - 3, F.y + F.d / 2 - 3);
    line(F.x - F.w / 2 + 3, F.y - F.d / 2 + 3, F.x - F.w / 2 + 3, F.y + F.d / 2 - 3);
    line(F.x + F.w / 2 - 3, F.y - F.d / 2 + 3, F.x + F.w / 2 - 3, F.y + F.d / 2 - 3);
    line(F.x, F.y - F.d / 2 + 3, F.x, F.y + F.d / 2 - 3);
    // centre circle
    const circ = [];
    for (let i = 0; i <= 26; i++) { const a = (i / 26) * TAU; circ.push([F.x + Math.cos(a) * 13, F.y + Math.sin(a) * 13]); }
    for (let i = 0; i < circ.length - 1; i++) ribbon([circ[i], circ[i + 1]], 0.9, 0.4, 'rgba(255,255,255,0.85)');
    // goals
    for (const gx of [F.x - F.w / 2 + 1, F.x + F.w / 2 - 1]) drawGoal(gx, F.y, gx < F.x ? 1 : -1, P);
    // basketball court
    const C = COURT;
    const cq = [project(C.x - C.w / 2, C.y - C.d / 2, 0.3), project(C.x + C.w / 2, C.y - C.d / 2, 0.3), project(C.x + C.w / 2, C.y + C.d / 2, 0.3), project(C.x - C.w / 2, C.y + C.d / 2, 0.3)];
    if (cq.every(Boolean)) {
      poly(cq, state.timeOfDay === 'day' ? '#b0633a' : '#6e3d24', 'rgba(255,255,255,0.8)', 1.5);
      ribbon([[C.x - C.w / 2 + 2, C.y], [C.x + C.w / 2 - 2, C.y]], 0.7, 0.42, 'rgba(255,255,255,0.8)');
    }
    // fence posts around ground (medium+ detail)
    if (LOD >= 1) {
      ctx.strokeStyle = state.timeOfDay === 'day' ? '#5b6472' : '#394050';
      ctx.lineWidth = 1.5;
      for (let x = F.x - F.w / 2 - 6; x <= F.x + F.w / 2 + 6; x += 18) {
        for (const y of [F.y - F.d / 2 - 6, F.y + F.d / 2 + 6]) {
          const a = project(x, y, 0), b = project(x, y, 4);
          if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
      }
    }
  }
  function drawGoal(x, y, dir, P) {
    const w = 9, h = 3.4;
    const posts = [[x, y - w / 2], [x, y + w / 2]];
    ctx.strokeStyle = '#f2f4f8'; ctx.lineWidth = Math.max(1.5, project(x, y, 0)?.s * 0.5 || 2);
    for (const [px, py] of posts) {
      const a = project(px, py, 0), b = project(px, py, h);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    const a = project(x, y - w / 2, h), b = project(x, y + w / 2, h);
    if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  }

  /* ---------- amphitheatre bowl ---------- */
  function drawAmphi(P, LOD) {
    const cx = 710, cy = 452, rows = 6;
    for (let i = rows; i >= 0; i--) {
      const r = 16 + i * 5.2, z = 1.2 + (rows - i) * 1.5;
      const arc = [];
      for (let k = 0; k <= 22; k++) {
        const a = Math.PI * (0.08 + (0.84 * k) / 22); // fan opening south
        arc.push([cx + Math.cos(a) * r, cy - Math.sin(a) * r * 0.8]);
      }
      const outer = arc.map(([x, y]) => project(x, y, z));
      const inner = arc.map(([x, y]) => {
        const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1;
        return project(x - (dx / L) * 4.6, y - (dy / L) * 4.6, z);
      });
      if (outer.every(Boolean) && inner.every(Boolean)) {
        ctx.beginPath();
        ctx.moveTo(outer[0].x, outer[0].y);
        for (const p of outer) ctx.lineTo(p.x, p.y);
        for (let k = inner.length - 1; k >= 0; k--) ctx.lineTo(inner[k].x, inner[k].y);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? shade('#8a7f72', Math.round((P.ambient - 0.55) * 60)) : shade('#a89a86', Math.round((P.ambient - 0.55) * 60));
        ctx.fill();
      }
    }
    // stage box + backdrop (part of campus geometry)
    const sx0 = cx - 15, sx1 = cx + 15, sy0 = cy + 12, sy1 = cy + 26;
    const base = [project(sx0, sy0, 0), project(sx1, sy0, 0), project(sx1, sy1, 0), project(sx0, sy1, 0)];
    const top = [project(sx0, sy0, 4), project(sx1, sy0, 4), project(sx1, sy1, 4), project(sx0, sy1, 4)];
    if (base.every(Boolean) && top.every(Boolean)) {
      poly([base[2], base[3], top[3], top[2]], wallShade('#6e5a44', 0, 1, P));
      poly(top, '#7d6a52');
      const wall = [project(sx0, sy1, 4), project(sx1, sy1, 4), project(sx1, sy1, 11), project(sx0, sy1, 11)];
      if (wall.every(Boolean)) poly(wall, wallShade('#54432f', 0, 1, P));
    }
    pickables._b = pickables._b || [];
    const c = project(cx, cy, 6);
    if (c) pickables._b.push({ id: 'amphi', x0: c.x - 60 * c.s, x1: c.x + 60 * c.s, y0: c.y - 60 * c.s, y1: c.y + 30 * c.s });
  }

  /* ---------- nature / people / vehicles ---------- */
  function drawTree(t, P, LOD) {
    const base = project(t.x, t.y, 0);
    if (!base) return;
    const s = base.s;
    if (s < 0.06) return;
    // shadow
    const shx = base.x - P.sun.x * t.h * s * 0.5, shy = base.y - P.sun.y * t.h * s * 0.28;
    ctx.fillStyle = `rgba(0,0,0,${P.shadowA * 0.8})`;
    ctx.beginPath(); ctx.ellipse(shx, shy, t.r * s * 1.1, t.r * s * 0.5, 0, 0, TAU); ctx.fill();
    if (LOD === 0) {
      ctx.fillStyle = P.leafA;
      ctx.beginPath(); ctx.ellipse(base.x, base.y - t.h * s * 0.5, t.r * s, t.r * s * 0.9, 0, 0, TAU); ctx.fill();
      return;
    }
    // trunk
    ctx.strokeStyle = P.trunk; ctx.lineWidth = Math.max(1, 1.6 * s);
    const top = project(t.x + t.lean, t.y, t.h * 0.55);
    if (!top) return;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    // canopy: 2 blobs with highlight
    const sway = Math.sin(state.t * 0.9 + t.ph) * 0.6 * s;
    const leaf = t.tone > 0.5 ? P.leafA : P.leafB;
    ctx.fillStyle = leaf;
    ctx.beginPath(); ctx.ellipse(top.x + sway, top.y - t.r * s * 0.4, t.r * s, t.r * s * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(leaf.startsWith('#') ? leaf : '#2f7d3b', 22);
    ctx.beginPath(); ctx.ellipse(top.x + sway - t.r * s * 0.25, top.y - t.r * s * 0.65, t.r * s * 0.55, t.r * s * 0.45, -0.4, 0, TAU); ctx.fill();
  }
  function drawPerson(x, y, shirt, skin, hgt, label, P) {
    const base = project(x, y, 0);
    if (!base || base.s < 0.12) return;
    const s = base.s, hh = hgt * s, ww = 2.2 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(base.x, base.y, ww * 0.9, ww * 0.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(base.x - ww / 2, base.y - hh, ww, hh * 0.62, ww / 2); else ctx.rect(base.x - ww / 2, base.y - hh, ww, hh * 0.62);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(base.x, base.y - hh - ww * 0.32, ww * 0.34, 0, TAU); ctx.fill();
    if (label) {
      ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, base.x, base.y - hh - ww * 0.9);
    }
  }
  function drawCar(c, P) {
    const p = project(c.x, c.y, 0);
    if (!p || p.s < 0.15) return;
    const s = p.s, L = 8 * s, Wd = 3.8 * s;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(-c.a);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 1.5 * s, L / 2, Wd / 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(c.c.startsWith('#') ? c.c : '#7d8aa0', Math.round((P.ambient - 0.5) * 70));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-L / 2, -Wd / 2, L, Wd, Wd * 0.3); else ctx.rect(-L / 2, -Wd / 2, L, Wd);
    ctx.fill();
    ctx.fillStyle = P.timeOfDay === 'day' ? '#9fd4ef' : '#274b63';
    ctx.fillRect(-L * 0.12, -Wd * 0.32, L * 0.3, Wd * 0.64);
    ctx.restore();
  }

  /* ---------- friends / me ---------- */
  function drawFriendPin(f) {
    const p = project(f.x, f.y, 7);
    if (!p) return;
    const pulse = 15 + 5 * Math.sin(state.t * 3 + f.x);
    ctx.fillStyle = 'rgba(34,211,238,0.22)';
    ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0b1122ee';
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(f.short.slice(0, 2), p.x, p.y + 3.5);
    if (p.s > 0.35) {
      ctx.font = '700 10px system-ui';
      ctx.fillStyle = state.timeOfDay === 'day' ? '#10203a' : '#dbe4ff';
      ctx.fillText(f.name.split(' ')[0], p.x, p.y + 28);
    }
    pickables._f = pickables._f || [];
    pickables._f.push({ id: f.id, x: p.x, y: p.y });
  }
  function drawMe(P) {
    const p = project(ME_POS.x, ME_POS.y, 0);
    if (!p) return;
    ctx.fillStyle = 'rgba(59,130,246,0.25)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 24 + 4 * Math.sin(state.t * 2.4), 0, TAU); ctx.fill();
    ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.font = '800 10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = P.timeOfDay === 'day' ? '#1e3a8a' : '#bfdbfe';
    ctx.fillText('YOU', p.x, p.y + 24);
  }

  /* ---------- MOKSHA overlay (temporary, over real geometry) ---------- */
  function drawMokshaOverlay(ev, P, LOD) {
    const vx = ev.campus_x, vy = ev.campus_y;
    const st = eventStatus(ev);
    if (st === 'ended') return; // temp infrastructure disappears after the event
    const base = project(vx, vy, 0);
    if (!base) return;
    // ground glow
    const gl = 46 * base.s;
    const gg = ctx.createRadialGradient(base.x, base.y, 4, base.x, base.y, Math.max(8, gl));
    gg.addColorStop(0, 'rgba(251,191,36,0.4)'); gg.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(base.x, base.y, Math.max(8, gl), 0, TAU); ctx.fill();
    // stage platform + backdrop + truss + canopy (event furniture, not campus)
    const pw = 34, pd = 14, ph = 2.6;
    const c = [project(vx - pw / 2, vy - 6, 0), project(vx + pw / 2, vy - 6, 0), project(vx + pw / 2, vy + 8, 0), project(vx - pw / 2, vy + 8, 0)];
    const t = [project(vx - pw / 2, vy - 6, ph), project(vx + pw / 2, vy - 6, ph), project(vx + pw / 2, vy + 8, ph), project(vx - pw / 2, vy + 8, ph)];
    if (c.every(Boolean) && t.every(Boolean)) {
      poly([c[0], c[1], t[1], t[0]], '#3a2c14');
      poly(t, '#54401c', '#fbbf24', 1.5);
      const bw = [project(vx - pw / 2, vy + 8, ph), project(vx + pw / 2, vy + 8, ph), project(vx + pw / 2, vy + 8, ph + 9), project(vx - pw / 2, vy + 8, ph + 9)];
      if (bw.every(Boolean)) {
        poly(bw, '#1c1428', '#fbbf24', 1.5);
        const bc = project(vx, vy + 8, ph + 5.5);
        if (bc && bc.s > 0.25) {
          ctx.font = `800 ${Math.max(9, Math.min(20, 13 * bc.s))}px system-ui`; ctx.textAlign = 'center';
          ctx.fillStyle = '#fde68a';
          ctx.fillText('MOKSHA', bc.x, bc.y);
        }
      }
      // truss towers + canopy
      for (const tx of [vx - pw / 2 - 3, vx + pw / 2 + 3]) {
        const a = project(tx, vy + 8, ph), b = project(tx, vy + 8, ph + 13);
        if (a && b) {
          ctx.strokeStyle = '#8d93a0'; ctx.lineWidth = Math.max(1.5, 2.4 * a.s);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if (P.beams) {
            // light beams into the sky
            const tip = project(tx + (tx < vx ? -26 : 26), vy - 30, ph + 42);
            if (tip) {
              const bg = ctx.createLinearGradient(b.x, b.y, tip.x, tip.y);
              bg.addColorStop(0, 'rgba(167,139,250,0.5)'); bg.addColorStop(1, 'rgba(167,139,250,0)');
              ctx.fillStyle = bg;
              ctx.beginPath(); ctx.moveTo(b.x - 3, b.y); ctx.lineTo(b.x + 3, b.y); ctx.lineTo(tip.x, tip.y); ctx.closePath(); ctx.fill();
            }
          }
        }
      }
    }
  }
  function drawMokshaMarker(ev, P) {
    const p = project(ev.campus_x, ev.campus_y, 26);
    if (!p) return;
    const st = eventStatus(ev);
    const col = st === 'live' ? '#a3e635' : '#7dd3fc';
    // subtle pulse (never covering the map)
    const pr = 20 + 7 * Math.sin(state.t * 2.6);
    ctx.strokeStyle = st === 'live' ? `rgba(163,230,53,${0.65 - pr / 70})` : 'rgba(125,211,252,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y - 6, pr, 0, TAU); ctx.stroke();
    // pin card
    ctx.font = '20px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('🎭', p.x, p.y - 12);
    const label = 'MOKSHA', sub = st === 'live' ? '● LIVE EVENT' : 'LIVE EVENT';
    ctx.font = '800 13px system-ui';
    const wpx = ctx.measureText(label).width + 26;
    ctx.fillStyle = 'rgba(7,11,22,0.92)';
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(p.x - wpx / 2, p.y - 58, wpx, 34, 10); else ctx.rect(p.x - wpx / 2, p.y - 58, wpx, 34);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, p.x, p.y - 44);
    ctx.font = '800 8.5px system-ui';
    ctx.fillStyle = col;
    ctx.fillText(sub, p.x, p.y - 32);
    pickables._m = pickables._m || [];
    pickables._m.push({ id: ev.id, x: p.x, y: p.y - 30 });
  }
  function drawMokshaDot(ev) {
    const p = project(ev.campus_x, ev.campus_y, 12);
    if (!p) return;
    ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#0b1122'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.font = '9px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#0b1122';
    ctx.fillText('🎭', p.x, p.y + 3);
    pickables._m = pickables._m || [];
    pickables._m.push({ id: ev.id, x: p.x, y: p.y });
  }

  /* ---------- route ---------- */
  function drawRoute(P) {
    const R = state.route;
    if (!R || !R.pts.length) return;
    ribbon(R.pts, 5.5, 0.55, 'rgba(34,211,238,0.85)');
    // marching dashes
    ctx.fillStyle = '#fff';
    for (let i = 0; i < R.pts.length - 1; i++) {
      const [ax, ay] = R.pts[i], [bx, by] = R.pts[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      for (let d = (state.t * 26) % 14; d < L; d += 14) {
        const t = d / L;
        const p = project(ax + (bx - ax) * t, ay + (by - ay) * t, 0.8);
        if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, 2.4 * p.s), 0, TAU); ctx.fill(); }
      }
    }
    const a = project(ME_POS.x, ME_POS.y, 4), b = project(R.to.x, R.to.y, 4);
    if (a) { ctx.font = '14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('📍', a.x, a.y - 8); }
    if (b) { ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🎭', b.x, b.y - 10); }
  }

  /* ---------- labels (distance-based) ---------- */
  function drawLabels(P, LOD, showMoksha) {
    pickables.buildings = pickables._b || [];
    pickables.friends = pickables._f || [];
    pickables.moksha = pickables._m || [];
    pickables._b = []; pickables._f = []; pickables._m = [];
    const seen = new Set();
    for (const b of blocks) {
      if (seen.has(b.bid)) continue;
      seen.add(b.bid);
      const top = project(b.bx, b.by, b.h + 4);
      if (!top || top.x < -80 || top.x > state.w + 80 || top.y < -40 || top.y > state.h + 40) continue;
      const dim = state.layer === 'food' ? !FOOD_IDS.has(b.bid) : state.layer === 'events' && !state.mokshaFilter ? false : false;
      void dim;
      let txt = null, sub = null;
      if (top.s > 0.85) { txt = b.label.toUpperCase(); sub = b.sign ? `· ${b.sign}` : null; }
      else if (top.s > 0.42) { txt = b.label; }
      else if (b.landmark && top.s > 0.25) { txt = b.label; }
      if (!txt) continue;
      const fs = top.s > 0.85 ? 12 : 10.5;
      ctx.font = `800 ${fs}px system-ui`; ctx.textAlign = 'center';
      const wpx = ctx.measureText(txt).width + 16;
      const dimmed = state.layer === 'food' && !FOOD_IDS.has(b.bid);
      ctx.globalAlpha = dimmed ? 0.35 : 1;
      ctx.fillStyle = state.timeOfDay === 'day' ? 'rgba(255,255,255,0.88)' : 'rgba(6,10,21,0.8)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(top.x - wpx / 2, top.y - 12, wpx, 19, 6); else ctx.rect(top.x - wpx / 2, top.y - 12, wpx, 19);
      ctx.fill();
      ctx.fillStyle = state.timeOfDay === 'day' ? '#1c2742' : '#e6ebff';
      ctx.fillText(txt + (sub || ''), top.x, top.y + 2);
      ctx.globalAlpha = 1;
    }
    // venue name callout when an event is focused
    if (state.mokshaEventId) {
      const ev = EventStore.get(state.mokshaEventId);
      if (ev && ev.campus_x != null) {
        const p = project(ev.campus_x, ev.campus_y, 20);
        if (p) {
          ctx.font = '800 12px system-ui'; ctx.textAlign = 'center';
          const label = `📍 ${ev.venue_name}`;
          const wpx = ctx.measureText(label).width + 18;
          ctx.fillStyle = 'rgba(124,58,237,0.92)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(p.x - wpx / 2, p.y + 14, wpx, 24, 12); else ctx.rect(p.x - wpx / 2, p.y + 14, wpx, 24);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(label, p.x, p.y + 31);
        }
      }
    }
  }

  /* ---------- public API (backwards compatible) ---------- */
  function setLayer(l) { state.layer = l; }
  function setGhost(v) { state.ghost = v; }
  function zoomBy(f) { fly = null; goal.dist = clamp(goal.dist * f, 220, 2600); }
  function locate() { flyTo(ME_POS.x, ME_POS.y, { dist: 620 }); }
  function toggleTilt() {
    const next = goal.pitch > 0.75 ? 0.42 : 1.08;
    goal.pitch = next; return next;
  }
  function focus(x, y, z = 1.5) { flyTo(x, y, { dist: Math.max(380, 900 / z) }); }
  function rotateBy(a) { fly = null; goal.yaw += a; }
  function cycleTimeOfDay() {
    state.timeOfDay = state.timeOfDay === 'day' ? 'evening' : state.timeOfDay === 'evening' ? 'night' : 'day';
    return state.timeOfDay;
  }

  resize();
  draw();
  return {
    state, friendsRef, setLayer, setGhost, focus,
    zoomIn: () => zoomBy(0.8), zoomOut: () => zoomBy(1.25), locate, toggleTilt, rotateBy,
    flyTo, cycleTimeOfDay,
    setMokshaFilter(v) { state.mokshaFilter = v; },
    setHighlight(id) { state.highlightId = id; state.mokshaEventId = null; },
    focusMoksha(ev) {
      if (!ev || ev.campus_x == null) return;
      state.mokshaEventId = ev.id;
      state.highlightId = ev.venue_id;
      flyTo(ev.campus_x, ev.campus_y, { dist: 520, pitch: 1.02, dur: 1.2 });
    },
    clearMokshaFocus() { state.mokshaEventId = null; state.highlightId = null; },
    setRoute(r) { state.route = r; },
    mePos: ME_POS, metersPerUnit: METERS_PER_UNIT,
  };
}

/* ---------- tiny vec helpers ---------- */
function norm(v) { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
