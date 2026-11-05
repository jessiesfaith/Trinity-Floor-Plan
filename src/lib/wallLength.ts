// Inside (clear) length of a wall: its center-line length minus the part that runs into the
// walls it meets at each end. A wall ending against another wall at a right angle loses half
// of that wall's thickness; at other angles it loses (half thickness) / sin(angle). Ends that
// meet nothing (a door opening, a free end) or a straight continuation are not trimmed.

import type { Wall } from '@/types/plan';
import { dist, distPointSegment } from './geometry';

const TOUCH = 1.5; // inches: how close a wall must come to an end point to count as meeting it

function trimAt(p: { x: number; y: number }, w: Wall, walls: Wall[]): number {
  const L = dist(w.a, w.b) || 1;
  const d = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  let trim = 0;
  for (const o of walls) {
    if (o.id === w.id) continue;
    if (distPointSegment(p, o.a, o.b) > TOUCH) continue;
    const Lo = dist(o.a, o.b) || 1;
    const sin = Math.abs(d.x * (o.b.y - o.a.y) / Lo - d.y * (o.b.x - o.a.x) / Lo);
    if (sin < 0.2) continue; // straight continuation, not a crossing wall
    trim = Math.max(trim, o.thickness / 2 / sin);
  }
  return trim;
}

export function wallInsideLength(w: Wall, walls: Wall[]): number {
  return Math.max(0, dist(w.a, w.b) - trimAt(w.a, w, walls) - trimAt(w.b, w, walls));
}

/** A straight run of wall from corner to corner: the pieces of one wall split by door openings. */
export interface WallRun {
  ids: string[];
  a: { x: number; y: number };
  b: { x: number; y: number };
  thickness: number;
  /** Inside length from corner to corner, door openings included. */
  inside: number;
}

const MAX_OPENING = 72; // inches: the widest gap between two pieces still read as a doorway

/**
 * Group wall pieces that line up end to end across a door opening (same thickness, same line,
 * gap no wider than a double door, and no other wall meeting them at the gap) into one run.
 */
export function wallRuns(walls: Wall[]): WallRun[] {
  const parent = walls.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const dir = (w: Wall) => {
    const L = dist(w.a, w.b) || 1;
    return { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  };
  const crossingAt = (p: { x: number; y: number }, d: { x: number; y: number }, skip: Set<string>) =>
    walls.some((o) => {
      if (skip.has(o.id) || distPointSegment(p, o.a, o.b) > TOUCH) return false;
      const od = dir(o);
      return Math.abs(d.x * od.y - d.y * od.x) >= 0.2;
    });
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w = walls[i];
      const v = walls[j];
      if (Math.abs(w.thickness - v.thickness) > 0.01) continue;
      const d = dir(w);
      const vd = dir(v);
      if (Math.abs(d.x * vd.y - d.y * vd.x) > 1e-3) continue;
      const off = (p: { x: number; y: number }) => Math.abs((p.x - w.a.x) * d.y - (p.y - w.a.y) * d.x);
      if (off(v.a) > 0.5 || off(v.b) > 0.5) continue;
      // nearest pair of ends
      let best: [{ x: number; y: number }, { x: number; y: number }] | null = null;
      for (const p of [w.a, w.b]) for (const q of [v.a, v.b]) if (!best || dist(p, q) < dist(best[0], best[1])) best = [p, q];
      const [p, q] = best!;
      if (dist(p, q) > MAX_OPENING) continue;
      const skip = new Set([w.id, v.id]);
      if (crossingAt(p, d, skip) || crossingAt(q, d, skip)) continue;
      parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Wall[]>();
  walls.forEach((w, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), w]));
  return [...groups.values()].map((g) => {
    const w0 = g[0];
    const d = dir(w0);
    const t = (p: { x: number; y: number }) => (p.x - w0.a.x) * d.x + (p.y - w0.a.y) * d.y;
    const pts = g.flatMap((w) => [w.a, w.b]).sort((p, q) => t(p) - t(q));
    const a = pts[0];
    const b = pts[pts.length - 1];
    const ids = g.map((w) => w.id);
    const others = walls.filter((w) => !ids.includes(w.id));
    const run: Wall = { ...w0, id: `run:${ids.join(',')}`, a, b };
    return { ids, a, b, thickness: w0.thickness, inside: wallInsideLength(run, [run, ...others]) };
  });
}
