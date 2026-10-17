import Phaser from 'phaser';
import { FLOOR_Y, H, W } from './ui.ts';

/** 2x2 checker dither of `color` over the band y0..y1 (a pixel-art gradient step between two sky colors). */
function dither(g: Phaser.GameObjects.Graphics, color: number, y0: number, y1: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  for (let y = y0; y < y1; y += 2) for (let x = (y / 2) % 2 ? 0 : 2; x < W; x += 4) g.fillRect(x, y, 2, 2);
}

/** A ridge of mountains: each 2 px column rises to a height from layered sines plus a little jag. */
function ridge(base: number, amp: number, freq: number, phase: number, jag: number): number[] {
  return Array.from({ length: W / 2 + 1 }, (_, i) => {
    const x = i * 2;
    const s = Math.sin(x * freq + phase) * 0.55 + Math.sin(x * freq * 2.3 + phase * 1.7) * 0.3 + Math.sin(x * freq * 5.1) * 0.15;
    return Math.round(base - (s + 1) * amp - Phaser.Math.Between(0, jag));
  });
}

/**
 * The night the whole game is fought under, baked once into the 'bg' texture: a deep sky graded in dithered bands
 * down to a wine-red glow on the horizon, the Milky Way across it, stars, a big moon with its craters and halo, far
 * blue mountains with snow on their peaks, a castle on a crag with lit windows, the old magenta ridge with moonlit
 * edges, and black hills with a pine forest in front. Mist lies in the valleys.
 */
export function bakeScenery(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // The sky, darkest at the top.
  const bands: [number, number][] = [
    [0x07061a, 0],
    [0x0f0d2e, 34],
    [0x1d2b53, 66],
    [0x3a2a5c, 98],
    [0x5a1f3a, 118],
  ];
  bands.forEach(([c, y], i) => {
    g.fillStyle(c).fillRect(0, y, W, H - y);
    if (i) dither(g, c, y - 10, y);
  });
  // The Milky Way: a faint band of dust and crowded small stars sweeping across the sky.
  for (let i = 0; i < 260; i++) {
    const t = Math.random();
    const x = t * W;
    const y = 8 + t * 46 + Phaser.Math.Between(-9, 9) * Math.random();
    g.fillStyle(i % 3 ? 0x2b2f6b : 0x83769c, i % 3 ? 0.5 : 0.7).fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  // Stars: dim ones, bright ones, and a few big ones with a cross of light.
  for (let i = 0; i < 70; i++) g.fillStyle(0x83769c).fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, 100), 1, 1);
  for (let i = 0; i < 22; i++) g.fillStyle(0xfff1e8).fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, 80), 1, 1);
  for (let i = 0; i < 5; i++) {
    const [x, y] = [Phaser.Math.Between(10, W - 70), Phaser.Math.Between(6, 60)];
    g.fillStyle(0xc2c3c7, 0.6)
      .fillRect(x - 2, y, 5, 1)
      .fillRect(x, y - 2, 1, 5);
    g.fillStyle(0xfff1e8).fillRect(x, y, 1, 1);
  }
  // The moon: a soft halo in rings, the disc, its shaded limb and craters.
  const [mx, my, mr] = [262, 34, 13];
  for (const [r, a] of [
    [34, 0.05],
    [26, 0.07],
    [19, 0.1],
  ] as const)
    g.fillStyle(0xc2f0ff, a).fillCircle(mx, my, r);
  g.fillStyle(0xfff1e8).fillCircle(mx, my, mr);
  g.fillStyle(0xe6dccb).fillCircle(mx + 3, my + 2, mr - 2);
  g.fillStyle(0xfff1e8).fillCircle(mx - 2, my - 2, mr - 4);
  g.fillStyle(0xc2c3c7);
  for (const [cx, cy, r] of [
    [-4, 2, 3],
    [4, -4, 2],
    [5, 5, 2],
    [-1, -6, 1],
  ] as const)
    g.fillCircle(mx + cx, my + cy, r);

  // Far mountains, cold blue: a range of sharp peaks, their left faces in shadow (the moon is on the right), snow
  // on the high ones. The ground under them is filled down to the bottom.
  const far = new Array<number>(W + 1).fill(112);
  const peaks: [number, number][] = [];
  for (let x = -20; x < W + 20; x += Phaser.Math.Between(26, 44)) peaks.push([x, Phaser.Math.Between(62, 96)]);
  for (const [px, top] of peaks) {
    const half = (112 - top) * 1.15;
    for (let x = Math.max(0, Math.ceil(px - half)); x <= Math.min(W, px + half); x++)
      far[x] = Math.min(far[x], Math.round(top + (Math.abs(x - px) / half) * (112 - top)));
  }
  far.forEach((top, x) => g.fillStyle(0x2b2f6b).fillRect(x, top, 1, H - top));
  for (const [px, top] of peaks) {
    const half = (112 - top) * 1.15;
    const k = half / (112 - top);
    // The shaded left face.
    g.fillStyle(0x1d2b53).fillTriangle(px, top, px - half, 112, px - half * 0.15, 112);
    if (top > 84) continue;
    // Snow: a cap with a ragged lower edge, lit on the right.
    const d = Math.min(12, 86 - top);
    g.fillStyle(0xc2c3c7).fillTriangle(px, top, px - d * k, top + d, px + d * k, top + d);
    g.fillStyle(0xfff1e8).fillTriangle(px, top, px + 1, top + d, px + d * k, top + d);
    g.fillStyle(0x2b2f6b);
    for (let i = -2; i <= 2; i++)
      g.fillTriangle(px + i * d * k * 0.4 - 2, top + d + 1, px + i * d * k * 0.4 + 2, top + d + 1, px + i * d * k * 0.4, top + d - 2);
  }
  dither(g, 0x1d2b53, 100, 112, 0.6);

  // A castle on a crag, far off on the left: towers, battlements, lit windows.
  const [cx, cy] = [58, Math.min(...far.slice(44, 76)) + 2];
  g.fillStyle(0x141030);
  g.fillTriangle(cx - 22, cy + 16, cx + 24, cy + 16, cx + 2, cy - 2);
  g.fillRect(cx - 12, cy - 8, 24, 12);
  for (const [tx, th] of [
    [-14, 18],
    [-3, 26],
    [9, 20],
  ] as const) {
    g.fillRect(cx + tx, cy - th, 5, th);
    g.fillTriangle(cx + tx - 1, cy - th, cx + tx + 6, cy - th, cx + tx + 2.5, cy - th - 6);
  }
  for (let x = cx - 12; x < cx + 12; x += 3) g.fillRect(x, cy - 10, 2, 2);
  g.fillStyle(0xffec27);
  for (const [wx, wy] of [
    [-12, -12],
    [-1, -18],
    [-1, -10],
    [11, -14],
    [5, -4],
  ] as const)
    g.fillRect(cx + wx, cy + wy, 1, 2);

  // The magenta ridge, lit along its crest by the moon.
  const mid = ridge(138, 16, 0.024, 1, 1);
  mid.forEach((top, i) => {
    g.fillStyle(0x7e2553).fillRect(i * 2, top, 2, H - top);
    g.fillStyle(0xb34a7a).fillRect(i * 2, top, 2, 1);
  });
  // Mist in the valley in front of it.
  for (const [y, a] of [
    [128, 0.08],
    [134, 0.12],
    [140, 0.08],
  ] as const)
    g.fillStyle(0xc2c3c7, a).fillRect(0, y, W, 4);

  // Black hills and the pine forest on them.
  const near = ridge(160, 8, 0.035, 4, 0);
  near.forEach((top, i) => g.fillStyle(0x000000).fillRect(i * 2, top, 2, H - top));
  for (let x = 2; x < W; x += Phaser.Math.Between(5, 11)) {
    const base = near[Math.min(near.length - 1, Math.round(x / 2))] + 2;
    const h = Phaser.Math.Between(8, 18);
    g.fillStyle(0x000000).fillTriangle(x - h * 0.3, base, x + h * 0.3, base, x, base - h);
    g.fillTriangle(x - h * 0.24, base - h * 0.4, x + h * 0.24, base - h * 0.4, x, base - h - 2);
    // The moon catches the right edge of each pine.
    g.fillStyle(0x2b2f6b).fillRect(x + 1, base - h + 3, 1, Math.max(2, h * 0.3));
  }
  g.generateTexture('bg', W, H);
  g.destroy();
}

export interface AmbienceOpts {
  /** Fireflies drifting over the ground (default on). */
  fireflies?: boolean;
}

/**
 * The living part of the night, over the baked 'bg' and under everything else: stars that twinkle, slow clouds lit by
 * the moon, a shooting star now and then, and fireflies over the grass. Everything sits at depth 0.5-1.9, behind the
 * ground and platforms (2) and every fighter.
 */
export function ambience(scene: Phaser.Scene, opts: AmbienceOpts = {}): void {
  // Twinkling stars.
  for (let i = 0; i < 14; i++) {
    const s = scene.add.rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(2, 90), 1, 1, 0xfff1e8).setDepth(0.5).setAlpha(0);
    scene.tweens.add({
      targets: s,
      alpha: 1,
      duration: Phaser.Math.Between(500, 1200),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 3000),
      repeatDelay: Phaser.Math.Between(500, 3000),
    });
  }
  // Clouds: a dark body with a moonlit top edge, drifting across and around again.
  for (let i = 0; i < 4; i++) {
    const g = scene.add.graphics();
    const w = Phaser.Math.Between(40, 70);
    const lobes = Array.from({ length: 5 }, (_, k) => ({ x: (k / 4) * w - w / 2, r: Phaser.Math.Between(5, 9) }));
    for (const l of lobes) g.fillStyle(0x1d2b53, 0.75).fillCircle(l.x, 0, l.r);
    g.fillStyle(0x1d2b53, 0.75).fillRect(-w / 2, 0, w, 6);
    for (const l of lobes) g.fillStyle(0x83769c, 0.5).fillRect(l.x - l.r * 0.6, -l.r, l.r * 1.2, 1);
    const y = Phaser.Math.Between(18, 70);
    const c = scene.add
      .container(Phaser.Math.Between(-40, W + 40), y, [g])
      .setDepth(0.6)
      .setAlpha(0.8);
    const speed = Phaser.Math.FloatBetween(2, 5);
    const drift = () => {
      c.x += (speed * scene.game.loop.delta) / 1000;
      if (c.x > W + w) c.x = -w;
    };
    scene.events.on('update', drift);
    scene.events.once('shutdown', () => scene.events.off('update', drift));
  }
  // Now and then a shooting star.
  const shoot = () => {
    const [x, y] = [Phaser.Math.Between(20, W - 60), Phaser.Math.Between(6, 50)];
    const s = scene.add.rectangle(x, y, 10, 1, 0xfff1e8).setRotation(0.35).setDepth(0.7).setAlpha(0);
    scene.tweens.add({
      targets: s,
      x: x + 46,
      y: y + 17,
      alpha: { from: 1, to: 0 },
      scaleX: 0.3,
      duration: 650,
      onComplete: () => s.destroy(),
    });
    scene.time.delayedCall(Phaser.Math.Between(5000, 11000), shoot);
  };
  scene.time.delayedCall(Phaser.Math.Between(1500, 5000), shoot);
  if (opts.fireflies === false) return;
  // Fireflies over the grass, wandering and pulsing.
  for (let i = 0; i < 9; i++) {
    const f = scene.add
      .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(FLOOR_Y - 40, FLOOR_Y - 6), 1, 1, i % 3 ? 0xd8ff6a : 0xffec27)
      .setDepth(1.9);
    const [x0, y0] = [f.x, f.y];
    const ph = Math.random() * Math.PI * 2;
    const wander = () => {
      const t = scene.time.now / 1000;
      f.setPosition(x0 + Math.sin(t * 0.4 + ph) * 18, y0 + Math.sin(t * 0.9 + ph * 2) * 6);
      f.setAlpha(0.25 + 0.75 * Math.max(0, Math.sin(t * 2.2 + ph)));
    };
    scene.events.on('update', wander);
    scene.events.once('shutdown', () => scene.events.off('update', wander));
  }
}

/**
 * The grass along the top of the arena floor: tufts of blades in two greens, little flowers (white, pink, yellow) on
 * stems, and a few pebbles, scattered once per round at depth 2.1 (over the ground tiles, behind every fighter).
 */
export function groundDecor(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(2.1);
  for (let x = Phaser.Math.Between(0, 6); x < W; x += Phaser.Math.Between(4, 13)) {
    const roll = Math.random();
    if (roll < 0.55) {
      // A tuft: three blades leaning a little apart.
      for (const [dx, h, c] of [
        [-1, 2, 0x008751],
        [0, 3, 0x00e436],
        [1, 2, 0x008751],
      ] as const)
        g.fillStyle(c).fillRect(x + dx, FLOOR_Y - h, 1, h);
    } else if (roll < 0.85) {
      // A flower on its stem.
      const h = Phaser.Math.Between(3, 5);
      g.fillStyle(0x008751).fillRect(x, FLOOR_Y - h, 1, h);
      const petal = Phaser.Utils.Array.GetRandom([0xfff1e8, 0xff77a8, 0xffec27, 0xc2f0ff]);
      g.fillStyle(petal)
        .fillRect(x - 1, FLOOR_Y - h - 1, 3, 1)
        .fillRect(x, FLOOR_Y - h - 2, 1, 3);
      g.fillStyle(0xffa300).fillRect(x, FLOOR_Y - h - 1, 1, 1);
    } else {
      // A pebble.
      g.fillStyle(0x5f574f).fillRect(x, FLOOR_Y - 1, 3, 1);
      g.fillStyle(0xc2c3c7).fillRect(x, FLOOR_Y - 2, 2, 1);
    }
  }
}
