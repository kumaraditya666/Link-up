/* Link Up — Phase 6: campus-life social layer (local-first, zero deps).
 * Check-ins (vibe presence per place), polls, expiring moments feed,
 * leaderboard, profile bio. Pure logic + localStorage; testable in Node.
 */
const store = {
  get(k, d) { try { const v = typeof localStorage !== 'undefined' && localStorage.getItem('linkup.social.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('linkup.social.' + k, JSON.stringify(v)); } catch {} },
};

const SEED_MOMENTS = [
  { id: 'm1', author: 'Kabir', text: 'Moksha Ground is PACKED tonight 🥏🔥', placeId: 'moksha-ground', hoursAgo: 1 },
  { id: 'm2', author: 'Ishita', text: 'Amul Ground breeze + maggi = perfect evening 🍃', placeId: 'amul-ground', hoursAgo: 3 },
  { id: 'm3', author: 'Sara', text: 'Canteen cold coffee line is 20 deep, worth it 🧋', placeId: 'canteen', hoursAgo: 5 },
  { id: 'm4', author: 'Meera', text: 'Floor 2 library seats going fast, hurry 📚', placeId: 'sac-lib', hoursAgo: 8 },
];
const SEED_POLLS = {
  'moksha-ground': [{ id: 'p1', q: 'Best Moksha night so far?', options: [{ t: 'Star Night 🎧', v: 41 }, { t: 'Battle of Bands 🎸', v: 35 }, { t: 'Nukkad evening 🎭', v: 18 }] }],
  canteen: [{ id: 'p2', q: 'Canteen GOAT?', options: [{ t: 'Rajma chawal 🍛', v: 52 }, { t: 'Momos 🥟', v: 38 }, { t: 'Cold coffee 🧋', v: 29 }] }],
};

export const Social = {
  checkins() { return store.get('checkins', {}); },
  toggleCheckin(placeId) {
    const c = this.checkins();
    const cur = c[placeId] || { count: 20 + (placeId.length * 7) % 30, me: false };
    cur.me = !cur.me;
    cur.count += cur.me ? 1 : -1;
    c[placeId] = cur;
    store.set('checkins', c);
    return cur;
  },
  polls(placeId) {
    const all = store.get('polls', null) || JSON.parse(JSON.stringify(SEED_POLLS));
    return all[placeId] || [];
  },
  vote(placeId, pollId, optIdx) {
    const all = store.get('polls', null) || JSON.parse(JSON.stringify(SEED_POLLS));
    const mine = store.get('myvotes', {});
    const poll = (all[placeId] || []).find((p) => p.id === pollId);
    if (!poll) return null;
    const key = placeId + ':' + pollId;
    if (mine[key] !== undefined) poll.options[mine[key]].v = Math.max(0, poll.options[mine[key]].v - 1);
    poll.options[optIdx].v += 1;
    mine[key] = optIdx;
    store.set('polls', all); store.set('myvotes', mine);
    return poll;
  },
  myVote(placeId, pollId) { return (store.get('myvotes', {}))[placeId + ':' + pollId]; },
  moments() {
    const now = Date.now();
    const seeded = SEED_MOMENTS.map((m) => ({ ...m, t: now - m.hoursAgo * 36e5, expires: now - m.hoursAgo * 36e5 + 24 * 36e5 }));
    const mine = store.get('moments', []);
    return [...mine, ...seeded].filter((m) => m.expires > now).sort((a, b) => b.t - a.t);
  },
  postMoment(text, placeId, author) {
    const now = Date.now();
    const mine = store.get('moments', []);
    mine.unshift({ id: 'm' + now.toString(36), author: author || 'You', text: String(text).slice(0, 140), placeId, t: now, expires: now + 24 * 36e5 });
    store.set('moments', mine.slice(0, 20));
    return mine[0];
  },
  recordLinkup() { store.set('linkups', (store.get('linkups', 0) + 1)); },
  linkupCount() { return store.get('linkups', 0); },
  leaderboard(friends, visitedCount) {
    const rows = friends.map((f, i) => ({
      name: f.name.split(' ')[0], score: (f.online ? 3 : 0) + ((f.dist < 200 ? 2 : 0)) + ((i * 7) % 4),
      detail: `${f.spot}`,
    }));
    rows.push({ name: 'You', score: 4 + visitedCount + Math.min(6, this.linkupCount() * 2), detail: `${visitedCount} places · ${this.linkupCount()} link ups`, me: true });
    return rows.sort((a, b) => b.score - a.score);
  },
};
