import { bindDpad } from './dpad.ts';
import { bindKeyboard, type GameRef, type KeyActions } from './keyboard.ts';
import { bindPointer } from './pointer.ts';

export function bindInput(game: GameRef, actions: KeyActions, dpadEl: HTMLElement) {
  const keys = bindKeyboard(game, actions);
  const dpad = bindDpad(dpadEl, game, actions.onGesture);
  bindPointer(game, actions.onGesture, () => keys.anyHeld() || dpad.anyHeld(), () => actions.flip?.());
  return { anyHeld: () => keys.anyHeld() || dpad.anyHeld() };
}
