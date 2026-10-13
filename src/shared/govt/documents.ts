/**
 * The papers a scheme can ask for, and what the Document Verification desk checks on each.
 * Sizes are TYPICAL portal limits — real portals differ, so the desk lets the citizen
 * overwrite the limit before a file is fitted.
 */
import type { L } from './text';

export type DocId =
  | 'aadhaar' | 'pan' | 'income_cert' | 'caste_cert' | 'bank_passbook' | 'land_record'
  | 'ration_card' | 'bpl_card' | 'residence' | 'age_proof' | 'student_proof' | 'photo'
  | 'job_card' | 'business_proof' | 'electricity_bill' | 'mcp_card';

export type DocFormat = 'pdf' | 'jpg' | 'png';

/** How a number/ID on the paper is validated without any network call. */
export type IdCheck = 'aadhaar' | 'pan' | 'ifsc' | 'none';

export interface DocSpec {
  id: DocId;
  name: L;
  /** Where to get it if the citizen does not have it yet. */
  where: L;
  formats: readonly DocFormat[];
  /** Typical upload limit in KB. */
  maxKB: number;
  /** Some portals also demand a minimum size (photos especially). */
  minKB?: number;
  /** Words that appear on the genuine paper — used to spot a wrong upload. */
  keywords: readonly string[];
  idCheck: IdCheck;
  /** Does the paper carry the holder's name (cross-checked against the profile)? */
  hasName: boolean;
  /** Image only (no PDF), e.g. a passport photo. */
  imageOnly?: boolean;
}

export const DOCS: Record<DocId, DocSpec> = {
  aadhaar: {
    id: 'aadhaar', name: { en: 'Aadhaar card', hi: 'आधार कार्ड' },
    where: { en: 'Download e-Aadhaar from myaadhaar.uidai.gov.in or visit an Aadhaar centre.', hi: 'myaadhaar.uidai.gov.in से ई-आधार डाउनलोड करें या आधार केंद्र जाएँ।' },
    formats: ['pdf', 'jpg', 'png'], maxKB: 500, keywords: ['aadhaar', 'आधार', 'uidai', 'unique identification'], idCheck: 'aadhaar', hasName: true,
  },
  pan: {
    id: 'pan', name: { en: 'PAN card', hi: 'पैन कार्ड' },
    where: { en: 'Income Tax e-filing portal (instant e-PAN) or NSDL/UTIITSL.', hi: 'आयकर ई-फाइलिंग पोर्टल (इंस्टेंट ई-पैन) या NSDL/UTIITSL।' },
    formats: ['pdf', 'jpg', 'png'], maxKB: 300, keywords: ['income tax department', 'permanent account number', 'आयकर विभाग', 'pan'], idCheck: 'pan', hasName: true,
  },
  income_cert: {
    id: 'income_cert', name: { en: 'Income certificate', hi: 'आय प्रमाण पत्र' },
    where: { en: 'Tehsil / SDM office or your state e-District portal.', hi: 'तहसील / एसडीएम कार्यालय या राज्य के ई-डिस्ट्रिक्ट पोर्टल से।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['income certificate', 'annual income', 'आय प्रमाण', 'वार्षिक आय', 'tehsildar', 'revenue'], idCheck: 'none', hasName: true,
  },
  caste_cert: {
    id: 'caste_cert', name: { en: 'Caste / category certificate', hi: 'जाति / श्रेणी प्रमाण पत्र' },
    where: { en: 'Tehsil / SDM office or your state e-District portal.', hi: 'तहसील / एसडीएम कार्यालय या राज्य के ई-डिस्ट्रिक्ट पोर्टल से।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['caste certificate', 'scheduled caste', 'scheduled tribe', 'other backward', 'जाति प्रमाण', 'अनुसूचित', 'पिछड़ा'], idCheck: 'none', hasName: true,
  },
  bank_passbook: {
    id: 'bank_passbook', name: { en: 'Bank passbook (first page) or cancelled cheque', hi: 'बैंक पासबुक (पहला पन्ना) या रद्द चेक' },
    where: { en: 'Your bank branch. The account should be linked to Aadhaar.', hi: 'अपनी बैंक शाखा से। खाता आधार से जुड़ा होना चाहिए।' },
    formats: ['pdf', 'jpg', 'png'], maxKB: 300, keywords: ['ifsc', 'account', 'passbook', 'branch', 'खाता', 'bank'], idCheck: 'ifsc', hasName: true,
  },
  land_record: {
    id: 'land_record', name: { en: 'Land record (7/12, Khasra / Khatauni, Jamabandi or patta)', hi: 'भूमि अभिलेख (7/12, खसरा / खतौनी, जमाबंदी या पट्टा)' },
    where: { en: 'State land-records portal (Bhulekh) or the patwari / revenue office.', hi: 'राज्य के भूलेख पोर्टल या पटवारी / राजस्व कार्यालय से।' },
    formats: ['pdf', 'jpg'], maxKB: 1000, keywords: ['khasra', 'khatauni', 'jamabandi', '7/12', 'satbara', 'patta', 'survey', 'खसरा', 'खतौनी', 'जमाबंदी', 'bhulekh', 'land'], idCheck: 'none', hasName: true,
  },
  ration_card: {
    id: 'ration_card', name: { en: 'Ration card', hi: 'राशन कार्ड' },
    where: { en: 'Food & Civil Supplies office or your state food portal.', hi: 'खाद्य एवं नागरिक आपूर्ति कार्यालय या राज्य खाद्य पोर्टल से।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['ration card', 'राशन कार्ड', 'food', 'civil supplies', 'antyodaya', 'priority household'], idCheck: 'none', hasName: true,
  },
  bpl_card: {
    id: 'bpl_card', name: { en: 'BPL card / priority-household proof', hi: 'बीपीएल कार्ड / प्राथमिकता परिवार प्रमाण' },
    where: { en: 'Gram Panchayat / Urban Local Body or the Food & Civil Supplies office.', hi: 'ग्राम पंचायत / नगर निकाय या खाद्य एवं नागरिक आपूर्ति कार्यालय से।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['below poverty', 'bpl', 'बीपीएल', 'गरीबी रेखा', 'antyodaya', 'priority household'], idCheck: 'none', hasName: true,
  },
  residence: {
    id: 'residence', name: { en: 'Residence / domicile proof', hi: 'निवास / मूल निवास प्रमाण' },
    where: { en: 'Tehsil / SDM office, or a recent utility bill with your address.', hi: 'तहसील / एसडीएम कार्यालय या पते वाला हाल का बिजली-पानी का बिल।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['residence', 'domicile', 'निवास', 'address', 'पता', 'resident'], idCheck: 'none', hasName: true,
  },
  age_proof: {
    id: 'age_proof', name: { en: 'Age proof (birth certificate / school leaving certificate)', hi: 'आयु प्रमाण (जन्म प्रमाण पत्र / स्कूल छोड़ने का प्रमाण पत्र)' },
    where: { en: 'Municipal / Gram Panchayat birth register, or your school.', hi: 'नगर निगम / ग्राम पंचायत के जन्म रजिस्टर या अपने स्कूल से।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['birth', 'date of birth', 'जन्म', 'school', 'leaving certificate', 'dob'], idCheck: 'none', hasName: true,
  },
  student_proof: {
    id: 'student_proof', name: { en: 'Student proof (bonafide certificate / marksheet / fee receipt)', hi: 'विद्यार्थी प्रमाण (बोनाफाइड / अंकपत्र / फीस रसीद)' },
    where: { en: 'Your school or college office.', hi: 'अपने स्कूल या कॉलेज कार्यालय से।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['bonafide', 'marksheet', 'mark sheet', 'fee', 'admission', 'student', 'university', 'college', 'school', 'विद्यार्थी'], idCheck: 'none', hasName: true,
  },
  photo: {
    id: 'photo', name: { en: 'Passport-size photograph', hi: 'पासपोर्ट साइज़ फ़ोटो' },
    where: { en: 'Any photo studio, or a clear recent photo taken against a plain light wall.', hi: 'किसी फ़ोटो स्टूडियो से, या सादी हल्की दीवार के सामने ली गई साफ़ ताज़ा फ़ोटो।' },
    formats: ['jpg', 'png'], maxKB: 100, minKB: 10, keywords: [], idCheck: 'none', hasName: false, imageOnly: true,
  },
  job_card: {
    id: 'job_card', name: { en: 'Job card', hi: 'जॉब कार्ड' },
    where: { en: 'Gram Panchayat (apply on plain paper; issued within 15 days).', hi: 'ग्राम पंचायत से (सादे कागज़ पर आवेदन; 15 दिन में जारी)।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['job card', 'जॉब कार्ड', 'nrega', 'mgnrega', 'gram panchayat'], idCheck: 'none', hasName: true,
  },
  business_proof: {
    id: 'business_proof', name: { en: 'Business / vending / trade proof (Udyam, vending certificate, trade licence)', hi: 'व्यवसाय / वेंडिंग / व्यापार प्रमाण (उद्यम, वेंडिंग प्रमाण पत्र, ट्रेड लाइसेंस)' },
    where: { en: 'udyamregistration.gov.in, your Urban Local Body (vending certificate) or the trade-licence office.', hi: 'udyamregistration.gov.in, नगर निकाय (वेंडिंग प्रमाण पत्र) या ट्रेड लाइसेंस कार्यालय।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['udyam', 'vending', 'trade licence', 'trade license', 'msme', 'shop', 'establishment', 'gst', 'उद्यम'], idCheck: 'none', hasName: true,
  },
  electricity_bill: {
    id: 'electricity_bill', name: { en: 'Latest electricity bill', hi: 'ताज़ा बिजली बिल' },
    where: { en: 'Your electricity distribution company (DISCOM) app or office.', hi: 'अपनी बिजली वितरण कंपनी (डिस्कॉम) के ऐप या कार्यालय से।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['electricity', 'units', 'consumer', 'discom', 'kwh', 'बिजली', 'meter'], idCheck: 'none', hasName: true,
  },
  mcp_card: {
    id: 'mcp_card', name: { en: 'Mother & Child Protection (MCP) card / pregnancy registration', hi: 'मातृ एवं शिशु सुरक्षा (एमसीपी) कार्ड / गर्भावस्था पंजीकरण' },
    where: { en: 'Anganwadi centre or the nearest government health centre.', hi: 'आँगनवाड़ी केंद्र या निकटतम सरकारी स्वास्थ्य केंद्र से।' },
    formats: ['pdf', 'jpg'], maxKB: 500, keywords: ['mother', 'child', 'mcp', 'anganwadi', 'pregnan', 'antenatal', 'मातृ', 'गर्भ'], idCheck: 'none', hasName: true,
  },
};

export const DOC_IDS = Object.keys(DOCS) as DocId[];
export const isDocId = (v: unknown): v is DocId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(DOCS, v);

// ─── ID number checks (no network, no OCR) ──────────────────────────────────

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Aadhaar numbers carry a Verhoeff check digit and never start with 0 or 1. */
export function isValidAadhaar(num: string): boolean {
  const d = num.replace(/\s|-/g, '');
  if (!/^[2-9]\d{11}$/.test(d)) return false;
  let c = 0;
  const rev = d.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][rev[i]]];
  return c === 0;
}

export const isValidPan = (s: string): boolean => /^[A-Z]{5}\d{4}[A-Z]$/.test(s.replace(/\s/g, '').toUpperCase());
export const isValidIfsc = (s: string): boolean => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.replace(/\s/g, '').toUpperCase());

/** Find the first candidate ID of a kind inside free text. */
export function findIdInText(kind: IdCheck, text: string): string | null {
  if (kind === 'aadhaar') {
    for (const m of text.matchAll(/(?<!\d)([2-9]\d{3})[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)/g)) {
      const n = `${m[1]}${m[2]}${m[3]}`;
      if (isValidAadhaar(n)) return n;
    }
    return null;
  }
  if (kind === 'pan') return /\b[A-Z]{5}\d{4}[A-Z]\b/.exec(text.toUpperCase())?.[0] ?? null;
  if (kind === 'ifsc') return /\b[A-Z]{4}0[A-Z0-9]{6}\b/.exec(text.toUpperCase())?.[0] ?? null;
  return null;
}

/** Loose name match: every word of the profile name (3+ letters) appears in the text. */
export function nameMatches(profileName: string, text: string): boolean {
  const hay = text.toLowerCase();
  const words = profileName.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return false;
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits >= Math.max(1, Math.ceil(words.length * 0.6));
}

/** Does the text look like this kind of paper? */
export function keywordScore(spec: DocSpec, text: string): number {
  if (!spec.keywords.length) return 0;
  const hay = text.toLowerCase();
  return spec.keywords.filter((k) => hay.includes(k.toLowerCase())).length;
}
