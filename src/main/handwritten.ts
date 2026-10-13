/**
 * @handwritten — ask the model for a hand-written-style answer page (inline SVG
 * diagrams), then render it to a PDF on this computer. No electron import: the
 * model call and the HTML→PDF renderer are injected so this runs under plain node.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildHandwrittenPrompt, extractHtml, sanitizeHandwrittenHtml, type HandwrittenRequest
} from '../shared/handwritten';
import type { FileToolResult } from '../shared/fileTools';

export interface HandwrittenDeps {
  llm(prompt: string, timeoutMs: number, files: readonly string[]): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  renderPdf(html: string): Promise<Buffer>;
  now?: () => number;
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'answer';

export async function runHandwritten(req: HandwrittenRequest, outDir: string, deps: HandwrittenDeps): Promise<FileToolResult> {
  const fail = (error: string): FileToolResult => ({ ok: false, error, outputs: [] });
  const prompt = buildHandwrittenPrompt(req.question, req.files.length > 0);
  // Diagrams make long replies; give the model room.
  const res = await deps.llm(prompt, 240_000, req.files.map((f) => f.path));
  if (!res.ok) return fail(res.error);
  const html = extractHtml(res.text);
  if (!html) return fail('The answer did not come back as a page — try again.');
  let pdf: Buffer;
  try {
    pdf = await deps.renderPdf(sanitizeHandwrittenHtml(html));
  } catch (e) {
    return fail(`Could not make the PDF: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!pdf.length) return fail('The PDF came out empty — try again.');
  mkdirSync(outDir, { recursive: true });
  const stamp = (deps.now ?? Date.now)();
  const output = join(outDir, `handwritten-${slug(req.question || req.files[0]?.name || '')}-${stamp.toString(36)}.pdf`);
  writeFileSync(output, pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length || undefined;
  return {
    ok: true,
    folder: outDir,
    outputs: [{ source: req.question || req.files[0]?.name || 'question', output, bytesIn: 0, bytesOut: pdf.length, pages, note: 'Hand-written style answer with diagrams.' }]
  };
}
