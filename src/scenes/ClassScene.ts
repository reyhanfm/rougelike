import Phaser from 'phaser';
import { COLOR } from '../gfx/sprites.ts';
import { text, W } from '../gfx/ui.ts';
import { CLASS_IDS, CLASSES } from '../logic/classes.ts';
import { WEAPONS, type WeaponId } from '../logic/loot.ts';
import { DASHES } from '../entities/dashes.ts';
import { loadSave, writeSave } from '../logic/save.ts';
import { isTouchDevice } from '../touch.ts';
import { onPadChange, padConnected } from '../gamepad.ts';
import { playMusic, sfx, toggleSound } from '../audio.ts';
import type { RunData } from './RunScene.ts';

const ROW_Y = 20;
const ROW_H = 9;
const COLS = 3;
const CELL_W = 105;

/** Pick a class before each run. Its weapon is the starting weapon and unlocks the synergy. */
export class ClassScene extends Phaser.Scene {
  private selected = 0;
  private markers: Phaser.GameObjects.Rectangle[] = [];
  private names: Phaser.GameObjects.Text[] = [];
  private trait!: Phaser.GameObjects.Text;
  private passiveTitle!: Phaser.GameObjects.Text;
  private passiveDesc!: Phaser.GameObjects.Text;
  private dash!: Phaser.GameObjects.Text;
  private synergyTitle!: Phaser.GameObjects.Text;
  private synergyDesc!: Phaser.GameObjects.Text;

  constructor() {
    super('class');
  }

  create(): void {
    this.selected = Math.max(0, CLASS_IDS.indexOf(loadSave().cls));
    playMusic('hub');
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
      const x = (i % COLS) * CELL_W + 3;
      const y = ROW_Y + Math.floor(i / COLS) * ROW_H;
      this.add.rectangle(x + 51, y + 4.5, 102, 9, 0x1d2b53, 0.7);
      this.markers.push(
        this.add
          .rectangle(x + 51, y + 4.5, 102, 9)
          .setStrokeStyle(1, 0xffec27)
          .setDepth(101),
      );
      this.add
        .image(x + 8, y + 4.5, `hero_idle_${id}`)
        .setScale(0.6)
        .setDepth(100);
      this.names.push(text(this, x + 16, y + 1, c.name, COLOR.text, 7));
      this.add
        .zone(x + 51, y + 4.5, 102, 9)
        .setDepth(110)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.selected === i) return this.start();
          this.selected = i;
          this.refresh();
        });
    });

    const wrap = { width: W - 30 };
    // Stacked under each other in refresh(): each block starts right below the one before.
    this.trait = text(this, 16, 102, '', COLOR.text, 6).setWordWrapWidth(wrap.width).setLineSpacing(2);
    this.passiveTitle = text(this, 16, 0, '', '#ff77a8', 7).setWordWrapWidth(wrap.width);
    this.passiveDesc = text(this, 16, 0, '', COLOR.text, 6).setWordWrapWidth(wrap.width).setLineSpacing(2);
    this.dash = text(this, 16, 0, '', '#00e436', 6).setWordWrapWidth(wrap.width);
    this.synergyTitle = text(this, 16, 0, '', COLOR.gold, 6).setWordWrapWidth(wrap.width).setLineSpacing(2);
    this.synergyDesc = text(this, 16, 0, '', COLOR.blue, 6).setWordWrapWidth(wrap.width).setLineSpacing(2);
    const hint = text(this, W / 2, 173, '', COLOR.gray, 6).setOrigin(0.5, 0);
    onPadChange(this, () =>
      hint.setText(
        padConnected()
          ? 'D-PAD PILIH  A MULAI  B KEMBALI'
          : isTouchDevice()
            ? 'KETUK KELAS 2X UNTUK MULAI'
            : 'WASD PILIH  J MULAI  ESC KEMBALI',
      ),
    );

    const kb = this.input.keyboard!;
    kb.on('keydown-W', () => this.move(-COLS));
    kb.on('keydown-UP', () => this.move(-COLS));
    kb.on('keydown-S', () => this.move(COLS));
    kb.on('keydown-DOWN', () => this.move(COLS));
    kb.on('keydown-A', () => this.move(-1));
    kb.on('keydown-LEFT', () => this.move(-1));
    kb.on('keydown-D', () => this.move(1));
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-J', () => this.start());
    kb.on('keydown-ENTER', () => this.start());
    kb.on('keydown-ESC', () => {
      sfx('back');
      this.scene.start('hub');
    });
    kb.on('keydown-M', () => toggleSound());
    this.refresh();
  }

  private move(d: number): void {
    this.selected = Phaser.Math.Wrap(this.selected + d, 0, CLASS_IDS.length);
    sfx('move');
    this.refresh();
  }

  private refresh(): void {
    const c = CLASSES[CLASS_IDS[this.selected]];
    this.markers.forEach((m, i) => m.setVisible(i === this.selected));
    this.names.forEach((n, i) => n.setColor(i === this.selected ? COLOR.gold : COLOR.text));
    this.trait.setText(`SIFAT: ${c.trait}`);
    this.passiveTitle.setText(`PASIF: ${c.passive.name}`);
    this.passiveDesc.setText(c.passive.desc);
    this.dash.setText(`DASH (${padConnected() ? 'B' : 'K'}): ${DASHES[CLASS_IDS[this.selected]].name}`);
    this.synergyTitle.setText(`SINERGI (${WEAPONS[c.weapon].name}): ${c.synergy.name}`);
    this.synergyDesc.setText(c.synergy.desc);
    // Long texts wrap; each block follows right under the one before.
    const stack = [this.trait, this.passiveTitle, this.passiveDesc, this.dash, this.synergyTitle, this.synergyDesc];
    for (let i = 1; i < stack.length; i++) {
      const prev = stack[i - 1];
      stack[i].setY(prev.y + prev.height + (i === 1 || i === 3 || i === 4 ? 3 : 1));
    }
  }

  private start(): void {
    sfx('confirm');
    const cls = CLASS_IDS[this.selected];
    const save = loadSave();
    save.cls = cls;
    writeSave(save);
    // Dev shortcuts: ?round=10 jumps to a boss, ?weapon=busur overrides the class weapon, ?mahoraga / ?leviathan / ?godzilla / ?kaguya (any mix) force the bonus round, ?elite an elite round, ?invade=<boss> an invasion.
    const q = new URLSearchParams(import.meta.env.DEV ? location.search : '');
    const weapon = q.get('weapon');
    this.scene.start('run', {
      round: Number(q.get('round')) || 1,
      cls,
      weapon: weapon && weapon in WEAPONS ? (weapon as WeaponId) : undefined,
      specials: (['mahoraga', 'leviathan', 'godzilla', 'kaguya'] as const).filter((k) => q.has(k)),
      eliteRound: q.has('elite'),
      // ?invade=godzilla: that hidden boss crashes into the round.
      invasion: (['mahoraga', 'leviathan', 'godzilla', 'kaguya'] as const).find((k) => q.get('invade') === k),
    } satisfies RunData);
  }
}
