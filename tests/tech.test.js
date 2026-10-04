import { afterEach, describe, expect, it } from 'vitest';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { seedPopulation } from '../src/simulation/population.js';
import { newState, normalizeState, setState } from '../src/simulation/state.js';
import {
  TECHS, TECH_KEYS, SHIP_INTERVAL, advanceResearch, cancelResearch, era, hasTech,
  researchBlock, researchRate, startResearch, techBonus, techCount, techMult,
} from '../src/simulation/tech.js';

afterEach(() => {
  setState(null);
  configureEconomy({});
});

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

  it('blocks research on prerequisites, world conditions and treasury', () => {
    const state = newState(2);
    state.treasury = 1000;
    expect(researchBlock(state, 'iron')).toContain('轮作休耕');
    state.tech.rotation = 0;
    expect(researchBlock(state, 'iron')).toContain('矿脉');
    state.mine = true;
    expect(researchBlock(state, 'iron')).toBe('');
    state.treasury = 10;
    expect(researchBlock(state, 'iron')).toContain('公库');
    state.tech.iron = 0;
    state.treasury = 1000;
    expect(researchBlock(state, 'waterwheel')).toContain('水渠');
    state.canal = true;
    expect(researchBlock(state, 'waterwheel')).toBe('');
    expect(researchBlock(state, 'rotation')).toBe('已经掌握。');
  });

  it('charges on start, allows one project at a time and refunds half on cancel', () => {
    const state = newState(3);
    state.treasury = 200;
    expect(startResearch(state, 'rotation')).toBe(true);
    expect(state.treasury).toBe(160);
    expect(startResearch(state, 'nets')).toBe(false);
    expect(researchBlock(state, 'nets')).toContain('轮作休耕');
    expect(cancelResearch(state)).toBe(20);
    expect(state.treasury).toBe(180);
    expect(state.research).toBeNull();
  });

  it('research speed grows with workers, the school and printing', () => {
    const state = newState(4);
    expect(researchRate(state, 0)).toBeCloseTo(0.5);
    expect(researchRate(state, 15)).toBeCloseTo(1);
    expect(researchRate(state, 40)).toBeCloseTo(1);
    state.school = true;
    expect(researchRate(state, 15)).toBeCloseTo(1.25);
    state.tech.printing = 0;
    expect(researchRate(state, 15)).toBeCloseTo(1.625);
  });

  it('completes research once enough work accumulates', () => {
    const state = newState(5);
    state.treasury = 100;
    state.day = 77;
    startResearch(state, 'nets');
    let done = null;
    for (let day = 0; day < TECHS.nets.days - 1; day += 1) done = advanceResearch(state, 15);
    expect(done).toBeNull();
    done = advanceResearch(state, 15);
    expect(done).toBe('nets');
    expect(state.tech.nets).toBe(77);
    expect(state.research).toBeNull();
    expect(era(state)).toBe('开垦');
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
    expect(normalizeState({ v: 1, seed: 9, research: { id: 'nets', prog: 4 } }).research).toEqual({ id: 'nets', prog: 4 });
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
    const state = seededWorld(32, s => { s.treasury = 500; startResearch(s, 'ledger'); });
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
