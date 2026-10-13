/**
 * Local OCR — nothing leaves the computer. Images are read with the Windows built-in OCR engine
 * (Windows.Media.Ocr, driven through PowerShell; it reads the languages installed for the user), PDFs
 * use their text layer and fall back to OCR on the rendered pages. No electron imports.
 *
 * Calls are queued one at a time so a drop of ten files does not start ten PowerShell processes.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { renderPdfPages } from '../fileTools';

const PS_SCRIPT = String.raw`
param([string]$Path)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + String.raw`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
$dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $eng) { exit 3 }
$res = Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
$res.Text
`;

export type OcrResult = { ok: true; text: string; via: 'ocr' | 'pdf-text' } | { ok: false; reason: 'unsupported' | 'no_engine' | 'failed' };

let scriptDir: string | null = null;
let scriptPath = '';
let engineMissing = false;

function ensureScript(): string {
  if (scriptPath) return scriptPath;
  scriptDir = mkdtempSync(join(tmpdir(), 'skeemo-ocr-'));
  scriptPath = join(scriptDir, 'ocr.ps1');
  // Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI — a BOM keeps it safe.
  writeFileSync(scriptPath, '﻿' + PS_SCRIPT, 'utf8');
  return scriptPath;
}

let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
};

function runPowerShell(png: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (code: number) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, out }); } };
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ensureScript(), '-Path', png], { windowsHide: true });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } finish(-1); }, 45_000);
    child.stdout.on('data', (d: Buffer) => { out += d.toString('utf8'); if (out.length > 400_000) out = out.slice(0, 400_000); });
    child.on('error', () => finish(-2));
    child.on('close', (code) => finish(code ?? -1));
  });
}

/** Re-encode any picture as a PNG the engine accepts, sized so small print stays readable. */
async function normalise(srcBuf: Buffer, outPng: string): Promise<boolean> {
  try {
    const cv = await import('@napi-rs/canvas');
    const img = await cv.loadImage(srcBuf);
    const long = Math.max(img.width, img.height);
    const k = long > 3200 ? 3200 / long : long < 1400 ? Math.min(2.5, 1600 / long) : 1;
    const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
    const c = cv.createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    writeFileSync(outPng, c.toBuffer('image/png'));
    return true;
  } catch { return false; }
}

async function ocrBuffer(buf: Buffer): Promise<{ ok: true; text: string } | { ok: false; reason: 'no_engine' | 'failed' }> {
  if (process.platform !== 'win32' || engineMissing) return { ok: false, reason: 'no_engine' };
  const dir = mkdtempSync(join(tmpdir(), 'skeemo-page-'));
  try {
    const png = join(dir, 'page.png');
    if (!(await normalise(buf, png))) return { ok: false, reason: 'failed' };
    const r = await enqueue(() => runPowerShell(png));
    if (r.code === 3) { engineMissing = true; return { ok: false, reason: 'no_engine' }; }
    if (r.code !== 0) return { ok: false, reason: 'failed' };
    return { ok: true, text: r.out.replace(/\r/g, '').trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function pdfTextLayer(path: string): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(readFileSync(path)) });
    try { return (await parser.getText()).text.slice(0, 60_000); } finally { await parser.destroy().catch(() => undefined); }
  } catch { return ''; }
}

export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

/** Read the words off a picture or PDF. Never throws. */
export async function ocrFile(path: string, name: string = path): Promise<OcrResult> {
  const ext = extname(name).toLowerCase();
  try {
    if (IMAGE_EXT.has(ext)) {
      const r = await ocrBuffer(readFileSync(path));
      return r.ok ? { ok: true, text: r.text, via: 'ocr' } : r;
    }
    if (ext === '.pdf') {
      const layer = await pdfTextLayer(path);
      if (layer.replace(/\s/g, '').length >= 60) return { ok: true, text: layer, via: 'pdf-text' };
      const pages = await renderPdfPages(path, name, 2).catch(() => []);
      let text = '';
      for (const page of pages.slice(0, 2)) {
        const r = await ocrBuffer(page.toBuffer('image/png'));
        if (!r.ok) return layer ? { ok: true, text: layer, via: 'pdf-text' } : r;
        text += `\n${r.text}`;
      }
      return { ok: true, text: (layer + text).trim(), via: 'ocr' };
    }
    return { ok: false, reason: 'unsupported' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export const ocrSupported = (): boolean => process.platform === 'win32' && !engineMissing;
