// "Generate Layout Options": geometry-driven workstation placement.
//
// Strategy: enumerate row/aisle band patterns in the room's own frame (so angled
// rooms work), place furniture on them, then REMOVE anything the validator
// rejects (walls, door swings, boundary, aisle clearance, path to a doorway)
// until the layout is stable. Capacity therefore comes from real collision and
// clearance checks, never from dividing area by a per-seat factor.

import type { Door, Furniture, PlanObject, PlanSettings, Pt, Room, Wall } from '@/types/plan';
import { bbox, convexOverlap, polygonContains, rotatePt, sub, dist } from './geometry';
import { BUILT_IN_TEMPLATES } from './library';
import { doorSwing, footprint, furnitureFromTemplate, makeDoor, makeRoom, makeWall, roomAt, wallPolygon } from './objects';
import { validate, type ValidationResult } from './validation';
import { sqft, formatLength } from './units';

export type OptionKey = 'comfort' | 'balanced' | 'density' | 'shared';
export type Orientation = 'auto' | 'rows-along-length' | 'rows-along-width';
export type Arrangement = 'auto' | 'double-loaded' | 'single-loaded';

export interface GeneratorInput {
  room: Room;
  /** Walls, doors and non-workstation furniture that constrain the room. */
  context: PlanObject[];
  employees: number;
  cubicleWidth: number;
  cubicleDepth: number;
  minAisle: number;
  orientation: Orientation;
  arrangement: Arrangement;
  department?: string;
  settings: PlanSettings;
}

export interface LayoutOption {
  key: OptionKey;
  title: string;
  description: string;
  furniture: Furniture[];
  metrics: {
    workstations: number;
    seats: number;
    deskWidth: number;
    deskDepth: number;
    aisleWidth: number;
    roomSqft: number;
    occupiedSqft: number;
    remainingSqft: number;
    clearanceConflicts: number;
    doorObstructions: number;
    minClearance: number | null;
    targetMet: boolean;
  };
  assumptions: string[];
  validation: ValidationResult;
}

type Token = 'R+' | 'R-' | 'A' | 'Z' | 'D';

interface Spec {
  key: OptionKey;
  deskW: number;
  deskD: number;
  aisle: number;
  cap: number | null;
  shared: boolean;
  patterns: Token[][];
  edgeMargin: number;
}

const DOUBLE: Token[][] = [
  ['R+', 'A', 'R-'],
  ['A', 'R-', 'R+'],
];
const SINGLE: Token[][] = [
  ['R+', 'A'],
  ['A', 'R-'],
];

function bandStack(pattern: Token[], heights: Record<Token, number>, available: number, shared: boolean): { tokens: Token[]; total: number } {
  const tokens: Token[] = [];
  let total = 0;
  for (let i = 0; i < 40; i++) {
    const t = pattern[i % pattern.length];
    const h = heights[t];
    if (total + h > available + 0.05) break;
    tokens.push(t);
    total += h;
  }
  if (!shared) {
    // Drop trailing rows whose front has no aisle.
    while (tokens.length && tokens[tokens.length - 1] === 'R+') {
      total -= heights['R+'];
      tokens.pop();
    }
    while (tokens.length && tokens[tokens.length - 1] === 'A') {
      total -= heights.A;
      tokens.pop();
    }
  } else {
    while (tokens.length && tokens[tokens.length - 1] === 'D') {
      total -= heights.D;
      tokens.pop();
    }
  }
  return { tokens, total };
}

function frameAngles(room: Room, orientation: Orientation): number[] {
  // Angle of the room's longest edge = "length" direction.
  let best = 0;
  let bestLen = -1;
  const pts = room.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const l = dist(a, b);
    if (l > bestLen + 0.5) {
      bestLen = l;
      best = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
  }
  const along = best;
  const across = best + 90;
  if (orientation === 'rows-along-length') return [along];
  if (orientation === 'rows-along-width') return [across];
  return [along, across];
}

function contextFor(room: Room, context: PlanObject[]) {
  const walls = context.filter((o): o is Wall => o.kind === 'wall');
  const doors = context.filter((o): o is Door => o.kind === 'door');
  const roomBB = bbox(room.points);
  const near = (p: Pt) => p.x > roomBB.minX - 120 && p.x < roomBB.maxX + 120 && p.y > roomBB.minY - 120 && p.y < roomBB.maxY + 120;
  const fixed = context.filter((o) => {
    if (o.kind !== 'furniture' && o.kind !== 'aisle') return false;
    if (o.kind === 'furniture' && o.isWorkstation && roomAt([room], { x: o.x, y: o.y })) return false; // replaced by the generator
    return near({ x: o.x, y: o.y });
  });
  return { walls: walls.filter((w) => near(w.a) || near(w.b)), doors: doors.filter((d) => near({ x: d.x, y: d.y })), fixed };
}

function place(spec: Spec, room: Room, angle: number, pattern: Token[], yMode: number, xMode: number, settings: PlanSettings, dept: string): Furniture[] {
  const local = room.points.map((p) => rotatePt(p, -angle));
  const bb = bbox(local);
  const m = spec.edgeMargin;
  const heights: Record<Token, number> = {
    'R+': spec.deskD,
    'R-': spec.deskD,
    A: spec.aisle,
    D: spec.deskD,
    Z: settings.chairClearance,
  };
  let tokens: Token[];
  let total: number;
  if (spec.shared) {
    // Z D Zs D Zs ... Z, where shared zones between desk rows use the wider of chair clearance and aisle.
    const shared = Math.max(settings.chairClearance, spec.aisle);
    tokens = [];
    total = 0;
    const avail = bb.height - 2 * m;
    tokens.push('Z');
    total += settings.chairClearance;
    for (let i = 0; i < 20; i++) {
      const needDesk = spec.deskD + settings.chairClearance;
      if (total + needDesk > avail + 0.001) break;
      if (i > 0) {
        if (total - settings.chairClearance + shared + needDesk > avail + 0.001) break;
        total += shared - settings.chairClearance;
        tokens.push('Z');
      }
      tokens.push('D');
      total += needDesk;
    }
    tokens.push('Z');
    if (!tokens.includes('D')) return [];
  } else {
    const r = bandStack(pattern, heights, bb.height - 2 * m, false);
    tokens = r.tokens;
    total = r.total;
  }
  const leftoverY = bb.height - 2 * m - total;
  // yMode 0/1/2 = flush start / centered / flush end; 3 = stretch aisles to absorb the leftover.
  const aisleCount = tokens.filter((t) => t === 'A' || (spec.shared && t === 'Z')).length;
  const stretch = yMode === 3 && aisleCount > 0 ? leftoverY / aisleCount : 0;
  const y0 = bb.minY + m + (yMode === 3 ? 0 : [0, leftoverY / 2, leftoverY][yMode]);
  const usableX = bb.width - 2 * m;
  const spine = spec.aisle;
  const xConfigs = [
    { start: 0, w: usableX },
    { start: spine, w: usableX - spine },
    { start: 0, w: usableX - spine },
  ];
  const cfg = xConfigs[Math.floor(xMode / 3)];
  const cols = Math.floor((cfg.w + 0.05) / spec.deskW);
  if (cols <= 0) return [];
  const leftoverX = cfg.w - cols * spec.deskW;
  const x0 = bb.minX + m + cfg.start + [0, leftoverX / 2, leftoverX][xMode % 3];
  const tpl = spec.shared ? BUILT_IN_TEMPLATES.find((t) => t.id === 'desk-shared-2')! : BUILT_IN_TEMPLATES.find((t) => t.id === 'cub-4x4')!;
  const out: Furniture[] = [];
  let y = y0;
  for (const t of tokens) {
    let bandH = heights[t];
    if (spec.shared && t === 'Z') bandH = y === y0 ? settings.chairClearance : Math.max(settings.chairClearance, spec.aisle);
    if (t === 'A' || (spec.shared && t === 'Z')) bandH += stretch;
    if (t === 'R+' || t === 'R-' || t === 'D') {
      for (let c = 0; c < cols; c++) {
        const lc: Pt = { x: x0 + c * spec.deskW + spec.deskW / 2, y: y + spec.deskD / 2 };
        const wc = rotatePt(lc, angle);
        const rot = angle + (t === 'R-' ? 180 : 0);
        const f = furnitureFromTemplate(tpl, wc.x, wc.y, undefined, rot);
        f.width = spec.deskW;
        f.depth = spec.deskD;
        f.department = dept;
        out.push(f);
      }
    }
    y += bandH;
  }
  return out;
}

function cheapFilter(fs: Furniture[], room: Room, walls: Wall[], doors: Door[], fixed: PlanObject[]): Furniture[] {
  const wq = walls.map(wallPolygon);
  const swings = doors.map(doorSwing);
  const fixedPolys = fixed.filter((o) => o.kind === 'furniture' ? !o.overlapsAllowed : true).map((o) => footprint(o as Furniture));
  return fs.filter((f) => {
    const p = footprint(f);
    if (!polygonContains(room.points, p, 0.25)) return false;
    if (wq.some((q) => convexOverlap(p, q, 0.25))) return false;
    if (swings.some((q) => convexOverlap(p, q, 0.25))) return false;
    if (fixedPolys.some((q) => convexOverlap(p, q, 0.25))) return false;
    return true;
  });
}

const BLOCKING = new Set(['overlap', 'wall', 'door-swing', 'out-of-room', 'aisle-blocked', 'access', 'no-path']);

/** Iteratively remove placed workstations that fail validation. */
function settle(fs: Furniture[], room: Room, base: PlanObject[], settings: PlanSettings): { furniture: Furniture[]; v: ValidationResult } {
  let current = fs;
  let v = validate([room, ...base, ...current], settings);
  for (let iter = 0; iter < 12; iter++) {
    const ids = new Set(current.map((f) => f.id));
    const bad = new Set<string>();
    for (const i of v.issues) if (BLOCKING.has(i.code)) i.objectIds.forEach((id) => ids.has(id) && bad.add(id));
    if (!bad.size) break;
    // Remove path failures one at a time (removing a blocker can free others); remove the rest in bulk.
    const pathOnly = v.issues.filter((i) => BLOCKING.has(i.code)).every((i) => i.code === 'no-path');
    if (pathOnly) {
      const first = [...bad][0];
      current = current.filter((f) => f.id !== first);
    } else {
      const nonPath = new Set<string>();
      for (const i of v.issues) if (BLOCKING.has(i.code) && i.code !== 'no-path') i.objectIds.forEach((id) => ids.has(id) && nonPath.add(id));
      current = current.filter((f) => !nonPath.has(f.id));
    }
    v = validate([room, ...base, ...current], settings);
  }
  return { furniture: current, v };
}

function trimToCap(fs: Furniture[], cap: number | null, doors: Door[]): Furniture[] {
  if (cap === null) return fs;
  let seats = 0;
  const door = doors[0];
  // Keep the workstations farthest from the door first (keeps the entry open).
  const sorted = door ? [...fs].sort((a, b) => dist({ x: b.x, y: b.y }, door) - dist({ x: a.x, y: a.y }, door)) : fs;
  const out: Furniture[] = [];
  for (const f of sorted) {
    if (seats >= cap) break;
    out.push(f);
    seats += f.seats;
  }
  return out;
}

function specs(input: GeneratorInput): Spec[] {
  const { cubicleWidth: W, cubicleDepth: D, minAisle, arrangement, employees } = input;
  const pats = arrangement === 'double-loaded' ? DOUBLE : arrangement === 'single-loaded' ? SINGLE : [...DOUBLE, ...SINGLE];
  return [
    { key: 'comfort', deskW: W, deskD: D, aisle: minAisle + 12, cap: employees, shared: false, patterns: pats, edgeMargin: 2 },
    { key: 'balanced', deskW: W, deskD: D, aisle: minAisle, cap: employees, shared: false, patterns: pats, edgeMargin: 0 },
    { key: 'density', deskW: W, deskD: D, aisle: minAisle, cap: null, shared: false, patterns: pats, edgeMargin: 0 },
    { key: 'shared', deskW: W, deskD: D, aisle: minAisle, cap: null, shared: true, patterns: [['Z']], edgeMargin: 0 },
  ];
}

const TITLES: Record<OptionKey, [string, string]> = {
  comfort: ['Option A — Comfort', 'Wider aisles (+12") and an install gap at walls; seats capped at the requested headcount.'],
  balanced: ['Option B — Balanced', 'Minimum configured aisle; seats capped at the requested headcount.'],
  density: ['Option C — Maximum Density', 'Highest workstation count that passes every configured clearance check.'],
  shared: ['Option D — Shared Workstations', 'Two-person shared desks (one desk footprint split into two facing work surfaces) with chair zones on both sides.'],
};

export function generateLayouts(input: GeneratorInput): LayoutOption[] {
  const { room, settings } = input;
  const { walls, doors, fixed } = contextFor(room, input.context);
  const base: PlanObject[] = [...walls, ...doors, ...fixed];
  const angles = frameAngles(room, input.orientation);
  const roomSqft = sqft(Math.abs(polyArea(room.points)));
  const simSettings: PlanSettings = { ...settings, minAisleWidth: input.minAisle };
  const out: LayoutOption[] = [];

  for (const spec of specs(input)) {
    const s: PlanSettings = { ...simSettings, minAisleWidth: spec.key === 'comfort' ? spec.aisle : input.minAisle };
    const candidates: Furniture[][] = [];
    const seen = new Set<string>();
    for (const angle of angles) {
      for (const pattern of spec.patterns) {
        for (let ym = 0; ym < 4; ym++) {
          for (let xm = 0; xm < 9; xm++) {
            const placed = cheapFilter(place(spec, room, angle, pattern, ym, xm, s, input.department ?? ''), room, walls, doors, fixed);
            const sig = placed.map((f) => `${Math.round(f.x)},${Math.round(f.y)},${Math.round(f.rotation)}`).sort().join('|');
            if (!placed.length || seen.has(sig)) continue;
            seen.add(sig);
            candidates.push(placed);
          }
        }
      }
    }
    candidates.sort((a, b) => seatsOf(b) - seatsOf(a));
    let best: { furniture: Furniture[]; v: ValidationResult; score: number; seats: number } | null = null;
    let evaluated = 0;
    for (const cand of candidates) {
      // Branch and bound: settling only ever removes seats, so a candidate whose raw seat
      // count cannot beat the best settled result is skipped.
      const bound = spec.cap === null ? seatsOf(cand) : Math.min(seatsOf(cand), spec.cap);
      if (best && bound < best.seats) break;
      if (best && bound === best.seats && evaluated >= 24) break;
      if (evaluated >= 80) break;
      evaluated++;
      const settled = settle(cand, room, base, s);
      const trimmed = trimToCap(settled.furniture, spec.cap, doors);
      const final = trimmed.length === settled.furniture.length ? settled : settle(trimmed, room, base, s);
      const seats = seatsOf(final.furniture);
      const minC = final.v.minAisleMeasured ?? 0;
      const score =
        spec.key === 'density' || spec.key === 'shared'
          ? seats * 1000 + Math.min(minC, 200)
          : Math.min(seats, input.employees) * 1000 - Math.abs(seats - input.employees) * 10 + Math.min(minC, 200) / 10;
      if (!best || score > best.score) best = { ...final, score, seats };
    }
    const furniture = (best?.furniture ?? []).map((f, i) => ({
      ...f,
      name: `${spec.shared ? 'Shared desk' : 'Cubicle'} ${String(i + 1).padStart(2, '0')}`,
      assignedTo: Array.from({ length: f.seats }, () => ''),
    }));
    const v = best?.v ?? validate([room, ...base], s);
    const ids = new Set(furniture.map((f) => f.id));
    const placedIssues = v.issues.filter((i) => i.severity === 'error' && i.objectIds.some((id) => ids.has(id)));
    const seats = seatsOf(furniture);
    const occupied = furniture.reduce((a, f) => a + f.width * f.depth, 0);
    const [title, description] = TITLES[spec.key];
    const minClear = (() => {
      const cs = v.clearances.filter((c) => ids.has(c.furnitureId));
      return cs.length ? Math.min(...cs.map((c) => c.measured)) : null;
    })();
    const assumptions = [
      `Minimum aisle ${formatLength(s.minAisleWidth, settings.units)} and chair zone ${formatLength(settings.chairClearance, settings.units)} are user-configured planning values, not verified code minimums.`,
      `Path-to-door check uses a ${formatLength(Math.min(s.minAisleWidth, settings.doorClearance), settings.units)} clear width.`,
      'Room geometry is taken as drawn; it has not been field-verified.',
    ];
    if (spec.key === 'comfort') assumptions.push('Keeps a 2" install gap at every wall for trim, outlets and base.');
    if (spec.shared) assumptions.push(`Shared desk = ${formatLength(spec.deskW, settings.units)} per seat with ${formatLength(spec.deskD / 2, settings.units)} work surface per side.`);
    if (!doors.length) assumptions.push('No door found on this room; entry obstructions could not be checked.');
    out.push({
      key: spec.key,
      title,
      description,
      furniture,
      metrics: {
        workstations: furniture.length,
        seats,
        deskWidth: spec.deskW,
        deskDepth: spec.deskD,
        aisleWidth: spec.aisle,
        roomSqft,
        occupiedSqft: sqft(occupied),
        remainingSqft: Math.max(0, roomSqft - sqft(occupied)),
        clearanceConflicts: placedIssues.filter((i) => i.code !== 'door-swing').length,
        doorObstructions: placedIssues.filter((i) => i.code === 'door-swing').length,
        minClearance: minClear,
        targetMet: seats >= input.employees,
      },
      assumptions,
      validation: v,
    });
  }
  return out;
}

const seatsOf = (fs: Furniture[]) => fs.reduce((a, f) => a + f.seats, 0);

function polyArea(p: Pt[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return a / 2;
}

export type DoorSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * Build a stand-alone room (rectangle or L-shape) with walls and one door, for
 * "what if" studies that are not tied to a drawn room.
 */
export function syntheticRoom(opts: {
  width: number;
  length: number;
  shape: 'rectangle' | 'l-shape';
  notchWidth?: number;
  notchLength?: number;
  doorSide: DoorSide;
  doorOffset: number;
  doorWidth: number;
  origin?: Pt;
}): { room: Room; context: PlanObject[] } {
  const o = opts.origin ?? { x: 0, y: 0 };
  const W = opts.width;
  const L = opts.length;
  let pts: Pt[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: L },
    { x: 0, y: L },
  ];
  if (opts.shape === 'l-shape') {
    const nw = Math.min(opts.notchWidth ?? W / 3, W - 24);
    const nl = Math.min(opts.notchLength ?? L / 3, L - 24);
    pts = [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: L - nl },
      { x: W - nw, y: L - nl },
      { x: W - nw, y: L },
      { x: 0, y: L },
    ];
  }
  pts = pts.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
  const room = makeRoom('Study room', 'cubicle-area', pts, '#e8f4f3');
  const t = 5;
  const context: PlanObject[] = [];
  const sides: Record<DoorSide, [Pt, Pt]> = {
    top: [pts[0], pts[1]],
    right: [pts[1], pts[2]],
    bottom: [pts[pts.length - 2], pts[pts.length - 1]],
    left: [pts[pts.length - 1], pts[0]],
  };
  const ccwOut = (a: Pt, b: Pt): Pt => {
    const d = sub(b, a);
    const l = Math.hypot(d.x, d.y);
    // Outward normal for clockwise (y-down) polygon: left side of travel.
    return { x: (d.y / l) * (t / 2), y: (-d.x / l) * (t / 2) };
  };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const n = ccwOut(a, b);
    const wa = { x: a.x + n.x, y: a.y + n.y };
    const wb = { x: b.x + n.x, y: b.y + n.y };
    const [sa, sb] = sides[opts.doorSide];
    const isDoorSide = sa === a && sb === b;
    if (!isDoorSide) {
      context.push(makeWall(wa, wb, 'interior'));
      continue;
    }
    const L2 = dist(wa, wb);
    const dir = { x: (wb.x - wa.x) / L2, y: (wb.y - wa.y) / L2 };
    const g0 = Math.max(0, Math.min(L2 - opts.doorWidth, opts.doorOffset));
    const g1 = g0 + opts.doorWidth;
    if (g0 > 0.5) context.push(makeWall(wa, { x: wa.x + dir.x * g0, y: wa.y + dir.y * g0 }, 'interior'));
    if (L2 - g1 > 0.5) context.push(makeWall({ x: wa.x + dir.x * g1, y: wa.y + dir.y * g1 }, wb, 'interior'));
    const hinge = { x: wa.x + dir.x * g0, y: wa.y + dir.y * g0 };
    const rot = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    // Interior is to the right of travel for clockwise polygons in y-down coordinates => +90°.
    context.push(makeDoor(hinge.x, hinge.y, rot, opts.doorWidth, 1, 'Room door'));
  }
  return { room, context };
}
