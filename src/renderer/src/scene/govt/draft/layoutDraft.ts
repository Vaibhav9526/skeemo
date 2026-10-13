/**
 * Where everything is on the Samadhaan floor.
 *
 * All numbers below are in SOURCE pixels (the 1600x900 picture in reference/govt-office-source.jpg).
 * `toWorld` turns them into scene units: the backdrop is cropped to SOURCE_CROP and shrunk by
 * WORLD_DIV, so a 18x32 sprite pixel is one scene unit. Keep SOURCE_CROP in step with
 * tools/build-govt-background.cjs.
 */
import type { ActorId } from '@/govt/draft/art/people';
import type { DeskId } from '@shared/govt/cases';

export const SOURCE_CROP = { x: 14, y: 6, w: 1572, h: 852 } as const;
/** Source pixels per scene unit. */
export const WORLD_DIV = 3;
/** Pixels of the built backdrop per source pixel (tools/build-govt-background.cjs SCALE). */
export const BACKDROP_SCALE = 2;

export const WORLD_W = SOURCE_CROP.w / WORLD_DIV;
export const WORLD_H = SOURCE_CROP.h / WORLD_DIV;

export interface Pt { x: number; y: number }
export const toWorld = (x: number, y: number): Pt => ({ x: (x - SOURCE_CROP.x) / WORLD_DIV, y: (y - SOURCE_CROP.y) / WORLD_DIV });
export const toWorldRect = (r: Rect): Rect => ({ x0: (r.x0 - SOURCE_CROP.x) / WORLD_DIV, y0: (r.y0 - SOURCE_CROP.y) / WORLD_DIV, x1: (r.x1 - SOURCE_CROP.x) / WORLD_DIV, y1: (r.y1 - SOURCE_CROP.y) / WORLD_DIV });

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** The five counters + reception. `seat` is where the worker's feet are (hidden behind the desk). */
export interface DeskSpec {
  id: DeskId;
  actor: ActorId;
  /** Monitor centre x, in the source picture. */
  x: number;
  seat: Pt;
  /** Where a standing visitor / the peon waits in front of the desk. */
  front: Pt;
  /** Rectangle of the desk + monitor that must be drawn OVER the seated worker. */
  occlude: Rect[];
  /** Click / hover area. */
  hit: Rect;
  /** Sign board for the highlight. */
  sign: Rect;
}

const deskRow = (id: DeskId, x: number, l: number, r: number, signBox: Rect): DeskSpec => ({
  id, actor: id as ActorId, x,
  seat: { x, y: 349 }, front: { x, y: 462 },
  occlude: [
    { x0: x - 42, y0: 303, x1: x + 42, y1: 346 },       // the monitor
    { x0: l - 6, y0: 322, x1: r + 6, y1: 442 },          // desk top + front + side panels
  ],
  hit: { x0: l - 6, y0: 245, x1: r + 6, y1: 442 },
  sign: signBox,
});

export const DESKS: Record<DeskId, DeskSpec> = {
  registration: deskRow('registration', 264, 148, 375, { x0: 190, y0: 217, x1: 348, y1: 271 }),
  documents: deskRow('documents', 543, 438, 648, { x0: 470, y0: 216, x1: 629, y1: 272 }),
  eligibility: deskRow('eligibility', 810, 710, 912, { x0: 729, y0: 217, x1: 888, y1: 271 }),
  form: deskRow('form', 1075, 977, 1177, { x0: 991, y0: 216, x1: 1151, y1: 272 }),
  help: deskRow('help', 1337, 1228, 1448, { x0: 1248, y0: 218, x1: 1408, y1: 272 }),
  reception: {
    id: 'reception', actor: 'reception', x: 798,
    seat: { x: 798, y: 650 }, front: { x: 800, y: 752 },
    occlude: [
      { x0: 762, y0: 603, x1: 836, y1: 662 },
      { x0: 668, y0: 622, x1: 937, y1: 726 },
    ],
    hit: { x0: 650, y0: 560, x1: 957, y1: 726 },
    sign: { x0: 732, y0: 676, x1: 875, y1: 709 },
  },
};

export const DESK_ORDER: readonly DeskId[] = ['reception', 'registration', 'documents', 'eligibility', 'form', 'help'];

/** The peon's post, beside the reception counter. */
export const PEON_HOME: Pt = { x: 560, y: 655 };
/** Where a new visitor appears: the foot of the entrance stairs. */
export const ENTRANCE: Pt = { x: 800, y: 846 };

// ─── walking ────────────────────────────────────────────────────────────────

export const CELL = 10;

/** Feet may stand anywhere inside one of these … */
export const WALKABLE: Rect[] = [
  { x0: 40, y0: 205, x1: 1565, y1: 736 },    // the hall
  { x0: 678, y0: 726, x1: 926, y1: 852 },    // the entrance stairs channel
  { x0: 520, y0: 746, x1: 690, y1: 770 },    // the gap beside the reception rail
];

/** … except inside one of these. */
export const BLOCKED: Rect[] = [
  ...(['registration', 'documents', 'eligibility', 'form', 'help'] as const).map((id): Rect => {
    const d = DESKS[id];
    return { x0: d.hit.x0 - 8, y0: 272, x1: d.hit.x1 + 8, y1: 444 };
  }),
  { x0: 275, y0: 478, x1: 540, y1: 588 }, { x0: 673, y0: 478, x1: 940, y1: 588 }, { x0: 1067, y0: 478, x1: 1330, y1: 588 },
  { x0: 640, y0: 590, x1: 964, y1: 726 },
  { x0: 28, y0: 175, x1: 84, y1: 292 }, { x0: 24, y0: 552, x1: 94, y1: 668 }, { x0: 1506, y0: 552, x1: 1582, y1: 668 },
  { x0: 594, y0: 646, x1: 652, y1: 742 }, { x0: 960, y0: 646, x1: 1020, y1: 742 },
];

export const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
export const isWalkable = (x: number, y: number): boolean => WALKABLE.some((r) => inRect(r, x, y)) && !BLOCKED.some((r) => inRect(r, x, y));

interface Cell { cx: number; cy: number }
const COLS = Math.ceil(1600 / CELL);
const ROWS = Math.ceil(900 / CELL);
const cellOf = (p: Pt): Cell => ({ cx: Math.round(p.x / CELL), cy: Math.round(p.y / CELL) });
const centre = (c: Cell): Pt => ({ x: c.cx * CELL, y: c.cy * CELL });
const okCell = (c: Cell) => c.cx >= 0 && c.cy >= 0 && c.cx < COLS && c.cy < ROWS && isWalkable(c.cx * CELL, c.cy * CELL);

function nearestWalkable(p: Pt): Cell | null {
  const c = cellOf(p);
  if (okCell(c)) return c;
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const n = { cx: c.cx + dx, cy: c.cy + dy };
      if (okCell(n)) return n;
    }
  }
  return null;
}

function lineClear(a: Pt, b: Pt): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 2));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (!isWalkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/** Shortest walk between two floor points (source pixels), straightened where the way is clear. */
export function findRoute(from: Pt, to: Pt): Pt[] {
  const s = nearestWalkable(from), g = nearestWalkable(to);
  if (!s || !g) return [to];
  const key = (c: Cell) => c.cy * COLS + c.cx;
  const prev = new Map<number, Cell | null>([[key(s), null]]);
  const queue: Cell[] = [s];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false;
  for (let qi = 0; qi < queue.length && !found; qi++) {
    const c = queue[qi];
    for (const [dx, dy] of dirs) {
      const n = { cx: c.cx + dx, cy: c.cy + dy };
      if (!okCell(n) || prev.has(key(n))) continue;
      // no diagonal corner cutting
      if (dx && dy && (!okCell({ cx: c.cx + dx, cy: c.cy }) || !okCell({ cx: c.cx, cy: c.cy + dy }))) continue;
      prev.set(key(n), c);
      if (n.cx === g.cx && n.cy === g.cy) { found = true; break; }
      queue.push(n);
    }
  }
  if (!found) return [to];
  const cells: Cell[] = [];
  for (let c: Cell | null = g; c; c = prev.get(key(c)) ?? null) cells.unshift(c);
  const pts = cells.map(centre);
  // string-pull: keep only the corners
  const out: Pt[] = [];
  let anchor = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (!lineClear(anchor, pts[i])) { out.push(pts[i - 1]); anchor = pts[i - 1]; }
  }
  out.push(to);
  return out;
}
