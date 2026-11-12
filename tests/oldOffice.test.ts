import { describe, expect, it } from 'vitest';
import { createSampleProject } from '@/lib/sampleProject';
import { isOldOfficeLayout, oldOfficeLayoutOf, openOldOffice } from '@/lib/oldOfficeLayout';
import { floorPlanIsOutdated, updateFloorPlan } from '@/lib/updateFloorPlan';
import { openCubicleWalls, openFloorPlan } from '@/lib/wallsLayout';
import { parseProject, serializeProject } from '@/lib/persistence';
import type { Furniture, Room } from '@/types/plan';

describe('Old office tab', () => {
  it('makes the old office layout once, with the rooms from the sketch', () => {
    const p = openOldOffice(createSampleProject());
    const s = oldOfficeLayoutOf(p)!;
    expect(p.activeScenarioId).toBe(s.id);
    expect(openOldOffice(openFloorPlan(p)).scenarios.filter(isOldOfficeLayout)).toHaveLength(1);
    const rooms = s.objects.filter((o): o is Room => o.kind === 'room').map((r) => r.name);
    for (const n of ['Office 1', 'Office 2', 'Office 3', 'Office 4', 'Office 5', 'Lobby', 'Conference Room 1', 'Conference Room 2', 'Kitchen', 'IT / Storage', 'Printer area'])
      expect(rooms).toContain(n);
    // Cubicles are added by hand, so the cubicle areas start empty.
    expect(s.objects.some((o) => o.kind === 'furniture' && (o as Furniture).type === 'cubicle')).toBe(false);
    expect(rooms.filter((n) => n.startsWith('Cubicle area'))).toHaveLength(2);
  });

  it('is never the floor plan and is left alone by Update floor plan', () => {
    const base = createSampleProject();
    const p = openOldOffice(base);
    const old = oldOfficeLayoutOf(p)!;
    expect(openFloorPlan(p).activeScenarioId).toBe(base.scenarios[0].id);
    expect(floorPlanIsOutdated(p)).toBe(floorPlanIsOutdated(base));
    const u = updateFloorPlan(p);
    expect(oldOfficeLayoutOf(u.project)).toBe(old);
    expect(u.layouts).toBe(updateFloorPlan(base).layouts);
    // The Cubicle walls tab is made from the floor plan, not the old office.
    const walls = openCubicleWalls(p).scenarios.find((s) => s.purpose === 'cubicle-walls')!;
    expect(walls.name.startsWith(base.scenarios[0].name)).toBe(true);
  });

  it('has no layout conflicts', async () => {
    const { validate } = await import('@/lib/validation');
    const p = openOldOffice(createSampleProject());
    const s = oldOfficeLayoutOf(p)!;
    const errors = validate(s.objects, p.settings, {}).issues.filter((i) => i.severity === 'error');
    expect(errors.map((i) => i.message)).toEqual([]);
  });

  it('survives saving and loading', () => {
    const p = openOldOffice(createSampleProject());
    const back = parseProject(serializeProject(p));
    expect(oldOfficeLayoutOf(back)?.objects.length).toBe(oldOfficeLayoutOf(p)!.objects.length);
  });
});
