// The 3D characters as a layer of the one scene: a group that holds the current game's rig. Everything about WHERE and HOW the characters
// stand lives in rig.ts / pose.ts; this file only swaps rigs when another arena starts (choosing countries never creates or destroys GPU
// contexts: there is only the shell's one) and gives the touch-screen size boost.
import { Group } from 'three';
import type { Game } from '../game/index.ts';
import { disposeShared } from './model.ts';
import type { FlipKind } from './pose.ts';
import { createRig, type Rig, type View } from './rig.ts';
import type { Species } from './species.ts';
import { characterBoost } from './tuning.ts';

export interface Characters3D {
  /** The scene-graph root to add to the scene. */
  group: Group;
  /** Show characters for this game (replacing the previous game's). */
  attach(game: Game, speciesOf?: (id: number) => Species | undefined): void;
  /** Stop showing characters. */
  detach(): void;
  /** Make a player do its flip trick. */
  flip(id: number, kind?: FlipKind): void;
  /** The next death of this player starts `ms` later (it stands still until then). */
  delayDeath(id: number, ms: number): void;
  /** Throwing arm: this player winds up and releases towards world direction (dx, dz) (see rig.setArm); clearArm puts it away. */
  setArm(id: number, dx: number, dz: number, wind: number, rel: number): void;
  clearArm(id: number): void;
  /** Hide the captives and freeze their chains (during a replay), or release them again. */
  holdChains(on: boolean): void;
  /** Where this player's throwing hand is on the ground (cells), or null when it is not throwing. */
  handAt(id: number): readonly [number, number] | null;
  frame(view: View): void;
  dispose(): void;
}

/** `onAttach` runs after a new rig is built and added (the shell uses it to compile shaders before play starts). */
export function createCharacters3D(onAttach?: () => void): Characters3D {
  const group = new Group();
  let rig: Rig | null = null;
  const boost = characterBoost();
  const detach = () => { if (rig) { group.remove(rig.scene); rig.dispose(); rig = null; } };
  return {
    group,
    attach(game, speciesOf) {
      detach(); rig = createRig(game, speciesOf); group.add(rig.scene);
      rig.prime();
      onAttach?.();
    },
    detach,
    flip(id, kind) { rig?.flip(id, performance.now(), kind); },
    delayDeath(id, ms) { rig?.delayDeath(id, ms); },
    setArm(id, dx, dz, wind, rel) { rig?.setArm(id, dx, dz, wind, rel); },
    clearArm(id) { rig?.clearArm(id); },
    holdChains(on) { rig?.holdChains(on); },
    handAt: id => rig?.handAt(id) ?? null,
    frame(view) {
      if (!rig) return;
      view.boost = boost;
      rig.update(view);
    },
    dispose() { detach(); disposeShared(); },
  };
}
