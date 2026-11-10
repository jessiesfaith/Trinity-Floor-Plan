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
import { isWallsLayout, openCubicleWalls, openFloorPlan, placeInSections } from '@/lib/wallsLayout';
import { isSizesLayout, openCubicleSizes } from '@/lib/sizesLayout';
import { BUILD_ID, isStaleAssetError, liveBuild, reloadOnce } from '@/lib/freshVersion';
import { createSaveSync } from '@/lib/saveSync';
import type { Project } from '@/types/plan';
import Toolbar from './Toolbar';
import LeftSidebar from './LeftSidebar';
import PropertiesPanel from './PropertiesPanel';
import PlanCanvas from './canvas/PlanCanvas';
import { ChecklistView } from './ChecklistView';
import { nameForNew } from '@/lib/cubicleNumbers';
import { OnlineButton, OnlineChoiceBar, useOnlineSync } from './OnlineSync';
import { CubicleCountBox, CubicleFurnitureBox, InventoryLegend, PlanHeader, WallCountBox } from './InventoryLegend';
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
  const [checklistOpen, setChecklistOpen] = useState(false);
  const viewCenter = useRef<() => Pt>(() => ({ x: 0, y: 0 }));
  const st = usePlanStore.getState;
  // Saving safely alongside other tabs: never write over a plan saved elsewhere since this tab
  // loaded it. `written` is the project this tab last saved or loaded (nothing unsaved when equal).
  const channel = useMemo(() => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('trinity-floor-plan')), []);
  const sync = useMemo(
    () => createSaveSync(() => idbGet<string>(AUTOSAVE_KEY), (json) => idbSet(AUTOSAVE_KEY, json), () => channel?.postMessage('saved')),
    [channel],
  );
  const written = useRef<Project | null>(null);
  const [conflict, setConflict] = useState(false);
  const adopt = useCallback(
    (raw: string) => {
      st().loadProject(parseProject(raw), { markSaved: true });
      sync.accept(raw);
      written.current = st().project;
      setConflict(false);
    },
    [st, sync],
  );
  /** Save this tab's plan unless another tab (or anything else) saved since; returns false on a conflict. */
  const saveSafely = useCallback(
    async (force = false) => {
      const p = st().project;
      if (!force && p === written.current) return true;
      const r = await sync.write(JSON.stringify(p), { force });
      if (r === 'conflict') {
        setConflict(true);
        return false;
      }
      written.current = p;
      setConflict(false);
      return true;
    },
    [st, sync],
  );
  /** Load a plan from the online copy, and keep it in this browser too. */
  const adoptOnline = useCallback(
    async (raw: string) => {
      adopt(raw);
      await saveSafely(true);
    },
    [adopt, saveSafely],
  );

  // ---- Online saving (shared plan for every computer, with the team passcode).
  const online = useOnlineSync({ ready, adoptOnline });

  // ---- Load: autosave -> manual save -> sample project. An unedited copy of an older starter
  // plan is replaced by the current one, so returning visitors see starter-plan updates.
  useEffect(() => {
    (async () => {
      try {
        const auto = await idbGet<string>(AUTOSAVE_KEY);
        sync.accept(auto);
        const saved = auto ?? (await idbGet<string>(MANUAL_KEY));
        if (saved && isOutdatedUneditedSample(JSON.parse(saved))) {
          st().loadProject(createSampleProject());
          setReady(true);
          return;
        }
        if (saved) {
          st().loadProject(parseProject(saved), { markSaved: true });
          written.current = st().project;
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
        // Save first, but never over a plan saved elsewhere; on a conflict, stay and let the user choose.
        const ok = await saveSafely().catch(() => false);
        if (ok && reloadOnce(live)) return;
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
  }, [st, saveSafely]);

  // ---- Autosave (debounced, IndexedDB), never over a plan saved elsewhere meanwhile.
  useEffect(() => {
    if (!ready || !dirty || conflict) return;
    const t = setTimeout(() => {
      saveSafely().catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [project, dirty, ready, conflict, saveSafely]);

  // ---- Pick up a plan saved elsewhere (another tab or window): load it when this tab has nothing
  // unsaved, otherwise ask. Checked when another tab saves, when this tab comes back into view,
  // and every few seconds while it is visible.
  useEffect(() => {
    if (!ready) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const raw = await sync.changedElsewhere();
        if (raw) {
          if (st().project === written.current) adopt(raw);
          else setConflict(true);
        }
      } catch {
        /* storage unavailable: keep going */
      }
      busy = false;
    };
    const onMsg = () => check();
    channel?.addEventListener('message', onMsg);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const timer = setInterval(check, 4000);
    return () => {
      channel?.removeEventListener('message', onMsg);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      clearInterval(timer);
    };
  }, [ready, sync, channel, adopt, st]);

  const save = useCallback(async () => {
    if (!(await saveSafely(false))) return;
    await idbSet(MANUAL_KEY, JSON.stringify(st().project));
    st().markSaved();
  }, [st, saveSafely]);

  // ---- Validation + capacity (deferred so dragging stays smooth).
  const scenario = activeScenario(project);
  const inWalls = isWallsLayout(scenario);
  const layoutTab = inWalls ? 'walls' : isSizesLayout(scenario) ? 'sizes' : 'plan';
  const currentTab = checklistOpen ? 'checklist' : layoutTab;
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
      // In the Cubicle walls tab, keep new pieces inside Area A / Area B (the rest is hidden there).
      if (isWallsLayout(activeScenario(st().project))) at = placeInSections(objs, at);
      const room = roomAt(objs, at);
      const name = nameForNew(objs, t.type, t.label);
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
      <OnlineChoiceBar sync={online} />
      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <span className="font-semibold">This plan was changed somewhere else (another tab or window) while you were editing here.</span>
          <span>Your latest changes in this tab are not saved yet.</span>
          <span className="ml-auto flex gap-1.5">
            <button
              className="rounded bg-navy px-2 py-0.5 font-semibold text-white hover:opacity-90"
              onClick={async () => {
                const raw = await idbGet<string>(AUTOSAVE_KEY);
                if (raw) adopt(raw);
                else setConflict(false);
              }}
            >
              Load the latest plan
            </button>
            <button
              className="rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold text-amber-900 hover:bg-amber-100"
              onClick={() => {
                if (window.confirm("Keep this tab's version and replace the plan saved elsewhere?")) saveSafely(true).catch(() => undefined);
              }}
            >
              Keep this tab&apos;s version
            </button>
          </span>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${leftOpen ? 'absolute inset-y-0 left-0 z-30 block max-w-[85vw] shadow-xl' : 'hidden'} w-72 shrink-0 border-r border-slate-200 bg-white lg:static lg:block lg:shadow-none`}>
          <LeftSidebar onAddTemplate={(t) => place(t)} />
        </aside>
        <main className="relative min-w-0 flex-1">
          <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-slate-200 bg-white/90 px-3 py-1 text-xs backdrop-blur">
            <button className="rounded border border-slate-300 px-1.5 lg:hidden" onClick={() => { setLeftOpen((o) => !o); setRightOpen(false); }}>
              {leftOpen ? 'Close' : 'Library'}
            </button>
            {/* Tabs: the floor plan, the cubicle walls of the cube areas, or sample cubicle sizes */}
            <div className="flex overflow-hidden rounded border border-slate-300" role="tablist" aria-label="View">
              {(['plan', 'walls', 'sizes', 'checklist'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === currentTab}
                  className={`px-2 py-0.5 ${t === currentTab ? 'bg-navy text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  onClick={() => {
                    if (t === currentTab) return;
                    if (t === 'checklist') {
                      setChecklistOpen(true);
                      st().select([]);
                      return;
                    }
                    setChecklistOpen(false);
                    if (t === layoutTab) return;
                    st().commit((p) => (t === 'walls' ? openCubicleWalls(p) : t === 'sizes' ? openCubicleSizes(p) : openFloorPlan(p)));
                    st().select([]);
                  }}
                >
                  {t === 'plan' ? 'Floor plan' : t === 'walls' ? 'Cubicle walls' : t === 'sizes' ? 'Cubicle sizes' : 'Checklist'}
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
            <span className="ml-auto" />
            <OnlineButton sync={online} />
            <button className="text-slate-500 underline-offset-2 hover:text-navy hover:underline" onClick={() => setRightTab('warnings')}>
              Review warnings
            </button>
            <button className="rounded border border-slate-300 px-1.5 lg:hidden" onClick={() => { setRightOpen((o) => !o); setLeftOpen(false); }}>
              {rightOpen ? 'Close' : 'Details'}
            </button>
          </div>
          <div className="absolute inset-0 top-7">
            <PlanCanvas validation={validation} onDropTemplate={onDropTemplate} registerViewCenter={(fn) => (viewCenter.current = fn)} />
            <PlanHeader />
            <WallCountBox />
            <CubicleCountBox />
            <CubicleFurnitureBox />
            <InventoryLegend />
            {checklistOpen && <ChecklistView />}
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
