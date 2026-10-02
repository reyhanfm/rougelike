import assert from 'node:assert/strict';
import { chord, midi, SONGS, steps } from './audio.ts';

assert.equal(midi('a4'), 69);
assert.equal(midi('c#5'), 73);
assert.deepEqual(chord('F#m'), [6, true]);

// Every song: lead covers each chord with one 16-step bar, the other channels are one bar,
// no channel starts with a hold, and every token parses.
for (const [name, s] of Object.entries(SONGS)) {
  const lead = steps(s.lead);
  assert.equal(lead.length, s.chords.length * 16, `${name}: lead is ${lead.length} steps for ${s.chords.length} bars`);
  s.chords.forEach((c) => chord(c));
  for (const t of lead) if (t !== '-' && t !== '.') midi(t);
  for (const [ch, line, ok] of [
    ['bass', s.bass, /^[1358.-]$/],
    ['arp', s.arp, /^[1358.-]$/],
    ['drums', s.drums, /^[ksho.]$/],
  ] as const) {
    if (!line) continue;
    const t = steps(line);
    assert.equal(t.length, 16, `${name} ${ch}: one bar of 16 steps`);
    assert.ok(
      t.every((x) => ok.test(x)),
      `${name} ${ch}: bad token in ${line}`,
    );
    assert.notEqual(t[0], '-', `${name} ${ch}: starts with a hold`);
  }
  assert.notEqual(lead[0], '-', `${name}: lead starts with a hold`);
  assert.ok(s.bpm >= 60 && s.bpm <= 200, `${name}: bpm`);
}
console.log('audio.check ok');
