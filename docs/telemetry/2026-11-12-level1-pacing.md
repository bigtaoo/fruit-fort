# Level 1-1 pacing, measured (2026-11-12)

Simulated, not telemetry. Tools: `scripts/wavetime.ts` (new) and `scripts/opening.ts`, written
separately and measuring different quantities; both agree. 30 and 20 seeds, wagons on.

## Calibration
`wavetime.ts` hand policy reproduces the real numbers, so the counterfactuals below are trustworthy:
fence left 90% (telemetry `quit_wave_10`: 89-94%), level 6.3 min (battle.md:264 bot benchmark 6.0).

Bug found and fixed: both scripts bought from `['dmg','spd','crit','multi','range']`. Since 0.0.26
multi/range/move are training-only, `maxed()` is always true and `buy()` always fails, so the hand and
slow policies bought nothing. **Every opening.ts number printed between 0.0.26 and this fix was wrong.**

## The pathology
Waves get longer and safer at the same time (hand, 30 seeds):

| wave | secs | near fence | chewing | peak bugs |
|---|---|---|---|---|
| 1 | 24.0 | 84% | 74% | 9 |
| 5 | 36.9 | 53% | 41% | 11 |
| 10 | 38.2 | 46% | 25% | 12 |

Waves 1-4 are 128 s, waves 5-10 are 253 s. The board is never empty (1-5% with <=2 bugs), so there is
no dead air to cut.

Mechanism: late waves are **spawn-belt-bound, not kill-bound**. `waveCount(10) = 21`, times `swarm: 3`
= 63 bugs, times `spawnGap(10) = 0.7 s` = 44 s, which is the measured wave length. The player's dps
stopped mattering; the conveyor sets the pace.

## Counterfactuals, by buying policy (median level minutes)

| | none | hand | slow | bot | kills | buys | fence (hand) |
|---|---|---|---|---|---|---|---|
| baseline | 8.9 | 6.3 | 6.3 | 5.7 | 396 | 51 | 90% |
| D: `swarm` 3->1.5, `hp` .33->.66 | **9.5** | 4.6 | 4.8 | 3.3 | 210 | 36 | 74% |
| F: `pace` 0.6 | 8.0 | 4.5 | 4.7 | 3.8 | 396 | 51 | 84% |
| F + `bite` .3->.7 | 8.0 | 4.5 | 4.7 | 3.8 | 396 | 51 | 63% |

D halves the bug count, and gold is flat per kill (`caterpillar.gold: 6`), so it cuts income 47%,
buys 51->36 and first-minute kills 47->26 - the 0.0.20 failure mode. It also makes the never-buyer's
run *longer* (8.9 -> 9.5 min, worst seed 14 min). Rejected.

F keeps every bug and every coin and only compresses the gaps between them. Cross-checked in
opening.ts: crowd at the fence in the first minute 8 -> 15, wall@60s 0.93 -> 0.88, kills@60s 47 -> 49.
Peak bugs on screen 12 -> 20.

Safety net (`SAFE`, below 50%): never fires for a buying player in any variant; 0 losses in 120 runs.
It already fires 30/30 for the never-buyer today, who lives at the 15% floor - that is unchanged by F.

## Correction: the level length I first reported was fight time, not the player's clock
`World.time` does not advance while a card offer is up (`world.ts:236` -> `hold()`), so every
duration above is fight seconds. The player's clock is fight + frozen. (Since 2026-11-17 the fight
runs on under the cards, wagons.md §10.1.14, so fight seconds are the player's clock again.) Telemetry's quit point is
wall clock, so only the wall-clock column may be compared with it.

## The target the numbers have to hit
Telemetry: the median quitter leaves at **3.4 min, wave 6-7**, fence at 89-94%, actively playing
(`quiet` p50 5-6 s). So most players never see a win. **Level 1-1 has to be won inside 3.4 min of
wall clock**, or the first reward never lands. Today it takes 6.6-7.6 min.

## Chosen: `pace: 0.6`, `waves: 10 -> 6`, `bite: 0.3 -> 0.7`

| policy | wall clock, tapped / untapped | fence left (worst) | net fired | lost |
|---|---|---|---|---|
| none | 5.4 / 6.0 min | 15% (15%) | 30/30 | 0/30 |
| hand | **2.7 / 3.2 min** | 62% (51%) | 0/30 | 0/30 |
| slow | **2.8 / 3.4 min** | 57% (48%) | 6/30 | 0/30 |
| bot | **2.0 / 2.0 min** | 99% (96%) | 0/30 | 0/30 |

Every buying player wins inside the cliff, worst case included. Per wave (hand): 22-32 s each, no
ramp; chewing 75 / 86 / 76 / 66 / 53 / 34%, peaking at wave 2 and easing into the boss.

Why each knob:
- `pace 0.6` compresses the spawn belt. Costs nothing: kills, buys and gold are unchanged, peak bugs
  on screen 12 -> 20, first-minute kills 47 -> 49. This is the one that fixes the trickle.
- `waves 6` cuts the flat back half. The threat decline is structural (bought dps outgrows a 1.19/wave
  hp curve) and cannot be tuned away, so the level ends before it goes flat instead.
- `bite 0.7` turns 90% fence into 62%: the fence visibly loses ground, and stars start meaning
  something - today every policy ends above 80% and gets 3 stars, so `starsFor` is dead weight.

Rejected: D (`swarm 3->1.5`, `hp .33->.66`) - gold is flat per kill, so it cut income 47%, buys
51 -> 36 and first-minute kills 47 -> 26, and made the never-buyer's run *longer* (8.9 -> 9.5 min).

## Left untouched
Wagon picks freeze the fight (`world.ts:236`). Under the chosen tuning that is 4 offers, 40 s if the
player never taps, ~8 s if they tap at once - one interruption every ~38 s of fight. Unfixable by
tuning: it needs the offer not to stop the world, which is a code and UX change.

## Watch after shipping
- Peak bugs on screen 12 -> 20 in the level every new player sees; soft-tier fps on the A16 (0.0.28
  budget is ~115k px).
- `fronts: 1` with 20 bugs may read as a single-file queue. Hand test before shipping.
- A buying player now ends 1-1 on 2 stars, not 3. Intended (replay), but check it does not read as
  a failed first level.
