'use client';

import { useMemo } from 'react';
import { usePlanStore } from '@/store/usePlanStore';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../ui/dialog';
import { Button } from '../ui/button';
import { validate } from '@/lib/validation';
import { computeCapacity } from '@/lib/capacity';
import { renderSvg } from '@/lib/svgRender';
import { formatLength } from '@/lib/units';

export default function CompareDialog() {
  const open = usePlanStore((s) => s.dialog === 'compare');
  const project = usePlanStore((s) => s.project);
  const st = usePlanStore.getState;

  const rows = useMemo(() => {
    if (!open) return [];
    return project.scenarios.map((s) => {
      const v = validate(s.objects, project.settings, { background: project.background });
      const c = computeCapacity(s.objects, v);
      const svg = renderSvg(s.objects, project.settings, {
        view: 'presentation', showDimensions: false, showFurnitureLabels: false, showRoomAreas: false, showSeatCounts: true, showLegend: false, highlightIds: v.conflictIds, padding: 12, pxPerInch: 0.5,
      }).svg;
      return { s, v, c, svg };
    });
  }, [open, project]);

  const A = (r: (typeof rows)[number], i: number) => r.c.cubicleAreas[i];
  const metrics: [string, (r: (typeof rows)[number]) => string | number][] = [
    ['Total workstations', (r) => r.c.totalWorkstations],
    ['Seating capacity', (r) => r.c.totalSeats],
    ['Feasible seats (no conflicts)', (r) => r.c.feasibleSeats],
    ['Area A seats', (r) => A(r, 0)?.feasibleSeats ?? '—'],
    ['Area B seats', (r) => A(r, 1)?.feasibleSeats ?? '—'],
    ['Circulation / free space (sq ft)', (r) => r.c.remainingSqft.toFixed(0)],
    ['Occupied (sq ft)', (r) => r.c.occupiedSqft.toFixed(0)],
    ['Min measured aisle', (r) => (r.c.minAisleMeasured === null ? '—' : formatLength(r.c.minAisleMeasured, project.settings.units))],
    ['Workstation types', (r) => Object.entries(r.c.workstationTypes).map(([k, v]) => `${k} ×${v}`).join(', ') || '—'],
    ['Assigned / unassigned', (r) => `${r.c.assigned} / ${r.c.unassigned}`],
    ['Blocking conflicts', (r) => r.v.errorCount],
    ['Warnings', (r) => r.v.warningCount],
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => st().openDialog(o ? 'compare' : null)}>
      <DialogContent wide className="max-w-[1400px]">
        <DialogHeader title="Compare Scenarios" description="Side-by-side comparison computed from each layout's geometry. Each layout is independent." />
        <DialogBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-48" />
                  {rows.map((r) => (
                    <th key={r.s.id} className="p-1 align-top">
                      <button className={`w-full rounded-md border p-1 text-left ${r.s.id === project.activeScenarioId ? 'border-teal' : 'border-slate-200'}`} onClick={() => { st().switchScenario(r.s.id); st().openDialog(null); }} title="Open this layout">
                        <div className="h-28 overflow-hidden rounded bg-slate-50 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: r.svg }} />
                        <div className="mt-1 font-semibold text-navy">{r.s.name}</div>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map(([label, fn]) => (
                  <tr key={label} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 font-medium text-slate-600">{label}</td>
                    {rows.map((r) => {
                      const v = fn(r);
                      const bad = label === 'Blocking conflicts' && Number(v) > 0;
                      return <td key={r.s.id} className={`px-2 text-center tabular-nums ${bad ? 'font-bold text-red-700' : 'text-navy'}`}>{v}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogBody>
        <DialogFooter>
          <span className="mr-auto text-[11px] text-slate-500">Click a layout thumbnail to open it.</span>
          <Button variant="outline" onClick={() => st().openDialog(null)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
