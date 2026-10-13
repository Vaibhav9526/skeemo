import { useEffect, useState } from 'react';

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
export const isImageName = (name: string): boolean => IMAGE_NAME.test(name);

/** Blob URL for an image this window attached (bytes come over IPC — the CSP
 *  blocks file://). Revoked on unmount/path change; null until/unless it loads. */
export function useAttachmentImage(path: string, name: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImageName(name)) { setUrl(null); return; }
    let alive = true;
    let created: string | null = null;
    void window.cth.attachPreview(path).then((res) => {
      if (!alive || !res.ok) return;
      created = URL.createObjectURL(new Blob([res.bytes as BlobPart], { type: res.mime }));
      setUrl(created);
    }).catch(() => undefined);
    return () => { alive = false; if (created) URL.revokeObjectURL(created); setUrl(null); };
  }, [path, name]);
  return url;
}

/** The picture itself, shown wherever a staged/sent attachment is listed.
 *  Click to open it large. Renders nothing for non-images or when unreadable. */
export function AttachmentThumb({ path, name, size = 56 }: { path: string; name: string; size?: number }) {
  const url = useAttachmentImage(path, name);
  const [big, setBig] = useState(false);
  if (!url) return null;
  return (
    <>
      <img
        src={url}
        alt={name}
        title={`${name} — click to enlarge`}
        onClick={() => setBig(true)}
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', display: 'block', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', background: 'var(--cth-cream-200)' }}
      />
      {big && (
        <div
          role="dialog"
          aria-label={name}
          onClick={() => setBig(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setBig(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}
        >
          <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: 'var(--cth-paper-100)' }} />
        </div>
      )}
    </>
  );
}
