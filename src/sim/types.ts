export type FruitKind = 'strawberry' | 'coconut' | 'watermelon' | 'grape' | 'lemon';
export type HeroKind = 'farmer' | 'beekeeper' | 'chef';
/** Wagons the train can pull (§10.1), and the supply cards offered once every wagon is maxed. */
export type WagonKind = 'arc' | 'missile' | 'frost' | 'plasma' | 'mine' | 'magnet';
export type SupplyKind = 'gold' | 'repair' | 'skill';
/** One card of a pick: a wagon at the level it will have once picked (1 = new), or a supply (lv 0). */
export interface WagonOpt {
  kind: WagonKind | SupplyKind;
  lv: number;
}
export type EnemyKind = 'caterpillar' | 'beetle' | 'crow' | 'snail' | 'mold' | 'spore' | 'locust' | 'boss';

/** What the player buys with gold in a run (§4): damage, attack speed, crit, targets per shot, range, train speed, gold, wall. */
export type StatKey = 'dmg' | 'spd' | 'crit' | 'multi' | 'range' | 'move' | 'gold' | 'wall';

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
  | { t: 'hit'; x: number; z: number; kind: Shooter; crit: boolean }
  | { t: 'kill'; x: number; z: number; kind: EnemyKind; gold: number }
  | { t: 'cast' }
  | { t: 'bite'; x: number; z: number }
  | { t: 'juice' }
  | { t: 'wave'; wave: number; boss: boolean }
  | { t: 'trick'; x: number; z: number }
  | { t: 'revive' }
  | { t: 'happen'; kind: HappeningKind }
  | { t: 'grab'; kind: HappeningKind; x: number; z: number; gold: number; stat: StatKey | null }
  | { t: 'escape'; kind: HappeningKind }
  | { t: 'over' }
  /** Wagons (§10.1): a pick of three shows / is made; an arc's chain from (x, z); a plasma pulse; frost laid. */
  | { t: 'offer'; n: number; opts: WagonOpt[] }
  | { t: 'pick'; n: number; opt: WagonOpt; auto: boolean; wait: number }
  | { t: 'zap'; x: number; z: number; to: { x: number; z: number }[] }
  | { t: 'burn'; x: number; z: number; r: number }
  | { t: 'frost'; x: number; z: number; r: number; life: number }
  | { t: 'boom'; x: number; z: number; r: number }
  /** The level's last wave is cleared (§9.1). */
  | { t: 'win' };
