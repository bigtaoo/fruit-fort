export type FruitKind = 'strawberry' | 'coconut' | 'watermelon' | 'grape' | 'lemon';
export type HeroKind = 'farmer' | 'beekeeper' | 'chef';
export type EnemyKind = 'caterpillar' | 'beetle' | 'crow' | 'snail' | 'mold' | 'spore' | 'locust' | 'boss';

/** Card picks for one fruit kind: damage, attack speed, range, splash, aura, slow time. */
export interface Boost {
  dmg: number;
  spd: number;
  rng: number;
  aoe: number;
  aura: number;
  slow: number;
}

export interface Fruit {
  id: number;
  kind: FruitKind;
  level: number;
  /** Exp fed in towards the next level (§4 同种喂养); a level-n fruit is worth 2^(n-1). */
  exp: number;
  cooldown: number;
}

/** What turns up mid-wave (§4 随机事件): a golden bug flying round the fort, or a fruit basket by the wall. */
export type HappeningKind = 'bug' | 'basket';

export interface Happening {
  id: number;
  kind: HappeningKind;
  x: number;
  z: number;
  /** Seconds left before it flies off or rots. */
  t: number;
  /** The bug's angle round the fort and which way it circles. */
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

/** What fired a projectile: a fruit, or the hero's own shot. */
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
  level: number;
  splash: number;
  /** Damage per second of poison this hit leaves behind (beekeeper passive). */
  poison: number;
}

export type SimEvent =
  | { t: 'summon'; cell: number }
  | { t: 'merge'; cell: number; level: number }
  | { t: 'feed'; cell: number; level: number; up: boolean }
  | { t: 'move'; from: number; to: number }
  | { t: 'sell'; cell: number; gold: number }
  | { t: 'fire'; cell: number; kind: Shooter }
  | { t: 'hit'; x: number; z: number; r: number; kind: Shooter }
  | { t: 'kill'; x: number; z: number; kind: EnemyKind; gold: number }
  | { t: 'burst'; x: number; z: number; r: number }
  | { t: 'cast' }
  | { t: 'bite'; x: number; z: number }
  | { t: 'juice'; cells: number[] }
  | { t: 'wave'; wave: number; boss: boolean }
  | { t: 'unlock'; cell: number }
  | { t: 'card'; id: string }
  | { t: 'trick'; x: number; z: number }
  | { t: 'revive' }
  | { t: 'happen'; kind: HappeningKind }
  | { t: 'grab'; kind: HappeningKind; x: number; z: number; gold: number; cell: number }
  | { t: 'escape'; kind: HappeningKind }
  | { t: 'over' };
