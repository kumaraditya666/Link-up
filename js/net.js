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
  handlers: {}, es: null, hb: null, log: [],
  outbox() { try { return JSON.parse(localStorage.getItem('linkup.live.outbox') || '[]'); } catch { return []; } },
  queue(method, path, body) {
    // offline-safe mutations: linkup / respond / chat / end wait for reconnect
    const box = this.outbox();
    box.push({ method, path, body, at: Date.now() });
    try { localStorage.setItem('linkup.live.outbox', JSON.stringify(box.slice(-20))); } catch {}
    this.note('queued offline: ' + path);
    this.emit('outbox', this.outbox().length);
  },
  async flush() {
    if (!this.live) return 0;
    let box = this.outbox(), sent = 0;
    const keep = [];
    for (const m of box) {
      try {
        const r = await fetch(this.base + m.path, {
          method: m.method, headers: { 'Content-Type': 'application/json', ...this.auth() },
          body: m.body ? JSON.stringify(m.body) : undefined,
        });
        if (r.status === 401) { keep.push(m); continue; }
        sent++;
      } catch { keep.push(m); }
    }
    try { localStorage.setItem('linkup.live.outbox', JSON.stringify(keep)); } catch {}
    if (sent) this.note(`flushed ${sent} queued`);
    this.emit('outbox', keep.length);
    return sent;
  },
  note(msg) {
    const line = `${new Date().toLocaleTimeString('en-IN', { hour12: false })} ${msg}`;
    this.log.push(line);
    if (this.log.length > 25) this.log.shift();
    console.log('[linkup-net]', line);
  },
  on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); },
  emit(evt, d) { for (const fn of this.handlers[evt] || []) { try { fn(d); } catch (e) { console.warn(e); } } },
  get live() { return this.mode === 'live'; },

  bases() {
    const b = ['http://localhost:8001', 'http://127.0.0.1:8001'];
    if (location.hostname && !['localhost', '127.0.0.1'].includes(location.hostname)) b.unshift(`http://${location.hostname}:8001`);
    return b;
  },
  async init(identity) {
    this.note('init: trying ' + this.bases().join(','));
    for (const base of this.bases()) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1600);
        const r = await fetch(base + '/api/health', { signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        this.base = base;
        this.note('health OK @ ' + base);
        await this.join(identity);
        this.note('joined as ' + this.me.name + ' (' + this.me.id + ')');
        this.connect();
        this.mode = 'live';
        this.emit('mode', 'live');
        return true;
      } catch (e) { this.note('base failed: ' + base + ' (' + (e?.message || e) + ')'); }
    }
    this.mode = 'mock';
    this.note('MOCK mode (no server reachable)');
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
    const QUEUEABLE = ['/api/linkup', '/api/linkup/respond', '/api/linkup/end', '/api/chat'];
    let r;
    try {
      r = await fetch(this.base + path, {
        method, headers: { 'Content-Type': 'application/json', ...this.auth() },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (method !== 'GET' && QUEUEABLE.some((p) => path === p)) {
        this.queue(method, path, body);
        return { code: 0, data: { queued: true } };
      }
      throw e;
    }
    if (r.status === 401 && !retried && this.me) {
      this.note('401 stale cred -> rejoining');
      await this.rejoin(); // stale token (e.g. server restarted) -> heal + retry once
      return this.api(method, path, body, true);
    }
    const data = await r.json().catch(() => ({}));
    return { code: r.status, data };
  },
  connect() {
    if (this.es) { try { this.es.close(); } catch {} }
    let errStreak = 0;    this.es = new EventSource(`${this.base}/api/live?token=${this.me.token}`);
    this.es.onopen = () => { errStreak = 0; };
    this.es.onmessage = (e) => {
      errStreak = 0;
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'roster' && m.roster) { this.roster = m.roster.filter((u) => u.id !== this.me.id); this.emit('roster', this.roster); }
        else if (m.type === 'hello' && m.attendance) { this.attendance = m.attendance; this.emit('hello', m); }
        else if (m.type === 'attendance' && m.counts) { this.attendance = m.counts; this.emit('attendance', m.counts); }
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
    this.flush();
  },
  async beat(pos) {
    if (!this.live || this.paused) return;
    try { await this.api('POST', '/api/pos', pos || { x: 350, y: 400 }); } catch {}
  },
  setPaused(p) { this.paused = p; if (!p) this.beat(); },
  /* people shaped like local friends for the map + lists */
  people() {
    return this.roster.map((u) => ({
      id: u.id, name: u.name, short: u.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
      dept: u.dept || '', grad: gradFor(u.id), spot: u.spot || 'On campus',
      dist: Math.round(Math.hypot(u.x - 350, u.y - 400) * 0.9),
      online: true, x: u.x, y: u.y, vibe: u.bot ? 'Wandering campus 🤖' : 'Live on Link Up ⚡',
      live: true, bot: !!u.bot,
    }));
  },
  person(id) { return this.people().find((p) => p.id === id) || null; },
  sendLinkup(to, spot, durMin) { return this.api('POST', '/api/linkup', { to, spot, durMin }); },
  respondLinkup(from, accept, durMin) { return this.api('POST', '/api/linkup/respond', { from, accept, durMin }); },
  endLink() { return this.api('POST', '/api/linkup/end', {}); },
  sendChat(to, text) { return this.api('POST', '/api/chat', { to, text }); },
  attend(eventId) { return this.api('POST', '/api/attend', { eventId }); },
  attendance: {},
  async fetchAttendance() {
    try {
      const r = await this.api('GET', '/api/attendance');
      if (r.data && typeof r.data === 'object') { this.attendance = r.data; this.emit('attendance', r.data); }
    } catch {}
  },
  blockUser(id, block = true) { return this.api('POST', '/api/block', { user: id, block }); },
  async blockedList() {
    const r = await this.api('GET', '/api/blocks');
    return (r.data && r.data.blocked) || [];
  },
  reportUser(id, reason) { return this.api('POST', '/api/report', { user: id, reason }); },
  async adminAnnounce(text) {
    const l = await this.api('POST', '/api/admin/login', { code: 'moksha27' }).catch(() => ({}));
    const t = l.data && l.data.adminToken;
    if (!t) return { code: 403, data: {} };
    const r = await fetch(this.base + '/api/admin/announce', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': t },
      body: JSON.stringify({ text }),
    });
    return { code: r.status, data: await r.json().catch(() => ({})) };
  },
  async fetchAnnounce() {
    try {
      const r = await this.api('GET', '/api/announce');
      return Array.isArray(r.data) ? r.data : [];
    } catch { return []; }
  },
  async adminReports() {
    const l = await this.api('POST', '/api/admin/login', { code: 'moksha27' }).catch(() => ({}));
    const t = l.data && l.data.adminToken;
    if (!t) return [];
    const r = await fetch(this.base + '/api/admin/reports', { headers: { 'x-admin-token': t } });
    const d = await r.json().catch(() => ([]));
    return Array.isArray(d) ? d : [];
  },
  groupCreate(spot, durMin) { return this.api('POST', '/api/group/create', { spot, durMin }); },
  groupInvite(groupId, to) { return this.api('POST', '/api/group/invite', { groupId, to }); },
  groupJoin(groupId) { return this.api('POST', '/api/group/join', { groupId }); },
  groupLeave(groupId) { return this.api('POST', '/api/group/leave', { groupId }); },
  groupEnd(groupId) { return this.api('POST', '/api/group/end', { groupId }); },
  groupChat(groupId, text) { return this.api('POST', '/api/group/chat', { groupId, text }); },
  myGroups() { return this.api('GET', '/api/groups/mine'); },
  async subscribePush() {
    if (!this.live) return false;
    try {
      if (!('PushManager' in window) || !navigator.serviceWorker) return false;
      const { publicKey } = await (await fetch(this.base + '/api/push/key')).json();
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'));
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      await this.api('POST', '/api/push/subscribe', { sub: sub.toJSON() });
      this.note('push subscribed');
      return true;
    } catch (e) { this.note('push subscribe failed'); return false; }
  },
  async history(withId) {
    const { data } = await this.api('GET', `/api/chat?with=${encodeURIComponent(withId)}`);
    return ((data && data.messages) || []).map((m) => ({ from: m.from === this.me.id ? 'me' : 'them', text: m.text, t: m.t }));
  },
};
