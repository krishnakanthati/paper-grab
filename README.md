# Loopy Land

A Paper.io 2 style territory game for YouTube Playables. Play on the whole world or on any of 169 countries, as one of
20 little 3D characters. One Three.js (WebGL) scene draws everything in the game, ground, lines, effects and characters, seen from a
fixed 50 degree camera; Three.js also draws the country globe on the start panel. A fixed-rate rules engine runs the game, and the sound is synthesized in code. The only file loaded besides the bundle is
the country list (`countries.json`).

Live: https://krishnakanthati.github.io/paper-grab/

```
npm install
npm run build              # bundle -> dist/ (also writes countries.js so the page works opened straight from a file)
npm run build:playables    # -> dist-playables/: what you upload to YouTube Playables (no countries.js)
npm run typecheck          # tsc --noEmit
npm test                   # the whole suite (rules, geometry, rendering maths, audio, input, layout, memory)
npm run check              # typecheck + tests
```

Pushing to `main` runs `.github/workflows/pages.yml`: typecheck, tests, build, deploy to GitHub Pages.

## How it plays

- **Pick where and who.** The start panel has a 3D globe (drag to turn, scroll or pinch to zoom, click a country) plus a
  search box and a country row. Next to **play** is the character picker: `[<] character [>]`. The choice is saved.
- **Hover the character** (or press the left/right arrow keys to change it) and it giggles (a quick little tickle); tap it on a phone and it boings. Drag to spin it.
- **Pull down on the start panel** (outside the globe, list and buttons) to refresh it.

## Rules (`src/game/`)

- The arena is the shape of the world or of a country (land is playable, sea is outside). Heads move continuously in any
  direction at a limited turn rate.
- Leaving your colour draws a line; returning to your colour claims what the line **encloses**, including other
  players' land. A loop all the way round the rim claims the whole interior, not just the strip by the coast.
- Anyone touching your open line kills you. Your own colour is a safe zone: an enemy touching your head while you stand
  on your land dies. Head-on outside land: the older line loses (equal lines: both die).
- The coast never stops or kills you. You glide along it at twice the speed, hugging it at a uniform gap, and you stay on
  it until you steer clearly away. Crossing your own line is harmless and claims nothing (`DEFAULT_RULES.selfCollisionKills`): land is only claimed by getting back home.
- **Captives.** Catch someone (touch their open line) and their land becomes yours (it melts from their colour into yours), and a small
  version of them (three quarters size) joins a chain following the exact path you walked. Capture someone who has a
  chain and their whole chain joins yours; the same goes the other way round. The chain holds at most `CAPTIVES_MAX`
  and is freed if you die.
- **Safe-zone shield.** Press **E** (or the shield button in the top bar) and for 4 s nobody can catch, cut or crash into you, so you can ride out a rival close to your open line. It recharges for 18 s (`SHIELD` in `config.ts`).
- **Winning.** Own the whole arena, or close a loop all the way round the edge: if you own at least `RIM_WIN.minShare` of
  the land and either only the thin strip by the coast is left, or every other player is inside your loop, the rest is
  yours too and you win. Only the human wins this way.
- **Conquered countries.** Win a country's arena and it is remembered: on the globe it turns green (no flag is planted on it), and its chip in the slider gets a green ring and a check (the chips carry the country's own flag from `public/flags.json`, made once by `tools/make_flags.mjs`; nothing is fetched from outside at play time). Saved with the other settings.
- **Goals and points.** Each round has one small goal at a time (claim a share of the land, capture players, build a chain, stay safe for a while), shown under the progress bar; meeting it gives 1 point and a new goal follows. Conquering a country gives 3. Points unlock the rest of the characters and the line styles (candy, night, gold, rainbow), pick a style with the dots under the play button. The start panel shows how many countries you have conquered, per-continent badges once a whole continent is yours, your points and the next unlock. Costs are in `src/progress/unlocks.ts`.
- Computer players sometimes run out to the coast and along it (`BOT_EDGE`), so they reach the edge of the map like you can.
- Dying never opens a panel: after a short beat you respawn into the same world with your score reset.
- Every computer player is a different character, none the same as yours (the cast covers the largest possible game).

## Controls

| | |
|---|---|
| steer | the **arrow keys** (hold two for a diagonal), the mouse (follow the cursor), drag on touch, the on-screen arrows on touch devices |
| start / restart | Enter or Space, or the play button |
| pause / resume | P or Esc, or the pause button |
| sound | M, or the speaker button |

## Layout

```
src/
  main.ts           bootstrap: builds the long-lived pieces and connects them
  session.ts        one arena's game + renderer + HUD + minimap; swapped when you choose another country
  loop.ts           30 Hz logic, display-rate rendering with interpolation, adaptive quality, idle-frame throttling
  config.ts         every tunable (speeds, bots, arena, win rule, captives, effects)
  game/             the rules engine (pure, no DOM; tests drive it directly)
    game, movement, combat, capture, bots, spawn, arena, types
  data/             countries.ts (loader), shape.ts, worldMask.ts (generated)
  geometry/         cells -> smooth rounded outlines (trace, smoothing, shapes, marching squares)
  anim/             the animation primitives, pure maths: damped springs (squash and stretch), interpolation (shortest-arc angles,
                    frame-rate independent smoothing, the tick alpha)
  render/           what is not tied to a renderer: the camera controller (fixed 50 degree pitch, zero yaw and roll, time-based
                    smoothing), effects, palette, patterns, adaptive quality
  scene/            the ONE Three.js scene: shell (renderer, tilted camera, lights, screen<->ground), floor, territories (raised slabs
                    clipped to the coast by the stencil, with the colour-in fade), trail ribbons locked to the interpolated head,
                    pooled point-sprite particles, the shield bubble / slash, name-tag and floating-text overlays
  render3d/         the 3D characters over the ground
    species.ts        the cast as data (colours, ears, snout, patches, details)
    decor.ts / decorTuning.ts   builds a character's parts from its species; every number lives in decorTuning
    model.ts, pose.ts, rig.ts   the body, its animation maths, and posing every player (plus the captive chain)
    chain.ts          the path a leader has walked, so captives follow it exactly
  audio/            synth (WebAudio), sfx, spatial sound, events
  ui/               hud, progress, minimap (crisp vector shapes), overlay, pause/shield buttons, pull-to-refresh
    picker/           the 3D globe: scene logic, view, country list, texture budget per device
    characters/       the inline character picker, its small 3D stage, the jelly springs, storage
  input/            keyboard, pointer, dpad
  platform/         youtube.ts: Playables SDK (ready, score, audio setting, pause/resume)
styles/main.css     all styling, mobile-first with safe-area and touch rules
public/countries.json   169 countries as playable shapes + outlines (generated)
tools/              make_world_mask.py, make_countries.mjs (regenerate the data files)
test/               mirrors src/
```

## Performance and memory

- **Logic** is fixed at 30 Hz; the coast-distance query that every head runs several times a tick uses flat bucket arrays,
  not a Map. A typical tick is about 0.05 ms on a slow machine, the worst spikes a few ms.
- **Rendering** adapts: resolution is capped by a pixel budget and stepped down when frames run long. While a panel
  covers the scene and nothing moves, it is redrawn only every `IDLE_RENDER_MS`. The globe and the character preview stop
  drawing when hidden, and **give their GPU contexts and textures back while you play**.
- **Textures** are sized per device (`ui/picker/budget.ts`): a phone or a low-memory device gets smaller globe textures,
  and the big canvases are released once the GPU has its copy. The in-game HUD avoids blurred backdrops, which are
  recomputed every frame over a moving game.
- Territories are rebuilt only when that player's land version changes; trail geometry in chunks; particles are pooled;
  the minimap image is cached per player and rebuilt only on change.
- Memory is checked by tests (geometry cache and scene graph stay bounded through many captures and deaths) and a long
  headless run (the JS heap stays flat across rounds).

## Shipping to YouTube Playables

Upload `dist-playables/` (about 0.43 MB gzipped; the limits are 15 MiB initial and 250 MiB total, JS heap under 512 MB). The YouTube build is ES modules cut into several files, none over the 512 KiB per-file guidance (`game.js` is the entry and is loaded with `<script type="module">`; Three.js's core and Three.js's renderer each get their own files through the stub entries in `tools/split/`, and `build.mjs` fails if any file goes over). The web build on GitHub Pages stays one `game.js`, so it still opens straight from a file.
The SDK script is loaded from `index.html`; the game calls `firstFrameReady()` / `gameReady()`, reports scores, and
follows the platform's audio setting and pause/resume.

## Family-friendly by design

There are no weapons. When someone is caught, a paper plane swoops through them (or is thrown, if the catcher is far away) with a
star-shaped sparkle, and the caught character tumbles, shrinks away and later comes back. The counter shows players captured, not
"kills". Disputed territories (Palestine, Taiwan, Western Sahara, Northern Cyprus, Somaliland, Kosovo, the Falklands) are not offered
as playable countries. Settings are saved in the Playables save slot inside YouTube and in localStorage elsewhere, and a one-line hint
is shown once to new players.

## YouTube Playables requirements, checked by tests (`test/platform/compliance.test.mjs`)

The tests build the real YouTube bundle in memory and check it: no `eval` / `new Function` / web workers / WebAssembly (the leftover `new Function` text in Three.js is removed at bundle time by
`tools/bundle.mjs`); no outside calls or URLs (the YouTube page keeps only Google's SDK script, see `tools/playables.mjs`); no
clipboard, cookies, personal data or login (there is no text field at all); only minified, never obfuscated; one
page; and no ads, payments or purchases of any kind.
