// Which sound each game event gets. Kept apart from main.ts so the mapping is testable.
// Sound happens only on interactions; there is no background audio.
import type { Game, GameEvents, Player } from '../game/index.ts';
import type { Sound } from './sound.ts';
import { placeFromMe } from './spatial.ts';

const HEAD_ON = /^head-on/;
/** Quietest distant event still worth playing. */
const AUDIBLE = 0.05;

/** The audio half of the game's events. `game` is a getter because the game is created with these handlers. */
export function gameSounds(sound: Sound, game: () => Game): Required<Pick<GameEvents,
  'onCapture' | 'onKill' | 'onShield' | 'onLeaveHome' | 'onEnterEnemyLand' | 'onLandLost' | 'onLeader' | 'onMilestone' | 'onWin'>> {
  return {
    onCapture(p, claimed) {
      if (p.id === 1) { sound.capture(claimed.length); return; }
      const at = placeFromMe(game(), p.x, p.y);
      if (at.vol > AUDIBLE) sound.otherCapture(claimed.length, at.pan, at.vol);
    },
    onKill(victim, killer, reason) {
      const clash = HEAD_ON.test(reason);
      if (victim.id === 1) {                              // you died: the cause first, then the defeat sting
        if (clash) sound.clash(0, 1);
        sound.death();
        return;
      }
      if (killer?.id === 1) {                             // you took someone out
        if (clash) sound.clash(0, 1); else sound.cut();
        return;
      }
      const at = placeFromMe(game(), victim.x, victim.y); // two other players: heard from where it happened
      if (at.vol <= AUDIBLE) return;
      if (clash) sound.clash(at.pan, at.vol); else sound.otherKill(at.pan, at.vol);
    },
    onLeaveHome(p: Player) { if (p.id === 1) sound.leaveHome(); },
    onEnterEnemyLand(p: Player, landOwner: number) {
      if (p.id === 1) { sound.enemyLand(); return; }
      if (landOwner !== 1) return;                        // an enemy stepping onto YOUR land is the one that matters
      const at = placeFromMe(game(), p.x, p.y);
      if (at.vol > AUDIBLE) sound.intruder(at.pan, at.vol);
    },
    onLandLost(victim: Player) { if (victim.id === 1) sound.landLost(); },
    onLeader(leaderId: number) { if (leaderId === 1) sound.crown(); },
    onMilestone(index: number) { sound.milestone(index); },
    onShield(p) { if (p.id === 1) sound.shield(); },
    onWin() { sound.win(); },
  };
}
