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

function rewriteRenamedResidents(state, renames) {
  if (!renames.length) return;
  const ordered = [...renames].sort((a, b) => b[0].length - a[0].length);
  const rewrite = value => {
    if (typeof value !== 'string') return value;
    let result = value;
    for (const [before, after] of ordered) result = result.split(before).join(after);
    return result;
  };
  const everyone = [...state.people, ...state.dead];

  for (const person of everyone) {
    if (!Array.isArray(person.hist)) continue;
    for (const entry of person.hist) if (entry && typeof entry.t === 'string') entry.t = rewrite(entry.t);
  }
  for (const entry of state.chron) if (entry && typeof entry.t === 'string') entry.t = rewrite(entry.t);
  for (const alert of state.alerts) {
    if (!alert) continue;
    alert.name = rewrite(alert.name);
    alert.text = rewrite(alert.text);
  }
  state.lastHunger = rewrite(state.lastHunger);
  state.lastLeft = rewrite(state.lastLeft);
}

function repairLegacyFamilyNames(state) {
  const everyone = [...state.people, ...state.dead];
  const byId = new Map(everyone.map(person => [person.id, person]));
  const ordered = [...everyone].sort((a, b) => (a.id || 0) - (b.id || 0));
  const usedNames = new Set(everyone.map(person => person.name).filter(Boolean));
  const renames = [];

  for (const person of ordered) person.surname = personSurname(person);

  for (const person of ordered) {
    if (!Array.isArray(person.parents) || !person.parents.length) continue;
    const parents = person.parents.map(id => byId.get(id)).filter(Boolean);
    const father = parents.find(parent => parent.gender === '男') || parents[0];
    const surname = personSurname(father);
    if (!surname) continue;

    person.surname = surname;
    if (typeof person.name === 'string' && person.name.startsWith(surname)) continue;

    const oldName = person.name;
    if (oldName) usedNames.delete(oldName);
    const nextName = migratedFamilyName(person, surname, usedNames);
    if (oldName && oldName !== nextName) renames.push([oldName, nextName]);
    person.name = nextName;
    usedNames.add(nextName);
  }

  rewriteRenamedResidents(state, renames);
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
  if(o.familyNameVersion!==FAMILY_NAME_VERSION)repairLegacyFamilyNames(state);
  return state;
}
