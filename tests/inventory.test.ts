import { describe, expect, it } from 'vitest';
import { createBlankProject, createSampleProject } from '@/lib/sampleProject';
import { groupInventory, TRINITY_ADDRESS } from '@/lib/inventory';
import { parseProject } from '@/lib/persistence';
import { renderSvg } from '@/lib/svgRender';

describe('furniture inventory legend', () => {
  it('the starter plan carries the address and the office inventory', () => {
    const p = createSampleProject();
    expect(p.address).toBe(TRINITY_ADDRESS);
    const inv = p.inventory!;
    const qty = (item: string, area?: string) => inv.find((x) => x.item === item && (!area || x.area === area))?.qty;
    expect(qty('Long cubicle walls')).toBe(29);
    expect(qty('Short desks')).toBe(13);
    expect(qty('Corner desks')).toBe(8);
    expect(qty('Chairs', 'Conference room')).toBe(11);
    expect(groupInventory(inv).map((g) => g.area)).toEqual([
      'Cubicles',
      'File cabinets (under desks)',
      "Josh's office",
      'Printer area',
      'IT room',
      'Kitchen',
      'Conference room',
      'Building',
    ]);
  });

  it('an older saved Trinity plan gets the inventory and address; other plans do not', () => {
    const old = createSampleProject();
    delete old.inventory;
    delete old.address;
    const loaded = parseProject(JSON.stringify(old));
    expect(loaded.address).toBe(TRINITY_ADDRESS);
    expect(loaded.inventory?.length).toBeGreaterThan(10);
    const blank = parseProject(JSON.stringify(createBlankProject()));
    expect(blank.inventory).toBeUndefined();
    // the user's own edits are kept
    const edited = createSampleProject();
    edited.inventory = [{ id: 'x', area: 'Kitchen', item: 'Microwave', qty: 1, size: '' }];
    expect(parseProject(JSON.stringify(edited)).inventory).toEqual(edited.inventory);
  });

  it('exports show the header and the inventory', () => {
    const p = createSampleProject();
    const { svg } = renderSvg(p.scenarios[0].objects, p.settings, {
      view: '2d', showDimensions: true, showFurnitureLabels: true, showRoomAreas: true, showSeatCounts: true, showLegend: true,
      header: p.address, inventory: p.inventory,
    });
    expect(svg).toContain('2350 Mission College Blvd, Suite 330');
    expect(svg).toContain('Furniture inventory');
    expect(svg).toContain('Long cubicle walls');
  });
});
