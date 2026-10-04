import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILDS, GRANARY_CAP, MAX_LEVEL, UPGRADES, buildingStats, granaryCapacity, investedCost, levelName, levelOf,
  nextUpgrade, statOf, totalBonus, upgradeBlock, upgradeBuilding,
} from '../src/simulation/buildings.js';
import { cohesionBreakdown, happinessBreakdown } from '../src/simulation/explainability.js';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { seedPopulation } from '../src/simulation/population.js';
import { newState, setState } from '../src/simulation/state.js';
import { TECHS } from '../src/simulation/tech.js';

afterEach(() => {
  setState(null);
  configureEconomy({});
});

describe('building upgrade rules', () => {
  it('treats legacy buildings as level 1', () => {
    expect(levelOf({ b: 'well' })).toBe(1);
    expect(levelOf({ b: 'well', lv: 7 })).toBe(1);
    expect(levelOf({ b: 'well', lv: 3 })).toBe(3);
    expect(levelName({ b: 'market' })).toBe('集市');
    expect(levelName({ b: 'market', lv: 3 })).toBe('商行');
  });

  it('defines every level with a known tech gate', () => {
    for (const type of Object.keys(BUILDS)) {
      expect(UPGRADES[type]).toHaveLength(MAX_LEVEL);
      for (const U of UPGRADES[type].slice(1)) {
        expect(U.cost).toBeGreaterThan(0);
        if (U.tech) expect(TECHS[U.tech]).toBeDefined();
      }
    }
  });

  it('keeps legacy granary capacity and grows with levels', () => {
    const built = [{ b: 'granary' }, { b: 'granary' }, { b: 'well' }];
    expect(granaryCapacity(built)).toBe(500);
    built[0].lv = 3;
    expect(granaryCapacity(built)).toBe(GRANARY_CAP[3] + GRANARY_CAP[1]);
  });

  it('summarizes counts, max level and upgrade bonus per village', () => {
    const built = [
      { b: 'market', v: 'bay', lv: 3 }, { b: 'market', v: 'bay' },
      { b: 'teahouse', v: 'pine', lv: 2 }, { b: 'teahouse', v: 'grain', lv: 2 },
    ];
    const stats = buildingStats(built);
    expect(statOf(stats, 'bay', 'market')).toEqual({ count: 2, max: 3, bonus: 1 });
    expect(statOf(stats, 'pine', 'market')).toEqual({ count: 0, max: 0, bonus: 0 });
    expect(totalBonus(stats, 'teahouse')).toBe(1);
  });

  it('gates the last level behind its tech and charges the treasury', () => {
    const state = newState(1);
    const well = { b: 'well', v: 'pine', i: 0, j: 0 };
    state.treasury = 10;
    expect(upgradeBlock(state, well)).toContain('公库');
    state.treasury = 100;
    expect(upgradeBuilding(state, well).n).toBe('石砌水井');
    expect(well.lv).toBe(2);
    expect(state.treasury).toBe(75);
    expect(upgradeBlock(state, well)).toContain('草药医术');
    state.tech.herbs = 0;
    expect(upgradeBuilding(state, well).n).toBe('井亭药庐');
    expect(state.treasury).toBe(30);
    expect(nextUpgrade(well)).toBeNull();
    expect(upgradeBlock(state, well)).toContain('最高等级');
    expect(upgradeBuilding(state, well)).toBeNull();
    expect(investedCost(well)).toBe(30 + 25 + 45);
  });

  it('adds upgrade bonuses on top of the unchanged base explanations', () => {
    const state = newState(2);
    const person = { wealth: 10, fed: 1, health: 80, traits: [] };
    const args = { state, person, averageWealth: 10, gini: 0.2, seasonIndex: 0, friendCount: 2, marketCount: 1, teahouseCount: 1 };
    const plain = happinessBreakdown(args);
    const upgraded = happinessBreakdown({ ...args, marketUpgrade: 1, teahouseUpgrade: 0.5 });
    expect(upgraded.rawTarget - plain.rawTarget).toBeCloseTo(3);
    const coh = cohesionBreakdown({ state, averageFriends: 2, sadFraction: 0, gini: 0.2, teahouseCount: 2 });
    const cohUp = cohesionBreakdown({ state, averageFriends: 2, sadFraction: 0, gini: 0.2, teahouseCount: 2, teahouseUpgrade: 4 });
    expect(cohUp.target - coh.target).toBeCloseTo(3);
  });
});

function worldWith(built, seed = 41) {
  const state = newState(seed);
  setState(state);
  seedPopulation();
  state.built = built;
  const count = (v, b) => built.filter(x => x.v === v && x.b === b).length;
  configureEconomy({ buildingCount: count, totalBuildingCount: b => built.filter(x => x.b === b).length });
  return state;
}

describe('building levels in the simulation', () => {
  it('a higher-level well heals its village faster without touching the RNG', () => {
    const run = lv => {
      const state = worldWith([{ b: 'well', v: 'pine', i: 0, j: 0, lv }]);
      for (const p of state.people) p.health = 50;
      tick();
      return { state, health: state.people.filter(p => p.village === 'pine').map(p => p.health) };
    };
    const low = run(1), high = run(3);
    expect(high.state.rngState).toBe(low.state.rngState);
    high.health.forEach((h, k) => expect(h).toBeCloseTo(low.health[k] + 0.6, 6));
  });

  it('an upgraded market pays its merchants more', () => {
    const run = lv => {
      const state = worldWith([{ b: 'market', v: 'bay', i: 0, j: 0, lv }]);
      for (const p of state.people) if (p.village === 'bay' && p.job !== 'child' && p.job !== 'elder') p.job = 'merchant';
      tick();
      return state.people.filter(p => p.job === 'merchant' && p.village === 'bay').reduce((t, p) => t + p.lastIncome, 0);
    };
    expect(run(3)).toBeGreaterThan(run(1));
  });
});
