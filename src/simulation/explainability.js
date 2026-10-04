import { YEAR } from './clock.js';

export const MIGRATION_RULES = Object.freeze({
  sadHappinessThreshold: 22,
  warningSadDays: 7,
  automaticSadDaysThreshold: 12,
  automaticDailyChance: 0.06,
  wanderMaxAge: 35 * YEAR,
  wanderHappinessThreshold: 60,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function wealthStats(people) {
  const values = people.map(person => Math.max(0, person.wealth || 0)).sort((a, b) => a - b);
  const count = values.length;
  if (!count) return { average: 0, gini: 0, total: 0 };

  const total = values.reduce((sum, value) => sum + value, 0);
  let gini = 0;
  if (total > 0) {
    let weighted = 0;
    for (let index = 0; index < count; index += 1) weighted += (index + 1) * values[index];
    gini = (2 * weighted) / (count * total) - (count + 1) / count;
  }
  return { average: total / count, gini, total };
}

export function happinessBreakdown({
  state,
  person,
  averageWealth,
  gini,
  seasonIndex,
  friendCount = 0,
  marketCount = 0,
  teahouseCount = 0,
  marketUpgrade = 0,
  teahouseUpgrade = 0,
}) {
  const wealth = Math.max(0, person.wealth || 0);
  const fed = Number.isFinite(person.fed) ? person.fed : 1;
  const health = Number.isFinite(person.health) ? person.health : 100;
  const factors = [];
  const add = (key, value) => {
    const factor = { key, value };
    factors.push(factor);
    return value;
  };

  const base = add('base', 30);
  const wealthValue = add('wealth', Math.log2(1 + wealth) * 4.2);
  const foodValue = add('food', fed >= 0.95 ? 12 : -30 * (1 - fed));
  const friendsValue = add('friends', Math.min(5, friendCount) * 3.5);
  const partnerValue = add('partner', person.partner ? 8 : 0);
  const healthValue = add('health', (health - 75) / 5);
  const taxValue = add('tax', -state.tax * (wealth > averageWealth ? 40 : 15));
  const inequalityValue = add('inequality', -gini * (wealth < averageWealth ? 28 : 8));
  const childValue = add('child', person.job === 'child' ? 15 : 0);
  const festivalValue = add('festival', state.festival > 0 ? 14 : 0);
  const droughtValue = add('drought', state.drought > 0 ? -5 : 0);
  const winterValue = add('winter', seasonIndex === 3 ? -3 : 0);
  const optimistValue = add('optimist', person.traits?.includes('乐天') ? 7 : 0);
  const publicValue = add('public', Math.min(6, state.publicPerCap * 8));
  const marketValue = add('market', 2 * (Math.min(2, marketCount) + marketUpgrade));
  const teahouseValue = add('teahouse', 2 * (Math.min(2, teahouseCount) + teahouseUpgrade));

  let rawTarget = base + wealthValue;
  rawTarget += foodValue;
  rawTarget += friendsValue + partnerValue + healthValue;
  rawTarget += taxValue;
  rawTarget += inequalityValue;
  rawTarget += childValue;
  rawTarget += festivalValue;
  rawTarget += droughtValue;
  rawTarget += winterValue;
  rawTarget += optimistValue;
  rawTarget += publicValue + marketValue + teahouseValue;

  const target = clamp(rawTarget, 0, 100);
  const expectedNext = clamp(person.happiness + (rawTarget - person.happiness) * 0.07, 0, 100);
  return {
    rawTarget,
    target,
    expectedChange: expectedNext - person.happiness,
    randomRange: 0.8,
    factors,
  };
}

export function cohesionBreakdown({
  state,
  averageFriends = 0,
  sadFraction = 0,
  gini,
  teahouseCount = 0,
  teahouseUpgrade = 0,
}) {
  const factors = [];
  const add = (key, value) => {
    factors.push({ key, value });
    return value;
  };

  const base = add('base', 40);
  const friendsValue = add('friends', averageFriends * 6);
  const inequalityValue = add('inequality', -gini * 40);
  const publicValue = add('public', Math.min(10, state.publicPerCap * 12));
  const festivalValue = add('festival', state.festival > 0 ? 10 : 0);
  const sadValue = add('sad', -sadFraction * 25);
  const droughtValue = add('drought', state.drought > 0 ? (state.policy === 'need' || state.policy === 'equal' ? 4 : -8) : 0);
  const policyValue = add('policy', state.policy === 'market' ? -4 : state.policy === 'equal' ? 3 : 0);
  const teahouseValue = add('teahouse', 3 * (Math.min(2, teahouseCount) + Math.min(1, teahouseUpgrade)));

  let rawTarget = base + friendsValue + inequalityValue + publicValue + festivalValue + sadValue;
  rawTarget += droughtValue;
  rawTarget += policyValue;
  rawTarget += teahouseValue;
  const target = clamp(rawTarget, 0, 100);
  const expectedNext = clamp(state.cohesion + (target - state.cohesion) * 0.04, 0, 100);
  return { rawTarget, target, expectedChange: expectedNext - state.cohesion, factors };
}

export function migrationBreakdown(person) {
  const alive = person.status === 'alive';
  const adult = alive && person.job !== 'child';
  const sadDays = Math.max(0, person.sadDays || 0);
  const automaticEligible = adult && sadDays > MIGRATION_RULES.automaticSadDaysThreshold;
  const worker = adult && person.job !== 'elder';
  const wanderEligible = worker && person.age < MIGRATION_RULES.wanderMaxAge && !person.partner && person.happiness < MIGRATION_RULES.wanderHappinessThreshold;

  return {
    alive,
    adult,
    sadDays,
    automaticEligible,
    dailyChance: automaticEligible ? MIGRATION_RULES.automaticDailyChance : 0,
    daysUntilAutomaticRisk: adult && !automaticEligible ? Math.max(0, MIGRATION_RULES.automaticSadDaysThreshold + 1 - sadDays) : 0,
    wanderEligible,
  };
}
