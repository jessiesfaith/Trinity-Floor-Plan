// Pure 2D geometry utilities used by the canvas, the validator and the layout
// generator. All inputs are in plan inches; angles are degrees unless noted.

import type { Pt } from '@/types/plan';

export const EPS = 1e-6;
export const DEG = Math.PI / 180;

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
export const len = (a: Pt) => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Pt): Pt => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x });

export function rotatePt(p: Pt, deg: number, origin: Pt = { x: 0, y: 0 }): Pt {
  const r = deg * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

/** Corners of a rotated rectangle given by its center, size and rotation (clockwise in y-down). */
export function rectCorners(cx: number, cy: number, w: number, d: number, rotation: number): Pt[] {
  const hw = w / 2;
  const hd = d / 2;
  const local: Pt[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return local.map((p) => add(rotatePt(p, rotation), { x: cx, y: cy }));
}

/** Convert a point from a rotated rect's local frame to plan space. */
export function localToWorld(local: Pt, cx: number, cy: number, rotation: number): Pt {
  return add(rotatePt(local, rotation), { x: cx, y: cy });
}

/** Signed area (shoelace). Positive = clockwise in y-down screen coordinates. */
export function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const polygonArea = (poly: Pt[]) => Math.abs(signedArea(poly));

export function centroid(poly: Pt[]): Pt {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    const s = poly.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return scale(s, 1 / Math.max(1, poly.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function bbox(points: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Ray-casting point-in-polygon. Points exactly on the boundary count as inside. */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (distPointSegment(p, poly[i], poly[(i + 1) % poly.length]) < 1e-4) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function closestPointOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return add(a, scale(ab, t));
}

export const distPointSegment = (p: Pt, a: Pt, b: Pt) => dist(p, closestPointOnSegment(p, a, b));

/** Proper or touching intersection of segments ab and cd (excluding collinear-touch within tol). */
export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt, tol = 1e-6): boolean {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  const qp = sub(c, a);
  if (Math.abs(denom) < EPS) return false; // parallel/collinear: treated as no crossing
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  return t > tol && t < 1 - tol && u > tol && u < 1 - tol;
}

/** Ray (origin o, unit direction dir) vs segment; returns distance or null. */
export function raySegment(o: Pt, dir: Pt, a: Pt, b: Pt): number | null {
  const s = sub(b, a);
  const denom = cross(dir, s);
  if (Math.abs(denom) < EPS) return null;
  const ao = sub(a, o);
  const t = cross(ao, s) / denom;
  const u = cross(ao, dir) / denom;
  if (t >= -1e-6 && u >= -1e-6 && u <= 1 + 1e-6) return Math.max(0, t);
  return null;
}

/** Ray vs closed polygon: nearest hit distance or null. */
export function rayPolygon(o: Pt, dir: Pt, poly: Pt[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const t = raySegment(o, dir, poly[i], poly[(i + 1) % poly.length]);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

function project(poly: Pt[], axis: Pt) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = dot(p, axis);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Separating Axis Theorem overlap depth for two CONVEX polygons.
 * Returns the minimum penetration depth (> 0 = overlapping), or <= 0 when separated
 * (the magnitude is then the separation along the best axis).
 */
export function convexOverlapDepth(p: Pt[], q: Pt[]): number {
  let minOverlap = Infinity;
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length], poly[i]);
      const axis = norm(perp(e));
      if (len(axis) < EPS) continue;
      const a = project(p, axis);
      const b = project(q, axis);
      const o = Math.min(a.max, b.max) - Math.max(a.min, b.min);
      if (o < minOverlap) minOverlap = o;
      if (o <= 0) return o;
    }
  }
  return minOverlap;
}

/** True when two convex polygons overlap by more than `tolerance` inches (touching edges do not count). */
export function convexOverlap(p: Pt[], q: Pt[], tolerance = 0.01): boolean {
  return convexOverlapDepth(p, q) > tolerance;
}

/** Polygon (possibly concave) fully contains a convex polygon (all vertices inside, no edge crossings). */
export function polygonContains(outer: Pt[], inner: Pt[], tolerance = 0.01): boolean {
  // Shrink-test: each inner vertex must be inside or within tolerance of the boundary.
  for (const v of inner) {
    if (!pointInPolygon(v, outer)) {
      let nearest = Infinity;
      for (let i = 0; i < outer.length; i++) nearest = Math.min(nearest, distPointSegment(v, outer[i], outer[(i + 1) % outer.length]));
      if (nearest > tolerance) return false;
    }
  }
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++) {
      if (segmentsIntersect(a, b, outer[j], outer[(j + 1) % outer.length], 1e-4)) return false;
    }
  }
  return true;
}

/** Thick wall segment as a convex quad. */
export function segmentToQuad(a: Pt, b: Pt, thickness: number): Pt[] {
  const n = scale(norm(perp(sub(b, a))), thickness / 2);
  return [add(a, n), add(b, n), sub(b, n), sub(a, n)];
}

/**
 * Door swing as a convex polygon: hinge + sampled quarter arc.
 * The leaf points along `rotation` from the hinge; it opens by 90° toward `swing`.
 */
export function doorSwingPolygon(hinge: Pt, rotation: number, width: number, swing: 1 | -1, samples = 8): Pt[] {
  const pts: Pt[] = [hinge];
  for (let i = 0; i <= samples; i++) {
    const ang = rotation + swing * (90 * i) / samples;
    pts.push(add(hinge, rotatePt({ x: width, y: 0 }, ang)));
  }
  return pts;
}

/** Shortest distance between two convex polygons (0 if overlapping). */
export function polygonDistance(p: Pt[], q: Pt[]): number {
  if (convexOverlapDepth(p, q) > 0) return 0;
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      best = Math.min(
        best,
        distPointSegment(p[i], q[j], q[(j + 1) % q.length]),
        distPointSegment(q[j], p[i], p[(i + 1) % p.length]),
      );
    }
  }
  return best;
}

export const snap = (v: number, grid: number) => (grid > 0 ? Math.round(v / grid) * grid : v);

export const normalizeAngle = (deg: number) => ((deg % 360) + 360) % 360;
