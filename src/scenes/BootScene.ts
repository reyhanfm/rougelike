import Phaser from 'phaser';
import { LEGS, PALETTE, SPRITES } from '../gfx/sprites.ts';
import { bakeScenery } from '../gfx/scenery.ts';
import { CLASSES, CLASS_IDS } from '../logic/classes.ts';

export const HERO_FRAMES = ['idle', 'run0', 'run1', 'jump'] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    for (const [key, rows] of Object.entries(SPRITES)) this.bake(key, rows);
    // Hero frames per class: its own head and torso (or the shared one, recolored: blue clothes take the class color,
    // rows 1-3 the hair color), and its own costume below the waist.
    for (const cls of CLASS_IDS) {
      const { color, hair = color, head, legs } = CLASSES[cls];
      for (const frame of HERO_FRAMES) {
        const lower = LEGS[legs.kind][frame].map((r) => r.replaceAll('P', legs.pant).replaceAll('B', legs.boot));
        this.bake(
          `hero_${frame}_${cls}`,
          SPRITES[`hero_${frame}`].map((r, y) => (lower[y - 11] ?? head?.[y] ?? r).replaceAll('c', y >= 1 && y <= 3 ? hair : color)),
        );
      }
    }
    bakeScenery(this);
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
}
