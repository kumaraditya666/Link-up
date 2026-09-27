/* Link Up — real GPS location tracking (zero deps).
 *
 * Wraps Geolocation watchPosition with throttling + campus grid mapping.
 * Campus anchor is APPROXIMATE (NSUT Dwarka ~28.6097N 77.0320E) — good enough
 * to walk the miniature; organizers can recalibrate CAMPUS_BOUNDS later.
 * Ghost Mode / toggle stops the watcher entirely (privacy + battery).
 */
export const CAMPUS_BOUNDS = {
  // [minLat, maxLat, minLng, maxLng] <-> grid [0..1000]x[0..700], y=0 is north
  minLat: 28.6025, maxLat: 28.6145, minLng: 77.0245, maxLng: 77.0395,
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** WGS84 -> campus grid units. Returns {x, y, offCampus}. */
export function latLngToGrid(lat, lng) {
  const { minLat, maxLat, minLng, maxLng } = CAMPUS_BOUNDS;
  const x = ((lng - minLng) / (maxLng - minLng)) * 1000;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 700;
  const offCampus = lat < minLat || lat > maxLat || lng < minLng || lng > maxLng;
  return { x: clamp(x, -100, 1100), y: clamp(y, -100, 800), offCampus };
}
/** campus grid -> approx WGS84 (for Share text). */
export function gridToLatLng(x, y) {
  const { minLat, maxLat, minLng, maxLng } = CAMPUS_BOUNDS;
  return {
    lat: maxLat - (clamp(y, 0, 700) / 700) * (maxLat - minLat),
    lng: minLng + (clamp(x, 0, 1000) / 1000) * (maxLng - minLng),
  };
}
/** meters between two grid points (1u ≈ 0.9m). */
export function gridMeters(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay) * 0.9;
}

export const Geo = {
  watching: false, watchId: null, last: null, error: null, listeners: [],
  supported() {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator && (window.isSecureContext || location.hostname === 'localhost');
  },
  onUpdate(fn) { this.listeners.push(fn); },
  emit(p) { for (const fn of this.listeners) { try { fn(p); } catch {} } },
  /** One-shot fix: triggers the browser permission prompt. */
  fix() {
    return new Promise((resolve, reject) => {
      if (!this.supported()) return reject(new Error('GPS unavailable (needs HTTPS or localhost)'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(this.ingest(pos)),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
      );
    });
  },
  ingest(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    const g = latLngToGrid(latitude, longitude);
    const p = { x: Math.round(g.x), y: Math.round(g.y), offCampus: g.offCampus, accuracy: Math.round(accuracy || 0), at: Date.now() };
    // ignore absurd jumps (>300m in one fix) unless first fix
    if (this.last && gridMeters(this.last.x, this.last.y, p.x, p.y) > 300) return this.last;
    this.last = p;
    this.error = null;
    return p;
  },
  start() {
    if (this.watching || !this.supported()) return false;
    try {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const prev = this.last;
          const p = this.ingest(pos);
          // throttle: moved >4u (~3.6m) or 12s elapsed
          if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 4 || p.at - prev.at > 12000) this.emit(p);
        },
        (err) => { this.error = err?.message || 'GPS error'; },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 8000 },
      );
      this.watching = true;
      return true;
    } catch { return false; }
  },
  stop() {
    if (this.watchId != null) { try { navigator.geolocation.clearWatch(this.watchId); } catch {} }
    this.watchId = null;
    this.watching = false;
  },
};
