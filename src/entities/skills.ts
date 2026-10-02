import Phaser from 'phaser';
import { FLOOR_Y, H, W, cutMark, floatText } from '../gfx/ui.ts';
import type { WeaponId } from '../logic/loot.ts';
import type { PlayerWorld } from './arena.ts';
import type { Player } from './Player.ts';

export interface SkillCtx {
  p: Player;
  world: PlayerWorld;
  scene: Phaser.Scene;
  /** stats.skillPower, already folded into every mult below. */
  power: number;
}

/** Return false when the skill could not fire (e.g. no targets) so nothing is spent. */
type SkillFn = (c: SkillCtx) => boolean | void;

/** basic: what the attack key casts for Weapon.cast weapons; fusion: attack + skill together (Weapon.fusion). */
type WeaponSkills = { skill: SkillFn; ult: SkillFn; basic?: SkillFn; fusion?: SkillFn };

const later = (scene: Phaser.Scene, ms: number, fn: () => void) => scene.time.delayedCall(ms, fn);

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
function soulTo(scene: Phaser.Scene, x: number, y: number, p: Player, color: number): void {
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
function bez(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

/** Calls `fn` every `ms` while `obj` is alive (for projectile trails). */
function whileAlive(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject, ms: number, fn: (k: number) => void): void {
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
function leafBurst(scene: Phaser.Scene, x: number, y: number, n: number): void {
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
function vine(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number): void {
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
function tree(scene: Phaser.Scene, x: number, h: number, ms: number, lean: number): void {
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
function bolt(scene: Phaser.Scene, x0: number, y0: number, x1: number, y1: number, color = 0xffec27): void {
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

/** A boulder ripped from the ground at (x0, FLOOR_Y) and hurled in an arc onto `t`; `onHit` runs if it lands. */
function hurlRock(scene: Phaser.Scene, x0: number, t: Phaser.GameObjects.Sprite, onHit: () => void): void {
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
function azraelBlade(scene: Phaser.Scene, x: number, y: number, len: number): Phaser.GameObjects.Container {
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
function eveningBell(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
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

export const SKILLS: Record<WeaponId, WeaponSkills> = {
  pedang: {
    // Strike Air: the barrier of wind hiding Excalibur unravels in a spiral off the blade and is hurled as a drilling
    // tornado at the nearest enemy ahead (in the air or not), piercing everything in its path and hurling it away.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const x0 = p.x + f * 12;
      const y0 = p.y - 6;
      p.lock(250);
      p.setVelocityX(0);
      // The wind peels off the blade.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const w = scene.add
          .rectangle(x0 + Math.cos(a) * 4, y0 + Math.sin(a) * 4, 4, 1, 0xc2f0ff)
          .setRotation(a)
          .setDepth(13);
        scene.tweens.add({
          targets: w,
          x: x0 + Math.cos(a + 1) * 22,
          y: y0 + Math.sin(a + 1) * 22,
          alpha: 0,
          duration: 250,
          onComplete: () => w.destroy(),
        });
      }
      const ahead = world.targets(x0, y0).find((t) => Math.sign(t.x - x0) === f);
      const base = f > 0 ? 0 : Math.PI;
      const a = ahead
        ? base + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(x0, y0, ahead.x, ahead.y) - base), -0.6, 0.6)
        : base;
      const gust = world.shot({
        x: x0,
        y: y0,
        vx: Math.cos(a) * 260,
        vy: Math.sin(a) * 260,
        texture: 'angin',
        mult: 3 * power,
        source: 'skill',
        pierce: true,
        knockback: 300,
      }) as Phaser.GameObjects.Image;
      gust.setScale(2.5);
      scene.tweens.add({ targets: gust, angle: f * 1080, duration: 1500 });
      // Rings of wind spin off behind it like the bore of a drill, with streaks of speed.
      for (let i = 0; i < 24; i++)
        later(scene, i * 35, () => {
          if (!gust.active) return;
          const ringW = scene.add
            .ellipse(gust.x, gust.y, 8, 30)
            .setStrokeStyle(1, i % 2 ? 0xfff1e8 : 0x29adff, 0.8)
            .setRotation(a)
            .setDepth(12);
          scene.tweens.add({ targets: ringW, scale: 1.6, alpha: 0, duration: 260, onComplete: () => ringW.destroy() });
          const s = scene.add
            .rectangle(gust.x - Math.cos(a) * 20, gust.y - Math.sin(a) * 20 + Phaser.Math.Between(-16, 16), 10, 1, 0xc2f0ff)
            .setRotation(a)
            .setDepth(12);
          scene.tweens.add({
            targets: s,
            x: s.x - Math.cos(a) * 24,
            y: s.y - Math.sin(a) * 24,
            alpha: 0,
            duration: 250,
            onComplete: () => s.destroy(),
          });
        });
      scene.cameras.main.shake(150, 0.01);
    },
    // Avalon, the Everdistant Utopia: the golden scabbard appears before her and breaks apart into hundreds of plates
    // of light that lock together into a dome around her. Nothing reaches her inside it, her wounds close, and
    // whatever presses against it is thrown back.
    fusion: ({ p, world, scene, power }) => {
      const LIFE = 2500;
      p.invuln(LIFE);
      p.lock(500);
      p.setVelocityX(0);
      floatText(scene, p.x, p.y - 34, 'AVALON', '#ffec27');
      scene.cameras.main.flash(200, 255, 236, 39);
      const sheath = scene.add
        .rectangle(p.x + p.facing * 10, p.y - 4, 4, 18, 0x2a4bd7)
        .setStrokeStyle(1, 0xffec27)
        .setDepth(13);
      scene.tweens.add({ targets: sheath, scaleY: 1.4, alpha: 0, duration: 300, onComplete: () => sheath.destroy() });
      const R = 26;
      const plates = Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2;
        const pl = scene.add.rectangle(p.x + p.facing * 10, p.y - 4, 4, 2, i % 3 ? 0xffec27 : 0xfff1e8).setDepth(13);
        return { pl, a };
      });
      const dome = scene.add.circle(p.x, p.y, R, 0xffec27, 0.12).setStrokeStyle(1, 0xffec27, 0.7).setDepth(12).setScale(0);
      scene.tweens.add({ targets: dome, scale: 1, delay: 200, duration: 250, ease: 'Back.Out' });
      const spin = scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: LIFE,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const gather = Math.min(1, t * 8);
          dome.setPosition(p.x, p.y);
          for (const { pl, a } of plates) {
            const ang = a + t * 6;
            pl.setPosition(
              Phaser.Math.Linear(pl.x, p.x + Math.cos(ang) * R, gather),
              Phaser.Math.Linear(pl.y, p.y + Math.sin(ang) * R, gather),
            ).setRotation(ang + Math.PI / 2);
          }
        },
        onComplete: () => {
          for (const { pl } of plates) {
            const a = Math.random() * Math.PI * 2;
            scene.tweens.add({
              targets: pl,
              x: pl.x + Math.cos(a) * 30,
              y: pl.y + Math.sin(a) * 30,
              alpha: 0,
              duration: 400,
              onComplete: () => pl.destroy(),
            });
          }
          scene.tweens.add({ targets: dome, alpha: 0, scale: 1.4, duration: 300, onComplete: () => dome.destroy() });
        },
      });
      for (let k = 0; k < 10; k++)
        later(scene, 250 + k * 225, () => {
          if (!spin.isPlaying()) return;
          world.area(p.x, p.y, R + 8, 0.3 * power, 260, 'skill');
          p.heal(Math.ceil(p.stats.maxHp * 0.02));
        });
    },
    // Excalibur: night falls over the field and the last of the wind barrier tears away. She raises the sword and a
    // pillar of golden light climbs into the sky as the motes of the world gather to it ("EX..."); then she brings it
    // down: a colossal beam of light sweeps from the sky to the horizon in front of her, everything it crosses is
    // struck, and columns of light burst up all along its path ("...CALIBUR!").
    ult: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.invuln(2600);
      p.lock(2000);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      const dusk = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x05051a, 0.6)
        .setOrigin(0)
        .setDepth(2)
        .setAlpha(0);
      scene.tweens.add({ targets: dusk, alpha: 1, duration: 300 });
      const tipX = p.x + f * 3;
      const tipY = p.y - 16;
      // The wind barrier tears away from the blade.
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
      const pillar = [
        scene.add.rectangle(tipX, tipY, 14, tipY + 10, 0xffec27, 0.35),
        scene.add.rectangle(tipX, tipY, 4, tipY + 10, 0xfff1e8),
      ].map((r) => r.setOrigin(0.5, 1).setScale(1, 0).setDepth(13));
      scene.tweens.add({ targets: pillar, scaleY: 1, duration: 500, ease: 'Quad.Out' });
      for (let i = 0; i < 36; i++)
        later(scene, i * 25, () => {
          const a = Math.random() * Math.PI * 2;
          const r = Phaser.Math.Between(60, 120);
          const mote = scene.add.rectangle(tipX + Math.cos(a) * r, tipY + Math.sin(a) * r, 2, 2, i % 3 ? 0xffec27 : 0xfff1e8).setDepth(13);
          scene.tweens.add({ targets: mote, x: tipX, y: tipY, duration: 320, onComplete: () => mote.destroy() });
        });
      floatText(scene, W / 2, 40, 'EX...', '#ffec27');
      const x0 = p.x + f * 8;
      const y0 = p.y - 4;
      const base = f > 0 ? 0 : Math.PI;
      const FROM = -0.7;
      const TO = 0.12;
      later(scene, 1000, () => {
        pillar.forEach((r) => r.destroy());
        floatText(scene, W / 2, 52, 'CALIBUR!', '#ffec27');
        cam.flash(300, 255, 236, 39);
        cam.shake(600, 0.03);
        const len = 380;
        const beam = (
          [
            [80, 0xffec27, 0.35],
            [50, 0xffec27, 0.7],
            [26, 0xfff1e8, 0.9],
            [8, 0xffffff, 1],
          ] as const
        ).map(([h, c, al]) => scene.add.rectangle(x0, y0, len, h, c, al).setOrigin(0, 0.5).setDepth(13));
        // The sweep: from high in the sky down to just below the horizon.
        scene.tweens.addCounter({
          from: FROM,
          to: TO,
          duration: 320,
          ease: 'Quad.In',
          onUpdate: (tw) => beam.forEach((b) => b.setRotation(base + f * (tw.getValue() ?? 0))),
        });
        scene.tweens.add({
          targets: beam,
          scaleY: 0,
          alpha: 0,
          delay: 650,
          duration: 400,
          onComplete: () => beam.forEach((b) => b.destroy()),
        });
        // Everything in front within the swept sector is struck.
        const swept = (t: Phaser.GameObjects.Sprite) => {
          const off = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(x0, y0, t.x, t.y) - base) * f;
          return Math.sign(t.x - x0) === f && off >= FROM - 0.12 && off <= TO + 0.2;
        };
        later(scene, 200, () => {
          for (const t of world.targets(x0, y0)) if (swept(t)) world.strike(t, 5 * power, 'ult', true);
          // Columns of light burst up all along the beam's path on the ground.
          for (let i = 0; i < 8; i++)
            later(scene, i * 50, () => {
              const cx = x0 + f * (30 + i * 40);
              if (cx < 0 || cx > W) return;
              const col = scene.add.rectangle(cx, FLOOR_Y, 10, FLOOR_Y, 0xffec27, 0.6).setOrigin(0.5, 1).setScale(1, 0).setDepth(12);
              scene.tweens.add({ targets: col, scaleY: 1, duration: 120 });
              scene.tweens.add({ targets: col, scaleX: 0, alpha: 0, delay: 220, duration: 250, onComplete: () => col.destroy() });
              sparks(scene, cx, FLOOR_Y - 4, [0xffec27, 0xfff1e8], 6, 20);
            });
        });
        // The light lingers for two more pulses.
        for (const k of [1, 2])
          later(scene, 200 + k * 160, () =>
            world
              .targets(x0, y0)
              .filter(swept)
              .forEach((t) => world.strike(t, 1 * power, 'ult', false)),
          );
        scene.tweens.add({ targets: dusk, alpha: 0, delay: 900, duration: 500, onComplete: () => dusk.destroy() });
      });
    },
  },

  belati: {
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
    // Gae Bolg, soaring: a crimson circle at his feet, he leaps and the spear spins up in his hand gathering power,
    // then the throw splits into red spears hunting every enemy.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(1500);
      ring(scene, p.x, p.y + 6, 0xff004d, 4, 40, 400, 2);
      p.setVelocity(0, -380);
      const spear = scene.add
        .image(p.x, p.y - 12, 'w_tombak')
        .setTint(0xff004d)
        .setScale(1.5)
        .setDepth(14);
      scene.tweens.add({ targets: spear, angle: -450, duration: 380, onUpdate: () => spear.setPosition(p.x, p.y - 12) });
      later(scene, 400, () => {
        spear.destroy();
        floatText(scene, W / 2, 40, 'GAE BOLG!', '#ff004d');
        thorns(scene, p.x, p.y, 0xff004d, 12, 30);
        scene.cameras.main.flash(200, 255, 0, 77);
        world.targets(p.x, p.y).forEach((t, i) => {
          for (let k = 0; k < 3; k++) {
            later(scene, i * 50 + k * 90, () => {
              if (!t.active) return;
              // Aimed straight at this target (a little spread), piercing whatever is in the way.
              const a = Phaser.Math.Angle.Between(p.x, p.y, t.x, t.y) + Phaser.Math.FloatBetween(-0.08, 0.08);
              world.shot({
                x: p.x,
                y: p.y,
                vx: Math.cos(a) * 280,
                vy: Math.sin(a) * 280,
                texture: 'w_tombak',
                tint: 0xff004d,
                mult: 1.8 * power,
                source: 'ult',
                pierce: true,
              });
            });
          }
        });
      });
    },
  },

  kapak: {
    // Mad roar: the sky flashes red, two shockwave rings and flying rocks blow everything away and stagger it.
    skill: ({ p, world, scene, power }) => {
      scene.cameras.main.shake(300, 0.018);
      scene.cameras.main.flash(120, 255, 0, 77);
      floatText(scene, p.x, p.y - 20, 'GRAAAH!', '#ff004d');
      ring(scene, p.x, p.y, 0xff004d, 6, 70, 300, 3);
      later(scene, 100, () => ring(scene, p.x, p.y, 0xab5236, 6, 90, 400, 2));
      rocks(scene, p.x, FLOOR_Y - 2, 10);
      world.area(p.x, p.y, 70, 0.8 * power, 300, 'skill', { freeze: 600 });
    },
    // Nine Lives: Heracles closes in and strikes nine times from alternating sides, counting each blow;
    // the ninth craters the ground.
    ult: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      p.invuln(1600);
      p.lock(1300);
      for (let i = 0; i < 9; i++) {
        later(scene, i * 110, () => {
          if (!t.active) return;
          const last = i === 8;
          const side = i % 2 ? 1 : -1;
          p.ghost(0xff004d);
          p.body.reset(Phaser.Math.Clamp(t.x + side * 14, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
          p.facing = -side;
          cutMark(scene, t.x, t.y, last ? 0xff004d : 0xffa300, last ? 40 : 28);
          ring(scene, t.x, t.y, 0xab5236, 2, last ? 50 : 14, 220, last ? 3 : 1);
          floatText(scene, t.x, t.y - 26, `${i + 1}`, last ? '#ff004d' : '#ffa300');
          world.strike(t, (last ? 3 : 0.9) * power, 'ult', last);
          world.area(t.x, t.y, 26, 0.3 * power, last ? 260 : 30, 'ult');
          if (last) {
            scene.cameras.main.shake(250, 0.02);
            rocks(scene, t.x, FLOOR_Y - 2, 14);
          }
        });
      }
    },
  },

  busur: {
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
  },

  sabit: {
    // Soul harvest: pale chains of soul-light hook everything nearby and drag it in, while a phantom scythe blade
    // circles him once; then the reap.
    skill: ({ p, world, scene, power }) => {
      p.spin(400);
      for (const t of world.targets(p.x, p.y).filter((t) => Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 80)) {
        const g = scene.add.graphics().setDepth(12).lineStyle(1, 0x29adff, 0.8).lineBetween(t.x, t.y, p.x, p.y);
        scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
      }
      const arc = scene.add.image(p.x, p.y, 'slashMoon').setTint(0xc2c3c7).setScale(3.5).setAlpha(0.85).setDepth(13);
      scene.tweens.add({
        targets: arc,
        angle: 360 * p.facing,
        alpha: 0,
        duration: 420,
        onUpdate: () => arc.setPosition(p.x, p.y),
        onComplete: () => arc.destroy(),
      });
      world.area(p.x, p.y, 80, 0.4 * power, -230, 'skill');
      // Small push so reaped enemies stay in reach of the next swing.
      later(scene, 250, () => {
        world.area(p.x, p.y, 34, 1.4 * power, 40, 'skill');
        sparks(scene, p.x, p.y, [0x29adff, 0xc2c3c7], 10, 34);
      });
    },
    // Harvest of death: the arena dims to violet and a giant scythe blade sweeps across it. Each enemy it passes is cut
    // and its soul flies into the reaper, healing him.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      const f = p.facing;
      p.invuln(1400);
      p.lock(900);
      p.setVelocityX(0);
      const dusk = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x2a0a2a, 0.55)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      scene.tweens.add({ targets: dusk, alpha: 1, duration: 200, yoyo: true, hold: 800, onComplete: () => dusk.destroy() });
      const blade = scene.add
        .image(f > 0 ? -40 : W + 40, p.y - 20, 'slashMoon')
        .setTint(0xc2c3c7)
        .setScale(f * 6, 9)
        .setAlpha(0.85)
        .setDepth(13);
      scene.tweens.add({
        targets: blade,
        x: f > 0 ? W + 40 : -40,
        duration: 700,
        delay: 200,
        ease: 'Sine.InOut',
        onComplete: () => blade.destroy(),
      });
      for (const t of targets) {
        const frac = f > 0 ? t.x / W : 1 - t.x / W;
        later(scene, 200 + Phaser.Math.Clamp(frac, 0, 1) * 700, () => {
          if (!t.active) return;
          cutMark(scene, t.x, t.y, 0x29adff, 30);
          world.strike(t, 2.2 * power, 'ult', false);
          soulTo(scene, t.x, t.y, p, 0x29adff);
          p.heal(5);
        });
      }
    },
  },

  senapan: {
    // Grenade: lobbed in an arc, spinning, then a fireball blast with smoke and debris.
    skill: ({ p, world, scene, power }) => {
      const target = world.targets(p.x, p.y).find((t) => Math.sign(t.x - p.x) === p.facing && Math.abs(t.x - p.x) <= 120);
      const x = Phaser.Math.Clamp(target?.x ?? p.x + p.facing * 90, 8, W - 8);
      const y = target?.y ?? FLOOR_Y - 5;
      const fromX = p.x;
      const fromY = p.y;
      const grenade = scene.add.image(fromX, fromY, 'grenade').setDepth(12);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 500,
        onUpdate: (tween) => {
          const progress = tween.getValue() ?? 0;
          grenade.setPosition(fromX + (x - fromX) * progress, fromY + (y - fromY) * progress - Math.sin(progress * Math.PI) * 36);
          grenade.setRotation(progress * Math.PI * 3);
        },
        onComplete: () => {
          grenade.destroy();
          explosion(scene, x, y, 34);
          world.area(x, y, 34, 3.8 * power, 140, 'skill');
          scene.cameras.main.shake(140, 0.012);
        },
      });
    },
    // Suppressing fire: a laser sight locks on, then twelve piercing rounds, each with a muzzle flash and a spent
    // casing ejected behind.
    ult: ({ p, world, scene, power }) => {
      const facing = p.facing;
      p.lock(1150);
      p.invuln(350);
      p.setVelocityX(0);
      const laser = scene.add
        .rectangle(p.x + facing * 10, p.y + 1, W, 1, 0xff004d, 0.7)
        .setOrigin(facing > 0 ? 0 : 1, 0.5)
        .setDepth(12);
      scene.tweens.add({ targets: laser, alpha: 0, duration: 200, delay: 150, onComplete: () => laser.destroy() });
      for (let i = 0; i < 12; i++)
        later(scene, 200 + i * 75, () => {
          if (!p.active || p.hp <= 0) return;
          const mx = p.x + facing * 12;
          const flash = scene.add.circle(mx, p.y + 1, 3, 0xffec27).setDepth(13);
          scene.tweens.add({ targets: flash, radius: 1, alpha: 0, duration: 60, onComplete: () => flash.destroy() });
          const shell = scene.add.rectangle(p.x, p.y - 2, 1, 2, 0xffa300).setDepth(13);
          scene.tweens.add({
            targets: shell,
            x: p.x - facing * Phaser.Math.Between(6, 14),
            y: FLOOR_Y,
            angle: 360,
            duration: 380,
            ease: 'Quad.In',
            onComplete: () => shell.destroy(),
          });
          scene.cameras.main.shake(40, 0.004);
          world.shot({
            x: mx,
            y: p.y + 1,
            vx: facing * 360,
            vy: ((i % 3) - 1) * 24,
            texture: 'bullet',
            tint: 0xffa300,
            mult: 0.9 * power,
            source: 'ult',
            pierce: true,
            knockback: 12,
          });
        });
    },
  },

  pedangTerbang: {
    // Sword formation: a qi seal turns behind him, six swords flash into being in a fan over his head, then fly off one
    // by one to hunt, each trailing qi.
    skill: ({ p, world, scene, power }) => {
      const seal = scene.add
        .circle(p.x, p.y - 6, 22)
        .setStrokeStyle(1, 0x29adff)
        .setDepth(9);
      const inner = scene.add
        .star(p.x, p.y - 6, 6, 8, 18)
        .setStrokeStyle(1, 0xc2f0ff)
        .setDepth(9);
      scene.tweens.add({
        targets: [seal, inner],
        angle: 120,
        alpha: 0,
        duration: 800,
        onComplete: () => (seal.destroy(), inner.destroy()),
      });
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + ((i + 0.5) / 6) * Math.PI;
        const sword = scene.add
          .image(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, 'w_pedangTerbang')
          .setRotation(a)
          .setTint(0x29adff)
          .setScale(0)
          .setDepth(12);
        scene.tweens.add({ targets: sword, scale: 1, duration: 120, delay: i * 30, ease: 'Back.Out' });
        later(scene, 250 + i * 90, () => {
          const shot = world.shot({
            x: sword.x,
            y: sword.y,
            vx: Math.cos(a) * 200,
            vy: Math.sin(a) * 200,
            texture: 'w_pedangTerbang',
            tint: 0x29adff,
            mult: 0.9 * power,
            source: 'skill',
            homing: true,
          });
          whileAlive(scene, shot, 40, () => {
            const q = shot as Phaser.GameObjects.Image;
            const d = scene.add.rectangle(q.x, q.y, 1, 1, 0xc2f0ff).setDepth(11);
            scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
          });
          sword.destroy();
        });
      }
    },
    // Ten thousand swords return: a golden ring of swords wheels above him, then golden swords converge on every
    // enemy from all sides, and the formation closes in one qi burst.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(1900);
      p.lock(1800);
      p.setVelocity(0, -60);
      p.ghost(0xffec27);
      scene.cameras.main.flash(250, 255, 236, 39);
      const wheel = Array.from({ length: 12 }, () => scene.add.image(p.x, p.y, 'w_pedangTerbang').setTint(0xffec27).setDepth(12));
      scene.tweens.addCounter({
        from: 0,
        to: Math.PI * 4,
        duration: 1700,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          wheel.forEach((s, i) => {
            const a = v + (i / 12) * Math.PI * 2;
            s.setPosition(p.x + Math.cos(a) * 30, p.y - 30 + Math.sin(a) * 10).setRotation(a + Math.PI / 2);
          });
        },
        onComplete: () => wheel.forEach((s) => s.destroy()),
      });
      for (let i = 0; i < 24; i++) {
        later(scene, 200 + i * 55, () => {
          const live = world.targets(p.x, p.y);
          if (!live.length) return;
          const t = live[i % live.length];
          const a = Math.PI + 0.3 + Math.random() * (Math.PI - 0.6);
          world.shot({
            x: Phaser.Math.Clamp(t.x + Math.cos(a) * 90, -15, W + 15),
            y: t.y + Math.sin(a) * 90,
            vx: -Math.cos(a) * 340,
            vy: -Math.sin(a) * 340,
            texture: 'w_pedangTerbang',
            tint: 0xffec27,
            mult: 0.8 * power,
            source: 'ult',
            pierce: true,
          });
        });
      }
      later(scene, 1700, () => {
        ring(scene, p.x, p.y, 0xffec27, 6, 70, 350, 3);
        sparks(scene, p.x, p.y, [0xffec27, 0x29adff], 16, 60);
        world.area(p.x, p.y, 60, 2 * power, 220, 'ult');
        scene.cameras.main.shake(200, 0.015);
      });
    },
  },

  tongkat: {
    // Elemental Cycle: every cast calls the next element in turn: fire, ice, lightning, earth, and round again.
    skill: (c) => {
      const k = (c.p.getData('element') as number | undefined) ?? 0;
      c.p.setData('element', (k + 1) % ELEMENT_SPELLS.length);
      ELEMENT_SPELLS[k](c);
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
    // Arcane ring: a magic circle turns under her, then eight magic arrows burst outward and each hunts an enemy.
    skill: ({ p, world, scene, power }) => {
      const circle = [
        scene.add.circle(p.x, p.y, 20).setStrokeStyle(1, 0xff77a8),
        scene.add.star(p.x, p.y, 8, 9, 18).setStrokeStyle(1, 0x83769c),
      ];
      circle.forEach((c) => c.setDepth(9));
      scene.tweens.add({ targets: circle, angle: 90, alpha: 0, duration: 600, onComplete: () => circle.forEach((c) => c.destroy()) });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        world.shot({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * 180,
          vy: Math.sin(a) * 180,
          texture: 'panahArkana',
          mult: 0.7 * power,
          source: 'skill',
          homing: true,
        });
      }
    },
    // Starfall: a constellation lights up across the sky, its lines drawn star to star, and golden arcane arrows fall
    // from each star and home in.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const stars = Array.from({ length: 7 }, (_, i) => ({
        x: 20 + i * 46 + Phaser.Math.Between(-10, 10),
        y: Phaser.Math.Between(12, 44),
      }));
      const sky = scene.add.graphics().setDepth(4).lineStyle(1, 0xff77a8, 0.6);
      sky.beginPath().moveTo(stars[0].x, stars[0].y);
      for (const s of stars) sky.lineTo(s.x, s.y);
      sky.strokePath();
      sky.setAlpha(0);
      const dots = stars.map((s) => scene.add.star(s.x, s.y, 4, 1, 4, 0xffec27).setDepth(5).setScale(0));
      scene.tweens.add({ targets: sky, alpha: 1, duration: 400 });
      scene.tweens.add({ targets: dots, scale: 1, angle: 90, duration: 300, ease: 'Back.Out' });
      for (let i = 0; i < 16; i++) {
        later(scene, 350 + i * 70, () => {
          const s = stars[i % stars.length];
          world.shot({
            x: s.x,
            y: s.y,
            vx: 0,
            vy: 170,
            texture: 'panahArkana',
            tint: 0xffec27,
            mult: 1 * power,
            source: 'ult',
            homing: true,
          });
        });
      }
      later(scene, 1700, () =>
        scene.tweens.add({
          targets: [sky, ...dots],
          alpha: 0,
          duration: 400,
          onComplete: () => [sky, ...dots].forEach((o) => o.destroy()),
        }),
      );
    },
  },

  pedangGelap: {
    // Dark crescent (three while awakened): each trails violet smoke as it cuts through the line.
    skill: ({ p, world, scene, power }) => {
      ring(scene, p.x, p.y, 0x8a3fd1, 18, 4, 150);
      for (const a of p.awakened ? [-0.2, 0, 0.2] : [0]) {
        const wave = world.shot({
          x: p.x + p.facing * 10,
          y: p.y,
          vx: Math.cos(a) * 220 * p.facing,
          vy: Math.sin(a) * 220,
          texture: 'slashMoon',
          tint: 0x8a3fd1,
          mult: 1.8 * power,
          source: 'skill',
          pierce: true,
        }) as Phaser.GameObjects.Image;
        wave.setScale(p.facing * 1.3, 1.3);
        whileAlive(scene, wave, 35, () => {
          const s = scene.add.rectangle(wave.x - p.facing * 4, wave.y + Phaser.Math.Between(-8, 8), 2, 2, 0x7e2553, 0.8).setDepth(11);
          scene.tweens.add({ targets: s, y: s.y - 6, alpha: 0, duration: 300, onComplete: () => s.destroy() });
        });
      }
    },
    ult: () => false,
  },

  enamLengan: {
    // Thousand fists: speed lines stream past as a barrage of golden fists hammers the front, each landing in a burst.
    skill: ({ p, world, scene, power }) => {
      p.lock(1000);
      p.setVelocityX(0);
      for (let i = 0; i < 10; i++) {
        later(scene, i * 90, () => {
          const x = p.x + p.facing * 18;
          world.area(x, p.y + Phaser.Math.Between(-4, 4), 20, 0.35 * power, 30, 'skill');
          const y = p.y + Phaser.Math.Between(-7, 7);
          const fist = scene.add
            .image(p.x + p.facing * 6, y, 'w_enamLengan')
            .setTint(i % 2 ? 0xffec27 : 0xfff1e8)
            .setDepth(13)
            .setFlipX(p.facing < 0);
          scene.tweens.add({ targets: fist, x: x + p.facing * 6, alpha: 0, duration: 110, onComplete: () => fist.destroy() });
          const line = scene.add.rectangle(x, y + Phaser.Math.Between(-3, 3), 10, 1, 0xfff1e8, 0.8).setDepth(12);
          scene.tweens.add({ targets: line, x: x + p.facing * 14, alpha: 0, duration: 120, onComplete: () => line.destroy() });
          later(scene, 80, () => sparks(scene, x + p.facing * 6, y, [0xffec27, 0xffa300], 4, 10));
        });
      }
    },
    // Ashura form: a golden halo blazes behind him with six phantom arms fanned around it, fury maxed, invulnerable,
    // and six waves of phantom fists burst outward.
    ult: ({ p, world, scene, power }) => {
      p.gainFury(99);
      p.invuln(1500);
      p.lock(1200);
      p.setVelocityX(0);
      scene.cameras.main.flash(150, 255, 236, 39);
      floatText(scene, p.x, p.y - 30, 'ASHURA!', '#ffec27');
      const halo = scene.add
        .circle(p.x, p.y - 4, 18)
        .setStrokeStyle(2, 0xffec27)
        .setDepth(9);
      const arms = Array.from({ length: 6 }, (_, k) => {
        const a = -Math.PI / 2 + (k - 2.5) * 0.45;
        return scene.add
          .image(p.x + Math.cos(a) * 16, p.y - 4 + Math.sin(a) * 16, 'w_enamLengan')
          .setRotation(a)
          .setTint(0xffec27)
          .setAlpha(0.8)
          .setDepth(9);
      });
      scene.tweens.add({
        targets: [halo, ...arms],
        alpha: 0,
        delay: 1100,
        duration: 300,
        onComplete: () => [halo, ...arms].forEach((o) => o.destroy()),
      });
      for (let i = 0; i < 6; i++) {
        later(scene, i * 180, () => {
          // Six fists in a ring, turned half a step each wave.
          for (let k = 0; k < 6; k++) {
            const a = ((k + i * 0.5) / 6) * Math.PI * 2;
            const fist = scene.add.image(p.x, p.y, 'w_enamLengan').setTint(0xffec27).setRotation(a).setDepth(13);
            scene.tweens.add({
              targets: fist,
              x: p.x + Math.cos(a) * 44,
              y: p.y + Math.sin(a) * 44,
              alpha: 0,
              duration: 200,
              onComplete: () => fist.destroy(),
            });
          }
          ring(scene, p.x, p.y, 0xffa300, 6, 48, 200);
          world.area(p.x, p.y, 48, 1.2 * power, 160, 'ult');
        });
      }
    },
  },

  cakarNaga: {
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
    // and black fire and exhales it as one roaring beam aimed at the nearest enemy (in the air or not), scorching
    // everything along the line.
    fusion: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(1000);
      p.invuln(1000);
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
        scene.tweens.add({
          targets: beam,
          scaleY: 0,
          alpha: 0,
          delay: 600,
          duration: 250,
          onComplete: () => beam.forEach((b) => b.destroy()),
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
            for (const t of world.targets(mx, my)) if (onBeam(a, t)) world.strike(t, 1.1 * power, 'skill', k === 3, { burn: 0.4 });
          });
        scene.tweens.add({ targets: head, alpha: 0, delay: 700, duration: 300, onComplete: () => head.destroy() });
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
      p.lock(1300);
      p.setVelocityX(0);
      floatText(scene, Phaser.Math.Clamp(p.x, 40, W - 40), p.y - 30, 'TAHU DIRI!', '#ffec27');
      const gates = Array.from({ length: 18 }, (_, i) => {
        const row = Math.floor(i / 6);
        const x = 24 + (i % 6) * 54 + (row % 2) * 27 + Phaser.Math.Between(-6, 6);
        const y = 38 + row * 20 + Phaser.Math.Between(-4, 4);
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
        scene.tweens.add({ targets: gate, scale: 1, delay: i * 25, duration: 160, ease: 'Back.Out' });
        return { gate, tip, key };
      });
      // Each shot leaves a gate already aimed: the treasure in it turns to its target, then flies.
      for (let i = 0; i < 24; i++)
        later(scene, 500 + i * 35, () => {
          const ts = world.targets(p.x, p.y);
          if (!ts.length) return;
          const g = gates[(i * 7) % gates.length];
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
              world.strike(t, 0.3 * power, 'skill', false);
            },
          });
          ring(scene, g.gate.x, g.gate.y, 0xffec27, 6, 16, 200);
          g.key = Phaser.Math.RND.pick(TREASURES);
          g.tip.setTexture(g.key).setRotation(a);
          if (i % 4 === 0) scene.cameras.main.shake(50, 0.003);
        });
      later(scene, 1450, () =>
        gates.forEach(({ gate }, i) =>
          scene.tweens.add({ targets: gate, scaleY: 0, alpha: 0, delay: i * 15, duration: 160, onComplete: () => gate.destroy() }),
        ),
      );
    },
    // Enuma Elish, the Star of Creation that Split Heaven and Earth: "Wake up, Ea." Night falls and a great gate opens
    // at his side; he draws Ea, the Sword of Rupture, and holds it high as its three cylinders turn against each
    // other, dragging the air of the whole arena into a red-black vortex at its tip while the ground trembles. Then
    // he brings it down on the thickest press of enemies and space itself is torn: a spiraling storm of rupture tears
    // across the field, striking what lies in its path one after another, and cracks race out of it across sky and
    // ground. At the end the world splits along those cracks (KOYAK!) and everything on the field is struck at once.
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
      later(scene, 1350, () => {
        // Aim along the line through the most enemies ahead of the blade's swing (either side).
        const ts = world.targets(ex, ey);
        const onRay = (a: number, o: Phaser.GameObjects.Sprite) => {
          const [dx, dy] = [o.x - ex, o.y - ey];
          return dx * Math.cos(a) + dy * Math.sin(a) > 0 && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) < 24;
        };
        let aim = f > 0 ? 0 : Math.PI;
        let most = -1;
        for (const e of ts) {
          const a = Phaser.Math.Angle.Between(ex, ey, e.x, e.y);
          const n = ts.filter((o) => onRay(a, o)).length;
          if (n > most) [aim, most] = [a, n];
        }
        spin.remove();
        wind.stop();
        vortex.destroy();
        // The swing: Ea drops from overhead onto the aim, then the storm is let loose from its tip.
        const sf = Math.cos(aim) >= 0 ? 1 : -1;
        ea.setFlipX(sf < 0).setOrigin(sf > 0 ? 0.1 : 0.9, 0.5);
        const rot = sf > 0 ? aim : aim - Math.PI;
        scene.tweens.add({ targets: ea, rotation: rot, duration: 90, ease: 'Quad.In' });
        const [ox, oy] = [ex + Math.cos(aim) * REACH, ey + Math.sin(aim) * REACH];
        const LEN = 420;
        const beam = (
          [
            [64, 0xff004d, 0.4],
            [40, 0x000000, 0.9],
            [14, 0x7e2553, 0.9],
            [4, 0xfff1e8, 1],
          ] as const
        ).map(([h, c, al]) => scene.add.rectangle(ox, oy, LEN, h, c, al).setOrigin(0, 0.5).setRotation(aim).setScale(0, 1).setDepth(13));
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 160, ease: 'Quad.Out' });
        scene.tweens.add({
          targets: beam,
          scaleY: 0,
          alpha: 0,
          delay: 900,
          duration: 350,
          onComplete: () => beam.forEach((b) => b.destroy()),
        });
        // Spiral bands race down the storm.
        for (let k = 0; k < 14; k++) {
          const band = scene.add
            .rectangle(ox, oy, 3, 50, k % 2 ? 0xff004d : 0x7e2553)
            .setRotation(aim + 0.5)
            .setDepth(14);
          scene.tweens.add({
            targets: band,
            x: ox + Math.cos(aim) * LEN,
            y: oy + Math.sin(aim) * LEN,
            delay: k * 60,
            duration: 420,
            onComplete: () => band.destroy(),
          });
        }
        cam.shake(700, 0.02);
        // Cracks race out of the storm across sky and ground: jagged red lines with black cores.
        for (let i = 0; i < 16; i++) {
          const d = Phaser.Math.Between(20, 300);
          const [cx, cy] = [ox + Math.cos(aim) * d, oy + Math.sin(aim) * d];
          if (cx < 0 || cx > W || cy < 0 || cy > FLOOR_Y + 10) continue;
          const dir = aim + (i % 2 ? 1 : -1) * Phaser.Math.FloatBetween(0.9, 2.2);
          const pts: [number, number][] = [[cx, cy]];
          for (let s = 1; s <= 6; s++) {
            const [lx, ly] = pts[s - 1];
            const st = Phaser.Math.Between(10, 22);
            const jag = dir + Phaser.Math.FloatBetween(-0.6, 0.6);
            pts.push([lx + Math.cos(jag) * st, ly + Math.sin(jag) * st]);
          }
          const g = scene.add.graphics().setDepth(12).setAlpha(0);
          for (const [w, c] of [
            [3, 0xff004d],
            [1, 0x000000],
          ] as const) {
            g.lineStyle(w, c).beginPath().moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts) g.lineTo(x, y);
            g.strokePath();
          }
          scene.tweens.add({ targets: g, alpha: 1, delay: 100 + i * 25, duration: 80 });
          cracks.push(g);
        }
        // Everything in the storm's path is struck in turn, nearest first.
        ts.filter((o) => onRay(aim, o)).forEach((t, i) =>
          later(scene, 120 + i * 80, () => {
            if (!t.active) return;
            sparks(scene, t.x, t.y, [0xff004d, 0x000000, 0xfff1e8], 10, 22);
            world.strike(t, 5 * power, 'ult', true);
            cam.shake(80, 0.012);
          }),
        );
      });
      // Heaven and earth split along the cracks: one flash, and the whole field is struck at once.
      later(scene, 2600, () => {
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
        for (let i = 0; i < 20; i++) {
          const s = scene.add
            .triangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, FLOOR_Y - 40), 0, 0, 5, 1, 2, 6, i % 2 ? 0xff004d : 0x7e2553)
            .setDepth(12);
          scene.tweens.add({ targets: s, y: s.y + 60, angle: 360, alpha: 0, duration: 700, onComplete: () => s.destroy() });
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
            explosion(scene, tx, ty, 30);
            ring(scene, tx, ty, FIRE[1], 6, 50, 350, 3);
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
            world.area(tx, ty, 34, 3.5 * power, 220, 'skill', { burn: 0.6 });
            for (const o of world.targets(tx, ty))
              if (Math.abs(o.x - tx) < 12 && Phaser.Math.Distance.Between(o.x, o.y, tx, ty) >= 34)
                world.strike(o, 1.2 * power, 'skill', false, { burn: 0.6 });
          },
        });
      });
    },
    // World Cutting Slash: Dismantle aimed at space itself, which nothing can block. Sukuna chants the incantation
    // ("Dragon Scales. Recoil. Twin Meteors."), each word a hand sign and a pulse of cursed energy as the field
    // darkens; then he flicks his hand and a single line splits the whole screen, the world gaping open along it.
    // The line is laid where it crosses the most enemies at that moment; everything on it is cut in two.
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
            if (!across(x, y, a, e)) continue;
            cutMark(scene, e.x, e.y, 0xff004d, 40, a);
            world.strike(e, 7 * power, 'skill', true);
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
            world.strike(t, 0.3 * power, 'ult', false);
          }
          cam.shake(60, 0.006);
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
              world.strike(t, 1.5 * power, 'ult', true);
            }),
          ),
      );
      // The maw closes: one last Cleave on everyone.
      later(scene, 2900, () => {
        scene.tweens.add({ targets: maw, alpha: 1, scaleX: 1.4, duration: 120, yoyo: true });
        cam.flash(200, 255, 0, 77);
        cam.shake(450, 0.025);
        floatText(scene, W / 2, 48, 'TERBELAH!', '#ff004d');
        for (const t of world.targets(p.x, p.y)) {
          cutMark(scene, t.x, t.y, 0xfff1e8, 50, Math.PI / 2);
          cutMark(scene, t.x, t.y, 0xff004d, 44, 0);
          sparks(scene, t.x, t.y, [0xff004d, 0xb3122e], 14, 30);
          world.strike(t, 3 * power, 'ult', true);
        }
        scene.tweens.add({ targets: shrine, scaleY: 0, delay: 250, duration: 350, ease: 'Quad.In' });
        scene.tweens.add({ targets: domain, alpha: 0, delay: 300, duration: 500, onComplete: () => domain.forEach((o) => o.destroy()) });
      });
    },
  },

  mugen: {
    // Blue (Ao): a point of attraction opens in front of Gojo, drags enemies in and crushes them.
    basic: ({ p, world, scene, power }) => {
      const x = Phaser.Math.Clamp(p.x + p.facing * 56, 10, W - 10);
      const y = p.y - 10;
      const orb = scene.add.image(x, y, 'ao').setScale(0.6).setDepth(12);
      scene.tweens.add({ targets: orb, scale: 3, angle: 720, duration: 500, yoyo: true, onComplete: () => orb.destroy() });
      const glow = scene.add.circle(x, y, 30, 0x29adff, 0.2).setDepth(11);
      scene.tweens.add({ targets: glow, radius: 8, alpha: 0, duration: 1000, onComplete: () => glow.destroy() });
      const ring = scene.add.circle(x, y, 46).setStrokeStyle(2, 0x29adff, 0.8).setDepth(12);
      scene.tweens.add({ targets: ring, radius: 4, alpha: 0.2, duration: 450, repeat: 1, onComplete: () => ring.destroy() });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const mote = scene.add.rectangle(x + Math.cos(a) * 66, y + Math.sin(a) * 66, 2, 2, 0xc2f0ff).setDepth(12);
        scene.tweens.add({ targets: mote, x, y, delay: i * 30, duration: 400, onComplete: () => mote.destroy() });
      }
      for (let i = 0; i < 4; i++) {
        later(scene, i * 250, () => {
          world.pull(x, y, 72, 130);
          world.area(x, y, 32, 0.5 * power, 0, 'basic');
        });
      }
    },
    // Red (Aka): reversed cursed energy fired forward; it blasts everything in its path away.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const x = p.x + f * 14;
      const flare = scene.add
        .image(x, p.y - 4, 'aka')
        .setScale(2)
        .setDepth(12);
      scene.tweens.add({ targets: flare, scale: 6, alpha: 0, duration: 250, onComplete: () => flare.destroy() });
      scene.cameras.main.shake(150, 0.012);
      const red = world.shot({
        x,
        y: p.y - 4,
        vx: f * 300,
        vy: 0,
        texture: 'aka',
        mult: 1.8 * power,
        source: 'skill',
        pierce: true,
        knockback: 320,
      });
      // Three times the orb (and its hitbox).
      (red as Phaser.GameObjects.Image).setScale(3);
    },
    // Hollow Purple (Murasaki): Blue and Red collide in front of Gojo; the imaginary mass erases everything in its path.
    fusion: ({ p, world, scene, power }) => {
      const f = p.facing;
      const x = p.x + f * 30;
      // Centered high enough that the huge sphere sweeps the floor and the air above it.
      const y = FLOOR_Y - 42;
      p.lock(500);
      p.invuln(500);
      p.setVelocityX(0);
      const orbs = [scene.add.image(x - 26, y - 20, 'ao'), scene.add.image(x + 26, y - 20, 'aka')].map((o) => o.setScale(2.5).setDepth(13));
      scene.tweens.add({
        targets: orbs,
        x,
        y,
        duration: 400,
        ease: 'Quad.In',
        onComplete: () => {
          orbs.forEach((o) => o.destroy());
          scene.cameras.main.flash(250, 138, 63, 209);
          scene.cameras.main.shake(500, 0.03);
          const sphere = world.shot({
            x,
            y,
            vx: f * 140,
            vy: 0,
            texture: 'murasaki',
            mult: 4 * power,
            source: 'skill',
            pierce: true,
            knockback: 200,
          });
          // A huge sphere (about 90px): six times the sprite, and its hitbox with it.
          (sphere as Phaser.GameObjects.Image).setScale(6);
          // The erased path: purple afterimages trail behind it.
          for (let i = 1; i <= 20; i++) {
            later(scene, i * 60, () => {
              if (!sphere.active) return;
              const { x: gx, y: gy } = sphere as Phaser.GameObjects.Image;
              const ghost = scene.add.image(gx, gy, 'murasaki').setScale(6).setAlpha(0.35).setDepth(8);
              scene.tweens.add({ targets: ghost, alpha: 0, scale: 4, duration: 350, onComplete: () => ghost.destroy() });
            });
          }
        },
      });
    },
    // Unlimited Void: infinite information freezes every enemy in place, then Gojo lands the blow.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(2200);
      p.lock(1600);
      p.setVelocityX(0);
      const domain = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x000000, 0)
        .setOrigin(0)
        .setDepth(3);
      scene.tweens.add({ targets: domain, fillAlpha: 0.75, duration: 300, yoyo: true, hold: 1300, onComplete: () => domain.destroy() });
      for (let i = 0; i < 30; i++) {
        const star = scene.add
          .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, FLOOR_Y), 1, 1, i % 3 ? 0xfff1e8 : 0x29adff)
          .setAlpha(0)
          .setDepth(4);
        scene.tweens.add({ targets: star, alpha: 1, duration: 300, yoyo: true, hold: 1300, onComplete: () => star.destroy() });
      }
      floatText(scene, Phaser.Math.Clamp(p.x, 56, W - 56), p.y - 30, 'RYOIKI TENKAI', '#29adff');
      for (const t of targets) world.strike(t, 0.5 * power, 'ult', false, { freeze: 3000 });
      later(scene, 1500, () => {
        scene.cameras.main.shake(200, 0.015);
        for (const t of targets) if (t.active) world.strike(t, 3 * power, 'ult', true);
      });
    },
  },

  sakahoko: {
    // Playful Cloud: the three-section staff whirls around Toji, three blows, the last one throwing enemies away.
    skill: ({ p, world, scene, power }) => {
      p.spin(450);
      const staff = scene.add.image(p.x, p.y, 'w_awan').setDepth(13);
      scene.tweens.add({
        targets: staff,
        angle: 720,
        duration: 450,
        onUpdate: () => staff.setPosition(p.x, p.y),
        onComplete: () => staff.destroy(),
      });
      for (const k of [0, 1, 2])
        later(scene, k * 150, () => world.area(p.x, p.y, 34, (k === 2 ? 1.4 : 0.8) * power, k === 2 ? 260 : 60, 'skill'));
      later(scene, 300, () => scene.cameras.main.shake(120, 0.01));
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
    // Katon: Gokakyu: a giant fireball rolls forward, burning through everything in its way.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(250);
      p.setVelocityX(0);
      const ball = world.shot({
        x: p.x + f * 16,
        y: p.y - 10,
        vx: f * 150,
        vy: 0,
        texture: 'gokakyu',
        mult: 2.5 * power,
        source: 'skill',
        pierce: true,
        knockback: 160,
        status: { burn: 0.4 },
      }) as Phaser.GameObjects.Image;
      // Twice the sprite: a truly giant fireball (the body scales with it).
      ball.setScale(2);
      scene.cameras.main.shake(150, 0.01);
      for (let i = 1; i <= 25; i++) {
        later(scene, i * 70, () => {
          if (!ball.active) return;
          const ember = scene.add
            .circle(ball.x - f * 18, ball.y + Phaser.Math.Between(-10, 10), 3, i % 2 ? 0xffa300 : 0xff004d)
            .setDepth(8);
          scene.tweens.add({ targets: ember, alpha: 0, y: ember.y - 6, duration: 300, onComplete: () => ember.destroy() });
        });
      }
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
    // Perfect Susanoo: the blue armored giant rises around Madara and cuts the monsters down with its sword:
    // two sweeps in front, then a final cut across the whole arena.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.invuln(3000);
      p.lock(2700);
      p.setVelocityX(0);
      const sx = Phaser.Math.Clamp(p.x, 40, W - 40);
      const giant = scene.add
        .image(sx, FLOOR_Y + 40, 'susanoo')
        .setOrigin(0.5, 1)
        .setScale(4.5)
        .setFlipX(f < 0)
        .setAlpha(0)
        .setDepth(9);
      scene.tweens.add({ targets: giant, alpha: 0.85, y: FLOOR_Y, duration: 400, ease: 'Quad.Out' });
      scene.tweens.add({ targets: giant, alpha: 0, delay: 2600, duration: 400, onComplete: () => giant.destroy() });
      scene.cameras.main.flash(200, 41, 173, 255);
      const hx = sx + f * 30;
      const hy = FLOOR_Y - 60;
      const sword = scene.add
        .image(hx, hy, 'susanooSword')
        .setOrigin(f > 0 ? 0 : 1, 0.5)
        .setFlipX(f < 0)
        .setScale(3)
        .setAlpha(0)
        .setDepth(9);
      later(scene, 2700, () => sword.destroy());
      [500, 1200, 1900].forEach((at, i) => {
        const last = i === 2;
        later(scene, at, () => {
          sword.setAlpha(0.95).setAngle(f * -110);
          scene.tweens.add({
            targets: sword,
            angle: f * 50,
            duration: 220,
            ease: 'Quad.In',
            onComplete: () => {
              scene.cameras.main.shake(250, last ? 0.03 : 0.015);
              world.shot({
                x: hx + f * 40,
                y: FLOOR_Y - 30,
                vx: f * 280,
                vy: 0,
                texture: 'slash',
                tint: 0x29adff,
                mult: 1 * power,
                source: 'ult',
                pierce: true,
                knockback: 200,
              });
              for (const t of world.targets(hx, hy)) {
                const inFront = (Math.sign(t.x - sx) === f || Math.abs(t.x - sx) < 30) && Math.abs(t.x - sx) < 190;
                if (last || inFront) world.strike(t, (last ? 3 : 2) * power, 'ult', last);
              }
            },
          });
        });
      });
    },
  },

  mokuton: {
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
    // Mokuryu no Jutsu: a great wooden dragon bursts from the ground behind him and coils forward through the arena,
    // biting and binding everything along its path and drawing their chakra back into him.
    fusion: ({ p, world, scene, power }) => {
      const f = p.facing;
      const x0 = p.x - f * 10;
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
          const hx = x0 + f * t * (W + 60);
          const hy = Phaser.Math.Linear(FLOOR_Y + 8, y0 + Math.sin(t * Math.PI * 5) * 26, rise);
          head.setPosition(hx, hy).setRotation(Math.cos(t * Math.PI * 5) * 0.4 * f);
          path.unshift({ x: hx, y: hy });
          if (path.length > TAIL) path.pop();
          drawBody();
          for (const e of world.targets(hx, hy)) {
            if (bitten.has(e) || Phaser.Math.Distance.Between(hx, hy, e.x, e.y) > 24) continue;
            bitten.add(e);
            world.strike(e, 2.2 * power, 'skill', true, { freeze: 1500 });
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
    // Tsukuyomi: the Mangekyo fills the view, then every enemy is dragged into a red world under a black moon,
    // held still and stabbed over and over ("72 hours"), until they collapse.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(2800);
      p.lock(1800);
      p.setVelocityX(0);
      const eye = scene.add
        .image(W / 2, FLOOR_Y / 2, 'mangekyo')
        .setScale(0.5)
        .setDepth(15);
      scene.tweens.add({ targets: eye, scale: 7, angle: 120, duration: 400, ease: 'Quad.Out' });
      scene.tweens.add({ targets: eye, alpha: 0, delay: 400, duration: 200, onComplete: () => eye.destroy() });
      later(scene, 500, () => {
        const red = scene.add
          .rectangle(0, 0, W, FLOOR_Y + 20, 0xb3122e, 0)
          .setOrigin(0)
          .setDepth(3);
        const moon = scene.add
          .circle(W * 0.72, 38, 22, 0x000000, 0)
          .setStrokeStyle(2, 0xff004d, 0)
          .setDepth(4);
        scene.tweens.add({ targets: red, fillAlpha: 0.65, duration: 200, yoyo: true, hold: 1700, onComplete: () => red.destroy() });
        scene.tweens.add({
          targets: moon,
          fillAlpha: 1,
          strokeAlpha: 1,
          duration: 200,
          yoyo: true,
          hold: 1700,
          onComplete: () => moon.destroy(),
        });
        floatText(scene, W / 2, 60, '72 JAM...', '#fff1e8');
        for (const t of targets) if (t.active) world.strike(t, 0.3 * power, 'ult', false, { freeze: 3500 });
      });
      for (let i = 0; i < 16; i++) {
        later(scene, 600 + i * 90, () => {
          for (const t of targets) {
            if (!t.active) continue;
            const a = Math.random() * Math.PI * 2;
            const blade = scene.add
              .rectangle(t.x + Math.cos(a) * 16, t.y + Math.sin(a) * 16, 12, 1, 0xfff1e8)
              .setRotation(a)
              .setDepth(13);
            scene.tweens.add({ targets: blade, x: t.x, y: t.y, alpha: 0, duration: 120, onComplete: () => blade.destroy() });
            world.strike(t, 0.2 * power, 'ult', false);
          }
        });
      }
      later(scene, 2200, () => {
        scene.cameras.main.flash(200, 179, 18, 46);
        for (const t of targets) if (t.active) world.strike(t, 2 * power, 'ult', true);
      });
    },
  },

  tongkatFrost: {
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
    // Iaido: a beat in stance while a glint runs down the sheathed blade, then one flash-draw straight through
    // everything ahead. Enemies on the path freeze mid-step and only fall apart when the blade clicks back home.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const y = p.y;
      p.invuln(650);
      p.lock(430);
      p.setVelocityX(0);
      glint(scene, p.x + f * 6, y - 1);
      later(scene, 170, () => {
        if (!p.active) return;
        const fromX = p.x;
        const toX = Phaser.Math.Clamp(fromX + f * 130, 8, W - 8);
        for (let i = 1; i <= 5; i++) afterimage(scene, p, fromX + ((toX - fromX) * i) / 6, y, 0.12 + i * 0.07);
        p.body.reset(toX, y);
        bladeLine(scene, fromX, y, toX, y, 0xff004d, 200);
        scene.cameras.main.shake(90, 0.008);
        const lo = Math.min(fromX, toX) - 8;
        const hi = Math.max(fromX, toX) + 8;
        const cut = world.targets(toX, y).filter((t) => Math.abs(t.y - y) < 20 && t.x >= lo && t.x <= hi);
        for (const t of cut) world.strike(t, 0.2 * power, 'skill', false, { freeze: 400 });
        // Chin: the blade is sheathed and every cut opens at once.
        later(scene, 320, () => {
          floatText(scene, Phaser.Math.Clamp(p.x, 20, W - 20), p.y - 20, 'CHIN', '#fff1e8');
          for (const t of cut) {
            if (!t.active) continue;
            cutMark(scene, t.x, t.y, 0xff004d, 30, -0.6);
            cutMark(scene, t.x, t.y, 0xff004d, 30, 0.6);
            world.strike(t, 1.6 * power, 'skill', true);
          }
          if (cut.length) scene.cameras.main.shake(140, 0.014);
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
    // Rasenshuriken: a ball of wind chakra with four screaming blades flies ahead; on the first enemy (or at range) it
    // swells into a dome of countless tiny cuts that hits everything inside again and again.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(200);
      p.setVelocityX(0);
      const orb = scene.add.container(p.x + f * 10, p.y - 4).setDepth(13);
      orb.add([
        scene.add.circle(0, 0, 9, 0xc2f0ff, 0.35),
        ...[0, 1, 2, 3].map((k) =>
          scene.add
            .triangle(0, 0, 0, -2, 16, 0, 0, 2, 0xfff1e8)
            .setOrigin(0, 0.5)
            .setRotation((k * Math.PI) / 2),
        ),
        scene.add.circle(0, 0, 4, 0x29adff).setStrokeStyle(1, 0xfff1e8),
      ]);
      scene.tweens.add({ targets: orb, angle: f * 2000, duration: 2000 });
      let exploded = false;
      let fly: Phaser.Tweens.Tween | undefined;
      const boom = () => {
        if (exploded) return;
        exploded = true;
        fly?.stop();
        const { x, y } = orb;
        orb.destroy();
        const dome = scene.add.circle(x, y, 6, 0xc2f0ff, 0.45).setStrokeStyle(1, 0xfff1e8).setDepth(13);
        scene.tweens.add({ targets: dome, radius: 38, duration: 200, ease: 'Quad.Out' });
        scene.tweens.add({ targets: dome, alpha: 0, delay: 900, duration: 300, onComplete: () => dome.destroy() });
        scene.cameras.main.shake(300, 0.012);
        for (let i = 0; i < 6; i++)
          later(scene, i * 150, () => {
            for (let k = 0; k < 6; k++) cutMark(scene, x + Phaser.Math.Between(-28, 28), y + Phaser.Math.Between(-28, 28), 0xc2f0ff, 12);
            world.area(x, y, 38, 0.6 * power, 20, 'skill');
          });
      };
      fly = scene.tweens.add({
        targets: orb,
        x: Phaser.Math.Clamp(p.x + f * 150, 10, W - 10),
        duration: 600,
        onUpdate: () => {
          if (world.targets(orb.x, orb.y).some((t) => Phaser.Math.Distance.Between(orb.x, orb.y, t.x, t.y) < 14)) boom();
        },
        onComplete: boom,
      });
    },
    // Rasengan Rendan: Naruto crosses his fingers ("Tajuu Kage Bunshin!") and shadow clones pop out of white smoke
    // around him, one for every enemy. Each clone has a Rasengan already spinning in its palm and leaps in an arc to its
    // own target, wherever it is now (flyers too); it drives the sphere in, the ball grinds into the enemy, swells and
    // bursts in a spiral of wind, and the clone vanishes in a puff of smoke. When the last one lands he shouts his
    // catchphrase.
    fusion: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y).slice(0, 7);
      if (!foes.length) return false;
      p.lock(350);
      p.invuln(500);
      p.setVelocityX(0);
      // A puff of smoke: overlapping grey-white balls that billow out and fade.
      const poof = (x: number, y: number) => {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const c = scene.add
            .circle(x, y, 3, i % 2 ? 0xfff1e8 : 0xc2c3c7, 0.9)
            .setStrokeStyle(1, 0x83769c)
            .setDepth(14);
          scene.tweens.add({
            targets: c,
            x: x + Math.cos(a) * 7,
            y: y + Math.sin(a) * 5 - 2,
            radius: 5,
            alpha: 0,
            duration: 320,
            onComplete: () => c.destroy(),
          });
        }
      };
      // The Rasengan: a blue sphere with a dark rim, a pale shell, a white core and wind streaks spinning around it.
      const sphere = (r: number) => {
        const ball = scene.add.container(0, 0).setDepth(14);
        const swirl = scene.add.graphics();
        swirl.lineStyle(1, 0xfff1e8, 0.9);
        for (let k = 0; k < 3; k++)
          swirl
            .beginPath()
            .arc(0, 0, r * (0.45 + k * 0.2), k * 2.1, k * 2.1 + 2.2)
            .strokePath();
        ball.add([
          scene.add.circle(0, 0, r + 2, 0x29adff, 0.3),
          scene.add.circle(0, 0, r, 0x1d2b53),
          scene.add.circle(0, 0, r - 1, 0x29adff),
          scene.add.circle(-r * 0.2, -r * 0.2, r * 0.55, 0xc2f0ff),
          scene.add.circle(0, 0, r * 0.25, 0xfff1e8),
          swirl,
        ]);
        scene.tweens.add({ targets: swirl, angle: 360, duration: 200, repeat: -1 });
        ball.once('destroy', () => scene.tweens.killTweensOf(swirl));
        return ball;
      };
      const key = p.texture.key;
      floatText(scene, p.x, p.y - 30, 'KAGE BUNSHIN!', '#ffa300');
      foes.forEach((t, i) => {
        // The clones pop out in a row beside him.
        const sx = Phaser.Math.Clamp(p.x + (i % 2 ? 1 : -1) * (10 + Math.floor(i / 2) * 9), 6, W - 6);
        const sy = p.y;
        later(scene, 120 + i * 40, () => {
          poof(sx, sy);
          const clone = scene.add.image(sx, sy, key).setDepth(10);
          const ball = sphere(4);
          const hold = (dir: number) => ball.setPosition(clone.x + dir * 7, clone.y - 1);
          hold(Math.sign(t.x - sx) || 1);
          later(scene, 200 + i * 70, () => {
            if (!t.active) {
              poof(clone.x, clone.y);
              clone.destroy();
              ball.destroy();
              return;
            }
            // Leap: an arc from where it stands to where its enemy is now.
            const dir = Math.sign(t.x - clone.x) || 1;
            clone.setFlipX(dir < 0);
            const [x0, y0] = [clone.x, clone.y];
            const [x1, y1] = [t.x - dir * 8, t.y];
            const [cx, cy] = [(x0 + x1) / 2, Math.min(y0, y1) - 34];
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              duration: 260,
              ease: 'Sine.InOut',
              onUpdate: (tw) => {
                const k = tw.getValue() ?? 0;
                clone.setPosition(...bez(x0, y0, cx, cy, x1, y1, k)).setAngle(dir * k * 360);
                hold(dir);
              },
              onComplete: () => {
                clone.setAngle(0);
                // Driven in: the sphere grinds into the enemy three times, swelling...
                const [bx, by] = [t.active ? t.x : x1 + dir * 8, t.active ? t.y : y1];
                scene.tweens.add({ targets: ball, x: bx, y: by, scale: 2.4, duration: 240 });
                for (let k = 0; k < 3; k++)
                  later(scene, k * 80, () => {
                    if (!t.active) return;
                    world.strike(t, 0.4 * power, 'skill', false, { slow: 600 });
                    sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff, 0xfff1e8], 5, 12);
                    scene.cameras.main.shake(40, 0.005);
                  });
                // ...then bursts in a spiral of wind, and the clone is gone.
                later(scene, 260, () => {
                  ball.destroy();
                  ring(scene, bx, by, 0xc2f0ff, 6, 30, 300, 2);
                  ring(scene, bx, by, 0x29adff, 3, 20, 250, 1);
                  for (let s = 0; s < 10; s++) {
                    const a = (s / 10) * Math.PI * 2;
                    const w = scene.add
                      .rectangle(bx, by, 6, 1, s % 2 ? 0xfff1e8 : 0x29adff)
                      .setRotation(a + 1.2)
                      .setDepth(14);
                    scene.tweens.add({
                      targets: w,
                      x: bx + Math.cos(a) * 22,
                      y: by + Math.sin(a) * 22,
                      angle: w.angle + 120,
                      alpha: 0,
                      duration: 300,
                      onComplete: () => w.destroy(),
                    });
                  }
                  if (t.active) world.strike(t, 1.6 * power, 'skill', true);
                  scene.cameras.main.shake(90, 0.01);
                  poof(clone.x, clone.y);
                  clone.destroy();
                });
              },
            });
          });
        });
      });
      later(scene, 120 + foes.length * 110 + 700, () => p.active && floatText(scene, p.x, p.y - 22, 'DATTEBAYO!', '#ffa300'));
    },
    // Tailed Beast Ball: Kurama rises behind him in orange chakra, gathers black and violet chakra into a ball at its
    // jaws, and fires it across the arena: everything in front is blown apart, the tails lash whatever is behind.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.invuln(2600);
      p.lock(2200);
      p.setVelocity(0, 0);
      const fox = scene.add
        .image(p.x - f * 4, p.y - 22, 'kurama')
        .setFlipX(f < 0)
        .setScale(0)
        .setAlpha(0.85)
        .setDepth(8);
      scene.tweens.add({ targets: fox, scale: 3, duration: 400, ease: 'Back.Out' });
      scene.cameras.main.flash(200, 255, 163, 0);
      floatText(scene, W / 2, 36, 'KURAMA!', '#ffa300');
      for (let i = 0; i < 30; i++)
        later(scene, i * 50, () => {
          const fl = scene.add
            .circle(fox.x + Phaser.Math.Between(-30, 30), fox.y + Phaser.Math.Between(-10, 22), 3, 0xffa300, 0.6)
            .setDepth(8);
          scene.tweens.add({ targets: fl, y: fl.y - 14, scale: 0.3, alpha: 0, duration: 400, onComplete: () => fl.destroy() });
        });
      const mx = p.x + f * 22;
      const my = p.y - 24;
      const ball = scene.add.circle(mx, my, 1, 0x1d0f2e).setStrokeStyle(2, 0x8a3fd1).setDepth(12);
      scene.tweens.add({ targets: ball, radius: 14, duration: 900, delay: 400 });
      for (let i = 0; i < 30; i++)
        later(scene, 400 + i * 30, () => {
          const a = Math.random() * Math.PI * 2;
          const m = scene.add.rectangle(mx + Math.cos(a) * 50, my + Math.sin(a) * 50, 2, 2, i % 3 ? 0x8a3fd1 : 0xfff1e8).setDepth(12);
          scene.tweens.add({ targets: m, x: mx, y: my, duration: 250, onComplete: () => m.destroy() });
        });
      later(scene, 1400, () => {
        floatText(scene, W / 2, 48, 'BIJUDAMA!', '#8a3fd1');
        scene.cameras.main.shake(600, 0.03);
        scene.tweens.add({
          targets: ball,
          x: f > 0 ? W + 30 : -30,
          y: p.y,
          duration: 500,
          ease: 'Quad.In',
          onComplete: () => ball.destroy(),
        });
        for (const t of world.targets(p.x, p.y)) {
          const ahead = Math.sign(t.x - p.x) === f;
          const frac = Phaser.Math.Clamp(Math.abs(t.x - p.x) / W, 0, 1);
          later(scene, ahead ? 150 + frac * 400 : 100, () => {
            if (!t.active) return;
            if (!ahead) return void world.strike(t, 1.5 * power, 'ult', false);
            const blast = scene.add.circle(t.x, t.y, 6, 0x1d0f2e, 0.9).setStrokeStyle(2, 0x8a3fd1).setDepth(13);
            scene.tweens.add({ targets: blast, radius: 34, alpha: 0, duration: 400, onComplete: () => blast.destroy() });
            ring(scene, t.x, t.y, 0xfff1e8, 8, 44, 350, 2);
            world.strike(t, 4 * power, 'ult', true);
          });
        }
        scene.tweens.add({ targets: fox, alpha: 0, delay: 500, duration: 400, onComplete: () => fox.destroy() });
      });
    },
  },

  kusanagi: {
    // Chidori Eiso: the Chidori in his hand stretches into a spear of lightning that lances through every enemy in the
    // line and paralyzes it, crackling as it flickers out.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const y = p.y;
      const len = 150;
      const x0 = p.x + f * 6;
      p.lock(300);
      p.setVelocityX(0);
      const bolt = scene.add.graphics().setDepth(13);
      const draw = () => {
        bolt.clear();
        for (const [w, c] of [
          [3, 0x29adff],
          [1, 0xfff1e8],
        ] as const) {
          bolt.lineStyle(w, c).beginPath().moveTo(x0, y);
          for (let i = 1; i <= 10; i++) bolt.lineTo(x0 + (f * len * i) / 10, y + (i < 10 ? Phaser.Math.Between(-4, 4) : 0));
          bolt.strokePath();
        }
      };
      for (let k = 0; k < 5; k++) later(scene, k * 50, draw);
      scene.tweens.add({ targets: bolt, alpha: 0, delay: 250, duration: 150, onComplete: () => bolt.destroy() });
      sparks(scene, x0, y, [0x29adff, 0xfff1e8], 8, 12);
      scene.cameras.main.shake(120, 0.008);
      for (const t of world.targets(p.x, y)) {
        if (Math.sign(t.x - p.x) !== f || Math.abs(t.x - p.x) > len + 6 || Math.abs(t.y - y) > 16) continue;
        world.strike(t, 2.2 * power, 'skill', true, { freeze: 700 });
        sparks(scene, t.x, t.y, [0x29adff, 0xfff1e8], 6, 14);
      }
    },
    // Kirin: Sasuke shoots a Katon fireball straight up to heat the air, and black thunderclouds roll in over the whole
    // arena, flickering. He raises his hand... and brings it down: the lightning of the sky itself takes the shape of
    // Kirin, a horned beast of thunder that dives out of the clouds onto the thickest crowd of enemies (picked as it
    // dives), tearing through anything in the air on the way. It hits with a blinding pillar that splits the ground,
    // and the discharge forks out of the impact to every other enemy in the arena, paralyzing them.
    fusion: ({ p, world, scene, power }) => {
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
              world.strike(t, 0.8 * power, 'skill', false, { freeze: 600 });
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
            world.area(lx, FLOOR_Y - 14, 52, 2 * power, 220, 'skill', { freeze: 800 });
            // The discharge forks out to every enemy in the arena, one after another.
            world.targets(lx, FLOOR_Y - 8).forEach((t, i) =>
              later(scene, 120 + i * 50, () => {
                if (!t.active) return;
                zap(lx, FLOOR_Y - 10, t.x, t.y);
                world.strike(t, 1.1 * power, 'skill', false, { freeze: 500 });
                sparks(scene, t.x, t.y, [0x29adff, 0xfff1e8], 5, 10);
                cam.shake(40, 0.006);
              }),
            );
          },
        });
      });
    },
    // Indra's Arrow: the complete violet Susanoo rises around him and draws a bow of lightning; the arrow soaks up the
    // chakra of all nine tailed beasts, then looses as a beam of black-violet lightning that splits the arena. Anything
    // off the line is caught by branching bolts.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const { x, y } = p;
      p.invuln(2600);
      p.lock(2200);
      p.setVelocity(0, 0);
      const sus = scene.add.container(x, y).setDepth(7).setAlpha(0);
      sus.add([
        scene.add.triangle(0, -14, 0, 0, -f * 40, -26, -f * 14, 18, 0x8a3fd1, 0.4),
        scene.add.ellipse(0, -10, 44, 58, 0x8a3fd1, 0.35),
        scene.add.circle(0, -44, 11, 0x8a3fd1, 0.5),
        scene.add.rectangle(f * 3, -46, 6, 2, 0xffec27),
      ]);
      scene.tweens.add({ targets: sus, alpha: 1, duration: 400 });
      floatText(scene, W / 2, 36, 'SUSANOO!', '#c080ff');
      const bow = scene.add.graphics().setDepth(12);
      const drawBow = (pull: number) => {
        bow.clear().lineStyle(2, 0xc080ff).beginPath();
        const [tx, ty, bx, by] = [x + f * 16, y - 30, x + f * 16, y + 30];
        bow.moveTo(tx, ty);
        for (let i = 1; i <= 12; i++) bow.lineTo(...bez(tx, ty, x + f * 40, y, bx, by, i / 12));
        bow
          .strokePath()
          .lineStyle(1, 0xfff1e8)
          .beginPath()
          .moveTo(tx, ty)
          .lineTo(x + f * (14 - pull), y)
          .lineTo(bx, by)
          .strokePath();
        bow.lineStyle(2, 0x1d0f2e).lineBetween(x + f * (14 - pull), y, x + f * 44, y);
      };
      scene.tweens.addCounter({ from: 0, to: 18, duration: 900, delay: 300, onUpdate: (tw) => drawBow(tw.getValue() ?? 0) });
      const beasts = [0xff004d, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0x8a3fd1, 0xff77a8, 0xc2c3c7, 0xab5236];
      for (let i = 0; i < 27; i++)
        later(scene, 350 + i * 35, () => {
          const a = Math.random() * Math.PI * 2;
          const m = scene.add.rectangle(x + f * 44 + Math.cos(a) * 60, y + Math.sin(a) * 60, 2, 2, beasts[i % 9]).setDepth(13);
          scene.tweens.add({ targets: m, x: x + f * 44, y, duration: 260, onComplete: () => m.destroy() });
        });
      later(scene, 1400, () => {
        bow.destroy();
        floatText(scene, W / 2, 48, 'INDRA NO YA!', '#c080ff');
        scene.cameras.main.flash(250, 192, 128, 255);
        scene.cameras.main.shake(500, 0.03);
        const x0 = x + f * 20;
        const len = f > 0 ? W - x0 : x0;
        const beam = (
          [
            [34, 0x1d0f2e, 0.8],
            [18, 0x8a3fd1, 0.9],
            [4, 0xfff1e8, 1],
          ] as const
        ).map(([h, c, a]) =>
          scene.add
            .rectangle(x0, y, len, h, c, a)
            .setOrigin(f > 0 ? 0 : 1, 0.5)
            .setScale(0, 1)
            .setDepth(13),
        );
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 120 });
        scene.tweens.add({
          targets: beam,
          scaleY: 0,
          alpha: 0,
          delay: 500,
          duration: 350,
          onComplete: () => beam.forEach((b) => b.destroy()),
        });
        const zap = scene.add.graphics().setDepth(14);
        for (const t of world.targets(x, y)) {
          const inLine = Math.sign(t.x - x) === f && Math.abs(t.y - y) < 30;
          if (inLine) {
            world.strike(t, 5.5 * power, 'ult', true);
            continue;
          }
          // A branch of the arrow's lightning jumps from the beam to everyone else.
          const bx = Phaser.Math.Clamp(t.x, Math.min(x0, x0 + f * len), Math.max(x0, x0 + f * len));
          zap.lineStyle(1, 0xc080ff).beginPath().moveTo(bx, y);
          for (let i = 1; i < 5; i++) zap.lineTo(bx + ((t.x - bx) * i) / 5 + Phaser.Math.Between(-4, 4), y + ((t.y - y) * i) / 5);
          zap.lineTo(t.x, t.y).strokePath();
          world.strike(t, 1.5 * power, 'ult', false, { freeze: 400 });
        }
        scene.tweens.add({ targets: zap, alpha: 0, duration: 400, onComplete: () => zap.destroy() });
        scene.tweens.add({ targets: sus, alpha: 0, delay: 400, duration: 400, onComplete: () => sus.destroy() });
      });
    },
  },

  gravitasi: {
    // Gravity Order: he raises the scepter and commands gravity a hundredfold. A violet field drops over everything
    // around him, pressure columns slam each enemy into the floor, the ground cracks under them and they are crushed
    // again and again, left crawling under the weight.
    skill: ({ p, world, scene, power }) => {
      const R = 110;
      const { x, y } = p;
      const foes = world.targets(x, y).filter((t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) <= R);
      p.lock(450);
      p.setVelocityX(0);
      const field = scene.add.circle(x, y, R, 0x8a3fd1, 0).setStrokeStyle(1, 0xc080ff, 0.8).setDepth(7);
      scene.tweens.add({ targets: field, fillAlpha: 0.18, duration: 120, yoyo: true, hold: 700, onComplete: () => field.destroy() });
      ring(scene, x, y, 0xc080ff, R, 8, 260, 2);
      ring(scene, x, y, 0xfff1e8, R * 0.7, 4, 220);
      // The weight of the order: falling streaks rain down across the whole field.
      for (let i = 0; i < 28; i++)
        later(scene, i * 25, () => {
          const s = scene.add.rectangle(x + Phaser.Math.Between(-R, R), y - R * 0.8, 1, 8, i % 3 ? 0x8a3fd1 : 0xfff1e8).setDepth(12);
          scene.tweens.add({ targets: s, y: FLOOR_Y, scaleY: 2, alpha: 0, duration: 220, ease: 'Quad.In', onComplete: () => s.destroy() });
        });
      world.slam(x, y, R, 520);
      scene.cameras.main.shake(180, 0.012);
      for (const t of foes) {
        // A pressure column drops onto each enemy from the sky.
        const col = scene.add.rectangle(t.x, 0, 14, t.y, 0x8a3fd1, 0.35).setOrigin(0.5, 0).setScale(1, 0).setDepth(11);
        const core = scene.add.rectangle(t.x, 0, 2, t.y, 0xfff1e8, 0.9).setOrigin(0.5, 0).setScale(1, 0).setDepth(11);
        scene.tweens.add({ targets: [col, core], scaleY: 1, duration: 90, ease: 'Quad.In' });
        scene.tweens.add({
          targets: [col, core],
          scaleX: 0,
          alpha: 0,
          delay: 650,
          duration: 200,
          onComplete: () => (col.destroy(), core.destroy()),
        });
      }
      // Crushing ticks; the last one cracks the ground under each enemy.
      for (let k = 0; k < 4; k++)
        later(scene, 120 + k * 160, () => {
          const last = k === 3;
          for (const t of foes) {
            if (!t.active) continue;
            ring(scene, t.x, t.y, 0xc080ff, 14, 3, 140);
            world.strike(t, (last ? 1.4 : 0.6) * power, 'skill', last, { slow: 2500 });
            if (!last) continue;
            rocks(scene, t.x, FLOOR_Y, 4);
            const crack = scene.add.rectangle(t.x, FLOOR_Y, 2, 1, 0x1d0f2e).setDepth(9);
            scene.tweens.add({ targets: crack, scaleX: 14, duration: 90 });
            scene.tweens.add({ targets: crack, alpha: 0, delay: 600, duration: 300, onComplete: () => crack.destroy() });
          }
          if (last) scene.cameras.main.shake(220, 0.02);
        });
    },
    // Black Hole: the sky goes dark and a singularity tears open in front of him. Its accretion disk spins up, light
    // bends around it and every enemy in the arena is dragged into the horizon and ground down; then it collapses
    // and bursts in a flash that hits everything.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const bx = Phaser.Math.Clamp(p.x + p.facing * 80, 50, W - 50);
      const by = FLOOR_Y - 46;
      const LIFE = 2600;
      p.invuln(LIFE + 900);
      p.lock(LIFE + 300);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      cam.flash(150, 138, 63, 209);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x05030a, 0.7)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 400 });
      // His own aura answering the hole.
      const aura = scene.add.circle(p.x, p.y, 12, 0x8a3fd1, 0.25).setStrokeStyle(1, 0xc080ff).setDepth(9);
      scene.tweens.add({ targets: aura, scale: 1.3, alpha: 0.5, duration: 300, yoyo: true, repeat: -1 });
      // Glow, event horizon and photon ring.
      const glow = scene.add.circle(bx, by, 1, 0x8a3fd1, 0.35).setDepth(12);
      const hole = scene.add.circle(bx, by, 1, 0x000000).setStrokeStyle(2, 0xfff1e8).setDepth(14);
      scene.tweens.add({ targets: glow, radius: 34, duration: 600, ease: 'Back.Out' });
      scene.tweens.add({ targets: hole, radius: 16, duration: 600, ease: 'Back.Out' });
      // The accretion disk: hot matter streaming around the horizon, its back half passing behind it.
      const disk = scene.add.graphics().setDepth(15);
      const behind = scene.add.graphics().setDepth(11);
      const spin = scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: LIFE,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const grow = Math.min(1, t * 4);
          disk.clear();
          behind.clear();
          for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2 + t * 40;
            const r = (30 + (i % 3) * 6) * grow;
            const g = Math.sin(a) > 0 ? disk : behind;
            g.fillStyle([0xffa300, 0xffec27, 0xc080ff, 0xfff1e8][i % 4], 0.9).fillRect(
              bx + Math.cos(a) * r,
              by + Math.sin(a) * r * 0.22,
              2,
              1,
            );
          }
        },
      });
      // Light bending: rings close in on the horizon over and over.
      for (let k = 0; k < 8; k++) later(scene, 300 + k * 280, () => ring(scene, bx, by, k % 2 ? 0xc080ff : 0x8a3fd1, 150, 16, 500, 2));
      // Stars and debris from the whole sky spiral in.
      for (let i = 0; i < 70; i++)
        later(scene, 300 + i * 30, () => {
          const a0 = Math.random() * Math.PI * 2;
          const r0 = Phaser.Math.Between(90, 200);
          const m = scene.add.rectangle(0, 0, 2, 1, [0xfff1e8, 0xc080ff, 0xffa300][i % 3]).setDepth(12);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 700,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              const t = tw.getValue() ?? 0;
              const a = a0 + t * 5;
              m.setPosition(bx + Math.cos(a) * r0 * (1 - t), by + Math.sin(a) * r0 * (1 - t) * 0.6).setRotation(a + Math.PI / 2);
            },
            onComplete: () => m.destroy(),
          });
        });
      // The pull: every enemy on the map (bosses are too massive to move) is dragged in and ground at the horizon.
      for (let k = 0; k < 20; k++)
        later(scene, 400 + k * 100, () => {
          world.pull(bx, by, 9999, 300);
          if (k % 2) cam.shake(100, 0.006);
          if (k % 3 === 0) world.area(bx, by, 34, 0.5 * power, 0, 'ult', { slow: 800 });
        });
      // Collapse and burst.
      later(scene, LIFE, () => {
        spin.stop();
        disk.destroy();
        behind.destroy();
        scene.tweens.add({ targets: [hole, glow], radius: 1, duration: 160, ease: 'Quad.In' });
      });
      later(scene, LIFE + 180, () => {
        hole.destroy();
        glow.destroy();
        scene.tweens.killTweensOf(aura);
        aura.destroy();
        floatText(scene, W / 2, 48, 'COLLAPSE!', '#fff1e8');
        cam.flash(300, 255, 241, 232);
        cam.shake(500, 0.035);
        ring(scene, bx, by, 0xfff1e8, 4, 220, 600, 3);
        ring(scene, bx, by, 0x8a3fd1, 4, 160, 500, 4);
        sparks(scene, bx, by, [0xfff1e8, 0xc080ff, 0xffa300], 30, 90);
        for (const t of world.targets(bx, by)) world.strike(t, 4 * power, 'ult', true);
        world.area(bx, by, 60, 1 * power, 260, 'ult');
        scene.tweens.add({ targets: dark, alpha: 0, duration: 500, onComplete: () => dark.destroy() });
      });
    },
  },
};
