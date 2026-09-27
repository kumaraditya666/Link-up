/* Link Up — NSUT, but connected. App controller (map + social + Moksha live layer) build 6 */
import { ME, SPOTS, FRIENDS, PLACES, EVENTS, TRAILS, THREADS, QUICK, BUILDINGS } from './data.js';
import { createMap } from './map.js';
import { route } from './route.js';
import { Notify, dueReminders } from './notify.js';
import { Social } from './social.js';
import { Net } from './net.js';
import {
  CATEGORIES, VENUES, venueById,
  EventStore, eventStatus, statusLabel, festivalState, nextEvent, liveEvent,
  fmtRange, fmtDate, fmtTime, getInterested, toggleInterested, interestCount,
  isOrganizer, organizerLogin, organizerLogout,
} from './events.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('linkup.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('linkup.' + k, JSON.stringify(v)); } catch {} },
};

const S = {
  view: 'map',
  ghost: store.get('ghost', false),
  session: store.get('session', null),
  outgoing: store.get('outgoing', null),
  incomingQueue: [{ id: 'kabir', spot: 'Moksha Ground', dist: 140 }],
  incoming: store.get('incoming', []),
  inbox: store.get('inbox', THREADS),
  unread: store.get('unread', { sara: 1 }),
  rsvp: store.get('rsvp', ['ev1']),
  visited: store.get('visited', ['sac-lib', 'canteen', 'moksha-ground']),
  activeChat: null,
  friendFilter: 'all',
  placeFilter: 'all',
  eventFilter: 'all',
  spotPick: 'SAC',
  durPick: 30,
  incDur: 30,
  pendingLinkUp: null,
  mokshaFilter: false,
  mokshaCat: 'All',
  mokshaCardId: null,
  mokshaHomeOff: false,
  liveReq: null,
  profile: store.get('profile', { name: 'Aditya', dept: "CSE '27" }),
};
const myName = () => (S.profile.name || 'Aditya').slice(0, 24);
function applyProfileToUI() {
  $('#profileName').textContent = `${myName()} · ${S.profile.dept || ''}`.trim();
  $('#profileAvatar').textContent = myName().slice(0, 1).toUpperCase();
  $('#profileBtn').textContent = myName().slice(0, 1).toUpperCase();
}
/* ---------- live helpers (Phase 3: server roster merges with mock friends) ---------- */
function getPerson(id) { return FRIENDS.find((x) => x.id === id) || Net.person(id) || null; }
function livePeople() { return Net.live ? Net.people() : []; }
function refreshLivePins() { map.friendsRef.list = [...FRIENDS, ...livePeople()]; }
function updateNetPill() {
  const pill = $('#netPill');
  if (!pill) return;
  pill.classList.toggle('live', Net.live);
  pill.classList.toggle('mock', !Net.live);
  $('#netPillTxt').textContent = Net.live ? 'LIVE' : 'MOCK';
  pill.title = Net.live ? `Live server: ${Net.base} — tap for debug` : 'Mock mode — tap for debug';
}
function renderDebug() {
  updateNetPill();
  const lines = [
    `build: 11 · mode: ${Net.mode.toUpperCase()} · ghost: ${S.ghost ? 'ON' : 'off'}`,
    `server: ${Net.base || '(none)'}`,
    `me: ${Net.me ? `${Net.me.name} (${Net.me.id})` : '(not joined)'}`,
    `profile: ${myName()} · ${S.profile.dept}`,
    `roster: ${Net.roster.length} other(s)`,
    ...Net.roster.map((u) => `  - ${u.name} [${u.id}] ${u.bot ? '(bot)' : '(human)'} @${u.x},${u.y}`),
    `session: ${S.session ? S.session.withName + ' ' + S.session.spot : '(none)'} · outgoing: ${S.outgoing ? S.outgoing.toId : '(none)'}`,
    '--- event log ---',
    ...Net.log.slice(-15),
  ];
  $('#debugBody').textContent = lines.join('\n');
}
/* geography replacement: migrate stale visited ids from the old layout */
S.visited = S.visited.map((id) => (id === 'sac' ? 'sac-lib' : id === 'nescafe' ? 'moksha-ground' : id));
function persist() {
  store.set('ghost', S.ghost); store.set('session', S.session);
  store.set('outgoing', S.outgoing); store.set('incoming', S.incoming);
  store.set('inbox', S.inbox); store.set('unread', S.unread);
  store.set('rsvp', S.rsvp); store.set('visited', S.visited);
  store.set('profile', S.profile);
}

/* ---------- toasts ---------- */
function toast(msg, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms);
}

/* ---------- routing ---------- */
const VIEWS = ['map', 'friends', 'nearby', 'places', 'explore', 'events', 'messages'];
function go(view) {
  if (view === 'more') { $('#moreSheet').hidden = false; return; }
  if (!VIEWS.includes(view)) view = 'map';
  S.view = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  $$('#bottomnav button, #sidenav nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#moreSheet').hidden = true;
  location.hash = '#/' + view;
  renderers[view]?.();
}
window.addEventListener('hashchange', () => {
  const v = location.hash.replace('#/', '') || 'map';
  if (v !== S.view) go(v);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) go(b.dataset.view);
  const c = e.target.closest('[data-close]');
  if (c) $('#' + c.dataset.close).hidden = true;
});
$('#moreClose')?.addEventListener('click', () => ($('#moreSheet').hidden = true));
$('#moreSheet')?.addEventListener('click', (e) => { if (e.target.id === 'moreSheet') e.target.hidden = true; });
$('#moreProfile')?.addEventListener('click', () => { $('#moreSheet').hidden = true; openProfile(); });
$('#brandHome')?.addEventListener('click', () => go('map'));
$('#brandHome')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') go('map'); });

/* ---------- map ---------- */
const map = createMap($('#campusMap'), { onSelect });
map.setGhost(S.ghost);
map.friendsRef.list = FRIENDS;
function onSelect(hit) {
  const tip = $('#mapTip');
  if (!hit) { tip.hidden = true; return; }
  if (hit.kind === 'moksha') { tip.hidden = true; openMokshaCard(hit.id); return; }
  if (hit.kind === 'friend') {
    const f = getPerson(hit.id);
    if (!f) { tip.hidden = true; return; }
    tip.innerHTML = `<strong>${f.name}</strong><br><span class="muted">${f.spot} · ${f.dist} m · ${f.vibe}</span><br><button class="mini-btn go" id="tipLu">Link Up ⚡</button> <button class="mini-btn" id="tipChat">Chat</button>`;
    tip.hidden = false;
    tip.style.left = '50%'; tip.style.top = '34%';
    $('#tipLu').onclick = () => { tip.hidden = true; openLinkUp(f.id); };
    $('#tipChat').onclick = () => { tip.hidden = true; openChat(f.id); go('messages'); };
  } else {
    const b = BUILDINGS.find((x) => x.id === hit.id);
    const p = PLACES.find((x) => x.id === hit.id);
    tip.innerHTML = `<strong>${b ? b.label : hit.id}</strong><br><span class="muted">${p ? p.desc : 'NSUT Dwarka'}</span>`;
    tip.hidden = false;
    tip.style.left = '50%'; tip.style.top = '34%';
    setTimeout(() => (tip.hidden = true), 3200);
  }
}
$('#zoomIn').onclick = () => map.zoomIn();
$('#zoomOut').onclick = () => map.zoomOut();
$('#rotLeft').onclick = () => map.rotateBy(0.35);
$('#rotRight').onclick = () => map.rotateBy(-0.35);
$('#dayBtn').onclick = (e) => {
  const m = map.cycleTimeOfDay();
  e.currentTarget.textContent = m === 'day' ? '☀️' : m === 'evening' ? '🌇' : '🌙';
  toast(m === 'day' ? '☀️ Day mode' : m === 'evening' ? '🌇 Evening mode' : '🌙 Night mode — windows lit');
};
$('#locateBtn').onclick = () => { map.locate(); toast('Centred on you · NSUT Dwarka 📍'); };
$('#tiltBtn').onclick = (e) => {
  const v = map.toggleTilt();
  e.currentTarget.classList.toggle('active', v > 0.75);
  toast(v > 0.75 ? '3D tilt on 🏙️ — drag with right mouse / two fingers to orbit' : 'Flatter view 🗺️');
};
$$('#mapChips .chip[data-layer]').forEach((c) => (c.onclick = () => {
  $$('#mapChips .chip[data-layer]').forEach((x) => x.classList.remove('active'));
  c.classList.add('active');
  map.setLayer(c.dataset.layer);
  $('#eventSub').hidden = c.dataset.layer !== 'events';
  renderSheet();
}));
$$('#eventSub button').forEach((b) => (b.onclick = () => {
  $$('#eventSub button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  setMokshaFilter(b.dataset.es === 'moksha');
}));

/* ---------- Moksha filter ---------- */
function setMokshaFilter(on, fly = true) {
  S.mokshaFilter = on;
  map.setMokshaFilter(on);
  $('#mokshaChip').classList.toggle('on', on);
  $$('#eventSub button').forEach((x) => x.classList.toggle('active', (x.dataset.es === 'moksha') === on));
  if (on) {
    const main = liveEvent('Moksha') || nextEvent('Moksha');
    if (main && main.campus_x != null && fly) map.focusMoksha(main);
    toast('🎭 Showing all verified Moksha venues');
  } else {
    map.clearMokshaFocus();
  }
}
$('#mokshaChip').onclick = () => setMokshaFilter(!S.mokshaFilter);

/* ---------- sheet (map bottom) ---------- */
function nearbySorted() {
  return [...FRIENDS, ...livePeople()].filter((f) => f.online && !S.ghost).sort((a, b) => a.dist - b.dist).slice(0, 6);
}
function renderSheet() {
  const wrap = $('#sheetCards');
  const list = nearbySorted();
  $('#sheetTitle').textContent = S.ghost ? 'Ghost Mode 👻 — you’re hidden' : 'Around you';
  $('#sheetSub').textContent = S.ghost ? 'Go visible to link up' : `NSUT Dwarka · ${list.length} friends live`;
  wrap.innerHTML = list.length ? list.map((f) => `
    <div class="mini-card"><span class="avatar" style="background:${f.grad}">${f.short.slice(0, 1)}</span>
    <div><strong>${f.name.split(' ')[0]} · ${f.dist} m</strong><small>${f.spot}</small></div>
    <button data-lu="${f.id}">Link Up</button></div>`).join('')
    : `<div class="mini-card"><div><strong>Nobody visible right now</strong><small>Turn off Ghost Mode to appear</small></div></div>`;
  $$('[data-lu]', wrap).forEach((b) => (b.onclick = () => openLinkUp(b.dataset.lu)));
}
$('#sheetLinkUp').onclick = () => {
  const list = nearbySorted();
  if (!list.length) { toast('No one nearby — try Friends instead 👀'); go('friends'); return; }
  openLinkUp(list[0].id);
};
$('#sideLinkUp').onclick = () => openLinkUp(nearbySorted()[0]?.id || 'ananya');

/* ================= MOKSHA ================= */
const catEmoji = (c) => (CATEGORIES.find((x) => x.id === c)?.emoji || '🎪');

function mainMoksha() {
  return liveEvent('Moksha') || nextEvent('Moksha') || EventStore.mappable('Moksha')[0] || EventStore.ofFestival('Moksha')[0] || null;
}

function openMokshaCard(id) {
  const ev = (id && EventStore.get(id)) || mainMoksha();
  if (!ev) { toast('No Moksha events published yet.'); return; }
  S.mokshaCardId = ev.id;
  fillMokshaCard(ev);
  $('#mokshaCard').hidden = false;
  if (ev.campus_x != null) map.focusMoksha(ev);
}
function fillMokshaCard(ev) {
  const st = statusLabel(ev);
  const pill = $('#mokshaStatus');
  pill.textContent = `${st.icon} ${st.text}`;
  pill.className = 'pill ' + st.cls;
  const verifiedVenue = ev.verified && ev.venue_name;
  $('#mokshaVenue').textContent = verifiedVenue ? ev.venue_name : 'Venue TBA';
  $('#mokshaDate').textContent = fmtDate(ev.start_time) + (fmtDate(ev.start_time) !== fmtDate(ev.end_time) ? ' → ' + fmtDate(ev.end_time) : '');
  $('#mokshaTime').textContent = `${fmtTime(ev.start_time)} – ${fmtTime(ev.end_time)}`;
  $('#mokshaDesc').textContent = ev.description || '';
  // crowd: ONLY with reliable data, otherwise hidden entirely
  const cr = $('#mokshaCrowd');
  if (['low', 'moderate', 'high'].includes(ev.crowd)) {
    cr.hidden = false;
    const dot = ev.crowd === 'low' ? '🟢' : ev.crowd === 'moderate' ? '🟡' : '🔴';
    $('#mokshaCrowdV').textContent = `${dot} ${ev.crowd[0].toUpperCase() + ev.crowd.slice(1)} activity`;
  } else cr.hidden = true;
  const mine = getInterested().has(ev.id);
  $('#mokshaInterest').textContent = mine ? '★ Interested ✓' : "☆ I'm Interested";
  $('#mokshaCount').textContent = `👥 ${interestCount(ev)} interested · ${catEmoji(ev.category)} ${ev.category}`;
  const mappable = ev.verified && ev.campus_x != null;
  $('#mokshaDir').disabled = !mappable;
  $('#mokshaDir').title = mappable ? '' : 'Venue TBA — directions unlock once the venue is verified';
}
$('#mokshaView').onclick = () => { $('#mokshaCard').hidden = true; openMokshaHub(); };
$('#mokshaDir').onclick = () => { const ev = EventStore.get(S.mokshaCardId); if (ev) showDirections(ev); };
$('#mokshaShare').onclick = () => {
  const ev = EventStore.get(S.mokshaCardId);
  if (!ev) return;
  const venue = ev.verified && ev.venue_name ? ev.venue_name : 'Venue TBA';
  const txt = `🎭 ${ev.name} (Moksha, NSUT)\n📍 ${venue}\n📅 ${fmtRange(ev)}\n— via Link Up`;
  if (navigator.share) navigator.share({ title: ev.name, text: txt }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Copied — paste it anywhere 📋')).catch(() => toast(txt));
  else toast(txt);
};
$('#mokshaInterest').onclick = () => {
  const on = toggleInterested(S.mokshaCardId);
  fillMokshaCard(EventStore.get(S.mokshaCardId));
  toast(on ? 'Nice — you’re on the interested list 🎭' : 'Removed from interested.');
  if (S.view === 'events') renderEvents();
};

/* ----- hub ----- */
function openMokshaHub() {
  renderMokshaHub();
  $('#mokshaHub').hidden = false;
}
function renderMokshaHub() {
  const cats = ['All', ...CATEGORIES.map((c) => c.id)];
  $('#mokshaCats').innerHTML = cats.map((c) => `<button data-mc="${c}" class="${S.mokshaCat === c ? 'active' : ''}">${c === 'All' ? 'All' : catEmoji(c) + ' ' + c}</button>`).join('');
  $$('#mokshaCats button').forEach((b) => (b.onclick = () => { S.mokshaCat = b.dataset.mc; renderMokshaHub(); }));
  let list = EventStore.ofFestival('Moksha').sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  if (S.mokshaCat !== 'All') list = list.filter((e) => e.category === S.mokshaCat);
  $('#mokshaList').innerHTML = list.length ? list.map((ev) => {
    const st = statusLabel(ev);
    const mappable = ev.verified && ev.campus_x != null;
    return `<div class="mk-ev"><h4>${catEmoji(ev.category)} ${ev.name}</h4>
      <div class="meta"><span class="pill ${st.cls}">${st.icon} ${st.text}</span>
      <span>📍 ${mappable ? ev.venue_name : 'Venue TBA'}</span>
      <span>📅 ${fmtDate(ev.start_time)} · ${fmtTime(ev.start_time)}</span></div>
      <p>${ev.description || ''}</p>
      <div class="row"><span class="muted">👥 ${interestCount(ev)} interested</span><span style="flex:1"></span>
      ${mappable ? `<button class="mini-btn" data-locate="${ev.id}">📍 Map</button><button class="mini-btn go" data-dir="${ev.id}">Route</button>` : `<button class="mini-btn" disabled title="No verified venue yet">Venue TBA</button>`}
      </div></div>`;
  }).join('') : `<div class="mk-ev">No verified events in this category yet.</div>`;
  $$('#mokshaList [data-locate]').forEach((b) => (b.onclick = () => {
    const ev = EventStore.get(b.dataset.locate);
    $('#mokshaHub').hidden = true; go('map');
    setMokshaFilter(true, false);
    map.focusMoksha(ev);
    openMokshaCard(ev.id);
  }));
  $$('#mokshaList [data-dir]').forEach((b) => (b.onclick = () => {
    const ev = EventStore.get(b.dataset.dir);
    $('#mokshaHub').hidden = true; go('map');
    showDirections(ev);
  }));
}

/* ----- directions (turn-by-turn over the campus road graph) ----- */
function buildRouteTo(ev) {
  const A = map.mePos, vx = ev.campus_x, vy = ev.campus_y;
  try {
    const r = route([A.x, A.y], [vx, vy]);
    if (r && r.pts.length >= 2) return { pts: r.pts, to: { x: vx, y: vy }, steps: r.steps, meters: r.meters, mins: r.mins, approximate: r.approximate };
  } catch {}
  // legacy fallback (straight connectors along main roads)
  const pts = [[A.x, A.y], [500, A.y], [500, vy]];
  if (vy > 400) pts.push([500, 520], [vx, 520]);
  else if (vy < 240) pts.push([500, 180], [vx, 180]);
  pts.push([vx, vy]);
  return { pts, to: { x: vx, y: vy }, steps: [], meters: 0, mins: 0, approximate: true };
}
function showDirections(ev) {
  if (!ev || ev.campus_x == null) { toast('Venue TBA — directions unlock once verified.'); return; }
  const r = buildRouteTo(ev);
  map.setRoute(r);
  $('#dirDest').textContent = ev.venue_name || 'Moksha';
  $('#dirMeta').textContent = `≈${r.meters} m · ~${r.mins} min walk · ${r.approximate ? 'Approximate route' : 'via campus roads'}`;
  $('#dirSteps').innerHTML = r.steps.map((s, i) => `<li><strong>${i + 1}.</strong> ${s.text}${s.meters ? ` <span>· ${s.meters} m</span>` : ''}</li>`).join('');
  $('#dirBar').hidden = false;
  go('map');
  map.flyTo((map.mePos.x + ev.campus_x) / 2, (map.mePos.y + ev.campus_y) / 2, { dist: 1100 });
  toast(`📍 You → 🎭 ${ev.venue_name} · ~${r.mins} min walk`);
}
$('#dirClose').onclick = () => { map.setRoute(null); $('#dirBar').hidden = true; };

/* ----- home / upcoming card ----- */
function refreshMokshaHome() {
  const el = $('#mokshaHome');
  if (S.mokshaHomeOff) { el.hidden = true; return; }
  const fs = festivalState('Moksha');
  const dot = $('#mokshaLiveDot');
  dot.hidden = fs !== 'live';
  if (fs === 'none' || fs === 'ended') {
    if (fs === 'ended') {
      el.hidden = false;
      $('#mokshaHomeSub').textContent = 'NSUT Cultural Festival · ENDED';
      $('#mokshaHomeMeta').textContent = '⚫ That’s a wrap — see you next year';
      $('#mokshaHomeGo').textContent = 'Highlights';
    } else el.hidden = true;
    return;
  }
  const ev = fs === 'live' ? liveEvent('Moksha') : nextEvent('Moksha');
  if (!ev) { el.hidden = true; return; }
  el.hidden = false;
  const venue = ev.verified && ev.venue_name ? ev.venue_name : 'Venue TBA';
  if (fs === 'live') {
    $('#mokshaHomeSub').textContent = 'NSUT Cultural Festival · 🟢 LIVE NOW';
    $('#mokshaHomeMeta').textContent = `📍 ${venue} · ends ${fmtTime(ev.end_time)}`;
  } else {
    const ms = new Date(ev.start_time) - Date.now();
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
    $('#mokshaHomeSub').textContent = 'NSUT Cultural Festival';
    $('#mokshaHomeMeta').textContent = `Starts in ${d >= 1 ? d + (d === 1 ? ' day' : ' days') : h + 'h'} · 📍 ${venue}`;
  }
  $('#mokshaHomeGo').textContent = 'View on Map';
  el.dataset.ev = ev.id;
}
$('#mokshaHomeGo').onclick = () => {
  if (festivalState('Moksha') === 'ended') { openMokshaHub(); return; }
  const ev = EventStore.get($('#mokshaHome').dataset.ev) || mainMoksha();
  if (ev && ev.campus_x != null) { setMokshaFilter(true, false); map.focusMoksha(ev); }
  openMokshaCard(ev?.id);
};
$('#mokshaHomeX').onclick = () => { S.mokshaHomeOff = true; $('#mokshaHome').hidden = true; };

/* ---------- Friends ---------- */
function renderFriends() {
  const grid = $('#friendsGrid');
  let list = [...FRIENDS];
  if (S.friendFilter === 'online') list = list.filter((f) => f.online);
  if (S.friendFilter === 'linked') list = list.filter((f) => S.session?.withId === f.id);
  const live = livePeople();
  const liveHtml = live.length && S.friendFilter !== 'linked'
    ? `<h2 style="grid-column:1/-1;margin:4px 2px 0">Live on campus ⚡ <span class="muted">${live.length} via server</span></h2>` + live.map((f) => `
    <div class="card" style="border-color:#a3e63555"><div class="row"><span class="avatar" style="background:${f.grad}">${f.short.slice(0, 1)}</span>
      <div style="flex:1"><h3>${f.name} ${f.bot ? '<small>🤖</small>' : ''}</h3><small>${f.dept} · ${f.spot} · ${f.dist} m</small></div>
      <span class="dot on"></span></div>
      <p class="muted" style="margin:8px 0">${f.vibe}</p>
      <div class="row" style="gap:8px"><span class="pill live">● live</span><span style="flex:1"></span>
      <button class="mini-btn" data-chat="${f.id}">Chat</button>
      <button class="mini-btn go" data-lu="${f.id}" ${S.ghost ? 'disabled title="Ghosted"' : ''}>Link Up ⚡</button></div></div>`).join('') : '';
  grid.innerHTML = liveHtml + list.map((f) => {
    const linked = S.session?.withId === f.id;
    const out = S.outgoing?.toId === f.id;
    return `<div class="card"><div class="row"><span class="avatar" style="background:${f.grad}">${f.short.slice(0, 1)}</span>
      <div style="flex:1"><h3>${f.name}</h3><small>${f.dept} · ${f.spot} · ${f.dist} m</small></div>
      <span class="dot ${f.online ? 'on' : ''}"></span></div>
      <p class="muted" style="margin:8px 0">${f.vibe}</p>
      <div class="row" style="gap:8px">${linked ? `<span class="pill live">🤝 LINKED UP</span>` : f.online ? `<span class="pill live">● live</span>` : `<span class="pill">offline</span>`}
      <span style="flex:1"></span>
      <button class="mini-btn" data-chat="${f.id}">Chat</button>
      ${linked ? `<button class="mini-btn go" data-end="${f.id}">End</button>`
        : out ? `<button class="mini-btn" disabled>Requested…</button>`
        : `<button class="mini-btn go" data-lu="${f.id}" ${!f.online || S.ghost ? 'disabled title="Offline or ghosted"' : ''}>Link Up ⚡</button>`}
      </div></div>`;
  }).join('');
  $$('[data-lu]', grid).forEach((b) => (b.onclick = () => openLinkUp(b.dataset.lu)));
  $$('[data-chat]', grid).forEach((b) => (b.onclick = () => { openChat(b.dataset.chat); go('messages'); }));
  $$('[data-end]', grid).forEach((b) => (b.onclick = () => endSession('You ended the hangout.')));
  const inc = [...S.incomingQueue.map((q) => ({ ...q, pending: true })), ...S.incoming];
  $('#incomingWrap').hidden = !inc.length;
  $('#incomingCount').textContent = inc.length ? `(${inc.length})` : '';
  $('#incomingList').innerHTML = inc.map((q) => {
    const f = FRIENDS.find((x) => x.id === q.id);
    return `<div class="incoming-card"><span class="avatar" style="background:${f.grad}">${f.short.slice(0, 1)}</span>
      <div class="grow"><strong>${f.name.split(' ')[0]} wants to link up.</strong><small>${q.spot} · ${q.dist} m away</small></div>
      <button class="mini-btn" data-dec="${q.id}">Decline</button>
      <button class="mini-btn go" data-acc="${q.id}">Accept</button></div>`;
  }).join('');
  $$('[data-dec]', $('#incomingList')).forEach((b) => (b.onclick = () => declineIncoming(b.dataset.dec)));
  $$('[data-acc]', $('#incomingList')).forEach((b) => (b.onclick = () => acceptIncoming(b.dataset.acc)));
}
$$('.seg [data-f]').forEach((b) => (b.onclick = () => {
  $$('.seg [data-f]').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); S.friendFilter = b.dataset.f; renderFriends();
}));

/* ---------- Link Up flow ---------- */
function openLinkUp(fid) {
  const f = getPerson(fid) || FRIENDS[0];
  if (S.ghost) { toast('👻 Ghost Mode is on — go visible to link up.'); go('nearby'); return; }
  if (S.session) { toast(`Already linked up with ${S.session.withName} 🤝`); showLinked(); return; }
  if (!f.online) { toast(`${f.name.split(' ')[0]} is offline right now.`); return; }
  S.pendingLinkUp = f.id;
  $('#linkupWho').textContent = `Link up with ${f.name.split(' ')[0]}? · ${f.spot}`;
  $('#linkupHint').textContent = `They'll get “${myName()} wants to link up.” · expires in 2 min`;
  $('#spotPick').innerHTML = SPOTS.map((s, i) => `<button data-s="${s}" class="${i === 0 ? 'active' : ''}">${s}</button>`).join('');
  S.spotPick = SPOTS[0];
  $$('#spotPick button').forEach((b) => (b.onclick = () => {
    $$('#spotPick button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); S.spotPick = b.dataset.s;
  }));
  $('#linkupModal').hidden = false;
}
$$('#durPick button').forEach((b) => (b.onclick = () => {
  $$('#durPick button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); S.durPick = +b.dataset.d;
}));
$$('#incDur button').forEach((b) => (b.onclick = () => {
  $$('#incDur button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); S.incDur = +b.dataset.d;
}));
$('#sendLinkUp').onclick = async () => {
  const f = getPerson(S.pendingLinkUp);
  $('#linkupModal').hidden = true;
  if (f.live && Net.live) {
    S.outgoing = { toId: f.id, live: true };
    persist(); renderFriends();
    const r = await Net.sendLinkup(f.id, S.spotPick, S.durPick);
    if (!r.data.ok) {
      S.outgoing = null; persist(); renderFriends();
      const msg = r.code === 404 ? 'They went offline — ask them to reload the page 👀'
        : r.data.error === 'busy' ? "They're linked up right now 🤝" : 'Finish your current hangout first 🤝';
      toast(msg);
      return;
    }
    if (r.data.delivered === false) {
      S.outgoing = null; persist(); renderFriends();
      toast('They’re reconnecting — ask them to reload, then retry 📡');
      Net.beat();
      return;
    }
    toast(`⚡ Live Link Up sent to ${f.name.split(' ')[0]} — waiting for accept…`);
    return; // server SSE delivers accept / decline / expiry
  }
  S.outgoing = { toId: f.id, expires: Date.now() + 2 * 60 * 1000 };
  persist(); renderFriends();
  toast(`⚡ Link Up sent — “${myName()} wants to link up.”`);
  setTimeout(() => {
    if (S.outgoing?.toId !== f.id || S.session) return;
    S.outgoing = null;
    startSession(f.id, S.spotPick, S.durPick, 'outgoing');
  }, 4000);
};
setTimeout(() => {
  if (S.session || !$('#incomingModal').hidden) return;
  if (S.ghost || Net.live) return; // mock demo only; live mode gets real requests
  showIncoming('kabir');
}, 9000);

function showIncoming(fid) {
  const f = getPerson(fid);
  if (!f) return;
  $('#incAvatar').textContent = f.short.slice(0, 1);
  $('#incAvatar').style.background = f.grad;
  $('#incTitle').textContent = `${f.name.split(' ')[0]} wants to link up.`;
  $('#incSub').textContent = `${f.spot} · ${f.dist} m away`;
  $('#incomingModal').hidden = false;
  $('#incomingModal').dataset.fid = fid;
  if (document.hidden) Notify.linkup(f.name.split(' ')[0]);
}
$('#incDecline').onclick = async () => {
  const fid = $('#incomingModal').dataset.fid;
  $('#incomingModal').hidden = true;
  if (S.liveReq && S.liveReq.from === fid && Net.live) {
    S.liveReq = null;
    await Net.respondLinkup(fid, false);
  }
  declineIncoming(fid);
};
$('#incAccept').onclick = async () => {
  const fid = $('#incomingModal').dataset.fid;
  $('#incomingModal').hidden = true;
  if (S.liveReq && S.liveReq.from === fid && Net.live) {
    const req = S.liveReq; S.liveReq = null;
    const r = await Net.respondLinkup(fid, true, S.incDur);
    if (r.data.ok) startSession(fid, r.data.spot, 0, 'incoming', r.data.endsAt ?? null);
    else toast('That request expired ⏳');
    return;
  }
  acceptIncoming(fid);
};
function declineIncoming(fid) {
  S.incomingQueue = S.incomingQueue.filter((q) => q.id !== fid);
  S.incoming = S.incoming.filter((q) => q.id !== fid);
  persist(); renderFriends(); toast('Declined. No worries — another time 🤙');
}
function acceptIncoming(fid) {
  const f = FRIENDS.find((x) => x.id === fid);
  S.incomingQueue = S.incomingQueue.filter((q) => q.id !== fid);
  startSession(fid, f.spot.replace('Near ', ''), S.incDur, 'incoming');
}
function startSession(fid, spot, durMin, dir, endsAtOverride = null) {
  const f = getPerson(fid) || { name: 'Someone', short: '?' };
  S.session = {
    withId: fid, withName: f.name.split(' ')[0], fullName: f.name,
    spot: spot.startsWith('Near') ? spot : `Near ${spot}`,
    endsAt: endsAtOverride !== null && endsAtOverride !== undefined ? endsAtOverride : (durMin === 0 ? null : Date.now() + durMin * 60 * 1000),
    totalMin: durMin, startedAt: Date.now(), dir,
  };
  S.outgoing = null;
  Social.recordLinkup();
  persist(); updateBanner(); renderFriends(); showLinked();
  pushMsg(fid, 'them', `🤝 LINKED UP — ${S.session.spot}! See you in 5?`);
  if (S.activeChat === fid) renderChat();
}
function showLinked() {
  if (!S.session) return;
  $('#linkedSub').textContent = `${S.session.withName} · ${S.session.spot}`;
  $('#linkedModal').hidden = false;
  tickLinked();
}
$('#linkedEnd').onclick = () => { $('#linkedModal').hidden = true; endSession('You ended the hangout.'); };
$('#linkedChat').onclick = () => { $('#linkedModal').hidden = true; openChat(S.session.withId); go('messages'); };
function endSession(msg, remote = false) {
  if (!S.session) return;
  const wasLive = !!getPerson(S.session.withId)?.live;
  if (!remote) {
    pushMsg(S.session.withId, 'me', 'Ending our link up — that was fun! 🤙');
    if (wasLive && Net.live) Net.endLink();
  }
  S.session = null; persist(); updateBanner(); renderFriends(); renderSheet();
  toast(msg || 'Link Up ended.');
}
function tickLinked() {
  if (!S.session) return;
  const el = $('#linkedTimer');
  const fmt = () => {
    if (!S.session) return;
    if (!S.session.endsAt) { el.textContent = '∞ live'; return; }
    const left = S.session.endsAt - Date.now();
    if (left <= 0) { endSession('Link Up expired ⏳'); $('#linkedModal').hidden = true; return; }
    el.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  };
  fmt();
  clearInterval(tickLinked._t);
  tickLinked._t = setInterval(() => { fmt(); updateBanner(); }, 1000);
}
function updateBanner() {
  const b = $('#linkupBanner');
  if (!S.session) { b.hidden = true; return; }
  b.hidden = false;
  $('#linkupBannerTitle').textContent = `🤝 LINKED UP · ${S.session.withName.toUpperCase()}`;
  const left = S.session.endsAt ? fmtLeft(S.session.endsAt - Date.now()) + ' left' : 'live until ended';
  $('#linkupBannerSub').textContent = `${S.session.spot} · ${left}`;
}
function fmtLeft(ms) {
  if (ms <= 0) return '00:00';
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
}
setInterval(() => {
  if (S.session?.endsAt && S.session.endsAt - Date.now() <= 0) endSession('Link Up expired ⏳');
  if (S.session) updateBanner();
  if (S.outgoing && S.outgoing.expires < Date.now()) { S.outgoing = null; persist(); renderFriends(); }
}, 5000);
setInterval(() => {
  refreshMokshaHome();
  if (!$('#mokshaCard').hidden && S.mokshaCardId) fillMokshaCard(EventStore.get(S.mokshaCardId));
  for (const { ev, label } of dueReminders(EventStore.ofFestival('Moksha'), Date.now(), Notify.seen)) {
    Notify.markSeen(ev.id);
    Notify.moksha(ev, label);
  }
}, 30000);
$('#linkupBannerEnd').onclick = () => endSession('You ended the hangout.');
$('#linkupBannerChat').onclick = () => { openChat(S.session.withId); go('messages'); };

/* ---------- Nearby + Ghost ---------- */
function renderNearby() {
  const list = [...FRIENDS, ...livePeople()].sort((a, b) => a.dist - b.dist);
  const dots = $('#radarDots');
  dots.innerHTML = S.ghost ? '' : list.filter((f) => f.online).slice(0, 6).map((f, i) => {
    const ang = (i / 6) * Math.PI * 2 + 0.6;
    const rr = 34 + (f.dist / 500) * 56;
    return `<span class="rdot" style="left:${50 + Math.cos(ang) * rr * 0.42}%;top:${58 + Math.sin(ang) * rr * 0.32}%">${f.short.slice(0, 1)}</span>`;
  }).join('') + '<div class="radar-sweep"></div>';
  $('#ghostNote').hidden = !S.ghost;
  $('#nearbyList').innerHTML = S.ghost
    ? `<div class="card"><strong>You're invisible 👻</strong><p class="muted">Turn Ghost Mode off to see who's around and get Link Up requests.</p></div>`
    : list.map((f) => `<div class="card"><div class="row"><span class="avatar" style="background:${f.grad}">${f.short.slice(0, 1)}</span>
      <div style="flex:1"><h3>${f.name}</h3><small>${f.spot} · ${f.dist} m</small></div>
      <span class="dot ${f.online ? 'on' : ''}"></span></div>
      <div class="row" style="margin-top:8px;gap:8px"><span class="pill ${f.dist < 200 ? 'live' : ''}">${f.dist < 200 ? '● very close' : f.dist + ' m'}</span><span style="flex:1"></span>
      <button class="mini-btn go" data-lu="${f.id}" ${!f.online ? 'disabled' : ''}>Link Up ⚡</button></div></div>`).join('');
  $$('#nearbyList [data-lu]').forEach((b) => (b.onclick = () => openLinkUp(b.dataset.lu)));
}
function setGhost(v) {
  S.ghost = v;
  $('#ghostToggle').checked = v; $('#ghostToggle2').checked = v;
  $('#ghostToggleTop').classList.toggle('on', v);
  $('#ghostToggleTop').setAttribute('aria-pressed', String(v));
  $('#ghostStateTop').textContent = v ? 'On' : 'Off';
  map.setGhost(v);
  Net.setPaused(v);
  persist(); renderNearby(); renderSheet();
  toast(v ? '👻 Ghost Mode on — you’re hidden.' : '⚡ You’re visible — friends can link up!');
}
$('#ghostToggle').onchange = (e) => setGhost(e.target.checked);
$('#ghostToggle2').onchange = (e) => setGhost(e.target.checked);
$('#ntLinkup').onchange = (e) => { const p = Notify.prefs; p.linkup = e.target.checked; Notify.setPrefs(p); if (p.linkup) Notify.ensure(); };
$('#ntMoksha').onchange = (e) => { const p = Notify.prefs; p.moksha = e.target.checked; Notify.setPrefs(p); if (p.moksha) Notify.ensure(); };
$('#ghostToggleTop').onclick = () => setGhost(!S.ghost);

/* ---------- Places ---------- */
function renderPlaces() {
  const g = $('#placesGrid');
  let list = [...PLACES];
  if (S.placeFilter === 'visited') list = list.filter((p) => S.visited.includes(p.id));
  else if (S.placeFilter !== 'all') list = list.filter((p) => p.cat === S.placeFilter);
  g.innerHTML = list.map((p) => `<button class="card" data-place="${p.id}" style="text-align:left;color:inherit">
    <div style="font-size:34px">${p.emoji}</div><h3 style="margin:6px 0 2px">${p.name}</h3>
    <small>★ ${p.rating} · ${p.busy}</small>
    <div class="row" style="margin-top:8px;gap:6px"><span class="tag">${p.cat}</span>${S.visited.includes(p.id) ? '<span class="tag" style="color:var(--lime);border-color:#a3e63555">✓ visited</span>' : '<span class="tag">new</span>'}<span style="flex:1"></span><span class="muted">${p.hours}</span></div></button>`).join('')
    || `<div class="card">Nothing here yet — go explore NSUT! 🗺️</div>`;
  $$('[data-place]', g).forEach((b) => (b.onclick = () => openPlace(b.dataset.place)));
}
$$('#placeSeg button').forEach((b) => (b.onclick = () => {
  $$('#placeSeg button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); S.placeFilter = b.dataset.p; renderPlaces();
}));
function openPlace(id) {
  const p = PLACES.find((x) => x.id === id);
  const allHere = [...FRIENDS, ...livePeople()].filter((f) => f.spot.toLowerCase().includes(p.short.toLowerCase().split(' ')[0]) && f.online);
  const ci = Social.checkins()[id] || { count: 20 + (id.length * 7) % 30, me: false };
  const polls = Social.polls(id);
  const pollHtml = polls.map((pl) => {
    const total = pl.options.reduce((a, o) => a + o.v, 0) || 1;
    const mine = Social.myVote(id, pl.id);
    return `<div class="poll"><strong>${pl.q}</strong>` + pl.options.map((o, i) => {
      const pct = Math.round((o.v / total) * 100);
      return `<button class="poll-opt ${mine === i ? 'mine' : ''}" data-poll="${pl.id}" data-opt="${i}">
        <span>${o.t}</span><span class="muted">${pct}%</span></button>
        <div class="poll-bar"><i style="width:${pct}%"></i></div>`;
    }).join('') + `</div>`;
  }).join('');
  $('#placeBody').innerHTML = `<div class="place-hero">${p.emoji}</div>
    <h2 style="margin:0 0 4px;letter-spacing:0">${p.name}</h2>
    <p class="muted">★ ${p.rating} · ${p.busy} · ${p.hours}</p>
    <p>${p.desc}</p>
    <p class="muted">${allHere.length ? `🟢 ${allHere.map((f) => f.name.split(' ')[0]).join(', ')} ${allHere.length === 1 ? 'is' : 'are'} here now` : 'No friends here right now — be the first 👀'}</p>
    <div class="row" style="gap:8px;margin-bottom:10px"><button class="mini-btn ${ci.me ? 'go' : ''}" id="placeCheck">🔥 ${ci.count} vibing${ci.me ? ' (you in)' : ''}</button>
    <span class="muted" style="font-size:12px">Check in to mark the vibe</span></div>
    ${pollHtml}
    <div class="row2"><button class="btn-decline" id="placeVisit">${S.visited.includes(id) ? '✓ Visited' : 'Mark visited'}</button>
    <button class="btn-primary big" id="placeLu">Link Up here ⚡</button></div>`;
  $('#placeModal').hidden = false;
  $('#placeCheck').onclick = () => { Social.toggleCheckin(id); openPlace(id); };
  $$('#placeBody [data-poll]').forEach((b) => (b.onclick = () => { Social.vote(id, b.dataset.poll, +b.dataset.opt); openPlace(id); }));
  $('#placeVisit').onclick = () => {
    if (!S.visited.includes(id)) S.visited.push(id); else S.visited = S.visited.filter((x) => x !== id);
    persist(); renderPlaces(); $('#placeModal').hidden = true;
    $('#statPlaces').textContent = S.visited.length;
    toast(S.visited.includes(id) ? `Checked in at ${p.name} 📍` : 'Removed visit.');
  };
  $('#placeLu').onclick = () => {
    $('#placeModal').hidden = true;
    S.spotPick = p.short; openLinkUp(nearbySorted()[0]?.id || 'ananya');
  };
}

/* ---------- Explore ---------- */
function renderExplore() {
  const lb = Social.leaderboard([...FRIENDS, ...livePeople()], S.visited.length);
  const moments = Social.moments();
  const ago = (t) => { const h = Math.floor((Date.now() - t) / 36e5); return h < 1 ? 'just now' : h + 'h ago'; };
  $('#exploreGrid').innerHTML = `
    <div class="card" style="grid-column:1/-1"><h3>⚡ Moments <small class="muted">· expire in 24h</small></h3>
      <form id="momentForm" style="display:flex;gap:8px;margin:8px 0"><input id="momentIn" maxlength="140" placeholder="What's the vibe on campus?" autocomplete="off" style="flex:1;background:#ffffff0c;border:1px solid var(--line);border-radius:12px;padding:10px 12px;color:#fff;outline:0" /><button class="btn-primary sm">Post</button></form>
      <div>${moments.slice(0, 5).map((m) => `<div class="moment"><strong>${m.author}</strong> <span class="tag">${(PLACES.find((p) => p.id === m.placeId)?.short) || 'NSUT'}</span><p>${m.text}</p><small class="muted">${ago(m.t)}</small></div>`).join('') || '<p class="muted">No moments yet — post the first one 👆</p>'}</div></div>
    <div class="card"><h3>🏆 Campus leaderboard</h3>
      ${lb.slice(0, 5).map((r, i) => `<div class="row" style="gap:8px;margin-top:6px"><strong>${['🥇', '🥈', '🥉', '4.', '5.'][i]}</strong><span style="flex:1">${r.name}${r.me ? ' (you)' : ''} <small class="muted">· ${r.detail}</small></span><strong style="color:var(--lime)">${r.score}</strong></div>`).join(''}</div>
  ` + TRAILS.map((t) => `<div class="card"><div class="row"><div style="flex:1"><h3>${t.title}</h3><small>${t.meta}</small></div><strong style="color:var(--lime)">${t.pct}%</strong></div>
    <p class="muted">${t.desc}</p>
    <div style="height:8px;border-radius:99px;background:#ffffff14;overflow:hidden"><i style="display:block;height:100%;width:${t.pct}%;background:var(--grad)"></i></div>
    <button class="mini-btn go" style="margin-top:10px" data-trail="${t.title}">Continue →</button></div>`).join('');
  $$('[data-trail]').forEach((b) => (b.onclick = () => toast(`Trail started: ${b.dataset.trail} 🗺️ — check in at each stop!`)));
  $('#momentForm').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#momentIn').value.trim();
    if (!v) return;
    Social.postMoment(v, 'moksha-ground', myName());
    renderExplore();
    toast('Moment posted ⚡');
  };
}
$('#startTrail').onclick = () => toast('First-Year Survival Trail started! First stop: SAC 🛸');

/* ---------- Events (+ Moksha strip) ---------- */
function renderEvents() {
  const fs = festivalState('Moksha');
  const strip = $('#mokshaStrip');
  if (fs === 'live' || fs === 'upcoming') {
    const ev = fs === 'live' ? liveEvent('Moksha') : nextEvent('Moksha');
    strip.innerHTML = `<div class="mk-strip"><div style="font-size:30px">🎭</div>
      <div class="grow"><strong>MOKSHA ${fs === 'live' ? '· 🟢 LIVE NOW' : ''}</strong><br><small class="muted">${ev ? ev.name + ' · 📍 ' + (ev.verified ? ev.venue_name : 'Venue TBA') : 'NSUT Cultural Festival'}</small></div>
      <button class="mini-btn go" id="stripOpen">Open hub</button>
      ${ev && ev.campus_x != null ? '<button class="mini-btn" id="stripMap">Map</button>' : ''}</div>`;
    $('#stripOpen').onclick = openMokshaHub;
    $('#stripMap') && ($('#stripMap').onclick = () => { go('map'); setMokshaFilter(true, false); map.focusMoksha(ev); openMokshaCard(ev.id); });
  } else strip.innerHTML = '';

  if (S.eventFilter === 'moksha') {
    const list = EventStore.ofFestival('Moksha').sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    $('#eventsList').innerHTML = list.map((ev) => {
      const st = statusLabel(ev);
      const mappable = ev.verified && ev.campus_x != null;
      return `<div class="card"><div class="row"><div style="font-size:28px">🎭</div>
        <div style="flex:1"><h3>${catEmoji(ev.category)} ${ev.name}</h3><small>${fmtRange(ev)} · 📍 ${mappable ? ev.venue_name : 'Venue TBA'}</small></div>
        <span class="pill ${st.cls}">${st.icon} ${st.text}</span></div>
        <p class="muted" style="margin:8px 0">${ev.description || ''}</p>
        <div class="row" style="gap:8px"><span class="muted">👥 ${interestCount(ev)}</span><span style="flex:1"></span>
        <button class="mini-btn" data-mopen="${ev.id}">Details</button>
        ${mappable ? `<button class="mini-btn go" data-mmap="${ev.id}">View on Map</button>` : ''}</div></div>`;
    }).join('') || `<div class="card">No Moksha events published.</div>`;
    $$('#eventsList [data-mopen]').forEach((b) => (b.onclick = () => openMokshaCard(b.dataset.mopen)));
    $$('#eventsList [data-mmap]').forEach((b) => (b.onclick = () => {
      const ev = EventStore.get(b.dataset.mmap);
      go('map'); setMokshaFilter(true, false); map.focusMoksha(ev); openMokshaCard(ev.id);
    }));
    return;
  }
  let list = [...EVENTS];
  if (S.eventFilter === 'today') list = list.filter((e) => e.day === 'Today');
  if (S.eventFilter === 'rsvp') list = list.filter((e) => S.rsvp.includes(e.id));
  $('#eventsList').innerHTML = list.map((e) => `<div class="card"><div class="row">
    <div class="ev-date"><div style="font-size:18px">${e.date}</div><small>${e.mon}</small></div>
    <div style="flex:1"><h3>${e.emoji} ${e.title}</h3><small>${e.time} · ${e.going + (S.rsvp.includes(e.id) ? 1 : 0)} going</small></div>
    ${e.hot ? '<span class="tag hot">🔥 hot</span>' : `<span class="tag">${e.tag}</span>`}</div>
    <div class="row" style="margin-top:10px;gap:8px"><span class="muted">${e.org}</span><span style="flex:1"></span>
    <button class="mini-btn ${S.rsvp.includes(e.id) ? '' : 'go'}" data-rsvp="${e.id}">${S.rsvp.includes(e.id) ? '✓ Going' : 'RSVP'}</button></div></div>`).join('')
    || `<div class="card">No events here. Check “All”. ✨</div>`;
  $$('[data-rsvp]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.rsvp;
    if (S.rsvp.includes(id)) S.rsvp = S.rsvp.filter((x) => x !== id);
    else { S.rsvp.push(id); toast('You’re on the list! See you there 🎉'); }
    persist(); renderEvents(); $('#statEvents').textContent = S.rsvp.length;
  }));
}
$$('#eventSeg button').forEach((b) => (b.onclick = () => {
  $$('#eventSeg button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); S.eventFilter = b.dataset.e; renderEvents();
}));

/* ---------- Admin / organizer ---------- */
$('#adminBtn').onclick = () => {
  $('#adminModal').hidden = false;
  $('#adminGate').hidden = isOrganizer();
  $('#adminPanel').hidden = !isOrganizer();
  if (isOrganizer()) renderAdmin();
};
$('#adminForm0').onsubmit = (e) => {
  e.preventDefault();
  if (organizerLogin($('#adminCode').value)) {
    $('#adminGate').hidden = true; $('#adminPanel').hidden = false;
    renderAdmin(); toast('Organizer mode unlocked ⚙');
  } else toast('Wrong code — organizers only.');
};
$('#adminLogout').onclick = () => { organizerLogout(); $('#adminGate').hidden = false; $('#adminPanel').hidden = true; };
function renderAdmin() {
  $('#adCat').innerHTML = CATEGORIES.map((c) => `<option>${c.id}</option>`).join('');
  $('#adVenue').innerHTML = `<option value="">Venue TBA (unverified)</option>` + VENUES.map((v) => `<option value="${v.id}">📍 ${v.name}</option>`).join('');
  const list = EventStore.all().sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  $('#adminList').innerHTML = list.map((ev) => {
    const st = statusLabel(ev);
    return `<div class="mk-ev"><h4>${ev.name}</h4>
      <div class="meta"><span class="pill ${st.cls}">${st.icon} ${st.text}</span><span>${ev.published ? '● published' : '○ draft'}</span><span>${ev.verified && ev.campus_x != null ? '📍 ' + ev.venue_name : 'Venue TBA'}</span></div>
      <div class="row"><button class="mini-btn" data-edit="${ev.id}">Edit</button>
      <button class="mini-btn" data-pub="${ev.id}">${ev.published ? 'Unpublish' : 'Publish'}</button>
      <button class="mini-btn" data-del="${ev.id}">Delete</button></div></div>`;
  }).join('');
  $$('#adminList [data-edit]').forEach((b) => (b.onclick = () => {
    const ev = EventStore.get(b.dataset.edit);
    $('#adId').value = ev.id; $('#adName').value = ev.name; $('#adCat').value = ev.category;
    $('#adVenue').value = ev.venue_id || '';
    $('#adStart').value = toLocal(ev.start_time); $('#adEnd').value = toLocal(ev.end_time);
    $('#adDesc').value = ev.description || '';
    $('#adCrowd').value = ev.crowd || '';
    $('#adVer').checked = !!ev.verified; $('#adPub').checked = !!ev.published;
    $('#adName').focus();
  }));
  $$('#adminList [data-pub]').forEach((b) => (b.onclick = () => {
    const ev = EventStore.get(b.dataset.pub);
    EventStore.setPublished(ev.id, !ev.published);
    changed(); renderAdmin(); renderEvents(); refreshMokshaHome();
  }));
  $$('#adminList [data-del]').forEach((b) => (b.onclick = () => {
    if (!confirm('Delete this event?')) return;
    EventStore.remove(b.dataset.del);
    changed(); renderAdmin(); renderEvents(); refreshMokshaHome();
  }));
}
function toLocal(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
$('#adReset').onclick = () => { $('#adminForm').reset(); $('#adId').value = ''; };
$('#adminForm').onsubmit = (e) => {
  e.preventDefault();
  const venue = venueById($('#adVenue').value);
  const verified = $('#adVer').checked && !!venue;
  const ev = {
    id: $('#adId').value || 'mok-' + Date.now().toString(36),
    name: $('#adName').value.trim(),
    category: $('#adCat').value,
    festival: 'Moksha',
    venue_name: venue ? venue.name : 'Venue TBA',
    venue_id: venue ? venue.id : null,
    campus_x: verified ? venue.x : null,
    campus_y: verified ? venue.y : null,
    latitude: verified ? 28.6126 - venue.y * 8.1e-6 : null,
    longitude: verified ? 77.0289 + venue.x * 8.6e-6 : null,
    start_time: new Date($('#adStart').value).toISOString(),
    end_time: new Date($('#adEnd').value).toISOString(),
    description: $('#adDesc').value.trim(),
    verified, published: $('#adPub').checked,
    crowd: $('#adCrowd').value || null, interested_base: 0,
  };
  if (new Date(ev.end_time) <= new Date(ev.start_time)) { toast('End must be after start ⏰'); return; }
  EventStore.upsert(ev);
  changed(); renderAdmin(); renderEvents(); refreshMokshaHome();
  $('#adminForm').reset(); $('#adId').value = '';
  toast(verified ? 'Published with verified venue 📍' : 'Saved as Venue TBA — no map pin until verified.');
};
function changed() { window.dispatchEvent(new Event('linkup-events-changed')); }

/* ---------- Messages ---------- */
function pushMsg(fid, from, text) {
  (S.inbox[fid] = S.inbox[fid] || []).push({ from, text, t: nowT() });
  if (from === 'them' && S.activeChat !== fid) S.unread[fid] = (S.unread[fid] || 0) + 1;
  persist(); renderThreads();
  if (S.activeChat === fid) renderChat();
}
function nowT() { const d = new Date(); let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0'); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m} ${ap}`; }
function renderThreads() {
  const ids = Object.keys(S.inbox);
  const total = Object.values(S.unread).reduce((a, b) => a + b, 0);
  for (const id of ['msgBadge', 'msgBadgeSide']) {
    const el = document.getElementById(id);
    if (el) { el.hidden = !total; el.textContent = total; }
  }
  $('#threadList').innerHTML = ids.map((id) => {
    const f = getPerson(id) || { name: id, grad: 'var(--grad)', short: '?' };
    const last = S.inbox[id].at(-1);
    return `<button class="thread ${S.activeChat === id ? 'active' : ''}" data-th="${id}">
      <span class="avatar" style="background:${f.grad}">${(f.short || '?').slice(0, 1)}</span>
      <span class="t"><strong>${f.name} ${S.unread[id] ? `<span class="unread">${S.unread[id]}</span>` : ''}</strong><small>${last?.text || ''}</small></span></button>`;
  }).join('');
  $$('#threadList [data-th]').forEach((b) => (b.onclick = () => openChat(b.dataset.th)));
}
function openChat(fid) {
  const f = getPerson(fid);
  if (!f) return;
  S.activeChat = fid;
  S.unread[fid] = 0; persist();
  $('#chatEmpty').hidden = true; $('#chatActive').hidden = false;
  $('#chatName').textContent = f.name;
  $('#chatAvatar').textContent = (f.short || '?').slice(0, 1);
  $('#chatAvatar').style.background = f.grad;
  $('#chatStatus').textContent = f.online ? `● live · ${f.spot}` : '○ offline';
  $('#quickReplies').innerHTML = QUICK.map((q) => `<button>${q}</button>`).join('');
  $$('#quickReplies button').forEach((b) => (b.onclick = () => sendChat(b.textContent)));
  if (f.live && Net.live) {
    $('#chatBubbles').innerHTML = '<p class="muted">Loading live thread…</p>';
    Net.history(fid).then((h) => { S.inbox[fid] = h; persist(); if (S.activeChat === fid) renderChat(); });
  }
  renderThreads(); renderChat();
}
function renderChat() {
  const box = $('#chatBubbles');
  box.innerHTML = (S.inbox[S.activeChat] || []).map((m) => `<div class="bub ${m.from === 'me' ? 'me' : 'them'}">${m.text}<small>${m.t}</small></div>`).join('');
  box.scrollTop = box.scrollHeight;
}
function sendChat(text) {
  text = (text || '').trim(); if (!text || !S.activeChat) return;
  const fid = S.activeChat;
  pushMsg(fid, 'me', text);
  $('#chatInput').value = '';
  if (getPerson(fid)?.live && Net.live) { Net.sendChat(fid, text); return; } // server delivers
  const replies = ['Bet 😎', 'On my way!!', 'Haha fr', 'SAC in 10? ⚡', 'Okay okay, link up? 🤝'];
  setTimeout(() => { if (S.activeChat) pushMsg(fid, 'them', replies[Math.floor(Math.random() * replies.length)]); }, 1600);
}
$('#chatForm').onsubmit = (e) => { e.preventDefault(); sendChat($('#chatInput').value); };
$('#chatBack').onclick = () => { S.activeChat = null; $('#chatActive').hidden = true; $('#chatEmpty').hidden = false; renderThreads(); };
$('#chatLinkUp').onclick = () => openLinkUp(S.activeChat);
$('#chatBack').style.display = 'none';
if (matchMedia('(max-width:959px)').matches) $('#chatBack').style.display = '';

/* ---------- Search ---------- */
const searchBox = $('#searchResults');
$('#globalSearch').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (q.length < 2) { searchBox.hidden = true; return; }
  const fh = FRIENDS.filter((f) => f.name.toLowerCase().includes(q)).map((f) => ({ t: 'friend', label: `${f.name} · ${f.spot}`, go: () => openLinkUp(f.id) }));
  const ph = PLACES.filter((p) => p.name.toLowerCase().includes(q)).map((p) => ({ t: 'place', label: `${p.emoji} ${p.name}`, go: () => openPlace(p.id) }));
  const eh = EVENTS.filter((ev) => ev.title.toLowerCase().includes(q)).map((ev) => ({ t: 'event', label: `✧ ${ev.title}`, go: () => { go('events'); } }));
  const mh = EventStore.ofFestival('Moksha').filter((ev) => ev.name.toLowerCase().includes(q)).map((ev) => ({ t: 'moksha', label: `🎭 ${ev.name}`, go: () => openMokshaCard(ev.id) }));
  const all = [...mh, ...fh, ...ph, ...eh].slice(0, 8);
  searchBox.innerHTML = all.length ? all.map((r, i) => `<button data-r="${i}"><span class="tag">${r.t}</span> ${r.label}</button>`).join('') : `<div style="padding:14px" class="muted">No matches for “${q}”.</div>`;
  searchBox.hidden = false;
  $$('[data-r]', searchBox).forEach((b) => (b.onclick = () => { searchBox.hidden = true; $('#globalSearch').value = ''; all[+b.dataset.r].go(); }));
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== $('#globalSearch') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); $('#globalSearch').focus(); }
  if (e.key === 'Escape') { searchBox.hidden = true; $$('.modal').forEach((m) => (m.hidden = true)); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('#searchResults') && !e.target.closest('.search-wrap')) searchBox.hidden = true; });

/* ---------- Profile ---------- */
function openProfile() {
  $('#statFriends').textContent = FRIENDS.length;
  $('#statPlaces').textContent = S.visited.length;
  $('#statEvents').textContent = S.rsvp.length;
  $('#profileNameIn').value = myName();
  $('#profileDeptIn').value = S.profile.dept || '';
  $('#profileBioIn').value = S.profile.bio || '';
  $('#ntLinkup').checked = Notify.prefs.linkup;
  $('#ntMoksha').checked = Notify.prefs.moksha;
  $('#profileNote').textContent = Net.live ? 'Name change rejoins the live server (page reloads).' : '';
  applyProfileToUI();
  $('#profileModal').hidden = false;
}
$('#profileSave').onclick = () => {
  const name = ($('#profileNameIn').value.trim() || 'Aditya').slice(0, 24);
  const dept = $('#profileDeptIn').value.trim().slice(0, 16) || "CSE '27";
  const bio = $('#profileBioIn').value.trim().slice(0, 80);
  const changed = name !== S.profile.name;
  S.profile = { name, dept, bio };
  persist(); applyProfileToUI();
  $('#profileModal').hidden = true;
  if (changed && Net.live) {
    try { localStorage.removeItem('linkup.live.cred'); } catch {}
    toast('Profile saved — rejoining live server…');
    setTimeout(() => location.reload(), 800);
  } else toast('Profile saved ✅');
};
$('#profileBtn').onclick = openProfile;
$('#profileLinkUp').onclick = () => { $('#profileModal').hidden = true; go('friends'); };

/* ---------- PWA install ---------- */
let deferred;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferred = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').onclick = async () => {
  if (!deferred) return;
  deferred.prompt(); await deferred.userChoice;
  deferred = null; $('#installBtn').hidden = true;
};

/* ---------- boot ---------- */
const renderers = { map: () => { renderSheet(); refreshMokshaHome(); }, friends: renderFriends, nearby: renderNearby, places: renderPlaces, explore: renderExplore, events: renderEvents, messages: renderThreads };
function boot() {
  updateNetPill();
  Net.on('mode', () => { updateNetPill(); refreshLivePins(); renderSheet(); if (S.view === 'friends') renderFriends(); });
  Net.on('roster', () => {
    refreshLivePins();
    if (S.view === 'map') renderSheet();
    if (S.view === 'friends') renderFriends();
    if (S.view === 'nearby') renderNearby();
  });
  Net.on('linkup_request', (m) => {
    if (S.ghost || S.session) return;
    S.liveReq = { from: m.from, spot: m.spot, durMin: m.durMin };
    showIncoming(m.from); // live requests preempt any open mock popup
    toast(`⚡ ${(getPerson(m.from)?.name || 'Someone').split(' ')[0]} wants to link up (live).`);
  });
  Net.on('linkup_accept', (m) => { S.outgoing = null; startSession(m.from, m.spot, 0, 'outgoing', m.endsAt ?? null); });
  Net.on('linkup_decline', () => { S.outgoing = null; persist(); renderFriends(); toast('They declined — another time 🤙'); });
  Net.on('linkup_expired', () => { S.outgoing = null; persist(); renderFriends(); toast('Live request expired ⏳'); });
  Net.on('session_end', (m) => endSession(m.expired ? 'Live Link Up ended ⏳' : 'They ended the hangout.', true));
  Net.on('chat', (m) => pushMsg(m.from, 'them', m.text));
  Net.init({ name: myName(), dept: S.profile.dept }).then((live) => {
    if (live) { toast('⚡ Connected to live server — real people, real requests.'); refreshLivePins(); }
  });
  setInterval(() => {
    if (!Net.live && !document.hidden) Net.init({ name: myName(), dept: S.profile.dept }); // silent auto-retry
  }, 25000);
  $('#netPill').onclick = () => { renderDebug(); $('#debugModal').hidden = false; };
  $('#debugRetry').onclick = () => {
    toast('Looking for live server…');
    Net.init({ name: myName(), dept: S.profile.dept }).then(() => renderDebug());
  };
  $('#debugReset').onclick = () => {
    try { localStorage.removeItem('linkup.live.cred'); } catch {}
    toast('Identity cleared — rejoining…');
    setTimeout(() => location.reload(), 600);
  };
  $('#debugCopy').onclick = () => {
    const txt = $('#debugBody').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Debug copied 📋'));
  };
  applyProfileToUI();
  setGhost(S.ghost);
  $('#statEvents').textContent = S.rsvp.length;
  const start = (location.hash || '#/map').replace('#/', '');
  go(VIEWS.includes(start) ? start : 'map');
  renderSheet(); renderThreads(); updateBanner(); refreshMokshaHome();
  if (S.session) tickLinked();
  $('#sideStats').textContent = `${FRIENDS.filter((f) => f.online).length} friends live · ${PLACES.length} spots`;
  setInterval(() => {
    if (document.hidden || S.ghost) return;
    const f = FRIENDS[Math.floor(Math.random() * 3)];
    f.dist = Math.max(40, f.dist + Math.floor(Math.random() * 41) - 20);
    if (S.view === 'map') renderSheet();
  }, 15000);
}
boot();
