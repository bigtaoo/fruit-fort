# 三个英雄的 Tripo 模型

2026-11-02。代码拼出来的英雄（`scifi.ts` 的 `makeTrooper`）只是几个圆球和方块，和定调图 `scifi_r2/d_tank_heroes` 差得远。这一轮用 Tripo 给三个英雄各出一个模型，换上去。

## 出模

- 输入图：从 `d_tank_heroes` 里各裁一个英雄，文件是 `marine_in.png`、`engineer_in.png`、`heavy_in.png`。
- 工具：Tripo Studio 图生 3D，模型选 **H2.5 Legacy**，每个 15 额度。不要纹理，导出 GLB。
- 导出的 GLB 是一个无纹理网格，只带 POSITION 和 NORMAL，高 1 个单位，面朝 +z，大约 1 万个三角形，约 30 KB。

| 英雄 | 槽位 | Tripo 任务 | 文件 |
|---|---|---|---|
| 陆战队员 | farmer | （第一个，任务号没记） | `src/assets/heroes/marine.glb` |
| 工程机器人 | beekeeper | `c6ccf74e-9bc8-42ed-8c22-dbe1dc6ce086` | `src/assets/heroes/engineer.glb` |
| 重装 | chef | `d14a2a10-6c8f-4586-b6ad-adc522df3734` | `src/assets/heroes/heavy.glb` |

注意：Tripo 页面上显示的网址不一定是当前导出的那个模型。导出后要用 `cmp` 和已有文件逐个比一下，确认不是重复的。工程机器人第一次导出的就是陆战队员。

## Blender 处理（`scripts/art/hero_cleanup.py`）

Tripo 原始导出的网格存在 `*_raw.glb`。每个只有约 1,200 个三角形，性能上没有可省的，问题在于太粗：轮廓坑坑洼洼，手和四肢有棱角，肩膀转动时可用的顶点太少。脚本的处理步骤：

1. 焊接重复顶点，删掉退化面和孤立顶点。
2. 夹角大于 50° 的边加折痕（crease 0.85），细分一级。这样面板变圆，但棱角保留。
3. 按 X 对称减面，回到 2,500 个三角形。
4. 按 50° 设平滑法线，只导出 POSITION、NORMAL 和索引，坐标系不变。

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P scripts/art/hero_cleanup.py -- docs/art/tripo_heroes/marine_raw.glb src/assets/heroes/marine.glb 1 50 2500
```

试过但没采用的做法：

- 镜像对称（symmetrize）加重算法线：外壳不完全闭合，胸口一片面翻了，变黑。
- 只细分不减面：约 8,000 个三角形，每个 160 KB，上色边界变成锯齿。
- 重新居中：面罩的位置跑出了上色规则的范围。上色规则是按 Tripo 原坐标写的，所以坐标不能动。

每个英雄现在约 60 KB（原来 30 KB），打包后总量仍远低于预算。

## 上色和动作（`src/view/troopers.ts`）

- **上色**：按三角形的中心位置和面朝向分区。每个英雄有一张规则表，从上往下匹配，第一条命中的决定颜色。分区有：面罩、装饰色、深色、金属、外壳、护甲。没命中的，上半身算外壳，下半身算护甲。每个分区一种材质，所以一个英雄只有几次绘制。
- **手臂**：Tripo 把手臂和身体连成了一整块，直接切开会撕裂。所以做成蒙皮网格，两个肩膀各一根骨头。一个顶点跟手臂走多少，看三件事：比肩膀靠外多少、比肩膀低多少、比靴子高多少。最后一项是为了让靴子不跟着手动。
- **举手幅度**：`animateHero` 施法时把手臂直接转到 2.6 弧度。连在身上的手臂转这么大，会把躯干拉成碎片。所以交给 `animateHero` 的不是骨头本身，而是一个代理：它只把转角的 `REACH`（0.55）传给骨头，手臂最多举到大约水平。
- 找不到 GLB 时，退回 `makeTrooper` 的代码模型。
