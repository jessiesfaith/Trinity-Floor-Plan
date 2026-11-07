// The "Cubicle sizes" tab: a standalone layout (no building) holding three sample cubicles - 4'x6',
// 6'x6' and 6'x8' - built from the office's cube walls, to try furniture in and see how it fits.
// Width is the back wall, depth the two sides; the front stays open.

import type { Furniture, PlanObject, Project, Room, Scenario } from '@/types/plan';
import { PART, panelsFor } from './cubicleParts';
import { furnitureFromTemplate, makeRoom, uid } from './objects';

export const SIZES_PURPOSE = 'cubicle-sizes' as const;

export const isSizesLayout = (s: Scenario) => s.purpose === SIZES_PURPOSE;

export const sizesLayoutOf = (p: Project) => p.scenarios.find(isSizesLayout);

/** The sample cubicles, in feet: width (back wall) x depth (sides). */
export const SAMPLE_SIZES: [number, number][] = [
  [4, 6],
  [6, 6],
  [6, 8],
];

const GAP = 48; // inches between sample cubicles
const PANEL = 2; // cube wall thickness, inches

/** Cube walls laid along a run, 4' pieces first then a 2' piece, centred on the given line. */
function wallRun(x: number, y: number, length: number, vertical: boolean, label: string): Furniture[] {
  const out: Furniture[] = [];
  let t = 0;
  for (const len of panelsFor(length)) {
    const c = t + len / 2;
    const t8 = len === 48 ? PART.wall4 : PART.wall2;
    out.push(furnitureFromTemplate(t8, vertical ? x : x + c, vertical ? y + c : y, `${label} ${len === 48 ? "4'" : "2'"} wall`, vertical ? 90 : 0));
    t += len;
  }
  return out;
}

/** The sample cubicles: a room for each clear interior, plus its back and side cube walls. */
export function sampleCubicles(): PlanObject[] {
  const objs: PlanObject[] = [];
  let x0 = 0;
  for (const [wf, df] of SAMPLE_SIZES) {
    const W = wf * 12;
    const D = df * 12;
    const name = `Cubicle ${wf}'×${df}'`;
    const room: Room = makeRoom(name, 'other', [
      { x: x0, y: 0 },
      { x: x0 + W, y: 0 },
      { x: x0 + W, y: D },
      { x: x0, y: D },
    ], '#eef6f6', { notes: `Sample ${wf}' wide (back wall) x ${df}' deep cubicle, front open.` });
    room.label = { ...room.label, fontSize: 9, offset: { x: 0, y: D / 2 + 14 } }; // name under the open front
    objs.push(
      room,
      ...wallRun(x0, -PANEL / 2, W, false, `${name} back`),
      ...wallRun(x0 - PANEL / 2, 0, D, true, `${name} left`),
      ...wallRun(x0 + W + PANEL / 2, 0, D, true, `${name} right`),
    );
    x0 += W + PANEL * 2 + GAP;
  }
  return objs;
}

function sizesLayout(): Scenario {
  const now = new Date().toISOString();
  return {
    id: uid('s'),
    name: 'Cubicle sizes',
    description: "Sample 4'x6', 6'x6' and 6'x8' cubicles to try furniture in.",
    objects: sampleCubicles(),
    purpose: SIZES_PURPOSE,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** Open the Cubicle sizes tab, making its layout the first time. */
export function openCubicleSizes(p: Project): Project {
  const s = sizesLayoutOf(p);
  if (s) return { ...p, activeScenarioId: s.id };
  const fresh = sizesLayout();
  return { ...p, scenarios: [...p.scenarios, fresh], activeScenarioId: fresh.id };
}

/** The sample cubicle rooms of a sizes layout, each with the furniture (not its walls) inside it. */
export function cubicleContents(objects: PlanObject[]): { room: Room; furniture: Furniture[] }[] {
  const rooms = objects.filter((o): o is Room => o.kind === 'room');
  const inside = (r: Room, f: Furniture) => {
    let c = false;
    const pts = r.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y > f.y !== b.y > f.y && f.x < ((b.x - a.x) * (f.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const furniture = objects.filter((o): o is Furniture => o.kind === 'furniture' && o.type !== 'partition');
  return rooms.map((room) => ({ room, furniture: furniture.filter((f) => inside(room, f)) }));
}
