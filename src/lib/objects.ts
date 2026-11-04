// Object factories and shape helpers shared by the canvas, validator, exporter and generator.

import type { Aisle, Dimension, Door, Furniture, FurnitureTemplate, PlanObject, Pt, Room, TextLabel, Wall } from '@/types/plan';
import { add, centroid, doorSwingPolygon, pointInPolygon, polygonArea, rectCorners, rotatePt, segmentToQuad } from './geometry';

let counter = 0;
export function uid(prefix = 'obj'): string {
  counter = (counter + 1) % 1_000_000;
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${counter.toString(36)}`;
}

export function furnitureFromTemplate(t: FurnitureTemplate, x: number, y: number, name?: string, rotation = 0): Furniture {
  return {
    id: uid('f'),
    kind: 'furniture',
    name: name ?? t.label,
    type: t.type,
    x,
    y,
    width: t.width,
    depth: t.depth,
    rotation,
    color: t.color,
    isWorkstation: t.isWorkstation,
    seats: t.seats,
    access: t.access,
    partitionHeight: t.partitionHeight,
    assignedTo: Array.from({ length: t.isWorkstation ? t.seats : 0 }, () => ''),
    department: '',
    deskType: t.deskType,
    equipment: [],
    overlapsAllowed: t.overlapsAllowed,
    locked: false,
    notes: '',
  };
}

export const defaultLabelStyle = () => ({
  fontSize: 14,
  fontWeight: 'bold' as const,
  color: '#14213d',
  align: 'center' as const,
  rotation: 0,
  background: '',
  offset: { x: 0, y: 0 },
});

export function makeRoom(name: string, roomType: Room['roomType'], points: Pt[], fill = '#eef2f7', extra: Partial<Room> = {}): Room {
  return {
    id: uid('r'),
    kind: 'room',
    name,
    roomType,
    points,
    fill,
    stroke: '#14213d',
    label: defaultLabelStyle(),
    showArea: true,
    dimensionsVerified: false,
    locked: false,
    notes: '',
    ...extra,
  };
}

export function makeWall(a: Pt, b: Pt, wallType: Wall['wallType'] = 'interior'): Wall {
  return {
    id: uid('w'),
    kind: 'wall',
    name: wallType === 'exterior' ? 'Exterior wall' : wallType === 'partition' ? 'Partition' : 'Interior wall',
    a,
    b,
    thickness: wallType === 'exterior' ? 8 : wallType === 'partition' ? 3 : 5,
    color: '#14213d',
    wallType,
    locked: false,
    notes: '',
  };
}

export function makeDoor(x: number, y: number, rotation: number, width = 36, swing: 1 | -1 = 1, name = 'Door'): Door {
  return { id: uid('d'), kind: 'door', name, x, y, rotation, width, swing, color: '#14213d', locked: false, notes: '' };
}

export function makeLabel(x: number, y: number, text: string): TextLabel {
  const { offset: _o, ...style } = defaultLabelStyle();
  void _o;
  return { id: uid('t'), kind: 'label', name: text.slice(0, 24) || 'Label', x, y, text, style: { ...style, fontSize: 12, fontWeight: 'normal' }, locked: false, notes: '' };
}

export function makeDimension(a: Pt, b: Pt, offset = 18): Dimension {
  return { id: uid('m'), kind: 'dimension', name: 'Dimension', a, b, offset, color: '#d62828', locked: false, notes: '' };
}

export function makeAisle(x: number, y: number, width: number, depth: number, rotation = 0): Aisle {
  return { id: uid('a'), kind: 'aisle', name: 'Walking aisle', x, y, width, depth, rotation, color: '#f6d365', locked: false, notes: '' };
}

/** Convex footprint polygon of a rect-like object. */
export function footprint(o: Furniture | Aisle): Pt[] {
  return rectCorners(o.x, o.y, o.width, o.depth, o.rotation);
}

export const wallPolygon = (w: Wall) => segmentToQuad(w.a, w.b, w.thickness);
export const doorSwing = (d: Door) => doorSwingPolygon({ x: d.x, y: d.y }, d.rotation, d.width, d.swing);
export const doorLatch = (d: Door): Pt => add({ x: d.x, y: d.y }, rotatePt({ x: d.width, y: 0 }, d.rotation));

export const roomArea = (r: Room) => polygonArea(r.points);
export const roomCentroid = (r: Room) => centroid(r.points);

/** Smallest room whose polygon contains the point (rooms may be nested, e.g. a cubicle zone inside an open area). */
export function roomAt(objects: PlanObject[], p: Pt): Room | undefined {
  let best: Room | undefined;
  let bestArea = Infinity;
  for (const o of objects) {
    if (o.kind !== 'room') continue;
    if (pointInPolygon(p, o.points)) {
      const a = roomArea(o);
      if (a < bestArea) {
        best = o;
        bestArea = a;
      }
    }
  }
  return best;
}

/** Translate any object by (dx, dy). */
export function translateObject<T extends PlanObject>(o: T, dx: number, dy: number): T {
  switch (o.kind) {
    case 'room':
      return { ...o, points: o.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'wall':
    case 'dimension':
      return { ...o, a: { x: o.a.x + dx, y: o.a.y + dy }, b: { x: o.b.x + dx, y: o.b.y + dy } };
    case 'label':
      return { ...o, x: o.x + dx, y: o.y + dy, callout: o.callout ? { x: o.callout.x + dx, y: o.callout.y + dy } : undefined };
    default:
      return { ...o, x: (o as Furniture).x + dx, y: (o as Furniture).y + dy };
  }
}

/** Representative anchor point (used for selection rectangles and "which room" tests). */
export function anchorOf(o: PlanObject): Pt {
  switch (o.kind) {
    case 'room':
      return centroid(o.points);
    case 'wall':
    case 'dimension':
      return { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 };
    default:
      return { x: o.x, y: o.y };
  }
}

/** All vertices of an object (for bounds/fit-to-screen). */
export function pointsOf(o: PlanObject): Pt[] {
  switch (o.kind) {
    case 'room':
      return o.points;
    case 'wall':
      return wallPolygon(o);
    case 'dimension':
      return [o.a, o.b];
    case 'door':
      return doorSwing(o);
    case 'label':
      return [{ x: o.x, y: o.y }];
    default:
      return footprint(o);
  }
}

export function cloneObject<T extends PlanObject>(o: T, dx = 12, dy = 12): T {
  const c = translateObject(structuredClone(o), dx, dy);
  return { ...c, id: uid(o.kind.slice(0, 1)), name: `${o.name} copy`, locked: false, groupId: undefined };
}
