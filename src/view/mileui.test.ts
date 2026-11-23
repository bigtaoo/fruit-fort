// 收手误点（§9.6，view/mileui.ts）：结束一整局的那张卡，和马车、潮汐的奖励卡共用同一条卡条、
// 同一张卡面、同一个点头动画，而手在那条卡条上是盲点的 —— 一位玩家就这么点掉了一整局。所以它要
// 两下：第一下翻面，第二下才算，而紧跟着的连点不算。这一组钉的就是「一下点不死」。

import { describe, expect, it } from 'vitest';
import { ARM, stopTap } from './mileui';
import { MILES } from '../sim/config';

describe('收手要两下 (§9.6)', () => {
  it('静面上的第一下只把卡翻过来', () => {
    expect(stopTap(-1, MILES.auto)).toBe('arm');
  });

  it('紧跟着的那一下不算：习惯性的连点翻得动卡面，点不掉一局', () => {
    const at = MILES.auto;
    expect(stopTap(at, at - 0.016)).toBe('wait');
    expect(stopTap(at, at - ARM.lock / 2)).toBe('wait');
  });

  it('隔开 ARM.lock 之后的那一下才真的收手', () => {
    const at = MILES.auto;
    expect(stopTap(at, at - ARM.lock * 1.01)).toBe('stop');
    expect(stopTap(at, at - 2)).toBe('stop');
  });

  it('自己翻回静面比那道闸晚：中间留得下读一遍卡面的时间', () => {
    // hold <= lock 的话，第二下永远赶不上：卡在能点之前就翻回去了。
    expect(ARM.hold).toBeGreaterThan(ARM.lock);
    // 而 hold 比整张卡的时钟短，所以翻着的那一面不会一直停到时钟自己走完。
    expect(ARM.hold).toBeLessThan(MILES.auto);
  });
});
