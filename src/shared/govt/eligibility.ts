/**
 * The Eligibility Check desk's engine — plain rules, no AI, so a verdict is always the same for
 * the same answers and can be explained line by line. It is a FIRST SCREENING against the
 * published criteria; the official portal makes the final decision.
 */
import type { CitizenProfile } from './profile';
import type { Question, Rule, Scheme } from './schemes';
import { SCHEMES } from './schemes';

export type CheckKind =
  | 'age_min' | 'age_max' | 'gender' | 'income' | 'occupation' | 'excluded_occupation'
  | 'category' | 'area' | 'any_of' | 'question';

export interface Check {
  kind: CheckKind;
  /** true = passes, false = fails, null = needs an answer from the citizen. */
  ok: boolean | null;
  /** Raw values the UI turns into a sentence in the citizen's language. */
  data: Record<string, string | number | readonly string[]>;
  question?: Question;
}

export type Answers = Record<string, 'yes' | 'no'>;

export interface Verdict {
  status: 'eligible' | 'ineligible' | 'incomplete';
  checks: Check[];
  failed: Check[];
  pending: Check[];
  /** The scheme's income limit is only a practical stand-in for a survey-based test. */
  indicativeIncome: boolean;
}

function ruleChecks(rule: Rule, p: CitizenProfile): Check[] {
  const out: Check[] = [];
  if (rule.age?.min !== undefined) out.push({ kind: 'age_min', ok: p.age >= rule.age.min, data: { age: p.age, min: rule.age.min } });
  if (rule.age?.max !== undefined) out.push({ kind: 'age_max', ok: p.age <= rule.age.max, data: { age: p.age, max: rule.age.max } });
  if (rule.gender) out.push({ kind: 'gender', ok: rule.gender.includes(p.gender), data: { have: p.gender, need: rule.gender } });
  if (rule.maxIncome !== undefined) out.push({ kind: 'income', ok: p.income <= rule.maxIncome, data: { income: p.income, limit: rule.maxIncome } });
  if (rule.occupations) out.push({ kind: 'occupation', ok: rule.occupations.includes(p.occupation), data: { have: p.occupation, need: rule.occupations } });
  if (rule.excludeOccupations) out.push({ kind: 'excluded_occupation', ok: !rule.excludeOccupations.includes(p.occupation), data: { have: p.occupation, barred: rule.excludeOccupations } });
  if (rule.categories) out.push({ kind: 'category', ok: rule.categories.includes(p.category), data: { have: p.category, need: rule.categories } });
  if (rule.area) out.push({ kind: 'area', ok: p.area === rule.area, data: { have: p.area, need: rule.area } });
  return out;
}

const ruleHolds = (rule: Rule, p: CitizenProfile): boolean => ruleChecks(rule, p).every((c) => c.ok);

/** Run a scheme's rules against a profile and the extra answers given so far. */
export function evaluate(scheme: Scheme, profile: CitizenProfile, answers: Answers = {}): Verdict {
  const checks = ruleChecks(scheme.rule, profile);
  if (scheme.anyOf?.length) {
    checks.push({
      kind: 'any_of', ok: scheme.anyOf.some((r) => ruleHolds(r, profile)),
      data: { label: scheme.anyOfLabel?.en ?? '', labelHi: scheme.anyOfLabel?.hi ?? '' },
    });
  }
  for (const q of scheme.questions ?? []) {
    const a = answers[q.id];
    checks.push({ kind: 'question', ok: a === undefined ? null : a === q.need, data: { id: q.id, need: q.need }, question: q });
  }
  const failed = checks.filter((c) => c.ok === false);
  const pending = checks.filter((c) => c.ok === null);
  return {
    status: failed.length ? 'ineligible' : pending.length ? 'incomplete' : 'eligible',
    checks, failed, pending,
    indicativeIncome: scheme.incomeBasis === 'indicative' && scheme.rule.maxIncome !== undefined,
  };
}

export interface Match { scheme: Scheme; verdict: Verdict }

/**
 * Every scheme the profile does not already rule out. Ones that only need a yes/no answer come
 * after the ones that are already clear, and the fewer open questions the better.
 */
export function recommend(profile: CitizenProfile, answers: Record<string, Answers> = {}): Match[] {
  return SCHEMES
    .map((scheme) => ({ scheme, verdict: evaluate(scheme, profile, answers[scheme.id] ?? {}) }))
    .filter((m) => m.verdict.status !== 'ineligible')
    .sort((a, b) => a.verdict.pending.length - b.verdict.pending.length);
}

/** Other schemes worth a look when this one is rejected: same category first. */
export function alternatives(scheme: Scheme, profile: CitizenProfile, limit = 3): Match[] {
  return recommend(profile)
    .filter((m) => m.scheme.id !== scheme.id)
    .sort((a, b) => Number(b.scheme.category === scheme.category) - Number(a.scheme.category === scheme.category) || a.verdict.pending.length - b.verdict.pending.length)
    .slice(0, limit);
}
