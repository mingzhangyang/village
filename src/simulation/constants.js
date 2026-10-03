// Existing simulation and UI constants.
export const JOBS={
  farmer:{n:'农夫',c:'#c99a2e'},
  fisher:{n:'渔民',c:'#3f86ad'},
  woodcutter:{n:'樵夫',c:'#4f7d3a'},
  craftsman:{n:'工匠',c:'#b0643d'},
  merchant:{n:'商人',c:'#8656a6'},
  miner:{n:'矿工',c:'#5d6070'},
  child:{n:'孩童',c:'#e3928f'},
  elder:{n:'长者',c:'#9a968a'}
};
export const TRAITS=['勤劳','乐天','内向','好客','节俭','体弱','好学','急躁'];
export const SURN='林陈周吴许沈苏何叶江方余顾唐宋程谢韩温秦'.split('');
export const GIVEN='禾溪松竹青安远明宁平秋春雨山石桐柳芸岚舟川麦穗晴望归野星原澄蘅'.split('');
export const SKIN=['#f1c9a5','#e6b48c','#d9a074','#c98d62'];
export const HAIR=['#2f2620','#4a3426','#1f1c1a','#6b4a2e','#3b2f2a'];
export const POLICIES={
  need:'粮食不够时，先保障孩童、老人和病弱者；买不起粮的人由公库垫付。公库每十日接济最穷的四分之一。',
  equal:'粮食不够时人人减量、同样一份；买不起粮的人由公库垫付。公库每十日把三成积蓄平分给每个人。',
  work:'粮食不够时，劳动者按贡献优先领粮。公库每十日按收入多少返还给劳动者。',
  market:'粮食价高者得，买不起就挨饿，公库不接济个人。富人无忧，穷人在饥荒中最先受苦。'
};

/* ---------------- 地图 ---------------- */
