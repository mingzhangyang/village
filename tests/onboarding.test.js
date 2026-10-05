import { describe, expect, it } from 'vitest';
import { withTemporaryPause } from '../src/ui/onboarding.js';

describe('onboarding pause ownership',()=>{
  it('restores a runnable world after onboarding fails',async()=>{
    const state={paused:false};
    await expect(withTemporaryPause(state,async()=>{
      expect(state.paused).toBe(true);
      throw new Error('storage failed');
    })).rejects.toThrow('storage failed');
    expect(state.paused).toBe(false);
  });

  it('preserves a world that was already paused',async()=>{
    const state={paused:true};
    await withTemporaryPause(state,async()=>expect(state.paused).toBe(true));
    expect(state.paused).toBe(true);
  });
});
