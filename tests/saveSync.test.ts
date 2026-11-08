import { describe, expect, it } from 'vitest';
import { createSaveSync, savedFingerprint } from '@/lib/saveSync';

function fakeStore(initial?: string) {
  let v = initial;
  return { read: async () => v, write: async (j: string) => void (v = j), get: () => v, set: (j: string) => void (v = j) };
}

describe('saving alongside other tabs', () => {
  it('saves when nothing else changed the stored plan', async () => {
    const db = fakeStore('{"a":1}');
    const s = createSaveSync(db.read, db.write);
    s.accept(db.get());
    expect(await s.write('{"a":2}')).toBe('saved');
    expect(db.get()).toBe('{"a":2}');
    expect(await s.changedElsewhere()).toBeNull();
  });

  it('does not write over a plan another tab saved, and reports it', async () => {
    const db = fakeStore('{"a":1}');
    const tab1 = createSaveSync(db.read, db.write);
    const tab2 = createSaveSync(db.read, db.write);
    tab1.accept(db.get());
    tab2.accept(db.get());
    expect(await tab2.write('{"a":"from tab 2"}')).toBe('saved');
    expect(await tab1.changedElsewhere()).toBe('{"a":"from tab 2"}');
    expect(await tab1.write('{"a":"stale tab 1"}')).toBe('conflict');
    expect(db.get()).toBe('{"a":"from tab 2"}');
    // Choosing to keep tab 1's version writes it deliberately.
    expect(await tab1.write('{"a":"tab 1 kept"}', { force: true })).toBe('saved');
    expect(db.get()).toBe('{"a":"tab 1 kept"}');
  });

  it('notices a change written by something other than a tab (e.g. a direct edit)', async () => {
    const db = fakeStore('{"a":1}');
    const s = createSaveSync(db.read, db.write);
    s.accept(db.get());
    db.set('{"a":1,"checklist":[]}');
    expect(await s.changedElsewhere()).toBe('{"a":1,"checklist":[]}');
  });

  it('first save into empty storage is fine', async () => {
    const db = fakeStore(undefined);
    const s = createSaveSync(db.read, db.write);
    s.accept(undefined);
    expect(await s.write('{}')).toBe('saved');
    expect(savedFingerprint('{}')).not.toBe(savedFingerprint('{ }'));
  });
});
