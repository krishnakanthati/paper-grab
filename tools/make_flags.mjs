// Builds public/flags.json: one small PNG flag per playable country (ids are ISO 3166 alpha-3, as in countries.json), as base64.
// Flags come from flagcdn.com at build time only; the game itself never calls an outside address (they ship as this one file).
//   node tools/make_flags.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const WIDTH = 160;
const ne = JSON.parse(readFileSync('tools/.cache/ne_110m_admin_0_countries.geojson', 'utf8'));
const a2 = new Map(ne.features.map(f => [f.properties.ADM0_A3, String(f.properties.ISO_A2_EH).toLowerCase()]));
const ids = JSON.parse(readFileSync('public/countries.json', 'utf8')).countries.map(c => c.i);

const flags = {};
let next = 0;
async function worker() {
  while (next < ids.length) {
    const id = ids[next++], code = a2.get(id);
    if (!code || code.length !== 2) throw new Error('no two-letter code for ' + id);
    const r = await fetch(`https://flagcdn.com/w${WIDTH}/${code}.png`);
    if (!r.ok) throw new Error(`${id} (${code}): HTTP ${r.status}`);
    flags[id] = Buffer.from(await r.arrayBuffer()).toString('base64');
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const sorted = Object.fromEntries(Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('public/flags.json', JSON.stringify({ version: 1, mime: 'image/png', flags: sorted }));
console.log(Object.keys(sorted).length, 'flags');
