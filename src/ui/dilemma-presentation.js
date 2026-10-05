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

export function pendingDilemmaIsValid(pending,dilemmas){
  if(!pending)return true;
  const dilemma=dilemmas&&dilemmas[pending.k];
  if(!dilemma)return false;
  if(pending.res!=null)return true;
  if(typeof dilemma.valid!=='function')return true;
  try{return !!dilemma.valid(pending.d);}catch{return false;}
}
