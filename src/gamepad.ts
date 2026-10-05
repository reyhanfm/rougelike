import type Phaser from 'phaser';
import { unlockAudio } from './audio.ts';
import { sendKey, type KeyName } from './keys.ts';

/**
 * Controller support (Xbox / PlayStation / Switch Pro, "standard" mapping). Polls the
 * Gamepad API every frame and presses the same keys the keyboard would (see keys.ts),
 * with a per-screen button layout:
 *
 *   play:   stick/D-pad move, A jump, X attack (hold X: charged attack), B/LB dash, Y/LT skill, RB/RT ult, X+Y fusion,
 *           down + A drop through a platform, down + X in the air dive, START pause
 *   paused: START/B resume, SELECT surrender
 *   menus:  stick/D-pad choose, A confirm, B back (class picker), Y reroll, START start/pause
 *   sound (like M): SELECT, or Y in the pause menu (where SELECT surrenders)
 */

/** Standard-mapping button indices; 12–15 are the D-pad (the left stick is merged into them). */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export type PadMode = 'play' | 'paused' | 'menu' | 'hub' | 'class' | 'none';

type Layout = Partial<Record<number, KeyName>>;

const LAYOUTS: Record<PadMode, Layout> = {
  play: {
    [BTN.LEFT]: 'A',
    [BTN.RIGHT]: 'D',
    [BTN.DOWN]: 'S',
    [BTN.A]: 'SPACE',
    [BTN.X]: 'J',
    [BTN.B]: 'K',
    [BTN.LB]: 'K',
    [BTN.Y]: 'L',
    [BTN.LT]: 'L',
    [BTN.RB]: 'I',
    [BTN.RT]: 'I',
    [BTN.START]: 'ESC',
    [BTN.SELECT]: 'M',
  },
  paused: { [BTN.START]: 'ESC', [BTN.B]: 'ESC', [BTN.SELECT]: 'Q', [BTN.Y]: 'M' },
  // Rewards screen (and the brief game-over screen, where these do nothing).
  menu: { [BTN.UP]: 'W', [BTN.DOWN]: 'S', [BTN.A]: 'J', [BTN.Y]: 'R', [BTN.START]: 'ESC', [BTN.SELECT]: 'M' },
  hub: { [BTN.UP]: 'W', [BTN.DOWN]: 'S', [BTN.A]: 'J', [BTN.START]: 'SPACE', [BTN.SELECT]: 'M' },
  class: {
    [BTN.UP]: 'W',
    [BTN.DOWN]: 'S',
    [BTN.LEFT]: 'A',
    [BTN.RIGHT]: 'D',
    [BTN.A]: 'J',
    [BTN.START]: 'J',
    [BTN.B]: 'ESC',
    [BTN.SELECT]: 'M',
  },
  none: {},
};

const DIRS = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT];
const STICK_DEADZONE = 0.5;
const TRIGGER_THRESHOLD = 0.3;
const REPEAT_DELAY_MS = 380;
const REPEAT_MS = 130;

/** Keys held for a pressed-button list in the given mode. */
export function padKeys(pressed: readonly boolean[], mode: PadMode): Set<KeyName> {
  const keys = new Set<KeyName>();
  for (const [i, key] of Object.entries(LAYOUTS[mode])) if (pressed[Number(i)] && key) keys.add(key);
  return keys;
}

/** All connected pads merged into one pressed-button list, the left stick folded into the D-pad. */
export function readPads(pads: readonly (Gamepad | null)[]): boolean[] {
  const pressed: boolean[] = new Array(17).fill(false);
  for (const pad of pads) {
    if (!pad?.connected) continue;
    pad.buttons.forEach((b, i) => {
      if (b.pressed || b.value > TRIGGER_THRESHOLD) pressed[i] = true;
    });
    const [x = 0, y = 0] = pad.axes;
    if (x < -STICK_DEADZONE) pressed[BTN.LEFT] = true;
    if (x > STICK_DEADZONE) pressed[BTN.RIGHT] = true;
    if (y < -STICK_DEADZONE) pressed[BTN.UP] = true;
    if (y > STICK_DEADZONE) pressed[BTN.DOWN] = true;
  }
  return pressed;
}

function connectedPads(): Gamepad[] {
  return typeof navigator.getGamepads === 'function' ? navigator.getGamepads().filter((p): p is Gamepad => !!p?.connected) : [];
}

/** True once a controller has been seen (browsers only report one after its first button press). */
export function padConnected(): boolean {
  return connectedPads().length > 0;
}

/** Short rumble on every pad that supports it (no-op elsewhere). */
export function rumble(duration = 120, strength = 0.5): void {
  for (const pad of connectedPads()) {
    const actuator = (pad as Gamepad & { vibrationActuator?: GamepadHapticActuator }).vibrationActuator;
    actuator?.playEffect('dual-rumble', { duration, strongMagnitude: strength, weakMagnitude: strength }).catch(() => undefined);
  }
}

/** Calls `fn` now and whenever a controller connects or disconnects, until the scene shuts down. */
export function onPadChange(scene: Phaser.Scene, fn: () => void): void {
  fn();
  window.addEventListener('gamepadconnected', fn);
  window.addEventListener('gamepaddisconnected', fn);
  scene.events.once('shutdown', () => {
    window.removeEventListener('gamepadconnected', fn);
    window.removeEventListener('gamepaddisconnected', fn);
  });
}

function currentMode(game: Phaser.Game): PadMode {
  const scenes = game.scene;
  if (scenes.isActive('run')) return (scenes.getScene('run') as Phaser.Scene & { touchMode: PadMode }).touchMode;
  if (scenes.isActive('class')) return 'class';
  if (scenes.isActive('hub')) return 'hub';
  return 'none';
}

export function mountGamepad(game: Phaser.Game, getPads: () => readonly (Gamepad | null)[] = connectedPads): void {
  const held = new Set<KeyName>();
  let mode: PadMode = 'none';
  // Buttons still down from the previous screen (the A that picked a reward must not jump).
  const latched = new Set<number>();
  let repeatAt = Infinity;

  const set = (want: Set<KeyName>) => {
    for (const k of [...held]) if (!want.has(k)) (held.delete(k), sendKey(game, k, false));
    for (const k of want) if (!held.has(k)) (held.add(k), sendKey(game, k, true));
  };

  const poll = (time: number) => {
    const raw = readPads(getPads());
    // A button press is a user gesture for sound (where the browser counts it as one).
    if (raw.some(Boolean)) unlockAudio();
    const next = currentMode(game);
    if (next !== mode) {
      mode = next;
      latched.clear();
      // Keep running into the next round: only directions carry over into play.
      raw.forEach((p, i) => p && !(mode === 'play' && DIRS.includes(i)) && latched.add(i));
      set(new Set());
    }
    for (const i of [...latched]) if (!raw[i]) latched.delete(i);
    const want = padKeys(
      raw.map((p, i) => p && !latched.has(i)),
      mode,
    );
    const dirKeys = [...want].filter((k) => 'WASD'.includes(k) && k.length === 1);
    const newDir = dirKeys.some((k) => !held.has(k));
    set(want);
    // Menus: holding a direction scrolls, like a held keyboard key.
    if (mode === 'play' || !dirKeys.length) repeatAt = Infinity;
    else if (newDir) repeatAt = time + REPEAT_DELAY_MS;
    else if (time >= repeatAt) {
      repeatAt = time + REPEAT_MS;
      for (const k of dirKeys) (sendKey(game, k, false), sendKey(game, k, true));
    }
  };

  game.events.on('prestep', poll);
  // A lost focus must not leave a key stuck down.
  const release = () => set(new Set());
  window.addEventListener('blur', release);
  window.addEventListener('gamepaddisconnected', release);
  game.events.once('destroy', () => {
    release();
    game.events.off('prestep', poll);
    window.removeEventListener('blur', release);
    window.removeEventListener('gamepaddisconnected', release);
  });
}
