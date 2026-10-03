import { afterEach, describe, expect, it } from 'vitest';
import { createChallenges } from '../src/simulation/challenges.js';
import { SEASON, YEAR } from '../src/simulation/clock.js';
import { rand } from '../src/simulation/random.js';
import { newState, setState } from '../src/simulation/state.js';

function rulesFor(state) {
  setState(state);
  return createChallenges({
    getState: () => state,
    YEAR,
    SEASON,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    rand,
    chron: () => {},
  });
}

afterEach(() => {
  setState(null);
});

describe('challenge rules', () => {
  it('starts each drought on the summer boundary during the three-year window', () => {
    const state = newState(1201);
    state.ch = { id: 'drought', start: 0 };
    state.day = SEASON;
    const challenges = rulesFor(state);

    challenges.drought.tick();

    expect(state.drought).toBe(SEASON + 1);
  });

  it('loses the drought challenge immediately after a hunger death', () => {
    const state = newState(1202);
    state.people = Array.from({ length: 30 }, (_, id) => ({ id }));
    state.hungerDeaths = 1;
    state.lastHunger = '阿禾';
    const result = rulesFor(state).drought.check({ hd0: 0 }, 20);

    expect(result).toMatchObject({ st: 'lose' });
    expect(result.why).toContain('阿禾');
  });

  it('wins the equal challenge after thirty consecutive qualifying days', () => {
    const state = newState(1203);
    state.people = Array.from({ length: 12 }, () => ({ happiness: 70 }));
    state.gini = 0.2;
    const context = { hold: 29 };

    const result = rulesFor(state).equal.check(context, 100);

    expect(context.hold).toBe(30);
    expect(result.st).toBe('win');
  });

  it('resets the equal challenge hold when either target slips', () => {
    const state = newState(1204);
    state.people = Array.from({ length: 12 }, () => ({ happiness: 64 }));
    state.gini = 0.2;
    const context = { hold: 18 };

    const result = rulesFor(state).equal.check(context, 100);

    expect(context.hold).toBe(0);
    expect(result.st).toBe('run');
  });

  it('wins grow immediately at 55 residents and resolves stay by cohesion at expiry', () => {
    const growState = newState(1205);
    growState.people = Array.from({ length: 55 }, (_, id) => ({ id }));
    expect(rulesFor(growState).grow.check({}, 250).st).toBe('win');

    const stayState = newState(1206);
    stayState.people = Array.from({ length: 20 }, (_, id) => ({ id }));
    stayState.cohesion = 50;
    stayState.left = 0;
    expect(rulesFor(stayState).stay.check({ left0: 0 }, 320).st).toBe('win');

    stayState.cohesion = 49.4;
    expect(rulesFor(stayState).stay.check({ left0: 0 }, 320).st).toBe('lose');
  });
});
