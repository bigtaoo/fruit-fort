// Switching the page's language at run time. Kept out of i18n/, which is tested in node without a DOM.

import { loadLocale, setLocale, t, type Locale } from '../i18n';

/** Fetch `locale`'s table and make it the page's language (its lang and title); false when the fetch failed (offline). */
export async function switchLocale(locale: Locale): Promise<boolean> {
  if (!(await loadLocale(locale))) return false;
  setLocale(locale);
  document.documentElement.lang = locale;
  document.title = t('title');
  return true;
}
