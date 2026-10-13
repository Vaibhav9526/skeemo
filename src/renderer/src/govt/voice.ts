/**
 * Voice for the counters: read a worker's words aloud (ElevenLabs, via the main process — the key
 * never reaches the renderer) and take dictation from the microphone (ElevenLabs Scribe).
 * One voice plays at a time.
 */
import { useSyncExternalStore } from 'react';
import i18n from '@/i18n';

interface VoiceState { speakingId: string | null; loadingId: string | null; listening: boolean; error: string }
let state: VoiceState = { speakingId: null, loadingId: null, listening: false, error: '' };
const subs = new Set<() => void>();
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const useVoiceState = (): VoiceState => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state);

let audio: HTMLAudioElement | null = null;
let url: string | null = null;
let ticket = 0;

export function stopSpeaking(): void {
  ticket++;
  if (audio) { audio.pause(); audio.src = ''; audio = null; }
  if (url) { URL.revokeObjectURL(url); url = null; }
  set({ speakingId: null, loadingId: null });
}

/** Read `text` aloud in `desk`'s voice and the current language. `id` lets a button show play/stop. */
export async function speak(id: string, text: string, desk: string): Promise<void> {
  stopSpeaking();
  const mine = ++ticket;
  set({ loadingId: id, error: '' });
  try {
    const res = await window.cth.govtVoiceSpeak({ text, desk, lang: i18n.language });
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

// ─── dictation ──────────────────────────────────────────────────────────────

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let stopTimer: number | null = null;
let onText: ((t: string) => void) | null = null;

function release(): void {
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  stream?.getTracks().forEach((t) => t.stop());
  stream = null; recorder = null;
  set({ listening: false });
}

/** Start listening. `done` gets the transcript. Call stopListening() (or wait 25 s) to finish. */
export async function startListening(done: (text: string) => void): Promise<void> {
  if (recorder) return;
  stopSpeaking();
  set({ error: '' });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    set({ error: 'The microphone is blocked. Allow microphone access and try again.' });
    return;
  }
  chunks = [];
  onText = done;
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    const cb = onText;
    release();
    if (blob.size < 1500 || !cb) return;
    set({ loadingId: 'mic' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const res = await window.cth.govtVoiceTranscribe({ audio: btoa(bin), mime: blob.type, lang: i18n.language }).catch(() => null);
    set({ loadingId: null });
    if (res?.ok && res.text) cb(res.text);
    else set({ error: res?.error ?? 'Could not understand that.' });
  };
  recorder.start();
  set({ listening: true });
  stopTimer = window.setTimeout(() => stopListening(), 25_000);
}

export function stopListening(): void {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else release();
}
