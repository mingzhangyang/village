import { afterEach, describe, expect, it } from 'vitest';
import { MAP, ISLE, VKEYS } from '../src/world/map.js';
import { homeTile, seedPopulation } from '../src/simulation/population.js';
import { newState, setState } from '../src/simulation/state.js';
import { describeBuilding, describeHouse, describeTile, describeVillage, villageOf } from '../src/ui/inspect.js';

afterEach(() => setState(null));

function world(seed = 61) {
  const state = newState(seed);
  setState(state);
  seedPopulation();
  return state;
}
const first = type => MAP.all.find(t => !t.isle && t.type === type);

describe('map inspector', () => {
  it('finds the village a tile belongs to', () => {
    for (const k of VKEYS) {
      expect(villageOf(MAP.V[k].center)).toBe(k);
      expect(villageOf(MAP.V[k].slots[3])).toBe(k);
    }
    expect(villageOf(MAP.isle.tiles[0])).toBe(ISLE);
  });

  it('summarizes a village', () => {
    const state = world();
    const card = describeVillage(state, 'grain');
    const residents = state.people.filter(p => p.village === 'grain').length;
    expect(card.title).toBe('禾谷村');
    expect(card.rows.find(r => r[0] === '人口')[1]).toContain(`${residents} 人`);
  });

  it('shows no average worker skill when a village has residents but no workers', () => {
    const state = world();
    const residents = state.people.filter(p => p.village === 'grain');
    for (const [index, p] of residents.entries()) p.job = index % 2 ? 'child' : 'elder';
    const card = describeVillage(state, 'grain');
    expect(card.rows.find(r => r[0] === '平均技能')[1]).toBe('—');
  });

  it('lists the people living in a house', () => {
    const state = world();
    const p = state.people.find(q => q.partner);
    const card = describeHouse(state, homeTile(p));
    const ids = card.people.map(x => x.id);
    expect(ids).toContain(p.id);
    expect(ids).toContain(p.partner);
    const empty = MAP.V.pine.slots.find(t => !state.people.some(q => homeTile(q) === t));
    if (empty) expect(describeHouse(state, empty).title).toBe('空屋');
  });

  it('offers an upgrade button that reflects the treasury', () => {
    const state = world();
    const b = { b: 'well', v: 'pine', i: 0, j: 0 };
    state.treasury = 0;
    const poor = describeBuilding(state, b).actions[0];
    expect(poor.disabled).toBe(true);
    expect(poor.hint).toContain('公库');
    state.treasury = 100;
    expect(describeBuilding(state, b).actions[0].disabled).toBe(false);
    b.lv = 3;
    expect(describeBuilding(state, b).actions).toEqual([]);
  });

  it('describes every kind of terrain without changing the world', () => {
    const state = world();
    const before = JSON.stringify(state);
    const houses = new Set(state.people.map(homeTile));
    expect(describeTile(state, first('field'), { houses }).title).toBe('农田');
    expect(describeTile(state, first('water'), { houses }).title).toBe('溪水');
    expect(describeTile(state, first('mountain'), { houses }).title).toBe('大山');
    expect(describeTile(state, first('forest'), { houses }).title).toMatch(/林/);
    expect(describeTile(state, MAP.mine, { houses }).title).toBe('裸露的岩层');
    state.mine = true;
    expect(describeTile(state, MAP.mine, { houses }).title).toBe('矿洞');
    state.mine = false;
    expect(describeTile(state, MAP.V.bay.center, { houses }).title).toBe('溪湾聚落');
    expect(describeTile(state, homeTile(state.people[0]), { houses }).people.length).toBeGreaterThan(0);
    expect(describeTile(state, MAP.isle.tiles[0], { houses }).title).toBe('南屿 · 无人小岛');
    expect(JSON.stringify(state)).toBe(before);
  });
});
