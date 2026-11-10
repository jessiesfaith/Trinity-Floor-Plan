'use client';

// The Checklist tab: edit each item's text, tick it off, add, delete and reorder items.
// Items are saved with the plan (autosave, Save, Export) and every change can be undone.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Plus, Printer, Trash2 } from 'lucide-react';
import { usePlanStore } from '@/store/usePlanStore';
import type { ChecklistItem } from '@/types/plan';
import { addChecklistItem, deleteChecklistItem, moveChecklistItem, updateChecklistItem } from '@/lib/checklist';

const st = usePlanStore.getState;
const NONE: ChecklistItem[] = [];

export function ChecklistView() {
  const stored = usePlanStore((s) => s.project.checklist);
  const list = stored ?? NONE;
  const [draft, setDraft] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());

  useEffect(() => {
    if (!focusId) return;
    const el = refs.current.get(focusId);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      setFocusId(null);
    }
  }, [focusId, list]);

  const add = (text: string, afterId?: string) => {
    let id = '';
    st().commit((p) => {
      const r = addChecklistItem(p, text, afterId);
      id = r.id;
      return r.project;
    });
    return id;
  };
  const done = list.filter((x) => x.done).length;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-navy">Checklist</h2>
          <span className="flex items-center gap-3 text-xs text-slate-500">
            {list.length ? `${done} of ${list.length} done` : 'No items yet'}
            <button
              className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-navy hover:bg-slate-100 disabled:opacity-40"
              disabled={!list.length}
              title="Print the checklist"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </span>
        </div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
          {list.map((x, i) => (
            <li key={x.id} className="group flex items-start gap-2 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-teal-600"
                checked={x.done}
                aria-label={`Done: ${x.text || 'item'}`}
                onChange={(e) => st().commit((p) => updateChecklistItem(p, x.id, { done: e.target.checked }))}
              />
              <textarea
                ref={(el) => {
                  if (el) refs.current.set(x.id, el);
                  else refs.current.delete(x.id);
                }}
                rows={1}
                value={x.text}
                placeholder="Type an item"
                aria-label="Item text"
                className={`min-h-[1.5rem] flex-1 resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-slate-200 focus:border-teal-500 ${x.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                style={{ fieldSizing: 'content' } as React.CSSProperties}
                onChange={(e) => st().commit((p) => updateChecklistItem(p, x.id, { text: e.target.value }), `checklist:${x.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    setFocusId(add('', x.id));
                  } else if (e.key === 'Backspace' && !x.text) {
                    e.preventDefault();
                    const prev = list[i - 1]?.id ?? list[i + 1]?.id ?? null;
                    st().commit((p) => deleteChecklistItem(p, x.id));
                    setFocusId(prev);
                  }
                }}
              />
              <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100">
                <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-navy disabled:opacity-30" title="Move up" disabled={i === 0} onClick={() => st().commit((p) => moveChecklistItem(p, x.id, -1))}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-navy disabled:opacity-30" title="Move down" disabled={i === list.length - 1} onClick={() => st().commit((p) => moveChecklistItem(p, x.id, 1))}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete item" aria-label={`Delete ${x.text || 'item'}`} onClick={() => st().commit((p) => deleteChecklistItem(p, x.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
          <li className="flex items-center gap-2 px-3 py-2">
            <Plus className="h-4 w-4 shrink-0 text-teal-600" />
            <input
              value={draft}
              placeholder="Add an item and press Enter"
              aria-label="New item"
              className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-teal-500"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  add(draft.trim());
                  setDraft('');
                }
              }}
            />
            <button
              className="rounded bg-teal-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
              disabled={!draft.trim()}
              onClick={() => {
                add(draft.trim());
                setDraft('');
              }}
            >
              Add
            </button>
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-slate-500">
          Click any item to edit its text. Enter adds a new item below; Backspace on an empty item deletes it. The checklist is saved with the plan; the toolbar's Undo takes back a change.
        </p>
      </div>
      {mounted && createPortal(<ChecklistPrint list={list} done={done} />, document.body)}
    </div>
  );
}

/** Printer-friendly copy of the checklist; only shown when printing (see globals.css). */
function ChecklistPrint({ list, done }: { list: ChecklistItem[]; done: number }) {
  const name = usePlanStore((s) => s.project.name);
  return (
    <div className="checklist-print">
      <h1>{name ? `${name} – Checklist` : 'Checklist'}</h1>
      <p className="meta">
        {done} of {list.length} done · Printed {new Date().toLocaleDateString()}
      </p>
      <ol>
        {list.map((x) => (
          <li key={x.id} className={x.done ? 'done' : undefined}>
            <span className="box">{x.done ? '✓' : ''}</span>
            <span className="text">{x.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
