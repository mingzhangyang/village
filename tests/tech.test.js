import { afterEach, describe, expect, it } from 'vitest';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { seedPopulation } from '../src/simulation/population.js';
import { newState, normalizeState, setState } from '../src/simulation/state.js';
import {
  TECHS, TECH_KEYS, SHIP_INTERVAL, advanceResearch, cancelResearch, era, hasTech,
  researchBlock, researchRate, researchStall, startResearch, techBonus, techCount, techMult, techNeeds,
} from '../src/simulation/tech.js';

afterEach(() => {
  setState(null);
  configureEconomy({});
});

let nextId = 1000;
function hire(state, job, n, skill) {
  const hired = [];
  for (let k = 0; k < n; k += 1) {
    const p = { id: nextId++, job, skill, age: 30, village: 'bay', happiness: 60 };
    state.people.push(p);
    hired.push(p);
  }
  return hired;
}

function seededWorld(seed, setup = () => {}) {
  const state = newState(seed);
  setState(state);
  seedPopulation();
  setup(state);
  return state;
}

describe('development tree rules', () => {
  it('starts with nothing learned and no research', () => {
    const state = newState(1);
    expect(state.tech).toEqual({});
    expect(state.research).toBeNull();
    expect(techCount(state)).toBe(0);
    expect(era(state)).toBe('草创');
    for (const id of TECH_KEYS) expect(hasTech(state, id)).toBe(false);
  });

  it('only references known prerequisites', () => {
    for (const T of Object.values(TECHS)) {
      for (const r of T.req) {
        expect(TECHS[r], r).toBeDefined();
        expect(TECHS[r].tier).toBeLessThan(T.tier);
      }
    }
  });

  it('blocks research on prerequisites, real-world needs and treasury', () => {
    const state = newState(2);
    state.treasury = 1000;
    expect(researchBlock(state, 'iron')).toContain('轮作休耕');
    state.tech.rotation = 0;
    expect(researchBlock(state, 'iron')).toContain('已发现矿脉');
    state.mine = true;
    expect(researchBlock(state, 'iron')).toContain('矿工');
    hire(state, 'miner', 2, 35);
    hire(state, 'woodcutter', 2, 39);
    expect(researchBlock(state, 'iron')).toContain('樵夫');
    hire(state, 'woodcutter', 2, 40);
    expect(researchBlock(state, 'iron')).toBe('');
    state.treasury = 10;
    expect(researchBlock(state, 'iron')).toContain('公库');
    state.tech.iron = 0;
    state.treasury = 1000;
    expect(researchBlock(state, 'waterwheel')).toContain('已修水渠');
    expect(researchBlock(state, 'rotation')).toBe('已经掌握。');
  });

  it('lists every need with what the village has now', () => {
    const state = newState(2);
    hire(state, 'merchant', 3, 50);
    const rows = techNeeds(state, 'ledger');
    expect(rows.map(r => r.ok)).toEqual([true, false]);
    expect(rows[0].have).toBe('3 位');
    state.built.push({ b: 'market', v: 'bay', i: 0, j: 0 });
    expect(techNeeds(state, 'ledger').every(r => r.ok)).toBe(true);
  });

  it('charges on start, allows one project at a time and refunds half on cancel', () => {
    const state = newState(3);
    state.treasury = 200;
    hire(state, 'farmer', 3, 40);
    hire(state, 'fisher', 2, 40);
    expect(startResearch(state, 'rotation')).toBe(true);
    expect(state.treasury).toBe(160);
    expect(startResearch(state, 'nets')).toBe(false);
    expect(researchBlock(state, 'nets')).toContain('轮作休耕');
    expect(cancelResearch(state)).toBe(20);
    expect(state.treasury).toBe(180);
    expect(state.research).toBeNull();
  });

  it('research speed grows with experts, the school and printing, and slows in hard times', () => {
    const state = newState(4);
    hire(state, 'farmer', 3, 40);
    state.food = 1000;
    expect(researchRate(state, 'rotation')).toBeCloseTo(0.8);
    hire(state, 'farmer', 3, 40);
    expect(researchRate(state, 'rotation')).toBeCloseTo(1);
    state.school = true;
    expect(researchRate(state, 'rotation')).toBeCloseTo(1.25);
    state.tech.printing = 0;
    expect(researchRate(state, 'rotation')).toBeCloseTo(1.625);
    state.drought = 5;
    expect(researchRate(state, 'rotation')).toBeCloseTo(0.8125);
  });

  it('completes research once enough work accumulates', () => {
    const state = newState(5);
    state.treasury = 100;
    state.food = 1000;
    state.day = 77;
    hire(state, 'fisher', 4, 40);
    startResearch(state, 'nets');
    let result = null;
    for (let day = 0; day < TECHS.nets.days - 1; day += 1) result = advanceResearch(state);
    expect(result).toBeNull();
    expect(advanceResearch(state)).toEqual({ done: 'nets' });
    expect(state.tech.nets).toBe(77);
    expect(state.research).toBeNull();
    expect(era(state)).toBe('开垦');
  });

  it('stalls when experts are gone or famine strikes, and resumes later', () => {
    const state = newState(6);
    state.treasury = 100;
    state.food = 1000;
    const fishers = hire(state, 'fisher', 2, 40);
    startResearch(state, 'nets');
    advanceResearch(state);
    const before = state.research.prog;
    fishers[0].job = 'farmer';
    expect(advanceResearch(state)).toEqual({ stalled: 'nets', why: expect.stringContaining('渔民') });
    expect(advanceResearch(state)).toBeNull();
    expect(state.research.prog).toBe(before);
    expect(researchStall(state)).toContain('渔民');
    fishers[0].job = 'fisher';
    expect(advanceResearch(state)).toEqual({ resumed: 'nets' });
    expect(state.research.prog).toBeGreaterThan(before);
    state.food = 0;
    expect(researchStall(state)).toContain('饥荒');
  });

  it('sums effects of learned techs', () => {
    const state = newState(6);
    state.tech = { rotation: 0, iron: 0, waterwheel: 0 };
    expect(techMult(state, 'farm')).toBeCloseTo(1.5);
    expect(techBonus(state, 'cap')).toBe(0);
    state.tech.preserve = 0;
    expect(techBonus(state, 'cap')).toBe(150);
    expect(techMult(state, 'rot')).toBeCloseTo(0.4);
  });

  it('normalizes legacy and malformed saves', () => {
    expect(normalizeState({ v: 1, seed: 9, day: 3, people: [] }).tech).toEqual({});
    const state = normalizeState({
      v: 1, seed: 9, day: 3, people: [],
      tech: { rotation: 12, bogus: 1, nets: 'x' },
      research: { id: 'rotation', prog: 4 },
    });
    expect(state.tech).toEqual({ rotation: 12 });
    expect(state.research).toBeNull();
    expect(normalizeState({ v: 1, seed: 9, research: { id: 'nets', prog: 4 } }).research).toEqual({ id: 'nets', prog: 4, stalled: false });
    expect(normalizeState({ v: 1, seed: 9, research: { id: 'nope', prog: 4 } }).research).toBeNull();
    expect(normalizeState({ v: 1, seed: 9, tech: [1, 2] }).tech).toEqual({});
  });
});

describe('development tree in the simulation', () => {
  it('raises farm output without changing the random stream', () => {
    const plain = seededWorld(31);
    tick();
    const plainRng = plain.rngState;
    const plainFood = plain.foodProd;

    const advanced = seededWorld(31, state => { state.tech.rotation = 0; });
    tick();
    expect(advanced.rngState).toBe(plainRng);
    expect(advanced.foodProd).toBeGreaterThan(plainFood);
  });

  it('advances the active project each day and announces completion', () => {
    const state = seededWorld(32, s => {
      s.treasury = 500;
      s.people.filter(p => p.job !== 'child' && p.job !== 'elder').slice(0, 4).forEach(p => { p.job = 'merchant'; p.skill = 60; });
      s.built.push({ b: 'market', v: 'bay', i: 0, j: 0 });
      expect(startResearch(s, 'ledger')).toBe(true);
    });
    for (let day = 0; day < 60 && state.research; day += 1) tick();
    expect(hasTech(state, 'ledger')).toBe(true);
    expect(state.chron.some(entry => entry.t.includes('记账算学'))).toBe(true);
  });

  it('brings a ship on schedule once the sea route is known', () => {
    const state = seededWorld(33, s => { s.tech.searoute = 0; s.day = SHIP_INTERVAL - 1; });
    tick();
    expect(state.caravan).toBeGreaterThan(0);
    expect(state.chron.some(entry => entry.t.includes('远洋商船'))).toBe(true);
  });

  it('stays finite over long runs with every tech learned', () => {
    const state = seededWorld(34, s => {
      for (const id of TECH_KEYS) s.tech[id] = 0;
      s.mine = true;
      s.canal = true;
    });
    configureEconomy({ foodCapacity: () => 450 + techBonus(state, 'cap') });
    for (let step = 0; step < 400; step += 1) tick();
    expect(Number.isFinite(state.food)).toBe(true);
    expect(Number.isFinite(state.treasury)).toBe(true);
    for (const person of state.people) {
      expect(Number.isFinite(person.wealth)).toBe(true);
      expect(person.skill).toBeLessThanOrEqual(100);
      expect(person.health).toBeLessThanOrEqual(100);
    }
  });
});
