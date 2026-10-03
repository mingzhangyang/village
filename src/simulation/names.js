import { GIVEN, SURN } from './constants.js';
import { MAX_PERSON_NAME_LENGTH } from '../state-contract.js';

function stableIdSeed(id) {
  const numericId = Number(id);
  if (Number.isSafeInteger(numericId)) return Math.max(1, Math.abs(numericId));

  const text = Number.isFinite(numericId) ? String(numericId) : '1';
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 1;
}
export function surnameFromName(name) {
  const value = typeof name === 'string' ? name : '';
  return SURN.find(surname => value.startsWith(surname)) || null;
}

export function defaultSurnameForNewPerson(id) {
  const idSeed = stableIdSeed(id);
  return SURN[(idSeed - 1) % SURN.length];
}

export function knownPersonSurname(person) {
  if (!person) return null;
  if (SURN.includes(person.surname)) return person.surname;
  return surnameFromName(person.name);
}

export function givenNameFromDisplayName(name) {
  const value = typeof name === 'string' ? name : '';
  const surname = surnameFromName(value);
  if (surname) return value.slice(surname.length);
  if (value.startsWith('阿')) return value.slice(1);
  return value;
}

export function migratedFamilyName(person, surname, usedNames = new Set()) {
  const idSeed = stableIdSeed(person?.id);
  const givenIndex = (idSeed - 1) % GIVEN.length;
  const collisionIndex = idSeed % GIVEN.length;
  const idToken = idSeed.toString(36);
  const given = givenNameFromDisplayName(person?.name) || GIVEN[givenIndex];
  const familyName = (typeof surname === 'string' ? surname : '').slice(0, MAX_PERSON_NAME_LENGTH);
  const buildCandidate = suffix => {
    const extra = String(suffix || '').slice(0, Math.max(0, MAX_PERSON_NAME_LENGTH - familyName.length));
    const givenLength = Math.max(0, MAX_PERSON_NAME_LENGTH - familyName.length - extra.length);
    return `${familyName}${given.slice(0, givenLength)}${extra}`;
  };
  const base = buildCandidate('');
  if (!usedNames.has(base)) return base;

  for (let offset = 0; offset < GIVEN.length; offset += 1) {
    const suffix = GIVEN[(collisionIndex + offset) % GIVEN.length];
    const candidate = buildCandidate(suffix);
    if (!usedNames.has(candidate)) return candidate;
  }

  const fallback = GIVEN[collisionIndex];
  const start = usedNames.size;
  for (let attempt = 0; attempt <= usedNames.size; attempt += 1) {
    const attemptToken = (start + attempt).toString(36);
    const candidate = buildCandidate(`${fallback}${attemptToken}${idToken}`);
    if (!usedNames.has(candidate)) return candidate;
  }

  throw new Error('Unable to generate a unique migrated resident name.');
}
