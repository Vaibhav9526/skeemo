import { useSyncExternalStore } from 'react';

/**
 * Speaking for the staff-room cast (ElevenLabs, via the main process — the key never reaches
 * the renderer). One voice plays at a time; starting another stops the first.
 */
export interface VoiceStatus { hasKey: boolean; auto: boolean; voices: Record<string, string>; defaults: Record<string, string>; encrypted: boolean }
interface State { status: VoiceStatus | null; speakingId: string | null; loadingId: string | null; error: string }

let state: State = { status: null, speakingId: null, loadingId: null, error: '' };
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; subs.forEach((fn) => fn()); };
export const useVoice = (): State => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state);

export async function refreshVoice(): Promise<VoiceStatus | null> {
  try {
    const status = await window.cth.voiceStatus();
    set({ status });
    return status;
  } catch { return null; }
}

let audio: HTMLAudioElement | null = null;
let url: string | null = null;
let ticket = 0;

export function stopSpeaking(): void {
  ticket++;
  if (audio) { audio.pause(); audio.src = ''; audio = null; }
  if (url) { URL.revokeObjectURL(url); url = null; }
  set({ speakingId: null, loadingId: null });
}

/** Read `text` aloud in `cast`'s voice. `id` identifies the bubble so its button can show play/stop. */
export async function speak(id: string, text: string, cast: string): Promise<void> {
  stopSpeaking();
  const mine = ++ticket;
  set({ loadingId: id, error: '' });
  try {
    const res = await window.cth.voiceSpeak({ text, cast });
    if (mine !== ticket) return;
    if (!res.ok || !res.audio) { set({ loadingId: null, error: res.error ?? 'Could not speak.' }); return; }
    const bytes = Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0));
    url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    const el = new Audio(url);
    audio = el;
    el.onended = () => { if (mine === ticket) stopSpeaking(); };
    el.onerror = () => { if (mine === ticket) { stopSpeaking(); set({ error: 'The audio could not be played.' }); } };
    await el.play();
    if (mine === ticket) set({ loadingId: null, speakingId: id });
  } catch (e) {
    if (mine === ticket) { stopSpeaking(); set({ error: e instanceof Error ? e.message : 'Could not speak.' }); }
  }
}
