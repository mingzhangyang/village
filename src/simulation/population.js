import { MAP, VKEYS, ISLE } from '../world/map.js';
import { JOBS, TRAITS, SURN, GIVEN, SKIN, HAIR } from './constants.js';
import { YEAR, ageY } from './clock.js';
import { random, rand, randi, pick, clamp } from './random.js';
import { getState, markStateDirty } from './state.js';
import { canDepart, canMine } from './frontier.js';
import { defaultSurnameForNewPerson, knownPersonSurname, migratedFamilyName, surnameFromName } from './names.js';

export const ta=p=>p.gender==='女'?'她':'他';
export const isWorker=p=>p.job!=='child'&&p.job!=='elder';
export const need=p=>p.job==='child'?0.07:0.11;




export function log(p,t){
  const S = getState();p.hist.push({d:S.day,t});if(p.hist.length>60)p.hist.splice(0,p.hist.length-60);}
export function chron(t,k){
  const S = getState();S.chron.push({d:S.day,t,k:k||'info'});if(S.chron.length>120)S.chron.shift();S.chronVer++;markStateDirty();}
export function friendCount(p){let n=0;for(const k in p.rel)if(p.rel[k]>=40)n++;return n;}
export function living(id){
  const S = getState();for(const p of S.people)if(p.id===id)return p;return null;}
export function byId(id){
  const S = getState();return living(id)||S.dead.find(p=>p.id===id)||null;}
export function uniqueName(surname=null,id=null){
  const S = getState();
  const used=new Set(S.people.map(p=>p.name));
  const inherit=legacyName=>surname
    ?migratedFamilyName({id,name:legacyName},surname,used)
    :legacyName;
  for(let k=0;k<40;k++){
    const n=random()<0.14
      ?'阿'+pick(GIVEN)
      :pick(SURN)+pick(GIVEN)+(random()<0.45?pick(GIVEN):'');
    if(!used.has(n))return inherit(n);
  }
  return inherit(pick(SURN)+pick(GIVEN)+pick(GIVEN));
}
export function foodDays(){
  const S = getState();let n=0;for(const p of S.people)n+=need(p);return n>0?S.food/n:999;}
export function chooseJob(p){
  const S = getState();
  if(S.mine&&canMine(S,p)&&random()<0.22)return 'miner';
  if(S.people.length&&foodDays()<20&&random()<0.55)return p.village==='bay'?'fisher':'farmer';
  const T={grain:[['farmer',.66],['craftsman',.2],['merchant',.14]],pine:[['woodcutter',.5],['craftsman',.33],['farmer',.17]],bay:[['fisher',.55],['merchant',.28],['craftsman',.17]],isle:[['farmer',.42],['fisher',.42],['craftsman',.16]]}[p.village];
  let x=random();for(const [j,w] of T){if((x-=w)<0)return j;}return T[0][0];
}
export function freeSlot(v){
  const S = getState();
  const used=new Set(S.people.filter(q=>q.village===v).map(q=>q.home));
  const n=MAP.V[v].slots.length;for(let k=0;k<n;k++)if(!used.has(k))return k;return randi(0,n-1);
}
export function homeTile(p){
  const sl=MAP.V[p.village].slots;return sl[p.home%sl.length];}
export function makePerson(o){
  const S = getState();
  const parentPeople=(o.parents||[]).map(id=>byId(id)).filter(Boolean);
  const father=parentPeople.find(parent=>parent.gender==='男')||null;
  const id=S.nextId++;
  const inheritedSurname=o.surname||knownPersonSurname(father);
  const name=o.name||uniqueName(inheritedSurname,id);
  const surname=inheritedSurname||surnameFromName(name)||defaultSurnameForNewPerson(id);
  const p={id,name,surname,gender:o.gender||(random()<0.5?'男':'女'),age:o.age,village:o.village,job:'child',
    wealth:o.wealth!=null?o.wealth:0,happiness:o.happiness!=null?o.happiness:rand(50,68),health:100,skill:o.skill!=null?o.skill:rand(10,40),
    traits:[],rel:{},met:{},partner:null,parents:o.parents||[],children:[],hist:[],fed:1,hungerDays:0,sadDays:0,lastIncome:0,
    status:'alive',home:0,x:0,y:0,tx:0,ty:0,skin:pick(SKIN),hair:pick(HAIR),lastBirth:-999,plagueTag:0};
  const nt=random()<0.55?2:1;
  while(p.traits.length<nt){const t=pick(TRAITS);if(!p.traits.includes(t))p.traits.push(t);}
  if(p.age>=62*YEAR)p.job='elder';else if(p.age>=14*YEAR)p.job=chooseJob(p);
  p.home=o.home!=null?o.home:freeSlot(p.village);
  const h=homeTile(p);p.x=p.tx=h.i+rand(-0.3,0.3);p.y=p.ty=h.j+rand(-0.3,0.3);
  S.people.push(p);return p;
}
export function setRel(p,q,v){p.rel[q.id]=v;q.rel[p.id]=v;if(v>=40){p.met[q.id]=1;q.met[p.id]=1;}}
export function bond(a,b){a.partner=b.id;b.partner=a.id;setRel(a,b,85);}

export function seedPopulation(){
  const S = getState();
  const plan={pine:10,grain:11,bay:9};
  const Y=(a,b)=>randi(a,b)*YEAR+randi(0,YEAR-1);
  for(const v of VKEYS){
    const a1=makePerson({village:v,age:Y(24,40),gender:'男',wealth:rand(12,40),home:0});
    const a2=makePerson({village:v,age:Y(23,38),gender:'女',wealth:rand(12,40),home:0});
    const b1=makePerson({village:v,age:Y(30,50),gender:'男',wealth:rand(10,45),home:1});
    const b2=makePerson({village:v,age:Y(28,48),gender:'女',wealth:rand(10,45),home:1});
    bond(a1,a2);bond(b1,b2);
    const c1=makePerson({village:v,age:Y(2,9),home:0,parents:[a1.id,a2.id],skill:rand(5,15)});
    const c2=makePerson({village:v,age:Y(6,12),home:1,parents:[b1.id,b2.id],skill:rand(5,15)});
    a1.children.push(c1.id);a2.children.push(c1.id);b1.children.push(c2.id);b2.children.push(c2.id);
    setRel(c1,a1,80);setRel(c1,a2,80);setRel(c2,b1,80);setRel(c2,b2,80);
    for(let k=0;k<plan[v]-6;k++){
      if(k===0)makePerson({village:v,age:Y(62,71),wealth:rand(20,60)});
      else makePerson({village:v,age:Y(17,45),wealth:rand(6,35)});
    }
  }
  const P=S.people;
  const hero=P.find(p=>p.village==='grain'&&p.job==='farmer'&&!p.partner)||P.find(p=>p.village==='grain'&&p.job!=='child')||P[0];
  hero.name='阿禾';S.sel=hero.id;
  for(const p of P){
    const vs=P.filter(q=>q.village===p.village&&q!==p);
    for(let k=0;k<2;k++){const q=pick(vs);if(!(q.id in p.rel))setRel(p,q,rand(25,60));}
    const vn=MAP.V[p.village].n;
    if(p.job==='child'){const ps=p.parents.map(id=>byId(id)).filter(Boolean).map(q=>q.name);log(p,`在${vn}长大，父母是${ps.join('与')}`);}
    else log(p,`在${vn}生活，是一名${JOBS[p.job].n}`);
    if(p.partner){const q=byId(p.partner);log(p,`与${q.name}相伴多年`);}
  }
}

/* ---------------- 每日模拟 ---------------- */
export function changeRel(p,q,d){
  const a=p.rel[q.id]||0,b=clamp(a+d,-100,100);p.rel[q.id]=b;q.rel[p.id]=b;
  if(a<40&&b>=40&&!p.met[q.id]){p.met[q.id]=1;q.met[p.id]=1;log(p,`与${q.name}成了朋友`);log(q,`与${p.name}成了朋友`);}
  else if(a>-30&&b<=-30){log(p,`与${q.name}起了嫌隙`);log(q,`与${p.name}起了嫌隙`);}
}
export function notify(p,text){
  const S = getState();
  if(!S.alertsOn||!p)return;
  if(p.id!==S.sel&&!S.watch.includes(p.id))return;
  if(S.alerts.some(a=>a.id===p.id&&a.text===text))return;
  S.alerts.push({id:p.id,name:p.name,text});if(S.alerts.length>5)S.alerts.shift();markStateDirty();
}
export function remove(p,status,cause){
  const S = getState();
  // 所有普通离开都经过这一道边界；开荒期南屿居民只能由 frontier.returnHome/failExpedition 处理。
  if(status==='left'&&!canDepart(S,p))return false;
  const i=S.people.indexOf(p);if(i<0)return false;S.people.splice(i,1);
  p.status=status;p.endDay=S.day;p.cause=cause||'';
  if(status==='dead'){
    S.deaths++;
    const msg=cause==='寿终'?`在${ageY(p)}岁时安详离世`:cause==='饥饿'?'在饥饿中离世':'因疫病离世';
    log(p,msg);chron(`${p.name}${msg}。`,'death');notify(p,msg);
    if(cause==='饥饿'){S.hungerDeaths++;S.lastHunger=p.name;}
  }else if(cause==='wander'){S.left++;S.lastLeft=p.name;notify(p,'离开溪谷，去外面闯荡了');log(p,'带着大家的祝福，离开溪谷去外面闯荡');chron(`${p.name} 离开溪谷，去外面闯荡了。`,'leave');}
  else{S.left++;S.lastLeft=p.name;notify(p,'对生活失去了指望，离开了溪谷');log(p,'对生活失去了指望，离开了溪谷');chron(`${p.name} 离开了溪谷，去远方寻找生计。`,'leave');}
  for(const q of S.people){
    const r=q.rel[p.id];if(r==null)continue;delete q.rel[p.id];
    if(q.partner===p.id){q.partner=null;q.happiness-=18;const t=status==='dead'?`失去了伴侣${p.name}`:`伴侣${p.name}离开了溪谷`;log(q,t);notify(q,t);}
    else if(r>=70&&status==='dead'){q.happiness-=8;log(q,`送别了挚友${p.name}`);}
  }
  S.dead.push(p);if(S.dead.length>150)S.dead.shift();
  return true;
}
export function nearestOf(list,h){if(!list.length)return null;let b=null,bd=1e9;for(let k=0;k<3;k++){const c=pick(list);const d=Math.hypot(c.i-h.i,c.j-h.j);if(d<bd){bd=d;b=c;}}return b;}
export function assignTarget(p){
  const S = getState();
  const V=MAP.V[p.village],L=p.village===ISLE?MAP.isle:MAP,home=homeTile(p);let t;const r=random();
  if(!isWorker(p))t=r<0.5?home:r<0.8?V.center:pick(V.slots);
  else if(r<0.62){
    switch(p.job){
      case 'farmer':t=nearestOf(L.fields,home)||V.center;break;
      case 'fisher':t=nearestOf(L.water,home)||V.center;break;
      case 'woodcutter':t=nearestOf(L.forest,home)||V.center;break;
      case 'miner':t=S.mine&&canMine(S,p)?pick(MAP.mineAdj):V.center;break;
      case 'merchant':t=pick(L.plazas);break;
      default:t=random()<0.5?V.center:home;
    }
  }else t=r<0.85?home:V.center;
  p.tx=t.i+rand(-0.32,0.32);p.ty=t.j+rand(-0.32,0.32);
}
