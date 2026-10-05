import type Phaser from 'phaser';
import type { SkillCtx } from '../skills.ts';

/**
 * Hold attack (TAHAN J), Hollow Knight nail-art style. Times are ms of J held since the press.
 * - A tap attacks at once, as always. Still holding J after `startMs` (and once the current swing has ended)
 *   starts the charge: the hero moves at `speed` x, swings nothing new, and the system draws the charge.
 * - Level 1 at `level1Ms`, level 2 (full) at `level2Ms`; when the charge starts late (a long finisher was still
 *   swinging) both levels shift by the same delay, so every charge takes the same time from its start.
 * - Releasing at level >= 1 fires CHARGED[classId] at that level; releasing earlier does nothing extra.
 * - Getting hit, dash, skill/ult/fusion, freeze/stun/silence, dragon form and a pause cancel it; a dive never charges.
 * - `recoverMs`: no new basic attack for this long after a charged attack fires.
 * - Automatic weapons (Gunners) keep firing while J is held, at `autoFireMult` of their rate once the charge has
 *   started (the barrel spins up), so holding the trigger still means sustained fire, with the charge as payoff.
 */
export const CHARGE = { startMs: 300, level1Ms: 600, level2Ms: 1100, speed: 0.4, recoverMs: 250, autoFireMult: 0.5 } as const;

/**
 * ctx of a charged attack: the SkillCtx of skills.ts (`p`, `world`, `scene`) with `power` always 1, because a
 * charged attack is a weapon attack: skill items (skillPower) must not scale it.
 */
export type ChargedCtx = SkillCtx;

/**
 * A class's charged attack (TAHAN J). One per class in its batch file; faithful to the character, nothing recycled
 * (its own shape, not another class's skill or this class's skill/ult/fusion again).
 *
 * What the system already does (do NOT repeat it): the charge itself (slow walk, gathering particles and aura in the
 * class color unless `charging` is given, a flash + sfx at level 1, a bigger flash + sfx + tiny shake at level 2),
 * the cancel rules, a 'heavy' sound on release, and floating `name!` over the hero (never floatText your own name).
 * Lock/invuln are up to the attack (`p.lock(ms)`, `p.invuln(ms)`); keep them short (< 0.6 s) unless it is a lunge.
 *
 * Damage, through the normal world API (`world.strike`, `area`, `shot`, `slam`, `pull`, `targets`, `afflict`):
 * - source is always 'basic' (it feeds the AMARAH stacks, ult meter, on-hit items and passives like a swing).
 * - `mult` is relative to the damage stat, like a combo move: mult 1 = one ordinary basic hit (st.damage already holds
 *   the weapon's damage). Do not multiply by c.power (it is 1 anyway).
 * - Total on one target: level 1 ≈ 2.5–3.5, level 2 ≈ 5–7 (sum of the mults that can land on one enemy). Prefer a
 *   few heavy hits over many tiny ones (each basic hit feeds the ult meter).
 * - Level 2 is the bigger version, not just more damage: more reach/area plus a stagger or launch (high knockback,
 *   `t.setVelocityY(-v)` on non-boss, non-elite enemies, `freeze`/`slow` status). `world.pull`/`slam` skip bosses.
 * - Reach flyers where it makes sense (`world.targets(x, y)` lists everything, flyers too).
 * - Aim when it fires (`p.facing`, nearest target ahead), and check `t.active` in delayed callbacks.
 */
export interface ChargedAttack {
  /** Shown floating on release and in the class picker; UPPERCASE Indonesian, ≤ 20 chars, unique. */
  name: string;
  /** UPPERCASE Indonesian, ≤ 90 chars: what level 1 does and what full (level 2) adds. */
  desc: string;
  /** Fire it. Return false when nothing happened (no target): the system then shows 'TIDAK ADA TARGET'. */
  fire(c: ChargedCtx, level: 1 | 2): boolean | void;
  /**
   * Optional: your own charging look instead of the generic particles/aura (the level flashes and sounds stay).
   * Called every frame while charging; `t01` goes 0 → 1 from the charge start to level 2, `level` is the current
   * level. `g` is a Graphics (depth 11) the system clears before every call and hides when the charge ends: draw
   * in world coordinates. Anything else you create must be short-lived (tweened out and destroyed).
   */
  charging?(c: ChargedCtx, t01: number, level: 0 | 1 | 2, g: Phaser.GameObjects.Graphics): void;
}
