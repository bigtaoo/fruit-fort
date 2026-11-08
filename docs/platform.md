# 平台层（M5）

`src/platform/` 把宿主平台（Playgama Bridge / 本地测试桩）包成一个接口，游戏代码只依赖 `Platform`，不直接碰 SDK。

## 文件

| 文件 | 作用 |
| --- | --- |
| `src/boot.ts` | 入口：`getPlatform()`（Bridge `initialize()`）和带进度的游戏 chunk、模型下载（`src/loading.ts`，加载页在 `index.html`）同时开始；下载完就 `import('./main')`，搭场景、编开局着色器，可能和 `initialize()` 同时进行（0.0.16）。游戏在 `initialize()` 完成前不调用任何 SDK：`main.ts` 等 `getPlatform()` 拿到之后才读存档和语言 |
| `src/platform/index.ts` | `getPlatform()`：选平台、初始化，永不 reject（记忆化）；导出类型、`Analytics`、`InterstitialPolicy` |
| `src/platform/types.ts` | `Platform` 接口 |
| `src/platform/playgama.ts` | Playgama Bridge v2 适配器；正式包里脚本已在页面里（`#boot` 加载页之后），dev 下 `?platform=playgama` 时才按需加载（附 vitest 测试） |
| `src/platform/stub.ts` | 本地测试桩：假广告遮罩「广告（测试）」，`track` 打到控制台和 `window.__track` |
| `src/platform/offline.ts` | Playgama 页面上 Bridge 失败或太慢时的替身（0.0.16）：没有广告（按钮隐藏），存档只在内存（不碰 localStorage，Bridge 必做第 4 步），浏览器语言；事件交给 `window.bridge`（它排队到 initialize 完成）；被放弃的 `initialize()` 后来完成时补发 `game_ready` 和当前的 gameplay 状态 |
| `src/platform/interstitial.ts` | 插屏节奏，只给测试桩用，模拟 Bridge 自己的节奏（附 vitest 测试） |
| `src/platform/analytics.ts` | `once()` 首次事件、`session_time` 30 秒心跳 |
| `src/platform/funnel.ts` | 首分钟漏斗、引导提示、发呆、中途退出（附 vitest 测试）；`funnelReport()` 给开发辅助用 |
| `src/platform/playgama-bridge-config.json` | Bridge 配置，`vite.config.ts` 在 dev 时提供、build 时输出到 `dist/` 根目录 |
| `scripts/package.ts` / `scripts/size.ts` | `npm run package` / `npm run size` |
| `scripts/lines.ts` / `vitest.config.ts` | `npm run lines`（单文件 ≤ 500 行）/ `npm run coverage`（覆盖率下限，sim/meta/i18n 各有更高门槛） |
| `scripts/onboard.ts` | `npm run onboard`：新存档在无头 Chrome 里跑前 5 分钟，机器人照引导的手操作，报空档和停住（[onboarding.md §12.8](design/onboarding.md)）；要本机装 Chrome 或 Edge，不进 CI |
| `.github/workflows/ci.yml` | push 到 main 和 PR 时跑 typecheck → lines → coverage → build → size |

## 平台选择

- **正式包**（`npm run build` / `package`）：`vite.config.ts` 把 Bridge 脚本作为页面里第一个同步 `<script>` 插在 `</body>` 前、加载页的标记之后（0.0.16；Bridge 必做第 2 步写的是 `<head>` 第一个，但那样 bridge.playgama.com 回应前页面一直是白的，慢网要好几秒；Holy Kicker、Potion Siege 也这么放），它仍先于游戏的 module 脚本执行，`window.bridge` 已在 → 用 Bridge。不在 Playgama 上时 Bridge 自己以 `mock` 平台运行（激励广告不支持、按钮隐藏）。
- **dev 服务器**没有这个标签：页面 URL 带 `platform_id`、域名或 referrer 含 `playgama`，或手动加 `?platform=playgama` → 运行时加载 Bridge；否则用测试桩。
- `src/boot.ts` 在文件下完后就运行游戏模块（舞台、three.js、HUD 都在另一个 chunk），不等平台初始化；游戏模块搭场景、编开局着色器，读存档及之后的一切才等 `getPlatform()`（0.0.16 起，之前是等初始化完才加载）。
- `?platform=stub`（或任何别的值）强制用测试桩。
- Bridge 脚本加载失败、超时（10 秒，只有 dev 按需加载时）、`initialize()` 报错或 10 秒没完成（`INIT_TIMEOUT_MS`，0.0.16）→ 控制台 warning，用 `offline.ts`，发 `platform_offline {why}`，游戏照常运行，但没有广告，这次会话的进度也存不下（老玩家看不到 Bridge 里的进度）。不退回测试桩：它的测试广告必给奖励，存档写 localStorage。initialize 后来才完成时，补发 `game_ready`（和进行中的 `gameplay_started`），之后跟随宿主的暂停和静音；广告和存档这一页都不再打开（这时读存档会和内存里已有的进度冲突）。离线会话里老玩家也是空存档，`run_start`/`funnel_*`/`load` 的 `runs` 都是 0，看新手漏斗时按 `load.platform` 或 `platform_offline` 把这些会话剔掉。10 秒而不是 Holy Kicker / Potion Siege 的 5 秒：替身会让老玩家这一局丢进度，而场景本来就和 initialize 同时在搭，前几秒不是白等。测试桩只在本地（不在 Playgama 上）用。
- 和 Bridge 必做第 2 步的出入（0.0.16，有意为之）：脚本标签在 `</body>` 前而不是 `<head>` 第一个（见上）；场景搭建和着色器编译可能和 `initialize()` 重叠，但在它完成前游戏不调用 SDK。脚本仍是同步加载，不用 `async`，也不是代码里后加的（必做第 2 步明确禁止）。
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
| `load` | `{ ms, page, platform, runs, best, sdk, dl, build, save, warm, warm_timeout?, gpu, q }`：`ms` 从游戏 chunk 开始跑起（0.0.16 起游戏 chunk 不等 initialize 就跑，`ms` 含剩下的 SDK 等待，和之前版本不能直接比），`page` 从页面加载起，其余是各加载步骤结束的时刻（`loading.ts` `bootTimes`；游戏 chunk 重取过的还有 `retry`，见 `boot_error`）；`warm` = 开局要用的着色器编完（0.0.16 起只编第一关/本存档开局可见的那些，其余在显示后后台编，记为 `warm_rest`，不进本事件；老玩家落在村子里，预热的是村子关卡卡片上那一关（`cardLevel`；无尽模式开局只有毛虫，预热第一关的））；`warm_timeout` = 着色器 12 秒没编完、没等它就开了；`gpu` = WebGL 报的显卡名（最多 100 字符，浏览器不给就是空），`q` = 起步画质档位，软件渲染是 5（0.0.17，§15.6） | 着色器编完（最多等 12 秒）后、`gameReady()` 同时；0.0.15 起不再等下一个 `requestAnimationFrame`（隐藏或 0×0 的跨域 iframe 里浏览器不给 rAF，宿主可能又在等 `gameReady` 才显示 iframe） | 会话分母；首帧 < 3 秒 |
| `boot_left` | `{ stage, sdk, dl, s, pct, w, h, pf }`：`stage` = 最后结束的加载步骤（`start` 还没有任何一步；0.0.16 起 `build` 不再意味着 SDK 已完），`sdk`/`dl` = SDK 有结果了没（初始化完或被放弃）、文件下完了没，`pf` = 平台 id（`''` = 还没结果，`offline` = SDK 被放弃，0.0.16），`pct` = 进度条百分比，`w`×`h` = 当时窗口尺寸 | 游戏出现前页面隐藏或 `pagehide`；每会话一次（`boot.ts` 发，平台还没就绪时直接走 `window.bridge.analytics.send` 排队） | 加载中走掉的人停在哪一步（0.0.15） |
| `platform_offline` | `{ why }`：Bridge 的错误信息（最多 80 字符），慢的那种是 `Bridge initialize took over 10000 ms` | Playgama 页面上 Bridge 失败或超时、换成 `offline.ts` 时；排在 Bridge 队列里，initialize 后来完成才会发出去 | 多少人玩的是没广告、不存档的版本（0.0.16） |
| `boot_error` | `{ stage, kind, name, msg }`（`main` 那种另带 `pf` 和 `retried`）：`main` = 游戏 chunk 下载或运行失败（如没有 WebGL2），`start` = 读存档/语言/平台时抛错。Playgama 会把自由文本的 `msg` 屏蔽掉（2026-11-08 第一条就是），所以 0.0.18 起原因另用固定词 `kind` 发：`fetch` = 脚本没下来（网慢或断了），`webgl` = 浏览器给不了 WebGL2，`other` = 其它；`name` = 错误类型（`TypeError` 等，`bootfail.ts`）。`main` 的 chunk 没下来时先隔 1.5 秒换个 URL（`?retry=1`，浏览器可能缓存失败的模块导入）再取一次，`load` 的步骤时刻里多一个 `retry`；再失败才发本事件，`retried: true`。chunk 跑起来后抛的错不重跑（它已经做了一半）。0.0.18（归档 cmw7vihuy1gmhmt0hxtgxggpa，提交 898f558 打包）2026-11-08 13:34 UTC 在沙盒上线 | 启动失败；加载页换成全屏的 ↻ 重新加载按钮，而不是停住的进度条 | 启动失败率 |
| `run_start` | `{ mode, hero, runs }` | 每局开始；0.0.15 起新玩家直接进的第 1 关也发（之前漏了） | 局数分母 |
| `run_quit` | `{ mode, wave, t, runs }` | 一局中从暂停菜单回基地（这一局作废）；第一局没有这个按钮 | 中途放弃 |
| `first_buy` | `{ t, stat }` | 本次会话第一次买属性；`t` 为模拟秒数 | 新手漏斗；首个属性选择 |
| `first_reverse` | `{ t }` | 本次会话第一次让火车掉头 | 新手漏斗 |
| `wave_cleared` | `{ wave }` | 第 N 波打完（即第 N+1 波开始时，`wave = N`） | 进度分布 |
| `run_end` | `{ wave, time, hero }` | 一局结束；`time` 为模拟秒数取整 | 单局时长、英雄对比 |
| `revive` | — | 看完激励广告复活成功 | 复活使用率 |
| `ad_rewarded` | `{ placement, ok }` | 每次激励广告结束 | 广告完成率 |
| `session_time` | `{ s, q, fps }` | 页面可见时每 30 秒一次，`s` 为累计秒数；`q` 是当时的画质档位（0 high … 5 soft，§15.6），`fps` 是最近 2 秒的平均帧率 | 60 秒留存 = 有 `s ≥ 60` 的会话 / `load` 会话；平均会话时长 |
| `performance_sample` | Playgama 规定字段：`target_fps`(60) `window_ms` `active_ms` `frame_count` `fps_avg` `fps_p10` `frame_time_p50/p95/p99/max_ms` `frames_over_50/100/250/500/1000ms` `build_version`；另带本窗口的 `long_task_count/total_ms/max_ms`（只在支持 longtask 的浏览器）、`js_error_count` `unhandled_rejection_count` `webgl_context_loss_count`；以及发送时的局面 `mode`（关卡序号或 endless）`wave` `q`（画质档）`bugs`（场上虫数），和本窗口最长卡顿时的同一组值，前缀 `long_task_`（如 `long_task_wave`） | 战斗进行中且页面可见（不在村落、没暂停、没广告、没被宿主暂停、没结束）每累计约 30 秒发一次；一局结束或页面隐藏时，已攒 ≥ 10 秒的不满窗口也发出，不足的留到下次。暂停/隐藏后恢复的那一帧不算（`src/platform/perf.ts`） | 真机帧率、卡顿分布；按 `build_version` 对比版本；卡顿出在第几波、多少虫 |
| `language` | `{ locale }` | 玩家在村落里换语言 | 语言分布、翻译优先级 |
| `funnel_<step>` | `{ s, … }` | 每个漏斗步骤本次会话第一次到达，见下表 | 首分钟漏斗：各步到达率和耗时 |
| `guide_<id>_shown` | `{ s, run, wait }` | 引导的手第一次出现；`run` = 已打局数，`wait` = 从这一步能做到出手的秒数；`id` 见下 | 哪一步卡人、出手是否及时 |
| `guide_<id>_done` / `_skipped` / `_left` / `_replaced` | `{ s }` | 手出来后：照做了 / 点了别的按钮跳过 / 条件消失或超时（`cast`、`idle_cast` 8 秒）、手没被理会就走了 / 更靠前的一步把手抢走了（0.0.15）。每个 id 每会话各发一次 | 哪一步被跳过、被无视 |
| `idle_<stuck>` | `{ s, wave, stuck, hint? }`（`hint` = 当时手指着的引导 id） | 一局进行中（没结束、不在村落、没有广告、没被宿主暂停）连续 15 秒没有任何指针/按键输入；每段发呆一次，每会话最多 5 次 | 卡在哪一步不动了 |
| `quit_<stuck>` | `{ s, wave, stuck, hint?, at, run_t, n, q, fps? }`；`at` = 离开时在哪：`run`（战斗中）、`over`（结算卡）、`village`（村落）、`ad`（广告里）；`n` = 本会话第几次离开；`q` = 当时的画质档位；`fps` = 从第一帧到离开的平均帧率（按真实时钟算，不受游戏 dt 0.1 上限影响；超过 1 s 的帧间隔，即切走的标签页，不计；还没计时到帧时不带） | 游戏画面出来之后，页面每次隐藏（`visibilitychange` → hidden，或 `pagehide`）都发，每会话最多 5 次；hidden 之后紧跟的 `pagehide`（中间没跑过一帧）算同一次。所以一个会话**最后一条** `quit_*` 的 `s` 就是玩家离开的时刻和位置，之后还有事件说明玩家又回来了。0.0.19 之前只在战斗中第一次隐藏时发、每会话一次，结算卡和村落里走的人没有离开时刻。`q`/`fps` 也是 0.0.19 加的：`performance_sample` 每 30 s 才一条，30 s 内就走的玩家没有任何帧率数据，没法回答「是不是卡走的」（2026-11-08，15 秒内离开的 12/51 个新玩家）。0.0.19（归档 cmw7zmz181jsgmt0h5cc940dz，提交 020cf1c 打包）2026-11-08 15:30 UTC 在沙盒上线。在 `window` 的捕获阶段发，赶在 Bridge 挂在 document 上的同一事件用 sendBeacon 把队列发走之前；0.0.14 之前等 `pagehide` 才发，那时队列已经发完，事件丢了（2026-11-06 一整天只到 1 个） | 离开时刻和位置；中途退出（rage-quit）信号 |

`s` = 页面加载（`performance.now()` 起点）起的秒数，保留一位小数。步骤名、引导 id 都写进事件 id，是因为 Playgama 后台按消息 id 统计、附带数据不一定进后台（见上「接口要点」）；名字固定，新加步骤只追加不改名。

**漏斗步骤**（主线按顺序；`stuck` = 主线里第一个还没到达的步骤，全部到达为 `done`）：

| `step` | 何时 | 附带数据 |
| --- | --- | --- |
| `first_frame` | 启动时空堡垒第一次渲染（早于平台就绪，事件先排队） | — |
| `first_tap` | 游戏画面出来后第一次按下或按键，页面上任何地方都算（属性卡、按钮也算）；0.0.19 之前只算画布，直接点属性卡的玩家被记成「没点过」 | — |
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
- `cast` 和 `idle_cast` 的手最多停 8 秒，然后让开 20 秒（`CAST_TTL`/`CAST_COOL`），买属性的提示才轮得到（0.0.15）。
- 闲置提示：`idle_cast`（第 1–3 关技能蓄满 4 秒）、`idle_buy1`（第 1–3 关买过之后 4 秒）、`idle_buy`（第 4 关起战斗 10 秒）、`idle_play`（村落 20 秒），不进存档；后两条忽略 3 次就不再出，前两条不设上限。

**开发辅助**：测试桩下在控制台运行 `game.funnel()`，按顺序打印 `window.__track` 里的漏斗相关事件（`load`、`first_buy`、`run_start`/`run_end`、`funnel_*`、`guide_*`、`idle_*`、`quit_*`），带每步的 `s` 和距上一步的 `dt`。

## 游戏怎么用（`src/main.ts`）

- 启动：`getPlatform()` 已由 `boot.ts` 等完；`storage.preload` → 读存档、静音（键 `mute`）、语言（`?lang=` > 玩家自选 `lang` > `platform.language()`）→ `setHostAudio(audioEnabled())` 并订阅 `onAudio` → 第一帧 → 加载页淡出，同时 `gameReady()`。
- 每帧：在关卡里且没暂停时 `gameplayStart()`，否则 `gameplayStop()`；`sound.hold(广告打开 || 宿主暂停)`。
- 宿主 iframe 没有尺寸时（Playgama 沙盒加载时 iframe 是 0×0，`scene.ts` 的 `unsized()`）：不画（渲染目标至少 1 px，否则每次 clear/draw/blit 都报 `GL_INVALID_FRAMEBUFFER_OPERATION`），帧循环也不推进模拟和引导计时器，并 `gameplayStop()`，所以第 1 关开场要等玩家真的看到才开始；之后由 resize 事件按真实尺寸重建（0.0.14）。加载页淡出和 `gameReady()` 不等这一帧（0.0.15）。
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
