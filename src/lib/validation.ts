// Geometry-based layout validation.
//
// Everything here is a PLANNING check driven by user-configured thresholds in
// PlanSettings. It does not certify ADA, fire-code or building-code compliance;
// see PROFESSIONAL_REVIEW_NOTICE.

import type { Furniture, PlanObject, PlanSettings, Pt, Room, Wall, Background, Aisle } from '@/types/plan';
import {
  bbox,
  convexOverlapDepth,
  dist,
  distPointSegment,
  norm,
  perp,
  pointInPolygon,
  polygonContains,
  rayPolygon,
  rotatePt,
  scale,
  signedArea,
  sub,
  add,
  len,
} from './geometry';
import { doorSwing, footprint, roomAt, wallPolygon } from './objects';
import { formatLength } from './units';

export type Severity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'overlap'
  | 'wall'
  | 'door-swing'
  | 'out-of-room'
  | 'outside'
  | 'aisle-blocked'
  | 'aisle-narrow'
  | 'access'
  | 'no-path'
  | 'no-opening'
  | 'tight'
  | 'label-override'
  | 'uncalibrated'
  | 'unverified'
  | 'review';

export interface Issue {
  id: string;
  severity: Severity;
  code: IssueCode;
  message: string;
  objectIds: string[];
}

export interface ClearanceReading {
  furnitureId: string;
  side: 'front' | 'back';
  required: number;
  measured: number;
  origin: Pt;
  hit: Pt;
}

export interface ValidationResult {
  issues: Issue[];
  clearances: ClearanceReading[];
  /** Furniture ids involved in at least one error. */
  conflictIds: Set<string>;
  minAisleMeasured: number | null;
  errorCount: number;
  warningCount: number;
}

export const PROFESSIONAL_REVIEW_NOTICE =
  'Planning tool only. Clearances are user-configured thresholds; this layout has NOT been verified for ADA, fire/egress or building-code compliance and is not construction-ready. Professional review required.';

const MAX_RAY = 600;

/** Which rooms are the furniture "in": the smallest room containing its center. */
function containerRoom(objects: PlanObject[], f: Furniture): Room | undefined {
  return roomAt(objects, { x: f.x, y: f.y });
}

function accessSides(f: Furniture): ('front' | 'back')[] {
  if (!f.isWorkstation) return [];
  if (f.access === 'front-aisle' || f.access === 'front-chair') return ['front'];
  if (f.access === 'both-chair') return ['front', 'back'];
  return [];
}

export function requiredClearance(f: Furniture, s: PlanSettings): number {
  return f.access === 'front-aisle' ? s.minAisleWidth : s.chairClearance;
}

/** Ray-cast the clear distance in front of (or behind) a workstation. */
export function measureClearance(
  f: Furniture,
  side: 'front' | 'back',
  obstacles: { id: string; poly: Pt[] }[],
): { measured: number; origin: Pt; hit: Pt } {
  const dirLocal = { x: 0, y: side === 'front' ? 1 : -1 };
  const dir = norm(rotatePt(dirLocal, f.rotation));
  const inset = Math.min(6, f.width / 4);
  const xs = f.width > 12 ? [-f.width / 2 + inset, 0, f.width / 2 - inset] : [0];
  let best: { measured: number; origin: Pt; hit: Pt } | null = null;
  for (const lx of xs) {
    const o = add({ x: f.x, y: f.y }, rotatePt({ x: lx, y: (dirLocal.y * f.depth) / 2 }, f.rotation));
    let t = MAX_RAY;
    for (const ob of obstacles) {
      if (ob.id === f.id) continue;
      const h = rayPolygon(add(o, scale(dir, 0.01)), dir, ob.poly);
      if (h !== null && h + 0.01 < t) t = h + 0.01;
    }
    if (!best || t < best.measured) best = { measured: t, origin: o, hit: add(o, scale(dir, t)) };
  }
  return best!;
}

function pointPolygonDistance(p: Pt, poly: Pt[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distPointSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Points on a room boundary that are not covered by any wall (doorways / open sides). */
export function roomOpenings(room: Room, walls: Wall[], step = 4): Pt[] {
  const out: Pt[] = [];
  const ccw = signedArea(room.points) < 0; // y-down: negative = counter-clockwise on screen
  for (let i = 0; i < room.points.length; i++) {
    const a = room.points[i];
    const b = room.points[(i + 1) % room.points.length];
    const L = dist(a, b);
    const d = norm(sub(b, a));
    // Inward normal: for clockwise (positive area in y-down) polygons the interior is on the right (perp).
    const n = ccw ? scale(perp(d), -1) : perp(d);
    for (let t = step / 2; t < L; t += step) {
      const p = add(a, scale(d, t));
      const covered = walls.some((w) => distPointSegment(p, w.a, w.b) <= w.thickness / 2 + 2);
      if (!covered) out.push(add(p, scale(n, 4)));
    }
  }
  return out;
}

interface PathResult {
  reachable: (p: Pt) => boolean;
  hasOpenings: boolean;
}

/** Grid flood-fill from the room's openings with a clearance radius (circulation path check). */
export function circulation(room: Room, walls: Wall[], obstaclePolys: Pt[][], pathWidth: number): PathResult {
  const bb = bbox(room.points);
  const area = bb.width * bb.height;
  const cell = Math.max(3, Math.ceil(Math.sqrt(area / 40000)));
  const cols = Math.max(1, Math.ceil(bb.width / cell));
  const rows = Math.max(1, Math.ceil(bb.height / cell));
  const r = pathWidth / 2 - cell / 2 - 0.01;
  const free = new Uint8Array(cols * rows);
  const center = (c: number, rr: number): Pt => ({ x: bb.minX + (c + 0.5) * cell, y: bb.minY + (rr + 0.5) * cell });
  for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) free[rr * cols + c] = pointInPolygon(center(c, rr), room.points) ? 1 : 0;
  const block = (poly: Pt[]) => {
    const pb = bbox(poly);
    const c0 = Math.max(0, Math.floor((pb.minX - r - bb.minX) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((pb.maxX + r - bb.minX) / cell));
    const r0 = Math.max(0, Math.floor((pb.minY - r - bb.minY) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((pb.maxY + r - bb.minY) / cell));
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const i = rr * cols + c;
        if (free[i] && pointPolygonDistance(center(c, rr), poly) < r) free[i] = 0;
      }
  };
  obstaclePolys.forEach(block);
  walls.forEach((w) => block(wallPolygon(w)));
  const reach = new Uint8Array(cols * rows);
  const queue: number[] = [];
  const openings = roomOpenings(room, walls);
  const cellOf = (p: Pt) => {
    const c = Math.floor((p.x - bb.minX) / cell);
    const rr = Math.floor((p.y - bb.minY) / cell);
    return c >= 0 && rr >= 0 && c < cols && rr < rows ? rr * cols + c : -1;
  };
  // Seed from every free cell near an opening sample (samples and cell centers need not align).
  const k = Math.ceil(6 / cell);
  for (const p of openings) {
    for (let dy = -k; dy <= k; dy++)
      for (let dx = -k; dx <= k; dx++) {
        const i = cellOf({ x: p.x + dx * cell, y: p.y + dy * cell });
        if (i >= 0 && free[i] && !reach[i]) {
          reach[i] = 1;
          queue.push(i);
        }
      }
  }
  while (queue.length) {
    const i = queue.pop()!;
    const c = i % cols;
    const rr = (i - c) / cols;
    const nbrs = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, rr > 0 ? i - cols : -1, rr < rows - 1 ? i + cols : -1];
    for (const j of nbrs) if (j >= 0 && free[j] && !reach[j]) {
      reach[j] = 1;
      queue.push(j);
    }
  }
  return {
    hasOpenings: openings.length > 0,
    reachable: (p: Pt) => {
      const rad = Math.ceil(8 / cell);
      const c0 = Math.floor((p.x - bb.minX) / cell);
      const r0 = Math.floor((p.y - bb.minY) / cell);
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++) {
          const c = c0 + dc;
          const rr = r0 + dr;
          if (c >= 0 && rr >= 0 && c < cols && rr < rows && reach[rr * cols + c]) return true;
        }
      return false;
    },
  };
}

export interface ValidateOptions {
  background?: Background;
  /** Skip the (heavier) path check, e.g. while dragging. */
  skipPaths?: boolean;
}

export function validate(objects: PlanObject[], s: PlanSettings, opts: ValidateOptions = {}): ValidationResult {
  const issues: Issue[] = [];
  const clearances: ClearanceReading[] = [];
  let n = 0;
  const push = (severity: Severity, code: IssueCode, message: string, objectIds: string[]) =>
    issues.push({ id: `${code}-${n++}`, severity, code, message, objectIds });
  const fmt = (v: number) => formatLength(v, s.units);

  const furniture = objects.filter((o): o is Furniture => o.kind === 'furniture');
  const walls = objects.filter((o): o is Wall => o.kind === 'wall');
  const doors = objects.filter((o) => o.kind === 'door');
  const aisles = objects.filter((o): o is Aisle => o.kind === 'aisle');
  const rooms = objects.filter((o): o is Room => o.kind === 'room');

  const fp = new Map(furniture.map((f) => [f.id, footprint(f)]));
  const wq = new Map(walls.map((w) => [w.id, wallPolygon(w)]));

  // 1. Furniture vs furniture.
  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i];
      const b = furniture[j];
      if (a.overlapsAllowed || b.overlapsAllowed) continue;
      const depth = convexOverlapDepth(fp.get(a.id)!, fp.get(b.id)!);
      if (depth > 0.25) push('error', 'overlap', `${a.name} overlaps ${b.name} by ${fmt(depth)}.`, [a.id, b.id]);
    }
  }

  // 2. Furniture vs walls, door swings, aisles, room boundary.
  for (const f of furniture) {
    const poly = fp.get(f.id)!;
    // Cube walls and phone booths are pushed right up against building walls, so tucking into a
    // wall up to its centre line counts as standing against it, not as a conflict.
    // A cube wall piece (4' / 2'), as opposed to cubicle furniture, which must stay inside its cubicle.
    const part = !!f.inventoryItem && f.type === 'partition';
    const flush = part || f.type === 'phone-booth' || f.type === 'tv' || f.type === 'whiteboard';
    for (const w of walls) {
      // For those, trim the footprint back by half the wall's thickness at its ends (both ways for a
      // booth; along its length for a thin cube wall) before testing.
      const tol = w.thickness / 2 + 0.5;
      const test = flush ? footprint({ ...f, width: Math.max(1, f.width - 2 * tol), depth: part ? f.depth : Math.max(1, f.depth - 2 * tol) }) : poly;
      if (convexOverlapDepth(test, wq.get(w.id)!) > 0.25) push('error', 'wall', `${f.name} intersects a wall (${w.name}).`, [f.id, w.id]);
    }
    for (const d of doors) {
      if (d.kind !== 'door') continue;
      if (convexOverlapDepth(poly, doorSwing(d)) > 0.25) push('error', 'door-swing', `${f.name} obstructs the swing of ${d.name}.`, [f.id, d.id]);
    }
    for (const a of aisles) {
      if (f.overlapsAllowed) continue;
      if (convexOverlapDepth(poly, footprint(a)) > 0.25) push('error', 'aisle-blocked', `${f.name} intrudes into ${a.name}.`, [f.id, a.id]);
    }
    const room = containerRoom(objects, f);
    if (!room) {
      if (rooms.length && !part) push('warning', 'outside', `${f.name} is not inside any room.`, [f.id]);
    } else if (!part && !(flush && room.roomType === 'cubicle-area') && !polygonContains(room.points, poly, 0.25)) {
      // (Cube walls may straddle room outlines; running into a real wall is caught above.)
      push('error', 'out-of-room', `${f.name} crosses the boundary of ${room.name}.`, [f.id, room.id]);
    }
  }

  // 3. Aisle zones narrower than the configured minimum.
  for (const a of aisles) {
    if (a.depth + 0.01 < s.minAisleWidth) push('warning', 'aisle-narrow', `${a.name} is ${fmt(a.depth)} wide; configured minimum is ${fmt(s.minAisleWidth)}.`, [a.id]);
  }

  // 4. Workstation access clearance (ray-cast), measured inside the containing room.
  let minAisle: number | null = null;
  for (const f of furniture) {
    const sides = accessSides(f);
    if (!sides.length) continue;
    const room = containerRoom(objects, f);
    const obstacles: { id: string; poly: Pt[] }[] = [
      ...furniture.filter((g) => !g.overlapsAllowed).map((g) => ({ id: g.id, poly: fp.get(g.id)! })),
      ...walls.map((w) => ({ id: w.id, poly: wq.get(w.id)! })),
      ...(room ? [{ id: room.id, poly: room.points }] : []),
    ];
    const req = requiredClearance(f, s);
    for (const side of sides) {
      const m = measureClearance(f, side, obstacles);
      clearances.push({ furnitureId: f.id, side, required: req, ...m });
      if (f.access === 'front-aisle') minAisle = minAisle === null ? m.measured : Math.min(minAisle, m.measured);
      if (m.measured + 0.01 < req) {
        push(
          'error',
          'access',
          `${f.name}: ${side} clearance ${fmt(m.measured)} is below the ${f.access === 'front-aisle' ? 'aisle' : 'chair'} minimum of ${fmt(req)}.`,
          [f.id],
        );
      }
    }
  }

  // 5. Circulation: every workstation must connect to a doorway/opening of its room.
  if (!opts.skipPaths) {
    const byRoom = new Map<string, Furniture[]>();
    for (const f of furniture) {
      if (!f.isWorkstation) continue;
      const room = containerRoom(objects, f);
      if (!room) continue;
      byRoom.set(room.id, [...(byRoom.get(room.id) ?? []), f]);
    }
    const pathWidth = Math.min(s.minAisleWidth, s.doorClearance);
    for (const [roomId, ws] of byRoom) {
      const room = rooms.find((r) => r.id === roomId)!;
      const obs = furniture.filter((g) => !g.overlapsAllowed).map((g) => fp.get(g.id)!);
      const path = circulation(room, walls, obs, pathWidth);
      if (!path.hasOpenings) {
        push('warning', 'no-opening', `${room.name} has no doorway or open side; circulation was not checked.`, [room.id]);
        continue;
      }
      for (const f of ws) {
        const sides = accessSides(f);
        const ok = sides.some((side) => {
          const dir = rotatePt({ x: 0, y: side === 'front' ? 1 : -1 }, f.rotation);
          const p = add({ x: f.x, y: f.y }, scale(dir, f.depth / 2 + Math.min(requiredClearance(f, s), pathWidth) / 2));
          return path.reachable(p);
        });
        if (!ok) push('error', 'no-path', `${f.name} has no ${fmt(pathWidth)}-wide path to a doorway of ${room.name}.`, [f.id]);
      }
    }
  }

  // 6. Wall tolerance (optional install gap).
  if (s.wallTolerance > 0) {
    for (const f of furniture) {
      for (const w of walls) {
        const poly = fp.get(f.id)!;
        const gap = Math.min(...poly.map((p) => distPointSegment(p, w.a, w.b) - w.thickness / 2));
        if (gap >= -0.25 && gap < s.wallTolerance - 0.01) push('warning', 'tight', `${f.name} is ${fmt(Math.max(0, gap))} from ${w.name}; tolerance is ${fmt(s.wallTolerance)}.`, [f.id, w.id]);
      }
    }
  }

  // 7. Annotation integrity.
  for (const o of objects) {
    if (o.kind === 'dimension' && o.labelOverride && o.labelOverride.trim()) {
      push('warning', 'label-override', `"${o.name}" shows "${o.labelOverride}" but the geometry measures ${fmt(len(sub(o.b, o.a)))}.`, [o.id]);
    }
  }

  // 8. Data provenance.
  if (opts.background && !opts.background.calibrated) {
    push('warning', 'uncalibrated', 'The imported floor plan has not been calibrated; traced dimensions are not to scale.', []);
  }
  const unverified = rooms.filter((r) => !r.dimensionsVerified);
  if (unverified.length) {
    push('info', 'unverified', `${unverified.length} room(s) use preliminary dimensions that have not been field-verified.`, unverified.map((r) => r.id));
  }
  push('info', 'review', PROFESSIONAL_REVIEW_NOTICE, []);

  const conflictIds = new Set<string>();
  for (const i of issues) if (i.severity === 'error') i.objectIds.forEach((id) => conflictIds.add(id));
  return {
    issues,
    clearances,
    conflictIds,
    minAisleMeasured: minAisle,
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
  };
}
