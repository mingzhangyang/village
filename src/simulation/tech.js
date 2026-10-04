// 发展图谱：用公库的钱立项、按日积累进度的长期发展线。
// 光有钱不够：每项技术还要有够格的行家、设施或民心，条件一旦不满足研究就会停滞。
// 所有效果都是确定性的倍率或加成，不消耗随机数。
import { JOBS } from './constants.js';
import { BUILDS } from './buildings.js';

export const TECHS={
  rotation:{n:'轮作休耕',tier:1,cost:40,days:20,req:[],needs:[{k:'job',job:'farmer',n:3,skill:35}],d:'农田轮换作物，地力不再耗尽。',fx:{farm:0.15},h:'农夫产粮 +15%'},
  nets:{n:'改良渔网',tier:1,cost:35,days:15,req:[],needs:[{k:'job',job:'fisher',n:2,skill:35}],d:'织更密更结实的网，冬天也能出海。',fx:{fish:0.2},h:'渔民产粮 +20%'},
  herbs:{n:'草药医术',tier:1,cost:40,days:20,req:[],needs:[{k:'job',job:'elder',n:1},{k:'building',b:'well'}],d:'长者把认得的草药记成方子，代代相传。',fx:{heal:0.4,plague:-0.3},h:'每日恢复健康 +0.4，染疫概率 −30%'},
  ledger:{n:'记账算学',tier:1,cost:35,days:15,req:[],needs:[{k:'job',job:'merchant',n:2,skill:40},{k:'building',b:'market'}],d:'用算盘和账簿管钱，买卖更有章法。',fx:{merchant:0.25,craft:0.15},h:'商人经营所得 +25%，工匠作坊产出 +15%'},
  iron:{n:'铁制农具',tier:2,cost:80,days:30,req:['rotation'],needs:[{k:'mine'},{k:'job',job:'miner',n:2,skill:35},{k:'job',job:'woodcutter',n:2,skill:40}],d:'用山里的矿石打出铁犁、铁斧和铁镐。',fx:{farm:0.15,wood:0.2,mine:0.15},h:'产粮 +15%，樵夫 +20%，矿工 +15%'},
  kiln:{n:'窑烧砖瓦',tier:2,cost:70,days:25,req:['ledger'],needs:[{k:'job',job:'craftsman',n:2,skill:45},{k:'job',job:'woodcutter',n:1,skill:40}],d:'垒起砖窑，烧出砖瓦和陶器卖到岛外。',fx:{craft:0.3},h:'工匠作坊产出 +30%'},
  preserve:{n:'腌藏晒干',tier:2,cost:65,days:25,req:['nets'],needs:[{k:'job',job:'fisher',n:2,skill:45},{k:'building',b:'granary'}],d:'学会腌鱼、晒谷、窖藏，粮食放得更久。',fx:{cap:150,rot:-0.6},h:'仓容 +150，仓满时的损耗 −60%'},
  waterwheel:{n:'水车磨坊',tier:3,cost:130,days:40,req:['iron'],needs:[{k:'canal'},{k:'job',job:'farmer',n:3,skill:55},{k:'job',job:'craftsman',n:1,skill:55}],d:'借水渠的水力推动水车，舂米磨面都省了人力。',fx:{farm:0.2,craft:0.2},h:'产粮 +20%，工匠作坊产出 +20%'},
  printing:{n:'雕版印书',tier:3,cost:110,days:35,req:['ledger','herbs'],needs:[{k:'school'},{k:'job',job:'craftsman',n:2,skill:55},{k:'cohesion',n:55}],d:'把手艺和医方刻版印成书，人人都能学。',fx:{skill:0.5,research:0.3},h:'所有人学手艺 +50%，研究速度 +30%'},
  housing:{n:'扩建屋舍',tier:3,cost:100,days:30,req:['kiln'],needs:[{k:'pop',n:45},{k:'job',job:'craftsman',n:2,skill:50},{k:'job',job:'woodcutter',n:2,skill:50}],d:'用砖瓦盖起更宽敞的房子，能住下更大的家。',fx:{birthCap:30},h:'人口超过 90 后出生率才会下降（原为 60）'},
  searoute:{n:'远洋航路',tier:3,cost:120,days:40,req:['preserve','ledger'],needs:[{k:'job',job:'fisher',n:3,skill:55},{k:'job',job:'merchant',n:2,skill:55},{k:'cohesion',n:55}],d:'画出海图、造起大船，和远方的港口通商。',fx:{ship:1},h:'每 40 日有一艘商船来访：粮食 +30，商人生意兴隆 6 日'}
};
export const TECH_KEYS=Object.keys(TECHS);
export const SHIP_INTERVAL=40;
const ERAS=[[0,'草创'],[1,'开垦'],[4,'兴旺'],[7,'繁荣'],[10,'昌盛']];

const learned=state=>state&&state.tech&&typeof state.tech==='object'?state.tech:{};
export const hasTech=(state,id)=>Object.prototype.hasOwnProperty.call(learned(state),id);
export const techCount=state=>TECH_KEYS.filter(id=>hasTech(state,id)).length;
export function era(state){const n=techCount(state);let name=ERAS[0][1];for(const [min,label] of ERAS)if(n>=min)name=label;return name;}

// 已掌握技术在某一维度上的加成总和。
export function techBonus(state,key){
  let total=0;
  for(const id of TECH_KEYS)if(hasTech(state,id))total+=TECHS[id].fx[key]||0;
  return total;
}
export const techMult=(state,key)=>1+techBonus(state,key);

const FAMINE_DAYS=10;
const isWorker=p=>p.job!=='child'&&p.job!=='elder';
const experts=(state,need)=>state.people.filter(p=>p.job===need.job&&(need.skill==null||p.skill>=need.skill)).length;
function foodDays(state){let n=0;for(const p of state.people)n+=p.job==='child'?0.07:0.11;return n>0?state.food/n:999;}
const builtCount=(state,b)=>(state.built||[]).filter(x=>x&&x.b===b).length;

// 一项技术除了前置技术和钱之外的现实条件，逐条给出是否满足。
export function techNeeds(state,id){
  return TECHS[id].needs.map(need=>{
    switch(need.k){
      case 'job':{
        const have=experts(state,need),who=JOBS[need.job].n;
        return {need,ok:have>=need.n,label:`${need.n} 位${who}${need.skill!=null?`（技能 ≥ ${need.skill}）`:''}`,have:`${have} 位`};
      }
      case 'building':{const have=builtCount(state,need.b);return {need,ok:have>=1,label:`建有${BUILDS[need.b].n}`,have:have?'已建':'未建'};}
      case 'mine':return {need,ok:!!state.mine,label:'已发现矿脉',have:state.mine?'已发现':'未发现'};
      case 'canal':return {need,ok:!!state.canal,label:'已修水渠',have:state.canal?'已修':'未修'};
      case 'school':return {need,ok:!!state.school,label:'办有学堂',have:state.school?'已办':'未办'};
      case 'pop':return {need,ok:state.people.length>=need.n,label:`人口至少 ${need.n}`,have:`${state.people.length} 人`};
      case 'cohesion':return {need,ok:state.cohesion>=need.n,label:`凝聚力至少 ${need.n}`,have:`${Math.round(state.cohesion)}`};
      default:return {need,ok:true,label:'',have:''};
    }
  });
}
const unmet=(state,id)=>techNeeds(state,id).filter(r=>!r.ok);

// 正在进行的研究为什么停下；空字符串表示正常推进。
export function researchStall(state){
  const r=state.research;if(!r)return '';
  const miss=unmet(state,r.id);
  if(miss.length)return `缺少${miss.map(m=>m.label).join('、')}`;
  if(foodDays(state)<FAMINE_DAYS)return '溪谷在闹饥荒，没人有心思钻研';
  return '';
}

// 每日推进的工作量：行家越多越快，学堂与印书加速，旱灾和疫病拖慢。
export function researchRate(state,id=state.research&&state.research.id){
  let staff;
  const jobs=id?TECHS[id].needs.filter(n=>n.k==='job'):[];
  if(jobs.length){
    const need=jobs.reduce((t,n)=>t+n.n,0),have=jobs.reduce((t,n)=>t+experts(state,n),0);
    staff=0.6+0.4*Math.min(1,have/(need*2));
  }else staff=0.5+0.5*Math.min(1,state.people.filter(isWorker).length/15);
  const trouble=state.drought>0||state.plague>0?0.5:1;
  return staff*(state.school?1.25:1)*techMult(state,'research')*trouble;
}

// 返回不能研究的原因；空字符串表示可以研究。
export function researchBlock(state,id){
  const T=TECHS[id];if(!T)return '没有这项技术。';
  if(hasTech(state,id))return '已经掌握。';
  if(state.research)return state.research.id===id?'正在研究。':`正在研究${TECHS[state.research.id].n}。`;
  const miss=T.req.filter(r=>!hasTech(state,r));
  if(miss.length)return `需要先掌握${miss.map(r=>TECHS[r].n).join('、')}。`;
  const lack=unmet(state,id);
  if(lack.length)return `还缺：${lack.map(m=>`${m.label}（现有 ${m.have}）`).join('；')}。`;
  if(state.treasury<T.cost)return `公库 ${Math.floor(state.treasury)}/${T.cost} 金。`;
  return '';
}

export function startResearch(state,id){
  if(researchBlock(state,id))return false;
  state.treasury-=TECHS[id].cost;
  state.research={id,prog:0};
  return true;
}

// 放弃研究，退回一半费用。
export function cancelResearch(state){
  const r=state.research;if(!r)return 0;
  const back=Math.round(TECHS[r.id].cost*0.5);
  state.treasury+=back;state.research=null;
  return back;
}

// 推进一日研究。返回 {done} 表示完成，{stalled, why} 表示刚刚停滞，{resumed} 表示恢复；平常返回 null。
export function advanceResearch(state){
  const r=state.research;if(!r)return null;
  const why=researchStall(state);
  if(why){
    if(r.stalled)return null;
    r.stalled=true;return {stalled:r.id,why};
  }
  const resumed=!!r.stalled;r.stalled=false;
  r.prog+=researchRate(state);
  if(r.prog<TECHS[r.id].days)return resumed?{resumed:r.id}:null;
  state.tech[r.id]=state.day;state.research=null;
  return {done:r.id};
}

export function normalizeTech(state){
  const raw=state.tech&&typeof state.tech==='object'&&!Array.isArray(state.tech)?state.tech:{};
  const tech={};
  for(const id of TECH_KEYS)if(Number.isFinite(raw[id]))tech[id]=raw[id];
  state.tech=tech;
  const r=state.research;
  state.research=r&&typeof r==='object'&&TECHS[r.id]&&!hasTech(state,r.id)&&Number.isFinite(r.prog)
    ?{id:r.id,prog:Math.max(0,r.prog),stalled:!!r.stalled}:null;
}
