'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Wand2 } from 'lucide-react';
import type { PlanObject, Room } from '@/types/plan';
import { activeScenario, usePlanStore } from '@/store/usePlanStore';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label, Select } from '../ui/input';
import { LengthInput, NumberInput } from '../LengthInput';
import { generateLayouts, syntheticRoom, type Arrangement, type DoorSide, type LayoutOption, type Orientation } from '@/lib/generator';
import { renderSvg } from '@/lib/svgRender';
import { formatLength } from '@/lib/units';
import { bbox } from '@/lib/geometry';
import { roomAt, uid } from '@/lib/objects';

export default function GenerateDialog() {
  const open = usePlanStore((s) => s.dialog === 'generate');
  const project = usePlanStore((s) => s.project);
  const selectedIds = usePlanStore((s) => s.selectedIds);
  const st = usePlanStore.getState;
  const objects = activeScenario(project).objects;
  const settings = project.settings;
  const units = settings.units;
  const rooms = objects.filter((o): o is Room => o.kind === 'room');
  const defaultRoom = rooms.find((r) => selectedIds.includes(r.id)) ?? rooms.find((r) => r.roomType === 'cubicle-area') ?? rooms[0];

  const [source, setSource] = useState<'room' | 'custom'>(defaultRoom ? 'room' : 'custom');
  const [roomId, setRoomId] = useState(defaultRoom?.id ?? '');
  const [W, setW] = useState(144);
  const [L, setL] = useState(192);
  const [shape, setShape] = useState<'rectangle' | 'l-shape'>('rectangle');
  const [doorSide, setDoorSide] = useState<DoorSide>('top');
  const [doorOffset, setDoorOffset] = useState(54);
  const [employees, setEmployees] = useState(8);
  const [cw, setCw] = useState(48);
  const [cd, setCd] = useState(48);
  const [aisle, setAisle] = useState(settings.minAisleWidth);
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [arrangement, setArrangement] = useState<Arrangement>('auto');
  const [results, setResults] = useState<{ options: LayoutOption[]; room: Room; context: PlanObject[]; synthetic: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const pick = rooms.find((r) => selectedIds.includes(r.id)) ?? (rooms.find((r) => r.id === roomId) ? undefined : defaultRoom);
    if (pick) {
      setRoomId(pick.id);
      setSource('room');
    }
    setResults(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selRoom = rooms.find((r) => r.id === roomId);
  const selDims = selRoom ? bbox(selRoom.points) : null;

  const run = () => {
    setBusy(true);
    setChosen(null);
    setTimeout(() => {
      try {
        let room: Room;
        let context: PlanObject[];
        let synthetic = false;
        if (source === 'room' && selRoom) {
          room = selRoom;
          context = objects;
        } else {
          const b = bbox(objects.flatMap((o) => (o.kind === 'room' ? o.points : [])));
          const origin = { x: Number.isFinite(b.maxX) ? b.maxX + 120 : 0, y: Number.isFinite(b.minY) ? b.minY : 0 };
          const s = syntheticRoom({ width: W, length: L, shape, doorSide, doorOffset, doorWidth: 36, origin });
          room = s.room;
          context = s.context;
          synthetic = true;
        }
        const options = generateLayouts({ room, context, employees, cubicleWidth: cw, cubicleDepth: cd, minAisle: aisle, orientation, arrangement, settings, department: room.planning?.department });
        setResults({ options, room, context, synthetic });
      } finally {
        setBusy(false);
      }
    }, 10);
  };

  const apply = (opt: LayoutOption) => {
    if (!results) return;
    const ids = new Set<string>();
    const placed = opt.furniture.map((f) => ({ ...f, id: uid('f') }));
    if (results.synthetic) {
      const room = { ...results.room, id: uid('r'), name: `Study room ${formatLength(W, units)} × ${formatLength(L, units)}` };
      st().addObjects([room, ...results.context.map((o) => ({ ...o, id: uid(o.kind[0]) })), ...placed]);
    } else {
      // Replace existing workstations in the target room; keep everything else.
      st().setObjects((objs) => {
        objs.forEach((o) => {
          if (o.kind === 'furniture' && o.isWorkstation && roomAt(objs, { x: o.x, y: o.y })?.id === results.room.id) ids.add(o.id);
        });
        return [...objs.filter((o) => !ids.has(o.id)), ...placed];
      });
      st().select(placed.map((p) => p.id));
    }
    st().openDialog(null);
  };

  const previews = useMemo(() => {
    if (!results) return [];
    return results.options.map((o) => {
      const v = new Set(o.validation.conflictIds);
      const objs = [results.room, ...results.context.filter((c) => c.kind === 'wall' || c.kind === 'door' || (c.kind === 'furniture' && !c.isWorkstation)), ...o.furniture];
      const b = bbox(results.room.points);
      const nearby = objs.filter((x) => {
        if (x.kind === 'room') return x.id === results.room.id;
        const p = x.kind === 'wall' ? x.a : { x: (x as { x: number }).x, y: (x as { y: number }).y };
        return p.x > b.minX - 24 && p.x < b.maxX + 24 && p.y > b.minY - 24 && p.y < b.maxY + 24;
      });
      return renderSvg(nearby, settings, { view: 'presentation', showDimensions: false, showFurnitureLabels: false, showRoomAreas: false, showSeatCounts: false, showLegend: false, highlightIds: v, padding: 12, pxPerInch: 1, bounds: b }).svg;
    });
  }, [results, settings]);

  return (
    <Dialog open={open} onOpenChange={(o) => st().openDialog(o ? 'generate' : null)}>
      <DialogContent wide>
        <DialogHeader title="Generate Layout Options" description="Places workstations using real geometry, collision detection and your clearance settings — never area-per-seat estimates." />
        <DialogBody className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-300 text-xs">
              <button className={source === 'room' ? 'bg-navy py-1.5 text-white' : 'py-1.5'} onClick={() => setSource('room')} disabled={!rooms.length}>Existing room</button>
              <button className={source === 'custom' ? 'bg-navy py-1.5 text-white' : 'py-1.5'} onClick={() => setSource('custom')}>Custom dimensions</button>
            </div>
            {source === 'room' ? (
              <div className="space-y-1">
                <Label>Room</Label>
                <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </Select>
                {selDims && <p className="text-xs text-slate-500">Uses the drawn shape ({formatLength(selDims.width, units)} × {formatLength(selDims.height, units)} bounding box), its walls and existing doors.</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Width</Label><LengthInput value={W} units={units} min={24} onCommit={setW} /></div>
                <div><Label>Length</Label><LengthInput value={L} units={units} min={24} onCommit={setL} /></div>
                <div><Label>Shape</Label><Select value={shape} onChange={(e) => setShape(e.target.value as 'rectangle' | 'l-shape')}><option value="rectangle">Rectangle</option><option value="l-shape">L-shape</option></Select></div>
                <div><Label>Door wall</Label><Select value={doorSide} onChange={(e) => setDoorSide(e.target.value as DoorSide)}>{(['top', 'bottom', 'left', 'right'] as const).map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
                <div className="col-span-2"><Label>Door offset from wall start</Label><LengthInput value={doorOffset} units={units} onCommit={setDoorOffset} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Employees</Label><NumberInput value={employees} onCommit={(v) => setEmployees(Math.max(1, Math.round(v)))} /></div>
              <div><Label>Min aisle</Label><LengthInput value={aisle} units={units} min={12} onCommit={setAisle} /></div>
              <div><Label>Cubicle width</Label><LengthInput value={cw} units={units} min={24} onCommit={setCw} /></div>
              <div><Label>Cubicle depth</Label><LengthInput value={cd} units={units} min={24} onCommit={setCd} /></div>
              <div><Label>Desk orientation</Label><Select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}><option value="auto">Try both</option><option value="rows-along-length">Rows along length</option><option value="rows-along-width">Rows along width</option></Select></div>
              <div><Label>Arrangement</Label><Select value={arrangement} onChange={(e) => setArrangement(e.target.value as Arrangement)}><option value="auto">Any</option><option value="double-loaded">Rows facing a shared aisle</option><option value="single-loaded">Single rows</option></Select></div>
            </div>
            <Button className="w-full" onClick={run} disabled={busy || (source === 'room' && !selRoom)}>
              <Wand2 /> {busy ? 'Generating…' : 'Generate'}
            </Button>
            <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-800">
              Clearances are your planning inputs, not verified code minimums. Results are not ADA, fire/egress or building-code verified and need professional review.
            </p>
          </div>
          <div className="min-w-0">
            {!results ? (
              <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-400">Set the inputs and click Generate.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {results.options.map((o, i) => (
                  <div key={o.key} className={`flex flex-col rounded-lg border p-3 ${chosen === o.key ? 'border-teal ring-2 ring-teal/30' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-navy">{o.title}</div>
                        <div className="text-[11px] text-slate-500">{o.description}</div>
                      </div>
                      {o.metrics.targetMet ? <CheckCircle2 className="h-5 w-5 shrink-0 text-teal" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}
                    </div>
                    <div className="my-2 flex h-40 items-center justify-center overflow-hidden rounded bg-slate-50 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: previews[i] ?? '' }} />
                    <table className="text-xs">
                      <tbody>
                        <tr><td className="text-slate-500">Workstations</td><td className="text-right font-semibold">{o.metrics.workstations}</td></tr>
                        <tr><td className="text-slate-500">Seating capacity</td><td className={`text-right font-semibold ${o.metrics.targetMet ? 'text-teal-600' : 'text-amber-700'}`}>{o.metrics.seats} {o.metrics.targetMet ? '' : `(target ${employees})`}</td></tr>
                        <tr><td className="text-slate-500">Desk size</td><td className="text-right">{formatLength(o.metrics.deskWidth, units)} × {formatLength(o.metrics.deskDepth, units)}</td></tr>
                        <tr><td className="text-slate-500">Aisle width (design / measured min)</td><td className="text-right">{formatLength(o.metrics.aisleWidth, units)} / {o.metrics.minClearance === null ? '—' : formatLength(o.metrics.minClearance, units)}</td></tr>
                        <tr><td className="text-slate-500">Occupied / remaining</td><td className="text-right">{o.metrics.occupiedSqft.toFixed(0)} / {o.metrics.remainingSqft.toFixed(0)} sq ft</td></tr>
                        <tr><td className="text-slate-500">Clearance conflicts</td><td className={`text-right ${o.metrics.clearanceConflicts ? 'text-red-700' : ''}`}>{o.metrics.clearanceConflicts}</td></tr>
                        <tr><td className="text-slate-500">Door obstructions</td><td className={`text-right ${o.metrics.doorObstructions ? 'text-red-700' : ''}`}>{o.metrics.doorObstructions}</td></tr>
                      </tbody>
                    </table>
                    <details className="mt-1 text-[11px] text-slate-500">
                      <summary className="cursor-pointer">Assumptions ({o.assumptions.length})</summary>
                      <ul className="ml-4 list-disc">{o.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                    </details>
                    <div className="mt-auto flex gap-1 pt-2">
                      <Button size="xs" disabled={!o.furniture.length} onClick={() => apply(o)}>{results.synthetic ? 'Add to plan' : 'Apply to room'}</Button>
                      <Button size="xs" variant="outline" disabled={!o.furniture.length} onClick={() => { setChosen(o.key); st().duplicateScenario(`${activeScenario(usePlanStore.getState().project).name} — ${o.title.split('—')[1]?.trim() ?? o.key}`); apply(o); }}>
                        Apply as new layout
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <span className="mr-auto text-[11px] text-slate-500">“Apply to room” replaces the workstations currently in that room. Undo with Ctrl+Z.</span>
          <Button variant="outline" onClick={() => st().openDialog(null)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

