/**
 * @cheat-sheet — ask the model for one JEE chapter's formulas/notes as JSON, then lay it out
 * locally as a single A4 page. No electron import: the model call and the HTML→PDF renderer
 * are injected. If the first layout spills onto a second page the type is shrunk and re-rendered.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCheatSheetPrompt, parseCheatSheetJson, renderCheatSheetHtml, type CheatSheetRequest } from '../shared/cheatsheet';
import type { FileToolResult } from '../shared/fileTools';

export interface CheatSheetDeps {
  llm(prompt: string, timeoutMs: number): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  renderPdf(html: string): Promise<Buffer>;
  now?: () => number;
}

const SCALES = [1, 0.9, 0.8, 0.71, 0.63, 0.55, 0.48];
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'chapter';

export async function runCheatSheet(req: CheatSheetRequest, outDir: string, deps: CheatSheetDeps): Promise<FileToolResult> {
  const fail = (error: string): FileToolResult => ({ ok: false, error, outputs: [] });
  const res = await deps.llm(buildCheatSheetPrompt(req.chapter), 180_000);
  if (!res.ok) return fail(res.error);
  const data = parseCheatSheetJson(res.text);
  if (!data) return fail('The cheat sheet did not come back in a usable shape — try again.');

  let pdf: Buffer | null = null;
  try {
    for (const scale of SCALES) {
      const out = await deps.renderPdf(renderCheatSheetHtml(req.chapter, data, scale));
      pdf = out;
      if (pageCount(out) <= 1) break;
    }
  } catch (e) {
    return fail(`Could not make the PDF: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!pdf || !pdf.length) return fail('The PDF came out empty — try again.');
  if (pageCount(pdf) > 1) return fail('Could not fit that chapter on one page — try a narrower chapter.');
  mkdirSync(outDir, { recursive: true });
  const output = join(outDir, `cheatsheet-${slug(req.chapter.name)}-${(deps.now ?? Date.now)().toString(36)}.pdf`);
  writeFileSync(output, pdf);
  return {
    ok: true,
    folder: outDir,
    outputs: [{ source: `${req.chapter.subject}: ${req.chapter.name}`, output, bytesIn: 0, bytesOut: pdf.length, pages: 1, note: `One-page JEE ${req.chapter.subject} cheat sheet — formulas and notes.` }],
  };
}
