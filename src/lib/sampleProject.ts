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
import { furnitureFromTemplate, makeAisle, makeDimension, makeDoor, makeLabel, makeRoom, makeWall, uid } from './objects';
import { generateLayouts, type OptionKey } from './generator';
import { TRINITY_ADDRESS, trinityInventory } from './inventory';

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

/**
 * World placement: y = 0 lies 32 ft in from the window wall (where the traced top wall was) and
 * world y grows downward. Kept fixed so cubicles placed in earlier versions stay where they were.
 */
const Y0 = 32;
const F = (s: number, t: number): Pt => ({ x: s * 12, y: (Y0 - t) * 12 });

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
  // ---- Key points (feet). Clear (inside) sizes come from the on-site measurements of
  // Nov 2026 (hand sketch); shapes not measured there keep the Floor_Plan.pdf trace.
  const ext = 4 / 12; // half of an 8" exterior wall
  const IW = 2.5 / 12; // half of a 5" interior wall
  // Left wall (measured): Cubicle Area B 22'-0" clear, then the kitchenette 11'-8" clear.
  const kB = ext + 22 + IW; // kitchenette bottom wall centerline
  const T_TOP = kB + IW + (11 + 8 / 12) + ext; // top (window-less) wall centerline
  // Kitchenette (measured): 10'-3" clear wide; its right wall (with the door) is 9'-6" clear up
  // to the angled wall, which cuts the corner back to the top wall.
  const kR = ext + 10.25 + IW; // right wall centerline
  const K2 = S(kR, kB + IW + 9.5 + ext);
  const K1 = S(kR - (T_TOP - K2.y), T_TOP);
  // Nov 2026 change: the kitchen's door wall moves left to run straight down from K1 (the corner at
  // the end of its 7'-9" top wall), so the kitchen is a plain rectangle and the angled corner is outside it.
  const kW = K1.x; // kitchen door wall centerline
  const TL = S(0, T_TOP);
  const L = S(0, 0); // left corner on the window wall
  // Corridor door bay between the kitchenette and Cubicle Area A (on-site sketch): the door sits in a
  // straight wall level with the kitchenette's corner, and a short jog joins it to the top wall.
  const N1 = S(17.8, K2.y);
  const A1 = S(17.8, T_TOP);
  const corrL = N1.x - K2.x; // door wall length (centerline)
  // IT / storage room (measured): 8'-6" along the top wall x 12'-0" deep, right after Area A's 16'.
  const stL = A1.x + ext + 16 + IW;
  const stR = stL + IW + 8.5 + IW;
  const stB = T_TOP - ext - 12 - IW;
  // Main-entry jog (as traced).
  const S1 = S(stR + 0.35, T_TOP);
  const S2 = S(S1.x + 2.4, T_TOP - 2);
  const E1 = S(S2.x + 6.96, T_TOP - 2); // top of the angled wall at the main entry
  // Window wall (measured, clear): Area B 12', conference 24', Office 4 12', Office 3 12', Office 2 17'.
  const confL = ext + 12 + IW;
  const confR = confL + IW + 24 + IW;
  const confT = ext + 14 + IW; // conference room 14'-0" deep
  const div43 = confR + IW + 12 + IW;
  const div32 = div43 + IW + 12 + IW;
  const o2In = div32 + IW + 17; // Office 2's inside corner at the window wall
  // The angled wall runs from E1 down to the window wall, through Office 2's inside corner.
  // m = rise (t) per foot of s along its inside face.
  const m = (() => {
    const D = o2In - E1.x;
    const c = E1.y - ext;
    const a = D * D - ext * ext;
    return (c * D - Math.sqrt(c * c * D * D - a * (c * c - ext * ext))) / a;
  })();
  const r = Math.hypot(1, m);
  const B = S(o2In + (ext + ext * r) / m, 0); // far tip where the angled wall meets the window wall
  // Office 1: right triangle by the main entry. Measured 13'-0" clear along its door wall, then the
  // bottom wall was pushed 2'-0" further toward the window wall (Nov 2026 decision); labelled 14' x 12'.
  // The door wall runs straight up to E1; the bottom wall runs level to the angled wall.
  const o1Top = ext + (o2In - (E1.x + IW)) * m; // inside top corner, on the angled wall
  const o1a = S(E1.x, o1Top - 13 - 2 - IW); // the right-angle corner
  const o1e = S(o2In - (o1a.y - ext - ext * r) / m, o1a.y); // where its bottom wall meets the angled wall
  // Offices 2, 3 and 4 (measured): 12'-0" deep. Their top wall is one straight line that runs
  // from the conference room out to the angled wall; Office 2's door is in it.
  const o3T = ext + 12 + IW;
  const o2T = S(o2In - (o3T - ext - ext * r) / m, o3T); // where that wall meets the angled wall
  // 5'-0" walkway between the conference room and Cubicle Area A.
  const walkB = confT + IW; // conference room's top face
  const walkT = walkB + 5;

  const walls: Wall[] = [
    // Exterior / demising walls
    ...wallFt(L, B, [], 'exterior'),
    ...wallFt(B, E1, [], 'exterior'),
    ...wallFt(E1, S2, [[0.48, 36], [3.48, 36]], 'exterior'), // main entry, pair of 3' doors
    ...wallFt(S2, S1, [], 'exterior'),
    ...wallFt(S1, A1, [], 'exterior'),
    ...wallFt(A1, N1, [], 'exterior'),
    ...wallFt(K2, N1, [[corrL - 1 / 3 - 3, 36]], 'exterior'), // second suite door (building corridor), by the jog
    ...wallFt(K2, K1, [], 'exterior'),
    ...wallFt(K1, TL, [], 'exterior'),
    ...wallFt(TL, S(0, kB), [], 'exterior'), // left wall beside the kitchenette
    ...wallFt(S(0, kB), L, [], 'exterior'), // left wall beside Cubicle Area B (22' clear)
    // IT / storage room (existing)
    ...wallFt(S(stL, stB), S(stL, T_TOP)),
    ...wallFt(S(stL, stB), S(stR, stB), [[stR - stL - 0.5 - 3, 36]]), // door in the bottom wall, hinged at the right corner
    ...wallFt(S(stR, stB), S(stR, T_TOP)),
    // Kitchenette: no walls or door of its own for now (Nov 2026: not built yet). The Kitchen room
    // keeps its outline as a zone, so Area B still stops 5" short of it where the wall would be.
    // Conference room (contractor)
    ...wallFt(S(confL, 0), S(confL, confT), [], 'interior', CONTRACTOR),
    ...wallFt(S(confL, confT), S(confR, confT), [[0.75, 36], [20.67, 36]], 'interior', CONTRACTOR),
    // Split where Office 4's top wall meets it, so the Office 4 side reads 12' (the conference side's 14' is its dimension line).
    ...wallFt(S(confR, confT), S(confR, o3T), [], 'interior', CONTRACTOR),
    ...wallFt(S(confR, o3T), S(confR, 0), [], 'interior', CONTRACTOR),
    // Offices 2–4 (contractor)
    ...wallFt(S(confR, o3T), S(div43, o3T), [[0.4, 36]], 'interior', CONTRACTOR), // Office 4 top wall + door
    ...wallFt(S(div32, o3T), S(div43, o3T), [[0.3, 36]], 'interior', CONTRACTOR), // Office 3 top wall + door
    ...wallFt(S(div43, o3T), S(div43, 0), [], 'interior', CONTRACTOR),
    ...wallFt(S(div32, o3T), S(div32, 0), [], 'interior', CONTRACTOR),
    ...wallFt(S(div32, o3T), o2T, [[0.5, 36]], 'interior', CONTRACTOR), // Office 2 top wall + door, out to the angled wall
    // Office 1 (contractor) — right triangle by the main entry
    // Labelled with the marked 13' x 12' (the drawing is not to scale here).
    ...wallFt(o1a, E1, [[0.6, 36]], 'interior', CONTRACTOR).map((w) => ({ ...w, lengthLabel: "14'-0\"" })),
    ...wallFt(o1a, o1e, [], 'interior', CONTRACTOR).map((w) => ({ ...w, lengthLabel: "12'-0\"" })),
  ];

  const R = (name: string, type: Room['roomType'], centerFt: Pt[], fill: string, extra: Partial<Room> = {}) =>
    makeRoom(name, type, insetByWalls(centerFt.map((p) => F(p.x, p.y)), walls), fill, extra);
  const Z = (name: string, type: Room['roomType'], interiorFt: Pt[], fill: string, extra: Partial<Room> = {}) =>
    makeRoom(name, type, interiorFt.map((p) => F(p.x, p.y)), fill, extra);
  const fixedRoom = (r: Room): Room => ({ ...r, fixed: CONTRACTOR, locked: true, notes: 'Contractor-fixed per Floor_Plan.pdf. Unlock only if the contractor confirms a change.' });

  const conference = fixedRoom(R('Conference Room', 'conference', [S(confL, 0), S(confR, 0), S(confR, confT), S(confL, confT)], '#e9eef8'));
  const office4 = fixedRoom(R('Office 4', 'office', [S(confR, 0), S(div43, 0), S(div43, o3T), S(confR, o3T)], '#eef0f6'));
  const office3 = fixedRoom(R('Office 3', 'office', [S(div43, 0), S(div32, 0), S(div32, o3T), S(div43, o3T)], '#eef0f6'));
  const office2 = fixedRoom(R('Office 2', 'office', [S(div32, 0), B, o2T, S(div32, o3T)], '#eef0f6'));
  const office1 = fixedRoom(R('Office 1', 'office', [o1a, o1e, E1], '#eef0f6'));
  const storage = R('IT / Storage', 'it', [S(stL, stB), S(stR, stB), S(stR, T_TOP), S(stL, T_TOP)], '#eceff3');
  const open = R(
    'Open Area',
    'open',
    [L, S(confL, 0), S(confL, confT), S(confR, confT), S(confR, o3T), S(div32, o3T), o2T, o1e, o1a, E1, S2, S1, S(stR, T_TOP), S(stR, stB), S(stL, stB), S(stL, T_TOP), A1, N1, K2, K1, S(kW, kB), S(0, kB)],
    '#f5f8f7',
  );
  // Zones inside the open area (no walls of their own). Dimensions are clear floor.
  // Area A: 16' along the top wall from the inside face of the A1-N1 wall to IT / Storage, from the
  // 5'-0" walkway above the conference room all the way back to the top wall.
  const aL = A1.x + ext;
  const aTop = T_TOP - ext;
  const aDepth = aTop - walkT;
  const areaA = Z('Area A', 'cubicle-area', [S(aL, walkT), S(aL + 16, walkT), S(aL + 16, aTop), S(aL, aTop)], '#e3f4f3', {
    planning: { widthFt: Math.round(aDepth * 100) / 100, lengthFt: 16, targetMin: 6, targetMax: 8, department: 'Inside Sales / Operations' },
    notes: '16 ft cube area (marked "12x16", 6–8 people), from the 5 ft walkway above the conference room back to the top wall.',
  });
  // Area B: 12' clear from the left wall to the conference wall, 22' deep up to the kitchenette wall.
  const areaB = Z('Area B', 'cubicle-area', [S(ext, ext), S(ext + 12, ext), S(ext + 12, ext + 22), S(ext, ext + 22)], '#e3f4f3', {
    planning: { widthFt: 12, lengthFt: 22, targetMin: 6, targetMax: 8, department: 'Team Workstations' },
    notes: '12 ft along the window wall (to the conference room) x 22 ft deep, up to the kitchenette wall ("22x12").',
  });
  // Clear floor as it was with its walls (8'-1" x 11'-8"), now a zone with no walls of its own.
  const kitchen = Z('Kitchen', 'kitchen', [S(ext, kB + IW), S(kW - IW, kB + IW), S(kW - IW, T_TOP - ext), S(ext, T_TOP - ext)], '#fdf3e4');
  const walkway: PlanObject = {
    ...makeAisle(F(aL + 8, 0).x, F(0, (walkB + walkT) / 2).y, 16 * 12, 5 * 12),
    name: "Walkway (5')",
    notes: '5 ft walkway from the conference room to Area A.',
  };
  for (const z of [areaA, areaB, kitchen]) z.label = { ...z.label, fontSize: 11, background: 'rgba(255,255,255,0.85)' };
  areaB.label.offset = { x: 14, y: -24 };
  conference.label.fontSize = 16;
  conference.showArea = false;
  open.label.offset = { x: -60, y: 90 };
  open.hideLabel = true;
  const rooms = [open, kitchen, areaA, areaB, storage, conference, office1, office2, office3, office4];

  // ---- Doors (positions/swings as drawn).
  const doors = [
    doorFt(E1, S2, 0.48, S(50, 25), 'Main entry (right leaf)'),
    doorFt(S2, E1, 0.48, S(47, 25), 'Main entry (left leaf)'),
    doorFt(N1, K2, 1 / 3, S(16, K2.y - 2), 'Suite door (corridor)'), // hinged by the jog, swings in, into the suite
    doorFt(S(stR, stB), S(stL, stB), 0.5, S(40, 24), 'IT / Storage door'),
    doorFt(S(confL, confT), S(confR, confT), 0.75, S(15, 8), 'Conference door 1', 36, CONTRACTOR),
    doorFt(S(confR, confT), S(confL, confT), 0.75, S(34, 8), 'Conference door 2', 36, CONTRACTOR),
    doorFt(S(confR, o3T), S(div43, o3T), 0.4, S(40, 5), 'Office 4 door', 36, CONTRACTOR),
    doorFt(S(div32, o3T), S(div43, o3T), 0.3, S(57, 5), 'Office 3 door', 36, CONTRACTOR),
    doorFt(S(div32, o3T), o2T, 0.5, S(62, 5), 'Office 2 door', 36, CONTRACTOR),
    doorFt(o1a, E1, 0.6, S(56, 20), 'Office 1 door', 36, CONTRACTOR),
  ];

  // ---- Existing fixtures shown on the plan (no proposed furniture).
  const fx = (id: string, s: number, t: number, name: string, patch: Partial<Furniture> = {}): Furniture => {
    const p = F(s, t);
    return { ...furnitureFromTemplate(tpl(id), p.x, p.y, name, 0), locked: true, notes: 'Shown on Floor_Plan.pdf', ...patch };
  };
  // The suite has one dedicated tenant HVAC unit, by the window wall in Cubicle Area B (on-site sketch).
  const fixtures: Furniture[] = [
    fx('storage-cab', 5.56, ext + 1, 'Dedicated tenant HVAC', { type: 'custom', width: 24, depth: 24, color: '#c9ced8', deskType: '', notes: 'Dedicated tenant HVAC unit' }),
    // One kitchen counter on the top wall, about 2'-11" in from the left wall and 2'-3.65" long,
    // ending where the refrigerator (placed by the user) starts; the left corner stays empty.
    fx('storage-cab', 4.052, T_TOP - ext - 1, 'Kitchen counter', { width: 27.65, depth: 24, color: '#e3d5bf' }),
    fx('shelving', stL + IW + 2.05, stB + 0.21 + 0.75, 'Shelving', { rotation: 180 }),
  ];

  // ---- Dimension lines for the marked dimensions.
  const dimFt = (a: Pt, b: Pt, name: string, offset = -24, attach?: { roomId: string; edgeIndex: number }) => ({
    ...makeDimension(F(a.x, a.y), F(b.x, b.y), offset),
    name,
    attach,
  });
  // Offsets are the distance out from the room edge (inches). The long ones that sit against an
  // outside wall are pulled outside the suite so they read clearly when the plan is shown.
  const outside = 30; // past the window wall / left wall
  const overTop = Math.round((T_TOP + ext - aTop) * 12 + 18); // from Area A's top edge to past the top wall
  const dims = [
    dimFt(L, L, 'Conference length (24\')', outside, { roomId: conference.id, edgeIndex: 0 }),
    dimFt(L, L, 'Conference width (14\')', -20, { roomId: conference.id, edgeIndex: 1 }),
    dimFt(L, L, 'Area A length (16\')', overTop, { roomId: areaA.id, edgeIndex: 2 }),
    dimFt(L, L, 'Area A width (12\')', 20, { roomId: areaA.id, edgeIndex: 3 }),
    dimFt(L, L, 'Area B length (12\')', outside, { roomId: areaB.id, edgeIndex: 0 }),
    dimFt(L, L, 'Area B width (22\')', outside, { roomId: areaB.id, edgeIndex: 3 }),
  ];
  // Attached dimensions follow their room edge (see syncAttachedDimensions), so seed a/b from the edges.
  for (const d of dims) {
    const r = [conference, areaA, areaB].find((x) => x.id === d.attach?.roomId)!;
    const i = d.attach!.edgeIndex;
    d.a = r.points[i];
    d.b = r.points[(i + 1) % r.points.length];
    // Point the pulled-out offsets away from their room (+ offsets sit on the perp(a->b) side).
    if (Math.abs(d.offset) < outside) continue;
    const n = perp(norm(sub(d.b, d.a)));
    const c = { x: r.points.reduce((s, p) => s + p.x, 0) / r.points.length, y: r.points.reduce((s, p) => s + p.y, 0) / r.points.length };
    const mid = scale(add(d.a, d.b), 0.5);
    d.offset = ((mid.x - c.x) * n.x + (mid.y - c.y) * n.y > 0 ? 1 : -1) * Math.abs(d.offset);
  }
  const street = makeLabel(F(41, -4.5).x, F(41, -4.5).y, 'JULIETTE LANE  (window wall)');
  street.style = { ...street.style, color: '#4a5670', fontSize: 12, fontWeight: 'bold' };
  street.name = 'Street label';
  const source = makeLabel(F(66, 34).x, F(66, 34).y, 'Traced from Floor_Plan.pdf (scale ±6"). Conference room and Offices 1–4 are contractor-fixed.');
  source.style = { ...source.style, color: '#d62828', fontSize: 9, background: '#fff5f5' };
  source.name = 'Source note';

  const base: PlanObject[] = [...rooms, walkway, ...walls, ...doors, ...fixtures, ...dims, street, source];
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
    address: TRINITY_ADDRESS,
    inventory: trinityInventory(),
    showInventory: true,
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
