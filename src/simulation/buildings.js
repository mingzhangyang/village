import { TECHS, hasTech } from './tech.js';

// Existing building labels, costs, and descriptions.
export const BUILDS={
  granary:{n:'粮仓',cost:60,d:'让整个溪谷多存 250 担粮食。存粮超出仓容的部分，每天会烂掉一些。'},
  well:{n:'水井',cost:30,d:'所在村子的人身体恢复更快，疫病流行时也更不容易染病。'},
  market:{n:'集市',cost:70,d:'所在村子的商人收入更高，村民也更开心。'},
  teahouse:{n:'茶馆',cost:50,d:'所在村子的人来往更频繁，整个溪谷的凝聚力也会上升。'}
};

// 建筑等级：第 2 级只要花钱，第 3 级还要先掌握对应技术。
export const MAX_LEVEL=3;
export const UPGRADES={
  granary:[null,{n:'大粮仓',cost:50,d:'仓容 +400（原为 +250）'},{n:'常平仓',cost:85,tech:'preserve',d:'仓容 +600'}],
  well:[null,{n:'石砌水井',cost:25,d:'每日恢复健康 +0.9，染疫概率减为 35%'},{n:'井亭药庐',cost:45,tech:'herbs',d:'每日恢复健康 +1.2，染疫概率减为 25%'}],
  market:[null,{n:'大集',cost:55,d:'商人收入和村民幸福的加成提高一半'},{n:'商行',cost:100,tech:'ledger',d:'商人收入和村民幸福的加成翻倍'}],
  teahouse:[null,{n:'茶楼',cost:40,d:'来往更频繁，幸福和凝聚力的加成提高一半'},{n:'书院茶社',cost:70,tech:'printing',d:'来往更频繁，幸福和凝聚力的加成翻倍'}]
};
export const GRANARY_CAP=[0,250,400,600];
export const WELL_HEAL=[0,0.6,0.9,1.2];
export const WELL_PLAGUE=[1,0.5,0.35,0.25];
export const TEA_SOCIAL=[1,1.4,1.55,1.7];
// 每升一级，集市/茶馆的效果相当于多出半座。
export const UPGRADE_STEP=0.5;

export const levelOf=b=>b&&(b.lv===2||b.lv===3)?b.lv:1;
export function levelName(b){const lv=levelOf(b);return lv>1?UPGRADES[b.b][lv-1].n:BUILDS[b.b].n;}
export function nextUpgrade(b){const lv=levelOf(b);return lv<MAX_LEVEL?UPGRADES[b.b][lv]:null;}

// 汇总每个村子各类建筑的数量、最高等级和升级加成。
export function buildingStats(built){
  const stats={};
  for(const b of built||[]){
    if(!b||!BUILDS[b.b])continue;
    const v=stats[b.v]||(stats[b.v]={});
    const s=v[b.b]||(v[b.b]={count:0,max:0,bonus:0});
    const lv=levelOf(b);
    s.count++;s.max=Math.max(s.max,lv);s.bonus+=(lv-1)*UPGRADE_STEP;
  }
  return stats;
}
export function statOf(stats,v,type){return (stats[v]&&stats[v][type])||{count:0,max:0,bonus:0};}
export function totalBonus(stats,type){let n=0;for(const v in stats)n+=statOf(stats,v,type).bonus;return n;}
export function granaryCapacity(built){
  let cap=0;for(const b of built||[])if(b&&b.b==='granary')cap+=GRANARY_CAP[levelOf(b)];return cap;
}
export function investedCost(b){
  let c=BUILDS[b.b].cost;for(let lv=2;lv<=levelOf(b);lv++)c+=UPGRADES[b.b][lv-1].cost;return c;
}

// 返回不能升级的原因；空字符串表示可以升级。
export function upgradeBlock(state,b){
  const U=nextUpgrade(b);if(!U)return `${levelName(b)}已经是最高等级。`;
  if(U.tech&&!hasTech(state,U.tech))return `升级为${U.n}需要先掌握${TECHS[U.tech].n}。`;
  if(state.treasury<U.cost)return `公库只有 ${Math.floor(state.treasury)} 金，升级为${U.n}要 ${U.cost} 金。`;
  return '';
}
export function upgradeBuilding(state,b){
  if(upgradeBlock(state,b))return null;
  const U=nextUpgrade(b);state.treasury-=U.cost;b.lv=levelOf(b)+1;return U;
}
