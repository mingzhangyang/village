import { GIVEN, SURN } from './constants.js';
import { MAX_PERSON_NAME_LENGTH } from '../state-contract.js';

export function surnameFromName(name) {
  const value = typeof name === 'string' ? name : '';
  return SURN.find(surname => value.startsWith(surname)) || null;
}

export function fallbackSurname(id) {
  const numericId = Number.isFinite(id) ? Math.max(1, Math.abs(Math.trunc(id))) : 1;
  return SURN[(numericId - 1) % SURN.length];
}

export function personSurname(person) {
  if (!person) return null;
  if (SURN.includes(person.surname)) return person.surname;
  return surnameFromName(person.name) || fallbackSurname(person.id);
}

export function givenNameFromDisplayName(name) {
  const value = typeof name === 'string' ? name : '';
  const surname = surnameFromName(value);
  if (surname) return value.slice(surname.length);
  if (value.startsWith('阿')) return value.slice(1);
  return value;
}

export function migratedFamilyName(person, surname, usedNames = new Set()) {
  const numericId = Number.isFinite(person?.id) ? Math.max(1, Math.abs(Math.trunc(person.id))) : 1;
  const given = givenNameFromDisplayName(person?.name) || GIVEN[(numericId - 1) % GIVEN.length];
  const familyName = (typeof surname === 'string' ? surname : '').slice(0, MAX_PERSON_NAME_LENGTH);
  const buildCandidate = suffix => {
    const extra = String(suffix || '').slice(0, Math.max(0, MAX_PERSON_NAME_LENGTH - familyName.length));
    const givenLength = Math.max(0, MAX_PERSON_NAME_LENGTH - familyName.length - extra.length);
    return `${familyName}${given.slice(0, givenLength)}${extra}`;
  };
  const base = buildCandidate('');
  if (!usedNames.has(base)) return base;

  for (let offset = 0; offset < GIVEN.length; offset += 1) {
    const suffix = GIVEN[(numericId + offset) % GIVEN.length];
    const candidate = buildCandidate(suffix);
    if (!usedNames.has(candidate)) return candidate;
  }

  const fallback = GIVEN[numericId % GIVEN.length];
  for (let attempt = 0; attempt <= usedNames.size; attempt += 1) {
    const suffix = `${fallback}${numericId.toString(36)}${attempt ? attempt.toString(36) : ''}`;
    const candidate = buildCandidate(suffix);
    if (!usedNames.has(candidate)) return candidate;
  }

  return buildCandidate(`${fallback}${numericId.toString(36)}x`);
}
