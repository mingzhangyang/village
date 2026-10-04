// Pure keyboard navigation for the isometric map.
// Arrow keys move along one real grid axis at a time, so navigation is not trapped on one checkerboard parity.
export const KEYBOARD_DIRECTIONS=Object.freeze({
  ArrowUp:[-1,0],
  ArrowDown:[1,0],
  ArrowLeft:[0,1],
  ArrowRight:[0,-1],
});

export function moveKeyboardTile(map,from,key,isVisible=t=>!!t,maxSteps=6){
  const step=KEYBOARD_DIRECTIONS[key];
  if(!from||!step)return from||null;
  for(let k=1;k<=maxSteps;k++){
    const t=map.at(from.i+step[0]*k,from.j+step[1]*k);
    if(isVisible(t))return t;
  }
  return from;
}

// Keyboard activation is tile-exact: never borrow the pointer hit-test radius.
export function peopleOnKeyboardTile(people,tile){
  if(!tile)return [];
  return people.filter(p=>Math.round(p.x)===tile.i&&Math.round(p.y)===tile.j);
}
