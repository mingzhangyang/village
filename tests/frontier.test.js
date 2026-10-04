import { afterEach, describe, expect, it } from 'vitest';
import { MAP, ISLE, VKEYS, ALL_VKEYS } from '../src/world/map.js';
import { YEAR } from '../src/simulation/clock.js';
import { configureEconomy, tick } from '../src/simulation/economy.js';
import { chooseJob, homeTile, makePerson, seedPopulation, remove } from '../src/simulation/population.js';
import { newState, normalizeState, setState } from '../src/simulation/state.js';
import {
  FRONTIER, activeVillages, canMine, expeditionChecks, expeditionReady, frontierTick, hardshipFor, islandAdults,
  isVolunteer, isleVisible, launchExpedition, pickSettlers, retryLeft, workFactor,
} from '../src/simulation/frontier.js';

afterEach(() => {
  setState(null);
  configureEconomy({});
});

function readyWorld(seed = 51) {
  const state = newState(seed);
  setState(state);
  seedPopulation();
  while (state.people.length < FRONTIER.population) {
    makePerson({ village: VKEYS[state.people.length % 3], age: 25 * YEAR, wealth: 20, happiness: 70 });
  }
  for (const p of state.people) { p.health = 100; p.happiness = 70; }
  state.tech.searoute = 0;
  state.treasury = 350;
  state.food = 500;
  state.cohesion = 70;
  return state;
}

describe('the islet on the map', () => {
  it('is separated from the main island by sea and kept out of shared lists', () => {
    const main = MAP.all.filter(t => !t.isle);
    for (const t of MAP.isle.tiles) {
      for (const m of main) expect(Math.max(Math.abs(t.i - m.i), Math.abs(t.j - m.j)), `${t.i},${t.j}`).toBeGreaterThan(1);
      expect(MAP.fields).not.toContain(t);
      expect(MAP.forest).not.toContain(t);
      expect(MAP.edge).not.toContain(t);
    }
    expect(MAP.V[ISLE].slots.length).toBeGreaterThanOrEqual(6);
    expect(MAP.V[ISLE].center.type).toBe('plaza');
  });
});

describe('expedition requirements', () => {
  it('starts hidden and far from ready', () => {
    const state = newState(1);
    setState(state);
    seedPopulation();
    expect(isleVisible(state)).toBe(false);
    expect(activeVillages(state)).toEqual(VKEYS);
    expect(expeditionReady(state)).toBe(false);
    const failing = expeditionChecks(state).filter(c => !c.ok).map(c => c.k);
    expect(failing).toEqual(expect.arrayContaining(['tech', 'population', 'treasury', 'cohesion']));
  });

  it('needs every condition at once', () => {
    const state = readyWorld();
    expect(expeditionReady(state)).toBe(true);
    for (const [key, value] of [['treasury', 299], ['food', 399], ['cohesion', 59]]) {
      const before = state[key];
      state[key] = value;
      expect(expeditionReady(state), key).toBe(false);
      state[key] = before;
    }
    for (const p of state.people) p.happiness = 40;
    expect(expeditionReady(state)).toBe(false);
  });

  it('takes volunteers with their partners and young children', () => {
    const state = readyWorld();
    const team = pickSettlers(state);
    expect(team.filter(isVolunteer).length).toBeGreaterThanOrEqual(FRONTIER.volunteers);
    for (const p of team) {
      if (p.partner) expect(team.map(q => q.id)).toContain(p.partner);
    }
  });
});

describe('the pioneer phase', () => {
  it('charges the cost and moves settlers to the islet', () => {
    const state = readyWorld();
    const team = launchExpedition(state);
    expect(team.length).toBeGreaterThan(0);
    expect(state.treasury).toBe(50);
    expect(state.food).toBe(300);
    expect(state.frontier.stage).toBe('pioneer');
    for (const p of team) {
      expect(p.village).toBe(ISLE);
      expect(workFactor(state, p)).toBe(FRONTIER.pioneerWork);
      expect(hardshipFor(state, p)).toBe(FRONTIER.hardship);
    }
    expect(launchExpedition(state)).toBeNull();
    expect(activeVillages(state)).toEqual(VKEYS);
  });

  it('fails when too few workers remain, sending everyone home', () => {
    const state = readyWorld();
    const team = launchExpedition(state);
    const origins = { ...state.frontier.origin };
    const adults = islandAdults(state);
    for (const p of adults.slice(0, adults.length - FRONTIER.minAdults + 1)) remove(p, 'left');
    const result = frontierTick(state);
    expect(result.event).toBe('failed');
    expect(state.frontier.stage).toBe('failed');
    expect(retryLeft(state)).toBe(FRONTIER.retryDays);
    expect(expeditionChecks(state).find(c => c.k === 'retry').ok).toBe(false);
    for (const p of team.filter(q => q.status === 'alive')) expect(p.village).toBe(origins[p.id]);
  });

  it('brings the young children of every qualified adult, partners included', () => {
    const state = readyWorld();
    const team = pickSettlers(state);
    const partner = team.find(p => isVolunteer(p) && team.some(q => q.partner === p.id && team.indexOf(q) < team.indexOf(p)));
    expect(partner).toBeTruthy();
    const kid = makePerson({ village: partner.village, age: 3 * YEAR, parents: [partner.id] });
    partner.children.push(kid.id);
    expect(pickSettlers(state)).toContain(kid);
  });

  it('keeps pioneers away from the mainland mine', () => {
    const state = readyWorld();
    state.mine = true;
    const miner = state.people.find(p => p.job !== 'child' && p.job !== 'elder');
    miner.job = 'miner';
    expect(canMine(state, miner)).toBe(true);
    miner.village = ISLE;
    state.frontier = { stage: 'pioneer', start: state.day, origin: {}, tries: 1 };
    expect(canMine(state, miner)).toBe(false);
    state.frontier = { stage: 'settled', day: state.day, tries: 1 };
    expect(canMine(state, miner)).toBe(true);
  });

  it('keeps each family under one roof on the islet and back home', () => {
    const state = readyWorld();
    const team = launchExpedition(state);
    const ids = new Set(team.map(p => p.id));
    const together = () => {
      const alive = id => ids.has(id) && state.people.find(q => q.id === id);
      for (const p of team.filter(q => state.people.includes(q))) {
        for (const id of [p.partner, ...p.parents]) if (alive(id)) expect(alive(id).home, p.name).toBe(p.home);
      }
    };
    together();
    for (const p of team) expect(p.home).toBeLessThan(MAP.V[ISLE].slots.length);
    for (const p of islandAdults(state).slice(0, -FRONTIER.minAdults + 1)) remove(p, 'left');
    frontierTick(state);
    expect(state.frontier.stage).toBe('failed');
    together();
  });

  it('does not count workers a storm has just killed', () => {
    const state = readyWorld();
    launchExpedition(state);
    state.day += FRONTIER.pioneerDays;
    const adults = islandAdults(state);
    for (const p of adults.slice(0, adults.length - FRONTIER.minAdults + 1)) p.health = 0;
    expect(islandAdults(state).length).toBe(FRONTIER.minAdults - 1);
    expect(frontierTick(state).event).toBe('failed');
  });

  it('sends settlers and returnees walking straight to their new homes', () => {
    const state = readyWorld();
    const team = launchExpedition(state);
    for (const p of team) {
      const h = homeTile(p);
      expect([p.tx, p.ty]).toEqual([h.i, h.j]);
    }
    const adults = islandAdults(state);
    for (const p of adults.slice(0, adults.length - FRONTIER.minAdults + 1)) remove(p, 'left');
    frontierTick(state);
    for (const p of team.filter(q => state.people.includes(q))) {
      expect(p.village).not.toBe(ISLE);
      const h = homeTile(p);
      expect([p.tx, p.ty]).toEqual([h.i, h.j]);
    }
  });

  it('keeps pioneers and mainlanders from meeting across the sea', () => {
    const state = readyWorld(53);
    const team = launchExpedition(state);
    expect(team.length).toBeGreaterThan(0);
    const before = new Map(state.people.map(p => [p.id, { ...p.rel }]));
    for (let day = 0; day < 20; day += 1) tick();
    expect(state.frontier.stage).toBe('pioneer');
    const mainland = new Set(state.people.filter(q => q.village !== ISLE).map(q => q.id));
    for (const p of state.people.filter(q => q.village === ISLE)) {
      for (const k of Object.keys(p.rel)) {
        if (mainland.has(+k)) expect(p.rel[k], `${p.name}→${k}`).toBeLessThanOrEqual(before.get(p.id)[k] ?? 0);
      }
    }
  });

  it('never turns a pioneer into a miner', () => {
    const state = readyWorld();
    state.mine = true;
    const team = launchExpedition(state);
    for (let k = 0; k < 200; k += 1) for (const p of team) expect(chooseJob(p)).not.toBe('miner');
  });

  it('fails at the end of the term if morale is too low', () => {
    const state = readyWorld();
    launchExpedition(state);
    state.day += FRONTIER.pioneerDays;
    for (const p of islandAdults(state)) p.happiness = FRONTIER.minMorale - 5;
    expect(frontierTick(state).event).toBe('failed');
  });

  it('settles the islet as a fourth village after a successful term', () => {
    const state = readyWorld();
    const team = launchExpedition(state);
    state.day += FRONTIER.pioneerDays;
    expect(frontierTick(state).event).toBe('settled');
    expect(activeVillages(state)).toEqual(ALL_VKEYS);
    const farmer = team.find(p => p.job === 'farmer');
    if (farmer) expect(workFactor(state, farmer)).toBeCloseTo(1 + FRONTIER.farmBonus);
    expect(hardshipFor(state, team[0])).toBe(0);
  });

  it('does not consume randomness outside the pioneer phase', () => {
    const state = readyWorld();
    const rng = state.rngState;
    expect(frontierTick(state)).toBeNull();
    expect(state.rngState).toBe(rng);
  });

  it('runs through the whole term inside the simulation', () => {
    const state = readyWorld(52);
    launchExpedition(state);
    for (let day = 0; day < FRONTIER.pioneerDays + 5 && state.people.length; day += 1) tick();
    expect(['settled', 'failed']).toContain(state.frontier.stage);
    expect(Number.isFinite(state.food)).toBe(true);
    for (const p of state.people) expect(ALL_VKEYS).toContain(p.village);
    if (state.frontier.stage === 'failed') for (const p of state.people) expect(p.village).not.toBe(ISLE);
  });
});

describe('saves', () => {
  it('normalizes missing and malformed frontier state', () => {
    expect(normalizeState({ v: 1, seed: 3 }).frontier).toBeNull();
    expect(normalizeState({ v: 1, seed: 3, frontier: { stage: 'bogus' } }).frontier).toBeNull();
    expect(normalizeState({ v: 1, seed: 3, day: 9, frontier: { stage: 'settled' } }).frontier).toEqual({ stage: 'settled', day: 9, tries: 1 });
    const pioneer = normalizeState({ v: 1, seed: 3, day: 9, frontier: { stage: 'pioneer', start: 4, origin: { 1: 'bay' }, tries: 2 } }).frontier;
    expect(pioneer).toEqual({ stage: 'pioneer', start: 4, origin: { 1: 'bay' }, tries: 2 });
  });
});
