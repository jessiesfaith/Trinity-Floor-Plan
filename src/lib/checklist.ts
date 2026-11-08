// The Checklist tab: a plain list of editable items saved with the project.

import type { ChecklistItem, Project } from '@/types/plan';
import { uid } from './objects';

export const checklistOf = (p: Project): ChecklistItem[] => p.checklist ?? [];

const withList = (p: Project, list: ChecklistItem[]): Project => ({ ...p, checklist: list });

/** Add an item (at the end, or right after `afterId`). Returns the project and the new item's id. */
export function addChecklistItem(p: Project, text = '', afterId?: string): { project: Project; id: string } {
  const item: ChecklistItem = { id: uid('chk'), text, done: false };
  const list = [...checklistOf(p)];
  const at = afterId ? list.findIndex((x) => x.id === afterId) : -1;
  if (at >= 0) list.splice(at + 1, 0, item);
  else list.push(item);
  return { project: withList(p, list), id: item.id };
}

export const updateChecklistItem = (p: Project, id: string, patch: Partial<Omit<ChecklistItem, 'id'>>): Project =>
  withList(p, checklistOf(p).map((x) => (x.id === id ? { ...x, ...patch } : x)));

export const deleteChecklistItem = (p: Project, id: string): Project => withList(p, checklistOf(p).filter((x) => x.id !== id));

/** Move an item one place up (-1) or down (+1). */
export function moveChecklistItem(p: Project, id: string, by: -1 | 1): Project {
  const list = [...checklistOf(p)];
  const i = list.findIndex((x) => x.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return p;
  [list[i], list[j]] = [list[j], list[i]];
  return withList(p, list);
}
