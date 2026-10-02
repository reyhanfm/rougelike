import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BTN, mountGamepad, padKeys } from './gamepad.ts';

// Layouts: fusion is X+Y (J+L), drop-through is down+A, menus confirm with A.
assert.deepEqual([...padKeys(press(BTN.X, BTN.Y), 'play')].sort(), ['J', 'L']);
assert.deepEqual([...padKeys(press(BTN.DOWN, BTN.A), 'play')].sort(), ['S', 'SPACE']);
assert.deepEqual([...padKeys(press(BTN.UP), 'play')], [], 'stick up must not jump');
assert.deepEqual([...padKeys(press(BTN.A), 'menu')], ['J']);
assert.deepEqual([...padKeys(press(BTN.START), 'hub')], ['SPACE']);
assert.deepEqual([...padKeys(press(BTN.SELECT), 'paused')], ['Q']);

function press(...ids: number[]): boolean[] {
  const p = new Array(17).fill(false);
  for (const i of ids) p[i] = true;
  return p;
}

// A fake pad: `buttons` by index, `axes` for the left stick.
const pad = { connected: true, buttons: [] as { pressed: boolean; value: number }[], axes: [0, 0] };
const hold = (...ids: number[]) => {
  pad.buttons = press(...ids).map((pressed) => ({ pressed, value: pressed ? 1 : 0 }));
};
hold();

const win = new EventEmitter();
Object.assign(win, { addEventListener: win.on, removeEventListener: win.off });
Object.assign(globalThis, { window: win });
const keyboard = new EventEmitter();
Object.assign(keyboard, { keys: [] });
const events = new EventEmitter();
const run = { input: { keyboard }, touchMode: 'play' };
const game = {
  scene: { isActive: (k: string) => k === 'run', getScene: () => run, getScenes: () => [run] },
  events,
};
const sent: string[] = [];
for (const key of ['A', 'D', 'S', 'W', 'SPACE', 'J', 'L', 'ESC']) {
  keyboard.on(`keydown-${key}`, () => sent.push(`+${key}`));
  keyboard.on(`keyup-${key}`, () => sent.push(`-${key}`));
}
mountGamepad(game as never, () => [pad as unknown as Gamepad]);
let t = 0;
const frame = (ms = 16) => events.emit('prestep', (t += ms), ms);

// The stick moves; past the deadzone only.
pad.axes = [0.3, 0];
frame();
pad.axes = [0.9, 0];
frame();
pad.axes = [0, 0];
frame();
assert.deepEqual(sent.splice(0), ['+D', '-D']);

// The A that picks a reward must not also jump once the run resumes.
run.touchMode = 'menu';
frame();
hold(BTN.A);
frame();
assert.deepEqual(sent.splice(0), ['+J']);
run.touchMode = 'play';
frame();
frame();
assert.deepEqual(sent.splice(0), ['-J']);
hold();
frame();
hold(BTN.A);
frame();
assert.deepEqual(sent.splice(0), ['+SPACE']);
hold();
frame();
sent.splice(0);

// Holding a direction in a menu repeats it; running right carries into the next round.
run.touchMode = 'menu';
frame();
hold(BTN.DOWN);
frame();
frame(400);
frame(140);
assert.deepEqual(sent.splice(0), ['+S', '-S', '+S', '-S', '+S']);
hold(BTN.RIGHT);
run.touchMode = 'play';
frame();
assert.deepEqual(sent.splice(0), ['-S', '+D']);

// Blur releases what is held; teardown removes the listeners.
win.emit('blur');
assert.deepEqual(sent.splice(0), ['-D']);
events.emit('destroy');
assert.equal(events.listenerCount('prestep'), 0);
assert.equal(win.listenerCount('blur'), 0);
console.log('gamepad.check ok');
