import { describe, expect, it } from 'vitest';
import { createDilemmaPresentation, shouldAutoDeferDilemma } from '../src/ui/dilemma-presentation.js';

describe('dilemma presentation ownership',()=>{
  it('releases simulation blocking when a dilemma is deferred and reacquires it when reopened',()=>{
    const presentation=createDilemmaPresentation(),pending={k:'mine',d:{},res:null};
    presentation.present();
    expect(presentation.blocksSimulation(pending)).toBe(true);
    presentation.defer();
    expect(presentation.isDeferred()).toBe(true);
    expect(presentation.blocksSimulation(pending)).toBe(false);
    presentation.reopen();
    expect(presentation.blocksSimulation(pending)).toBe(true);
  });

  it('restores persisted pending work as deferred instead of freezing a loaded world',()=>{
    const presentation=createDilemmaPresentation(),pending={k:'mine',d:{},res:null};
    presentation.restore(pending);
    expect(presentation.isDeferred()).toBe(true);
    expect(presentation.blocksSimulation(pending)).toBe(false);
    presentation.restore(null);
    expect(presentation.blocksSimulation(null)).toBe(false);
  });

  it('auto-defers new dilemmas only at the fast 10x pace',()=>{
    expect(shouldAutoDeferDilemma(1)).toBe(false);
    expect(shouldAutoDeferDilemma(3)).toBe(false);
    expect(shouldAutoDeferDilemma(10)).toBe(true);
  });
});
