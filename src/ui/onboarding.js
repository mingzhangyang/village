export async function withTemporaryPause(state,work){
  const previous=!!state.paused;
  state.paused=true;
  try{
    return await work();
  }finally{
    state.paused=previous;
  }
}
