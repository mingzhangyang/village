// 地图点选信息卡：把点到的东西（村子、房屋、建筑、田地、树林……）描述成卡片内容。
// 只读 state，不改动任何东西，也不消耗模拟随机数。
import { MAP, ISLE, VKEYS } from '../world/map.js';
import { JOBS } from '../simulation/constants.js';
import { YEAR, seasonIndex, SEASONS } from '../simulation/clock.js';
import { homeTile } from '../simulation/population.js';
import { BUILDS, levelOf, levelName, nextUpgrade, upgradeBlock, UPGRADES } from '../simulation/buildings.js';
import { TECHS, hasTech, techMult } from '../simulation/tech.js';
import { FRONTIER, frontierStage, isSettled, isPioneering, islandAdults, islandMorale, workFactor, canMine } from '../simulation/frontier.js';

const pct=v=>`${v>=1?'+':''}${Math.round((v-1)*100)}%`;
const ageY=p=>Math.floor(p.age/YEAR);
const isWorker=p=>p.job!=='child'&&p.job!=='elder';
const avg=(list,f)=>list.length?list.reduce((t,p)=>t+f(p),0)/list.length:0;
const personRow=p=>({id:p.id,name:p.name,meta:`${ageY(p)}岁 · ${JOBS[p.job].n}`});

export function villageOf(t){
  if(t.isle)return ISLE;
  for(const k of [...VKEYS,ISLE])if(MAP.V[k].center===t||MAP.V[k].slots.includes(t))return k;
  let best=null,bd=1e9;
  for(const k of VKEYS){const c=MAP.V[k].center,d=Math.hypot(c.i-t.i,c.j-t.j);if(d<bd){bd=d;best=k;}}
  return best;
}
function techLines(state,keys){
  return keys.filter(([id])=>hasTech(state,id)).map(([id,txt])=>`${TECHS[id].n}：${txt}`);
}
function workersOf(state,job,where){
  return state.people.filter(p=>p.job===job&&(!where||where(p)));
}

// 村子：人口构成、职业、民心与建筑。
export function describeVillage(state,v){
  const V=MAP.V[v],ps=state.people.filter(p=>p.village===v);
  if(v===ISLE&&!isSettled(state)&&!ps.length)return describeIsle(state);
  const kids=ps.filter(p=>p.job==='child').length,elders=ps.filter(p=>p.job==='elder').length;
  const workers=ps.filter(isWorker);
  const jobs={};for(const p of workers)jobs[p.job]=(jobs[p.job]||0)+1;
  const jobText=Object.entries(jobs).sort((a,b)=>b[1]-a[1]).map(([j,n])=>`${JOBS[j].n} ${n}`).join('、')||'没有劳力';
  const built=(state.built||[]).filter(b=>b.v===v).map(levelName);
  const homes=new Set(ps.map(p=>p.home)).size;
  return {
    kicker:'聚落',title:V.n,
    rows:[
      ['人口',`${ps.length} 人（${ps.length-kids-elders} 劳力，${kids} 孩童，${elders} 长者）`],
      ['职业',jobText],
      ['平均幸福',ps.length?String(Math.round(avg(ps,p=>p.happiness))):'—'],
      ['平均技能',workers.length?String(Math.round(avg(workers,p=>p.skill))):'—'],
      ['住户',`${homes} 户 / ${V.slots.length} 处宅基地`],
      ['建筑',built.length?built.join('、'):'还没有']
    ],
    text:v===ISLE&&frontierStage(state)==='pioneer'?'南屿还在开荒期。':''
  };
}

// 房屋：住在这里的人。
export function describeHouse(state,t){
  const v=villageOf(t),ps=state.people.filter(p=>p.village===v&&homeTile(p)===t);
  const paired=ps.filter(p=>p.partner&&ps.some(q=>q.id===p.partner)),fam=paired.find(p=>p.gender==='男')||paired[0];
  return {
    kicker:`${MAP.V[v].n} · 民居`,
    title:ps.length?(fam?`${fam.surname||fam.name.slice(0,1)}家`:`${ps[0].name}的家`):'空屋',
    rows:ps.length?[['住户',`${ps.length} 人`],['家境',`共有 ${Math.round(ps.reduce((s,p)=>s+Math.max(0,p.wealth),0))} 金`]]:[],
    people:ps.sort((a,b)=>b.age-a.age).map(personRow),
    text:ps.length?'点名字可以追踪这个人的一生。':'暂时没人住。人口多起来后，新的家庭会住进来。'
  };
}

// 你盖的建筑：等级、效果、升级。
export function describeBuilding(state,b){
  const lv=levelOf(b),U=nextUpgrade(b),block=U?upgradeBlock(state,b):'';
  const now=lv>1?`${UPGRADES[b.b][lv-1].d}。`:BUILDS[b.b].d;
  return {
    kicker:`${MAP.V[b.v].n} · ${lv} 级建筑`,title:levelName(b),
    rows:[['效果',now],['下一级',U?`${U.n}：${U.d}（${U.cost} 金${U.tech?`，需${TECHS[U.tech].n}`:''}）`:'已是最高等级']],
    actions:U?[{act:'upgrade',label:`升级为${U.n}（${U.cost} 金）`,disabled:!!block,hint:block}]:[]
  };
}

export function describeField(state,t){
  const se=seasonIndex(state.day),season=[1,1.3,1.6,0.25][se],ps=workersOf(state,'farmer',p=>t.isle?p.village===ISLE:p.village!==ISLE);
  const mods=[`${SEASONS[se]}季 ×${season}`];
  if(state.drought>0)mods.push('干旱 ×0.3');
  if(state.canal&&!t.isle)mods.push('水渠 +35%');
  if(techMult(state,'farm')>1)mods.push(`技术 ${pct(techMult(state,'farm'))}`);
  if(t.isle)mods.push(...isleMod(state,'farmer'));
  return {
    kicker:t.isle?'南屿 · 田地':`${MAP.V[villageOf(t)].n} · 田地`,title:'农田',
    rows:[['农夫',`${ps.length} 位，平均技能 ${Math.round(avg(ps,p=>p.skill))}`],['今日全溪谷产粮',`${(state.foodProd||0).toFixed(1)} 担`],['产量系数',mods.join('，')]],
    text:techLines(state,[['rotation','产粮 +15%'],['iron','产粮 +15%'],['waterwheel','产粮 +20%']]).join('；')||'掌握轮作、铁器、水车后，田里的收成会更好。'
  };
}

// 南屿居民的劳作系数：开荒期减半，定居后田地和渔场有加成。
function isleMod(state,job){
  const k=workFactor(state,{village:ISLE,job});
  return k===1?[]:[`南屿${isPioneering(state)?'开荒':''} ${pct(k)}`];
}
function woodMods(state,t){
  const mods=techMult(state,'wood')>1?[`技术 ${pct(techMult(state,'wood'))}`]:[];
  if(t.isle)mods.push(...isleMod(state,'woodcutter'));
  return mods;
}

export function describeForest(state,t){
  const ps=workersOf(state,'woodcutter',p=>t.isle?p.village===ISLE:p.village!==ISLE);
  return {
    kicker:t.isle?'南屿 · 林地':'林地',title:t.kind==='pine'?'松林':'阔叶林',
    rows:[['樵夫',`${ps.length} 位，平均技能 ${Math.round(avg(ps,p=>p.skill))}`],['木材收入',woodMods(state,t).join('，')||'按樵夫手艺计']],
    text:'樵夫把木材卖到岛外，带回新的财富。可以在林地上盖建筑，树会被砍掉。'
  };
}

export function describeWater(state,t){
  const se=seasonIndex(state.day),fishK=[1,1.1,1,0.6][se];
  const ps=workersOf(state,'fisher',p=>t.isle?p.village===ISLE:p.village!==ISLE);
  const mods=[`${SEASONS[se]}季 ×${fishK}`];
  if(state.drought>0)mods.push('干旱 ×0.8');
  if(techMult(state,'fish')>1)mods.push(`技术 ${pct(techMult(state,'fish'))}`);
  if(t.isle)mods.push(...isleMod(state,'fisher'));
  return {
    kicker:t.isle?'南屿 · 海岸':'溪流',title:t.isle?'海滩与渔场':'溪水',
    rows:[['渔民',`${ps.length} 位，平均技能 ${Math.round(avg(ps,p=>p.skill))}`],['渔获系数',mods.join('，')]],
    text:t.isle?'南屿四周的海里鱼群密集。':'渔民在这里打鱼，冬天收获最少。'
  };
}

export function describeMine(state){
  if(!state.mine)return {kicker:'山脚',title:'裸露的岩层',text:'石缝里闪着一点金属的光泽。用“发现矿脉”可以在这里开矿。'};
  const ps=workersOf(state,'miner',p=>canMine(state,p));
  return {
    kicker:'山脚',title:'矿洞',
    rows:[['矿工',`${ps.length} 位，平均技能 ${Math.round(avg(ps,p=>p.skill))}`],['状态',state.mineClosed>0?`停工整修，还剩 ${state.mineClosed} 日`:'正在开采'],['技术',techMult(state,'mine')>1?`铁制农具 ${pct(techMult(state,'mine'))}`:'—']],
    text:'矿石是溪谷最值钱的出口货，但矿洞偶尔会出险情。'
  };
}

export function describeIsle(state){
  const st=frontierStage(state);
  if(st==='pioneer'){
    const f=state.frontier;
    return {
      kicker:'开拓新土地',title:'南屿 · 开荒中',
      rows:[['进度',`${state.day-f.start}/${FRONTIER.pioneerDays} 日`],['劳力',`${islandAdults(state).length} 位（至少 ${FRONTIER.minAdults}）`],['平均幸福',`${Math.round(islandMorale(state))}（期满时至少 ${FRONTIER.minMorale}）`]],
      actions:[{act:'frontier',label:'查看远征详情'}]
    };
  }
  return {
    kicker:'开拓新土地',title:'南屿 · 无人小岛',
    text:st==='failed'?'上次远征失败了，开拓者都回到了故乡。':'土地肥沃、鱼群密集，等待有人来开拓。',
    actions:[{act:'frontier',label:'查看远征条件'}]
  };
}

export function describeTerrain(state,t){
  if(t.type==='mountain')return {kicker:'山岭',title:'大山',text:'陡峭的石山，不能盖房子。冬天山顶会积雪。'};
  if(t.trees&&t.trees.length)return {kicker:t.isle?'南屿':'空地',title:t.trees[0].kind==='pine'?'一棵松树':'一棵大树',text:'树下是乘凉的好地方。在这里盖建筑会把树砍掉。'};
  return {kicker:t.isle?'南屿':'空地',title:'草地',text:'空着的草地。离村子不远的话，可以用“建造”在这里盖粮仓、水井、集市或茶馆。'};
}

// 根据点到的地块（以及上面的建筑、房屋）决定显示什么。
export function describeTile(state,t,{houses,built}={}){
  if(!t)return null;
  if(t.isle&&!isSettled(state)&&frontierStage(state)!=='pioneer')return describeIsle(state);
  if(built)return describeBuilding(state,built);
  if(t.slot&&houses&&houses.has(t))return describeHouse(state,t);
  if(t.type==='plaza')return describeVillage(state,villageOf(t));
  if(t.mine)return describeMine(state);
  if(t.type==='field')return describeField(state,t);
  if(t.type==='forest')return describeForest(state,t);
  if(t.type==='water'||t.coast)return describeWater(state,t);
  return describeTerrain(state,t);
}
