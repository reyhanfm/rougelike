import type Phaser from 'phaser';
import { CLASS_IDS, CLASSES, type ClassId } from '../../logic/classes.ts';
import { PALETTE } from '../../gfx/sprites.ts';
import { cutMark } from '../../gfx/ui.ts';
import { bladeLine, ring } from '../skills.ts';
import type { ChargedAttack } from './types.ts';
import { BATCH_1 } from './batch1.ts';
import { BATCH_2 } from './batch2.ts';
import { BATCH_3 } from './batch3.ts';
import { BATCH_4 } from './batch4.ts';
import { BATCH_5 } from './batch5.ts';
import { BATCH_6 } from './batch6.ts';
import { BATCH_7 } from './batch7.ts';

export { CHARGE, type ChargedAttack, type ChargedCtx } from './types.ts';

/** The charged attacks written so far (each class in exactly one batch file). */
export const DEFINED: Partial<Record<ClassId, ChargedAttack>> = {
  ...BATCH_1,
  ...BATCH_2,
  ...BATCH_3,
  ...BATCH_4,
  ...BATCH_5,
  ...BATCH_6,
  ...BATCH_7,
};

/** Placeholder for a class whose own attack is not written yet: a heavy lunge that cuts everything along its path. */
function lungeSlash(color: number): ChargedAttack {
  return {
    name: 'TEBASAN TERTAHAN',
    desc: 'TERJANG MAJU & TEBAS SEMUA DI JALUR; PENUH: LEBIH JAUH, MUSUH TERLEMPAR',
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const x0 = p.x;
      const f = p.facing;
      // The lunge: 200 ms forward, untouchable; the cut lands along the whole path when it ends.
      p.setVelocityX(f * (full ? 450 : 300));
      p.lock(200);
      p.invuln(260);
      scene.time.delayedCall(200, () => {
        if (!p.active) return;
        bladeLine(scene, x0, p.y, p.x + f * 16, p.y, color, 80);
        if (full) ring(scene, p.x, p.y, color, 6, 34, 300, 2);
        const lo = Math.min(x0, p.x) - 18;
        const hi = Math.max(x0, p.x) + 18;
        for (const t of world.targets(p.x, p.y)) {
          if (!t.active || t.x < lo || t.x > hi || Math.abs(t.y - p.y) > (full ? 40 : 22)) continue;
          world.strike(t, full ? 6 : 3, 'basic', false, undefined, full ? 260 : 160);
          cutMark(scene, t.x, t.y, color);
          // Full charge: small fry are thrown into the air (bosses and elites are too heavy).
          if (full && t.active && !('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-200);
        }
      });
    },
  };
}

/** CHARGED[classId]: the class's hold attack, or the placeholder lunge until its batch file defines one. */
export const CHARGED: Record<ClassId, ChargedAttack> = Object.fromEntries(
  CLASS_IDS.map((id) => [id, DEFINED[id] ?? lungeSlash(PALETTE[CLASSES[id].color])]),
) as Record<ClassId, ChargedAttack>;
