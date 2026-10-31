# UI 第 1 轮：野餐风格的 HUD 和 2D 素材

2026-10-31。现在的 UI 全是占位（色块 + emoji）。这轮按 design.md §16.2 先定 UI 风格，再给推荐方向做一套素材。不改 `src/`，只出图和方案。

## 方法

- `base.png` 是第 5 波的战斗截图（390x844 视口，2 倍，带现在的 HUD）；`clean.png` 是同一帧把 HUD 设成 `opacity: 0` 的样子（用 `visibility: hidden` 镜头会变）。
- 先试了图生图：把 `base.png` 整张交给 `edit_image.sh`，让它只换 UI 风格（`old/edit_*.jpg`）。不行：一张几乎没变，玩具那张把棋盘也画坏了。
- 改成文生图出“零件板”：每个方向一张框体板（`*_kit`）和一张图标板（`*_icons`），零件散放在平的灰底上。`scripts/art/ui_cut.py` 按底色把零件和生成器画的阴影一起抠掉，存成透明 PNG；`scripts/art/ui_mock.py` 把零件按现在 HUD 的位置（hud.ts 的 CSS 像素框）贴到 `clean.png` 上，得到每个方向的样张。
- `phone.png` 是 0.5 倍的四张并排：原图、a、b、c。
- 定了 b 之后，又按同样的方法出了 6 张板（`sheets/`：`icons1`–`4`、`frames1`–`2`），从中挑零件，用 `scripts/art/ui_assets.py` 去阴影、裁边、放进固定尺寸的画布，得到 `assets/`。`check.png` 是每个素材在 24、32、48 px 高时放在草地（上）和黄格子布（下）上的样子。
- 每张生成图旁边的 `.txt` 是它的提示词。

## 三个方向

| 文件 | 方向 | 结果 |
|---|---|---|
| `a_wood` | 蜂蜜色木板，格子布波次牌，奶油字加深色描边 | 最像野餐篮。但蜂蜜木色和木轨道、黄色野餐布是一个色，按钮压在布上就糊了 |
| `b_sticker` | 粉彩贴纸，白色模切边，平涂 | **推荐。** 白边让按钮在黄布和草地上都能分出来；平涂缩小不糊，图标板也是三张里最好的。弱点：桃色太淡，买不起时的字太浅 |
| `c_toy` | 糖果色塑料玩具，厚边高光 | 生成器给的是灰色金属感的框，样张里是代码上的色，不是生成的。图标板没画射程，只能拿靶子凑 |

推荐 b，理由是可读性：HUD 压在黄布、绿草和木轨道上，只有白边贴纸三种底上都分得开，而且 24 px 时还认得出来（见 `check.png`）。可以从 a 借一点格子布纹做波次牌或面板的点缀。上线前要把按钮色加深一档，不可买状态的字用深灰而不是浅灰。

## 素材（`assets/`，透明 PNG）

图标顺序同 `src/sim/config.ts` 的 `STAT_KEYS`。

| 文件 | 尺寸 | 来源 | 内容 / 用法 |
|---|---|---|---|
| `icon_dmg.png` | 128x128 | icons1 #0 | 爆炸 |
| `icon_spd.png` | 128x128 | icons1 #1 | 闪电 |
| `icon_crit.png` | 128x128 | icons3 #2 | 靶心插箭 |
| `icon_multi.png` | 128x128 | icons1 #5 | 一把软糖豆 |
| `icon_range.png` | 128x128 | icons3 #0 | 蓝色同心圆 |
| `icon_move.png` | 128x128 | icons4 #1 | 红色小火车 |
| `icon_gold.png` | 128x128 | icons2 #2 | 金币袋 |
| `icon_wall.png` | 128x128 | icons2 #3 | 棉花糖围栏桩 |
| `coin.png` | 128x128 | b_sticker_kit #9 | 金币，金币数和价格旁边 |
| `crystal.png` | 128x128 | b_sticker_kit #8 | 水晶 |
| `btn_yellow.png` | 160x160 | frames1 #0 | 加属性按钮（9 宫格，四边留 40） |
| `btn_mint.png` | 192x160 | frames1 #1 | 同上，薄荷色（四边留 40） |
| `btn_peach.png` | 192x160 | frames1 #2 | 同上，桃色（四边留 40） |
| `btn_round.png` | 128x128 | b_sticker_kit #1 | 小圆钮：倍速、静音 |
| `panel.png` | 320x240 | frames1 #3 | 面板（9 宫格，四边留 56，缝线在里面） |
| `bar_frame.png` | 512x64 | b_sticker_kit #4 | 围栏血条底框（左右各留 32，上下 0；填充内缩约 8） |
| `wave_badge.png` | 384x64 | b_sticker_kit #6 | 波次牌（左右尖头各留 48） |
| `hero_ring.png` | 192x192 | frames2 #2 | 英雄技能钮外圈，中间已挖空放头像 |

9 宫格留边是 PNG 原尺寸下的像素，显示时按比例缩：例如 `btn_yellow` 显示成 88x70 CSS px 时，`border-image-width` 取 40 x (70/160) ≈ 18 px。

重新生成：先对每张板跑 `python scripts/art/ui_cut.py docs/art/ui_r1/sheets/<板>.png <cut>/<板> 2500`（`b_sticker_kit.png` 也一样，最小面积用 900），再跑 `python scripts/art/ui_assets.py <cut> docs/art/ui_r1/assets`。抠出来的编号就是上表的 #。

## 以后怎么接（这轮没改代码）

- 素材放到 `public/ui/`（或 `src/assets/ui/` 让 Vite 打 hash）。
- 框体用 CSS：按钮和面板用 `border-image: url(ui/btn_yellow.png) 40 fill / 18px stretch;`；血条用 `bar_frame` 做 `border-image`，里面的填充还是现在的 div，宽度百分比不变，颜色改粉色带一条亮边；波次牌同理。
- 英雄技能钮：`hero_ring` 当前景，头像在下面，充能用 `conic-gradient` 的遮罩盖在头像上，不需要额外素材。
- 买不起 / 冷却：同一张图加 `filter: grayscale(.85) brightness(.85)`，不出灰色版。
- 图标：`src/view/icons.ts` 的 `STAT_ICON` 现在是 emoji，改成图片路径（`dmg: 'ui/icon_dmg.png'` 等），hud 里把文字节点换成 `<img>` 或带 `background-image` 的 span，尺寸 24–32 CSS px。金币、水晶同理替换现在的 emoji。
- 字：贴纸方向用深棕字（#2b1d14）不描边；白字（金币数、血条上的数字）要加深色描边。

## 发现

- 图生图整张换 UI 不可行：它要么不动 UI，要么连棋盘一起重画。零件板 + 代码拼合可控得多，位置也和真实 HUD 一致。
- 提示词里要写“不是什么”：不写“not a robot / not a radar”，射程图标就画成机器人带天线（icons2 #0）；写了“no text”还会偶尔出标签，所以切图有最小面积过滤。
- 生成器常常不听描边的要求：icons3 的同心圆没有棕色描边，玩具板给了灰金属而不是糖果色。挑图时要按缩小后的效果挑，不按大图挑。
- 板子的灰底不是纯色（frames2 有渐变），阴影也带底色的色调，所以 `ui_cut.py` 按“底色按比例变暗”判断阴影；frames1 按钮下面的棕灰阴影是和按钮连着的，`ui_assets.py` 另外再去一次。
- 24 px 时：闪电、靶子、同心圆、火车、钱袋都还认得；爆炸和软糖豆在 24 px 有点碎，32 px 以上没问题。围栏桩太细长，放进方格里只有一半宽，最好以后重画一个更方的围栏图标。
- 金币和水晶在黄布上都清楚，金币靠白边，不然会融进黄布。
