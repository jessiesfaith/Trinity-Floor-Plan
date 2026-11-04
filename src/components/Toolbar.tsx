'use client';

import { useRef } from 'react';
import {
  Columns3, DoorOpen, Download, FileUp, FolderOpen, Grid3x3, Hand, LayoutGrid, Magnet, MousePointer2, MoveDiagonal, PenLine,
  Presentation, Redo2, Ruler, Save, Settings, Square, Type, Undo2, Wand2, RectangleHorizontal, FilePlus2,
} from 'lucide-react';
import { usePlanStore, type Tool } from '@/store/usePlanStore';
import { Button } from './ui/button';
import { parseProject, ProjectParseError } from '@/lib/persistence';
import { createBlankProject, createSampleProject } from '@/lib/sampleProject';

const TOOLS: { tool: Tool; icon: typeof Hand; label: string; key: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', key: 'V' },
  { tool: 'pan', icon: Hand, label: 'Pan', key: 'H' },
  { tool: 'measure', icon: Ruler, label: 'Measure', key: 'M' },
  { tool: 'wall', icon: PenLine, label: 'Wall', key: 'W' },
  { tool: 'room', icon: Square, label: 'Room', key: 'R' },
  { tool: 'door', icon: DoorOpen, label: 'Door', key: 'D' },
  { tool: 'aisle', icon: RectangleHorizontal, label: 'Aisle', key: 'A' },
  { tool: 'label', icon: Type, label: 'Text', key: 'T' },
  { tool: 'dimension', icon: MoveDiagonal, label: 'Dimension', key: 'L' },
];

export default function Toolbar({ onSave }: { onSave: () => void }) {
  const tool = usePlanStore((s) => s.tool);
  const view = usePlanStore((s) => s.view);
  const canUndo = usePlanStore((s) => s.past.length > 0);
  const canRedo = usePlanStore((s) => s.future.length > 0);
  const dirty = usePlanStore((s) => s.dirty);
  const savedAt = usePlanStore((s) => s.savedAt);
  const settings = usePlanStore((s) => s.project.settings);
  const name = usePlanStore((s) => s.project.name);
  const st = usePlanStore.getState;
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 bg-navy px-2 text-white">
      <div className="mr-2 flex items-center gap-2 pr-2">
        <LayoutGrid className="h-5 w-5 text-teal" />
        <input
          className="w-36 truncate rounded bg-transparent px-1 text-sm font-semibold outline-none hover:bg-white/10 focus:bg-white/10"
          value={name}
          aria-label="Project name"
          onChange={(e) => st().commit((p) => ({ ...p, name: e.target.value }), 'project-name')}
        />
      </div>
      <Button variant="toolbar" size="sm" onClick={() => st().openDialog('import')} title="Import PDF floor plan or image">
        <FileUp /> <span className="hidden 2xl:inline">Import PDF</span><span className="2xl:hidden">Import</span>
      </Button>
      <Button variant="toolbar" size="sm" onClick={onSave} title="Save (Ctrl+S)">
        <Save /> Save{dirty ? '*' : ''}
      </Button>
      <Button variant="toolbar" size="sm" onClick={() => fileRef.current?.click()} title="Open a project .json file">
        <FolderOpen /> <span className="hidden 2xl:inline">Open</span>
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            st().loadProject(parseProject(await f.text()));
          } catch (err) {
            alert(err instanceof ProjectParseError ? err.message : 'Could not open that file.');
          }
        }}
      />
      <Button
        variant="toolbar"
        size="icon"
        title="New project"
        onClick={() => {
          const c = prompt('Start a new project?\nType "sample" for the sample office, or "blank" for an empty plan.', 'blank');
          if (c === 'sample') st().loadProject(createSampleProject());
          else if (c === 'blank') st().loadProject(createBlankProject());
        }}
      >
        <FilePlus2 />
      </Button>
      <div className="mx-1 h-6 w-px bg-white/20" />
      <Button variant="toolbar" size="icon" disabled={!canUndo} onClick={() => st().undo()} title="Undo (Ctrl+Z)">
        <Undo2 />
      </Button>
      <Button variant="toolbar" size="icon" disabled={!canRedo} onClick={() => st().redo()} title="Redo (Ctrl+Shift+Z / Ctrl+Y)">
        <Redo2 />
      </Button>
      <div className="mx-1 h-6 w-px bg-white/20" />
      {TOOLS.map((t) => (
        <Button key={t.tool} variant="toolbar" size="icon" data-active={tool === t.tool} onClick={() => st().setTool(t.tool)} title={`${t.label} (${t.key})`} aria-label={t.label}>
          <t.icon />
        </Button>
      ))}
      <div className="mx-1 h-6 w-px bg-white/20" />
      <Button variant="toolbar" size="icon" data-active={settings.snapToGrid} onClick={() => st().setSettings({ snapToGrid: !settings.snapToGrid })} title="Toggle grid snapping">
        <Magnet />
      </Button>
      <Button variant="toolbar" size="icon" data-active={settings.showGrid} onClick={() => st().setSettings({ showGrid: !settings.showGrid })} title="Toggle grid">
        <Grid3x3 />
      </Button>
      <Button variant="toolbar" size="icon" data-active={settings.showGuides} onClick={() => st().setSettings({ showGuides: !settings.showGuides })} title="Show / hide measurement guides">
        <Ruler />
      </Button>
      <div className="flex-1" />
      <div className="mr-2 flex shrink-0 overflow-hidden whitespace-nowrap rounded-md border border-white/20 text-xs">
        <button className={`flex items-center gap-1 px-2 py-1 ${view === '2d' ? 'bg-teal' : 'hover:bg-white/10'}`} onClick={() => st().setView('2d')}>
          <Grid3x3 className="h-3.5 w-3.5" /> 2D Plan
        </button>
        <button className={`flex items-center gap-1 px-2 py-1 ${view === 'presentation' ? 'bg-teal' : 'hover:bg-white/10'}`} onClick={() => st().setView('presentation')}>
          <Presentation className="h-3.5 w-3.5" /> Presentation
        </button>
      </div>
      <Button variant="default" size="sm" onClick={() => st().openDialog('generate')}>
        <Wand2 /> Generate Layout
      </Button>
      <Button variant="toolbar" size="sm" onClick={() => st().openDialog('compare')}>
        <Columns3 /> Compare
      </Button>
      <Button variant="toolbar" size="sm" onClick={() => st().openDialog('export')}>
        <Download /> Export
      </Button>
      <Button variant="toolbar" size="icon" onClick={() => st().openDialog('settings')} title="Settings">
        <Settings />
      </Button>
      <span className="ml-1 hidden w-24 text-right text-[10px] text-slate-300 xl:block">{savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Not saved yet'}</span>
    </header>
  );
}
