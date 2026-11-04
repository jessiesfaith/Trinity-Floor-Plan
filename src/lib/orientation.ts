// Turning cubicles and desks. Every furniture symbol is drawn with its front (a cubicle's
// opening, a desk's chair side) toward local +y, i.e. "down" at rotation 0. Rotation is
// clockwise on screen, so the front points: 0° down, 90° left, 180° up, 270° right.

import type { PlanObject } from '@/types/plan';

export type Facing = 'up' | 'right' | 'down' | 'left';

export const FACING_ROTATION: Record<Facing, number> = { down: 0, left: 90, up: 180, right: 270 };

const norm360 = (r: number) => ((Math.round(r * 100) / 100) % 360 + 360) % 360;

/** Which way an object's front points, when it is turned to a right angle. */
export function facingOf(rotation: number): Facing | null {
  const r = norm360(rotation);
  return (Object.keys(FACING_ROTATION) as Facing[]).find((f) => FACING_ROTATION[f] === r) ?? null;
}

const turnable = (o: PlanObject, ids: Set<string>) => ids.has(o.id) && !o.locked && (o.kind === 'furniture' || o.kind === 'aisle');

/** Turn the selected (unlocked) furniture and aisles by `delta` degrees, each about its own center. */
export function rotateObjects(objs: PlanObject[], ids: Iterable<string>, delta: number): PlanObject[] {
  const set = new Set(ids);
  return objs.map((o) => (turnable(o, set) && 'rotation' in o ? { ...o, rotation: norm360(o.rotation + delta) } : o));
}

/** Point the front of the selected (unlocked) furniture in one direction. */
export function faceObjects(objs: PlanObject[], ids: Iterable<string>, facing: Facing): PlanObject[] {
  const set = new Set(ids);
  return objs.map((o) => (turnable(o, set) && o.kind === 'furniture' ? { ...o, rotation: FACING_ROTATION[facing] } : o));
}
