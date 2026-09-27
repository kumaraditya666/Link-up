/* Link Up — NSUT campus data (mock live layer, persisted where it matters) */
export const ME = { id: 'me', name: 'Aditya', short: 'A', dept: "CSE '27", grad: 'linear-gradient(135deg,#f59e0b,#ef4444)' };

export const SPOTS = ['SAC', 'Main Canteen', 'Nescafe', 'Central Library', 'Amphitheatre', 'Football Ground'];

export const FRIENDS = [
  { id: 'ananya', name: 'Ananya Sharma', short: 'AS', dept: "CSE '27", grad: 'linear-gradient(135deg,#7c3aed,#ec4899)', spot: 'Near SAC', dist: 80, online: true, x: 560, y: 300, vibe: 'Chai + debug break ☕' },
  { id: 'kabir', name: 'Kabir Mehta', short: 'KM', dept: "ECE '26", grad: 'linear-gradient(135deg,#06b6d4,#3b82f6)', spot: 'Near Amphitheatre', dist: 120, online: true, x: 700, y: 430, vibe: 'Frisbee? 🥏' },
  { id: 'meera', name: 'Meera Iyer', short: 'MI', dept: "BT '27", grad: 'linear-gradient(135deg,#10b981,#06b6d4)', spot: 'Central Library', dist: 210, online: true, x: 430, y: 220, vibe: 'Study room 2 📚' },
  { id: 'arjun', name: 'Arjun Rao', short: 'AR', dept: "ME '25", grad: 'linear-gradient(135deg,#f59e0b,#ef4444)', spot: 'Football Ground', dist: 340, online: true, x: 220, y: 470, vibe: 'Evening trials ⚽' },
  { id: 'sara', name: 'Sara Khan', short: 'SK', dept: "CSE '26", grad: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', spot: 'Nescafe', dist: 150, online: true, x: 610, y: 360, vibe: 'Cold coffee run 🧋' },
  { id: 'rohan', name: 'Rohan Verma', short: 'RV', dept: "ICE '27", grad: 'linear-gradient(135deg,#334155,#06b6d4)', spot: 'Hostel BH-2', dist: 480, online: false, x: 830, y: 200, vibe: 'Back in 20 ⏳' },
  { id: 'ishita', name: 'Ishita Gupta', short: 'IG', dept: "CSA '26", grad: 'linear-gradient(135deg,#ec4899,#f59e0b)', spot: 'Main Canteen', dist: 190, online: true, x: 520, y: 420, vibe: 'Rajma chawal > everything 🍛' },
  { id: 'vikram', name: 'Vikram Singh', short: 'VS', dept: "CE '25", grad: 'linear-gradient(135deg,#22c55e,#a3e635)', spot: 'Sports Complex', dist: 410, online: false, x: 300, y: 560, vibe: 'Gym leg day 🦵' },
];

export const BUILDINGS = [
  { id: 'admin', label: 'Admin Block', x: 500, y: 140, w: 150, h: 70, c: '#2b3a6e', food: false },
  { id: 'library', label: 'Central Library', x: 400, y: 210, w: 130, h: 62, c: '#31437c', food: false },
  { id: 'apj', label: 'APJ Complex', x: 620, y: 200, w: 150, h: 66, c: '#2e3d75', food: false },
  { id: 'sac', label: 'SAC', x: 545, y: 300, w: 120, h: 60, c: '#6d28d9', food: false, hot: true },
  { id: 'nescafe', label: 'Nescafe', x: 620, y: 355, w: 90, h: 44, c: '#7c4a12', food: true },
  { id: 'canteen', label: 'Main Canteen', x: 500, y: 425, w: 140, h: 60, c: '#8a5a10', food: true, hot: true },
  { id: 'amphi', label: 'Amphitheatre', x: 710, y: 440, w: 120, h: 60, c: '#155e75', food: false },
  { id: 'sports', label: 'Sports Complex', x: 280, y: 550, w: 150, h: 66, c: '#166534', food: false },
  { id: 'ground', label: 'Football Ground', x: 190, y: 440, w: 170, h: 90, c: '#15803d', food: false, field: true },
  { id: 'hostel', label: 'Hostel BH-2', x: 830, y: 190, w: 120, h: 60, c: '#334155', food: false },
  { id: 'innovation', label: 'Innovation Centre', x: 340, y: 330, w: 130, h: 56, c: '#0e7490', food: false },
];

export const PLACES = [
  { id: 'sac', name: 'Student Activity Centre', short: 'SAC', cat: 'hangout', emoji: '🛸', rating: 4.8, busy: 'Very lively', visited: true, desc: 'Clubs, music, adda. The beating heart of NSUT evenings.', hours: '9 AM – 9 PM' },
  { id: 'canteen', name: 'Main Canteen', short: 'Canteen', cat: 'food', emoji: '🍛', rating: 4.6, busy: 'Busy at lunch', visited: true, desc: 'Rajma chawal, momos, cold coffee. Legends are made in this queue.', hours: '8 AM – 8 PM' },
  { id: 'nescafe', name: 'Nescafe Kiosk', short: 'Nescafe', cat: 'food', emoji: '☕', rating: 4.4, busy: 'Chill', visited: true, desc: 'Quick cold coffee between lectures. The unofficial meeting point.', hours: '9 AM – 7 PM' },
  { id: 'library', name: 'Central Library', short: 'Library', cat: 'study', emoji: '📚', rating: 4.7, busy: 'Quiet', visited: false, desc: 'AC, deep focus, group rooms on floor 2. Exam-season HQ.', hours: '8 AM – 10 PM' },
  { id: 'amphi', name: 'Amphitheatre', short: 'Amphi', cat: 'hangout', emoji: '🎭', rating: 4.9, busy: 'Sunset crowd', visited: false, desc: 'Open-air screenings, jams and the best sunset on campus.', hours: 'Open · best at 6 PM' },
  { id: 'ground', name: 'Football Ground', short: 'Ground', cat: 'hangout', emoji: '⚽', rating: 4.5, busy: 'Trials on', visited: false, desc: 'Evening football, frisbee and long walks around the track.', hours: '5 AM – 8 PM' },
  { id: 'apj', name: 'APJ Complex', short: 'APJ', cat: 'study', emoji: '💻', rating: 4.2, busy: 'Classes on', visited: false, desc: 'Lecture halls + labs. Most “bunk and Nescafe” plans start here.', hours: '9 AM – 5 PM' },
  { id: 'sports', name: 'Sports Complex', short: 'Sports', cat: 'hangout', emoji: '🏸', rating: 4.3, busy: 'Moderate', visited: false, desc: 'Badminton, gym, basketball. Book courts on the NSUT app.', hours: '6 AM – 9 PM' },
];

export const EVENTS = [
  { id: 'ev1', title: 'HackNSUT 48-hr Hackathon', org: 'C societies', day: 'Today', date: '27', mon: 'SEP', time: '6 PM · APJ Complex', going: 214, tag: 'Tech', hot: true, emoji: '💻' },
  { id: 'ev2', title: 'Resonanz Auditions — Music', org: 'Resonanz', day: 'Today', date: '27', mon: 'SEP', time: '5 PM · SAC', going: 96, tag: 'Culture', hot: true, emoji: '🎸' },
  { id: 'ev3', title: 'Stargazing Night 🔭', org: 'Astronomy club', day: 'Tomorrow', date: '28', mon: 'SEP', time: '9 PM · Football Ground', going: 58, tag: 'Chill', emoji: '✨' },
  { id: 'ev4', title: 'Football Trials — Freshers', org: 'Sports council', day: 'Tomorrow', date: '28', mon: 'SEP', time: '6 AM · Main Ground', going: 73, tag: 'Sports', emoji: '⚽' },
  { id: 'ev5', title: 'E-Summit: Startup Mixer', org: 'E-Cell', day: 'Sat', date: '04', mon: 'OCT', time: '11 AM · Innovation Centre', going: 187, tag: 'Startup', emoji: '🚀' },
];

export const TRAILS = [
  { id: 't1', title: 'Food Hunt 🍜', meta: '5 stops · 800 m', desc: 'Nescafe → Canteen → Night maggi point. Rate each bite.', pct: 60 },
  { id: 't2', title: 'Sunset Points 🌅', meta: '3 stops · 600 m', desc: 'Amphi → Ground → Hostel terrace view.', pct: 20 },
  { id: 't3', title: 'Focus Trail 📖', meta: '4 stops · quiet', desc: 'Library → APJ labs → Innovation Centre reading nook.', pct: 0 },
  { id: 't4', title: 'Hidden NSUT 👻', meta: '6 stops · secret', desc: 'Murals, old banyan, the “whisper” corridor.', pct: 0 },
];

export const THREADS = {
  ananya: [
    { from: 'them', text: 'Library scene? Room 2 has space 👀', t: '4:12 PM' },
    { from: 'me', text: 'On my way — save me a seat!', t: '4:14 PM' },
    { from: 'them', text: 'Done. Grab a Nescafe on the way? 🧋', t: '4:15 PM' },
  ],
  kabir: [
    { from: 'them', text: 'Frisbee at amphi, 6 PM. You in?', t: '2:02 PM' },
    { from: 'me', text: '100% — bringing Ishita too', t: '2:05 PM' },
  ],
  sara: [{ from: 'them', text: 'Cold coffee debt = 1. Pay up at Nescafe 😤', t: '1:40 PM' }],
  ishita: [
    { from: 'them', text: 'Canteen rajma hits different today 🍛', t: '12:20 PM' },
    { from: 'me', text: 'Save me a plate!!', t: '12:22 PM' },
  ],
};

export const QUICK = ['On my way ⚡', 'Where exactly?', '5 mins ⏳', 'Link up? 🤝', 'At SAC, come over!'];
