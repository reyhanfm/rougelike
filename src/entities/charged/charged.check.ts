import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The charged attacks import Phaser (for their VFX), which cannot load outside a browser. Only their data is
// checked here, so 'phaser' resolves to a stub that accepts any property access, call or `new`.
registerHooks({
  resolve: (spec, ctx, next) => (spec === 'phaser' ? { url: 'stub:phaser', shortCircuit: true } : next(spec, ctx)),
  load: (url, ctx, next) =>
    url === 'stub:phaser'
      ? {
          format: 'module',
          shortCircuit: true,
          source:
            'const h = { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : P), apply: () => P, construct: () => P };' +
            'const P = new Proxy(function () {}, h); export default P;',
        }
      : next(url, ctx),
});

const { CHARGE, CHARGED, DEFINED } = await import('./index.ts');
const { CLASS_IDS, CLASSES } = await import('../../logic/classes.ts');
const { WEAPONS } = await import('../../logic/loot.ts');

assert.ok(0 < CHARGE.startMs && CHARGE.startMs < CHARGE.level1Ms && CHARGE.level1Ms < CHARGE.level2Ms, 'charge level times are ordered');
assert.ok(CHARGE.speed > 0 && CHARGE.speed < 1 && CHARGE.autoFireMult > 0 && CHARGE.autoFireMult <= 1);
for (const id of CLASS_IDS) assert.equal(typeof CHARGED[id]?.fire, 'function', `${id}: no charged attack (not even the placeholder)`);

// Every charged attack written so far: short UPPERCASE text, its own name, not one of the class's skill/ult/fusion.
const defined = Object.entries(DEFINED) as [keyof typeof CLASSES, NonNullable<(typeof DEFINED)[keyof typeof DEFINED]>][];
for (const [id, a] of defined) {
  assert.ok(a.name.length <= 20 && a.desc.length <= 90, `${id}: charged attack text too long`);
  assert.equal(a.name + a.desc, (a.name + a.desc).toUpperCase(), `${id}: charged attack text is uppercase`);
  const w = WEAPONS[CLASSES[id].weapon];
  assert.ok(![w.skill.name, w.ult.name, w.fusion?.name].includes(a.name), `${id}: charged attack reuses a skill/ult/fusion name`);
}
assert.equal(new Set(defined.map(([, a]) => a.name)).size, defined.length, 'each charged attack has its own name');
// Every class has its own: the generic fallback is never what a player sees.
assert.deepEqual(
  CLASS_IDS.filter((id) => !DEFINED[id]),
  [],
  'every class has its own charged attack',
);
console.log(`charged.check ok (${defined.length}/${CLASS_IDS.length} classes have their own charged attack)`);
