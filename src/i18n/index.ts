import { en } from './en';
import { MORE, MORE_NAMES } from './more';
import { zh } from './zh';

// String tables (docs/design/tech.md §13). English is the source: every other table is typed as
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

/**
 * Longest the boot waits for a language chunk (ms). A stalled `import()` does not reject — it hangs on the
 * browser's own network timeout, which is minutes — and the boot awaits this before it marks `save`, so the
 * loading screen would sit at 94% with nothing on screen. 2026-11-23: one session did sit there 66.7 s, its
 * Bridge gone the same way (`boot_left` stage `build`, `sdk` false). Giving up only drops back to English.
 */
const FETCH_WAIT_MS = 6_000;

/** Chunks being fetched, so two calls for one language share a fetch and a late one still lands in TABLES. */
const fetching: Partial<Record<Locale, Promise<boolean>>> = {};

/**
 * Fetches `locale`'s table if it is not in hand yet; false when the fetch failed or took longer than
 * FETCH_WAIT_MS (t() then reads English). A fetch given up on keeps going: it fills TABLES when it lands,
 * so the next call — the player picking the language again, or the village relabelling — has it at once.
 */
export async function loadLocale(locale: Locale): Promise<boolean> {
  if (TABLES[locale]) return true;
  const load = MORE[locale];
  if (!load) return false;
  const started = (fetching[locale] ??= load().then(
    (table) => {
      TABLES[locale] = table;
      return true;
    },
    () => {
      // Let a later call try again: a one-off network failure should not kill the language for the page.
      delete fetching[locale];
      return false;
    },
  ));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      started,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), FETCH_WAIT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
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

/** Per-locale strings read before the table (the sci-fi theme's wording, i18n/scifi.ts). */
let overlay: Partial<Record<Locale, object>> = {};

export function setOverlay(o: Partial<Record<Locale, object>>): void {
  overlay = o;
}

function find(root: unknown, key: string): string | undefined {
  let node = root;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function lookup(key: string, locale: Locale): string {
  return find(overlay[locale], key) ?? find(TABLES[locale] ?? TABLES.en, key) ?? key;
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
