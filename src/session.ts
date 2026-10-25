// One session = everything that belongs to a single arena: the game, its renderer (layers in the shared 3D scene), the HUD and the minimap, with the
// shared 3D character layer attached to it. Choosing another country disposes this and builds a new one.
import type { Sound } from './audio/index.ts';
import { gameSounds } from './audio/index.ts';
import type { ArenaShape } from './data/shape.ts';
import { createGame, type Game } from './game/index.ts';
import { createSceneRenderer, type Renderer } from './scene/sceneRenderer.ts';
import type { Shell } from './scene/shell.ts';
import { OCEAN_TOP } from './render/palette.ts';
import type { FlipKind } from './render3d/pose.ts';
import type { Characters3D } from './render3d/index.ts';
import { speciesOfPlayer } from './ui/characters/store.ts';
import { $ } from './ui/dom.ts';
import { createShieldHud, createDashHud } from './ui/shieldHud.ts';
import { createMinimap } from './ui/minimap.ts';
import { createProgress } from './ui/progress.ts';

export interface Session {
  shape: ArenaShape;
  game: Game;
  renderer: Renderer;
  refreshUi(): void;
  /** The player chose another character: re-dress everyone. */
  applyCharacters(): void;
  /** The human does a flip trick. */
  flip(kind?: FlipKind): void;
  dispose(): void;
}

export interface SessionOptions {
  shell: Shell;                    // the page's one WebGL scene
  overlayHost: HTMLElement;        // where name tags and floating text go
  sound: Sound;
  shape: ArenaShape;
  characters: Characters3D;
  onDeath(): void;                 // the human was eliminated (a respawn is the caller's business)
  onWin(): void;
}

export function createSession(o: SessionOptions): Session {
  const audio = gameSounds(o.sound, () => game);
  let renderer!: Renderer;
  const game = createGame(Math.random, {
    ...audio,
    onCapture: (p, claimed, takenFrom) => { renderer.captureFx(p, claimed, takenFrom); audio.onCapture(p, claimed); },
    onChainCut: (_from, by, ids) => { renderer.captureFx(by, []); audio.onCapture(by, ids); },      // the same ring and chime as a grab
    onDash: p => { renderer.dashFx(p); audio.onDash(p); },
    onShield: p => { renderer.shieldFx(p); audio.onShield(p); },
    onClear: (victim, cells) => renderer.clearFx(victim, cells),
    onKill: (victim, killer, reason) => { renderer.killFx(victim, killer, reason); audio.onKill(victim, killer, reason); },
    onGameOver: () => { renderer.replayFx(); o.onDeath(); },
    onWin: () => { renderer.winFx(); audio.onWin(); o.onWin(); },
  }, undefined, { shape: o.shape });

  o.characters.attach(game, speciesOfPlayer);
  renderer = createSceneRenderer(o.shell, o.overlayHost, game, o.characters);
  document.body.style.background = OCEAN_TOP;

  const progress = createProgress(game);
  const shieldHud = createShieldHud(game, $('shield')), dashHud = createDashHud(game, $('dash'));
  const minimap = createMinimap(game, $<HTMLCanvasElement>('mini'));
  const refreshUi = () => { progress.update(); shieldHud.update(); dashHud.update(); minimap.draw(); };
  refreshUi();

  return {
    shape: o.shape, game, renderer, refreshUi,
    flip(kind) { o.characters.flip(1, kind); renderer.flipFx(game.players[0]); },
    applyCharacters() { o.characters.attach(game, speciesOfPlayer); },
    dispose() { o.characters.detach(); renderer.destroy(); },
  };
}
