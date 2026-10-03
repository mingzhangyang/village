import { MAX_PERSON_NAME_LENGTH } from '../state-contract.js';

export function createHejingStorage(store) {
  if (!store) throw new Error('A Storage-compatible object is required.');

const SCHEMA_VERSION=2;
const GAME_VERSION='0.2.0';
const MAX_SLOTS=5;
const INDEX_KEY='hejing-save-index-v2';
const SLOT_PREFIX='hejing-save-v2:';
const CHALLENGE_KEY='hejing-challenge-v2';
const LEGACY_KEY='hejing-save-v1';
const EXPORT_FORMAT='hejing-save-export';

function fail(code,message){
  const err=new Error(message);
  err.code=code;
  throw err;
}
function safeParse(raw){
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{return null;}
}
function cleanName(name,fallback){
  const value=String(name||'').trim().replace(/\s+/g,' ').slice(0,40);
  return value||fallback||'未命名溪谷';
}
function validState(state){
  const peopleOk=Array.isArray(state&&state.people)&&state.people.every(p=>p&&typeof p==='object'&&Number.isFinite(p.id)&&typeof p.name==='string'&&p.name.length<=MAX_PERSON_NAME_LENGTH&&Number.isFinite(p.age));
  return !!state&&typeof state==='object'&&state.v===1&&Number.isFinite(state.day)&&state.day>=0&&peopleOk&&
    Array.isArray(state.dead)&&Array.isArray(state.built)&&state.hist&&typeof state.hist==='object';
}
function sanitizeImported(value,depth){
  if(depth>18)fail('IMPORT_INVALID','存档嵌套层级异常。');
  if(value===null||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string')return value.replace(/</g,'＜').replace(/>/g,'＞');
  if(Array.isArray(value)){
    if(value.length>20000)fail('IMPORT_INVALID','存档数组异常过大。');
    return value.map(v=>sanitizeImported(v,depth+1));
  }
  if(typeof value==='object'){
    const out={};let n=0;
    for(const [k,v] of Object.entries(value)){
      if(k==='__proto__'||k==='constructor'||k==='prototype')continue;
      if(++n>500)fail('IMPORT_INVALID','存档对象字段异常过多。');
      out[k]=sanitizeImported(v,depth+1);
    }
    return out;
  }
  return null;
}
function newIndex(){
  return {version:SCHEMA_VERSION,active:{kind:'slot',id:null},slots:[]};
}
function loadIndex(){
  const parsed=safeParse(store.getItem(INDEX_KEY));
  if(!parsed||parsed.version!==SCHEMA_VERSION||!Array.isArray(parsed.slots)||!parsed.active)return newIndex();
  return parsed;
}
function saveIndex(index){
  store.setItem(INDEX_KEY,JSON.stringify(index));
}
function slotKey(id){return SLOT_PREFIX+id;}
function makeId(){
  for(let i=0;i<8;i++){
    const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    if(!store.getItem(slotKey(id)))return id;
  }
  fail('ID_COLLISION','无法创建新的存档编号，请重试。');
}
function validEnvelope(env,mode){
  return !!env&&env.version===SCHEMA_VERSION&&env.state&&validState(env.state)&&
    (!mode||env.mode===mode)&&typeof env.name==='string';
}
function readSlotEnvelope(id){
  const env=safeParse(store.getItem(slotKey(id)));
  return validEnvelope(env,'free')?env:null;
}
function readChallengeEnvelope(){
  const env=safeParse(store.getItem(CHALLENGE_KEY));
  return validEnvelope(env,'challenge')?env:null;
}
function summary(env){
  return {
    id:env.id,
    name:env.name,
    createdAt:env.createdAt,
    updatedAt:env.updatedAt,
    day:env.state.day||0,
    population:Array.isArray(env.state.people)?env.state.people.length:0,
    gameVersion:env.gameVersion||GAME_VERSION
  };
}
function upsertSummary(index,env){
  const next=summary(env),i=index.slots.findIndex(s=>s.id===env.id);
  if(i>=0)index.slots[i]=next;else index.slots.push(next);
}
function session(kind,env){
  if(!env)return null;
  return {kind,id:env.id,name:env.name,state:env.state,createdAt:env.createdAt,updatedAt:env.updatedAt,originSlotId:env.originSlotId||null};
}
function ensureCapacity(index){
  if(index.slots.length>=MAX_SLOTS)fail('SLOTS_FULL',`最多只能保留 ${MAX_SLOTS} 个自由世界存档。`);
}
function createSlot(name,state,activate){
  if(!validState(state))fail('INVALID_STATE','当前世界状态不完整，无法保存。');
  const index=loadIndex();ensureCapacity(index);
  const now=new Date().toISOString(),id=makeId();
  const env={format:'hejing-save',version:SCHEMA_VERSION,gameVersion:GAME_VERSION,id,name:cleanName(name,`溪谷 ${index.slots.length+1}`),mode:'free',createdAt:now,updatedAt:now,state};
  store.setItem(slotKey(id),JSON.stringify(env));
  upsertSummary(index,env);
  if(activate!==false)index.active={kind:'slot',id};
  saveIndex(index);
  return env;
}
function saveSlot(id,state){
  if(!validState(state))fail('INVALID_STATE','当前世界状态不完整，无法保存。');
  const old=readSlotEnvelope(id);
  if(!old)fail('SLOT_MISSING','这个存档不存在或已经损坏。');
  const env=Object.assign({},old,{updatedAt:new Date().toISOString(),state});
  store.setItem(slotKey(id),JSON.stringify(env));
  const index=loadIndex();upsertSummary(index,env);saveIndex(index);
  return env;
}
function loadSlot(id,activate){
  const env=readSlotEnvelope(id);
  if(!env)fail('SLOT_BROKEN','这个存档不存在或已损坏。');
  if(activate!==false){
    const index=loadIndex();index.active={kind:'slot',id};saveIndex(index);
  }
  return env;
}
function renameSlot(id,name){
  const env=readSlotEnvelope(id);
  if(!env)fail('SLOT_BROKEN','这个存档不存在或已损坏。');
  env.name=cleanName(name,env.name);env.updatedAt=new Date().toISOString();
  store.setItem(slotKey(id),JSON.stringify(env));
  const index=loadIndex();upsertSummary(index,env);saveIndex(index);
  return env;
}
function deleteSlot(id){
  const index=loadIndex();
  if(index.active&&index.active.kind==='slot'&&index.active.id===id)fail('ACTIVE_SLOT','不能删除当前正在游玩的存档，请先加载另一个世界。');
  store.removeItem(slotKey(id));
  index.slots=index.slots.filter(s=>s.id!==id);
  saveIndex(index);
}
function listSlots(){
  const index=loadIndex();
  return index.slots.map(s=>{
    const env=readSlotEnvelope(s.id);
    return env?Object.assign(summary(env),{broken:false}):Object.assign({},s,{broken:true});
  }).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}
function getActiveInfo(){
  const index=loadIndex(),a=index.active||{kind:'slot',id:null};
  if(a.kind==='challenge'){
    const ch=readChallengeEnvelope();
    return {kind:'challenge',id:'challenge',name:ch?ch.name:'挑战',originSlotId:(ch&&ch.originSlotId)||a.originSlotId||null};
  }
  const env=a.id?readSlotEnvelope(a.id):null;
  return {kind:'slot',id:a.id||null,name:env?env.name:'',originSlotId:null};
}
function fallbackFree(index){
  for(const s of index.slots.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))){
    const env=readSlotEnvelope(s.id);
    if(env){index.active={kind:'slot',id:env.id};saveIndex(index);return session('slot',env);}
  }
  index.active={kind:'slot',id:null};saveIndex(index);return null;
}
function loadActive(){
  const index=loadIndex(),a=index.active||{};
  if(a.kind==='challenge'){
    const env=readChallengeEnvelope();
    if(env)return session('challenge',env);
    if(a.originSlotId){
      const origin=readSlotEnvelope(a.originSlotId);
      if(origin){index.active={kind:'slot',id:origin.id};saveIndex(index);return session('slot',origin);}
    }
    return fallbackFree(index);
  }
  if(a.id){
    const env=readSlotEnvelope(a.id);
    if(env)return session('slot',env);
  }
  return fallbackFree(index);
}
function saveChallenge(state,name){
  if(!validState(state))fail('INVALID_STATE','挑战状态不完整，无法保存。');
  const index=loadIndex(),old=readChallengeEnvelope();
  const now=new Date().toISOString();
  let originSlotId=old&&old.originSlotId;
  if(!originSlotId&&index.active&&index.active.kind==='slot')originSlotId=index.active.id;
  if(!originSlotId&&index.active&&index.active.originSlotId)originSlotId=index.active.originSlotId;
  const env={format:'hejing-save',version:SCHEMA_VERSION,gameVersion:GAME_VERSION,id:'challenge',name:cleanName(name,old?old.name:'挑战'),mode:'challenge',createdAt:old?old.createdAt:now,updatedAt:now,originSlotId:originSlotId||null,state};
  store.setItem(CHALLENGE_KEY,JSON.stringify(env));
  index.active={kind:'challenge',originSlotId:env.originSlotId};saveIndex(index);
  return env;
}
function startChallenge(state,name){
  store.removeItem(CHALLENGE_KEY);
  return saveChallenge(state,name);
}
function saveActive(state,meta){
  const index=loadIndex(),a=index.active||{};
  if(a.kind==='challenge')return saveChallenge(state,meta&&meta.challengeName);
  if(a.id&&readSlotEnvelope(a.id))return saveSlot(a.id,state);
  return createSlot(meta&&meta.name||'溪谷 1',state,true);
}
function returnToOrigin(){
  const index=loadIndex(),ch=readChallengeEnvelope();
  const origin=(ch&&ch.originSlotId)||(index.active&&index.active.originSlotId)||null;
  store.removeItem(CHALLENGE_KEY);
  if(origin){
    const env=readSlotEnvelope(origin);
    if(env){index.active={kind:'slot',id:origin};saveIndex(index);return session('slot',env);}
  }
  return fallbackFree(index);
}
function discardChallenge(){
  return returnToOrigin();
}
function clearChallenge(){
  store.removeItem(CHALLENGE_KEY);
}
function promoteChallenge(state,name){
  if(!validState(state))fail('INVALID_STATE','挑战世界状态不完整，无法另存。');
  const free=JSON.parse(JSON.stringify(state));free.ch=null;free.paused=false;
  const env=createSlot(cleanName(name,'挑战后的溪谷'),free,true);
  store.removeItem(CHALLENGE_KEY);
  return session('slot',env);
}
function exportEnvelope(env){
  return JSON.stringify({format:EXPORT_FORMAT,version:SCHEMA_VERSION,exportedAt:new Date().toISOString(),save:env},null,2);
}
function exportSlot(id){
  const env=readSlotEnvelope(id);
  if(!env)fail('SLOT_BROKEN','这个存档不存在或已损坏。');
  return exportEnvelope(env);
}
function exportActive(){
  const index=loadIndex();
  if(index.active&&index.active.kind==='challenge'){
    const env=readChallengeEnvelope();
    if(!env)fail('SLOT_BROKEN','挑战存档不存在或已损坏。');
    return exportEnvelope(env);
  }
  if(!index.active||!index.active.id)fail('SLOT_MISSING','当前没有可导出的存档。');
  return exportSlot(index.active.id);
}
function importText(text){
  if(typeof text!=='string'||text.length>2000000)fail('IMPORT_TOO_LARGE','导入文件过大或不是文本存档。');
  const parsed=safeParse(text);
  if(!parsed)fail('IMPORT_INVALID','无法读取这个 JSON 存档。');
  let source=null,name='导入的溪谷';
  if(parsed.format===EXPORT_FORMAT&&parsed.version===SCHEMA_VERSION&&parsed.save){
    source=parsed.save.state;name=parsed.save.name||name;
  }else if(parsed.version===SCHEMA_VERSION&&parsed.state){
    source=parsed.state;name=parsed.name||name;
  }else if(parsed.v===1){
    source=parsed;name='旧版导入存档';
  }
  source=sanitizeImported(source,0);
  if(!validState(source))fail('IMPORT_INVALID','这个文件不是有效的禾境存档，或数据已经损坏。');
  return createSlot(name,source,false);
}
function migrateLegacy(){
  const raw=store.getItem(LEGACY_KEY);
  if(!raw)return {migrated:false,error:null};
  const state=safeParse(raw);
  if(!validState(state))return {migrated:false,error:'旧版存档已损坏，已保留原始数据。'};
  try{
    const env=createSlot('旧版溪谷',state,true);
    store.removeItem(LEGACY_KEY);
    return {migrated:true,error:null,id:env.id};
  }catch(err){
    return {migrated:false,error:err.code==='SLOTS_FULL'?'自由存档槽已满，旧版存档尚未迁移。':'旧版存档迁移失败，原始数据仍然保留。'};
  }
}
function bootstrap(){
  const migration=migrateLegacy();
  return {session:loadActive(),migrated:migration.migrated,migrationError:migration.error};
}

return {
  SCHEMA_VERSION,GAME_VERSION,MAX_SLOTS,
  bootstrap,loadActive,saveActive,createSlot,saveSlot,loadSlot,renameSlot,deleteSlot,listSlots,getActiveInfo,
  startChallenge,returnToOrigin,discardChallenge,clearChallenge,promoteChallenge,
  exportSlot,exportActive,importText,
  validateState:validState
};
}
