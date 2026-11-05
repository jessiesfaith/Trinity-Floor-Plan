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
import { isOutdatedUneditedSample } from '@/lib/sampleFingerprint';
import { rotateObjects } from '@/lib/orientation';
import { inventoryKey, LONG_WALL, LONG_WALL_COLOR, SHORT_WALL, SHORT_WALL_COLOR } from '@/lib/cubicleParts';
import { isWallsLayout, openCubicleWalls, openFloorPlan } from '@/lib/wallsLayout';
import { BUILD_ID, isStaleAssetError, liveBuild, reloadOnce } from '@/lib/freshVersion';
import Toolbar from './Toolbar';
import LeftSidebar from './LeftSidebar';
import PropertiesPanel from './PropertiesPanel';
import PlanCanvas from './canvas/PlanCanvas';
import { InventoryLegend, PlanHeader } from './InventoryLegend';
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
  // On narrow screens (below 1024px) the side panels fold away and open over the plan.
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const viewCenter = useRef<() => Pt>(() => ({ x: 0, y: 0 }));
  const st = usePlanStore.getState;

  // ---- Load: autosave -> manual save -> sample project. An unedited copy of an older starter
  // plan is replaced by the current one, so returning visitors see starter-plan updates.
  useEffect(() => {
    (async () => {
      try {
        const saved = (await idbGet<string>(AUTOSAVE_KEY)) ?? (await idbGet<string>(MANUAL_KEY));
        if (saved && isOutdatedUneditedSample(JSON.parse(saved))) {
          st().loadProject(createSampleProject());
          setReady(true);
          return;
        }
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

  // ---- Stay on the newest deployment: when the tab comes back into view, reload into a newer
  // build if one is live (saving the plan first). A missing script file also triggers one reload.
  useEffect(() => {
    if (BUILD_ID === 'dev') return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      const live = await liveBuild();
      if (live && live !== BUILD_ID) {
        if (st().dirty) await idbSet(AUTOSAVE_KEY, JSON.stringify(st().project)).catch(() => undefined);
        if (reloadOnce(live)) return;
      }
      busy = false;
    };
    const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
      if (isStaleAssetError('reason' in e ? e.reason : e.error ?? e.message)) reloadOnce('stale-assets');
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    };
  }, [st]);

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
  const inWalls = isWallsLayout(scenario);
  const wallCount = (key: string) => scenario.objects.filter((o) => o.kind === 'furniture' && o.inventoryItem === key).length;
  const owned = (key: string) => project.inventory?.find((x) => inventoryKey(x) === key)?.qty;
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
      const name = t.type === 'cubicle' ? `Cubicle ${String(n).padStart(2, '0')}` : t.type === 'phone-booth' ? `Phone booth ${n}` : t.label;
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
        s.setObjects((objs) => rotateObjects(objs, s.selectedIds, e.shiftKey ? -90 : 90));
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
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${leftOpen ? 'absolute inset-y-0 left-0 z-30 block max-w-[85vw] shadow-xl' : 'hidden'} w-72 shrink-0 border-r border-slate-200 bg-white lg:static lg:block lg:shadow-none`}>
          <LeftSidebar onAddTemplate={(t) => place(t)} />
        </aside>
        <main className="relative min-w-0 flex-1">
          <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-slate-200 bg-white/90 px-3 py-1 text-xs backdrop-blur">
            <button className="rounded border border-slate-300 px-1.5 lg:hidden" onClick={() => { setLeftOpen((o) => !o); setRightOpen(false); }}>
              {leftOpen ? 'Close' : 'Library'}
            </button>
            {/* Tabs: the floor plan, or the cubicle walls of Area A and Area B */}
            <div className="flex overflow-hidden rounded border border-slate-300" role="tablist" aria-label="View">
              {(['plan', 'walls'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={(t === 'walls') === inWalls}
                  className={`px-2 py-0.5 ${(t === 'walls') === inWalls ? 'bg-navy text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  onClick={() => {
                    if ((t === 'walls') === inWalls) return;
                    st().commit((p) => (t === 'walls' ? openCubicleWalls(p) : openFloorPlan(p)));
                    st().select([]);
                  }}
                >
                  {t === 'plan' ? 'Floor plan' : 'Cubicle walls'}
                </button>
              ))}
            </div>
            {inWalls && (
              <span className="flex items-center gap-2 font-semibold">
                <span className="flex items-center gap-1" style={{ color: LONG_WALL_COLOR }}>
                  <span className="inline-block h-1 w-4 rounded" style={{ background: LONG_WALL_COLOR }} /> Long walls {wallCount(LONG_WALL)}/{owned(LONG_WALL) ?? '?'}
                </span>
                <span className="flex items-center gap-1" style={{ color: SHORT_WALL_COLOR }}>
                  <span className="inline-block h-1 w-2.5 rounded" style={{ background: SHORT_WALL_COLOR }} /> Short walls {wallCount(SHORT_WALL)}/{owned(SHORT_WALL) ?? '?'}
                </span>
              </span>
            )}
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
            <button className="rounded border border-slate-300 px-1.5 lg:hidden" onClick={() => { setRightOpen((o) => !o); setLeftOpen(false); }}>
              {rightOpen ? 'Close' : 'Details'}
            </button>
          </div>
          <div className="absolute inset-0 top-7">
            <PlanCanvas validation={validation} onDropTemplate={onDropTemplate} registerViewCenter={(fn) => (viewCenter.current = fn)} />
            <PlanHeader />
            <InventoryLegend />
          </div>
        </main>
        <aside className={`${rightOpen ? 'absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shadow-xl' : 'hidden'} w-80 shrink-0 flex-col border-l border-slate-200 bg-white lg:static lg:flex lg:shadow-none`}>
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
