import Phaser from 'phaser';
import { COLOR } from '../gfx/sprites.ts';
import { text, W } from '../gfx/ui.ts';
import { loadSave, writeSave, type SaveData } from '../logic/save.ts';
import { STAT_INFO, STAT_KEYS, upgradeCost } from '../logic/stats.ts';

export interface HubData {
  died?: boolean;
  round?: number;
  runSouls?: number;
}

const ROW_Y = 78;
const ROW_H = 14;

export class HubScene extends Phaser.Scene {
  private save!: SaveData;
  private selected = 0;
  private rows: Phaser.GameObjects.Text[] = [];
  private soulText!: Phaser.GameObjects.Text;
  private descText!: Phaser.GameObjects.Text;

  constructor() {
    super('hub');
  }

  create(data: HubData): void {
    this.save = loadSave();
    this.selected = 0;
    this.add.image(0, 0, 'bg').setOrigin(0).setAlpha(0.6);

    text(this, W / 2, 10, 'PEDANG JIWA', COLOR.gold, 16).setOrigin(0.5, 0);
    const sub = data.died ? `GUGUR DI ROUND ${data.round}  +${data.runSouls ?? 0} SOUL` : 'ROGUELIKE PLATFORMER';
    text(this, W / 2, 34, sub, data.died ? COLOR.red : COLOR.gray).setOrigin(0.5, 0);

    this.add.image(W / 2 - 60, 54, 'soul').setDepth(100);
    this.soulText = text(this, W / 2 - 52, 50, '');
    text(this, W / 2 - 60, 62, `ROUND TERJAUH ${this.save.bestRound}`, COLOR.gray);

    this.rows = STAT_KEYS.map((_, i) =>
      text(this, 40, ROW_Y + i * ROW_H, '')
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.selected = i;
          this.buy();
        }),
    );
    this.descText = text(this, W / 2, ROW_Y + 4 * ROW_H + 4, '', COLOR.blue).setOrigin(0.5, 0);
    text(this, W / 2, 158, 'W/S PILIH  J BELI  SPASI MULAI', COLOR.gray).setOrigin(0.5, 0);
    text(this, W / 2, 169, 'J SERANG K DASH L SKILL I ULTI', COLOR.blue).setOrigin(0.5, 0);

    const kb = this.input.keyboard!;
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-J', () => this.buy());
    kb.on('keydown-ENTER', () => this.buy());
    kb.on('keydown-SPACE', () => this.startRun());
    this.refresh();
  }

  private move(d: number): void {
    this.selected = Phaser.Math.Wrap(this.selected + d, 0, STAT_KEYS.length);
    this.refresh();
  }

  private buy(): void {
    const key = STAT_KEYS[this.selected];
    const cost = upgradeCost(this.save.stats[key]);
    if (this.save.souls < cost) {
      this.cameras.main.shake(80, 0.005);
      return;
    }
    this.save.souls -= cost;
    this.save.stats[key]++;
    writeSave(this.save);
    this.refresh();
  }

  private startRun(): void {
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
    this.descText.setText(STAT_INFO[STAT_KEYS[this.selected]].desc.toUpperCase());
  }
}
