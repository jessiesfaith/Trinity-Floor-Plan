// Recognize an unedited copy of an older starter plan, so the app can swap it for the
// current one. A browser that opened the app before a starter-plan update keeps loading its
// saved copy; if that copy was never edited, the newer starter plan should win.
//
// The fingerprint ignores everything that differs between two fresh copies of the same plan
// (random object ids, timestamps, revision counters, which layout tab is open) and rounds
// numbers, so any real edit (moving, adding, renaming, recoloring...) changes it.

const DROP_KEYS = new Set(['id', 'groupId', 'createdAt', 'updatedAt', 'activeScenarioId', 'revision']);
/** Ids made by uid(): a short prefix, "_", 8 hex chars, then a base-36 counter. */
const UID = /^[a-z]{1,8}_[0-9a-f]{8}[0-9a-z]+$/;

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 + 0 : String(v);
  if (typeof v === 'string') return UID.test(v) ? '#id' : v;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      if (DROP_KEYS.has(k)) continue;
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canon(x);
    }
    return out;
  }
  return v;
}

/** Two independent 32-bit FNV-1a hashes, as 16 hex chars. */
function hash(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
    b = (b ^ (b >>> 15)) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Fingerprint of a project as stored (pass the parsed JSON, before any normalizing). */
export function projectFingerprint(project: unknown): string {
  return hash(JSON.stringify(canon(project)));
}

/**
 * Fingerprint of the starter plan that createSampleProject() builds today. A test checks it; when
 * src/lib/sampleProject.ts changes, the test fails: move this value to the end of
 * PREVIOUS_SAMPLE_FINGERPRINTS and set this to the new value the test prints.
 */
export const CURRENT_SAMPLE_FINGERPRINT = '01dc002cf9616bbb';

/** Fingerprints of the starter plan as shipped in earlier releases, oldest first. */
export const PREVIOUS_SAMPLE_FINGERPRINTS: readonly string[] = [
  '3cb0a4cff82eb3cd', // 1f97b44 – original import (Office 1 as traced)
  'a509a8f70868e086', // a4ad6ba – Office 1 13 x 15 right triangle
  '1086d5475280760b', // 9a19898 – even 47" aisle, IT / Storage door in the bottom wall
  '1c4b4f5d9affc616', // 459747e – Office 1 15 x 15, new Office 2 wall, Office 3 shallower
  'e56cc623b8083a0a', // 7132e54 – Office 4 flush with Office 3
];

/** True when a stored project (parsed JSON, as saved) is an unedited copy of an earlier starter plan. */
export function isOutdatedUneditedSample(stored: unknown): boolean {
  const f = projectFingerprint(stored);
  return f !== CURRENT_SAMPLE_FINGERPRINT && PREVIOUS_SAMPLE_FINGERPRINTS.includes(f);
}
