/**
 * Where everything is on the Skeemo floor. The numbers come from assets/govt/skeemo-layout.json, which
 * tools/build-skeemo-world.cjs writes while it paints the office — so the art and the coordinates can
 * never drift. One unit = one art pixel (the backdrop PNG stores each art pixel as 3x3).
 */
import type { ActorId } from '@/govt/art/people';
import type { DeskId } from '@shared/govt/cases';
import classicData from '../../assets/govt/skeemo-layout.json';
import modernData from '../../assets/govt/skeemo-modern-layout.json';

export interface Pt { x: number; y: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

type R4 = readonly number[];
export interface DeskSpec {
  id: DeskId;
  actor: ActorId;
  x: number;
  /** Where the worker's feet are (hidden behind the counter). */
  seat: Pt;
  /** Where a standing visitor / the peon waits in front of the counter. */
  front: Pt;
  hit: Rect;
  sign: Rect;
}

export const DESK_ORDER: readonly DeskId[] = ['reception', 'registration', 'documents', 'eligibility', 'form', 'help'];

export type MapStyle = 'classic' | 'modern';
type WorldData = typeof classicData;

function buildWorld(data: WorldData) {
const rect = (r: R4): Rect => ({ x0: r[0], y0: r[1], x1: r[2], y1: r[3] });

const WORLD_W: number = data.width;
const WORLD_H: number = data.height;
/** Pixels of the built PNGs per art pixel. */
const BACKDROP_SCALE: number = data.scale;


const DESKS = Object.fromEntries(
  DESK_ORDER.map((id) => {
    const d = (data.desks as Record<string, { x: number; seat: Pt; front: Pt; hit: R4; sign: R4 }>)[id];
    return [id, { id, actor: id as ActorId, x: d.x, seat: d.seat, front: d.front, hit: rect(d.hit), sign: rect(d.sign) } satisfies DeskSpec];
  }),
) as Record<DeskId, DeskSpec>;

/** The parts of the backdrop (desk fronts, monitors) drawn OVER the seated staff, sliced from skeemo-front.png. */
const FRONT_PIECES: ReadonlyArray<{ id: DeskId; rect: Rect; z: number }> =
  (data.front as Array<{ id: string; rect: R4; z: number }>).map((f) => ({ id: f.id as DeskId, rect: rect(f.rect), z: f.z }));

const PEON_HOME: Pt = data.peonHome;
const ENTRANCE: Pt = data.entrance;
const NOTICE_BOARD: { x: number; y: number; w: number; h: number } = data.noticeBoard;
const CLOCK: Pt = data.clock;

// ─── walking ────────────────────────────────────────────────────────────────

const CELL = 6;
const WALKABLE: Rect[] = (data.walkable as R4[]).map(rect);
const BLOCKED: Rect[] = (data.blocked as R4[]).map(rect);

const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
const isWalkable = (x: number, y: number): boolean => WALKABLE.some((r) => inRect(r, x, y)) && !BLOCKED.some((r) => inRect(r, x, y));

interface Cell { cx: number; cy: number }
const COLS = Math.ceil(WORLD_W / CELL) + 2;
const ROWS = Math.ceil((WORLD_H + 40) / CELL);
const cellOf = (p: Pt): Cell => ({ cx: Math.round(p.x / CELL), cy: Math.round(p.y / CELL) });
const centre = (c: Cell): Pt => ({ x: c.cx * CELL, y: c.cy * CELL });
const okCell = (c: Cell) => c.cx >= 0 && c.cy >= 0 && c.cx < COLS && c.cy < ROWS && isWalkable(c.cx * CELL, c.cy * CELL);

function nearestWalkable(p: Pt): Cell | null {
  const c = cellOf(p);
  if (okCell(c)) return c;
  for (let r = 1; r < 14; r++) {
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

/** Shortest walk between two floor points, straightened where the way is clear. */
function findRoute(from: Pt, to: Pt): Pt[] {
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
  const out: Pt[] = [];
  let anchor = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (!lineClear(anchor, pts[i])) { out.push(pts[i - 1]); anchor = pts[i - 1]; }
  }
  out.push(to);
  return out;
}

  return { WORLD_W, WORLD_H, BACKDROP_SCALE, DESKS, DESK_ORDER, FRONT_PIECES, PEON_HOME, ENTRANCE, NOTICE_BOARD, CLOCK, CELL, WALKABLE, BLOCKED, isWalkable, findRoute };
}

export type World = ReturnType<typeof buildWorld>;
export const WORLDS: Record<MapStyle, World> = { classic: buildWorld(classicData), modern: buildWorld(modernData as WorldData) };

// the classic pixel office, under the names the rest of the app (and the tests) already use
export const { WORLD_W, WORLD_H, BACKDROP_SCALE, DESKS, FRONT_PIECES, PEON_HOME, ENTRANCE, NOTICE_BOARD, CLOCK, isWalkable, findRoute } = WORLDS.classic;
