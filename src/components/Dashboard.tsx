'use client';

import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { CapacitySummary } from '@/lib/capacity';
import type { ValidationResult } from '@/lib/validation';
import { usePlanStore } from '@/store/usePlanStore';
import { formatLength } from '@/lib/units';

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'bad' | 'good' | 'warn' }) {
  const c = tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-teal-600' : tone === 'warn' ? 'text-amber-700' : 'text-navy';
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

export function CapacityDashboard({ cap }: { cap: CapacitySummary }) {
  const units = usePlanStore((s) => s.project.settings.units);
  const minAisle = usePlanStore((s) => s.project.settings.minAisleWidth);
  const areas = cap.cubicleAreas;
  const A = areas[0];
  const B = areas[1];
  const plannedRows: [string, string, string][] = [
    ['Cubicle Area A', A?.plannedAreaSqft ? `${A.plannedAreaSqft} sq ft` : '—', A ? `${A.areaSqft.toFixed(0)} sq ft` : '—'],
    ['Cubicle Area B', B?.plannedAreaSqft ? `${B.plannedAreaSqft} sq ft` : '—', B ? `${B.areaSqft.toFixed(0)} sq ft` : '—'],
    ['Combined Area', A?.plannedAreaSqft && B?.plannedAreaSqft ? `${A.plannedAreaSqft + B.plannedAreaSqft} sq ft` : '—', A && B ? `${(A.areaSqft + B.areaSqft).toFixed(0)} sq ft` : '—'],
    ['Target Area A', A?.targetMin ? `${A.targetMin}–${A.targetMax} people` : '—', A ? `${A.feasibleSeats} feasible seats` : '—'],
    ['Target Area B', B?.targetMin ? `${B.targetMin}–${B.targetMax} people` : '—', B ? `${B.feasibleSeats} feasible seats` : '—'],
    ['Combined Target', A?.targetMin && B?.targetMin ? `${A.targetMin + B.targetMin}–${(A.targetMax ?? 0) + (B.targetMax ?? 0)} people` : '—', A && B ? `${A.feasibleSeats + B.feasibleSeats} feasible seats` : '—'],
    ['Standard Cubicle', '4 × 4 ft', ''],
  ];
  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Workstations" value={cap.totalWorkstations} />
        <Stat label="Seats (feasible)" value={`${cap.totalSeats} (${cap.feasibleSeats})`} tone={cap.feasibleSeats < cap.totalSeats ? 'bad' : undefined} />
        <Stat label="Assigned" value={cap.assigned} tone="good" />
        <Stat label="Unassigned" value={cap.unassigned} />
        <Stat label="Occupied" value={`${cap.occupiedSqft.toFixed(0)} sf`} />
        <Stat label="Remaining" value={`${cap.remainingSqft.toFixed(0)} sf`} />
        <Stat
          label="Min aisle (measured)"
          value={cap.minAisleMeasured === null ? '—' : formatLength(cap.minAisleMeasured, units)}
          tone={cap.minAisleMeasured !== null && cap.minAisleMeasured < minAisle ? 'bad' : 'good'}
        />
        <Stat label="Conflicts" value={cap.conflicts} tone={cap.conflicts ? 'bad' : 'good'} />
      </div>

      <div>
        <div className="panel-title">Planning inputs vs. current geometry</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-slate-500">
              <th className="py-1">Metric</th>
              <th>Initial planning value</th>
              <th>Current layout</th>
            </tr>
          </thead>
          <tbody>
            {plannedRows.map(([m, a, b]) => (
              <tr key={m} className="border-t border-slate-100">
                <td className="py-1 font-medium">{m}</td>
                <td className="text-slate-600">{a}</td>
                <td className="font-semibold text-navy">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-slate-500">Targets are goals, not verified capacities. “Feasible” seats exclude any workstation with a blocking conflict.</p>
      </div>

      <div>
        <div className="panel-title">By area</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-slate-500">
              <th className="py-1">Room</th>
              <th className="text-right">Seats</th>
              <th className="text-right">Target</th>
              <th className="text-right">Free sf</th>
              <th className="text-right">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {cap.rooms
              .filter((r) => r.workstations || r.roomType === 'cubicle-area' || r.targetMin)
              .map((r) => {
                const met = r.targetMin ? r.feasibleSeats >= r.targetMin : true;
                return (
                  <tr key={r.roomId} className="border-t border-slate-100">
                    <td className="py-1">{r.name.split('—')[0]}</td>
                    <td className="text-right tabular-nums">{r.feasibleSeats}/{r.seats}</td>
                    <td className={`text-right ${met ? '' : 'font-semibold text-red-700'}`}>{r.targetMin ? `${r.targetMin}–${r.targetMax}` : '—'}</td>
                    <td className="text-right tabular-nums">{r.remainingSqft.toFixed(0)}</td>
                    <td className={`text-right ${r.conflicts ? 'font-semibold text-red-700' : ''}`}>{r.conflicts}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {Object.keys(cap.workstationTypes).length > 0 && (
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-navy">Workstation types: </span>
          {Object.entries(cap.workstationTypes)
            .map(([k, v]) => `${k} × ${v}`)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}

export function WarningsList({ v }: { v: ValidationResult }) {
  const select = usePlanStore((s) => s.select);
  const order = { error: 0, warning: 1, info: 2 } as const;
  const issues = [...v.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="space-y-1.5 p-3">
      {v.errorCount === 0 && (
        <div className="flex items-center gap-2 rounded border border-teal-100 bg-teal-100/50 px-2 py-1.5 text-xs text-teal-600">
          <CheckCircle2 className="h-4 w-4" /> No blocking conflicts with the current clearance settings.
        </div>
      )}
      {issues.map((i) => (
        <button
          key={i.id}
          onClick={() => i.objectIds.length && select(i.objectIds.slice(0, 1))}
          className={`flex w-full items-start gap-2 rounded border px-2 py-1.5 text-left text-xs ${
            i.severity === 'error' ? 'border-red-200 bg-red-50 text-red-800' : i.severity === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {i.severity === 'info' ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{i.message}</span>
        </button>
      ))}
    </div>
  );
}
