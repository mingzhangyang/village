// Static world layout, preserved from the original simulation.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export const N=20;
export const VDEF={
  pine:{n:'松林镇',ci:5,cj:6,roof:'#4c6a84'},
  grain:{n:'禾谷村',ci:6,cj:13,roof:'#b5553d'},
  bay:{n:'溪湾聚落',ci:15,cj:12,roof:'#3f7a86'}
};
export const VKEYS=['pine','grain','bay'];
// 东南海上的无人小岛，要开拓之后才成为第四个聚落。
export const ISLE='isle';
export const ALL_VKEYS=[...VKEYS,ISLE];
const ISLE_DEF={n:'南屿',roof:'#8a5f9e'};
// 小岛与主岛隔着一道海，单独生成，不影响主岛的随机布局。
const ISLE_TILES=[
  [17,16,'forest'],[18,16,'forest'],
  [16,17,'slot'],[17,17,'slot'],[18,17,'slot'],[19,17,'coast'],
  [15,18,'field'],[16,18,'slot'],[17,18,'plaza'],[18,18,'slot'],[19,18,'coast'],
  [16,19,'field'],[17,19,'slot'],[18,19,'coast']
];
function buildIsle(g,all){
  const r=mulberry32(20261004),tiles=[];
  for(const [i,j,kind] of ISLE_TILES){
    const t={i,j,type:kind==='forest'||kind==='field'||kind==='plaza'?kind:'grass',v:r(),trees:[],slot:kind==='slot',isle:true,coast:kind==='coast'};
    if(kind==='forest'){t.kind='pine';for(let k=0;k<3;k++)t.trees.push({dx:(r()-0.5)*0.55,dy:(r()-0.5)*0.55,s:0.75+r()*0.45,kind:'pine'});}
    else if(kind==='coast'&&r()<0.5)t.trees.push({dx:(r()-0.5)*0.4,dy:(r()-0.5)*0.4,s:0.7+r()*0.3,kind:'round'});
    t.trees.sort((a,b)=>(a.dx+a.dy)-(b.dx+b.dy));
    g[i][j]=t;all.push(t);tiles.push(t);
  }
  const center=tiles.find(t=>t.type==='plaza');
  const slots=tiles.filter(t=>t.slot).sort((a,b)=>Math.hypot(a.i-center.i,a.j-center.j)-Math.hypot(b.i-center.i,b.j-center.j));
  return {
    village:{key:ISLE,n:ISLE_DEF.n,roof:ISLE_DEF.roof,center,slots},
    lists:{tiles,fields:tiles.filter(t=>t.type==='field'),forest:tiles.filter(t=>t.type==='forest'),water:tiles.filter(t=>t.coast),plazas:[center]}
  };
}
export const MAP=(function(){
  const r=mulberry32(20261003);
  const g=[];const c=(N-1)/2;
  for(let i=0;i<N;i++){g[i]=[];for(let j=0;j<N;j++){
    const dx=i-c,dy=j-c,ang=Math.atan2(dy,dx),d=Math.hypot(dx,dy);
    const rm=8.7+0.7*Math.sin(3*ang+1.3)+0.45*Math.sin(5*ang+0.4)+(r()-0.5)*0.8;
    g[i][j]=d<rm?{i,j,type:'grass',v:r(),trees:[],slot:false}:null;
  }}
  const at=(i,j)=>(i>=0&&j>=0&&i<N&&j<N)?g[i][j]:null;
  const all=[];for(let i=0;i<N;i++)for(let j=0;j<N;j++)if(g[i][j])all.push(g[i][j]);
  const dist=(t,i,j)=>Math.hypot(t.i-i,t.j-j);
  all.forEach(t=>{if(dist(t,14.5,5)<2.5+r()*0.4)t.type='mountain';});
  const water=[];let ci=13,cj=7;
  for(let s=0;s<45;s++){
    const t=at(ci,cj);if(!t)break;
    if(t.type!=='mountain'&&t.type!=='water'){t.type='water';water.push(t);}
    const x=r();if(x<0.58)cj++;else if(x<0.86)ci--;else ci++;
  }
  const V={};
  for(const k of VKEYS){
    const d=VDEF[k];let best=null,bd=1e9;
    all.forEach(t=>{if(t.type!=='grass')return;const dd=dist(t,d.ci,d.cj);if(dd<bd){bd=dd;best=t;}});
    best.type='plaza';
    const slots=all.filter(t=>t.type==='grass'&&!t.slot&&dist(t,best.i,best.j)<=2.3)
      .sort((a,b)=>dist(a,best.i,best.j)-dist(b,best.i,best.j)).slice(0,12);
    slots.forEach(t=>t.slot=true);
    V[k]={key:k,n:d.n,roof:d.roof,center:best,slots};
  }
  const FS=[[3,3.5,2.7,'pine'],[7.5,2,2.1,'pine'],[2.5,9.5,1.7,'round'],[10.5,10,1.5,'round'],[17,8,1.6,'pine'],[9,16.5,1.4,'round']];
  all.forEach(t=>{if(t.type!=='grass'||t.slot)return;for(const f of FS){if(dist(t,f[0],f[1])<f[2]&&r()<0.82){t.type='forest';t.kind=f[3];break;}}});
  const gc=V.grain.center;
  all.forEach(t=>{if(t.type!=='grass'||t.slot)return;const dd=dist(t,gc.i,gc.j);if(dd>1.4&&dd<4.3&&r()<0.85)t.type='field';});
  all.forEach(t=>{
    if(t.type==='forest'){const n=2+(r()<0.5?1:0);for(let k=0;k<n;k++)t.trees.push({dx:(r()-0.5)*0.55,dy:(r()-0.5)*0.55,s:0.75+r()*0.45,kind:t.kind});}
    else if(t.type==='grass'&&!t.slot&&r()<0.08)t.trees.push({dx:(r()-0.5)*0.4,dy:(r()-0.5)*0.4,s:0.7+r()*0.4,kind:r()<0.5?'pine':'round'});
    t.trees.sort((a,b)=>(a.dx+a.dy)-(b.dx+b.dy));
  });
  let mine=null,md=1e9;
  all.forEach(t=>{if((t.type==='grass'||t.type==='forest')&&!t.slot){const dd=dist(t,12,3.8);if(dd<md){md=dd;mine=t;}}});
  mine.type='grass';mine.trees=[];mine.mine=true;
  const mineAdj=all.filter(t=>dist(t,mine.i,mine.j)<1.6&&t.type!=='water'&&t.type!=='mountain');
  const edge=all.filter(t=>!at(t.i+1,t.j)||!at(t.i,t.j+1)||!at(t.i-1,t.j)||!at(t.i,t.j-1));
  const isle=buildIsle(g,all);V[ISLE]=isle.village;
  all.forEach(t=>{t.orig=t.type;t.otrees=t.trees.slice();});
  all.sort((a,b)=>(a.i+a.j)-(b.i+b.j)||a.i-b.i);
  const main=all.filter(t=>!t.isle);
  return {g,at,all,water,forest:main.filter(t=>t.type==='forest'),fields:main.filter(t=>t.type==='field'),V,mine,mineAdj,edge,plazas:VKEYS.map(k=>V[k].center),isle:isle.lists};
})();
