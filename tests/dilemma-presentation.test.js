import { describe, expect, it } from 'vitest';
import { createDilemmaPresentation, pendingDilemmaIsValid, shouldAutoDeferDilemma } from '../src/ui/dilemma-presentation.js';

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

  it('expires unresolved work through the dilemma lifecycle contract without touching completed results',()=>{
    const dilemmas={sick:{valid:d=>d.patientAlive},plain:{}};
    expect(pendingDilemmaIsValid({k:'sick',d:{patientAlive:true},res:null},dilemmas)).toBe(true);
    expect(pendingDilemmaIsValid({k:'sick',d:{patientAlive:false},res:null},dilemmas)).toBe(false);
    expect(pendingDilemmaIsValid({k:'sick',d:{patientAlive:false},res:'already decided'},dilemmas)).toBe(true);
    expect(pendingDilemmaIsValid({k:'plain',d:{},res:null},dilemmas)).toBe(true);
    expect(pendingDilemmaIsValid({k:'missing',d:{},res:null},dilemmas)).toBe(false);
  });

  it('can invalidate captured entity relationships after the world changes',()=>{
    let petitioner={village:'grain'};
    const dilemmas={taxcut:{valid:d=>!!petitioner&&petitioner.village===d.v}};
    const pending={k:'taxcut',d:{p:7,v:'grain'},res:null};

    expect(pendingDilemmaIsValid(pending,dilemmas)).toBe(true);
    petitioner={...petitioner,village:'bay'};
    expect(pendingDilemmaIsValid(pending,dilemmas)).toBe(false);
  });

  it('treats failing validators as stale instead of allowing a renderer crash',()=>{
    expect(pendingDilemmaIsValid({k:'broken',d:{},res:null},{broken:{valid(){throw new Error('stale');}}})).toBe(false);
  });

  it('auto-defers new dilemmas only at the fast 10x pace',()=>{
    expect(shouldAutoDeferDilemma(1)).toBe(false);
    expect(shouldAutoDeferDilemma(3)).toBe(false);
    expect(shouldAutoDeferDilemma(10)).toBe(true);
  });
});
