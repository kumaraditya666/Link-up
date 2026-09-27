/* Link Up — NSUT campus data.
 * Geography follows the verified reference layout: North Gate NW, Main Gate SW,
 * Design + Boys Hostels north, Canteen/APJ/Smart north-central, Amul Ground,
 * Moksha Ground central (main fest venue), Admin + Academic Blocks + SAC/Library
 * mid-campus, Gym east, Sports Complex far east, NESCII halls, Guest House +
 * Girls Hostel south. Positions are stylized approximations, not survey data.
 */
export const ME = { id: 'me', name: 'Aditya', short: 'A', dept: "CSE '27", grad: '#232b3d' };

export const SPOTS = ['Moksha Ground', 'Student Canteen', 'SAC Lawns', 'Amul Ground', 'Central Library', 'Flag Circle'];

export const FRIENDS = [
  { id: 'ananya', name: 'Ananya Sharma', short: 'AS', dept: "CSE '27", grad: '#262f45', spot: 'SAC Lawns', dist: 153, online: true, x: 520, y: 390, vibe: 'Chai + debug break ☕' },
  { id: 'kabir', name: 'Kabir Mehta', short: 'KM', dept: "ECE '26", grad: '#20293b', spot: 'Moksha Ground', dist: 140, online: true, x: 470, y: 300, vibe: 'Frisbee? 🥏' },
  { id: 'meera', name: 'Meera Iyer', short: 'MI', dept: "BT '27", grad: '#2b3348', spot: 'Near Library', dist: 180, online: true, x: 550, y: 395, vibe: 'Study room 2 📚' },
  { id: 'arjun', name: 'Arjun Rao', short: 'AR', dept: "ME '25", grad: '#242e42', spot: 'Sports Complex', dist: 392, online: true, x: 780, y: 470, vibe: 'Evening trials ⚽' },
  { id: 'sara', name: 'Sara Khan', short: 'SK', dept: "CSE '26", grad: '#2e3648', spot: 'Student Canteen', dist: 221, online: true, x: 460, y: 180, vibe: 'Cold coffee run 🧋' },
  { id: 'rohan', name: 'Rohan Verma', short: 'RV', dept: "ICE '27", grad: '#222a3c', spot: 'Boys Hostel', dist: 255, online: false, x: 200, y: 160, vibe: 'Back in 20 ⏳' },
  { id: 'ishita', name: 'Ishita Gupta', short: 'IG', dept: "CSA '26", grad: '#2c3449', spot: 'Amul Ground', dist: 184, online: true, x: 230, y: 235, vibe: 'Rajma chawal > everything 🍛' },
  { id: 'vikram', name: 'Vikram Singh', short: 'VS', dept: "CE '25", grad: '#232b3d', spot: 'Near Main Gate', dist: 265, online: false, x: 60, y: 450, vibe: 'Gym leg day 🦵' },
];

export const BUILDINGS = [
  { id: 'north-gate', label: 'North Gate', x: 30, y: 133, w: 40, h: 26, c: '#334155', food: false },
  { id: 'design', label: 'Design Block', x: 130, y: 100, w: 90, h: 44, c: '#2e3d75', food: false },
  { id: 'boys-a', label: 'Boys Hostel', x: 200, y: 160, w: 90, h: 50, c: '#334155', food: false },
  { id: 'boys-b', label: 'Boys Hostel', x: 300, y: 190, w: 90, h: 50, c: '#334155', food: false },
  { id: 'canteen', label: 'Student Canteen', x: 460, y: 180, w: 110, h: 48, c: '#8a5a10', food: true, hot: true },
  { id: 'safal', label: 'Safal', x: 380, y: 205, w: 30, h: 20, c: '#7c4a12', food: true },
  { id: 'apj', label: 'APJ Complex', x: 425, y: 225, w: 110, h: 52, c: '#2e3d75', food: false },
  { id: 'stationary', label: 'Stationary', x: 510, y: 215, w: 30, h: 20, c: '#475069', food: false },
  { id: 'smart', label: 'Smart Block', x: 550, y: 238, w: 60, h: 40, c: '#4c3a6e', food: false },
  { id: 'amul-ground', label: 'Amul Ground', x: 230, y: 235, w: 150, h: 90, c: '#15803d', food: false, field: true },
  { id: 'nescii2', label: 'NESCII 2', x: 210, y: 300, w: 110, h: 70, c: '#3f5a44', food: false },
  { id: 'moksha-ground', label: 'Moksha Ground', x: 475, y: 295, w: 270, h: 65, c: '#7c5a24', food: false, field: true, hot: true },
  { id: 'admin', label: 'Admin Block', x: 345, y: 355, w: 54, h: 112, c: '#2b3a6e', food: false },
  { id: 'academic-a', label: 'Academic Block', x: 430, y: 400, w: 90, h: 56, c: '#31437c', food: false },
  { id: 'academic-b', label: 'Academic Block', x: 490, y: 340, w: 90, h: 56, c: '#31437c', food: false },
  { id: 'sac-lib', label: 'SAC · Library', x: 550, y: 395, w: 110, h: 56, c: '#6d28d9', food: false, hot: true },
  { id: 'gym', label: 'Gym', x: 630, y: 357, w: 70, h: 44, c: '#166534', food: false },
  { id: 'flag', label: 'Flag Circle', x: 300, y: 358, w: 50, h: 50, c: '#a8912f', food: false },
  { id: 'nescii1', label: 'NESCII 1', x: 270, y: 420, w: 110, h: 70, c: '#3f5a44', food: false },
  { id: 'main-gate', label: 'Main Gate', x: 30, y: 450, w: 40, h: 26, c: '#334155', food: false },
  { id: 'guest', label: 'Guest House', x: 400, y: 490, w: 70, h: 40, c: '#6e6252', food: false },
  { id: 'girls', label: 'Girls Hostel', x: 470, y: 540, w: 100, h: 52, c: '#334155', food: false },
  { id: 'sports', label: 'Sports Complex', x: 780, y: 470, w: 170, h: 190, c: '#15803d', food: false, field: true },
];

export const PLACES = [
  { id: 'sac-lib', name: 'SAC & Central Library', short: 'Library', cat: 'study', emoji: '📚', rating: 4.8, busy: 'Lively days', visited: true, desc: 'SAC underground, Library on 1st–2nd floor, Computer Centre on 3rd. One building, three worlds.', hours: '8 AM – 10 PM' },
  { id: 'canteen', name: 'Student Canteen', short: 'Canteen', cat: 'food', emoji: '🍛', rating: 4.6, busy: 'Busy at lunch', visited: true, desc: 'Rajma chawal, momos, cold coffee up north. Legends are made in this queue.', hours: '8 AM – 8 PM' },
  { id: 'moksha-ground', name: 'Moksha Ground', short: 'Moksha', cat: 'hangout', emoji: '🎭', rating: 4.9, busy: 'Fest season 🔥', visited: true, desc: 'The big central ground — Moksha main stage territory and evening crowds.', hours: 'Open · best at 6 PM' },
  { id: 'amul-ground', name: 'Amul Ground', short: 'Amul', cat: 'hangout', emoji: '🌳', rating: 4.4, busy: 'Chill', visited: false, desc: 'Green breather next to APJ. Frisbee, adda and pre-class naps.', hours: 'Open all day' },
  { id: 'admin', name: 'Admin Block', short: 'Admin', cat: 'study', emoji: '🏛️', rating: 4.2, busy: 'Working hours', visited: false, desc: 'Offices, auditorium and the roundabout everyone uses as a landmark.', hours: '9 AM – 5 PM' },
  { id: 'apj', name: 'APJ Complex', short: 'APJ', cat: 'study', emoji: '💻', rating: 4.3, busy: 'Classes on', visited: false, desc: 'Lecture halls + labs with serious student-of-the-year vibes.', hours: '9 AM – 5 PM' },
  { id: 'sports', name: 'Sports Complex', short: 'Sports', cat: 'hangout', emoji: '🏟️', rating: 4.5, busy: 'Evenings', visited: false, desc: 'Running track, football field and courts on the far east side.', hours: '5 AM – 8 PM' },
  { id: 'flag', name: 'Flag Circle', short: 'Flag', cat: 'hangout', emoji: '🚩', rating: 4.6, busy: 'Sunset crowd', visited: false, desc: 'The flag roundabout by Main Gate road — default meetup point.', hours: 'Open all day' },
  { id: 'safal', name: 'Safal Store', short: 'Safal', cat: 'food', emoji: '🥤', rating: 4.1, busy: 'Quick bites', visited: false, desc: 'Grab-and-go snacks next to APJ. The 4 PM saviour.', hours: '9 AM – 7 PM' },
  { id: 'north-gate', name: 'North Gate', short: 'North Gate', cat: 'hangout', emoji: '🚪', rating: 4.0, busy: 'Mornings', visited: false, desc: 'Northwestern entry by Design Block and hostels.', hours: 'Open 6 AM – 10 PM' },
  { id: 'main-gate', name: 'Main Gate', short: 'Main Gate', cat: 'hangout', emoji: '🏁', rating: 4.2, busy: 'Evenings', visited: false, desc: 'Southwestern main entry on Azad Hind Fauj Marg.', hours: 'Open 24x7' },
];

export const EVENTS = [
  { id: 'ev1', title: 'HackNSUT 48-hr Hackathon', org: 'C societies', day: 'Today', date: '27', mon: 'SEP', time: '6 PM · APJ Complex', going: 214, tag: 'Tech', hot: true, emoji: '💻' },
  { id: 'ev2', title: 'Resonanz Auditions — Music', org: 'Resonanz', day: 'Today', date: '27', mon: 'SEP', time: '5 PM · SAC', going: 96, tag: 'Culture', hot: true, emoji: '🎸' },
  { id: 'ev3', title: 'Stargazing Night 🔭', org: 'Astronomy club', day: 'Tomorrow', date: '28', mon: 'SEP', time: '9 PM · Moksha Ground', going: 58, tag: 'Chill', emoji: '✨' },
  { id: 'ev4', title: 'Football Trials — Freshers', org: 'Sports council', day: 'Tomorrow', date: '28', mon: 'SEP', time: '6 AM · Sports Complex', going: 73, tag: 'Sports', emoji: '⚽' },
  { id: 'ev5', title: 'E-Summit: Startup Mixer', org: 'E-Cell', day: 'Sat', date: '04', mon: 'OCT', time: '11 AM · NESCII 1', going: 187, tag: 'Startup', emoji: '🚀' },
];

export const TRAILS = [
  { id: 't1', title: 'Food Hunt 🍜', meta: '2 stops · canteen run', desc: 'Canteen → Safal. Check in at each bite.', stops: ['canteen', 'safal'], badge: 'Foodie 🍛' },
  { id: 't2', title: 'Sunset Points 🌅', meta: '3 stops · golden hour', desc: 'Flag Circle → Moksha Ground → Sports track.', stops: ['flag', 'moksha-ground', 'sports'], badge: 'Golden Hour 🌅' },
  { id: 't3', title: 'Focus Trail 📖', meta: '2 stops · quiet', desc: 'Library → APJ labs. Deep work mode.', stops: ['sac-lib', 'apj'], badge: 'Deep Work 📖' },
  { id: 't4', title: 'Hidden NSUT 👻', meta: '3 stops · gates run', desc: 'North Gate → Flag → Main Gate. End to end.', stops: ['north-gate', 'flag', 'main-gate'], badge: 'Pathfinder 🧭' },
];

export const THREADS = {
  ananya: [
    { from: 'them', text: 'Library scene? Floor 2 has space 👀', t: '4:12 PM' },
    { from: 'me', text: 'On my way — save me a seat!', t: '4:14 PM' },
    { from: 'them', text: 'Done. Grab something from Safal? 🧋', t: '4:15 PM' },
  ],
  kabir: [
    { from: 'them', text: 'Frisbee at Moksha Ground, 6 PM. You in?', t: '2:02 PM' },
    { from: 'me', text: '100% — bringing Ishita too', t: '2:05 PM' },
  ],
  sara: [{ from: 'them', text: 'Cold coffee debt = 1. Pay up at canteen 😤', t: '1:40 PM' }],
  ishita: [
    { from: 'them', text: 'Amul Ground breeze hits different today 🍃', t: '12:20 PM' },
    { from: 'me', text: 'Saving us a spot!', t: '12:22 PM' },
  ],
};

export const QUICK = ['On my way ⚡', 'Where exactly?', '5 mins ⏳', 'Link up? 🤝', 'At Moksha Ground, come over!'];
