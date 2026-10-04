export function clampResidentHappiness(state){
  const residents=[...(Array.isArray(state.people)?state.people:[]),...(Array.isArray(state.dead)?state.dead:[])];
  const seen=new Set();
  for(const person of residents){
    if(!person||typeof person!=='object'||seen.has(person))continue;
    seen.add(person);
    const value=Number.isFinite(person.happiness)?person.happiness:50;
    person.happiness=Math.min(100,Math.max(0,value));
  }
  return state;
}

export function monotonicDay(previous,current){
  if(!Number.isFinite(previous))return Number.isFinite(current)?current:0;
  if(!Number.isFinite(current))return previous;
  return current<previous?previous:current;
}
