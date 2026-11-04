import { describe, expect, it } from 'vitest';
import { createSampleProject } from '@/lib/sampleProject';
import { updateFloorPlan } from '@/lib/updateFloorPlan';
import { furnitureFromTemplate, makeAisle, makeDimension, makeLabel } from '@/lib/objects';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import type { PlanObject, Project, Room } from '@/types/plan';

const cubicle = BUILT_IN_TEMPLATES.find((t) => t.id === 'cub-5x5')!;
const geometry = (objs: PlanObject[]) =>
  objs
    .filter((o) => o.kind === 'wall' || o.kind === 'room' || o.kind === 'door')
    .map((o) => JSON.stringify({ ...o, id: 0, attach: 0 }))
    .sort();

/** A saved project from an older release: same suite, but with Office 1 drawn differently. */
function olderProjectWithMyLayout(): Project {
  const p = createSampleProject();
  for (const s of p.scenarios) {
    s.objects = s.objects.map((o) => (o.kind === 'room' && o.name === 'Office 1' ? { ...o, points: o.points.map((q) => ({ x: q.x - 30, y: q.y + 20 })) } : o));
    s.objects = s.objects.filter((o) => !(o.kind === 'wall' && o.fixed)).slice(); // older walls
  }
  const l1 = p.scenarios[0];
  const office3 = l1.objects.find((o): o is Room => o.kind === 'room' && o.name === 'Office 3')!;
  l1.objects.push(
    furnitureFromTemplate(cubicle, 300, 100, 'Cubicle 02'),
    furnitureFromTemplate(cubicle, 370, 100, 'Cubicle 03'),
    makeAisle(500, 200, 120, 48),
    makeLabel(100, 100, 'Printer goes here'),
    { ...makeDimension(office3.points[0], office3.points[1], -12), attach: { roomId: office3.id, edgeIndex: 0 } },
  );
  return p;
}

describe('Update floor plan', () => {
  it('replaces walls, rooms and doors with the current plan in every layout', () => {
    const { project, layouts } = updateFloorPlan(olderProjectWithMyLayout());
    const current = createSampleProject().scenarios[0].objects;
    expect(layouts).toBe(5);
    for (const s of project.scenarios) expect(geometry(s.objects)).toEqual(geometry(current));
  });

  it('keeps everything the user placed', () => {
    const { project, kept } = updateFloorPlan(olderProjectWithMyLayout());
    const l1 = project.scenarios[0].objects;
    expect(kept).toBe(5);
    expect(l1.filter((o) => o.kind === 'furniture' && o.name.startsWith('Cubicle')).map((o) => o.name)).toEqual(['Cubicle 02', 'Cubicle 03']);
    expect(l1.some((o) => o.kind === 'aisle')).toBe(true);
    expect(l1.some((o) => o.kind === 'label' && o.text === 'Printer goes here')).toBe(true);
    // the starter plan's own fixtures and notes are not duplicated
    expect(l1.filter((o) => o.name === 'HVAC unit 1')).toHaveLength(1);
    expect(l1.filter((o) => o.kind === 'label' && o.name === 'Source note')).toHaveLength(1);
  });

  it('re-attaches a user dimension to the room with the same name', () => {
    const { project } = updateFloorPlan(olderProjectWithMyLayout());
    const l1 = project.scenarios[0].objects;
    const office3 = l1.find((o): o is Room => o.kind === 'room' && o.name === 'Office 3')!;
    const userDims = l1.filter((o) => o.kind === 'dimension' && o.name === 'Dimension');
    expect(userDims).toHaveLength(1);
    expect(userDims[0].kind === 'dimension' && userDims[0].attach?.roomId).toBe(office3.id);
  });

  it('leaves a current, unedited plan unchanged apart from bookkeeping', () => {
    const p = createSampleProject();
    const { project, kept } = updateFloorPlan(p);
    expect(kept).toBe(0);
    expect(geometry(project.scenarios[0].objects)).toEqual(geometry(p.scenarios[0].objects));
    expect(project.scenarios[0].objects).toHaveLength(p.scenarios[0].objects.length);
  });
});

describe('floorPlanIsOutdated', () => {
  it('is true for an older Trinity plan, false once updated, for the current plan, and for other plans', async () => {
    const { floorPlanIsOutdated } = await import('@/lib/updateFloorPlan');
    const { createBlankProject } = await import('@/lib/sampleProject');
    const old = olderProjectWithMyLayout();
    expect(floorPlanIsOutdated(old)).toBe(true);
    expect(floorPlanIsOutdated(updateFloorPlan(old).project)).toBe(false);
    expect(floorPlanIsOutdated(createSampleProject())).toBe(false);
    expect(floorPlanIsOutdated(createBlankProject())).toBe(false);
  });
});
