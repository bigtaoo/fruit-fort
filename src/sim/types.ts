export type FruitKind = 'strawberry' | 'coconut' | 'watermelon' | 'grape' | 'lemon';
export type HeroKind = 'farmer' | 'beekeeper' | 'chef';
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
  corrode: number;
  corrodeT: number;
  /** Poison damage per second (ignores armor) and how long it lasts. */
  poison: number;
  poisonT: number;
  /** Seconds to the next trick, for enemies that have one (the boss calling locusts). */
  trickT: number;
}

/** What fired a projectile: only the hero's train now; fruit kinds are kept for the view's models. */
export type Shooter = FruitKind | 'hero';

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
}

export type SimEvent =
  | { t: 'buy'; stat: StatKey; level: number }
  | { t: 'reverse' }
  | { t: 'fire'; x: number; z: number; kind: Shooter }
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
  /** The level's last wave is cleared (§9.1). */
  | { t: 'win' };
