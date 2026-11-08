// Project persistence: IndexedDB for autosave/manual save (no 5 MB localStorage
// cap, so embedded PDFs fit) and JSON files for import/export.

import { isWallsLayout, withOffice1Suggestion } from './wallsLayout';
import { repairSizesLayout } from './updateFloorPlan';
import { TRINITY_ADDRESS, isTrinityProject, trinityInventory, upgradeInventory } from './inventory';
import type { Project } from '@/types/plan';
import { DEFAULT_LAYERS, DEFAULT_SETTINGS } from './sampleProject';

const DB = 'trinity-floor-plan';
const STORE = 'projects';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const v = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return v;
}

export const AUTOSAVE_KEY = 'autosave';
export const MANUAL_KEY = 'manual';

/** Serialize a project to a portable, editable JSON document. */
export function serializeProject(p: Project, opts: { includeBackground?: boolean } = {}): string {
  const out: Project = { ...p, updatedAt: new Date().toISOString() };
  if (!opts.includeBackground && out.background) out.background = { ...out.background, originalBase64: undefined, imageDataUrl: '' };
  return JSON.stringify(out, null, 2);
}

export class ProjectParseError extends Error {}

/** Parse + validate a project JSON file, filling defaults for forward compatibility. */
export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectParseError('File is not valid JSON.');
  }
  const p = raw as Partial<Project>;
  if (!p || p.schema !== 'trinity-floor-plan') throw new ProjectParseError('Not a Trinity Floor Plan project file.');
  if (p.version !== 1) throw new ProjectParseError(`Unsupported project version ${String(p.version)}.`);
  if (!Array.isArray(p.scenarios) || !p.scenarios.length) throw new ProjectParseError('Project has no layouts.');
  for (const s of p.scenarios) {
    if (!s || typeof s.id !== 'string' || !Array.isArray(s.objects)) throw new ProjectParseError('A layout in this file is malformed.');
    for (const o of s.objects) {
      if (!o || typeof o.id !== 'string' || !['room', 'wall', 'door', 'furniture', 'label', 'dimension', 'aisle'].includes(o.kind)) {
        throw new ProjectParseError(`Unknown object in layout "${s.name}".`);
      }
    }
  }
  const layers = DEFAULT_LAYERS.map((d) => ({ ...d, ...(p.layers ?? []).find((l) => l.id === d.id) }));
  const bg = p.background && p.background.imageDataUrl ? p.background : undefined;
  // Trinity plans saved before the inventory legend existed get the office's address and inventory.
  // An unedited copy of an earlier default list or header is brought up to date.
  const trinity = isTrinityProject(p as Project);
  const inv = trinity ? upgradeInventory(Array.isArray(p.inventory) ? p.inventory : undefined, p.address) : { inventory: p.inventory, address: p.address };
  return {
    schema: 'trinity-floor-plan',
    version: 1,
    name: p.name ?? 'Imported floor plan',
    address: inv.address ?? (trinity ? TRINITY_ADDRESS : undefined),
    inventory: Array.isArray(inv.inventory) ? inv.inventory : trinity ? trinityInventory() : undefined,
    showInventory: p.showInventory,
    checklist: Array.isArray(p.checklist)
      ? p.checklist.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, text: String(x.text ?? ''), done: !!x.done }))
      : undefined,
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    layers,
    background: bg,
    scenarios: p.scenarios.map((s) => (isWallsLayout(s) ? withOffice1Suggestion(s) : repairSizesLayout(s))),
    activeScenarioId: p.scenarios.some((s) => s.id === p.activeScenarioId) ? p.activeScenarioId! : p.scenarios[0].id,
    customTemplates: p.customTemplates ?? [],
    employees: p.employees ?? [],
    createdAt: p.createdAt ?? new Date().toISOString(),
    updatedAt: p.updatedAt ?? new Date().toISOString(),
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeFileName = (s: string) => s.replace(/[^a-z0-9-_]+/gi, '_').replace(/_+/g, '_').slice(0, 60) || 'floor-plan';
