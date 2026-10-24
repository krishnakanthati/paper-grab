import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { playablesConfig, shippedOutputs, MAX_FILE_BYTES } from '../../tools/bundle.mjs';
import { forPlayables } from '../../tools/playables.mjs';

// YouTube Playables requirements that can be checked from the code: no outside calls or URLs, no clipboard, no eval / `new Function` /
// web workers / WebAssembly, no collecting personal information, no obfuscation, one page. These build the real YouTube bundle in memory
// and look at what would actually ship.
const bundle = async () => {
  const r = await build({ ...playablesConfig({ outdir: 'out', logLevel: 'silent' }), write: false });
  const real = new Set(shippedOutputs(r.metafile.outputs).map(([k]) => k.split('/').pop()));                // the stub entries that only steer the split are not shipped
  return r.outputFiles.filter(f => real.has(f.path.split('/').pop())).map(f => ({ name: f.path.split('/').pop(), text: f.text }));
};
let files, text;
test.before(async () => { files = await bundle(); text = files.map(f => f.text).join('\n'); });

test('every shipped script is under the 512 KiB per-file guidance, and the page loads the main one as a module', () => {
  assert.ok(files.length > 1 && files.some(f => f.name === 'game.js'));
  for (const f of files) assert.ok(Buffer.byteLength(f.text) <= MAX_FILE_BYTES, `${f.name} is ${(Buffer.byteLength(f.text) / 1024).toFixed(0)} KiB`);
  assert.match(forPlayables(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8')), /<script type="module" src="game\.js"><\/script>/);
});

test('language features Playables may decline are not in the shipped bundle: no eval, no new Function, no workers, no WebAssembly', () => {
  for (const pat of ['eval(', 'new Function', 'new Worker', 'SharedWorker', 'importScripts', 'WebAssembly', 'new SharedArrayBuffer']) assert.equal(text.includes(pat), false, `the bundle contains ${pat}`);
});

test('no outside calls: no XHR, sockets, beacons, event streams or script injection, and no outside URLs in the code', () => {
  for (const pat of ['XMLHttpRequest', 'WebSocket(', 'sendBeacon', 'EventSource(', 'createElement("script")', "createElement('script')", 'document.write(']) assert.equal(text.includes(pat), false, `the bundle contains ${pat}`);
  const urls = [...text.matchAll(/https?:\/\/[A-Za-z0-9./_?=&%#:-]{4,}/g)].map(m => m[0]);
  const bad = urls.filter(u => u !== 'http://www.w3.org/1999/xhtml');            // the XML namespace of HTML text is an identifier, not a call
  assert.deepEqual(bad, [], 'outside URLs in the code');
});

test('no clipboard access, no cookies, no personal data: there is no text field at all', () => {
  for (const pat of ['navigator.clipboard', 'execCommand("copy")', 'execCommand("paste")', 'document.cookie']) assert.equal(text.includes(pat), false, pat);
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const inputs = [...html.matchAll(/<input[^>]*>/g)].map(m => m[0]);
  assert.equal(inputs.length, 0);
  assert.doesNotMatch(html, /type="(password|email|tel)"|autocomplete="(username|email|name|password)"/i, 'nothing asks for personal details');
  assert.doesNotMatch(html, /<form/i, 'and there is no login or sign-up form');
});

test('the YouTube page makes no reference to any outside URL except Google\'s own SDK', () => {
  const page = forPlayables(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
  const urls = page.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  assert.deepEqual(urls, ['https://www.youtube.com/game_api/v1'], 'only the Playables SDK');
  assert.match(page, /<title>Paper Grab/); assert.match(page, /name="description"/);
});

test('the code is only minified, not obfuscated: no string-array decoders or encoded payloads, and the source is plain TypeScript', () => {
  assert.equal(/_0x[0-9a-f]{4,}/.test(text), false, 'no obfuscator-style identifiers');
  assert.equal(/\\x[0-9a-f]{2}\\x[0-9a-f]{2}\\x[0-9a-f]{2}/i.test(text), false, 'no hex-escaped string payloads');
  assert.ok(text.length > 500_000 && text.length < 2_500_000, 'a plain bundle of sensible size: ' + text.length);
});

test('it is one page: a single index.html, no router, no frames or pop-ups opened', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<iframe/gi) ?? []).length, 0);
  assert.equal(text.includes('window.open('), false);
});

test('no monetization of any kind: no ad networks, payment services, purchases or tip jars (the rules allow only YouTube-provided ads, which this game does not use)', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const src = ['main.ts', 'session.ts'].map(f => fs.readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8')).join('\n');
  const banned = /adsbygoogle|adsense|googletag|doubleclick|admob|paypal|stripe|checkout|purchase|in-app|patreon|ko-fi|buymeacoffee|monetiz|buy now/i;
  assert.equal(banned.test(html), false, 'the page');
  assert.equal(banned.test(text), false, 'the bundle');
  assert.equal(banned.test(src), false, 'the entry code');
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts.filter(u => /^https?:/.test(u)), ['https://www.youtube.com/game_api/v1'], 'the only outside script is the Playables SDK');
});

test('stability rules for the files: relative paths only, plain file names, few files, and every file under the size limits that matter', () => {
  const page = forPlayables(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
  for (const m of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const ref = m[1];
    if (ref === 'https://www.youtube.com/game_api/v1') continue;                    // Google's own SDK
    assert.equal(/^(\/|https?:|file:)/.test(ref), false, `${ref} is not a relative path`);
    assert.equal(ref.includes('?'), false, `${ref} has a query string`);
  }
  const css = fs.readFileSync(new URL('../../styles/main.css', import.meta.url), 'utf8');
  assert.equal(/url\(\s*['"]?(\/|https?:)/.test(css), false, 'no absolute url() in the stylesheet');
  const pub = fs.readdirSync(new URL('../../public/', import.meta.url));
  for (const f of [...pub, 'index.html', 'style.css', ...files.map(x => x.name)]) assert.match(f, /^[A-Za-z0-9_.-]+$/, `${f} has a character YouTube does not allow in file names`);
  assert.ok(pub.length + 2 + files.length <= 8000);
  for (const f of pub) assert.ok(fs.statSync(new URL('../../public/' + f, import.meta.url)).size < 30 * 1024 * 1024, `${f} is over the 30 MiB hard limit`);
  assert.ok(text.length < 15 * 1024 * 1024, 'the initial bundle is far below 15 MiB');
});
