// The "Cubicle walls" tab: a layout of its own holding the cubicles as loose cube walls (4' and
// 2' pieces) that can be moved one by one, shown as two sections (Area A and Area B) with the
// rest of the office hidden. The main floor plan keeps its whole cubicles.

import type { Project, Scenario } from '@/types/plan';
import { explodeCubicles } from './cubicleParts';
import { uid } from './objects';

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
    const w = wallsFrom(src);
    return { ...p, scenarios: [...p.scenarios, w], activeScenarioId: w.id };
  }
  const marked = { ...walls, purpose: WALLS_PURPOSE, sourceId: walls.sourceId ?? src.id };
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
  const fresh = wallsFrom(src);
  return { ...p, scenarios: p.scenarios.map((s) => (s.id === walls.id ? { ...fresh, id: walls.id, name: walls.name, revision: walls.revision + 1 } : s)), activeScenarioId: walls.id };
}
