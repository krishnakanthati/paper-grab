import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const html = fs.readFileSync(root + 'index.html', 'utf8');
const css = fs.readFileSync(root + 'styles/main.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const sources = walk(root + 'src').filter(f => f.endsWith('.ts'));

const rule = (selector) => {                                            // the declarations of the first rule whose selector list contains `selector`
  const re = new RegExp('(?:^|(?<=\\}))\\s*([^{}]*)\\{([^{}]*)\\}', 'g');
  let m; const found = [];
  while ((m = re.exec(css))) if (m[1].split(',').map(s => s.trim()).includes(selector)) found.push(m[2]);
  return found.join(';');
};

test('every element id the code looks up exists in index.html (a missing one would crash at startup)', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const wanted = new Set();
  for (const f of sources) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\$(?:<[^>]*>)?\(\s*'([^']+)'\s*\)/g)) wanted.add(m[1]);
  assert.ok(wanted.size > 10, 'expected to find the lookups');
  for (const id of wanted) assert.ok(ids.has(id), `src looks up #${id}, which is not in index.html`);
});

test('the HUD uses one row height: every pill, bar, avatar and the progress label share --row-h', () => {
  for (const sel of ['#plbl', '#ptrack', '.pill']) assert.match(rule(sel), /(?:^|;)\s*(?:min-)?height:\s*var\(--row-h\)/, `${sel} does not use --row-h`);
});

test('everything is rounded: pills are fully rounded and circles are circles', () => {
  for (const sel of ['#plbl', '#ptrack', '#pfill', '.pill', '#btn', '.secondary', '.picker-item']) assert.match(rule(sel), /border-radius:\s*999px/, `${sel} is not fully rounded`);
  for (const sel of ['.round']) assert.match(rule(sel), /border-radius:\s*50%/, `${sel} is not a circle`);
});

test('there is no star anywhere in the page', () => {
  assert.doesNotMatch(html, /<path d="M12 2\.5l2\.9 6/, 'the progress-bar star is still in the HTML');
  assert.doesNotMatch(html, /class="mark end"/);
  for (const f of sources) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /#ff7ad9/, `${f} still draws the pink star`);
});

test('mobile: viewport covers notches, safe-area insets are respected, and the layouts adapt to phones, landscape and touch', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /name="viewport"[^>]*width=device-width/);
  for (const side of ['top', 'right', 'bottom', 'left']) assert.match(css, new RegExp(`env\\(safe-area-inset-${side}`), `no safe-area-inset-${side}`);
  assert.match(css, /@media \(max-width: 520px\)/, 'no small-phone breakpoint');
  assert.match(css, /@media \(max-height: 470px\)/, 'no landscape-phone breakpoint');
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/, 'no touch-device rules');
  assert.match(css, /100dvh/, 'the page should size to the dynamic viewport so mobile toolbars do not cover it');
  assert.match(css, /overscroll-behavior:\s*none/);
});

test('touch targets are at least 44px on touch devices, and the on-screen arrows only appear there', () => {
  const touch = css.match(/@media \(hover: none\) and \(pointer: coarse\)\s*\{([^}]*\{[^}]*\}[^}]*)\}/s);
  assert.ok(touch, 'touch block not found');
  const btn = touch[1].match(/--btn:\s*(\d+)px/);
  assert.ok(btn && Number(btn[1]) >= 44, 'buttons should be >= 44px on touch: ' + (btn && btn[1]));
  assert.match(touch[1], /#dpad\s*\{\s*display:\s*block/);
  assert.match(rule('#dpad'), /display:\s*none/, 'the arrows must be hidden by default');
});

test('the start panel can scroll on short screens and keeps its content reachable', () => {
  assert.match(rule('#ov'), /overflow-y:\s*auto/);
  assert.match(css, /#ov > :first-child\s*\{\s*margin-top:\s*auto/, 'centering must degrade to top-aligned scrolling');
});

test('the HUD stays out of the way of the notch and the safe areas on all four corners', () => {
  for (const [sel, side] of [['#bar', 'top'], ['#progress', 'top'], ['#miniwrap', 'bottom'], ['#dpad', 'bottom']]) assert.match(rule(sel), new RegExp(`safe-${side[0]}`), `${sel} ignores the ${side} safe area`);
});

test('motion can be reduced: animations and transitions switch off for users who ask', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('every control has an accessible name', () => {
  for (const id of ['pause', 'snd']) assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`), `#${id} has no aria-label`);
  assert.match(html, /id="worldmap"[^>]*aria-label=/);
  for (const dir of ['up', 'down', 'left', 'right']) assert.match(html, new RegExp(`aria-label="${dir}"`), `no ${dir} button label`);
});

test('pull-to-refresh: its elements exist and its states are all styled', () => {
  for (const id of ['ptr', 'ptrBubble', 'ptrLabel']) assert.match(html, new RegExp(`id="${id}"`));
  for (const state of ['armed', 'loading', 'done', 'failed', 'settling']) assert.match(css, new RegExp(`#ptr\\.${state}`), `no style for #ptr.${state}`);
  assert.match(css, /#ov > \*\s*\{\s*translate:/);
});

test('smoothness: nothing in the in-game HUD uses a backdrop blur (it is recomputed every frame over the moving game)', () => {
  const hudRules = [rule('#ptrack'), rule('#bar .round'), rule('#dpad .round')].join(';');
  assert.match(hudRules, /backdrop-filter:\s*none/);
});

test('mobile: the start panel\'s action row never stacks or wraps, and key hints are not shown on touch screens', () => {
  assert.match(rule('#actions'), /flex-flow:\s*row nowrap/);
  assert.match(rule('#charPick'), /flex-flow:\s*row nowrap/);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)\s*\{\s*#keys\s*\{\s*display:\s*none;?\s*\}/);
  assert.doesNotMatch(html, /<kbd>w<\/kbd>/, 'the hint lists only the arrow keys'); assert.doesNotMatch(html, /&#859[2-5];/, 'arrowheads, not arrow glyphs');
  assert.match(html, /id="tilt"/);
});

test('the top-left row (eliminations, pause, sound, tilt) is one row of one height, and the coin is gone from the progress bar', () => {
  assert.doesNotMatch(html, /class="mark"/);
  assert.doesNotMatch(html, />\$</, 'no dollar sign anywhere');
  const bar = html.slice(html.indexOf('<div id="bar">'), html.indexOf('<div id="miniwrap"'));
  for (const id of ['kills', 'pause', 'snd', 'tilt']) assert.ok(bar.includes(`id="${id}"`), `${id} is in the bar row`);
  assert.match(rule('#bar'), /flex-flow:\s*row nowrap/);
  assert.match(rule('#bar > *'), /height:\s*var\(--row-h\)/);
  assert.match(rule('#bar .round'), /width:\s*var\(--row-h\)/, 'round buttons are squares of the same height');
});

test('the play button is just a 3D play icon: no pill, no border, no visible text, still labelled for screen readers', () => {
  assert.match(html, /<button id="btn" aria-label="play">\s*<svg class="play-ico"/);
  assert.match(html, /id="btnLabel" class="sr-only"/);
  const r = rule('#btn');
  assert.match(r, /border:\s*0/); assert.match(r, /background:\s*none/);
  assert.match(css, /#btn:active:not\(\[disabled\]\), #btn\.go\s*\{[^}]*translateY\(var\(--thick\)\)/s, 'pressing sinks it');
  assert.match(css, /\.face\s*\{\s*fill:\s*url\(#playFaceOn\)/, 'and turns it green');
  const shadows = [...css.matchAll(/#btn[^{]*\.play-ico\s*\{[^}]*drop-shadow\(([^)]*\)?[^)]*)\)/g)].map(m => m[1]);
  assert.ok(shadows.length >= 1, 'it keeps a low shadow');
  assert.match(rule('#btn:hover:not([disabled])'), /transform:\s*none/, 'no hover effect');
  assert.doesNotMatch(rule('#btn:hover:not([disabled]) .play-ico'), /./, 'and nothing changes on the icon when hovered');
  for (const sh of shadows) {
    const [, , y, blur] = sh.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/) ? [0, ...sh.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/).slice(1)].slice(0, 4) : [0, 0, 0, 0];
    assert.ok(Number(y) <= 3 && Number(blur) <= 4, `a low shadow only: ${sh}`);
    assert.ok(Number(sh.match(/rgba\([^)]*,\s*([\d.]+)\)/)[1]) <= 0.35, `and a faint one: ${sh}`);
  }
});

test('mobile: the direction pad is a tight cross of flat discs with arrowheads (no clumsy glyphs), and the progress bar never sits on the top-left row', () => {
  const pad = html.slice(html.indexOf('<div id="dpad"'), html.indexOf('<div id="ov"'));
  assert.equal((pad.match(/<svg/g) ?? []).length, 4, 'four arrowheads');
  assert.doesNotMatch(pad, /&#96[0-9]{2};/, 'no triangle glyphs');
  assert.match(rule('#progress'), /right:\s*calc\(var\(--safe-r\)/, 'the progress bar sits at the top right');
  assert.match(css, /@media \(max-width: 560px\)\s*\{\s*#progress\s*\{[^}]*width:\s*min\(34vw/s, 'on narrow screens the bar is shorter so it clears the top-left row');
  assert.match(rule('#dpad .dir'), /border:\s*0/);
});

test('no icon has a border: round buttons, the touch pad, the character arrows and the refresh bubble are all flat', () => {
  for (const sel of ['.round', '#bar .round', '#dpad .dir', '#charPick .round', '#ptrBubble']) assert.match(rule(sel), /border:\s*0/, `${sel} has a border`);
  assert.doesNotMatch(rule('.round'), /inset/, 'and no rim lines drawn inside it');
  assert.match(html, /<svg class="icon"/, 'the refresh bubble uses a single refresh icon');
  assert.doesNotMatch(css, /#ptrBubble \.(arc|track|ring)/, 'the old ring is gone');
});

test('branding: a title, description, icons, manifest and social tags in the page head, and the logo on the start panel', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<title>Paper Grab: [^<]+<\/title>/);
  for (const tag of ['name="description"', 'rel="icon" type="image/svg+xml"', 'rel="apple-touch-icon"', 'rel="manifest"', 'property="og:title"', 'property="og:image"', 'name="twitter:card"', 'rel="canonical"', 'name="theme-color"']) assert.ok(head.includes(tag), `missing ${tag}`);
  assert.match(html, /<svg id="logo" width="44" height="44"/, 'the logo has its own size, so it is small even if the stylesheet has not loaded');
  assert.match(rule('#logo'), /position:\s*absolute/); assert.match(rule('#logo'), /top:[^;]*safe-t/); assert.match(rule('#logo'), /left:[^;]*safe-l/);
  assert.match(rule('#logo'), /width:\s*44px/, 'small, in the top-left corner');
  for (const f of ['logo.svg', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og-image.png', 'manifest.webmanifest']) assert.ok(fs.existsSync(root + 'public/' + f), `public/${f} is missing`);
  const manifest = JSON.parse(fs.readFileSync(root + 'public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, 'Paper Grab'); assert.ok(manifest.icons.some(i => i.sizes === '512x512'));
});

import { bust, hashOf } from '../../tools/cachebust.mjs';
test('cache busting: every stylesheet and script URL carries a hash of its content, so an update is never served half old', () => {
  const page = '<link rel="stylesheet" href="style.css"><script src="game.js"></script><script src="https://example.com/x.js"></script>';
  const out = bust(page, { 'style.css': 'aaaa1111', 'game.js': 'bbbb2222' });
  assert.match(out, /href="style\.css\?v=aaaa1111"/); assert.match(out, /src="game\.js\?v=bbbb2222"/);
  assert.match(out, /src="https:\/\/example\.com\/x\.js"/, 'other scripts are left alone');
  assert.equal(bust(out, { 'style.css': 'cccc3333', 'game.js': 'bbbb2222' }).match(/style\.css\?v=(\w+)/)[1], 'cccc3333', 'running it again replaces the old hash instead of stacking');
  assert.equal(hashOf('abc'), hashOf('abc')); assert.notEqual(hashOf('abc'), hashOf('abd')); assert.equal(hashOf('x').length, 8);
});

test('the one-time hint has a place in the page and is hidden by default', () => {
  assert.match(html, /<div id="hint"[^>]*hidden/);
  assert.match(rule('#hint[hidden]'), /display:\s*none/);
});

test('the refresh bubble is always a perfect circle: equal width and height, fully rounded, and scaled by one uniform factor (never stretched)', () => {
  const r = rule('#ptrBubble');
  assert.match(r, /border-radius:\s*50%/); assert.match(r, /aspect-ratio:\s*1/);
  assert.match(css.replace(/\s+/g, ' '), /#ptrBubble \{[^}]*width: 46px; height: 46px/);
  const all = css.match(/#ptrBubble\s*\{[^}]*\}/g).join(' ');
  for (const m of all.matchAll(/transform:\s*scale\(([^;]*)\);/g)) assert.equal(/,(?![^(]*\))/.test(m[1].replace(/calc\([^)]*\)/g, 'X')), false, `a two-value scale would stretch it: scale(${m[1]})`);
  assert.doesNotMatch(all, /scaleY|scale\([^)]*\)\s*,\s*calc/);
});
