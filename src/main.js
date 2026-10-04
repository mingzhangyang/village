import { createHejingStorage } from './storage/index.js';
import { MAP, N, VKEYS, ISLE, ALL_VKEYS } from './world/map.js';
import { YEAR, SEASON, SEASONS, ageY, seasonIndex, dateLabel } from './simulation/clock.js';
import { JOBS, POLICIES } from './simulation/constants.js';
import { random, rand, randi, pick, clamp, has } from './simulation/random.js';
import { pickUi } from './ui/random.js';
import { describeTile, describeVillage } from './ui/inspect.js';
import { moveKeyboardTile } from './ui/map-keyboard.js';
import { bindContext, hx, mix, shade, rgba, poly, rrect, hash, drawSea, buildTerrain, drawWaterFx, drawTree, drawHouse, drawMountain, drawMine, drawFountain, drawBuilding, drawPerson, drawSparkle, drawGlows, drawWeather, drawVignette } from './ui/scene.js';
import { newState, normalizeState, setState, configureState } from './simulation/state.js';
import { configureEconomy, pushHist, tick } from './simulation/economy.js';
import { MIGRATION_RULES, wealthStats, happinessBreakdown, cohesionBreakdown, migrationBreakdown } from './simulation/explainability.js';
import { createChallenges } from './simulation/challenges.js';
import { BUILDS, buildingStats, statOf, totalBonus, granaryCapacity, investedCost, levelOf, levelName, upgradeBlock, upgradeBuilding } from './simulation/buildings.js';
import { FRONTIER, canMine, canDepart, frontierStage, isSettled, isPioneering, isleVisible, activeVillages, islanders, islandAdults, islandMorale, expeditionChecks, expeditionReady, isVolunteer, pickSettlers, launchExpedition, returnHome, retryLeft, hardshipFor } from './simulation/frontier.js';
import { TECHS, TECH_KEYS, hasTech, techCount, techBonus, era, researchRate, researchBlock, researchStall, techNeeds, startResearch, cancelResearch } from './simulation/tech.js';
import { ta, isWorker, log, chron, friendCount, living, byId, foodDays, freeSlot, homeTile, makePerson, setRel, bond, seedPopulation, changeRel, remove, assignTarget } from './simulation/population.js';

const $=id=>document.getElementById(id);
const Storage=createHejingStorage(window.localStorage);
const WINS='hejing-wins-v1',LEGACY_WINS='hejing-wins';
let S;
const seasonIdx=()=>seasonIndex(S.day);
const CHALLENGES=createChallenges({getState:()=>S,YEAR,SEASON,clamp,rand,chron});
function saveNow(){
  if(!S)return;
  try{
    const challenge=S.ch&&CHALLENGES[S.ch.id];
    Storage.saveActive(S,{challengeName:challenge?challenge.n:'挑战'});
  }catch(err){console.warn('Save failed',err);}
}

/* ---------------- 改变的种子 ---------------- */
const ICONS={
  drought:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  mine:'<svg viewBox="0 0 24 24"><path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9.5 4L12 20M14.5 4L12 20"/></svg>',
  immigrants:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 7h5M18.5 4.5v5"/></svg>',
  festival:'<svg viewBox="0 0 24 24"><path d="M12 21V5"/><path d="M12 9c-2.5 0-4-1.5-4.5-4 2.5 0 4 1.5 4.5 4zM12 9c2.5 0 4-1.5 4.5-4-2.5 0-4 1.5-4.5 4zM12 14c-2.5 0-4-1.5-4.5-4 2.5 0 4 1.5 4.5 4zM12 14c2.5 0 4-1.5 4.5-4-2.5 0-4 1.5-4.5 4z"/></svg>',
  plague:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 3.5v3.5M12 17v3.5M3.5 12H7M17 12h3.5M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>',
  caravan:'<svg viewBox="0 0 24 24"><path d="M3 16V8h12v8M15 11h3.5l2.5 3v2h-6"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>',
  canal:'<svg viewBox="0 0 24 24"><path d="M3 8c3-2 5 2 9 0s6-2 9 0M3 13c3-2 5 2 9 0s6-2 9 0M3 18c3-2 5 2 9 0s6-2 9 0"/></svg>'
};
function cdLeft(k){return Math.max(0,(S.cd[k]||0)-S.day);}
const cdState=k=>cdLeft(k)?`${cdLeft(k)}日后可再用`:'';
const SEEDS=[
  {k:'drought',n:'降下干旱',d:'三十日少雨，庄稼减产七成',
    st:()=>S.drought>0?`进行中 ${S.drought}日`:'',dis:()=>S.drought>0,on:()=>S.drought>0,
    go(){S.drought=30;chron('旱灾降临溪谷，田里的禾苗开始发黄。','event');}},
  {k:'mine',n:'发现矿脉',d:'山脚露出矿石，带来新的财富',
    st:()=>S.mine?'已发现':'',dis:()=>S.mine,on:()=>false,
    go(){
      S.mine=true;chron('有人在山脚下发现了一条矿脉。','event');
      const ws=S.people.filter(p=>isWorker(p)&&canMine(S,p)).sort((a,b)=>a.wealth-b.wealth);let n=0;
      for(const p of ws){if(n>=Math.max(2,Math.ceil(ws.length*0.25)))break;if(n<2||random()<0.35){p.job='miner';p.skill*=0.5;log(p,'听说发现了矿脉，扛起镐头当了矿工');n++;}}
    }},
  {k:'immigrants',n:'迎来移民',d:'五到七位陌生人前来定居',cd:20,
    st:()=>S.ch&&S.ch.id==='grow'&&!S.ch.result?'本挑战不可用':cdState('immigrants'),dis:()=>cdLeft('immigrants')>0||(S.ch&&S.ch.id==='grow'&&!S.ch.result),on:()=>false,
    go(){
      const n=randi(5,7),v=pick(activeVillages(S)),ps=[];
      for(let k=0;k<n;k++){
        const p=makePerson({village:v,age:randi(18,40)*YEAR+randi(0,YEAR-1),wealth:rand(2,8),happiness:58,skill:rand(15,55)});
        const e=pick(MAP.edge);p.x=e.i;p.y=e.j;assignTarget(p);const h=homeTile(p);p.tx=h.i;p.ty=h.j;
        log(p,`从远方迁来，在${MAP.V[v].n}落脚`);ps.push(p);
      }
      for(let k=0;k+1<ps.length;k+=2)setRel(ps[k],ps[k+1],rand(20,45));
      chron(`${n} 位移民来到${MAP.V[v].n}，带着行囊和陌生的口音。`,'event');computeHouses();
    }},
  {k:'festival',more:true,n:'举办丰收节',d:'公库出资，人们欢聚几日',cd:30,
    st:()=>S.festival>0?'正在欢庆':cdState('festival'),dis:()=>cdLeft('festival')>0,on:()=>S.festival>0,
    go(){const c=Math.min(S.treasury,40);S.treasury-=c;S.festival=6;S.people.forEach(p=>p.happiness=Math.min(100,p.happiness+6));chron(`溪谷办起了丰收节，公库出资 ${Math.round(c)} 金，人们彻夜欢歌。`,'event');}},
  {k:'plague',more:true,n:'疫病流行',d:'十五日内，人人都可能染病',cd:30,
    st:()=>S.plague>0?`进行中 ${S.plague}日`:cdState('plague'),dis:()=>S.plague>0||cdLeft('plague')>0,on:()=>S.plague>0,
    go(){S.plague=15;S.plagueId++;chron('一场疫病在溪谷蔓延开来。','event');}},
  {k:'caravan',more:true,n:'商队到访',d:'带来六十担粮食，商人生意兴隆',cd:25,
    st:()=>S.caravan>0?`停留中 ${S.caravan}日`:cdState('caravan'),dis:()=>cdLeft('caravan')>0,on:()=>S.caravan>0,
    go(){S.food+=60;const c=Math.min(S.treasury,45);S.treasury-=c;S.caravan=10;chron(`一支商队来到溪湾，公库花 ${Math.round(c)} 金换来六十担粮食。`,'event');}},
  {k:'canal',more:true,n:'修建水渠',d:'花公库 150 金，农田从此增产',
    st:()=>S.canal?'已建成':S.treasury<150?`公库 ${Math.round(S.treasury)}/150`:'',dis:()=>S.canal||S.treasury<150,on:()=>false,
    go(){S.treasury-=150;S.canal=true;chron('人们引溪水入田，水渠修成了，往后的收成会更好。','event');}}
];
function trigger(s){if(s.dis())return;s.go();if(s.cd)S.cd[s.k]=S.day+s.cd;dirty=true;updateUI();}
function buildSeeds(){
  const box=$('seeds');box.innerHTML='';
  for(const s of SEEDS){
    const b=document.createElement('button');b.className='seed'+(s.more?' more-item':'');
    b.innerHTML=`<span class="ic">${ICONS[s.k]}</span><span class="tx"><b>${s.n}</b><span>${s.d}</span></span><em class="st"></em>`;
    b.addEventListener('click',()=>trigger(s));s.el=b;s.stEl=b.querySelector('.st');box.appendChild(b);
  }
  $('moreSeeds').addEventListener('click',()=>{const on=box.classList.toggle('showmore');$('moreSeeds').textContent=on?'收起 ▴':'更多自然事件 ▾';});
}


/* ---------------- 两难抉择 ---------------- */
const nm=id=>{const p=byId(id);return p?p.name:'某人';};
const VN=v=>MAP.V[v].n;
const adults=()=>S.people.filter(p=>p.job!=='child');
function moodVillage(v,a){for(const p of S.people)if(p.village===v)p.happiness=clamp(p.happiness+a,0,100);}
const DILEMMAS={
  trade:{
    when:()=>S.treasury>=30?{}:null,
    title:()=>'商队的交易',
    text:()=>`一支路过的商队愿意用 50 担粮食，换走公库里的 60 金。粮仓现在还够吃 ${Math.floor(foodDays())} 天，公库有 ${Math.round(S.treasury)} 金。`,
    opts:()=>[
      {t:'答应交易',h:'粮食 +50，公库 −60',ok:()=>S.treasury>=60,go(){S.treasury-=60;S.food+=50;return '商队卸下粮袋，粮仓里多了 50 担粮食。';}},
      {t:'讨价还价',h:'也许能少花点，也许会谈崩',go(){
        if(random()<0.55){const c=Math.min(35,S.treasury);S.treasury-=c;S.food+=50;return `商队首领笑着让了步，只收了 ${Math.round(c)} 金。`;}
        for(const p of S.people)if(p.job==='merchant')p.happiness=clamp(p.happiness-5,0,100);
        return '商队觉得受了冒犯，转身离开了。溪湾的商人们有些失落。';}},
      {t:'婉拒',h:'一切照旧',go:()=>'商队收起货物，继续上路了。'}
    ]
  },
  taxcut:{
    when(){if(S.tax<0.08)return null;const v=pick(activeVillages(S));const ps=S.people.filter(q=>q.village===v&&isWorker(q));return ps.length?{v,p:pick(ps).id}:null;},
    title:()=>'减税请愿',
    text:d=>`${nm(d.p)}带着${VN(d.v)}的十几个人来请愿：日子过得紧巴，希望把生产税率从 ${Math.round(S.tax*100)}% 降到 ${Math.max(0,Math.round(S.tax*100)-5)}%。`,
    opts:d=>[
      {t:'答应减税',h:`税率 −5%，${VN(d.v)}的人会很满意，公库收入变少`,go(){S.tax=Math.max(0,S.tax-0.05);moodVillage(d.v,8);syncControls();const p=living(d.p);if(p)log(p,'带头请愿减税，如愿以偿');return `税率降到了 ${Math.round(S.tax*100)}%，${VN(d.v)}的人奔走相告。`;}},
      {t:'各让一步',h:'税率 −2%',go(){S.tax=Math.max(0,S.tax-0.02);moodVillage(d.v,3);syncControls();return `税率降到了 ${Math.round(S.tax*100)}%。请愿的人不算满意，但也接受了。`;}},
      {t:'拒绝',h:'公库不受影响，但请愿的人会失望',go(){moodVillage(d.v,-8);S.cohesion=clamp(S.cohesion-4,0,100);const p=living(d.p);if(p)log(p,'请愿被拒，心里很不是滋味');return `请愿的人垂着头散去，${VN(d.v)}里多了些怨言。`;}}
    ]
  },
  levy:{
    when(){if(foodDays()>25&&S.drought===0)return null;const r=adults().sort((a,b)=>b.wealth-a.wealth).slice(0,3);return r.length===3&&r[2].wealth>=20?{ids:r.map(p=>p.id)}:null;},
    title:()=>'要不要向富户征钱',
    text:d=>`粮食越来越紧，只够吃 ${Math.floor(foodDays())} 天了。有人提议：向最富的三户，${d.ids.map(nm).join('、')}，征收一半家财，拿去岛外买粮。`,
    opts:d=>[
      {t:'征收',h:'能买回不少粮食，但三户会心生怨恨',go(){
        let sum=0;for(const id of d.ids){const p=living(id);if(!p)continue;const x=Math.max(0,p.wealth)*0.5;p.wealth-=x;sum+=x;p.happiness=clamp(p.happiness-20,0,100);log(p,`一半家财（${Math.round(x)} 金）被征去买粮`);}
        const f=Math.round(sum/2.5);S.food+=f;return `征得 ${Math.round(sum)} 金，从岛外买回 ${f} 担粮食。`;}},
      {t:'登门劝捐',h:'看他们愿不愿意，捐多少算多少',go(){
        let sum=0;const names=[];
        for(const id of d.ids){const p=living(id);if(!p)continue;if(random()<(p.happiness>55||has(p,'好客')?0.75:0.3)){const x=Math.max(0,p.wealth)*0.25;p.wealth-=x;sum+=x;p.happiness=clamp(p.happiness+6,0,100);names.push(p.name);log(p,`主动捐出 ${Math.round(x)} 金买粮`);}}
        if(!sum)return '三户都推说手头紧，一分也没捐。';
        const f=Math.round(sum/2.5);S.food+=f;S.cohesion=clamp(S.cohesion+3,0,100);return `${names.join('、')}捐了 ${Math.round(sum)} 金，买回 ${f} 担粮食。`;}},
      {t:'不干预',h:'各家自己想办法',go:()=>'富户们照旧过日子，穷人只能勒紧裤腰带。'}
    ]
  },
  refugees:{
    when:()=>({n:randi(3,4),v:pick(activeVillages(S))}),
    title:()=>'岸边的逃荒者',
    text:d=>`一家 ${d.n} 口人坐着破船漂到${VN(d.v)}附近的岸边，衣衫褴褛，请求留下来。粮仓还够吃 ${Math.floor(foodDays())} 天。`,
    opts:d=>[
      {t:'收留他们',h:`人口 +${d.n}，吃饭的嘴也多了`,go(){
        const Y=(a,b)=>randi(a,b)*YEAR+randi(0,YEAR-1),e=pick(MAP.edge);
        const fa=makePerson({village:d.v,age:Y(26,40),gender:'男',wealth:1,happiness:60});
        const mo=makePerson({village:d.v,age:Y(24,38),gender:'女',wealth:1,happiness:60,home:fa.home});
        bond(fa,mo);const fam=[fa,mo];
        for(let k=2;k<d.n;k++){const c=makePerson({village:d.v,age:Y(1,11),home:fa.home,parents:[fa.id,mo.id],happiness:60});fa.children.push(c.id);mo.children.push(c.id);setRel(c,fa,80);setRel(c,mo,80);fam.push(c);}
        for(const p of fam){p.x=e.i;p.y=e.j;const h=homeTile(p);p.tx=h.i;p.ty=h.j;log(p,`一家人逃荒到溪谷，在${VN(d.v)}被收留`);}
        computeHouses();return `${fa.name}一家在${VN(d.v)}搭起了新家。`;}},
      {t:'送些粮食，请他们离开',h:'粮食 −20',go(){S.food=Math.max(0,S.food-20);return '他们带着粮食，划船去了别处。';}},
      {t:'拒绝',h:'有人会觉得溪谷变冷漠了',go(){S.cohesion=clamp(S.cohesion-5,0,100);for(const p of S.people)if(has(p,'好客'))p.happiness=clamp(p.happiness-6,0,100);return '破船又漂走了。好几个人在岸边站了很久。';}}
    ]
  },
  dispute:{
    when(){
      for(const p of S.people){if(p.job==='child')continue;for(const k in p.rel){if(p.rel[k]<=-15){const q=living(+k);if(q&&q.job!=='child')return {a:p.id,b:q.id};}}}
      const v=pick(activeVillages(S)),ps=S.people.filter(q=>q.village===v&&isWorker(q));if(ps.length<2)return null;
      const a=pick(ps);let b=pick(ps),n=0;while(b===a&&n++<10)b=pick(ps);return b===a?null:{a:a.id,b:b.id};},
    title:()=>'田界之争',
    text:d=>`${nm(d.a)}和${nm(d.b)}为一块地的归属吵得不可开交，两人都来找你评理。`,
    opts:d=>{
      const judge=(w,l)=>()=>{const W=living(w),L=living(l);if(!W||!L)return '还没等你开口，两人已经不争了。';
        W.happiness=clamp(W.happiness+10,0,100);W.wealth+=8;L.happiness=clamp(L.happiness-12,0,100);L.wealth-=Math.min(8,Math.max(0,L.wealth));
        setRel(W,L,Math.min(W.rel[L.id]||0,-40));log(W,`和${L.name}争地，赢了`);log(L,`和${W.name}争地输了，心里不服`);
        return `地判给了${W.name}。${L.name}很不服气，两人从此见面不说话。`;};
      return [
        {t:`判给${nm(d.a)}`,h:`${nm(d.a)}满意，${nm(d.b)}不服`,go:judge(d.a,d.b)},
        {t:`判给${nm(d.b)}`,h:`${nm(d.b)}满意，${nm(d.a)}不服`,go:judge(d.b,d.a)},
        {t:'调解：公库出 10 金，地两人分',h:'也许能化敌为友，也许谁都不买账',ok:()=>S.treasury>=10,go(){
          S.treasury-=10;const A=living(d.a),B=living(d.b);if(!A||!B)return '这事已经不了了之。';
          if(random()<0.65){setRel(A,B,Math.max(A.rel[B.id]||0,50));log(A,`和${B.name}握手言和，成了朋友`);log(B,`和${A.name}握手言和，成了朋友`);return `${A.name}和${B.name}握手言和，还约好改天一起喝酒。`;}
          changeRel(A,B,-10);return '两人都不买账，各自气呼呼地走了。';}}
      ];}
  },
  school:{
    when(){if(S.school||S.treasury<80)return null;const kids=S.people.filter(p=>p.job==='child').length;if(kids<3)return null;
      const ps=S.people.filter(p=>p.job==='elder'||p.job==='craftsman'),p=ps.length?pick(ps):pick(adults());return p?{p:p.id,kids}:null;},
    title:()=>'办一间学堂',
    text:d=>`${nm(d.p)}提议用公库 80 金办一间学堂，让孩子们从小学手艺。溪谷现在有 ${d.kids} 个孩子。`,
    opts:d=>[
      {t:'办学堂',h:'公库 −80，孩子们长大后手艺更好',ok:()=>S.treasury>=80,go(){
        S.treasury-=80;S.school=true;const p=living(d.p);if(p){log(p,'牵头办起了学堂');p.happiness=clamp(p.happiness+10,0,100);}
        for(const c of S.people)if(c.job==='child')log(c,'进了学堂读书');return '学堂开张了，孩子们的读书声从早响到晚。';}},
      {t:'暂时不办',h:'把钱留着应急',go:()=>`${nm(d.p)}叹了口气，说那就再等等。`}
    ]
  },
  cave:{
    when:()=>S.mine&&!S.mineClosed&&S.people.some(p=>p.job==='miner'&&canMine(S,p))?{}:null,
    title:()=>'矿洞的裂缝',
    text:()=>'矿工们发现主矿洞顶上出现了一道裂缝。停工整修十日会少挣不少钱，继续开采则可能出事。',
    opts:()=>[
      {t:'停工整修十日',h:'矿工十日没有收入',go(){S.mineClosed=10;return '矿工们放下镐头，开始加固矿洞。';}},
      {t:'继续开采',h:'不耽误挣钱，但有风险',go(){
        const ms=S.people.filter(p=>p.job==='miner'&&canMine(S,p));
        if(ms.length&&random()<0.45){const m=pick(ms);m.health-=rand(50,85);log(m,'在矿洞塌方中受了重伤');for(const q of ms)q.happiness=clamp(q.happiness-10,0,100);return `矿洞塌了一角，${m.name}被压在石头下，受了重伤。`;}
        return '裂缝没有再扩大，大家松了一口气。';}}
    ]
  },
  sick:{
    when(){const ps=S.people.filter(q=>q.health<55).sort((a,b)=>a.health-b.health);return ps.length?{p:ps[0].id}:null;},
    title:()=>'请不请郎中',
    text:d=>{const p=byId(d.p);return `${p.name}病得很重，健康只剩 ${Math.max(0,Math.round(p.health))}。从岛外请郎中要花公库 30 金。`;},
    opts:d=>[
      {t:'请郎中',h:'公库 −30，病情会好转许多',ok:()=>S.treasury>=30,go(){
        S.treasury-=30;const p=living(d.p);if(!p)return '郎中赶到时，已经晚了。';
        p.health=Math.min(100,p.health+45);log(p,'公库请来郎中，病好了大半');return `郎中开了几副药，${p.name}的气色一天天好起来。`;}},
      {t:'让家人照顾',h:'省下这笔钱，听天由命',go(){const p=living(d.p);if(p)log(p,'只能靠家人照料养病');return `家人守在床边。能不能熬过去，就看${nm(d.p)}自己了。`;}}
    ]
  },
  wander:{
    when(){const ps=S.people.filter(q=>migrationBreakdown(q).wanderEligible&&canDepart(S,q));return ps.length?{p:pick(ps).id}:null;},
    title:()=>'想出去闯闯的年轻人',
    text:d=>{const p=byId(d.p);return `${p.name}（${ageY(p)}岁，${JOBS[p.job].n}）说岛上的日子一眼望得到头，想去外面闯一闯。`;},
    opts:d=>{const p=byId(d.p),t=p?ta(p):'他';return [
      {t:'挽留：公库给 20 金安家',h:`${t}会留下，心里也更踏实`,ok:()=>S.treasury>=20,go(){
        S.treasury-=20;const q=living(d.p);if(!q)return '';q.wealth+=20;q.happiness=clamp(q.happiness+15,0,100);log(q,'被大家挽留，决定留在溪谷');return `${q.name}收下了安家钱，决定留下来。`;}},
      {t:'祝一路顺风',h:`${t}会离开溪谷`,go(){const q=living(d.p);if(!q)return '';if(!remove(q,'left','wander'))return '开拓期间南屿居民不能通过普通出走离岛。';return `${q.name}背上行囊，坐船离开了溪谷。`;}},
      {t:`让${t}再想想`,h:'也许过阵子就好了，也许不会',go(){const q=living(d.p);if(q){q.happiness=clamp(q.happiness-3,0,100);log(q,'想出去闯荡，被劝再想想');}return `${t}点点头，没再说什么。`;}}
    ];}
  },
  isle:{
    when:()=>isPioneering(S)&&islanders(S).length?{}:null,
    title:()=>'南屿来信',
    text:()=>`南屿的开拓者捎信回来：海风大、粮食紧，有人病倒了。岛上现在有 ${islandAdults(S).length} 位劳力（少于 ${FRONTIER.minAdults} 位远征就会失败），平均幸福 ${Math.round(islandMorale(S))}（开荒期满时要达到 ${FRONTIER.minMorale}）。`,
    opts:()=>[
      {t:'派船送补给',h:'公库 −40、粮食 −40；开拓者健康 +20、幸福 +12',ok:()=>S.treasury>=40&&S.food>=40,go(){
        S.treasury-=40;S.food-=40;
        for(const p of islanders(S)){p.health=Math.min(100,p.health+20);p.happiness=clamp(p.happiness+12,0,100);log(p,'收到了故乡送来的补给');}
        return '补给船靠了岸，开拓者们捧着家乡的米和信，好几个人红了眼眶。';}},
      {t:'让他们咬牙坚持',h:'开拓者幸福 −6，但患难之中彼此更亲近',go(){
        const ps=islanders(S);
        for(const p of ps){p.happiness=clamp(p.happiness-6,0,100);for(const q of ps)if(q.id>p.id)changeRel(p,q,12);}
        return '开拓者们挤在一个窝棚里熬过了难关，彼此成了过命的交情。';}},
      {t:'接回病弱的人',h:'开荒期唯一能离岛的机会：健康低于 50 的人回到故乡，岛上人手会变少',go(){
        const back=islanders(S).filter(p=>p.health<50);
        if(!back.length)return '岛上没有病得太重的人，大家决定一起撑下去。';
        for(const p of back){returnHome(S,p);log(p,'病倒后被接回了故乡');assignTarget(p);}
        computeHouses();
        return `${back.map(p=>p.name).join('、')}被接回了故乡，南屿还剩 ${islandAdults(S).length} 位劳力。`;}}
    ]
  }
};
function maybeDilemma(){
  if(!S.dilemmasOn||S.pending||S.day<S.nextDilemma||!S.people.length)return;
  const c=[];
  for(const k in DILEMMAS){if(k===S.lastDil)continue;const d=DILEMMAS[k].when();if(d)c.push([k,d,k==='isle'?4:k==='levy'?3:k==='sick'?2:1]);}
  if(!c.length){S.nextDilemma=S.day+5;return;}
  let x=random()*c.reduce((t,e)=>t+e[2],0);
  for(const [k,d,w] of c){if((x-=w)<0){S.pending={k,d,res:null};S.lastDil=k;S.nextDilemma=S.day+randi(28,45);dirty=true;return;}}
}
let dlgKey='',dlgReturnFocus=null;
function renderDilemma(){
  const box=$('dlg');
  if(!S.pending){
    const wasOpen=!box.hidden;box.hidden=true;dlgKey='';
    if(wasOpen&&dlgReturnFocus&&typeof dlgReturnFocus.focus==='function')dlgReturnFocus.focus({preventScroll:true});
    dlgReturnFocus=null;return;
  }
  const {k,d,res}=S.pending,D=DILEMMAS[k];
  if(!D){S.pending=null;box.hidden=true;return;}
  const key=k+'|'+(res==null?0:1)+'|'+JSON.stringify(d);
  if(key===dlgKey)return;dlgKey=key;
  $('dlgT').textContent=D.title(d);
  if(res==null){
    $('dlgK').textContent='溪谷需要你做决定';
    $('dlgX').textContent=D.text(d);
    $('dlgO').innerHTML=D.opts(d).map((o,i)=>{const ok=!o.ok||o.ok();return `<button class="opt" data-i="${i}"${ok?'':' disabled'}><b>${o.t}</b><span>${ok?o.h:'公库的钱不够'}</span></button>`;}).join('');
  }else{
    $('dlgK').textContent='你的决定';
    $('dlgX').textContent=res;
    $('dlgO').innerHTML='<button class="btn primary" id="dlgDone">继续</button>';
  }
  if(box.hidden)dlgReturnFocus=document.activeElement;
  box.hidden=false;
  box.querySelector('.dlg').focus({preventScroll:true});
}
$('dlgO').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!S.pending)return;
  if(b.id==='dlgDone'){S.pending=null;dirty=true;updateUI();return;}
  const o=DILEMMAS[S.pending.k].opts(S.pending.d)[+b.dataset.i];if(!o||(o.ok&&!o.ok()))return;
  const r=o.go()||'就这么定了。';S.pending.res=r;
  chron(`你的决定：${o.t}。${r}`,'choice');dirty=true;updateUI();
});

/* ---------------- 伸出援手 ---------------- */
const HELP={
  gift:{n:'送了一笔钱',go(p){p.wealth+=30;p.happiness=clamp(p.happiness+6,0,100);return '收到一笔意外之财（30 金）';}},
  teach:{n:'传授了手艺',go(p){p.skill=Math.min(100,p.skill+25);return p.job==='child'?'得到先生单独指点，学得飞快':'得到高人指点，手艺大进';}},
  heal:{n:'请郎中调养',go(p){p.health=Math.min(100,p.health+40);p.hungerDays=0;return `有人请来郎中为${ta(p)}调养身体`;}},
  visit:{n:'登门陪伴',go(p){p.happiness=clamp(p.happiness+20,0,100);p.sadDays=0;return `有人登门，陪${ta(p)}说了一下午的话`;}}
};
function spendFavor(p,text,short){
  S.favor--;p.touched=(p.touched||0)+1;log(p,'✦ '+text);if(!S.watch.includes(p.id))S.watch.push(p.id);
  chron(`你帮了${p.name}一把：${short}。`,'choice');dirty=true;updateFate();updateChron();
}
const canPair=(p,q)=>!p.partner&&!q.partner&&p.gender!==q.gender&&[p,q].every(x=>x.age>=18*YEAR&&x.age<=50*YEAR);
function introCands(p){
  const fam=new Set([p.partner,...p.parents,...p.children]),kid=p.job==='child';
  return S.people.filter(q=>q!==p&&!fam.has(q.id)&&(q.job==='child')===kid&&(p.rel[q.id]||0)<40)
    .map(q=>({q,single:canPair(p,q)}))
    .sort((a,b)=>(b.single-a.single)||((b.q.village===p.village)-(a.q.village===p.village))||a.q.id-b.q.id).slice(0,12);
}
$('help').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;const p=living(S.sel);if(!p||S.favor<1)return;
  const k=b.dataset.h;
  if(k==='intro'){
    const box=$('intro');if(!box.hidden){box.hidden=true;return;}
    const c=introCands(p);
    $('introSel').innerHTML=c.length?c.map(({q,single})=>`<option value="${q.id}">${q.name}，${ageY(q)}岁，${JOBS[q.job].n}，${VN(q.village)}${single?'（单身）':''}</option>`).join(''):'<option value="">没有可以介绍的人</option>';
    $('introGo').disabled=!c.length;box.dataset.for=p.id;box.hidden=false;return;
  }
  spendFavor(p,HELP[k].go(p),HELP[k].n);
});
$('introGo').addEventListener('click',()=>{
  const p=living(S.sel),q=living(+$('introSel').value);if(!p||!q||S.favor<1)return;
  setRel(p,q,Math.max(p.rel[q.id]||0,canPair(p,q)?62:48));
  log(q,`经人引荐，认识了${p.name}`);$('intro').hidden=true;
  spendFavor(p,`经人引荐，认识了${q.name}`,`介绍${ta(p)}认识了${q.name}`);
});


/* ---------------- 建造与搬家 ---------------- */
let bcount={};
function recountB(){bcount={};for(const b of S.built){bcount[b.v]=bcount[b.v]||{};bcount[b.v][b.b]=(bcount[b.v][b.b]||0)+1;}}
function BC(v,b){return (bcount[v]&&bcount[v][b])||0;}
function BT(b){let n=0;for(const v of ALL_VKEYS)n+=BC(v,b);return n;}
function foodCap(){return 450+granaryCapacity(S.built)+techBonus(S,'cap');}
const builtAt=t=>t?S.built.find(b=>b.i===t.i&&b.j===t.j)||null:null;
function applyBuilt(){
  for(const t of MAP.all){t.type=t.orig;t.trees=t.otrees.slice();t.bld=null;t.bv=null;t.blv=0;}
  for(const b of S.built){const t=MAP.at(b.i,b.j);if(!t)continue;t.bld=b.b;t.bv=b.v;t.blv=levelOf(b);t.trees=[];if(t.type==='forest')t.type='grass';}
  const open=isPioneering(S)||isSettled(S);
  for(const t of MAP.isle.tiles)if(t.orig==='field'?!isSettled(S):t.orig==='plaza'&&!open)t.type='grass';
  MAP.forest=MAP.all.filter(t=>t.type==='forest'&&!t.isle);
  MAP.isle.forest=MAP.isle.tiles.filter(t=>t.type==='forest');
  recountB();colorKey='';terrainGen++;
}
function nearestVillage(fi,fj){let best=null,bd=1e9;for(const k of activeVillages(S)){const c=MAP.V[k].center,d=Math.hypot(c.i-fi,c.j-fj);if(d<bd){bd=d;best=k;}}return {k:best,d:bd};}
function canPlace(t,b){
  if(!t||(t.isle&&!isleVisible(S)))return '这里是海。';
  if(t.isle&&!isSettled(S))return '南屿还没有开拓。';
  if(t.bld)return '这里已经有建筑了。';
  if(t.slot)return '这是村民盖房子的地方。';
  if(t.mine)return '这里是矿脉。';
  if(t.coast)return '这里是南屿的海岸渔场，不能盖房子。';
  if(t.type!=='grass'&&t.type!=='forest')return '这里不能盖房子。';
  const nv=nearestVillage(t.i,t.j);
  if(nv.d>4.5)return '离村子太远了，没人会来用。';
  if(BC(nv.k,b)>=2)return `${VN(nv.k)}已经有两座${BUILDS[b].n}了。`;
  if(S.treasury<BUILDS[b].cost)return `公库只有 ${Math.floor(S.treasury)} 金，盖${BUILDS[b].n}要 ${BUILDS[b].cost} 金。`;
  return '';
}
function place(t,b){
  const err=canPlace(t,b);if(err){toast(err,true);return;}
  const v=nearestVillage(t.i,t.j).k,B=BUILDS[b];
  S.treasury-=B.cost;S.built.push({i:t.i,j:t.j,b,v});applyBuilt();
  chron(`${VN(v)}建起了一座${B.n}，花去公库 ${B.cost} 金。`,'choice');
  toast(`${VN(v)}建起了一座${B.n}`);dirty=true;updateUI();
}
function raze(t){
  if(!t||!t.bld){toast('这里没有你建的建筑。',true);return;}
  const k=S.built.findIndex(b=>b.i===t.i&&b.j===t.j);if(k<0)return;
  const b=S.built[k],name=levelName(b),back=Math.round(investedCost(b)*0.4);
  S.built.splice(k,1);S.treasury+=back;applyBuilt();
  chron(`${VN(b.v)}的${name}被拆掉了，拆下的木料换回 ${back} 金。`,'choice');
  toast(`拆掉了${VN(b.v)}的${name}，退回 ${back} 金`);dirty=true;updateUI();
}
function upgrade(t){
  const b=builtAt(t);if(!b){toast('这里没有你建的建筑。',true);return;}
  const err=upgradeBlock(S,b);if(err){toast(err,true);return;}
  const from=levelName(b),U=upgradeBuilding(S,b);applyBuilt();
  chron(`${VN(b.v)}的${from}扩建成了${U.n}，花去公库 ${U.cost} 金。`,'choice');
  toast(`${VN(b.v)}的${from}升级为${U.n}：${U.d}`);dirty=true;updateUI();
}
function relocate(p,v){
  if(!p)return;
  if(p.village===v){toast(`${p.name}本来就住在${VN(v)}。`,true);return;}
  if(isPioneering(S)&&(p.village===ISLE||v===ISLE)){toast('开荒期间不能随意往返南屿。',true);return;}
  const from=p.village,fam=[p];
  const pt=p.partner&&living(p.partner);if(pt&&pt.village===from)fam.push(pt);
  for(const id of p.children){const c=living(id);if(c&&c.job==='child'&&c.village===from&&!fam.includes(c))fam.push(c);}
  if(p.job==='child'){for(const id of p.parents){const q=living(id);if(q&&q.village===from&&!fam.includes(q))fam.push(q);}}
  const home=freeSlot(v);
  for(const q of fam){q.village=v;q.home=home;q.happiness=clamp(q.happiness-4,0,100);log(q,`从${VN(from)}搬到了${VN(v)}`);assignTarget(q);const h=homeTile(q);q.tx=h.i+rand(-0.3,0.3);q.ty=h.j+rand(-0.3,0.3);}
  computeHouses();
  const who=fam.length>1?`${p.name}一家 ${fam.length} 口`:p.name;
  chron(`${who}从${VN(from)}搬到了${VN(v)}。`,'choice');toast(`${who}搬去了${VN(v)}`);dirty=true;updateUI();
}
let toastT=0;
function toast(msg,bad){const el=$('toast');el.textContent=msg;el.classList.toggle('bad',!!bad);el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2400);}


/* ---------------- 挑战 ---------------- */
function wins(){
  try{
    let raw=localStorage.getItem(WINS);
    if(!raw){
      raw=localStorage.getItem(LEGACY_WINS);
      if(raw)localStorage.setItem(WINS,raw);
    }
    return JSON.parse(raw||'{}');
  }catch{return {};}
}
function checkChallenge(){
  const c=S.ch,C=CHALLENGES[c.id];if(!C)return;
  const r=C.check(c,S.day-c.start);c.txt=r.txt||'';c.pct=r.pct||0;
  if(r.st==='run')return;
  c.result={win:r.st==='win',why:r.why};S.paused=true;
  chron(r.st==='win'?`挑战成功：${C.n}。${r.why}`:`挑战失败：${C.n}。${r.why}`,'event');
  if(r.st==='win'){try{const w=wins();w[c.id]=1;localStorage.setItem(WINS,JSON.stringify(w));}catch{/* Win-history storage is optional. */}}
  dirty=true;
}
function startChallenge(id){
  const C=CHALLENGES[id];if(!C)return;
  if(!window.confirm(`开始“${C.n}”吗？当前自由世界会先保存，挑战使用独立存档，结束后可以原样返回。`))return;
  saveNow();
  installState(null,true);
  S.ch={id,start:S.day,hd0:S.hungerDeaths,left0:S.left,hold:0,result:null,txt:'',pct:0};
  if(C.setup)C.setup();
  chron(`挑战开始：${C.n}。${C.d}`,'event');
  Storage.startChallenge(S,C.n);
  checkChallenge();closeModal();syncControls();dirty=true;updateUI();saveNow();
}
function returnToFreeWorld(){
  saveNow();
  const old=S.ch&&CHALLENGES[S.ch.id];
  const session=Storage.returnToOrigin();
  if(session&&session.state){
    installState(session.state,false);closeModal();toast(old?`已结束“${old.n}”，回到原来的自由世界`:'已回到自由世界');return true;
  }
  installState(null,true);
  Storage.createSlot('溪谷 1',S,true);saveNow();closeModal();toast('已创建新的自由世界');return true;
}
function keepChallengeWorld(){
  const C=S.ch&&CHALLENGES[S.ch.id];if(!C)return;
  const name=window.prompt('给这个自由世界起个名字：',`${C.n}之后`);
  if(name===null)return;
  try{
    const session=Storage.promoteChallenge(S,name);
    installState(session.state,false);closeModal();toast('挑战世界已另存为自由存档');
  }catch(err){
    window.alert(err.code==='SLOTS_FULL'?'自由存档槽已满，请先在“存档”里删除一个旧世界。':err.message);
  }
}
let mdlMode='',mdlReturnFocus=null;
function openModal(mode){
  if($('mdl').hidden)mdlReturnFocus=document.activeElement;
  mdlMode=mode;const w=wins();
  if(mode==='tech'){renderTechModal();}
  else if(mode==='frontier'){renderFrontierModal();}
  else if(mode==='list'){
    $('mdlK').textContent='选一个剧本';$('mdlK').style.color='';$('mdlT').textContent='挑战';
    $('mdlX').textContent='每个挑战都有一个目标和期限。挑战使用独立存档，不会覆盖你的自由世界。';
    $('mdlO').innerHTML=Object.entries(CHALLENGES).map(([k,C])=>`<button class="opt${w[k]?' done':''}" data-ch="${k}"><b>${C.n}</b><span>${C.d}</span></button>`).join('')
      +`<button class="opt free" data-act="${S.ch?'return':'close'}"><b>${S.ch?'结束挑战，回到原来的世界':'继续自由模式'}</b><span>${S.ch?'原来的自由世界仍保留在开始挑战前的状态。':'关闭这个窗口，继续当前世界。'}</span></button>`;
  }else{
    const c=S.ch,C=CHALLENGES[c.id];
    $('mdlK').textContent=c.result.win?'挑战成功':'挑战失败';$('mdlK').style.color=c.result.win?'var(--accent)':'';$('mdlT').textContent=C.n;$('mdlX').textContent=c.result.why;
    $('mdlO').innerHTML=`<button class="opt" data-ch="${c.id}"><b>再试一次</b><span>从头开始这个挑战。</span></button><button class="opt" data-act="list"><b>换个挑战</b></button><button class="opt" data-act="return"><b>回到原来的世界</b><span>挑战前的自由世界没有被覆盖。</span></button><button class="opt free" data-act="keep"><b>把这个挑战世界另存为自由存档</b><span>保留这里发生的一切，然后继续玩。</span></button>`;
  }
  $('mdl').hidden=false;document.querySelector('#mdl .dlg').focus({preventScroll:true});
}
function mdlHidden(){return $('mdl').hidden&&$('saveMdl').hidden;}
function closeModal(){
  $('mdl').hidden=true;mdlMode='';
  const el=mdlReturnFocus;mdlReturnFocus=null;
  if(el&&typeof el.focus==='function')el.focus({preventScroll:true});
}
$('chBtn').addEventListener('click',()=>openModal('list'));
$('techBtn').addEventListener('click',()=>openModal('tech'));
$('frontierBtn').addEventListener('click',()=>openModal('frontier'));
$('gQuit').addEventListener('click',()=>{if(S.ch&&window.confirm('结束当前挑战并回到挑战前的自由世界吗？'))returnToFreeWorld();});
$('mdl').addEventListener('click',e=>{
  if(e.target.id==='mdl'&&(mdlMode==='list'||mdlMode==='tech'||mdlMode==='frontier')){closeModal();return;}
  if(e.target.closest('[data-act="launch"]')){launchIsle();return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.tech){pickTech(b.dataset.tech);return;}
  if(b.dataset.act==='cancelTech'){dropTech();return;}
  if(b.dataset.act==='list'){openModal('list');return;}
  if(b.dataset.act==='return'){returnToFreeWorld();return;}
  if(b.dataset.act==='keep'){keepChallengeWorld();return;}
  if(b.dataset.act==='close'){closeModal();return;}
  if(b.dataset.ch!==undefined&&b.dataset.ch){startChallenge(b.dataset.ch);return;}
});
function trapDialogFocus(e,box){
  if(e.key!=='Tab'||box.hidden)return;
  const dlg=box.querySelector('.dlg');
  const focusable=[...dlg.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter(el=>!el.hidden&&el.getClientRects().length);
  if(!focusable.length){e.preventDefault();dlg.focus();return;}
  const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
  if(e.shiftKey&&(active===first||active===dlg)){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&active===last){e.preventDefault();first.focus();}
}
document.addEventListener('keydown',e=>{
  const active=!$('dlg').hidden?$('dlg'):!$('saveMdl').hidden?$('saveMdl'):!$('mdl').hidden?$('mdl'):null;
  if(active)trapDialogFocus(e,active);
  if(e.key==='Escape'&&!$('saveMdl').hidden){closeSaveManager();return;}
  if(e.key==='Escape'&&(mdlMode==='list'||mdlMode==='tech'||mdlMode==='frontier')&&!$('mdl').hidden)closeModal();
});
function renderGoal(){
  const c=S.ch;$('goal').hidden=!c;if(!c)return;
  const C=CHALLENGES[c.id];setT('gName',`挑战：${C.n}`);
  setT('gTxt',c.result?(c.result.win?'挑战成功！':'挑战失败。')+c.result.why:c.txt);
  $('gBar').style.width=Math.round(clamp(c.result&&c.result.win?1:c.pct,0,1)*100)+'%';
  setT('gQuit',c.result?'回到原世界':'放弃挑战');
  if(c.result&&!c.shown){c.shown=1;openModal('result');}
}

/* ---------------- 发展图谱 ---------------- */
function researchEta(){
  const r=S.research;if(!r)return 0;
  const rate=researchRate(S);
  return rate>0?Math.ceil((TECHS[r.id].days-r.prog)/rate):0;
}
// 一项技术的全部门槛：前置技术、现实条件、费用。
function techRows(id){
  const T=TECHS[id];
  return [
    ...T.req.map(r=>({ok:hasTech(S,r),label:`掌握${TECHS[r].n}`,have:hasTech(S,r)?'已掌握':'未掌握'})),
    ...techNeeds(S,id),
    {ok:S.treasury>=T.cost,label:`公库 ${T.cost} 金`,have:`${Math.floor(S.treasury)} 金`}
  ];
}
function renderTechModal(){
  const n=techCount(S),r=S.research;
  $('mdlK').textContent='发展图谱';$('mdlK').style.color='';
  $('mdlT').textContent=`${era(S)}时期 · 已掌握 ${n}/${TECH_KEYS.length} 项`;
  $('mdlX').textContent='光有钱不够：每项技术都要有够格的行家，有的还要设施、学堂或民心。立项后这些条件也要一直保持，行家离开、改行或闹饥荒，研究就会停下。够格的行家越多进度越快，学堂和印书也能加速，旱灾和疫病会拖慢。同一时间只能研究一项，中途放弃退回一半费用。';
  let html='';
  if(r){
    const T=TECHS[r.id],why=researchStall(S);
    html+=`<button class="opt researching" data-act="cancelTech"><b>正在研究：${T.n}（${Math.floor(r.prog)}/${T.days} 日）</b><span>${why?`已停滞：${why}。`:`每日推进 ${researchRate(S).toFixed(2)}，预计还要 ${researchEta()} 日。`}点这里放弃，退回 ${Math.round(T.cost*0.5)} 金。</span>${checkList(techNeeds(S,r.id))}</button>`;
  }
  for(const tier of [1,2,3]){
    for(const id of TECH_KEYS){
      const T=TECHS[id];if(T.tier!==tier)continue;
      const done=hasTech(S,id),busy=r&&r.id===id;if(busy)continue;
      const block=done?'':researchBlock(S,id),ready=!done&&!block;
      const meta=done?`第 ${Math.floor(S.tech[id]/YEAR)+1} 年掌握`:ready?`约 ${T.days} 日的工作量 · 点击立项`:r&&!researchBlock({...S,research:null},id)?'条件已齐，等当前项目完成后可立项':'';
      html+=`<button class="opt tech${done?' done':''}" data-tech="${id}"${ready?'':' disabled'}><b>${'Ⅰ Ⅱ Ⅲ'.split(' ')[tier-1]} · ${T.n}</b><span>${T.d}效果：${T.h}。</span>${done?'':checkList(techRows(id))}${meta?`<small class="tech-meta${ready?' ok':''}">${meta}</small>`:''}</button>`;
    }
  }
  html+='<p class="mnote">想培养行家：年轻人成年后多半做所在村子的本行（禾谷出农夫，松林出樵夫，溪湾出渔民和商人），可以先把孩子搬过去；也可以迎来移民，或用“传授手艺”直接提升一个人的技能。改行会让技能减半。</p>';
  html+='<button class="opt free" data-act="close"><b>关闭</b></button>';
  $('mdlO').innerHTML=html;
}
function pickTech(id){
  if(!startResearch(S,id)){toast(researchBlock(S,id)||'现在不能研究',true);return;}
  const T=TECHS[id];
  chron(`溪谷拨出公库 ${T.cost} 金，开始研究${T.n}。`,'choice');
  toast(`开始研究${T.n}`);dirty=true;renderTechModal();updateUI();
}
function dropTech(){
  const r=S.research;if(!r)return;const T=TECHS[r.id];
  if(!window.confirm(`放弃研究${T.n}吗？已经投入的日子会作废，公库退回 ${Math.round(T.cost*0.5)} 金。`))return;
  const back=cancelResearch(S);
  chron(`溪谷放弃了${T.n}的研究，退回 ${back} 金。`,'choice');
  dirty=true;renderTechModal();updateUI();
}
function updateTech(){
  const r=S.research,n=techCount(S);
  setT('techEra',`${era(S)}时期 · ${n}/${TECH_KEYS.length}`);
  if(r){
    const T=TECHS[r.id];
    const why=researchStall(S);
    setT('techDesc',why?`${T.n}的研究停滞了：${why}。`:`正在研究${T.n}，${Math.floor(r.prog)}/${T.days} 日，预计还要 ${researchEta()} 日。`);
    $('techDesc').classList.toggle('warn',!!why);
    $('techBarWrap').hidden=false;$('techBar').style.width=Math.round(clamp(r.prog/T.days,0,1)*100)+'%';
  }else{
    const ready=TECH_KEYS.filter(id=>!researchBlock(S,id)).length;
    setT('techDesc',n>=TECH_KEYS.length?'所有技术都已掌握，溪谷进入了昌盛时期。':ready?`有 ${ready} 项技术可以立项研究。`:'暂时没有能研究的技术：要攒够公库，也要培养出够格的行家。');
    $('techDesc').classList.remove('warn');
    $('techBarWrap').hidden=true;
  }
}

/* ---------------- 开拓新土地 ---------------- */
const checkList=rows=>`<span class="checks">${rows.map(c=>`<span class="ck ${c.ok?'ok':'no'}"><i>${c.ok?'✓':'✗'}</i><span>${c.label}</span><em>${c.have}</em></span>`).join('')}</span>`;
function renderFrontierModal(){
  const st=frontierStage(S);
  $('mdlK').textContent='开拓新土地';$('mdlK').style.color='';
  let html;
  if(st==='settled'){
    $('mdlT').textContent='南屿已是溪谷的家园';
    $('mdlX').textContent=`第 ${Math.floor(S.frontier.day/YEAR)+1} 年，开拓者在南屿站稳了脚跟。`;
    html=`<p class="mnote">南屿的农夫和渔民产出 +${Math.round(FRONTIER.farmBonus*100)}%；人口超过更高的上限（+${FRONTIER.birthCap}）后出生率才会下降。移民和逃荒者也可能在南屿落脚，你可以在那里盖房、升级建筑，或把人搬过去。</p>`;
  }else if(st==='pioneer'){
    const f=S.frontier,done=S.day-f.start,adults=islandAdults(S).length,mor=islandMorale(S);
    $('mdlT').textContent=`南屿开荒中 · ${done}/${FRONTIER.pioneerDays} 日`;
    $('mdlX').textContent='开拓者干活只有平常一半的收成，还要忍受想家之苦和海上的风暴。撑过开荒期才算成功。';
    html=checkList([
      {ok:adults>=FRONTIER.minAdults,label:`岛上至少 ${FRONTIER.minAdults} 位劳力（任何时候少于这个数就失败）`,have:`${adults} 人`},
      {ok:mor>=FRONTIER.minMorale,label:`期满时开拓者平均幸福至少 ${FRONTIER.minMorale}`,have:`现在 ${Math.round(mor)}`}
    ])+`<p class="mnote">稳住人心的办法：用恩惠登门陪伴开拓者，举办丰收节，在“南屿来信”时派船送补给，或者降低税率让他们多留些钱。</p>`;
  }else{
    const checks=expeditionChecks(S),ready=expeditionReady(S),team=ready?pickSettlers(S):[];
    $('mdlT').textContent=isleVisible(S)?'远征南屿':'传说中的海岛';
    $('mdlX').textContent=isleVisible(S)
      ?'远洋商船的水手说，东南海上有一座无人小岛，土地肥沃、鱼群密集。远征要倾全溪谷之力，开荒六十日。失败的话，投入的钱粮全部白费，还要休整两年才能再试。'
      :'老人们说，晴天时能望见东南海上有一座小岛，但没人有本事渡过去。先掌握远洋航路，才能找到它。';
    if(S.frontier&&S.frontier.tries)$('mdlX').textContent+=` 溪谷已经远征过 ${S.frontier.tries} 次。`;
    html=checkList(checks)+`<button class="opt" data-act="launch"${ready?'':' disabled'}><b>扬帆出发</b><span>${ready?`${team.filter(isVolunteer).length} 位志愿者带着家人共 ${team.length} 人出发：${team.map(p=>p.name).join('、')}`:'所有条件都满足后才能出发。'}</span></button>`;
  }
  html+='<button class="opt free" data-act="close"><b>关闭</b></button>';
  $('mdlO').innerHTML=html;
}
function launchIsle(){
  if(!expeditionReady(S))return;
  if(!window.confirm(`确定远征南屿吗？公库会花掉 ${FRONTIER.treasury} 金，带走 ${FRONTIER.provisions} 担粮食。失败的话，这些都会白费。`))return;
  const team=launchExpedition(S);if(!team)return;
  for(const p of team)assignTarget(p);
  applyBuilt();computeHouses();
  chron(`远征队扬帆出发！${team.length} 人带着 ${FRONTIER.provisions} 担粮食驶向南屿，开始为期 ${FRONTIER.pioneerDays} 日的开荒。`,'event');
  toast('远征队出发了');dirty=true;renderFrontierModal();updateUI();
}
let frontierKey='';
function updateFrontier(){
  const st=frontierStage(S),key=st+'|'+isleVisible(S);
  if(key!==frontierKey){frontierKey=key;applyBuilt();computeHouses();layout();}
  const bar=$('frontierBarWrap');bar.hidden=st!=='pioneer';
  if(st==='settled'){setT('frontierTag','已开拓');setT('frontierDesc','南屿已成为第四个聚落，田地和渔场都更丰饶。');}
  else if(st==='pioneer'){
    const done=S.day-S.frontier.start;
    setT('frontierTag','开荒中');
    setT('frontierDesc',`第 ${done}/${FRONTIER.pioneerDays} 日，岛上 ${islandAdults(S).length} 位劳力，平均幸福 ${Math.round(islandMorale(S))}。`);
    $('frontierBar').style.width=Math.round(clamp(done/FRONTIER.pioneerDays,0,1)*100)+'%';
  }else{
    const met=expeditionChecks(S).filter(c=>c.ok).length,all=expeditionChecks(S).length;
    setT('frontierTag',isleVisible(S)?'待开拓':'未发现');
    setT('frontierDesc',retryLeft(S)?`上次远征失败了，还要休整 ${retryLeft(S)} 日。`:isleVisible(S)?`东南海上的南屿等待开拓：已满足 ${met}/${all} 项条件。`:'传说东南海上有座小岛，掌握远洋航路后才能找到它。');
  }
}

/* ---------------- 关注提醒 ---------------- */
function renderAlert(){
  const a=S.alerts[0];$('alert').hidden=!a;if(!a)return;
  setT('aName',a.name);setT('aTxt',a.text);
  setT('aMore',S.alerts.length>1?`还有 ${S.alerts.length-1} 条提醒`:'');
}
$('aOk').addEventListener('click',()=>{S.alerts.shift();dirty=true;updateUI();});
$('aGo').addEventListener('click',()=>{
  const a=S.alerts.shift();if(!a)return;S.sel=a.id;S.alerts=[];S.paused=true;
  updateUI();document.querySelector('.right').scrollIntoView({behavior:'smooth',block:'nearest'});
});
$('fWatch').addEventListener('click',()=>{
  const i=S.watch.indexOf(S.sel);if(i>=0)S.watch.splice(i,1);else S.watch.push(S.sel);updateFate();
});

/* ---------------- 地图绘制 ---------------- */
const cv=$('map'),ctx=cv.getContext('2d');bindContext(ctx);
const MAP_ARIA_BASE=cv.getAttribute('aria-label')||'溪谷群岛地图';
const view={w:0,h:0,dpr:1,zoom:1,panX:0,panY:0,tw:30,ox:0,oy:0};
let tool='look',buildSel='granary',hoverPt=null,moveSrc=null,dragGhost=null,kbTile=null;
let theme={label:'#fff',ink:'#263022',line:'#dfe2d2',accent:'#4f7136',accentInk:'#fff',dark:false};
let houses=new Set();
function computeHouses(){
  const set=new Set();for(const p of S.people)set.add(homeTile(p));
  for(const k of activeVillages(S)){set.add(MAP.V[k].slots[0]);set.add(MAP.V[k].slots[1]);}
  houses=set;
}
function readTheme(){
  const cs=getComputedStyle(document.documentElement),g=k=>cs.getPropertyValue(k).trim();
  const bg=g('--bg');
  theme={label:g('--label')||'#fff',ink:g('--ink')||'#222',line:g('--line')||'#ddd',accent:g('--accent')||'#4f7136',accentInk:g('--accent-ink')||'#fff',
    dark:/^#[0-9a-f]{6}$/i.test(bg)&&hx(bg).reduce((t,v)=>t+v,0)<3*110};
}
function resize(){
  const r=$('mapwrap').getBoundingClientRect();if(!r.width)return;
  view.w=r.width;view.h=r.height;view.dpr=Math.min(2.5,window.devicePixelRatio||1);
  cv.width=Math.round(r.width*view.dpr);cv.height=Math.round(r.height*view.dpr);layout();
}
function layout(){
  const wide=S&&isleVisible(S);
  const base=Math.min(view.w*0.92/11.6,view.h*0.86/(wide?8.1:6.6));
  view.tw=base*view.zoom;
  view.panX=clamp(view.panX,-view.w*0.6*view.zoom,view.w*0.6*view.zoom);
  view.panY=clamp(view.panY,-view.h*0.6*view.zoom,view.h*0.6*view.zoom);
  view.ox=view.w/2+view.panX;view.oy=view.h/2-(wide?22.5:N-1)*view.tw/4+view.tw*0.35+view.panY;
  cv.style.touchAction=(view.zoom>1.01||tool!=='look')?'none':'pan-y';
}
function iso(i,j){return [view.ox+(i-j)*view.tw/2,view.oy+(i+j)*view.tw/4];}
let colorKey='';const tileCol=new Map();
function tileColors(){
  const se=seasonIdx(),dr=S.drought>0,key=se+'|'+dr;if(key===colorKey)return;colorKey=key;
  const GR=['#a6c46a','#93b65a','#c4b866','#d3d8c4'][se],FI=['#a8b868','#b8c25a','#d9b452','#c9c2a2'][se],WA=se===3?'#9cc4d1':'#78b0c6';
  for(const t of MAP.all){
    let b={grass:GR,forest:shade(GR,-0.1),field:FI,water:WA,mountain:'#a3a68f',plaza:'#e4d8b8'}[t.type];
    b=shade(b,(t.v-0.5)*0.08);
    if(dr&&(t.type==='grass'||t.type==='forest'||t.type==='field'))b=mix(b,'#cbb27a',0.5);
    tileCol.set(t,b);
  }
}
// 静态地形画在带边距的离屏画布上；平移只移动贴图，缩放、季节、旱情或水渠变化时才重画。
const terrain=document.createElement('canvas'),tctx=terrain.getContext('2d');
const tcache={key:'',ox:0,oy:0,px:0,py:0};
const reduceMotion=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
let terrainGen=0;
function paintTerrain(){
  const {w,h,dpr,tw,ox,oy}=view,key=[cv.width,cv.height,tw,colorKey,!!S.canal,theme.dark,terrainGen].join('|');
  if(key===tcache.key&&Math.abs(ox-tcache.ox)<=tcache.px&&Math.abs(oy-tcache.oy)<=tcache.py)return;
  const px=Math.round(w*0.4),py=Math.round(h*0.4),W=Math.round((w+px*2)*dpr),H=Math.round((h+py*2)*dpr);
  Object.assign(tcache,{key,ox,oy,px,py});
  if(terrain.width!==W||terrain.height!==H){terrain.width=W;terrain.height=H;}
  tctx.setTransform(1,0,0,1,0,0);tctx.clearRect(0,0,W,H);tctx.setTransform(dpr,0,0,dpr,px*dpr,py*dpr);
  bindContext(tctx);
  buildTerrain({tw,iso,tileCol,se:seasonIdx(),canal:!!S.canal,dry:S.drought>0,dark:theme.dark,showIsle:isleVisible(S)});
  bindContext(ctx);
}
function personScale(p,s0){return s0*(p.job==='child'?0.72:1);}
function draw(now){
  const {w,h,dpr,tw}=view;if(!w)return;
  const T=reduceMotion.matches?0:now/1000,anim=!reduceMotion.matches,dark=theme.dark;
  tileColors();paintTerrain();bindContext(ctx);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawSea(w,h,{T,dark,ox:view.ox,oy:view.oy});
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(terrain,Math.round((view.ox-tcache.ox-tcache.px)*dpr),Math.round((view.oy-tcache.oy-tcache.py)*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);
  const se=seasonIdx(),hw=tw/2,hh=tw/4,dry=S.drought>0,showIsle=isleVisible(S);
  drawWaterFx({tw,iso,T,dark,showIsle});
  if(tool==='build'||tool==='raze'||tool==='upgrade'){
    const ht=hoverPt?tileAt(hoverPt):null;
    for(const t of MAP.all){
      if(t.isle&&!showIsle)continue;
      const ok=tool==='build'?!canPlace(t,buildSel):tool==='upgrade'?!!t.bld&&!upgradeBlock(S,builtAt(t)):!!t.bld;
      if(!ok&&t!==ht)continue;
      const [x,y]=iso(t.i,t.j);
      const hot=t===ht;
      poly(hot?(ok?'rgba(255,255,255,.7)':'rgba(200,80,50,.45)'):(tool==='raze'?'rgba(200,80,50,.28)':'rgba(255,255,255,.3)'),x,y-hh*0.86,x+hw*0.86,y,x,y+hh*0.86,x-hw*0.86,y);
      if(hot&&ok){ctx.strokeStyle=theme.accent;ctx.lineWidth=2;ctx.stroke();}
    }
  }
  if(kbTile&&document.activeElement===cv){
    const [x,y]=iso(kbTile.i,kbTile.j);
    ctx.beginPath();ctx.moveTo(x,y-hh);ctx.lineTo(x+hw,y);ctx.lineTo(x,y+hh);ctx.lineTo(x-hw,y);ctx.closePath();
    ctx.strokeStyle=theme.accent;ctx.lineWidth=2.5;ctx.stroke();
  }
  const glow=dark?[]:null;
  for(const t of MAP.all){
    if(t.isle&&!showIsle)continue;
    const [x,y]=iso(t.i,t.j);
    if(t.bld)drawBuilding(t,x,y,tw,{T,se,dark,glow});
    if(t.type==='mountain')drawMountain(x,y,t,tw,se);
    if(t.mine&&S.mine)drawMine(x,y,tw);
    if(t.type==='plaza')drawFountain(x,y,tw,T);
    if(t.slot&&houses.has(t)){
      const vk=ALL_VKEYS.find(k=>MAP.V[k].slots.includes(t)),s=tw*0.36;
      const win=drawHouse(x,y,s,shade(MAP.V[vk].roof,(t.v-0.5)*0.25),null,{T,seed:t.v,se,dark});
      if(glow)glow.push([win[0],win[1],s*0.8]);
    }
    for(const tr of t.trees)drawTree(x+(tr.dx-tr.dy)*hw,y+(tr.dx+tr.dy)*hh,tw*0.42*tr.s,tr.kind,{se,dry,T,seed:hash(tr.dx*97,tr.dy*89)});
  }
  // 居民
  const list=[...S.people].sort((a,b)=>(a.x+a.y)-(b.x+b.y));
  const s0=Math.max(5,tw*0.2),hoverP=tool==='look'&&hoverPt&&!drag?hitPerson(hoverPt):null;let selP=null;
  for(const p of list){
    const [x,y]=iso(p.x,p.y),s=personScale(p,s0),moving=anim&&Math.hypot(p.tx-p.x,p.ty-p.y)>0.01;
    if(p.id===S.sel){
      selP=[p,x,y,s];
      const pulse=0.5+0.5*Math.sin(T*3);
      ctx.fillStyle=rgba(theme.accent.startsWith('#')?theme.accent:'#4f7136',0.16+pulse*0.1);ctx.beginPath();ctx.ellipse(x,y,s*0.8,s*0.34,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=theme.accent;ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.lineDashOffset=-T*8;ctx.beginPath();ctx.ellipse(x,y,s*(0.75+pulse*0.08),s*(0.32+pulse*0.04),0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }else if(p===hoverP){
      ctx.strokeStyle=theme.accent;ctx.globalAlpha=0.6;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y,s*0.7,s*0.3,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    }
    drawPerson(p,x,y,s,{T,moving});
    if(p.touched)drawSparkle(x,y-s*1.68,Math.max(2.2,s*0.17),T);
  }
  // 黄昏：深色主题下压暗世界，再点亮窗灯
  if(dark){ctx.fillStyle='rgba(16,24,44,.26)';ctx.fillRect(0,0,w,h);drawGlows(glow);}
  if(anim)drawWeather(w,h,{se,T,dark,dry});
  drawVignette(w,h,dark);
  // 聚落名
  ctx.font=`600 ${tw<28?10.5:12}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;ctx.textBaseline='middle';
  const tags=[];labelHits.length=0;
  for(const k of showIsle?ALL_VKEYS:VKEYS){
    const V=MAP.V[k],[x,y0]=iso(V.center.i,V.center.j),y=y0-tw*1.15;
    const cnt=S.people.filter(p=>p.village===k).length;
    const txt=k!==ISLE||isSettled(S)?`${V.n} ${cnt}人`:isPioneering(S)?`${V.n} 开荒中 ${cnt}人`:`${V.n} · 待开拓`;
    const tw2=ctx.measureText(txt).width,bw=tw2+24,bh=tw<28?19:22;
    const hl=dragGhost&&dragGhost.v===k;tags.push([x-bw/2,y-bh/2,bw,bh+5]);labelHits.push([k,x-bw/2,y-bh/2,bw,bh+5]);
    ctx.save();ctx.shadowColor=dark?'rgba(0,0,0,.45)':'rgba(40,55,30,.22)';ctx.shadowBlur=8;ctx.shadowOffsetY=2;
    ctx.fillStyle=theme.label;rrect(x-bw/2,y-bh/2,bw,bh,bh/2);ctx.fill();
    ctx.beginPath();ctx.moveTo(x-5,y+bh/2-1);ctx.lineTo(x,y+bh/2+5);ctx.lineTo(x+5,y+bh/2-1);ctx.closePath();ctx.fill();ctx.restore();
    ctx.strokeStyle=hl?theme.accent:theme.line;ctx.lineWidth=hl?2.5:1;rrect(x-bw/2,y-bh/2,bw,bh,bh/2);ctx.stroke();
    ctx.fillStyle=V.roof;ctx.beginPath();ctx.arc(x-bw/2+10,y,3.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=theme.ink;ctx.textAlign='left';ctx.fillText(txt,x-bw/2+17,y+0.5);
  }
  if(selP){
    const [p,x,y,s]=selP,txt=p.name,tw2=ctx.measureText(txt).width,bw=tw2+16,bh=tw<28?19:21;
    let ly=y-s*1.75-bh/2-(p.touched?s*0.5:2);
    // 与聚落名重叠时，把名字挪到脚下
    const below=tags.some(([tx,ty,tw3,th])=>x-bw/2<tx+tw3&&x+bw/2>tx&&ly-bh/2<ty+th&&ly+bh/2+4>ty);
    if(below)ly=y+s*0.45+bh/2+4;
    const tip=below?ly-bh/2:ly+bh/2,dir=below?-1:1;
    ctx.save();ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=6;ctx.shadowOffsetY=1.5;
    ctx.fillStyle=theme.accent;rrect(x-bw/2,ly-bh/2,bw,bh,7);ctx.fill();
    ctx.beginPath();ctx.moveTo(x-4,tip-dir);ctx.lineTo(x,tip+dir*4);ctx.lineTo(x+4,tip-dir);ctx.closePath();ctx.fill();ctx.restore();
    ctx.fillStyle=theme.accentInk;ctx.textAlign='center';ctx.fillText(txt,x,ly+0.5);
  }
  if(dragGhost){
    const {p,x,y}=dragGhost;ctx.globalAlpha=0.85;
    drawPerson(p,x,y+s0*0.4,s0*1.15,{T,moving:anim});ctx.globalAlpha=1;
  }
  if(S.plague>0){
    const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.hypot(w,h)*0.6);
    g.addColorStop(0,'rgba(90,70,110,.04)');g.addColorStop(1,'rgba(90,70,110,.22)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  }
}
function movePeople(dt){
  const sp=1.1*Math.sqrt(TPS[S.speed])*dt*(S.paused?0.3:1);
  for(const p of S.people){const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy);if(d<0.01)continue;const m=Math.min(d,sp);p.x+=dx/d*m;p.y+=dy/d*m;}
}

/* ---------------- 界面 ---------------- */
const STATS=[{k:'pop',n:'居民人口',u:'人'},{k:'food',n:'粮食储备',u:'担'},{k:'wealth',n:'流通财富',u:'金'},{k:'happy',n:'居民幸福',u:'/100'},{k:'coh',n:'社会凝聚力',u:'/100'}];
const WHY_LABELS={
  wealth:'财富',food:'温饱',friends:'朋友',partner:'伴侣',health:'健康',tax:'税负',inequality:'贫富差距',
  child:'孩童阶段',festival:'丰收节',drought:'干旱',winter:'冬季',optimist:'乐天性格',public:'公共投入',
  market:'集市',teahouse:'茶馆',sad:'愁苦人口',policy:'分配制度',frontier:'开荒之苦'
};
const signed=v=>`${v>=0?'+':''}${v.toFixed(1)}`;
function whyRows(factors,limit=6){
  return factors.filter(f=>f.key!=='base'&&Math.abs(f.value)>=0.05)
    .sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,limit)
    .map(f=>`<div class="why-row"><span>${WHY_LABELS[f.key]||f.key}</span><b class="${f.value>=0?'pos':'neg'}">${signed(f.value)}</b></div>`).join('');
}
function buildStats(){
  $('stats').innerHTML=STATS.map(s=>`<div class="card stat"><div class="top"><span>${s.n}</span><span id="st-${s.k}-r"></span></div><div class="mid"><div class="val"><span id="st-${s.k}-v"></span><small>${s.u}</small></div><svg viewBox="0 0 72 26" preserveAspectRatio="none" aria-hidden="true"><path id="st-${s.k}-p" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg></div><div class="foot" id="st-${s.k}-f"></div></div>`).join('');
  $('legend').innerHTML=Object.values(JOBS).map(j=>`<span><i style="background:${j.c}"></i>${j.n}</span>`).join('');
}
function spark(a){
  if(a.length<2)return '';let mn=Math.min(...a),mx=Math.max(...a);if(mx-mn<1e-6){mx+=1;mn-=1;}
  return a.map((v,i)=>`${i?'L':'M'}${(i/(a.length-1)*72).toFixed(1)},${(24-(v-mn)/(mx-mn)*22).toFixed(1)}`).join('');
}
const fmt=v=>Math.round(v).toLocaleString('zh-CN');
const _c={};
function setT(id,t){if(_c[id]!==t){_c[id]=t;$(id).textContent=t;}}
function setH(id,h){if(_c[id]!==h){_c[id]=h;$(id).innerHTML=h;}}
function updateStats(){
  const P=S.people,n=P.length||1,H=S.hist;
  const kids=P.filter(p=>p.job==='child').length,elders=P.filter(p=>p.job==='elder').length;
  const happyAvg=P.reduce((t,p)=>t+p.happiness,0)/n,content=P.filter(p=>p.happiness>=60).length,sad=P.filter(p=>p.happiness<35).length,hungry=P.filter(p=>p.fed<0.7).length;
  const wealth=P.reduce((t,p)=>t+Math.max(0,p.wealth),0)+S.treasury;
  const avgF=P.reduce((t,p)=>t+friendCount(p),0)/n,couples=P.filter(p=>p.partner&&p.gender==='女').length;
  const days=foodDays();
  const set=(k,v,r,f)=>{setT(`st-${k}-v`,v);setT(`st-${k}-r`,r);setT(`st-${k}-f`,f);$(`st-${k}-p`).setAttribute('d',spark(H[k]));};
  set('pop',String(P.length),`出生 ${S.births}　离世 ${S.deaths}`,`${kids} 个孩童，${P.length-kids-elders} 个劳力，${elders} 位长者`);
  const cap=foodCap();
  set('food',fmt(S.food),S.rot>0.05?`仓满，每天烂掉 ${S.rot.toFixed(1)}`:`仓容 ${fmt(cap)}`,`够吃 ${days>999?'999+':Math.floor(days)} 天，粮价 ${S.price.toFixed(1)}，日产 ${S.foodProd.toFixed(1)}`);
  set('wealth',fmt(wealth),`贫富差距 ${S.gini.toFixed(2)}`,`今日 ${S.trades} 笔交易，公库 ${fmt(S.treasury)} 金`);
  set('happy',String(Math.round(happyAvg)),`${content} 人满足`,`${sad} 人愁苦，${hungry} 人挨饿`);
  set('coh',String(Math.round(S.cohesion)),`${couples} 对伴侣`,`人均 ${avgF.toFixed(1)} 位朋友`);
  const cohWhy=cohesionBreakdown({
    state:S,
    averageFriends:avgF,
    sadFraction:sad/n,
    gini:S.gini,
    teahouseCount:BT('teahouse'),
    teahouseUpgrade:BT('teahouse')?totalBonus(buildingStats(S.built),'teahouse'):0
  });
  setT('cohWhyValue',String(Math.round(S.cohesion)));
  setT('cohWhyTrend',`驱动目标 ${Math.round(cohWhy.target)} · 每日约 ${signed(cohWhy.expectedChange)}`);
  setH('cohWhy',whyRows(cohWhy.factors));
}
function avatarSVG(p){
  const hair=p.age>=55*YEAR?'#cfcac0':p.hair,long=p.gender==='女'?4.2:2;
  return `<svg viewBox="0 0 10 10" shape-rendering="crispEdges"><rect width="10" height="10" fill="${shade(JOBS[p.job].c,0.75)}"/><rect x="1" y="7.5" width="8" height="2.5" fill="${JOBS[p.job].c}"/><rect x="4.2" y="6.5" width="1.6" height="1" fill="${p.skin}"/><rect x="2.6" y="2.6" width="4.8" height="4.1" fill="${p.skin}"/><rect x="2.2" y="1.6" width="5.6" height="1.5" fill="${hair}"/><rect x="2.2" y="2.6" width="0.9" height="${long}" fill="${hair}"/><rect x="6.9" y="2.6" width="0.9" height="${long}" fill="${hair}"/><rect x="3.7" y="4.1" width="0.8" height="0.8" fill="#2b2520"/><rect x="5.5" y="4.1" width="0.8" height="0.8" fill="#2b2520"/><rect x="4.4" y="5.6" width="1.2" height="0.4" fill="${p.happiness<35?'#6b4a3a':'#b0705a'}"/></svg>`;
}
function updateFate(){
  let p=byId(S.sel);
  if(!p){const q=pickUi(S.people);if(!q)return;S.sel=q.id;p=q;}
  setH('fAvatar',avatarSVG(p));setT('fName',p.name);
  const vn=MAP.V[p.village].n;
  if(p.status==='alive')setT('fMeta',`${ageY(p)}岁，${p.gender}，住在${vn}`);
  else setT('fMeta',p.status==='dead'?`享年 ${ageY(p)} 岁，生前住在${vn}`:`${ageY(p)}岁时离开了${vn}`);
  let chips=`<span class="chip job">${JOBS[p.job].n}</span>`+p.traits.map(t=>`<span class="chip">${t}</span>`).join('');
  if(p.status!=='alive')chips+=`<span class="chip gone">${p.status==='dead'?'已离世':'已远走'}</span>`;
  else if(p.fed<0.7)chips+='<span class="chip gone">正在挨饿</span>';
  setH('fChips',chips);
  setT('fHappy',String(Math.round(p.happiness)));setT('fWealth',String(Math.round(p.wealth)));setT('fHealth',String(Math.max(0,Math.round(p.health))));
  const fr=friendCount(p);
  $('bSkill').style.width=Math.round(p.skill)+'%';setT('vSkill',String(Math.round(p.skill)));
  $('bFed').style.width=Math.round(clamp(p.fed,0,1)*100)+'%';setT('vFed',Math.round(clamp(p.fed,0,1)*100)+'%');
  $('bFr').style.width=Math.min(100,fr/8*100)+'%';setT('vFr',String(fr));
  const alive=p.status==='alive';
  if(alive){
    const wealth=wealthStats(S.people);
    const happyWhy=happinessBreakdown({
      state:S,
      person:p,
      averageWealth:wealth.average,
      gini:wealth.gini,
      seasonIndex:seasonIdx(),
      friendCount:fr,
      marketCount:BC(p.village,'market'),
      teahouseCount:BC(p.village,'teahouse'),
      marketUpgrade:statOf(buildingStats(S.built),p.village,'market').bonus,
      teahouseUpgrade:statOf(buildingStats(S.built),p.village,'teahouse').bonus,
      frontierHardship:hardshipFor(S,p)
    });
    setT('fHappyTrend',`驱动目标 ${Math.round(happyWhy.rawTarget)} · 每日约 ${signed(happyWhy.expectedChange)}`);
    setH('fHappyWhy',whyRows(happyWhy.factors));
  }else{
    setT('fHappyTrend',p.status==='dead'?'生命已结束，幸福不再变化':'已离开溪谷，幸福不再模拟');
    setH('fHappyWhy','<span class="empty">没有当前驱动因素。</span>');
  }
  const moveWhy=migrationBreakdown(p);
  let moveText=`幸福低于 ${MIGRATION_RULES.sadHappinessThreshold} 会累积深度愁苦日；超过 ${MIGRATION_RULES.automaticSadDaysThreshold} 日后，每日有 ${Math.round(MIGRATION_RULES.automaticDailyChance*100)}% 概率自动离开。`;
  if(!moveWhy.alive)moveText='这位居民已不在溪谷，不再计算离开风险。';
  else if(!moveWhy.adult)moveText+=' 当前是孩童，不会因此自动离开。';
  else if(moveWhy.automaticEligible)moveText+=` 当前已累计 ${moveWhy.sadDays} 日，自动离开风险已生效。`;
  else if(moveWhy.sadDays)moveText+=` 当前累计 ${moveWhy.sadDays} 日，再持续 ${moveWhy.daysUntilAutomaticRisk} 日会进入风险期。`;
  else moveText+=' 当前没有累计深度愁苦日。';
  if(moveWhy.wanderEligible)moveText+=' 同时符合“出去闯闯”两难事件的候选条件。';
  setT('fMoveWhy',moveText);$('fMoveWhy').classList.toggle('warn',moveWhy.automaticEligible);
  const items=[];
  const add=(id,label,cls)=>{const q=byId(id);if(!q)return;items.push(`<button class="rel${cls?' '+cls:''}${q.status!=='alive'?' gone':''}" data-id="${q.id}"><em>${label}</em>${q.name}</button>`);};
  if(p.partner)add(p.partner,'伴侣');
  p.parents.forEach(id=>{const q=byId(id);if(q)add(id,q.gender==='男'?'父亲':'母亲');});
  p.children.forEach(id=>add(id,'孩子'));
  const fam=new Set([p.partner,...p.parents,...p.children]);
  const rels=Object.entries(p.rel).filter(([k])=>!fam.has(+k)).sort((a,b)=>b[1]-a[1]);
  rels.filter(([,v])=>v>=40).slice(0,6).forEach(([k,v])=>add(+k,v>=70?'挚友':'朋友'));
  rels.filter(([,v])=>v<=-30).slice(-2).forEach(([k])=>add(+k,'嫌隙','bad'));
  setH('fRels',items.length?items.join(''):'<span class="empty">还没有亲近的人。</span>');
  setT('favor',`恩惠 ${S.favor}/5`);
  const w=S.watch.includes(p.id);$('fWatch').classList.toggle('on',w);setT('fWatch',w?'已关注':'关注');
  document.querySelectorAll('#help button').forEach(b=>{b.disabled=!alive||S.favor<1;});
  if(!$('intro').hidden&&+$('intro').dataset.for!==p.id)$('intro').hidden=true;
  setH('fLife',p.hist.slice(-14).reverse().map(h=>`<li><time>${dateLabel(h.d)}</time><span>${h.t}</span></li>`).join(''));
}
let lastChron=-1;
function updateChron(){
  if(S.chronVer===lastChron)return;lastChron=S.chronVer;
  $('chron').innerHTML=S.chron.slice(-50).reverse().map(c=>`<li class="k-${c.k}"><time>${dateLabel(c.d)}</time><span>${c.t}</span></li>`).join('');
  setT('chronCount',`共 ${S.chron.length} 条`);
}
function updateUI(){
  const se=seasonIdx();
  setT('date',`第 ${Math.floor(S.day/YEAR)+1} 年，${SEASONS[se]}，第 ${S.day%SEASON+1} 日`);
  const w=[`${SEASONS[se]}季`];let warn=false;
  if(S.drought>0){w.push(`干旱还剩 ${S.drought} 日`);warn=true;}
  if(S.plague>0){w.push('疫病流行');warn=true;}
  if(S.festival>0)w.push('丰收节');
  if(S.caravan>0)w.push('商队在此');
  setT('weather',w.join('，'));$('weather').classList.toggle('warn',warn);
  updateStats();
  for(const s of SEEDS){s.el.disabled=!!s.dis();s.el.classList.toggle('active',!!s.on());s.stEl.textContent=s.st();}
  updateFate();updateChron();renderDilemma();
  setT('purse',`公库 ${fmt(S.treasury)} 金`);updateTech();updateFrontier();if(infoTarget)renderInfo();
  renderGoal();renderAlert();
  $('play').textContent=S.paused?'继续':'暂停';
}
function syncControls(){
  $('tax').value=Math.round(S.tax*100);$('taxv').textContent=Math.round(S.tax*100)+'%';
  $('policy').value=S.policy;$('dilOn').checked=S.dilemmasOn;$('alOn').checked=S.alertsOn;$('policyDesc').textContent=POLICIES[S.policy];
  document.querySelectorAll('#speed button').forEach(b=>b.classList.toggle('on',+b.dataset.s===S.speed));
}

/* ---------------- 存档管理 ---------------- */
let saveReturnFocus=null;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function saveTime(v){if(!v)return '未知时间';try{return new Date(v).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return String(v);}}
function safeFileName(name){return String(name||'hejing').replace(/[\\/:*?"<>|]/g,'-').slice(0,40)||'hejing';}
function downloadJson(text,name){
  const blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=safeFileName(name)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
}
function renderSaveManager(){
  const info=Storage.getActiveInfo(),slots=Storage.listSlots();
  $('saveStatus').textContent=info.kind==='challenge'
    ?`当前：独立挑战存档“${info.name}”。挑战前的自由世界仍安全保留。`
    :info.id?`当前自由世界：${info.name}。自动保存已开启。`:'还没有自由世界存档。';
  $('saveSlots').innerHTML=slots.length?slots.map(s=>{
    const active=info.kind==='slot'&&info.id===s.id,cls=`save-slot${active?' active':''}${s.broken?' broken':''}`;
    const meta=s.broken?'存档数据损坏，无法加载':`第 ${Math.floor((s.day||0)/YEAR)+1} 年 · ${s.population||0} 人 · ${saveTime(s.updatedAt)}`;
    return `<div class="${cls}" data-slot="${s.id}"><div class="save-slot-main"><b>${esc(s.name)}${active?'<span class="save-current">当前</span>':''}</b><span>${esc(meta)}</span></div><div class="save-slot-actions"><button class="btn" data-save-act="load" data-id="${s.id}"${active||s.broken?' disabled':''}>加载</button><button class="btn" data-save-act="rename" data-id="${s.id}"${s.broken?' disabled':''}>重命名</button><button class="btn" data-save-act="export" data-id="${s.id}"${s.broken?' disabled':''}>导出</button><button class="btn" data-save-act="delete" data-id="${s.id}"${active?' disabled':''}>删除</button></div></div>`;
  }).join(''):'<div class="empty">还没有自由世界存档。</div>';
}
function openSaveManager(){
  saveNow();saveReturnFocus=document.activeElement;renderSaveManager();$('saveMdl').hidden=false;$('saveMdl').querySelector('.dlg').focus({preventScroll:true});
}
function closeSaveManager(){
  $('saveMdl').hidden=true;const el=saveReturnFocus;saveReturnFocus=null;if(el&&typeof el.focus==='function')el.focus({preventScroll:true});
}
function loadFreeSlot(id,fromImport){
  const info=Storage.getActiveInfo();
  if(info.kind==='challenge'&&!window.confirm('加载自由世界会结束当前挑战。继续吗？'))return;
  const env=Storage.loadSlot(id,false);
  saveNow();
  Storage.loadSlot(id,true);
  if(info.kind==='challenge')Storage.clearChallenge();
  installState(env.state,false);closeSaveManager();toast(fromImport?'已导入并加载存档':'已加载存档');
}
$('saveBtn').addEventListener('click',openSaveManager);
$('saveMdl').addEventListener('click',e=>{
  if(e.target.id==='saveMdl'){closeSaveManager();return;}
  const b=e.target.closest('button');if(!b)return;
  const global=b.dataset.saveGlobal,act=b.dataset.saveAct,id=b.dataset.id;
  try{
    if(global==='close'){closeSaveManager();return;}
    if(global==='save'){saveNow();renderSaveManager();toast('已经保存');return;}
    if(global==='export'){const info=Storage.getActiveInfo();downloadJson(Storage.exportActive(),info.name||'hejing-save');return;}
    if(global==='import'){$('saveImport').click();return;}
    if(global==='new'){
      if(Storage.listSlots().length>=Storage.MAX_SLOTS){window.alert(`最多只能保留 ${Storage.MAX_SLOTS} 个自由世界，请先删除一个旧存档。`);return;}
      const info=Storage.getActiveInfo();
      if(info.kind==='challenge'&&!window.confirm('新建自由世界会结束当前挑战，但挑战前的自由世界仍会保留。继续吗？'))return;
      const name=window.prompt('给新世界起个名字：',`溪谷 ${Storage.listSlots().length+1}`);if(name===null)return;
      saveNow();installState(null,true);
      Storage.createSlot(name,S,true);if(info.kind==='challenge')Storage.clearChallenge();
      saveNow();closeSaveManager();toast('新世界已创建');return;
    }
    if(act==='load'){loadFreeSlot(id,false);return;}
    if(act==='rename'){const slot=Storage.listSlots().find(s=>s.id===id),name=window.prompt('新的存档名称：',slot?slot.name:'');if(name!==null){Storage.renameSlot(id,name);renderSaveManager();}return;}
    if(act==='export'){const slot=Storage.listSlots().find(s=>s.id===id);downloadJson(Storage.exportSlot(id),slot?slot.name:'hejing-save');return;}
    if(act==='delete'){const slot=Storage.listSlots().find(s=>s.id===id);if(window.confirm(`确定删除“${slot?slot.name:'这个存档'}”吗？此操作无法恢复。`)){Storage.deleteSlot(id);renderSaveManager();}return;}
  }catch(err){window.alert(err.message||'存档操作失败。');}
});
$('saveImport').addEventListener('change',async e=>{
  const file=e.target.files&&e.target.files[0];e.target.value='';if(!file)return;
  try{
    const info=Storage.getActiveInfo();
    if(info.kind==='challenge'&&!window.confirm('导入并加载自由世界会结束当前挑战。继续吗？'))return;
    saveNow();
    const env=Storage.importText(await file.text()),loaded=Storage.loadSlot(env.id,true);
    if(info.kind==='challenge')Storage.clearChallenge();
    installState(loaded.state,false);closeSaveManager();toast('已导入并加载存档');
  }catch(err){window.alert(err.message||'导入失败。');renderSaveManager();}
});

/* ---------------- 交互 ---------------- */
let drag=null;
function localPt(e){const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function tileCoords(pt){const u=(pt.x-view.ox)/(view.tw/2),w=(pt.y-view.oy)/(view.tw/4);return {fi:(u+w)/2,fj:(w-u)/2};}
function tileAt(pt){const c=tileCoords(pt);return MAP.at(Math.round(c.fi),Math.round(c.fj));}
function hitPerson(pt,tight){
  const s0=Math.max(5,view.tw*0.2);let best=null,bd=tight?Math.max(5,s0*0.55):Math.max(18,s0*1.6);
  for(const p of S.people){const [x,y]=iso(p.x,p.y);const d=Math.hypot(pt.x-x,pt.y-(y-s0*0.7));if(d<bd){bd=d;best=p;}}
  return best;
}
function villageAtPt(pt){const c=tileCoords(pt),nv=nearestVillage(c.fi,c.fj);return nv.d<=4.5?nv.k:null;}
cv.addEventListener('pointerdown',e=>{
  const pt=localPt(e);
  if(tool==='move'){const p=hitPerson(pt);if(p){drag={kind:'person',p,x:e.clientX,y:e.clientY,moved:false,pointerId:e.pointerId};try{cv.setPointerCapture(e.pointerId);}catch{/* Pointer capture may be unavailable. */}return;}}
  drag={kind:'pan',x:e.clientX,y:e.clientY,px:view.panX,py:view.panY,moved:false,pointerId:e.pointerId};
  try{cv.setPointerCapture(e.pointerId);}catch{/* Pointer capture may be unavailable. */}
});
cv.addEventListener('pointermove',e=>{
  const pt=localPt(e);hoverPt=pt;
  if(!drag)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.abs(dx)+Math.abs(dy)>6)drag.moved=true;
  if(drag.kind==='person'){if(drag.moved)dragGhost={p:drag.p,x:pt.x,y:pt.y,v:villageAtPt(pt)};return;}
  if(drag.moved&&(view.zoom>1.01||e.pointerType==='mouse'||tool!=='look')){view.panX=drag.px+dx;view.panY=drag.py+dy;layout();}
});
cv.addEventListener('pointerup',e=>{
  const pt=localPt(e),d=drag;drag=null;dragGhost=null;
  if(!d)return;
  if(d.kind==='person'){
    if(d.moved){const v=villageAtPt(pt);if(v)relocate(d.p,v);else toast('把人放到一个村子附近才能搬家。',true);moveSrc=null;}
    else{moveSrc=d.p.id;S.sel=d.p.id;updateFate();toast(`现在点一个村子，把${d.p.name}搬过去`);}
    return;
  }
  if(!d.moved)tap(pt);
});
function cancelDrag(){drag=null;dragGhost=null;}
cv.addEventListener('pointercancel',cancelDrag);
cv.addEventListener('lostpointercapture',cancelDrag);
cv.addEventListener('pointerleave',()=>{if(!drag)hoverPt=null;});
// 键盘操作：每次沿真实相邻地块的一条地图轴移动，确保两种棋盘奇偶格都可达。
const kbVisible=t=>t&&!(t.isle&&!isleVisible(S));
function keyboardTileStatus(t){
  if(!t)return '';
  const c=describeTile(S,t,{houses,built:builtAt(t)});
  const where=[c&&c.kicker,c&&c.title].filter(Boolean).join('，')||'地块';
  const people=S.people.filter(p=>Math.round(p.x)===t.i&&Math.round(p.y)===t.j);
  const occupants=people.length?'，附近居民 '+people.slice(0,3).map(p=>p.name).join('、')+(people.length>3?'等 '+people.length+' 人':''):'';
  return '键盘光标：'+where+'，第 '+(t.i+1)+' 行第 '+(t.j+1)+' 列'+occupants;
}
function syncKeyboardTile(){
  if(!kbTile)return;
  const [x,y]=iso(kbTile.i,kbTile.j);hoverPt={x,y};
  const status=keyboardTileStatus(kbTile);
  cv.setAttribute('aria-label',MAP_ARIA_BASE+'。'+status);
  $('mapKbStatus').textContent=status;
}
cv.addEventListener('focus',()=>{
  if(!kbVisible(kbTile))kbTile=MAP.V.grain.center;
  syncKeyboardTile();
});
cv.addEventListener('keydown',e=>{
  if(!kbTile)kbTile=MAP.V.grain.center;
  if(e.key.startsWith('Arrow')){
    const next=moveKeyboardTile(MAP,kbTile,e.key,kbVisible);
    if(next!==kbTile){e.preventDefault();kbTile=next;syncKeyboardTile();}
    return;
  }
  if(e.key==='Enter'||e.key===' '){
    e.preventDefault();
    const [x,y]=iso(kbTile.i,kbTile.j);tap({x,y:y-view.tw*0.1});
  }
});
cv.addEventListener('blur',()=>{hoverPt=null;});
/* ---------------- 点选信息卡 ---------------- */
const labelHits=[];
let infoTarget=null,infoReturn=null;
// 房屋和建筑会高出地块，点它的屋顶其实落在后面的地块上，所以按绘制轮廓从前往后找。
function spriteAt(pt){
  const tw=view.tw,show=isleVisible(S);
  for(let k=MAP.all.length-1;k>=0;k--){
    const t=MAP.all[k];if(t.isle&&!show)continue;
    if(!t.bld&&!(t.slot&&houses.has(t)))continue;
    // 升级后的建筑画得更大（与 scene.js 的 drawBuilding 一致），点选范围也跟着放大。
    const sc=t.bld?1+0.12*((t.blv||1)-1):1;
    const [x,y]=iso(t.i,t.j),hw=tw*(t.bld?0.42:0.3)*sc;
    if(pt.x>=x-hw&&pt.x<=x+hw&&pt.y>=y-tw*(t.bld?0.75:0.55)*sc&&pt.y<=y+tw*0.12)return t;
  }
  return null;
}
function labelAt(pt){const h=labelHits.find(([,x,y,w,hh])=>pt.x>=x&&pt.x<=x+w&&pt.y>=y&&pt.y<=y+hh);return h?h[0]:null;}
function infoContent(){
  const t=infoTarget;if(!t)return null;
  if(t.village)return describeVillage(S,t.village);
  return describeTile(S,t.tile,{houses,built:builtAt(t.tile)});
}
function renderInfo(){
  const box=$('info'),c=infoContent();
  if(!c){box.hidden=true;infoTarget=null;return;}
  setT('infoK',c.kicker||'');setT('infoT',c.title||'');
  let html='';
  if(c.rows&&c.rows.length)html+=`<dl class="info-rows">${c.rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  if(c.people&&c.people.length)html+=`<div class="info-people">${c.people.map(p=>`<button data-person="${p.id}">${esc(p.name)}<em>${esc(p.meta)}</em></button>`).join('')}</div>`;
  if(c.text)html+=`<p class="info-text">${esc(c.text)}</p>`;
  if(c.actions&&c.actions.length)html+=`<div class="info-acts">${c.actions.map(a=>`<button class="btn primary" data-info="${a.act}"${a.disabled?' disabled':''}>${esc(a.label)}</button>${a.hint?`<small>${esc(a.hint)}</small>`:''}`).join('')}</div>`;
  // 模拟每天都会刷新卡片；内容没变就不重建，变了也把键盘焦点还给原来那个按钮。
  const body=$('infoB');if(_c.infoB===html)return;
  const a=body.contains(document.activeElement)?document.activeElement:null;
  const key=a&&(a.dataset.person?`[data-person="${a.dataset.person}"]`:a.dataset.info?`[data-info="${a.dataset.info}"]`:null);
  setH('infoB',html);
  if(a){const b=key&&body.querySelector(key);(b&&!b.disabled?b:box).focus({preventScroll:true});}
}
function openInfo(target,pt){
  infoTarget=target;const box=$('info');
  const opening=box.hidden;
  if(opening)infoReturn=document.activeElement;
  box.hidden=false;renderInfo();if(box.hidden)return;
  if(opening)box.focus({preventScroll:true});
  const W=$('mapwrap').clientWidth,H=$('mapwrap').clientHeight,bw=box.offsetWidth,bh=box.offsetHeight;
  let x=pt.x+14,y=pt.y-bh/2;
  if(x+bw>W-10)x=pt.x-bw-14;
  box.style.left=clamp(x,10,Math.max(10,W-bw-10))+'px';box.style.top=clamp(y,10,Math.max(10,H-bh-10))+'px';
}
function closeInfo(){
  const box=$('info');if(box.hidden)return;
  // 先判断焦点是否在卡片里：隐藏之后浏览器会把焦点丢到 body 上。
  const had=box.contains(document.activeElement);
  box.hidden=true;infoTarget=null;
  if(infoReturn&&had&&typeof infoReturn.focus==='function')infoReturn.focus({preventScroll:true});
  infoReturn=null;
}
$('infoX').addEventListener('click',closeInfo);
$('info').addEventListener('pointerdown',e=>e.stopPropagation());
$('info').addEventListener('click',e=>{
  const pb=e.target.closest('[data-person]');
  if(pb){S.sel=+pb.dataset.person;updateFate();document.querySelector('.right').scrollIntoView({behavior:'smooth',block:'nearest'});return;}
  const ab=e.target.closest('[data-info]');if(!ab||ab.disabled)return;
  if(ab.dataset.info==='upgrade'&&infoTarget&&infoTarget.tile){upgrade(infoTarget.tile);renderInfo();}
  else if(ab.dataset.info==='frontier'){closeInfo();openModal('frontier');}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('info').hidden&&mdlHidden()&&$('dlg').hidden)closeInfo();});

function tap(pt){
  if(tool==='build'){place(tileAt(pt),buildSel);return;}
  if(tool==='raze'){raze(tileAt(pt));return;}
  if(tool==='upgrade'){const sp=spriteAt(pt);upgrade(sp&&sp.bld?sp:tileAt(pt));return;}
  if(tool==='move'){
    if(!moveSrc){toast('先按住或点一下要搬家的人。',true);return;}
    const v=villageAtPt(pt);if(!v){toast('点一个村子附近的地方。',true);return;}
    relocate(living(moveSrc),v);moveSrc=null;return;
  }
  const v=labelAt(pt);
  if(v){$('tip').style.opacity='0';openInfo({village:v},pt);return;}
  // 正点中小人就选人；否则看是不是点在房屋或建筑的轮廓上；再宽松地找附近的小人；最后才是地面。
  const pick=p=>{S.sel=p.id;$('tip').style.opacity='0';closeInfo();updateFate();};
  const direct=hitPerson(pt,true);if(direct){pick(direct);return;}
  const sp=spriteAt(pt);if(sp){$('tip').style.opacity='0';openInfo({tile:sp},pt);return;}
  const near=hitPerson(pt);if(near){pick(near);return;}
  const t=tileAt(pt);
  if(!t||(t.isle&&!isleVisible(S))){closeInfo();return;}
  $('tip').style.opacity='0';openInfo({tile:t},pt);
}
const HINTS={
  look:'',
  build:()=>`点亮起来的空地，花公库 ${BUILDS[buildSel].cost} 金盖一座${BUILDS[buildSel].n}。${BUILDS[buildSel].d}`,
  move:'按住一个人拖到别的村子，或者先点人、再点村子。伴侣和年幼的孩子会一起搬，搬家会让人有点累。',
  raze:'点一座你盖的建筑把它拆掉，退回建造和升级总花费的四成。',
  upgrade:'点一座亮起来的建筑把它升一级。第 2 级只要花钱；第 3 级还要先掌握对应的技术：常平仓要腌藏晒干，井亭药庐要草药医术，商行要记账算学，书院茶社要雕版印书。'
};
function setTool(t){
  tool=t;moveSrc=null;dragGhost=null;closeInfo();
  document.querySelectorAll('#tools button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  $('palette').hidden=t!=='build';
  const h=typeof HINTS[t]==='function'?HINTS[t]():HINTS[t];
  $('toolhint').textContent=h;$('toolhint').hidden=!h;
  cv.className=t==='look'?'':t;
  if(t!=='look')$('tip').style.opacity='0';
  layout();
}
$('tools').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setTool(b.dataset.t);});
$('palette').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;buildSel=b.dataset.b;document.querySelectorAll('#palette button').forEach(x=>x.classList.toggle('on',x===b));setTool('build');});
function zoomTo(z){view.zoom=clamp(z,1,2.8);if(view.zoom<=1.01){view.panX=0;view.panY=0;}layout();}
$('zin').onclick=()=>zoomTo(view.zoom*1.35);
$('zout').onclick=()=>zoomTo(view.zoom/1.35);
$('zfit').onclick=()=>{view.panX=0;view.panY=0;zoomTo(1);};
$('play').onclick=()=>{S.paused=!S.paused;if(!S.people.length)S.paused=true;updateUI();};
$('speed').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.speed=+b.dataset.s;syncControls();});
$('reset').onclick=()=>{
  const info=Storage.getActiveInfo();
  if(info.kind==='challenge'){
    if(window.confirm('“重来”会结束当前挑战并回到挑战前的自由世界。继续吗？'))returnToFreeWorld();
    return;
  }
  if(!window.confirm(`确定重来“${info.name||'当前世界'}”吗？这个存档槽会被新的世界覆盖，且无法恢复。`))return;
  installState(null,true);saveNow();toast('当前存档已重新开始');
};
$('tax').addEventListener('input',e=>{S.tax=+e.target.value/100;$('taxv').textContent=e.target.value+'%';});
$('policy').addEventListener('change',e=>{S.policy=e.target.value;$('policyDesc').textContent=POLICIES[S.policy];chron(`溪谷改行“${e.target.selectedOptions[0].textContent}”。`,'info');updateUI();});
$('alOn').addEventListener('change',e=>{S.alertsOn=e.target.checked;if(!S.alertsOn)S.alerts=[];dirty=true;updateUI();});
$('dilOn').addEventListener('change',e=>{S.dilemmasOn=e.target.checked;if(S.dilemmasOn)S.nextDilemma=Math.max(S.nextDilemma,S.day+10);});
$('fRels').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b){S.sel=+b.dataset.id;updateFate();}});
document.querySelector('.quick').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!S.people.length)return;const P=S.people;let p;
  if(b.dataset.q==='rand')p=pickUi(P);
  else if(b.dataset.q==='happy')p=P.reduce((a,c)=>c.happiness>a.happiness?c:a);
  else p=P.reduce((a,c)=>c.happiness<a.happiness?c:a);
  S.sel=p.id;updateFate();
});
function stepPerson(dir){
  const P=[...S.people].sort((a,b)=>a.id-b.id);if(!P.length)return;
  let i=P.findIndex(p=>p.id===S.sel);i=i<0?0:(i+dir+P.length)%P.length;S.sel=P[i].id;updateFate();
}
$('pPrev').onclick=()=>stepPerson(-1);$('pNext').onclick=()=>stepPerson(1);

/* ---------------- 主循环 ---------------- */
const TPS={1:1.3,3:3.9,10:13};
let dirty=true,last=performance.now(),acc=0,lastUI=0,lastSave=0;
configureState({onDirty:()=>{dirty=true;}});
configureEconomy({
  buildingCount:BC,
  totalBuildingCount:BT,
  foodCapacity:foodCap,
  computeHouses,
  challengeFor:id=>CHALLENGES[id],
  maybeDilemma,
  checkChallenge
});
function frame(now){
  const dt=Math.min(0.1,(now-last)/1000);last=now;
  if(!S.paused&&!S.pending&&!S.alerts.length&&mdlHidden()&&S.people.length){acc+=dt*TPS[S.speed];let n=0;while(acc>=1&&n<6){tick();acc-=1;n++;}if(n)dirty=true;}
  movePeople(dt);draw(now);
  if(dirty&&now-lastUI>200){updateUI();lastUI=now;dirty=false;}
  if(now-lastSave>5000){lastSave=now;saveNow();}
  requestAnimationFrame(frame);
}
function installState(raw,fresh){
  S=fresh?newState():normalizeState(raw);setState(S);S.paused=false;
  if(!S.people.length){
    seedPopulation();
    chron('第1年春。三十个人在溪谷群岛上开始了他们的生活。','info');
    pushHist();
  }
  applyBuilt();
  closeInfo();colorKey='';terrainGen++;lastChron=-1;frontierKey='';for(const k in _c)delete _c[k];
  computeHouses();syncControls();dirty=true;updateUI();
}
function init(fresh){
  if(fresh){installState(null,true);return;}
  const boot=Storage.bootstrap();
  if(boot.session&&boot.session.state)installState(boot.session.state,false);
  else{installState(null,true);Storage.createSlot('溪谷 1',S,true);saveNow();}
  if(boot.migrated)setTimeout(()=>toast('旧版存档已安全迁移到 Save System v2'),60);
  if(boot.migrationError)setTimeout(()=>toast(boot.migrationError,true),60);
}
buildStats();buildSeeds();readTheme();
init(false);
if(window.ResizeObserver)new ResizeObserver(resize).observe($('mapwrap'));
window.addEventListener('resize',resize);
window.addEventListener('pagehide',saveNow);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveNow();});
if(window.matchMedia)window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>setTimeout(readTheme,50));
resize();
requestAnimationFrame(frame);
