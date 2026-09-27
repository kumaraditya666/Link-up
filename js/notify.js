/* Link Up — Phase 5: notifications (zero deps).
 * Local system alerts for Link Up requests + Moksha starting-soon reminders.
 * Pure reminder logic is DOM-free so it can be unit-tested in Node.
 */
export const Notify = {
  prefsKey: 'linkup.notify.prefs',
  seenKey: 'linkup.notify.seen',
  get prefs() {
    try { return Object.assign({ linkup: true, moksha: true }, JSON.parse(localStorage.getItem(this.prefsKey) || '{}')); }
    catch { return { linkup: true, moksha: true }; }
  },
  setPrefs(p) { try { localStorage.setItem(this.prefsKey, JSON.stringify(p)); } catch {} },
  get seen() {
    try { return JSON.parse(localStorage.getItem(this.seenKey) || '[]'); }
    catch { return []; }
  },
  markSeen(id) {
    try {
      const s = this.seen;
      if (!s.includes(id)) { s.push(id); localStorage.setItem(this.seenKey, JSON.stringify(s.slice(-60))); }
    } catch {}
  },
  supported() { return typeof window !== 'undefined' && 'Notification' in window; },
  granted() { return this.supported() && Notification.permission === 'granted'; },
  async ensure() {
    if (!this.supported()) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { return (await Notification.requestPermission()) === 'granted'; }
    catch { return false; }
  },
  async show(title, body, tag, view) {
    if (!this.prefs.linkup && tag.startsWith('linkup')) return false;
    if (!this.prefs.moksha && tag.startsWith('moksha')) return false;
    if (!(await this.ensure())) return false;
    try {
      const reg = await navigator.serviceWorker?.ready;
      const opts = { body, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { view: view || 'map', url: './' } };
      if (reg?.showNotification) await reg.showNotification(title, opts);
      else new Notification(title, opts);
      return true;
    } catch { return false; }
  },
  linkup(fromName) { return this.show(`⚡ ${fromName} wants to link up`, 'Tap to accept or decline.', 'linkup-' + Date.now(), 'friends'); },
  moksha(ev, label) { return this.show(`🎭 ${ev.name}`, label, 'moksha-' + ev.id, 'events'); },
};

/** Pure: which published events deserve a starting-soon nudge right now? */
export function dueReminders(events, nowMs, seenIds, windowMin = 30) {
  const out = [];
  for (const ev of events) {
    if (!ev.published) continue;
    const s = new Date(ev.start_time).getTime();
    if (Number.isNaN(s)) continue;
    const mins = (s - nowMs) / 60000;
    if (mins > 0 && mins <= windowMin && !seenIds.includes(ev.id)) {
      const label = mins >= 60
        ? `Starts in ${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m · ${ev.verified ? ev.venue_name : 'Venue TBA'}`
        : `Starts in ${Math.max(1, Math.round(mins))} min · ${ev.verified ? ev.venue_name : 'Venue TBA'}`;
      out.push({ ev, label });
    }
  }
  return out;
}
