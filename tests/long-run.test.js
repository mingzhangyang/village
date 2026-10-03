import { afterEach, describe, expect, it } from 'vitest';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { seedPopulation } from '../src/simulation/population.js';
import { newState, setState } from '../src/simulation/state.js';

function configureLongRunEconomy() {
  configureEconomy({
    buildingCount: () => 0,
    totalBuildingCount: () => 0,
    foodCapacity: () => 450,
    computeHouses: () => {},
    maybeDilemma: () => {},
    checkChallenge: () => {},
  });
}

function expectFiniteNumbers(value, path = 'state') {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), path).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectFiniteNumbers(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      expectFiniteNumbers(nested, `${path}.${key}`);
    }
  }
}

function expectPopulationInvariants(state) {
  const livingIds = state.people.map(person => person.id);
  const archivedIds = state.dead.map(person => person.id);
  const livingSet = new Set(livingIds);
  const archivedSet = new Set(archivedIds);

  expect(livingSet.size).toBe(livingIds.length);
  expect(archivedSet.size).toBe(archivedIds.length);
  for (const id of livingSet) expect(archivedSet.has(id), `resident ${id} cannot be living and archived`).toBe(false);

  const byId = new Map(state.people.map(person => [person.id, person]));
  for (const person of state.people) {
    if (person.partner) {
      const partner = byId.get(person.partner);
      expect(partner, `living partner ${person.partner} should exist`).toBeDefined();
      expect(partner.partner).toBe(person.id);
    }
    for (const [otherId, score] of Object.entries(person.rel)) {
      const other = byId.get(Number(otherId));
      if (!other) continue;
      expect(other.rel[person.id]).toBeCloseTo(score, 10);
    }
  }

  for (const values of Object.values(state.hist)) expect(values.length).toBeLessThanOrEqual(90);
  expect(state.food).toBeGreaterThanOrEqual(0);
  expect(state.price).toBeGreaterThanOrEqual(0.8);
  expect(state.price).toBeLessThanOrEqual(9);
  expectFiniteNumbers(state);
}

afterEach(() => {
  setState(null);
  configureEconomy({});
});

describe('long-run deterministic simulation invariants', () => {
  it.each([17, 2718, 739391, 0xdeadbeef])('survives six simulated years for seed %s', seed => {
    const state = newState(seed);
    setState(state);
    seedPopulation();
    configureLongRunEconomy();
    const policies = ['need', 'equal', 'work', 'market'];

    for (let step = 0; step < 240; step += 1) {
      if (step % 40 === 0) {
        state.policy = policies[(step / 40) % policies.length];
        state.tax = [0.05, 0.15, 0.25, 0.35][(step / 40) % 4];
      }
      tick();
      if (step % 20 === 19 || state.people.length === 0) expectPopulationInvariants(state);
    }

    expectPopulationInvariants(state);
    expect(state.day).toBe(240);
  });
});
