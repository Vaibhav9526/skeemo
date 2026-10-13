import { useEffect, useState } from 'react';
import { SCHOOL_CAST } from './art';
import { refreshVoice, speak, stopSpeaking, useVoice } from './voice';

const NAMES: Record<string, string> = { teacher: 'Teacher', topper: 'Topper', smartguy: 'Smart Guy', librarian: 'Librarian', principal: 'Principal' };

/** ElevenLabs settings for the cast: API key (write-only), auto-speak, and one voice id per character. */
export function VoicePanel({ onClose }: { onClose: () => void }) {
  const { status, speakingId, loadingId, error } = useVoice();
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [ids, setIds] = useState<Record<string, string>>({});

  useEffect(() => { void refreshVoice(); }, []);
  useEffect(() => { if (status) setIds(status.voices); }, [status]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const saveKey = async (value: string) => {
    const r = await window.cth.voiceSetKey(value);
    setMsg(r.ok ? (value ? 'Key saved (encrypted on this computer).' : 'Key removed.') : (r.error ?? 'Could not save.'));
    if (r.ok) setKey('');
    await refreshVoice();
  };
  const saveVoice = async (cast: string) => {
    const r = await window.cth.voiceSetVoice(cast, ids[cast] ?? '');
    setMsg(r.ok ? `${NAMES[cast]}'s voice saved.` : (r.error ?? 'Could not save.'));
    await refreshVoice();
  };

  const box = { padding: '6px 8px', borderRadius: 8, border: 'none', background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', color: 'var(--cth-ink-900)', fontSize: 12, outline: 'none' } as const;
  const btn = { border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 8, background: 'var(--cth-ink-900)', color: 'var(--cth-paper-100)', fontSize: 12, fontWeight: 600 } as const;
  const soft = { ...btn, background: 'var(--cth-cream-200)', color: 'var(--cth-ink-900)' } as const;

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,19,32,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="dialog" aria-label="Voices" style={{ width: 'min(520px, 92vw)', maxHeight: '88vh', overflow: 'auto', padding: 20, borderRadius: 16, background: 'var(--cth-cream-50)', boxShadow: '0 16px 50px rgba(26,19,32,0.3), inset 0 0 0 1px var(--cth-ink-100)', color: 'var(--cth-ink-900)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <strong style={{ fontSize: 17, flex: 1 }}>Voices — ElevenLabs</strong>
          <button type="button" onClick={onClose} style={soft}>Close</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--cth-ink-500)', margin: '6px 0 12px' }}>
          Every character can read their replies aloud. Your key stays on this computer (encrypted) and is only used to call ElevenLabs — it is never given to an agent.
        </p>

        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>API key {status?.hasKey ? '— saved ✓' : '— not set'}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={status?.hasKey ? 'Paste a new key to replace it' : 'Paste your ElevenLabs API key'} style={{ ...box, flex: 1 }} />
          <button type="button" style={btn} disabled={!key.trim()} onClick={() => { void saveKey(key); }}>Save</button>
          {status?.hasKey && <button type="button" style={soft} onClick={() => { void saveKey(''); }}>Remove</button>}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', fontSize: 13 }}>
          <input type="checkbox" checked={!!status?.auto} disabled={!status?.hasKey}
            onChange={(e) => { void window.cth.voiceSetAuto(e.target.checked).then(refreshVoice); }} />
          Speak new replies automatically (otherwise use the speaker button on a message)
        </label>

        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Voice for each character</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 8, alignItems: 'center' }}>
          {SCHOOL_CAST.map((c) => (
            <div key={c} style={{ display: 'contents' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{NAMES[c]}</span>
              <input value={ids[c] ?? ''} onChange={(e) => setIds((p) => ({ ...p, [c]: e.target.value }))} onBlur={() => { void saveVoice(c); }} spellCheck={false} style={{ ...box, fontFamily: 'monospace' }} />
              <button type="button" style={soft} disabled={!status?.hasKey}
                onClick={() => { if (speakingId === `test-${c}`) stopSpeaking(); else void saveVoice(c).then(() => speak(`test-${c}`, `Hi, I'm ${NAMES[c]}. This is how I sound.`, c)); }}>
                {loadingId === `test-${c}` ? '…' : speakingId === `test-${c}` ? 'Stop' : 'Test'}
              </button>
              <button type="button" style={soft} title="Back to the default voice" onClick={() => { setIds((p) => ({ ...p, [c]: status?.defaults[c] ?? '' })); void window.cth.voiceSetVoice(c, '').then(refreshVoice); }}>Reset</button>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--cth-ink-500)', margin: '8px 0 0' }}>A voice id is the code on a voice&apos;s ElevenLabs page (Voices → ⋯ → Copy voice ID).</p>
        {(msg || error) && <div role="status" style={{ marginTop: 10, fontSize: 12, color: error ? 'var(--cth-coral)' : 'var(--cth-ink-500)' }}>{error || msg}</div>}
      </div>
    </div>
  );
}
