import { build } from 'esbuild';
import { bundleConfig, playablesConfig, shippedOutputs, MAX_FILE_BYTES } from './tools/bundle.mjs';
import { forPlayables } from './tools/playables.mjs';
import { bust, hashOf } from './tools/cachebust.mjs';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs';

// `node build.mjs`              -> dist/            (also writes countries.js, so the page works opened straight from a file)
// `node build.mjs --playables`  -> dist-playables/  (what gets uploaded to YouTube Playables: served over http, so no countries.js)
const playables = process.argv.includes('--playables');
const out = playables ? 'dist-playables' : 'dist';

rmSync(out, { recursive: true, force: true });                         // no stale chunk files from an earlier build
mkdirSync(out, { recursive: true });
if (playables) {
  const r = await build(playablesConfig({ outdir: out }));
  for (const [file, o] of Object.entries(r.metafile.outputs)) if (!shippedOutputs({ [file]: o }).length) rmSync(file);                  // the stub entries that only steer the file split
  for (const [file, o] of shippedOutputs(r.metafile.outputs)) {
    console.log(file.padEnd(32), (o.bytes / 1024).toFixed(1) + ' KB');
    if (o.bytes > MAX_FILE_BYTES) throw new Error(`${file} is over the 512 KiB per-file limit`);
  }
} else await build(bundleConfig({ playables, outfile: `${out}/game.js` }));
if (playables) writeFileSync(`${out}/index.html`, forPlayables(readFileSync('index.html', 'utf8')));
else copyFileSync('index.html', `${out}/index.html`);
copyFileSync('styles/main.css', `${out}/style.css`);
if (existsSync('public')) cpSync('public', out, { recursive: true });   // countries.json and any other static files
if (!playables) {                                                       // stamp the stylesheet and script URLs with their content hash (see tools/cachebust.mjs); not in the YouTube build, which must use plain file names and YouTube versions its own uploads
  const hashes = { 'style.css': hashOf(readFileSync(`${out}/style.css`)), 'game.js': hashOf(readFileSync(`${out}/game.js`)) };
  writeFileSync(`${out}/index.html`, bust(readFileSync(`${out}/index.html`, 'utf8'), hashes));
}
if (!playables && existsSync(`${out}/flags.json`))
  writeFileSync(`${out}/flags.js`, 'window.__PG_FLAGS__=' + readFileSync(`${out}/flags.json`, 'utf8') + ';');
if (!playables && existsSync(`${out}/countries.json`))
  writeFileSync(`${out}/countries.js`, 'window.__PG_COUNTRIES__=' + readFileSync(`${out}/countries.json`, 'utf8') + ';');   // lets file:// pages load the list too
for (const f of ['index.html', 'style.css', 'game.js', 'countries.json', 'countries.js'])
  if (existsSync(`${out}/${f}`)) console.log(`${out}/${f}`.padEnd(32), (statSync(`${out}/${f}`).size / 1024).toFixed(1) + ' KB');
