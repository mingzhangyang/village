import { beforeEach, describe, expect, it } from 'vitest';
import { newState, normalizeState } from '../src/simulation/state.js';
import { createHejingStorage } from '../src/storage/index.js';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

let browserStorage;
let saves;

beforeEach(() => {
  browserStorage = new MemoryStorage();
  saves = createHejingStorage(browserStorage);
});

describe('save migration compatibility', () => {
  it('migrates a pre-seed v1 save and lets simulation normalization restore RNG fields', () => {
    const legacy = { ...newState(77), day: 63 };
    delete legacy.seed;
    delete legacy.rngState;
    browserStorage.setItem('hejing-save-v1', JSON.stringify(legacy));

    const boot = saves.bootstrap();
    const normalized = normalizeState(boot.session.state);

    expect(boot.migrated).toBe(true);
    expect(browserStorage.getItem('hejing-save-v1')).toBeNull();
    expect(normalized.day).toBe(63);
    expect(Number.isFinite(normalized.seed)).toBe(true);
    expect(normalized.rngState).toBe(normalized.seed);
  });

  it('keeps a damaged v1 save untouched instead of replacing it', () => {
    const raw = '{broken legacy json';
    browserStorage.setItem('hejing-save-v1', raw);

    const boot = saves.bootstrap();

    expect(boot.migrated).toBe(false);
    expect(boot.migrationError).toContain('损坏');
    expect(browserStorage.getItem('hejing-save-v1')).toBe(raw);
    expect(saves.listSlots()).toHaveLength(0);
  });

  it('falls back to the origin world when an active challenge save is damaged', () => {
    const originState = { ...newState(88), day: 42, food: 512 };
    const origin = saves.createSlot('原世界', originState, true);
    saves.startChallenge({ ...newState(99), ch: { id: 'drought' } }, '三年大旱');
    browserStorage.setItem('hejing-challenge-v2', '{broken challenge json');

    const restored = saves.loadActive();

    expect(restored).toMatchObject({ kind: 'slot', id: origin.id, state: originState });
    expect(saves.getActiveInfo()).toMatchObject({ kind: 'slot', id: origin.id });
  });
});
