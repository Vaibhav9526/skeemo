/**
 * Fits a file to a portal's upload rules: right format, and a size between a minimum and a
 * maximum. Too big → compressed (and, if need be, scaled down) until it fits while staying
 * readable; too small for a portal that demands a minimum → enlarged. Everything is local.
 *
 * No electron imports. PDFs are re-rendered with pdf.js and rebuilt as a picture-PDF (the text
 * layer is lost — the report says so); images are re-encoded as JPEG.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, parse as parsePath } from 'node:path';
import type { DocFormat } from '../../shared/govt/documents';
import { buildImagePdf, renderPdfPages } from '../fileTools';

type Canvas = import('@napi-rs/canvas').Canvas;
const loadCanvas = async () => await import('@napi-rs/canvas');

export type FitAction = 'kept' | 'compressed' | 'converted' | 'enlarged' | 'failed';

export interface FitResult {
  action: FitAction;
  outPath: string;
  outName: string;
  bytesBefore: number;
  bytesAfter: number;
  /** The file is now a picture-PDF (any text layer was dropped to make it small enough). */
  rasterised?: boolean;
  /** Final pixel size, for images. */
  width?: number;
  height?: number;
  /** Why it could not be fitted. */
  reason?: 'too_big' | 'bad_input' | 'bad_format';
}

export const KB = 1024;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);
export const isImageExt = (ext: string) => IMAGE_EXT.has(ext.toLowerCase());
const formatOf = (ext: string): DocFormat | null => {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.jpg' || e === '.jpeg') return 'jpg';
  if (e === '.png') return 'png';
  return null;
};

function uniquePath(dir: string, base: string, ext: string): string {
  let p = join(dir, `${base}${ext}`);
  for (let i = 2; existsSync(p); i++) p = join(dir, `${base} (${i})${ext}`);
  return p;
}
const safeStem = (name: string) => parsePath(name).name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80) || 'file';

/** Largest JPEG quality (0.3–0.95) whose output still fits `maxBytes`; null if even 0.3 is too big. */
function bestJpeg(canvas: Canvas, maxBytes: number): { buf: Buffer; q: number } | null {
  let lo = 0.3, hi = 0.95;
  let best: { buf: Buffer; q: number } | null = null;
  const top = canvas.toBuffer('image/jpeg', Math.round(hi * 100));
  if (top.length <= maxBytes) return { buf: top, q: hi };
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    const buf = canvas.toBuffer('image/jpeg', Math.round(mid * 100));
    if (buf.length <= maxBytes) { best = { buf, q: mid }; lo = mid; } else hi = mid;
  }
  return best;
}

function drawScaled(cv: typeof import('@napi-rs/canvas'), img: { width: number; height: number }, source: unknown, scale: number): Canvas {
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = cv.createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; // JPEG has no alpha — flatten transparency onto white
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as never, 0, 0, w, h);
  return c;
}

async function fitImage(path: string, name: string, formats: readonly DocFormat[], maxBytes: number, minBytes: number, outDir: string, bytesBefore: number): Promise<FitResult> {
  const cv = await loadCanvas();
  let img;
  try { img = await cv.loadImage(readFileSync(path)); } catch { return fail('bad_input', name, bytesBefore); }
  const wantsPdf = !formats.includes('jpg') && formats.includes('pdf');
  const stem = safeStem(name);
  // Never shrink a document below ~900 px on its long side (unreadable), a photo below 240 px.
  const floor = formats.includes('pdf') ? 900 : 240;
  const longSide = Math.max(img.width, img.height);
  const scales = [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.35, 0.28, 0.22, 0.17, 0.13, 0.1, 0.08].filter((s) => s === 1 || longSide * s >= floor);

  let found: { buf: Buffer; canvas: Canvas } | null = null;
  for (const s of scales) {
    const canvas = drawScaled(cv, img, img, s);
    // For PDF output the JPEG is wrapped (~1 KB), so leave a little room.
    const best = bestJpeg(canvas, wantsPdf ? maxBytes - 1500 : maxBytes);
    if (best) { found = { buf: best.buf, canvas }; break; }
  }
  if (!found) return fail('too_big', name, bytesBefore);

  let { buf, canvas } = found;
  let action: FitAction = formatOf(extname(name)) === 'jpg' || wantsPdf ? 'compressed' : 'converted';
  // A portal minimum (photos): re-encode at high quality and enlarge until the file is big enough.
  if (minBytes > 0 && buf.length < minBytes) {
    for (const s of [1, 1.25, 1.5, 1.8, 2.2, 2.7, 3.3]) {
      const c = drawScaled(cv, img, img, s);
      const out = c.toBuffer('image/jpeg', 97);
      if (out.length > maxBytes) break;
      buf = out; canvas = c; action = 'enlarged';
      if (out.length >= minBytes) break;
    }
  }

  if (wantsPdf) {
    const pdf = buildImagePdf([{ jpeg: buf, width: canvas.width, height: canvas.height }]);
    const outPath = uniquePath(outDir, stem, '.pdf');
    writeFileSync(outPath, pdf);
    return { action: 'converted', outPath, outName: parsePath(outPath).base, bytesBefore, bytesAfter: pdf.length, width: canvas.width, height: canvas.height };
  }
  const outPath = uniquePath(outDir, stem, '.jpg');
  writeFileSync(outPath, buf);
  return { action, outPath, outName: parsePath(outPath).base, bytesBefore, bytesAfter: buf.length, width: canvas.width, height: canvas.height };
}

function fail(reason: NonNullable<FitResult['reason']>, name: string, bytesBefore: number): FitResult {
  return { action: 'failed', outPath: '', outName: name, bytesBefore, bytesAfter: bytesBefore, reason };
}

async function fitPdf(path: string, name: string, formats: readonly DocFormat[], maxBytes: number, outDir: string, bytesBefore: number): Promise<FitResult> {
  const stem = safeStem(name);
  if (!formats.includes('pdf')) {
    // The portal wants a picture: render page 1 as JPEG.
    if (!formats.includes('jpg')) return fail('bad_format', name, bytesBefore);
    const pages = await renderPdfPages(path, name, 2);
    const first = pages[0];
    const best = first && bestJpeg(first, maxBytes);
    if (!first || !best) return fail('too_big', name, bytesBefore);
    const outPath = uniquePath(outDir, stem, '.jpg');
    writeFileSync(outPath, best.buf);
    return { action: 'converted', outPath, outName: parsePath(outPath).base, bytesBefore, bytesAfter: best.buf.length, width: first.width, height: first.height };
  }
  for (const scale of [1.7, 1.4, 1.15, 0.95, 0.8, 0.65]) {
    const pages = await renderPdfPages(path, name, scale);
    // split the budget across pages, then fit each page's JPEG into its share
    const share = Math.max(2000, Math.floor((maxBytes - 2500) / pages.length));
    const jpegs: Array<{ jpeg: Uint8Array; width: number; height: number }> = [];
    let ok = true;
    for (const p of pages) {
      const best = bestJpeg(p, share);
      if (!best) { ok = false; break; }
      jpegs.push({ jpeg: best.buf, width: p.width, height: p.height });
    }
    if (!ok) continue;
    const pdf = buildImagePdf(jpegs);
    if (pdf.length > maxBytes) continue;
    const outPath = uniquePath(outDir, stem, '.pdf');
    writeFileSync(outPath, pdf);
    return { action: 'compressed', outPath, outName: parsePath(outPath).base, bytesBefore, bytesAfter: pdf.length, rasterised: true };
  }
  return fail('too_big', name, bytesBefore);
}

/** Cheap integrity check on the first bytes, so a renamed or truncated file is not waved through. */
function looksLike(fmt: DocFormat, path: string): boolean {
  try {
    const head = readFileSync(path).subarray(0, 8);
    if (fmt === 'pdf') return head.subarray(0, 5).toString('latin1') === '%PDF-';
    if (fmt === 'jpg') return head[0] === 0xff && head[1] === 0xd8;
    return head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG';
  } catch { return false; }
}

/** Make `path` upload-ready. Returns a report whatever happens; never throws for a bad file. */
export async function fitFile(opts: {
  path: string; name: string; formats: readonly DocFormat[]; maxKB: number; minKB?: number; outDir: string;
}): Promise<FitResult> {
  const { path, name, formats, outDir } = opts;
  let size: number;
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size === 0) return fail('bad_input', name, 0);
    size = st.size;
  } catch { return fail('bad_input', name, 0); }
  mkdirSync(outDir, { recursive: true });
  const maxBytes = Math.max(5, Math.round(opts.maxKB)) * KB;
  const minBytes = Math.max(0, Math.round(opts.minKB ?? 0)) * KB;
  const ext = extname(name || path).toLowerCase();
  const fmt = formatOf(ext);

  // already right: an allowed format inside the size window → just copy it across untouched
  if (fmt && formats.includes(fmt) && size <= maxBytes && size >= minBytes) {
    if (!looksLike(fmt, path)) return fail('bad_input', name, size);
    const outPath = uniquePath(outDir, safeStem(name), ext === '.jpeg' ? '.jpg' : ext);
    copyFileSync(path, outPath);
    return { action: 'kept', outPath, outName: parsePath(outPath).base, bytesBefore: size, bytesAfter: size };
  }
  try {
    if (isImageExt(ext)) return await fitImage(path, name, formats, maxBytes, minBytes, outDir, size);
    if (ext === '.pdf') return await fitPdf(path, name, formats, maxBytes, outDir, size);
  } catch {
    return fail('bad_input', name, size);
  }
  return fail('bad_format', name, size);
}
