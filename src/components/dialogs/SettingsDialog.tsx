'use client';

import { usePlanStore } from '@/store/usePlanStore';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label, Select, Switch } from '../ui/input';
import { LengthInput } from '../LengthInput';
import type { DisplayUnits } from '@/types/plan';
import { DEFAULT_SETTINGS } from '@/lib/sampleProject';

export default function SettingsDialog() {
  const open = usePlanStore((s) => s.dialog === 'settings');
  const s = usePlanStore((x) => x.project.settings);
  const st = usePlanStore.getState;
  const set = st().setSettings;
  return (
    <Dialog open={open} onOpenChange={(v) => st().openDialog(v ? 'settings' : null)}>
      <DialogContent>
        <DialogHeader title="Settings" description="Units, grid and clearance thresholds used by validation and the layout generator." />
        <DialogBody className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Display units</Label>
              <Select value={s.units} onChange={(e) => set({ units: e.target.value as DisplayUnits })}>
                <option value="ft-in">Feet & inches</option>
                <option value="ft-decimal">Decimal feet</option>
                <option value="metric">Metric</option>
              </Select>
            </div>
            <div>
              <Label>Grid size</Label>
              <LengthInput value={s.gridSize} units={s.units} min={0.5} onCommit={(v) => set({ gridSize: v })} />
            </div>
          </div>
          <div>
            <Switch checked={s.snapToGrid} label="Snap to grid" onChange={(v) => set({ snapToGrid: v })} />
            <Switch checked={s.showGrid} label="Show grid" onChange={(v) => set({ showGrid: v })} />
            <Switch checked={s.showGuides} label="Show measurement guides" onChange={(v) => set({ showGuides: v })} />
          </div>
          <div>
            <div className="panel-title">Clearance thresholds</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Minimum aisle width</Label><LengthInput value={s.minAisleWidth} units={s.units} min={12} onCommit={(v) => set({ minAisleWidth: v })} /></div>
              <div><Label>Chair clearance</Label><LengthInput value={s.chairClearance} units={s.units} min={12} onCommit={(v) => set({ chairClearance: v })} /></div>
              <div><Label>Path width to door</Label><LengthInput value={s.doorClearance} units={s.units} min={12} onCommit={(v) => set({ doorClearance: v })} /></div>
              <div><Label>Wall install gap</Label><LengthInput value={s.wallTolerance} units={s.units} min={0} onCommit={(v) => set({ wallTolerance: v })} /></div>
            </div>
            <p className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-800">
              These are planning assumptions you control. Commonly cited figures (e.g. 36″ accessible routes, 44″ corridors) vary by jurisdiction and occupancy; this tool does not verify ADA, fire/egress or building-code compliance.
            </p>
            <Button size="xs" variant="ghost" className="mt-1" onClick={() => set({ minAisleWidth: DEFAULT_SETTINGS.minAisleWidth, chairClearance: DEFAULT_SETTINGS.chairClearance, doorClearance: DEFAULT_SETTINGS.doorClearance, wallTolerance: DEFAULT_SETTINGS.wallTolerance })}>
              Reset clearances to defaults
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => st().openDialog(null)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
