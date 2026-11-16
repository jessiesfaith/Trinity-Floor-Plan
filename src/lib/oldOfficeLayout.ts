// The "Old office" tab: the office we are moving from, drawn from the architect's floor plan. It is
// its own layout (not the Trinity suite): the other tabs leave it alone, and "Update floor plan"
// only redraws its walls, rooms and doors when this drawing has changed (OLD_OFFICE_VERSION),
// keeping the cubicles and anything else added to it.

import type { PlanObject, Project, Pt, Room, Scenario } from '@/types/plan';
import { BUILT_IN_TEMPLATES } from './library';
import { furnitureFromTemplate, makeDoor, makeLabel, makeRoom, makeWall, uid } from './objects';
import { perp } from './geometry';
import { insetByWalls } from './sampleProject';

export const OLD_OFFICE_PURPOSE = 'old-office' as const;
export const isOldOfficeLayout = (s: Scenario) => s.purpose === OLD_OFFICE_PURPOSE;
export const oldOfficeLayoutOf = (p: Project) => p.scenarios.find(isOldOfficeLayout);

/** Bump when the drawing below changes, so saved Old office tabs get redrawn by Update floor plan. */
export const OLD_OFFICE_VERSION = 11;

const PLAN = "From the architect's floor plan (Suite 201).";
// The drawing is shifted so its open cubicle area lands where the earlier sketch's cubicle area
// was: cubicles added by hand to older copies of this tab stay in the open area.
const OX = 2;
const OY = -12.5;
const P = (x: number, y: number): Pt => ({ x: (x + OX) * 12, y: (y + OY) * 12 }); // feet -> plan inches
const rect = (x0: number, y0: number, x1: number, y1: number) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
const tpl = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;

/** Walls through the given points (feet). */
function walls(type: 'exterior' | 'interior', ...pts: [number, number][]) {
  const out = [];
  for (let i = 1; i < pts.length; i++) out.push(makeWall(P(...pts[i - 1]), P(...pts[i]), type));
  return out;
}

/**
 * The old office (2804 Mission College Blvd, Suite 201), in feet from the architect's floor plan:
 * x to the right, y down, 0,0 at the top-left corner of Office 1. Offices 1, 2, 3 and 5 run along
 * the top wall; the Conference room and Office 4 sit above and left of them; the Entry, Break,
 * Server and Demo rooms are on the left, and the open cubicle area fills the rest. Room sizes are
 * the plan's; the rest is scaled from the drawing.
 */
export function oldOfficeObjects(): PlanObject[] {
  // Walls are drawn on their centerlines; rooms are the clear floor between wall faces.
  const EXT = 4 / 12; // half an 8" outside wall
  const IW = 2.5 / 12; // half a 5" inside wall
  const ft = (f: number, i = 0) => f + i / 12;
  // Offices along the top wall: 8'4", 8'4", 9'7" and 19'6" wide, all 11'6" deep.
  const X1 = IW + ft(8, 4) + IW; // Office 1 / Office 2
  const X2 = X1 + IW + ft(8, 4) + IW; // Office 2 / Office 3
  const X3 = X2 + IW + ft(9, 7) + IW; // Office 3 / Office 5
  const RX = X3 + IW + ft(19, 6) + EXT; // right outside wall (about 47' from Office 1's left wall)
  const YB = EXT + ft(11, 6) + IW; // offices' bottom wall
  // Office 4 (9' x 12'9") and the Conference room (12'9" deep) above the Entry.
  const O4L = -EXT - 9 - IW; // Office 4 / Conference (Office 4's right wall is an outside wall)
  const T = -IW - ft(12, 9) - EXT; // top outside wall of Office 4 and the Conference room
  // The plan writes 39' on the Conference room, but drawn to scale it is about 30' wide (39' with
  // Office 4), so it is drawn 30' wide.
  const CL = O4L - IW - 30 - EXT;
  const EL = -18; // Entry's left wall, with the double doors to the common lobby
  // 19'3" from the offices down to the Demo room (12' x 10', glass front); the Break and Server
  // rooms are left of it.
  const DT = YB + IW + ft(19, 3) + IW; // Demo room's glass front
  const BOT = DT + IW + 10 + EXT; // bottom outside wall
  const DR = IW + 12 + IW; // Demo room's right wall
  const BL = -15; // Break and Server rooms' left wall
  const ES = 18.25; // Entry / Break room
  const SV = 35; // Break room / Server room
  const CUT = 2.5; // the Server room's cut-off corner

  const wallList = [
    // Outside walls (gaps for the back door and the Entry's double doors)
    ...walls('exterior', [CL, T], [O4L, T], [0, T], [0, 0], [X1, 0], [X2, 0], [X3, 0], [RX, 0], [RX, YB], [RX, BOT - 4]),
    ...walls('exterior', [RX, BOT - 1], [RX, BOT], [DR, BOT], [0, BOT], [BL + CUT, BOT], [BL, BOT - CUT], [BL, ES], [EL, ES], [EL, 11]),
    ...walls('exterior', [EL, 5], [EL, 0]),
    ...walls('exterior', [CL, 0], [CL, T]), // Conference room's left wall
    ...walls('interior', [EL, 0], [CL, 0]), // Conference / common lobby
    // Office 4 / Conference, and their walls onto the Entry (each with a door)
    ...walls('interior', [O4L, T], [O4L, 0]),
    ...walls('interior', [EL, 0], [-17.5, 0]),
    ...walls('interior', [-14.5, 0], [O4L, 0]),
    ...walls('interior', [O4L, 0], [O4L + 1, 0]),
    ...walls('interior', [O4L + 4, 0], [0, 0]),
    // Offices 1, 2, 3 and 5
    ...walls('interior', [0, 0], [0, YB]),
    ...walls('interior', [X1, 0], [X1, YB]),
    ...walls('interior', [X2, 0], [X2, YB]),
    ...walls('interior', [X3, 0], [X3, YB]),
    ...walls('interior', [0, YB], [1, YB]),
    ...walls('interior', [4, YB], [X2 - 4, YB]),
    ...walls('interior', [X2 - 1, YB], [X2 + 1, YB]),
    ...walls('interior', [X2 + 4, YB], [X3 + 1, YB]),
    ...walls('interior', [X3 + 4, YB], [RX, YB]),
    // Break room and Server room
    ...walls('interior', [BL, ES], [0, ES]),
    ...walls('interior', [0, ES], [0, ES + 0.5]),
    ...walls('interior', [0, ES + 3.5], [0, BOT]),
    ...walls('interior', [BL, SV], [-4, SV]),
    ...walls('interior', [-1, SV], [0, SV]),
    // Demo room: glass front with its door at the left
    ...walls('interior', [0, DT], [0.75, DT]),
    ...walls('interior', [3.75, DT], [DR, DT]),
    ...walls('interior', [DR, DT], [DR, BOT]),
  ];
  // Wall lengths as the architect's plan writes them. Each labelled wall shows the plan's number
  // in place of its drawn length; walls the plan gives no number for show their drawn length.
  const on = (w: (typeof wallList)[number], a: [number, number], b: [number, number]) => {
    const A = P(...a);
    const B = P(...b);
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    const along = (q: Pt) => ((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / L;
    const off = (q: Pt) => Math.abs((q.x - A.x) * (B.y - A.y) - (q.y - A.y) * (B.x - A.x)) / L;
    return [w.a, w.b].every((q) => off(q) < 0.5 && along(q) > -0.5 && along(q) < L + 0.5);
  };
  const PLAN_LENGTHS: [[number, number], [number, number], string][] = [
    [[CL, T], [O4L, T], "39'-0\""], // Conference (as written on the plan)
    [[CL, 0], [CL, T], "12'-9\""],
    [[O4L, T], [O4L, 0], "12'-9\""],
    [[O4L, T], [0, T], "9'-0\""], // Office 4
    [[0, T], [0, 0], "12'-9\""],
    [[0, 0], [X1, 0], "8'-4\""], // Office 1
    [[X1, 0], [X2, 0], "8'-4\""], // Office 2
    [[X2, 0], [X3, 0], "9'-7\""], // Office 3
    [[X3, 0], [RX, 0], "19'-6\""], // Office 5
    [[0, 0], [0, YB], "11'-6\""],
    [[X1, 0], [X1, YB], "11'-6\""],
    [[X2, 0], [X2, YB], "11'-6\""],
    [[X3, 0], [X3, YB], "11'-6\""],
    [[RX, 0], [RX, YB], "11'-6\""],
    [[0, YB], [RX, YB], "47'-0\""], // the offices' front wall: the plan's overall 47'
    [[0, DT], [DR, DT], "12'-0\""], // Demo room
    [[DR, DT], [DR, BOT], "10'-0\""],
    [[0, BOT], [DR, BOT], "12'-0\""],
  ];
  for (const w of wallList) for (const [a, b, text] of PLAN_LENGTHS) if (on(w, a, b)) w.lengthLabel = text;

  const room = (name: string, type: Room['roomType'], centerline: Pt[], fill: string, notes = PLAN) =>
    makeRoom(name, type, insetByWalls(centerline, wallList), fill, { notes });

  const objs: PlanObject[] = [
    room('Conference', 'conference', rect(CL, T, O4L, 0), '#e9eef8', "12'9\" deep. The plan says 39' wide; drawn about 30' to match the drawing's scale."),
    room('Office 4', 'office', rect(O4L, T, 0, 0), '#eef0f6', "Architect's plan: 9' x 12'9\"."),
    room('Office 1', 'office', rect(0, 0, X1, YB), '#eef0f6', "Architect's plan: 8'4\" x 11'6\"."),
    room('Office 2', 'office', rect(X1, 0, X2, YB), '#eef0f6', "Architect's plan: 8'4\" x 11'6\"."),
    room('Office 3', 'office', rect(X2, 0, X3, YB), '#eef0f6', "Architect's plan: 9'7\" x 11'6\"."),
    room('Office 5', 'office', rect(X3, 0, RX, YB), '#eef0f6', "Architect's plan: 19'6\" x 11'6\"."),
    room('Entry', 'entrance', rect(EL, 0, 0, ES), '#f4f6f9'),
    room('Break Room', 'kitchen', rect(BL, ES, 0, SV), '#fbf3e4'),
    room('Server Room', 'it', [P(BL, SV), P(0, SV), P(0, BOT), P(BL + CUT, BOT), P(BL, BOT - CUT)], '#eef2f7'),
    room('Demo Room', 'conference', rect(0, DT, DR, BOT), '#e9eef8', "Architect's plan: 12' x 10', glass front."),
    // The open area below the offices, where the cubicles go; it opens onto the Entry.
    room('Cubicle area', 'cubicle-area', [P(0, YB), P(RX, YB), P(RX, BOT), P(DR, BOT), P(DR, DT), P(0, DT)], '#e3f4f3'),
    ...wallList,
  ];

  /** A 3' door hinged at `at` (feet) in a wall running along `dir`, swinging toward `into`. */
  const door = (at: [number, number], dir: Pt, into: [number, number], name: string) => {
    const hinge = P(...at);
    const to = P(...into);
    const side = perp(dir);
    const swing: 1 | -1 = side.x * (to.x - hinge.x) + side.y * (to.y - hinge.y) > 0 ? 1 : -1;
    return makeDoor(hinge.x, hinge.y, (Math.atan2(dir.y, dir.x) * 180) / Math.PI, 36, swing, name);
  };
  const R = { x: 1, y: 0 };
  const L = { x: -1, y: 0 };
  const D = { x: 0, y: 1 };
  const U = { x: 0, y: -1 };
  objs.push(
    door([-14.5, 0], L, [-16, -2], 'Conference door'),
    door([O4L + 1, 0], R, [O4L + 2.5, -2], 'Office 4 door'),
    door([1, YB], R, [2.5, YB - 2], 'Office 1 door'),
    door([X2 - 1, YB], L, [X2 - 2.5, YB - 2], 'Office 2 door'),
    door([X2 + 1, YB], R, [X2 + 2.5, YB - 2], 'Office 3 door'),
    door([X3 + 1, YB], R, [X3 + 2.5, YB - 2], 'Office 5 door'),
    door([EL, 5], D, [EL + 2, 6.5], 'Entry door (left)'),
    door([EL, 11], U, [EL + 2, 9.5], 'Entry door (right)'),
    door([0, ES + 0.5], D, [-2, ES + 2], 'Break Room door'),
    door([-1, SV], L, [-2.5, SV + 2], 'Server Room door'),
    door([0.75, DT], R, [2.25, DT + 2], 'Demo Room door'),
    door([RX, BOT - 1], U, [RX - 2, BOT - 2.5], 'Back door'),
  );

  // The cubicle area is left empty: cubicles are added by hand.

  // A few fixtures from the plan.
  const conf = P((CL + O4L) / 2, T / 2);
  const counter = P(BL + EXT + 1.1, (ES + SV) / 2);
  const printer = P(RX - 3.5, 26);
  objs.push(
    furnitureFromTemplate(tpl('conf-12'), conf.x, conf.y, 'Conference table'),
    furnitureFromTemplate(tpl('printer'), printer.x, printer.y, 'Printer / copier'),
    { ...furnitureFromTemplate(tpl('storage-cab'), counter.x, counter.y, 'Break room counter', 90), width: 96, depth: 24 },
  );

  const n = P(CL, BOT + 4);
  const note = makeLabel(n.x, n.y, "Old office: from the architect's floor plan (2804 Mission College Blvd, Suite 201).");
  objs.push({ ...note, style: { ...note.style, fontSize: 14, color: '#b45309' } });
  return objs;
}

function oldOfficeLayout(): Scenario {
  const now = new Date().toISOString();
  return {
    id: uid('s'),
    name: 'Old office',
    description: "The office we are moving from (from the architect's floor plan).",
    objects: oldOfficeObjects(),
    purpose: OLD_OFFICE_PURPOSE,
    layoutVersion: OLD_OFFICE_VERSION,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** Open the Old office tab, making its layout the first time. */
export function openOldOffice(p: Project): Project {
  const s = oldOfficeLayoutOf(p);
  if (s) return { ...p, activeScenarioId: s.id };
  const fresh = oldOfficeLayout();
  return { ...p, scenarios: [...p.scenarios, fresh], activeScenarioId: fresh.id };
}

/** A saved Old office tab drawn from an earlier version of the sketch. */
export const oldOfficeIsOutdated = (s: Scenario) => isOldOfficeLayout(s) && (s.layoutVersion ?? 1) < OLD_OFFICE_VERSION;

const isStructure = (o: PlanObject) => o.kind === 'wall' || o.kind === 'room' || o.kind === 'door';
const keyOf = (o: PlanObject) => `${o.kind}:${o.name}`;
/** Pieces earlier drawings placed that this one no longer has. */
const RETIRED = new Set([
  'furniture:Kitchen counter',
  'label:Old office: rough layout',
  // The dimension lines of version 9 (wall lengths carry the plan's numbers instead).
  ...['Conference', 'Office 1', 'Office 2', 'Office 3', 'Office 4', 'Office 5', 'Entry', 'Break Room', 'Server Room', 'Demo Room'].flatMap((n) => [`dimension:${n} width`, `dimension:${n} depth`]),
  ...['Offices to Demo Room', 'Cubicle area depth', 'Cubicle area width', 'Conference and Office 4 outside', 'Office 1 to right wall'].map((n) => `dimension:${n}`),
]);

/**
 * Redraw an outdated Old office tab from the current drawing: its walls, rooms, doors and the
 * pieces the drawing places (tables, printer, counter, note) are replaced; everything else added
 * to it (cubicles, furniture, labels) stays where it is.
 */
export function refreshOldOffice(s: Scenario): Scenario {
  if (!oldOfficeIsOutdated(s)) return s;
  const fresh = oldOfficeObjects();
  const drawn = new Set(fresh.filter((o) => !isStructure(o)).map(keyOf));
  const kept = s.objects.filter((o) => !isStructure(o) && !drawn.has(keyOf(o)) && !RETIRED.has(keyOf(o)));
  return { ...s, objects: [...fresh, ...kept], layoutVersion: OLD_OFFICE_VERSION, revision: s.revision + 1, updatedAt: new Date().toISOString() };
}
