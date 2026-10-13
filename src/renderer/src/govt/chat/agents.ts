/**
 * Talking to the counters. A message may start with (or contain) an @mention — `@documents`, `@help`,
 * `@vault` … — which calls that counter, exactly like invoking an agent in a chat app. Free text goes to
 * the counter whose conversation is open: Registration matches it to schemes, Eligibility can run the
 * check, Form can start the guide, everyone else answers as the Help desk would.
 */
import i18n from '@/i18n';
import { floor } from '@/scene/govt/floorBus';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { evaluate } from '@shared/govt/eligibility';
import type { DeskId } from '@shared/govt/cases';
import { ACTORS } from '../art/people';
import { describeCheck } from '../eligText';
import { useGovt } from '../state';
import { mid, useChat, type Msg } from './chatStore';
import { parseMention } from './mentions';

export { MENTION_LIST, parseMention, type Target } from './mentions';

const T = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { ns: 'govt', ...opts }) as string;
const lang = () => i18n.language;

async function replyFor(desk: DeskId, text: string): Promise<{ text: string; blocks?: Msg['blocks'] }> {
  const st = useGovt.getState();
  const c = st.cases.find((x) => x.id === st.activeCaseId) ?? null;

  if (desk === 'registration' || desk === 'reception') {
    const r = await window.cth.govtAiMatch({ text, lang: lang() }).catch(() => null);
    if (!r || !r.ok) return { text: r && !r.ok ? r.error : T('common.failed') };
    if (!r.ids.length) return { text: r.reply || T('desk.registration.noneFound') };
    return { text: r.reply || T('desk.registration.foundN', { count: r.ids.length }), blocks: [{ type: 'schemes', ids: r.ids }] };
  }

  if (desk === 'eligibility' && /check|eligib|qualif|verdict|पात्र|যোগ্য|అర్హ|தகுதி|પાત્ર|اہل|ಅರ್ಹ|യോഗ്യ|ਯੋਗ/i.test(text)) {
    if (!c) return { text: T('chat.noCase') };
    const scheme = SCHEME_BY_ID[c.schemeId];
    const profile = st.profile;
    const v = scheme && profile ? evaluate(scheme, profile, c.answers) : null;
    if (!v || v.status === 'incomplete') return { text: T('chat.answerFirst') };
    const res = await window.cth.govtEligibilityRun(c.id).catch(() => null);
    if (res) st.replaceCase(res.case);
    return { text: v.status === 'eligible' ? T('desk.eligibility.verdictOk', { scheme: scheme.name.en }) : T('desk.eligibility.verdictNo', { scheme: scheme.name.en, reasons: v.failed.map((f) => describeCheck(f, i18n.getFixedT(lang(), 'govt'), (l) => (lang() === 'hi' ? l.hi : l.en))).join(' ') }), blocks: [{ type: 'verdict', caseId: c.id }] };
  }

  if (desk === 'form' && /open|launch|start|guide|portal|superjargon|खोल|शुरू/i.test(text)) {
    if (!c) return { text: T('chat.noCase') };
    const r = await window.cth.govtGuideLaunch({ caseId: c.id, lang: lang() }).catch(() => null);
    if (!r || !r.ok) return { text: r && !r.ok ? r.error : T('common.failed') };
    return { text: r.started ? T('desk.form.started') : T('desk.form.notStarted') };
  }

  const r = await window.cth.govtAiHelp({ question: text, lang: lang(), caseId: c?.id, history: (useChat.getState().threads[desk] ?? []).slice(-6).map((m) => ({ role: m.role, text: m.text })) }).catch(() => null);
  return { text: r && r.ok ? r.reply : r && !r.ok ? r.error : T('common.failed') };
}

/** Send what the citizen typed. Handles mentions, switching counters and the reply. */
export async function sendMessage(raw: string): Promise<void> {
  const text = raw.trim();
  if (!text) return;
  const st = useGovt.getState();
  const { target, rest } = parseMention(text);
  if (target === 'vault') { st.setView('vault'); return; }
  const desk: DeskId = target ?? st.desk;
  if (desk !== st.desk || st.view !== 'chat') st.openDesk(desk);
  const chat = useChat.getState();
  chat.push(desk, { id: mid(), role: 'user', text, ts: Date.now() });
  if (!rest) return; // just calling the counter — its greeting is already on screen
  chat.setBusy(desk, true);
  const actor = ACTORS[desk].id;
  floor({ type: 'busy', actor, on: true });
  try {
    const out = await replyFor(desk, rest);
    chat.push(desk, { id: mid(), role: 'agent', text: out.text, blocks: out.blocks, ts: Date.now() });
  } finally {
    floor({ type: 'busy', actor, on: false });
    chat.setBusy(desk, false);
  }
}
