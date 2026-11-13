import { describe, expect, it } from 'vitest';
import { createSampleProject } from '@/lib/sampleProject';
import { isOldOfficeLayout, oldOfficeLayoutOf, OLD_OFFICE_VERSION, openOldOffice } from '@/lib/oldOfficeLayout';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import { furnitureFromTemplate } from '@/lib/objects';
import { bbox } from '@/lib/geometry';
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

  it("Office 1 is 11 wide x 13 deep, Offices 2-4 are 12 x 10 and Office 5 is the longest; Office 1's door to the lobby; Conference Room 1 has two doors at its top-right corner", () => {
    const s = oldOfficeLayoutOf(openOldOffice(createSampleProject()))!;
    const room = (n: string) => s.objects.find((o): o is Room => o.kind === 'room' && o.name === n)!;
    const b = bbox(room('Office 1').points);
    expect([b.width / 12, b.height / 12].map((v) => Math.round(v * 1000) / 1000)).toEqual([11, 13]);
    for (const n of ['Office 2', 'Office 3', 'Office 4']) {
      const o = bbox(room(n).points);
      expect([o.width / 12, o.height / 12].map((v) => Math.round(v * 1000) / 1000), n).toEqual([12, 10]);
    }
    expect(bbox(room('Office 5').points).height / 12).toBeGreaterThan(10);
    const doors = s.objects.filter((o) => o.kind === 'door').map((o) => o.name);
    expect(doors).toContain('Office 1 door');
    // The outside wall above Office 1 is labelled with its measured width.
    expect(s.objects.some((o) => o.kind === 'wall' && o.lengthLabel === "11'-0\"")).toBe(true);
    expect(doors.filter((n) => n.startsWith('Conference Room 1 door'))).toHaveLength(2);
    expect(doors).not.toContain('Office 1 to Conference Room 1');
    // Office 1 sits right on top of Conference Room 1, with just their 5" wall between.
    expect(bbox(room('Conference Room 1').points).minY - b.maxY).toBeCloseTo(5, 6);
  });

  it('Update floor plan redraws an older Old office tab, keeping cubicles added to it', () => {
    const p = openOldOffice(createSampleProject());
    const old = oldOfficeLayoutOf(p)!;
    const cube = furnitureFromTemplate(BUILT_IN_TEMPLATES.find((t) => t.type === 'cubicle')!, 300, 150, 'Cubicle 01');
    const stale = { ...old, layoutVersion: undefined, objects: [...old.objects.filter((o) => o.name !== 'Office 1 door'), cube] };
    const saved = { ...p, scenarios: p.scenarios.map((s) => (s.id === old.id ? stale : s)) };
    expect(floorPlanIsOutdated(saved)).toBe(true);
    const after = oldOfficeLayoutOf(updateFloorPlan(saved).project)!;
    expect(after.layoutVersion).toBe(OLD_OFFICE_VERSION);
    expect(after.objects.filter((o) => o.name === 'Cubicle 01')).toHaveLength(1);
    expect(after.objects.some((o) => o.name === 'Office 1 door')).toBe(true);
    expect(after.objects.filter((o) => o.name === 'Conference table')).toHaveLength(2);
    expect(after.objects.length).toBe(oldOfficeLayoutOf(p)!.objects.length + 1);
  });

  it('survives saving and loading', () => {
    const p = openOldOffice(createSampleProject());
    const back = parseProject(serializeProject(p));
    expect(oldOfficeLayoutOf(back)?.objects.length).toBe(oldOfficeLayoutOf(p)!.objects.length);
  });
});
