// Pull-to-refresh for the start panel: drag down on empty panel space (touch or mouse), feel the resistance build, see the
// ring fill and the arrow flip when it is armed, let go, watch it spin, and get a tick when it is done.
// The maths (rubber band + progress) is pure so it can be tested; the DOM part only sets CSS variables and classes.

export const PULL = {
  max: 132,            // the least the panel can be pulled to on a small screen
  maxShare: 0.5,       // ...and on a tall one it can follow your finger up to this share of the screen's height (half a screen)
  threshold: 72,       // pulled distance (after resistance) at which release triggers a refresh
  hold: 58,            // where the panel rests while refreshing
  intentPx: 8,         // finger travel before we decide it is a vertical pull and not a tap
  minSpinMs: 750,      // a refresh that finishes instantly would look like nothing happened, so it spins at least this long
  doneMs: 650,         // how long the tick stays before the panel settles back
  feedbackMs: 9,       // haptic tick when it becomes armed (where supported)
} as const;

/** The most the panel can be pulled on a screen `screenH` px tall: half the screen, but never less than a small phone's allowance. */
export const maxPull = (screenH: number) => Math.max(PULL.max, Math.round(Math.max(0, screenH) * PULL.maxShare));

/** Rubber band: distance on screen for a finger drag of `dy` px. Follows the finger almost 1:1 at first (so it feels fully flexible), then eases towards `max`. */
export function resist(dy: number, max: number = PULL.max): number {
  if (dy <= 0) return 0;
  return max * (1 - Math.exp(-dy / (max * 1.15)));
}
/** 0..1: how close the pull is to triggering. */
export const progressOf = (pull: number) => Math.max(0, Math.min(1, pull / PULL.threshold));

export interface PullOptions {
  host: HTMLElement;                       // the panel that gets pulled down
  indicator: HTMLElement;                  // the ring/arrow bubble (needs the structure in index.html)
  label: HTMLElement;                      // the little caption under the bubble
  enabled: () => boolean;                  // pulling is only allowed on some screens
  ignore: string;                          // CSS selector of things that own their own drags (globe, list, inputs, buttons)
  onRefresh: () => Promise<void>;
  text?: { pull: string; release: string; loading: string; done: string; failed: string };
}

export function bindPullRefresh(o: PullOptions) {
  const text = o.text ?? { pull: 'pull to refresh', release: 'release to refresh', loading: 'refreshing...', done: 'up to date', failed: "couldn't refresh" };
  type State = 'idle' | 'pulling' | 'loading' | 'done';
  let state: State = 'idle', pointerId = -1, startX = 0, startY = 0, active = false, armed = false, swallowClick = false;

  const set = (pull: number) => {
    const p = progressOf(pull);
    for (const el of [o.host, o.indicator]) { el.style.setProperty('--pull', pull.toFixed(1) + 'px'); el.style.setProperty('--p', p.toFixed(3)); }
    return p;
  };
  const mark = (cls: 'pulling' | 'armed' | 'loading' | 'done' | 'failed' | 'settling', on: boolean) => { o.indicator.classList.toggle(cls, on); o.host.classList.toggle('ptr-' + cls, on); };
  const reset = () => {
    mark('settling', true); mark('pulling', false); mark('armed', false); mark('loading', false); mark('done', false); mark('failed', false);
    set(0); armed = false; state = 'idle';
    setTimeout(() => mark('settling', false), 420);
  };

  async function refresh() {
    state = 'loading'; mark('pulling', false); mark('settling', true); mark('loading', true);
    set(PULL.hold); o.label.textContent = text.loading;
    let ok = true;
    try { await Promise.all([o.onRefresh(), new Promise(r => setTimeout(r, PULL.minSpinMs))]); } catch { ok = false; }
    state = 'done'; mark('loading', false); mark(ok ? 'done' : 'failed', true); o.label.textContent = ok ? text.done : text.failed;
    await new Promise(r => setTimeout(r, PULL.doneMs));
    reset();
  }

  o.host.addEventListener('pointerdown', e => {
    if (state !== 'idle' || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !o.enabled()) return;
    if ((e.target as Element).closest(o.ignore)) return;
    pointerId = e.pointerId; startX = e.clientX; startY = e.clientY; active = false;
  });
  o.host.addEventListener('pointermove', e => {
    if (e.pointerId !== pointerId || state === 'loading' || state === 'done') return;
    const dy = e.clientY - startY, dx = e.clientX - startX;
    if (!active) {
      if (Math.abs(dx) > PULL.intentPx && Math.abs(dx) > Math.abs(dy)) { pointerId = -1; return; }   // sideways: not ours
      if (dy < PULL.intentPx) return;
      active = true; state = 'pulling'; mark('settling', false); mark('pulling', true);
      try { o.host.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
    }
    const pull = resist(dy - PULL.intentPx, maxPull(o.host.clientHeight)), p = set(pull);
    const nowArmed = p >= 1;
    if (nowArmed !== armed) { armed = nowArmed; mark('armed', armed); if (armed) navigator.vibrate?.(PULL.feedbackMs); }
    o.label.textContent = armed ? text.release : text.pull;
    e.preventDefault();
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = -1;
    if (state !== 'pulling') return;
    active = false; swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);   // the click that follows a pull must not press a button
    if (armed && e.type === 'pointerup') void refresh(); else reset();
  };
  o.host.addEventListener('pointerup', end);
  o.host.addEventListener('pointercancel', end);
  o.host.addEventListener('lostpointercapture', e => { if (state === 'pulling' && e.pointerId === pointerId) end(Object.assign(e, { type: 'pointercancel' }) as PointerEvent); });
  o.host.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);   // a pull that ends over a button must not press it
}
