export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = values => values[Math.floor(Math.random() * values.length)];
export const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
export const has = (person, trait) => person.traits.indexOf(trait) >= 0;
