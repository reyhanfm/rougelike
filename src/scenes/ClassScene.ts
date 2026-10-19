import Phaser from 'phaser';
import { ambience } from '../gfx/scenery.ts';
import { COLOR } from '../gfx/sprites.ts';
import { text, W } from '../gfx/ui.ts';
import { CLASS_IDS, CLASSES } from '../logic/classes.ts';
import { ITEM_IDS, ITEMS, WEAPONS, type ItemId, type Rarity, type WeaponId } from '../logic/loot.ts';
import { DASHES } from '../entities/dashes.ts';
import { CHARGED } from '../entities/charged/index.ts';
import { loadSave, writeSave } from '../logic/save.ts';
import { isTouchDevice } from '../touch.ts';
import { onPadChange, padConnected } from '../gamepad.ts';
import { playMusic, sfx, toggleSound } from '../audio.ts';
import type { RunData } from './RunScene.ts';

const ROW_Y = 20;
const ROW_H = 6;
const COLS = 3;
const CELL_W = 105;
/** The class info starts right under the grid. */
const INFO_Y = ROW_Y + Math.ceil(CLASS_IDS.length / COLS) * ROW_H + 2;

/** Pick a class before each run. Its weapon is the starting weapon and unlocks the synergy. */
export class ClassScene extends Phaser.Scene {
  private selected = 0;
  private markers: Phaser.GameObjects.Rectangle[] = [];
  private names: Phaser.GameObjects.Text[] = [];
  private trait!: Phaser.GameObjects.Text;
  private passiveTitle!: Phaser.GameObjects.Text;
  private passiveDesc!: Phaser.GameObjects.Text;
  private dash!: Phaser.GameObjects.Text;
  private charged!: Phaser.GameObjects.Text;
  private synergyTitle!: Phaser.GameObjects.Text;
  private synergyDesc!: Phaser.GameObjects.Text;
  /** Info pages cycled with R / Y / a tap on the info: 0 class, 1 PASIF II + DUKUNGAN, 2 DUKUNGAN II. */
  private page = 0;
  private page2: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('class');
  }

  create(): void {
    this.selected = Math.max(0, CLASS_IDS.indexOf(loadSave().cls));
    playMusic('hub');
    this.add.image(0, 0, 'bg').setOrigin(0).setAlpha(0.6);
    ambience(this, { fireflies: false });
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
      this.add.rectangle(x + 51, y + ROW_H / 2, 102, ROW_H, 0x1d2b53, 0.7);
      this.markers.push(
        this.add
          .rectangle(x + 51, y + ROW_H / 2, 102, ROW_H)
          .setStrokeStyle(1, 0xffec27)
          .setDepth(101),
      );
      this.add
        .image(x + 8, y + ROW_H / 2, `hero_idle_${id}`)
        .setScale(0.5)
        .setDepth(100);
      this.names.push(text(this, x + 16, y, c.name, COLOR.text, 6));
      this.add
        .zone(x + 51, y + ROW_H / 2, 102, ROW_H)
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
    this.trait = text(this, 16, INFO_Y, '', COLOR.text, 6).setWordWrapWidth(wrap.width).setLineSpacing(2);
    this.passiveTitle = text(this, 16, 0, '', '#ff77a8', 7).setWordWrapWidth(wrap.width);
    this.passiveDesc = text(this, 16, 0, '', COLOR.text, 6).setWordWrapWidth(wrap.width).setLineSpacing(1);
    this.dash = text(this, 16, 0, '', '#00e436', 6).setWordWrapWidth(wrap.width);
    this.charged = text(this, 16, 0, '', '#ffa300', 6).setWordWrapWidth(wrap.width);
    this.synergyTitle = text(this, 16, 0, '', COLOR.gold, 6).setWordWrapWidth(wrap.width).setLineSpacing(2);
    this.synergyDesc = text(this, 16, 0, '', COLOR.blue, 6).setWordWrapWidth(wrap.width).setLineSpacing(2);
    this.page = 0;
    this.page2 = [
      text(this, 16, INFO_Y, '', '#ff77a8', 7).setWordWrapWidth(wrap.width),
      text(this, 16, 0, '', COLOR.text, 6).setWordWrapWidth(wrap.width).setLineSpacing(1),
      text(this, 16, 0, '', '#c080ff', 7).setWordWrapWidth(wrap.width),
      text(this, 16, 0, '', COLOR.text, 6).setWordWrapWidth(wrap.width).setLineSpacing(1),
      text(this, 16, 0, '', COLOR.gold, 7).setWordWrapWidth(wrap.width),
      text(this, 16, 0, '', COLOR.text, 6).setWordWrapWidth(wrap.width).setLineSpacing(1),
      text(this, 16, 0, 'DUKUNGAN AKTIF SAAT DIPAKAI & SAAT JADI CADANGAN', COLOR.gray, 6).setWordWrapWidth(wrap.width),
    ];
    this.add
      .zone(W / 2, (INFO_Y + 172) / 2, W, 172 - INFO_Y)
      .setInteractive()
      .on('pointerdown', () => this.flip());
    const hint = text(this, W / 2, 173, '', COLOR.gray, 6).setOrigin(0.5, 0);
    onPadChange(this, () =>
      hint.setText(
        padConnected()
          ? 'D-PAD PILIH  A MULAI  Y INFO  B KEMBALI'
          : isTouchDevice()
            ? 'KETUK KELAS 2X MULAI  KETUK INFO = HAL 2'
            : 'WASD PILIH  J MULAI  R INFO  ESC KEMBALI',
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
    kb.on('keydown-R', () => this.flip());
    this.refresh();
  }

  /** Cycle the info panel: the class page, the PASIF II / DUKUNGAN page, the DUKUNGAN II page. */
  private flip(): void {
    this.page = (this.page + 1) % 3;
    sfx('move');
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
    this.charged.setText(`TAHAN ${padConnected() ? 'X' : 'J'}: ${CHARGED[CLASS_IDS[this.selected]].name}`);
    this.synergyTitle.setText(`SINERGI (${WEAPONS[c.weapon].name}): ${c.synergy.name}`);
    this.synergyDesc.setText(c.synergy.desc);
    // Long texts wrap; each block follows right under the one before.
    const stack = [this.trait, this.passiveTitle, this.passiveDesc, this.dash, this.charged, this.synergyTitle, this.synergyDesc];
    for (let i = 1; i < stack.length; i++) {
      const prev = stack[i - 1];
      stack[i].setY(prev.y + prev.height + (i === 1 || i === 3 || i === 5 ? 2 : 1));
    }
    const [p2Title, p2Desc, supTitle, supDesc, sup2Title, sup2Desc] = this.page2;
    p2Title.setText(`PASIF II: ${c.passive2.name}`);
    p2Desc.setText(c.passive2.desc);
    supTitle.setText(`DUKUNGAN: ${c.support.name}`);
    supDesc.setText(c.support.desc);
    sup2Title.setText(`DUKUNGAN II: ${c.support2.name}`);
    sup2Desc.setText(c.support2.desc);
    // Page 1: PASIF II and DUKUNGAN; page 2: DUKUNGAN II and the note on when supports work. Each starts at INFO_Y.
    for (let i = 1; i < this.page2.length; i++) {
      const prev = this.page2[i - 1];
      this.page2[i].setY(i === 4 ? INFO_Y : prev.y + prev.height + (i % 2 ? 1 : 4));
    }
    stack.forEach((t) => t.setVisible(this.page === 0));
    this.page2.forEach((t, i) => t.setVisible(this.page === (i < 4 ? 1 : 2)));
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
    // WARISAN perks: starting coins, starting relics, a random second hero.
    const any = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
    const relic = (rarity: Rarity): ItemId => any(ITEM_IDS.filter((id) => ITEMS[id].rarity === rarity));
    const items = [...(save.perks.bekal >= 1 ? [relic('biasa')] : []), ...(save.perks.bekal >= 2 ? [relic('rare')] : [])];
    this.scene.start('run', {
      round: Number(q.get('round')) || 1,
      cls,
      coins: 5 * save.perks.modal,
      items,
      bench: save.perks.sahabat ? any(CLASS_IDS.filter((c) => c !== cls)) : undefined,
      weapon: weapon && weapon in WEAPONS ? (weapon as WeaponId) : undefined,
      specials: (['mahoraga', 'leviathan', 'godzilla', 'kaguya'] as const).filter((k) => q.has(k)),
      eliteRound: q.has('elite'),
      // ?invade=godzilla: that hidden boss crashes into the round.
      invasion: (['mahoraga', 'leviathan', 'godzilla', 'kaguya'] as const).find((k) => q.get('invade') === k),
    } satisfies RunData);
  }
}
