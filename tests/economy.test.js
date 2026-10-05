import { afterEach, describe, expect, it } from 'vitest';
import { ISLE } from '../src/world/map.js';
import { YEAR } from '../src/simulation/clock.js';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { makePerson, seedPopulation } from '../src/simulation/population.js';
import { newState, setState } from '../src/simulation/state.js';
import { FRONTIER } from '../src/simulation/frontier.js';
import { techMult } from '../src/simulation/tech.js';

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

function createTradeWorld(seed, { stage = 'settled', tech = {}, caravan = 0, marketLevel = 0 } = {}) {
  const state = newState(seed);
  setState(state);
  state.food = 100;
  state.treasury = 0;
  state.tax = 0;
  state.caravan = caravan;
  state.tech = { ...tech };
  state.built = marketLevel ? [{ v: ISLE, b: 'market', lv: marketLevel }] : [];
  state.frontier = stage === 'pioneer'
    ? { stage: 'pioneer', start: state.day, origin: {}, tries: 1 }
    : { stage: 'settled', day: state.day, tries: 1 };

  const jobs = ['merchant', 'craftsman', 'woodcutter', 'woodcutter', 'woodcutter', 'woodcutter'];
  const people = jobs.map(job => {
    const person = makePerson({
      village: ISLE,
      age: 30 * YEAR,
      wealth: 100,
      happiness: 70,
      skill: 50,
    });
    person.job = job;
    person.health = 100;
    person.fed = 1;
    person.traits = [];
    return person;
  });
  configureTestEconomy({
    foodCapacity: () => 1000,
    buildingCount: (v, b) => v === ISLE && b === 'market' && marketLevel ? 1 : 0,
  });
  return { state, merchant: people[0], craftsman: people[1] };
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

  it('applies pioneer work loss to the full craftsman and merchant income chain', () => {
    const normal = createTradeWorld(606);
    tick();
    const normalMerchant = normal.merchant.lastIncome;
    const normalCraftsman = normal.craftsman.lastIncome;

    const pioneer = createTradeWorld(606, { stage: 'pioneer' });
    tick();

    expect(pioneer.merchant.lastIncome / normalMerchant).toBeCloseTo(FRONTIER.pioneerWork, 8);
    expect(pioneer.craftsman.lastIncome / normalCraftsman).toBeCloseTo(FRONTIER.pioneerWork, 8);
  });

  it('applies craft and merchant technology multipliers to pooled earnings too', () => {
    const base = createTradeWorld(707);
    tick();
    const baseMerchant = base.merchant.lastIncome;
    const baseCraftsman = base.craftsman.lastIncome;

    const upgraded = createTradeWorld(707, { tech: { ledger: 0 } });
    tick();

    expect(upgraded.merchant.lastIncome / baseMerchant).toBeCloseTo(techMult(upgraded.state, 'merchant'), 8);
    expect(upgraded.craftsman.lastIncome / baseCraftsman).toBeCloseTo(techMult(upgraded.state, 'craft'), 8);
  });

  it('keeps legacy caravan and level-1 market multipliers out of pooled merchant income', () => {
    const base = createTradeWorld(808);
    tick();
    const baseIncome = base.merchant.lastIncome;

    const caravan = createTradeWorld(808, { caravan: 10 });
    tick();
    expect(caravan.merchant.lastIncome - baseIncome).toBeCloseTo(0.3 * (2.5 - 1), 8);

    const market = createTradeWorld(808, { marketLevel: 1 });
    tick();
    expect(market.merchant.lastIncome - baseIncome).toBeCloseTo(0.3 * 0.3, 8);
  });

  it('adds market upgrade units before applying the merchant income multiplier', () => {
    for (const [level, expectedFactor] of [[1, 1.3], [2, 1.45], [3, 1.6]]) {
      const world = createTradeWorld(809 + level, { marketLevel: level });
      for (const p of world.state.people) p.wealth = 0;
      tick();
      expect(world.merchant.lastIncome, `market level ${level}`).toBeCloseTo(0.3 * expectedFactor, 8);
    }
  });


  it('repairs out-of-range happiness before and after natural drift', () => {
    const state = newState(909);
    const person = createNonWorker(state, { wealth: 100 });
    person.happiness = 295;
    state.food = 100;
    state.tax = 0;
    configureTestEconomy();

    tick();

    expect(person.happiness).toBeGreaterThanOrEqual(0);
    expect(person.happiness).toBeLessThanOrEqual(100);
  });

  it('drifts an in-range resident toward the bounded happiness target, not the raw score', () => {
    const state = newState(910);
    const person = createNonWorker(state, { wealth: 1_000_000_000_000 });
    person.happiness = 80;
    person.traits = ['乐天'];
    person.partner = 999;
    state.food = 100;
    state.tax = 0;
    state.festival = 2;
    configureTestEconomy();

    tick();

    const boundedCenter = 80 + (100 - 80) * 0.07;
    expect(person.happiness).toBeGreaterThanOrEqual(boundedCenter - 0.8);
    expect(person.happiness).toBeLessThanOrEqual(boundedCenter + 0.8);
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
