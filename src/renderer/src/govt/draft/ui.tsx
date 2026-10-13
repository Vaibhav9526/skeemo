import { CATEGORY_EMOJI } from './categoryIcons';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTORS, drawLook, PX_H, PX_W, type ActorId, type Look } from './art/people';
import { speak, startListening, stopListening, stopSpeaking, useVoiceState } from './voice';
import { useGovt } from './state';
import { useTx } from './useTx';
import { CATEGORY_LABEL, type Scheme } from '@shared/govt/schemes';

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

/** 🔊 — read `text` aloud in this desk's voice. */
export function SpeakButton({ id, text, desk, className = 'g-iconbtn' }: { id: string; text: string; desk: ActorId; className?: string }) {
  const { t } = useTranslation('govtdraft');
  const v = useVoiceState();
  const hasKey = useGovt((s) => s.settings?.hasKey);
  const playing = v.speakingId === id, loading = v.loadingId === id;
  return (
    <button
      type="button" className={`${className}${playing ? ' on' : ''}`}
      title={hasKey ? t('voice.listen') : t('voice.needKey')}
      aria-label={t('voice.listen')}
      onClick={() => {
        if (!hasKey) { useGovt.getState().setSettingsOpen(true); return; }
        if (playing || loading) stopSpeaking(); else void speak(id, text, desk);
      }}
    >{loading ? '…' : playing ? '■' : '🔊'}</button>
  );
}

/** 🎤 — dictate into a text box (ElevenLabs Scribe). */
export function MicButton({ onText }: { onText: (text: string) => void }) {
  const { t } = useTranslation('govtdraft');
  const v = useVoiceState();
  const hasKey = useGovt((s) => s.settings?.hasKey);
  return (
    <button
      type="button" className={`g-mic${v.listening ? ' live' : ''}`}
      title={hasKey ? (v.listening ? t('voice.stop') : t('voice.speakNow')) : t('voice.needKey')}
      aria-label={t('voice.speakNow')}
      disabled={v.loadingId === 'mic'}
      onClick={() => {
        if (!hasKey) { useGovt.getState().setSettingsOpen(true); return; }
        if (v.listening) stopListening(); else void startListening(onText);
      }}
    >{v.loadingId === 'mic' ? '…' : v.listening ? '■' : '🎤'}</button>
  );
}

export function VoiceError() {
  const v = useVoiceState();
  return v.error ? <div className="g-err" role="alert">{v.error}</div> : null;
}

/** The worker's own greeting bubble, with a speak button. */
export function Say({ id, desk, children, text }: { id: string; desk: ActorId; children: ReactNode; text: string }) {
  return (
    <div className="g-say">
      <span className="speak"><SpeakButton id={id} desk={desk} text={text} className="g-iconbtn" /></span>
      <div>{children}</div>
    </div>
  );
}

export function DeskHeader({ actor, onClose }: { actor: ActorId; onClose: () => void }) {
  const { t } = useTranslation('govtdraft');
  const a = ACTORS[actor];
  return (
    <div className="g-deskhead">
      <div className="g-portrait"><Pixie look={a.look} scale={3} bust label={a.name} /></div>
      <div className="who">
        <b>{a.name}</b>
        <span>{t(`desk.${actor}.title`)}</span>
      </div>
      <button className="g-iconbtn" aria-label={t('common.close')} onClick={onClose}>✕</button>
    </div>
  );
}

export function SchemeBrief({ scheme, compact = false }: { scheme: Scheme; compact?: boolean }) {
  const tx = useTx();
  const cat = CATEGORY_LABEL[scheme.category];
  return (
    <div>
      <div className="g-title">{tx(scheme.name)}</div>
      <div className="g-muted">{CATEGORY_EMOJI[scheme.category]} {tx(cat)}</div>
      <div style={{ marginTop: 4 }}>{tx(scheme.short)}</div>
      {!compact && <div style={{ marginTop: 6 }}><b>✦ </b>{tx(scheme.benefit)}</div>}
    </div>
  );
}

/** Auto-speak a worker's new message when the citizen has "read aloud" switched on. */
export function useAutoSpeak(id: string, text: string, desk: ActorId, enabled = true): void {
  const auto = useGovt((s) => s.settings?.autoVoice && s.settings.hasKey);
  const last = useRef('');
  useEffect(() => {
    if (!auto || !enabled || !text || last.current === id + text) return;
    last.current = id + text;
    void speak(id, text, desk);
  }, [auto, enabled, id, text, desk]);
}
