import { GIVEN, SURN } from './constants.js';

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
  const base = `${surname}${given}`;
  if (!usedNames.has(base)) return base;

  for (let offset = 0; offset < GIVEN.length; offset += 1) {
    const suffix = GIVEN[(numericId + offset) % GIVEN.length];
    const candidate = `${base}${suffix}`;
    if (!usedNames.has(candidate)) return candidate;
  }

  return `${base}${GIVEN[numericId % GIVEN.length]}${GIVEN[(numericId + 1) % GIVEN.length]}`;
}
