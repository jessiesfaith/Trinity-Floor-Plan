'use client';

// Over the plan: the suite's address as a header, and a legend card listing the office's
// current furniture inventory (editable).

import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, Check, Blocks } from 'lucide-react';
import type { InventoryItem } from '@/types/plan';
import { activeScenario, usePlanStore } from '@/store/usePlanStore';
import { inventoryKey, isCubicleFurniture, LONG_WALL, LONG_WALL_COLOR, SHORT_WALL, SHORT_WALL_COLOR, usedByItem } from '@/lib/cubicleParts';
import { floorPlanLayoutOf, hiddenCubeWalls, isWallsLayout, rebuildCubicleWalls } from '@/lib/wallsLayout';
import { blankInventoryItem, groupInventory } from '@/lib/inventory';

const st = usePlanStore.getState;

export function PlanHeader() {
  const address = usePlanStore((s) => s.project.address);
  if (!address) return null;
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-14rem)] truncate rounded-md bg-navy/90 px-3 py-1 text-sm font-semibold text-white shadow sm:max-w-[calc(100%-24rem)]">
      {address}
    </div>
  );
}

export function InventoryLegend() {
  const items = usePlanStore((s) => s.project.inventory);
  const address = usePlanStore((s) => s.project.address);
  const shown = usePlanStore((s) => s.project.showInventory !== false);
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const [editing, setEditing] = useState(false);
  const objects = usePlanStore((s) => activeScenario(s.project).objects);
  if (!items || !shown) return null;
  const used = usedByItem(objects);
  const partFurniture = objects.filter(isCubicleFurniture).length;
  const removePartFurniture = () => {
    if (!window.confirm(`Remove the ${partFurniture} desks, shelves and file cabinets from this layout and keep only the cube walls?`)) return;
    st().setObjects((objs) => objs.filter((o) => !isCubicleFurniture(o)));
    st().select([]);
  };

  // In the Cubicle walls tab: lay the walls out again from the floor plan's cubicles.
  const inWalls = isWallsLayout(activeScenario(st().project));
  const rebuild = () => {
    if (!window.confirm("Lay the cube walls out again from the floor plan's cubicles? Walls you moved, added or deleted here are replaced.")) return;
    st().commit((p) => rebuildCubicleWalls(p));
    st().select([]);
  };

  const setItems = (fn: (xs: InventoryItem[]) => InventoryItem[], key?: string) =>
    st().commit((p) => ({ ...p, inventory: fn(p.inventory ?? []) }), key);
  const patch = (id: string, k: keyof InventoryItem, v: InventoryItem[keyof InventoryItem]) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x)), `inventory:${id}:${k}`);
  const total = items.reduce((n, x) => n + (x.qty ?? 0), 0);

  return (
    <div className={`absolute right-2 top-2 z-20 flex max-h-[calc(100%-4rem)] ${open ? 'w-[min(22rem,calc(100%-1rem))]' : 'w-auto'} flex-col rounded-lg border border-slate-300 bg-white/95 text-xs shadow-lg backdrop-blur`}>
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5">
        <button className="flex flex-1 items-center gap-1 text-left font-semibold text-navy" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Furniture inventory <span className="font-normal text-slate-500">· {total} pieces</span>
        </button>
        {open && (
          <button className="flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-slate-600 hover:text-navy" onClick={() => setEditing((e) => !e)}>
            {editing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {open && (
        <div className="min-h-0 overflow-y-auto px-3 py-2">
          {editing && (
            <label className="mb-2 block">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Plan header</span>
              <input
                className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-0.5"
                value={address ?? ''}
                onChange={(e) => st().commit((p) => ({ ...p, address: e.target.value }), 'address')}
              />
            </label>
          )}
          {!editing && inWalls && (
            <button className="mb-2 flex w-full items-center justify-center gap-1 rounded border border-teal-600 px-2 py-1 font-semibold text-teal-700 hover:bg-teal-50" onClick={rebuild}>
              <Blocks className="h-3.5 w-3.5" /> Lay walls out again from the floor plan
            </button>
          )}
          {!editing && partFurniture > 0 && (
            <button className="mb-2 flex w-full items-center justify-center gap-1 rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50" onClick={removePartFurniture}>
              <Trash2 className="h-3.5 w-3.5" /> Show cube walls only (remove {partFurniture} desks, shelves, cabinets)
            </button>
          )}
          {!editing && used.size > 0 && <div className="mb-1 text-[10px] text-slate-500">Placed in this layout / owned shown on the right.</div>}
          {groupInventory(items).map((g) => (
            <div key={g.area} className="mb-2">
              <div className="mb-0.5 border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-teal-700">{g.area}</div>
              {g.items.map((x) =>
                editing ? (
                  <div key={x.id} className="mb-1 grid grid-cols-[2.5rem_1fr_auto] gap-1">
                    <input
                      className="rounded border border-slate-300 px-1 text-right"
                      inputMode="numeric"
                      value={x.qty ?? ''}
                      placeholder="?"
                      aria-label="Quantity"
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        patch(x.id, 'qty', Number.isFinite(n) ? n : null);
                      }}
                    />
                    <input className="rounded border border-slate-300 px-1" value={x.item} placeholder="Item" aria-label="Item" onChange={(e) => patch(x.id, 'item', e.target.value)} />
                    <button className="px-1 text-slate-400 hover:text-red-600" title="Remove" onClick={() => setItems((xs) => xs.filter((y) => y.id !== x.id))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <span />
                    <input className="rounded border border-slate-300 px-1" value={x.size} placeholder="Size" aria-label="Size" onChange={(e) => patch(x.id, 'size', e.target.value)} />
                    <span />
                    <span />
                    <input className="rounded border border-slate-300 px-1 text-slate-500" value={x.area} placeholder="Area" aria-label="Area" onChange={(e) => patch(x.id, 'area', e.target.value)} />
                  </div>
                ) : (
                  <div key={x.id} className="flex gap-2 py-px">
                    <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-navy">{x.qty ?? '?'}</span>
                    <span className="flex-1">{x.item}</span>
                    {x.size && <span className="text-right text-slate-500">{x.size}</span>}
                    {used.has(inventoryKey(x)) && (
                      <span className={`shrink-0 rounded px-1 font-semibold tabular-nums ${used.get(inventoryKey(x))! > (x.qty ?? 0) ? 'bg-red-100 text-red-700' : 'bg-teal-50 text-teal-700'}`} title="Placed in this layout / owned">
                        {used.get(inventoryKey(x))}/{x.qty ?? '?'}
                      </span>
                    )}
                  </div>
                ),
              )}
              {editing && (
                <button className="flex items-center gap-1 text-teal-700 hover:underline" onClick={() => setItems((xs) => [...xs, blankInventoryItem(g.area)])}>
                  <Plus className="h-3 w-3" /> Add to {g.area}
                </button>
              )}
            </div>
          ))}
          {editing && (
            <button className="flex items-center gap-1 font-semibold text-teal-700 hover:underline" onClick={() => setItems((xs) => [...xs, blankInventoryItem('New area')])}>
              <Plus className="h-3 w-3" /> Add an area
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Cubicle walls tab: how many cubicles, and long / short cube walls placed against what the office owns. */
export function WallCountBox() {
  const project = usePlanStore((s) => s.project);
  const walls = activeScenario(project);
  if (!isWallsLayout(walls)) return null;
  const plan = floorPlanLayoutOf(project);
  const cubicles = plan.objects.filter((o) => o.kind === 'furniture' && o.type === 'cubicle').length;
  const placed = (key: string) => walls.objects.filter((o) => o.kind === 'furniture' && o.inventoryItem === key).length;
  const owned = (key: string) => project.inventory?.find((x) => inventoryKey(x) === key)?.qty ?? null;
  const hidden = hiddenCubeWalls(walls.objects);
  const hiddenLong = hidden.filter((o) => o.kind === 'furniture' && o.inventoryItem === LONG_WALL).length;
  const hiddenShort = hidden.filter((o) => o.kind === 'furniture' && o.inventoryItem === SHORT_WALL).length;
  const rows = [
    { key: LONG_WALL, short: 'long walls', label: "Long walls (4')", color: LONG_WALL_COLOR, used: placed(LONG_WALL), have: owned(LONG_WALL) },
    { key: SHORT_WALL, short: 'short walls', label: "Short walls (2')", color: SHORT_WALL_COLOR, used: placed(SHORT_WALL), have: owned(SHORT_WALL) },
  ];
  return (
    <div className="absolute left-2 top-12 z-10 w-60 rounded-lg border border-slate-300 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="mb-1 font-semibold text-navy">Cube wall count</div>
      <div className="mb-1.5 flex justify-between border-b border-slate-100 pb-1">
        <span>Cubicles (floor plan)</span>
        <span className="font-semibold tabular-nums text-navy">{cubicles}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-0.5 tabular-nums">
        <span className="text-[10px] uppercase tracking-wide text-slate-500" />
        <span className="text-right text-[10px] uppercase tracking-wide text-slate-500">Used</span>
        <span className="text-right text-[10px] uppercase tracking-wide text-slate-500">Have</span>
        <span className="text-right text-[10px] uppercase tracking-wide text-slate-500">Left</span>
        {rows.map((r) => {
          const left = r.have == null ? null : r.have - r.used;
          return [
            <span key={`${r.label}-l`} className="flex items-center gap-1.5 font-medium" style={{ color: r.color }}>
              <span className="inline-block h-1 w-4 rounded" style={{ background: r.color }} />
              {r.label}
            </span>,
            <span key={`${r.label}-u`} className="text-right font-semibold text-navy">{r.used}</span>,
            <span key={`${r.label}-h`} className="text-right text-slate-600">{r.have ?? '?'}</span>,
            <span key={`${r.label}-r`} className={`text-right font-semibold ${left != null && left < 0 ? 'text-red-700' : 'text-teal-700'}`}>{left ?? '?'}</span>,
          ];
        })}
      </div>
      {rows.some((r) => r.have != null && r.used > r.have) && <div className="mt-1.5 text-[10px] font-semibold text-red-700">More walls placed than the office has.</div>}
      {hidden.length > 0 && (
        <div className="mt-1.5 rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">
          <b>{hidden.length}</b> of these ({hiddenLong} long, {hiddenShort} short) sit outside Area A and Area B, so they are hidden here but still counted.
          <button
            className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-amber-300 bg-white px-1 py-0.5 font-semibold text-amber-800 hover:bg-amber-100"
            onClick={() => {
              if (!window.confirm(`Delete the ${hidden.length} hidden cube walls outside Area A and Area B? (Ctrl+Z undoes it.)`)) return;
              const ids = new Set(hidden.map((o) => o.id));
              st().setObjects((objs) => objs.filter((o) => !ids.has(o.id)));
              st().select([]);
            }}
          >
            <Trash2 className="h-3 w-3" /> Delete the {hidden.length} hidden walls
          </button>
        </div>
      )}
      <div className="mt-2 flex gap-1.5 border-t border-slate-100 pt-1.5">
        {rows.map((r) => (
          <button
            key={r.key}
            disabled={!r.used}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-slate-300 px-1 py-0.5 text-[10px] text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-40"
            onClick={() => {
              if (!window.confirm(`Delete all ${r.used} ${r.short} from this tab? (Ctrl+Z undoes it.)`)) return;
              st().setObjects((objs) => objs.filter((o) => !(o.kind === 'furniture' && o.inventoryItem === r.key)));
              st().select([]);
            }}
          >
            <Trash2 className="h-3 w-3" /> Delete all {r.short}
          </button>
        ))}
      </div>
    </div>
  );
}
