/**
 * Procedural pixel people — the citizen's profile avatar, the six counter staff and the peon.
 * Everything is drawn from a small "look" recipe onto a 20x34 pixel buffer (an 18x32 body plus a
 * one-pixel outline), so the avatar on a profile card and the sprite walking the floor are the
 * very same drawing. No image assets.
 */
import type { CitizenProfile } from '@shared/govt/profile';

export type HairStyle = 'short' | 'crop' | 'parted' | 'long' | 'bun' | 'plait' | 'bald' | 'none';
export type Outfit = 'shirt' | 'saree' | 'kurta' | 'salwar' | 'peon' | 'school' | 'farmer' | 'apron' | 'jacket';
export type Headgear = 'none' | 'turban' | 'topi' | 'cap' | 'gamchha' | 'khaki';

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  outfit: Outfit;
  /** Main garment colour (shirt / saree / kurta). */
  top: string;
  /** Trousers / pyjama / skirt colour. */
  bottom: string;
  /** Border, tie, dupatta, belt, turban … */
  accent: string;
  headgear?: Headgear;
  glasses?: boolean;
  moustache?: boolean;
  beard?: boolean;
  bindi?: boolean;
  headset?: boolean;
  lanyard?: boolean;
  /** Student bag on the back. */
  bag?: boolean;
  /** Big toothy smile and a wink — the chaprasi. */
  grin?: boolean;
}

export const PX_W = 20;
export const PX_H = 34;
const OUTLINE = '#2a1f2d';

type View = 'front' | 'back';
type Pose = 0 | 1 | 2;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(c: string, f: number): string {
  const [r, g, b] = hex(c);
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1))));
  return `#${[m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

class Px {
  readonly d = new Uint8ClampedArray(PX_W * PX_H * 4);
  /** Body coordinates: (0,0) is the body's top-left; the buffer has a 1px margin for the outline. */
  px(x: number, y: number, c: string): void {
    x += 1; y += 1;
    if (x < 0 || y < 0 || x >= PX_W || y >= PX_H) return;
    const [r, g, b] = hex(c);
    const o = (y * PX_W + x) * 4;
    this.d[o] = r; this.d[o + 1] = g; this.d[o + 2] = b; this.d[o + 3] = 255;
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  /** Dark outline around everything painted — what makes the figure read against any floor. */
  outline(): void {
    const copy = this.d.slice();
    const [r, g, b] = hex(OUTLINE);
    for (let y = 0; y < PX_H; y++) for (let x = 0; x < PX_W; x++) {
      const o = (y * PX_W + x) * 4;
      if (copy[o + 3]) continue;
      const near = (dx: number, dy: number) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < PX_W && ny < PX_H && copy[(ny * PX_W + nx) * 4 + 3] > 0;
      };
      if (near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1)) {
        this.d[o] = r; this.d[o + 1] = g; this.d[o + 2] = b; this.d[o + 3] = 255;
      }
    }
  }
}

const SHOE = '#2a2024';
const EYE = '#1d1418';

function paint(look: Look, view: View, pose: Pose, files: boolean): Px {
  const p = new Px();
  const front = view === 'front';
  const { skin, hair, top, bottom, accent } = look;
  const skinShade = shade(skin, 0.82);
  const swing = pose === 1 ? 1 : pose === 2 ? -1 : 0; // left arm offset (right arm opposite)

  // ── hair that hangs behind the shoulders ──
  if (look.hairStyle === 'long') p.rect(4, 5, 10, 15, hair);

  // ── legs / lower garment ──
  const legL = pose === 1 ? 5 : 6; // shorter leg when stepping
  const legR = pose === 2 ? 5 : 6;
  const lowerKind = look.outfit;
  const longSkirt = lowerKind === 'saree';
  if (!longSkirt) {
    const legColor = lowerKind === 'farmer' ? '#ece6d4' : bottom;
    const legW = lowerKind === 'farmer' ? 5 : 4;
    const kurtaHem = lowerKind === 'kurta' || lowerKind === 'salwar' || lowerKind === 'jacket' ? 4 : 0;
    const y0 = 24 + kurtaHem;
    p.rect(lowerKind === 'farmer' ? 4 : 5, y0, legW, Math.max(0, legL - kurtaHem), legColor);
    p.rect(lowerKind === 'farmer' ? 9 : 9, y0, legW, Math.max(0, legR - kurtaHem), legColor);
    if (lowerKind === 'farmer') p.rect(8, 25, 1, 5, shade(legColor, 0.85)); // dhoti fold
    // shoes
    p.rect(4, 24 + legL, 5, 2, SHOE);
    p.rect(9, 24 + legR, 5, 2, SHOE);
  } else {
    // saree: skirt drape to the floor, hem border, sandals peeking out
    p.rect(3, 24, 12, 6, top);
    p.rect(3, 29, 12, 1, accent);
    p.rect(5, 30, 3, 1, skin); p.rect(10, 30, 3, 1, skin);
    p.rect(5, 31, 3, 1, SHOE); p.rect(10, 31, 3, 1, SHOE);
    p.rect(4, 26, 1, 3, shade(top, 0.85)); p.rect(9, 26, 1, 4, shade(top, 0.85)); p.rect(13, 26, 1, 3, shade(top, 0.85));
  }

  // ── torso ──
  const tTop = lowerKind === 'peon' ? '#a39246' : lowerKind === 'school' ? '#f4f1ea' : top;
  p.rect(3, 14, 12, 10, tTop);
  if (lowerKind === 'kurta' || lowerKind === 'salwar' || lowerKind === 'jacket') p.rect(3, 24, 12, 4, tTop); // long hem
  if (lowerKind === 'farmer') p.rect(3, 14, 12, 10, '#efe8d6');
  // arms
  const sleeve = lowerKind === 'kurta' || lowerKind === 'salwar' || lowerKind === 'jacket' || lowerKind === 'farmer' ? 8 : 4;
  const armColor = lowerKind === 'peon' ? '#a39246' : lowerKind === 'school' ? '#f4f1ea' : lowerKind === 'farmer' ? '#efe8d6' : top;
  const drawArm = (x: number, dy: number) => {
    p.rect(x, 14 + dy, 2, sleeve, armColor);
    p.rect(x, 14 + dy + sleeve, 2, 9 - sleeve, skin);
    p.rect(x, 22 + dy, 2, 2, skin);
  };
  drawArm(1, swing);
  drawArm(15, -swing);

  switch (lowerKind) {
    case 'shirt':
      if (front) {
        p.rect(8, 15, 2, 9, shade(top, 0.86));                    // placket
        p.px(7, 14, '#fbfbf8'); p.px(10, 14, '#fbfbf8');          // collar tips
        p.rect(3, 23, 12, 1, '#2b2b33');                           // belt
        if (look.lanyard) p.rect(12, 16, 3, 3, shade(top, 0.8));   // pocket
      }
      break;
    case 'peon': {
      // khaki bush-shirt: red towel over the left shoulder, chest pocket with a pen
      for (let r = 0; r < 9; r++) p.rect(3 + Math.floor(r * 0.85), 14 + r, 4, 1, '#c0392b');
      p.rect(3, 22, 4, 5, '#c0392b'); p.rect(3, 26, 4, 1, '#8e2a2a');
      if (front) { p.rect(11, 17, 4, 4, '#8d7b3a'); p.px(12, 16, '#ffffff'); p.rect(8, 14, 2, 10, '#8d7b3a'); p.rect(3, 23, 12, 1, '#5a4a2a'); }
      break;
    }
    case 'school':
      if (front) { p.rect(8, 15, 2, 7, accent); p.px(7, 14, '#ffffff'); p.px(10, 14, '#ffffff'); p.rect(4, 14, 1, 7, '#2f2f3a'); p.rect(13, 14, 1, 7, '#2f2f3a'); }
      else if (look.bag) p.rect(4, 14, 10, 9, accent);
      break;
    case 'saree': {
      // blouse sleeves are short; the pallu drapes diagonally over the left shoulder
      for (let r = 0; r < 10; r++) p.rect(4 + Math.floor(r * 0.9), 14 + r, 4, 1, shade(top, 0.9));
      for (let r = 0; r < 10; r++) p.px(4 + Math.floor(r * 0.9), 14 + r, accent);
      p.rect(3, 23, 12, 1, accent);
      break;
    }
    case 'salwar': {
      if (front) {
        for (let r = 0; r < 10; r++) p.rect(3 + r, 14 + r, 3, 1, accent); // dupatta across the chest
        p.rect(12, 20, 3, 8, accent);                                    // its hanging end
        p.px(8, 14, skinShade); p.px(9, 14, skinShade);
      } else p.rect(3, 14, 12, 3, accent);
      break;
    }
    case 'kurta':
      if (front) { p.rect(8, 14, 2, 5, shade(top, 0.8)); p.px(8, 19, accent); p.px(8, 21, accent); }
      p.rect(3, 14, 12, 1, accent);
      break;
    case 'jacket':
      // Nehru jacket over a kurta
      p.rect(3, 14, 4, 12, accent); p.rect(11, 14, 4, 12, accent);
      if (front) { p.px(6, 17, '#d8b23a'); p.px(6, 20, '#d8b23a'); p.px(6, 23, '#d8b23a'); }
      break;
    case 'farmer':
      // gamchha (checked towel) over the shoulder
      for (let r = 0; r < 8; r++) { p.rect(3 + r, 14 + r, 2, 1, accent); p.px(3 + r, 14 + r, '#ffffff'); }
      p.rect(3, 22, 2, 5, accent);
      break;
    case 'apron':
      if (front) { p.rect(5, 16, 8, 12, '#efe7d2'); p.rect(5, 16, 8, 1, shade('#efe7d2', 0.85)); p.rect(7, 21, 4, 2, shade('#efe7d2', 0.88)); }
      break;
  }

  // ── neck + head ──
  p.rect(7, 13, 4, 2, skinShade);
  p.rect(4, 3, 10, 10, skin);
  p.rect(3, 8, 1, 2, skin); p.rect(14, 8, 1, 2, skin);       // ears
  p.rect(5, 12, 8, 1, skinShade);                            // jaw shadow

  // ── hair & headgear ──
  const hairBack = () => p.rect(4, 2, 10, 10, hair);
  if (!front) {
    if (look.hairStyle === 'bald') { p.rect(4, 5, 10, 6, hair); p.rect(5, 3, 8, 2, skin); }
    else hairBack();
    if (look.hairStyle === 'long') p.rect(4, 11, 10, 9, hair);
    if (look.hairStyle === 'plait') { p.rect(8, 11, 3, 12, hair); p.rect(8, 22, 3, 1, '#c0392b'); }
    if (look.hairStyle === 'bun') p.rect(7, 0, 4, 3, hair);
  } else {
    switch (look.hairStyle) {
      case 'short': p.rect(4, 2, 10, 3, hair); p.rect(4, 5, 1, 2, hair); p.rect(13, 5, 1, 2, hair); break;
      case 'crop': p.rect(4, 2, 10, 2, hair); p.rect(4, 4, 1, 1, hair); p.rect(13, 4, 1, 1, hair); break;
      case 'parted': p.rect(4, 2, 10, 3, hair); p.rect(4, 5, 2, 3, hair); p.rect(13, 5, 1, 2, hair); p.px(10, 3, shade(hair, 1.6)); break;
      case 'long': p.rect(4, 2, 10, 3, hair); p.rect(3, 4, 2, 15, hair); p.rect(13, 4, 2, 15, hair); p.rect(5, 4, 3, 1, hair); break;
      case 'bun': p.rect(4, 2, 10, 3, hair); p.rect(7, 0, 4, 3, hair); p.rect(4, 5, 1, 2, hair); p.rect(13, 5, 1, 2, hair); break;
      case 'plait': p.rect(4, 2, 10, 3, hair); p.rect(4, 5, 1, 3, hair); p.rect(13, 5, 1, 3, hair); p.rect(14, 6, 2, 14, hair); p.rect(14, 20, 2, 1, '#c0392b'); break;
      case 'bald': p.rect(4, 5, 1, 4, hair); p.rect(13, 5, 1, 4, hair); p.rect(5, 4, 1, 1, hair); p.rect(12, 4, 1, 1, hair); break;
      case 'none': break;
    }
  }
  const head = look.headgear ?? 'none';
  if (head === 'turban') {
    const c = look.accent === accent ? shade(accent, 1) : accent;
    p.rect(3, 0, 12, 5, c);
    p.rect(4, 0, 10, 1, shade(c, 1.25));
    for (let i = 0; i < 4; i++) p.px(4 + i * 3, 1 + (i % 2), shade(c, 0.78));
    p.rect(3, 3, 12, 1, shade(c, 0.82));
    if (!front) p.rect(3, 5, 12, 3, c);
  } else if (head === 'topi') {
    p.rect(3, 1, 12, 4, '#f7f5ee');
    p.rect(3, 1, 2, 1, '#f7f5ee'); p.rect(3, 4, 12, 1, shade('#f7f5ee', 0.8));
    p.rect(5, 0, 8, 1, '#f7f5ee');
  } else if (head === 'khaki') {
    p.rect(3, 1, 12, 4, '#a39246'); p.rect(4, 0, 10, 1, '#b8a758'); p.rect(3, 4, 12, 1, '#7d6b34');
    if (front) { p.rect(4, 5, 10, 1, '#7d6b34'); p.px(8, 2, '#d8b23a'); p.px(9, 2, '#d8b23a'); } else p.rect(3, 5, 12, 1, '#7d6b34');
  } else if (head === 'cap') {
    p.rect(4, 1, 10, 3, accent); p.rect(3, 4, 12, 1, shade(accent, 0.8)); if (front) p.rect(4, 5, 8, 1, shade(accent, 0.8));
  } else if (head === 'gamchha') {
    p.rect(3, 1, 12, 4, '#c0392b'); for (let i = 0; i < 6; i++) p.px(4 + i * 2, 2 + (i % 2), '#ffffff');
    p.rect(3, 4, 12, 1, shade('#c0392b', 0.75));
  }

  // ── face (front only) ──
  if (front) {
    const brow = look.hair === '#e6e4e0' || look.hair === '#9a9a9f' ? '#c9c7c4' : shade(hair, 1);
    p.rect(5, 7, 3, 1, brow); p.rect(10, 7, 3, 1, brow);
    p.px(6, 8, EYE);
    if (look.grin) p.rect(10, 8, 3, 1, EYE); else p.px(11, 8, EYE);   // a wink
    if (look.grin) { p.rect(6, 11, 6, 2, '#ffffff'); p.rect(5, 11, 1, 2, '#3a2e2a'); p.rect(12, 11, 1, 2, '#3a2e2a'); p.rect(6, 13, 6, 1, '#3a2e2a'); p.px(9, 12, '#d9786a'); }
    p.px(6, 9, shade(skin, 0.9)); p.px(11, 9, shade(skin, 0.9));
    p.rect(8, 10, 2, 1, skinShade);                                    // nose shadow
    if (!look.grin) p.rect(8, 11, 2, 1, '#8a3d36');                    // mouth
    if (look.bindi) p.rect(8, 6, 2, 1, '#b3262e');
    if (look.moustache) p.rect(7, 10, 4, 1, hair);
    if (look.beard) { p.rect(5, 11, 8, 2, hair); p.rect(7, 11, 4, 1, hair); p.rect(8, 11, 2, 1, '#8a3d36'); }
    if (look.glasses) {
      const f = '#3a3340';
      p.rect(5, 7, 3, 1, f); p.rect(5, 9, 3, 1, f); p.px(5, 8, f); p.px(7, 8, f);
      p.rect(10, 7, 3, 1, f); p.rect(10, 9, 3, 1, f); p.px(10, 8, f); p.px(12, 8, f);
      p.px(8, 8, f); p.px(9, 8, f);
    }
    if (look.headset) {
      const d = '#33303a';
      p.rect(4, 1, 10, 1, d); p.rect(3, 2, 1, 7, d); p.rect(14, 2, 1, 7, d);
      p.rect(2, 7, 2, 3, '#4b4856'); p.rect(14, 7, 2, 3, '#4b4856');
      p.px(3, 10, d); p.px(4, 11, d); p.px(5, 11, d); p.px(6, 11, '#8a8794');
    }
    if (look.lanyard) {
      const c = '#2b5fc2';
      p.px(6, 14, c); p.px(7, 15, c); p.px(7, 16, c); p.px(8, 17, c);
      p.px(11, 14, c); p.px(10, 15, c); p.px(10, 16, c); p.px(9, 17, c);
      p.rect(7, 18, 4, 4, '#fdfdfb'); p.rect(7, 18, 4, 1, c); p.px(8, 19, '#c9a07a'); p.rect(9, 20, 1, 1, '#9aa'); p.rect(8, 21, 2, 1, '#bbb');
    }
  } else if (look.headset) {
    p.rect(4, 1, 10, 1, '#33303a');
  }
  // earrings
  if (front && (look.hairStyle === 'long' || look.hairStyle === 'bun' || look.hairStyle === 'plait') && look.bindi) { p.px(3, 10, '#e9c46a'); p.px(14, 10, '#e9c46a'); }

  // ── a stack of case files held in front (the peon, mid-delivery) ──
  if (files) {
    p.rect(0, 17, 9, 7, '#d9c8a0'); p.rect(0, 17, 9, 1, shade('#d9c8a0', 0.8)); p.rect(1, 20, 7, 1, '#9a3b3b');
    p.rect(0, 22, 9, 2, '#b99a62'); p.rect(0, 23, 9, 1, shade('#b99a62', 0.75));
    p.rect(1, 14, 2, 3, skin); p.rect(7, 18, 2, 2, skin);
  }

  p.outline();
  return p;
}

export interface Frames { front: Uint8ClampedArray[]; back: Uint8ClampedArray[] }

/** [stand, step-left, step-right] for each direction, as raw RGBA buffers (PX_W x PX_H). */
export function frames(look: Look, carryFiles = false): Frames {
  const poses: Pose[] = [0, 1, 2];
  return {
    front: poses.map((po) => paint(look, 'front', po, carryFiles).d),
    back: poses.map((po) => paint(look, 'back', po, carryFiles).d),
  };
}

export function drawLook(ctx: CanvasRenderingContext2D, look: Look, scale: number, opts: { view?: View; bustOnly?: boolean } = {}): void {
  const buf = paint(look, opts.view ?? 'front', 0, false).d;
  const src = document.createElement('canvas');
  src.width = PX_W; src.height = PX_H;
  const sctx = src.getContext('2d')!;
  const img = sctx.createImageData(PX_W, PX_H);
  img.data.set(buf);
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const h = opts.bustOnly ? 26 : PX_H;
  ctx.drawImage(src, 0, 0, PX_W, h, 0, 0, PX_W * scale, h * scale);
}

// ─── the counter staff ──────────────────────────────────────────────────────

export type ActorId = 'reception' | 'registration' | 'documents' | 'eligibility' | 'form' | 'help' | 'peon';

export interface Actor { id: ActorId; name: string; title: string; look: Look; blurb: string }

export const ACTORS: Record<ActorId, Actor> = {
  reception: {
    id: 'reception', name: 'Sunita Verma', title: 'Reception',
    blurb: 'Welcomes you and shows every scheme on offer.',
    look: { skin: '#d6a074', hair: '#1b1416', hairStyle: 'bun', outfit: 'saree', top: '#3f6fb5', bottom: '#3f6fb5', accent: '#e9c46a', bindi: true, lanyard: false },
  },
  registration: {
    id: 'registration', name: 'Rajesh Kumar', title: 'Registration',
    blurb: 'Takes down what you need and opens your file.',
    look: { skin: '#c68a5e', hair: '#1b1416', hairStyle: 'parted', outfit: 'shirt', top: '#8fb8de', bottom: '#2f3445', accent: '#2b5fc2', moustache: true, lanyard: true },
  },
  documents: {
    id: 'documents', name: 'Anjali Deshmukh', title: 'Document Verification',
    blurb: 'Checks every paper and fits it to the upload size.',
    look: { skin: '#e0ac7e', hair: '#2d1d17', hairStyle: 'plait', outfit: 'salwar', top: '#6a9c78', bottom: '#f1ede2', accent: '#e8c15a', glasses: true, bindi: true, lanyard: true },
  },
  eligibility: {
    id: 'eligibility', name: 'Suresh Iyer', title: 'Eligibility Check',
    blurb: 'Tells you straight whether you qualify, and why.',
    look: { skin: '#a8693f', hair: '#9a9a9f', hairStyle: 'bald', outfit: 'shirt', top: '#f2f1ec', bottom: '#4a4a52', accent: '#8a6d3b', glasses: true, moustache: true, lanyard: true },
  },
  form: {
    id: 'form', name: 'Harpreet Singh', title: 'Form Submission',
    blurb: 'Starts SuperJargon and guides you through the form.',
    look: { skin: '#c68a5e', hair: '#1b1416', hairStyle: 'none', outfit: 'shirt', top: '#e9e4d6', bottom: '#2d3a55', accent: '#27407a', headgear: 'turban', beard: true, lanyard: true },
  },
  help: {
    id: 'help', name: 'Kavita Reddy', title: 'Help & Support',
    blurb: 'Answers your questions — straight, in your language.',
    look: { skin: '#8a5030', hair: '#1b1416', hairStyle: 'long', outfit: 'kurta', top: '#5aa6a3', bottom: '#2f3d4f', accent: '#d8a74a', headset: true, bindi: true, lanyard: false },
  },
  peon: {
    id: 'peon', name: 'Ramu Kaka', title: 'Chaprasi',
    blurb: 'Carries your file from counter to counter.',
    look: { skin: '#c58a5b', hair: '#1b1416', hairStyle: 'short', outfit: 'peon', top: '#a39246', bottom: '#8d7b3a', accent: '#c0392b', headgear: 'khaki', moustache: true, grin: true },
  },
};

// ─── the citizen ────────────────────────────────────────────────────────────

const SKINS = ['#f1c79d', '#e0ac7e', '#cf9566', '#b87b4f', '#9a6238', '#7c4a2b'];
const MALE_SHIRTS = ['#6f9fd1', '#7bb08a', '#c7a35a', '#9c82c4', '#d1766b', '#5f87a8'];
const FEMALE_SAREES = ['#c2456b', '#d9822b', '#2f8f83', '#7a4aa8', '#2f6fb2', '#c9a227', '#b5352f'];
const TURBAN_STATES = ['Punjab', 'Haryana', 'Rajasthan'];
const SALWAR_STATES = ['Punjab', 'Haryana', 'Delhi', 'Chandigarh', 'Uttar Pradesh', 'Jammu and Kashmir', 'Himachal Pradesh', 'Uttarakhand', 'Bihar', 'Madhya Pradesh'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A deterministic pixel look for a citizen: attire follows occupation and state, the rest follows the name. */
export function lookFor(p: Pick<CitizenProfile, 'name' | 'age' | 'gender' | 'occupation' | 'state' | 'look'>): Look {
  const r = rng(hash(`${p.name}|${p.look.seed}`));
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const female = p.gender === 'female';
  const male = p.gender === 'male';
  const old = p.age >= 58;
  const mid = p.age >= 42;
  const skin = pick(SKINS);
  const hair = old ? pick(['#e6e4e0', '#9a9a9f', '#cfcdca']) : mid && r() < 0.35 ? '#6e6a68' : pick(['#1b1416', '#1b1416', '#2d1d17']);
  const look: Look = { skin, hair, hairStyle: 'short', outfit: 'shirt', top: pick(MALE_SHIRTS), bottom: pick(['#2f3445', '#3b3f4a', '#4a4237']), accent: pick(['#c0392b', '#2b5fc2', '#d8a74a']) };

  if (female) {
    look.hairStyle = old ? 'bun' : pick<HairStyle>(['long', 'plait', 'bun', 'long']);
    look.bindi = r() < 0.65;
    if (p.occupation === 'student') look.hairStyle = pick<HairStyle>(['plait', 'long']);
  } else if (male) {
    look.hairStyle = old ? (r() < 0.5 ? 'bald' : 'crop') : pick<HairStyle>(['short', 'crop', 'parted']);
    look.moustache = r() < 0.45;
    look.beard = !old && r() < 0.12;
    look.glasses = mid && r() < 0.5;
  } else {
    look.hairStyle = pick<HairStyle>(['crop', 'long', 'short']);
    look.glasses = r() < 0.3;
  }
  if (old && female) look.glasses = r() < 0.5;

  const saree = (): void => {
    look.outfit = 'saree';
    const bengal = p.state === 'West Bengal', kerala = p.state === 'Kerala';
    look.top = bengal ? '#f4efe6' : kerala ? '#f1e9d2' : pick(FEMALE_SAREES);
    look.accent = bengal ? '#c0392b' : kerala ? '#c9a227' : pick(['#e9c46a', '#f4efe6', '#c0392b']);
  };
  const salwar = (): void => { look.outfit = 'salwar'; look.top = pick(['#5aa6a3', '#c2456b', '#7a4aa8', '#d9822b', '#4f7fbf']); look.bottom = pick(['#f1ede2', '#3b3f4a', look.top]); look.accent = pick(['#e8c15a', '#f4efe6', '#c0392b']); };
  const northern = SALWAR_STATES.includes(p.state);

  switch (p.occupation) {
    case 'farmer':
    case 'farm_labourer':
      if (female) saree(); else { look.outfit = 'farmer'; look.accent = '#c0392b'; look.headgear = TURBAN_STATES.includes(p.state) ? 'turban' : p.occupation === 'farm_labourer' ? 'gamchha' : 'none'; if (look.headgear === 'turban') look.accent = pick(['#d9822b', '#c0392b', '#2f6fb2']); }
      break;
    case 'student':
      look.outfit = 'school'; look.top = '#f4f1ea'; look.bottom = '#2d3a55'; look.accent = '#b5352f'; look.bag = true; look.moustache = false; look.beard = false;
      if (female && northern) { salwar(); look.bag = true; }
      break;
    case 'homemaker':
      if (female) (northern ? salwar : saree)(); else { look.outfit = 'kurta'; look.top = pick(['#e9e4d6', '#8fb8de', '#c7a35a']); look.bottom = '#f1ede2'; look.accent = '#c9a227'; }
      break;
    case 'daily_wage':
      if (female) saree(); else { look.outfit = 'shirt'; look.top = pick(['#7a8f5a', '#a87a52', '#5f7f9c']); look.bottom = '#4a4237'; look.headgear = 'gamchha'; }
      break;
    case 'street_vendor':
      look.outfit = 'apron'; look.top = pick(MALE_SHIRTS); look.bottom = '#4a4237'; look.headgear = male ? 'cap' : 'none'; look.accent = '#c0392b';
      if (female) { look.top = pick(FEMALE_SAREES); look.bottom = '#3b3f4a'; }
      break;
    case 'artisan':
      if (female) saree(); else { look.outfit = 'kurta'; look.top = pick(['#c7a35a', '#9c7a52', '#7aa07a']); look.bottom = '#f1ede2'; look.accent = '#c0392b'; }
      break;
    case 'retired':
      if (female) saree(); else { look.outfit = 'jacket'; look.top = '#efe8d6'; look.bottom = '#f1ede2'; look.accent = pick(['#3b4a6b', '#6b5a3b']); look.glasses = true; }
      break;
    case 'private_job':
    case 'govt_job':
      look.lanyard = true;
      if (female) (northern ? salwar : saree)(); else { look.outfit = 'shirt'; look.top = pick(['#f2f1ec', '#8fb8de', '#b9d3e6']); look.bottom = '#2f3445'; }
      break;
    case 'self_employed':
      if (female) (northern ? salwar : saree)(); else { look.outfit = 'shirt'; look.top = pick(MALE_SHIRTS); }
      break;
    default:
      if (female) (northern ? salwar : saree)(); else { look.outfit = 'shirt'; }
  }
  return look;
}
