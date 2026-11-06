import { describe, expect, it } from 'vitest';
import { createSampleProject } from '@/lib/sampleProject';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import { furnitureFromTemplate } from '@/lib/objects';
import { isWallsLayout, openCubicleWalls, openFloorPlan, rebuildCubicleWalls, wallsLayoutOf } from '@/lib/wallsLayout';
import type { Project } from '@/types/plan';

const withCubicles = (): Project => {
  const p = createSampleProject();
  const t = BUILT_IN_TEMPLATES.find((x) => x.id === 'cub-4x4')!;
  p.scenarios[0].objects.push(furnitureFromTemplate(t, 300, 120, 'Cubicle 01'), furnitureFromTemplate(t, 348, 120, 'Cubicle 02'));
  return p;
};
const cubicles = (p: Project, i: number) => p.scenarios[i].objects.filter((o) => o.kind === 'furniture' && o.type === 'cubicle').length;

describe('Cubicle walls tab', () => {
  it('makes a walls-only layout the first time and leaves the floor plan alone', () => {
    const p = openCubicleWalls(withCubicles());
    const w = wallsLayoutOf(p)!;
    expect(p.activeScenarioId).toBe(w.id);
    expect(isWallsLayout(w)).toBe(true);
    expect(w.objects.some((o) => o.kind === 'furniture' && o.type === 'cubicle')).toBe(false);
    expect(w.objects.filter((o) => o.kind === 'furniture' && o.type === 'partition').length).toBeGreaterThan(0);
    expect(cubicles(p, 0)).toBe(2); // the floor plan keeps its whole cubicles
    // opening it again reuses the same layout; Floor plan goes back to the source
    const again = openCubicleWalls(openFloorPlan(p));
    expect(again.scenarios).toHaveLength(p.scenarios.length);
    expect(openFloorPlan(p).activeScenarioId).toBe(p.scenarios[0].id);
  });

  it('adopts a layout made by the earlier "Break cubicles into parts" button', () => {
    const p = withCubicles();
    const old = { ...structuredClone(p.scenarios[0]), id: 's_old', name: `${p.scenarios[0].name} — cubicle parts`, objects: [] };
    p.scenarios.push(old);
    const q = openCubicleWalls(p);
    expect(q.activeScenarioId).toBe('s_old');
    expect(wallsLayoutOf(q)!.purpose).toBe('cubicle-walls');
    expect(openFloorPlan(q).activeScenarioId).toBe(p.scenarios[0].id);
  });

  it('can lay the walls out again from the floor plan', () => {
    const p = openCubicleWalls(withCubicles());
    const w = wallsLayoutOf(p)!;
    const emptied: Project = { ...p, scenarios: p.scenarios.map((s) => (s.id === w.id ? { ...s, objects: s.objects.filter((o) => o.kind !== 'furniture') } : s)) };
    const r = rebuildCubicleWalls(emptied);
    expect(wallsLayoutOf(r)!.objects.filter((o) => o.kind === 'furniture' && o.type === 'partition').length).toBe(w.objects.filter((o) => o.kind === 'furniture' && o.type === 'partition').length);
  });
});

describe('Cubicle walls tab sections', () => {
  it('finds cube walls hidden outside Area A and Area B, and places new pieces inside them', async () => {
    const { hiddenCubeWalls, placeInSections, sectionBoxes, inBoxes } = await import('@/lib/wallsLayout');
    const p = createSampleProject();
    const short = BUILT_IN_TEMPLATES.find((x) => x.id === 'part-wall-2')!;
    const objs = [...p.scenarios[0].objects, furnitureFromTemplate(short, 60, 200, 'in B'), furnitureFromTemplate(short, 700, 300, 'in Office 3')];
    expect(hiddenCubeWalls(objs).map((o) => o.name)).toEqual(['in Office 3']);
    const at = placeInSections(objs, { x: 700, y: 300 });
    expect(inBoxes(at, sectionBoxes(objs))).toBe(true);
    expect(placeInSections(objs, { x: 60, y: 200 })).toEqual({ x: 60, y: 200 });
  });
});

describe('Office 1 section', () => {
  it('is shown in the Cubicle walls tab with a suggested round table, whiteboard and TV, placed once', async () => {
    const { sectionBoxes, inBoxes } = await import('@/lib/wallsLayout');
    const { validate } = await import('@/lib/validation');
    const { polygonContains } = await import('@/lib/geometry');
    const { footprint } = await import('@/lib/objects');
    const p = openCubicleWalls(withCubicles());
    const w = wallsLayoutOf(p)!;
    const office1 = w.objects.find((o) => o.kind === 'room' && o.name === 'Office 1')!;
    const sug = w.objects.filter((o) => o.kind === 'furniture' && o.name.startsWith('Office 1 '));
    expect(sug.map((o) => o.name).sort()).toEqual(['Office 1 TV', 'Office 1 round table', 'Office 1 whiteboard']);
    for (const f of sug) {
      if (f.kind !== 'furniture' || office1.kind !== 'room') continue;
      expect(inBoxes(f, sectionBoxes(w.objects))).toBe(true);
      expect(polygonContains(office1.points, footprint(f), 1)).toBe(true);
    }
    const errs = validate(w.objects, p.settings).issues.filter((i) => i.severity === 'error' && sug.some((f) => i.objectIds.includes(f.id)));
    expect(errs.map((e) => e.message)).toEqual([]);
    // opening the tab again does not add them twice
    const again = openCubicleWalls(openFloorPlan(p));
    expect(wallsLayoutOf(again)!.objects.filter((o) => o.kind === 'furniture' && o.name.startsWith('Office 1 '))).toHaveLength(3);
  });
});
