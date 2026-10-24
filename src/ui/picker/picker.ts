// The country picker: a 3D map to click and a slider of countries, one "chosen" label. Whatever you use, the others follow.
import type { Country } from '../../data/countries.ts';
import { storage } from '../../platform/storage.ts';
import { loadCountries } from '../../data/countries.ts';
import { loadFlags } from '../../data/flags.ts';
import { WORLD_ID, createCountryList } from './countryList.ts';
import { createMapView, type MapView } from './mapView.ts';
import { conqueredStore } from './conquered.ts';

const STORAGE_KEY = 'country';

/** Saved through the platform store (the Playables save slot inside YouTube, localStorage elsewhere); the picker works without it. */
const store = {
  get(): string | null { return storage.get(STORAGE_KEY); },
  set(v: string) { storage.set(STORAGE_KEY, v); },
};

export interface PickerEls { map: HTMLElement; list: HTMLElement; chosen: HTMLElement; status: HTMLElement }

export interface ConqueredStats { done: number; total: number; continents: Array<{ name: string; done: number; total: number }> }

export function createPicker(els: PickerEls, onChange: (countryId: string, country: Country | null) => void, onConqueredChange?: () => void) {
  let countries: Country[] = [], selected = store.get() ?? WORLD_ID, view: MapView | null = null, conquered = new Set<string>(), list: ReturnType<typeof createCountryList> | null = null;

  const find = (id: string) => countries.find(c => c.id === id) ?? null;
  const labelWithFlag = (id: string) => label(id).toLowerCase() + (conquered.has(id) ? ' · conquered' : '');
  const label = (id: string) => (id === WORLD_ID ? 'whole world' : (find(id)?.name ?? 'whole world'));
  function select(id: string) {
    if (id !== WORLD_ID && !find(id)) id = WORLD_ID;
    selected = id;
    els.chosen.textContent = labelWithFlag(id);
    view?.setSelected(id === WORLD_ID ? null : id);
    list?.setSelected(id); list?.scrollToSelected(id);
    store.set(id);
    onChange(id, find(id));
  }

  const makeView = () => createMapView(els.map, countries, select, id => { els.status.textContent = id ? labelWithFlag(id) : ''; });
  /** The game is running and the picker is hidden: give back the globe's GPU context and textures (the biggest memory cost on screen). */
  function suspend() { view?.dispose(); view = null; }
  /** Back on the start panel: build the globe again (a quick low-res paint first, so it appears at once). */
  function resume() {
    if (view || !countries.length) return;
    view = makeView();
    if (view) { els.map.hidden = false; view.setConquered(conquered); view.setSelected(selected === WORLD_ID ? null : selected); }
  }

  async function load() {
    els.status.textContent = 'loading countries...';
    try {
      countries = await loadCountries();
    } catch {
      els.status.textContent = 'could not load the country list: playing the whole world. (reload to try again)';
      select(WORLD_ID);
      return;
    }
    els.status.textContent = '';
    list = createCountryList(els.list, countries, select);
    loadFlags().then(f => list?.setFlags(f)).catch(() => { /* chips just show no flag */ });
    conquered = new Set(conqueredStore.load(id => !!find(id)));
    list.setConquered(conquered);
    view = makeView();
    view?.setConquered(conquered);
    onConqueredChange?.();
    if (!view) els.map.hidden = true;                                       // no WebGL: the list does the job
    select(selected);
  }

  /** Pull-to-refresh: retry a failed list, bring the selection back into view and set the globe turning. */
  async function refresh() {
    if (!countries.length) await load();
    list?.scrollToSelected(selected);
    view?.spin();
  }

  /** How much of the world is yours, overall and per continent. */
  function stats(): ConqueredStats {
    const by = new Map<string, { done: number; total: number }>();
    for (const c of countries) { const e = by.get(c.continent) ?? { done: 0, total: 0 }; e.total++; if (conquered.has(c.id)) e.done++; by.set(c.continent, e); }
    return { done: [...conquered].filter(id => find(id)).length, total: countries.length, continents: [...by].map(([name, v]) => ({ name, ...v })).sort((a, b) => a.name.localeCompare(b.name)) };
  }

  /** You won this country's arena: tint it on the globe, plant a flag on it, mark it in the list, and remember it. */
  function markConquered(id: string): boolean {
    if (id === WORLD_ID || !find(id) || conquered.has(id)) return false;
    conquered.add(id);
    conqueredStore.save(conquered);
    view?.setConquered(conquered); list?.setConquered(conquered);
    if (selected === id) els.chosen.textContent = labelWithFlag(id);
    onConqueredChange?.();
    return true;
  }

  return { stats, markConquered, isConquered: (id: string) => conquered.has(id), load, refresh, suspend, resume, select, selected: () => selected, find, dispose() { view?.dispose(); } };
}
export type Picker = ReturnType<typeof createPicker>;
