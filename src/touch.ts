import type Phaser from 'phaser';

/**
 * On-screen controls for touch devices. Buttons drive the same Phaser keys the
 * keyboard does (Key objects for gameplay, 'keydown-X' events for menus), so the
 * game logic has no separate touch path.
 */

type KeyName = 'W' | 'A' | 'S' | 'D' | 'SPACE' | 'J' | 'K' | 'L' | 'I' | 'ESC' | 'Q';

const KEY_CODES: Record<KeyName, number> = { W: 87, A: 65, S: 83, D: 68, SPACE: 32, J: 74, K: 75, L: 76, I: 73, ESC: 27, Q: 81 };

const LAYOUT = `
  <div class="t-top">
    <button data-key="ESC" aria-label="Jeda atau lanjutkan">JEDA</button>
    <button data-key="Q">MENYERAH</button>
    <button data-action="fullscreen" aria-label="Layar penuh">LAYAR</button>
  </div>
  <div class="t-pad">
    <button data-key="A" class="left" aria-label="Gerak kiri">&#9664;</button>
    <button data-key="D" class="right" aria-label="Gerak kanan">&#9654;</button>
    <button data-key="S" class="down" aria-label="Tahan bersama lompat untuk turun platform">TURUN</button>
  </div>
  <div class="t-acts">
    <button data-key="L" class="skill">SKILL</button>
    <button data-key="I" class="ult">ULTI</button>
    <button data-key="K" class="dash">DASH</button>
    <button data-key="J" class="atk">SERANG</button>
    <button data-key="SPACE" class="jump">LOMPAT</button>
  </div>
  <p class="t-hint">Tahan TURUN + LOMPAT untuk turun platform</p>
`;

export function isTouchDevice(): boolean {
  return new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches;
}

function fakeEvent(keyCode: number, type: 'keydown' | 'keyup'): KeyboardEvent {
  const e = {
    type,
    keyCode,
    timeStamp: performance.now(),
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    location: 0,
    repeat: false,
    cancelled: false,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  };
  return e as unknown as KeyboardEvent;
}

function send(game: Phaser.Game, name: KeyName, down: boolean): void {
  const code = KEY_CODES[name];
  const type = down ? 'keydown' : 'keyup';
  for (const scene of game.scene.getScenes(true)) {
    const kb = scene.input.keyboard;
    if (!kb) continue;
    const event = fakeEvent(code, type);
    const key = kb.keys[code];
    if (key) {
      if (down) key.onDown(event);
      else key.onUp(event);
    }
    kb.emit(`${type}-${name}`, event);
    kb.emit(type, event);
  }
}

export function mountTouchControls(game: Phaser.Game): void {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = LAYOUT;
  document.body.appendChild(root);
  document.body.classList.add('touch-device');
  game.scale.getParentBounds();
  game.scale.refresh();

  // Each finger maps to the button under it; sliding a finger across buttons switches keys.
  const fingers = new Map<number, KeyName | undefined>();
  const held = new Set<KeyName>();

  const sync = () => {
    const now = new Set([...fingers.values()].filter((k): k is KeyName => k !== undefined));
    for (const k of held) if (!now.has(k)) send(game, k, false);
    for (const k of now) if (!held.has(k)) send(game, k, true);
    held.clear();
    now.forEach((k) => held.add(k));
    root.querySelectorAll<HTMLElement>('[data-key]').forEach((b) => b.classList.toggle('on', now.has(b.dataset.key as KeyName)));
  };

  const keyAt = (x: number, y: number): KeyName | undefined =>
    (document.elementFromPoint(x, y)?.closest('[data-key]') as HTMLElement | null)?.dataset.key as KeyName | undefined;

  const track = (e: PointerEvent) => {
    const k = keyAt(e.clientX, e.clientY);
    if (k) fingers.set(e.pointerId, k);
    else fingers.set(e.pointerId, undefined);
    sync();
  };

  const release = (e: PointerEvent) => {
    fingers.delete(e.pointerId);
    sync();
  };

  for (const cluster of root.querySelectorAll<HTMLElement>('.t-pad, .t-acts, .t-top')) {
    cluster.addEventListener('pointerdown', (e) => {
      // Fullscreen needs a click (touch pointerdown is not a user activation).
      if ((e.target as HTMLElement).closest('[data-action]')) return;
      e.preventDefault();
      try {
        cluster.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone: sliding just won't be tracked for it
      }
      track(e);
    });
    cluster.addEventListener('pointermove', (e) => fingers.has(e.pointerId) && track(e));
    cluster.addEventListener('pointerup', release);
    cluster.addEventListener('pointercancel', release);
    cluster.addEventListener('lostpointercapture', release);
  }
  root.querySelector('[data-action="fullscreen"]')?.addEventListener('click', goFullscreen);
  // Gameplay buttons only while a run is on screen.
  let mode = '';
  const reset = () => {
    fingers.clear();
    sync();
  };
  const syncMode = () => {
    const inRun = game.scene.isActive('run');
    const next = inRun ? (game.scene.getScene('run') as Phaser.Scene & { touchMode: string }).touchMode : 'menu';
    if (mode === next) return;
    mode = next;
    reset();
    root.classList.toggle('menu', mode !== 'play');
    root.classList.toggle('paused', mode === 'paused');
    root.classList.toggle('in-run', inRun);
    document.body.classList.toggle('touch-playing', mode === 'play');
    root.querySelector('[data-key="ESC"]')!.textContent = mode === 'paused' ? 'LANJUT' : 'JEDA';
    game.scale.getParentBounds();
    game.scale.refresh();
  };
  syncMode();
  game.events.on('poststep', syncMode);
  // Losing focus (call, app switch) must not leave a key stuck down.
  const suspend = () => {
    reset();
    if (game.scene.isActive('run') && (game.scene.getScene('run') as Phaser.Scene & { touchMode: string }).touchMode === 'play') {
      send(game, 'ESC', true);
      send(game, 'ESC', false);
    }
    syncMode();
  };
  const visibility = () => {
    if (document.hidden) suspend();
  };
  window.addEventListener('blur', suspend);
  window.addEventListener('resize', reset);
  document.addEventListener('visibilitychange', visibility);
  game.events.once('destroy', () => {
    reset();
    game.events.off('poststep', syncMode);
    window.removeEventListener('blur', suspend);
    window.removeEventListener('resize', reset);
    document.removeEventListener('visibilitychange', visibility);
    root.remove();
    document.body.classList.remove('touch-device', 'touch-playing');
  });
}

function goFullscreen(): void {
  const el = document.documentElement;
  if (document.fullscreenElement) return void document.exitFullscreen().catch(() => undefined);
  el.requestFullscreen?.()
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => undefined);
}
