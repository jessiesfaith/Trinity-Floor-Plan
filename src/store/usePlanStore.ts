'use client';

// Application state (Zustand). The Project is immutable; every user edit goes
// through commit(), which pushes the previous project onto the undo stack.
// Rapid edits that share a coalesce key (e.g. typing in a numeric field) are
// merged into one undo step.

import { create } from 'zustand';
import type { Background, LayerId, PlanObject, PlanSettings, Project, Scenario } from '@/types/plan';
import { cloneObject, translateObject, uid } from '@/lib/objects';
import { createBlankProject } from '@/lib/sampleProject';
import type { ValidationResult } from '@/lib/validation';

export type Tool =
  | 'select'
  | 'pan'
  | 'measure'
  | 'calibrate'
  | 'wall'
  | 'room'
  | 'door'
  | 'label'
  | 'dimension'
  | 'aisle';

export type ViewMode = '2d' | 'presentation';

const HISTORY_LIMIT = 150;
const COALESCE_MS = 1200;

export const activeScenario = (p: Project): Scenario => p.scenarios.find((s) => s.id === p.activeScenarioId) ?? p.scenarios[0];

interface PlanState {
  project: Project;
  past: Project[];
  future: Project[];
  lastKey: string | null;
  lastAt: number;
  selectedIds: string[];
  tool: Tool;
  view: ViewMode;
  dialog: null | 'generate' | 'compare' | 'export' | 'settings' | 'import' | 'calibrate';
  calibrationPoints: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  savedAt: string | null;
  dirty: boolean;
  /** Bumped to ask the canvas to fit the drawing to the screen. */
  fitNonce: number;
  validation: ValidationResult | null;
  setValidation: (v: ValidationResult) => void;

  commit: (fn: (p: Project) => Project, key?: string) => void;
  setObjects: (fn: (objs: PlanObject[]) => PlanObject[], key?: string) => void;
  updateObject: (id: string, patch: Partial<PlanObject> | ((o: PlanObject) => PlanObject), key?: string) => void;
  addObjects: (objs: PlanObject[], select?: boolean) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  moveSelected: (dx: number, dy: number) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  toggleLockSelected: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  select: (ids: string[], additive?: boolean) => void;
  setTool: (t: Tool) => void;
  setView: (v: ViewMode) => void;
  openDialog: (d: PlanState['dialog']) => void;
  setCalibrationPoints: (c: PlanState['calibrationPoints']) => void;
  undo: () => void;
  redo: () => void;
  setSettings: (s: Partial<PlanSettings>) => void;
  setLayer: (id: LayerId, patch: { visible?: boolean; locked?: boolean }) => void;
  setBackground: (b: Background | undefined, key?: string) => void;
  patchBackground: (patch: Partial<Background>, key?: string) => void;
  switchScenario: (id: string) => void;
  duplicateScenario: (name?: string) => void;
  renameScenario: (id: string, name: string) => void;
  deleteScenario: (id: string) => void;
  replaceScenarioObjects: (objs: PlanObject[]) => void;
  loadProject: (p: Project, opts?: { markSaved?: boolean }) => void;
  markSaved: () => void;
  requestFit: () => void;
}

const touchScenario = (p: Project, fn: (s: Scenario) => Scenario): Project => ({
  ...p,
  updatedAt: new Date().toISOString(),
  scenarios: p.scenarios.map((s) => (s.id === p.activeScenarioId ? fn(s) : s)),
});

/** Dimensions attached to a room edge always follow that edge, so they change as the room changes. */
export function syncAttachedDimensions(objs: PlanObject[]): PlanObject[] {
  if (!objs.some((o) => o.kind === 'dimension' && o.attach)) return objs;
  const rooms = new Map(objs.filter((o) => o.kind === 'room').map((r) => [r.id, r]));
  return objs.map((o) => {
    if (o.kind !== 'dimension' || !o.attach) return o;
    const r = rooms.get(o.attach.roomId);
    if (!r || r.kind !== 'room') return { ...o, attach: undefined };
    const i = o.attach.edgeIndex % r.points.length;
    const a = r.points[i];
    const b = r.points[(i + 1) % r.points.length];
    if (a.x === o.a.x && a.y === o.a.y && b.x === o.b.x && b.y === o.b.y) return o;
    return { ...o, a, b };
  });
}

const withObjects = (p: Project, fn: (objs: PlanObject[]) => PlanObject[]) =>
  touchScenario(p, (s) => ({ ...s, objects: syncAttachedDimensions(fn(s.objects)), revision: s.revision + 1, updatedAt: new Date().toISOString() }));

/** Expand a selection to whole groups. */
export function expandGroups(objects: PlanObject[], ids: string[]): string[] {
  const groups = new Set(objects.filter((o) => ids.includes(o.id) && o.groupId).map((o) => o.groupId));
  if (!groups.size) return ids;
  return Array.from(new Set([...ids, ...objects.filter((o) => o.groupId && groups.has(o.groupId)).map((o) => o.id)]));
}

export const usePlanStore = create<PlanState>((set, get) => ({
  project: createBlankProject(),
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  selectedIds: [],
  tool: 'select',
  view: '2d',
  dialog: null,
  calibrationPoints: null,
  savedAt: null,
  dirty: false,
  fitNonce: 0,
  validation: null,
  setValidation: (validation) => set({ validation }),

  commit: (fn, key) => {
    const { project, past, lastKey, lastAt } = get();
    const next = fn(project);
    if (next === project) return;
    const now = Date.now();
    const coalesce = key && key === lastKey && now - lastAt < COALESCE_MS;
    set({
      project: next,
      past: coalesce ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
      future: [],
      lastKey: key ?? null,
      lastAt: now,
      dirty: true,
    });
  },

  setObjects: (fn, key) => get().commit((p) => withObjects(p, fn), key),

  updateObject: (id, patch, key) =>
    get().setObjects(
      (objs) => objs.map((o) => (o.id === id ? (typeof patch === 'function' ? patch(o) : ({ ...o, ...patch } as PlanObject)) : o)),
      key ?? `update:${id}`,
    ),

  addObjects: (objs, selectNew = true) => {
    get().setObjects((list) => [...list, ...objs]);
    if (selectNew) set({ selectedIds: objs.map((o) => o.id) });
  },

  deleteSelected: () => {
    const { selectedIds } = get();
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    get().setObjects((objs) => objs.filter((o) => !ids.has(o.id) || o.locked));
    set({ selectedIds: [] });
  },

  duplicateSelected: () => {
    const { selectedIds, project } = get();
    const objs = activeScenario(project).objects.filter((o) => selectedIds.includes(o.id));
    if (!objs.length) return;
    const groupMap = new Map<string, string>();
    const copies = objs.map((o) => {
      const c = cloneObject(o, 24, 24);
      if (o.groupId) {
        if (!groupMap.has(o.groupId)) groupMap.set(o.groupId, uid('g'));
        c.groupId = groupMap.get(o.groupId);
      }
      return c;
    });
    get().addObjects(copies);
  },

  moveSelected: (dx, dy) => {
    const ids = new Set(get().selectedIds);
    if (!ids.size) return;
    get().setObjects((objs) => objs.map((o) => (ids.has(o.id) && !o.locked ? translateObject(o, dx, dy) : o)), 'nudge');
  },

  groupSelected: () => {
    const { selectedIds } = get();
    if (selectedIds.length < 2) return;
    const g = uid('g');
    const ids = new Set(selectedIds);
    get().setObjects((objs) => objs.map((o) => (ids.has(o.id) ? { ...o, groupId: g } : o)));
  },

  ungroupSelected: () => {
    const ids = new Set(get().selectedIds);
    get().setObjects((objs) => objs.map((o) => (ids.has(o.id) ? { ...o, groupId: undefined } : o)));
  },

  toggleLockSelected: () => {
    const { selectedIds, project } = get();
    const objs = activeScenario(project).objects.filter((o) => selectedIds.includes(o.id));
    const lock = !objs.every((o) => o.locked);
    const fixed = objs.filter((o) => o.fixed);
    if (!lock && fixed.length && typeof window !== 'undefined') {
      const names = fixed.map((o) => o.name).slice(0, 4).join(', ');
      if (!window.confirm(`${names}${fixed.length > 4 ? '…' : ''} ${fixed.length === 1 ? 'is' : 'are'} marked "${fixed[0].fixed}". Unlock for editing anyway?`)) return;
    }
    const ids = new Set(selectedIds);
    get().setObjects((list) => list.map((o) => (ids.has(o.id) ? { ...o, locked: lock } : o)));
  },

  bringToFront: () => {
    const ids = new Set(get().selectedIds);
    get().setObjects((objs) => [...objs.filter((o) => !ids.has(o.id)), ...objs.filter((o) => ids.has(o.id))]);
  },
  sendToBack: () => {
    const ids = new Set(get().selectedIds);
    get().setObjects((objs) => [...objs.filter((o) => ids.has(o.id)), ...objs.filter((o) => !ids.has(o.id))]);
  },

  select: (ids, additive = false) => {
    const objs = activeScenario(get().project).objects;
    const expanded = expandGroups(objs, ids);
    if (!additive) return set({ selectedIds: expanded });
    const cur = new Set(get().selectedIds);
    const allIn = expanded.every((id) => cur.has(id));
    expanded.forEach((id) => (allIn ? cur.delete(id) : cur.add(id)));
    set({ selectedIds: Array.from(cur) });
  },

  setTool: (tool) => set({ tool, calibrationPoints: tool === 'calibrate' ? get().calibrationPoints : null }),
  setView: (view) => set({ view }),
  openDialog: (dialog) => set({ dialog }),
  setCalibrationPoints: (calibrationPoints) => set({ calibrationPoints }),

  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], lastKey: null, dirty: true, selectedIds: [] });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const [next, ...rest] = future;
    set({ project: next, past: [...past, project], future: rest, lastKey: null, dirty: true, selectedIds: [] });
  },

  setSettings: (s) => get().commit((p) => ({ ...p, settings: { ...p.settings, ...s } }), `settings:${Object.keys(s).join(',')}`),
  setLayer: (id, patch) => get().commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
  setBackground: (b, key) => get().commit((p) => ({ ...p, background: b }), key),
  patchBackground: (patch, key) =>
    get().commit((p) => (p.background ? { ...p, background: { ...p.background, ...patch } } : p), key ?? `bg:${Object.keys(patch).join(',')}`),

  switchScenario: (id) => {
    get().commit((p) => ({ ...p, activeScenarioId: id }));
    set({ selectedIds: [] });
  },
  duplicateScenario: (name) => {
    const src = activeScenario(get().project);
    const now = new Date().toISOString();
    const copy: Scenario = {
      ...structuredClone(src),
      id: uid('s'),
      name: name ?? `${src.name} (copy)`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    get().commit((p) => ({ ...p, scenarios: [...p.scenarios, copy], activeScenarioId: copy.id }));
    set({ selectedIds: [] });
  },
  renameScenario: (id, name) => get().commit((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === id ? { ...s, name } : s)) }), `rename:${id}`),
  deleteScenario: (id) =>
    get().commit((p) => {
      if (p.scenarios.length <= 1) return p;
      const scenarios = p.scenarios.filter((s) => s.id !== id);
      return { ...p, scenarios, activeScenarioId: p.activeScenarioId === id ? scenarios[0].id : p.activeScenarioId };
    }),
  replaceScenarioObjects: (objs) => get().setObjects(() => objs),

  loadProject: (p, opts) =>
    set({
      project: p,
      past: [],
      future: [],
      selectedIds: [],
      lastKey: null,
      dirty: !opts?.markSaved,
      savedAt: opts?.markSaved ? new Date().toISOString() : get().savedAt,
      fitNonce: get().fitNonce + 1,
    }),
  markSaved: () => set({ dirty: false, savedAt: new Date().toISOString() }),
  requestFit: () => set({ fitNonce: get().fitNonce + 1 }),
}));
