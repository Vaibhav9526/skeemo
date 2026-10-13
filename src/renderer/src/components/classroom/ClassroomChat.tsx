import { useCallback, type ClipboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore, type Agent } from '@/store/store';
import { inferAgentProvider, isClaudeProvider } from '@/store/config';
import { findTeacherAgent, parseTeachingRequest, type TeachingAttachment, type TeachingRequest } from '@shared/teaching';
import { Face, IdCard } from './IdCard';
import { IconQuiz } from './icons';
import { FileToolResultCard } from './FileToolResult';
import { fileToolAlias, type FileToolResult } from '@shared/fileTools';
import { sendFileToolDraft } from '../MessageQueueComposer';
import { TeachingPanelHost } from './TeachingPanelHost';
import { endLesson, markLessonOpened, releaseLesson, showLessonIn, startLesson, useLesson } from './lessonSession';
import { isSchoolCast } from './art';
import { LibraryStrip } from './LibraryStrip';
import { QuizCard } from './QuizCard';
import { useChatField, getChatSession, patchChatSession, beginWork, endWork, enqueueChat, introduced } from './chatSessions';
import { AttachmentThumb, isImageName } from '../AttachmentThumb';
import { speak, stopSpeaking, useVoice, refreshVoice } from './voice';
import { orchestrate } from './orchestrator';
import { hasCheatSheetAlias, parseCheatSheetRequest } from '@shared/cheatsheet';
import { hasHandwrittenAlias, parseHandwrittenRequest } from '@shared/handwritten';

export interface ChatMsg {
  id: string;
  role: 'user' | 'agent' | 'note';
  text: string;
  mood?: string;
  sources?: string[];
  ts: number;
  /** Files sent with this message — session-only, so the picture stays visible in the bubble. */
  attachments?: TeachingAttachment[];
  /** Typed into the terminal's queue but not yet seen in its transcript. */
  pending?: boolean;
  /** First words of what was actually typed into the terminal — matches the pending bubble to its transcript line. */
  key?: string;
}

const MOOD_TAG = /^\s*\[mood:([a-z-]+)\]\s*/i;
/** What a transcript line shows: the mood tag and the library-notes block are plumbing, not speech. */
function cleanLine(role: 'user' | 'agent', raw: string): { text: string; mood?: string } {
  let text = raw;
  let mood: string | undefined;
  if (role === 'agent') {
    const m = MOOD_TAG.exec(text);
    if (m) { mood = m[1].toLowerCase(); text = text.slice(m[0].length); }
  } else {
    text = text.replace(/^You are [^\n]*\n[^\n]*\n\n/, '');   // first-message persona intro
    if (text.startsWith('Your staff have finished')) return { text: 'Team results handed to the Principal.' };
    text = text.replace(/^\[Task from the Principal\]\s*/, 'From the Principal: ').replace(/\n\nThis is a sub-task given by the Principal[\s\S]*$/, '');
    text = text.replace(/^Student:\s*/, '');
    text = text.replace(/\n\nAttached files \(open them first\):[\s\S]*?(?=\n\n<notes>|\n\n\(Begin|$)/, '');
    text = text.replace(/\n\n<notes>[\s\S]*$/, '').replace(/\n\n\(The student asked you[\s\S]*$/, '').replace(/\n\n\(Begin your reply[\s\S]*$/, '');
  }
  return { text: text.trim(), mood };
}

const clearedKey = (id: string) => `iscool:classroomCleared:${id}`;
export function readClearedAt(id: string): number {
  try { return Number(localStorage.getItem(clearedKey(id))) || 0; } catch { return 0; }
}
export function markCleared(id: string): void {
  try { localStorage.setItem(clearedKey(id), String(Date.now())); } catch { /* private mode */ }
}


interface Suggestion { alias: string; hint: string; teacherOnly?: boolean; onlyCast?: string; /** A library book picked after @memory-notes (scopes the search to it). */ book?: string }
const SUGGESTIONS: Suggestion[] = [
  { alias: '@teach-me', hint: 'Open the interactive classroom for a topic (attach PDFs/images)', teacherOnly: true },
  { alias: '@quiz', hint: 'Quiz me on my doubt: MCQs, analysis, weak points and what to study', onlyCast: 'teacher' },
  { alias: '@memory-notes', hint: 'Answer from the notes the Librarian keeps' },
  { alias: '@cheat-sheet', hint: 'JEE only: a one-page PDF of formulas + notes for a chapter — e.g. @cheat-sheet rotational motion', onlyCast: 'smartguy' },
  { alias: '@handwritten', hint: 'Answer as a hand-written PDF with proper diagrams (attach the question image if you like)' },
  { alias: '@convert', hint: 'PDF ↔ PPT, image → PDF, PDF → image — attach a file first', onlyCast: 'librarian' },
  { alias: '@compress', hint: 'Shrink an image by a percentage — e.g. @compress 50%', onlyCast: 'librarian' },
];

const STARTERS: Record<string, string[]> = {
  teacher: ['Explain photosynthesis simply', '@teach-me ', '@quiz adding fractions'],
  topper: ['Check my answer: 12 × 12 = 124', 'Why is the sky blue?', 'Give me a tough question'],
  smartguy: ['@cheat-sheet rotational motion', 'Quick trick to square 85?', 'Shortcut for percentages?', 'How do I remember the quadratic formula?'],
  librarian: ['@memory-notes what do my notes say about ', '@convert to pdf', '@compress 50%'],
  principal: ['Help me plan my study week', 'What should I prioritise today?'],
};

function Bubble({ msg, agent }: { msg: ChatMsg; agent: Agent }) {
  const [saved, setSaved] = useState<'idle' | 'saved' | 'failed'>('idle');
  const voice = useVoice();
  if (msg.role === 'note') {
    return <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--cth-ink-500)', padding: '2px 8px' }}>{msg.text}</div>;
  }
  const mine = msg.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: mine ? 'row-reverse' : 'row', opacity: msg.pending ? 0.6 : 1 }}>
      {!mine && <Face agent={agent} mood={msg.mood} size={36} />}
      <div style={{
        maxWidth: '78%', padding: '8px 12px', borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: mine ? 'var(--cth-lemon-light)' : 'var(--cth-paper-100)',
        boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', color: 'var(--cth-ink-900)',
        fontSize: 14, lineHeight: '21px', overflowWrap: 'anywhere',
      }}>
        {mine && msg.attachments && msg.attachments.some((a) => isImageName(a.name)) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {msg.attachments.map((a) => <AttachmentThumb key={a.path} path={a.path} name={a.name} size={120} />)}
          </div>
        )}
        {mine
          ? <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
          : <div className="cth-chat-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown></div>}
        {msg.sources && msg.sources.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--cth-ink-500)' }}>From notes: {msg.sources.join(', ')}</div>
        )}
        {!mine && voice.status?.hasKey && (
          <button type="button" onClick={() => { if (voice.speakingId === msg.id || voice.loadingId === msg.id) stopSpeaking(); else void speak(msg.id, msg.text, agent.character); }}
            title={`Hear ${agent.name} say this`} aria-label="Read aloud"
            style={{ marginTop: 6, marginRight: 12, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 11, color: voice.speakingId === msg.id ? 'var(--cth-coral)' : 'var(--cth-ink-500)', textDecoration: 'underline' }}>
            {voice.loadingId === msg.id ? 'Loading voice…' : voice.speakingId === msg.id ? '■ Stop' : '🔊 Speak'}
          </button>
        )}
        {!mine && (
          <button type="button" disabled={saved === 'saved'} title="File this reply in the Librarian's desk (this session)"
            onClick={() => {
              const first = msg.text.replace(/[#*`>_-]/g, '').trim().split('\n')[0].slice(0, 50) || 'note';
              const research = (msg.sources?.length ?? 0) > 0 || msg.text.length > 700;
              void window.cth.deskSaveText({ name: `${agent.name} - ${first}`, text: `${agent.name}\n${new Date(msg.ts).toLocaleString()}\n\n${msg.text}`, kind: research ? 'research' : 'text', agent: agent.name })
                .then((r) => setSaved(r.ok ? 'saved' : 'failed')).catch(() => setSaved('failed'));
            }}
            style={{ marginTop: 6, display: voice.status?.hasKey ? 'inline' : 'block', border: 'none', background: 'transparent', cursor: saved === 'saved' ? 'default' : 'pointer', padding: 0, fontSize: 11, color: saved === 'failed' ? 'var(--cth-coral)' : 'var(--cth-ink-500)', textDecoration: saved === 'saved' ? 'none' : 'underline' }}>
            {saved === 'saved' ? 'Saved to the desk ✓' : saved === 'failed' ? 'Could not save — retry' : 'Save to desk'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Chat with one staff-room character. `variant` only changes layout density. */
export function ClassroomChat({ agent, variant, onActivity, onMood }: { agent: Agent; variant: 'side' | 'focus'; onActivity?: () => void; onMood?: (mood: string) => void }) {
  const agents = useStore((s) => s.agents);
  // Chat state lives in chatSessions (keyed by agent), not here, so a reply that is
  // still being written survives switching to another character and back.
  const [msgs, setMsgs] = useChatField(agent.id, 'msgs');
  const [text, setText] = useChatField(agent.id, 'text');
  const [busy] = useChatField(agent.id, 'busy');
  const [error, setError] = useChatField(agent.id, 'error');
  const [files, setFiles] = useChatField(agent.id, 'files');
  const [toolResult, setToolResult] = useChatField(agent.id, 'toolResult');
  const lesson = useLesson();
  // Unique per mounted chat view: only the owner may show the (native) lesson page.
  const viewId = useRef(`chat-${Math.random().toString(36).slice(2)}`).current;
  const showingLesson = !!lesson && lesson.owner === viewId;
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const cast = agent.character;
  const school = isSchoolCast(cast);

  // Leaving this chat only HIDES the lesson; it stays reachable from the dropdown.
  useEffect(() => () => releaseLesson(viewId), [viewId]);

  // Load history once per character; later visits reuse the live session.
  useEffect(() => {
    const id = agent.id;
    if (getChatSession(id).loaded) return;
    patchChatSession(id, { loaded: true });
    void window.cth.classroomHistory(id).then((h) => {
      // Never clobber messages added while the history was loading.
      if (getChatSession(id).msgs.length === 0) patchChatSession(id, { msgs: h as ChatMsg[] });
    }).catch(() => patchChatSession(id, { loaded: false }));
  }, [agent.id]);

  // TERMINAL IS THE BRAIN. A Claude agent keeps a transcript, so chat and terminal are ONE conversation:
  // what you send here is typed into the agent's real terminal, and what is said in either place
  // comes back as bubbles. Agents on a CLI without a transcript fall back to the quick persona chat.
  const provider = agent.provider ?? inferAgentProvider(agent.command ?? '');
  const terminalBrain = isClaudeProvider(provider);
  const [lines] = useChatField(agent.id, 'lines');
  const queued = useStore((s) => s.messageQueues[agent.id]?.length ?? 0);
  const working = terminalBrain && (agent.status === 'working' || agent.status === 'thinking' || queued > 0);
  const spoken = useRef<string | null>(null); // id of the last reply already read aloud; null until the first poll lands
  const voice = useVoice();

  useEffect(() => { void refreshVoice(); }, []);
  useEffect(() => {
    if (!terminalBrain) return;
    let live = true;
    const id = agent.id;
    let first = true;
    spoken.current = null;
    const load = () => {
      void window.cth.officeChatMessages(id, 300).then((r) => {
        if (!live) return;
        const next: ChatMsg[] = [];
        for (const l of r.lines) {
          const c = cleanLine(l.role, l.text);
          if (c.text) next.push({ id: `t-${l.id}`, role: l.role, text: c.text, mood: c.mood, ts: l.ts });
        }
        if (first) { first = false; spoken.current = [...next].reverse().find((m) => m.role === 'agent')?.id ?? ''; }
        const cur = getChatSession(id).lines;
        const a = cur[cur.length - 1];
        const b = next[next.length - 1];
        if (cur.length === next.length && a?.id === b?.id && a?.text === b?.text) return;
        patchChatSession(id, { lines: next });
      }).catch(() => undefined);
    };
    load();
    const t = setInterval(load, 1500);
    return () => { live = false; clearInterval(t); };
  }, [agent.id, terminalBrain]);

  // Auto-speak: once the agent has finished a turn, read the whole reply (not each streamed line).
  useEffect(() => {
    if (!terminalBrain || working || spoken.current === null || !voice.status?.auto || !voice.status.hasKey) return;
    const tail: ChatMsg[] = [];
    for (let i = lines.length - 1; i >= 0 && lines[i].role === 'agent'; i--) tail.unshift(lines[i]);
    const last = tail[tail.length - 1];
    if (!last || last.id === spoken.current) return;
    spoken.current = last.id;
    void speak(last.id, tail.map((m) => m.text).join('\n\n'), cast);
  }, [lines, working, terminalBrain, voice.status?.auto, voice.status?.hasKey, cast]);

  // What is on screen: the terminal's transcript plus the chat's own items (notes, tool commands,
  // messages still waiting in the queue). A queued message disappears once the transcript has it.
  const cleared = readClearedAt(agent.id);
  const visible = useMemo(() => {
    const tr = lines.filter((l) => l.ts > cleared);
    const local = msgs.filter((m) => m.ts > cleared && !(m.pending && tr.some((t) => t.role === 'user' && t.ts >= m.ts - 10_000 && t.text.includes(m.key ?? m.text.slice(0, 30)))));
    return [...local, ...tr].sort((x, y) => x.ts - y.ts);
  }, [msgs, lines, cleared]);

  // Grow the input with its text (one line up to ~6), shrink back when cleared.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(160, Math.max(34, el.scrollHeight))}px`;
  }, [text, showingLesson]);

  const lastMood = useMemo(() => [...visible].reverse().find((m) => m.role === 'agent')?.mood, [visible]);
  // The face you see right now: thinking while a reply is being written, then the
  // mood of the last reply.
  const liveMood = busy || working ? 'thinking' : (lastMood ?? 'neutral');
  useEffect(() => { onMood?.(liveMood); }, [liveMood, onMood]);

  // "@" suggestions.
  const m = /(^|\s)@([\w-]*)$/.exec(text.slice(0, caret));
  const query = m ? m[2].toLowerCase() : null;
  const start = m ? caret - m[2].length - 1 : -1;
  const aliasOptions = query === null || dismissed === start ? [] : SUGGESTIONS.filter((s) =>
    (!s.teacherOnly || cast === 'teacher' || !!findTeacherAgent(agents)) && (!s.onlyCast || s.onlyCast === cast) &&
    s.alias.slice(1).startsWith(query) && s.alias.slice(1) !== query);

  // After "@memory-notes " offer the books on the shelf, so a question can be scoped to one book:
  // picking one writes [[Title]] and only that book is searched.
  const bm = /(^|\s)@memory-notes\s+(\[\[([^\]\n]*))?$/.exec(text.slice(0, caret));
  const bookStart = bm ? caret - (bm[2]?.length ?? 0) : -1;
  const bookQuery = (bm?.[3] ?? '').toLowerCase();
  const bookMode = !!bm && dismissed !== -2 - bookStart;
  const [shelf, setShelf] = useState<Array<{ id: string; name: string; chars: number }>>([]);
  useEffect(() => {
    if (!bm) return;
    let live = true;
    void window.cth.libraryList().then((l) => { if (live) setShelf(l); }).catch(() => undefined);
    return () => { live = false; };
  }, [!!bm]); // eslint-disable-line react-hooks/exhaustive-deps
  const bookOptions: Suggestion[] = !bookMode ? [] : shelf
    .filter((d) => d.name.toLowerCase().includes(bookQuery) && !text.includes(`[[${d.name.replace(/\.[a-z0-9]+$/i, '')}]]`))
    .slice(0, 8)
    .map((d) => ({ alias: `[[${d.name.replace(/\.[a-z0-9]+$/i, '')}]]`, hint: `only search this book · ${Math.max(1, Math.round(d.chars / 1000))}k chars`, book: d.name }));
  const options = bookOptions.length ? bookOptions : aliasOptions;
  const open = options.length > 0;

  const accept = (s: Suggestion) => {
    if (s.book) {
      const next = `${text.slice(0, bookStart)}${s.alias} ${text.slice(caret).replace(/^\s/, '')}`;
      const pos = bookStart + s.alias.length + 1;
      setText(next); setCaret(pos); setPick(0);
      requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(pos, pos); });
      return;
    }
    const next = `${text.slice(0, start)}${s.alias} ${text.slice(caret).replace(/^\s/, '')}`;
    const pos = start + s.alias.length + 1;
    setText(next); setCaret(pos); setPick(0);
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(pos, pos); });
  };

  const pickFiles = async () => {
    const res = await window.cth.attachFiles();
    if (res.ok) setFiles((prev) => [...prev, ...res.files.filter((f) => !prev.some((p) => p.path === f.path))]);
  };

  const addFiles = (incoming: TeachingAttachment[]) =>
    setFiles((prev) => [...prev, ...incoming.filter((f) => f.path && !prev.some((p) => p.path === f.path))]);

  // Paste a screenshot (saved to a temp PNG) or files copied from the file manager (images, PDFs, PPT).
  const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const pasted = Array.from(e.clipboardData?.files ?? []);
    const withPath = pasted.map((f) => ({ path: window.cth.pathForFile(f), name: f.name })).filter((a) => a.path);
    if (withPath.length) { e.preventDefault(); addFiles(withPath); return; }
    if (items.some((it) => it.kind === 'file' && it.type.startsWith('image/'))) {
      e.preventDefault();
      const res = await window.cth.saveClipboardImage();
      if (res.ok) addFiles([res.file]);
    }
  };

  // ── Quiz (Teacher): MCQs from the student's doubt → exact score → weak points + resources ──
  const [quizPhase, setQuizPhase] = useChatField(agent.id, 'quizPhase');
  const [quiz, setQuiz] = useChatField(agent.id, 'quiz');
  const [picks, setPicks] = useChatField(agent.id, 'picks');
  const [quizResult, setQuizResult] = useChatField(agent.id, 'quizResult');
  const [quizError, setQuizError] = useChatField(agent.id, 'quizError');

  // Keep the newest thing (message, quiz, report) in view.
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [visible, busy, working, quizPhase === 'loading', quizPhase === 'report']);

  const closeQuiz = () => { setQuizPhase(null); setQuiz(null); setPicks([]); setQuizResult(null); setQuizError(''); };

  const startQuiz = async (doubt: string) => {
    if (busy || quizPhase) return;
    setError(''); setQuizError(''); setQuizPhase('loading'); setQuiz(null); setQuizResult(null);
    try {
      const res = await window.cth.classroomQuiz({ agentId: agent.id, doubt });
      if (res.ok && res.quiz) {
        setQuiz(res.quiz); setPicks(res.quiz.questions.map(() => null)); setQuizPhase('taking');
      } else {
        closeQuiz(); setError(res.error ?? 'The quiz could not be created.');
      }
    } catch (e) {
      closeQuiz(); setError(e instanceof Error ? e.message : 'The quiz could not be created.');
    }
  };

  const submitQuiz = async () => {
    if (!quiz || quizPhase !== 'taking') return;
    setQuizPhase('grading'); setQuizError('');
    try {
      const res = await window.cth.classroomQuizReport({ agentId: agent.id, quiz, answers: picks.map((p) => ({ picked: p })) });
      if (res.ok && res.graded) {
        setQuizResult({ graded: res.graded, report: res.report ?? null, analysisError: res.report ? undefined : res.error });
        setQuizPhase('report');
        if (res.note) { setMsgs((x) => [...x, res.note as ChatMsg]); onActivity?.(); }
      } else {
        setQuizPhase('taking'); setQuizError(res.error ?? 'Could not analyse the quiz — try again.');
      }
    } catch (e) {
      setQuizPhase('taking'); setQuizError(e instanceof Error ? e.message : 'Could not analyse the quiz — try again.');
    }
  };

  const send = useCallback(async (override?: string) => {
    const raw = (override ?? text).trim();
    if (!raw && !files.length) return;
    setError('');
    // Plain messages can be sent while a reply is still being written (they queue, in order);
    // the heavier tools below run one at a time.
    const heavy = !!(/^@quiz\b/i.exec(raw) && cast === 'teacher') || hasHandwrittenAlias(raw) || hasCheatSheetAlias(raw) || !!fileToolAlias(raw);
    if (heavy && busy) { setError(`${agent.name} is still busy — wait for the current reply before using a tool command.`); return; }

    // @quiz [doubt] → MCQ quiz built from the doubt (or the student's last question).
    const quizCmd = /^@quiz\b\s*([\s\S]*)$/i.exec(raw);
    if (quizCmd && cast === 'teacher') {
      setText('');
      void startQuiz(quizCmd[1].trim());
      return;
    }

    // @handwritten → the model writes the answer, a PDF with diagrams is made locally.
    if (hasHandwrittenAlias(raw)) {
      try { parseHandwrittenRequest(raw, files); } catch (e) { setError(e instanceof Error ? e.message : String(e)); return; }
      const sentFiles = files;
      setToolResult(null); beginWork(agent.id);
      setMsgs((x) => [...x, { id: `u-${Date.now()}`, role: 'user', text: sentFiles.length ? `${raw}\n\n📎 ${sentFiles.map((f) => f.name).join(', ')}` : raw, ts: Date.now(), attachments: sentFiles },
        { id: `n-${Date.now()}`, role: 'note', text: 'Writing it out by hand and drawing the diagrams… this can take a minute.', ts: Date.now() }]);
      setText(''); setFiles([]);
      try {
        const res = await window.cth.handwrittenRun({ text: raw, files: sentFiles.map((f) => ({ path: f.path, name: f.name })) });
        if (res.ok) { setToolResult(res); onActivity?.(); }
        else setError(res.error ?? 'Could not make the PDF — try again.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not make the PDF — try again.');
      } finally { endWork(agent.id); }
      return;
    }

    // @cheat-sheet → Smart Guy's special power: a one-page JEE chapter sheet (PDF), made locally.
    if (hasCheatSheetAlias(raw)) {
      if (cast !== 'smartguy') { setError("Cheat sheets are Smart Guy's special power — open his chat."); return; }
      try { parseCheatSheetRequest(raw); } catch (e) { setError(e instanceof Error ? e.message : String(e)); return; }
      setToolResult(null); beginWork(agent.id);
      setMsgs((x) => [...x, { id: `u-${Date.now()}`, role: 'user', text: raw, ts: Date.now() },
        { id: `n-${Date.now()}`, role: 'note', text: 'Smart Guy is cramming the chapter onto one page… about a minute.', ts: Date.now() }]);
      setText('');
      try {
        const res = await window.cth.cheatSheetRun({ text: raw });
        if (res.ok) { setToolResult(res); onActivity?.(); }
        else setError(res.error ?? 'Could not make the cheat sheet — try again.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not make the cheat sheet — try again.');
      } finally { endWork(agent.id); }
      return;
    }

    // @convert / @compress → the Librarian's file desk (runs locally, nothing uploaded).
    if (fileToolAlias(raw)) {
      if (cast !== 'librarian') { setError('Converting and compressing files is the Librarian\'s job — open the Librarian\'s chat.'); return; }
      setToolResult(null); beginWork(agent.id);
      try {
        const out = await sendFileToolDraft(raw, files, window.cth);
        if (out.kind === 'blocked') { setError(out.error); return; }
        if (out.kind === 'done') {
          setMsgs((x) => [...x, { id: `u-${Date.now()}`, role: 'user', text: raw, ts: Date.now() }]);
          setToolResult(out.result); setText(''); setFiles([]);
          onActivity?.();
        }
      } finally { endWork(agent.id); }
      return;
    }

    // @teach-me → open the interactive classroom inside this window.
    let teaching: TeachingRequest | null = null;
    try { teaching = parseTeachingRequest(raw, files); } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (teaching) {
      const teacher = cast === 'teacher' ? agent : findTeacherAgent(agents);
      if (!teacher) { setError('No Teacher on the roster — hire the Teacher first.'); return; }
      setMsgs((x) => [...x, { id: `u-${Date.now()}`, role: 'user', text: raw, ts: Date.now() },
        { id: `n-${Date.now()}`, role: 'note', text: 'Opening the classroom…', ts: Date.now() }]);
      startLesson(teaching, teacher.id, viewId);
      setText(''); setFiles([]);
      return;
    }

    // [[Book title]] markers (added by the book suggestions) scope the notes search to those books.
    const books = [...raw.matchAll(/\[\[([^\]\n]{1,200})\]\]/g)].map((b) => b[1].trim()).filter(Boolean).slice(0, 5);
    const useNotes = cast === 'librarian' || books.length > 0 || /(^|\s)@memory-notes(?=\s|$)/.test(raw);
    const clean = raw.replace(/\[\[[^\]\n]*\]\]/g, ' ').replace(/(^|\s)@memory-notes(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim() || raw;
    const sentFiles = files;
    const id = agent.id;
    const tempId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const body = raw || 'Please look at the attached file(s).';
    const shown = sentFiles.length ? `${body}\n\n📎 ${sentFiles.map((f) => f.name).join(', ')}` : body;
    // Show the message at once, whether or not the character is still answering something else.
    const sentAt = Date.now();
    setMsgs((x) => [...x, { id: tempId, role: 'user', text: shown, ts: sentAt, attachments: sentFiles, pending: terminalBrain, key: clean.slice(0, 30) }]);
    setText(''); setFiles([]);

    if (terminalBrain) {
      const fail = (e: unknown) => {
        const cur = getChatSession(id);
        patchChatSession(id, {
          msgs: cur.msgs.filter((y) => y.id !== tempId),
          error: e instanceof Error ? e.message : 'Could not send.',
          ...(cur.text.trim() ? {} : { text: raw, files: sentFiles }),
        });
      };
      void (async () => {
        try {
          // The Principal orchestrates: a task is split between the staff, and the Principal answers once they report.
          if (cast === 'principal') {
            const note = (t: string) => setMsgs((x) => [...x, { id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: 'note', text: t, ts: Date.now() }]);
            if (await orchestrate({ principal: agent, task: clean, note }) === 'delegated') {
              setMsgs((x) => x.map((y) => (y.id === tempId ? { ...y, pending: false } : y)));
              return;
            }
          }
          const res = await window.cth.classroomCompose({ cast, name: agent.name, text: clean, useNotes, books, first: !introduced.has(id), files: sentFiles.map((f) => ({ path: f.path, name: f.name })) });
          if (!res.ok || !res.instruction) throw new Error(res.error ?? 'Could not send.');
          introduced.add(id);
          useStore.getState().enqueueMessage(id, shown, { instruction: res.instruction });
          onActivity?.();
        } catch (e) { fail(e); }
      })();
      return;
    }

    void enqueueChat(id, async () => {
      try {
        const res = await window.cth.classroomSend({ agentId: id, cast, name: agent.name, text: clean, useNotes, books, files: sentFiles.map((f) => ({ path: f.path, name: f.name })) });
        if (res.ok && res.agent) {
          patchChatSession(id, { msgs: [...getChatSession(id).msgs, res.agent as ChatMsg] });
          onActivity?.();
          return;
        }
        throw new Error(res.error ?? 'No reply — try again.');
      } catch (e) {
        const cur = getChatSession(id);
        // Keep what you typed: put it back in the box unless you have already started something new.
        patchChatSession(id, {
          msgs: cur.msgs.filter((y) => y.id !== tempId),
          error: e instanceof Error ? e.message : 'No reply — try again.',
          ...(cur.text.trim() ? {} : { text: raw, files: sentFiles }),
        });
      }
    });
  }, [text, busy, files, cast, agent, agents, onActivity]);

  if (!school) {
    return <div style={{ padding: 16, fontSize: 13, color: 'var(--cth-ink-500)' }}>Chat is available for the school cast.</div>;
  }

  const focus = variant === 'focus';
  const starters = STARTERS[cast] ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
      {!focus && <div style={{ padding: '10px 10px 0' }}><IdCard agent={agent} mood={liveMood} compact /></div>}

      {/* Dropdown: this agent's chat, or the running classroom lesson. */}
      <div style={{ padding: focus ? '10px 24px 0' : '8px 10px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          aria-label="Chat or classroom"
          value={showingLesson ? 'lesson' : 'chat'}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'lesson') showLessonIn(viewId);
            else if (v === 'end') { endLesson(); }
            else releaseLesson(viewId);
          }}
          style={{ padding: '5px 8px', borderRadius: 10, border: 'none', background: 'var(--cth-cream-200)', color: 'var(--cth-ink-900)', fontSize: 13, fontWeight: 600, boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', cursor: 'pointer', maxWidth: '100%' }}
        >
          <option value="chat">{agent.name} chat</option>
          {lesson && <option value="lesson">Classroom — {lesson.request.topic ? lesson.request.topic.slice(0, 40) : 'lesson'}</option>}
          {lesson && <option value="end">End lesson</option>}
        </select>
        {lesson && !showingLesson && <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>Lesson running in the background</span>}
      </div>

      {showingLesson && lesson ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 10, gap: 8 }}>
          <TeachingPanelHost
            key={`${lesson.request.topic}:${lesson.teacherId}`}
            request={lesson.request}
            teacherId={lesson.teacherId}
            alreadyOpen={lesson.opened}
            onOpened={markLessonOpened}
            onFailed={(message) => { endLesson(); setError(message); }}
          />
        </div>
      ) : (
        <>
          <div ref={scroller} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: focus ? '24px 0' : 10 }}>
            <div style={{ maxWidth: focus ? 760 : undefined, margin: '0 auto', padding: focus ? '0 24px' : 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cast === 'librarian' && <LibraryStrip />}
              {visible.length === 0 && (
                <div style={{ textAlign: 'center', padding: focus ? '40px 0 8px' : '16px 0' }}>
                  {focus && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Face agent={agent} mood="neutral" size={96} card /></div>}
                  <div style={{ fontSize: focus ? 28 : 16, fontWeight: 800, color: 'var(--cth-ink-900)' }}>
                    Hi, I&apos;m {agent.name}.
                  </div>
                  <div style={{ fontSize: focus ? 16 : 13, color: 'var(--cth-ink-500)', marginTop: 4 }}>What would you like to work on?</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                    {starters.map((s) => (
                      <button key={s} type="button" onClick={() => { setText(s); area.current?.focus(); setCaret(s.length); }}
                        style={{ border: 'none', cursor: 'pointer', padding: '8px 12px', borderRadius: 12, background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)', fontSize: 13, boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', textAlign: 'left' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {visible.map((x) => <Bubble key={x.id} msg={x} agent={agent} />)}
              {toolResult && <FileToolResultCard result={toolResult} />}
              {quizPhase && (
                <QuizCard phase={quizPhase} quiz={quiz} picks={picks} result={quizResult} error={quizError}
                  onPick={(qi, oi) => setPicks((p) => p.map((v, i) => (i === qi ? oi : v)))}
                  onSubmit={() => { void submitQuiz(); }} onClose={closeQuiz} />
              )}
              {(busy || working) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <Face agent={agent} mood="thinking" size={36} />
                  <div style={{ padding: '8px 12px', borderRadius: 14, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', color: 'var(--cth-ink-500)', fontSize: 13 }}>
                    {agent.name} is {terminalBrain && !busy ? 'working in the terminal' : 'typing'}…
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: focus ? '0 24px 20px' : '0 10px 10px', maxWidth: focus ? 808 : undefined, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
            {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cth-coral)', marginBottom: 6 }}>{error}</div>}
            {open && (
              <div role="listbox" style={{ marginBottom: 6, background: 'var(--cth-paper-100)', borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', overflow: 'hidden' }}>
                {options.map((o, i) => (
                  <button key={o.alias} type="button" role="option" aria-selected={i === pick}
                    onMouseDown={(e) => { e.preventDefault(); accept(o); }} onMouseEnter={() => setPick(i)}
                    style={{ display: 'flex', gap: 10, alignItems: 'baseline', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '6px 10px', background: i === pick ? 'var(--cth-lemon-light)' : 'transparent', color: 'var(--cth-ink-900)', fontSize: 12 }}>
                    <code style={{ fontWeight: 700 }}>{o.alias}</code><span style={{ color: 'var(--cth-ink-500)' }}>{o.hint}</span>
                  </button>
                ))}
              </div>
            )}
            {cast === 'teacher' && !quizPhase && (msgs.length > 0 || text.trim()) && (
              <div style={{ marginBottom: 6 }}>
                <button type="button" onClick={() => { void startQuiz(text.replace(/^@quiz\b/i, '').trim()); setText(''); }} disabled={busy}
                  title="Teacher writes MCQs about your doubt, then analyses your answers"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: busy ? 'default' : 'pointer', padding: '5px 12px', borderRadius: 999, background: 'var(--cth-lilac-light)', color: 'var(--cth-ink-900)', fontSize: 12, fontWeight: 600, boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
                  <IconQuiz size={15} /> Quiz me on this
                </button>
              </div>
            )}
            {files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {files.map((f) => (
                  <span key={f.path} title={f.path} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '2px 8px', borderRadius: 8, background: 'var(--cth-cream-200)', fontSize: 12, color: 'var(--cth-ink-900)' }}>
                    <AttachmentThumb path={f.path} name={f.name} size={48} />
                    {f.name}
                    <button type="button" onClick={() => setFiles((p) => p.filter((y) => y.path !== f.path))} aria-label="Remove file" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cth-ink-500)', padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '8px 8px', borderRadius: focus ? 16 : 12, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)' }}>
              <button type="button" onClick={() => { void pickFiles(); }} title={cast === 'librarian' ? 'Attach or paste PDFs, slides or images for @convert / @compress, or ask about them' : 'Attach or paste an image/PDF to ask about it, or for @teach-me'} aria-label="Attach files"
                style={{ border: 'none', cursor: 'pointer', width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: 'var(--cth-cream-200)', color: 'var(--cth-ink-900)', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>+</button>
              <textarea
                ref={area}
                rows={1}
                value={text}
                placeholder={`Message ${agent.name} — type @ for options`}
                onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setPick(0); setDismissed(null); setError(''); }}
                onPaste={(e) => { void onPaste(e); }}
                onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (open) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setPick((i) => (i + 1) % options.length); return; }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setPick((i) => (i - 1 + options.length) % options.length); return; }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); accept(options[Math.min(pick, options.length - 1)]); return; }
                    if (e.key === 'Escape') { e.preventDefault(); setDismissed(bookOptions.length ? -2 - bookStart : start); return; }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
                style={{ flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--cth-ink-900)', fontFamily: 'var(--cth-font-ui)', fontSize: 14, lineHeight: '20px', padding: '7px 2px', boxSizing: 'border-box', minHeight: 34, maxHeight: 160, overflowY: 'auto', display: 'block' }}
              />
              {(() => {
                const off = !text.trim() && !files.length;
                return (
                  <button type="button" onClick={() => { void send(); }} disabled={off} aria-label="Send"
                    style={{ border: 'none', cursor: off ? 'default' : 'pointer', width: 34, height: 34, flexShrink: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, borderRadius: 10, background: off ? 'var(--cth-cream-300)' : 'var(--cth-ink-900)', color: off ? 'var(--cth-ink-500)' : 'var(--cth-paper-100)', fontSize: 16 }}>↑</button>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
