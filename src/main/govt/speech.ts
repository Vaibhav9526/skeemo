/**
 * ElevenLabs speech for Samadhaan: text-to-speech in the citizen's language (each desk has its
 * own voice) and speech-to-text (Scribe) so they can talk instead of type. No electron import:
 * the key and fetch are passed in; nothing here logs or returns the key.
 */
import { createHash } from 'node:crypto';
import { cleanForSpeech, isVoiceId } from '../voice';
import { VOICE_MODEL_FALLBACK, languageInfo, voiceModelFor } from '../../shared/govt/languages';

const API = 'https://api.elevenlabs.io/v1';

/** One premade ElevenLabs voice per desk; the Settings panel can override any of them. */
export const DESK_VOICES: Record<string, string> = {
  reception: 'EXAVITQu4vr4xnSDxMdi',    // Sarah — warm, welcoming
  registration: 'pNInz6obpgDQGcFmaJgB', // Adam — steady
  documents: 'XrExE9yKIg1WjnnlVkGX',    // Matilda — precise
  eligibility: 'TxGEqnHWrfWFTfGW9XjX',  // Josh — direct
  form: 'ErXwobaYiN019PkySvjV',         // Antoni — patient guide
  help: 'MF3mGyEYCl7XYWbV9V6O',         // Elli — clear
  peon: 'VR6AewLTigWG4xSOukaG',         // Arnold — gruff, friendly
};

type Res = { ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; json(): Promise<unknown> };
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string | FormData; signal?: AbortSignal }) => Promise<Res>;

const cache = new Map<string, Buffer>();
const CACHE_MAX = 60;

function errorFor(status: number, body: string, key: string): string {
  if (status === 401) return 'ElevenLabs rejected the API key.';
  if (status === 402 || status === 429) return 'ElevenLabs quota or rate limit reached.';
  if (status === 422) return 'ElevenLabs could not use that voice or language.';
  return `ElevenLabs error ${status}${body ? `: ${body.slice(0, 160).replace(key, '***')}` : ''}`;
}

async function once(apiKey: string, voiceId: string, text: string, model: string, lang: string, fetchFn: FetchLike): Promise<{ ok: true; audio: Buffer } | { ok: false; error: string; status: number }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 50_000);
  try {
    const res = await fetchFn(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      // v3 and flash take the language from the text itself; flash also accepts a hint.
      body: JSON.stringify({ text, model_id: model, ...(model === 'eleven_flash_v2_5' ? { language_code: lang } : {}) }),
      signal: ctl.signal,
    });
    if (!res.ok) return { ok: false, status: res.status, error: errorFor(res.status, await res.text().catch(() => ''), apiKey) };
    const audio = Buffer.from(await res.arrayBuffer());
    return audio.length ? { ok: true, audio } : { ok: false, status: 0, error: 'ElevenLabs sent back no audio.' };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error && e.name === 'AbortError' ? 'ElevenLabs took too long.' : 'Could not reach ElevenLabs.' };
  } finally {
    clearTimeout(timer);
  }
}

export async function speak(apiKey: string, voiceId: string, rawText: string, lang: string, fetchFn: FetchLike = fetch as unknown as FetchLike): Promise<{ ok: true; audio: Buffer } | { ok: false; error: string }> {
  if (!apiKey) return { ok: false, error: 'Add your ElevenLabs API key first (Settings → Voice).' };
  if (!isVoiceId(voiceId)) return { ok: false, error: 'That voice id looks wrong.' };
  const text = cleanForSpeech(rawText);
  if (!text) return { ok: false, error: 'Nothing to read aloud.' };
  const model = voiceModelFor(lang);
  const k = createHash('sha1').update(`${voiceId}\n${model}\n${lang}\n${text}`).digest('hex');
  const hit = cache.get(k);
  if (hit) return { ok: true, audio: hit };
  let r = await once(apiKey, voiceId, text, model, languageInfo(lang).code, fetchFn);
  // the newest model may be unavailable on a plan — the multilingual v2 model still speaks Hindi/Tamil/Urdu etc.
  if (!r.ok && model !== VOICE_MODEL_FALLBACK && (r.status === 400 || r.status === 403 || r.status === 404 || r.status === 422)) {
    r = await once(apiKey, voiceId, text, VOICE_MODEL_FALLBACK, lang, fetchFn);
  }
  if (!r.ok) return { ok: false, error: r.error };
  cache.set(k, r.audio);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return { ok: true, audio: r.audio };
}

export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

/** Speech → text with ElevenLabs Scribe. `lang` is a hint; Scribe also detects the language. */
export async function transcribe(apiKey: string, audio: Buffer, mime: string, lang: string, fetchFn: FetchLike = fetch as unknown as FetchLike): Promise<{ ok: true; text: string; language: string } | { ok: false; error: string }> {
  if (!apiKey) return { ok: false, error: 'Add your ElevenLabs API key first (Settings → Voice).' };
  if (!audio.length) return { ok: false, error: 'No audio was recorded.' };
  if (audio.length > MAX_AUDIO_BYTES) return { ok: false, error: 'That recording is too long.' };
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('tag_audio_events', 'false');
  if (lang) form.append('language_code', lang);
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime || 'audio/webm' }), 'speech.webm');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60_000);
  try {
    const res = await fetchFn(`${API}/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': apiKey }, body: form, signal: ctl.signal });
    if (!res.ok) return { ok: false, error: errorFor(res.status, await res.text().catch(() => ''), apiKey) };
    const o = (await res.json()) as { text?: unknown; language_code?: unknown };
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    return text ? { ok: true, text: text.slice(0, 2000), language: typeof o.language_code === 'string' ? o.language_code : lang } : { ok: false, error: 'I could not hear anything — please try again.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === 'AbortError' ? 'ElevenLabs took too long.' : 'Could not reach ElevenLabs.' };
  } finally {
    clearTimeout(timer);
  }
}
