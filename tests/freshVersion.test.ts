import { describe, expect, it } from 'vitest';
import { isStaleAssetError } from '@/lib/freshVersion';

describe('stale script detection', () => {
  it('recognizes the errors browsers raise when an old page loses its script files', () => {
    const chunk = Object.assign(new Error('Loading chunk 384 failed.\n(error: https://x/_next/static/chunks/384.js)'), { name: 'ChunkLoadError' });
    expect(isStaleAssetError(chunk)).toBe(true);
    expect(isStaleAssetError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true); // Chrome
    expect(isStaleAssetError(new TypeError('Importing a module script failed.'))).toBe(true); // Safari
    expect(isStaleAssetError(new TypeError('error loading dynamically imported module'))).toBe(true); // Firefox
  });
  it('ignores ordinary errors', () => {
    expect(isStaleAssetError(new Error("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isStaleAssetError(null)).toBe(false);
  });
});
