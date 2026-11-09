import { describe, expect, it } from 'vitest';
import { decideOnConnect } from '@/lib/cloud';

const base = { cloudPlanFp: 'C', cloudEtag: 'e2', mark: null, localFp: 'L', localIsStarter: false };

describe('connecting a browser to the online plan', () => {
  it('puts the plan online when nothing is there yet', () => {
    expect(decideOnConnect({ ...base, cloudPlanFp: null, cloudEtag: null })).toBe('upload');
  });
  it('a browser with only the untouched starter plan loads the online plan', () => {
    expect(decideOnConnect({ ...base, localIsStarter: true })).toBe('adopt');
  });
  it('asks when a browser that never synced has its own edited plan', () => {
    expect(decideOnConnect(base)).toBe('choose');
  });
  it('uploads local edits when the online plan has not changed since the last sync', () => {
    expect(decideOnConnect({ ...base, mark: { etag: 'e2', fp: 'old' } })).toBe('upload');
    expect(decideOnConnect({ ...base, mark: { etag: 'e2', fp: 'L' } })).toBe('in-sync');
  });
  it('loads the online plan when it changed elsewhere and nothing changed here', () => {
    expect(decideOnConnect({ ...base, mark: { etag: 'e1', fp: 'L' } })).toBe('adopt');
  });
  it('asks when both changed since the last sync', () => {
    expect(decideOnConnect({ ...base, mark: { etag: 'e1', fp: 'old' } })).toBe('choose');
  });
  it('identical plans are in sync', () => {
    expect(decideOnConnect({ ...base, localFp: 'C' })).toBe('in-sync');
  });
});
