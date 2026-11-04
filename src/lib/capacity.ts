// Capacity dashboard metrics, computed from geometry (never from area ratios alone).

import type { Furniture, PlanObject, PlanSettings, Room } from '@/types/plan';
import { centroid, pointInPolygon, polygonArea } from './geometry';
import { footprint, roomAt, roomArea } from './objects';
import type { ValidationResult } from './validation';
import { sqft } from './units';

export interface RoomCapacity {
  roomId: string;
  name: string;
  roomType: Room['roomType'];
  areaSqft: number;
  plannedAreaSqft: number | null;
  targetMin?: number;
  targetMax?: number;
  workstations: number;
  seats: number;
  feasibleSeats: number;
  assigned: number;
  occupiedSqft: number;
  remainingSqft: number;
  conflicts: number;
  workstationTypes: Record<string, number>;
}

export interface CapacitySummary {
  rooms: RoomCapacity[];
  cubicleAreas: RoomCapacity[];
  totalWorkstations: number;
  totalSeats: number;
  feasibleSeats: number;
  assigned: number;
  unassigned: number;
  occupiedSqft: number;
  remainingSqft: number;
  minAisleMeasured: number | null;
  conflicts: number;
  warnings: number;
  workstationTypes: Record<string, number>;
}

const assignedCount = (f: Furniture) => f.assignedTo.filter((a) => a.trim()).length;

export function computeCapacity(objects: PlanObject[], v: ValidationResult, _s?: PlanSettings): CapacitySummary {
  void _s;
  const rooms = objects.filter((o): o is Room => o.kind === 'room');
  const furniture = objects.filter((o): o is Furniture => o.kind === 'furniture');
  const byRoom = new Map<string, Furniture[]>();
  for (const f of furniture) {
    const r = roomAt(objects, { x: f.x, y: f.y });
    if (r) byRoom.set(r.id, [...(byRoom.get(r.id) ?? []), f]);
  }
  const roomCaps: RoomCapacity[] = rooms.map((r) => {
    const fs = byRoom.get(r.id) ?? [];
    const ws = fs.filter((f) => f.isWorkstation);
    const occupied = fs.filter((f) => !f.overlapsAllowed).reduce((a, f) => a + polygonArea(footprint(f)), 0);
    const area = roomArea(r);
    const types: Record<string, number> = {};
    ws.forEach((f) => (types[f.deskType || f.type] = (types[f.deskType || f.type] ?? 0) + 1));
    const p = r.planning;
    return {
      roomId: r.id,
      name: r.name,
      roomType: r.roomType,
      areaSqft: sqft(area),
      plannedAreaSqft: p?.widthFt && p?.lengthFt ? p.widthFt * p.lengthFt : null,
      targetMin: p?.targetMin,
      targetMax: p?.targetMax,
      workstations: ws.length,
      seats: ws.reduce((a, f) => a + f.seats, 0),
      feasibleSeats: ws.filter((f) => !v.conflictIds.has(f.id)).reduce((a, f) => a + f.seats, 0),
      assigned: ws.reduce((a, f) => a + assignedCount(f), 0),
      occupiedSqft: sqft(occupied),
      remainingSqft: sqft(Math.max(0, area - occupied)),
      conflicts: fs.filter((f) => v.conflictIds.has(f.id)).length,
      workstationTypes: types,
    };
  });
  const ws = furniture.filter((f) => f.isWorkstation);
  const totalSeats = ws.reduce((a, f) => a + f.seats, 0);
  const assigned = ws.reduce((a, f) => a + assignedCount(f), 0);
  const types: Record<string, number> = {};
  ws.forEach((f) => (types[f.deskType || f.type] = (types[f.deskType || f.type] ?? 0) + 1));
  const occupied = sqft(furniture.filter((f) => !f.overlapsAllowed).reduce((a, f) => a + polygonArea(footprint(f)), 0));
  // Zones drawn inside a larger room (e.g. cubicle areas inside the open area) are not added twice.
  const topLevel = rooms.filter((r) => !rooms.some((o) => o !== r && roomArea(o) > roomArea(r) && pointInPolygon(centroid(r.points), o.points)));
  const totalArea = roomCaps.filter((c) => topLevel.some((r) => r.id === c.roomId)).reduce((a, r) => a + r.areaSqft, 0);
  return {
    rooms: roomCaps,
    cubicleAreas: roomCaps.filter((r) => r.roomType === 'cubicle-area'),
    totalWorkstations: ws.length,
    totalSeats,
    feasibleSeats: ws.filter((f) => !v.conflictIds.has(f.id)).reduce((a, f) => a + f.seats, 0),
    assigned,
    unassigned: totalSeats - assigned,
    occupiedSqft: occupied,
    remainingSqft: Math.max(0, totalArea - occupied),
    minAisleMeasured: v.minAisleMeasured,
    conflicts: v.errorCount,
    warnings: v.warningCount,
    workstationTypes: types,
  };
}
