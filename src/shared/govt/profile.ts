/**
 * The citizen's profile — what the app asks once, on first login, and what every
 * desk then reads. Pure data + validation, no electron / DOM imports.
 */

export const GENDERS = ['female', 'male', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const CATEGORIES = ['general', 'ews', 'obc', 'sc', 'st'] as const;
export type Category = (typeof CATEGORIES)[number];

export const AREAS = ['rural', 'urban'] as const;
export type Area = (typeof AREAS)[number];

export const OCCUPATIONS = [
  'farmer', 'farm_labourer', 'student', 'homemaker', 'daily_wage', 'self_employed',
  'street_vendor', 'artisan', 'private_job', 'govt_job', 'retired', 'unemployed', 'other',
] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

/** States and Union Territories, in the order a dropdown should list them. */
export const STATES: readonly string[] = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export interface AvatarLook {
  /** Re-roll counter: bumps the random parts (skin tone, hair style) of the avatar. */
  seed: number;
}

export interface CitizenProfile {
  name: string;
  state: string;
  /** Annual FAMILY income in rupees. */
  income: number;
  occupation: Occupation;
  age: number;
  gender: Gender;
  category: Category;
  area: Area;
  look: AvatarLook;
  createdAt: number;
}

export type ProfileDraft = Partial<Omit<CitizenProfile, 'createdAt'>> & { incomeText?: string; ageText?: string };

export type ProfileIssue = 'name' | 'state' | 'income' | 'occupation' | 'age' | 'gender' | 'category' | 'area';

const inList = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** Clean a free-typed income ("1,20,000", "₹ 2.5 lakh", "120000") into rupees. NaN when unreadable. */
export function parseIncome(text: string): number {
  const t = text.toLowerCase().replace(/[₹,\s]/g, '').replace(/rs\.?|inr/g, '');
  const m = /^(\d+(?:\.\d+)?)(lakhs?|lacs?|l|crores?|cr|k|thousand)?$/.exec(t);
  if (!m) return Number.NaN;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? '';
  const mult = /^(lakhs?|lacs?|l)$/.test(unit) ? 100_000 : /^(crores?|cr)$/.test(unit) ? 10_000_000 : /^(k|thousand)$/.test(unit) ? 1000 : 1;
  return Math.round(n * mult);
}

/** Validate a draft; returns the clean profile or the list of fields to fix. */
export function validateProfile(d: ProfileDraft, now = Date.now()): { ok: true; profile: CitizenProfile } | { ok: false; issues: ProfileIssue[] } {
  const issues: ProfileIssue[] = [];
  const name = (d.name ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (name.length < 2) issues.push('name');
  if (!d.state || !STATES.includes(d.state)) issues.push('state');
  const income = typeof d.income === 'number' ? d.income : parseIncome(d.incomeText ?? '');
  if (!Number.isFinite(income) || income < 0 || income > 100_000_000_000) issues.push('income');
  if (!inList(OCCUPATIONS, d.occupation)) issues.push('occupation');
  const age = typeof d.age === 'number' ? d.age : parseInt(d.ageText ?? '', 10);
  if (!Number.isInteger(age) || age < 5 || age > 110) issues.push('age');
  if (!inList(GENDERS, d.gender)) issues.push('gender');
  const category = d.category ?? 'general';
  if (!inList(CATEGORIES, category)) issues.push('category');
  const area = d.area ?? 'urban';
  if (!inList(AREAS, area)) issues.push('area');
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    profile: {
      name, state: d.state as string, income: Math.round(income), occupation: d.occupation as Occupation,
      age, gender: d.gender as Gender, category: category as Category, area: area as Area,
      look: { seed: Math.max(0, Math.floor(d.look?.seed ?? 0)) % 1000 }, createdAt: now,
    },
  };
}

/** Same checks for a stored file; anything malformed is dropped rather than trusted. */
export function sanitizeStoredProfile(raw: unknown): CitizenProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const r = validateProfile({
    name: typeof o.name === 'string' ? o.name : '',
    state: typeof o.state === 'string' ? o.state : '',
    income: typeof o.income === 'number' ? o.income : Number.NaN,
    occupation: o.occupation as Occupation, age: typeof o.age === 'number' ? o.age : Number.NaN,
    gender: o.gender as Gender, category: o.category as Category, area: o.area as Area,
    look: { seed: typeof (o.look as AvatarLook | undefined)?.seed === 'number' ? (o.look as AvatarLook).seed : 0 },
  }, typeof o.createdAt === 'number' ? o.createdAt : Date.now());
  return r.ok ? r.profile : null;
}

export function formatRupees(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Initials for the avatar badge. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
