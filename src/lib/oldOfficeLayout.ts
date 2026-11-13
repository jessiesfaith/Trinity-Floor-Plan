// The "Old office" tab: the office we are moving from, drawn from a hand sketch. It is its own
// layout (not the Trinity suite): the other tabs leave it alone, and "Update floor plan" only
// redraws its walls, rooms and doors when this drawing has changed (OLD_OFFICE_VERSION), keeping
// the cubicles and anything else added to it. Sizes are rough until measured, except where noted.

import type { PlanObject, Project, Pt, Room, Scenario } from '@/types/plan';
import { BUILT_IN_TEMPLATES } from './library';
import { furnitureFromTemplate, makeDoor, makeLabel, makeRoom, makeWall, uid } from './objects';
import { perp } from './geometry';
import { insetByWalls } from './sampleProject';

export const OLD_OFFICE_PURPOSE = 'old-office' as const;
export const isOldOfficeLayout = (s: Scenario) => s.purpose === OLD_OFFICE_PURPOSE;
export const oldOfficeLayoutOf = (p: Project) => p.scenarios.find(isOldOfficeLayout);

/** Bump when the drawing below changes, so saved Old office tabs get redrawn by Update floor plan. */
export const OLD_OFFICE_VERSION = 2;

const ROUGH = 'Approximate: drawn from the hand sketch, not measured yet.';
const P = (x: number, y: number): Pt => ({ x: x * 12, y: y * 12 }); // feet -> plan inches
const rect = (x0: number, y0: number, x1: number, y1: number) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
const tpl = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;

/** Walls through the given points (feet). */
function walls(type: 'exterior' | 'interior', ...pts: [number, number][]) {
  const out = [];
  for (let i = 1; i < pts.length; i++) out.push(makeWall(P(...pts[i - 1]), P(...pts[i]), type));
  return out;
}

/** The old office, in feet: x to the right, y down; (0, 0) is the outside corner by Office 5. */
export function oldOfficeObjects(): PlanObject[] {
  // Walls are drawn on their centerlines; rooms are the clear floor between wall faces.
  const EXT = 4 / 12; // half an 8" outside wall
  const IW = 2.5 / 12; // half a 5" inside wall
  // Office 1 (measured): 11'-0" x 13'-0" clear, below the outside wall at y 31 and left of the
  // lobby wall at x 10. Conference Room 1 sits right below it.
  const O1L = 10 - IW - 11 - EXT; // outside wall on the left of Office 1 and Conference Room 1
  const O1B = 31 + EXT + 13 + IW; // wall between Office 1 and Conference Room 1
  const CR = 13.5; // Conference Room 1's right wall (the strip beyond it was removed)
  const BOT = 48.5; // bottom outside wall of the lobby, kitchen and IT / Storage
  const wallList = [
    // Outside walls
    ...walls('exterior', [10, 0], [53, 0], [53, BOT], [CR, BOT], [CR, 60], [O1L, 60], [O1L, 31], [10, 31], [10, 0]),
    // Offices along the hallway
    ...walls('interior', [20.5, 0], [20.5, 31]),
    ...walls('interior', [10, 12], [20.5, 12]),
    ...walls('interior', [10, 18], [20.5, 18]),
    ...walls('interior', [10, 24], [20.5, 24]),
    ...walls('interior', [10, 31], [20.5, 31]),
    // Office 1: its door (to the lobby) is near the bottom of its right wall.
    ...walls('interior', [10, 31], [10, 41]),
    ...walls('interior', [10, 44], [10, O1B]),
    ...walls('interior', [O1L, O1B], [10, O1B]), // Office 1 / Conference Room 1
    // Conference Room 1's top-right corner is two doors: in its top wall (x 10 to CR) and in its
    // right wall (y O1B to BOT), both onto the lobby.
    // Kitchen, IT / Storage and Conference Room 2
    ...walls('interior', [25, 31], [25, BOT]),
    ...walls('interior', [25, 31], [53, 31]),
    ...walls('interior', [41, 20], [53, 20]),
    ...walls('interior', [41, 20], [41, 31.5]),
    ...walls('interior', [41, 34.5], [41, BOT]),
  ];
  // The outside wall above Office 1 reads as the office's measured 11' width.
  for (const w of wallList) if (w.a.x === 10 * 12 && w.a.y === 31 * 12 && w.b.x === O1L * 12) w.lengthLabel = "11'-0\"";
  const room = (name: string, type: Room['roomType'], centerline: Pt[], fill: string, notes = ROUGH) =>
    makeRoom(name, type, insetByWalls(centerline, wallList), fill, { notes });

  const objs: PlanObject[] = [
    room('Office 5', 'office', rect(10, 0, 20.5, 12), '#eef0f6'),
    room('Office 4', 'office', rect(10, 12, 20.5, 18), '#eef0f6'),
    room('Office 3', 'office', rect(10, 18, 20.5, 24), '#eef0f6'),
    room('Office 2', 'office', rect(10, 24, 20.5, 31), '#eef0f6'),
    room('Office 1', 'office', rect(O1L, 31, 10, O1B), '#eef0f6', "Measured: 11' x 13' clear."),
    room('Lobby', 'entrance', [P(10, 31), P(25, 31), P(25, BOT), P(CR, BOT), P(CR, O1B), P(10, O1B)], '#f4f6f9'),
    room('Conference Room 1', 'conference', rect(O1L, O1B, CR, 60), '#e9eef8'),
    room('Printer area', 'open', rect(25, 0, 41, 6), '#f4f6f9'),
    // The hallway by the offices is open to the cubicles, so it is part of the same area.
    room('Cubicle area', 'cubicle-area', [P(20.5, 0), P(25, 0), P(25, 6), P(41, 6), P(41, 31), P(20.5, 31)], '#e3f4f3'),
    room('Cubicle area 2', 'cubicle-area', rect(41, 0, 53, 20), '#e3f4f3'),
    room('Conference Room 2', 'conference', rect(41, 20, 53, 31), '#e9eef8'),
    room('Kitchen', 'kitchen', rect(25, 31, 41, BOT), '#fbf3e4'),
    room('IT / Storage', 'it', rect(41, 31, 53, BOT), '#eef2f7'),
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
  objs.push(
    door([41, 31.5], { x: 0, y: 1 }, [45, 33], 'IT / Storage door'), // from the kitchen side
    door([10, 44], { x: 0, y: -1 }, [8, 42], 'Office 1 door'), // from the lobby
    door([10 + IW, O1B], { x: 1, y: 0 }, [11.5, 42], 'Conference Room 1 door (top)'), // swings out to the lobby
    door([CR, BOT - EXT], { x: 0, y: -1 }, [15, 46.5], 'Conference Room 1 door (side)'),
  );

  // The cubicle areas are left empty: cubicles are added by hand.

  // A few fixtures from the sketch.
  objs.push(
    { ...furnitureFromTemplate(tpl('conf-8'), ((O1L + CR) / 2) * 12, ((O1B + 60) / 2) * 12, 'Conference table', 90), notes: ROUGH },
    { ...furnitureFromTemplate(tpl('conf-8'), 47 * 12, 25.5 * 12, 'Conference table', 90), notes: ROUGH },
    { ...furnitureFromTemplate(tpl('printer'), 33 * 12, 3 * 12, 'Printer / copier') },
    { ...furnitureFromTemplate(tpl('storage-cab'), 32 * 12, BOT * 12 - 17, 'Kitchen counter'), width: 144, depth: 24, notes: ROUGH },
  );

  const note = makeLabel(O1L * 12, 63 * 12, 'Old office: rough layout from the hand sketch. Sizes are placeholders until measured.');
  objs.push({ ...note, style: { ...note.style, fontSize: 14, color: '#b45309' } });
  return objs;
}

function oldOfficeLayout(): Scenario {
  const now = new Date().toISOString();
  return {
    id: uid('s'),
    name: 'Old office',
    description: 'The office we are moving from (rough layout from a hand sketch).',
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

/**
 * Redraw an outdated Old office tab from the current drawing: its walls, rooms, doors and the
 * pieces the drawing places (tables, printer, counter, note) are replaced; everything else added
 * to it (cubicles, furniture, labels) stays where it is.
 */
export function refreshOldOffice(s: Scenario): Scenario {
  if (!oldOfficeIsOutdated(s)) return s;
  const fresh = oldOfficeObjects();
  const drawn = new Set(fresh.filter((o) => !isStructure(o)).map(keyOf));
  const kept = s.objects.filter((o) => !isStructure(o) && !drawn.has(keyOf(o)));
  return { ...s, objects: [...fresh, ...kept], layoutVersion: OLD_OFFICE_VERSION, revision: s.revision + 1, updatedAt: new Date().toISOString() };
}
