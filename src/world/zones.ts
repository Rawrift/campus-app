/**
 * The three zones of the vertical slice (§24, §25, §26).
 *
 * GRESTWICK MILL — the hub. A tallow-making village that took in refugees and
 * then barred its own gate. Safe, but only just.
 *
 * THE TALLOW MARCHES — the outdoor region. Fields, a burnt hamlet, a flooded
 * graveyard, and the road up to the abbey.
 *
 * THE OSSUARY OF THE NINTH BELL — the dungeon. Structured exactly as §26 asks:
 * entrance, exploration, first fight, a fork, an event, an elite, a place to
 * breathe, a descent, and the boss.
 */

import { Tile } from '@/sim/world';
import {
  carveBlob, carveCorridor, carveDoor, carveRoad, carveRoom, fillRect, stamp,
} from './builders';
import {
  brazier, lineWalls, onGround, onRoad, scatter, torch,
  type Ambience, type Prop, type SpawnInstruction, type ZoneDef,
} from './zoneDef';

// ---------------------------------------------------------------------------
// Shared atmosphere presets (§28)
// ---------------------------------------------------------------------------

/*
 * Lighting values are tuned against actual renders, not guessed.
 *
 * Two things drove the numbers. First, three.js uses physically-correct light
 * units, so a point light's contribution falls off as intensity/distance^2 —
 * torch intensities therefore live in the tens, not in single digits.
 * Second, a low ambient plus a near-overhead sun makes every vertical surface
 * read as a black silhouette, which breaks the brief's requirement (§2) that
 * the player instantly distinguish character, weapon and enemy type. The sun
 * is consequently low and raking, and the hemisphere light is strong enough to
 * keep vertical faces legible while the scene stays firmly dark.
 */
const OUTDOOR_AMBIENCE: Ambience = {
  ambientColour: 0x565e6b, ambientIntensity: 0.85,
  sunColour: 0x9a8b70, sunIntensity: 1.35,
  sunAngle: [-0.85, 2.3],
  fogColour: 0x2b2c2a, fogNear: 22, fogFar: 66,
  groundColour: 0x6e6149, wallColour: 0x6b6557,
  interior: false, wallHeight: 1.35, ambienceTrack: 'wind',
};

const VILLAGE_AMBIENCE: Ambience = {
  ...OUTDOOR_AMBIENCE,
  ambientColour: 0x5e6673, ambientIntensity: 0.95,
  sunColour: 0xa2947a, sunIntensity: 1.5,
  fogColour: 0x34332f, fogNear: 26, fogFar: 78,
  groundColour: 0x756750, wallColour: 0x736c5c,
  wallHeight: 2.2,
  ambienceTrack: 'village',
};

/*
 * The ossuary is meant to be the dark one: its ambient is a third of the
 * outdoor value, so torchlight does the work and unlit corners genuinely read
 * as unsafe. It is still bright enough to fight in, which is the line §28 draws
 * between darkness as a mechanic and darkness as a defect.
 */
const CRYPT_AMBIENCE: Ambience = {
  ambientColour: 0x3a3e4c, ambientIntensity: 0.42,
  sunColour: 0x3e4354, sunIntensity: 0.22,
  sunAngle: [-0.7, 1.6],
  fogColour: 0x0e0e12, fogNear: 11, fogFar: 38,
  groundColour: 0x5f584c, wallColour: 0x645d50,
  interior: true, wallHeight: 3.4, ambienceTrack: 'crypt',
};

// ---------------------------------------------------------------------------
// GRESTWICK MILL — the hub
// ---------------------------------------------------------------------------

const HUB: ZoneDef = {
  id: 'grestwick',
  name: 'Grestwick Mill',
  subtitle: 'What is left of it',
  width: 56, height: 56,
  ambience: VILLAGE_AMBIENCE,
  hostile: false,
  playerStart: { x: 28, y: 34 },

  build(grid, rng) {
    // A walled village green with buildings pressed against the palisade. The
    // wall is the point: this place is protected, not safe (§25).
    carveBlob(grid, 28, 30, 13, rng, Tile.Path);
    carveBlob(grid, 28, 40, 9, rng, Tile.Path);
    stamp(grid, 28, 30, 9, Tile.Path);

    // Building interiors, reachable so the player can walk into the smithy.
    const buildings = [
      { x: 17, y: 22, w: 6, h: 5 },  // smithy
      { x: 34, y: 22, w: 6, h: 5 },  // merchant
      { x: 17, y: 36, w: 5, h: 5 },  // stash house
      { x: 35, y: 36, w: 5, h: 4 },  // empty house
    ];
    for (const b of buildings) carveRoom(grid, b, Tile.Floor);
    carveDoor(grid, 19, 27, 'h', 2);
    carveDoor(grid, 36, 27, 'h', 2);
    carveDoor(grid, 19, 35, 'h', 2);
    carveDoor(grid, 36, 35, 'h', 2);

    // The road out, north.
    carveCorridor(grid, 28, 22, 28, 6, 4, Tile.Path, false);
    for (let y = 4; y < 10; y++) {
      for (let x = 26; x < 31; x++) grid.set(x, y, Tile.Path);
    }

    // Palisade: ring the whole settlement in wall, then open the north gate.
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y) !== Tile.Void) continue;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (grid.walkable(x + dx, y + dy)) { touches = true; break; }
          }
        }
        if (touches) grid.set(x, y, Tile.Wall);
      }
    }
  },

  decorate(grid, rng) {
    const props: Prop[] = [];

    // Buildings are drawn as shells sitting on their carved rooms.
    props.push({ kind: 'house', x: 20, y: 24.5, rotation: 0, scale: 1.15, variant: 1 });
    props.push({ kind: 'house', x: 37, y: 24.5, rotation: 0, scale: 1.1, variant: 2 });
    props.push({ kind: 'house', x: 19.5, y: 38, rotation: 0, scale: 1.0, variant: 3 });
    props.push({ kind: 'house', x: 37, y: 37.5, rotation: 0, scale: 0.95, variant: 4 });

    // The smithy reads as a working forge even before you talk to anyone.
    props.push({ kind: 'anvil', x: 19, y: 23.5, rotation: 0.4, scale: 1, variant: 0 });
    props.push({
      kind: 'forge', x: 21, y: 23.5, rotation: 0, scale: 1, variant: 0,
      light: { colour: 0xff7a28, intensity: 60, range: 14, flicker: 0.3 },
    });
    props.push({ kind: 'stall', x: 36.5, y: 23.5, rotation: 0, scale: 1, variant: 0 });

    props.push({ kind: 'well', x: 28, y: 30, rotation: 0, scale: 1.1, variant: 0 });
    props.push(brazier(24, 33, 1), brazier(32, 33, 2), brazier(28, 12, 3));
    props.push(torch(26.5, 8), torch(30.5, 8));

    // Environmental storytelling: the village is full of people who arrived
    // with nothing and of preparations for something they expect (§59).
    props.push({
      kind: 'barricade', x: 26, y: 10, rotation: 0, scale: 1.2, variant: 0,
      note: 'Stacked against the inside of the gate. Recently.',
    });
    props.push({
      kind: 'ritual_mark', x: 28, y: 14, rotation: 0, scale: 1.4, variant: 0,
      note: 'Nine notches cut into the gatepost. Someone re-cuts them each morning.',
    });
    props.push({
      kind: 'cart', x: 33, y: 29, rotation: 1.1, scale: 1, variant: 0,
      note: 'Loaded, roped, pointed at the gate. It has not moved in weeks.',
    });
    props.push(...scatter(grid, rng, ['barrel', 'crate', 'sack', 'basket', 'hay'], 22,
      { x: 28, y: 31, r: 12 }, { avoid: [{ x: 28, y: 30, r: 2.5 }] }));
    props.push(...scatter(grid, rng, ['fence', 'fence_broken'], 10, { x: 28, y: 38, r: 9 }));
    props.push(...scatter(grid, rng, ['tree_sick', 'stump'], 6, { x: 28, y: 42, r: 8 }));
    return props;
  },

  interactables() {
    return [
      {
        id: 'hub_smith', kind: 'smith', x: 20, y: 25.5,
        label: 'Hesper, who still has coal', radius: 1.8,
      },
      {
        id: 'hub_vendor', kind: 'vendor', x: 37, y: 25.5,
        label: 'Ildri, who buys anything', radius: 1.8,
      },
      {
        id: 'hub_stash', kind: 'stash', x: 19.5, y: 37.5,
        label: 'Your footlocker', radius: 1.8,
      },
      {
        id: 'hub_shrine', kind: 'shrine', x: 28, y: 27, label: 'The Kept Name', radius: 1.8,
      },
      {
        id: 'hub_lore_1', kind: 'lore', x: 28, y: 14.5, label: 'The gatepost', radius: 1.6,
        text: 'Nine notches. Under them, smaller and older: "we counted wrong".',
      },
      {
        id: 'hub_exit_north', kind: 'exit', x: 28, y: 5,
        label: 'The road north — the Tallow Marches',
        targetZone: 'marches', targetX: 40, targetY: 74, radius: 2.4,
      },
    ];
  },

  spawns(): SpawnInstruction[] {
    return [];
  },
};

// ---------------------------------------------------------------------------
// THE TALLOW MARCHES — the outdoor region
// ---------------------------------------------------------------------------

const MARCHES: ZoneDef = {
  id: 'marches',
  name: 'The Tallow Marches',
  subtitle: 'Where the tithe came from',
  width: 86, height: 82,
  ambience: OUTDOOR_AMBIENCE,
  hostile: true,
  playerStart: { x: 40, y: 74 },

  build(grid, rng) {
    // A road from the southern edge up to the abbey gate, with clearings hung
    // off it: a burnt hamlet, flooded fields, a graveyard, dead woodland.
    carveRoad(grid, 40, 78, 44, 10, rng, 4);

    carveBlob(grid, 26, 58, 11, rng, Tile.Floor);   // burnt hamlet
    carveBlob(grid, 58, 52, 10, rng, Tile.Mire);    // flooded field
    carveBlob(grid, 22, 32, 12, rng, Tile.Floor);   // graveyard
    carveBlob(grid, 60, 28, 11, rng, Tile.Floor);   // dead wood
    carveBlob(grid, 44, 44, 9, rng, Tile.Floor);    // crossroads
    carveBlob(grid, 44, 14, 9, rng, Tile.Path);     // abbey forecourt

    // Connect everything back to the road so nothing is stranded.
    carveCorridor(grid, 40, 60, 26, 58, 3, Tile.Floor);
    carveCorridor(grid, 44, 50, 58, 52, 3, Tile.Floor);
    carveCorridor(grid, 42, 40, 22, 32, 3, Tile.Floor);
    carveCorridor(grid, 44, 34, 60, 28, 3, Tile.Floor);
    carveCorridor(grid, 44, 44, 44, 20, 3, Tile.Path, false);

    // Player entry apron at the south edge.
    fillRect(grid, { x: 37, y: 74, w: 7, h: 6 }, Tile.Path);

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y) !== Tile.Void) continue;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (grid.walkable(x + dx, y + dy)) { touches = true; break; }
          }
        }
        if (touches) grid.set(x, y, Tile.Wall);
      }
    }
  },

  decorate(grid, rng) {
    const props: Prop[] = [];

    // --- The burnt hamlet ---------------------------------------------------
    props.push({ kind: 'house_burnt', x: 23, y: 56, rotation: 0.3, scale: 1.1, variant: 1 });
    props.push({ kind: 'house_burnt', x: 29, y: 60, rotation: -0.6, scale: 1.0, variant: 2 });
    props.push({ kind: 'hut', x: 26, y: 53, rotation: 0.9, scale: 0.9, variant: 3 });
    props.push({
      kind: 'table_set', x: 24, y: 58, rotation: 0.2, scale: 1, variant: 0,
      note: 'Four bowls, still on the table. Three of them were finished.',
    });
    props.push({
      kind: 'corpse_covered', x: 27.5, y: 57, rotation: 1.2, scale: 1, variant: 0,
      note: 'Laid out properly, under a sheet. Somebody had time, and then stopped having it.',
    });
    props.push({ kind: 'corpse_covered', x: 28.4, y: 57.6, rotation: 1.1, scale: 1, variant: 1 });
    props.push({ kind: 'cart_wrecked', x: 31, y: 55, rotation: 2.1, scale: 1.1, variant: 0 });
    props.push(...scatter(grid, rng, ['rubble', 'barrel', 'crate', 'bones'], 16, { x: 26, y: 58, r: 9 }));

    // --- The flooded field --------------------------------------------------
    props.push(...scatter(grid, rng, ['reeds', 'stump', 'animal_corpse'], 22, { x: 58, y: 52, r: 9 }));
    props.push({
      kind: 'animal_corpse', x: 57, y: 50, rotation: 0.4, scale: 1.3, variant: 0,
      note: 'The livestock walked into the water and stayed there.',
    });

    // --- The graveyard ------------------------------------------------------
    props.push(...scatter(grid, rng, ['gravestone', 'grave_cross'], 40, { x: 22, y: 32, r: 10 },
      { scaleMin: 0.8, scaleMax: 1.25 }));
    props.push({
      kind: 'altar', x: 22, y: 32, rotation: 0, scale: 1.2, variant: 0,
      note: 'Not consecrated. Built out of gravestones, by hand, recently.',
    });
    props.push(brazier(20, 30, 5), brazier(24, 34, 6));
    props.push({
      kind: 'ritual_mark', x: 22, y: 29, rotation: 0, scale: 1.5, variant: 0,
      note: 'A circle of ash. Nothing has grown inside it.',
    });

    // --- The dead wood ------------------------------------------------------
    props.push(...scatter(grid, rng, ['tree_dead', 'tree_sick', 'bush_dead', 'rock'], 34,
      { x: 60, y: 28, r: 10 }, { scaleMin: 0.9, scaleMax: 1.6 }));

    // --- The road and the abbey approach ------------------------------------
    props.push(...scatter(grid, rng, ['fence_broken', 'rock', 'bush_dead'], 24, { x: 42, y: 45, r: 18 }));
    props.push({ kind: 'chapel', x: 44, y: 9, rotation: 0, scale: 1.6, variant: 0 });
    props.push({
      kind: 'bell_broken', x: 41, y: 13, rotation: 0.5, scale: 1.3, variant: 0,
      note: 'The ninth bell came down through the roof. It is cracked from the inside.',
    });
    props.push(torch(42.5, 16), torch(45.5, 16), brazier(44, 18, 9));
    props.push({ kind: 'gate', x: 44, y: 12, rotation: 0, scale: 1.4, variant: 0 });
    props.push({
      kind: 'barricade', x: 46, y: 20, rotation: 0.3, scale: 1.1, variant: 0,
      note: 'Barricaded from the abbey side. They were keeping something in.',
    });
    return props;
  },

  interactables() {
    return [
      {
        id: 'marches_exit_south', kind: 'exit', x: 40, y: 77,
        label: 'Back to Grestwick Mill',
        targetZone: 'grestwick', targetX: 28, targetY: 8, radius: 2.4,
      },
      {
        id: 'marches_exit_abbey', kind: 'exit', x: 44, y: 11,
        label: 'The Ossuary of the Ninth Bell',
        targetZone: 'ossuary', targetX: 30, targetY: 84, radius: 2.4,
      },
      {
        id: 'marches_chest_1', kind: 'chest', x: 30, y: 60, label: 'A householder\'s chest',
        lootRolls: 2, lootRarityBonus: 0.8, itemLevel: 3, radius: 1.6,
      },
      {
        id: 'marches_chest_2', kind: 'chest', x: 21, y: 34, label: 'A grave-robber\'s cache',
        lootRolls: 3, lootRarityBonus: 1.4, itemLevel: 5, radius: 1.6,
      },
      {
        id: 'marches_shrine', kind: 'shrine', x: 44, y: 44, label: 'A roadside marker', radius: 1.8,
      },
      {
        id: 'marches_lore_1', kind: 'lore', x: 24.2, y: 58, label: 'The set table', radius: 1.6,
        text: 'Four bowls. The fourth is untouched, and the chair is pushed right back, '
          + 'as if whoever sat there stood up quickly and did not sit down again.',
      },
      {
        id: 'marches_lore_2', kind: 'lore', x: 22, y: 29.4, label: 'The circle of ash', radius: 1.6,
        text: 'Ground grave-glass, burnt and spread in a ring. The villagers did this. '
          + 'Whatever they were trying to keep out, they built it out of the same thing.',
      },
    ];
  },

  spawns(_rng, grid): SpawnInstruction[] {
    // Road encounters are positioned by height and resolved onto the actual
    // carved road; clearing encounters are snapped onto their clearing.
    const road = (y: number) => onRoad(grid, y, 42);
    const at = (x: number, y: number) => onGround(grid, x, y);

    const road1 = road(66);
    const road2 = road(50);
    const approach = road(22);

    return [
      // Opening beat: two weak enemies on the road, to teach movement and the
      // basic attack without any real risk (§47).
      { defId: 'kept_villager', ...road1, count: 2, spread: 2, triggerRadius: 16, group: 'road_1' },

      // Burnt hamlet: a mixed pack, so positioning starts to matter.
      { defId: 'kept_villager', ...at(26, 58), count: 3, spread: 4, triggerRadius: 14, group: 'hamlet' },
      { defId: 'beast_hound', ...at(28, 56), count: 2, spread: 3, triggerRadius: 14, group: 'hamlet' },

      // The road tightens.
      { defId: 'kept_deserter', ...road2, count: 2, spread: 3, triggerRadius: 14, group: 'road_2' },
      { defId: 'beast_hound', ...at(road2.x - 2, road2.y - 2), count: 2, spread: 3, triggerRadius: 14, group: 'road_2' },

      // Flooded field: ranged support behind a tanky front line.
      { defId: 'beast_sow', ...at(58, 52), count: 1, spread: 1, triggerRadius: 13, group: 'field' },
      { defId: 'kept_chandler', ...at(61, 54), count: 2, spread: 3, triggerRadius: 13, group: 'field' },

      // Graveyard: the first supernatural family, and the first elite (§47).
      { defId: 'hollow_walker', ...at(22, 32), count: 3, spread: 5, triggerRadius: 14, group: 'graveyard' },
      { defId: 'hollow_wisp', ...at(19, 30), count: 2, spread: 3, triggerRadius: 14, group: 'graveyard' },
      { defId: 'kept_deserter', ...at(24, 34), count: 1, eliteCount: 1, triggerRadius: 14, group: 'graveyard' },

      // Dead wood: fast, dangerous, optional.
      { defId: 'kept_flagellant', ...at(60, 28), count: 2, spread: 4, triggerRadius: 13, group: 'wood' },
      { defId: 'beast_hound', ...at(62, 26), count: 3, spread: 4, triggerRadius: 13, group: 'wood' },

      // The abbey approach: everything the player has learned so far, at once.
      { defId: 'kept_deserter', ...approach, count: 2, spread: 3, triggerRadius: 15, group: 'approach' },
      { defId: 'kept_chandler', ...at(approach.x + 2, approach.y - 3), count: 2, spread: 2, triggerRadius: 15, group: 'approach' },
      { defId: 'kept_warden', ...at(approach.x - 1, approach.y - 2), count: 1, triggerRadius: 15, group: 'approach' },
    ];
  },
};

// ---------------------------------------------------------------------------
// THE OSSUARY OF THE NINTH BELL — the dungeon
// ---------------------------------------------------------------------------

/** Room rectangles, named so the spawn and prop code reads as level design. */
const O = {
  entry:      { x: 24, y: 76, w: 14, h: 10 },
  nave:       { x: 20, y: 58, w: 22, h: 14 },
  westAisle:  { x: 8,  y: 42, w: 12, h: 12 },
  eastAisle:  { x: 44, y: 42, w: 14, h: 12 },
  chapter:    { x: 24, y: 38, w: 14, h: 10 },
  reliquary:  { x: 46, y: 24, w: 12, h: 10 },
  rest:       { x: 26, y: 24, w: 10, h: 8 },
  descent:    { x: 28, y: 14, w: 8,  h: 6 },
  belfry:     { x: 18, y: 2,  w: 28, h: 10 },
} as const;

const DUNGEON: ZoneDef = {
  id: 'ossuary',
  name: 'The Ossuary of the Ninth Bell',
  subtitle: 'They kept the bones in order',
  width: 66, height: 92,
  ambience: CRYPT_AMBIENCE,
  hostile: true,
  playerStart: { x: 30, y: 84 },

  build(grid) {
    // §26's structure, laid out so that the player can always get back the way
    // they came (backtracking is explicitly required) but the forward path is
    // legible.
    for (const room of Object.values(O)) carveRoom(grid, room, Tile.Floor);

    // entrance → nave
    carveCorridor(grid, 31, 76, 31, 72, 3, Tile.Floor, false);
    // nave → the fork (west aisle / east aisle)
    carveCorridor(grid, 24, 58, 14, 54, 3, Tile.Floor, false);
    carveCorridor(grid, 38, 58, 50, 54, 3, Tile.Floor, false);
    // both aisles → chapter house, so the fork rejoins (§26 backtracking)
    carveCorridor(grid, 14, 42, 24, 43, 3, Tile.Floor);
    carveCorridor(grid, 50, 42, 38, 43, 3, Tile.Floor);
    // chapter house → reliquary (elite) and → rest
    carveCorridor(grid, 38, 42, 46, 30, 3, Tile.Floor);
    carveCorridor(grid, 30, 38, 30, 32, 3, Tile.Floor, false);
    // rest → descent → belfry (boss)
    carveCorridor(grid, 31, 24, 31, 20, 3, Tile.Floor, false);
    carveCorridor(grid, 32, 14, 32, 12, 4, Tile.Floor, false);
    // A back stair from the reliquary down to the rest room, so the optional
    // elite room is not a dead end.
    carveCorridor(grid, 46, 28, 36, 27, 2, Tile.Floor);
  },

  decorate(grid, rng) {
    const props: Prop[] = [];
    const roomCentre = (r: { x: number; y: number; w: number; h: number }) =>
      ({ x: r.x + r.w / 2, y: r.y + r.h / 2, r: Math.max(r.w, r.h) / 2 });

    // --- Entrance: it still looks like a church -----------------------------
    props.push(torch(26, 80), torch(36, 80), torch(26, 72), torch(36, 72));
    props.push({
      kind: 'bell_rope', x: 31, y: 78, rotation: 0, scale: 1.2, variant: 0,
      note: 'The rope has been cut at head height, from below.',
    });
    props.push(...lineWalls(grid, rng, ['ossuary_niche', 'candles', 'banner'], roomCentre(O.entry), 0.22));

    // --- Nave: the first fight, and the first sign of what happened ---------
    props.push({ kind: 'pillar', x: 25, y: 62, rotation: 0, scale: 1.2, variant: 1 });
    props.push({ kind: 'pillar', x: 37, y: 62, rotation: 0, scale: 1.2, variant: 2 });
    props.push({ kind: 'pillar_broken', x: 25, y: 68, rotation: 0.4, scale: 1.2, variant: 3 });
    props.push({ kind: 'pillar', x: 37, y: 68, rotation: 0, scale: 1.2, variant: 4 });
    props.push({
      kind: 'bench', x: 31, y: 65, rotation: 0, scale: 1.4, variant: 0,
      note: 'The pews face the wrong way. All of them. Someone turned them around.',
    });
    props.push(...scatter(grid, rng, ['rubble', 'bones', 'candles'], 16, roomCentre(O.nave)));
    props.push(brazier(28, 60, 11), brazier(34, 60, 12));

    // --- West aisle: the ossuary proper ------------------------------------
    props.push(...lineWalls(grid, rng, ['ossuary_niche', 'skull_pile'], roomCentre(O.westAisle), 0.42));
    props.push(...scatter(grid, rng, ['bones', 'skull_pile'], 18, roomCentre(O.westAisle)));
    props.push({
      kind: 'altar', x: 14, y: 48, rotation: 0, scale: 1.1, variant: 0,
      note: 'The bones here are sorted by size, not by person.',
    });
    props.push(torch(10, 46), torch(18, 46));

    // --- East aisle: where they did the extracting -------------------------
    props.push({
      kind: 'table', x: 50, y: 46, rotation: 0, scale: 1.3, variant: 0,
      note: 'Straps. Drainage channels cut into the stone. This was a workshop.',
    });
    props.push({ kind: 'table', x: 54, y: 48, rotation: 0.2, scale: 1.2, variant: 1 });
    props.push({ kind: 'corpse', x: 52, y: 44, rotation: 1.4, scale: 1, variant: 0 });
    props.push(...scatter(grid, rng, ['barrel', 'crate', 'candles', 'bones'], 14, roomCentre(O.eastAisle)));
    props.push(brazier(48, 50, 13), torch(56, 44));

    // --- Chapter house: the event ------------------------------------------
    props.push({
      kind: 'altar', x: 31, y: 42, rotation: 0, scale: 1.4, variant: 1,
      note: 'Nine names carved into the floor around it. Eight are scratched out.',
    });
    props.push({ kind: 'candles', x: 29, y: 43, rotation: 0, scale: 1, variant: 0 });
    props.push({ kind: 'candles', x: 33, y: 43, rotation: 0, scale: 1, variant: 1 });
    props.push(brazier(26, 40, 14), brazier(36, 40, 15));
    props.push(...scatter(grid, rng, ['bones', 'rubble'], 10, roomCentre(O.chapter)));

    // --- Reliquary: the elite guards something worth taking ----------------
    props.push({
      kind: 'shrine', x: 52, y: 28, rotation: 0, scale: 1.5, variant: 0,
      note: 'Empty. Whatever was in it is what everyone came here for.',
    });
    props.push(...lineWalls(grid, rng, ['ossuary_niche', 'banner'], roomCentre(O.reliquary), 0.3));
    props.push(brazier(48, 26, 16), brazier(56, 30, 17));

    // --- Rest: the only quiet room in the building -------------------------
    props.push({ kind: 'bed', x: 28, y: 26, rotation: 0, scale: 1, variant: 0 });
    props.push({ kind: 'bed', x: 28, y: 29, rotation: 0, scale: 1, variant: 1 });
    props.push({
      kind: 'table_set', x: 33, y: 27, rotation: 0, scale: 1, variant: 0,
      note: 'Somebody has been living here. Recently. Alone.',
    });
    props.push(brazier(31, 27, 18));
    props.push(torch(27, 31), torch(35, 31));

    // --- Descent -----------------------------------------------------------
    props.push({ kind: 'stairs_down', x: 32, y: 17, rotation: 0, scale: 1.6, variant: 0 });
    props.push(torch(29, 16), torch(35, 16));
    props.push({
      kind: 'ritual_mark', x: 32, y: 20, rotation: 0, scale: 1.6, variant: 0,
      note: 'A warning, cut deep and then cut over. It no longer says anything.',
    });

    // --- Belfry: the boss arena --------------------------------------------
    props.push({
      kind: 'bell', x: 32, y: 6, rotation: 0, scale: 2.6, variant: 0,
      light: { colour: 0xc8a349, intensity: 40, range: 18, flicker: 0.05 },
      note: 'The ninth bell. It is ringing, very quietly, and nothing is touching it.',
    });
    props.push({ kind: 'pillar', x: 22, y: 5, rotation: 0, scale: 1.5, variant: 5 });
    props.push({ kind: 'pillar', x: 42, y: 5, rotation: 0, scale: 1.5, variant: 6 });
    props.push({ kind: 'pillar_broken', x: 22, y: 9, rotation: 0.6, scale: 1.5, variant: 7 });
    props.push({ kind: 'pillar', x: 42, y: 9, rotation: 0, scale: 1.5, variant: 8 });
    props.push(brazier(24, 4, 19), brazier(40, 4, 20), brazier(24, 10, 21), brazier(40, 10, 22));
    props.push(...scatter(grid, rng, ['bones', 'skull_pile', 'rubble'], 20, roomCentre(O.belfry)));
    return props;
  },

  interactables() {
    return [
      {
        id: 'oss_exit', kind: 'exit', x: 31, y: 85,
        label: 'Back out to the Marches',
        targetZone: 'marches', targetX: 44, targetY: 14, radius: 2.4,
      },
      {
        id: 'oss_chest_nave', kind: 'chest', x: 38, y: 69, label: 'An offering box',
        lootRolls: 2, lootRarityBonus: 1.0, itemLevel: 5, radius: 1.6,
      },
      {
        id: 'oss_chest_west', kind: 'chest', x: 11, y: 51, label: 'A sexton\'s locker',
        lootRolls: 2, lootRarityBonus: 1.2, itemLevel: 6, radius: 1.6,
      },
      {
        id: 'oss_chest_east', kind: 'chest', x: 55, y: 51, label: 'A workshop strongbox',
        lootRolls: 3, lootRarityBonus: 1.6, itemLevel: 7, radius: 1.6,
      },
      {
        id: 'oss_chest_reliquary', kind: 'chest', x: 52, y: 26, label: 'The reliquary hoard',
        lootRolls: 4, lootRarityBonus: 3.0, itemLevel: 9, radius: 1.8,
      },
      {
        id: 'oss_shrine_rest', kind: 'shrine', x: 31, y: 28, label: 'A lit candle', radius: 2.0,
      },
      {
        id: 'oss_lore_1', kind: 'lore', x: 31, y: 65.8, label: 'The turned pews', radius: 1.8,
        text: 'Every pew faces the back wall now. The back wall is blank. '
          + 'They were not listening to the altar any more.',
      },
      {
        id: 'oss_lore_2', kind: 'lore', x: 50, y: 45, label: 'The workshop table', radius: 1.8,
        text: 'Grave-glass is cut from bone that kept its memory. You cut it warm. '
          + 'The channels in the stone are for what comes out of the person first.',
      },
      {
        id: 'oss_lore_3', kind: 'lore', x: 31, y: 43, label: 'The nine names', radius: 1.8,
        text: 'Eight scratched out, one left: AUSRIC VALE, BELLWARDEN. '
          + 'The other eight were not removed by an enemy. They were removed by him.',
      },
      {
        id: 'oss_lore_4', kind: 'lore', x: 32, y: 20.6, label: 'The over-cut warning', radius: 1.8,
        text: 'Under the newer cuts, the original is still legible in places: '
          + '"...does not remember being one person..."',
      },
    ];
  },

  spawns(): SpawnInstruction[] {
    return [
      // Entrance and nave: the first fight inside, deliberately readable.
      { defId: 'kept_villager', x: 31, y: 74, count: 3, spread: 3, triggerRadius: 12, group: 'entry' },
      { defId: 'hollow_walker', x: 31, y: 64, count: 3, spread: 5, triggerRadius: 14, group: 'nave' },
      { defId: 'kept_deserter', x: 27, y: 61, count: 2, spread: 3, triggerRadius: 14, group: 'nave' },

      // West fork: swarm pressure in a tight room.
      { defId: 'kept_villager', x: 14, y: 48, count: 5, spread: 5, triggerRadius: 13, group: 'west' },
      { defId: 'beast_hound', x: 12, y: 45, count: 3, spread: 3, triggerRadius: 13, group: 'west' },
      { defId: 'hollow_gleaner', x: 16, y: 51, count: 1, triggerRadius: 13, group: 'west' },

      // East fork: ranged and a tank, a different problem entirely.
      { defId: 'kept_chandler', x: 52, y: 47, count: 3, spread: 4, triggerRadius: 13, group: 'east' },
      { defId: 'kept_warden', x: 48, y: 45, count: 1, triggerRadius: 13, group: 'east' },
      { defId: 'hollow_wisp', x: 54, y: 50, count: 2, spread: 3, triggerRadius: 13, group: 'east' },

      // Chapter house: the event — a summoner that keeps feeding the room.
      { defId: 'hollow_gleaner', x: 31, y: 42, count: 2, spread: 3, triggerRadius: 12, group: 'chapter' },
      { defId: 'hollow_walker', x: 28, y: 44, count: 3, spread: 3, triggerRadius: 12, group: 'chapter' },
      { defId: 'kept_flagellant', x: 34, y: 44, count: 2, spread: 2, triggerRadius: 12, group: 'chapter' },

      // Reliquary: the two elites (§50 requires two).
      { defId: 'kept_warden', x: 50, y: 28, count: 1, eliteCount: 2, triggerRadius: 13, group: 'elite' },
      { defId: 'kept_flagellant', x: 54, y: 30, count: 1, eliteCount: 2, triggerRadius: 13, group: 'elite' },
      { defId: 'hollow_wisp', x: 48, y: 31, count: 3, spread: 3, triggerRadius: 13, group: 'elite' },

      // The descent: a last gauntlet before the boss.
      { defId: 'kept_flagellant', x: 32, y: 17, count: 2, spread: 2, triggerRadius: 11, group: 'descent' },
      { defId: 'hollow_walker', x: 30, y: 16, count: 2, spread: 2, triggerRadius: 11, group: 'descent' },

      // The belfry.
      { defId: 'boss_ausric', x: 32, y: 7, count: 1, triggerRadius: 14, group: 'boss' },
    ];
  },
};

export const ZONES: Record<string, ZoneDef> = {
  grestwick: HUB,
  marches: MARCHES,
  ossuary: DUNGEON,
};

export const ZONE_ORDER = ['grestwick', 'marches', 'ossuary'] as const;
