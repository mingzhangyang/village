import { MAP, VKEYS } from '../world/map.js';
import { JOBS } from './constants.js';
import { YEAR, seasonIndex, ageY } from './clock.js';
import { random, rand, pick, clamp, has } from './random.js';
import { getState } from './state.js';
import { TECHS, SHIP_INTERVAL, hasTech, techBonus, techMult, advanceResearch } from './tech.js';
import { MIGRATION_RULES, wealthStats, happinessBreakdown, cohesionBreakdown, migrationBreakdown } from './explainability.js';
import { isWorker, need, log, chron, notify, living, makePerson, setRel, changeRel, remove, assignTarget, foodDays, chooseJob, friendCount } from './population.js';

let hooks = {};

export function configureEconomy(dependencies = {}) {
  hooks = dependencies;
}

const buildingCount = (village, building) => hooks.buildingCount?.(village, building) ?? 0;
const totalBuildingCount = building => hooks.totalBuildingCount?.(building) ?? 0;
const foodCapacity = () => hooks.foodCapacity?.() ?? 450;

export function pushHist(){
  const S = getState();
  const P=S.people,H=S.hist,n=P.length||1;
  const add=(k,v)=>{H[k].push(v);if(H[k].length>90)H[k].shift();};
  add('pop',P.length);add('food',S.food);
  add('wealth',P.reduce((t,p)=>t+Math.max(0,p.wealth),0)+S.treasury);
  add('happy',P.reduce((t,p)=>t+p.happiness,0)/n);add('coh',S.cohesion);
}

export function tick(){
  const S = getState();
  const P=S.people;if(!P.length)return;
  S.day++;
  if(S.ch&&!S.ch.result){const C=hooks.challengeFor?.(S.ch.id);if(C&&C.tick)C.tick();}
  const se=seasonIndex(S.day),pol=S.policy;
  if(S.day%YEAR===0)chron(`第${S.day/YEAR+1}年开始了。溪谷有 ${P.length} 人，粮仓存粮 ${Math.round(S.food)} 担。`,'info');
  if(S.drought>0&&--S.drought===0)chron('雨水终于回到溪谷，旱情结束了。','event');
  if(S.plague>0&&--S.plague===0)chron('疫病渐渐平息。','event');
  if(S.festival>0)S.festival--;
  if(S.caravan>0&&--S.caravan===0)chron('商队收拾行装，离开了溪湾。','info');
  if(S.mineClosed>0&&--S.mineClosed===0)chron('矿洞整修完毕，矿工们重新下井。','info');
  if(S.day%20===0&&S.favor<5)S.favor++;
  if(hasTech(S,'searoute')&&S.day%SHIP_INTERVAL===0){S.food+=30;S.caravan=Math.max(S.caravan,6);chron('远洋商船靠了岸，卸下三十担粮食，溪湾的集市热闹起来。','event');}

  for(const p of P){
    p.age++;
    if(p.job==='child'&&p.age>=14*YEAR){p.job=chooseJob(p);p.skill=Math.max(p.skill,15);log(p,`长大成人，成为一名${JOBS[p.job].n}`);notify(p,`长大成人，成为一名${JOBS[p.job].n}`);}
    else if(isWorker(p)&&p.age>=62*YEAR){p.job='elder';log(p,'放下了劳作，成了村里的长者');}
  }

  // 劳作
  const farmK=[1.0,1.3,1.6,0.25][se]*(S.drought>0?0.3:1)*(S.canal?1.35:1)*techMult(S,'farm');
  const fishK=[1.0,1.1,1.0,0.6][se]*(S.drought>0?0.8:1)*techMult(S,'fish');
  const skillK=techMult(S,'skill');
  const inc=new Map(),prod=new Map();let food=0;
  for(const p of P){
    if(!isWorker(p)){if(p.job==='child')p.skill=clamp(p.skill+0.05*(S.school?3:1)*skillK,0,100);continue;}
    const k=(0.6+p.skill/125)*(0.4+0.6*p.health/100)*(p.fed<0.8?0.75:1)*(has(p,'勤劳')?1.15:1);
    let x=0;
    switch(p.job){
      case 'farmer':{const f=0.46*farmK*k;food+=f;prod.set(p,f);break;}
      case 'fisher':{const f=0.34*fishK*k;food+=f;prod.set(p,f);break;}
      case 'woodcutter':x=0.95*k*techMult(S,'wood');break;
      case 'miner':x=S.mineClosed>0?0:2.3*k*techMult(S,'mine');break;
      case 'craftsman':x=0.35*k*techMult(S,'craft');break;
      case 'merchant':x=0.3*k*techMult(S,'merchant')*(S.caravan>0?2.5:1)*(1+0.3*Math.min(2,buildingCount(p.village,'market')));break;
    }
    inc.set(p,x);
    p.skill=clamp(p.skill+0.12*(has(p,'好学')?1.6:1)*skillK*(1-p.skill/100),0,100);
  }
  S.food+=food;

  // 分粮与买粮
  let totalNeed=0;for(const p of P)totalNeed+=need(p);
  const price=clamp(3*Math.pow(20/Math.max(S.food/totalNeed,0.5),0.35),0.8,9);
  const share=new Map();let avail=S.food;
  if(avail>=totalNeed){for(const p of P)share.set(p,need(p));}
  else if(pol==='equal'){const r=avail/totalNeed;for(const p of P)share.set(p,need(p)*r);}
  else{
    let first,second;
    if(pol==='need'){first=P.filter(p=>p.job==='child'||p.job==='elder'||p.health<50);second=P.filter(p=>!first.includes(p));}
    else if(pol==='work'){const sc=p=>(inc.get(p)||0)+(prod.get(p)||0)*3;first=P.filter(isWorker).sort((a,b)=>sc(b)-sc(a));second=P.filter(p=>!isWorker(p));}
    else{first=[...P].sort((a,b)=>b.wealth-a.wealth);second=[];}
    let a=avail;
    for(const p of first){const s=Math.min(need(p),a);share.set(p,s);a-=s;}
    if(second.length){const n2=second.reduce((t,p)=>t+need(p),0);const r=n2>0?Math.min(1,a/n2):0;for(const p of second)share.set(p,need(p)*r);}
  }
  let foodPool=0,trades=0;
  for(const p of P){
    let s=Math.min(share.get(p)||0,avail);
    if(s<=0){p.fed=0;continue;}
    const cost=s*price*(has(p,'节俭')?0.9:1);
    let payer=p;
    if(p.job==='child'){const ps=p.parents.map(living).filter(Boolean).sort((a,b)=>b.wealth-a.wealth);if(ps.length)payer=ps[0];}
    if(payer.wealth>=cost){payer.wealth-=cost;foodPool+=cost;trades++;}
    else{
      const pay=Math.max(0,payer.wealth);payer.wealth-=pay;
      if(pol==='market'){s=s*pay/cost;foodPool+=pay;if(pay>0)trades++;}
      else{const sub=Math.min(S.treasury,cost-pay);S.treasury-=sub;foodPool+=pay+sub;trades++;}
    }
    avail-=s;p.fed=s/need(p);
  }
  S.food=Math.max(0,avail);
  const fcap=foodCapacity();S.rot=S.food>fcap?(S.food-fcap)*0.02*techMult(S,'rot'):0;S.food-=S.rot;
  const merch=P.filter(p=>p.job==='merchant'),crafts=P.filter(p=>p.job==='craftsman');
  const mcut=merch.length?foodPool*0.08:0;
  for(const m of merch)inc.set(m,(inc.get(m)||0)+mcut/merch.length);
  const rest=foodPool-mcut;
  if(food>0){for(const [p,f] of prod)inc.set(p,(inc.get(p)||0)+rest*f/food);trades+=prod.size;}else S.treasury+=rest;

  // 日常消费
  let goods=0;
  for(const p of P){if(p.job==='child')continue;const w=Math.max(0,p.wealth);const sp=Math.min(w,0.15+w*0.012);p.wealth-=sp;goods+=sp;if(sp>0.02)trades++;}
  const cw=crafts.reduce((t,p)=>t+0.5+p.skill/100,0);
  for(const p of crafts)inc.set(p,(inc.get(p)||0)+goods*0.45*(0.5+p.skill/100)/cw);
  for(const p of merch)inc.set(p,(inc.get(p)||0)+goods*0.15/merch.length);

  // 收税与公库
  for(const [p,x] of inc){const t=x*S.tax;S.treasury+=t;p.wealth+=x-t;p.lastIncome=x;}
  const pw=S.treasury*0.03;S.treasury-=pw;S.publicPerCap=pw/P.length;
  if(S.day%10===0&&S.treasury>10){
    if(pol==='equal'){const amt=S.treasury*0.3;S.treasury-=amt;for(const p of P)p.wealth+=amt/P.length;}
    else if(pol==='work'){const ws=P.filter(isWorker);const tot=ws.reduce((t,p)=>t+p.lastIncome,0);if(tot>0){const amt=S.treasury*0.3;S.treasury-=amt;for(const p of ws)p.wealth+=amt*p.lastIncome/tot;}}
    else if(pol==='need'){const poor=[...P].sort((a,b)=>a.wealth-b.wealth).slice(0,Math.max(1,Math.ceil(P.length/4)));const amt=S.treasury*0.25;S.treasury-=amt;for(const p of poor)p.wealth+=amt/poor.length;}
  }
  S.trades=trades;S.foodProd=food;S.foodCons=totalNeed;S.price=price;

  // 健康
  for(const p of P){
    if(p.fed<0.7){p.hungerDays++;p.health-=(1-p.fed)*5*(has(p,'体弱')?1.3:1);if(p.hungerDays===3){log(p,'粮食不够，开始挨饿');notify(p,'开始挨饿了，也许需要你帮一把');}}
    else{
      if(p.hungerDays>=3)log(p,'终于又吃上了饱饭');p.hungerDays=0;
      const cap=p.age>60*YEAR?100-(ageY(p)-60)*2.5:100;
      p.health=Math.min(Math.max(cap,0),p.health+(has(p,'体弱')?0.5:1.3)+(buildingCount(p.village,'well')?0.6:0)+techBonus(S,'heal'));
    }
    if(S.plague>0&&p.plagueTag!==S.plagueId&&random()<0.035*(buildingCount(p.village,'well')?0.5:1)*techMult(S,'plague')){
      p.plagueTag=S.plagueId;
      p.health-=rand(15,38)*(has(p,'体弱')?1.5:1)*((p.job==='child'||p.job==='elder')?1.3:1);
      log(p,'染上了疫病');notify(p,'染上了疫病');
    }
    if(p.health<30&&!p.lowWarn){p.lowWarn=1;notify(p,`身体很差，健康只剩 ${Math.max(0,Math.round(p.health))}`);}
    else if(p.health>60)p.lowWarn=0;
  }

  // 幸福
  const {average:avgW,gini:gn}=wealthStats(P);S.gini=gn;
  for(const p of P){
    const why=happinessBreakdown({
      state:S,
      person:p,
      averageWealth:avgW,
      gini:gn,
      seasonIndex:se,
      friendCount:friendCount(p),
      marketCount:buildingCount(p.village,'market'),
      teahouseCount:buildingCount(p.village,'teahouse')
    });
    p.happiness=clamp(p.happiness+(why.rawTarget-p.happiness)*0.07+rand(-0.8,0.8),0,100);
    if(p.happiness<MIGRATION_RULES.sadHappinessThreshold)p.sadDays++;else p.sadDays=Math.max(0,p.sadDays-1);
    if(p.sadDays===MIGRATION_RULES.warningSadDays&&p.job!=='child')notify(p,'愁苦了很久，再这样下去可能会离开溪谷');
  }

  // 来往
  const byV={};for(const v of VKEYS)byV[v]=[];for(const p of P)byV[p.village].push(p);
  for(const p of P){
    let k=(has(p,'好客')?1.6:has(p,'内向')?0.5:1)*(S.festival>0?2:1)*(buildingCount(p.village,'teahouse')?1.4:1),times=0;
    while(k>0){if(random()<Math.min(1,k)*0.6)times++;k-=1;}
    for(let t=0;t<times;t++){
      const q=pick(random()<0.75?byV[p.village]:P);if(!q||q===p)continue;
      let d=rand(-1.5,5);
      if(p.happiness<35||q.happiness<35)d-=3;
      if(has(p,'急躁'))d+=rand(-4,1);
      if(has(p,'好客'))d+=1;
      if(S.festival>0)d+=3;
      if(pol==='market'&&Math.abs(p.wealth-q.wealth)>60)d-=1.5;
      if(S.drought>0&&(pol==='need'||pol==='equal'))d+=1;
      d+=(S.cohesion-50)/40;
      changeRel(p,q,d);
    }
  }
  if(S.day%10===0)for(const p of P)for(const k in p.rel){p.rel[k]*=0.97;if(Math.abs(p.rel[k])<2)delete p.rel[k];}

  // 伴侣
  for(const p of P){
    if(p.partner||p.job==='child'||p.age<18*YEAR||p.age>50*YEAR||random()>0.04)continue;
    for(const k in p.rel){
      if(p.rel[k]<70)continue;const q=living(+k);
      if(!q||q.partner||q.gender===p.gender||q.age<18*YEAR||q.age>50*YEAR)continue;
      if(p.parents.includes(q.id)||q.parents.includes(p.id)||p.parents.some(x=>q.parents.includes(x)))continue;
      p.partner=q.id;q.partner=p.id;
      if(p.village!==q.village){const mv=p.happiness<q.happiness?p:q,st=mv===p?q:p;mv.village=st.village;mv.home=st.home;log(mv,`搬到了${MAP.V[st.village].n}`);}
      else q.home=p.home;
      log(p,`与${q.name}结为伴侣`);log(q,`与${p.name}结为伴侣`);notify(p,`与${q.name}结为伴侣了`);notify(q,`与${p.name}结为伴侣了`);
      chron(`${p.name} 与 ${q.name} 结为伴侣。`,'bond');break;
    }
  }

  // 新生
  const fd=S.food/totalNeed;
  for(const m of [...P]){
    if(m.gender!=='女'||!m.partner||m.age<18*YEAR||m.age>42*YEAR||S.day-m.lastBirth<60)continue;
    const f=living(m.partner);if(!f)continue;
    if(fd<15||(m.happiness+f.happiness)/2<50)continue;
    if(random()>0.012*(P.length<60+techBonus(S,'birthCap')?1:0.3))continue;
    m.lastBirth=S.day;
    const c=makePerson({village:m.village,age:0,home:m.home,parents:[f.id,m.id],skill:rand(5,15),happiness:70});
    m.children.push(c.id);f.children.push(c.id);setRel(c,m,80);setRel(c,f,80);
    log(c,`出生在${MAP.V[c.village].n}，父母是${f.name}与${m.name}`);
    log(m,`迎来了孩子${c.name}`);log(f,`迎来了孩子${c.name}`);notify(m,`迎来了孩子${c.name}`);notify(f,`迎来了孩子${c.name}`);
    S.births++;chron(`${f.name} 与 ${m.name} 的孩子 ${c.name} 出生了。`,'birth');
  }

  // 离世与离开
  for(const p of [...P]){
    let cause=null;
    if(p.health<=0)cause=p.hungerDays>2?'饥饿':'疫病';
    else if(p.age>58*YEAR&&random()<0.0006*(ageY(p)-57))cause='寿终';
    if(cause){remove(p,'dead',cause);continue;}
    const migration=migrationBreakdown(p);
    if(migration.automaticEligible&&random()<migration.dailyChance)remove(p,'left');
  }
  if(!P.length){chron('最后一个人也离开了。溪谷重归寂静。','death');S.paused=true;return;}

  // 改行
  const wk=P.filter(isWorker),avgInc=wk.length?wk.reduce((t,p)=>t+p.lastIncome,0)/wk.length:0;
  const fd2=foodDays();
  for(const p of wk){
    if(random()>(fd2<15&&p.job!=='farmer'&&p.job!=='fisher'?0.03:0.004))continue;
    let nj=null;
    if(fd2<15&&p.job!=='farmer'&&p.job!=='fisher'&&random()<0.6)nj=p.village==='bay'?'fisher':'farmer';
    else if(S.mine&&p.job!=='miner'&&p.wealth<avgW*0.7&&random()<0.5)nj='miner';
    else if(p.lastIncome<avgInc*0.45)nj=chooseJob(p);
    if(nj&&nj!==p.job){p.job=nj;p.skill*=0.5;log(p,`改行做了${JOBS[nj].n}`);}
  }

  // 凝聚力
  const avgF=P.reduce((t,p)=>t+friendCount(p),0)/P.length;
  const sadFrac=P.filter(p=>p.happiness<35).length/P.length;
  const cohesionWhy=cohesionBreakdown({
    state:S,
    averageFriends:avgF,
    sadFraction:sadFrac,
    gini:gn,
    teahouseCount:totalBuildingCount('teahouse')
  });
  S.cohesion=clamp(S.cohesion+(cohesionWhy.target-S.cohesion)*0.04,0,100);

  const done=advanceResearch(S,P.filter(isWorker).length);
  if(done)chron(`溪谷掌握了${TECHS[done].n}：${TECHS[done].h}。`,'event');

  pushHist();
  for(const p of P)if(random()<0.4)assignTarget(p);
  hooks.computeHouses?.();
  hooks.maybeDilemma?.();
  if(S.ch&&!S.ch.result)hooks.checkChallenge?.();
}
