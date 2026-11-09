// Server side of online saving: one shared plan, stored privately.
//
// On Vercel the plan lives in a private Vercel Blob store (BLOB_READ_WRITE_TOKEN, added when a Blob
// store is connected to the project). Every write names the version it replaces (its ETag), so a
// save never overwrites a newer plan saved from another computer. Without a Blob token, in local
// development only, the plan is kept in a file under .next/ so the feature can be tried offline.

import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredPlan {
  text: string;
  etag: string;
}

export type WriteOutcome = { ok: true; etag: string } | { ok: false; conflict: true };

export interface PlanStore {
  read(): Promise<StoredPlan | null>;
  /** Current version tag only (cheap check for changes), or null when nothing is stored. */
  version(): Promise<string | null>;
  /** Write `text` if the stored plan is still `etag` (null: only when nothing is stored yet); `force` skips the check. */
  write(text: string, etag: string | null, force?: boolean): Promise<WriteOutcome>;
}

const PATHNAME = 'plans/trinity-floor-plan.json';

function blobStore(): PlanStore {
  return {
    async read() {
      const { get } = await import('@vercel/blob');
      const r = await get(PATHNAME, { access: 'private', useCache: false });
      if (!r || r.statusCode !== 200 || !r.stream) return null;
      const text = await new Response(r.stream).text();
      return { text, etag: r.blob.etag };
    },
    async version() {
      const { head, BlobNotFoundError } = await import('@vercel/blob');
      try {
        return (await head(PATHNAME)).etag;
      } catch (e) {
        if (e instanceof BlobNotFoundError) return null;
        throw e;
      }
    },
    async write(text, etag, force) {
      const { put, BlobPreconditionFailedError, BlobError } = await import('@vercel/blob');
      const base = { access: 'private' as const, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 };
      try {
        const r = force
          ? await put(PATHNAME, text, { ...base, allowOverwrite: true })
          : etag
            ? await put(PATHNAME, text, { ...base, ifMatch: etag })
            : await put(PATHNAME, text, { ...base, allowOverwrite: false });
        return { ok: true, etag: r.etag };
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) return { ok: false, conflict: true };
        // First save when a plan already exists ("blob already exists").
        if (!etag && !force && e instanceof BlobError && /exist/i.test(e.message)) return { ok: false, conflict: true };
        throw e;
      }
    },
  };
}

/** Local development only: a file under .next/ standing in for the Blob store. */
function devFileStore(): PlanStore {
  const file = path.join(process.cwd(), '.next', 'dev-online-plan.json');
  const tag = (t: string) => `"${createHash('sha1').update(t).digest('hex')}"`;
  const read = async () => {
    try {
      const text = await readFile(file, 'utf8');
      return { text, etag: tag(text) };
    } catch {
      return null;
    }
  };
  return {
    read,
    async version() {
      return (await read())?.etag ?? null;
    },
    async write(text, etag, force) {
      const cur = await read();
      if (!force && (cur?.etag ?? null) !== etag) return { ok: false, conflict: true };
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text, 'utf8');
      return { ok: true, etag: tag(text) };
    },
  };
}

export function planStore(): PlanStore | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobStore();
  if (process.env.NODE_ENV !== 'production') return devFileStore();
  return null;
}

/** The team passcode set in the project's environment (PLAN_PASSCODE); null when not set up. */
export function configuredPasscode(): string | null {
  const p = process.env.PLAN_PASSCODE?.trim();
  return p ? p : null;
}

export function passcodeMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given.trim()).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
