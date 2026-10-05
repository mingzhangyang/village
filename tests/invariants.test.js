import { describe, expect, it } from 'vitest';
import { monotonicDay, normalizeWorldName } from '../src/simulation/invariants.js';
import { newState, normalizeState } from '../src/simulation/state.js';
import { MAX_CHRON_ENTRIES, MAX_PERSON_HISTORY_ENTRIES, MAX_STAT_HISTORY_ENTRIES, ONBOARDING_STEP_GUIDE, ONBOARDING_STEP_DONE, onboardingComplete, setOnboardingStep } from '../src/state-contract.js';

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
    expect(normalizeWorldName('   ','溪谷 2')).toBe('溪谷 2');
    expect(normalizeWorldName('  新世界  ','溪谷 2')).toBe('新世界');
    expect(normalizeWorldName('  山  海  ','溪谷 2')).toBe('山 海');
  });

  it('reapplies retained-history limits when loading imported state', () => {
    const state=newState(19);
    state.chron=Array.from({length:MAX_CHRON_ENTRIES+25},(_,d)=>({d,t:`事件 ${d}`,k:'info'}));
    state.chronVer=-1;
    state.hist.pop=Array.from({length:MAX_STAT_HISTORY_ENTRIES+12},(_,i)=>i);
    state.hist.food=['bad',1,2,3];
    state.people=[{id:1,name:'林川',age:20,happiness:50,hist:Array.from({length:MAX_PERSON_HISTORY_ENTRIES+15},(_,d)=>({d,t:`经历 ${d}`}))}];

    const normalized=normalizeState(state);

    expect(normalized.chron).toHaveLength(MAX_CHRON_ENTRIES);
    expect(normalized.chron[0].d).toBe(25);
    expect(normalized.chronVer).toBe(MAX_CHRON_ENTRIES);
    expect(normalized.hist.pop).toHaveLength(MAX_STAT_HISTORY_ENTRIES);
    expect(normalized.hist.pop[0]).toBe(12);
    expect(normalized.hist.food).toEqual([1,2,3]);
    expect(normalized.people[0].hist).toHaveLength(MAX_PERSON_HISTORY_ENTRIES);
    expect(normalized.people[0].hist[0].d).toBe(15);
  });

  it('makes onboarding resumable while treating legacy saves as complete', () => {
    const fresh=newState(23);
    expect(onboardingComplete(fresh)).toBe(false);
    setOnboardingStep(fresh,ONBOARDING_STEP_GUIDE);
    expect(normalizeState(fresh).onboarding.step).toBe(ONBOARDING_STEP_GUIDE);

    const legacy=newState(24);delete legacy.onboarding;
    const normalizedLegacy=normalizeState(legacy);
    expect(normalizedLegacy.onboarding.step).toBe(ONBOARDING_STEP_DONE);
    expect(onboardingComplete(normalizedLegacy)).toBe(true);
  });
});
