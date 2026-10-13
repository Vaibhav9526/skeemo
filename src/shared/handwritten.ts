// @handwritten — answer a question as a hand-written style PDF with real diagrams.
// Pure parsing/prompting/sanitising, shared by the composers (to disclose + validate)
// and the main process (which runs the model and renders the PDF locally).

export interface HandwrittenAttachment {
  path: string;
  name: string;
}
export interface HandwrittenRequest {
  question: string;
  files: HandwrittenAttachment[];
}

export const MAX_HANDWRITTEN_FILES = 5;
export const MAX_QUESTION_CHARS = 4000;
/** Images/PDFs the model can open with its Read tool. */
const READABLE = /\.(png|jpe?g|gif|webp|pdf)$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const ALIAS = /(^|[\s([{"'“‘«])@handwritten(?=$|[\s)\]}"'”’»]|[.,:!?]+(?=$|[\s)\]}"'”’»]))/gi;

export function hasHandwrittenAlias(text: string): boolean {
  if (typeof text !== 'string') return false;
  ALIAS.lastIndex = 0;
  return ALIAS.test(text);
}

/** Null when the draft is not an @handwritten request; throws a readable error when it is but is unusable. */
export function parseHandwrittenRequest(
  text: string,
  attachments: readonly HandwrittenAttachment[]
): HandwrittenRequest | null {
  if (!hasHandwrittenAlias(text)) return null;
  const question = text.replace(ALIAS, (_a, prefix: string) => prefix).replace(/\s+/g, ' ').trim();
  const files: HandwrittenAttachment[] = [];
  for (const a of attachments ?? []) {
    if (!a || typeof a.path !== 'string' || typeof a.name !== 'string' || !a.path.trim() || !a.name.trim()
      || CONTROL.test(a.path) || CONTROL.test(a.name) || /[\\/]/.test(a.name)) {
      throw new TypeError('Each file needs a valid path and name.');
    }
    if (!READABLE.test(a.name)) throw new Error(`@handwritten can read images and PDFs — "${a.name}" is not one.`);
    files.push({ path: a.path, name: a.name });
  }
  if (files.length > MAX_HANDWRITTEN_FILES) throw new RangeError(`Up to ${MAX_HANDWRITTEN_FILES} files at a time.`);
  if (!question && files.length === 0) {
    throw new Error('Ask something after @handwritten, or attach the question as an image, e.g. "@handwritten explain how a transistor works".');
  }
  return { question: question.slice(0, MAX_QUESTION_CHARS), files };
}

export function buildHandwrittenPrompt(question: string, hasFiles: boolean): string {
  return [
    'You are a patient teacher writing out a model answer BY HAND in a student\'s notebook.',
    hasFiles ? 'Open every attached file first; the question or problem is in it.' : '',
    `Question: ${question || '(read it from the attached file)'}`,
    'Reply with ONLY one complete, self-contained HTML document (<!doctype html> … </html>). No markdown fences, no commentary before or after.',
    'Rules for the page:',
    '- Looks hand-written on ruled paper: body font-family "Segoe Print","Bradley Hand","Comic Sans MS","Chalkboard SE",cursive; blue-black ink (#1d2a5b); cream paper (#fffdf5) with faint blue horizontal rules via repeating-linear-gradient; a red margin line at the left; headings underlined in a wavy red pen.',
    '- Size for A4 portrait with 18mm margins. Use short numbered steps, boxed final answers, and highlighter-style marks for key terms. Keep each step brief.',
    '- EVERY concept that benefits from a picture MUST have a proper diagram drawn as inline <svg> (viewBox set, width 100%, labelled parts, arrows, units, hand-drawn feel via slightly irregular stroke-linecap="round" lines and stroke-width 2). Think: free-body diagrams, circuits, graphs with axes and scales, flowcharts, geometry figures, cell/biology parts, number lines, tables. Make each diagram accurate and every label readable (font-size >= 12).',
    '- Avoid breaking a diagram or step across pages: add break-inside: avoid to figures and step blocks.',
    '- No JavaScript, no external fonts, images, stylesheets or links — everything inline.',
    '- Finish with a one-line "Answer:" in a box.'
  ].filter(Boolean).join('\n');
}

/** Pull the HTML document out of a model reply (it may be wrapped in a fence or chatter). */
export function extractHtml(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/```(?:html)?/gi, '');
  const start = text.search(/<!doctype html|<html[\s>]/i);
  if (start < 0) return null;
  const endMatch = /<\/html\s*>/i.exec(text.slice(start));
  const body = endMatch ? text.slice(start, start + endMatch.index + endMatch[0].length) : text.slice(start);
  return body.trim() || null;
}

/** The page is rendered by Chromium with JS off, but strip anything active or remote anyway. */
export function sanitizeHandwrittenHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(iframe|object|embed|link|meta\s+http-equiv|base|form)\b[^>]*>(?:[\s\S]*?<\/\1\s*>)?/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)\s*(?:https?:|\/\/|file:)[^)]*\)/gi, 'none')
    .replace(/(\s(?:src|href|xlink:href)\s*=\s*)(["'])\s*(?:https?:|\/\/|file:|javascript:)[^"']*\2/gi, '$1$2$2');
}
