import { getState } from './state.js';
import { nextRandomValue } from './rng.js';

export function random() {
  const state = getState();
  if (!state) throw new Error('A world state is required for simulation randomness.');
  const next = nextRandomValue(state.rngState ?? state.seed);
  state.rngState = next.state;
  return next.value;
}

export const rand = (a, b) => a + random() * (b - a);
export const randi = (a, b) => Math.floor(a + random() * (b - a + 1));
export const pick = values => values[Math.floor(random() * values.length)];
export const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
export const has = (person, trait) => person.traits.indexOf(trait) >= 0;
