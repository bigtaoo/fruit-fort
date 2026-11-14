# Swarm Orbit — telemetry archive

A frozen copy of everything the Playgama Developer Console held for this game, pulled on
**2026-11-14** so the data survives the game being deleted from the console. Once the
application is deleted none of this is recoverable from the platform.

- Application id: `cmw3hzp2t0028p00hkdwl7zdl`
- Sandbox: `https://playgama.ai/play/b4eiepawvrx2ix` (ACTIVE at archive time)
- Live revision at archive time: `cmwc90oca0fngk30i55pes25i`, archive `cmwc8zxcb0ihqhj0h0d75mwdy`,
  published 2026-11-11T15:03:07Z, build **0.0.29**
- Data span: **2026-11-05T12:08:03Z → 2026-11-14T11:24:23Z** (nothing earlier exists)
- Totals: 18,531 events, 541 unique sessions, 423 unique users, 172 event types

## What is here

### `raw/` — session facts, as the console returned them

Pseudonymized per-session ordered fact chunks. Each session carries `session_ref`,
`user_ref`, `identity_quality`, `platform_id`, `device_type`, `device_os`,
`session_start`/`session_end`, `duration_seconds`, counts, `event_names`, and
`chunks[].facts[]` with `{kind, name, offset_ms, fields}`.

| File | Filter | Sessions |
|---|---|---|
| `session_facts_load_*_page1..4.json` | `eventName=load` | 100 + 100 + 100 + 89 = **389** |
| `session_facts_bootleft_*_page1..2.json` | `eventName=boot_left` | 100 + 3 = **103** |
| `session_facts_sessiontime_2026-11-09_2026-11-10.json` | `eventName=session_time`, 11-09..10 | 84 |
| `session_facts_sessiontime_2026-11-12_2026-11-13.json` | `eventName=session_time`, 11-12..13 | 62 |

`load` sessions are every session that rendered a first frame; `boot_left` sessions are
those that left during boot. Together they are the near-complete population. The two
`session_time` files are an earlier, narrower pull kept because they were already in hand —
their sessions are a subset of the `load` pages.

**Gap to know about:** the session-facts endpoint accepts only *custom* event names.
Filtering by a standard name (`core_session_end`, `core_initialization_started`) returns an
empty list, so there is no fact-level export for the ~50 sessions that produced only
standard events. Their counts live in `derived/event_inventory.csv`.

### `derived/` — console aggregates, flattened to CSV/JSON

- `overview.json` — totals, session-duration percentiles, sandbox state.
- `event_inventory.csv` — all **172** event types: kind, name, event_count,
  unique_sessions, unique_users, first/last timestamp. The only complete record of the
  low-volume events.
- `daily_volume.csv` — events / sessions / users per day, 11-05 to 11-14.
- `performance_sample_fields.csv` — every field of `performance_sample` with
  present_count, sessions, avg, min, p10, p50, p90, p99, max.
- `build_version_distribution.csv` — perf samples per build (0.0.10 … 0.0.29).
- `long_task_mode_distribution.csv` — which mode long tasks fired in.
- `core_ping_summary.csv` — core_ping carries **no payload fields**, only counts.

`performance_sample` and `core_ping` are deliberately excluded from session facts by the
platform, so the CSVs above are the only form in which they exist here.

### `scripts/` — the analysis that was run on this data

`stayers.py`, `stayers2.py` (per-session play distribution, cohort cuts), `power.py`
(bootstrap CIs, minimum detectable effect), `head.py` (last-quit payloads), `miles.py`
(milestone funnel), `loop.py` (happenings, wagons, guides). Each takes two session-facts
files as arguments — a later build first, an earlier one second. Run from `scripts/`:

```
python -I stayers2.py ../raw/session_facts_sessiontime_2026-11-12_2026-11-13.json \
                      ../raw/session_facts_sessiontime_2026-11-09_2026-11-10.json
```

Smoke-tested against the archived files on 2026-11-14; all six run.

## Instrumentation semantics (needed to read any of this correctly)

Source of truth was `src/platform/analytics.ts`, `src/platform/funnel.ts`, `src/main.ts`.

- **`session_time {s}`** — heartbeat every 30 s of *visible tab time*. A foregrounded idle
  tab keeps accumulating. Max `s` is tab-visible time, **not** active play.
- **`quit_<stuck>`** — emitted on every leave up to 5 (`n` counts them), so the **last**
  `quit_*` of a session is where it ended. Payload: `s`, `wave`, `stuck`, `at`, `run_t`,
  `n`, `q`, `fps`, `quiet` (seconds since last input), plus scene fields `fence`, `bugs`,
  `gold`, `card`, `kills`, `buys`, `charge`, `wagons`.
- **`stuck`** = first unreached step of
  `first_frame, first_tap, first_buy, first_reverse, first_cast, first_grab, wave_3, wave_5, wave_10`,
  else `done`.
- **`at`** (LeaveAt) = `run` | `over` | `village` | `ad`.
- **`boot_left`** — left during boot. `stage` says how far (`build`, `save`, …), `pct` the
  progress bar, `s` seconds, `sdk` whether the platform SDK answered.

## Caveats — read before drawing any conclusion

1. **`avg_duration_seconds` (377 s, "about 7 minutes") is not play time.** It is tab-open
   wall clock including backgrounded and idle tabs. One `performance_sample` had
   `window_ms` 38,347,129 ms against `active_ms` 30,088 ms. `max_duration_seconds` is
   38,806 s — a tab left open for eleven hours. `p50_duration_seconds` is 0. Use
   `active_ms`, or `session_time` with an idle-tab exclusion, instead.
2. **Milestone naming.** Funnel milestones are emitted as `funnel_<id>` (e.g.
   `funnel_first_grab`), and *some* also emit a bare duplicate (`first_buy`,
   `first_reverse` — these appear twice in the inventory with identical counts). Any
   analysis matching bare names undercounts badly. Strip the `funnel_` prefix and dedupe.
3. **Fields appear mid-period, so counts are not comparable across the whole span.**
   - `fps` and `q` on `quit_*`: from **0.0.19** only (fps samples arrive every 30 s, so a
     player who left sooner had none). Before 0.0.19 `quit` went out once, mid-fight only.
   - Scene fields on `quit_*` (`fence`, `bugs`, `gold`, `card`, `kills`, `buys`) and
     `quiet`: from **0.0.21** only.
   - `ab` (the buy1 A/B): **0.0.21 only**, removed in 0.0.22 (commit `c167723`) with no
     verdict. 153 samples across 24 sessions.
   - Wagon events (`wagon_offer_*`, `wagon_pick_*`, `funnel_first_offer`): from **0.0.23**
     (2026-11-11 09:25 UTC) only.
4. **Two balance changes split the period.** Sessions from **0.0.26** (11-11 13:25 UTC) and
   again from **0.0.29** (11-11 15:03 UTC, Overdrive gained +50% track speed) must be read
   apart from earlier builds.
5. **`event_count` is not a session count**, and a sample distribution is not a session
   distribution. `performance_sample` covers 217 sessions of 541.
6. **Traffic is thin** — about 60 engaged sessions per two days. See the power note below.
7. **2026-11-07 is distorted**: 1,806 events from 5 sessions (one long developer session).
   0.0.16 contributes 353 perf samples from 3 sessions. Exclude both for player-behaviour
   reads.

## Build timeline (from git log)

| Build | When (UTC) | Note |
|---|---|---|
| 0.0.10 | 11-06 | analytics via `bridge.analytics.send`, `game_version` per build |
| 0.0.11–0.0.15 | 11-06 | |
| 0.0.16 | 11-07 14:53 | |
| 0.0.17 | 11-08 12:11 | soft GPU tier (q5) |
| 0.0.18 | 11-08 13:34 | |
| 0.0.19 | 11-08 15:30 | `fps`/`q` added to quit |
| 0.0.20 | 11-09 08:32 | reverted |
| 0.0.21 | 11-10 09:11 | buy1 A/B, scene payload on quit |
| 0.0.22 | 11-10 | A/B removed (`c167723`) |
| 0.0.23 | 11-11 09:25 | wagons on + 4 opening fixes |
| 0.0.24 | 11-11 09:41 | effects |
| 0.0.25 | 11-11 12:54 | visuals, wagon unlocks/book/achievements |
| **0.0.26** | 11-11 13:25 | **balance change** |
| 0.0.27 | 11-11 13:53 | wagon effects |
| 0.0.28 | 11-11 14:47 | soft tier pixel budget |
| **0.0.29** | 11-11 15:03 | **balance change** — Overdrive +50% track speed. Last published build. |

`534a606` ("Level 1-1 is six paced waves, not ten") is HEAD but `package.json` is still
0.0.29 and it was **never packaged or published**. No telemetry here reflects the six-wave
1-1; all 11-12 data is the ten-wave build.

## What the data showed (so the sample need not be re-derived from scratch)

Cohort: sessions with `session_time` present and `event_count >= 15` ("active stayers",
which excludes idle foregrounded tabs).

- **Play length, 0.0.29 (n=53):** p50 180 s, p75 450 s, p90 1299 s.
  **0.0.22 (n=67):** p50 173 s, p75 384 s, p90 902 s.
- **The difference is not measurable at this traffic.** Bootstrap 95% CI on the median
  difference: **−48 s to +150 s** (−28% to +87%). Waves/session +0.05 (CI −1.44..+1.59).
  Completion −3.2 pp (CI −15.9..+9.5). At 80% power a **+15% effect needs ~1000
  sessions/arm, +30% ~390, +50% ~153** — against ~60 engaged sessions per two days. A large
  win is ruled out; a small win cannot be distinguished from nothing.
- **87% one-and-done.** 46 of 53 active stayers started ≤1 run (mean 1.21); `run_t` p50
  104 s; only 8 `funnel_village_open` across 53 sessions. The loop does not loop — that,
  not pacing, is the ceiling on any 10-minute target.
- **They quit mid-action while winning.** `quiet` p50 5 s; 42% left with <5 s since last
  input; only 18% idle ≥20 s. `fence` p50 92, p75 97. Leave at run 28 / over 5 / village 0.
- **Guides interrupt each other.** `guide_idle_rich` shown 184 / left 119 / replaced 65;
  `guide_idle_buy1` shown 126 / left 61 / replaced 86; `guide_play1` done 1 of 15.
- **Wagons engaged but did not retain.** Offers 187, picks 182 (97%), tap 161 vs auto 21.
- **Weak signal, not a frame bug:** pickups grabbed 82%→69%, `first_grab` 61%→53%. The
  Overdrive-skip hypothesis was checked against `DT`, `TRAIN.speed` 1.6, `radius` 2.55 and
  `pickup` 0.9, and rejected — the train moves ~0.03 units/tick into a 1.8-unit window.
