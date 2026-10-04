import { describe, expect, it } from 'vitest';
import { monotonicDay } from '../src/simulation/invariants.js';
import { newState, normalizeState } from '../src/simulation/state.js';

describe('simulation state invariants', () => {
  it('clamps resident happiness when loading saves', () => {
    const state = newState(42);
    state.people = [
      { id: 1, happiness: 121 },
      { id: 2, happiness: -9 },
      { id: 3, happiness: Number.NaN },
    ];
    state.dead = [{ id: 4, happiness: 180 }];

    const normalized = normalizeState(state);

    expect(normalized.people.map(person => person.happiness)).toEqual([100, 0, 50]);
    expect(normalized.dead[0].happiness).toBe(100);
  });

  it('never permits an active simulation day to move backwards', () => {
    expect(monotonicDay(15, 16)).toBe(16);
    expect(monotonicDay(15, 15)).toBe(15);
    expect(monotonicDay(15, 9)).toBe(15);
    expect(monotonicDay(15, Number.NaN)).toBe(15);
  });

  it('normalizes a persisted world name', () => {
    const state = newState(7);
    state.worldName = '  山海溪谷  ';

    expect(normalizeState(state).worldName).toBe('山海溪谷');
  });
});
