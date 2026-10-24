// Minimap. Land and territories are drawn as smooth vector shapes (the same outlines the main view uses) at the size
// the canvas is really shown at, so edges stay crisp on any screen: painting one pixel per cell and stretching it up
// is what made the old one look blocky. Each player's shapes are rebuilt only when that player's land changed, and
// your arrowhead (position and heading) is drawn on top of that cached image on every update.
import { groupShapes, traceLoops } from '../geometry/index.ts';
import type { Game } from '../game/index.ts';
import { cssColorOf } from '../render/index.ts';
import { BORDER, SEA, WHITE, css, colorOf, darken } from '../render/palette.ts';

export const MINIMAP = {
  minScale: 2, maxScale: 8,        // device pixels per cell: never coarser or finer than this
  maxPixelRatio: 3,
  rebuildsPerUpdate: 3,            // players' shapes rebuilt per update at most
  edgeWidth: 0.35,                 // cells: the outline round the land
  territoryEdge: 0.18,             // cells: the darker outline round a territory
  territoryDarken: 0.25,
  arrow: { tip: 7, back: 4.5, half: 5, notch: 2, outline: 2 },     // arrowhead in cells
  dot: { ratio: 0.017, min: 2.4, max: 5, outline: 1.1 },           // opponents: a dot this big (a share of the map width, in cells), always easy to see
};

/** Radius, in cells, of an opponent's dot on a map `cells` wide: a fixed share of the width, so it reads the same on any arena. */
export const dotRadius = (cells: number) => Math.max(MINIMAP.dot.min, Math.min(MINIMAP.dot.max, cells * MINIMAP.dot.ratio));

/** Device pixels per cell for a canvas shown `cssWidth` px wide, for a grid `cells` wide. */
export function scaleFor(cssWidth: number, cells: number, dpr: number): number {
  const px = Math.max(1, cssWidth) * Math.min(Math.max(dpr || 1, 1), MINIMAP.maxPixelRatio);
  return Math.max(MINIMAP.minScale, Math.min(MINIMAP.maxScale, Math.ceil(px / Math.max(1, cells))));
}

export function createMinimap(game: Game, canvas: HTMLCanvasElement) {
  const { NX, NY } = game;
  const ctx = canvas.getContext('2d')!;
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d')!;
  const floorShapes = groupShapes(game.arena.coast());
  const owned = new Map<number, Path2D>();
  let stale = false;                                      // some player's shapes are still waiting to be rebuilt (a few are rebuilt per update)                // each player's territory as a path, in cell units
  const seen: number[] = game.ver.map(() => -1);
  let scale = 0, drawnVer = -1;

  const pathOf = (shapes: ReturnType<typeof groupShapes>) => {
    const p = new Path2D();
    for (const s of shapes) for (const loop of [s.outer, ...s.holes]) {
      loop.pts.forEach((v, i) => { if (i % 2) return; if (i === 0) p.moveTo(v, loop.pts[1]); else p.lineTo(v, loop.pts[i + 1]); });
      p.closePath();
    }
    return p;
  };
  const floor = pathOf(floorShapes);

  function resize() {
    const k = scaleFor(canvas.clientWidth || canvas.width / (scale || 1) || NX, NX, window.devicePixelRatio);
    if (k === scale) return false;
    scale = k;
    canvas.width = base.width = NX * k; canvas.height = base.height = NY * k;
    return true;
  }

  function paintBase() {
    let budget = MINIMAP.rebuildsPerUpdate;
    stale = false;
    for (let id = 1; id < game.ver.length; id++) {
      if (seen[id] === game.ver[id]) continue;
      if (budget-- <= 0) { stale = true; continue; }                         // the rest next time: a big multi-player change never costs one long frame
      seen[id] = game.ver[id];
      const loops = traceLoops(NX, NY, (x, y) => game.owner[y * NX + x] === id);
      loops.length ? owned.set(id, pathOf(groupShapes(loops))) : owned.delete(id);
    }
    bctx.setTransform(scale, 0, 0, scale, 0, 0);
    bctx.clearRect(0, 0, NX, NY);
    bctx.lineJoin = 'round';
    bctx.fillStyle = css(SEA); bctx.fill(floor, 'evenodd');
    bctx.save(); bctx.clip(floor, 'evenodd');                       // territories stay inside the land
    for (const [id, p] of owned) {
      bctx.fillStyle = cssColorOf(id); bctx.fill(p, 'evenodd');
      bctx.lineWidth = MINIMAP.territoryEdge; bctx.strokeStyle = css(darken(colorOf(id), MINIMAP.territoryDarken)); bctx.stroke(p);
    }
    bctx.restore();
    bctx.lineWidth = MINIMAP.edgeWidth; bctx.strokeStyle = css(BORDER); bctx.stroke(floor);
  }

  return {
    draw() {
      const resized = resize();
      let v = 0; for (const x of game.ver) v += x;
      if (v !== drawnVer || resized || stale) { drawnVer = v; if (resized) seen.fill(-1); paintBase(); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      const D = MINIMAP.dot, r = dotRadius(NX);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      for (const p of game.players) {                               // every opponent still alive is a dot in its own colour, with a white edge
        if (p.id === 1 || !p.alive) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.lineWidth = D.outline; ctx.strokeStyle = css(WHITE); ctx.stroke();
        ctx.fillStyle = cssColorOf(p.id); ctx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const me = game.players[0];
      if (!me?.alive) return;
      const A = MINIMAP.arrow;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.translate(me.x, me.y); ctx.rotate(me.angle);              // an arrowhead: where you are, pointing where you're heading
      ctx.beginPath();
      ctx.moveTo(A.tip, 0); ctx.lineTo(-A.back, -A.half); ctx.lineTo(-A.notch, 0); ctx.lineTo(-A.back, A.half); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = A.outline; ctx.strokeStyle = css(WHITE); ctx.stroke();
      ctx.fillStyle = cssColorOf(1); ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
  };
}
