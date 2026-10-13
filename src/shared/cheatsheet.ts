// @cheat-sheet — Smart Guy turns ONE JEE chapter into a one-page PDF of formulas and notes.
// Pure parsing / prompting / validation / HTML templating, shared by the composer (to
// validate the chapter before anything is sent) and the main process (which asks the model
// for structured JSON, then lays the page out locally so it always fits a single A4 sheet).

export type JeeSubject = 'Physics' | 'Chemistry' | 'Mathematics';
export interface JeeChapter { subject: JeeSubject; name: string; aliases?: string[] }

const P = (name: string, ...aliases: string[]): JeeChapter => ({ subject: 'Physics', name, aliases });
const C = (name: string, ...aliases: string[]): JeeChapter => ({ subject: 'Chemistry', name, aliases });
const M = (name: string, ...aliases: string[]): JeeChapter => ({ subject: 'Mathematics', name, aliases });

/** The JEE (Main + Advanced) syllabus, chapter by chapter. Anything else is refused. */
export const JEE_CHAPTERS: readonly JeeChapter[] = [
  P('Units and Measurements', 'dimensions', 'errors'), P('Kinematics', 'motion in a straight line', 'projectile motion', 'motion in a plane'),
  P('Laws of Motion', 'newton laws', 'friction'), P('Work, Energy and Power', 'work energy theorem'), P('Centre of Mass and Collisions', 'center of mass', 'collisions', 'momentum'),
  P('Rotational Motion', 'rotation', 'moment of inertia', 'torque'), P('Gravitation', 'gravity'), P('Properties of Solids and Liquids', 'fluid mechanics', 'elasticity', 'surface tension', 'viscosity'),
  P('Thermal Physics and Calorimetry', 'heat transfer', 'calorimetry', 'thermal expansion'), P('Thermodynamics'), P('Kinetic Theory of Gases', 'ktg'),
  P('Oscillations', 'shm', 'simple harmonic motion'), P('Waves and Sound', 'waves', 'sound waves', 'doppler effect'),
  P('Electrostatics', 'electric charges and fields', 'electric potential', 'capacitance', 'capacitors'), P('Current Electricity', 'electric current', 'kirchhoff'),
  P('Magnetic Effects of Current and Magnetism', 'magnetism', 'moving charges'), P('Electromagnetic Induction', 'emi', 'faraday', 'lenz'),
  P('Alternating Current', 'ac', 'ac circuits'), P('Electromagnetic Waves', 'em waves'), P('Ray Optics', 'optics', 'geometrical optics', 'lenses', 'mirrors'),
  P('Wave Optics', 'interference', 'diffraction', 'polarisation', 'polarization'), P('Dual Nature of Radiation and Matter', 'photoelectric effect', 'dual nature'),
  P('Atoms', 'atomic physics', 'bohr model'), P('Nuclei', 'nuclear physics', 'radioactivity'), P('Semiconductor Electronics', 'semiconductors', 'electronic devices', 'diodes'),
  P('Communication Systems', 'communication'), P('Experimental Skills', 'practical physics'),

  C('Some Basic Concepts of Chemistry', 'mole concept', 'stoichiometry'), C('Atomic Structure', 'quantum numbers'), C('Chemical Bonding and Molecular Structure', 'chemical bonding', 'vsepr'),
  C('Chemical Thermodynamics', 'thermochemistry', 'thermodynamics chemistry'), C('Chemical Equilibrium', 'equilibrium'), C('Ionic Equilibrium', 'acids and bases', 'ph'),
  C('Redox Reactions', 'redox'), C('Electrochemistry', 'galvanic cells'), C('Chemical Kinetics', 'kinetics', 'rate of reaction'), C('Solutions', 'colligative properties'),
  C('States of Matter', 'gaseous state', 'gas laws'), C('Solid State', 'crystal structure'), C('Surface Chemistry', 'adsorption', 'colloids'),
  C('Classification of Elements and Periodicity', 'periodic table', 'periodicity'), C('Hydrogen'), C('s-Block Elements', 'alkali metals', 'alkaline earth metals'),
  C('p-Block Elements', 'group 13', 'group 14', 'group 15', 'group 16', 'group 17', 'group 18'), C('d- and f-Block Elements', 'd block', 'f block', 'transition elements'),
  C('Coordination Compounds', 'coordination chemistry'), C('General Principles of Metallurgy', 'metallurgy', 'isolation of metals'), C('Environmental Chemistry'),
  C('General Organic Chemistry', 'goc', 'organic chemistry basics', 'reaction mechanism'), C('Isomerism', 'stereochemistry'), C('Hydrocarbons', 'alkanes', 'alkenes', 'alkynes', 'aromatic hydrocarbons'),
  C('Haloalkanes and Haloarenes', 'alkyl halides'), C('Alcohols, Phenols and Ethers', 'alcohols'), C('Aldehydes, Ketones and Carboxylic Acids', 'carbonyl compounds', 'aldehydes', 'ketones', 'carboxylic acids'),
  C('Amines', 'organic nitrogen compounds'), C('Biomolecules', 'carbohydrates', 'proteins'), C('Polymers'), C('Chemistry in Everyday Life'), C('Qualitative Analysis', 'salt analysis'),
  C('Practical Chemistry', 'experimental chemistry', 'titration'),

  M('Sets, Relations and Functions', 'sets', 'relations', 'functions'), M('Complex Numbers', 'complex numbers and quadratic equations'), M('Quadratic Equations', 'theory of equations'),
  M('Matrices and Determinants', 'matrices', 'determinants'), M('Permutations and Combinations', 'permutation', 'combination'), M('Binomial Theorem'), M('Sequences and Series', 'ap gp hp', 'progressions'),
  M('Limits', 'limits continuity differentiability'), M('Continuity and Differentiability', 'continuity', 'differentiability'), M('Differentiation', 'derivatives'),
  M('Applications of Derivatives', 'maxima and minima', 'tangents and normals', 'monotonicity'), M('Indefinite Integration', 'indefinite integrals', 'integration'),
  M('Definite Integration', 'definite integrals'), M('Area Under Curves', 'area under the curve', 'application of integrals'), M('Differential Equations'),
  M('Straight Lines', 'coordinate geometry'), M('Circles'), M('Parabola', 'conic sections'), M('Ellipse'), M('Hyperbola'), M('Three Dimensional Geometry', '3d geometry'),
  M('Vector Algebra', 'vectors'), M('Probability'), M('Statistics', 'mean and variance'), M('Trigonometry', 'trigonometric functions', 'trigonometric equations'),
  M('Inverse Trigonometric Functions', 'inverse trigonometry'), M('Mathematical Reasoning', 'mathematical logic'), M('Mathematical Induction'),
];

const STOP = new Set(['and', 'of', 'the', 'in', 'to', 'a', 'an', 'for', 'on', 'chapter', 'jee']);
const words = (s: string): string[] => (s.toLowerCase().replace(/&/g, ' and ').match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w));
const key = (s: string) => words(s).join(' ');

const ALIAS = /(^|[\s([{"'“‘«])@cheat-?sheet(?=$|[\s)\]}"'”’»]|[.,:!?]+(?=$|[\s)\]}"'”’»]))/gi;

export function hasCheatSheetAlias(text: string): boolean {
  if (typeof text !== 'string') return false;
  ALIAS.lastIndex = 0;
  return ALIAS.test(text);
}

/** The chapter a request names, or null when it is not on the JEE syllabus. */
export function findJeeChapter(input: string): JeeChapter | null {
  const q = key(input);
  if (!q) return null;
  const qw = new Set(q.split(' '));
  let best: { c: JeeChapter; score: number } | null = null;
  for (const c of JEE_CHAPTERS) {
    for (const label of [c.name, ...(c.aliases ?? [])]) {
      const k = key(label);
      if (!k) continue;
      let score = 0;
      if (k === q) score = 100;
      else if (` ${q} `.includes(` ${k} `) && k.length >= 4) score = 60 + k.length; // "chapter on rotational motion for jee"
      else if (` ${k} `.includes(` ${q} `) && q.length >= 4) score = 40 + q.length;
      else {
        const lw = k.split(' ');
        const hit = lw.filter((w) => qw.has(w)).length;
        const jac = hit / new Set([...lw, ...qw]).size;
        if (jac >= 0.6) score = 30 + jac * 10;
      }
      if (score > (best?.score ?? 0)) best = { c, score };
    }
  }
  return best?.c ?? null;
}

export interface CheatSheetRequest { chapter: JeeChapter; asked: string }

/** Null when the draft is not an @cheat-sheet request; throws a readable error when it is but is unusable. */
export function parseCheatSheetRequest(text: string): CheatSheetRequest | null {
  if (!hasCheatSheetAlias(text)) return null;
  const asked = text.replace(ALIAS, (_a, prefix: string) => prefix).replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!asked) throw new Error('Name a JEE chapter after @cheat-sheet, e.g. "@cheat-sheet rotational motion".');
  const chapter = findJeeChapter(asked);
  if (!chapter) {
    throw new Error(`"${asked}" isn't a JEE chapter I know. Cheat sheets are made for JEE Physics, Chemistry and Maths chapters only — try e.g. "Rotational Motion", "Chemical Kinetics" or "Definite Integration".`);
  }
  return { chapter, asked };
}

export function buildCheatSheetPrompt(c: JeeChapter): string {
  return [
    `You are an expert JEE coach. Produce a ONE-PAGE revision cheat sheet for the JEE ${c.subject} chapter "${c.name}".`,
    'Reply with ONLY one JSON object (no code fences, no commentary) of exactly this shape:',
    '{"title": string, "formulas": [{"group": string, "items": [{"name": string, "expr": string}]}], "notes": [string], "tips": [string], "constants": [string]}',
    'Rules:',
    '- Everything must fit ONE A4 page, so be dense and selective: at most 8 formula groups, 40 formulas in total, 14 notes, 6 tips, 6 constants/values.',
    '- "expr" is plain text using Unicode maths (x², v₀, √, ∫, Σ, π, θ, ω, Δ, ≈, ≤, →, ×, ·, ∝). Use "/" for fractions and parentheses for grouping. No LaTeX, no HTML, no Markdown.',
    '- Cover what JEE Main and Advanced actually test for this chapter: key definitions, all standard formulas with their conditions, special cases, units/dimensions where useful.',
    '- "notes" are one-line concepts or rules to remember. "tips" are common mistakes and exam shortcuts. "constants" may be empty if none apply.',
    '- Be factually correct. Do not invent formulas.',
  ].join('\n');
}

export interface CheatSheetData {
  title: string;
  formulas: Array<{ group: string; items: Array<{ name: string; expr: string }> }>;
  notes: string[];
  tips: string[];
  constants: string[];
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strs = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** Pull and validate the JSON object out of a model reply. Null when it is unusable. */
export function parseCheatSheetJson(raw: string): CheatSheetData | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/```(?:json)?/gi, '');
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o: unknown;
  try { o = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const formulas = (Array.isArray(r.formulas) ? r.formulas : []).slice(0, 10).map((g) => {
    const gg = (g ?? {}) as Record<string, unknown>;
    const items = (Array.isArray(gg.items) ? gg.items : []).slice(0, 14).map((i) => {
      const ii = (i ?? {}) as Record<string, unknown>;
      return { name: str(ii.name, 80), expr: str(ii.expr, 160) };
    }).filter((i) => i.expr);
    return { group: str(gg.group, 60), items };
  }).filter((g) => g.items.length);
  if (!formulas.length) return null;
  return { title: str(r.title, 80), formulas, notes: strs(r.notes, 16, 200), tips: strs(r.tips, 8, 200), constants: strs(r.constants, 8, 100) };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SUBJECT_COLOR: Record<JeeSubject, string> = { Physics: '#2f6fd6', Chemistry: '#1f9d6b', Mathematics: '#c0407a' };

/**
 * One A4 sheet. `scale` multiplies every size so the caller can shrink and re-render until the
 * PDF is a single page. Nothing here is active: escaped text, inline CSS, no script, no network.
 */
export function renderCheatSheetHtml(c: JeeChapter, d: CheatSheetData, scale = 1): string {
  const col = SUBJECT_COLOR[c.subject];
  const fs = (n: number) => `${(n * scale).toFixed(2)}px`;
  const groups = d.formulas.map((g) => `
    <section class="g"><h3>${esc(g.group)}</h3>
      ${g.items.map((i) => `<div class="f">${i.name ? `<span class="n">${esc(i.name)}</span>` : ''}<span class="e">${esc(i.expr)}</span></div>`).join('')}
    </section>`).join('');
  const list = (t: string, items: string[], cls: string) => items.length
    ? `<section class="g ${cls}"><h3>${t}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:210mm;background:#fff}
body{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#1b1b2f;padding:7mm 8mm;font-size:${fs(9)};line-height:1.28}
header{display:flex;align-items:baseline;gap:10px;border-bottom:2.5px solid ${col};padding-bottom:3px;margin-bottom:6px}
header h1{margin:0;font-size:${fs(19)};color:${col};letter-spacing:.2px}
header .s{font-size:${fs(10)};font-weight:700;color:#fff;background:${col};border-radius:4px;padding:1px 7px}
header .t{margin-left:auto;font-size:${fs(8)};color:#777}
.cols{column-count:3;column-gap:6mm}
.g{break-inside:avoid;margin:0 0 5px;border:1px solid ${col}55;border-radius:5px;padding:3px 6px 4px;background:${col}0d}
.g h3{margin:0 0 2px;font-size:${fs(9.5)};color:${col};text-transform:uppercase;letter-spacing:.6px;border-bottom:1px dashed ${col}66}
.f{display:flex;flex-direction:column;padding:1.5px 0;border-bottom:1px dotted #00000018}
.f:last-child{border-bottom:none}
.n{font-size:${fs(7.8)};color:#555}
.e{font-family:"Cambria Math","Cambria","Times New Roman",serif;font-size:${fs(10.2)};font-weight:600;color:#10102a;overflow-wrap:anywhere}
ul{margin:0;padding-left:11px}li{margin:1px 0;font-size:${fs(8.6)}}
.tips{background:#fff4d6;border-color:#e0a800}.tips h3{color:#a06d00;border-color:#e0a80088}
.consts{background:#eef2f7;border-color:#8a96a8}.consts h3{color:#44546a}
</style></head><body>
<header><h1>${esc(d.title || c.name)}</h1><span class="s">JEE ${c.subject}</span><span class="t">${esc(c.name)} · cheat sheet</span></header>
<div class="cols">${groups}${list('Key notes', d.notes, 'notes')}${list('Common mistakes &amp; tricks', d.tips, 'tips')}${list('Constants &amp; values', d.constants, 'consts')}</div>
</body></html>`;
}
