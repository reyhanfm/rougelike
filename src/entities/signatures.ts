import Phaser from 'phaser';
import type { ClassId } from '../logic/classes.ts';
import { burst, cutMark, floatText, FLOOR_Y, W } from '../gfx/ui.ts';
import { bolt, explosion, leafBurst, ring, sparks } from './skills.ts';
import { body, dist, every, foes, hold, isBoss, later, st, type Support } from './supports.ts';

/**
 * PASIF II: every hero's second always-on technique, from its own lore, working only while that hero is on the field
 * (RunScene runs these with the same hooks as DUKUNGAN). Each one has its own trigger and effect; none repeats a
 * PASIF, a DUKUNGAN, a skill or a tag tier of anyone else.
 */
type Foe = Phaser.GameObjects.Sprite;

/** Which way an enemy is looking (its picture is flipped when it faces left). */
const facingOf = (t: Foe) => (t.flipX ? -1 : 1);

export const SIGNATURES: Record<ClassId, Support> = {
  // MANA BURST: Artoria fights by blasting prana out of her body. The opening blow of each combo shoots her forward on
  // jets of blue mana and lands 40% harder.
  ksatria: {
    onAttack: (c) => {
      const { p, scene } = c;
      if (p.comboStep !== 0 || !p.grounded) return;
      st(c, () => ({ until: 0 })).until = scene.time.now + 250;
      p.setVelocityX(p.facing * 210);
      for (let i = 0; i < 6; i++) {
        const jet = scene.add
          .rectangle(p.x - p.facing * (4 + i * 3), p.y + Phaser.Math.Between(-3, 4), 3, 1, i % 2 ? 0x29adff : 0xc2f0ff)
          .setDepth(9);
        scene.tweens.add({ targets: jet, x: jet.x - p.facing * 14, alpha: 0, duration: 220, onComplete: () => jet.destroy() });
      }
    },
    modify: (c, _t, source) => (source === 'basic' && c.scene.time.now < st(c, () => ({ until: 0 })).until ? { mult: 1.4 } : undefined),
  },

  // SERANGAN SENYAP: the first Hassan's art of the kill. A blow on an enemy's back, while it looks the other way, is a
  // certain crit and lands 30% harder.
  pembunuh: {
    modify: (c, t, source) => {
      if (source !== 'basic' || isBoss(t) || Math.sign(c.p.x - t.x) !== -facingOf(t)) return;
      sparks(c.scene, t.x, t.y - 4, [0x29adff, 0x1d2b53], 5, 8);
      return { mult: 1.3, crit: true };
    },
  },

  // DISENGAGE: Cu Chulainn breaks off and resets the fight. Dashing away from the nearest enemy heals 5% HP and throws
  // off every debuff, once every 6 s.
  dragoon: {
    onDash: (c) => {
      const { p, scene } = c;
      const s = st(c, () => ({ ready: 0 }));
      const near = foes(c)[0];
      if (!near || scene.time.now < s.ready || Math.sign(near.x - p.x) !== -p.facing || dist(near, p) > 80) return;
      s.ready = scene.time.now + 6000;
      p.clearDebuffs();
      p.heal(Math.round(p.stats.maxHp * 0.05));
      floatText(scene, p.x, p.y - 22, 'DISENGAGE', '#29adff');
      // The rune of withdrawal, cut in the air where he left.
      const g = scene.add
        .graphics()
        .setDepth(12)
        .lineStyle(1, 0x29adff)
        .lineBetween(p.x, p.y - 8, p.x, p.y + 6);
      g.lineBetween(p.x, p.y - 8, p.x + 4, p.y - 4).lineBetween(p.x, p.y - 3, p.x + 4, p.y + 1);
      scene.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() });
      sparks(scene, p.x, p.y, [0x29adff, 0x00e436], 8, 12);
    },
  },

  // TUBUH RAKSASA: Heracles does not budge. A blow never knocks him back; the enemy that ran into him bounces off his
  // body and is hurt by it.
  berserker: {
    onHurt: (c, _dmg, _fromX, from) => {
      const { p, scene, world } = c;
      p.setVelocity(0, 0);
      burst(scene, p.x, p.y + 6, 0x9a8f86, 6);
      if (!from?.active || isBoss(from)) return;
      const dir = Math.sign(from.x - p.x) || p.facing;
      hold(c, from, 400);
      body(from).setVelocity(dir * 260, -170);
      world.strike(from, 0.8, 'proc', false, undefined, 0);
    },
  },

  // MATA PEMANAH: an archer's eyes. Blows that land from far away (more than 90 px) hit 35% harder.
  pemburu: {
    modify: (c, t) => {
      if (dist(c.p, t) <= 90) return;
      sparks(c.scene, t.x, t.y, [0xfff1e8, 0x29adff], 3, 6);
      return { mult: 1.35 };
    },
  },

  // HUJAN BINTANG UDARA: shooting from the air, two star arrows peel off the shot and dive at the floor ahead.
  magicArcher: {
    onAttack: (c) => {
      const { p, scene, world } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (p.grounded || scene.time.now < s.ready) return;
      s.ready = scene.time.now + 300;
      for (const a of [0.7, 1.05]) {
        world.shot({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * 220 * p.facing,
          vy: Math.sin(a) * 220,
          texture: 'panahBintang',
          tint: 0xc080ff,
          mult: 0.5,
          source: 'proc',
        });
      }
      sparks(scene, p.x, p.y, [0xc080ff, 0xfff1e8], 4, 8);
    },
  },

  // PANEN NYAWA: the reaper feeds on what he reaps. Each kill draws its life into him: +2 max HP and 2 HP back, up to
  // +40 for the round.
  reaper: {
    onKill: (c, t) => {
      const { p, scene } = c;
      const s = st(c, () => ({ bonus: 0 }));
      if (s.bonus >= 40) return;
      s.bonus += 2;
      p.stats.maxHp += 2;
      p.heal(2);
      const wisp = scene.add.circle(t.x, t.y, 2, 0x7cf0c0).setDepth(13);
      scene.tweens.add({ targets: wisp, x: p.x, y: p.y, duration: 350, ease: 'Sine.In', onComplete: () => wisp.destroy() });
    },
  },

  // TEMBAKAN MENEKAN: suppressing fire. Keep hitting the same enemy: on the 3rd hit it is pinned down and slowed, on the
  // 6th it cannot move at all for a second.
  gunners: {
    onHit: (c, t, h) => {
      if (h.source !== 'basic' || h.killed) return;
      const s = st(c, () => ({ last: undefined as Foe | undefined, n: 0 }));
      s.n = s.last === t ? s.n + 1 : 1;
      s.last = t;
      if (s.n === 3) {
        c.world.afflict(t, { slow: 2000 });
        floatText(c.scene, t.x, t.y - 18, 'TERTEKAN', '#ffa300');
      }
      if (s.n >= 6) {
        s.n = 0;
        hold(c, t, 1000);
        floatText(c.scene, t.x, t.y - 18, 'TERPAKU', '#ff004d');
        burst(c.scene, t.x, t.y, 0xffa300, 8);
      }
    },
  },

  // MENYERAP ESENSI: a cultivator devours what remains of a fallen foe's spirit; every kill brings all cooldowns 1 s
  // closer.
  cultivator: {
    onKill: (c, t) => {
      const { p, scene } = c;
      p.hasten(1000);
      const mote = scene.add.rectangle(t.x, t.y, 2, 2, 0x00e436).setDepth(13).setAngle(45);
      scene.tweens.add({ targets: mote, x: p.x, y: p.y - 4, duration: 300, onComplete: () => mote.destroy() });
    },
  },

  // ADAPTASI ELEMEN: she is the elements. Burning, freezing or shock from an enemy never takes hold: she drinks it, and
  // it fills her ult meter.
  elementalis: {
    tick: (c) => {
      const { p, scene } = c;
      p.debuffShield = (d) => {
        if (d !== 'burn' && d !== 'freeze' && d !== 'shock') return false;
        p.addUlt(8);
        const color = d === 'burn' ? 0xff004d : d === 'freeze' ? 0x29adff : 0xffec27;
        ring(scene, p.x, p.y, color, 12, 3, 220);
        floatText(scene, p.x, p.y - 22, 'DISERAP', '#c080ff');
        return true;
      };
    },
  },

  // NUKITSUKE: the first blow on any enemy is the draw from the scabbard, 60% harder, with a white line through it.
  samurai: {
    modify: (c, t, source) => {
      if (source !== 'basic' || t.getData('drawn')) return;
      t.setData('drawn', true);
      cutMark(c.scene, t.x, t.y, 0xfff1e8);
      return { mult: 1.6 };
    },
  },

  // AMARAH TERLUKA: pain only feeds the Avenger. After he is hurt, his next attack also throws a crescent of darkness
  // that cuts through everything in its path.
  darkAvenger: {
    onHurt: (c) => void (st(c, () => ({ armed: false })).armed = true),
    onAttack: (c) => {
      const { p, world, scene } = c;
      const s = st(c, () => ({ armed: false }));
      if (!s.armed) return;
      s.armed = false;
      world.shot({
        x: p.x + p.facing * 8,
        y: p.y,
        vx: p.facing * 230,
        vy: 0,
        texture: 'slash',
        tint: 0x7e2553,
        mult: 1.3,
        source: 'proc',
        pierce: true,
        knockback: 120,
      });
      sparks(scene, p.x + p.facing * 8, p.y, [0x7e2553, 0x000000], 6, 10);
    },
  },

  // TUBUH DEWA PERANG: at full AMARAH the demigod's golden veins blaze through his skin and he takes 30% less damage.
  ashura: {
    taken: (c) => (c.p.stats.furyMax && c.p.fury >= c.p.stats.furyMax ? 0.7 : 1),
    tick: (c, time) => {
      const { p, scene } = c;
      const g = ((c.s.g as Phaser.GameObjects.Graphics | undefined) ??= scene.add.graphics().setDepth(11));
      g.clear();
      if (!p.active || !p.stats.furyMax || p.fury < p.stats.furyMax) return;
      const k = 0.6 + Math.sin(time / 80) * 0.3;
      g.lineStyle(1, 0xffec27, k)
        .lineBetween(p.x - 2, p.y - 4, p.x - 1, p.y + 3)
        .lineBetween(p.x + 2, p.y - 3, p.x + 1, p.y + 4);
      g.lineBetween(p.x - 3, p.y - 1, p.x + 3, p.y);
    },
  },

  // SISIK RAJA NAGA: the dragon's scales. Shots, falling rocks and blasts (anything that does not touch him) only do
  // half, and the scales throw sparks of fire where they are struck.
  antares: {
    taken: (_c, from) => (from ? 1 : 0.5),
    onHurt: (c, _dmg, _fromX, from) => {
      if (!from) sparks(c.scene, c.p.x, c.p.y, [0xff004d, 0xffa300], 8, 10);
    },
  },

  // KEILAHIAN: two-thirds god. Against bosses he stands as an equal: 20% more damage to them, 20% less from them.
  gilgamesh: {
    modify: (_c, t) => (isBoss(t) ? { mult: 1.2 } : undefined),
    taken: (_c, from) => (from && isBoss(from) ? 0.8 : 1),
  },

  // TEKNIK KUTUKAN BALIK: Sukuna's reverse cursed technique. Four seconds without a wound and his body knits itself:
  // 2% HP a second, wisps of red cursed energy rising off him.
  sukuna: {
    onHurt: (c) => void (st(c, () => ({ hurtAt: 0, acc: 0 })).hurtAt = c.scene.time.now),
    tick: (c, time, delta) => {
      const { p, scene } = c;
      const s = st(c, () => ({ hurtAt: 0, acc: 0 }));
      if (time - s.hurtAt < 4000 || p.hp >= p.stats.maxHp) return;
      s.acc += (delta / 1000) * p.stats.maxHp * 0.02;
      if (s.acc >= 1) {
        p.heal(Math.floor(s.acc));
        s.acc %= 1;
      }
      if (Math.floor(time / 120) % 3) return;
      const w = scene.add.rectangle(p.x + Phaser.Math.Between(-4, 4), p.y + 4, 1, 3, 0xff004d, 0.7).setDepth(11);
      scene.tweens.add({ targets: w, y: w.y - 14, alpha: 0, duration: 450, onComplete: () => w.destroy() });
    },
  },

  // AO: TARIKAN: Limitless, attraction. Where a dash begins a point of Blue stays a moment and drags the enemies
  // around into it.
  gojo: {
    onDash: (c) => {
      const { p, scene, world } = c;
      const [x, y] = [p.x, p.y];
      const g = scene.add.graphics().setDepth(12);
      const draw = (k: number) => {
        g.clear();
        g.fillStyle(0x1d2b53, 0.5)
          .fillCircle(x, y, 9 * k)
          .fillStyle(0x29adff, 0.8)
          .fillCircle(x, y, 5 * k)
          .fillStyle(0xc2f0ff)
          .fillCircle(x, y, 2 * k);
        g.lineStyle(1, 0x29adff, 0.5).strokeCircle(x, y, 18 - 8 * k);
      };
      for (let i = 0; i < 5; i++) later(scene, i * 120, () => draw(i < 4 ? 1 : 0.4));
      later(scene, 650, () => g.destroy());
      for (const ms of [60, 300]) later(scene, ms, () => world.pull(x, y, 64, 170));
    },
  },

  // AMA NO SAKAHOKO: the Inverted Spear of Heaven nullifies whatever stands in its way; Toji's blows go straight
  // through shields and guards.
  toji: { pierceGuard: true },

  // LEGENDA PERANG: Madara fought the Alliance alone. The more enemies left standing around him, the harder he hits:
  // +6% per enemy, up to +42%, a red aura thickening with the crowd.
  madara: {
    modify: (c) => ({ mult: 1 + Math.min(0.42, 0.06 * foes(c).length) }),
    tick: (c, time) => {
      const { p, scene } = c;
      const g = ((c.s.g as Phaser.GameObjects.Graphics | undefined) ??= scene.add.graphics().setDepth(9));
      g.clear();
      const n = Math.min(7, foes(c).length);
      if (!p.active || n < 3) return;
      g.lineStyle(1, 0xff004d, 0.08 * n + Math.sin(time / 90) * 0.05).strokeEllipse(p.x, p.y, 14 + n, 20 + n);
    },
  },

  // REGENERASI SEL: Hashirama heals without even weaving signs. Every skill, fusion or ult he uses closes 4% of his HP
  // in a flurry of leaves.
  hashirama: {
    onCast: (c) => {
      const { p, scene } = c;
      p.heal(Math.round(p.stats.maxHp * 0.04));
      leafBurst(scene, p.x, p.y, 8);
      ring(scene, p.x, p.y, 0x00e436, 3, 16, 260);
    },
  },

  // BUNSHIN DAIBAKUHA: every 12 s Itachi leaves a shadow clone that runs at the nearest enemy and blows itself up.
  itachi: {
    tick: (c, time) => {
      if (!every(c, 'clone', 12000, time)) return;
      const { p, scene, world } = c;
      const t = foes(c)[0];
      if (!t) return;
      const clone = scene.add
        .image(p.x, p.y, p.texture.key)
        .setFlipX(t.x < p.x)
        .setTint(0x5f574f)
        .setAlpha(0.85)
        .setDepth(9);
      sparks(scene, p.x, p.y, [0x000000, 0x5f574f], 6, 10);
      scene.tweens.add({
        targets: clone,
        x: t.x,
        y: Math.min(t.y, FLOOR_Y - 8),
        duration: Math.min(700, dist(p, t) * 4),
        onComplete: () => {
          const [x, y] = [clone.x, clone.y];
          clone.destroy();
          explosion(scene, x, y, 22);
          scene.cameras.main.shake(100, 0.008);
          world.area(x, y, 28, 1.8, 160, 'proc');
        },
      });
    },
  },

  // ANGIN UTARA: the Wind carries Jack. Every jump lets loose a cold gust that shoves the enemies around him away and
  // slows them.
  jackFrost: {
    onJump: (c) => {
      const { p, scene, world } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (scene.time.now < s.ready) return;
      s.ready = scene.time.now + 600;
      ring(scene, p.x, p.y + 6, 0xc2f0ff, 4, 40, 300);
      for (let i = 0; i < 8; i++) {
        const side = i % 2 ? 1 : -1;
        const flake = scene.add.rectangle(p.x, p.y + Phaser.Math.Between(-4, 6), 2, 1, 0xfff1e8).setDepth(12);
        scene.tweens.add({
          targets: flake,
          x: p.x + side * Phaser.Math.Between(24, 44),
          alpha: 0,
          duration: 380,
          onComplete: () => flake.destroy(),
        });
      }
      for (const t of foes(c)) {
        if (dist(t, p) > 40) continue;
        if (!isBoss(t)) body(t).setVelocityX((Math.sign(t.x - p.x) || 1) * 200);
        world.afflict(t, { slow: 1500 });
      }
    },
  },

  // CAKRA UZUMAKI: the Uzumaki chakra never runs dry. Right after an ult, the meter is already 30% full again.
  naruto: {
    onCast: (c, kind) => {
      if (kind !== 'ult') return;
      const { p, scene } = c;
      p.addUlt(30);
      floatText(scene, p.x, p.y - 34, 'CAKRA UZUMAKI', '#ffa300');
      ring(scene, p.x, p.y, 0xffa300, 20, 4, 400, 2);
    },
  },

  // CHIDORI KATANA: lightning runs down the Kusanagi. A blow has a 30% chance to arc on to one more enemy close by and
  // stun it for a blink.
  sasuke: {
    onHit: (c, t, h) => {
      if (h.source !== 'basic' || Math.random() >= 0.3) return;
      const o = foes(c).find((x) => x !== t && dist(x, t) < 50);
      if (!o) return;
      bolt(c.scene, t.x, t.y, o.x, o.y, 0x29adff);
      hold(c, o, 300);
      c.world.strike(o, 0.6, 'proc', false, undefined, 30);
    },
  },

  // TITIK BERAT: a critical blow turns its victim into a center of gravity; the enemies around it fall in toward it.
  gravityMaster: {
    onHit: (c, t, h) => {
      if (!h.crit || h.killed) return;
      ring(c.scene, t.x, t.y, 0x8a3fd1, 30, 4, 300, 2);
      c.world.pull(t.x, t.y, 60, 180);
    },
  },

  // RAIJU: Raijin's thunder beast. Every 9 s it bolts along the floor from one side of the arena to the other, a
  // crackling hound of light, shocking every enemy on the ground it runs through.
  lightningLord: {
    tick: (c, time) => {
      if (!every(c, 'raiju', 9000, time)) return;
      const { scene, world } = c;
      const dir = c.p.x < W / 2 ? 1 : -1;
      const x0 = dir > 0 ? -20 : W + 20;
      const beast = scene.add
        .graphics()
        .setDepth(12)
        .setPosition(x0, FLOOR_Y - 8)
        .setScale(1.7);
      // A running beast of lightning: arched back, head low, legs mid-stride, tail of sparks.
      beast
        .lineStyle(2, 0x8a3fd1)
        .beginPath()
        .moveTo(-dir * 8, 0)
        .lineTo(-dir * 4, -4)
        .lineTo(dir * 3, -4)
        .lineTo(dir * 8, -1)
        .strokePath();
      beast
        .lineStyle(1, 0xffec27)
        .beginPath()
        .moveTo(-dir * 8, 0)
        .lineTo(-dir * 4, -4)
        .lineTo(dir * 3, -4)
        .lineTo(dir * 8, -1)
        .strokePath();
      beast
        .lineBetween(-dir * 5, -3, -dir * 7, 4)
        .lineBetween(dir * 2, -3, dir * 5, 4)
        .lineBetween(-dir * 8, 0, -dir * 14, -3);
      beast.fillStyle(0xfff1e8).fillRect(dir * 8, -2, 1, 1);
      const hit = new Set<Foe>();
      scene.tweens.add({
        targets: beast,
        x: x0 + dir * (W + 40),
        duration: 900,
        onUpdate: () => {
          if (Math.random() < 0.5) burst(scene, beast.x, FLOOR_Y - 2, 0x8a3fd1, 1);
          for (const t of foes(c)) {
            if (hit.has(t) || Math.abs(t.x - beast.x) > 8 || t.y < FLOOR_Y - 30) continue;
            hit.add(t);
            bolt(scene, t.x, t.y - 10, t.x, t.y + 6, 0xffec27);
            hold(c, t, 400);
            world.strike(t, 1, 'proc', false, undefined, 40);
          }
        },
        onComplete: () => beast.destroy(),
      });
    },
  },

  // SURGA & NERAKA: his blows alternate between his two bloods: the holy one closes 1 HP of his wounds, the hellish one
  // sets the enemy burning.
  nephalem: {
    onHit: (c, t, h) => {
      if (h.source !== 'basic') return;
      const s = st(c, () => ({ hell: false }));
      s.hell = !s.hell;
      if (s.hell) {
        c.world.afflict(t, { burn: 0.12 });
        sparks(c.scene, t.x, t.y, [0xff004d, 0x7e2553], 4, 8);
      } else {
        c.p.heal(1);
        sparks(c.scene, c.p.x, c.p.y - 4, [0xffec27, 0xfff1e8], 3, 6);
      }
    },
  },

  // CAHAYA BERLARI: light at speed. Running, her blows land 25% harder and she leaves a ribbon of light that hurts
  // enemies crossing it.
  lumina: {
    modify: (c, _t, source) => (source === 'basic' && c.p.grounded && Math.abs(c.p.body.velocity.x) > 40 ? { mult: 1.25 } : undefined),
    tick: (c, time) => {
      const { p, scene, world } = c;
      if (!p.grounded || Math.abs(p.body.velocity.x) < 40 || !every(c, 'ribbon', 250, time)) return;
      const [x, y] = [p.x - p.facing * 6, p.y + 4];
      const r = scene.add.rectangle(x, y, 10, 2, [0xff77a8, 0x29adff, 0xffec27][Math.floor(time / 250) % 3], 0.8).setDepth(9);
      scene.tweens.add({ targets: r, alpha: 0, scaleX: 0.3, duration: 500, onComplete: () => r.destroy() });
      world.area(x, y, 8, 0.25, 0, 'proc');
    },
  },

  // FAJAR MENYINGSING: the sun rises with him. For the first 6 s of every round his blows land 40% harder and he
  // shines like dawn.
  surya: {
    tick: (c, time) => {
      const { p, scene } = c;
      const s = st(c, () => ({ start: time, g: undefined as Phaser.GameObjects.Graphics | undefined }));
      const g = (s.g ??= scene.add.graphics().setDepth(9));
      g.clear();
      const left = 6000 - (time - s.start);
      if (left <= 0 || !p.active) return;
      g.fillStyle(0xffa300, 0.15 + Math.sin(time / 100) * 0.05).fillCircle(p.x, p.y, 12);
      g.lineStyle(1, 0xffec27, Math.min(1, left / 1000)).strokeCircle(p.x, p.y, 10);
    },
    modify: (c) => (c.scene.time.now - st(c, () => ({ start: c.scene.time.now })).start < 6000 ? { mult: 1.4 } : undefined),
  },

  // SINAR PURNAMA: while the moon over his head is full (FASE BULAN at 4), every blow heals him 1 HP.
  candra: {
    onHit: (c, _t, h) => {
      if (h.source !== 'basic' || ((c.p.getData('moon') as number | undefined) ?? 0) < 4) return;
      c.p.heal(1);
      sparks(c.scene, c.p.x, c.p.y - 20, [0xfff1e8, 0x9fb4ff], 2, 6);
    },
  },

  // AURA KEGELAPAN: dread of the Dark Lord. Enemies that come close enough to strike him are half-paralyzed with fear:
  // their blows do 25% less, and a black mist hangs about him.
  darkLord: {
    taken: (c, from) => (from && dist(from, c.p) < 60 ? 0.75 : 1),
    tick: (c, time) => {
      if (!every(c, 'mist', 160, time)) return;
      const { p, scene } = c;
      const m = scene.add.circle(p.x + Phaser.Math.Between(-10, 10), p.y + 6, 3, 0x1d1d3a, 0.5).setDepth(9);
      scene.tweens.add({ targets: m, y: m.y - 6, scale: 2, alpha: 0, duration: 600, onComplete: () => m.destroy() });
    },
  },

  // CAHAYA SUCI: a critical blow lights him up from within and heals 2% of his max HP.
  lightLord: {
    onHit: (c, _t, h) => {
      if (!h.crit) return;
      const s = st(c, () => ({ ready: 0 }));
      if (c.scene.time.now < s.ready) return;
      s.ready = c.scene.time.now + 500;
      c.p.heal(Math.max(1, Math.round(c.p.stats.maxHp * 0.02)));
      ring(c.scene, c.p.x, c.p.y, 0xffec27, 2, 14, 220);
    },
  },

  // RANTAI PENJERAT: the last blow of his combo whips the chain around the enemy, binding it for a second.
  obito: {
    onAttack: (c) => {
      const p = c.p;
      if (p.comboStep >= 0 && p.comboStep === p.weapon.combo.length - 1) st(c, () => ({ chain: false })).chain = true;
    },
    onHit: (c, t, h) => {
      const s = st(c, () => ({ chain: false }));
      if (!s.chain || h.source !== 'basic' || h.killed) return;
      s.chain = false;
      hold(c, t, 1000);
      const g = c.scene.add.graphics().setDepth(13).lineStyle(1, 0xc2c3c7);
      for (const dy of [-4, 0, 4]) g.strokeEllipse(t.x, t.y + dy, t.displayWidth + 4, 3);
      c.scene.tweens.add({ targets: g, alpha: 0, delay: 700, duration: 300, onComplete: () => g.destroy() });
    },
  },

  // JALAN ASURA: the Asura Path's mechanized arm opens every 7 s and launches three missiles, each trailing smoke,
  // homing on the enemies.
  pain: {
    tick: (c, time) => {
      if (!every(c, 'missiles', 7000, time)) return;
      const { p, scene, world } = c;
      if (!foes(c).length) return;
      for (let i = 0; i < 3; i++) {
        later(scene, i * 120, () => {
          if (!p.active) return;
          burst(scene, p.x - p.facing * 3, p.y - 6, 0xc2c3c7, 3);
          world.shot({
            x: p.x - p.facing * 3,
            y: p.y - 6,
            vx: -p.facing * 60,
            vy: -140,
            texture: 'bullet',
            tint: 0xc2c3c7,
            mult: 0.8,
            source: 'proc',
            homing: true,
            explode: 14,
          });
        });
      }
    },
  },

  // LARK PAGI: the morning lark sings when a round begins; Oberon's ult meter starts a fifth full.
  oberon: {
    tick: (c) => {
      const s = st(c, () => ({ sung: false }));
      if (s.sung) return;
      s.sung = true;
      const { p, scene } = c;
      p.addUlt(20);
      const lark = scene.add.triangle(p.x, p.y - 10, 0, 2, 3, 0, 6, 2, 0xffccaa).setDepth(13);
      scene.tweens.add({ targets: lark, x: p.x + p.facing * 30, y: p.y - 50, alpha: 0, duration: 900, onComplete: () => lark.destroy() });
      floatText(scene, p.x, p.y - 26, 'LARK PAGI', '#ffccaa');
    },
  },
};
