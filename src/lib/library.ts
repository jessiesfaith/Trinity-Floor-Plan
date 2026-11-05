// Built-in furniture library. Dimensions are typical catalog sizes (inches) and
// are fully editable after placement; users can also save their own templates.

import type { FurnitureTemplate } from '@/types/plan';

const T = (t: Omit<FurnitureTemplate, 'builtIn'>): FurnitureTemplate => ({ ...t, builtIn: true });

export const BUILT_IN_TEMPLATES: FurnitureTemplate[] = [
  T({ id: 'cub-4x4', label: 'Cubicle 4×4', category: 'Workstations', type: 'cubicle', width: 48, depth: 48, color: '#cfe8e7', isWorkstation: true, seats: 1, access: 'front-aisle', partitionHeight: 53, deskType: 'Standard' }),
  T({ id: 'cub-4x5', label: 'Cubicle 4×5', category: 'Workstations', type: 'cubicle', width: 48, depth: 60, color: '#cfe8e7', isWorkstation: true, seats: 1, access: 'front-aisle', partitionHeight: 53, deskType: 'Standard' }),
  T({ id: 'cub-5x5', label: 'Cubicle 5×5', category: 'Workstations', type: 'cubicle', width: 60, depth: 60, color: '#cfe8e7', isWorkstation: true, seats: 1, access: 'front-aisle', partitionHeight: 53, deskType: 'Standard' }),
  T({ id: 'cub-6x6', label: 'Cubicle 6×6', category: 'Workstations', type: 'cubicle', width: 72, depth: 72, color: '#cfe8e7', isWorkstation: true, seats: 1, access: 'front-aisle', partitionHeight: 53, deskType: 'Standard' }),
  T({ id: 'desk-single', label: 'Single desk 60×30', category: 'Workstations', type: 'desk', width: 60, depth: 30, color: '#e7dcc8', isWorkstation: true, seats: 1, access: 'front-chair', deskType: 'Single' }),
  T({ id: 'desk-shared-2', label: 'Shared desk (2-person)', category: 'Workstations', type: 'shared-desk', width: 60, depth: 60, color: '#e7dcc8', isWorkstation: true, seats: 2, access: 'both-chair', deskType: 'Shared 2-person' }),
  T({ id: 'bench-4', label: 'Bench (4-person)', category: 'Workstations', type: 'bench', width: 120, depth: 60, color: '#e7dcc8', isWorkstation: true, seats: 4, access: 'both-chair', deskType: 'Bench 4-person' }),
  T({ id: 'bench-6', label: 'Bench (6-person)', category: 'Workstations', type: 'bench', width: 180, depth: 60, color: '#e7dcc8', isWorkstation: true, seats: 6, access: 'both-chair', deskType: 'Bench 6-person' }),
  T({ id: 'desk-l', label: 'L-shaped desk 60×60', category: 'Workstations', type: 'l-desk', width: 60, depth: 60, color: '#e7dcc8', isWorkstation: true, seats: 1, access: 'front-chair', deskType: 'L-shaped' }),
  T({ id: 'phone-booth', label: 'Phone booth (1-person)', category: 'Workstations', type: 'phone-booth', width: 40, depth: 40, color: '#dfe7f3', isWorkstation: false, seats: 0, access: 'none', deskType: '' }),
  // Cubicle parts: build cubicles piece by piece from the office's own inventory. They may overlap
  // (desks sit against walls, cabinets under desks), and each counts against its inventory line.
  T({ id: 'part-wall-4', label: "Cubicle wall 4'", category: 'Cubicle parts', type: 'partition', width: 48, depth: 2, color: '#5b6b8c', isWorkstation: false, seats: 0, access: 'none', partitionHeight: 53, deskType: '', overlapsAllowed: true, inventoryItem: 'Cubicles|Long cubicle walls' }),
  T({ id: 'part-wall-2', label: "Cubicle wall 2'", category: 'Cubicle parts', type: 'partition', width: 24, depth: 2, color: '#5b6b8c', isWorkstation: false, seats: 0, access: 'none', partitionHeight: 53, deskType: '', overlapsAllowed: true, inventoryItem: 'Cubicles|Short cubicle walls' }),
  T({ id: 'part-desk-corner', label: 'Corner desk 4×4', category: 'Cubicle parts', type: 'l-desk', width: 48, depth: 48, color: '#e7dcc8', isWorkstation: false, seats: 0, access: 'none', deskType: 'Corner', overlapsAllowed: true, inventoryItem: 'Cubicles|Corner desks' }),
  T({ id: 'part-desk-long', label: 'Long desk 4×2', category: 'Cubicle parts', type: 'desk', width: 48, depth: 24, color: '#e7dcc8', isWorkstation: false, seats: 0, access: 'none', deskType: 'Long', overlapsAllowed: true, inventoryItem: 'Cubicles|Long desks' }),
  T({ id: 'part-desk-short', label: 'Short desk 2×2', category: 'Cubicle parts', type: 'desk', width: 24, depth: 24, color: '#e7dcc8', isWorkstation: false, seats: 0, access: 'none', deskType: 'Short', overlapsAllowed: true, inventoryItem: 'Cubicles|Short desks' }),
  T({ id: 'part-shelf', label: 'Hanging shelf 4′', category: 'Cubicle parts', type: 'shelving', width: 48, depth: 12, color: '#c8ced8', isWorkstation: false, seats: 0, access: 'none', deskType: '', overlapsAllowed: true, inventoryItem: 'Cubicles|Hanging shelves (in cubicles)' }),
  T({ id: 'part-file-small', label: 'File cabinet (small)', category: 'Cubicle parts', type: 'filing-cabinet', width: 15, depth: 20, color: '#b9c2cf', isWorkstation: false, seats: 0, access: 'none', deskType: '', overlapsAllowed: true, inventoryItem: 'Cubicles|Small file cabinets' }),
  T({ id: 'part-file-long', label: 'File cabinet (long)', category: 'Cubicle parts', type: 'filing-cabinet', width: 30, depth: 20, color: '#b9c2cf', isWorkstation: false, seats: 0, access: 'none', deskType: '', overlapsAllowed: true, inventoryItem: 'Cubicles|Long file cabinets' }),
  T({ id: 'chair', label: 'Office chair', category: 'Seating', type: 'chair', width: 24, depth: 24, color: '#5b6b8c', isWorkstation: false, seats: 0, access: 'none', deskType: '', overlapsAllowed: true }),
  T({ id: 'conf-8', label: 'Conference table 8-seat', category: 'Tables', type: 'conference-table', width: 120, depth: 48, color: '#d9c7a7', isWorkstation: false, seats: 8, access: 'none', deskType: '' }),
  T({ id: 'conf-12', label: 'Conference table 12-seat', category: 'Tables', type: 'conference-table', width: 168, depth: 54, color: '#d9c7a7', isWorkstation: false, seats: 12, access: 'none', deskType: '' }),
  T({ id: 'storage-cab', label: 'Storage cabinet', category: 'Storage', type: 'storage-cabinet', width: 36, depth: 18, color: '#b9c2cf', isWorkstation: false, seats: 0, access: 'none', deskType: '' }),
  T({ id: 'filing-cab', label: 'Filing cabinet (lateral)', category: 'Storage', type: 'filing-cabinet', width: 30, depth: 20, color: '#b9c2cf', isWorkstation: false, seats: 0, access: 'none', deskType: '' }),
  T({ id: 'shelving', label: 'Shelving unit', category: 'Storage', type: 'shelving', width: 48, depth: 18, color: '#c8ced8', isWorkstation: false, seats: 0, access: 'none', deskType: '' }),
  T({ id: 'printer', label: 'Printer / copier', category: 'Equipment', type: 'printer', width: 30, depth: 26, color: '#9aa5b8', isWorkstation: false, seats: 0, access: 'none', deskType: '' }),
  T({ id: 'partition', label: 'Interior partition 6ft', category: 'Architecture', type: 'partition', width: 72, depth: 3, color: '#7a869a', isWorkstation: false, seats: 0, access: 'none', partitionHeight: 53, deskType: '' }),
  T({ id: 'plant', label: 'Plant', category: 'Decor', type: 'plant', width: 18, depth: 18, color: '#7fb77e', isWorkstation: false, seats: 0, access: 'none', deskType: '' }),
];

/** Pseudo-templates for architecture objects created by tools rather than as furniture. */
export const ARCHITECTURE_ITEMS = [
  { id: 'door-36', label: 'Door 36"', kind: 'door' as const, width: 36 },
  { id: 'door-32', label: 'Door 32"', kind: 'door' as const, width: 32 },
  { id: 'aisle', label: 'Walking aisle zone', kind: 'aisle' as const, width: 120 },
];
