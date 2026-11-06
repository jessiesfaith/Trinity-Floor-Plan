// The "Cubicle walls" tab: a layout of its own holding the cubicles as loose cube walls (4' and
// 2' pieces) that can be moved one by one, shown as two sections (Area A and Area B) with the
// rest of the office hidden. The main floor plan keeps its whole cubicles.

import type { PlanObject, Project, Pt, Room, Scenario } from '@/types/plan';
import { explodeCubicles } from './cubicleParts';
import { furnitureFromTemplate, uid } from './objects';
import { BUILT_IN_TEMPLATES } from './library';

export const WALLS_PURPOSE = 'cubicle-walls' as const;

/** Layouts made by earlier releases' "Break cubicles into parts" count as the walls layout too. */
const OLD_NAME = / — cubicle (parts|walls)$/;

export const isWallsLayout = (s: Scenario) => s.purpose === WALLS_PURPOSE || OLD_NAME.test(s.name);

export function wallsLayoutOf(p: Project): Scenario | undefined {
  return p.scenarios.find((s) => s.purpose === WALLS_PURPOSE) ?? p.scenarios.find((s) => OLD_NAME.test(s.name));
}

/** The floor plan layout the walls layout was made from (or the first ordinary layout). */
export function floorPlanLayoutOf(p: Project): Scenario {
  const walls = wallsLayoutOf(p);
  const active = p.scenarios.find((s) => s.id === p.activeScenarioId);
  if (active && !isWallsLayout(active)) return active;
  return (
    (walls?.sourceId && p.scenarios.find((s) => s.id === walls.sourceId)) ||
    (walls && p.scenarios.find((s) => !isWallsLayout(s) && walls.name.startsWith(s.name))) ||
    p.scenarios.find((s) => !isWallsLayout(s)) ||
    p.scenarios[0]
  );
}

function wallsFrom(src: Scenario): Scenario {
  const now = new Date().toISOString();
  return {
    ...structuredClone(src),
    id: uid('s'),
    name: `${src.name} — cubicle walls`,
    description: 'The cubicles as loose cube walls, to check against the inventory.',
    objects: explodeCubicles(src.objects).objects,
    purpose: WALLS_PURPOSE,
    sourceId: src.id,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** Open the Cubicle walls tab, making its layout from the floor plan the first time. */
export function openCubicleWalls(p: Project): Project {
  const src = floorPlanLayoutOf(p);
  const walls = wallsLayoutOf(p);
  if (!walls) {
    const w = withOffice1Suggestion(wallsFrom(src));
    return { ...p, scenarios: [...p.scenarios, w], activeScenarioId: w.id };
  }
  const marked = withOffice1Suggestion({ ...walls, purpose: WALLS_PURPOSE, sourceId: walls.sourceId ?? src.id });
  return { ...p, scenarios: p.scenarios.map((s) => (s.id === walls.id ? marked : s)), activeScenarioId: walls.id };
}

/** Back to the floor plan tab. */
export function openFloorPlan(p: Project): Project {
  return { ...p, activeScenarioId: floorPlanLayoutOf(p).id };
}

/** Lay the walls out again from the floor plan's cubicles (replacing any wall moves). */
export function rebuildCubicleWalls(p: Project): Project {
  const walls = wallsLayoutOf(p);
  const src = floorPlanLayoutOf(p);
  if (!walls) return openCubicleWalls(p);
  const fresh = withOffice1Suggestion(wallsFrom(src));
  return { ...p, scenarios: p.scenarios.map((s) => (s.id === walls.id ? { ...fresh, id: walls.id, name: walls.name, revision: walls.revision + 1 } : s)), activeScenarioId: walls.id };
}

/** Margin around each cubicle area that the Cubicle walls tab shows (walls, doors, dimension lines). */
export const SECTION_PAD = 66;

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Rooms shown as their own section in the Cubicle walls tab, besides the cubicle areas. */
export const EXTRA_SECTIONS = ['Office 1'];

const sectionRooms = (objects: PlanObject[]) =>
  objects.filter((o): o is Room => o.kind === 'room' && (o.roomType === 'cubicle-area' || EXTRA_SECTIONS.includes(o.name)));

/** The sections the Cubicle walls tab shows: each cubicle area (and Office 1) plus a margin. */
export function sectionBoxes(objects: PlanObject[]): Box[] {
  return sectionRooms(objects)
    .map((r) => {
      const xs = r.points.map((p) => p.x);
      const ys = r.points.map((p) => p.y);
      return { minX: Math.min(...xs) - SECTION_PAD, minY: Math.min(...ys) - SECTION_PAD, maxX: Math.max(...xs) + SECTION_PAD, maxY: Math.max(...ys) + SECTION_PAD };
    });
}

export const inBoxes = (p: Pt, boxes: Box[]) => boxes.some((b) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY);

/** Cube walls lying outside every section (so hidden in the Cubicle walls tab). */
export function hiddenCubeWalls(objects: PlanObject[]): PlanObject[] {
  const boxes = sectionBoxes(objects);
  if (!boxes.length) return [];
  return objects.filter((o) => o.kind === 'furniture' && !!o.inventoryItem && !inBoxes(o, boxes));
}

/** Where to drop a new piece in the Cubicle walls tab: `p` if it is in a section, else the middle of the nearest area. */
export function placeInSections(objects: PlanObject[], p: Pt): Pt {
  const areas = sectionRooms(objects);
  if (!areas.length || inBoxes(p, sectionBoxes(objects))) return p;
  const mids = areas.map((r) => {
    const xs = r.points.map((q) => q.x);
    const ys = r.points.map((q) => q.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  });
  return mids.reduce((best, m) => (Math.hypot(m.x - p.x, m.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? m : best));
}

/**
 * Suggested Office 1 furniture for the Cubicle walls tab (from the office's markup): a whiteboard
 * on the straight entry-side wall above the door, a 42" round table in the middle, and a wall TV
 * on the angled wall facing it. Placed once per walls layout; the user can move or delete them.
 */
export function office1Furniture(objects: PlanObject[]): PlanObject[] {
  const room = objects.find((o): o is Room => o.kind === 'room' && o.name === 'Office 1');
  if (!room || room.points.length !== 3) return [];
  const xs = room.points.map((p) => p.x);
  const ys = room.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const tpl = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;
  // Right angle at (minX, maxY); straight wall up from it to (minX, minY); angled wall from there to (maxX, maxY).
  const a = maxY - minY;
  const b = maxX - minX;
  // The table sits up and out from the door's swing (door near the bottom of the straight wall),
  // clear of the whiteboard and the angled wall.
  const table = furnitureFromTemplate(tpl('round-table-42'), minX + 30, maxY - 70, 'Office 1 round table');
  const board = furnitureFromTemplate(tpl('whiteboard-6'), minX + 1.5, minY + 12 + 36, 'Office 1 whiteboard', 270);
  const tvT = tpl('tv-65');
  const mid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const d = { x: b / Math.hypot(a, b), y: a / Math.hypot(a, b) };
  let n = { x: -d.y, y: d.x }; // a normal to the angled wall
  if ((table.x - mid.x) * n.x + (table.y - mid.y) * n.y < 0) n = { x: -n.x, y: -n.y }; // point it into the room
  const ang = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  // the TV's face is its local +y; turn it to face the room
  const face = (deg: number) => ({ x: -Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180) });
  const rot = face(ang).x * n.x + face(ang).y * n.y > 0 ? ang : ang + 180;
  const tv = furnitureFromTemplate(tvT, mid.x + n.x * (tvT.depth / 2), mid.y + n.y * (tvT.depth / 2), 'Office 1 TV', ((rot % 360) + 360) % 360);
  for (const f of [table, board, tv]) f.notes = 'Suggested Office 1 layout';
  return [table, board, tv];
}

/** Add the suggested Office 1 furniture to a walls layout that has not had it yet. */
export function withOffice1Suggestion(s: Scenario): Scenario {
  if (s.office1Suggested) return s;
  return { ...s, objects: [...s.objects, ...office1Furniture(s.objects)], office1Suggested: true };
}
