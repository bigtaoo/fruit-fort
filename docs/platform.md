# 平台层（M5）

`src/platform/` 把宿主平台（Playgama Bridge / 本地测试桩）包成一个接口，游戏代码只依赖 `Platform`，不直接碰 SDK。

## 文件

| 文件 | 作用 |
| --- | --- |
| `src/platform/index.ts` | `getPlatform()`：选平台、初始化，永不 reject（记忆化）；导出类型、`Analytics`、`InterstitialPolicy` |
| `src/platform/types.ts` | `Platform` 接口 |
| `src/platform/playgama.ts` | Playgama Bridge v2 适配器（运行时按需加载 CDN 脚本） |
| `src/platform/stub.ts` | 本地测试桩：假广告遮罩「广告（测试）」，`track` 打到控制台和 `window.__track` |
| `src/platform/interstitial.ts` | 插屏策略（附 vitest 测试） |
| `src/platform/analytics.ts` | `once()` 首次事件、`session_time` 30 秒心跳 |
| `src/platform/playgama-bridge-config.json` | Bridge 配置，`vite.config.ts` 在 dev 时提供、build 时输出到 `dist/` 根目录 |
| `scripts/package.ts` / `scripts/size.ts` | `npm run package` / `npm run size` |

## 平台选择

- 页面 URL 带 `platform_id`（Playgama 托管时会加）、域名或 referrer 含 `playgama`，或手动加 `?platform=playgama` → 加载 Bridge。
- `?platform=stub`（或任何别的值）强制用测试桩。
- Bridge 脚本加载失败、超时（10 秒）或 `initialize()` 报错 → 控制台 warning，退回测试桩，游戏照常运行。
- Bridge 地址：`https://bridge.playgama.com/v2/stable/playgama-bridge.js`。官方只提供 `v2/stable` 通道（带版本号的路径返回 403），而且它会从同目录懒加载各平台分包，所以只能锁主版本；编写时对应 **2.3.1**（2026-10-07 构建），加载到非 2.x 会 warning。
- 测试桩额外参数：`?ad=fail` 让所有激励广告失败，用来测「没拿到奖励」分支。

## 接口要点

- `gameReady()` → Bridge `platform.sendMessage('game_ready')`；`gameplayStart()/gameplayStop()` → `gameplay_started` / `gameplay_stopped`（同状态重复调用会被忽略）。
- `showRewarded(placement)` 只在 Bridge 状态走到 `rewarded` 时返回 true（官方要求：不能在 `closed` 时发奖励）；不支持、失败、90 秒无回调 → false。永不 reject。
- `showInterstitial()` 关闭、失败或不支持时 resolve。**调用前必须先问 `InterstitialPolicy.canShow()`**。
- `onPause(cb)`：广告打开、或平台要求暂停时回调 `true`，结束回调 `false`。主循环应暂停模拟并静音（各门户审核都要求广告期间静音）。
- `storage.get/set`：字符串值；Bridge 的 `storage.get(key, false)` 不做 JSON 解析，失败时退回 localStorage（键前缀 `fruit-fort:`）。`set` 总是同时写 localStorage。
- `track(event, data)`：Playgama 下走 `platform.sendCustomMessage(event, data)`（Bridge 分析后台按消息 id 统计；附带数据是否进后台未在文档中说明，留存/时长指标只靠事件 id 就能算）。

## 插屏规则（§14）

`InterstitialPolicy`：
- 只在两局之间（`runStarted()` 之后、`runEnded()` 之前不弹）；
- 本次会话第一局结束后不弹（第 2 局结束起才可能弹）；
- 距离上一次任何广告（插屏或激励）至少 3 分钟。

## 分析事件（M5 验收：60 秒留存 ≥ 65%，平均会话 5 分钟）

| 事件 | 数据 | 何时 | 用途 |
| --- | --- | --- | --- |
| `load` | `{ ms }` 首帧耗时 | 首帧渲染后、`gameReady()` 同时 | 会话分母；首帧 < 3 秒 |
| `first_summon` | — | 本次会话第一次召唤 | 新手漏斗 |
| `first_merge` | — | 本次会话第一次合成 | 新手漏斗 |
| `wave_cleared` | `{ wave }` | 第 N 波打完（即第 N+1 波开始时，`wave = N`） | 进度分布 |
| `run_end` | `{ wave, time, hero }` | 一局结束；`time` 为模拟秒数取整 | 单局时长、英雄对比 |
| `revive` | — | 看完激励广告复活成功 | 复活使用率 |
| `ad_rewarded` | `{ placement, ok }` | 每次激励广告结束 | 广告完成率 |
| `session_time` | `{ s }` | 页面可见时每 30 秒一次，`s` 为累计秒数 | 60 秒留存 = 有 `s ≥ 60` 的会话 / `load` 会话；平均会话时长 |

## 主会话接入清单

以下都在 `src/main.ts`（本会话没有改它）：

1. **启动**（顶层，创建 `world` 之后）：
   ```ts
   import { Analytics, getPlatform, InterstitialPolicy, type Platform } from './platform';
   let platform: Platform | null = null;
   let analytics: Analytics | null = null;
   const adPolicy = new InterstitialPolicy();
   const bootAt = performance.now();
   void getPlatform().then((p) => {
     platform = p;
     analytics = new Analytics(p);
     p.onPause((paused) => { /* 暂停模拟 + 静音，例如 adPaused = paused; sound.setMuted(...) */ });
   });
   ```
   不要 `await` 它阻塞首帧；平台没就绪时 `platform?.` 调用直接跳过即可。
2. **首帧后**（第一次 `frame()` 渲染完）：`platform?.gameReady(); analytics?.track('load', { ms: Math.round(performance.now() - bootAt) }); analytics?.startHeartbeat(); platform?.gameplayStart(); adPolicy.runStarted();`
   ——如果平台在首帧之后才就绪，就在 `getPlatform().then` 里补发。
3. **`drainEvents()`** 的 switch 里：
   - `'summon'` → `analytics?.once('first_summon')`
   - `'merge'` → `analytics?.once('first_merge')`
   - `'wave'` → `if (ev.wave > 1) analytics?.track('wave_cleared', { wave: ev.wave - 1 })`
   - `'over'` → `analytics?.track('run_end', { wave: world.wave, time: Math.round(world.time), hero: world.heroKind }); platform?.gameplayStop(); adPolicy.runEnded();`
4. **结算界面的「双倍水晶」**（M4 结算面板，`src/view/hud.ts` 回调）：
   ```ts
   const ok = (await platform?.showRewarded('double')) ?? false;
   analytics?.track('ad_rewarded', { placement: 'double', ok });
   if (ok) adPolicy.adShown(); // 并发放双倍
   ```
5. **复活**（每局一次）：同上，placement `'revive'`；`ok` 时再 `analytics?.track('revive')`、`adPolicy.adShown()`，然后恢复这局。复活后不调用 `runEnded`，直到真正结束。
6. **商店免费宝箱**：同上，placement `'chest'`。
7. **重开一局**（`hud` 的 `restart` 回调，换新 `world` 之前）：
   ```ts
   if (platform && adPolicy.canShow()) { await platform.showInterstitial(); adPolicy.adShown(); }
   platform?.gameplayStart(); adPolicy.runStarted();
   ```
8. **存档**（M4 的水晶/解锁）：用 `platform.storage.get/set`（字符串，自己 `JSON.stringify`），不要直接用 localStorage，这样 Playgama 上能走云存档。
9. **语言**：`platform.language()` 返回 `'zh'`/`'en'` 等，目前只有中文，可先只记录。

## 打包

```bash
npm run package
```

`vite build` → 打印 `dist/` 每个文件的原始/gzip 大小 → 生成 `release/fruit-fort-<version>.zip`（`index.html` 在 zip 根目录）。gzip 总量超过 5 MB 时退出码为 1。`npm run size` 只做大小报告。

`vite.config.ts` 设了 `base: './'`，门户从子路径托管时资源路径才不会错。

`release/` 目前没有写进 `.gitignore`（本会话不能改它），接入时顺手加上。
