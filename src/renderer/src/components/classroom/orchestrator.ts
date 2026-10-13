import { useStore, type Agent } from '@/store/store';
import { isSchoolCast } from './art';
import { introduced } from './chatSessions';

/**
 * The Principal as orchestrator. A task sent to the Principal is split between the characters who
 * are in the room; each gets their part typed into THEIR terminal (so it shows in their chat and
 * terminal alike), their answers are collected, and the Principal is handed the results to turn
 * into one final answer. Everything is also filed on the Librarian's desk.
 */
export const TASK_TAG = '[Task from the Principal]';
const POLL_MS = 2500;
const WAIT_MS = 6 * 60_000;

const NAME: Record<string, string> = { teacher: 'Teacher', topper: 'Topper', smartguy: 'Smart Guy', librarian: 'Librarian' };
const stripMood = (t: string) => t.replace(/^\s*\[mood:[a-z-]+\]\s*/i, '').trim();
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const busy = (id: string) => {
  const a = useStore.getState().agents.find((x) => x.id === id);
  return a?.status === 'working' || a?.status === 'thinking';
};

/** Wait until `agent` has delivered and answered the task sent at `sentAt`. Null on timeout. */
async function waitForReply(agent: Agent, sentAt: number): Promise<string | null> {
  const until = Date.now() + WAIT_MS;
  let lastKey = '';
  let stable = 0;
  while (Date.now() < until) {
    await sleep(POLL_MS);
    const r = await window.cth.officeChatMessages(agent.id, 60).catch(() => null);
    const lines = r?.lines ?? [];
    const at = lines.findIndex((l) => l.role === 'user' && l.ts >= sentAt - 3000 && l.text.includes(TASK_TAG));
    if (at < 0) continue; // not delivered yet (the agent is still busy with something else)
    const reply: string[] = [];
    for (const l of lines.slice(at + 1)) { if (l.role === 'user') break; if (l.role === 'agent') reply.push(l.text); }
    if (!reply.length) continue;
    const key = `${reply.length}:${reply[reply.length - 1].length}`;
    stable = key === lastKey ? stable + 1 : 0;
    lastKey = key;
    if (stable >= 1 && !busy(agent.id)) return stripMood(reply.join('\n\n'));
  }
  return null;
}

/**
 * Plan and dispatch. Resolves 'direct' when the task needs no delegation (the caller then sends it to
 * the Principal as an ordinary message); 'delegated' once the parts are on their way. Progress and the
 * final hand-back continue in the background and are reported through `note`.
 */
export async function orchestrate(opts: {
  principal: Agent;
  task: string;
  note: (text: string) => void;
}): Promise<'direct' | 'delegated'> {
  const { principal, task, note } = opts;
  const team = useStore.getState().agents.filter((a) => !a.archived && isSchoolCast(a.character) && a.character !== 'principal');
  if (!team.length) return 'direct';
  const plan = await window.cth.classroomPlan({ task, roster: [...new Set(team.map((a) => a.character))] }).catch(() => null);
  const steps = (plan?.ok ? plan.steps : undefined) ?? [];
  if (!steps.length) return 'direct';

  const jobs = steps.flatMap((s) => {
    const target = team.find((a) => a.character === s.to);
    return target ? [{ target, task: s.task }] : [];
  });
  if (!jobs.length) return 'direct';

  note(`${principal.name} is splitting this between ${jobs.map((j) => NAME[j.target.character] ?? j.target.name).join(', ')}…`);
  const sentAt = Date.now();
  for (const j of jobs) {
    useStore.getState().enqueueMessage(j.target.id, `From ${principal.name}: ${j.task}`, {
      instruction: `${TASK_TAG} ${j.task}\n\nThis is a sub-task given by the Principal as part of a bigger job: "${task.slice(0, 600)}". Do your part and answer directly and concisely — your reply is collected and combined by the Principal.`,
    });
    note(`→ ${NAME[j.target.character] ?? j.target.name}: ${j.task.length > 140 ? `${j.task.slice(0, 140)}…` : j.task}`);
  }

  void (async () => {
    const results = await Promise.all(jobs.map(async (j) => {
      const text = await waitForReply(j.target, sentAt);
      note(text ? `✓ ${NAME[j.target.character] ?? j.target.name} finished.` : `… ${NAME[j.target.character] ?? j.target.name} has not answered yet — carrying on without them.`);
      return { who: NAME[j.target.character] ?? j.target.name, task: j.task, text };
    }));
    const done = results.filter((r) => r.text);
    const report = results.map((r) => `## ${r.who}\nTask: ${r.task}\n${r.text ?? '(no answer in time)'}`).join('\n\n');
    // File the whole thing on the desk, then hand it to the Principal to answer the student.
    void window.cth.deskSaveText({ name: `${principal.name} - ${task.slice(0, 40)}`, text: `Task: ${task}\n\n${report}`, kind: 'research', agent: principal.name }).catch(() => undefined);
    // Through compose so the Principal gets their persona the first time they are addressed this launch.
    const handBack = `Your staff have finished their parts of the student's task: "${task.slice(0, 600)}".\n\n${report.slice(0, 20_000)}\n\nCombine this into ONE clear, well-organised final answer for the student. Credit who did what in a few words, point out any gaps or disagreements, and keep it short.`;
    const composed = await window.cth.classroomCompose({ cast: 'principal', name: principal.name, text: handBack, raw: true, first: !introduced.has(principal.id) }).catch(() => null);
    introduced.add(principal.id);
    useStore.getState().enqueueMessage(principal.id, `Team results are in (${done.length}/${results.length})`, { instruction: composed?.ok && composed.instruction ? composed.instruction : handBack });
    note('All reports are in — the Principal is writing the final answer.');
  })();
  return 'delegated';
}
