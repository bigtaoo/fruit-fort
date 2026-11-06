# 音频素材

游戏里的音效和背景乐都是 CC0（公有领域）素材，不用署名，也可以商用。这里记下来源，方便以后查找和替换。

## 来源

| 素材 | 作者 | 许可 | 地址 |
|---|---|---|---|
| Sci-fi Sounds | Kenney | CC0 | https://kenney.nl/assets/sci-fi-sounds |
| Interface Sounds | Kenney | CC0 | https://kenney.nl/assets/interface-sounds |
| Impact Sounds | Kenney | CC0 | https://kenney.nl/assets/impact-sounds |
| Digital Audio | Kenney | CC0 | https://kenney.nl/assets/digital-audio |
| Music Jingles | Kenney | CC0 | https://kenney.nl/assets/music-jingles |
| Space Battle（背景乐，88 秒循环） | MintoDog | CC0 | https://opengameart.org/content/space-battle |

原始压缩包放在 `ref/audio-src/`（不进 git）：五个 Kenney 包各解压到 `kenney_<包名>/`，另有 `space_battle_bpm130.ogg`。

## 重新生成

```bash
bash scripts/audio/build.sh
```

要求 PATH 里有 ffmpeg。脚本把选中的文件转成 `src/assets/audio/*.mp3`：音效是单声道 44.1 kHz 80 kbps，音乐是单声道 48 kbps（520 KB）。音乐原来是立体声 96 kbps，1 MB。2026-11-06 改了，原因有两个：一是它解码成 Web Audio 的缓冲后，88 秒立体声在内存里约 34 MB，单声道减半；二是它垫在音效底下，听不出 48 kbps 和 96 kbps 的差别。Potion Siege 的音乐是代码合成的，不占下载，但 Playgama 3.3.2 不收合成音频，所以这里不能照搬。用 mp3 是为了 Safari 也能播。小于 4 KB 的文件会被 Vite 内联进 JS。

## 对应关系

| 文件 | 游戏里 | 来源 |
|---|---|---|
| fire0–2 | 英雄开火 | sci-fi `laserSmall_000/001/003` |
| hit0–2 | 命中 | impact `impactGeneric_light_000–002` |
| crit | 暴击命中 | sci-fi `impactMetal_004` |
| kill | 击杀虫子 | sci-fi `slime_000` |
| bosskill | 击杀 Boss | sci-fi `explosionCrunch_000` |
| boom | Boss 波开场的低音 | sci-fi `lowFrequency_explosion_000` |
| strike | 重装英雄全场打击（`juice`） | sci-fi `lowFrequency_explosion_001` |
| crunch | 虫子啃护盾（持续） | sci-fi `explosionCrunch_002` |
| bite0–2 | 虫子咬护盾 | impact `impactPlate_light_000–002` |
| buy | 购买属性（连买升调） | interface `confirmation_002` |
| reverse | 掉头 | sci-fi `thrusterFire_000`（截 0.55 秒并淡出） |
| happen | 场上出现事件 | digital `twoTone1` |
| grab | 捡到事件奖励 | digital `powerUp4` |
| cast | 放技能 | sci-fi `forceField_000` |
| trick | Boss 召唤蝗虫 | digital `phaserDown2` |
| revive | 复活 | digital `powerUp7` |
| wave | 新一波 | jingles `jingles_NES09` |
| bosswave | Boss 波 | jingles `jingles_HIT09` |
| over | 失败 | jingles `jingles_NES11`（音高下行） |
| win | 过关 | jingles `jingles_NES12`（音高上行） |
| click / fail | 按钮 / 不能点 | interface `select_002` / `error_002` |
| music | 背景乐 | MintoDog `Space Battle` |

音量：`src/view/audio.ts` 里的 `LOUD` 表是每个文件实测的平均响度（ffmpeg `volumedetect`），播放时先归一到约 -18 dB，再乘 `MIX` 里按用途定的比例。换文件后要重新量一下：

```bash
ffmpeg -i src/assets/audio/kill.mp3 -af volumedetect -f null - 2>&1 | grep mean_volume
```
