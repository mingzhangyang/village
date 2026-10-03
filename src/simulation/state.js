import { createWorldSeed, normalizeSeed, seedFromLegacyState } from './rng.js';
import { migratedFamilyName, personSurname } from './names.js';

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

function rewriteRenamedResidents(state, originalNames) {
  const everyone = [...state.people, ...state.dead].filter(person => person && typeof person === 'object');
  const residentsByOriginalName = new Map();
  const residentsById = new Map(everyone.map(person => [person.id, person]));

  for (const person of everyone) {
    const before = originalNames.get(person);
    if (!before) continue;
    const residents = residentsByOriginalName.get(before) || [];
    residents.push(person);
    residentsByOriginalName.set(before, residents);
  }

  const orderedNames = [...residentsByOriginalName.keys()].sort((a, b) => b.length - a.length);
  if (!orderedNames.length) return;

  // Shared text can only be migrated safely when an old display name maps to one
  // resulting display name. If legacy residents reused a name and diverge after
  // migration, keep the shared reference unchanged because its owner is ambiguous.
  const sharedReplacements = new Map();
  for (const [before, residents] of residentsByOriginalName) {
    const afterNames = new Set(residents.map(person => person.name).filter(name => typeof name === 'string'));
    sharedReplacements.set(before, afterNames.size === 1 ? [...afterNames][0] : before);
  }

  // Match every complete legacy resident name longest-first. This protects an
  // unchanged longer name such as 林岚舟 when a shorter 林岚 is being renamed.
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(orderedNames.map(escapeRegExp).join('|'), 'g');
  const rewrite = (value, replacements = sharedReplacements) => typeof value === 'string'
    ? value.replace(pattern, match => replacements.get(match) ?? match)
    : value;
  const replacementsForResidents = residents => {
    if (!residents.length) return sharedReplacements;
    const replacements = new Map(sharedReplacements);
    const specific = new Map();
    for (const resident of residents) {
      const before = originalNames.get(resident);
      if (!before || resident.name === before) continue;
      const previous = specific.get(before);
      specific.set(before, previous && previous !== resident.name ? before : resident.name);
    }
    for (const [before, after] of specific) replacements.set(before, after);
    return replacements;
  };

  for (const person of everyone) {
    if (!Array.isArray(person.hist)) continue;
    // A resident's own history treats its old display name as a self-reference,
    // even when another legacy resident reused the same display name.
    const replacements = replacementsForResidents([person]);
    for (const entry of person.hist) {
      if (entry && typeof entry.t === 'string') entry.t = rewrite(entry.t, replacements);
    }
  }

  for (const entry of state.chron) if (entry && typeof entry.t === 'string') entry.t = rewrite(entry.t);
  for (const alert of state.alerts) {
    if (!alert || typeof alert !== 'object') continue;
    const resident = residentsById.get(alert.id);
    const replacements = resident ? replacementsForResidents([resident]) : sharedReplacements;
    alert.name = rewrite(alert.name, replacements);
    alert.text = rewrite(alert.text, replacements);
  }
  if (state.pending && typeof state.pending === 'object') {
    const data = state.pending.d && typeof state.pending.d === 'object' ? state.pending.d : {};
    const referencedIds = [data.p, data.a, data.b, ...(Array.isArray(data.ids) ? data.ids : [])];
    const referencedResidents = referencedIds
      .map(id => residentsById.get(id))
      .filter(Boolean);
    state.pending.res = rewrite(state.pending.res, replacementsForResidents(referencedResidents));
  }
  state.lastHunger = rewrite(state.lastHunger);
  state.lastLeft = rewrite(state.lastLeft);
}

function repairLegacyFamilyNames(state) {
  const everyone = [...state.people, ...state.dead].filter(person => person && typeof person === 'object');
  const byId = new Map(everyone.map(person => [person.id, person]));
  const ordered = [...everyone].sort((a, b) => (a.id || 0) - (b.id || 0));
  const originalNames = new Map(everyone.map(person => [
    person,
    typeof person.name === 'string' && person.name ? person.name : null,
  ]));
  const livingResidents = state.people.filter(person => person && typeof person === 'object');
  const livingSet = new Set(livingResidents);
  const nameCounts = new Map();
  for (const person of livingResidents) {
    const name = originalNames.get(person);
    if (name) nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  const usedNames = new Set(nameCounts.keys());
  const releaseName = name => {
    if (!name) return;
    const remaining = (nameCounts.get(name) || 0) - 1;
    if (remaining > 0) nameCounts.set(name, remaining);
    else {
      nameCounts.delete(name);
      usedNames.delete(name);
    }
  };
  const reserveName = name => {
    if (!name) return;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    usedNames.add(name);
  };

  for (const person of ordered) person.surname = personSurname(person);

  const visitState = new Map();
  const ancestryResolved = new Map();
  const migratePerson = person => {
    const status = visitState.get(person);
    if (status === 'done') return ancestryResolved.get(person) !== false;
    if (status === 'visiting') return false;

    visitState.set(person, 'visiting');
    const parents = Array.isArray(person.parents)
      ? person.parents.map(id => byId.get(id)).filter(Boolean)
      : [];
    const father = parents.find(parent => parent.gender === '男') || null;
    const resolved = father
      ? father !== person && migratePerson(father)
      : true;

    if (father && resolved) {
      const surname = personSurname(father);
      if (surname) {
        person.surname = surname;
        if (!(typeof person.name === 'string' && person.name.startsWith(surname))) {
          const oldName = person.name;
          const isLiving = livingSet.has(person);
          if (isLiving) releaseName(oldName);
          const nextName = migratedFamilyName(person, surname, isLiving ? usedNames : new Set());
          person.name = nextName;
          if (isLiving) reserveName(nextName);
        }
      }
    }

    visitState.set(person, 'done');
    ancestryResolved.set(person, resolved);
    return resolved;
  };

  // Imported saves do not require IDs to follow ancestry order. Starting from a
  // stable ID order keeps collision handling deterministic, while recursion makes
  // sure every resolvable father has reached his final surname before descendants.
  for (const person of ordered) migratePerson(person);

  rewriteRenamedResidents(state, originalNames);
  state.familyNameVersion = FAMILY_NAME_VERSION;
}

export function newState(seed = createWorldSeed()){
  const worldSeed = normalizeSeed(seed);
  return {v:1,familyNameVersion:FAMILY_NAME_VERSION,seed:worldSeed,rngState:worldSeed,day:0,food:388,treasury:60,people:[],dead:[],nextId:1,tax:0.15,policy:'need',
    drought:0,plague:0,plagueId:0,festival:0,caravan:0,mine:false,canal:false,cd:{},
    cohesion:57,publicPerCap:0,gini:0.25,births:0,deaths:0,left:0,trades:0,foodProd:0,foodCons:0,price:1,
    built:[],rot:0,watch:[],alerts:[],alertsOn:true,ch:null,hungerDeaths:0,lastHunger:'',lastLeft:'',favor:3,pending:null,nextDilemma:25,lastDil:'',dilemmasOn:true,school:false,mineClosed:0,
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
  for(const k of ['pop','food','wealth','happy','coh'])if(!Array.isArray(state.hist[k]))state.hist[k]=[];
  for(const k of ['people','dead','built','watch','alerts','chron'])if(!Array.isArray(state[k]))state[k]=[];
  if(!Number.isFinite(o.familyNameVersion)||o.familyNameVersion<FAMILY_NAME_VERSION)repairLegacyFamilyNames(state);
  return state;
}
