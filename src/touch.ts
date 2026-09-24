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
    <button data-key="ESC">II</button>
    <button data-key="Q">KELUAR</button>
    <button data-action="fullscreen">[ ]</button>
  </div>
  <div class="t-pad">
    <button data-key="W" class="up">&#9650;</button>
    <button data-key="A" class="left">&#9664;</button>
    <button data-key="D" class="right">&#9654;</button>
    <button data-key="S" class="down">&#9660;</button>
  </div>
  <div class="t-acts">
    <button data-key="L" class="skill">SKILL</button>
    <button data-key="I" class="ult">ULTI</button>
    <button data-key="K" class="dash">DASH</button>
    <button data-key="J" class="atk">SERANG</button>
    <button data-key="SPACE" class="jump">LOMPAT</button>
  </div>
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

  // Each finger maps to the button under it; sliding a finger across buttons switches keys.
  const fingers = new Map<number, KeyName>();
  const held = new Set<KeyName>();

  const sync = () => {
    const now = new Set(fingers.values());
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
    else fingers.delete(e.pointerId);
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
  }
  root.querySelector('[data-action="fullscreen"]')?.addEventListener('click', goFullscreen);
  // Gameplay buttons only while a run is on screen.
  const syncMode = () => {
    const inRun = game.scene.isActive('run');
    root.classList.toggle('menu', !inRun);
    if (!inRun && fingers.size) {
      fingers.clear();
      sync();
    }
  };
  syncMode();
  setInterval(syncMode, 250);
  // Losing focus (call, app switch) must not leave a key stuck down.
  window.addEventListener('blur', () => {
    fingers.clear();
    sync();
  });
}

function goFullscreen(): void {
  const el = document.documentElement;
  if (document.fullscreenElement) return void document.exitFullscreen().catch(() => undefined);
  el.requestFullscreen?.()
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => undefined);
}
