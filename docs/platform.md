# 平台层（M5）

`src/platform/` 把宿主平台（Playgama Bridge / 本地测试桩）包成一个接口，游戏代码只依赖 `Platform`，不直接碰 SDK。

## 文件

| 文件 | 作用 |
| --- | --- |
| `src/boot.ts` | 入口：`getPlatform()`（Bridge `initialize()`）和带进度的游戏 chunk、模型下载（`src/loading.ts`，加载页在 `index.html`）同时开始；下载完就 `import('./main')`，搭场景、编开局着色器，可能和 `initialize()` 同时进行（0.0.16）。游戏在 `initialize()` 完成前不调用任何 SDK：`main.ts` 等 `getPlatform()` 拿到之后才读存档和语言 |
| `src/platform/index.ts` | `getPlatform()`：选平台、初始化，永不 reject（记忆化）；导出类型、`Analytics`、`InterstitialPolicy` |
| `src/platform/types.ts` | `Platform` 接口 |
| `src/platform/playgama.ts` | Playgama Bridge v2 适配器；正式包里脚本已在页面里（`#boot` 加载页之后），dev 下 `?platform=playgama` 时才按需加载（附 vitest 测试） |
| `src/platform/crazygames.ts` | CrazyGames HTML5 SDK v3 适配器；只在 `VITE_HOST=crazygames` 的包和他们的页面上选中（附 vitest 测试） |
| `src/platform/stub.ts` | 本地测试桩：假广告遮罩「广告（测试）」，`track` 打到控制台和 `window.__track` |
| `src/platform/offline.ts` | Playgama 页面上 Bridge 失败或太慢时的替身（0.0.16）：没有广告（按钮隐藏），存档只在内存（不碰 localStorage，Bridge 必做第 4 步），浏览器语言；事件交给 `window.bridge`（它排队到 initialize 完成）；被放弃的 `initialize()` 后来完成时补发 `game_ready` 和当前的 gameplay 状态 |
| `src/platform/interstitial.ts` | 插屏节奏，只给测试桩用，模拟 Bridge 自己的节奏（附 vitest 测试） |
| `src/platform/analytics.ts` | `once()` 首次事件、`session_time` 30 秒心跳；每条事件同时给宿主和我们自己的 collector |
| `src/beacon.ts` | 自建遥测的线路：会话 id、一次 POST（`sendBeacon` / keepalive fetch）。在入口 chunk 里，`boot_left` 这类游戏还没跑起来就要发的事件直接走它 |
| `src/platform/collect.ts` | `Collector`：攒批、定时冲、离页时用 beacon、送不出去就留着重发（附 vitest 测试） |
| `src/platform/clientinfo.ts` | `clientFacts()`：这台机器的一次性事实，作为 `client` 事件 |
| `src/platform/funnel.ts` | 首分钟漏斗、引导提示、发呆、中途退出（附 vitest 测试）；`funnelReport()` 给开发辅助用 |
| `src/platform/playgama-bridge-config.json` | Bridge 配置，`vite.config.ts` 在 dev 时提供、build 时输出到 `dist/` 根目录 |
| `scripts/package.ts` / `scripts/size.ts` | `npm run package` / `npm run size` |
| `scripts/lines.ts` / `vitest.config.ts` | `npm run lines`（单文件 ≤ 500 行）/ `npm run coverage`（覆盖率下限，sim/meta/i18n 各有更高门槛） |
| `scripts/onboard.ts` | `npm run onboard`：新存档在无头 Chrome 里跑前 5 分钟，机器人照引导的手操作，报空档和停住（[onboarding.md §12.8](design/onboarding.md)）；要本机装 Chrome 或 Edge，不进 CI |
| `.github/workflows/ci.yml` | push 到 main 和 PR 时跑 typecheck → lines → coverage → build → size |

## 平台选择

- **先看 CrazyGames**：`wantsCrazyGames()` 为真就走 `crazygames.ts`，失败才退到 `offline.ts`。放在 Bridge 前面是因为两个 SDK 脚本互斥（见下节），CG 的包里没有 Bridge 脚本，而 `wantsPlaygama()` 只要见到 `window.bridge` 就会认领页面。
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
- `storage`：字符串值。启动时 `preload(['save','lang',...音效键])` 一次批量 `storage.get([...], false)`，之后这几个键的 `get` 从缓存取；`set` 只在有意义的变化时调用（一局入账、购买、设置）。Playgama 下**只走 Bridge**，游戏不写 localStorage（Bridge 自己选云端或本地）；读写失败只 warning，值留在内存里撑到本次页面关闭。测试桩用带前缀 `swarm-orbit:` 的 localStorage。
- `language()`：Playgama 下只取 Bridge `platform.language`（平台没给时 Bridge 自己退回浏览器语言）；测试桩用浏览器语言。
- `track(event, data)`：Playgama 下走 `bridge.analytics.send(event, data)`（Bridge 2.3+，数据是扁平的 string/number/boolean，后台按事件名和字段统计）；没有 analytics 模块的旧 Bridge 退回 `platform.sendCustomMessage`，那条路在后台只显示成一个不带字段的 `platform_custom_message`（0.0.9 及以前的埋点都是这样，读不到）。初始化前设置 `bridge.gameVersion = __APP_VERSION__`，每条事件（包括 Bridge 自己的 game_ready、gameplay_30s 等）都会带上 `game_version`，可以按版本对比。

## 插屏规则（§14）

游戏在每次离开结算卡时调用 `showInterstitial()`，弹不弹由平台决定（Bridge 官方要求：不要自己加计时器或计数器）。

测试桩里 `InterstitialPolicy` 代替 Bridge 的节奏，免得本地每局都弹：每次调用算一局结束；第 2 局结束起才可能弹；距离上一次任何广告（插屏或激励）至少 3 分钟。

## 分析事件（M5 验收：60 秒留存 ≥ 65%，平均会话 5 分钟）

| 事件 | 数据 | 何时 | 用途 |
| --- | --- | --- | --- |
| `load` | `{ ms, page, platform, runs, best, sdk, dl, main, build, save, warm, warm_timeout?, gpu, q, stage_ms, gl_ms, psc, compile_ms, prime_ms?, draw_ms?, long_n?, long_ms?, long_max?, long_at? }`：`ms` 从游戏 chunk 开始跑起（0.0.16 起游戏 chunk 不等 initialize 就跑，`ms` 含剩下的 SDK 等待，和之前版本不能直接比），`page` 从页面加载起，其余是各加载步骤结束的时刻（`loading.ts` `bootTimes`；游戏 chunk 重取过的还有 `retry`，见 `boot_error`）；`warm` = 开局要用的着色器编完（0.0.16 起只编第一关/本存档开局可见的那些，其余在显示后后台编，记为 `warm_rest`，不进本事件；老玩家落在村子里，预热的是村子关卡卡片上那一关（`cardLevel`；无尽模式开局只有毛虫，预热第一关的））；`warm_timeout` = 着色器 12 秒（2026-11-11 起 6 秒）没编完、没等它就开了；`gpu` = WebGL 报的显卡名（最多 100 字符，浏览器不给就是空），`q` = 起步画质档位，软件渲染是 5（0.0.17，§15.6）；0.0.33 起开局编译慢的机器也直接从低档起步（场景自己的着色器编译超过 1.5 秒起 4 档、超过 4 秒起 5 档；这个数不是 `warm` − `save`，0.0.37 起直接发为 `compile_ms`），所以 `q` ≥ 4 的会话既有软件渲染的，也有显卡弱的，要配 `gpu` 一起看。0.0.37 起加细的启动计时（2026-11-18：7/35 的会话 18–50 秒才见到首帧，5 个一下没点就走，`build` 比下载晚 3–10 秒、`page` − `save` 超过 6 秒等待上限，主线程被堵住但不知道堵在哪）：`main` = 游戏 chunk 的模块跑完、开始搭场景的时刻；`stage_ms` = 搭场景（`createStage`）用时，其中 `gl_ms` = 建 WebGL 上下文（`new WebGLRenderer`）；`psc` = 有没有 `KHR_parallel_shader_compile`（1/0，没有它 compileAsync 也是同步编）；`compile_ms` = 场景自己的着色器编译（就是定档用的那个数）；`prime_ms` = 开局离屏画一遍（虫子的阴影变体在这里建），`draw_ms` = 第一帧；`long_n`/`long_ms`/`long_max` = 加载页在时主线程长任务（≥50 ms）的个数、总时长、最长一个，`long_at` = 最长那个开始时已结束的最后一步（`dl` = 游戏 chunk 在跑、在搭场景）——只有 Chrome 有，而且发 `load` 的这个任务本身还没结束、不算在内（它里面的就是 `prime_ms` + `draw_ms`）。等待超时（`warm_timeout`）时 `prime_ms`/`draw_ms` 还没有。0.0.37（归档 cmwlviwbr1su4mw0hrj1et0ym，提交 a627d14 打包）2026-11-18 08:44 UTC 在沙盒上线，只有这一项改动 | 着色器编完（最多等 12 秒，2026-11-11 起 6 秒）后、`gameReady()` 同时；0.0.15 起不再等下一个 `requestAnimationFrame`（隐藏或 0×0 的跨域 iframe 里浏览器不给 rAF，宿主可能又在等 `gameReady` 才显示 iframe） | 会话分母；首帧 < 3 秒 |
| `boot_left` | `{ stage, sdk, dl, s, pct, w, h, pf }`：`stage` = 最后结束的加载步骤（`start` 还没有任何一步；0.0.16 起 `build` 不再意味着 SDK 已完），`sdk`/`dl` = SDK 有结果了没（初始化完或被放弃）、文件下完了没，`pf` = 平台 id（`''` = 还没结果，`offline` = SDK 被放弃，0.0.16），`pct` = 进度条百分比，`w`×`h` = 当时窗口尺寸 | 游戏出现前页面隐藏或 `pagehide`；每会话一次（`boot.ts` 发，平台还没就绪时直接走 `window.bridge.analytics.send` 排队） | 加载中走掉的人停在哪一步（0.0.15） |
| `platform_offline` | `{ why }`：Bridge 的错误信息（最多 80 字符），慢的那种是 `Bridge initialize took over 10000 ms` | Playgama 页面上 Bridge 失败或超时、换成 `offline.ts` 时；排在 Bridge 队列里，initialize 后来完成才会发出去 | 多少人玩的是没广告、不存档的版本（0.0.16） |
| `boot_error` | `{ stage, kind, name, msg }`（`main` 那种另带 `pf` 和 `retried`）：`main` = 游戏 chunk 下载或运行失败（如没有 WebGL2），`start` = 读存档/语言/平台时抛错。Playgama 会把自由文本的 `msg` 屏蔽掉（2026-11-08 第一条就是），所以 0.0.18 起原因另用固定词 `kind` 发：`fetch` = 脚本没下来（网慢或断了），`webgl` = 浏览器给不了 WebGL2，`other` = 其它；`name` = 错误类型（`TypeError` 等，`bootfail.ts`）。`main` 的 chunk 没下来时先隔 1.5 秒换个 URL（`?retry=1`，浏览器可能缓存失败的模块导入）再取一次，`load` 的步骤时刻里多一个 `retry`；再失败才发本事件，`retried: true`。chunk 跑起来后抛的错不重跑（它已经做了一半）。0.0.18（归档 cmw7vihuy1gmhmt0hxtgxggpa，提交 898f558 打包）2026-11-08 13:34 UTC 在沙盒上线 | 启动失败；加载页换成全屏的 ↻ 重新加载按钮，而不是停住的进度条 | 启动失败率 |
| `run_start` | `{ mode, hero, runs, n }` | 每局开始；0.0.15 起新玩家直接进的第 1 关也发（之前漏了）；`n` = 本页面开的第几局（0.0.38） | 局数分母 |
| `run_quit` | `{ mode, wave, t, runs }` | 一局中从暂停菜单回基地（这一局作废）；第一局没有这个按钮 | 中途放弃 |
| `first_buy` | `{ t, stat }` | 本次会话第一次买属性；`t` 为模拟秒数 | 新手漏斗；首个属性选择 |
| `first_reverse` | `{ t }` | 本次会话第一次让火车掉头 | 新手漏斗 |
| `wave_cleared` | `{ wave }` | 第 N 波打完（即第 N+1 波开始时，`wave = N`） | 进度分布 |
| `run_end` | `{ wave, time, hero, kills, revived, doubled, mode, stars, crystals, buy_*, gold_left, fence_low, wagons?, picks?, reach?, record? }`；关卡局另带 `reach` = 开局时这一关以前输过的最远波数（`Save.reach`，没输过是 0）、`record` = 这一局是输了而且比 `reach` 远（失败卡上的「新纪录！」，中途退出的局是 false；0.0.38，runloop.md §2.4）；开着车厢的局另带 `wagons` = 结束时挂的车厢和等级（如 `arc3,frost2`，挂的顺序）、`picks` = 本局选过几次（0.0.23）；`buy_<stat>` = 本局用金币买了几级（八个属性各一个数字，不含养成带来的等级）、`gold_left` = 结束时没花掉的金币、`fence_low` = 围栏最低点百分比（0.0.33） | 一局结束；`time` 为模拟秒数取整 | 单局时长、英雄对比、**买什么决定输赢** |
| `result_train` | `{ stat, lv, won, mode }` | 结算卡上点训练格子买了一级（0.0.38，runloop.md §2.2）；`lv` = 买完的等级，`won` = 胜利卡还是失败卡 | 结算卡上当场训练的比例 |
| `revive` | — | 看完激励广告复活成功 | 复活使用率 |
| `ad_rewarded` | `{ placement, ok }` | 每次激励广告结束 | 广告完成率 |
| `session_time` | `{ s, q, fps }` | 页面可见时每 30 秒一次，`s` 为累计秒数；`q` 是当时的画质档位（0 high … 5 soft，§15.6），`fps` 是最近 2 秒的平均帧率 | 60 秒留存 = 有 `s ≥ 60` 的会话 / `load` 会话；平均会话时长 |
| `performance_sample` | Playgama 规定字段：`target_fps`(60) `window_ms` `active_ms` `frame_count` `fps_avg` `fps_p10` `frame_time_p50/p95/p99/max_ms` `frames_over_50/100/250/500/1000ms` `build_version`；另带本窗口的 `long_task_count/total_ms/max_ms`（只在支持 longtask 的浏览器）、`js_error_count` `unhandled_rejection_count` `webgl_context_loss_count`；以及发送时的局面 `mode`（关卡序号或 endless）`wave` `q`（画质档）`bugs`（场上虫数），和本窗口最长卡顿时的同一组值，前缀 `long_task_`（如 `long_task_wave`），外加只给最长卡顿记的 `long_task_busy` `long_task_busy_ms`（`src/platform/busy.ts`：卡顿发生时页面最近一次主动占用主线程的事由——`warm` 编译着色器、`q` 画质降档重建程序、`save` 写存档、`wagon` 刚选了车厢——和距那次标记过了多少毫秒；`busy_ms` 远大于 `long_task_max_ms` 说明只是时间上挨着，不是同一件事） | 战斗进行中且页面可见（不在村落、没暂停、没广告、没被宿主暂停、没结束）每累计约 30 秒发一次；一局结束或页面隐藏时，已攒 ≥ 10 秒的不满窗口也发出，不足的留到下次。暂停/隐藏后恢复的那一帧不算（`src/platform/perf.ts`） | 真机帧率、卡顿分布；按 `build_version` 对比版本；卡顿出在第几波、多少虫 |
| `wagon_offer_<n>` | `{ n, wave, opts, s }`：id 里的 `n` 到 10 封顶（`wagon_offer_10` = 第 10 次及以后）；`n` = 本局第几次三选一，`opts` = 卡的 id 加等级（如 `arc1,missile1,frost1`），`s` = 模拟秒数 | 车厢三选一弹出时（0.0.23，docs/design/wagons.md §10.1.9） | 一局弹几次、第一次在多少秒 |
| `wagon_pick_<how>_<id>` | `{ n, id, lv, auto, ms }`：id 里 `how` = `tap`（玩家点的）、`auto`（倒计时替选）、`paid`（只剩一张金币卡，没停战直接给），`id` = 卡（`arc` … `magnet`、`gold`、`repair`、`skill`），如 `wagon_pick_tap_frost`；`auto` = 1 是 10 秒倒计时替玩家选的（选带 ⏱ 的那张，`fallback()`），`ms` = 从弹出到选定的毫秒（选卡时游戏按 x1 走，约等于真实时间，自动选恒为 10000） | 选定一张时 | 车厢偏好；`auto` 多说明三选一是打扰（`paid` 不算选择，不进这个比例）。后台按 id 统计，所以 `how` 和 `id` 写进 id（0.0.23 发布前定的） |
| `language` | `{ locale }` | 玩家在村落里换语言 | 语言分布、翻译优先级 |
| `funnel_<step>` | `{ s, … }` | 每个漏斗步骤本次会话第一次到达，见下表 | 首分钟漏斗：各步到达率和耗时 |
| `guide_<id>_shown` | `{ s, run, wait }` | 引导的手第一次出现；`run` = 已打局数，`wait` = 从这一步能做到出手的秒数；`id` 见下 | 哪一步卡人、出手是否及时 |
| `guide_<id>_done` / `_skipped` / `_left` / `_replaced` | `{ s }` | 手出来后：照做了 / 点了别的按钮跳过 / 条件消失或超时（`cast`、`idle_cast` 8 秒）、手没被理会就走了 / 更靠前的一步把手抢走了（0.0.15）。每个 id 每会话各发一次 | 哪一步被跳过、被无视 |
| `idle_<stuck>` | `{ s, wave, stuck, hint? }`（`hint` = 当时手指着的引导 id） | 一局进行中（没结束、不在村落、没有广告、没被宿主暂停）连续 15 秒没有任何指针/按键输入；每段发呆一次，每会话最多 5 次 | 卡在哪一步不动了 |
| （所有事件） | 额外带 `ab: 'buy1_a' | 'buy1_b'` | **只有 0.0.21**（2026-11-10 09:11 UTC 起）：A/B 分组 buy1，0.0.22 去掉（docs/design/benchmark.md）。之后的事件不带这个字段；存档里留下的 `ab` 键没人读 | 只用来读 0.0.21 的会话 |
| `quit_<stuck>` | `{ s, wave, stuck, hint?, at, run_t, n, q, fps?, quiet, fence?, bugs?, gold?, card?, kills?, buys?, wagons?, charge?, pick?, pick_ago? }`；`at` = 离开时在哪：`run`（战斗中）、`over`（结算卡）、`village`（村落）、`ad`（广告里）；`n` = 本会话第几次离开；`q` = 当时的画质档位；`fps` = 从第一帧到离开的平均帧率（按真实时钟算，不受游戏 dt 0.1 上限影响；超过 1 s 的帧间隔，即切走的标签页，不计；还没计时到帧时不带）；`quiet` = 离开前多少秒没有任何输入（从没输入过就是从加载起算）；`fence` = 围栏剩余 %、`bugs` = 场上虫数、`gold` = 手上金币、`card` = 有没有买得起的卡（1/0）、`kills`/`buys` = 本局击杀和购买次数（0.0.21 起，`world.scene()`，有 world 时才带）；开着车厢的局（0.0.23）另带 `wagons` = 车厢节数、`charge` = 充能 %，三选一开着时离开再带 `pick: 1`，选过卡的再带 `pick_ago` = 离上次选卡多少秒（看是不是选完就走） | 游戏画面出来之后，页面每次隐藏（`visibilitychange` → hidden，或 `pagehide`）都发，每会话最多 5 次；hidden 之后紧跟的 `pagehide`（中间没跑过一帧）算同一次。所以一个会话**最后一条** `quit_*` 的 `s` 就是玩家离开的时刻和位置，之后还有事件说明玩家又回来了。0.0.19 之前只在战斗中第一次隐藏时发、每会话一次，结算卡和村落里走的人没有离开时刻。`quiet` 和离开画面是 0.0.21 加的：0.0.20 的开局改动是猜的原因，离开事件只说了在哪走、没说走时画面上是什么（被虫淹了、没事干、还是看不懂），所以加上，用来区分。`q`/`fps` 也是 0.0.19 加的：`performance_sample` 每 30 s 才一条，30 s 内就走的玩家没有任何帧率数据，没法回答「是不是卡走的」（2026-11-08，15 秒内离开的 12/51 个新玩家）。0.0.19（归档 cmw7zmz181jsgmt0h5cc940dz，提交 020cf1c 打包）2026-11-08 15:30 UTC 在沙盒上线。在 `window` 的捕获阶段发，赶在 Bridge 挂在 document 上的同一事件用 sendBeacon 把队列发走之前；0.0.14 之前等 `pagehide` 才发，那时队列已经发完，事件丢了（2026-11-06 一整天只到 1 个） | 离开时刻和位置；中途退出（rage-quit）信号 |
| `pulse_<stuck>` | 和 `quit_<stuck>` 相同，只是没有 `n` | 游戏画面出来后，页面可见时每 10 秒一次（`PULSE_S`，战斗、结算卡、村落都发），每会话最多 60 次（`PULSE_MAX`，即前 10 分钟）；切到后台不发，回来重新计时（0.0.39） | **离开事件丢失时的替代**：2026-11-20 查到约五分之一点过屏幕的会话（44/199，多为 Windows）收不到 Bridge 在 hide/pagehide 时用 sendBeacon 发的最后一批，`quit_*` 和最后不到 30 秒的事件一起丢了，而每 30 秒定时发的批次都到了。没有 `quit_*` 的会话，取最后一条 `pulse_*` 当离开时的位置和画面（误差不超过约 40 秒） |

**平均游玩时长只能读 `session_time` 的 `s`，不能读后台总览的 `sessions.avg_duration_seconds`。** 后者是一个会话里第一条和最后一条事件的墙钟间隔，标签页开着不玩也在走。2026-11-15 的四个会话里它给出平均 55 分钟、中位 66 分钟，而 45 条 `session_time` 心跳（每 30 秒可见时间一次）加起来只有 1350 秒，四个会话平均 5 分 37 秒，最长的一个 510 秒——和 Playgama 控制台自己显示的 4 分 3 秒是同一个量级。差出来的那 50 分钟是标签页摆着没动。要算一个会话真正玩了多久，取它 `session_time.s` 的最大值。

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
| `first_offer` | 第一次弹出车厢三选一（0.0.23；第一分钟后才可能有，所以拿它 ÷ `first_tap` 看多少点过屏幕的人见到了车厢） | `run_t` |

后四个是支线，不参与 `stuck`。

**引导 id**（`src/view/guide.ts` 的步骤表，设计见 [onboarding.md](design/onboarding.md) §12）：
- 第 1 关：`buy`、`reverse`（这两步停住等）、`basket`、`cast`；第 2、3 关：`goldbug`、`multi`、`speed`。
- 结算：`win`（指「回基地」）、`lose`（指「去训练」）。
- 回村 ①：`v_train`、`v_daily`、`play1`；回村 ②：`v_hero`、`v_wall`、`v_route`、`play2`。
- 之后：`l_ach`、`l_task`、`l_hero`、`l_pick`、`l_piggy`、`l_endless`、`l_challenge`。
- `cast` 和 `idle_cast` 的手最多停 8 秒，然后让开 20 秒（`CAST_TTL`/`CAST_COOL`），买属性的提示才轮得到（0.0.15）。
- 闲置提示：`idle_cast`（第 1–3 关技能蓄满 4 秒）、`idle_buy1`（第 1–3 关买过之后 4 秒）、`idle_buy`（第 4 关起战斗 10 秒）、`idle_play`（村落 20 秒），不进存档；后两条忽略 3 次就不再出，前两条不设上限。

**为什么埋购买**：2026-11-15 在无头模拟里量到，局内买什么比手速重要得多——同一批种子、同样的养成，1-10 关"最便宜优先"十战十败，把围栏加进购买列表就能 21% 围栏通关，1-7 和 1-10 的围栏差到 40 个点。在这之前 `run_end` 知道波数、击杀和星级，却不知道玩家买了什么，于是"因为没买围栏而输"和"因为关卡太难而输"在埋点里长得一模一样。每个属性一个数字（而不是拼成一个字符串），是为了让 Playgama 的数值字段分布能直接用。

**开发辅助**：测试桩下在控制台运行 `game.funnel()`，按顺序打印 `window.__track` 里的漏斗相关事件（`load`、`first_buy`、`run_start`/`run_end`、`funnel_*`、`guide_*`、`idle_*`、`quit_*`），带每步的 `s` 和距上一步的 `dt`。

## CrazyGames（`crazygames.ts`）

和 Playgama 并排的第二个宿主，文档见 docs.crazygames.com/sdk/intro（对着 2026-11-23 的 v3 写的）。三处玩家能感觉到的不同：

- **没有自定义埋点。** v3 的 `analytics` 只有 `trackOrder`（内购），送不出我们自己的事件。所以 CG 上**唯一**的读数来源是上一节那套自建收集——它得先存在，这个适配器才有意义。`track()` 在这里只在 dev 下打控制台，同一条事件由 `Collector` 发到我们的端点。
- **广告是回调，不是 promise**：`requestAd(type, {adStarted, adFinished, adError})`。装了广告拦截、没有填充、离上一条中插不到 ~3 分钟（SDK 自己掐的节奏），都从 `adError` 回来——是正常答复，不是异常。只有 `adFinished` 才发奖励。90 秒没有任何回调就自己放手，免得结算卡卡死。
- **存档是同步的**（`data.getItem`），SDK 在 `init()` 里就预读好了。接口仍是 async（Bridge 的形状），读写都兜住异常：提交时没开 Progress Save 的话每次调用都抛 `dataModuleDisabled`，这时写入仍然留在内存里，玩家这一页的进度不丢。

其余和 Playgama 一致：`loadingStart/Stop`、`gameplayStart/Stop`（同状态重复调用忽略），广告期间 `onPause(true/false)`，`game.settings.muteAudio` 跟着站点的静音开关（玩家在站点上的选择优先于我们的），`language()` 取 `user.systemInfo.locale`，插屏仍然每个自然停顿调一次、节奏交给 SDK。

装了广告拦截（`hasAdblock()`）时 `rewardedSupported()` 返回 false，只是把复活/双倍按钮藏起来——**游戏照常能玩**，这是他们的硬性要求。

SDK 脚本是锁域名的：不在 CrazyGames 域名下 `environment` 是 `'disabled'`，每个调用都抛。所以初始化后立刻检查一次，让 `offline.ts` 在这里接手，而不是等游戏里一个个调用去炸。本地调试用 `?platform=crazygames`，他们的本地模式用 `?useLocalSdk=true`。

**两个 SDK 不同时在场**：`vite.config.ts` 按 `VITE_HOST` 决定 `</body>` 前插哪一个脚本（默认 Playgama）。两个适配器都把"对方的全局变量在"当成"这是对方的页面"，同时存在会互相认错。CG 的文档要求脚本放 `<head>`，我们和 Bridge 一样放在 `</body>` 前（首屏白屏的同一个理由），脚本不在时 `crazygames.ts` 会自己加载它。

## 自建收集（`VITE_TELEMETRY`）

Playgama 后台替我们填了会话、玩家、时刻、机器、版本；CrazyGames 的 SDK 连自定义事件都没有
（v3 的 `analytics` 只有 `trackOrder`）。所以同一批事件**双发**：宿主那一份原样不动（沙箱读数要能和历史比），
另一份带信封发到我们自己的端点。缺口和理由见 [telemetry/self-hosted.md](telemetry/self-hosted.md)。

- **开关**：构建时的 `VITE_TELEMETRY`（端点 URL）。没配就一条也不发，游戏行为完全不变。
  dev 下可以用 `?telemetry=<url>` 临时指一个本地 collector，`?telemetry=off` 关掉；**正式包不认这个参数**
  （地址栏是宿主页面给的，不能让它改我们的上报目的地）。
- **信封**（每批一次，不是每条）：`sid` 会话 id、`uid` 玩家 id（读到存档之后才有，之前的批按 `sid` 并）、
  `v` 版本、`n` 第几批、`t` 发送时刻。每条事件带 `e` 名字、`i` 会话内序号、`s` 页面时钟秒数、`t` 入队时刻、`d` 原始数据。
  事件名和字段和上表完全一致——id 里带参数（`wagon_pick_tap_frost`）是 Playgama 后台的限制，自建之后没有这个限制了，
  但**不要改**，改了就和沙箱的历史读数对不上。
- **攒批**：满 24 条或 5 秒发一次；`visibilitychange`→hidden 和 `pagehide` 用 `sendBeacon` 冲走（它是离页后唯一还能送出去的）。
  送不出去的留在队列里下次补发，队列上限 400 条，超了丢**新**的（开局那一段没有别的事件能替代），
  并在下一批里发一条 `telemetry_dropped {n}` 说明丢了几条——读数时看得见洞，比悄悄给一段短记录强。
- **三个只发给自己的事件**：`client`（机器事实，见 `clientinfo.ts`：UA、屏幕和窗口、dpr、语言、时区、核数、内存、
  网络、触点、来路 origin、`bot` = `navigator.webdriver`、`vis` = 初始可见性）、`player`（`since` 首见日、`runs`、`best`、
  已通关数）、`telemetry_dropped`。宿主那边不发这三个：Playgama 后台本来就有，发过去只是噪音。
- **隐私**：只有设备能力，没有个人信息，没有自由文本字段；`uid` 是随机数，不由任何可追溯的东西推出来；
  referrer 只取 origin（path 和 query 什么都可能带）；国家由服务端按 IP 解析，**IP 不入库**。

## 收集端（`server/`、`wrangler/collect.jsonc`）

Cloudflare Worker + R2，一批一个对象，拉回来是 NDJSON——和 `telemetry-archive/` 里 Playgama 那几年的形状一样，
所以读的脚本只写一套。选它不是因为快，是因为它**没有要维护的东西**：没有表结构要迁移、没有行数上限、
两次请求之间什么都不跑。

- **端点**：`POST /c` 收一批（204，不回任何内容）；`GET /export?day=YYYY-MM-DD` 导出一天（NDJSON）；
  `GET /days` 列出有数据的天；`GET /` 一行自我介绍。导出那两个要 `Authorization: Bearer <EXPORT_TOKEN>`，
  **没配或者 token 不对都回 404**——401 等于告诉别人这里有东西。
- **键**：`v1/<天>/<sid>/<第几批四位>-<接收时刻>.json`。一天是一个 `list` 前缀；同一会话的批次过了十位还按顺序排；
  补发不会覆盖第一次的那份；真被灌了就是删一个前缀。**天按服务端接收时刻算**，不按客户端的钟——那是玩家的钟。
- **`server/wire.ts` 是两头共用的**：客户端按它发，服务端按它收，想改一个字段就只有一个地方可改。
  校验是**只删不拒**：认不出的字段扔掉、整批留下，这样客户端加字段之后旧包还读得出来。
  同时它就是隐私规则——嵌套和数组扔掉（自由文本藏在里面）、字符串超 96 字扔掉、一条最多 40 个字段、
  一批最多 200 条、body 最多 64 kB。
- **不落库的**：IP（只用来做限流的 key 和让边缘解析国家，国家写成 `c`，地址一个字节都不写）、
  任何自由文本、任何跨站标识。
- **限流**：Cloudflare 的 ratelimit 绑定，每 IP 每分钟 120 批。它按边缘节点各算各的，所以是粗筛不是闸门。
- **`ORIGINS`**：留空就谁都收。配了就按域名收——**配错了会悄悄丢掉真玩家的数据**，所以宁可留空。
  没有 `Origin` 头的照收：离页后发出的 beacon 就是这样。
- **域名**：`sx.gamestao.com`，故意起得没有含义。拦截名单认 `telemetry.`／`analytics.`／`metrics.`，
  而被拦掉的恰恰是我们最想看到的那些玩家。
- **部署**：2026-11-24 **已经上线**（gamestao.com 的 Cloudflare 账号，bucket `swarm-orbit-telemetry`，
  Worker `swarm-orbit-collect`，自定义域 `sx.gamestao.com`）。当天实测过一条：POST 回 204，
  导出读得回来、带边缘解析的国家，不带 token 回 404，测试那条已经删掉，桶是空的。
  重来一遍的顺序是：`wrangler r2 bucket create swarm-orbit-telemetry` →
  `npx wrangler deploy -c wrangler/collect.jsonc` → `npx wrangler secret put EXPORT_TOKEN -c wrangler/collect.jsonc`。
  仓库变量 `COLLECTOR_DEPLOY_ENABLED=true`、`VITE_TELEMETRY=https://sx.gamestao.com/c` 也都配好了，
  所以**下一次推到 main，CI 会自己部署 Worker，而且从那一版起打的包就开始上报**
  （API token 要有 Workers R2 Storage:Edit，没验证过，第一次推上去才知道）。

## 读数据

```bash
COLLECTOR=https://sx.gamestao.com TELEMETRY_TOKEN=... npm run telemetry:pull       # 最近一天
... npm run telemetry:pull -- all                                                   # 全部
npm run telemetry:trace                       # 每个会话一行
npm run telemetry:trace -- --v 0.0.42         # 只看一个版本
npm run telemetry:trace -- --sid ab12cd34ef5  # 一个人的逐条记录
npm run telemetry:trace -- --trace            # 所有人的逐条记录
```

拉下来的天放在 `telemetry-archive/self/`（不进 git：原始数据留在 R2，读出来的结论写进 `docs/telemetry/`）。
导出是流式的，状态行在读第一个对象之前就发出去了，所以中途失败是body里的一行 `{"error":...}`——
pull 脚本会认出它并把退出码置 1，否则一个坏掉的天会读成空的一天。
读法本身见 [telemetry/low-traffic-method.md](telemetry/low-traffic-method.md)：20 个人的量级上定位而不是测量。

EXPORT_TOKEN 放在仓库根目录的 `.env.local`（在 `.gitignore` 里，不进 git；和 Worker 那个 secret 是同一个串）。
读之前 `set -a && . ./.env.local && set +a`，`COLLECTOR` 和 `TELEMETRY_TOKEN` 就都有了。
丢了就换一个：`npx wrangler secret put EXPORT_TOKEN -c wrangler/collect.jsonc`，桶里的数据不受影响。

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

CrazyGames 的包用 `npm run package:cg`：同一份代码，`VITE_HOST=crazygames` 构建（页面里换成 CG 的 SDK 脚本，不输出 Bridge 配置），产物是 `release/swarm-orbit-cg-<version>.zip`。两个 zip 不能互传——传错门户的那份在对方页面上没有 SDK，只会落到 `offline.ts`。

`vite.config.ts` 设了 `base: './'`，门户从子路径托管时资源路径才不会错。

`release/` 目前没有写进 `.gitignore`（本会话不能改它），接入时顺手加上。
