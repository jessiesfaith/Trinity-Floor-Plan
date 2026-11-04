import { describe, expect, it, beforeEach } from 'vitest';
import { parseProject, serializeProject, ProjectParseError } from '@/lib/persistence';
import { createSampleProject } from '@/lib/sampleProject';
import { activeScenario, usePlanStore, syncAttachedDimensions } from '@/store/usePlanStore';
import type { Dimension, Room } from '@/types/plan';

describe('save / reopen', () => {
  it('round-trips every scenario, object, layer and measurement', () => {
    const p = createSampleProject();
    const back = parseProject(serializeProject(p, { includeBackground: true }));
    expect(back.scenarios).toHaveLength(p.scenarios.length);
    expect(back.scenarios.map((s) => s.objects)).toEqual(p.scenarios.map((s) => s.objects));
    expect(back.layers).toEqual(p.layers);
    expect(back.settings).toEqual(p.settings);
  });

  it('rejects files that are not projects', () => {
    expect(() => parseProject('{"hello":1}')).toThrow(ProjectParseError);
    expect(() => parseProject('not json')).toThrow(ProjectParseError);
  });
});

describe('store', () => {
  beforeEach(() => usePlanStore.getState().loadProject(createSampleProject()));

  it('undo / redo restores edits', () => {
    const st = usePlanStore.getState();
    const f = activeScenario(st.project).objects.find((o) => o.kind === 'furniture')!;
    st.updateObject(f.id, { name: 'Renamed' });
    expect(activeScenario(usePlanStore.getState().project).objects.find((o) => o.id === f.id)!.name).toBe('Renamed');
    usePlanStore.getState().undo();
    expect(activeScenario(usePlanStore.getState().project).objects.find((o) => o.id === f.id)!.name).toBe(f.name);
    usePlanStore.getState().redo();
    expect(activeScenario(usePlanStore.getState().project).objects.find((o) => o.id === f.id)!.name).toBe('Renamed');
  });

  it('editing one scenario never changes another', () => {
    const st = usePlanStore.getState();
    const [s1, s2] = st.project.scenarios;
    st.duplicateScenario('Copy');
    const copyId = usePlanStore.getState().project.activeScenarioId;
    usePlanStore.getState().setObjects((objs) => objs.filter((o) => o.kind !== 'furniture'));
    const p = usePlanStore.getState().project;
    expect(p.scenarios.find((s) => s.id === copyId)!.objects.some((o) => o.kind === 'furniture')).toBe(false);
    expect(p.scenarios.find((s) => s.id === s1.id)!.objects.some((o) => o.kind === 'furniture')).toBe(true);
    expect(p.scenarios.find((s) => s.id === s2.id)!.objects).toEqual(s2.objects);
  });

  it('dimensions attached to a room edge follow the geometry when the room is resized', () => {
    const objs = activeScenario(usePlanStore.getState().project).objects;
    const dim = objs.find((o): o is Dimension => o.kind === 'dimension' && !!o.attach)!;
    const room = objs.find((o) => o.id === dim.attach!.roomId) as Room;
    const moved = room.points.map((p, i) => (i === (dim.attach!.edgeIndex + 1) % 4 ? { x: p.x + 12, y: p.y } : p));
    const synced = syncAttachedDimensions(objs.map((o) => (o.id === room.id ? { ...room, points: moved } : o)));
    const d2 = synced.find((o) => o.id === dim.id) as Dimension;
    expect(d2.b).toEqual(moved[(dim.attach!.edgeIndex + 1) % 4]);
  });
});
