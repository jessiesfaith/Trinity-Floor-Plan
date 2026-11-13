'use client';

import { useState } from 'react';
import { FileImage, FileJson, FileText, Printer, FileCode2 } from 'lucide-react';
import { usePlanStore } from '@/store/usePlanStore';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label, Select, Switch } from '../ui/input';
import { canPrintToScale, DEFAULT_EXPORT, exportPdf, exportPdfLayouts, exportPng, exportSvg, type ExportOptions } from '@/lib/exporters';
import { oldOfficeLayoutOf } from '@/lib/oldOfficeLayout';
import { floorPlanLayoutOf } from '@/lib/wallsLayout';
import { downloadBlob, safeFileName, serializeProject } from '@/lib/persistence';

export default function ExportDialog() {
  const open = usePlanStore((s) => s.dialog === 'export');
  const project = usePlanStore((s) => s.project);
  const view = usePlanStore((s) => s.view);
  const st = usePlanStore.getState;
  const [o, setO] = useState<ExportOptions>({ ...DEFAULT_EXPORT });
  const [busy, setBusy] = useState<string | null>(null);
  const [includeBgJson, setIncludeBgJson] = useState(true);
  const scaleOk = canPrintToScale(project);
  const set = (p: Partial<ExportOptions>) => setO((x) => ({ ...x, ...p }));
  const run = async (key: string, fn: () => Promise<void> | void) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      alert(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const opts = { ...o, view: o.view ?? view };
  // Floor plan + Old office in one PDF, when the project has an Old office tab.
  const oldOffice = oldOfficeLayoutOf(project);
  const both = oldOffice ? [floorPlanLayoutOf(project).id, oldOffice.id] : null;
  return (
    <Dialog open={open} onOpenChange={(v) => st().openDialog(v ? 'export' : null)}>
      <DialogContent>
        <DialogHeader title="Export, save & print" description="All exports are generated from the editable layout data of the active layout." />
        <DialogBody className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>View</Label>
              <Select value={o.view} onChange={(e) => set({ view: e.target.value as ExportOptions['view'] })}>
                <option value="2d">2D architectural</option>
                <option value="presentation">Presentation</option>
              </Select>
            </div>
            <div>
              <Label>PDF scale</Label>
              <Select value={o.printScale ?? ''} disabled={!scaleOk.ok} onChange={(e) => set({ printScale: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Fit to page (not to scale)</option>
                <option value="0.125">1/8&quot; = 1&apos;-0&quot;</option>
                <option value="0.1875">3/16&quot; = 1&apos;-0&quot;</option>
                <option value="0.25">1/4&quot; = 1&apos;-0&quot;</option>
                <option value="0.5">1/2&quot; = 1&apos;-0&quot;</option>
              </Select>
              {!scaleOk.ok && <p className="mt-0.5 text-[11px] text-amber-700">{scaleOk.reason}</p>}
            </div>
          </div>
          <div className="rounded border border-slate-200 p-2">
            <Switch checked={o.showDimensions} label="Room dimensions" onChange={(v) => set({ showDimensions: v })} />
            <Switch checked={o.showFurnitureLabels} label="Furniture labels & assignments" onChange={(v) => set({ showFurnitureLabels: v })} />
            <Switch checked={o.showSeatCounts} label="Seating counts" onChange={(v) => set({ showSeatCounts: v })} />
            <Switch checked={o.showRoomAreas} label="Area calculations" onChange={(v) => set({ showRoomAreas: v })} />
            <Switch checked={o.showLegend} label="Legend" onChange={(v) => set({ showLegend: v })} />
            <Switch checked={o.showInventory} label="Furniture inventory" onChange={(v) => set({ showInventory: v })} />
            <Switch checked={o.showVersionAndDate} label="Layout version & date" onChange={(v) => set({ showVersionAndDate: v })} />
            <Switch checked={o.includeBackground} disabled={!project.background} label="Include imported floor plan underlay" onChange={(v) => set({ includeBackground: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!!busy} onClick={() => run('pdf', () => exportPdf(project, opts))}><FileText /> {busy === 'pdf' ? 'Building…' : 'PDF'}</Button>
            <Button disabled={!!busy} variant="navy" onClick={() => run('print', () => exportPdf(project, opts, 'print'))}><Printer /> Print</Button>
            <Button disabled={!!busy} variant="outline" onClick={() => run('png', () => exportPng(project, opts))}><FileImage /> High-res PNG</Button>
            <Button disabled={!!busy} variant="outline" onClick={() => run('svg', () => exportSvg(project, opts))}><FileCode2 /> SVG</Button>
          </div>
          {both && (
            <div className="rounded border border-slate-200 p-2">
              <div className="mb-1 font-semibold text-navy">Floor plan + Old office</div>
              <p className="mb-1.5 text-[11px] text-slate-500">Both plans in one PDF, each followed by its area &amp; capacity page.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={!!busy} onClick={() => run('pdf2', () => exportPdfLayouts(project, opts, both))}><FileText /> {busy === 'pdf2' ? 'Building…' : 'PDF (both)'}</Button>
                <Button disabled={!!busy} variant="navy" onClick={() => run('print2', () => exportPdfLayouts(project, opts, both, 'print'))}><Printer /> {busy === 'print2' ? 'Building…' : 'Print both'}</Button>
              </div>
            </div>
          )}
          <div className="rounded border border-slate-200 p-2">
            <div className="mb-1 font-semibold text-navy">Editable project file</div>
            <Switch checked={includeBgJson} label="Embed imported PDF / image" onChange={setIncludeBgJson} />
            <Button
              size="sm"
              variant="outline"
              className="mt-1 w-full"
              onClick={() => downloadBlob(new Blob([serializeProject(project, { includeBackground: includeBgJson })], { type: 'application/json' }), `${safeFileName(project.name)}.floorplan.json`)}
            >
              <FileJson /> Download project (.json) — all layouts, layers & measurements
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => st().openDialog(null)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
