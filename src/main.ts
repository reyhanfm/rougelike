import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { ClassScene } from './scenes/ClassScene.ts';
import { HubScene } from './scenes/HubScene.ts';
import { RunScene } from './scenes/RunScene.ts';
import { H, W } from './gfx/ui.ts';
import { isTouchDevice, mountTouchControls } from './touch.ts';

// Text is rasterized once at creation, so wait for the pixel font (offline: monospace fallback).
await Promise.race([document.fonts.load('8px "Press Start 2P"'), new Promise((r) => setTimeout(r, 2000))]).catch(() => undefined);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: W,
  height: H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 600 }, debug: false },
  },
  scene: [BootScene, HubScene, ClassScene, RunScene],
});

if (isTouchDevice()) mountTouchControls(game);

if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
