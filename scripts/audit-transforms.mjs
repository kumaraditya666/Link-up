/* Link Up — transform audit (Phase 1 of model upgrade).
 * Extracts every runtime placement (model file, map id, x, y, rotation) from
 * js/map.js and snapshots it to models/transforms.lock.json.
 * Re-run after ANY change and diff: any moved entry fails the check.
 * Run: node scripts/audit-transforms.mjs [--check]
 */
import fs from 'fs';

const src = fs.readFileSync('js/map.js', 'utf8');
const m = src.match(/const PLACEMENTS = \[([\s\S]*?)\];/);
if (!m) throw new Error('PLACEMENTS not found');
const rows = [...m[1].matchAll(/\{[^}]*\}/g)].map((x) => x[0]);
const table = rows.map((r) => {
  const get = (k) => {
    const mm = r.match(new RegExp(k + ':\\s*([^,}]+)'));
    return mm ? mm[1].trim() : null;
  };
  const num = (v) => (v === null || v === undefined ? v : Number(v));
  return {
    model: (get('m') || '').replace(/['"]/g, ''),
    id: (get('id') || '').replace(/['"]/g, ''),
    x: num(get('x')), y: num(get('y')),
    ry: get('ry') || '0',
    skip: r.includes('skip'),
  };
});
const lockPath = 'models/transforms.lock.json';
if (process.argv.includes('--check')) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const a = JSON.stringify(lock), b = JSON.stringify(table);
  if (a !== b) {
    console.error('TRANSFORM CHECK FAILED — placements moved:');
    for (let i = 0; i < Math.max(lock.length, table.length); i++) {
      if (JSON.stringify(lock[i]) !== JSON.stringify(table[i])) {
        console.error(' was:', JSON.stringify(lock[i]));
        console.error(' now :', JSON.stringify(table[i]));
      }
    }
    process.exit(1);
  }
  console.log(`LOCK OK — ${table.length} placements unchanged`);
} else {
  fs.writeFileSync(lockPath, JSON.stringify(table, null, 2));
  console.log(`locked ${table.length} placements -> ${lockPath}`);
  console.log(table.map((t) => `${t.model} :: ${t.id} @(${t.x},${t.y}) ry=${t.ry}${t.skip ? ' SKIP' : ''}`).join('\n'));
}
