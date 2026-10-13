import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
// PixiJS uses new Function() internally, blocked by the app's CSP — this patches it.
import 'pixi.js/unsafe-eval';
import backdropUrl from '@/assets/draft/govt-office.jpg?url';
import { ACTORS, frames, PX_H, PX_W, type ActorId, type Look } from '@/govt/draft/art/people';
import { Camera } from '../../office/Camera';
import { subscribeFloor, type FloorCommand } from './floorBusDraft';
import {
  BACKDROP_SCALE, DESKS, DESK_ORDER, ENTRANCE, PEON_HOME, SOURCE_CROP, WORLD_DIV, WORLD_H, WORLD_W,
  findRoute, toWorld, type Pt,
} from './layoutDraft';
import type { DeskId } from '@shared/govt/cases';

const WALK_SPEED = 120; // source pixels per second
const FONT = 'Inter, "Nirmala UI", "Segoe UI", sans-serif';

interface Props {
  look: Look;
  citizenName: string;
  desk: DeskId | null;
  onDesk: (d: DeskId) => void;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('backdrop failed to load'));
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
  constructor(private frameSet: FrameSet, start: Pt, parent: Container) {
    this.pos = { ...start };
    this.sprite.anchor.set(0.5, FEET_ANCHOR_Y);
    this.sprite.texture = frameSet.front[0];
    parent.addChild(this.sprite);
    this.place();
  }
  setFrames(fs: FrameSet): void { this.frameSet = fs; this.draw(0); }
  private place(): void {
    const w = toWorld(this.pos.x, this.pos.y);
    this.sprite.position.set(w.x, w.y);
    this.sprite.zIndex = this.pos.y;
  }
  private draw(step: 0 | 1 | 2): void {
    this.sprite.texture = this.frameSet[this.dir][step];
  }
  teleport(p: Pt): void { this.pos = { ...p }; this.route = []; this.moving = false; this.place(); this.draw(0); }
  face(dir: 'front' | 'back'): void { this.dir = dir; this.draw(0); }
  /** Walk to `to`; resolves on arrival (or when interrupted by a newer walk). */
  go(to: Pt): Promise<void> {
    this.resolve?.();
    this.route = findRoute(this.pos, to);
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
    this.draw(([0, 1, 0, 2] as const)[Math.floor(this.clock * 8) % 4]);
    this.place();
    if (!this.route.length) { this.moving = false; this.draw(0); const r = this.resolve; this.resolve = null; r?.(); }
  }
}

/** A speech bubble that follows a sprite for a while. */
function makeBubble(layer: Container, follow: () => Pt, text: string, ms: number): () => void {
  const c = new Container();
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: 6, fill: 0x1a1320, wordWrap: true, wordWrapWidth: 74, align: 'center', lineHeight: 8 }, resolution: 4 });
  t.anchor.set(0.5, 1);
  const w = t.width + 8, h = t.height + 6;
  const g = new Graphics();
  g.roundRect(-w / 2, -h - 2, w, h, 3).fill(0xfffdf5).stroke({ width: 0.7, color: 0x2a1f2d });
  g.poly([-2, -2, 2, -2, 0, 2]).fill(0xfffdf5);
  t.position.set(0, -5);
  c.addChild(g, t);
  c.zIndex = 99999;
  layer.addChild(c);
  let alive = true;
  const place = () => { const w2 = toWorld(follow().x, follow().y); c.position.set(w2.x, w2.y - 33); };
  place();
  const tick = setInterval(() => { if (alive) place(); }, 33);
  const stop = () => { if (!alive) return; alive = false; clearInterval(tick); c.destroy({ children: true }); };
  setTimeout(stop, ms);
  return stop;
}

export function GovtFloor({ look, citizenName, desk, onDesk }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const deskRef = useRef<DeskId | null>(desk);
  const onDeskRef = useRef(onDesk);
  const sceneRef = useRef<{ focus: (d: DeskId | null) => void; setLook: (l: Look) => void } | null>(null);
  deskRef.current = desk;
  onDeskRef.current = onDesk;

  useEffect(() => { sceneRef.current?.focus(desk); }, [desk]);
  useEffect(() => { sceneRef.current?.setLook(look); }, [look]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    const cleanups: Array<() => void> = [];

    const init = async () => {
      await app.init({
        background: 0x14203f, antialias: true, roundPixels: false,
        resolution: Math.max(window.devicePixelRatio || 1, 2), autoDensity: true,
        width: host.clientWidth || 800, height: host.clientHeight || 600,
      });
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const img = await loadImage(backdropUrl);
      if (disposed) return;
      const bg = Texture.from(img);
      bg.source.scaleMode = 'linear';
      bg.source.autoGenerateMipmaps = true;

      const world = new Container();
      app.stage.addChild(world);
      const back = new Sprite(bg);
      back.scale.set(WORLD_W / bg.width, WORLD_H / bg.height);
      world.addChild(back);

      const overlay = new Graphics();           // hover / selection glow around a counter's sign
      overlay.zIndex = 0;
      const actors = new Container();
      actors.sortableChildren = true;
      world.addChild(overlay, actors);

      const camera = new Camera(world);
      camera.setMapSize(WORLD_W, WORLD_H);
      camera.setViewSize(app.screen.width, app.screen.height);
      camera.fitToScreen();

      // ── seated staff ──
      const seated = new Map<ActorId, { sprite: Sprite; frames: FrameSet; base: Pt; busy: boolean }>();
      for (const id of DESK_ORDER) {
        const d = DESKS[id];
        const fs = makeFrames(ACTORS[d.actor].look);
        const s = new Sprite(fs.front[0]);
        s.anchor.set(0.5, FEET_ANCHOR_Y);
        const w = toWorld(d.seat.x, d.seat.y);
        s.position.set(w.x, w.y);
        s.zIndex = d.seat.y;
        actors.addChild(s);
        seated.set(d.actor, { sprite: s, frames: fs, base: w, busy: false });
        // the desk and monitor are painted over the worker, so only head and shoulders show
        for (const r of d.occlude) {
          const tex = new Texture({
            source: bg.source,
            frame: new Rectangle((r.x0 - SOURCE_CROP.x) * BACKDROP_SCALE, (r.y0 - SOURCE_CROP.y) * BACKDROP_SCALE, (r.x1 - r.x0) * BACKDROP_SCALE, (r.y1 - r.y0) * BACKDROP_SCALE),
          });
          const o = new Sprite(tex);
          const wp = toWorld(r.x0, r.y0);
          o.position.set(wp.x, wp.y);
          o.scale.set((r.x1 - r.x0) / WORLD_DIV / tex.frame.width, (r.y1 - r.y0) / WORLD_DIV / tex.frame.height);
          o.zIndex = d.id === 'reception' ? 724 : 440;
          actors.addChild(o);
        }
      }

      // ── the peon and the citizen walk ──
      const peon = new Walker(makeFrames(ACTORS.peon.look), PEON_HOME, actors);
      const peonCarry = makeFrames(ACTORS.peon.look, true);
      const peonFree = makeFrames(ACTORS.peon.look);
      peon.face('front');
      const citizen = new Walker(makeFrames(look), ENTRANCE, actors);
      citizen.sprite.visible = false;
      const nameTag = new Text({ text: citizenName, style: { fontFamily: FONT, fontSize: 5.5, fill: 0xffffff, stroke: { color: 0x1a1320, width: 2 }, fontWeight: '700' }, resolution: 4 });
      nameTag.anchor.set(0.5, 0);
      nameTag.zIndex = 99998;
      nameTag.visible = false;
      actors.addChild(nameTag);

      const say = (who: 'peon' | 'citizen' | ActorId, text: string, ms = 3200) => {
        if (who === 'peon') return makeBubble(actors, () => peon.pos, text, ms);
        if (who === 'citizen') return makeBubble(actors, () => citizen.pos, text, ms);
        const d = DESKS[(DESK_ORDER.find((k) => DESKS[k].actor === who) ?? 'reception')];
        return makeBubble(actors, () => ({ x: d.seat.x, y: d.seat.y - 10 }), text, ms);
      };

      // ── clicks and highlights ──
      let hovered: DeskId | null = null;
      const drawOverlay = () => {
        overlay.clear();
        for (const id of DESK_ORDER) {
          const on = id === deskRef.current, hov = id === hovered;
          if (!on && !hov) continue;
          const s = DESKS[id].sign;
          const a = toWorld(s.x0, s.y0), b = toWorld(s.x1, s.y1);
          overlay.roundRect(a.x - 2, a.y - 2, b.x - a.x + 4, b.y - a.y + 4, 3).stroke({ width: on ? 1.6 : 1, color: on ? 0xffd37a : 0xffffff, alpha: on ? 1 : 0.85 });
          const d = DESKS[id];
          const h0 = toWorld(d.hit.x0, d.hit.y0 + 30), h1 = toWorld(d.hit.x1, d.hit.y1);
          overlay.roundRect(h0.x, h0.y, h1.x - h0.x, h1.y - h0.y, 4).fill({ color: 0xffd37a, alpha: on ? 0.12 : 0.08 });
        }
      };
      for (const id of DESK_ORDER) {
        const d = DESKS[id];
        const a = toWorld(d.hit.x0, d.hit.y0), b = toWorld(d.hit.x1, d.hit.y1);
        const area = new Graphics();
        area.rect(a.x, a.y, b.x - a.x, b.y - a.y).fill({ color: 0xffffff, alpha: 0.001 });
        area.eventMode = 'static';
        area.cursor = 'pointer';
        area.zIndex = 1;
        area.on('pointerover', () => { hovered = id; drawOverlay(); });
        area.on('pointerout', () => { if (hovered === id) hovered = null; drawOverlay(); });
        area.on('pointertap', () => onDeskRef.current(id));
        world.addChild(area);
      }
      world.sortableChildren = true;
      actors.zIndex = 2;
      peon.sprite.eventMode = 'static';
      peon.sprite.cursor = 'pointer';
      peon.sprite.on('pointertap', () => say('peon', ['Ji, sahab?', 'File chahiye? Abhi laata hoon.', 'Chai ke baad… file pehle!'][Math.floor(Math.random() * 3)]));

      // ── camera ──
      const fitZoom = () => Math.min(app.screen.width / WORLD_W, app.screen.height / WORLD_H);
      const focus = (id: DeskId | null) => {
        drawOverlay();
        if (!id) { camera.fitToScreen(); return; }
        const d = DESKS[id];
        const c = toWorld(d.x, id === 'reception' ? 690 : 385);
        camera.focusOn(c.x, c.y, fitZoom() * 1.75);
      };
      sceneRef.current = {
        focus,
        setLook: (l) => { citizen.setFrames(makeFrames(l)); },
      };
      focus(deskRef.current);

      // ── the peon's errands ──
      type Job = { from: DeskId | 'citizen'; to: DeskId; label?: string };
      const jobs: Job[] = [];
      let busyPeon = false;
      let idleFor = 0;
      const standAt = (id: DeskId | 'citizen'): Pt => (id === 'citizen' ? { x: citizen.pos.x + 26, y: citizen.pos.y } : { x: DESKS[id].front.x + 38, y: DESKS[id].front.y });
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
          if (j.label) say('peon', `📁 ${j.label}`, 2600);
          await peon.go(standAt(j.to));
          if (disposed) return;
          peon.face('back');
          const target = j.to;
          const who = DESKS[target].actor;
          say(who, '✔ File mil gayi.', 1800);
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
        await peon.go({ x: DESKS[id].front.x + 70, y: DESKS[id].front.y });
        if (!disposed && !jobs.length) { peon.face('back'); say('peon', patrolLines[Math.floor(Math.random() * patrolLines.length)], 2400); await sleep(2400); }
        if (!disposed) { await peon.go(PEON_HOME); peon.face('front'); }
        busyPeon = false;
        idleFor = 0;
        if (jobs.length) void runJobs();
      };

      // ── commands from the app ──
      const onCommand = (c: FloorCommand) => {
        switch (c.type) {
          case 'file': jobs.push({ from: c.from, to: c.to, label: c.label }); void runJobs(); break;
          case 'walk': { citizen.sprite.visible = true; nameTag.visible = true; void citizen.go(DESKS[c.to].front).then(() => citizen.face('back')); break; }
          case 'say': say(c.actor, c.text, c.ms ?? 3600); break;
          case 'busy': { const s = seated.get(c.actor); if (s) s.busy = c.on; break; }
          case 'arrive':
            citizen.teleport(ENTRANCE); citizen.sprite.visible = true; nameTag.visible = true;
            void citizen.go(DESKS.reception.front).then(() => citizen.face('back'));
            break;
          case 'focus': focus(c.desk); break;
        }
      };
      cleanups.push(subscribeFloor(onCommand));
      onCommand({ type: 'arrive' });

      // ── frame loop ──
      let t = 0;
      app.ticker.add((tk) => {
        const dt = Math.min(tk.deltaMS / 1000, 0.05);
        t += dt;
        peon.update(dt);
        citizen.update(dt);
        const w = toWorld(citizen.pos.x, citizen.pos.y);
        nameTag.position.set(w.x, w.y + 1);
        for (const s of seated.values()) {
          // typing: arms alternate; idle: a tiny breathing bob
          if (s.busy) s.sprite.texture = s.frames.front[Math.floor(t * 7) % 2 === 0 ? 1 : 2];
          else s.sprite.texture = s.frames.front[0];
          s.sprite.y = s.base.y + (s.busy ? 0 : Math.sin(t * 1.6 + s.base.x) * 0.25);
        }
        if (!busyPeon && !jobs.length) { idleFor += dt; if (idleFor > 22) { idleFor = 0; void patrol(); } }
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
        focus(deskRef.current);
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
    // The scene is built once; look / desk changes are pushed in through sceneRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0, background: '#14203f' }} />;
}
