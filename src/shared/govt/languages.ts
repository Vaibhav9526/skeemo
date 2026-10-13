/**
 * The languages the app speaks. `eleven` is the ElevenLabs language code for speech; the voice
 * model is chosen per language because the fast model covers fewer Indian languages than v3.
 */
export const GOVT_LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', dir: 'ltr', bcp47: 'en-IN' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', dir: 'ltr', bcp47: 'hi-IN' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', dir: 'ltr', bcp47: 'bn-IN' },
  { code: 'mr', native: 'मराठी', english: 'Marathi', dir: 'ltr', bcp47: 'mr-IN' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', dir: 'ltr', bcp47: 'te-IN' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', dir: 'ltr', bcp47: 'ta-IN' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', dir: 'ltr', bcp47: 'gu-IN' },
  { code: 'ur', native: 'اردو', english: 'Urdu', dir: 'rtl', bcp47: 'ur-IN' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', dir: 'ltr', bcp47: 'kn-IN' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', dir: 'ltr', bcp47: 'ml-IN' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', dir: 'ltr', bcp47: 'pa-IN' },
] as const;

export type GovtLang = (typeof GOVT_LANGUAGES)[number]['code'];
export const GOVT_LANG_CODES: readonly string[] = GOVT_LANGUAGES.map((l) => l.code);
export const isGovtLang = (v: unknown): v is GovtLang => typeof v === 'string' && GOVT_LANG_CODES.includes(v);

export function languageInfo(code: string): (typeof GOVT_LANGUAGES)[number] {
  return GOVT_LANGUAGES.find((l) => l.code === code) ?? GOVT_LANGUAGES[0];
}

/** Languages the low-latency model speaks well; the rest need the expressive v3 model. */
const FLASH_LANGS: readonly string[] = ['en', 'hi', 'ta'];
export const VOICE_MODEL_FAST = 'eleven_flash_v2_5';
export const VOICE_MODEL_WIDE = 'eleven_v3';
export const VOICE_MODEL_FALLBACK = 'eleven_multilingual_v2';

export function voiceModelFor(lang: string): string {
  return FLASH_LANGS.includes(lang) ? VOICE_MODEL_FAST : VOICE_MODEL_WIDE;
}
