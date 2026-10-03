import { afterEach, describe, expect, it } from 'vitest';
import { YEAR } from '../src/simulation/clock.js';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { makePerson, seedPopulation } from '../src/simulation/population.js';
import { newState, setState } from '../src/simulation/state.js';

function configureTestEconomy(overrides = {}) {
  configureEconomy({
    buildingCount: () => 0,
    totalBuildingCount: () => 0,
    foodCapacity: () => 450,
    computeHouses: () => {},
    maybeDilemma: () => {},
    checkChallenge: () => {},
    ...overrides,
  });
}

function createNonWorker(state, { wealth, village = 'grain' }) {
  setState(state);
  const person = makePerson({
    village,
    age: 30 * YEAR,
    wealth,
    happiness: 60,
    skill: 20,
  });
  person.job = 'elder';
  return person;
}

afterEach(() => {
  setState(null);
  configureEconomy({});
});

describe('economy', () => {
  it('clamps scarcity and abundance prices to the existing bounds', () => {
    const scarce = newState(101);
    createNonWorker(scarce, { wealth: 100 });
    scarce.food = 0;
    configureTestEconomy();

    tick();

    expect(scarce.price).toBe(9);
    expect(scarce.food).toBeGreaterThanOrEqual(0);

    const abundant = newState(202);
    createNonWorker(abundant, { wealth: 100 });
    abundant.food = 100_000;
    configureTestEconomy({ foodCapacity: () => 1_000_000 });

    tick();

    expect(abundant.price).toBe(0.8);
    expect(abundant.food).toBeGreaterThan(0);
  });

  it('shares scarce food evenly under the equal policy', () => {
    const state = newState(303);
    const first = createNonWorker(state, { wealth: 100 });
    const second = createNonWorker(state, { wealth: 100, village: 'pine' });
    state.policy = 'equal';
    state.food = 0.11;
    configureTestEconomy();

    tick();

    expect(first.fed).toBeCloseTo(0.5, 8);
    expect(second.fed).toBeCloseTo(0.5, 8);
    expect(state.food).toBeGreaterThanOrEqual(0);
  });

  it('gives the wealthier resident first access under the market policy', () => {
    const state = newState(404);
    const poor = createNonWorker(state, { wealth: 5 });
    const rich = createNonWorker(state, { wealth: 100, village: 'pine' });
    state.policy = 'market';
    state.food = 0.11;
    configureTestEconomy();

    tick();

    expect(rich.fed).toBeCloseTo(1, 8);
    expect(poor.fed).toBe(0);
  });

  it('keeps economy outputs finite across all food policies', () => {
    for (const [index, policy] of ['need', 'equal', 'work', 'market'].entries()) {
      const state = newState(500 + index);
      setState(state);
      seedPopulation();
      state.policy = policy;
      configureTestEconomy();

      for (let day = 0; day < 20; day += 1) tick();

      for (const value of [state.food, state.treasury, state.publicPerCap, state.gini, state.price, state.cohesion]) {
        expect(Number.isFinite(value), `${policy} should keep economy outputs finite`).toBe(true);
      }
      expect(state.price).toBeGreaterThanOrEqual(0.8);
      expect(state.price).toBeLessThanOrEqual(9);
      expect(state.food).toBeGreaterThanOrEqual(0);
    }
  });
});
