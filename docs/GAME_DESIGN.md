# GAME DESIGN — OSSUAN

## 1. The world

### The Unremembering

Ossuan buried its dead under a rite that carried memory *out* of the body and
let it go. Roughly two generations ago the rite stopped working. Nobody knows
why, and the people who would have known are dead in a way that makes asking
them worse than useless.

Memory now stays in the bone. It curdles there. Bone that holds enough of it
turns slowly into a grey, glassy mineral — **grave-glass** — and grave-glass,
burnt, gives off a pale ash. Breathe that ash and for a few hours you carry
somebody else's memories: their skills, their languages, their grudges, their
last few minutes.

That turned out to be enormously useful, and so it became an industry: an
economy, a sacrament, a medicine, a drug and a weapon, usually all at once.

Something has been answering. Not a demon and not a god. The working theory
among people who have thought hard about it and then stopped sleeping is that
if enough people wear the same memories, those memories start to want things.
It is called **the Latter Choir**, and nobody who names it is comfortable doing
so.

### The Tallow Marches

A rural district: grain, livestock, and the tallow works that gave it its name.
It supplied the **Abbey of the Ninth Bell**, which buried the district's dead
and — it turns out — had been quietly cutting grave-glass out of them for
forty years.

Something in the abbey went wrong first. The district went wrong after.

### The Ossuary of the Ninth Bell

The abbey's undercroft. Bones sorted by size rather than by person, a workshop
with drainage channels cut into the stone, and nine names carved into the
chapter-house floor with eight of them scratched out.

The ninth is **Ausric Vale, Bellwarden**, who rang the hours there for forty
years and then rang one that was not an hour. He scratched out the other eight
himself. He has been breathing the ash of everyone buried under his own abbey,
and there is no longer a single person in there to negotiate with.

---

## 2. Design lineage — what was borrowed and what was not

This game was built by studying what made the classic isometric ARPGs work as
*design*, and rebuilding those principles inside an original world. What was
taken is a set of **principles**; what was deliberately avoided is anything
identifiable.

### Principles taken

| Principle | How it is applied here |
| --- | --- |
| **Isometric clarity** | Fixed diagonal camera, silhouette-first character and enemy design, readable-at-distance elite cues |
| **Deliberate pace** | Every attack has wind-up, strike and recovery; you are committed once you swing |
| **Darkness as a mechanic** | Light is scarce and local; torches make hot spots you fight around |
| **Deep itemisation** | Weighted, level-gated, group-exclusive affixes over a broad base-item table |
| **The loot loop** | Steep rarity curve, distinct drop audio, visible ground beams, immediate equip-and-see |
| **Exploration** | Fog of war, optional branches, lore that is found rather than narrated |
| **Progression that changes play** | Reliquary effects alter *what you do*, not just how big a number is |
| **Weight** | Acceleration-based movement, hit-stop, knockback, stagger, hit reactions |

### Deliberately not borrowed

No character, class, monster, demon, item, location, city, faction, deity,
quest, line of dialogue, skill name, interface layout, icon, sound, piece of
music, animation or asset from any existing game. Specifically avoided:

- **Class archetypes.** The Ironbound is not a barbarian — it is a line-holder
  from a disbanded levy whose entire mechanical identity is *building* a
  resource by absorbing and landing blows. The Pallwalker is not a rogue or an
  amazon — they are a corpse-reader whose poisons come from their trade. The
  Ashen is not a sorceress or a necromancer — their power is a chemical
  dependency with a body count.
- **The twin-orb HUD.** This game uses horizontal hammered-iron bands and a
  single hairline of experience along the bottom edge of the screen.
- **Rarity nomenclature.** Items here carry *memory*, so the tiers are
  BLANK → MARKED → HAUNTED → RELIQUARY.
- **The premise.** This is not a war between heaven and hell. It is an
  industrial and ecclesiastical disaster involving the memory of the dead.

---

## 3. The three archetypes

Each is defined by its **resource economy** first, because that is what dictates
how it is actually played.

### IRONBOUND — of the Sealed Oath
**Resource: GRIT.** Starts every fight empty. Builds by landing hits (+4) and
by absorbing damage (+0.35 per point taken). Decays out of combat.

You cannot open with your best tools. You have to earn them inside the fight by
standing in it, which makes the Ironbound the only archetype that *wants* to be
hit. Skills are heavy, high-stagger, and mostly melee; the payoff for building
Grit is Bell-Toll and Collect the Tithe.

### PALLWALKER — of the Unburied Roads
**Resource: BREATH.** Regenerates quickly (6/s). Never the limiting factor.

Paced by cooldowns, not by resource. The Pallwalker's problem is positioning:
they die quickly, their damage is mostly poison that needs time to tick, and
their answer to being cornered (Slip) is on a cooldown they have to respect.

### ASHEN — of the Burnt Glass
**Resource: EMBER.** Slow regeneration (3.2/s), large costs.

Every cast is a decision. Cinder Nova at 28 Ember is most of the bar. The Ashen
plays at range, denies ground, and has the only summon in the slice.

---

## 4. Combat

Every offensive action resolves through one pipeline (`src/sim/damage.ts`), so
crits, resistances, armour, elite modifiers and item hooks compose predictably.

### Numbers stay small and legible

The brief this project was built to is explicit that a player should be able to
hold `8 damage`, `15 damage`, `42 damage` in their head. Accordingly:

- Level-1 hits land around **5–9**. Level-10 hits land around **40–70**.
- Every stat multiplier is **additive**, never compounding. `+15%` and `+20%`
  make `+35%`, not `+38%`.
- Armour reduces physical only, through `armour / (armour + 24 + 12·level)`,
  capped at 80%. The attacker's level in the denominator is what makes old
  armour quietly stop carrying you.
- Resistances are capped at 75% and floored at −100%.
- Crit chance is capped at 75%.

### Attacks are commitments

| Phase | Purpose |
| --- | --- |
| **Wind-up** | Telegraph. The enemy turns slowly during it, so it can be dodged by circling but not by walking sideways. |
| **Strike** | The damage window. |
| **Recovery** | You are committed. This is the cost of having swung. |

Nothing is instantly cancellable. A heavy attack like Bell-Toll spends 0.42 s
winding up and 0.40 s recovering — most of a second in which you cannot move.

### Feedback stack

Weight comes from all of these together, not from any one:

hit-stop (≤ 0.12 s, extended not stacked) · knockback impulse that decays fast ·
stagger meter with a threshold · hit-reaction animation layered over whatever
else is playing · damage-typed particle burst · dust on physical contact ·
blood decal · material-correct impact sound · capped screenshake · damage number.

---

## 5. Itemisation

### Rarity

| Tier | Colour | Affixes | Stat multiplier | Roughly |
| --- | --- | --- | --- | --- |
| **Blank** | bone white | 0 | 1.00× | ~75% |
| **Marked** | cold blue | 1–2 | 1.12× | ~20% |
| **Haunted** | brass | 3–4 | 1.28× | ~4% |
| **Reliquary** | rust orange | 2–3 **+ a special effect** | 1.40× | ~0.5% |

The curve is steep on purpose. "Maybe the next one" only works if the top tier
is genuinely rare.

### Affixes

30 affixes, each with 3–4 tiers. A tier has its own minimum item level, weight
and value range; weights fall off roughly by half per tier. Affixes belong to
**groups** (`dmg_physical`, `crit`, `armour`, `attr`…) and only one affix per
group can appear on an item, which stops a sword rolling four flavours of the
same thing.

Generation alternates prefix and suffix so items rarely end up lopsided, and
the whole roll is driven by a seeded RNG — every drop is reproducible from
`(seed, itemLevel)`, which is what makes `tests/loot.test.ts` able to assert the
rarity distribution over 200,000 samples.

### Reliquary effects

The rule for this table: **if an effect could be written as `+30% damage`, it
belongs in the affix table instead.** Each of the ten changes what you do.

- Enemies that die while burning erupt.
- Blocking stores a ward; at three, your next attack discharges them.
- Heavy attacks shed bone fragments that cut everything around the impact.
- Your projectile skills fire an extra projectile at reduced damage.
- Poisoned enemies burst into a lingering cloud where they fall.
- …and five more, bound to `ON_HIT`, `ON_KILL`, `ON_CRIT`, `ON_BLOCK`,
  `ON_DAMAGE_TAKEN`, `ON_CAST` and `ON_LOW_HEALTH`.

### Equipment is visible

Every armour base carries a `VisualSpec` (module, tier, material, bulk, spikes,
length, accent) that the procedural mesh builder consumes. Tier drives *shape*:
tier 0 is straps and scavenged plate over cloth, tier 1 is fitted plate with
proper lames, tier 2 adds a crest and engraving. Even tier 2 stays in the same
dirty palette — a powerful object should read as *old and dangerous*, not as
glowing.

---

## 6. Enemies

Three families that belong to the same disaster.

**THE KEPT** — villagers and levy who breathed too much ash.
Ash-Bitten Villager (swarm) · Marcher Deserter (melee, blocks, shoves) ·
Glass-Chandler (ranged, burning glass) · Tallow Warden (tank, huge stagger) ·
Choir-Sworn Flagellant (assassin, leaps, bleeds).

**BEASTS** — animals that ate what was in the ground.
Rot-Maddened Hound (fast swarm, poison bite) · Charnel Sow (tank, charges).

**THE HOLLOW** — what is left standing when the memory is taken out.
Hollowed (slow, shadow-resistant, fire-vulnerable) · Ash Wisp (floating,
physical-resistant caster) · Bone-Gleaner (summoner).

Roles are assigned so that mixed groups pose *composed* problems: a Warden
holds you in place while Chandlers throw fire from behind it, and killing the
Bone-Gleaner first is the difference between a fight and an attrition war.

### Elite modifiers

Seven, each adding real silhouette geometry plus a behavioural change:

**Ravenous** (accelerates with every hit it lands) · **Shelled** (heavy physical
resistance, huge stagger resistance, slow) · **Plagueborne** (stacking poison on
hit, bursts on death) · **Warding** (45% damage reduction aura to everything
near it — kill it first) · **Thirsting** (heals for half the damage it deals) ·
**Cinder-Cored** (burning trail, explodes on death) · **Wisp-Ridden** (partly
incorporeal, slows on hit).

### The boss: Ausric, the Ninth Bell

900 health, three phases at 100%/66%/33%, and six attacks gated by health so
the fight *teaches itself*:

- **Phase 1** — Bell-Sweep (a wide arc) and The Toll (a slam). Two reads. Learn
  them.
- **Phase 2** — adds Sundering Peal (delayed ground denial, fully telegraphed)
  and Warden's Stride (a gap-closing leap). Now the two reads have to be
  combined with movement.
- **Phase 3** — adds The Latter Choir (a nine-projectile fan) and Ring the
  Ninth (a 7-unit nova). Pressure.

Each phase also raises his movement speed, attack speed and damage. **No health
is added between phases** — the difficulty comes from patterns and pressure, not
from a larger bar.

---

## 7. Progression

Levels 1–10. XP to the next level grows by 1.38× each time, so the whole slice
levels frequently without the last level swallowing the run.

Every level grants stat growth (per-archetype) and one skill point. A point
either learns a new skill or raises an existing one by a rank (+18–24% damage
depending on the skill). Levelling restores you fully, which both rewards the
level and gives the difficulty curve a breathing point.

Kill XP scales with the level gap: enemies three or more levels below you pay
progressively less, and enemies above you pay more.

---

## 8. The difficulty curve

1. **Two weak enemies on the road.** Teaches movement and the basic attack at
   essentially no risk.
2. **Burnt hamlet.** A mixed pack — villagers plus hounds. Positioning starts
   to matter.
3. **Flooded field.** A Charnel Sow with Chandlers behind it. Introduces the
   "kill the back line or eat fire forever" problem.
4. **Graveyard.** The first supernatural family, and the first elite.
5. **The abbey approach.** Everything learned so far, at once, with a Warden.
6. **The dungeon.** A fork with two different problems (swarm pressure west, a
   ranged-and-tank composition east), a summoner event, two elites, a rest
   point, and the boss.

---

## 9. Environmental storytelling

The player should be able to ask "what happened here?" before any NPC tells
them. Placed, never narrated:

- A table still laid for four. Three bowls finished. The fourth untouched, the
  chair pushed right back.
- Bodies laid out properly under sheets — somebody had time, and then stopped
  having it.
- A loaded cart, roped and pointed at the gate, that has not moved in weeks.
- Nine notches cut into a gatepost, re-cut every morning. Beneath them, older
  and smaller: *"we counted wrong."*
- Every pew in the nave turned to face the blank back wall.
- A workshop with straps and drainage channels cut into the stone floor.
- Bones in the ossuary sorted by size, not by person.
- Nine names in the chapter-house floor, eight scratched out.
- A warning cut deep into the descent and then cut over until it says nothing.
  Underneath, still legible: *"...does not remember being one person..."*

Lore objects are optional, short, and never block movement.

---

## 10. Built for, but not built yet

The architecture supports these without restructuring:

- **Difficulty tiers / New Game+** — enemy level scaling already exists
  (`Zone.spawn` accepts a level override and scales stats).
- **Procedural dungeons** — zones are composed from carving primitives
  (`carveRoom`, `carveCorridor`, `carveBlob`, `carveRoad`), which are exactly
  what a room-and-connector generator would call.
- **Multiplayer** — the simulation is a self-contained, deterministic,
  seeded module with no rendering dependency.
- **Endgame and seasons** — loot generation is already seed-addressed, so
  seeded runs and leaderboards are a matter of plumbing, not redesign.
