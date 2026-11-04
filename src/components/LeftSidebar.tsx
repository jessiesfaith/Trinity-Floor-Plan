'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Lock, Pencil, Plus, Ruler, Trash2, Unlock, Upload, Check } from 'lucide-react';
import type { Furniture, FurnitureTemplate, LayerId, Room } from '@/types/plan';
import { activeScenario, usePlanStore, type Tool } from '@/store/usePlanStore';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input, Label, Select, Switch } from './ui/input';
import { LengthInput, NumberInput } from './LengthInput';
import { formatArea, formatLength } from '@/lib/units';
import { roomArea } from '@/lib/objects';
import { changePdfPage } from '@/lib/pdfImport';
import { TRINITY_PDF_ALIGNMENT } from '@/lib/sampleProject';

export default function LeftSidebar({ onAddTemplate }: { onAddTemplate: (t: FurnitureTemplate) => void }) {
  return (
    <Tabs defaultValue="library" className="flex h-full flex-col">
      <TabsList>
        <TabsTrigger value="layers">Layers</TabsTrigger>
        <TabsTrigger value="rooms">Rooms</TabsTrigger>
        <TabsTrigger value="library">Library</TabsTrigger>
        <TabsTrigger value="people">People</TabsTrigger>
        <TabsTrigger value="layouts">Layouts</TabsTrigger>
      </TabsList>
      <TabsContent value="layers"><LayersTab /></TabsContent>
      <TabsContent value="rooms"><RoomsTab /></TabsContent>
      <TabsContent value="library"><LibraryTab onAdd={onAddTemplate} /></TabsContent>
      <TabsContent value="people"><PeopleTab /></TabsContent>
      <TabsContent value="layouts"><LayoutsTab /></TabsContent>
    </Tabs>
  );
}

function LayersTab() {
  const layers = usePlanStore((s) => s.project.layers);
  const bg = usePlanStore((s) => s.project.background);
  const units = usePlanStore((s) => s.project.settings.units);
  const st = usePlanStore.getState;
  const [busy, setBusy] = useState(false);
  const objects = usePlanStore((s) => activeScenario(s.project).objects);
  const count = (id: LayerId) =>
    id === 'background' ? (bg ? 1 : 0) : objects.filter((o) => (id === 'annotations' ? o.kind === 'label' || o.kind === 'dimension' : id === 'rooms' ? o.kind === 'room' : id === 'walls' ? o.kind === 'wall' : id === 'doors' ? o.kind === 'door' : id === 'aisles' ? o.kind === 'aisle' : o.kind === 'furniture')).length;
  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">Floor plan layers</div>
        {layers.map((l) => (
          <div key={l.id} className="flex items-center justify-between py-1 text-sm">
            <span className={l.visible ? '' : 'text-slate-400'}>
              {l.name} <span className="text-xs text-slate-400">({count(l.id)})</span>
            </span>
            <span className="flex gap-1">
              <button className="rounded p-1 hover:bg-slate-100" title={l.visible ? 'Hide' : 'Show'} onClick={() => st().setLayer(l.id, { visible: !l.visible })}>
                {l.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
              </button>
              <button className="rounded p-1 hover:bg-slate-100" title={l.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => st().setLayer(l.id, { locked: !l.locked })}>
                {l.locked ? <Lock className="h-4 w-4 text-amber-600" /> : <Unlock className="h-4 w-4 text-slate-400" />}
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="panel-section">
        <div className="panel-title">Imported floor plan</div>
        {!bg ? (
          <div className="space-y-2 text-xs text-slate-500">
            <p>No reference plan imported. Import your architectural PDF (multi-page supported) or an image of the concept layout.</p>
            <Button size="sm" onClick={() => st().openDialog('import')}>
              <Upload /> Import PDF / image
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="truncate font-medium" title={bg.fileName}>{bg.fileName}</span>
              <span className={bg.calibrated ? 'rounded bg-teal-100 px-1.5 text-teal-600' : 'rounded bg-amber-100 px-1.5 text-amber-800'}>{bg.calibrated ? 'Calibrated' : 'Not calibrated'}</span>
            </div>
            <p className="text-[11px] text-slate-500">The original file is stored unmodified; only this display copy is positioned and scaled.</p>
            <Switch checked={bg.visible} label="Show background" onChange={(v) => st().patchBackground({ visible: v })} />
            <Switch checked={!bg.locked} label="Allow moving / scaling" onChange={(v) => st().patchBackground({ locked: !v })} />
            {bg.pageCount > 1 && (
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <Label>Page</Label>
                <Select
                  value={bg.page}
                  disabled={busy}
                  onChange={async (e) => {
                    setBusy(true);
                    try {
                      st().setBackground(await changePdfPage(bg, Number(e.target.value)));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {Array.from({ length: bg.pageCount }, (_, i) => (
                    <option key={i} value={i + 1}>Page {i + 1}</option>
                  ))}
                </Select>
              </div>
            )}
            <div className="grid grid-cols-[80px_1fr] items-center gap-2">
              <Label>Opacity</Label>
              <input type="range" min={0.05} max={1} step={0.05} value={bg.opacity} onChange={(e) => st().patchBackground({ opacity: Number(e.target.value) })} />
              <Label>Position X</Label>
              <LengthInput disabled={bg.locked} value={bg.x} units={units} min={-1e6} onCommit={(v) => st().patchBackground({ x: v })} />
              <Label>Position Y</Label>
              <LengthInput disabled={bg.locked} value={bg.y} units={units} min={-1e6} onCommit={(v) => st().patchBackground({ y: v })} />
              <Label>Rotation</Label>
              <NumberInput value={bg.rotation} suffix="°" onCommit={(v) => !bg.locked && st().patchBackground({ rotation: v })} />
              <Label>Scale</Label>
              <NumberInput value={Math.round(bg.scale * 10000) / 10000} step={0.001} suffix="in/px" onCommit={(v) => !bg.locked && v > 0 && st().patchBackground({ scale: v, calibrated: false })} />
            </div>
            <details className="rounded border border-slate-200 p-1.5">
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">Crop (image pixels)</summary>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {(['x', 'y', 'width', 'height'] as const).map((k) => (
                  <label key={k} className="text-[10px] text-slate-500">
                    {k}
                    <NumberInput
                      value={bg.crop?.[k] ?? (k === 'width' ? bg.imageWidth : k === 'height' ? bg.imageHeight : 0)}
                      onCommit={(v) => {
                        const c = bg.crop ?? { x: 0, y: 0, width: bg.imageWidth, height: bg.imageHeight };
                        st().patchBackground({ crop: { ...c, [k]: Math.max(0, v) } });
                      }}
                    />
                  </label>
                ))}
              </div>
              <Button size="xs" variant="ghost" onClick={() => st().patchBackground({ crop: undefined })}>Reset crop</Button>
            </details>
            <div className="flex flex-wrap gap-1 pt-1">
              <Button size="xs" variant="navy" onClick={() => st().setTool('calibrate')}>
                <Ruler /> Calibrate
              </Button>
              {bg.sourceType === 'pdf' && (
                <Button
                  size="xs"
                  variant="outline"
                  title="Places Floor_Plan.pdf exactly under the traced Trinity suite"
                  onClick={() => {
                    const A = TRINITY_PDF_ALIGNMENT;
                    const renderedPerScan = Math.max(bg.imageWidth, bg.imageHeight) / A.scanWidth;
                    st().patchBackground({
                      rotation: A.rotation,
                      scale: A.inchesPerScanPixel / renderedPerScan,
                      x: A.x,
                      y: A.y,
                      crop: undefined,
                      calibrated: true,
                      calibration: { measuredInches: 288, realInches: 288, date: new Date().toISOString() },
                    });
                  }}
                >
                  Align to traced plan
                </Button>
              )}
              <Button size="xs" variant="outline" onClick={() => st().openDialog('import')}>Replace</Button>
              <Button size="xs" variant="outline" className="text-red-600" onClick={() => st().setBackground(undefined)}>Remove</Button>
            </div>
            {bg.calibration && (
              <p className="text-[11px] text-slate-500">
                Calibrated {new Date(bg.calibration.date).toLocaleDateString()}: {formatLength(bg.calibration.measuredInches, units)} → {formatLength(bg.calibration.realInches, units)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RoomsTab() {
  const objects = usePlanStore((s) => activeScenario(s.project).objects);
  const units = usePlanStore((s) => s.project.settings.units);
  const selectedIds = usePlanStore((s) => s.selectedIds);
  const st = usePlanStore.getState;
  const rooms = objects.filter((o): o is Room => o.kind === 'room');
  return (
    <div>
      <div className="panel-section">
        <div className="mb-2 flex items-center justify-between">
          <span className="panel-title mb-0">Rooms ({rooms.length})</span>
          <Button size="xs" variant="outline" onClick={() => st().setTool('room')}>
            <Plus /> Draw room
          </Button>
        </div>
        <ul className="space-y-0.5">
          {rooms.map((r) => {
            return (
              <li key={r.id}>
                <button
                  className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-slate-100 ${selectedIds.includes(r.id) ? 'bg-teal-100 text-teal-600' : ''}`}
                  onClick={() => st().select([r.id])}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ background: r.fill }} />
                    <span className="truncate">{r.name}</span>
                    {r.fixed && <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase text-amber-800" title={r.fixed}>fixed</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{formatArea(roomArea(r), units)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="panel-section text-xs text-slate-500">
        Double-click a room name on the canvas to rename it. Select a room to drag its corners or type exact edge lengths in the properties panel.
      </div>
    </div>
  );
}

const TOOL_ITEMS: { tool: Tool; label: string }[] = [
  { tool: 'wall', label: 'Wall' },
  { tool: 'room', label: 'Room' },
  { tool: 'door', label: 'Door' },
  { tool: 'aisle', label: 'Walking aisle' },
  { tool: 'label', label: 'Text label' },
  { tool: 'dimension', label: 'Dimension' },
];

function LibraryTab({ onAdd }: { onAdd: (t: FurnitureTemplate) => void }) {
  const custom = usePlanStore((s) => s.project.customTemplates);
  const units = usePlanStore((s) => s.project.settings.units);
  const st = usePlanStore.getState;
  const all = [...BUILT_IN_TEMPLATES, ...custom];
  const cats = Array.from(new Set(all.map((t) => t.category)));
  const [w, setW] = useState(48);
  const [d, setD] = useState(48);
  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">Architecture tools</div>
        <div className="grid grid-cols-2 gap-1">
          {TOOL_ITEMS.map((t) => (
            <Button key={t.tool} size="xs" variant="outline" onClick={() => st().setTool(t.tool)}>
              {t.label}
            </Button>
          ))}
        </div>
      </div>
      {cats.map((c) => (
        <div key={c} className="panel-section">
          <div className="panel-title">{c}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {all
              .filter((t) => t.category === c)
              .map((t) => (
                <div key={t.id} className="group relative">
                  <button
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-fp-template', t.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAdd(t)}
                    title="Click to add at view center, or drag onto the plan"
                    className="flex w-full flex-col items-center gap-1 rounded-md border border-slate-200 bg-white p-1.5 text-center hover:border-teal hover:bg-teal-100/40"
                  >
                    <TemplateIcon t={t} />
                    <span className="text-[11px] leading-tight text-slate-700">{t.label}</span>
                    <span className="text-[10px] text-slate-400">{formatLength(t.width, units)} × {formatLength(t.depth, units)}</span>
                  </button>
                  {!t.builtIn && (
                    <button
                      className="absolute right-1 top-1 hidden rounded bg-white p-0.5 text-red-600 shadow group-hover:block"
                      title="Delete template"
                      onClick={() => st().commit((p) => ({ ...p, customTemplates: p.customTemplates.filter((x) => x.id !== t.id) }))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="panel-section">
        <div className="panel-title">Custom size workstation</div>
        <div className="grid grid-cols-2 gap-1">
          <LengthInput value={w} units={units} min={6} onCommit={setW} />
          <LengthInput value={d} units={units} min={6} onCommit={setD} />
        </div>
        <Button
          size="xs"
          className="mt-2"
          onClick={() =>
            onAdd({ ...BUILT_IN_TEMPLATES[0], id: 'custom-size', label: `Cubicle ${formatLength(w, 'ft-in')}×${formatLength(d, 'ft-in')}`, width: w, depth: d, builtIn: false })
          }
        >
          <Plus /> Add custom cubicle
        </Button>
        <p className="mt-1 text-[11px] text-slate-500">Select any furniture and use “Save as template” to keep it in this library.</p>
      </div>
    </div>
  );
}

function TemplateIcon({ t }: { t: FurnitureTemplate }) {
  const k = 36 / Math.max(t.width, t.depth);
  const w = Math.max(4, t.width * k);
  const h = Math.max(3, t.depth * k);
  return (
    <svg width="40" height="40" viewBox="-20 -20 40 40" aria-hidden>
      {t.type === 'plant' ? (
        <circle r={w / 2} fill={t.color} stroke="#14213d" strokeWidth="1" />
      ) : t.type === 'cubicle' ? (
        <path d={`M${-w / 2},${h / 2} V${-h / 2} H${w / 2} V${h / 2}`} fill={t.color} stroke="#14213d" strokeWidth="2" />
      ) : (
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={t.type === 'conference-table' ? 4 : 1} fill={t.color} stroke="#14213d" strokeWidth="1" />
      )}
    </svg>
  );
}

function PeopleTab() {
  const employees = usePlanStore((s) => s.project.employees);
  const objects = usePlanStore((s) => activeScenario(s.project).objects);
  const st = usePlanStore.getState;
  const [name, setName] = useState('');
  const [dept, setDept] = useState('');
  const ws = objects.filter((o): o is Furniture => o.kind === 'furniture' && o.isWorkstation);
  const assigned = new Set(ws.flatMap((f) => f.assignedTo.filter(Boolean)));
  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">Employee roster</div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Department" />
          <Button
            size="icon"
            disabled={!name.trim()}
            onClick={() => {
              st().commit((p) => ({ ...p, employees: [...p.employees.filter((e) => e.name !== name.trim()), { name: name.trim(), department: dept.trim() }] }));
              setName('');
            }}
          >
            <Plus />
          </Button>
        </div>
        <ul className="mt-2 space-y-0.5">
          {employees.map((e) => (
            <li key={e.name} className="flex items-center justify-between text-sm">
              <span>
                {e.name} <span className="text-xs text-slate-400">{e.department}</span>
              </span>
              <span className="flex items-center gap-1">
                {assigned.has(e.name) ? <Check className="h-3.5 w-3.5 text-teal" /> : <span className="text-[10px] text-slate-400">unseated</span>}
                <button className="text-slate-400 hover:text-red-600" onClick={() => st().commit((p) => ({ ...p, employees: p.employees.filter((x) => x.name !== e.name) }))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel-section">
        <div className="panel-title">Seat assignments ({ws.reduce((a, f) => a + f.assignedTo.filter(Boolean).length, 0)}/{ws.reduce((a, f) => a + f.seats, 0)})</div>
        <datalist id="roster-list">
          {employees.map((e) => (
            <option key={e.name} value={e.name} />
          ))}
        </datalist>
        <div className="space-y-1">
          {ws.map((f) =>
            f.assignedTo.map((a, i) => (
              <div key={`${f.id}-${i}`} className="grid grid-cols-[96px_1fr] items-center gap-1">
                <button className="truncate text-left text-xs text-slate-600 hover:text-teal" onClick={() => st().select([f.id])} title={f.name}>
                  {f.name}
                  {f.seats > 1 ? ` #${i + 1}` : ''}
                </button>
                <Input
                  list="roster-list"
                  value={a}
                  placeholder="Unassigned"
                  className="h-7 text-xs"
                  onChange={(e) => st().updateObject(f.id, { assignedTo: f.assignedTo.map((x, j) => (j === i ? e.target.value : x)) } as Partial<Furniture>, `assign:${f.id}:${i}`)}
                />
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function LayoutsTab() {
  const project = usePlanStore((s) => s.project);
  const st = usePlanStore.getState;
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="panel-section">
      <div className="mb-2 flex items-center justify-between">
        <span className="panel-title mb-0">Saved layouts</span>
        <Button size="xs" variant="outline" onClick={() => st().duplicateScenario()}>
          <Copy /> Duplicate current
        </Button>
      </div>
      <ul className="space-y-1">
        {project.scenarios.map((s) => {
          const active = s.id === project.activeScenarioId;
          const ws = s.objects.filter((o): o is Furniture => o.kind === 'furniture' && o.isWorkstation);
          return (
            <li key={s.id} className={`rounded-md border p-2 ${active ? 'border-teal bg-teal-100/40' : 'border-slate-200 bg-white'}`}>
              {editing === s.id ? (
                <Input autoFocus defaultValue={s.name} onBlur={(e) => { st().renameScenario(s.id, e.target.value || s.name); setEditing(null); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              ) : (
                <button className="w-full text-left" onClick={() => st().switchScenario(s.id)}>
                  <div className="text-sm font-semibold text-navy">{s.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {ws.length} workstations · {ws.reduce((a, f) => a + f.seats, 0)} seats · r{s.revision}
                  </div>
                </button>
              )}
              <div className="mt-1 flex gap-1">
                <Button size="xs" variant="ghost" onClick={() => setEditing(s.id)}><Pencil /> Rename</Button>
                <Button size="xs" variant="ghost" className="text-red-600" disabled={project.scenarios.length < 2} onClick={() => confirm(`Delete layout “${s.name}”?`) && st().deleteScenario(s.id)}>
                  <Trash2 /> Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">Each layout is independent: editing one never changes another. Use Compare in the toolbar to see them side by side.</p>
    </div>
  );
}
