# 自建遥测服务端：现在收的数据够不够（2026-11-23）

CrazyGames 的 SDK **没有自定义事件这一说**。v3 的 `analytics` 模块只有一个方法，`trackOrder`，
是给内购订单用的；玩家数、时长、留存只在 CG 自己的后台看，我们埋的漏斗它一条都不收。
所以上 CG 就必须把 `platform.track` 接到我们自己的服务端。

结论先说：**埋的内容绰绰有余，缺的全是「信封」**——那些一直由 Playgama 后台替我们填、
我们自己从来没发过的字段。改动集中在一处（一个 `track` 的包装 + 一个 collector），
不用动那四十几个埋点的调用处。

## 1. 内容：够，而且比需要的多

现有事件表见 `docs/platform.md`「分析事件」。CG 的三个门槛指标都能从里面直接算：

| CG 看的 | 我们怎么算 |
| --- | --- |
| 转化率（玩满 1 分钟 ÷ 进页） | `session_time.s ≥ 60` 的会话 ÷ `load` 会话 |
| 人均时长 | 每会话 `session_time.s` 的最大值（**不是**墙钟间隔，见 platform.md 的告诫） |
| 次日留存 | ——**算不了，见 2.2** |

自己要看的（漏斗、引导、发呆、离开时画面上是什么、买了什么决定输赢、真机帧率）全在，
而且比 Playgama 后台能统计的还细——后台按事件 id 聚合、附带字段不一定进得去，所以我们
把参数塞进了 id（`wagon_pick_tap_frost`、`funnel_first_cast`、`quit_done`）。
**自建之后这个束缚没有了**，但 id 不要改：改了就没法和沙箱上的历史读数对比。
字段照发，服务端按 `name` + `data` 存就行。

## 2. 缺的六样

### 2.1 会话 id（最要紧）
现在每条事件是独立发出去的，**彼此之间没有任何东西把它们连起来**。
Playgama 后台靠它自己的会话归并，我们才读得到「某一个人在第 37 秒点了屏幕、第 90 秒走了」。
低流量方法（`low-traffic-method.md`）整套都建立在单人逐条记录上——没有会话 id，
这套方法一条也用不了，只剩下平均数，而平均数在 20 个人的量级上是废数。

### 2.2 玩家 id 和首见日期
`Save` 里没有任何标识，也没有「第一次玩是哪天」。现在判断新老玩家靠 `runs`（0 = 新），
这既分不出「昨天玩过今天又来」，也在离线会话里恒为 0。
**次日留存是 CG 的门槛指标之一，没有这两样就算不出来。**
CG 上可取的身份有两种：`SDK.user.getUserToken()` 给一个可在服务端验签的 JWT，
里面有 CG 的 userId——但只有登录用户才有；匿名玩家只能我们自己在存档里塞一个随机 id。
两条都要：有 token 用 token（跨设备也认得出），没有就用设备 id。

### 2.3 时间戳和顺序
`s`（页面时钟）只有一部分事件带：`load`、`boot_left`、`funnel_*`、`guide_*`、`quit_*`、`pulse_*`、
`wagon_offer_*` 有；`run_start`、`run_end`、`wave_cleared`、`revive`、`ad_rewarded`、`result_train`、
`language` **都没有**。以前靠后台的接收时刻排序，一旦我们改成攒批发送，接收时刻就不准了。
包装里统一加 `t`（`Date.now()`）和 `s`（`performance.now()`），顺带加一个自增 `i` 防乱序。

### 2.4 机器和来路
Playgama 后台替我们填了 OS、窗口尺寸、国家。我们自己只在 `boot_left` 里发过 `w`×`h`、
在 `load` 里发过 `gpu`。自建之后这些要自己发一次：UA / OS、屏幕和窗口尺寸、语言、
`document.referrer`（CG 上是哪个页面点进来的）、以及服务端按 IP 解析的国家（**IP 不要落库**）。

### 2.5 版本号
`game_version` 一直是 Bridge 注入的（`b.gameVersion = __APP_VERSION__`）。CG 上没人注入。
必须自己带——否则版本之间没法对比，而我们每一次判断都是版本对比。

### 2.6 送达
现在是一次调用发一条，交给 Bridge 排队，它在 hide/pagehide 时用 sendBeacon 冲走队列。
**这条路已经丢过数据**：2026-11-20 查到约五分之一点过屏幕的会话收不到最后一批，
`quit_*` 连同最后不到 30 秒的事件一起没了，`pulse_*` 就是为此加的。
自建的 collector 必须自己做这件事：攒批（比如 5 秒或 20 条）、
`visibilitychange`/`pagehide` 时 `navigator.sendBeacon` 冲走、失败的留在内存里下次补发。
做对了反而比现在强——`pulse_*` 的采样率可以降回去。

## 3. 量级

一个 10 分钟的会话大约发 150～200 条（`pulse_*` 封顶 60、`performance_sample` 约 20、
`wave_cleared` 每波一条、漏斗和引导各十几条），JSON 约 30 kB。
沙箱上一天 20 个人无所谓，CG 上一天几千个会话就是每天上百万行。
所以 collector 从第一天就要：攒批上行、按会话采样 `pulse_*` 和 `performance_sample`
（比如只给 10% 的会话发，其余只留漏斗和 run 事件）、行里不存 IP 和任何自由文本。

## 4. 隐私

现在的事件里**没有任何个人信息**，这一点要守住：不要加自由文本字段（`boot_error.msg`
在 Playgama 上就被屏蔽过），玩家 id 用随机数而不是任何可追溯的东西，不跨站、不做广告归因。
CG 要求游戏有隐私政策，自建收集要在里面写明收了什么。

## 5. 要改的

1. ~~`Platform.track` 之上加一层 collector（`src/platform/collect.ts`）：填信封、攒批、beacon、重发。
   四十几个埋点调用处一个都不用动。~~ **2026-11-23 做了**，连同 `src/beacon.ts`（入口那一头，发 `boot_left`）
   和 `src/platform/clientinfo.ts`（`client` 事件）。没配 `VITE_TELEMETRY` 就一条也不发，见 platform.md。
2. ~~`Save` 加 `uid`（随机）和 `since`（首见日期），进存档迁移。~~ **2026-11-23 做了**。老存档拿到 id，
   但 `since` 留空：它不是今天建的，写成今天会把每个回头玩家都算成新人。
3. ~~服务端那一头：一个接收端点 + 存储 + 能跑单人逐条记录的查询。~~ **2026-11-23 做了**：
   Cloudflare Worker + R2（`server/`、`wrangler/collect.jsonc`），一批一个对象，
   键是 `v1/<天>/<sid>/<第几批>-<接收时刻>.json`；`GET /export?day=` 导出一天的 NDJSON，
   `scripts/telemetry-pull.ts` 拉到 `telemetry-archive/self/`，`scripts/telemetry-trace.ts` 按人读。
   校验（`server/wire.ts`）两头共用，只删不拒；IP 不入库，只用来限流和让边缘解析国家。细节见 platform.md。
4. ~~一个 `crazygames.ts` 平台适配器（广告、存档、`gameplayStart/Stop`、`getUserToken`）。~~ **2026-11-23 做了**：`src/platform/crazygames.ts`（v3 SDK，广告走回调、存档走同步的 `data`、站点静音和暂停、`?platform=crazygames` 可强制），`VITE_HOST=crazygames` 的构建换掉页面里的 SDK 脚本，`npm run package:cg` 出 CG 的 zip。细节见 platform.md。`getUserToken` **没接**：它是给有后端的游戏验证账号用的，我们没有后端，玩家身份就是存档里那个随机 `uid`——接了反而会多出一个能追溯到人的东西。
5. ~~Playgama 这边**同时也接上**：同一套信封双发，这样沙箱和 CG 的读数能放在一起看，
   而且不再受后台「按 id 聚合」的限制。~~ **做了**：`Analytics.track` 不分宿主，两边都发
   （`src/platform/analytics.ts`），所以下一版沙箱包就开始双发。

**2026-11-24：收集端已经部署上线**（`sx.gamestao.com`，桶 `swarm-orbit-telemetry`），
当天实测过收、读、鉴权三条路。怎么读见 platform.md「读数据」。

**但打包出来的包一条也没发**（11-24 当天查出来的）：`VITE_TELEMETRY` 只配在 GitHub Actions 的
仓库变量里，而 `npm run package` / `package:cg` 是在本地跑的，本地没有这个变量，
`beacon.ts` 的 `configured()` 就拿到空串，一条事件都不发。`release/` 下每一个 zip（含发到沙箱的
0.0.42 和传给 CG 的那一版）grep `sx.gamestao.com` 都是 0 命中。
**本地打包前必须让这个变量在环境里**：Vite 任何模式都会读 `.env.local`（已 gitignore），
所以在那里加一行就够（11-24 已经加上）：

```
VITE_TELEMETRY=https://sx.gamestao.com/c
```

加完再打的包才带 URL，验证方法是在产物里 grep 这个域名。已经上传的包改不了，只能重新打包重传。

还欠一样：CG 要求的隐私政策里要写明自建收集收了什么（§4 那一节就是底稿）。
