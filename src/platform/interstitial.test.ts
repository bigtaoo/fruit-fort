import { describe, expect, it } from 'vitest';
import { INTERSTITIAL_GAP_MS, InterstitialPolicy } from './interstitial';

function setup() {
  let t = 0;
  const policy = new InterstitialPolicy(() => t);
  const run = (ms = 60_000) => {
    policy.runStarted();
    t += ms;
    policy.runEnded();
  };
  return { policy, run, wait: (ms: number) => (t += ms) };
}

describe('InterstitialPolicy', () => {
  it('never shows before or after the first run', () => {
    const { policy, run, wait } = setup();
    expect(policy.canShow()).toBe(false);
    run();
    wait(10 * 60_000);
    expect(policy.canShow()).toBe(false);
  });

  it('shows between runs from the second run on', () => {
    const { policy, run } = setup();
    run();
    run();
    expect(policy.canShow()).toBe(true);
  });

  it('never shows during a run', () => {
    const { policy, run } = setup();
    run();
    run();
    policy.runStarted();
    expect(policy.canShow()).toBe(false);
  });

  it('waits 3 minutes after an interstitial', () => {
    const { policy, run, wait } = setup();
    run();
    run();
    policy.adShown();
    run(INTERSTITIAL_GAP_MS - 1000);
    expect(policy.canShow()).toBe(false);
    wait(1000);
    expect(policy.canShow()).toBe(true);
  });

  it('counts a rewarded ad towards the gap', () => {
    const { policy, run, wait } = setup();
    run();
    policy.runStarted();
    wait(30_000);
    policy.adShown(); // revive
    wait(30_000);
    policy.runEnded();
    expect(policy.canShow()).toBe(false);
    wait(INTERSTITIAL_GAP_MS);
    expect(policy.canShow()).toBe(true);
  });

  it('ignores a run end without a start', () => {
    const { policy, run } = setup();
    run();
    policy.runEnded();
    expect(policy.canShow()).toBe(false);
  });
});
