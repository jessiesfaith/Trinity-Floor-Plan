'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { FurnitureTemplate, Pt } from '@/types/plan';
import { activeScenario, usePlanStore } from '@/store/usePlanStore';
import { validate } from '@/lib/validation';
import { computeCapacity } from '@/lib/capacity';
import { furnitureFromTemplate, roomAt } from '@/lib/objects';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import { AUTOSAVE_KEY, MANUAL_KEY, idbGet, idbSet, parseProject } from '@/lib/persistence';
import { createSampleProject } from '@/lib/sampleProject';
import Toolbar from './Toolbar';
import LeftSidebar from './LeftSidebar';
import PropertiesPanel from './PropertiesPanel';
import PlanCanvas from './canvas/PlanCanvas';
import { CapacityDashboard, WarningsList } from './Dashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import GenerateDialog from './dialogs/GenerateDialog';
import CompareDialog from './dialogs/CompareDialog';
import ExportDialog from './dialogs/ExportDialog';
import SettingsDialog from './dialogs/SettingsDialog';
import { CalibrateDialog, ImportDialog } from './dialogs/ImportCalibrateDialogs';

const AUTOSAVE_MS = 1500;

export default function Planner() {
  const project = usePlanStore((s) => s.project);
  const dirty = usePlanStore((s) => s.dirty);
  const selectedIds = usePlanStore((s) => s.selectedIds);
  const [ready, setReady] = useState(false);
  const [rightTab, setRightTab] = useState('properties');
  const viewCenter = useRef<() => Pt>(() => ({ x: 0, y: 0 }));
  const st = usePlanStore.getState;

  // ---- Load: autosave -> manual save -> sample project.
  useEffect(() => {
    (async () => {
      try {
        const saved = (await idbGet<string>(AUTOSAVE_KEY)) ?? (await idbGet<string>(MANUAL_KEY));
        if (saved) {
          st().loadProject(parseProject(saved), { markSaved: true });
          setReady(true);
          return;
        }
      } catch {
        /* fall through to the sample */
      }
      st().loadProject(createSampleProject());
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Autosave (debounced, IndexedDB).
  useEffect(() => {
    if (!ready || !dirty) return;
    const t = setTimeout(() => {
      idbSet(AUTOSAVE_KEY, JSON.stringify(st().project)).catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [project, dirty, ready, st]);

  const save = useCallback(async () => {
    const json = JSON.stringify(st().project);
    await idbSet(MANUAL_KEY, json);
    await idbSet(AUTOSAVE_KEY, json);
    st().markSaved();
  }, [st]);

  // ---- Validation + capacity (deferred so dragging stays smooth).
  const scenario = activeScenario(project);
  const deferredObjects = useDeferredValue(scenario.objects);
  const validation = useMemo(() => validate(deferredObjects, project.settings, { background: project.background }), [deferredObjects, project.settings, project.background]);
  const capacity = useMemo(() => computeCapacity(deferredObjects, validation, project.settings), [deferredObjects, validation, project.settings]);
  useEffect(() => st().setValidation(validation), [validation, st]);

  // ---- Place a library item (click = view center / selected room; drop = pointer).
  const place = useCallback(
    (t: FurnitureTemplate, p?: Pt) => {
      const objs = activeScenario(st().project).objects;
      let at = p ?? viewCenter.current();
      if (!p) {
        const sel = objs.find((o) => st().selectedIds.includes(o.id) && o.kind === 'room');
        if (sel && sel.kind === 'room') {
          const xs = sel.points.map((q) => q.x);
          const ys = sel.points.map((q) => q.y);
          at = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
        }
      }
      const room = roomAt(objs, at);
      const n = objs.filter((o) => o.kind === 'furniture' && o.type === t.type).length + 1;
      const name = t.type === 'cubicle' ? `Cubicle ${String(n).padStart(2, '0')}` : t.label;
      const f = furnitureFromTemplate(t, at.x, at.y, name);
      if (room?.planning?.department && f.isWorkstation) f.department = room.planning.department;
      st().addObjects([f]);
      setRightTab('properties');
    },
    [st],
  );
  const onDropTemplate = useCallback(
    (id: string, p: Pt) => {
      const t = [...BUILT_IN_TEMPLATES, ...st().project.customTemplates].find((x) => x.id === id);
      if (t) place(t, p);
    },
    [place, st],
  );

  // ---- Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (typing) return;
      const s = st();
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateSelected();
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) s.ungroupSelected();
        else s.groupSelected();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        s.select(activeScenario(s.project).objects.filter((o) => o.kind !== 'room' && o.kind !== 'wall').map((o) => o.id));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.deleteSelected();
      } else if (e.key.startsWith('Arrow') && s.selectedIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 12 : s.project.settings.snapToGrid ? s.project.settings.gridSize : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] as [number, number];
        s.moveSelected(d[0], d[1]);
      } else if (!mod && e.key.toLowerCase() === 'r' && s.selectedIds.length && s.tool === 'select') {
        const ids = new Set(s.selectedIds);
        s.setObjects((objs) => objs.map((o) => (ids.has(o.id) && !o.locked && (o.kind === 'furniture' || o.kind === 'aisle') ? { ...o, rotation: (o.rotation + (e.shiftKey ? -90 : 90) + 360) % 360 } : o)));
      } else if (!mod && !e.altKey) {
        const map: Record<string, Parameters<typeof s.setTool>[0]> = { v: 'select', h: 'pan', m: 'measure', w: 'wall', d: 'door', a: 'aisle', t: 'label', l: 'dimension' };
        const t = map[e.key.toLowerCase()];
        if (t) s.setTool(t);
        else if (e.key.toLowerCase() === 'r' && !s.selectedIds.length) s.setTool('room');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, st]);

  // Show properties when something gets selected.
  useEffect(() => {
    if (selectedIds.length) setRightTab((t) => (t === 'dashboard' || t === 'warnings' ? t : 'properties'));
  }, [selectedIds]);

  if (!ready) return <div className="flex h-screen items-center justify-center text-sm text-slate-500">Loading floor planner…</div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar onSave={save} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-slate-200 bg-white">
          <LeftSidebar onAddTemplate={(t) => place(t)} />
        </aside>
        <main className="relative min-w-0 flex-1">
          <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-3 py-1 text-xs backdrop-blur">
            <span className="font-semibold text-navy">{scenario.name}</span>
            <span className="text-slate-400">r{scenario.revision}</span>
            <span className="text-slate-300">|</span>
            <span>{capacity.totalWorkstations} workstations · {capacity.totalSeats} seats</span>
            <span className={validation.errorCount ? 'font-semibold text-red-700' : 'text-teal-600'}>
              {validation.errorCount ? `${validation.errorCount} conflict${validation.errorCount === 1 ? '' : 's'}` : 'No conflicts'}
            </span>
            {validation.warningCount > 0 && <span className="text-amber-700">{validation.warningCount} warning{validation.warningCount === 1 ? '' : 's'}</span>}
            <button className="ml-auto text-slate-500 underline-offset-2 hover:text-navy hover:underline" onClick={() => setRightTab('warnings')}>
              Review warnings
            </button>
          </div>
          <div className="absolute inset-0 top-7">
            <PlanCanvas validation={validation} onDropTemplate={onDropTemplate} registerViewCenter={(fn) => (viewCenter.current = fn)} />
          </div>
        </main>
        <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
          <Tabs value={rightTab} onValueChange={setRightTab} className="flex h-full min-h-0 flex-col">
            <TabsList>
              <TabsTrigger value="properties">Properties</TabsTrigger>
              <TabsTrigger value="dashboard">Capacity</TabsTrigger>
              <TabsTrigger value="warnings">
                Warnings{validation.errorCount ? <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{validation.errorCount}</span> : null}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="properties"><PropertiesPanel /></TabsContent>
            <TabsContent value="dashboard"><CapacityDashboard cap={capacity} /></TabsContent>
            <TabsContent value="warnings"><WarningsList v={validation} /></TabsContent>
          </Tabs>
        </aside>
      </div>
      <GenerateDialog />
      <CompareDialog />
      <ExportDialog />
      <SettingsDialog />
      <ImportDialog />
      <CalibrateDialog />
    </div>
  );
}
