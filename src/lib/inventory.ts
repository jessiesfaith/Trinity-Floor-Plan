// The office's current furniture inventory, shown as a legend on the plan and in exports.

import type { InventoryItem, Project } from '@/types/plan';
import { uid } from './objects';

export const TRINITY_ADDRESS = '2350 Mission College Blvd Suite 330';

type Row = [area: string, item: string, qty: number | null, size: string];

/** Inventory as listed by the office (Nov 2026). Sizes are W x D (x H). */
const TRINITY_ITEMS: Row[] = [
  ['Cubicles', 'Long cubicle walls', 29, "4' wide"],
  ['Cubicles', 'Short cubicle walls', 13, "2' wide"],
  ['Cubicles', 'Short desks', 13, "2' x 2'"],
  ['Cubicles', 'Long desks', 8, "4' x 2'"],
  ['Cubicles', 'Corner desks', 8, "L: 2' x 4' + 4' x 2', 4' corner"],
  ['Cubicles', 'Hanging shelves (in cubicles)', 8, "4' x 2'"],
  ['Cubicles', 'Small file cabinets', 8, ''],
  ['Cubicles', 'Long file cabinets', 8, ''],
  ['Offices', 'Small file cabinets', 2, ''],
  ['Offices', 'Tall file cabinets', 2, ''],
  ['Printer area', 'Tall file cabinets', 3, ''],
  ['IT room', 'Bookshelf', 1, '34½" x 13½" x 66" H'],
  ['IT room', 'Server rack', 1, "7' H"],
  ['IT room', 'Metal racks', 2, '30" x 14" x 62" H'],
  ['Kitchen', 'Round table', 1, "4' diameter"],
  ['Kitchen', 'Chairs', 4, ''],
  ['Kitchen', 'Refrigerator', 1, '33½" x 30" x 67" H'],
  ['Kitchen', 'Cabinet', 1, ''],
  ['Conference room', 'Table', 1, "7' x 14'"],
  ['Conference room', 'Chairs', 11, ''],
  ['Building', 'Dedicated tenant HVAC', 1, ''],
];

/** The first default list (commit 23e01b9), so unedited saved copies can be brought up to date. */
export const FIRST_ITEMS: Row[] = [
  ['Cubicles', 'Long cubicle walls', 29, "4' wide"],
  ['Cubicles', 'Short cubicle walls', 13, "2' wide"],
  ['Cubicles', 'Short desks', 13, "2' x 2'"],
  ['Cubicles', 'Long desks', 8, "4' x 2'"],
  ['Cubicles', 'Corner desks', 8, "L: 2' x 4' + 4' x 2', 4' corner"],
  ['Cubicles', 'Hanging shelves (in cubicles)', 8, "4' x 2'"],
  ['File cabinets (under desks)', 'Small file cabinets', 10, ''],
  ['File cabinets (under desks)', 'Long file cabinets', 8, ''],
  ['File cabinets (under desks)', 'Tall file cabinets', 5, ''],
  ["Josh's office", 'To be confirmed', null, ''],
  ['Printer area', 'To be confirmed', null, ''],
  ['IT room', 'Bookshelf', 1, '34½" x 13½" x 66" H'],
  ['IT room', 'Server rack', 1, "7' H"],
  ['IT room', 'Metal racks', 2, '30" x 14" x 62" H'],
  ['Kitchen', 'Round table', 1, "4' diameter"],
  ['Kitchen', 'Chairs', 4, ''],
  ['Kitchen', 'Refrigerator', 1, '33½" x 30" x 67" H'],
  ['Kitchen', 'Cabinet', 1, ''],
  ['Conference room', 'Table', 1, "7' x 14'"],
  ['Conference room', 'Chairs', 11, ''],
  ['Building', 'Dedicated tenant HVAC units', 4, 'shown on the plan'],
];
const PREVIOUS_ITEMS: Row[][] = [FIRST_ITEMS];
const PREVIOUS_ADDRESSES = ['2350 Mission College Blvd, Suite 330'];

const rowsKey = (rows: Row[]) => JSON.stringify(rows);
const itemsKey = (items: InventoryItem[]) => rowsKey(items.map((x) => [x.area, x.item, x.qty, x.size]));

const fromRows = (rows: Row[]): InventoryItem[] => rows.map(([area, item, qty, size]) => ({ id: uid('inv'), area, item, qty, size }));

export function trinityInventory(): InventoryItem[] {
  return fromRows(TRINITY_ITEMS);
}

/** Items of an earlier default list (for tests). */
export function firstInventory(): InventoryItem[] {
  return fromRows(FIRST_ITEMS);
}

/**
 * Bring a saved inventory and header up to the current defaults when they were never edited
 * (they still match an earlier default exactly). Edited ones are kept as they are.
 */
export function upgradeInventory(inventory: InventoryItem[] | undefined, address: string | undefined) {
  const oldKeys = new Set(PREVIOUS_ITEMS.map(rowsKey));
  return {
    inventory: inventory && oldKeys.has(itemsKey(inventory)) ? trinityInventory() : inventory,
    address: address && PREVIOUS_ADDRESSES.includes(address) ? TRINITY_ADDRESS : address,
  };
}

export function blankInventoryItem(area = ''): InventoryItem {
  return { id: uid('inv'), area, item: '', qty: 1, size: '' };
}

/** Rows grouped by area, keeping the order areas first appear in. */
export function groupInventory(items: InventoryItem[]): { area: string; items: InventoryItem[] }[] {
  const groups: { area: string; items: InventoryItem[] }[] = [];
  for (const it of items) {
    const area = it.area.trim() || 'Other';
    let g = groups.find((x) => x.area === area);
    if (!g) groups.push((g = { area, items: [] }));
    g.items.push(it);
  }
  return groups;
}

/** A Trinity suite plan (it has the contractor-fixed rooms). */
export function isTrinityProject(p: Pick<Project, 'scenarios'>): boolean {
  return p.scenarios.some((s) => s.objects.some((o) => o.kind === 'room' && o.fixed === 'Contractor-fixed'));
}
