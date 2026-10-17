import Phaser from 'phaser';
import { ambience } from '../gfx/scenery.ts';
import { COLOR } from '../gfx/sprites.ts';
import { floatText, text, W } from '../gfx/ui.ts';
import { loadSave, writeSave, type SaveData } from '../logic/save.ts';
import { refundSouls, STAT_INFO, STAT_KEYS, upgradeCost } from '../logic/stats.ts';
import { onPadChange, padConnected } from '../gamepad.ts';
import { playMusic, sfx, soundLabel, toggleSound } from '../audio.ts';

export interface HubData {
  died?: boolean;
  round?: number;
  runSouls?: number;
}

const ROW_Y = 78;
const ROW_H = 12;
/** The row after the four stats: RESET STAT, every soul spent on them back (press twice to confirm). */
const RESET = STAT_KEYS.length;

export class HubScene extends Phaser.Scene {
  private save!: SaveData;
  private selected = 0;
  private rows: Phaser.GameObjects.Text[] = [];
  private soulText!: Phaser.GameObjects.Text;
  private descText!: Phaser.GameObjects.Text;
  /** RESET STAT was pressed once; the next press resets. */
  private armed = false;

  constructor() {
    super('hub');
  }

  create(data: HubData): void {
    this.save = loadSave();
    this.selected = 0;
    this.armed = false;
    playMusic('hub');
    this.add.image(0, 0, 'bg').setOrigin(0).setAlpha(0.6);
    ambience(this, { fireflies: false });

    text(this, W / 2, 10, 'PEDANG JIWA', COLOR.gold, 16).setOrigin(0.5, 0);
    text(this, W - 6, 4, 'MULAI>', COLOR.blue)
      .setOrigin(1, 0)
      .setPadding(2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.startRun());
    const sub = data.died ? `GUGUR DI ROUND ${data.round}  +${data.runSouls ?? 0} SOUL` : 'ROGUELIKE PLATFORMER';
    text(this, W / 2, 34, sub, data.died ? COLOR.red : COLOR.gray).setOrigin(0.5, 0);

    this.add.image(W / 2 - 60, 54, 'soul').setDepth(100);
    this.soulText = text(this, W / 2 - 52, 50, '');
    text(this, W / 2 - 60, 62, `ROUND TERJAUH ${this.save.bestRound}`, COLOR.gray);

    this.rows = [...STAT_KEYS, 'reset'].map((_, i) =>
      text(this, 40, ROW_Y + i * ROW_H, '')
        .setInteractive({ useHandCursor: true })
        // First tap selects (shows the description), tapping the selected row buys.
        .on('pointerdown', () => {
          if (this.selected === i) return this.buy();
          this.selected = i;
          this.armed = false;
          this.refresh();
        }),
    );
    this.descText = text(this, W / 2, ROW_Y + this.rows.length * ROW_H + 4, '', COLOR.blue).setOrigin(0.5, 0);
    const menuHint = text(this, W / 2, 158, '', COLOR.gray).setOrigin(0.5, 0);
    const playHint = text(this, W / 2, 169, '', COLOR.blue).setOrigin(0.5, 0);
    const soundHint = text(this, 4, 3, '', COLOR.gray, 6)
      .setLineSpacing(2)
      .setPadding(2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => soundHint.setText(`${padConnected() ? 'SELECT' : 'M'}\n${toggleSound()}`));
    onPadChange(this, () => {
      const pad = padConnected();
      soundHint.setText(`${pad ? 'SELECT' : 'M'}\n${soundLabel()}`);
      menuHint.setText(pad ? 'D-PAD PILIH  A BELI  START MULAI' : 'W/S PILIH  J BELI  SPASI MULAI');
      playHint.setText(pad ? 'X SERANG (TAHAN) B DASH Y SKILL RB ULTI' : 'J SERANG (TAHAN) K DASH L SKILL I ULTI');
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-J', () => this.buy());
    kb.on('keydown-ENTER', () => this.buy());
    kb.on('keydown-SPACE', () => this.startRun());
    kb.on('keydown-M', () => soundHint.setText(`${padConnected() ? 'SELECT' : 'M'}\n${toggleSound()}`));
    this.refresh();
  }

  private move(d: number): void {
    this.selected = Phaser.Math.Wrap(this.selected + d, 0, this.rows.length);
    this.armed = false;
    sfx('move');
    this.refresh();
  }

  private buy(): void {
    if (this.selected === RESET) return this.reset();
    const key = STAT_KEYS[this.selected];
    const cost = upgradeCost(this.save.stats[key]);
    if (this.save.souls < cost) {
      sfx('deny');
      this.cameras.main.shake(80, 0.005);
      return;
    }
    sfx('buy');
    this.save.souls -= cost;
    this.save.stats[key]++;
    writeSave(this.save);
    this.refresh();
  }

  /** First press arms it (shows the refund), the second gives back every soul spent and zeroes the stats. */
  private reset(): void {
    const refund = refundSouls(this.save.stats);
    if (!refund) {
      sfx('deny');
      this.cameras.main.shake(80, 0.005);
      return;
    }
    if (!this.armed) {
      this.armed = true;
      sfx('move');
      return this.refresh();
    }
    this.armed = false;
    this.save.souls += refund;
    for (const k of STAT_KEYS) this.save.stats[k] = 0;
    writeSave(this.save);
    sfx('buy');
    this.cameras.main.flash(200, 41, 173, 255);
    floatText(this, W / 2, ROW_Y + RESET * ROW_H, `+${refund} SOUL`, COLOR.blue);
    this.refresh();
  }

  private startRun(): void {
    sfx('confirm');
    this.scene.start('class');
  }

  private refresh(): void {
    this.soulText.setText(`${this.save.souls}`);
    STAT_KEYS.forEach((key, i) => {
      const lv = this.save.stats[key];
      const cost = upgradeCost(lv);
      const sel = i === this.selected;
      const line = `${sel ? '>' : ' '} ${STAT_INFO[key].label} LV${String(lv).padEnd(3)} ${String(cost).padStart(5)} SOUL`;
      this.rows[i].setText(line).setColor(sel ? COLOR.gold : this.save.souls >= cost ? COLOR.text : COLOR.gray);
    });
    const refund = refundSouls(this.save.stats);
    const sel = this.selected === RESET;
    this.rows[RESET].setText(`${sel ? '>' : ' '} ${this.armed ? 'YAKIN? TEKAN LAGI' : 'RESET STAT'}  +${refund} SOUL`).setColor(
      sel ? (this.armed ? COLOR.red : COLOR.gold) : refund ? COLOR.text : COLOR.gray,
    );
    this.descText.setText(
      sel
        ? this.armed
          ? 'SEMUA STAT KEMBALI KE LV0'
          : 'KEMBALIKAN SEMUA SOUL YANG TERPAKAI'
        : STAT_INFO[STAT_KEYS[this.selected]].desc.toUpperCase(),
    );
  }
}
