'use client';

import { useState } from 'react';
import { AlertTriangle, Copy, Group as GroupIcon, Lock, RotateCw, Trash2, Unlock, Ungroup, Save } from 'lucide-react';
import type { Aisle, Dimension, Door, Furniture, LabelStyle, PlanObject, Room, TextLabel, Wall, FurnitureTemplate } from '@/types/plan';
import { activeScenario, usePlanStore } from '@/store/usePlanStore';
import { Button } from './ui/button';
import { Input, Label, Select, Switch, Textarea } from './ui/input';
import { LengthInput, NumberInput } from './LengthInput';
import { add, dist, norm, polygonArea, scale, sub, bbox } from '@/lib/geometry';
import { formatArea, formatLength } from '@/lib/units';
import { uid } from '@/lib/objects';

const ROOM_TYPES: Room['roomType'][] = ['conference', 'office', 'kitchen', 'it', 'storage', 'open', 'hall', 'entrance', 'cubicle-area', 'other'];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2 py-0.5">
      <Label className="normal-case tracking-normal">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-slate-300" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 font-mono text-xs" />
    </div>
  );
}

export default function PropertiesPanel() {
  const project = usePlanStore((s) => s.project);
  const selectedIds = usePlanStore((s) => s.selectedIds);
  const st = usePlanStore.getState;
  const objects = activeScenario(project).objects;
  const sel = objects.filter((o) => selectedIds.includes(o.id));
  const units = project.settings.units;
  const fmt = (v: number) => formatLength(v, units);

  if (!sel.length) {
    return (
      <div className="p-4 text-sm text-slate-500">
        <p className="font-semibold text-navy">Nothing selected</p>
        <p className="mt-1">Click any room, wall, door, cubicle, label or dimension to edit its properties. Shift-click or drag a box to multi-select.</p>
        <p className="mt-3 text-xs">Tip: type lengths as <code>4&apos;-6&quot;</code>, <code>4.5ft</code>, <code>54&quot;</code> or <code>1.37m</code>.</p>
      </div>
    );
  }

  const o = sel[0];
  const upd = (patch: Partial<PlanObject>, key?: string) => st().updateObject(o.id, patch, key);
  const locked = o.locked;

  const actions = (
    <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
      <Button size="xs" variant="outline" onClick={() => st().duplicateSelected()} title="Duplicate (Ctrl+D)">
        <Copy /> Duplicate
      </Button>
      <Button size="xs" variant="outline" onClick={() => st().toggleLockSelected()} title="Lock / unlock">
        {sel.every((x) => x.locked) ? <Unlock /> : <Lock />} {sel.every((x) => x.locked) ? 'Unlock' : 'Lock'}
      </Button>
      {sel.length > 1 && (
        <Button size="xs" variant="outline" onClick={() => st().groupSelected()} title="Group (Ctrl+G)">
          <GroupIcon /> Group
        </Button>
      )}
      {sel.some((x) => x.groupId) && (
        <Button size="xs" variant="outline" onClick={() => st().ungroupSelected()} title="Ungroup (Ctrl+Shift+G)">
          <Ungroup /> Ungroup
        </Button>
      )}
      <Button size="xs" variant="outline" className="text-red-600" onClick={() => st().deleteSelected()} title="Delete (Del)">
        <Trash2 /> Delete
      </Button>
    </div>
  );

  if (sel.length > 1) {
    const ws = sel.filter((x): x is Furniture => x.kind === 'furniture');
    return (
      <div>
        {actions}
        <div className="p-3 text-sm">
          <p className="font-semibold text-navy">{sel.length} objects selected</p>
          <p className="text-xs text-slate-500">{ws.length} furniture · {ws.reduce((a, f) => a + f.seats, 0)} seats</p>
          {ws.length > 1 && (
            <div className="mt-3 space-y-1">
              <Label>Set size for all selected furniture</Label>
              <div className="grid grid-cols-2 gap-2">
                <LengthInput value={ws[0].width} units={units} onCommit={(v) => st().setObjects((objs) => objs.map((x) => (selectedIds.includes(x.id) && x.kind === 'furniture' && !x.locked ? { ...x, width: v } : x)))} />
                <LengthInput value={ws[0].depth} units={units} onCommit={(v) => st().setObjects((objs) => objs.map((x) => (selectedIds.includes(x.id) && x.kind === 'furniture' && !x.locked ? { ...x, depth: v } : x)))} />
              </div>
              <Label>Department for all</Label>
              <Input defaultValue="" placeholder="e.g. Inside Sales" onBlur={(e) => e.target.value && st().setObjects((objs) => objs.map((x) => (selectedIds.includes(x.id) && x.kind === 'furniture' ? { ...x, department: e.target.value } : x)))} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const title: Record<PlanObject['kind'], string> = {
    room: 'Room Properties',
    wall: 'Wall Properties',
    door: 'Door Properties',
    furniture: o.kind === 'furniture' && o.type === 'cubicle' ? 'Cubicle Properties' : 'Furniture Properties',
    label: 'Label Properties',
    dimension: 'Dimension Properties',
    aisle: 'Aisle Properties',
  };

  return (
    <div className="text-sm">
      {actions}
      <div className="panel-section">
        <div className="panel-title">{title[o.kind]}</div>
        {o.fixed && (
          <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
            {o.fixed} — this matches the contractor&apos;s plan. {locked ? 'Unlock to change it anyway.' : 'Unlocked: changes here no longer match the contractor plan.'}
          </p>
        )}
        {locked && !o.fixed && <p className="mb-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">🔒 Locked — unlock to edit geometry.</p>}
        <Row label="Name">
          <Input value={o.name} onChange={(e) => upd({ name: e.target.value } as Partial<PlanObject>, `name:${o.id}`)} />
        </Row>
        {o.kind === 'furniture' && <FurnitureFields f={o} fmt={fmt} />}
        {o.kind === 'room' && <RoomFields r={o} />}
        {o.kind === 'wall' && <WallFields w={o} />}
        {o.kind === 'door' && <DoorFields d={o} />}
        {o.kind === 'label' && <LabelFields l={o} />}
        {o.kind === 'dimension' && <DimensionFields d={o} />}
        {o.kind === 'aisle' && <AisleFields a={o} />}
        <Row label="Notes">
          <Textarea value={o.notes} onChange={(e) => upd({ notes: e.target.value } as Partial<PlanObject>, `notes:${o.id}`)} />
        </Row>
      </div>
      <IssuesFor id={o.id} />
    </div>
  );
}

function useUpd(id: string) {
  return (patch: Partial<PlanObject>, key?: string) => usePlanStore.getState().updateObject(id, patch, key);
}

function IssuesFor({ id }: { id: string }) {
  const all = usePlanStore((s) => s.validation?.issues);
  const issues = all?.filter((i) => i.objectIds.includes(id) && i.severity !== 'info');
  if (!issues?.length) return null;
  return (
    <div className="panel-section">
      <div className="panel-title text-red-700">Layout warnings</div>
      <ul className="space-y-1">
        {issues.map((i, k) => (
          <li key={k} className={i.severity === 'error' ? 'flex gap-1 text-xs text-red-700' : 'flex gap-1 text-xs text-amber-700'}>
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FurnitureFields({ f, fmt }: { f: Furniture; fmt: (v: number) => string }) {
  const units = usePlanStore((s) => s.project.settings.units);
  const employees = usePlanStore((s) => s.project.employees);
  const upd = useUpd(f.id);
  const [eq, setEq] = useState('');
  const dis = f.locked;
  return (
    <>
      <Row label="Width">
        <LengthInput disabled={dis} value={f.width} units={units} min={1} onCommit={(v) => upd({ width: v } as Partial<PlanObject>)} />
      </Row>
      <Row label="Depth">
        <LengthInput disabled={dis} value={f.depth} units={units} min={1} onCommit={(v) => upd({ depth: v } as Partial<PlanObject>)} />
      </Row>
      <Row label="Rotation">
        <div className="flex gap-1">
          <NumberInput value={f.rotation} suffix="°" onCommit={(v) => upd({ rotation: ((v % 360) + 360) % 360 } as Partial<PlanObject>)} />
          <Button size="icon" variant="outline" disabled={dis} title="Rotate 90°" onClick={() => upd({ rotation: (f.rotation + 90) % 360 } as Partial<PlanObject>)}>
            <RotateCw />
          </Button>
        </div>
      </Row>
      <Row label="Position">
        <div className="grid grid-cols-2 gap-1">
          <LengthInput disabled={dis} value={f.x} units={units} min={-1e6} onCommit={(v) => upd({ x: v } as Partial<PlanObject>)} />
          <LengthInput disabled={dis} value={f.y} units={units} min={-1e6} onCommit={(v) => upd({ y: v } as Partial<PlanObject>)} />
        </div>
      </Row>
      <p className="pb-1 text-right text-[11px] text-slate-500">Footprint {formatArea(f.width * f.depth, units)}</p>
      <Row label="Workstation">
        <Switch checked={f.isWorkstation} label="" onChange={(v) => upd({ isWorkstation: v, seats: v ? Math.max(1, f.seats) : f.seats, access: v ? (f.access === 'none' ? 'front-chair' : f.access) : 'none', assignedTo: v ? f.assignedTo.length ? f.assignedTo : [''] : [] } as Partial<PlanObject>)} />
      </Row>
      {f.isWorkstation && (
        <>
          <Row label="Seats">
            <NumberInput value={f.seats} onCommit={(v) => {
              const n = Math.max(1, Math.round(v));
              upd({ seats: n, assignedTo: Array.from({ length: n }, (_, i) => f.assignedTo[i] ?? '') } as Partial<PlanObject>);
            }} />
          </Row>
          <Row label="Clearance">
            <Select value={f.access} onChange={(e) => upd({ access: e.target.value as Furniture['access'] } as Partial<PlanObject>)}>
              <option value="front-aisle">Opening faces aisle (min aisle)</option>
              <option value="front-chair">Chair zone in front</option>
              <option value="both-chair">Chair zones front & back</option>
              <option value="none">No access check</option>
            </Select>
          </Row>
          {f.assignedTo.map((a, i) => (
            <Row key={i} label={f.seats > 1 ? `Seat ${i + 1}` : 'Assigned to'}>
              <Input
                list="employee-roster"
                value={a}
                placeholder="Unassigned"
                onChange={(e) => upd({ assignedTo: f.assignedTo.map((x, j) => (j === i ? e.target.value : x)) } as Partial<PlanObject>, `assign:${f.id}:${i}`)}
              />
            </Row>
          ))}
          <datalist id="employee-roster">
            {employees.map((e) => (
              <option key={e.name} value={e.name}>
                {e.department}
              </option>
            ))}
          </datalist>
          <Row label="Department">
            <Input value={f.department} onChange={(e) => upd({ department: e.target.value } as Partial<PlanObject>, `dept:${f.id}`)} placeholder="e.g. Inside Sales" />
          </Row>
          <Row label="Desk type">
            <Input value={f.deskType} onChange={(e) => upd({ deskType: e.target.value } as Partial<PlanObject>, `desk:${f.id}`)} />
          </Row>
          <Row label="Equipment">
            <div>
              <div className="mb-1 flex flex-wrap gap-1">
                {f.equipment.map((x, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded bg-teal-100 px-1.5 py-0.5 text-[11px] text-teal-600">
                    {x}
                    <button aria-label={`Remove ${x}`} onClick={() => upd({ equipment: f.equipment.filter((_, j) => j !== i) } as Partial<PlanObject>)}>×</button>
                  </span>
                ))}
              </div>
              <Input
                value={eq}
                placeholder="Add item + Enter (e.g. dual monitors)"
                onChange={(e) => setEq(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && eq.trim()) {
                    upd({ equipment: [...f.equipment, eq.trim()] } as Partial<PlanObject>);
                    setEq('');
                  }
                }}
              />
            </div>
          </Row>
        </>
      )}
      {(f.type === 'cubicle' || f.type === 'partition') && (
        <Row label="Partition ht">
          <LengthInput value={f.partitionHeight ?? 53} units={units} onCommit={(v) => upd({ partitionHeight: v } as Partial<PlanObject>)} />
        </Row>
      )}
      <Row label="Color">
        <Color value={f.color} onChange={(v) => upd({ color: v } as Partial<PlanObject>, `color:${f.id}`)} />
      </Row>
      <Row label="Overlap OK">
        <Switch checked={!!f.overlapsAllowed} label="" onChange={(v) => upd({ overlapsAllowed: v } as Partial<PlanObject>)} />
      </Row>
      <div className="pt-2">
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            const t: FurnitureTemplate = {
              id: uid('tpl'),
              label: f.name,
              category: 'Custom',
              type: f.type,
              width: f.width,
              depth: f.depth,
              color: f.color,
              isWorkstation: f.isWorkstation,
              seats: f.seats,
              access: f.access,
              partitionHeight: f.partitionHeight,
              deskType: f.deskType,
              overlapsAllowed: f.overlapsAllowed,
              builtIn: false,
            };
            usePlanStore.getState().commit((p) => ({ ...p, customTemplates: [...p.customTemplates, t] }));
          }}
        >
          <Save /> Save as template ({fmt(f.width)} × {fmt(f.depth)})
        </Button>
      </div>
    </>
  );
}

function LabelStyleFields({ style, onChange, withOffset }: { style: LabelStyle | Omit<LabelStyle, 'offset'>; onChange: (s: Partial<LabelStyle>) => void; withOffset?: boolean }) {
  return (
    <>
      <Row label="Font size">
        <NumberInput value={style.fontSize} onCommit={(v) => onChange({ fontSize: Math.max(3, v) })} suffix="pt" />
      </Row>
      <Row label="Weight / align">
        <div className="grid grid-cols-2 gap-1">
          <Select value={style.fontWeight} onChange={(e) => onChange({ fontWeight: e.target.value as 'bold' | 'normal' })}>
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
          </Select>
          <Select value={style.align} onChange={(e) => onChange({ align: e.target.value as LabelStyle['align'] })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </Select>
        </div>
      </Row>
      <Row label="Rotation">
        <NumberInput value={style.rotation} suffix="°" onCommit={(v) => onChange({ rotation: v })} />
      </Row>
      <Row label="Text color">
        <Color value={style.color} onChange={(v) => onChange({ color: v })} />
      </Row>
      <Row label="Background">
        <div className="flex items-center gap-1">
          <Color value={style.background} onChange={(v) => onChange({ background: v })} />
          <Button size="xs" variant="ghost" onClick={() => onChange({ background: '' })}>None</Button>
        </div>
      </Row>
      {withOffset && 'offset' in style && (
        <Row label="Label pos.">
          <Button size="xs" variant="outline" onClick={() => onChange({ offset: { x: 0, y: 0 } })}>Re-center label</Button>
        </Row>
      )}
    </>
  );
}

function RoomFields({ r }: { r: Room }) {
  const units = usePlanStore((s) => s.project.settings.units);
  const upd = useUpd(r.id);
  const area = polygonArea(r.points);
  const b = bbox(r.points);
  const isRect = r.points.length === 4;
  const setEdge = (i: number, L: number) => {
    // Change actual geometry: move the edge's end vertex along the edge direction.
    const a = r.points[i];
    const j = (i + 1) % r.points.length;
    const d = norm(sub(r.points[j], a));
    const old = dist(a, r.points[j]);
    const delta = scale(d, L - old);
    const pts = r.points.map((p, k) => {
      // For rectangles move both vertices of the opposite side so the shape stays rectangular.
      if (k === j) return add(p, delta);
      if (isRect && k === (j + 1) % 4) return add(p, delta);
      return p;
    });
    upd({ points: pts } as Partial<PlanObject>);
  };
  return (
    <>
      <Row label="Type">
        <Select value={r.roomType} onChange={(e) => upd({ roomType: e.target.value as Room['roomType'] } as Partial<PlanObject>)}>
          {ROOM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </Row>
      <div className="my-2 rounded border border-slate-200 bg-slate-50 p-2">
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-navy">Area (from geometry)</span>
          <span className="font-mono">{formatArea(area, units)}</span>
        </div>
        <div className="flex justify-between text-[11px] text-slate-500">
          <span>Bounding box</span>
          <span className="font-mono">{formatLength(b.width, units)} × {formatLength(b.height, units)}</span>
        </div>
        {r.planning?.widthFt && (
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>Planning input</span>
            <span className="font-mono">{r.planning.widthFt}′ × {r.planning.lengthFt}′ = {(r.planning.widthFt * (r.planning.lengthFt ?? 0)).toFixed(0)} sq ft</span>
          </div>
        )}
      </div>
      <Label>Edge lengths — changes the actual geometry</Label>
      <div className="mt-1 space-y-1">
        {r.points.map((p, i) => (
          <div key={i} className="grid grid-cols-[40px_1fr] items-center gap-2">
            <span className="text-[11px] text-slate-500">Edge {i + 1}</span>
            <LengthInput disabled={r.locked} value={dist(p, r.points[(i + 1) % r.points.length])} units={units} min={1} onCommit={(v) => setEdge(i, v)} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Drag teal corner handles on the canvas; click a square midpoint to add a corner; double-click a corner to remove it.</p>
      <Row label="Verified">
        <Switch checked={r.dimensionsVerified} label={<span className="text-xs">{r.dimensionsVerified ? 'Field-verified' : 'Preliminary'}</span>} onChange={(v) => upd({ dimensionsVerified: v } as Partial<PlanObject>)} />
      </Row>
      {r.roomType === 'cubicle-area' && (
        <>
          <Row label="Target seats">
            <div className="grid grid-cols-2 gap-1">
              <NumberInput value={r.planning?.targetMin ?? 0} onCommit={(v) => upd({ planning: { ...r.planning, targetMin: v } } as Partial<PlanObject>)} />
              <NumberInput value={r.planning?.targetMax ?? 0} onCommit={(v) => upd({ planning: { ...r.planning, targetMax: v } } as Partial<PlanObject>)} />
            </div>
          </Row>
          <Row label="Department">
            <Input value={r.planning?.department ?? ''} onChange={(e) => upd({ planning: { ...r.planning, department: e.target.value } } as Partial<PlanObject>, `rdept:${r.id}`)} />
          </Row>
        </>
      )}
      <Row label="Fill">
        <Color value={r.fill} onChange={(v) => upd({ fill: v } as Partial<PlanObject>, `fill:${r.id}`)} />
      </Row>
      <Row label="Show area">
        <Switch checked={r.showArea} label="" onChange={(v) => upd({ showArea: v } as Partial<PlanObject>)} />
      </Row>
      <div className="mt-2 panel-title">Label</div>
      <LabelStyleFields withOffset style={r.label} onChange={(s) => upd({ label: { ...r.label, ...s } } as Partial<PlanObject>, `rlabel:${r.id}`)} />
    </>
  );
}

function WallFields({ w }: { w: Wall }) {
  const units = usePlanStore((s) => s.project.settings.units);
  const upd = useUpd(w.id);
  const L = dist(w.a, w.b);
  return (
    <>
      <Row label="Length">
        <LengthInput disabled={w.locked} value={L} units={units} min={1} onCommit={(v) => upd({ b: add(w.a, scale(norm(sub(w.b, w.a)), v)) } as Partial<PlanObject>)} />
      </Row>
      <Row label="Thickness">
        <LengthInput disabled={w.locked} value={w.thickness} units={units} min={0.5} onCommit={(v) => upd({ thickness: v } as Partial<PlanObject>)} />
      </Row>
      <Row label="Type">
        <Select value={w.wallType} onChange={(e) => upd({ wallType: e.target.value as Wall['wallType'] } as Partial<PlanObject>)}>
          <option value="exterior">Exterior</option>
          <option value="interior">Interior</option>
          <option value="partition">Partition</option>
        </Select>
      </Row>
      <Row label="Color">
        <Color value={w.color} onChange={(v) => upd({ color: v } as Partial<PlanObject>, `color:${w.id}`)} />
      </Row>
    </>
  );
}

function DoorFields({ d }: { d: Door }) {
  const units = usePlanStore((s) => s.project.settings.units);
  const upd = useUpd(d.id);
  return (
    <>
      <Row label="Width">
        <LengthInput disabled={d.locked} value={d.width} units={units} min={12} onCommit={(v) => upd({ width: v } as Partial<PlanObject>)} />
      </Row>
      <Row label="Rotation">
        <NumberInput value={d.rotation} suffix="°" onCommit={(v) => upd({ rotation: v } as Partial<PlanObject>)} />
      </Row>
      <Row label="Swing">
        <div className="flex gap-1">
          <Button size="xs" variant="outline" onClick={() => upd({ swing: (d.swing * -1) as 1 | -1 } as Partial<PlanObject>)}>Flip swing side</Button>
          <Button size="xs" variant="outline" onClick={() => upd({ rotation: d.rotation + 180, x: d.x + Math.cos((d.rotation * Math.PI) / 180) * d.width, y: d.y + Math.sin((d.rotation * Math.PI) / 180) * d.width, swing: (d.swing * -1) as 1 | -1 } as Partial<PlanObject>)}>Flip hinge</Button>
        </div>
      </Row>
      <p className="text-[11px] text-slate-500">Drag a door near a wall to snap it onto the wall. Furniture inside the swing arc is flagged.</p>
    </>
  );
}

function LabelFields({ l }: { l: TextLabel }) {
  const upd = useUpd(l.id);
  return (
    <>
      <Row label="Text">
        <Textarea value={l.text} onChange={(e) => upd({ text: e.target.value } as Partial<PlanObject>, `text:${l.id}`)} />
      </Row>
      <LabelStyleFields style={l.style} onChange={(s) => upd({ style: { ...l.style, ...s } } as Partial<PlanObject>, `lstyle:${l.id}`)} />
      <Row label="Callout">
        {l.callout ? (
          <Button size="xs" variant="outline" onClick={() => upd({ callout: undefined } as Partial<PlanObject>)}>Remove leader</Button>
        ) : (
          <Button size="xs" variant="outline" onClick={() => upd({ callout: { x: l.x + 48, y: l.y + 36 } } as Partial<PlanObject>)}>Add leader line</Button>
        )}
      </Row>
    </>
  );
}

function DimensionFields({ d }: { d: Dimension }) {
  const units = usePlanStore((s) => s.project.settings.units);
  const objects = usePlanStore((s) => activeScenario(s.project).objects);
  const upd = useUpd(d.id);
  const L = dist(d.a, d.b);
  const [mode, setMode] = useState<'geometry' | 'label'>('geometry');
  const room = d.attach ? (objects.find((o) => o.id === d.attach!.roomId) as Room | undefined) : undefined;
  const setGeometry = (v: number) => {
    if (room && d.attach) {
      // Resize the attached room edge (real geometry change); the dimension follows automatically.
      const i = d.attach.edgeIndex;
      const j = (i + 1) % room.points.length;
      const dir = norm(sub(room.points[j], room.points[i]));
      const delta = scale(dir, v - L);
      const isRect = room.points.length === 4;
      const pts = room.points.map((p, k) => (k === j || (isRect && k === (j + 1) % 4) ? add(p, delta) : p));
      usePlanStore.getState().updateObject(room.id, { points: pts } as Partial<PlanObject>);
    } else upd({ b: add(d.a, scale(norm(sub(d.b, d.a)), v)) } as Partial<PlanObject>);
  };
  return (
    <>
      <div className="my-2 grid grid-cols-2 overflow-hidden rounded-md border border-slate-300 text-xs">
        <button className={mode === 'geometry' ? 'bg-navy py-1.5 font-semibold text-white' : 'py-1.5'} onClick={() => setMode('geometry')}>
          Change geometry
        </button>
        <button className={mode === 'label' ? 'bg-amber-500 py-1.5 font-semibold text-white' : 'py-1.5'} onClick={() => setMode('label')}>
          Change label only
        </button>
      </div>
      <Row label="Measured">
        <span className="font-mono text-xs text-measure">{formatLength(L, units)}</span>
      </Row>
      {mode === 'geometry' ? (
        <>
          <Row label="Length">
            <LengthInput value={L} units={units} min={1} onCommit={setGeometry} />
          </Row>
          <p className="text-[11px] text-slate-500">{room ? `Attached to an edge of “${room.name}”: changing the length resizes the room.` : 'Moves the end point of the dimension line.'}</p>
        </>
      ) : (
        <>
          <Row label="Label text">
            <Input value={d.labelOverride ?? ''} placeholder={formatLength(L, units)} onChange={(e) => upd({ labelOverride: e.target.value } as Partial<PlanObject>, `lbl:${d.id}`)} />
          </Row>
          <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            Label-only text does NOT change the drawing. It is marked with “*” on the canvas and listed as a warning so the plan can’t silently become misleading.
          </p>
          {d.labelOverride && (
            <Button size="xs" variant="outline" onClick={() => upd({ labelOverride: undefined } as Partial<PlanObject>)}>Reset to measured value</Button>
          )}
        </>
      )}
      <Row label="Offset">
        <LengthInput value={Math.abs(d.offset)} units={units} onCommit={(v) => upd({ offset: Math.sign(d.offset || 1) * v } as Partial<PlanObject>)} />
      </Row>
      <Row label="Side">
        <Button size="xs" variant="outline" onClick={() => upd({ offset: -d.offset } as Partial<PlanObject>)}>Flip side</Button>
      </Row>
      <Row label="Color">
        <Color value={d.color} onChange={(v) => upd({ color: v } as Partial<PlanObject>, `color:${d.id}`)} />
      </Row>
    </>
  );
}

function AisleFields({ a }: { a: Aisle }) {
  const units = usePlanStore((s) => s.project.settings.units);
  const min = usePlanStore((s) => s.project.settings.minAisleWidth);
  const upd = useUpd(a.id);
  return (
    <>
      <Row label="Length">
        <LengthInput value={a.width} units={units} min={6} onCommit={(v) => upd({ width: v } as Partial<PlanObject>)} />
      </Row>
      <Row label="Clear width">
        <LengthInput value={a.depth} units={units} min={6} onCommit={(v) => upd({ depth: v } as Partial<PlanObject>)} />
      </Row>
      {a.depth < min && <p className="text-[11px] text-amber-700">Narrower than the configured minimum aisle ({formatLength(min, units)}).</p>}
      <Row label="Rotation">
        <NumberInput value={a.rotation} suffix="°" onCommit={(v) => upd({ rotation: v } as Partial<PlanObject>)} />
      </Row>
      <Row label="Color">
        <Color value={a.color} onChange={(v) => upd({ color: v } as Partial<PlanObject>, `color:${a.id}`)} />
      </Row>
    </>
  );
}
