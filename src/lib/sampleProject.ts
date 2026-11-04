// Starter office layout.
//
// IMPORTANT: this is a PLACEHOLDER reconstruction of an irregular, angled suite
// built from the planning brief (room list + the two cubicle-area sizes). The
// original architectural PDF was not available when this sample was authored,
// so every room except the two cubicle areas is approximate. Import your PDF
// (Toolbar -> Import), calibrate it, then trace/adjust walls and rooms over it.
//
// Convention: room polygons are INTERIOR faces; walls are centerlines with a
// thickness, so a "12 x 16 ft" room is 12 x 16 ft of clear floor.

import type { Furniture, PlanObject, PlanSettings, Project, Pt, Room, Scenario, Wall } from '@/types/plan';
import { add, dist, norm, perp, scale, signedArea, sub, cross } from './geometry';
import { BUILT_IN_TEMPLATES } from './library';
import { furnitureFromTemplate, makeDimension, makeDoor, makeLabel, makeRoom, makeWall, uid } from './objects';
import { generateLayouts, type OptionKey } from './generator';

export const DEFAULT_SETTINGS: PlanSettings = {
  units: 'ft-in',
  gridSize: 6,
  snapToGrid: true,
  showGrid: true,
  showGuides: true,
  minAisleWidth: 48,
  chairClearance: 36,
  wallTolerance: 0,
  doorClearance: 36,
};

export const DEFAULT_LAYERS: Project['layers'] = [
  { id: 'background', name: 'Imported floor plan', visible: true, locked: true },
  { id: 'rooms', name: 'Rooms', visible: true, locked: false },
  { id: 'walls', name: 'Walls', visible: true, locked: false },
  { id: 'doors', name: 'Doors', visible: true, locked: false },
  { id: 'aisles', name: 'Aisles', visible: true, locked: false },
  { id: 'furniture', name: 'Furniture', visible: true, locked: false },
  { id: 'annotations', name: 'Labels & dimensions', visible: true, locked: false },
];

const FT = 12;
const tpl = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;

/** A wall along a->b with door gaps given as [start, width] distances from a. */
function wallWithGaps(a: Pt, b: Pt, gaps: [number, number][], type: Wall['wallType'] = 'interior'): Wall[] {
  const L = dist(a, b);
  const d = norm(sub(b, a));
  const cuts = [...gaps].sort((x, y) => x[0] - y[0]);
  const out: Wall[] = [];
  let s = 0;
  for (const [g, w] of cuts) {
    if (g - s > 0.5) out.push(makeWall(add(a, scale(d, s)), add(a, scale(d, g)), type));
    s = g + w;
  }
  if (L - s > 0.5) out.push(makeWall(add(a, scale(d, s)), b, type));
  return out;
}

/** Inset a centerline polygon by half the thickness of the wall lying on each edge. */
export function insetByWalls(center: Pt[], walls: Wall[]): Pt[] {
  const cw = signedArea(center) > 0; // clockwise in y-down
  const lines = center.map((a, i) => {
    const b = center[(i + 1) % center.length];
    const d = norm(sub(b, a));
    const inward = cw ? perp(d) : scale(perp(d), -1);
    const L = dist(a, b);
    const onEdge = walls.filter((w) => {
      const wd = norm(sub(w.b, w.a));
      if (Math.abs(cross(d, wd)) > 1e-3) return false; // not parallel
      // Both wall endpoints on the edge's infinite line...
      if (Math.abs(cross(d, sub(w.a, a))) > 0.5 || Math.abs(cross(d, sub(w.b, a))) > 0.5) return false;
      // ...and the projections overlap by more than an inch.
      const ta = (w.a.x - a.x) * d.x + (w.a.y - a.y) * d.y;
      const tb = (w.b.x - a.x) * d.x + (w.b.y - a.y) * d.y;
      return Math.min(L, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb)) > 1;
    });
    const t = onEdge.length ? Math.max(...onEdge.map((w) => w.thickness)) / 2 : 0;
    return { p: add(a, scale(inward, t)), d };
  });
  return lines.map((l, i) => {
    const prev = lines[(i - 1 + lines.length) % lines.length];
    // Intersect prev line with this line.
    const denom = cross(prev.d, l.d);
    if (Math.abs(denom) < 1e-9) return l.p;
    const t = cross(sub(l.p, prev.p), l.d) / denom;
    return add(prev.p, scale(prev.d, t));
  });
}

// ---------------------------------------------------------------------------
// Trinity suite, traced from Floor_Plan.pdf (page 2, the clean copy; page 1 has
// the same base drawing with hand notes).
//
// Tracing frame: s = feet along the Juliette Lane window wall measured from the
// left (kitchen-side) corner; t = feet inward from that wall. The PDF shows the
// suite rotated 40.7°; here the window wall runs along the bottom so walls line
// up with the snapping grid. Scale comes from the plan's own dimension marks
// (24' conference, 12' to the conference, 16' cube area) = 18.15 px/ft at 300 dpi;
// traced positions are accurate to roughly ±6".
// ---------------------------------------------------------------------------

/** Top window-less wall of the suite sits at t = 32 ft; world y grows downward. */
const T_TOP = 32;
const F = (s: number, t: number): Pt => ({ x: s * 12, y: (T_TOP - t) * 12 });

/** Background placement that lines Floor_Plan.pdf up under the traced geometry. */
export const TRINITY_PDF_ALIGNMENT = {
  /** Degrees to rotate the pdf.js-rendered page (the PDF page itself is stored rotated 270°). */
  rotation: 49.27,
  /** Plan inches per pixel of the 300-dpi scan (12 in / 18.15 px). */
  inchesPerScanPixel: 12 / 18.15,
  /** Scan width in pixels (landscape, 11 in at 300 dpi). */
  scanWidth: 3300,
  /** Top-left of the rendered page in plan inches. */
  x: 601.2,
  y: -986.9,
  description: 'Aligned to the traced Trinity plan (scale from the 24\' conference-room dimension).',
};

const CONTRACTOR = 'Contractor-fixed';

/** Wall from a to b (feet) with gaps given as [start ft, width in] from a. */
function wallFt(a: Pt, b: Pt, gaps: [number, number][] = [], type: Wall['wallType'] = 'interior', fixed?: string): Wall[] {
  return wallWithGaps(F(a.x, a.y), F(b.x, b.y), gaps.map(([g, w]) => [g * 12, w] as [number, number]), type).map((w) =>
    fixed ? { ...w, fixed, locked: true, name: `${w.name} (${fixed.toLowerCase()})` } : w,
  );
}

/** Door hinged `offsetFt` along a->b (feet), swinging toward `into` (feet). */
function doorFt(a: Pt, b: Pt, offsetFt: number, into: Pt, name: string, width = 36, fixed?: string) {
  const A = F(a.x, a.y);
  const Bp = F(b.x, b.y);
  const dir = norm(sub(Bp, A));
  const hinge = add(A, scale(dir, offsetFt * 12));
  const rot = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  const side = perp(dir); // +90° in y-down
  const I = F(into.x, into.y);
  const swing: 1 | -1 = side.x * (I.x - hinge.x) + side.y * (I.y - hinge.y) > 0 ? 1 : -1;
  const d = makeDoor(hinge.x, hinge.y, rot, width, swing, name);
  return fixed ? { ...d, fixed, locked: true } : d;
}

const S = (s: number, t: number): Pt => ({ x: s, y: t }); // a point in tracing feet

interface SuiteGeometry {
  base: PlanObject[];
  areaA: Room;
  areaB: Room;
}

function buildSuite(): SuiteGeometry {
  // ---- Key traced points (feet).
  const L = S(0, 0); // left corner on the window wall
  const B = S(82.16, 0); // far tip where the 45° wall meets the window wall
  const E1 = S(52.16, 30); // top of the 45° wall at the main entry
  const S2 = S(45.2, 30);
  const S1 = S(42.8, 32);
  const A1 = S(17.8, 32);
  const N1 = S(17.8, 26.7);
  const K3 = S(14.3, 29.5);
  const K2 = S(10.4, 29.5);
  const K1 = S(8.2, 32);
  const TL = S(0, 32);
  // Contractor rooms
  const IW = 2.5 / 12; // half of a 5" interior wall
  const confL = 4 / 12 + 12 + IW; // centerline: 12'-0" clear from the left wall
  const confR = confL + IW + 24 + IW; // 24'-0" clear
  const confT = 4 / 12 + 14 + IW; // 14'-0" clear from the window wall
  const div43 = 48.29;
  const div32 = 60.25;
  // Office 1: right triangle by the main entry, 15'-0" clear up the entry-side wall (which runs
  // straight up to the main-entry corner E1) and 15'-0" clear along its level bottom wall, with
  // its long side on the 45° wall. (A right angle against a 45° wall makes both sides equal.)
  const o1a = S(52.16, 14.112); // the right-angle corner
  const o1e = S(68.048, 14.112); // where the bottom wall meets the 45° wall
  // The aisle under Office 1 is an even 47" clear: Office 3's top wall drops to stay level and
  // 47" below Office 1's bottom wall. Office 2's door sits on the same line; a wall runs from
  // the door's far jamb up to Office 1's corner on the 45° wall.
  const o3T = 9.779; // top wall of Offices 3 and 4 (one straight line)
  const o2D = S(div32 + 4, o3T); // far jamb of Office 2's door
  // IT / storage room
  const stL = 34.41;
  const stR = 42.45;
  const stB = 21.85;

  const walls: Wall[] = [
    // Exterior / demising walls
    ...wallFt(L, B, [], 'exterior'),
    ...wallFt(B, E1, [], 'exterior'),
    ...wallFt(E1, S2, [[0.48, 36], [3.48, 36]], 'exterior'), // main entry, pair of 3' doors
    ...wallFt(S2, S1, [], 'exterior'),
    ...wallFt(S1, A1, [], 'exterior'),
    ...wallFt(A1, N1, [], 'exterior'),
    ...wallFt(N1, K3, [[0.74, 36]], 'exterior'), // second suite door (building corridor)
    ...wallFt(K3, K2, [], 'exterior'),
    ...wallFt(K2, K1, [], 'exterior'),
    ...wallFt(K1, TL, [], 'exterior'),
    ...wallFt(TL, L, [], 'exterior'),
    // IT / storage room (existing)
    ...wallFt(S(stL, stB), S(stL, T_TOP)),
    ...wallFt(S(stL, stB), S(stR, stB), [[0.5, 36]]), // door in the bottom wall, hinged at the left corner
    ...wallFt(S(stR, stB), S(stR, T_TOP)),
    // Conference room (contractor)
    ...wallFt(S(confL, 0), S(confL, confT), [], 'interior', CONTRACTOR),
    ...wallFt(S(confL, confT), S(confR, confT), [[0.75, 36], [20.67, 36]], 'interior', CONTRACTOR),
    ...wallFt(S(confR, confT), S(confR, 0), [], 'interior', CONTRACTOR),
    // Offices 2–4 (contractor)
    ...wallFt(S(confR, o3T), S(div43, o3T), [[0.4, 36]], 'interior', CONTRACTOR), // Office 4 top wall + door
    ...wallFt(S(div32, o3T), S(div43, o3T), [[0.3, 36]], 'interior', CONTRACTOR), // Office 3 top wall + door
    ...wallFt(S(div43, o3T), S(div43, 0), [], 'interior', CONTRACTOR),
    ...wallFt(S(div32, o3T), S(div32, 0), [], 'interior', CONTRACTOR),
    ...wallFt(S(div32, o3T), o2D, [[0.5, 36]], 'interior', CONTRACTOR), // Office 2 door
    ...wallFt(o2D, o1e, [], 'interior', CONTRACTOR), // Office 2 wall up to Office 1's corner
    // Office 1 (contractor) — right triangle by the main entry
    ...wallFt(o1a, E1, [[0.6, 36]], 'interior', CONTRACTOR),
    ...wallFt(o1a, o1e, [], 'interior', CONTRACTOR),
  ];

  const R = (name: string, type: Room['roomType'], centerFt: Pt[], fill: string, extra: Partial<Room> = {}) =>
    makeRoom(name, type, insetByWalls(centerFt.map((p) => F(p.x, p.y)), walls), fill, extra);
  const Z = (name: string, type: Room['roomType'], interiorFt: Pt[], fill: string, extra: Partial<Room> = {}) =>
    makeRoom(name, type, interiorFt.map((p) => F(p.x, p.y)), fill, extra);
  const fixedRoom = (r: Room): Room => ({ ...r, fixed: CONTRACTOR, locked: true, notes: 'Contractor-fixed per Floor_Plan.pdf. Unlock only if the contractor confirms a change.' });

  const conference = fixedRoom(R('Conference Room', 'conference', [S(confL, 0), S(confR, 0), S(confR, confT), S(confL, confT)], '#e9eef8'));
  const office4 = fixedRoom(R('Office 4', 'office', [S(confR, 0), S(div43, 0), S(div43, o3T), S(confR, o3T)], '#eef0f6'));
  const office3 = fixedRoom(R('Office 3', 'office', [S(div43, 0), S(div32, 0), S(div32, o3T), S(div43, o3T)], '#eef0f6'));
  const office2 = fixedRoom(R('Office 2', 'office', [S(div32, 0), B, o1e, o2D, S(div32, o3T)], '#eef0f6'));
  const office1 = fixedRoom(R('Office 1', 'office', [o1a, o1e, E1], '#eef0f6'));
  const storage = R('IT / Storage', 'it', [S(stL, stB), S(stR, stB), S(stR, T_TOP), S(stL, T_TOP)], '#eceff3');
  const open = R(
    'Open Area',
    'open',
    [L, S(confL, 0), S(confL, confT), S(confR, confT), S(confR, o3T), S(div32, o3T), o2D, o1e, o1a, E1, S2, S1, S(stR, T_TOP), S(stR, stB), S(stL, stB), S(stL, T_TOP), A1, N1, K3, K2, K1, TL],
    '#f5f8f7',
  );
  // Zones inside the open area (no walls of their own). Dimensions are clear floor.
  const ext = 4 / 12; // half of an 8" exterior wall
  // Area A: 16' along the top wall starting at the inside face of the A1–N1 wall, 12' deep.
  const aL = A1.x + ext;
  const aTop = T_TOP - ext;
  const areaA = Z('Cubicle Area A', 'cubicle-area', [S(aL, aTop - 12), S(aL + 16, aTop - 12), S(aL + 16, aTop), S(aL, aTop)], '#e3f4f3', {
    planning: { widthFt: 12, lengthFt: 16, targetMin: 6, targetMax: 8, department: 'Inside Sales / Operations' },
    notes: '12 x 16 ft cube area marked on the plan ("12x16", 6–8 people).',
  });
  // Area B: 12' clear from the left wall to the conference wall, 14' deep (= conference depth).
  const areaB = Z('Cubicle Area B', 'cubicle-area', [S(ext, ext), S(ext + 12, ext), S(ext + 12, ext + 14), S(ext, ext + 14)], '#e3f4f3', {
    planning: { widthFt: 14, lengthFt: 12, targetMin: 6, targetMax: 8, department: 'Team Workstations' },
    notes: '12 ft along the window wall (to the conference room) x 14 ft deep. Page 1 of the PDF also notes "22x12" here.',
  });
  const kitchen = Z('Kitchenette', 'kitchen', [S(ext, 23.5), S(8.5, 23.5), S(8.5, 31.4), S(8.2, T_TOP - ext), S(ext, T_TOP - ext)], '#fdf3e4');
  for (const z of [areaA, areaB, kitchen]) z.label = { ...z.label, fontSize: 11, background: 'rgba(255,255,255,0.85)' };
  areaB.label.offset = { x: 14, y: -24 };
  conference.label.fontSize = 16;
  open.label.offset = { x: -60, y: 90 };
  const rooms = [open, kitchen, areaA, areaB, storage, conference, office1, office2, office3, office4];

  // ---- Doors (positions/swings as drawn).
  const doors = [
    doorFt(E1, S2, 0.48, S(50, 25), 'Main entry (right leaf)'),
    doorFt(S2, E1, 0.48, S(47, 25), 'Main entry (left leaf)'),
    doorFt(N1, K3, 0.74, S(16, 24), 'Suite door (corridor)'),
    doorFt(S(stL, stB), S(stR, stB), 0.5, S(38, 24), 'IT / Storage door'),
    doorFt(S(confL, confT), S(confR, confT), 0.75, S(15, 8), 'Conference door 1', 36, CONTRACTOR),
    doorFt(S(confR, confT), S(confL, confT), 0.75, S(34, 8), 'Conference door 2', 36, CONTRACTOR),
    doorFt(S(confR, o3T), S(div43, o3T), 0.4, S(40, 5), 'Office 4 door', 36, CONTRACTOR),
    doorFt(S(div32, o3T), S(div43, o3T), 0.3, S(57, 5), 'Office 3 door', 36, CONTRACTOR),
    doorFt(S(div32, o3T), o2D, 0.5, S(62, 5), 'Office 2 door', 36, CONTRACTOR),
    doorFt(o1a, E1, 0.6, S(56, 20), 'Office 1 door', 36, CONTRACTOR),
  ];

  // ---- Existing fixtures shown on the plan (no proposed furniture).
  const fx = (id: string, s: number, t: number, name: string, patch: Partial<Furniture> = {}): Furniture => {
    const p = F(s, t);
    return { ...furnitureFromTemplate(tpl(id), p.x, p.y, name, 0), locked: true, notes: 'Shown on Floor_Plan.pdf', ...patch };
  };
  const hvac = (s: number, n: number) =>
    fx('storage-cab', s, ext + 1, `HVAC unit ${n}`, { type: 'custom', width: 24, depth: 24, color: '#c9ced8', deskType: '', notes: 'Dedicated tenant HVAC unit, from the plan' });
  const fixtures: Furniture[] = [
    hvac(5.56, 1),
    hvac(29.97, 2),
    hvac(54.18, 3),
    { ...hvac(77.3, 4), rotation: 0 },
    fx('storage-cab', 1.9, T_TOP - ext - 1, 'Sink', { width: 24, depth: 24, color: '#e3d5bf' }),
    fx('storage-cab', 6.6, T_TOP - ext - 1.25, 'Refrigerator', { width: 30, depth: 30, color: '#e3d5bf' }),
    fx('shelving', 40.0, stB + 0.21 + 0.75, 'Shelving', { rotation: 180 }),
  ];

  // ---- Dimension lines for the marked dimensions.
  const dimFt = (a: Pt, b: Pt, name: string, offset = -24, attach?: { roomId: string; edgeIndex: number }) => ({
    ...makeDimension(F(a.x, a.y), F(b.x, b.y), offset),
    name,
    attach,
  });
  const dims = [
    dimFt(L, L, 'Conference length (24\')', -20, { roomId: conference.id, edgeIndex: 0 }),
    dimFt(L, L, 'Conference width (14\')', -20, { roomId: conference.id, edgeIndex: 1 }),
    dimFt(L, L, 'Area A length (16\')', 20, { roomId: areaA.id, edgeIndex: 2 }),
    dimFt(L, L, 'Area A width (12\')', 20, { roomId: areaA.id, edgeIndex: 3 }),
    dimFt(L, L, 'Area B length (12\')', -20, { roomId: areaB.id, edgeIndex: 0 }),
    dimFt(L, L, 'Area B width (14\')', -20, { roomId: areaB.id, edgeIndex: 3 }),
  ];
  // Attached dimensions follow their room edge (see syncAttachedDimensions), so seed a/b from the edges.
  for (const d of dims) {
    const r = [conference, areaA, areaB].find((x) => x.id === d.attach?.roomId)!;
    const i = d.attach!.edgeIndex;
    d.a = r.points[i];
    d.b = r.points[(i + 1) % r.points.length];
  }
  const street = makeLabel(F(41, -3).x, F(41, -3).y, 'JULIETTE LANE  (window wall)');
  street.style = { ...street.style, color: '#4a5670', fontSize: 12, fontWeight: 'bold' };
  street.name = 'Street label';
  const source = makeLabel(F(66, 32).x, F(66, 32).y, 'Traced from Floor_Plan.pdf (scale ±6"). Conference room and Offices 1–4 are contractor-fixed.');
  source.style = { ...source.style, color: '#d62828', fontSize: 9, background: '#fff5f5' };
  source.name = 'Source note';

  const base: PlanObject[] = [...rooms, ...walls, ...doors, ...fixtures, ...dims, street, source];
  return { base, areaA, areaB };
}

function scenarioFrom(name: string, description: string, objects: PlanObject[]): Scenario {
  const now = new Date().toISOString();
  return { id: uid('s'), name, description, objects, revision: 1, createdAt: now, updatedAt: now };
}

/** Generate workstations for both cubicle areas (used by tests and on request; not in the starter layouts). */
export function withGenerated(objects: PlanObject[], key: OptionKey, employees: number, settings: PlanSettings = DEFAULT_SETTINGS): PlanObject[] {
  const base = structuredClone(objects) as PlanObject[];
  const placed: Furniture[] = [];
  const areas = base.filter((o): o is Room => o.kind === 'room' && o.roomType === 'cubicle-area');
  areas.forEach((area, ai) => {
    const opts = generateLayouts({
      room: area,
      context: base,
      employees,
      cubicleWidth: 48,
      cubicleDepth: 48,
      minAisle: settings.minAisleWidth,
      orientation: 'auto',
      arrangement: 'auto',
      department: area.planning?.department,
      settings,
    });
    const opt = opts.find((o) => o.key === key)!;
    const prefix = String.fromCharCode(65 + ai);
    opt.furniture.forEach((f, i) => placed.push({ ...f, id: uid('f'), name: `${f.type === 'cubicle' ? 'Cubicle' : 'Desk'} ${prefix}-${String(i + 1).padStart(2, '0')}` }));
  });
  return [...base, ...placed];
}

export function createSampleProject(): Project {
  const suite = buildSuite();
  const now = new Date().toISOString();
  const plan = () => structuredClone(suite.base) as PlanObject[];
  // Every starter layout is the plan exactly as drawn; cubicle areas are left empty to fill in.
  const scenarios = [
    scenarioFrom('Layout 1 — Six Employees Per Area', 'Starts as the floor plan as drawn.', plan()),
    scenarioFrom('Layout 2 — Eight Employees Per Area', 'Starts as the floor plan as drawn.', plan()),
    scenarioFrom('Layout 3 — Shared Desks', 'Starts as the floor plan as drawn.', plan()),
    scenarioFrom('Layout 4 — Maximum Seating Capacity', 'Starts as the floor plan as drawn.', plan()),
    scenarioFrom('Layout 5 — Future Expansion', 'Starts as the floor plan as drawn.', plan()),
  ];
  return {
    schema: 'trinity-floor-plan',
    version: 1,
    name: 'Trinity Office Suite',
    settings: { ...DEFAULT_SETTINGS },
    layers: structuredClone(DEFAULT_LAYERS),
    scenarios,
    activeScenarioId: scenarios[0].id,
    customTemplates: [],
    employees: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createBlankProject(): Project {
  const now = new Date().toISOString();
  const s = scenarioFrom('Layout 1', 'Blank layout', []);
  return {
    schema: 'trinity-floor-plan',
    version: 1,
    name: 'Untitled floor plan',
    settings: { ...DEFAULT_SETTINGS },
    layers: structuredClone(DEFAULT_LAYERS),
    scenarios: [s],
    activeScenarioId: s.id,
    customTemplates: [],
    employees: [],
    createdAt: now,
    updatedAt: now,
  };
}

export { FT };
