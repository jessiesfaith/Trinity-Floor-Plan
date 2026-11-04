import { describe, expect, it } from 'vitest';
import { createSampleProject, createBlankProject } from '@/lib/sampleProject';
import { CURRENT_SAMPLE_FINGERPRINT, PREVIOUS_SAMPLE_FINGERPRINTS, isOutdatedUneditedSample, projectFingerprint } from '@/lib/sampleFingerprint';
import { translateObject } from '@/lib/objects';

/** A project exactly as the app stores it (JSON round-trip). */
const stored = (p: unknown) => JSON.parse(JSON.stringify(p));

describe('starter-plan fingerprint', () => {
  it('matches CURRENT_SAMPLE_FINGERPRINT (update it, and PREVIOUS_SAMPLE_FINGERPRINTS, when the starter plan changes)', () => {
    const f = projectFingerprint(stored(createSampleProject()));
    if (f !== CURRENT_SAMPLE_FINGERPRINT) console.log(`Starter plan changed. New fingerprint: '${f}'`);
    expect(f).toBe(CURRENT_SAMPLE_FINGERPRINT);
    expect(PREVIOUS_SAMPLE_FINGERPRINTS).not.toContain(CURRENT_SAMPLE_FINGERPRINT);
  });

  it('ignores ids, timestamps, revision counters and the open layout tab', () => {
    const a = stored(createSampleProject());
    const b = stored(createSampleProject());
    b.activeScenarioId = b.scenarios[2].id;
    b.updatedAt = '2030-01-01T00:00:00.000Z';
    b.scenarios[0].revision = 7;
    expect(projectFingerprint(b)).toBe(projectFingerprint(a));
  });

  it('changes on any real edit', () => {
    const base = createSampleProject();
    const moved = structuredClone(base);
    const objs = moved.scenarios[0].objects;
    const i = objs.findIndex((o) => o.kind === 'furniture');
    objs[i] = translateObject(objs[i], 6, 0);
    const renamed = structuredClone(base);
    renamed.scenarios[1].name = 'My layout';
    const recolored = structuredClone(base);
    recolored.scenarios[0].objects.find((o) => o.kind === 'room')!.fill = '#ff0000';
    for (const p of [moved, renamed, recolored]) expect(projectFingerprint(stored(p))).not.toBe(projectFingerprint(stored(base)));
  });

  it('only replaces unedited copies of earlier starter plans', () => {
    expect(isOutdatedUneditedSample(stored(createSampleProject()))).toBe(false); // current plan
    expect(isOutdatedUneditedSample(stored(createBlankProject()))).toBe(false); // the user's own plan
    const edited = createSampleProject();
    edited.name = 'Edited';
    expect(isOutdatedUneditedSample(stored(edited))).toBe(false);
  });
});
