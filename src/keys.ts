import type Phaser from 'phaser';

/**
 * Synthetic key presses shared by touch and gamepad input. They drive the same
 * Phaser keys the keyboard does (Key objects for gameplay, 'keydown-X' events for
 * menus), so the game logic has no separate touch or controller path.
 */

export type KeyName = 'W' | 'A' | 'S' | 'D' | 'SPACE' | 'J' | 'K' | 'L' | 'I' | 'ESC' | 'Q' | 'R' | 'M';

const KEY_CODES: Record<KeyName, number> = {
  W: 87,
  A: 65,
  S: 83,
  D: 68,
  SPACE: 32,
  J: 74,
  K: 75,
  L: 76,
  I: 73,
  ESC: 27,
  Q: 81,
  R: 82,
  M: 77,
};

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

export function sendKey(game: Phaser.Game, name: KeyName, down: boolean): void {
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
