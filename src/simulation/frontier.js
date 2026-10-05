// 开拓新土地：远征南屿。门槛高、开荒期艰难，失败会损失全部投入。
import { MAP, ISLE, VKEYS, ALL_VKEYS } from '../world/map.js';
import { YEAR, ageY } from './clock.js';
import { random, rand, clamp } from './random.js';
import { hasTech, TECHS } from './tech.js';
import { freeSlot, homeTile, log } from './population.js';
import { adjustResidentHappiness } from './invariants.js';

export const FRONTIER={
  tech:'searoute',
  population:50,
  treasury:300,
  food:400,
  provisions:200,
  cohesion:60,
  volunteers:8,
  volunteerAge:[18,45],
  volunteerHealth:60,
  volunteerHappiness:55,
  pioneerDays:60,
  minAdults:5,
  minMorale:50,
  retryDays:2*YEAR,
  hardship:22,
  pioneerWork:0.5,
  stormChance:0.035,
  farmBonus:0.3,
  fishBonus:0.3,
  birthCap:15
};

export const frontierStage=state=>state&&state.frontier&&state.frontier.stage||null;
export const isSettled=state=>frontierStage(state)==='settled';
export const isPioneering=state=>frontierStage(state)==='pioneer';
// 开荒期的南屿居民不能通过普通迁徙、出走等路径离开；返乡只能走远征专用流程。
export const canDepart=(state,p)=>!(isPioneering(state)&&p.village===ISLE);
// 开荒期海峡是现实边界：两个人只有在同一侧时才能发生需要见面的互动（结伴、生育等）。
export const canInteract=(state,a,b)=>!isPioneering(state)||(a.village===ISLE)===(b.village===ISLE);
// 地图上能看见南屿：掌握远洋航路之后，或已经出发过。
export const isleVisible=state=>hasTech(state,FRONTIER.tech)||!!frontierStage(state);
// 移民、建造、两难抉择等可以选到的聚落。
export const activeVillages=state=>isSettled(state)?ALL_VKEYS:VKEYS;

const worker=p=>p.job!=='child'&&p.job!=='elder';
export const islanders=state=>state.people.filter(p=>p.village===ISLE);
// 健康已经归零的人当天还没被移出名单，但已经不能算劳力了。
export const islandAdults=state=>islanders(state).filter(p=>worker(p)&&p.health>0);
export function islandMorale(state){
  const adults=islandAdults(state);
  return adults.length?adults.reduce((t,p)=>t+p.happiness,0)/adults.length:0;
}

export function isVolunteer(p){
  const [lo,hi]=FRONTIER.volunteerAge,age=ageY(p);
  // 资格与界面显示使用同一“周岁”语义：45 岁的整年都应算在 18–45 岁范围内。
  return worker(p)&&p.village!==ISLE&&age>=lo&&age<=hi
    &&p.health>=FRONTIER.volunteerHealth&&p.happiness>=FRONTIER.volunteerHappiness;
}
export function volunteers(state){
  return state.people.filter(isVolunteer).sort((a,b)=>b.happiness-a.happiness||a.id-b.id);
}

export function retryLeft(state){
  const f=state.frontier;
  return f&&f.stage==='failed'?Math.max(0,f.retry-state.day):0;
}

// 每一项出发条件；全部满足才能出发。
export function expeditionChecks(state){
  const n=state.people.length,v=volunteers(state).length;
  const checks=[
    {k:'tech',label:`掌握${TECHS[FRONTIER.tech].n}`,ok:hasTech(state,FRONTIER.tech),have:hasTech(state,FRONTIER.tech)?'已掌握':'未掌握'},
    {k:'population',label:`人口至少 ${FRONTIER.population} 人`,ok:n>=FRONTIER.population,have:`${n} 人`},
    {k:'treasury',label:`公库至少 ${FRONTIER.treasury} 金（全部用于造船置办）`,ok:state.treasury>=FRONTIER.treasury,have:`${Math.floor(state.treasury)} 金`},
    {k:'food',label:`存粮至少 ${FRONTIER.food} 担（带走 ${FRONTIER.provisions} 担）`,ok:state.food>=FRONTIER.food,have:`${Math.floor(state.food)} 担`},
    {k:'cohesion',label:`凝聚力至少 ${FRONTIER.cohesion}`,ok:state.cohesion>=FRONTIER.cohesion,have:`${Math.round(state.cohesion)}`},
    {k:'volunteers',label:`至少 ${FRONTIER.volunteers} 位志愿者（${FRONTIER.volunteerAge[0]}–${FRONTIER.volunteerAge[1]} 岁的劳力，健康 ≥ ${FRONTIER.volunteerHealth}，幸福 ≥ ${FRONTIER.volunteerHappiness}）`,ok:v>=FRONTIER.volunteers,have:`${v} 人`}
  ];
  const wait=retryLeft(state);
  if(wait)checks.push({k:'retry',label:'上次远征失败后要休整两年',ok:false,have:`还要 ${wait} 日`});
  return checks;
}
export function expeditionReady(state){
  const st=frontierStage(state);
  return (st===null||st==='failed')&&expeditionChecks(state).every(c=>c.ok);
}

// 挑出志愿者，并带上同住的伴侣和年幼的孩子。随行家属不计入志愿者名额。
export function pickSettlers(state){
  const chosen=[],byId=new Map(state.people.map(p=>[p.id,p]));
  let taken=0;
  const add=p=>{if(!p||chosen.includes(p))return;chosen.push(p);if(isVolunteer(p))taken++;};
  // 大人连同自己年幼的孩子一起上船（包括伴侣与前任所生的孩子）。
  const addWithKids=p=>{
    add(p);
    for(const id of p.children){const c=byId.get(id);if(c&&c.job==='child'&&c.village===p.village)add(c);}
  };
  for(const p of volunteers(state)){
    if(taken>=FRONTIER.volunteers)break;
    if(chosen.includes(p))continue;
    addWithKids(p);
    const partner=byId.get(p.partner);
    if(partner&&partner.village===p.village)addWithKids(partner);
  }
  return chosen;
}

// 换了住处的人径直走向新家（不消耗随机数）。
function goHome(p){const t=homeTile(p);p.tx=t.i;p.ty=t.j;}

// 同一户近亲关系必须是对称的：伴侣、父母/子女，以及共享父母的兄弟姐妹都算一家人。
// 这样即使父母在远征中去世，返乡的孩子仍会跟已经回家的同胞住在一起。
function householdKin(a,b){
  return a.partner===b.id||b.partner===a.id
    ||a.parents.includes(b.id)||b.parents.includes(a.id)
    ||a.parents.some(id=>b.parents.includes(id));
}
function familyHome(state,p,v){
  const q=state.people.find(q=>q!==p&&q.village===v&&householdKin(p,q));
  return q?q.home:null;
}

// 出发：扣除资源，把开拓者搬上南屿，一家人住一处。返回开拓者列表；条件不满足时返回 null。
export function launchExpedition(state){
  if(!expeditionReady(state))return null;
  const settlers=pickSettlers(state),origin={},slots=MAP.V[ISLE].slots.length;
  state.treasury-=FRONTIER.treasury;
  state.food-=FRONTIER.provisions;
  let homes=0;
  for(const p of settlers){
    const h=familyHome(state,p,ISLE);
    origin[p.id]=p.village;p.village=ISLE;p.home=h!=null?h:homes++%slots;goHome(p);
    log(p,'登上大船，跟着远征队去开拓南屿');
  }
  state.frontier={stage:'pioneer',start:state.day,origin,tries:((state.frontier&&state.frontier.tries)||0)+1};
  return settlers;
}

// 开荒期每日的产出系数与幸福惩罚（供经济模拟与解释面板使用）。
export function workFactor(state,p){
  if(p.village!==ISLE)return 1;
  if(isPioneering(state))return FRONTIER.pioneerWork;
  if(isSettled(state))return p.job==='farmer'?1+FRONTIER.farmBonus:p.job==='fisher'?1+FRONTIER.fishBonus:1;
  return 1;
}
// 本岛矿洞只有本岛居民和已经定居的南屿居民能去；开荒期的开拓者不能出岛。
export const canMine=(state,p)=>p.village!==ISLE||!isPioneering(state);
export const hardshipFor=(state,p)=>isPioneering(state)&&p.village===ISLE?FRONTIER.hardship:0;
export const frontierBirthCap=state=>isSettled(state)?FRONTIER.birthCap:0;

// 开荒期每日推进。返回 {event, text}，没有事发生时返回 null。
// 只有开荒期才会消耗随机数。
export function frontierTick(state){
  if(!isPioneering(state))return null;
  const f=state.frontier,elapsed=state.day-f.start;
  let storm=null;
  if(random()<FRONTIER.stormChance){
    for(const p of islanders(state)){
      const before=p.health;
      p.health-=rand(8,22);adjustResidentHappiness(p,-6);log(p,'在南屿遇上了一场大风暴');
      if(before>0&&p.health<=0)p.fatalCause='风暴';
    }
    storm={event:'storm',text:'一场风暴扑向南屿，开拓者的窝棚被掀翻了好几间。'};
  }
  const adults=islandAdults(state).length;
  if(adults<FRONTIER.minAdults)return failExpedition(state,`南屿只剩 ${adults} 位能干活的开拓者，撑不下去了`);
  if(elapsed<FRONTIER.pioneerDays)return storm;
  const morale=islandMorale(state);
  if(morale<FRONTIER.minMorale)return failExpedition(state,`开拓者人心思归（平均幸福 ${Math.round(morale)}，至少要 ${FRONTIER.minMorale}）`);
  state.frontier={stage:'settled',day:state.day,tries:f.tries};
  for(const p of islanders(state).filter(p=>p.health>0)){adjustResidentHappiness(p,15);log(p,'和大家一起把南屿变成了新的家园');}
  return {event:'settled',text:`历经 ${FRONTIER.pioneerDays} 日开荒，南屿正式成为溪谷的第四个聚落！`};
}

// 把一位南屿居民送回故乡：优先回自己出发的聚落，其次跟随伴侣或父母；
// 已经回去的伴侣或父母在哪处宅基地，就和他们住在一起。
export function returnHome(state,p,origin=(state.frontier&&state.frontier.origin)||{}){
  const v=[p.id,p.partner,...p.parents].map(id=>origin[id]).find(k=>VKEYS.includes(k))||'bay';
  const h=familyHome(state,p,v);
  p.village=v;p.home=h!=null?h:freeSlot(v);goHome(p);
  return v;
}

export function failExpedition(state,why){
  const f=state.frontier,origin=f.origin||{};
  // 只把仍然活着的人送回去；当日刚死亡的人留给同一 tick 的统一死亡流程处理。
  const back=islanders(state).filter(p=>p.health>0);
  for(const p of back){
    returnHome(state,p,origin);adjustResidentHappiness(p,-10);
    log(p,'远征失败，垂头丧气地回到了故乡');
  }
  state.frontier={stage:'failed',day:state.day,retry:state.day+FRONTIER.retryDays,tries:f.tries};
  return {event:'failed',text:`远征南屿失败：${why}。${back.length} 人坐船回到了故乡，投入的钱粮都打了水漂。`};
}

export function normalizeFrontier(state){
  const f=state.frontier;
  if(!f||typeof f!=='object'||!['pioneer','settled','failed'].includes(f.stage)){state.frontier=null;return;}
  const tries=Number.isFinite(f.tries)?f.tries:1;
  if(f.stage==='pioneer')state.frontier={stage:'pioneer',start:Number.isFinite(f.start)?f.start:state.day,origin:f.origin&&typeof f.origin==='object'?f.origin:{},tries};
  else if(f.stage==='settled')state.frontier={stage:'settled',day:Number.isFinite(f.day)?f.day:state.day,tries};
  else state.frontier={stage:'failed',day:Number.isFinite(f.day)?f.day:state.day,retry:Number.isFinite(f.retry)?f.retry:state.day,tries};
}
