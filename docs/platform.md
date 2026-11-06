# 平台层（M5）

`src/platform/` 把宿主平台（Playgama Bridge / 本地测试桩）包成一个接口，游戏代码只依赖 `Platform`，不直接碰 SDK。

## 文件

| 文件 | 作用 |
| --- | --- |
| `src/boot.ts` | 入口：先 `await getPlatform()`（Bridge `initialize()` 完成），再带进度下载游戏 chunk 和模型（`src/loading.ts`，加载页在 `index.html`），然后 `import('./main')` |
| `src/platform/index.ts` | `getPlatform()`：选平台、初始化，永不 reject（记忆化）；导出类型、`Analytics`、`InterstitialPolicy` |
| `src/platform/types.ts` | `Platform` 接口 |
| `src/platform/playgama.ts` | Playgama Bridge v2 适配器；正式包里脚本已在 `<head>`，dev 下 `?platform=playgama` 时才按需加载（附 vitest 测试） |
| `src/platform/stub.ts` | 本地测试桩：假广告遮罩「广告（测试）」，`track` 打到控制台和 `window.__track` |
| `src/platform/interstitial.ts` | 插屏节奏，只给测试桩用，模拟 Bridge 自己的节奏（附 vitest 测试） |
| `src/platform/analytics.ts` | `once()` 首次事件、`session_time` 30 秒心跳 |
| `src/platform/funnel.ts` | 首分钟漏斗、引导提示、发呆、中途退出（附 vitest 测试）；`funnelReport()` 给开发辅助用 |
| `src/platform/playgama-bridge-config.json` | Bridge 配置，`vite.config.ts` 在 dev 时提供、build 时输出到 `dist/` 根目录 |
| `scripts/package.ts` / `scripts/size.ts` | `npm run package` / `npm run size` |
| `scripts/lines.ts` / `vitest.config.ts` | `npm run lines`（单文件 ≤ 500 行）/ `npm run coverage`（覆盖率下限，sim/meta/i18n 各有更高门槛） |
| `scripts/onboard.ts` | `npm run onboard`：新存档在无头 Chrome 里跑前 5 分钟，机器人照引导的手操作，报空档和停住（[onboarding.md §12.8](design/onboarding.md)）；要本机装 Chrome 或 Edge，不进 CI |
| `.github/workflows/ci.yml` | push 到 main 和 PR 时跑 typecheck → lines → coverage → build → size |

## 平台选择

- **正式包**（`npm run build` / `package`）：`vite.config.ts` 把 Bridge 脚本作为 `<head>` 里第一个同步 `<script>` 插进去（Bridge 必做第 2 步），`window.bridge` 已在 → 用 Bridge。不在 Playgama 上时 Bridge 自己以 `mock` 平台运行（激励广告不支持、按钮隐藏）。
- **dev 服务器**没有这个标签：页面 URL 带 `platform_id`、域名或 referrer 含 `playgama`，或手动加 `?platform=playgama` → 运行时加载 Bridge；否则用测试桩。
- `src/boot.ts` 等平台初始化完才加载游戏模块（舞台、three.js、HUD 都在另一个 chunk）。
- `?platform=stub`（或任何别的值）强制用测试桩。
- Bridge 脚本加载失败、超时（10 秒）或 `initialize()` 报错 → 控制台 warning，退回测试桩，游戏照常运行。
- Bridge 地址：`https://bridge.playgama.com/v2/stable/playgama-bridge.js`。官方只提供 `v2/stable` 通道（带版本号的路径返回 403），而且它会从同目录懒加载各平台分包，所以只能锁主版本；编写时对应 **2.3.1**（2026-10-07 构建），加载到非 2.x 会 warning。
- 测试桩额外参数：`?ad=fail` 让所有激励广告失败，用来测「没拿到奖励」分支；`?ad=none` 报告激励广告不支持，复活/双倍按钮隐藏。

## 接口要点

- `gameReady()` → Bridge `platform.sendMessage('game_ready')`；`gameplayStart()/gameplayStop()` → `gameplay_started` / `gameplay_stopped`（同状态重复调用会被忽略）。
- `showRewarded(placement)` 只在 Bridge 状态走到 `rewarded` 时返回 true（官方要求：不能在 `closed` 时发奖励）；不支持、失败、90 秒无回调 → false。永不 reject。
- `rewardedSupported()` → Bridge `advertisement.isRewardedSupported`；为 false 时结算卡不显示复活和双倍按钮（Bridge 第 8 步：隐藏不支持的功能）。
- `showInterstitial()` 在**每个自然停顿**都调用（离开结算卡），游戏自己不计时不计数；关闭、失败、不支持或被节奏跳过时 resolve。Playgama 上由 Bridge 按平台默认间隔决定弹不弹（文档要求不改 `minimumDelayBetweenInterstitial`），placement `run_end`。
- `onPause(cb)`：广告打开、或平台要求暂停时回调 `true`，结束回调 `false`。主循环暂停模拟并挂起声音。
- `audioEnabled()` / `onAudio(cb)` → Bridge `platform.isAudioEnabled` 和 `AUDIO_STATE_CHANGED`；启动时先读当前值（事件只报后续变化）。声音另外在 `document.hidden` 时挂起，不管平台报什么。
- `storage`：字符串值。启动时 `preload(['save','lang','mute'])` 一次批量 `storage.get([...], false)`，之后这几个键的 `get` 从缓存取；`set` 只在有意义的变化时调用（一局入账、购买、设置）。Playgama 下**只走 Bridge**，游戏不写 localStorage（Bridge 自己选云端或本地）；读写失败只 warning，值留在内存里撑到本次页面关闭。测试桩用带前缀 `fruit-fort:` 的 localStorage。
- `language()`：Playgama 下只取 Bridge `platform.language`（平台没给时 Bridge 自己退回浏览器语言）；测试桩用浏览器语言。
- `track(event, data)`：Playgama 下走 `bridge.analytics.send(event, data)`（Bridge 2.3+，数据是扁平的 string/number/boolean，后台按事件名和字段统计）；没有 analytics 模块的旧 Bridge 退回 `platform.sendCustomMessage`，那条路在后台只显示成一个不带字段的 `platform_custom_message`（0.0.9 及以前的埋点都是这样，读不到）。初始化前设置 `bridge.gameVersion = __APP_VERSION__`，每条事件（包括 Bridge 自己的 game_ready、gameplay_30s 等）都会带上 `game_version`，可以按版本对比。

## 插屏规则（§14）

游戏在每次离开结算卡时调用 `showInterstitial()`，弹不弹由平台决定（Bridge 官方要求：不要自己加计时器或计数器）。

测试桩里 `InterstitialPolicy` 代替 Bridge 的节奏，免得本地每局都弹：每次调用算一局结束；第 2 局结束起才可能弹；距离上一次任何广告（插屏或激励）至少 3 分钟。

## 分析事件（M5 验收：60 秒留存 ≥ 65%，平均会话 5 分钟）

| 事件 | 数据 | 何时 | 用途 |
| --- | --- | --- | --- |
| `load` | `{ ms }` 首帧耗时 | 首帧渲染后、`gameReady()` 同时 | 会话分母；首帧 < 3 秒 |
| `first_buy` | `{ t, stat }` | 本次会话第一次买属性；`t` 为模拟秒数 | 新手漏斗；首个属性选择 |
| `first_reverse` | `{ t }` | 本次会话第一次让火车掉头 | 新手漏斗 |
| `wave_cleared` | `{ wave }` | 第 N 波打完（即第 N+1 波开始时，`wave = N`） | 进度分布 |
| `run_end` | `{ wave, time, hero }` | 一局结束；`time` 为模拟秒数取整 | 单局时长、英雄对比 |
| `revive` | — | 看完激励广告复活成功 | 复活使用率 |
| `ad_rewarded` | `{ placement, ok }` | 每次激励广告结束 | 广告完成率 |
| `session_time` | `{ s, q, fps }` | 页面可见时每 30 秒一次，`s` 为累计秒数；`q` 是当时的画质档位（0 high … 4 min，§15.6），`fps` 是最近 2 秒的平均帧率 | 60 秒留存 = 有 `s ≥ 60` 的会话 / `load` 会话；平均会话时长 |
| `performance_sample` | Playgama 规定字段：`target_fps`(60) `window_ms` `active_ms` `frame_count` `fps_avg` `fps_p10` `frame_time_p50/p95/p99/max_ms` `frames_over_50/100/250/500/1000ms` `build_version`；另带本窗口的 `long_task_count/total_ms/max_ms`（只在支持 longtask 的浏览器）、`js_error_count` `unhandled_rejection_count` `webgl_context_loss_count`；以及发送时的局面 `mode`（关卡序号或 endless）`wave` `q`（画质档）`bugs`（场上虫数），和本窗口最长卡顿时的同一组值，前缀 `long_task_`（如 `long_task_wave`） | 战斗进行中且页面可见（不在村落、没暂停、没广告、没被宿主暂停、没结束）每累计约 30 秒发一次；一局结束或页面隐藏时，已攒 ≥ 10 秒的不满窗口也发出，不足的留到下次。暂停/隐藏后恢复的那一帧不算（`src/platform/perf.ts`） | 真机帧率、卡顿分布；按 `build_version` 对比版本；卡顿出在第几波、多少虫 |
| `language` | `{ locale }` | 玩家在村落里换语言 | 语言分布、翻译优先级 |
| `funnel_<step>` | `{ s, … }` | 每个漏斗步骤本次会话第一次到达，见下表 | 首分钟漏斗：各步到达率和耗时 |
| `guide_<id>_shown` | `{ s, run, wait }` | 引导的手第一次出现；`run` = 已打局数，`wait` = 从这一步能做到出手的秒数；`id` 见下 | 哪一步卡人、出手是否及时 |
| `guide_<id>_done` / `_skipped` / `_left` | `{ s }` | 手出来后：照做了 / 点了别的按钮跳过 / 条件消失、手没被理会就走了。每个 id 每会话各发一次 | 哪一步被跳过、被无视 |
| `idle_<stuck>` | `{ s, wave, stuck, hint? }`（`hint` = 当时手指着的引导 id） | 一局进行中（没结束、不在村落、没有广告、没被宿主暂停）连续 15 秒没有任何指针/按键输入；每段发呆一次，每会话最多 5 次 | 卡在哪一步不动了 |
| `quit_<stuck>` | `{ s, wave, stuck, hint?, run_t }` | 一局进行中 `pagehide`（关页面/切走被回收）；每会话一次 | 中途退出（rage-quit）信号 |

`s` = 页面加载（`performance.now()` 起点）起的秒数，保留一位小数。步骤名、引导 id 都写进事件 id，是因为 Playgama 后台按消息 id 统计、附带数据不一定进后台（见上「接口要点」）；名字固定，新加步骤只追加不改名。

**漏斗步骤**（主线按顺序；`stuck` = 主线里第一个还没到达的步骤，全部到达为 `done`）：

| `step` | 何时 | 附带数据 |
| --- | --- | --- |
| `first_frame` | 启动时空堡垒第一次渲染（早于平台就绪，事件先排队） | — |
| `first_tap` | 第一次在画布上按下 | — |
| `first_buy` | 第一次买属性 | `stat` |
| `first_reverse` | 第一次让火车掉头 | — |
| `first_cast` | 第一次释放英雄技能 | `hero` |
| `first_grab` | 第一次开火车收下随机事件 | `kind` |
| `wave_3` / `wave_5` / `wave_10` | 第一次打到第 3/5/10 波（该波开始时） | `run_t` 模拟秒数 |
| `first_death` | 第一次城墙被破（复活前也算） | `wave`, `run_t` |
| `village_open` | 第一次打开村落（老玩家一进来就会发） | `runs` |
| `first_purchase` | 村落里第一次花水晶（解锁/升级/建造；领奖不算） | `spent` |

后三个是支线，不参与 `stuck`。

**引导 id**（`src/view/guide.ts` 的步骤表，设计见 [onboarding.md](design/onboarding.md) §12）：
- 第 1 关：`buy`、`reverse`（这两步停住等）、`basket`、`cast`；第 2、3 关：`goldbug`、`multi`、`speed`。
- 结算：`win`（指「回基地」）、`lose`（指「去训练」）。
- 回村 ①：`v_train`、`v_daily`、`play1`；回村 ②：`v_hero`、`v_wall`、`v_route`、`play2`。
- 之后：`l_ach`、`l_task`、`l_hero`、`l_pick`、`l_piggy`、`l_endless`、`l_challenge`。
- 闲置提示：`idle_cast`（第 1–3 关技能蓄满 4 秒）、`idle_buy1`（第 1–3 关买过之后 4 秒）、`idle_buy`（第 4 关起战斗 10 秒）、`idle_play`（村落 20 秒），不进存档；后两条忽略 3 次就不再出，前两条不设上限。

**开发辅助**：测试桩下在控制台运行 `game.funnel()`，按顺序打印 `window.__track` 里的漏斗相关事件（`load`、`first_buy`、`run_start`/`run_end`、`funnel_*`、`guide_*`、`idle_*`、`quit_*`），带每步的 `s` 和距上一步的 `dt`。

## 游戏怎么用（`src/main.ts`）

- 启动：`getPlatform()` 已由 `boot.ts` 等完；`storage.preload` → 读存档、静音（键 `mute`）、语言（`?lang=` > 玩家自选 `lang` > `platform.language()`）→ `setHostAudio(audioEnabled())` 并订阅 `onAudio` → 第一帧 → 加载页淡出，同时 `gameReady()`。
- 每帧：在关卡里且没暂停时 `gameplayStart()`，否则 `gameplayStop()`；`sound.hold(广告打开 || 宿主暂停)`。
- 宿主 iframe 没有尺寸时（Playgama 沙盒加载时 iframe 是 0×0，`scene.ts` 的 `unsized()`）：不画（渲染目标至少 1 px，否则每次 clear/draw/blit 都报 `GL_INVALID_FRAMEBUFFER_OPERATION`），帧循环也不推进模拟和引导计时器，并 `gameplayStop()`，所以第 1 关开场要等玩家真的看到才开始；之后由 resize 事件按真实尺寸重建（0.0.14）。
- 沙盒控制台里 Cloudflare Turnstile、`attribution-reporting`/`browsing-topics`、iframe sandbox、`unload` 权限策略这些警告来自宿主页面，不是游戏的。
- 结算卡：复活、双倍走 `showRewarded`，只在 `rewardedSupported()` 时显示；离开结算卡（再来、回基地、下一关、去训练）先 `showInterstitial()`。
- 暂停菜单的键盘快捷键是 `P`（Playgama 1.5.2：不能用 Esc，它会退出全屏）。

## 打包

```bash
npm run package
```

`vite build` → 打印 `dist/` 每个文件的原始/gzip 大小 → 生成 `release/swarm-orbit-<version>.zip`（`index.html` 在 zip 根目录）。gzip 总量超过 5 MB 时退出码为 1。`npm run size` 只做大小报告。

`vite.config.ts` 设了 `base: './'`，门户从子路径托管时资源路径才不会错。

`release/` 目前没有写进 `.gitignore`（本会话不能改它），接入时顺手加上。
