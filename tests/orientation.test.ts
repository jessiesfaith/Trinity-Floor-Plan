import { describe, expect, it } from 'vitest';
import { faceObjects, facingOf, rotateObjects } from '@/lib/orientation';
import { furnitureFromTemplate } from '@/lib/objects';
import { BUILT_IN_TEMPLATES } from '@/lib/library';

const cub = BUILT_IN_TEMPLATES.find((t) => t.id === 'cub-4x4')!;
const a = furnitureFromTemplate(cub, 100, 100, 'Cubicle 01');
const b = furnitureFromTemplate(cub, 200, 100, 'Cubicle 02');
const locked = { ...furnitureFromTemplate(cub, 300, 100, 'Cubicle 03'), locked: true };

describe('turning cubicles', () => {
  it('rotates only the selected, unlocked objects, wrapping at 360', () => {
    const out = rotateObjects([a, b, locked], [a.id, locked.id], -90);
    expect(out.map((o) => (o.kind === 'furniture' ? o.rotation : null))).toEqual([270, 0, 0]);
    expect((rotateObjects(out, [a.id], 90)[0] as typeof a).rotation).toBe(0);
  });

  it('points the opening in a chosen direction and reports it back', () => {
    for (const dir of ['up', 'right', 'down', 'left'] as const) {
      const [o] = faceObjects([a], [a.id], dir);
      expect(facingOf((o as typeof a).rotation)).toBe(dir);
    }
    expect(facingOf(45)).toBeNull();
    expect(facingOf(-90)).toBe('right');
  });

  it('keeps each object in place', () => {
    const [o] = faceObjects([a], [a.id], 'left');
    expect([o.kind === 'furniture' && o.x, o.kind === 'furniture' && o.y]).toEqual([100, 100]);
  });
});
