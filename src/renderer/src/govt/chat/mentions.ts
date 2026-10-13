/**
 * @mentions that call a counter, parsed without any UI dependency so they can be tested on their own.
 */
import type { DeskId } from '@shared/govt/cases';

export type Target = DeskId | 'vault';

const ALIASES: Record<string, Target> = {
  reception: 'reception', welcome: 'reception',
  registration: 'registration', register: 'registration', reg: 'registration',
  documents: 'documents', document: 'documents', docs: 'documents', verification: 'documents',
  eligibility: 'eligibility', eligible: 'eligibility', check: 'eligibility',
  form: 'form', submit: 'form', superjargon: 'form',
  help: 'help', support: 'help',
  vault: 'vault', files: 'vault',
};

export const MENTION_LIST: ReadonlyArray<{ key: string; target: Target }> = [
  { key: 'reception', target: 'reception' }, { key: 'registration', target: 'registration' }, { key: 'documents', target: 'documents' },
  { key: 'eligibility', target: 'eligibility' }, { key: 'form', target: 'form' }, { key: 'help', target: 'help' }, { key: 'vault', target: 'vault' },
];

/** First `@word` that names a counter → where the message goes, and the text without the mention. */
export function parseMention(text: string): { target: Target | null; rest: string } {
  const m = /(^|\s)@([a-z]+)\b/i.exec(text);
  if (!m) return { target: null, rest: text.trim() };
  const target = ALIASES[m[2].toLowerCase()];
  if (!target) return { target: null, rest: text.trim() };
  return { target, rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
}
