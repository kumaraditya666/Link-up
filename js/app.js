/* Link Up — NSUT, but connected. App controller (map + social + Moksha live layer) build 6 */
import { ME, SPOTS, FRIENDS, PLACES, EVENTS, TRAILS, THREADS, QUICK, BUILDINGS } from './data.js';
import { createMap } from './map.js';
import { route, spotXY, sessionStats } from './route.js';
import { Geo } from './geo.js';
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
  attendMine: store.get('attendMine', []),
  group: null, groupInvites: [], groupNames: {}, groupSpot: 'Moksha Ground', groupDur: 60,
  sessionRoute: false, groupRoute: false,
  gpsPref: store.get('gps', false),
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
    `build: 25 · mode: ${Net.mode.toUpperCase()} · ghost: ${S.ghost ? 'ON' : 'off'}`,
    `server: ${Net.base || '(none)'}`,
    `me: ${Net.me ? `${Net.me.name} (${Net.me.id})` : '(not joined)'}`,
    `profile: ${myName()} · ${S.profile.dept}`,
    `roster: ${Net.roster.length} other(s)`,
    ...Net.roster.map((u) => `  - ${u.name} [${u.id}] ${u.bot ? '(bot)' : '(human)'} @${u.x},${u.y}`),
    `session: ${S.session ? S.session.withName + ' ' + S.session.spot : '(none)'} · outgoing: ${S.outgoing ? S.outgoing.toId : '(none)'}`,
    `outbox: ${Net.outbox().length} queued`,
    `gps: ${Geo.watching ? `ON ${Geo.last ? `@${Geo.last.x},${Geo.last.y} ±${Geo.last.accuracy}m` : ''}` : 'off'}${S.ghost ? ' (ghosted)' : ''}`,
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
  store.set('profile', S.profile); store.set('attendMine', S.attendMine);
}
function attendLabel(ev) {
  const mine = S.attendMine.includes(ev.id);
  if (Net.live) {
    const n = Net.attendance[ev.id] || 0;
    return mine ? `🙋 ${n} here · you’re in ✓` : `🙋 ${n} here · I’m here`;
  }
  return mine ? '🙋 You’re in! ✓' : '🙋 I’m here';
}
async function toggleAttend(ev) {
  if (Net.live) {
    const r = await Net.attend(ev.id);
    if (r.data.ok) {
      if (r.data.here && !S.attendMine.includes(ev.id)) S.attendMine.push(ev.id);
      if (!r.data.here) S.attendMine = S.attendMine.filter((x) => x !== ev.id);
      persist();
      toast(r.data.here ? `Checked in at ${ev.name} 🙋` : 'Checked out.');
    }
    return;
  }
  if (S.attendMine.includes(ev.id)) S.attendMine = S.attendMine.filter((x) => x !== ev.id);
  else { S.attendMine.push(ev.id); toast(`Marked yourself at ${ev.name} 🙋 (offline)`); }
  persist();
  if (!$('#mokshaHub').hidden) renderMokshaHub();
  if (!$('#mokshaCard').hidden) fillMokshaCard(ev);
}

/* ---------- toasts ---------- */
function toast(msg, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms);
}

/* ---------- tactile interactions: card tilt + magnetic buttons ---------- */
if (matchMedia('(hover:hover)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.card');
    $$('.card.tilting').forEach((c) => { if (c !== card) { c.classList.remove('tilting'); c.style.transform = ''; } });
    if (card) {
      const r = card.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - 0.5) * -5;
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 5;
      card.classList.add('tilting');
      card.style.transform = `perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-3px)`;
    }
    const mag = e.target.closest?.('.btn-primary, .mini-btn.go, #sheetLinkUp, #sideLinkUp');
    $$('.magnet').forEach((m) => { if (m !== mag) { m.classList.remove('magnet'); m.style.transform = ''; } });
    if (mag && !mag.disabled) {
      const r = mag.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      mag.classList.add('magnet');
      mag.style.transform = `translate(${(dx * 3).toFixed(1)}px, ${(dy * 3).toFixed(1)}px)`;
    }
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest?.('.card.tilting, .magnet');
    if (t) { t.classList.remove('tilting', 'magnet'); t.style.transform = ''; }
  });
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
const map = createMap($('#campusMap'), { onSelect, onHover });
function onHover(hit, x, y) {
  const tip = $('#hoverTip');
  const cv = $('#campusMap');
  if (!hit || hit.kind === 'moksha') {
    tip.hidden = true;
    if (cv) cv.style.cursor = hit ? 'pointer' : 'grab';
    return;
  }
  let name = null;
  if (hit.kind === 'friend') name = getPerson(hit.id)?.name.split(' ')[0];
  else if (hit.kind === 'place') name = BUILDINGS.find((b) => b.id === hit.id)?.label || hit.id;
  if (!name) { tip.hidden = true; return; }
  tip.textContent = name;
  tip.hidden = false;
  tip.style.left = Math.min(window.innerWidth - 130, x + 14) + 'px';
  tip.style.top = Math.max(70, y - 14) + 'px';
  if (cv) cv.style.cursor = 'pointer';
}
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
    if (b) { const d = (map.state && map.state.cam && map.state.cam.dist) || 900; map.flyTo(b.x, b.y, { dist: Math.min(d, 620) }); }
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
$('#locateBtn').onclick = async () => {
  if (!S.gpsPref && !S.ghost) await setGPS(true);
  map.locate();
  if (Geo.watching && Geo.last) {
    toast(Geo.last.offCampus ? '📍 You look off-campus — dot parked at the edge' : `📍 Live fix ±${Geo.last.accuracy}m — this is really you`);
  } else {
    toast('📍 Pinned default spot — enable GPS in Profile to track yourself');
  }
};
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
  $('#mokshaAttend').textContent = attendLabel(ev);
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
$('#mokshaAttend').onclick = async () => {
  const ev = EventStore.get(S.mokshaCardId);
  if (!ev) return;
  await toggleAttend(ev);
  fillMokshaCard(ev);
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
      <button class="mini-btn" data-att="${ev.id}">${attendLabel(ev)}</button>
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
  $$('#mokshaList [data-att]').forEach((b) => (b.onclick = async () => {
    const ev = EventStore.get(b.dataset.att);
    await toggleAttend(ev);
    if (!$('#mokshaHub').hidden) renderMokshaHub();
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
function navigateToPlace(pid) {
  const b = BUILDINGS.find((x) => x.id === pid);
  if (!b) return;
  let r = null;
  try { r = route([map.mePos.x, map.mePos.y], [b.x, b.y]); } catch {}
  if (!r) { toast('No route found 🗺️'); return; }
  map.setRoute({ pts: r.pts, to: { x: b.x, y: b.y } });
  $('#dirDest').textContent = b.label;
  $('#dirMeta').textContent = `≈${r.meters} m · ~${r.mins} min walk · ${r.approximate ? 'Approximate route' : 'via campus roads'}`;
  $('#dirSteps').innerHTML = r.steps.map((s, i) => `<li><strong>${i + 1}.</strong> ${s.text}${s.meters ? ` <span>· ${s.meters} m</span>` : ''}</li>`).join('');
  $('#dirBar').hidden = false;
  go('map');
}

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
    <div class="card" style="border-color:#b7ff2a55"><div class="row"><span class="avatar" style="background:${f.grad}">${f.short.slice(0, 1)}</span>
      <div style="flex:1"><h3>${f.name} ${f.bot ? '<small>🤖</small>' : ''}</h3><small>${f.dept} · ${f.spot} · ${f.dist} m</small></div>
      <span class="dot on"></span></div>
      <p class="muted" style="margin:8px 0">${f.vibe}</p>
      <div class="row" style="gap:8px"><span class="pill live">● live</span><span style="flex:1"></span>
      <button class="mini-btn" data-chat="${f.id}">Chat</button>
      <button class="mini-btn go" data-lu="${f.id}" ${S.ghost ? 'disabled title="Ghosted"' : ''}>Link Up ⚡</button>
      <button class="mini-btn" data-block="${f.id}" title="Block ${f.name}">⛔</button></div></div>`).join('') : '';
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
  $$('[data-block]', grid).forEach((b) => (b.onclick = async () => {
    const p = getPerson(b.dataset.block);
    if (!p || !confirm(`Block ${p.name}? You’ll stop seeing each other.`)) return;
    await Net.blockUser(p.id, true);
    toast(`Blocked ${p.name.split(' ')[0]}.`);
    if (S.view === 'friends') renderFriends();
  }));
  const inc = [...S.incomingQueue.map((q) => ({ ...q, pending: true })), ...S.incoming];
  const ginv = S.groupInvites.map((g) => `<div class="incoming-card"><span class="avatar" style="background:#1b212c;border-color:#f5b83d66">👥</span>
      <div class="grow"><strong>Group link up at ${g.spot}.</strong><small>${g.members.map((m) => m.name.split(' ')[0]).join(', ')}</small></div>
      <button class="mini-btn" data-gdec="${g.id}">Decline</button>
      <button class="mini-btn go" data-gjoin="${g.id}">Join</button></div>`).join('');
  $('#incomingWrap').hidden = !inc.length && !S.groupInvites.length;
  $('#incomingCount').textContent = (inc.length + S.groupInvites.length) ? `(${inc.length + S.groupInvites.length})` : '';
  $('#incomingList').innerHTML = inc.map((q) => {
    const f = FRIENDS.find((x) => x.id === q.id);
    return `<div class="incoming-card"><span class="avatar" style="background:${f.grad}">${f.short.slice(0, 1)}</span>
      <div class="grow"><strong>${f.name.split(' ')[0]} wants to link up.</strong><small>${q.spot} · ${q.dist} m away</small></div>
      <button class="mini-btn" data-dec="${q.id}">Decline</button>
      <button class="mini-btn go" data-acc="${q.id}">Accept</button></div>`;
  }).join('');
  $$('[data-dec]', $('#incomingList')).forEach((b) => (b.onclick = () => declineIncoming(b.dataset.dec)));
  $$('[data-acc]', $('#incomingList')).forEach((b) => (b.onclick = () => acceptIncoming(b.dataset.acc)));
  $('#incomingList').insertAdjacentHTML('afterbegin', ginv);
  $$('#incomingList [data-gdec]').forEach((b) => (b.onclick = () => { S.groupInvites = S.groupInvites.filter((g) => g.id !== b.dataset.gdec); renderFriends(); toast('Declined the group invite.'); }));
  $$('#incomingList [data-gjoin]').forEach((b) => (b.onclick = async () => {
    const r = await Net.groupJoin(b.dataset.gjoin);
    if (r.data.ok) {
      S.groupInvites = S.groupInvites.filter((g) => g.id !== b.dataset.gjoin);
      setGroup(r.data.group);
      toast('👥 Joined the group!');
    } else toast(r.data.error === 'already linked' ? 'Finish your current hangout first 🤝' : 'That group expired ⏳');
  }));
  const hist = Social.history();
  if (hist.length) {
    const st = Social.recapStats(hist);
    const when = (t) => { const d = Math.floor((Date.now() - t) / 864e5); return d < 1 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago'; };
    grid.innerHTML += `<h2 style="grid-column:1/-1;margin:10px 2px 0">Recent hangouts <span class="muted">· ${st.total} total${st.favSpot ? ` · fav: ${st.favSpot}` : ''}</span></h2>` + hist.slice(0, 4).map((h) => `
      <div class="card"><div class="row"><span style="font-size:24px">🤝</span>
      <div style="flex:1"><h3>${h.with}</h3><small>${h.spot} · ${h.mins} min · ${when(h.at)}</small></div></div></div>`).join('');
  }
}
$$('.seg [data-f]').forEach((b) => (b.onclick = () => {
  $$('.seg [data-f]').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); S.friendFilter = b.dataset.f; renderFriends();
}));

/* ---------- Link Up flow ---------- */
function openLinkUp(fid) {
  const f = getPerson(fid) || FRIENDS[0];
  if (S.group) { toast('Leave your group first to link up 1-on-1 👥'); return; }
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
    if (r.data.queued) { toast('Offline — request queued 📡, sends on reconnect'); return; }
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
    if (r.data.ok) startSession(fid, r.data.spot, 0, 'incoming', r.data.endsAt ?? null, r.data.spotX != null ? [r.data.spotX, r.data.spotY] : null);
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
function startSession(fid, spot, durMin, dir, endsAtOverride = null, xyOverride = null) {
  const f = getPerson(fid) || { name: 'Someone', short: '?' };
  const [sx, sy] = xyOverride || spotXY(spot);
  S.session = {
    withId: fid, withName: f.name.split(' ')[0], fullName: f.name,
    spot: spot.startsWith('Near') ? spot : `Near ${spot}`,
    spotX: sx, spotY: sy, meNotified: false, peerNotified: false,
    endsAt: endsAtOverride !== null && endsAtOverride !== undefined ? endsAtOverride : (durMin === 0 ? null : Date.now() + durMin * 60 * 1000),
    totalMin: durMin, startedAt: Date.now(), dir,
  };
  S.outgoing = null;
  Social.recordLinkup();
  // live tracking: route from you to the meet spot
  try {
    const r = route([map.mePos.x, map.mePos.y], [sx, sy]);
    if (r) { map.setRoute({ pts: r.pts, to: { x: sx, y: sy } }); S.sessionRoute = true; }
  } catch {}
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
  Social.recordHangout(S.session.withName, S.session.spot, S.session.startedAt);
  S.session = null;
  if (S.sessionRoute) { S.sessionRoute = false; map.setRoute(null); }
  persist(); updateBanner(); renderFriends(); renderSheet();
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
  let sub = S.session.spot;
  if (S.session.spotX != null) {
    const peer = Net.live ? Net.person(S.session.withId) : null;
    const st = sessionStats(map.mePos.x, map.mePos.y, peer, S.session.spotX, S.session.spotY);
    if (st.meArrived && !S.session.meNotified) { S.session.meNotified = true; persist(); toast(`You arrived at ${S.session.spot} 🎉`); }
    if (st.peerArrived && !S.session.peerNotified) { S.session.peerNotified = true; persist(); toast(`${S.session.withName} arrived at ${S.session.spot} 🎉`); }
    const left = S.session.endsAt ? fmtLeft(S.session.endsAt - Date.now()) + ' left' : 'live until ended';
    sub = st.meArrived && st.peerArrived ? `${S.session.spot} · both here 🎉 · ${left}`
      : st.meArrived ? `${S.session.spot} · you’re here · ${S.session.withName} ${st.peerM ?? '?'}m away`
      : `${S.session.spot} · you ${st.meM}m${peer ? ` · ${S.session.withName} ${st.peerM}m` : ''} · ${left}`;
  } else {
    const left = S.session.endsAt ? fmtLeft(S.session.endsAt - Date.now()) + ' left' : 'live until ended';
    sub = `${S.session.spot} · ${left}`;
  }
  $('#linkupBannerSub').textContent = sub;
}
function fmtLeft(ms) {
  if (ms <= 0) return '00:00';
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
}
setInterval(() => {
  if (S.session?.endsAt && S.session.endsAt - Date.now() <= 0) endSession('Link Up expired ⏳');
  if (S.session) updateBanner();
  if (S.group?.endsAt && S.group.endsAt - Date.now() <= 0) clearGroup('Group link up ended ⏳');
  if (S.group) updateGroupBanner();
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

/* ---------- Group Link Up ---------- */
function groupThreadName(g) { return `👥 ${g.spot}`; }
function openGroupModal() {
  if (!Net.live) { toast('Groups need the live server 📡'); return; }
  if (S.session) { toast('Finish your 1-on-1 hangout first 🤝'); return; }
  if (S.group) { toast('Already in a group 👥'); return; }
  const live = livePeople();
  if (!live.length) { toast('Nobody live right now — wait for the crowd 👀'); return; }
  $('#gSpotPick').innerHTML = SPOTS.map((s, i) => `<button data-s="${s}" class="${i === 0 ? 'active' : ''}">${s}</button>`).join('');
  S.groupSpot = SPOTS[0];
  $$('#gSpotPick button').forEach((b) => (b.onclick = () => {
    $$('#gSpotPick button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); S.groupSpot = b.dataset.s;
  }));
  S.groupDur = 60;
  $$('#gDurPick button').forEach((b) => b.classList.toggle('active', b.dataset.d === '60'));
  $$('#gDurPick button').forEach((b) => (b.onclick = () => {
    $$('#gDurPick button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); S.groupDur = +b.dataset.d;
  }));
  $('#gMembers').innerHTML = live.map((f) => `<label class="switch row" style="font-size:13px"><span style="flex:1">${f.name}${f.bot ? ' 🤖' : ''} <small class="muted">· ${f.spot}</small></span><input type="checkbox" data-gm="${f.id}" ${f.bot ? '' : 'checked'} /><span></span></label>`).join('');
  $('#groupModal').hidden = false;
}
$('#newGroupBtn').onclick = openGroupModal;
$('#createGroup').onclick = async () => {
  const ids = $$('#gMembers [data-gm]:checked').map((c) => c.dataset.gm);
  $('#groupModal').hidden = true;
  const r = await Net.groupCreate(S.groupSpot, S.groupDur);
  if (!r.data.ok) { toast(r.data.error === 'already linked' ? 'Finish your current hangout first 🤝' : 'Could not create group'); return; }
  setGroup(r.data.group);
  toast(`👥 Group created at ${S.group.spot}! Invites sent ⚡`);
  for (const id of ids) Net.groupInvite(S.group.id, id);
};
function setGroup(g) {
  S.group = g;
  S.groupNames['group:' + g.id] = groupThreadName(g);
  updateGroupBanner();
  try {
    const r = route([map.mePos.x, map.mePos.y], [g.spotX, g.spotY]);
    if (r) { map.setRoute({ pts: r.pts, to: { x: g.spotX, y: g.spotY } }); S.groupRoute = true; }
  } catch {}
  if (S.view === 'friends') renderFriends();
}
function clearGroup(msg) {
  S.group = null;
  if (S.groupRoute) { S.groupRoute = false; map.setRoute(null); }
  updateGroupBanner();
  if (S.view === 'friends') renderFriends();
  if (msg) toast(msg);
}
function updateGroupBanner() {
  const b = $('#groupBanner');
  if (!S.group) { b.hidden = true; return; }
  b.hidden = false;
  const names = S.group.members.map((m) => m.name.split(' ')[0]).join(', ');
  const left = S.group.endsAt ? fmtLeft(S.group.endsAt - Date.now()) + ' left' : 'live until ended';
  $('#groupBannerTitle').textContent = `👥 GROUP · ${S.group.members.length}`;
  $('#groupBannerSub').textContent = `${S.group.spot} · ${names} · ${left}`;
}
$('#groupBannerChat').onclick = () => { if (S.group) { openChat('group:' + S.group.id); go('messages'); } };
$('#groupBannerLeave').onclick = async () => {
  if (!S.group) return;
  const g = S.group;
  if (g.host === Net.me?.id) { await Net.groupEnd(g.id); }
  else await Net.groupLeave(g.id);
  clearGroup('Left the group.');
};
function groupPerson(fid) {
  if (!fid.startsWith('group:')) return null;
  const g = S.group && ('group:' + S.group.id) === fid ? S.group : null;
  return {
    id: fid, name: S.groupNames[fid] || (g ? groupThreadName(g) : 'Group hangout'),
    short: '👥', grad: '#1b212c', online: !!g,
    spot: g ? g.spot : 'ended', live: true, group: true,
  };
}

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
  if (v) { Geo.stop(); updateGpsNote(); }
  else if (S.gpsPref) { Geo.start(); updateGpsNote(); }
  persist(); renderNearby(); renderSheet();
  toast(v ? '👻 Ghost Mode on — you’re hidden.' : '⚡ You’re visible — friends can link up!');
}
$('#ghostToggle').onchange = (e) => setGhost(e.target.checked);
$('#ghostToggle2').onchange = (e) => setGhost(e.target.checked);
$('#ntLinkup').onchange = (e) => { const p = Notify.prefs; p.linkup = e.target.checked; Notify.setPrefs(p); if (p.linkup) Notify.ensure().then((ok) => ok && Net.subscribePush()); };
$('#ntMoksha').onchange = (e) => { const p = Notify.prefs; p.moksha = e.target.checked; Notify.setPrefs(p); if (p.moksha) Notify.ensure().then((ok) => ok && Net.subscribePush()); };
$('#ntGps').onchange = (e) => setGPS(e.target.checked);
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
    <div class="row" style="margin-top:8px;gap:6px"><span class="tag">${p.cat}</span>${S.visited.includes(p.id) ? '<span class="tag" style="color:var(--lime);border-color:#b7ff2a55">✓ visited</span>' : '<span class="tag">new</span>'}<span style="flex:1"></span><span class="muted">${p.hours}</span></div></button>`).join('')
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
  const pname = (id) => PLACES.find((p) => p.id === id)?.name || (BUILDINGS.find((b) => b.id === id)?.label) || id;
  $('#exploreGrid').innerHTML = `
    <div class="card" style="grid-column:1/-1"><h3>⚡ Moments <small class="muted">· expire in 24h</small></h3>
      <form id="momentForm" style="display:flex;gap:8px;margin:8px 0"><input id="momentIn" maxlength="140" placeholder="What's the vibe on campus?" autocomplete="off" style="flex:1;background:#ffffff0c;border:1px solid var(--line);border-radius:12px;padding:10px 12px;color:#fff;outline:0" /><button class="btn-primary sm">Post</button></form>
      <div>${moments.slice(0, 5).map((m) => `<div class="moment"><strong>${m.author}</strong> <span class="tag">${(PLACES.find((p) => p.id === m.placeId)?.short) || 'NSUT'}</span><p>${m.text}</p><small class="muted">${ago(m.t)}</small></div>`).join('') || '<p class="muted">No moments yet — post the first one 👆</p>'}</div></div>
    <div class="card"><h3>🏆 Campus leaderboard</h3>
      ${lb.slice(0, 5).map((r, i) => `<div class="row" style="gap:8px;margin-top:6px"><strong>${['🥇', '🥈', '🥉', '4.', '5.'][i]}</strong><span style="flex:1">${r.name}${r.me ? ' (you)' : ''} <small class="muted">· ${r.detail}</small></span><strong style="color:var(--lime)">${r.score}</strong></div>`).join('')}</div>
  ` + TRAILS.map((t) => {
    const pr = Social.trailProgress(t, S.visited);
    const stops = (t.stops || []).map((s) => `<div class="row" style="gap:6px;margin-top:4px;font-size:13px"><span>${S.visited.includes(s) ? '✅' : '◻️'}</span><span style="flex:1">${pname(s)}</span>${!S.visited.includes(s) && pr.next === s ? `<button class="mini-btn go" data-route="${s}">Route →</button>` : ''}</div>`).join('');
    return `<div class="card"><div class="row"><div style="flex:1"><h3>${t.title}</h3><small>${t.meta}</small></div><strong style="color:var(--lime)">${pr.pct}%</strong></div>
    <p class="muted">${t.desc}</p>
    <div style="height:8px;border-radius:99px;background:#ffffff14;overflow:hidden"><i style="display:block;height:100%;width:${pr.pct}%;background:var(--lime)"></i></div>
    ${stops}
    ${pr.complete ? `<p style="color:var(--lime);font-weight:800;margin:8px 0 0">Badge earned: ${t.badge} 🎉</p>` : `<p class="muted" style="margin:8px 0 0">Badge: ${t.badge} · check in at places to progress</p>`}</div>`;
  }).join('');
  $$('#exploreGrid [data-route]').forEach((b) => (b.onclick = () => navigateToPlace(b.dataset.route)));
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

/* ---------- Events (+ Moksha strip + announcements) ---------- */
function dayLabel(iso) {
  const d = new Date(iso), now = new Date();
  const k = (x) => x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate();
  if (k(d) === k(now)) return 'Today';
  if (k(d) === k(new Date(now.getTime() + 864e5))) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function getAnn() { try { return JSON.parse(localStorage.getItem('linkup.announce') || '[]'); } catch { return []; } }
function pushAnn(a) {
  try {
    const l = getAnn().filter((x) => x.id !== a.id);
    l.unshift(a);
    localStorage.setItem('linkup.announce', JSON.stringify(l.slice(0, 10)));
  } catch {}
}
function renderAnnounce() {
  const box = $('#announceBox');
  if (!box) return;
  const list = getAnn().slice(0, 3);
  box.innerHTML = list.map((a) => `<div class="mk-strip" style="border-color:#7dd3fc55"><div style="font-size:24px">📢</div>
    <div class="grow"><strong>Organizers</strong><br><small class="muted">${a.text}</small></div></div>`).join('');
}
function renderEvents() {
  renderAnnounce();
  if (Net.live) Net.fetchAnnounce().then((l) => {
    try { localStorage.setItem('linkup.announce', JSON.stringify(l.slice(0, 10))); } catch {}
    if (S.view === 'events') renderAnnounce();
  }).catch(() => {});
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
    let lastDay = '';
    $('#eventsList').innerHTML = list.map((ev) => {
      const day = dayLabel(ev.start_time);
      const head = day !== lastDay ? `<h2 style="grid-column:1/-1;margin:6px 2px 0">📅 ${day}</h2>` : '';
      lastDay = day;
      const st = statusLabel(ev);
      const mappable = ev.verified && ev.campus_x != null;
      return head + `<div class="card"><div class="row"><div style="font-size:28px">🎭</div>
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
  $('#adminReports').innerHTML = '';
  if (Net.live) {
    Net.adminReports().then((reps) => {
      if (!reps.length) return;
      const ago = (t) => { const h = Math.floor((Date.now() - t) / 36e5); return h < 1 ? 'just now' : h + 'h ago'; };
      $('#adminReports').innerHTML = `<h3 style="margin:10px 0 6px">🛡️ Reports (${reps.length})</h3>` + reps.slice(0, 10).map((r) => `
        <div class="mk-ev"><h4>${r.aboutName} <small class="muted">reported by ${r.fromName}</small></h4>
        <p>${r.reason || '(no reason)'}</p><small class="muted">${ago(r.at)}</small>
        <div class="row"><button class="mini-btn" data-breblock="${r.about}">Block user</button></div></div>`).join('');
      $$('#adminReports [data-breblock]').forEach((b) => (b.onclick = async () => { await Net.blockUser(b.dataset.breblock, true); toast('User blocked campus-wide from your view.'); }));
    }).catch(() => {});
  }
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
    const f = getPerson(id) || groupPerson(id) || { name: id, grad: '#232b3d', short: '?' };
    const last = S.inbox[id].at(-1);
    return `<button class="thread ${S.activeChat === id ? 'active' : ''}" data-th="${id}">
      <span class="avatar" style="background:${f.grad}">${(f.short || '?').slice(0, 1)}</span>
      <span class="t"><strong>${f.name} ${S.unread[id] ? `<span class="unread">${S.unread[id]}</span>` : ''}</strong><small>${last?.text || ''}</small></span></button>`;
  }).join('');
  $$('#threadList [data-th]').forEach((b) => (b.onclick = () => openChat(b.dataset.th)));
}
function openChat(fid) {
  const f = getPerson(fid) || groupPerson(fid);
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
  if (fid.startsWith('group:')) {
    pushMsg(fid, 'me', text);
    $('#chatInput').value = '';
    if (Net.live) Net.groupChat(fid.slice(6), text);
    return;
  }
  pushMsg(fid, 'me', text);
  $('#chatInput').value = '';
  if (getPerson(fid)?.live && Net.live) {
    Net.sendChat(fid, text).then((r) => { if (r.code === 400) toast('Not delivered — you may be blocked.'); });
    return;
  } // server delivers
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

/* ---------- Onboarding + settings ---------- */
const OB_STEPS = [
  { e: '🗺️', t: 'YOUR CAMPUS IN 3D', x: 'Drag to explore NSUT — friends, venues and fest grounds, live.' },
  { e: '⚡', t: 'LINK UP', x: 'Send a hangout, get an accept, meet at the spot. Temporary by design.' },
  { e: '🎭', t: 'MOKSHA LIVE', x: 'Events, routes, check-ins and announcements — the fest layer.' },
];
let obStep = 0;
function showOnboard() {
  obStep = 0;
  paintOb();
  $('#onboardModal').hidden = false;
}
function paintOb() {
  const s = OB_STEPS[obStep];
  $('#obEmoji').textContent = s.e;
  $('#obTitle').textContent = s.t;
  $('#obText').textContent = s.x;
  $('#obDots').textContent = OB_STEPS.map((_, i) => (i === obStep ? '●' : '○')).join(' ');
  $('#obNext').textContent = obStep === OB_STEPS.length - 1 ? 'Start ⚡' : 'Next →';
}
function hideOnboard() {
  $('#onboardModal').hidden = true;
  try { localStorage.setItem('linkup.onboarded', '1'); } catch {}
}
$('#obSkip').onclick = hideOnboard;
$('#obNext').onclick = () => { if (obStep < OB_STEPS.length - 1) { obStep++; paintOb(); } else hideOnboard(); };
function storageKB() {
  try {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += (k?.length || 0) + (localStorage.getItem(k)?.length || 0); }
    return (n / 1024).toFixed(1);
  } catch { return '?'; }
}
$('#wipeData').onclick = () => {
  if (!confirm('Clear all local Link Up data on this device?')) return;
  try { localStorage.clear(); } catch {}
  location.reload();
};
/* ---------- GPS live location ---------- */
function syncGpsToggle() { const t = $('#ntGps'); if (t) t.checked = S.gpsPref; updateGpsNote(); }
function updateGpsNote() {
  const el = $('#gpsStatus');
  if (!el) return;
  el.textContent = !Geo.supported() ? 'GPS unavailable here (needs HTTPS/localhost)'
    : S.ghost ? 'Paused — Ghost Mode hides you 👻'
    : Geo.watching ? `Live 📍 ${Geo.last ? `±${Geo.last.accuracy}m${Geo.last.offCampus ? ' · off campus' : ''}` : ''}`
    : S.gpsPref ? 'Starting…' : 'Off — your dot stays pinned';
}
function applyFix(p) {
  map.setMePos(p.x, p.y);
  Net.mePos = { x: p.x, y: p.y };
  if (Net.live && !S.ghost) Net.beat({ x: p.x, y: p.y });
  refreshLivePins();
  if (S.view === 'map') renderSheet();
  if (S.view === 'nearby') renderNearby();
  updateGpsNote();
}
Geo.onUpdate(applyFix);
async function setGPS(on, silent) {
  S.gpsPref = on;
  store.set('gps', on);
  syncGpsToggle();
  if (!on) { Geo.stop(); updateGpsNote(); if (!silent) toast('📍 Live location off'); return; }
  if (S.ghost) { toast('Turn Ghost off first 👻'); S.gpsPref = false; store.set('gps', false); syncGpsToggle(); return; }
  if (!Geo.supported()) { S.gpsPref = false; store.set('gps', false); syncGpsToggle(); toast('GPS needs HTTPS or localhost + permission 📍'); return; }
  try {
    applyFix(await Geo.fix());
    Geo.start();
    updateGpsNote();
    if (!silent) toast(`📍 Live location on — walk the map!${Geo.last.offCampus ? ' (you look off-campus)' : ''}`);
  } catch {
    S.gpsPref = false; store.set('gps', false); syncGpsToggle();
    if (!silent) toast('Location blocked — allow it in the browser address bar 📍');
  }
}
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
  syncGpsToggle();
  $('#profileNote').textContent = Net.live ? 'Name change rejoins the live server (page reloads).' : '';
  $('#storageInfo').textContent = `Local data: ~${storageKB()} KB on this device`;
  const earned = Social.earnedBadges(TRAILS, S.visited, Social.linkupCount());
  $('#badgeShelf').innerHTML = Social.BADGES.map((b) => `<span class="tag" style="${earned.includes(b.id) ? 'color:var(--lime);border-color:#b7ff2a55' : 'opacity:.45'}" title="${b.desc}">${earned.includes(b.id) ? b.name : '🔒 ' + b.name.split(' ')[0]}</span>`).join('');
  $('#blockedWrap').hidden = true;
  if (Net.live) {
    Net.blockedList().then((list) => {
      if (!list.length) return;
      $('#blockedWrap').hidden = false;
      $('#blockedList').innerHTML = list.map((u) => `<div class="row" style="gap:8px;font-size:13px"><span style="flex:1">${u.name}</span>
        <button class="mini-btn" data-unb="${u.id}">Unblock</button>
        <button class="mini-btn" data-rep="${u.id}" data-nm="${u.name}">Report</button></div>`).join('');
      $$('#blockedList [data-unb]').forEach((b) => (b.onclick = async () => { await Net.blockUser(b.dataset.unb, false); toast('Unblocked.'); openProfile(); }));
      $$('#blockedList [data-rep]').forEach((b) => (b.onclick = async () => {
        const reason = prompt(`Report ${b.dataset.nm}? Why?`, 'Spam / misuse');
        if (!reason) return;
        await Net.reportUser(b.dataset.rep, reason);
        toast('Reported — organizers will review. 🛡️');
      }));
    }).catch(() => {});
  }
  applyProfileToUI();
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
  try { if (!localStorage.getItem('linkup.onboarded')) setTimeout(showOnboard, 1200); } catch {}
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
  Net.on('linkup_accept', (m) => { S.outgoing = null; startSession(m.from, m.spot, 0, 'outgoing', m.endsAt ?? null, m.spotX != null ? [m.spotX, m.spotY] : null); });
  Net.on('linkup_decline', () => { S.outgoing = null; persist(); renderFriends(); toast('They declined — another time 🤙'); });
  Net.on('linkup_expired', () => { S.outgoing = null; persist(); renderFriends(); toast('Live request expired ⏳'); });
  Net.on('session_end', (m) => endSession(m.expired ? 'Live Link Up ended ⏳' : 'They ended the hangout.', true));
  Net.on('chat', (m) => pushMsg(m.from, 'them', m.text));
  Net.on('group_invite', (m) => {
    S.groupNames['group:' + m.group.id] = groupThreadName(m.group);
    if (!S.groupInvites.find((g) => g.id === m.group.id)) S.groupInvites.push(m.group);
    if (S.view === 'friends') renderFriends();
    toast(`👥 ${m.fromName} invited you to link up at ${m.group.spot}`);
    if (document.hidden) Notify.linkup(m.fromName + ' (group)');
  });
  Net.on('group_update', (m) => {
    if (!S.group || S.group.id !== m.group.id) return;
    const before = S.group.members.length;
    S.group = m.group;
    S.groupNames['group:' + m.group.id] = groupThreadName(m.group);
    if (Net.me && !m.group.members.find((x) => x.id === Net.me.id)) { clearGroup(); return; }
    updateGroupBanner();
    if (m.group.members.length > before) toast('👥 Someone joined the group!');
    if (S.view === 'friends') renderFriends();
  });
  Net.on('group_end', (m) => { if (S.group && S.group.id === m.groupId) clearGroup(m.expired ? 'Group link up ended ⏳' : 'Host ended the group.'); });
  Net.on('group_chat', (m) => pushMsg('group:' + m.groupId, 'them', m.text));
  Net.on('attendance', () => {
    if (!$('#mokshaHub').hidden) renderMokshaHub();
    if (!$('#mokshaCard').hidden && S.mokshaCardId) fillMokshaCard(EventStore.get(S.mokshaCardId));
  });
  Net.on('announce', (m) => {
    if (m.announce) pushAnn(m.announce);
    toast('📢 Organizers: ' + (m.announce?.text || 'new announcement').slice(0, 90));
    if (S.view === 'events') renderEvents();
  });
  $('#announceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('#announceIn').value.trim();
    if (!v) return;
    const r = await Net.adminAnnounce(v);
    if (r.code === 200) { $('#announceIn').value = ''; toast('📢 Broadcast sent to all live users.'); }
    else toast('Broadcast needs the live server.');
  });
  Net.on('outbox', () => { if (!$('#debugModal').hidden) renderDebug(); });
  window.addEventListener('online', () => { if (Net.live) Net.flush(); });
  if (S.gpsPref && !S.ghost) setGPS(true, true);
  Net.init({ name: myName(), dept: S.profile.dept }).then((live) => {
    if (live) {
      toast('⚡ Connected to live server — real people, real requests.'); refreshLivePins();
      if (Notify.granted()) Net.subscribePush();
    }
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
  if (S.session?.spotX != null) {
    try {
      const rr = route([map.mePos.x, map.mePos.y], [S.session.spotX, S.session.spotY]);
      if (rr) { map.setRoute({ pts: rr.pts, to: { x: S.session.spotX, y: S.session.spotY } }); S.sessionRoute = true; }
    } catch {}
  }
  $('#sideStats').textContent = `${FRIENDS.filter((f) => f.online).length} friends live · ${PLACES.length} spots`;
  setInterval(() => {
    if (document.hidden || S.ghost) return;
    const f = FRIENDS[Math.floor(Math.random() * 3)];
    f.dist = Math.max(40, f.dist + Math.floor(Math.random() * 41) - 20);
    if (S.view === 'map') renderSheet();
  }, 15000);
  window.__linkup_booted = true;
}
try { boot(); } catch (e) {
  console.error(e);
  const f = document.getElementById('fatal');
  if (f) { f.hidden = false; f.innerHTML = '⚠️ Startup failed:<code></code>'; f.querySelector('code').textContent = String(e.stack || e); }
}
