import Phaser from 'phaser';
import { PALETTE, SPRITES } from '../gfx/sprites.ts';
import { H, W } from '../gfx/ui.ts';
import { CLASSES, CLASS_IDS } from '../logic/classes.ts';

export const HERO_FRAMES = ['idle', 'run0', 'run1', 'jump'] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    for (const [key, rows] of Object.entries(SPRITES)) this.bake(key, rows);
    // Hero frames recolored per class: the blue clothes take the class color.
    for (const cls of CLASS_IDS) {
      for (const frame of HERO_FRAMES) {
        this.bake(
          `hero_${frame}_${cls}`,
          SPRITES[`hero_${frame}`].map((r) => r.replaceAll('c', CLASSES[cls].color)),
        );
      }
    }
    this.bakeBackground();
    this.scene.start('hub');
  }

  private bake(key: string, rows: string[]): void {
    const g = this.add.graphics();
    rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === '.') return;
        g.fillStyle(PALETTE[c]);
        g.fillRect(x, y, 1, 1);
      }),
    );
    g.generateTexture(key, rows[0].length, rows.length);
    g.destroy();
  }

  /** Night sky with a dithered horizon and two mountain silhouettes. */
  private bakeBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
    g.fillStyle(0x1d2b53).fillRect(0, 90, W, H - 90);
    // 2x2 checker dither between the two sky bands.
    for (let y = 70; y < 90; y += 2) for (let x = (y / 2) % 2 ? 0 : 2; x < W; x += 4) g.fillRect(x, y, 2, 2);
    g.fillStyle(0x83769c);
    for (let i = 0; i < 40; i++) g.fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, 80), 1, 1);
    g.fillStyle(0xfff1e8);
    for (let i = 0; i < 10; i++) g.fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, 60), 1, 1);
    const ridge = (color: number, base: number, amp: number, freq: number, phase: number) => {
      g.fillStyle(color);
      for (let x = 0; x < W; x += 4) {
        const top = base - Math.round((Math.sin(x * freq + phase) * 0.6 + Math.sin(x * freq * 2.7) * 0.4 + 1) * amp);
        g.fillRect(x, top, 4, H - top);
      }
    };
    ridge(0x7e2553, 130, 18, 0.02, 1);
    ridge(0x000000, 155, 10, 0.035, 4);
    g.generateTexture('bg', W, H);
    g.destroy();
  }
}
