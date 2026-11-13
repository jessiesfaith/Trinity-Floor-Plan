// "Update floor plan": bring a saved project's walls, rooms, doors and built-in fixtures up to
// the current starter plan in every layout, keeping everything the user placed (cubicles, desks,
// furniture, aisles, their own labels and dimensions).

import type { PlanObject, Project, Scenario } from '@/types/plan';
import { createSampleProject } from './sampleProject';
import { isSizesLayout, sampleCubicles } from './sizesLayout';
import { isOldOfficeLayout } from './oldOfficeLayout';

/** Layouts with no Trinity suite in them (sample cubicles, the old office): never updated. */
const notSuite = (s: Scenario) => isSizesLayout(s) || isOldOfficeLayout(s);

/**
 * True when an object belongs to the floor plan itself rather than to the user's layout:
 * every wall, door and room, plus the starter plan's own fixtures, labels and dimensions
 * (matched by kind and name).
 */
function isFloorPlanObject(o: PlanObject, starterNames: Set<string>): boolean {
  if (o.kind === 'wall' || o.kind === 'door' || o.kind === 'room') return true;
  return starterNames.has(`${o.kind}:${o.name}`);
}

/** Names the starter plan's own objects had in earlier releases, so updating replaces them too. */
const PREVIOUS_STARTER_NAMES = [
  "dimension:Area B width (14')",
  // Four HVAC units were drawn from the PDF; the suite has one (now "Dedicated tenant HVAC").
  'furniture:HVAC unit 1',
  'furniture:HVAC unit 2',
  'furniture:HVAC unit 3',
  'furniture:HVAC unit 4',
  // Earlier kitchen fixtures, now one "Kitchen counter".
  'furniture:Kitchen counter (sink)',
  'furniture:Sink',
  // The walkway was 5' before it became 7' (Nov 2026).
  "aisle:Walkway (5')",
];

export interface FloorPlanUpdate {
  project: Project;
  /** Objects the user placed, kept in each layout (summed over layouts). */
  kept: number;
  /** Layouts updated. */
  layouts: number;
}

function starterNamesOf(starter: PlanObject[]): Set<string> {
  return new Set([...starter.filter((o) => o.kind !== 'wall' && o.kind !== 'door' && o.kind !== 'room').map((o) => `${o.kind}:${o.name}`), ...PREVIOUS_STARTER_NAMES]);
}

/** The Cubicle sizes tab has no building: it is only its sample cubicles, their walls and what was tried in them. */
export function repairSizesLayout(s: Scenario): Scenario {
  if (!isSizesLayout(s)) return s;
  const samples = sampleCubicles().filter((o) => o.kind === 'room');
  const sampleNames = new Set(samples.map((r) => r.name));
  const starterNames = starterNamesOf(createSampleProject().scenarios[0].objects);
  const stray = (o: PlanObject) => (o.kind === 'room' ? !sampleNames.has(o.name) : isFloorPlanObject(o, starterNames));
  const missing = samples.filter((r) => !s.objects.some((o) => o.kind === 'room' && o.name === r.name));
  if (!missing.length && !s.objects.some(stray)) return s;
  return { ...s, objects: [...missing, ...s.objects.filter((o) => !stray(o))] };
}

export function updateFloorPlan(project: Project): FloorPlanUpdate {
  const starter = createSampleProject().scenarios[0].objects;
  const starterNames = starterNamesOf(starter);
  const now = new Date().toISOString();
  let kept = 0;

  const scenarios = project.scenarios.map((s) => {
    if (notSuite(s)) return s; // sample cubicles / the old office: no Trinity suite
    const base = structuredClone(starter) as PlanObject[];
    const newRoomId = new Map(base.filter((o) => o.kind === 'room').map((r) => [r.name, r.id]));
    const oldRoomName = new Map(s.objects.filter((o) => o.kind === 'room').map((r) => [r.id, r.name]));
    const userObjects = s.objects
      .filter((o) => !isFloorPlanObject(o, starterNames))
      .map((o): PlanObject => {
        // A dimension the user attached to a room edge follows the room with the same name.
        if (o.kind !== 'dimension' || !o.attach) return o;
        const id = newRoomId.get(oldRoomName.get(o.attach.roomId) ?? '');
        return id ? { ...o, attach: { ...o.attach, roomId: id } } : { ...o, attach: undefined };
      });
    kept += userObjects.length;
    return { ...s, objects: [...base, ...userObjects], revision: s.revision + 1, updatedAt: now };
  });

  return { project: { ...project, scenarios, updatedAt: now }, kept, layouts: scenarios.filter((s) => !notSuite(s)).length };
}

let starterGeometryKey: string | null = null;
/** Walls, rooms and doors of a layout, ignoring ids, as a comparable string. */
function geometryKey(objs: PlanObject[]): string {
  return objs
    .filter((o) => o.kind === 'wall' || o.kind === 'room' || o.kind === 'door')
    .map((o) => JSON.stringify({ ...o, id: '' }, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)))
    .sort()
    .join('\n');
}

/**
 * True when a project is a Trinity suite plan (it has the contractor-fixed rooms) whose floor
 * plan in any layout differs from the current starter plan, or still has fixtures the starter
 * plan has since dropped, so "Update floor plan" would help.
 */
export function floorPlanIsOutdated(project: Project): boolean {
  const isTrinity = project.scenarios.some((s) => s.objects.some((o) => o.kind === 'room' && o.fixed === 'Contractor-fixed'));
  if (!isTrinity) return false;
  starterGeometryKey ??= geometryKey(createSampleProject().scenarios[0].objects);
  const retired = new Set(PREVIOUS_STARTER_NAMES);
  return project.scenarios.some((s) => !notSuite(s) && geometryKey(s.objects) !== starterGeometryKey || s.objects.some((o) => retired.has(`${o.kind}:${o.name}`)));
}
