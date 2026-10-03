import { describe, expect, it } from 'vitest';
import {
  MIGRATION_RULES,
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

  it('pins the complete happiness formula with representative non-zero factors', () => {
    const state = { tax: 0.2, festival: 1, drought: 3, publicPerCap: 0.5 };
    const person = {
      wealth: 31,
      fed: 0.8,
      health: 65,
      partner: 9,
      job: 'child',
      traits: ['乐天'],
      happiness: 50,
    };
    const beforeState = structuredClone(state);
    const beforePerson = structuredClone(person);

    const result = happinessBreakdown({
      state,
      person,
      averageWealth: 40,
      gini: 0.25,
      seasonIndex: 3,
      friendCount: 3,
      marketCount: 2,
      teahouseCount: 1,
    });
    const factorSum = result.factors.reduce((total, factor) => total + factor.value, 0);

    expect(result.rawTarget).toBeCloseTo(89.5, 10);
    expect(factorSum).toBeCloseTo(result.rawTarget, 10);
    const expectedFactors = [
      { key: 'base', value: 30 },
      { key: 'wealth', value: 21 },
      { key: 'food', value: -6 },
      { key: 'friends', value: 10.5 },
      { key: 'partner', value: 8 },
      { key: 'health', value: -2 },
      { key: 'tax', value: -3 },
      { key: 'inequality', value: -7 },
      { key: 'child', value: 15 },
      { key: 'festival', value: 14 },
      { key: 'drought', value: -5 },
      { key: 'winter', value: -3 },
      { key: 'optimist', value: 7 },
      { key: 'public', value: 4 },
      { key: 'market', value: 4 },
      { key: 'teahouse', value: 2 },
    ];
    expect(result.factors.map(factor => factor.key)).toEqual(expectedFactors.map(factor => factor.key));
    result.factors.forEach((factor, index) => {
      expect(factor.value).toBeCloseTo(expectedFactors[index].value, 10);
    });
    expect(state).toEqual(beforeState);
    expect(person).toEqual(beforePerson);
  });

  it('keeps the displayed happiness driver consistent when the raw target exceeds the visible range', () => {
    const result = happinessBreakdown({
      state: { tax: 0, festival: 1, drought: 0, publicPerCap: 1 },
      person: {
        wealth: 255,
        fed: 1,
        health: 100,
        partner: 1,
        job: 'child',
        traits: ['乐天'],
        happiness: 80,
      },
      averageWealth: 255,
      gini: 0,
      seasonIndex: 0,
      friendCount: 5,
      marketCount: 2,
      teahouseCount: 2,
    });

    expect(result.rawTarget).toBeGreaterThan(100);
    expect(result.target).toBe(100);
    expect(result.expectedChange).toBeCloseTo(
      Math.min(100, 80 + (result.rawTarget - 80) * 0.07) - 80,
      10,
    );
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

  it('pins the migration rule values shared by simulation and UI', () => {
    expect(MIGRATION_RULES).toEqual({
      sadHappinessThreshold: 22,
      warningSadDays: 7,
      automaticSadDaysThreshold: 12,
      automaticDailyChance: 0.06,
      wanderMaxAge: 35 * 40,
      wanderHappinessThreshold: 60,
    });
  });

  it('reports the exact automatic-leaving threshold without consuming RNG', () => {
    const base = {
      status: 'alive',
      job: 'farmer',
      age: 25 * 40,
      partner: null,
      happiness: 20,
    };

    const before = structuredClone(base);
    migrationBreakdown(base);
    expect(base).toEqual(before);

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
