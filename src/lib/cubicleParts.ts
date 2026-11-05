// Break whole cubicles into the parts the office actually owns (4' and 2' cubicle walls, corner /
// long / short desks, hanging shelves, file cabinets), so a layout can be checked and adjusted
// against the furniture inventory piece by piece.
//
// Cubicle walls are laid along each cubicle's back and both sides (the front stays open). A wall
// shared by two cubicles is laid once, and no cubicle wall is laid where a building wall already
// stands. Desks form an L along the back and the left side, as cubicles are drawn.

import type { Furniture, InventoryItem, PlanObject, Pt, Wall } from '@/types/plan';
import { BUILT_IN_TEMPLATES } from './library';
import { furnitureFromTemplate } from './objects';

const tpl = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;
export const PART = {
  wall4: tpl('part-wall-4'),
  wall2: tpl('part-wall-2'),
  corner: tpl('part-desk-corner'),
  long: tpl('part-desk-long'),
  short: tpl('part-desk-short'),
  shelf: tpl('part-shelf'),
  fileSmall: tpl('part-file-small'),
  fileLong: tpl('part-file-long'),
};

/** Inventory key of an item, as used by templates and placed parts. */
export const inventoryKey = (it: Pick<InventoryItem, 'area' | 'item'>) => `${it.area.trim()}|${it.item.trim()}`;

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

/**
 * Replace every cubicle in `objects` with its parts. Desks follow the stock on hand: corner desks
 * first (4' x 4' cubicles get them first), then two long desks, then short desks; 6' sides are
 * filled out with short desks. One hanging shelf and one file cabinet per cubicle while they last.
 */
export function explodeCubicles(objects: PlanObject[], inventory: InventoryItem[] = []): PartsResult {
  const cubicles = objects.filter((o): o is Furniture => o.kind === 'furniture' && o.type === 'cubicle');
  const walls = objects.filter((o): o is Wall => o.kind === 'wall');
  const owned = new Map(inventory.map((x) => [inventoryKey(x), x.qty ?? 0]));
  const stock = (t: { inventoryItem?: string }) => owned.get(t.inventoryItem!) ?? 0;
  const left = new Map<string, number>([PART.corner, PART.long, PART.short, PART.shelf, PART.fileSmall, PART.fileLong].map((t) => [t.inventoryItem!, stock(t)]));
  const take = (t: { inventoryItem?: string }) => {
    const n = left.get(t.inventoryItem!) ?? 0;
    if (n <= 0) return false;
    left.set(t.inventoryItem!, n - 1);
    return true;
  };

  const parts: Furniture[] = [];
  const place = (t: typeof PART.wall4, f: Furniture | null, p: Pt, rotation: number, name: string) => {
    const w = f ? toWorld(f, p) : p;
    parts.push({ ...furnitureFromTemplate(t, w.x, w.y, name, ((rotation % 360) + 360) % 360), department: f?.department ?? '' });
  };

  // Walls
  let n4 = 0;
  let n2 = 0;
  for (const s of cubicleWallRuns(cubicles, walls)) {
    const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const d = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
    const ang = (Math.atan2(d.y, d.x) * 180) / Math.PI;
    let t = 0;
    for (const len of panelsFor(L)) {
      const c = { x: s.a.x + d.x * (t + len / 2), y: s.a.y + d.y * (t + len / 2) };
      if (len === 48) place(PART.wall4, null, c, ang, `Cubicle wall 4' ${String(++n4).padStart(2, '0')}`);
      else place(PART.wall2, null, c, ang, `Cubicle wall 2' ${String(++n2).padStart(2, '0')}`);
      t += len;
    }
  }

  // Desks, shelves, cabinets (4' x 4' cubicles first: a corner desk fits them exactly).
  const order = [...cubicles].sort((a, b) => a.width * a.depth - b.width * b.depth);
  for (const f of order) {
    const hw = f.width / 2;
    const hd = f.depth / 2;
    const r = f.rotation;
    const label = (what: string) => `${f.name} ${what}`;
    let backDone: number; // how far along the back (from the left) the desk reaches
    let sideDone: number; // how far down the left side (from the back) the desk reaches
    if (take(PART.corner)) {
      place(PART.corner, f, { x: -hw + 24, y: -hd + 24 }, r, label('corner desk'));
      backDone = 48;
      sideDone = 48;
    } else if (take(PART.long)) {
      // Two long desks make the L: one along the longer side, one across the other.
      if (f.depth >= 72 || f.width < 72) {
        place(PART.long, f, { x: -hw + 24, y: -hd + 12 }, r, label('long desk'));
        backDone = 48;
        sideDone = 24;
        if (f.depth >= 72 && take(PART.long)) {
          place(PART.long, f, { x: -hw + 12, y: -hd + 48 }, r + 90, label('long desk (side)'));
          sideDone = 72;
        }
      } else {
        place(PART.long, f, { x: -hw + 12, y: -hd + 24 }, r + 90, label('long desk (side)'));
        backDone = 24;
        sideDone = 48;
        if (take(PART.long)) {
          place(PART.long, f, { x: -hw + 48, y: -hd + 12 }, r, label('long desk'));
          backDone = 72;
        }
      }
    } else {
      backDone = 0;
      sideDone = 24;
    }
    // Fill out the back and the left side with short desks.
    for (let x = backDone; x + 24 <= f.width + 0.5; x += 24) place(PART.short, f, { x: -hw + x + 12, y: -hd + 12 }, r, label('short desk'));
    for (let y = sideDone; y + 24 <= f.depth + 0.5; y += 24) place(PART.short, f, { x: -hw + 12, y: -hd + y + 12 }, r, label('short desk'));
    for (const p of parts.filter((q) => q.name === label('short desk'))) if (!take(PART.short)) p.notes = 'More short desks than in the inventory';
    if (take(PART.shelf)) place(PART.shelf, f, { x: -hw + 24, y: -hd + 6 }, r, label('hanging shelf'));
    if (take(PART.fileSmall)) place(PART.fileSmall, f, { x: -hw + 40, y: -hd + 11 }, r, label('file cabinet'));
    else if (take(PART.fileLong)) place(PART.fileLong, f, { x: -hw + 32, y: -hd + 11 }, r, label('file cabinet'));
  }

  const ids = new Set(cubicles.map((c) => c.id));
  const kept = objects.filter((o) => !ids.has(o.id));
  return { objects: [...kept, ...parts], cubicles: cubicles.length, used: usedByItem(parts) };
}
