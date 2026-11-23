// 一局的节拍（§9.8, docs/design/battle.md）：一波清完之后的那一口气。World 持有一个并 step 它，
// 关卡和无尽共用。从 world.ts 拆出来。
//
// 为什么存在：在它之前，一局的节拍规则只有 `WAVES.callAt` 一条 —— 场上还剩 2 只，下一波就开始放
// （「场上不留空」，§9）。于是一局从头到尾是一条不断的流：没有「这波我扛住了」的那一下，Boss 波
// 和它旁边的普通波一样长，波次号往上跳是唯一的信号。量过一局（`arrivingAt(10)`、自然打到第 51
// 波）：第 4 波往后每一波都是 17～26 秒，到局末都没有趋势。玩家的原话是「游戏没有节奏」。
//
// 换气是这局唯一的下拍。一口气里发生三件事：
//   1. 这一波的金币结清（原本在下一波开始时给，正好给在打仗中间，玩家没有一秒是空的）；
//   2. 下拍本身 —— `clear` 事件，横幅和音效（view/juice.ts、view/audio.ts）；
//   3. 卡条唯一会开的时机 —— 挑车厢、局势牌、里程碑三者都等这口气（各自的 `step` 看 `breathing`）。
//      这一条只在无尽关：局势牌和里程碑本来就没有章节关，而挑车厢在章节关等不起 —— 章节关
//      最短 2 波，挑选不是被推迟而是被掉掉，量出来是 20 关×10 种子输掉 74/200 → 90/200（§9.8）。
// 于是一局是「打 → 清 → 结 → 选 → 打」的循环，而不是打到一半被卡面打断。
//
// 它不自己 step：`World.stepWaves` 判断完「场清了、下一波该来了」之后才问它一句 `ready()`，所以
// 一口气天然只在场上没东西的时候走，中途冒出来的东西（霉菌的孢子）会把它按住。

import { DT, ECON } from './config';
import { WAVES } from './wavedefs';
import type { World } from './world';

export class Pace {
  /** 这口气还剩几秒；0 表示没在换气。 */
  left = 0;
  /** 已经为哪一波打过下拍，这样一波只打一次。 */
  private rung = 0;

  /** 卡条问的就是这一句：现在是不是那口气。 */
  get breathing(): boolean {
    return this.left > 0;
  }

  /**
   * 场清了，下一波现在可以开吗？第一次问的那一帧打下拍、结清金币，然后数完 `WAVES.breath` 才放行。
   *
   * 引导把虫子按在环上的时候直接放行（`holdAt`，§12.2）：那一段的节拍由引导自己掌握，再插一口气
   * 只会让新玩家对着空场多等一下。跳过的只是那口气，不是这一波的钱 —— 钱和下拍照给，
   * 否则一次 hold 就吞掉一波的收入。
   */
  ready(w: World): boolean {
    if (this.rung !== w.wave) {
      this.rung = w.wave;
      const boss = w.waveBoss;
      // 和原来逐笔相同的一笔钱，只是换了个时刻给：原本是「第 n 波开始时给 base + n」，现在是
      // 「第 n-1 波清完时给 base + n」。同样的波数拿到同样的总额，但钱落在玩家手是空的那一刻。
      const gold = (ECON.waveBonusBase + w.wave + 1) * w.incomeMul();
      w.gold += gold;
      w.events.push({ t: 'clear', wave: w.wave, gold: Math.round(gold), boss });
      if (w.holdAt !== null) return true;
      this.left = boss ? WAVES.breath.boss : WAVES.breath.base;
      return false;
    }
    return w.holdAt !== null || (this.left -= DT) <= 0;
  }
}
