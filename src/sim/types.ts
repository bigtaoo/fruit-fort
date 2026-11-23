export type FruitKind = 'strawberry' | 'coconut' | 'watermelon' | 'grape' | 'lemon';
export type HeroKind = 'farmer' | 'beekeeper' | 'chef';
/** Wagons the train can pull (§10.1), and the supply cards offered once every wagon is maxed. */
export type WagonKind = 'arc' | 'missile' | 'frost' | 'plasma' | 'mine' | 'magnet';
export type SupplyKind = 'gold' | 'repair' | 'skill';
/**
 * A reforge of a wagon already at WAGONS.maxLv (§10.1.16): it acts oftener, hits harder, or reaches
 * wider, and each wagon may take each of them once. It is what a pick has left to offer once every
 * wagon is maxed - which in an endless run happens around wave 20, after which a card was only ever
 * gold and a pick was not worth reading.
 */
export type ForgeKind = 'overdrive' | 'power' | 'spread';
/** One card of a pick: a wagon at the level it will have once picked (1 = new), or a supply (lv 0). */
export interface WagonOpt {
  kind: WagonKind | SupplyKind;
  lv: number;
  /** A reforge card: the wagon stays at its level and takes this instead. */
  forge?: ForgeKind;
}
/**
 * `boss` is the locust king; `mole` and `queen` are the other two bosses an endless run rotates
 * through (§9.9), and `warden` is the one ordinary kind that does nothing to the fence itself.
 */
export type EnemyKind = 'caterpillar' | 'beetle' | 'crow' | 'snail' | 'mold' | 'spore' | 'locust' | 'boss' | 'digger' | 'bomber' | 'mole' | 'queen' | 'warden';

/**
 * The tides of an endless run (§9.4): every ten waves the player takes one of three cards, and each
 * card is a bargain - the bugs get something (`press`, which stays for the rest of the run) and the
 * player gets something back now (`gift`). There is no card without a price: the run has to climb.
 */
export type TidePress = 'swift' | 'hardy' | 'gnaw' | 'swarm';
export type TideGift = 'wagon' | 'gold' | 'levels' | 'mend';
export interface TideOpt {
  press: TidePress;
  gift: TideGift;
}

/**
 * What the next ten waves of an endless run bring that it has not met yet (§9.6): the line the "go
 * on" card of a milestone is written from. `on` is the honest answer when nothing in particular is
 * due - the waves simply grow.
 */
export type MileNext = 'on' | 'digger' | 'bomber' | 'warden' | 'deep' | 'bosses';

/** What the player buys with gold in a run (§4): damage, attack speed, crit, targets per shot, range, train speed, gold, wall. */
/** Every stat: the run's cards (STAT_KEYS) and the three that only training raises (multi, range, move). */
export type StatKey = 'dmg' | 'spd' | 'crit' | 'multi' | 'range' | 'move' | 'gold' | 'wall' | 'wagon' | 'heavy' | 'splash';

/** What turns up mid-wave (§4 随机事件) on the track: a golden bug crawling along it, or a fruit basket. */
export type HappeningKind = 'bug' | 'basket';

export interface Happening {
  id: number;
  kind: HappeningKind;
  x: number;
  z: number;
  /** Seconds left before it flies off or rots. */
  t: number;
  /** Where it is on the track and, for the bug, which way it crawls. */
  angle: number;
  turn: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** Unit heading towards the fort centre; enemies walk in straight lines. */
  dirX: number;
  dirZ: number;
  x: number;
  z: number;
  /** Position at the start of the tick, for render interpolation. */
  px: number;
  pz: number;
  hp: number;
  maxHp: number;
  speed: number;
  armor: number;
  flying: boolean;
  /** Distance left to the wall line; 0 means it is chewing the wall. */
  d: number;
  slowMul: number;
  slowT: number;
  /** Seconds an arc Lv3 stun still holds the bug in place (apart from slowMul, so frost cannot stretch it). */
  stunT: number;
  corrode: number;
  corrodeT: number;
  /** Poison damage per second (ignores armor) and how long it lasts. */
  poison: number;
  poisonT: number;
  /** Direct hits taken (shots, bees), so the view flashes on a hit and not on poison ticking down. */
  hits: number;
  /** Seconds to the next trick, for enemies that have one (the boss calling locusts). */
  trickT: number;
  /** Wagons (§10.1): seconds of taking more damage (frost Lv3), of shots crits (plasma Lv3). */
  frailT: number;
  burnT: number;
  /** A tough one (LevelDef.tough): more health, drawn bigger, double gold. */
  tough: boolean;
  /**
   * A digger still under the ground (§9.5): nothing can pick it as a target, so it crosses the kill
   * ring whatever the train's damage is, and it surfaces `diggerSurface(wave)` short of the fence.
   * False for every other kind, and for a digger that has come up.
   */
  buried: boolean;
  /**
   * Seconds a bomber (§9.5) has stood against the fence with its fuse lit. It goes off at
   * `WAVES.bomber.fuse`; until then it is an ordinary bug that can be shot off the fence, which is
   * the whole of what the kind asks. 0 for everything else.
   */
  fuseT: number;
  /**
   * Share of a shot's damage a warden's field is taking off this bug right now (§9.9), 0 to
   * `WARDEN.cut`. Written every tick in `World.walk` from the wardens alive, so nothing has to be
   * undone when a warden dies. `Shots.hit` reads it for the damage, and `bugStatus` for the two
   * teal motes that are the only thing on screen explaining where the damage went. Only `Shots.hit`
   * takes it off the damage:
   * poison and the bees eat through the field, which is the one answer the kind leaves open.
   */
  ward: number;
}

/** What fired a projectile: only the hero's train now; fruit kinds are kept for the view's models. */
export type Shooter = FruitKind | 'hero' | 'missile' | 'mine';

export interface Projectile {
  id: number;
  kind: Shooter;
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  targetId: number;
  tx: number;
  tz: number;
  damage: number;
  crit: boolean;
  /** Damage per second of poison this hit leaves behind (beekeeper passive). */
  poison: number;
  /** Wagons: a blast around where it lands, at `mul` of its damage; a mine left there for `linger` s. */
  splash?: { r: number; mul: number };
  linger?: number;
}

export type SimEvent =
  | { t: 'buy'; stat: StatKey; level: number }
  | { t: 'reverse' }
  /** A shot from (x, z); (tx, tz) is where its first target stood, for the hero to face. */
  | { t: 'fire'; x: number; z: number; tx: number; tz: number; kind: Shooter }
  | { t: 'hit'; x: number; z: number; kind: Shooter; crit: boolean; splash?: number }
  | { t: 'kill'; x: number; z: number; kind: EnemyKind; gold: number }
  | { t: 'cast' }
  | { t: 'bite'; x: number; z: number }
  | { t: 'juice' }
  | { t: 'wave'; wave: number; boss: boolean }
  /** 一波清完、下一波还没来的那口气开始了（§9.8，sim/pace.ts）：下拍、这一波结清的金币。 */
  | { t: 'clear'; wave: number; gold: number; boss: boolean }
  | { t: 'trick'; x: number; z: number }
  /** A digger breaking ground (§9.5), and a bomber going off against the fence. */
  | { t: 'surface'; x: number; z: number }
  | { t: 'blast'; x: number; z: number }
  | { t: 'revive' }
  | { t: 'happen'; kind: HappeningKind }
  | { t: 'grab'; kind: HappeningKind; x: number; z: number; gold: number; stat: StatKey | null }
  | { t: 'escape'; kind: HappeningKind }
  | { t: 'over' }
  /** Wagons (§10.1): a pick of three shows / is made; an arc's chain from (x, z); a plasma pulse; frost laid. */
  | { t: 'offer'; n: number; opts: WagonOpt[] }
  | { t: 'pick'; n: number; opt: WagonOpt; auto: boolean; wait: number }
  | { t: 'zap'; x: number; z: number; to: { x: number; z: number }[] }
  | { t: 'burn'; x: number; z: number; r: number; to: { x: number; z: number }[] }
  | { t: 'frost'; x: number; z: number; r: number; life: number }
  | { t: 'boom'; x: number; z: number; r: number }
  /** Tides (§9.4): a pick of three shows / is made. */
  | { t: 'tideoffer'; n: number; opts: TideOpt[] }
  | { t: 'tidepick'; n: number; opt: TideOpt; auto: boolean }
  /** A milestone (§9.6): the card is dealt, and the run ends because the player took the way out. */
  | { t: 'mile'; n: number; wave: number; next: MileNext }
  | { t: 'bank'; n: number; wave: number }
  /** The level's last wave is cleared (§9.1). */
  | { t: 'win' };
