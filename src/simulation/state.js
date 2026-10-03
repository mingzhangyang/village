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

export function newState(){
  return {v:1,day:0,food:388,treasury:60,people:[],dead:[],nextId:1,tax:0.15,policy:'need',
    drought:0,plague:0,plagueId:0,festival:0,caravan:0,mine:false,canal:false,cd:{},
    cohesion:57,publicPerCap:0,gini:0.25,births:0,deaths:0,left:0,trades:0,foodProd:0,foodCons:0,price:1,
    built:[],rot:0,watch:[],alerts:[],alertsOn:true,ch:null,hungerDeaths:0,lastHunger:'',lastLeft:'',favor:3,pending:null,nextDilemma:25,lastDil:'',dilemmasOn:true,school:false,mineClosed:0,
    chron:[],chronVer:0,hist:{pop:[],food:[],wealth:[],happy:[],coh:[]},sel:null,speed:1,paused:false};
}

export function normalizeState(raw){
  const base=newState(),o=raw&&typeof raw==='object'?raw:{};
  const state=Object.assign(base,o);
  state.cd=Object.assign({},base.cd,o.cd||{});
  state.hist=Object.assign({},base.hist,o.hist||{});
  for(const k of ['pop','food','wealth','happy','coh'])if(!Array.isArray(state.hist[k]))state.hist[k]=[];
  for(const k of ['people','dead','built','watch','alerts','chron'])if(!Array.isArray(state[k]))state[k]=[];
  return state;
}
