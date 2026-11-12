// The "Old office" tab: the office we are moving from, drawn from a hand sketch. It is its own
// layout (not the Trinity suite), so "Update floor plan" and the other tabs leave it alone.
// Sizes are rough until the real measurements are in: every room is marked approximate.

import type { PlanObject, Project, Pt, Room, Scenario } from '@/types/plan';
import { BUILT_IN_TEMPLATES } from './library';
import { furnitureFromTemplate, makeDoor, makeLabel, makeRoom, makeWall, uid } from './objects';
import { perp } from './geometry';

export const OLD_OFFICE_PURPOSE = 'old-office' as const;
export const isOldOfficeLayout = (s: Scenario) => s.purpose === OLD_OFFICE_PURPOSE;
export const oldOfficeLayoutOf = (p: Project) => p.scenarios.find(isOldOfficeLayout);

const ROUGH = 'Approximate: drawn from the hand sketch, not measured yet.';
const P = (x: number, y: number): Pt => ({ x: x * 12, y: y * 12 }); // feet -> plan inches
const rect = (x0: number, y0: number, x1: number, y1: number) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
const tpl = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;

function room(name: string, type: Room['roomType'], pts: Pt[], fill: string): Room {
  return makeRoom(name, type, pts, fill, { notes: ROUGH });
}

/** Walls through the given points (feet). */
function walls(type: 'exterior' | 'interior', ...pts: [number, number][]) {
  const out = [];
  for (let i = 1; i < pts.length; i++) out.push(makeWall(P(...pts[i - 1]), P(...pts[i]), type));
  return out;
}

/** The old office, in feet: x to the right, y down; (0, 0) is the outside corner by Office 5. */
export function oldOfficeObjects(): PlanObject[] {
  const objs: PlanObject[] = [
    // Rooms
    room('Office 5', 'office', rect(10, 0, 20.5, 12), '#eef0f6'),
    room('Office 4', 'office', rect(10, 12, 20.5, 18), '#eef0f6'),
    room('Office 3', 'office', rect(10, 18, 20.5, 24), '#eef0f6'),
    room('Office 2', 'office', rect(10, 24, 20.5, 31), '#eef0f6'),
    // Office 1 runs down to Conference Room 1, with a door between them.
    room('Office 1', 'office', rect(0, 31, 10, 47), '#eef0f6'),
    room('Lobby', 'entrance', rect(10, 31, 25, 47), '#f4f6f9'),
    room('Conference Room 1', 'conference', rect(0, 47, 17, 63), '#e9eef8'),
    room('Printer area', 'open', rect(25, 0, 41, 6), '#f4f6f9'),
    // The hallway by the offices is open to the cubicles, so it is part of the same area.
    room('Cubicle area', 'cubicle-area', [P(20.5, 0), P(25, 0), P(25, 6), P(41, 6), P(41, 31), P(20.5, 31)], '#e3f4f3'),
    room('Cubicle area 2', 'cubicle-area', rect(41, 0, 53, 20), '#e3f4f3'),
    room('Conference Room 2', 'conference', rect(41, 20, 53, 31), '#e9eef8'),
    room('Kitchen', 'kitchen', rect(25, 31, 41, 47), '#fbf3e4'),
    room('IT / Storage', 'it', rect(41, 31, 53, 47), '#eef2f7'),
    // Outside walls
    ...walls('exterior', [10, 0], [53, 0], [53, 47], [17, 47], [17, 63], [0, 63], [0, 31], [10, 31], [10, 0]),
    // Offices along the hallway
    ...walls('interior', [20.5, 0], [20.5, 31]),
    ...walls('interior', [10, 12], [20.5, 12]),
    ...walls('interior', [10, 18], [20.5, 18]),
    ...walls('interior', [10, 24], [20.5, 24]),
    ...walls('interior', [10, 31], [20.5, 31]),
    ...walls('interior', [10, 31], [10, 47]),
    ...walls('interior', [0, 47], [3.5, 47]),
    ...walls('interior', [6.5, 47], [17, 47]),
    // Kitchen, IT / Storage and Conference Room 2
    ...walls('interior', [25, 31], [25, 47]),
    ...walls('interior', [25, 31], [53, 31]),
    ...walls('interior', [41, 20], [53, 20]),
    ...walls('interior', [41, 20], [41, 31.5]),
    ...walls('interior', [41, 34.5], [41, 47]),
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
    door([3.5, 47], { x: 1, y: 0 }, [5, 50], 'Office 1 to Conference Room 1'),
  );

  // The cubicle areas are left empty: cubicles are added by hand.

  // A few fixtures from the sketch.
  objs.push(
    { ...furnitureFromTemplate(tpl('conf-8'), 8.5 * 12, 55 * 12, 'Conference table', 90), notes: ROUGH },
    { ...furnitureFromTemplate(tpl('conf-8'), 47 * 12, 25.5 * 12, 'Conference table', 90), notes: ROUGH },
    { ...furnitureFromTemplate(tpl('printer'), 33 * 12, 3 * 12, 'Printer / copier') },
    { ...furnitureFromTemplate(tpl('storage-cab'), 32 * 12, 47 * 12 - 17, 'Kitchen counter'), width: 144, depth: 24, notes: ROUGH },
  );

  const note = makeLabel(0, 66 * 12,'Old office: rough layout from the hand sketch. Sizes are placeholders until measured.');
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
