import Phaser from 'phaser';
import { FLOOR_Y, H, W, cutMark, floatText } from '../gfx/ui.ts';
import type { Move, WeaponId } from '../logic/loot.ts';
import type { PlayerWorld } from './arena.ts';
import type { Player } from './Player.ts';

export interface SkillCtx {
  p: Player;
  world: PlayerWorld;
  scene: Phaser.Scene;
  /** stats.skillPower, already folded into every mult below. */
  power: number;
}

/**
 * Return false when the skill could not fire (e.g. no targets) so nothing is spent; a string when it fired as another
 * technique, shown under that name instead (Artoria's KILAU EXCALIBUR while the blade is bare).
 */
type SkillFn = (c: SkillCtx) => boolean | void | string;

/** basic: what the attack key casts for Weapon.cast weapons; fusion: attack + skill together (Weapon.fusion). */
/** onHit: runs on every melee hit of the weapon (a class mechanic, e.g. Lightning Lord's STATIK). */
/** onSwing: runs as each basic move starts (`step`: index in the combo, -1 in the air) for move-specific effects. */
type WeaponSkills = {
  skill: SkillFn;
  ult: SkillFn;
  basic?: SkillFn;
  fusion?: SkillFn;
  onHit?: (c: SkillCtx, t: Phaser.GameObjects.Sprite) => void;
  onSwing?: (c: SkillCtx, m: Move, step: number) => void;
  /** The dive (down + attack in the air) hit the ground at (x, groundY): the class's own landing. */
  onDiveLand?: (c: SkillCtx, x: number, groundY: number) => void;
};

export const later = (scene: Phaser.Scene, ms: number, fn: () => void) => scene.time.delayedCall(ms, fn);

/** What comes out of the Gate of Babylon: the held-weapon sprites of other heroes. */
export const TREASURES = ['w_pedang', 'w_tombak', 'w_kapak', 'w_belati', 'w_katana', 'w_sabit', 'w_pedangTerbang'];

type Living = Phaser.GameObjects.Sprite & { hp: number; maxHp: number };
/** King Hassan's verdict: non-boss enemies under 30% HP are executed outright. */
const doomed = (t: Phaser.GameObjects.Sprite) => !('tier' in t) && (t as Living).hp / (t as Living).maxHp < 0.3;

/** An expanding (or closing, when to < from) ring outline that fades. */
export function ring(scene: Phaser.Scene, x: number, y: number, color: number, from: number, to: number, ms: number, width = 1): void {
  const c = scene.add.circle(x, y, from).setStrokeStyle(width, color).setDepth(13);
  scene.tweens.add({ targets: c, radius: to, alpha: 0, duration: ms, onComplete: () => c.destroy() });
}

/** `n` 1px sparks flung outward from (x, y) up to `dist` px. */
export function sparks(scene: Phaser.Scene, x: number, y: number, colors: number[], n: number, dist: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = dist * (0.4 + Math.random() * 0.6);
    const s = scene.add.rectangle(x, y, 1, 1, colors[i % colors.length]).setDepth(14);
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      duration: 300,
      onComplete: () => s.destroy(),
    });
  }
}

/** Thorns bursting out of (x, y): `n` lines snapping outward (Gae Bolg's barbs). */
export function thorns(scene: Phaser.Scene, x: number, y: number, color: number, n: number, len: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const t = scene.add
      .rectangle(x + (Math.cos(a) * len) / 2, y + (Math.sin(a) * len) / 2, len, 1, color)
      .setRotation(a)
      .setScale(0, 1)
      .setDepth(14);
    scene.tweens.add({ targets: t, scaleX: 1, duration: 70, yoyo: true, hold: 120, onComplete: () => t.destroy() });
  }
}

/** Chunks of rock thrown up from the ground at x that fall back down. */
export function rocks(scene: Phaser.Scene, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = scene.add.rectangle(x, y, 2, 2, i % 2 ? 0xab5236 : 0x5f574f).setDepth(13);
    const dx = Phaser.Math.Between(-40, 40);
    const up = Phaser.Math.Between(14, 34);
    scene.tweens.add({
      targets: r,
      x: x + dx,
      y: y - up,
      angle: 180,
      duration: 220,
      ease: 'Quad.Out',
      onComplete: () =>
        scene.tweens.add({ targets: r, x: x + dx * 1.3, y, alpha: 0, duration: 260, ease: 'Quad.In', onComplete: () => r.destroy() }),
    });
  }
}

/** A fireball blast of radius r: a flash, a ring, smoke drifting up and debris. */
export function explosion(scene: Phaser.Scene, x: number, y: number, r: number): void {
  const core = scene.add.circle(x, y, r * 0.3, 0xffec27).setDepth(13);
  const fire = scene.add.circle(x, y, r * 0.5, 0xffa300, 0.8).setDepth(12);
  scene.tweens.add({ targets: core, radius: r * 0.7, alpha: 0, duration: 180, onComplete: () => core.destroy() });
  scene.tweens.add({ targets: fire, radius: r, alpha: 0, duration: 320, onComplete: () => fire.destroy() });
  ring(scene, x, y, 0xff004d, r * 0.5, r * 1.3, 350, 2);
  for (let i = 0; i < 6; i++) {
    const s = scene.add.circle(x + Phaser.Math.Between(-r / 2, r / 2), y, Phaser.Math.Between(3, 5), 0x5f574f, 0.7).setDepth(12);
    scene.tweens.add({
      targets: s,
      y: y - Phaser.Math.Between(14, 30),
      scale: 1.8,
      alpha: 0,
      duration: 700,
      onComplete: () => s.destroy(),
    });
  }
  sparks(scene, x, y, [0xffa300, 0xffec27], 10, r * 1.4);
}

/** A soul-light wisp that flies from (x, y) into the player. */
export function soulTo(scene: Phaser.Scene, x: number, y: number, p: Player, color: number): void {
  const w = scene.add.rectangle(x, y, 2, 2, color).setDepth(14);
  const cx = (x + p.x) / 2;
  const cy = Math.min(y, p.y) - 30;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 400,
    onUpdate: (tw) => {
      const [bx, by] = bez(x, y, cx, cy, p.x, p.y, tw.getValue() ?? 0);
      w.setPosition(bx, by);
    },
    onComplete: () => w.destroy(),
  });
}

/** Point `t` (0..1) along the quadratic curve from (x0, y0) bent toward (cx, cy) to (x1, y1). */
export function bez(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

/** Calls `fn` every `ms` while `obj` is alive (for projectile trails). */
export function whileAlive(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject, ms: number, fn: (k: number) => void): void {
  let k = 0;
  const ev = scene.time.addEvent({ delay: ms, loop: true, callback: () => (obj.active ? fn(k++) : ev.remove()) });
}

/** Four-point star flash on a blade (the samurai's stance before a draw). */
export function glint(scene: Phaser.Scene, x: number, y: number): void {
  const star = [scene.add.rectangle(x, y, 9, 1, 0xfff1e8), scene.add.rectangle(x, y, 1, 9, 0xfff1e8)];
  star.forEach((r) => r.setDepth(14).setScale(0));
  scene.tweens.add({ targets: star, scale: 1, angle: 45, duration: 120, yoyo: true, onComplete: () => star.forEach((r) => r.destroy()) });
}

/** A fading solid-color copy of the player at (x, y). */
export function afterimage(scene: Phaser.Scene, p: Player, x: number, y: number, alpha: number, color = 0xfff1e8): void {
  const g = scene.add
    .image(x, y, p.texture.key)
    .setFlipX(p.flipX)
    .setTint(color)
    .setTintMode(Phaser.TintModes.FILL)
    .setAlpha(alpha)
    .setDepth(9);
  scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
}

/** A flash-step's path: a white core over a colored glow from (x1, y1) to (x2, y2) that hangs for `hold` ms, then snaps shut. */
export function bladeLine(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number, color: number, hold: number): void {
  const len = Phaser.Math.Distance.Between(x1, y1, x2, y2) + 16;
  const a = Phaser.Math.Angle.Between(x1, y1, x2, y2);
  const line = [scene.add.rectangle(0, 0, len, 5, color, 0.35), scene.add.rectangle(0, 0, len, 1, 0xfff1e8)];
  line.forEach((l) =>
    l
      .setPosition((x1 + x2) / 2, (y1 + y2) / 2)
      .setRotation(a)
      .setDepth(13),
  );
  scene.tweens.add({ targets: line, scaleY: 0, alpha: 0, delay: hold, duration: 220, onComplete: () => line.forEach((l) => l.destroy()) });
}

/** Leaves bursting from (x, y), tumbling as they fall (Mokuton hits). */
export function leafBurst(scene: Phaser.Scene, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const leaf = scene.add.rectangle(x, y, 2, 1, i % 3 ? 0x00e436 : 0x008751).setDepth(14);
    const a = Math.random() * Math.PI * 2;
    const d = Phaser.Math.Between(6, 18);
    scene.tweens.add({
      targets: leaf,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d + 10,
      angle: Phaser.Math.Between(180, 540),
      alpha: 0,
      duration: Phaser.Math.Between(400, 700),
      onComplete: () => leaf.destroy(),
    });
  }
}

/** A branch snaking from (x1, y1) out to (x2, y2): a wavy line that grows, holds, then withers. */
export function vine(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number): void {
  const g = scene.add.graphics().setDepth(12);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 120,
    onUpdate: (tw) => {
      const t = tw.getValue() ?? 0;
      g.clear();
      for (const [w, c] of [
        [3, 0x4a2a1a],
        [1, 0xab5236],
      ] as const) {
        g.lineStyle(w, c).beginPath().moveTo(x1, y1);
        for (let i = 1; i <= 8; i++) {
          const k = (i / 8) * t;
          g.lineTo(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k + Math.sin(k * Math.PI * 3) * 4);
        }
        g.strokePath();
      }
    },
  });
  scene.tweens.add({ targets: g, alpha: 0, delay: 700, duration: 300, onComplete: () => g.destroy() });
}

/** A tree of height h bursting up at x: barked trunk, two branches, a layered canopy; it stands `ms` then sinks. */
export function tree(scene: Phaser.Scene, x: number, h: number, ms: number, lean: number): void {
  const g = scene.add.graphics().setDepth(4);
  const top = FLOOR_Y - h;
  g.fillStyle(0x4a2a1a).fillRect(x - 4, top, 8, h);
  g.fillStyle(0x7a4a2a).fillRect(x - 3, top, 6, h);
  g.fillStyle(0xab5236).fillRect(x - 1, top, 1, h);
  for (let y = top + 6; y < FLOOR_Y; y += 7) g.fillStyle(0x4a2a1a).fillRect(x - 3 + ((y / 7) % 2) * 3, y, 2, 1);
  // Roots flaring at the base and two branches near the top.
  g.fillStyle(0x7a4a2a).fillTriangle(x - 9, FLOOR_Y, x, FLOOR_Y - 8, x + 9, FLOOR_Y);
  g.lineStyle(3, 0x7a4a2a)
    .lineBetween(x, top + 14, x - 12 * lean, top + 4)
    .lineBetween(x, top + 22, x + 13 * lean, top + 12);
  // Wrapped in a container pinned at the floor, so scaling it grows the tree upward out of the ground.
  const trunk = scene.add.container(0, FLOOR_Y).setDepth(4).setScale(1, 0);
  trunk.add(g.setPosition(0, -FLOOR_Y));
  const crowns = [
    [-12, 4, 11, 0x008751],
    [12, 4, 11, 0x008751],
    [0, -4, 14, 0x00e436],
    [-6, -10, 8, 0x00e436],
    [7, -9, 7, 0xb4f080],
  ].map(([dx, dy, r, c]) =>
    scene.add
      .circle(x + dx, top + dy, r, c)
      .setScale(0)
      .setDepth(5),
  );
  scene.tweens.add({ targets: trunk, scaleY: 1, duration: 150, ease: 'Back.Out' });
  scene.tweens.add({ targets: crowns, scale: 1, delay: 120, duration: 200, ease: 'Back.Out' });
  later(scene, 200, () => leafBurst(scene, x, top, 6));
  scene.tweens.add({ targets: crowns, scale: 0, delay: ms, duration: 250 });
  scene.tweens.add({
    targets: trunk,
    scaleY: 0,
    delay: ms + 150,
    duration: 250,
    onComplete: () => (trunk.destroy(), crowns.forEach((c) => c.destroy())),
  });
}

/** A forked lightning bolt from (x0, y0) to (x1, y1): a wide colored glow under a white core, gone in a flicker. */
export function bolt(scene: Phaser.Scene, x0: number, y0: number, x1: number, y1: number, color = 0xffec27): void {
  const g = scene.add.graphics().setDepth(14);
  const pts: [number, number][] = [[x0, y0]];
  for (let i = 1; i < 8; i++) pts.push([x0 + ((x1 - x0) * i) / 8 + Phaser.Math.Between(-6, 6), y0 + ((y1 - y0) * i) / 8]);
  pts.push([x1, y1]);
  for (const [w, c] of [
    [4, color],
    [1, 0xfff1e8],
  ] as const) {
    g.lineStyle(w, c).beginPath().moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.strokePath();
  }
  // A short fork off the main bolt.
  const [fx, fy] = pts[4];
  g.lineStyle(1, color).lineBetween(fx, fy, fx + Phaser.Math.Between(-14, 14), fy + 12);
  scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
}

/** Points along a line from (x0, y0) to (x1, y1), each kinked sideways (perpendicular) by up to `amp` px. */
export function jag(x0: number, y0: number, x1: number, y1: number, amp: number): [number, number][] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(3, Math.round(len / 12));
  const [nx, ny] = len ? [-(y1 - y0) / len, (x1 - x0) / len] : [0, 0];
  const pts: [number, number][] = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const k = Phaser.Math.FloatBetween(-amp, amp);
    pts.push([x0 + ((x1 - x0) * i) / n + nx * k, y0 + ((y1 - y0) * i) / n + ny * k]);
  }
  pts.push([x1, y1]);
  return pts;
}

/**
 * Lightning Lord's royal lightning from (x0, y0) to (x1, y1): an electric-cyan fringe, a gold body and a white-hot core,
 * kinked across its own direction, with `forks` short branches; it fades over `ms`. `width` scales it (1-4).
 */
export function stormArc(scene: Phaser.Scene, x0: number, y0: number, x1: number, y1: number, ms = 240, width = 1, forks = 2): void {
  const g = scene.add.graphics().setDepth(14);
  const pts = jag(x0, y0, x1, y1, 4 + width * 2);
  for (const [w, c, a] of [
    [3 + width * 2, 0x7fe6ff, 0.35],
    [1 + width, 0xffec27, 1],
    [Math.max(1, width - 1), 0xfff1e8, 1],
  ] as const) {
    g.lineStyle(w, c, a).beginPath().moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.strokePath();
  }
  const dir = Math.atan2(y1 - y0, x1 - x0);
  for (let i = 0; i < forks && pts.length > 2; i++) {
    const [fx, fy] = pts[Phaser.Math.Between(1, pts.length - 2)];
    const a = dir + (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.FloatBetween(0.5, 1);
    const l = Phaser.Math.Between(8, 18) + width * 3;
    const fork = jag(fx, fy, fx + Math.cos(a) * l, fy + Math.sin(a) * l, 3);
    g.lineStyle(1 + Math.floor(width / 2), 0xffec27)
      .beginPath()
      .moveTo(fx, fy);
    for (const [x, y] of fork) g.lineTo(x, y);
    g.strokePath();
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: ms, ease: 'Quad.In', onComplete: () => g.destroy() });
}

/** Lightning Lord: STATIK charges per melee hit; the sixth calls a bolt down. */
const STATIC_MAX = 6;

/** The stored STATIK, drawn as gold pips orbiting over his crown (created once per run scene). */
export function staticCrown(scene: Phaser.Scene, p: Player): void {
  if (p.getData('staticG')) return;
  const g = scene.add.graphics().setDepth(11);
  p.setData('staticG', g);
  const draw = () => {
    g.clear();
    const n = (p.getData('static') as number | undefined) ?? 0;
    if (!p.active || !n) return;
    const t = scene.time.now / 260;
    // A faint ring they ride on, then the charges: cyan glow, dark rim, gold (white when one more calls the bolt).
    g.lineStyle(1, 0x7fe6ff, 0.25).strokeEllipse(p.x, p.y - 15, 22, 7);
    for (let i = 0; i < n; i++) {
      const a = t + (i / STATIC_MAX) * Math.PI * 2;
      const [x, y] = [p.x + Math.cos(a) * 11, p.y - 15 + Math.sin(a) * 3.5];
      g.fillStyle(0x7fe6ff, 0.5).fillCircle(x, y, 3);
      g.fillStyle(0x1d2b53).fillRect(x - 1.5, y - 1.5, 3, 3);
      g.fillStyle(n === STATIC_MAX - 1 ? 0xfff1e8 : 0xffec27).fillRect(x - 1, y - 1, 2, 2);
    }
  };
  scene.events.on('update', draw);
  scene.events.once('shutdown', () => {
    scene.events.off('update', draw);
    g.destroy();
  });
}

/** Nephalem's three colors: holy gold, hellfire crimson, and twilight violet where they meet. */
export const HOLY = 0xffec27;
export const HELL = 0xff004d;
export const TWILIGHT = 0xc080ff;
/** KESEIMBANGAN: charges of each half needed for the balance burst. */
const BALANCE_MAX = 4;

/**
 * Nephalem's wings, drawn at the graphics' origin: a white feathered wing toward `angel` (-1 left, 1 right) and a black
 * bat wing toward the other side. `span` is the longest feather in px; `flap` (-1..1) tilts both up or down.
 */
export function twilightWings(g: Phaser.GameObjects.Graphics, angel: number, span: number, flap: number): void {
  // The angel's wing: five feathers fanned up and out, longest on top; grey outline, white vane, a gold tip.
  for (let k = 0; k < 5; k++) {
    const a = -1.05 + k * 0.33 + flap * 0.5;
    const l = span * (1 - k * 0.1);
    const [tx, ty] = [angel * Math.cos(a) * l, Math.sin(a) * l];
    const w = 1.5 + span * 0.06;
    g.fillStyle(0x83769c).fillTriangle(0, -w - 0.8, 0, w + 0.8, tx * 1.04, ty * 1.04);
    g.fillStyle(0xfff1e8).fillTriangle(0, -w, 0, w, tx, ty);
    g.fillStyle(HOLY).fillCircle(tx * 0.92, ty * 0.92, Math.max(1, span * 0.04));
  }
  // The demon's wing: three finger bones with a scalloped membrane between them and a claw at the top.
  const d = -angel;
  const bones = [-1.0, -0.45, 0.15].map((b, i) => {
    const l = span * [1, 0.85, 0.6][i];
    return { x: d * Math.cos(b + flap * 0.5) * l, y: Math.sin(b + flap * 0.5) * l };
  });
  const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
  const pts = [v(0, -1)];
  bones.forEach((b, i) => {
    pts.push(v(b.x, b.y));
    const n = bones[i + 1];
    if (n) pts.push(v((b.x + n.x) * 0.36, (b.y + n.y) * 0.36 + 1));
  });
  pts.push(v(d * 2, span * 0.18));
  g.fillStyle(0x7a2230).fillPoints(pts, true);
  g.lineStyle(1, 0x1d0f2e).strokePoints(pts, true);
  for (const b of bones) g.lineStyle(1, 0x3b1a2a).lineBetween(0, 0, b.x, b.y);
  g.fillStyle(0xfff1e8).fillRect(bones[0].x - 0.5, bones[0].y - 1.5, 1, 2);
}

/** A balance sigil (gold and crimson halves curled into each other) that swells, turns and fades at (x, y). */
export function balanceSigil(scene: Phaser.Scene, x: number, y: number, r: number): void {
  const g = scene.add.graphics();
  g.fillStyle(HOLY)
    .slice(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
    .fillPath();
  g.fillStyle(HELL)
    .slice(0, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false)
    .fillPath();
  g.fillStyle(HELL).fillCircle(0, -r / 2, r / 2);
  g.fillStyle(HOLY).fillCircle(0, r / 2, r / 2);
  g.fillStyle(HOLY).fillCircle(0, -r / 2, r / 6);
  g.fillStyle(HELL).fillCircle(0, r / 2, r / 6);
  g.lineStyle(2, TWILIGHT).strokeCircle(0, 0, r);
  const c = scene.add.container(x, y, [g]).setDepth(13).setScale(0).setAlpha(0.6);
  scene.tweens.add({ targets: c, scale: 1, angle: 180, duration: 320, ease: 'Quad.Out' });
  scene.tweens.add({ targets: c, alpha: 0, scale: 1.3, delay: 320, duration: 260, onComplete: () => c.destroy() });
}

/** Gojo's cursed-energy spheres: Blue (attraction), Red (repulsion), Purple (imaginary mass). */
const ORB_COLORS = {
  ao: { rim: 0x1d2b53, mid: 0x29adff, lit: 0xc2f0ff },
  aka: { rim: 0x7a0a1e, mid: 0xff004d, lit: 0xff77a8 },
  murasaki: { rim: 0x1d0f2e, mid: 0x8a3fd1, lit: 0xc080ff },
} as const;

/**
 * A layered sphere of radius `r` at (x, y): dark rim, colored body, lit side, a white heart and three spiral arms,
 * turning (`spin` > 0 clockwise for Blue drawing in, < 0 for Red throwing out). Returns its container (destroy it).
 */
export function cursedOrb(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r: number,
  kind: keyof typeof ORB_COLORS,
  spin = 1,
): Phaser.GameObjects.Container {
  const c = ORB_COLORS[kind];
  const g = scene.add.graphics();
  g.fillStyle(c.mid, 0.25).fillCircle(0, 0, r * 1.45);
  g.fillStyle(c.rim).fillCircle(0, 0, r + 1);
  g.fillStyle(c.mid).fillCircle(0, 0, r);
  g.fillStyle(c.lit).fillCircle(-r * 0.25, -r * 0.25, r * 0.55);
  g.fillStyle(0xfff1e8).fillCircle(0, 0, Math.max(1, r * 0.28));
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2;
    g.lineStyle(Math.max(1, r * 0.12), 0xfff1e8, 0.8).beginPath();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const [px, py] = [Math.cos(a0 + t * 2.4) * r * 1.3 * (1 - t * 0.7), Math.sin(a0 + t * 2.4) * r * 1.3 * (1 - t * 0.7)];
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.strokePath();
  }
  const o = scene.add.container(x, y, [g]).setDepth(13);
  scene.tweens.add({ targets: o, angle: 360 * spin, duration: 700, repeat: -1 });
  return o;
}

/**
 * Of the lines from (ox, oy) toward each enemy, the one that passes within `width` of the most of them (ahead of the
 * origin only); ties go to the nearer enemy. Returns the angle, or `fallback` when there is no one.
 */
export function bestLine(foes: Phaser.GameObjects.Sprite[], ox: number, oy: number, width: number, fallback: number): number {
  let best = { a: fallback, n: 0, d: Infinity };
  for (const t of foes) {
    const a = Phaser.Math.Angle.Between(ox, oy, t.x, t.y);
    const [cx, cy] = [Math.cos(a), Math.sin(a)];
    const n = foes.filter((e) => {
      const along = (e.x - ox) * cx + (e.y - oy) * cy;
      return along > -6 && Math.abs(-(e.x - ox) * cy + (e.y - oy) * cx) <= width;
    }).length;
    const d = Phaser.Math.Distance.Between(ox, oy, t.x, t.y);
    if (n > best.n || (n === best.n && d < best.d)) best = { a, n, d };
  }
  return best.a;
}

/** The visible spectrum, red to violet: what Lumina's light runs through when it is bent or reflected. */
export const SPECTRUM: readonly number[] = [0xff004d, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0x2a4bd7, 0x8a3fd1];

/**
 * Lumina's ray of light from (x, y) along angle `a` for `len` px: a cyan glow, a red fringe on one side and a violet
 * one on the other (the light split at its edges), and a white-hot core; it fades over `ms`.
 */
export function lightRay(scene: Phaser.Scene, x: number, y: number, a: number, len: number, width = 1, ms = 240): void {
  const [ex, ey] = [x + Math.cos(a) * len, y + Math.sin(a) * len];
  const [nx, ny] = [-Math.sin(a) * (1 + width), Math.cos(a) * (1 + width)];
  const g = scene.add.graphics().setDepth(13);
  g.lineStyle(4 + width * 3, 0x7fe6ff, 0.3).lineBetween(x, y, ex, ey);
  g.lineStyle(1, 0xff004d, 0.8).lineBetween(x + nx, y + ny, ex + nx, ey + ny);
  g.lineStyle(1, 0x8a3fd1, 0.8).lineBetween(x - nx, y - ny, ex - nx, ey - ny);
  g.lineStyle(1 + width, 0xfff1e8).lineBetween(x, y, ex, ey);
  scene.tweens.add({ targets: g, alpha: 0, duration: ms, ease: 'Quad.In', onComplete: () => g.destroy() });
}

/** Whether `t` lies within `w` px of the segment from (x, y) along angle `a` for `len` px. */
export function onLine(x: number, y: number, a: number, len: number, t: { x: number; y: number }, w: number): boolean {
  const [dx, dy] = [t.x - x, t.y - y];
  const along = dx * Math.cos(a) + dy * Math.sin(a);
  return along >= -w && along <= len + w && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= w;
}

/** A hexagonal mirror of hard light at the graphics' origin: a pale face, a colored rim and a white glint line. */
export function hexMirror(g: Phaser.GameObjects.Graphics, r: number, rim: number): void {
  const pts = Array.from(
    { length: 6 },
    (_, i) => new Phaser.Math.Vector2(Math.cos((i / 6) * Math.PI * 2) * r, Math.sin((i / 6) * Math.PI * 2) * r),
  );
  g.fillStyle(0xfff1e8, 0.2).fillCircle(0, 0, r + 3);
  g.fillStyle(0xc2f0ff, 0.6).fillPoints(pts, true);
  g.lineStyle(1, rim).strokePoints(pts, true);
  g.lineStyle(1, 0xffffff).lineBetween(-r * 0.4, -r * 0.5, r * 0.1, r * 0.5);
}

/** A boulder ripped from the ground at (x0, FLOOR_Y) and hurled in an arc onto `t`; `onHit` runs if it lands. */
export function hurlRock(scene: Phaser.Scene, x0: number, t: Phaser.GameObjects.Sprite, onHit: () => void): void {
  const r = scene.add
    .image(x0, FLOOR_Y - 4, 'boulder')
    .setScale(2)
    .setDepth(13);
  const [tx, ty] = [t.x, t.y];
  const cy = Math.min(FLOOR_Y, ty) - 40;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 380,
    onUpdate: (tw) => {
      const k = tw.getValue() ?? 0;
      r.setPosition(...bez(x0, FLOOR_Y - 4, (x0 + tx) / 2, cy, tx, ty, k)).setAngle(k * 540);
    },
    onComplete: () => {
      r.destroy();
      rocks(scene, tx, ty, 5);
      ring(scene, tx, ty, 0xab5236, 4, 20, 200, 2);
      if (t.active) onHit();
    },
  });
}

/** Black feathers (King Hassan's omen of death) shed around (x, y) within `spread` px, tumbling down `fall` px. */
export function feathers(scene: Phaser.Scene, x: number, y: number, n: number, spread: number, fall: number): void {
  for (let i = 0; i < n; i++) {
    // A dark vane, a grey rachis along it and a pale tip, so it still reads against the night of Azrael.
    const g = scene.add
      .graphics()
      .fillStyle(0x1c1c28)
      .fillRect(-2, 0, 4, 1)
      .fillStyle(0x5f574f)
      .fillRect(-1, -1, 3, 1)
      .fillStyle(0x83769c)
      .fillRect(2, 0, 1, 1)
      .setPosition(x + Phaser.Math.Between(-spread, spread), y + Phaser.Math.Between(-4, 4))
      .setAngle(Phaser.Math.Between(0, 360))
      .setDepth(13);
    const ms = 700 + fall * 8 + Phaser.Math.Between(0, 300);
    scene.tweens.add({ targets: g, y: g.y + fall, angle: g.angle + Phaser.Math.Between(-240, 240), duration: ms, ease: 'Sine.In' });
    scene.tweens.add({ targets: g, x: g.x + Phaser.Math.Between(-10, 10), duration: ms / 4, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: g, alpha: 0, delay: ms * 0.6, duration: ms * 0.4, onComplete: () => g.destroy() });
  }
}

/** Flame palettes for `flameTongue`: rim, body, core. */
export const AZURE: readonly [number, number, number] = [0x2a4bd7, 0x29adff, 0xc2f0ff];
export const FIRE: readonly [number, number, number] = [0xff004d, 0xffa300, 0xffec27];

/** A tongue of flame `h` px tall rising from (x, y) (Azrael's azure grave-fire by default); it licks up and dies. */
export function flameTongue(scene: Phaser.Scene, x: number, y: number, h: number, ms = 420, colors = AZURE): void {
  const g = scene.add.graphics().setPosition(x, y).setDepth(15);
  const w = Math.max(2, h * 0.3);
  const lean = Phaser.Math.FloatBetween(-0.3, 0.3) * w;
  for (const [k, c] of [
    [1, colors[0]],
    [0.7, colors[1]],
    [0.35, colors[2]],
  ] as const) {
    g.fillStyle(c).fillCircle(0, -w * k, w * k);
    g.fillTriangle(-w * k, -w * k, w * k, -w * k, lean * k, -h * (0.45 + 0.55 * k));
  }
  // Pinned at its base, so it shoots up out of the ground, then thins and drifts up as it dies.
  g.setScale(0.6, 0.2);
  scene.tweens.add({ targets: g, scaleX: 1, scaleY: 1, duration: 110, ease: 'Back.Out' });
  scene.tweens.add({ targets: g, y: y - h * 0.4, scaleX: 0.3, alpha: 0, delay: 110, duration: ms, onComplete: () => g.destroy() });
}

/**
 * Azrael drawn large: the hilt at the returned container's origin, the blade `len` px long pointing up (rotate the
 * container to swing it). Black outline, steel body with a lit edge, the azure fuller, a halo of blue fire behind.
 */
export function azraelBlade(scene: Phaser.Scene, x: number, y: number, len: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x29adff, 0.3).fillRect(-7, -len - 4, 14, len + 2);
  g.fillStyle(0x000000).fillCircle(0, 12, 3).fillRect(-2, 2, 4, 9).fillRect(-10, -2, 20, 4);
  g.fillTriangle(-5, -len + 6, 5, -len + 6, 0, -len - 2).fillRect(-5, -len + 6, 10, len - 4);
  g.fillStyle(0x83769c).fillCircle(0, 12, 2);
  g.fillStyle(0x3b3b4f).fillRect(-1, 2, 2, 9);
  g.fillStyle(0x5f574f).fillRect(-9, -1, 18, 2);
  g.fillStyle(0xc2c3c7).fillRect(-9, -1, 18, 1);
  g.fillTriangle(-4, -len + 6, 4, -len + 6, 0, -len).fillRect(-4, -len + 6, 8, len - 5);
  g.fillStyle(0xfff1e8).fillRect(-4, -len + 6, 2, len - 5);
  g.fillStyle(0x7fe6ff).fillRect(-1, -len + 10, 2, len - 14);
  return scene.add.container(x, y, [g]).setDepth(14);
}

/** The evening bell, a bronze bell hung by its crown at (x, y): returned as a container so it swings about the crown. */
export function eveningBell(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
  const shape = (k: number) =>
    [
      [-5, 3],
      [5, 3],
      [7, 8],
      [8, 15],
      [11, 18],
      [-11, 18],
      [-8, 15],
      [-7, 8],
    ].map(([px, py]) => new Phaser.Math.Vector2(px * k, 3 + (py - 3) * k));
  const g = scene.add.graphics();
  g.lineStyle(2, 0x2a1a10).strokeCircle(0, 1, 2);
  g.fillStyle(0x2a1a10).fillPoints(shape(1), true);
  g.fillStyle(0x7a5c44).fillPoints(shape(0.85), true);
  // Sound bow and lip in old gold, a lit flank, and the clapper hanging below the mouth.
  g.fillStyle(0xd4a017).fillRect(-8, 14, 16, 1).fillRect(-6, 7, 12, 1);
  g.fillStyle(0xffec27).fillRect(-4, 5, 1, 8);
  g.fillStyle(0x2a1a10).fillCircle(0, 19, 2);
  return scene.add.container(x, y, [g]).setScale(scale).setDepth(13);
}

/** The four spells of the Elementalis' cycle, cast in turn by the skill key: fire, ice, lightning, earth. */
const ELEMENT_SPELLS: SkillFn[] = [
  // Inferno: three pillars of fire erupt one after another ahead of her, each roaring up past the sky.
  ({ p, world, scene, power }) => {
    const f = p.facing;
    p.lock(300);
    p.setVelocityX(0);
    floatText(scene, p.x, p.y - 44, 'INFERNO', '#ff004d');
    for (let i = 0; i < 3; i++)
      later(scene, i * 120, () => {
        const x = Phaser.Math.Clamp(p.x + f * (36 + i * 38), 8, W - 8);
        ring(scene, x, FLOOR_Y - 1, 0xffa300, 2, 16, 200);
        const pillar = scene.add.container(x, FLOOR_Y).setDepth(11).setScale(1, 0);
        pillar.add(
          (
            [
              [20, 0xff004d, 0.75],
              [12, 0xffa300, 0.9],
              [4, 0xffec27, 1],
            ] as const
          ).map(([w, c, a]) => scene.add.rectangle(0, 0, w, 140, c, a).setOrigin(0.5, 1)),
        );
        scene.tweens.add({ targets: pillar, scaleY: 1, duration: 120, ease: 'Quad.Out' });
        scene.tweens.add({ targets: pillar, scaleX: 0, alpha: 0, delay: 450, duration: 250, onComplete: () => pillar.destroy() });
        for (let k = 0; k < 10; k++) {
          const e = scene.add
            .rectangle(x + Phaser.Math.Between(-8, 8), FLOOR_Y - Phaser.Math.Between(0, 100), 2, 2, k % 2 ? 0xffa300 : 0xff004d)
            .setDepth(12);
          scene.tweens.add({ targets: e, y: e.y - 30, alpha: 0, duration: 500, onComplete: () => e.destroy() });
        }
        scene.cameras.main.shake(90, 0.01);
        for (const t of world.targets(x, FLOOR_Y))
          if (Math.abs(t.x - x) < 14 && t.y > FLOOR_Y - 145) world.strike(t, 1.3 * power, 'skill', false, { burn: 0.4 });
      });
  },
  // Glacier: the air around her freezes in a burst; ice shards fly out and a ring of spikes cracks up from the floor.
  ({ p, world, scene, power }) => {
    const { x, y } = p;
    floatText(scene, x, y - 44, 'GLACIER', '#29adff');
    scene.cameras.main.flash(120, 41, 173, 255);
    const dome = scene.add.circle(x, y, 6, 0xc2f0ff, 0.35).setStrokeStyle(2, 0xfff1e8).setDepth(12);
    scene.tweens.add({ targets: dome, radius: 70, alpha: 0, duration: 400, onComplete: () => dome.destroy() });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const shard = scene.add.image(x, y, 'iceshard').setRotation(a).setDepth(12);
      scene.tweens.add({
        targets: shard,
        x: x + Math.cos(a) * 70,
        y: y + Math.sin(a) * 70,
        alpha: 0,
        duration: 380,
        onComplete: () => shard.destroy(),
      });
    }
    for (const dx of [-56, -40, -26, 26, 40, 56]) {
      const h = 22 - Math.abs(dx) / 4;
      const c = scene.add
        .triangle(x + dx, FLOOR_Y, -4, 0, 0, -h, 4, 0, 0xc2f0ff)
        .setOrigin(0)
        .setStrokeStyle(1, 0x29adff)
        .setScale(1, 0)
        .setDepth(9);
      scene.tweens.add({ targets: c, scaleY: 1, duration: 120, yoyo: true, hold: 600, onComplete: () => c.destroy() });
    }
    world.area(x, y, 70, 1.4 * power, 80, 'skill', { freeze: 1800 });
  },
  // Thunder: the sky splits and lightning strikes the five nearest enemies wherever they are, arcing on to their
  // neighbours.
  ({ p, world, scene, power }) => {
    floatText(scene, p.x, p.y - 44, 'THUNDER', '#ffec27');
    const cloud = scene.add.rectangle(0, 0, W, 16, 0x1d2b53, 0.8).setOrigin(0).setDepth(12).setAlpha(0);
    scene.tweens.add({ targets: cloud, alpha: 1, duration: 120, yoyo: true, hold: 600, onComplete: () => cloud.destroy() });
    const foes = world.targets(p.x, p.y).slice(0, 5);
    foes.forEach((t, i) =>
      later(scene, 120 + i * 90, () => {
        if (!t.active) return;
        bolt(scene, t.x + Phaser.Math.Between(-20, 20), 0, t.x, t.y);
        if (i === 0) scene.cameras.main.flash(50, 255, 241, 232);
        scene.cameras.main.shake(70, 0.008);
        world.strike(t, 1.4 * power, 'skill', false, { freeze: 400 });
        for (const n of world.targets(t.x, t.y).slice(1, 3)) {
          if (Phaser.Math.Distance.Between(t.x, t.y, n.x, n.y) > 60) break;
          bolt(scene, t.x, t.y, n.x, n.y, 0x29adff);
          world.strike(n, 0.5 * power, 'skill', false, { freeze: 250 });
        }
      }),
    );
  },
  // Quake: she drives the staff into the ground; spikes of rock burst up in a wave to both sides and boulders torn
  // from the floor are hurled at anything flying.
  ({ p, world, scene, power }) => {
    const { x } = p;
    p.lock(350);
    p.setVelocityX(0);
    floatText(scene, x, p.y - 44, 'QUAKE', '#00e436');
    scene.cameras.main.shake(400, 0.018);
    for (let i = 1; i <= 7; i++)
      later(scene, i * 50, () => {
        for (const s of [-1, 1]) {
          const sx = x + s * i * 17;
          if (sx < 0 || sx > W) continue;
          const h = 10 + i * 2;
          const spike = scene.add
            .triangle(sx, FLOOR_Y, -5, 0, s * 2, -h, 5, 0, i % 2 ? 0xab5236 : 0x5f574f)
            .setOrigin(0)
            .setStrokeStyle(1, 0x3b2418)
            .setScale(1, 0)
            .setDepth(9);
          scene.tweens.add({ targets: spike, scaleY: 1, duration: 90, yoyo: true, hold: 500, onComplete: () => spike.destroy() });
          rocks(scene, sx, FLOOR_Y, 2);
        }
      });
    later(scene, 120, () => {
      for (const t of world.targets(x, FLOOR_Y)) {
        if (Math.abs(t.x - x) > 125) continue;
        if (t.y > FLOOR_Y - 30) world.strike(t, 1.5 * power, 'skill', false, { slow: 1500 });
      }
    });
    world
      .targets(x, p.y)
      .filter((t) => t.y <= FLOOR_Y - 30)
      .slice(0, 3)
      .forEach((t, i) =>
        later(scene, 150 + i * 90, () => hurlRock(scene, x + (i - 1) * 14, t, () => world.strike(t, 1.5 * power, 'skill', true))),
      );
  },
];

/** A Susanoo sword, hilt at the container's origin, blade `len` px pointing up: dark edge, blue body, a pale core. */
export function susanooBlade(scene: Phaser.Scene, x: number, y: number, len: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x29adff, 0.25).fillRect(-6, -len - 4, 12, len + 4);
  g.fillStyle(0x1d2b53)
    .fillRect(-4, -len + 4, 8, len - 2)
    .fillTriangle(-4, -len + 4, 4, -len + 4, 0, -len - 3);
  g.fillRect(-8, -2, 16, 4).fillRect(-2, 2, 4, 8);
  g.fillStyle(0x29adff)
    .fillRect(-3, -len + 4, 6, len - 4)
    .fillTriangle(-3, -len + 4, 3, -len + 4, 0, -len - 1);
  g.fillStyle(0xc2f0ff).fillRect(-1, -len + 6, 1, len - 10);
  g.fillStyle(0x2a4bd7).fillRect(-7, -1, 14, 2);
  return scene.add.container(x, y, [g]).setDepth(10);
}

/**
 * Madara's Perfect Susanoo, about 130 px tall from (x, y) up, facing `f`: separate layers to build it in stages:
 * `bones` (spine and ribs), `flesh` (body, pauldrons, tengu helm with its crescent crest), `wings` and glowing `eyes`.
 * All start invisible (wings folded to scaleX 0).
 */
export function perfectSusanoo(
  scene: Phaser.Scene,
  x: number,
  y: number,
  f: number,
): {
  bones: Phaser.GameObjects.Container;
  flesh: Phaser.GameObjects.Container;
  wings: Phaser.GameObjects.Container;
  eyes: Phaser.GameObjects.Container;
} {
  const V = (pts: number[][]) => pts.map(([px, py]) => new Phaser.Math.Vector2(px, py));
  const b = scene.add.graphics();
  b.lineStyle(3, 0x1d2b53, 0.9).lineBetween(0, 0, 0, -84);
  b.lineStyle(1, 0xc2f0ff).lineBetween(0, 0, 0, -84);
  for (let i = 0; i < 5; i++) {
    const ry = -74 + i * 11;
    for (const side of [-1, 1]) {
      b.lineStyle(3, 0x1d2b53, 0.9)
        .beginPath()
        .moveTo(0, ry)
        .lineTo(side * (20 - i), ry + 4)
        .lineTo(side * (16 - i), ry + 10)
        .strokePath();
      b.lineStyle(1, 0x29adff)
        .beginPath()
        .moveTo(0, ry)
        .lineTo(side * (20 - i), ry + 4)
        .lineTo(side * (16 - i), ry + 10)
        .strokePath();
    }
  }
  b.lineStyle(2, 0xc2f0ff).strokeCircle(2, -96, 9);
  const w = scene.add.graphics();
  for (const [k, c, a] of [
    [1.06, 0x1d2b53, 0.9],
    [1, 0x29adff, 0.45],
    [0.7, 0xc2f0ff, 0.35],
  ] as const) {
    w.fillStyle(c, a).fillPoints(
      V([
        [-8, -76],
        [-40 * k, -122 * k],
        [-62 * k, -118 * k],
        [-80 * k, -96 * k],
        [-66 * k, -92 * k],
        [-78 * k, -74 * k],
        [-60 * k, -70 * k],
        [-66 * k, -52 * k],
        [-30, -60],
      ]),
      true,
    );
  }
  w.lineStyle(1, 0xc2f0ff, 0.8).lineBetween(-12, -74, -60, -114).lineBetween(-14, -70, -70, -92).lineBetween(-18, -66, -62, -66);
  const fl = scene.add.graphics();
  // A tapered torso rising out of chakra: narrow waist, broad chest, sloped shoulders up to the neck.
  const torso = (k: number) =>
    V([
      [-12, 0],
      [12, 0],
      [16, -24],
      [30, -60],
      [24, -72],
      [8, -80],
      [-8, -80],
      [-24, -72],
      [-30, -60],
      [-16, -24],
    ]).map((v) => new Phaser.Math.Vector2(v.x * k, v.y));
  fl.fillStyle(0x1d2b53, 0.8).fillPoints(torso(1.1), true);
  fl.fillStyle(0x29adff, 0.45).fillPoints(torso(1), true);
  fl.fillStyle(0x2a4bd7, 0.45).fillPoints(torso(0.6), true);
  // Lamellar armor: rows of curved plates down the belly, two curved chest plates.
  for (let i = 0; i < 4; i++) {
    const yy = -10 - i * 8;
    const hw = 12 + i * 2;
    fl.lineStyle(1, 0xc2f0ff, 0.7)
      .beginPath()
      .moveTo(-hw, yy)
      .lineTo(-hw / 2, yy + 2)
      .lineTo(hw / 2, yy + 2)
      .lineTo(hw, yy)
      .strokePath();
  }
  fl.lineStyle(1, 0xc2f0ff, 0.9).strokeEllipse(-11, -58, 18, 12).strokeEllipse(11, -58, 18, 12);
  // Chakra flames licking up from where the body meets the floor.
  for (let i = -3; i <= 3; i++) {
    fl.fillStyle(0x29adff, 0.5).fillTriangle(i * 6 - 4, 2, i * 6 + 4, 2, i * 6, -10 - (i % 2 ? 4 : 8));
    fl.fillStyle(0xc2f0ff, 0.6).fillTriangle(i * 6 - 2, 2, i * 6 + 2, 2, i * 6, -5);
  }
  for (const side of [-1, 1]) {
    fl.fillStyle(0x1d2b53, 0.9).fillEllipse(side * 28, -70, 24, 12);
    fl.fillStyle(0x29adff, 0.6).fillEllipse(side * 28, -71, 20, 8);
    fl.lineStyle(1, 0xc2f0ff).lineBetween(side * 28 - 8, -74, side * 28 + 8, -74);
  }
  fl.lineStyle(6, 0x1d2b53, 0.85).lineBetween(30, -66, 40, -46);
  fl.lineStyle(4, 0x29adff, 0.6).lineBetween(30, -66, 40, -46);
  // The tengu helm: a round head, the long nose jutting forward, the crescent crest.
  fl.fillStyle(0x1d2b53, 0.95).fillCircle(2, -94, 12).fillTriangle(10, -96, 10, -88, 32, -90);
  fl.fillStyle(0x29adff, 0.8).fillCircle(2, -94, 10).fillTriangle(11, -94, 11, -90, 29, -90);
  fl.fillStyle(0x1d2b53).fillTriangle(-14, -112, 2, -104, -2, -108).fillTriangle(18, -114, 2, -104, 6, -108);
  fl.fillStyle(0xc2f0ff).fillTriangle(-12, -111, 2, -105, -1, -107).fillTriangle(16, -113, 3, -105, 6, -107);
  const e = scene.add.graphics();
  e.fillStyle(0xfff1e8).fillRect(4, -97, 4, 2);
  e.fillStyle(0xff004d).fillRect(6, -97, 1, 2);
  const mk = (g: Phaser.GameObjects.Graphics, d: number) => scene.add.container(x, y, [g]).setScale(f, 1).setDepth(d).setAlpha(0);
  // Behind the enemies (depth 5) so they stay readable; the swords are drawn above everything.
  return { bones: mk(b, 4.2), flesh: mk(fl, 4.4), wings: mk(w, 4).setScale(0, 1), eyes: mk(e, 4.6) };
}

/** Gae Bolg drawn large, pointing right from the container's origin (`len` px of shaft): crimson glow, dark shaft, a barbed red head. */
export function crimsonSpear(scene: Phaser.Scene, len: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0xff004d, 0.25).fillRect(-len / 2 - 2, -3, len + 14, 6);
  g.fillStyle(0x1d0f0a).fillRect(-len / 2, -1.5, len, 3);
  g.fillStyle(0x7e2553).fillRect(-len / 2, -0.5, len, 1);
  const head = (k: number) =>
    [
      [0, -3],
      [3, -1],
      [10, 0],
      [3, 1],
      [0, 3],
      [2, 0],
    ].map(([x, y]) => new Phaser.Math.Vector2(len / 2 + x * k, y * k));
  g.fillStyle(0x1d0f0a).fillPoints(head(1.3), true);
  g.fillStyle(0xff004d).fillPoints(head(1), true);
  g.fillStyle(0xff77a8).fillRect(len / 2 + 2, -0.5, 5, 1);
  // The barbs along the shaft behind the head.
  g.fillStyle(0xff004d)
    .fillTriangle(len / 2 - 4, -1, len / 2 - 8, -4, len / 2 - 6, -1)
    .fillTriangle(len / 2 - 4, 1, len / 2 - 8, 4, len / 2 - 6, 1);
  return scene.add.container(0, 0, [g]).setDepth(14);
}

/** A small puff of gun smoke at (x, y). */
export function smokePuff(scene: Phaser.Scene, x: number, y: number): void {
  for (let i = 0; i < 4; i++) {
    const c = scene.add.circle(x + Phaser.Math.Between(-2, 2), y + Phaser.Math.Between(-2, 2), 2, 0x83769c, 0.7).setDepth(12);
    scene.tweens.add({ targets: c, y: c.y - 6, scale: 2, alpha: 0, duration: 300, onComplete: () => c.destroy() });
  }
}

/** A giant blade of shadow, hilt at the container's origin and pointing up `len` px: black edge, violet body, a crimson vein. */
export function shadowBlade(scene: Phaser.Scene, x: number, y: number, len: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x8a3fd1, 0.25).fillRect(-9, -len - 4, 18, len + 4);
  g.fillStyle(0x000000)
    .fillRect(-6, -len + 6, 12, len - 4)
    .fillTriangle(-6, -len + 6, 6, -len + 6, 0, -len - 3);
  g.fillRect(-11, -3, 22, 5).fillRect(-2, 2, 4, 9);
  g.fillStyle(0x2a0a2a)
    .fillRect(-5, -len + 6, 10, len - 5)
    .fillTriangle(-5, -len + 6, 5, -len + 6, 0, -len - 1);
  g.fillStyle(0x7e2553).fillRect(-10, -2, 20, 3);
  g.fillStyle(0xc080ff).fillRect(4, -len + 6, 1, len - 6);
  g.fillStyle(0xff004d).fillRect(-1, -len + 10, 2, len - 16);
  return scene.add.container(x, y, [g]).setDepth(12);
}

/** A skeletal hand clawing up out of the floor at x (scaleY 0: still underground; tween scaleY to 1.5 to raise it). */
export function underworldHand(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  // Forearm, palm and four hooked fingers: dark outline, bone, a pale lit edge.
  for (const [w, c] of [
    [3, 0x1c1c28],
    [1, 0xc2c3c7],
  ] as const) {
    g.lineStyle(w, c).lineBetween(0, 0, 0, -10);
    for (const [dx, h] of [
      [-4, 14],
      [-1, 17],
      [2, 16],
      [5, 13],
    ])
      g.beginPath()
        .moveTo(0, -10)
        .lineTo(dx, -h)
        .lineTo(dx + (dx < 0 ? 2 : -2), -h - 2)
        .strokePath();
  }
  g.fillStyle(0xfff1e8).fillRect(-1, -9, 1, 6);
  g.fillStyle(0x7e2553, 0.5).fillEllipse(0, 0, 12, 3);
  return scene.add.container(x, y, [g]).setScale(1.5, 0).setDepth(11);
}

/** Dark smoke billowing from (x, y) (the Reaper's giant rising and fading). */
export function smoke2(scene: Phaser.Scene, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const s = scene.add
      .circle(x + Phaser.Math.Between(-18, 18), y + Phaser.Math.Between(-6, 6), Phaser.Math.Between(3, 6), i % 2 ? 0x1c1c28 : 0x2a0a2a, 0.8)
      .setDepth(9);
    scene.tweens.add({
      targets: s,
      y: s.y - Phaser.Math.Between(10, 26),
      scale: 2,
      alpha: 0,
      duration: 700,
      onComplete: () => s.destroy(),
    });
  }
}

/**
 * The Reaper's true shape, about 70 px tall: a hooded black cloak with a tattered hem, a skull with red pinpoints
 * for eyes, and the great scythe held at its shoulder (`scythe` turns about the grip). Facing `f`, feet at `body`'s origin.
 */
export function giantReaper(
  scene: Phaser.Scene,
  x: number,
  y: number,
  f: number,
): { body: Phaser.GameObjects.Container; scythe: Phaser.GameObjects.Container } {
  const g = scene.add.graphics();
  const cloak = (k: number) => {
    const pts = [
      [0, -72],
      [9, -66],
      [15, -52],
      [18, -30],
      [23, 0],
      [16, -4],
      [10, 0],
      [4, -5],
      [-3, 0],
      [-9, -5],
      [-16, 0],
      [-22, -3],
      [-18, -30],
      [-15, -52],
      [-9, -66],
    ];
    return pts.map(([px, py]) => new Phaser.Math.Vector2(px * k, -36 + (py + 36) * k));
  };
  g.fillStyle(0x7e2553, 0.25).fillEllipse(0, -36, 60, 84);
  g.fillStyle(0x000000).fillPoints(cloak(1.06), true);
  g.fillStyle(0x1c1c28).fillPoints(cloak(1), true);
  g.fillStyle(0x2a0a2a).fillPoints(cloak(0.6), true);
  g.fillStyle(0x5f574f).fillRect(-14, -50, 1, 26).fillRect(9, -48, 1, 30);
  // The hood's mouth and the skull inside it.
  g.fillStyle(0x000000).fillEllipse(3, -58, 14, 16);
  g.fillStyle(0xc2c3c7).fillEllipse(4, -58, 9, 11);
  g.fillStyle(0xfff1e8).fillRect(1, -63, 4, 1);
  g.fillStyle(0x000000).fillRect(1, -60, 3, 3).fillRect(6, -60, 3, 3).fillRect(2, -53, 6, 1);
  g.fillStyle(0xff004d).fillRect(2, -59, 1, 1).fillRect(7, -59, 1, 1);
  // The bony hand at the shoulder.
  g.fillStyle(0xc2c3c7).fillRect(13, -44, 5, 3);
  const body = scene.add.container(x, y, [g]).setScale(f, 1).setDepth(9);
  const s = scene.add.graphics();
  s.lineStyle(3, 0x1c1c28).lineBetween(0, 34, 0, -44);
  s.lineStyle(1, 0x7a5c44).lineBetween(0, 34, 0, -44);
  const blade = (k: number) =>
    [
      [0, -46],
      [18, -50],
      [36, -44],
      [50, -30],
      [40, -36],
      [24, -42],
      [0, -40],
    ].map(([px, py]) => new Phaser.Math.Vector2(px * k, -44 + (py + 44) * k));
  s.fillStyle(0x29adff, 0.3).fillPoints(blade(1.15), true);
  s.fillStyle(0x1c1c28).fillPoints(blade(1.05), true);
  s.fillStyle(0xc2c3c7).fillPoints(blade(1), true);
  s.lineStyle(1, 0xfff1e8).beginPath().moveTo(0, -46).lineTo(18, -50).lineTo(36, -44).lineTo(50, -30).strokePath();
  const scythe = scene.add
    .container(x + f * 15, y - 42, [s])
    .setScale(f, 1)
    .setAngle(-f * 30)
    .setDepth(9.5);
  // The scythe rides with the body as it rises.
  scene.tweens.add({ targets: scythe, y: FLOOR_Y + 2 - 42, duration: 600, ease: 'Quad.Out' });
  return { body, scythe };
}

/**
 * The Nemean Lion's golden ghost, facing right with its body at the container's origin: dark outline, gold body,
 * a jagged orange mane with a lit crest, a red eye, and a glow behind it.
 */
export function nemeanLion(scene: Phaser.Scene, x: number, y: number, f: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const mane = (r: number) =>
    Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      const k = i % 2 ? r * 0.72 : r;
      return new Phaser.Math.Vector2(8 + Math.cos(a) * k, -4 + Math.sin(a) * k);
    });
  g.fillStyle(0xffec27, 0.25).fillEllipse(0, -1, 34, 20);
  // Outline pass, then the fills.
  g.fillStyle(0x4a2a1a).fillEllipse(-1, 0, 24, 12).fillPoints(mane(10), true);
  g.fillRect(-10, 2, 3, 8).fillRect(-5, 2, 3, 8).fillRect(4, 2, 3, 8).fillRect(9, 1, 3, 8);
  g.lineStyle(3, 0x4a2a1a).beginPath().moveTo(-11, -1).lineTo(-16, -5).lineTo(-17, -9).strokePath();
  g.fillStyle(0xd4a017).fillEllipse(-1, 0, 22, 10);
  g.fillRect(-9, 3, 1, 6).fillRect(-4, 3, 1, 6).fillRect(5, 3, 1, 6).fillRect(10, 2, 1, 6);
  g.lineStyle(1, 0xd4a017).beginPath().moveTo(-11, -1).lineTo(-16, -5).lineTo(-17, -9).strokePath();
  g.fillStyle(0xffa300).fillPoints(mane(9), true).fillCircle(-17, -10, 2);
  g.fillStyle(0xffec27).fillRect(-6, -4, 10, 1).fillCircle(6, -10, 2);
  g.fillStyle(0xffccaa).fillCircle(11, -3, 4);
  g.fillStyle(0x4a2a1a).fillRect(13, -1, 3, 1);
  g.fillStyle(0xff004d).fillRect(12, -5, 2, 1);
  return scene.add.container(x, y, [g]).setScale(f, 1).setDepth(12);
}

/** The sun: twelve rays, a red corona, an orange limb, a gold body and a white-hot core, drawn about the container's origin so it can turn and scale there. */
export function sunDisc(scene: Phaser.Scene, x: number, y: number, r: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = i % 2 ? r * 1.7 : r * 2.2;
    g.fillStyle(i % 2 ? 0xffa300 : 0xffec27, 0.85).fillTriangle(
      Math.cos(a - 0.16) * r,
      Math.sin(a - 0.16) * r,
      Math.cos(a + 0.16) * r,
      Math.sin(a + 0.16) * r,
      Math.cos(a) * l,
      Math.sin(a) * l,
    );
  }
  g.fillStyle(0xff004d, 0.35).fillCircle(0, 0, r * 1.35);
  g.fillStyle(0xff8a1f).fillCircle(0, 0, r * 1.1);
  g.lineStyle(1, 0x7e2553).strokeCircle(0, 0, r * 1.1);
  g.fillStyle(0xffec27).fillCircle(0, 0, r * 0.85);
  g.fillStyle(0xfff1e8).fillCircle(0, 0, r * 0.5);
  return scene.add.container(x, y, [g]).setDepth(12);
}

/** A straight beam of sunfire (red glow, orange, gold, white core) that fades. */
export function solarBeam(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number, ms = 260): void {
  const g = scene.add.graphics().setDepth(14);
  for (const [w, c, a] of [
    [8, 0xff004d, 0.35],
    [5, 0xffa300, 0.8],
    [3, 0xffec27, 1],
    [1, 0xfff1e8, 1],
  ] as const)
    g.lineStyle(w, c, a).lineBetween(x1, y1, x2, y2);
  scene.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
}

/** A solar prominence: a curved tongue of fire arching from the sun at (x1, y1) down onto (x2, y2). */
export function prominence(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number): void {
  const [dx, dy] = [x2 - x1, y2 - y1];
  const len = Math.hypot(dx, dy) || 1;
  const bulge = (x2 >= x1 ? -1 : 1) * Phaser.Math.Between(14, 26);
  const pts = Array.from({ length: 11 }, (_, i) => {
    const k = i / 10;
    const o = Math.sin(k * Math.PI) * bulge;
    return new Phaser.Math.Vector2(x1 + dx * k - (dy / len) * o, y1 + dy * k + (dx / len) * o);
  });
  const g = scene.add.graphics().setDepth(14);
  for (const [w, c, a] of [
    [7, 0xff004d, 0.4],
    [4, 0xffa300, 0.85],
    [2, 0xffec27, 1],
    [1, 0xfff1e8, 1],
  ] as const)
    g.lineStyle(w, c, a).strokePoints(pts);
  scene.tweens.add({ targets: g, alpha: 0, delay: 90, duration: 300, onComplete: () => g.destroy() });
}

/** Points of a crescent of radius r bulging toward +x; k is how far the inner curve reaches (0: half disc, 1: none). */
export function crescentPts(r: number, k: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = -Math.PI / 2 + (i / 12) * Math.PI;
    pts.push(new Phaser.Math.Vector2(Math.cos(t) * r, Math.sin(t) * r));
  }
  for (let i = 12; i >= 0; i--) {
    const t = -Math.PI / 2 + (i / 12) * Math.PI;
    pts.push(new Phaser.Math.Vector2(Math.cos(t) * r * k, Math.sin(t) * r * 0.95));
  }
  return pts;
}

/** A blade of moonlight: a crescent with a lunar glow, a dark outline, a pale body and a white edge; turn the container to aim it. */
export function moonCrescent(scene: Phaser.Scene, x: number, y: number, r: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x9fb4ff, 0.3).fillPoints(crescentPts(r * 1.25, 0.2), true);
  g.fillStyle(0x1d2b53).fillPoints(crescentPts(r + 1, 0.4), true);
  g.fillStyle(0xc2d4ff).fillPoints(crescentPts(r, 0.45), true);
  g.fillStyle(0xfff1e8).fillPoints(crescentPts(r * 0.92, 0.75), true);
  return scene.add.container(x, y, [g]).setDepth(13);
}

/**
 * The moon in a phase, drawn into `g` about (0, 0): `lit` 0 is the new moon (a dark disc), 0.5 the half moon, 1 the
 * full moon. The lit part lies between the right limb and the terminator, an ellipse that sweeps from right to left.
 */
export function moonPhase(g: Phaser.GameObjects.Graphics, r: number, lit: number): void {
  const s = 1 - 2 * Phaser.Math.Clamp(lit, 0, 1);
  if (lit >= 1) g.fillStyle(0x9fb4ff, 0.25).fillCircle(0, 0, r * 1.5);
  g.fillStyle(0x1d2b53, 0.9).fillCircle(0, 0, r);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = -Math.PI / 2 + (i / 16) * Math.PI;
    pts.push(new Phaser.Math.Vector2(Math.cos(t) * r, Math.sin(t) * r));
  }
  for (let i = 16; i >= 0; i--) {
    const t = -Math.PI / 2 + (i / 16) * Math.PI;
    pts.push(new Phaser.Math.Vector2(Math.cos(t) * r * s, Math.sin(t) * r));
  }
  if (lit > 0) g.fillStyle(0xe6ecff).fillPoints(pts, true);
  // Seas and craters, only where the light falls.
  for (const [cx, cy, cr] of [
    [0.35, -0.25, 0.22],
    [0.1, 0.35, 0.16],
    [-0.4, 0.1, 0.18],
  ] as const) {
    const [x, y] = [cx * r, cy * r];
    if (lit > 0 && x > s * Math.sqrt(Math.max(0, r * r - y * y))) g.fillStyle(0xc2d4ff).fillCircle(x, y, cr * r);
  }
  g.lineStyle(1, 0x83769c).strokeCircle(0, 0, r);
}

/** Rasenshuriken palettes: Naruto's wind one, and the two halves of Chocho Odama Rasenshuriken. */
const RASEN = {
  // Wind: a blue core of screaming wind in four white blades.
  wind: { edge: 0x1d2b53, blade: 0xfff1e8, hi: 0xc2f0ff, glow: 0x29adff, core: 0x29adff, rim: 0x1d2b53, shine: 0xc2f0ff },
  // Six Paths: a white-gold sage sphere in blades of sage chakra, six black truth-seeking beads ringing the core.
  rikudo: { edge: 0xab5236, blade: 0xfff1e8, hi: 0xffec27, glow: 0xffa300, core: 0xfff1e8, rim: 0xffa300, shine: 0xffec27 },
  // Tailed Beast Ball: a black-violet core with a white rim in blades of dark chakra.
  bijuu: { edge: 0x000000, blade: 0x3b1a5a, hi: 0xc080ff, glow: 0x8a3fd1, core: 0x1d0f2e, rim: 0xfff1e8, shine: 0x8a3fd1 },
} as const;
export type RasenKind = keyof typeof RASEN;

/**
 * A Rasenshuriken with blades `r` px long at (x, y) (spin it with an `angle` tween): a faint disc the blades blur
 * into, four swept blades (dark edge, body, lit edge) and a layered core.
 */
export function rasenshuriken(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r: number,
  kind: RasenKind = 'wind',
): Phaser.GameObjects.Container {
  const c = RASEN[kind];
  const s = r / 20;
  const g = scene.add.graphics();
  g.fillStyle(c.glow, 0.18).fillCircle(0, 0, r);
  g.lineStyle(1, c.hi, 0.5).strokeCircle(0, 0, r * 0.8);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const [cs, sn] = [Math.cos(a), Math.sin(a)];
    // The tip trails behind the spin, like a thrown shuriken's.
    const blade = (w: number, l: number, color: number) =>
      g
        .fillStyle(color)
        .fillTriangle(
          (cs * 4 - sn * w) * s,
          (sn * 4 + cs * w) * s,
          (cs * 4 + sn * w) * s,
          (sn * 4 - cs * w) * s,
          Math.cos(a - 0.3) * l * s,
          Math.sin(a - 0.3) * l * s,
        );
    blade(3.4, 20, c.edge);
    blade(2.4, 18, c.blade);
    blade(0.9, 15, c.hi);
  }
  g.fillStyle(c.glow, 0.4).fillCircle(0, 0, 9 * s);
  g.fillStyle(c.edge).fillCircle(0, 0, 6.5 * s);
  g.fillStyle(c.core).fillCircle(0, 0, 5.5 * s);
  g.lineStyle(Math.max(1, s), c.rim).strokeCircle(0, 0, 5.5 * s);
  g.fillStyle(c.shine).fillCircle(-1.3 * s, -1.3 * s, 2.4 * s);
  if (kind === 'rikudo')
    for (let i = 0; i < 6; i++)
      g.fillStyle(0x000000).fillCircle(Math.cos((i / 6) * Math.PI * 2) * 8 * s, Math.sin((i / 6) * Math.PI * 2) * 8 * s, 1.3 * s);
  if (kind === 'bijuu')
    g.lineStyle(1, 0xfff1e8, 0.8)
      .beginPath()
      .arc(0, 0, 3.5 * s, 0.4, Math.PI * 1.4)
      .strokePath();
  return scene.add.container(x, y, [g]).setDepth(13);
}

/**
 * Naruto's Six Paths Kurama avatar, feet at (x, floorY): nine tails fanned behind (`wag(time)` sways them), an orange
 * body with a black magatama collar, three fox heads and six arms, three per side, reaching out to two grips where
 * the halves of Chocho Odama Rasenshuriken form. Returns the container and the grip points in scene coordinates.
 */
export function kuramaAvatar(
  scene: Phaser.Scene,
  x: number,
  floorY: number,
): { body: Phaser.GameObjects.Container; wag: (time: number) => void; grips: [[number, number], [number, number]] } {
  const ORANGE: readonly (readonly [number, number])[] = [
    [7, 0xab5236],
    [5, 0xffa300],
    [2, 0xffec27],
  ];
  // A thick tapering limb along a curve, in outline, body and highlight.
  const limb = (
    g: Phaser.GameObjects.Graphics,
    x0: number,
    y0: number,
    cx: number,
    cy: number,
    x1: number,
    y1: number,
    taper: number,
    thick = 1,
  ) => {
    const N = 12;
    const pts = Array.from({ length: N + 1 }, (_, k) => bez(x0, y0, cx, cy, x1, y1, k / N));
    for (const [w, c] of ORANGE)
      for (let k = 1; k <= N; k++) g.lineStyle(Math.max(1, w * thick * (1 - (k / N) * taper)), c).lineBetween(...pts[k - 1], ...pts[k]);
  };
  const tails = scene.add.graphics();
  const wag = (time: number) => {
    tails.clear();
    // A fan behind the shoulders, long enough for the tips to flare out past the heads and arms.
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI + 0.3 + (i / 8) * (Math.PI - 0.6) + Math.sin(time / 260 + i) * 0.07;
      const [ex, ey] = [Math.cos(a) * 104, -38 + Math.sin(a) * 98];
      limb(tails, 0, -38, Math.cos(a + 0.45) * 55, -38 + Math.sin(a + 0.45) * 55, ex, ey, 0.55, 1.5);
      tails.fillStyle(0xfff1e8).fillCircle(ex, ey, 2);
    }
  };
  wag(0);
  const g = scene.add.graphics();
  // Legs and body, then the black magatama collar of the Six Paths cloak.
  g.fillStyle(0xab5236).fillRect(-20, -26, 12, 26).fillRect(8, -26, 12, 26);
  g.fillStyle(0xffa300).fillRect(-18, -24, 8, 24).fillRect(10, -24, 8, 24);
  g.fillStyle(0xab5236).fillEllipse(0, -56, 56, 78);
  g.fillStyle(0xffa300).fillEllipse(0, -56, 50, 72);
  g.fillStyle(0xffec27, 0.5).fillEllipse(0, -50, 22, 44);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.15 + (i / 6) * Math.PI * 0.7;
    g.fillStyle(0x000000).fillCircle(Math.cos(a) * 18, -86 + Math.sin(a) * 8, 2);
  }
  // Six arms: shoulders down the flanks, all reaching for the grip on their side.
  const grip: [number, number][] = [
    [-54, -96],
    [54, -96],
  ];
  for (const f of [-1, 1]) {
    const [gx, gy] = grip[f < 0 ? 0 : 1];
    [-80, -64, -48].forEach((sy, i) => {
      const [hx, hy] = [gx - f * 8, gy + (i - 1) * 9];
      limb(g, f * 20, sy, f * (52 + i * 6), sy - 6, hx, hy, 0.3);
      g.fillStyle(0xab5236).fillCircle(hx, hy, 4).fillStyle(0xffec27).fillCircle(hx, hy, 2.5);
    });
  }
  // Three heads: the side ones lower, further out and in shade behind the center one.
  const heads = [-32, 32, 0].map((dx) =>
    scene.add
      .image(dx, dx ? -90 : -102, 'kurama')
      .setScale(dx ? 2 : 3)
      .setFlipX(dx < 0)
      .setTint(dx ? 0xd09060 : 0xffffff),
  );
  const body = scene.add.container(x, floorY, [tails, g, ...heads]).setDepth(9);
  return {
    body,
    wag,
    grips: [
      [x + grip[0][0], floorY + grip[0][1]],
      [x + grip[1][0], floorY + grip[1][1]],
    ],
  };
}

/** The white smoke a shadow clone pops in or out of (`big`: the cloud of a mass summon). */
function poof(scene: Phaser.Scene, x: number, y: number, big = false): void {
  const n = big ? 14 : 6;
  for (let i = 0; i < n; i++) {
    const s = scene.add
      .circle(
        x + Phaser.Math.Between(-5, 5) * (big ? 2 : 1),
        y + Phaser.Math.Between(-4, 4),
        Phaser.Math.Between(2, big ? 6 : 4),
        i % 3 ? 0xfff1e8 : 0xc2c3c7,
        0.9,
      )
      .setDepth(14);
    scene.tweens.add({
      targets: s,
      x: s.x + Phaser.Math.Between(-8, 8) * (big ? 2 : 1),
      y: s.y - Phaser.Math.Between(4, 14),
      scale: 2,
      alpha: 0,
      duration: Phaser.Math.Between(260, 460),
      ease: 'Quad.Out',
      onComplete: () => s.destroy(),
    });
  }
}

/**
 * Sasuke's Complete Body Susanoo, feet at (x, floorY), facing `f`: violet armor (skirt plates, breastplate,
 * pauldrons), a horned helmet with burning yellow eyes and a jagged mouth guard, one arm reaching forward to the bow
 * grip and the other drawn back to the string. `burn(time)` redraws the violet chakra flames licking up its outline.
 * Returns the grip and the drawing hand in scene coordinates.
 */
export function sasukeSusanoo(
  scene: Phaser.Scene,
  x: number,
  floorY: number,
  f: number,
): { body: Phaser.GameObjects.Container; burn: (time: number) => void; grip: [number, number]; hand: [number, number] } {
  const aura = scene.add.graphics();
  const burn = (time: number) => {
    aura.clear();
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * Math.PI * 2;
      const [px, py] = [Math.cos(t) * 46, -66 + Math.sin(t) * 68];
      if (py > -6) continue;
      const h = 10 + ((i * 7) % 5) * 3 + Math.sin(time / 70 + i * 1.3) * 4;
      aura.fillStyle(i % 2 ? 0x8a3fd1 : 0xc080ff, 0.3).fillTriangle(px - 5, py + 4, px + 5, py + 4, px * 1.12, py - h);
    }
  };
  burn(0);
  const g = scene.add.graphics();
  const poly = (color: number, ...xy: number[]) => {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < xy.length; i += 2) pts.push(new Phaser.Math.Vector2(xy[i], xy[i + 1]));
    g.fillStyle(color).fillPoints(pts, true);
  };
  const DARK = 0x1d0f2e;
  const MID = 0x8a3fd1;
  const LIT = 0xc080ff;
  // Skirt of armor plates.
  poly(DARK, -32, 0, 32, 0, 25, -40, -25, -40);
  poly(0x3b1a5a, -28, -2, 28, -2, 22, -37, -22, -37);
  for (const px of [-15, -4, 7, 18]) g.lineStyle(1, MID).lineBetween(px, -35, px * 1.15, -3);
  // The back arm, drawn across the chest to the string.
  const arm = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) => {
    for (const [w, c] of [
      [9, DARK],
      [6, MID],
      [2, LIT],
    ] as const) {
      g.lineStyle(w, c).beginPath().moveTo(x0, y0);
      for (let k = 1; k <= 8; k++) g.lineTo(...bez(x0, y0, cx, cy, x1, y1, k / 8));
      g.strokePath();
    }
    g.fillStyle(DARK).fillCircle(x1, y1, 5).fillStyle(LIT).fillCircle(x1, y1, 3);
  };
  arm(-28, -82, -10, -60, 22, -76);
  // Breastplate: a dark shell, the violet plate, lit pecs and dark rib bands.
  poly(DARK, -30, -38, 30, -38, 34, -88, -34, -88);
  poly(MID, -26, -41, 26, -41, 30, -85, -30, -85);
  g.fillStyle(LIT).fillRect(-22, -82, 18, 3).fillRect(4, -82, 18, 3);
  for (const ry of [-70, -60, -50]) g.fillStyle(0x3b1a5a).fillRect(-20, ry, 40, 2);
  // Pauldrons.
  for (const s of [-1, 1]) {
    g.fillStyle(DARK).fillEllipse(s * 33, -86, 26, 18);
    g.fillStyle(MID).fillEllipse(s * 33, -87, 22, 14);
    g.fillStyle(LIT).fillEllipse(s * 33, -91, 14, 4);
  }
  // The bow arm, reaching forward.
  arm(30, -84, 48, -90, 64, -76);
  // Helmet: horns swept up and back, a crest, burning eyes and a jagged mouth guard.
  for (const s of [-1, 1]) {
    poly(DARK, s * 9, -116, s * 34, -142, s * 4, -120);
    poly(MID, s * 9, -117, s * 30, -138, s * 6, -120);
  }
  poly(DARK, -16, -90, 16, -90, 18, -110, 9, -124, -9, -124, -18, -110);
  poly(MID, -13, -93, 13, -93, 15, -109, 7, -121, -7, -121, -15, -109);
  poly(DARK, -2, -122, 2, -122, 0, -136);
  g.fillStyle(0xffec27).fillRect(-10, -109, 7, 2).fillRect(3, -109, 7, 2);
  g.lineStyle(1, DARK).beginPath().moveTo(-10, -97);
  for (let i = 1; i <= 8; i++) g.lineTo(-10 + i * 2.5, i % 2 ? -99 : -96);
  g.strokePath();
  const body = scene.add.container(x, floorY, [aura, g]).setScale(f, 1).setDepth(9);
  return { body, burn, grip: [x + f * 64, floorY - 76], hand: [x + f * 22, floorY - 76] };
}

/**
 * One spike of Kagutsuchi (Amaterasu shaped into a weapon) along +x from the container's origin, `len` px: a black
 * flame blade with a crimson fringe and a dark-violet core, licks of black fire along its edge. Scale x from 0 to stab.
 */
export function kagutsuchiSpike(scene: Phaser.Scene, x: number, y: number, len: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  // A crimson glow behind it, so the black flame reads against a dark sky or dark hills.
  g.fillStyle(0xff004d, 0.3).fillTriangle(0, -9, 0, 9, len + 6, 0);
  g.fillStyle(0x7e2553).fillTriangle(0, -6, 0, 6, len + 3, 0);
  g.fillStyle(0x000000).fillTriangle(0, -4.5, 0, 4.5, len, 0);
  g.lineStyle(1, 0xff004d).lineBetween(0, -5, len + 2, 0);
  g.fillStyle(0x2a0a2a).fillTriangle(2, -1.5, 2, 1.5, len * 0.7, 0);
  for (let k = 0.2; k < 0.9; k += 0.18) {
    const w = 4 * (1 - k);
    g.fillStyle(0x000000).fillTriangle(len * k - 3, -w, len * k + 3, -w, len * k + 5, -w - 4);
    g.fillStyle(0xff004d, 0.6).fillRect(len * k, w, 2, 1);
  }
  return scene.add.container(x, y, [g]).setDepth(12).setScale(0, 1);
}

/** Redraws the storm of wind needles inside a Rasenshuriken sphere of radius `r` at (x, y). */
function needleStorm(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colors: readonly number[]): void {
  g.clear();
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const r0 = Math.random() * r * 0.8;
    const len = Phaser.Math.Between(5, 12);
    g.lineStyle(1, colors[i % colors.length]).lineBetween(
      x + Math.cos(a) * r0,
      y + Math.sin(a) * r0,
      x + Math.cos(a) * (r0 + len),
      y + Math.sin(a) * (r0 + len),
    );
  }
}

/**
 * Rhongomyniad, the Holy Lance, pointing along +x from the grip at the container's origin, `len` px long: a blue grip
 * with a gold pommel, a gold vamplate seen edge-on with a blue gem, then a long cone of white steel with blue spiral
 * grooves (dark outline, steel body, lit upper half), all inside a golden haze.
 */
export function rhongomyniadLance(scene: Phaser.Scene, x: number, y: number, len: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const v = 10;
  const w = Math.max(5, len * 0.1);
  g.fillStyle(0xffec27, 0.22).fillTriangle(v - 3, -w - 5, v - 3, w + 5, len + 10, 0);
  g.fillStyle(0x1d2b53).fillRect(-2, -2, v + 2, 4);
  g.fillStyle(0x2a4bd7).fillRect(-1, -1, v, 2);
  g.fillStyle(0xffec27).fillRect(-4, -2, 2, 4);
  g.fillStyle(0x1d2b53).fillTriangle(v, -w - 1, v, w + 1, len + 2, 0);
  g.fillStyle(0xc2c3c7).fillTriangle(v + 1, -w, v + 1, w, len, 0);
  g.fillStyle(0xfff1e8).fillTriangle(v + 1, -w, v + 1, 0, len, 0);
  // Spiral grooves winding down the cone.
  g.lineStyle(1, 0x29adff, 0.9);
  for (let k = 0; k < 6; k++) {
    const x0 = v + 3 + (k * (len - v - 6)) / 6;
    const hw = (w * (len - x0)) / (len - v);
    g.lineBetween(x0, -hw, x0 + 5, hw * 0.8);
  }
  g.fillStyle(0x1d2b53).fillEllipse(v, 0, 5, w * 2 + 7);
  g.fillStyle(0xffec27).fillEllipse(v, 0, 3, w * 2 + 5);
  g.fillStyle(0x29adff).fillRect(v - 1, -1, 2, 2);
  return scene.add.container(x, y, [g]).setDepth(12);
}

/**
 * Artoria's Excalibur mode: Strike Air spends the wind barrier and the blade is bare until this time. Bare, every swing
 * throws a wave of golden light and every cut bites deeper (SKILLS.pedang.onSwing / onHit), and the skill key casts
 * KILAU EXCALIBUR instead of Strike Air, which wraps the blade in wind again.
 */
export const excaliburBare = (p: Player) => p.scene.time.now < ((p.getData('excaliburUntil') as number | undefined) ?? 0);

/** How long Excalibur stays bare after Strike Air, ms. */
export const BARE_MS = 8000;

/**
 * KILAU EXCALIBUR (the bare blade's skill): she raises Excalibur and the light along its edge flares; she cuts and a
 * wall of golden light, as tall as she can reach, leaves the blade and sweeps across the arena along the line ahead
 * with the most enemies (aimed now), striking each enemy it passes; light bursts up from the floor under it as it
 * goes, and it breaks in a cross of light at the end. The light spent, Invisible Air winds back around the blade.
 */
function kilauExcalibur({ p, world, scene, power }: SkillCtx): string {
  const f = p.facing;
  const NAME = 'KILAU EXCALIBUR';
  p.lock(380);
  p.setVelocityX(0);
  p.setData('excaliburUntil', 0);
  // The edge flares: a star of light at the raised blade and gold drawn into it.
  glint(scene, p.x + f * 4, p.y - 14);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = scene.add
      .rectangle(p.x + f * 4 + Math.cos(a) * 22, p.y - 14 + Math.sin(a) * 22, 2, 2, i % 2 ? 0xffec27 : 0xfff1e8)
      .setDepth(13);
    scene.tweens.add({ targets: m, x: p.x + f * 4, y: p.y - 14, duration: 180, ease: 'Quad.In', onComplete: () => m.destroy() });
  }
  later(scene, 200, () => {
    const x0 = p.x + f * 10;
    const y0 = p.y - 4;
    const base = f > 0 ? 0 : Math.PI;
    const ahead = world
      .targets(x0, y0)
      .filter(
        (t) => Math.sign(t.x - x0) === f && Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(x0, y0, t.x, t.y) - base)) < 0.6,
      );
    const a = ahead.length ? bestLine(ahead, x0, y0, 26, base) : base;
    scene.cameras.main.shake(200, 0.014);
    ring(scene, x0, y0, 0xffec27, 4, 28, 220, 2);
    // The wall of light: a tall blade-shaped crescent (gold glow, pale body, white edge) travelling along the line.
    const g = scene.add.graphics();
    for (const [w, c, al] of [
      [10, 0xffec27, 0.3],
      [5, 0xfff1e8, 0.6],
      [2, 0xffffff, 1],
    ] as const)
      g.lineStyle(w, c, al).beginPath().arc(-26, 0, 30, -1.05, 1.05).strokePath();
    g.lineStyle(1, 0xffec27).beginPath().arc(-30, 0, 30, -0.9, 0.9).strokePath();
    const wave = scene.add.container(x0, y0, [g]).setRotation(a).setDepth(13).setScale(0.4);
    const RANGE = 300;
    const SPEED = 0.4;
    const hit = new Set<Phaser.GameObjects.Sprite>();
    scene.tweens.add({ targets: wave, scale: 1, duration: 120 });
    scene.tweens.addCounter({
      from: 0,
      to: RANGE,
      duration: RANGE / SPEED,
      onUpdate: (tw) => {
        const d = tw.getValue() ?? 0;
        wave.setPosition(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d);
        for (const t of world.targets(wave.x, wave.y)) {
          if (hit.has(t) || !onLine(x0, y0, a, d, t, 28)) continue;
          hit.add(t);
          world.strike(t, 2.8 * power, 'skill', true, undefined, 260);
          cutMark(scene, t.x, t.y, 0xffec27, 26, a + Math.PI / 2);
          sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 8, 16);
        }
      },
      onComplete: () => {
        // It breaks in a cross of light.
        for (const r of [0, Math.PI / 2]) {
          const c = scene.add
            .rectangle(wave.x, wave.y, 40, 2, 0xfff1e8)
            .setRotation(r + a)
            .setDepth(13);
          scene.tweens.add({ targets: c, scaleX: 1.6, alpha: 0, duration: 260, onComplete: () => c.destroy() });
        }
        ring(scene, wave.x, wave.y, 0xffec27, 4, 26, 260, 2);
        wave.destroy();
      },
    });
    // Light bursts up from the floor under it as it passes.
    for (let d = 40; d < RANGE; d += 40) {
      const cx = x0 + Math.cos(a) * d;
      if (cx < 0 || cx > W) continue;
      later(scene, d / SPEED, () => {
        const col = scene.add.rectangle(cx, FLOOR_Y, 8, 36, 0xffec27, 0.5).setOrigin(0.5, 1).setScale(1, 0).setDepth(12);
        scene.tweens.add({ targets: col, scaleY: 1, duration: 90 });
        scene.tweens.add({ targets: col, scaleX: 0, alpha: 0, delay: 140, duration: 200, onComplete: () => col.destroy() });
      });
    }
    // Invisible Air winds back around the blade.
    later(scene, 250, () => {
      for (let i = 0; i < 10; i++) {
        const a2 = (i / 10) * Math.PI * 2;
        const s = scene.add.rectangle(p.x + Math.cos(a2) * 20, p.y + Math.sin(a2) * 20, 5, 1, i % 2 ? 0xc2f0ff : 0xfff1e8).setDepth(13);
        scene.tweens.add({
          targets: s,
          x: p.x + f * 8,
          y: p.y,
          rotation: a2 + 2,
          alpha: 0.2,
          duration: 220,
          onComplete: () => s.destroy(),
        });
      }
    });
  });
  return NAME;
}

export const SKILLS: Record<WeaponId, WeaponSkills> = {
  pedang: {
    // Mana Burst Jatuh lands in a flare of prana: two blades of Invisible Air skim out along the floor both ways.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      ring(scene, x, gy - 4, 0xc2f0ff, 4, 30, 260, 2);
      for (const f of [-1, 1]) {
        const w = world.shot({
          x: x + f * 8,
          y: gy - 6,
          vx: f * 260,
          vy: 0,
          texture: 'angin',
          mult: 0.6 * power,
          source: 'proc',
          pierce: true,
          knockback: 160,
        }) as Phaser.GameObjects.Image;
        w.setFlipX(f < 0);
        later(scene, 320, () => w.active && w.destroy());
      }
    },
    // Excalibur mode: every swing of the bare blade trails a golden arc and throws a wave of golden light ahead (the
    // finisher a big one). The finisher (the heavy overhead) also drives the wind barrier, or the light, into the
    // ground: a ring of pressure and streaks rip out along the floor both ways.
    onSwing: ({ p, world, scene, power }, m, step) => {
      const f = p.facing;
      const bare = excaliburBare(p);
      if (bare) {
        const big = step === 3;
        const w = world.shot({
          x: p.x + f * 10,
          y: p.y,
          vx: f * 250,
          vy: 0,
          texture: 'slash',
          tint: 0xffec27,
          mult: (big ? 1 : 0.45) * power,
          source: 'proc',
          pierce: true,
          knockback: big ? 200 : 100,
        }) as Phaser.GameObjects.Image;
        w.setScale(big ? 1.8 : 1).setFlipX(f < 0);
        later(scene, big ? 520 : 300, () => w.active && w.destroy());
      }
      if (bare && m.anim !== 'thrust') {
        const g = scene.add.graphics().setDepth(12);
        const [a0, a1] = f > 0 ? [-1.3, 0.9] : [Math.PI - 0.9, Math.PI + 1.3];
        for (const [w, c, al] of [
          [5, 0xffec27, 0.3],
          [2, 0xffec27, 0.9],
          [1, 0xfff1e8, 1],
        ] as const)
          g.lineStyle(w, c, al).beginPath().arc(p.x, p.y, 18, a0, a1).strokePath();
        scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
      }
      if (step !== 3) return;
      later(scene, m.ms * 0.6, () => {
        const gx = p.x + f * 20;
        const gy = p.y + 7;
        const tint = bare ? 0xffec27 : 0xc2f0ff;
        ring(scene, gx, gy - 2, tint, 3, 26, 240, 2);
        rocks(scene, gx, gy, 5);
        for (const d of [-1, 1])
          for (let i = 0; i < 3; i++) {
            const s = scene.add.rectangle(gx, gy - 1 - i * 3, 8 - i * 2, 1, i % 2 ? 0xfff1e8 : tint).setDepth(12);
            scene.tweens.add({ targets: s, x: gx + d * (30 + i * 8), scaleX: 2, alpha: 0, duration: 260, onComplete: () => s.destroy() });
          }
      });
    },
    // The bared blade bites deeper: each cut flashes gold and burns a little extra light into the wound.
    onHit: ({ p, world, scene, power }, t) => {
      if (!excaliburBare(p)) return;
      cutMark(scene, t.x, t.y, 0xffec27, 18, Math.random() * Math.PI);
      sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 5, 12);
      world.strike(t, 0.35 * power, 'proc', false, undefined, 0);
    },
    // Strike Air (Fuuou Tekkai, the Hammer of the Wind King): she draws the sword back and the barrier of Invisible
    // Air is wound into the blade, streaks of wind spiralling in. Then she lets all of it go at once: aimed now, along
    // the line ahead with the most enemies (flyers too), a hammer of compressed air: five pressure fronts burst out
    // of the blade one after another, widening as they travel, tearing dust off the floor where they skim it. Each
    // enemy is struck as the fronts reach it, hurled away and left reeling (slow). The wind is spent: Excalibur shines
    // bare for 8 s (Excalibur mode, see excaliburBare), and while it does the skill is KILAU EXCALIBUR instead.
    skill: (c) => {
      if (excaliburBare(c.p)) return kilauExcalibur(c);
      const { p, world, scene, power } = c;
      const f = p.facing;
      p.lock(420);
      p.setVelocityX(0);
      const bx = p.x + f * 10;
      const by = p.y - 2;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const s = scene.add
          .rectangle(bx + Math.cos(a) * 26, by + Math.sin(a) * 26, 6, 1, i % 2 ? 0xfff1e8 : 0xc2f0ff)
          .setRotation(a + 1.2)
          .setDepth(13);
        scene.tweens.add({
          targets: s,
          x: bx,
          y: by,
          rotation: a + 2.6,
          alpha: 0.2,
          duration: 200,
          ease: 'Quad.In',
          onComplete: () => s.destroy(),
        });
      }
      later(scene, 160, () => glint(scene, p.x + f * 10, p.y - 2));
      later(scene, 220, () => {
        const x0 = p.x + f * 10;
        const y0 = p.y - 2;
        const base = f > 0 ? 0 : Math.PI;
        const ahead = world
          .targets(x0, y0)
          .filter(
            (t) => Math.sign(t.x - x0) === f && Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(x0, y0, t.x, t.y) - base)) < 0.75,
          );
        const a = ahead.length ? bestLine(ahead, x0, y0, 22, base) : base;
        p.setData('excaliburUntil', scene.time.now + BARE_MS);
        ring(scene, x0, y0, 0xfff1e8, 4, 30, 220, 3);
        ring(scene, x0, y0, 0x29adff, 2, 20, 180);
        sparks(scene, x0, y0, [0xffec27, 0xfff1e8], 8, 18);
        scene.cameras.main.shake(220, 0.014);
        const RANGE = 250;
        const SPEED = 0.52;
        const SPREAD = 0.38;
        for (let k = 0; k < 5; k++)
          later(scene, k * 45, () => {
            const g = scene.add.graphics();
            const front = scene.add.container(x0, y0, [g]).setRotation(a).setDepth(13);
            scene.tweens.addCounter({
              from: 8,
              to: RANGE,
              duration: RANGE / SPEED,
              onUpdate: (tw) => {
                const r = tw.getValue() ?? 0;
                const fade = 1 - r / RANGE;
                g.clear();
                g.lineStyle(7 - k, 0xc2f0ff, 0.3 * fade)
                  .beginPath()
                  .arc(0, 0, r, -SPREAD, SPREAD)
                  .strokePath();
                g.lineStyle(2, 0x29adff, 0.6 * fade)
                  .beginPath()
                  .arc(0, 0, r - 2, -SPREAD, SPREAD)
                  .strokePath();
                g.lineStyle(1, 0xfff1e8, 0.95 * fade)
                  .beginPath()
                  .arc(0, 0, r, -SPREAD, SPREAD)
                  .strokePath();
              },
              onComplete: () => front.destroy(),
            });
          });
        // Dust ripped off the floor wherever the hammer skims it.
        for (let d = 30; d < RANGE; d += 30) {
          const [x, y] = [x0 + Math.cos(a) * d, y0 + Math.sin(a) * d];
          if (y > FLOOR_Y - 34 && x > 0 && x < W) later(scene, d / SPEED, () => rocks(scene, x, FLOOR_Y, 3));
        }
        for (const t of world.targets(x0, y0)) {
          const d = Phaser.Math.Distance.Between(x0, y0, t.x, t.y);
          const off = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(x0, y0, t.x, t.y) - a));
          if (d > RANGE + 10 || Math.cos(off) <= 0 || (off > SPREAD + 0.05 && d * Math.sin(off) > 14)) continue;
          later(scene, d / SPEED, () => {
            if (!t.active) return;
            world.strike(t, 2.6 * power, 'skill', false, { slow: 1500 }, 320);
            ring(scene, t.x, t.y, 0xc2f0ff, 2, 14, 180, 2);
            sparks(scene, t.x, t.y, [0xc2f0ff, 0xfff1e8], 6, 14);
          });
        }
      });
    },
    // Rhongomyniad, the Spear that Shines at the End of the World: the Holy Lance whose true form is the Tower of
    // Light that pins the world in place. A storm gathers and the sky darkens; the lance comes down in a column of
    // light into her raised hand, rings of wind coiling up it and motes of light spiralling in. She levels it along
    // the line through the most enemies (aimed now) and thrusts: the lance's light pours out as a gigantic spiral of
    // light, a drill of wind and radiance that grinds everything in its line again and again and drags whatever is
    // near into it. Then the Tower answers: a pillar of light falls from the sky onto every enemy it pierced.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const cam = scene.cameras.main;
      p.invuln(2100);
      p.lock(1800);
      p.setVelocity(0, 0);
      const storm = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x0b1a33, 0.55)
        .setOrigin(0)
        .setDepth(2)
        .setAlpha(0);
      scene.tweens.add({ targets: storm, alpha: 1, duration: 300 });
      // 1. The lance descends point-up into her raised hand in a column of light.
      const LEN = 64;
      const hx = p.x - f * 3;
      const hy = p.y - 6;
      const column = scene.add
        .rectangle(hx, hy, 12, hy + 10, 0xffec27, 0.3)
        .setOrigin(0.5, 1)
        .setScale(1, 0)
        .setDepth(11);
      scene.tweens.add({ targets: column, scaleY: 1, duration: 200, ease: 'Quad.Out' });
      scene.tweens.add({ targets: column, alpha: 0, scaleX: 0.2, delay: 500, duration: 250, onComplete: () => column.destroy() });
      const lance = rhongomyniadLance(scene, hx, hy - 40, LEN)
        .setRotation(-Math.PI / 2)
        .setAlpha(0);
      scene.tweens.add({ targets: lance, y: hy, alpha: 1, duration: 450, ease: 'Quad.Out' });
      for (let k = 0; k < 10; k++)
        later(scene, 150 + k * 55, () => {
          const r = scene.add
            .ellipse(hx, hy - 12 - (k % 5) * 10, 20, 5)
            .setStrokeStyle(1, k % 2 ? 0xfff1e8 : 0x29adff, 0.9)
            .setDepth(13)
            .setScale(0.2, 1);
          scene.tweens.add({ targets: r, scaleX: 1.5, y: r.y - 12, alpha: 0, duration: 300, onComplete: () => r.destroy() });
        });
      for (let i = 0; i < 24; i++)
        later(scene, i * 22, () => {
          const a = Math.random() * Math.PI * 2;
          const d = Phaser.Math.Between(50, 90);
          const m = scene.add.rectangle(hx + Math.cos(a) * d, hy - 30 + Math.sin(a) * d, 2, 2, i % 3 ? 0xffec27 : 0xfff1e8).setDepth(13);
          scene.tweens.add({ targets: m, x: hx, y: hy - 30, duration: 280, ease: 'Quad.In', onComplete: () => m.destroy() });
        });
      // 2. Leveled at the busiest line, picked now.
      let ox = p.x;
      let oy = p.y - 4;
      let a = f > 0 ? 0 : Math.PI;
      later(scene, 700, () => {
        ox = p.x;
        oy = p.y - 4;
        a = bestLine(world.targets(ox, oy), ox, oy, 20, a);
        p.facing = Math.cos(a) >= 0 ? 1 : -1;
        const to = -Math.PI / 2 + Phaser.Math.Angle.Wrap(a + Math.PI / 2);
        scene.tweens.add({
          targets: lance,
          x: ox - Math.cos(a) * 14,
          y: oy - Math.sin(a) * 14,
          rotation: to,
          duration: 200,
          ease: 'Back.Out',
        });
        cam.flash(200, 255, 241, 232);
      });
      // 3. The thrust: the spiral of light.
      const struck = new Set<Phaser.GameObjects.Sprite>();
      later(scene, 950, () => {
        scene.tweens.add({ targets: lance, x: ox + Math.cos(a) * 4, y: oy + Math.sin(a) * 4, duration: 80, yoyo: true, hold: 700 });
        cam.shake(900, 0.012);
        const L = 420;
        const sx = ox + Math.cos(a) * (LEN - 14);
        const sy = oy + Math.sin(a) * (LEN - 14);
        const g = scene.add.graphics();
        const beam = scene.add.container(sx, sy, [g]).setRotation(a).setDepth(13);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 900,
          onUpdate: (tw) => {
            const t = tw.getValue() ?? 0;
            const len = L * Math.min(1, t * 5);
            const fade = t > 0.75 ? (1 - t) / 0.25 : 1;
            const now = scene.time.now;
            g.clear();
            g.fillStyle(0xffec27, 0.2 * fade).fillPoints(
              [
                new Phaser.Math.Vector2(0, -6),
                new Phaser.Math.Vector2(Math.min(len, 40), -22),
                new Phaser.Math.Vector2(len, -9),
                new Phaser.Math.Vector2(len, 9),
                new Phaser.Math.Vector2(Math.min(len, 40), 22),
                new Phaser.Math.Vector2(0, 6),
              ],
              true,
            );
            g.fillStyle(0xfff1e8, 0.55 * fade).fillPoints(
              [
                new Phaser.Math.Vector2(0, -3),
                new Phaser.Math.Vector2(Math.min(len, 40), -12),
                new Phaser.Math.Vector2(len, -4),
                new Phaser.Math.Vector2(len, 4),
                new Phaser.Math.Vector2(Math.min(len, 40), 12),
                new Phaser.Math.Vector2(0, 3),
              ],
              true,
            );
            g.fillStyle(0xffffff, fade).fillRect(0, -2, len, 4);
            // The spiral: two strands winding down the beam, and rings of wind riding outward along it.
            for (const [ph, col] of [
              [0, 0x29adff],
              [Math.PI, 0xffec27],
            ] as const) {
              g.lineStyle(2, col, 0.9 * fade).beginPath();
              for (let x = 0; x <= len; x += 4) {
                const y = Math.sin(x / 12 - now / 35 + ph) * 16 * (1 - (x / L) * 0.55) * Math.min(1, 0.3 + x / 50);
                if (x) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.strokePath();
            }
            for (let x = (now / 4) % 40; x < len; x += 40)
              g.lineStyle(1, 0xc2f0ff, 0.8 * fade).strokeEllipse(x, 0, 5, 34 * (1 - (x / L) * 0.55) * Math.min(1, 0.3 + x / 50));
          },
          onComplete: () => beam.destroy(),
        });
        for (let i = 0; i < 6; i++)
          later(scene, 80 + i * 120, () => {
            for (const d of [50, 130, 210, 290]) world.pull(ox + Math.cos(a) * d, oy + Math.sin(a) * d, 32, 160);
            for (const t of world.targets(ox, oy))
              if (onLine(ox, oy, a, L, t, 22)) {
                struck.add(t);
                world.strike(t, 0.55 * power, 'skill', false, undefined, 0);
                sparks(scene, t.x, t.y, [0xfff1e8, 0xffec27, 0x29adff], 4, 12);
              }
          });
      });
      // 4. The Tower of Light: a pillar falls from the sky onto each enemy the spiral pierced.
      later(scene, 1750, () => {
        scene.tweens.add({ targets: lance, alpha: 0, scale: 1.3, duration: 300, onComplete: () => lance.destroy() });
        scene.tweens.add({ targets: storm, alpha: 0, delay: 300, duration: 400, onComplete: () => storm.destroy() });
        [...struck]
          .filter((t) => t.active)
          .slice(0, 8)
          .forEach((t, i) =>
            later(scene, i * 70, () => {
              if (!t.active) return;
              const tower = [
                scene.add.rectangle(t.x, 0, 16, t.y + 8, 0xffec27, 0.45),
                scene.add.rectangle(t.x, 0, 4, t.y + 8, 0xfff1e8),
              ].map((r) => r.setOrigin(0.5, 0).setScale(1, 0).setDepth(13));
              scene.tweens.add({ targets: tower, scaleY: 1, duration: 90, ease: 'Quad.In' });
              scene.tweens.add({
                targets: tower,
                scaleX: 0,
                alpha: 0,
                delay: 200,
                duration: 250,
                onComplete: () => tower.forEach((r) => r.destroy()),
              });
              later(scene, 90, () => {
                if (!t.active) return;
                ring(scene, t.x, t.y, 0xffec27, 4, 24, 260, 2);
                sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 8, 18);
                cam.shake(120, 0.012);
                world.strike(t, 1.2 * power, 'skill', true);
              });
            }),
          );
      });
    },
    // Excalibur, the Sword of Promised Victory, set free: night falls and the thirteen seals that bind the sword
    // appear in an arc behind her, golden rune-rings lighting one by one as the Round Table gives its assent ("SEAL
    // THIRTEEN, DECISION START"), then fly into the blade. The last of the wind barrier tears away, a pillar of light
    // climbs from the raised sword into the sky and light gathers to it from the whole field ("EX..."). She brings it
    // down: a colossal beam sweeps from high in the sky to the ground ahead and strikes each enemy as it crosses it,
    // a column of light bursting up under each one, the beam pulsing twice more ("...CALIBUR!"). Climax: the light
    // breaks over the whole field, a wall of gold rises from the horizon and every enemy anywhere is struck once more.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.invuln(3400);
      p.lock(3000);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      const dusk = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x05051a, 0.65)
        .setOrigin(0)
        .setDepth(2)
        .setAlpha(0);
      scene.tweens.add({ targets: dusk, alpha: 1, duration: 300 });
      const tipX = p.x + f * 3;
      const tipY = p.y - 16;
      // 1. The thirteen seals light one by one in an arc over her.
      const seals: Phaser.GameObjects.Container[] = [];
      for (let i = 0; i < 13; i++)
        later(scene, 100 + i * 60, () => {
          const a = Math.PI + (i / 12) * Math.PI;
          const [sx, sy] = [p.x + Math.cos(a) * 42, p.y - 8 + Math.sin(a) * 34];
          const g = scene.add.graphics();
          g.fillStyle(0xffec27, 0.25).fillCircle(0, 0, 6);
          g.lineStyle(1, 0xffec27).strokeCircle(0, 0, 4);
          g.fillStyle(0xfff1e8).fillRect(-0.5, -3, 1, 6).fillRect(-3, -0.5, 6, 1);
          const c = scene.add.container(sx, sy, [g]).setDepth(13).setScale(0);
          scene.tweens.add({ targets: c, scale: 1, duration: 120, ease: 'Back.Out' });
          ring(scene, sx, sy, 0xffec27, 2, 10, 200);
          seals.push(c);
        });
      later(scene, 950, () => {
        floatText(scene, W / 2, 30, 'SEGEL DILEPAS', '#ffec27');
        seals.forEach((c, i) =>
          scene.tweens.add({
            targets: c,
            x: tipX,
            y: tipY,
            scale: 0.4,
            delay: i * 15,
            duration: 220,
            ease: 'Quad.In',
            onComplete: () => c.destroy(),
          }),
        );
      });
      // 2. The wind tears away, the pillar climbs, the light of the field gathers.
      let pillar: Phaser.GameObjects.Rectangle[] = [];
      later(scene, 1150, () => {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const w = scene.add
            .rectangle(tipX, tipY + 8, 5, 1, 0xc2f0ff)
            .setRotation(a)
            .setDepth(13);
          scene.tweens.add({
            targets: w,
            x: tipX + Math.cos(a) * 40,
            y: tipY + 8 + Math.sin(a) * 40,
            alpha: 0,
            duration: 400,
            onComplete: () => w.destroy(),
          });
        }
        pillar = [
          scene.add.rectangle(tipX, tipY, 14, tipY + 10, 0xffec27, 0.35),
          scene.add.rectangle(tipX, tipY, 4, tipY + 10, 0xfff1e8),
        ].map((r) => r.setOrigin(0.5, 1).setScale(1, 0).setDepth(13));
        scene.tweens.add({ targets: pillar, scaleY: 1, duration: 400, ease: 'Quad.Out' });
        floatText(scene, W / 2, 40, 'EX...', '#ffec27');
        for (let i = 0; i < 40; i++)
          later(scene, i * 12, () => {
            const mote = scene.add
              .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(10, FLOOR_Y), 2, 2, i % 3 ? 0xffec27 : 0xfff1e8)
              .setDepth(13);
            scene.tweens.add({ targets: mote, x: tipX, y: tipY, duration: 380, ease: 'Quad.In', onComplete: () => mote.destroy() });
          });
      });
      // 3. The swing: the beam sweeps from the sky to the ground ahead, striking each enemy as it crosses it.
      const x0 = p.x + f * 8;
      const y0 = p.y - 4;
      const base = f > 0 ? 0 : Math.PI;
      const FROM = -1.25;
      const TO = 0.35;
      const offOf = (t: Phaser.GameObjects.Sprite) => Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(x0, y0, t.x, t.y) - base) * f;
      const inFront = (t: Phaser.GameObjects.Sprite) =>
        (Math.sign(t.x - x0) === f && offOf(t) >= FROM - 0.15 && offOf(t) <= TO + 0.1) ||
        (Math.abs(t.x - x0) < 30 && Math.abs(t.y - y0) < 24);
      const hit = new Set<Phaser.GameObjects.Sprite>();
      const smite = (t: Phaser.GameObjects.Sprite) => {
        hit.add(t);
        world.strike(t, 3.5 * power, 'ult', true);
        sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 8, 18);
        const col = scene.add.rectangle(t.x, FLOOR_Y, 12, FLOOR_Y, 0xffec27, 0.6).setOrigin(0.5, 1).setScale(1, 0).setDepth(12);
        scene.tweens.add({ targets: col, scaleY: 1, duration: 110 });
        scene.tweens.add({ targets: col, scaleX: 0, alpha: 0, delay: 220, duration: 250, onComplete: () => col.destroy() });
      };
      later(scene, 1750, () => {
        pillar.forEach((r) => r.destroy());
        floatText(scene, W / 2, 52, 'CALIBUR!', '#ffec27');
        cam.flash(300, 255, 236, 39);
        cam.shake(900, 0.025);
        const len = 420;
        const beam = (
          [
            [84, 0xffec27, 0.3],
            [54, 0xffec27, 0.65],
            [28, 0xfff1e8, 0.9],
            [8, 0xffffff, 1],
          ] as const
        ).map(([h, c, al]) => scene.add.rectangle(x0, y0, len, h, c, al).setOrigin(0, 0.5).setDepth(13));
        // A sun of light at the blade, where the beam leaves it.
        const core = [
          scene.add.circle(x0, y0, 30, 0xffec27, 0.35),
          scene.add.circle(x0, y0, 16, 0xfff1e8, 0.9),
          scene.add.circle(x0, y0, 7, 0xffffff),
        ].map((c) => c.setDepth(13));
        scene.tweens.add({
          targets: core,
          scale: 0,
          alpha: 0,
          delay: 950,
          duration: 300,
          onComplete: () => core.forEach((c) => c.destroy()),
        });
        scene.tweens.addCounter({
          from: FROM,
          to: TO,
          duration: 500,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const cur = tw.getValue() ?? 0;
            beam.forEach((b) => b.setRotation(base + f * cur));
            for (const t of world.targets(x0, y0)) if (!hit.has(t) && inFront(t) && offOf(t) <= cur + 0.08) smite(t);
          },
          onComplete: () => {
            for (const t of world.targets(x0, y0)) if (!hit.has(t) && inFront(t)) smite(t);
            // Where the beam meets the ground, light bursts up all along it.
            for (let i = 0; i < 8; i++)
              later(scene, i * 45, () => {
                const cx = x0 + f * (30 + i * 40);
                if (cx < 0 || cx > W) return;
                const col = scene.add.rectangle(cx, FLOOR_Y, 10, FLOOR_Y, 0xffec27, 0.5).setOrigin(0.5, 1).setScale(1, 0).setDepth(12);
                scene.tweens.add({ targets: col, scaleY: 1, duration: 120 });
                scene.tweens.add({ targets: col, scaleX: 0, alpha: 0, delay: 200, duration: 250, onComplete: () => col.destroy() });
                sparks(scene, cx, FLOOR_Y - 4, [0xffec27, 0xfff1e8], 6, 20);
              });
          },
        });
        for (const k of [1, 2])
          later(scene, 500 + k * 170, () => {
            for (const t of hit) if (t.active) world.strike(t, 0.8 * power, 'ult', false);
          });
        scene.tweens.add({
          targets: beam,
          scaleY: 0,
          alpha: 0,
          delay: 950,
          duration: 300,
          onComplete: () => beam.forEach((b) => b.destroy()),
        });
      });
      // 4. Climax: the light breaks over the whole field.
      later(scene, 2700, () => {
        const wall = [scene.add.rectangle(0, FLOOR_Y, W, FLOOR_Y, 0xffec27, 0.45), scene.add.rectangle(0, FLOOR_Y, W, 6, 0xfff1e8)].map(
          (r) => r.setOrigin(0, 1).setScale(1, 0).setDepth(12),
        );
        scene.tweens.add({ targets: wall[0], scaleY: 1, duration: 180, ease: 'Quad.Out' });
        scene.tweens.add({ targets: wall[1], scaleY: 1, y: 0, duration: 180, ease: 'Quad.Out' });
        scene.tweens.add({ targets: wall, alpha: 0, delay: 200, duration: 400, onComplete: () => wall.forEach((r) => r.destroy()) });
        cam.flash(250, 255, 255, 255);
        cam.shake(400, 0.03);
        floatText(scene, W / 2, 60, 'JANJI KEMENANGAN!', '#ffec27');
        for (const t of world.targets(p.x, p.y)) {
          world.strike(t, 1.5 * power, 'ult', false);
          sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 6, 14);
        }
        scene.tweens.add({ targets: dusk, alpha: 0, delay: 300, duration: 500, onComplete: () => dusk.destroy() });
      });
    },
  },

  belati: {
    // Jatuh Azrael: where he lands, a row of azure grave-fire bursts out of the ground and black feathers fall.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      for (let i = -2; i <= 2; i++) later(scene, Math.abs(i) * 50, () => flameTongue(scene, x + i * 12, gy, 26 - Math.abs(i) * 4, 420));
      feathers(scene, x, gy - 30, 5, 20, 24);
      world.area(x, gy - 8, 34, 0.6 * power, 120, 'proc', { burn: 0.15 });
    },
    // PENGGAL, the finisher: an azure crescent of grave-fire trails the stroke and black feathers fall where it passed.
    onSwing: ({ p, scene }, _m, step) => {
      if (step !== 2) return;
      const f = p.facing;
      later(scene, 60, () => {
        const g = scene.add.graphics().setDepth(12);
        g.lineStyle(5, 0x29adff, 0.35)
          .beginPath()
          .arc(p.x - f * 10, p.y, 26, f > 0 ? -0.9 : Math.PI - 0.9, f > 0 ? 0.9 : Math.PI + 0.9)
          .strokePath();
        g.lineStyle(1, 0xc2f0ff)
          .beginPath()
          .arc(p.x - f * 10, p.y, 26, f > 0 ? -0.9 : Math.PI - 0.9, f > 0 ? 0.9 : Math.PI + 0.9)
          .strokePath();
        scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
        feathers(scene, p.x - f * 20, p.y - 6, 4, 14, 14);
      });
    },
    // ...and a life nearly spent (non-boss, under 30% HP) is taken outright.
    onHit: ({ p, world, scene }, t) => {
      if (p.comboStep !== 2 || !doomed(t)) return;
      flameTongue(scene, t.x, t.y + 8, 22, 400);
      floatText(scene, t.x, t.y - 24, 'PENGGAL!', '#7fe6ff');
      world.strike(t, 99, 'proc', true, undefined, 0);
    },
    // Evening Bell: "the bell of twilight has tolled your name." A bronze bell appears over the nearest enemy (in the
    // air or on the ground) and follows it, tolling three times: each toll is a ring of sound closing on it and a
    // tongue of azure flame catching on it, while black feathers, the omen of death, drift down around it. Then
    // Azrael itself falls from the sky point first, trailing blue fire, and is driven through the condemned: the
    // weak (under 30%) are executed, grave-fire bursts up around the blade and anyone beside it is burned too.
    skill: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      p.facing = t.x >= p.x ? 1 : -1;
      p.lock(250);
      p.setVelocityX(0);
      const above = () => Math.max(4, t.y - 46);
      const bell = eveningBell(scene, t.x, above()).setAlpha(0);
      scene.tweens.add({ targets: bell, alpha: 1, duration: 120 });
      scene.tweens.add({ targets: bell, angle: { from: -30, to: 30 }, duration: 180, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
      scene.tweens.addCounter({ from: 0, to: 1, duration: 560, onUpdate: () => t.active && bell.setPosition(t.x, above()) });
      floatText(scene, t.x, above() - 6, 'DONG', '#c2c3c7');
      feathers(scene, t.x, above() + 10, 10, 20, 50);
      for (let i = 0; i < 3; i++)
        later(scene, i * 180, () => {
          if (!t.active) return;
          ring(scene, t.x, t.y, 0xc2c3c7, 34, 4, 260);
          flameTongue(scene, t.x + Phaser.Math.Between(-3, 3), t.y + 6, 6 + i * 4);
        });
      later(scene, 560, () => {
        scene.tweens.add({ targets: bell, alpha: 0, y: bell.y - 8, duration: 200, onComplete: () => bell.destroy() });
        if (!t.active) return;
        // Aim where the condemned is now; the blade's tip lands on it (the hilt is the container's origin).
        const [tx, ty] = [t.x, t.y];
        const LEN = 40;
        const blade = azraelBlade(scene, tx, ty - LEN - 90, LEN).setAngle(180);
        const trail = [scene.add.rectangle(tx, ty, 12, 96, 0x29adff, 0.35), scene.add.rectangle(tx, ty, 2, 96, 0xc2f0ff)].map((r) =>
          r.setOrigin(0.5, 1).setScale(1, 0).setDepth(12),
        );
        scene.tweens.add({ targets: trail, scaleY: 1, duration: 120, ease: 'Quad.In' });
        scene.tweens.add({
          targets: trail,
          scaleX: 0,
          alpha: 0,
          delay: 140,
          duration: 250,
          onComplete: () => trail.forEach((r) => r.destroy()),
        });
        scene.tweens.add({
          targets: blade,
          y: ty - LEN + 6,
          duration: 120,
          ease: 'Quad.In',
          onComplete: () => {
            scene.tweens.add({ targets: blade, alpha: 0, scaleX: 0.3, delay: 260, duration: 220, onComplete: () => blade.destroy() });
            cutMark(scene, tx, ty, 0x29adff, 40, Math.PI / 2);
            ring(scene, tx, ty, 0x29adff, 4, 30, 300, 2);
            sparks(scene, tx, ty, [0x29adff, 0x7fe6ff, 0xfff1e8], 12, 30);
            feathers(scene, tx, ty - 6, 8, 12, 30);
            // Grave-fire bursts up around the blade, tallest at the centre; on the floor it scorches the ground.
            const base = ty > FLOOR_Y - 24 ? FLOOR_Y : ty + 8;
            for (let i = 0; i < 7; i++)
              later(scene, Math.abs(i - 3) * 35, () => flameTongue(scene, tx + (i - 3) * 6, base, 22 - Math.abs(i - 3) * 5, 500));
            if (base === FLOOR_Y) rocks(scene, tx, FLOOR_Y - 2, 6);
            scene.cameras.main.shake(140, 0.014);
            if (t.active) world.strike(t, (doomed(t) ? 50 : 3) * power, 'skill', true, { burn: 0.3 });
            for (const o of world.targets(tx, ty))
              if (o !== t && Phaser.Math.Distance.Between(o.x, o.y, tx, ty) < 28)
                world.strike(o, 0.8 * power, 'skill', false, { burn: 0.3 });
          },
        });
      });
    },
    // Azure Flame of the Grave: he raises Azrael overhead and the blue fire of the angel of death climbs the blade
    // from guard to tip; then he cleaves the air toward the side with more enemies and the fire leaves the sword as a
    // crescent as tall as the arena. It rolls across the field (catching flyers too), scorching the floor with
    // grave-fire and shedding feathers, and burns everything it passes through.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.lock(650);
      p.setVelocityX(0);
      // Held high over his head, the hilt above the horns.
      const blade = azraelBlade(scene, p.x, p.y - 14, 34)
        .setScale(0.5)
        .setAlpha(0);
      scene.tweens.add({ targets: blade, scale: 1, alpha: 1, duration: 150, ease: 'Back.Out' });
      for (let i = 0; i < 9; i++)
        later(scene, 60 + i * 40, () => {
          for (const side of [-1, 1]) flameTongue(scene, blade.x + side * 5, blade.y - 2 - i * 4, 7, 280);
          if (i % 3 === 0) flameTongue(scene, p.x + Phaser.Math.Between(-10, 10), FLOOR_Y, 6, 350);
        });
      later(scene, 440, () => {
        const ts = world.targets(p.x, p.y);
        const ahead = ts.filter((t) => Math.sign(t.x - p.x) === p.facing).length;
        const f = ahead * 2 >= ts.length ? p.facing : -p.facing;
        p.facing = f;
        scene.tweens.add({
          targets: blade,
          angle: f * 125,
          duration: 110,
          ease: 'Quad.In',
          onComplete: () => scene.tweens.add({ targets: blade, alpha: 0, delay: 120, duration: 200, onComplete: () => blade.destroy() }),
        });
        // The crescent: two half-ellipses sharing their tips, thickest in the middle; rim, body, pale edge, white core.
        const TOP = 12;
        const R = (FLOOR_Y - TOP) / 2;
        const g = scene.add.graphics();
        for (const [a1, a2, c, al] of [
          [26, 4, 0x2a4bd7, 0.45],
          [21, 9, 0x29adff, 1],
          [16, 11, 0xc2f0ff, 1],
          [14, 12, 0xffffff, 1],
        ] as const) {
          const pts: Phaser.Math.Vector2[] = [];
          for (let i = 0; i <= 16; i++) {
            const th = -Math.PI / 2 + (i / 16) * Math.PI;
            pts.push(new Phaser.Math.Vector2(a1 * Math.cos(th), R * Math.sin(th)));
          }
          for (let i = 16; i >= 0; i--) {
            const th = -Math.PI / 2 + (i / 16) * Math.PI;
            pts.push(new Phaser.Math.Vector2(a2 * Math.cos(th), R * Math.sin(th)));
          }
          g.fillStyle(c, al).fillPoints(pts, true);
        }
        const wave = scene.add
          .container(p.x + f * 10, TOP + R, [g])
          .setScale(f, 0.1)
          .setDepth(13);
        scene.tweens.add({ targets: wave, scaleY: 1, duration: 120, ease: 'Back.Out' });
        scene.cameras.main.shake(160, 0.012);
        rocks(scene, p.x + f * 10, FLOOR_Y - 2, 5);
        const hit = new Set<Phaser.GameObjects.GameObject>();
        let k = 0;
        const ev = scene.time.addEvent({
          delay: 30,
          loop: true,
          callback: () => {
            wave.x += f * 9;
            k++;
            if (wave.x < -40 || wave.x > W + 40) {
              ev.remove();
              scene.tweens.add({ targets: wave, alpha: 0, duration: 120, onComplete: () => wave.destroy() });
              return;
            }
            // Fire licks off its back edge, the floor it rolls over catches, and feathers are shed in its wake.
            flameTongue(scene, wave.x - f * 6, TOP + R + R * Phaser.Math.FloatBetween(-0.9, 0.9), 8, 260);
            if (k % 2) flameTongue(scene, wave.x - f * 4, FLOOR_Y, Phaser.Math.Between(8, 14), 500);
            if (k % 4 === 0) feathers(scene, wave.x, Phaser.Math.Between(TOP + 20, FLOOR_Y - 30), 1, 4, 30);
            for (const t of world.targets(wave.x, FLOOR_Y)) {
              if (hit.has(t) || Math.abs(t.x - wave.x) > 16) continue;
              hit.add(t);
              world.strike(t, 2.6 * power, 'skill', true, { burn: 0.4 });
              cutMark(scene, t.x, t.y, 0x29adff, 30, Math.PI / 2 + f * 0.3);
              sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff], 8, 18);
            }
          },
        });
      });
    },
    // Azrael, Declaration of Death: "Listen. The evening bell has tolled your name. The omen of feathers shall sever
    // your head." Night swallows the field; the First Hassan's horned skull rises over it with azure fire in its
    // sockets, and the bell before it tolls three times. Each toll is a ring sweeping the whole arena and lights a
    // blue flame on every enemy, while black feathers rain everywhere. Then his shadow is everywhere at once: a
    // spectral Hassan steps out behind each condemned enemy in turn and cuts it down. On the last toll the skull's
    // eyes blaze, and every head falls together (PENGGAL!): the weak are executed outright.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(3600);
      p.lock(3000);
      p.setVelocity(0, 0);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x05050f, 0.8)
        .setOrigin(0)
        .setDepth(4)
        .setAlpha(0);
      // The night sits over the platforms but under the enemies (depth 5), so the condemned stay in sight.
      const SKULL_Y = 84;
      const skull = scene.add
        .image(W / 2, SKULL_Y, 'hassanSkull')
        .setScale(4)
        .setAlpha(0)
        .setDepth(4.1);
      // The azure fire in its sockets (the glowing pixels sit 3 px either side of centre, 1 px below it, at scale 4).
      const eyes = [-1, 1].map((s) =>
        scene.add
          .circle(W / 2 + s * 12, SKULL_Y + 4, 5, 0x7fe6ff, 0.5)
          .setAlpha(0)
          .setDepth(4.2),
      );
      const rope = scene.add
        .rectangle(W / 2, 12, 1, 12, 0x5f574f)
        .setOrigin(0.5, 0)
        .setDepth(4.3)
        .setAlpha(0);
      // The bell hangs below the HUD, between the skull's horns.
      const BELL_Y = 24;
      const bell = eveningBell(scene, W / 2, BELL_Y, 1.4)
        .setAlpha(0)
        .setDepth(4.3);
      const night = [dark, skull, rope, bell, ...eyes];
      scene.tweens.add({ targets: dark, alpha: 1, duration: 300 });
      scene.tweens.add({ targets: [skull, rope, bell], alpha: 0.9, duration: 700, ease: 'Quad.Out' });
      scene.tweens.add({ targets: skull, y: { from: SKULL_Y + 8, to: SKULL_Y }, duration: 700, ease: 'Quad.Out' });
      scene.tweens.add({ targets: eyes, alpha: 1, scale: 1.3, delay: 500, duration: 250, yoyo: true, repeat: 3 });
      for (let i = 0; i < 40; i++) later(scene, i * 65, () => feathers(scene, Phaser.Math.Between(0, W), -4, 1, 0, FLOOR_Y));
      for (let i = 0; i < 10; i++) later(scene, i * 140, () => flameTongue(scene, p.x + Phaser.Math.Between(-8, 8), p.y + 7, 10, 350));
      // Three tolls.
      for (let k = 0; k < 3; k++)
        later(scene, 300 + k * 450, () => {
          scene.tweens.add({ targets: bell, angle: { from: -26, to: 26 }, duration: 160, yoyo: true, ease: 'Sine.InOut' });
          floatText(scene, W / 2 + (k % 2 ? -34 : 34), BELL_Y + 14, 'DONG', '#c2c3c7');
          ring(scene, W / 2, BELL_Y + 14, 0xc2c3c7, 6, 360, 700, 2);
          cam.shake(90, 0.005);
          for (const t of world.targets(p.x, p.y)) flameTongue(scene, t.x, t.y + 6, 8 + k * 5, 500);
        });
      // His shadow steps out behind each condemned enemy in turn and cuts it down.
      later(scene, 1600, () => {
        const ts = world
          .targets(p.x, p.y)
          .slice(0, 8)
          .sort((a, b) => a.x - b.x);
        ts.forEach((t, i) =>
          later(scene, i * 110, () => {
            if (!t.active) return;
            const side = t.x >= p.x ? 1 : -1;
            const gx = Phaser.Math.Clamp(t.x + side * 12, 6, W - 6);
            const shade = scene.add
              .image(gx, t.y, p.texture.key)
              .setFlipX(side > 0)
              .setTint(0x29adff)
              .setAlpha(0.9)
              .setDepth(12);
            scene.tweens.add({ targets: shade, alpha: 0, y: t.y - 6, delay: 120, duration: 300, onComplete: () => shade.destroy() });
            feathers(scene, gx, t.y, 4, 4, 20);
            cutMark(scene, t.x, t.y, 0x29adff, 34, -side * 0.9);
            flameTongue(scene, t.x, t.y + 6, 16, 450);
            world.strike(t, 2.2 * power, 'ult', true, { burn: 0.4 });
            cam.shake(70, 0.007);
          }),
        );
      });
      // The last toll: the skull's eyes blaze and every head falls together.
      later(scene, 2650, () => {
        scene.tweens.add({ targets: bell, angle: { from: -34, to: 34 }, duration: 160, yoyo: true, ease: 'Sine.InOut' });
        ring(scene, W / 2, BELL_Y + 14, 0x7fe6ff, 6, 360, 600, 3);
        scene.tweens.killTweensOf(eyes);
        scene.tweens.add({ targets: eyes, alpha: 1, scale: 2.2, duration: 150, yoyo: true });
        cam.flash(250, 41, 173, 255);
        cam.shake(450, 0.025);
        floatText(scene, W / 2, SKULL_Y + 40, 'PENGGAL!', '#7fe6ff');
        for (const t of world.targets(p.x, p.y)) {
          cutMark(scene, t.x, t.y, 0x7fe6ff, 50, Math.PI / 2);
          cutMark(scene, t.x, t.y, 0x29adff, 40, 0);
          for (const dx of [-6, 0, 6]) flameTongue(scene, t.x + dx, t.y + 8, dx ? 16 : 26, 550);
          feathers(scene, t.x, t.y - 4, 6, 8, 26);
          world.strike(t, (doomed(t) ? 50 : 4) * power, 'ult', true, { burn: 0.5 });
        }
        scene.tweens.add({ targets: night, alpha: 0, delay: 300, duration: 500, onComplete: () => night.forEach((o) => o.destroy()) });
      });
    },
  },

  tombak: {
    // The charging finisher (step 2): the curse's barbs burst out of whatever the spear goes into.
    onHit: ({ p, scene }, t) => {
      // ...and from whatever the diving spear (Tusukan Bawah) skewers.
      if (p.comboStep !== 2 && p.move !== p.weapon.dive) return;
      thorns(scene, t.x, t.y, 0xff004d, 7, 14);
    },
    // Gae Bolg: causality reversed. The heart is pierced first (red barbs burst out of the target), then the spear
    // arrives after it along a bent crimson path.
    skill: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      p.facing = t.x >= p.x ? 1 : -1;
      p.lock(250);
      p.setVelocityX(0);
      world.strike(t, 3 * power, 'skill', true);
      thorns(scene, t.x, t.y, 0xff004d, 8, 18);
      const [x0, y0, x1, y1] = [p.x, p.y, t.x, t.y];
      const cx = (x0 + x1) / 2;
      const cy = Math.min(y0, y1) - 50;
      const path = scene.add.graphics().setDepth(13).lineStyle(2, 0xff004d);
      path.beginPath().moveTo(x0, y0);
      for (let i = 1; i <= 16; i++) path.lineTo(...bez(x0, y0, cx, cy, x1, y1, i / 16));
      path.strokePath();
      scene.tweens.add({ targets: path, alpha: 0, duration: 450, onComplete: () => path.destroy() });
      const spear = scene.add.image(x0, y0, 'w_tombak').setDepth(14);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 170,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const [ax, ay] = bez(x0, y0, cx, cy, x1, y1, v);
          const [bx, by] = bez(x0, y0, cx, cy, x1, y1, Math.min(1, v + 0.05));
          spear.setPosition(ax, ay).setRotation(Math.atan2(by - ay, bx - ax));
        },
        onComplete: () => scene.tweens.add({ targets: spear, alpha: 0, duration: 200, onComplete: () => spear.destroy() }),
      });
    },
    // Gae Bolg: Tombak Terbang Pembunuh (Soaring Spear of Piercing Death): he takes his run-up, backing away from the
    // enemy in long crimson strides, and plants the spear; a ring of runes flares at his feet. He leaps far above
    // the field, and the curse gathers in the spear held over his head: the sky reddens and crimson wind spirals into
    // its point. Then the throw: one great red spear streaks toward the thickest crowd, and halfway there it bursts
    // into a storm of spears, one or two for every enemy on the field (flyers too), each driven straight through
    // its heart. The great spear itself lands in the crowd and its barbs tear out of the ground. GAE BOLG!
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const near = (t: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(o.x, o.y, t.x, t.y) < 50).length;
      const crowd = foes.reduce((b, t) => (near(t) > near(b) ? t : b));
      const f = crowd.x >= p.x ? 1 : -1;
      p.facing = f;
      p.invuln(2600);
      p.lock(2200);
      p.setVelocity(0, 0);
      // Run-up: long strides back, away from the target.
      const x0 = p.x;
      const y0 = p.y;
      const xb = Phaser.Math.Clamp(x0 - f * 36, 10, W - 10);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 280,
        ease: 'Quad.Out',
        onUpdate: (tw) => {
          p.body.reset(x0 + (xb - x0) * (tw.getValue() ?? 0), y0);
          p.ghost(0xff004d);
        },
      });
      later(scene, 300, () => {
        ring(scene, xb, FLOOR_Y - 2, 0xff004d, 4, 30, 400, 2);
        thorns(scene, xb, FLOOR_Y - 2, 0xff004d, 10, 16);
        rocks(scene, xb, FLOOR_Y - 2, 6);
      });
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x3a0a14, 0)
        .setOrigin(0)
        .setDepth(8);
      scene.tweens.add({ targets: sky, fillAlpha: 0.5, delay: 300, duration: 400 });
      // The leap, and the curse gathering in the spear overhead.
      const top = { x: Phaser.Math.Clamp(xb + f * 10, 10, W - 10), y: 36 };
      const spear = crimsonSpear(scene, 30).setVisible(false);
      later(scene, 380, () =>
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 420,
          ease: 'Quad.Out',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            p.body.reset(xb + (top.x - xb) * v, y0 + (top.y - y0) * v);
            p.ghost(0x7e2553);
          },
        }),
      );
      const gather = scene.time.addEvent({
        delay: 30,
        startAt: 0,
        loop: true,
        callback: () => {
          spear
            .setVisible(true)
            .setPosition(p.x, p.y - 14)
            .setRotation(f > 0 ? -0.3 : Math.PI + 0.3)
            .setScale(1, f);
          const a = Math.random() * Math.PI * 2;
          const tipX = spear.x + Math.cos(spear.rotation) * 22;
          const tipY = spear.y + Math.sin(spear.rotation) * 22;
          const m = scene.add
            .rectangle(tipX + Math.cos(a) * 26, tipY + Math.sin(a) * 26, 2, 1, Math.random() < 0.5 ? 0xff004d : 0xff77a8)
            .setDepth(14);
          scene.tweens.add({ targets: m, x: tipX, y: tipY, duration: 200, onComplete: () => m.destroy() });
        },
      });
      // The throw.
      later(scene, 1150, () => {
        gather.remove();
        const sx = p.x;
        const sy = p.y - 8;
        const tx = crowd.active ? crowd.x : Phaser.Math.Clamp(sx + f * 120, 10, W - 10);
        const ty = crowd.active ? Math.min(crowd.y, FLOOR_Y - 6) : FLOOR_Y - 6;
        const a = Phaser.Math.Angle.Between(sx, sy, tx, ty);
        spear
          .setPosition(sx, sy)
          .setRotation(a)
          .setScale(1.4, 1.4 * (Math.cos(a) < 0 ? -1 : 1));
        const bx = sx + (tx - sx) * 0.45;
        const by = sy + (ty - sy) * 0.45;
        scene.tweens.add({
          targets: spear,
          x: bx,
          y: by,
          duration: 160,
          ease: 'Quad.In',
          onUpdate: () => {
            const d = scene.add.rectangle(spear.x, spear.y, 6, 2, 0xff004d, 0.7).setRotation(a).setDepth(13);
            scene.tweens.add({ targets: d, alpha: 0, scaleX: 2, duration: 200, onComplete: () => d.destroy() });
          },
          onComplete: () => {
            // It bursts into a storm of spears.
            cam.flash(140, 179, 18, 46);
            cam.shake(200, 0.015);
            ring(scene, bx, by, 0xff004d, 4, 40, 300, 2);
            sparks(scene, bx, by, [0xff004d, 0xff77a8, 0xfff1e8], 20, 40);
            const live = world.targets(bx, by);
            const storm = live.flatMap((t) => (live.length <= 8 ? [t, t] : [t]));
            storm.forEach((t, i) =>
              later(scene, i * 45, () => {
                if (!t.active) return;
                const ang = Phaser.Math.Angle.Between(bx, by, t.x, t.y) + Phaser.Math.FloatBetween(-0.05, 0.05);
                const s = crimsonSpear(scene, 16)
                  .setPosition(bx, by)
                  .setRotation(ang)
                  .setScale(1, Math.cos(ang) < 0 ? -1 : 1);
                scene.tweens.add({
                  targets: s,
                  x: t.x,
                  y: t.y,
                  duration: 110,
                  ease: 'Quad.In',
                  onComplete: () => {
                    scene.tweens.add({ targets: s, alpha: 0, duration: 200, onComplete: () => s.destroy() });
                    if (!t.active) return;
                    thorns(scene, t.x, t.y, 0xff004d, 6, 14);
                    cam.shake(60, 0.008);
                    world.strike(t, 1.3 * power, 'ult', false);
                  },
                });
              }),
            );
            // The great spear lands in the crowd.
            scene.tweens.add({
              targets: spear,
              x: tx,
              y: ty,
              delay: 120,
              duration: 160,
              ease: 'Quad.In',
              onComplete: () => {
                cam.shake(450, 0.03);
                floatText(scene, tx, ty - 30, 'GAE BOLG!', '#ff004d');
                ring(scene, tx, ty, 0xff004d, 6, 70, 450, 3);
                ring(scene, tx, ty, 0x7e2553, 4, 100, 550, 2);
                // Barbs tearing out of the ground in a crown around it.
                for (let i = 0; i < 9; i++) {
                  const bxp = tx + (i - 4) * 9;
                  const h = 24 - Math.abs(i - 4) * 4;
                  const g = scene.add.graphics().setDepth(12);
                  g.fillStyle(0x1d0f0a).fillTriangle(-3, 0, 3, 0, 0, -h - 2);
                  g.fillStyle(0xff004d).fillTriangle(-2, 0, 2, 0, 0, -h);
                  g.fillStyle(0xff77a8).fillRect(0, -h * 0.8, 1, h * 0.4);
                  g.setPosition(bxp, FLOOR_Y + 1).setScale(1, 0);
                  scene.tweens.add({
                    targets: g,
                    scaleY: 1,
                    delay: i * 20,
                    duration: 90,
                    yoyo: true,
                    hold: 220,
                    onComplete: () => g.destroy(),
                  });
                }
                rocks(scene, tx, FLOOR_Y - 2, 12);
                world.area(tx, ty, 44, 2 * power, 260, 'ult');
                for (const t of world.targets(tx, ty)) world.strike(t, 0.8 * power, 'ult', true);
                scene.tweens.add({ targets: spear, alpha: 0, delay: 300, duration: 300, onComplete: () => spear.destroy() });
                scene.tweens.add({ targets: sky, fillAlpha: 0, delay: 300, duration: 500, onComplete: () => sky.destroy() });
              },
            });
          },
        });
      });
    },
    // Ansuz, the rune of fire (the primordial runes Scathach taught him): he carves the rune into the air with the
    // tip of Gae Bolg, stroke by stroke, while embers spiral into it. The finished rune flares once, and its word
    // brands a small burning copy of itself onto every enemy on the field, flyers too. Then, one after another, the
    // brands ignite into columns of rune-fire that leave the enemies burning, and the rune in the air crumbles away.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.lock(650);
      p.invuln(650);
      p.setVelocityX(0);
      // Ansuz: a tall stave with two branches slanting down from its head toward where he faces.
      const STROKES = [
        [0, -16, 0, 16],
        [0, -16, 11, -7],
        [0, -5, 11, 4],
      ] as const;
      // Draws the first `done` strokes (fractional: the last one partly carved); returns the carving tip.
      const drawRune = (g: Phaser.GameObjects.Graphics, done: number): [number, number] => {
        g.clear();
        let tip: [number, number] = [0, -16];
        for (const [w, c, a] of [
          [7, 0x7e2553, 0.5],
          [3, 0xff004d, 1],
          [1, 0xffec27, 1],
        ] as const)
          STROKES.forEach(([x1, y1, x2, y2], i) => {
            const k = Phaser.Math.Clamp(done - i, 0, 1);
            if (k <= 0) return;
            tip = [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
            g.lineStyle(w, c, a).lineBetween(x1, y1, tip[0], tip[1]);
          });
        return tip;
      };
      const gx = Phaser.Math.Clamp(p.x + f * 22, 16, W - 16);
      const gy = Math.max(34, p.y - 28);
      const rune = scene.add
        .graphics()
        .setPosition(gx, gy)
        .setScale(f * 1.4, 1.4)
        .setDepth(13);
      // Embers drawn out of the air, spiralling into the rune while it is carved.
      const embers = Array.from({ length: 10 }, (_, i) => scene.add.rectangle(gx, gy, 1, 1, i % 2 ? 0xffa300 : 0xffec27).setDepth(14));
      scene.tweens.addCounter({
        from: 0,
        to: 3,
        duration: 380,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const [tx, ty] = drawRune(rune, v);
          // The spear tip writing: a white-hot point shedding sparks.
          const s = scene.add.rectangle(gx + tx * f * 1.4, gy + ty * 1.4, 2, 2, 0xfff1e8).setDepth(15);
          scene.tweens.add({ targets: s, y: s.y + 6, alpha: 0, duration: 200, onComplete: () => s.destroy() });
          embers.forEach((e, i) => {
            const a = (i / embers.length) * Math.PI * 2 + v * 2;
            const r = 30 * (1 - v / 3.4);
            e.setPosition(gx + Math.cos(a) * r, gy + Math.sin(a) * r);
          });
        },
        onComplete: () => embers.forEach((e) => e.destroy()),
      });
      // The rune is spoken: it flares, and every enemy on the field is branded with it.
      later(scene, 420, () => {
        const foes = world.targets(gx, gy);
        if (!foes.length) return void rune.destroy();
        scene.cameras.main.flash(120, 255, 163, 0);
        ring(scene, gx, gy, 0xffa300, 6, 34, 300, 2);
        scene.tweens.add({ targets: rune, scaleX: f * 1.8, scaleY: 1.8, duration: 90, yoyo: true });
        foes.forEach((t, i) => {
          // The word carried: a streak of flame flicks from the rune to the enemy.
          const streak = scene.add
            .graphics()
            .setDepth(12)
            .lineStyle(3, 0xff004d, 0.5)
            .lineBetween(gx, gy, t.x, t.y)
            .lineStyle(1, 0xffec27)
            .lineBetween(gx, gy, t.x, t.y);
          scene.tweens.add({ targets: streak, alpha: 0, duration: 180, onComplete: () => streak.destroy() });
          const brand = scene.add
            .graphics()
            .setPosition(t.x, t.y)
            .setScale(f * 0.45, 0.45)
            .setDepth(14);
          drawRune(brand, 3);
          const follow = scene.time.addEvent({
            delay: 16,
            loop: true,
            callback: () => (t.active ? brand.setPosition(t.x, t.y) : brand.setVisible(false)),
          });
          scene.tweens.add({ targets: brand, alpha: 0.5, duration: 80, yoyo: true, repeat: 3 });
          world.strike(t, 0.6 * power, 'skill', false);
          // The brands ignite one by one: a column of rune-fire tears up through the enemy.
          later(scene, 260 + i * 70, () => {
            follow.remove();
            brand.destroy();
            if (!t.active) return;
            const grounded = t.y > FLOOR_Y - 30;
            const base = grounded ? FLOOR_Y : t.y + 12;
            flameTongue(scene, t.x, base, 40, 460, FIRE);
            flameTongue(scene, t.x - 4, base, 24, 380, FIRE);
            flameTongue(scene, t.x + 4, base, 28, 400, FIRE);
            ring(scene, t.x, base, 0xff004d, 2, 18, 260, 2);
            sparks(scene, t.x, t.y, [0xffa300, 0xffec27, 0xff004d], 12, 26);
            if (grounded) {
              // A scorch mark left on the floor.
              const scorch = scene.add.ellipse(t.x, FLOOR_Y + 1, 26, 4, 0x2a0a0a, 0.8).setDepth(3);
              scene.tweens.add({ targets: scorch, alpha: 0, delay: 400, duration: 400, onComplete: () => scorch.destroy() });
            }
            scene.cameras.main.shake(70, 0.008);
            world.strike(t, 2.4 * power, 'skill', false, { burn: 0.4 });
          });
        });
        // The rune in the air crumbles into embers once its word is spent.
        later(scene, 300 + foes.length * 70, () => {
          sparks(scene, gx, gy, [0xff004d, 0xffa300, 0x7e2553], 18, 30);
          scene.tweens.add({ targets: rune, alpha: 0, y: gy + 6, duration: 250, onComplete: () => rune.destroy() });
        });
      });
    },
  },

  kapak: {
    // Hantaman Meteor: the landing throws up walls of rock that race out along the floor both ways.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const hit = new Set<Phaser.GameObjects.GameObject>();
      for (const dir of [-1, 1])
        for (let k = 0; k < 4; k++)
          later(scene, k * 45, () => {
            const sx = x + dir * (14 + k * 16);
            const g = scene.add.graphics().setDepth(11);
            const h = 14 - k * 2;
            g.fillStyle(0x4a2a1a).fillTriangle(-6, 0, 6, 0, 0, -h - 2);
            g.fillStyle(0xab5236).fillTriangle(-4, 0, 4, 0, 0, -h);
            g.fillStyle(0xd08a50).fillTriangle(-1, -h * 0.4, 1, -h * 0.4, 0, -h);
            g.setPosition(sx, gy + 1).setScale(1, 0);
            scene.tweens.add({ targets: g, scaleY: 1, duration: 70, yoyo: true, hold: 100, onComplete: () => g.destroy() });
            rocks(scene, sx, gy - 2, 2);
            for (const t of world.targets(sx, gy)) {
              if (hit.has(t) || Math.abs(t.x - sx) > 9 || t.y < gy - 30) continue;
              hit.add(t);
              world.strike(t, 0.7 * power, 'proc', false, undefined, 200);
            }
          });
    },
    // The finisher hits the floor so hard that a wave of rock heaves up and runs on ahead along the ground.
    onSwing: ({ p, world, scene }, m, step) => {
      if (step !== 2 || !p.grounded) return;
      const f = p.facing;
      const hit = new Set<Phaser.GameObjects.GameObject>();
      later(scene, m.ms * 0.8, () => {
        scene.cameras.main.shake(140, 0.012);
        for (let k = 0; k < 5; k++)
          later(scene, k * 45, () => {
            const x = p.x + f * (22 + k * 16);
            if (x < 0 || x > W) return;
            const g = scene.add.graphics().setDepth(11);
            const h = 12 - k;
            g.fillStyle(0x4a2a1a).fillTriangle(-6, 0, 6, 0, 0, -h - 2);
            g.fillStyle(0xab5236).fillTriangle(-4, 0, 4, 0, 0, -h);
            g.fillStyle(0xd08a50).fillTriangle(-1, -h * 0.4, 1, -h * 0.4, 0, -h);
            g.setPosition(x, FLOOR_Y + 2).setScale(1, 0);
            scene.tweens.add({ targets: g, scaleY: 1, duration: 70, yoyo: true, hold: 90, onComplete: () => g.destroy() });
            rocks(scene, x, FLOOR_Y - 2, 2);
            for (const t of world.targets(x, FLOOR_Y)) {
              if (hit.has(t) || Math.abs(t.x - x) > 10 || t.y < FLOOR_Y - 30) continue;
              hit.add(t);
              world.strike(t, 0.6, 'proc', false, { slow: 600 }, 160);
            }
          });
      });
    },
    // Singa Nemea (the First Labour): Heracles roars, and the golden ghost of the Nemean Lion he strangled bounds out
    // of him. It pounces on the nearest enemy (leaping up to flyers), rakes it with its claws and pins it, then
    // springs on to the next (three victims at most). Its last landing ends in a roar that stuns everything near it.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      p.lock(350);
      p.setVelocityX(0);
      scene.cameras.main.shake(200, 0.01);
      ring(scene, p.x, p.y, 0xffa300, 4, 34, 300, 2);
      for (let i = 0; i < 8; i++) {
        const s = scene.add.circle(p.x + Phaser.Math.Between(-6, 6), p.y - 4, 3, i % 2 ? 0xb3122e : 0x5f574f, 0.6).setDepth(11);
        scene.tweens.add({ targets: s, y: s.y - 16, scale: 2, alpha: 0, duration: 400, onComplete: () => s.destroy() });
      }
      const lion = nemeanLion(scene, p.x, p.y, p.facing);
      lion.setScale(p.facing * 0.2, 0.2).setAlpha(0);
      scene.tweens.add({ targets: lion, scaleX: p.facing, scaleY: 1, alpha: 1, duration: 160, ease: 'Back.Out' });
      const done = new Set<Phaser.GameObjects.GameObject>();
      const pounce = (k: number, fx: number, fy: number) => {
        const t = world.targets(fx, fy).find((o) => !done.has(o));
        if (!t || k >= 3) return roar(fx, fy);
        done.add(t);
        const f = t.x >= fx ? 1 : -1;
        lion.setScale(f, 1);
        const tx = t.x - f * 6;
        const ty = Math.min(t.y, FLOOR_Y - 8);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 240,
          ease: 'Quad.Out',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            lion.setPosition(...bez(fx, fy, (fx + tx) / 2, Math.min(fy, ty) - 34, tx, ty, v));
            lion.setRotation(f * (v < 0.5 ? -0.35 : 0.3));
            if (Math.random() < 0.5) {
              const d = scene.add.rectangle(lion.x - f * 8, lion.y, 2, 2, 0xffec27, 0.7).setDepth(12);
              scene.tweens.add({ targets: d, alpha: 0, duration: 220, onComplete: () => d.destroy() });
            }
          },
          onComplete: () => {
            lion.setRotation(0);
            // Three rakes of the claws, each a set of three parallel gashes.
            for (let r = 0; r < 3; r++)
              later(scene, r * 90, () => {
                if (!t.active) return;
                const a = r % 2 ? -0.7 : 0.7;
                for (const o of [-3, 0, 3]) cutMark(scene, t.x + o, t.y + o * 0.5, 0xffa300, 18, a);
                sparks(scene, t.x, t.y, [0xffec27, 0xffa300], 4, 12);
                scene.cameras.main.shake(60, 0.006);
                world.strike(t, 0.9 * power, 'skill', false, r === 2 ? { freeze: 700 } : undefined);
              });
            later(scene, 300, () => pounce(k + 1, lion.x, lion.y));
          },
        });
      };
      // The last landing: the lion throws its head back and roars; the air shakes around it.
      const roar = (x: number, y: number) => {
        ring(scene, x, y, 0xffec27, 6, 46, 360, 2);
        ring(scene, x, y, 0xffa300, 4, 60, 460);
        scene.cameras.main.shake(180, 0.012);
        world.area(x, y, 46, 0.8 * power, 200, 'skill', { slow: 900 });
        scene.tweens.add({
          targets: lion,
          scaleX: lion.scaleX * 1.3,
          scaleY: 1.3,
          alpha: 0,
          duration: 360,
          onComplete: () => lion.destroy(),
        });
      };
      later(scene, 180, () => pounce(0, p.x, p.y));
    },
    // Nine Lives (Shooting Nine Heads): the sky goes blood-red and steam pours off him as nine wounds are marked
    // across the enemies (spread over them, nearest first). Then the nine blows, each counted: he is beside its
    // target in an instant, the stone axe-sword comes down in a huge arc and the camera jolts. After the ninth he
    // leaps above the field and falls on its middle: the floor caves in, walls of rock race to both sides, and one
    // last blow lands on everything (flyers too). SEMBILAN!
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      p.invuln(3600);
      p.lock(3400);
      p.setVelocity(0, 0);
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x3a0a0a, 0)
        .setOrigin(0)
        .setDepth(8);
      scene.tweens.add({ targets: sky, fillAlpha: 0.55, duration: 400 });
      // Build-up: steam and a spreading red aura.
      for (let i = 0; i < 16; i++)
        later(scene, i * 30, () => {
          const s = scene.add
            .circle(p.x + Phaser.Math.Between(-7, 7), p.y + 4, Phaser.Math.Between(2, 4), i % 3 ? 0xb3122e : 0x5f574f, 0.7)
            .setDepth(11);
          scene.tweens.add({ targets: s, y: s.y - 24, scale: 2.2, alpha: 0, duration: 500, onComplete: () => s.destroy() });
        });
      ring(scene, p.x, p.y, 0xff004d, 4, 40, 500, 3);
      cam.shake(500, 0.006);
      const marks = Array.from({ length: 9 }, (_, i) => foes[i % foes.length]);
      marks.forEach((t, i) =>
        later(scene, 120 + i * 40, () => {
          if (!t.active) return;
          const m = scene.add.text(t.x + ((i % 3) - 1) * 6, t.y - 18 - Math.floor(i / foes.length) * 7, `${i + 1}`, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '6px',
            color: '#ff004d',
          });
          m.setOrigin(0.5).setDepth(15);
          scene.tweens.add({ targets: m, alpha: 0, delay: 500 + i * 140, duration: 120, onComplete: () => m.destroy() });
        }),
      );
      // The nine blows.
      marks.forEach((t, i) =>
        later(scene, 650 + i * 140, () => {
          if (!t.active) return;
          const side = i % 2 ? 1 : -1;
          p.ghost(0xff004d);
          p.body.reset(Phaser.Math.Clamp(t.x + side * 14, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
          p.facing = -side;
          const arc = scene.add
            .image(t.x, t.y, 'slashWide')
            .setTint(i % 2 ? 0xffa300 : 0xff004d)
            .setScale(-side * 2.2, 2.2)
            .setDepth(13);
          scene.tweens.add({ targets: arc, angle: -side * 90, alpha: 0, duration: 200, onComplete: () => arc.destroy() });
          cutMark(scene, t.x, t.y, 0xff004d, 34);
          sparks(scene, t.x, t.y, [0xffa300, 0xff004d, 0xfff1e8], 8, 20);
          floatText(scene, t.x, t.y - 28, `${i + 1}`, '#ff004d');
          cam.shake(90, 0.012);
          world.strike(t, 1 * power, 'ult', i === 8);
        }),
      );
      // The fall.
      later(scene, 650 + 9 * 140 + 120, () => {
        const live = world.targets(p.x, p.y);
        const near = (t: Phaser.GameObjects.Sprite) => live.filter((o) => Math.abs(o.x - t.x) < 50).length;
        const crowd = live.reduce<Phaser.GameObjects.Sprite | undefined>((b, t) => (!b || near(t) > near(b) ? t : b), undefined);
        const ax = Phaser.Math.Clamp(crowd?.x ?? W / 2, 16, W - 16);
        const x0 = p.x;
        const y0 = p.y;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 420,
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            p.body.reset(...bez(x0, y0, (x0 + ax) / 2, 10, ax, FLOOR_Y - 8, v < 0.6 ? v * 0.8 : 0.48 + (v - 0.6) * 1.3));
            p.ghost(0xb3122e);
          },
          onComplete: () => {
            p.body.reset(ax, FLOOR_Y - 8);
            cam.flash(180, 255, 0, 77);
            cam.shake(500, 0.03);
            floatText(scene, ax, FLOOR_Y - 40, 'SEMBILAN!', '#ff004d');
            ring(scene, ax, FLOOR_Y - 4, 0xff004d, 6, 90, 500, 3);
            ring(scene, ax, FLOOR_Y - 4, 0xd08a50, 4, 120, 600, 2);
            rocks(scene, ax, FLOOR_Y - 2, 20);
            // The crater: a dark dish with a molten rim.
            const crater = scene.add.graphics().setDepth(5);
            crater.fillStyle(0x1d0f0a).fillEllipse(ax, FLOOR_Y + 1, 44, 6);
            crater.lineStyle(1, 0xffa300).strokeEllipse(ax, FLOOR_Y + 1, 44, 6);
            scene.tweens.add({ targets: crater, alpha: 0, delay: 600, duration: 500, onComplete: () => crater.destroy() });
            // Walls of rock racing along the floor to both ends.
            for (const dir of [-1, 1])
              for (let k = 0; k < 8; k++)
                later(scene, k * 45, () => {
                  const x = ax + dir * (14 + k * 22);
                  if (x < 0 || x > W) return;
                  const g = scene.add.graphics().setDepth(11);
                  const h = 16 - k;
                  g.fillStyle(0x4a2a1a).fillTriangle(-7, 0, 7, 0, 0, -h - 2);
                  g.fillStyle(0xab5236).fillTriangle(-5, 0, 5, 0, 0, -h);
                  g.fillStyle(0xd08a50).fillTriangle(-1, -h * 0.4, 2, -h * 0.4, 0, -h);
                  g.setPosition(x, FLOOR_Y + 2).setScale(1, 0);
                  scene.tweens.add({ targets: g, scaleY: 1, duration: 90, yoyo: true, hold: 160, onComplete: () => g.destroy() });
                  rocks(scene, x, FLOOR_Y - 2, 2);
                });
            for (const t of world.targets(ax, FLOOR_Y)) world.strike(t, 2 * power, 'ult', true, { slow: 1200 }, 260);
            scene.tweens.add({ targets: sky, fillAlpha: 0, delay: 300, duration: 500, onComplete: () => sky.destroy() });
          },
        });
      });
    },
    // God Hand: the Twelve Labours made his body something no weapon can wound. He plants his feet, the floor splits
    // into glowing cracks and red steam boils off him; then he charges the full width of the arena, trampling
    // everything on the floor, kicks off the far side and leaps into the enemies in the air with one huge swing, and
    // comes down like a falling mountain: a crater, and walls of rock bursting out along the floor both ways.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      const gy = FLOOR_Y - 8;
      const flyer = (t: Phaser.GameObjects.Sprite) => t.y < FLOOR_Y - 40;
      const swung = new Set<Phaser.GameObjects.GameObject>();
      const trampled = new Set<Phaser.GameObjects.GameObject>();
      // Anything his body passes through in the leap and the fall is smashed aside, once.
      const rammed = new Set<Phaser.GameObjects.GameObject>();
      const ram = () => {
        for (const t of world.targets(p.x, p.y)) {
          if (rammed.has(t) || Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) > 22) continue;
          rammed.add(t);
          world.strike(t, 0.6 * power, 'skill', false);
          cutMark(scene, t.x, t.y, 0xffa300, 24);
        }
      };
      p.lock(1500);
      p.invuln(1700);
      p.setVelocity(0, 0);
      // Glowing cracks zigzag out across the floor from his feet: dark split, molten core.
      const crack = (x: number, len: number, ms: number) => {
        const g = scene.add.graphics().setDepth(5);
        for (const dir of [-1, 1]) {
          const pts: [number, number][] = [[x, FLOOR_Y]];
          for (let i = 1; i <= 6; i++) pts.push([x + (dir * (len * i)) / 6, FLOOR_Y + (i % 2 ? 2 : 0) + Phaser.Math.Between(0, 1)]);
          for (const [w, c] of [
            [3, 0x1d0f0a],
            [1, 0xffa300],
          ] as const) {
            g.lineStyle(w, c).beginPath().moveTo(pts[0][0], pts[0][1]);
            for (const [px, py] of pts) g.lineTo(px, py);
            g.strokePath();
          }
        }
        scene.tweens.add({ targets: g, alpha: 0, delay: ms, duration: 400, onComplete: () => g.destroy() });
      };
      // Build-up: steam boils off his skin, the floor splits under him.
      crack(p.x, 26, 600);
      cam.shake(250, 0.006);
      ring(scene, p.x, p.y, 0xd08a50, 4, 26, 260, 2);
      for (let i = 0; i < 12; i++)
        later(scene, i * 20, () => {
          const s = scene.add
            .circle(
              p.x + Phaser.Math.Between(-6, 6),
              p.y + Phaser.Math.Between(-4, 6),
              Phaser.Math.Between(2, 3),
              i % 3 ? 0xb3122e : 0x5f574f,
              0.6,
            )
            .setDepth(11);
          scene.tweens.add({ targets: s, y: s.y - 18, scale: 2, alpha: 0, duration: 450, onComplete: () => s.destroy() });
        });
      // The charge: toward the side with more enemies on the floor, all the way to the edge.
      later(scene, 260, () => {
        const foes = world.targets(p.x, p.y);
        const ground = foes.filter((t) => !flyer(t));
        const ahead = ground.filter((t) => Math.sign(t.x - p.x) === p.facing).length;
        const dir = ahead * 2 >= ground.length ? p.facing : -p.facing;
        p.facing = dir;
        const x0 = p.x;
        const x1 = dir > 0 ? W - 10 : 10;
        let k = 0;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: Math.max(180, Math.abs(x1 - x0) * 1.3),
          onUpdate: (tw) => {
            const x = x0 + (x1 - x0) * (tw.getValue() ?? 0);
            p.body.reset(x, gy);
            if (k++ % 2) p.ghost(0xff004d);
            // Earth kicked up behind every stride.
            const d = scene.add.rectangle(x - dir * 4, FLOOR_Y - 1, 2, 2, k % 2 ? 0xab5236 : 0x5f574f).setDepth(11);
            scene.tweens.add({
              targets: d,
              x: d.x - dir * Phaser.Math.Between(6, 16),
              y: d.y - Phaser.Math.Between(4, 12),
              alpha: 0,
              duration: 300,
              onComplete: () => d.destroy(),
            });
            for (const t of world.targets(x, gy)) {
              if (trampled.has(t) || Math.abs(t.x - x) > 14 || Math.abs(t.y - gy) > 40) continue;
              trampled.add(t);
              world.strike(t, 0.9 * power, 'skill', false);
              cutMark(scene, t.x, t.y, 0xffa300, 26);
              rocks(scene, t.x, FLOOR_Y - 2, 4);
              cam.shake(80, 0.01);
            }
          },
          onComplete: () => leap(x1),
        });
      });
      // The leap: off the wall he bounds from enemy to enemy through the air, always to the nearest one nothing has
      // touched yet (up to four bounds, each swing clearing a knot of them); with nobody left, one bound above the
      // thickest crowd on the floor before the fall.
      const leap = (ex: number) => {
        p.lock(1700);
        p.invuln(1900);
        crack(ex, 14, 300);
        hop(0, ex, gy);
      };
      const hop = (i: number, fx: number, fy: number) => {
        const foes = world.targets(fx, fy);
        const next = foes.find((t) => !swung.has(t) && !trampled.has(t) && !rammed.has(t));
        if (!next && i > 0) return fall(fx, fy);
        const near = (t: Phaser.GameObjects.Sprite) => foes.filter((o) => Math.abs(t.x - o.x) < 44).length;
        const crowd = foes.reduce<Phaser.GameObjects.Sprite | undefined>((b, t) => (!b || near(t) > near(b) ? t : b), undefined);
        const ax = Phaser.Math.Clamp(next?.x ?? crowd?.x ?? W / 2, 12, W - 12);
        const ay = next ? Phaser.Math.Clamp(next.y, 26, FLOOR_Y - 34) : 60;
        p.facing = ax >= fx ? 1 : -1;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: i ? 200 : 300,
          ease: 'Quad.Out',
          onUpdate: (tw) => {
            p.body.reset(...bez(fx, fy, (fx + ax) / 2, Math.min(fy, ay) - 30, ax, ay, tw.getValue() ?? 0));
            p.ghost(0xd08a50);
            ram();
          },
          onComplete: () => {
            // One huge swing at the top of each bound.
            const arc = scene.add
              .image(ax, ay, 'slashWide')
              .setTint(0xffa300)
              .setScale(p.facing * 3, 3)
              .setDepth(13);
            scene.tweens.add({ targets: arc, angle: p.facing * 120, alpha: 0, duration: 260, onComplete: () => arc.destroy() });
            // Each enemy is caught by one swing at most.
            for (const t of world.targets(ax, ay)) {
              if (swung.has(t) || Phaser.Math.Distance.Between(ax, ay, t.x, t.y) > 46) continue;
              swung.add(t);
              world.strike(t, 1.1 * power, 'skill', false);
              cutMark(scene, t.x, t.y, 0xff004d, 30);
            }
            sparks(scene, ax, ay, [0xffa300, 0xfff1e8], 14, 40);
            cam.shake(120, 0.012);
            later(scene, 90, () => (i < 3 ? hop(i + 1, ax, ay) : fall(ax, ay)));
          },
        });
      };
      // The fall: straight down, then the crater and two walls of rock racing out along the floor.
      const fall = (ax: number, ay: number) => {
        scene.tweens.addCounter({
          from: ay,
          to: gy,
          duration: 160,
          ease: 'Quad.In',
          onUpdate: (tw) => (p.body.reset(ax, tw.getValue() ?? gy), p.ghost(0xff004d), ram()),
          onComplete: () => {
            p.body.reset(ax, gy);
            p.lock(150);
            cam.flash(150, 255, 163, 0);
            cam.shake(350, 0.025);
            crack(ax, 60, 700);
            rocks(scene, ax, FLOOR_Y - 2, 16);
            ring(scene, ax, FLOOR_Y - 4, 0xd08a50, 6, 70, 400, 3);
            for (const dir of [-1, 1]) {
              // A jagged wall of rock: dark outline, earth body, a lit ridge; it rises and races outward.
              const g = scene.add.graphics();
              const spikes = (w: number, h: number, c: number) => {
                const pts = [new Phaser.Math.Vector2(-w, 0)];
                for (let i = 0; i <= 4; i++) pts.push(new Phaser.Math.Vector2(-w + (i * w) / 2, -(i % 2 ? h : h * 0.55)));
                pts.push(new Phaser.Math.Vector2(w, 0));
                g.fillStyle(c).fillPoints(pts, true);
              };
              spikes(12, 18, 0x4a2a1a);
              spikes(10, 15, 0xab5236);
              spikes(5, 9, 0xd08a50);
              const wall = scene.add
                .container(ax + dir * 10, FLOOR_Y + 2, [g])
                .setScale(dir, 0)
                .setDepth(11);
              scene.tweens.add({ targets: wall, scaleY: 1, duration: 90, ease: 'Back.Out' });
              scene.tweens.add({
                targets: wall,
                x: ax + dir * 80,
                alpha: 0,
                duration: 420,
                ease: 'Quad.Out',
                onUpdate: () => Math.random() < 0.3 && rocks(scene, wall.x, FLOOR_Y - 2, 1),
                onComplete: () => wall.destroy(),
              });
            }
            world.area(ax, FLOOR_Y - 10, 84, 0.9 * power, 280, 'skill', { slow: 900 });
          },
        });
      };
    },
  },

  busur: {
    // Terjunan Bangau: on landing he throws Kanshou and Bakuya out along the floor, one each way.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      for (const f of [-1, 1]) {
        const b = world.shot({
          x: x + f * 6,
          y: gy - 6,
          vx: f * 240,
          vy: 0,
          texture: f > 0 ? 'w_busur' : 'w_bakuya',
          mult: 0.6 * power,
          source: 'proc',
          pierce: true,
          spin: true,
          knockback: 100,
        });
        later(scene, 360, () => b.active && b.destroy());
      }
      sparks(scene, x, gy - 4, [0xfff1e8, 0xff004d], 8, 14);
    },
    // Caladbolg II: he traces his black bow, blue light spirals into it, then the twisted sword flies as an arrow, drilling the air with a
    // double helix behind it; it detonates on the first thing it hits.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(240);
      p.setVelocityX(0);
      // Trace on: the black bow materializes in his hand from white outline to solid, and fades once the shot is loosed.
      const bow = scene.add
        .image(p.x + f * 7, p.y, 'busurHitam')
        .setFlipX(f < 0)
        .setTint(0xfff1e8)
        .setTintMode(Phaser.TintModes.FILL)
        .setDepth(12);
      later(scene, 90, () => bow.active && bow.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY));
      scene.tweens.add({ targets: bow, alpha: 0, delay: 300, duration: 200, onComplete: () => bow.destroy() });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const m = scene.add.rectangle(p.x + Math.cos(a) * 26, p.y + Math.sin(a) * 26, 1, 1, 0x29adff).setDepth(13);
        scene.tweens.add({ targets: m, x: p.x + f * 6, y: p.y, duration: 200, onComplete: () => m.destroy() });
      }
      later(scene, 220, () => {
        if (!p.active) return;
        const arrow = world.shot({
          x: p.x + f * 8,
          y: p.y,
          vx: f * 320,
          vy: 0,
          texture: 'arrow',
          tint: 0x29adff,
          mult: 2 * power,
          source: 'skill',
          explode: 32,
        }) as Phaser.GameObjects.Image;
        arrow.setScale(1.6);
        whileAlive(scene, arrow, 25, (k) => {
          for (const s of [1, -1]) {
            const d = scene.add.rectangle(arrow.x, arrow.y + s * Math.sin(k * 0.9) * 4, 1, 1, s > 0 ? 0x29adff : 0xfff1e8).setDepth(12);
            scene.tweens.add({ targets: d, alpha: 0, duration: 220, onComplete: () => d.destroy() });
          }
        });
        arrow.once('destroy', () => {
          if (arrow.x > 0 && arrow.x < W) {
            ring(scene, arrow.x, arrow.y, 0x29adff, 6, 36, 300, 2);
            sparks(scene, arrow.x, arrow.y, [0x29adff, 0xfff1e8], 12, 34);
          }
        });
      });
    },
    // Unlimited Blade Works: a ring of fire sweeps out from him, the sky turns to rust with great gears turning in it,
    // a field of swords rises out of the ground, and then they rain down on every enemy.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      floatText(scene, W / 2, 30, 'I AM THE BONE OF MY SWORD', '#ffa300');
      ring(scene, p.x, p.y, 0xffa300, 4, 360, 600, 3);
      const field = scene.add.rectangle(0, 0, W, FLOOR_Y, 0xab5236, 0.3).setOrigin(0).setDepth(3).setAlpha(0);
      const gears = [
        [60, 36, 26],
        [250, 50, 34],
        [160, 20, 16],
      ].map(([x, y, r], i) => {
        const g = scene.add
          .star(x, y, 10, r * 0.8, r, 0x5f574f, 0.5)
          .setDepth(3)
          .setAlpha(0);
        scene.tweens.add({ targets: g, angle: i % 2 ? -360 : 360, duration: 3000 });
        return g;
      });
      const planted = Array.from({ length: 18 }, (_, i) =>
        scene.add
          .image(
            8 + (i * (W - 16)) / 17 + Phaser.Math.Between(-4, 4),
            FLOOR_Y + 8,
            Phaser.Math.RND.pick(['w_pedang', 'w_katana', 'w_belati', 'w_tombak']),
          )
          .setAngle(-90 + Phaser.Math.Between(-15, 15))
          .setTint(0xc2c3c7)
          .setDepth(4),
      );
      scene.tweens.add({ targets: [field, ...gears], alpha: 1, duration: 400 });
      scene.tweens.add({ targets: planted, y: FLOOR_Y - 6, duration: 300, delay: 300, ease: 'Back.Out' });
      for (let i = 0; i < 28; i++) {
        later(scene, 500 + i * 90, () => {
          const live = world.targets(p.x, p.y);
          if (!live.length) return;
          const t = live[i % live.length];
          world.shot({
            x: t.x + Phaser.Math.Between(-6, 6),
            y: -10,
            vx: 0,
            vy: 320,
            texture: Phaser.Math.RND.pick(['w_pedang', 'w_katana', 'w_belati']),
            tint: 0xfff1e8,
            mult: 0.9 * power,
            source: 'ult',
          });
        });
      }
      later(scene, 3200, () =>
        scene.tweens.add({
          targets: [field, ...gears, ...planted],
          alpha: 0,
          duration: 500,
          onComplete: () => [field, ...gears, ...planted].forEach((o) => o.destroy()),
        }),
      );
    },
    // Kakuyoku San-ren, Crane Wing Three Realms: Kanshou and Bakuya are drawn to each other, so a thrown pair always
    // closes on its target from both sides like a crane's wings. "Trace on": he projects a pair and throws it, wings
    // spread wide around every enemy; again, wider; a third time, widest. Then he flash-steps in with the blades
    // reinforced into Overedge, long feathered wings of steel, and scissors them shut on the nearest enemy.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.lock(1050);
      p.invuln(1050);
      p.setVelocityX(0);
      // Trace on: a glint at his hands and blue wireframe light drawn in from the air.
      const trace = () => {
        glint(scene, p.x + p.facing * 5, p.y);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const m = scene.add.rectangle(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, 2, 1, i % 2 ? 0x29adff : 0xc2f0ff).setDepth(13);
          scene.tweens.add({ targets: m, x: p.x, y: p.y, rotation: a, duration: 140, onComplete: () => m.destroy() });
        }
      };
      // One pair thrown at t: the black and the white blade fly mirrored arcs, `bend` px wide, and meet on it.
      const pair = (t: Phaser.GameObjects.Sprite, bend: number) => {
        const [x0, y0] = [p.x, p.y];
        let [tx, ty] = [t.x, t.y];
        for (const [tex, side, cut] of [
          ['w_busur', 1, 0xff004d],
          ['w_bakuya', -1, 0xfff1e8],
        ] as const) {
          const b = scene.add.image(x0, y0, tex).setDepth(13);
          let k = 0;
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 300,
            ease: 'Sine.In',
            onUpdate: (tw) => {
              // Steers to wherever the target is now.
              if (t.active) [tx, ty] = [t.x, t.y];
              const a = Phaser.Math.Angle.Between(x0, y0, tx, ty) + (side * Math.PI) / 2;
              const v = tw.getValue() ?? 0;
              b.setPosition(...bez(x0, y0, (x0 + tx) / 2 + Math.cos(a) * bend, (y0 + ty) / 2 + Math.sin(a) * bend, tx, ty, v)).setAngle(
                v * 900 * side,
              );
              if (k++ % 2) {
                const d = scene.add.rectangle(b.x, b.y, 1, 1, side > 0 ? 0x5f574f : 0xfff1e8).setDepth(12);
                scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
              }
            },
            onComplete: () => {
              scene.tweens.add({ targets: b, alpha: 0, scale: 1.6, duration: 120, onComplete: () => b.destroy() });
              if (!t.active) return;
              world.strike(t, 0.4 * power, 'skill', false);
              cutMark(scene, t.x, t.y, cut, 20, side * 0.8);
            },
          });
        }
      };
      for (let w = 0; w < 3; w++)
        later(scene, w * 200, () => {
          if (!p.active) return;
          trace();
          for (const t of world.targets(p.x, p.y).slice(0, 8)) pair(t, 26 + w * 16);
        });
      // Overedge: both blades swell into feathered wings of steel, and he closes them on the nearest enemy.
      later(scene, 720, () => {
        const t = world.targets(p.x, p.y)[0];
        if (!t || !p.active) return;
        const side = t.x >= p.x ? -1 : 1;
        const [sx, sy] = [p.x, p.y];
        p.body.reset(Phaser.Math.Clamp(t.x + side * 12, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
        p.facing = -side;
        bladeLine(scene, sx, sy, p.x, p.y, 0x29adff, 60);
        afterimage(scene, p, sx, sy, 0.6, 0x29adff);
        // A long blade pointing up from its hilt at (0, 0): dark outline, steel body, lit edge, and feathered barbs.
        const overedge = (body: number, edge: number, mark: number) => {
          const g = scene.add.graphics();
          const blade = (w: number, c: number) => {
            g.fillStyle(c).fillPoints(
              [
                new Phaser.Math.Vector2(-w, 0),
                new Phaser.Math.Vector2(-w - 1, -26),
                new Phaser.Math.Vector2(0, -36 - w),
                new Phaser.Math.Vector2(w + 1, -26),
                new Phaser.Math.Vector2(w, 0),
              ],
              true,
            );
            for (let i = 0; i < 4; i++) g.fillTriangle(w, -6 - i * 7, w + 4 + w, -12 - i * 7, w, -10 - i * 7);
          };
          blade(4, 0x000000);
          blade(3, body);
          g.fillStyle(edge).fillRect(-3, -26, 1, 24);
          g.fillStyle(mark).fillRect(0, -22, 1, 14);
          g.fillStyle(0x000000).fillRect(-6, 0, 12, 3).fillRect(-1, 3, 2, 6);
          return scene.add.container(t.x, t.y + 14, [g]).setDepth(14);
        };
        const pairs = [overedge(0x3b3b4f, 0x83769c, 0xff004d), overedge(0xc2c3c7, 0xfff1e8, 0x29adff)];
        pairs.forEach((b, i) => {
          const s = i ? 1 : -1;
          b.setAngle(s * 110).setScale(0.6);
          scene.tweens.add({ targets: b, scale: 1, duration: 90 });
          // The scissor: both wings snap shut across the target into an X.
          scene.tweens.add({
            targets: b,
            angle: -s * 35,
            delay: 110,
            duration: 90,
            ease: 'Quad.In',
            onComplete: () => scene.tweens.add({ targets: b, alpha: 0, delay: 160, duration: 200, onComplete: () => b.destroy() }),
          });
        });
        later(scene, 200, () => {
          if (!t.active) return;
          scene.cameras.main.flash(100, 255, 241, 232);
          scene.cameras.main.shake(200, 0.016);
          cutMark(scene, t.x, t.y, 0xff004d, 46, 0.8);
          cutMark(scene, t.x, t.y, 0x29adff, 46, -0.8);
          sparks(scene, t.x, t.y, [0xfff1e8, 0x29adff, 0xff004d], 16, 34);
          ring(scene, t.x, t.y, 0xfff1e8, 4, 34, 260, 2);
          world.strike(t, 1.6 * power, 'skill', true);
          world.area(t.x, t.y, 30, 0.8 * power, 180, 'skill');
        });
      });
    },
  },

  sabit: {
    // Sabit Jatuh: the scythe bites into the floor and three bony hands claw up around him, seizing whatever is near.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      for (const dx of [-24, 0, 24]) {
        const hand = underworldHand(scene, x + dx, gy);
        scene.tweens.add({ targets: hand, scaleY: 1.5, delay: 60, duration: 110, ease: 'Back.Out' });
        scene.tweens.add({ targets: hand, scaleY: 0, alpha: 0, delay: 480, duration: 160, onComplete: () => hand.destroy() });
      }
      for (const t of world.targets(x, gy))
        if (Math.abs(t.x - x) < 34 && t.y > gy - 30) world.strike(t, 0.5 * power, 'proc', false, { freeze: 700 }, 0);
    },
    // The hook cuts drag a thread of soul-light back to the blade; every soul the reap (step 2) cuts flies into him.
    onHit: ({ p, scene }, t) => {
      if (p.comboStep === 2) {
        soulTo(scene, t.x, t.y, p, 0x29adff);
        p.heal(1);
        return;
      }
      const g = scene.add
        .graphics()
        .setDepth(12)
        .lineStyle(1, 0x29adff, 0.9)
        .lineBetween(t.x, t.y, p.x + p.facing * 8, p.y);
      scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    },
    // Gerbang Alam Baka (the Gate of the Underworld): the Reaper drags the tip of his scythe along the floor and the
    // ground tears open behind it toward the thicker side of the fight, a violet slit glowing up from below. Bony
    // hands claw up out of it and seize every enemy standing on the rift; chains of soul-light shoot up from it, snare
    // the ones flying above and haul them down. Then the gate bites shut on its catch, and their souls drift to him.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      const ahead = foes.filter((t) => Math.sign(t.x - p.x) === p.facing).length;
      if (ahead * 2 < foes.length) p.facing = -p.facing;
      const f = p.facing;
      p.lock(500);
      p.setVelocityX(0);
      const x0 = Phaser.Math.Clamp(p.x + f * 10, 0, W);
      const x1 = Phaser.Math.Clamp(p.x + f * 120, 0, W);
      const lo = Math.min(x0, x1);
      const hi = Math.max(x0, x1);
      const y = FLOOR_Y;
      // The rift opens along the floor, racing out from his feet.
      const rift = scene.add.graphics().setDepth(5);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 220,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const end = x0 + (x1 - x0) * v;
          rift.clear();
          rift.fillStyle(0x7e2553, 0.5).fillRect(Math.min(x0, end), y - 3, Math.abs(end - x0), 4);
          rift.fillStyle(0x1c1c28).fillRect(Math.min(x0, end), y - 1, Math.abs(end - x0), 3);
          rift.fillStyle(0xc080ff).fillRect(Math.min(x0, end), y, Math.abs(end - x0), 1);
          // Sparks off the dragging blade.
          sparks(scene, end, y - 1, [0x29adff, 0xc2c3c7], 2, 8);
        },
      });
      const caught: Phaser.GameObjects.Sprite[] = [];
      later(scene, 240, () => {
        scene.cameras.main.shake(140, 0.008);
        for (const t of world.targets(p.x, p.y)) {
          if (t.x < lo - 6 || t.x > hi + 6) continue;
          caught.push(t);
          if (t.y > FLOOR_Y - 30) {
            // A skeletal hand claws up and closes on it.
            const hand = underworldHand(scene, t.x, y);
            scene.tweens.add({ targets: hand, scaleY: 1.5, duration: 120, ease: 'Back.Out' });
            scene.tweens.add({ targets: hand, scaleY: 0, alpha: 0, delay: 520, duration: 160, onComplete: () => hand.destroy() });
            world.strike(t, 0.6 * power, 'skill', false, { freeze: 900 });
          } else {
            // A chain of soul-light lashes up to the flyer and drags it down.
            const chain = scene.add.graphics().setDepth(12);
            const draw = () => {
              chain.clear();
              if (!t.active) return;
              const n = Math.max(2, Math.floor((y - t.y) / 4));
              for (let k = 0; k < n; k++) {
                const cy = y - ((y - t.y) * k) / n;
                chain.fillStyle(k % 2 ? 0x29adff : 0xc2f0ff).fillRect(t.x - (k % 2), cy - 1, 2, 2);
              }
            };
            const follow = scene.time.addEvent({ delay: 16, loop: true, callback: draw });
            later(scene, 560, () => (follow.remove(), chain.destroy()));
            world.slam(t.x, t.y, 4, 260);
            world.strike(t, 0.6 * power, 'skill', false, { slow: 900 });
          }
        }
      });
      // The gate bites shut.
      later(scene, 640, () => {
        scene.tweens.add({ targets: rift, alpha: 0, duration: 200, onComplete: () => rift.destroy() });
        for (const t of caught) {
          if (!t.active) continue;
          cutMark(scene, t.x, t.y, 0x7e2553, 26, 0);
          sparks(scene, t.x, t.y, [0x7e2553, 0x29adff], 6, 14);
          world.strike(t, 1.3 * power, 'skill', false);
          soulTo(scene, t.x, t.y, p, 0x29adff);
        }
        if (caught.length) p.heal(caught.length * 2);
      });
    },
    // Panen Maut (the Harvest): night falls, and behind the Reaper his true shape rises out of the floor: a hooded
    // giant with a skull for a face, the great scythe in its bony grip. A soul-candle lights over every enemy on the
    // field. The giant reaps twice: one swing low across the whole floor, one high across the sky; every life the blade
    // passes is cut and its candle snuffed, the flame flying into him. Then it lifts the scythe and brings it down
    // through all of them at once. PANEN!
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const f = p.facing;
      const cam = scene.cameras.main;
      p.invuln(3400);
      p.lock(3000);
      p.setVelocity(0, 0);
      const night = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x14081e, 0)
        .setOrigin(0)
        .setDepth(8);
      scene.tweens.add({ targets: night, fillAlpha: 0.65, duration: 400 });
      // The giant rises behind him.
      const gx = Phaser.Math.Clamp(p.x - f * 18, 26, W - 26);
      const giant = giantReaper(scene, gx, FLOOR_Y + 70, f);
      scene.tweens.add({ targets: giant.body, y: FLOOR_Y + 2, duration: 600, ease: 'Quad.Out' });
      smoke2(scene, gx, FLOOR_Y, 14);
      // Soul-candles over every enemy.
      const candles = new Map<Phaser.GameObjects.Sprite, Phaser.GameObjects.Graphics>();
      foes.forEach((t, i) =>
        later(scene, 200 + i * 40, () => {
          if (!t.active) return;
          const c = scene.add.graphics().setDepth(14);
          candles.set(t, c);
          const ev = scene.time.addEvent({
            delay: 16,
            loop: true,
            callback: () => {
              if (!c.active || !t.active) return (ev.remove(), c.destroy());
              const h = 5 + Math.sin(scene.time.now / 60 + i) * 1.5;
              const cx = t.x;
              const cy = t.y - t.displayHeight / 2 - 12;
              c.clear();
              c.fillStyle(0xc2c3c7).fillRect(cx - 1, cy, 3, 4);
              c.fillStyle(0x2a4bd7)
                .fillCircle(cx, cy - 1, 2)
                .fillTriangle(cx - 2, cy - 1, cx + 2, cy - 1, cx, cy - 1 - h);
              c.fillStyle(0x7fe6ff).fillRect(cx, cy - 3, 1, 2);
            },
          });
        }),
      );
      const reaped = (t: Phaser.GameObjects.Sprite, mult: number) => {
        if (!t.active) return;
        cutMark(scene, t.x, t.y, 0x29adff, 34);
        world.strike(t, mult * power, 'ult', false);
        const c = candles.get(t);
        if (c) {
          candles.delete(t);
          c.destroy();
          soulTo(scene, t.x, t.y - 14, p, 0x7fe6ff);
          p.heal(3);
        }
      };
      // Two sweeps: a giant crescent of the blade runs across the floor, then across the sky.
      const sweep = (delay: number, y: number, from: number) =>
        later(scene, delay, () => {
          cam.shake(500, 0.006);
          scene.tweens.add({ targets: giant.scythe, angle: giant.scythe.angle + f * 150, duration: 300, ease: 'Quad.In' });
          const blade = scene.add
            .image(from, y, 'slashMoon')
            .setTint(0xc2c3c7)
            .setScale(f * 5, 7)
            .setAlpha(0.9)
            .setDepth(13);
          const edge = scene.add
            .image(from, y, 'slashMoon')
            .setTint(0x29adff)
            .setScale(f * 5.6, 7.6)
            .setAlpha(0.35)
            .setDepth(12);
          const to = f > 0 ? W + 40 : -40;
          scene.tweens.add({
            targets: [blade, edge],
            x: to,
            duration: 520,
            ease: 'Sine.In',
            onComplete: () => (blade.destroy(), edge.destroy()),
          });
          for (const t of world.targets(p.x, p.y)) {
            if (Math.abs(t.y - y) > 46) continue;
            const k = Phaser.Math.Clamp((t.x - from) / (to - from), 0, 1);
            later(scene, k * 520, () => reaped(t, 1.2));
          }
        });
      sweep(750, FLOOR_Y - 22, gx);
      sweep(1400, 60, gx);
      // The final cut: the scythe raised, then brought down through everything.
      later(scene, 2100, () => {
        scene.tweens.add({ targets: giant.scythe, angle: -f * 120, duration: 260, ease: 'Quad.Out' });
      });
      later(scene, 2420, () => {
        scene.tweens.add({ targets: giant.scythe, angle: f * 80, duration: 120, ease: 'Quad.In' });
        cam.flash(160, 41, 173, 255);
        cam.shake(400, 0.025);
        floatText(scene, Phaser.Math.Clamp(p.x, 30, W - 30), p.y - 34, 'PANEN!', '#7fe6ff');
        for (const t of world.targets(p.x, p.y)) {
          bladeLine(scene, t.x - 14, t.y - 20, t.x + 14, t.y + 14, 0x29adff, 120);
          reaped(t, 1.5);
        }
        for (const c of candles.values()) c.destroy();
      });
      later(scene, 2800, () => {
        smoke2(scene, gx, FLOOR_Y - 30, 18);
        scene.tweens.add({
          targets: [giant.body, giant.scythe],
          alpha: 0,
          duration: 350,
          onComplete: () => (giant.body.destroy(), giant.scythe.destroy()),
        });
        scene.tweens.add({ targets: night, fillAlpha: 0, duration: 400, onComplete: () => night.destroy() });
      });
    },
    // Hourglass of the Appointed Hour: the Reaper keeps every life's hourglass. He lifts his great glass and turns it
    // over; a thread of soul-light runs from it to each enemy and hangs that enemy's own little hourglass above its
    // head, and their time slows while the blue sand runs out. When the last grain falls the glasses shatter, and a
    // phantom scythe rises behind each of them and reaps it; lives nearly spent are cut twice as deep.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.lock(500);
      p.invuln(500);
      p.setVelocityX(0);
      // An hourglass `s` times its base 10x16 size, with `left` (0..1) of its sand still on top.
      const glass = (g: Phaser.GameObjects.Graphics, s: number, left: number) => {
        g.clear();
        const [w, h] = [5 * s, 8 * s];
        // Glass bulbs: a pale outline over a faint fill.
        g.fillStyle(0xc2f0ff, 0.15).fillTriangle(-w, -h, w, -h, 0, 0).fillTriangle(-w, h, w, h, 0, 0);
        g.lineStyle(1, 0xc2f0ff, 0.8).strokeTriangle(-w, -h, w, -h, 0, 0).strokeTriangle(-w, h, w, h, 0, 0);
        // Soul-sand: the top shrinks toward the neck, the bottom heap grows, a 1px stream between.
        if (left > 0) {
          const k = left;
          g.fillStyle(0x29adff).fillTriangle(-w * k, -h * k, w * k, -h * k, 0, 0);
          g.fillStyle(0xc2f0ff).fillRect(-w * k + 1, -h * k, Math.max(1, w * k * 0.6), 1);
          g.fillStyle(0x29adff).fillRect(-0.5, 0, 1, h);
        }
        const heap = (1 - left) * 0.8;
        g.fillStyle(0x2a4bd7).fillTriangle(-w * heap - 1, h, w * heap + 1, h, 0, h - h * heap);
        // Bone caps with a dark outline and a lit top.
        for (const y of [-h - 2, h]) {
          g.fillStyle(0x1d1d28).fillRect(-w - 2, y - 1, w * 2 + 4, 4);
          g.fillStyle(0xc2c3c7).fillRect(-w - 1, y, w * 2 + 2, 2);
          g.fillStyle(0xfff1e8).fillRect(-w - 1, y, w * 2 + 2, 1);
        }
      };
      // The great glass over his head turns over.
      const big = scene.add.graphics();
      glass(big, 2, 0);
      const bigC = scene.add
        .container(p.x, p.y - 34, [big])
        .setScale(0)
        .setDepth(13);
      scene.tweens.add({ targets: bigC, scale: 1, duration: 150, ease: 'Back.Out' });
      scene.tweens.add({
        targets: bigC,
        angle: 180,
        delay: 150,
        duration: 200,
        ease: 'Quad.InOut',
        onComplete: () => (bigC.setAngle(0), glass(big, 2, 1)),
      });
      const dusk = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x0a0a1e, 0.4)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      scene.tweens.add({ targets: dusk, alpha: 1, duration: 250 });
      const RUN = 750;
      later(scene, 350, () => {
        const foes = world.targets(p.x, p.y);
        if (!foes.length) {
          scene.tweens.add({ targets: [bigC, dusk], alpha: 0, duration: 200, onComplete: () => (bigC.destroy(), dusk.destroy()) });
          return;
        }
        ring(scene, bigC.x, bigC.y, 0x29adff, 4, 30, 300);
        const marks = foes.map((t) => {
          const thread = scene.add
            .graphics()
            .setDepth(12)
            .lineStyle(1, 0x29adff, 0.8)
            .lineBetween(bigC.x, bigC.y, t.x, t.y - 16);
          scene.tweens.add({ targets: thread, alpha: 0, duration: 300, onComplete: () => thread.destroy() });
          world.strike(t, 0.3 * power, 'skill', false, { slow: RUN + 400 });
          const g = scene.add.graphics();
          glass(g, 0.8, 1);
          const c = scene.add.container(t.x, t.y - 16, [g]).setDepth(14);
          return { t, g, c };
        });
        // The sand runs out, everywhere at once; each glass hangs over its owner.
        scene.tweens.addCounter({
          from: 1,
          to: 0,
          duration: RUN,
          onUpdate: (tw) => {
            const left = tw.getValue() ?? 0;
            glass(big, 2, left);
            for (const m of marks) {
              glass(m.g, 0.8, left);
              if (m.t.active) m.c.setPosition(m.t.x, m.t.y - 16);
            }
          },
          onComplete: () => {
            scene.cameras.main.flash(120, 41, 173, 255);
            marks.forEach(({ t, c }, i) => {
              // The glass shatters into shards.
              for (let k = 0; k < 6; k++) {
                const sh = scene.add.rectangle(c.x, c.y, 1, 2, k % 2 ? 0xc2f0ff : 0xc2c3c7).setDepth(14);
                scene.tweens.add({
                  targets: sh,
                  x: c.x + Phaser.Math.Between(-12, 12),
                  y: c.y + Phaser.Math.Between(4, 18),
                  angle: 360,
                  alpha: 0,
                  duration: 380,
                  onComplete: () => sh.destroy(),
                });
              }
              c.destroy();
              later(scene, i * 50, () => reap(t));
            });
            scene.tweens.add({
              targets: [bigC, dusk],
              alpha: 0,
              delay: 300,
              duration: 300,
              onComplete: () => (bigC.destroy(), dusk.destroy()),
            });
          },
        });
      });
      // A phantom scythe rises behind t and sweeps through it.
      const reap = (t: Phaser.GameObjects.Sprite) => {
        if (!t.active) return;
        const s = t.x >= p.x ? 1 : -1;
        const g = scene.add.graphics();
        // The snath rises from the grip (the pivot, at 0, 0) to the heel of the blade; the crescent curls forward off
        // its top and hooks down to a point, its sharp inner edge facing the swing.
        g.lineStyle(4, 0x1d1d28).lineBetween(0, 2, 0, -37);
        g.lineStyle(2, 0x5f574f).lineBetween(0, 2, 0, -36);
        g.lineStyle(1, 0x83769c).lineBetween(-1, 1, -1, -35);
        const outer = (a: number) => new Phaser.Math.Vector2(30 * a, -37 - 8 * Math.sin(Math.PI * a) + 10 * a * a);
        const inner = (a: number) => new Phaser.Math.Vector2(30 * a, -32 - 2 * Math.sin(Math.PI * a) + 5 * a * a);
        const steps = Array.from({ length: 13 }, (_, i) => i / 12);
        const blade = [...steps.map(outer), ...[...steps].reverse().map(inner)];
        // Spectral glow, steel body, a darker spine along the back, the dark outline, and a white cutting edge.
        g.lineStyle(4, 0x29adff, 0.35).strokePoints(blade, true);
        g.fillStyle(0xc2c3c7).fillPoints(blade, true);
        g.fillStyle(0x5f574f).fillPoints(
          [...steps.map((a) => outer(a).add(new Phaser.Math.Vector2(0, 3))), ...[...steps].reverse().map(outer)],
          true,
        );
        g.lineStyle(1, 0x1d1d28).strokePoints(blade, true);
        g.lineStyle(1, 0xfff1e8).strokePoints(steps.map(inner), false);
        const scythe = scene.add
          .container(t.x - s * 14, t.y + 34, [g])
          .setScale(s * 1.15, 1.15)
          .setAngle(-s * 55)
          .setAlpha(0)
          .setDepth(13);
        scene.tweens.add({ targets: scythe, alpha: 0.95, duration: 90 });
        scene.tweens.add({
          targets: scythe,
          angle: s * 50,
          delay: 90,
          duration: 150,
          ease: 'Quad.In',
          onComplete: () => scene.tweens.add({ targets: scythe, alpha: 0, duration: 200, onComplete: () => scythe.destroy() }),
        });
        later(scene, 190, () => {
          if (!t.active) return;
          const l = t as Living;
          const weak = l.hp / l.maxHp < 0.4;
          cutMark(scene, t.x, t.y, 0x29adff, weak ? 40 : 30, s * 0.5);
          sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff], weak ? 14 : 8, 24);
          scene.cameras.main.shake(70, 0.008);
          world.strike(t, (weak ? 4.8 : 2.4) * power, 'skill', weak);
          // A soul-light wisp rises out of the cut and drifts up into the dark.
          const w = scene.add.rectangle(t.x, t.y, 2, 2, 0x29adff).setDepth(14);
          scene.tweens.add({
            targets: w,
            y: t.y - 30,
            x: t.x + Phaser.Math.Between(-8, 8),
            alpha: 0,
            duration: 600,
            onComplete: () => w.destroy(),
          });
        });
      };
    },
  },

  senapan: {
    // Injakan Tempur: the boot comes down on a grenade he dropped: a blast at his feet, spent shells everywhere.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      explosion(scene, x, gy - 4, 20);
      for (let i = 0; i < 4; i++) {
        const sh = scene.add.rectangle(x, gy - 4, 1, 2, 0xffa300).setDepth(13);
        scene.tweens.add({
          targets: sh,
          x: x + Phaser.Math.Between(-20, 20),
          y: gy - Phaser.Math.Between(6, 16),
          angle: 360,
          alpha: 0,
          duration: 400,
          onComplete: () => sh.destroy(),
        });
      }
      world.area(x, gy - 6, 28, 0.7 * power, 200, 'proc');
    },
    // The shotgun pull (step 2): a fat muzzle blast and a shell ejected behind.
    onSwing: ({ p, scene }, _m, step) => {
      if (step !== 2) return;
      const f = p.facing;
      const fl = scene.add.circle(p.x + f * 12, p.y + 1, 5, 0xffec27).setDepth(13);
      scene.tweens.add({ targets: fl, radius: 1, alpha: 0, duration: 90, onComplete: () => fl.destroy() });
      smokePuff(scene, p.x + f * 14, p.y);
      const shell = scene.add.rectangle(p.x, p.y - 2, 2, 3, 0xff004d).setDepth(13);
      scene.tweens.add({
        targets: shell,
        x: p.x - f * 12,
        y: FLOOR_Y,
        angle: 360,
        duration: 380,
        ease: 'Quad.In',
        onComplete: () => shell.destroy(),
      });
      scene.cameras.main.shake(60, 0.004);
    },
    // Anti-materiel shot: he drops to one knee and shoulders the long rifle. A red laser and a scope reticle settle
    // on the biggest threat on the field (the most HP left, flyers and bosses too), tightening as he steadies his
    // breath. The shot cracks along that line across the whole arena: a white-hot tracer, everything on it punched
    // through, the target hardest, and the recoil shoves him back a step.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y) as (Phaser.GameObjects.Sprite & { hp: number })[];
      if (!foes.length) return false;
      const t = foes.reduce((b, o) => (o.hp > b.hp ? o : b));
      p.facing = t.x >= p.x ? 1 : -1;
      p.lock(650);
      p.setVelocityX(0);
      const aimLine = scene.add.graphics().setDepth(12);
      const reticle = scene.add.graphics().setDepth(14);
      const muzzle = () => ({ x: p.x + p.facing * 10, y: p.y });
      let r = 18;
      const track = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          aimLine.clear();
          reticle.clear();
          if (!t.active) return;
          const m = muzzle();
          aimLine.lineStyle(1, 0xff004d, 0.7).lineBetween(m.x, m.y, t.x, t.y);
          r = Math.max(6, r - 0.5);
          reticle.lineStyle(1, 0xff004d).strokeCircle(t.x, t.y, r);
          reticle.lineBetween(t.x - r - 4, t.y, t.x - r + 3, t.y).lineBetween(t.x + r - 3, t.y, t.x + r + 4, t.y);
          reticle.lineBetween(t.x, t.y - r - 4, t.x, t.y - r + 3).lineBetween(t.x, t.y + r - 3, t.x, t.y + r + 4);
          reticle.fillStyle(0xff004d).fillRect(t.x, t.y, 1, 1);
        },
      });
      later(scene, 480, () => {
        track.remove();
        aimLine.destroy();
        reticle.destroy();
        const m = muzzle();
        const tx = t.active ? t.x : m.x + p.facing * 100;
        const ty = t.active ? t.y : m.y;
        const a = Phaser.Math.Angle.Between(m.x, m.y, tx, ty);
        const far = { x: m.x + Math.cos(a) * 400, y: m.y + Math.sin(a) * 400 };
        // Tracer and muzzle blast.
        bladeLine(scene, m.x, m.y, far.x, far.y, 0xffec27, 90);
        const blast = scene.add.circle(m.x, m.y, 7, 0xfff1e8).setDepth(14);
        scene.tweens.add({ targets: blast, radius: 1, alpha: 0, duration: 120, onComplete: () => blast.destroy() });
        ring(scene, m.x, m.y, 0xffa300, 3, 22, 220, 2);
        sparks(scene, m.x, m.y, [0xffec27, 0xffa300], 10, 20);
        scene.cameras.main.shake(180, 0.016);
        p.setVelocityX(-p.facing * 140);
        const shell = scene.add.rectangle(p.x, p.y - 2, 1, 3, 0xffa300).setDepth(13);
        scene.tweens.add({
          targets: shell,
          x: p.x - p.facing * 14,
          y: FLOOR_Y,
          angle: 540,
          duration: 420,
          ease: 'Quad.In',
          onComplete: () => shell.destroy(),
        });
        // Everything on the line, in front of the barrel.
        for (const o of world.targets(m.x, m.y)) {
          const dx = o.x - m.x;
          const dy = o.y - m.y;
          const along = dx * Math.cos(a) + dy * Math.sin(a);
          const off = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
          if (along < 0 || off > 9 + o.displayHeight / 3) continue;
          later(scene, along / 6, () => {
            if (!o.active) return;
            sparks(scene, o.x, o.y, [0xfff1e8, 0xffa300], 8, 16);
            world.strike(o, (o === t ? 4 : 2) * power, 'skill', o === t, undefined, 320);
          });
        }
      });
    },
    // Badai Timah (Lead Storm): he plants his feet and hauls up a six-barrelled rotary gun. The barrels spin up with a
    // rising whine, then it roars: a solid stream of tracers that he sweeps up and down from the floor to the sky
    // across the side the enemies are on, brass pouring out behind him while the barrels glow red. The last round in
    // the belt is a rocket, sent into the thickest crowd. HABISKAN!
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const ahead = foes.filter((t) => Math.sign(t.x - p.x) === p.facing).length;
      if (ahead * 2 < foes.length) p.facing = -p.facing;
      const f = p.facing;
      const cam = scene.cameras.main;
      p.invuln(3300);
      p.lock(3100);
      p.setVelocity(0, 0);
      // The gun: a dark housing, six barrels that turn, a red-hot glow building on them.
      const gunG = scene.add.graphics();
      const barrels = scene.add.graphics();
      const heat = scene.add.rectangle(16, 0, 8, 4, 0xff004d, 0).setOrigin(0, 0.5);
      gunG.fillStyle(0x1c1c28).fillRect(-6, -4, 16, 8);
      gunG.fillStyle(0x3b3b4f).fillRect(-5, -3, 14, 6);
      gunG.fillStyle(0x5f574f).fillRect(-5, -3, 14, 1);
      gunG.fillStyle(0xffa300).fillRect(-4, 2, 4, 2);
      const gun = scene.add
        .container(p.x + f * 6, p.y + 1, [gunG, barrels, heat])
        .setScale(f, 1)
        .setDepth(12);
      let spin = 0;
      const drawBarrels = () => {
        barrels.clear();
        barrels.fillStyle(0x1c1c28).fillRect(10, -3, 14, 6);
        for (let i = 0; i < 3; i++) barrels.fillStyle((i + spin) % 3 ? 0x83769c : 0xc2c3c7).fillRect(10, -2 + i * 2, 14, 1);
        barrels.fillStyle(0x000000).fillRect(23, -3, 1, 6);
      };
      let aim = 0;
      const follow = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          gun.setPosition(p.x + f * 6, p.y + 1).setRotation(aim * f);
          spin++;
          drawBarrels();
        },
      });
      for (let i = 0; i < 8; i++) later(scene, i * 45, () => sparks(scene, p.x + f * 28, p.y, [0xc2c3c7, 0xffec27], 2, 8));
      // The stream: every 45 ms a round, the aim sweeping between the floor and high up in the air.
      const N = 48;
      const t0 = 420;
      later(scene, t0, () => cam.shake(N * 45, 0.004));
      for (let i = 0; i < N; i++)
        later(scene, t0 + i * 45, () => {
          if (!p.active) return;
          // Floor first, up into the sky and back down, twice.
          aim = 0.05 - 0.95 * (0.5 - 0.5 * Math.cos((i / N) * Math.PI * 4));
          const a = f > 0 ? aim : Math.PI - aim;
          const mx = p.x + f * 6 + Math.cos(a) * 24;
          const my = p.y + 1 + Math.sin(a) * 24;
          const fl = scene.add.circle(mx, my, 3, i % 2 ? 0xffec27 : 0xfff1e8).setDepth(13);
          scene.tweens.add({ targets: fl, radius: 1, alpha: 0, duration: 50, onComplete: () => fl.destroy() });
          heat.setFillStyle(0xff004d, Math.min(0.5, i / N));
          const shell = scene.add.rectangle(p.x, p.y - 2, 1, 2, 0xffa300).setDepth(13);
          scene.tweens.add({
            targets: shell,
            x: p.x - f * Phaser.Math.Between(4, 18),
            y: FLOOR_Y,
            angle: 360,
            duration: 360,
            ease: 'Quad.In',
            onComplete: () => shell.destroy(),
          });
          world.shot({
            x: mx,
            y: my,
            vx: Math.cos(a) * 420,
            vy: Math.sin(a) * 420,
            texture: 'bullet',
            tint: 0xffa300,
            mult: 0.35 * power,
            source: 'ult',
            knockback: 25,
          });
        });
      // The rocket.
      later(scene, t0 + N * 45 + 250, () => {
        follow.remove();
        const live = world.targets(p.x, p.y);
        const near = (t: Phaser.GameObjects.Sprite) => live.filter((o) => Phaser.Math.Distance.Between(o.x, o.y, t.x, t.y) < 50).length;
        const crowd = live.reduce<Phaser.GameObjects.Sprite | undefined>((b, t) => (!b || near(t) > near(b) ? t : b), undefined);
        const a = crowd ? Phaser.Math.Angle.Between(p.x, p.y, crowd.x, crowd.y) : f > 0 ? 0 : Math.PI;
        gun.setRotation(f > 0 ? a : a - Math.PI);
        floatText(scene, Phaser.Math.Clamp(p.x, 40, W - 40), p.y - 26, 'HABISKAN!', '#ffa300');
        const rocket = world.shot({
          x: p.x + Math.cos(a) * 20,
          y: p.y + Math.sin(a) * 20,
          vx: Math.cos(a) * 300,
          vy: Math.sin(a) * 300,
          texture: 'bullet',
          tint: 0xff004d,
          mult: 3 * power,
          source: 'ult',
          explode: 48,
        }) as Phaser.GameObjects.Image;
        rocket.setScale(2);
        let last = { x: rocket.x, y: rocket.y };
        const trail = scene.time.addEvent({
          delay: 20,
          loop: true,
          callback: () => {
            if (rocket.active) {
              last = { x: rocket.x, y: rocket.y };
              const s = scene.add.circle(rocket.x, rocket.y, 2, 0x83769c, 0.7).setDepth(11);
              scene.tweens.add({ targets: s, scale: 2.5, alpha: 0, duration: 300, onComplete: () => s.destroy() });
              return;
            }
            trail.remove();
            explosion(scene, last.x, last.y, 40);
            cam.flash(120, 255, 163, 0);
            cam.shake(300, 0.02);
          },
        });
        scene.tweens.add({ targets: gun, alpha: 0, delay: 350, duration: 250, onComplete: () => gun.destroy() });
      });
    },
    // Air strike: he pops a red smoke flare and lobs it ahead, keys the radio, and a ground-attack plane roars in low
    // from behind him. As it crosses the arena it carpet-bombs the floor, drops a heavy bomb right onto every enemy on
    // the ground, and its nose guns rake every enemy in the air with tracer bursts. Its shadow races along the floor.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const cam = scene.cameras.main;
      p.lock(300);
      p.setVelocityX(0);
      // The flare: lobbed in a short arc, then red smoke billows up from where it lands.
      const fx = Phaser.Math.Clamp(p.x + f * 40, 8, W - 8);
      const flare = scene.add.rectangle(p.x, p.y, 2, 3, 0xff004d).setDepth(12);
      const [x0, y0] = [p.x, p.y];
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 300,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          flare.setPosition(x0 + (fx - x0) * v, y0 + (FLOOR_Y - 2 - y0) * v - Math.sin(v * Math.PI) * 24).setRotation(v * 8);
        },
        onComplete: () => {
          flare.setRotation(0);
          let k = 0;
          const smoke = scene.time.addEvent({
            delay: 50,
            repeat: 30,
            callback: () => {
              const c = scene.add.circle(fx, FLOOR_Y - 3, Phaser.Math.Between(2, 3), k++ % 3 ? 0xff004d : 0xff77a8, 0.6).setDepth(11);
              scene.tweens.add({
                targets: c,
                x: fx + Phaser.Math.Between(-4, 10) * -f,
                y: FLOOR_Y - Phaser.Math.Between(26, 44),
                scale: 3,
                alpha: 0,
                duration: 900,
                onComplete: () => c.destroy(),
              });
            },
          });
          later(scene, 1600, () => (smoke.remove(), flare.destroy()));
        },
      });
      floatText(scene, p.x, p.y - 30, 'TANDAI!', '#ff004d');
      // The plane, drawn nose-right (flipped when it flies left): olive fuselage with an outline and a lit spine,
      // a swept wing, the tail fin, a glass canopy, a roundel and a blurred propeller.
      const g = scene.add.graphics();
      g.fillStyle(0x1d2b53).fillEllipse(0, 0, 38, 9).fillTriangle(-16, -1, -21, -10, -12, -1);
      g.fillStyle(0x3b5d2a).fillEllipse(0, 0, 36, 7).fillTriangle(-15, -1, -19, -8, -12, -1);
      g.fillStyle(0x008751).fillRect(-14, -3, 28, 1);
      g.fillStyle(0x1d2b53).fillTriangle(-4, 0, 8, 0, -8, 6);
      g.fillStyle(0x5f574f).fillTriangle(-3, 1, 7, 1, -7, 5);
      g.fillStyle(0x29adff).fillRect(6, -4, 5, 2);
      g.fillStyle(0xc2f0ff).fillRect(7, -4, 2, 1);
      g.fillStyle(0xfff1e8).fillCircle(-6, -1, 2);
      g.fillStyle(0xff004d).fillCircle(-6, -1, 1);
      const prop = scene.add.ellipse(19, 0, 2, 12, 0xc2c3c7, 0.6);
      const PY = 34;
      const sx = f > 0 ? -30 : W + 30;
      const plane = scene.add
        .container(sx, PY, [g, prop])
        .setScale(f * 1.3, 1.3)
        .setDepth(13);
      scene.tweens.add({ targets: prop, scaleY: 0.3, duration: 40, yoyo: true, repeat: -1 });
      const shadow = scene.add.ellipse(sx, FLOOR_Y + 1, 40, 3, 0x000000, 0.35).setDepth(3);
      const done = new Set<Phaser.GameObjects.GameObject>();
      let nextBomb = f > 0 ? 24 : W - 24;
      let first = true;
      // A bomb falls from the plane onto (tx, ty) (or follows `t` while it falls), then explodes.
      const bomb = (heavy: boolean, tx: number, t?: Phaser.GameObjects.Sprite) => {
        const b = scene.add
          .graphics()
          .setPosition(plane.x, PY + 4)
          .setDepth(12);
        b.fillStyle(0x1d2b53).fillEllipse(0, 0, heavy ? 4 : 3, heavy ? 7 : 5);
        b.fillStyle(0x5f574f).fillRect(-1, -2, 1, 3);
        b.fillStyle(0x1d2b53).fillTriangle(-2, -4, 2, -4, 0, -1);
        const [bx0, by0] = [plane.x, PY + 4];
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: heavy ? 380 : 320,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            const ex = t?.active ? t.x : tx;
            const ey = t?.active ? t.y : FLOOR_Y - 4;
            b.setPosition(bx0 + (ex - bx0) * v, by0 + (ey - by0) * v).setRotation(-f * (1 - v) * 1.2);
          },
          onComplete: () => {
            const [ex, ey] = [b.x, b.y];
            b.destroy();
            if (first) {
              first = false;
              cam.flash(100, 255, 163, 0);
            }
            cam.shake(heavy ? 160 : 90, heavy ? 0.016 : 0.008);
            explosion(scene, ex, ey, heavy ? 26 : 16);
            rocks(scene, ex, FLOOR_Y - 2, heavy ? 6 : 3);
            if (heavy) world.area(ex, ey, 26, 1.8 * power, 160, 'skill', { burn: 0.2 });
            else world.area(ex, FLOOR_Y - 8, 22, 1 * power, 90, 'skill');
          },
        });
      };
      // Nose guns: four tracer rounds at a flyer, each one a hit.
      const strafe = (t: Phaser.GameObjects.Sprite) => {
        for (let i = 0; i < 4; i++)
          later(scene, i * 55, () => {
            if (!t.active || !plane.active) return;
            const [mx, my] = [plane.x + f * 22, PY + 2];
            const tr = scene.add
              .graphics()
              .setDepth(13)
              .lineStyle(3, 0xffa300, 0.4)
              .lineBetween(mx, my, t.x, t.y)
              .lineStyle(1, 0xffec27)
              .lineBetween(mx, my, t.x, t.y);
            scene.tweens.add({ targets: tr, alpha: 0, duration: 90, onComplete: () => tr.destroy() });
            const fl = scene.add.circle(mx, my, 3, 0xffec27).setDepth(14);
            scene.tweens.add({ targets: fl, radius: 1, alpha: 0, duration: 60, onComplete: () => fl.destroy() });
            sparks(scene, t.x, t.y, [0xffec27, 0xffa300], 4, 12);
            world.strike(t, 0.6 * power, 'skill', false);
          });
      };
      later(scene, 450, () => {
        // The roar of the engine coming in.
        cam.shake(1000, 0.003);
        scene.tweens.add({
          targets: [plane, shadow],
          x: f > 0 ? W + 40 : -40,
          duration: 1100,
          onUpdate: () => {
            // Engine smoke streaming behind it.
            if (Math.random() < 0.25) {
              const s = scene.add.circle(plane.x - f * 24, PY + 1, 1.5, 0x5f574f, 0.45).setDepth(12);
              scene.tweens.add({ targets: s, y: PY - 3, scale: 2.2, alpha: 0, duration: 320, onComplete: () => s.destroy() });
            }
            // Carpet bombs, every 44px across the floor.
            if ((f > 0 && plane.x >= nextBomb) || (f < 0 && plane.x <= nextBomb)) {
              if (nextBomb > 0 && nextBomb < W) bomb(false, nextBomb);
              nextBomb += f * 44;
            }
            // Reaching each enemy: a heavy bomb on the ones on the ground, a gun burst on the ones in the air.
            for (const t of world.targets(plane.x, PY)) {
              if (done.has(t) || Math.abs(t.x - (plane.x + f * 30)) > 10) continue;
              done.add(t);
              if (t.y < FLOOR_Y - 30) strafe(t);
              else bomb(true, t.x, t);
            }
          },
          onComplete: () => (scene.tweens.killTweensOf(prop), plane.destroy(), shadow.destroy()),
        });
      });
    },
  },

  pedangTerbang: {
    // Pedang Jatuh: he lands riding his sword; four more plant themselves around him and then spring up into the sky
    // to hunt whatever flies.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      [-1.2, -1.45, -1.7, -1.95].forEach((a, i) =>
        later(scene, 80 + i * 60, () => {
          const s = world.shot({
            x: x + (i - 1.5) * 10,
            y: gy - 4,
            vx: Math.cos(a) * 220,
            vy: Math.sin(a) * 220,
            texture: 'w_pedangTerbang',
            tint: 0x9fe8ff,
            mult: 0.5 * power,
            source: 'proc',
            homing: true,
          });
          sparks(scene, (s as Phaser.GameObjects.Image).x, gy - 2, [0x29adff, 0xc2f0ff], 3, 8);
        }),
      );
      ring(scene, x, gy - 4, 0x29adff, 4, 24, 260, 2);
    },
    // Formasi Enam Pedang (Six-Sword Array): he flicks the sword seal and six swords leave his back, flying out to the
    // six corners of a ring around the thickest knot of enemies (in the air too). They hang there point-inward and
    // lines of qi join them into a six-pointed seal: everything inside is weighed down and drawn to its heart. One
    // sword at a time darts across the seal, cutting through the middle; then all six close on the center at once.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const near = (t: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(o.x, o.y, t.x, t.y) < 40).length;
      const c = foes.reduce((b, t) => (near(t) > near(b) ? t : b));
      // The seal widens with his realm (JALAN KULTIVASI).
      const R = 30 + 5 * ((p.getData('realm') as number | undefined) ?? 0);
      const cx = Phaser.Math.Clamp(c.x, R, W - R);
      const cy = Phaser.Math.Clamp(c.y, R + 4, FLOOR_Y - 20);
      const corner = (i: number) => {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a };
      };
      p.lock(300);
      const swords = Array.from({ length: 6 }, (_, i) => {
        const k = corner(i);
        const sw = scene.add
          .image(p.x, p.y - 6, 'w_pedangTerbang')
          .setTint(0x9fe8ff)
          .setScale(1.3)
          .setDepth(13);
        scene.tweens.add({
          targets: sw,
          x: k.x,
          y: k.y,
          rotation: k.a + Math.PI,
          delay: i * 40,
          duration: 220,
          ease: 'Quad.Out',
          onUpdate: () => {
            if (Math.random() < 0.5) {
              const d = scene.add.rectangle(sw.x, sw.y, 1, 1, 0xc2f0ff).setDepth(12);
              scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
            }
          },
        });
        return sw;
      });
      // The seal: an outer ring and two interlaced triangles of qi, slowly turning in brightness.
      const seal = scene.add.graphics().setDepth(11);
      let on = true;
      later(scene, 460, () => {
        ring(scene, cx, cy, 0x29adff, 4, R + 6, 260, 2);
        const draw = scene.time.addEvent({
          delay: 16,
          loop: true,
          callback: () => {
            if (!on) return (draw.remove(), seal.destroy());
            const glow = 0.5 + Math.sin(scene.time.now / 90) * 0.3;
            seal.clear();
            seal.fillStyle(0x29adff, 0.12).fillCircle(cx, cy, R);
            seal.lineStyle(1, 0x29adff, glow).strokeCircle(cx, cy, R + 4);
            for (const off of [0, 1]) {
              const [a, b, d] = [0, 2, 4].map((i) => corner(i + off));
              seal.lineStyle(1, 0xc2f0ff, glow).strokeTriangle(a.x, a.y, b.x, b.y, d.x, d.y);
            }
          },
        });
        for (const t of world.targets(cx, cy)) {
          if (Phaser.Math.Distance.Between(cx, cy, t.x, t.y) > R + 6) continue;
          world.afflict(t, { slow: 1600 });
        }
        world.pull(cx, cy, R + 6, 60);
      });
      // One sword at a time crosses the seal through its heart.
      for (let i = 0; i < 6; i++)
        later(scene, 560 + i * 130, () => {
          const sw = swords[i];
          const from = corner(i);
          const to = corner((i + 3) % 6);
          scene.tweens.add({ targets: sw, x: to.x, y: to.y, duration: 90, yoyo: true, ease: 'Quad.In' });
          bladeLine(scene, from.x, from.y, to.x, to.y, 0x29adff, 40);
          world.area(cx, cy, R, 0.7 * power, 30, 'skill');
        });
      // All six close in.
      later(scene, 560 + 6 * 130 + 120, () => {
        for (const sw of swords)
          scene.tweens.add({ targets: sw, x: cx, y: cy, duration: 110, ease: 'Quad.In', onComplete: () => sw.destroy() });
        later(scene, 110, () => {
          on = false;
          ring(scene, cx, cy, 0xc2f0ff, 4, R + 14, 320, 2);
          sparks(scene, cx, cy, [0x29adff, 0xc2f0ff, 0xfff1e8], 18, R + 10);
          scene.cameras.main.shake(160, 0.012);
          for (const t of world.targets(cx, cy))
            if (Phaser.Math.Distance.Between(cx, cy, t.x, t.y) <= R + 8) world.strike(t, 3 * power, 'skill', true);
        });
      });
    },
    // Heaven Sword: he raises two fingers in the sword seal and every flying sword he commands streaks in from the
    // edges of the arena, fusing above his head into one colossal blade of qi, point down. When it falls it picks the
    // column holding the most enemies (flyers too), glides over it and plunges straight through to the ground: the
    // floor cracks, a ring of qi bursts out, and the giant blade shatters back into swords (up to eight) that hunt the rest.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.lock(950);
      p.invuln(1100);
      p.setVelocity(0, 0);
      const cy = Math.max(62, p.y - 58);
      glint(scene, p.x + p.facing * 4, p.y - 8);
      // The giant sword, drawn point down around its middle: qi glow, dark outline, steel body, lit edge, a qi
      // fuller, a gold guard and the red tassel of the small swords.
      const g = scene.add.graphics();
      g.fillStyle(0x29adff, 0.25).fillRect(-9, -32, 18, 72);
      g.fillStyle(0x1d2b53).fillRect(-6, -18, 12, 46).fillTriangle(-6, 28, 6, 28, 0, 40);
      g.fillRect(-2, -32, 4, 14).fillRect(-12, -21, 24, 5);
      g.fillStyle(0xc2c3c7).fillRect(-5, -16, 10, 44).fillTriangle(-5, 28, 5, 28, 0, 38);
      g.fillStyle(0xfff1e8).fillRect(-5, -16, 2, 44);
      g.fillStyle(0x29adff).fillRect(-1, -14, 2, 38);
      g.fillStyle(0xd4a017).fillRect(-11, -20, 22, 3);
      g.fillStyle(0xffec27).fillRect(-11, -20, 22, 1).fillCircle(0, -32, 2);
      g.fillStyle(0x7a5c44).fillRect(-1, -30, 2, 9);
      g.fillStyle(0xff004d).fillRect(1, -33, 2, 6);
      g.fillStyle(0xff77a8).fillRect(3, -29, 1, 4);
      const sword = scene.add.container(p.x, cy, [g]).setScale(0.2).setAlpha(0).setDepth(13);
      // Swords stream in from the edges of the arena and vanish into it.
      for (let i = 0; i < 16; i++)
        later(scene, i * 22, () => {
          const a = Math.random() * Math.PI * 2;
          const sx = p.x + Math.cos(a) * 170;
          const sy = cy + Math.sin(a) * 100;
          const s = scene.add
            .image(sx, sy, 'w_pedangTerbang')
            .setRotation(Phaser.Math.Angle.Between(sx, sy, sword.x, sword.y))
            .setTint(i % 3 ? 0x29adff : 0xfff1e8)
            .setDepth(12);
          scene.tweens.add({ targets: s, x: sword.x, y: sword.y, duration: 260, ease: 'Quad.In', onComplete: () => s.destroy() });
        });
      scene.tweens.add({ targets: sword, scale: 1, alpha: 1, delay: 300, duration: 220, ease: 'Back.Out' });
      later(scene, 520, () => ring(scene, sword.x, sword.y, 0x29adff, 40, 6, 260, 2));
      later(scene, 640, () => {
        // Aim when it falls: the column with the most enemies in it, at any height.
        const ts = world.targets(p.x, p.y);
        const col = (x: number) => ts.filter((e) => Math.abs(e.x - x) < 20).length;
        const x = ts.length ? Phaser.Math.Clamp(ts.reduce((b, e) => (col(e.x) > col(b.x) ? e : b)).x, 12, W - 12) : sword.x;
        scene.tweens.add({
          targets: sword,
          x,
          y: 44,
          duration: 150,
          ease: 'Sine.Out',
          onComplete: () => {
            const trail = [
              scene.add.rectangle(x, FLOOR_Y, 22, FLOOR_Y - 20, 0x29adff, 0.3),
              scene.add.rectangle(x, FLOOR_Y, 2, FLOOR_Y - 20, 0xc2f0ff),
            ];
            trail.forEach((r) => r.setOrigin(0.5, 1).setScale(1, 0).setDepth(12));
            scene.tweens.add({ targets: trail, scaleY: 1, duration: 110, ease: 'Quad.In' });
            scene.tweens.add({
              targets: trail,
              scaleX: 0,
              alpha: 0,
              delay: 200,
              duration: 260,
              onComplete: () => trail.forEach((r) => r.destroy()),
            });
            scene.tweens.add({
              targets: sword,
              y: FLOOR_Y - 36,
              duration: 110,
              ease: 'Quad.In',
              onComplete: () => {
                cam.flash(120, 41, 173, 255);
                cam.shake(260, 0.022);
                ring(scene, x, FLOOR_Y - 4, 0x29adff, 6, 60, 380, 3);
                ring(scene, x, FLOOR_Y - 4, 0xfff1e8, 4, 36, 260);
                sparks(scene, x, FLOOR_Y - 6, [0x29adff, 0xc2f0ff, 0xfff1e8], 18, 40);
                rocks(scene, x, FLOOR_Y - 2, 8);
                // The ground splits away from the blade on both sides.
                const crack = scene.add.graphics().setDepth(9);
                for (const s of [-1, 1]) {
                  let [cx, cyy] = [x, FLOOR_Y - 1];
                  for (let i = 0; i < 6; i++) {
                    const nx = cx + s * Phaser.Math.Between(5, 9);
                    const ny = FLOOR_Y - Phaser.Math.Between(0, 3);
                    crack.lineStyle(2, 0x1d2b53).lineBetween(cx, cyy, nx, ny);
                    crack.lineStyle(1, 0x29adff).lineBetween(cx, cyy - 1, nx, ny - 1);
                    [cx, cyy] = [nx, ny];
                  }
                }
                scene.tweens.add({ targets: crack, alpha: 0, delay: 600, duration: 300, onComplete: () => crack.destroy() });
                for (const t of world.targets(x, FLOOR_Y)) if (Math.abs(t.x - x) < 20) world.strike(t, 4.2 * power, 'skill', true);
                world.area(x, FLOOR_Y - 8, 40, 1 * power, 220, 'skill');
                // The blade breaks back into eight swords that fly out of the ground and hunt down the rest.
                later(scene, 230, () => {
                  scene.tweens.add({ targets: sword, alpha: 0, scaleX: 1.6, duration: 160, onComplete: () => sword.destroy() });
                  // Each is loosed straight at a different enemy (the far ones too) and runs through whatever is in its way.
                  const left = world.targets(x, FLOOR_Y - 30);
                  // More swords the higher his realm (JALAN KULTIVASI).
                  const realm = (p.getData('realm') as number | undefined) ?? 0;
                  const n = Phaser.Math.Clamp(left.length, 3 + realm, 8 + 2 * realm);
                  for (let i = 0; i < n; i++) {
                    const e = left[i % Math.max(1, left.length)];
                    const a = e ? Phaser.Math.Angle.Between(x, FLOOR_Y - 30, e.x, e.y) : -Math.PI + ((i + 0.5) / 8) * Math.PI;
                    const s = world.shot({
                      x: x + Math.cos(a) * 8,
                      y: FLOOR_Y - 30 + Math.sin(a) * 8,
                      vx: Math.cos(a) * 300,
                      vy: Math.sin(a) * 300,
                      texture: 'w_pedangTerbang',
                      tint: 0x29adff,
                      mult: 0.9 * power,
                      source: 'skill',
                      pierce: true,
                    });
                    whileAlive(scene, s, 40, () => {
                      const q = s as Phaser.GameObjects.Image;
                      const d = scene.add.rectangle(q.x, q.y, 1, 1, 0xc2f0ff).setDepth(11);
                      scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
                    });
                  }
                });
              },
            });
          },
        });
      });
    },
    // Sungai Seribu Pedang (River of a Thousand Swords): a great qi seal turns open behind him and swords pour out of
    // it, hundreds of them, into one river of steel that winds across the arena through every enemy in turn (flyers
    // too), each caught in the current and cut again and again as it streams past. Then the river blooms: every sword
    // in it flares outward at once, a last cut on everyone. BUNGA PEDANG!
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const f = p.facing;
      const cam = scene.cameras.main;
      p.invuln(3200);
      p.lock(2900);
      p.setVelocityX(0);
      // The seal behind him.
      const sx = Phaser.Math.Clamp(p.x - f * 12, 16, W - 16);
      const sy = p.y - 22;
      const seal = scene.add.graphics().setPosition(sx, sy).setDepth(9);
      seal.lineStyle(2, 0x29adff, 0.8).strokeCircle(0, 0, 16);
      seal.lineStyle(1, 0xc2f0ff).strokeCircle(0, 0, 12);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        seal.lineStyle(1, 0xc2f0ff).lineBetween(Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(a) * 16, Math.sin(a) * 16);
      }
      seal.fillStyle(0x29adff, 0.15).fillCircle(0, 0, 16);
      seal.setScale(0);
      scene.tweens.add({ targets: seal, scale: 1.4, duration: 300, ease: 'Back.Out' });
      scene.tweens.add({ targets: seal, angle: 360, duration: 2800 });
      const veil = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x0a1a33, 0)
        .setOrigin(0)
        .setDepth(8);
      scene.tweens.add({ targets: veil, fillAlpha: 0.45, duration: 300 });
      // The river's course: from the seal, through every enemy ordered along the way he faces.
      const order = [...foes].sort((a, b) => (a.x - b.x) * f);
      const pts = [new Phaser.Math.Vector2(sx, sy)];
      for (const t of order) pts.push(new Phaser.Math.Vector2(Phaser.Math.Clamp(t.x, 6, W - 6), Phaser.Math.Clamp(t.y, 14, FLOOR_Y - 6)));
      const last = pts[pts.length - 1];
      pts.push(new Phaser.Math.Vector2(Phaser.Math.Clamp(last.x + f * 40, 6, W - 6), Math.max(20, last.y - 30)));
      const path = new Phaser.Curves.Spline(pts);
      const len = path.getLength();
      const RUN = Phaser.Math.Clamp(len * 3.2, 900, 1700);
      const N = 48;
      const LAG = 0.35;
      const swords = Array.from({ length: N }, (_, i) =>
        scene.add
          .image(sx, sy, 'w_pedangTerbang')
          .setTint(i % 4 ? 0x9fe8ff : 0xfff1e8)
          .setVisible(false)
          .setDepth(13),
      );
      const t0 = 350;
      later(scene, t0, () => cam.shake(RUN, 0.004));
      scene.tweens.addCounter({
        from: 0,
        to: 1 + LAG,
        delay: t0,
        duration: RUN * (1 + LAG),
        onUpdate: (tw) => {
          const head = tw.getValue() ?? 0;
          swords.forEach((sw, i) => {
            const u = head - (i / N) * LAG;
            if (u < 0 || u > 1) return void sw.setVisible(false);
            const pt = path.getPointAt(u);
            const tan = path.getTangentAt(u);
            const wob = Math.sin(i * 1.7 + head * 20) * 5;
            sw.setVisible(true)
              .setPosition(pt.x - tan.y * wob, pt.y + tan.x * wob)
              .setRotation(Math.atan2(tan.y, tan.x));
          });
        },
      });
      // Each enemy is cut as the river runs over it: where it sits along the course decides when.
      const hit = new Map<Phaser.GameObjects.Sprite, number>();
      order.forEach((t, i) => hit.set(t, (i + 1) / (pts.length - 1)));
      for (const [t, u] of hit)
        for (let k = 0; k < 5; k++)
          later(scene, t0 + u * RUN + k * ((RUN * LAG) / 5), () => {
            if (!t.active) return;
            cutMark(scene, t.x, t.y, k % 2 ? 0x29adff : 0xc2f0ff, 20);
            world.strike(t, 0.6 * power, 'ult', false, undefined, 30);
          });
      // The bloom.
      later(scene, t0 + RUN * (1 + LAG) - 120, () => {
        cam.flash(140, 159, 232, 255);
        cam.shake(300, 0.018);
        floatText(scene, Phaser.Math.Clamp(p.x, 50, W - 50), p.y - 30, 'BUNGA PEDANG!', '#c2f0ff');
        for (let k = 0; k <= 12; k++) {
          const pt = path.getPointAt(k / 12);
          for (let j = 0; j < 4; j++) {
            const a = (j / 4) * Math.PI * 2 + k;
            const sw = scene.add.image(pt.x, pt.y, 'w_pedangTerbang').setTint(0xc2f0ff).setRotation(a).setDepth(13);
            scene.tweens.add({
              targets: sw,
              x: pt.x + Math.cos(a) * 18,
              y: pt.y + Math.sin(a) * 18,
              alpha: 0,
              duration: 320,
              ease: 'Quad.Out',
              onComplete: () => sw.destroy(),
            });
          }
        }
        for (const t of world.targets(p.x, p.y)) world.strike(t, 2.2 * power, 'ult', true);
        swords.forEach((s) => s.destroy());
        scene.tweens.add({ targets: [seal, veil], alpha: 0, duration: 400, onComplete: () => (seal.destroy(), veil.destroy()) });
      });
    },
  },

  tongkat: {
    // Meteor Kecil: the landing bursts in the element she holds now (fire, ice, lightning or stone).
    onDiveLand: ({ p, world, scene, power }, x, gy) => {
      const k = (p.getData('element') as number | undefined) ?? 0;
      const fx = [
        () => (explosion(scene, x, gy - 4, 22), { burn: 0.25 }),
        () => (sparks(scene, x, gy - 4, [0xc2f0ff, 0x29adff, 0xfff1e8], 18, 26), { freeze: 700 }),
        () => (stormArc(scene, x, 0, x, gy - 4, 220, 2, 2), { freeze: 300 }),
        () => (rocks(scene, x, gy - 2, 12), { slow: 1000 }),
      ][k % 4];
      const status = fx();
      ring(scene, x, gy - 4, [0xff004d, 0x29adff, 0xffec27, 0xab5236][k % 4], 4, 32, 280, 2);
      world.area(x, gy - 6, 34, 0.7 * power, 160, 'proc', status);
    },
    // Elemental Cycle: every cast calls the next element in turn: fire, ice, lightning, earth, and round again.
    skill: (c) => {
      const k = (c.p.getData('element') as number | undefined) ?? 0;
      c.p.setData('element', (k + 1) % ELEMENT_SPELLS.length);
      ELEMENT_SPELLS[k](c);
    },
    // Elemental Reaction: she calls two elements at once, the one her cycle is on and the one after it. Two orbs leave
    // the staff and spiral around each other on their way to the thickest knot of enemies (in the air or not),
    // tightening as they go, and collide on it. What the collision makes depends on the pair:
    //   fire + ice = STEAM: a scalding cloud billows out and keeps burning whoever stays in it;
    //   ice + lightning = CRYSTAL: a great ice crystal grows, lightning charges it and it shatters, bolts arcing on;
    //   lightning + earth = PLASMA: a ball of plasma hurls bolts into the floor, which throws up spires of rock;
    //   earth + fire = MAGMA: a molten boulder bursts, a lava pool spreads on the floor and geysers erupt from it.
    // Her cycle does not move: the fusion only borrows the elements.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const k = (p.getData('element') as number | undefined) ?? 0;
      const ELEM = [0xff004d, 0x29adff, 0xffec27, 0x00e436];
      const PALE = [0xffa300, 0xc2f0ff, 0xfff1e8, 0xb4f080];
      const pair = [k, (k + 1) % 4];
      const R = 52;
      p.lock(550);
      p.setVelocityX(0);
      // The thickest knot of enemies, wherever it is; the orbs follow it as it moves.
      const near = (e: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < R).length;
      const mark = foes.reduce((b, e) => (near(e) > near(b) ? e : b));
      const x0 = p.x + p.facing * 10;
      const y0 = p.y - 6;
      let [tx, ty] = [mark.x, mark.y];
      // A rune flares under the staff in both colors.
      for (const [i, e] of pair.entries()) ring(scene, x0, y0, ELEM[e], 4, 18 + i * 6, 300, 2);
      const orbs = pair.map((e) => {
        const glow = scene.add.circle(x0, y0, 7, ELEM[e], 0.35);
        const core = scene.add.circle(x0, y0, 4, ELEM[e]).setStrokeStyle(1, 0xfff1e8);
        const spot = scene.add.circle(x0 - 1, y0 - 1, 1.5, PALE[e]);
        return { e, parts: [glow, core, spot].map((o) => o.setDepth(13)) };
      });
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 480,
        ease: 'Sine.In',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          if (mark.active) [tx, ty] = [mark.x, mark.y];
          const [bx, by] = bez(x0, y0, (x0 + tx) / 2, Math.min(y0, ty) - 40, tx, ty, t);
          const a = Phaser.Math.Angle.Between(x0, y0, tx, ty) + Math.PI / 2;
          orbs.forEach(({ e, parts }, i) => {
            // Each one turns around the other, the spiral tightening to nothing at the target.
            const off = Math.sin(t * Math.PI * 5 + i * Math.PI) * 12 * (1 - t);
            const [ox, oy] = [bx + Math.cos(a) * off, by + Math.sin(a) * off];
            parts.forEach((o, j) => o.setPosition(ox - (j === 2 ? 1 : 0), oy - (j === 2 ? 1 : 0)));
            if (Math.random() < 0.6) {
              const d = scene.add.rectangle(ox, oy, 2, 2, Math.random() < 0.5 ? ELEM[e] : PALE[e]).setDepth(12);
              scene.tweens.add({ targets: d, y: oy + 4, alpha: 0, duration: 260, onComplete: () => d.destroy() });
            }
          });
        },
        onComplete: () => {
          orbs.forEach(({ parts }) => parts.forEach((o) => o.destroy()));
          const [x, y] = [tx, Math.min(ty, FLOOR_Y - 16)];
          const [a, b] = pair.map((e) => ELEM[e]);
          cam.flash(110, (a >> 16) & 0xff, (a >> 8) & 0xff, a & 0xff);
          cam.shake(240, 0.02);
          ring(scene, x, y, a, 6, R + 10, 360, 3);
          ring(scene, x, y, b, 4, R, 320, 2);
          sparks(scene, x, y, [a, b, 0xfff1e8], 18, R);
          floatText(scene, Phaser.Math.Clamp(x, 30, W - 30), Math.max(34, y - R), ['UAP!', 'KRISTAL!', 'PLASMA!', 'MAGMA!'][k], '#fff1e8');
          const inside = (rad: number) => world.targets(x, y).filter((t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) <= rad);
          // What the reaction throws off: a bolt of either element streaks at each enemy outside the blast, chasing
          // where it is now, and strikes on arrival (so a charging enemy cannot dodge it).
          later(scene, 260, () =>
            world
              .targets(x, y)
              .filter((t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) > R)
              .slice(0, 8)
              .forEach((t, i) => {
                const e = pair[i % 2];
                const glow = scene.add.circle(x, y, 5, ELEM[e], 0.35).setDepth(13);
                const core = scene.add.circle(x, y, 3, ELEM[e]).setStrokeStyle(1, PALE[e]).setDepth(13);
                scene.tweens.addCounter({
                  from: 0,
                  to: 1,
                  delay: i * 40,
                  duration: 220,
                  ease: 'Quad.In',
                  onUpdate: (tw) => {
                    const v = tw.getValue() ?? 0;
                    const bx = x + (t.x - x) * v;
                    const by = y + (t.y - y) * v - Math.sin(v * Math.PI) * 18;
                    glow.setPosition(bx, by);
                    core.setPosition(bx, by);
                    if (Math.random() < 0.5) {
                      const d = scene.add.rectangle(bx, by, 2, 2, PALE[e]).setDepth(12);
                      scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
                    }
                  },
                  onComplete: () => {
                    glow.destroy();
                    core.destroy();
                    if (!t.active) return;
                    sparks(scene, t.x, t.y, [ELEM[e], PALE[e], 0xfff1e8], 7, 14);
                    world.strike(t, 0.8 * power, 'skill', false, [{ burn: 0.3 }, { freeze: 600 }, { freeze: 300 }, { slow: 1200 }][e]);
                  },
                });
              }),
          );
          if (k === 0) {
            // STEAM: puffs of scalding cloud swell outward, each with a darker rim, and it keeps scalding.
            for (let i = 0; i < 14; i++) {
              const an = (i / 14) * Math.PI * 2;
              const d = Phaser.Math.Between(6, R - 10);
              const r = Phaser.Math.Between(7, 12);
              const puff = scene.add
                .circle(x, y, r, i % 3 ? 0xfff1e8 : 0xc2c3c7, 0.75)
                .setStrokeStyle(1, 0x83769c, 0.8)
                .setScale(0.2)
                .setDepth(12);
              scene.tweens.add({
                targets: puff,
                x: x + Math.cos(an) * d,
                y: y + Math.sin(an) * d * (Math.sin(an) > 0 ? 0.3 : 0.8),
                scale: 1,
                duration: 260,
                ease: 'Quad.Out',
              });
              scene.tweens.add({
                targets: puff,
                y: '-=16',
                alpha: 0,
                scale: 1.4,
                delay: 500 + i * 20,
                duration: 600,
                onComplete: () => puff.destroy(),
              });
            }
            for (let i = 0; i < 12; i++)
              later(scene, i * 40, () => sparks(scene, x + Phaser.Math.Between(-R, R), y, [0x29adff, 0xffa300], 2, 10));
            for (const t of inside(R)) world.strike(t, 2.2 * power, 'skill', true, { burn: 0.4, slow: 1500 });
            for (const d of [350, 700]) later(scene, d, () => world.area(x, y, R - 6, 0.5 * power, 0, 'skill', { burn: 0.4 }));
          } else if (k === 1) {
            // CRYSTAL: a hexagonal ice crystal grows over the spot, flickers with lightning, then shatters.
            const hex = (s: number) =>
              Array.from(
                { length: 6 },
                (_, i) => new Phaser.Math.Vector2(Math.cos((i * Math.PI) / 3) * s * 0.6, Math.sin((i * Math.PI) / 3) * s),
              );
            const cg = scene.add.graphics();
            cg.fillStyle(0x1d2b53).fillPoints(hex(26), true);
            cg.fillStyle(0x29adff).fillPoints(hex(23), true);
            cg.fillStyle(0xc2f0ff).fillPoints(hex(14), true);
            cg.fillStyle(0xfff1e8).fillRect(-6, -16, 2, 20);
            const crystal = scene.add.container(x, y, [cg]).setScale(0).setDepth(13);
            scene.tweens.add({ targets: crystal, scale: 1, duration: 140, ease: 'Back.Out' });
            for (const t of inside(R)) world.strike(t, 1.2 * power, 'skill', false, { freeze: 1400 });
            later(scene, 160, () => {
              for (let i = 0; i < 3; i++) bolt(scene, x + Phaser.Math.Between(-12, 12), y - 24, x + Phaser.Math.Between(-12, 12), y + 24);
            });
            later(scene, 320, () => {
              crystal.destroy();
              cam.shake(160, 0.016);
              for (let i = 0; i < 14; i++) {
                const an = (i / 14) * Math.PI * 2;
                const sh = scene.add.image(x, y, 'iceshard').setRotation(an).setDepth(13);
                scene.tweens.add({
                  targets: sh,
                  x: x + Math.cos(an) * R * 1.3,
                  y: y + Math.sin(an) * R * 1.3,
                  alpha: 0,
                  duration: 340,
                  onComplete: () => sh.destroy(),
                });
              }
              for (const t of inside(R)) world.strike(t, 1.8 * power, 'skill', true, { freeze: 900 });
              // The charge leaps on to enemies further out.
              world
                .targets(x, y)
                .filter((t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) > R)
                .slice(0, 3)
                .forEach((t, i) =>
                  later(scene, i * 60, () => {
                    if (!t.active) return;
                    bolt(scene, x, y, t.x, t.y, 0x29adff);
                    world.strike(t, 1 * power, 'skill', false, { freeze: 500 });
                  }),
                );
            });
          } else if (k === 2) {
            // PLASMA: a crackling sphere hangs there, spitting bolts into the floor; spires of rock burst up where they
            // land, and into anything flying nearby.
            const pg = scene.add.graphics();
            pg.fillStyle(0x008751, 0.6).fillCircle(0, 0, 14);
            pg.fillStyle(0xffec27).fillCircle(0, 0, 10);
            pg.fillStyle(0xb4f080).fillCircle(-2, -2, 6);
            pg.fillStyle(0xfff1e8).fillCircle(-3, -3, 2);
            const ball = scene.add.container(x, y, [pg]).setScale(0).setDepth(13);
            scene.tweens.add({ targets: ball, scale: 1, duration: 120, ease: 'Back.Out' });
            scene.tweens.add({ targets: ball, scale: 1.15, delay: 120, duration: 70, yoyo: true, repeat: 3 });
            for (const t of inside(R)) world.strike(t, 1.4 * power, 'skill', false, { freeze: 300 });
            for (let i = 0; i < 6; i++)
              later(scene, 60 + i * 60, () => {
                const sx = Phaser.Math.Clamp(x + (i - 2.5) * 18 + Phaser.Math.Between(-4, 4), 4, W - 4);
                bolt(scene, x, y, sx, FLOOR_Y, i % 2 ? 0xffec27 : 0x00e436);
                const h = Phaser.Math.Between(16, 26);
                const spire = scene.add
                  .triangle(sx, FLOOR_Y, -5, 0, 0, -h, 5, 0, i % 2 ? 0xab5236 : 0x5f574f)
                  .setOrigin(0)
                  .setStrokeStyle(1, 0x3b2418)
                  .setScale(1, 0)
                  .setDepth(9);
                scene.tweens.add({ targets: spire, scaleY: 1, duration: 90, yoyo: true, hold: 450, onComplete: () => spire.destroy() });
                rocks(scene, sx, FLOOR_Y, 2);
                cam.shake(60, 0.006);
                for (const t of world.targets(sx, FLOOR_Y))
                  if (Math.abs(t.x - sx) < 12 && t.y > FLOOR_Y - 34) world.strike(t, 0.5 * power, 'skill', false, { slow: 1200 });
              });
            later(scene, 420, () => {
              scene.tweens.add({ targets: ball, scale: 2, alpha: 0, duration: 160, onComplete: () => ball.destroy() });
              for (const t of inside(R + 16)) {
                bolt(scene, x, y, t.x, t.y, 0xffec27);
                world.strike(t, 1.8 * power, 'skill', true, { slow: 1500 });
              }
            });
          } else {
            // MAGMA: the molten boulder bursts; a pool of lava spreads over the floor below and geysers erupt from it,
            // flinging blobs of lava up into the air.
            explosion(scene, x, y, 22);
            for (const t of inside(R)) world.strike(t, 2 * power, 'skill', true, { burn: 0.5, slow: 1000 });
            const pool = scene.add
              .container(Phaser.Math.Clamp(x, 20, W - 20), FLOOR_Y)
              .setScale(0, 1)
              .setDepth(9);
            pool.add([
              scene.add.ellipse(0, 0, R * 2 + 6, 9, 0x7a2230),
              scene.add.ellipse(0, -1, R * 2, 6, 0xff004d),
              scene.add.ellipse(0, -1, R * 1.4, 3, 0xffa300),
              scene.add.ellipse(-R / 3, -2, R / 2, 1, 0xffec27),
            ]);
            scene.tweens.add({ targets: pool, scaleX: 1, duration: 200, ease: 'Quad.Out' });
            scene.tweens.add({ targets: pool, alpha: 0, scaleY: 0.3, delay: 1000, duration: 400, onComplete: () => pool.destroy() });
            for (let i = 0; i < 5; i++)
              later(scene, 120 + i * 90, () => {
                const gx = pool.x + Phaser.Math.Between(-R + 8, R - 8);
                flameTongue(scene, gx, FLOOR_Y, Phaser.Math.Between(30, 46), 500, FIRE);
                const blob = scene.add
                  .circle(gx, FLOOR_Y - 10, 3, 0xff004d)
                  .setStrokeStyle(1, 0x7a2230)
                  .setDepth(13);
                const dx = Phaser.Math.Between(-30, 30);
                scene.tweens.add({
                  targets: blob,
                  x: gx + dx / 2,
                  y: FLOOR_Y - Phaser.Math.Between(40, 70),
                  duration: 280,
                  ease: 'Quad.Out',
                });
                scene.tweens.add({
                  targets: blob,
                  x: gx + dx,
                  y: FLOOR_Y,
                  delay: 280,
                  duration: 300,
                  ease: 'Quad.In',
                  onComplete: () => blob.destroy(),
                });
                cam.shake(60, 0.006);
                for (const t of world.targets(gx, FLOOR_Y))
                  if (Math.abs(t.x - gx) < 14 && t.y > FLOOR_Y - 50) world.strike(t, 0.5 * power, 'skill', false, { burn: 0.5 });
              });
          }
        },
      });
    },
    // Elemental Cataclysm: a vast magic circle turns in the sky with the four elements burning at its points. Each in
    // turn falls on every enemy (meteors, lightning, icicles, the earth itself), then all four beams meet at its
    // heart and a prismatic blast breaks over the field.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(4300);
      p.lock(3700);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      cam.flash(200, 192, 128, 255);
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x0b0820, 0.6)
        .setOrigin(0)
        .setDepth(2)
        .setAlpha(0);
      scene.tweens.add({ targets: sky, alpha: 1, duration: 400 });
      // The circle, seen at an angle: rings, an eight-pointed star and runes, slowly turning.
      const cx = W / 2;
      const cy = 34;
      const runes = scene.add.graphics();
      runes.lineStyle(2, 0xc080ff, 0.9).strokeCircle(0, 0, 70);
      runes.lineStyle(1, 0xfff1e8, 0.7).strokeCircle(0, 0, 58);
      const star = Array.from(
        { length: 8 },
        (_, i) => new Phaser.Math.Vector2(Math.cos((i * 3 * Math.PI) / 4) * 58, Math.sin((i * 3 * Math.PI) / 4) * 58),
      );
      runes.lineStyle(1, 0xc080ff, 0.8).strokePoints(star, true);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        runes.fillStyle(0xfff1e8, 0.8).fillRect(Math.cos(a) * 64 - 1, Math.sin(a) * 64 - 1, 2, 2);
      }
      const circle = scene.add.container(cx, cy, [runes]).setScale(0, 0).setDepth(4);
      scene.tweens.add({ targets: circle, scaleX: 1, scaleY: 0.32, duration: 500, ease: 'Back.Out' });
      scene.tweens.add({ targets: runes, angle: 360, duration: 4000 });
      const ELEMS = [0xff004d, 0xffec27, 0x29adff, 0x00e436];
      const orbs = ELEMS.map((c, i) => {
        const ox = cx + [-1, -0.35, 0.35, 1][i] * 64;
        const o = scene.add
          .circle(ox, cy + (i === 1 || i === 2 ? 14 : 4), 5, c)
          .setStrokeStyle(1, 0xfff1e8)
          .setDepth(5)
          .setScale(0);
        scene.tweens.add({ targets: o, scale: 1, delay: 300 + i * 80, duration: 200, ease: 'Back.Out' });
        return o;
      });
      const each = (fn: (t: Phaser.GameObjects.Sprite, i: number) => void) => world.targets(p.x, p.y).forEach(fn);
      // Fire: meteors from the red point onto every enemy.
      later(scene, 600, () =>
        each((t, i) =>
          later(scene, i * 60, () => {
            const { x, y } = t;
            const m = scene.add.image(orbs[0].x, orbs[0].y, 'meteor').setDepth(12);
            scene.tweens.add({
              targets: m,
              x,
              y,
              duration: 260,
              ease: 'Quad.In',
              onComplete: () => {
                m.destroy();
                explosion(scene, x, y, 16);
                if (t.active) world.strike(t, 1 * power, 'ult', false, { burn: 0.4 });
              },
            });
          }),
        ),
      );
      // Lightning: bolts from the yellow point.
      later(scene, 1350, () => {
        cam.flash(80, 255, 236, 39);
        each((t, i) =>
          later(scene, i * 50, () => {
            if (!t.active) return;
            bolt(scene, orbs[1].x, orbs[1].y, t.x, t.y);
            world.strike(t, 1 * power, 'ult', false, { freeze: 300 });
          }),
        );
        cam.shake(300, 0.012);
      });
      // Ice: icicles from the blue point, freezing everything.
      later(scene, 2050, () =>
        each((t, i) =>
          later(scene, i * 50, () => {
            const { x, y } = t;
            const ice = scene.add.image(orbs[2].x, orbs[2].y, 'iceshard').setScale(2).setDepth(12);
            ice.setRotation(Phaser.Math.Angle.Between(ice.x, ice.y, x, y));
            scene.tweens.add({
              targets: ice,
              x,
              y,
              duration: 200,
              onComplete: () => {
                ice.destroy();
                sparks(scene, x, y, [0xc2f0ff, 0xfff1e8], 8, 14);
                if (t.active) world.strike(t, 1 * power, 'ult', false, { freeze: 1200 });
              },
            });
          }),
        ),
      );
      // Earth: the floor erupts under every enemy on the ground and boulders fly at the ones in the air.
      later(scene, 2750, () => {
        cam.shake(500, 0.02);
        for (let x = 8; x < W; x += 16) {
          const h = Phaser.Math.Between(8, 18);
          const s = scene.add
            .triangle(x, FLOOR_Y, -6, 0, 0, -h, 6, 0, x % 32 ? 0xab5236 : 0x5f574f)
            .setOrigin(0)
            .setScale(1, 0)
            .setDepth(9);
          scene.tweens.add({
            targets: s,
            scaleY: 1,
            delay: Math.abs(x - p.x) * 1.5,
            duration: 90,
            yoyo: true,
            hold: 400,
            onComplete: () => s.destroy(),
          });
        }
        each((t, i) => {
          if (t.y > FLOOR_Y - 30) world.strike(t, 1 * power, 'ult', false, { slow: 1500 });
          else
            later(scene, i * 40, () =>
              hurlRock(scene, Phaser.Math.Clamp(t.x, 8, W - 8), t, () => world.strike(t, 1 * power, 'ult', false)),
            );
        });
      });
      // Prism: all four beams meet at the heart of the circle and a blast of every color breaks over the field.
      later(scene, 3450, () => {
        const beams = scene.add.graphics().setDepth(13);
        orbs.forEach((o, i) => beams.lineStyle(3, ELEMS[i]).lineBetween(o.x, o.y, cx, cy + 8));
        scene.tweens.add({ targets: beams, alpha: 0, duration: 300, onComplete: () => beams.destroy() });
      });
      later(scene, 3650, () => {
        floatText(scene, W / 2, 56, 'CATACLYSM!', '#fff1e8');
        cam.flash(300, 255, 255, 255);
        cam.shake(500, 0.035);
        ELEMS.forEach((c, i) => later(scene, i * 60, () => ring(scene, cx, FLOOR_Y - 60, c, 10, 240, 600, 3)));
        each((t) => {
          sparks(scene, t.x, t.y, ELEMS, 12, 20);
          world.strike(t, 2 * power, 'ult', true);
        });
        scene.tweens.add({
          targets: [sky, circle, ...orbs],
          alpha: 0,
          duration: 600,
          onComplete: () => [sky, circle, ...orbs].forEach((o) => o.destroy()),
        });
      });
    },
  },

  busurArkana: {
    // Bintang Jatuh: she lands in a burst of starlight and looses three arrows straight up that hunt the sky.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const g = scene.add.star(x, gy - 6, 4, 3, 14, 0xff77a8).setDepth(13);
      scene.tweens.add({ targets: g, scale: 1.6, angle: 45, alpha: 0, duration: 320, onComplete: () => g.destroy() });
      for (const a of [-1.25, -1.57, -1.9])
        world.shot({
          x,
          y: gy - 8,
          vx: Math.cos(a) * 230,
          vy: Math.sin(a) * 230,
          texture: 'panahArkana',
          mult: 0.5 * power,
          source: 'proc',
          homing: true,
        });
    },
    // The charged star-arrow (step 2): a sigil flares at the bowstring as it leaves.
    onSwing: ({ p, scene }, _m, step) => {
      if (step !== 2) return;
      const x = p.x + p.facing * 10;
      ring(scene, x, p.y, 0xff77a8, 2, 14, 220, 2);
      sparks(scene, x, p.y, [0xff77a8, 0xffec27, 0xfff1e8], 8, 12);
    },
    // Panah Prisma (Prism Arrow): an arcane sigil opens in front of her bow and light streams into it while she draws.
    // The arrow she looses is a shard of white light aimed at the nearest enemy (in the air too); it punches through
    // everything in its way, and every body it passes through splits it like a prism: three beams of colored light,
    // pink, gold and cyan, fan out of the far side and cut whatever they reach.
    skill: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      p.facing = t.x >= p.x ? 1 : -1;
      p.lock(380);
      p.setVelocityX(0);
      const sx = p.x + p.facing * 12;
      const sy = p.y;
      const sigil = scene.add.graphics().setPosition(sx, sy).setDepth(12);
      sigil.lineStyle(1, 0xff77a8).strokeCircle(0, 0, 9);
      sigil.lineStyle(1, 0xffec27).strokeTriangle(0, -9, 8, 5, -8, 5).strokeTriangle(0, 9, 8, -5, -8, -5);
      sigil.setScale(0);
      scene.tweens.add({ targets: sigil, scale: 1, angle: 120, duration: 300, ease: 'Back.Out' });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const m = scene.add
          .rectangle(sx + Math.cos(a) * 26, sy + Math.sin(a) * 26, 1, 1, [0xff77a8, 0xffec27, 0x29adff][i % 3])
          .setDepth(13);
        scene.tweens.add({ targets: m, x: sx, y: sy, delay: i * 20, duration: 220, onComplete: () => m.destroy() });
      }
      later(scene, 320, () => {
        scene.tweens.add({ targets: sigil, scale: 1.8, alpha: 0, duration: 200, onComplete: () => sigil.destroy() });
        const aimAt = t.active ? t : world.targets(p.x, p.y)[0];
        const a = aimAt ? Phaser.Math.Angle.Between(sx, sy, aimAt.x, aimAt.y) : p.facing > 0 ? 0 : Math.PI;
        scene.cameras.main.shake(100, 0.008);
        const arrow = world.shot({
          x: sx,
          y: sy,
          vx: Math.cos(a) * 340,
          vy: Math.sin(a) * 340,
          texture: 'panahArkana',
          tint: 0xfff1e8,
          mult: 1.8 * power,
          source: 'skill',
          pierce: true,
          knockback: 120,
        }) as Phaser.GameObjects.Image;
        arrow.setScale(2);
        const split = new Set<Phaser.GameObjects.GameObject>();
        whileAlive(scene, arrow, 16, (k) => {
          if (k % 2) {
            const d = scene.add
              .rectangle(arrow.x, arrow.y, 3, 1, [0xff77a8, 0xffec27, 0x29adff][k % 3])
              .setRotation(a)
              .setDepth(12);
            scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
          }
          for (const o of world.targets(arrow.x, arrow.y)) {
            if (split.has(o) || Phaser.Math.Distance.Between(o.x, o.y, arrow.x, arrow.y) > 10) continue;
            split.add(o);
            const ox = o.x;
            const oy = o.y;
            sparks(scene, ox, oy, [0xfff1e8, 0xff77a8, 0x29adff], 8, 12);
            [-0.5, 0, 0.5].forEach((d, j) => {
              const b = a + d;
              const ex = ox + Math.cos(b) * 70;
              const ey = oy + Math.sin(b) * 70;
              bladeLine(scene, ox, oy, ex, ey, [0xff77a8, 0xffec27, 0x29adff][j], 90);
              for (const q of world.targets(ox, oy)) {
                if (q === o) continue;
                const dx = q.x - ox;
                const dy = q.y - oy;
                const along = dx * Math.cos(b) + dy * Math.sin(b);
                if (along < 0 || along > 74 || Math.abs(-dx * Math.sin(b) + dy * Math.cos(b)) > 8) continue;
                world.strike(q, 0.7 * power, 'skill', false, j === 2 ? { slow: 600 } : undefined);
              }
            });
          }
        });
      });
    },
    // Supernova: the field goes violet-dark and she raises her bow to the sky; light streams in from every star of
    // the night to one point above the arena and a newborn star swells there, pulsing, motes wheeling round it. The star sheds
    // its light at the enemies one after another (two shafts each, a white streak and a burst on impact, flyers too),
    // then falls in on itself to a pinpoint and goes supernova: one white flash and a ring of light across the whole
    // screen that strikes everything. SUPERNOVA!
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      p.invuln(3200);
      p.lock(2900);
      p.setVelocityX(0);
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x1a0a2a, 0)
        .setOrigin(0)
        .setDepth(8);
      scene.tweens.add({ targets: sky, fillAlpha: 0.6, duration: 400 });
      const sx = Phaser.Math.Clamp(p.x + p.facing * 40, 40, W - 40);
      const sy = 34;
      // Light drawn in from the whole night sky to one point: the star's birth.
      for (let i = 0; i < 24; i++) {
        const m = scene.add
          .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, FLOOR_Y - 40), 1, 1, [0xff77a8, 0xffec27, 0xc2f0ff][i % 3])
          .setDepth(13);
        scene.tweens.add({ targets: m, x: sx, y: sy, delay: i * 15, duration: 420, ease: 'Quad.In', onComplete: () => m.destroy() });
      }
      // The star: four-point rays over a round glow, layered.
      const star = scene.add.graphics().setPosition(sx, sy).setDepth(13);
      const drawStar = (r: number) => {
        star.clear();
        star.fillStyle(0xff77a8, 0.25).fillCircle(0, 0, r * 1.6);
        star.fillStyle(0xff77a8, 0.5).fillCircle(0, 0, r);
        for (const [k, c] of [
          [1.5, 0xff77a8],
          [1.1, 0xffec27],
          [0.6, 0xfff1e8],
        ] as const)
          star.fillStyle(c).fillPoints(
            Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              const q = i % 2 ? r * k * 0.25 : r * k;
              return new Phaser.Math.Vector2(Math.cos(a) * q, Math.sin(a) * q);
            }),
            true,
          );
      };
      drawStar(0);
      scene.tweens.addCounter({
        from: 0,
        to: 10,
        delay: 300,
        duration: 500,
        ease: 'Back.Out',
        onUpdate: (tw) => drawStar(tw.getValue() ?? 0),
      });
      scene.tweens.add({ targets: star, angle: 180, duration: 2600 });
      const motes = Array.from({ length: 10 }, (_, i) => scene.add.rectangle(sx, sy, 1, 1, i % 2 ? 0xffec27 : 0xc2f0ff).setDepth(13));
      const wheel = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () =>
          motes.forEach((m, i) => {
            const a = scene.time.now / 300 + (i / motes.length) * Math.PI * 2;
            m.setPosition(sx + Math.cos(a) * 20, sy + Math.sin(a) * 9);
          }),
      });
      // The shafts of light.
      const shafts = foes.flatMap((t) => [t, t]);
      const step = Math.min(160, 1500 / shafts.length);
      shafts.forEach((t, i) =>
        later(scene, 850 + i * step, () => {
          if (!t.active) return;
          bladeLine(scene, sx, sy, t.x, t.y, i % 2 ? 0xffec27 : 0xff77a8, 60);
          sparks(scene, t.x, t.y, [0xff77a8, 0xffec27, 0xfff1e8], 6, 14);
          ring(scene, t.x, t.y, 0xff77a8, 2, 14, 200);
          cam.shake(70, 0.006);
          world.strike(t, 0.9 * power, 'ult', false);
        }),
      );
      // Collapse, then the nova.
      const end = 850 + shafts.length * step + 150;
      later(scene, end, () => {
        scene.tweens.addCounter({ from: 10, to: 1, duration: 260, ease: 'Quad.In', onUpdate: (tw) => drawStar(tw.getValue() ?? 1) });
        motes.forEach((m) => scene.tweens.add({ targets: m, x: sx, y: sy, duration: 240 }));
      });
      later(scene, end + 300, () => {
        wheel.remove();
        motes.forEach((m) => m.destroy());
        cam.flash(220, 255, 241, 232);
        cam.shake(400, 0.025);
        floatText(scene, sx, sy + 20, 'SUPERNOVA!', '#ff77a8');
        ring(scene, sx, sy, 0xfff1e8, 4, 360, 600, 3);
        ring(scene, sx, sy, 0xff77a8, 4, 300, 700, 2);
        sparks(scene, sx, sy, [0xff77a8, 0xffec27, 0xfff1e8, 0x29adff], 30, 120);
        for (const t of world.targets(sx, sy)) world.strike(t, 2 * power, 'ult', true);
        star.destroy();
        scene.tweens.add({ targets: sky, fillAlpha: 0, duration: 500, onComplete: () => sky.destroy() });
      });
    },
    // Binding Constellation: she looses one arrow straight up and it bursts into a new star. From that star she
    // draws a constellation whose stars are her enemies: line by line it links each to the next, and each one it
    // touches is pinned in place by a star sigil. A bead of light runs the whole figure, striking every star as it
    // passes, and then the constellation goes nova: every sigil bursts at once.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.lock(320);
      p.invuln(320);
      p.setVelocityX(0);
      // A four-point star of radius r: dark plum rim, pink body, gold heart, white core.
      const star4 = (g: Phaser.GameObjects.Graphics, r: number) => {
        const pts = (R: number) =>
          Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
            const d = i % 2 ? R * 0.32 : R;
            return new Phaser.Math.Vector2(Math.cos(a) * d, Math.sin(a) * d);
          });
        g.fillStyle(0x7e2553).fillPoints(pts(r + 2), true);
        g.fillStyle(0xff77a8).fillPoints(pts(r), true);
        g.fillStyle(0xffec27).fillPoints(pts(r * 0.55), true);
        g.fillStyle(0xfff1e8).fillCircle(0, 0, Math.max(1, r * 0.15));
        return g;
      };
      const sx = Phaser.Math.Clamp(p.x, 20, W - 20);
      const SY = 30;
      const arrow = scene.add
        .image(p.x, p.y - 6, 'panahArkana')
        .setRotation(-Math.PI / 2)
        .setTint(0xfff1e8)
        .setDepth(13);
      scene.tweens.add({
        targets: arrow,
        x: sx,
        y: SY,
        duration: 260,
        ease: 'Quad.In',
        onUpdate: () => {
          const d = scene.add.rectangle(arrow.x, arrow.y + 4, 1, 2, 0xff77a8).setDepth(12);
          scene.tweens.add({ targets: d, alpha: 0, duration: 250, onComplete: () => d.destroy() });
        },
        onComplete: () => arrow.destroy(),
      });
      later(scene, 270, () => {
        const foes = world.targets(sx, SY);
        if (!foes.length) return;
        // The arrow becomes a star.
        const big = scene.add
          .container(sx, SY, [star4(scene.add.graphics(), 10)])
          .setScale(0)
          .setDepth(13);
        scene.tweens.add({ targets: big, scale: 1, duration: 200, ease: 'Back.Out' });
        scene.tweens.add({ targets: big, angle: 90, duration: 2400 });
        scene.cameras.main.flash(100, 255, 119, 168);
        ring(scene, sx, SY, 0xff77a8, 4, 30, 300, 2);
        sparks(scene, sx, SY, [0xffec27, 0xfff1e8, 0xff77a8], 14, 28);
        // The figure: nearest-neighbour walk from the new star through every enemy.
        const order: Phaser.GameObjects.Sprite[] = [];
        const left = [...foes];
        let [cx, cy] = [sx, SY];
        while (left.length) {
          left.sort((a, b) => Phaser.Math.Distance.Between(cx, cy, a.x, a.y) - Phaser.Math.Distance.Between(cx, cy, b.x, b.y));
          const t = left.shift()!;
          order.push(t);
          [cx, cy] = [t.x, t.y];
        }
        const last = order.map((t) => [t.x, t.y]);
        const at = (j: number): [number, number] => {
          if (j === 0) return [sx, SY];
          const t = order[j - 1];
          if (t.active) last[j - 1] = [t.x, t.y];
          return last[j - 1] as [number, number];
        };
        let shown = 0;
        let glow = 0;
        const lines = scene.add.graphics().setDepth(12);
        const sigils: Phaser.GameObjects.Container[] = [];
        const draw = scene.time.addEvent({
          delay: 16,
          loop: true,
          callback: () => {
            lines.clear();
            for (const [w, c, a] of [
              [3 + glow * 2, 0xff77a8, 0.3 + glow * 0.3],
              [1, 0xfff1e8, 0.9],
            ] as const) {
              lines.lineStyle(w, c, a);
              for (let j = 1; j <= shown; j++) lines.lineBetween(...at(j - 1), ...at(j));
            }
            sigils.forEach((s, j) => s.setPosition(...at(j + 1)));
          },
        });
        // Line by line, each enemy becomes a star of the figure, pinned where it is.
        order.forEach((t, j) =>
          later(scene, 150 + j * 70, () => {
            shown = j + 1;
            const sg = scene.add
              .container(...at(j + 1), [star4(scene.add.graphics(), 5)])
              .setScale(0)
              .setDepth(14);
            sigils.push(sg);
            scene.tweens.add({ targets: sg, scale: 1, angle: 90, duration: 160, ease: 'Back.Out' });
            if (t.active) world.strike(t, 0.5 * power, 'skill', false, { freeze: 1400 });
          }),
        );
        // A bead of light runs the whole figure, striking each star as it arrives.
        const runAt = 150 + order.length * 70 + 150;
        later(scene, runAt, () => {
          glow = 1;
          const bead = scene.add.circle(sx, SY, 3, 0xfff1e8).setDepth(15);
          order.forEach((t, j) =>
            later(scene, j * 60, () =>
              scene.tweens.addCounter({
                from: 0,
                to: 1,
                duration: 60,
                onUpdate: (tw) => {
                  const v = tw.getValue() ?? 0;
                  const [ax, ay] = at(j);
                  const [bx, by] = at(j + 1);
                  bead.setPosition(ax + (bx - ax) * v, ay + (by - ay) * v);
                },
                onComplete: () => {
                  sparks(scene, bead.x, bead.y, [0xfff1e8, 0xff77a8], 6, 14);
                  scene.tweens.add({ targets: sigils[j], scale: 1.6, duration: 60, yoyo: true });
                  if (t.active) world.strike(t, 1.2 * power, 'skill', false);
                },
              }),
            ),
          );
          // Nova: every sigil bursts together.
          later(scene, order.length * 60 + 150, () => {
            bead.destroy();
            draw.remove();
            scene.cameras.main.shake(220, 0.014);
            scene.tweens.add({ targets: lines, alpha: 0, duration: 250, onComplete: () => lines.destroy() });
            scene.tweens.add({ targets: big, scale: 2, alpha: 0, duration: 300, onComplete: () => big.destroy() });
            sigils.forEach((sg, j) => {
              const t = order[j];
              ring(scene, sg.x, sg.y, 0xff77a8, 3, 22, 280, 2);
              sparks(scene, sg.x, sg.y, [0xffec27, 0xff77a8, 0xfff1e8], 10, 22);
              scene.tweens.add({ targets: sg, scale: 3, angle: 180, alpha: 0, duration: 260, onComplete: () => sg.destroy() });
              if (t.active) world.strike(t, 1.2 * power, 'skill', true);
            });
          });
        });
      });
    },
  },

  pedangGelap: {
    // Tusukan Gerhana: the greatsword is driven into the ground and violet shadow-fire erupts in a ring around it.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const VIOLET: readonly [number, number, number] = [0x2a0a2a, 0x8a3fd1, 0xc080ff];
      for (let i = -2; i <= 2; i++)
        later(scene, Math.abs(i) * 40, () => flameTongue(scene, x + i * 11, gy, 30 - Math.abs(i) * 5, 400, VIOLET));
      world.area(x, gy - 8, 38, 0.7 * power, 160, 'proc', { slow: 900 });
    },
    // The rising cut (step 1) throws its victim up into the air, a pillar of shadow under it.
    onHit: ({ p, scene }, t) => {
      if (p.comboStep !== 1 || 'tier' in t) return;
      (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-210);
      const pillar = scene.add
        .rectangle(t.x, t.y + 4, 6, 24, 0x2a0a2a, 0.8)
        .setOrigin(0.5, 1)
        .setDepth(11);
      scene.tweens.add({ targets: pillar, scaleY: 1.6, alpha: 0, duration: 260, onComplete: () => pillar.destroy() });
      sparks(scene, t.x, t.y, [0x8a3fd1, 0x2a0a2a], 6, 12);
    },
    // The overhead finisher looses a short crescent of darkness that cuts on past the blade.
    onSwing: ({ p, world, scene }, m, step) => {
      if (step !== 2) return;
      later(scene, m.ms * 0.6, () => {
        if (!p.active) return;
        const f = p.facing;
        const wave = world.shot({
          x: p.x + f * 14,
          y: p.y,
          vx: f * 260,
          vy: 0,
          texture: 'slashMoon',
          tint: 0x8a3fd1,
          mult: 0.6,
          source: 'proc',
          pierce: true,
          knockback: 120,
        }) as Phaser.GameObjects.Image;
        wave.setScale(f * 1.2, 1.4);
        later(scene, 260, () => wave.active && wave.destroy());
      });
    },
    // Perjanjian Gelap (Dark Pact): the avenger pays in blood. He cuts his own palm (a price of his HP, waived while
    // MODE AVENGER burns) and the blood runs up into the greatsword, which swells into a giant blade of shadow raised
    // high behind him. He brings it over in one enormous arc, from the sky behind to the floor in front, cleaving
    // everything in the half-circle it sweeps (the air above him too); the blade drinks from every wound and pays the
    // price back twice over. Where it hits the floor the ground splits violet. Awakened, he hauls it back up for a
    // second, rising cut.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const awake = p.awakened;
      const cost = awake ? 0 : Math.min(p.hp - 1, Math.ceil(p.hp * 0.08));
      if (cost > 0) {
        p.hp -= cost;
        floatText(scene, p.x, p.y - 14, `-${cost}`, '#ff004d');
        for (let i = 0; i < 6; i++) {
          const d = scene.add.rectangle(p.x + f * 3, p.y, 1, 2, 0xff004d).setDepth(12);
          scene.tweens.add({
            targets: d,
            x: d.x + f * Phaser.Math.Between(2, 8),
            y: d.y - Phaser.Math.Between(6, 14),
            alpha: 0,
            duration: 300,
            onComplete: () => d.destroy(),
          });
        }
      }
      p.lock(awake ? 900 : 620);
      p.invuln(awake ? 900 : 620);
      p.setVelocityX(0);
      const L = 62;
      const px = p.x;
      const py = p.y - 4;
      const blade = shadowBlade(scene, px, py, L)
        .setScale(f, 0.3)
        .setAngle(-f * 60);
      scene.tweens.add({ targets: blade, scaleY: 1, duration: 220, ease: 'Back.Out' });
      // Shadows streaming up into it.
      for (let i = 0; i < 10; i++) {
        const s = scene.add.rectangle(px + Phaser.Math.Between(-30, 30), FLOOR_Y - 2, 2, 2, 0x8a3fd1).setDepth(12);
        scene.tweens.add({ targets: s, x: px - f * 26, y: py - 26, alpha: 0, delay: i * 18, duration: 240, onComplete: () => s.destroy() });
      }
      let drunk = 0;
      const swing = (delay: number, from: number, to: number, mult: number, done?: () => void) =>
        later(scene, delay, () => {
          const hit = new Set<Phaser.GameObjects.GameObject>();
          scene.tweens.addCounter({
            from,
            to,
            duration: 200,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const deg = tw.getValue() ?? to;
              blade.setAngle(f * deg);
              // The blade points "up" at angle 0; deg sweeps it over the top to the front.
              const a = ((deg - 90) * Math.PI) / 180;
              const tipX = px + f * Math.cos(a) * L;
              const tipY = py + Math.sin(a) * L;
              const g = scene.add.graphics().setDepth(11).lineStyle(3, 0x8a3fd1, 0.4).lineBetween(px, py, tipX, tipY);
              scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
              for (const t of world.targets(px, py)) {
                if (hit.has(t)) continue;
                const d = Phaser.Math.Distance.Between(px, py, t.x, t.y);
                const ta = Math.atan2(t.y - py, (t.x - px) * f);
                if (d > L + 8 || Math.abs(Phaser.Math.Angle.Wrap(ta - a)) > 0.35) continue;
                hit.add(t);
                cutMark(scene, t.x, t.y, 0xc080ff, 32);
                sparks(scene, t.x, t.y, [0x8a3fd1, 0xff004d], 6, 14);
                world.strike(t, mult * power, 'skill', false, undefined, 220);
                drunk++;
              }
            },
            onComplete: () => {
              scene.cameras.main.shake(160, 0.014);
              done?.();
            },
          });
        });
      // Over the top and down to the floor in front.
      swing(260, -60, 110, awake ? 3 : 2.2, () => {
        const gx = Phaser.Math.Clamp(px + f * 40, 0, W);
        const crack = scene.add.graphics().setDepth(5);
        for (const [w, c] of [
          [3, 0x2a0a2a],
          [1, 0xc080ff],
        ] as const) {
          crack
            .lineStyle(w, c)
            .beginPath()
            .moveTo(gx - 22, FLOOR_Y);
          for (let i = 1; i <= 8; i++) crack.lineTo(gx - 22 + i * 5.5, FLOOR_Y + (i % 2 ? 2 : 0));
          crack.strokePath();
        }
        scene.tweens.add({ targets: crack, alpha: 0, delay: 300, duration: 400, onComplete: () => crack.destroy() });
        ring(scene, gx, FLOOR_Y - 4, 0x8a3fd1, 4, 30, 300, 2);
        if (drunk && cost) {
          p.heal(cost * 2);
          floatText(scene, p.x, p.y - 22, `+${cost * 2}`, '#c080ff');
        }
        if (!awake) scene.tweens.add({ targets: blade, alpha: 0, scaleY: 0.3, duration: 200, onComplete: () => blade.destroy() });
      });
      if (awake)
        swing(560, 110, -60, 2, () =>
          scene.tweens.add({ targets: blade, alpha: 0, scaleY: 0.3, duration: 200, onComplete: () => blade.destroy() }),
        );
    },
    // Eclipse: night falls over the field and a pale sun hangs over the arena; a black moon slides across it until
    // only a burning violet corona is left. He raises the greatsword into the dark as the shadows of the field stream
    // up into it, then brings it down on the floor: the ground splits along the whole arena in a fissure of violet
    // hellfire, black spikes bursting up out of it as it runs, while the eclipse looses lances of darkness at
    // everything in the air. While awakened (MODE AVENGER) the eclipse is total: the fissure erupts a second time
    // and the eclipse fires a second volley.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      const twice = p.awakened;
      const f = p.facing;
      const END = twice ? 1750 : 1300;
      p.invuln(END);
      p.lock(twice ? 1200 : 1000);
      p.setVelocity(0, 0);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x0a0412, 0.65)
        .setOrigin(0)
        .setDepth(4)
        .setAlpha(0);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 300 });
      // The eclipse: corona spikes turning behind a pale sun that a black moon slides across.
      const EX = Phaser.Math.Clamp(p.x, 60, W - 60);
      const EY = 52;
      const cg = scene.add.graphics();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const l = i % 2 ? 26 : 34;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        cg.fillStyle(0x7e2553).fillTriangle(c * 14 - s * 5, s * 14 + c * 5, c * 14 + s * 5, s * 14 - c * 5, c * l, s * l);
        cg.fillStyle(0xa860f0).fillTriangle(c * 14 - s * 2, s * 14 + c * 2, c * 14 + s * 2, s * 14 - c * 2, c * (l - 6), s * (l - 6));
      }
      const corona = scene.add.container(EX, EY, [cg]).setScale(0).setDepth(4.1);
      const sun = scene.add.circle(EX, EY, 16, 0xfff1e8).setAlpha(0).setDepth(4.2);
      const rim = scene.add.circle(EX, EY, 17).setStrokeStyle(2, 0xff77a8).setAlpha(0).setDepth(4.3);
      const moon = scene.add
        .circle(EX - 40, EY - 6, 16, 0x05030a)
        .setStrokeStyle(1, 0x1d0f2e)
        .setDepth(4.4);
      scene.tweens.add({ targets: sun, alpha: 1, duration: 200 });
      scene.tweens.add({ targets: moon, x: EX, y: EY, duration: 450, ease: 'Sine.InOut' });
      scene.tweens.add({ targets: [corona, rim], scale: 1, alpha: 1, delay: 380, duration: 220, ease: 'Back.Out' });
      scene.tweens.add({ targets: cg, angle: 90, duration: END });
      const sky = [dark, corona, sun, rim, moon];
      // The greatsword raised into the dark: hilt at his hands, blade up. Black outline, iron body with a lit edge,
      // the violet fuller of the Dark Avenger and a wine-red guard.
      const bg = scene.add.graphics();
      bg.fillStyle(0x8a3fd1, 0.3).fillRect(-7, -48, 14, 48);
      bg.fillStyle(0x000000).fillRect(-6, -40, 12, 42).fillTriangle(-6, -40, 6, -40, 0, -48).fillRect(-11, -2, 22, 5).fillRect(-2, 2, 4, 8);
      bg.fillStyle(0x3b3b4f).fillRect(-5, -40, 10, 40).fillTriangle(-5, -40, 5, -40, 0, -46);
      bg.fillStyle(0x83769c).fillRect(-5, -40, 2, 40);
      bg.fillStyle(0xa860f0).fillRect(-1, -38, 2, 34);
      bg.fillStyle(0x7e2553).fillRect(-10, -1, 20, 3);
      bg.fillStyle(0xff77a8).fillRect(-10, -1, 20, 1);
      const blade = scene.add
        .container(p.x + f * 3, p.y - 4, [bg])
        .setScale(0.6)
        .setAlpha(0)
        .setDepth(13);
      scene.tweens.add({ targets: blade, scale: twice ? 1.2 : 1, alpha: 1, angle: -f * 10, duration: 200, ease: 'Back.Out' });
      // The shadows of the field stream up into the blade.
      for (let i = 0; i < 24; i++)
        later(scene, 100 + i * 18, () => {
          const sx = p.x + Phaser.Math.Between(-90, 90);
          const m = scene.add.rectangle(sx, FLOOR_Y - 2, 2, 3, i % 3 ? 0x7e2553 : 0xa860f0).setDepth(12);
          scene.tweens.add({
            targets: m,
            x: blade.x,
            y: blade.y - 30,
            alpha: 0.2,
            duration: 300,
            ease: 'Quad.In',
            onComplete: () => m.destroy(),
          });
        });
      // The fissure runs from where the blade lands to both edges of the arena; every enemy on the floor it passes is
      // struck as the spikes burst up under it.
      const x0 = Phaser.Math.Clamp(p.x + f * 14, 4, W - 4);
      const fissure = (wave: number) => {
        const hit = new Set<Phaser.GameObjects.GameObject>();
        const crack = scene.add.graphics().setDepth(9);
        scene.tweens.add({ targets: crack, alpha: 0, delay: 900, duration: 300, onComplete: () => crack.destroy() });
        rocks(scene, x0, FLOOR_Y - 2, 8);
        ring(scene, x0, FLOOR_Y - 2, 0xa860f0, 6, 50, 320, 3);
        // Enough 9px steps to reach the far wall from wherever the blade lands.
        const steps = Math.ceil(W / 9) + 1;
        for (let i = 0; i < steps; i++)
          later(scene, i * 13, () => {
            for (const s of [-1, 1]) {
              const x = x0 + s * i * 9;
              if (x < -6 || x > W + 6) continue;
              crack.lineStyle(3, 0x05030a).lineBetween(x, FLOOR_Y, x + s * 9, FLOOR_Y + (i % 2 ? -1 : 1));
              crack.lineStyle(1, 0xa860f0).lineBetween(x, FLOOR_Y - 1, x + s * 9, FLOOR_Y - 1 + (i % 2 ? -1 : 1));
              if (i % 2 === wave % 2) {
                const h = Phaser.Math.Between(14, 26) * (twice ? 1.25 : 1);
                const sg = scene.add.graphics();
                sg.fillStyle(0x1d0f2e).fillTriangle(-5, 0, 5, 0, s * 2, -h);
                sg.fillStyle(0x7e2553).fillTriangle(-3, 0, 3, 0, s * 2, -h + 4);
                sg.lineStyle(1, 0xa860f0).lineBetween(-1, -1, s * 2, -h + 5);
                const spike = scene.add.container(x, FLOOR_Y, [sg]).setScale(1, 0).setDepth(9);
                scene.tweens.add({ targets: spike, scaleY: 1, duration: 80, yoyo: true, hold: 380, onComplete: () => spike.destroy() });
              }
              if (i % 3 === 0) flameTongue(scene, x, FLOOR_Y, Phaser.Math.Between(10, 18), 420, [0x1d0f2e, 0x8a3fd1, 0xff77a8]);
              // Everything the crack front has already passed on this side (a charging enemy cannot slip between steps).
              for (const t of world.targets(x, FLOOR_Y)) {
                const behind = s * (t.x - x0) >= -9 && s * (t.x - x) <= 9;
                if (hit.has(t) || !behind || t.y < FLOOR_Y - 46) continue;
                hit.add(t);
                cutMark(scene, t.x, t.y, 0xa860f0, 28, -Math.PI / 2 + s * 0.3);
                world.strike(t, 2.4 * power, 'skill', true, { slow: 1500 });
              }
            }
          });
      };
      // The eclipse looses a lance of darkness at everything in the air.
      const lances = () => {
        const air = world.targets(EX, EY).filter((t) => t.y < FLOOR_Y - 46);
        air.forEach((t, i) =>
          later(scene, i * 50, () => {
            if (!t.active) return;
            const a = Phaser.Math.Angle.Between(EX, EY, t.x, t.y);
            const lg = scene.add.graphics();
            lg.fillStyle(0x1d0f2e).fillTriangle(0, -3, 0, 3, 22, 0).fillRect(-8, -1, 8, 2);
            lg.fillStyle(0xa860f0).fillTriangle(2, -1.5, 2, 1.5, 18, 0);
            const lance = scene.add.container(EX, EY, [lg]).setRotation(a).setScale(1.6).setDepth(13);
            scene.tweens.add({
              targets: lance,
              x: t.x,
              y: t.y,
              duration: 140,
              ease: 'Quad.In',
              onComplete: () => {
                lance.destroy();
                if (!t.active) return;
                sparks(scene, t.x, t.y, [0xa860f0, 0xff77a8, 0x1d0f2e], 8, 16);
                cutMark(scene, t.x, t.y, 0xa860f0, 26, a);
                world.strike(t, 2.4 * power, 'skill', true, { slow: 1500 });
              },
            });
          }),
        );
      };
      later(scene, 520, () =>
        scene.tweens.add({
          targets: blade,
          angle: f * 100,
          x: p.x + f * 6,
          y: FLOOR_Y - 6,
          duration: 110,
          ease: 'Quad.In',
          onComplete: () => {
            scene.tweens.add({ targets: blade, alpha: 0, delay: 200, duration: 200, onComplete: () => blade.destroy() });
            cam.flash(150, 126, 37, 83);
            cam.shake(320, 0.024);
            fissure(0);
            lances();
          },
        }),
      );
      if (twice)
        later(scene, 1080, () => {
          cam.shake(300, 0.022);
          fissure(1);
          lances();
        });
      scene.tweens.add({
        targets: sky,
        alpha: 0,
        delay: END - 250,
        duration: 350,
        onComplete: () => sky.forEach((o) => o.destroy()),
      });
    },
    ult: () => false,
  },

  enamLengan: {
    // Tinju Meteor: as he lands, six phantom fists come down out of the air around him like hammers.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      for (let k = 0; k < 6; k++) {
        const fx = x + (k - 2.5) * 12;
        const fist = scene.add
          .image(fx, gy - 50, 'w_enamLengan')
          .setTint(0xffec27)
          .setScale(1.6)
          .setRotation(Math.PI / 2)
          .setDepth(13);
        scene.tweens.add({
          targets: fist,
          y: gy - 6,
          delay: k * 35,
          duration: 100,
          ease: 'Quad.In',
          onComplete: () => {
            rocks(scene, fx, gy - 2, 2);
            fist.destroy();
            for (const t of world.targets(fx, gy))
              if (Math.abs(t.x - fx) < 8 && t.y > gy - 30) world.strike(t, 0.3 * power, 'proc', false, undefined, 60);
          },
        });
      }
    },
    // Tinju Seribu (Thousand Fists): six phantom arms tear out of Ashura's back, red-skinned and gold-banded, and all
    // of them throw at once: a storm of golden fists fanned out in three lanes, along the ground, up at a slant and
    // steeply into the air, so nothing in front of him is out of reach. Speed lines stream past. The barrage ends
    // with one giant fist driven straight ahead that blasts everything in its lane away.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(1150);
      p.setVelocityX(0);
      // The six arms fanned behind him.
      const arms = scene.add.graphics().setDepth(9);
      const drawArms = (k: number) => {
        arms.clear();
        for (let i = 0; i < 6; i++) {
          const a = (f > 0 ? Math.PI : 0) + (i - 2.5) * 0.32 * f;
          const ex = p.x + Math.cos(a) * 14 * k;
          const ey = p.y - 4 + Math.sin(a) * 12 * k;
          arms.lineStyle(4, 0x4a1a1a).lineBetween(p.x, p.y - 3, ex, ey);
          arms.lineStyle(2, 0xb3122e).lineBetween(p.x, p.y - 3, ex, ey);
          arms.fillStyle(0xffec27).fillRect(ex - 1, ey - 1, 3, 3);
        }
      };
      scene.tweens.addCounter({ from: 0, to: 1, duration: 160, ease: 'Back.Out', onUpdate: (tw) => drawArms(tw.getValue() ?? 1) });
      const lanes = [0, -0.4, -0.85];
      const N = 18;
      for (let i = 0; i < N; i++)
        later(scene, 180 + i * 45, () => {
          if (!p.active) return;
          drawArms(1 + (i % 2) * 0.15);
          const lane = lanes[i % 3] + Phaser.Math.FloatBetween(-0.08, 0.08);
          const a = f > 0 ? lane : Math.PI - lane;
          const y0 = p.y - 2 + Phaser.Math.Between(-4, 4);
          const fist = world.shot({
            x: p.x + Math.cos(a) * 8,
            y: y0,
            vx: Math.cos(a) * 330,
            vy: Math.sin(a) * 330,
            texture: 'w_enamLengan',
            tint: i % 2 ? 0xffec27 : 0xffa300,
            mult: 0.4 * power,
            source: 'skill',
            knockback: 50,
          }) as Phaser.GameObjects.Image;
          fist.setScale(1.6).setFlipX(false).setRotation(a);
          later(scene, 260, () => fist.active && fist.destroy());
          const line = scene.add
            .rectangle(p.x + Math.cos(a) * 20, y0 + Math.sin(a) * 20, 14, 1, 0xfff1e8, 0.7)
            .setRotation(a)
            .setDepth(12);
          scene.tweens.add({
            targets: line,
            x: line.x + Math.cos(a) * 30,
            y: line.y + Math.sin(a) * 30,
            alpha: 0,
            duration: 140,
            onComplete: () => line.destroy(),
          });
        });
      // The giant fist.
      later(scene, 180 + N * 45 + 120, () => {
        drawArms(1.4);
        scene.cameras.main.shake(220, 0.018);
        ring(scene, p.x + f * 12, p.y, 0xffec27, 4, 28, 260, 2);
        const big = world.shot({
          x: p.x + f * 10,
          y: p.y - 2,
          vx: f * 300,
          vy: 0,
          texture: 'w_enamLengan',
          tint: 0xffec27,
          mult: 2 * power,
          source: 'skill',
          pierce: true,
          knockback: 320,
        }) as Phaser.GameObjects.Image;
        big.setScale(3.2);
        whileAlive(scene, big, 30, () => {
          const s = scene.add.rectangle(big.x - f * 10, big.y + Phaser.Math.Between(-8, 8), 8, 1, 0xffec27, 0.8).setDepth(11);
          scene.tweens.add({ targets: s, x: s.x - f * 12, alpha: 0, duration: 160, onComplete: () => s.destroy() });
        });
        later(scene, 450, () => big.active && big.destroy());
        later(scene, 200, () => scene.tweens.add({ targets: arms, alpha: 0, duration: 200, onComplete: () => arms.destroy() }));
      });
    },
    // Grip of the Asura: he plants his feet and six phantom arms, red-skinned and gold-banded like his own, tear out
    // of his back and stretch across the arena, each reaching for its own enemy (the six nearest, flying or not).
    // The hands close (each catch fuels his fury), squeeze three times while the victims are held in the air, and then
    // all six arms haul down together and smash their catch into the floor; the arms snap back into him.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 6);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const LIFE = 1250;
      p.invuln(LIFE);
      p.lock(LIFE - 150);
      p.setVelocityX(0);
      // Six shoulders fanned across his back; each arm keeps its target and where its hand is.
      const arms = Array.from({ length: 6 }, (_, i) => {
        const t = foes[i % foes.length];
        const side = i % 2 ? 1 : -1;
        return { t, side, lift: Math.floor(i / 2), hx: p.x, hy: p.y - 4, reach: 0, held: false, slam: 0 };
      });
      const g = scene.add.graphics().setDepth(12);
      const halo = scene.add
        .circle(p.x, p.y - 4, 4)
        .setStrokeStyle(1, 0xffec27, 0.9)
        .setDepth(9);
      scene.tweens.add({ targets: halo, radius: 16, alpha: 0, duration: 400, repeat: 2 });
      const draw = () => {
        g.clear();
        for (const a of arms) {
          if (a.reach <= 0) continue;
          const sx = p.x + a.side * 3;
          const sy = p.y - 6 - a.lift * 3;
          // The elbow bows up and out, so the six arms fan like a halo before they reach.
          const mx = (sx + a.hx) / 2 + a.side * (10 + a.lift * 6);
          const my = Math.min(sy, a.hy) - 14 - a.lift * 8;
          for (const [w, c] of [
            [5, 0x7a2230],
            [3, 0xff004d],
            [1, 0xff77a8],
          ] as const) {
            g.lineStyle(w, c).beginPath().moveTo(sx, sy);
            for (let k = 1; k <= 8; k++) g.lineTo(...bez(sx, sy, mx, my, a.hx, a.hy, k / 8));
            g.strokePath();
          }
          // A gold band at the wrist and the hand: open while reaching, a fist once it has caught.
          const [wx, wy] = bez(sx, sy, mx, my, a.hx, a.hy, 0.85);
          g.fillStyle(0xd4a017).fillCircle(wx, wy, 2.5);
          g.fillStyle(0x7a2230).fillCircle(a.hx, a.hy, a.held ? 5 : 6);
          g.fillStyle(0xff004d).fillCircle(a.hx, a.hy, a.held ? 4 : 5);
          g.fillStyle(0xffec27).fillRect(a.hx - 3, a.hy - (a.held ? 2 : 6), 6, 1);
          if (!a.held)
            for (const dx of [-4, -1, 2])
              g.fillStyle(0x7a2230)
                .fillRect(a.hx + dx, a.hy - 9, 2, 4)
                .fillStyle(0xff004d)
                .fillRect(a.hx + dx, a.hy - 8, 1, 3);
        }
      };
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: LIFE,
        onUpdate: (tw) => {
          const ms = (tw.getValue() ?? 0) * LIFE;
          for (const a of arms) {
            if (a.t.active && !a.slam)
              [a.hx, a.hy] = [Phaser.Math.Linear(p.x, a.t.x, a.reach), Phaser.Math.Linear(p.y - 4, a.t.y, a.reach)];
            if (a.slam) a.hy = Phaser.Math.Linear(a.slam, FLOOR_Y - 5, Math.min(1, (ms - 880) / 90));
          }
          // Retract at the end.
          if (ms > 1050) for (const a of arms) a.reach = Math.max(0, 1 - (ms - 1050) / 200);
          draw();
        },
        onComplete: () => g.destroy(),
      });
      // Reach: the arms shoot out one after another.
      arms.forEach((a, i) =>
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          delay: i * 30,
          duration: 220,
          ease: 'Quad.Out',
          onUpdate: (tw) => (a.reach = tw.getValue() ?? 0),
        }),
      );
      // Catch.
      later(scene, 400, () => {
        cam.shake(80, 0.006);
        for (const a of arms) {
          a.held = true;
          if (!a.t.active) continue;
          sparks(scene, a.t.x, a.t.y, [0xffec27, 0xff004d], 6, 12);
          world.strike(a.t, (0.5 / Math.ceil(arms.length / foes.length)) * power, 'skill', false, { freeze: 700 });
          p.gainFury(1);
        }
      });
      // Squeeze: three crushing pulses closing on every catch.
      for (let k = 0; k < 3; k++)
        later(scene, 520 + k * 120, () => {
          for (const t of foes) {
            if (!t.active) continue;
            ring(scene, t.x, t.y, 0xffec27, 14, 3, 120, 2);
            world.strike(t, 0.4 * power, 'skill', false, { freeze: 300 });
          }
          cam.shake(60, 0.005);
        });
      // Smash: every arm hauls its catch down into the floor at once.
      later(scene, 880, () => {
        // Bosses are too heavy to haul down; the hand stays clamped on them.
        for (const a of arms) if (a.t.active && !('tier' in a.t)) a.slam = a.t.y;
        for (const t of foes) if (t.active) world.slam(t.x, t.y, 10, 600);
      });
      later(scene, 970, () => {
        cam.flash(100, 255, 236, 39);
        cam.shake(300, 0.025);
        for (const t of foes) {
          const x = t.x;
          rocks(scene, x, FLOOR_Y - 2, 6);
          ring(scene, x, FLOOR_Y - 3, 0xffa300, 4, 26, 260, 2);
          sparks(scene, x, FLOOR_Y - 4, [0xffec27, 0xffa300, 0xfff1e8], 10, 22);
          if (t.active) world.strike(t, 2.4 * power, 'skill', true);
        }
      });
    },
    // Cakra Asura (Wheel of the Asura): fury maxed, Ashura curls into the hub of a blazing golden wheel whose six
    // spokes are his six arms, fists at the rim. The wheel hits the floor and tears around the whole arena: along
    // the ground to the wall, up it, across the ceiling, down the far wall and home along the floor, grinding
    // everything in its way (flyers up by the ceiling too). Back where it started it stops dead and all six fists
    // pound the ground at once; the shock throws everything on the field. ASURA!
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const cam = scene.cameras.main;
      p.invuln(3300);
      p.lock(3100);
      p.setVelocity(0, 0);
      p.gainFury(p.stats.furyMax);
      const R = 20;
      const g = scene.add.graphics();
      g.fillStyle(0xffec27, 0.15).fillCircle(0, 0, R + 4);
      g.lineStyle(3, 0x7a5c44).strokeCircle(0, 0, R);
      g.lineStyle(1, 0xffec27).strokeCircle(0, 0, R);
      g.lineStyle(1, 0xffa300).strokeCircle(0, 0, R - 3);
      const parts: Phaser.GameObjects.GameObject[] = [g];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const arm = scene.add.graphics();
        arm.lineStyle(3, 0x7a2230).lineBetween(Math.cos(a) * 5, Math.sin(a) * 5, Math.cos(a) * (R - 2), Math.sin(a) * (R - 2));
        arm.lineStyle(1, 0xffa300).lineBetween(Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * (R - 3), Math.sin(a) * (R - 3));
        parts.push(
          arm,
          scene.add
            .image(Math.cos(a) * R, Math.sin(a) * R, 'w_enamLengan')
            .setRotation(a)
            .setTint(0xffec27),
        );
      }
      const wheel = scene.add.container(p.x, p.y, parts).setDepth(12).setScale(0);
      scene.tweens.add({ targets: wheel, scale: 1, duration: 300, ease: 'Back.Out' });
      ring(scene, p.x, p.y, 0xffec27, 4, 40, 400, 2);
      floatText(scene, p.x, p.y - 26, 'AMARAH PENUH', '#ffec27');
      // The course: floor -> wall -> ceiling -> far wall -> floor, back to where he started.
      const low = FLOOR_Y - R + 2;
      const high = 40;
      const L = R - 2;
      const Rr = W - R + 2;
      const x0 = Phaser.Math.Clamp(p.x, L, Rr);
      const near = f > 0 ? Rr : L;
      const far = f > 0 ? L : Rr;
      const pts = [
        [x0, low],
        [near, low],
        [near, high],
        [far, high],
        [far, low],
        [x0, low],
      ].map(([x, y]) => new Phaser.Math.Vector2(x, y));
      const path = new Phaser.Curves.Path(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) path.lineTo(q.x, q.y);
      const RUN = 2100;
      const last = new Map<Phaser.GameObjects.GameObject, number>();
      later(scene, 350, () => cam.shake(RUN, 0.005));
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        delay: 350,
        duration: RUN,
        ease: 'Sine.InOut',
        onUpdate: (tw) => {
          const pt = path.getPoint(tw.getValue() ?? 0);
          wheel.setPosition(pt.x, pt.y).setRotation(wheel.rotation + f * 0.3);
          p.body.reset(pt.x, pt.y);
          if (Math.random() < 0.6) {
            const s = scene.add
              .rectangle(
                pt.x + Phaser.Math.Between(-R, R),
                pt.y + Phaser.Math.Between(-R, R),
                2,
                2,
                Math.random() < 0.5 ? 0xffec27 : 0xffa300,
              )
              .setDepth(11);
            scene.tweens.add({ targets: s, alpha: 0, scale: 0, duration: 260, onComplete: () => s.destroy() });
          }
          const now = scene.time.now;
          for (const t of world.targets(pt.x, pt.y)) {
            if (Phaser.Math.Distance.Between(pt.x, pt.y, t.x, t.y) > R + 10 || now - (last.get(t) ?? 0) < 300) continue;
            last.set(t, now);
            sparks(scene, t.x, t.y, [0xffec27, 0xffa300, 0xfff1e8], 8, 16);
            cutMark(scene, t.x, t.y, 0xffa300, 22);
            world.strike(t, 0.9 * power, 'ult', false, undefined, 150);
          }
        },
      });
      // Six fists into the floor.
      later(scene, 350 + RUN + 80, () => {
        const x = wheel.x;
        scene.tweens.add({ targets: wheel, scale: 1.6, alpha: 0, duration: 300, onComplete: () => wheel.destroy() });
        cam.flash(160, 255, 236, 39);
        cam.shake(450, 0.028);
        floatText(scene, x, FLOOR_Y - 46, 'ASURA!', '#ffec27');
        for (let k = 0; k < 6; k++) {
          const fx = x + (k - 2.5) * 16;
          const fist = scene.add
            .image(fx, FLOOR_Y - 60, 'w_enamLengan')
            .setTint(0xffec27)
            .setScale(2)
            .setRotation(Math.PI / 2)
            .setDepth(13);
          scene.tweens.add({
            targets: fist,
            y: FLOOR_Y - 6,
            delay: k * 25,
            duration: 110,
            ease: 'Quad.In',
            onComplete: () => {
              rocks(scene, fx, FLOOR_Y - 2, 4);
              scene.tweens.add({ targets: fist, alpha: 0, duration: 250, onComplete: () => fist.destroy() });
            },
          });
        }
        ring(scene, x, FLOOR_Y - 4, 0xffec27, 6, 120, 500, 3);
        ring(scene, x, FLOOR_Y - 4, 0xffa300, 4, 200, 600, 2);
        for (const t of world.targets(x, FLOOR_Y)) world.strike(t, 1.8 * power, 'ult', true, undefined, 280);
      });
    },
  },

  cakarNaga: {
    // The rake (step 0): three crimson gashes torn through the air in front of him, one per stroke.
    // Terkaman Naga (the dive) pounces trailing fire.
    onSwing: ({ p, scene }, m, step) => {
      if (m === p.weapon.dive) {
        for (let i = 0; i < 6; i++) later(scene, i * 40, () => p.active && flameTongue(scene, p.x, p.y + 6, 12, 260, FIRE));
        return;
      }
      if (step !== 0) return;
      const f = p.facing;
      for (let k = 0; k < 3; k++)
        later(scene, (k * m.ms) / 3, () => {
          if (!p.active) return;
          const x = p.x + f * 14;
          for (const o of [-4, 0, 4]) {
            const g = scene.add
              .rectangle(x + o, p.y + o * 0.6, 18, 1, k === 2 ? 0xff004d : 0xb3122e)
              .setRotation(f * (k % 2 ? -0.7 : 0.7))
              .setDepth(12);
            scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.3, duration: 180, onComplete: () => g.destroy() });
          }
          sparks(scene, x, p.y, [0xff004d, 0xffa300], 3, 8);
        });
    },
    // Dragon's Fear: Antares lets a sliver of what he is show. A colossal slit-pupiled dragon's eye opens in the sky
    // above him, the air turns red, and the pressure rolls out in waves: every enemy around him freezes in terror,
    // shaking where it stands, as the heat scorches it.
    skill: ({ p, world, scene, power }) => {
      const R = 160;
      const { x, y } = p;
      p.lock(400);
      p.setVelocityX(0);
      const cam = scene.cameras.main;
      cam.flash(180, 179, 18, 46);
      const ex = Phaser.Math.Clamp(x, 40, W - 40);
      const ey = Math.max(30, y - 70);
      const eye = scene.add.container(ex, ey).setDepth(7).setScale(1, 0);
      eye.add([
        scene.add.ellipse(0, 0, 70, 22, 0x1d0f2e, 0.85).setStrokeStyle(2, 0xb3122e),
        scene.add.ellipse(0, 0, 50, 18, 0xff004d, 0.9),
        scene.add.ellipse(0, 0, 30, 18, 0xffa300, 0.9),
        scene.add.rectangle(0, 0, 4, 18, 0x000000),
        scene.add.rectangle(-8, -4, 4, 2, 0xfff1e8, 0.8),
      ]);
      scene.tweens.add({ targets: eye, scaleY: 1, duration: 180, ease: 'Back.Out' });
      scene.tweens.add({ targets: eye, scaleY: 0, alpha: 0, delay: 900, duration: 200, onComplete: () => eye.destroy() });
      // The pupil narrows as it fixes on its prey.
      scene.tweens.add({ targets: eye.list[3], scaleX: 0.4, delay: 200, duration: 250 });
      const veil = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0xb3122e, 0)
        .setOrigin(0)
        .setDepth(6);
      scene.tweens.add({ targets: veil, fillAlpha: 0.22, duration: 150, yoyo: true, hold: 600, onComplete: () => veil.destroy() });
      for (let k = 0; k < 3; k++)
        later(scene, 150 + k * 140, () => {
          ring(scene, x, y, k % 2 ? 0x1d0f2e : 0xff004d, 8, R, 450, 3);
          cam.shake(120, 0.01);
        });
      later(scene, 250, () => {
        for (const t of world.targets(x, y)) {
          if (Phaser.Math.Distance.Between(x, y, t.x, t.y) > R) continue;
          world.strike(t, 1.6 * power, 'skill', false, { freeze: 1600, burn: 0.25 });
          // Struck with terror: a red jolt flares over its head.
          const jolt = scene.add.rectangle(t.x, t.y - 12, 2, 5, 0xff004d).setDepth(14);
          scene.tweens.add({ targets: jolt, y: jolt.y - 4, alpha: 0, delay: 500, duration: 300, onComplete: () => jolt.destroy() });
        }
      });
    },
    // Breath of Destruction: the head of the Dragon of Destruction rises over his shoulder, draws in a breath of red
    // and black fire and exhales it as one roaring beam along the line that burns the most enemies, scorching
    // everything on it. Then the dragon swings its head and drags the beam across the arena onto every enemy it has
    // not burned yet, one after another.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.lock(1500);
      p.invuln(1600);
      p.setVelocity(0, 0);
      const hx = p.x - f * 4;
      const hy = p.y - 22;
      const head = scene.add
        .image(hx, hy + 20, 'dragon')
        .setFlipX(f < 0)
        .setScale(3)
        .setAlpha(0)
        .setDepth(9);
      scene.tweens.add({ targets: head, y: hy, alpha: 0.85, duration: 300, ease: 'Quad.Out' });
      const mx = hx + f * 30;
      const my = hy - 9;
      const len = 360;
      const onBeam = (a: number, t: Phaser.GameObjects.Sprite) => {
        const dx = t.x - mx;
        const dy = t.y - my;
        const along = dx * Math.cos(a) + dy * Math.sin(a);
        return along >= 0 && along <= len && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= 20;
      };
      for (let i = 0; i < 24; i++)
        later(scene, 200 + i * 12, () => {
          const r = Phaser.Math.Between(20, 40);
          const ang = Math.random() * Math.PI * 2;
          const m = scene.add.rectangle(mx + Math.cos(ang) * r, my + Math.sin(ang) * r, 2, 2, i % 3 ? 0xff004d : 0x1d0f2e).setDepth(13);
          scene.tweens.add({ targets: m, x: mx, y: my, duration: 180, onComplete: () => m.destroy() });
        });
      later(scene, 500, () => {
        // Aim when it fires: of the lines toward each enemy ahead (within 0.9 rad of straight ahead), take the one
        // that burns the most of them.
        const base = f > 0 ? 0 : Math.PI;
        const foes = world.targets(mx, my);
        let a = base;
        let best = foes.filter((t) => onBeam(base, t)).length;
        for (const t of foes) {
          const off = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(mx, my, t.x, t.y) - base);
          if (Math.abs(off) > 0.9) continue;
          const n = foes.filter((e) => onBeam(base + off, e)).length;
          if (n > best) [a, best] = [base + off, n];
        }
        const beam = (
          [
            [34, 0x1d0f2e, 0.75],
            [22, 0xb3122e, 0.9],
            [12, 0xff004d, 1],
            [4, 0xffa300, 1],
          ] as const
        ).map(([h, c, al]) => scene.add.rectangle(mx, my, len, h, c, al).setOrigin(0, 0.5).setRotation(a).setScale(0, 1).setDepth(12));
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 120 });
        const burned = new Set<Phaser.GameObjects.GameObject>();
        // The sweep: after the main burst the beam swings onto each enemy still standing outside it, nearest angle
        // first, and the fire washes over it when the beam lands; then the breath gutters out.
        later(scene, 600, () => {
          const left = world.targets(mx, my).filter((t) => !burned.has(t) && !onBeam(a, t));
          let rot = a;
          let at = 0;
          left
            .map((t) => ({ t, d: Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(mx, my, t.x, t.y) - a) }))
            .sort((u, v) => Math.abs(u.d) - Math.abs(v.d))
            .forEach(({ t }) => {
              later(scene, at, () => {
                if (!t.active) return;
                const to = rot + Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(mx, my, t.x, t.y) - rot);
                scene.tweens.add({ targets: beam, rotation: to, duration: 90, ease: 'Sine.InOut' });
                rot = to;
                later(scene, 90, () => {
                  if (!t.active) return;
                  sparks(scene, t.x, t.y, [0xff004d, 0xffa300, 0x1d0f2e], 8, 14);
                  scene.cameras.main.shake(80, 0.01);
                  world.strike(t, 1.8 * power, 'skill', true, { burn: 0.4 });
                });
              });
              at += 130;
            });
          scene.tweens.add({
            targets: beam,
            scaleY: 0,
            alpha: 0,
            delay: at + 60,
            duration: 250,
            onComplete: () => beam.forEach((b) => b.destroy()),
          });
          scene.tweens.add({ targets: head, alpha: 0, delay: at + 60, duration: 300, onComplete: () => head.destroy() });
        });
        scene.cameras.main.shake(600, 0.02);
        // Flames boil off the beam.
        for (let i = 0; i < 30; i++)
          later(scene, i * 20, () => {
            const d = Math.random() * len;
            const fl = scene.add
              .circle(mx + Math.cos(a) * d, my + Math.sin(a) * d, Phaser.Math.Between(2, 4), i % 2 ? 0xff004d : 0x1d0f2e, 0.8)
              .setDepth(13);
            scene.tweens.add({ targets: fl, y: fl.y - 10, scale: 0.2, alpha: 0, duration: 400, onComplete: () => fl.destroy() });
          });
        for (let k = 0; k < 4; k++)
          later(scene, k * 150, () => {
            for (const t of world.targets(mx, my))
              if (onBeam(a, t)) {
                burned.add(t);
                world.strike(t, 1.1 * power, 'skill', k === 3, { burn: 0.4 });
              }
          });
      });
    },
    // Monarch of Destruction: the sky turns blood-red and the colossal Dragon of Destruction rises behind the arena,
    // its eye burning. Its roar summons the dragon army: dragons sweep across the sky raining fire on every enemy,
    // until Antares himself is swallowed by a pillar of black fire and emerges as the dragon.
    ult: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.invuln(3200);
      p.lock(2400);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      cam.flash(250, 179, 18, 46);
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x2a0008, 0.65)
        .setOrigin(0)
        .setDepth(2)
        .setAlpha(0);
      scene.tweens.add({ targets: sky, alpha: 1, duration: 400 });
      // The colossal dragon behind everything: a black silhouette against the red sky, only its eye burning.
      const giant = scene.add.container(W / 2, FLOOR_Y + 60).setDepth(3);
      const eye = scene.add.circle(f * 76, -32, 5, 0xff004d);
      giant.add([
        scene.add
          .image(0, 0, 'dragon')
          .setFlipX(f < 0)
          .setScale(9)
          .setTint(0x12000a)
          .setAlpha(0.9),
        scene.add.circle(f * 76, -32, 12, 0xff004d, 0.3),
        eye,
      ]);
      scene.tweens.add({ targets: giant, y: FLOOR_Y - 40, duration: 700, ease: 'Back.Out' });
      scene.tweens.add({ targets: eye, scale: 1.5, duration: 200, yoyo: true, repeat: -1 });
      later(scene, 700, () => {
        floatText(scene, W / 2, 40, 'ROAAAR!', '#ff004d');
        cam.shake(500, 0.025);
        for (let k = 0; k < 4; k++) later(scene, k * 110, () => ring(scene, giant.x, giant.y - 30, 0xff004d, 10, 200, 500, 3));
      });
      // The dragon army: dragons sweep over the arena, each breathing fire down on an enemy as it passes.
      for (let i = 0; i < 8; i++)
        later(scene, 900 + i * 140, () => {
          const dir = i % 2 ? -1 : 1;
          const y = Phaser.Math.Between(18, 60);
          const d = scene.add
            .image(dir > 0 ? -20 : W + 20, y, 'dragon')
            .setFlipX(dir < 0)
            .setScale(1.3)
            .setDepth(13);
          scene.tweens.add({ targets: d, x: dir > 0 ? W + 20 : -20, duration: 900, onComplete: () => d.destroy() });
          later(scene, 350, () => {
            const foes = world.targets(d.x, d.y);
            const t = foes[i % Math.max(1, foes.length)];
            if (!t || !d.active) return;
            const ang = Phaser.Math.Angle.Between(d.x, d.y, t.x, t.y);
            world.shot({
              x: d.x,
              y: d.y,
              vx: Math.cos(ang) * 260,
              vy: Math.sin(ang) * 260,
              texture: 'fireball',
              mult: 1.2 * power,
              source: 'ult',
              pierce: true,
              explode: 18,
              status: { burn: 0.4 },
            });
          });
        });
      // He is swallowed by black fire and the dragon emerges.
      later(scene, 2200, () => {
        const pillar = [
          scene.add.rectangle(p.x, FLOOR_Y, 30, FLOOR_Y, 0x1d0f2e, 0.85),
          scene.add.rectangle(p.x, FLOOR_Y, 16, FLOOR_Y, 0xff004d, 0.9),
        ].map((r) => r.setOrigin(0.5, 1).setScale(0.2, 1).setDepth(11));
        scene.tweens.add({ targets: pillar, scaleX: 1.6, alpha: 0, duration: 500, onComplete: () => pillar.forEach((r) => r.destroy()) });
        cam.flash(250, 255, 0, 77);
        cam.shake(400, 0.03);
        world.area(p.x, p.y, 100, 2 * power, 260, 'ult', { burn: 0.4 });
        p.transform(7000);
        scene.tweens.add({
          targets: [sky, giant],
          alpha: 0,
          duration: 600,
          onComplete: () => (scene.tweens.killTweensOf(eye), sky.destroy(), giant.destroy()),
        });
      });
    },
  },

  gerbangBabilonia: {
    // Turun Tahta: the king steps down and three gates open in the floor around him, firing treasures up at his foes.
    onDiveLand: ({ p, world, power }, x, gy) => {
      const foes = world.targets(x, gy);
      [-16, 0, 16].forEach((dx, i) => {
        const t = foes[i % Math.max(1, foes.length)];
        const gx = x + dx;
        const a = t ? Phaser.Math.Angle.Between(gx, gy - 4, t.x, t.y) : -Math.PI / 2;
        p.gatePortal(gx, gy - 4, a);
        world.shot({
          x: gx,
          y: gy - 4,
          vx: Math.cos(a) * 260,
          vy: Math.sin(a) * 260,
          texture: Phaser.Math.RND.pick(TREASURES),
          tint: 0xfff0a0,
          mult: 0.6 * power,
          source: 'proc',
        });
      });
    },
    // Enkidu, Chains of Heaven, the one friend the King ever had: golden ripples open in the air on both sides of
    // each of the three nearest enemies (flying or not), chains shoot out of them link by link, coil around the
    // target and pull taut, binding it where it stands. Then the chains slither back into the treasury.
    skill: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y).slice(0, 3);
      if (!targets.length) return false;
      p.lock(250);
      p.setVelocityX(0);
      const BIND = 2000;
      targets.forEach((t, k) =>
        later(scene, k * 90, () => {
          if (!t.active) return;
          // Bound the moment the chains are loosed, so they land on it where it stands.
          world.strike(t, 0.8 * power, 'skill', false, { freeze: BIND });
          const [tx, ty] = [t.x, t.y];
          for (const side of [-1, 1]) {
            const gx = Phaser.Math.Clamp(tx + side * Phaser.Math.Between(30, 46), 6, W - 6);
            const gy = Phaser.Math.Clamp(ty - Phaser.Math.Between(20, 46), 10, FLOOR_Y - 10);
            const a = Phaser.Math.Angle.Between(gx, gy, tx, ty);
            p.gatePortal(gx, gy, a);
            // Links alternate face-on (a hollow ring) and edge-on (a bar), so the chain reads as interlocked.
            const n = Math.ceil(Phaser.Math.Distance.Between(gx, gy, tx, ty) / 4);
            const links: Phaser.GameObjects.Shape[] = [];
            for (let i = 1; i <= n; i++) {
              const [lx, ly] = [gx + Math.cos(a) * i * 4, gy + Math.sin(a) * i * 4];
              const link =
                i % 2 ? scene.add.ellipse(lx, ly, 5, 4).setStrokeStyle(1, 0xffec27) : scene.add.rectangle(lx, ly, 5, 1, 0xd4a017);
              links.push(link.setRotation(a).setAlpha(0).setDepth(13));
              scene.tweens.add({ targets: link, alpha: 1, delay: i * 10, duration: 30 });
            }
            // They slither back into the gate, tip first.
            links.forEach((l, i) =>
              scene.tweens.add({ targets: l, alpha: 0, delay: BIND + (n - i) * 8, duration: 60, onComplete: () => l.destroy() }),
            );
          }
          later(scene, 150, () => {
            if (!t.active) return;
            // The coil: a ring of links wound around the body, cinching tight, turning slowly while it holds.
            const coil = Array.from({ length: 10 }, (_, i) => scene.add.rectangle(tx, ty, 3, 2, i % 2 ? 0xffec27 : 0xd4a017).setDepth(14));
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              duration: BIND,
              onUpdate: (tw) => {
                const v = tw.getValue() ?? 0;
                const rx = 8 + 6 * Math.max(0, 1 - v * 12);
                coil.forEach((c, i) => {
                  const th = (i / coil.length) * Math.PI * 2 + v * 4;
                  c.setPosition(t.x + Math.cos(th) * rx, t.y + Math.sin(th) * rx * 0.5).setRotation(th + Math.PI / 2);
                });
              },
              onComplete: () => coil.forEach((c) => c.destroy()),
            });
            ring(scene, t.x, t.y, 0xffec27, 16, 6, 200);
            sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 8, 14);
            if (k === 0) scene.cameras.main.shake(70, 0.005);
          });
        }),
      );
    },
    // Gate of Babylon, thrown wide open: "Know your place." The sky over the field fills with golden gates, row on
    // row, each a rippling ring with a treasure's point already showing through; then they all open fire and keep
    // firing, a rain of Noble Phantasms on every enemy in the arena (flyers too), each gate taking its own mark.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.lock(1700);
      p.setVelocityX(0);
      floatText(scene, Phaser.Math.Clamp(p.x, 40, W - 40), p.y - 30, 'TAHU DIRI!', '#ffec27');
      // Four staggered rows of nine gates: the whole sky.
      const gates = Array.from({ length: 36 }, (_, i) => {
        const row = Math.floor(i / 9);
        const x = 16 + (i % 9) * 36 + (row % 2) * 18 + Phaser.Math.Between(-4, 4);
        const y = 30 + row * 17 + Phaser.Math.Between(-3, 3);
        const key = Phaser.Math.RND.pick(TREASURES);
        const tip = scene.add.image(0, 0, key).setScale(0.7).setTint(0xfff0a0).setAlpha(0.9);
        const gate = scene.add
          .container(x, y, [
            scene.add.ellipse(0, 0, 18, 18, 0xffec27, 0.25).setStrokeStyle(2, 0xd4a017),
            scene.add.ellipse(0, 0, 12, 12).setStrokeStyle(1, 0xffec27),
            scene.add.ellipse(0, 0, 6, 6, 0xfff1e8, 0.9),
            tip,
          ])
          .setScale(0)
          .setDepth(9);
        scene.tweens.add({ targets: gate, scale: 1, delay: i * 14, duration: 160, ease: 'Back.Out' });
        return { gate, tip, key };
      });
      // Each shot leaves a gate already aimed: the treasure in it turns to its target, then flies.
      for (let i = 0; i < 48; i++)
        later(scene, 520 + i * 22, () => {
          const ts = world.targets(p.x, p.y);
          if (!ts.length) return;
          const g = gates[(i * 13) % gates.length];
          const t = ts[i % ts.length];
          // The treasure flies at its own mark and follows it, so the rain lands where the enemies are.
          const [x0, y0] = [g.gate.x, g.gate.y];
          const a = Phaser.Math.Angle.Between(x0, y0, t.x, t.y);
          const shot = scene.add.image(x0, y0, g.key).setTint(0xfff0a0).setRotation(a).setDepth(12);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: Phaser.Math.Distance.Between(x0, y0, t.x, t.y) * 2.5,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              const [nx, ny] = [Phaser.Math.Linear(x0, t.x, k), Phaser.Math.Linear(y0, t.y, k)];
              shot.setRotation(Phaser.Math.Angle.Between(shot.x, shot.y, nx, ny) || shot.rotation).setPosition(nx, ny);
            },
            onComplete: () => {
              shot.destroy();
              if (!t.active) return;
              sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 5, 12);
              world.strike(t, 0.22 * power, 'skill', false);
            },
          });
          ring(scene, g.gate.x, g.gate.y, 0xffec27, 6, 16, 200);
          g.key = Phaser.Math.RND.pick(TREASURES);
          g.tip.setTexture(g.key).setRotation(a);
          if (i % 6 === 0) scene.cameras.main.shake(50, 0.003);
        });
      later(scene, 1700, () =>
        gates.forEach(({ gate }, i) =>
          scene.tweens.add({ targets: gate, scaleY: 0, alpha: 0, delay: i * 8, duration: 160, onComplete: () => gate.destroy() }),
        ),
      );
    },
    // Enuma Elish, the Star of Creation that Split Heaven and Earth: "Wake up, Ea." Night falls and a great gate opens
    // at his side; he draws Ea, the Sword of Rupture, and holds it high as its three cylinders turn against each
    // other, dragging the air of the whole arena into a red-black vortex at its tip while the ground trembles. Then
    // he swings it through one full turn at arm's length: the storm of rupture pours from its tip as a beam across the
    // whole arena and sweeps over every enemy wherever it stands, striking each as it passes, while cracks race out of
    // it across sky and ground. At the end the sky itself tears open along those cracks (KOYAK!) and everything on the
    // field is struck at once.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      const f = p.facing;
      p.invuln(3800);
      p.lock(3100);
      p.setVelocity(0, 0);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x0d0008, 0.85)
        .setOrigin(0)
        .setDepth(4)
        .setAlpha(0);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 400 });
      floatText(scene, Phaser.Math.Clamp(p.x, 56, W - 56), p.y - 32, 'BANGUNLAH, EA', '#ffec27');
      // The great gate at his side: golden rings rippling outward.
      const [gx, gy] = [p.x - f * 6, p.y - 10];
      const bigGate = [
        scene.add.ellipse(gx, gy, 26, 34, 0xffec27, 0.2).setStrokeStyle(2, 0xd4a017),
        scene.add.ellipse(gx, gy, 16, 22).setStrokeStyle(1, 0xffec27),
        scene.add.ellipse(gx, gy, 8, 12, 0xfff1e8, 0.9),
      ].map((o) => o.setScale(0).setDepth(9));
      scene.tweens.add({ targets: bigGate, scale: 1, duration: 250, ease: 'Back.Out' });
      for (let i = 0; i < 5; i++) later(scene, i * 220, () => ring(scene, gx, gy, 0xffec27, 10, 30, 400));
      // Ea comes out of the gate and is raised; the cylinders spin (two frames with the stripes shifted).
      const RAISE = -0.6 * f;
      const ex = p.x + f * 6;
      const ey = p.y - 6;
      const ea = scene.add
        .image(gx, ey, 'ea0')
        .setOrigin(f > 0 ? 0.1 : 0.9, 0.5)
        .setFlipX(f < 0)
        .setScale(2.5)
        .setDepth(13);
      scene.tweens.add({ targets: ea, x: ex, rotation: RAISE, duration: 350, ease: 'Quad.Out' });
      const spin = scene.time.addEvent({ delay: 50, loop: true, callback: () => ea.setTexture(ea.texture.key === 'ea0' ? 'ea1' : 'ea0') });
      // Length from the origin to the tip, along the blade.
      const REACH = 22 * 0.9 * 2.5;
      const [vx, vy] = [ex + f * Math.cos(0.6) * REACH, ey - Math.sin(0.6) * REACH];
      // The vortex at the tip: three spiral arms, red over black, winding faster as it grows.
      const vortex = scene.add.graphics().setPosition(vx, vy).setDepth(13);
      const wind = scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1000,
        delay: 300,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const r = 4 + v * 16;
          vortex
            .clear()
            .fillStyle(0x000000, 0.8)
            .fillCircle(0, 0, r * 0.6);
          for (let arm = 0; arm < 3; arm++) {
            vortex.lineStyle(2, arm % 2 ? 0x7e2553 : 0xff004d).beginPath();
            for (let s = 0; s <= 10; s++) {
              const th = arm * 2.09 + s * 0.5 + v * 30;
              const rr = (s / 10) * r;
              if (s === 0) vortex.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
              else vortex.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
            }
            vortex.strokePath();
          }
        },
      });
      // The air of the whole arena is dragged into it.
      for (let i = 0; i < 50; i++)
        later(scene, 300 + i * 20, () => {
          const a = Math.random() * Math.PI * 2;
          const r = Phaser.Math.Between(60, 170);
          const s = scene.add
            .rectangle(vx + Math.cos(a) * r, vy + Math.sin(a) * r, 10, 2, i % 3 ? 0xff004d : 0x000000)
            .setRotation(a + Math.PI / 2)
            .setDepth(12);
          scene.tweens.add({ targets: s, x: vx, y: vy, rotation: a + Math.PI, scaleX: 0.3, duration: 300, onComplete: () => s.destroy() });
        });
      later(scene, 300, () => cam.shake(1000, 0.005));
      const cracks: Phaser.GameObjects.Graphics[] = [];
      // A crack of rupture racing out from (cx, cy) along `dir`: a jagged red line with a black core.
      const crack = (cx: number, cy: number, dir: number) => {
        const pts: [number, number][] = [[cx, cy]];
        for (let s = 1; s <= 6; s++) {
          const [lx, ly] = pts[s - 1];
          const st = Phaser.Math.Between(10, 22);
          const a = dir + Phaser.Math.FloatBetween(-0.6, 0.6);
          pts.push([lx + Math.cos(a) * st, ly + Math.sin(a) * st]);
        }
        const g = scene.add.graphics().setDepth(12);
        for (const [w, c] of [
          [3, 0xff004d],
          [1, 0x000000],
        ] as const) {
          g.lineStyle(w, c).beginPath().moveTo(pts[0][0], pts[0][1]);
          for (const [x, y] of pts) g.lineTo(x, y);
          g.strokePath();
        }
        cracks.push(g);
      };
      // The sweep: Ea, held at arm's length, is swung through one full turn, starting straight up and going over his
      // facing side first. The storm of rupture pours from its tip as a beam that crosses the whole arena, so it
      // passes over every enemy wherever it stands, striking each as it comes; cracks race out of it as it turns.
      const SWEEP = 1000;
      const LEN = 420;
      const a0 = -Math.PI / 2;
      const turn = f * Math.PI * 2;
      later(scene, 1350, () => {
        spin.remove();
        wind.stop();
        vortex.destroy();
        cam.shake(SWEEP, 0.012);
        ea.setFlipX(false).setOrigin(0.1, 0.5).setRotation(a0);
        const beam = (
          [
            [52, 0xff004d, 0.35],
            [32, 0x000000, 0.9],
            [12, 0x7e2553, 0.9],
            [3, 0xfff1e8, 1],
          ] as const
        ).map(([h, c, al]) => scene.add.rectangle(ex, ey, LEN, h, c, al).setOrigin(0, 0.5).setDepth(13).setScale(0, 1));
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 120, ease: 'Quad.Out' });
        // Spiral bands racing down the storm, redrawn along the current angle.
        const bands = scene.add.graphics().setDepth(14);
        // Each enemy's bearing from the blade, measured along the turn; it is struck once the beam has swept past it.
        const swept = new Set<Phaser.GameObjects.GameObject>();
        const along = (t: Phaser.GameObjects.Sprite) => {
          const d = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(ex, ey, t.x, t.y) - a0) * f;
          return d < 0 ? d + Math.PI * 2 : d;
        };
        let lastCrack = 0;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: SWEEP,
          ease: 'Sine.InOut',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            const a = a0 + turn * v;
            const reach = REACH;
            const [ox, oy] = [ex + Math.cos(a) * reach, ey + Math.sin(a) * reach];
            ea.setRotation(a);
            beam.forEach((b) => b.setPosition(ox, oy).setRotation(a));
            bands.clear();
            for (let k = 0; k < 8; k++) {
              const d = ((scene.time.now / 2 + k * 52) % LEN) + 10;
              const [bx, by] = [ox + Math.cos(a) * d, oy + Math.sin(a) * d];
              const [px, py] = [Math.cos(a + Math.PI / 2 + 0.5) * 22, Math.sin(a + Math.PI / 2 + 0.5) * 22];
              bands.lineStyle(3, k % 2 ? 0xff004d : 0x7e2553).lineBetween(bx - px, by - py, bx + px, by + py);
            }
            for (const t of world.targets(ex, ey)) {
              if (swept.has(t) || along(t) > v * Math.PI * 2) continue;
              swept.add(t);
              sparks(scene, t.x, t.y, [0xff004d, 0x000000, 0xfff1e8], 10, 22);
              cutMark(scene, t.x, t.y, 0xff004d, 30, a + Math.PI / 2);
              world.strike(t, 2.5 * power, 'ult', true);
            }
            // Cracks spring out of the storm as it turns, wherever it crosses the arena.
            if (scene.time.now - lastCrack > 45) {
              lastCrack = scene.time.now;
              const d = Phaser.Math.Between(30, 300);
              const [cx, cy] = [ox + Math.cos(a) * d, oy + Math.sin(a) * d];
              if (cx > 0 && cx < W && cy > 0 && cy < FLOOR_Y + 6)
                crack(cx, cy, a + (Math.random() < 0.5 ? 1 : -1) * Phaser.Math.FloatBetween(0.9, 2.2));
            }
          },
          onComplete: () => {
            bands.destroy();
            scene.tweens.add({ targets: beam, scaleY: 0, alpha: 0, duration: 250, onComplete: () => beam.forEach((b) => b.destroy()) });
          },
        });
      });
      // Heaven and earth split: a rift tears open across the whole sky along the cracks, one flash, and everything
      // on the field is struck at once. Then the rift seals.
      later(scene, 2550, () => {
        const ry = 64;
        const rg = scene.add.graphics();
        const top: Phaser.Math.Vector2[] = [];
        const bottom: Phaser.Math.Vector2[] = [];
        for (let x = -10; x <= W + 10; x += 16) {
          top.push(new Phaser.Math.Vector2(x, -Phaser.Math.Between(6, 18)));
          bottom.push(new Phaser.Math.Vector2(x, Phaser.Math.Between(6, 18)));
        }
        const shape = [...top, ...bottom.reverse()];
        rg.fillStyle(0xff004d, 0.6).fillPoints(
          shape.map((v) => new Phaser.Math.Vector2(v.x, v.y * 1.4)),
          true,
        );
        rg.fillStyle(0x000000).fillPoints(shape, true);
        rg.lineStyle(1, 0xffec27).strokePoints(shape, true);
        const rift = scene.add.container(0, ry, [rg]).setDepth(12).setScale(1, 0);
        scene.tweens.add({ targets: rift, scaleY: 1, duration: 140, ease: 'Quad.Out' });
        scene.tweens.add({ targets: rift, scaleY: 0, alpha: 0, delay: 600, duration: 300, onComplete: () => rift.destroy() });
        cracks.forEach((g) =>
          scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.02, delay: 150, duration: 400, onComplete: () => g.destroy() }),
        );
        cam.flash(250, 255, 0, 77);
        cam.shake(500, 0.03);
        floatText(scene, W / 2, 50, 'KOYAK!', '#ff004d');
        for (const t of world.targets(p.x, p.y)) {
          sparks(scene, t.x, t.y, [0xff004d, 0x000000, 0xffec27], 14, 30);
          cutMark(scene, t.x, t.y, 0xff004d, 40);
          world.strike(t, 3 * power, 'ult', true);
        }
        // Shards of the broken sky fall.
        for (let i = 0; i < 24; i++) {
          const s = scene.add
            .triangle(Phaser.Math.Between(0, W), Phaser.Math.Between(ry - 20, ry + 20), 0, 0, 5, 1, 2, 6, i % 2 ? 0xff004d : 0x7e2553)
            .setDepth(12);
          scene.tweens.add({ targets: s, y: s.y + 80, angle: 360, alpha: 0, duration: 800, onComplete: () => s.destroy() });
        }
        scene.tweens.add({
          targets: [ea, ...bigGate],
          alpha: 0,
          duration: 300,
          onComplete: () => [ea, ...bigGate].forEach((o) => o.destroy()),
        });
        scene.tweens.add({ targets: dark, alpha: 0, delay: 300, duration: 500, onComplete: () => dark.destroy() });
      });
    },
  },

  shrine: {
    // Dismantle Jatuh: where Sukuna lands, cuts open in a ring all around him.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        later(scene, i * 30, () => cutMark(scene, x + Math.cos(a) * 22, gy - 10 + Math.sin(a) * 14, 0xff004d, 20, a + 0.8));
      }
      world.area(x, gy - 10, 36, 0.8 * power, 120, 'proc');
    },
    // Fuga ("Open"): fire gathers into Sukuna's hands and takes the shape of a bow and a burning arrow. He draws it,
    // tracking the nearest enemy (in the air or not), and lets go at wherever it stands at that moment: the arrow
    // streaks there trailing embers and erupts into a pillar of fire from the ground to the sky that engulfs
    // everything around it and leaves the floor burning.
    skill: ({ p, world, scene, power }) => {
      const first = world.targets(p.x, p.y)[0];
      if (!first) return false;
      p.facing = first.x >= p.x ? 1 : -1;
      p.lock(560);
      p.setVelocityX(0);
      const hx = p.x + p.facing * 10;
      const hy = p.y - 2;
      floatText(scene, p.x, p.y - 30, 'BUKA', '#ffa300');
      // Fire gathers into his hands.
      for (let i = 0; i < 18; i++)
        later(scene, i * 15, () => {
          const a = Math.random() * Math.PI * 2;
          const m = scene.add.rectangle(hx + Math.cos(a) * 30, hy + Math.sin(a) * 30, 2, 2, FIRE[i % 3]).setDepth(13);
          scene.tweens.add({ targets: m, x: hx, y: hy, duration: 200, ease: 'Quad.In', onComplete: () => m.destroy() });
        });
      // The bow of fire with the arrow nocked and drawn, drawn pointing along +x and turned to the aim.
      const bow = scene.add.graphics();
      const limb = Array.from({ length: 9 }, (_, i) => {
        const a = -1.1 + (i / 8) * 2.2;
        return new Phaser.Math.Vector2(-6 + Math.cos(a) * 9, Math.sin(a) * 9);
      });
      const [tip1, tip2] = [limb[0], limb[8]];
      bow.lineStyle(1, FIRE[1]).lineBetween(tip1.x, tip1.y, -9, 0).lineBetween(tip2.x, tip2.y, -9, 0);
      bow.lineStyle(3, FIRE[0]).strokePoints(limb);
      bow.lineStyle(1, FIRE[2]).strokePoints(limb);
      bow.fillStyle(FIRE[0]).fillRect(-9, -1, 20, 2);
      bow.fillStyle(FIRE[2]).fillRect(-9, 0, 20, 1);
      bow.fillStyle(FIRE[0]).fillTriangle(10, -3, 10, 3, 15, 0);
      bow.fillStyle(0xfff1e8).fillTriangle(11, -1, 11, 1, 14, 0);
      const aimAt = (t: Phaser.GameObjects.Sprite) => Phaser.Math.Angle.Between(hx, hy, t.x, t.y);
      const drawn = scene.add.container(hx, hy, [bow]).setRotation(aimAt(first)).setScale(0).setDepth(13);
      scene.tweens.add({ targets: drawn, scale: 1, delay: 200, duration: 150, ease: 'Back.Out' });
      // It keeps turning to follow the target while embers lift off the burning limbs.
      const flicker = scene.time.addEvent({
        delay: 40,
        loop: true,
        callback: () => {
          const t = world.targets(hx, hy)[0];
          if (t) drawn.setRotation(aimAt(t));
          const tip = Phaser.Math.RND.pick(limb).clone().rotate(drawn.rotation);
          const e = scene.add.rectangle(hx + tip.x, hy + tip.y, 1, 1, FIRE[Phaser.Math.Between(1, 2)]).setDepth(13);
          scene.tweens.add({ targets: e, y: e.y - 8, alpha: 0, duration: 300, onComplete: () => e.destroy() });
        },
      });
      later(scene, 480, () => {
        flicker.remove();
        drawn.destroy();
        const t = world.targets(hx, hy)[0];
        if (!t) return;
        // Released: the arrow homes on the target, shedding embers.
        const arrow = scene.add
          .container(hx, hy, [
            scene.add.rectangle(0, 0, 16, 5, FIRE[0], 0.5),
            scene.add.rectangle(0, 0, 16, 2, FIRE[1]),
            scene.add.rectangle(4, 0, 8, 1, FIRE[2]),
            scene.add.triangle(0, 0, 8, -3, 8, 3, 13, 0, 0xfff1e8).setOrigin(0),
          ])
          .setDepth(14);
        const dist = Phaser.Math.Distance.Between(hx, hy, t.x, t.y);
        let [tx, ty] = [t.x, t.y];
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: Math.max(120, dist * 2.2),
          ease: 'Quad.In',
          onUpdate: (tw) => {
            if (t.active) [tx, ty] = [t.x, t.y];
            const k = tw.getValue() ?? 0;
            const [nx, ny] = [Phaser.Math.Linear(hx, tx, k), Phaser.Math.Linear(hy, ty, k)];
            arrow.setRotation(Phaser.Math.Angle.Between(arrow.x, arrow.y, nx, ny) || arrow.rotation).setPosition(nx, ny);
            const e = scene.add.circle(nx, ny, 2, FIRE[Phaser.Math.Between(0, 2)]).setDepth(13);
            scene.tweens.add({ targets: e, scale: 0, y: ny - 4, duration: 250, onComplete: () => e.destroy() });
          },
          onComplete: () => {
            arrow.destroy();
            explosion(scene, tx, ty, 44);
            ring(scene, tx, ty, FIRE[1], 6, 50, 350, 3);
            // Impact: one flash, a sky scorched dark, rolling shockwaves along the floor and a rain of embers.
            scene.cameras.main.flash(160, 255, 163, 0);
            floatText(scene, Phaser.Math.Clamp(tx, 40, W - 40), 40, 'FUGA!', '#ffa300');
            const scorch = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x2a0800, 0.55).setOrigin(0).setDepth(4).setAlpha(0);
            scene.tweens.add({ targets: scorch, alpha: 1, duration: 120, yoyo: true, hold: 500, onComplete: () => scorch.destroy() });
            ring(scene, tx, ty, 0xfff1e8, 4, 70, 300, 2);
            ring(scene, tx, ty, FIRE[0], 10, 90, 500, 2);
            for (const s of [-1, 1])
              for (let i = 0; i < 8; i++)
                later(scene, i * 35, () => {
                  const wx = tx + s * (10 + i * 14);
                  flameTongue(scene, wx, FLOOR_Y, 18 - i, 450, FIRE);
                  sparks(scene, wx, FLOOR_Y - 4, [FIRE[1], FIRE[2]], 3, 12);
                });
            for (let i = 0; i < 40; i++)
              later(scene, i * 18, () => {
                const e = scene.add.rectangle(tx + Phaser.Math.Between(-60, 60), 0, 2, 2, FIRE[i % 3]).setDepth(13);
                scene.tweens.add({
                  targets: e,
                  y: FLOOR_Y,
                  x: e.x + Phaser.Math.Between(-20, 20),
                  duration: Phaser.Math.Between(400, 800),
                  alpha: 0,
                  onComplete: () => e.destroy(),
                });
              });
            // The wave rolls out along the floor and burns everything it touches, flyers low and high.
            world.area(tx, FLOOR_Y - 10, 110, 1.5 * power, 260, 'skill', { burn: 0.8 });
            // The pillar of fire: floor to sky through the impact, layered red to white, then it narrows away.
            const pillar = (
              [
                [30, FIRE[0], 0.45],
                [20, FIRE[1], 0.8],
                [10, FIRE[2], 0.9],
                [3, 0xfff1e8, 1],
              ] as const
            ).map(([w, c, a]) => scene.add.rectangle(tx, FLOOR_Y, w, FLOOR_Y, c, a).setOrigin(0.5, 1).setScale(1, 0).setDepth(12));
            scene.tweens.add({ targets: pillar, scaleY: 1, duration: 130, ease: 'Quad.Out' });
            scene.tweens.add({
              targets: pillar,
              scaleX: 0,
              alpha: 0,
              delay: 350,
              duration: 450,
              onComplete: () => pillar.forEach((r) => r.destroy()),
            });
            for (let i = 0; i < 10; i++)
              later(scene, i * 40, () => flameTongue(scene, tx + Phaser.Math.Between(-12, 12), FLOOR_Y - i * 14, 14, 350, FIRE));
            for (let i = -3; i <= 3; i++)
              later(scene, 150 + Math.abs(i) * 50, () => flameTongue(scene, tx + i * 9, FLOOR_Y, 12, 700, FIRE));
            rocks(scene, tx, FLOOR_Y - 2, 6);
            scene.cameras.main.shake(220, 0.018);
            world.area(tx, ty, 38, 5 * power, 220, 'skill', { burn: 0.8 });
            for (const o of world.targets(tx, ty))
              if (Math.abs(o.x - tx) < 12 && Phaser.Math.Distance.Between(o.x, o.y, tx, ty) >= 38)
                world.strike(o, 1.8 * power, 'skill', false, { burn: 0.8 });
            // The fire does not stop at one pillar: two more erupt to either side, each a step further out.
            for (const s of [-1, 1])
              later(scene, 220, () => {
                const px = Phaser.Math.Clamp(tx + s * 46, 8, W - 8);
                const col = scene.add.rectangle(px, FLOOR_Y, 14, FLOOR_Y, FIRE[1], 0.7).setOrigin(0.5, 1).setScale(1, 0).setDepth(12);
                const core = scene.add.rectangle(px, FLOOR_Y, 5, FLOOR_Y, 0xfff1e8, 0.9).setOrigin(0.5, 1).setScale(1, 0).setDepth(12);
                scene.tweens.add({ targets: [col, core], scaleY: 1, duration: 110, ease: 'Quad.Out' });
                scene.tweens.add({
                  targets: [col, core],
                  scaleX: 0,
                  alpha: 0,
                  delay: 250,
                  duration: 300,
                  onComplete: () => [col, core].forEach((r) => r.destroy()),
                });
                for (let i = 0; i < 5; i++)
                  later(scene, i * 40, () => flameTongue(scene, px + Phaser.Math.Between(-5, 5), FLOOR_Y - i * 24, 12, 300, FIRE));
                rocks(scene, px, FLOOR_Y - 2, 3);
                world.area(px, FLOOR_Y - 40, 30, 2 * power, 160, 'skill', { burn: 0.6 });
              });
          },
        });
      });
    },
    // World Cutting Slash: Dismantle aimed at space itself, which nothing can block. Sukuna chants the incantation
    // ("Dragon Scales. Recoil. Twin Meteors."), each word a hand sign and a pulse of cursed energy as the field
    // darkens; then he flicks his hand and a single line splits the whole screen, the world gaping open along it.
    // The line is laid where it crosses the most enemies at that moment; everything on it is cut in two. Space does
    // not stay in one piece: the split runs on as hairline fractures from the cut to every enemy off the line, and
    // each of them is cut where the crack reaches it.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(1700);
      p.lock(1300);
      p.setVelocity(0, 0);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x0a0005, 0.6)
        .setOrigin(0)
        .setDepth(4)
        .setAlpha(0);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 800 });
      ['SISIK NAGA', 'TOLAKAN', 'METEOR KEMBAR'].forEach((w, i) =>
        later(scene, i * 280, () => {
          floatText(scene, Phaser.Math.Clamp(p.x, 56, W - 56), p.y - 26 - i * 9, w, '#ff004d');
          ring(scene, p.x, p.y, 0xff004d, 4, 26 + i * 8, 300, 2);
          glint(scene, p.x + p.facing * 5, p.y - 2);
          cam.shake(60, 0.004);
        }),
      );
      later(scene, 950, () => {
        // The line through the most enemies: every enemy as a pivot, every angle short of vertical.
        const ts = world.targets(p.x, p.y);
        const across = (x: number, y: number, a: number, o: Phaser.GameObjects.Sprite) =>
          Math.abs(-(o.x - x) * Math.sin(a) + (o.y - y) * Math.cos(a)) < 14;
        let best = { x: p.x + p.facing * 60, y: p.y, a: -0.35 * p.facing, n: 0 };
        for (const e of ts)
          for (let a = -1.2; a <= 1.2; a += 0.1) {
            const n = ts.filter((o) => across(e.x, e.y, a, o)).length;
            if (n > best.n) best = { x: e.x, y: e.y, a, n };
          }
        const { x, y, a } = best;
        const at = (r: Phaser.GameObjects.Rectangle, off = 0) =>
          r
            .setPosition(x - Math.sin(a) * off, y + Math.cos(a) * off)
            .setRotation(a)
            .setDepth(15);
        // A hairline first, then the cut opens: red glow, white edge, and the black gap of the split world whose two
        // lips slide apart.
        const hair = at(scene.add.rectangle(0, 0, W * 2.5, 1, 0xfff1e8));
        scene.tweens.add({ targets: hair, alpha: 0, duration: 90, yoyo: true, repeat: 1, onComplete: () => hair.destroy() });
        later(scene, 180, () => {
          const glow = at(scene.add.rectangle(0, 0, W * 2.5, 12, 0xff004d, 0.55));
          const gap = at(scene.add.rectangle(0, 0, W * 2.5, 6, 0x000000)).setScale(1, 0);
          const lips = [-1, 1].map((s) => at(scene.add.rectangle(0, 0, W * 2.5, 1, 0xfff1e8), s));
          scene.tweens.add({ targets: gap, scaleY: 1, duration: 120, ease: 'Quad.Out' });
          lips.forEach((l, i) =>
            scene.tweens.add({ targets: l, x: l.x - Math.sin(a) * (i ? 4 : -4), y: l.y + Math.cos(a) * (i ? 4 : -4), duration: 120 }),
          );
          const cut = [glow, gap, ...lips];
          scene.tweens.add({
            targets: cut,
            scaleY: 0,
            alpha: 0,
            delay: 550,
            duration: 300,
            onComplete: () => cut.forEach((r) => r.destroy()),
          });
          for (let i = -6; i <= 6; i++) {
            const sx = x + Math.cos(a) * i * 30;
            const sy = y + Math.sin(a) * i * 30;
            if (sx > -10 && sx < W + 10 && sy > 0 && sy < FLOOR_Y + 10) sparks(scene, sx, sy, [0xff004d, 0xfff1e8], 5, 16);
          }
          cam.flash(120, 255, 0, 77);
          cam.shake(500, 0.03);
          for (const e of world.targets(x, y)) {
            if (across(x, y, a, e)) {
              cutMark(scene, e.x, e.y, 0xff004d, 40, a);
              world.strike(e, 10 * power, 'skill', true);
              continue;
            }
            // The fracture leaves the cut at the point nearest the enemy and zigzags to it.
            const along = (e.x - x) * Math.cos(a) + (e.y - y) * Math.sin(a);
            const [fx, fy] = [x + Math.cos(a) * along, y + Math.sin(a) * along];
            const dist = Phaser.Math.Distance.Between(fx, fy, e.x, e.y);
            later(scene, 120 + dist * 1.2, () => {
              if (!e.active) return;
              const crack = scene.add.graphics().setDepth(15);
              const n = Math.max(2, Math.round(dist / 18));
              let [px, py] = [fx, fy];
              for (let i = 1; i <= n; i++) {
                const k = i / n;
                const j = i === n ? 0 : Phaser.Math.Between(-5, 5);
                const [qx, qy] = [fx + (e.x - fx) * k - Math.sin(a) * j, fy + (e.y - fy) * k + Math.cos(a) * j];
                crack.lineStyle(3, 0xff004d, 0.5).lineBetween(px, py, qx, qy);
                crack.lineStyle(1, 0xfff1e8).lineBetween(px, py, qx, qy);
                [px, py] = [qx, qy];
              }
              scene.tweens.add({ targets: crack, alpha: 0, delay: 200, duration: 250, onComplete: () => crack.destroy() });
              cutMark(scene, e.x, e.y, 0xff004d, 26, Phaser.Math.Angle.Between(fx, fy, e.x, e.y) + Math.PI / 2);
              world.strike(e, 3.5 * power, 'skill', true);
            });
          }
          scene.tweens.add({ targets: dark, alpha: 0, delay: 500, duration: 400, onComplete: () => dark.destroy() });
        });
      });
    },
    // Malevolent Shrine (Fukuma Mizushi), Domain Expansion: Sukuna forms the Enma-ten mudra and the world is
    // rewritten. The sky bleeds red, the ground becomes a pool of blood strewn with skulls, and his shrine rises
    // behind him, maw open. It has no barrier - it needs none: the sure-hit fills the whole arena with Dismantle, a
    // storm of cuts flickering everywhere and slicing every enemy over and over, while Cleave picks each one in turn
    // and splits it with a heavy cross. Then the maw closes on a last Cleave on everyone (TERBELAH!) and the domain
    // falls away.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(3800);
      p.lock(3200);
      p.setVelocity(0, 0);
      floatText(scene, Phaser.Math.Clamp(p.x, 56, W - 56), p.y - 32, 'RYOIKI TENKAI', '#ff77a8');
      // The mudra: his hands meet at his chest in a flash of cursed energy.
      glint(scene, p.x, p.y - 2);
      ring(scene, p.x, p.y, 0xff004d, 4, 40, 400, 2);
      // The domain sits over the platforms but under the enemies (depth 5).
      const sky = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x3a0010, 0.85).setOrigin(0).setDepth(4).setAlpha(0);
      const blood = scene.add
        .rectangle(0, FLOOR_Y, W, H - FLOOR_Y, 0x8a0a20, 0.9)
        .setOrigin(0)
        .setDepth(4)
        .setAlpha(0);
      const sheen = scene.add.rectangle(0, FLOOR_Y, W, 1, 0xff004d).setOrigin(0).setDepth(4.05).setAlpha(0);
      const skulls = Array.from({ length: 12 }, (_, i) =>
        scene.add
          .image(8 + i * 27 + Phaser.Math.Between(-6, 6), FLOOR_Y + 2, 'i_tengkorak')
          .setOrigin(0.5, 1)
          .setFlipX(i % 2 === 1)
          .setAlpha(0)
          .setDepth(4.05),
      );
      const sx = Phaser.Math.Clamp(p.x, 60, W - 60);
      const shrine = scene.add.image(sx, FLOOR_Y, 'shrine').setOrigin(0.5, 1).setScale(4, 0).setDepth(4.1);
      // The maw's red glow (rows 7-8 of the 18-row sprite, at scale 4).
      const maw = scene.add
        .ellipse(sx, FLOOR_Y - 72 + 32, 60, 10, 0xff004d, 0.5)
        .setAlpha(0)
        .setDepth(4.15);
      const domain = [sky, blood, sheen, shrine, maw, ...skulls];
      scene.tweens.add({ targets: [sky, blood, sheen], alpha: 1, duration: 500 });
      scene.tweens.add({ targets: skulls, alpha: 1, y: FLOOR_Y, delay: 300, duration: 400, ease: 'Quad.Out' });
      scene.tweens.add({ targets: shrine, scaleY: 4, delay: 200, duration: 550, ease: 'Back.Out' });
      scene.tweens.add({ targets: maw, alpha: 1, delay: 700, duration: 300, yoyo: true, repeat: 3 });
      later(scene, 250, () => cam.shake(500, 0.008));
      // Dismantle everywhere: thin cuts flicker across the whole arena while every enemy is sliced each wave.
      for (let i = 0; i < 30; i++)
        later(scene, 900 + i * 60, () => {
          for (let k = 0; k < 3; k++) {
            const a = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
            const len = Phaser.Math.Between(30, 90);
            const [cx, cy] = [Phaser.Math.Between(0, W), Phaser.Math.Between(10, FLOOR_Y)];
            const cut = [scene.add.rectangle(cx, cy, len, 3, 0xff004d, 0.5), scene.add.rectangle(cx, cy, len, 1, 0xfff1e8)];
            cut.forEach((c) => c.setRotation(a).setScale(0, 1).setDepth(13));
            scene.tweens.add({ targets: cut, scaleX: 1, duration: 50 });
            scene.tweens.add({ targets: cut, alpha: 0, delay: 60, duration: 120, onComplete: () => cut.forEach((c) => c.destroy()) });
          }
        });
      for (let w = 0; w < 10; w++)
        later(scene, 900 + w * 180, () => {
          for (const t of world.targets(p.x, p.y)) {
            cutMark(scene, t.x, t.y, 0xff004d, 22);
            world.strike(t, 0.45 * power, 'ult', false);
          }
          cam.shake(60, 0.006);
        });
      // Blood rains upward from the pool and falls back over the whole domain.
      for (let i = 0; i < 60; i++)
        later(scene, 500 + i * 40, () => {
          const x = Phaser.Math.Between(0, W);
          const d = scene.add.rectangle(x, 0, 1, Phaser.Math.Between(4, 8), i % 3 ? 0xb3122e : 0xff004d).setDepth(13);
          scene.tweens.add({ targets: d, y: FLOOR_Y, duration: 450, ease: 'Quad.In', onComplete: () => d.destroy() });
        });
      // Cleave, one enemy at a time: a heavy cross and a spray of blood.
      later(scene, 1000, () =>
        world
          .targets(p.x, p.y)
          .slice(0, 10)
          .forEach((t, i) =>
            later(scene, i * 150, () => {
              if (!t.active) return;
              cutMark(scene, t.x, t.y, 0xff004d, 36, 0.8);
              cutMark(scene, t.x, t.y, 0xff004d, 36, -0.8);
              sparks(scene, t.x, t.y, [0xff004d, 0xb3122e, 0xfff1e8], 10, 20);
              world.strike(t, 2.2 * power, 'ult', true);
            }),
          ),
      );
      // The maw closes: one last Cleave on everyone.
      later(scene, 2900, () => {
        scene.tweens.add({ targets: maw, alpha: 1, scaleX: 1.4, duration: 120, yoyo: true });
        cam.flash(200, 255, 0, 77);
        cam.shake(450, 0.025);
        floatText(scene, W / 2, 48, 'TERBELAH!', '#ff004d');
        // A giant X splits the whole arena corner to corner.
        for (const a of [0.5, -0.5]) {
          const glow = scene.add
            .rectangle(W / 2, FLOOR_Y / 2, W * 1.6, 14, 0xff004d, 0.6)
            .setRotation(a)
            .setDepth(15);
          const edge = scene.add
            .rectangle(W / 2, FLOOR_Y / 2, W * 1.6, 3, 0xfff1e8)
            .setRotation(a)
            .setDepth(15);
          scene.tweens.add({
            targets: [glow, edge],
            scaleY: 0,
            alpha: 0,
            delay: 150,
            duration: 450,
            onComplete: () => [glow, edge].forEach((r) => r.destroy()),
          });
        }
        for (const t of world.targets(p.x, p.y)) {
          cutMark(scene, t.x, t.y, 0xfff1e8, 50, Math.PI / 2);
          cutMark(scene, t.x, t.y, 0xff004d, 44, 0);
          sparks(scene, t.x, t.y, [0xff004d, 0xb3122e], 14, 30);
          world.strike(t, 5 * power, 'ult', true);
        }
        scene.tweens.add({ targets: shrine, scaleY: 0, delay: 250, duration: 350, ease: 'Quad.In' });
        scene.tweens.add({ targets: domain, alpha: 0, delay: 300, duration: 500, onComplete: () => domain.forEach((o) => o.destroy()) });
      });
    },
  },

  mugen: {
    // Ao Jatuh: he lands on a point of Blue: everything near is dragged in and crushed.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const orb = scene.add
        .image(x, gy - 10, 'ao')
        .setScale(0.6)
        .setDepth(12);
      scene.tweens.add({ targets: orb, scale: 2.4, angle: 540, duration: 300, yoyo: true, onComplete: () => orb.destroy() });
      ring(scene, x, gy - 10, 0x29adff, 50, 4, 400, 2);
      world.pull(x, gy - 10, 60, 160);
      later(scene, 300, () => world.area(x, gy - 10, 26, 0.9 * power, 0, 'proc'));
    },
    // Ao (Blue, the amplified Limitless): Gojo points and a point of attraction opens where the enemies are thickest in
    // front of him (in the air too; empty air ahead if there is no one). Space folds toward it: a turning blue sphere
    // with spiral arms, rings of space collapsing inward and motes torn in; it drags everything near into it and
    // crushes it four times.
    basic: ({ p, world, scene, power }) => {
      const f = p.facing;
      const foes = world.targets(p.x, p.y).filter((t) => f * (t.x - p.x) > -6 && Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 140);
      const near = (e: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < 40).length;
      const mark = foes.length ? foes.reduce((b, e) => (near(e) > near(b) ? e : b)) : undefined;
      const x = Phaser.Math.Clamp(mark ? mark.x : p.x + f * 56, 10, W - 10);
      const y = Math.min(mark ? mark.y : p.y - 10, FLOOR_Y - 10);
      const orb = cursedOrb(scene, x, y, 3, 'ao', 1);
      scene.tweens.add({ targets: orb, scale: 3, duration: 250, yoyo: true, hold: 500, onComplete: () => orb.destroy() });
      for (let k = 0; k < 3; k++) later(scene, k * 230, () => ring(scene, x, y, 0x29adff, 46, 3, 300, 2));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const mote = scene.add.rectangle(x + Math.cos(a) * 66, y + Math.sin(a) * 66, 2, 2, i % 3 ? 0xc2f0ff : 0xfff1e8).setDepth(12);
        scene.tweens.add({ targets: mote, x, y, delay: i * 30, duration: 380, ease: 'Quad.In', onComplete: () => mote.destroy() });
      }
      for (let i = 0; i < 4; i++) {
        later(scene, i * 250, () => {
          world.pull(x, y, 76, 140);
          world.area(x, y, 34, 0.6 * power, 0, 'basic');
        });
      }
    },
    // Jutsushiki Hanten: Aka (Cursed Technique Reversal: Red). Gojo raises two fingers and reversed cursed energy
    // gathers at their tip: a red sphere grows as rings of space are thrown outward from it. He releases it along the
    // line that passes through the most enemies (any direction, flyers too): it tears through everything on the way,
    // hurling each of them away, and where it ends the repulsion bursts outward.
    skill: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.lock(300);
      p.setVelocityX(0);
      const fx = p.x + f * 8;
      const fy = p.y - 7;
      glint(scene, fx, fy);
      const orb = cursedOrb(scene, fx, fy, 6, 'aka', -1).setScale(0.2);
      scene.tweens.add({ targets: orb, scale: 1, duration: 240, ease: 'Back.Out' });
      for (let k = 0; k < 3; k++) later(scene, k * 70, () => ring(scene, fx, fy, 0xff004d, 4, 22, 200, 1));
      later(scene, 260, () => {
        const a = bestLine(world.targets(fx, fy), fx, fy, 16, f > 0 ? 0 : Math.PI);
        const [cx, cy] = [Math.cos(a), Math.sin(a)];
        scene.cameras.main.shake(160, 0.014);
        ring(scene, fx, fy, 0xff77a8, 6, 34, 220, 2);
        const hit = new Set<Phaser.GameObjects.GameObject>();
        const trail = scene.add.graphics().setDepth(12);
        let last = { x: fx, y: fy };
        scene.tweens.addCounter({
          from: 0,
          to: 380,
          duration: 700,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const d = tw.getValue() ?? 0;
            const [x, y] = [fx + cx * d, fy + cy * d];
            orb.setPosition(x, y);
            trail.lineStyle(10, 0xff004d, 0.25).lineBetween(last.x, last.y, x, y);
            trail.lineStyle(3, 0xff77a8, 0.7).lineBetween(last.x, last.y, x, y);
            last = { x, y };
            for (const t of world.targets(x, y)) {
              if (hit.has(t) || Phaser.Math.Distance.Between(x, y, t.x, t.y) > 18) continue;
              hit.add(t);
              sparks(scene, t.x, t.y, [0xff004d, 0xff77a8, 0xfff1e8], 7, 14);
              world.strike(t, 2.2 * power, 'skill', false, undefined, 340);
            }
            if (x < -12 || x > W + 12 || y < -12 || y > FLOOR_Y + 4) tw.complete();
          },
          onComplete: () => {
            const { x, y } = orb;
            orb.destroy();
            scene.tweens.add({ targets: trail, alpha: 0, duration: 300, onComplete: () => trail.destroy() });
            const [bx, by] = [Phaser.Math.Clamp(x, 0, W), Math.min(y, FLOOR_Y - 4)];
            ring(scene, bx, by, 0xff004d, 6, 44, 320, 3);
            ring(scene, bx, by, 0xfff1e8, 4, 30, 260, 1);
            scene.cameras.main.shake(180, 0.016);
            world.area(bx, by, 40, 1 * power, 280, 'skill');
          },
        });
      });
    },
    // Kyoshiki: Murasaki (Hollow Technique: Purple). Blue opens at one hand and Red at the other; Gojo brings them
    // together and they spiral into each other until they collide and fuse into imaginary mass, a vast violet sphere
    // crackling with violet lightning. He sends it along the line through the most enemies (any direction): whatever
    // it passes through is erased, and it leaves a scar of erased space behind it that slowly closes.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.lock(1000);
      p.invuln(1100);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      const cx0 = p.x + f * 18;
      const cy0 = p.y - 16;
      const blue = cursedOrb(scene, p.x - 16, p.y - 10, 6, 'ao', 1).setScale(0);
      const red = cursedOrb(scene, p.x + 16, p.y - 10, 6, 'aka', -1).setScale(0);
      scene.tweens.add({ targets: [blue, red], scale: 1, duration: 260, ease: 'Back.Out' });
      // They spiral into each other.
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        delay: 300,
        duration: 380,
        ease: 'Quad.In',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const r = 22 * (1 - t);
          const a = t * Math.PI * 3;
          blue.setPosition(cx0 + Math.cos(a + Math.PI) * r, cy0 + Math.sin(a + Math.PI) * r * 0.6);
          red.setPosition(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r * 0.6);
        },
        onComplete: () => {
          blue.destroy();
          red.destroy();
          cam.flash(220, 138, 63, 209);
          cam.shake(400, 0.03);
          ring(scene, cx0, cy0, 0xc080ff, 6, 60, 360, 3);
        },
      });
      const R = 24;
      const sphere = cursedOrb(scene, cx0, cy0, R, 'murasaki', 1).setScale(0);
      later(scene, 680, () => scene.tweens.add({ targets: sphere, scale: 1, duration: 200, ease: 'Back.Out' }));
      // Violet lightning crackling over it.
      const crackle = scene.add.graphics().setDepth(14);
      const zap = scene.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          crackle.clear();
          if (!sphere.active || sphere.scale < 0.5) return;
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            const pts = jag(
              sphere.x + Math.cos(a) * R,
              sphere.y + Math.sin(a) * R,
              sphere.x + Math.cos(a) * (R + 12),
              sphere.y + Math.sin(a) * (R + 12),
              3,
            );
            crackle
              .lineStyle(1, i % 2 ? 0xc080ff : 0xfff1e8)
              .beginPath()
              .moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts) crackle.lineTo(x, y);
            crackle.strokePath();
          }
        },
      });
      later(scene, 950, () => {
        const a = bestLine(world.targets(cx0, cy0), cx0, cy0, R + 4, f > 0 ? 0 : Math.PI);
        const [cx, cy] = [Math.cos(a), Math.sin(a)];
        const hit = new Set<Phaser.GameObjects.GameObject>();
        // The scar of erased space: dark discs along the path with a violet edge, closing slowly.
        const scar = scene.add.graphics().setDepth(4);
        let lastScar = -99;
        scene.tweens.addCounter({
          from: 0,
          to: 420,
          duration: 1500,
          onUpdate: (tw) => {
            const d = tw.getValue() ?? 0;
            const [x, y] = [cx0 + cx * d, cy0 + cy * d];
            sphere.setPosition(x, y);
            if (d - lastScar > 10) {
              lastScar = d;
              scar.fillStyle(0x8a3fd1, 0.5).fillCircle(x, y, R + 3);
              scar.fillStyle(0x05030a, 0.9).fillCircle(x, y, R - 2);
              cam.shake(60, 0.006);
            }
            for (const t of world.targets(x, y)) {
              if (hit.has(t) || Phaser.Math.Distance.Between(x, y, t.x, t.y) > R + 8) continue;
              hit.add(t);
              sparks(scene, t.x, t.y, [0x8a3fd1, 0xc080ff, 0xfff1e8], 10, 18);
              world.strike(t, 4 * power, 'skill', true, { slow: 1200 }, 200);
            }
            if (x < -R * 2 || x > W + R * 2 || y < -R * 2 || y > H + R) tw.complete();
          },
          onComplete: () => {
            zap.remove();
            crackle.destroy();
            sphere.destroy();
            scene.tweens.add({ targets: scar, alpha: 0, duration: 900, onComplete: () => scar.destroy() });
          },
        });
      });
    },
    // Muryokusho (Unlimited Void): Gojo forms the domain's hand sign and a black void spreads out of him until it
    // swallows the arena, stars wheeling in it and streams of raw information rushing through. Every enemy inside is
    // frozen solid, drowning in it (white noise crackles over them). Gojo walks through the stillness: he is beside
    // each of them in turn, one blow each, a blue burst and a jolt. Then he snaps his fingers and the void cracks
    // apart like glass; the last blow lands on everyone at once. TAK TERBATAS!
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      const cam = scene.cameras.main;
      const home = { x: p.x, y: p.y };
      p.invuln(3600);
      p.lock(3300);
      p.setVelocity(0, 0);
      floatText(scene, Phaser.Math.Clamp(p.x, 56, W - 56), p.y - 30, 'RYOIKI TENKAI', '#29adff');
      // The void: a black sphere growing out of him over the whole arena.
      // Under the enemies (depth 5), so the frozen ones stand out against it.
      const voidG = scene.add.circle(p.x, p.y, 4, 0x000000, 0.88).setDepth(4);
      const rim = scene.add.circle(p.x, p.y, 4).setStrokeStyle(2, 0x29adff).setDepth(4);
      scene.tweens.add({ targets: [voidG, rim], radius: 380, duration: 600, ease: 'Quad.In' });
      const stars = Array.from({ length: 40 }, (_, i) =>
        scene.add
          .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, FLOOR_Y), 1, 1, i % 4 ? 0xfff1e8 : 0x29adff)
          .setAlpha(0)
          .setDepth(4),
      );
      scene.tweens.add({ targets: stars, alpha: 1, delay: 500, duration: 300 });
      // The Six Eyes: the blindfold comes off and a vast eye opens over the void, iris of layered blue rings with a
      // star of light in it, watching everything at once.
      const eg = scene.add.graphics();
      eg.fillStyle(0x1d2b53).fillEllipse(0, 0, 92, 34);
      eg.fillStyle(0xfff1e8).fillEllipse(0, 0, 86, 28);
      eg.fillStyle(0x1d2b53).fillCircle(0, 0, 14);
      eg.fillStyle(0x29adff).fillCircle(0, 0, 12);
      eg.fillStyle(0xc2f0ff).fillCircle(0, 0, 7);
      eg.lineStyle(1, 0x1d2b53).strokeCircle(0, 0, 9).strokeCircle(0, 0, 4);
      eg.fillStyle(0x000000).fillCircle(0, 0, 2);
      eg.fillStyle(0xfff1e8).fillRect(-5, -0.5, 10, 1).fillRect(-0.5, -5, 1, 10);
      const sixEyes = scene.add
        .container(W / 2, 46, [eg])
        .setDepth(4.5)
        .setScale(1, 0)
        .setAlpha(0.9);
      scene.tweens.add({ targets: sixEyes, scaleY: 1, delay: 650, duration: 280, ease: 'Back.Out' });
      later(scene, 1000, () => ring(scene, W / 2, 46, 0x29adff, 12, 60, 500, 2));
      // Streams of information rushing past.
      const streams = scene.time.addEvent({
        delay: 40,
        startAt: 0,
        loop: true,
        callback: () => {
          const y = Phaser.Math.Between(4, FLOOR_Y);
          const len = Phaser.Math.Between(20, 80);
          const r = scene.add
            .rectangle(-len, y, len, 1, Math.random() < 0.3 ? 0x29adff : 0xc2c3c7, 0.6)
            .setOrigin(0, 0.5)
            .setDepth(4);
          scene.tweens.add({ targets: r, x: W + len, duration: Phaser.Math.Between(250, 500), onComplete: () => r.destroy() });
        },
      });
      // Everyone frozen, drowning in it.
      later(scene, 550, () => {
        for (const t of targets) world.strike(t, 0.3 * power, 'ult', false, { freeze: 3200 }, 0);
      });
      const noise = scene.time.addEvent({
        delay: 50,
        loop: true,
        callback: () => {
          for (const t of targets) {
            if (!t.active) continue;
            const n = scene.add
              .rectangle(t.x + Phaser.Math.Between(-7, 7), t.y + Phaser.Math.Between(-8, 8), Phaser.Math.Between(1, 4), 1, 0xfff1e8)
              .setDepth(14);
            scene.tweens.add({ targets: n, alpha: 0, duration: 120, onComplete: () => n.destroy() });
          }
        },
      });
      // One blow each.
      const step = Math.min(220, 1500 / targets.length);
      targets.forEach((t, i) =>
        later(scene, 900 + i * step, () => {
          if (!t.active) return;
          const side = t.x >= p.x ? -1 : 1;
          afterimage(scene, p, p.x, p.y, 0.6, 0x29adff);
          p.body.reset(Phaser.Math.Clamp(t.x + side * 10, 6, W - 6), Math.min(t.y, FLOOR_Y - 8));
          p.facing = -side;
          ring(scene, t.x, t.y, 0x29adff, 2, 20, 220, 2);
          sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff, 0xfff1e8], 10, 16);
          cam.shake(80, 0.01);
          world.strike(t, 1.4 * power, 'ult', false, undefined, 0);
        }),
      );
      // The snap: the void shatters.
      const end = 900 + targets.length * step + 250;
      later(scene, end, () => {
        p.body.reset(home.x, home.y);
        glint(scene, p.x + p.facing * 5, p.y - 4);
        const cracks = scene.add.graphics().setDepth(9);
        for (let i = 0; i < 9; i++) {
          let x = p.x;
          let y = p.y;
          const a = (i / 9) * Math.PI * 2;
          cracks.lineStyle(1, 0xc2f0ff).beginPath().moveTo(x, y);
          for (let k = 0; k < 6; k++) {
            x += Math.cos(a + Phaser.Math.FloatBetween(-0.4, 0.4)) * 40;
            y += Math.sin(a + Phaser.Math.FloatBetween(-0.4, 0.4)) * 40;
            cracks.lineTo(x, y);
          }
          cracks.strokePath();
        }
        later(scene, 180, () => {
          streams.remove();
          noise.remove();
          cam.flash(200, 194, 240, 255);
          cam.shake(400, 0.025);
          floatText(scene, Phaser.Math.Clamp(p.x, 60, W - 60), p.y - 30, 'TAK TERBATAS!', '#c2f0ff');
          // Shards of the void falling away.
          for (let i = 0; i < 24; i++) {
            const sh = scene.add
              .triangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, FLOOR_Y), 0, 0, 8, 2, 3, 9, 0x000000, 0.9)
              .setStrokeStyle(1, 0x29adff)
              .setDepth(9);
            scene.tweens.add({ targets: sh, y: sh.y + 60, angle: 180, alpha: 0, duration: 600, onComplete: () => sh.destroy() });
          }
          [voidG, rim, cracks, sixEyes, ...stars].forEach((o) => o.destroy());
          for (const t of world.targets(p.x, p.y)) world.strike(t, 3 * power, 'ult', true);
        });
      });
    },
  },

  sakahoko: {
    // The dash finisher (step 2): a white streak hangs along his path, and he is already past the enemy.
    // The dive (Tikaman Kilat) leaves the same streak along its slant.
    onSwing: ({ p, scene }, m, step) => {
      if (step !== 2 && m !== p.weapon.dive) return;
      const x0 = p.x;
      const y0 = p.y;
      later(scene, m.ms, () => p.active && bladeLine(scene, x0, y0, p.x, p.y, 0xfff1e8, 100));
    },
    // Playful Cloud: the three-section staff, swung like a flail with nothing but Heavenly Restriction's strength
    // behind it. First a rising whip from the floor in front up into the air, then the end section snapped straight
    // out at full length, then the whole staff brought over his head and down onto the ground ahead, which caves in
    // under it and throws everything near away.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(980);
      p.setVelocityX(0);
      const g = scene.add.graphics().setDepth(13);
      const dir = (th: number) => (f > 0 ? th : Math.PI - th);
      /** Draws the staff from the hand toward front-angle `th` (0 ahead, negative up), `lag` bending the trailing sections. */
      const draw = (th: number, reach: number, lag: number): { x: number; y: number }[] => {
        const pts = [{ x: p.x + f * 4, y: p.y }];
        for (let i = 0; i < 3; i++) {
          const a = dir(th - lag * (2 - i));
          const q = pts[i];
          pts.push({ x: q.x + Math.cos(a) * (reach / 3), y: q.y + Math.sin(a) * (reach / 3) });
        }
        g.clear();
        for (let i = 0; i < 3; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          // Each section: dark outline, red lacquer, gold bands at both ends; a gap of chain between.
          const ax = a.x + (b.x - a.x) * 0.1;
          const ay = a.y + (b.y - a.y) * 0.1;
          g.lineStyle(4, 0x3b2418).lineBetween(ax, ay, b.x, b.y);
          g.lineStyle(2, 0xb3122e).lineBetween(ax, ay, b.x, b.y);
          g.fillStyle(0xd4a017)
            .fillRect(ax - 1, ay - 1, 2, 2)
            .fillRect(b.x - 1, b.y - 1, 2, 2);
          g.fillStyle(0xc2c3c7).fillRect(a.x, a.y, 1, 1);
        }
        return pts;
      };
      const strike = (
        delay: number,
        ms: number,
        from: number,
        to: number,
        r0: number,
        r1: number,
        mult: number,
        end?: (tip: { x: number; y: number }) => void,
      ) =>
        later(scene, delay, () => {
          const hit = new Set<Phaser.GameObjects.GameObject>();
          let tip = { x: p.x, y: p.y };
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: ms,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const v = tw.getValue() ?? 0;
              const pts = draw(from + (to - from) * v, r0 + (r1 - r0) * v, Math.sign(to - from) * -0.25 * (1 - v));
              tip = pts[3];
              if (Math.random() < 0.6) {
                const d = scene.add.rectangle(tip.x, tip.y, 2, 2, 0xfff1e8, 0.8).setDepth(12);
                scene.tweens.add({ targets: d, alpha: 0, duration: 160, onComplete: () => d.destroy() });
              }
              for (const t of world.targets(tip.x, tip.y)) {
                if (hit.has(t)) continue;
                if (!pts.slice(1).some((q) => Phaser.Math.Distance.Between(q.x, q.y, t.x, t.y) < 9 + t.displayWidth / 3)) continue;
                hit.add(t);
                cutMark(scene, t.x, t.y, 0xc2c3c7, 22);
                sparks(scene, t.x, t.y, [0xfff1e8, 0xb3122e], 6, 12);
                world.strike(t, mult * power, 'skill', false, undefined, 160);
              }
            },
            onComplete: () => end?.(tip),
          });
        });
      // 1: rising whip, floor in front up into the air.
      strike(0, 180, 0.35, -1.5, 40, 56, 0.9);
      // 2: the end section snapped straight out.
      strike(260, 120, 0, 0, 16, 78, 1);
      // 3: over the head and down into the ground.
      strike(480, 240, -2.7, 0.3, 50, 58, 1.4, (tip) => {
        const x = Phaser.Math.Clamp(tip.x, 0, W);
        scene.cameras.main.shake(200, 0.018);
        rocks(scene, x, FLOOR_Y - 2, 10);
        ring(scene, x, FLOOR_Y - 4, 0xc2c3c7, 4, 34, 300, 2);
        const crater = scene.add.graphics().setDepth(5);
        crater.fillStyle(0x1d0f0a).fillEllipse(x, FLOOR_Y + 1, 24, 4);
        scene.tweens.add({ targets: crater, alpha: 0, delay: 400, duration: 400, onComplete: () => crater.destroy() });
        world.area(x, FLOOR_Y - 8, 30, 1 * power, 280, 'skill');
      });
      later(scene, 960, () => g.destroy());
    },
    // Split Soul Katana: the Inventory curse spirit uncoils from around Toji's waist and spits out the Split Soul
    // Katana. With nothing but Heavenly Restriction's body he kicks off the floor, the walls and the ceiling,
    // ricocheting across the arena in a zigzag of white streaks: each leg is aimed, as he leaves, through the next enemy
    // still uncut (flyers too), and everything on the line is cut; every kick-off leaves a cratered crack. Then the
    // blade does what it is named for: a pale ghost of each victim's soul is torn out of the body and split in two.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const [L, R, T, B] = [8, W - 8, 36, FLOOR_Y - 6];
      const LEGS = 6;
      const LEG_MS = 85;
      const KICK_MS = 45;
      const BUILD = 260;
      const total = BUILD + LEGS * (LEG_MS + KICK_MS);
      p.invuln(total + 700);
      p.lock(total);
      p.setVelocity(0, 0);
      // Distance from (x, y) to the segment (x1, y1)-(x2, y2).
      const segDist = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
        const [dx, dy] = [x2 - x1, y2 - y1];
        const k = Phaser.Math.Clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        return Phaser.Math.Distance.Between(x, y, x1 + dx * k, y1 + dy * k);
      };
      // The Inventory: a pale segmented worm coiled around him opens its mouth and the katana slides out.
      const worm = scene.add.graphics().setDepth(11);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: BUILD,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          worm.clear();
          for (let i = 0; i < 14; i++) {
            const a = i * 0.5 + t * 4;
            const r = 3.4 - i * 0.12;
            const [wx, wy] = [p.x + Math.cos(a) * 9, p.y + 2 + Math.sin(a) * 4 - i * 0.6];
            worm.fillStyle(0x3b2a4f).fillCircle(wx, wy, r + 1);
            worm.fillStyle(i % 2 ? 0x83769c : 0xa58fc4).fillCircle(wx, wy, r);
          }
          worm.fillStyle(0xff004d).fillRect(p.x + 8, p.y - 1, 2, 1);
        },
        onComplete: () => worm.destroy(),
      });
      later(scene, BUILD - 80, () => glint(scene, p.x + p.facing * 8, p.y - 2));
      // A crater where he kicks off a surface: a burst of cracks splayed away from it and debris.
      const kick = (x: number, y: number) => {
        const g = scene.add.graphics().setDepth(5);
        const spokes = Array.from({ length: 7 }, (_, k) => [(k / 7) * Math.PI * 2 + Math.random() * 0.4, 5 + Math.random() * 7]);
        for (const [w, c] of [
          [3, 0x1d1d2b],
          [1, 0x83769c],
        ] as const) {
          g.lineStyle(w, c);
          for (const [a, len] of spokes) g.lineBetween(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
        }
        g.fillStyle(0x1d1d2b).fillCircle(x, y, 3);
        scene.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 400, onComplete: () => g.destroy() });
        ring(scene, x, y, 0xc2c3c7, 2, 14, 200, 2);
        sparks(scene, x, y, [0xc2c3c7, 0x5f574f, 0xfff1e8], 8, 14);
        if (y >= B - 2) rocks(scene, x, FLOOR_Y, 4);
        scene.cameras.main.shake(50, 0.006);
      };
      const cut = new Map<Phaser.GameObjects.Sprite, number>();
      let [cx, cy] = [p.x, Math.min(p.y, B)];
      const leg = (i: number) => {
        if (!p.active) return;
        // Aim as he leaves: through the nearest enemy he has not cut yet (or any enemy, or back across the arena).
        const foes = world.targets(cx, cy);
        const next =
          foes.find((t) => !cut.has(t) && Phaser.Math.Distance.Between(cx, cy, t.x, t.y) > 8) ?? foes[i % Math.max(1, foes.length)];
        // Ground enemies stand below his lowest line, so he aims at their height clamped to it (a dash along the floor).
        const aim = next ? Phaser.Math.Angle.Between(cx, cy, next.x, Math.min(next.y, B)) : cx < W / 2 ? -0.5 : Math.PI + 0.5;
        // Run the line out to the first wall, floor or ceiling it meets; if that is right where he stands (an enemy
        // pressed against the same wall), bounce the angle off it instead.
        const reach = (a: number) => {
          const [dx, dy] = [Math.cos(a), Math.sin(a)];
          const ex = dx > 0.01 ? (R - cx) / dx : dx < -0.01 ? (L - cx) / dx : Infinity;
          const ey = dy > 0.01 ? (B - cy) / dy : dy < -0.01 ? (T - cy) / dy : Infinity;
          return Math.min(ex, ey);
        };
        const a = [aim, -aim, Math.PI - aim, Math.PI + aim].find((k) => reach(k) >= 16) ?? aim;
        const [dx, dy] = [Math.cos(a), Math.sin(a)];
        const d = Math.max(12, reach(a));
        const [nx, ny] = [Phaser.Math.Clamp(cx + dx * d, L, R), Phaser.Math.Clamp(cy + dy * d, T, B)];
        const [fx, fy] = [cx, cy];
        p.facing = dx >= 0 ? 1 : -1;
        bladeLine(scene, fx, fy, nx, ny, 0xc2c3c7, 140);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: LEG_MS,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            if (p.active) p.body.reset(fx + (nx - fx) * k, fy + (ny - fy) * k);
            afterimage(scene, p, p.x, p.y, 0.3, 0x83769c);
          },
        });
        for (const t of foes) {
          // At most three cuts per enemy on the way, so a lone target is not cut on every leg.
          if (segDist(t.x, t.y, fx, fy, nx, ny) > 14 || (cut.get(t) ?? 0) >= 3) continue;
          cut.set(t, (cut.get(t) ?? 0) + 1);
          later(scene, LEG_MS / 2, () => {
            if (!t.active) return;
            cutMark(scene, t.x, t.y, 0xc2c3c7, 28, a);
            world.strike(t, 0.5 * power, 'skill', false, { freeze: 900 });
          });
        }
        [cx, cy] = [nx, ny];
        later(scene, LEG_MS, () => kick(nx, ny));
        if (i + 1 < LEGS) later(scene, LEG_MS + KICK_MS, () => leg(i + 1));
      };
      later(scene, BUILD, () => leg(0));
      // The soul is split: a violet ghost is pulled out of every enemy he cut, a vertical cut runs through it, and the
      // two halves drift apart and fade as the body takes the real wound.
      later(scene, total + 150, () => {
        const souls = [...cut.keys()].filter((t) => t.active);
        if (!souls.length) return;
        floatText(scene, W / 2, 40, 'JIWA TERBELAH!', '#c2c3ff');
        scene.cameras.main.flash(120, 194, 195, 255);
        scene.cameras.main.shake(260, 0.02);
        for (const t of souls) {
          const halves = [0, 1].map((h) => {
            const g = scene.add
              .image(t.x, t.y, t.texture.key, t.frame.name)
              .setFlipX(t.flipX)
              .setTint(0xc2c3ff)
              .setTintMode(Phaser.TintModes.FILL)
              .setAlpha(0.7)
              .setDepth(13);
            g.setCrop(h * (g.width / 2), 0, g.width / 2, g.height);
            return g;
          });
          scene.tweens.add({ targets: halves, y: t.y - 8, duration: 120 });
          later(scene, 140, () => {
            cutMark(scene, t.x, t.y - 8, 0x8a3fd1, 34, Math.PI / 2);
            halves.forEach((g, h) =>
              scene.tweens.add({
                targets: g,
                x: t.x + (h ? 8 : -8),
                angle: h ? 20 : -20,
                alpha: 0,
                duration: 380,
                onComplete: () => g.destroy(),
              }),
            );
            if (t.active) world.strike(t, 2.2 * power, 'skill', true);
          });
        }
      });
    },
    // Chain of a Thousand Miles: Toji hurls the Inverted Spear of Heaven on its endless chain. It ricochets from enemy
    // to enemy with the chain strung out behind it, then he yanks it back, dragging everything toward him, and ends it
    // with one crushing swing of Playful Cloud.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y).slice(0, 8);
      if (!targets.length) return false;
      p.invuln(targets.length * 110 + 900);
      p.lock(targets.length * 110 + 700);
      p.setVelocityX(0);
      const chain = scene.add.graphics().setDepth(12);
      const pts = [{ x: p.x, y: p.y }];
      const drawChain = () => {
        chain.clear();
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const n = Math.max(1, Math.floor(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / 3));
          for (let k = 0; k < n; k++) {
            chain.fillStyle(k % 2 ? 0x5f574f : 0xc2c3c7);
            chain.fillRect(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, 2, 1);
          }
        }
      };
      const spear = scene.add.image(p.x, p.y, 'w_sakahoko').setDepth(13);
      targets.forEach((t, i) =>
        later(scene, i * 110, () => {
          if (!t.active) return;
          const prev = pts[pts.length - 1];
          spear.setRotation(Phaser.Math.Angle.Between(prev.x, prev.y, t.x, t.y));
          scene.tweens.add({ targets: spear, x: t.x, y: t.y, duration: 90 });
          pts.push({ x: t.x, y: t.y });
          later(scene, 90, () => {
            drawChain();
            if (!t.active) return;
            cutMark(scene, t.x, t.y, 0xc2c3c7, 26);
            sparks(scene, t.x, t.y, [0xfff1e8, 0x83769c], 6, 14);
            world.strike(t, 1.2 * power, 'ult', true);
          });
        }),
      );
      const back = targets.length * 110 + 200;
      later(scene, back, () => {
        floatText(scene, p.x, p.y - 24, 'TARIK!', '#fff1e8');
        pts.length = 1;
        pts[0] = { x: p.x, y: p.y };
        scene.tweens.add({ targets: spear, x: p.x, y: p.y, duration: 200, onComplete: () => spear.destroy() });
        scene.tweens.add({ targets: chain, alpha: 0, duration: 200, onComplete: () => chain.destroy() });
        world.pull(p.x, p.y, 400, 260);
      });
      later(scene, back + 380, () => {
        const staff = scene.add.image(p.x, p.y, 'w_awan').setScale(2).setDepth(13);
        scene.tweens.add({ targets: staff, angle: 540, alpha: 0, duration: 320, onComplete: () => staff.destroy() });
        ring(scene, p.x, p.y, 0xfff1e8, 6, 56, 300, 2);
        scene.cameras.main.shake(220, 0.02);
        world.area(p.x, p.y, 50, 2.5 * power, 280, 'ult');
      });
    },
  },

  gunbai: {
    // Gunbai Jatuh: he lands fan-first and the gust blows everything around him away, streaks of wind racing out.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      for (let i = 0; i < 8; i++) {
        const f = i % 2 ? 1 : -1;
        const r = scene.add.rectangle(x + f * 6, gy - 4 - (i >> 1) * 6, 12, 1, 0xd0b0ff, 0.8).setDepth(12);
        scene.tweens.add({ targets: r, x: x + f * 60, alpha: 0, duration: 260, onComplete: () => r.destroy() });
      }
      world.area(x, gy - 8, 48, 0.5 * power, 320, 'proc');
    },
    // The gunbai shove (step 0): the fan is a shield while it moves; blows glance off it.
    onSwing: ({ p, scene }, m, step) => {
      if (step !== 0) return;
      p.invuln(m.ms + 80);
      const f = p.facing;
      const g = scene.add.graphics().setDepth(12);
      g.lineStyle(2, 0xd0b0ff, 0.8)
        .beginPath()
        .arc(p.x + f * 8, p.y, 12, f > 0 ? -1.1 : Math.PI - 1.1, f > 0 ? 1.1 : Math.PI + 1.1)
        .strokePath();
      scene.tweens.add({ targets: g, x: f * 10, alpha: 0, duration: m.ms + 60, onComplete: () => g.destroy() });
    },
    // Katon: Goka Mekkyaku (Majestic Destroyer Flame): Madara draws in a huge breath, fire glowing in his chest, and
    // breathes out not a ball but a sea of flame: a rolling wall of fire that pours out ahead of him, growing taller
    // as it goes until it reaches from the floor up into the sky, swallowing everything in front of him and leaving it
    // burning. The ground it passed over smoulders.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(1000);
      p.invuln(400);
      p.setVelocityX(0);
      // The breath drawn in: embers rush into his mouth.
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = scene.add.rectangle(p.x + Math.cos(a) * 24, p.y - 3 + Math.sin(a) * 18, 1, 1, i % 2 ? 0xffa300 : 0xff004d).setDepth(13);
        scene.tweens.add({ targets: e, x: p.x + f * 4, y: p.y - 4, delay: i * 15, duration: 220, onComplete: () => e.destroy() });
      }
      const x0 = p.x + f * 8;
      const LEN = 190;
      const RUN = 650;
      const hit = new Set<Phaser.GameObjects.GameObject>();
      later(scene, 300, () => {
        scene.cameras.main.shake(RUN, 0.007);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: RUN,
          ease: 'Sine.Out',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            const front = x0 + f * LEN * v;
            const h = 18 + 80 * v;
            // The wall's front: tongues of fire, tallest at the leading edge, embers above.
            for (let k = 0; k < 3; k++) {
              const fx = front - f * Phaser.Math.Between(0, 20);
              flameTongue(scene, fx, FLOOR_Y, h * Phaser.Math.FloatBetween(0.5, 1), 320, FIRE);
            }
            const blob = scene.add
              .circle(
                front - f * 10,
                FLOOR_Y - h * Phaser.Math.FloatBetween(0.2, 0.7),
                Phaser.Math.Between(6, 12),
                Math.random() < 0.5 ? 0xffa300 : 0xff004d,
                0.6,
              )
              .setDepth(12);
            scene.tweens.add({ targets: blob, scale: 1.8, alpha: 0, y: blob.y - 10, duration: 360, onComplete: () => blob.destroy() });
            for (const t of world.targets(front, FLOOR_Y)) {
              if (hit.has(t) || (t.x - front) * f > 6 || (t.x - x0) * f < -8 || t.y < FLOOR_Y - h - 6) continue;
              hit.add(t);
              world.strike(t, 2 * power, 'skill', false, { burn: 0.4 }, 200);
            }
          },
          onComplete: () => {
            // The ground it rolled over smoulders.
            const scorch = scene.add
              .rectangle(Math.min(x0, x0 + f * LEN), FLOOR_Y, LEN, 3, 0x2a0a0a, 0.8)
              .setOrigin(0, 0.5)
              .setDepth(3);
            scene.tweens.add({ targets: scorch, alpha: 0, delay: 500, duration: 600, onComplete: () => scorch.destroy() });
          },
        });
      });
    },
    // Tengai Shinsei: Madara raises one hand and the sky goes dark and red. A colossal meteor tears through the clouds,
    // its shadow spreading over the field as it falls; its line is chosen as it falls, the one that swats the most
    // flyers out of the air on the way down and lands where the crowd is thickest. It smashes into the ground: a
    // blinding impact, a fountain of rock, shockwaves running along the floor to both walls, a smoking crater. And as
    // the dust rises a second, even bigger meteor follows onto whatever is still standing.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.lock(700);
      p.invuln(900);
      p.setVelocityX(0);
      const cam = scene.cameras.main;
      const segDist = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
        const [dx, dy] = [x2 - x1, y2 - y1];
        const k = Phaser.Math.Clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        return Phaser.Math.Distance.Between(x, y, x1 + dx * k, y1 + dy * k);
      };
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x3a0a0a, 0.5)
        .setOrigin(0)
        .setDepth(3)
        .setAlpha(0);
      scene.tweens.add({ targets: sky, alpha: 1, duration: 300 });
      scene.tweens.add({ targets: sky, alpha: 0, delay: 2300, duration: 500, onComplete: () => sky.destroy() });
      // His raised hand: chakra spiralling up from it into the sky.
      for (let i = 0; i < 12; i++)
        later(scene, i * 30, () => {
          const m = scene.add.rectangle(p.x + p.facing * 3, p.y - 10, 1, 3, i % 2 ? 0xd0b0ff : 0xff004d).setDepth(13);
          scene.tweens.add({
            targets: m,
            x: m.x + Phaser.Math.Between(-8, 8),
            y: m.y - 50,
            alpha: 0,
            duration: 400,
            onComplete: () => m.destroy(),
          });
        });
      const touched = new Set<Phaser.GameObjects.GameObject>();
      const drop = (R: number, at: number, mult: number, first: boolean) =>
        later(scene, at, () => {
          // Aim now: land on the enemy with the most others around it, coming in at the slant that also crosses the
          // most enemies in the air on the way down; the second meteor goes for those the first one missed.
          const all = world.targets(p.x, p.y);
          const missed = all.filter((t) => !touched.has(t));
          const foes = missed.length ? missed : all;
          let best = { x: foes[0]?.x ?? p.x + p.facing * 60, a: 0.5, n: -1 };
          for (const c of foes)
            for (const a of [-0.7, -0.35, 0.35, 0.7]) {
              const lx = Phaser.Math.Clamp(c.x, 20, W - 20);
              const [sx, sy] = [lx - Math.tan(a) * (FLOOR_Y + 40), -40];
              const n =
                foes.filter((t) => Math.abs(t.x - lx) < R * 3 && t.y > FLOOR_Y - 40).length +
                foes.filter((t) => segDist(t.x, t.y, sx, sy, lx, FLOOR_Y) < R + 8).length;
              if (n > best.n) best = { x: lx, a, n };
            }
          const lx = best.x;
          const [sx, sy] = [lx - Math.tan(best.a) * (FLOOR_Y + 40), -40];
          // Its shadow on the floor, darkening and spreading as it falls.
          const shadow = scene.add
            .ellipse(lx, FLOOR_Y - 1, R * 2, 4, 0x000000, 0.5)
            .setScale(0.2)
            .setDepth(4);
          scene.tweens.add({ targets: shadow, scale: 1.6, duration: 650, ease: 'Quad.In' });
          // The meteor: dark rim, rocky body, a lit flank toward the sky, craters, and a mantle of fire around it.
          const rock = scene.add.graphics();
          rock.fillStyle(0xff004d, 0.35).fillCircle(0, 0, R + 4);
          rock.fillStyle(0xffa300, 0.55).fillCircle(0, 0, R + 2);
          rock.fillStyle(0x1d1416).fillCircle(0, 0, R);
          rock.fillStyle(0x5f4a3f).fillCircle(0, 0, R - 2);
          rock.fillStyle(0x8a6a50).fillCircle(-R * 0.25, -R * 0.25, R * 0.6);
          rock.fillStyle(0xc2a080).fillCircle(-R * 0.4, -R * 0.4, R * 0.25);
          for (const [cx, cy, cr] of [
            [0.35, 0.2, 0.22],
            [-0.2, 0.45, 0.15],
            [0.1, -0.45, 0.13],
          ])
            rock
              .fillStyle(0x3b2a24)
              .fillCircle(cx * R, cy * R, cr * R)
              .fillStyle(0x8a6a50)
              .fillCircle(cx * R - 1, cy * R - 1, cr * R * 0.5);
          const met = scene.add.container(sx, sy, [rock]).setDepth(12);
          const struck = new Set<Phaser.GameObjects.GameObject>();
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 650,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              met.setPosition(sx + (lx - sx) * k, sy + (FLOOR_Y - sy) * k).setAngle(k * 120);
              // A tail of fire and smoke streaming behind it.
              const tail = scene.add
                .circle(
                  met.x + Phaser.Math.Between(-R / 2, R / 2),
                  met.y - R * 0.6,
                  Phaser.Math.Between(3, R / 2),
                  [0xffa300, 0xff004d, 0x5f574f][Phaser.Math.Between(0, 2)],
                  0.7,
                )
                .setDepth(11);
              scene.tweens.add({
                targets: tail,
                x: tail.x - (lx - sx) * 0.08,
                y: tail.y - 14,
                scale: 0.2,
                alpha: 0,
                duration: 400,
                onComplete: () => tail.destroy(),
              });
              // Flyers in its way are swatted out of the sky.
              for (const t of world.targets(met.x, met.y)) {
                if (struck.has(t) || Phaser.Math.Distance.Between(t.x, t.y, met.x, met.y) > R + 8) continue;
                struck.add(t);
                touched.add(t);
                world.strike(t, 0.8 * power, 'skill', false, { burn: 0.3 });
                sparks(scene, t.x, t.y, [0xffa300, 0xfff1e8], 8, 16);
              }
            },
            onComplete: () => {
              met.destroy();
              shadow.destroy();
              // Impact.
              if (first) cam.flash(180, 255, 163, 0);
              cam.shake(first ? 350 : 500, first ? 0.025 : 0.035);
              explosion(scene, lx, FLOOR_Y - R * 0.6, R * 2.4);
              rocks(scene, lx, FLOOR_Y, 12);
              ring(scene, lx, FLOOR_Y - 6, 0xffec27, R, R * 4, 400, 3);
              // A dust column rising high over the crater (it reaches the air above it).
              for (let i = 0; i < 10; i++) {
                const d = scene.add
                  .circle(lx + Phaser.Math.Between(-R, R), FLOOR_Y - 6, Phaser.Math.Between(4, 8), i % 2 ? 0x5f574f : 0x83769c, 0.75)
                  .setDepth(12);
                scene.tweens.add({
                  targets: d,
                  y: FLOOR_Y - Phaser.Math.Between(40, 90),
                  scale: 2,
                  alpha: 0,
                  duration: 800,
                  onComplete: () => d.destroy(),
                });
              }
              const crater = scene.add.graphics().setDepth(5);
              crater
                .fillStyle(0x1d1416)
                .fillEllipse(lx, FLOOR_Y, R * 3, 6)
                .fillStyle(0xff004d, 0.8)
                .fillEllipse(lx, FLOOR_Y - 1, R * 1.6, 2);
              scene.tweens.add({ targets: crater, alpha: 0, delay: 900, duration: 600, onComplete: () => crater.destroy() });
              for (const t of world.targets(lx, FLOOR_Y))
                if (Phaser.Math.Distance.Between(t.x, t.y, lx, FLOOR_Y - 10) < R * 3.2) touched.add(t);
              world.area(lx, FLOOR_Y - 10, R * 3.2, mult * power, 260, 'skill', { burn: 0.4 });
              // Shockwaves run along the floor to both walls, knocking down everything on the ground they pass.
              for (const dir of [-1, 1]) {
                const wave = scene.add.rectangle(lx, FLOOR_Y - 4, 6, 8, 0xffa300, 0.7).setDepth(12);
                const hit = new Set<Phaser.GameObjects.GameObject>();
                scene.tweens.add({
                  targets: wave,
                  x: dir > 0 ? W + 8 : -8,
                  scaleY: 0.3,
                  alpha: 0.2,
                  duration: 450,
                  onUpdate: () => {
                    if (Math.random() < 0.4) rocks(scene, wave.x, FLOOR_Y, 1);
                    for (const t of world.targets(wave.x, FLOOR_Y)) {
                      if (hit.has(t) || Math.abs(t.x - wave.x) > 8 || t.y < FLOOR_Y - 26) continue;
                      hit.add(t);
                      world.strike(t, 0.35 * power, 'skill', false);
                    }
                  },
                  onComplete: () => wave.destroy(),
                });
              }
            },
          });
        });
      drop(13, 350, 0.9, true);
      // "Even if you dodge the first...": the second, bigger one.
      later(scene, 1150, () => floatText(scene, W / 2, 40, 'SATU LAGI!', '#ff004d'));
      drop(19, 1150, 1.4, false);
    },
    // Susanoo Sempurna (Perfect Susanoo): blue chakra boils up around Madara and the giant builds itself out of the
    // floor behind him, bones first (a spine and a ribcage), then flesh, then armor: broad pauldrons, the long-nosed
    // tengu helm with its crescent crest, and two great wings spreading over the field. Its eyes light. It draws two
    // swords: the first sweeps low across the ground in front, the second cuts across the sky (whatever flies there),
    // then both rise together and come down in a cross that splits the whole arena. TERBELAH!
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const cam = scene.cameras.main;
      p.invuln(3400);
      p.lock(3100);
      p.setVelocityX(0);
      const sx = Phaser.Math.Clamp(p.x - f * 6, 30, W - 30);
      const giant = perfectSusanoo(scene, sx, FLOOR_Y + 2, f);
      // Chakra boiling up around him.
      for (let i = 0; i < 16; i++)
        later(scene, i * 25, () => {
          const c = scene.add.circle(sx + Phaser.Math.Between(-24, 24), FLOOR_Y - 2, Phaser.Math.Between(2, 4), 0x29adff, 0.6).setDepth(9);
          scene.tweens.add({
            targets: c,
            y: c.y - Phaser.Math.Between(20, 50),
            scale: 0.3,
            alpha: 0,
            duration: 500,
            onComplete: () => c.destroy(),
          });
        });
      scene.tweens.add({ targets: giant.bones, alpha: 0.9, duration: 300 });
      scene.tweens.add({ targets: giant.flesh, alpha: 0.9, delay: 350, duration: 400 });
      scene.tweens.add({ targets: giant.wings, alpha: 0.85, scaleX: f, duration: 350, delay: 650, ease: 'Back.Out' });
      later(scene, 950, () => {
        cam.shake(300, 0.008);
        giant.eyes.setAlpha(1);
        ring(scene, sx + f * 6, FLOOR_Y - 96, 0xc2f0ff, 2, 14, 300);
      });
      const hand1 = { x: sx + f * 40, y: FLOOR_Y - 46 };
      const hand2 = { x: sx - f * 24, y: FLOOR_Y - 58 };
      const sword1 = susanooBlade(scene, hand1.x, hand1.y, 84)
        .setScale(f, 0)
        .setAngle(-f * 40);
      const sword2 = susanooBlade(scene, hand2.x, hand2.y, 84)
        .setScale(f, 0)
        .setAngle(-f * 100);
      scene.tweens.add({ targets: [sword1, sword2], scaleY: 1, delay: 1000, duration: 200, ease: 'Back.Out' });
      const sweep = (
        sw: Phaser.GameObjects.Container,
        from: number,
        to: number,
        hits: (t: Phaser.GameObjects.Sprite) => boolean,
        mult: number,
      ) => {
        sw.setAngle(f * from);
        scene.tweens.add({
          targets: sw,
          angle: f * to,
          duration: 220,
          ease: 'Quad.In',
          onUpdate: () => {
            // A blue wake behind the blade.
            const g = scene.add.graphics().setDepth(11);
            const rad = Phaser.Math.DegToRad(sw.angle * f - 90);
            g.lineStyle(4, 0x29adff, 0.35).lineBetween(sw.x, sw.y, sw.x + f * Math.cos(rad) * 84, sw.y + Math.sin(rad) * 84);
            scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
          },
          onComplete: () => {
            cam.shake(220, 0.016);
            for (const t of world.targets(sx, FLOOR_Y)) {
              if (!hits(t)) continue;
              cutMark(scene, t.x, t.y, 0x29adff, 36);
              sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff], 8, 18);
              world.strike(t, mult * power, 'ult', false, undefined, 220);
            }
          },
        });
      };
      const ahead = (t: Phaser.GameObjects.Sprite) => (t.x - sx) * f > -20 && Math.abs(t.x - sx) < 170;
      // Low across the ground in front, then high across the sky.
      later(scene, 1300, () => sweep(sword1, -40, 125, (t) => ahead(t) && t.y > FLOOR_Y - 60, 1.6));
      later(scene, 1800, () => sweep(sword2, -100, 60, (t) => ahead(t) && t.y <= FLOOR_Y - 40, 1.6));
      // The cross that splits the arena.
      later(scene, 2300, () => {
        scene.tweens.add({ targets: [sword1, sword2], angle: 0, duration: 200, ease: 'Quad.Out' });
      });
      later(scene, 2560, () => {
        scene.tweens.add({ targets: sword1, angle: f * 135, duration: 120, ease: 'Quad.In' });
        scene.tweens.add({ targets: sword2, angle: f * 120, duration: 120, ease: 'Quad.In' });
      });
      later(scene, 2690, () => {
        cam.flash(160, 41, 173, 255);
        cam.shake(450, 0.03);
        bladeLine(scene, 0, 24, W, FLOOR_Y, 0x29adff, 220);
        bladeLine(scene, 0, FLOOR_Y, W, 24, 0x29adff, 220);
        floatText(scene, W / 2, 60, 'TERBELAH!', '#c2f0ff');
        for (const t of world.targets(sx, FLOOR_Y)) {
          cutMark(scene, t.x, t.y, 0xc2f0ff, 30);
          world.strike(t, 2.6 * power, 'ult', true, undefined, 260);
        }
      });
      later(scene, 3000, () => {
        const all = [giant.bones, giant.flesh, giant.wings, giant.eyes, sword1, sword2];
        sparks(scene, sx, FLOOR_Y - 60, [0x29adff, 0xc2f0ff], 24, 70);
        scene.tweens.add({ targets: all, alpha: 0, duration: 400, onComplete: () => all.forEach((o) => o.destroy()) });
      });
    },
  },

  mokuton: {
    // Hutan Jatuh: a tree bursts up where he lands and its roots grab at everything near it.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      tree(scene, x, 34, 700, 0);
      leafBurst(scene, x, gy - 30, 10);
      for (const t of world.targets(x, gy))
        if (Math.abs(t.x - x) < 36 && t.y > gy - 34) world.strike(t, 0.5 * power, 'proc', false, { freeze: 600 }, 0);
    },
    // The second step: roots spear up out of the floor ahead of him, one after another.
    onSwing: ({ p, world, scene }, _m, step) => {
      if (step !== 1 || !p.grounded) return;
      const f = p.facing;
      const hit = new Set<Phaser.GameObjects.GameObject>();
      for (let k = 0; k < 3; k++)
        later(scene, 60 + k * 50, () => {
          const x = p.x + f * (18 + k * 14);
          if (x < 0 || x > W) return;
          const g = scene.add.graphics().setDepth(11);
          const h = 16 + k * 2;
          g.fillStyle(0x3b2418).fillTriangle(-4, 0, 4, 0, 0, -h - 2);
          g.fillStyle(0x7a5c44).fillTriangle(-3, 0, 3, 0, 0, -h);
          g.fillStyle(0x00e436).fillRect(1, -h * 0.6, 2, 1);
          g.setPosition(x, FLOOR_Y + 2).setScale(1, 0);
          scene.tweens.add({ targets: g, scaleY: 1, duration: 80, yoyo: true, hold: 160, onComplete: () => g.destroy() });
          leafBurst(scene, x, FLOOR_Y - h, 3);
          for (const t of world.targets(x, FLOOR_Y)) {
            if (hit.has(t) || Math.abs(t.x - x) > 9 || t.y < FLOOR_Y - 34) continue;
            hit.add(t);
            world.strike(t, 0.5, 'proc', false, { freeze: 300 }, 100);
          }
        });
    },
    // Jukai Kotan: he slaps both palms to the ground and a forest erupts in a wave ahead of him: trunk after trunk
    // bursts up, canopies spread, and branches whip out to snare anything flying nearby. Everything caught is bound.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(400);
      p.setVelocityX(0);
      rocks(scene, p.x + f * 8, FLOOR_Y, 5);
      const hit = new Set<Phaser.GameObjects.GameObject>();
      const bind = (t: Phaser.GameObjects.Sprite, mult: number) => {
        if (hit.has(t) || !t.active) return;
        hit.add(t);
        world.strike(t, mult * power, 'skill', false, { freeze: 1400 });
        leafBurst(scene, t.x, t.y, 6);
      };
      for (let i = 0; i < 5; i++)
        later(scene, 80 + i * 90, () => {
          const x = Phaser.Math.Clamp(p.x + f * (26 + i * 28), 8, W - 8);
          const h = Phaser.Math.Between(46, 70) + i * 4;
          tree(scene, x, h, 1500 - i * 90, f);
          rocks(scene, x, FLOOR_Y, 3);
          scene.cameras.main.shake(90, 0.008);
          for (const t of world.targets(x, FLOOR_Y)) {
            if (Math.abs(t.x - x) < 18 && t.y > FLOOR_Y - h - 16) bind(t, 1.3);
            else if (Math.abs(t.x - x) < 70 && t.y < FLOOR_Y - 20 && t.y > FLOOR_Y - h - 60) {
              // A branch lashes out from the trunk to the enemy in the air.
              vine(scene, x, Math.max(t.y, FLOOR_Y - h), t.x, t.y);
              bind(t, 1);
            }
          }
        });
    },
    // Mokuryu no Jutsu: a great wooden dragon bursts from the ground at the wall behind him and swims the whole width
    // of the arena, rearing up and diving down at each enemy ahead of it to bite and bind it, and drawing their chakra
    // back into him. Whatever it slips past (too high, too fast) is whipped by a branch shooting off its body.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const x0 = f > 0 ? 6 : W - 6;
      const y0 = FLOOR_Y - 36;
      p.lock(350);
      p.setVelocityX(0);
      rocks(scene, x0, FLOOR_Y, 6);
      scene.cameras.main.shake(200, 0.012);
      // The body: a thick barked trunk drawn along the head's recent path, tapering to the tail, with a spined back.
      const TAIL = 60;
      const body = scene.add.graphics().setDepth(12);
      const drawBody = () => {
        body.clear();
        for (const [w, c] of [
          [12, 0x4a2a1a],
          [9, 0x7a4a2a],
          [3, 0xab5236],
        ] as const) {
          for (let i = 1; i < path.length; i++) {
            const k = 1 - i / TAIL;
            body
              .lineStyle(Math.max(1, w * k), c)
              .lineBetween(
                path[i - 1].x,
                path[i - 1].y + (c === 0xab5236 ? -2 * k : 0),
                path[i].x,
                path[i].y + (c === 0xab5236 ? -2 * k : 0),
              );
          }
        }
        for (let i = 4; i < path.length; i += 5) {
          const k = 1 - i / TAIL;
          const { x, y } = path[i];
          body.fillStyle(i % 10 ? 0x008751 : 0x00e436).fillTriangle(x - 3 * k, y - 4 * k, x + 3 * k, y - 4 * k, x - f * 4 * k, y - 11 * k);
        }
      };
      const head = scene.add.container(x0, FLOOR_Y + 8).setDepth(13);
      head.add([
        // Horns swept back, the snout, an open jaw and a glowing eye (drawn facing right; flipped by the scale).
        scene.add.triangle(-8, -9, 0, 0, -12, -6, -2, 4, 0x4a2a1a),
        scene.add.triangle(-3, -10, 0, 0, -8, -9, 2, 3, 0x7a4a2a),
        scene.add.ellipse(2, 0, 22, 13, 0xab5236).setStrokeStyle(1, 0x4a2a1a),
        scene.add.rectangle(13, -2, 10, 5, 0xab5236).setStrokeStyle(1, 0x4a2a1a),
        scene.add.triangle(12, 6, 0, 0, 10, -1, 1, 4, 0x7a4a2a),
        scene.add.rectangle(16, 2, 1, 2, 0xfff1e8),
        scene.add.rectangle(5, -3, 3, 2, 0xffec27),
      ]);
      head.setScale(f * 1.4, 1.4);
      const path: { x: number; y: number }[] = [];
      const bitten = new Set<Phaser.GameObjects.GameObject>();
      const LEN = 1400;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: LEN,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          // Rises out of the ground, then swims forward in waves the width of the arena.
          const rise = Math.min(1, t * 6);
          const hx = x0 + f * t * (W + 50);
          let hy = Phaser.Math.Linear(FLOOR_Y + 8, y0 + Math.sin(t * Math.PI * 5) * 26, rise);
          // It hunts: the closest unbitten enemy just ahead pulls the head up or down to it.
          const prey = world
            .targets(hx, hy)
            .filter((e) => !bitten.has(e) && f * (e.x - hx) > -12 && f * (e.x - hx) < 60)
            .sort((a, b) => f * (a.x - b.x))[0];
          if (prey && rise === 1) hy = Phaser.Math.Linear(hy, prey.y, 1 - Math.max(0, f * (prey.x - hx)) / 60);
          head.setPosition(hx, hy).setRotation(Math.cos(t * Math.PI * 5) * 0.4 * f);
          path.unshift({ x: hx, y: hy });
          if (path.length > TAIL) path.pop();
          drawBody();
          for (const e of world.targets(hx, hy)) {
            if (bitten.has(e)) continue;
            const bite = Phaser.Math.Distance.Between(hx, hy, e.x, e.y) <= 24;
            // Left behind: a branch lashes out of the passing body instead of the jaws.
            const passed = f * (hx - e.x) > 30;
            if (!bite && !passed) continue;
            bitten.add(e);
            if (passed) vine(scene, hx - f * 30, Phaser.Math.Clamp(hy, 20, FLOOR_Y - 6), e.x, e.y);
            world.strike(e, (bite ? 2.2 : 1.6) * power, 'skill', true, { freeze: 1500 });
            leafBurst(scene, e.x, e.y, 8);
            scene.cameras.main.shake(60, 0.008);
            // Mokuton drains chakra: a green mote flies back and heals him.
            const mote = scene.add.circle(e.x, e.y, 2, 0x00e436).setDepth(14);
            scene.tweens.add({
              targets: mote,
              x: p.x,
              y: p.y,
              duration: 400,
              onComplete: () => {
                mote.destroy();
                if (p.active) p.heal(2);
              },
            });
          }
        },
        onComplete: () => {
          for (const o of [head, body]) scene.tweens.add({ targets: o, alpha: 0, duration: 200, onComplete: () => o.destroy() });
        },
      });
    },
    // Mokuton: Shin Susenju: Sage Mode flares, the ground splits and the colossal wooden Buddha rises behind the
    // battlefield, a halo of a thousand arms spread behind it. The arms shoot out one after another, each hand
    // crushing an enemy, until the Buddha brings its two great palms together across the whole field.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(4200);
      p.lock(1000);
      p.setVelocityX(0);
      const cam = scene.cameras.main;
      cam.flash(200, 255, 163, 0);
      // Sage Mode: an orange aura flickers around him.
      for (let i = 0; i < 16; i++)
        later(scene, i * 60, () => {
          const fl = scene.add.rectangle(p.x + Phaser.Math.Between(-6, 6), p.y + 6, 1, 3, i % 2 ? 0xffa300 : 0xffec27).setDepth(11);
          scene.tweens.add({ targets: fl, y: fl.y - 18, alpha: 0, duration: 400, onComplete: () => fl.destroy() });
        });
      floatText(scene, p.x, p.y - 34, 'SENNIN MODO', '#ffa300');
      const bx = W / 2;
      const cy = FLOOR_Y - 110;
      cam.shake(700, 0.012);
      for (let i = 0; i < 8; i++) later(scene, i * 70, () => rocks(scene, Phaser.Math.Between(10, W - 10), FLOOR_Y, 3));
      // The halo: a golden disc behind its head and a fan of arms spread out behind its shoulders.
      const halo = scene.add.graphics().setDepth(2).setAlpha(0);
      halo.fillStyle(0xffec27, 0.12).fillCircle(bx, cy, 76);
      halo.lineStyle(2, 0xffa300, 0.5).strokeCircle(bx, cy, 76);
      for (let i = 0; i < 29; i++) {
        const a = Math.PI * (0.92 + (i / 28) * 1.16);
        const [r0, r1] = [30, 58 + (i % 2) * 8];
        halo
          .lineStyle(4, i % 2 ? 0x7a4a2a : 0xab5236)
          .lineBetween(bx + Math.cos(a) * r0, cy + Math.sin(a) * r0, bx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        halo.fillStyle(0xab5236).fillCircle(bx + Math.cos(a) * (r1 + 3), cy + Math.sin(a) * (r1 + 3), 3);
      }
      const buddha = scene.add
        .image(bx, FLOOR_Y + 144, 'buddha')
        .setOrigin(0.5, 1)
        .setScale(6)
        .setAlpha(0.85)
        .setDepth(3);
      scene.tweens.add({ targets: buddha, y: FLOOR_Y, duration: 600, ease: 'Back.Out' });
      scene.tweens.add({ targets: halo, alpha: 1, delay: 350, duration: 400 });
      // The Thousand-Armed barrage: each arm shoots out of the halo toward an enemy, its hand crushing it.
      const arms = scene.add.graphics().setDepth(12);
      const live: { ax: number; ay: number; hand: Phaser.GameObjects.Image }[] = [];
      const drawArms = () => {
        arms.clear();
        for (const { ax, ay, hand } of live) {
          arms.lineStyle(5, 0x4a2a1a).lineBetween(ax, ay, hand.x, hand.y);
          arms.lineStyle(3, 0xab5236).lineBetween(ax, ay, hand.x, hand.y);
        }
      };
      const ticker = scene.time.addEvent({ delay: 16, loop: true, callback: drawArms });
      for (let i = 0; i < 26; i++)
        later(scene, 800 + i * 70, () => {
          const foes = world.targets(bx, cy);
          if (!foes.length) return;
          const t = foes[i % foes.length];
          const a = Phaser.Math.Angle.Between(bx, cy, t.x, t.y) + Phaser.Math.FloatBetween(-0.5, 0.5);
          const ax = bx + Math.cos(a) * 60;
          const ay = cy + Math.sin(a) * 60;
          const hand = scene.add
            .image(ax, ay, 'w_telapak')
            .setScale(2.5)
            .setRotation(Phaser.Math.Angle.Between(ax, ay, t.x, t.y) + Math.PI / 2)
            .setDepth(13);
          const arm = { ax, ay, hand };
          live.push(arm);
          const [tx, ty] = [t.x, t.y];
          scene.tweens.add({
            targets: hand,
            x: tx,
            y: ty,
            duration: 140,
            ease: 'Quad.In',
            onComplete: () => {
              world.area(tx, ty, 22, 1.1 * power, 140, 'ult');
              leafBurst(scene, tx, ty, 5);
              rocks(scene, tx, Math.min(ty + 6, FLOOR_Y), 2);
              cam.shake(60, 0.008);
              scene.tweens.add({
                targets: hand,
                x: ax,
                y: ay,
                alpha: 0,
                delay: 120,
                duration: 200,
                onComplete: () => (live.splice(live.indexOf(arm), 1), hand.destroy()),
              });
            },
          });
        });
      // Gassho: two colossal palms sweep in from the edges and clap together across the field.
      later(scene, 2800, () => {
        floatText(scene, W / 2, 40, 'GASSHO!', '#ffec27');
        const y = FLOOR_Y - 34;
        const palms = [-1, 1].map((s) =>
          scene.add
            .image(bx + s * (W / 2 + 40), y, 'w_telapak')
            .setScale(9)
            .setDepth(13),
        );
        scene.tweens.add({
          targets: palms,
          x: (_: unknown, __: string, ___: number, i: number) => bx + (i ? 14 : -14),
          duration: 260,
          ease: 'Quad.In',
          onComplete: () => {
            cam.flash(300, 255, 236, 39);
            cam.shake(500, 0.035);
            ring(scene, bx, y, 0xffec27, 10, 220, 600, 3);
            leafBurst(scene, bx, y, 30);
            for (const t of world.targets(bx, y)) world.strike(t, 3 * power, 'ult', true, { freeze: 600 });
            scene.tweens.add({ targets: palms, alpha: 0, delay: 250, duration: 300, onComplete: () => palms.forEach((o) => o.destroy()) });
          },
        });
      });
      later(scene, 3400, () => {
        ticker.remove();
        arms.destroy();
        scene.tweens.add({ targets: [buddha, halo], alpha: 0, duration: 500, onComplete: () => (buddha.destroy(), halo.destroy()) });
      });
    },
  },

  kunai: {
    // Kunai Jatuh: three kunai with explosive tags stick in the floor ahead and go off one after another.
    onDiveLand: ({ p, world, scene, power }, x, gy) => {
      const f = p.facing;
      [10, 26, 42].forEach((d, i) => {
        const kx = Phaser.Math.Clamp(x + f * d, 4, W - 4);
        const k = scene.add
          .image(kx, gy - 3, 'w_kunai')
          .setRotation(Math.PI / 2)
          .setDepth(11);
        later(scene, 200 + i * 90, () => {
          k.destroy();
          explosion(scene, kx, gy - 4, 12);
          world.area(kx, gy - 6, 16, 0.5 * power, 140, 'proc', { burn: 0.1 });
        });
      });
    },
    // Shunshin (step 0): crows scatter from where he stood a moment ago.
    onSwing: ({ p, scene }, _m, step) => {
      if (step !== 0) return;
      for (let i = 0; i < 5; i++) {
        const crow = scene.add.graphics().setDepth(12).fillStyle(0x1c1c28);
        crow.fillTriangle(-3, 0, 0, -2, 0, 1).fillTriangle(3, 0, 0, -2, 0, 1);
        crow.setPosition(p.x + Phaser.Math.Between(-4, 4), p.y + Phaser.Math.Between(-5, 5));
        scene.tweens.add({
          targets: crow,
          x: crow.x - p.facing * Phaser.Math.Between(6, 16),
          y: crow.y - Phaser.Math.Between(8, 18),
          alpha: 0,
          duration: 450,
          onComplete: () => crow.destroy(),
        });
      }
    },
    // Amaterasu: black flames cling to the nearest enemy and burn for five seconds, leaping to anything that comes close.
    skill: ({ p, world, scene, power }) => {
      const first = world.targets(p.x, p.y)[0];
      if (!first) return false;
      // Mangekyo: a red glint in Itachi's eye.
      const glint = scene.add.circle(p.x + p.facing * 2, p.y - 3, 2, 0xff004d).setDepth(13);
      scene.tweens.add({ targets: glint, scale: 3, alpha: 0, duration: 300, onComplete: () => glint.destroy() });
      const burning = new Set<Phaser.GameObjects.Sprite>();
      const ignite = (t: Phaser.GameObjects.Sprite) => {
        if (burning.has(t) || burning.size >= 6) return;
        burning.add(t);
        const flame = scene.add.image(t.x, t.y, 'amaterasu').setScale(1.5).setDepth(13);
        scene.tweens.add({ targets: flame, scaleY: 2, yoyo: true, repeat: -1, duration: 150 });
        const follow = () => (t.active ? flame.setPosition(t.x, t.y - 2) : flame.setVisible(false));
        scene.events.on('update', follow);
        const out = () => {
          scene.events.off('update', follow);
          flame.destroy();
        };
        for (let i = 0; i < 12; i++) {
          later(scene, i * 400, () => {
            if (!t.active) return;
            world.strike(t, 0.35 * power, 'skill', false);
            // The black flames leap to anything that comes close, any time while they burn.
            for (const o of world.targets(t.x, t.y)) if (o !== t && Phaser.Math.Distance.Between(o.x, o.y, t.x, t.y) < 36) ignite(o);
          });
        }
        later(scene, 12 * 400, out);
      };
      world.strike(first, 1 * power, 'skill', false);
      ignite(first);
    },
    // Totsuka no Tsurugi: Itachi's red Susanoo forms around him, the ribcage first, then the skull, the Yata Mirror
    // raised on one arm (nothing gets through it: he cannot be hurt) and the sake gourd in the other hand. From the
    // gourd pours the Totsuka Blade, a sword of liquid spirit-fire that lances out at one enemy after another (aimed at
    // each as it thrusts, flyers too). Whatever it pierces is caught in a spiral seal and held; then the seal closes:
    // each victim is drawn into the gourd as wisps of red light, sealed into a dream world for eternity.
    fusion: ({ p, world, scene, power }) => {
      const first = world.targets(p.x, p.y);
      if (!first.length) return false;
      const f = p.facing;
      const THRUSTS = Phaser.Math.Clamp(first.length, 3, 6);
      const STEP = 200;
      const SEAL = 450 + THRUSTS * STEP + 200;
      p.invuln(SEAL + 500);
      p.lock(SEAL + 200);
      p.setVelocity(0, 0);
      const { x, y } = p;
      // The Susanoo: spine, five ribs ringing his body, collarbones and a horned skull with burning eyes; built in the
      // red and orange of Itachi's chakra (dark rim, mid-tone, light core on every bone).
      const sus = scene.add.graphics();
      for (const [w, c, al] of [
        [4, 0x7e2553, 0.7],
        [2, 0xff004d, 0.85],
        [1, 0xff77a8, 1],
      ] as const) {
        sus.lineStyle(w, c, al).lineBetween(0, 10, 0, -30);
        for (let k = 0; k < 5; k++) sus.strokeEllipse(0, -18 + k * 6, 30 - k * 2, 7);
        sus.lineBetween(-16, -26, 16, -26);
        sus.strokeCircle(0, -38, 8);
        sus.lineBetween(-6, -44, -11, -54).lineBetween(6, -44, 11, -54);
      }
      sus.fillStyle(0xffa300).fillRect(-4, -40, 3, 2).fillRect(2, -40, 3, 2);
      // The Yata Mirror on the front arm: a round shield with a gold rim and a pale glassy face.
      const mx = f * 22;
      sus.fillStyle(0x7e2553).fillCircle(mx, -12, 11);
      sus.fillStyle(0xffec27).fillCircle(mx, -12, 10);
      sus.fillStyle(0xff77a8, 0.9).fillCircle(mx, -12, 8);
      sus.fillStyle(0xfff1e8, 0.8).fillRect(mx - 4, -17, 2, 6);
      sus.lineStyle(1, 0x7e2553).strokeCircle(mx, -12, 4);
      // The gourd in the back hand, its mouth tilted forward.
      const gx = -f * 18;
      const gy = -30;
      sus
        .fillStyle(0x4a2a1a)
        .fillCircle(gx, gy + 10, 7)
        .fillCircle(gx, gy + 1, 5);
      sus
        .fillStyle(0xab5236)
        .fillCircle(gx, gy + 10, 6)
        .fillCircle(gx, gy + 1, 4);
      sus.fillStyle(0xffa300).fillCircle(gx - 2, gy + 8, 2);
      sus.fillStyle(0xff004d).fillRect(gx - 5, gy + 5, 10, 1);
      const S = 1.4;
      const susanoo = scene.add
        .container(x, y + 4, [sus])
        .setDepth(11)
        .setScale(0.2, 0)
        .setAlpha(0.85);
      scene.tweens.add({ targets: susanoo, scaleX: S, scaleY: S, duration: 350, ease: 'Back.Out' });
      scene.tweens.add({ targets: susanoo, alpha: 0, scaleY: 1.2, delay: SEAL + 200, duration: 300, onComplete: () => susanoo.destroy() });
      scene.cameras.main.shake(150, 0.008);
      // Flames of chakra licking up off the Susanoo while it stands.
      for (let i = 0; i < 24; i++)
        later(scene, i * (SEAL / 24), () =>
          flameTongue(scene, x + Phaser.Math.Between(-14, 14), y + 8, Phaser.Math.Between(8, 16), 300, [0x7e2553, 0xff004d, 0xff77a8]),
        );
      // The gourd's mouth, where the blade pours out.
      const [ox, oy] = [x + gx * S, y + 4 + (gy - 4) * S];
      const blade = scene.add.graphics().setDepth(13);
      // The Totsuka Blade drawn from the gourd to (tx, ty), `k` of the way: a rippling liquid sword with a dark rim,
      // orange body and a white edge, its tip a flared point.
      const drawBlade = (tx: number, ty: number, k: number, ph: number) => {
        blade.clear();
        if (k <= 0) return;
        const [ex, ey] = [ox + (tx - ox) * k, oy + (ty - oy) * k];
        const a = Math.atan2(ey - oy, ex - ox);
        const [nx, ny] = [-Math.sin(a), Math.cos(a)];
        for (const [w, c, al] of [
          [7, 0x7e2553, 0.6],
          [4, 0xff004d, 0.95],
          [2, 0xffa300, 1],
          [1, 0xfff1e8, 1],
        ] as const) {
          blade.lineStyle(w, c, al).beginPath().moveTo(ox, oy);
          for (let i = 1; i <= 12; i++) {
            const s = i / 12;
            const wob = Math.sin(s * 14 + ph) * 2 * (1 - s);
            blade.lineTo(ox + (ex - ox) * s + nx * wob, oy + (ey - oy) * s + ny * wob);
          }
          blade.strokePath();
        }
        blade
          .fillStyle(0xfff1e8)
          .fillTriangle(ex + nx * 3, ey + ny * 3, ex - nx * 3, ey - ny * 3, ex + Math.cos(a) * 7, ey + Math.sin(a) * 7);
      };
      // A seal spiral turning on a pierced enemy until the gourd draws it in.
      const seals = new Map<Phaser.GameObjects.Sprite, Phaser.GameObjects.Graphics>();
      const seal = (t: Phaser.GameObjects.Sprite) => {
        if (seals.has(t)) return;
        const g = scene.add.graphics().setDepth(13);
        g.lineStyle(1, 0xffa300, 0.85).beginPath();
        for (let i = 0; i <= 28; i++) {
          const a = i * 0.45;
          const r = 1.5 + i * 0.3;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8);
        }
        g.strokePath();
        g.lineStyle(1, 0xff004d, 0.8).strokeCircle(0, 0, 11);
        g.setPosition(t.x, t.y).setScale(0);
        scene.tweens.add({ targets: g, scale: 1, duration: 150, ease: 'Back.Out' });
        scene.tweens.add({ targets: g, angle: -720, duration: SEAL, onUpdate: () => t.active && g.setPosition(t.x, t.y) });
        seals.set(t, g);
      };
      for (let i = 0; i < THRUSTS; i++)
        later(scene, 450 + i * STEP, () => {
          // Aim as it thrusts: the nearest enemy not yet pierced, or any enemy again.
          const foes = world.targets(ox, oy);
          const t = foes.find((e) => !seals.has(e)) ?? foes[i % Math.max(1, foes.length)];
          if (!t) return;
          const [tx, ty] = [t.x, t.y];
          const ph = Math.random() * 6;
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 80,
            onUpdate: (tw) => drawBlade(tx, ty, tw.getValue() ?? 0, ph),
            onComplete: () => {
              if (t.active) {
                world.strike(t, 0.5 * power, 'skill', false, { freeze: SEAL });
                sparks(scene, tx, ty, [0xff004d, 0xffa300, 0xfff1e8], 8, 14);
                seal(t);
              }
              scene.cameras.main.shake(60, 0.006);
              scene.tweens.addCounter({
                from: 1,
                to: 0,
                delay: 50,
                duration: 70,
                onUpdate: (tw) => drawBlade(tx, ty, tw.getValue() ?? 0, ph),
              });
            },
          });
        });
      // The seal closes: every pierced enemy is drawn into the gourd as wisps of red light.
      later(scene, SEAL, () => {
        blade.destroy();
        scene.cameras.main.flash(120, 255, 119, 168);
        scene.cameras.main.shake(300, 0.02);
        floatText(scene, W / 2, 40, 'TERSEGEL!', '#ff77a8');
        for (const [t, g] of seals) {
          scene.tweens.killTweensOf(g);
          scene.tweens.add({ targets: g, scale: 0, duration: 200, onComplete: () => g.destroy() });
          if (!t.active) continue;
          for (let i = 0; i < 8; i++) {
            const w = scene.add.rectangle(t.x, t.y, 2, 2, i % 2 ? 0xff004d : 0xffa300).setDepth(14);
            const [sx, sy] = [t.x + Phaser.Math.Between(-6, 6), t.y + Phaser.Math.Between(-6, 6)];
            const [cx, cy] = [(sx + ox) / 2 + Phaser.Math.Between(-20, 20), Math.min(sy, oy) - 20];
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              delay: i * 25,
              duration: 300,
              onUpdate: (tw) => w.setPosition(...bez(sx, sy, cx, cy, ox, oy, tw.getValue() ?? 0)),
              onComplete: () => w.destroy(),
            });
          }
          ring(scene, t.x, t.y, 0xff77a8, 12, 2, 250, 2);
          world.strike(t, 2.2 * power, 'skill', true);
        }
      });
    },
    // Tsukuyomi: the Mangekyo turns and fills the view, and every enemy is inside Itachi's world: the sky goes red and
    // negative under a black moon, each enemy bound to a cross. Itachis step out of the dark around every cross with
    // drawn blades and stab, and stab, while a clock counts down seventy-two hours in an instant. When it reaches
    // zero the world breaks like glass: the enemies wake in the same second they left, and collapse. ...SEDETIK.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      const cam = scene.cameras.main;
      p.invuln(3400);
      p.lock(3000);
      p.setVelocityX(0);
      const eye = scene.add
        .image(W / 2, FLOOR_Y / 2, 'mangekyo')
        .setScale(0.5)
        .setDepth(15);
      scene.tweens.add({ targets: eye, scale: 7, angle: 240, duration: 450, ease: 'Quad.Out' });
      scene.tweens.add({ targets: eye, alpha: 0, delay: 450, duration: 200, onComplete: () => eye.destroy() });
      const parts: Phaser.GameObjects.GameObject[] = [];
      const clones: Phaser.GameObjects.Image[] = [];
      const key = p.texture.key;
      later(scene, 500, () => {
        // The red world: under the enemies (depth 5), a black moon ringed in red.
        const red = scene.add
          .rectangle(0, 0, W, FLOOR_Y + 20, 0xb3122e, 0.7)
          .setOrigin(0)
          .setDepth(4);
        const moon = scene.add
          .circle(W * 0.7, 40, 20, 0x000000)
          .setStrokeStyle(2, 0xff004d)
          .setDepth(4);
        const dark = scene.add
          .rectangle(0, FLOOR_Y - 2, W, 24, 0x1c0008, 0.85)
          .setOrigin(0)
          .setDepth(4);
        parts.push(red, moon, dark);
        for (const t of targets) {
          if (!t.active) continue;
          // The cross it is bound to.
          const c = scene.add.graphics().setPosition(t.x, t.y).setDepth(4.5);
          c.fillStyle(0x000000).fillRect(-2, -16, 5, 30).fillRect(-11, -11, 23, 5);
          c.fillStyle(0x3b2418).fillRect(-1, -15, 3, 28).fillRect(-10, -10, 21, 3);
          parts.push(c);
          world.strike(t, 0.3 * power, 'ult', false, { freeze: 3000 }, 0);
          // Three Itachis around it, in black with red eyes, blades drawn.
          for (const [dx, dy] of [
            [-16, 0],
            [16, 0],
            [0, -20],
          ]) {
            const k = scene.add
              .image(t.x + dx, t.y + dy, key)
              .setFlipX(dx > 0)
              .setTint(0x1c1c28)
              .setTintMode(Phaser.TintModes.FILL)
              .setAlpha(0)
              .setDepth(13);
            scene.tweens.add({ targets: k, alpha: 0.9, delay: Phaser.Math.Between(0, 200), duration: 150 });
            k.setData('foe', t);
            clones.push(k);
          }
        }
      });
      // Seventy-two hours.
      const clock = scene.add
        .text(W / 2, 28, '72:00:00', { fontFamily: '"Press Start 2P", monospace', fontSize: '8px', color: '#ff004d' })
        .setOrigin(0.5)
        .setDepth(16)
        .setAlpha(0);
      later(scene, 650, () => clock.setAlpha(1));
      scene.tweens.addCounter({
        from: 72 * 3600,
        to: 0,
        delay: 700,
        duration: 1700,
        onUpdate: (tw) => {
          const v = Math.floor(tw.getValue() ?? 0);
          const pad = (n: number) => String(n).padStart(2, '0');
          clock.setText(`${pad(Math.floor(v / 3600))}:${pad(Math.floor(v / 60) % 60)}:${pad(v % 60)}`);
        },
      });
      for (let i = 0; i < 14; i++)
        later(scene, 800 + i * 110, () => {
          for (const k of clones) {
            if (Math.random() < 0.5) continue;
            const t = k.getData('foe') as Phaser.GameObjects.Sprite;
            if (!t.active) continue;
            const blade = scene.add
              .rectangle(k.x, k.y, 12, 1, 0xfff1e8)
              .setRotation(Phaser.Math.Angle.Between(k.x, k.y, t.x, t.y))
              .setDepth(13);
            scene.tweens.add({ targets: blade, x: t.x, y: t.y, alpha: 0, duration: 100, onComplete: () => blade.destroy() });
            scene.tweens.add({ targets: k, x: k.x + (t.x - k.x) * 0.3, y: k.y + (t.y - k.y) * 0.3, duration: 50, yoyo: true });
          }
          for (const t of targets) {
            if (!t.active) continue;
            sparks(scene, t.x, t.y, [0xff004d, 0xfff1e8], 3, 8);
            world.strike(t, 0.18 * power, 'ult', false, undefined, 0);
          }
        });
      // Zero: the world shatters.
      later(scene, 2500, () => {
        cam.flash(180, 179, 18, 46);
        cam.shake(400, 0.025);
        floatText(scene, W / 2, 50, '...SEDETIK.', '#fff1e8');
        for (let i = 0; i < 20; i++) {
          const sh = scene.add
            .triangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, FLOOR_Y), 0, 0, 9, 3, 2, 10, 0xb3122e, 0.9)
            .setStrokeStyle(1, 0x000000)
            .setDepth(9);
          scene.tweens.add({ targets: sh, y: sh.y + 50, angle: 160, alpha: 0, duration: 550, onComplete: () => sh.destroy() });
        }
        [...parts, ...clones, clock].forEach((o) => o.destroy());
        for (const t of targets) if (t.active) world.strike(t, 2.2 * power, 'ult', true, { freeze: 1200 });
      });
    },
  },

  tongkatFrost: {
    // Salju Jatuh: frost crystals shoot out of the floor on both sides of where he lands.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      for (const dir of [-1, 1])
        for (let k = 0; k < 3; k++)
          later(scene, k * 50, () => {
            const cx = x + dir * (10 + k * 12);
            const g = scene.add.graphics().setDepth(11);
            const h = 16 - k * 3;
            g.fillStyle(0x29adff).fillPoints(
              [
                new Phaser.Math.Vector2(-4, 0),
                new Phaser.Math.Vector2(-3, -h * 0.7),
                new Phaser.Math.Vector2(0, -h),
                new Phaser.Math.Vector2(3, -h * 0.7),
                new Phaser.Math.Vector2(4, 0),
              ],
              true,
            );
            g.fillStyle(0xc2f0ff).fillRect(-1, -h + 2, 1, h - 3);
            g.setPosition(cx, gy + 1).setScale(1, 0);
            scene.tweens.add({ targets: g, scaleY: 1, duration: 70, yoyo: true, hold: 200, onComplete: () => g.destroy() });
          });
      world.area(x, gy - 6, 44, 0.5 * power, 80, 'proc', { freeze: 600 });
    },
    // Blizzard Vortex: Jack sweeps his crook up and calls the Wind. A twister of snow as tall as the sky spins up in
    // front of him and drifts forward, dragging in everything near it, on the ground or in the air, and grinding it
    // in ice; when the Wind lets go, the vortex bursts and freezes everything it held.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const TOP = 150;
      const LIFE = 1900;
      const x0 = Phaser.Math.Clamp(p.x + f * 30, 20, W - 20);
      const x1 = Phaser.Math.Clamp(p.x + f * 130, 20, W - 20);
      p.lock(300);
      p.setVelocityX(0);
      sparks(scene, p.x + f * 6, p.y - 8, [0xc2f0ff, 0xfff1e8], 10, 18);
      // Half-width of the funnel at height h above the floor: narrow at the ground, flaring out at the top.
      const half = (h: number) => 8 + (h / TOP) * 26;
      const flakes = Array.from({ length: 150 }, (_, i) => ({ h: Math.random() * TOP, a: Math.random() * Math.PI * 2, c: i % 3 }));
      const back = scene.add.graphics().setDepth(9);
      const front = scene.add.graphics().setDepth(13);
      const frost = scene.add.rectangle(x0, FLOOR_Y - 1, 40, 2, 0xfff1e8, 0.8).setDepth(4);
      let cx = x0;
      const spin = scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: LIFE,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const grow = Math.min(1, t * 5);
          cx = Phaser.Math.Linear(x0, x1, t);
          frost.setX(cx);
          back.clear();
          front.clear();
          // The funnel's body: a pale veil of snow, swaying as it spins.
          const sway = (h: number) => Math.sin(t * 20 + h / 10) * 3;
          const edge: Phaser.Math.Vector2[] = [];
          for (let h = 0; h <= TOP * grow; h += 10) edge.push(new Phaser.Math.Vector2(cx - half(h) + sway(h), FLOOR_Y - h));
          for (let h = TOP * grow; h >= 0; h -= 10) edge.push(new Phaser.Math.Vector2(cx + half(h) + sway(h), FLOOR_Y - h));
          back.fillStyle(0xc2f0ff, 0.14).fillPoints(edge, true);
          // Wind bands ringing it.
          for (let k = 0; k < 14; k++) {
            const h = ((k + ((t * 30) % 1)) / 14) * TOP * grow;
            back.lineStyle(2, k % 2 ? 0xfff1e8 : 0x29adff, 0.6).strokeEllipse(cx + sway(h), FLOOR_Y - h, half(h) * 2, 6);
          }
          // Snow whirling around it: the far side behind the enemies, the near side in front.
          for (const fl of flakes) {
            fl.a += 0.35;
            const h = fl.h * grow;
            const x = cx + Math.cos(fl.a) * half(h) + sway(h);
            const y = FLOOR_Y - h + Math.sin(fl.a) * 3;
            const g = Math.sin(fl.a) > 0 ? front : back;
            g.fillStyle([0xfff1e8, 0xc2f0ff, 0x29adff][fl.c]).fillRect(x, y, fl.c ? 2 : 4, 1);
          }
        },
      });
      // Pull and grind: two eyes of the wind, low and high, so flyers are dragged in as surely as walkers.
      for (let k = 0; k < 17; k++)
        later(scene, 150 + k * 100, () => {
          world.pull(cx, FLOOR_Y - 30, 70, 240);
          world.pull(cx, FLOOR_Y - 100, 70, 240);
          if (k % 2) return;
          for (const t of world.targets(cx, FLOOR_Y)) {
            const h = FLOOR_Y - t.y;
            if (h < -8 || h > TOP + 10 || Math.abs(t.x - cx) > half(Math.max(0, h)) + 8) continue;
            world.strike(t, 0.35 * power, 'skill', false, { slow: 700 });
            sparks(scene, t.x, t.y, [0xc2f0ff, 0xfff1e8], 3, 10);
          }
          scene.cameras.main.shake(60, 0.004);
        });
      // The Wind lets go: the vortex bursts outward in a ring of frost and everything inside freezes solid.
      later(scene, LIFE, () => {
        spin.stop();
        back.destroy();
        front.destroy();
        scene.tweens.add({ targets: frost, alpha: 0, duration: 400, onComplete: () => frost.destroy() });
        scene.cameras.main.flash(120, 194, 240, 255);
        scene.cameras.main.shake(200, 0.015);
        for (const y of [FLOOR_Y - 20, FLOOR_Y - 75, FLOOR_Y - 130]) {
          ring(scene, cx, y, 0xc2f0ff, 6, 46, 350, 2);
          sparks(scene, cx, y, [0xc2f0ff, 0xfff1e8], 12, 40);
        }
        for (const t of world.targets(cx, FLOOR_Y)) {
          const h = FLOOR_Y - t.y;
          if (h < -8 || h > TOP + 10 || Math.abs(t.x - cx) > half(Math.max(0, h)) + 30) continue;
          world.strike(t, 1.2 * power, 'skill', true, { freeze: 1500 });
        }
      });
    },
    // Frost Fern: Jack taps the crook on the ground the way he frosts a windowpane. Frost races away from the tip
    // along the floor in both directions, sprouting little fern-like fronds as it goes. Wherever it passes under an
    // enemy, a crystal fern shoots up from the floor right through it, branching at sixty degrees like a snowflake;
    // for flyers it climbs all the way up into the air to reach them. Everything it touches is frozen inside a crystal.
    // Then Jack blows on his work (the Wind) and every fern bursts into glittering snow, shattering what it held.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.lock(350);
      p.setVelocityX(0);
      const x0 = Phaser.Math.Clamp(p.x + f * 12, 4, W - 4);
      const y0 = FLOOR_Y - 1;
      const SPEED = 0.5; // px per ms along the floor
      const GROW = 0.45; // px per ms for ferns
      const LIFE = 1500;
      const start = scene.time.now;
      sparks(scene, x0, y0, [0xc2f0ff, 0xfff1e8], 12, 16);
      ring(scene, x0, y0, 0xc2f0ff, 2, 22, 300, 2);
      scene.cameras.main.shake(100, 0.008);
      // Every crystal line: from (x1, y1) to (x2, y2), growing from time t0 (ms after the tap) at `speed`.
      type Seg = { x1: number; y1: number; x2: number; y2: number; t0: number; speed: number; w: number };
      const segs: Seg[] = [];
      // A fern: a spine with pairs of branches at +-60 degrees, each a smaller fern itself.
      const fern = (x: number, y: number, a: number, len: number, depth: number, t0: number, speed = GROW, w = 2) => {
        const [x2, y2] = [x + Math.cos(a) * len, y + Math.sin(a) * len];
        segs.push({ x1: x, y1: y, x2, y2, t0, speed, w });
        if (depth <= 0 || len < 5) return;
        for (let k = 1; k <= 3; k++) {
          const s = k / 4;
          const [bx, by] = [x + Math.cos(a) * len * s, y + Math.sin(a) * len * s];
          const bt = t0 + (len * s) / speed;
          for (const side of [-1, 1]) fern(bx, by, a + side * (Math.PI / 3), len * 0.38 * (1 - s * 0.4), depth - 1, bt, speed, 1);
        }
      };
      // The floor runners, with a little frond every 14 px.
      for (const dir of [-1, 1]) {
        const end = dir > 0 ? W - 2 : 2;
        segs.push({ x1: x0, y1: y0, x2: end, y2: y0, t0: 0, speed: SPEED, w: 2 });
        for (let x = x0 + dir * 10; dir > 0 ? x < end : x > end; x += dir * 14)
          fern(x, y0, -Math.PI / 2 + dir * Phaser.Math.FloatBetween(0.2, 0.6), Phaser.Math.Between(6, 11), 1, Math.abs(x - x0) / SPEED);
      }
      const g = scene.add.graphics().setDepth(12);
      const sheen = scene.add.rectangle(x0, FLOOR_Y - 1, 1, 2, 0xc2f0ff, 0.5).setDepth(4);
      const draw = (now: number) => {
        g.clear();
        for (const [lw, c, al] of [
          [3, 0x29adff, 0.55],
          [1, 0xc2f0ff, 1],
        ] as const)
          for (const s of segs) {
            const len = Phaser.Math.Distance.Between(s.x1, s.y1, s.x2, s.y2);
            const k = Phaser.Math.Clamp(((now - s.t0) * s.speed) / (len || 1), 0, 1);
            if (k <= 0) continue;
            g.lineStyle(lw === 3 ? s.w + 1 : 1, c, al).lineBetween(s.x1, s.y1, s.x1 + (s.x2 - s.x1) * k, s.y1 + (s.y2 - s.y1) * k);
          }
        // Glittering tips on the longest lines.
        for (const s of segs)
          if (s.w === 2 && Math.random() < 0.15) {
            const k = Phaser.Math.Clamp(((now - s.t0) * s.speed) / (Phaser.Math.Distance.Between(s.x1, s.y1, s.x2, s.y2) || 1), 0, 1);
            if (k > 0) g.fillStyle(0xfff1e8).fillRect(s.x1 + (s.x2 - s.x1) * k - 1, s.y1 + (s.y2 - s.y1) * k - 1, 2, 2);
          }
        const reach = now * SPEED;
        sheen
          .setPosition(x0, FLOOR_Y - 1)
          .setSize(reach * 2, 2)
          .setOrigin(0.5);
      };
      // Crystals sealed around each enemy a fern reaches.
      const crystals = new Map<Phaser.GameObjects.Sprite, Phaser.GameObjects.Graphics>();
      const encase = (t: Phaser.GameObjects.Sprite) => {
        if (!t.active || crystals.has(t) || shattered) return;
        world.strike(t, 0.9 * power, 'skill', false, { freeze: LIFE + 400 });
        const b = t.getBounds();
        const [hw, hh] = [b.width / 2 + 4, b.height / 2 + 4];
        const pts = [
          [0, -hh - 3],
          [hw, -hh / 2],
          [hw, hh / 2],
          [0, hh + 3],
          [-hw, hh / 2],
          [-hw, -hh / 2],
        ].map(([px, py]) => new Phaser.Math.Vector2(px, py));
        const c = scene.add.graphics().setPosition(b.centerX, b.centerY).setDepth(13).setScale(0);
        c.fillStyle(0xc2f0ff, 0.45).fillPoints(pts, true);
        c.lineStyle(1, 0x29adff).strokePoints(pts, true);
        c.lineStyle(1, 0xfff1e8, 0.9)
          .lineBetween(-hw + 2, -hh / 2, -2, -hh - 1)
          .lineBetween(hw - 3, 0, hw - 3, hh / 2);
        scene.tweens.add({ targets: c, scale: 1, duration: 140, ease: 'Back.Out' });
        sparks(scene, t.x, t.y, [0xc2f0ff, 0xfff1e8], 6, 12);
        crystals.set(t, c);
      };
      const spired = new Set<Phaser.GameObjects.GameObject>();
      let shattered = false;
      const grow = scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: LIFE,
        onUpdate: () => {
          const now = scene.time.now - start;
          // When the frost passes under an enemy (its current spot), a crystal fern shoots up through it.
          for (const t of world.targets(x0, y0)) {
            if (spired.has(t) || Math.abs(t.x - x0) > now * SPEED || now > LIFE - 250) continue;
            spired.add(t);
            const h = Math.max(10, FLOOR_Y - t.y + 8);
            fern(t.x, y0, -Math.PI / 2, h, 2, now, h > 40 ? 0.9 : GROW, 2);
            later(scene, h / (h > 40 ? 0.9 : GROW), () => encase(t));
          }
          draw(now);
        },
      });
      // The Wind blows over it: every line bursts into drifting snow and every crystal shatters.
      later(scene, LIFE, () => {
        shattered = true;
        grow.stop();
        g.destroy();
        sheen.destroy();
        scene.cameras.main.flash(120, 194, 240, 255);
        scene.cameras.main.shake(250, 0.018);
        for (const s of segs) {
          if (s.w < 2 && Math.random() < 0.6) continue;
          const k = Math.random();
          const fl = scene.add
            .rectangle(s.x1 + (s.x2 - s.x1) * k, s.y1 + (s.y2 - s.y1) * k, 2, 1, Math.random() < 0.5 ? 0xfff1e8 : 0xc2f0ff)
            .setDepth(13);
          scene.tweens.add({
            targets: fl,
            x: fl.x + f * Phaser.Math.Between(20, 60),
            y: fl.y - Phaser.Math.Between(6, 30),
            angle: 360,
            alpha: 0,
            duration: Phaser.Math.Between(400, 800),
            onComplete: () => fl.destroy(),
          });
        }
        for (const [t, c] of crystals) {
          for (let k = 0; k < 8; k++) {
            const shard = scene.add.triangle(c.x, c.y, 0, 0, 4, 1, 1, 5, k % 2 ? 0xc2f0ff : 0xfff1e8).setDepth(14);
            const a = (k / 8) * Math.PI * 2;
            scene.tweens.add({
              targets: shard,
              x: c.x + Math.cos(a) * Phaser.Math.Between(12, 26),
              y: c.y + Math.sin(a) * Phaser.Math.Between(12, 26),
              angle: 270,
              alpha: 0,
              duration: 450,
              onComplete: () => shard.destroy(),
            });
          }
          c.destroy();
          if (t.active) world.strike(t, 2.2 * power, 'skill', true, { slow: 1500 });
        }
      });
    },
    // Eternal Winter: Jack calls the Wind and the sky ices over. A blizzard howls across the arena while frost creeps
    // over the floor and giant icicles plunge onto every enemy; then the cold seals each one inside a crystal of ice,
    // and with a tap of his staff every crystal shatters.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.invuln(4600);
      p.lock(800);
      p.setVelocityX(0);
      const cam = scene.cameras.main;
      cam.flash(200, 194, 240, 255);
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x9fd8ff, 0.28)
        .setOrigin(0)
        .setDepth(3)
        .setAlpha(0);
      const floor = scene.add
        .rectangle(p.x, FLOOR_Y - 1, W * 2, 3, 0xfff1e8, 0.9)
        .setScale(0, 1)
        .setDepth(4);
      scene.tweens.add({ targets: sky, alpha: 1, duration: 400 });
      scene.tweens.add({ targets: floor, scaleX: 1, duration: 1800 });
      // The Wind wheels around him as he raises the staff.
      for (let i = 0; i < 24; i++)
        later(scene, i * 35, () => {
          const a0 = (i / 6) * Math.PI;
          const w = scene.add.rectangle(0, 0, 3, 1, 0xfff1e8).setDepth(12);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 500,
            onUpdate: (tw) => {
              const t = tw.getValue() ?? 0;
              const a = a0 + t * 6;
              w.setPosition(p.x + Math.cos(a) * (8 + t * 14), p.y - t * 18 + Math.sin(a) * 4).setRotation(a);
            },
            onComplete: () => w.destroy(),
          });
        });
      // The blizzard: snow driven sideways by the wind for three seconds.
      for (let i = 0; i < 75; i++)
        later(scene, 300 + i * 40, () => {
          for (let k = 0; k < 5; k++) {
            const s = scene.add
              .rectangle(
                f > 0 ? Phaser.Math.Between(-60, W) : Phaser.Math.Between(0, W + 60),
                Phaser.Math.Between(-10, FLOOR_Y - 20),
                k % 2 ? 5 : 2,
                k % 2 ? 1 : 2,
                k % 3 ? 0xfff1e8 : 0xc2f0ff,
              )
              .setRotation(f * 0.35)
              .setDepth(13);
            scene.tweens.add({ targets: s, x: s.x + f * 90, y: s.y + 32, alpha: 0, duration: 450, onComplete: () => s.destroy() });
          }
        });
      for (let k = 0; k < 6; k++)
        later(scene, 500 + k * 500, () => {
          for (const t of world.targets(p.x, p.y)) world.strike(t, 0.3 * power, 'ult', false, { slow: 800 });
        });
      // Giant icicles plunge onto the enemies, one after another.
      for (let i = 0; i < 14; i++)
        later(scene, 600 + i * 160, () => {
          const foes = world.targets(p.x, p.y);
          if (!foes.length) return;
          const { x, y } = foes[i % foes.length];
          const ice = scene.add.container(x, -20).setDepth(13);
          ice.add([
            scene.add.triangle(0, 0, -5, -14, 5, -14, 0, 12, 0xc2f0ff).setOrigin(0),
            scene.add.triangle(0, 0, -2, -14, 1, -14, -1, 8, 0xfff1e8).setOrigin(0),
          ]);
          scene.tweens.add({
            targets: ice,
            y: y - 6,
            duration: 200,
            ease: 'Quad.In',
            onComplete: () => {
              ice.destroy();
              ring(scene, x, y, 0xc2f0ff, 4, 20, 220, 2);
              sparks(scene, x, y, [0xc2f0ff, 0xfff1e8], 8, 16);
              world.area(x, y, 18, 0.8 * power, 60, 'ult', { freeze: 600 });
              cam.shake(60, 0.007);
            },
          });
        });
      // Every enemy is sealed in ice...
      const coffins: Phaser.GameObjects.Rectangle[] = [];
      later(scene, 3100, () => {
        floatText(scene, W / 2, 40, 'BEKU...', '#c2f0ff');
        for (const t of world.targets(p.x, p.y)) {
          world.strike(t, 0.5 * power, 'ult', false, { freeze: 1500 });
          const box = t.getBounds();
          const c = scene.add
            .rectangle(box.centerX, box.centerY, box.width + 8, box.height + 8, 0xc2f0ff, 0.55)
            .setStrokeStyle(1, 0xfff1e8)
            .setScale(0)
            .setDepth(12);
          scene.tweens.add({ targets: c, scale: 1, duration: 150, ease: 'Back.Out' });
          coffins.push(c);
        }
      });
      // ...and shatters.
      later(scene, 3800, () => {
        floatText(scene, W / 2, 52, 'SHATTER!', '#fff1e8');
        cam.flash(250, 255, 255, 255);
        cam.shake(400, 0.03);
        for (const c of coffins) {
          for (let k = 0; k < 10; k++) {
            const shard = scene.add.triangle(c.x, c.y, 0, 0, 3, 1, 1, 4, k % 2 ? 0xc2f0ff : 0xfff1e8).setDepth(14);
            const a = Math.random() * Math.PI * 2;
            scene.tweens.add({
              targets: shard,
              x: c.x + Math.cos(a) * Phaser.Math.Between(14, 34),
              y: c.y + Math.sin(a) * Phaser.Math.Between(14, 34),
              angle: 360,
              alpha: 0,
              duration: 500,
              onComplete: () => shard.destroy(),
            });
          }
          c.destroy();
        }
        for (const t of world.targets(p.x, p.y)) world.strike(t, 2.5 * power, 'ult', true);
        scene.tweens.add({ targets: [sky, floor], alpha: 0, duration: 600, onComplete: () => (sky.destroy(), floor.destroy()) });
      });
    },
  },

  katana: {
    // Otoshi Giri: he lands in a crouch with the blade already back in its sheath; a beat later the cut appears,
    // a white line across the floor on both sides of him, and everything on it falls apart.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      later(scene, 220, () => {
        bladeLine(scene, x - 56, gy - 7, x + 56, gy - 7, 0xff004d, 120);
        floatText(scene, x, gy - 26, 'CHIN', '#fff1e8');
        for (const t of world.targets(x, gy))
          if (Math.abs(t.x - x) < 58 && Math.abs(t.y - (gy - 7)) < 14) world.strike(t, 1 * power, 'proc', true);
      });
    },
    // After every step-in cut the blade clicks home in the scabbard: a glint at his hip.
    onSwing: ({ p, scene }, m, step) => {
      if (step < 0 || m.anim === 'thrust') return;
      later(scene, m.ms + 30, () => p.active && glint(scene, p.x - p.facing * 2, p.y + 3));
    },
    // Mikiri (seeing through): he sheathes the blade, drops into a low stance and waits, a white ring of focus
    // closing in around him (nothing touches him while he waits). The moment an enemy steps close or a projectile
    // comes in, he has already read it: one white flash, the projectile is cut out of the air, and every enemy near
    // him is cut at once, each a sure critical. If nothing comes, he draws anyway and the cut flies on as a crescent.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const WAIT = 900;
      p.invuln(WAIT + 200);
      p.lock(WAIT);
      p.setVelocityX(0);
      const focus = scene.add.circle(p.x, p.y, 34).setStrokeStyle(1, 0xfff1e8, 0.8).setDepth(12);
      scene.tweens.add({ targets: focus, radius: 14, duration: WAIT, ease: 'Quad.In' });
      const t0 = scene.time.now;
      let done = false;
      const finish = () => {
        done = true;
        watch.remove();
        focus.destroy();
      };
      const counter = () => {
        finish();
        p.lock(250);
        scene.cameras.main.flash(90, 255, 241, 232);
        floatText(scene, p.x, p.y - 22, 'MIKIRI!', '#fff1e8');
        for (const h of world.hostiles())
          if (Phaser.Math.Distance.Between(h.x, h.y, p.x, p.y) < 50) {
            cutMark(scene, h.x, h.y, 0xfff1e8, 14);
            h.destroy();
          }
        const foes = world.targets(p.x, p.y).filter((t) => Phaser.Math.Distance.Between(t.x, t.y, p.x, p.y) < 80);
        foes.forEach((t, i) => {
          afterimage(scene, p, t.x - Math.sign(t.x - p.x) * 8, t.y, 0.5);
          later(scene, 40 + i * 40, () => {
            if (!t.active) return;
            bladeLine(scene, t.x - 16, t.y + 8, t.x + 16, t.y - 8, 0xff004d, 80);
            world.strike(t, 2.4 * power, 'skill', true);
          });
        });
        later(scene, 60, () => glint(scene, p.x - f * 2, p.y + 3));
      };
      const watch = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (done || !p.active) return;
          focus.setPosition(p.x, p.y);
          const close = world.targets(p.x, p.y).some((t) => Phaser.Math.Distance.Between(t.x, t.y, p.x, p.y) < 28);
          const shot = world.hostiles().some((h) => Phaser.Math.Distance.Between(h.x, h.y, p.x, p.y) < 30);
          if (close || shot) return counter();
          if (scene.time.now - t0 < WAIT) return;
          // Nothing came: the draw is loosed as a flying crescent.
          finish();
          bladeLine(scene, p.x, p.y, Phaser.Math.Clamp(p.x + f * 40, 0, W), p.y, 0xfff1e8, 60);
          const wave = world.shot({
            x: p.x + f * 12,
            y: p.y,
            vx: f * 280,
            vy: 0,
            texture: 'slashKatana',
            tint: 0xfff1e8,
            mult: 1.6 * power,
            source: 'skill',
            pierce: true,
            knockback: 160,
          }) as Phaser.GameObjects.Image;
          wave.setScale(f * 1.4, 1.6);
          later(scene, 700, () => wave.active && wave.destroy());
        },
      });
    },
    // Kuzuryusen, the Nine-Headed Dragon Flash: the nine strikes of the sword (karatake, kesagiri, migi-kesagiri,
    // migi-nagi, hidari-nagi, hidari-kiriage, migi-kiriage, sakagiri and the tsuki thrust) delivered at the same
    // instant, so there is nothing to block. He picks the enemy at the heart of the most enemies (air or ground) and
    // shukuchis to it. For a heartbeat the nine heads of the dragon show: eight faint lines of attack fan out of the
    // mark, each ending in a dragon's fang on an enemy of its own (the nearest ones first, flyers included; spare heads
    // fan up into the empty sky, never into the floor), a phantom of him standing on each. Then all nine land at once:
    // each cut is re-aimed at where its enemy is now and flashes from the mark to it, splitting the mark and anything
    // else on the way; the thrust goes through the middle. Any enemy no head reached is caught by the backlash of the
    // cuts. The blade clicks home.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      p.invuln(1300);
      p.lock(1000);
      p.setVelocity(0, 0);
      glint(scene, p.x + p.facing * 6, p.y - 1);
      const near = (e: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < 60).length;
      const mark = foes.reduce((b, e) => (near(e) > near(b) ? e : b));
      later(scene, 160, () => {
        if (!p.active) return;
        // Shukuchi to the mark (aimed where it is now). The star sits on the mark but never below the floor line.
        const [fx, fy] = [p.x, p.y];
        const tx = mark.active ? mark.x : fx;
        const ty = Math.min(mark.active ? mark.y : fy, FLOOR_Y - 8);
        const side = Math.sign(fx - tx) || -p.facing;
        const nx = Phaser.Math.Clamp(tx + side * 30, 8, W - 8);
        const ny = ty;
        afterimage(scene, p, fx, fy, 0.5);
        bladeLine(scene, fx, fy, nx, ny, 0xff004d, 120);
        p.body.reset(nx, ny);
        p.facing = -side;
        // The eight heads: one per enemy (nearest first), the spare ones fanned across the upper half of the sky.
        const others = world.targets(tx, ty).filter((e) => e !== mark);
        const prey = others.slice(0, 8);
        const spare = 8 - prey.length;
        type Head = { t?: Phaser.GameObjects.Sprite; a: number; len: number };
        const aim = (h: Head) => {
          if (!h.t?.active) return;
          // Rays toward the floor are kept level with it, so no cut dives under the ground.
          const hy = Math.min(h.t.y, FLOOR_Y - 4);
          h.a = Phaser.Math.Angle.Between(tx, ty, h.t.x, hy);
          h.len = Phaser.Math.Distance.Between(tx, ty, h.t.x, hy) + 10;
        };
        const heads: Head[] = [
          ...prey.map((t) => ({ t, a: 0, len: 0 })),
          ...Array.from({ length: spare }, (_, i) => ({ a: -Math.PI + ((i + 0.5) / spare) * Math.PI, len: 70 })),
        ];
        heads.forEach(aim);
        const guide = scene.add.graphics().setDepth(12);
        for (const { a, len } of heads) {
          const [ex, ey] = [tx + Math.cos(a) * len, ty + Math.sin(a) * len];
          guide.lineStyle(1, 0xff004d, 0.45).lineBetween(tx, ty, ex, ey);
          // The dragon's fang at the head, pointing back at the mark.
          const [px2, py2] = [-Math.sin(a) * 3, Math.cos(a) * 3];
          const [ix, iy] = [ex - Math.cos(a) * 7, ey - Math.sin(a) * 7];
          guide.fillStyle(0x7a2230).fillTriangle(ex + px2, ey + py2, ex - px2, ey - py2, ix, iy);
          guide.fillStyle(0xfff1e8).fillTriangle(ex + px2 / 2, ey + py2 / 2, ex - px2 / 2, ey - py2 / 2, ix, iy);
        }
        guide.setAlpha(0);
        scene.tweens.add({ targets: guide, alpha: 1, duration: 120 });
        const ghosts = heads.map(({ a }, i) => {
          const gx = tx + Math.cos(a) * 24;
          const gy = Math.min(ty + Math.sin(a) * 24, FLOOR_Y - 8);
          return scene.add
            .image(gx, gy, p.texture.key)
            .setFlipX(gx > tx)
            .setTint(i % 2 ? 0xff004d : 0xfff1e8)
            .setTintMode(Phaser.TintModes.FILL)
            .setAlpha(0)
            .setDepth(12);
        });
        scene.tweens.add({ targets: ghosts, alpha: 0.6, duration: 100 });
        if (mark.active) world.strike(mark, 0.1 * power, 'skill', false, { freeze: 900 });
        // All nine at once (a 25 ms ripple so the eye can count them).
        later(scene, 330, () => {
          scene.tweens.add({
            targets: [guide, ...ghosts],
            alpha: 0,
            duration: 160,
            onComplete: () => [guide, ...ghosts].forEach((o) => o.destroy()),
          });
          cam.flash(90, 255, 241, 232);
          const cut = new Set<Phaser.GameObjects.GameObject>();
          const split = (t: Phaser.GameObjects.Sprite, a: number) => {
            cut.add(t);
            cutMark(scene, t.x, t.y, 0xff004d, 26, a);
            world.strike(t, 1.8 * power, 'skill', true);
          };
          heads.forEach((h, i) =>
            later(scene, i * 25, () => {
              aim(h);
              const { a, len } = h;
              const line = [scene.add.rectangle(tx, ty, len, 5, 0xff004d, 0.45), scene.add.rectangle(tx, ty, len, 1, 0xfff1e8)];
              line.forEach((l) => l.setOrigin(0, 0.5).setRotation(a).setScale(0, 1).setDepth(14));
              scene.tweens.add({ targets: line, scaleX: 1, duration: 50, ease: 'Quad.Out' });
              scene.tweens.add({
                targets: line,
                scaleY: 0,
                alpha: 0,
                delay: 160,
                duration: 200,
                onComplete: () => line.forEach((l) => l.destroy()),
              });
              cam.shake(50, 0.006);
              if (mark.active) world.strike(mark, 0.45 * power, 'skill', true);
              // Its own enemy, and whatever else lies on the way to it, is split once.
              if (h.t?.active && !cut.has(h.t)) split(h.t, a);
              for (const t of world.targets(tx, ty)) {
                if (t === mark || cut.has(t)) continue;
                const [dx, dy] = [t.x - tx, t.y - ty];
                const along = dx * Math.cos(a) + dy * Math.sin(a);
                if (along >= 0 && along <= len && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= 9) split(t, a);
              }
            }),
          );
          // The ninth: tsuki, a thrust straight through the heart of it.
          later(scene, 8 * 25 + 40, () => {
            if (!p.active) return;
            const bx = Phaser.Math.Clamp(tx - side * 30, 8, W - 8);
            bladeLine(scene, p.x, p.y, bx, ny, 0xfff1e8, 140);
            afterimage(scene, p, p.x, p.y, 0.5, 0xff004d);
            p.body.reset(bx, ny);
            p.facing = -side;
            ring(scene, tx, ty, 0xff004d, 4, 34, 260, 2);
            ring(scene, tx, ty, 0xfff1e8, 2, 20, 200);
            sparks(scene, tx, ty, [0xff004d, 0xfff1e8, 0xff77a8], 16, 30);
            cam.shake(200, 0.018);
            if (mark.active) world.strike(mark, 1.2 * power, 'skill', true);
            // The backlash: anyone the nine heads did not reach (more than eight enemies) is cut where it stands.
            for (const t of world.targets(tx, ty)) {
              if (t === mark || cut.has(t)) continue;
              cutMark(scene, t.x, t.y, 0xff004d, 22);
              world.strike(t, 1.2 * power, 'skill', false);
            }
          });
          later(scene, 620, () => floatText(scene, Phaser.Math.Clamp(p.x, 20, W - 20), p.y - 20, 'CHIN', '#fff1e8'));
        });
      });
    },
    // Musou Issen: the world goes dark under a red sun and falling sakura, and everything stops. The samurai becomes
    // a streak of light bouncing between every enemy, cutting each on the way, then stands back where he began and
    // slowly sheathes the katana. On the click, every cut opens at once.
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const ox = p.x;
      const oy = p.y;
      const f = p.facing;
      p.invuln(3000);
      p.lock(2500);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      cam.flash(150, 255, 255, 255);
      // Stage: dark sky, a red sun behind him, sakura drifting down for the whole technique.
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x05050f, 0.6)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      const sun = scene.add.circle(ox, oy - 16, 1, 0xff004d, 0.85).setDepth(8);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 300 });
      scene.tweens.add({ targets: sun, radius: 36, duration: 500, ease: 'Back.Out' });
      for (let i = 0; i < 40; i++) {
        later(scene, i * 55, () => {
          const petal = scene.add.rectangle(Phaser.Math.Between(0, W + 60), -4, 2, 1, i % 3 ? 0xff77a8 : 0xfff1e8).setDepth(14);
          scene.tweens.add({
            targets: petal,
            x: petal.x - Phaser.Math.Between(60, 120),
            y: FLOOR_Y,
            angle: Phaser.Math.Between(180, 540),
            duration: Phaser.Math.Between(1400, 2200),
            onComplete: () => petal.destroy(),
          });
        });
      }
      floatText(scene, W / 2, 40, 'MUSOU...', '#ff77a8');
      glint(scene, ox + f * 6, oy - 1);
      // Time stops.
      for (const t of foes) world.strike(t, 0.2 * power, 'ult', false, { freeze: 2400 });
      // The flurry: 12 blinks cycling through (up to 12) enemies; each enemy's share adds up to about 2.4x.
      const n = Math.min(foes.length, 12);
      const hops = 12;
      let px = ox;
      let py = oy;
      for (let i = 0; i < hops; i++) {
        later(scene, 450 + i * 70, () => {
          const t = foes[i % n];
          if (!p.active || !t.active) return;
          const dir = Math.sign(t.x - px) || f;
          const nx = Phaser.Math.Clamp(t.x + dir * 16, 8, W - 8);
          const ny = Math.min(t.y, FLOOR_Y - 8);
          bladeLine(scene, px, py, nx, ny, i % 2 ? 0xff004d : 0xff77a8, 120);
          afterimage(scene, p, px, py, 0.4);
          p.body.reset(nx, ny);
          p.facing = dir;
          cutMark(scene, t.x, t.y, 0xff004d, 26);
          world.strike(t, 0.2 * n * power, 'ult', false);
          cam.shake(50, 0.006);
          px = nx;
          py = ny;
        });
      }
      // He returns to where he started and sheathes the blade slowly.
      const back = 450 + hops * 70 + 60;
      later(scene, back, () => {
        if (!p.active) return;
        bladeLine(scene, px, py, ox, oy, 0xfff1e8, 160);
        p.body.reset(ox, oy);
        p.facing = f;
        floatText(scene, ox, oy - 22, '...', '#fff1e8');
      });
      later(scene, back + 500, () => {
        floatText(scene, W / 2, 52, 'ISSEN!', '#ff004d');
        cam.flash(250, 255, 241, 232);
        cam.shake(450, 0.03);
        for (const t of foes) {
          if (!t.active) continue;
          for (const a of [-0.7, 0, 0.7]) cutMark(scene, t.x, t.y, 0xff004d, 44, a);
          world.strike(t, 2.5 * power, 'ult', true);
        }
        // Petals scatter from the shockwave; the sky and sun fade back.
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const petal = scene.add.rectangle(ox, oy, 2, 1, i % 2 ? 0xff77a8 : 0xfff1e8).setDepth(14);
          scene.tweens.add({
            targets: petal,
            x: ox + Math.cos(a) * Phaser.Math.Between(40, 90),
            y: oy + Math.sin(a) * Phaser.Math.Between(20, 50),
            angle: 360,
            alpha: 0,
            duration: 700,
            onComplete: () => petal.destroy(),
          });
        }
        scene.tweens.add({ targets: [dark, sun], alpha: 0, duration: 500, onComplete: () => (dark.destroy(), sun.destroy()) });
      });
    },
  },
  rasengan: {
    // Odama Rasengan: the giant sphere grinds into the ground where he lands, hitting again and again.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const g = scene.add
        .graphics()
        .setPosition(x, gy - 12)
        .setDepth(12);
      g.fillStyle(0x29adff, 0.5).fillCircle(0, 0, 16);
      g.lineStyle(1, 0xc2f0ff).beginPath().arc(0, 0, 12, 0, 4).strokePath().beginPath().arc(0, 0, 7, 2, 6).strokePath();
      g.fillStyle(0xfff1e8).fillCircle(0, 0, 3);
      scene.tweens.add({ targets: g, angle: 720, duration: 450, onComplete: () => g.destroy() });
      for (let i = 0; i < 3; i++)
        later(scene, i * 140, () => {
          rocks(scene, x, gy - 2, 3);
          world.area(x, gy - 10, 26, 0.35 * power, 40, 'proc');
        });
    },
    // Tajuu Kage Bunshin no Jutsu. Naruto crosses the fingers of both hands before his chest (the clone seal) and the
    // arena goes up in smoke: a dozen and more shadow clones pop out of it, on the floor and in mid-leap. Each picks an
    // enemy, flyers too, bounds at it in an arc and lands a punch and a kick that pin it a moment, then goes up in
    // smoke. Last comes Uzumaki Naruto Rendan on the toughest one left: four clones under it kick it up, U-ZU-MA-KI,
    // and one more drops out of the sky heel first and drives it into the floor.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const f = p.facing;
      const cam = scene.cameras.main;
      p.lock(300);
      p.setVelocityX(0);
      const look = [p.texture.key, p.frame.name] as const;
      const clone = (x: number, y: number) => scene.add.image(x, y, ...look).setDepth(9);
      // The seal: two crossed fingers before his chest, outlined.
      const seal = scene.add
        .graphics()
        .setPosition(p.x + f * 4, p.y - 1)
        .setDepth(12);
      for (const [w, c] of [
        [3, 0x000000],
        [1, 0xffccaa],
      ] as const)
        seal.lineStyle(w, c).lineBetween(-3, -3, 3, 3).lineBetween(3, -3, -3, 3);
      glint(scene, p.x + f * 4, p.y - 4);
      ring(scene, p.x, p.y, 0xffa300, 4, 18, 220, 1);
      later(scene, 220, () => {
        seal.destroy();
        poof(scene, p.x, p.y, true);
        cam.shake(120, 0.006);
      });
      // Spread over the whole width, every third one in mid-leap; enemies are dealt out in turn, nearest first.
      const N = 12 + Math.min(4, foes.length);
      const load = new Map<Phaser.GameObjects.Sprite, number>();
      const plan = Array.from({ length: N }, (_, i) => {
        const t = foes[i % foes.length];
        load.set(t, (load.get(t) ?? 0) + 1);
        return {
          t,
          x: Phaser.Math.Clamp(12 + ((W - 24) * (i + 0.5)) / N + Phaser.Math.Between(-6, 6), 8, W - 8),
          y: i % 3 === 1 ? Phaser.Math.Between(50, 110) : FLOOR_Y - 7,
        };
      });
      plan.forEach((c, i) => {
        let me: Phaser.GameObjects.Image | undefined;
        later(scene, 240 + i * 22, () => {
          poof(scene, c.x, c.y);
          me = clone(c.x, c.y)
            .setFlipX(c.t.x < c.x)
            .setScale(0.6);
          scene.tweens.add({ targets: me, scale: 1, duration: 140, ease: 'Back.Out' });
        });
        // The leap: an arc onto the near side of its enemy (or of whoever is nearest, if that one is already down).
        later(scene, 520 + i * 35, () => {
          if (!me) return;
          const c2 = me;
          const t = c.t.active ? c.t : world.targets(c2.x, c2.y)[0];
          if (!t) {
            poof(scene, c2.x, c2.y);
            return void c2.destroy();
          }
          const side = c2.x <= t.x ? -1 : 1;
          const [x0, y0] = [c2.x, c2.y];
          const [x1, y1] = [Phaser.Math.Clamp(t.x + side * 8, 4, W - 4), t.y];
          c2.setFlipX(side > 0);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 200,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              c2.setPosition(...bez(x0, y0, (x0 + x1) / 2, Math.min(y0, y1) - 26, x1, y1, k)).setAngle(side * 30 * k);
              if (Math.random() < 0.4) {
                const w = scene.add.rectangle(c2.x, c2.y, 2, 2, 0xffa300).setDepth(8.5);
                scene.tweens.add({ targets: w, alpha: 0, y: w.y - 4, duration: 220, onComplete: () => w.destroy() });
              }
            },
            onComplete: () => {
              // A punch, then a kick; all the clones on one enemy share one budget, and each blow pins it a moment.
              const share = 0.75 / (load.get(c.t) ?? 1);
              [0, 130].forEach((d, k) =>
                later(scene, d, () => {
                  if (!c2.active) return;
                  c2.setAngle(k ? side * -35 : 0).setX(c2.x - side * 2);
                  if (!t.active) return;
                  sparks(scene, t.x + side * 4, t.y, [0xffa300, 0xfff1e8, 0x29adff], 5, 10);
                  world.strike(t, share * power, 'skill', false, { freeze: 180 }, k ? 90 : 30);
                }),
              );
              later(scene, 380, () => {
                if (!c2.active) return;
                poof(scene, c2.x, c2.y);
                c2.destroy();
              });
            },
          });
        });
      });
      // Uzumaki Naruto Rendan on the toughest enemy still standing.
      later(scene, 520 + N * 35 + 260, () => {
        const t = world.targets(p.x, p.y).sort((a, b) => (b as Living).maxHp - (a as Living).maxHp)[0];
        if (!t) return;
        const gy = Math.min(t.y + 12, FLOOR_Y - 7);
        const xs = [-9, -3, 3, 9];
        const kickers = xs.map((dx) => {
          const x = Phaser.Math.Clamp(t.x + dx, 4, W - 4);
          poof(scene, x, gy);
          return clone(x, gy).setFlipX(dx > 0);
        });
        ['U', 'ZU', 'MA', 'KI'].forEach((sy, i) =>
          later(scene, 120 + i * 90, () => {
            const k = kickers[i];
            scene.tweens.add({ targets: k, y: k.y - 12, angle: (k.flipX ? 1 : -1) * 40, duration: 80, yoyo: true });
            floatText(scene, Phaser.Math.Clamp(k.x, 10, W - 10), k.y - 18 - i * 3, sy, '#ffa300');
            if (!t.active) return;
            sparks(scene, t.x, t.y + 4, [0xffa300, 0xfff1e8], 5, 10);
            world.strike(t, 0.2 * power, 'skill', false, undefined, 0);
            // The last kick throws small fry up into the drop.
            if (i === 3 && t.active && !('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-230);
          }),
        );
        // The drop: one more clone out of the sky, heel first.
        later(scene, 120 + 4 * 90 + 150, () => {
          kickers.forEach((k) => {
            poof(scene, k.x, k.y);
            k.destroy();
          });
          if (!t.active) return;
          const x = t.x;
          const top = Math.max(24, t.y - 48);
          poof(scene, x, top);
          const heel = clone(x, top).setAngle(-160);
          afterimage(scene, p, x, top, 0.5, 0xffa300);
          scene.tweens.add({
            targets: heel,
            y: t.y - 8,
            angle: 0,
            duration: 130,
            ease: 'Quad.In',
            onComplete: () => {
              cam.shake(200, 0.016);
              floatText(scene, Phaser.Math.Clamp(x, 24, W - 24), heel.y - 20, 'RENDAN!', '#ffa300');
              ring(scene, x, heel.y + 8, 0xffa300, 4, 28, 280, 2);
              rocks(scene, x, FLOOR_Y - 2, 4);
              if (t.active) {
                sparks(scene, t.x, t.y, [0xffa300, 0xffec27, 0xfff1e8], 10, 16);
                world.strike(t, 0.9 * power, 'skill', true, undefined, 160);
                world.slam(t.x, t.y, 12, 260);
              }
              later(scene, 220, () => {
                poof(scene, heel.x, heel.y);
                heel.destroy();
              });
            },
          });
        });
      });
    },
    // Senpo: Rasenshuriken. Sage Mode flares (an orange glint over the eyes, a ring of nature energy) and a shadow clone
    // pops up at his side: it takes two, one to hold the Rasengan and one to fold wind chakra into it, streams of it
    // running from the clone's hands. It screams into shape over his raised hand, four white blades round a blue core.
    // The clone vanishes as he throws: aimed at the thickest knot of enemies right now, in the air or not. On arrival
    // it swells into a sphere of countless wind needles that drags everything near into it and cuts it over and over
    // at the cellular level (slowed), then collapses with a last burst.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.lock(420);
      p.setVelocityX(0);
      glint(scene, p.x + f * 2, p.y - 6);
      ring(scene, p.x, p.y, 0xffa300, 4, 22, 300, 1);
      const hx = p.x;
      const hy = p.y - 22;
      const cx = Phaser.Math.Clamp(p.x - f * 11, 4, W - 4);
      poof(scene, cx, p.y);
      const helper = scene.add.image(cx, p.y, p.texture.key, p.frame.name).setFlipX(p.flipX).setDepth(9);
      const feed = scene.time.addEvent({
        delay: 40,
        loop: true,
        callback: () => {
          const w = scene.add.graphics().setDepth(12);
          w.lineStyle(1, Math.random() < 0.5 ? 0xc2f0ff : 0x29adff).lineBetween(
            cx + f * 3,
            p.y - 6,
            hx + Phaser.Math.Between(-4, 4),
            hy + 6,
          );
          scene.tweens.add({ targets: w, alpha: 0, duration: 120, onComplete: () => w.destroy() });
        },
      });
      const orb = rasenshuriken(scene, hx, hy, 20).setScale(0.2);
      scene.tweens.add({ targets: orb, scale: 1, duration: 300, ease: 'Back.Out' });
      const spin = scene.tweens.add({ targets: orb, angle: f * 3600, duration: 3000 });
      // The whine: thin rings tightening on the core while it charges.
      for (let i = 0; i < 4; i++) later(scene, i * 70, () => ring(scene, hx, hy, 0xc2f0ff, 26, 6, 200, 1));
      later(scene, 330, () => {
        feed.remove();
        poof(scene, helper.x, helper.y);
        helper.destroy();
        // Aim on release: the enemy with the most others within the sphere's reach.
        const foes = world.targets(hx, hy);
        if (!foes.length) {
          spin.stop();
          return void orb.destroy();
        }
        const R = 40;
        const near = (e: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < R).length;
        const mark = foes.reduce((b, e) => (near(e) > near(b) ? e : b));
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 380,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const t = tw.getValue() ?? 0;
            const [tx, ty] = mark.active ? [mark.x, mark.y] : [orb.x, orb.y];
            orb.setPosition(hx + (tx - hx) * t, hy + (ty - hy) * t - Math.sin(t * Math.PI) * 14);
            if (Math.random() < 0.6) {
              const w = scene.add.rectangle(orb.x, orb.y, 4, 1, 0xc2f0ff).setDepth(12);
              scene.tweens.add({ targets: w, alpha: 0, scaleX: 3, duration: 200, onComplete: () => w.destroy() });
            }
          },
          onComplete: () => {
            spin.stop();
            const { x, y } = orb;
            orb.destroy();
            scene.cameras.main.shake(500, 0.014);
            // The sphere: a pale shell with a darker rim, the needle storm drawn fresh every frame inside it.
            const shell = scene.add.circle(x, y, 6, 0xc2f0ff, 0.28).setStrokeStyle(2, 0x29adff).setDepth(12);
            const core = scene.add.circle(x, y, 3, 0xfff1e8).setDepth(13);
            scene.tweens.add({ targets: shell, radius: R, duration: 180, ease: 'Quad.Out' });
            const needles = scene.add.graphics().setDepth(13);
            const storm = scene.time.addEvent({
              delay: 30,
              loop: true,
              callback: () => needleStorm(needles, x, y, R, [0xfff1e8, 0xfff1e8, 0x29adff]),
            });
            for (let k = 0; k < 6; k++)
              later(scene, k * 140, () => {
                world.pull(x, y, R + 30, 90);
                world.area(x, y, R, 0.45 * power, 0, 'skill', { slow: 1500 });
              });
            // The collapse: the sphere snaps inward and bursts.
            later(scene, 880, () => {
              storm.remove();
              needles.destroy();
              scene.tweens.add({
                targets: shell,
                radius: 4,
                duration: 100,
                onComplete: () => {
                  shell.destroy();
                  core.destroy();
                  ring(scene, x, y, 0xfff1e8, 6, R + 14, 300, 2);
                  sparks(scene, x, y, [0xc2f0ff, 0xfff1e8, 0x29adff], 16, R);
                  world.area(x, y, R + 6, 0.9 * power, 140, 'skill');
                },
              });
            });
          },
        });
      });
    },
    // Rikudo: Chocho Odama Rasenshuriken, his answer to Indra's Arrow in the last battle at the Valley of the End. The
    // sky goes dark; two shadow clones pop up beside Naruto and run into him, the three become one (a golden flash), and
    // the Six Paths Kurama rises out of the floor around him: nine tails, three heads, six arms, Naruto on its brow.
    // The left arms spin up a Six Paths Big Ball Rasenshuriken (white-gold, truth-seeking beads round its core), the
    // right arms a Tailed Beast Ball Rasenshuriken (black-violet), each fed by a stream of chakra. He hurls both at
    // once, each at the thickest crowd on its half of the arena; each swells into a sphere of wind needles that drags
    // enemies in and grinds them, a shake per hit. Then the two spheres grow into each other until they swallow the
    // whole arena: one white flash and one last hit on everyone ("RIKUDO!").
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      const T = { rise: 450, form: 1000, throw: 1950, merge: 3000, end: 3650 };
      p.invuln(T.end + 400);
      p.lock(T.end + 200);
      p.setVelocity(0, 0);
      const ax = Phaser.Math.Clamp(p.x, 80, W - 80);
      const night = scene.add.rectangle(0, 0, W, H, 0x05030a, 0.78).setOrigin(0).setDepth(8).setAlpha(0);
      scene.tweens.add({ targets: night, alpha: 1, duration: 400 });
      ring(scene, p.x, p.y, 0xffa300, 4, 30, 300, 2);
      // Two clones pop out beside him and run into him: three become one.
      for (const side of [-1, 1]) {
        const cx = Phaser.Math.Clamp(p.x + side * 24, 4, W - 4);
        poof(scene, cx, p.y);
        const cl = scene.add
          .image(cx, p.y, p.texture.key, p.frame.name)
          .setFlipX(side > 0)
          .setDepth(10);
        scene.tweens.add({ targets: cl, x: p.x, delay: 160, duration: 220, ease: 'Quad.In', onComplete: () => cl.destroy() });
      }
      later(scene, 380, () => {
        cam.flash(160, 255, 236, 39);
        ring(scene, p.x, p.y, 0xffec27, 4, 40, 320, 2);
      });
      // Chakra pouring into the shape of the avatar before it rises.
      for (let i = 0; i < 30; i++)
        later(scene, 200 + i * 12, () => {
          const a = Math.random() * Math.PI * 2;
          const m = scene.add
            .rectangle(ax + Math.cos(a) * 90, FLOOR_Y - 60 + Math.sin(a) * 60, 2, 2, i % 2 ? 0xffa300 : 0xffec27)
            .setDepth(12);
          scene.tweens.add({
            targets: m,
            x: ax + Phaser.Math.Between(-30, 30),
            y: FLOOR_Y - Phaser.Math.Between(20, 100),
            alpha: 0.2,
            duration: 300,
            onComplete: () => m.destroy(),
          });
        });
      const av = kuramaAvatar(scene, ax, FLOOR_Y);
      av.body.setAlpha(0).setScale(0.9, 0.2);
      const wag = scene.time.addEvent({ delay: 40, loop: true, callback: () => av.wag(scene.time.now) });
      // He rides up onto its brow (held there every frame: the player's own update turns gravity back on).
      let ride: { x: number; y: number } | undefined;
      const hold = scene.time.addEvent({ delay: 16, loop: true, callback: () => ride && p.body.reset(ride.x, ride.y) });
      later(scene, T.rise, () => {
        scene.tweens.add({ targets: av.body, alpha: 0.95, scaleX: 1, scaleY: 1, duration: 450, ease: 'Back.Out' });
        cam.shake(450, 0.01);
        for (let i = 0; i < 4; i++) rocks(scene, ax - 30 + i * 20, FLOOR_Y - 1, 3);
        ride = { x: p.x, y: p.y };
        scene.tweens.add({ targets: ride, x: ax, y: FLOOR_Y - 128, duration: 420, ease: 'Quad.Out' });
      });
      // The two halves form in the grips, each fed by its own chakra.
      const kinds: RasenKind[] = ['rikudo', 'bijuu'];
      const FEED = [
        [0xffec27, 0xfff1e8],
        [0x8a3fd1, 0xc080ff],
      ];
      const orbs = av.grips.map(([gx, gy], i) => rasenshuriken(scene, gx, gy, 22, kinds[i]).setScale(0));
      const spins: Phaser.Tweens.Tween[] = [];
      later(scene, T.form, () =>
        orbs.forEach((o, i) => {
          scene.tweens.add({ targets: o, scale: 1, duration: 800, ease: 'Quad.Out' });
          spins.push(scene.tweens.add({ targets: o, angle: (i ? -1 : 1) * 3600, duration: 3000 }));
        }),
      );
      for (let i = 0; i < 40; i++)
        later(scene, T.form + i * 22, () => {
          const k = i % 2;
          const [gx, gy] = av.grips[k];
          const a = Math.random() * Math.PI * 2;
          const m = scene.add.rectangle(gx + Math.cos(a) * 50, gy + Math.sin(a) * 40, 2, 2, FEED[k][(i >> 1) % 2]).setDepth(14);
          scene.tweens.add({ targets: m, x: gx, y: gy, duration: 260, onComplete: () => m.destroy() });
        });
      for (let i = 0; i < 4; i++)
        later(scene, T.form + 150 + i * 180, () => {
          av.grips.forEach(([gx, gy], k) => ring(scene, gx, gy, FEED[k][1], 36, 8, 220, 1));
          cam.shake(90, 0.004);
        });
      // The spheres where they land; their needle storms are redrawn together every frame.
      const R = 54;
      const spheres: { shell: Phaser.GameObjects.Arc; needles: Phaser.GameObjects.Graphics; x: number; y: number; k: number }[] = [];
      const storm = scene.time.addEvent({
        delay: 30,
        loop: true,
        callback: () =>
          spheres.forEach((s) =>
            needleStorm(s.needles, s.x, s.y, s.shell.radius, s.k ? [0xc080ff, 0x8a3fd1, 0xfff1e8] : [0xfff1e8, 0xffec27, 0xffa300]),
          ),
      });
      const sphere = (x: number, y: number, k: number) => {
        const shell = scene.add
          .circle(x, y, 6, k ? 0x3b1a5a : 0xffec27, k ? 0.45 : 0.25)
          .setStrokeStyle(2, k ? 0xc080ff : 0xffa300)
          .setDepth(12);
        scene.tweens.add({ targets: shell, radius: R, duration: 200, ease: 'Quad.Out' });
        spheres.push({ shell, needles: scene.add.graphics().setDepth(13), x, y, k });
        cam.shake(220, 0.016);
        ring(scene, x, y, FEED[k][1], 6, R + 10, 300, 2);
        for (let n = 0; n < 4; n++)
          later(scene, 120 + n * 150, () => {
            world.pull(x, y, R + 30, 90);
            world.area(x, y, R, 0.45 * power, 0, 'ult', { slow: 1500 });
            cam.shake(70, 0.008);
          });
      };
      later(scene, T.throw, () => {
        // Aim on release: the thickest crowd on each half of the arena (both at the same one if only one half has any).
        const foes = world.targets(ax, FLOOR_Y - 60);
        const near = (e: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < R).length;
        const crowd = (list: Phaser.GameObjects.Sprite[]) => (list.length ? list.reduce((b, e) => (near(e) > near(b) ? e : b)) : undefined);
        const byX = [...foes].sort((a, b) => a.x - b.x);
        const half = Math.ceil(byX.length / 2);
        const aims = [crowd(byX.slice(0, half)), crowd(byX.slice(half))];
        aims[0] ??= aims[1];
        aims[1] ??= aims[0];
        cam.shake(160, 0.012);
        orbs.forEach((o, i) => {
          const [x0, y0] = [o.x, o.y];
          const t = aims[i];
          const [tx, ty] = t ? [t.x, t.y] : [W * (i ? 0.75 : 0.25), FLOOR_Y - 30];
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 380 + i * 60,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              o.setPosition(...bez(x0, y0, (x0 + tx) / 2, Math.min(y0, ty) - 30, tx, ty, tw.getValue() ?? 0));
              const w = scene.add.rectangle(o.x, o.y, 5, 2, FEED[i][1]).setDepth(12);
              scene.tweens.add({ targets: w, alpha: 0, scaleX: 3, duration: 240, onComplete: () => w.destroy() });
            },
            onComplete: () => {
              spins[i]?.stop();
              const { x, y } = o;
              o.destroy();
              sphere(x, y, i);
            },
          });
        });
      });
      // The two spheres swell into each other until they swallow the arena.
      later(scene, T.merge, () => {
        spheres.forEach((s) => scene.tweens.add({ targets: s.shell, radius: W * 0.75, duration: 260, ease: 'Quad.In' }));
        later(scene, 260, () => {
          storm.remove();
          const mx = spheres.reduce((v, s) => v + s.x, 0) / (spheres.length || 1) || W / 2;
          const my = spheres.reduce((v, s) => v + s.y, 0) / (spheres.length || 1) || FLOOR_Y - 40;
          spheres.forEach((s) => {
            s.needles.destroy();
            s.shell.destroy();
          });
          cam.flash(260, 255, 255, 255);
          cam.shake(700, 0.035);
          floatText(scene, W / 2, 44, 'RIKUDO!', '#ffec27');
          const dome = scene.add.circle(mx, my, 10, 0xfff1e8, 0.8).setStrokeStyle(3, 0xffec27).setDepth(13);
          scene.tweens.add({ targets: dome, radius: W * 0.8, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => dome.destroy() });
          ring(scene, mx, my, 0xffec27, 10, W * 0.7, 600, 4);
          ring(scene, mx, my, 0x8a3fd1, 6, W * 0.6, 520, 3);
          sparks(scene, mx, my, [0xfff1e8, 0xffec27, 0xc080ff], 30, 120);
          for (let i = 0; i < 8; i++) rocks(scene, Phaser.Math.Between(10, W - 10), FLOOR_Y, 3);
          for (const t of world.targets(mx, my)) world.strike(t, 2.6 * power, 'ult', true);
        });
      });
      later(scene, T.end, () => {
        wag.remove();
        hold.remove();
        scene.tweens.add({ targets: av.body, alpha: 0, scaleY: 0.2, duration: 350, onComplete: () => av.body.destroy() });
        scene.tweens.add({ targets: night, alpha: 0, duration: 400, onComplete: () => night.destroy() });
        poof(scene, p.x, p.y);
      });
    },
  },

  kusanagi: {
    // Chidori Jatuh: lightning answers his landing, striking down from the sky onto the two nearest enemies.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      world
        .targets(x, gy)
        .filter((t) => Phaser.Math.Distance.Between(t.x, t.y, x, gy) < 110)
        .slice(0, 2)
        .forEach((t, i) =>
          later(scene, 60 + i * 80, () => {
            if (!t.active) return;
            stormArc(scene, t.x + Phaser.Math.Between(-8, 8), 0, t.x, t.y, 220, 2, 2);
            world.strike(t, 0.8 * power, 'proc', false, { freeze: 400 });
          }),
        );
    },
    // Chidori Katana (the finisher): the current races along his path ahead of the lunge.
    onSwing: ({ p, scene }, m, step) => {
      if (step !== 2) return;
      const f = p.facing;
      const x0 = p.x;
      const y0 = p.y;
      stormArc(scene, x0, y0, Phaser.Math.Clamp(x0 + f * 60, 0, W), y0, m.ms + 80, 1, 2);
      sparks(scene, x0 + f * 6, y0, [0x29adff, 0xfff1e8], 8, 12);
    },
    // Kirin: Sasuke shoots a Katon fireball straight up to heat the air, and black thunderclouds roll in over the whole
    // arena, flickering. He raises his hand... and brings it down: the lightning of the sky itself takes the shape of
    // Kirin, a horned beast of thunder that dives out of the clouds onto the thickest crowd of enemies (picked as it
    // dives), tearing through anything in the air on the way. It hits with a blinding pillar that splits the ground,
    // and the discharge forks out of the impact to every other enemy in the arena, paralyzing them.
    skill: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.lock(1000);
      p.invuln(1300);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      const segDist = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
        const [dx, dy] = [x2 - x1, y2 - y1];
        const k = Phaser.Math.Clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        return Phaser.Math.Distance.Between(x, y, x1 + dx * k, y1 + dy * k);
      };
      // A forked bolt that jitters across its own line (so it crackles sideways as well as down), gone in a flicker.
      const zap = (x0: number, y0: number, x1: number, y1: number) => {
        const g = scene.add.graphics().setDepth(14);
        const a = Math.atan2(y1 - y0, x1 - x0);
        const n = Math.max(3, Math.round(Phaser.Math.Distance.Between(x0, y0, x1, y1) / 12));
        const pts: [number, number][] = [[x0, y0]];
        for (let i = 1; i < n; i++) {
          const j = Phaser.Math.Between(-5, 5);
          pts.push([x0 + ((x1 - x0) * i) / n - Math.sin(a) * j, y0 + ((y1 - y0) * i) / n + Math.cos(a) * j]);
        }
        pts.push([x1, y1]);
        for (const [w, c] of [
          [4, 0x29adff],
          [1, 0xfff1e8],
        ] as const) {
          g.lineStyle(w, c)
            .beginPath()
            .moveTo(...pts[0]);
          for (const pt of pts) g.lineTo(...pt);
          g.strokePath();
        }
        const [fx, fy] = pts[Math.floor(n / 2)];
        g.lineStyle(1, 0x29adff).lineBetween(fx, fy, fx + Phaser.Math.Between(-10, 10), fy + Phaser.Math.Between(-10, 10));
        scene.tweens.add({ targets: g, alpha: 0, duration: 240, onComplete: () => g.destroy() });
      };
      // The Katon shot into the sky.
      const fire = scene.add
        .circle(p.x, p.y - 8, 4, 0xffa300)
        .setStrokeStyle(1, 0xff004d)
        .setDepth(13);
      scene.tweens.add({
        targets: fire,
        y: 14,
        duration: 260,
        ease: 'Quad.In',
        onComplete: () => {
          explosion(scene, fire.x, 14, 10);
          fire.destroy();
        },
      });
      // Storm clouds: a dim sky and banks of heavy cloud along the top (dark rim, slate body, a lit upper edge).
      const dim = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x0a0f24, 0.55)
        .setOrigin(0)
        .setDepth(3)
        .setAlpha(0);
      const clouds = scene.add.graphics().setDepth(6).setAlpha(0);
      for (let x = -10; x < W + 20; x += 22) {
        const [cy, r] = [Phaser.Math.Between(4, 14), Phaser.Math.Between(12, 18)];
        clouds.fillStyle(0x0a0a14).fillEllipse(x, cy, (r + 2) * 3, (r + 2) * 1.2);
        clouds.fillStyle(0x3b3b4f).fillEllipse(x, cy, r * 3, r * 1.2);
        clouds.fillStyle(0x5f6a8a).fillEllipse(x - 4, cy - 3, r * 1.8, r * 0.5);
      }
      scene.tweens.add({ targets: [dim, clouds], alpha: 1, duration: 400, delay: 200 });
      scene.tweens.add({
        targets: [dim, clouds],
        alpha: 0,
        delay: 1800,
        duration: 500,
        onComplete: () => (dim.destroy(), clouds.destroy()),
      });
      // The clouds flicker with lightning while he raises his hand.
      for (let i = 0; i < 5; i++)
        later(scene, 350 + i * 90, () => {
          const x = Phaser.Math.Between(10, W - 10);
          zap(x, 18, x + Phaser.Math.Between(-30, 30), 18 + Phaser.Math.Between(4, 14));
        });
      for (let i = 0; i < 10; i++) later(scene, 400 + i * 40, () => sparks(scene, p.x + f * 2, p.y - 14, [0x29adff, 0xfff1e8], 3, 10));
      later(scene, 820, () => {
        const foes = world.targets(p.x, p.y);
        if (!foes.length) return;
        // Pick the spot: the enemy with the most others within 50 px; dive in at a slant from his side.
        let lx = foes[0].x;
        let n = -1;
        for (const c of foes) {
          const k = foes.filter((t) => Math.abs(t.x - c.x) < 50).length;
          if (k > n) [lx, n] = [c.x, k];
        }
        lx = Phaser.Math.Clamp(lx, 12, W - 12);
        const [sx, sy] = [Phaser.Math.Clamp(lx - f * 70, 10, W - 10), 16];
        // Kirin's body: a thick jagged column of lightning from the cloud to its head, redrawn every frame so it
        // writhes; the head is a horned beast's skull of light with an open jaw.
        const body = scene.add.graphics().setDepth(13);
        const head = scene.add.graphics();
        for (const [k, c] of [
          [1, 0x1d2b53],
          [0.8, 0x29adff],
          [0.45, 0xc2f0ff],
        ] as const) {
          head.fillStyle(c);
          // Snout pointing +x, the jaw hanging open, two swept horns and a mane.
          head.fillTriangle(-10 * k, -6 * k, 12 * k, -2 * k, -10 * k, 4 * k);
          head.fillTriangle(-6 * k, 2 * k, 10 * k, 6 * k, -8 * k, 8 * k);
          head.fillTriangle(-6 * k, -5 * k, -18 * k, -14 * k, -2 * k, -7 * k);
          head.fillTriangle(-9 * k, -3 * k, -22 * k, -6 * k, -6 * k, 0);
          head.fillCircle(-8 * k, 0, 6 * k);
        }
        head.fillStyle(0xfff1e8).fillRect(0, -4, 3, 2);
        const beast = scene.add.container(sx, sy, [head]).setDepth(14);
        const ang = Math.atan2(FLOOR_Y - 8 - sy, lx - sx);
        beast.setRotation(ang).setScale(2);
        const struck = new Set<Phaser.GameObjects.GameObject>();
        const drawBody = (hx: number, hy: number) => {
          body.clear();
          const pts: [number, number][] = [];
          for (let i = 0; i <= 10; i++) {
            const k = i / 10;
            const wob = i === 0 || i === 10 ? 0 : Phaser.Math.Between(-7, 7);
            pts.push([sx + (hx - sx) * k + wob * Math.sin(ang), sy - 14 * (1 - k) + (hy - sy + 14) * k - wob * Math.cos(ang)]);
          }
          for (const [w, c, al] of [
            [12, 0x29adff, 0.35],
            [6, 0x29adff, 0.9],
            [2, 0xfff1e8, 1],
          ] as const) {
            body
              .lineStyle(w, c, al)
              .beginPath()
              .moveTo(...pts[0]);
            for (const pt of pts) body.lineTo(...pt);
            body.strokePath();
          }
        };
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 220,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            const [hx, hy] = [sx + (lx - sx) * k, sy + (FLOOR_Y - 8 - sy) * k];
            beast.setPosition(hx, hy);
            drawBody(hx, hy);
            // It tears through whatever is in the air on its way down.
            for (const t of world.targets(hx, hy)) {
              if (struck.has(t) || segDist(t.x, t.y, sx, sy, hx, hy) > 16) continue;
              struck.add(t);
              world.strike(t, 0.6 * power, 'skill', false, { freeze: 600 });
              sparks(scene, t.x, t.y, [0x29adff, 0xfff1e8], 6, 14);
            }
          },
          onComplete: () => {
            beast.destroy();
            scene.tweens.add({ targets: body, alpha: 0, duration: 250, onComplete: () => body.destroy() });
            // Impact: one flash, a pillar of light the height of the sky, the floor split open in jagged cracks.
            cam.flash(150, 194, 240, 255);
            cam.shake(450, 0.03);
            const pillar = [
              scene.add.rectangle(lx, FLOOR_Y / 2, 30, FLOOR_Y, 0x29adff, 0.45),
              scene.add.rectangle(lx, FLOOR_Y / 2, 10, FLOOR_Y, 0xc2f0ff, 0.9),
              scene.add.rectangle(lx, FLOOR_Y / 2, 3, FLOOR_Y, 0xfff1e8),
            ].map((r) => r.setDepth(13));
            scene.tweens.add({
              targets: pillar,
              scaleX: 0,
              alpha: 0,
              delay: 120,
              duration: 300,
              onComplete: () => pillar.forEach((r) => r.destroy()),
            });
            const cracks = scene.add.graphics().setDepth(5);
            for (const dir of [-1, 1])
              for (const [w, c] of [
                [3, 0x1d2b53],
                [1, 0x29adff],
              ] as const) {
                cracks
                  .lineStyle(w, c)
                  .beginPath()
                  .moveTo(lx, FLOOR_Y - 1);
                for (let i = 1; i <= 6; i++) cracks.lineTo(lx + dir * i * 9, FLOOR_Y - 1 - (i % 2) * 2);
                cracks.strokePath();
              }
            scene.tweens.add({ targets: cracks, alpha: 0, delay: 700, duration: 400, onComplete: () => cracks.destroy() });
            rocks(scene, lx, FLOOR_Y, 10);
            ring(scene, lx, FLOOR_Y - 8, 0xc2f0ff, 6, 56, 350, 2);
            sparks(scene, lx, FLOOR_Y - 8, [0x29adff, 0xfff1e8, 0xffec27], 20, 50);
            world.area(lx, FLOOR_Y - 14, 52, 1.4 * power, 220, 'skill', { freeze: 800 });
            // The discharge forks out to every enemy in the arena, one after another.
            world.targets(lx, FLOOR_Y - 8).forEach((t, i) =>
              later(scene, 120 + i * 50, () => {
                if (!t.active) return;
                zap(lx, FLOOR_Y - 10, t.x, t.y);
                world.strike(t, 0.7 * power, 'skill', false, { freeze: 500 });
                sparks(scene, t.x, t.y, [0x29adff, 0xfff1e8], 5, 10);
                cam.shake(40, 0.006);
              }),
            );
          },
        });
      });
    },
    // Enton: Kagutsuchi, the Valley of the End: Naruto's clones rush him from every side. The Rinnegan ripples, dark
    // threads of chakra hook everything around him and he yanks it all in (bosses are too heavy and stay put); then
    // the Amaterasu he wears is shaped into a weapon: black-flame spikes stab out of him in every direction, up into the
    // air as well, and run through whatever he pulled in. They burn on for a moment (Amaterasu does not go out), then
    // crumble into black embers with a last flare.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.lock(1300);
      p.invuln(1400);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      const { x, y } = p;
      const R = 150;
      // The Rinnegan: a violet ripple out of his left eye, and rings running out over the arena.
      glint(scene, x - p.facing, y - 6);
      for (let i = 0; i < 3; i++) later(scene, i * 90, () => ring(scene, x, y, 0x8a3fd1, 6, R, 420, 2 - (i % 2)));
      // The threads: a line to every enemy in reach, redrawn as they are dragged in.
      const caught = world.targets(x, y).filter((t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) < R);
      const threads = scene.add.graphics().setDepth(11);
      const reel = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          threads.clear();
          for (const t of caught) {
            if (!t.active) continue;
            threads.lineStyle(3, 0x1d0f2e, 0.7).lineBetween(x, y, t.x, t.y);
            threads.lineStyle(1, 0xc080ff).lineBetween(x, y, t.x, t.y);
          }
        },
      });
      for (const k of [0, 1, 2]) later(scene, 80 + k * 110, () => world.pull(x, y, R, 260));
      // Kagutsuchi: spikes of black flame stab out of him, the arc above the floor and a little below the horizon.
      const N = 16;
      const spikes: Phaser.GameObjects.Container[] = [];
      later(scene, 440, () => {
        reel.remove();
        threads.destroy();
        cam.shake(260, 0.018);
        ring(scene, x, y, 0x7e2553, 4, 30, 200, 2);
        // A dark-red backlight round him for the spikes to stand out against.
        const glow = scene.add.circle(x, y, 20, 0x7e2553, 0.45).setDepth(11);
        scene.tweens.add({ targets: glow, radius: 62, alpha: 0, duration: 800, ease: 'Quad.Out', onComplete: () => glow.destroy() });
        for (let i = 0; i < N; i++) {
          const a = -Math.PI - 0.25 + (i / (N - 1)) * (Math.PI + 0.5);
          const len = i % 2 ? 40 : 56;
          const s = kagutsuchiSpike(scene, x, y, len).setRotation(a);
          spikes.push(s);
          scene.tweens.add({ targets: s, scaleX: 1, delay: (i % 4) * 25, duration: 90, ease: 'Back.Out' });
        }
        later(scene, 60, () => {
          for (const t of world.targets(x, y)) {
            if (Phaser.Math.Distance.Between(x, y, t.x, t.y) > 60) continue;
            sparks(scene, t.x, t.y, [0x000000, 0x7e2553, 0xff004d], 8, 12);
            cutMark(scene, t.x, t.y, 0x7e2553, 18, Phaser.Math.Angle.Between(x, y, t.x, t.y));
            world.strike(t, 1.8 * power, 'skill', true, { burn: 0.4, freeze: 600 }, 0);
          }
        });
        // Black fire licking up the spikes while they stand.
        const lick = scene.time.addEvent({
          delay: 60,
          repeat: 10,
          callback: () => {
            const s = spikes[Phaser.Math.Between(0, N - 1)];
            const d = Phaser.Math.Between(8, 36);
            const f = scene.add
              .triangle(
                x + Math.cos(s.rotation) * d,
                y + Math.sin(s.rotation) * d,
                0,
                4,
                4,
                4,
                2,
                -4,
                Math.random() < 0.7 ? 0x000000 : 0x7e2553,
              )
              .setDepth(13);
            scene.tweens.add({ targets: f, y: f.y - 8, alpha: 0, duration: 300, onComplete: () => f.destroy() });
          },
        });
        // The crumble: the spikes draw back into him and the flames flare out once more.
        later(scene, 720, () => {
          lick.remove();
          spikes.forEach((s, i) =>
            scene.tweens.add({ targets: s, scaleX: 0, alpha: 0, delay: (i % 4) * 20, duration: 160, onComplete: () => s.destroy() }),
          );
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const e = scene.add.rectangle(x + Math.cos(a) * 20, y + Math.sin(a) * 20, 2, 2, i % 3 ? 0x000000 : 0xff004d).setDepth(13);
            scene.tweens.add({
              targets: e,
              x: e.x + Math.cos(a) * 24,
              y: e.y - 10,
              alpha: 0,
              duration: 420,
              onComplete: () => e.destroy(),
            });
          }
          world.area(x, y, 48, 0.6 * power, 120, 'skill', { burn: 0.3 });
        });
      });
    },
    // Indra no Ya, the last clash at the Valley of the End. The sky goes black-violet; the Rinnegan flares and the
    // chakra of all nine tailed beasts streams in from the edges of the arena, each in its own color. The Complete Body
    // Susanoo rises around him (horned helmet, burning eyes, plated armor, violet chakra flames) and he floats in its
    // chest. A bow of lightning forms in its hand and the arrow is drawn, the nine colors winding into its head while
    // it crackles. Aimed as it is loosed, along the line through the most enemies ahead: a beam of black-violet
    // lightning with the nine colors spiraling round it runs across the arena, striking each enemy on the line in turn,
    // branches jumping off it to everyone else. It hits the far side and the whole arena goes up ("LENYAP!").
    ult: ({ p, world, scene, power }) => {
      const foes0 = world.targets(p.x, p.y);
      if (!foes0.length) return false;
      const cam = scene.cameras.main;
      const T = { rise: 350, draw: 1150, loose: 2450, boom: 3000, end: 3700 };
      p.invuln(T.end + 400);
      p.lock(T.end + 200);
      p.setVelocity(0, 0);
      // He turns to whichever side has more enemies.
      const f = foes0.filter((t) => t.x >= p.x).length >= foes0.length / 2 ? 1 : -1;
      p.facing = f;
      p.setFlipX(f < 0);
      // The Susanoo stands at the back edge of the arena, so the field lies ahead of the bow.
      const sx = f > 0 ? 52 : W - 52;
      const night = scene.add.rectangle(0, 0, W, H, 0x0a0414, 0.8).setOrigin(0).setDepth(8).setAlpha(0);
      // The weight of the gathering chakra presses down on everything until the arrow flies.
      for (const t of foes0) world.afflict(t, { slow: T.loose + 200 });
      scene.tweens.add({ targets: night, alpha: 1, duration: 400 });
      // The Rinnegan flares.
      glint(scene, p.x - f, p.y - 6);
      ring(scene, p.x, p.y, 0x8a3fd1, 4, 34, 320, 2);
      // The nine tailed beasts' chakra, one stream each from the edges of the arena into him.
      const BEASTS = [0xff004d, 0x29adff, 0xc2c3c7, 0xff77a8, 0xffa300, 0x00e436, 0x83769c, 0xab5236, 0xffec27];
      const stream = (color: number, x0: number, y0: number, x1: number, y1: number, ms: number) => {
        const cx = (x0 + x1) / 2 + Phaser.Math.Between(-40, 40);
        const cy = Math.min(y0, y1) - Phaser.Math.Between(10, 50);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: ms,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const [bx, by] = bez(x0, y0, cx, cy, x1, y1, tw.getValue() ?? 0);
            const m = scene.add.rectangle(bx, by, 3, 3, color).setDepth(14);
            scene.tweens.add({ targets: m, alpha: 0, scale: 0.3, duration: 260, onComplete: () => m.destroy() });
          },
        });
      };
      BEASTS.forEach((c, i) =>
        later(scene, 150 + i * 70, () => {
          const edge = i % 3;
          const [x0, y0] = edge === 0 ? [4, 30 + i * 12] : edge === 1 ? [W - 4, 30 + i * 12] : [20 + i * 32, 6];
          stream(c, x0, y0, p.x, p.y, 420);
        }),
      );
      // The Susanoo rises; he floats in its chest (held every frame: his own update turns gravity back on).
      const sus = sasukeSusanoo(scene, sx - f * 14, FLOOR_Y, f);
      sus.body.setAlpha(0).setScale(f * 0.9, 0.2);
      const flame = scene.time.addEvent({ delay: 45, loop: true, callback: () => sus.burn(scene.time.now) });
      let ride: { x: number; y: number } | undefined;
      const hold = scene.time.addEvent({ delay: 16, loop: true, callback: () => ride && p.body.reset(ride.x, ride.y) });
      later(scene, T.rise, () => {
        scene.tweens.add({ targets: sus.body, alpha: 0.92, scaleX: f, scaleY: 1, duration: 500, ease: 'Back.Out' });
        cam.shake(500, 0.01);
        rocks(scene, sx, FLOOR_Y - 1, 6);
        ride = { x: p.x, y: p.y };
        scene.tweens.add({ targets: ride, x: sx - f * 14, y: FLOOR_Y - 64, duration: 450, ease: 'Quad.Out' });
      });
      // The bow of lightning, drawn back over a second; the arrow soaks up the nine colors.
      const [gx, gy] = sus.grip;
      const bow = scene.add.graphics().setDepth(12);
      let nock = gx;
      const drawBow = (pull: number) => {
        bow.clear();
        nock = gx - f * (6 + pull);
        const tips: [number, number][] = [
          [gx - f * 8, gy - 50],
          [gx - f * 8, gy + 50],
        ];
        for (const [w, c, al] of [
          [6, 0x8a3fd1, 0.4],
          [3, 0xc080ff, 1],
          [1, 0xfff1e8, 1],
        ] as const) {
          bow
            .lineStyle(w, c, al)
            .beginPath()
            .moveTo(...tips[0]);
          for (let k = 1; k <= 12; k++) bow.lineTo(...bez(tips[0][0], tips[0][1], gx + f * 26, gy, tips[1][0], tips[1][1], k / 12));
          bow.strokePath();
        }
        bow
          .lineStyle(1, 0xfff1e8)
          .beginPath()
          .moveTo(...tips[0])
          .lineTo(nock, gy)
          .lineTo(...tips[1])
          .strokePath();
        // The arrow: a shaft of dark lightning and a barbed head.
        if (pull <= 0) return;
        bow.lineStyle(3, 0x1d0f2e).lineBetween(nock, gy, gx + f * 34, gy);
        bow.lineStyle(1, 0xc080ff).lineBetween(nock, gy, gx + f * 34, gy);
        bow.fillStyle(0xfff1e8).fillTriangle(gx + f * 30, gy - 5, gx + f * 30, gy + 5, gx + f * 42, gy);
        bow.fillStyle(0x8a3fd1).fillTriangle(gx + f * 31, gy - 3, gx + f * 31, gy + 3, gx + f * 38, gy);
      };
      later(scene, T.draw - 250, () => drawBow(0));
      scene.tweens.addCounter({
        from: 0,
        to: gx - sus.hand[0] - f * 6,
        duration: 1000,
        delay: T.draw,
        onUpdate: (tw) => drawBow(Math.abs(tw.getValue() ?? 0)),
      });
      const head: [number, number] = [gx + f * 40, gy];
      BEASTS.forEach((c, i) =>
        later(scene, T.draw + 100 + i * 110, () => {
          stream(c, head[0] + Phaser.Math.Between(-80, 80), head[1] + Phaser.Math.Between(-60, 40), ...head, 300);
          ring(scene, ...head, c, 22, 4, 260, 1);
          bolt(scene, ...head, head[0] + Phaser.Math.Between(-14, 14), head[1] + Phaser.Math.Between(-14, 14), 0x8a3fd1);
          cam.shake(60, 0.004);
        }),
      );
      later(scene, T.loose, () => {
        bow.destroy();
        // Aim on release: the line through the most enemies ahead of the bow.
        const [bx, by] = head;
        const ahead = world.targets(bx, by).filter((t) => (t.x - bx) * f > -4);
        const a =
          Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(bestLine(ahead, bx, by, 18, f > 0 ? 0 : Math.PI) - (f > 0 ? 0 : Math.PI)), -1.1, 1.1) +
          (f > 0 ? 0 : Math.PI);
        const [ca, sa] = [Math.cos(a), Math.sin(a)];
        // Where it hits the edge of the arena.
        const reach = Math.min(
          ca > 0 ? (W - bx) / ca : ca < 0 ? -bx / ca : Infinity,
          sa > 0 ? (FLOOR_Y - by) / sa : sa < 0 ? -by / sa : Infinity,
        );
        const [ex, ey] = [bx + ca * reach, by + sa * reach];
        cam.flash(200, 192, 128, 255);
        cam.shake(400, 0.025);
        // The recoil of the release blasts away whatever crowds the Susanoo's feet.
        ring(scene, sx, FLOOR_Y - 40, 0xc080ff, 10, 76, 320, 3);
        world.area(sx, FLOOR_Y - 40, 76, 1 * power, 180, 'ult');
        const beam = scene.add.container(bx, by).setRotation(a).setDepth(13).setScale(0, 1);
        for (const [h, c, al] of [
          [42, 0x1d0f2e, 0.85],
          [24, 0x8a3fd1, 0.95],
          [7, 0xfff1e8, 1],
        ] as const)
          beam.add(scene.add.rectangle(0, 0, reach, h, c, al).setOrigin(0, 0.5));
        // The nine colors spiraling round it, two strands.
        const spiral = scene.add.graphics();
        for (const ph of [0, Math.PI])
          for (let d = 0; d < reach; d += 5)
            spiral
              .lineStyle(2, BEASTS[Math.floor(d / 15) % 9])
              .lineBetween(d, Math.sin(d / 9 + ph) * 15, d + 5, Math.sin((d + 5) / 9 + ph) * 15);
        beam.add(spiral);
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 160, ease: 'Quad.Out' });
        scene.tweens.add({ targets: beam, scaleY: 0, alpha: 0, delay: 650, duration: 300, onComplete: () => beam.destroy() });
        const foes = world.targets(bx, by);
        foes.forEach((t, i) => {
          if (onLine(bx, by, a, reach, t, 22)) {
            const along = (t.x - bx) * ca + (t.y - by) * sa;
            later(scene, 40 + (along / reach) * 160, () => {
              if (!t.active) return;
              sparks(scene, t.x, t.y, [0xfff1e8, 0xc080ff, 0x8a3fd1], 10, 16);
              cam.shake(70, 0.012);
              world.strike(t, 3.2 * power, 'ult', true, { freeze: 500 });
            });
            return;
          }
          // A branch jumps off the nearest point of the beam to everyone off the line.
          later(scene, 220 + i * 40, () => {
            if (!t.active) return;
            const along = Phaser.Math.Clamp((t.x - bx) * ca + (t.y - by) * sa, 0, reach);
            bolt(scene, bx + ca * along, by + sa * along, t.x, t.y, 0x8a3fd1);
            world.strike(t, 0.8 * power, 'ult', false, { freeze: 400 });
          });
        });
        // The climax: it strikes the far side and the arena goes up.
        later(scene, T.boom - T.loose, () => {
          cam.flash(260, 255, 255, 255);
          cam.shake(700, 0.035);
          floatText(scene, W / 2, 44, 'LENYAP!', '#c080ff');
          const dome = scene.add.circle(ex, ey, 10, 0x1d0f2e, 0.85).setStrokeStyle(3, 0xc080ff).setDepth(13);
          scene.tweens.add({ targets: dome, radius: W * 0.9, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => dome.destroy() });
          ring(scene, ex, ey, 0xfff1e8, 10, W * 0.8, 600, 4);
          ring(scene, ex, ey, 0x8a3fd1, 6, W * 0.7, 520, 3);
          sparks(scene, ex, ey, [...BEASTS, 0xfff1e8], 30, 120);
          for (let i = 0; i < 8; i++) rocks(scene, Phaser.Math.Between(10, W - 10), FLOOR_Y, 3);
          for (const t of world.targets(ex, ey)) world.strike(t, 2 * power, 'ult', true);
        });
      });
      later(scene, T.end, () => {
        flame.remove();
        hold.remove();
        scene.tweens.add({ targets: sus.body, alpha: 0, scaleY: 0.2, duration: 350, onComplete: () => sus.body.destroy() });
        scene.tweens.add({ targets: night, alpha: 0, duration: 400, onComplete: () => night.destroy() });
      });
    },
  },

  // Lightning Lord, king of the storm. His lightning is royal: gold, with a white-hot core and an electric-cyan fringe.
  halilintar: {
    // Sambaran Jatuh: a pillar of lightning comes down on the spot he lands, and arcs run out along the floor.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      stormArc(scene, x, 0, x, gy - 4, 260, 3, 3);
      for (const dir of [-1, 1]) stormArc(scene, x, gy - 3, x + dir * 50, gy - 3, 220, 1, 1);
      for (const t of world.targets(x, gy))
        if (Math.abs(t.x - x) < 52 && t.y > gy - 24) world.strike(t, 0.6 * power, 'proc', false, { freeze: 300 });
    },
    // STATIK: every melee hit stores a charge (gold pips orbiting above his crown). The hit that fills the sixth calls
    // the storm down: a bolt from the sky onto that enemy, which then arcs to the two nearest others. The finisher's
    // overhead slam always cracks a small bolt down onto what it hits.
    onHit: ({ p, world, scene, power }, t) => {
      if (p.move.anim === 'overhead') {
        stormArc(scene, t.x + Phaser.Math.Between(-10, 10), 0, t.x, t.y, 160, 1, 1);
        world.strike(t, 0.4 * power, 'proc', false, { freeze: 200 });
      }
      let n = ((p.getData('static') as number | undefined) ?? 0) + 1;
      if (n >= STATIC_MAX) {
        n = 0;
        stormArc(scene, t.x + Phaser.Math.Between(-16, 16), 0, t.x, t.y, 260, 2, 3);
        ring(scene, t.x, t.y, 0xffec27, 4, 26, 260, 2);
        sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8, 0x7fe6ff], 10, 18);
        scene.cameras.main.shake(120, 0.01);
        world.strike(t, 1.2 * power, 'proc', true, { freeze: 350 });
        world
          .targets(t.x, t.y)
          .filter((o) => o !== t && Phaser.Math.Distance.Between(t.x, t.y, o.x, o.y) < 110)
          .slice(0, 2)
          .forEach((o, i) =>
            later(scene, 80 + i * 70, () => {
              if (!o.active) return;
              stormArc(scene, t.x, t.y, o.x, o.y, 220, 1, 1);
              world.strike(o, 0.7 * power, 'proc', false, { freeze: 300 });
            }),
          );
      }
      p.setData('static', n);
      staticCrown(scene, p);
    },
    // Tombak Halilintar (Thunder Javelin): he opens his free hand and a javelin of pure lightning crackles into being
    // over his shoulder. He throws it at the enemy with the most others in reach right now (in the air too); it
    // strikes like a falling bolt, pins its target paralysed and scorches the ground, then the charge leaps from body
    // to body down a chain, one arc per hop. Stored STATIK is spent on the throw: every two charges add a hop.
    skill: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.lock(300);
      p.setVelocityX(0);
      const stored = (p.getData('static') as number | undefined) ?? 0;
      p.setData('static', 0);
      staticCrown(scene, p);
      const hops = 4 + Math.floor(stored / 2);
      const sx = p.x - f * 2;
      const sy = p.y - 14;
      // The javelin: cyan halo, a gold shaft with a barbed head and a white core, redrawn crackling while held.
      const jg = scene.add.graphics();
      const drawJavelin = () => {
        jg.clear();
        jg.fillStyle(0x7fe6ff, 0.3).fillRect(-16, -3, 34, 6);
        jg.fillStyle(0xd4a017).fillRect(-14, -1.5, 24, 3);
        jg.fillStyle(0xffec27).fillTriangle(10, -4, 10, 4, 20, 0);
        jg.fillStyle(0xd4a017).fillTriangle(10, -4, 6, -6, 10, 0).fillTriangle(10, 4, 6, 6, 10, 0);
        jg.fillStyle(0xfff1e8).fillRect(-12, -0.5, 26, 1);
        for (let i = 0; i < 3; i++) {
          const x = Phaser.Math.Between(-14, 14);
          jg.lineStyle(1, 0x7fe6ff).lineBetween(x, 0, x + Phaser.Math.Between(-3, 3), Phaser.Math.Between(-6, 6));
        }
      };
      drawJavelin();
      const jav = scene.add
        .container(sx, sy, [jg])
        .setDepth(13)
        .setScale(0.3)
        .setRotation(f > 0 ? -0.5 : Math.PI + 0.5);
      scene.tweens.add({ targets: jav, scale: 1, duration: 180, ease: 'Back.Out' });
      const crackle = scene.time.addEvent({ delay: 50, loop: true, callback: drawJavelin });
      glint(scene, sx, sy);
      later(scene, 260, () => {
        // Aim on release: the enemy with the most others within one chain hop.
        const foes = world.targets(sx, sy);
        if (!foes.length) {
          crackle.remove();
          return void jav.destroy();
        }
        const near = (e: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < 90).length;
        const mark = foes.reduce((b, e) => (near(e) > near(b) ? e : b));
        let [px, py] = [sx, sy];
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 170,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            const [tx, ty] = mark.active ? [mark.x, mark.y] : [jav.x, jav.y];
            const [nx, ny] = [sx + (tx - sx) * v, sy + (ty - sy) * v];
            jav.setPosition(nx, ny).setRotation(Phaser.Math.Angle.Between(px, py, nx, ny) || jav.rotation);
            if (v > 0.1) stormArc(scene, px, py, nx, ny, 120, 1, 0);
            [px, py] = [nx, ny];
          },
          onComplete: () => {
            crackle.remove();
            const [x, y] = [jav.x, jav.y];
            // The javelin stays a moment, quivering in its target, then bursts.
            scene.tweens.add({ targets: jav, alpha: 0, delay: 250, duration: 150, onComplete: () => jav.destroy() });
            ring(scene, x, y, 0xffec27, 4, 30, 260, 2);
            ring(scene, x, y, 0x7fe6ff, 4, 20, 220, 1);
            sparks(scene, x, y, [0xffec27, 0xfff1e8, 0x7fe6ff], 12, 20);
            if (y > FLOOR_Y - 30) {
              rocks(scene, x, FLOOR_Y - 2, 4);
              const scorch = scene.add.graphics().setDepth(4);
              for (const s of [-1, 1])
                scorch.lineStyle(1, 0x5f574f).lineBetween(x, FLOOR_Y - 1, x + s * Phaser.Math.Between(10, 18), FLOOR_Y - 1);
              scene.tweens.add({ targets: scorch, alpha: 0, delay: 700, duration: 400, onComplete: () => scorch.destroy() });
            }
            scene.cameras.main.shake(180, 0.014);
            if (mark.active) world.strike(mark, 2.2 * power, 'skill', true, { freeze: 900 });
            // The chain: each hop leaps to the nearest enemy not yet struck, wherever it is.
            const struck = new Set<Phaser.GameObjects.GameObject>([mark]);
            let from = { x, y };
            for (let h = 0; h < hops; h++)
              later(scene, 90 + h * 80, () => {
                const next = world
                  .targets(from.x, from.y)
                  .filter((o) => !struck.has(o))
                  .sort(
                    (a, b) =>
                      Phaser.Math.Distance.Between(from.x, from.y, a.x, a.y) - Phaser.Math.Distance.Between(from.x, from.y, b.x, b.y),
                  )[0];
                if (!next) return;
                struck.add(next);
                stormArc(scene, from.x, from.y, next.x, next.y, 240, 1, 2);
                sparks(scene, next.x, next.y, [0xffec27, 0x7fe6ff], 6, 12);
                scene.cameras.main.shake(60, 0.006);
                world.strike(next, 0.9 * power, 'skill', false, { freeze: 450 });
                from = { x: next.x, y: next.y };
              });
          },
        });
      });
    },
    // Mahkota Badai (Storm Crown): he lifts the halberd and six orbs of ball lightning ignite one after another in a
    // ring around him, joined by arcs into a crown that turns over his head. Then the crown breaks: each orb streaks to
    // an enemy (following it as it moves, flyers too), and the moment it lands a bolt from the sky slams the same spot.
    // Fewer enemies, fewer orbs: three at least, two per enemy, six at most.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const count = Phaser.Math.Clamp(foes.length * 2, 3, 6);
      p.invuln(1700);
      p.lock(1300);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      const R = 22;
      const orbs = Array.from({ length: count }, (_, i) => {
        const og = scene.add.graphics();
        og.fillStyle(0x7fe6ff, 0.3).fillCircle(0, 0, 6);
        og.fillStyle(0xd4a017).fillCircle(0, 0, 4);
        og.fillStyle(0xffec27).fillCircle(0, 0, 3);
        og.fillStyle(0xfff1e8).fillCircle(-1, -1, 1.5);
        const c = scene.add
          .container(p.x, p.y - 20, [og])
          .setDepth(13)
          .setScale(0);
        later(scene, i * 90, () => {
          scene.tweens.add({ targets: c, scale: 1, duration: 160, ease: 'Back.Out' });
          glint(scene, c.x, c.y);
        });
        return { c, a: (i / count) * Math.PI * 2, free: false };
      });
      // The crown turns, its orbs joined by flickering arcs.
      const links = scene.add.graphics().setDepth(12);
      let turn = 0;
      const spin = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          turn += 0.08;
          links.clear();
          const held = orbs.filter((o) => !o.free);
          held.forEach((o) => o.c.setPosition(p.x + Math.cos(o.a + turn) * R, p.y - 22 + Math.sin(o.a + turn) * R * 0.35));
          for (let i = 0; i < held.length; i++) {
            const [a, b] = [held[i].c, held[(i + 1) % held.length].c];
            if (held.length < 2 || Math.random() < 0.3) continue;
            const mx = (a.x + b.x) / 2 + Phaser.Math.Between(-3, 3);
            const my = (a.y + b.y) / 2 + Phaser.Math.Between(-3, 3);
            links
              .lineStyle(1, i % 2 ? 0xffec27 : 0x7fe6ff)
              .lineBetween(a.x, a.y, mx, my)
              .lineBetween(mx, my, b.x, b.y);
          }
        },
      });
      later(scene, count * 90 + 150, () => ring(scene, p.x, p.y - 22, 0xffec27, R, R + 14, 300, 1));
      // The crown breaks: the orbs are dealt out over the enemies once (round-robin, so each gets its share), then each
      // flies at its own enemy wherever it is now; if that one already fell, at the nearest still standing.
      let order: Phaser.GameObjects.Sprite[] = [];
      orbs.forEach((o, i) =>
        later(scene, 700 + i * 110, () => {
          if (!i) order = world.targets(p.x, p.y);
          const dealt = order.length ? order[i % order.length] : undefined;
          const t = dealt?.active ? dealt : world.targets(o.c.x, o.c.y)[0];
          if (!t) return void o.c.destroy();
          o.free = true;
          const [ox, oy] = [o.c.x, o.c.y];
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 200,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const v = tw.getValue() ?? 0;
              const [tx, ty] = t.active ? [t.x, t.y] : [o.c.x, o.c.y];
              o.c.setPosition(ox + (tx - ox) * v, oy + (ty - oy) * v - Math.sin(v * Math.PI) * 16);
            },
            onComplete: () => {
              const [x, y] = [o.c.x, o.c.y];
              o.c.destroy();
              if (i === 0) cam.flash(110, 255, 236, 39);
              cam.shake(110, 0.012);
              stormArc(scene, x + Phaser.Math.Between(-12, 12), 0, x, y, 240, 2, 3);
              ring(scene, x, y, 0xffec27, 4, 24, 240, 2);
              sparks(scene, x, y, [0xffec27, 0xfff1e8, 0x7fe6ff], 9, 18);
              if (y > FLOOR_Y - 30) rocks(scene, x, FLOOR_Y - 2, 3);
              if (t.active) world.strike(t, 0.75 * power, 'skill', false, { freeze: 350 });
              world.area(x, y, 16, 0.45 * power, 60, 'skill');
            },
          });
        }),
      );
      later(scene, 700 + count * 110 + 260, () => {
        spin.remove();
        links.destroy();
      });
    },
    // Penghakiman Guntur (Judgement of Thunder): the storm answers its king. The sky goes black and thunderheads roll
    // in over the arena, lit from inside; he rises into the air, his eyes burning gold, as the arena's charge streams
    // into him. A rune circle of lightning opens in the clouds above. From it a web of lightning reaches down and runs
    // from enemy to enemy until every one of them is bound into it, crackling and paralysed, pulsing twice. Then he
    // drives the halberd down: one colossal bolt falls from the rune and the whole web detonates at once ("GUNTUR!").
    ult: ({ p, world, scene, power }) => {
      const foes = world
        .targets(p.x, p.y)
        .sort((a, b) => a.x - b.x)
        .slice(0, 12);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const WEB = 1100;
      const LINK = 110;
      const CLIMAX = WEB + foes.length * LINK + 650;
      p.invuln(CLIMAX + 900);
      p.lock(CLIMAX + 600);
      p.setVelocity(0, 0);
      const home = { x: p.x, y: p.y };
      const night = scene.add.rectangle(0, 0, W, H, 0x05030a, 0.7).setOrigin(0).setDepth(8).setAlpha(0);
      scene.tweens.add({ targets: night, alpha: 1, duration: 400 });
      // Thunderheads: layered dark clouds with lit undersides, rolling in from both sides; inner flashes light one up.
      const clouds = scene.add.graphics().setDepth(8.5);
      let roll = 0;
      let lit = -1;
      const drawClouds = () => {
        clouds.clear();
        for (let i = 0; i < 9; i++) {
          const cx = ((((i * 44 + roll * (i % 2 ? 1 : -1)) % (W + 60)) + W + 60) % (W + 60)) - 30;
          const cy = 10 + (i % 3) * 7;
          clouds.fillStyle(0x1c1c28).fillEllipse(cx, cy, 70, 26);
          clouds.fillStyle(i === lit ? 0x83769c : 0x3b3b4f).fillEllipse(cx, cy + 6, 56, 12);
          clouds.fillStyle(0x5f574f, 0.6).fillEllipse(cx - 8, cy - 4, 30, 10);
        }
      };
      const weather = scene.time.addEvent({
        delay: 40,
        loop: true,
        callback: () => {
          roll += 0.6;
          lit = Math.random() < 0.15 ? Phaser.Math.Between(0, 8) : lit === -1 ? -1 : Math.random() < 0.5 ? lit : -1;
          drawClouds();
        },
      });
      drawClouds();
      clouds.setAlpha(0);
      scene.tweens.add({ targets: clouds, alpha: 1, duration: 500 });
      // He rises, held in place every frame (the player's own update turns gravity back on).
      const hover = { y: Math.min(home.y, FLOOR_Y - 8) };
      const hold = scene.time.addEvent({ delay: 16, loop: true, callback: () => p.body.reset(home.x, hover.y) });
      scene.tweens.add({ targets: hover, y: 72, duration: 700, ease: 'Sine.Out' });
      for (let i = 0; i < 28; i++)
        later(scene, 150 + i * 25, () => {
          const m = scene.add
            .rectangle(Phaser.Math.Between(0, W), FLOOR_Y - Phaser.Math.Between(0, 30), 1, 3, i % 2 ? 0xffec27 : 0x7fe6ff)
            .setDepth(12);
          scene.tweens.add({ targets: m, x: home.x, y: hover.y, duration: 380, ease: 'Quad.In', onComplete: () => m.destroy() });
        });
      later(scene, 650, () => glint(scene, p.x + p.facing * 2, p.y - 6));
      // The rune circle in the clouds: two rings, eight rune ticks and a star, turning.
      const rx = Phaser.Math.Clamp(home.x, 50, W - 50);
      const ry = 34;
      const rg = scene.add.graphics();
      rg.lineStyle(2, 0xd4a017).strokeCircle(0, 0, 26);
      rg.lineStyle(1, 0xffec27).strokeCircle(0, 0, 21).strokeCircle(0, 0, 9);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        rg.lineStyle(2, 0xfff1e8).lineBetween(Math.cos(a) * 21, Math.sin(a) * 21, Math.cos(a) * 26, Math.sin(a) * 26);
        rg.lineStyle(1, 0x7fe6ff).lineBetween(Math.cos(a) * 9, Math.sin(a) * 9, Math.cos(a + 0.8) * 21, Math.sin(a + 0.8) * 21);
      }
      const rune = scene.add.container(rx, ry, [rg]).setDepth(9).setScale(0);
      later(scene, 900, () => {
        cam.flash(160, 255, 236, 39);
        scene.tweens.add({ targets: rune, scale: 1, duration: 300, ease: 'Back.Out' });
        scene.tweens.add({ targets: rune, angle: 360, duration: 3000 });
      });
      // The web: rune -> first enemy, then each enemy to the next, every link crackling until the end.
      const web = scene.add.graphics().setDepth(12);
      const nodes: { x: number; y: number; t?: Phaser.GameObjects.Sprite }[] = [{ x: rx, y: ry }];
      const drawWeb = () => {
        web.clear();
        for (const n of nodes) if (n.t?.active) [n.x, n.y] = [n.t.x, n.t.y];
        for (let i = 1; i < nodes.length; i++) {
          const [a, b] = [nodes[i - 1], nodes[i]];
          const pts = jag(a.x, a.y, b.x, b.y, 5);
          for (const [w, c, al] of [
            [4, 0x7fe6ff, 0.35],
            [2, 0xffec27, 1],
            [1, 0xfff1e8, 1],
          ] as const) {
            web.lineStyle(w, c, al).beginPath().moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts) web.lineTo(x, y);
            web.strokePath();
          }
        }
      };
      const crackle = scene.time.addEvent({ delay: 60, loop: true, callback: drawWeb });
      foes.forEach((t, i) =>
        later(scene, WEB + i * LINK, () => {
          if (!t.active) return;
          nodes.push({ x: t.x, y: t.y, t });
          drawWeb();
          sparks(scene, t.x, t.y, [0xffec27, 0x7fe6ff], 6, 12);
          cam.shake(70, 0.008);
          world.strike(t, 0.9 * power, 'ult', false, { freeze: 600 });
        }),
      );
      // Two pulses run through the whole web.
      for (const k of [0, 1])
        later(scene, WEB + foes.length * LINK + 100 + k * 250, () => {
          cam.shake(120, 0.01);
          for (const n of nodes.slice(1))
            if (n.t?.active) {
              ring(scene, n.x, n.y, 0xffec27, 3, 14, 180, 1);
              world.strike(n.t, 0.4 * power, 'ult', false, { freeze: 400 });
            }
        });
      // The climax: the colossal bolt from the rune to the ground, and the web detonates.
      later(scene, CLIMAX, () => {
        crackle.remove();
        web.destroy();
        const gx = rx;
        cam.flash(260, 255, 255, 255);
        cam.shake(700, 0.035);
        floatText(scene, W / 2, 52, 'GUNTUR!', '#ffec27');
        stormArc(scene, gx, ry, gx, FLOOR_Y, 500, 4, 6);
        const pillar = [
          scene.add.rectangle(gx, 0, 34, FLOOR_Y, 0x7fe6ff, 0.35),
          scene.add.rectangle(gx, 0, 14, FLOOR_Y, 0xffec27, 0.8),
          scene.add.rectangle(gx, 0, 4, FLOOR_Y, 0xfff1e8),
        ].map((r) => r.setOrigin(0.5, 0).setDepth(13));
        scene.tweens.add({
          targets: pillar,
          scaleX: 0,
          alpha: 0,
          delay: 120,
          duration: 450,
          onComplete: () => pillar.forEach((r) => r.destroy()),
        });
        ring(scene, gx, FLOOR_Y - 4, 0xffec27, 10, W * 0.6, 600, 3);
        for (let i = 0; i < 8; i++) rocks(scene, Phaser.Math.Between(10, W - 10), FLOOR_Y, 2);
        // Cracks of light run along the floor from the impact to both walls.
        const cracks = scene.add.graphics().setDepth(9);
        for (const s of [-1, 1]) {
          const pts = jag(gx, FLOOR_Y - 1, s > 0 ? W : 0, FLOOR_Y - 1, 3);
          cracks.lineStyle(2, 0xffec27).beginPath().moveTo(pts[0][0], pts[0][1]);
          for (const [x, y] of pts) cracks.lineTo(x, y);
          cracks.strokePath();
        }
        scene.tweens.add({ targets: cracks, alpha: 0, delay: 400, duration: 500, onComplete: () => cracks.destroy() });
        for (const t of world.targets(gx, FLOOR_Y)) {
          later(scene, Math.abs(t.x - gx) * 0.8, () => {
            if (!t.active) return;
            sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8, 0x7fe6ff], 12, 22);
            ring(scene, t.x, t.y, 0xfff1e8, 4, 26, 260, 2);
            world.strike(t, 2.5 * power, 'ult', true);
          });
        }
      });
      later(scene, CLIMAX + 500, () => {
        hold.remove();
        weather.remove();
        scene.tweens.add({
          targets: [night, clouds, rune],
          alpha: 0,
          duration: 450,
          onComplete: () => [night, clouds, rune].forEach((o) => o.destroy()),
        });
      });
    },
  },
  // Nephalem, born of an angel and a demon: one half holy (white, gold), the other infernal (black, crimson); where they
  // meet, twilight violet.
  surgaNeraka: {
    // Penghakiman Senja: a column of holy light falls on him as he lands and a ring of hellfire bursts out of the floor.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const beam = scene.add.rectangle(x, 0, 10, gy, HOLY, 0.5).setOrigin(0.5, 0).setDepth(12);
      scene.tweens.add({ targets: beam, scaleX: 0, alpha: 0, duration: 350, onComplete: () => beam.destroy() });
      balanceSigil(scene, x, gy - 8, 16);
      for (let i = -2; i <= 2; i++) flameTongue(scene, x + i * 10, gy, 16, 380, FIRE);
      world.area(x, gy - 8, 34, 0.6 * power, 140, 'proc', { burn: 0.1, slow: 600 });
    },
    // KESEIMBANGAN: holy (gold) cuts fill CAHAYA, infernal (crimson) cuts fill KEGELAPAN, the twilight finisher fills
    // both. When both are full, the halves resolve: a gold-and-crimson balance sigil bursts at the target, striking
    // everything around it, and the grace of it heals him.
    onHit: ({ p, world, scene, power }, t) => {
      const cut = p.move.cut ?? p.weapon.cut;
      let light = ((p.getData('light') as number | undefined) ?? 0) + (cut === HOLY || cut === TWILIGHT ? 1 : 0);
      let dark = ((p.getData('dark') as number | undefined) ?? 0) + (cut === HELL || cut === TWILIGHT ? 1 : 0);
      light = Math.min(BALANCE_MAX, light);
      dark = Math.min(BALANCE_MAX, dark);
      if (light >= BALANCE_MAX && dark >= BALANCE_MAX) {
        light = dark = 0;
        balanceSigil(scene, t.x, t.y, 16);
        scene.cameras.main.shake(140, 0.012);
        world.area(t.x, t.y, 32, 1.2 * power, 120, 'proc', { burn: 0.15, slow: 800 });
        p.heal(Math.ceil(p.stats.maxHp * 0.04));
        floatText(scene, t.x, t.y - 22, 'SEIMBANG!', '#c080ff');
      }
      p.setData({ light, dark });
    },
    // Sayap Senja (Twilight Wings): both wings unfurl at full span and beat once. Each half strikes its own side of
    // the world: the white wing looses lances of light at every enemy on its side, which pin them where they are; the
    // black wing hurls hellfire at every enemy on the other, which burns. Each shot is aimed at its target as it flies.
    skill: ({ p, world, scene, power }) => {
      const foes = world
        .targets(p.x, p.y)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))
        .slice(0, 8);
      if (!foes.length) return false;
      p.lock(520);
      p.setVelocityX(0);
      const angel = p.flipX ? 1 : -1;
      const wg = scene.add.graphics();
      const wings = scene.add
        .container(p.x, p.y - 4, [wg])
        .setDepth(9.5)
        .setScale(0.3);
      let flap = 0;
      const beat = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          wings.setPosition(p.x, p.y - 4);
          wg.clear();
          twilightWings(wg, angel, 26, flap);
        },
      });
      scene.tweens.add({ targets: wings, scale: 1, duration: 220, ease: 'Back.Out' });
      // The beat: wings rise, then sweep down hard.
      scene.tweens.addCounter({ from: 0, to: 1, delay: 120, duration: 140, onUpdate: (tw) => (flap = -(tw.getValue() ?? 0)) });
      later(scene, 270, () => {
        flap = 0.6;
        scene.cameras.main.shake(120, 0.01);
        feathers(scene, p.x + angel * 14, p.y - 8, 6, 14, 30);
        foes.forEach((t, i) => {
          const side = Math.sign(t.x - p.x) || p.facing;
          const holy = side === angel;
          const [ox, oy] = [p.x + side * 22, p.y - 14];
          const g = scene.add.graphics();
          if (holy) {
            // A lance of light: a long white diamond with a gold edge and a pale halo.
            g.fillStyle(0xffec27, 0.35).fillEllipse(0, 0, 22, 6);
            g.fillStyle(0xd4a017).fillTriangle(-10, 0, 0, -2.5, 12, 0).fillTriangle(-10, 0, 0, 2.5, 12, 0);
            g.fillStyle(0xfff1e8).fillTriangle(-8, 0, 0, -1.5, 10, 0).fillTriangle(-8, 0, 0, 1.5, 10, 0);
          } else {
            // Hellfire: a crimson flame with a black edge and a yellow-hot heart, trailing backward.
            g.fillStyle(0x1d0f2e).fillTriangle(-12, 0, 4, -5, 4, 5).fillCircle(4, 0, 5);
            g.fillStyle(0xff004d).fillTriangle(-10, 0, 4, -4, 4, 4).fillCircle(4, 0, 4);
            g.fillStyle(0xffa300).fillCircle(5, 0, 2);
          }
          const shot = scene.add.container(ox, oy, [g]).setDepth(13).setAlpha(0);
          later(scene, i * 45, () => {
            shot.setAlpha(1);
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              duration: 210,
              ease: 'Quad.In',
              onUpdate: (tw) => {
                const v = tw.getValue() ?? 0;
                const [tx, ty] = t.active ? [t.x, t.y] : [shot.x, shot.y];
                const [nx, ny] = [ox + (tx - ox) * v, oy + (ty - oy) * v - Math.sin(v * Math.PI) * 18];
                shot.setRotation(Phaser.Math.Angle.Between(shot.x, shot.y, nx, ny) || shot.rotation).setPosition(nx, ny);
                if (!holy && Math.random() < 0.5) {
                  const e = scene.add.circle(nx, ny, 1, 0xffa300).setDepth(12);
                  scene.tweens.add({ targets: e, y: ny - 6, alpha: 0, duration: 260, onComplete: () => e.destroy() });
                }
              },
              onComplete: () => {
                const [x, y] = [shot.x, shot.y];
                shot.destroy();
                if (holy) {
                  glint(scene, x, y);
                  ring(scene, x, y, 0xffec27, 3, 16, 220, 1);
                  if (t.active) world.strike(t, 1.6 * power, 'skill', false, { slow: 1100 });
                } else {
                  flameTongue(scene, x, y + 6, 16, 420, [0x1d0f2e, 0xff004d, 0xffa300]);
                  sparks(scene, x, y, [0xff004d, 0xffa300, 0x1d0f2e], 6, 12);
                  if (t.active) world.strike(t, 1.6 * power, 'skill', false, { burn: 0.35 });
                }
              },
            });
          });
        });
      });
      later(scene, 650, () => {
        beat.remove();
        scene.tweens.add({ targets: wings, scale: 0.3, alpha: 0, duration: 200, onComplete: () => wings.destroy() });
      });
    },
    // Gerbang Surga & Neraka (the Gates of Heaven and Hell): above the arena a gate of light opens in the sky, and below
    // it the floor splits into a glowing gate of hell. Over every enemy a pillar of light falls from the one while
    // hellfire erupts from the other, and the two meet in the enemy in a twilight cross that cuts it both ways.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 8);
      if (!foes.length) return false;
      p.invuln(1900);
      p.lock(1300);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      const gx = W / 2;
      // The gate of heaven: two pillars, an arch and light pouring out between them.
      const hg = scene.add.graphics();
      hg.fillStyle(0xfff1e8, 0.25).fillRect(-26, -16, 52, 32);
      hg.fillStyle(0xd4a017).fillRect(-30, -18, 6, 36).fillRect(24, -18, 6, 36);
      hg.fillStyle(0xffec27).fillRect(-29, -18, 2, 36).fillRect(25, -18, 2, 36);
      hg.lineStyle(4, 0xd4a017).beginPath().arc(0, -18, 27, Math.PI, 0).strokePath();
      hg.lineStyle(1, 0xfff1e8).beginPath().arc(0, -18, 25, Math.PI, 0).strokePath();
      const heaven = scene.add.container(gx, 34, [hg]).setDepth(9).setScale(1, 0).setAlpha(0.95);
      scene.tweens.add({ targets: heaven, scaleY: 1, duration: 350, ease: 'Back.Out' });
      // The gate of hell: a fissure across the floor, black lips and a crimson glow, widening.
      const hell = scene.add.graphics().setDepth(9);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 450,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          hell.clear();
          const half = (W / 2) * v;
          hell.fillStyle(0xff004d, 0.5).fillRect(gx - half, FLOOR_Y - 3, half * 2, 4);
          hell.fillStyle(0xffa300).fillRect(gx - half, FLOOR_Y - 2, half * 2, 1);
          hell.lineStyle(1, 0x1d0f2e);
          for (let x = gx - half; x < gx + half; x += 8) hell.lineBetween(x, FLOOR_Y - 3, x + 4, FLOOR_Y - 5);
        },
      });
      cam.shake(300, 0.01);
      foes.forEach((t, i) =>
        later(scene, 550 + i * 120, () => {
          if (!t.active) return;
          const [x, y] = [t.x, t.y];
          // Light from above: a beam from the gate to the enemy.
          const beam = [scene.add.rectangle(x, 0, 12, y, 0xffec27, 0.35), scene.add.rectangle(x, 0, 4, y, 0xfff1e8)].map((r) =>
            r.setOrigin(0.5, 0).setDepth(12),
          );
          scene.tweens.add({
            targets: beam,
            scaleX: 0,
            alpha: 0,
            delay: 120,
            duration: 260,
            onComplete: () => beam.forEach((r) => r.destroy()),
          });
          // Fire from below: a hellfire column from the floor up to the enemy.
          const h = Math.max(10, FLOOR_Y - y + 10);
          flameTongue(scene, x, FLOOR_Y, h, 460, [0x1d0f2e, 0xff004d, 0xffa300]);
          flameTongue(scene, x + 3, FLOOR_Y, h * 0.7, 380, [0x1d0f2e, 0xff004d, 0xffa300]);
          // They meet: the twilight cross.
          later(scene, 90, () => {
            if (i === 0) cam.flash(120, 192, 128, 255);
            cam.shake(80, 0.01);
            cutMark(scene, x, y, HOLY, 30, -Math.PI / 4);
            cutMark(scene, x, y, HELL, 30, Math.PI / 4);
            ring(scene, x, y, TWILIGHT, 4, 22, 260, 2);
            if (!t.active) return;
            world.strike(t, 1 * power, 'skill', false, { slow: 800 });
            world.strike(t, 0.85 * power, 'skill', true, { burn: 0.3 });
          });
        }),
      );
      later(scene, 550 + foes.length * 120 + 400, () => {
        scene.tweens.add({ targets: heaven, scaleY: 0, alpha: 0, duration: 250, onComplete: () => heaven.destroy() });
        scene.tweens.add({ targets: hell, alpha: 0, duration: 300, onComplete: () => hell.destroy() });
      });
    },
    // Senjakala (Twilight): the sky tears down the middle, dawn gold on one side and the red of hell on the other. He
    // rises between them as both wings unfold to their full, terrible size, halo blazing and horn burning, while light
    // falls and embers rise into him. Then, one enemy after another, a lance of light from the white wing and hellfire
    // from the black wing strike it together. At the end he brings both wings forward in one clap: a twin wave of gold
    // and crimson with a violet heart sweeps the entire arena ("SENJAKALA!").
    ult: ({ p, world, scene, power }) => {
      const foes = world
        .targets(p.x, p.y)
        .sort((a, b) => a.x - b.x)
        .slice(0, 10);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const STEP = 170;
      const CLAP = 1050 + foes.length * STEP + 250;
      p.invuln(CLAP + 900);
      p.lock(CLAP + 600);
      p.setVelocity(0, 0);
      const home = { x: p.x, y: p.y };
      const angel = p.flipX ? 1 : -1;
      // The torn sky: dawn on the angel's side, hell on the demon's, a crackling seam between.
      const ax = angel < 0 ? 0 : W / 2;
      const dawn = scene.add
        .rectangle(ax, 0, W / 2, H, 0xffec27, 0.22)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      const blood = scene.add
        .rectangle(angel < 0 ? W / 2 : 0, 0, W / 2, H, 0x7a0a1e, 0.45)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      const seam = scene.add
        .rectangle(W / 2, 0, 2, H, 0xc080ff)
        .setOrigin(0.5, 0)
        .setDepth(8.1)
        .setAlpha(0);
      scene.tweens.add({ targets: [dawn, blood, seam], alpha: 1, duration: 450 });
      scene.tweens.add({ targets: seam, scaleX: 2, yoyo: true, repeat: -1, duration: 90 });
      // He rises (held in place every frame: the player's own update turns gravity back on).
      const hover = { y: Math.min(home.y, FLOOR_Y - 8) };
      const hold = scene.time.addEvent({ delay: 16, loop: true, callback: () => p.body.reset(home.x, hover.y) });
      scene.tweens.add({ targets: hover, y: 76, duration: 700, ease: 'Sine.Out' });
      // The great wings, beating slowly.
      const wg = scene.add.graphics();
      const wings = scene.add
        .container(home.x, hover.y - 4, [wg])
        .setDepth(9.5)
        .setScale(0.4);
      let t0 = 0;
      const span = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          t0 += 16;
          wings.setPosition(p.x, p.y - 4);
          wg.clear();
          twilightWings(wg, angel, 34, Math.sin(t0 / 220) * 0.3);
        },
      });
      scene.tweens.add({ targets: wings, scale: 1.3, duration: 700, ease: 'Back.Out' });
      // Light falls on the dawn side and embers rise on the hell side, all drawn into him.
      for (let i = 0; i < 30; i++)
        later(scene, 100 + i * 25, () => {
          const holy = i % 2 === 0;
          const sx = (holy ? ax : angel < 0 ? W / 2 : 0) + Phaser.Math.Between(0, W / 2);
          const m = scene.add.rectangle(sx, holy ? 0 : FLOOR_Y, 1, 3, holy ? 0xfff1e8 : 0xff004d).setDepth(12);
          scene.tweens.add({ targets: m, x: home.x, y: hover.y, duration: 420, ease: 'Quad.In', onComplete: () => m.destroy() });
        });
      later(scene, 850, () => {
        cam.flash(200, 192, 128, 255);
        ring(scene, p.x - angel * 0, p.y - 12, 0xffec27, 4, 18, 300, 2);
        ring(scene, p.x, p.y, 0xff004d, 6, 30, 320, 1);
      });
      // The judgement, one enemy at a time: light from the white wing and fire from the black wing together.
      foes.forEach((t, i) =>
        later(scene, 1050 + i * STEP, () => {
          if (!t.active) return;
          for (const holy of [true, false]) {
            const side = holy ? angel : -angel;
            const [ox, oy] = [p.x + side * 40, p.y - 10];
            const g = scene.add.graphics();
            if (holy) {
              g.fillStyle(0xffec27, 0.35).fillEllipse(0, 0, 24, 7);
              g.fillStyle(0xfff1e8).fillTriangle(-11, 0, 0, -2, 12, 0).fillTriangle(-11, 0, 0, 2, 12, 0);
            } else {
              g.fillStyle(0x1d0f2e).fillCircle(0, 0, 6);
              g.fillStyle(0xff004d).fillCircle(0, 0, 4.5);
              g.fillStyle(0xffa300).fillCircle(1, 0, 2);
            }
            const s = scene.add.container(ox, oy, [g]).setDepth(13);
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              duration: 150,
              ease: 'Quad.In',
              onUpdate: (tw) => {
                const v = tw.getValue() ?? 0;
                const [tx, ty] = t.active ? [t.x, t.y] : [s.x, s.y];
                const [nx, ny] = [ox + (tx - ox) * v, oy + (ty - oy) * v];
                s.setRotation(Phaser.Math.Angle.Between(s.x, s.y, nx, ny) || s.rotation).setPosition(nx, ny);
              },
              onComplete: () => s.destroy(),
            });
          }
          later(scene, 150, () => {
            if (!t.active) return;
            cam.shake(90, 0.012);
            cutMark(scene, t.x, t.y, HOLY, 28, -Math.PI / 4);
            cutMark(scene, t.x, t.y, HELL, 28, Math.PI / 4);
            sparks(scene, t.x, t.y, [0xfff1e8, 0xff004d, 0xc080ff], 8, 16);
            world.strike(t, 0.8 * power, 'ult', false, { slow: 900 });
            world.strike(t, 0.8 * power, 'ult', false, { burn: 0.3 });
          });
        }),
      );
      // The clap: the twin wave sweeps the arena.
      later(scene, CLAP, () => {
        scene.tweens.add({ targets: wings, scaleX: 0.5, duration: 120, yoyo: true });
        cam.flash(240, 255, 241, 232);
        cam.shake(700, 0.032);
        floatText(scene, W / 2, 46, 'SENJAKALA!', '#c080ff');
        ring(scene, p.x, p.y, 0xffec27, 10, W, 650, 4);
        ring(scene, p.x, p.y, 0xff004d, 6, W * 0.9, 600, 3);
        ring(scene, p.x, p.y, 0xc080ff, 4, W * 0.7, 550, 2);
        balanceSigil(scene, p.x, p.y, 28);
        for (const t of world.targets(p.x, p.y)) {
          later(scene, Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) * 1.2, () => {
            if (!t.active) return;
            sparks(scene, t.x, t.y, [0xffec27, 0xff004d, 0xc080ff], 10, 18);
            world.strike(t, 2.4 * power, 'ult', true, { burn: 0.25 });
          });
        }
        p.heal(Math.ceil(p.stats.maxHp * 0.1));
      });
      later(scene, CLAP + 600, () => {
        hold.remove();
        span.remove();
        scene.tweens.add({ targets: wings, scale: 0.3, alpha: 0, duration: 300, onComplete: () => wings.destroy() });
        scene.tweens.add({
          targets: [dawn, blood, seam],
          alpha: 0,
          duration: 450,
          onComplete: () => [dawn, blood, seam].forEach((o) => o.destroy()),
        });
      });
    },
  },
  // Lumina, master of light. Her light is white-hot with a cyan glow and a thin spectrum fringe; when it is bent or
  // reflected it runs through the colors of the rainbow.
  foton: {
    // The finisher's rising cut throws a ray of light at the nearest enemy ahead (air too, within ±0.9 rad): a
    // white core in a cyan glow with a red and a violet fringe, the light split at its edges.
    onSwing: ({ p, world, scene, power }, _m, step) => {
      if (step !== 2) return;
      const f = p.facing;
      const [ox, oy] = [p.x + f * 8, p.y - 4];
      const ahead = world
        .targets(ox, oy)
        .find((t) => Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(ox, oy, t.x, t.y) - (f > 0 ? 0 : Math.PI))) < 0.9);
      const a = ahead ? Phaser.Math.Angle.Between(ox, oy, ahead.x, ahead.y) : f > 0 ? -0.15 : Math.PI + 0.15;
      later(scene, 90, () => {
        lightRay(scene, ox, oy, a, 320, 1, 260);
        for (const t of world.targets(ox, oy))
          if (onLine(ox, oy, a, 320, t, 10)) world.strike(t, 0.8 * power, 'proc', false, { freeze: 200 }, 80);
      });
    },
    // Tombak Matahari (Sun Spear): she lands where a pillar of sunlight falls; on impact the light runs out along the
    // floor both ways in eight rays, scorching whatever stands on them.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const pillar = [
        scene.add.rectangle(x, 0, 30, gy, 0xffec27, 0.3),
        scene.add.rectangle(x, 0, 12, gy, 0xfff1e8, 0.8),
        scene.add.rectangle(x, 0, 3, gy, 0xffffff),
      ].map((r) => r.setOrigin(0.5, 0).setDepth(12));
      scene.tweens.add({
        targets: pillar,
        scaleX: 0,
        alpha: 0,
        delay: 120,
        duration: 300,
        onComplete: () => pillar.forEach((r) => r.destroy()),
      });
      ring(scene, x, gy - 2, 0xffec27, 4, 40, 300, 2);
      const rays = scene.add.graphics().setDepth(11);
      for (let i = 0; i < 8; i++) {
        const s = i % 2 ? 1 : -1;
        const len = 30 + Math.floor(i / 2) * 22;
        const y = gy - 1 - Math.floor(i / 2) * 2;
        rays.lineStyle(2, i % 4 < 2 ? 0xffec27 : 0xc2f0ff).lineBetween(x, y, x + s * len, y);
      }
      scene.tweens.add({ targets: rays, alpha: 0, delay: 200, duration: 300, onComplete: () => rays.destroy() });
      for (const t of world.targets(x, gy))
        if (Math.abs(t.x - x) < 100 && t.y > gy - 28) world.strike(t, 0.7 * power, 'proc', false, { burn: 0.15 }, 60);
    },
    // Jaring Cermin (Mirror Lattice): hexagonal mirrors of hard light flicker into being beside every enemy (and her
    // KRISTAL CAHAYA join them as extra mirrors). She fires one laser from her palm; it strikes the first mirror and
    // reflects to the next, and the next, a geometric web drawn across the arena, each reflection shifting one step
    // down the spectrum: red, orange, yellow, green, blue, indigo, violet. Every enemy a segment crosses is struck and
    // blinded (frozen a moment). Then the whole lattice flares white and fades.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 7);
      if (!foes.length) return false;
      p.lock(360);
      p.setVelocityX(0);
      // A tour through the enemies, nearest next each time, then any crystals. Each enemy's mirror follows it until
      // the laser gets there, so a moving enemy (a bat) cannot slip out of its own reflection.
      const order: Phaser.GameObjects.Sprite[] = [];
      let from = { x: p.x, y: p.y - 6 };
      const left = [...foes];
      while (left.length) {
        left.sort(
          (a, b) => Phaser.Math.Distance.Between(from.x, from.y, a.x, a.y) - Phaser.Math.Distance.Between(from.x, from.y, b.x, b.y),
        );
        const t = left.shift()!;
        order.push(t);
        from = t;
      }
      const crystals = ((p.getData('passive') as { crystals?: { x: number; y: number }[] } | undefined)?.crystals ?? []).splice(0);
      const nodes: { t?: Phaser.GameObjects.Sprite; x: number; y: number }[] = [
        ...order.map((t) => ({ t, x: t.x, y: t.y - 4 })),
        ...crystals.map((c) => ({ x: c.x, y: c.y })),
      ];
      // The mirrors appear first.
      const mirrors = nodes.map((n, i) => {
        const g = scene.add.graphics();
        hexMirror(g, 6, SPECTRUM[i % SPECTRUM.length]);
        const m = scene.add
          .container(n.x, n.y, [g])
          .setDepth(13)
          .setScale(0)
          .setRotation(i * 0.4);
        scene.tweens.add({ targets: m, scale: 1, delay: i * 30, duration: 140, ease: 'Back.Out' });
        return m;
      });
      const track = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () =>
          nodes.forEach((n, i) => {
            if (!n.t?.active) return;
            [n.x, n.y] = [n.t.x, n.t.y - 4];
            mirrors[i].setPosition(n.x, n.y);
          }),
      });
      glint(scene, p.x + p.facing * 6, p.y - 6);
      const web = scene.add.graphics().setDepth(12);
      const segs: { x0: number; y0: number; x1: number; y1: number; c: number }[] = [];
      let prev = { x: p.x + p.facing * 6, y: p.y - 6 };
      const struck = new Map<Phaser.GameObjects.GameObject, number>();
      nodes.forEach((n, i) =>
        later(scene, 280 + i * 75, () => {
          // The laser reaches this mirror: it stops following its enemy here.
          const at = { x: n.x, y: n.y };
          n.t = undefined;
          const c = SPECTRUM[i % SPECTRUM.length];
          segs.push({ x0: prev.x, y0: prev.y, x1: at.x, y1: at.y, c });
          web.clear();
          for (const sg of segs) {
            web.lineStyle(6, sg.c, 0.3).lineBetween(sg.x0, sg.y0, sg.x1, sg.y1);
            web.lineStyle(3, sg.c).lineBetween(sg.x0, sg.y0, sg.x1, sg.y1);
            web.lineStyle(1, 0xfff1e8).lineBetween(sg.x0, sg.y0, sg.x1, sg.y1);
          }
          glint(scene, at.x, at.y);
          sparks(scene, at.x, at.y, [c, 0xfff1e8], 5, 10);
          scene.cameras.main.shake(50, 0.005);
          const a = Phaser.Math.Angle.Between(prev.x, prev.y, at.x, at.y);
          const len = Phaser.Math.Distance.Between(prev.x, prev.y, at.x, at.y);
          // At most two strikes per enemy, however many segments (crystal mirrors add more) cross it.
          for (const t of world.targets(at.x, at.y)) {
            if (!onLine(prev.x, prev.y, a, len + 6, t, 12) || (struck.get(t) ?? 0) >= 2) continue;
            struck.set(t, (struck.get(t) ?? 0) + 1);
            world.strike(t, 0.9 * power, 'skill', false, { freeze: 350 }, 60);
          }
          prev = at;
        }),
      );
      later(scene, 280 + nodes.length * 75 + 120, () => {
        track.remove();
        // The lattice flares white, then fades with its mirrors.
        for (const s of segs) web.lineStyle(2, 0xffffff).lineBetween(s.x0, s.y0, s.x1, s.y1);
        scene.tweens.add({
          targets: [web, ...mirrors],
          alpha: 0,
          duration: 350,
          onComplete: () => [web, ...mirrors].forEach((o) => o.destroy()),
        });
      });
    },
    // Tirai Aurora (Aurora Curtain): she raises both hands and the night sky answers. Three curtains of aurora (green,
    // cyan and violet), rippling bands of light with bright vertical streaks, unroll from the top of the sky and drift
    // down through the whole height of the arena, one after another; whatever they pass through is struck and held
    // spellbound (slowed). When the last has reached the floor, their light gathers on every enemy and bursts.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.lock(1500);
      p.invuln(1800);
      p.setVelocity(0, 0);
      const night = scene.add.rectangle(0, 0, W, H, 0x05102a, 0.55).setOrigin(0).setDepth(8).setAlpha(0);
      scene.tweens.add({ targets: night, alpha: 1, duration: 300 });
      glint(scene, p.x - 4, p.y - 10);
      glint(scene, p.x + 4, p.y - 10);
      const AURORA = [
        { body: 0x00e436, lit: 0xb4f080 },
        { body: 0x29adff, lit: 0xc2f0ff },
        { body: 0x8a3fd1, lit: 0xc080ff },
      ];
      const DROP = 1000;
      const g = scene.add.graphics().setDepth(12);
      const base = AURORA.map(() => ({ y: -40 }));
      const hit = AURORA.map(() => new Set<Phaser.GameObjects.GameObject>());
      const top = (i: number, x: number, t: number) => base[i].y + Math.sin(x * 0.035 + t / 260 + i * 2) * 10;
      const tall = (i: number, x: number, t: number) => 22 + Math.sin(x * 0.05 - t / 300 + i) * 8;
      const draw = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          const t = scene.time.now;
          g.clear();
          AURORA.forEach((c, i) => {
            if (base[i].y < -35) return;
            for (let x = 0; x < W; x += 3) {
              const y0 = top(i, x, t);
              const h = tall(i, x, t);
              g.fillStyle(c.body, 0.18).fillRect(x, y0, 3, h);
              g.fillStyle(c.body, 0.35).fillRect(x, y0 + h * 0.15, 3, h * 0.5);
              if ((x / 3 + Math.floor(t / 90)) % 4 === 0) g.fillStyle(c.lit, 0.55).fillRect(x, y0, 1, h * 0.8);
            }
            // The bright lower hem of the curtain.
            for (let x = 0; x < W; x += 3) g.fillStyle(c.lit, 0.5).fillRect(x, top(i, x, t) + tall(i, x, t) - 2, 3, 1);
          });
          // Whatever a curtain passes through is struck once by it.
          for (const e of world.targets(p.x, p.y))
            AURORA.forEach((_, i) => {
              if (hit[i].has(e) || base[i].y < -35) return;
              const y0 = top(i, e.x, t);
              if (e.y < y0 || e.y > y0 + tall(i, e.x, t)) return;
              hit[i].add(e);
              sparks(scene, e.x, e.y, [AURORA[i].body, AURORA[i].lit, 0xfff1e8], 6, 12);
              world.strike(e, 0.6 * power, 'skill', false, { slow: 1400 }, 0);
            });
        },
      });
      AURORA.forEach((_, i) =>
        scene.tweens.add({
          targets: base[i],
          y: { from: -34, to: FLOOR_Y + 4 },
          delay: 200 + i * 220,
          duration: DROP,
          ease: 'Sine.InOut',
        }),
      );
      later(scene, 200 + 2 * 220 + DROP + 60, () => {
        draw.remove();
        scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
        scene.cameras.main.shake(260, 0.016);
        world.targets(p.x, p.y).forEach((t, i) => {
          const c = AURORA[i % 3];
          ring(scene, t.x, t.y, c.body, 2, 22, 280, 2);
          ring(scene, t.x, t.y, c.lit, 2, 14, 220, 1);
          glint(scene, t.x, t.y);
          world.strike(t, 0.6 * power, 'skill', true);
        });
        scene.tweens.add({ targets: night, alpha: 0, delay: 200, duration: 400, onComplete: () => night.destroy() });
      });
    },
    // Fajar Semesta (Dawn of the Universe): Lumina draws every light in the world into herself. The arena goes black;
    // streams of light pour from every corner into her and she rises, the only thing shining. A great lens of light
    // forms in the sky above, and the sun's light falls through it into a white-hot focal point that she drags onto
    // each enemy in turn, a narrowing cone of light setting each one ablaze. Then the lens cracks and gives way to the
    // dawn: the horizon blazes gold, rays of light fan up across the sky and everything is struck at once ("FAJAR!").
    ult: ({ p, world, scene, power }) => {
      const foes = world
        .targets(p.x, p.y)
        .sort((a, b) => a.x - b.x)
        .slice(0, 10);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const STEP = 170;
      const DAWN = 1000 + foes.length * STEP + 200;
      p.invuln(DAWN + 900);
      p.lock(DAWN + 600);
      p.setVelocity(0, 0);
      const home = { x: p.x, y: p.y };
      // Every light drains into her.
      const black = scene.add.rectangle(0, 0, W, H, 0x000000, 0.9).setOrigin(0).setDepth(8).setAlpha(0);
      scene.tweens.add({ targets: black, alpha: 1, duration: 450 });
      const hover = { y: Math.min(home.y, FLOOR_Y - 8) };
      const hold = scene.time.addEvent({ delay: 16, loop: true, callback: () => p.body.reset(home.x, hover.y) });
      scene.tweens.add({ targets: hover, y: 96, duration: 700, ease: 'Sine.Out' });
      for (let i = 0; i < 36; i++)
        later(scene, 80 + i * 20, () => {
          const [sx, sy] = i % 2 ? [Phaser.Math.Between(0, W), i % 4 ? 0 : FLOOR_Y] : [i % 4 ? 0 : W, Phaser.Math.Between(0, FLOOR_Y)];
          const m = scene.add.rectangle(sx, sy, 2, 2, SPECTRUM[i % SPECTRUM.length]).setDepth(12);
          scene.tweens.add({ targets: m, x: home.x, y: hover.y, duration: 380, ease: 'Quad.In', onComplete: () => m.destroy() });
        });
      const aura = scene.add.circle(home.x, hover.y, 10, 0xfff1e8, 0.35).setDepth(9.5);
      scene.tweens.add({ targets: aura, radius: 18, yoyo: true, repeat: -1, duration: 240 });
      const follow = scene.time.addEvent({ delay: 16, loop: true, callback: () => aura.setPosition(p.x, p.y) });
      // The lens: a wide disc of light glass with a gold rim and a bright highlight, the sun burning behind it.
      const lx = W / 2;
      const ly = 30;
      const lg = scene.add.graphics();
      lg.fillStyle(0xffec27, 0.25).fillCircle(0, -14, 26);
      lg.fillStyle(0xfff1e8, 0.5).fillCircle(0, -14, 14);
      lg.fillStyle(0xc2f0ff, 0.35).fillEllipse(0, 0, 90, 18);
      lg.lineStyle(2, 0xd4a017).strokeEllipse(0, 0, 90, 18);
      lg.lineStyle(1, 0xfff1e8, 0.9)
        .beginPath()
        .arc(-10, -2, 30, Math.PI * 1.1, Math.PI * 1.6)
        .strokePath();
      const lens = scene.add.container(lx, ly, [lg]).setDepth(9).setScale(0, 1);
      later(scene, 820, () => {
        cam.flash(160, 255, 241, 232);
        scene.tweens.add({ targets: lens, scaleX: 1, duration: 260, ease: 'Back.Out' });
      });
      // The focal point dragged from enemy to enemy: a cone from the lens' rim narrowing to a white star.
      const cone = scene.add.graphics().setDepth(12);
      const focus = { x: lx, y: ly + 40 };
      const shine = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          cone.clear();
          if (lens.scaleX < 0.9) return;
          cone.fillStyle(0xffec27, 0.18).fillTriangle(lx - 44, ly + 4, lx + 44, ly + 4, focus.x, focus.y);
          cone.fillStyle(0xfff1e8, 0.35).fillTriangle(lx - 20, ly + 6, lx + 20, ly + 6, focus.x, focus.y);
          cone.fillStyle(0xffffff).fillCircle(focus.x, focus.y, 3);
          cone
            .lineStyle(1, 0xffffff)
            .lineBetween(focus.x - 7, focus.y, focus.x + 7, focus.y)
            .lineBetween(focus.x, focus.y - 7, focus.x, focus.y + 7);
        },
      });
      foes.forEach((t, i) =>
        later(scene, 1000 + i * STEP, () => {
          if (!t.active) return;
          scene.tweens.add({ targets: focus, x: t.x, y: t.y, duration: 90, ease: 'Quad.Out' });
          later(scene, 90, () => {
            if (!t.active) return;
            cam.shake(80, 0.01);
            ring(scene, t.x, t.y, 0xffec27, 3, 18, 220, 2);
            flameTongue(scene, t.x, t.y + 6, 14, 380, [0xffa300, 0xffec27, 0xfff1e8]);
            world.strike(t, 1.1 * power, 'ult', false, { burn: 0.3 }, 0);
          });
        }),
      );
      // The dawn.
      later(scene, DAWN, () => {
        shine.remove();
        cone.destroy();
        follow.remove();
        aura.destroy();
        // The lens cracks and its shards fall.
        for (let i = 0; i < 14; i++) {
          const s = scene.add
            .triangle(lx + Phaser.Math.Between(-44, 44), ly + Phaser.Math.Between(-6, 6), 0, 0, 6, 1, 2, 7, i % 2 ? 0xc2f0ff : 0xfff1e8)
            .setDepth(12);
          scene.tweens.add({ targets: s, y: s.y + 90, angle: 300, alpha: 0, duration: 700, onComplete: () => s.destroy() });
        }
        lens.destroy();
        // The horizon blazes: bands of gold to white rising from the floor, and god-rays fanning up across the sky.
        const dawn = scene.add.graphics().setDepth(8.5);
        const bands = [0x7a2230, 0xab5236, 0xffa300, 0xffec27, 0xfff1e8];
        bands.forEach((c, i) => dawn.fillStyle(c, 0.5).fillRect(0, FLOOR_Y - 60 + i * 12, W, 70 - i * 12));
        for (let k = 0; k < 14; k++) {
          const a = Math.PI + (k / 13) * Math.PI;
          dawn
            .fillStyle(k % 2 ? 0xffec27 : 0xfff1e8, 0.22)
            .fillTriangle(W / 2 - 4, FLOOR_Y, W / 2 + 4, FLOOR_Y, W / 2 + Math.cos(a - 0.04) * 400, FLOOR_Y + Math.sin(a - 0.04) * 400);
        }
        dawn.setAlpha(0);
        scene.tweens.add({ targets: dawn, alpha: 1, duration: 160 });
        scene.tweens.add({ targets: black, alpha: 0, duration: 260 });
        cam.flash(280, 255, 236, 39);
        cam.shake(600, 0.03);
        floatText(scene, W / 2, 44, 'FAJAR!', '#ffec27');
        for (const t of world.targets(p.x, p.y)) {
          sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8, 0xffa300], 12, 22);
          glint(scene, t.x, t.y);
          world.strike(t, 2.5 * power, 'ult', true);
        }
        later(scene, 600, () => {
          hold.remove();
          scene.tweens.add({ targets: dawn, alpha: 0, duration: 500, onComplete: () => dawn.destroy() });
          black.destroy();
        });
      });
    },
  },
  gravitasi: {
    // Jatuh Bintang: the impact bends space: a dark well opens, debris lifts off the floor and everything near is drawn in.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const well = scene.add.circle(x, gy - 6, 26, 0x241a3d, 0.6).setDepth(4);
      scene.tweens.add({ targets: well, radius: 4, alpha: 0, duration: 500, onComplete: () => well.destroy() });
      for (let i = 0; i < 8; i++) {
        const d = scene.add.rectangle(x + Phaser.Math.Between(-30, 30), gy - 2, 2, 2, i % 2 ? 0x5f574f : 0x8a3fd1).setDepth(12);
        scene.tweens.add({
          targets: d,
          y: gy - Phaser.Math.Between(16, 34),
          x: x + (d.x - x) * 0.3,
          alpha: 0,
          duration: 500,
          onComplete: () => d.destroy(),
        });
      }
      world.pull(x, gy - 6, 64, 140);
      world.area(x, gy - 6, 40, 0.5 * power, 0, 'proc', { slow: 1200 });
    },
    // Gravity Order: he raises the scepter and turns up the gravity of the whole world. The air over the entire arena
    // goes violet and heavy, pressure rains down in streaks from one wall to the other, and every enemy on the map
    // (flyers are dragged out of the sky) is pinned under a column of force. The order climbs, x10, x100, x1000, each
    // step crushing harder: the floor sags and cracks under them, they are flattened into it, until at the last
    // step they are crushed outright. REMUK!
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      p.lock(600);
      p.setVelocityX(0);
      const STEPS = [
        { at: 200, mult: 0.3, label: 'x10' },
        { at: 520, mult: 0.4, label: 'x100' },
        { at: 840, mult: 0.5, label: 'x1000' },
      ];
      const END = 1200;
      // The whole sky turns heavy.
      const heavy = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x241a3d, 0)
        .setOrigin(0)
        .setDepth(7);
      scene.tweens.add({ targets: heavy, fillAlpha: 0.45, duration: 200 });
      ring(scene, p.x, p.y, 0xc080ff, 6, W, 500, 2);
      // Pressure raining from wall to wall, harder at every step.
      const rain = scene.time.addEvent({
        delay: 20,
        loop: true,
        callback: () => {
          for (let i = 0; i < 2; i++) {
            const s = scene.add
              .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, 40), 1, 10, Math.random() < 0.3 ? 0xfff1e8 : 0x8a3fd1)
              .setDepth(12);
            scene.tweens.add({
              targets: s,
              y: FLOOR_Y,
              scaleY: 2.5,
              alpha: 0,
              duration: 200,
              ease: 'Quad.In',
              onComplete: () => s.destroy(),
            });
          }
        },
      });
      // A column of force on every enemy on the map; flyers are hurled down to the floor.
      world.slam(W / 2, FLOOR_Y / 2, 9999, 560);
      const cols = foes.map((t) => {
        const col = scene.add.rectangle(t.x, 0, 14, t.y, 0x8a3fd1, 0.3).setOrigin(0.5, 0).setDepth(11);
        const core = scene.add.rectangle(t.x, 0, 2, t.y, 0xfff1e8, 0.8).setOrigin(0.5, 0).setDepth(11);
        col.setScale(1, 0);
        core.setScale(1, 0);
        scene.tweens.add({ targets: [col, core], scaleY: 1, duration: 120, ease: 'Quad.In' });
        const follow = scene.time.addEvent({
          delay: 16,
          loop: true,
          callback: () => {
            if (!t.active) return;
            col.setPosition(t.x, 0).setSize(14, t.y);
            core.setPosition(t.x, 0).setSize(2, t.y);
          },
        });
        return { col, core, follow };
      });
      STEPS.forEach((st, k) =>
        later(scene, st.at, () => {
          floatText(scene, W / 2, 44 + k * 2, `GRAVITASI ${st.label}`, '#c080ff');
          cam.shake(160, 0.006 + k * 0.005);
          for (const c of cols) c.col.setFillStyle(0x8a3fd1, 0.3 + k * 0.15);
          for (const t of world.targets(p.x, p.y)) {
            // The floor sags under each of them: a dark dent that widens with the order.
            const dent = scene.add.ellipse(t.x, FLOOR_Y + 1, 10 + k * 8, 3 + k, 0x1d0f2e, 0.9).setDepth(5);
            scene.tweens.add({ targets: dent, alpha: 0, delay: 300, duration: 300, onComplete: () => dent.destroy() });
            ring(scene, t.x, t.y, 0xc080ff, 18 - k * 3, 2, 160);
            world.strike(t, st.mult * power, 'skill', false, { slow: 2500 }, 0);
          }
        }),
      );
      // REMUK: the last step crushes them into the floor.
      later(scene, END, () => {
        rain.remove();
        cols.forEach((c) => (c.follow.remove(), c.col.destroy(), c.core.destroy()));
        cam.flash(140, 138, 63, 209);
        cam.shake(380, 0.03);
        floatText(scene, W / 2, 60, 'REMUK!', '#fff1e8');
        for (const t of world.targets(p.x, p.y)) {
          rocks(scene, t.x, FLOOR_Y - 2, 6);
          const crack = scene.add.graphics().setDepth(5);
          for (const [w, c] of [
            [3, 0x1d0f2e],
            [1, 0xc080ff],
          ] as const) {
            crack
              .lineStyle(w, c)
              .beginPath()
              .moveTo(t.x - 16, FLOOR_Y);
            for (let i = 1; i <= 6; i++) crack.lineTo(t.x - 16 + i * 5.3, FLOOR_Y + (i % 2 ? 2 : 0));
            crack.strokePath();
          }
          scene.tweens.add({ targets: crack, alpha: 0, delay: 500, duration: 400, onComplete: () => crack.destroy() });
          sparks(scene, t.x, t.y, [0x8a3fd1, 0xc080ff, 0xfff1e8], 8, 14);
          world.strike(t, 1.4 * power, 'skill', true, { slow: 2500 }, 0);
        }
        scene.tweens.add({ targets: heavy, fillAlpha: 0, duration: 400, onComplete: () => heavy.destroy() });
      });
    },
    // Planetary Orbit: he lifts the scepter and the floor tears up around him; six chunks of ground rise, are crushed
    // by his gravity into six small worlds (a grey moon, a ringed violet planet, a molten one, an ice world, a jade
    // one and a striped gas giant) and fall into orbit around him. Their orbits are tilted against each other and widen with every turn, the centre of the
    // system drifting to the middle of the arena, until the three planets are sweeping the whole field from the floor
    // to the sky, striking whatever they pass (gravity bends their paths toward anything that strays near an orbit).
    // Then he closes his hand: the orbits stop, all six planets line up (syzygy)
    // pointing at the heaviest knot of enemies and crash into it one after another, the gas giant last.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      const ORBIT = 1900;
      p.invuln(ORBIT + 600);
      p.lock(ORBIT + 300);
      p.setVelocity(0, 0);
      const ox = p.x;
      const oy = p.y - 8;
      const MX = W / 2;
      const MY = FLOOR_Y - 68;
      // The three worlds: dark outline, body, a lit limb and one feature each.
      const looks = [
        { rim: 0x3b3b4f, body: 0x83769c, lit: 0xc2c3c7, mark: 0x5f574f },
        { rim: 0x2b2f6b, body: 0x8a3fd1, lit: 0xc080ff, mark: 0xffec27 },
        { rim: 0x7a2230, body: 0xff004d, lit: 0xffa300, mark: 0xffec27 },
        { rim: 0x1d2b53, body: 0x29adff, lit: 0xc2f0ff, mark: 0xfff1e8 },
        { rim: 0x003b1f, body: 0x008751, lit: 0x00e436, mark: 0x003b1f },
        { rim: 0x4a2a1a, body: 0xd08a50, lit: 0xffccaa, mark: 0xab5236 },
      ];
      const N = looks.length;
      const planets = looks.map((c, i) => {
        const pg = scene.add.graphics();
        pg.fillStyle(c.rim).fillCircle(0, 0, 7);
        pg.fillStyle(c.body).fillCircle(0, 0, 6);
        pg.fillStyle(c.lit).fillCircle(-2, -2, 3);
        if (i === 0) pg.fillStyle(c.mark).fillCircle(2, 2, 1.5).fillCircle(-2, 3, 1);
        if (i === 1) pg.lineStyle(1, c.mark).strokeEllipse(0, 0, 22, 5);
        if (i === 2) pg.fillStyle(c.mark).fillRect(-3, 1, 5, 1).fillRect(0, -4, 3, 1);
        // Ice caps; jade craters; the gas giant's bands.
        if (i === 3) pg.fillStyle(c.mark).fillRect(-3, -6, 6, 2).fillRect(-3, 4, 6, 2);
        if (i === 4) pg.fillStyle(c.mark).fillCircle(2, 1, 1.5).fillCircle(-1, 3, 1).fillCircle(3, -2, 1);
        if (i === 5) pg.fillStyle(c.mark).fillRect(-6, -2, 12, 1).fillRect(-5, 1, 10, 1).fillRect(-4, 4, 8, 1);
        const sx = ox + (i - (N - 1) / 2) * 16;
        const size = i === 5 ? 2.4 : 1.6;
        const body = scene.add
          .container(sx, FLOOR_Y - 4, [pg])
          .setScale(size)
          .setDepth(13);
        rocks(scene, sx, FLOOR_Y - 2, 5);
        return {
          body,
          i,
          color: c.body,
          size,
          phase: (i * Math.PI * 2) / N,
          tilt: (i - (N - 1) / 2) * 0.12,
          dx: 0,
          dy: 0,
          last: new Map<Phaser.GameObjects.GameObject, number>(),
        };
      });
      cam.shake(200, 0.01);
      ring(scene, ox, oy, 0xc080ff, 6, 40, 300, 2);
      // The orbit lines, drawn faintly, and the bright trail each planet leaves.
      const paths = scene.add.graphics().setDepth(8);
      const at = (pl: (typeof planets)[number], t: number) => {
        const grow = Math.min(1, t / 0.75);
        const cx = Phaser.Math.Linear(ox, MX, grow);
        const cy = Phaser.Math.Linear(oy, MY, grow);
        const rx = 18 + grow * 136;
        const ry = 10 + grow * (44 + pl.i * 4);
        const a = pl.phase + t * Math.PI * 4.2;
        const [ex, ey] = [Math.cos(a) * rx, Math.sin(a) * ry];
        return {
          x: cx + ex * Math.cos(pl.tilt) - ey * Math.sin(pl.tilt),
          y: cy + ex * Math.sin(pl.tilt) + ey * Math.cos(pl.tilt),
          cx,
          cy,
          rx,
          ry,
        };
      };
      // They rise out of the floor to the start of their orbits.
      for (const pl of planets) {
        const o = at(pl, 0);
        scene.tweens.add({ targets: pl.body, x: o.x, y: o.y, duration: 240, ease: 'Quad.Out' });
      }
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ORBIT,
        delay: 250,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const now = scene.time.now;
          paths.clear();
          for (const pl of planets) {
            const o = at(pl, t);
            paths.lineStyle(1, pl.color, 0.3);
            const pts = Array.from({ length: 33 }, (_, k) => {
              const a = (k / 32) * Math.PI * 2;
              const [ex, ey] = [Math.cos(a) * o.rx, Math.sin(a) * o.ry];
              return new Phaser.Math.Vector2(
                o.cx + ex * Math.cos(pl.tilt) - ey * Math.sin(pl.tilt),
                o.cy + ex * Math.sin(pl.tilt) + ey * Math.cos(pl.tilt),
              );
            });
            paths.strokePoints(pts);
            // Gravity bends each planet's path toward any enemy that strays near its orbit (a slingshot pass).
            const prey = world.targets(o.x, o.y)[0];
            const bend = prey && Phaser.Math.Distance.Between(o.x, o.y, prey.x, prey.y) < 44;
            pl.dx = Phaser.Math.Linear(pl.dx, bend ? prey.x - o.x : 0, 0.25);
            pl.dy = Phaser.Math.Linear(pl.dy, bend ? prey.y - o.y : 0, 0.25);
            const [qx, qy] = [o.x + pl.dx, o.y + pl.dy];
            pl.body.setPosition(qx, qy).setScale(Phaser.Math.Linear(pl.body.scaleX, pl.size * 0.62, 0.1));
            const d = scene.add.rectangle(qx, qy, 2, 2, pl.color).setDepth(12);
            scene.tweens.add({ targets: d, alpha: 0, scale: 0.3, duration: 260, onComplete: () => d.destroy() });
            for (const e of world.targets(qx, qy)) {
              if (Phaser.Math.Distance.Between(qx, qy, e.x, e.y) > 14) break;
              if (now - (pl.last.get(e) ?? -1e9) < 400) continue;
              pl.last.set(e, now);
              sparks(scene, e.x, e.y, [pl.color, 0xfff1e8], 6, 14);
              ring(scene, e.x, e.y, 0xc080ff, 4, 14, 160);
              world.strike(e, 0.7 * power, 'skill', false, { slow: 900 });
              cam.shake(40, 0.004);
            }
          }
        },
        onComplete: () => {
          paths.destroy();
          // Syzygy: aimed now, at the enemy with the most others around it.
          const ts = world.targets(MX, MY);
          const near = (e: Phaser.GameObjects.Sprite) => ts.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < 36).length;
          const mark = ts.length ? ts.reduce((b, e) => (near(e) > near(b) ? e : b)) : undefined;
          const [tx, ty] = mark ? [mark.x, mark.y] : [MX, FLOOR_Y - 10];
          const a = Phaser.Math.Angle.Between(MX, 40, tx, ty);
          const line = scene.add.rectangle(MX, 40, 400, 1, 0xc080ff, 0.6).setOrigin(0, 0.5).setRotation(a).setDepth(12);
          scene.tweens.add({ targets: line, alpha: 0, delay: 250, duration: 200, onComplete: () => line.destroy() });
          planets.forEach((pl, i) => {
            // Line up behind each other on the way in, then fall on the mark one by one.
            const lx = tx - Math.cos(a) * (50 + i * 14);
            const ly = ty - Math.sin(a) * (50 + i * 14);
            scene.tweens.add({ targets: pl.body, x: lx, y: ly, duration: 180, ease: 'Sine.Out' });
            later(scene, 260 + i * 80, () => {
              const [hx, hy] = mark?.active ? [mark.x, mark.y] : [tx, ty];
              scene.tweens.add({
                targets: pl.body,
                x: hx,
                y: hy,
                scale: pl.size,
                duration: 110,
                ease: 'Quad.In',
                onComplete: () => {
                  pl.body.destroy();
                  const last = i === N - 1;
                  ring(scene, hx, hy, pl.color, 4, last ? 50 : 28, 300, last ? 3 : 2);
                  sparks(scene, hx, hy, [pl.color, 0xfff1e8, 0xc080ff], last ? 22 : 10, last ? 44 : 24);
                  if (hy > FLOOR_Y - 30) rocks(scene, hx, FLOOR_Y - 2, 5);
                  world.area(hx, hy, last ? 40 : 26, (last ? 1.6 : 0.8) * power, last ? 240 : 80, 'skill', { slow: 1500 });
                  if (mark?.active) world.strike(mark, 0.8 * power, 'skill', true);
                  if (!last) return void cam.shake(100, 0.01);
                  cam.flash(160, 192, 128, 255);
                  cam.shake(320, 0.028);
                  floatText(scene, Phaser.Math.Clamp(hx, 40, W - 40), Math.max(36, hy - 26), 'SEJAJAR!', '#c080ff');
                  // The alignment's tide: a gravity wave rolls out over the whole arena and crushes, where it arrives,
                  // every enemy the planets did not land on.
                  ring(scene, hx, hy, 0xc080ff, 44, W, 560, 1);
                  ring(scene, hx, hy, 0x8a3fd1, 40, W * 0.8, 520, 2);
                  for (const t of world.targets(hx, hy)) {
                    const d = Phaser.Math.Distance.Between(hx, hy, t.x, t.y);
                    if (d <= 40) continue;
                    later(scene, d * 1.7, () => {
                      if (!t.active) return;
                      ring(scene, t.x, t.y, 0xc080ff, 14, 2, 220, 2);
                      sparks(scene, t.x, t.y, [0x8a3fd1, 0xc080ff, 0xfff1e8], 6, 12);
                      world.strike(t, 0.9 * power, 'skill', false, { slow: 1200 });
                    });
                  }
                },
              });
            });
          });
        },
      });
    },
    // Black Hole: the world goes dark and every star in the sky starts to smear toward one point in front of him,
    // where light itself is swallowed: a singularity opens, the camera is drawn in toward it. Its accretion disk
    // blazes, jets of plasma shoot out of its poles, light bends in rings around it, and the arena comes apart: chunks
    // of the floor tear loose and spiral in, every enemy on the map is dragged toward the horizon, stretched into
    // streaks (spaghettified) and ground by the tides. Then it collapses to a single point and the world goes black
    // for a heartbeat, until it bursts back out as a white hole: a blinding sphere that fills the screen, and waves of
    // gravity rolling across the whole arena one after another. SINGULARITAS!
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const bx = Phaser.Math.Clamp(p.x + p.facing * 80, 60, W - 60);
      const by = FLOOR_Y - 56;
      const LIFE = 2700;
      const cam = scene.cameras.main;
      p.invuln(LIFE + 1400);
      p.lock(LIFE + 700);
      p.setVelocity(0, 0);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x05030a, 0.85)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 500 });
      cam.zoomTo(1.05, LIFE);
      // The stars smear toward the point.
      for (let i = 0; i < 40; i++) {
        const sx = Phaser.Math.Between(0, W);
        const sy = Phaser.Math.Between(0, FLOOR_Y - 20);
        const star = scene.add.rectangle(sx, sy, 1, 1, i % 4 ? 0xfff1e8 : 0xc080ff).setDepth(9);
        const a = Phaser.Math.Angle.Between(sx, sy, bx, by);
        scene.tweens.add({ targets: star, scaleX: 8, rotation: a, delay: 200 + i * 10, duration: 500 });
        scene.tweens.add({
          targets: star,
          x: bx,
          y: by,
          alpha: 0,
          delay: 700 + i * 30,
          duration: 700,
          ease: 'Quad.In',
          onComplete: () => star.destroy(),
        });
      }
      // His aura answering it.
      const aura = scene.add.circle(p.x, p.y, 12, 0x8a3fd1, 0.25).setStrokeStyle(1, 0xc080ff).setDepth(9);
      scene.tweens.add({ targets: aura, scale: 1.4, alpha: 0.5, duration: 280, yoyo: true, repeat: -1 });
      // The singularity: glow, horizon, photon ring.
      const glow = scene.add.circle(bx, by, 1, 0x8a3fd1, 0.35).setDepth(12);
      const hole = scene.add.circle(bx, by, 1, 0x000000).setStrokeStyle(2, 0xfff1e8).setDepth(14);
      scene.tweens.add({ targets: glow, radius: 46, delay: 400, duration: 700, ease: 'Back.Out' });
      scene.tweens.add({ targets: hole, radius: 22, delay: 400, duration: 700, ease: 'Back.Out' });
      // Accretion disk (its back half behind the horizon) and the polar jets.
      const disk = scene.add.graphics().setDepth(15);
      const behind = scene.add.graphics().setDepth(11);
      const jets = scene.add.graphics().setDepth(13);
      const spin = scene.tweens.addCounter({
        from: 0,
        to: 1,
        delay: 400,
        duration: LIFE - 400,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const grow = Math.min(1, t * 3);
          disk.clear();
          behind.clear();
          for (let i = 0; i < 72; i++) {
            const a = (i / 72) * Math.PI * 2 + t * 50;
            const r = (36 + (i % 4) * 6) * grow;
            const g = Math.sin(a) > 0 ? disk : behind;
            g.fillStyle([0xffa300, 0xffec27, 0xc080ff, 0xfff1e8, 0xff004d][i % 5], 0.95).fillRect(
              bx + Math.cos(a) * r,
              by + Math.sin(a) * r * 0.24,
              2,
              1,
            );
          }
          jets.clear();
          if (t > 0.15) {
            const len = 90 * Math.min(1, (t - 0.15) * 4);
            const w = 3 + Math.sin(t * 90) * 1.5;
            for (const dir of [-1, 1]) {
              jets.fillStyle(0xc080ff, 0.35).fillRect(bx - w * 1.6, dir < 0 ? by - len : by, w * 3.2, len);
              jets.fillStyle(0xfff1e8, 0.9).fillRect(bx - w / 2, dir < 0 ? by - len : by, w, len);
            }
          }
        },
      });
      // Light bending in rings around it.
      for (let k = 0; k < 10; k++) later(scene, 500 + k * 220, () => ring(scene, bx, by, k % 2 ? 0xc080ff : 0xffa300, 180, 22, 520, 2));
      // The arena comes apart: chunks of floor tear loose all along it and spiral in.
      for (let i = 0; i < 36; i++)
        later(scene, 600 + i * 50, () => {
          const x0 = Phaser.Math.Between(0, W);
          rocks(scene, x0, FLOOR_Y - 2, 1);
          const chunk = scene.add.rectangle(x0, FLOOR_Y - 2, 3, 3, i % 2 ? 0xab5236 : 0x5f574f).setDepth(12);
          const a0 = Phaser.Math.Angle.Between(bx, by, x0, FLOOR_Y);
          const r0 = Phaser.Math.Distance.Between(bx, by, x0, FLOOR_Y);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 900,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const t = tw.getValue() ?? 0;
              const a = a0 + t * 4;
              chunk.setPosition(bx + Math.cos(a) * r0 * (1 - t), by + Math.sin(a) * r0 * (1 - t) * 0.7).setAngle(t * 720);
            },
            onComplete: () => chunk.destroy(),
          });
        });
      // The pull and the tides: everyone on the map (bosses too massive to move, but not to tear) is dragged in and
      // stretched toward the horizon; whatever reaches it is ground hardest.
      const streaks = scene.add.graphics().setDepth(10);
      for (let k = 0; k < 22; k++)
        later(scene, 700 + k * 90, () => {
          world.pull(bx, by, 9999, 320);
          streaks.clear();
          for (const t of world.targets(bx, by)) {
            streaks.lineStyle(1, 0xc080ff, 0.5).lineBetween(t.x, t.y, Phaser.Math.Linear(t.x, bx, 0.6), Phaser.Math.Linear(t.y, by, 0.6));
            if (k % 3) continue;
            const d = Phaser.Math.Distance.Between(t.x, t.y, bx, by);
            world.strike(t, (d < 56 ? 0.55 : 0.25) * power, 'ult', false, { slow: 900 }, 0);
          }
          if (k % 2) cam.shake(90, 0.008);
        });
      // Collapse to a point; a heartbeat of black.
      later(scene, LIFE, () => {
        spin.stop();
        streaks.destroy();
        disk.destroy();
        behind.destroy();
        jets.destroy();
        scene.tweens.add({ targets: [hole, glow], radius: 1, duration: 200, ease: 'Quad.In' });
      });
      const black = scene.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setDepth(95).setAlpha(0);
      const point = scene.add.circle(bx, by, 1.5, 0xfff1e8).setDepth(96).setAlpha(0);
      later(scene, LIFE + 200, () => {
        black.setAlpha(1);
        point.setAlpha(1);
        hole.destroy();
        glow.destroy();
      });
      // The white hole.
      later(scene, LIFE + 480, () => {
        black.destroy();
        point.destroy();
        scene.tweens.killTweensOf(aura);
        aura.destroy();
        cam.flash(350, 255, 241, 232);
        cam.shake(700, 0.04);
        cam.zoomTo(1.12, 120);
        later(scene, 140, () => cam.zoomTo(1, 500));
        floatText(scene, W / 2, 50, 'SINGULARITAS!', '#fff1e8');
        const white = scene.add.circle(bx, by, 4, 0xfff1e8, 0.9).setDepth(16);
        scene.tweens.add({ targets: white, radius: 260, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => white.destroy() });
        sparks(scene, bx, by, [0xfff1e8, 0xc080ff, 0xffa300], 40, 140);
        for (const t of world.targets(bx, by)) world.strike(t, 4 * power, 'ult', true, undefined, 300);
        // Gravity waves rolling across the whole arena, one after another.
        for (let k = 0; k < 3; k++)
          later(scene, 250 + k * 260, () => {
            ring(scene, bx, by, k % 2 ? 0x8a3fd1 : 0xc080ff, 10, 340, 600, 3);
            cam.shake(150, 0.012);
            for (const t of world.targets(bx, by)) world.strike(t, 0.6 * power, 'ult', false, { slow: 1200 }, 120);
          });
        scene.tweens.add({ targets: dark, alpha: 0, delay: 600, duration: 600, onComplete: () => dark.destroy() });
      });
    },
  },
  // Surya, the Solar Knight. His fire is the sun's: gold-white at the core, orange, a red rim, and rays.
  pedangSurya: {
    // The finisher's whirl throws two waves of fire out to either side along the floor.
    onSwing: ({ p, world, scene, power }, _m, step) => {
      if (step !== 2) return;
      ring(scene, p.x, p.y, 0xffec27, 6, 34, 260, 2);
      ring(scene, p.x, p.y, 0xff8a1f, 4, 26, 200, 1);
      sparks(scene, p.x, p.y, [0xffec27, 0xffa300, 0xff004d], 8, 22);
      for (const s of [-1, 1])
        world.shot({
          x: p.x + s * 8,
          y: p.y,
          vx: s * 230,
          vy: 0,
          texture: 'fireball',
          mult: 0.7 * power,
          source: 'skill',
          pierce: true,
          status: { burn: 0.15 },
        });
    },
    // Meteor Surya: he lands as a falling star; a crater of flame opens around him and tongues of fire fan out.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      explosion(scene, x, gy - 6, 26);
      ring(scene, x, gy - 2, 0xffec27, 4, 48, 320, 2);
      rocks(scene, x, gy - 2, 5);
      for (let i = -4; i <= 4; i++)
        later(scene, Math.abs(i) * 40, () => flameTongue(scene, x + i * 10, gy, 15 - Math.abs(i) * 1.5, 500, FIRE));
      world.area(x, gy - 6, 46, 0.9 * power, 160, 'proc', { burn: 0.3 });
    },
    // Surya Terbit (Sunrise): a sun climbs out of the floor ahead of him and into the sky, the arena warming to dawn;
    // from its height it pours a beam of fire onto each of the five nearest enemies, in the air or on the ground, one
    // after another, each burning where it lands.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 5);
      if (!foes.length) return false;
      p.lock(700);
      p.setVelocityX(0);
      const sx = Phaser.Math.Clamp(p.x + p.facing * 24, 26, W - 26);
      glint(scene, p.x + p.facing * 6, p.y - 2);
      const dawn = scene.add.rectangle(0, 0, W, FLOOR_Y, 0xff8a1f, 0.22).setOrigin(0).setDepth(4).setAlpha(0);
      scene.tweens.add({ targets: dawn, alpha: 1, duration: 350, hold: 550, yoyo: true, onComplete: () => dawn.destroy() });
      const sun = sunDisc(scene, sx, FLOOR_Y, 9).setScale(0.3);
      scene.tweens.add({ targets: sun, y: 34, scale: 1, duration: 450, ease: 'Quad.Out' });
      scene.tweens.add({ targets: sun, angle: 120, duration: 1300 });
      ring(scene, sx, FLOOR_Y - 2, 0xffec27, 4, 30, 350, 2);
      for (let i = -2; i <= 2; i++) flameTongue(scene, sx + i * 8, FLOOR_Y, 14, 400, FIRE);
      foes.forEach((t, i) =>
        later(scene, 560 + i * 110, () => {
          if (!t.active) return;
          solarBeam(scene, sun.x, sun.y, t.x, t.y);
          ring(scene, t.x, t.y, 0xffec27, 3, 22, 260, 2);
          explosion(scene, t.x, t.y, 14);
          flameTongue(scene, t.x, t.y + 8, 16, 420, FIRE);
          scene.cameras.main.shake(70, 0.006);
          world.strike(t, 2.2 * power, 'skill', false, { burn: 0.4 }, 120);
        }),
      );
      later(scene, 760 + foes.length * 110, () =>
        scene.tweens.add({ targets: sun, alpha: 0, scale: 0.4, duration: 300, onComplete: () => sun.destroy() }),
      );
    },
    // Gerhana (Eclipse): the arena goes dark and a sun hangs in the sky; a black moon slides across it until only the
    // corona is left, flaring in pulses. At totality a point of white-hot light breaks at the moon's edge, the diamond
    // ring, and the sun's fire pours from it onto every enemy at once.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(1800);
      p.lock(1500);
      p.setVelocity(0, 0);
      const [cx, cy] = [W / 2, 36];
      const dark = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x05000a, 0.8).setOrigin(0).setDepth(4).setAlpha(0);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 600 });
      const sun = sunDisc(scene, cx, cy, 14).setAlpha(0).setScale(0.5);
      scene.tweens.add({ targets: sun, alpha: 1, scale: 1, duration: 400 });
      scene.tweens.add({ targets: sun, angle: 40, duration: 1300 });
      const moon = scene.add
        .circle(cx - 60, cy, 15, 0x05000a)
        .setStrokeStyle(1, 0x3a0010)
        .setDepth(12.5);
      scene.tweens.add({ targets: moon, x: cx, delay: 250, duration: 750, ease: 'Sine.InOut' });
      later(scene, 900, () => {
        for (let k = 0; k < 3; k++) later(scene, k * 120, () => ring(scene, cx, cy, 0xffec27, 16, 46, 300, 2));
        cam.shake(120, 0.006);
      });
      later(scene, 1150, () => {
        cam.flash(220, 255, 236, 39);
        cam.shake(500, 0.03);
        floatText(scene, W / 2, 64, 'GERHANA!', '#ffec27');
        const gem = scene.add.circle(cx + 14, cy - 6, 3, 0xffffff).setDepth(13);
        scene.tweens.add({ targets: gem, scale: 4, alpha: 0, duration: 400, onComplete: () => gem.destroy() });
        ring(scene, cx, cy, 0xfff1e8, 10, 60, 400, 2);
        ring(scene, cx, cy, 0xffa300, 6, 80, 500, 2);
        for (const t of world.targets(p.x, p.y)) {
          solarBeam(scene, cx + 14, cy - 6, t.x, t.y, 380);
          explosion(scene, t.x, t.y, 16);
          sparks(scene, t.x, t.y, [0xffec27, 0xffa300, 0xff004d], 10, 20);
          world.strike(t, 5 * power, 'skill', true, { burn: 0.5 }, 160);
        }
        scene.tweens.add({ targets: dark, alpha: 0, delay: 300, duration: 500, onComplete: () => dark.destroy() });
        scene.tweens.add({
          targets: [sun, moon],
          alpha: 0,
          delay: 300,
          duration: 400,
          onComplete: () => [sun, moon].forEach((o) => o.destroy()),
        });
      });
    },
    // Solaris: the sun itself comes down. The sky burns orange and the floor glows as a vast sun descends over the
    // arena, turning slowly; it lashes out with prominences, one at a time, each arching down to an enemy and
    // burning it. Then it gathers, swells, and drops: the arena goes white, rings and cracks of molten light run out
    // from where it lands, and everything is struck at once.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(3900);
      p.lock(3500);
      p.setVelocity(0, 0);
      glint(scene, p.x, p.y - 2);
      ring(scene, p.x, p.y, 0xffec27, 4, 40, 400, 2);
      const sky = scene.add.rectangle(0, 0, W, FLOOR_Y, 0xff5a1f, 0.5).setOrigin(0).setDepth(4).setAlpha(0);
      const heat = scene.add
        .rectangle(0, FLOOR_Y - 14, W, 14, 0xffa300, 0.35)
        .setOrigin(0)
        .setDepth(4.05)
        .setAlpha(0);
      scene.tweens.add({ targets: [sky, heat], alpha: 1, duration: 700 });
      const sun = sunDisc(scene, W / 2, -30, 26)
        .setScale(0.5)
        .setDepth(5);
      scene.tweens.add({ targets: sun, y: 50, scale: 1, duration: 1000, ease: 'Quad.Out' });
      scene.tweens.add({ targets: sun, angle: 360, duration: 3200 });
      later(scene, 300, () => cam.shake(600, 0.006));
      // Embers lift off the glowing floor the whole time.
      for (let i = 0; i < 50; i++)
        later(scene, 400 + i * 50, () => {
          const e = scene.add.rectangle(Phaser.Math.Between(0, W), FLOOR_Y, 1, 2, FIRE[i % 3]).setDepth(13);
          scene.tweens.add({
            targets: e,
            y: Phaser.Math.Between(30, 110),
            x: e.x + Phaser.Math.Between(-12, 12),
            alpha: 0,
            duration: 800,
            onComplete: () => e.destroy(),
          });
        });
      world
        .targets(p.x, p.y)
        .slice(0, 10)
        .forEach((t, i) =>
          later(scene, 1100 + i * 170, () => {
            if (!t.active) return;
            prominence(scene, sun.x, sun.y, t.x, t.y);
            sparks(scene, t.x, t.y, [0xffec27, 0xffa300, 0xff004d], 10, 18);
            flameTongue(scene, t.x, t.y + 8, 16, 420, FIRE);
            cam.shake(70, 0.007);
            world.strike(t, 2.4 * power, 'ult', false, { burn: 0.5 }, 100);
          }),
        );
      // It gathers and swells, then drops.
      later(scene, 2900, () => {
        glint(scene, p.x, p.y - 2);
        scene.tweens.add({ targets: sun, scale: 1.7, duration: 250 });
      });
      later(scene, 3150, () => scene.tweens.add({ targets: sun, y: FLOOR_Y - 14, scale: 3.2, duration: 330, ease: 'Quad.In' }));
      later(scene, 3480, () => {
        cam.flash(300, 255, 255, 255);
        cam.shake(700, 0.04);
        floatText(scene, W / 2, 48, 'SOLARIS!', '#ffec27');
        const white = scene.add.rectangle(0, 0, W, H, 0xfff1e8).setOrigin(0).setDepth(15);
        scene.tweens.add({ targets: white, alpha: 0, duration: 450, onComplete: () => white.destroy() });
        for (let k = 0; k < 4; k++)
          later(scene, k * 90, () => ring(scene, W / 2, FLOOR_Y - 10, k % 2 ? 0xffa300 : 0xffec27, 10, 150 + k * 40, 500, 3));
        // Cracks of molten light run out along the floor from the impact.
        const cracks = scene.add.graphics().setDepth(12);
        for (const s of [-1, 1]) {
          let [x, y] = [W / 2, FLOOR_Y - 1];
          while (x > -10 && x < W + 10) {
            const [nx, ny] = [x + s * Phaser.Math.Between(10, 20), FLOOR_Y - Phaser.Math.Between(0, 6)];
            cracks.lineStyle(3, 0xff004d, 0.6).lineBetween(x, y, nx, ny);
            cracks.lineStyle(1, 0xffec27).lineBetween(x, y, nx, ny);
            [x, y] = [nx, ny];
          }
        }
        scene.tweens.add({ targets: cracks, alpha: 0, delay: 500, duration: 500, onComplete: () => cracks.destroy() });
        for (let x = 20; x < W; x += 40) later(scene, Math.abs(x - W / 2) * 1.2, () => explosion(scene, x, FLOOR_Y - 6, 22));
        for (const t of world.targets(p.x, p.y)) {
          sparks(scene, t.x, t.y, [0xffec27, 0xffa300, 0xff004d], 14, 30);
          world.strike(t, 7 * power, 'ult', true, { burn: 0.8 }, 260);
        }
        scene.tweens.add({ targets: sun, alpha: 0, duration: 300, onComplete: () => sun.destroy() });
        scene.tweens.add({
          targets: [sky, heat],
          alpha: 0,
          delay: 300,
          duration: 600,
          onComplete: () => [sky, heat].forEach((o) => o.destroy()),
        });
      });
    },
  },
  // Candra, the Moon Knight. His light is cold and pale: white steel, a periwinkle glow, the dark blue of the night
  // sky as outline. His shape is the crescent; his power waxes and wanes with the phase of the moon over his head
  // (PASSIVES.candra keeps it in p.getData('moon'), 0 = new moon .. 4 = full moon).
  sabitCandra: {
    // The finisher's thrust lets the crescent go: two moon blades fly out, one level and one rising for flyers.
    onSwing: ({ p, world, power }, _m, step) => {
      if (step !== 2) return;
      const f = p.facing;
      for (const [vx, vy] of [
        [260, 0],
        [220, -150],
      ])
        world.shot({
          x: p.x + f * 8,
          y: p.y,
          vx: f * vx,
          vy,
          texture: 'sabitBulan',
          mult: 0.6 * power,
          source: 'skill',
          pierce: true,
          status: { slow: 500 },
        });
    },
    // Bulan Terbenam (Moonset): he comes down like the moon sinking under the horizon, and two crescents run out
    // from his feet along the floor, one each way, cutting and slowing whatever stands on it.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      ring(scene, x, gy - 2, 0xc2d4ff, 4, 36, 300, 2);
      sparks(scene, x, gy - 4, [0xfff1e8, 0x9fb4ff], 8, 16);
      for (const s of [-1, 1]) {
        const blade = moonCrescent(scene, x, gy - 8, 8).setRotation(s > 0 ? 0 : Math.PI);
        const hit = new Set<Phaser.GameObjects.GameObject>();
        scene.tweens.addCounter({
          from: 0,
          to: 130,
          duration: 450,
          ease: 'Quad.Out',
          onUpdate: (tw) => {
            blade.x = x + s * (tw.getValue() ?? 0);
            for (const t of world.targets(blade.x, blade.y)) {
              if (hit.has(t) || Math.abs(t.x - blade.x) > 12 || t.y < gy - 32) continue;
              hit.add(t);
              cutMark(scene, t.x, t.y, 0xc2d4ff, 18);
              world.strike(t, 0.7 * power, 'proc', false, { slow: 600 }, 60);
            }
          },
          onComplete: () => scene.tweens.add({ targets: blade, alpha: 0, scaleY: 0, duration: 160, onComplete: () => blade.destroy() }),
        });
      }
    },
    // Sabit Candra: he spins the glaive and lets its crescents go, as many as the moon over his head has phases
    // (one at the new moon, four at the full). Each flies its own great elliptical loop around the arena, alternating
    // clockwise and counter-clockwise, from the floor up into the sky where the flyers are and back to where he
    // stands, cutting and slowing everything it passes. At the full moon the moon itself comes down too: it drops onto
    // the thickest crowd and bursts (PURNAMA!). Casting spends the moon: it is new again.
    skill: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const phase = (p.getData('moon') as number | undefined) ?? 0;
      p.setData('moon', 0);
      const full = phase >= 4;
      const f = p.facing;
      const [ox, oy] = [p.x, p.y - 4];
      p.lock(320);
      p.setVelocityX(0);
      glint(scene, ox + f * 6, oy);
      ring(scene, ox, oy, 0x9fb4ff, 4, 26, 260, 1);
      for (let i = 0; i < Math.max(1, phase); i++) {
        // Tall loops whose center sits well above him, so the top of each reaches the flyers (the first ~80 px up,
        // the fourth near the ceiling); each starts at his hand, on the lower part of its ellipse. They go out ahead
        // and behind in turn, each wide enough to reach the wall on its side, so two crescents cover the arena.
        const side = i % 2 ? -f : f;
        const rx = Math.max(50, (side > 0 ? W - ox : ox) * (0.5 + (i >> 1) * 0.08));
        const ry = 50 + i * 12;
        const a0 = side > 0 ? Math.PI - Math.asin(0.6) : Math.asin(0.6);
        const cx = ox - Math.cos(a0) * rx;
        const cy = oy - Math.sin(a0) * ry;
        const turn = (i % 2 ? -1 : 1) * Math.PI * 2;
        const blade = moonCrescent(scene, ox, oy, 7);
        const trail = scene.add.graphics().setDepth(12);
        const hit = new Set<Phaser.GameObjects.GameObject>();
        let last = { x: ox, y: oy };
        // The crescent swerves off its orbit toward an uncut enemy close to it, then drifts back onto the loop.
        const off = { x: 0, y: 0 };
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          delay: i * 90,
          duration: 950 + i * 120,
          ease: 'Sine.InOut',
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            const a = a0 + turn * k;
            const [px, py] = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
            const lure = world.targets(px, py).find((t) => !hit.has(t) && Phaser.Math.Distance.Between(px, py, t.x, t.y) < 40);
            off.x = Phaser.Math.Linear(off.x, lure ? lure.x - px : 0, lure ? 0.35 : 0.15);
            off.y = Phaser.Math.Linear(off.y, lure ? lure.y - py : 0, lure ? 0.35 : 0.15);
            const [x, y] = [px + off.x, Phaser.Math.Clamp(py + off.y, 6, FLOOR_Y - 4)];
            const heading = Math.atan2(y - last.y, x - last.x);
            blade.setPosition(x, y).setRotation(k * 24);
            trail.lineStyle(4, 0x9fb4ff, 0.25).lineBetween(last.x, last.y, x, y);
            trail.lineStyle(1, 0xfff1e8, 0.8).lineBetween(last.x, last.y, x, y);
            last = { x, y };
            for (const t of world.targets(x, y)) {
              if (hit.has(t) || Phaser.Math.Distance.Between(x, y, t.x, t.y) > 15) continue;
              hit.add(t);
              cutMark(scene, t.x, t.y, 0xc2d4ff, 22, heading);
              sparks(scene, t.x, t.y, [0xfff1e8, 0xc2d4ff, 0x9fb4ff], 6, 14);
              world.strike(t, (full ? 2.2 : 1.6) * power, 'skill', false, { slow: 900 }, 80);
            }
          },
          onComplete: () => {
            ring(scene, blade.x, blade.y, 0xc2d4ff, 3, 16, 200, 1);
            blade.destroy();
            scene.tweens.add({ targets: trail, alpha: 0, duration: 300, onComplete: () => trail.destroy() });
          },
        });
      }
      if (!full) return;
      // Purnama: the moon falls on the thickest crowd.
      later(scene, 350, () => {
        const foes = world.targets(ox, oy);
        if (!foes.length) return;
        const near = (e: Phaser.GameObjects.Sprite) => foes.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < 44).length;
        const mark = foes.reduce((b, e) => (near(e) > near(b) ? e : b));
        const [tx, ty] = [mark.x, Math.min(mark.y, FLOOR_Y - 12)];
        const mg = scene.add.graphics();
        moonPhase(mg, 14, 1);
        const moon = scene.add.container(tx, -20, [mg]).setDepth(13);
        scene.tweens.add({
          targets: moon,
          y: ty,
          angle: 90,
          duration: 380,
          ease: 'Quad.In',
          onComplete: () => {
            scene.cameras.main.flash(140, 194, 212, 255);
            scene.cameras.main.shake(300, 0.022);
            floatText(scene, Phaser.Math.Clamp(tx, 40, W - 40), ty - 30, 'PURNAMA!', '#c2d4ff');
            ring(scene, tx, ty, 0xfff1e8, 10, 56, 380, 2);
            ring(scene, tx, ty, 0x9fb4ff, 6, 70, 480, 2);
            rocks(scene, tx, FLOOR_Y - 2, 6);
            sparks(scene, tx, ty, [0xfff1e8, 0xc2d4ff, 0x9fb4ff], 16, 36);
            world.area(tx, ty, 44, 3 * power, 220, 'skill', { slow: 1500 });
            scene.tweens.add({ targets: moon, scale: 2.2, alpha: 0, duration: 300, onComplete: () => moon.destroy() });
          },
        });
      });
    },
    // Pasang Bulan (Moon Tide): night falls and a full moon rises over the arena; a silver tide floods the floor and
    // the moon's pull draws the water and every enemy up toward the sky, flyers and walkers alike, motes of light
    // rising with them. Then the moon lets go: the tide crashes down (SURUT!), hurling everything to the floor.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(1900);
      p.lock(1600);
      p.setVelocity(0, 0);
      const [mx, my] = [W / 2, 30];
      const night = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x0a1030, 0.55).setOrigin(0).setDepth(4).setAlpha(0);
      scene.tweens.add({ targets: night, alpha: 1, duration: 400 });
      const mg = scene.add.graphics();
      moonPhase(mg, 16, 1);
      const moon = scene.add.container(mx, -20, [mg]).setDepth(5);
      scene.tweens.add({ targets: moon, y: my, duration: 600, ease: 'Quad.Out' });
      // The tide rises with the moon, a sheet of water with a moving silver crest.
      // Behind the player (10) so he stands in the tide rather than under it.
      const water = scene.add.graphics().setDepth(9);
      const drawWater = (h: number, t: number) => {
        water.clear();
        water.fillStyle(0x29adff, 0.22).fillRect(0, FLOOR_Y - h, W, h + 12);
        const crest = Array.from({ length: 33 }, (_, i) => new Phaser.Math.Vector2(i * 10, FLOOR_Y - h + Math.sin(i * 0.8 + t / 90) * 2));
        water.lineStyle(2, 0x9fb4ff, 0.6).strokePoints(crest);
        water.lineStyle(1, 0xfff1e8).strokePoints(crest);
      };
      scene.tweens.addCounter({
        from: 0,
        to: 28,
        duration: 1100,
        ease: 'Sine.Out',
        onUpdate: (tw) => drawWater(tw.getValue() ?? 0, scene.time.now),
      });
      // The pull: everything is lifted toward the moon.
      for (let k = 0; k < 6; k++)
        later(scene, 200 + k * 150, () => {
          world.pull(mx, my + 14, 400, 170);
          for (let i = 0; i < 6; i++) {
            const m = scene.add.rectangle(Phaser.Math.Between(0, W), FLOOR_Y - 4, 1, 3, i % 2 ? 0xfff1e8 : 0x9fb4ff).setDepth(12);
            scene.tweens.add({ targets: m, y: my + 20, alpha: 0, duration: 600, onComplete: () => m.destroy() });
          }
          if (k === 0) ring(scene, mx, my, 0xc2d4ff, 18, 50, 400, 2);
        });
      // The crash.
      later(scene, 1200, () => {
        cam.flash(150, 159, 180, 255);
        cam.shake(500, 0.03);
        floatText(scene, W / 2, 64, 'SURUT!', '#9fb4ff');
        world.slam(mx, FLOOR_Y, 400, 460);
        for (const t of world.targets(mx, my)) {
          sparks(scene, t.x, t.y, [0x29adff, 0x9fb4ff, 0xfff1e8], 8, 16);
          world.strike(t, 4.5 * power, 'skill', false, { slow: 1200 }, 0);
        }
        for (let x = 4; x < W; x += 12) {
          const d = scene.add.rectangle(x, FLOOR_Y - 20, 2, 4, x % 24 ? 0x29adff : 0xfff1e8).setDepth(12);
          scene.tweens.add({
            targets: d,
            y: d.y - Phaser.Math.Between(10, 30),
            alpha: 0,
            yoyo: false,
            duration: 450,
            onComplete: () => d.destroy(),
          });
        }
        scene.tweens.addCounter({
          from: 28,
          to: 0,
          duration: 500,
          ease: 'Quad.In',
          onUpdate: (tw) => drawWater(tw.getValue() ?? 0, scene.time.now),
          onComplete: () => water.destroy(),
        });
        scene.tweens.add({
          targets: [night, moon],
          alpha: 0,
          delay: 200,
          duration: 500,
          onComplete: () => [night, moon].forEach((o) => o.destroy()),
        });
      });
    },
    // Malam Seribu Bulan (Night of a Thousand Moons): night falls over the whole arena and the stars come out; a vast
    // moon rises with its reflection trembling on the floor, and it runs through all its phases, new to full. At every
    // phase a crescent breaks off it and falls on an enemy. At the full moon it sets: it sinks to meet its own
    // reflection, and as they touch a giant crescent sweeps across the whole arena (TERBENAM!), striking everything.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(4000);
      p.lock(3600);
      p.setVelocity(0, 0);
      glint(scene, p.x, p.y - 4);
      ring(scene, p.x, p.y, 0x9fb4ff, 4, 40, 400, 2);
      const night = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x05081a, 0.88).setOrigin(0).setDepth(4).setAlpha(0);
      const sheen = scene.add
        .rectangle(0, FLOOR_Y, W, H - FLOOR_Y, 0x1d2b53, 0.8)
        .setOrigin(0)
        .setDepth(4.05)
        .setAlpha(0);
      scene.tweens.add({ targets: [night, sheen], alpha: 1, duration: 500 });
      const stars = Array.from({ length: 40 }, () =>
        scene.add
          .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(4, FLOOR_Y - 30), 1, 1, 0xfff1e8)
          .setDepth(4.1)
          .setAlpha(0),
      );
      stars.forEach((s, i) =>
        scene.tweens.add({ targets: s, alpha: { from: 0, to: 1 }, delay: 200 + i * 15, duration: 400, yoyo: true, repeat: 3 }),
      );
      const mg = scene.add.graphics();
      const rg = scene.add.graphics();
      const moon = scene.add
        .container(W / 2, 44, [mg])
        .setDepth(5)
        .setScale(0);
      const reflection = scene.add
        .container(W / 2, FLOOR_Y + 8, [rg])
        .setDepth(4.1)
        .setScale(1, 0)
        .setAlpha(0.5);
      const draw = (lit: number) => {
        mg.clear();
        rg.clear();
        moonPhase(mg, 22, lit);
        moonPhase(rg, 22, lit);
      };
      draw(0);
      scene.tweens.add({ targets: moon, scale: 1, duration: 500, ease: 'Back.Out' });
      scene.tweens.add({ targets: reflection, scaleY: -0.3, duration: 500 });
      // The moon waxes, new to full.
      scene.tweens.addCounter({ from: 0, to: 1, delay: 500, duration: 2100, onUpdate: (tw) => draw(tw.getValue() ?? 0) });
      later(scene, 300, () => cam.shake(400, 0.005));
      // A crescent falls from each phase onto an enemy.
      for (let i = 0; i < 8; i++)
        later(scene, 700 + i * 240, () => {
          const foes = world.targets(moon.x, moon.y);
          const t = foes[i % Math.max(1, foes.length)];
          if (!t) return;
          const blade = moonCrescent(scene, moon.x, moon.y, 9).setRotation(Phaser.Math.Angle.Between(moon.x, moon.y, t.x, t.y));
          scene.tweens.add({
            targets: blade,
            x: t.x,
            y: t.y,
            duration: 170,
            ease: 'Quad.In',
            onComplete: () => {
              blade.destroy();
              if (!t.active) return;
              cutMark(scene, t.x, t.y, 0xc2d4ff, 28, blade.rotation + Math.PI / 2);
              sparks(scene, t.x, t.y, [0xfff1e8, 0xc2d4ff, 0x9fb4ff], 10, 18);
              ring(scene, t.x, t.y, 0x9fb4ff, 3, 20, 240, 1);
              cam.shake(70, 0.007);
              world.strike(t, 2 * power, 'ult', false, { slow: 800 }, 80);
            },
          });
        });
      // Full: it glows, then sets to meet its reflection.
      later(scene, 2650, () => {
        ring(scene, moon.x, moon.y, 0xfff1e8, 22, 60, 400, 2);
        ring(scene, moon.x, moon.y, 0x9fb4ff, 22, 80, 500, 1);
      });
      later(scene, 2900, () => {
        scene.tweens.add({ targets: moon, y: FLOOR_Y - 14, scale: 1.4, duration: 420, ease: 'Quad.In' });
        scene.tweens.add({ targets: reflection, scaleY: -0.9, alpha: 0.8, duration: 420, ease: 'Quad.In' });
      });
      later(scene, 3330, () => {
        cam.flash(250, 194, 212, 255);
        cam.shake(600, 0.035);
        // Once the crescent has passed: pale text on its pale body would not read.
        later(scene, 360, () => floatText(scene, W / 2, 48, 'TERBENAM!', '#c2d4ff'));
        // The great crescent sweeps the whole arena, left to right, floor to sky.
        const big = moonCrescent(scene, -70, FLOOR_Y / 2 + 6, 80).setDepth(15);
        scene.tweens.add({
          targets: big,
          x: W + 90,
          duration: 380,
          ease: 'Quad.InOut',
          onComplete: () => big.destroy(),
        });
        const seam = scene.add
          .rectangle(0, FLOOR_Y - 14, W, 2, 0xfff1e8)
          .setOrigin(0, 0.5)
          .setDepth(15);
        scene.tweens.add({ targets: seam, scaleY: 0, alpha: 0, delay: 200, duration: 400, onComplete: () => seam.destroy() });
        for (const t of world.targets(p.x, p.y)) {
          later(scene, Phaser.Math.Clamp(t.x, 0, W) * 1.1, () => {
            if (!t.active) return;
            cutMark(scene, t.x, t.y, 0xfff1e8, 44, Math.PI / 2);
            sparks(scene, t.x, t.y, [0xfff1e8, 0xc2d4ff], 12, 26);
          });
          world.strike(t, 6 * power, 'ult', true, { slow: 1500 }, 200);
        }
        scene.tweens.add({
          targets: [moon, reflection],
          alpha: 0,
          duration: 300,
          onComplete: () => [moon, reflection].forEach((o) => o.destroy()),
        });
        scene.tweens.add({
          targets: [night, sheen, ...stars],
          alpha: 0,
          delay: 300,
          duration: 600,
          onComplete: () => [night, sheen, ...stars].forEach((o) => o.destroy()),
        });
      });
    },
  },
};
