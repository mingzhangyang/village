import { afterEach, describe, expect, it } from 'vitest';
import { challengeDeadlineReached, createChallenges } from '../src/simulation/challenges.js';
import { YEAR, SEASON } from '../src/simulation/clock.js';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { newState, setState } from '../src/simulation/state.js';
import { remove, seedPopulation } from '../src/simulation/population.js';

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

afterEach(() => {
  setState(null);
  configureEconomy({});
});

describe('simulation smoke invariants', () => {
  it('creates a complete new state and advances a tick without non-finite numbers', () => {
    const state = newState();
    setState(state);
    seedPopulation();
    configureEconomy({
      buildingCount: () => 0,
      totalBuildingCount: () => 0,
      foodCapacity: () => 450,
      computeHouses: () => {},
      maybeDilemma: () => {},
      checkChallenge: () => {},
    });

    expect(state).toMatchObject({
      v: 1,
      day: 0,
      people: expect.any(Array),
      dead: expect.any(Array),
      hist: expect.objectContaining({ pop: expect.any(Array), food: expect.any(Array) }),
    });
    expect(state.people).toHaveLength(30);

    tick();

    expect(state.day).toBe(1);
    expectFiniteNumbers(state);
    const livingIds = new Set(state.people.map(person => person.id));
    expect(state.dead.every(person => !livingIds.has(person.id))).toBe(true);
  });

  it('removes deceased and departed people from the living collection', () => {
    const state = newState();
    const person = {
      id: 1,
      name: '测试居民',
      gender: '男',
      age: 40,
      job: 'farmer',
      status: 'alive',
      hist: [],
      rel: {},
      partner: null,
      happiness: 70,
      parents: [],
      children: [],
      wealth: 10,
      village: 'grain',
      traits: [],
    };
    state.people = [person];
    state.sel = person.id;
    setState(state);

    remove(person, 'dead', '疫病');

    expect(state.people).not.toContain(person);
    expect(state.dead).toContain(person);
    expect(person.status).toBe('dead');
    expect(new Set(state.people.map(item => item.id)).has(person.id)).toBe(false);
  });
});

describe('challenge deadlines', () => {
  it.each([
    ['drought', 120],
    ['equal', 400],
    ['grow', 600],
    ['stay', 320],
  ])('ends %s at its existing deadline, not one day earlier', (id, deadline) => {
    expect(challengeDeadlineReached(id, deadline - 1)).toBe(false);
    expect(challengeDeadlineReached(id, deadline)).toBe(true);
  });

  it('keeps each existing challenge active until its original expiry day', () => {
    const state = newState();
    state.people = Array.from({ length: 26 }, () => ({ happiness: 50 }));
    state.gini = 0.4;
    state.cohesion = 40;
    setState(state);
    const challenges = createChallenges({
      getState: () => state,
      YEAR,
      SEASON,
      clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
      rand: (min, max) => min + Math.random() * (max - min),
      chron: () => {},
    });
    const cases = [
      ['drought', 120, { hd0: 0 }],
      ['equal', 400, { hold: 0 }],
      ['grow', 600, {}],
      ['stay', 320, { left0: 0 }],
    ];

    for (const [id, deadline, challengeState] of cases) {
      state.hungerDeaths = 0;
      state.left = 0;
      const context = { ...challengeState };
      expect(challenges[id].check(context, deadline - 1).st).toBe('run');
      expect(challenges[id].check(context, deadline).st).not.toBe('run');
    }
  });
});
