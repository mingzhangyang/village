import { afterEach, describe, expect, it } from 'vitest';
import { challengeDeadlineReached, createChallenges } from '../src/simulation/challenges.js';
import { YEAR, SEASON } from '../src/simulation/clock.js';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { newState, normalizeState, setState } from '../src/simulation/state.js';
import { rand, random } from '../src/simulation/random.js';
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

function createChallengeRules(state) {
  return createChallenges({
    getState: () => state,
    YEAR,
    SEASON,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    rand,
    chron: () => {},
  });
}

function configureSmokeEconomy() {
  configureEconomy({
    buildingCount: () => 0,
    totalBuildingCount: () => 0,
    foodCapacity: () => 450,
    computeHouses: () => {},
    maybeDilemma: () => {},
    checkChallenge: () => {},
  });
}

function runSeededTicks(seed, count) {
  const state = newState(seed);
  setState(state);
  seedPopulation();
  configureSmokeEconomy();
  for (let day = 0; day < count; day++) tick();
  return JSON.parse(JSON.stringify(state));
}

describe('simulation smoke invariants', () => {
  it('creates a complete new state and advances a tick without non-finite numbers', () => {
    const state = newState(1);
    setState(state);
    seedPopulation();
    configureSmokeEconomy();

    expect(state).toMatchObject({
      v: 1,
      seed: 1,
      rngState: expect.any(Number),
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

  it('replays the same simulation from the same world seed and input', () => {
    const first = runSeededTicks(739391, 6);
    const second = runSeededTicks(739391, 6);

    expect(second).toEqual(first);
  });

  it('sets up a challenge with the same random choices from the same seed', () => {
    function setupEqualChallenge(seed) {
      const state = newState(seed);
      setState(state);
      seedPopulation();
      createChallengeRules(state).equal.setup();
      return state.people.map(person => [person.id, person.wealth]);
    }

    expect(setupEqualChallenge(5129)).toEqual(setupEqualChallenge(5129));
  });

  it('resumes the saved random stream after state normalization', () => {
    const state = newState(8241);
    setState(state);
    random();
    random();
    const restored = normalizeState(JSON.parse(JSON.stringify(state)));

    setState(state);
    const expected = random();
    setState(restored);

    expect(random()).toBe(expected);
  });

  it('assigns a stable seed when loading a legacy state without RNG fields', () => {
    const legacy = newState(91);
    delete legacy.seed;
    delete legacy.rngState;
    const first = normalizeState(legacy);
    const second = normalizeState(JSON.parse(JSON.stringify(legacy)));

    expect(first.seed).toBe(second.seed);
    expect(first.rngState).toBe(first.seed);
  });

  it.each([
    ['deceased', 'dead', '疫病'],
    ['departed', 'left', undefined],
    ['wandered away', 'left', 'wander'],
  ])('removes %s people from the living collection', (kind, status, cause) => {
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
    const left0 = state.left;
    const context = { left0 };
    const challenges = createChallengeRules(state);

    remove(person, status, cause);

    expect(state.people).not.toContain(person);
    expect(state.dead).toContain(person);
    expect(person.status).toBe(status);
    expect(new Set(state.people.map(item => item.id)).has(person.id)).toBe(false);

    if (status === 'dead') {
      expect(state.left).toBe(left0);
    } else {
      expect(state.left).toBe(left0 + 1);
      expect(state.lastLeft).toBe(person.name);
      expect(challenges.stay.check(context, state.day).st).toBe('lose');
    }
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
    const challenges = createChallengeRules(state);
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
