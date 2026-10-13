import { useCallback, useSyncExternalStore } from 'react';
import type { TeachingAttachment } from '@shared/teaching';
import type { FileToolResult } from '@shared/fileTools';
import type { ChatMsg } from './ClassroomChat';
import type { QuizData, QuizResult } from './QuizCard';

/**
 * Per-character chat state that outlives the chat view.
 *
 * ClassroomChat used to keep its messages, "typing…" flag, draft, files and quiz in
 * component state, so switching to another character unmounted it: the in-flight
 * reply was dropped on the floor and coming back showed a blank chat. Here the
 * state lives at module level, keyed by agent id. An async send holds the agent id
 * (not the component), so a reply that lands while you are chatting with someone
 * else is written to the right session and is simply there when you return.
 */
export type QuizPhase = 'loading' | 'taking' | 'grading' | 'report';

export interface ChatSession {
  loaded: boolean;
  msgs: ChatMsg[];
  /** The agent's real terminal transcript, as bubbles (polled while the chat is open). */
  lines: ChatMsg[];
  text: string;
  busy: boolean;
  error: string;
  files: TeachingAttachment[];
  toolResult: FileToolResult | null;
  quizPhase: QuizPhase | null;
  quiz: QuizData | null;
  picks: Array<number | null>;
  quizResult: QuizResult | null;
  quizError: string;
}

const blank = (): ChatSession => ({
  loaded: false, msgs: [], lines: [], text: '', busy: false, error: '', files: [], toolResult: null,
  quizPhase: null, quiz: null, picks: [], quizResult: null, quizError: '',
});

const sessions = new Map<string, ChatSession>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

export function getChatSession(id: string): ChatSession {
  let s = sessions.get(id);
  if (!s) { s = blank(); sessions.set(id, s); }
  return s;
}

type Updater<T> = T | ((prev: T) => T);

export function patchChatSession(id: string, patch: Partial<ChatSession>): void {
  sessions.set(id, { ...getChatSession(id), ...patch });
  emit();
}

/** Forget a chat (after "Clear chat" or deleting the character). */
export function resetChatSession(id: string): void {
  sessions.delete(id);
  emit();
}

/** True while any character has a reply on the way — used to keep the badge honest. */
export function busyChatIds(): string[] {
  return [...sessions].filter(([, s]) => s.busy || s.quizPhase === 'loading' || s.quizPhase === 'grading').map(([id]) => id);
}

/** Read + write one field of a character's session, like useState but shared and durable. */
export function useChatField<K extends keyof ChatSession>(id: string, key: K): [ChatSession[K], (next: Updater<ChatSession[K]>) => void] {
  const value = useSyncExternalStore(
    (onChange) => { subs.add(onChange); return () => subs.delete(onChange); },
    () => getChatSession(id)[key],
  );
  const set = useCallback((next: Updater<ChatSession[K]>) => {
    const cur = getChatSession(id)[key];
    const v = typeof next === 'function' ? (next as (p: ChatSession[K]) => ChatSession[K])(cur) : next;
    patchChatSession(id, { [key]: v } as Partial<ChatSession>);
  }, [id, key]);
  return [value, set];
}

/** Subscribe to "which chats are busy" (for the rail's typing dots). */
export function useBusyChats(): string {
  return useSyncExternalStore(
    (onChange) => { subs.add(onChange); return () => subs.delete(onChange); },
    () => busyChatIds().join(','),
  );
}

// ── in-flight work ──
// `busy` is true while any request for this character is outstanding. A counter (not a flag)
// because plain messages may be sent while an earlier reply is still being written.
const work = new Map<string, number>();
export function beginWork(id: string): void {
  work.set(id, (work.get(id) ?? 0) + 1);
  patchChatSession(id, { busy: true });
}
export function endWork(id: string): void {
  const n = Math.max(0, (work.get(id) ?? 1) - 1);
  if (n) work.set(id, n); else work.delete(id);
  patchChatSession(id, { busy: n > 0 });
}

const chains = new Map<string, Promise<unknown>>();
/** Run `job` after every earlier job for this character, so replies arrive in the order sent. */
export function enqueueChat<T>(id: string, job: () => Promise<T>): Promise<T> {
  beginWork(id);
  const run = (chains.get(id) ?? Promise.resolve()).catch(() => undefined).then(job);
  const tail = run.finally(() => endWork(id));
  chains.set(id, tail);
  void tail.catch(() => undefined).then(() => { if (chains.get(id) === tail) chains.delete(id); });
  return run;
}

/** Characters whose persona was already typed into their terminal this launch (so it is only sent once). */
export const introduced = new Set<string>();
