/* Link Up — procedural GLB landmark factory (Node, zero deps).
 * Generates optimized, geographically-placed (local grid) landmark models for the
 * NSUT 3D miniature: real footprints/wings, windows, entrances, roofs, plus LOW
 * variants for the runtime LOD system. Run: node scripts/generate-glb.mjs
 *
 * Honesty note: dimensions are stylized approximations of the real campus
 * (Dwarka Sec-3, ~145 acres), not survey data. Positions match js/data.js.
 */
import { writeFileSync, mkdirSync } from 'fs';

const TAU = Math.PI * 2;
const outDir = new URL('../models/', import.meta.url);

/* sRGB hex -> linear floats (three r160 works in linear-srgb) */
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}
const C = {
  glass: hex('#5b6b84'), glassNight: hex('#274b63'),
  amberWin: hex('#ffcf8a'), door: hex('#232c48'),
  concrete: hex('#8d93a0'), dark: hex('#2b2f3a'),
};

/* ---------- geometry bucket ---------- */
class B {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }
  get nverts() { return this.pos.length / 3; }
}
function quad(K, p1, p2, p3, p4, n, c) {
  const i = K.nverts;
  for (const p of [p1, p2, p3, p4]) { K.pos.push(...p); K.nor.push(...n); K.col.push(...c); }
  K.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
function tri(K, p1, p2, p3, n, c) {
  const i = K.nverts;
  for (const p of [p1, p2, p3]) { K.pos.push(...p); K.nor.push(...n); K.col.push(...c); }
  K.idx.push(i, i + 1, i + 2);
}
/* pitched gable roof (ridge along X) for landmark silhouettes */
function gable(K, cx, baseY, cz, w, d, cRoof, cGable) {
  const rh = Math.min(w, d) * 0.24;
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  quad(K, [x0, baseY, z1], [x1, baseY, z1], [x1, baseY + rh, cz], [x0, baseY + rh, cz], [0, 0.75, 0.66], cRoof);
  quad(K, [x1, baseY, z0], [x0, baseY, z0], [x0, baseY + rh, cz], [x1, baseY + rh, cz], [0, 0.75, -0.66], cRoof);
  tri(K, [x0, baseY, z0], [x0, baseY, z1], [x0, baseY + rh, cz], [-1, 0, 0], cGable);
  tri(K, [x1, baseY, z1], [x1, baseY, z0], [x1, baseY + rh, cz], [1, 0, 0], cGable);
  box(K, cx, baseY + rh + 0.3, cz, w + 0.6, 0.7, 1.4, cRoof);
}
function box(K, cx, cy, cz, sx, sy, sz, cSide, cTop = cSide, cBot = cSide) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  quad(K, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], cTop);
  quad(K, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], cBot);
  quad(K, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], cSide);
  quad(K, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], cSide);
  quad(K, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], cSide);
  quad(K, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], cSide);
}
function prism(K, cx, cy, cz, r, h, seg, c, rTop = r) {
  const ring = (rad, y) => Array.from({ length: seg }, (_, i) => { const a = (i / seg) * TAU; return [cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad]; });
  const b0 = ring(r, cy - h / 2), b1 = ring(rTop, cy + h / 2);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const nx = Math.cos(((i + 0.5) / seg) * TAU), nz = Math.sin(((i + 0.5) / seg) * TAU);
    quad(K, b0[i], b0[j], b1[j], b1[i], [nx, 0, nz], c);
  }
  const tc = [cx, cy + h / 2, cz];
  for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; const a = K.nverts; for (const p of [tc, b1[i], b1[j]]) { K.pos.push(...p); K.nor.push(0, 1, 0); K.col.push(...c); } K.idx.push(a, a + 1, a + 2); }
}
/* deterministic rng */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- detail helpers (HIGH only) ---------- */
function windowsOnWall(ctx, face, at, center, width, y0, floors, floorH, cols, rng) {
  const { opaque, glow } = ctx;
  const frameC = hex('#2b2f3a');
  for (let c = 0; c < cols; c++) {
    for (let f = 0; f < floors; f++) {
      const along = -width / 2 + (width * (c + 0.5)) / cols;
      const cy = y0 + floorH * (f + 0.55);
      const lit = rng() < 0.35;
      const K = lit ? glow : opaque;
      const col = lit ? C.amberWin : C.glass;
      const wW = 3.4, wH = Math.min(2.8, floorH * 0.5);
      if (face === 'S') {
        box(opaque, center + along, cy, at + 0.08, wW + 1.2, wH + 1.2, 0.3, frameC);
        box(K, center + along, cy, at + 0.2, wW, wH, 0.5, col);
        box(opaque, center + along, cy - wH / 2 - 0.45, at + 0.3, wW + 1.6, 0.5, 0.9, C.concrete);
      } else if (face === 'N') {
        box(opaque, center + along, cy, at - 0.08, wW + 1.2, wH + 1.2, 0.3, frameC);
        box(K, center + along, cy, at - 0.2, wW, wH, 0.5, col);
        box(opaque, center + along, cy - wH / 2 - 0.45, at - 0.3, wW + 1.6, 0.5, 0.9, C.concrete);
      } else if (face === 'E') {
        box(opaque, at + 0.08, cy, center + along, 0.3, wH + 1.2, wW + 1.2, frameC);
        box(K, at + 0.2, cy, center + along, 0.5, wH, wW, col);
        box(opaque, at + 0.3, cy - wH / 2 - 0.45, center + along, 0.9, 0.5, wW + 1.6, C.concrete);
      } else {
        box(opaque, at - 0.08, cy, center + along, 0.3, wH + 1.2, wW + 1.2, frameC);
        box(K, at - 0.2, cy, center + along, 0.5, wH, wW, col);
        box(opaque, at - 0.3, cy - wH / 2 - 0.45, center + along, 0.9, 0.5, wW + 1.6, C.concrete);
      }
    }
  }
}
function glassCurtain(ctx, face, at, center, width, h, trim) {
  const { opaque } = ctx;
  if (face === 'S') { box(opaque, center, h / 2 + 1, at + 0.25, width, h - 1.5, 0.5, C.glassNight); }
  else if (face === 'E') { box(opaque, at + 0.25, h / 2 + 1, center, 0.5, h - 1.5, width, C.glassNight); }
  // mullions
  const n = Math.max(2, Math.floor(width / 9));
  for (let i = 0; i <= n; i++) {
    const along = -width / 2 + (width * i) / n;
    if (face === 'S') box(opaque, center + along, h / 2 + 1, at + 0.3, 0.7, h - 1.5, 0.6, trim);
    else box(opaque, at + 0.3, h / 2 + 1, center + along, 0.6, h - 1.5, 0.7, trim);
  }
}
function entrance(ctx, face, at, center, wall, trim, wide = 10) {
  const { opaque } = ctx;
  const out = face === 'S' ? 1 : face === 'N' ? -1 : 0;
  const outX = face === 'E' ? 1 : face === 'W' ? -1 : 0;
  const dz = out * 0.3, dx = outX * 0.3;
  if (face === 'S' || face === 'N') {
    box(opaque, center - 1.7, 2.6, at + dz, 3, 5.2, 0.6, C.door);          // double doors
    box(opaque, center + 1.7, 2.6, at + dz, 3, 5.2, 0.6, C.door);
    box(opaque, center, 5.6, at + dz, 6.8, 0.8, 0.6, trim);                // transom bar
    box(opaque, center, 5.9, at + out * 2.6, wide + 4, 0.9, 5.5, trim);    // canopy
    box(opaque, center, 0.5, at + out * 4.2, wide + 6, 1.0, 3.4, C.concrete); // steps
    box(opaque, center, 7.6, at + dz, wide, 2.2, 0.5, trim);               // fascia band
    const posts = wide > 12 ? [-wide / 2 - 1.5, -wide / 6, wide / 6, wide / 2 + 1.5] : [-wide / 2 - 1.5, wide / 2 + 1.5];
    for (const px of posts) prism(opaque, center + px, 7, at + out * 2.6, 0.35, 12, 6, trim); // canopy posts
  } else {
    box(opaque, at + dx, 2.6, center, 0.6, 5.2, 6.5, C.door);
    box(opaque, at + outX * 2.6, 5.9, center, 5.5, 0.9, wide + 4, trim);
    box(opaque, at + outX * 4.2, 0.5, center, 3.4, 1.0, wide + 6, C.concrete);
  }
}
function parapetAndRoof(ctx, cx, cz, w, d, h, roof) {
  const { opaque } = ctx;
  const t = 1.1, ph = 1.6;
  box(opaque, cx, h + ph / 2, cz - d / 2, w, ph, t, roof);
  box(opaque, cx, h + ph / 2, cz + d / 2, w, ph, t, roof);
  box(opaque, cx - w / 2, h + ph / 2, cz, t, ph, d, roof);
  box(opaque, cx + w / 2, h + ph / 2, cz, t, ph, d, roof);
  box(opaque, cx, h + ph + 0.2, cz - d / 2, w, 0.45, t + 0.5, C.concrete); // coping
  box(opaque, cx, h + ph + 0.2, cz + d / 2, w, 0.45, t + 0.5, C.concrete);
  box(opaque, cx - w / 2, h + ph + 0.2, cz, t + 0.5, 0.45, d, C.concrete);
  box(opaque, cx + w / 2, h + ph + 0.2, cz, t + 0.5, 0.45, d, C.concrete);
}
function roofUnits(ctx, cx, cz, w, d, h, n, rng, roof) {
  const { opaque } = ctx;
  for (let i = 0; i < n; i++) {
    const ux = cx + (rng() - 0.5) * w * 0.5, uz = cz + (rng() - 0.5) * d * 0.5;
    box(opaque, ux, h + 1.6, uz, 6 + rng() * 4, 3.2, 5 + rng() * 3, roof);
  }
  prism(opaque, cx + w * 0.28, h + 2.2, cz - d * 0.2, 1.8, 4.4, 10, roof); // water tank
}
function umbrella(ctx, cx, cz) {
  const { opaque } = ctx;
  const fab = hex('#c9563c');
  prism(opaque, cx, 2.5, cz, 0.3, 5, 6, C.dark);
  prism(opaque, cx, 6.4, cz, 4.2, 2.2, 8, fab, 0.15);
  box(opaque, cx, 1.1, cz, 3.4, 2.2, 3.4, hex('#7a4a2e')); // table base
}
function slabBand(ctx, cx, cy, cz, w, d, color) {
  box(ctx.opaque, cx, cy, cz, w + 1.4, 0.8, d + 1.4, color); // protruding floor slab
}
function pilasters(ctx, face, at, center, len, y0, y1, color) {
  const n = Math.max(2, Math.floor(len / 24));
  for (let i = 0; i <= n; i++) {
    const along = -len / 2 + (len * i) / n;
    if (face === 'S') box(ctx.opaque, center + along, (y0 + y1) / 2, at + 0.25, 1.4, y1 - y0, 0.7, color);
    else if (face === 'N') box(ctx.opaque, center + along, (y0 + y1) / 2, at - 0.25, 1.4, y1 - y0, 0.7, color);
    else if (face === 'E') box(ctx.opaque, at + 0.25, (y0 + y1) / 2, center + along, 0.7, y1 - y0, 1.4, color);
    else box(ctx.opaque, at - 0.25, (y0 + y1) / 2, center + along, 0.7, y1 - y0, 1.4, color);
  }
}
function stairCore(ctx, cx, cz, w, d, h, wall, roof) {
  const { opaque } = ctx;
  box(opaque, cx, h / 2, cz, w, h, d, wall, roof);
  box(opaque, cx, h + 1.1, cz, w * 0.7, 2.2, d * 0.7, roof); // overrun cap
  box(opaque, cx, h / 2, cz + d / 2 + 0.15, 1.6, h - 3, 0.4, C.glass); // slit windows
}
function porticoRow(ctx, cx, cz, width, colH, color) {
  const { opaque } = ctx;
  const n = Math.max(2, Math.floor(width / 9));
  for (let i = 0; i <= n; i++) {
    const px = cx - width / 2 + (width * i) / n;
    prism(opaque, px, colH / 2, cz, 0.7, colH, 8, color);
  }
  box(opaque, cx, colH + 0.6, cz, width + 4, 1.2, 4.5, color); // entablature
}
function balconyRow(ctx, face, at, center, width, y, trim) {
  const { opaque } = ctx;
  const out = face === 'S' ? 1 : -1;
  const n = Math.max(2, Math.floor(width / 12));
  for (let i = 0; i < n; i++) {
    const bx = center - width / 2 + (width * (i + 0.5)) / n;
    box(opaque, bx, y, at + out * 1.8, 7, 0.7, 3.6, C.concrete); // slab
    for (let k = -1; k <= 1; k++) box(opaque, bx + k * 3, y + 1.1, at + out * 3.4, 0.3, 2.2, 0.3, trim); // posts
    box(opaque, bx, y + 2.2, at + out * 3.4, 7, 0.35, 0.35, trim); // rail
    box(opaque, bx, y + 2.6, at + out * 0.2, 4.5, 5.2, 0.5, C.door); // balcony door
  }
}
function menuBoard(ctx, cx, cy, cz, w) {
  box(ctx.opaque, cx, cy, cz, w, 2.2, 0.4, C.dark);
  box(ctx.opaque, cx, cy, cz + 0.05, w * 0.85, 0.5, 0.45, hex('#e8e2d2')); // menu strip
}

/* ---------- building composer ---------- */
function composeBuilding(spec, detail, seed) {
  const opaque = new B(), glow = new B();
  const ctx = { opaque, glow };
  const rng = mulberry(seed);
  const wall = hex(spec.wall), roof = hex(spec.roof), trim = hex(spec.trim);
  for (const bl of spec.blocks) {
    const bx = bl.ox, bz = bl.oz, w = bl.w, d = bl.d, h = bl.h;
    if (detail) box(opaque, bx, 0.6, bz, w + 1.6, 1.2, d + 1.6, C.dark); // plinth
    box(opaque, bx, h / 2 + (detail ? 1 : 0), bz, w, h, d, wall, roof);
    const yBase = detail ? 1 : 0;
    if (detail) {
      if (bl.gable) gable(opaque, bx, h + yBase, bz, w, d, hex('#8a4f38'), wall);
      else {
        parapetAndRoof(ctx, bx, bz, w, d, h + yBase, roof);
        if (w > 55) roofUnits(ctx, bx, bz, w, d, h + yBase, 2, rng, roof);
      }
      const floors = spec.floors, floorH = h / floors;
      const faces = [
        { f: 'S', at: bz + d / 2, c: bx, len: w }, { f: 'N', at: bz - d / 2, c: bx, len: w },
        { f: 'E', at: bx + w / 2, c: bz, len: d }, { f: 'W', at: bx - w / 2, c: bz, len: d },
      ];
      for (const wl of faces) {
        const isGlass = bl.glass && (bl.glass === wl.f || bl.glass === 'SE' || bl.glass === 'S' && wl.f === 'S');
        if (isGlass) glassCurtain(ctx, wl.f, wl.at, wl.c, wl.len, h, trim);
        else {
          const cols = Math.max(2, Math.floor(wl.len / 11));
          windowsOnWall(ctx, wl.f, wl.at, wl.c, wl.len, yBase + 1, floors, floorH, cols, rng);
        }
      }
      if (spec.bands && floors > 1) {
        for (let f = 1; f < floors; f++) slabBand(ctx, bx, yBase + 1 + floorH * f, bz, w, d, C.concrete);
      }
      if (spec.pilasters) {
        pilasters(ctx, 'S', bz + d / 2, bx, w, yBase + 1, yBase + 1 + h, trim);
        pilasters(ctx, 'N', bz - d / 2, bx, w, yBase + 1, yBase + 1 + h, trim);
      }
      if (spec.balconies) {
        for (let f = 0; f < floors; f++) {
          balconyRow(ctx, spec.balconies, spec.balconies === 'S' ? bz + d / 2 : bz - d / 2, bx, w * 0.8, yBase + 1 + floorH * (f + 1) - 0.7, trim);
        }
      }
    }
  }
  if (detail && spec.cores) for (const [cox, coz, cw, cd, ch] of spec.cores) stairCore(ctx, spec.blocks[0].ox + cox, spec.blocks[0].oz + coz, cw, cd, ch, wall, roof);
  if (detail && spec.portico && spec.entrance === 'S') porticoRow(ctx, spec.blocks[0].ox, spec.blocks[0].oz + spec.blocks[0].d / 2 + 2.6, spec.doorWide || 16, 7, trim);
  if (detail && spec.entrance) entrance(ctx, spec.entrance, spec.blocks[0].oz + (spec.entrance === 'S' ? spec.blocks[0].d / 2 : spec.entrance === 'N' ? -spec.blocks[0].d / 2 : 0), spec.blocks[0].ox, wall, trim, spec.doorWide || 10);
  if (detail && spec.entrance === 'W') entrance(ctx, 'W', spec.blocks[0].ox - spec.blocks[0].w / 2, spec.blocks[0].oz, wall, trim);
  if (detail && spec.entrance === 'N') entrance(ctx, 'N', spec.blocks[0].oz - spec.blocks[0].d / 2, spec.blocks[0].ox, wall, trim);
  if (detail && spec.flag) { prism(opaque, spec.blocks[0].ox + 20, 8 + spec.blocks[0].h, spec.blocks[0].oz - spec.blocks[0].d / 2 - 6, 0.35, 16, 6, C.dark); box(opaque, spec.blocks[0].ox + 22.4, 13 + spec.blocks[0].h, spec.blocks[0].oz - spec.blocks[0].d / 2 - 6, 4.6, 2.8, 0.4, trim); }
  if (detail && spec.mural) {
    // grand mural plate + green bands on the west facade (Admin Block photos)
    const mb = spec.blocks[0], mx = mb.ox - mb.w / 2;
    box(opaque, mx - 0.3, mb.h * 0.52, mb.oz, 0.9, mb.h * 0.55, 30, hex('#d8cfc0'));
    box(opaque, mx - 0.45, mb.h * 0.3, mb.oz, 1.0, 1.4, 38, hex('#2e6b34'));
    box(opaque, mx - 0.45, mb.h * 0.76, mb.oz, 1.0, 1.4, 38, hex('#2e6b34'));
    for (const pz of [-14, -5, 5, 14]) prism(opaque, mx - 7, 3.4, mb.oz + pz, 0.9, 6.8, 8, hex('#d8c9a8')); // portico columns
  }
  if (detail && (spec.umbrellas || 0)) for (let i = 0; i < spec.umbrellas; i++) umbrella(ctx, spec.blocks[0].ox - 30 + i * 20, spec.blocks[0].oz + spec.blocks[0].d / 2 + 16);
  if (detail && spec.hatch) {
    const hb = spec.blocks[0];
    for (let i = 0; i < 4; i++) {
      const hx = hb.ox - 30 + i * 20;
      box(opaque, hx, 2.8, hb.oz + hb.d / 2 + 0.15, 9, 4.4, 0.5, C.door);   // serving hatches
      box(opaque, hx, 5.4, hb.oz + hb.d / 2 + 0.3, 10, 0.8, 0.8, trim);     // hatch hoods
    }
  }
  if (detail && spec.skylights) {
    const gb = spec.blocks[0];
    for (const off of [-12, 0, 12]) box(opaque, gb.ox + off, gb.h + 1.4, gb.oz, 6, 0.8, gb.d * 0.6, C.glass);
    const cx0 = gb.ox - gb.w / 2 - 3, cx1 = gb.ox + gb.w / 2 + 3, cz0 = gb.oz - gb.d / 2 - 3, cz1 = gb.oz + gb.d / 2 + 3;
    box(opaque, cx0, 0.6, gb.oz, 1.2, 1.2, gb.d + 6, C.concrete);           // retaining curbs
    box(opaque, cx1, 0.6, gb.oz, 1.2, 1.2, gb.d + 6, C.concrete);
    box(opaque, gb.ox, 0.6, cz0, gb.w + 6, 1.2, 1.2, C.concrete);
    box(opaque, gb.ox, 0.6, cz1, gb.w + 6, 1.2, 1.2, C.concrete);
  }
  if (detail && spec.menu) menuBoard(ctx, spec.blocks[0].ox, 3.4, spec.blocks[0].oz + spec.blocks[0].d / 2 + 0.3, 10);
  if (detail && spec.stepsWide) {
    for (let i = 0; i < 3; i++) box(opaque, spec.blocks[0].ox, 0.4 + i * 0.55, spec.blocks[0].oz + spec.blocks[0].d / 2 + 4 + i * 1.6, spec.stepsWide - i * 4, 1.1, 2.2, C.concrete);
  }
  return { opaque, glow };
}

/* ---------- landmark specs (local coords, y-up; match campus grid) ---------- */
const SPECS = {
  admin: { wall: '#9c4a34', roof: '#6e3a2a', trim: '#d8c9a8', entrance: 'W', floors: 3, mural: true, bands: true, pilasters: true, cores: [[52, 0, 12, 30, 19]], blocks: [{ ox: 0, oz: 0, w: 54, d: 112, h: 15 }, { ox: 30, oz: -30, w: 26, d: 36, h: 11 }, { ox: 30, oz: 30, w: 26, d: 36, h: 11 }] },
  library: { wall: '#c8bfae', roof: '#6f7d8c', trim: '#0e7490', entrance: 'S', floors: 3, stepsWide: 34, bands: true, pilasters: true, portico: true, cores: [[60, 0, 12, 28, 17]], blocks: [{ ox: 0, oz: 0, w: 112, d: 50, h: 13, glass: 'S', gable: true }, { ox: -70, oz: -4, w: 40, d: 36, h: 9 }] },
  apj: { wall: '#b7bdc9', roof: '#5d6673', trim: '#8a93a3', entrance: 'W', floors: 3, bands: true, pilasters: true, cores: [[-78, 0, 12, 28, 18]], blocks: [{ ox: -10, oz: 0, w: 120, d: 42, h: 14, gable: true }, { ox: 55, oz: 34, w: 34, d: 62, h: 14 }] },
  academic: { wall: '#b7bdc9', roof: '#5d6673', trim: '#31437c', entrance: 'S', floors: 3, bands: true, pilasters: true, portico: true, cores: [[58, 10, 10, 24, 16]], blocks: [{ ox: 0, oz: -4, w: 64, d: 40, h: 13, gable: true }, { ox: -40, oz: 12, w: 22, d: 44, h: 10 }, { ox: 40, oz: 12, w: 22, d: 44, h: 10 }] },
  gym: { wall: '#bcc8b4', roof: '#3f5a44', trim: '#166534', entrance: 'W', floors: 1, doorWide: 12, skylights: true, blocks: [{ ox: 0, oz: 0, w: 40, d: 34, h: 5 }] },
  girls: { wall: '#c2b8a4', roof: '#6e6252', trim: '#334155', entrance: 'S', floors: 4, bands: true, balconies: 'S', cores: [[-54, 6, 10, 22, 18]], blocks: [{ ox: 0, oz: 0, w: 96, d: 36, h: 14 }] },
  guest: { wall: '#c9c2b2', roof: '#6e6252', trim: '#6e6252', entrance: 'S', floors: 2, bands: true, blocks: [{ ox: 0, oz: 0, w: 44, d: 28, h: 7, gable: true }] },
  design: { wall: '#b9c6d4', roof: '#3d4c5e', trim: '#7d8aa0', entrance: 'S', floors: 3, bands: true, blocks: [{ ox: 0, oz: 0, w: 70, d: 40, h: 12, glass: 'S' }] },
  smart: { wall: '#cfc4d8', roof: '#4c3a6e', trim: '#8a93a3', entrance: 'S', floors: 2, bands: true, blocks: [{ ox: 0, oz: 0, w: 52, d: 36, h: 10, glass: 'S' }] },
  kiosk: { wall: '#d8b48c', roof: '#8a5a24', trim: '#a33d1f', entrance: 'S', floors: 1, menu: true, blocks: [{ ox: 0, oz: 0, w: 16, d: 12, h: 4 }] },
  canteen: { wall: '#d9c39a', roof: '#8a6a34', trim: '#7c4a12', entrance: 'S', floors: 1, umbrellas: 4, doorWide: 16, hatch: true, blocks: [{ ox: -8, oz: 0, w: 100, d: 44, h: 7, gable: true }, { ox: 58, oz: -6, w: 34, d: 26, h: 5 }] },
  hostel: { wall: '#c2b8a4', roof: '#6e6252', trim: '#334155', entrance: 'S', floors: 5, bands: true, balconies: 'S', cores: [[-58, 8, 10, 24, 21], [58, 8, 10, 24, 21]], blocks: [{ ox: 0, oz: 0, w: 100, d: 36, h: 17, gable: true }, { ox: -40, oz: 24, w: 24, d: 30, h: 13 }, { ox: 40, oz: 24, w: 24, d: 30, h: 13 }] },
};
/* campus grid placement (reference-image layout) */
const PLACE = {
  admin: [345, 355], library: [550, 395], apj: [425, 225], canteen: [460, 180],
  hostel: [200, 160], gate: [30, 133], amul: [480, 200],
  academic: [430, 400], nescii: [210, 300], gym: [630, 357], girls: [470, 540],
  guest: [400, 490], design: [130, 100], smart: [550, 238], kiosk: [380, 205], flag: [270, 365],
};

/* ---------- special models ---------- */
function buildGate(detail) {
  const opaque = new B(), glow = new B();
  const stone = hex('#b9b0a0'), trim = hex('#31437c');
  for (const px of [-11, 11]) {
    box(opaque, px, 7, 0, 6, 14, 6, stone, stone);                     // taller pillars
    box(opaque, px, 14.6, 0, 7, 1.4, 7, trim);                         // cap
    box(opaque, px, 4.5, 0, 6.6, 1.0, 6.6, trim);                      // mid band
    box(opaque, px, 1.0, 0, 7.2, 2.0, 7.2, C.dark);                    // plinth
    if (detail) {
      box(glow, px, 9.5, 2.9, 1.8, 2.4, 0.4, C.amberWin);              // lamps
      box(glow, px, 9.5, -2.9, 1.8, 2.4, 0.4, C.amberWin);
      box(opaque, px, 11.8, 2.9, 0.9, 0.5, 0.9, trim);                 // lamp hoods
      box(opaque, px, 11.8, -2.9, 0.9, 0.5, 0.9, trim);
    }
  }
  box(opaque, 0, 15.4, 0, 30, 2.4, 4.6, trim);                         // main beam
  box(opaque, 0, 12.4, 0, 27, 1.0, 3.6, stone);                        // secondary beam
  box(opaque, 0, 17.1, 0, 22, 1.2, 3.6, stone);                        // fascia
  if (detail) {
    for (const px of [-19, 19]) {
      box(opaque, px, 2.5, 0, 9, 5, 2.2, stone);                       // wing walls
      for (const rx of [-2.5, 0, 2.5]) box(opaque, px + rx, 5.6, 0, 0.5, 1.6, 0.5, trim); // rail posts
      box(opaque, px, 6.4, 0, 9, 0.35, 0.35, trim);                    // top rail
    }
  }
  return { opaque, glow };
}
function buildAmul(detail) {
  const opaque = new B(), glow = new B();
  const wall = hex('#d8cfc0'), red = hex('#b33a2b'), white = hex('#f2ede4');
  box(opaque, 0, 3.5, 0, 14, 7, 10, wall, hex('#8a8578'));
  if (detail) {
    box(opaque, 0, 7.6, 6.4, 16, 0.7, 4.6, red); // awning slab tilted? keep flat
    for (let i = 0; i < 5; i++) box(opaque, -6.4 + i * 3.2, 8.0, 6.4, 1.6, 0.15, 4.6, i % 2 ? white : red);
    box(opaque, 0, 2.2, 5.2, 10, 1.2, 0.8, hex('#6e5a44')); // counter
    box(glow, 0, 4.6, 5.05, 8, 1.6, 0.3, C.amberWin); // lit serving hatch
    box(opaque, -3, 5.8, 5.1, 5, 1.6, 0.3, C.dark); // menu board
    box(opaque, -3, 5.8, 5.15, 4.2, 0.4, 0.35, hex('#e8e2d2')); // menu strip
  }
  return { opaque, glow };
}
function buildFlag(detail) {
  const opaque = new B(), glow = new B();
  const stone = hex('#b9b0a0'), trim = hex('#31437c');
  box(opaque, 0, 0.8, 0, 26, 1.6, 26, stone);                       // plaza slab
  box(opaque, 0, 1.9, 0, 14, 2.2, 14, stone);                       // stepped base
  box(opaque, 0, 2.2, 0, 8, 2.8, 8, stone);                          // pedestal
  prism(opaque, 0, 14, 0, 0.5, 26, 8, C.dark);                       // taller pole
  box(opaque, 0, 3.1, 0, 9, 0.7, 9, trim);                           // pole collar
  box(opaque, 3.4, 24, 0, 6.4, 3.6, 0.4, trim);                      // flag
  if (detail) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    box(opaque, Math.cos(a) * 13, 1.0, Math.sin(a) * 13, 2.2, 2.0, 2.2, hex('#3a5c30')); // hedge ring
    if (i % 2 === 0) box(glow, Math.cos(a) * 13, 2.6, Math.sin(a) * 13, 1.2, 0.8, 1.2, C.amberWin); // lamps
  }
  return { opaque, glow };
}
function buildAmphi(detail) {
  const opaque = new B(), glow = new B();
  const stone = hex('#a89a86'), stoneD = hex('#8a7f72');
  const rows = detail ? 6 : 3;
  const segs = detail ? 20 : 10;
  for (let i = 0; i < rows; i++) {
    const rIn = 15 + i * 5.4, rOut = rIn + 4.6, y = 1.5 + i * 1.6;
    const a0 = Math.PI * 0.06, a1 = Math.PI * 0.94;
    for (let k = 0; k < segs; k++) {
      const t0 = a0 + ((a1 - a0) * k) / segs, t1 = a0 + ((a1 - a0) * (k + 1)) / segs;
      const P = (r, a) => [Math.cos(a) * r, 0, -Math.sin(a) * r];
      const [x0, , z0] = P(rIn, t0), [x1, , z1] = P(rOut, t0), [x2, , z2] = P(rOut, t1), [x3, , z3] = P(rIn, t1);
      quad(opaque, [x0, y, z0], [x1, y, z1], [x2, y, z2], [x3, y, z3], [0, 1, 0], i % 2 ? stoneD : stone);
      quad(opaque, [x1, y, z1], [x2, y, z2], [x2, y - 1.7, z2], [x1, y - 1.7, z1], [Math.cos((t0 + t1) / 2), 0, -Math.sin((t0 + t1) / 2)], stoneD);
    }
  }
  // stage + backdrop (permanent campus structure)
  box(opaque, 0, 1.3, 20, 30, 2.6, 14, hex('#6e5a44'), hex('#7d6a52'));
  box(opaque, 0, 7.5, 27, 30, 9, 2, hex('#54432f'));
  if (detail) {
    box(opaque, -17, 3.5, 20, 4, 7, 12, hex('#3a2c14'));
    box(opaque, 17, 3.5, 20, 4, 7, 12, hex('#3a2c14'));
    for (const sx of [-8, 8]) prism(opaque, sx, 6, 30, 0.4, 12, 6, C.dark); // backdrop posts
  }
  return { opaque, glow };
}
function buildMokshaStageLow() {
  const opaque = new B(), glow = new B();
  box(opaque, 0, 1.3, 0, 34, 2.6, 14, hex('#241a10'), hex('#54401c'));
  return { opaque, glow };
}
function buildMokshaStage() {
  // TEMPORARY event furniture — never a campus structure
  const opaque = new B(), glow = new B();
  const deck = hex('#54401c'), dark = hex('#241a10'), gold = hex('#f59e0b');
  box(opaque, 0, 1.3, 0, 34, 2.6, 14, dark, deck);
  box(opaque, 0, 7, 7.5, 34, 9, 1.6, dark);
  box(glow, 0, 7, 6.6, 30, 7, 0.5, hex('#7a4a12')); // LED wall glow
  for (const tx of [-20, 20]) {
    for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]])
      box(opaque, tx + ox, 8.8, 7.5 + oz, 0.5, 15, 0.5, C.dark);
    for (let y = 3; y < 15; y += 2.6) {
      box(opaque, tx, y, 7.5, 2.6, 0.4, 0.4, C.concrete);
      box(opaque, tx, y, 7.5, 0.4, 0.4, 2.6, C.concrete);
    }
    box(opaque, tx, 16.6, 7.5, 3.4, 0.8, 3.4, dark);
    box(glow, tx, 15.6, 7.5, 1.2, 1.2, 1.2, C.amberWin); // head lamps
  }
  for (const sx of [-14, 14]) for (let i = 0; i < 3; i++) box(opaque, sx, 4 + i * 2.4, 2, 4.4, 2.4, 3.6, dark); // speaker stacks
  box(opaque, 0, 12.6, 7.5, 36, 1.0, 2.4, gold); // top banner bar
  return { opaque, glow };
}

/* ---------- GLB writer ---------- */
function pad4(n) { return (n + 3) & ~3; }
function writeGLB(path, parts) {
  // parts: [{bucket:B, material:0|1}]
  const chunks = [];
  const bufferViews = [], accessors = [];
  let byteOffset = 0;
  const push = (arr, compSize) => {
    const bv = { buffer: 0, byteOffset, byteLength: arr.byteLength };
    bufferViews.push(bv);
    const bvi = bufferViews.length - 1;
    chunks.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    const pad = pad4(arr.byteLength) - arr.byteLength;
    if (pad) chunks.push(Buffer.alloc(pad));
    byteOffset += pad4(arr.byteLength);
    return bvi;
  };
  const primitives = [];
  for (const { bucket, material } of parts) {
    if (!bucket.nverts) continue;
    const use32 = bucket.nverts > 65535;
    const pos = new Float32Array(bucket.pos), nor = new Float32Array(bucket.nor), col = new Float32Array(bucket.col);
    const idx = use32 ? new Uint32Array(bucket.idx) : new Uint16Array(bucket.idx);
    const aPos = accessors.length;
    accessors.push({ bufferView: push(pos), componentType: 5126, count: bucket.nverts, type: 'VEC3', max: arrMax(pos, 3), min: arrMin(pos, 3) });
    accessors.push({ bufferView: push(nor), componentType: 5126, count: bucket.nverts, type: 'VEC3' });
    accessors.push({ bufferView: push(col), componentType: 5126, count: bucket.nverts, type: 'VEC3' });
    const aIdx = accessors.length;
    accessors.push({ bufferView: push(idx), componentType: use32 ? 5125 : 5123, count: bucket.idx.length, type: 'SCALAR' });
    primitives.push({ attributes: { POSITION: aPos, NORMAL: aPos + 1, COLOR_0: aPos + 2 }, indices: aIdx, material, mode: 4 });
  }
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'LinkUp GLB factory' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    materials: [
      { name: 'matte', pbrMetallicRoughness: { roughnessFactor: 0.9, metallicFactor: 0.0 } },
      { name: 'glow', emissiveFactor: [1.0, 0.55, 0.2], pbrMetallicRoughness: { roughnessFactor: 0.6 } },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews, accessors,
  };
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = pad4(jsonBuf.length) - jsonBuf.length;
  const total = 12 + 8 + pad4(jsonBuf.length) + 8 + pad4(bin.length);
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4;
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(pad4(jsonBuf.length), o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4;
  jsonBuf.copy(out, o); o += jsonBuf.length;
  out.fill(0x20, o, o + jsonPad); o += jsonPad;
  out.writeUInt32LE(pad4(bin.length), o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4;
  bin.copy(out, o); o += bin.length;
  writeFileSync(path, out);
  let tris = 0; for (const { bucket } of parts) tris += bucket.idx.length / 3;
  return { bytes: total, tris };
}
function arrMax(a, s) { const m = [-1e9, -1e9, -1e9]; for (let i = 0; i < a.length; i += s) for (let k = 0; k < s; k++) if (a[i + k] > m[k]) m[k] = a[i + k]; return m; }
function arrMin(a, s) { const m = [1e9, 1e9, 1e9]; for (let i = 0; i < a.length; i += s) for (let k = 0; k < s; k++) if (a[i + k] < m[k]) m[k] = a[i + k]; return m; }
function emptyBuckets() { return [{ bucket: new B(), material: 0 }, { bucket: new B(), material: 1 }]; }

/* ---------- build all ---------- */
mkdirSync(outDir, { recursive: true });
const manifest = {};
let seed = 1000;
const stats = [];
function emit(id, builtHigh, builtLow, place) {
  const hi = writeGLB(new URL(`${id}-high.glb`, outDir), emptyBuckets().map((p, i) => ({ bucket: i === 0 ? builtHigh.opaque : builtHigh.glow, material: i })));
  const lo = writeGLB(new URL(`${id}-low.glb`, outDir), emptyBuckets().map((p, i) => ({ bucket: i === 0 ? builtLow.opaque : builtLow.glow, material: i })));
  if (place) manifest[id] = { high: `models/${id}-high.glb`, low: `models/${id}-low.glb`, x: place[0], y: place[1] };
  stats.push(`${id}: HIGH ${Math.round(hi.bytes / 1024)}KB/${Math.round(hi.tris)}tris · LOW ${Math.round(lo.bytes / 1024)}KB/${Math.round(lo.tris)}tris`);
}
for (const [id, spec] of Object.entries(SPECS)) {
  emit(id, composeBuilding(spec, true, seed++), composeBuilding(spec, false, seed++), id === 'pavilion' ? null : PLACE[id]);
}
emit('gate', buildGate(true), buildGate(false), PLACE.gate);
emit('amul', buildAmul(true), buildAmul(false), PLACE.amul);
emit('flag', buildFlag(true), buildFlag(false), PLACE.flag);
emit('moksha-stage', buildMokshaStage(), buildMokshaStageLow(), null);
writeFileSync(new URL('manifest.json', outDir), JSON.stringify(manifest, null, 2));
console.log(stats.join('\n'));
console.log('manifest:', Object.keys(manifest).join(','));
