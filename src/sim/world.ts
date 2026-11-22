// The whole run: state, player commands and the fixed 30 Hz step. No rendering here, so the
// same code runs in the browser, in tests and in the headless bot.

import { ALL_STAT_KEYS, BEES, DT, ECON, ENEMIES, HAPPENINGS, HERO, HEROES, JUICE, META, REVIVE, SNAIL, standOff, STATS, STAT_KEYS, WALL_HP } from './config';
import { WAVES, diggerSurface, waveBite, waveSpeed } from './wavedefs';
import { trackPoint } from './board';
import { hittable, inRange, Shots } from './shots';
import { Train } from './train';
import { Happenings } from './happenings';
import { Spawner } from './spawning';
import { Wagons } from './wagons';
import { Tides } from './tides';
import { Miles } from './miles';
import { LEVELS, SAFE, biteMul, levelMods, netted, starsFor, teaching, type LevelDef } from './levels';
import type { Enemy, EnemyKind, HeroKind, SimEvent, StatKey, WagonKind } from './types';

/** Out-of-run levels the run starts with (§11). Missing fields mean level 1 / no upgrade. */
export interface MetaBonus {
  /** Training: stat levels the run starts with (capped by the stat's max). */
  statLv?: Partial<Record<StatKey, number>>;
  heroLv?: number;
  /** Village upgrades: wall, start gold. */
  wall?: number;
  gold?: number;
}

/** Daily challenge rules (§11). */
export interface RunMods {
  enemySpeed?: number;
  enemyHp?: number;
  startGold?: number;
  wallMul?: number;
  /** How hard bugs bite the fence, on top of the level's `bite` and the wave's (§9.4, tides). */
  bite?: number;
  /** How many bugs a wave brings, on top of `waveCount` (§9.4, tides). */
  count?: number;
}

export interface WorldOptions {
  seed?: number;
  hero?: HeroKind;
  meta?: MetaBonus;
  mods?: RunMods;
  /** Play this level (§9.1) instead of an endless run. */
  level?: LevelDef;
  /** Kills charge the train for a pick of three wagons (§10.1). */
  wagons?: boolean;
  /** The wagons a pick may deal (unlocked in the base, §10.1.12); all six when left out. */
  wagonKinds?: readonly WagonKind[];
}

export class World {
  readonly heroKind: HeroKind;
  readonly meta: MetaBonus;
  readonly mods: RunMods;
  readonly level: LevelDef | null;
  tick = 0;
  time = 0;
  gold = ECON.startGold;
  wallHp = WALL_HP;
  /**
   * The lowest the fence ever got this run, as a fraction of its max — what `stars()` reads.
   *
   * The fence left at the end used to decide the stars, which made every heal a rating: measured
   * 2026-11-15 over 80 late-chapter runs, the three that drew a repair card finished 3 stars
   * (6%, 26% and 39% fence the tick before), against 1.70 on average for the 63 without one, and on
   * 2-4 that card was the only 3 stars in sixteen runs of a level built to be lost. A revive did the
   * same from a fence of nothing. Stars are the replay hook and part of the pay, so they say how
   * close the swarm got, not what was patched afterwards; a heal still saves the run, it just does
   * not buy a rating. With nothing healing, this equals the fence left, so ordinary runs are
   * unchanged (`starsFor` thresholds were tuned against those).
   */
  wallLow = 1;
  wallMax = WALL_HP;
  /** The hero's train on the ring: where it is, its gun, its stats. */
  readonly train: Train;
  /** Stat levels bought this run. */
  lv = Object.fromEntries(ALL_STAT_KEYS.map((k) => [k, 0])) as Record<StatKey, number>;
  /** Of those, the levels the run started with from training (§11.3): they do not raise the run's prices. */
  trained = Object.fromEntries(ALL_STAT_KEYS.map((k) => [k, 0])) as Record<StatKey, number>;
  buys = 0;
  reverses = 0;
  enemies: Enemy[] = [];
  enemyById = new Map<number, Enemy>();
  /** The shots in the air. */
  readonly shots = new Shots();
  events: SimEvent[] = [];
  /** Skill charge, seconds left on a lasting skill, and the bees' bite clock. */
  hero = { charge: 0, buffT: 0, biteT: 0 };
  /**
   * Set by the guide (main.ts, §12.2), never by the bot or headless runs: bugs stop at this
   * distance from the fence while the player is asked to act. Null lets them walk.
   */
  holdAt: number | null = null;
  wave = 0;
  waveStart = 0;
  kills = 0;
  casts = 0;
  over = false;
  /** A level whose last wave was cleared; `over` is set too. */
  won = false;
  revived = false;
  nextId = 1;
  /** Wagons (§10.1); null when the run has none. */
  readonly wg: Wagons | null;
  /** The random event on the track (§4). */
  readonly happenings: Happenings;
  /** The wave's bugs still to come. */
  readonly spawner: Spawner;
  /** The tides of an endless run (§9.4); null in a chapter level. */
  readonly tides: Tides | null;
  /** The milestones of an endless run (§9.6); null in a chapter level. */
  readonly miles: Miles | null;

  constructor(opts: WorldOptions = {}) {
    const seed = opts.seed ?? 1;
    this.heroKind = opts.hero ?? 'farmer';
    this.meta = opts.meta ?? {};
    this.level = opts.level ?? null;
    this.mods = { ...(this.level ? levelMods(this.level) : {}), ...opts.mods };
    for (const k of ALL_STAT_KEYS) this.lv[k] = this.trained[k] = Math.min(this.meta.statLv?.[k] ?? 0, STATS[k].max ?? Infinity);
    this.wallMax = this.wallHp = Math.round((WALL_HP + META.wall * (this.meta.wall ?? 0) + STATS.wall.per * this.lv.wall) * (this.mods.wallMul ?? 1));
    this.gold = ECON.startGold + META.gold * (this.meta.gold ?? 0) + (this.mods.startGold ?? 0);
    this.spawner = new Spawner(seed);
    this.train = new Train(seed);
    this.wg = opts.wagons ? new Wagons(seed, opts.wagonKinds) : null;
    this.happenings = new Happenings(seed, this.level?.happenFrom ?? HAPPENINGS.firstWave);
    this.tides = this.level ? null : new Tides(seed);
    this.miles = this.level ? null : new Miles();
    // A teaching level (1-1..1-7) starts the hero half charged (2026-11-14): the first cast used to need
    // 20 kills, ~33-50 s in, and 38% of the players who tapped were gone by 60 s, so most never saw the
    // skill. It followed `safe` until the net stopped at 1-2 (2026-11-18, runloop.md §2.4); it is a
    // teaching aid, not part of the net.
    // 1-1 starts it full (2026-11-20, 0.0.39): pooled over 0.0.31-0.0.38, 23 of 108 tappers bought and turned
    // round and then left before the cast, at a median ~25 s, still in wave 1-2 with the fence at 84-99% -
    // before even the half charge filled. A dose test of the 11-14 change: the skill is there from the first
    // hand on, the cast hand coming as soon as buy and reverse are done.
    if (this.level === LEVELS[0]) this.hero.charge = HERO.chargeMax;
    else if (teaching(this.level)) this.hero.charge = Math.floor(HERO.chargeMax / 2);
  }

  // ---- queries --------------------------------------------------------------------------

  statCost(k: StatKey): number {
    const def = STATS[k];
    const off = this.heroKind === 'chef' ? 1 - JUICE.discount : 1;
    // Training raises the floor a run starts on; it does not also hand out cheap re-buys. The price
    // climbs from the level the player actually has, trained levels included (2026-11-14). It used to
    // climb from `lv - trained`, so a trained player got the free levels AND kept base prices - two
    // helpings of the same crystals. Measured with scripts/ladder.ts, that double helping was what
    // flattened chapter 1: a player arriving trained ended every level 82-90% with three stars while
    // the clock grew, the won-fight shape the live telemetry quits on. Charging in full turns it back
    // into a ladder (98 -> 83 -> 70 -> 53 -> 37 -> 23% fence, 3 stars down to 1), and it is what makes
    // the gold stat worth training.
    // Endless runs bend the curve past ECON.priceEasyFrom (see there): 1.3 a level against income
    // that grows 1.05 a wave closes the shop in the middle of the run. Chapter levels are short
    // enough that nobody reaches the bend, and they keep the curve they were tuned on.
    const lv = this.lv[k];
    const bend = this.level ? lv : Math.min(lv, ECON.priceEasyFrom);
    const past = this.level ? 0 : Math.max(0, lv - ECON.priceEasyFrom);
    return Math.round(def.cost * Math.pow(def.growth, bend) * Math.pow(ECON.endlessPriceGrowth, past) * off);
  }

  /** No card to buy: a training-only stat (multi, range, move), or one at its cap. */
  maxed(k: StatKey): boolean {
    const max = STATS[k].max;
    return !STAT_KEYS.includes(k) || (max !== undefined && this.lv[k] >= max);
  }

  canBuy(k: StatKey): boolean {
    return !this.busy() && !this.maxed(k) && this.gold >= this.statCost(k);
  }

  /** What the screen shows, for the leave event: fence %, bugs on the board, gold, a card in reach (1/0), kills, buys; wagons, charge %, pick (1: the cards were up) and pick_ago (s since the last pick). */
  scene(): { fence: number; bugs: number; gold: number; card: number; kills: number; buys: number; wagons?: number; charge?: number; pick?: number; pick_ago?: number; tides?: number; tide?: number; miles?: number; mile?: number } {
    const fence = Math.round((100 * this.wallHp) / this.wallMax);
    const card = STAT_KEYS.some((k) => !this.maxed(k) && this.gold >= this.statCost(k)) ? 1 : 0;
    // pick: the player left with the cards up; pick_ago: how long after the last pick (wagons.md §10.1.9).
    const g = this.wg;
    const wg = g ? { wagons: g.list.length, charge: Math.round(100 * g.fill()), ...(g.offer ? { pick: 1 } : {}), ...(g.lastAt !== null ? { pick_ago: Math.round(this.time - g.lastAt) } : {}) } : {};
    // tides: how many bargains the run is carrying; tide: a tide was on show when they left (§9.4).
    const td = this.tides ? { tides: this.tides.taken.length, ...(this.tides.offer ? { tide: 1 } : {}) } : {};
    // miles: milestones passed; mile: one was on show when they left (§9.6) - a player who leaves the
    // page with the way out in front of them is a different story from one who leaves mid-wave.
    const ml = this.miles ? { miles: this.miles.passed, ...(this.miles.offer ? { mile: 1 } : {}) } : {};
    return { fence, bugs: this.enemies.length, gold: Math.floor(this.gold), card, kills: this.kills, buys: this.buys, ...wg, ...td, ...ml };
  }

  /** Gold multiplier from the gold stat. */
  goldMul(): number {
    return 1 + STATS.gold.per * this.lv.gold;
  }

  /** Every gold income: the gold stat, and in endless the growth a wave (ECON.endlessGrowth). */
  incomeMul(): number {
    return this.goldMul() * (this.level ? 1 : Math.pow(ECON.endlessGrowth, this.wave - 1));
  }

  /**
   * Game over: no commands. A pick of wagons up is not busy (2026-11-17): the fight goes on under
   * the cards, and so do turning, buying and the skill - the cards are one more thing to tap.
   */
  busy(): boolean {
    return this.over;
  }

  /** Stars for a won level, from the lowest the fence ever got (§9.1); 0 otherwise. */
  stars(): number {
    return this.won ? starsFor(this.wallLow) : 0;
  }

  heroReady(): boolean {
    return this.hero.charge >= HERO.chargeMax;
  }

  trainPos(): { x: number; z: number } {
    return trackPoint(this.train.angle);
  }

  // ---- commands -------------------------------------------------------------------------

  buy(k: StatKey): boolean {
    if (!this.canBuy(k)) return false;
    this.gold -= this.statCost(k);
    this.buys++;
    this.levelUp(k);
    return true;
  }

  /** A stat goes up one level, bought or picked up; the wall level also heals the fence. */
  levelUp(k: StatKey): void {
    this.lv[k]++;
    if (k === 'wall') {
      const share = this.wallMax > 0 ? this.wallHp / this.wallMax : 1;
      this.wallMax += STATS.wall.per;
      // A level arrives at full health, which is also how the fence heals in a level. Endless cannot
      // afford that: measured 2026-11-15, a fence at 66% was back at 97% twenty waves later with no
      // repair card in sight, because every wall level adds an undamaged segment to a damaged fence.
      // Buying is then the answer to being hurt, and nothing the bugs do can stick. In endless the new
      // segment arrives as damaged as the rest (the bar does not move), and the only repair is
      // ECON.endlessRepair, a flat share of the fence that a level up buys back.
      const heal = this.level ? STATS.wall.per : STATS.wall.per * share + this.wallMax * ECON.endlessRepair;
      this.wallHp = Math.min(this.wallMax, this.wallHp + heal);
    }
    this.events.push({ t: 'buy', stat: k, level: this.lv[k] });
  }

  /** Take card i of the wagon pick on show (§10.1). */
  pickWagon(i: number): boolean {
    return !this.over && !!this.wg?.pick(this, i);
  }

  /** Take card i of the tide on show (§9.4). */
  pickTide(i: number): boolean {
    return !this.over && !!this.tides?.pick(this, i);
  }

  /** Go on from the milestone on show (§9.6). */
  mileGo(): boolean {
    return !this.over && !!this.miles?.go();
  }

  /** Take the milestone's way out (§9.6): the run ends here, paid for the wave it reached. */
  mileStop(): boolean {
    return !this.over && !!this.miles?.stop(this);
  }

  /** Turn the train round. */
  reverse(): boolean {
    if (this.busy()) return false;
    this.train.reverse();
    this.reverses++;
    this.events.push({ t: 'reverse' });
    return true;
  }

  cast(): boolean {
    if (this.busy() || !this.heroReady()) return false;
    this.hero.charge = 0;
    this.hero.buffT = HEROES[this.heroKind].time;
    this.hero.biteT = 0;
    this.casts++;
    if (this.heroKind === 'chef') this.juice();
    this.events.push({ t: 'cast' });
    return true;
  }

  /** Chef: hit every enemy with a big splash of juice. */
  private juice(): void {
    const dmg = this.train.damage(this) * JUICE.mul;
    for (const e of this.enemies) this.shots.hit(this, e, dmg);
    this.events.push({ t: 'juice' });
  }

  /** Once per run after the wall falls: wall back to half, the enemies at it blown away. */
  revive(): boolean {
    // A run the player walked out of (§9.6) is not revived: nothing fell, and the offer would read as
    // the game arguing with a decision it asked them to make.
    if (!this.over || this.revived || this.won || this.miles?.banked) return false;
    this.revived = true;
    this.over = false;
    this.wallHp = this.wallMax * REVIVE.wall;
    // Blown away, not killed: no gold or charge for them.
    for (const e of this.enemies) if (e.d <= REVIVE.clear && e.kind !== 'boss') this.enemyById.delete(e.id);
    this.enemies = this.enemies.filter((e) => this.enemyById.has(e.id));
    this.events.push({ t: 'revive' });
    return true;
  }

  // ---- step -----------------------------------------------------------------------------

  step(): void {
    if (this.over) return;
    this.tick++;
    this.time += DT;
    this.stepWaves();
    this.walk();
    this.train.step(this);
    this.wg?.step(this);
    this.tides?.step(this);
    this.miles?.step(this);
    this.shots.step(this);
    this.spawner.swarm(this);
    this.reap();
    this.stepHero();
    this.happenings.step(this);
    if (this.wallHp <= 0) {
      this.wallHp = 0;
      this.over = true;
      this.events.push({ t: 'over' });
    }
    this.wallLow = Math.min(this.wallLow, this.wallHp / this.wallMax);
  }

  /** The bugs walk in (held at the guide's line), their status clocks run down, and the ones at the wall chew it. */
  private walk(): void {
    const snails = this.enemies.filter((e) => e.kind === 'snail' && e.hp > 0);
    for (const e of this.enemies) {
      e.px = e.x;
      e.pz = e.z;
      if (e.slowT > 0 && (e.slowT -= DT) <= 0) e.slowMul = 1;
      if (e.stunT > 0) e.stunT -= DT;
      if (e.corrodeT > 0 && (e.corrodeT -= DT) <= 0) e.corrode = 0;
      if (e.frailT > 0) e.frailT -= DT;
      if (e.burnT > 0) e.burnT -= DT;
      if (e.poisonT > 0) {
        e.hp -= e.poison * DT;
        if ((e.poisonT -= DT) <= 0) e.poison = 0;
      }
      if (e.kind === 'boss' && netted(this.level) && this.time - this.waveStart > SAFE.bossAfter) e.hp -= (e.maxHp / SAFE.bossFade) * DT;
      // A digger breaks ground once it is close enough (§9.5), and is an ordinary bug from then on.
      if (e.buried && e.d <= diggerSurface(this.wave)) {
        e.buried = false;
        this.events.push({ t: 'surface', x: e.x, z: e.z });
      }
      // The guide's hold (§12.2): a bug comes no closer than holdAt until the player acts.
      const room = this.holdAt === null ? e.d : e.d - this.holdAt;
      if (room > 0) {
        const step = Math.min(room, pace(e, snails) * DT);
        e.x += e.dirX * step;
        e.z += e.dirZ * step;
        e.d -= step;
      } else if (e.d <= 0) {
        // A bomber does not chew (§9.5): it stands against the fence with its fuse lit and goes off
        // `bomber.fuse` seconds later for `bomber.blast` of the whole pool at once. Those seconds are
        // the point of the kind - it is 26 hp standing still inside everything's reach, so a train
        // that is keeping up shoots it off the fence and pays nothing, and a train that is swamped
        // pays all of it. The fence card does not answer it; killing things does.
        if (e.kind === 'bomber') {
          e.fuseT += DT;
          if (e.fuseT >= WAVES.bomber.fuse) {
            this.wallHp -= this.wallMax * WAVES.bomber.blast * (this.mods.bite ?? 1);
            this.events.push({ t: 'blast', x: e.x, z: e.z });
            e.hp = 0;
          }
        } else this.wallHp -= ENEMIES[e.kind].wallDps * biteMul(this.level, this.wallHp / this.wallMax) * waveBite(this.wave) * (this.mods.bite ?? 1) * DT;
        if (this.level?.safe) this.wallHp = Math.max(this.wallHp, SAFE.floor * this.wallMax);
      }
    }
  }

  /** Skill charge one kill of this enemy gives, with the village hero level. */
  private killCharge(e: Enemy): number {
    return ENEMIES[e.kind].charge * (1 + META.heroCharge * ((this.meta.heroLv ?? 1) - 1));
  }

  private stepHero(): void {
    const h = this.hero;
    // A full charge waits for the player; it never casts on its own.
    if (h.buffT <= 0) return;
    h.buffT = Math.max(0, h.buffT - DT);
    if (this.heroKind !== 'beekeeper' || (h.biteT -= DT) > 0) return;
    h.biteT += BEES.every;
    // The bees go for whatever is closest to the wall, chewing ones first.
    const near = this.enemies.filter(hittable).sort((a, b) => a.d - b.d || a.id - b.id);
    for (const e of near.slice(0, BEES.targets)) {
      e.hp -= e.maxHp * (e.kind === 'boss' ? BEES.bossBite : BEES.bite);
      e.hits++;
      this.events.push({ t: 'bite', x: e.x, z: e.z });
    }
  }

  private stepWaves(): void {
    // While the guide holds the bugs the wave's clock waits too: no pile builds up outside the fence.
    if (this.holdAt !== null) this.waveStart += DT;
    const t = this.time - this.waveStart;
    this.spawner.release(this, t);
    if (this.spawner.queue.length > 0) return;
    if (this.wave === 0 && !this.level?.lead && this.time < WAVES.firstDelay) return;
    if (this.enemies.some((e) => e.kind === 'boss')) return;
    if (this.wave > 0 && this.enemies.length > WAVES.callAt) return;
    const lv = this.level;
    if (lv && this.wave >= lv.waves) {
      // The last wave: the level is won once the field is clear, swarms and spores too.
      if (this.enemies.length > 0) return;
      this.won = this.over = true;
      this.happenings.now = null;
      this.events.push({ t: 'win' });
      return;
    }
    this.wave++;
    this.waveStart = this.time;
    if (this.wave > 1) this.gold += (ECON.waveBonusBase + this.wave) * this.incomeMul();
    const boss = this.spawner.plan(this.wave, lv, this.mods);
    this.happenings.plan(this.wave, boss);
    this.events.push({ t: 'wave', wave: this.wave, boss });
  }

  /** Take the dead off the field: their gold and charge paid, a mold's spores let loose. */
  private reap(): void {
    if (!this.enemies.some((e) => e.hp <= 0)) return;
    // On a level with a safety net the boss's locusts die with it (2026-11-06: a player who barely
    // bought was left with ~60 locusts to shoot one by one, ~8 minutes, after the boss fell). Since
    // 2026-11-14 this follows the net rather than `safe`: the net keeps a weak player alive on 1-8 to
    // 2-3, so without it their boss wave was a stalemate - scripts/ladder.ts measured a player who
    // buys nothing at 11-15 minutes on 1-8..1-10, a won fight that will not end, which is the shape
    // the telemetry says they quit on.
    const boss = (alive: boolean) => this.enemies.some((e) => e.kind === 'boss' && e.hp > 0 === alive);
    if (netted(this.level) && boss(false) && !boss(true)) for (const e of this.enemies) if (e.kind === 'locust') e.hp = 0;
    const alive: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.hp > 0) {
        alive.push(e);
        continue;
      }
      this.enemyById.delete(e.id);
      // A bomber that went off (§9.5) is not a kill: no gold, no charge, nothing fed to a wagon and
      // no death for the view to draw - the blast was its ending.
      if (e.kind === 'bomber' && e.fuseT >= WAVES.bomber.fuse) continue;
      const paid = ENEMIES[e.kind].gold * (e.tough ? 2 : 1) * this.incomeMul() * (this.wg?.goldMul(this) ?? 1);
      this.gold += paid;
      this.kills++;
      this.hero.charge = Math.min(HERO.chargeMax, this.hero.charge + this.killCharge(e));
      this.wg?.feed(e);
      this.events.push({ t: 'kill', x: e.x, z: e.z, kind: e.kind, gold: Math.round(paid) });
    }
    const molds = this.enemies.filter((e) => e.hp <= 0 && e.kind === 'mold');
    this.enemies = alive;
    this.spawner.spores(this, molds);
  }

  /** Put an enemy on the field walking towards the centre, `d` short of the wall; it stops `standOff` before it. */
  addEnemy(kind: EnemyKind, x: number, z: number, dirX: number, dirZ: number, d: number, hp: number): Enemy {
    const def = ENEMIES[kind];
    const e: Enemy = {
      id: this.nextId++, kind, dirX, dirZ, x, z, px: x, pz: z,
      hp, maxHp: hp, speed: def.speed * (this.mods.enemySpeed ?? 1) * waveSpeed(this.wave), armor: def.armor, flying: def.flying,
      d: d - standOff(kind), slowMul: 1, slowT: 0, stunT: 0, corrode: 0, corrodeT: 0, poison: 0, poisonT: 0, hits: 0, trickT: 0, frailT: 0, burnT: 0, tough: false, buried: kind === 'digger', fuseT: 0,
    };
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
    return e;
  }
}

/** How fast this enemy walks now: its own pace, slowed, and held back by a snail just ahead. */
function pace(e: Enemy, snails: Enemy[]): number {
  if (e.stunT > 0) return 0;
  let v = e.speed * e.slowMul;
  if (e.flying || e.kind === 'snail') return v;
  for (const s of snails) {
    if (s.d + standOff(s.kind) < e.d + standOff(e.kind) && s.d > 0 && inRange(e, s.x, s.z, SNAIL.radius)) v = Math.min(v, s.stunT > 0 ? 0 : s.speed * s.slowMul);
  }
  return v;
}
