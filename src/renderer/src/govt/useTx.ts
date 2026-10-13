/**
 * Localised scheme / document copy. English and Hindi ship with the data; any other language is
 * translated on demand by the main process (cached on disk) and swapped in when it arrives —
 * until then the English shows, so the screen is never blank.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { L } from '@shared/govt/text';

const cache = new Map<string, string>();
const asked = new Set<string>();
const waiting = new Map<string, Set<string>>();
const subs = new Set<() => void>();
let version = 0;
let timer: number | null = null;

const notify = () => { version++; subs.forEach((f) => f()); };

function flush(): void {
  timer = null;
  for (const [lang, set] of waiting) {
    const strings = [...set].slice(0, 100);
    set.clear();
    void window.cth.govtTranslate({ lang, strings }).then((r) => {
      strings.forEach((s, i) => { if (r.out[i]) cache.set(`${lang}\n${s}`, r.out[i]); });
      notify();
    }).catch(() => undefined);
  }
  waiting.clear();
}

function want(lang: string, en: string): void {
  const k = `${lang}\n${en}`;
  if (asked.has(k)) return;
  asked.add(k);
  (waiting.get(lang) ?? waiting.set(lang, new Set()).get(lang)!).add(en);
  if (timer === null) timer = window.setTimeout(flush, 80);
}

/** `tx(l)` — the text of an `{ en, hi }` pair (or a plain English string) in the current language. */
export function useTx(): (l: L | string) => string {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => version);
  return useCallback((l: L | string) => {
    const en = typeof l === 'string' ? l : l.en;
    if (lang === 'en') return en;
    if (lang === 'hi' && typeof l !== 'string') return l.hi;
    if (!en) return en;
    const hit = cache.get(`${lang}\n${en}`);
    if (hit) return hit;
    want(lang, en);
    return en;
  }, [lang]);
}
