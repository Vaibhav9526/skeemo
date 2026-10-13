import type { TFunction } from 'i18next';
import type { Check } from '@shared/govt/eligibility';
import { formatRupees } from '@shared/govt/profile';

const list = (t: TFunction, prefix: string, v: unknown): string =>
  (Array.isArray(v) ? v : [v]).map((x) => t(`${prefix}.${String(x)}`)).join(' / ');

/** One screening line in the citizen's language ("Your age 34 is within 18–40", …). */
export function describeCheck(c: Check, t: TFunction, ask: (text: { en: string; hi: string }) => string): string {
  const d = c.data;
  switch (c.kind) {
    case 'age_min': return t(c.ok ? 'elig.ageMinOk' : 'elig.ageMinBad', { age: d.age, min: d.min });
    case 'age_max': return t(c.ok ? 'elig.ageMaxOk' : 'elig.ageMaxBad', { age: d.age, max: d.max });
    case 'gender': return t(c.ok ? 'elig.genderOk' : 'elig.genderBad', { need: list(t, 'gender', d.need) });
    case 'income': return t(c.ok ? 'elig.incomeOk' : 'elig.incomeBad', { income: formatRupees(Number(d.income)), limit: formatRupees(Number(d.limit)) });
    case 'occupation': return t(c.ok ? 'elig.occOk' : 'elig.occBad', { need: list(t, 'occ', d.need) });
    case 'excluded_occupation': return t(c.ok ? 'elig.exclOk' : 'elig.exclBad', { barred: list(t, 'occ', d.barred) });
    case 'category': return t(c.ok ? 'elig.catOk' : 'elig.catBad', { need: list(t, 'cat', d.need) });
    case 'area': return t(c.ok ? 'elig.areaOk' : 'elig.areaBad', { need: t(`area.${String(d.need)}`) });
    case 'any_of': return t(c.ok ? 'elig.anyOk' : 'elig.anyBad', { label: String(d.label) });
    case 'question': return c.question ? ask(c.question.text) : '';
  }
}
