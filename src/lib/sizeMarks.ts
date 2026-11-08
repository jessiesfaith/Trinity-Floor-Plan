// Desk and table sizes, always shown like the plan's other dimensions: a dimension line along the
// piece's back (width) and one side (depth), just outside it. A round table gets one line, for its
// diameter. Cubicles and phone booths have their own side lengths; storage, chairs and cube walls
// get none.

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

const SIZED: ReadonlySet<Furniture['type']> = new Set(['desk', 'l-desk', 'shared-desk', 'bench', 'conference-table', 'round-table']);

/** True for the pieces whose size is drawn on the plan (desks and tables). */
export const showsSize = (f: Furniture) => SIZED.has(f.type);

/** Dimension lines for a desk or table; `gap` is how far outside the piece they sit. */
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
