import { describe, expect, it } from 'vitest';
import { createSampleProject } from '@/lib/sampleProject';
import { addChecklistItem, checklistOf, deleteChecklistItem, moveChecklistItem, updateChecklistItem } from '@/lib/checklist';
import { parseProject } from '@/lib/persistence';

describe('checklist', () => {
  it('adds, edits, ticks, reorders and deletes items', () => {
    let p = createSampleProject();
    expect(checklistOf(p)).toEqual([]);
    const a = addChecklistItem(p, 'Book movers');
    p = a.project;
    const b = addChecklistItem(p, 'Label boxes');
    p = b.project;
    const c = addChecklistItem(p, 'Order keys', a.id); // inserted after the first
    p = c.project;
    expect(checklistOf(p).map((x) => x.text)).toEqual(['Book movers', 'Order keys', 'Label boxes']);
    p = updateChecklistItem(p, b.id, { text: 'Label every box', done: true });
    expect(checklistOf(p)[2]).toMatchObject({ text: 'Label every box', done: true });
    p = moveChecklistItem(p, b.id, -1);
    expect(checklistOf(p).map((x) => x.text)).toEqual(['Book movers', 'Label every box', 'Order keys']);
    expect(moveChecklistItem(p, a.id, -1)).toBe(p); // already first
    p = deleteChecklistItem(p, a.id);
    expect(checklistOf(p).map((x) => x.text)).toEqual(['Label every box', 'Order keys']);
  });

  it('is kept when a saved plan is loaded again', () => {
    const p = addChecklistItem(createSampleProject(), 'Book movers').project;
    const back = parseProject(JSON.stringify(p));
    expect(back.checklist).toEqual(p.checklist);
  });
});
