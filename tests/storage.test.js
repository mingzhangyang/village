import { beforeEach, describe, expect, it } from 'vitest';
import { createHejingStorage } from '../src/storage/index.js';
import { newState } from '../src/simulation/state.js';

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

describe('Save System v2', () => {
  it('migrates a valid v1 state and removes the old key after saving it', () => {
    const legacy = { ...newState(), day: 17 };
    browserStorage.setItem('hejing-save-v1', JSON.stringify(legacy));

    const boot = saves.bootstrap();

    expect(boot.migrated).toBe(true);
    expect(browserStorage.getItem('hejing-save-v1')).toBeNull();
    expect(boot.session.state).toEqual(legacy);
    expect(saves.listSlots()).toHaveLength(1);
  });

  it('keeps the v1 key when migration cannot create a sixth slot', () => {
    for (let i = 0; i < saves.MAX_SLOTS; i += 1) {
      saves.createSlot(`世界 ${i + 1}`, newState(), false);
    }
    const legacyText = JSON.stringify({ ...newState(), day: 99 });
    browserStorage.setItem('hejing-save-v1', legacyText);

    const boot = saves.bootstrap();

    expect(boot.migrated).toBe(false);
    expect(boot.migrationError).toContain('槽已满');
    expect(browserStorage.getItem('hejing-save-v1')).toBe(legacyText);
    expect(saves.listSlots()).toHaveLength(saves.MAX_SLOTS);
  });

  it('preserves unrelated saves when one slot contains damaged JSON', () => {
    const damaged = saves.createSlot('损坏的世界', newState(), false);
    const healthyState = { ...newState(), day: 42 };
    const healthy = saves.createSlot('完整的世界', healthyState, true);
    const damagedKey = `hejing-save-v2:${damaged.id}`;
    browserStorage.setItem(damagedKey, '{broken json');

    const slots = saves.listSlots();

    expect(slots.find(slot => slot.id === damaged.id).broken).toBe(true);
    expect(browserStorage.getItem(damagedKey)).toBe('{broken json');
    expect(saves.loadSlot(healthy.id, false).state).toEqual(healthyState);
    expect(saves.loadActive().id).toBe(healthy.id);
  });

  it('replaces the current slot in place so restart survives the next load', () => {
    const oldState = { ...newState(), day: 720, food: 123 };
    const slot = saves.createSlot('长久溪谷', oldState, true);
    const freshState = { ...newState(), day: 0, food: 388 };

    const replaced = saves.replaceSlot(slot.id, freshState, '长久溪谷');

    expect(replaced.id).toBe(slot.id);
    expect(saves.getActiveInfo()).toMatchObject({ kind: 'slot', id: slot.id, name: '长久溪谷' });
    expect(saves.loadActive()).toMatchObject({ kind: 'slot', id: slot.id, state: freshState });
    expect(saves.listSlots()).toHaveLength(1);
    expect(saves.listSlots()[0]).toMatchObject({ id: slot.id, day: 0 });
  });

  it('imports an exported envelope into a new slot without changing the active slot', () => {
    const originalState = { ...newState(), day: 31 };
    const original = saves.createSlot('原来的世界', originalState, true);
    const exported = saves.exportSlot(original.id);

    const imported = saves.importText(exported);

    expect(imported.id).not.toBe(original.id);
    expect(saves.getActiveInfo().id).toBe(original.id);
    expect(saves.loadSlot(imported.id, false).state).toEqual(originalState);
    expect(saves.exportSlot(imported.id)).toContain('hejing-save-export');
  });

  it('enforces the five-slot limit', () => {
    for (let i = 0; i < saves.MAX_SLOTS; i += 1) {
      saves.createSlot(`世界 ${i + 1}`, newState(), false);
    }

    expect(() => saves.createSlot('第六个世界', newState(), false)).toThrowError(
      expect.objectContaining({ code: 'SLOTS_FULL' }),
    );
    expect(saves.listSlots()).toHaveLength(5);
  });

  it('keeps the origin slot when a challenge starts and restores it on return', () => {
    const originState = { ...newState(), day: 23, food: 411 };
    const origin = saves.createSlot('长期经营', originState, true);
    const challengeState = { ...newState(), day: 0, ch: { id: 'drought' } };

    saves.startChallenge(challengeState, '三年大旱');
    expect(saves.getActiveInfo()).toMatchObject({ kind: 'challenge', originSlotId: origin.id });
    expect(saves.loadSlot(origin.id, false).state).toEqual(originState);

    const restored = saves.returnToOrigin();

    expect(restored).toMatchObject({ kind: 'slot', id: origin.id, state: originState });
    expect(saves.getActiveInfo()).toMatchObject({ kind: 'slot', id: origin.id });
    expect(browserStorage.getItem('hejing-challenge-v2')).toBeNull();
  });
});
