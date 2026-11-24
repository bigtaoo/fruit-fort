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

### 还缺的素材（Details 一步的必填项）

- 封面三张：**1920×1080**、**800×1200**（2:3，我们从没渲染过这个比例）、**800×800**
- 预览视频两条：横屏 + 竖屏，MP4/MOV，≤20 秒

这两样齐了 Details 才能保存，保存完才轮到第 4 步 Submit——**提交送审只能由人做**。

### 上传一步已填（已保存）

引擎 HTML5，进度存档 `SDKPS`（SDK Data Module），支持手机 ✓，方向 BOTH，多人 ✗，SDK 静音 ✓。包用 `npm run package:cg`，但 **CG 不收压缩包**：要把 `dist` 摊平后整目录上传（`release/cgflat/`，46 个文件），`index.html` 和 `privacy.html` 里的 `./assets/` 要改成 `./`。

## 隐私政策

`public/privacy.html`，随 `dist` 一起发，线上地址 `https://swarmorbit.gamestao.com/privacy.html`，游戏内在「设置」里有一行能点开（15 种语言都有文案）。CG 的 QA 清单里 "In-game mention of Terms & Conditions and/or Privacy Policy" 就是靠它答 Yes。
