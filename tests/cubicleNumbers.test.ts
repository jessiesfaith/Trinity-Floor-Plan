import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import { furnitureFromTemplate, cloneObject } from '@/lib/objects';
import { nameForNew, numberCopies, renumberDuplicates } from '@/lib/cubicleNumbers';
import { createSampleProject } from '@/lib/sampleProject';
import { parseProject, serializeProject } from '@/lib/persistence';
import type { PlanObject } from '@/types/plan';

const cubeT = BUILT_IN_TEMPLATES.find((t) => t.type === 'cubicle')!;
const desk = BUILT_IN_TEMPLATES.find((t) => t.type === 'desk')!;
const cube = (name: string) => furnitureFromTemplate(cubeT, 0, 0, name);
const names = (objs: PlanObject[]) => objs.filter((o) => o.kind === 'furniture').map((o) => o.name);

describe('cubicle numbers', () => {
  it('a new cubicle takes the number after the highest, even after a delete', () => {
    const objs = [cube('Cubicle 01'), cube('Cubicle 03')];
    expect(nameForNew(objs, 'cubicle', 'x')).toBe('Cubicle 04');
    expect(nameForNew([], 'cubicle', 'x')).toBe('Cubicle 01');
    expect(nameForNew(objs, 'desk', 'Desk')).toBe('Desk');
  });

  it('copies get their own numbers instead of "copy"', () => {
    const objs = [cube('Cubicle 01'), cube('Cubicle 02')];
    const copies = numberCopies(objs, objs.map((o) => cloneObject(o)));
    expect(names(copies)).toEqual(['Cubicle 03', 'Cubicle 04']);
    const custom = furnitureFromTemplate(cubeT, 0, 0, 'Reception cube');
    expect(names(numberCopies(objs, [cloneObject(custom)]))).toEqual(['Reception cube copy']);
  });

  it('renumbers repeated numbers and copies, keeping the first of each', () => {
    const objs = [cube('Cubicle 10'), cube('Cubicle 11'), cube('Cubicle 11'), furnitureFromTemplate(desk, 0, 0, 'Desk'), cube('Cubicle 11 copy'), cube('Cubicle 12')];
    const s = { ...createSampleProject().scenarios[0], objects: objs };
    expect(names(renumberDuplicates(s).objects)).toEqual(['Cubicle 10', 'Cubicle 11', 'Cubicle 13', 'Desk', 'Cubicle 14', 'Cubicle 12']);
    const ok = { ...s, objects: [cube('Cubicle 01'), cube('Cubicle 02')] };
    expect(renumberDuplicates(ok)).toBe(ok);
  });

  it('a saved plan with repeated numbers loads with every cubicle numbered once', () => {
    const p = createSampleProject();
    p.scenarios[0] = { ...p.scenarios[0], objects: [...p.scenarios[0].objects, cube('Cubicle 11'), cube('Cubicle 11'), cube('Cubicle 11')] };
    const loaded = parseProject(serializeProject(p));
    const cubes = names(loaded.scenarios[0].objects).filter((n) => n.startsWith('Cubicle'));
    expect(cubes).toEqual(['Cubicle 11', 'Cubicle 12', 'Cubicle 13']);
  });
});
