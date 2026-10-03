import { afterEach, describe, expect, it } from 'vitest';
import { changeRel, makePerson, remove, seedPopulation, setRel, uniqueName } from '../src/simulation/population.js';
import { givenNameFromDisplayName, surnameFromName } from '../src/simulation/names.js';
import { newState, setState } from '../src/simulation/state.js';

afterEach(() => {
  setState(null);
});

function seededState(seed = 9001) {
  const state = newState(seed);
  setState(state);
  seedPopulation();
  return state;
}

describe('population', () => {
  it('seeds the expected village populations with unique ids and valid family links', () => {
    const state = seededState();
    const ids = state.people.map(person => person.id);
    const counts = state.people.reduce((result, person) => {
      result[person.village] = (result[person.village] || 0) + 1;
      return result;
    }, {});

    expect(state.people).toHaveLength(30);
    expect(new Set(ids).size).toBe(ids.length);
    expect(counts).toEqual({ pine: 10, grain: 11, bay: 9 });

    const byId = new Map(state.people.map(person => [person.id, person]));
    for (const person of state.people) {
      for (const parentId of person.parents) {
        const parent = byId.get(parentId);
        expect(parent, `parent ${parentId} should exist`).toBeDefined();
        expect(parent.children).toContain(person.id);
      }
      if (person.partner) {
        const partner = byId.get(person.partner);
        expect(partner, `partner ${person.partner} should exist`).toBeDefined();
        expect(partner.partner).toBe(person.id);
      }
    }
  });

  it('inherits the father surname for children regardless of parent id order', () => {
    const state = newState(9004);
    setState(state);
    const father = makePerson({ village: 'grain', age: 20, gender: '男', name: '许溪归' });
    const mother = makePerson({ village: 'grain', age: 20, gender: '女', name: '林岚' });
    const child = makePerson({
      village: 'grain',
      age: 0,
      parents: [mother.id, father.id],
      home: father.home,
    });

    expect(child.surname).toBe('许');
    expect(child.name.startsWith('许')).toBe(true);
  });

  it('preserves legacy RNG consumption when generating an inherited surname', () => {
    const probe = newState(9005);
    setState(probe);
    const legacyName = uniqueName();
    const inheritedSurname = surnameFromName(legacyName) === '许' ? '林' : '许';
    const inheritedCandidate = `${inheritedSurname}${givenNameFromDisplayName(legacyName)}`;

    const inherited = newState(9005);
    inherited.people = [{ id: 99, name: inheritedCandidate }];
    setState(inherited);
    const inheritedName = uniqueName(inheritedSurname, 100);
    const inheritedRngState = inherited.rngState;

    const legacy = newState(9005);
    legacy.people = [{ id: 99, name: inheritedCandidate }];
    setState(legacy);
    uniqueName();

    expect(inherited.rngState).toBe(legacy.rngState);
    expect(inheritedRngState).toBe(legacy.rngState);
    expect(inheritedName.startsWith(inheritedSurname)).toBe(true);
    expect(inheritedName).not.toBe(inheritedCandidate);
  });

  it('does not treat a lone mother as a father when creating a child', () => {
    const state = newState(9006);
    setState(state);
    const mother = makePerson({ village: 'grain', age: 20, gender: '女', name: '林岚' });
    const child = makePerson({
      village: 'grain',
      age: 0,
      parents: [mother.id],
      home: mother.home,
    });

    expect(child.surname).not.toBe('林');
  });

  it('keeps relationship scores symmetric and clamps them to the supported range', () => {
    const state = seededState(9002);
    const [first, second] = state.people;

    setRel(first, second, 39);
    delete first.met[second.id];
    delete second.met[first.id];
    changeRel(first, second, 5);

    expect(first.rel[second.id]).toBe(44);
    expect(second.rel[first.id]).toBe(44);
    expect(first.met[second.id]).toBe(1);
    expect(second.met[first.id]).toBe(1);

    changeRel(first, second, 500);
    expect(first.rel[second.id]).toBe(100);
    expect(second.rel[first.id]).toBe(100);

    changeRel(first, second, -500);
    expect(first.rel[second.id]).toBe(-100);
    expect(second.rel[first.id]).toBe(-100);
  });

  it('cleans up a surviving partner when a resident dies', () => {
    const state = seededState(9003);
    const resident = state.people.find(person => person.partner);
    const partner = state.people.find(person => person.id === resident.partner);
    const beforeHappiness = partner.happiness;

    remove(resident, 'dead', '疫病');

    expect(state.people).not.toContain(resident);
    expect(state.dead).toContain(resident);
    expect(partner.partner).toBeNull();
    expect(partner.rel[resident.id]).toBeUndefined();
    expect(partner.happiness).toBe(beforeHappiness - 18);
  });
});
