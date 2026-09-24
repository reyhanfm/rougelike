import Phaser from 'phaser';
import { COLOR } from '../gfx/sprites.ts';
import { text, W } from '../gfx/ui.ts';
import { CLASS_IDS, CLASSES } from '../logic/classes.ts';
import { WEAPONS, type WeaponId } from '../logic/loot.ts';
import { loadSave, writeSave } from '../logic/save.ts';
import { isTouchDevice } from '../touch.ts';
import type { RunData } from './RunScene.ts';

const ROW_Y = 25;
const ROW_H = 22;

/** Pick a class before each run. Its weapon is the starting weapon and unlocks the synergy. */
export class ClassScene extends Phaser.Scene {
  private selected = 0;
  private markers: Phaser.GameObjects.Text[] = [];
  private names: Phaser.GameObjects.Text[] = [];
  private trait!: Phaser.GameObjects.Text;
  private synergyTitle!: Phaser.GameObjects.Text;
  private synergyDesc!: Phaser.GameObjects.Text;

  constructor() {
    super('class');
  }

  create(): void {
    this.selected = Math.max(0, CLASS_IDS.indexOf(loadSave().cls));
    this.add.image(0, 0, 'bg').setOrigin(0).setAlpha(0.6);
    text(this, W / 2, 4, 'PILIH KELAS', COLOR.gold, 16).setOrigin(0.5, 0);

    text(this, 4, 4, '<', COLOR.gray)
      .setPadding(4)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('hub'));
    this.markers = [];
    this.names = [];
    CLASS_IDS.forEach((id, i) => {
      const c = CLASSES[id];
      const x = (i % 2) * 156 + 4;
      const y = ROW_Y + Math.floor(i / 2) * ROW_H;
      this.add.rectangle(x + 76, y + 9, 150, 20, 0x1d2b53, 0.7);
      this.markers.push(text(this, x + 2, y + 5, '>', COLOR.gold));
      this.add.image(x + 22, y + 8, `hero_idle_${id}`).setDepth(100);
      this.names.push(text(this, x + 34, y + 1, c.name));
      text(this, x + 34, y + 12, WEAPONS[c.weapon].name, COLOR.gray, 6);
      this.add
        .zone(x + 76, y + 9, 150, 20)
        .setDepth(110)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.selected === i) return this.start();
          this.selected = i;
          this.refresh();
        });
    });

    const wrap = { width: W - 30 };
    this.trait = text(this, 16, 116, '', COLOR.text).setWordWrapWidth(wrap.width).setLineSpacing(3);
    this.synergyTitle = text(this, 16, 139, '', COLOR.gold, 7);
    this.synergyDesc = text(this, 16, 150, '', COLOR.blue, 7).setWordWrapWidth(wrap.width).setLineSpacing(3);
    text(this, W / 2, 173, isTouchDevice() ? 'KETUK KELAS 2X UNTUK MULAI' : 'W/S PILIH  J MULAI  ESC KEMBALI', COLOR.gray, 6).setOrigin(
      0.5,
      0,
    );

    const kb = this.input.keyboard!;
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-J', () => this.start());
    kb.on('keydown-ENTER', () => this.start());
    kb.on('keydown-ESC', () => this.scene.start('hub'));
    this.refresh();
  }

  private move(d: number): void {
    this.selected = Phaser.Math.Wrap(this.selected + d, 0, CLASS_IDS.length);
    this.refresh();
  }

  private refresh(): void {
    const c = CLASSES[CLASS_IDS[this.selected]];
    this.markers.forEach((m, i) => m.setVisible(i === this.selected));
    this.names.forEach((n, i) => n.setColor(i === this.selected ? COLOR.gold : COLOR.text));
    this.trait.setText(`SIFAT: ${c.trait}`);
    this.synergyTitle.setText(`SINERGI: ${c.synergy.name}`);
    this.synergyDesc.setText(c.synergy.desc);
  }

  private start(): void {
    const cls = CLASS_IDS[this.selected];
    const save = loadSave();
    save.cls = cls;
    writeSave(save);
    // Dev shortcuts: ?round=10 jumps to a boss, ?weapon=busur overrides the class weapon.
    const q = new URLSearchParams(import.meta.env.DEV ? location.search : '');
    const weapon = q.get('weapon');
    this.scene.start('run', {
      round: Number(q.get('round')) || 1,
      cls,
      weapon: weapon && weapon in WEAPONS ? (weapon as WeaponId) : undefined,
    } satisfies RunData);
  }
}
