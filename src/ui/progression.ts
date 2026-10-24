// The start panel's progress: how much of the world is conquered, how many points you have, which line style is on, what unlocks
// next. Points come from round goals and conquered countries; see progress/unlocks.ts for what they buy.
import { setTrailStyle } from '../render/trailStyle.ts';
import { profile } from '../progress/profile.ts';
import { TRAILS, newUnlocks, points, trailUnlocked } from '../progress/unlocks.ts';
import { $ } from './dom.ts';
import type { ConqueredStats } from './picker/picker.ts';
import { showToast } from './toast.ts';

const SWATCH: Record<string, string> = {
  plain: 'linear-gradient(135deg,#bcd7ff,#6aa5ff)', candy: 'linear-gradient(135deg,#fff,#ff9ec4)', night: 'linear-gradient(135deg,#6b6f9c,#1a1d3a)',
  gold: 'linear-gradient(135deg,#ffe27a,#d99a00)', rainbow: 'conic-gradient(#ff5e5e,#ffd23f,#4cd964,#3fb2ff,#b56bff,#ff5e5e)',
};

export function createProgression(o: { stats: () => ConqueredStats; characterNames: readonly string[]; onPointsChanged?: () => void }) {
  const total = () => points(profile.goalsDone(), o.stats().done);
  const stat = $('conqStat'), tray = $('trailPick');

  const renderStat = () => {
    const s = o.stats();
    const badges = s.continents.filter(c => c.total > 0 && c.done === c.total).map(c => `<span class="badge">${c.name.toLowerCase()} ✓</span>`).join('');
    stat.innerHTML = `<span>conquered ${s.done} / ${s.total || '…'}</span><span>· ${total()} points</span>${badges}`;
  };
  const renderTrails = () => {
    const pts = total(), cur = profile.trail();
    tray.textContent = '';
    for (const t of TRAILS) {
      const b = document.createElement('button');
      b.type = 'button'; b.title = t.name + ' trail'; b.setAttribute('aria-label', t.name + ' trail');
      b.style.setProperty('--sw', SWATCH[t.id] ?? '#fff');
      const open = trailUnlocked(t.id, pts);
      b.classList.toggle('on', open && cur === t.id); b.classList.toggle('locked', !open);
      b.addEventListener('click', () => {
        if (!open) return;
        profile.setTrail(t.id); setTrailStyle(t.id);
        render();
      });
      tray.appendChild(b);
    }
  };
  const render = () => { renderStat(); renderTrails(); };

  setTrailStyle(profile.trail());
  render();
  return {
    points: total,
    render,
    /** Run `earn` (which adds points), then announce anything it unlocked. */
    award(earn: () => void, what: string) {
      const before = total();
      earn();
      const after = total();
      const unlocked = newUnlocks(o.characterNames, before, after);
      showToast(unlocked.length ? `${what}  ·  unlocked: ${unlocked.join(', ')}` : what);
      render(); o.onPointsChanged?.();
    },
  };
}
