// The slider under the globe: every country as a chip with its own flag, scrolling sideways. It is the accessible, keyboard-friendly
// way to choose, and the way to reach countries too small to click on the map.
import type { Country } from '../../data/countries.ts';
import type { FlagSet } from '../../data/flags.ts';

export const WORLD_ID = 'WORLD';

const GLOBE = '<svg class="flag globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

export function createCountryList(root: HTMLElement, countries: Country[], onPick: (id: string) => void) {
  const items = new Map<string, HTMLButtonElement>();
  const add = (id: string, label: string) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'picker-item'; b.dataset.id = id;
    if (id === WORLD_ID) b.insertAdjacentHTML('afterbegin', GLOBE); else b.insertAdjacentHTML('afterbegin', '<i class="flag" aria-hidden="true"></i>');
    const name = document.createElement('span'); name.className = 'nm'; name.textContent = label; b.appendChild(name);
    b.addEventListener('click', () => { b.blur(); onPick(id); });
    items.set(id, b); root.appendChild(b);
  };
  add(WORLD_ID, 'whole world');
  for (const c of countries) add(c.id, c.name.toLowerCase());

  // sideways scrolling without a scrollbar: the wheel scrolls the row, and a mouse can drag it (touch swipes natively)
  root.addEventListener('wheel', e => { if (root.scrollWidth > root.clientWidth) { root.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; e.preventDefault(); } }, { passive: false });
  let dragX = 0, startLeft = 0, down = false, moved = false;
  root.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { down = true; moved = false; dragX = e.clientX; startLeft = root.scrollLeft; } });
  window.addEventListener('pointermove', e => {
    if (!down) return;
    if (!moved && Math.abs(e.clientX - dragX) > 4) { moved = true; root.classList.add('dragging'); }
    if (moved) root.scrollLeft = startLeft - (e.clientX - dragX);
  });
  window.addEventListener('pointerup', () => { down = false; root.classList.remove('dragging'); });
  return {
    setConquered(ids: Iterable<string>) { const set = new Set(ids); for (const [k, b] of items) b.classList.toggle('conquered', set.has(k)); },
    setSelected(id: string) { for (const [k, b] of items) { b.classList.toggle('on', k === id); b.setAttribute('aria-pressed', String(k === id)); } },
    scrollToSelected(id: string) { items.get(id)?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' }); },
    /** Put each country's real flag on its chip (once the flag file has loaded; the chips work without it). */
    setFlags(set: FlagSet) { for (const [k, b] of items) { const f = set.flags[k], el = b.querySelector<HTMLElement>('i.flag'); if (f && el) el.style.backgroundImage = `url(data:${set.mime};base64,${f})`; } },
    visibleCount: () => [...items.values()].filter(b => !b.hidden).length,
  };
}
