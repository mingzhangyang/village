// 发展图谱：用公库的钱立项、按日积累进度的长期发展线。
// 所有效果都是确定性的倍率或加成，不消耗随机数。

export const TECHS={
  rotation:{n:'轮作休耕',tier:1,cost:40,days:20,req:[],d:'农田轮换作物，地力不再耗尽。',fx:{farm:0.15},h:'农夫产粮 +15%'},
  nets:{n:'改良渔网',tier:1,cost:35,days:15,req:[],d:'织更密更结实的网，冬天也能出海。',fx:{fish:0.2},h:'渔民产粮 +20%'},
  herbs:{n:'草药医术',tier:1,cost:40,days:20,req:[],d:'长者把认得的草药记成方子，代代相传。',fx:{heal:0.4,plague:-0.3},h:'每日恢复健康 +0.4，染疫概率 −30%'},
  ledger:{n:'记账算学',tier:1,cost:35,days:15,req:[],d:'用算盘和账簿管钱，买卖更有章法。',fx:{merchant:0.25,craft:0.15},h:'商人经营所得 +25%，工匠作坊产出 +15%'},
  iron:{n:'铁制农具',tier:2,cost:80,days:30,req:['rotation'],needMine:true,d:'用山里的矿石打出铁犁、铁斧和铁镐。',fx:{farm:0.15,wood:0.2,mine:0.15},h:'产粮 +15%，樵夫 +20%，矿工 +15%'},
  kiln:{n:'窑烧砖瓦',tier:2,cost:70,days:25,req:['ledger'],d:'垒起砖窑，烧出砖瓦和陶器卖到岛外。',fx:{craft:0.3},h:'工匠作坊产出 +30%'},
  preserve:{n:'腌藏晒干',tier:2,cost:65,days:25,req:['nets'],d:'学会腌鱼、晒谷、窖藏，粮食放得更久。',fx:{cap:150,rot:-0.6},h:'仓容 +150，仓满时的损耗 −60%'},
  waterwheel:{n:'水车磨坊',tier:3,cost:130,days:40,req:['iron'],needCanal:true,d:'借水渠的水力推动水车，舂米磨面都省了人力。',fx:{farm:0.2,craft:0.2},h:'产粮 +20%，工匠作坊产出 +20%'},
  printing:{n:'雕版印书',tier:3,cost:110,days:35,req:['ledger','herbs'],d:'把手艺和医方刻版印成书，人人都能学。',fx:{skill:0.5,research:0.3},h:'所有人学手艺 +50%，研究速度 +30%'},
  housing:{n:'扩建屋舍',tier:3,cost:100,days:30,req:['kiln'],d:'用砖瓦盖起更宽敞的房子，能住下更大的家。',fx:{birthCap:30},h:'人口超过 90 后出生率才会下降（原为 60）'},
  searoute:{n:'远洋航路',tier:3,cost:120,days:40,req:['preserve','ledger'],d:'画出海图、造起大船，和远方的港口通商。',fx:{ship:1},h:'每 40 日有一艘商船来访：粮食 +30，商人生意兴隆 6 日'}
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

export function researchRate(state,workers){
  const staff=0.5+0.5*Math.min(1,Math.max(0,workers)/15);
  return staff*(state.school?1.25:1)*techMult(state,'research');
}

// 返回不能研究的原因；空字符串表示可以研究。
export function researchBlock(state,id){
  const T=TECHS[id];if(!T)return '没有这项技术。';
  if(hasTech(state,id))return '已经掌握。';
  if(state.research)return state.research.id===id?'正在研究。':`正在研究${TECHS[state.research.id].n}。`;
  const miss=T.req.filter(r=>!hasTech(state,r));
  if(miss.length)return `需要先掌握${miss.map(r=>TECHS[r].n).join('、')}。`;
  if(T.needMine&&!state.mine)return '需要先发现矿脉。';
  if(T.needCanal&&!state.canal)return '需要先修建水渠。';
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

// 推进一日研究；研究完成时返回技术 id。
export function advanceResearch(state,workers){
  const r=state.research;if(!r)return null;
  r.prog+=researchRate(state,workers);
  if(r.prog<TECHS[r.id].days)return null;
  state.tech[r.id]=state.day;state.research=null;
  return r.id;
}

export function normalizeTech(state){
  const raw=state.tech&&typeof state.tech==='object'&&!Array.isArray(state.tech)?state.tech:{};
  const tech={};
  for(const id of TECH_KEYS)if(Number.isFinite(raw[id]))tech[id]=raw[id];
  state.tech=tech;
  const r=state.research;
  state.research=r&&typeof r==='object'&&TECHS[r.id]&&!hasTech(state,r.id)&&Number.isFinite(r.prog)
    ?{id:r.id,prog:Math.max(0,r.prog)}:null;
}
