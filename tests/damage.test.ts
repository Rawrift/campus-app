import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/rng';
import { Actor } from '@/sim/entity';
import { resolveDamage, applyHeal } from '@/sim/damage';
import { armourReduction, resistanceReduction, StatBlock } from '@/sim/stats';

function actor(stats: Record<string, number> = {}, level = 1): Actor {
  const a = new Actor({ maxHealth: 100, ...stats } as never);
  a.level = level;
  a.health = a.maxHealth;
  return a;
}

describe('armour', () => {
  it('is zero at zero armour and rises monotonically up to the cap', () => {
    expect(armourReduction(0, 1)).toBe(0);
    let last = 0;
    for (let a = 10; a <= 500; a += 10) {
      const r = armourReduction(a, 5);
      // Strictly increasing while below the cap, never decreasing at it.
      if (last < 0.8) expect(r).toBeGreaterThan(last);
      else expect(r).toBe(0.8);
      last = r;
    }
  });

  it('is capped at 80% so nothing becomes immune', () => {
    expect(armourReduction(100_000, 1)).toBeLessThanOrEqual(0.8);
  });

  it('is worth less against a higher-level attacker', () => {
    expect(armourReduction(50, 10)).toBeLessThan(armourReduction(50, 1));
  });
});

describe('resistances', () => {
  it('caps at 75% and floors at -100%', () => {
    expect(resistanceReduction(5)).toBe(0.75);
    expect(resistanceReduction(-9)).toBe(-1);
  });

  it('a stat block never resolves resistance above the cap', () => {
    const s = new StatBlock({ res_fire: 0.9 });
    s.addModifier({ stat: 'res_fire', flat: 0.9 });
    expect(s.get('res_fire')).toBe(0.75);
  });
});

describe('resolveDamage', () => {
  const rng = new Rng('dmg');

  it('applies damage and reports the kill', () => {
    const target = actor({ maxHealth: 10 });
    const r = resolveDamage(null, target, { amounts: { physical: 20 } }, rng);
    expect(r.killed).toBe(true);
    expect(target.health).toBe(0);
  });

  it('never overkills below zero health', () => {
    const target = actor({ maxHealth: 10 });
    resolveDamage(null, target, { amounts: { physical: 999 } }, rng);
    expect(target.health).toBe(0);
  });

  it('armour reduces physical but not fire', () => {
    const armoured = actor({ maxHealth: 1000, armour: 100 });
    const naked = actor({ maxHealth: 1000 });
    const packet = { amounts: { physical: 100 } } as const;
    const a = resolveDamage(null, armoured, packet, rng);
    const b = resolveDamage(null, naked, packet, rng);
    expect(a.total).toBeLessThan(b.total);

    const fireArmoured = actor({ maxHealth: 1000, armour: 100 });
    const fireNaked = actor({ maxHealth: 1000 });
    const fa = resolveDamage(null, fireArmoured, { amounts: { fire: 100 } }, rng);
    const fb = resolveDamage(null, fireNaked, { amounts: { fire: 100 } }, rng);
    expect(fa.total).toBe(fb.total);
  });

  it('resistance reduces its own element only', () => {
    const resistant = actor({ maxHealth: 1000, res_fire: 0.5 });
    const plain = actor({ maxHealth: 1000 });
    const a = resolveDamage(null, resistant, { amounts: { fire: 100 } }, rng);
    const b = resolveDamage(null, plain, { amounts: { fire: 100 } }, rng);
    expect(a.total).toBeCloseTo(b.total * 0.5, 0);
  });

  it('negative resistance amplifies damage', () => {
    const vulnerable = actor({ maxHealth: 1000, res_fire: -0.5 });
    const plain = actor({ maxHealth: 1000 });
    const a = resolveDamage(null, vulnerable, { amounts: { fire: 100 } }, rng);
    const b = resolveDamage(null, plain, { amounts: { fire: 100 } }, rng);
    expect(a.total).toBeGreaterThan(b.total);
  });

  it('crits multiply by the attacker critDamage', () => {
    // Crit chance is deliberately capped at 75%, so this samples until a crit
    // lands rather than assuming a single roll succeeds.
    const attacker = actor({ critChance: 1, critDamage: 2 });
    expect(attacker.stats.get('critChance')).toBe(0.75);

    let crit = null;
    let normal = null;
    for (let i = 0; i < 200 && (!crit || !normal); i++) {
      const target = actor({ maxHealth: 10_000 });
      const r = resolveDamage(attacker, target, { amounts: { physical: 100 } }, rng);
      if (r.crit) crit = r; else normal = r;
    }
    expect(crit).not.toBeNull();
    expect(normal).not.toBeNull();
    expect(crit!.total).toBeCloseTo(normal!.total * 2, -1);
  });

  it('damage over time can never crit', () => {
    const attacker = actor({ critChance: 1, critDamage: 3 });
    const target = actor({ maxHealth: 10_000 });
    for (let i = 0; i < 50; i++) {
      const r = resolveDamage(attacker, target, { amounts: { poison: 10 }, overTime: true }, rng);
      expect(r.crit).toBe(false);
    }
  });

  it('rounds a sub-1 hit up to 1 so chip damage is visible', () => {
    const target = actor({ maxHealth: 1000, res_fire: 0.75 });
    const r = resolveDamage(null, target, { amounts: { fire: 0.5 } }, rng);
    expect(r.total).toBe(1);
  });

  it('reports the dominant damage type for VFX selection', () => {
    const target = actor({ maxHealth: 1000 });
    const r = resolveDamage(null, target, { amounts: { physical: 5, fire: 50 } }, rng);
    expect(r.dominantType).toBe('fire');
  });

  it('staggers once the meter passes the threshold, then resets it', () => {
    const target = actor({ maxHealth: 1000 });
    target.staggerThreshold = 100;
    const r1 = resolveDamage(null, target, { amounts: { physical: 1 }, staggerPower: 60 }, rng);
    expect(r1.staggered).toBe(false);
    const r2 = resolveDamage(null, target, { amounts: { physical: 1 }, staggerPower: 60 }, rng);
    expect(r2.staggered).toBe(true);
    expect(target.staggerMeter).toBe(0);
  });

  it('does nothing to an already dead target beyond reporting zero', () => {
    const target = actor({ maxHealth: 10 });
    target.kill();
    const r = resolveDamage(null, target, { amounts: { physical: 50 } }, rng);
    expect(r.killed).toBe(false);
  });
});

describe('healing', () => {
  it('never exceeds max health', () => {
    const a = actor({ maxHealth: 100 });
    a.health = 90;
    expect(applyHeal(a, 50)).toBe(10);
    expect(a.health).toBe(100);
  });
});

describe('stat derivation', () => {
  it('derives health from resolve and attack power from might', () => {
    const plain = new StatBlock({ maxHealth: 50 });
    const tough = new StatBlock({ maxHealth: 50, resolve: 10 });
    expect(tough.get('maxHealth')).toBeGreaterThan(plain.get('maxHealth'));

    const strong = new StatBlock({ might: 10 });
    expect(strong.get('attackPower')).toBeCloseTo(15, 1);
  });

  it('removeBySource undoes exactly one contributor', () => {
    const s = new StatBlock({ armour: 10 });
    s.addModifier({ stat: 'armour', flat: 5, source: 'a' });
    s.addModifier({ stat: 'armour', flat: 7, source: 'b' });
    expect(s.get('armour')).toBe(22);
    s.removeBySource('a');
    expect(s.get('armour')).toBe(17);
  });

  it('clamps attack speed into a playable band', () => {
    const s = new StatBlock({ attackSpeed: 99 });
    expect(s.get('attackSpeed')).toBe(2.5);
  });
});
