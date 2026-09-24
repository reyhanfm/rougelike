import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mountTouchControls } from './touch.ts';

class Element extends EventEmitter {
  dataset: { key?: string } = {};
  textContent = '';
  classList = { add() {}, remove() {}, toggle() {} };
  addEventListener = this.on;
  removeEventListener = this.off;
  setPointerCapture() {}
  closest(selector: string) {
    return selector === '[data-key]' ? this : null;
  }
  remove() {}
}
const root = new Element();
const pad = new Element();
const actions = new Element();
const top = new Element();
const buttons = ['A', 'D', 'J', 'ESC'].map((key) => Object.assign(new Element(), { dataset: { key } }));
Object.assign(root, {
  querySelectorAll: (selector: string) => (selector === '[data-key]' ? buttons : [pad, actions, top]),
  querySelector: () => buttons[3],
});
const doc = Object.assign(new Element(), {
  body: Object.assign(new Element(), { appendChild() {} }),
  createElement: () => root,
  elementFromPoint: (x: number) => buttons[x] ?? null,
  hidden: false,
});
const win = new Element();
Object.assign(globalThis, { document: doc, window: win });
const keyboard = new EventEmitter();
Object.assign(keyboard, { keys: [] });
const events = new EventEmitter();
const scene = { input: { keyboard }, touchMode: 'play' };
const game = {
  scene: { isActive: () => true, getScene: () => scene, getScenes: () => [scene] },
  events,
  scale: { getParentBounds() {}, refresh() {} },
};
const sent: string[] = [];
for (const key of ['A', 'D', 'J', 'ESC']) {
  keyboard.on(`keydown-${key}`, () => sent.push(`+${key}`));
  keyboard.on(`keyup-${key}`, () => sent.push(`-${key}`));
}
keyboard.on('keydown-ESC', () => {
  scene.touchMode = 'paused';
});
mountTouchControls(game as never);
function pointer(cluster: Element, type: string, id: number, x: number) {
  cluster.emit(type, { pointerId: id, clientX: x, clientY: 0, target: buttons[0], preventDefault() {} });
}
// Sliding through empty space must still reach the next button; another finger can attack.
pointer(pad, 'pointerdown', 1, 0);
pointer(actions, 'pointerdown', 2, 2);
pointer(pad, 'pointermove', 1, 99);
pointer(pad, 'pointermove', 1, 1);
pointer(pad, 'pointerup', 1, 1);
pointer(actions, 'pointercancel', 2, 2);
assert.deepEqual(sent.splice(0), ['+A', '+J', '-A', '+D', '-D', '-J']);
// Two fingers on one key keep it held until both leave, including capture loss.
pointer(pad, 'pointerdown', 1, 0);
pointer(pad, 'pointerdown', 2, 0);
pointer(pad, 'pointerup', 1, 0);
assert.deepEqual(sent.splice(0), ['+A']);
pointer(pad, 'lostpointercapture', 2, 0);
assert.deepEqual(sent.splice(0), ['-A']);
// Hiding the page releases movement and pauses exactly once.
pointer(pad, 'pointerdown', 1, 1);
doc.hidden = true;
doc.emit('visibilitychange');
win.emit('blur');
assert.deepEqual(sent.splice(0), ['+D', '-D', '+ESC', '-ESC']);
scene.touchMode = 'play';
events.emit('poststep');
pointer(pad, 'pointerdown', 1, 0);
win.emit('resize');
assert.deepEqual(sent.splice(0), ['+A', '-A']);
pointer(actions, 'pointerdown', 2, 2);
scene.touchMode = 'menu';
events.emit('poststep');
assert.deepEqual(sent.splice(0), ['+J', '-J']);
events.emit('destroy');
assert.equal(win.listenerCount('blur'), 0);
assert.equal(events.listenerCount('poststep'), 0);
console.log('touch.check ok');
