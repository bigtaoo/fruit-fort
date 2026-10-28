export type FruitKind = 'strawberry' | 'coconut' | 'watermelon' | 'grape' | 'lemon';
export type EnemyKind = 'caterpillar' | 'beetle' | 'crow' | 'boss';
/** 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x). */
export type Side = 0 | 1 | 2 | 3;

export interface Fruit {
  id: number;
  kind: FruitKind;
  level: number;
  cooldown: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  side: Side;
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
}

export interface Projectile {
  id: number;
  kind: FruitKind;
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
}

export type SimEvent =
  | { t: 'summon'; cell: number }
  | { t: 'merge'; cell: number; level: number }
  | { t: 'move'; from: number; to: number }
  | { t: 'sell'; cell: number; gold: number }
  | { t: 'hit'; x: number; z: number; r: number; kind: FruitKind }
  | { t: 'kill'; x: number; z: number; kind: EnemyKind; gold: number }
  | { t: 'burst'; x: number; z: number; r: number }
  | { t: 'cast' }
  | { t: 'wave'; wave: number; boss: boolean }
  | { t: 'unlock'; cell: number }
  | { t: 'over' };
