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
    for (const n of ['Office 1', 'Office 2', 'Office 3', 'Office 4', 'Office 5', 'Entry', 'Conference', 'Break Room', 'Server Room', 'Demo Room', 'Cubicle area'])
      expect(rooms).toContain(n);
    // Cubicles are added by hand, so the cubicle areas start empty.
    expect(s.objects.some((o) => o.kind === 'furniture' && (o as Furniture).type === 'cubicle')).toBe(false);
    expect(rooms.filter((n) => n.startsWith('Cubicle area'))).toHaveLength(1);
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

  it("uses the architect's room sizes, with a door into every room", () => {
    const s = oldOfficeLayoutOf(openOldOffice(createSampleProject()))!;
    const room = (n: string) => s.objects.find((o): o is Room => o.kind === 'room' && o.name === n)!;
    const size = (n: string) => {
      const b = bbox(room(n).points);
      return [b.width, b.height].map((v) => Math.round(v * 10) / 10); // inches
    };
    expect(size('Office 1')).toEqual([100, 138]); // 8'4" x 11'6"
    expect(size('Office 2')).toEqual([100, 138]);
    expect(size('Office 3')).toEqual([115, 138]); // 9'7"
    expect(size('Office 5')).toEqual([234, 138]); // 19'6"
    expect(size('Office 4')).toEqual([108, 153]); // 9' x 12'9"
    expect(size('Demo Room')).toEqual([144, 120]); // 12' x 10'
    expect(size('Conference')[1]).toBe(153);
    const doors = s.objects.filter((o) => o.kind === 'door').map((o) => o.name);
    for (const n of ['Conference', 'Office 1', 'Office 2', 'Office 3', 'Office 4', 'Office 5', 'Break Room', 'Server Room', 'Demo Room'])
      expect(doors).toContain(`${n} door`);
    expect(doors.filter((n) => n.startsWith('Entry door'))).toHaveLength(2);
  });

  it('has a width and depth dimension on every room, reading the plan sizes', () => {
    const s = oldOfficeLayoutOf(openOldOffice(createSampleProject()))!;
    const len = (n: string) => {
      const d = s.objects.find((o) => o.kind === 'dimension' && o.name === n) as { a: { x: number; y: number }; b: { x: number; y: number } } | undefined;
      expect(d, n).toBeTruthy();
      return Math.round(Math.hypot(d!.b.x - d!.a.x, d!.b.y - d!.a.y) * 10) / 10;
    };
    for (const r of s.objects.filter((o): o is Room => o.kind === 'room' && o.name !== 'Cubicle area')) {
      len(`${r.name} width`);
      len(`${r.name} depth`);
    }
    expect(len('Office 1 width')).toBe(100); // 8'4"
    expect(len('Office 5 width')).toBe(234); // 19'6"
    expect(len('Office 3 depth')).toBe(138); // 11'6"
    expect(len('Office 4 depth')).toBe(153); // 12'9"
    expect(len('Demo Room width')).toBe(144);
    expect(len('Conference width')).toBe(360); // 30', drawn to the plan's scale
    expect(len('Offices to Demo Room')).toBe(231); // 19'3"
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
    expect(after.objects.filter((o) => o.name === 'Conference table')).toHaveLength(1);
    expect(after.objects.length).toBe(oldOfficeLayoutOf(p)!.objects.length + 1);
  });

  it('survives saving and loading', () => {
    const p = openOldOffice(createSampleProject());
    const back = parseProject(serializeProject(p));
    expect(oldOfficeLayoutOf(back)?.objects.length).toBe(oldOfficeLayoutOf(p)!.objects.length);
  });
});

describe('Old office printout', () => {
  it("does not carry the new suite's address; the floor plan still does", async () => {
    const { buildSvg, DEFAULT_EXPORT } = await import('@/lib/exporters');
    const p = openOldOffice(createSampleProject());
    expect(p.address).toBeTruthy();
    const old = buildSvg(p, DEFAULT_EXPORT).svg;
    expect(old).toContain('Old office (moving from)');
    expect(old).not.toContain(p.address!);
    const plan = buildSvg(openFloorPlan(p), DEFAULT_EXPORT).svg;
    expect(plan).toContain(p.address!);
  });
});
