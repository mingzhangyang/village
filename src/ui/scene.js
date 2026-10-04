// Canvas sprites and terrain for the world map. Pure rendering: never touches simulation RNG.
import { MAP } from '../world/map.js';
import { JOBS } from '../simulation/constants.js';
import { YEAR } from '../simulation/clock.js';
import { clamp } from '../simulation/random.js';

let ctx=null;
export function bindContext(c){ctx=c;}

/* ---------------- 颜色与基础图元 ---------------- */
export function hx(c){return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];}
export function mix(a,b,t){const A=hx(a),B=hx(b);return '#'+A.map((v,k)=>clamp(Math.round(v+(B[k]-v)*t),0,255).toString(16).padStart(2,'0')).join('');}
export function shade(c,t){return t>0?mix(c,'#ffffff',t):mix(c,'#000000',-t);}
export function rgba(c,a){const [r,g,b]=hx(c);return `rgba(${r},${g},${b},${a})`;}
export function poly(fill,...pts){ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let k=2;k<pts.length;k+=2)ctx.lineTo(pts[k],pts[k+1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
export function rrect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
// Deterministic 0..1 noise so decoration stays put between frames and reloads.
export function hash(a,b){const s=Math.sin(a*127.1+b*311.7)*43758.5453;return s-Math.floor(s);}
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function ell(fill,x,y,rx,ry){ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,Math.max(0.1,rx),Math.max(0.1,ry),0,0,Math.PI*2);ctx.fill();}
function dot(fill,x,y,r){ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,Math.max(0.1,r),0,Math.PI*2);ctx.fill();}
function line(stroke,w,...pts){ctx.strokeStyle=stroke;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let k=2;k<pts.length;k+=2)ctx.lineTo(pts[k],pts[k+1]);ctx.stroke();}
function groundShadow(x,y,rx,ry,a=0.18){ell(`rgba(28,38,18,${a})`,x+rx*0.22,y+ry*0.25,rx,ry);}

/* ---------------- 海面与地形（静态层，按视图缓存） ---------------- */
const SEA={light:['#cfe3dd','#b3d2d0','#e2efe6'],dark:['#1b2b30','#111d22','#24383c']};
export function drawSea(w,h,o){
  const [top,bot]=o.dark?SEA.dark:SEA.light;
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,top);g.addColorStop(1,bot);
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  // 细碎浪花，跟随平移，缓慢漂移
  const W=w+60,H=h+40,n=Math.round(w*h/9000);
  ctx.lineCap='round';ctx.lineWidth=1.1;
  for(let k=0;k<n;k++){
    const a=hash(k,3.1),b=hash(k,7.7),c=hash(k,1.9);
    const x=((a*W+o.ox*0.6+o.T*(3+c*4))%W+W)%W-30,y=((b*H+o.oy*0.6)%H+H)%H-20;
    const al=(o.dark?0.12:0.4)*(0.5+0.5*Math.sin(o.T*0.9+k*1.7)),r=4+c*6;
    ctx.strokeStyle=`rgba(255,255,255,${al.toFixed(3)})`;
    ctx.beginPath();ctx.arc(x,y-r*0.6,r,Math.PI*0.25,Math.PI*0.75);ctx.stroke();
  }
}

const SPRING_FLOWERS=['#f7f3e6','#f2c94c','#ec9fb6','#c7a6e6'];
export function buildTerrain(o){
  const {tw,iso,tileCol,se,canal,dry,dark}=o,hw=tw/2,hh=tw/4,D=tw*0.32,at=MAP.at;
  // 岛屿在海中的浅滩与投影
  const footprint=(sx,sy,dx,dy)=>{ctx.beginPath();for(const t of MAP.all){const [x,y]=iso(t.i,t.j),X=x+dx,Y=y+dy;ctx.moveTo(X,Y-hh*sy);ctx.lineTo(X+hw*sx,Y);ctx.lineTo(X,Y+hh*sy);ctx.lineTo(X-hw*sx,Y);ctx.closePath();}};
  ctx.save();
  ctx.filter=`blur(${Math.max(2,tw*0.35).toFixed(1)}px)`;
  footprint(1.9,1.9,0,D);ctx.fillStyle=dark?'rgba(60,100,105,.35)':'rgba(236,246,236,.75)';ctx.fill();
  ctx.filter=`blur(${Math.max(2,tw*0.2).toFixed(1)}px)`;
  footprint(1.05,1.05,tw*0.12,D+tw*0.16);ctx.fillStyle=dark?'rgba(0,0,0,.35)':'rgba(30,70,80,.22)';ctx.fill();
  ctx.restore();
  for(const t of MAP.all){
    const [x,y]=iso(t.i,t.j),col=tileCol.get(t),wat=t.type==='water',r=(a)=>hash(t.i*31+t.j,a);
    // 断崖：草皮边、土层渐变、岩层纹
    const front=[];if(!at(t.i,t.j+1))front.push(0);if(!at(t.i+1,t.j))front.push(1);
    for(const f of front){
      const A=f?[x,y+hh]:[x-hw,y],B=f?[x+hw,y]:[x,y+hh];
      const g=ctx.createLinearGradient(0,Math.min(A[1],B[1]),0,Math.max(A[1],B[1])+D);
      if(wat){g.addColorStop(0,f?'#5a93aa':'#6aa4ba');g.addColorStop(1,f?'#3f748a':'#4f8aa0');}
      else{g.addColorStop(0,f?'#9b7448':'#b88d5a');g.addColorStop(1,f?'#634628':'#87623b');}
      poly(g,A[0],A[1],B[0],B[1],B[0],B[1]+D,A[0],A[1]+D);
      if(!wat){
        const lip=Math.max(1.5,D*0.16);
        poly(shade(col,f?-0.3:-0.2),A[0],A[1],B[0],B[1],B[0],B[1]+lip,A[0],A[1]+lip);
        ctx.lineCap='round';
        for(const k of [0.48,0.76])line(`rgba(50,32,15,${f?0.2:0.14})`,Math.max(0.6,tw*0.012),A[0],A[1]+D*k+(r(k)-0.5)*D*0.1,B[0],B[1]+D*k+(r(k+1)-0.5)*D*0.1);
        for(let k=0;k<2;k++){const u=0.15+r(5+k)*0.7,v=0.35+r(9+k)*0.55,p=lerp(A,B,u);ell(`rgba(60,40,20,${f?0.22:0.16})`,p[0],p[1]+D*v,tw*0.02,tw*0.012);}
      }
    }
    // 顶面
    poly(col,x,y-hh-0.4,x+hw+0.5,y,x,y+hh+0.4,x-hw-0.5,y);
    const P=(a,b)=>[x+(a-b)*hw,y+(a+b)*hh]; // a,b ∈ [-0.5,0.5] tile space
    if(t.type==='field'){
      const crop=[['#7fa646','#9bc25a'],['#86a83a','#a7c450'],['#e8c766','#c59a35'],['#ad9f7e','#f4f2ea']][se];
      const cc=dry?crop.map(c=>mix(c,'#c4a76a',0.45)):crop;
      ctx.lineCap='round';
      for(let k=1;k<=4;k++){
        const b=-0.5+k/5,p0=P(-0.4,b),p1=P(0.4,b);
        line(shade(col,-0.2),Math.max(0.8,tw*0.05),p0[0],p0[1]+tw*0.012,p1[0],p1[1]+tw*0.012);
        if(se===0){ctx.setLineDash([tw*0.03,tw*0.05]);line(cc[0],Math.max(0.8,tw*0.035),...p0,...p1);ctx.setLineDash([]);}
        else if(se===1){line(cc[0],Math.max(0.9,tw*0.05),...p0,...p1);line(cc[1],Math.max(0.5,tw*0.018),p0[0],p0[1]-tw*0.01,p1[0],p1[1]-tw*0.01);}
        else if(se===2){line(cc[0],Math.max(0.9,tw*0.045),...p0,...p1);for(let m=0;m<=6;m++){const q=lerp(p0,p1,m/6);line(cc[1],Math.max(0.5,tw*0.014),q[0],q[1],q[0]+tw*0.012,q[1]-tw*0.06);}}
        else{line(shade(col,-0.08),Math.max(0.6,tw*0.02),...p0,...p1);for(let m=0;m<3;m++){const q=lerp(p0,p1,r(k*7+m));ell('rgba(250,250,246,.75)',q[0],q[1],tw*0.04,tw*0.016);}}
      }
      if(canal){const p0=P(0,-0.5),p1=P(0,0.5);line('#5f9db7',Math.max(1.2,tw*0.06),...p0,...p1);line('rgba(255,255,255,.45)',Math.max(0.5,tw*0.015),p0[0]+tw*0.01,p0[1],p1[0]+tw*0.01,p1[1]);}
    }else if(wat){
      // 岸边浅色沙线
      ctx.lineCap='round';
      const E=[[1,0,[x+hw,y],[x,y+hh]],[0,1,[x,y+hh],[x-hw,y]],[-1,0,[x-hw,y],[x,y-hh]],[0,-1,[x,y-hh],[x+hw,y]]];
      for(const [di,dj,a,b] of E){const n=at(t.i+di,t.j+dj);if(!n||n.type==='water')continue;
        const c=[x,y],a2=lerp(a,c,0.1),b2=lerp(b,c,0.1);line('rgba(232,220,180,.55)',Math.max(1,tw*0.05),...a2,...b2);line('rgba(255,255,255,.5)',Math.max(0.6,tw*0.018),...lerp(a,c,0.2),...lerp(b,c,0.2));}
    }else if(t.type==='plaza'){
      ctx.strokeStyle=shade(col,-0.1);ctx.lineWidth=Math.max(0.5,tw*0.012);ctx.beginPath();
      for(let k=1;k<4;k++){const f=-0.5+k/4;let p=P(f,-0.48),q=P(f,0.48);ctx.moveTo(...p);ctx.lineTo(...q);p=P(-0.48,f);q=P(0.48,f);ctx.moveTo(...p);ctx.lineTo(...q);}
      ctx.stroke();
      for(let k=0;k<5;k++){const p=P(r(k)-0.5,r(k+20)-0.5);poly(shade(col,r(k+40)>0.5?0.08:-0.06),p[0],p[1]-hh*0.11,p[0]+hw*0.11,p[1],p[0],p[1]+hh*0.11,p[0]-hw*0.11,p[1]);}
    }else if(t.type==='grass'||t.type==='forest'){
      ctx.lineCap='round';
      const tufts=t.type==='forest'?3:1+(r(1)<0.55?1:0),tc=shade(col,t.type==='forest'?-0.16:-0.1),lw=Math.max(0.6,tw*0.016),L=tw*0.045;
      for(let k=0;k<tufts;k++){
        const [px,py]=P(r(k*3+2)*0.8-0.4,r(k*3+3)*0.8-0.4);
        ctx.strokeStyle=tc;ctx.lineWidth=lw;ctx.beginPath();
        ctx.moveTo(px-L*0.4,py-L*0.7);ctx.lineTo(px,py);ctx.lineTo(px+L*0.45,py-L*0.75);ctx.moveTo(px,py);ctx.lineTo(px+L*0.05,py-L);ctx.stroke();
      }
      if(t.type==='forest'){for(let k=0;k<2;k++){const p=P(r(k+50)*0.8-0.4,r(k+60)*0.8-0.4);dot(shade(col,-0.2),p[0],p[1]-tw*0.015,tw*0.028);dot(shade(col,-0.06),p[0]-tw*0.01,p[1]-tw*0.025,tw*0.017);}}
      const fl=se===0?0.55:se===1?0.3:se===2?0.4:0.65;
      if(!dry&&r(30)<fl){
        const n=2+Math.floor(r(31)*3);
        for(let k=0;k<n;k++){
          const p=P(r(k+32)*0.8-0.4,r(k+42)*0.8-0.4);
          if(se===3)ell('rgba(250,251,248,.7)',p[0],p[1],tw*(0.04+r(k+52)*0.05),tw*(0.018+r(k+52)*0.02));
          else if(se===2)ell(['#d3893a','#c0632f','#e0b04a'][k%3],p[0],p[1],tw*0.018,tw*0.01);
          else{dot(SPRING_FLOWERS[Math.floor(r(k+62)*SPRING_FLOWERS.length)],p[0],p[1]-tw*0.01,Math.max(0.8,tw*0.016));}
        }
      }
    }
  }
}

/* ---------------- 动态水面：水纹、瀑布、岸边浪 ---------------- */
export function drawWaterFx(o){
  const {tw,iso,T,dark}=o,hw=tw/2,hh=tw/4,D=tw*0.32,at=MAP.at;
  ctx.lineCap='round';
  for(const t of MAP.water){
    const [x,y]=iso(t.i,t.j),sd=hash(t.i,t.j);
    for(let k=0;k<2;k++){
      const ph=(T*0.22+sd+k*0.5)%1,a=Math.sin(ph*Math.PI)*0.55;
      const ci=k?0.18:-0.15,cj=ph-0.5,px=x+(ci-cj)*hw,py=y+(ci+cj)*hh;
      line(`rgba(255,255,255,${a.toFixed(3)})`,Math.max(0.7,tw*0.022),px-hw*0.16,py+hh*0.16*0.3,px+hw*0.06,py-hh*0.06);
    }
    const sp=(T*0.7+sd*5)%3;if(sp<0.4)dot(`rgba(255,255,255,${(0.7*Math.sin(sp/0.4*Math.PI)).toFixed(3)})`,x+(sd-0.5)*hw,y+(hash(t.j,t.i)-0.5)*hh,Math.max(0.6,tw*0.018));
    // 河水流出岛屿边缘形成瀑布
    const faces=[];if(!at(t.i,t.j+1))faces.push([[x-hw,y],[x,y+hh]]);if(!at(t.i+1,t.j))faces.push([[x,y+hh],[x+hw,y]]);
    for(const [A,B] of faces){
      for(let k=0;k<4;k++){
        const u=0.12+k*0.25,p=lerp(A,B,u),ph=(T*1.4+k*0.37+sd)%1;
        line(`rgba(255,255,255,${(0.55*(1-ph)).toFixed(3)})`,Math.max(0.7,tw*0.02),p[0],p[1]+D*ph*0.7,p[0],p[1]+D*Math.min(1,ph*0.7+0.3));
      }
      const m=lerp(A,B,0.5);
      for(let k=0;k<3;k++){const ph=(T*0.8+k/3)%1;ell(`rgba(255,255,255,${(0.5*(1-ph)).toFixed(3)})`,m[0]+(k-1)*hw*0.25,m[1]+D+tw*0.02,tw*(0.06+ph*0.12),tw*(0.025+ph*0.04));}
    }
  }
  // 岛屿底部的浪线
  const fa=dark?0.18:0.5;
  for(const t of MAP.edge){
    const [x,y]=iso(t.i,t.j),w=0.5+0.5*Math.sin(T*1.6+t.i*0.9+t.j*0.7),off=tw*(0.02+w*0.035);
    const segs=[];if(!at(t.i,t.j+1))segs.push([x-hw,y+D,x,y+hh+D]);if(!at(t.i+1,t.j))segs.push([x,y+hh+D,x+hw,y+D]);
    for(const s of segs)line(`rgba(255,255,255,${(fa*(0.45+0.55*w)).toFixed(3)})`,Math.max(0.8,tw*0.028),s[0],s[1]+off,s[2],s[3]+off);
  }
}

/* ---------------- 树木 ---------------- */
const AUTUMN=['#d08a2e','#c8642f','#d9b13a','#b9572c'];
export function drawTree(x,y,s,kind,o){
  const {se,dry,T,seed}=o,sway=Math.sin(T*1.3+seed*6.28)*s*0.03;
  groundShadow(x,y,s*0.32,s*0.11,0.2);
  if(kind==='pine'){
    ctx.fillStyle='#6e5034';ctx.fillRect(x-s*0.045,y-s*0.3,s*0.09,s*0.3);
    const c=se===3?'#4f6e52':dry?'#6f8045':['#4f8247','#457a3e','#4b7543','#4f6e52'][se];
    const tiers=[[0.18,0.8,0.36],[0.46,1.06,0.29],[0.74,1.34,0.21]];
    tiers.forEach(([b,tp,w],k)=>{
      const tx=x+sway*(k+1)/2,ty=y-s*tp,by=y-s*b,my=by+s*0.06;
      poly(shade(c,0.04+k*0.05),tx,ty,x-s*w,by,x+sway*k/2,my);
      poly(shade(c,-0.22+k*0.03),tx,ty,x+s*w,by,x+sway*k/2,my);
      if(se===3){const f=0.42;poly('#f4f6f2',tx,ty,tx+(x-s*w-tx)*f,ty+(by-ty)*f,tx,ty+(my-ty)*f*0.85,tx+(x+s*w-tx)*f,ty+(by-ty)*f);}
    });
  }else{
    const tx=x+sway;
    ctx.fillStyle='#755438';ctx.beginPath();ctx.moveTo(x-s*0.06,y);ctx.lineTo(x-s*0.035,y-s*0.5);ctx.lineTo(x+s*0.035,y-s*0.5);ctx.lineTo(x+s*0.06,y);ctx.closePath();ctx.fill();
    if(se===3){
      ctx.lineCap='round';
      const br=[[-0.24,-0.78],[0.22,-0.86],[-0.05,-1.0],[0.3,-0.62],[-0.3,-0.6]];
      for(const [bx,by] of br)line('#755438',Math.max(0.6,s*0.04),x,y-s*0.45,tx+s*bx,y+s*by);
      ell('rgba(244,246,240,.55)',tx-s*0.02,y-s*0.86,s*0.18,s*0.05);
      return;
    }
    let c=['#6f9e4a','#5b8c3c',AUTUMN[Math.floor(seed*AUTUMN.length)],'#a39e86'][se];if(dry&&se<2)c=mix(c,'#b9a25a',0.4);
    dot(shade(c,-0.2),tx+s*0.08,y-s*0.6,s*0.32);
    dot(c,tx-s*0.08,y-s*0.66,s*0.3);
    dot(c,tx+s*0.12,y-s*0.78,s*0.22);
    dot(shade(c,0.1),tx-s*0.02,y-s*0.86,s*0.2);
    dot(shade(c,0.24),tx-s*0.14,y-s*0.84,s*0.1);
    if(se===0&&seed<0.4){for(let k=0;k<5;k++)dot(k%2?'#f7e8ef':'#f2a9c0',tx+(hash(seed,k)-0.5)*s*0.5,y-s*(0.5+hash(k,seed)*0.45),Math.max(0.6,s*0.04));}
    if(se===1&&seed>0.75){for(let k=0;k<3;k++)dot('#d8473a',tx+(hash(seed,k)-0.5)*s*0.45,y-s*(0.52+hash(k,seed)*0.35),Math.max(0.6,s*0.04));}
  }
}

/* ---------------- 房屋 ---------------- */
// Returns the window position so the caller can add a night glow.
export function drawHouse(x,y,s,roof,wall,o){
  wall=wall||'#efe5cf';
  const hw=s/2,hh=s/4,H=s*0.5,{T=0,seed=0.5,se=0,dark=false,smoke=true}=o||{};
  groundShadow(x,y+hh*0.3,s*0.62,s*0.24,0.2);
  // 墙
  const LW=(a,b)=>[x-hw+hw*a,y+hh*a-H*b],RW=(a,b)=>[x+hw*a,y+hh-hh*a-H*b];
  poly(wall,x-hw,y,x,y+hh,x,y+hh-H,x-hw,y-H);
  poly(shade(wall,-0.17),x,y+hh,x+hw,y,x+hw,y-H,x,y+hh-H);
  poly(shade(wall,-0.3),x-hw,y,x,y+hh,x,y+hh-H*0.12,x-hw,y-H*0.12);
  poly(shade(wall,-0.4),x,y+hh,x+hw,y,x+hw,y-H*0.12,x,y+hh-H*0.12);
  // 窗与门
  const win=dark?'#ffd27a':'#a9c7d2';
  poly('#6b5240',...LW(0.28,0.34),...LW(0.66,0.34),...LW(0.66,0.76),...LW(0.28,0.76));
  poly(win,...LW(0.33,0.4),...LW(0.61,0.4),...LW(0.61,0.7),...LW(0.33,0.7));
  if(s>18)line('#6b5240',Math.max(0.5,s*0.02),...LW(0.47,0.4),...LW(0.47,0.7));
  poly('#5d4434',...RW(0.32,0),...RW(0.62,0),...RW(0.62,0.62),...RW(0.32,0.62));
  if(s>16)dot('#e2ad2f',...RW(0.56,0.3),Math.max(0.5,s*0.018));
  // 屋顶
  const L=[x-hw*1.16,y-H+hh*0.02],F=[x,y+hh-H+hh*0.26],R=[x+hw*1.16,y-H+hh*0.02],A=[x,y-H-s*0.44],e=s*0.055;
  poly(shade(roof,-0.38),...L,...F,...R,R[0],R[1]+e,F[0],F[1]+e,L[0],L[1]+e);
  poly(roof,...L,...F,...A);
  poly(shade(roof,-0.2),...F,...R,...A);
  ctx.lineCap='round';
  const lw=Math.max(0.5,s*0.018);
  for(const f of [0.3,0.6]){line(shade(roof,-0.12),lw,...lerp(L,A,f),...lerp(F,A,f));line(shade(roof,-0.3),lw,...lerp(F,A,f),...lerp(R,A,f));}
  if(se===3){
    const f=0.45;
    poly('#f6f7f3',...A,...lerp(A,L,1-f+0.08),...lerp(A,F,1-f));
    poly('#dfe5ea',...A,...lerp(A,F,1-f),...lerp(A,R,1-f+0.08));
  }
  line(shade(roof,0.22),Math.max(0.6,s*0.03),...F,...A);
  // 烟囱与炊烟
  const c0=lerp(lerp(F,R,0.62),A,0.38),cw=s*0.1,ctop=c0[1]-s*0.22;
  ctx.fillStyle='#8c6b56';ctx.fillRect(c0[0]-cw/2,ctop,cw/2,s*0.24);
  ctx.fillStyle='#6f5444';ctx.fillRect(c0[0],ctop,cw/2,s*0.24);
  ctx.fillStyle='#5b4538';ctx.fillRect(c0[0]-cw*0.6,ctop-s*0.03,cw*1.2,s*0.04);
  if(smoke&&(se>=2||seed<0.45)){
    for(let k=0;k<3;k++){
      const ph=(T*0.28+seed+k/3)%1,r=s*(0.05+ph*0.11);
      dot(dark?`rgba(170,175,185,${(0.32*(1-ph)).toFixed(3)})`:`rgba(250,250,246,${(0.6*(1-ph)).toFixed(3)})`,c0[0]+Math.sin(ph*5+seed*6)*s*0.08+ph*s*0.22,ctop-ph*s*0.95-s*0.04,r);
    }
  }
  return LW(0.47,0.55);
}

/* ---------------- 山、矿、广场 ---------------- */
export function drawMountain(x,y,t,tw,se){
  const s=tw*(0.75+t.v*0.55),A=[x+tw*0.08*(t.v-0.5),y-s],B=[A[0],y+tw*0.12],BL=[x-tw*0.48,y+tw*0.05],BR=[x+tw*0.48,y+tw*0.05];
  let g=ctx.createLinearGradient(A[0],A[1],BL[0],BL[1]);g.addColorStop(0,'#c9ccbd');g.addColorStop(0.75,'#a6aa94');g.addColorStop(1,'#8f9a72');
  poly(g,...BL,...A,...B);
  g=ctx.createLinearGradient(A[0],A[1],BR[0],BR[1]);g.addColorStop(0,'#8e9282');g.addColorStop(0.75,'#747968');g.addColorStop(1,'#66704f');
  poly(g,...A,...BR,...B);
  ctx.lineCap='round';
  const sd=t.v*10;
  for(let k=0;k<2;k++){const p0=lerp(A,lerp(BL,B,0.3+k*0.35),0.35+hash(sd,k)*0.15),p1=lerp(A,lerp(BL,B,0.2+k*0.35),0.7);line('rgba(70,72,60,.22)',Math.max(0.6,tw*0.014),...p0,...p1);}
  line('rgba(40,44,34,.18)',Math.max(0.6,tw*0.014),...lerp(A,lerp(B,BR,0.5),0.4),...lerp(A,lerp(B,BR,0.4),0.75));
  const f=(se===3?0.5:0.27)+t.v*0.04,PL=lerp(A,BL,f),PC=lerp(A,B,f*0.92),PR=lerp(A,BR,f),j=s*0.05;
  const m1=lerp(PL,PC,0.33),m2=lerp(PL,PC,0.66),n1=lerp(PC,PR,0.33),n2=lerp(PC,PR,0.66);
  poly('#f6f6f0',...A,...PL,m1[0],m1[1]-j,m2[0],m2[1]+j*0.5,...PC);
  poly('#d3d9de',...A,...PC,n1[0],n1[1]-j*0.6,n2[0],n2[1]+j*0.4,...PR);
}
export function drawMine(x,y,tw){
  groundShadow(x,y,tw*0.34,tw*0.1,0.2);
  poly('#9a7f62',x-tw*0.34,y+tw*0.04,x-tw*0.06,y-tw*0.36,x-tw*0.02,y+tw*0.06);
  poly('#7a634b',x-tw*0.06,y-tw*0.36,x+tw*0.26,y+tw*0.02,x-tw*0.02,y+tw*0.06);
  for(let k=0;k<4;k++)dot(k%2?'#6c5640':'#a68c6d',x-tw*(0.25-k*0.12),y-tw*(0.02+hash(k,4)*0.08),tw*0.02);
  ctx.fillStyle='#231e1a';ctx.beginPath();ctx.ellipse(x-tw*0.05,y,tw*0.09,tw*0.13,0,Math.PI,0);ctx.fill();
  ctx.fillStyle='#7a5a3a';
  ctx.fillRect(x-tw*0.15,y-tw*0.13,tw*0.025,tw*0.14);ctx.fillRect(x+tw*0.035,y-tw*0.13,tw*0.025,tw*0.14);
  ctx.fillRect(x-tw*0.17,y-tw*0.15,tw*0.25,tw*0.03);
  ctx.lineCap='butt';
  line('#6b5a48',Math.max(0.6,tw*0.012),x-tw*0.08,y+tw*0.01,x+tw*0.2,y+tw*0.14);
  line('#6b5a48',Math.max(0.6,tw*0.012),x-tw*0.01,y+tw*0.0,x+tw*0.26,y+tw*0.11);
  poly('#5d4a3a',x+tw*0.1,y+tw*0.04,x+tw*0.24,y+tw*0.0,x+tw*0.22,y+tw*0.09,x+tw*0.12,y+tw*0.12);
  for(let k=0;k<4;k++)dot(k===2?'#e2c46a':'#9aa0ad',x+tw*(0.13+k*0.03),y+tw*(0.02-((k%2)*0.015)),tw*0.022);
}
export function drawFountain(x,y,tw,T){
  const rx=tw*0.14,ry=tw*0.07;
  groundShadow(x,y,rx*1.05,ry*1.05,0.15);
  ell('#8f8774',x,y+tw*0.02,rx,ry);
  ctx.fillStyle='#8f8774';ctx.fillRect(x-rx,y-tw*0.01,rx*2,tw*0.03);
  ell('#c3bba6',x,y-tw*0.01,rx,ry);
  ell('#5f97ae',x,y-tw*0.008,rx*0.78,ry*0.72);
  const ph=(T*0.6)%1;
  ctx.strokeStyle=`rgba(255,255,255,${(0.6*(1-ph)).toFixed(3)})`;ctx.lineWidth=Math.max(0.5,tw*0.01);
  ctx.beginPath();ctx.ellipse(x,y-tw*0.008,rx*0.2+rx*0.5*ph,ry*0.2+ry*0.48*ph,0,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#b3ab96';ctx.fillRect(x-tw*0.012,y-tw*0.08,tw*0.024,tw*0.07);
  for(let k=0;k<4;k++){const a=k/4*Math.PI*2+T*0.5,q=(T*1.2+k*0.25)%1;dot('rgba(220,240,250,.85)',x+Math.cos(a)*rx*0.4*q,y-tw*0.085+tw*0.08*q*q-tw*0.03*Math.sin(q*Math.PI),Math.max(0.5,tw*0.012));}
}

/* ---------------- 建筑 ---------------- */
export function drawBuilding(t,x,y,tw,o){
  const s=tw*0.42,{T,se,dark,glow}=o;
  if(t.bld==='granary'){
    const r=s*0.34,h=s*0.8;
    groundShadow(x,y,s*0.5,s*0.2,0.2);
    const g=ctx.createLinearGradient(x-r,0,x+r,0);g.addColorStop(0,'#f2e5c4');g.addColorStop(0.55,'#dccaa0');g.addColorStop(1,'#b09a6e');
    ctx.fillStyle=g;ctx.fillRect(x-r,y-h,r*2,h);ctx.beginPath();ctx.ellipse(x,y,r,r*0.45,0,0,Math.PI);ctx.fill();
    ctx.strokeStyle='rgba(110,80,40,.45)';ctx.lineWidth=Math.max(0.6,s*0.035);
    for(const f of [0.3,0.62]){ctx.beginPath();ctx.ellipse(x,y-h*f,r,r*0.45,0,0,Math.PI);ctx.stroke();}
    ctx.fillStyle='#6b5240';rrect(x-r*0.28,y-h*0.5,r*0.56,h*0.5+r*0.44,r*0.12);ctx.fill();
    ell('#7c5229',x,y-h+s*0.02,r*1.22,r*0.52);
    poly(se===3?'#f2f3ee':'#c08646',x-r*1.22,y-h,x,y-h-s*0.58,x,y-h+r*0.52);
    poly(se===3?'#d7dde2':'#8a5a2c',x,y-h-s*0.58,x+r*1.22,y-h,x,y-h+r*0.52);
    dot('#6b4a30',x,y-h-s*0.6,s*0.04);
  }else if(t.bld==='well'){
    groundShadow(x,y-s*0.08,s*0.34,s*0.14,0.2);
    ctx.fillStyle='#958d7b';ctx.fillRect(x-s*0.3,y-s*0.22,s*0.6,s*0.14);ell('#958d7b',x,y-s*0.08,s*0.3,s*0.14);
    ctx.strokeStyle='rgba(60,55,45,.3)';ctx.lineWidth=Math.max(0.5,s*0.02);ctx.beginPath();
    for(let k=-2;k<=2;k++){ctx.moveTo(x+k*s*0.12,y-s*0.21);ctx.lineTo(x+k*s*0.12,y-s*0.15);ctx.moveTo(x+k*s*0.12+s*0.06,y-s*0.15);ctx.lineTo(x+k*s*0.12+s*0.06,y-s*0.08);}
    ctx.stroke();
    ell('#bdb6a5',x,y-s*0.22,s*0.3,s*0.13);ell('#2f5c70',x,y-s*0.22,s*0.21,s*0.085);
    ell('rgba(255,255,255,.35)',x-s*0.05,y-s*0.24,s*0.07,s*0.025);
    ctx.fillStyle='#6b4a30';ctx.fillRect(x-s*0.27,y-s*0.78,s*0.05,s*0.6);ctx.fillRect(x+s*0.22,y-s*0.78,s*0.05,s*0.6);
    line('#5b4030',Math.max(0.6,s*0.03),x-s*0.24,y-s*0.6,x+s*0.24,y-s*0.6);
    line('#cdb898',Math.max(0.4,s*0.012),x,y-s*0.6,x,y-s*0.42);
    ctx.fillStyle='#8a5a32';ctx.fillRect(x-s*0.045,y-s*0.44,s*0.09,s*0.08);
    poly(se===3?'#f4f5f1':'#9a5236',x-s*0.42,y-s*0.72,x,y-s*1.04,x,y-s*0.66);
    poly(se===3?'#d8dee2':'#7a3d27',x,y-s*1.04,x+s*0.42,y-s*0.72,x,y-s*0.66);
  }else if(t.bld==='market'){
    const w=drawHouse(x+s*0.12,y-s*0.06,s*0.9,'#c8503f','#f0dfb8',{T,seed:hash(t.i,t.j),se,dark});
    if(glow)glow.push([w[0],w[1],s*0.9]);
    // 摊位与条纹遮阳篷
    const sx=x-s*0.42,sy=y+s*0.12;
    groundShadow(sx,sy,s*0.26,s*0.1,0.15);
    poly('#a7744a',sx-s*0.24,sy-s*0.18,sx,sy-s*0.06,sx+s*0.24,sy-s*0.18,sx,sy-s*0.3);
    poly('#7c5534',sx-s*0.24,sy-s*0.18,sx,sy-s*0.06,sx,sy,sx-s*0.24,sy-s*0.12);
    poly('#6a482c',sx,sy-s*0.06,sx+s*0.24,sy-s*0.18,sx+s*0.24,sy-s*0.12,sx,sy);
    for(let k=0;k<5;k++)dot(['#e0b13a','#d8473a','#7fa646','#e6893a','#d8473a'][k],sx+(k-2)*s*0.07,sy-s*0.18+Math.abs(k-2)*s*0.02-s*0.02,s*0.035);
    ctx.fillStyle='#6b4a30';ctx.fillRect(sx-s*0.25,sy-s*0.52,s*0.025,s*0.38);ctx.fillRect(sx+s*0.225,sy-s*0.52,s*0.025,s*0.38);
    for(let k=0;k<4;k++){const a=k/4,b=(k+1)/4,L=[sx-s*0.3,sy-s*0.5],R=[sx+s*0.3,sy-s*0.5],L2=[sx-s*0.3,sy-s*0.36],R2=[sx+s*0.3,sy-s*0.36];
      const p=lerp(L,R,a),q=lerp(L,R,b),p2=lerp(L2,R2,a),q2=lerp(L2,R2,b);poly(k%2?'#f6efe0':'#d24a3a',...p,...q,q2[0],q2[1]+s*0.015*Math.sin(T*2+k),p2[0],p2[1]+s*0.015*Math.sin(T*2+k-1));}
    ctx.fillStyle='#6b4a30';ctx.fillRect(x+s*0.52,y-s*1.32,s*0.04,s*1.06);
    const wv=Math.sin(T*3)*s*0.04;
    poly('#e2ad2f',x+s*0.56,y-s*1.32,x+s*0.88,y-s*1.2+wv,x+s*0.56,y-s*1.07);
  }else if(t.bld==='teahouse'){
    const w=drawHouse(x,y,s*1.05,'#2f5f4f','#efe6d0',{T,seed:hash(t.i,t.j),se,dark});
    if(glow)glow.push([w[0],w[1],s]);
    const hw=s*1.05/2,H=s*1.05*0.5;
    for(const sx of [-1,1]){
      const lx=x+sx*hw*0.98,ly=y-H+s*0.05,sw=Math.sin(T*1.6+sx)*s*0.02;
      line('#4a3a2a',Math.max(0.5,s*0.015),lx,ly-s*0.05,lx+sw,ly+s*0.06);
      ell('#d8473a',lx+sw,ly+s*0.12,s*0.075,s*0.095);
      ctx.fillStyle='#e2ad2f';ctx.fillRect(lx+sw-s*0.04,ly+s*0.02,s*0.08,s*0.02);ctx.fillRect(lx+sw-s*0.04,ly+s*0.2,s*0.08,s*0.02);
      if(glow)glow.push([lx+sw,ly+s*0.12,s*0.55,'#ff8a5a']);
    }
    // 茶旗
    const fx=x-hw*1.2,fy=y-s*0.05;
    ctx.fillStyle='#6b4a30';ctx.fillRect(fx,fy-s*0.95,s*0.035,s*0.95);
    const wv=Math.sin(T*2.2)*s*0.03;
    poly('#f3ead2',fx+s*0.035,fy-s*0.92,fx+s*0.24,fy-s*0.9+wv,fx+s*0.24,fy-s*0.55+wv,fx+s*0.035,fy-s*0.57);
    ctx.fillStyle='#2f5f4f';ctx.fillRect(fx+s*0.1,fy-s*0.82+wv*0.5,s*0.07,s*0.18);
  }
}

/* ---------------- 居民 ---------------- */
// Draws a villager standing at (x,y) feet position, s = body scale.
export function drawPerson(p,x,y,s,o){
  const {T=0,moving=false}=o||{},job=JOBS[p.job]||JOBS.farmer;
  const base=p.fed<0.7?mix(job.c,'#888888',0.5):job.c,ph=T*9+p.id*1.7,step=moving?Math.sin(ph):0,bob=moving?Math.abs(Math.cos(ph))*s*0.05:0;
  const elder=p.age>=55*YEAR,hair=elder?'#d6d2c8':p.hair,fem=p.gender==='女',kid=p.job==='child';
  ell('rgba(20,30,10,.24)',x,y,s*0.3,s*0.11);
  // 腿
  ctx.lineCap='round';
  const legC=kid?'#6a5244':'#43382f',hip=y-s*0.36-bob,lw=Math.max(1,s*0.11);
  line(legC,lw,x-s*0.07,hip,x-s*0.07+step*s*0.09,y-s*0.05);
  line(legC,lw,x+s*0.07,hip,x+s*0.07-step*s*0.09,y-s*0.05);
  // 长发（在身体后面）
  const hy=y-s*1.12-bob,r=s*0.2;
  if(fem&&!kid){ctx.fillStyle=hair;rrect(x-r*1.02,hy-r*0.4,r*2.04,r*1.65,r*0.6);ctx.fill();}
  // 身体
  const yt=y-s*0.93-bob,yh=y-s*0.3-bob,g=ctx.createLinearGradient(x-s*0.23,0,x+s*0.23,0);
  g.addColorStop(0,shade(base,0.1));g.addColorStop(0.55,base);g.addColorStop(1,shade(base,-0.22));
  ctx.fillStyle=g;ctx.beginPath();
  ctx.moveTo(x-s*0.17,yt+s*0.07);ctx.quadraticCurveTo(x-s*0.17,yt,x-s*0.08,yt);ctx.lineTo(x+s*0.08,yt);ctx.quadraticCurveTo(x+s*0.17,yt,x+s*0.17,yt+s*0.07);
  ctx.lineTo(x+s*(fem?0.25:0.21),yh);ctx.lineTo(x-s*(fem?0.25:0.21),yh);ctx.closePath();ctx.fill();
  if(!kid){ctx.fillStyle=shade(base,-0.38);ctx.fillRect(x-s*0.19,y-s*0.56-bob,s*0.38,Math.max(0.6,s*0.05));}
  // 手臂
  const aw=Math.max(0.9,s*0.085),sh=yt+s*0.09,arm=shade(base,-0.1);
  const lh=[x-s*0.22-step*s*0.07,yt+s*0.43],rh=[x+s*0.22+step*s*0.07,yt+s*0.43];
  line(arm,aw,x-s*0.16,sh,...lh);line(shade(base,-0.25),aw,x+s*0.16,sh,...rh);
  dot(p.skin,...lh,s*0.05);dot(p.skin,...rh,s*0.05);
  // 职业道具
  if(p.job==='woodcutter'){line('#7a5a3a',Math.max(0.7,s*0.045),rh[0],rh[1]+s*0.04,rh[0]+s*0.14,rh[1]-s*0.45);poly('#9aa0ad',rh[0]+s*0.1,rh[1]-s*0.42,rh[0]+s*0.26,rh[1]-s*0.5,rh[0]+s*0.24,rh[1]-s*0.32);}
  else if(p.job==='fisher'){line('#8a6a45',Math.max(0.6,s*0.035),rh[0],rh[1],rh[0]+s*0.38,rh[1]-s*0.95);line('rgba(240,240,240,.7)',Math.max(0.4,s*0.015),rh[0]+s*0.38,rh[1]-s*0.95,rh[0]+s*0.44,rh[1]-s*0.25);}
  else if(p.job==='elder'){line('#7a5a3a',Math.max(0.7,s*0.05),rh[0],rh[1],rh[0]+s*0.06,y-s*0.02);}
  else if(p.job==='craftsman'){line('#7a5a3a',Math.max(0.6,s*0.04),rh[0],rh[1],rh[0]+s*0.1,rh[1]-s*0.2);ctx.fillStyle='#5d6070';ctx.fillRect(rh[0]+s*0.03,rh[1]-s*0.27,s*0.14,s*0.08);}
  else if(p.job==='merchant'){ctx.fillStyle='#e2ad2f';ctx.beginPath();ctx.ellipse(lh[0],lh[1]+s*0.06,s*0.07,s*0.08,0,0,Math.PI*2);ctx.fill();}
  // 头
  dot(p.skin,x,hy,r);
  ctx.fillStyle=hair;ctx.beginPath();ctx.arc(x,hy-r*0.12,r*1.02,Math.PI*1.02,Math.PI*1.98);ctx.closePath();ctx.fill();
  if(fem&&!kid)dot(hair,x+r*0.15,hy-r*1.05,r*0.45);
  if(kid){dot(hair,x-r*0.85,hy-r*0.75,r*0.38);dot(hair,x+r*0.85,hy-r*0.75,r*0.38);}
  if(s>13){const er=Math.max(0.5,r*0.11);dot('#2c2420',x-r*0.36,hy+r*0.18,er);dot('#2c2420',x+r*0.36,hy+r*0.18,er);if(kid||p.happiness>=60){dot('rgba(230,120,110,.35)',x-r*0.6,hy+r*0.45,r*0.17);dot('rgba(230,120,110,.35)',x+r*0.6,hy+r*0.45,r*0.17);}}
  // 帽子
  if(p.job==='farmer'){poly('#e1c174',x-r*1.7,hy-r*0.3,x,hy-r*1.55,x+r*1.7,hy-r*0.3);poly('#bf9a4d',x,hy-r*1.55,x+r*1.7,hy-r*0.3,x,hy-r*0.12);line('rgba(120,90,40,.5)',Math.max(0.4,r*0.08),x-r*1.7,hy-r*0.3,x+r*1.7,hy-r*0.3);}
  else if(p.job==='miner'){ctx.fillStyle='#e0b23a';ctx.beginPath();ctx.arc(x,hy-r*0.15,r*1.12,Math.PI,0);ctx.closePath();ctx.fill();ctx.fillRect(x-r*1.3,hy-r*0.2,r*2.6,r*0.25);dot('#fff7d6',x,hy-r*0.7,r*0.3);}
  else if(p.job==='merchant'){ctx.fillStyle='#2f2a36';ctx.beginPath();ctx.arc(x,hy-r*0.3,r*0.95,Math.PI,0);ctx.closePath();ctx.fill();dot('#d8473a',x,hy-r*1.28,r*0.22);}
  else if(p.job==='fisher'){ctx.fillStyle='#2f6d8a';ctx.beginPath();ctx.ellipse(x,hy-r*0.5,r*1.1,r*0.55,0,Math.PI,0);ctx.closePath();ctx.fill();}
  else if(p.job==='craftsman'){ctx.fillStyle='#f1e8d6';ctx.fillRect(x-r*1.02,hy-r*0.5,r*2.04,r*0.3);}
  else if(p.job==='woodcutter'){ctx.fillStyle='#a8463a';ctx.fillRect(x-r*1.02,hy-r*0.55,r*2.04,r*0.28);}
}
export function drawSparkle(x,y,r,T){
  const a=T*1.5,k=1+Math.sin(T*4)*0.15,R=r*k;
  ctx.save();ctx.translate(x,y);ctx.rotate(a*0.3);
  const g=ctx.createRadialGradient(0,0,0,0,0,R*2.2);g.addColorStop(0,'rgba(255,214,100,.55)');g.addColorStop(1,'rgba(255,214,100,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,R*2.2,0,Math.PI*2);ctx.fill();
  ctx.beginPath();
  for(let i=0;i<8;i++){const ang=i*Math.PI/4,rr=i%2?R*0.38:R*1.4;ctx.lineTo(Math.cos(ang)*rr,Math.sin(ang)*rr);}
  ctx.closePath();ctx.fillStyle='#f2c13d';ctx.fill();ctx.strokeStyle='#b8862a';ctx.lineWidth=Math.max(0.5,R*0.12);ctx.stroke();
  ctx.restore();
}

/* ---------------- 光照与天气 ---------------- */
export function drawGlows(list){
  for(const [x,y,r,c] of list){
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,rgba(c||'#ffcf7a',0.55));g.addColorStop(1,rgba(c||'#ffcf7a',0));
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    dot(rgba(c||'#ffe2a0',0.9),x,y,Math.max(0.8,r*0.08));
  }
}
export function drawWeather(w,h,o){
  const {se,T,dark,dry}=o;
  if(se===3){
    for(let k=0;k<90;k++){
      const a=hash(k,11),b=hash(k,13),c=hash(k,17),sp=14+c*26;
      const y=((b*(h+20)+T*sp)%(h+20))-10,x=((a*(w+40)+Math.sin(T*0.7+k)*14+T*5)%(w+40)+w+40)%(w+40)-20;
      dot(dark?'rgba(220,230,240,.75)':'rgba(255,255,255,.92)',x,y,0.8+c*1.7);
    }
  }else if(se===2||se===0){
    const n=se===2?22:18,cols=se===2?AUTUMN:['#f6c4d2','#fbe3ea','#f2a9c0'];
    for(let k=0;k<n;k++){
      const a=hash(k,21),b=hash(k,23),c=hash(k,27),sp=12+c*16;
      const y=((b*(h+20)+T*sp)%(h+20))-10,x=((a*(w+40)+Math.sin(T*0.9+k)*24+T*10)%(w+40)+w+40)%(w+40)-20;
      ctx.save();ctx.translate(x,y);ctx.rotate(T*(1+c)+k);ctx.fillStyle=cols[k%cols.length];
      ctx.globalAlpha=0.85;ctx.beginPath();ctx.ellipse(0,0,2.6+c*1.6,1.3+c*0.6,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }else if(dark){
    for(let k=0;k<26;k++){
      const a=hash(k,31),b=hash(k,37),bl=Math.max(0,Math.sin(T*1.7+k*2.3));
      const x=a*w+Math.sin(T*0.5+k)*18,y=b*h+Math.cos(T*0.4+k*1.3)*12;
      const g=ctx.createRadialGradient(x,y,0,x,y,7);g.addColorStop(0,`rgba(230,240,140,${(0.7*bl).toFixed(3)})`);g.addColorStop(1,'rgba(230,240,140,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();
    }
  }
  if(dry){ctx.fillStyle='rgba(235,170,80,.09)';ctx.fillRect(0,0,w,h);}
}
export function drawVignette(w,h,dark){
  const g=ctx.createRadialGradient(w/2,h*0.48,Math.min(w,h)*0.35,w/2,h/2,Math.hypot(w,h)*0.6);
  g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,dark?'rgba(0,0,0,.35)':'rgba(40,60,50,.14)');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
}
