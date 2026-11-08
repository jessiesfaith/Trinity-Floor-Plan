import { describe, expect, it } from 'vitest';
import { sizeMarks } from '@/lib/sizeMarks';
import { renderSvg } from '@/lib/svgRender';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import { furnitureFromTemplate } from '@/lib/objects';
import { createSampleProject } from '@/lib/sampleProject';

const tpl = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;

describe('show dimensions on a furniture piece', () => {
  it('measures the width along the back and the depth along a side, outside the piece', () => {
    const desk = { ...furnitureFromTemplate(tpl('part-desk-long'), 100, 100, 'Long desk', 0), showSize: true };
    const [w, d] = sizeMarks(desk, 5, 6);
    expect(w.length).toBeCloseTo(48, 6);
    expect(d.length).toBeCloseTo(24, 6);
    expect(w.a.y).toBeLessThan(100 - 12); // above the back edge
    expect(d.a.x).toBeGreaterThan(100 + 24); // right of the side edge
    expect(Math.abs(d.angle)).toBe(90);
  });

  it('follows a rotated piece and gives a round table one diameter line', () => {
    const desk = furnitureFromTemplate(tpl('part-desk-long'), 0, 0, 'Long desk', 90);
    expect(sizeMarks(desk, 5, 6).map((m) => Math.round(m.length))).toEqual([48, 24]);
    const table = furnitureFromTemplate(tpl('round-table-42'), 0, 0, 'Table', 0);
    const marks = sizeMarks(table, 5, 6);
    expect(marks).toHaveLength(1);
    expect(marks[0].prefix).toBe('⌀ ');
  });

  it('is drawn in the exported plan only for pieces that have it switched on', () => {
    const p = createSampleProject();
    const on = { ...furnitureFromTemplate(tpl('part-desk-long'), 0, 0, 'Long desk', 0), showSize: true };
    const off = furnitureFromTemplate(tpl('part-desk-short'), 200, 0, 'Short desk', 0);
    const { svg } = renderSvg([on, off], p.settings, { view: 'presentation', layers: p.layers, showDimensions: true, showFurnitureLabels: false, showRoomAreas: false, showSeatCounts: false, showLegend: false });
    expect(svg).toContain(">4'-0&quot;<");
    expect(svg).toContain(">2'-0&quot;<");
    expect((svg.match(/font-weight="bold" text-anchor="middle" dominant-baseline="middle"/g) ?? []).length).toBe(2);
  });
});

describe('size mark text direction', () => {
  it('reads the same way whichever way a piece is turned', () => {
    const t = BUILT_IN_TEMPLATES.find((x) => x.id === 'part-desk-long')!;
    for (const r of [0, 90, 180, 270]) {
      for (const m of sizeMarks(furnitureFromTemplate(t, 0, 0, 'Long desk', r), 5, 6)) {
        expect(m.angle).toBeGreaterThan(-89.9);
        expect(m.angle).toBeLessThanOrEqual(90.001);
      }
    }
  });
});
