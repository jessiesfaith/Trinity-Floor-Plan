'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { usePlanStore } from '@/store/usePlanStore';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/input';
import { LengthInput } from '../LengthInput';
import { calibrate, importBackgroundFile } from '@/lib/pdfImport';
import { dist } from '@/lib/geometry';
import { formatLength } from '@/lib/units';

export function ImportDialog() {
  const open = usePlanStore((s) => s.dialog === 'import');
  const st = usePlanStore.getState;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const handle = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const bg = await importBackgroundFile(file);
      st().setBackground(bg);
      st().setLayer('background', { visible: true });
      st().openDialog(null);
      st().requestFit();
    } catch (e) {
      setErr(`Could not import this file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => st().openDialog(v ? 'import' : null)}>
      <DialogContent>
        <DialogHeader title="Import floor plan" description="PDF (any number of pages) or PNG/JPG. The file is kept unmodified as a lockable reference layer." />
        <DialogBody className="space-y-3 text-sm">
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center ${drag ? 'border-teal bg-teal-100/40' : 'border-slate-300'}`}
          >
            <Upload className="h-8 w-8 text-teal" />
            <span className="font-semibold text-navy">{busy ? 'Rendering…' : 'Drop a PDF or image here, or click to browse'}</span>
            <input type="file" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
          </label>
          {err && <p className="text-xs text-red-700">{err}</p>}
          <ol className="ml-4 list-decimal space-y-1 text-xs text-slate-600">
            <li>Import the architectural PDF. Its initial scale is a guess and it is marked <b>Not calibrated</b>.</li>
            <li>Use <b>Calibrate</b> (Layers tab) and click two ends of a dimension you know, then type the real length.</li>
            <li>Unlock the background to move/rotate/crop it; lock it again before tracing walls and rooms.</li>
          </ol>
          <p className="text-[11px] text-slate-500">PDF geometry is not interpreted — walls and rooms are traced as separate, editable objects. Dimensions are never treated as verified automatically.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => st().openDialog(null)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CalibrateDialog() {
  const open = usePlanStore((s) => s.dialog === 'calibrate');
  const pts = usePlanStore((s) => s.calibrationPoints);
  const bg = usePlanStore((s) => s.project.background);
  const units = usePlanStore((s) => s.project.settings.units);
  const st = usePlanStore.getState;
  const measured = pts ? dist(pts.a, pts.b) : 0;
  const [real, setReal] = useState(144);
  const close = () => {
    st().openDialog(null);
    st().setCalibrationPoints(null);
    st().setTool('select');
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader title="Calibrate imported plan" description="Scale the background so the two points you clicked match a known real-world distance." />
        <DialogBody className="space-y-3 text-sm">
          {!bg ? (
            <p>Import a floor plan first.</p>
          ) : (
            <>
              <p>Distance between the clicked points at the current scale: <b className="text-measure">{formatLength(measured, units)}</b></p>
              <div>
                <Label>Known real distance</Label>
                <LengthInput value={real} units={units} min={1} onCommit={setReal} />
              </div>
              <p className="text-xs text-slate-500">New scale factor ×{measured ? (real / measured).toFixed(4) : '—'}. The first point stays fixed. Calibration only scales the reference image; your drawn objects already use real units.</p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button
            disabled={!bg || !pts || measured <= 0}
            onClick={() => {
              if (!bg || !pts) return;
              const next = calibrate(bg, measured, real);
              const k = real / measured;
              // Keep the first clicked point fixed in plan space.
              st().setBackground({ ...next, x: pts.a.x + (bg.x - pts.a.x) * k, y: pts.a.y + (bg.y - pts.a.y) * k });
              close();
            }}
          >
            Apply calibration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
