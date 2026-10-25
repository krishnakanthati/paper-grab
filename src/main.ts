// Bootstrap: build the parts that live for the whole page (graphics, sound, input, the start panel and country
// picker), then create and swap sessions as the player chooses arenas.
import { createSound } from './audio/index.ts';
import { AFTER_DEATH_MS, AFTER_WIN_MS } from './config.ts';
import { characterBoost, isTouchScreen, layoutChain } from './render3d/tuning.ts';
import { WORLD_SHAPE } from './data/worldMask.ts';
import type { ArenaShape } from './data/shape.ts';
import { bindInput } from './input/index.ts';
import { startLoop } from './loop.ts';
import { enterFullscreen, fullscreenOnFirstGesture } from './platform/fullscreen.ts';
import { FLIP, FLIP_KINDS, pickFlipKind, type FlipKind } from './render3d/pose.ts';
import { initStorage } from './platform/storage.ts';
import { bindAudio, bindPause, sendScore } from './platform/youtube.ts';
import { COLORS, THEME, setPlayerColor } from './render/palette.ts';
import { pickResolution } from './render/quality.ts';
import { createShell, type Shell } from './scene/shell.ts';
import { createCharacters3D } from './render3d/index.ts';
import { createSession, type Session } from './session.ts';
import { $ } from './ui/dom.ts';
import { createCharacterPicker } from './ui/characters/picker.ts';
import { SPECIES } from './render3d/index.ts';
import { profile } from './progress/profile.ts';
import { CONQUER_POINTS } from './progress/unlocks.ts';
import { createProgression } from './ui/progression.ts';
import { createOverlay } from './ui/overlay.ts';
import { createPicker } from './ui/picker/index.ts';
import { bindPullRefresh } from './ui/pullRefresh.ts';
import { bindPauseButton } from './ui/pauseButton.ts';
import { showFirstRoundHint } from './ui/hint.ts';


async function main() {
  document.documentElement.classList.add('theme-' + THEME.name);          // lets the stylesheet colour the panels to match
  layoutChain(isTouchScreen(), characterBoost());      // bigger characters (phones) get a proportionally longer chain spacing, so captives are the same share of the leader's size everywhere
  fullscreenOnFirstGesture();
  setPlayerColor(Math.floor(Math.random() * COLORS.length));          // you are not always red: a different colour each visit
  await initStorage();                                       // saved choices (character, country) are read before anything uses them
  const overlay = createOverlay();
  let shell: Shell;
  try {
    shell = createShell($('stage'), window.innerWidth, window.innerHeight, pickResolution(window.devicePixelRatio || 1, window.innerWidth, window.innerHeight));
  } catch (err) {                                          // no WebGL at all: say so on screen instead of showing a blank page
    console.error(err);
    overlay.show({ title: "can't start", text: "this browser couldn't start the game's graphics (WebGL). try another browser, or turn on hardware acceleration in its settings.", button: 'reload', showKeys: false, onClick: () => location.reload() });
    return;
  }

  const sound = createSound();
  bindAudio(on => sound.setYouTubeEnabled(on));
  const characters = createCharacters3D(() => { try { shell.renderer.compile(shell.scene, shell.camera); } catch { /* compiling early is only an optimisation */ } });

  let session: Session | null = null;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  function ensureSession(shape: ArenaShape): Session {
    if (session && session.shape.id === shape.id) return session;
    for (const t of timers) clearTimeout(t); timers.clear();      // a pending respawn belongs to the old arena
    session?.dispose();
    const s: Session = createSession({
      shell, overlayHost: $('stage'), sound, shape, characters,
      onDeath: () => { sendScore(s.game.bestCells); later(() => { if (session === s && s.game.respawnHuman()) s.refreshUi(); }, s.renderer.replayMs() || AFTER_DEATH_MS); },
      onWin: () => { sendScore(s.game.bestCells); if (!picker.isConquered(s.shape.id) && s.shape.id !== 'WORLD') progression.award(() => { picker.markConquered(s.shape.id); }, `${s.shape.name.toLowerCase()} conquered  ·  +${CONQUER_POINTS} points`); later(() => { if (session === s) startRound(); }, AFTER_WIN_MS); },
    });
    session = s;
    return s;
  }

  const picker = createPicker(
    { map: $('worldmap'), list: $('countryList'), chosen: $('chosen'), status: $('pickStatus') },
    () => overlay.setButton('play', true),
    () => { progression?.render(); },
  );
  const progression = createProgression({ stats: () => picker.stats(), characterNames: SPECIES.map(x => x.name), onPointsChanged: () => characterPicker?.refresh() });
  let characterPicker: ReturnType<typeof createCharacterPicker> | null = null;

  function startRound() {
    const shape = picker.find(picker.selected())?.shape ?? WORLD_SHAPE;
    sound.unlock(); sound.start(); enterFullscreen();
    const s = ensureSession(shape);
    s.game.startGame();
    overlay.hide();
    showFirstRoundHint(matchMedia('(pointer: coarse)').matches);       // new players get one line about what to do, once
    setTimeout(() => { if (!overlay.visible()) { picker.suspend(); characterPicker?.suspend(); } }, 800);   // the start panel's 3D previews give their GPU memory back while you play: a moment AFTER the round begins, so tearing them down never hitches the first frames
    s.refreshUi();
  }
  function showStart() {
    progression.render(); characterPicker?.refresh();
    picker.resume(); characterPicker?.resume();
    overlay.show({ title: 'loopy land', text: '', button: 'play', picker: true, onClick: startRound });
    overlay.setButton('play', true);
  }

  // pausing: the player's own pause, YouTube's pause and a hidden tab all freeze the game and the audio
  let userPaused = false, ytPaused = false, hidden = document.hidden, lastFlip = -Infinity;
  let lastKind: FlipKind | null = null;
  const pauseUi = bindPauseButton($('pause'), () => togglePause());
  const syncPause = () => { pauseUi.setPaused(userPaused); sound.setPaused(userPaused || ytPaused || hidden); };
  function togglePause() {
    if (userPaused) {
      userPaused = false; overlay.hide();
    } else if (session?.game.running && !overlay.visible()) {
      userPaused = true;
      overlay.show({
        title: 'paused', text: 'take your time. nothing moves while paused.', button: 'resume', showKeys: true, onClick: togglePause,
        secondary: { label: 'change country', onClick: () => { userPaused = false; if (session) session.game.running = false; syncPause(); showStart(); } },
      });
    }
    syncPause();
  }
  bindPause(() => { ytPaused = true; syncPause(); }, () => { ytPaused = false; syncPause(); });
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; syncPause(); });

  /** Switch the safe-zone shield on (E, or the shield button), only while a round is actually being played. */
  function useShield() {
    if (!session || overlay.visible() || userPaused || ytPaused || hidden) return;
    if (session.game.useShield()) session.refreshUi();
  }
  $('shield').addEventListener('click', e => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); useShield(); });
  const input = bindInput(() => session!.game, {
    onGesture: () => sound.unlock(),
    activate: () => overlay.activate(),
    togglePause,
    shield: useShield,
    flip: () => {                                          // Space or a double tap, while playing: a somersault with a chime
      const me = session?.game.players[0];
      if (!session || !me?.alive || !session.game.running || overlay.visible() || userPaused || performance.now() - lastFlip < FLIP.cooldownMs) return;
      const kind = pickFlipKind(lastKind);           // a different trick each time
      lastKind = kind; lastFlip = performance.now(); session.flip(kind); sound.flip(FLIP_KINDS.indexOf(kind)); progression.flipPoint();
    },
  }, $('dpad'));


  characterPicker = createCharacterPicker(() => session?.applyCharacters());      // every character is open: passing { costOf: characterCost, points } here is what brings the points lock back

  bindPullRefresh({
    host: $('ov'), indicator: $('ptr'), label: $('ptrLabel'),
    enabled: () => overlay.visible() && !$('picker').hidden,
    ignore: '#worldmap, #countryList, #charPick, button, input, a',
    onRefresh: () => picker.refresh(),
  });

  ensureSession(WORLD_SHAPE);                              // something to look at behind the start panel
  showStart();
  overlay.setButton('play', false);                        // until the country list is ready (or has failed), so a choice can't be missed
  picker.load().finally(() => overlay.setButton('play', true));

  startLoop({
    game: () => session!.game,
    renderer: () => session!.renderer,
    isPaused: () => userPaused || ytPaused || hidden,
    everyFewTicks: () => {
      session?.refreshUi();
      const g = session?.game, me = g?.players[0];
      sound.warning(!!g && !!me && g.running && me.alive && !overlay.visible() && !userPaused && me.inOwner !== 0 && me.inOwner !== 1);      // standing on someone else's land: the warning keeps sounding until you leave it
    },
    applyResolution: (r) => { shell.resize(window.innerWidth, window.innerHeight); shell.setPixelRatio(r); },
  });
}

main().catch(err => console.error(err));
