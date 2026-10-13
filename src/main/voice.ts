/**
 * ElevenLabs text-to-speech for the staff-room cast. No electron import: the key is passed in,
 * fetch is injectable, and nothing here logs or returns the key.
 *
 * The key lives only in main (encrypted at rest by the caller). The renderer can ask whether a
 * key exists and can replace it, but can never read it back.
 */
import { createHash } from 'node:crypto';

export const VOICE_MODEL = 'eleven_flash_v2_5';
const API = 'https://api.elevenlabs.io/v1/text-to-speech';
export const MAX_SPOKEN_CHARS = 700;

/** ElevenLabs premade voices, one per character. Each can be overridden in the voice panel. */
export const DEFAULT_VOICES: Record<string, string> = {
  teacher: '21m00Tcm4TlvDq8ikWAM',   // Rachel — calm, clear
  topper: 'EXAVITQu4vr4xnSDxMdi',    // Bella — bright
  smartguy: 'TxGEqnHWrfWFTfGW9XjX',  // Josh — easy-going
  librarian: 'MF3mGyEYCl7XYWbV9V6O', // Elli — soft
  principal: 'pNInz6obpgDQGcFmaJgB', // Adam — deep, authoritative
};

const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
export const isVoiceId = (v: unknown): v is string => typeof v === 'string' && VOICE_ID.test(v);

/** Chat markdown → something worth reading aloud. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code omitted. ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_~>|]+/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPOKEN_CHARS);
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;

const cache = new Map<string, Buffer>();
const CACHE_MAX = 40;

export async function elevenSpeak(
  apiKey: string, voiceId: string, rawText: string, fetchFn: Fetch = fetch as unknown as Fetch,
): Promise<{ ok: true; audio: Buffer } | { ok: false; error: string }> {
  if (!apiKey) return { ok: false, error: 'Add your ElevenLabs API key first.' };
  if (!isVoiceId(voiceId)) return { ok: false, error: 'That voice id looks wrong.' };
  const text = cleanForSpeech(rawText);
  if (!text) return { ok: false, error: 'Nothing to read aloud.' };
  const k = createHash('sha1').update(`${voiceId}\n${text}`).digest('hex');
  const hit = cache.get(k);
  if (hit) return { ok: true, audio: hit };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45_000);
  try {
    const res = await fetchFn(`${API}/${voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: VOICE_MODEL }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      if (res.status === 401) return { ok: false, error: 'ElevenLabs rejected the API key.' };
      if (res.status === 402 || res.status === 429) return { ok: false, error: 'ElevenLabs quota or rate limit reached.' };
      return { ok: false, error: `ElevenLabs error ${res.status}${body ? `: ${body.replace(apiKey, '***')}` : ''}` };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) return { ok: false, error: 'ElevenLabs sent back no audio.' };
    cache.set(k, audio);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    return { ok: true, audio };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === 'AbortError' ? 'ElevenLabs took too long.' : 'Could not reach ElevenLabs.' };
  } finally {
    clearTimeout(timer);
  }
}
