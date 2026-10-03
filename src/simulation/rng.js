const RNG_INCREMENT = 0x6d2b79f5;
let fallbackSeedCounter = 0;

function hashText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed) {
  const value = Number(seed);
  return Number.isFinite(value) ? Math.trunc(value) >>> 0 : hashText(String(seed));
}

export function seedFromLegacyState(state) {
  let serialized;
  try {
    serialized = JSON.stringify(state);
  } catch {
    serialized = String(state);
  }
  return hashText(serialized ?? 'null');
}

export function createWorldSeed() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues === 'function') {
    return cryptoApi.getRandomValues(new Uint32Array(1))[0];
  }

  fallbackSeedCounter = (fallbackSeedCounter + 1) >>> 0;
  return (Date.now() ^ Math.imul(fallbackSeedCounter, 0x9e3779b9)) >>> 0;
}

export function nextRandomValue(currentState) {
  const state = ((Number(currentState) >>> 0) + RNG_INCREMENT) >>> 0;
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return {
    state,
    value: ((value ^ (value >>> 14)) >>> 0) / 4294967296,
  };
}
