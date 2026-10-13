/**
 * Form Submission desk → SuperJargon. SuperJargon is a separate desktop companion that sees the
 * screen and talks the user through a form. We open the scheme's official portal in the browser,
 * start SuperJargon (or bring it forward if it is already running) and put a ready-made request
 * on the clipboard to say to it. No electron import: callers pass the exe path and the openers.
 */
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Where SuperJargon is usually found on this machine, best first. */
export const SUPERJARGON_CANDIDATES: readonly string[] = [
  'D:\\Work\\superJargon\\release\\win-unpacked\\SuperJargon.exe',
  'D:\\Work\\superJargon\\release\\win-arm64-unpacked\\SuperJargon.exe',
];

export function findSuperJargon(custom: string, extra: readonly string[] = []): string | null {
  const local = process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Programs', 'superjargon', 'SuperJargon.exe'), join(process.env.LOCALAPPDATA, 'Programs', 'SuperJargon', 'SuperJargon.exe')] : [];
  for (const p of [custom, ...SUPERJARGON_CANDIDATES, ...local, ...extra]) {
    try {
      if (p && /\.exe$/i.test(p) && existsSync(p) && statSync(p).isFile()) return p;
    } catch { /* try the next one */ }
  }
  return null;
}

/** Start the exe detached, with none of this app's Electron/Vite environment leaking into it. */
export function startDetached(exe: string): void {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(ELECTRON_|VITE_|NODE_OPTIONS$|ELECTRON$)/i.test(k) || v === undefined) continue;
    env[k] = v;
  }
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', env, windowsHide: false });
  child.on('error', () => undefined);
  child.unref();
}

export interface GuideInput {
  schemeName: string;
  portal: string;
  language: string;
  fields: ReadonlyArray<readonly [string, string]>;
}

/** What to say to SuperJargon (also placed on the clipboard). */
export function guidePrompt(g: GuideInput): string {
  const lines = g.fields.map(([k, v]) => `- ${k}: ${v}`).join('\n');
  return [
    `Guide me step by step through filling the ${g.schemeName} application form that is open on my screen. Point at each field and tell me what to enter, in ${g.language}.`,
    `My verified details (read them out when I reach that field):\n${lines}`,
    'Do not submit anything for me — wait for me to confirm each step.',
  ].join('\n');
}

/** Only an https URL from the catalogue is ever opened in the browser. */
export const isSafePortal = (u: string): boolean => /^https:\/\/[a-z0-9.-]+(\/[^\s]*)?$/i.test(u);
