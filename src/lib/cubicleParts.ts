// Break whole cubicles into the cube walls the office actually owns (4' and 2' pieces), so a
// layout can be checked and adjusted against the inventory wall by wall.
//
// Cubicle walls are laid along each cubicle's back and both sides (the front stays open). A wall
// shared by two cubicles is laid once, and no cubicle wall is laid where a building wall already
// stands.

import type { Furniture, InventoryItem, PlanObject, Pt, Wall } from '@/types/plan';
import { BUILT_IN_TEMPLATES } from './library';
import { furnitureFromTemplate } from './objects';

const tpl = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;
export const PART = {
  wall4: tpl('part-wall-4'),
  wall2: tpl('part-wall-2'),
};

export const LONG_WALL = 'Cubicles|Long cubicle walls';
export const SHORT_WALL = 'Cubicles|Short cubicle walls';
export const LONG_WALL_COLOR = '#2563eb';
export const SHORT_WALL_COLOR = '#d97706';

/** Drawing colour of a cube wall piece (by its inventory line, so older saved pieces recolour too). */
export function cubeWallColor(o: { inventoryItem?: string; width: number }): string | null {
  if (o.inventoryItem === LONG_WALL) return LONG_WALL_COLOR;
  if (o.inventoryItem === SHORT_WALL) return SHORT_WALL_COLOR;
  return null;
}

/** Inventory key of an item, as used by templates and placed parts. */
export const inventoryKey = (it: Pick<InventoryItem, 'area' | 'item'>) => `${it.area.trim()}|${it.item.trim()}`;

/** True for a placed cubicle wall (as opposed to a desk, shelf or cabinet). */
export const isCubicleWall = (o: PlanObject) => o.kind === 'furniture' && !!o.inventoryItem && o.type === 'partition';

/** Desks, shelves and file cabinets placed as cubicle parts. */
export const isCubicleFurniture = (o: PlanObject) => o.kind === 'furniture' && !!o.inventoryItem && o.type !== 'partition';

/** How many of each inventory line the given objects use. */
export function usedByItem(objects: PlanObject[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of objects) if (o.kind === 'furniture' && o.inventoryItem) m.set(o.inventoryItem, (m.get(o.inventoryItem) ?? 0) + 1);
  return m;
}

const rot = (p: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
};
const toWorld = (f: Furniture, p: Pt): Pt => {
  const q = rot(p, f.rotation);
  return { x: f.x + q.x, y: f.y + q.y };
};

interface Seg {
  a: Pt;
  b: Pt;
}
interface Line {
  /** unit direction (angle normalised to [0, 180)) */
  d: Pt;
  /** a point on the line */
  o: Pt;
  ivs: [number, number][];
}

/** Merge overlapping intervals. */
function union(ivs: [number, number][]): [number, number][] {
  const s = [...ivs].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 1) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** Remove `cut` intervals from `ivs`. */
function subtract(ivs: [number, number][], cuts: [number, number][]): [number, number][] {
  let cur = ivs;
  for (const [c0, c1] of union(cuts)) {
    const next: [number, number][] = [];
    for (const [a, b] of cur) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    cur = next;
  }
  return cur;
}

/** Cubicle wall runs needed for these cubicles: shared walls once, none along building walls. */
export function cubicleWallRuns(cubicles: Furniture[], walls: Wall[]): Seg[] {
  const lines: Line[] = [];
  for (const f of cubicles) {
    const hw = f.width / 2;
    const hd = f.depth / 2;
    const sides: [Pt, Pt][] = [
      [{ x: -hw, y: -hd }, { x: hw, y: -hd }], // back
      [{ x: -hw, y: -hd }, { x: -hw, y: hd }], // left
      [{ x: hw, y: -hd }, { x: hw, y: hd }], // right
    ];
    for (const [p, q] of sides) {
      const a = toWorld(f, p);
      const b = toWorld(f, q);
      let d = { x: b.x - a.x, y: b.y - a.y };
      const L = Math.hypot(d.x, d.y) || 1;
      d = { x: d.x / L, y: d.y / L };
      if (d.y < -1e-6 || (Math.abs(d.y) < 1e-6 && d.x < 0)) d = { x: -d.x, y: -d.y };
      let line = lines.find((l) => Math.abs(l.d.x * d.y - l.d.y * d.x) < 1e-3 && Math.abs((a.x - l.o.x) * l.d.y - (a.y - l.o.y) * l.d.x) < 1);
      if (!line) lines.push((line = { d, o: a, ivs: [] }));
      const t = (r: Pt) => (r.x - line!.o.x) * line!.d.x + (r.y - line!.o.y) * line!.d.y;
      const ta = t(a);
      const tb = t(b);
      line.ivs.push([Math.min(ta, tb), Math.max(ta, tb)]);
    }
  }
  const out: Seg[] = [];
  for (const l of lines) {
    const at = (t: number): Pt => ({ x: l.o.x + l.d.x * t, y: l.o.y + l.d.y * t });
    // Parts of this line that run along a building wall (parallel, within half its thickness + 3").
    const cuts: [number, number][] = [];
    for (const w of walls) {
      const wl = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
      const wd = { x: (w.b.x - w.a.x) / wl, y: (w.b.y - w.a.y) / wl };
      if (Math.abs(wd.x * l.d.y - wd.y * l.d.x) > 0.02) continue;
      const off = Math.abs((w.a.x - l.o.x) * l.d.y - (w.a.y - l.o.y) * l.d.x);
      if (off > w.thickness / 2 + 3) continue;
      const t = (r: Pt) => (r.x - l.o.x) * l.d.x + (r.y - l.o.y) * l.d.y;
      cuts.push([Math.min(t(w.a), t(w.b)), Math.max(t(w.a), t(w.b))]);
    }
    for (const [t0, t1] of subtract(union(l.ivs), cuts)) if (t1 - t0 > 2) out.push({ a: at(t0), b: at(t1) });
  }
  return out;
}

/** Split a run into 4' walls, finishing with a 2' wall when 2' or less is left over. */
export function panelsFor(length: number): number[] {
  const out: number[] = [];
  let left = length;
  while (left > 26) {
    out.push(48);
    left -= 48;
  }
  if (left > 2) out.push(24);
  return out;
}

export interface PartsResult {
  objects: PlanObject[];
  cubicles: number;
  /** Parts placed, by inventory key. */
  used: Map<string, number>;
}

/** Replace every cubicle in `objects` with its cube walls (4' and 2' pieces). */
export function explodeCubicles(objects: PlanObject[]): PartsResult {
  const cubicles = objects.filter((o): o is Furniture => o.kind === 'furniture' && o.type === 'cubicle');
  const walls = objects.filter((o): o is Wall => o.kind === 'wall');
  const parts: Furniture[] = [];
  let n4 = 0;
  let n2 = 0;
  for (const s of cubicleWallRuns(cubicles, walls)) {
    const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const d = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
    const ang = (((Math.atan2(d.y, d.x) * 180) / Math.PI) % 360 + 360) % 360;
    let t = 0;
    for (const len of panelsFor(L)) {
      const c = { x: s.a.x + d.x * (t + len / 2), y: s.a.y + d.y * (t + len / 2) };
      parts.push(
        len === 48
          ? furnitureFromTemplate(PART.wall4, c.x, c.y, `Long cube wall ${String(++n4).padStart(2, '0')}`, ang)
          : furnitureFromTemplate(PART.wall2, c.x, c.y, `Short cube wall ${String(++n2).padStart(2, '0')}`, ang),
      );
      t += len;
    }
  }
  const ids = new Set(cubicles.map((c) => c.id));
  const kept = objects.filter((o) => !ids.has(o.id));
  return { objects: [...kept, ...parts], cubicles: cubicles.length, used: usedByItem(parts) };
}
