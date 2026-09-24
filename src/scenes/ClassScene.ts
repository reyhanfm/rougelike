import Phaser from 'phaser';
import { COLOR } from '../gfx/sprites.ts';
import { text, W } from '../gfx/ui.ts';
import { CLASS_IDS, CLASSES } from '../logic/classes.ts';
import { WEAPONS, type WeaponId } from '../logic/loot.ts';
import { loadSave, writeSave } from '../logic/save.ts';
import type { RunData } from './RunScene.ts';

const ROW_Y = 23;
const ROW_H = 13;

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

    this.markers = [];
    this.names = [];
    CLASS_IDS.forEach((id, i) => {
      const c = CLASSES[id];
      const y = ROW_Y + i * ROW_H;
      this.markers.push(text(this, 20, y + 2, '>', COLOR.gold));
      this.add.image(38, y + 6, `hero_idle_${id}`).setDepth(100);
      this.names.push(
        text(this, 52, y + 2, c.name)
          .setInteractive({ useHandCursor: true })
          // First tap selects (shows traits), tapping the selected class starts.
          .on('pointerdown', () => {
            if (this.selected === i) return this.start();
            this.selected = i;
            this.refresh();
          }),
      );
      const icon = this.add.image(170, y + 6, `w_${c.weapon}`).setDepth(100);
      // Tall icons (bow) would touch the next row.
      icon.setScale(Math.min(1, 11 / icon.height));
      text(this, 190, y + 2, WEAPONS[c.weapon].name, COLOR.gray);
    });

    const wrap = { width: W - 30 };
    this.trait = text(this, 16, 116, '', COLOR.text).setWordWrapWidth(wrap.width).setLineSpacing(3);
    this.synergyTitle = text(this, 16, 137, '', COLOR.gold);
    this.synergyDesc = text(this, 16, 148, '', COLOR.blue).setWordWrapWidth(wrap.width).setLineSpacing(3);
    text(this, W / 2, 171, 'W/S PILIH  J MULAI  ESC KEMBALI', COLOR.gray).setOrigin(0.5, 0);

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
    this.synergyTitle.setText(`SINERGI (${WEAPONS[c.weapon].name}): ${c.synergy.name}`);
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
