import Phaser from 'phaser';
import { COLOR } from './sprites.ts';

export const W = 320;
export const H = 180;
export const TILE = 8;
export const FLOOR_Y = 21 * TILE;
export const FONT = '"Press Start 2P", monospace';

export function text(scene: Phaser.Scene, x: number, y: number, s: string, color = COLOR.text, size = 8): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color }).setDepth(100);
}

/** Brief solid-color flash, then back to the sprite's normal tint. */
export function flash(sprite: Phaser.GameObjects.Sprite, color = 0xffffff, baseTint = 0xffffff): void {
  sprite.setTint(color).setTintMode(Phaser.TintModes.FILL);
  sprite.scene.time.delayedCall(70, () => sprite.active && sprite.setTint(baseTint).setTintMode(Phaser.TintModes.MULTIPLY));
}

export function floatText(scene: Phaser.Scene, x: number, y: number, s: string, color = COLOR.text): void {
  const t = text(scene, x, y, s, color).setOrigin(0.5);
  scene.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 600, onComplete: () => t.destroy() });
}

/** Square pixel debris flying outward. */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, count = 8): void {
  for (let i = 0; i < count; i++) {
    const p = scene.add.rectangle(x, y, 2, 2, color).setDepth(50);
    const a = (i / count) * Math.PI * 2;
    const d = Phaser.Math.Between(8, 18);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      duration: 400,
      onComplete: () => p.destroy(),
    });
  }
}
