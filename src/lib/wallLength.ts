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
