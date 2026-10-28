// Upgrade cards: the 强化 button costs gold and offers three of these; the player keeps one.
// Each card's text spells out its effect as "now → after this pick".

import { CARD, FRUITS } from './config';
import type { FruitKind } from './types';
import type { World } from './world';

export interface CardDef {
  id: string;
  /** Fruit this card belongs to, for the border colour; none for general cards. */
  kind?: FruitKind;
  weight: number;
  title: string;
  /** Effect line, read from the world as it is now. */
  text(w: World): string;
  /** Still worth offering (not maxed out). */
  ok?(w: World): boolean;
  apply(w: World): void;
}

const pct = (x: number) => `+${Math.round(x * 100)}%`;

function fruitCards(kind: FruitKind): CardDef[] {
  const name = FRUITS[kind].name;
  const b = (w: World) => w.boost[kind];
  const cards: CardDef[] = [
    {
      id: `dmg:${kind}`, kind, weight: 1, title: `${name}伤害`,
      text: (w) => `${pct(b(w).dmg * CARD.dmg)}→${pct((b(w).dmg + 1) * CARD.dmg)}`,
      apply: (w) => b(w).dmg++,
    },
    {
      id: `spd:${kind}`, kind, weight: 1, title: `${name}攻速`,
      text: (w) => `${pct(b(w).spd * CARD.spd)}→${pct((b(w).spd + 1) * CARD.spd)}`,
      apply: (w) => b(w).spd++,
    },
  ];
  const def = FRUITS[kind];
  if (kind === 'coconut') {
    cards.push({
      id: 'rng:coconut', kind, weight: 1, title: '椰子射程',
      text: (w) => `${def.range + b(w).rng * CARD.rng}→${def.range + (b(w).rng + 1) * CARD.rng}`,
      ok: (w) => b(w).rng < CARD.rngMax,
      apply: (w) => b(w).rng++,
    });
  }
  if (def.splash) {
    cards.push({
      id: `aoe:${kind}`, kind, weight: 1, title: `${name}溅射范围`,
      text: (w) => `${pct(b(w).aoe * CARD.aoe)}→${pct((b(w).aoe + 1) * CARD.aoe)}`,
      apply: (w) => b(w).aoe++,
    });
  }
  if (def.aura) {
    const aura = def.aura;
    cards.push({
      id: `aura:${kind}`, kind, weight: 1, title: `${name}光环`,
      text: (w) => `相邻攻速 ${pct(aura.base + b(w).aura * CARD.aura)}→${pct(aura.base + (b(w).aura + 1) * CARD.aura)}`,
      apply: (w) => b(w).aura++,
    });
  }
  if (def.slow) {
    const slow = def.slow;
    cards.push({
      id: `slow:${kind}`, kind, weight: 1, title: `${name}减速`,
      text: (w) => `${slow.time + b(w).slow * CARD.slow}秒→${slow.time + (b(w).slow + 1) * CARD.slow}秒`,
      apply: (w) => b(w).slow++,
    });
  }
  return cards;
}

const GENERAL: CardDef[] = [
  {
    id: 'allSpeed', weight: 1, title: '全体攻速',
    text: (w) => `${pct(w.allSpeed * CARD.allSpeed)}→${pct((w.allSpeed + 1) * CARD.allSpeed)}`,
    apply: (w) => w.allSpeed++,
  },
  {
    id: 'gold', weight: 1, title: '金币收益',
    text: (w) => `${pct(w.goldLv * CARD.gold)}→${pct((w.goldLv + 1) * CARD.gold)}`,
    apply: (w) => w.goldLv++,
  },
  {
    id: 'wall', weight: 1, title: '加固城墙',
    text: () => `上限 +${CARD.wallAdd} 并修满`,
    apply: (w) => {
      w.wallMax += CARD.wallAdd;
      w.wallHp = w.wallMax;
    },
  },
  {
    id: 'summonLevel', weight: CARD.summonLevelWeight, title: '召唤等级',
    text: (w) => `Lv${w.summonLevel}→Lv${w.summonLevel + 1}，召唤更贵`,
    ok: (w) => w.summonLevel < CARD.summonLevelMax,
    apply: (w) => w.summonLevel++,
  },
];

/** Every card this deck can draw. */
export function cardPool(deck: FruitKind[]): CardDef[] {
  return [...deck.flatMap(fruitCards), ...GENERAL];
}
