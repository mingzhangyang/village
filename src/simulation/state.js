import { createWorldSeed, normalizeSeed, seedFromLegacyState } from './rng.js';
import { knownPersonSurname, migratedFamilyName } from './names.js';
import { normalizeTech } from './tech.js';
import { normalizeFrontier } from './frontier.js';
import { clampResidentHappiness, normalizeWorldName } from './invariants.js';
import { MAX_CHRON_ENTRIES, MAX_PERSON_HISTORY_ENTRIES, MAX_STAT_HISTORY_ENTRIES, freshOnboarding, normalizeChronicleEntry, normalizeOnboarding } from '../state-contract.js';

let activeState = null;
let onDirty = () => {};

export function getState() {
  return activeState;
}

export function setState(state) {
  activeState = state;
  return activeState;
}

export function configureState({ onDirty: callback } = {}) {
  onDirty = typeof callback === 'function' ? callback : () => {};
}

export function markStateDirty() {
  onDirty();
}

const FAMILY_NAME_VERSION = 1;

const UNRESOLVED_FATHER = Symbol('unresolved-father');

function distinctResidents(state) {
  return [...new Set(
    [...state.people, ...state.dead].filter(person => person && typeof person === 'object'),
  )];
}

function residentGroupsById(residents) {
  const groups = new Map();
  for (const person of residents) {
    if (!Number.isFinite(person.id)) continue;
    const group = groups.get(person.id) || [];
    group.push(person);
    groups.set(person.id, group);
  }
  return groups;
}

function uniqueResidentsById(groupsById) {
  const unique = new Map();
  for (const [id, group] of groupsById) {
    if (group.length === 1) unique.set(id, group[0]);
  }
  return unique;
}

function fatherFor(person, groupsById) {
  if (!Array.isArray(person.parents)) return null;
  let father = null;
  const seenIds = new Set();

  for (const id of person.parents) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const group = groupsById.get(id) || [];

    if (group.length > 1) {
      if (group.some(candidate => candidate.gender === '男')) return UNRESOLVED_FATHER;
      continue;
    }

    const candidate = group[0];
    if (!candidate || candidate.gender !== '男') continue;
    if (father && father !== candidate) return UNRESOLVED_FATHER;
    father = candidate;
  }

  return father;
}

function rewriteRenamedResidents(state, originalNames) {
  const everyone = distinctResidents(state);
  const residentsByOriginalName = new Map();
  const groupsById = residentGroupsById(everyone);
  const residentsById = uniqueResidentsById(groupsById);
  let hasRename = false;

  for (const person of everyone) {
    const before = originalNames.get(person);
    if (!before) continue;
    if (person.name !== before) hasRename = true;
    const residents = residentsByOriginalName.get(before) || [];
    residents.push(person);
    residentsByOriginalName.set(before, residents);
  }

  if (!hasRename || !residentsByOriginalName.size) return;

  // Shared text can only be migrated safely when an old display name maps to one
  // resulting display name. If legacy residents reused a name and diverge after
  // migration, keep the shared reference unchanged because its owner is ambiguous.
  const sharedReplacements = new Map();
  for (const [before, residents] of residentsByOriginalName) {
    const afterNames = new Set(residents.map(person => person.name).filter(name => typeof name === 'string'));
    sharedReplacements.set(before, afterNames.size === 1 ? [...afterNames][0] : before);
  }

  const replacementFor = (name, overrides = null) => {
    if (overrides && overrides.has(name)) return overrides.get(name);
    return sharedReplacements.get(name) ?? name;
  };
  const rewriteExactName = (value, overrides = null) => typeof value === 'string'
    ? replacementFor(value, overrides)
    : value;

  // One-character imported names cannot be distinguished safely from ordinary
  // Chinese prose (for example, resident "叶" versus "树叶落下"). Keep those
  // replacements for structured exact-name fields only; free text migrates only
  // names with at least two Unicode code points.
  const freeTextNames = [...residentsByOriginalName.keys()]
    .filter(name => Array.from(name).length >= 2)
    .sort((left, right) => right.length - left.length);
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = freeTextNames.length
    ? new RegExp(freeTextNames.map(escapeRegExp).join('|'), 'g')
    : null;
  const rewriteFreeText = (value, overrides = null) => typeof value === 'string' && pattern
    ? value.replace(pattern, match => replacementFor(match, overrides))
    : value;
  // Keep resident-specific overrides small instead of cloning the entire shared
  // replacement table for every resident in a large imported save.
  const overridesForResidents = residents => {
    const overrides = new Map();
    for (const resident of residents) {
      const before = originalNames.get(resident);
      if (!before || resident.name === before) continue;
      const previous = overrides.get(before);
      overrides.set(before, previous && previous !== resident.name ? before : resident.name);
    }
    return overrides;
  };

  for (const person of everyone) {
    if (!Array.isArray(person.hist)) continue;
    const overrides = overridesForResidents([person]);
    for (const entry of person.hist) {
      if (entry && typeof entry.t === 'string') entry.t = rewriteFreeText(entry.t, overrides);
    }
  }

  for (const entry of state.chron) if (entry && typeof entry.t === 'string') entry.t = rewriteFreeText(entry.t);
  for (const alert of state.alerts) {
    if (!alert || typeof alert !== 'object') continue;
    const resident = residentsById.get(alert.id);
    const overrides = resident ? overridesForResidents([resident]) : null;
    alert.name = rewriteExactName(alert.name, overrides);
    alert.text = rewriteFreeText(alert.text, overrides);
  }

  if (state.pending && typeof state.pending === 'object') {
    const data = state.pending.d && typeof state.pending.d === 'object' ? state.pending.d : {};
    const referencedIds = [data.p, data.a, data.b, ...(Array.isArray(data.ids) ? data.ids : [])];
    const referencedResidents = referencedIds
      .map(id => residentsById.get(id))
      .filter(Boolean);
    state.pending.res = rewriteFreeText(state.pending.res, overridesForResidents(referencedResidents));
  }

  if (state.ch && typeof state.ch === 'object') {
    state.ch.txt = rewriteFreeText(state.ch.txt);
    if (state.ch.result && typeof state.ch.result === 'object') {
      state.ch.result.why = rewriteFreeText(state.ch.result.why);
    }
  }

  state.lastHunger = rewriteExactName(state.lastHunger);
  state.lastLeft = rewriteExactName(state.lastLeft);
}

function repairLegacyFamilyNames(state) {
  const everyone = distinctResidents(state);
  const groupsById = residentGroupsById(everyone);
  const indexed = everyone.map((person, index) => ({ person, index }));
  indexed.sort((left, right) => {
    const leftId = Number.isFinite(left.person.id) ? left.person.id : Number.POSITIVE_INFINITY;
    const rightId = Number.isFinite(right.person.id) ? right.person.id : Number.POSITIVE_INFINITY;
    if (leftId !== rightId) return leftId < rightId ? -1 : 1;
    return left.index - right.index;
  });
  const ordered = indexed.map(entry => entry.person);
  const originalNames = new Map(everyone.map(person => [
    person,
    typeof person.name === 'string' ? person.name : null,
  ]));
  const initialSurnames = new Map(everyone.map(person => [person, knownPersonSurname(person)]));
  const fatherByPerson = new Map(ordered.map(person => [person, fatherFor(person, groupsById)]));
  const finalSurnames = new Map();
  const ancestryResolved = new Map();

  const resolveAncestry = startPerson => {
    if (ancestryResolved.has(startPerson)) return ancestryResolved.get(startPerson) !== false;

    const path = [];
    const pathSet = new Set();
    let current = startPerson;
    let blocked = false;

    while (current && !ancestryResolved.has(current) && !pathSet.has(current)) {
      path.push(current);
      pathSet.add(current);
      const father = fatherByPerson.get(current);
      if (father === UNRESOLVED_FATHER) {
        blocked = true;
        current = null;
        break;
      }
      current = father;
    }

    const hitCycle = !!current && pathSet.has(current);
    const upstreamResolved = !blocked
      && !hitCycle
      && (!current || ancestryResolved.get(current) !== false);

    if (!upstreamResolved) {
      for (const person of path) {
        ancestryResolved.set(person, false);
        finalSurnames.set(person, initialSurnames.get(person));
      }
      return false;
    }

    for (let index = path.length - 1; index >= 0; index -= 1) {
      const person = path[index];
      const father = fatherByPerson.get(person);
      if (!father) {
        ancestryResolved.set(person, true);
        finalSurnames.set(person, initialSurnames.get(person));
        continue;
      }

      const fatherResolved = ancestryResolved.get(father) !== false;
      if (!fatherResolved) {
        ancestryResolved.set(person, false);
        finalSurnames.set(person, initialSurnames.get(person));
        continue;
      }

      ancestryResolved.set(person, true);
      finalSurnames.set(person, finalSurnames.get(father) || initialSurnames.get(father));
    }

    return ancestryResolved.get(startPerson) !== false;
  };

  // First resolve the complete paternal graph without changing display names.
  // This makes ID ordering irrelevant and lets collision handling see final names.
  for (const person of ordered) resolveAncestry(person);
  for (const person of ordered) {
    person.surname = finalSurnames.get(person) || initialSurnames.get(person);
  }

  const livingResidents = [...new Set(state.people.filter(person => person && typeof person === 'object'))];
  const livingSet = new Set(livingResidents);
  const renamePlans = ordered.filter(person => {
    const father = fatherByPerson.get(person);
    const surname = finalSurnames.get(person);
    return ancestryResolved.get(person) === true
      && father
      && father !== UNRESOLVED_FATHER
      && surname
      && !(typeof person.name === 'string' && person.name.startsWith(surname));
  });

  // Release every living name that is known to be vacated before assigning any
  // replacement. Unchanged residents remain reserved, including duplicate names.
  const nameCounts = new Map();
  for (const person of livingResidents) {
    if (typeof person.name !== 'string') continue;
    nameCounts.set(person.name, (nameCounts.get(person.name) || 0) + 1);
  }
  for (const person of renamePlans) {
    if (!livingSet.has(person) || typeof person.name !== 'string') continue;
    const remaining = (nameCounts.get(person.name) || 0) - 1;
    if (remaining > 0) nameCounts.set(person.name, remaining);
    else nameCounts.delete(person.name);
  }

  const usedNames = new Set(nameCounts.keys());
  for (const person of renamePlans) {
    const surname = finalSurnames.get(person);
    const isLiving = livingSet.has(person);
    const nextName = migratedFamilyName(person, surname, isLiving ? usedNames : new Set());
    person.name = nextName;
    if (isLiving) usedNames.add(nextName);
  }

  rewriteRenamedResidents(state, originalNames);
  state.familyNameVersion = FAMILY_NAME_VERSION;
}

export function newState(seed = createWorldSeed()){
  const worldSeed = normalizeSeed(seed);
  return {v:1,familyNameVersion:FAMILY_NAME_VERSION,seed:worldSeed,rngState:worldSeed,worldName:'溪谷群岛',onboarding:freshOnboarding(),day:0,food:388,treasury:60,people:[],dead:[],nextId:1,tax:0.15,policy:'need',
    drought:0,plague:0,plagueId:0,festival:0,caravan:0,mine:false,canal:false,cd:{},
    cohesion:57,publicPerCap:0,gini:0.25,births:0,deaths:0,left:0,trades:0,foodProd:0,foodCons:0,price:1,
    built:[],rot:0,watch:[],alerts:[],alertsOn:true,ch:null,hungerDeaths:0,lastHunger:'',lastLeft:'',favor:3,pending:null,nextDilemma:25,lastDil:'',dilemmasOn:true,school:false,mineClosed:0,tech:{},research:null,frontier:null,
    chron:[],chronVer:0,hist:{pop:[],food:[],wealth:[],happy:[],coh:[]},sel:null,speed:1,paused:false};
}

export function normalizeState(raw){
  const o=raw&&typeof raw==='object'?raw:{};
  const seed=Number.isFinite(o.seed)?normalizeSeed(o.seed):seedFromLegacyState(o);
  const base=newState(seed);
  const state=Object.assign(base,o);
  state.seed=seed;
  state.rngState=Number.isFinite(o.rngState)?normalizeSeed(o.rngState):seed;
  state.cd=Object.assign({},base.cd,o.cd||{});
  state.hist=Object.assign({},base.hist,o.hist||{});
  for(const k of ['pop','food','wealth','happy','coh']){
    const values=Array.isArray(state.hist[k])?state.hist[k]:[];
    state.hist[k]=values.filter(Number.isFinite).slice(-MAX_STAT_HISTORY_ENTRIES);
  }
  for(const k of ['people','dead','built','watch','alerts','chron'])if(!Array.isArray(state[k]))state[k]=[];
  state.chron=state.chron.slice(-MAX_CHRON_ENTRIES).map(entry=>normalizeChronicleEntry(entry,state.day));
  state.chronVer=Number.isFinite(o.chronVer)&&o.chronVer>=0?Math.floor(o.chronVer):state.chron.length;
  for(const person of [...state.people,...state.dead]){
    if(!person||typeof person!=='object')continue;
    person.hist=Array.isArray(person.hist)?person.hist.slice(-MAX_PERSON_HISTORY_ENTRIES):[];
  }
  state.worldName=normalizeWorldName(state.worldName,base.worldName);
  state.onboarding=normalizeOnboarding(o.onboarding,{legacyComplete:o.onboarding==null});
  clampResidentHappiness(state);
  normalizeTech(state);
  normalizeFrontier(state);
  if(o.familyNameVersion==null||(Number.isFinite(o.familyNameVersion)&&o.familyNameVersion<FAMILY_NAME_VERSION))repairLegacyFamilyNames(state);
  return state;
}
