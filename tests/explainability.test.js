import { describe, expect, it } from 'vitest';
import {
  cohesionBreakdown,
  happinessBreakdown,
  migrationBreakdown,
  wealthStats,
} from '../src/simulation/explainability.js';

describe('explainability', () => {
  it('computes wealth statistics without mutating residents', () => {
    const people = [{ wealth: 0 }, { wealth: 10 }];
    const before = structuredClone(people);

    expect(wealthStats(people)).toEqual({ average: 5, gini: 0.5, total: 10 });
    expect(people).toEqual(before);
  });

  it('keeps happiness factors additive and exposes the existing partner and food effects', () => {
    const state = { tax: 0.15, festival: 0, drought: 0, publicPerCap: 0 };
    const person = {
      wealth: 20,
      fed: 1,
      health: 75,
      partner: 9,
      job: 'farmer',
      traits: [],
      happiness: 50,
    };
    const partnered = happinessBreakdown({
      state,
      person,
      averageWealth: 20,
      gini: 0,
      seasonIndex: 0,
      friendCount: 0,
    });
    const hungrySingle = happinessBreakdown({
      state,
      person: { ...person, partner: null, fed: 0.5 },
      averageWealth: 20,
      gini: 0,
      seasonIndex: 0,
      friendCount: 0,
    });

    expect(partnered.factors.find(factor => factor.key === 'partner').value).toBe(8);
    expect(partnered.factors.find(factor => factor.key === 'food').value).toBe(12);
    expect(hungrySingle.factors.find(factor => factor.key === 'food').value).toBe(-15);
    expect(partnered.rawTarget - hungrySingle.rawTarget).toBe(35);
  });

  it('explains drought and policy effects on cohesion using the production formula', () => {
    const state = { cohesion: 50, policy: 'equal', drought: 5, festival: 10, publicPerCap: 0.5 };
    const before = structuredClone(state);
    const equal = cohesionBreakdown({
      state,
      averageFriends: 2,
      sadFraction: 0.2,
      gini: 0.25,
      teahouseCount: 2,
    });
    const market = cohesionBreakdown({
      state: { ...state, policy: 'market' },
      averageFriends: 2,
      sadFraction: 0.2,
      gini: 0.25,
      teahouseCount: 2,
    });

    expect(equal.factors.find(factor => factor.key === 'drought').value).toBe(4);
    expect(equal.factors.find(factor => factor.key === 'policy').value).toBe(3);
    expect(equal.rawTarget).toBe(66);
    expect(state).toEqual(before);
    expect(market.factors.find(factor => factor.key === 'drought').value).toBe(-8);
    expect(market.factors.find(factor => factor.key === 'policy').value).toBe(-4);
    expect(equal.rawTarget - market.rawTarget).toBe(19);
  });

  it('reports the exact automatic-leaving threshold without consuming RNG', () => {
    const base = {
      status: 'alive',
      job: 'farmer',
      age: 25 * 40,
      partner: null,
      happiness: 20,
    };

    expect(migrationBreakdown({ ...base, sadDays: 12 })).toMatchObject({
      automaticEligible: false,
      daysUntilAutomaticRisk: 1,
      dailyChance: 0,
      wanderEligible: true,
    });
    expect(migrationBreakdown({ ...base, sadDays: 13 })).toMatchObject({
      automaticEligible: true,
      daysUntilAutomaticRisk: 0,
      dailyChance: 0.06,
    });
  });
});
