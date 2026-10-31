import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { id } from './id';
import { it as italian } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { pl } from './pl';
import { pt } from './pt';
import { ru } from './ru';
import { th } from './th';
import { tr } from './tr';
import { vi } from './vi';
import { en } from './en';
import { MORE_NAMES } from './more';
import { zh } from './zh';
import { detectLocale, loadLocale, LOCALES, localeName, setLocale, t } from './index';
import { STAT_KEYS } from '../sim/config';
import { newSave, taskText } from '../meta/progress';

const TABLES = { en, zh, de, es, fr, id, it: italian, ja, ko, pl, pt, ru, th, tr, vi };

function leaves(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)));
}

describe('i18n', () => {
  beforeAll(async () => {
    for (const l of LOCALES) expect(await loadLocale(l), l).toBe(true);
  });
  afterEach(() => setLocale('en'));

  it('ships the fifteen languages Standing does, each named in itself', () => {
    expect(LOCALES).toEqual(['en', 'zh', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'ja', 'ko', 'vi', 'tr', 'th', 'id']);
    expect(new Set(LOCALES.map(localeName)).size).toBe(LOCALES.length);
    for (const [l, name] of Object.entries(MORE_NAMES)) expect(name, l).toBe(TABLES[l as keyof typeof TABLES].lang.name);
  });

  it('every table has the same keys and no empty strings', () => {
    for (const l of LOCALES) {
      expect(leaves(TABLES[l]).sort(), l).toEqual(leaves(en).sort());
      setLocale(l);
      for (const key of leaves(en)) expect(t(key as never).trim(), `${l} ${key}`).not.toBe('');
    }
  });

  it('keeps the same placeholders in every language', () => {
    const holes = (s: string) => [...new Set(s.match(/\{\w+(?=[}|])/g) ?? [])].sort().join();
    for (const l of LOCALES) {
      for (const key of leaves(en)) {
        const get = (table: object) => key.split('.').reduce<any>((n, k) => n[k], table) as string;
        expect(holes(get(TABLES[l])), `${l} ${key}`).toBe(holes(get(en)));
      }
    }
  });

  it('fills placeholders and plural forms', () => {
    expect(t('hud.stats', { min: '1.5', kills: 1 })).toBe('1.5 min, 1 bug squashed');
    expect(t('hud.stats', { min: '2.0', kills: 7 })).toBe('2.0 min, 7 bugs squashed');
    setLocale('ru');
    for (const n of [1, 3, 5, 21]) expect(t('hud.stats', { min: '1', kills: n })).not.toMatch(/[{}|]/);
  });

  it('reads the language from a preference list', () => {
    expect(detectLocale(['zh-CN'])).toBe('zh');
    expect(detectLocale(['xx', 'pt_BR'])).toBe('pt');
    expect(detectLocale(['in'])).toBe('id');
    expect(detectLocale(['sv'])).toBe('en');
  });

  it('game text comes out filled in every language', () => {
    const s = newSave();
    for (const l of LOCALES) {
      setLocale(l);
      for (const k of STAT_KEYS) expect(`${t(`stat.${k}.name`)} ${t(`stat.${k}.text`)}`, `${l} ${k}`).not.toMatch(/[{}]|stat\./);
      for (const task of s.daily.tasks) expect(taskText(task), l).not.toMatch(/[{}]|task\./);
    }
  });
});
