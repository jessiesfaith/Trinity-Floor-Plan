// "Show dimensions" on a furniture piece: a dimension line along its back (width) and one side
// (depth), just outside the piece, so a plan shown to others reads the piece's size at a glance.
// A round table gets one line across, for its diameter.

import type { Furniture, Pt } from '@/types/plan';
import { add, dist, norm, scale, sub } from './geometry';
import { footprint } from './objects';

export interface SizeMark {
  /** Ends of the dimension line (already offset outside the piece). */
  a: Pt;
  b: Pt;
  /** Where the text sits, and its angle in degrees (kept readable: -90..90). */
  text: Pt;
  angle: number;
  /** Length measured, inches. */
  length: number;
  /** Prefix for the text (a diameter mark for round tables). */
  prefix: string;
}

/** Dimension lines for a piece with `showSize` on; `gap` is how far outside the piece they sit. */
export function sizeMarks(f: Furniture, gap: number, textGap: number): SizeMark[] {
  const c = footprint(f);
  const center = { x: f.x, y: f.y };
  const round = f.type === 'round-table';
  const edges: [Pt, Pt][] = round ? [[c[0], c[1]]] : [[c[0], c[1]], [c[1], c[2]]];
  // Benches seat people along the back too: keep the width line clear of those chairs (drawn ~19" out).
  const chairs = f.type === 'bench' || f.access === 'both-chair' ? 20 : 0;
  return edges.map(([p, q], i) => {
    const m = scale(add(p, q), 0.5);
    const out = norm(sub(m, center));
    const g = gap + (i === 0 ? chairs : 0);
    const a = add(p, scale(out, g));
    const b = add(q, scale(out, g));
    let angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
    angle = ((angle % 180) + 180) % 180; // 0..180
    if (angle > 90.001) angle -= 180; // readable: (-90, 90], vertical text always reads bottom to top
    return { a, b, text: add(scale(add(a, b), 0.5), scale(out, textGap)), angle, length: dist(p, q), prefix: round ? '⌀ ' : '' };
  });
}
