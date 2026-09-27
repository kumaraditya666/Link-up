/* Link Up — Phase 4: turn-by-turn campus routing (zero deps).
 * Builds a routable graph from the real road/path polylines (same data as the
 * 3D map), finds shortest paths with Dijkstra, and generates walking
 * instructions with street names. Off-graph endpoints (buildings, lawns) snap
 * to the nearest node with a straight connector flagged as off-path.
 */
export const METERS = 0.9;

export const ROADS = [
  { name: 'West Perimeter', pts: [[60, 100], [60, 660]], w: 10, kind: 'road' },
  { name: 'North Road', pts: [[60, 140], [620, 140]], w: 10, kind: 'road' },
  { name: 'Hostel Lane', pts: [[250, 140], [250, 200]], w: 4, kind: 'path' },
  { name: 'Canteen Spur', pts: [[460, 140], [460, 170]], w: 4, kind: 'path' },
  { name: 'APJ Lane', pts: [[360, 250], [660, 250]], w: 8, kind: 'road' },
  { name: 'Amul Link', pts: [[230, 140], [230, 320]], w: 5, kind: 'path' },
  { name: 'NESCII Lane', pts: [[60, 300], [330, 315]], w: 5, kind: 'path' },
  { name: 'Moksha North', pts: [[330, 265], [660, 265]], w: 8, kind: 'road' },
  { name: 'Moksha Cross', pts: [[475, 265], [475, 330]], w: 5, kind: 'path' },
  { name: 'Moksha South', pts: [[330, 315], [560, 330], [560, 265]], w: 5, kind: 'path' },
  { name: 'Main Entry', pts: [[60, 450], [270, 420], [345, 380]], w: 10, kind: 'road' },
  { name: 'Admin Spur', pts: [[345, 396], [345, 365]], w: 5, kind: 'path' },
  { name: 'Admin Cut', pts: [[345, 365], [400, 320]], w: 4, kind: 'path' },
  { name: 'Flag Cut', pts: [[290, 399], [330, 315]], w: 4, kind: 'path' },
  { name: 'Academic Row', pts: [[270, 400], [660, 380]], w: 10, kind: 'road' },
  { name: 'Stadium Way', pts: [[660, 380], [780, 440]], w: 8, kind: 'road' },
  { name: 'East Road', pts: [[660, 140], [660, 620]], w: 10, kind: 'road' },
  { name: 'South Road', pts: [[60, 600], [660, 600]], w: 10, kind: 'road' },
  { name: 'Guest Walk', pts: [[450, 600], [450, 470]], w: 4, kind: 'path' },
];

const key = (x, y) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
function segInt(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999)
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  return null;
}

let graph = null;
export function buildGraph() {
  if (graph) return graph;
  const nodes = new Map(); // key -> {x, y, edges: [{to, w, road}]}
  const addNode = (x, y) => {
    const k = key(x, y);
    if (!nodes.has(k)) nodes.set(k, { x, y, edges: [] });
    return k;
  };
  const link = (a, b, road) => {
    const A = nodes.get(a), B = nodes.get(b);
    const w = Math.hypot(A.x - B.x, A.y - B.y) * (road.kind === 'path' ? 1.15 : 1);
    A.edges.push({ to: b, w, road: road.name });
    B.edges.push({ to: a, w, road: road.name });
  };
  // split every segment at crossings + shared endpoints
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const cuts = [a, b];
      for (const r2 of ROADS) {
        for (let j = 0; j < r2.pts.length - 1; j++) {
          const hit = segInt(a, b, r2.pts[j], r2.pts[j + 1]);
          if (hit) cuts.push(hit);
          for (const p of [r2.pts[j], r2.pts[j + 1]]) {
            // shared endpoint lying on this segment
            const d = Math.hypot(p[0] - a[0], p[1] - a[1]) + Math.hypot(p[0] - b[0], p[1] - b[1]);
            if (Math.abs(d - Math.hypot(b[0] - a[0], b[1] - a[1])) < 0.5) cuts.push(p);
          }
        }
      }
      const t = (p) => Math.hypot(p[0] - a[0], p[1] - a[1]);
      cuts.sort((p, q) => t(p) - t(q));
      const uniq = cuts.filter((p, k) => k === 0 || t(p) - t(cuts[k - 1]) > 0.5);
      for (let k = 0; k < uniq.length - 1; k++) link(addNode(...uniq[k]), addNode(...uniq[k + 1]), r);
    }
  }
  graph = nodes;
  return nodes;
}

function nearest(x, y) {
  const g = buildGraph();
  let best = null, bd = 1e18;
  for (const [k, n] of g) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bd) { bd = d; best = k; }
  }
  return { key: best, node: g.get(best), dist: bd };
}

function dijkstra(startK, endK) {
  const g = buildGraph();
  const dist = new Map([[startK, 0]]), prev = new Map(), done = new Set();
  const pq = [[0, startK]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, k] = pq.shift();
    if (done.has(k)) continue;
    done.add(k);
    if (k === endK) break;
    for (const e of g.get(k).edges) {
      const nd = d + e.w;
      if (nd < (dist.get(e.to) ?? 1e18)) { dist.set(e.to, nd); prev.set(e.to, { from: k, road: e.road }); pq.push([nd, e.to]); }
    }
  }
  if (!prev.has(endK) && startK !== endK) return null;
  const keys = [endK];
  while (keys[0] !== startK) keys.unshift(prev.get(keys[0]).from);
  return keys;
}

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
function compass(dx, dy) {
  const a = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = north(-y), clockwise
  return DIRS[((Math.round(a / 45) % 8) + 8) % 8];
}
function heading(dx, dy) { return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360; }

/** route(from, to) -> {pts, steps, meters, mins, approximate} */
export function route(from, to) {
  const g = buildGraph();
  const ns = nearest(from[0], from[1]), ne = nearest(to[0], to[1]);
  const keys = dijkstra(ns.key, ne.key);
  if (!keys) return null;
  const pts = [[from[0], from[1]]];
  for (const k of keys) { const n = g.get(k); pts.push([n.x, n.y]); }
  pts.push([to[0], to[1]]);
  // collapse near-duplicates
  const clean = [pts[0]];
  for (const p of pts.slice(1)) {
    const l = clean[clean.length - 1];
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 1.5) clean.push(p);
  }
  // instructions per graph edge
  const steps = [];
  if (ns.dist > 3) steps.push({ text: `Walk to ${edgeRoad(keys, 0)}`, meters: Math.round(ns.dist * METERS), kind: 'walk' });
  for (let i = 0; i < keys.length - 1; i++) {
    const a = g.get(keys[i]), b = g.get(keys[i + 1]);
    const m = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * METERS);
    const road = edgeRoad(keys, i);
    if (i === 0) {
      steps.push({ text: `Head ${compass(b.x - a.x, b.y - a.y)} on ${road}`, meters: m, kind: 'head' });
    } else {
      const p0 = g.get(keys[i - 1]);
      const h1 = heading(a.x - p0.x, a.y - p0.y), h2 = heading(b.x - a.x, b.y - a.y);
      let diff = ((h2 - h1 + 540) % 360) - 180;
      if (Math.abs(diff) < 25 || road === edgeRoad(keys, i - 1)) steps.push({ text: `Continue on ${road}`, meters: m, kind: 'continue' });
      else steps.push({ text: `Turn ${diff > 0 ? 'right' : 'left'} onto ${road}`, meters: m, kind: 'turn' });
    }
  }
  if (ne.dist > 3) steps.push({ text: 'Walk to your destination', meters: Math.round(ne.dist * METERS), kind: 'arrive' });
  else steps.push({ text: 'You have arrived 🎉', meters: 0, kind: 'arrive' });
  let u = 0;
  for (let i = 0; i < clean.length - 1; i++) u += Math.hypot(clean[i + 1][0] - clean[i][0], clean[i + 1][1] - clean[i][1]);
  const meters = Math.round(u * METERS);
  return {
    pts: clean, steps,
    meters, mins: Math.max(1, Math.round(meters / 75)),
    approximate: ns.dist > 80 || ne.dist > 80,
  };
}
function edgeRoad(keys, i) {
  const g = buildGraph();
  const e = g.get(keys[i]).edges.find((e) => e.to === keys[i + 1]);
  return e ? e.road : 'the path';
}
export function graphStats() {
  const g = buildGraph();
  let edges = 0;
  for (const n of g.values()) edges += n.edges.length;
  return { nodes: g.size, edges: edges / 2 };
}
