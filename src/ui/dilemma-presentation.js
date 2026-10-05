export function shouldAutoDeferDilemma(speed){
  return Number(speed)>=10;
}

export function createDilemmaPresentation(){
  let deferred=false;

  return {
    present({deferred:nextDeferred=false}={}){deferred=!!nextDeferred;},
    defer(){deferred=true;},
    reopen(){deferred=false;},
    clear(){deferred=false;},
    restore(pending){deferred=!!pending;},
    isDeferred(){return deferred;},
    blocksSimulation(pending){return !!pending&&!deferred;}
  };
}
