/* Link Up live server — Phase 3 (zero dependencies, Node 20+).
 *
 *   node server/server.mjs [port]      default http://localhost:8001
 *
 * REST + SSE API for presence, Link Up requests, chat, festival events + admin.
 * Storage is in-memory (restart resets) — persistence + NSUT email verification
 * are the documented next steps, the wire protocol already supports them.
 *
 * Endpoints:
 *   GET  /api/health
 *   POST /api/join            {name, dept} -> {id, token}
 *   POST /api/pos             {x, y, spot?} (auth)
 *   GET  /api/live?token=     SSE: roster | linkup_request | linkup_accept |
 *                             linkup_decline | linkup_expired | session_end |
 *                             chat | events-changed
 *   GET  /api/events          published festival events
 *   POST /api/linkup          {to, spot, durMin} (auth)
 *   POST /api/linkup/respond  {from, accept, durMin?} (auth)
 *   POST /api/linkup/end      (auth)
 *   GET  /api/session?token=
 *   POST /api/chat            {to, text} (auth)
 *   GET  /api/chat?token=&with=
 *   POST /api/admin/login     {code} -> {adminToken}
 *   GET  /api/admin/events    (admin)   POST /api/admin/events (admin, upsert)
 *   DELETE /api/admin/events/:id (admin)
 */
import http from 'http';
import crypto from 'crypto';
import { appPublicKey, sendPush } from './push.js';

const PORT = +(process.argv[2] || process.env.PORT || 8001);
const ADMIN_CODE = 'moksha27';
const HEARTBEAT_MS = 5000;
const STALE_MS = 30000;

const rid = (p = '') => p + crypto.randomBytes(6).toString('hex');
const now = () => Date.now();

/* ---------- stores ---------- */
const users = new Map();      // id -> {id,name,dept,token,x,y,spot,seenAt,bot}
const byToken = new Map();    // token -> id
const streams = new Map();    // userId -> Set<res>
const requests = new Map();   // id -> {id,from,to,spot,durMin,expires}
const sessions = new Map();   // userId -> {id,with,spot,endsAt}
const chats = new Map();      // pairKey -> [{from,text,t}]
const pushSubs = new Map();   // userId -> push subscription
const groups = new Map();     // id -> {id,spot,spotX,spotY,endsAt,host,members[],invites[]}
const blocks = new Map();     // userId -> Set<blockedIds>
const reports = [];           // [{id,from,about,reason,at}]
const announcements = [];     // [{id,text,at,by}]
let adminTokens = new Set();
function isBlocked(a, b) {
  return blocks.get(a)?.has(b) || blocks.get(b)?.has(a);
}
function memberGroups(uid) {
  const out = [];
  for (const g of groups.values()) if (g.members.includes(uid)) out.push(g);
  return out;
}
function groupPublic(g) {
  return {
    id: g.id, spot: g.spot, spotX: g.spotX, spotY: g.spotY, endsAt: g.endsAt, host: g.host,
    members: g.members.map((id) => { const u = users.get(id); return u ? { id: u.id, name: u.name, x: Math.round(u.x), y: Math.round(u.y) } : null; }).filter(Boolean),
  };
}
function groupCast(g, msg, skip) {
  for (const id of g.members) if (id !== skip) sendTo(id, msg);
}

/* ---------- campus flavor ---------- */
const POIS = [['Moksha Ground', 475, 300], ['SAC & Library', 550, 400], ['Student Canteen', 460, 185], ['Amul Ground', 230, 240], ['Admin Block', 345, 360], ['Flag Circle', 270, 368], ['Sports Complex', 780, 470], ['APJ Complex', 425, 230], ['Boys Hostel', 250, 175], ['Main Gate', 60, 450]];
const WPS = [[60, 140], [250, 140], [460, 140], [60, 300], [230, 265], [475, 330], [345, 390], [550, 390], [660, 380], [780, 450], [450, 550], [270, 420], [60, 450], [60, 600], [400, 500]];
const spotFor = (x, y) => {
  let best = null, bd = 1e9;
  for (const [n, px, py] of POIS) { const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = n; } }
  return bd < 130 ? `Near ${best}` : 'Wandering NSUT';
};
/* meet-spot name -> campus coords (shared with client SPOTS list) */
const SPOT_XY = {
  'Moksha Ground': [475, 295], 'Student Canteen': [460, 180], 'SAC Lawns': [520, 390],
  'Amul Ground': [230, 235], 'Central Library': [550, 395], 'Flag Circle': [270, 365],
  SAC: [550, 395], Library: [550, 395],
};
const spotXY = (spot) => {
  const k = String(spot || '').replace(/^Near\s+/, '');
  return SPOT_XY[k] || [475, 295];
};
/* bots keep the map alive even with one client */
const BOTS = [
  ['Aarav Kapoor', "CSE '27"], ['Diya Singh', "ECE '26"], ['Yash Thakur', "ME '25"],
  ['Navya Patel', "BT '27"], ['Krish Malhotra', "ICE '26"], ['Anaya Rao', "CSA '27"],
];
for (const [name, dept] of BOTS) {
  const id = rid('bot-');
  const [x, y] = WPS[Math.floor(Math.random() * WPS.length)];
  users.set(id, { id, name, dept, token: null, x, y, spot: spotFor(x, y), seenAt: now(), bot: true, wp: ranWp() });
}
function ranWp() { return WPS[Math.floor(Math.random() * WPS.length)]; }
setInterval(() => {
  for (const u of users.values()) {
    if (!u.bot) continue;
    const [tx, ty] = u.wp;
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    if (d < 8) u.wp = ranWp();
    else { u.x += (dx / d) * 7; u.y += (dy / d) * 7; }
    u.spot = spotFor(u.x, u.y); u.seenAt = now();
  }
  broadcastRoster();
}, 3000);

/* ---------- festival events (mirrors client seed shape) ---------- */
const H = 3600e3, T0 = now();
const iso = (t) => new Date(t).toISOString();
let events = [
  { id: 'mok-main', name: 'Moksha — Main Stage', category: 'Shows', festival: 'Moksha', venue_name: 'Moksha Ground', venue_id: 'moksha-ground', campus_x: 475, campus_y: 295, latitude: 28.6088, longitude: 77.033, start_time: iso(T0 - 2 * H), end_time: iso(T0 + 6 * H), description: 'Flagship Moksha stage.', verified: true, published: true, crowd: null, interested_base: 412 },
  { id: 'mok-bands', name: 'Battle of Bands', category: 'Music', festival: 'Moksha', venue_name: 'SAC & Library', venue_id: 'sac', campus_x: 550, campus_y: 395, latitude: 28.6094, longitude: 77.0336, start_time: iso(T0 + 3 * H), end_time: iso(T0 + 5.5 * H), description: 'Inter-college band face-off.', verified: true, published: true, crowd: null, interested_base: 187 },
  { id: 'mok-after', name: 'Moksha Afterparty', category: 'Cultural', festival: 'Moksha', venue_name: 'Venue TBA', venue_id: null, campus_x: null, campus_y: null, latitude: null, longitude: null, start_time: iso(T0 + 13 * H), end_time: iso(T0 + 15 * H), description: 'Venue confirmed soon.', verified: false, published: true, crowd: null, interested_base: 64 },
];
/* expiry sweeper */
setInterval(() => {
  for (const [id, r] of requests) {
    if (r.expires < now()) {
      requests.delete(id);
      sendTo(r.from, { type: 'linkup_expired', to: r.to });
    }
  }
  for (const [uid, s] of sessions) {
    if (s.endsAt && s.endsAt < now()) { endSession(uid, true); }
  }
  for (const [id, g] of groups) {
    if (g.endsAt && g.endsAt < now()) { groups.delete(id); groupCast(g, { type: 'group_end', groupId: id, expired: true }); }
  }
  for (const [id, u] of users) {
    if (!u.bot && now() - u.seenAt > STALE_MS) { users.delete(id); broadcastRoster(); }
  }
}, 5000);

/* ---------- helpers ---------- */
function roster() {
  return [...users.values()].map((u) => ({ id: u.id, name: u.name, dept: u.dept, x: Math.round(u.x), y: Math.round(u.y), spot: u.spot, online: true, bot: !!u.bot }));
}
/* per-viewer roster: blocked pairs never see each other (either direction) */
function rosterFor(uid) {
  return roster().filter((u) => u.id !== uid && !isBlocked(uid, u.id));
}
function sendTo(uid, msg) {
  const set = streams.get(uid);
  if (!set) return false;
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of set) { try { res.write(line); } catch {} }
  return set.size > 0;
}
function broadcast(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const set of streams.values()) for (const res of set) { try { res.write(line); } catch {} }
}
function broadcastRoster() {
  for (const [uid, set] of streams) {
    const line = `data: ${JSON.stringify({ type: 'roster', roster: rosterFor(uid) })}\n\n`;
    for (const res of set) { try { res.write(line); } catch {} }
  }
}
function body(req) {
  return new Promise((res, rej) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); });
    req.on('end', () => { try { res(s ? JSON.parse(s) : {}); } catch { rej(new Error('bad json')); } });
  });
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function auth(req, url) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  const uid = byToken.get(t);
  return uid ? users.get(uid) : null;
}
function pairKey(a, b) { return [a, b].sort().join('|'); }
/* push only when the user has NO live SSE stream (SSE covers live tabs) */
function notifyPush(uid, payload) {
  if (streams.get(uid)?.size) return;
  const sub = pushSubs.get(uid);
  if (!sub) return;
  sendPush(sub, payload).then((r) => {
    if (r.code === 404 || r.code === 410) pushSubs.delete(uid);
  }).catch(() => {});
}
function endSession(uid, expired = false) {
  const s = sessions.get(uid);
  if (!s) return;
  sessions.delete(uid); sessions.delete(s.with);
  sendTo(s.with, { type: 'session_end', with: uid, expired });
  sendTo(uid, { type: 'session_end', with: s.with, expired });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' }); res.end(); return; }
  try {
    /* health */
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, now: now(), clients: users.size });
    /* join */
    if (req.method === 'POST' && url.pathname === '/api/join') {
      const { name, dept } = await body(req);
      if (!String(name || '').trim()) return send(res, 400, { error: 'name required' });
      const id = rid('u-'), token = crypto.randomBytes(16).toString('hex');
      users.set(id, { id, name: String(name).slice(0, 40), dept: String(dept || '').slice(0, 20), token, x: 350, y: 400, spot: 'Near Admin Block', seenAt: now(), bot: false, wp: null });
      byToken.set(token, id);
      broadcastRoster();
      return send(res, 200, { id, token });
    }
    /* authed routes */
    const me = auth(req, url);
    const needAuth = ['/api/pos', '/api/linkup', '/api/linkup/respond', '/api/linkup/end', '/api/session', '/api/chat', '/api/push/subscribe', '/api/push/unsubscribe', '/api/block', '/api/blocks', '/api/report', '/api/announce'].some((p) => url.pathname === p || url.pathname.startsWith('/api/chat')) || url.pathname.startsWith('/api/group') || url.pathname === '/api/groups/mine';
    if (needAuth && !me) return send(res, 401, { error: 'unauthorized' });

    if (req.method === 'POST' && url.pathname === '/api/pos') {
      const { x, y, spot } = await body(req);
      me.x = +x || me.x; me.y = +y || me.y;
      me.spot = String(spot || '') || spotFor(me.x, me.y);
      me.seenAt = now();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/live') {
      if (!me) return send(res, 401, { error: 'unauthorized' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`data: ${JSON.stringify({ type: 'hello', you: me.id, roster: rosterFor(me.id) })}\n\n`);
      res.on('error', () => {}); // dead sockets must never take the server down
      if (!streams.has(me.id)) streams.set(me.id, new Set());
      streams.get(me.id).add(res);
      // flush requests that arrived while this client was reconnecting
      for (const r of requests.values()) {
        if (r.to === me.id && r.expires > now()) {
          const from = users.get(r.from);
          try { res.write(`data: ${JSON.stringify({ type: 'linkup_request', from: r.from, fromName: from ? from.name : 'Someone', spot: r.spot, durMin: r.durMin, expires: r.expires })}\n\n`); } catch {}
        }
      }
      const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 20000);
      req.on('close', () => { clearInterval(hb); try { streams.get(me.id)?.delete(res); } catch {} });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/events') return send(res, 200, events.filter((e) => e.published));
    if (req.method === 'POST' && url.pathname === '/api/linkup') {
      const { to, spot, durMin } = await body(req);
      const peer = users.get(to);
      if (!peer || isBlocked(me.id, to)) return send(res, 404, { error: 'user offline' });
      if (sessions.get(me.id) || memberGroups(me.id).length) return send(res, 409, { error: 'already linked' });
      if (sessions.get(to) || memberGroups(to).length) return send(res, 409, { error: 'busy' });
      const r = { id: rid('req-'), from: me.id, to, spot: String(spot || 'Near SAC').slice(0, 60), durMin: [30, 60, 120, 0].includes(+durMin) ? +durMin : 30, expires: now() + 120e3 };
      requests.set(r.id, r);
      if (peer.bot) {
        // bots play along: auto-accept shortly
        setTimeout(() => {
          if (!requests.has(r.id) || sessions.get(me.id)) return;
          requests.delete(r.id);
          const endsAt = r.durMin === 0 ? null : now() + r.durMin * 60e3;
          const [spotX, spotY] = spotXY(r.spot);
          sessions.set(me.id, { id: rid('ses-'), with: peer.id, spot: r.spot, spotX, spotY, endsAt });
          sessions.set(peer.id, { id: rid('ses-'), with: me.id, spot: r.spot, spotX, spotY, endsAt });
          sendTo(me.id, { type: 'linkup_accept', from: peer.id, spot: r.spot, spotX, spotY, endsAt });
        }, 2500 + Math.random() * 2500);
        return send(res, 200, { ok: true, pending: true });
      }
      const got = sendTo(to, { type: 'linkup_request', from: me.id, fromName: me.name, spot: r.spot, durMin: r.durMin, expires: r.expires });
      if (!got) notifyPush(to, { title: `⚡ ${me.name} wants to link up`, body: r.spot, view: 'friends' });
      return send(res, 200, { ok: true, delivered: got });
    }
    if (req.method === 'POST' && url.pathname === '/api/linkup/respond') {
      const { from, accept, durMin } = await body(req);
      const r = [...requests.values()].find((x) => x.from === from && x.to === me.id);
      if (!r || isBlocked(me.id, from)) return send(res, 404, { error: 'request expired' });
      requests.delete(r.id);
      if (!accept) { sendTo(from, { type: 'linkup_decline', from: me.id }); return send(res, 200, { ok: true }); }
      const d = [30, 60, 120, 0].includes(+durMin) ? +durMin : r.durMin;
      const endsAt = d === 0 ? null : now() + d * 60e3;
      const [spotX, spotY] = spotXY(r.spot);
      sessions.set(me.id, { id: rid('ses-'), with: from, spot: r.spot, spotX, spotY, endsAt });
      sessions.set(from, { id: rid('ses-'), with: me.id, spot: r.spot, spotX, spotY, endsAt });
      sendTo(from, { type: 'linkup_accept', from: me.id, spot: r.spot, spotX, spotY, endsAt });
      return send(res, 200, { ok: true, spot: r.spot, spotX, spotY, endsAt });
    }
    if (req.method === 'POST' && url.pathname === '/api/linkup/end') { endSession(me.id); return send(res, 200, { ok: true }); }
    if (req.method === 'GET' && url.pathname === '/api/session') return send(res, 200, { session: sessions.get(me.id) || null });
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const { to, text } = await body(req);
      const t = String(text || '').slice(0, 500);
      if (!t || !users.get(to) || isBlocked(me.id, to)) return send(res, 400, { error: 'bad message' });
      const k = pairKey(me.id, to);
      if (!chats.has(k)) chats.set(k, []);
      const m = { from: me.id, text: t, t: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) };
      chats.get(k).push(m);
      if (chats.get(k).length > 50) chats.get(k).shift();
      const live = sendTo(to, { type: 'chat', ...m, fromName: me.name });
      if (!live) notifyPush(to, { title: me.name, body: t, view: 'messages' });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/chat') {
      const withId = url.searchParams.get('with');
      const k = withId.startsWith('group:') ? withId : pairKey(me.id, withId);
      return send(res, 200, { messages: chats.get(k) || [] });
    }
    if (req.method === 'GET' && url.pathname === '/api/push/key') return send(res, 200, { publicKey: appPublicKey() });
    if (req.method === 'POST' && url.pathname === '/api/push/subscribe') {
      const { sub } = await body(req);
      if (!sub?.endpoint || !sub?.keys) return send(res, 400, { error: 'bad subscription' });
      pushSubs.set(me.id, sub);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/push/unsubscribe') { pushSubs.delete(me.id); return send(res, 200, { ok: true }); }
    /* ---- safety: block / report ---- */
    if (req.method === 'POST' && url.pathname === '/api/block') {
      const { user, block } = await body(req);
      if (!users.get(user) || user === me.id) return send(res, 400, { error: 'bad user' });
      if (!blocks.has(me.id)) blocks.set(me.id, new Set());
      if (block === false) blocks.get(me.id).delete(user);
      else blocks.get(me.id).add(user);
      broadcastRoster();
      return send(res, 200, { ok: true, blocked: blocks.get(me.id).has(user) });
    }
    if (req.method === 'GET' && url.pathname === '/api/blocks') {
      const ids = [...(blocks.get(me.id) || [])];
      return send(res, 200, { blocked: ids.map((id) => { const u = users.get(id); return u ? { id: u.id, name: u.name } : { id }; }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/report') {
      const { user, reason } = await body(req);
      if (!users.get(user)) return send(res, 400, { error: 'bad user' });
      reports.unshift({ id: rid('rep-'), from: me.id, fromName: me.name, about: user, aboutName: users.get(user).name, reason: String(reason || '').slice(0, 200), at: now() });
      if (reports.length > 100) reports.pop();
      return send(res, 200, { ok: true });
    }
    /* ---- group hangouts ---- */
    if (req.method === 'POST' && url.pathname === '/api/group/create') {
      const { spot, durMin } = await body(req);
      if (sessions.get(me.id) || memberGroups(me.id).length) return send(res, 409, { error: 'already linked' });
      const d = [30, 60, 120, 0].includes(+durMin) ? +durMin : 60;
      const [spotX, spotY] = spotXY(String(spot || 'Moksha Ground'));
      const g = { id: rid('grp-'), spot: String(spot || 'Moksha Ground').slice(0, 60), spotX, spotY, endsAt: d === 0 ? null : now() + d * 60e3, host: me.id, members: [me.id], invites: [] };
      groups.set(g.id, g);
      return send(res, 200, { ok: true, group: groupPublic(g) });
    }
    if (req.method === 'POST' && url.pathname === '/api/group/invite') {
      const { groupId, to } = await body(req);
      const g = groups.get(groupId);
      const peer = users.get(to);
      if (!g || !g.members.includes(me.id)) return send(res, 404, { error: 'no group' });
      if (!peer || isBlocked(me.id, to)) return send(res, 404, { error: 'user offline' });
      if (g.members.includes(to) || g.invites.includes(to)) return send(res, 200, { ok: true, dup: true });
      g.invites.push(to);
      if (peer.bot) {
        setTimeout(() => {
          if (!groups.has(g.id) || g.members.includes(to)) return;
          g.invites = g.invites.filter((x) => x !== to);
          g.members.push(to);
          groupCast(g, { type: 'group_update', group: groupPublic(g) });
        }, 2000 + Math.random() * 2500);
        return send(res, 200, { ok: true, pending: true });
      }
      const got = sendTo(to, { type: 'group_invite', group: groupPublic(g), fromName: me.name });
      if (!got) notifyPush(to, { title: `⚡ ${me.name} invited you to link up`, body: g.spot, view: 'friends' });
      return send(res, 200, { ok: true, delivered: got });
    }
    if (req.method === 'POST' && url.pathname === '/api/group/join') {
      const { groupId } = await body(req);
      const g = groups.get(groupId);
      if (!g) return send(res, 404, { error: 'group gone' });
      if (sessions.get(me.id) || (memberGroups(me.id).length && !g.members.includes(me.id))) return send(res, 409, { error: 'already linked' });
      if (!g.invites.includes(me.id) && !g.members.includes(me.id)) return send(res, 403, { error: 'not invited' });
      g.invites = g.invites.filter((x) => x !== me.id);
      if (!g.members.includes(me.id)) g.members.push(me.id);
      groupCast(g, { type: 'group_update', group: groupPublic(g) });
      return send(res, 200, { ok: true, group: groupPublic(g) });
    }
    if (req.method === 'POST' && url.pathname === '/api/group/leave') {
      const { groupId } = await body(req);
      const g = groups.get(groupId);
      if (!g) return send(res, 200, { ok: true });
      g.members = g.members.filter((x) => x !== me.id);
      if (!g.members.length) { groups.delete(groupId); return send(res, 200, { ok: true, dissolved: true }); }
      if (g.host === me.id) g.host = g.members[0];
      groupCast(g, { type: 'group_update', group: groupPublic(g) });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/group/end') {
      const { groupId } = await body(req);
      const g = groups.get(groupId);
      if (!g || g.host !== me.id) return send(res, 403, { error: 'host only' });
      groups.delete(groupId);
      groupCast(g, { type: 'group_end', groupId });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/group/chat') {
      const { groupId, text } = await body(req);
      const g = groups.get(groupId);
      const t = String(text || '').slice(0, 500);
      if (!g || !g.members.includes(me.id) || !t) return send(res, 400, { error: 'bad message' });
      const m = { from: me.id, text: t, t: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) };
      const k = 'group:' + groupId;
      if (!chats.has(k)) chats.set(k, []);
      chats.get(k).push(m);
      if (chats.get(k).length > 50) chats.get(k).shift();
      groupCast(g, { type: 'group_chat', groupId, ...m, fromName: me.name }, me.id);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/groups/mine') {
      return send(res, 200, { groups: memberGroups(me.id).map(groupPublic) });
    }
    /* admin */
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const { code } = await body(req);
      if (String(code || '').trim().toLowerCase() !== ADMIN_CODE) return send(res, 403, { error: 'wrong code' });
      const t = rid('adm-'); adminTokens.add(t);
      return send(res, 200, { adminToken: t });
    }
    const adm = req.headers['x-admin-token'];
    if (url.pathname.startsWith('/api/admin/') && !adminTokens.has(adm)) return send(res, 403, { error: 'organizers only' });
    if (req.method === 'GET' && url.pathname === '/api/admin/events') return send(res, 200, events);
    if (req.method === 'GET' && url.pathname === '/api/admin/reports') return send(res, 200, reports);
    if (req.method === 'POST' && url.pathname === '/api/admin/announce') {
      const { text } = await body(req);
      const t = String(text || '').slice(0, 280);
      if (!t) return send(res, 400, { error: 'empty' });
      const a = { id: rid('ann-'), text: t, at: now(), by: 'Organizers' };
      announcements.unshift(a);
      if (announcements.length > 20) announcements.pop();
      broadcast({ type: 'announce', announce: a });
      return send(res, 200, { ok: true, announce: a });
    }
    if (req.method === 'GET' && url.pathname === '/api/announce') return send(res, 200, announcements);
    if (req.method === 'POST' && url.pathname === '/api/admin/events') {
      const ev = await body(req);
      if (!ev.name || !ev.start_time || !ev.end_time) return send(res, 400, { error: 'name/dates required' });
      ev.id = ev.id || rid('mok-');
      const i = events.findIndex((e) => e.id === ev.id);
      if (i >= 0) events[i] = ev; else events.push(ev);
      broadcast({ type: 'events-changed' });
      return send(res, 200, ev);
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/events/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      events = events.filter((e) => e.id !== id);
      broadcast({ type: 'events-changed' });
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => console.log(`Link Up live server on http://localhost:${PORT}`));
/* failsafe: a LAN demo server must survive client aborts, never crash-loop */
process.on('uncaughtException', (e) => console.error('[live-server] uncaught:', e?.message));
process.on('unhandledRejection', (e) => console.error('[live-server] unhandled:', e?.message));
