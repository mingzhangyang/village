// Shared persistence limits and lifecycle markers for simulation state.
export const MAX_PERSON_NAME_LENGTH = 100;
export const MAX_CHRON_ENTRIES = 120;
export const MAX_PERSON_HISTORY_ENTRIES = 60;
export const MAX_STAT_HISTORY_ENTRIES = 90;

export const CHRONICLE_KINDS = Object.freeze(['info','event','birth','death','bond','leave','choice']);
const CHRONICLE_KIND_SET = new Set(CHRONICLE_KINDS);

export function normalizeChronicleKind(value){
  return typeof value==='string'&&CHRONICLE_KIND_SET.has(value)?value:'info';
}

export function normalizeChronicleEntry(value,fallbackDay=0){
  const entry=value&&typeof value==='object'?value:{};
  const safeFallback=Number.isFinite(fallbackDay)?Math.max(0,Math.floor(fallbackDay)):0;
  const day=Number.isFinite(entry.d)?Math.max(0,Math.floor(entry.d)):safeFallback;
  return {
    d:day,
    t:typeof entry.t==='string'?entry.t:'',
    k:normalizeChronicleKind(entry.k)
  };
}

export const ONBOARDING_VERSION = 2;
export const ONBOARDING_STEP_NAME = 0;
export const ONBOARDING_STEP_GUIDE = 1;
export const ONBOARDING_STEP_DONE = 2;

const clampOnboardingStep=step=>{
  const value=Number.isFinite(step)?Math.floor(step):ONBOARDING_STEP_NAME;
  return Math.min(ONBOARDING_STEP_DONE,Math.max(ONBOARDING_STEP_NAME,value));
};

export function freshOnboarding(){
  return {version:ONBOARDING_VERSION,step:ONBOARDING_STEP_NAME};
}

export function normalizeOnboarding(value,{legacyComplete=false}={}){
  if(!value||typeof value!=='object'||value.version!==ONBOARDING_VERSION){
    return {version:ONBOARDING_VERSION,step:legacyComplete?ONBOARDING_STEP_DONE:ONBOARDING_STEP_NAME};
  }
  return {version:ONBOARDING_VERSION,step:clampOnboardingStep(value.step)};
}

export function setOnboardingStep(state,step){
  state.onboarding={version:ONBOARDING_VERSION,step:clampOnboardingStep(step)};
  return state.onboarding;
}

export function onboardingComplete(state){
  return !!state&&state.onboarding&&state.onboarding.version===ONBOARDING_VERSION
    && state.onboarding.step>=ONBOARDING_STEP_DONE;
}
