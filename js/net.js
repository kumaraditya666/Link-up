/* Link Up — live adapter (Phase 3).
 * Auto-detects the Link Up live server, joins with a stored identity,
 * heartbeats presence, and streams roster / requests / chat over SSE
 * (EventSource auto-reconnects). Falls back to mock mode when no server.
 * Ghost Mode pauses the heartbeat so you stale-out server-side.
 */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('linkup.live.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('linkup.live.' + k, JSON.stringify(v)); } catch {} },
};
const GRADS = [
  'linear-gradient(135deg,#7c3aed,#ec4899)', 'linear-gradient(135deg,#06b6d4,#3b82f6)',
  'linear-gradient(135deg,#10b981,#06b6d4)', 'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#8b5cf6,#06b6d4)', 'linear-gradient(135deg,#ec4899,#f59e0b)',
];
const gradFor = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return GRADS[h % GRADS.length]; };

export const Net = {
  mode: 'mock', base: null, me: null, roster: [], paused: false,
  handlers: {}, es: null, hb: null,
  on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); },
  emit(evt, d) { for (const fn of this.handlers[evt] || []) { try { fn(d); } catch (e) { console.warn(e); } } },
  get live() { return this.mode === 'live'; },

  bases() {
    const b = ['http://localhost:8001', 'http://127.0.0.1:8001'];
    if (location.hostname && !['localhost', '127.0.0.1'].includes(location.hostname)) b.unshift(`http://${location.hostname}:8001`);
    return b;
  },
  async init(identity) {
    for (const base of this.bases()) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1600);
        const r = await fetch(base + '/api/health', { signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        this.base = base;
        await this.join(identity);
        this.connect();
        this.mode = 'live';
        this.emit('mode', 'live');
        return true;
      } catch { /* try next */ }
    }
    this.mode = 'mock';
    this.emit('mode', 'mock');
    return false;
  },
  async join(identity) {
    const saved = store.get('cred');
    if (saved?.token) {
      this.me = { id: saved.id, token: saved.token, name: identity.name, dept: identity.dept || '' };
      return;
    }
    const r = await fetch(this.base + '/api/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: identity.name, dept: identity.dept }),
    });
    if (!r.ok) throw new Error('join failed');
    const { id, token } = await r.json();
    this.me = { id, token, name: identity.name, dept: identity.dept || '' };
    store.set('cred', { id, token });
  },
  async rejoin() {
    // server restarted / cred wiped -> drop the dead identity and join fresh
    try { localStorage.removeItem('linkup.live.cred'); } catch {}
    try { this.es && this.es.close(); } catch {}
    await this.join({ name: this.me?.name || 'Aditya', dept: this.me?.dept || '' });
    this.connect();
    this.mode = 'live';
    this.emit('mode', 'live');
  },
  auth() { return { Authorization: 'Bearer ' + this.me.token }; },
  async api(method, path, body, retried = false) {
    const r = await fetch(this.base + path, {
      method, headers: { 'Content-Type': 'application/json', ...this.auth() },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && !retried && this.me) {
      await this.rejoin(); // stale token (e.g. server restarted) -> heal + retry once
      return this.api(method, path, body, true);
    }
    const data = await r.json().catch(() => ({}));
    return { code: r.status, data };
  },
  connect() {
    if (this.es) { try { this.es.close(); } catch {} }
    let errStreak = 0;
    this.es = new EventSource(`${this.base}/api/live?token=${this.me.token}`);
    this.es.onopen = () => { errStreak = 0; };
    this.es.onmessage = (e) => {
      errStreak = 0;
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'roster' && m.roster) { this.roster = m.roster.filter((u) => u.id !== this.me.id); this.emit('roster', this.roster); }
        else this.emit(m.type, m);
      } catch {}
    };
    this.es.onerror = () => {
      // persistent stream failure (e.g. dead cred) -> rejoin fresh
      if (++errStreak > 3 && this.me) { errStreak = 0; this.rejoin().catch(() => {}); }
    };
    clearInterval(this.hb);
    this.hb = setInterval(() => this.beat(), 5000);
    this.beat();
  },
  async beat(pos) {
    if (!this.live || this.paused) return;
    try { await this.api('POST', '/api/pos', pos || { x: 560, y: 332 }); } catch {}
  },
  setPaused(p) { this.paused = p; if (!p) this.beat(); },
  /* people shaped like local friends for the map + lists */
  people() {
    return this.roster.map((u) => ({
      id: u.id, name: u.name, short: u.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
      dept: u.dept || '', grad: gradFor(u.id), spot: u.spot || 'On campus',
      dist: Math.round(Math.hypot(u.x - 560, u.y - 332) * 0.9),
      online: true, x: u.x, y: u.y, vibe: u.bot ? 'Wandering campus 🤖' : 'Live on Link Up ⚡',
      live: true, bot: !!u.bot,
    }));
  },
  person(id) { return this.people().find((p) => p.id === id) || null; },
  sendLinkup(to, spot, durMin) { return this.api('POST', '/api/linkup', { to, spot, durMin }); },
  respondLinkup(from, accept, durMin) { return this.api('POST', '/api/linkup/respond', { from, accept, durMin }); },
  endLink() { return this.api('POST', '/api/linkup/end', {}); },
  sendChat(to, text) { return this.api('POST', '/api/chat', { to, text }); },
  async history(withId) {
    const { data } = await this.api('GET', `/api/chat?with=${encodeURIComponent(withId)}`);
    return ((data && data.messages) || []).map((m) => ({ from: m.from === this.me.id ? 'me' : 'them', text: m.text, t: m.t }));
  },
};
