# Pedang Jiwa — roguelike action platformer

Retro pixel-art roguelike (320x180, PICO-8 palette) built with **Phaser 4 + TypeScript + Vite**. The player picks a
class (anime / Fate / Naruto / JJK heroes and originals), fights rounds of enemies, picks item rewards, and meets bosses
every 5 rounds (multi-phase boss every 10) plus random bonus "special" bosses (Mahoraga, Leviathan, Godzilla, Kaguya).

All in-game text is **Indonesian, UPPERCASE**. Code comments are English.

## Commands

```
npm run dev        # vite dev server (http://localhost:5173)
npm run typecheck  # tsc --noEmit
npm run check      # game.check.ts + touch.check.ts (assert-based balance/data checks)
npm run verify     # typecheck + check + build — run before calling work done
npx prettier --write <files>   # format touched files only (Boss.ts has pre-existing style warnings)
```

Dev URL shortcuts (from ClassScene, dev only): `?round=10`, `?weapon=busur`, `?mahoraga&kaguya` (force specials),
`?elite`. In the browser console `window.game` is the Phaser game.

## Layout

| File                                                      | What lives there                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/logic/classes.ts`                                    | `ClassId`, `CLASSES`: name, weapon, color, head sprite rows, legs, trait, synergy, optional awaken               |
| `src/logic/loot.ts`                                       | `WeaponId`, `WEAPONS`: combo moves, air move, projectile, skill/ult/fusion names + desc; items, rewards          |
| `src/entities/skills.ts`                                  | `SKILLS[weaponId]`: `skill`, `ult`, optional `basic` (cast weapons) and `fusion` (J+L) — all VFX + damage        |
| `src/entities/dashes.ts`                                  | `DASHES[classId]`: each class's own dash (K) movement, hit and VFX                                               |
| `src/entities/styles.ts`                                  | `STYLES[classId]`: run stride, lean, jump style, trail particles, weapon hold pose                               |
| `src/gfx/sprites.ts`                                      | `PALETTE` (one char per color), `SPRITES` text grids (`w_<weaponId>` held weapon, projectiles, props), `LEGS`    |
| `src/entities/Player.ts`                                  | input, combo/attack/dash/skill flow, `useSkill` (shows the skill name itself)                                    |
| `src/entities/arena.ts`                                   | `PlayerWorld` (what skills may do: `shot`, `pull`, `slam`, `area`, `targets`, `strike`) and `Arena` (enemy side) |
| `src/scenes/RunScene.ts`                                  | the run: implements both interfaces, status effects (burn/freeze/slow), HUD, rewards                             |
| `src/scenes/ClassScene.ts`                                | class picker grid (3 columns, `ROW_Y`/`ROW_H` — shrink them when rows no longer fit above y=102)                 |
| `src/entities/Enemy.ts`, `Boss.ts`, `src/logic/stages.ts` | enemies, bosses, round scaling, special bosses                                                                   |
| `src/logic/game.check.ts`                                 | data/balance assertions — keep them passing, add one for new non-trivial rules                                   |

## Adding or reworking a character — the checklist

A class touches **every** one of these; missing one is a type error or a broken look:

1. `classes.ts` — add to `ClassId`, add `CLASSES` entry. Name ≤ 12 chars. `color` must be a palette char **no other
   class uses** (add a new one to `PALETTE` if needed). `head` = 11 rows × 10 chars (rows 0–2 hair, 3 brow, 4 eyes,
   5 face, 6 collar, 7–9 torso with hands `f` at cols 1/8, 10 belt). In head rows the char `c` is replaced by the class
   color (hair color on rows 1–3), so do not use `c` for eyes. `legs.kind`: pants / robe / armor / coat / float.
2. `loot.ts` — add to `WeaponId`, add `WEAPONS` entry: combo (3–4 moves, finisher with bigger `cd`), `air` move,
   `skill` (cd seconds), `ult`, optional `fusion`. Baseline combo DPS must stay **20–38** (checked in game.check).
3. `sprites.ts` — `w_<weaponId>` held sprite (required, checked) and any projectile/prop textures.
4. `skills.ts` — `SKILLS[weaponId]` with `skill` and `ult` (and `basic` if `cast: true`, `fusion` if declared).
5. `dashes.ts` — `DASHES[classId]`. 6. `styles.ts` — `STYLES[classId]`.
6. Run `npm run verify`, then **look at it in the browser** (see Testing) — skill, ult, fusion, dash, idle sprite.

## Quality bar: every character must look and feel cool

The user wants each character to be **keren**, iconic and unmistakably theirs. When creating or reworking one:

- **Faithful to the source.** Use the character's real signature techniques and names (Hashirama: Jukai Kotan,
  Mokuryu, Shin Susenju; Sasuke: Chidori, Indra no Ya). Comment each skill with what happens in-world, step by step.
- **Nothing recycled.** Each class needs its own dash, run/jump style, trail, hold pose, combo feel, arc/cut color and
  VFX language. Do not reuse another class's skill shape (another "big circle that does area damage" is not enough).
- **Ult = a set piece, 2.5–4 s with phases**: build-up (darken/tint the sky, aura, gathering particles, camera
  flash), the main event (things travel, hit one by one, camera shakes per hit), and a climax (big flash + shake,
  one finishing hit on everyone, a short `floatText` callout like `GASSHO!`, `COLLAPSE!`, `SHATTER!`), then clean up.
  `p.invuln(...)` and `p.lock(...)` for the duration; return `false` when there are no targets so the meter is not spent.
- **Skill = one clear, readable idea** with layered VFX (core + glow + particles + ground reaction like `rocks`,
  cracks, frost lines) and a status that fits (freeze = bound/frozen, slow = heavy/chilled, burn = fire).
- **Cover the whole arena.** Skills must handle flying enemies too, not only the floor (Blizzard Vortex is a full-height
  twister that pulls flyers in, Jukai Kotan whips branches at them). An ult should reach everything on the map.
- **Build shapes, not blobs.** Prefer `graphics` drawn shapes with outline + mid-tone + highlight (see `tree`, the
  Blizzard Vortex funnel, the Mokuryu body) over single flat circles. Pixel sprites: dark outline, shading, one accent color.
- **Aim at what is there.** Directional skills should pick their angle when they fire, not when cast (enemies move
  during wind-ups): Breath of Destruction tries the line toward each enemy ahead and takes the one that hits the most;
  Strike Air aims at the nearest enemy ahead within ±0.6 rad.
- **Signature extras are welcome.** Any weapon can declare a `fusion` (J+L) for a third iconic move (Murasaki, Mokuryu,
  Avalon, Breath of Destruction). A class mechanic can keep state on the player with `p.setData`/`p.getData`
  (Elementalis cycles fire → ice → lightning → earth on each skill cast, and her dash bursts in the current element).
- **Restraint with the camera.** One flash per beat. Five flashes in a row (one per bolt) turn the screen into a solid
  color; flash on the first hit, shake on the rest.
- **Verify visually** before calling it done: screenshot mid-effect; fix anything that looks flat, off-center, or
  hidden behind the HUD.

## Gotchas

- `Player.useSkill` already floats the skill/ult name — do not add a second `floatText` with the same name.
- Phaser `triangle(x, y, x1, y1, ...)` is offset by its origin; inside containers use `.setOrigin(0)` so the points
  are local coordinates.
- Rotating/scaling a `Graphics` happens around (0, 0), not its drawing — wrap it in a container placed at the pivot.
- `world.pull` / `world.slam` skip bosses (they are too heavy to move); damage them with `strike`/`area` instead.
- Depths: background props 2–5, player ~10, effects 11–15, HUD above. Dark overlays at depth 8.
- Shared VFX helpers in `skills.ts`: `ring`, `sparks`, `thorns`, `rocks`, `explosion`, `glint`, `afterimage`,
  `bladeLine`, `leafBurst`, `vine`, `tree`, `bolt` (lightning), `hurlRock`, `feathers`, `flameTongue`, `azraelBlade`,
  `eveningBell`; `cutMark`, `floatText`, `burst` in `gfx/ui.ts`. Reuse them.
- Editing a file while the dev server runs triggers an HMR full reload of the page.
- Never run `prettier --write src` (it reformats `Boss.ts`, which has pre-existing style differences); format only
  the files you touched.
- Tween-moving an enemy sprite fights the physics body; do not tween enemies' `x`/`y`. For "stuck"
  effects use `freeze`, for drags use `world.pull`/`world.slam`.
- The player's hitbox is a fixed 6×13 body; when a skill swaps the player texture to a different size (Antares' 22×14
  dragon), re-center it with `body.setOffset` (see `Player.ts` next to `setTexture`).

## Testing in the browser

With `npm run dev` running, drive it from the console / devtools:

```js
const g = window.game;
g.scene.getScenes(true)[0].scene.start('class');
const c = g.scene.getScene('class');
c.selected = CLASS_INDEX;
c.start(); // index in CLASS_IDS order
const s = g.scene.getScene('run'),
  p = s.player;
p.invuln(60000);
s.spawnEnemy('bat', 120, 60); // slime, bat, boar, ...
for (const t of s.hittables()) t.hp = t.maxHp = 99999; // keep them alive to watch the whole effect
p.ult = 100;
p.useSkill(s.time.now, 'ult'); // 'skill' | 'ult' | 'fusion'; p.dash(s.time.now)
setTimeout(() => s.scene.pause(), 1500); // freeze mid-effect, then screenshot
```

- The game **auto-pauses when its tab loses focus** (screen dims, nothing moves). Keep exactly one game tab open and
  bring it to the front before driving it; a dim screenshot means the run was paused, not that the skill failed.
- Check `99999 - t.hp` per enemy after the effect to prove what was hit (air and ground) — numbers, not just pictures.
- Kill the dev server you started when done (`Get-NetTCPConnection -LocalPort <port>` → `Stop-Process`).

## Rework log

Characters already reworked to the quality bar (2026-10): Gravity Master (new class: Gravity Order, Black Hole),
Hashirama (Jukai Kotan, Mokuryu, Shin Susenju), Jack Frost (Blizzard Vortex, Eternal Winter, homing ice shards),
Antares (Dragon's Fear, Breath of Destruction, Monarch of Destruction + dragon form), Elementalis (element cycle,
Blink, Elemental Cataclysm), Artoria (Strike Air, Avalon, Excalibur sweep), King Hassan (Evening Bell, Azure Flame of
the Grave crescent, Azrael with horned skull + spectral cuts, planted-sword pose), Sukuna (Fuga fire bow, World Cutting Slash fusion that aims the line through the most
enemies, Malevolent Shrine domain ult), Gilgamesh (Enkidu chains, Gate of Babylon sky-full fusion, Enuma Elish rupture
ult). Earlier sessions reworked Samurai, Archer
(Kanshou & Bakuya), and added Naruto, Sasuke and the Kaguya bonus boss. Others are older and are the next candidates.
