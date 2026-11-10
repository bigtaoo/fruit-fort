// Wagon picks on the HUD (§10.1, docs/design/wagons.md): a thin charge line under the shield bar
// that fills with kills, and, when it is full, the pick: 3 (or 4) cards over the board while the
// fight stands still. A card names the wagon (or the supply), says new or Lv1 -> Lv2, and what it
// does in one line. Nobody waits forever: after WAGONS.autoPick seconds the first card is taken.
// Texts are English and Chinese only for now; other languages read the English.

import { WAGONS } from '../sim/config';
import type { WagonOpt } from '../sim/types';
import type { World } from '../sim/world';
import { getLocale } from '../i18n';
import { el } from './dom';
import { WAGON_COLOR } from './wagons';

type Kind = WagonOpt['kind'];
interface Text { title: string; fresh: string; auto: string; name: Record<Kind, string>; does: Record<Kind, [string, string, string]> }

const EN: Text = {
  title: 'Pick one',
  fresh: 'NEW',
  auto: 'Auto pick in {n}s',
  name: { arc: 'Arc coil', missile: 'Missile rack', frost: 'Frost tank', plasma: 'Plasma jets', mine: 'Mine layer', magnet: 'Gold magnet', gold: 'Gold crate', repair: 'Fence repair', skill: 'Skill charge' },
  does: {
    arc: ['Lightning jumps to 3 bugs', 'Jumps to 4 bugs, hits harder', 'Lightning stuns the bugs'],
    missile: ['A missile at the farthest bug', 'Two missiles at a time', 'Missiles blast an area'],
    frost: ['Ice at the fence slows bugs', 'Slows more, ice lasts longer', 'Frozen bugs take +25% damage'],
    plasma: ['Burns bugs next to the train', 'Burns 60% hotter', 'Burning bugs always take crits'],
    mine: ['Drops a mine where bugs pile up', 'Two mines at a time', 'Mines that miss wait for a bug'],
    magnet: ['+20% gold, pulls pickups in', '+35% gold, pulls from farther', 'Four cards at every pick'],
    gold: ['+{n} gold now', '', ''],
    repair: ['Fence back to full', '', ''],
    skill: ['Hero skill fully charged', '', ''],
  },
};

const ZH: Text = {
  title: '选一个',
  fresh: '新',
  auto: '{n} 秒后自动选',
  name: { arc: '电弧车厢', missile: '导弹车厢', frost: '冰霜车厢', plasma: '等离子车厢', mine: '布雷车厢', magnet: '金币磁铁', gold: '金币箱', repair: '修围栏', skill: '技能充能' },
  does: {
    arc: ['闪电连跳 3 只虫', '连跳 4 只，伤害更高', '闪电能定住虫子'],
    missile: ['导弹打最远的虫', '一次两发', '导弹爆炸范围伤害'],
    frost: ['围栏边结冰，虫子变慢', '更慢，冰留得更久', '冻住的虫多受 25% 伤害'],
    plasma: ['烧火车身边的虫', '火力提高 60%', '着火的虫必定暴击'],
    mine: ['往虫堆里丢地雷', '一次两颗', '没炸到的地雷留着等虫'],
    magnet: ['金币 +20%，吸附拾取物', '金币 +35%，吸得更远', '每次三选一变四选一'],
    gold: ['立刻 +{n} 金币', '', ''],
    repair: ['围栏回满', '', ''],
    skill: ['英雄技能立刻充满', '', ''],
  },
};

const ICON: Record<Kind, string> = { arc: '⚡', missile: '🚀', frost: '❄️', plasma: '🔥', mine: '💣', magnet: '🧲', gold: '💰', repair: '🔧', skill: '✨' };
const SUPPLY_COLOR: Record<string, number> = { gold: 0xffc940, repair: 0x7dff9a, skill: 0xffe070 };

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class WagonUi {
  private line: HTMLElement;
  private fill: HTMLElement;
  private panel: HTMLElement;
  private row: HTMLElement;
  private clock: HTMLElement;
  private clockText: HTMLElement;
  private shownFill = -1;
  private shownN = 0;
  private shownSec = -1;
  private world: World | null = null;

  constructor(root: HTMLElement, wallBox: HTMLElement) {
    this.line = el('div', 'wgchg', wallBox);
    this.fill = el('i', '', this.line);
    this.panel = el('div', 'wgpick', root);
    const box = el('div', 'wgbox', this.panel);
    el('div', 'wgtitle outl', box);
    this.row = el('div', 'wgrow', box);
    this.clock = el('div', 'wgclock', box);
    this.clockText = el('div', 'wgauto', box);
  }

  private text(): Text {
    return getLocale() === 'zh' ? ZH : EN;
  }

  update(w: World): void {
    this.world = w;
    const wg = w.wg;
    this.line.style.display = wg ? '' : 'none';
    if (!wg) return void this.panel.classList.remove('show');
    const f = Math.round(wg.fill() * 100);
    if (f !== this.shownFill) {
      this.shownFill = f;
      this.fill.style.transform = `scaleX(${f / 100})`;
      this.line.classList.toggle('full', f >= 100);
    }
    const o = wg.offer;
    this.panel.classList.toggle('show', !!o);
    if (!o) return void (this.shownN = 0);
    if (o.n !== this.shownN) this.deal(w, o.opts, o.n);
    this.clock.style.transform = `scaleX(${Math.max(0, o.t / WAGONS.autoPick)})`;
    const sec = Math.ceil(o.t);
    if (sec !== this.shownSec) {
      this.shownSec = sec;
      this.clockText.textContent = this.text().auto.replace('{n}', String(sec));
      // Nothing tapped after 4 s: the cards bounce to say they are waiting for a tap.
      this.row.classList.toggle('nudge', WAGONS.autoPick - o.t > 4);
    }
  }

  private deal(w: World, opts: WagonOpt[], n: number): void {
    this.shownN = n;
    this.shownSec = -1;
    const tx = this.text();
    (this.panel.querySelector('.wgtitle') as HTMLElement).textContent = tx.title;
    this.row.innerHTML = '';
    opts.forEach((opt, i) => {
      const supply = opt.kind === 'gold' || opt.kind === 'repair' || opt.kind === 'skill';
      const color = supply ? SUPPLY_COLOR[opt.kind] : WAGON_COLOR[opt.kind as keyof typeof WAGON_COLOR];
      const card = el('button', supply ? 'wgcard supply' : 'wgcard', this.row);
      card.style.setProperty('--wc', hex(color));
      card.style.animationDelay = `${i * 0.06}s`;
      el('span', 'wgico', card, ICON[opt.kind]);
      el('b', 'wgname', card, tx.name[opt.kind]);
      const tag = supply ? '' : opt.lv === 1 ? tx.fresh : `Lv${opt.lv - 1} → Lv${opt.lv}`;
      el('span', opt.lv === 1 ? 'wgtag fresh' : 'wgtag', card, tag);
      const gold = Math.round(WAGONS.supplyGold * w.statCost('dmg'));
      el('span', 'wgdoes', card, tx.does[opt.kind][supply ? 0 : opt.lv - 1].replace('{n}', String(gold)));
      card.onclick = (e) => {
        e.stopPropagation();
        this.world?.pickWagon(i);
      };
    });
  }
}
