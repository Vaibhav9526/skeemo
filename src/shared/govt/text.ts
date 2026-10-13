/**
 * Bilingual copy that ships with the data (scheme names, document names, benefits).
 * English and Hindi are written by hand; every other language is translated on demand by
 * the main process (see main/govt/translate.ts) and falls back to English until it arrives.
 */
export interface L { en: string; hi: string }

export function pick(l: L, lang: string): string {
  return lang === 'hi' ? l.hi : l.en;
}
