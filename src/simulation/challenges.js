import { adjustResidentHappiness } from './invariants.js';

export const CHALLENGE_DEADLINES = Object.freeze({
  drought: 120,
  equal: 400,
  grow: 600,
  stay: 320,
});

export function challengeDeadlineReached(id, elapsedDays) {
  const deadline = CHALLENGE_DEADLINES[id];
  return Number.isFinite(deadline) && elapsedDays >= deadline;
}

function shuffle(values, rand) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(rand(0, index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createChallenges({ getState, YEAR, SEASON, clamp, rand, chron }) {
  return {

  drought:{n:'熬过三年大旱',d:'接下来三年，每年夏季都会遭遇十天大旱，粮仓只剩 60 担。三年里不能有一个人饿死，人口也不能少于 26 人。',
    setup(){const S=getState();S.food=60;S.drought=0;},
    tick(){const S=getState();if(S.day-S.ch.start<120&&S.day%YEAR===SEASON&&S.drought===0){S.drought=SEASON+1;chron('又一个旱季来了，溪水一天天变浅。','event');}},
    check(c,el){const S=getState();
      if(S.hungerDeaths>c.hd0)return {st:'lose',why:`${S.lastHunger}在饥荒中饿死了。`};
      if(S.people.length<26)return {st:'lose',why:`溪谷只剩 ${S.people.length} 人，少于 26 人。`};
      if(challengeDeadlineReached('drought',el))return {st:'win',why:`三年过去，溪谷没有一个人饿死，最后还有 ${S.people.length} 人。`};
      return {st:'run',txt:`还剩 ${120-el} 天。饿死 0 人，人口 ${S.people.length}（不少于 26）。`,pct:el/120};}},
  equal:{n:'均富之岛',d:'几户人家握着溪谷大半的财富，其余的人勉强度日。十年内，让贫富差距低于 0.35、平均幸福不低于 65，并连续保持 30 天。',
    setup(){const S=getState();
      const ad=shuffle(S.people.filter(p=>p.job!=='child'),rand);
      ad.forEach((p,k)=>{p.wealth=k<4?rand(200,280):rand(2,8);});
      S.tax=0.08;S.policy='market';},
    check(c,el){const S=getState();
      const n=S.people.length||1,h=S.people.reduce((t,p)=>t+p.happiness,0)/n;
      if(S.gini<0.35&&h>=65)c.hold++;else c.hold=0;
      if(c.hold>=30)return {st:'win',why:`贫富差距降到 ${S.gini.toFixed(2)}，平均幸福 ${Math.round(h)}，溪谷成了一座均富之岛。`};
      if(challengeDeadlineReached('equal',el))return {st:'lose',why:`十年到了。贫富差距 ${S.gini.toFixed(2)}，平均幸福 ${Math.round(h)}。`};
      return {st:'run',txt:`贫富差距 ${S.gini.toFixed(2)}（要低于 0.35），平均幸福 ${Math.round(h)}（要到 65），已保持 ${c.hold}/30 天，剩 ${Math.ceil((400-el)/YEAR)} 年。`,pct:Math.max(c.hold/30,0.02)};}},
  grow:{n:'人丁兴旺',d:'十五年内，让溪谷的人口达到 55 人。这次不能招募移民，只能靠一家家人生儿育女。',
    check(c,el){const S=getState();
      const n=S.people.length;
      if(n>=55)return {st:'win',why:`第 ${Math.floor(el/YEAR)+1} 年，溪谷的人口达到了 ${n} 人。`};
      if(challengeDeadlineReached('grow',el)||!n)return {st:'lose',why:`十五年到了，溪谷有 ${n} 人。`};
      return {st:'run',txt:`人口 ${n}/55，剩 ${Math.ceil((600-el)/YEAR)} 年。`,pct:n/55};}},
  stay:{n:'无人离去',d:'税率 30%、自由市场，人心浮动。八年里不能有一个人离开溪谷，到期时凝聚力不能低于 50。',
    setup(){const S=getState();S.tax=0.3;S.policy='market';S.cohesion=40;S.people.forEach(p=>adjustResidentHappiness(p,-12));},
    check(c,el){const S=getState();
      if(S.left>c.left0)return {st:'lose',why:`${S.lastLeft}离开了溪谷。`};
      if(challengeDeadlineReached('stay',el))return Math.round(S.cohesion)>=50?{st:'win',why:`八年里没有一个人离开，凝聚力达到 ${Math.round(S.cohesion)}。`}:{st:'lose',why:`八年里没人离开，但凝聚力只有 ${Math.round(S.cohesion)}，不到 50。`};
      return {st:'run',txt:`还剩 ${Math.ceil((320-el)/YEAR)} 年。离开 0 人，凝聚力 ${Math.round(S.cohesion)}（到期时要到 50）。`,pct:el/320};}}
};
}
