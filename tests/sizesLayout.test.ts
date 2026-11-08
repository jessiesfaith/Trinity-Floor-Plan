import { describe, expect, it } from 'vitest';
import { createSampleProject } from '@/lib/sampleProject';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import { furnitureFromTemplate } from '@/lib/objects';
import { validate } from '@/lib/validation';
import { cubicleContents, isSizesLayout, openCubicleSizes, sizesLayoutOf } from '@/lib/sizesLayout';
import { floorPlanLayoutOf, openCubicleWalls } from '@/lib/wallsLayout';
import { LONG_WALL, SHORT_WALL } from '@/lib/cubicleParts';
import type { Furniture, PlanObject, Room } from '@/types/plan';

const t = (id: string) => BUILT_IN_TEMPLATES.find((x) => x.id === id)!;
const room = (objs: PlanObject[], name: string) => objs.find((o): o is Room => o.kind === 'room' && o.name === name)!;
const wallsAround = (objs: PlanObject[], r: Room, key: string) => {
  const xs = r.points.map((p) => p.x);
  const ys = r.points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 3, Math.max(...xs) + 3, Math.min(...ys) - 3, Math.max(...ys) + 3];
  return objs.filter((o) => o.kind === 'furniture' && o.inventoryItem === key && o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1).length;
};

describe('Cubicle sizes tab', () => {
  it("makes a standalone layout once, with 4'x6', 6'x6' and 6'x8' cubicles built from cube walls", () => {
    const p = openCubicleSizes(createSampleProject());
    const s = sizesLayoutOf(p)!;
    expect(isSizesLayout(s)).toBe(true);
    expect(p.activeScenarioId).toBe(s.id);
    expect(s.objects.some((o) => o.kind === 'wall')).toBe(false); // no building
    const names = s.objects.filter((o) => o.kind === 'room').map((o) => o.name);
    expect(names).toEqual(["Cubicle 4'×6'", "Cubicle 6'×6'", "Cubicle 6'×8'"]);
    const counts = names.map((n) => [wallsAround(s.objects, room(s.objects, n), LONG_WALL), wallsAround(s.objects, room(s.objects, n), SHORT_WALL)]);
    expect(counts).toEqual([
      [3, 2],
      [3, 3],
      [5, 1],
    ]);
    // opening it again reuses it, and the floor plan tab still finds the real floor plan
    const again = openCubicleSizes(p);
    expect(again.scenarios).toHaveLength(p.scenarios.length);
    expect(floorPlanLayoutOf(p).id).toBe(p.scenarios[0].id);
    const walls = openCubicleWalls(p);
    expect(walls.scenarios.find((x) => x.id === walls.activeScenarioId)?.sourceId).toBe(p.scenarios[0].id);
  });

  it("lists furniture per cubicle and flags a piece that doesn't fit", () => {
    const p = openCubicleSizes(createSampleProject());
    const s = sizesLayoutOf(p)!;
    const r = room(s.objects, "Cubicle 4'×6'");
    const x0 = Math.min(...r.points.map((q) => q.x));
    const y0 = Math.min(...r.points.map((q) => q.y));
    const fits: Furniture = furnitureFromTemplate(t('part-desk-corner'), x0 + 24, y0 + 24, "Corner desk 4'×4'");
    const tooBig: Furniture = furnitureFromTemplate(t('part-desk-long'), x0 + 24, y0 + 60, "Long desk 4'×2'", 90); // sticks out the front
    const objs = [...s.objects, fits, tooBig];
    const list = cubicleContents(objs).find((c) => c.room.id === r.id)!;
    expect(list.furniture.map((f) => f.name).sort()).toEqual(["Corner desk 4'×4'", "Long desk 4'×2'"]);
    const errors = validate(objs, p.settings).issues.filter((i) => i.severity === 'error');
    expect(errors.some((i) => i.objectIds.includes(tooBig.id))).toBe(true);
    expect(errors.some((i) => i.objectIds.includes(fits.id))).toBe(false);
    // the cube walls themselves are not flagged
    expect(errors.filter((i) => s.objects.some((o) => o.kind === 'furniture' && i.objectIds.includes(o.id)))).toEqual([]);
  });
});

describe('cubicle stock in the Cubicle sizes tab', () => {
  it('counts used and unused per Cubicles inventory line, walls included', async () => {
    const { cubicleStock, sampleCubicles } = await import('@/lib/sizesLayout');
    const { trinityInventory } = await import('@/lib/inventory');
    const { BUILT_IN_TEMPLATES } = await import('@/lib/library');
    const { furnitureFromTemplate } = await import('@/lib/objects');
    const desk = furnitureFromTemplate(BUILT_IN_TEMPLATES.find((t) => t.id === 'part-desk-long')!, 24, 12, 'Long desk', 0);
    const rows = cubicleStock([...sampleCubicles(), desk], trinityInventory());
    const row = (item: string) => rows.find((r) => r.item === item)!;
    expect(row('Long cubicle walls')).toMatchObject({ used: 11, have: 29, left: 18 }); // 3 + 3 + 5
    expect(row('Short cubicle walls')).toMatchObject({ used: 6, have: 13, left: 7 }); // 2 + 3 + 1
    expect(row('Long desks')).toMatchObject({ used: 1, have: 8, left: 7 });
    expect(row('Corner desks')).toMatchObject({ used: 0, left: 8 });
    expect(rows.every((r) => r.key.startsWith('Cubicles|'))).toBe(true);
  });
});

describe('Cubicle sizes tab and Update floor plan', () => {
  it('Update floor plan leaves the Cubicle sizes layout alone', async () => {
    const { openCubicleSizes, sizesLayoutOf } = await import('@/lib/sizesLayout');
    const { updateFloorPlan } = await import('@/lib/updateFloorPlan');
    const p = openCubicleSizes(createSampleProject());
    const before = sizesLayoutOf(p)!;
    const after = sizesLayoutOf(updateFloorPlan(p).project)!;
    expect(after).toBe(before);
  });

  it('a sizes layout that got the floor plan copied in is repaired on load, keeping desks and walls', async () => {
    const { openCubicleSizes, sizesLayoutOf } = await import('@/lib/sizesLayout');
    const { parseProject } = await import('@/lib/persistence');
    const p = openCubicleSizes(createSampleProject());
    const s = sizesLayoutOf(p)!;
    const desk = furnitureFromTemplate(BUILT_IN_TEMPLATES.find((t) => t.id === 'part-desk-long')!, 24, 12, 'Long desk 4′', 0);
    // What the old Update floor plan did: the building's walls, rooms, doors and notes replace the sample rooms.
    const floor = createSampleProject().scenarios[0].objects;
    const broken = { ...s, objects: [...floor, ...s.objects.filter((o) => o.kind !== 'room'), desk] };
    const loaded = parseProject(JSON.stringify({ ...p, scenarios: p.scenarios.map((x) => (x.id === s.id ? broken : x)) }));
    const fixed = sizesLayoutOf(loaded)!.objects;
    expect(fixed.filter((o) => o.kind === 'room').map((o) => o.name).sort()).toEqual(["Cubicle 4'×6'", "Cubicle 6'×6'", "Cubicle 6'×8'"]);
    expect(fixed.some((o) => o.kind === 'wall' || o.kind === 'door' || o.kind === 'aisle' || o.kind === 'dimension' || o.kind === 'label')).toBe(false);
    expect(fixed.filter((o) => o.kind === 'furniture' && o.type === 'partition')).toHaveLength(17);
    expect(fixed.some((o) => o.id === desk.id)).toBe(true);
    expect(fixed.some((o) => o.kind === 'furniture' && (o.name === 'Dedicated tenant HVAC' || o.name === 'Shelving'))).toBe(false);
    // The floor plan layouts are untouched.
    expect(loaded.scenarios[0].objects.length).toBe(p.scenarios[0].objects.length);
  });
});
