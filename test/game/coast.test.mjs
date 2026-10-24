import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP, alone, game } from '../helpers.mjs';
import { EDGE_SPEED_MULT } from '../../src/config.ts';

function towardsNearestCoast(G, p) {
  let best = 0, bestD = 1e9;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    let d = 0;
    while (d < 400 && G.arena.inside(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d)) d += 0.5;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

test('the coast never stops you: heading straight at it, you glide along it at full speed', () => {
  const G = game(21);
  G.startGame(); alone(G);
  const h = G.players[0];
  h.angle = h.target = towardsNearestCoast(G, h);
  let slid = 0, slow = 0;
  for (let i = 0; i < 600 && h.alive; i++) {
    const px = h.x, py = h.y;
    G.tick();
    assert.ok(G.arena.inside(h.x, h.y), 'left the arena at tick ' + i);
    if (h.blocked) slid++;
    if (Math.hypot(h.x - px, h.y - py) < STEP * 0.8) slow++;
  }
  assert.ok(h.alive);
  assert.ok(slid > 60, 'never got to the coast: ' + slid);
  assert.equal(slow, 0, 'it slowed down or stopped on ' + slow + ' ticks');
});

test('pushing into the coast for a long time never gets you stuck, even around bays and headlands', () => {
  for (const seed of [31, 32, 33]) {
    const G = game(seed);
    G.startGame(); alone(G);
    const h = G.players[0];
    let still = 0, ticks = 0;
    for (let round = 0; round < 6; round++) {                    // aim at the coast again each round, from wherever we've glided to
      h.target = towardsNearestCoast(G, h);
      for (let i = 0; i < 250 && h.alive; i++) {
        const px = h.x, py = h.y;
        G.tick(); ticks++;
        assert.ok(G.arena.inside(h.x, h.y));
        if (Math.hypot(h.x - px, h.y - py) < STEP * 0.3) still++;
      }
    }
    assert.ok(still / ticks < 0.02, `seed ${seed}: stuck on ${still} of ${ticks} ticks`);
  }
});

test('while gliding, the head faces along the coast (not into it) and keeps one direction', () => {
  const G = game(22);
  G.startGame(); alone(G);
  const h = G.players[0];
  h.angle = h.target = towardsNearestCoast(G, h);
  let faced = 0, total = 0;
  for (let i = 0; i < 300; i++) {
    G.tick();
    if (!h.blocked) continue;
    total++;
    const [ix, iy] = G.arena.inward(h.x, h.y);
    if (Math.abs(Math.cos(h.angle) * ix + Math.sin(h.angle) * iy) < 0.6) faced++;   // mostly sideways to the inward direction
  }
  assert.ok(total > 60);
  assert.ok(faced / total > 0.85, `faced along the coast on ${faced} of ${total} ticks`);
});

test('you can always steer back inland', () => {
  const G = game(23);
  G.startGame(); alone(G);
  const h = G.players[0];
  h.angle = h.target = towardsNearestCoast(G, h);
  for (let i = 0; i < 600 && !h.blocked; i++) G.tick();
  assert.ok(h.blocked, 'should have reached the coast');
  const [ix, iy] = G.arena.inward(h.x, h.y);
  h.target = Math.atan2(iy, ix);
  for (let i = 0; i < 40; i++) G.tick();
  assert.equal(h.blocked, false, 'could not leave the coast');
  assert.ok(G.arena.inside(h.x, h.y));
});

test('hugging the coast keeps a perfectly uniform gap to the edge and a wobble-free path', () => {
  for (const seed of [21, 31, 44, 5]) {
    const G = game(seed);
    G.startGame(); alone(G);
    const h = G.players[0];
    h.angle = h.target = towardsNearestCoast(G, h);
    const depths = [], turns = [];
    let prevAngle = null;
    for (let i = 0; i < 800; i++) {
      const px = h.x, py = h.y;
      G.tick();
      if (i > 60 && h.blocked) {                                 // once it has reached the coast and is sliding
        depths.push(G.arena.depth(h.x, h.y));
        const a = Math.atan2(h.y - py, h.x - px);
        if (prevAngle !== null) { let d = a - prevAngle; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turns.push(d); }
        prevAngle = a;
      } else prevAngle = null;
    }
    assert.ok(depths.length > 200, `seed ${seed}: only ${depths.length} sliding ticks`);
    const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
    const worst = Math.max(...depths.map(d => Math.abs(d - mean)));
    assert.ok(worst < 0.005, `seed ${seed}: the gap to the edge varies by ${worst.toFixed(4)} (field units)`);
    // a wobbly path alternates left/right turns tick after tick; a coast only ever bends one way at a time
    let flips = 0;
    for (let i = 1; i < turns.length; i++) if (turns[i] * turns[i - 1] < 0 && Math.abs(turns[i]) > 0.1 && Math.abs(turns[i - 1]) > 0.1) flips++;
    assert.ok(flips / turns.length < 0.03, `seed ${seed}: ${(100 * flips / turns.length).toFixed(1)}% of turns zigzag (wobble)`);
  }
});

// ---- the gap between the head's path and the DRAWN coast, and no U-turns ----
import { HEAD_DEPTH } from '../../src/game/arena.ts';

function distToPolylines(loops, x, y) {
  let best = Infinity;
  for (const l of loops) {
    const p = l.pts, n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], ay = p[i * 2 + 1], bx = p[j * 2], by = p[j * 2 + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d < best) best = d;
    }
  }
  return best;
}

test('the gap between a head hugging the coast and the DRAWN coast is the same everywhere, and the line sticks to the edge', () => {
  const LINE_HALF = 0.35;                                          // the drawn line is 0.7 cells wide
  for (const seed of [21, 31, 44, 5]) {
    const G = game(seed);
    G.startGame(); alone(G);
    const coast = G.arena.coast();
    assert.ok(coast.length > 0 && coast.every(l => l.pts.length >= 6));
    const h = G.players[0];
    h.angle = h.target = towardsNearestCoast(G, h);
    const gaps = [];
    for (let i = 0; i < 600; i++) {
      G.tick();
      if (i > 40 && h.blocked) gaps.push(distToPolylines(coast, h.x, h.y));
    }
    assert.ok(gaps.length > 150, `seed ${seed}: only ${gaps.length} sliding ticks`);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const worst = Math.max(...gaps.map(g => Math.abs(g - mean)));
    assert.ok(worst < 0.1, `seed ${seed}: the gap to the drawn coast varies by ${worst.toFixed(3)} cells (mean ${mean.toFixed(3)})`);
    const lineGap = mean - LINE_HALF;                              // from the line's outer edge to the coast
    assert.ok(lineGap >= -0.05 && lineGap <= 0.35, `seed ${seed}: the line's edge is ${lineGap.toFixed(2)} cells from the coast: it should stick to it`);
  }
});

test('the head moves twice as fast while gliding along the coast', () => {
  const G = game(31);
  G.startGame(); alone(G);
  const h = G.players[0];
  h.angle = h.target = towardsNearestCoast(G, h);
  const normal = [], edge = [];
  for (let i = 0; i < 500; i++) {
    const px = h.x, py = h.y;
    G.tick();
    (h.blocked ? edge : normal).push(Math.hypot(h.x - px, h.y - py));
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(edge.length > 100 && normal.length > 10);
  assert.ok(Math.abs(mean(normal) - STEP) < STEP * 0.05, 'normal speed ' + mean(normal).toFixed(3));
  assert.ok(Math.abs(mean(edge) / mean(normal) - EDGE_SPEED_MULT) < 0.2, 'edge speed is ' + (mean(edge) / mean(normal)).toFixed(2) + 'x');
});

test('within one contact the head keeps travelling round the coast: it never ping-pongs back and forth (no U-loops)', () => {
  for (const seed of [21, 31, 44, 5, 6, 7]) {
    const G = game(seed);
    G.startGame(); alone(G);
    const h = G.players[0];
    h.angle = h.target = towardsNearestCoast(G, h);
    const episodes = []; let cur = null;
    for (let i = 0; i < 1200; i++) {
      G.tick();
      if (h.stuck) { (cur ??= []).push([h.x, h.y]); } else if (cur) { episodes.push(cur); cur = null; }   // a release ends one contact
    }
    if (cur) episodes.push(cur);
    let reversals = 0, sliding = 0;
    for (const pts of episodes) {
      sliding += pts.length;
      let cool = 0;
      for (let i = 16; i < pts.length; i++) {          // the last 8 ticks of movement point back against the 8 before
        if (cool > 0) { cool--; continue; }
        const a = [pts[i - 8][0] - pts[i - 16][0], pts[i - 8][1] - pts[i - 16][1]], b = [pts[i][0] - pts[i - 8][0], pts[i][1] - pts[i - 8][1]];
        const la = Math.hypot(...a), lb = Math.hypot(...b);
        if (la < 0.8 || lb < 0.8) continue;
        if ((a[0] * b[0] + a[1] * b[1]) / (la * lb) < -0.7) { reversals++; cool = 16; }
      }
    }
    assert.ok(sliding > 200, `seed ${seed}: only ${sliding} sliding ticks`);
    assert.ok(reversals <= 2, `seed ${seed}: the head reversed direction ${reversals} times within contacts (${sliding} sliding ticks): a ping-pong`);
  }
});

test('steering somewhere else does change the slide direction', () => {
  const G = game(31);
  G.startGame(); alone(G);
  const h = G.players[0];
  h.angle = h.target = towardsNearestCoast(G, h);
  for (let i = 0; i < 400 && !h.blocked; i++) G.tick();
  for (let i = 0; i < 30; i++) G.tick();
  assert.ok(h.blocked);
  const before = h.slide;
  const [ix, iy] = G.arena.inward(h.x, h.y);
  const tangent = [-iy, ix];
  h.target = Math.atan2(-tangent[1] * before + 0.2 * iy, -tangent[0] * before + 0.2 * ix);   // mostly along the coast the OTHER way
  for (let i = 0; i < 40; i++) G.tick();
  assert.equal(h.slide, -before, 'the player steered the other way along the coast but the slide kept its old direction');
});

// ---- once stuck to the coast, stay stuck until the player voluntarily steers inland ----
import { EDGE_RELEASE } from '../../src/config.ts';

function reachCoast(G, h) {
  h.angle = h.target = towardsNearestCoast(G, h);
  for (let i = 0; i < 600 && !h.blocked; i++) G.tick();
  assert.ok(h.blocked, 'never reached the coast');
}

test('while the steering does not point inland, a head on the coast never lets go of it', () => {
  for (const seed of [21, 31, 44, 5, 6]) {
    const G = game(seed);
    G.startGame(); alone(G);
    const h = G.players[0];
    reachCoast(G, h);
    let wrong = 0, ticks = 0, held = 0;
    for (let i = 0; i < 900; i++) {
      const wasStuck = h.stuck;
      const [ix, iy] = G.arena.inward(h.x, h.y);
      const inland = Math.cos(h.target) * ix + Math.sin(h.target) * iy;     // does the fixed steering point inland HERE?
      G.tick(); ticks++;
      assert.ok(G.arena.inside(h.x, h.y));
      if (!wasStuck) continue;                                              // only ticks that began on the coast
      if (inland <= EDGE_RELEASE - 0.02) { held++; if (!h.stuck) wrong++; }  // letting go when the steering says "inland" is the player's choice
    }
    assert.equal(wrong, 0, `seed ${seed}: it let go of the coast ${wrong} times although the steering did not point inland`);
    assert.ok(held > 100, `seed ${seed}: the seaward case was barely exercised (${held} ticks)`);
  }
});

test('even when the heading itself drifts inland, a head stays on the coast while the steering stays along it', () => {
  const G = game(31);
  G.startGame(); alone(G);
  const h = G.players[0];
  reachCoast(G, h);
  for (let i = 0; i < 300; i++) {
    const [ix, iy] = G.arena.inward(h.x, h.y);
    const tx = -iy * h.slide, ty = ix * h.slide;                       // the coast direction we are sliding
    h.target = Math.atan2(ty, tx);                                     // the player steers straight along the coast
    const tilt = 0.26;                                                 // ...but the heading has drifted 15 degrees into the land
    h.angle = Math.atan2(ty * Math.cos(tilt) + iy * Math.sin(tilt), tx * Math.cos(tilt) + ix * Math.sin(tilt));
    G.tick();
    assert.equal(h.stuck, true, `tick ${i}: lost the coast while the steering stayed along it`);
  }
});

test('steering clearly inland releases the coast at once, and the head then moves inland', () => {
  for (const seed of [44, 31, 21]) {
    const G = game(seed);
    G.startGame(); alone(G);
    const h = G.players[0];
    reachCoast(G, h);
    for (let i = 0; i < 40; i++) G.tick();
    assert.equal(h.stuck, true);
    const before = G.arena.depth(h.x, h.y);
    const [ix, iy] = G.arena.inward(h.x, h.y);
    h.target = Math.atan2(iy, ix);                                   // straight inland: cos = 1 > EDGE_RELEASE
    G.tick();
    assert.equal(h.stuck, false, `seed ${seed}: steering inland should release the coast immediately`);
    for (let i = 0; i < 9; i++) G.tick();
    assert.ok(G.arena.depth(h.x, h.y) > before + 0.7, `seed ${seed}: the head did not move inland (depth ${before.toFixed(2)} -> ${G.arena.depth(h.x, h.y).toFixed(2)})`);
  }
});

test('the release threshold is a real boundary: a little inland keeps the coast, a clear swing away from the held heading lets go', () => {
  // steering `off` degrees from the coast direction towards the land has an inland component of sin(off)
  for (const [offDeg, shouldRelease] of [[5, false], [15, false], [30, false], [80, true]]) {
    const G = game(44);
    G.startGame(); alone(G);
    const h = G.players[0];
    reachCoast(G, h);
    for (let i = 0; i < 13; i++) G.tick();                           // about the same distance round the coast whatever SPEED is
    const [ix, iy] = G.arena.inward(h.x, h.y);
    const tx = -iy * h.slide, ty = ix * h.slide, off = (offDeg * Math.PI) / 180;
    h.target = Math.atan2(ty * Math.cos(off) + iy * Math.sin(off), tx * Math.cos(off) + ix * Math.sin(off));
    const inland = Math.cos(h.target) * ix + Math.sin(h.target) * iy;
    G.tick();
    assert.equal(!h.stuck, shouldRelease, `${offDeg} deg towards the land (inland component ${inland.toFixed(2)} vs threshold ${EDGE_RELEASE}): stuck=${h.stuck}`);
  }
});
