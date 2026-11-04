import { describe, expect, it } from 'vitest';
import {
  centroid, convexOverlap, convexOverlapDepth, doorSwingPolygon, pointInPolygon, polygonArea, polygonContains,
  rayPolygon, rectCorners, rotatePt, segmentsIntersect, polygonDistance,
} from '@/lib/geometry';

const sq = (x: number, y: number, s: number) => [
  { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
];

describe('geometry', () => {
  it('computes polygon area and centroid (shoelace)', () => {
    expect(polygonArea(sq(0, 0, 10))).toBe(100);
    expect(centroid(sq(0, 0, 10))).toEqual({ x: 5, y: 5 });
    // 12 ft x 16 ft in inches = 192 sq ft
    expect(polygonArea(sq(0, 0, 144).map((p) => ({ x: p.x, y: (p.y / 144) * 192 }))) / 144).toBe(192);
  });

  it('rotates rectangles about their center', () => {
    const c = rectCorners(0, 0, 48, 24, 90);
    const xs = c.map((p) => Math.round(p.x));
    const ys = c.map((p) => Math.round(p.y));
    expect(Math.max(...xs) - Math.min(...xs)).toBe(24);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(48);
    const p = rotatePt({ x: 1, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it('detects convex overlap with SAT, and treats touching edges as clear', () => {
    expect(convexOverlap(sq(0, 0, 48), sq(47, 0, 48))).toBe(true);
    expect(convexOverlap(sq(0, 0, 48), sq(48, 0, 48))).toBe(false);
    expect(convexOverlapDepth(sq(0, 0, 48), sq(40, 0, 48))).toBeCloseTo(8);
    // Rotated rect that only clips the corner
    expect(convexOverlap(rectCorners(55, 55, 30, 30, 45), sq(0, 0, 48))).toBe(true);
    expect(convexOverlap(rectCorners(80, 80, 30, 30, 45), sq(0, 0, 48))).toBe(false);
  });

  it('point in polygon handles concave shapes and boundary', () => {
    const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 100 }];
    expect(pointInPolygon({ x: 25, y: 75 }, L)).toBe(true);
    expect(pointInPolygon({ x: 75, y: 75 }, L)).toBe(false);
    expect(pointInPolygon({ x: 100, y: 25 }, L)).toBe(true);
  });

  it('polygon containment rejects shapes that cross a concave notch', () => {
    const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 100 }];
    expect(polygonContains(L, sq(0, 0, 48))).toBe(true);
    expect(polygonContains(L, sq(40, 40, 20))).toBe(false);
    expect(polygonContains(sq(0, 0, 144), sq(96, 96, 48))).toBe(true); // flush with walls
  });

  it('segment intersection and ray casting', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
    expect(rayPolygon({ x: 0, y: 24 }, { x: 1, y: 0 }, sq(48, 0, 48))).toBeCloseTo(48);
    expect(rayPolygon({ x: 0, y: 24 }, { x: -1, y: 0 }, sq(48, 0, 48))).toBeNull();
  });

  it('door swing polygon covers a quarter circle on the swing side', () => {
    const s = doorSwingPolygon({ x: 0, y: 0 }, 0, 36, 1);
    expect(pointInPolygon({ x: 10, y: 10 }, s)).toBe(true);
    expect(pointInPolygon({ x: 10, y: -10 }, s)).toBe(false);
    expect(polygonDistance(sq(40, 0, 10), sq(0, 0, 10))).toBeCloseTo(30);
  });
});
