/**
 * One-shot, tool-less AI call through the user's own Claude Code login.
 * Shared by Jargon Mail (summarize/extract/rewrite) and the classroom chat.
 * Tools are denied and the process runs in the temp dir, so untrusted text in the
 * prompt (an email body, a pasted note) can never drive file or shell access.
 * No electron imports — usable from plain-node tests.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

/** Files Claude can look at through its Read tool (images + PDFs). */
export const READABLE_ATTACHMENT = /\.(png|jpe?g|gif|webp|pdf)$/i;

/** One-shot, tool-less Claude Code call (uses the user's existing Claude login).
 *  Tools are denied and the process runs in the temp dir, so mail text can never
 *  drive file or shell access. */
export function runClaudeOnce(prompt: string, timeoutMs = 120_000, files: readonly string[] = []): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  // Attachments are copied into a private temp dir that becomes the CLI's cwd, so
  // Read can see exactly those files and nothing else on disk.
  let dir = tmpdir();
  let scratch: string | null = null;
  if (files.length) {
    try {
      scratch = mkdtempSync(join(tmpdir(), 'cth-ask-'));
      const names = files.map((f, i) => {
        const name = `${i + 1}-${basename(f).replace(/[^\w.-]/g, '_')}`;
        copyFileSync(f, join(scratch!, name));
        return name;
      });
      dir = scratch;
      prompt += `\n\nThe student attached these files in the current directory — open each with the Read tool before answering: ${names.join(', ')}\n`;
    } catch (e) {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
      return Promise.resolve({ ok: false, error: `Could not read the attachment: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (r: { ok: true; text: string } | { ok: false; error: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (scratch) rmSync(scratch, { recursive: true, force: true });
      resolve(r);
    };
    const child = spawn(
      'claude',
      ['-p', '--output-format', 'text', '--no-session-persistence',
        '--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task'],
      { cwd: dir, shell: process.platform === 'win32', windowsHide: true },
    );
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* gone */ }
      finish({ ok: false, error: 'The AI took too long — try again.' });
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; if (out.length > 200_000) out = out.slice(0, 200_000); });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', () => finish({ ok: false, error: 'Claude Code CLI was not found. Install it and sign in, then try again.' }));
    child.on('close', (code) => {
      const text = out.trim();
      if (code === 0 && text) finish({ ok: true, text });
      else finish({ ok: false, error: (err.trim() || 'The AI returned no result.').slice(0, 300) });
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(prompt);
  });
}
