import Phaser from 'phaser';
import { FLOOR_Y, H, W, cutMark, floatText } from '../gfx/ui.ts';
import type { Move, WeaponId } from '../logic/loot.ts';
import type { HitSource, PlayerWorld } from './arena.ts';
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
  /** A basic projectile of the weapon (move `m`) struck `t` at (x, y): its impact (Elementalis' elemental bursts). */
  onShotHit?: (c: SkillCtx, m: Move, x: number, y: number, t: Phaser.GameObjects.Sprite) => void;
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
export function stormArc(
  scene: Phaser.Scene,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ms = 240,
  width = 1,
  forks = 2,
  pal: readonly [number, number, number] = [0x7fe6ff, 0xffec27, 0xfff1e8],
): void {
  const g = scene.add.graphics().setDepth(14);
  const pts = jag(x0, y0, x1, y1, 4 + width * 2);
  for (const [w, c, a] of [
    [3 + width * 2, pal[0], 0.35],
    [1 + width, pal[1], 1],
    [Math.max(1, width - 1), pal[2], 1],
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
    g.lineStyle(1 + Math.floor(width / 2), pal[1])
      .beginPath()
      .moveTo(fx, fy);
    for (const [x, y] of fork) g.lineTo(x, y);
    g.strokePath();
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: ms, ease: 'Quad.In', onComplete: () => g.destroy() });
}

/**
 * Lightning Lord, heir of Raijin: violet storm lightning with a white-hot core and cyan sparks, and the taiko of his
 * drum ring (red-lacquered shells, black rims, pale skins painted with the mitsudomoe).
 */
export const RAIJIN = {
  fringe: 0x8a3fd1,
  bolt: 0xc080ff,
  core: 0xfff1e8,
  spark: 0x7fe6ff,
  lacquer: 0xb3122e,
  rim: 0x1c1c28,
  skin: 0xe6dccb,
  stud: 0xc2c3c7,
} as const;
/** His lightning's layers for `stormArc`: violet fringe, lilac body, white core. */
export const RAI = [RAIJIN.fringe, RAIJIN.bolt, RAIJIN.core] as const;
/** IRAMA GUNTUR: his drums beat every BEAT ms (100 a minute) on one clock shared by the passive, skills and the ring. */
export const BEAT = 600;
/** The beat `now` belongs to (a beat's window opens 60 ms before it lands). */
export const beatOf = (now: number) => Math.floor((now + 60) / BEAT);
/** On the beat: from 60 ms early to 160 ms late. */
export function onBeat(now: number): boolean {
  const d = now % BEAT;
  return d < 160 || d > BEAT - 60;
}

/**
 * A taiko seen face-on at (x, y) with a skin of radius r: a black rim set with studs, the red-lacquered shell showing
 * round it, the pale skin with a mitsudomoe turning at `rot`. `lit` (0..1) floods the skin violet-white as it booms.
 */
export function taiko(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, rot = 0, lit = 0): void {
  if (lit > 0) g.fillStyle(RAIJIN.bolt, 0.3 * lit).fillCircle(x, y, r + 3 + lit * 2);
  g.fillStyle(RAIJIN.rim).fillCircle(x, y, r + 2);
  g.fillStyle(RAIJIN.lacquer).fillCircle(x, y, r + 1);
  g.fillStyle(lit > 0.6 ? RAIJIN.core : RAIJIN.skin).fillCircle(x, y, r);
  if (lit > 0) g.fillStyle(RAIJIN.bolt, 0.55 * lit).fillCircle(x, y, r);
  if (r < 3) return void g.fillStyle(RAIJIN.lacquer).fillRect(x - 0.5, y - 0.5, 1, 1);
  const n = Math.round(r * 2.5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.fillStyle(RAIJIN.stud).fillRect(x + Math.cos(a) * (r + 1.5) - 0.5, y + Math.sin(a) * (r + 1.5) - 0.5, 1, 1);
  }
  // The mitsudomoe: three comma heads round the middle, each tail curling after the one before.
  for (let k = 0; k < 3; k++) {
    const a = rot + (k / 3) * Math.PI * 2;
    const ink = lit > 0.6 ? RAIJIN.fringe : RAIJIN.lacquer;
    g.fillStyle(ink).fillCircle(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35, Math.max(1, r * 0.22));
    g.lineStyle(1, ink).beginPath();
    for (let j = 0; j <= 4; j++) {
      const b = a + 0.3 + j * 0.3;
      const d = r * (0.35 + j * 0.08);
      if (j) g.lineTo(x + Math.cos(b) * d, y + Math.sin(b) * d);
      else g.moveTo(x + Math.cos(b) * d, y + Math.sin(b) * d);
    }
    g.strokePath();
  }
}

/**
 * Raijin's drum ring at (cx, cy): a black hoop of radius R with a lacquer line, and `n` taiko of skin radius r strung on
 * it, the ring turned by `rot`; `lit(i)` says how brightly drum i is booming. `from`/`to` limit it to an arch
 * (radians; the default is the whole ring).
 */
export function drumRing(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  R: number,
  n: number,
  r: number,
  rot: number,
  lit: (i: number) => number,
  from = 0,
  to = Math.PI * 2,
): void {
  const whole = to - from >= Math.PI * 2 - 1e-3;
  g.lineStyle(Math.max(2, r * 0.5), RAIJIN.rim).beginPath();
  g.arc(cx, cy, R, from + (whole ? 0 : rot), to + (whole ? 0 : rot));
  g.strokePath();
  g.lineStyle(1, RAIJIN.lacquer).beginPath();
  g.arc(cx, cy, R, from + (whole ? 0 : rot), to + (whole ? 0 : rot));
  g.strokePath();
  for (let i = 0; i < n; i++) {
    const a = from + rot + (whole ? (i / n) * Math.PI * 2 : ((i + 0.5) / n) * (to - from));
    taiko(g, cx + Math.cos(a) * R, cy + Math.sin(a) * R, r, a * 2, lit(i));
  }
}

/** A boom of sound from (x, y): `n` arcs ")))" running out to `reach` px around `dir` (or full rings when dir is null). */
export function boom(scene: Phaser.Scene, x: number, y: number, dir: number | null, n: number, reach: number, ms = 320): void {
  const g = scene.add.graphics().setDepth(13);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: ms,
    ease: 'Quad.Out',
    onUpdate: (tw) => {
      const k = tw.getValue() ?? 0;
      g.clear();
      for (let i = 0; i < n; i++) {
        const r = k * reach - i * 7;
        if (r <= 2) continue;
        const al = (1 - k) * (1 - i / (n + 1));
        for (const [w, c, a] of [
          [3, RAIJIN.fringe, 0.4],
          [1, RAIJIN.core, 1],
        ] as const) {
          g.lineStyle(w, c, a * al).beginPath();
          if (dir === null) g.strokeEllipse(x, y, r * 2, r * 1.3);
          else {
            g.arc(x, y, r, dir - 0.75, dir + 0.75);
            g.strokePath();
          }
        }
      }
    },
    onComplete: () => g.destroy(),
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
  angelWing(g, angel, span, flap);
  demonWing(g, -angel, span, flap);
}

/** The angel's wing toward `side` (-1 left, 1 right): five feathers fanned up and out, grey outline, white vane, gold tip. */
export function angelWing(g: Phaser.GameObjects.Graphics, side: number, span: number, flap: number): void {
  for (let k = 0; k < 5; k++) {
    const a = -1.05 + k * 0.33 + flap * 0.5;
    const l = span * (1 - k * 0.1);
    const [tx, ty] = [side * Math.cos(a) * l, Math.sin(a) * l];
    const w = 1.5 + span * 0.06;
    g.fillStyle(0x83769c).fillTriangle(0, -w - 0.8, 0, w + 0.8, tx * 1.04, ty * 1.04);
    g.fillStyle(0xfff1e8).fillTriangle(0, -w, 0, w, tx, ty);
    g.fillStyle(HOLY).fillCircle(tx * 0.92, ty * 0.92, Math.max(1, span * 0.04));
  }
}

/** The demon's wing toward `side`: three finger bones with a scalloped membrane between them and a claw at the top. */
export function demonWing(g: Phaser.GameObjects.Graphics, side: number, span: number, flap: number): void {
  const bones = [-1.0, -0.45, 0.15].map((b, i) => {
    const l = span * [1, 0.85, 0.6][i];
    return { x: side * Math.cos(b + flap * 0.5) * l, y: Math.sin(b + flap * 0.5) * l };
  });
  const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
  const pts = [v(0, -1)];
  bones.forEach((b, i) => {
    pts.push(v(b.x, b.y));
    const n = bones[i + 1];
    if (n) pts.push(v((b.x + n.x) * 0.36, (b.y + n.y) * 0.36 + 1));
  });
  pts.push(v(side * 2, span * 0.18));
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
 * Amaterasu's black flame drawn on `g`, its base at (x, y), `h` px tall, flickering with `t` (ms): three licking
 * tongues, each a red glow, a red edge and a dark-purple rim (so it reads on the night hills), the black body and a dull blue-black sheen inside.
 */
export function blackFlame(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number, t: number): void {
  const w = Math.max(3, h * 0.45);
  for (const [k, c, al] of [
    [1.3, 0xff004d, 0.3],
    [1.14, 0xff004d, 1],
    [1.02, 0x7e2553, 1],
    [0.86, 0x000000, 1],
    [0.42, 0x1d2b53, 0.9],
  ] as const) {
    for (let i = -1; i <= 1; i++) {
      const sway = Math.sin(t / 90 + i * 2.1) * w * 0.35;
      const th = h * (i === 0 ? 1 : 0.65) * (0.85 + 0.15 * Math.sin(t / 70 + i)) * k;
      const [bx, bw] = [x + i * w * 0.35, w * 0.5 * k];
      g.fillStyle(c, al).fillPoints(
        [
          new Phaser.Math.Vector2(bx - bw, y),
          new Phaser.Math.Vector2(bx - bw * 0.7, y - th * 0.4),
          new Phaser.Math.Vector2(bx + sway, y - th),
          new Phaser.Math.Vector2(bx + bw * 0.7, y - th * 0.4),
          new Phaser.Math.Vector2(bx + bw, y),
          new Phaser.Math.Vector2(bx, y + bw * 0.4),
        ],
        true,
      );
    }
  }
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

/** A roaring pillar of fire from the floor at x, `h` px tall: a red outer flame, orange body, gold core, licking edges. */
function firePillar(scene: Phaser.Scene, x: number, h: number, ms = 600): void {
  const g = scene.add.graphics();
  const flick = () => {
    g.clear();
    for (const [w, c, a] of [
      [26, 0xff004d, 0.55],
      [17, 0xffa300, 0.85],
      [8, 0xffec27, 1],
      [3, 0xfff1e8, 1],
    ] as const) {
      g.fillStyle(c, a).fillRect(-w / 2, -h, w, h);
      // Tongues licking off both edges, shifting every frame.
      for (let y = 6; y < h; y += 12) {
        const l = Phaser.Math.Between(3, 7) * (w / 26);
        g.fillTriangle(-w / 2, -y, -w / 2, -y - 8, -w / 2 - l, -y - Phaser.Math.Between(2, 10));
        g.fillTriangle(w / 2, -y, w / 2, -y - 8, w / 2 + l, -y - Phaser.Math.Between(2, 10));
      }
    }
  };
  const c = scene.add.container(x, FLOOR_Y, [g]).setDepth(11).setScale(1, 0);
  const ev = scene.time.addEvent({ delay: 50, loop: true, callback: flick });
  flick();
  scene.tweens.add({ targets: c, scaleY: 1, duration: 110, ease: 'Quad.Out' });
  scene.tweens.add({
    targets: c,
    scaleX: 0,
    alpha: 0,
    delay: ms,
    duration: 260,
    onComplete: () => (ev.remove(), c.destroy()),
  });
  for (let k = 0; k < 12; k++) {
    const e = scene.add
      .rectangle(x + Phaser.Math.Between(-10, 10), FLOOR_Y - Phaser.Math.Between(0, h), 2, 2, k % 2 ? 0xffa300 : 0xffec27)
      .setDepth(12);
    scene.tweens.add({ targets: e, y: e.y - Phaser.Math.Between(20, 50), alpha: 0, duration: 600, onComplete: () => e.destroy() });
  }
}

/** A block of ice around (x, y), `w` x `h`: a deep blue outline, pale body, white facets; returned so it can shatter. */
function iceBlock(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x1d2b53).fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
  g.fillStyle(0x29adff, 0.55).fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle(0xc2f0ff, 0.6).fillTriangle(-w / 2, -h / 2, w / 2, -h / 2, -w / 2, h / 2);
  g.lineStyle(1, 0xfff1e8)
    .lineBetween(-w / 2 + 2, -h / 2 + 2, -w / 2 + 2, h / 2 - 3)
    .lineBetween(-w / 2 + 2, -h / 2 + 2, w / 2 - 4, -h / 2 + 2);
  g.lineStyle(1, 0xfff1e8, 0.7).lineBetween(w / 4, -h / 4, -w / 6, h / 3);
  const c = scene.add.container(x, y, [g]).setDepth(13).setScale(0.3);
  scene.tweens.add({ targets: c, scale: 1, duration: 120, ease: 'Back.Out' });
  return c;
}

/** Shatter an ice block: shards fly out all round and it is gone. */
function shatter(scene: Phaser.Scene, c: Phaser.GameObjects.Container): void {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = scene.add.image(c.x, c.y, 'iceshard').setRotation(a).setDepth(13);
    scene.tweens.add({
      targets: s,
      x: c.x + Math.cos(a) * 30,
      y: c.y + Math.sin(a) * 30,
      alpha: 0,
      duration: 320,
      onComplete: () => s.destroy(),
    });
  }
  sparks(scene, c.x, c.y, [0xc2f0ff, 0xfff1e8, 0x29adff], 10, 18);
  c.destroy();
}

/** A rock pillar bursting up from the floor at x, `h` px tall: dark outline, brown body, a lit face and cracks. */
function rockPillar(scene: Phaser.Scene, x: number, h: number, ms = 700): void {
  const g = scene.add.graphics();
  const w = 14;
  g.fillStyle(0x3b2418).fillPoints(
    [V2(-w / 2 - 1, 0), V2(-w / 2 + 1, -h + 4), V2(0, -h - 2), V2(w / 2 - 1, -h + 6), V2(w / 2 + 1, 0)],
    true,
  );
  g.fillStyle(0xab5236).fillPoints([V2(-w / 2, 0), V2(-w / 2 + 2, -h + 4), V2(0, -h), V2(w / 2 - 2, -h + 6), V2(w / 2, 0)], true);
  g.fillStyle(0xd08a5a).fillPoints([V2(-w / 2 + 1, 0), V2(-w / 2 + 3, -h + 5), V2(-1, -h + 1), V2(-2, 0)], true);
  g.lineStyle(1, 0x3b2418)
    .lineBetween(2, -h * 0.3, -1, -h * 0.5)
    .lineBetween(-1, -h * 0.5, 3, -h * 0.7);
  const c = scene.add
    .container(x, FLOOR_Y + 2, [g])
    .setDepth(9)
    .setScale(1, 0);
  scene.tweens.add({ targets: c, scaleY: 1, duration: 100, ease: 'Back.Out' });
  scene.tweens.add({
    targets: c,
    scaleY: 0,
    delay: ms,
    duration: 220,
    ease: 'Quad.In',
    onComplete: () => c.destroy(),
  });
  rocks(scene, x, FLOOR_Y, 4);
}

/** Small fry thrown up (bosses and elites are too heavy). */
const launch = (t: Phaser.GameObjects.Sprite, v: number) => {
  if (t.active && !('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-v);
};

/** The four spells of the Elementalis' cycle, cast in turn by the skill key: fire, ice, lightning, earth. */
const ELEMENT_SPELLS: SkillFn[] = [
  // Inferno: she raises the staff and the ground under every enemy (up to six, flyers too) erupts, one after another,
  // in a roaring pillar of fire that reaches the sky; the floor between the first and last pillar catches and burns
  // as a carpet of flame for a moment, and at the end every pillar bursts at its foot.
  ({ p, world, scene, power }) => {
    const foes = world.targets(p.x, p.y).slice(0, 6);
    if (!foes.length) return false;
    const cam = scene.cameras.main;
    p.lock(350);
    p.setVelocityX(0);
    floatText(scene, p.x, p.y - 44, 'INFERNO', '#ff004d');
    ring(scene, p.x, p.y, 0xff004d, 4, 30, 300, 2);
    const xs = foes.map((t) => Phaser.Math.Clamp(t.x, 8, W - 8));
    foes.forEach((t, i) =>
      later(scene, 80 + i * 90, () => {
        const x = t.active ? Phaser.Math.Clamp(t.x, 8, W - 8) : xs[i];
        firePillar(scene, x, 150, 650);
        flameTongue(scene, x, FLOOR_Y, 20, 400, FIRE);
        cam.shake(90, 0.01);
        for (const o of world.targets(x, FLOOR_Y))
          if (Math.abs(o.x - x) < 16) world.strike(o, 1.8 * power, 'skill', false, { burn: 0.5 }, 60);
      }),
    );
    // The carpet of flame between the outermost pillars.
    const [lo, hi] = [Math.min(...xs, p.x) - 10, Math.max(...xs, p.x) + 10];
    for (let k = 0; k < 4; k++)
      later(scene, 300 + k * 400, () => {
        for (let x = lo; x <= hi; x += 14)
          flameTongue(scene, x + Phaser.Math.Between(-4, 4), FLOOR_Y, Phaser.Math.Between(8, 16), 380, FIRE);
        for (const o of world.targets(p.x, FLOOR_Y))
          if (o.x >= lo && o.x <= hi && o.y > FLOOR_Y - 30) world.strike(o, 0.4 * power, 'skill', false, { burn: 0.3 }, 0);
      });
    later(scene, 80 + foes.length * 90 + 450, () => {
      cam.shake(200, 0.016);
      for (const x of xs) {
        explosion(scene, x, FLOOR_Y - 8, 18);
        for (const o of world.targets(x, FLOOR_Y))
          if (Math.abs(o.x - x) < 22) world.strike(o, 1 * power, 'skill', false, { burn: 0.3 }, 160);
      }
    });
  },
  // Glacier: she plants the staff and a freezing wave races out along the floor to both walls, leaving it a sheet of
  // ice bristling with spikes. Every enemy on the ground it reaches is sealed in a block of ice; every enemy in the air
  // is speared by an icicle grown on the ceiling above it and sealed the same way. Then all the ice shatters at once
  // (PECAH!), and the frozen take the blow.
  ({ p, world, scene, power }) => {
    const foes = world.targets(p.x, p.y);
    if (!foes.length) return false;
    const cam = scene.cameras.main;
    const x0 = p.x;
    p.lock(400);
    p.setVelocityX(0);
    floatText(scene, x0, p.y - 44, 'GLACIER', '#29adff');
    cam.flash(120, 41, 173, 255);
    const sheet = scene.add.graphics().setDepth(9);
    const blocks: [Phaser.GameObjects.Container, Phaser.GameObjects.Sprite][] = [];
    const sealed = new Set<Phaser.GameObjects.Sprite>();
    const seal = (t: Phaser.GameObjects.Sprite) => {
      if (sealed.has(t) || !t.active) return;
      sealed.add(t);
      blocks.push([iceBlock(scene, t.x, t.y, t.displayWidth + 8, t.displayHeight + 8), t]);
      world.strike(t, 1 * power, 'skill', false, { freeze: 2200 }, 0);
    };
    scene.tweens.addCounter({
      from: 0,
      to: W,
      duration: 500,
      onUpdate: (tw) => {
        const d = tw.getValue() ?? 0;
        const [l, r] = [Math.max(0, x0 - d), Math.min(W, x0 + d)];
        sheet.clear();
        sheet.fillStyle(0xc2f0ff, 0.55).fillRect(l, FLOOR_Y - 2, r - l, 3);
        sheet.fillStyle(0xfff1e8).fillRect(l, FLOOR_Y - 2, r - l, 1);
        for (const t of foes) if (t.y > FLOOR_Y - 34 && t.x >= l && t.x <= r) seal(t);
      },
    });
    for (let i = 1; i * 16 < W; i++)
      later(scene, i * 18, () => {
        for (const s of [-1, 1]) {
          const sx = x0 + s * i * 16;
          if (sx < 0 || sx > W) continue;
          const h = Phaser.Math.Between(10, 24);
          const spike = scene.add
            .triangle(sx, FLOOR_Y, -4, 0, 0, -h, 4, 0, 0xc2f0ff)
            .setOrigin(0)
            .setStrokeStyle(1, 0x29adff)
            .setScale(1, 0)
            .setDepth(9);
          scene.tweens.add({ targets: spike, scaleY: 1, duration: 100, yoyo: true, hold: 1000, onComplete: () => spike.destroy() });
        }
      });
    // Flyers: an icicle grows on the ceiling over each and drops onto it.
    foes
      .filter((t) => t.y <= FLOOR_Y - 34)
      .forEach((t, i) =>
        later(scene, 150 + i * 70, () => {
          if (!t.active) return;
          const ice = scene.add
            .image(t.x, 4, 'iceshard')
            .setRotation(Math.PI / 2)
            .setScale(3, 2)
            .setDepth(13);
          scene.tweens.add({
            targets: ice,
            y: t.y,
            duration: 160,
            ease: 'Quad.In',
            onComplete: () => {
              ice.destroy();
              seal(t);
            },
          });
        }),
      );
    // Blocks follow what they hold (a frozen enemy can still be pushed), then all shatter.
    const follow = () => blocks.forEach(([c, t]) => t.active && c.active && c.setPosition(t.x, t.y));
    scene.events.on('update', follow);
    later(scene, 1300, () => {
      scene.events.off('update', follow);
      cam.shake(300, 0.02);
      floatText(scene, W / 2, 50, 'PECAH!', '#c2f0ff');
      for (const [c, t] of blocks) {
        shatter(scene, c);
        if (t.active) world.strike(t, 2.6 * power, 'skill', true, { slow: 1500 }, 140);
      }
      scene.tweens.add({ targets: sheet, alpha: 0, duration: 400, onComplete: () => sheet.destroy() });
    });
  },
  // Thunder: storm clouds roll in over the whole arena, lightning flickering inside them. Bolts rain down in three
  // volleys on every enemy and on the floor between them, each strike leaping on to the nearest neighbour; then the
  // storm gathers itself into one colossal bolt that smashes into the thickest crowd and arcs out to all around it.
  ({ p, world, scene, power }) => {
    const foes = world.targets(p.x, p.y);
    if (!foes.length) return false;
    const cam = scene.cameras.main;
    floatText(scene, p.x, p.y - 44, 'THUNDER', '#ffec27');
    const clouds = Array.from({ length: 9 }, (_, i) =>
      scene.add
        .ellipse(i * 40 + Phaser.Math.Between(-8, 8), 8 + (i % 2) * 6, 70, 22, i % 2 ? 0x1d2b53 : 0x2b2f6b, 0.9)
        .setDepth(12)
        .setAlpha(0),
    );
    scene.tweens.add({ targets: clouds, alpha: 1, duration: 200 });
    const flicker = scene.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        const c = Phaser.Utils.Array.GetRandom(clouds);
        c.setFillStyle(0x7fe6ff, 0.9);
        later(scene, 60, () => c.setFillStyle(0x1d2b53, 0.9));
      },
    });
    for (let v = 0; v < 3; v++)
      later(scene, 250 + v * 280, () => {
        if (v === 0) cam.flash(60, 255, 241, 232);
        cam.shake(120, 0.01);
        for (const t of world.targets(p.x, p.y)) {
          bolt(scene, t.x + Phaser.Math.Between(-16, 16), 14, t.x, t.y);
          world.strike(t, 0.9 * power, 'skill', false, { freeze: 250 }, 40);
          const n = world.targets(t.x, t.y)[1];
          if (n && Phaser.Math.Distance.Between(t.x, t.y, n.x, n.y) < 60) {
            bolt(scene, t.x, t.y, n.x, n.y, 0x29adff);
            world.strike(n, 0.4 * power, 'skill', false, { freeze: 150 }, 0);
          }
        }
        for (let k = 0; k < 3; k++) {
          const x = Phaser.Math.Between(10, W - 10);
          bolt(scene, x, 14, x + Phaser.Math.Between(-10, 10), FLOOR_Y);
          sparks(scene, x, FLOOR_Y - 2, [0xffec27, 0xfff1e8], 5, 10);
        }
      });
    later(scene, 1150, () => {
      const live = world.targets(p.x, p.y);
      flicker.remove();
      scene.tweens.add({ targets: clouds, alpha: 0, duration: 400, onComplete: () => clouds.forEach((c) => c.destroy()) });
      if (!live.length) return;
      const near = (e: Phaser.GameObjects.Sprite) => live.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < 60).length;
      const mark = live.reduce((b, e) => (near(e) > near(b) ? e : b));
      cam.flash(120, 255, 236, 39);
      cam.shake(350, 0.028);
      for (const dx of [-3, 0, 3]) bolt(scene, mark.x + dx, 0, mark.x, mark.y);
      ring(scene, mark.x, mark.y, 0xffec27, 6, 50, 360, 3);
      ring(scene, mark.x, mark.y, 0x29adff, 4, 70, 420, 2);
      for (const t of live) {
        const d = Phaser.Math.Distance.Between(mark.x, mark.y, t.x, t.y);
        if (d > 80) continue;
        if (t !== mark) bolt(scene, mark.x, mark.y, t.x, t.y, 0x29adff);
        world.strike(t, (t === mark ? 2.6 : 1.4) * power, 'skill', true, { freeze: 600 }, 160);
      }
    });
  },
  // Quake: she drives the staff into the ground and the whole arena shakes. The floor splits open from wall to wall in
  // a glowing seam; a pillar of rock bursts up under every enemy on the ground, hurling it into the air, while boulders
  // torn from the floor fly at every enemy in the air. Then the pillars crumble and rubble rains down.
  ({ p, world, scene, power }) => {
    const foes = world.targets(p.x, p.y);
    if (!foes.length) return false;
    const cam = scene.cameras.main;
    const { x } = p;
    p.lock(400);
    p.setVelocityX(0);
    floatText(scene, x, p.y - 44, 'QUAKE', '#00e436');
    cam.shake(700, 0.022);
    const seam = scene.add.graphics().setDepth(9);
    const pts = [...jag(x, FLOOR_Y, 0, FLOOR_Y, 2).reverse(), ...jag(x, FLOOR_Y, W, FLOOR_Y, 2)].map(([px, py]) => V2(px, py));
    seam.lineStyle(4, 0xffa300, 0.35).strokePoints(pts);
    seam.lineStyle(2, 0x3b2418).strokePoints(pts);
    seam.lineStyle(1, 0xffec27).strokePoints(pts);
    scene.tweens.add({ targets: seam, alpha: 0, delay: 1100, duration: 400, onComplete: () => seam.destroy() });
    foes.forEach((t, i) =>
      later(scene, 120 + i * 70, () => {
        if (!t.active) return;
        if (t.y > FLOOR_Y - 34) {
          const px = Phaser.Math.Clamp(t.x, 8, W - 8);
          rockPillar(scene, px, 44, 600);
          world.strike(t, 2 * power, 'skill', false, { slow: 1500 }, 80);
          launch(t, 300);
        } else
          hurlRock(scene, Phaser.Math.Clamp(t.x + (i % 2 ? 30 : -30), 8, W - 8), t, () =>
            world.strike(t, 2 * power, 'skill', true, { slow: 1500 }),
          );
      }),
    );
    later(scene, 900, () => {
      for (let k = 0; k < 10; k++) {
        const rx = Phaser.Math.Between(6, W - 6);
        const r = scene.add.image(rx, -6, 'boulder').setDepth(13);
        scene.tweens.add({
          targets: r,
          y: FLOOR_Y - 3,
          angle: 360,
          delay: k * 40,
          duration: 380,
          ease: 'Quad.In',
          onComplete: () => (r.destroy(), rocks(scene, rx, FLOOR_Y, 3)),
        });
      }
      later(scene, 420, () => {
        cam.shake(200, 0.012);
        for (const t of world.targets(p.x, p.y)) world.strike(t, 0.8 * power, 'skill', false, { slow: 800 }, 60);
      });
    });
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

/** A vector as an (x, y) pair to spread into graphics calls. */
const xy = (v: Phaser.Math.Vector2): [number, number] => [v.x, v.y];

/** Heracles' crimson ki (the Hydra heads of Nine Lives): outline, body, lit ridge, and the gold of their eyes. */
export const HYDRA = { out: 0x2a0610, body: 0xb3122e, lit: 0xff004d, ridge: 0xff8a6e, eye: 0xffec27 } as const;

/**
 * A Doric column of cracked marble standing on (0, 0) and reaching up to -h: a dark outline, the shaft lit on one
 * edge and shaded on the other with its flutes in shadow, a stepped base, the capital and its slab, a bronze band
 * under the capital and a few cracks. Draw it in a container placed at its foot to raise it (scaleY) or topple it
 * (rotation) about the foot.
 */
export function greekPillar(g: Phaser.GameObjects.Graphics, h: number): void {
  const OUT = 0x1d1b24;
  const echinus = (grow: number) => [
    new Phaser.Math.Vector2(-5 - grow, -h + 8 + grow),
    new Phaser.Math.Vector2(5 + grow, -h + 8 + grow),
    new Phaser.Math.Vector2(8 + grow, -h + 4 - grow),
    new Phaser.Math.Vector2(-8 - grow, -h + 4 - grow),
  ];
  // Outline pass: base steps, shaft, capital, slab.
  g.fillStyle(OUT)
    .fillRect(-9, -5, 18, 5)
    .fillRect(-8, -7, 16, 3)
    .fillRect(-6, -h + 7, 12, h - 13)
    .fillPoints(echinus(1), true)
    .fillRect(-10, -h - 1, 20, 6);
  // Base: two steps of marble, lit on top.
  g.fillStyle(0x83769c).fillRect(-8, -4, 16, 4);
  g.fillStyle(0xc2c3c7).fillRect(-8, -4, 16, 1).fillRect(-7, -6, 14, 2);
  // The shaft: marble, a lit edge, the shaded side, the flutes in shadow.
  g.fillStyle(0xc2c3c7).fillRect(-5, -h + 8, 10, h - 14);
  g.fillStyle(0xfff1e8).fillRect(-5, -h + 8, 1, h - 14);
  g.fillStyle(0x83769c).fillRect(3, -h + 8, 2, h - 14);
  g.fillStyle(0x9d9aa8);
  for (const x of [-3, -1, 1]) g.fillRect(x, -h + 10, 1, h - 18);
  // Capital and slab, with the bronze band under them.
  g.fillStyle(0xc2c3c7).fillPoints(echinus(0), true);
  g.fillStyle(0xfff1e8).fillRect(-9, -h, 18, 1);
  g.fillStyle(0xc2c3c7).fillRect(-9, -h + 1, 18, 3);
  g.fillStyle(0xd08a50).fillRect(-5, -h + 9, 10, 1);
  // Cracks running into the shaft.
  g.lineStyle(1, OUT, 0.8);
  for (const k of [0.3, 0.55, 0.8]) {
    const y = -h * k;
    const side = k === 0.55 ? 1 : -1;
    g.beginPath()
      .moveTo(side * 5, y)
      .lineTo(side * 2, y + 2)
      .lineTo(side * 3, y + 5)
      .lineTo(0, y + 7)
      .strokePath();
  }
}

/**
 * A Hydra head of crimson ki at (x, y) pointing along `a`, `s` times its 12 px length: a horned crest, a long snout,
 * a gold eye, and the lower jaw dropped `open` 0..1 with white fangs. Dark outline, crimson body, a lit ridge. When it
 * points left the head mirrors, so its crest always stays on top.
 */
export function hydraHead(g: Phaser.GameObjects.Graphics, x: number, y: number, a: number, s: number, open: number, alpha = 1): void {
  const [c, sn] = [Math.cos(a), Math.sin(a)];
  const flip = c < 0 ? -1 : 1;
  // Local (u along the head, v down) to world.
  const P = (u: number, v: number) => new Phaser.Math.Vector2(x + (u * c - v * flip * sn) * s, y + (u * sn + v * flip * c) * s);
  // The lower jaw swings down about its hinge at (-2, 1).
  const ja = open * 0.7;
  const J = (u: number, v: number) => {
    const [du, dv] = [u + 2, v - 1];
    return P(-2 + du * Math.cos(ja) - dv * Math.sin(ja), 1 + du * Math.sin(ja) + dv * Math.cos(ja));
  };
  const jaw = [J(-3, 1), J(10, 1.5), J(9, 3), J(-3, 4)];
  const skull = [P(-5, -3), P(0, -4.5), P(4, -3.5), P(11, -1.5), P(12.5, 0), P(9, 1), P(-1, 1.5), P(-5, 2.5)];
  const crest = [
    [P(-4, -3), P(-11, -8), P(-6, -1.5)],
    [P(0, -4.5), P(-5, -9), P(2, -3.5)],
  ];
  // Fangs, shown once the jaws part.
  if (open > 0.15) {
    g.fillStyle(0xfff1e8, alpha);
    for (const u of [4, 7, 10]) g.fillTriangle(...xy(P(u - 0.8, 0.8)), ...xy(P(u + 0.8, 0.8)), ...xy(P(u, 2.6)));
    for (const u of [3, 6]) g.fillTriangle(...xy(J(u - 0.8, 1.5)), ...xy(J(u + 0.8, 1.5)), ...xy(J(u, -0.2)));
  }
  for (const pts of [jaw, skull, ...crest]) {
    g.fillStyle(HYDRA.body, alpha).fillPoints(pts, true);
    g.lineStyle(1, HYDRA.out, alpha).strokePoints(pts, true);
  }
  // The lit ridge along the brow and snout, the gold eye with its slit.
  g.lineStyle(1, HYDRA.ridge, alpha).lineBetween(...xy(P(-3, -3)), ...xy(P(4, -2.5)));
  g.lineStyle(1, HYDRA.lit, alpha).lineBetween(...xy(P(4, -2.5)), ...xy(P(11, -0.8)));
  const [ex, ey] = xy(P(2.5, -1.5));
  g.fillStyle(HYDRA.eye, alpha).fillCircle(ex, ey, Math.max(1, s * 1.1));
  g.fillStyle(HYDRA.out, alpha).fillRect(ex - 0.5, ey - 1, 1, 2);
}

/** A Hydra neck along `pts`: a dark outline, the crimson body and a lit stripe, `w` px thick. */
export function hydraNeck(g: Phaser.GameObjects.Graphics, pts: Phaser.Math.Vector2[], w: number, alpha = 1): void {
  for (const [lw, col] of [
    [w + 2, HYDRA.out],
    [w, HYDRA.body],
    [1, HYDRA.lit],
  ] as const) {
    g.lineStyle(lw, col, alpha).strokePoints(pts, false);
  }
}

/**
 * Oberon Vortigern's night: the void of the bottomless abyss, the black of his moth wings, the blue sheen on them, the
 * pale glow of his eyes and the dream, the scale dust of his moths.
 */
export const ABYSS = {
  void: 0x07060f,
  deep: 0x141030,
  wing: 0x1c1c28,
  sheen: 0x5b6ee1,
  glow: 0x9fb4ff,
  scale: 0xc8d4ff,
  eye: 0x7fe6ff,
} as const;

/** A tiny night insect at (x, y): two wings opening and closing with `flap` 0..1 and a black body. */
export function bug(g: Phaser.GameObjects.Graphics, x: number, y: number, flap: number, color: number = ABYSS.sheen, alpha = 1): void {
  const w = 0.6 + flap * 1.6;
  g.fillStyle(color, alpha)
    .fillTriangle(x, y, x - 2.2, y - w, x - 2.4, y + 0.6)
    .fillTriangle(x, y, x + 2.2, y - w, x + 2.4, y + 0.6);
  g.fillStyle(ABYSS.void, alpha).fillRect(x - 0.5, y - 1, 1, 2);
}

/**
 * Blanca, Oberon's white moth, seen from above at (x, y), `s` times a 16 px wingspan: pale forewings with blue veins
 * and grey eye-spots, smaller hindwings, a furred body and feathered antennae. `flap` 0..1 opens the wings.
 */
export function whiteMoth(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, flap: number, alpha = 1): void {
  const k = 0.35 + 0.65 * flap;
  const P = (u: number, v: number) => new Phaser.Math.Vector2(x + u * s * k, y + v * s);
  for (const side of [-1, 1]) {
    const fore = [P(0, -1), P(side * 4, -6), P(side * 8, -6), P(side * 9, -3), P(side * 6, 1)];
    const hind = [P(0, 0), P(side * 6, 1.5), P(side * 6, 5), P(side * 3, 6), P(side * 0.5, 3)];
    for (const pts of [hind, fore]) {
      g.fillStyle(0xfff1e8, alpha).fillPoints(pts, true);
      g.lineStyle(1, 0x83769c, alpha).strokePoints(pts, true);
    }
    g.lineStyle(1, ABYSS.scale, alpha).lineBetween(x, y - s, x + side * 7 * s * k, y - 4.5 * s);
    g.fillStyle(0x83769c, alpha).fillCircle(x + side * 5.5 * s * k, y - 3 * s, Math.max(0.8, s * 1.1));
    g.fillStyle(ABYSS.glow, alpha).fillCircle(x + side * 5.5 * s * k, y - 3 * s, Math.max(0.5, s * 0.5));
    g.lineStyle(1, 0xe6dccb, alpha).lineBetween(x, y - 3.5 * s, x + side * 2.5 * s, y - 7.5 * s);
  }
  g.fillStyle(0xe6dccb, alpha).fillEllipse(x, y + 0.5 * s, 2.4 * s, 7 * s);
  g.fillStyle(0xfff1e8, alpha).fillCircle(x, y - 3 * s, 1.3 * s);
}

/**
 * One of Vortigern's black moth wings from (x, y) on `side` (-1 left, 1 right), `s` times its 12 px reach: a ragged
 * forewing with a blue sheen along its leading edge and a pale eye-spot, a hindwing ending in a long tail. `flap` 0..1
 * spreads it.
 */
export function vortigernWing(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  side: number,
  s: number,
  flap: number,
  alpha = 1,
): void {
  const k = 0.55 + 0.45 * flap;
  const P = (u: number, v: number) => new Phaser.Math.Vector2(x + side * u * s * k, y + v * s);
  const fore = [P(0, 0), P(4, -7), P(10, -9), P(12, -6), P(10, -3), P(8, -1.5), P(9, 1), P(6, 0.5), P(6.5, 2.5), P(3, 2)];
  const hind = [P(0, 1), P(6, 3), P(7, 7), P(5.5, 12), P(4, 7), P(1, 4)];
  for (const pts of [hind, fore]) {
    g.fillStyle(ABYSS.wing, alpha).fillPoints(pts, true);
    g.lineStyle(1, 0x000000, alpha).strokePoints(pts, true);
  }
  g.lineStyle(1, ABYSS.sheen, alpha).strokePoints([P(0.5, -0.5), P(4, -6.5), P(10, -8.5), P(11.5, -6)], false);
  g.lineStyle(1, ABYSS.deep, alpha).lineBetween(...xy(P(1, 0)), ...xy(P(9, -5)));
  const [ex, ey] = xy(P(7.5, -4.5));
  g.fillStyle(ABYSS.sheen, alpha).fillCircle(ex, ey, Math.max(1, 1.4 * s));
  g.fillStyle(ABYSS.glow, alpha).fillCircle(ex, ey, Math.max(0.5, 0.7 * s));
}

/**
 * A black insect leg from (x0, y0) to its claw at (x1, y1), `w` px thick: two segments bent at a knee, bristles on
 * the outer edge, a blue sheen down its length and a hooked claw.
 */
export function insectLeg(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, w: number, alpha = 1): void {
  const [dx, dy] = [x1 - x0, y1 - y0];
  const len = Math.hypot(dx, dy) || 1;
  // The knee always arches upward, whichever way the leg reaches.
  const up = dx >= 0 ? 1 : -1;
  const [nx, ny] = [(up * dy) / len, (-up * dx) / len];
  const [kx, ky] = [x0 + dx * 0.45 + nx * len * 0.18, y0 + dy * 0.45 + ny * len * 0.18];
  for (const [lw, col] of [
    [w + 2, 0x000000],
    [w, ABYSS.wing],
    [1, ABYSS.sheen],
  ] as const) {
    g.lineStyle(lw, col, alpha).lineBetween(x0, y0, kx, ky).lineBetween(kx, ky, x1, y1);
  }
  g.fillStyle(0x000000, alpha).fillCircle(kx, ky, w * 0.8 + 1);
  // Bristles along the lower segment.
  g.lineStyle(1, 0x000000, alpha);
  for (let i = 1; i < 4; i++) {
    const [bx, by] = [kx + (x1 - kx) * (i / 4), ky + (y1 - ky) * (i / 4)];
    g.lineBetween(bx, by, bx + nx * 3, by + ny * 3);
  }
  // The hooked claw.
  g.fillStyle(0x000000, alpha).fillTriangle(
    x1,
    y1,
    x1 - nx * 3 - dx / len,
    y1 - ny * 3 - dy / len,
    x1 + (dx / len) * 3,
    y1 + (dy / len) * 3,
  );
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

/** The Dark Lord's soul fire, a `flameTongue` palette (rim, body, core), and the obsidian of his court. */
export const SOUL: readonly [number, number, number] = [0x0b6b3a, 0x3dff8f, 0xd8ffe8];
const OBSIDIAN = { rim: 0x000000, dark: 0x1a1424, body: 0x2b2238, lit: 0x4a3d5c } as const;
const V2 = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** The small crown of DOMINASI, its band's bottom at the container's origin: black iron, three spikes tipped in soul fire. */
function puppetCrown(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const pts = [
    V2(-5, 0),
    V2(-5, -3),
    V2(-4, -3),
    V2(-3.5, -7),
    V2(-2, -3),
    V2(0, -9),
    V2(2, -3),
    V2(3.5, -7),
    V2(4, -3),
    V2(5, -3),
    V2(5, 0),
  ];
  g.fillStyle(SOUL[1], 0.3).fillCircle(0, -4, 7);
  g.fillStyle(OBSIDIAN.rim).fillPoints(
    pts.map((v) => V2(v.x * 1.25, v.y * 1.15 + 0.5)),
    true,
  );
  g.fillStyle(OBSIDIAN.body).fillPoints(pts, true);
  g.lineStyle(1, 0xd4a017).lineBetween(-5, -1, 5, -1);
  g.fillStyle(SOUL[1]).fillRect(-0.5, -2, 1, 1);
  for (const [tx, ty] of [
    [-3.5, -7],
    [0, -9],
    [3.5, -7],
  ])
    g.fillStyle(SOUL[2]).fillRect(tx - 0.5, ty - 1, 1, 1);
  return scene.add.container(x, y, [g]).setDepth(14);
}

/**
 * A chain of soul fire on `g` from (x0, y0) to (x1, y1): oval iron links, alternately face-on and edge-on, black
 * outlined, each glowing green at its rim. `taut` 0-1 straightens its sag.
 */
export function soulChain(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, taut = 1, alpha = 1): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2) return;
  const n = Math.max(2, Math.round(len / 4));
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2 + (1 - taut) * Math.min(24, len * 0.2)];
  g.lineStyle(3, SOUL[1], 0.18 * alpha);
  let [px, py] = [x0, y0];
  for (let i = 1; i <= n; i++) {
    const [x, y] = bez(x0, y0, cx, cy, x1, y1, i / n);
    g.lineBetween(px, py, x, y);
    const a = Math.atan2(y - py, x - px);
    const [mx, my] = [(px + x) / 2, (py + y) / 2];
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    if (i % 2) {
      g.lineStyle(2, 0x000000, alpha).strokeEllipse(mx, my, 4.5, 3);
      g.lineStyle(1, i % 4 === 1 ? SOUL[1] : OBSIDIAN.lit, alpha).strokeEllipse(mx, my, 3.5, 2);
    } else {
      g.lineStyle(2, 0x000000, alpha).lineBetween(mx - ux * 2, my - uy * 2, mx + ux * 2, my + uy * 2);
      g.lineStyle(1, SOUL[2], alpha).lineBetween(mx - ux, my - uy, mx + ux, my + uy);
    }
    g.lineStyle(3, SOUL[1], 0.18 * alpha);
    [px, py] = [x, y];
  }
}

/**
 * A soldier of the dead legion on `g`, feet at (x, y), facing `d`, `step` (radians) swinging its stride: a skeleton
 * in a crested black helm, a tall obsidian tower shield with the Dark Lord's green sigil, a spear levelled forward.
 */
export function deadSoldier(g: Phaser.GameObjects.Graphics, x: number, y: number, d: number, step: number, alpha = 1): void {
  const bob = Math.abs(Math.sin(step)) * 1;
  const top = y - 18 - bob;
  // Legs: bone shins striding.
  const sw = Math.sin(step) * 3;
  g.lineStyle(2, 0x000000, alpha)
    .lineBetween(x - 1, top + 12, x - 1 + sw, y)
    .lineBetween(x + 1, top + 12, x + 1 - sw, y);
  g.lineStyle(1, 0xc2c3c7, alpha)
    .lineBetween(x - 1, top + 12, x - 1 + sw, y)
    .lineBetween(x + 1, top + 12, x + 1 - sw, y);
  // Ribcage and the skull under its crested helm, green eye-fire.
  g.fillStyle(0x000000, alpha).fillRect(x - 3, top + 4, 6, 9);
  g.fillStyle(0xc2c3c7, alpha).fillRect(x - 2, top + 5, 4, 7);
  g.fillStyle(0x000000, alpha)
    .fillRect(x - 2, top + 7, 4, 1)
    .fillRect(x - 2, top + 9, 4, 1);
  g.fillStyle(0x000000, alpha).fillCircle(x, top + 1, 3.6);
  g.fillStyle(0xfff1e8, alpha).fillCircle(x, top + 1.5, 2.6);
  g.fillStyle(OBSIDIAN.body, alpha).fillRect(x - 3, top - 3, 6, 3);
  g.fillStyle(SOUL[1], alpha).fillTriangle(x - d * 2, top - 3, x - d * 6, top - 7, x - d * 1, top - 6);
  g.fillStyle(SOUL[1], alpha).fillRect(x + d * 1 - 0.5, top + 1, 1, 1);
  // The spear, levelled past the shield.
  g.lineStyle(2, 0x000000, alpha).lineBetween(x - d * 6, top + 6, x + d * 16, top + 6);
  g.lineStyle(1, OBSIDIAN.lit, alpha).lineBetween(x - d * 6, top + 6, x + d * 14, top + 6);
  g.fillStyle(SOUL[2], alpha).fillTriangle(x + d * 14, top + 4, x + d * 14, top + 8, x + d * 19, top + 6);
  // The tower shield on its leading arm.
  const sx = x + d * 4;
  g.fillStyle(0x000000, alpha).fillRect(sx - 2.5, top + 1, 5, 15);
  g.fillStyle(OBSIDIAN.body, alpha).fillRect(sx - 1.5, top + 2, 3, 13);
  g.fillStyle(OBSIDIAN.lit, alpha).fillRect(sx - 1.5, top + 2, 1, 13);
  g.fillStyle(SOUL[1], alpha).fillRect(sx - 0.5, top + 6, 1, 4);
}

/**
 * A wraith of the dead legion on `g` at (x, y) facing `d`: a hooded black shroud trailing off into tatters, two green
 * eyes in the hood, a long lance levelled forward. The legion's front in the air.
 */
export function legionWraith(g: Phaser.GameObjects.Graphics, x: number, y: number, d: number, now: number, alpha = 1): void {
  const flap = Math.sin(now / 70 + x) * 2;
  g.fillStyle(SOUL[1], 0.15 * alpha).fillEllipse(x - d * 4, y + 1, 22, 12);
  g.fillStyle(0x000000, alpha).fillTriangle(x - d * 3, y - 7, x + d * 5, y + 4, x - d * 16, y + 4 + flap);
  g.fillStyle(OBSIDIAN.body, alpha).fillTriangle(x - d * 3, y - 5, x + d * 3, y + 3, x - d * 13, y + 3 + flap);
  g.fillStyle(0x000000, alpha).fillCircle(x, y - 4, 4);
  g.fillStyle(OBSIDIAN.dark, alpha).fillCircle(x + d * 0.5, y - 4, 3);
  g.fillStyle(SOUL[2], alpha)
    .fillRect(x + d * 1 - 0.5, y - 5, 1, 1)
    .fillRect(x + d * 2.5 - 0.5, y - 5, 1, 1);
  g.lineStyle(2, 0x000000, alpha).lineBetween(x - d * 8, y + 1, x + d * 18, y - 1);
  g.lineStyle(1, OBSIDIAN.lit, alpha).lineBetween(x - d * 8, y + 1, x + d * 16, y - 1);
  g.fillStyle(SOUL[2], alpha).fillTriangle(x + d * 16, y - 3, x + d * 16, y + 1, x + d * 22, y - 1.5);
}

/**
 * The legion's war banner planted at (x, y) (pole foot), facing `d`: a black pole with a horned skull finial in soul
 * fire and a tattered obsidian standard with the green sigil, rippling in the wind of the march.
 */
export function warBanner(g: Phaser.GameObjects.Graphics, x: number, y: number, d: number, now: number, alpha = 1): void {
  const top = y - 44;
  g.lineStyle(3, 0x000000, alpha).lineBetween(x, y, x, top);
  g.lineStyle(1, OBSIDIAN.lit, alpha).lineBetween(x, y, x, top);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 6; i++) pts.push(V2(x - d * i * 3.5, top + 3 + Math.sin(now / 90 + i * 0.9) * i * 0.4));
  for (let i = 6; i >= 0; i--) {
    const tatter = i % 2 ? 4 : 0;
    pts.push(V2(x - d * i * 3.5, top + 20 + tatter + Math.sin(now / 90 + i * 0.9) * i * 0.4));
  }
  g.fillStyle(0x000000, alpha).fillPoints(
    pts.map((v) => V2(v.x + (v.x === x ? 0 : -d), v.y)),
    true,
  );
  g.fillStyle(OBSIDIAN.body, alpha).fillPoints(pts, true);
  const [mx, my] = [x - d * 10, top + 12 + Math.sin(now / 90 + 2.7) * 1.2];
  g.lineStyle(1, SOUL[1], alpha).strokeCircle(mx, my, 4);
  g.fillStyle(SOUL[2], alpha).fillTriangle(mx - 2, my + 1.5, mx + 2, my + 1.5, mx, my - 2.5);
  // The finial: a horned skull with soul fire burning above it.
  g.fillStyle(0x000000, alpha).fillCircle(x, top - 2, 3.2);
  g.fillStyle(0xfff1e8, alpha).fillCircle(x, top - 2, 2.3);
  g.fillStyle(SOUL[1], alpha)
    .fillRect(x - 1.5, top - 3, 1, 1)
    .fillRect(x + 0.5, top - 3, 1, 1);
  g.lineStyle(1, 0xc2c3c7, alpha)
    .lineBetween(x - 2, top - 4, x - 4, top - 7)
    .lineBetween(x + 2, top - 4, x + 4, top - 7);
  const h = 5 + Math.abs(Math.sin(now / 60)) * 3;
  g.fillStyle(SOUL[0], alpha).fillTriangle(x - 3, top - 5, x + 3, top - 5, x, top - 5 - h - 2);
  g.fillStyle(SOUL[1], alpha).fillTriangle(x - 2, top - 5, x + 2, top - 5, x, top - 5 - h);
}

/**
 * The Dark Lord's throne, drawn up from its base at the container's origin (scale it in y to raise it out of the
 * floor): a pointed obsidian back with three spires, a horned skull at its crown with soul fire in its eyes, runes
 * of soul fire carved down the panel, skull-capped armrests, a seat and clawed feet. Returns the container and the
 * spire tips (local) where its flames burn.
 */
export function darkThrone(scene: Phaser.Scene, x: number, y: number): { c: Phaser.GameObjects.Container; tips: [number, number][] } {
  const g = scene.add.graphics();
  const back = [V2(-13, -12), V2(-13, -40), V2(-9, -47), V2(-5, -42), V2(0, -56), V2(5, -42), V2(9, -47), V2(13, -40), V2(13, -12)];
  g.fillStyle(SOUL[1], 0.15).fillEllipse(0, -30, 46, 64);
  g.fillStyle(OBSIDIAN.rim).fillPoints(
    back.map((v) => V2(v.x * 1.12, v.y * 1.04 + 0.5)),
    true,
  );
  g.fillStyle(OBSIDIAN.dark).fillPoints(back, true);
  g.fillStyle(OBSIDIAN.body).fillPoints(
    back.map((v) => V2(v.x * 0.72, v.y * 0.92 - 1)),
    true,
  );
  g.lineStyle(1, OBSIDIAN.lit).lineBetween(-13, -14, -13, -40).lineBetween(-13, -40, -9, -47).lineBetween(-5, -42, 0, -56);
  // Runes of soul fire down the panel.
  g.lineStyle(1, SOUL[1], 0.75).lineBetween(0, -36, 0, -16);
  for (let i = 0; i < 4; i++) {
    const ry = -33 + i * 5;
    g.lineBetween(-3, ry, 0, ry + 2).lineBetween(3, ry, 0, ry + 2);
  }
  // The horned skull at its crown.
  g.lineStyle(1, 0xc2c3c7).lineBetween(-3, -45, -7, -50).lineBetween(3, -45, 7, -50);
  g.fillStyle(OBSIDIAN.rim).fillCircle(0, -43, 4.2);
  g.fillStyle(0xfff1e8).fillCircle(0, -43, 3.3);
  g.fillStyle(0xc2c3c7).fillRect(-2, -40.5, 4, 2);
  g.fillStyle(SOUL[1]).fillRect(-2, -44, 1.5, 1.5).fillRect(0.5, -44, 1.5, 1.5);
  // Armrests with skull caps, the seat and the clawed feet.
  for (const s of [-1, 1]) {
    g.fillStyle(OBSIDIAN.rim).fillRect(s > 0 ? 11 : -18, -23, 7, 13);
    g.fillStyle(OBSIDIAN.body).fillRect(s > 0 ? 12 : -17, -22, 5, 12);
    g.fillStyle(0xfff1e8).fillCircle(s * 14.5, -23, 2.3);
    g.fillStyle(SOUL[1]).fillRect(s * 14.5 - 1, -23.5, 1, 1);
    g.fillStyle(OBSIDIAN.rim).fillTriangle(s * 15, 0, s * 11, -5, s * 19, -1);
  }
  g.fillStyle(OBSIDIAN.rim).fillRect(-16, -14, 32, 15);
  g.fillStyle(OBSIDIAN.body).fillRect(-15, -13, 30, 4);
  g.fillStyle(OBSIDIAN.dark).fillRect(-15, -9, 30, 9);
  g.fillStyle(OBSIDIAN.lit).fillRect(-15, -13, 30, 1);
  g.lineStyle(1, SOUL[1], 0.6).lineBetween(-12, -5, 12, -5);
  g.fillStyle(0xb3122e).fillCircle(0, -5, 1.5);
  const c = scene.add.container(x, y, [g]);
  return {
    c,
    tips: [
      [0, -56],
      [-9, -47],
      [9, -47],
    ],
  };
}

/** A geyser of soul fire bursting out of the floor at (x, y): a tall green tongue, a smaller one inside, embers flung up. */
export function soulGeyser(scene: Phaser.Scene, x: number, y: number, h: number): void {
  flameTongue(scene, x, y, h, 420, SOUL);
  flameTongue(scene, x + Phaser.Math.Between(-2, 2), y, h * 0.6, 320, SOUL);
  for (let i = 0; i < 4; i++) {
    const e = scene.add.rectangle(x + Phaser.Math.Between(-3, 3), y - 2, 1, 2, i % 2 ? SOUL[1] : SOUL[2]).setDepth(15);
    scene.tweens.add({ targets: e, y: y - h - Phaser.Math.Between(4, 14), alpha: 0, duration: 450, onComplete: () => e.destroy() });
  }
}

/** A sigil of soul fire at (x, y): two rings, eight rune ticks and a turning triangle; it opens, turns and fades over `ms`. */
export function soulSigil(scene: Phaser.Scene, x: number, y: number, r: number, ms: number): void {
  const g = scene.add.graphics();
  g.lineStyle(3, SOUL[1], 0.25).strokeCircle(0, 0, r);
  g.lineStyle(1, SOUL[1])
    .strokeCircle(0, 0, r)
    .strokeCircle(0, 0, r * 0.62);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    g.lineStyle(1, i % 2 ? SOUL[2] : SOUL[1]).lineBetween(c * r * 0.68, s * r * 0.68, c * r * 0.94, s * r * 0.94);
  }
  const tri = [0, 1, 2].map((i) =>
    V2(Math.cos(-Math.PI / 2 + (i * Math.PI * 2) / 3) * r * 0.6, Math.sin(-Math.PI / 2 + (i * Math.PI * 2) / 3) * r * 0.6),
  );
  g.lineStyle(1, SOUL[2], 0.9).strokePoints(tri, true);
  const c = scene.add.container(x, y, [g]).setDepth(13).setScale(0);
  scene.tweens.add({ targets: c, scale: 1, duration: 140, ease: 'Back.Out' });
  scene.tweens.add({ targets: c, angle: 120, duration: ms });
  scene.tweens.add({ targets: c, alpha: 0, scale: 1.3, delay: ms - 200, duration: 200, onComplete: () => c.destroy() });
}

/** The Light Lord's radiance: deep gold, gold, ivory and white-hot. */
export const RADIANT = { deep: 0xd4a017, gold: 0xffec27, ivory: 0xffe9a8, white: 0xfff1e8 } as const;

/** A thin ray of the Light Lord's light from (x1, y1) to (x2, y2): an ivory glow, a gold body, a white core; it fades. */
export function dawnRay(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number, ms = 260, width = 1): void {
  const g = scene.add.graphics().setDepth(14);
  for (const [w, c, a] of [
    [5 * width, RADIANT.ivory, 0.3],
    [2 * width, RADIANT.gold, 1],
    [width, RADIANT.white, 1],
  ] as const)
    g.lineStyle(w, c, a).lineBetween(x1, y1, x2, y2);
  scene.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
}

/** Points of a five-pointed star of radius r about (0, 0), its first point straight up, turned by `rot`. */
export function starPts(r: number, rot = 0): Phaser.Math.Vector2[] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.42 : r;
    return V2(Math.cos(a) * d, Math.sin(a) * d);
  });
}

/**
 * An eye of the Ophanim at (x, y), `w` px wide: a gold-lidded almond of white with a gold iris and a dark pupil, open by
 * `open` (0 shut .. 1 wide), its iris turned toward `look` (radians). Eyes under 5 px are two pixels and a pupil.
 */
export function ophanEye(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  open: number,
  look = Math.PI / 2,
  alpha = 1,
): void {
  if (w < 5) {
    if (open < 0.3) return void g.fillStyle(RADIANT.deep, alpha).fillRect(x - 1, y, 2, 1);
    g.fillStyle(RADIANT.white, alpha).fillRect(x - 1, y - 0.5, 2, 1);
    g.fillStyle(0x1d1a2a, alpha).fillRect(x - 0.5 + Math.cos(look) * 0.5, y - 0.5, 1, 1);
    return;
  }
  if (open < 0.08) return void g.lineStyle(1, RADIANT.deep, alpha).lineBetween(x - w / 2, y, x + w / 2, y);
  const h = w * 0.42 * open;
  const lid = (s: number) =>
    Array.from({ length: 9 }, (_, i) => {
      const u = -1 + i / 4;
      return V2(x + (u * w) / 2, y + s * h * (1 - u * u));
    });
  const almond = [...lid(-1), ...lid(1).reverse()];
  g.fillStyle(RADIANT.ivory, 0.25 * alpha).fillEllipse(x, y, w + 4, h * 2 + 4);
  g.fillStyle(RADIANT.white, alpha).fillPoints(almond, true);
  const ir = Math.min(h * 0.9, w * 0.22);
  const [ix, iy] = [x + Math.cos(look) * w * 0.18, y + Math.sin(look) * h * 0.3];
  g.fillStyle(RADIANT.gold, alpha).fillCircle(ix, iy, ir);
  g.fillStyle(RADIANT.deep, alpha).fillCircle(ix, iy, ir * 0.7);
  g.fillStyle(0x1d1a2a, alpha).fillCircle(ix, iy, ir * 0.4);
  g.fillStyle(RADIANT.white, alpha).fillRect(ix - ir * 0.5, iy - ir * 0.6, 1, 1);
  g.lineStyle(1, RADIANT.deep, alpha).strokePoints(almond, true);
}

/**
 * The Ophanim, "wheels within wheels, their rims full of eyes": `n` gold rings of radius R crossed through each other
 * round (cx, cy) and turning in depth with `rot`. Each rim carries `eyes` eyes `ew` px wide, open by `open`; `look`
 * gives each eye where its iris turns (from the eye's own position). The far side of each wheel is dimmer.
 */
export function ophanim(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  R: number,
  n: number,
  rot: number,
  eyes: number,
  ew: number,
  open: number,
  look: (x: number, y: number) => number = () => Math.PI / 2,
  alpha = 1,
): void {
  const at = (j: number, u: number): [number, number, number] => {
    const phi = (j % 2 ? -rot : rot) + (j / n) * Math.PI;
    const th = n > 1 ? -0.6 + (1.2 * j) / (n - 1) : 0;
    const [x, y, z] = [R * Math.cos(u) * Math.cos(phi), R * Math.sin(u), R * Math.cos(u) * Math.sin(phi)];
    return [cx + x * Math.cos(th) - y * Math.sin(th), cy + x * Math.sin(th) + y * Math.cos(th), z / R];
  };
  const SEG = 28;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < SEG; i++) {
      const [x0, y0, z] = at(j, (i / SEG) * Math.PI * 2);
      const [x1, y1] = at(j, ((i + 1) / SEG) * Math.PI * 2);
      const a = alpha * (0.55 + 0.45 * z);
      g.lineStyle(R > 10 ? 3 : 2, RADIANT.deep, a).lineBetween(x0, y0, x1, y1);
      g.lineStyle(1, z > -0.2 ? RADIANT.gold : RADIANT.deep, a).lineBetween(x0, y0, x1, y1);
    }
  for (let j = 0; j < n; j++)
    for (let k = 0; k < eyes; k++) {
      const [x, y, z] = at(j, (k / eyes) * Math.PI * 2 + j * 0.7);
      if (z < -0.5) continue;
      ophanEye(g, x, y, ew * (0.75 + 0.25 * z), open, look(x, y), alpha * (0.6 + 0.4 * z));
    }
}

/** Obito's palette: the mask orange, and Kamui's warp (void, dusk violet, ash, pale edge). */
export const KAMUI = { mask: 0xe0601a, void: 0x0d0a14, dark: 0x3a3450, mid: 0x83769c, pale: 0xc2c3c7 } as const;

/**
 * Kamui's warp drawn on `g` at (x, y): space wound into three spiral arms (dark rim, violet body, pale edge) around a
 * black eye, `r` px across, turned by `rot`; `squash` flattens it (a warp lying on the floor).
 */
export function kamuiSwirl(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, rot: number, alpha = 1, squash = 1): void {
  if (r <= 0.5) return;
  for (const [w, c, al] of [
    [3, KAMUI.dark, 0.6],
    [2, KAMUI.mid, 0.9],
    [1, KAMUI.pale, 1],
  ] as const) {
    g.lineStyle(w, c, al * alpha);
    for (let arm = 0; arm < 3; arm++) {
      g.beginPath();
      for (let i = 0; i <= 14; i++) {
        const k = i / 14;
        const a = rot + (arm * Math.PI * 2) / 3 + k * 4.2;
        const rr = r * (0.15 + 0.85 * k);
        const [px, py] = [x + Math.cos(a) * rr, y + Math.sin(a) * rr * squash];
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.strokePath();
    }
  }
  g.fillStyle(KAMUI.void, alpha).fillEllipse(x, y, Math.max(2, r * 0.4), Math.max(1, r * 0.4 * squash));
}

/**
 * Obito's chain drawn on `g` from (x0, y0) to (x1, y1), sagging `sag` px at its middle: iron links one after another,
 * an edge-on bar then a face-on ring (black outline, iron body, pale glint). `ghost`: the chain while it is
 * intangible, a faint violet line only.
 */
export function kamuiChain(
  g: Phaser.GameObjects.Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sag: number,
  ghost = false,
  alpha = 1,
): void {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2 + sag];
  let [px, py] = [x0, y0];
  for (let i = 1; i <= n; i++) {
    const [x, y] = bez(x0, y0, cx, cy, x1, y1, i / n);
    if (ghost) g.lineStyle(1, i % 2 ? KAMUI.mid : KAMUI.pale, 0.55 * alpha).lineBetween(px, py, x, y);
    else if (i % 2) {
      g.lineStyle(3, 0x000000, alpha).lineBetween(px, py, x, y);
      g.lineStyle(1, 0x5f574f, alpha).lineBetween(px, py, x, y);
    } else {
      const [mx, my] = [(px + x) / 2, (py + y) / 2];
      g.lineStyle(1, 0x000000, alpha).strokeCircle(mx, my, 1.6);
      g.fillStyle(KAMUI.pale, alpha).fillRect(mx - 0.5, my - 1.5, 1, 1);
    }
    [px, py] = [x, y];
  }
}

/** An iron shackle at (x, y), `r` px: black ring, iron band, a pale glint, its hinge pin with an orange rivet. */
export function shackle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha = 1): void {
  g.lineStyle(3, 0x000000, alpha).strokeCircle(x, y, r);
  g.lineStyle(1, KAMUI.mid, alpha).strokeCircle(x, y, r);
  g.fillStyle(KAMUI.pale, alpha).fillRect(x - r * 0.7, y - r * 0.7, 1, 1);
  g.fillStyle(0x000000, alpha).fillRect(x + r - 1, y - 1, 3, 3);
  g.fillStyle(KAMUI.mask, alpha).fillRect(x + r, y, 1, 1);
}

/** Chakra receivers stuck in enemies (Pain's BATANG PENERIMA): how many `t` carries (0-3). */
export const rodsIn = (t: Phaser.GameObjects.Sprite): number => (t.active ? ((t.getData('rods') as number | undefined) ?? 0) : 0);

const rodLayer = new WeakMap<Phaser.Scene, Phaser.GameObjects.Graphics>();

/**
 * Drive `n` chakra receivers into `t` (max 3). They stay in it, drawn sticking out of its back at their own angles,
 * until Bansho Ten'in tears them out; one layer per scene draws every enemy's receivers.
 */
export function plantRod(world: PlayerWorld, scene: Phaser.Scene, t: Phaser.GameObjects.Sprite, n = 1): void {
  if (!t.active) return;
  const had = rodsIn(t);
  t.setData('rods', Math.min(3, had + n));
  if (had < 3) sparks(scene, t.x, t.y - 3, [0x000000, RIKUDO.lilac], 3, 6);
  if (rodLayer.has(scene)) return;
  const g = scene.add.graphics().setDepth(11);
  rodLayer.set(scene, g);
  const ANG = [-2.2, -1.2, -2.8];
  const draw = () => {
    g.clear();
    for (const o of world.targets(W / 2, FLOOR_Y)) {
      const k = rodsIn(o);
      for (let i = 0; i < k; i++) {
        // Mirrored with the way it faces, so they always jut out of its back.
        const [ux, uy] = [Math.cos(ANG[i]) * (o.flipX ? -1 : 1), Math.sin(ANG[i])];
        const [ix, iy] = [o.x + ux * 2, o.y - 1 + uy * 2];
        receiverRod(g, ix + ux * 8, iy + uy * 8, ix, iy);
      }
    }
  };
  scene.events.on('update', draw);
  scene.events.once('shutdown', () => {
    scene.events.off('update', draw);
    rodLayer.delete(scene);
  });
}

/**
 * The artificial moon of Chibaku Tensei on `g` at (x, y), radius `r`, turned by `rot`: a lumpy ball of torn earth,
 * a black outline round a jagged rim, rock mid-tone lit from the upper left, craters and strata, and (as `glow` goes
 * 0 to 1) seams of lilac chakra cracking across it from the black core inside.
 */
export function chibakuMoon(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, rot: number, glow = 0): void {
  if (r < 1) return;
  const N = 28;
  const rim = (grow: number) =>
    Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      const lump = 1 + 0.09 * Math.sin(a * 5 + 1.3) + 0.06 * Math.sin(a * 9 + rot * 2);
      return new Phaser.Math.Vector2(x + Math.cos(a + rot) * (r * lump + grow), y + Math.sin(a + rot) * (r * lump + grow));
    });
  g.fillStyle(0x000000).fillPoints(rim(2), true);
  g.fillStyle(0x5f574f).fillPoints(rim(0), true);
  g.fillStyle(0x7d6f62).fillEllipse(x - r * 0.25, y - r * 0.25, r * 1.3, r * 1.2);
  g.fillStyle(0xab9f91).fillEllipse(x - r * 0.42, y - r * 0.45, r * 0.55, r * 0.4);
  g.fillStyle(0x3b342f).fillEllipse(x + r * 0.35, y + r * 0.4, r * 0.9, r * 0.7);
  // Strata: torn layers of earth curving round the ball.
  for (let i = 0; i < 3; i++)
    g.lineStyle(1, i % 2 ? 0xab5236 : 0x3b342f, 0.8)
      .beginPath()
      .arc(x, y, r * (0.45 + i * 0.17), rot + i * 1.7, rot + i * 1.7 + 1.4)
      .strokePath();
  // Craters, turning with it.
  for (const [d, a, s] of [
    [0.55, 0.4, 0.22],
    [0.3, 2.6, 0.16],
    [0.7, 4.1, 0.14],
    [0.15, 5.2, 0.1],
  ]) {
    const [cx, cy] = [x + Math.cos(a + rot) * r * d, y + Math.sin(a + rot) * r * d];
    g.fillStyle(0x000000, 0.6).fillCircle(cx, cy, r * s);
    g.fillStyle(0x3b342f).fillCircle(cx + 0.5, cy + 0.5, r * s * 0.8);
    g.lineStyle(1, 0xab9f91, 0.7)
      .beginPath()
      .arc(cx, cy, r * s, Math.PI * 0.9, Math.PI * 1.6)
      .strokePath();
  }
  if (glow <= 0) return;
  // The core's chakra breaking through: jagged seams from the middle out to the rim.
  for (let i = 0; i < 6; i++) {
    let a = (i / 6) * Math.PI * 2 + rot * 0.5;
    let [px, py] = [x, y];
    for (let j = 1; j <= 4; j++) {
      a += Math.sin(i * 7 + j * 3) * 0.5;
      const d = r * glow * (j / 4);
      const [nx, ny] = [x + Math.cos(a) * d, y + Math.sin(a) * d];
      g.lineStyle(3, RIKUDO.ring, 0.8).lineBetween(px, py, nx, ny);
      g.lineStyle(1, RIKUDO.pale).lineBetween(px, py, nx, ny);
      [px, py] = [nx, ny];
    }
  }
}

/** One stroke of a polyline from `a` to `b` (bodies drawn as many short strokes, tapering along their length). */
export const seg = (g: Phaser.GameObjects.Graphics, a: [number, number], b: [number, number], w: number, c: number, alpha: number) =>
  g.lineStyle(w, c, alpha).lineBetween(a[0], a[1], b[0], b[1]);

/** Pain's palette: the Rinnegan's lilac and its dark rings, the black of the chakra receivers, the orange of his hair. */
export const RIKUDO = { lilac: 0xb39ddb, ring: 0x5b4a8a, pale: 0xe8e0ff, rod: 0x16141c, hair: 0xffa300 } as const;

/** The Rinnegan at (x, y), `r` px: a lilac iris in concentric dark rings around a black pupil. */
export function rinnegan(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha = 1): void {
  if (r < 1) return;
  g.fillStyle(0x000000, alpha).fillCircle(x, y, r + 1);
  g.fillStyle(RIKUDO.lilac, alpha).fillCircle(x, y, r);
  for (let i = 1; i <= 3; i++) if (r * (i / 4) >= 1) g.lineStyle(1, RIKUDO.ring, alpha).strokeCircle(x, y, r * (i / 4));
  g.fillStyle(0x000000, alpha).fillCircle(x, y, Math.max(0.5, r * 0.12));
}

/**
 * A chakra receiver rod on `g`, from (x0, y0) to its point at (x1, y1): a black shaft with a pale glint, ringed
 * segments, a knobbed butt and a sharp tip.
 */
export function receiverRod(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, alpha = 1): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
  g.lineStyle(3, 0x000000, alpha).lineBetween(x0, y0, x1, y1);
  g.lineStyle(1, 0x5f574f, alpha).lineBetween(x0 - uy * 0.5, y0 + ux * 0.5, x1 - ux * 2, y1 - uy * 2);
  for (let d = 4; d < len - 4; d += 6) g.fillStyle(RIKUDO.ring, alpha).fillRect(x0 + ux * d - 1, y0 + uy * d - 1, 2, 2);
  g.fillStyle(0x000000, alpha).fillCircle(x0, y0, 2);
  g.fillStyle(RIKUDO.lilac, alpha).fillRect(x0 - 0.5, y0 - 0.5, 1, 1);
  g.fillStyle(0xfff1e8, alpha).fillRect(x1 - 0.5, y1 - 0.5, 1, 1);
}

/**
 * Shinra Tensei: a sphere of repulsion bursts out of (x, y) to radius `r`. Enemy shots inside it are swatted out of
 * the air, every enemy inside takes `mult` and is hurled straight away from the center (a boss, too heavy, only takes
 * the blow). One hurled into a wall or the ceiling within 0.6 s slams into it: BENTUR, a second, harder blow
 * (`slam`), the wall cracking where it hits. Returns how many enemies it caught.
 */
export function shinraTensei(
  world: PlayerWorld,
  scene: Phaser.Scene,
  x: number,
  y: number,
  r: number,
  mult: number,
  slam: number,
  source: HitSource,
): number {
  // The force itself: an invisible sphere seen only as the air bending at its edge, the floor rippling, dust thrown.
  const g = scene.add.graphics().setDepth(13);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 380,
    ease: 'Quad.Out',
    onUpdate: (tw) => {
      const k = tw.getValue() ?? 0;
      g.clear();
      const rr = r * k;
      g.fillStyle(RIKUDO.pale, 0.12 * (1 - k)).fillCircle(x, y, rr);
      g.lineStyle(3, RIKUDO.lilac, 0.5 * (1 - k)).strokeCircle(x, y, rr);
      g.lineStyle(1, 0xfff1e8, 0.9 * (1 - k)).strokeCircle(x, y, rr);
      g.lineStyle(1, RIKUDO.lilac, 0.6 * (1 - k)).strokeCircle(x, y, rr * 0.7);
      if (Math.abs(FLOOR_Y - y) < r) g.lineStyle(1, 0xfff1e8, 0.7 * (1 - k)).strokeEllipse(x, FLOOR_Y, rr * 2, 4);
    },
    onComplete: () => g.destroy(),
  });
  if (Math.abs(FLOOR_Y - y) < r)
    for (let i = 0; i < 12; i++) {
      const d = scene.add.rectangle(x + Phaser.Math.Between(-6, 6), FLOOR_Y - 1, 2, 2, i % 3 ? 0x5f574f : 0xab5236).setDepth(12);
      const dir = i % 2 ? 1 : -1;
      scene.tweens.add({
        targets: d,
        x: d.x + dir * Phaser.Math.Between(30, r),
        y: d.y - Phaser.Math.Between(4, 18),
        alpha: 0,
        duration: 420,
        ease: 'Quad.Out',
        onComplete: () => d.destroy(),
      });
    }
  for (const h of world.hostiles()) {
    if (!h.active || Phaser.Math.Distance.Between(x, y, h.x, h.y) > r) continue;
    sparks(scene, h.x, h.y, [RIKUDO.pale, RIKUDO.lilac], 4, 8);
    h.destroy();
  }
  const caught = world.targets(x, y).filter((t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) <= r);
  for (const t of caught) {
    world.strike(t, mult, source, false, undefined, 0);
    if (!t.active || 'tier' in t) continue;
    const e = t as Phaser.GameObjects.Sprite & { stunUntil: number; flying?: boolean };
    const body = t.body as Phaser.Physics.Arcade.Body;
    const a = Math.atan2(t.y - y, t.x - x);
    const dir = Math.sign(t.x - x) || 1;
    e.stunUntil = scene.time.now + 600;
    if (e.flying) body.setVelocity(Math.cos(a) * 380, Math.sin(a) * 380);
    else body.setVelocity(dir * 380, -170);
    let done = false;
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 600,
      onUpdate: () => {
        if (done || !t.active) return;
        const wall = body.blocked.left || body.blocked.right || body.blocked.up || t.x < 10 || t.x > W - 10 || t.y < 12;
        if (!wall) return;
        done = true;
        // BENTUR: it hits the wall, which cracks in a star around the impact.
        const [cx, cy] = [Phaser.Math.Clamp(t.x, 2, W - 2), t.y];
        const c = scene.add.graphics().setDepth(12);
        for (let i = 0; i < 6; i++) {
          const ca = (i / 6) * Math.PI * 2;
          c.lineStyle(1, 0x000000).lineBetween(
            cx,
            cy,
            cx + Math.cos(ca) * Phaser.Math.Between(5, 11),
            cy + Math.sin(ca) * Phaser.Math.Between(5, 11),
          );
        }
        scene.tweens.add({ targets: c, alpha: 0, delay: 500, duration: 300, onComplete: () => c.destroy() });
        sparks(scene, cx, cy, [0xfff1e8, 0x5f574f, RIKUDO.lilac], 8, 12);
        scene.cameras.main.shake(100, 0.01);
        floatText(scene, Phaser.Math.Clamp(cx, 22, W - 22), cy - 12, 'BENTUR', '#b39ddb');
        world.strike(t, slam, source, true, undefined, 0);
      },
    });
  }
  return caught.length;
}

/**
 * A summoned beast of the Animal Path drawn on `g` facing `f`, `flap` 0-1 beating its wings: the giant bird Pain rides
 * (his dash), dark plumage with a pale belly, a hooked beak and the Rinnegan for an eye, the black receivers through
 * its crest.
 */
export function summonBird(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, flap: number): void {
  const wy = -10 + flap * 16;
  for (const [grow, col] of [
    [1, 0x000000],
    [0, 0x3b3b4f],
  ] as const) {
    g.fillStyle(col).fillTriangle(x - f * 4, y - 1 - grow, x + f * 6, y - 1 - grow, x - f * 10, y + wy - grow);
    g.fillTriangle(x - f * 2, y - 1 - grow, x + f * 8, y - 1 - grow, x + f * 2, y + wy * 0.8 - grow);
    g.fillEllipse(x, y + 2, 22 + grow * 2, 9 + grow * 2);
    g.fillTriangle(x - f * 10, y, x - f * 18, y - 3 - grow, x - f * 17, y + 4 + grow);
    g.fillCircle(x + f * 11, y - 1, 4 + grow);
  }
  g.fillStyle(0xc2c3c7).fillEllipse(x + f * 2, y + 4, 12, 3);
  g.fillStyle(0xffa300).fillTriangle(x + f * 14, y - 2, x + f * 14, y + 1, x + f * 19, y + 1);
  g.fillStyle(0x000000).fillRect(x + f * 14, y, 5 * f, 1);
  rinnegan(g, x + f * 12, y - 2, 1.5);
  g.lineStyle(1, 0x000000)
    .lineBetween(x + f * 9, y - 5, x + f * 7, y - 9)
    .lineBetween(x + f * 11, y - 5, x + f * 11, y - 10);
}

/**
 * Antares, King of Dragons and Monarch of Destruction (Solo Leveling): a red dragon. Scale outline, crimson scales, the
 * bright edge of a scale catching fire-light, the molten belly, bone-silver horns, the glowing eye, and the black-red
 * ash of the Flames of Destruction.
 */
export const DESTRUCTION = {
  outline: 0x2a0508,
  membrane: 0x7a2230,
  scale: 0xb3122e,
  edge: 0xff004d,
  belly: 0xffa300,
  glow: 0xffec27,
  horn: 0xc2c3c7,
  ash: 0x1d0f2e,
} as const;

/**
 * A dragon's head drawn into `g`, facing `f`, its skull at (x, y), `s` pixels per unit, the lower jaw dropped by `open`
 * (0 shut, 1 wide, the throat lit). The neck runs back and down from the skull.
 */
export function dragonHead(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, s: number, open = 0): void {
  const P = (px: number, py: number) => new Phaser.Math.Vector2(x + f * px * s, y + py * s);
  const Q = (px: number, py: number): [number, number] => [x + f * px * s, y + py * s];
  const D = DESTRUCTION;
  const shape = (pts: [number, number][], fill: number, line: number = D.outline) => {
    const v = pts.map(([a, b]) => P(a, b));
    g.fillStyle(fill).fillPoints(v, true);
    g.lineStyle(Math.max(1, s * 0.6), line).strokePoints(v, true);
  };
  // The neck, thick and scaled, with spines down its top.
  shape(
    [
      [-7, -3],
      [-20, 7],
      [-15, 11],
      [-4, 3],
    ],
    D.scale,
  );
  for (let i = 0; i < 3; i++) {
    const [a, b] = [-9 - i * 4, -1 + i * 3];
    shape(
      [
        [a, b],
        [a - 3, b - 4],
        [a - 2, b + 1],
      ],
      D.membrane,
    );
  }
  // The lower jaw, swung down from its hinge; the throat burns inside it.
  const drop = open * 6;
  if (open > 0)
    shape(
      [
        [-4, 1],
        [13, 1],
        [12, 1 + drop],
      ],
      D.edge,
      D.belly,
    );
  shape(
    [
      [-5, 1],
      [12, 2 + drop],
      [11, 4 + drop],
      [-3, 4],
    ],
    D.scale,
  );
  if (open > 0.3)
    for (let i = 0; i < 4; i++) {
      const tx = 2 + i * 2.6;
      g.fillStyle(0xfff1e8).fillTriangle(
        ...Q(tx, 1 + drop * (tx / 13)),
        ...Q(tx + 1, 1 + drop * (tx / 13)),
        ...Q(tx + 0.5, -0.5 + drop * (tx / 13)),
      );
    }
  // The skull: a long wedge to the snout.
  shape(
    [
      [-8, -4],
      [2, -6],
      [10, -3],
      [14, -1],
      [14, 1],
      [4, 1],
      [-5, 2],
      [-9, 0],
    ],
    D.scale,
  );
  g.fillStyle(D.edge).fillPoints([P(-6, -4), P(2, -5.5), P(9, -3), P(2, -4)], true);
  // Two horns swept back, bone-silver.
  for (const [hx, len] of [
    [-6, 9],
    [-2, 7],
  ] as const)
    shape(
      [
        [hx, -4],
        [hx - len, -4 - len * 0.7],
        [hx + 2, -5],
      ],
      D.horn,
    );
  // The brow ridge, the burning eye with its slit, the nostril.
  g.lineStyle(Math.max(1, s * 0.6), D.outline).lineBetween(...Q(-1, -4.5), ...Q(4, -3.5));
  g.fillStyle(D.glow).fillEllipse(P(2, -2.6).x, P(2, -2.6).y, 2.6 * s, 1.4 * s);
  g.fillStyle(D.edge).fillRect(P(2, -2.6).x - 0.5, P(2, -2.6).y - 0.6 * s, 1, 1.2 * s);
  g.fillStyle(D.outline).fillRect(P(12.5, -1).x - 0.5, P(12.5, -1).y - 0.5, Math.max(1, s * 0.6), Math.max(1, s * 0.6));
}

/**
 * One dragon wing from the shoulder (x, y), reaching back from `f`: three finger bones fanning out, the dark membrane
 * scalloped between them. `flap` 1 = raised high, 0 = level, -0.5 = beaten down.
 */
export function dragonWing(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, s: number, flap: number, dim = false): void {
  const D = DESTRUCTION;
  const P = (px: number, py: number) => new Phaser.Math.Vector2(x + f * px * s, y + py * s);
  const tips: [number, number][] = [
    [-4, -22 * flap - 2],
    [-16, -18 * flap - 1],
    [-27, -9 * flap + 1],
  ];
  const mem = [P(0, 0), P(...tips[0]), P(-9, -14 * flap + 2), P(...tips[1]), P(-21, -7 * flap + 4), P(...tips[2]), P(-18, 4), P(-4, 3)];
  g.fillStyle(dim ? D.ash : D.membrane, 0.92).fillPoints(mem, true);
  g.lineStyle(Math.max(1, s * 0.5), D.outline).strokePoints(mem, true);
  for (const t of tips) {
    g.lineStyle(Math.max(1, s * 0.9), D.outline).lineBetween(x, y, P(...t).x, P(...t).y);
    g.lineStyle(Math.max(1, s * 0.45), dim ? D.membrane : D.scale).lineBetween(x, y, P(...t).x, P(...t).y);
  }
  g.fillStyle(D.horn).fillCircle(P(...tips[0]).x, P(...tips[0]).y, Math.max(0.8, s * 0.6));
}

/**
 * The whole red dragon, facing `f`: tail, legs, body with its molten belly, neck and head, a wing behind and one in
 * front. Redraw it each frame with a new `flap` (wing beat) and `open` (jaw) to make it move.
 */
export function redDragon(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, s: number, flap: number, open = 0): void {
  const D = DESTRUCTION;
  const P = (px: number, py: number) => new Phaser.Math.Vector2(x + f * px * s, y + py * s);
  const Q = (px: number, py: number): [number, number] => [x + f * px * s, y + py * s];
  dragonWing(g, P(1, -4).x, P(1, -4).y, f, s, flap * 0.85 + 0.1, true);
  // The tail: a long whip ending in a barbed spade.
  const tail = [P(-11, 1), P(-21, 4), P(-30, 2), P(-37, -3)];
  g.lineStyle(4.5 * s, D.outline).strokePoints(tail);
  g.lineStyle(2.6 * s, D.scale).strokePoints(tail);
  g.fillStyle(D.edge).fillTriangle(...Q(-36, -3), ...Q(-42, -7), ...Q(-40, 0));
  // Legs tucked under, claws hooked.
  for (const lx of [-6, 6]) {
    g.lineStyle(2.4 * s, D.outline).lineBetween(...Q(lx, 3), ...Q(lx + 2, 8));
    g.lineStyle(1.2 * s, D.scale).lineBetween(...Q(lx, 3), ...Q(lx + 2, 8));
    g.fillStyle(D.horn).fillRect(P(lx + 2, 8).x - 0.5, P(lx + 2, 8).y, Math.max(1, s), Math.max(1, s * 0.6));
  }
  // The body: outline, crimson scales, a lit ridge along the back, the glowing belly plates.
  g.fillStyle(D.outline).fillEllipse(x, y, 28 * s, 12 * s);
  g.fillStyle(D.scale).fillEllipse(x, y, 26 * s, 10 * s);
  g.fillStyle(D.edge).fillEllipse(P(0, -3).x, P(0, -3).y, 18 * s, 2.5 * s);
  g.fillStyle(D.belly).fillEllipse(P(2, 3).x, P(2, 3).y, 18 * s, 3.5 * s);
  for (let i = -2; i <= 2; i++)
    g.fillStyle(D.glow, 0.6).fillRect(P(2 + i * 3.4, 3).x - 0.5, P(2 + i * 3.4, 2.5).y, Math.max(1, s * 0.6), Math.max(1, s));
  dragonHead(g, P(19, -9).x, P(19, -9).y, f, s * 0.75, open);
  dragonWing(g, P(3, -4).x, P(3, -4).y, f, s, flap);
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
    // Jatuh Titan: he comes down like a falling mountain. The floor caves into a crater under him, and the slabs at
    // its rim tip up like seesaws: whatever stands in the crater is crushed, whatever stands on a slab is flung up.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const cam = scene.cameras.main;
      cam.shake(200, 0.016);
      const crater = scene.add.graphics().setDepth(5);
      crater.fillStyle(0x1d0f0a).fillEllipse(x, gy + 1, 26, 5);
      crater.lineStyle(1, 0xffa300, 0.8).strokeEllipse(x, gy + 1, 26, 5);
      scene.tweens.add({ targets: crater, alpha: 0, delay: 500, duration: 400, onComplete: () => crater.destroy() });
      rocks(scene, x, gy - 2, 10);
      ring(scene, x, gy - 3, 0xab5236, 4, 34, 300, 2);
      for (const dir of [-1, 1]) {
        // A slab of floor hinged at the crater's rim: dark edge, earth, its lit top.
        const g = scene.add.graphics();
        g.fillStyle(0x1d0f0a).fillRect(0, -1, 28, 6);
        g.fillStyle(0xab5236).fillRect(0, 0, 27, 4);
        g.fillStyle(0xd08a50).fillRect(0, 0, 27, 1);
        g.fillStyle(0x5f574f).fillRect(6, 2, 3, 1).fillRect(17, 1, 4, 1);
        const slab = scene.add
          .container(x + dir * 12, gy, [g])
          .setScale(dir, 1)
          .setDepth(11);
        scene.tweens.add({
          targets: slab,
          rotation: -dir * 0.55,
          duration: 80,
          ease: 'Quad.Out',
          yoyo: true,
          hold: 140,
          onComplete: () => slab.destroy(),
        });
        later(scene, 60, () => rocks(scene, x + dir * 36, gy - 8, 3));
      }
      for (const t of world.targets(x, gy)) {
        const dx = Math.abs(t.x - x);
        if (t.y < gy - 34 || t.y > gy + 8 || dx > 44) continue;
        if (dx <= 12) {
          world.strike(t, 0.8 * power, 'proc', false, { slow: 700 }, 60);
          continue;
        }
        world.strike(t, 0.7 * power, 'proc', false, undefined, 40);
        if (t.active && !('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-280);
      }
    },
    onSwing: ({ p, world, scene }, m, step) => {
      const f = p.facing;
      // The shoulder charge: earth kicked up behind every stride, steam off his shoulders, the air torn ahead of him.
      if (step === 2) {
        for (let i = 0; i < 5; i++)
          later(scene, i * 40, () => {
            if (!p.active) return;
            const d = scene.add.circle(p.x - f * 5, FLOOR_Y - 2, 2, i % 2 ? 0xab5236 : 0x5f574f, 0.8).setDepth(11);
            scene.tweens.add({ targets: d, x: d.x - f * 14, y: d.y - 6, scale: 2, alpha: 0, duration: 300, onComplete: () => d.destroy() });
            const s = scene.add.circle(p.x - f * 2, p.y - 5, 2, HYDRA.body, 0.5).setDepth(11);
            scene.tweens.add({ targets: s, y: s.y - 10, scale: 2, alpha: 0, duration: 380, onComplete: () => s.destroy() });
            const line = scene.add.rectangle(p.x + f * 16, p.y + Phaser.Math.Between(-6, 6), 12, 1, 0xfff1e8, 0.7).setDepth(12);
            scene.tweens.add({ targets: line, x: line.x - f * 26, alpha: 0, duration: 160, onComplete: () => line.destroy() });
          });
        return;
      }
      // The finisher buries the axe-sword in the floor: a crater, cracks, and the broken floor flung on ahead and up
      // in three slabs of rock that fly at whatever is in front of him, flyers too.
      if (step !== 3 || !p.grounded) return;
      later(scene, m.ms * 0.7, () => {
        if (!p.active) return;
        const x = Phaser.Math.Clamp(p.x + f * 18, 4, W - 4);
        scene.cameras.main.shake(140, 0.012);
        const crater = scene.add.graphics().setDepth(5);
        crater.fillStyle(0x1d0f0a).fillEllipse(x, FLOOR_Y + 1, 22, 4);
        crater.lineStyle(1, 0xffa300, 0.8).strokeEllipse(x, FLOOR_Y + 1, 22, 4);
        for (const dir of [-1, 1]) crater.lineStyle(1, 0x1d0f0a).lineBetween(x + dir * 11, FLOOR_Y + 1, x + dir * 22, FLOOR_Y + 2);
        scene.tweens.add({ targets: crater, alpha: 0, delay: 400, duration: 400, onComplete: () => crater.destroy() });
        rocks(scene, x, FLOOR_Y - 2, 6);
        ring(scene, x, FLOOR_Y - 2, 0xab5236, 3, 22, 240, 2);
        for (const a of [-0.3, -0.65, -1]) {
          world.shot({
            x,
            y: FLOOR_Y - 6,
            vx: Math.cos(a) * 250 * f,
            vy: Math.sin(a) * 250,
            texture: 'boulder',
            mult: 0.45,
            source: 'proc',
            knockback: 120,
            spin: true,
          });
        }
      });
    },
    // Pilar Herakles (the Tenth Labour: on his way to Geryon's cattle he split the mountain of Atlas in two, and the
    // halves stood on as the Pillars of Heracles). He drives the axe-sword into the floor and the split runs out both
    // ways to the nearest knot of enemies; two marble columns tear up out of the ground on either side of it, caging
    // it (whatever stands where one rises is thrown inward, everything inside is weighed down). Then he roars and the
    // columns topple, one after the other, sweeping down across the cage from the sky to the floor: whatever flies or
    // stands under the falling stone is crushed, and each column bursts into blocks of marble where it lands.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const f = p.facing;
      const pack = foes.filter((t) => Math.abs(t.x - foes[0].x) < 70);
      let lo = Math.max(10, Math.min(...pack.map((t) => t.x)) - 16);
      let hi = Math.min(W - 10, Math.max(...pack.map((t) => t.x)) + 16);
      if (hi - lo < 60) {
        const mid = Phaser.Math.Clamp((lo + hi) / 2, 40, W - 40);
        [lo, hi] = [mid - 30, mid + 30];
      }
      // Tall enough that its sweep reaches the flyers over the cage.
      const h = FLOOR_Y - 34;
      // Marble dust: pale specks drifting up off the floor around x.
      const marbleDust = (x: number, spread: number, n: number) => {
        for (let k = 0; k < n; k++) {
          const d = scene.add
            .rectangle(x + Phaser.Math.Between(-spread, spread), FLOOR_Y - 2, 1, 1, k % 2 ? 0xc2c3c7 : 0xfff1e8)
            .setDepth(12);
          scene.tweens.add({
            targets: d,
            x: d.x + Phaser.Math.Between(-6, 6),
            y: d.y - Phaser.Math.Between(6, 18),
            alpha: 0,
            duration: Phaser.Math.Between(400, 700),
            onComplete: () => d.destroy(),
          });
        }
      };
      p.lock(700);
      p.invuln(700);
      p.setVelocityX(0);
      // The axe-sword driven into the floor, and the split running out from it to where the columns will rise.
      const ax = Phaser.Math.Clamp(p.x + f * 12, 4, W - 4);
      cam.shake(150, 0.01);
      rocks(scene, ax, FLOOR_Y - 2, 6);
      ring(scene, ax, FLOOR_Y - 2, 0xab5236, 3, 24, 260, 2);
      const split = scene.add.graphics().setDepth(5);
      for (const x1 of [lo, hi]) {
        const pts = jag(ax, FLOOR_Y + 1, x1, FLOOR_Y + 1, 1.5).map(([x, y]) => new Phaser.Math.Vector2(x, y));
        split.lineStyle(3, 0x1d0f0a).strokePoints(pts, false);
        split.lineStyle(1, 0xffa300).strokePoints(pts, false);
      }
      scene.tweens.add({ targets: split, alpha: 0, delay: 900, duration: 500, onComplete: () => split.destroy() });

      // The columns rise.
      const cols = [lo, hi].map((x) => {
        const g = scene.add.graphics();
        greekPillar(g, h);
        return scene.add
          .container(x, FLOOR_Y + 2, [g])
          .setScale(1, 0)
          .setDepth(11);
      });
      later(scene, 180, () => {
        cam.shake(160, 0.012);
        cols.forEach((col, i) => {
          scene.tweens.add({ targets: col, scaleY: 1, duration: 220, ease: 'Back.Out' });
          rocks(scene, col.x, FLOOR_Y - 2, 8);
          marbleDust(col.x, 10, 8);
          // Whatever stood where it rose is thrown in toward the middle of the cage.
          const inward = i ? -1 : 1;
          for (const t of world.targets(col.x, FLOOR_Y)) {
            if (Math.abs(t.x - col.x) > 12) continue;
            world.strike(t, 0.6 * power, 'skill', false, undefined, 0);
            if (t.active && !('tier' in t)) (t as Phaser.Physics.Arcade.Sprite).setVelocity(inward * 160, -120);
          }
        });
        for (const t of world.targets(p.x, p.y)) if (t.x > lo && t.x < hi) world.afflict(t, { slow: 1200 });
      });

      // The fall: the far column first, then the near one, each sweeping across the cage to the floor.
      const near = Math.abs(lo - p.x) < Math.abs(hi - p.x) ? 0 : 1;
      const order = [1 - near, near];
      order.forEach((i, n) =>
        later(scene, 700 + n * 320, () => {
          const col = cols[i];
          const dir = i ? -1 : 1;
          const crushed = new Set<Phaser.GameObjects.GameObject>();
          if (n === 0) {
            ring(scene, p.x, p.y, HYDRA.lit, 4, 30, 300, 2);
            cam.shake(120, 0.008);
          }
          scene.tweens.add({
            targets: col,
            rotation: dir * (Math.PI / 2),
            duration: 380,
            ease: 'Quad.In',
            onUpdate: () => {
              // What the falling stone passes through is crushed under it.
              const a = col.rotation - Math.PI / 2;
              for (const t of world.targets(col.x, FLOOR_Y)) {
                if (crushed.has(t) || !onLine(col.x, FLOOR_Y, a, h, t, 9)) continue;
                crushed.add(t);
                world.strike(t, 1.4 * power, 'skill', false, { slow: 1000 }, 140);
                sparks(scene, t.x, t.y, [0xfff1e8, 0xc2c3c7, 0xffa300], 6, 14);
              }
            },
            onComplete: () => {
              const [x0, x1] = [col.x, Phaser.Math.Clamp(col.x + dir * h, 0, W)];
              col.destroy();
              if (n === 0) cam.flash(120, 255, 241, 232);
              cam.shake(260, 0.022);
              // It lands and bursts: blocks of marble tumble out along where it lay, in a cloud of dust.
              for (let k = 0; k < 7; k++) {
                const bx = x0 + ((x1 - x0) * (k + 0.5)) / 7;
                const b = scene.add
                  .rectangle(bx, FLOOR_Y - 4, Phaser.Math.Between(6, 10), Phaser.Math.Between(4, 7), k % 2 ? 0xc2c3c7 : 0xfff1e8)
                  .setStrokeStyle(1, 0x1d1b24)
                  .setDepth(11);
                scene.tweens.add({
                  targets: b,
                  x: bx + Phaser.Math.Between(-12, 12),
                  y: FLOOR_Y - Phaser.Math.Between(14, 30),
                  angle: Phaser.Math.Between(-180, 180),
                  duration: 260,
                  ease: 'Quad.Out',
                  onComplete: () =>
                    scene.tweens.add({
                      targets: b,
                      y: FLOOR_Y - 3,
                      alpha: 0,
                      duration: 300,
                      ease: 'Quad.In',
                      onComplete: () => b.destroy(),
                    }),
                });
                marbleDust(bx, 8, 3);
                rocks(scene, bx, FLOOR_Y - 2, 1);
              }
              // Whatever it came down on without the sweep touching it still feels the blow along the floor.
              for (const t of world.targets(x0, FLOOR_Y)) {
                if (crushed.has(t) || t.y < FLOOR_Y - 26 || (t.x - x0) * dir < 0 || (t.x - x0) * dir > h) continue;
                world.strike(t, 0.8 * power, 'skill', false, { slow: 800 }, 100);
              }
            },
          });
        }),
      );
    },
    // Nine Lives: Shooting the Hundred Heads, the art he made to kill the Lernaean Hydra, whose nine heads all had to
    // fall. The sky turns blood-red and steam pours off him; nine Hydra heads of crimson ki uncoil from his back and
    // sway over him, jaws open. Then they strike one after another, and each one goes for the strongest thing still
    // alive (the most HP left right then), so the nine wear the toughest down first; a head whose prey dies before it
    // lands swerves onto the nearest one left: none of the nine misses. The necks stay stretched across the field,
    // jaws locked. Climax: the nine let go and become one head as big as the arena: its jaws gape from the sky to the
    // floor and snap shut over everything (flyers too). TUMBANG!
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      const f = p.facing;
      p.invuln(3900);
      p.lock(3700);
      p.setVelocity(0, 0);
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x3a0610, 0)
        .setOrigin(0)
        .setDepth(8);
      scene.tweens.add({ targets: sky, fillAlpha: 0.6, duration: 450 });
      // Build-up: steam boils off him, a red pulse, the ground shudders.
      for (let i = 0; i < 18; i++)
        later(scene, i * 45, () => {
          if (!p.active) return;
          const s = scene.add
            .circle(p.x + Phaser.Math.Between(-7, 7), p.y + 2, Phaser.Math.Between(2, 4), i % 3 ? HYDRA.body : 0x5f574f, 0.6)
            .setDepth(11);
          scene.tweens.add({ targets: s, y: s.y - 26, scale: 2.2, alpha: 0, duration: 520, onComplete: () => s.destroy() });
        });
      ring(scene, p.x, p.y, HYDRA.lit, 4, 44, 520, 3);
      cam.shake(800, 0.004);

      // The nine heads: where each rests (fanned over his back, behind to in front) and what it has bitten.
      type Head = { rest: number; r: number; k: number; t?: Phaser.GameObjects.Sprite; x: number; y: number; open: number; bit: boolean };
      const heads: Head[] = Array.from({ length: 9 }, (_, i) => {
        const base = -Math.PI + 0.35 + (i * (Math.PI - 0.7)) / 8;
        return { rest: f > 0 ? base : -Math.PI - base, r: 26 + (i % 2) * 10, k: 0, x: p.x, y: p.y, open: 1, bit: false };
      });
      const g = scene.add.graphics().setDepth(12);
      const t0 = scene.time.now;
      const root = () => [p.x - f * 2, p.y - 6] as const;
      const restAt = (h: Head, i: number, now: number): [number, number] => {
        const [rx, ry] = root();
        const grow = Phaser.Math.Clamp((now - t0 - i * 50) / 450, 0, 1);
        const a = h.rest + Math.sin(now / 260 + i * 1.7) * 0.12;
        const r = h.r * Phaser.Math.Easing.Back.Out(grow);
        return [rx + Math.cos(a) * r, ry + Math.sin(a) * r];
      };
      const draw = () => {
        g.clear();
        if (!p.active) return;
        const now = scene.time.now;
        const [rx, ry] = root();
        heads.forEach((h, i) => {
          const [sx, sy] = restAt(h, i, now);
          if (h.k > 0 && h.t) [h.x, h.y] = [Phaser.Math.Linear(sx, h.t.x, h.k), Phaser.Math.Linear(sy, h.t.y, h.k)];
          else [h.x, h.y] = [sx, sy];
          if (Math.hypot(h.x - rx, h.y - ry) < 2) return;
          // The neck: out of his back along its resting line, writhing, then on to wherever the head is.
          const w = Math.sin(now / 180 + i * 2.1) * 9;
          const [cx, cy] = [rx + Math.cos(h.rest) * 20 - Math.sin(h.rest) * w, ry + Math.sin(h.rest) * 20 + Math.cos(h.rest) * w];
          const pts = Array.from({ length: 12 }, (_, j) => new Phaser.Math.Vector2(...bez(rx, ry, cx, cy, h.x, h.y, j / 11)));
          hydraNeck(g, pts, 2);
          const [px, py] = bez(rx, ry, cx, cy, h.x, h.y, 0.9);
          hydraHead(g, h.x, h.y, Math.atan2(h.y - py, h.x - px), 1, h.open);
        });
      };
      scene.tweens.addCounter({ from: 0, to: 1, duration: 2650, onUpdate: draw, onComplete: () => g.destroy() });

      // The strikes: each head goes for whatever has the most HP left when it lunges.
      const strongest = () =>
        (world.targets(p.x, p.y) as Living[]).reduce<Living | undefined>((b, t) => (!b || t.hp > b.hp ? t : b), undefined);
      heads.forEach((h, i) =>
        later(scene, 1000 + i * 130, () => {
          const t = strongest();
          if (!t) return;
          h.t = t;
          if (i === 0) cam.flash(120, 255, 0, 77);
          const lunge = (prey: Phaser.GameObjects.Sprite, ms: number) =>
            scene.tweens.addCounter({
              from: h.k,
              to: 1,
              duration: ms,
              ease: 'Quad.In',
              onUpdate: (tw) => (h.k = tw.getValue() ?? 1),
              onComplete: () => {
                // Its prey died on the way: it swerves onto the nearest one still standing.
                if (!prey.active) {
                  const next = world.targets(h.x, h.y)[0];
                  if (!next) return;
                  [h.k, h.t] = [0.6, next];
                  return void lunge(next, 90);
                }
                h.open = 0;
                h.bit = true;
                cutMark(scene, prey.x, prey.y, HYDRA.lit, 22, 0.8);
                cutMark(scene, prey.x, prey.y, HYDRA.ridge, 22, -0.8);
                sparks(scene, prey.x, prey.y, [HYDRA.lit, 0xffa300, 0xfff1e8], 8, 18);
                cam.shake(80, 0.01);
                world.strike(prey, 1 * power, 'ult', false, undefined, 40);
              },
            });
          lunge(t, 170);
        }),
      );

      // The nine let go and coil back into him.
      later(scene, 2300, () =>
        heads.forEach((h) => {
          h.open = 1;
          scene.tweens.addCounter({ from: h.k, to: 0, duration: 300, ease: 'Quad.Out', onUpdate: (tw) => (h.k = tw.getValue() ?? 0) });
        }),
      );

      // The climax: one head as big as the arena, its jaws gaping from the sky to the floor, snapping shut.
      later(scene, 2650, () => {
        const m = scene.add.graphics().setDepth(13);
        const mid = (FLOOR_Y + 10) / 2;
        // The jaws (the lower one drawn first, so the upper one closes over it): the upper one hangs from the sky, the
        // lower one rises from the floor; both thicken toward the skull at the back (behind him) and taper to the snout
        // ahead, fangs all along their edges. `gap` 1 = the full gape just inside the screen, 0 = shut on the middle
        // line; above 1 they are still sliding in.
        const jaws = (gap: number, alpha: number) => {
          m.clear();
          const [yu, yl] = [mid - gap * (mid - 18), mid + gap * (FLOOR_Y - 4 - mid)];
          // How far along from the skull (0) to the snout (1) x lies.
          const along = (x: number) => (f > 0 ? x / W : 1 - x / W);
          for (const [edge0, dir, thick] of [
            [yl, -1, 10],
            [yu, 1, 34],
          ] as const) {
            const edge = (x: number) => edge0 + dir * thick * (1 - along(x)) ** 2;
            const back = dir > 0 ? -12 : FLOOR_Y + 24;
            const xs = Array.from({ length: 21 }, (_, i) => (i * W) / 20);
            const body = [
              new Phaser.Math.Vector2(0, back),
              ...xs.map((x) => new Phaser.Math.Vector2(x, edge(x))),
              new Phaser.Math.Vector2(W, back),
            ];
            m.fillStyle(HYDRA.body, alpha).fillPoints(body, true);
            // Fangs along the edge, long and short in turn.
            for (let x = 8; x < W; x += 16) {
              const fx = x + (dir > 0 ? 0 : 8);
              const e = edge(fx);
              const len = ((x - 8) / 16) % 2 ? 8 : 13;
              m.fillStyle(0xfff1e8, alpha).fillTriangle(fx - 4, e, fx + 4, e, fx, e + dir * len);
              m.lineStyle(1, HYDRA.out, alpha).strokeTriangle(fx - 4, e, fx + 4, e, fx, e + dir * len);
            }
            // The lip: a dark edge and a lit band just inside it.
            m.lineStyle(2, HYDRA.out, alpha).strokePoints(
              xs.map((x) => new Phaser.Math.Vector2(x, edge(x))),
              false,
            );
            m.lineStyle(2, HYDRA.lit, alpha).strokePoints(
              xs.map((x) => new Phaser.Math.Vector2(x, edge(x) - dir * 4)),
              false,
            );
          }
          // The great slit eye in the thick of the skull, and the ridge of horns over it.
          const ex = f > 0 ? 40 : W - 40;
          const ey = yu + 16;
          for (let k = 0; k < 4; k++) {
            const hx = ex + (f > 0 ? -1 : 1) * (k * 12 - 6);
            m.fillStyle(HYDRA.out, alpha).fillTriangle(hx - 5, ey - 8, hx + 5, ey - 8, hx - f * 10, ey - 22 + k * 3);
            m.fillStyle(HYDRA.lit, alpha).fillTriangle(hx - 3, ey - 9, hx + 3, ey - 9, hx - f * 8, ey - 20 + k * 3);
          }
          m.fillStyle(HYDRA.out, alpha).fillEllipse(ex, ey, 26, 14);
          m.fillStyle(HYDRA.eye, alpha).fillEllipse(ex, ey, 22, 10);
          m.fillStyle(0xfff1e8, alpha).fillRect(ex - 6, ey - 3, 3, 2);
          m.fillStyle(HYDRA.out, alpha).fillRect(ex - 1.5, ey - 5, 3, 10);
        };
        scene.tweens.addCounter({
          from: 1.4,
          to: 1,
          duration: 380,
          ease: 'Quad.Out',
          onUpdate: (tw) => jaws(tw.getValue() ?? 1, 0.95 * Phaser.Math.Clamp((1.4 - (tw.getValue() ?? 1)) * 4, 0, 1)),
          onComplete: () =>
            // The snap.
            scene.tweens.addCounter({
              from: 1,
              to: 0,
              delay: 140,
              duration: 110,
              ease: 'Quad.In',
              onUpdate: (tw) => jaws(tw.getValue() ?? 0, 0.95),
              onComplete: () => {
                cam.flash(180, 255, 0, 77);
                cam.shake(500, 0.03);
                floatText(scene, W / 2, mid - 14, 'TUMBANG!', '#ff004d');
                for (const t of world.targets(p.x, p.y)) {
                  sparks(scene, t.x, t.y, [0xfff1e8, HYDRA.lit], 10, 22);
                  world.strike(t, 2.2 * power, 'ult', true, { slow: 1200 }, 200);
                }
                // The great head breaks apart into crimson shards.
                scene.tweens.add({ targets: m, alpha: 0, delay: 60, duration: 260, onComplete: () => m.destroy() });
                for (let i = 0; i < 24; i++) {
                  const s = scene.add
                    .rectangle(Phaser.Math.Between(0, W), mid + Phaser.Math.Between(-8, 8), 3, 2, i % 3 ? HYDRA.lit : 0xfff1e8)
                    .setDepth(14);
                  scene.tweens.add({
                    targets: s,
                    x: s.x + Phaser.Math.Between(-30, 30),
                    y: s.y + Phaser.Math.Between(-50, 50),
                    angle: 360,
                    alpha: 0,
                    duration: 600,
                    onComplete: () => s.destroy(),
                  });
                }
                scene.tweens.add({ targets: sky, fillAlpha: 0, delay: 500, duration: 500, onComplete: () => sky.destroy() });
              },
            }),
        });
      });
    },
    // Banteng Kreta (the Seventh Labour: he wrestled the Cretan Bull with his bare hands and carried it off alive).
    // He bounds onto the nearest enemy he can lift (anything but a boss; up into the air if it flies), seizes it and
    // whirls it twice round his head as a living club while he wades forward: everything it sweeps through is
    // battered aside, and the club feels every blow too. Then he hammers it into the floor in front of him and behind
    // him (a crater and a shock along the floor each time) and hurls it end over end at whatever is highest or
    // farthest, a flyer if there is one: both take the blow, and what is left of it drops there, stunned. With no one
    // to throw it at, a third, harder slam. With nothing he can lift, he tears a boulder out of the floor instead.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      type Held = Phaser.GameObjects.Sprite & { untargetable: boolean; stunUntil: number; kind?: string };
      const prey = (foes as Held[]).find(
        (t) => !('tier' in t) && !['ghost', 'mimic'].includes(t.kind ?? '') && Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 160,
      );
      const cam = scene.cameras.main;
      const gy = FLOOR_Y - 8;
      p.lock(2500);
      p.invuln(2600);
      p.setVelocity(0, 0);
      // The club: a picture of the enemy (its body leaves the fight while he holds it), or a boulder torn out of the floor.
      let club: Phaser.GameObjects.Image;
      const grab = () => {
        if (prey?.active) {
          club = scene.add.image(prey.x, prey.y, prey.texture.key, prey.frame.name).setFlipX(prey.flipX).setDepth(12);
          prey.untargetable = true;
          prey.stunUntil = scene.time.now + 60000;
          prey.setVisible(false);
          (prey.body as Phaser.Physics.Arcade.Body).enable = false;
        } else {
          const bx = Phaser.Math.Clamp(p.x + p.facing * 10, 8, W - 8);
          club = scene.add
            .image(bx, FLOOR_Y - 4, 'boulder')
            .setScale(2.6)
            .setDepth(12);
          rocks(scene, bx, FLOOR_Y - 2, 10);
          ring(scene, bx, FLOOR_Y - 2, 0xab5236, 3, 22, 260, 2);
        }
        sparks(scene, club.x, club.y, [0xffa300, 0xfff1e8], 8, 14);
        cam.shake(100, 0.01);
      };
      // The body follows the club, so a held enemy that dies falls from where the club is.
      const hold = (x: number, y: number, rot: number) => {
        club.setPosition(x, y).setRotation(rot);
        if (prey?.active && prey.untargetable) prey.setPosition(x, y);
      };
      const hurtClub = (mult: number) =>
        prey?.active && prey.untargetable && world.strike(prey, mult * power, 'skill', false, undefined, 0);

      // The bound onto it, up into the air if it flies; then down to the floor with it.
      const x0 = p.x;
      const y0 = p.y;
      const [tx, ty] = prey ? [Phaser.Math.Clamp(prey.x - Math.sign(prey.x - x0 || 1) * 8, 8, W - 8), Math.min(prey.y, gy)] : [x0, y0];
      if (prey) p.facing = prey.x >= x0 ? 1 : -1;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: prey ? 220 : 120,
        ease: 'Quad.Out',
        onUpdate: (tw) => {
          if (!prey) return;
          p.body.reset(...bez(x0, y0, (x0 + tx) / 2, Math.min(y0, ty) - 24, tx, ty, tw.getValue() ?? 1));
          p.ghost(HYDRA.body);
        },
        onComplete: () => {
          grab();
          const y1 = p.y;
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: y1 < gy - 4 ? 200 : 60,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              p.body.reset(p.x, Phaser.Math.Linear(y1, gy, tw.getValue() ?? 1));
              hold(p.x + p.facing * 4, p.y - 16, 0);
            },
            onComplete: swing,
          });
        },
      });

      // Two turns round his head, picking up speed, as he wades forward.
      const swing = () => {
        const f = p.facing;
        const sx = p.x;
        const R = 28;
        const trail = scene.add.graphics().setDepth(11);
        const struck = [new Set<Phaser.GameObjects.GameObject>(), new Set<Phaser.GameObjects.GameObject>()];
        let last = -Math.PI / 2;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 1000,
          ease: 'Sine.In',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            p.body.reset(Phaser.Math.Clamp(sx + f * 40 * v, 8, W - 8), gy);
            const phi = -Math.PI / 2 + f * v * Math.PI * 4;
            const [cx, cy] = [p.x + Math.cos(phi) * R, p.y - 6 + Math.sin(phi) * R * 0.75];
            hold(cx, cy, phi + Math.PI / 2);
            // The blur of the swing behind the club.
            trail.clear();
            for (const [w, col, al] of [
              [7, HYDRA.body, 0.25],
              [3, 0xd08a50, 0.5],
              [1, 0xfff1e8, 0.8],
            ] as const) {
              trail.lineStyle(w, col, al).beginPath();
              for (let j = 0; j <= 6; j++) {
                const a = last + ((phi - last) * j) / 6 - f * 0.5 * (1 - j / 6);
                const [px, py] = [p.x + Math.cos(a) * R, p.y - 6 + Math.sin(a) * R * 0.75];
                if (j) trail.lineTo(px, py);
                else trail.moveTo(px, py);
              }
              trail.strokePath();
            }
            last = phi;
            const turn = v < 0.5 ? 0 : 1;
            for (const t of world.targets(cx, cy)) {
              if (struck[turn].has(t) || Phaser.Math.Distance.Between(cx, cy, t.x, t.y) > 14) continue;
              struck[turn].add(t);
              world.strike(t, 1 * power, 'skill', false, undefined, 260);
              cutMark(scene, t.x, t.y, 0xffa300, 22, phi);
              sparks(scene, t.x, t.y, [0xffa300, 0xfff1e8], 6, 14);
              cam.shake(60, 0.008);
              hurtClub(0.35);
            }
          },
          onComplete: () => {
            trail.destroy();
            slam(0);
          },
        });
      };

      // Two slams, in front of him and behind him; then he hurls it at whatever is highest or farthest (a flyer if
      // there is one). With no one left to throw it at, a third slam, the hardest.
      const slam = (k: number) => {
        const side = k === 1 ? -p.facing : p.facing;
        const [hx, hy] = [p.x, p.y - 30];
        const ix = Phaser.Math.Clamp(p.x + side * 26, 6, W - 6);
        const iy = FLOOR_Y - 6;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 140,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            hold(...bez(hx, hy, p.x + side * 30, hy, ix, iy, v), side * v * Math.PI * 0.5);
          },
          onComplete: () => {
            const big = k === 2;
            if (big) cam.flash(120, 255, 163, 0);
            cam.shake(120 + k * 80, 0.012 + k * 0.007);
            rocks(scene, ix, FLOOR_Y - 2, 6 + k * 4);
            ring(scene, ix, FLOOR_Y - 2, 0xab5236, 4, 26 + k * 10, 280, 2 + k);
            const crater = scene.add.graphics().setDepth(5);
            crater.fillStyle(0x1d0f0a).fillEllipse(ix, FLOOR_Y + 1, 18 + k * 8, 4);
            crater.lineStyle(1, 0xffa300, 0.8).strokeEllipse(ix, FLOOR_Y + 1, 18 + k * 8, 4);
            scene.tweens.add({ targets: crater, alpha: 0, delay: 500, duration: 400, onComplete: () => crater.destroy() });
            world.area(ix, FLOOR_Y - 10, 24 + k * 8, (big ? 1.2 : 0.8) * power, big ? 300 : 200, 'skill', { slow: 600 });
            hurtClub(big ? 0.9 : 0.6);
            if (big) return void later(scene, 200, () => release(ix, FLOOR_Y - 10));
            if (k === 0) return void later(scene, 140, () => slam(1));
            const mark = world
              .targets(p.x, p.y)
              .reduce<Phaser.GameObjects.Sprite | undefined>(
                (b, t) => (!b || FLOOR_Y - t.y + Math.abs(t.x - p.x) * 0.4 > FLOOR_Y - b.y + Math.abs(b.x - p.x) * 0.4 ? t : b),
                undefined,
              );
            later(scene, 140, () => (mark ? hurl(mark) : slam(2)));
          },
        });
      };

      // The throw: up over his head and away, end over end, at the mark.
      const hurl = (t: Phaser.GameObjects.Sprite) => {
        const [x0, y0] = [p.x, p.y - 26];
        p.facing = t.x >= p.x ? 1 : -1;
        const f = p.facing;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 280,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            const [tx, ty] = [t.x, t.y];
            hold(...bez(x0, y0, (x0 + tx) / 2, Math.min(y0, ty) - 30, tx, ty, v), f * v * Math.PI * 4);
            if (Math.random() < 0.6) {
              const d = scene.add.rectangle(club.x, club.y, 2, 2, Math.random() < 0.5 ? HYDRA.body : 0xd08a50, 0.8).setDepth(11);
              scene.tweens.add({ targets: d, alpha: 0, duration: 220, onComplete: () => d.destroy() });
            }
          },
          onComplete: () => {
            const [x, y] = [club.x, club.y];
            cam.flash(120, 255, 163, 0);
            cam.shake(260, 0.024);
            ring(scene, x, y, 0xffa300, 4, 36, 300, 3);
            sparks(scene, x, y, [0xffa300, 0xfff1e8, HYDRA.lit], 14, 30);
            rocks(scene, x, Math.min(y, FLOOR_Y - 2), 6);
            world.area(x, y, 30, 1.3 * power, 300, 'skill', { slow: 800 });
            hurtClub(0.9);
            release(x, Math.min(y, FLOOR_Y - 10));
          },
        });
      };

      // He lets go: the enemy is back in the fight where it lies, stunned; the boulder crumbles.
      const release = (x: number, y: number) => {
        if (prey?.active && prey.untargetable) {
          const body = prey.body as Phaser.Physics.Arcade.Body;
          body.enable = true;
          body.reset(x, y);
          prey.setVisible(true);
          prey.untargetable = false;
          prey.stunUntil = scene.time.now + 900;
          world.strike(prey, 0.6 * power, 'skill', false, undefined, 220);
        } else rocks(scene, club.x, Math.min(club.y, FLOOR_Y - 4), 8);
        club.destroy();
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
      if (ELEMENT_SPELLS[k](c) === false) return false;
      c.p.setData('element', (k + 1) % ELEMENT_SPELLS.length);
    },
    // Every basic spell bursts on what it hits, each in its element: the fireball explodes and scorches what is near,
    // the ice shard shatters into splinters that frost its neighbours, the spark leaps on as chain lightning to two
    // more enemies, and the boulder breaks apart in a shock of rubble.
    onShotHit: ({ world, scene, power }, m, x, y, t) => {
      const near = (r: number) => world.targets(x, y).filter((o) => o !== t && Phaser.Math.Distance.Between(x, y, o.x, o.y) < r);
      if (m.shot === 'iceshard') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const s = scene.add.image(x, y, 'iceshard').setRotation(a).setScale(0.6).setDepth(13);
          scene.tweens.add({
            targets: s,
            x: x + Math.cos(a) * 18,
            y: y + Math.sin(a) * 18,
            alpha: 0,
            duration: 220,
            onComplete: () => s.destroy(),
          });
        }
        ring(scene, x, y, 0xc2f0ff, 2, 14, 200, 1);
        for (const o of near(20)) world.strike(o, 0.4 * power, 'proc', false, { freeze: 400 }, 0);
      } else if (m.shot === 'boltShot') {
        let from = t;
        for (const o of near(80).slice(0, 2)) {
          bolt(scene, from.x, from.y, o.x, o.y, 0x29adff);
          world.strike(o, 0.5 * power, 'proc', false, { freeze: 200 }, 30);
          from = o;
        }
        sparks(scene, x, y, [0xffec27, 0xfff1e8], 5, 10);
      } else if (m.shot === 'boulder') {
        rocks(scene, x, Math.min(y, FLOOR_Y - 2), 8);
        ring(scene, x, y, 0xab5236, 4, 28, 260, 2);
        scene.cameras.main.shake(70, 0.006);
        for (const o of near(28)) world.strike(o, 0.9 * power, 'proc', false, { slow: 900 }, 160);
      } else {
        explosion(scene, x, y, 10);
        for (const o of near(20)) world.strike(o, 0.5 * power, 'proc', false, { burn: 0.15 }, 60);
      }
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
      const R = 70;
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
                    world.strike(t, 1.2 * power, 'skill', false, [{ burn: 0.3 }, { freeze: 600 }, { freeze: 300 }, { slow: 1200 }][e]);
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
            for (const t of inside(R)) world.strike(t, 3 * power, 'skill', true, { burn: 0.4, slow: 1500 });
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
              for (const t of inside(R)) world.strike(t, 2.6 * power, 'skill', true, { freeze: 900 });
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
                world.strike(t, 2.6 * power, 'skill', true, { slow: 1500 });
              }
            });
          } else {
            // MAGMA: the molten boulder bursts; a pool of lava spreads over the floor below and geysers erupt from it,
            // flinging blobs of lava up into the air.
            explosion(scene, x, y, 22);
            for (const t of inside(R)) world.strike(t, 2.8 * power, 'skill', true, { burn: 0.5, slow: 1000 });
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
    // Elemental Cataclysm: the sky goes dark and a vast magic circle turns over the arena; four towers of the elements
    // rise from the floor beneath its points. Each element in turn is loosed on the whole field: a meteor shower that
    // pounds the floor as well as every enemy; a web of lightning leaping from enemy to enemy; a blizzard of giant
    // icicles; the earth heaving up in rock pillars and boulders. Then the four towers pour their elements into the
    // circle's heart, a prismatic sphere swells there, falls, and bursts over the whole arena (CATACLYSM!).
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(4800);
      p.lock(4300);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      cam.flash(200, 192, 128, 255);
      const sky = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x0b0820, 0.75).setOrigin(0).setDepth(4).setAlpha(0);
      scene.tweens.add({ targets: sky, alpha: 1, duration: 400 });
      // The circle, seen at an angle: rings, an eight-pointed star and runes, turning.
      const [cx, cy] = [W / 2, 30];
      const runes = scene.add.graphics();
      runes.lineStyle(4, 0xc080ff, 0.3).strokeCircle(0, 0, 110);
      runes.lineStyle(2, 0xc080ff, 0.9).strokeCircle(0, 0, 110);
      runes.lineStyle(1, 0xfff1e8, 0.7).strokeCircle(0, 0, 94).strokeCircle(0, 0, 40);
      const star = Array.from({ length: 8 }, (_, i) => V2(Math.cos((i * 3 * Math.PI) / 4) * 94, Math.sin((i * 3 * Math.PI) / 4) * 94));
      runes.lineStyle(1, 0xc080ff, 0.8).strokePoints(star, true);
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        runes.fillStyle(0xfff1e8, 0.8).fillRect(Math.cos(a) * 102 - 1, Math.sin(a) * 102 - 1, 2, 2);
      }
      const circle = scene.add.container(cx, cy, [runes]).setScale(0, 0).setDepth(5);
      scene.tweens.add({ targets: circle, scaleX: 1, scaleY: 0.3, duration: 500, ease: 'Back.Out' });
      scene.tweens.add({ targets: runes, angle: 360, duration: 4500 });
      // The four towers: a column of each element under an orb, at four points across the arena.
      const ELEMS = [0xff004d, 0xffec27, 0x29adff, 0x00e436];
      const LIT = [0xffa300, 0xfff1e8, 0xc2f0ff, 0xb4f080];
      const towers = ELEMS.map((c, i) => {
        const tx = [40, 120, 200, 280][i];
        const col = scene.add.container(tx, FLOOR_Y, [
          scene.add.rectangle(0, 0, 14, FLOOR_Y - 30, c, 0.25).setOrigin(0.5, 1),
          scene.add.rectangle(0, 0, 6, FLOOR_Y - 30, c, 0.6).setOrigin(0.5, 1),
          scene.add.rectangle(0, 0, 2, FLOOR_Y - 30, LIT[i], 0.9).setOrigin(0.5, 1),
        ]);
        col.setDepth(5).setScale(1, 0);
        scene.tweens.add({ targets: col, scaleY: 1, delay: 250 + i * 90, duration: 300, ease: 'Quad.Out' });
        const orb = scene.add.circle(tx, 30, 6, c).setStrokeStyle(2, LIT[i]).setDepth(6).setScale(0);
        scene.tweens.add({ targets: orb, scale: 1, delay: 450 + i * 90, duration: 200, ease: 'Back.Out' });
        scene.tweens.add({ targets: orb, scale: 1.3, delay: 700, duration: 160, yoyo: true, repeat: -1 });
        return { col, orb };
      });
      const each = (fn: (t: Phaser.GameObjects.Sprite, i: number) => void) => world.targets(p.x, p.y).forEach(fn);
      // Fire: a meteor shower, on every enemy and all over the floor.
      later(scene, 700, () => {
        cam.shake(700, 0.012);
        const marks = [...world.targets(p.x, p.y).map((t) => t), ...Array.from({ length: 10 }, () => null)];
        marks.forEach((t, i) =>
          later(scene, i * 50, () => {
            const [x, y] = t?.active ? [t.x, t.y] : [Phaser.Math.Between(10, W - 10), FLOOR_Y - 4];
            const m = scene.add
              .image(x - 60, -10, 'meteor')
              .setScale(1.5)
              .setDepth(12);
            scene.tweens.add({
              targets: m,
              x,
              y,
              duration: 280,
              ease: 'Quad.In',
              onUpdate: () => Math.random() < 0.5 && sparks(scene, m.x, m.y, [0xffa300, 0xff004d], 1, 4),
              onComplete: () => {
                m.destroy();
                explosion(scene, x, y, 18);
                for (const o of world.targets(x, y))
                  if (Phaser.Math.Distance.Between(x, y, o.x, o.y) < 22) world.strike(o, 0.8 * power, 'ult', false, { burn: 0.4 }, 0);
              },
            });
          }),
        );
      });
      // Lightning: a web: a bolt from the yellow tower to every enemy, and arcs from each enemy to the next.
      later(scene, 1500, () => {
        cam.flash(80, 255, 236, 39);
        cam.shake(400, 0.014);
        const live = world.targets(p.x, p.y);
        live.forEach((t, i) =>
          later(scene, i * 50, () => {
            if (!t.active) return;
            bolt(scene, towers[1].orb.x, towers[1].orb.y, t.x, t.y);
            const n = live[i + 1];
            if (n?.active) bolt(scene, t.x, t.y, n.x, n.y, 0x29adff);
            world.strike(t, 1.5 * power, 'ult', false, { freeze: 400 }, 0);
          }),
        );
      });
      // Ice: a blizzard, and a giant icicle onto every enemy.
      later(scene, 2200, () => {
        for (let k = 0; k < 40; k++) {
          const f = scene.add.rectangle(Phaser.Math.Between(0, W + 60), -4, 1, 1, 0xfff1e8).setDepth(12);
          scene.tweens.add({ targets: f, x: f.x - 70, y: FLOOR_Y, delay: k * 15, duration: 600, onComplete: () => f.destroy() });
        }
        each((t, i) =>
          later(scene, i * 50, () => {
            const { x, y } = t;
            const ice = scene.add
              .image(x, -10, 'iceshard')
              .setRotation(Math.PI / 2)
              .setScale(4, 3)
              .setDepth(12);
            scene.tweens.add({
              targets: ice,
              y,
              duration: 200,
              ease: 'Quad.In',
              onComplete: () => {
                ice.destroy();
                sparks(scene, x, y, [0xc2f0ff, 0xfff1e8, 0x29adff], 10, 18);
                ring(scene, x, y, 0xc2f0ff, 3, 18, 240, 2);
                if (t.active) world.strike(t, 1.5 * power, 'ult', false, { freeze: 1200 }, 0);
              },
            });
          }),
        );
      });
      // Earth: rock pillars under everything on the ground, boulders at everything in the air.
      later(scene, 2900, () => {
        cam.shake(500, 0.022);
        for (let x = 10; x < W; x += 22)
          later(scene, Math.abs(x - p.x) * 1.2, () => rockPillar(scene, x, Phaser.Math.Between(16, 30), 400));
        each((t, i) => {
          if (t.y > FLOOR_Y - 34) {
            later(scene, Math.abs(t.x - p.x) * 1.2, () => {
              rockPillar(scene, Phaser.Math.Clamp(t.x, 8, W - 8), 46, 500);
              world.strike(t, 1.5 * power, 'ult', false, { slow: 1500 }, 0);
              launch(t, 260);
            });
          } else
            later(scene, i * 40, () =>
              hurlRock(scene, Phaser.Math.Clamp(t.x, 8, W - 8), t, () => world.strike(t, 1.5 * power, 'ult', false)),
            );
        });
      });
      // Prism: the towers pour into the circle's heart; a sphere of every color swells, falls and bursts.
      const [hx, hy] = [cx, cy + 6];
      const prism = scene.add.graphics().setDepth(14);
      later(scene, 3500, () => {
        towers.forEach(({ orb }, i) => {
          const beam = scene.add.graphics().setDepth(13);
          beam.lineStyle(5, ELEMS[i], 0.4).lineBetween(orb.x, orb.y, hx, hy);
          beam.lineStyle(2, LIT[i]).lineBetween(orb.x, orb.y, hx, hy);
          scene.tweens.add({ targets: beam, alpha: 0, duration: 500, onComplete: () => beam.destroy() });
        });
        scene.tweens.addCounter({
          from: 2,
          to: 18,
          duration: 380,
          onUpdate: (tw) => {
            const r = tw.getValue() ?? 2;
            prism.clear();
            ELEMS.forEach((c, i) => prism.fillStyle(c, 0.6).fillCircle(Math.cos(i * 1.57 + r) * 3, Math.sin(i * 1.57 + r) * 3, r));
            prism.fillStyle(0xfff1e8).fillCircle(0, 0, r * 0.5);
            prism.setPosition(hx, hy);
          },
        });
      });
      later(scene, 3900, () =>
        scene.tweens.add({
          targets: prism,
          y: FLOOR_Y - 20,
          duration: 260,
          ease: 'Quad.In',
          onComplete: () => {
            prism.destroy();
            scene.tweens.killTweensOf(towers.map(({ orb }) => orb));
            floatText(scene, W / 2, 56, 'CATACLYSM!', '#fff1e8');
            cam.flash(300, 255, 255, 255);
            cam.shake(600, 0.04);
            ELEMS.forEach((c, i) => later(scene, i * 60, () => ring(scene, hx, FLOOR_Y - 20, c, 10, 260, 650, 4)));
            for (let x = 8; x < W; x += 16)
              flameTongue(scene, x, FLOOR_Y, Phaser.Math.Between(14, 28), 420, [ELEMS[(x >> 4) % 4], LIT[(x >> 4) % 4], 0xfff1e8]);
            each((t) => {
              sparks(scene, t.x, t.y, ELEMS, 14, 24);
              world.strike(t, 4.5 * power, 'ult', true, undefined, 220);
            });
            scene.tweens.add({
              targets: [sky, circle, ...towers.flatMap(({ col, orb }) => [col, orb])],
              alpha: 0,
              delay: 200,
              duration: 600,
              onComplete: () => [sky, circle, ...towers.flatMap(({ col, orb }) => [col, orb])].forEach((o) => o.destroy()),
            });
          },
        }),
      );
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
    // Terkaman Naga lands claws-first: three molten furrows rake out along the floor ahead of him and fire spits up
    // out of each.
    onDiveLand: ({ p, world, scene, power }, x, gy) => {
      const f = p.facing;
      scene.cameras.main.shake(120, 0.01);
      for (const o of [-3, 0, 3]) {
        const g = scene.add.graphics().setDepth(11);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 200,
          ease: 'Quad.Out',
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            const x1 = x + f * (8 + 44 * k);
            g.clear()
              .lineStyle(3, DESTRUCTION.outline)
              .lineBetween(x + f * 4, gy - 1 + o * 0.3, x1, gy - 1 + o * 0.3);
            g.lineStyle(1, DESTRUCTION.belly).lineBetween(x + f * 4, gy - 1 + o * 0.3, x1, gy - 1 + o * 0.3);
            if (Math.random() < 0.5) flameTongue(scene, x1, gy, 9, 260, FIRE);
          },
          onComplete: () => scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() }),
        });
      }
      world.area(x + f * 26, gy - 8, 32, 0.8 * power, 160, 'proc', { burn: 0.2 });
    },
    // Dragon's Fear: Antares lets what he truly is show for a heartbeat. The spectral head of the King of Dragons
    // (his spiritual body) rears up behind him, opens its jaws and roars; the roar rolls over the whole arena in rings
    // of red pressure. Every enemy is gripped by terror: it seizes up where it stands, shaking, a red mark of dread over
    // it, and anything in the air forgets how to fly and drops onto the floor. The heat of the breath scorches them all.
    // In dragon form there is no spirit to call up: AUMAN RAJA NAGA, the dragon itself rears and roars, jaws wide; the
    // terror lasts longer and burns hotter, and a wave of fire runs out along the floor both ways from under him.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const dk = p.dragon;
      p.lock(600);
      p.setVelocityX(0);
      const cam = scene.cameras.main;
      if (dk) p.setData('roarUntil', scene.time.now + 1000);
      const [hx, hy] = [Phaser.Math.Clamp(p.x - f * 16, 30, W - 30), Math.max(34, p.y - 34)];
      const head = scene.add.graphics().setDepth(7);
      const veil = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, DESTRUCTION.scale, 0)
        .setOrigin(0)
        .setDepth(6);
      scene.tweens.add({ targets: veil, fillAlpha: 0.25, duration: 160, yoyo: true, hold: 700, onComplete: () => veil.destroy() });
      // The head rises out of him, translucent, and its jaws open for the roar.
      const st = { k: 0, open: 0 };
      scene.tweens.add({ targets: st, k: 1, duration: 260, ease: 'Back.Out' });
      scene.tweens.add({ targets: st, open: 1, delay: 260, duration: 120 });
      const draw = () => {
        head.clear().setAlpha(0.8 * Math.min(1, st.k * 1.4));
        if (!dk) dragonHead(head, hx, hy + (1 - st.k) * 20, f, 1.4 + st.k * 1.2, st.open);
      };
      scene.events.on('update', draw);
      later(scene, 380, () => {
        cam.flash(150, 179, 18, 46);
        cam.shake(dk ? 650 : 450, dk ? 0.03 : 0.02);
        const [mx, my] = dk ? [p.x + f * 23, p.y - 6] : [hx + f * 30, hy];
        if (dk)
          for (const side of [-1, 1])
            for (let i = 0; i < 10; i++)
              later(scene, i * 45, () => flameTongue(scene, p.x + side * (12 + i * 16), FLOOR_Y, 20 + i, 420, FIRE));
        // The roar's pressure: thick crimson rings with a dark edge, rolling out over the whole arena.
        for (let k = 0; k < 4; k++)
          later(scene, k * 110, () => {
            ring(scene, mx, my, DESTRUCTION.ash, 10, W, 560, 4);
            ring(scene, mx, my, DESTRUCTION.edge, 8, W * 0.95, 520, 2);
          });
        for (const t of world.targets(p.x, p.y)) {
          const d = Phaser.Math.Distance.Between(mx, my, t.x, t.y);
          later(scene, d * 1.2, () => {
            if (!t.active) return;
            const boss = 'tier' in t;
            world.strike(t, (dk ? 2.1 : 1.3) * power, 'skill', false, { freeze: dk ? 2600 : 1800, burn: dk ? 0.45 : 0.25 }, 0);
            if (!t.active) return;
            // Flyers drop out of the sky, too terrified to keep their wings going.
            if (!boss && (t as unknown as { flying?: boolean }).flying) world.slam(t.x, t.y, 4, 420);
            // The mark of dread: a red slit eye over it, trembling.
            const m = scene.add.graphics().setDepth(14);
            const shake = scene.time.addEvent({
              delay: 50,
              repeat: 30,
              callback: () => {
                m.clear();
                if (!t.active) return;
                const [x, y] = [t.x + Phaser.Math.Between(-1, 1), t.y - t.displayHeight / 2 - 7];
                m.fillStyle(DESTRUCTION.outline).fillEllipse(x, y, 9, 5).fillStyle(DESTRUCTION.edge).fillEllipse(x, y, 7, 3);
                m.fillStyle(0x000000).fillRect(x - 0.5, y - 1.5, 1, 3);
              },
            });
            later(scene, 1600, () => (shake.remove(), m.destroy()));
          });
        }
      });
      later(scene, 1000, () =>
        scene.tweens.add({
          targets: head,
          alpha: 0,
          duration: 250,
          onComplete: () => {
            scene.events.off('update', draw);
            head.destroy();
          },
        }),
      );
      return dk ? 'AUMAN RAJA NAGA' : undefined;
    },
    // Breath of Destruction: he takes the half-dragon form for an instant and the head of the King of Dragons rises
    // over his shoulder, draws in a breath of red and black fire and exhales it as one roaring beam along the line that
    // burns the most enemies; the Flames of Destruction leave nothing but ash. Then the dragon swings its head and
    // drags the beam across the arena onto every enemy it has not burned yet, one after another.
    // In dragon form NAPAS SANG RAJA NAGA comes out of his own jaws: a thicker, longer beam that burns half again as hot.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const dk = p.dragon;
      const thick = dk ? 1.6 : 1;
      power *= dk ? 1.5 : 1;
      p.lock(1500);
      p.invuln(1600);
      p.setVelocity(0, 0);
      if (dk) p.setData('roarUntil', scene.time.now + 2400);
      const [hx, hy] = [p.x - f * 6, p.y - 24];
      const head = scene.add.graphics().setDepth(9);
      const st = { rise: 0, open: 0, aim: f > 0 ? 0 : Math.PI, alpha: 1 };
      scene.tweens.add({ targets: st, rise: 1, duration: 300, ease: 'Quad.Out' });
      scene.tweens.add({ targets: st, open: 1, delay: 420, duration: 90 });
      // The head tilts along the beam: it is drawn turned toward wherever the breath is pointed.
      const draw = () => {
        head.clear().setAlpha(st.alpha * Math.min(1, st.rise * 1.5));
        const tilt = f > 0 ? st.aim : Math.PI - st.aim;
        head.setPosition(hx, hy + (1 - st.rise) * 18).setRotation(f > 0 ? tilt : -tilt);
        if (!dk) dragonHead(head, 0, 0, f, 1.8, st.open);
      };
      scene.events.on('update', draw);
      const mouth = () =>
        dk ? ([p.x + f * 23, p.y - 6] as const) : ([hx + Math.cos(st.aim) * 24, hy + Math.sin(st.aim) * 24 + 2] as const);
      const len = dk ? 420 : 360;
      const onBeam = (a: number, t: Phaser.GameObjects.Sprite) => {
        const [mx, my] = mouth();
        const dx = t.x - mx;
        const dy = t.y - my;
        const along = dx * Math.cos(a) + dy * Math.sin(a);
        return along >= 0 && along <= len && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= 20 * thick;
      };
      // The breath drawn in: embers and black ash streaming into its jaws.
      for (let i = 0; i < 24; i++)
        later(scene, 200 + i * 12, () => {
          const [mx, my] = mouth();
          const r = Phaser.Math.Between(20, 40);
          const ang = Math.random() * Math.PI * 2;
          const m = scene.add
            .rectangle(mx + Math.cos(ang) * r, my + Math.sin(ang) * r, 2, 2, i % 3 ? DESTRUCTION.edge : DESTRUCTION.ash)
            .setDepth(13);
          scene.tweens.add({ targets: m, x: mx, y: my, duration: 180, onComplete: () => m.destroy() });
        });
      later(scene, 500, () => {
        // Aim when it fires: of the lines toward each enemy ahead (within 0.9 rad of straight ahead), take the one
        // that burns the most of them.
        const base = f > 0 ? 0 : Math.PI;
        const [mx, my] = mouth();
        const foes = world.targets(mx, my);
        let a = base;
        let best = foes.filter((t) => onBeam(base, t)).length;
        for (const t of foes) {
          const off = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(mx, my, t.x, t.y) - base);
          if (Math.abs(off) > 0.9) continue;
          const n = foes.filter((e) => onBeam(base + off, e)).length;
          if (n > best) [a, best] = [base + off, n];
        }
        st.aim = a;
        // The beam: a black-red sheath of ash fire around a crimson flame, an orange core and a white-hot thread.
        const beam = (
          [
            [36, DESTRUCTION.ash, 0.75],
            [24, DESTRUCTION.membrane, 0.9],
            [14, DESTRUCTION.edge, 1],
            [6, DESTRUCTION.belly, 1],
            [2, 0xfff1e8, 1],
          ] as const
        ).map(([h, c, al]) =>
          scene.add
            .rectangle(mx, my, len, h * thick, c, al)
            .setOrigin(0, 0.5)
            .setRotation(a)
            .setScale(0, 1)
            .setDepth(12),
        );
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 120 });
        const burned = new Set<Phaser.GameObjects.GameObject>();
        // Where the beam meets the floor the ground burns.
        const scorch = scene.time.addEvent({
          delay: 45,
          loop: true,
          callback: () => {
            const r = beam[0].rotation;
            const [bx, by] = [beam[0].x, beam[0].y];
            if (Math.sin(r) > 0.05) {
              const d = (FLOOR_Y - by) / Math.sin(r);
              if (d > 0 && d < len) flameTongue(scene, bx + Math.cos(r) * d + Phaser.Math.Between(-6, 6), FLOOR_Y, 12, 320, FIRE);
            }
            const d = Math.random() * len;
            const ash = scene.add
              .rectangle(bx + Math.cos(r) * d, by + Math.sin(r) * d, 1, 1, Math.random() < 0.5 ? DESTRUCTION.ash : 0x5f574f)
              .setDepth(13);
            scene.tweens.add({
              targets: ash,
              y: ash.y + 16,
              x: ash.x + Phaser.Math.Between(-6, 6),
              alpha: 0,
              duration: 700,
              onComplete: () => ash.destroy(),
            });
          },
        });
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
                scene.tweens.add({ targets: st, aim: to, duration: 90, ease: 'Sine.InOut' });
                rot = to;
                later(scene, 90, () => {
                  if (!t.active) return;
                  sparks(scene, t.x, t.y, [DESTRUCTION.edge, DESTRUCTION.belly, DESTRUCTION.ash], 8, 14);
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
            onComplete: () => {
              scorch.remove();
              beam.forEach((b) => b.destroy());
            },
          });
          scene.tweens.add({ targets: st, alpha: 0, open: 0, delay: at + 60, duration: 300 });
          later(scene, at + 400, () => {
            scene.events.off('update', draw);
            head.destroy();
            p.setData('roarUntil', 0);
          });
        });
        scene.cameras.main.shake(600, dk ? 0.028 : 0.02);
        for (let k = 0; k < 4; k++)
          later(scene, k * 150, () => {
            for (const t of world.targets(mx, my))
              if (onBeam(a, t)) {
                burned.add(t);
                world.strike(t, 1.1 * power, 'skill', k === 3, { burn: 0.4 });
              }
          });
      });
      return dk ? 'NAPAS SANG RAJA NAGA' : undefined;
    },
    // Monarch of Destruction: the King of Dragons stops pretending to be a man. The sky goes the color of blood and his
    // true body manifests over the arena: a colossal red dragon whose wings span the whole sky, beating slowly. It
    // roars, and the dragon army answers: dragon after dragon (Kamish was one of them) stoops out of the clouds onto
    // every enemy on the field, flyers too, bursting in fire as each one strikes. Then the great dragon itself opens
    // its jaws and the Breath of Destruction rakes the arena from one wall to the other, floor to sky. KEHANCURAN:
    // the last wave of fire takes everything, and Antares steps out of a pillar of black flame as the dragon.
    // Called while he already is the dragon, RAJA SEGALA NAGA: four more dragons answer, every blow lands 30% harder,
    // and the form starts over at full length.
    ult: ({ p, world, scene, power }) => {
      const foes0 = world.targets(p.x, p.y);
      if (!foes0.length) return false;
      const f = p.facing;
      const dk = p.dragon;
      power *= dk ? 1.3 : 1;
      // As many dragons as it takes to strike every enemy twice (6 to 10, 4 more in dragon form); the breath and the
      // climax follow them.
      const n = Phaser.Math.Clamp(foes0.length * 2, 6, 10) + (dk ? 4 : 0);
      const SWEEP = 1000 + n * 110 + 500;
      p.invuln(SWEEP + 1300);
      p.lock(SWEEP + 900);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      cam.flash(250, 179, 18, 46);
      const sky = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x2a0008, 0.7)
        .setOrigin(0)
        .setDepth(2)
        .setAlpha(0);
      scene.tweens.add({ targets: sky, alpha: 1, duration: 400 });
      // Embers drifting up through the red air the whole time.
      const embers = scene.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          const e = scene.add
            .rectangle(Phaser.Math.Between(0, W), FLOOR_Y, 1, 2, Math.random() < 0.5 ? DESTRUCTION.edge : DESTRUCTION.belly)
            .setDepth(4);
          scene.tweens.add({ targets: e, y: Phaser.Math.Between(30, 120), alpha: 0, duration: 1400, onComplete: () => e.destroy() });
        },
      });
      // The colossus: drawn every frame, wings beating slow, jaws opening for the breath.
      const big = scene.add.graphics().setDepth(3);
      const cx = W / 2 - f * 40;
      // Big enough that its wings fill the sky, small enough that the head stays below the HUD.
      const BIG = 2.6;
      const st = { y: -60, flap: 1, open: 0, alpha: 1 };
      scene.tweens.add({ targets: st, y: 94, duration: 800, ease: 'Sine.Out' });
      const drawBig = () => {
        big.clear().setAlpha(st.alpha);
        const beat = Math.sin(scene.time.now / 260);
        redDragon(big, cx, st.y + beat * 2, f, BIG, 0.35 + beat * 0.55, st.open);
      };
      scene.events.on('update', drawBig);
      // The snout tip: the head sits at (19, -9) on the body and its snout reaches 14 units further (at 0.75 scale).
      const jaw = () => [cx + f * BIG * 29, st.y - BIG * 8.5] as const;
      later(scene, 800, () => {
        floatText(scene, W / 2, 34, 'ROAAAR!', '#ff004d');
        cam.shake(500, 0.025);
        const [jx, jy] = jaw();
        for (let k = 0; k < 4; k++)
          later(scene, k * 110, () => {
            ring(scene, jx, jy, DESTRUCTION.ash, 12, W, 600, 5);
            ring(scene, jx, jy, DESTRUCTION.edge, 10, W * 0.9, 560, 2);
          });
      });
      // The dragon army: each one stoops on a target from high up and bursts in fire on it.
      for (let i = 0; i < n; i++)
        later(scene, 1000 + i * 110, () => {
          const live = world.targets(p.x, p.y);
          const t = live[i % Math.max(1, live.length)];
          if (!t) return;
          const dir = i % 2 ? -1 : 1;
          const [x0, y0] = [dir > 0 ? -30 : W + 30, Phaser.Math.Between(10, 40)];
          const [x1, y1] = [t.x, t.y];
          const g = scene.add.graphics().setDepth(13);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 420,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              const x = x0 + (x1 - x0) * k;
              const y = (1 - k) ** 2 * y0 + 2 * (1 - k) * k * (y0 - 20) + k ** 2 * y1;
              g.clear();
              redDragon(g, x, y, Math.sign(x1 - x0) || 1, 0.7, Math.sin(k * 14) * 0.7);
            },
            onComplete: () => {
              g.destroy();
              explosion(scene, x1, y1, 16);
              cam.shake(70, 0.008);
              if (t.active) world.strike(t, 0.9 * power, 'ult', false, { burn: 0.3 }, 80);
            },
          });
        });
      // The Breath of Destruction from the colossus: one sweep from wall to wall, the beam's foot dragged along the floor.
      later(scene, SWEEP - 250, () => scene.tweens.add({ targets: st, open: 1, duration: 200 }));
      later(scene, SWEEP, () => {
        const beam = scene.add.graphics().setDepth(12);
        const hit = new Set<Phaser.GameObjects.GameObject>();
        const foot = { x: f > 0 ? 0 : W };
        scene.tweens.add({
          targets: foot,
          x: f > 0 ? W : 0,
          duration: 700,
          ease: 'Sine.InOut',
          onUpdate: () => {
            const [jx, jy] = jaw();
            beam.clear();
            for (const [w, c, al] of [
              [26, DESTRUCTION.ash, 0.7],
              [16, DESTRUCTION.membrane, 0.9],
              [9, DESTRUCTION.edge, 1],
              [4, DESTRUCTION.belly, 1],
              [1, 0xfff1e8, 1],
            ] as const)
              beam.lineStyle(w, c, al).lineBetween(jx, jy, foot.x, FLOOR_Y);
            flameTongue(scene, foot.x + Phaser.Math.Between(-8, 8), FLOOR_Y, 18, 360, FIRE);
            cam.shake(40, 0.006);
            // Everything near the line, floor to sky, is caught as it passes.
            for (const t of world.targets(foot.x, FLOOR_Y)) {
              if (hit.has(t)) continue;
              const k = Phaser.Math.Clamp((t.y - jy) / (FLOOR_Y - jy), 0, 1);
              if (Math.abs(t.x - (jx + (foot.x - jx) * k)) > 16) continue;
              hit.add(t);
              sparks(scene, t.x, t.y, [DESTRUCTION.edge, DESTRUCTION.belly, DESTRUCTION.ash], 10, 16);
              world.strike(t, 2 * power, 'ult', false, { burn: 0.5 }, 140);
            }
          },
          onComplete: () => scene.tweens.add({ targets: beam, alpha: 0, duration: 200, onComplete: () => beam.destroy() }),
        });
      });
      // KEHANCURAN: the last wave of fire, and he comes out of the pillar of black flame as the dragon.
      later(scene, SWEEP + 850, () => {
        cam.flash(260, 255, 0, 77);
        cam.shake(600, 0.035);
        floatText(scene, W / 2, 34, 'KEHANCURAN!', '#ff004d');
        for (let i = 0; i < 14; i++) flameTongue(scene, (i + 0.5) * (W / 14), FLOOR_Y, Phaser.Math.Between(26, 44), 600, FIRE);
        for (const t of world.targets(p.x, p.y)) world.strike(t, 1.6 * power, 'ult', true, { burn: 0.5 }, 200);
        const pillar = [
          scene.add.rectangle(p.x, FLOOR_Y, 30, FLOOR_Y, DESTRUCTION.ash, 0.85),
          scene.add.rectangle(p.x, FLOOR_Y, 16, FLOOR_Y, DESTRUCTION.edge, 0.9),
        ].map((r) => r.setOrigin(0.5, 1).setScale(0.2, 1).setDepth(11));
        scene.tweens.add({ targets: pillar, scaleX: 1.6, alpha: 0, duration: 500, onComplete: () => pillar.forEach((r) => r.destroy()) });
        p.transform(7000);
        embers.remove();
        scene.tweens.add({ targets: st, alpha: 0, y: st.y - 40, duration: 600 });
        scene.tweens.add({
          targets: sky,
          alpha: 0,
          duration: 700,
          onComplete: () => {
            scene.events.off('update', drawBig);
            big.destroy();
            sky.destroy();
          },
        });
      });
      return dk ? 'RAJA SEGALA NAGA' : undefined;
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
    // Amaterasu: the Mangekyo opens and bleeds, and whatever Itachi looks at catches fire. For 2.6 s the focus of his
    // eye is a red reticle on a thin line of sight: it glides onto the nearest enemy ahead of where he faces (turn
    // around and it swings to the other side, up into the air too), and where it settles the air folds in on itself
    // and a black flame bursts out of nothing. Amaterasu never goes out on its own: it eats its victim until it dies
    // (10 s at most) and leaps onto anything that touches a burning body.
    skill: ({ p, world, scene, power }) => {
      const all = world.targets(p.x, p.y);
      if (!all.length) return false;
      const GAZE = 2600;
      const BURN = 10000;
      const start = scene.time.now;
      // Within his sight: ahead of the way he faces, within ±0.7 rad, 230 px.
      const seen = (t: Phaser.GameObjects.Sprite) => {
        const a = Math.atan2(t.y - (p.y - 3), (t.x - p.x) * p.facing);
        return Math.abs(a) < 0.7 && Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 230;
      };
      // Nobody ahead: he turns his eyes to the nearest.
      if (!all.some(seen)) p.facing = all[0].x >= p.x ? 1 : -1;
      // Mangekyo: the eye flares and a tear of blood runs down his cheek.
      const glare = scene.add
        .image(p.x + p.facing * 2, p.y - 3, 'mangekyo')
        .setScale(0.2)
        .setDepth(14);
      scene.tweens.add({
        targets: glare,
        scale: 1.4,
        angle: 120,
        alpha: 0,
        duration: 420,
        ease: 'Quad.Out',
        onComplete: () => glare.destroy(),
      });
      scene.cameras.main.shake(90, 0.004);
      const burning = new Map<Phaser.GameObjects.Sprite, { until: number; next: number; ph: number }>();
      const sight = scene.add.graphics().setDepth(14);
      // The great flame behind the body (it rises above it), small tongues licking in front.
      const fire = scene.add.graphics().setDepth(4.8);
      const lick = scene.add.graphics().setDepth(13);
      let [fx, fy] = [p.x + p.facing * 30, p.y - 3];
      let nextIgnite = start + 250;
      // The focus folds in on itself and a black flame is born there.
      const ignite = (t: Phaser.GameObjects.Sprite, now: number, born: boolean) => {
        if (burning.has(t) || burning.size >= 10) return;
        burning.set(t, { until: now + BURN, next: now + 450, ph: Math.random() * 600 });
        ring(scene, t.x, t.y, 0x7e2553, 16, 2, 160, 2);
        ring(scene, t.x, t.y, 0xff004d, 10, 1, 140, 1);
        later(scene, 150, () => sparks(scene, t.x, t.y, [0x000000, 0x1c1c28, 0xff004d], 10, 14));
        if (born) scene.cameras.main.shake(70, 0.005);
        world.strike(t, (born ? 0.8 : 0.4) * power, 'skill', false, undefined, born ? 60 : 0);
      };
      const tick = () => {
        const now = scene.time.now;
        const gazing = now - start < GAZE && p.active;
        sight.clear();
        if (gazing) {
          const [ex, ey] = [p.x + p.facing * 2, p.y - 3];
          // The tear of blood.
          sight.fillStyle(0xff004d).fillRect(ex, ey + 1, 1, Math.min(4, 1 + (now - start) / 300));
          // The focus glides onto the nearest enemy in sight, or rests ahead of him.
          const t = world.targets(p.x, p.y).find((o) => seen(o) && !burning.has(o)) ?? world.targets(p.x, p.y).find(seen);
          const [gx, gy] = t ? [t.x, t.y] : [p.x + p.facing * 60, p.y - 3];
          fx += (gx - fx) * 0.25;
          fy += (gy - fy) * 0.25;
          sight.lineStyle(1, 0xff004d, 0.35).lineBetween(ex, ey, fx, fy);
          const spin = now / 120;
          sight.lineStyle(3, 0x1c1c28, 0.5).strokeCircle(fx, fy, 7);
          sight.lineStyle(1, 0xff004d, 0.9).strokeCircle(fx, fy, 7);
          for (let i = 0; i < 3; i++) {
            const a = spin + (i * Math.PI * 2) / 3;
            sight
              .fillStyle(0x000000)
              .fillTriangle(
                fx + Math.cos(a) * 3,
                fy + Math.sin(a) * 3,
                fx + Math.cos(a) * 8,
                fy + Math.sin(a) * 8,
                fx + Math.cos(a + 0.7) * 6,
                fy + Math.sin(a + 0.7) * 6,
              );
          }
          if (t && now >= nextIgnite && !burning.has(t) && Phaser.Math.Distance.Between(fx, fy, t.x, t.y) < 4) {
            nextIgnite = now + 260;
            ignite(t, now, true);
          }
        }
        fire.clear();
        lick.clear();
        for (const [t, b] of burning) {
          if (!t.active || now >= b.until) {
            burning.delete(t);
            // What is left of the flame drops to the floor and smoulders out.
            if (!t.active) flameTongue(scene, t.x, Math.min(FLOOR_Y, t.y + 6), 10, 500, [0x7e2553, 0x000000, 0x1c1c28]);
            continue;
          }
          const h = Math.max(20, t.displayHeight * 1.9);
          blackFlame(fire, t.x, t.y + t.displayHeight / 2 - 1, h, now + b.ph);
          blackFlame(lick, t.x, t.y + t.displayHeight / 2 - 1, h * 0.35, now + b.ph + 300);
          if (Math.random() < 0.25) {
            const ash = scene.add
              .rectangle(t.x + Phaser.Math.Between(-4, 4), t.y - h / 2, 1, 1, Math.random() < 0.7 ? 0x000000 : 0xff004d)
              .setDepth(13);
            scene.tweens.add({
              targets: ash,
              y: ash.y - Phaser.Math.Between(8, 16),
              x: ash.x + Phaser.Math.Between(-4, 4),
              alpha: 0,
              duration: 500,
              onComplete: () => ash.destroy(),
            });
          }
          if (now >= b.next) {
            b.next = now + 500;
            world.strike(t, 0.2 * power, 'skill', false, undefined, 0);
            // It leaps onto anything touching the burning body.
            for (const o of world.targets(t.x, t.y))
              if (
                o !== t &&
                Math.abs(o.x - t.x) < (o.displayWidth + t.displayWidth) / 2 + 4 &&
                Math.abs(o.y - t.y) < (o.displayHeight + t.displayHeight) / 2 + 2
              )
                ignite(o, now, false);
          }
        }
        if (!gazing && !burning.size) {
          scene.events.off('update', tick);
          sight.destroy();
          fire.destroy();
          lick.destroy();
        }
      };
      scene.events.on('update', tick);
    },
    // Izanami, the forbidden genjutsu that costs the eye that casts it. Itachi seals this moment: each enemy leaves a
    // pale ghost of itself where it stands, tied to it by a red thread of fate, and a loop of three tomoe turns over
    // the arena. Then the moment repeats, three times: Itachi's shadow steps out beside each enemy and makes the same
    // kunai cut, and when the loop closes reality rewinds: every enemy streaks back to its ghost (whatever it was
    // winding up is undone) and all the pain it took in that loop, his blows included, happens to it again. After the
    // third loop his Mangekyo goes grey and shut, the threads snap and the loop lets go.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 8);
      if (!foes.length) return false;
      const LOOPS = 3;
      const LOOP = 1300;
      const ECHO_CAP = 4 * power;
      p.lock(300);
      p.invuln(500);
      p.setVelocityX(0);
      type Bound = { t: Phaser.GameObjects.Sprite & { hp: number }; x: number; y: number; ghost: Phaser.GameObjects.Image; hp0: number };
      const bound: Bound[] = foes.map((t) => {
        const ghost = scene.add
          .image(t.x, t.y, t.texture.key, t.frame.name)
          .setFlipX(t.flipX)
          .setTint(0xc2c3c7)
          .setTintMode(Phaser.TintModes.FILL)
          .setAlpha(0)
          .setDepth(5);
        scene.tweens.add({ targets: ghost, alpha: 0.45, duration: 200 });
        return { t: t as Bound['t'], x: t.x, y: t.y, ghost, hp0: (t as Bound['t']).hp };
      });
      // The moment is sealed: the world drains toward grey.
      const pale = scene.add.rectangle(0, 0, W, H, 0x1d2b53, 0).setOrigin(0).setDepth(8);
      scene.tweens.add({ targets: pale, fillAlpha: 0.22, duration: 250 });
      scene.cameras.main.flash(120, 194, 195, 199);
      const glare = scene.add
        .image(p.x + p.facing * 2, p.y - 3, 'mangekyo')
        .setScale(0.2)
        .setDepth(14);
      scene.tweens.add({ targets: glare, scale: 1.2, angle: -120, alpha: 0, duration: 400, onComplete: () => glare.destroy() });
      const loopG = scene.add.graphics().setDepth(16);
      const threads = scene.add.graphics().setDepth(12);
      const t0 = scene.time.now;
      const END = LOOPS * LOOP + 200;
      // The loop over the arena (a ring of three tomoe, turning backward as the moment rewinds) and the threads.
      const draw = () => {
        const now = scene.time.now - t0;
        const [cx, cy] = [W / 2, 36];
        const k = (now % LOOP) / LOOP;
        const rew = now % LOOP > LOOP - 220;
        const spin = rew ? -((now % LOOP) - (LOOP - 220)) / 25 : k * Math.PI * 2;
        loopG.clear();
        loopG.lineStyle(4, 0x000000, 0.6).strokeCircle(cx, cy, 11);
        loopG
          .lineStyle(2, 0xff004d)
          .beginPath()
          .arc(cx, cy, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
          .strokePath();
        loopG.lineStyle(1, 0xc2c3c7, 0.6).strokeCircle(cx, cy, 14);
        for (let i = 0; i < 3; i++) {
          const a = spin + (i * Math.PI * 2) / 3;
          const [tx, ty] = [cx + Math.cos(a) * 6, cy + Math.sin(a) * 6];
          loopG.fillStyle(0x000000).fillCircle(tx, ty, 2.5);
          loopG.fillStyle(0xff004d).fillCircle(tx, ty, 1.5);
          loopG.lineStyle(1, 0x000000).lineBetween(tx, ty, cx + Math.cos(a - 0.6) * 9, cy + Math.sin(a - 0.6) * 9);
        }
        // The loops still to run, as dots under it.
        const left = LOOPS - Math.floor(now / LOOP);
        for (let i = 0; i < LOOPS; i++) loopG.fillStyle(i < left ? 0xff004d : 0x5f574f).fillRect(cx - 5 + i * 4, cy + 17, 2, 2);
        threads.clear();
        for (const b of bound) {
          if (!b.t.active) continue;
          // The red thread of fate, sagging between the enemy and its ghost.
          const [mx, my] = [(b.x + b.t.x) / 2, Math.max(b.y, b.t.y) + 8];
          threads.lineStyle(1, 0xff004d, 0.7).beginPath().moveTo(b.t.x, b.t.y);
          for (let s = 1; s <= 8; s++) threads.lineTo(...bez(b.t.x, b.t.y, mx, my, b.x, b.y, s / 8));
          threads.strokePath();
          threads.fillStyle(0xff004d).fillCircle(b.x, b.y, 1.5);
        }
      };
      scene.events.on('update', draw);
      // Each loop: the same cut, then the rewind and the echo.
      for (let n = 0; n < LOOPS; n++) {
        later(scene, n * LOOP + 150, () => {
          for (const b of bound) {
            if (!b.t.active) continue;
            b.hp0 = b.t.hp;
            const side = (n % 2 ? -1 : 1) * (b.t.x >= p.x ? -1 : 1);
            afterimage(scene, p, b.t.x + side * 12, b.t.y, 0.85, 0x1c1c28);
            cutMark(scene, b.t.x, b.t.y, 0xfff1e8, 14, n % 2 ? 0.9 : -0.9);
            sparks(scene, b.t.x, b.t.y, [0xff004d, 0xfff1e8], 5, 10);
            world.strike(b.t, 0.55 * power, 'skill', false, undefined, 0);
          }
        });
        later(scene, (n + 1) * LOOP - 60, () => {
          scene.cameras.main.shake(120, 0.008);
          for (const b of bound) {
            const t = b.t;
            if (!t.active) continue;
            // Rewind: a streak of fading copies from where it got to back to its ghost.
            for (let s = 1; s <= 4; s++) {
              const im = scene.add
                .image(Phaser.Math.Linear(t.x, b.x, s / 5), Phaser.Math.Linear(t.y, b.y, s / 5), t.texture.key, t.frame.name)
                .setFlipX(t.flipX)
                .setTint(0xff004d)
                .setTintMode(Phaser.TintModes.FILL)
                .setAlpha(0.15 + s * 0.1)
                .setDepth(12);
              scene.tweens.add({ targets: im, alpha: 0, duration: 260, onComplete: () => im.destroy() });
            }
            if (!('tier' in t)) {
              (t.body as Phaser.Physics.Arcade.Body).reset(b.x, b.y);
              (t as { interrupt?: (ms: number) => void }).interrupt?.(300);
            }
            ring(scene, b.x, b.y, 0xc2c3c7, 18, 3, 220, 1);
            // The moment happens again: the pain of this loop, once more.
            const pain = Math.max(0, b.hp0 - t.hp);
            const mult = Math.min(pain / Math.max(1, p.stats.damage), ECHO_CAP);
            if (mult > 0) later(scene, 80, () => t.active && world.strike(t, mult, 'proc', false, undefined, 0));
          }
        });
      }
      // The eye pays the price: grey and shut. The threads snap.
      later(scene, END, () => {
        scene.events.off('update', draw);
        loopG.destroy();
        threads.destroy();
        scene.tweens.add({ targets: pale, fillAlpha: 0, duration: 300, onComplete: () => pale.destroy() });
        const lid = scene.add.graphics().setDepth(14);
        lid.fillStyle(0x5f574f).fillRect(p.x + p.facing * 2 - 1, p.y - 3, 3, 1);
        scene.tweens.add({ targets: lid, alpha: 0, delay: 1200, duration: 300, onComplete: () => lid.destroy() });
        floatText(scene, W / 2, 64, 'TERIMA TAKDIR.', '#c2c3c7');
        for (const b of bound) {
          sparks(scene, b.ghost.x, b.ghost.y, [0xc2c3c7, 0xff004d], 8, 12);
          scene.tweens.add({ targets: b.ghost, alpha: 0, scale: 1.3, duration: 250, onComplete: () => b.ghost.destroy() });
        }
      });
    },
    // Tsukuyomi: Itachi's Mangekyo turns and fills the view, and every enemy is inside his world: a red sky under a
    // black moon, black clouds, each enemy bound to a cross and dimmed to a shadow of itself. Itachis step out of the
    // dark around every cross and stab, and stab, while a clock counts seventy-two hours down to nothing; nothing
    // hurts yet, every blow is only counted, tally marks over each cross. At zero the world closes like an eyelid.
    // It opens on the real arena, the same second they left: the whole seventy-two hours land at once, and whoever
    // survives wakes broken (TRAUMA): for 3.5 s it runs from Itachi in terror and cannot fight.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y).slice(0, 10);
      if (!targets.length) return false;
      const cam = scene.cameras.main;
      p.invuln(3800);
      p.lock(3000);
      p.setVelocityX(0);
      const eye = scene.add
        .image(W / 2, FLOOR_Y / 2, 'mangekyo')
        .setScale(0.5)
        .setDepth(16);
      scene.tweens.add({ targets: eye, scale: 7, angle: 240, duration: 450, ease: 'Quad.Out' });
      scene.tweens.add({ targets: eye, alpha: 0, delay: 450, duration: 200, onComplete: () => eye.destroy() });
      type Victim = Phaser.GameObjects.Sprite & { stunUntil?: number; flying?: boolean };
      const tally = new Map<Victim, number>();
      const parts: Phaser.GameObjects.GameObject[] = [];
      const clones: Phaser.GameObjects.Image[] = [];
      const marks = scene.add.graphics().setDepth(14);
      const key = p.texture.key;
      // In the dream they hang still on their crosses (their AI held, no ice).
      const hold = () => {
        for (const t of tally.keys()) {
          if (!t.active || 'tier' in t) continue;
          t.stunUntil = scene.time.now + 100;
          (t.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        }
        marks.clear();
        for (const [t, n] of tally) {
          if (!t.active) continue;
          // Tally marks over the cross, in fives.
          const top = t.y - t.displayHeight / 2 - 22;
          for (let i = 0; i < n; i++) {
            const grp = Math.floor(i / 5);
            const j = i % 5;
            const gx = t.x - 8 + grp * 7;
            if (j < 4) marks.fillStyle(0x000000).fillRect(gx + j * 1.5, top, 1, 5);
            else marks.lineStyle(1, 0xfff1e8).lineBetween(gx - 1, top + 4, gx + 6, top);
          }
        }
      };
      later(scene, 500, () => {
        cam.flash(150, 179, 18, 46);
        // The red world, behind the enemies: a sky fading darker toward the top, black clouds, a black moon.
        const sky = scene.add.graphics().setDepth(4);
        for (let i = 0; i < 6; i++)
          sky.fillStyle([0x3a0010, 0x5c0018, 0x7a0a22, 0x9c0f2a, 0xb3122e, 0xc8173a][i]).fillRect(0, (i * FLOOR_Y) / 6, W, FLOOR_Y / 6 + 1);
        sky.fillStyle(0x000000).fillCircle(W * 0.72, 38, 20);
        sky.lineStyle(2, 0xff004d).strokeCircle(W * 0.72, 38, 21);
        sky.lineStyle(1, 0xfff1e8, 0.5).strokeCircle(W * 0.72, 38, 24);
        for (const [cx, cy, cw] of [
          [40, 30, 70],
          [150, 18, 90],
          [260, 64, 80],
          [90, 80, 60],
        ])
          for (let k = 0; k < 4; k++) sky.fillStyle(0x000000, 0.85).fillEllipse(cx + (k - 1.5) * cw * 0.22, cy + (k % 2) * 3, cw * 0.4, 9);
        sky.fillStyle(0x000000).fillRect(0, FLOOR_Y - 2, W, H - FLOOR_Y + 2);
        sky.setAlpha(0);
        scene.tweens.add({ targets: sky, alpha: 1, duration: 150 });
        parts.push(sky);
        for (const t of targets as Victim[]) {
          if (!t.active) continue;
          tally.set(t, 0);
          if (!('tier' in t)) t.setTint(0x7e2553);
          // The cross it is bound to: dark wood outlined in black, ropes at the wrists.
          const h = Math.max(30, t.displayHeight + 18);
          const c = scene.add
            .graphics()
            .setPosition(t.x, t.y + t.displayHeight / 2)
            .setDepth(4.5);
          c.fillStyle(0x000000)
            .fillRect(-3, -h, 6, h + 2)
            .fillRect(-14, -h + 6, 28, 6);
          c.fillStyle(0x3b2418)
            .fillRect(-2, -h + 1, 4, h)
            .fillRect(-13, -h + 7, 26, 4);
          c.fillStyle(0x5f574f)
            .fillRect(-2, -h + 1, 1, h)
            .fillRect(-13, -h + 7, 26, 1);
          c.fillStyle(0xc2c3c7)
            .fillRect(-11, -h + 6, 1, 6)
            .fillRect(10, -h + 6, 1, 6);
          parts.push(c);
          // Three Itachis around it, black shadows with red eyes, blades drawn.
          for (const [dx, dy] of [
            [-16, 0],
            [16, 0],
            [0, -22],
          ]) {
            const k = scene.add
              .image(t.x + dx, t.y + dy, key)
              .setFlipX(dx > 0)
              .setTint(0x000000)
              .setTintMode(Phaser.TintModes.FILL)
              .setAlpha(0)
              .setDepth(13);
            scene.tweens.add({ targets: k, alpha: 1, delay: Phaser.Math.Between(0, 250), duration: 150 });
            k.setData('foe', t);
            clones.push(k);
          }
        }
        scene.events.on('update', hold);
      });
      // Seventy-two hours.
      const clock = scene.add
        .text(W / 2, 22, '72:00:00', { fontFamily: '"Press Start 2P", monospace', fontSize: '8px', color: '#fff1e8' })
        .setStroke('#000000', 3)
        .setOrigin(0.5)
        .setDepth(16)
        .setAlpha(0);
      later(scene, 650, () => clock.setAlpha(1));
      scene.tweens.addCounter({
        from: 72 * 3600,
        to: 0,
        delay: 750,
        duration: 1700,
        onUpdate: (tw) => {
          if (!clock.active) return;
          const v = Math.floor(tw.getValue() ?? 0);
          const pad = (n: number) => String(n).padStart(2, '0');
          clock.setText(`${pad(Math.floor(v / 3600))}:${pad(Math.floor(v / 60) % 60)}:${pad(v % 60)}`);
        },
      });
      // The stabs: one shadow per cross at a time, each blow only counted.
      const STABS = 15;
      for (let i = 0; i < STABS; i++)
        later(scene, 800 + i * 110, () => {
          for (const [t] of tally) {
            if (!t.active) continue;
            const mine = clones.filter((k) => k.getData('foe') === t);
            const k = mine[(i + Math.floor(t.x)) % mine.length];
            if (!k) continue;
            const a = Phaser.Math.Angle.Between(k.x, k.y, t.x, t.y);
            const blade = scene.add.rectangle(k.x, k.y, 12, 1, 0xfff1e8).setRotation(a).setDepth(13);
            scene.tweens.add({ targets: blade, x: t.x, y: t.y, alpha: 0, duration: 90, onComplete: () => blade.destroy() });
            scene.tweens.add({ targets: k, x: k.x + Math.cos(a) * 5, y: k.y + Math.sin(a) * 5, duration: 45, yoyo: true });
            const s = scene.add.rectangle(t.x + Phaser.Math.Between(-3, 3), t.y + Phaser.Math.Between(-4, 4), 2, 2, 0x000000).setDepth(14);
            scene.tweens.add({ targets: s, y: s.y + 6, alpha: 0, duration: 300, onComplete: () => s.destroy() });
            tally.set(t, tally.get(t)! + 1);
          }
          if (i % 3 === 0) cam.shake(70, 0.004);
        });
      // Zero: the world closes like an eyelid, red seam at the lash line.
      const upper = scene.add
        .rectangle(0, -H / 2, W, H / 2, 0x000000)
        .setOrigin(0)
        .setDepth(17);
      const lower = scene.add
        .rectangle(0, H, W, H / 2, 0x000000)
        .setOrigin(0)
        .setDepth(17);
      const seam = scene.add
        .rectangle(0, H / 2, W, 1, 0xff004d)
        .setOrigin(0, 0.5)
        .setDepth(18)
        .setAlpha(0);
      later(scene, 2550, () => {
        scene.tweens.add({ targets: upper, y: 0, duration: 170, ease: 'Quad.In' });
        scene.tweens.add({ targets: lower, y: H / 2, duration: 170, ease: 'Quad.In' });
        scene.tweens.add({ targets: seam, alpha: 1, delay: 170, duration: 60 });
      });
      // Behind the lids, the dream is gone.
      later(scene, 2760, () => {
        scene.events.off('update', hold);
        [...parts, ...clones, clock, marks].forEach((o) => o.destroy());
        for (const t of tally.keys()) if (t.active && !('tier' in t)) t.setTint(0xffffff);
        floatText(scene, W / 2, H / 2 - 14, '...SEDETIK.', '#fff1e8');
      });
      // The eye opens on the real arena: seventy-two hours land at once.
      later(scene, 3050, () => {
        scene.tweens.add({ targets: upper, y: -H / 2, duration: 220, ease: 'Quad.Out', onComplete: () => upper.destroy() });
        scene.tweens.add({ targets: lower, y: H, duration: 220, ease: 'Quad.Out', onComplete: () => lower.destroy() });
        scene.tweens.add({ targets: seam, alpha: 0, scaleY: 6, duration: 160, onComplete: () => seam.destroy() });
        cam.shake(400, 0.025);
        for (const [t, n] of tally) {
          if (!t.active) continue;
          ring(scene, t.x, t.y, 0xff004d, 4, 22, 300, 2);
          sparks(scene, t.x, t.y, [0x000000, 0xff004d, 0xfff1e8], 12, 18);
          world.strike(t, (n * 0.15 + 2) * power, 'ult', true, undefined, 60);
        }
        // TRAUMA: whoever survives runs from him in terror, unable to fight.
        later(scene, 120, () => {
          const SCARED = 3500;
          const until = scene.time.now + SCARED;
          const scared = [...tally.keys()].filter((t) => t.active && !('tier' in t));
          if (!scared.length) return;
          const sweat = scene.add.graphics().setDepth(14);
          const run = () => {
            const now = scene.time.now;
            sweat.clear();
            for (const t of scared) {
              if (!t.active) continue;
              t.stunUntil = Math.max(t.stunUntil ?? 0, now + 50);
              const dir = Math.sign(t.x - p.x) || 1;
              const body = t.body as Phaser.Physics.Arcade.Body;
              t.setFlipX(dir < 0);
              if (t.flying) body.setVelocity(dir * 80, t.y > 30 ? -50 : 0);
              else body.setVelocityX(body.blocked.left || body.blocked.right ? 0 : dir * 95);
              // Shaking, with a red "!!" over its head.
              const top = t.y - t.displayHeight / 2 - 8;
              const jx = Math.random() < 0.5 ? -1 : 1;
              sweat
                .fillStyle(0xff004d)
                .fillRect(t.x - 2 + jx * 0.5, top, 1, 4)
                .fillRect(t.x + 1 + jx * 0.5, top, 1, 4);
              sweat.fillRect(t.x - 2, top + 5, 1, 1).fillRect(t.x + 1, top + 5, 1, 1);
              if (Math.random() < 0.08) {
                const d = scene.add.rectangle(t.x + dir * -4, top + 6, 1, 2, 0x29adff).setDepth(14);
                scene.tweens.add({ targets: d, y: d.y + 8, alpha: 0, duration: 350, onComplete: () => d.destroy() });
              }
            }
            if (now >= until) {
              scene.events.off('update', run);
              sweat.destroy();
            }
          };
          scene.events.on('update', run);
          floatText(scene, W / 2, H / 2 + 4, 'TRAUMA', '#ff004d');
        });
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
    // Sandan-giri, the three-level cut of Edo kenjutsu: the three targets of a duel, each struck in turn and each doing
    // its own work. KOTE: a flick of the blade at the wrists of everything in front of him; their weapons drop, any
    // attack being wound up is cancelled and they cannot strike for a moment. DO: he slides along the floor through the
    // whole line in front of him, a level cut across the body of every enemy standing on the ground. MEN: he leaps and
    // brings the blade straight down on the highest enemy (a flyer if there is one) from above, the cut running on down
    // to the floor and swatting nearby flyers down with it. He lands and sheathes the blade:
    // IPPON, a clean point: any enemy that took two or more of the three cuts has its wounds open together.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      const f = p.facing;
      const cuts = new Map<Phaser.GameObjects.Sprite, number>();
      const mark = (t: Phaser.GameObjects.Sprite) => cuts.set(t, (cuts.get(t) ?? 0) + 1);
      p.invuln(1600);
      p.lock(1300);
      p.setVelocity(0, 0);
      glint(scene, p.x + f * 4, p.y + 2);
      // KOTE: the wrists of everything in front of him, near and far.
      later(scene, 120, () => {
        if (!p.active) return;
        floatText(scene, p.x + f * 30, p.y - 34, 'KOTE!', '#fff1e8');
        bladeLine(scene, p.x, p.y + 1, Phaser.Math.Clamp(p.x + f * 40, 0, W), p.y - 2, 0xfff1e8, 80);
        for (const t of world.targets(p.x, p.y)) {
          const dx = (t.x - p.x) * f;
          if (dx < -8 || dx > 120 || Math.abs(t.y - p.y) > 50) continue;
          // A short flick across each forearm, the weapon knocked loose and spinning away.
          const [hx, hy] = [t.x - f * 4, t.y + 2];
          bladeLine(scene, hx - 5, hy - 3, hx + 5, hy + 3, 0xff004d, 60);
          const drop = scene.add.rectangle(hx, hy, 6, 1, 0xc2c3c7).setDepth(12);
          scene.tweens.add({
            targets: drop,
            x: hx + f * 10,
            y: Math.min(hy + 18, FLOOR_Y - 1),
            angle: 540,
            alpha: 0,
            duration: 450,
            onComplete: () => drop.destroy(),
          });
          mark(t);
          world.strike(t, 0.6 * power, 'skill', true, undefined, 0);
          if (!t.active || 'tier' in t) continue;
          (t as Phaser.GameObjects.Sprite & { interrupt?: (ms: number) => void }).interrupt?.(1600);
        }
      });
      // DO: a level cut through the body of the whole line in front of him, sliding along the floor.
      later(scene, 450, () => {
        if (!p.active) return;
        const [fx, fy] = [p.x, p.y];
        const nx = Phaser.Math.Clamp(fx + f * 150, 10, W - 10);
        floatText(scene, (fx + nx) / 2, fy - 20, 'DO!', '#fff1e8');
        afterimage(scene, p, fx, fy, 0.5);
        bladeLine(scene, fx, fy - 1, nx, fy - 1, 0xff004d, 180);
        p.body.reset(nx, fy);
        cam.shake(120, 0.01);
        for (const t of world.targets(fx, fy)) {
          if ((t.x - fx) * f < -6 || (t.x - nx) * f > 8 || Math.abs(t.y - fy) > 18) continue;
          mark(t);
          cutMark(scene, t.x, t.y, 0xff004d, 24, 0);
          world.strike(t, 1.8 * power, 'skill', true, undefined, 160);
        }
      });
      // MEN: straight down on the highest enemy from above, on through to the floor.
      later(scene, 850, () => {
        if (!p.active) return;
        const foes = world.targets(p.x, p.y);
        if (!foes.length) return;
        const top = foes.reduce((b, e) => (e.y < b.y ? e : b));
        const [tx, ty] = [top.x, top.y];
        floatText(scene, tx, Math.max(ty - 32, 16), 'MEN!', '#fff1e8');
        afterimage(scene, p, p.x, p.y, 0.5);
        afterimage(scene, p, tx, Math.max(ty - 22, 10), 0.8, 0xff004d);
        bladeLine(scene, tx, Math.max(ty - 30, 0), tx, FLOOR_Y, 0xff004d, 200);
        bladeLine(scene, tx, Math.max(ty - 30, 0), tx, FLOOR_Y, 0xfff1e8, 120);
        p.body.reset(Phaser.Math.Clamp(tx - f * 6, 8, W - 8), FLOOR_Y - 8);
        cam.flash(70, 255, 241, 232);
        cam.shake(160, 0.014);
        sparks(scene, tx, FLOOR_Y - 2, [0xfff1e8, 0x5f574f], 10, 18);
        for (const t of foes) {
          if (Math.abs(t.x - tx) > 12 && t !== top) continue;
          mark(t);
          cutMark(scene, t.x, t.y, 0xfff1e8, 26, Math.PI / 2);
          world.strike(t, (t === top ? 2.2 : 1.2) * power, 'skill', true);
        }
        world.slam(tx, ty, 40, 320);
      });
      // Sheathe. Two or more cuts on one enemy is a clean point: the wounds open together.
      later(scene, 1250, () => {
        if (p.active) glint(scene, p.x - p.facing * 2, p.y + 3);
        const ippon = [...cuts].filter(([t, n]) => n >= 2 && t.active).map(([t]) => t);
        if (!ippon.length) return;
        floatText(scene, W / 2, 40, 'IPPON!', '#ff004d');
        cam.shake(220, 0.018);
        for (const t of ippon) {
          for (const a of [0, Math.PI / 2, 0.5]) cutMark(scene, t.x, t.y, 0xff004d, 34, a);
          world.strike(t, 2 * power, 'skill', true);
        }
      });
    },
    // Ukiyo no Issen, the one cut of the floating world: the battle becomes an Edo woodblock print. Washi paper washes
    // over the night, ink hills rise behind a red sun, and time stops. He stands in iai stance and never seems to move:
    // one by one a black brush stroke is laid across every enemy (his ink silhouette flickers beside each), then the
    // brush sweeps one enso, the zen circle, around the whole field. He sheathes the katana slowly. On the click every
    // stroke turns red and opens, his red seal is stamped on the print, and the paper tears in two along a diagonal and
    // falls away, back to the night.
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const [ox, oy, f] = [p.x, p.y, p.facing];
      const INK = 0x1d1b2a;
      p.invuln(3600);
      p.lock(3100);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      cam.flash(150, 255, 241, 232);
      // The print: two halves of paper meeting along a ragged diagonal (so it can tear there later).
      const tear: [number, number][] = [];
      for (let i = 0; i <= 10; i++) tear.push([W * 0.62 - (W * 0.24 * i) / 10 + (i % 2 ? 3 : -3), (H * i) / 10]);
      const half = (pts: [number, number][]) => {
        const g = scene.add.graphics().setDepth(8).setAlpha(0);
        g.fillStyle(0xf3e6c8, 0.75).fillPoints(
          pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)),
          true,
        );
        return g;
      };
      const paper = [half([[0, 0], ...tear, [0, H]]), half([[W, 0], ...tear, [W, H]])];
      // Ink landscape and the red sun, painted on the paper.
      const art = scene.add.graphics().setDepth(8.2).setAlpha(0);
      const sx = Phaser.Math.Clamp(ox, 50, W - 50);
      art.fillStyle(0xff004d, 0.85).fillCircle(sx, 62, 26);
      art.fillStyle(INK, 0.35).fillTriangle(-20, FLOOR_Y, 70, 70, 160, FLOOR_Y).fillTriangle(120, FLOOR_Y, 230, 52, 340, FLOOR_Y);
      art.fillStyle(0xfff1e8, 0.5).fillTriangle(213, 64, 230, 52, 247, 64);
      art.lineStyle(2, INK, 0.8).lineBetween(0, FLOOR_Y, W, FLOOR_Y);
      for (let x = 10; x < W; x += 40) art.lineStyle(1, INK, 0.5).strokeEllipse(x, FLOOR_Y + 6, 18, 4);
      scene.tweens.add({ targets: [...paper, art], alpha: 1, duration: 400 });
      floatText(scene, W / 2, 34, 'UKIYO...', '#ff004d');
      glint(scene, ox + f * 6, oy - 1);
      // Time stops.
      for (const t of foes) world.strike(t, 0.2 * power, 'ult', false, { freeze: 2900 }, 0);
      // A tapered sumi stroke: thin at both ends, full in the middle, dry-brush hairs along it.
      const brush = (g: Phaser.GameObjects.Graphics, x: number, y: number, a: number, len: number, color: number) => {
        const [c, s] = [Math.cos(a), Math.sin(a)];
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i <= 8; i++) {
          const u = i / 8 - 0.5;
          const w = 3.5 * Math.sin((i / 8) * Math.PI);
          pts.push(new Phaser.Math.Vector2(x + c * u * len - s * w, y + s * u * len + c * w));
        }
        for (let i = 8; i >= 0; i--) {
          const u = i / 8 - 0.5;
          const w = 1.5 * Math.sin((i / 8) * Math.PI);
          pts.push(new Phaser.Math.Vector2(x + c * u * len + s * w, y + s * u * len - c * w));
        }
        g.fillStyle(color).fillPoints(pts, true);
        for (const o of [-4, 4.5])
          g.lineStyle(1, color, 0.6).lineBetween(
            x - c * len * 0.1 - s * o,
            y - s * len * 0.1 + c * o,
            x + c * len * 0.55 - s * o,
            y + s * len * 0.55 + c * o,
          );
      };
      const STEP = 80;
      const strokes = foes.map((t, i) => {
        const g = scene.add.graphics().setDepth(13);
        const a = (i % 2 ? -1 : 1) * Phaser.Math.FloatBetween(0.5, 0.9);
        later(scene, 600 + i * STEP, () => {
          if (!t.active) return;
          brush(g, t.x, t.y, a, 34, INK);
          const gx = Phaser.Math.Clamp(t.x - (Math.sign(t.x - ox) || f) * 12, 8, W - 8);
          afterimage(scene, p, gx, Math.min(t.y, FLOOR_Y - 8), 0.7, INK);
          world.strike(t, 0.8 * power, 'ult', false, undefined, 0);
          cam.shake(40, 0.004);
        });
        return { g, t, a };
      });
      // The enso: one sweep of the brush around the whole field, thick in the middle, a gap where it lifts.
      const T1 = 600 + foes.length * STEP + 150;
      const enso = scene.add.graphics().setDepth(8.4);
      const [ex, ey] = [W / 2, 86];
      later(scene, T1, () =>
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 450,
          ease: 'Sine.InOut',
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            enso.clear();
            const N = Math.floor(48 * k);
            for (let i = 0; i < N; i++) {
              const [a0, a1] = [-2.3 + (i / 48) * Math.PI * 1.85, -2.3 + ((i + 1) / 48) * Math.PI * 1.85];
              enso.lineStyle(2 + 4 * Math.sin((i / 48) * Math.PI), INK, 0.85);
              enso.lineBetween(ex + Math.cos(a0) * 145, ey + Math.sin(a0) * 66, ex + Math.cos(a1) * 145, ey + Math.sin(a1) * 66);
            }
          },
        }),
      );
      // The slow sheathe.
      const T2 = T1 + 550;
      later(scene, T2, () => {
        if (!p.active) return;
        p.facing = f;
        floatText(scene, ox, oy - 22, '...', '#1d1b2a');
      });
      // The click: every stroke turns red and opens; the seal; then the paper tears and falls away.
      const T3 = T2 + 450;
      later(scene, T3, () => {
        if (p.active) glint(scene, p.x - f * 2, p.y + 3);
        floatText(scene, W / 2, 112, 'ZAN!', '#ff004d');
        cam.flash(220, 255, 241, 232);
        cam.shake(450, 0.03);
        for (const { g, t, a } of strokes) {
          g.clear();
          if (!t.active) continue;
          brush(g, t.x, t.y, a, 40, 0xff004d);
          cutMark(scene, t.x, t.y, 0xff004d, 44, a);
          world.strike(t, 4.6 * power, 'ult', true);
        }
        // The seal: a red square stamped in the corner of the print, white strokes cut into it.
        const seal = scene.add.graphics().setDepth(13);
        seal.fillStyle(0xff004d).fillRect(W - 34, 26, 16, 16);
        seal
          .fillStyle(0xf3e6c8)
          .fillRect(W - 31, 29, 10, 1)
          .fillRect(W - 27, 29, 1, 10)
          .fillRect(W - 31, 33, 4, 1)
          .fillRect(W - 24, 32, 1, 7)
          .fillRect(W - 31, 38, 10, 1);
        later(scene, 350, () => {
          scene.tweens.add({ targets: [paper[0], seal], x: -50, angle: -4, alpha: 0, duration: 550, ease: 'Quad.In' });
          scene.tweens.add({ targets: paper[1], x: 50, angle: 4, alpha: 0, duration: 550, ease: 'Quad.In' });
          scene.tweens.add({
            targets: [art, enso, ...strokes.map((s) => s.g)],
            alpha: 0,
            duration: 500,
            onComplete: () => [...paper, seal, art, enso, ...strokes.map((s) => s.g)].forEach((o) => o.destroy()),
          });
        });
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

  // Lightning Lord, heir of Raijin, the thunder god who drums the storm. His lightning is violet with a white-hot core;
  // everything he does keeps time with the beat of his drums (BEAT, IRAMA GUNTUR in passives.ts).
  halilintar: {
    // DON!: the finisher's twin downstroke booms out ahead of him in rings of sound that shove what they meet.
    onSwing: ({ p, world, scene, power }, _m, step) => {
      if (step !== 3) return;
      later(scene, 100, () => {
        if (!p.active) return;
        const f = p.facing;
        const [x, y] = [p.x + f * 10, p.y - 2];
        boom(scene, x, y, f > 0 ? 0 : Math.PI, 3, 48, 300);
        sparks(scene, x, y, [RAIJIN.bolt, RAIJIN.spark, RAIJIN.core], 8, 16);
        for (const t of world.targets(x, y))
          if ((t.x - x) * f > -6 && Phaser.Math.Distance.Between(x, y, t.x, t.y) < 48)
            world.strike(t, 0.5 * power, 'proc', false, undefined, 160);
      });
    },
    // A blow landed on the beat also sets off the drums of TAIKO PETIR if they are out (the skill leaves its trigger
    // on the player).
    onHit: ({ p, scene }) => (p.getData('taiko') as ((now: number) => void) | undefined)?.(scene.time.now),
    // Dentum Jatuh: he lands bachi-first and the floor takes the blow like a drumhead: a boom, and a ripple runs out
    // along the floor both ways, bouncing whatever stands on it up into the air as it passes.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const R = 72;
      boom(scene, x, gy - 3, null, 3, 36, 340);
      sparks(scene, x, gy - 2, [RAIJIN.bolt, RAIJIN.core], 8, 14);
      const g = scene.add.graphics().setDepth(9);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 380,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          const d = k * R;
          const A = 5 * (1 - k);
          g.clear();
          for (const s of [-1, 1])
            for (const [w, c] of [
              [3, RAIJIN.fringe],
              [1, RAIJIN.core],
            ] as const) {
              g.lineStyle(w, c, 1 - k).beginPath();
              for (let u = 0; u <= d + 10; u += 2) {
                const y = gy - 1 - A * Math.max(0, 1 - Math.abs(u - d) / 10) - Math.sin(u / 3) * 0.6;
                if (u) g.lineTo(x + s * u, y);
                else g.moveTo(x, y);
              }
              g.strokePath();
            }
        },
        onComplete: () => g.destroy(),
      });
      for (const t of world.targets(x, gy)) {
        if (Math.abs(t.x - x) > R || t.y < gy - 30) continue;
        later(scene, (Math.abs(t.x - x) / R) * 380, () => {
          if (!t.active) return;
          sparks(scene, t.x, t.y + 4, [RAIJIN.bolt, RAIJIN.spark], 5, 10);
          world.strike(t, 0.55 * power, 'proc', false, undefined, 0);
          if (!('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-190);
        });
      }
    },
    // Taiko Petir (Thunder Drums): he tears three drums off the ring on his back and hurls them spinning at the crowd.
    // They land and stand where the enemies are thickest (one hangs in the air among the flyers, if there are any).
    // For 6 s they keep his time: every second beat each drum booms by itself, its skin flaring, and a bolt leaps from
    // it to the nearest enemy; every blow he lands ON the beat makes all three boom with him. When their time is up
    // they boom together one last time, burst in sparks, and fly home to his ring.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      p.lock(320);
      p.setVelocityX(0);
      const LIFE = 6000;
      const REACH = 95;
      const air = (t: Phaser.GameObjects.Sprite) => t.y < FLOOR_Y - 34;
      const crowd = (x: number) => foes.filter((o) => Math.abs(o.x - x) < 50).length;
      // Where they land: the thickest crowd first, then the next ones at least 44 px apart; a flyer gets a drum of its
      // own in the air; any left over spread out round the first.
      const spots: { x: number; y: number }[] = [];
      const flyer = foes.find(air);
      if (flyer) spots.push({ x: Phaser.Math.Clamp(flyer.x, 16, W - 16), y: Math.max(26, flyer.y - 4) });
      for (const t of [...foes].filter((o) => !air(o)).sort((a, b) => crowd(b.x) - crowd(a.x))) {
        if (spots.length >= 3) break;
        if (spots.some((s) => Math.abs(s.x - t.x) < 44)) continue;
        spots.push({ x: Phaser.Math.Clamp(t.x, 16, W - 16), y: FLOOR_Y - 7 });
      }
      for (let i = 0; spots.length < 3; i++) {
        const base = spots[0] ?? { x: p.x + p.facing * 60, y: FLOOR_Y - 7 };
        spots.push({ x: Phaser.Math.Clamp(base.x + (i % 2 ? -1 : 1) * 52 * (1 + (i >> 1)), 16, W - 16), y: FLOOR_Y - 7 });
      }
      p.setData('drumsOut', 3);
      type Drum = { x: number; y: number; lit: number; rot: number; landed: boolean };
      const drums: Drum[] = spots.map(() => ({ x: p.x, y: p.y - 10, lit: 0, rot: 0, landed: false }));
      const g = scene.add.graphics().setDepth(11);
      // The throw: each drum spins out from his back along a high arc and slams down on its spot.
      drums.forEach((d, i) => {
        const [x0, y0] = [p.x - p.facing * 3, p.y - 10];
        const s = spots[i];
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          delay: i * 90,
          duration: 330,
          ease: 'Sine.In',
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            [d.x, d.y] = bez(x0, y0, (x0 + s.x) / 2, Math.min(y0, s.y) - 50, s.x, s.y, k);
            d.rot = k * 12;
          },
          onComplete: () => {
            d.landed = true;
            d.lit = 1;
            boom(scene, s.x, s.y, null, 2, 26, 280);
            if (s.y > FLOOR_Y - 20) rocks(scene, s.x, FLOOR_Y - 2, 3);
            scene.cameras.main.shake(60, 0.006);
            world.area(s.x, s.y, 14, 0.6 * power, 120, 'skill');
          },
        });
      });
      // A boom: the skin flares, a ring of sound, and a bolt to the nearest enemy within reach.
      const fire = (d: Drum) => {
        if (!d.landed) return;
        d.lit = 1;
        boom(scene, d.x, d.y, null, 1, 20, 220);
        const t = world.targets(d.x, d.y).find((o) => Phaser.Math.Distance.Between(d.x, d.y, o.x, o.y) < REACH);
        if (!t) return;
        stormArc(scene, d.x, d.y - 4, t.x, t.y, 200, 1, 1, RAI);
        sparks(scene, t.x, t.y, [RAIJIN.bolt, RAIJIN.spark, RAIJIN.core], 5, 10);
        world.strike(t, 0.25 * power, 'skill', false, { freeze: 200 }, 40);
      };
      let lastBeat = -1;
      let lastPlayed = -1;
      const born = scene.time.now;
      p.setData('taiko', (now: number) => {
        if (!onBeat(now) || beatOf(now) === lastPlayed) return;
        lastPlayed = beatOf(now);
        drums.forEach(fire);
      });
      const loop = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          const now = scene.time.now;
          const b = Math.floor(now / BEAT);
          if (b !== lastBeat && now - born > 400) {
            lastBeat = b;
            // On its own every second beat (and never twice in a beat he already played).
            if (b % 2 === 0 && beatOf(now) !== lastPlayed) drums.forEach(fire);
          }
          g.clear();
          for (const d of drums) {
            d.lit = Math.max(0, d.lit - 0.06);
            if (d.landed && d.y > FLOOR_Y - 20) {
              // Standing drums sit on a little stand of two black legs.
              g.lineStyle(1, RAIJIN.rim)
                .lineBetween(d.x - 3, d.y + 3, d.x - 5, FLOOR_Y)
                .lineBetween(d.x + 3, d.y + 3, d.x + 5, FLOOR_Y);
            }
            const bob = d.landed && d.y <= FLOOR_Y - 20 ? Math.sin(now / 260 + d.x) * 1.5 : 0;
            taiko(g, d.x, d.y + bob, 4, d.rot + now / 900, d.lit);
          }
        },
      });
      later(scene, LIFE, () => {
        loop.remove();
        p.setData('taiko', undefined);
        scene.cameras.main.shake(140, 0.01);
        for (const d of drums) {
          boom(scene, d.x, d.y, null, 3, 30, 320);
          sparks(scene, d.x, d.y, [RAIJIN.bolt, RAIJIN.lacquer, RAIJIN.core], 10, 18);
          if (d.landed) world.area(d.x, d.y, 24, 0.6 * power, 120, 'skill', { freeze: 300 });
        }
        // The drums fly home to his ring.
        const [hx, hy] = [p.x, p.y - 10];
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 300,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            g.clear();
            for (const d of drums) taiko(g, d.x + (p.x - d.x) * k, d.y + (p.y - 10 - d.y) * k, 4 * (1 - k * 0.6), k * 10, 0);
          },
          onComplete: () => {
            g.destroy();
            p.setData('drumsOut', 0);
            glint(scene, hx, hy);
          },
        });
      });
    },
    // Sambaran Balik (Return Stroke): a lightning lord strikes the way real lightning does. He raises both bachi and
    // beats once: a thundercloud boils up over the arena and every enemy under it (up to eight, flyers too) is held,
    // hair on end. From the cloud, stepped leaders feel their way down toward each of them in jerky, branching steps;
    // from each enemy a thin streamer reaches up to meet its leader. The moment they touch, the return stroke runs
    // the whole channel at once: a blinding white bolt on every enemy together, one flash. The thunder comes after
    // the light: a beat later the boom rolls out of every strike point and throws them all into the air.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 8);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const STRIKE = 950;
      p.lock(STRIKE + 200);
      p.invuln(STRIKE + 400);
      p.setVelocity(0, 0);
      boom(scene, p.x, p.y - 8, null, 2, 24, 280);
      // The cloud boils up: a dimmed sky and dark banks across the top, lit violet from inside.
      const dim = scene.add.rectangle(0, 0, W, H, 0x0b0618, 0.45).setOrigin(0).setDepth(8).setAlpha(0);
      const cloud = scene.add.graphics().setDepth(8.5).setAlpha(0);
      for (let i = 0; i < 9; i++) {
        const [x, y] = [i * 40 + Phaser.Math.Between(-6, 6), 8 + (i % 2) * 5];
        cloud.fillStyle(0x140d24).fillEllipse(x, y, 64, 22);
        cloud.fillStyle(RAIJIN.fringe, 0.35).fillEllipse(x, y + 7, 46, 7);
      }
      scene.tweens.add({ targets: [dim, cloud], alpha: 1, duration: 250 });
      // Held under the cloud, sparks crawling over them.
      for (const t of foes) world.afflict(t, { freeze: STRIKE + 500 });
      // Each leader: a path of short kinked steps from the cloud down to its enemy, with dead-end side branches.
      type Leader = { t: Phaser.GameObjects.Sprite; path: [number, number][]; forks: [number, number][][]; x: number; y: number };
      const leaders: Leader[] = foes.map((t) => {
        let [x, y] = [Phaser.Math.Clamp(t.x + Phaser.Math.Between(-40, 40), 6, W - 6), 14];
        const path: [number, number][] = [[x, y]];
        const forks: [number, number][][] = [];
        while (y < t.y - 14) {
          const left = t.y - 14 - y;
          const step = Math.min(left, Phaser.Math.Between(7, 12));
          x += (t.x - x) * (step / (left + step)) * 1.6 + Phaser.Math.Between(-5, 5);
          y += step;
          path.push([x, y]);
          if (Math.random() < 0.35) {
            const s = Math.random() < 0.5 ? -1 : 1;
            forks.push(jag(x, y, x + s * Phaser.Math.Between(8, 18), y + Phaser.Math.Between(6, 14), 2));
          }
        }
        return { t, path, forks, x: t.x, y: t.y };
      });
      const g = scene.add.graphics().setDepth(13);
      let shown = 0;
      let streamer = 0;
      let stroke = 0;
      const draw = () => {
        g.clear();
        for (const l of leaders) {
          if (l.t.active) [l.x, l.y] = [l.t.x, l.t.y];
          const n = Math.min(l.path.length, shown);
          const bright = stroke > 0;
          for (const [w, c, a] of (bright
            ? [
                [6, RAIJIN.fringe, 0.5 * stroke],
                [3, RAIJIN.bolt, stroke],
                [1, RAIJIN.core, stroke],
              ]
            : [
                [2, RAIJIN.fringe, 0.6],
                [1, RAIJIN.bolt, 0.8],
              ]) as [number, number, number][]) {
            g.lineStyle(w, c, a).beginPath().moveTo(l.path[0][0], l.path[0][1]);
            for (let i = 1; i < n; i++) g.lineTo(l.path[i][0], l.path[i][1]);
            if (bright) g.lineTo(l.x, l.y);
            g.strokePath();
          }
          // The side branches that led nowhere, faint.
          for (const f of l.forks) {
            if (!l.path.some(([x, y], i) => i < n && x === f[0][0] && y === f[0][1])) continue;
            g.lineStyle(1, RAIJIN.fringe, bright ? 0.8 * stroke : 0.5).strokePoints(f.map(([x, y]) => V2(x, y)));
          }
          // The streamer climbing up from the enemy to meet it.
          if (streamer > 0 && !bright) {
            const h = 14 * streamer;
            g.lineStyle(1, RAIJIN.spark, 0.9).lineBetween(l.x, l.y - 4, l.x + Math.sin(l.y + h) * 2, l.y - 4 - h);
            g.fillStyle(RAIJIN.core).fillRect(l.x - 0.5, l.y - 4.5 - h, 1, 1);
          }
          if (Math.random() < 0.3) sparks(scene, l.x, l.y, [RAIJIN.bolt, RAIJIN.spark], 1, 6);
        }
      };
      scene.events.on('update', draw);
      // The leaders step down, one jerk at a time; the streamers rise to meet them.
      const steps = Math.max(...leaders.map((l) => l.path.length));
      for (let i = 1; i <= steps; i++) later(scene, 200 + ((i - 1) * (STRIKE - 350)) / steps, () => (shown = i));
      scene.tweens.addCounter({ from: 0, to: 1, delay: STRIKE - 350, duration: 330, onUpdate: (tw) => (streamer = tw.getValue() ?? 0) });
      // Contact: the return stroke, on everyone at once.
      later(scene, STRIKE, () => {
        shown = steps;
        cam.flash(160, 255, 241, 232);
        scene.tweens.addCounter({ from: 1, to: 0, duration: 380, ease: 'Quad.In', onUpdate: (tw) => (stroke = tw.getValue() ?? 0) });
        for (const l of leaders) {
          ring(scene, l.x, l.y, RAIJIN.core, 3, 20, 220, 2);
          sparks(scene, l.x, l.y, [RAIJIN.bolt, RAIJIN.spark, RAIJIN.core], 10, 18);
          if (l.y > FLOOR_Y - 30) rocks(scene, l.x, FLOOR_Y - 2, 3);
          if (l.t.active) world.strike(l.t, 2.2 * power, 'skill', true, { freeze: 400 }, 0);
        }
      });
      // The thunder, a beat after the light.
      later(scene, STRIKE + 300, () => {
        cam.shake(350, 0.022);
        for (const l of leaders) {
          boom(scene, l.x, l.y, null, 3, 34, 380);
          if (!l.t.active) continue;
          world.strike(l.t, 0.8 * power, 'skill', false, undefined, 120);
          if (!('tier' in l.t) && !l.t.getData('elite')) (l.t as Phaser.Physics.Arcade.Sprite).setVelocityY(-200);
        }
      });
      later(scene, STRIKE + 450, () => {
        scene.events.off('update', draw);
        g.destroy();
        scene.tweens.add({ targets: [dim, cloud], alpha: 0, duration: 400, onComplete: () => (dim.destroy(), cloud.destroy()) });
      });
    },
    // Genderang Langit (Drums of Heaven): Raijin's own war. The sky goes black and the storm rolls in; the drum ring
    // leaves his back and rises over the arena, swelling into eight great taiko on a hoop of black iron, and he rises
    // into the middle of it. Then he plays. The beats come slow, then faster and faster, an accelerating roll: with
    // every beat one drum booms and a bolt leaps from it onto an enemy (round the whole arena, flyers too), each
    // shaking the screen a little harder. At the top of the roll he stops, raises both bachi, and brings them down on
    // all eight at once: DON! A white flash, every drum fires a bolt to the floor, and a thunderclap of sound rolls out
    // from the ring across the whole arena and through every enemy. The ring sinks back onto his back.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const c = scene.cameras.main;
      const N = 8;
      const [cx, cy] = [W / 2, 66];
      // The roll: beat intervals shrinking from 360 ms down to 55 ms over about two seconds.
      const beats: number[] = [];
      for (let t = 0, gap = 360; t < 2100; gap = Math.max(55, gap * 0.86)) beats.push((t += gap));
      const ROLL = 1100;
      const DON = ROLL + beats[beats.length - 1] + 450;
      p.invuln(DON + 900);
      p.lock(DON + 700);
      p.setVelocity(0, 0);
      const home = { x: p.x, y: p.y };
      // The ring leaves his back (the drums drawn there are hidden while it is out).
      p.setData('drumsOut', 5);
      const night = scene.add.rectangle(0, 0, W, H, 0x0b0618, 0.75).setOrigin(0).setDepth(8).setAlpha(0);
      scene.tweens.add({ targets: night, alpha: 1, duration: 400 });
      // Thunderheads: dark banks rolling across the top, their bellies lit violet now and then from inside.
      const clouds = scene.add.graphics().setDepth(8.5).setAlpha(0);
      let roll = 0;
      let flare = 0;
      const weather = scene.time.addEvent({
        delay: 40,
        loop: true,
        callback: () => {
          roll += 0.5;
          flare = Math.max(0, flare - 0.1);
          clouds.clear();
          for (let i = 0; i < 8; i++) {
            const x = ((((i * 46 + roll * (i % 2 ? 1 : -1)) % (W + 60)) + W + 60) % (W + 60)) - 30;
            const y = 8 + (i % 3) * 6;
            clouds.fillStyle(0x140d24).fillEllipse(x, y, 76, 24);
            clouds.fillStyle(RAIJIN.fringe, 0.25 + 0.5 * flare).fillEllipse(x, y + 7, 58, 9);
          }
        },
      });
      scene.tweens.add({ targets: clouds, alpha: 1, duration: 500 });
      // He rises to the heart of the ring, held there every frame (the player's own update turns gravity back on).
      const hover = { x: home.x, y: Math.min(home.y, FLOOR_Y - 8) };
      const hold = scene.time.addEvent({ delay: 16, loop: true, callback: () => p.body.reset(hover.x, hover.y) });
      const ringAt = { x: p.x, y: p.y - 6, R: 10, r: 1.5, k: 0 };
      scene.tweens.add({ targets: hover, y: cy + 4, x: cx, duration: 800, ease: 'Sine.InOut' });
      scene.tweens.add({ targets: ringAt, x: cx, y: cy, R: 52, r: 7, k: 1, duration: 900, ease: 'Back.Out' });
      // The storm's charge streams in toward the ring.
      for (let i = 0; i < 26; i++)
        later(scene, 120 + i * 28, () => {
          const m = scene.add
            .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(FLOOR_Y - 40, FLOOR_Y), 1, 3, i % 2 ? RAIJIN.bolt : RAIJIN.spark)
            .setDepth(12);
          scene.tweens.add({ targets: m, x: cx, y: cy, duration: 420, ease: 'Quad.In', onComplete: () => m.destroy() });
        });
      const lit = new Array<number>(N).fill(0);
      let spin = 0;
      const rg = scene.add.graphics().setDepth(9);
      const drawRing = () => {
        spin += 0.004;
        for (let i = 0; i < N; i++) lit[i] = Math.max(0, lit[i] - 0.05);
        rg.clear();
        if (ringAt.k > 0.5) rg.fillStyle(RAIJIN.fringe, 0.12 + 0.1 * Math.max(...lit)).fillCircle(ringAt.x, ringAt.y, ringAt.R + 12);
        drumRing(rg, ringAt.x, ringAt.y, ringAt.R, N, ringAt.r, spin, (i) => lit[i]);
      };
      scene.events.on('update', drawRing);
      const drumPos = (i: number): [number, number] => {
        const a = spin + (i / N) * Math.PI * 2;
        return [ringAt.x + Math.cos(a) * ringAt.R, ringAt.y + Math.sin(a) * ringAt.R];
      };
      later(scene, 900, () => {
        c.flash(140, 192, 128, 255);
        boom(scene, cx, cy, null, 2, 70, 400);
      });
      // The roll: each beat, the next drum booms and a bolt leaps from it to the next enemy in turn.
      beats.forEach((t, i) =>
        later(scene, ROLL + t, () => {
          const d = i % N;
          lit[d] = 1;
          flare = 1;
          const [x, y] = drumPos(d);
          boom(scene, x, y, null, 1, 16, 200);
          const foes = world.targets(x, y);
          if (!foes.length) return;
          const t = foes[i % foes.length];
          stormArc(scene, x, y, t.x, t.y, 220, 1 + Math.floor((i / beats.length) * 3), 2, RAI);
          sparks(scene, t.x, t.y, [RAIJIN.bolt, RAIJIN.spark, RAIJIN.core], 6, 12);
          c.shake(60, 0.004 + (i / beats.length) * 0.01);
          world.strike(t, 0.25 * power, 'ult', false, { freeze: 400 }, 0);
        }),
      );
      // DON!: all eight at once.
      later(scene, DON, () => {
        lit.fill(1);
        c.flash(260, 255, 241, 232);
        c.shake(700, 0.035);
        floatText(scene, W / 2, 30, 'DON!', '#c080ff');
        for (let i = 0; i < N; i++) {
          const [x, y] = drumPos(i);
          stormArc(scene, x, y, x + (x - cx) * 0.8, FLOOR_Y, 420, 3, 3, RAI);
        }
        boom(scene, cx, cy, null, 5, W * 0.75, 700);
        for (let i = 0; i < 10; i++) rocks(scene, Phaser.Math.Between(10, W - 10), FLOOR_Y, 2);
        for (const t of world.targets(cx, cy)) {
          later(scene, Phaser.Math.Distance.Between(cx, cy, t.x, t.y) * 1.6, () => {
            if (!t.active) return;
            sparks(scene, t.x, t.y, [RAIJIN.bolt, RAIJIN.spark, RAIJIN.core], 12, 22);
            ring(scene, t.x, t.y, RAIJIN.core, 4, 24, 260, 2);
            world.strike(t, 2.6 * power, 'ult', true, { freeze: 500 });
            if (!('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-160);
          });
        }
      });
      // The storm clears; the ring shrinks back onto his back as he comes down.
      later(scene, DON + 550, () => {
        hold.remove();
        weather.remove();
        scene.tweens.add({
          targets: ringAt,
          x: p.x,
          y: p.y - 6,
          R: 10,
          r: 1.5,
          duration: 380,
          ease: 'Quad.In',
          onComplete: () => {
            scene.events.off('update', drawRing);
            rg.destroy();
            p.setData('drumsOut', 0);
          },
        });
        scene.tweens.add({
          targets: [night, clouds],
          alpha: 0,
          duration: 450,
          onComplete: () => [night, clouds].forEach((o) => o.destroy()),
        });
      });
    },
  },
  // Nephalem, born of an angel and a demon: one half holy (white, gold), the other infernal (black, crimson); where they
  // meet, twilight violet.
  surgaNeraka: {
    // Penghakiman Senja: he lands with both wings driven into the floor like blades; the angel's wing splits the floor
    // on its side in a seam of gold light that pins, the demon's on the other in a seam of hellfire that burns, both
    // racing out along the ground from his feet.
    onDiveLand: ({ p, world, scene, power }, x, gy) => {
      const angel = p.flipX ? 1 : -1;
      balanceSigil(scene, x, gy - 6, 12);
      scene.cameras.main.shake(140, 0.012);
      for (const holy of [true, false]) {
        const side = holy ? angel : -angel;
        const g = scene.add.graphics().setDepth(11);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 260,
          ease: 'Quad.Out',
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            const x1 = x + side * 70 * k;
            g.clear();
            for (const [w, c, al] of [
              [5, holy ? HOLY : HELL, 0.3],
              [2, holy ? HOLY : HELL, 1],
              [1, 0xfff1e8, 1],
            ] as const)
              g.lineStyle(w, c, al * (1 - k * 0.5)).lineBetween(x, gy - 1, x1, gy - 1);
            if (!holy && Math.random() < 0.6) flameTongue(scene, x1, gy, 10, 300, FIRE);
            if (holy && Math.random() < 0.4) glint(scene, x1, gy - 3);
          },
          onComplete: () => scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() }),
        });
        world.area(x + side * 36, gy - 8, 36, 0.6 * power, 140, 'proc', holy ? { slow: 700 } : { burn: 0.15 });
      }
    },
    // KESEIMBANGAN: holy (gold) cuts fill CAHAYA, infernal (crimson) cuts fill KEGELAPAN, the twilight cuts fill both.
    // When both are full, the halves resolve: a gold-and-crimson balance sigil bursts at the target, striking
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
    // The combo is both of him in turn. 0: the holy blade cuts upward and a fan of gold feathers lifts with it.
    // 1: the hellblade chops down and drags, a crescent of hellfire trailing it. 2: both blades cross like shears.
    // 3: the twilight wheel: he spins with both blades out, a ring half gold, half crimson turning around him.
    onSwing: ({ p, scene }, m, step) => {
      const f = p.facing;
      if (step === 0) {
        feathers(scene, p.x + f * 12, p.y - 4, 4, 10, -14);
        const g = scene.add.graphics().setDepth(12);
        const [a0, a1] = f > 0 ? [0.7, -1.4] : [Math.PI - 0.7, Math.PI + 1.4];
        for (const [w, c, al] of [
          [4, HOLY, 0.3],
          [1, 0xfff1e8, 1],
        ] as const)
          g.lineStyle(w, c, al).beginPath().arc(p.x, p.y, 20, Math.min(a0, a1), Math.max(a0, a1)).strokePath();
        scene.tweens.add({ targets: g, alpha: 0, y: -4, duration: 220, onComplete: () => g.destroy() });
      } else if (step === 1) {
        for (let i = 0; i < 5; i++)
          later(scene, i * 20, () => flameTongue(scene, p.x + f * (6 + i * 5), p.y + 7 - Math.abs(i - 2) * 2, 8, 260, FIRE));
      } else if (step === 2) {
        const [x, y] = [p.x + f * 14, p.y - 1];
        later(scene, 60, () => {
          bladeLine(scene, x - 11, y - 11, x + 11, y + 11, HOLY, 90);
          bladeLine(scene, x - 11, y + 11, x + 11, y - 11, HELL, 90);
        });
      } else if (step === 3) {
        const g = scene.add.graphics().setDepth(12);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: m.ms + 60,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            const a = k * Math.PI * 4 * f;
            g.clear();
            for (const [holy, off] of [
              [true, 0],
              [false, Math.PI],
            ] as const) {
              const c = holy ? HOLY : HELL;
              g.lineStyle(5, c, 0.25)
                .beginPath()
                .arc(p.x, p.y, 20, a + off, a + off + 2.6)
                .strokePath();
              g.lineStyle(2, c)
                .beginPath()
                .arc(p.x, p.y, 20, a + off, a + off + 2.6)
                .strokePath();
            }
            g.lineStyle(1, TWILIGHT, 0.6 * (1 - k)).strokeCircle(p.x, p.y, 20 + k * 8);
          },
          onComplete: () => g.destroy(),
        });
      }
    },
    // Sayap Senja (Twilight Wings): both wings unfurl at full span and beat. Each half strikes its own side of him: the
    // white wing looses a lance of light at every enemy on its side (it is pinned), the black wing hurls hellfire at
    // every enemy on the other (it burns). Then he turns on his heel, the wings trade sides, and they beat again: now
    // everyone takes the other half. An enemy struck by both, light and fire, cannot hold the two together: the
    // twilight tears it (a balance sigil bursts in it, SENJA!).
    skill: ({ p, world, scene, power }) => {
      const foes = world
        .targets(p.x, p.y)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))
        .slice(0, 8);
      if (!foes.length) return false;
      p.lock(1000);
      p.setVelocityX(0);
      const cam = scene.cameras.main;
      const wg = scene.add.graphics();
      const wings = scene.add
        .container(p.x, p.y - 4, [wg])
        .setDepth(9.5)
        .setScale(0.3);
      let flap = 0;
      let angel = p.flipX ? 1 : -1;
      const draw = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          wings.setPosition(p.x, p.y - 4);
          wg.clear();
          twilightWings(wg, angel, 26, flap);
        },
      });
      scene.tweens.add({ targets: wings, scale: 1, duration: 220, ease: 'Back.Out' });
      const marked = new Map<Phaser.GameObjects.Sprite, Set<boolean>>();
      let torn = false;
      const volley = () => {
        flap = 0.6;
        cam.shake(120, 0.01);
        feathers(scene, p.x + angel * 14, p.y - 8, 6, 14, 30);
        foes.forEach((t, i) => {
          if (!t.active) return;
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
          later(scene, i * 40, () => {
            shot.setAlpha(1);
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              duration: 200,
              ease: 'Quad.In',
              onUpdate: (tw) => {
                const v = tw.getValue() ?? 0;
                const [tx, ty] = t.active ? [t.x, t.y] : [shot.x, shot.y];
                const [nx, ny] = [ox + (tx - ox) * v, oy + (ty - oy) * v - Math.sin(v * Math.PI) * 18];
                shot.setRotation(Phaser.Math.Angle.Between(shot.x, shot.y, nx, ny) || shot.rotation).setPosition(nx, ny);
              },
              onComplete: () => {
                const [x, y] = [shot.x, shot.y];
                shot.destroy();
                if (holy) {
                  glint(scene, x, y);
                  ring(scene, x, y, HOLY, 3, 16, 220, 1);
                } else {
                  flameTongue(scene, x, y + 6, 16, 420, FIRE);
                  sparks(scene, x, y, [HELL, 0xffa300, 0x1d0f2e], 6, 12);
                }
                if (!t.active) return;
                world.strike(t, 1 * power, 'skill', false, holy ? { slow: 1100 } : { burn: 0.3 });
                const got = marked.get(t) ?? new Set<boolean>();
                got.add(holy);
                marked.set(t, got);
                if (got.size < 2 || !t.active) return;
                // Both halves in it: the twilight tears it.
                later(scene, 80, () => {
                  if (!t.active) return;
                  balanceSigil(scene, t.x, t.y, 12);
                  cutMark(scene, t.x, t.y, HOLY, 22, -Math.PI / 4);
                  cutMark(scene, t.x, t.y, HELL, 22, Math.PI / 4);
                  world.strike(t, 1 * power, 'skill', false, undefined, 0);
                  if (!torn) floatText(scene, Phaser.Math.Clamp(t.x, 20, W - 20), t.y - 22, 'SENJA!', '#c080ff');
                  torn = true;
                });
              },
            });
          });
        });
      };
      scene.tweens.addCounter({ from: 0, to: 1, delay: 100, duration: 140, onUpdate: (tw) => (flap = -(tw.getValue() ?? 0)) });
      later(scene, 250, volley);
      // He turns on his heel: the wings trade sides.
      later(scene, 560, () => {
        p.facing = -p.facing;
        p.setFlipX(!p.flipX);
        angel = -angel;
        flap = -0.8;
        afterimage(scene, p, p.x, p.y, 0.5, TWILIGHT);
      });
      later(scene, 720, volley);
      later(scene, 1050, () => {
        draw.remove();
        scene.tweens.add({ targets: wings, scale: 0.3, alpha: 0, duration: 200, onComplete: () => wings.destroy() });
      });
    },
    // Antara Surga & Neraka (Between Heaven and Hell): a gate of light opens across the top of the sky and the floor
    // splits into a fissure of hellfire. Heaven and hell both claim every enemy (up to eight, flyers too) and they are
    // thrown between the two, faster each time: hauled up into the light, which sears them, then dragged down into
    // the fire, which burns them, up, down, up, down. On the last pull both take hold at once: the enemy hangs in the
    // middle, gold threads from above and crimson chains from below drawn taut, and it is torn both ways (TERBELAH!).
    // A boss is too heavy to throw: light falls on it and fire rises under it in the same rhythm.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 8);
      if (!foes.length) return false;
      p.invuln(2600);
      p.lock(700);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      const TOP = 20;
      // Heaven: a band of light across the top of the sky with rays falling from it.
      const heaven = scene.add.graphics().setDepth(9).setAlpha(0);
      heaven.fillStyle(0xfff1e8, 0.35).fillRect(0, 0, W, 12);
      heaven.fillStyle(HOLY, 0.25).fillRect(0, 12, W, 6);
      for (let x = 6; x < W; x += 22) heaven.fillStyle(HOLY, 0.16).fillTriangle(x - 3, 14, x + 3, 14, x + 8, 64);
      for (let x = 0; x < W; x += 14) heaven.fillStyle(0xfff1e8, 0.8).fillEllipse(x + 7, 12, 16, 7);
      scene.tweens.add({ targets: heaven, alpha: 1, duration: 300 });
      // Hell: a fissure along the floor, black lips and a crimson glow, widening.
      const hell = scene.add.graphics().setDepth(9);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 350,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          hell.clear();
          const half = (W / 2) * v;
          hell.fillStyle(HELL, 0.5).fillRect(W / 2 - half, FLOOR_Y - 3, half * 2, 4);
          hell.fillStyle(0xffa300).fillRect(W / 2 - half, FLOOR_Y - 2, half * 2, 1);
          hell.lineStyle(1, 0x1d0f2e);
          for (let x = W / 2 - half; x < W / 2 + half; x += 8) hell.lineBetween(x, FLOOR_Y - 3, x + 4, FLOOR_Y - 5);
        },
      });
      cam.shake(250, 0.008);
      const thrown = foes.filter((t) => !('tier' in t));
      const xs = new Map(thrown.map((t) => [t, t.x]));
      // Each enemy's height, driven every frame while the tug lasts.
      const ys = new Map(thrown.map((t) => [t, t.y]));
      const pin = () => {
        const now = scene.time.now;
        for (const t of thrown) {
          if (!t.active) continue;
          (t as Phaser.GameObjects.Sprite & { stunUntil: number }).stunUntil = now + 200;
          (t.body as Phaser.Physics.Arcade.Body).reset(xs.get(t)!, ys.get(t)!);
        }
      };
      scene.events.on('update', pin);
      // The throws: up, down, up, down, each one faster.
      const legs: [boolean, number][] = [
        [true, 300],
        [false, 240],
        [true, 200],
        [false, 170],
      ];
      let at = 400;
      for (const [up, ms] of legs) {
        const start = at;
        later(scene, start, () => {
          for (const t of thrown) {
            if (!t.active) continue;
            const goal = up ? TOP + t.displayHeight / 2 : FLOOR_Y - t.displayHeight / 2;
            scene.tweens.add({
              targets: { v: ys.get(t)! },
              v: goal,
              duration: ms,
              ease: 'Quad.In',
              onUpdate: (tw) => ys.set(t, tw.getValue() ?? goal),
            });
          }
        });
        later(scene, start + ms, () => {
          cam.shake(90, 0.01);
          for (const t of foes) {
            if (!t.active) continue;
            const y = 'tier' in t ? t.y : ys.get(t)!;
            if (up) {
              glint(scene, t.x, y - 4);
              ring(scene, t.x, y, HOLY, 2, 14, 200, 1);
              if ('tier' in t) lightRay(scene, t.x, 0, Math.PI / 2, t.y, 2, 220);
            } else {
              flameTongue(scene, t.x, FLOOR_Y, 'tier' in t ? FLOOR_Y - t.y + 8 : 14, 320, FIRE);
              sparks(scene, t.x, y, [HELL, 0xffa300, 0x1d0f2e], 5, 10);
            }
            world.strike(t, 0.4 * power, 'skill', false, up ? { slow: 600 } : { burn: 0.15 }, 0);
          }
        });
        at += ms + 60;
      }
      // Both claim it at once: hung in the middle, threads of light from above and chains of fire from below.
      const MID = 96;
      const tug = scene.add.graphics().setDepth(12);
      later(scene, at, () => {
        for (const t of thrown)
          if (t.active)
            scene.tweens.add({
              targets: { v: ys.get(t)! },
              v: MID,
              duration: 180,
              ease: 'Back.Out',
              onUpdate: (tw) => ys.set(t, tw.getValue() ?? MID),
            });
        const t0 = scene.time.now;
        const taut = () => {
          tug.clear();
          const k = Math.min(1, (scene.time.now - t0) / 300);
          for (const t of foes) {
            if (!t.active) continue;
            const jit = Math.sin(scene.time.now / 20 + t.x) * k;
            tug.lineStyle(1, HOLY, 0.9).lineBetween(t.x - 3, 14, t.x + jit, t.y - 4);
            tug.lineStyle(1, 0xfff1e8, 0.9).lineBetween(t.x + 3, 14, t.x + jit, t.y - 4);
            tug.lineStyle(2, 0x1d0f2e).lineBetween(t.x, FLOOR_Y, t.x - jit, t.y + 4);
            tug.lineStyle(1, HELL).lineBetween(t.x, FLOOR_Y, t.x - jit, t.y + 4);
          }
        };
        scene.events.on('update', taut);
        later(scene, 450, () => {
          scene.events.off('update', taut);
          tug.destroy();
          scene.events.off('update', pin);
          cam.flash(140, 192, 128, 255);
          cam.shake(350, 0.024);
          floatText(scene, W / 2, 60, 'TERBELAH!', '#c080ff');
          for (const t of foes) {
            if (!t.active) continue;
            cutMark(scene, t.x, t.y, HOLY, 30, Math.PI / 2 - 0.2);
            cutMark(scene, t.x, t.y, HELL, 30, Math.PI / 2 + 0.2);
            ring(scene, t.x, t.y, TWILIGHT, 4, 22, 260, 2);
            world.strike(t, 1.6 * power, 'skill', true, { burn: 0.2, slow: 800 }, 0);
          }
          scene.tweens.add({ targets: [heaven, hell], alpha: 0, duration: 350, onComplete: () => (heaven.destroy(), hell.destroy()) });
        });
      });
    },
    // Senjakala (Twilight): he tears himself in two. The angel steps out of him (white, gold halo, feathered wings) and
    // soars into the top of the sky; the demon steps out the other way (black, horns aflame, bat wings) and sinks into
    // a rift of hellfire in the floor; where he stood only a violet seam of twilight is left. Then the two halves hunt
    // together: for every enemy, the angel dives from above and the demon bursts from below at the same instant and
    // they cross through it, a gold cut and a crimson cut in one X, then on to the next, faster and faster. At the
    // end they fly back at each other and slam together into one again, and as he is made whole the world itself is
    // torn along a seam of twilight running through every enemy: the sky above it burns gold, the ground below it
    // crimson, and everything on the seam is cut through (SENJAKALA!).
    ult: ({ p, world, scene, power }) => {
      const foes = world
        .targets(p.x, p.y)
        .sort((a, b) => a.x - b.x)
        .slice(0, 10);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const STEP = Math.min(190, 1500 / foes.length);
      const HUNT = 900;
      const MERGE = HUNT + foes.length * STEP + 150;
      p.invuln(MERGE + 1300);
      p.lock(MERGE + 900);
      p.setVelocity(0, 0);
      const home = { x: p.x, y: p.y };
      const f = p.facing;
      // The two halves: tinted copies of him with their own wings, halo or horns, glow and trail.
      const self = (holy: boolean) => {
        const g = scene.add.graphics();
        const img = scene.add
          .image(0, 0, p.texture.key, p.frame.name)
          .setFlipX(p.flipX)
          .setTint(holy ? 0xfff1e8 : 0x3b0a1a)
          .setTintMode(Phaser.TintModes.FILL);
        const c = scene.add.container(home.x, home.y, [g, img]).setDepth(13);
        return { c, g, holy, x: home.x, y: home.y };
      };
      const halves = [self(true), self(false)];
      const drawSelf = () => {
        const now = scene.time.now;
        for (const h of halves) {
          h.c.setPosition(h.x, h.y);
          h.g.clear();
          const flap = Math.sin(now / 90) * 0.4;
          h.g.fillStyle(h.holy ? HOLY : HELL, 0.2).fillCircle(0, -2, 14);
          if (h.holy) {
            angelWing(h.g, -1, 20, flap);
            angelWing(h.g, 1, 20, flap);
            h.g.lineStyle(2, HOLY).strokeEllipse(0, -14, 10, 3);
          } else {
            demonWing(h.g, -1, 20, flap);
            demonWing(h.g, 1, 20, flap);
            h.g.fillStyle(0x1d0f2e).fillTriangle(-4, -8, -2, -8, -6, -15).fillTriangle(2, -8, 4, -8, 6, -15);
            const fl = 3 + Math.abs(Math.sin(now / 60)) * 2;
            h.g
              .fillStyle(HELL)
              .fillTriangle(-7, -14, -5, -14, -6, -14 - fl)
              .fillTriangle(5, -14, 7, -14, 6, -14 - fl);
            h.g.fillStyle(HELL).fillRect(1, -4, 1, 1);
          }
        }
      };
      scene.events.on('update', drawSelf);
      // Where he stood: only a seam of twilight; he himself is gone while the halves fight.
      p.setData('hidden', true);
      const seam = scene.add.graphics().setDepth(12);
      const sky = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x1d0f2e, 0).setOrigin(0).setDepth(4.6);
      scene.tweens.add({ targets: sky, fillAlpha: 0.55, duration: 400 });
      const seamTick = () => {
        seam.clear();
        const h = 8 + Math.sin(scene.time.now / 40) * 2;
        seam.lineStyle(4, TWILIGHT, 0.3).lineBetween(home.x, home.y - h, home.x, home.y + h);
        seam.lineStyle(1, 0xfff1e8).lineBetween(home.x, home.y - h, home.x, home.y + h);
      };
      scene.events.on('update', seamTick);
      cam.flash(140, 192, 128, 255);
      cam.shake(300, 0.012);
      // The rift: hellfire opening in the floor below; the light: a glow across the top.
      const rift = scene.add.graphics().setDepth(9);
      rift.fillStyle(HELL, 0.45).fillRect(0, FLOOR_Y - 3, W, 4);
      rift.fillStyle(0xffa300).fillRect(0, FLOOR_Y - 2, W, 1);
      rift.fillStyle(0xfff1e8, 0.25).fillRect(0, 0, W, 10);
      rift.setAlpha(0);
      scene.tweens.add({ targets: rift, alpha: 1, duration: 400 });
      const go = (h: (typeof halves)[number], x: number, y: number, ms: number, ease = 'Quad.InOut') => {
        scene.tweens.killTweensOf(h);
        scene.tweens.add({ targets: h, x, y, duration: ms, ease });
      };
      go(halves[0], home.x - f * 30, 22, 600, 'Sine.Out');
      go(halves[1], home.x + f * 30, FLOOR_Y - 4, 600, 'Sine.Out');
      later(scene, 300, () => feathers(scene, home.x, home.y - 6, 8, 16, 30));
      // The hunt: for each enemy, from above and below at once, crossing through it.
      foes.forEach((t, i) =>
        later(scene, HUNT + i * STEP, () => {
          if (!t.active) return;
          const [tx, ty] = [t.x, t.y];
          const ms = STEP * 0.7;
          for (const h of halves) {
            const [ox, oy] = [h.x, h.y];
            // A streak behind each half as it crosses.
            const tr = scene.add.graphics().setDepth(12);
            let [lx, ly] = [ox, oy];
            const end = h.holy ? [tx + (tx - ox) * 0.25, ty + 22] : [tx - (ox - tx) * 0.25, ty - 22];
            scene.tweens.killTweensOf(h);
            scene.tweens.add({
              targets: h,
              x: end[0],
              y: Phaser.Math.Clamp(end[1], 14, FLOOR_Y - 4),
              duration: ms,
              ease: 'Quad.In',
              onUpdate: () => {
                tr.lineStyle(3, h.holy ? HOLY : HELL, 0.35).lineBetween(lx, ly, h.x, h.y);
                tr.lineStyle(1, 0xfff1e8, 0.8).lineBetween(lx, ly, h.x, h.y);
                [lx, ly] = [h.x, h.y];
              },
              onComplete: () => {
                scene.tweens.add({ targets: tr, alpha: 0, duration: 160, onComplete: () => tr.destroy() });
                // Back out above / below, ready for the next.
                go(h, h.x, h.holy ? 24 : FLOOR_Y - 4, STEP * 0.3, 'Sine.Out');
              },
            });
          }
          later(scene, ms * 0.85, () => {
            if (!t.active) return;
            cam.shake(80, 0.01);
            cutMark(scene, t.x, t.y, HOLY, 26, -Math.PI / 3);
            cutMark(scene, t.x, t.y, HELL, 26, Math.PI / 3);
            sparks(scene, t.x, t.y, [0xfff1e8, HELL, TWILIGHT], 8, 14);
            world.strike(t, 0.8 * power, 'ult', false, { slow: 900 }, 0);
            world.strike(t, 0.8 * power, 'ult', false, { burn: 0.3 }, 0);
          });
        }),
      );
      // Made whole: the halves fly at each other and slam together where he stood.
      later(scene, MERGE, () => {
        for (const h of halves) go(h, home.x, home.y, 260, 'Quad.In');
      });
      later(scene, MERGE + 260, () => {
        scene.events.off('update', drawSelf);
        scene.events.off('update', seamTick);
        halves.forEach((h) => h.c.destroy());
        seam.destroy();
        p.setData('hidden', false);
        balanceSigil(scene, home.x, home.y, 24);
        cam.flash(200, 255, 241, 232);
        cam.shake(700, 0.034);
        floatText(scene, W / 2, 46, 'SENJAKALA!', '#c080ff');
        // The world torn along a seam of twilight through every enemy: gold above it, crimson below.
        const live = world.targets(home.x, home.y).sort((a, b) => a.x - b.x);
        const pts: [number, number][] = [[0, live[0]?.y ?? home.y]];
        for (const t of live) pts.push([t.x, t.y]);
        pts.push([W, live[live.length - 1]?.y ?? home.y]);
        const tear = scene.add.graphics().setDepth(12);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 650,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            const gap = Math.sin(Math.min(1, k * 2) * Math.PI * 0.5) * 4 * (1 - k);
            tear.clear();
            // The halves of the world, pushed apart along the seam.
            const top = pts.map(([x, y]) => V2(x, y - gap));
            const bot = pts.map(([x, y]) => V2(x, y + gap));
            tear.fillStyle(HOLY, 0.22 * (1 - k)).fillPoints([V2(0, 0), ...top, V2(W, 0)], true);
            tear.fillStyle(HELL, 0.22 * (1 - k)).fillPoints([V2(0, FLOOR_Y), ...bot, V2(W, FLOOR_Y)], true);
            tear.lineStyle(6, TWILIGHT, 0.4 * (1 - k)).strokePoints(
              pts.map(([x, y]) => V2(x, y)),
              false,
            );
            tear.lineStyle(2, 0xfff1e8, 1 - k).strokePoints(
              pts.map(([x, y]) => V2(x, y)),
              false,
            );
          },
          onComplete: () => tear.destroy(),
        });
        for (const t of live) {
          sparks(scene, t.x, t.y, [HOLY, HELL, TWILIGHT, 0xfff1e8], 10, 18);
          world.strike(t, 3 * power, 'ult', true, { burn: 0.25 }, 0);
        }
        p.heal(Math.ceil(p.stats.maxHp * 0.1));
      });
      later(scene, MERGE + 900, () => {
        scene.tweens.add({ targets: [sky, rift], alpha: 0, duration: 450, onComplete: () => (sky.destroy(), rift.destroy()) });
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
  kelam: {
    // The finisher's execution lets a skull of soul fire go: it flies on, wailing, through every body in its way,
    // trailing green flame.
    onSwing: ({ p, world, scene, power }, _m, step) => {
      if (step !== 2) return;
      const f = p.facing;
      const skull = world.shot({
        x: p.x + f * 10,
        y: p.y - 2,
        vx: f * 230,
        vy: 0,
        texture: 'tengkorakJiwa',
        mult: 0.9 * power,
        source: 'skill',
        pierce: true,
        status: { slow: 600 },
      }) as Phaser.GameObjects.Image;
      whileAlive(scene, skull, 35, (k) => {
        const s = scene.add
          .rectangle(skull.x - f * 3, skull.y + Phaser.Math.Between(-2, 2), 3, 2, k % 3 ? SOUL[1] : SOUL[2], 0.85)
          .setDepth(12);
        scene.tweens.add({ targets: s, x: s.x - f * 10, y: s.y - 3, scaleX: 0.3, alpha: 0, duration: 260, onComplete: () => s.destroy() });
      });
    },
    // Takhta Runtuh (The Throne Falls): he lands like a king taking his seat, and the floor answers: geysers of soul
    // fire burst out of it one after another, three each way, throwing small fry into the air.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      ring(scene, x, gy - 2, SOUL[1], 4, 34, 300, 2);
      rocks(scene, x, gy, 6);
      const hit = new Set<Phaser.GameObjects.GameObject>();
      for (let i = 1; i <= 3; i++)
        later(scene, i * 70, () => {
          for (const s of [-1, 1]) {
            const gx = x + s * i * 16;
            soulGeyser(scene, gx, gy, 24 - i * 3);
            for (const t of world.targets(gx, gy)) {
              if (hit.has(t) || !t.active || Math.abs(t.x - gx) > 10 || t.y < gy - 44) continue;
              hit.add(t);
              world.strike(t, 0.6 * power, 'proc', false, { slow: 500 }, 40);
              if (!('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-170);
            }
          }
        });
    },
    // Dominasi (Domination): he raises his hand, and over the heads of the three enemies nearest him (in the air too) a
    // small black crown of soul fire forms and drops onto them, its spikes biting in: their minds are his now. For 4 s
    // each one turns on its own side: its body darkens to his colors, its eyes burn green, it no longer attacks him
    // and cannot be struck, and it hurls itself at the nearest enemy that is still free, clawing it again and again.
    // Then the crown clamps shut and crushes the puppet it ruled. A boss cannot be ruled: the crown bites it instead.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 3);
      if (!foes.length) return false;
      const f = p.facing;
      p.lock(350);
      p.setVelocityX(0);
      soulSigil(scene, p.x + f * 8, p.y - 6, 7, 500);
      const RULE_MS = 4000;
      // The puppets ruled by this cast: with no free enemy left they turn on each other, and a lone one on itself.
      const ruled = new Set<Phaser.GameObjects.Sprite>();
      foes.forEach((t, i) =>
        later(scene, 120 + i * 90, () => {
          if (!t.active) return;
          const top = () => t.y - t.displayHeight / 2 - 2;
          const crown = puppetCrown(scene, t.x, top() - 24).setAlpha(0);
          scene.tweens.add({ targets: crown, y: top(), alpha: 1, duration: 160, ease: 'Quad.In' });
          const e = t as Phaser.GameObjects.Sprite & { untargetable?: boolean; flying?: boolean; stunUntil: number };
          // Bosses, and the ghosts and mimics that turn their own visibility on and off, only take the bite.
          if ('tier' in t || ['ghost', 'mimic'].includes((t as { kind?: string }).kind ?? '')) {
            later(scene, 170, () => {
              sparks(scene, crown.x, crown.y, [SOUL[1], SOUL[2], 0x0a0612], 10, 14);
              ring(scene, crown.x, crown.y - 3, SOUL[1], 3, 18, 240, 1);
              world.strike(t, 4 * power, 'skill', false, undefined, 0);
              scene.tweens.add({ targets: crown, alpha: 0, scale: 1.6, duration: 220, onComplete: () => crown.destroy() });
            });
            return;
          }
          later(scene, 170, () => {
            if (!t.active) return void crown.destroy();
            ring(scene, t.x, t.y, SOUL[1], 2, 16, 240, 1);
            sparks(scene, crown.x, crown.y, [SOUL[1], SOUL[2]], 6, 10);
            // His now: out of the fight on its own side (its AI held), not hurting him, not hit by his blows.
            e.untargetable = true;
            ruled.add(t);
            e.stunUntil = scene.time.now + RULE_MS;
            t.setTint(0x6b4f8a);
            const eyes = scene.add.graphics().setDepth(14);
            let next = 0;
            const rule = scene.time.addEvent({
              delay: 16,
              loop: true,
              callback: () => {
                if (!t.active) return;
                crown.setPosition(t.x, top());
                const fx = t.flipX ? -1 : 1;
                eyes
                  .clear()
                  .fillStyle(SOUL[2])
                  .fillRect(t.x + fx * t.displayWidth * 0.2 - 0.5, t.y - t.displayHeight * 0.15, 1, 1);
                eyes.fillStyle(SOUL[1]).fillRect(t.x + fx * t.displayWidth * 0.2 - fx * 3 - 0.5, t.y - t.displayHeight * 0.15, 1, 1);
                if (Math.random() < 0.1) {
                  const w = scene.add.rectangle(t.x + Phaser.Math.Between(-4, 4), t.y, 1, 2, SOUL[1]).setDepth(13);
                  scene.tweens.add({ targets: w, y: w.y - 10, alpha: 0, duration: 400, onComplete: () => w.destroy() });
                }
                // The hunt: at the nearest enemy still free (the ruled are untargetable, so not found here); with none
                // left, at the nearest other puppet; alone, the crown makes it tear at itself.
                const body = t.body as Phaser.Physics.Arcade.Body;
                const now = scene.time.now;
                const prey =
                  world.targets(t.x, t.y).find((o) => o !== t && o.active) ??
                  [...ruled]
                    .filter((o) => o !== t && o.active)
                    .sort((a, b) => Phaser.Math.Distance.Between(t.x, t.y, a.x, a.y) - Phaser.Math.Distance.Between(t.x, t.y, b.x, b.y))[0];
                if (!prey) {
                  body.setVelocityX(0);
                  if (now < next) return;
                  next = now + 450;
                  scene.tweens.add({ targets: crown, scaleX: 0.75, scaleY: 1.2, duration: 90, yoyo: true });
                  for (const o of [-2, 2]) cutMark(scene, t.x + o, t.y, SOUL[1], 9, 1.1);
                  sparks(scene, t.x, t.y, [SOUL[1], 0xb3122e, 0x0a0612], 6, 10);
                  world.strike(t, 1.2 * power, 'skill', false, undefined, 0);
                  return;
                }
                const [dx, dy] = [prey.x - t.x, prey.y - t.y];
                t.setFlipX(dx < 0);
                if (e.flying) body.setVelocity(Phaser.Math.Clamp(dx * 4, -120, 120), Phaser.Math.Clamp(dy * 4, -120, 120));
                else {
                  body.setVelocityX(Math.sign(dx) * 110);
                  if (dy < -16 && body.blocked.down) body.setVelocityY(-240);
                }
                if (now >= next && Math.hypot(dx, dy) < 10 + prey.displayWidth / 2) {
                  next = now + 550;
                  for (const o of [-3, 0, 3]) cutMark(scene, prey.x + o, prey.y, SOUL[1], 10, -1.1);
                  sparks(scene, prey.x, prey.y, [SOUL[1], 0x0a0612], 5, 10);
                  world.strike(prey, 1.2 * power, 'skill', false, { slow: 400 }, 140);
                }
              },
            });
            // The crown clamps shut: the puppet is crushed and let go.
            later(scene, RULE_MS, () => {
              rule.remove();
              ruled.delete(t);
              eyes.destroy();
              if (!t.active) return void crown.destroy();
              e.untargetable = false;
              e.stunUntil = scene.time.now + 300;
              t.setTint(0xffffff);
              scene.tweens.add({
                targets: crown,
                scaleX: 0.4,
                scaleY: 1.4,
                duration: 120,
                ease: 'Quad.In',
                onComplete: () => {
                  sparks(scene, crown.x, crown.y, [SOUL[1], SOUL[2], 0x0a0612, 0xb3122e], 12, 16);
                  ring(scene, t.x, t.y, SOUL[1], 3, 20, 260, 2);
                  crown.destroy();
                  world.strike(t, 3 * power, 'skill', false, { freeze: 600 }, 0);
                },
              });
            });
          });
        }),
      );
    },
    // Legiun Kematian (Legion of the Dead): he drives his war banner into the floor and the dead answer the call.
    // Behind him, at the edge of the arena, a full rank of his legion rises out of green fire: skeleton soldiers with
    // tower shields and levelled spears on the floor, hooded wraiths with lances stacked up the air above them, a wall
    // from floor to sky. They march, then break into a charge across the whole arena toward the side where most
    // enemies stand: whatever the front meets (flyers too) is speared and swept along before the shields, until the
    // legion slams the lot into the far wall and grinds them against it (REMUK!), then bursts into soul fire. A boss is
    // too heavy to sweep along: the rank runs it through as it passes.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const ahead = foes.filter((t) => t.x >= p.x).length;
      const d = ahead * 2 >= foes.length ? 1 : -1;
      p.facing = d;
      p.lock(420);
      p.invuln(1900);
      p.setVelocityX(0);
      const [x0, x1] = d > 0 ? [-24, W - 10] : [W + 24, 10];
      const bx = p.x - d * 6;
      const MARCH = 1300;
      // The banner, and the green fire the rank rises out of.
      const fx = scene.add.graphics().setDepth(12);
      const banner = scene.add.graphics().setDepth(9);
      later(scene, 0, () => {
        rocks(scene, bx, FLOOR_Y, 4);
        soulGeyser(scene, bx, FLOOR_Y, 16);
        cam.shake(120, 0.006);
      });
      const edge = d > 0 ? 8 : W - 8;
      for (let i = 0; i < 6; i++) later(scene, 150 + i * 40, () => soulGeyser(scene, edge, FLOOR_Y - i * 26, 14));
      // The rank: three soldiers deep on the floor, five wraiths stacked up the air.
      const rows = [0, 1, 2].map((k) => ({ off: k * 9, y: FLOOR_Y, ph: k * 1.3 }));
      const air = [26, 50, 74, 98, 122].map((h, k) => ({ off: (k % 2) * 6, y: FLOOR_Y - h, ph: k }));
      const caught: Phaser.GameObjects.Sprite[] = [];
      const passed = new Set<Phaser.GameObjects.Sprite>();
      let front = x0;
      let marching = false;
      let fade = 1;
      const draw = () => {
        const now = scene.time.now;
        banner.clear();
        warBanner(banner, bx, FLOOR_Y, d, now, fade);
        fx.clear();
        if (!marching && fade >= 1 && front === x0) return;
        // Dust kicked up along the front, the wind of the charge in streaks.
        for (let i = 0; i < 4; i++) {
          const sy = FLOOR_Y - 10 - ((now / 3 + i * 37) % 130);
          fx.lineStyle(1, SOUL[1], 0.35 * fade).lineBetween(front - d * 30, sy, front - d * 12, sy);
        }
        const step = (front - x0) / 6;
        for (const r of air) legionWraith(fx, front - d * (r.off + 4), r.y + Math.sin(now / 120 + r.ph) * 2, d, now, fade);
        for (const r of [...rows].reverse()) deadSoldier(fx, front - d * (r.off + 6), r.y, d, step + r.ph, fade);
      };
      scene.events.on('update', draw);
      // The charge: slow first steps, then a run.
      later(scene, 400, () => {
        marching = true;
        cam.shake(MARCH, 0.003);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: MARCH,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            front = x0 + (x1 - x0) * (tw.getValue() ?? 0);
            const now = scene.time.now;
            for (const t of world.targets(front, FLOOR_Y)) {
              if (passed.has(t) || caught.includes(t)) continue;
              if ((t.x - front) * d > 6) continue;
              cutMark(scene, t.x, t.y, SOUL[2], 14, 0);
              sparks(scene, t.x, t.y, [SOUL[1], 0x0a0612, 0xc2c3c7], 6, 10);
              if ('tier' in t) {
                passed.add(t);
                cam.shake(90, 0.008);
                world.strike(t, 2.2 * power, 'skill', false, undefined, 0);
                continue;
              }
              caught.push(t);
              world.strike(t, 1.2 * power, 'skill', false, undefined, 0);
            }
            // The swept: pinned to the spear points, carried along.
            caught.forEach((t, i) => {
              if (!t.active) return;
              (t as Phaser.GameObjects.Sprite & { stunUntil: number }).stunUntil = now + 300;
              (t.body as Phaser.Physics.Arcade.Body).reset(
                Phaser.Math.Clamp(front + d * (8 + (i % 3) * 3), 6, W - 6),
                Phaser.Math.Clamp(t.y, 12, FLOOR_Y - t.displayHeight / 2),
              );
            });
          },
          onComplete: () => {
            // REMUK: ground into the wall, which cracks behind them; the rank bursts into soul fire.
            marching = false;
            cam.flash(160, 61, 255, 143);
            cam.shake(500, 0.03);
            const wx = d > 0 ? W - 2 : 2;
            const crack = scene.add.graphics().setDepth(12);
            for (const y of [FLOOR_Y - 10, FLOOR_Y - 50, FLOOR_Y - 90]) {
              for (let i = 0; i < 5; i++) {
                const a = Math.PI / 2 + d * (Math.PI / 2) + (i - 2) * 0.45;
                crack.lineStyle(1, 0x000000).lineBetween(wx, y, wx + Math.cos(a) * 14, y + Math.sin(a) * 14);
              }
            }
            scene.tweens.add({ targets: crack, alpha: 0, delay: 600, duration: 300, onComplete: () => crack.destroy() });
            const mid = caught.find((t) => t.active) ?? caught[0];
            floatText(scene, Phaser.Math.Clamp(wx - d * 40, 40, W - 40), (mid?.y ?? FLOOR_Y) - 26, 'REMUK!', '#3dff8f');
            for (const t of caught) {
              if (!t.active) continue;
              sparks(scene, t.x, t.y, [SOUL[1], SOUL[2], 0xfff1e8], 10, 16);
              world.strike(t, 3.5 * power, 'skill', true, { slow: 900 }, 0);
            }
            for (const r of [...rows, ...air]) soulGeyser(scene, Phaser.Math.Clamp(front - d * r.off, 4, W - 4), r.y, 12);
            scene.tweens.addCounter({ from: 1, to: 0, duration: 400, onUpdate: (tw) => (fade = tw.getValue() ?? 0) });
            later(scene, 420, () => {
              scene.events.off('update', draw);
              fx.destroy();
              banner.destroy();
            });
          },
        });
      });
    },
    // Takhta Kegelapan (Throne of Darkness): night of the dead falls. He vanishes in soul fire and his throne rises
    // out of the floor at the edge of the arena with him already seated on it. From the skull at its crown chains of
    // soul fire lash out at every enemy, flyers too, and drag them across the floor to kneel before him in one long row,
    // heads bowed (BERLUTUT!). Then the king rises and walks his court: a step of soul fire to each kneeling enemy
    // in turn, a cut for each, until he reaches the end of the row. He is back on his throne in a blink. A snap of his
    // fingers: every chain pulls taut and the souls of the whole row are torn out through them, green ghosts racing
    // up the chains into the skull. The skull's eyes blaze, a pillar of soul fire bursts from the throne up through
    // the sky, the night itself cracks open around it, and fire answers under every kneeling body at once (TAMAT.).
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 10);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      p.invuln(4400);
      p.lock(4000);
      // The throne goes to the edge behind him; the court faces it from the open side.
      const f = foes.filter((t) => t.x >= p.x).length * 2 >= foes.length ? 1 : -1;
      const thX = f > 0 ? 22 : W - 22;
      const seat = { x: thX, y: FLOOR_Y - 17 };
      let hold = { x: p.x, y: p.y };
      const pin = () => {
        if (!p.active) return;
        p.setPosition(hold.x, hold.y);
        p.setVelocity(0, 0);
      };
      scene.events.on('postupdate', pin);
      // Behind the enemies (depth 4.6): the court kneeling in it must stay seen.
      const night = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x06030c, 0.8).setOrigin(0).setDepth(4.6).setAlpha(0);
      scene.tweens.add({ targets: night, alpha: 1, duration: 450 });
      const motes = scene.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          const m = scene.add.rectangle(Phaser.Math.Between(0, W), FLOOR_Y - 2, 1, 2, Math.random() < 0.5 ? SOUL[1] : SOUL[2]).setDepth(9);
          scene.tweens.add({ targets: m, y: m.y - Phaser.Math.Between(30, 90), alpha: 0, duration: 1200, onComplete: () => m.destroy() });
        },
      });
      // He vanishes into soul fire; the throne rises at the edge with him on it.
      soulGeyser(scene, p.x, FLOOR_Y, 22);
      afterimage(scene, p, p.x, p.y, 0.7, SOUL[1]);
      const { c: throne, tips } = darkThrone(scene, thX, FLOOR_Y);
      throne.setDepth(9.5).setScale(1, 0);
      const skull = { x: thX, y: FLOOR_Y - 43 };
      // Where the chains leave the throne: its skull, its two side spires and its two skull-capped armrests.
      const anchors = [
        [0, -43],
        [-9, -47],
        [9, -47],
        [-14.5, -23],
        [14.5, -23],
      ].map(([ax, ay]) => ({ x: thX + ax, y: FLOOR_Y + ay }));
      later(scene, 150, () => {
        hold = { ...seat };
        p.facing = f;
        cam.shake(500, 0.006);
        rocks(scene, thX - 10, FLOOR_Y, 5);
        rocks(scene, thX + 10, FLOOR_Y, 5);
        scene.tweens.add({ targets: throne, scaleY: 1, duration: 450, ease: 'Back.Out' });
      });
      const flames = scene.time.addEvent({
        delay: 110,
        loop: true,
        callback: () => {
          if (throne.scaleY < 0.9) return;
          for (const [tx, ty] of tips) flameTongue(scene, throne.x + tx, FLOOR_Y + ty + 1, 7, 300, SOUL);
        },
      });
      // The court: a slot on the floor for each, in a row leading away from the throne; bosses kneel where they are.
      const span = Math.min(28, (W - 70) / foes.length);
      const court = foes.map((t, i) => ({
        t,
        boss: 'tier' in t,
        x: 'tier' in t ? t.x : thX + f * (48 + i * span),
        reach: 0,
        angle: t.angle,
      }));
      const row = [...court].sort((a, b) => (a.x - thX) * f - (b.x - thX) * f);
      const chains = scene.add.graphics().setDepth(11);
      let taut = 0;
      let dim = 1;
      let dragging = false;
      let kneel = false;
      const tick = () => {
        chains.clear();
        const now = scene.time.now;
        for (const [i, k] of court.entries()) {
          const t = k.t;
          if (!t.active || k.reach <= 0) continue;
          const o = anchors[i % anchors.length];
          const [ex, ey] = [o.x + (t.x - o.x) * k.reach, o.y + (t.y - o.y) * k.reach];
          soulChain(chains, o.x, o.y, ex, ey, kneel ? taut : 0.3, dim);
          if (k.boss) continue;
          const e = t as Phaser.GameObjects.Sprite & { stunUntil: number };
          const body = t.body as Phaser.Physics.Arcade.Body;
          const gy = FLOOR_Y - t.displayHeight / 2;
          if (kneel) {
            e.stunUntil = now + 300;
            body.reset(k.x, gy);
          } else if (dragging) {
            e.stunUntil = now + 300;
            const [dx, dy] = [k.x - t.x, gy - t.y];
            const dd = Math.hypot(dx, dy);
            if (dd < 4) body.reset(k.x, gy);
            else body.setVelocity((dx / dd) * Math.min(380, dd * 9), (dy / dd) * Math.min(380, dd * 9));
          }
        }
      };
      scene.events.on('update', tick);
      // The chains lash out one after another.
      later(scene, 600, () => {
        cam.flash(140, 30, 140, 80);
        ring(scene, skull.x, skull.y, SOUL[1], 4, 30, 360, 2);
      });
      court.forEach((k, i) =>
        later(scene, 650 + i * 45, () => {
          scene.tweens.addCounter({ from: 0, to: 1, duration: 160, onUpdate: (tw) => (k.reach = tw.getValue() ?? 0) });
          later(scene, 160, () => k.t.active && sparks(scene, k.t.x, k.t.y, [SOUL[1], 0x0a0612], 5, 8));
        }),
      );
      later(scene, 950, () => (dragging = true));
      // BERLUTUT: all of them on their knees in a row, heads bowed toward the throne.
      later(scene, 1500, () => {
        kneel = true;
        taut = 1;
        cam.shake(260, 0.016);
        floatText(scene, W / 2, 40, 'BERLUTUT!', '#3dff8f');
        for (const k of court) {
          if (!k.t.active) continue;
          if (!k.boss) k.t.setAngle(-f * 28);
          rocks(scene, k.t.x, FLOOR_Y, 2);
          world.strike(k.t, 0.8 * power, 'ult', false, undefined, 0);
        }
      });
      // The king walks his court: a step of soul fire onto each, one cut each (the chains dim so he stands out).
      later(scene, 1750, () => (dim = 0.45));
      const STEP = Math.min(150, 900 / row.length);
      row.forEach((k, i) =>
        later(scene, 1800 + i * STEP, () => {
          const t = k.t;
          const [nx, ny] = [Phaser.Math.Clamp(k.x - f * 9, 6, W - 6), FLOOR_Y - 7];
          const trail = scene.add.graphics().setDepth(12);
          for (const [w, c, a] of [
            [5, SOUL[1], 0.25],
            [1, SOUL[2], 1],
          ] as const)
            trail.lineStyle(w, c, a).lineBetween(hold.x, hold.y + 4, nx, ny + 4);
          scene.tweens.add({ targets: trail, alpha: 0, duration: 250, onComplete: () => trail.destroy() });
          afterimage(scene, p, hold.x, hold.y, 0.6, SOUL[1]);
          hold = { x: nx, y: ny };
          if (!t.active) return;
          cutMark(scene, t.x, t.y - 2, SOUL[2], 22, f > 0 ? -0.5 : 0.5);
          sparks(scene, t.x, t.y, [SOUL[1], 0x0a0612, 0xb3122e], 8, 12);
          cam.shake(80, 0.008);
          world.strike(t, 1.4 * power, 'ult', false, undefined, 0);
        }),
      );
      // Back on the throne in a blink; the snap of his fingers.
      const back = 1800 + row.length * STEP + 150;
      later(scene, back, () => {
        afterimage(scene, p, hold.x, hold.y, 0.7, SOUL[1]);
        hold = { ...seat };
        soulGeyser(scene, seat.x, FLOOR_Y, 14);
      });
      later(scene, back + 250, () => {
        dim = 1;
        glint(scene, seat.x + f * 5, seat.y - 4);
        cam.shake(120, 0.01);
        // Every soul torn out up its chain into the skull.
        for (const k of court) {
          const t = k.t;
          if (!t.active) continue;
          const ghost = scene.add
            .image(t.x, t.y, t.texture.key, t.frame.name)
            .setFlipX(t.flipX)
            .setTint(SOUL[1])
            .setTintMode(Phaser.TintModes.FILL)
            .setAlpha(0.85)
            .setDepth(13);
          scene.tweens.add({
            targets: ghost,
            x: skull.x,
            y: skull.y,
            scale: 0.3,
            alpha: 0.2,
            duration: 380,
            ease: 'Quad.In',
            onComplete: () => ghost.destroy(),
          });
        }
      });
      // The skull blazes; a pillar of soul fire from the throne through the sky, the night cracking open around it,
      // and fire under every kneeling body at once.
      later(scene, back + 650, () => {
        kneel = false;
        scene.events.off('update', tick);
        chains.destroy();
        cam.flash(220, 61, 255, 143);
        cam.shake(600, 0.032);
        floatText(scene, W / 2, 40, 'TAMAT.', '#3dff8f');
        const pillar = scene.add.graphics().setDepth(12);
        const sky = scene.add.graphics().setDepth(8.5);
        const seams = Array.from({ length: 7 }, (_, i) => {
          const a = -Math.PI / 2 + (i - 3) * 0.42 + f * 0.4;
          return jag(thX, 30 + i * 6, thX + Math.cos(a) * 260, 30 + i * 6 + Math.sin(a) * 120 + 60, 6);
        });
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 700,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            const w = 14 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
            pillar.clear();
            for (const [ww, c, a] of [
              [w * 2.2, SOUL[0], 0.35],
              [w, SOUL[1], 0.9],
              [w * 0.4, SOUL[2], 1],
            ] as const)
              pillar.fillStyle(c, a).fillRect(thX - ww / 2, 0, ww, FLOOR_Y - 43);
            sky.clear();
            for (const seam of seams) {
              const pts = seam.slice(0, Math.max(2, Math.ceil(seam.length * Math.min(1, k * 2)))).map(([x, y]) => V2(x, y));
              sky.lineStyle(3, SOUL[1], 0.3 * (1 - k)).strokePoints(pts);
              sky.lineStyle(1, SOUL[2], 1 - k).strokePoints(pts);
            }
          },
          onComplete: () => (pillar.destroy(), sky.destroy()),
        });
        for (const k of court) {
          if (k.t.active) k.t.setAngle(k.angle);
          soulGeyser(scene, k.t.active ? k.t.x : k.x, FLOOR_Y, Phaser.Math.Between(20, 30));
        }
        for (const t of world.targets(thX, FLOOR_Y)) {
          sparks(scene, t.x, t.y, [SOUL[1], SOUL[2], 0xfff1e8], 10, 18);
          world.strike(t, 3.5 * power, 'ult', true, { slow: 1200 }, 0);
        }
      });
      // Night lifts; the throne sinks back into the floor and leaves him standing where it stood.
      later(scene, back + 1150, () => {
        scene.events.off('postupdate', pin);
        p.setPosition(seat.x + f * 10, FLOOR_Y - 8);
        motes.remove();
        flames.remove();
        for (const k of court) if (k.t.active) k.t.setAngle(k.angle);
        scene.tweens.add({ targets: throne, scaleY: 0, duration: 400, ease: 'Quad.In', onComplete: () => throne.destroy() });
        scene.tweens.add({ targets: night, alpha: 0, duration: 500, onComplete: () => night.destroy() });
      });
    },
  },
  bintangFajar: {
    // The finisher brings the star down, and it bursts on impact: eight short rays of light shoot out all round the
    // point where it struck, cutting what is near.
    onSwing: ({ p, world, scene, power }, _m, step) => {
      if (step !== 3) return;
      later(scene, 110, () => {
        if (!p.active) return;
        const [x, y] = [p.x + p.facing * 20, p.y];
        glint(scene, x, y);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          dawnRay(scene, x, y, x + Math.cos(a) * (i % 2 ? 16 : 24), y + Math.sin(a) * (i % 2 ? 16 : 24), 220);
        }
        for (const t of world.targets(x, y))
          if (Phaser.Math.Distance.Between(x, y, t.x, t.y) < 26) world.strike(t, 0.6 * power, 'skill', false, undefined, 90);
      });
    },
    // Bintang Jatuh Fajar (Falling Morning Star): where he lands, a five-pointed star of light is drawn on the floor; it
    // flares, and three rays shoot up out of its upper points into the air, striking flyers too.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const g = scene.add.graphics().setPosition(x, gy).setDepth(9).setScale(1, 0.35);
      g.fillStyle(RADIANT.ivory, 0.35).fillPoints(starPts(20), true);
      g.lineStyle(1, RADIANT.gold).strokePoints(starPts(18), true);
      scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.3, delay: 200, duration: 350, onComplete: () => g.destroy() });
      ring(scene, x, gy - 2, RADIANT.gold, 4, 30, 280, 2);
      later(scene, 120, () => {
        const hit = new Set<Phaser.GameObjects.GameObject>();
        for (const a of [-Math.PI / 2 - 0.55, -Math.PI / 2, -Math.PI / 2 + 0.55]) {
          const [ox, oy] = [x + Math.cos(a) * 10, gy - 4];
          dawnRay(scene, ox, oy, ox + Math.cos(a) * 110, oy + Math.sin(a) * 110, 260);
          for (const t of world.targets(ox, oy)) {
            if (hit.has(t) || !onLine(ox, oy, a, 110, t, 8)) continue;
            hit.add(t);
            world.strike(t, 0.8 * power, 'proc', false, undefined, 60);
          }
        }
      });
    },
    // Mata Pengawas (The Watching Eye): he lifts his blindfolded face and one eye of his wheels leaves them. It comes
    // down out of the sky over the thickest crowd, grows into a great eye held in two small turning wheels, and opens;
    // its gaze falls to the floor in a wide cone of light, the iris following whatever it watches. Nothing may strike
    // under that gaze: an enemy that begins an attack inside it is pierced by a ray from the eye and its attack is
    // broken off. Every time the eye narrows, everything in its light burns. It never stares at an empty floor: it
    // drifts after the thickest crowd as the enemies move. After 5 s it closes and rises away.
    skill: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const near = (e: Phaser.GameObjects.Sprite) => foes.filter((o) => Math.abs(o.x - e.x) < 60).length;
      const mark = foes.reduce((b, e) => (near(e) > near(b) ? e : b));
      let lx = Phaser.Math.Clamp(mark.x, 50, W - 50);
      const ly = 32;
      const SPREAD = 72;
      const LIFE = 5000;
      p.lock(300);
      p.setVelocityX(0);
      glint(scene, p.x, p.y - 15);
      const eye = { y: -30, open: 0, squint: 0 };
      let look = Math.PI / 2;
      const eg = scene.add.graphics().setDepth(12);
      const drawEye = (now: number) => {
        eg.clear();
        ophanim(eg, lx, eye.y, 16, 2, now / 700, 4, 3, eye.open > 0.5 ? 1 : 0, () => look);
        ophanEye(eg, lx, eye.y, 24, eye.open * (1 - 0.6 * eye.squint), look);
      };
      const cone = scene.add.graphics().setDepth(9).setAlpha(0);
      scene.tweens.add({ targets: eye, y: ly, duration: 380, ease: 'Back.Out' });
      scene.tweens.add({ targets: eye, open: 1, delay: 320, duration: 260, ease: 'Sine.Out' });
      scene.tweens.add({ targets: cone, alpha: 1, delay: 400, duration: 250 });
      // Inside the gaze: from just under the eye down to the floor, widening.
      const top = ly + 6;
      const inside = (t: Phaser.GameObjects.Sprite) =>
        t.y >= top && t.y <= FLOOR_Y + 4 && Math.abs(t.x - lx) <= 8 + ((t.y - top) / (FLOOR_Y - top)) * SPREAD;
      const born = scene.time.now;
      let beat = born + 600;
      const watched = new Set<Phaser.GameObjects.GameObject>();
      const loop = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          const now = scene.time.now;
          const k = (now - born) / LIFE;
          // Drift toward the thickest crowd (about 40 px/s), carrying the gaze with it; the iris follows the nearest.
          const live = world.targets(lx, ly);
          if (live.length && k < 1) {
            const crowd = (e: Phaser.GameObjects.Sprite) => live.filter((o) => Math.abs(o.x - e.x) < 60).length;
            const goal = Phaser.Math.Clamp(live.reduce((b, e) => (crowd(e) > crowd(b) ? e : b)).x, 50, W - 50);
            lx += Phaser.Math.Clamp(goal - lx, -0.7, 0.7);
            const aim = Math.atan2(live[0].y - ly, live[0].x - lx);
            look += Phaser.Math.Angle.Wrap(aim - look) * 0.15;
          }
          drawEye(now);
          // The light: a soft outer cone, a brighter inner one, its edges, a pool on the floor and motes drifting in it.
          const flick = 0.85 + Math.sin(now / 45) * 0.08 + Math.sin(now / 17) * 0.05;
          cone.clear();
          for (const [w, a] of [
            [1, 0.1],
            [0.55, 0.12],
          ] as const) {
            cone
              .fillStyle(RADIANT.ivory, a * flick * (1 + eye.squint))
              .fillPoints([V2(lx - 6 * w, top), V2(lx + 6 * w, top), V2(lx + SPREAD * w, FLOOR_Y), V2(lx - SPREAD * w, FLOOR_Y)], true);
          }
          cone
            .lineStyle(1, RADIANT.gold, 0.35 * flick)
            .lineBetween(lx - 6, top, lx - SPREAD, FLOOR_Y)
            .lineBetween(lx + 6, top, lx + SPREAD, FLOOR_Y);
          cone.fillStyle(RADIANT.ivory, 0.35 * flick).fillEllipse(lx, FLOOR_Y, SPREAD * 2, 6);
          for (let i = 0; i < 10; i++) {
            const m = (now / 2200 + i / 10) % 1;
            const my = top + m * (FLOOR_Y - top);
            const half = 6 + m * SPREAD;
            cone.fillStyle(RADIANT.white, 0.8).fillRect(lx + Math.sin(i * 2.3 + now / 600) * half * 0.8, my, 1, 1);
          }
          if (k >= 1) return;
          for (const t of world.targets(lx, ly)) {
            if (!t.active || !inside(t)) continue;
            // Any attack begun under the gaze is broken off by a ray from the eye.
            if (!watched.has(t) && 'windingUp' in t && (t as { windingUp: boolean }).windingUp) {
              watched.add(t);
              (t as unknown as { interrupt(ms: number): void }).interrupt(900);
              dawnRay(scene, lx, ly + 2, t.x, t.y, 220);
              ring(scene, t.x, t.y, RADIANT.gold, 2, 14, 220, 1);
              world.strike(t, 1.4 * power, 'skill', false, undefined, 60);
              later(scene, 900, () => watched.delete(t));
            }
          }
          if (now < beat) return;
          // The eye narrows: everything in its light burns.
          beat = now + 700;
          scene.tweens.addCounter({ from: 1, to: 0, duration: 300, onUpdate: (tw) => (eye.squint = tw.getValue() ?? 0) });
          for (const t of world.targets(lx, ly)) {
            if (!t.active || !inside(t)) continue;
            sparks(scene, t.x, t.y, [RADIANT.gold, RADIANT.white], 4, 10);
            world.strike(t, 0.7 * power, 'skill', false, { slow: 400 }, 0);
          }
        },
      });
      later(scene, LIFE, () => {
        loop.remove();
        scene.tweens.add({ targets: cone, alpha: 0, duration: 300, onComplete: () => cone.destroy() });
        // The eye closes, then rises back into the sky.
        scene.tweens.add({
          targets: eye,
          open: 0,
          duration: 200,
          onUpdate: () => drawEye(scene.time.now),
          onComplete: () =>
            scene.tweens.add({
              targets: eye,
              y: -40,
              duration: 400,
              ease: 'Quad.In',
              onUpdate: () => drawEye(scene.time.now),
              onComplete: () => eg.destroy(),
            }),
        });
      });
    },
    // Rasi Bintang Fajar (Constellation of the Morning Star): he raises the mace and the sky over the arena dims to a
    // star chart, faint rings and ticks across it. Sparks fly off the star on his mace, one to every enemy (up to
    // eight, flyers too), and set a star on each: it is held there, a point of the chart. Then he draws the
    // constellation: lines of gold join star to star, one after another, nearest to nearest. When it is whole, light
    // runs the length of it and back, and every star it reaches bursts. Last, the whole figure blazes at once: the more
    // stars in it, the brighter it burns (each one's last blow grows with the size of the constellation).
    fusion: ({ p, world, scene, power }) => {
      const all = world.targets(p.x, p.y).slice(0, 8);
      if (!all.length) return false;
      const cam = scene.cameras.main;
      p.lock(500);
      p.invuln(900);
      p.setVelocityX(0);
      // The path: nearest to him first, then always the nearest star not yet in it.
      const path = [all[0]];
      const rest = all.slice(1);
      while (rest.length) {
        const last = path[path.length - 1];
        rest.sort(
          (a, b) => Phaser.Math.Distance.Between(last.x, last.y, a.x, a.y) - Phaser.Math.Distance.Between(last.x, last.y, b.x, b.y),
        );
        path.push(rest.shift()!);
      }
      const n = path.length;
      const pts = path.map((t) => ({ x: t.x, y: t.y }));
      const [mx, my] = [p.x + p.facing * 4, p.y - 14];
      glint(scene, mx, my);
      // The star chart over the sky.
      const chart = scene.add.graphics().setDepth(4.6).setAlpha(0);
      chart.fillStyle(0x0b1030, 0.55).fillRect(0, 0, W, FLOOR_Y);
      for (const r of [40, 80, 120]) chart.lineStyle(1, RADIANT.ivory, 0.12).strokeCircle(W / 2, FLOOR_Y, r * 1.6);
      for (let i = 0; i < 24; i++) {
        const a = Math.PI + (i / 24) * Math.PI;
        chart
          .lineStyle(1, RADIANT.ivory, 0.18)
          .lineBetween(W / 2 + Math.cos(a) * 186, FLOOR_Y + Math.sin(a) * 186, W / 2 + Math.cos(a) * 196, FLOOR_Y + Math.sin(a) * 196);
      }
      for (let i = 0; i < 40; i++)
        chart
          .fillStyle(RADIANT.white, Math.random() * 0.6 + 0.2)
          .fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, FLOOR_Y - 20), 1, 1);
      scene.tweens.add({ targets: chart, alpha: 1, duration: 300 });
      const fx = scene.add.graphics().setDepth(13);
      let set = 0;
      let drawn = 0;
      let run = -1;
      const held = () => {
        const now = scene.time.now;
        fx.clear();
        path.forEach((t, i) => {
          if (t.active) pts[i] = { x: t.x, y: t.y };
          if (i < set && t.active && !('tier' in t)) {
            (t as Phaser.GameObjects.Sprite & { stunUntil: number }).stunUntil = now + 200;
            (t.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
          }
        });
        // The lines drawn so far: a glow, a gold body, a white core; the one being drawn grows.
        for (let i = 1; i < n; i++) {
          const k = Phaser.Math.Clamp(drawn - (i - 1), 0, 1);
          if (k <= 0) break;
          const [a, b] = [pts[i - 1], pts[i]];
          const [ex, ey] = [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
          for (const [w, c, al] of [
            [5, RADIANT.ivory, 0.25],
            [2, RADIANT.gold, 1],
            [1, RADIANT.white, 1],
          ] as const)
            fx.lineStyle(w, c, al).lineBetween(a.x, a.y, ex, ey);
        }
        // The running light.
        if (run >= 0 && n > 1) {
          const seg = Math.min(n - 2, Math.floor(run));
          const k = run - seg;
          const [a, b] = [pts[seg], pts[seg + 1]];
          const [rx, ry] = [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
          fx.fillStyle(RADIANT.ivory, 0.5).fillCircle(rx, ry, 6);
          fx.fillStyle(RADIANT.white).fillCircle(rx, ry, 3);
        }
        // The stars themselves, twinkling.
        for (let i = 0; i < set; i++) {
          const { x, y } = pts[i];
          const tw = 4 + Math.sin(now / 80 + i * 1.7) * 1.5;
          fx.fillStyle(RADIANT.ivory, 0.35).fillCircle(x, y, tw + 2);
          fx.fillStyle(RADIANT.gold).fillPoints(
            starPts(tw, now / 400 + i).map((v) => V2(v.x + x, v.y + y)),
            true,
          );
          fx.fillStyle(RADIANT.white).fillRect(x - 0.5, y - 0.5, 1, 1);
        }
      };
      scene.events.on('update', held);
      // The sparks fly out and set the stars.
      path.forEach((_t, i) =>
        later(scene, 150 + i * 60, () => {
          const s = scene.add.rectangle(mx, my, 2, 2, RADIANT.white).setDepth(14);
          const [x1, y1] = [pts[i].x, pts[i].y];
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 220,
            onUpdate: (tw) => s.setPosition(...bez(mx, my, (mx + x1) / 2, Math.min(my, y1) - 30, x1, y1, tw.getValue() ?? 0)),
            onComplete: () => {
              s.destroy();
              set = Math.max(set, i + 1);
              ring(scene, x1, y1, RADIANT.gold, 2, 12, 200, 1);
            },
          });
        }),
      );
      // The lines, star to star.
      const LINE = 110;
      const t0 = 150 + n * 60 + 250;
      scene.tweens.addCounter({
        from: 0,
        to: n - 1,
        delay: t0,
        duration: Math.max(1, (n - 1) * LINE),
        onUpdate: (tw) => (drawn = tw.getValue() ?? 0),
      });
      // The light runs it there and back; each star it reaches bursts.
      const burst = (i: number, mult: number) => {
        const t = path[i];
        const { x, y } = pts[i];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          dawnRay(scene, x, y, x + Math.cos(a) * 10, y + Math.sin(a) * 10, 180);
        }
        if (!t.active) return;
        cam.shake(60, 0.006);
        world.strike(t, mult * power, 'skill', false, undefined, 0);
      };
      const t1 = t0 + (n - 1) * LINE + 150;
      const RUN = 90;
      for (let i = 0; i < n; i++) later(scene, t1 + i * RUN, () => ((run = i), burst(i, 1.2)));
      for (let i = n - 1; i >= 0; i--) later(scene, t1 + n * RUN + (n - 1 - i) * 60, () => ((run = i), burst(i, 1)));
      // The whole figure blazes.
      const t2 = t1 + n * RUN + n * 60 + 150;
      later(scene, t2, () => {
        run = -1;
        cam.flash(180, 255, 233, 168);
        cam.shake(350, 0.022);
        for (let i = 0; i < n; i++) {
          const t = path[i];
          const { x, y } = pts[i];
          ring(scene, x, y, RADIANT.white, 4, 26, 300, 2);
          sparks(scene, x, y, [RADIANT.gold, RADIANT.white, RADIANT.ivory], 10, 16);
          if (t.active) world.strike(t, Math.min(2.6, 0.3 * n + 0.4) * power, 'skill', false, { slow: 900 }, 0);
        }
      });
      later(scene, t2 + 250, () => {
        scene.events.off('update', held);
        scene.tweens.add({ targets: [fx, chart], alpha: 0, duration: 350, onComplete: () => (fx.destroy(), chart.destroy()) });
      });
    },
    // Wujud Sejati (True Form): he takes off nothing, yet everything changes. The world blanches in his light; the
    // wheels over his head leave him and climb over the middle of the arena, swelling into three great rings crossed
    // through each other and turning, their rims full of closed eyes, six wings of light unfolding behind them. Then
    // the eyes open, all of them, and every enemy on the field is SEEN: a thread of gold runs from the wheels to each,
    // and each is held where it stands, every eye on the rims turned toward the nearest of them. Lances of light leave
    // the rims one after another, each finding one of the seen in turn. Last, every eye flares at once: a pillar of
    // light falls on each enemy from the sky (JANGAN TAKUT.), and the wheels shrink back over his head.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(4000);
      p.lock(3700);
      p.setVelocity(0, 0);
      const [cx, cy] = [W / 2, 74];
      // The wheels leave his head (STYLES.lightLord.attach hides them while they are out).
      p.setData('wheelsOut', true);
      const wash = scene.add.rectangle(0, 0, W, H, RADIANT.ivory, 0.3).setOrigin(0).setDepth(8).setAlpha(0);
      scene.tweens.add({ targets: wash, alpha: 1, duration: 600 });
      const w = { x: p.x, y: p.y - 15, R: 6, open: 0, spin: 0.012, wings: 0, flare: 0 };
      scene.tweens.add({ targets: w, x: cx, y: cy, R: 46, duration: 900, ease: 'Sine.InOut' });
      scene.tweens.add({ targets: w, wings: 1, delay: 500, duration: 600, ease: 'Back.Out' });
      let rot = 0;
      let seen: Phaser.GameObjects.Sprite[] = [];
      const g = scene.add.graphics().setDepth(8.6);
      const gaze = scene.add.graphics().setDepth(12);
      // Where on the rims a thread or lance leaves for (x, y): the point of the outer ring facing it.
      const rim = (x: number, y: number): [number, number] => {
        const a = Math.atan2(y - w.y, x - w.x);
        return [w.x + Math.cos(a) * w.R, w.y + Math.sin(a) * w.R];
      };
      const draw = () => {
        const now = scene.time.now;
        rot += w.spin;
        g.clear();
        // Six wings of light behind the wheels, three a side (raised, spread, lowered), beating slowly.
        if (w.wings > 0)
          for (const s of [-1, 1])
            for (let k = 0; k < 3; k++) {
              const base = -0.9 + k * 0.65 + Math.sin(now / 400 + k) * 0.06;
              const L = w.R * (1.6 - k * 0.25) * w.wings;
              const [rx, ry] = [w.x + s * 6, w.y];
              for (let f = 0; f < 5; f++) {
                const a = base + (f - 2) * 0.09;
                const [ex, ey] = [rx + s * Math.cos(a) * L * (1 - Math.abs(f - 2) * 0.08), ry + Math.sin(a) * L];
                g.fillStyle(RADIANT.ivory, 0.3).fillTriangle(rx, ry - 3, rx, ry + 3, ex, ey);
                g.fillStyle(RADIANT.white, 0.55).fillTriangle(rx, ry - 1, rx, ry + 1, rx + (ex - rx) * 0.85, ry + (ey - ry) * 0.85);
              }
            }
        g.fillStyle(RADIANT.ivory, 0.2 + 0.35 * w.flare).fillCircle(w.x, w.y, w.R * 0.45 + 6 + w.flare * 10);
        const live = seen.filter((t) => t.active);
        const look = (x: number, y: number) => {
          if (!live.length) return Math.PI / 2;
          const t = live.reduce((b, e) =>
            Phaser.Math.Distance.Between(x, y, e.x, e.y) < Phaser.Math.Distance.Between(x, y, b.x, b.y) ? e : b,
          );
          return Math.atan2(t.y - y, t.x - x);
        };
        const big = w.R > 30;
        ophanim(g, w.x, w.y, w.R, 3, rot, big ? 6 : 3, big ? 11 : 2, w.open * (1 + 0.3 * w.flare), look);
        // The seen: held where they stand, a thread of gold from the rims to each.
        gaze.clear();
        for (const t of live) {
          if (!('tier' in t)) {
            (t as Phaser.GameObjects.Sprite & { stunUntil: number }).stunUntil = now + 200;
            (t.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
          }
          const [ox, oy] = rim(t.x, t.y);
          gaze.lineStyle(1, RADIANT.gold, 0.45 + 0.25 * Math.sin(now / 60 + t.x)).lineBetween(ox, oy, t.x, t.y);
          gaze.fillStyle(RADIANT.white, 0.8).fillRect(t.x - 0.5, t.y - 0.5, 1, 1);
        }
      };
      scene.events.on('update', draw);
      later(scene, 900, () => {
        cam.flash(150, 255, 241, 232);
        ring(scene, cx, cy, RADIANT.white, 10, 70, 400, 2);
      });
      // The eyes open, all of them, and everyone is seen.
      scene.tweens.add({ targets: w, open: 1, delay: 1000, duration: 450, ease: 'Sine.Out' });
      later(scene, 1300, () => {
        seen = world.targets(cx, cy);
        for (const t of seen) {
          ring(scene, t.x, t.y, RADIANT.gold, 12, 2, 260, 1);
          world.strike(t, 0.4 * power, 'ult', false, undefined, 0);
        }
      });
      // The lances, one after another, each finding the next of the seen.
      const LANCES = Phaser.Math.Clamp(4 + 2 * world.targets(cx, cy).length, 6, 14);
      for (let i = 0; i < LANCES; i++)
        later(scene, 1600 + (i * 1300) / LANCES, () => {
          const live = seen.filter((t) => t.active);
          if (!live.length) return;
          const t = live[i % live.length];
          const a = Math.random() * Math.PI * 2;
          const [ox, oy] = [w.x + Math.cos(a) * w.R, w.y + Math.sin(a) * w.R * 0.8];
          dawnRay(scene, ox, oy, t.x, t.y, 240, 2);
          ring(scene, t.x, t.y, RADIANT.white, 2, 14, 200, 1);
          sparks(scene, t.x, t.y, [RADIANT.gold, RADIANT.white], 5, 10);
          cam.shake(60, 0.006);
          world.strike(t, 0.35 * power, 'ult', false, undefined, 0);
        });
      // Every eye flares at once: a pillar of light on each enemy.
      later(scene, 3050, () => {
        w.flare = 1;
        w.spin = 0.06;
        cam.flash(220, 255, 241, 232);
        cam.shake(500, 0.03);
        floatText(scene, W / 2, 96, 'JANGAN TAKUT.', '#fff1e8');
        for (const t of world.targets(cx, cy)) {
          const pillar = [
            scene.add.rectangle(t.x, 0, 18, FLOOR_Y, RADIANT.ivory, 0.35),
            scene.add.rectangle(t.x, 0, 8, FLOOR_Y, RADIANT.gold, 0.8),
            scene.add.rectangle(t.x, 0, 2, FLOOR_Y, RADIANT.white),
          ].map((r) => r.setOrigin(0.5, 0).setDepth(13));
          scene.tweens.add({
            targets: pillar,
            scaleX: 0,
            alpha: 0,
            delay: 150,
            duration: 420,
            onComplete: () => pillar.forEach((r) => r.destroy()),
          });
          ring(scene, t.x, t.y, RADIANT.white, 3, 24, 300, 2);
          sparks(scene, t.x, t.y, [RADIANT.gold, RADIANT.white, RADIANT.ivory], 12, 18);
          world.strike(t, 3 * power, 'ult', true, { slow: 1000 }, 0);
        }
      });
      // The eyes close, the wings fold, and the wheels shrink back over his head.
      later(scene, 3400, () => {
        seen = [];
        gaze.clear();
        scene.tweens.add({ targets: w, open: 0, wings: 0, flare: 0, spin: 0.012, duration: 250 });
        scene.tweens.add({
          targets: w,
          x: p.x,
          y: p.y - 15,
          R: 6,
          delay: 200,
          duration: 400,
          ease: 'Quad.In',
          onComplete: () => {
            scene.events.off('update', draw);
            g.destroy();
            gaze.destroy();
            p.setData('wheelsOut', false);
          },
        });
        scene.tweens.add({ targets: wash, alpha: 0, duration: 600, onComplete: () => wash.destroy() });
      });
    },
  },
  rantaiKamui: {
    // Every swing throws the chain itself out along the move's reach, shackle first: a lash straight out and back, a
    // sweep from high behind to low ahead, a jerk from low up. The finisher's shackle closes inside a small warp.
    onSwing: ({ p, scene }, m, step) => {
      if (m.anim === 'plunge') return;
      const g = scene.add.graphics().setDepth(11);
      const reach = m.reach.w + 2;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: m.ms + 40,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          g.clear();
          if (!p.active) return;
          const f = p.facing;
          const [hx, hy] = [p.x + f * 3, p.y];
          let [a, d] = [0, reach * Math.sin(Math.min(1, k * 1.15) * Math.PI)];
          if (m.anim === 'hook') [a, d] = [-1.3 + k * 1.9, reach * 0.95];
          else if (m.anim === 'uppercut') [a, d] = [0.8 - k * 2.2, reach * 0.9];
          const [ex, ey] = [hx + f * Math.cos(a) * d, hy + Math.sin(a) * d];
          kamuiChain(g, hx, hy, ex, ey, m.anim === 'thrust' ? 2 : 4);
          shackle(g, ex, ey, 2.5);
          if (step === 3 && k > 0.3 && k < 0.75) kamuiSwirl(g, ex, ey, 7, k * 12, 0.85);
        },
        onComplete: () => g.destroy(),
      });
    },
    // Tembus Lantai: he phases into the floor where he lands; a warp spreads flat across it, and two chains whip up out
    // of the floor on either side of him, shackles first, and lash whatever stands there.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const g = scene.add.graphics().setDepth(9);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 520,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          g.clear();
          kamuiSwirl(g, x, gy - 1, 10 + k * 22, k * 9, 1 - k, 0.25);
          for (const side of [-1, 1]) {
            const bx = Phaser.Math.Clamp(x + side * 20, 4, W - 4);
            const up = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 30;
            const sway = Math.sin(k * 10 + side) * 4 * side;
            if (up < 1) continue;
            kamuiChain(g, bx, gy, bx + sway, gy - up, side * 3);
            shackle(g, bx + sway, gy - up, 2.5);
          }
        },
        onComplete: () => g.destroy(),
      });
      later(scene, 140, () => {
        for (const side of [-1, 1]) world.area(x + side * 20, gy - 14, 14, 0.6 * power, 120, 'proc', { slow: 400 });
      });
    },
    // Kamui: the swirl of Obito's mask turns, and space around each of the three nearest enemies winds into a spiral:
    // each one twists, shrinks into the warp's eye and is gone, taken into the Kamui dimension (out of the fight,
    // untouchable). Moments later a warp opens in front of his eye and he spits them back out one after another,
    // hurled ahead of him like stones: whatever they crash into takes the blow, and so do they. A boss (or a ghost
    // that slips in and out of sight) cannot be taken: the warp only wrings it where it stands.
    skill: ({ p, world, scene, power }) => {
      const all = world.targets(p.x, p.y);
      if (!all.length) return false;
      type Taken = Phaser.GameObjects.Sprite & { untargetable: boolean; stunUntil: number; flying?: boolean; kind?: string };
      const taken = (all as Taken[])
        .filter(
          (t) => !('tier' in t) && !['ghost', 'mimic'].includes(t.kind ?? '') && Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 170,
        )
        .slice(0, 3);
      p.lock(420);
      p.setVelocityX(0);
      const cam = scene.cameras.main;
      const OUT = 1700;
      // The warp at (x, y): it opens, turns and closes into its eye over `ms`.
      const warp = (x: number, y: number, r: number, ms: number) => {
        const g = scene.add.graphics().setDepth(12);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: ms,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            g.clear();
            kamuiSwirl(g, x, y, r * Math.sin(Math.min(1, k * 1.3) * Math.PI * 0.5 + (k > 0.6 ? (k - 0.6) * 4 : 0)), k * 14);
          },
          onComplete: () => g.destroy(),
        });
      };
      // The mask's eye: its swirl turns while they are gone.
      const eye = scene.add.graphics().setDepth(14);
      const t0 = scene.time.now;
      const spinEye = () => {
        eye.clear();
        if (p.active) kamuiSwirl(eye, p.x + p.facing * 2, p.y - 3, 4, (scene.time.now - t0) / 90, 0.9);
      };
      scene.events.on('update', spinEye);
      later(scene, taken.length ? OUT + taken.length * 140 + 300 : 600, () => {
        scene.events.off('update', spinEye);
        eye.destroy();
      });
      if (!taken.length) {
        const t = all[0];
        warp(t.x, t.y, 22, 600);
        later(scene, 260, () => {
          if (!t.active) return;
          world.strike(t, 2.6 * power, 'skill', false, { slow: 1200 }, 0);
          cam.shake(120, 0.008);
        });
        return;
      }
      taken.forEach((t, i) =>
        later(scene, 100 + i * 90, () => {
          if (!t.active) return;
          const [x, y] = [t.x, t.y];
          world.strike(t, 0.8 * power, 'skill', false, undefined, 0);
          if (!t.active) return;
          warp(x, y, 16, 520);
          // Its picture twists into the warp's eye; the body itself leaves the fight.
          const pic = scene.add.image(x, y, t.texture.key, t.frame.name).setFlipX(t.flipX).setDepth(12);
          scene.tweens.add({ targets: pic, angle: 540, scale: 0, duration: 380, ease: 'Quad.In', onComplete: () => pic.destroy() });
          t.untargetable = true;
          t.stunUntil = scene.time.now + 60000;
          t.setVisible(false);
          (t.body as Phaser.Physics.Arcade.Body).enable = false;
        }),
      );
      // Spat back out of a warp in front of his eye, hurled ahead.
      later(scene, OUT, () => {
        const f = p.facing;
        const [ox, oy] = [Phaser.Math.Clamp(p.x + f * 16, 8, W - 8), p.y - 6];
        warp(ox, oy, 14, 300 + taken.length * 140);
        taken.forEach((t, i) =>
          later(scene, 120 + i * 140, () => {
            if (!t.active || !t.untargetable) return;
            const body = t.body as Phaser.Physics.Arcade.Body;
            body.enable = true;
            body.reset(ox, oy);
            t.setVisible(true);
            t.untargetable = false;
            t.stunUntil = scene.time.now + 800;
            body.setVelocity(f * 340, t.flying ? 0 : -110);
            cam.shake(80, 0.006);
            world.strike(t, 1 * power, 'skill', false, undefined, 0);
            const hit = new Set<Phaser.GameObjects.Sprite>();
            let n = 0;
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              duration: 650,
              onUpdate: () => {
                if (!t.active) return;
                // A trail of its own flung picture, greyed by the warp.
                if (n++ % 3 === 0) {
                  const im = scene.add
                    .image(t.x, t.y, t.texture.key, t.frame.name)
                    .setFlipX(t.flipX)
                    .setTint(KAMUI.mid)
                    .setTintMode(Phaser.TintModes.FILL)
                    .setAlpha(0.5)
                    .setDepth(4.9);
                  scene.tweens.add({ targets: im, alpha: 0, duration: 220, onComplete: () => im.destroy() });
                }
                for (const o of world.targets(t.x, t.y)) {
                  if (o === t || hit.has(o)) continue;
                  if (
                    Math.abs(o.x - t.x) > (o.displayWidth + t.displayWidth) / 2 + 2 ||
                    Math.abs(o.y - t.y) > (o.displayHeight + t.displayHeight) / 2 + 2
                  )
                    continue;
                  hit.add(o);
                  world.strike(o, 1.8 * power, 'skill', false, undefined, 220);
                  world.strike(t, 0.8 * power, 'skill', false, undefined, 0);
                  sparks(scene, (o.x + t.x) / 2, (o.y + t.y) / 2, [KAMUI.pale, KAMUI.mask, 0xfff1e8], 10, 14);
                  ring(scene, (o.x + t.x) / 2, (o.y + t.y) / 2, KAMUI.pale, 3, 16, 220, 2);
                  cam.shake(90, 0.01);
                }
              },
              // Nothing to crash into: it lands hard instead.
              onComplete: () => !hit.size && t.active && world.strike(t, 0.8 * power, 'skill', false, undefined, 60),
            });
          }),
        );
      });
    },
    // Rantai Belenggu: Obito throws the shackled chain and makes it intangible: it snakes straight through up to six
    // enemies (nearest to nearest), a ghost of a chain that touches nothing. Then he lets it go solid inside them:
    // iron links snap into being, a shackle bites each one, and for 6 s they are chained together: any pain one of
    // them takes (his blows, burns, anything) runs down the chain and 60% of it is felt by every other link.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 6);
      if (!foes.length) return false;
      type L = Phaser.GameObjects.Sprite & { hp: number };
      const LINK = 6000;
      const SHARE = 0.6;
      const SOLID = 520;
      p.lock(SOLID + 80);
      p.invuln(SOLID + 200);
      p.setVelocityX(0);
      // The path: from his hand to the nearest, then on to the nearest of the rest.
      const path: L[] = [];
      const left = [...foes] as L[];
      let [cx, cy] = [p.x, p.y];
      while (left.length) {
        left.sort((a, b) => Phaser.Math.Distance.Between(cx, cy, a.x, a.y) - Phaser.Math.Distance.Between(cx, cy, b.x, b.y));
        const nx = left.shift()!;
        path.push(nx);
        [cx, cy] = [nx.x, nx.y];
      }
      const g = scene.add.graphics().setDepth(12);
      const t0 = scene.time.now;
      let solid = false;
      let glowUntil = 0;
      const prev = new Map<L, number>();
      const draw = () => {
        const now = scene.time.now;
        g.clear();
        const live = path.filter((t) => t.active);
        if (!solid) {
          // The phantom chain snakes along the path; its shackle leads.
          const pts: [number, number][] = [[p.x + p.facing * 3, p.y], ...live.map((t) => [t.x, t.y] as [number, number])];
          const segs = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
          let reach = Math.min(1, (now - t0) / (SOLID - 60)) * segs.reduce((s, v) => s + v, 0);
          for (let i = 0; i < segs.length && reach > 0; i++) {
            const k = Math.min(1, reach / Math.max(1, segs[i]));
            const [ax, ay] = pts[i];
            const [bx, by] = [ax + (pts[i + 1][0] - ax) * k, ay + (pts[i + 1][1] - ay) * k];
            kamuiChain(g, ax, ay, bx, by, 3, true);
            if (k < 1 || i === segs.length - 1) shackle(g, bx, by, 2.5, 0.6);
            reach -= segs[i];
          }
          return;
        }
        // Solid: links between neighbours, a shackle on each, the chain flashing pale when pain runs down it.
        for (let i = 1; i < live.length; i++) {
          const [a, b] = [live[i - 1], live[i]];
          kamuiChain(g, a.x, a.y, b.x, b.y, 6);
          if (now < glowUntil) g.lineStyle(1, 0xfff1e8, 0.8).lineBetween(a.x, a.y, b.x, b.y);
        }
        for (const t of live) shackle(g, t.x, t.y + 2, 3.5);
        // The shared pain: what each took since the last frame, 60% of it to every other link.
        const loss = new Map<L, number>();
        let total = 0;
        for (const t of live) {
          const l = Math.max(0, (prev.get(t) ?? t.hp) - t.hp);
          loss.set(t, l);
          total += l;
        }
        if (total > 0 && live.length > 1) {
          glowUntil = now + 120;
          for (const t of live) {
            const share = (total - (loss.get(t) ?? 0)) * SHARE;
            if (share < 1) continue;
            world.strike(t, Math.min(share / Math.max(1, p.stats.damage), 6 * power), 'proc', false, undefined, 0);
            if (t.active) sparks(scene, t.x, t.y, [KAMUI.pale, 0x5f574f], 4, 8);
          }
        }
        for (const t of path) if (t.active) prev.set(t, t.hp);
      };
      scene.events.on('update', draw);
      // It goes solid inside them.
      later(scene, SOLID, () => {
        solid = true;
        scene.cameras.main.shake(160, 0.012);
        for (const t of path) {
          if (!t.active) continue;
          ring(scene, t.x, t.y, KAMUI.pale, 12, 3, 180, 2);
          sparks(scene, t.x, t.y, [0x000000, KAMUI.mid, KAMUI.mask], 8, 12);
          world.strike(t, 1.2 * power, 'skill', false, { freeze: 350 }, 0);
          if (t.active) prev.set(t, t.hp);
        }
      });
      // After 6 s (or once nobody is left to share with) the chain turns intangible again and fades away.
      const end = scene.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          const now = scene.time.now;
          if (!solid || (now - t0 < SOLID + LINK && path.filter((t) => t.active).length > 1)) return;
          end.remove();
          scene.events.off('update', draw);
          scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
        },
      });
    },
    // Kamui: Dimensi Lain. The swirl of Obito's mask spreads until it swallows the whole arena, and every enemy twists
    // into it: they are in his dimension now, an endless grey void of stone blocks, each one stranded on a block of its
    // own. Obito steps out of a warp beside one after another and his chain shackles each. Then he hauls on every
    // chain at once: the blocks are dragged together and slam into one, crushing whoever stands on them, and the more
    // of them there are the harder it hits (HIMPIT!). The void folds shut and spits them all back into the arena in one
    // heap at its middle. A boss is too big to take: it is crushed by a block that falls out of a warp onto it.
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      type Taken = Phaser.GameObjects.Sprite & { untargetable: boolean; stunUntil: number; kind?: string };
      const taken = (foes as Taken[]).filter((t) => !('tier' in t) && !['ghost', 'mimic'].includes(t.kind ?? '')).slice(0, 8);
      const bosses = foes.filter((t) => 'tier' in t);
      const cam = scene.cameras.main;
      p.invuln(4200);
      p.lock(3700);
      p.setVelocityX(0);
      const parts: Phaser.GameObjects.GameObject[] = [];
      // Build-up: the mask's swirl spreads over everything.
      const big = scene.add.graphics().setDepth(16);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 650,
        ease: 'Quad.In',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          big.clear();
          kamuiSwirl(big, p.x + p.facing * 2, p.y - 3, 4 + k * 260, k * 9, 1 - k * 0.6);
        },
        onComplete: () => big.destroy(),
      });
      cam.shake(650, 0.005);
      // Each enemy twists into it and leaves the arena.
      taken.forEach((t, i) =>
        later(scene, 150 + i * 50, () => {
          if (!t.active) return;
          const pic = scene.add.image(t.x, t.y, t.texture.key, t.frame.name).setFlipX(t.flipX).setDepth(12);
          scene.tweens.add({ targets: pic, angle: 540, scale: 0, duration: 320, ease: 'Quad.In', onComplete: () => pic.destroy() });
          t.untargetable = true;
          t.stunUntil = scene.time.now + 60000;
          t.setVisible(false);
          (t.body as Phaser.Physics.Arcade.Body).enable = false;
        }),
      );
      // The Kamui dimension: a dark void, rows of grey stone blocks fading into the distance, and a block for each.
      const blocks: { t: Taken; x: number; y: number; pic?: Phaser.GameObjects.Image; cuff: boolean }[] = taken.map((t, i) => ({
        t,
        x: 40 + ((i + 0.5) * (W - 80)) / Math.max(1, taken.length),
        y: Phaser.Math.Between(70, 125),
        cuff: false,
      }));
      const block = (g: Phaser.GameObjects.Graphics, x: number, top: number, w: number, h: number, shade: number) => {
        g.fillStyle(0x000000).fillRect(x - w / 2 - 1, top - 1, w + 2, h + 2);
        g.fillStyle([0x3a3450, 0x4a4560, 0x5d586f][shade]).fillRect(x - w / 2, top, w, h);
        g.fillStyle([0x5d586f, 0x6d6884, 0x8a85a0][shade]).fillRect(x - w / 2, top, w, 3);
        g.fillStyle(0x2e2a3d).fillRect(x + w / 2 - 3, top + 3, 3, h - 3);
      };
      const world2 = scene.add.graphics().setDepth(8.2);
      const stage = scene.add.graphics().setDepth(8.4);
      later(scene, 600, () => {
        cam.flash(140, 194, 195, 199);
        world2.fillStyle(0x0d0a14).fillRect(0, 0, W, H);
        for (let r = 0; r < 3; r++)
          for (let i = 0; i < 9; i++) {
            const x = (i + 0.5) * (W / 9) + (r % 2) * 14 + Phaser.Math.Between(-6, 6);
            const w = [10, 16, 24][r];
            const top = [40, 70, 110][r] + Phaser.Math.Between(-12, 12);
            block(world2, x, top, w, H - top, r);
          }
        parts.push(world2, stage);
        // Their pictures on their own blocks.
        for (const b of blocks) {
          if (!b.t.active) continue;
          b.pic = scene.add
            .image(b.x, b.y - b.t.displayHeight / 2, b.t.texture.key, b.t.frame.name)
            .setFlipX(b.t.flipX)
            .setDepth(9);
          parts.push(b.pic);
        }
      });
      // The blocks under them are redrawn every frame (they move at the end); the chains run from each to Obito.
      let pull = 0;
      const drawStage = () => {
        stage.clear();
        for (const b of blocks) {
          const x = b.x + (W / 2 - b.x) * pull;
          block(stage, x, b.y, 28, H - b.y, 2);
          if (b.pic) b.pic.setPosition(x, b.y - b.pic.displayHeight / 2);
          if (b.cuff) {
            const [cx, cy] = [x, b.y - (b.pic?.displayHeight ?? 8) / 2];
            kamuiChain(stage, p.x + p.facing * 3, p.y, cx, cy, 10);
            shackle(stage, cx, cy + 2, 3.5);
          }
        }
      };
      later(scene, 600, () => scene.events.on('update', drawStage));
      // Obito steps out of a warp beside each and shackles it.
      blocks.forEach((b, i) =>
        later(scene, 900 + i * Math.min(160, 1300 / Math.max(1, blocks.length)), () => {
          if (!b.t.active) return;
          const side = i % 2 ? -1 : 1;
          const [ox, oy] = [b.x + side * 14, b.y - 8];
          const w = scene.add.graphics().setDepth(9.5);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 300,
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              w.clear();
              kamuiSwirl(w, ox, oy, 9 * Math.sin(k * Math.PI), k * 14);
            },
            onComplete: () => w.destroy(),
          });
          const fig = scene.add
            .image(ox, oy, p.texture.key)
            .setFlipX(side > 0)
            .setDepth(9.6)
            .setAlpha(0);
          scene.tweens.add({ targets: fig, alpha: 1, duration: 80, yoyo: true, hold: 140, onComplete: () => fig.destroy() });
          b.cuff = true;
          sparks(scene, b.x, b.y - 6, [0x000000, KAMUI.pale, KAMUI.mask], 6, 10);
          cam.shake(60, 0.004);
          world.strike(b.t, 0.8 * power, 'ult', false, undefined, 0);
        }),
      );
      // A boss gets a block out of a warp above it instead.
      for (const t of bosses)
        later(scene, 1600, () => {
          if (!t.active) return;
          const [bx, by] = [t.x, Math.max(14, t.y - t.displayHeight / 2 - 40)];
          const g = scene.add.graphics().setDepth(9);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 500,
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              g.clear();
              kamuiSwirl(g, bx, by, 16 * Math.min(1, k * 3), k * 12, 1 - k);
              const fall = Math.max(0, (k - 0.3) / 0.7);
              block(g, bx, by + fall * fall * (t.y - by - 10), 30, 24, 2);
            },
            onComplete: () => {
              g.destroy();
              if (t.active) world.strike(t, 3 * power, 'ult', true, undefined, 0);
              cam.shake(200, 0.015);
            },
          });
        });
      // Climax: every chain hauled at once, the blocks slam together into one.
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        delay: 2500,
        duration: 260,
        ease: 'Quad.In',
        onUpdate: (tw) => (pull = tw.getValue() ?? 0),
      });
      later(scene, 2780, () => {
        const n = blocks.filter((b) => b.t.active).length;
        cam.flash(150, 255, 255, 255);
        cam.shake(450, 0.025);
        floatText(scene, W / 2, 34, 'HIMPIT!', '#e0601a');
        sparks(scene, W / 2, 90, [KAMUI.pale, KAMUI.mid, 0x000000, KAMUI.mask], 24, 40);
        for (const b of blocks) {
          if (!b.t.active) continue;
          // Its (hidden) body goes where its picture is crushed, so the blow shows there.
          (b.t.body as Phaser.Physics.Arcade.Body).reset(W / 2, b.y - b.t.displayHeight / 2);
          world.strike(b.t, (1.5 + 0.35 * (n - 1)) * power, 'ult', true, undefined, 0);
        }
      });
      // The void folds shut into one warp and spits them back into the arena, in one heap at its middle.
      later(scene, 3150, () => {
        scene.events.off('update', drawStage);
        parts.forEach((o) => o.destroy());
        const fold = scene.add.graphics().setDepth(16);
        scene.tweens.addCounter({
          from: 1,
          to: 0,
          duration: 300,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            fold.clear();
            kamuiSwirl(fold, W / 2, FLOOR_Y - 30, 10 + k * 180, (1 - k) * 12, 0.4 + 0.6 * k);
          },
          onComplete: () => fold.destroy(),
        });
        blocks.forEach((b, i) => {
          const t = b.t;
          if (!t.active) return;
          const body = t.body as Phaser.Physics.Arcade.Body;
          body.enable = true;
          body.reset(W / 2 + (i - (blocks.length - 1) / 2) * 6, FLOOR_Y - 40 - i * 6);
          t.setVisible(true);
          t.untargetable = false;
          t.stunUntil = scene.time.now + 700;
          later(scene, 300, () => t.active && world.strike(t, 0.5 * power, 'ult', false, undefined, 0));
        });
      });
    },
  },
  batangCakra: {
    // Hujan Batang: as he lands, four chakra receivers drop out of the sky into the floor around him, one after another
    // (two each side, further out each time); each stakes the ground with a ring of force and pins whoever stands
    // there (slowed).
    onDiveLand: ({ world, scene, power }, x, gy) => {
      [-14, 14, -30, 30].forEach((d, i) =>
        later(scene, i * 70, () => {
          const rx = Phaser.Math.Clamp(x + d, 4, W - 4);
          const g = scene.add.graphics().setDepth(11);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 120,
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              g.clear();
              const tip = gy - 40 + 42 * k;
              receiverRod(g, rx + d * 0.1, tip - 16, rx, tip);
            },
            onComplete: () => {
              ring(scene, rx, gy - 1, RIKUDO.lilac, 2, 12, 220, 1);
              sparks(scene, rx, gy - 1, [0x5f574f, RIKUDO.lilac], 4, 8);
              world.area(rx, gy - 8, 11, 0.45 * power, 40, 'proc', { slow: 700 });
              scene.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 250, onComplete: () => g.destroy() });
            },
          });
        }),
      );
    },
    // BATANG PENERIMA: every receiver Pain lands stays in the enemy (plantRod, up to 3): the opening stab and the air
    // swipe plant one, every thrown rod that hits plants one. They are what Bansho Ten'in takes hold of. The Shinra palm
    // (the finisher) sets the receivers already in an enemy ringing: each one a jolt of chakra through it.
    onHit: ({ p, world, scene, power }, t) => {
      const step = p.comboStep;
      if (step <= 0) plantRod(world, scene, t);
      const n = rodsIn(t);
      if (step !== 3 || !n) return;
      for (let i = 0; i < n; i++)
        later(scene, 60 + i * 70, () => {
          if (!t.active) return;
          ring(scene, t.x, t.y - 2, RIKUDO.lilac, 2, 9, 160, 1);
          sparks(scene, t.x, t.y - 2, [RIKUDO.pale, RIKUDO.lilac], 3, 7);
          world.strike(t, 0.3 * power, 'proc', false, undefined, 0);
        });
    },
    onShotHit: ({ world, scene }, _m, _x, _y, t) => plantRod(world, scene, t),
    // The combo pulls and pushes like the Deva Path itself. Step 1 is a little Bansho Ten'in: his open palm drags the
    // air (and what stands in it) in toward him, chevrons of force racing to his hand, dust skidding along the floor.
    // Step 3 is a little Shinra Tensei: the palm thrust out, a half-dome of repulsion bending the air ahead of it.
    onSwing: ({ p, scene }, m, step) => {
      const f = p.facing;
      const [hx, hy] = [p.x + f * 7, p.y - 1];
      if (step === 1) {
        const g = scene.add.graphics().setDepth(12);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: m.ms + 60,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            g.clear();
            for (let i = 0; i < 4; i++) {
              const ly = hy + (i - 1.5) * 6;
              const d = 44 * (1 - ((k * 2 + i / 4) % 1));
              const x = hx + f * d;
              g.fillStyle(0x000000, 0.6).fillTriangle(x + f * 3, ly - 3, x + f * 3, ly + 3, x - f * 1, ly);
              g.fillStyle(i % 2 ? RIKUDO.lilac : RIKUDO.pale).fillTriangle(x + f * 2, ly - 2, x + f * 2, ly + 2, x - f * 0.5, ly);
            }
            rinnegan(g, hx, hy, 1.5 + k, 1 - k * 0.5);
          },
          onComplete: () => g.destroy(),
        });
        for (let i = 0; i < 5; i++) {
          const d = scene.add.rectangle(hx + f * Phaser.Math.Between(18, 44), FLOOR_Y - 1, 2, 1, 0x5f574f).setDepth(12);
          scene.tweens.add({ targets: d, x: hx + f * 4, alpha: 0, duration: m.ms + 40, ease: 'Quad.In', onComplete: () => d.destroy() });
        }
      }
      if (step === 3)
        later(scene, m.ms * 0.4, () => {
          const g = scene.add.graphics().setDepth(12);
          const [a0, a1] = f > 0 ? [-1.2, 1.2] : [Math.PI - 1.2, Math.PI + 1.2];
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 260,
            ease: 'Quad.Out',
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              g.clear();
              const r = 6 + k * 30;
              g.fillStyle(RIKUDO.pale, 0.15 * (1 - k))
                .beginPath()
                .moveTo(hx, hy)
                .arc(hx, hy, r, a0, a1)
                .closePath()
                .fillPath();
              for (const [w, c, al, rr] of [
                [3, RIKUDO.lilac, 0.5, r],
                [1, 0xfff1e8, 0.9, r],
                [1, RIKUDO.lilac, 0.6, r * 0.65],
              ] as const)
                g.lineStyle(w, c, al * (1 - k))
                  .beginPath()
                  .arc(hx, hy, rr, a0, a1)
                  .strokePath();
            },
            onComplete: () => g.destroy(),
          });
          for (let i = 0; i < 6; i++) {
            const d = scene.add.rectangle(hx, FLOOR_Y - 1, 2, 2, i % 2 ? 0xab5236 : 0x5f574f).setDepth(12);
            scene.tweens.add({
              targets: d,
              x: hx + f * Phaser.Math.Between(20, 44),
              y: FLOOR_Y - Phaser.Math.Between(2, 12),
              alpha: 0,
              duration: 320,
              ease: 'Quad.Out',
              onComplete: () => d.destroy(),
            });
          }
        });
    },
    // Bansho Ten'in: Pain lifts an open hand and the Deva Path's pull takes hold of every chakra receiver he has driven
    // into an enemy (with none planted, of the farthest enemy, flyers too). A line of force locks onto each one, lilac
    // chevrons racing in toward his palm, and they are all torn across the arena at once and pile up in front of him,
    // crashing into each other: each is run through on a receiver as it arrives (the more rods it carried, the deeper;
    // the rods are spent). Then, with the whole pile hanging at arm's length, a point-blank Shinra Tensei blasts it all
    // back out across the arena, and whatever is hurled into a wall slams into it (BENTUR). A boss cannot be moved: its
    // receivers are driven through it from afar instead.
    skill: ({ p, world, scene, power }) => {
      const all = world.targets(p.x, p.y);
      if (!all.length) return false;
      const marked = all.filter((t) => rodsIn(t) > 0);
      const prey = (marked.length ? marked : [all[all.length - 1]]).slice(0, 8);
      const far = prey[prey.length - 1];
      p.facing = far.x >= p.x ? 1 : -1;
      const f = p.facing;
      p.lock(950);
      p.invuln(950);
      p.setData('shinraHeld', scene.time.now + 950);
      p.setVelocityX(0);
      const cam = scene.cameras.main;
      const hand = (): [number, number] => [p.x + f * 6, p.y - 2];
      const g = scene.add.graphics().setDepth(12);
      const done = new Set<Phaser.GameObjects.Sprite>();
      const held: Phaser.GameObjects.Sprite[] = [];
      const impale = (t: Phaser.GameObjects.Sprite) => {
        if (done.has(t)) return;
        done.add(t);
        if (!t.active) return;
        const n = Math.max(1, rodsIn(t));
        t.setData('rods', 0);
        cam.shake(90, 0.008);
        ring(scene, t.x, t.y, RIKUDO.lilac, 3, 14, 200, 2);
        sparks(scene, t.x, t.y, [0x000000, RIKUDO.lilac, 0xfff1e8], 8, 12);
        if (held.length) cutMark(scene, t.x, t.y, 0xfff1e8, 10, Math.random() * Math.PI);
        world.strike(t, (0.9 + 0.5 * n) * power, 'skill', n >= 3, undefined, 0);
        if (t.active && !('tier' in t)) held.push(t);
      };
      // A boss: a receiver thrown into it from his hand.
      for (const t of prey.filter((t) => 'tier' in t)) {
        const [x0, y0] = hand();
        const rg = scene.add.graphics().setDepth(12);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 220,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            rg.clear();
            const [rx, ry] = [x0 + (t.x - x0) * k, y0 + (t.y - y0) * k];
            receiverRod(rg, rx - f * 14, ry, rx, ry);
          },
          onComplete: () => (rg.destroy(), impale(t)),
        });
      }
      const pullers = prey.filter((t) => !('tier' in t));
      const pull = () => {
        g.clear();
        const [hx, hy] = hand();
        const now = scene.time.now;
        for (const t of pullers) {
          if (!t.active) continue;
          const body = t.body as Phaser.Physics.Arcade.Body;
          (t as Phaser.GameObjects.Sprite & { stunUntil: number }).stunUntil = now + 300;
          if (done.has(t)) {
            // Run through and held there on the receiver.
            body.setVelocity(0, 0);
            receiverRod(g, hx, hy, t.x + f * 4, t.y);
            continue;
          }
          // The line of force, its chevrons racing in toward his palm.
          g.lineStyle(1, RIKUDO.lilac, 0.5).lineBetween(hx, hy, t.x, t.y);
          for (let i = 0; i < 4; i++) {
            const k = 1 - ((now / 260 + i / 4) % 1);
            g.fillStyle(0xfff1e8).fillRect(hx + (t.x - hx) * k - 1, hy + (t.y - hy) * k - 1, 2, 2);
          }
          const [tx, ty] = [hx + f * (10 + held.length * 3), hy];
          const d = Phaser.Math.Distance.Between(t.x, t.y, tx, ty);
          if (d < 9) {
            body.setVelocity(0, 0);
            impale(t);
            continue;
          }
          const a = Math.atan2(ty - t.y, tx - t.x);
          const v = Math.min(480, d * 12);
          body.setVelocity(Math.cos(a) * v, Math.sin(a) * v);
        }
        rinnegan(g, hx, hy, 2 + Math.sin(now / 60));
      };
      scene.events.on('update', pull);
      // Whatever has not arrived by now is run through where it is.
      later(scene, 650, () => pullers.forEach(impale));
      // The pile, blasted back out.
      later(scene, 820, () => {
        scene.events.off('update', pull);
        g.destroy();
        const [hx, hy] = hand();
        cam.flash(90, 180, 160, 230);
        shinraTensei(world, scene, hx + f * 6, hy, 56, 1.1 * power, 1.6 * power, 'skill');
      });
    },
    // Enam Jalan Pain (the Six Paths of Pain): the other five bodies drop out of the sky around the arena, each its own
    // path and its own technique at once. ASURA (far left): his forearms open into launchers and six missiles streak
    // out at the enemies, flyers first. HEWAN (Animal, far right): a giant three-headed dog with the Rinnegan bursts
    // out of a summoning cloud and lunges onto two enemies on the floor, biting. MANUSIA (Human): he appears beside the
    // nearest enemy, grips its head and pulls its soul out of it (one under 30% HP loses it for good). PRETA stands at
    // Pain's side with an open palm and drinks every enemy shot in flight, its chakra healing him. NARAKA: the King of
    // Hell rises out of the floor behind him, purple flames for hair, and its tongue restores him (HP back, the
    // skill's cooldown reset). Then the five step back into the dark.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      const f = p.facing;
      const END = 3000;
      p.lock(500);
      p.invuln(600);
      p.setVelocityX(0);
      const key = p.texture.key;
      // A path: Pain's own body dropping in where it stands, the Rinnegan flaring as it lands, named in passing.
      const path = (x: number, name: string, delay: number, flip: boolean) => {
        const y = FLOOR_Y - 7;
        const b = scene.add.image(x, -12, key).setFlipX(flip).setDepth(9.5);
        scene.tweens.add({
          targets: b,
          y,
          delay,
          duration: 220,
          ease: 'Quad.In',
          onComplete: () => {
            ring(scene, x, FLOOR_Y, RIKUDO.lilac, 3, 14, 220, 1);
            sparks(scene, x, FLOOR_Y - 1, [0x5f574f, 0xab5236], 6, 10);
            floatText(scene, x, y - 16, name, '#b39ddb');
          },
        });
        scene.tweens.add({ targets: b, alpha: 0, delay: END, duration: 300, onComplete: () => b.destroy() });
        return b;
      };
      const ground = foes.filter((t) => !('tier' in t) && !(t as { flying?: boolean }).flying);
      // ASURA: six missiles from the far edge behind Pain.
      const ax = f > 0 ? 20 : W - 20;
      path(ax, 'ASURA', 0, f < 0);
      const fx = scene.add.graphics().setDepth(13);
      {
        const order = [...foes].sort((a, b) => a.y - b.y);
        for (let i = 0; i < 6; i++)
          later(scene, 450 + i * 120, () => {
            const t = order[i % order.length];
            if (!t.active) return;
            const [sx, sy] = [ax, FLOOR_Y - 12];
            const [cx, cy] = [(sx + t.x) / 2 + Phaser.Math.Between(-20, 20), Math.min(sy, t.y) - 40];
            const [tx, ty] = [t.x, t.y];
            let n = 0;
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              duration: 340,
              onUpdate: (tw) => {
                const k = tw.getValue() ?? 0;
                const [x, y] = bez(sx, sy, cx, cy, tx, ty, k);
                const [x2, y2] = bez(sx, sy, cx, cy, tx, ty, Math.min(1, k + 0.05));
                const a = Math.atan2(y2 - y, x2 - x);
                if (n++ % 2 === 0) {
                  const puff = scene.add.circle(x, y, 1.5, 0xc2c3c7, 0.7).setDepth(12);
                  scene.tweens.add({ targets: puff, scale: 2.5, alpha: 0, duration: 380, onComplete: () => puff.destroy() });
                }
                const m = scene.add.rectangle(x, y, 5, 2, 0x5f574f).setRotation(a).setStrokeStyle(1, 0x000000).setDepth(13);
                const fl = scene.add.rectangle(x - Math.cos(a) * 4, y - Math.sin(a) * 4, 2, 2, 0xffa300).setDepth(13);
                scene.time.delayedCall(17, () => (m.destroy(), fl.destroy()));
              },
              onComplete: () => {
                ring(scene, tx, ty, 0xffa300, 2, 14, 220, 2);
                sparks(scene, tx, ty, [0xffec27, 0xffa300, 0x5f574f], 10, 14);
                cam.shake(70, 0.006);
                if (t.active) world.strike(t, 0.9 * power, 'skill', false, undefined, 120);
                world.area(tx, ty, 12, 0.4 * power, 60, 'skill');
              },
            });
          });
      }
      // HEWAN: the three-headed dog, from a summoning cloud at the far edge ahead.
      const dx = f > 0 ? W - 22 : 22;
      path(dx, 'HEWAN', 120, f > 0);
      later(scene, 450, () => {
        for (let i = 0; i < 10; i++) {
          const c = scene.add
            .circle(dx - f * 14 + Phaser.Math.Between(-8, 8), FLOOR_Y - 8 + Phaser.Math.Between(-6, 6), 5, 0xfff1e8, 0.8)
            .setDepth(12);
          scene.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 500, onComplete: () => c.destroy() });
        }
        const dog = scene.add.graphics();
        const dogC = scene.add
          .container(dx - f * 14, FLOOR_Y - 9, [dog])
          .setDepth(9.6)
          .setScale(-f, 1);
        // Drawn facing +x: shaggy grey body, three heads on long necks, Rinnegan eyes, bared teeth, receivers in its back.
        for (const [grow, col] of [
          [1, 0x000000],
          [0, 0x5f574f],
        ] as const) {
          dog.fillStyle(col).fillEllipse(-4, 0, 26 + grow * 2, 12 + grow * 2);
          for (const lx of [-12, -6, 4, 9]) dog.fillRect(lx - grow, 3, 3 + grow * 2, 7 + grow);
          for (const [hx, hy] of [
            [10, -9],
            [14, -3],
            [8, 3],
          ]) {
            dog.fillEllipse(hx, hy, 9 + grow * 2, 7 + grow * 2);
            dog.fillTriangle(hx + 2, hy - 2 - grow, hx + 9 + grow, hy, hx + 2, hy + 2 + grow);
          }
        }
        dog.fillStyle(0x83769c).fillEllipse(-6, -3, 18, 4);
        for (const [hx, hy] of [
          [10, -9],
          [14, -3],
          [8, 3],
        ]) {
          rinnegan(dog, hx + 1, hy - 1, 1.5);
          dog.fillStyle(0xfff1e8).fillTriangle(hx + 4, hy + 1, hx + 5, hy + 3, hx + 6, hy + 1);
        }
        dog.lineStyle(1, 0x000000).lineBetween(-8, -6, -10, -11).lineBetween(-2, -6, -2, -12);
        dogC.setScale(0);
        scene.tweens.add({ targets: dogC, scaleX: -f, scaleY: 1, duration: 200, ease: 'Back.Out' });
        // Two lunges, each onto an enemy on the floor (or the nearest one if none stand there).
        [0, 1].forEach((j) =>
          later(scene, 350 + j * 700, () => {
            const prey =
              (ground.length ? ground : foes).filter((t) => t.active)[j] ?? (ground.length ? ground : foes).find((t) => t.active);
            if (!prey) return;
            const back = dogC.x;
            dogC.setScale(prey.x >= dogC.x ? 1 : -1, 1);
            scene.tweens.add({
              targets: dogC,
              x: prey.x - Math.sign(prey.x - dogC.x) * 10,
              y: Math.min(FLOOR_Y - 9, prey.y),
              duration: 220,
              ease: 'Quad.In',
              onComplete: () => {
                if (prey.active) {
                  for (const o of [-3, 3]) cutMark(scene, prey.x + o, prey.y, 0xfff1e8, 9, 1.2);
                  world.strike(prey, 1.6 * power, 'skill', false, { slow: 800 }, 150);
                  cam.shake(90, 0.008);
                }
                scene.tweens.add({ targets: dogC, x: back, y: FLOOR_Y - 9, delay: 150, duration: 260 });
              },
            });
          }),
        );
        later(scene, END - 450, () =>
          scene.tweens.add({ targets: dogC, scale: 0, alpha: 0, duration: 250, onComplete: () => dogC.destroy() }),
        );
      });
      // MANUSIA: beside the nearest enemy that has a soul to take (not a boss), the soul pulled out of it.
      const victim = foes.find((t) => !('tier' in t));
      if (victim) {
        const side = victim.x >= p.x ? 1 : -1;
        const hx = Phaser.Math.Clamp(victim.x + side * 12, 8, W - 8);
        const human = path(hx, 'MANUSIA', 240, side > 0);
        later(scene, 800, () => {
          if (!victim.active) return;
          human.setPosition(Phaser.Math.Clamp(victim.x + side * 12, 8, W - 8), victim.y);
          const e = victim as Phaser.GameObjects.Sprite & { stunUntil: number; hp: number; maxHp: number };
          const soul = scene.add
            .image(victim.x, victim.y, victim.texture.key, victim.frame.name)
            .setFlipX(victim.flipX)
            .setTint(0xe8e0ff)
            .setTintMode(Phaser.TintModes.FILL)
            .setAlpha(0.75)
            .setDepth(12);
          const tether = scene.add.graphics().setDepth(12);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 900,
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              tether.clear();
              if (!victim.active) return;
              e.stunUntil = scene.time.now + 50;
              (victim.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
              soul.setPosition(victim.x + side * 6 * k, victim.y - 12 * k).setScale(1 + 0.2 * k, 1 + 0.5 * k);
              for (let i = -1; i <= 1; i++)
                tether
                  .lineStyle(1, 0xe8e0ff, 0.6)
                  .lineBetween(victim.x + i * 2, victim.y, soul.x + i * 2 + Math.sin(k * 20 + i) * 1.5, soul.y + 4);
            },
            onComplete: () => {
              tether.destroy();
              const torn = victim.active && e.hp / e.maxHp < 0.3;
              scene.tweens.add({
                targets: soul,
                y: soul.y - (torn ? 30 : 0),
                x: torn ? soul.x : victim.x,
                alpha: 0,
                duration: torn ? 500 : 160,
                onComplete: () => soul.destroy(),
              });
              if (!victim.active) return;
              sparks(scene, victim.x, victim.y, [0xe8e0ff, RIKUDO.lilac], 8, 12);
              world.strike(victim, (torn ? 99 : 2.5) * power, 'skill', torn, undefined, 0);
            },
          });
        });
      }
      // PRETA: at Pain's side, drinking every shot in flight while the paths stand.
      const px = Phaser.Math.Clamp(p.x - f * 14, 8, W - 8);
      path(px, 'PRETA', 360, f < 0);
      let drunk = 0;
      const shield = () => {
        fx.clear();
        const [cx, cy] = [px + f * 6, FLOOR_Y - 9];
        rinnegan(fx, cx, cy, 2.5 + Math.sin(scene.time.now / 90) * 0.5, 0.9);
        fx.lineStyle(1, RIKUDO.lilac, 0.4).strokeCircle(cx, cy, 26);
        for (const h of world.hostiles()) {
          if (!h.active || Phaser.Math.Distance.Between(h.x, h.y, p.x, p.y) > 90) continue;
          const [hx, hy] = [h.x, h.y];
          h.destroy();
          drunk++;
          const w = scene.add.rectangle(hx, hy, 2, 2, RIKUDO.lilac).setDepth(13);
          scene.tweens.add({ targets: w, x: cx, y: cy, duration: 200, onComplete: () => w.destroy() });
          p.heal(2);
        }
      };
      later(scene, 600, () => scene.events.on('update', shield));
      later(scene, END, () => {
        scene.events.off('update', shield);
        fx.destroy();
        if (drunk) floatText(scene, px, FLOOR_Y - 26, `+${drunk * 2}`, '#00e436');
      });
      // NARAKA: the King of Hell rising out of the floor behind Pain to restore him.
      const kx = Phaser.Math.Clamp(p.x - f * 34, 22, W - 22);
      path(Phaser.Math.Clamp(kx - f * 16, 8, W - 8), 'NARAKA', 480, f < 0);
      later(scene, 1000, () => {
        const g = scene.add.graphics();
        // Drawn upward from the floor: a broad dark-violet face, a crown of purple flames, burning eyes, a fanged
        // mouth that opens as it restores him.
        const head = scene.add
          .container(kx, FLOOR_Y + 1, [g])
          .setDepth(4.6)
          .setScale(1, 0);
        const draw = (open: number) => {
          g.clear();
          const now = scene.time.now;
          for (let i = 0; i < 7; i++) {
            const fxx = -18 + i * 6;
            const h = 12 + Math.abs(Math.sin(now / 90 + i)) * 8;
            g.fillStyle(0x000000).fillTriangle(fxx - 4, -40, fxx + 4, -40, fxx, -40 - h - 2);
            g.fillStyle(0x8a3fd1).fillTriangle(fxx - 3, -40, fxx + 3, -40, fxx, -40 - h);
            g.fillStyle(0xe8e0ff).fillTriangle(fxx - 1, -40, fxx + 1, -40, fxx, -40 - h * 0.5);
          }
          g.fillStyle(0x000000).fillRoundedRect(-22, -44, 44, 44, 8);
          g.fillStyle(0x3a2a5a).fillRoundedRect(-20, -42, 40, 42, 7);
          g.fillStyle(0x5a4580).fillRoundedRect(-20, -42, 14, 42, 7);
          g.fillStyle(0x000000).fillRect(-14, -32, 10, 5).fillRect(4, -32, 10, 5);
          g.fillStyle(0xffec27).fillRect(-12, -31, 6, 3).fillRect(6, -31, 6, 3);
          g.fillStyle(0x000000).fillRect(-14, -18, 28, 6 + open * 10);
          g.fillStyle(0x7e2553).fillRect(-11, -16, 22, 3 + open * 8);
          g.fillStyle(0xfff1e8);
          for (let i = 0; i < 5; i++) {
            g.fillTriangle(-12 + i * 6, -18, -8 + i * 6, -18, -10 + i * 6, -14);
            g.fillTriangle(-12 + i * 6, -12 + open * 10, -8 + i * 6, -12 + open * 10, -10 + i * 6, -16 + open * 10);
          }
        };
        let open = 0;
        const tick = () => draw(open);
        scene.events.on('update', tick);
        scene.tweens.add({ targets: head, scaleY: 1, duration: 400, ease: 'Back.Out' });
        scene.tweens.addCounter({ from: 0, to: 1, delay: 500, duration: 250, onUpdate: (tw) => (open = tw.getValue() ?? 0) });
        later(scene, 800, () => {
          // The restoring light: green motes rising from the open mouth onto him.
          for (let i = 0; i < 12; i++) {
            const m = scene.add.rectangle(kx + Phaser.Math.Between(-6, 6), FLOOR_Y - 12, 2, 2, 0x00e436).setDepth(13);
            scene.tweens.add({ targets: m, x: p.x, y: p.y, delay: i * 30, duration: 300, onComplete: () => m.destroy() });
          }
          later(scene, 400, () => {
            const amt = Math.ceil(p.stats.maxHp * 0.15);
            p.heal(amt);
            p.resetSkill();
            floatText(scene, p.x, p.y - 18, `+${amt}`, '#00e436');
            ring(scene, p.x, p.y, 0x00e436, 4, 18, 260, 1);
          });
        });
        later(scene, END - 1000, () => {
          scene.events.off('update', tick);
          scene.tweens.add({ targets: head, scaleY: 0, alpha: 0, duration: 300, onComplete: () => head.destroy() });
        });
      });
    },
    // Chibaku Tensei (Planetary Devastation): Pain raises one hand and the sky goes dark; a small black sphere, the
    // gravity core, leaves his palm and climbs to the middle of the sky above the arena, the Rinnegan flaring in his
    // eye. Then it pulls. The floor tears away in chunks that spiral up into it, packing into a growing ball of earth,
    // and every enemy is dragged up off the ground (flyers too) and slammed onto its surface, pinned there, crushed
    // a little more as more rock lands on them. A boss is too heavy to lift: boulders are torn out from under it and
    // hurled into it. When the ball has swallowed them, it presses shut into a moon, seams of lilac chakra cracking
    // across it from the core; "RASAKAN SAKIT!": the whole moon is crushed inward (the finishing blow on everyone),
    // and it bursts, a rain of broken earth falling back onto the arena and the survivors dropped with it.
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const cam = scene.cameras.main;
      p.invuln(4300);
      p.lock(3900);
      p.setData('shinraHeld', scene.time.now + 4000);
      p.setVelocityX(0);
      const [cx, cy] = [W / 2, 72];
      const R = 30;
      // Build-up: the dark sky, the Rinnegan flaring at his raised hand, the core rising out of it.
      const sky = scene.add.rectangle(0, 0, W, FLOOR_Y, 0x0c0814, 0).setOrigin(0).setDepth(3);
      scene.tweens.add({ targets: sky, fillAlpha: 0.75, duration: 450 });
      const fx = scene.add.graphics().setDepth(13);
      // Behind the enemies pinned on its surface until it seals over them.
      const moon = scene.add.graphics().setDepth(4.8);
      const tear = scene.add.graphics().setDepth(4);
      let [kx, ky] = [p.x, p.y - 12];
      let r = 0;
      let rot = 0;
      let glow = 0;
      let phase: 'rise' | 'pull' | 'seal' | 'gone' = 'rise';
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 650,
        ease: 'Sine.InOut',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          [kx, ky] = [p.x + (cx - p.x) * k, p.y - 12 + (cy - (p.y - 12)) * k];
        },
        onComplete: () => {
          phase = 'pull';
          r = 6;
          cam.flash(120, 90, 60, 140);
          cam.shake(1900, 0.004);
        },
      });
      // Enemies lifted onto the ball: each takes the slot on its surface where it first touches it.
      type Stuck = { t: Phaser.GameObjects.Sprite; a: number };
      const stuck: Stuck[] = [];
      const lifted = foes.filter((t) => !('tier' in t));
      const bosses = foes.filter((t) => 'tier' in t);
      const draw = () => {
        fx.clear();
        moon.clear();
        const now = scene.time.now;
        if (phase === 'gone') return;
        rot += 0.01;
        // The core: black, a lilac halo round it, pulling dust in along spiralling lines.
        const pulse = 1 + Math.sin(now / 70) * 0.15;
        fx.fillStyle(RIKUDO.lilac, 0.18).fillCircle(kx, ky, (r + 10) * pulse);
        for (let i = 0; i < 6; i++) {
          const a = now / 300 + (i / 6) * Math.PI * 2;
          const d = r + 14 + ((now / 8 + i * 9) % 30);
          fx.fillStyle(i % 2 ? RIKUDO.pale : RIKUDO.lilac).fillRect(kx + Math.cos(a) * d - 0.5, ky + Math.sin(a) * d - 0.5, 1, 1);
        }
        if (r > 1) chibakuMoon(moon, kx, ky, r, rot, glow);
        fx.fillStyle(0x000000).fillCircle(kx, ky, Math.max(3, 5 - r * 0.2));
        if (r < 3) fx.lineStyle(1, RIKUDO.pale).strokeCircle(kx, ky, 5);
        rinnegan(fx, p.x + p.facing * 2, p.y - 6, phase === 'rise' ? 2 : 1, 0.8);
        if (phase !== 'pull' && phase !== 'seal') return;
        // Enemies: dragged up to the ball, then pinned on its surface, turning with it.
        for (const t of lifted) {
          if (!t.active) continue;
          const body = t.body as Phaser.Physics.Arcade.Body;
          (t as Phaser.GameObjects.Sprite & { stunUntil: number }).stunUntil = now + 400;
          const s = stuck.find((q) => q.t === t);
          if (s) {
            body.reset(kx + Math.cos(s.a + rot) * (r + 2), ky + Math.sin(s.a + rot) * (r + 2));
            continue;
          }
          const d = Phaser.Math.Distance.Between(t.x, t.y, kx, ky);
          if (d < r + 6) {
            // Spread round the ball, each to its own place on the surface.
            stuck.push({ t, a: (lifted.indexOf(t) / lifted.length) * Math.PI * 2 + 0.4 });
            body.setVelocity(0, 0);
            sparks(scene, t.x, t.y, [0x5f574f, 0xab5236, RIKUDO.lilac], 8, 12);
            cam.shake(80, 0.008);
            world.strike(t, 0.8 * power, 'ult', false, undefined, 0);
            continue;
          }
          // Pulled up along a spiral, faster the closer it gets.
          const a = Math.atan2(ky - t.y, kx - t.x) + 0.5;
          const v = Math.min(420, 90 + 9000 / Math.max(20, d));
          body.setVelocity(Math.cos(a) * v, Math.sin(a) * v);
          fx.lineStyle(1, RIKUDO.lilac, 0.35).lineBetween(t.x, t.y, kx, ky);
        }
      };
      scene.events.on('update', draw);
      // The floor tearing away: chunks spiral up into the core, packing the ball (it grows with each one).
      for (let i = 0; i < 34; i++)
        later(scene, 650 + i * 50, () => {
          const x0 = Phaser.Math.Between(8, W - 8);
          const s = Phaser.Math.Between(3, 7);
          tear.fillStyle(0x000000).fillRect(x0 - s / 2, FLOOR_Y, s, 3);
          tear.fillStyle(0x1d1622).fillRect(x0 - s / 2 + 1, FLOOR_Y, s - 2, 2);
          const chunk = scene.add
            .rectangle(x0, FLOOR_Y, s, s - 1, i % 3 ? 0x5f574f : 0xab5236)
            .setStrokeStyle(1, 0x000000)
            .setDepth(12.5);
          const side = Math.random() < 0.5 ? -1 : 1;
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 520,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              const [x, y] = bez(x0, FLOOR_Y, x0 + side * 40, (FLOOR_Y + ky) / 2, kx, ky + r, k);
              chunk.setPosition(x, y).setAngle(k * 360 * side);
            },
            onComplete: () => {
              chunk.destroy();
              r = Math.min(R, r + (R - 6) / 24);
            },
          });
        });
      // A boss: boulders ripped from under it, hurled into it one after another.
      for (const b of bosses)
        for (let j = 0; j < 4; j++)
          later(scene, 800 + j * 380, () => {
            if (!b.active) return;
            hurlRock(scene, Phaser.Math.Clamp(b.x + (j % 2 ? 30 : -30), 8, W - 8), b, () => {
              cam.shake(80, 0.008);
              world.strike(b, 0.6 * power, 'ult', false, undefined, 0);
            });
          });
      // The crush: those on the ball take more as the rock piles onto them.
      for (let j = 0; j < 5; j++)
        later(scene, 1200 + j * 300, () => {
          for (const s of stuck) if (s.t.active) world.strike(s.t, 0.3 * power, 'ult', false, undefined, 0);
        });
      // Seal: the ball presses shut into a moon, chakra cracking across it.
      later(scene, 2500, () => {
        phase = 'seal';
        r = R;
        moon.setDepth(13);
        scene.tweens.addCounter({ from: 0, to: 1, duration: 600, onUpdate: (tw) => (glow = tw.getValue() ?? 0) });
        for (let i = 0; i < 3; i++) later(scene, i * 180, () => ring(scene, kx, ky, RIKUDO.lilac, R + 16, R, 200, 2));
      });
      // Climax: crushed inward, then it bursts and the earth rains back down.
      later(scene, 3150, () => {
        scene.tweens.addCounter({ from: R, to: R * 0.8, duration: 130, ease: 'Quad.In', onUpdate: (tw) => (r = tw.getValue() ?? r) });
      });
      later(scene, 3300, () => {
        phase = 'gone';
        cam.flash(160, 230, 220, 255);
        cam.shake(500, 0.028);
        floatText(scene, W / 2, 20, 'RASAKAN SAKIT!', '#b39ddb');
        ring(scene, kx, ky, 0xfff1e8, 10, 90, 420, 3);
        ring(scene, kx, ky, RIKUDO.lilac, 6, 70, 380, 2);
        for (const t of world.targets(kx, ky)) {
          world.strike(t, 2.4 * power, 'ult', true, undefined, 0);
          if (t.active && !('tier' in t)) (t as Phaser.GameObjects.Sprite & { stunUntil: number }).stunUntil = scene.time.now + 700;
        }
        // The shell breaks: shards of earth flung out, then falling back onto the floor where they land.
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2;
          const s = Phaser.Math.Between(3, 8);
          const shard = scene.add
            .rectangle(kx + Math.cos(a) * R * 0.6, ky + Math.sin(a) * R * 0.6, s, s - 1, i % 3 ? 0x5f574f : 0x7d6f62)
            .setStrokeStyle(1, 0x000000)
            .setDepth(12.5);
          const lx = Phaser.Math.Clamp(kx + Math.cos(a) * Phaser.Math.Between(40, 150), 6, W - 6);
          const [ox, oy] = [kx + Math.cos(a) * Phaser.Math.Between(30, 50), ky + Math.sin(a) * Phaser.Math.Between(20, 40)];
          scene.tweens.add({
            targets: shard,
            x: ox,
            y: oy,
            angle: Phaser.Math.Between(-200, 200),
            duration: 240,
            ease: 'Quad.Out',
            onComplete: () =>
              scene.tweens.add({
                targets: shard,
                x: lx,
                y: FLOOR_Y - 2,
                angle: Phaser.Math.Between(-400, 400),
                duration: 420 + i * 8,
                ease: 'Quad.In',
                onComplete: () => {
                  shard.destroy();
                  if (i % 3) return;
                  rocks(scene, lx, FLOOR_Y - 1, 3);
                  world.area(lx, FLOOR_Y - 8, 12, 0.3 * power, 60, 'ult');
                },
              }),
          });
        }
        later(scene, 700, () => {
          scene.events.off('update', draw);
          fx.destroy();
          moon.destroy();
          scene.tweens.add({ targets: [sky, tear], alpha: 0, duration: 500, onComplete: () => (sky.destroy(), tear.destroy()) });
        });
      });
    },
  },
  vortigern: {
    // Jatuh ke Jurang: where he lands the floor gives way into a small pit of the abyss, and black insect legs reach
    // out of it on both sides, hook whatever stands near and drag it to the edge before the pit closes.
    onDiveLand: ({ world, scene, power }, x, gy) => {
      const g = scene.add.graphics().setDepth(11);
      const hooked = new Set<Phaser.GameObjects.GameObject>();
      scene.cameras.main.shake(140, 0.01);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 560,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const open = Math.sin(Math.min(1, v * 1.4) * Math.PI * 0.5) * (v > 0.75 ? (1 - v) * 4 : 1);
          g.clear();
          g.fillStyle(ABYSS.void).fillEllipse(x, gy + 1, 30 * open, 6 * open);
          g.lineStyle(1, ABYSS.sheen).strokeEllipse(x, gy + 1, 30 * open, 6 * open);
          // Four legs: out of the pit, over the floor, the claws coming back in toward it.
          for (const [side, reach] of [
            [-1, 38],
            [-1, 22],
            [1, 22],
            [1, 38],
          ] as const) {
            const out = Math.sin(Math.min(1, v * 2) * Math.PI) * reach * open + 4;
            insectLeg(g, x + side * 6, gy, x + side * out, gy - 2, 1.5);
          }
        },
        onComplete: () => g.destroy(),
      });
      later(scene, 180, () => {
        world.pull(x, gy - 6, 44, 200);
        for (const t of world.targets(x, gy)) {
          if (hooked.has(t) || Math.abs(t.x - x) > 44 || t.y < gy - 30 || t.y > gy + 8) continue;
          hooked.add(t);
          world.strike(t, 0.7 * power, 'proc', false, { slow: 600 }, 0);
          sparks(scene, t.x, t.y, [ABYSS.sheen, ABYSS.glow], 5, 10);
        }
      });
    },
    onSwing: ({ p, world, scene }, m, step) => {
      const f = p.facing;
      // The rising wing shakes two of his moths loose; they flutter off and hunt the nearest enemies.
      if (step === 1) {
        for (const a of [-0.5, -0.9])
          world.shot({
            x: p.x + f * 4,
            y: p.y - 4,
            vx: Math.cos(a) * 150 * f,
            vy: Math.sin(a) * 150,
            texture: 'blancaMoth',
            mult: 0.35,
            source: 'proc',
            homing: true,
            knockback: 40,
          });
        return;
      }
      // The finisher: a void tears open behind him and one of Vortigern's legs lances out past him, far ahead.
      if (step !== 3) return;
      const g = scene.add.graphics().setDepth(9.5);
      const hit = new Set<Phaser.GameObjects.GameObject>();
      const [ox, oy] = [p.x - f * 6, p.y - 4];
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: m.ms + 120,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const out = v < 0.45 ? v / 0.45 : v < 0.7 ? 1 : 1 - (v - 0.7) / 0.3;
          const len = 58 * Phaser.Math.Easing.Quadratic.Out(out);
          g.clear();
          g.fillStyle(ABYSS.void).fillEllipse(ox, oy, 6 + 4 * out, 12 * out + 2);
          g.lineStyle(1, ABYSS.sheen).strokeEllipse(ox, oy, 6 + 4 * out, 12 * out + 2);
          if (len < 4) return;
          insectLeg(g, ox, oy, ox + f * len, oy + 1, 3);
          for (const t of world.targets(ox, oy)) {
            if (hit.has(t) || !onLine(ox, oy, f > 0 ? 0 : Math.PI, len, t, 8) || Math.abs(t.x - p.x) < 30) continue;
            hit.add(t);
            world.strike(t, 0.6, 'proc', false, undefined, 160);
            cutMark(scene, t.x, t.y, ABYSS.glow, 16, 0);
          }
        },
        onComplete: () => g.destroy(),
      });
    },
    // Raja Serangga (the King of Insects: Oberon is the fairy king who was born of the insects of the forest, and they
    // are his). He snaps his fingers and a swarm of night insects pours out of his cape. It falls on the nearest enemy
    // and eats at it, then moves on to the next one nobody has eaten yet, and with every victim more insects join it:
    // the swarm grows, its bites grow, the cloud spreads (five victims at most, flyers too). Fed, it draws itself
    // together over its last victim into one giant black moth, Vortigern's shape, and comes down on it.
    skill: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.lock(320);
      p.setVelocityX(0);
      sparks(scene, p.x, p.y - 4, [ABYSS.sheen, ABYSS.glow], 8, 14);
      const sw = { x: p.x, y: p.y - 4, n: 8, r: 6, moth: 0 };
      const seeds = Array.from({ length: 48 }, () => ({
        a: Math.random() * Math.PI * 2,
        r: Math.random(),
        sp: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3),
        ph: Math.random() * Math.PI * 2,
        dy: Math.random() * 2 - 1,
      }));
      const g = scene.add.graphics().setDepth(13);
      const draw = () => {
        g.clear();
        const now = scene.time.now / 1000;
        // The giant moth the fed swarm becomes, drawn as the insects pull in.
        if (sw.moth > 0)
          for (const side of [-1, 1]) vortigernWing(g, sw.x, sw.y, side, 2.6 * sw.moth, (Math.sin(now * 14) + 1) / 2, sw.moth);
        for (let i = 0; i < sw.n; i++) {
          const s = seeds[i];
          const a = s.a + now * s.sp;
          const r = sw.r * (0.25 + 0.75 * s.r) * (1 - sw.moth * 0.8);
          const x = sw.x + Math.cos(a) * r;
          const y = sw.y + Math.sin(a) * r * 0.6 + s.dy * sw.r * 0.35;
          bug(g, x, y, (Math.sin(now * 38 + s.ph) + 1) / 2, i % 5 ? ABYSS.sheen : ABYSS.glow);
        }
      };
      scene.events.on('update', draw);
      const stop = () => {
        scene.events.off('update', draw);
        g.destroy();
      };
      const eaten = new Set<Phaser.GameObjects.GameObject>();
      const hunt = (gen: number) => {
        const t = world.targets(sw.x, sw.y).find((o) => !eaten.has(o));
        if (!t || gen >= 5) return finale(gen);
        eaten.add(t);
        const [x0, y0] = [sw.x, sw.y];
        const d = Phaser.Math.Distance.Between(x0, y0, t.x, t.y);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: Phaser.Math.Clamp(140 + d * 1.2, 160, 380),
          ease: 'Sine.InOut',
          onUpdate: (tw) => {
            [sw.x, sw.y] = bez(x0, y0, (x0 + t.x) / 2, Math.min(y0, t.y) - 20, t.x, t.y, tw.getValue() ?? 1);
          },
          onComplete: () => {
            // It eats: three bites, each harder the bigger the swarm has grown.
            for (let k = 0; k < 3; k++)
              later(scene, k * 130, () => {
                if (!t.active) return;
                [sw.x, sw.y] = [t.x, t.y];
                world.strike(t, 0.35 * power * (1 + 0.3 * gen), 'skill', false, undefined, 0);
                for (let j = 0; j < 3; j++)
                  cutMark(scene, t.x + Phaser.Math.Between(-4, 4), t.y + Phaser.Math.Between(-4, 4), ABYSS.glow, 5, Math.random() * 3);
                cam.shake(40, 0.004);
              });
            later(scene, 420, () => {
              // Fed: more insects join, the cloud spreads.
              sw.n = Math.min(seeds.length, sw.n + 8);
              sw.r += 3;
              hunt(gen + 1);
            });
          },
        });
      };
      // The fed swarm draws itself together into one giant moth over its last victim, then comes down on it.
      const finale = (gen: number) => {
        const [x, y] = [sw.x, sw.y];
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 320,
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 1;
            sw.moth = v;
            sw.y = y - 18 * v;
          },
          onComplete: () =>
            scene.tweens.addCounter({
              from: y - 18,
              to: y,
              duration: 120,
              ease: 'Quad.In',
              onUpdate: (tw) => (sw.y = tw.getValue() ?? y),
              onComplete: () => {
                cam.shake(160, 0.012);
                ring(scene, x, y, ABYSS.sheen, 4, 34, 300, 2);
                ring(scene, x, y, ABYSS.glow, 2, 22, 220);
                world.area(x, y, 30, 1.2 * power * (1 + 0.15 * gen), 160, 'skill');
                // The moth breaks back up into insects that scatter into the night.
                for (let i = 0; i < 24; i++) {
                  const a = Math.random() * Math.PI * 2;
                  const b = scene.add.rectangle(x, y, 2, 1, i % 3 ? ABYSS.sheen : ABYSS.glow).setDepth(13);
                  scene.tweens.add({
                    targets: b,
                    x: x + Math.cos(a) * Phaser.Math.Between(20, 60),
                    y: y + Math.sin(a) * Phaser.Math.Between(14, 40) - 10,
                    alpha: 0,
                    duration: 600,
                    onComplete: () => b.destroy(),
                  });
                }
                stop();
              },
            }),
        });
      };
      later(scene, 160, () => hunt(0));
    },
    // Sayap Blanca: Blanca, the little white moth, the one fairy who was ever kind to him, flies out of his collar and
    // grows over the field until her wings span the arena. She beats them once: a gale of moth wings that cuts
    // everything, ground and air. She beats them again and her scale dust falls like snow over the whole field: every
    // enemy it settles on falls asleep (held, harmless, dimmed into a dream; half as long on bosses). The first blow on
    // a sleeper is a nightmare: a crit that wakes it (Oberon's passive). Then she shrinks back to his shoulder.
    fusion: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.lock(450);
      p.invuln(1600);
      p.setVelocityX(0);
      const B = { x: p.x, y: p.y - 6, s: 0.4, flap: 0.5, beat: 0 };
      const g = scene.add.graphics().setDepth(13);
      const draw = () => {
        g.clear();
        const now = scene.time.now;
        const flap = B.beat > 0 ? Math.abs(Math.sin(now / 45)) : (Math.sin(now / 160) + 1) / 2;
        g.fillStyle(0xfff1e8, 0.12).fillCircle(B.x, B.y, 9 * B.s);
        whiteMoth(g, B.x, B.y, B.s, flap);
      };
      scene.events.on('update', draw);
      // Out of his collar and up over the middle of the field, growing.
      const [x0, y0] = [p.x, p.y - 6];
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 600,
        ease: 'Sine.InOut',
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 1;
          [B.x, B.y] = bez(x0, y0, x0, 20, W / 2, 52, v);
          B.s = 0.4 + 5.6 * v;
        },
      });
      // First beat: the gale.
      later(scene, 680, () => {
        B.beat = 1;
        cam.shake(200, 0.01);
        for (let i = 0; i < 14; i++) {
          const y = Phaser.Math.Between(20, FLOOR_Y - 4);
          const dir = i % 2 ? 1 : -1;
          const l = scene.add.rectangle(W / 2, y, Phaser.Math.Between(16, 34), 1, i % 3 ? ABYSS.scale : 0xfff1e8, 0.8).setDepth(12);
          scene.tweens.add({ targets: l, x: W / 2 + dir * (W / 2 + 20), alpha: 0, duration: 380, onComplete: () => l.destroy() });
        }
        for (const t of world.targets(W / 2, 60)) {
          world.strike(t, 1.3 * power, 'skill', false, undefined, 120);
          cutMark(scene, t.x, t.y, ABYSS.scale, 18, Math.random() - 0.5);
        }
        later(scene, 260, () => (B.beat = 0));
      });
      // Second beat: the scale dust falls over the whole field, and they sleep where it settles.
      later(scene, 1080, () => {
        B.beat = 1;
        for (let i = 0; i < 90; i++) {
          const sx = B.x + Phaser.Math.Between(-60, 60);
          const d = scene.add.rectangle(sx, B.y + Phaser.Math.Between(-6, 10), 1, 1, i % 3 ? ABYSS.scale : 0xfff1e8).setDepth(14);
          scene.tweens.add({
            targets: d,
            x: Phaser.Math.Between(4, W - 4),
            y: FLOOR_Y - Phaser.Math.Between(0, 30),
            alpha: 0.2,
            duration: Phaser.Math.Between(500, 900),
            ease: 'Sine.Out',
            onComplete: () => d.destroy(),
          });
        }
        later(scene, 260, () => (B.beat = 0));
        later(scene, 420, () => {
          floatText(scene, W / 2, 104, 'TIDURLAH', '#c8d4ff');
          for (const t of world.targets(W / 2, 60)) {
            world.afflict(t, { sleep: 3500 });
            sparks(scene, t.x, t.y - 6, [ABYSS.scale, 0xfff1e8], 5, 8);
          }
        });
      });
      // Back to his shoulder, small again.
      later(scene, 1600, () => {
        const [bx, by, bs] = [B.x, B.y, B.s];
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 420,
          ease: 'Sine.In',
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 1;
            [B.x, B.y] = bez(bx, by, p.x, 30, p.x, p.y - 8, v);
            B.s = bs + (0.4 - bs) * v;
          },
          onComplete: () => {
            scene.events.off('update', draw);
            g.destroy();
            sparks(scene, p.x, p.y - 8, [0xfff1e8, ABYSS.scale], 6, 8);
          },
        });
      });
    },
    // Lie Like Vortigern (Kanata to Ochiru Yume no Hitomi, "the eye of the dream that falls beyond"): the Fairy King's
    // glamour cracks and falls away and Vortigern stands there, the Abyss of Britain, his black moth wings spreading
    // over the night. The floor opens from his feet to both walls into the bottomless pit and everything falls in,
    // flyers too: they fall and fall, out of the bottom of the world and in again from the top, faster each time, and
    // the abyss bites at them on every pass (a boss, too heavy to swallow, is bitten where it stands). Then, deep in
    // the dark, the dream's eye opens and looks at them all; it closes, and the fall ends. Everything is struck at
    // once and wakes on the floor already asleep. SELAMAT TIDUR.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const cam = scene.cameras.main;
      p.invuln(4300);
      p.lock(4100);
      p.setVelocity(0, 0);
      const night = scene.add.rectangle(0, 0, W, H, ABYSS.void, 0).setOrigin(0).setDepth(8);
      scene.tweens.add({ targets: night, fillAlpha: 0.82, duration: 500 });
      // The glamour cracks: a ring of fairy gold around him shatters.
      ring(scene, p.x, p.y, 0xffec27, 4, 18, 260, 1);
      later(scene, 200, () => {
        sparks(scene, p.x, p.y - 2, [0xffec27, 0xfff1e8, ABYSS.glow], 18, 24);
        floatText(scene, p.x, p.y - 46, 'BOHONG.', '#9fb4ff');
      });
      // His true wings, spread wide behind him for the whole of it.
      const wings = scene.add.graphics().setDepth(9.5);
      const t0 = scene.time.now;
      const drawWings = () => {
        wings.clear();
        if (!p.active) return;
        const k = Phaser.Math.Clamp((scene.time.now - t0 - 200) / 500, 0, 1);
        if (!k) return;
        const flap = (Math.sin(scene.time.now / 300) + 1) / 2;
        for (const side of [-1, 1]) vortigernWing(wings, p.x, p.y - 6, side, 0.6 + 2.6 * Phaser.Math.Easing.Back.Out(k), flap);
      };
      scene.events.on('update', drawWings);

      // The abyss opens across the floor.
      const pit = scene.add.graphics().setDepth(8.5);
      let open = 0;
      const drawPit = () => {
        pit.clear();
        if (open <= 0) return;
        const now = scene.time.now;
        const [l, r] = [p.x - (p.x + 10) * open, p.x + (W - p.x + 10) * open];
        pit.fillStyle(0x000000).fillRect(l, FLOOR_Y - 1, r - l, H - FLOOR_Y + 1);
        // The rim: a ragged lip of glowing blue, insect legs twitching at it.
        const lip: Phaser.Math.Vector2[] = [];
        for (let x = l; x <= r; x += 6) lip.push(new Phaser.Math.Vector2(x, FLOOR_Y - 1 + Math.sin(x * 0.7 + now / 120) * 1.2));
        pit.lineStyle(2, ABYSS.deep).strokePoints(lip, false);
        pit.lineStyle(1, ABYSS.sheen).strokePoints(lip, false);
        for (let x = l + 8; x < r; x += 26) {
          const tw = Math.sin(now / 90 + x) * 3;
          insectLeg(pit, x, FLOOR_Y + 6, x + tw, FLOOR_Y - 5, 1);
        }
      };
      scene.events.on('update', drawPit);
      later(scene, 700, () => {
        cam.flash(150, 40, 50, 140);
        cam.shake(400, 0.012);
        scene.tweens.addCounter({ from: 0, to: 1, duration: 260, ease: 'Quad.Out', onUpdate: (tw) => (open = tw.getValue() ?? 1) });
      });

      // The fall: everything it can swallow goes down into it, again and again.
      type Taken = Phaser.GameObjects.Sprite & { untargetable: boolean; stunUntil: number; kind?: string; flying?: boolean };
      type Faller = { t: Taken; pic: Phaser.GameObjects.Image; x: number; y: number; vy: number; spin: number };
      const fallers: Faller[] = [];
      const heavy: Phaser.GameObjects.Sprite[] = [];
      let falling = false;
      const fall = (_: number, delta: number) => {
        if (!falling) return;
        const dt = delta / 1000;
        for (const f of fallers) {
          f.vy = Math.min(560, f.vy + 900 * dt);
          const before = f.y;
          f.y += f.vy * dt;
          // Through the mouth of the pit: the abyss bites.
          if (before < FLOOR_Y && f.y >= FLOOR_Y) {
            sparks(scene, f.x, FLOOR_Y, [ABYSS.sheen, ABYSS.glow], 5, 10);
            if (f.t.active) world.strike(f.t, 0.5 * power, 'ult', false, undefined, 0);
          }
          // Out of the bottom of the world and back in at the top.
          if (f.y > H + 12) f.y = -12;
          f.pic.setPosition(f.x, f.y).setAngle(f.pic.angle + f.spin * dt);
          if (f.t.active) f.t.setPosition(f.x, f.y);
          else if (f.pic.visible) {
            f.pic.setVisible(false);
            sparks(scene, f.x, f.y, [ABYSS.sheen, 0xfff1e8], 8, 14);
          }
          // Streaks of the fall above it.
          if (Math.random() < 0.3) {
            const s = scene.add.rectangle(f.x + Phaser.Math.Between(-4, 4), f.y - 10, 1, 8, ABYSS.glow, 0.6).setDepth(11);
            scene.tweens.add({ targets: s, alpha: 0, duration: 160, onComplete: () => s.destroy() });
          }
        }
      };
      scene.events.on('update', fall);
      later(scene, 960, () => {
        for (const t of world.targets(p.x, p.y) as Taken[]) {
          if ('tier' in t || ['ghost', 'mimic'].includes(t.kind ?? '')) {
            heavy.push(t);
            continue;
          }
          const pic = scene.add.image(t.x, t.y, t.texture.key, t.frame.name).setFlipX(t.flipX).setDepth(10.5);
          t.untargetable = true;
          t.stunUntil = scene.time.now + 60000;
          t.setVisible(false);
          (t.body as Phaser.Physics.Arcade.Body).enable = false;
          fallers.push({ t, pic, x: t.x, y: t.y, vy: t.flying ? -60 : -120, spin: Phaser.Math.Between(-240, 240) });
        }
        falling = true;
      });
      // What is too heavy to swallow is bitten where it stands.
      const insectBite = (t: Phaser.GameObjects.Sprite) =>
        cutMark(scene, t.x + Phaser.Math.Between(-6, 6), t.y + Phaser.Math.Between(-6, 6), ABYSS.glow, 8, Math.random() * 3);
      for (let k = 0; k < 4; k++)
        later(scene, 1150 + k * 420, () => {
          for (const t of heavy) {
            if (!t.active) continue;
            for (let j = 0; j < 3; j++) insectBite(t);
            world.strike(t, 0.5 * power, 'ult', false, undefined, 0);
          }
        });

      // The dream's eye opens in the dark and looks at them; it closes, and the fall ends.
      const eye = scene.add.graphics().setDepth(9);
      const [ex, ey] = [W / 2, 66];
      const drawEye = (lid: number) => {
        eye.clear();
        if (lid <= 0) return;
        const [rw, rh] = [70, 24 * lid];
        const pts = Array.from({ length: 33 }, (_, i) => {
          const a = (i / 32) * Math.PI * 2;
          return new Phaser.Math.Vector2(
            ex + Math.cos(a) * rw,
            ey + Math.sin(a) * rh * (Math.abs(Math.cos(a)) < 0.3 ? 1 : 1 - Math.abs(Math.cos(a)) * 0.35),
          );
        });
        eye.fillStyle(ABYSS.deep).fillPoints(pts, true);
        eye.lineStyle(2, ABYSS.sheen).strokePoints(pts, true);
        // The iris and its slit pupil, no bigger than the opening.
        const ir = Math.min(20, rh);
        eye.fillStyle(ABYSS.sheen).fillCircle(ex, ey, ir);
        eye.fillStyle(ABYSS.glow).fillCircle(ex, ey, ir * 0.7);
        eye.fillStyle(ABYSS.eye).fillCircle(ex, ey, ir * 0.4);
        eye.fillStyle(0x000000).fillEllipse(ex, ey, 4, ir * 1.6);
        eye.fillStyle(0xfff1e8).fillCircle(ex - ir * 0.4, ey - ir * 0.35, 2);
      };
      later(scene, 2800, () => {
        falling = false;
        // The fall stops; they hang in the dark where the eye can see them, trembling.
        for (const f of fallers) {
          const y = Phaser.Math.Clamp(f.y, 110, FLOOR_Y - 16);
          scene.tweens.add({
            targets: f,
            y,
            duration: 300,
            ease: 'Sine.Out',
            onUpdate: () => {
              f.pic.setPosition(f.x + Phaser.Math.Between(-1, 1), f.y);
              if (f.t.active) f.t.setPosition(f.x, f.y);
            },
          });
        }
        scene.tweens.addCounter({ from: 0, to: 1, duration: 320, ease: 'Sine.Out', onUpdate: (tw) => drawEye(tw.getValue() ?? 1) });
      });
      // The blink.
      later(scene, 3500, () =>
        scene.tweens.addCounter({
          from: 1,
          to: 0,
          duration: 110,
          ease: 'Quad.In',
          onUpdate: (tw) => drawEye(tw.getValue() ?? 0),
          onComplete: () => {
            eye.destroy();
            cam.flash(200, 120, 140, 255);
            cam.shake(450, 0.025);
            floatText(scene, W / 2, 50, 'SELAMAT TIDUR.', '#c8d4ff');
            // They wake from the fall on the floor (flyers where they hung), and are struck, and sleep.
            for (const f of fallers) {
              f.pic.destroy();
              if (!f.t.active || !f.t.untargetable) continue;
              const body = f.t.body as Phaser.Physics.Arcade.Body;
              body.enable = true;
              body.reset(f.x, f.t.flying ? Phaser.Math.Clamp(f.y, 30, FLOOR_Y - 30) : FLOOR_Y - 10);
              f.t.setVisible(true);
              f.t.untargetable = false;
              f.t.stunUntil = 0;
            }
            for (const t of world.targets(p.x, p.y)) {
              sparks(scene, t.x, t.y, [ABYSS.glow, 0xfff1e8], 10, 18);
              world.strike(t, 2.2 * power, 'ult', true, { sleep: 2500 }, 0);
            }
            scene.events.off('update', fall);
            scene.tweens.addCounter({
              from: 1,
              to: 0,
              duration: 300,
              onUpdate: (tw) => (open = tw.getValue() ?? 0),
              onComplete: () => {
                scene.events.off('update', drawPit);
                pit.destroy();
              },
            });
            scene.tweens.add({
              targets: wings,
              alpha: 0,
              duration: 500,
              onComplete: () => {
                scene.events.off('update', drawWings);
                wings.destroy();
              },
            });
            scene.tweens.add({ targets: night, fillAlpha: 0, delay: 300, duration: 600, onComplete: () => night.destroy() });
          },
        }),
      );
    },
  },
};
