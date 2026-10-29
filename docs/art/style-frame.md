# 风格定调图：需求说明

> 2026-10-29。批量做模型之前，先出一张"游戏截图应该长这样"的图，把镜头、比例、配色、材质定下来。定了以后，角色设定图和 3D 模型都照它做。路线见 design.md §16。

> **已定调（2026-10-29）**：草坪不铺布、矮圆木墩托蛋糕、粉白棉花糖围栏，画风是明亮的风格化 3D 玩具。定调图 `style_r4/b_marsh.png`，配色规则见 design.md §16.1，过程见 `style_r1`～`r4` 的 README。下面第 4 节的问题已经回答；第 7 节的提示词是第 1 轮的，后面出图请以 `style_r3`、`style_r4` 的 `*.txt` 为准。

## 1. 要交的东西

| # | 内容 | 尺寸 | 用途 |
|---|---|---|---|
| 1 | 竖屏战斗画面 | 1170×2532 | 定镜头、配色、材质 |
| 2 | 横屏战斗画面（和 1 同一套东西、同一时刻） | 2532×1170 | 检查横屏 |
| 3 | 角色设定图：火车头 + 3 个英雄 + 7 种虫，正面和 3/4 侧面，白底 | 横版，每个角色至少 512 高 | 后面拿去做图生 3D（Tripo） |

先出 3～4 个方向的 1 号图给 owner 挑，挑定一个再出 2 号和 3 号。

## 2. 构图照现在的游戏来

底稿：`ref/now-portrait.jpg`、`ref/now-landscape.jpg`（第 12 波的实机截图）。镜头、场地布局都照它，只换"画风"。界面（顶栏、属性按钮、技能按钮）也要画进去，但只要位置和大小对，样式以后另定。

- 镜头：透视，视场角 40°，从斜上方俯看，蛋糕在画面中心偏上。
- 由内到外：圆木墩上的蛋糕 → 木头轨道（半径 2.6）→ 一圈草地 → 围栏（半径 3.6）→ 草坪，虫子从画面外四面爬进来。
- 竖屏下面约 1/3 是属性按钮；横屏右侧约 1/3 是属性按钮。

## 3. 东西在手机上有多大（实测，390×844 竖屏，单位是 CSS 像素，乘 3 是物理像素）

| 对象 | 屏幕上的大小 | 意味着 |
|---|---|---|
| 火车头（含英雄） | 约 64×74 | 全场最大的角色，但英雄本人只露上半身，大约 20～25 高 |
| 蚂蚁 | 约 35×25 | 主力小怪，同屏几十只 |
| 甲虫 / 苍蝇 / 霉菌团 | 约 40×40 | |
| 蜗牛 | 约 61×48 | |
| 孢子 / 小蝗虫 | 约 21×22 | 最小 |
| 蝗虫王 | 约 90（估） | |
| 蛋糕 | 约 105×117 | |

横屏数字差不多（每个世界单位约 33 像素）。

**结论**：
- 虫子的细节在手机上看不见，**只看轮廓和颜色**。设计时把图缩到 35 像素宽，还能一眼认出是哪种虫，才算过关。
- 英雄在战斗里只有二十几像素，**靠帽子、头部轮廓和主色认人**：锡兵是高筒黑军帽配红上衣，机器人是银灰色加天线和背上的发条钥匙，恐龙是绿色加背刺。英雄的细节和表情主要在玩具箱里的大图上看。

## 4. 要在这张图上定下来的事

1. **玩具感靠什么**：木头火车要看得出木纹和圆角，锡兵要有漆面高光，恐龙要有绒毛质感。现在的游戏是统一的卡通着色加黑描边，材质之间没区别。
2. **虫子的调子**：可爱（大眼睛、圆身子），不要恶心。它们是"来偷蛋糕的小坏蛋"，不是害虫写实。
3. **配色**：红白格子布很抢眼。虫子要和格子布拉开（深色、饱和），蛋糕和围栏要暖、软。弹道（彩色果冻豆）和金币要比一切都亮。
4. **描边**：留还是去，或者只给角色描边、场景不描。

## 5. 角色要点（设定图用）

| 角色 | 一眼认出的特征 | 备注 |
|---|---|---|
| 火车头 | 木头玩具火车，圆滚滚，大烟囱，红轮子 | 英雄坐在驾驶室，露出腰以上 |
| 锡兵（初始英雄） | 高筒黑军帽、红上衣、白交叉带 | 胡桃夹子那种木偶感 |
| 发条机器人 | 方脑袋、圆眼睛、天线、背上的发条钥匙 | 银灰配一点橙 |
| 毛绒恐龙 | 绿色、背刺、短手、软乎乎 | 像抓娃娃机里的毛绒玩具 |
| 蚂蚁 | 三节身子、细长腿、一对触角 | 深棕红，最常见，必须最好认 |
| 甲虫 | 圆盾形硬壳、有金属光泽 | 深蓝紫，看起来"打不动" |
| 苍蝇 | 大红复眼、透明翅膀 | 会飞，离地有影子 |
| 蜗牛 | 大螺旋壳、慢吞吞 | 棕色壳，壳是轮廓重点 |
| 霉菌团 | 一团毛茸茸的绿色霉斑，带孢子点 | 死了分成两个小孢子 |
| 孢子 | 小号霉菌团 | |
| 蝗虫王 | 大蝗虫，戴一顶小王冠，长后腿 | Boss，体型最大 |
| 小蝗虫 | 蝗虫王的缩小版，没王冠 | |

## 6. 做成 3D 时的限制（给 Tripo 或外包）

- 格式 glTF（.glb），之后我这边用 Draco 压缩。
- 面数：虫子每只 ≤ 1500 三角面（同屏几十只，用 InstancedMesh 画）；火车加英雄 ≤ 5000；蛋糕 ≤ 3000。
- 贴图：优先纯色块或顶点色，配合卡通着色。实在需要贴图的，虫子 256、英雄和火车 512。不要 PBR 那一套（金属度、粗糙度、法线贴图），卡通着色用不上。
- 不绑骨骼。动画全部用代码做（腿摆、翅膀扇、身体起伏、英雄开火后坐），所以**腿、翅膀、触角、英雄的手臂要做成单独的部件**，别和身体粘成一块。
- 首包目标 < 5 MB，模型总共控制在 2 MB 以内。

## 7. 现成的提示词

AI 生图（Midjourney、即梦、GPT 图像等）用英文提示效果更稳，可以把 `ref/now-portrait.jpg` 当参考图一起给。

**竖屏战斗画面**：
```
mobile game screenshot, portrait 9:19.5, stylized 3D, cozy toy diorama look, top-down 3/4 perspective camera.
A red-and-white gingham picnic blanket. In the center a pink birthday cake with candles on a lace doily.
Around the cake a circular wooden toy train track; a chunky wooden toy locomotive with a tin soldier
(tall black shako, red jacket) riding in the cab, firing colorful jelly beans.
Outside the track a ring fence of marshmallow posts and wafer rails, a few rails chewed off.
Cute cartoon bugs crawling in from all sides: dark red-brown ants (many), a glossy blue-purple beetle,
a fly with big red eyes, a brown snail with a big spiral shell, a fuzzy green mold blob.
Soft warm sunlight, soft shadows, saturated but gentle colors, clean readable silhouettes, toy-like materials
(painted wood, glossy tin, plush). Game UI: wave counter and fence health bar at top, 2x4 grid of stat buttons at bottom.
```
横屏：把 `portrait 9:19.5` 换成 `landscape 19.5:9`，最后一句换成 `stat buttons in a 2x4 grid on the right third`。

**角色设定图**：
```
character turnaround sheet, front and 3/4 view, plain white background, stylized 3D toy, simple shapes,
clean silhouettes readable at small size, flat colors with soft shading, separate legs and arms:
[角色描述，照第 5 节]
```
