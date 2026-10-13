import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { drawLook, PX_H, PX_W, type ActorId, type Look, ACTORS } from './art/people';
import { speak, startListening, stopListening, stopSpeaking, useVoiceState } from './voice';
import { useGovt } from './state';
import { useTx } from './useTx';
import { Icon } from './icons';
import type { Scheme } from '@shared/govt/schemes';

/** A pixel person on a canvas: a full body, or just head and shoulders. */
export function Pixie({ look, scale = 4, bust = false, label }: { look: Look; scale?: number; bust?: boolean; label?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const h = bust ? 26 : PX_H;
    c.width = PX_W * scale; c.height = h * scale;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawLook(ctx, look, scale, { bustOnly: bust });
  }, [look, scale, bust]);
  return <canvas ref={ref} role="img" aria-label={label ?? ''} style={{ imageRendering: 'pixelated', display: 'block' }} />;
}

/** The head-and-shoulders portrait of a counter's worker. */
export function AgentFace({ actor, scale = 2 }: { actor: ActorId; scale?: number }) {
  return <Pixie look={ACTORS[actor].look} scale={scale} bust label={ACTORS[actor].name} />;
}

/** Read `text` aloud in this desk's voice. */
export function SpeakButton({ id, text, desk, className = 'sk-icon-btn' }: { id: string; text: string; desk: ActorId; className?: string }) {
  const { t } = useTranslation('govt');
  const v = useVoiceState();
  const hasKey = useGovt((s) => s.settings?.hasKey);
  const playing = v.speakingId === id, loading = v.loadingId === id;
  return (
    <button
      type="button" className={`${className}${playing ? ' on' : ''}`}
      title={hasKey ? t('voice.listen') : t('voice.needKey')} aria-label={t('voice.listen')}
      onClick={() => {
        if (!hasKey) { useGovt.getState().setSettingsOpen(true); return; }
        if (playing || loading) stopSpeaking(); else void speak(id, text, desk);
      }}
    >
      {loading ? <span className="sk-typing" aria-hidden><i /><i /><i /></span> : <Icon name={playing ? 'stop' : 'speaker'} size={16} />}
    </button>
  );
}

/** Dictate into a text box (ElevenLabs Scribe). */
export function MicButton({ onText }: { onText: (text: string) => void }) {
  const { t } = useTranslation('govt');
  const v = useVoiceState();
  const hasKey = useGovt((s) => s.settings?.hasKey);
  return (
    <button
      type="button" className={`sk-icon-btn sk-mic${v.listening ? ' live' : ''}`}
      title={hasKey ? (v.listening ? t('voice.stop') : t('voice.speakNow')) : t('voice.needKey')} aria-label={t('voice.speakNow')}
      disabled={v.loadingId === 'mic'}
      onClick={() => {
        if (!hasKey) { useGovt.getState().setSettingsOpen(true); return; }
        if (v.listening) stopListening(); else void startListening(onText);
      }}
    >
      <Icon name={v.listening ? 'stop' : 'mic'} size={18} />
    </button>
  );
}

export function VoiceError() {
  const v = useVoiceState();
  return v.error ? <div className="sk-err" role="alert">{v.error}</div> : null;
}

export function SchemeBrief({ scheme, compact = false }: { scheme: Scheme; compact?: boolean }) {
  const { t } = useTranslation('govt');
  const tx = useTx();
  return (
    <div className="sk-row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
      <span className="sk-item" style={{ padding: 0, border: 0, display: 'block' }}><span className="ico"><Icon name={scheme.category} size={18} /></span></span>
      <div style={{ minWidth: 0 }}>
        <div className="sk-title">{tx(scheme.name)}</div>
        <div className="sk-small sk-muted">{t(`schemecat.${scheme.category}`)}</div>
        <p style={{ marginTop: 4 }}>{tx(scheme.short)}</p>
        {!compact && <p className="sk-muted" style={{ marginTop: 4 }}>{tx(scheme.benefit)}</p>}
      </div>
    </div>
  );
}

export function StatusIcon({ ok, size = 16 }: { ok: boolean | null; size?: number }) {
  return <Icon name={ok === true ? 'checkCircle' : ok === false ? 'xCircle' : 'alert'} size={size} className={`mark ${ok === true ? 'ok' : ok === false ? 'bad' : 'wait'}`} />;
}

/** Read a worker's new message aloud when the citizen has "read aloud" switched on. */
export function useAutoSpeak(id: string, text: string, desk: ActorId, enabled = true): void {
  const auto = useGovt((s) => s.settings?.autoVoice && s.settings.hasKey);
  const last = useRef('');
  useEffect(() => {
    if (!auto || !enabled || !text || last.current === id + text) return;
    last.current = id + text;
    void speak(id, text, desk);
  }, [auto, enabled, id, text, desk]);
}
