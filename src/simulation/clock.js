export const YEAR = 40;
export const SEASON = 10;
export const SEASONS = ['春', '夏', '秋', '冬'];

export const ageY = person => Math.floor(person.age / YEAR);
export const seasonIndex = day => Math.floor((day % YEAR) / SEASON);
export function dateLabel(day) {
  return `${Math.floor(day / YEAR) + 1}年${SEASONS[seasonIndex(day)]}`;
}
