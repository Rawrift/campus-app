/**
 * Experience, levels and skill points (§46).
 *
 * The curve is a gentle exponential: each level costs ~38% more than the last,
 * so levelling stays frequent through the vertical slice (1 → 10) without the
 * last level taking as long as the first nine combined.
 */

import { ARCHETYPES } from '@/data/archetypes.data';
import { SKILLS, skillsFor } from '@/data/skills.data';
import { SkillInstance, type ArchetypeId } from './ability';
import type { StatBlock, StatKey } from './stats';

export const MAX_LEVEL = 10;
const XP_BASE = 40;
const XP_GROWTH = 1.38;

/** XP needed to advance *from* `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(XP_BASE * Math.pow(XP_GROWTH, level - 1));
}

/** Total XP accumulated to have reached `level`. */
export function xpTotalForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** XP a kill awards, scaled by the level gap so grey mobs stop paying. */
export function xpForKill(enemyLevel: number, enemyXp: number, playerLevel: number): number {
  const gap = enemyLevel - playerLevel;
  let scale = 1;
  if (gap <= -3) scale = Math.max(0.1, 1 + gap * 0.22);
  else if (gap >= 2) scale = 1 + Math.min(gap, 5) * 0.12;
  return Math.max(1, Math.round(enemyXp * scale));
}

export const SKILL_POINTS_PER_LEVEL = 1;

/**
 * The player's persistent progression state. Deliberately separate from the
 * `Actor` so it can be serialised on its own (§35).
 */
export class Progression {
  level = 1;
  xp = 0;
  skillPoints = 1;
  /** skillId → rank. Rank 0 means known but unranked; skills start at 1. */
  readonly ranks = new Map<string, number>();
  readonly skills = new Map<string, SkillInstance>();
  /** Action-bar bindings: index 0 is RMB, 1-4 are the number keys (§44). */
  bar: (string | null)[] = [null, null, null, null, null];

  constructor(readonly archetypeId: ArchetypeId) {
    const arch = ARCHETYPES.get(archetypeId);
    for (const id of arch.startingSkills) this.learn(id);
    // Bind whatever the archetype starts with, in order.
    arch.startingSkills.forEach((id, i) => {
      if (i < this.bar.length) this.bar[i] = id;
    });
  }

  get xpIntoLevel(): number {
    return this.xp - xpTotalForLevel(this.level);
  }

  get xpForThisLevel(): number {
    return xpToNext(this.level);
  }

  get xpFraction(): number {
    if (this.level >= MAX_LEVEL) return 1;
    return Math.max(0, Math.min(1, this.xpIntoLevel / this.xpForThisLevel));
  }

  /** Skills the character is high enough level to learn but has not yet. */
  availableToLearn(): string[] {
    return skillsFor(this.archetypeId)
      .filter((s) => s.requiredLevel <= this.level && !this.ranks.has(s.id))
      .map((s) => s.id);
  }

  knows(skillId: string): boolean {
    return this.ranks.has(skillId);
  }

  learn(skillId: string): boolean {
    if (this.ranks.has(skillId)) return false;
    const def = SKILLS.find(skillId);
    if (!def || def.requiredLevel > this.level) return false;
    this.ranks.set(skillId, 1);
    this.skills.set(skillId, new SkillInstance(def));
    // Auto-bind to the first free action-bar slot so a newly learned skill is
    // immediately usable rather than requiring a trip to the skill screen.
    const free = this.bar.indexOf(null);
    if (free >= 0) this.bar[free] = skillId;
    return true;
  }

  /** Spends a point: learns the skill, or ranks it up if already known. */
  spendPoint(skillId: string): boolean {
    if (this.skillPoints <= 0) return false;
    const def = SKILLS.find(skillId);
    if (!def || def.requiredLevel > this.level) return false;

    if (!this.ranks.has(skillId)) {
      if (!this.learn(skillId)) return false;
      this.skillPoints--;
      return true;
    }
    const rank = this.ranks.get(skillId)!;
    if (rank >= def.maxRank) return false;
    this.ranks.set(skillId, rank + 1);
    this.skills.get(skillId)!.rank = rank + 1;
    this.skillPoints--;
    return true;
  }

  /** Adds XP and returns how many levels were gained. */
  addXp(amount: number): number {
    if (this.level >= MAX_LEVEL) return 0;
    this.xp += Math.max(0, Math.round(amount));
    let gained = 0;
    while (this.level < MAX_LEVEL && this.xpIntoLevel >= this.xpForThisLevel) {
      this.level++;
      this.skillPoints += SKILL_POINTS_PER_LEVEL;
      gained++;
    }
    if (this.level >= MAX_LEVEL) this.xp = xpTotalForLevel(MAX_LEVEL);
    return gained;
  }

  /**
   * Writes the archetype's base stats plus per-level growth into a StatBlock.
   * Called on creation and after every level-up, replacing the base values
   * rather than stacking modifiers (§11: keep the numbers explainable).
   */
  applyBaseStats(stats: StatBlock): void {
    const arch = ARCHETYPES.get(this.archetypeId);
    const levels = this.level - 1;
    const keys = new Set<StatKey>([
      ...(Object.keys(arch.baseStats) as StatKey[]),
      ...(Object.keys(arch.perLevel) as StatKey[]),
    ]);
    for (const key of keys) {
      const base = arch.baseStats[key] ?? 0;
      const growth = arch.perLevel[key] ?? 0;
      stats.setBase(key, base + growth * levels);
    }
    stats.invalidate();
  }

  tickCooldowns(dt: number): void {
    for (const skill of this.skills.values()) skill.tick(dt);
  }
}
