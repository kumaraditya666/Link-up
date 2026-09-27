/* Link Up — festival & campus event data layer.
 *
 * Generic Event structure (supports Moksha today, any festival tomorrow):
 *   Event { id, name, category, festival, venue_name, venue_id,
 *           latitude, longitude, campus_x, campus_y,
 *           start_time, end_time, description,
 *           verified, published, crowd, interested_base }
 *
 * ACCURACY RULES (enforced here, not just documented):
 *  - A map marker / coordinates exist ONLY when verified === true AND
 *    campus_x/campus_y are set. Otherwise the event renders as "Venue TBA".
 *  - crowd is shown ONLY when it holds a reliable value ('low'|'moderate'|'high').
 *    Seeds ship with crowd: null -> the UI hides the indicator entirely.
 *  - Routes are always labelled "Approximate route".
 */

export const ORGANIZER_CODE = 'moksha27';

export const CATEGORIES = [
  { id: 'Music', emoji: '🎤' },
  { id: 'Dance', emoji: '💃' },
  { id: 'Theatre', emoji: '🎭' },
  { id: 'Cultural', emoji: '🎨' },
  { id: 'Shows', emoji: '🎪' },
  { id: 'Competitions', emoji: '🏆' },
];

/* Verified campus venues. Coordinates are local map grid units.
 * lat/lng are APPROXIMATE (linear mapping around NSUT Dwarka ~28.6097,77.0320)
 * used only for Share text — never for on-map placement. */
export const VENUES = [
  { id: 'amphi', name: 'Amphitheatre', x: 710, y: 445 },
  { id: 'sac', name: 'SAC', x: 545, y: 300 },
  { id: 'ground', name: 'Football Ground', x: 190, y: 445 },
  { id: 'canteen', name: 'Main Canteen Lawns', x: 500, y: 460 },
  { id: 'library', name: 'Central Library Plaza', x: 400, y: 255 },
];
export const venueById = (id) => VENUES.find((v) => v.id === id) || null;

export function approxLatLng(x, y) {
  return { lat: 28.6126 - y * 8.1e-6, lng: 77.0289 + x * 8.6e-6 };
}

const LS_KEY = 'linkup.festival_events.v1';

function seed() {
  const now = Date.now();
  const H = 3600 * 1000;
  const iso = (t) => new Date(t).toISOString();
  return [
    {
      id: 'mok-main', name: 'Moksha — Main Stage', category: 'Shows', festival: 'Moksha',
      venue_name: 'Amphitheatre', venue_id: 'amphi', campus_x: 710, campus_y: 445,
      ...approxLatLng(710, 445),
      latitude: approxLatLng(710, 445).lat, longitude: approxLatLng(710, 445).lng,
      start_time: iso(now - 2 * H), end_time: iso(now + 6 * H),
      description: 'Flagship Moksha stage — opening acts, headliners and the famous fest crowd. Entry via the east walkway.',
      verified: true, published: true, crowd: null, interested_base: 412,
    },
    {
      id: 'mok-bands', name: 'Battle of Bands', category: 'Music', festival: 'Moksha',
      venue_name: 'SAC', venue_id: 'sac', campus_x: 545, campus_y: 300,
      latitude: approxLatLng(545, 300).lat, longitude: approxLatLng(545, 300).lng,
      start_time: iso(now + 3 * H), end_time: iso(now + 5.5 * H),
      description: 'Inter-college band face-off. Five finalists, one stage, loud opinions.',
      verified: true, published: true, crowd: null, interested_base: 187,
    },
    {
      id: 'mok-nukkad', name: 'Nukkad Natak — Street Plays', category: 'Theatre', festival: 'Moksha',
      venue_name: 'Football Ground', venue_id: 'ground', campus_x: 190, campus_y: 445,
      latitude: approxLatLng(190, 445).lat, longitude: approxLatLng(190, 445).lng,
      start_time: iso(now + 26 * H), end_time: iso(now + 29 * H),
      description: 'Street theatre circle on the ground edge. Bring a friend, sit on the grass.',
      verified: true, published: true, crowd: null, interested_base: 96,
    },
    {
      id: 'mok-starnight', name: 'Star Night — EDM Headliner', category: 'Music', festival: 'Moksha',
      venue_name: 'Amphitheatre', venue_id: 'amphi', campus_x: 710, campus_y: 445,
      latitude: approxLatLng(710, 445).lat, longitude: approxLatLng(710, 445).lng,
      start_time: iso(now + 9 * H), end_time: iso(now + 12 * H),
      description: 'Closing-night headliner set with full stage lighting. Wristbands at the SAC desk.',
      verified: true, published: true, crowd: null, interested_base: 530,
    },
    {
      id: 'mok-classical', name: 'Classical Dance Showcase', category: 'Dance', festival: 'Moksha',
      venue_name: 'SAC', venue_id: 'sac', campus_x: 545, campus_y: 300,
      latitude: approxLatLng(545, 300).lat, longitude: approxLatLng(545, 300).lng,
      start_time: iso(now - 26 * H), end_time: iso(now - 24 * H),
      description: 'Yesterday’s classical showcase — Kathak, Bharatanatyam and Odissi medley.',
      verified: true, published: true, crowd: null, interested_base: 143,
    },
    {
      id: 'mok-after', name: 'Moksha Afterparty', category: 'Cultural', festival: 'Moksha',
      venue_name: 'Venue TBA', venue_id: null, campus_x: null, campus_y: null,
      latitude: null, longitude: null,
      start_time: iso(now + 13 * H), end_time: iso(now + 15 * H),
      description: 'Closing gathering — venue is confirmed by organizers soon. Check back here, not rumours.',
      verified: false, published: true, crowd: null, interested_base: 64,
    },
  ];
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch {}
  const s = seed();
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  return s;
}
function save(arr) { try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {} }

export const EventStore = {
  all() { return load(); },
  published() { return load().filter((e) => e.published); },
  ofFestival(f) { return this.published().filter((e) => e.festival === f); },
  /** Mappable = verified + has coordinates. Everything else is Venue TBA. */
  mappable(f) { return this.ofFestival(f).filter((e) => e.verified && e.campus_x != null && e.campus_y != null); },
  get(id) { return load().find((e) => e.id === id) || null; },
  upsert(ev) {
    const arr = load();
    const i = arr.findIndex((e) => e.id === ev.id);
    if (i >= 0) arr[i] = ev; else arr.push(ev);
    save(arr); return ev;
  },
  remove(id) { save(load().filter((e) => e.id !== id)); },
  setPublished(id, v) { const e = this.get(id); if (e) { e.published = v; this.upsert(e); } },
};

export function eventStatus(ev, now = Date.now()) {
  const s = new Date(ev.start_time).getTime(), e = new Date(ev.end_time).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 'tba';
  if (now < s) return 'upcoming';
  if (now <= e) return 'live';
  return 'ended';
}

export function statusLabel(ev, now = Date.now()) {
  const st = eventStatus(ev, now);
  if (st === 'live') return { icon: '🟢', text: 'LIVE NOW', cls: 'live' };
  if (st === 'ended') return { icon: '⚫', text: 'ENDED', cls: 'ended' };
  if (st === 'tba') return { icon: '📍', text: 'VENUE TBA', cls: 'tba' };
  const ms = new Date(ev.start_time).getTime() - now;
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  const d = Math.floor(h / 24);
  const inTxt = d >= 1 ? `STARTS IN ${d}d ${h % 24}h` : h >= 1 ? `STARTS IN ${h}h ${m}m` : `STARTS IN ${m}m`;
  return { icon: '🔵', text: inTxt, cls: 'upcoming' };
}

/** Festival-wide state drives the home card + main marker. */
export function festivalState(festival = 'Moksha', now = Date.now()) {
  const evs = EventStore.ofFestival(festival);
  if (!evs.length) return 'none';
  if (evs.some((e) => eventStatus(e, now) === 'live')) return 'live';
  if (evs.some((e) => eventStatus(e, now) === 'upcoming')) return 'upcoming';
  return 'ended';
}
export function nextEvent(festival = 'Moksha', now = Date.now()) {
  return EventStore.ofFestival(festival)
    .filter((e) => eventStatus(e, now) !== 'ended')
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0] || null;
}
export function liveEvent(festival = 'Moksha', now = Date.now()) {
  return EventStore.ofFestival(festival).find((e) => eventStatus(e, now) === 'live') || null;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export function fmtTime(iso) {
  const d = new Date(iso);
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
export function fmtRange(ev) { return `${fmtDate(ev.start_time)} · ${fmtTime(ev.start_time)} – ${fmtTime(ev.end_time)}`; }

/* ---- per-user interest (not a crowd metric) ---- */
const INT_KEY = 'linkup.interested.v1';
export function getInterested() { try { return new Set(JSON.parse(localStorage.getItem(INT_KEY) || '[]')); } catch { return new Set(); } }
export function toggleInterested(id) {
  const s = getInterested();
  if (s.has(id)) s.delete(id); else s.add(id);
  try { localStorage.setItem(INT_KEY, JSON.stringify([...s])); } catch {}
  return s.has(id);
}
export function interestCount(ev) { return (ev.interested_base || 0) + (getInterested().has(ev.id) ? 1 : 0); }

/* ---- organizer gate (demo; a real backend would enforce this server-side) ---- */
export function isOrganizer() { try { return localStorage.getItem('linkup.organizer') === '1'; } catch { return false; } }
export function organizerLogin(code) {
  if ((code || '').trim().toLowerCase() === ORGANIZER_CODE) {
    try { localStorage.setItem('linkup.organizer', '1'); } catch {}
    return true;
  }
  return false;
}
export function organizerLogout() { try { localStorage.removeItem('linkup.organizer'); } catch {} }
