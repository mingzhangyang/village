export function normalizeResidentHappiness(value,fallback=50){
  const safeFallback=Number.isFinite(fallback)?fallback:50;
  const numeric=Number.isFinite(value)?value:safeFallback;
  return Math.min(100,Math.max(0,numeric));
}

export function setResidentHappiness(person,value){
  if(!person||typeof person!=='object')return null;
  person.happiness=normalizeResidentHappiness(value);
  return person.happiness;
}

export function adjustResidentHappiness(person,delta){
  if(!person||typeof person!=='object')return null;
  const current=normalizeResidentHappiness(person.happiness);
  const change=Number.isFinite(delta)?delta:0;
  return setResidentHappiness(person,current+change);
}

export function clampResidentHappiness(state){
  const residents=[...(Array.isArray(state.people)?state.people:[]),...(Array.isArray(state.dead)?state.dead:[])];
  const seen=new Set();
  for(const person of residents){
    if(!person||typeof person!=='object'||seen.has(person))continue;
    seen.add(person);
    setResidentHappiness(person,person.happiness);
  }
  return state;
}

export function normalizeWorldName(value,fallback='溪谷群岛'){
  const clean=input=>typeof input==='string'?input.trim().replace(/\s+/g,' ').slice(0,40):'';
  return clean(value)||clean(fallback)||'溪谷群岛';
}

export function monotonicDay(previous,current){
  if(!Number.isFinite(previous))return Number.isFinite(current)?current:0;
  if(!Number.isFinite(current))return previous;
  return current<previous?previous:current;
}
