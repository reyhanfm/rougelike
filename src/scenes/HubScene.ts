import Phaser from 'phaser';
import { ambience } from '../gfx/scenery.ts';
import { COLOR } from '../gfx/sprites.ts';
import { floatText, text, W } from '../gfx/ui.ts';
import { loadSave, PERK_IDS, PERKS, writeSave, type SaveData } from '../logic/save.ts';
import { MAX_STAT_LV, refundSouls, STAT_INFO, STAT_KEYS, upgradeCost } from '../logic/stats.ts';
import { onPadChange, padConnected } from '../gamepad.ts';
import { playMusic, sfx, soundLabel, toggleSound } from '../audio.ts';

export interface HubData {
  died?: boolean;
  round?: number;
  runSouls?: number;
}

const ROW_Y = 78;
const ROW_H = 10;
/** The row after the four stats: RESET STAT, every soul spent on them back (press twice to confirm). */
const RESET = STAT_KEYS.length;
/** Two pages: STAT (capped permanent stats + reset) and WARISAN (unlocks, see PERKS). */
type Tab = 'stat' | 'warisan';

export class HubScene extends Phaser.Scene {
  private save!: SaveData;
  private tab: Tab = 'stat';
  private selected = 0;
  private rows: Phaser.GameObjects.Text[] = [];
  private tabText!: Phaser.GameObjects.Text;
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
    this.tab = 'stat';
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

    this.add.image(40, 52, 'soul').setDepth(100);
    this.soulText = text(this, 48, 48, '');
    text(this, W - 40, 48, `ROUND TERJAUH ${this.save.bestRound}`, COLOR.gray).setOrigin(1, 0);
    this.tabText = text(this, W / 2, 62, '', COLOR.text)
      .setOrigin(0.5, 0)
      .setPadding(2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.switchTab());

    const n = Math.max(RESET + 1, PERK_IDS.length);
    this.rows = Array.from({ length: n }, (_, i) =>
      text(this, 24, ROW_Y + i * ROW_H, '')
        .setInteractive({ useHandCursor: true })
        // First tap selects (shows the description), tapping the selected row buys.
        .on('pointerdown', () => {
          if (i >= this.rowCount) return;
          if (this.selected === i) return this.buy();
          this.selected = i;
          this.armed = false;
          this.refresh();
        }),
    );
    this.descText = text(this, W / 2, 0, '', COLOR.blue).setOrigin(0.5, 0);
    const menuHint = text(this, W / 2, 160, '', COLOR.gray, 6).setOrigin(0.5, 0);
    const playHint = text(this, W / 2, 170, '', COLOR.blue, 6).setOrigin(0.5, 0);
    const soundHint = text(this, 4, 3, '', COLOR.gray, 6)
      .setLineSpacing(2)
      .setPadding(2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => soundHint.setText(`${padConnected() ? 'SELECT' : 'M'}\n${toggleSound()}`));
    onPadChange(this, () => {
      const pad = padConnected();
      soundHint.setText(`${pad ? 'SELECT' : 'M'}\n${soundLabel()}`);
      menuHint.setText(pad ? 'D-PAD PILIH  KIRI/KANAN HALAMAN  A BELI  START MULAI' : 'W/S PILIH  A/D HALAMAN  J BELI  SPASI MULAI');
      playHint.setText(pad ? 'X SERANG (TAHAN) B DASH Y SKILL RB ULTI LB TUKAR' : 'J SERANG (TAHAN) K DASH L SKILL I ULTI U TUKAR');
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-DOWN', () => this.move(1));
    for (const k of ['A', 'D', 'LEFT', 'RIGHT']) kb.on(`keydown-${k}`, () => this.switchTab());
    kb.on('keydown-J', () => this.buy());
    kb.on('keydown-ENTER', () => this.buy());
    kb.on('keydown-SPACE', () => this.startRun());
    kb.on('keydown-M', () => soundHint.setText(`${padConnected() ? 'SELECT' : 'M'}\n${toggleSound()}`));
    this.refresh();
  }

  private get rowCount(): number {
    return this.tab === 'stat' ? RESET + 1 : PERK_IDS.length;
  }

  private switchTab(): void {
    this.tab = this.tab === 'stat' ? 'warisan' : 'stat';
    this.selected = 0;
    this.armed = false;
    sfx('move');
    this.refresh();
  }

  private move(d: number): void {
    this.selected = Phaser.Math.Wrap(this.selected + d, 0, this.rowCount);
    this.armed = false;
    sfx('move');
    this.refresh();
  }

  private deny(): void {
    sfx('deny');
    this.cameras.main.shake(80, 0.005);
  }

  private buy(): void {
    if (this.tab === 'warisan') return this.buyPerk();
    if (this.selected === RESET) return this.reset();
    const key = STAT_KEYS[this.selected];
    const cost = upgradeCost(this.save.stats[key]);
    if (this.save.stats[key] >= MAX_STAT_LV || this.save.souls < cost) return this.deny();
    sfx('buy');
    this.save.souls -= cost;
    this.save.stats[key]++;
    writeSave(this.save);
    this.refresh();
  }

  private buyPerk(): void {
    const id = PERK_IDS[this.selected];
    const lv = this.save.perks[id];
    const cost = PERKS[id].costs[lv];
    if (cost === undefined || this.save.souls < cost) return this.deny();
    sfx('buy');
    this.save.souls -= cost;
    this.save.perks[id]++;
    writeSave(this.save);
    this.cameras.main.flash(150, 255, 236, 39);
    floatText(this, W / 2, ROW_Y + this.selected * ROW_H, PERKS[id].name, COLOR.gold);
    this.refresh();
  }

  /** First press arms it (shows the refund), the second gives back every soul spent and zeroes the stats. */
  private reset(): void {
    const refund = refundSouls(this.save.stats);
    if (!refund) return this.deny();
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
    this.tabText.setText(this.tab === 'stat' ? '< [STAT]  WARISAN >' : '<  STAT  [WARISAN] >');
    this.rows.forEach((r, i) => r.setVisible(i < this.rowCount));
    const mark = (i: number) => (i === this.selected ? '>' : ' ');
    let desc: string;
    if (this.tab === 'stat') {
      STAT_KEYS.forEach((key, i) => {
        const lv = this.save.stats[key];
        const max = lv >= MAX_STAT_LV;
        const cost = upgradeCost(lv);
        const price = max ? '  MAX' : `${String(cost).padStart(5)} SOUL`;
        const line = `${mark(i)} ${STAT_INFO[key].label} LV${String(lv).padEnd(3)} ${price}`;
        this.rows[i].setText(line).setColor(i === this.selected ? COLOR.gold : !max && this.save.souls >= cost ? COLOR.text : COLOR.gray);
      });
      const refund = refundSouls(this.save.stats);
      const sel = this.selected === RESET;
      this.rows[RESET].setText(`${mark(RESET)} ${this.armed ? 'YAKIN? TEKAN LAGI' : 'RESET STAT'}  +${refund} SOUL`).setColor(
        sel ? (this.armed ? COLOR.red : COLOR.gold) : refund ? COLOR.text : COLOR.gray,
      );
      const key = STAT_KEYS[this.selected];
      desc = sel
        ? this.armed
          ? 'SEMUA STAT KEMBALI KE LV0'
          : 'KEMBALIKAN SEMUA SOUL YANG TERPAKAI'
        : this.save.stats[key] >= MAX_STAT_LV
          ? 'STAT MAKS: SOUL KE WARISAN'
          : STAT_INFO[key].desc.toUpperCase();
    } else {
      PERK_IDS.forEach((id, i) => {
        const p = PERKS[id];
        const lv = this.save.perks[id];
        const cost = p.costs[lv];
        const price = cost === undefined ? '  MAX' : `${String(cost).padStart(5)} SOUL`;
        const line = `${mark(i)} ${p.name.padEnd(14)} ${lv}/${p.costs.length} ${price}`;
        this.rows[i]
          .setText(line)
          .setColor(i === this.selected ? COLOR.gold : cost !== undefined && this.save.souls >= cost ? COLOR.text : COLOR.gray);
      });
      desc = PERKS[PERK_IDS[this.selected]].desc;
    }
    this.descText.setY(ROW_Y + this.rowCount * ROW_H + 3).setText(desc);
  }
}
