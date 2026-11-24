# 门户商店文案

各门户的表单文案都抄自这一份，改文案先改这里。CrazyGames 的 Details 一步在封面和视频齐全之前**存不住**（表单会拒绝 "Please check if all the mandatory fields marked with * are filled"），所以填进浏览器的内容只活在那个标签页里——真正的底本是这份文件。

关卡数量写 **30 关、三章**（`src/sim/levels.ts` 的 `LEVELS.length`），Playgama 表单里那句 "Twenty campaign levels" 是旧的，下次改表单时一并订正。

## CrazyGames

草稿：`https://developer.crazygames.com/games/8e4e6003-538a-4714-a586-a97312f961fd`

| 字段 | 值 |
|---|---|
| Game name | Swarm Orbit |
| Category | Strategy |
| Tags | Tower Defense, Defense, Horde Survival, Train, 3D |
| Which tools did you use? | Claude |
| The game works well in fullscreen | ✓ |

### Description

> Swarm Orbit is a tower defense game played on a round fort. Your hero rides a toy train around a ring track inside the fence, firing at the alien bugs chewing their way in. The only move during a fight is a tap that flips the train's direction, so it covers whichever side is under pressure.
>
> Gold from kills is spent in the middle of the fight on damage, fire rate, crit, range and movement, so every wave asks whether to grow or to shoot. Thirty campaign levels across three chapters, crystals that buy permanent training between runs, wagons that hook onto the train and add effects of their own, and an endless mode once you unlock it.
>
> It plays with one thumb on a phone and with the mouse on desktop, in portrait or landscape, and it is translated into 15 languages.

### Controls

> Tap anywhere on the battlefield, or press Space, to flip the train's direction.
>
> Tap the stat buttons during the fight to spend gold on damage, fire rate, crit, range and movement.
>
> Tap the train itself when the hero's skill is charged to set it off.
>
> The train fires by itself at the bug closest to the fence. Survive every wave with the fence still standing to clear the level; how much fence is left decides your stars.

### 封面（已渲染，已上传）

`docs/art/cg/` 下三张，文件名就是尺寸：`cg_1920x1080.png`、`cg_800x1200.png`、`cg_800x800.png`。重渲命令（需要 :5173 上的 dev server）：

```bash
PLAYWRIGHT="D:/deutsch/node_modules/playwright" HERO=1 BRIGHT=1 GRADE=lift \
  KINDS=caterpillar,caterpillar,caterpillar,beetle,beetle,beetle,snail,locust,locust,crow \
  ZOOM="l:30,s:36,t:28" node scripts/art/cover.cjs docs/art/cg en l,s,t
```

`t` 是为 CG 加的 2:3 档（400×600 @2 = 800×1200）；`s` 出 1024×1024，用 PIL 缩成 800×800（`cover_en_s.png` 是那张的母版）。镜头远近只能靠 ZOOM 试：t 到 44 太近只剩炮塔，18 太远，28 刚好把整圈虫围住。

### 预览视频（已渲染，已上传）

`docs/art/cg/video/` 下两条：`trailer_l.mp4`（1920×1080）、`trailer_p.mp4`（1080×1620）。录制命令（需要 :5173 上的 dev server）：

```bash
LEVEL=14 WARM=130 node scripts/art/trailer.cjs docs/art/cg/video l
LEVEL=14 WARM=130 CRF=25 node scripts/art/trailer.cjs docs/art/cg/video p
```

`scripts/art/trailer.cjs` 让 bot 在真实时间里打一关，连 HUD 一起用 Playwright 的 `recordVideo` 录下来，再用 ffmpeg 裁成 MP4。几个只能踩过才知道的点：

- **竖屏要 2:3，不是 9:16**：传 1080×1920 会被表单当场拒掉（"Please upload a 2:3 portrait video (e.g. 1080x1620)"）。
- `file_upload` 单次 10 MB 封顶，竖屏那条默认 CRF 20 出 11 MB，调到 `CRF=25` 才塞得进。
- 存档里要把 `levels` 全解锁（脚本已经 `Array(20).fill(3)`），否则只能录到 1-1 的空场；`WARM` 是先用 `game.bot()` 快进的秒数，决定录的时候场上有多少虫。
- 开录前等 1.8 秒，让快进时那张「Wave N」横幅淡掉，不然片头是一张对不上 HUD 的旧横幅。

### 已送审（2026-11-24）

草稿已提交，状态 AWAITING REVIEW，Game ID 183989，送审的 build 是 `8fd9d089-2613-428e-a76e-4221c37f486c`
（0.0.43，第一个真会上报遥测的包）。版本历史里那三个旧 draft 已经 Discard 掉，只留送审的这一个——
门户不会自己清，留着只会越堆越多。

**门户的指标有个坑，吃过一次亏**：被拒（或下架）的投稿，单款那一行的 Total plays / 时长 / 留存全显示 `-`，
Metrics 面板直接报 "Error fetching data"，公开页也 404——看上去像「从来没有人玩过」。
但 My Games 列表**底部的账号汇总**仍然把它算在内（那行汇总加载得慢，等够十秒才出来）。
上一个投稿 Potion Siege（Game ID 162289，11-04 提交）就是这样：单款全是 `-`，汇总却有 2,843 次游玩。
CG 的 Basic Launch 本来就是先放出去跑一段时间收数据、再按质量指标定去留，所以**被拒不等于没上过线**。
**Remove game → Delete submission 不可撤销，删完连汇总都查不回来**，要先把数字抄下来；
事后只能带着 Game ID 发邮件问 submissions@crazygames.com。

### 还缺的素材

没有了。Details 一步已于 2026-11-24 保存通过，同日由作者本人按下第 4 步 Submit 送审——**提交送审只能由人做**。

### 上传一步已填（已保存）

引擎 HTML5，进度存档 `SDKPS`（SDK Data Module），支持手机 ✓，方向 BOTH，多人 ✗，SDK 静音 ✓。

包用 `npm run package:cg`，但 **CG 不收压缩包**：要把 `dist` 摊平后整目录上传。摊平这步已经写成脚本：

```bash
npm run package:cg
node scripts/cgflat.cjs    # 产出 release/cgflat/，46 个文件，每次重建
```

脚本把 zip 解开、把 `assets/` 下的文件提到顶层、把两个 HTML 里的 `./assets/` 改成 `./`，有重名或还剩子目录就报错退出。Vite 的资源 URL 都是 `new URL("./名字-hash.ext", import.meta.url)`，所以摊平是安全的——bundle 里剩下的 `assets/` 字符串只是 glob map 的键，不是 URL。

传的时候有两个坑：

- 门户的文件列表是**追加**，不是替换：重传新版本后旧版本的 `main-*.js` / `index-*.js` 还留着（我这次传完是 48 个而不是 46），要逐个用行尾的垃圾桶图标删掉。
- 那个列表是虚拟滚动的，一次只渲染十来行，照着 `innerText` 数会少数，得滚动着数。

### 换 build：只换变了的那几个文件

门户的文件列表是按文件名存的，所以换版本不必重传 46 个。Vite 的文件名带内容 hash，
两版之间真正变的通常只有三个：入口 chunk、main chunk 和不带 hash 的 `index.html`
（0.0.42 → 0.0.43 就正好是这三个，拿旧 zip 和新的 `release/cgflat/` 对一遍 sha1 就知道）。
做法是先把这三个旧的按名字删掉（列表是虚拟滚动的，要边滚边找），再传三个新的，
数一下仍是 46、没有重名，然后 Save → Go to QA。

### 换 build 后要重跑 QA

换了 build 必须重跑第 2 步 QA，而且**交接只有一次机会**：预览页收集完结果，按预览面板里的 Continue 才会把结果交给 `qa-continue` 页；这之后再刷新那个页面只会得到 "Failed to retrieve QA results"，只能 Restart preview 从头来。另外 "First gameplay start" 是自动项，**光加载到村庄地图不算**，要真的点进一关开打，`gameplayStart` 才会发出去。

QA 面板右下角那个 **Load time 不是加载耗时**，别被它吓到：它一直显示 "waiting..."，直到
`gameplayStart` 发出去才落定，读数就是「页面打开到你点进第一关」的墙钟时间。11-24 实测：
游戏 5 秒就把地图画出来了，我故意在菜单里晃到第 112 秒才点关，它就报 99.7 秒（之前两次 72.3 / 53.7
同理）。也就是说审核的人在菜单里停多久，这个数就有多大，和包的快慢无关。

## 隐私政策

`public/privacy.html`，随 `dist` 一起发，线上地址 `https://swarmorbit.gamestao.com/privacy.html`，游戏内在「设置」里有一行能点开（15 种语言都有文案）。CG 的 QA 清单里 "In-game mention of Terms & Conditions and/or Privacy Policy" 就是靠它答 Yes。
