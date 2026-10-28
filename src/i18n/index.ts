import { en } from './en';
import { MORE, MORE_NAMES } from './more';
import { zh } from './zh';

// String tables (docs/design.md §16). English is the source: every other table is typed as
// Table<typeof en>, so a missing or extra key is a compile error. Keys are dotted paths checked
// at compile time: t('hud.summon'). The same fifteen languages as Standing, en and zh in the main
// chunk, the other thirteen fetched when picked (i18n/more.ts).

export type Locale = 'en' | 'zh' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'pl' | 'ru' | 'ja' | 'ko' | 'vi' | 'tr' | 'th' | 'id';
export const LOCALES: readonly Locale[] = ['en', 'zh', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'ja', 'ko', 'vi', 'tr', 'th', 'id'];
export const DEFAULT_LOCALE: Locale = 'en';

export type Table<T> = { [K in keyof T]: T[K] extends string ? string : Table<T[K]> };

type Paths<T> = {
  [K in keyof T & (string | number)]: T[K] extends string ? `${K}` : `${K}.${Paths<T[K]>}`;
}[keyof T & (string | number)];

export type Key = Paths<typeof en>;

const TABLES: Partial<Record<Locale, Table<typeof en>>> = { en, zh };

/** Fetches `locale`'s table if it is not in hand yet; false when the fetch failed (t() then reads English). */
export async function loadLocale(locale: Locale): Promise<boolean> {
  if (TABLES[locale]) return true;
  const load = MORE[locale];
  if (!load) return false;
  try {
    TABLES[locale] = await load();
    return true;
  } catch {
    return false;
  }
}

let current: Locale = DEFAULT_LOCALE;

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** The first supported language in a preference list; only the base subtag counts ('in' reads as 'id'). */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const raw = tag.split(/[-_]/)[0]?.toLowerCase();
    const base = raw === 'in' ? 'id' : raw;
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

function lookup(key: string, locale: Locale): string {
  let node: unknown = TABLES[locale] ?? TABLES.en;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : key;
}

/**
 * The text for `key` in the current locale, with {name} placeholders filled from `vars`, and
 * {n|one:pest|other:pests} picking the word for the count `n` by the language's plural rules.
 */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const text = lookup(key, current);
  if (!vars) return text;
  return text
    .replace(/\{(\w+)\|([^{}]+)\}/g, (whole, name: string, forms: string) => (name in vars ? pluralForm(forms, Number(vars[name]), current) : whole))
    .replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

const RULES: Partial<Record<Locale, Intl.PluralRules | null>> = {};

/** `n`'s plural category in `locale`; English's rule where Intl.PluralRules is missing. */
export function pluralCategory(n: number, locale: Locale): string {
  if (RULES[locale] === undefined) {
    try {
      RULES[locale] = typeof Intl !== 'undefined' && Intl.PluralRules ? new Intl.PluralRules(locale) : null;
    } catch {
      RULES[locale] = null;
    }
  }
  return RULES[locale]?.select(n) ?? (n === 1 ? 'one' : 'other');
}

function pluralForm(forms: string, n: number, locale: Locale): string {
  const table = new Map<string, string>();
  for (const part of forms.split('|')) {
    const at = part.indexOf(':');
    if (at > 0) table.set(part.slice(0, at), part.slice(at + 1));
  }
  return table.get(pluralCategory(n, locale)) ?? table.get('other') ?? '';
}

/** A language's own name for itself, for the picker. */
export function localeName(locale: Locale): string {
  return TABLES[locale]?.lang.name ?? MORE_NAMES[locale] ?? en.lang.name;
}
