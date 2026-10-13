import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
// PixiJS uses new Function() internally, blocked by the app's CSP — this patches it.
import 'pixi.js/unsafe-eval';
import classicBg from '@/assets/govt/skeemo-office.png?url';
import classicFront from '@/assets/govt/skeemo-front.png?url';
import modernBg from '@/assets/govt/skeemo-modern.jpg?url';
import modernFront from '@/assets/govt/skeemo-modern-front.png?url';
import { ACTORS, frames, PX_H, PX_W, type ActorId, type Look } from '@/govt/art/people';
import { Camera } from '../office/Camera';
import { subscribeFloor, type FloorCommand } from './floorBus';
import { WORLDS, type MapStyle, type Pt } from './layout';
import type { DeskId } from '@shared/govt/cases';

const WALK_SPEED = 46; // art pixels per second
const FONT = 'Inter, "Nirmala UI", "Segoe UI", sans-serif';

/** One card pinned on the wall notice board (text already in the citizen's language). */
export interface BoardNote { id: string; title: string; badge: string; tone: 'closing' | 'trending' }

interface Props {
  look: Look;
  citizenName: string;
  /** The counter the citizen is standing at when the floor opens. */
  desk: DeskId;
  style: MapStyle;
  notes: BoardNote[];
  emptyNote: string;
  /** The citizen has walked up to a counter (after clicking it). */
  onArrive: (d: DeskId) => void;
  onNote: (schemeId: string) => void;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('floor art failed to load'));
    img.src = url;
  });
}

function bufToTexture(buf: Uint8ClampedArray): Texture {
  const c = document.createElement('canvas');
  c.width = PX_W; c.height = PX_H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(PX_W, PX_H);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

interface FrameSet { front: Texture[]; back: Texture[] }
const makeFrames = (look: Look, carry = false): FrameSet => {
  const f = frames(look, carry);
  return { front: f.front.map(bufToTexture), back: f.back.map(bufToTexture) };
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const FEET_ANCHOR_Y = (PX_H - 1) / PX_H;

/** Something that stands on the floor and can walk a route. */
class Walker {
  readonly sprite = new Sprite();
  pos: Pt;
  private route: Pt[] = [];
  private resolve: (() => void) | null = null;
  private clock = 0;
  private dir: 'front' | 'back' = 'front';
  moving = false;
  constructor(private frameSet: FrameSet, start: Pt, parent: Container, private route_: (a: Pt, b: Pt) => Pt[]) {
    this.pos = { ...start };
    this.sprite.anchor.set(0.5, FEET_ANCHOR_Y);
    this.sprite.texture = frameSet.front[0];
    parent.addChild(this.sprite);
    this.place();
  }
  setFrames(fs: FrameSet): void { this.frameSet = fs; this.draw(0); }
  private place(): void {
    this.sprite.position.set(Math.round(this.pos.x), Math.round(this.pos.y));
    this.sprite.zIndex = this.pos.y;
  }
  private draw(step: 0 | 1 | 2): void { this.sprite.texture = this.frameSet[this.dir][step]; }
  teleport(p: Pt): void { this.pos = { ...p }; this.route = []; this.moving = false; this.place(); this.draw(0); }
  face(dir: 'front' | 'back'): void { this.dir = dir; this.draw(0); }
  go(to: Pt): Promise<void> {
    this.resolve?.();
    this.route = this.route_(this.pos, to);
    this.moving = this.route.length > 0;
    return new Promise((res) => { this.resolve = res; if (!this.moving) { this.face('front'); res(); this.resolve = null; } });
  }
  update(dt: number): void {
    if (!this.moving) return;
    let budget = WALK_SPEED * dt;
    while (budget > 0 && this.route.length) {
      const t = this.route[0];
      const dx = t.x - this.pos.x, dy = t.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dy) > Math.abs(dx) * 0.6 || Math.abs(dx) < 1) this.dir = dy < 0 ? 'back' : 'front'; else this.dir = 'front';
      if (d <= budget) { this.pos = { ...t }; this.route.shift(); budget -= d; } else { this.pos = { x: this.pos.x + (dx / d) * budget, y: this.pos.y + (dy / d) * budget }; budget = 0; }
    }
    this.clock += dt;
    this.draw(([0, 1, 0, 2] as const)[Math.floor(this.clock * 7) % 4]);
    this.place();
    if (!this.route.length) { this.moving = false; this.draw(0); const r = this.resolve; this.resolve = null; r?.(); }
  }
}

/** A speech bubble that follows a sprite for a while. */
function makeBubble(layer: Container, follow: () => Pt, text: string, ms: number): () => void {
  const c = new Container();
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: 5.5, fill: 0x1e2420, wordWrap: true, wordWrapWidth: 64, align: 'center', lineHeight: 7 }, resolution: 4 });
  t.anchor.set(0.5, 1);
  const w = t.width + 8, h = t.height + 6;
  const g = new Graphics();
  g.roundRect(-w / 2, -h - 2, w, h, 3).fill(0xffffff).stroke({ width: 0.6, color: 0x2a1f2d });
  g.poly([-2, -2, 2, -2, 0, 2]).fill(0xffffff);
  t.position.set(0, -5);
  c.addChild(g, t);
  c.zIndex = 99999;
  layer.addChild(c);
  let alive = true;
  const place = () => { const p = follow(); c.position.set(p.x, p.y - 35); };
  place();
  const tick = setInterval(() => { if (alive) place(); }, 33);
  const stop = () => { if (!alive) return; alive = false; clearInterval(tick); c.destroy({ children: true }); };
  setTimeout(stop, ms);
  return stop;
}

const PAPER = [0xfff6c9, 0xdcf0e4, 0xfde0d3, 0xdde8f7];

export function GovtFloor({ look, citizenName, desk, style, notes, emptyNote, onArrive, onNote }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onDeskRef = useRef(onArrive);
  const onNoteRef = useRef(onNote);
  const sceneRef = useRef<{ setLook: (l: Look) => void; setNotes: (n: BoardNote[], empty: string) => void } | null>(null);
  const initial = useRef({ desk, notes, emptyNote });
  onDeskRef.current = onArrive;
  onNoteRef.current = onNote;

  useEffect(() => { sceneRef.current?.setLook(look); }, [look]);
  useEffect(() => { sceneRef.current?.setNotes(notes, emptyNote); }, [notes, emptyNote]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    const W = WORLDS[style];
    const { WORLD_W, WORLD_H, BACKDROP_SCALE, DESKS, DESK_ORDER, ENTRANCE, FRONT_PIECES, NOTICE_BOARD, PEON_HOME, findRoute } = W;
    const urls = style === 'modern' ? { bg: modernBg, front: modernFront } : { bg: classicBg, front: classicFront };
    const cleanups: Array<() => void> = [];

    const init = async () => {
      await app.init({
        background: 0x1d2a25, antialias: false, roundPixels: false,
        resolution: Math.max(window.devicePixelRatio || 1, 2), autoDensity: true,
        width: host.clientWidth || 800, height: host.clientHeight || 600,
      });
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const [bgImg, frontImg] = await Promise.all([loadImage(urls.bg), loadImage(urls.front)]);
      if (disposed) return;
      const bg = Texture.from(bgImg);
      bg.source.scaleMode = 'linear';
      bg.source.autoGenerateMipmaps = true;
      const fgTex = Texture.from(frontImg);
      fgTex.source.scaleMode = 'linear';
      fgTex.source.autoGenerateMipmaps = true;

      const world = new Container();
      app.stage.addChild(world);
      const clip = new Graphics().rect(0, 0, WORLD_W, WORLD_H).fill(0xffffff);   // nothing is drawn outside the room
      world.addChild(clip);
      world.mask = clip;
      const back = new Sprite(bg);
      back.scale.set(WORLD_W / bg.width, WORLD_H / bg.height);
      world.addChild(back);

      const overlay = new Graphics();
      const actors = new Container();
      actors.sortableChildren = true;
      const board = new Container();
      world.addChild(overlay, board, actors);

      const camera = new Camera(world);
      camera.setMapSize(WORLD_W, WORLD_H);
      camera.setViewSize(app.screen.width, app.screen.height);
      let zoomMul = 1.3;                       // how far in the camera sits, relative to "whole room in view"
      const fitZoom = () => Math.min(app.screen.width / WORLD_W, app.screen.height / WORLD_H);
      const aim = () => { const p = citizen.sprite.visible ? citizen.pos : { x: WORLD_W / 2, y: WORLD_H / 2 }; camera.focusOn(p.x, p.y - 12, fitZoom() * zoomMul); };

      // ── seated staff; desk fronts and monitors are drawn over them ──
      const seated = new Map<ActorId, { sprite: Sprite; frames: FrameSet; busy: boolean }>();
      for (const id of DESK_ORDER) {
        const d = DESKS[id];
        const fs = makeFrames(ACTORS[d.actor].look);
        const s = new Sprite(fs.front[0]);
        s.anchor.set(0.5, FEET_ANCHOR_Y);
        s.position.set(d.seat.x, d.seat.y);
        s.zIndex = d.seat.y;
        actors.addChild(s);
        seated.set(d.actor, { sprite: s, frames: fs, busy: false });
      }
      for (const piece of FRONT_PIECES) {
        const r = piece.rect;
        const tex = new Texture({
          source: fgTex.source,
          frame: new Rectangle(r.x0 * BACKDROP_SCALE, r.y0 * BACKDROP_SCALE, (r.x1 - r.x0) * BACKDROP_SCALE, (r.y1 - r.y0) * BACKDROP_SCALE),
        });
        const o = new Sprite(tex);
        o.position.set(r.x0, r.y0);
        o.scale.set(1 / BACKDROP_SCALE);
        o.zIndex = piece.z;
        actors.addChild(o);
      }

      // ── the peon and the citizen walk ──
      const peon = new Walker(makeFrames(ACTORS.peon.look), PEON_HOME, actors, findRoute);
      const peonCarry = makeFrames(ACTORS.peon.look, true);
      const peonFree = makeFrames(ACTORS.peon.look);
      peon.face('front');
      const citizen = new Walker(makeFrames(look), ENTRANCE, actors, findRoute);
      citizen.sprite.visible = false;
      const nameTag = new Text({ text: citizenName, style: { fontFamily: FONT, fontSize: 5, fill: 0xffffff, stroke: { color: 0x1e2420, width: 1.6 }, fontWeight: '700' }, resolution: 4 });
      nameTag.anchor.set(0.5, 0);
      nameTag.zIndex = 99998;
      nameTag.visible = false;
      actors.addChild(nameTag);

      const say = (who: 'peon' | 'citizen' | ActorId, text: string, ms = 3200) => {
        if (who === 'peon') return makeBubble(actors, () => peon.pos, text, ms);
        if (who === 'citizen') return makeBubble(actors, () => citizen.pos, text, ms);
        const d = DESKS[DESK_ORDER.find((k) => DESKS[k].actor === who) ?? 'reception'];
        return makeBubble(actors, () => ({ x: d.seat.x, y: d.seat.y - 6 }), text, ms);
      };

      // ── notice board ──
      const drawBoard = (items: BoardNote[], empty: string) => {
        board.removeChildren().forEach((c) => c.destroy({ children: true }));
        const nb = NOTICE_BOARD;
        const n = Math.min(4, items.length);
        if (!n) {
          const t = new Text({ text: empty, style: { fontFamily: FONT, fontSize: 6.5, fill: 0x4a3b24, wordWrap: true, wordWrapWidth: nb.w - 40, align: 'center' }, resolution: 4 });
          t.anchor.set(0.5); t.position.set(nb.x + nb.w / 2, nb.y + nb.h / 2);
          board.addChild(t);
          return;
        }
        const gap = Math.max(2, nb.w * 0.02);
        const cw = Math.min(54, (nb.w - 8 - (n - 1) * gap) / n), ch = Math.min(60, nb.h - 6);
        const fs = cw / 8.4;
        const total = n * cw + (n - 1) * gap;
        const x0 = nb.x + (nb.w - total) / 2;
        items.slice(0, 4).forEach((note, i) => {
          const card = new Container();
          card.position.set(Math.round(x0 + i * (cw + gap) + cw / 2), nb.y + 2 + ch / 2);
          card.rotation = (i % 2 ? 1 : -1) * (0.018 + (i % 3) * 0.01);
          const g = new Graphics();
          g.rect(-cw / 2 + 1, -ch / 2 + 2, cw, ch).fill({ color: 0x000000, alpha: 0.18 });
          g.rect(-cw / 2, -ch / 2, cw, ch).fill(PAPER[i % PAPER.length]);
          g.rect(-cw / 2, ch / 2 - ch * 0.24, cw, ch * 0.24).fill({ color: note.tone === 'closing' ? 0xc0392b : 0x2e6b57, alpha: 0.95 });
          g.circle(0, -ch / 2 + 1, Math.max(1.6, cw * 0.05)).fill(0xc0392b);
          const title = new Text({ text: note.title, style: { fontFamily: FONT, fontSize: fs, fill: 0x1e2420, fontWeight: '700', wordWrap: true, wordWrapWidth: cw - cw * 0.14, lineHeight: fs * 1.18 }, resolution: 4 });
          title.position.set(-cw / 2 + cw * 0.07, -ch / 2 + ch * 0.09);
          const badge = new Text({ text: note.badge, style: { fontFamily: FONT, fontSize: fs, fill: 0xffffff, fontWeight: '800', wordWrap: true, wordWrapWidth: cw - cw * 0.12, align: 'center' }, resolution: 4 });
          badge.anchor.set(0.5); badge.position.set(0, ch / 2 - ch * 0.12);
          if (title.height > ch * 0.62) title.scale.set((ch * 0.62) / title.height);
          card.addChild(g, title, badge);
          card.eventMode = 'static'; card.cursor = 'pointer';
          card.on('pointertap', () => onNoteRef.current(note.id));
          card.on('pointerover', () => card.scale.set(1.06));
          card.on('pointerout', () => card.scale.set(1));
          board.addChild(card);
        });
      };

      // ── clicks and highlights ──
      let hovered: DeskId | null = null;
      const drawOverlay = () => {
        overlay.clear();
        if (!hovered) return;
        const d = DESKS[hovered];
        overlay.roundRect(d.sign.x0 - 2, d.sign.y0 - 2, d.sign.x1 - d.sign.x0 + 4, d.sign.y1 - d.sign.y0 + 4, 2).stroke({ width: 1, color: 0xffd37a });
        overlay.roundRect(d.hit.x0, d.hit.y0 + 20, d.hit.x1 - d.hit.x0, d.hit.y1 - d.hit.y0 - 20, 4).fill({ color: 0xffd37a, alpha: 0.1 });
      };
      for (const id of DESK_ORDER) {
        const d = DESKS[id];
        const area = new Graphics();
        area.rect(d.hit.x0, d.hit.y0, d.hit.x1 - d.hit.x0, d.hit.y1 - d.hit.y0).fill({ color: 0xffffff, alpha: 0.001 });
        area.eventMode = 'static';
        area.cursor = 'pointer';
        area.on('pointerover', () => { hovered = id; drawOverlay(); });
        area.on('pointerout', () => { if (hovered === id) hovered = null; drawOverlay(); });
        area.on('pointertap', () => { citizen.sprite.visible = true; nameTag.visible = true; void citizen.go(DESKS[id].front).then(() => { citizen.face('back'); setTimeout(() => onDeskRef.current(id), 350); }); });
        world.addChild(area);
      }
      world.sortableChildren = true;
      board.zIndex = 1; overlay.zIndex = 1; actors.zIndex = 2;
      peon.sprite.eventMode = 'static';
      peon.sprite.cursor = 'pointer';
      peon.sprite.on('pointertap', () => say('peon', ['Ji, sahab?', 'File chahiye? Abhi laata hoon.', 'Chai ke baad… file pehle!'][Math.floor(Math.random() * 3)]));

      sceneRef.current = { setLook: (l) => citizen.setFrames(makeFrames(l)), setNotes: drawBoard };
      drawBoard(initial.current.notes, initial.current.emptyNote);

      // ── the peon's errands ──
      type Job = { from: DeskId | 'citizen'; to: DeskId; label?: string };
      const jobs: Job[] = [];
      let busyPeon = false;
      let idleFor = 0;
      const standAt = (id: DeskId | 'citizen'): Pt => (id === 'citizen' ? { x: citizen.pos.x + 20, y: citizen.pos.y } : { x: DESKS[id].front.x + 30, y: DESKS[id].front.y });
      const runJobs = async () => {
        if (busyPeon) return;
        busyPeon = true;
        while (jobs.length && !disposed) {
          const j = jobs.shift()!;
          await peon.go(standAt(j.from));
          if (disposed) return;
          peon.face(j.from === 'citizen' ? 'front' : 'back');
          say('peon', j.from === 'citizen' ? 'File dijiye, sahab.' : 'Yeh file le jaa raha hoon.', 1800);
          await sleep(700);
          peon.setFrames(peonCarry);
          await peon.go(standAt(j.to));
          if (disposed) return;
          peon.face('back');
          say(DESKS[j.to].actor, 'File received.', 1800);
          await sleep(900);
          peon.setFrames(peonFree);
        }
        if (!disposed) { await peon.go(PEON_HOME); peon.face('front'); }
        busyPeon = false;
        idleFor = 0;
      };
      const patrolLines = ['Files check kar raha hoon…', 'Sab theek hai.', 'Chai peeni hai, par kaam pehle.'];
      const patrol = async () => {
        if (busyPeon) return;
        busyPeon = true;
        const id = DESK_ORDER[1 + Math.floor(Math.random() * 5)];
        await peon.go({ x: DESKS[id].front.x + 52, y: DESKS[id].front.y });
        if (!disposed && !jobs.length) { peon.face('back'); say('peon', patrolLines[Math.floor(Math.random() * patrolLines.length)], 2400); await sleep(2400); }
        if (!disposed) { await peon.go(PEON_HOME); peon.face('front'); }
        busyPeon = false;
        idleFor = 0;
        if (jobs.length) void runJobs();
      };

      aim(); camera.snap();
      const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomMul = Math.max(1, Math.min(3.2, zoomMul * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); };
      host.addEventListener('wheel', onWheel, { passive: false });
      cleanups.push(() => host.removeEventListener('wheel', onWheel));

      // ── commands from the app ──
      const onCommand = (c: FloorCommand) => {
        switch (c.type) {
          case 'file': jobs.push({ from: c.from, to: c.to, label: c.label }); void runJobs(); break;
          case 'walk': citizen.sprite.visible = true; nameTag.visible = true; void citizen.go(DESKS[c.to].front).then(() => citizen.face('back')); break;
          case 'say': say(c.actor, c.text, c.ms ?? 3600); break;
          case 'busy': { const s = seated.get(c.actor); if (s) s.busy = c.on; break; }
          case 'arrive':
            citizen.teleport(ENTRANCE); citizen.sprite.visible = true; nameTag.visible = true;
            void citizen.go(DESKS.reception.front).then(() => citizen.face('back'));
            break;
          case 'focus': break;
        }
      };
      cleanups.push(subscribeFloor(onCommand));
      // opening the floor mid-journey: stand where the citizen was, otherwise walk in from the door
      const start = initial.current.desk;
      if (start === 'reception') onCommand({ type: 'arrive' });
      else { citizen.teleport(DESKS[start].front); citizen.sprite.visible = true; nameTag.visible = true; citizen.face('back'); }

      // ── frame loop ──
      let t = 0;
      app.ticker.add((tk) => {
        const dt = Math.min(tk.deltaMS / 1000, 0.05);
        t += dt;
        peon.update(dt);
        citizen.update(dt);
        nameTag.position.set(Math.round(citizen.pos.x), Math.round(citizen.pos.y) + 1);
        for (const s of seated.values()) {
          if (s.busy) s.sprite.texture = s.frames.front[Math.floor(t * 7) % 2 === 0 ? 1 : 2];
          else s.sprite.texture = s.frames.front[0];
        }
        if (!busyPeon && !jobs.length) { idleFor += dt; if (idleFor > 22) { idleFor = 0; void patrol(); } }
        aim();
        camera.update(dt);
      });

      const onVis = () => { if (document.hidden) app.ticker.stop(); else app.ticker.start(); };
      document.addEventListener('visibilitychange', onVis);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

      const ro = new ResizeObserver(() => {
        const w = host.clientWidth, h = host.clientHeight;
        if (w < 10 || h < 10) return;
        app.renderer.resize(w, h);
        camera.setViewSize(w, h);
        aim();
        camera.snap();
      });
      ro.observe(host);
      cleanups.push(() => ro.disconnect());
    };
    void init();

    return () => {
      disposed = true;
      sceneRef.current = null;
      cleanups.forEach((fn) => fn());
      try { app.destroy(true, { children: true, texture: false }); } catch { /* init never finished */ }
      while (host.firstChild) host.removeChild(host.firstChild);
    };
    // The scene is built once; look / notes changes are pushed in through sceneRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0, background: '#1d2a25' }} />;
}
