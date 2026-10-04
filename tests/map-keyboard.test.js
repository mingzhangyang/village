import { describe, expect, it } from 'vitest';
import { KEYBOARD_DIRECTIONS, moveKeyboardTile } from '../src/ui/map-keyboard.js';

describe('keyboard map navigation', () => {
  const openMap={at:(i,j)=>({i,j})};

  it('uses one real grid axis per arrow so every move can cross checkerboard parity', () => {
    const start={i:10,j:10};
    const expected={
      ArrowUp:{i:9,j:10},
      ArrowDown:{i:11,j:10},
      ArrowLeft:{i:10,j:11},
      ArrowRight:{i:10,j:9},
    };
    for(const key of Object.keys(KEYBOARD_DIRECTIONS)){
      const next=moveKeyboardTile(openMap,start,key);
      expect(next).toEqual(expected[key]);
      expect((next.i+next.j)%2).not.toBe((start.i+start.j)%2);
    }
  });

  it('skips hidden or missing tiles without changing the navigation axis', () => {
    const map={at:(i,j)=>i===9?{i,j,hidden:true}:i===8?{i,j}:null};
    const start={i:10,j:4};
    const next=moveKeyboardTile(map,start,'ArrowUp',t=>t&&!t.hidden);
    expect(next).toEqual({i:8,j:4});
  });

  it('stays put when no visible tile exists in that direction', () => {
    const start={i:10,j:10};
    expect(moveKeyboardTile({at:()=>null},start,'ArrowLeft')).toBe(start);
  });
});
