// Online saving: GET the shared plan, PUT a new version. Every request needs the team passcode
// (PLAN_PASSCODE) in the x-plan-passcode header. A PUT names the version it replaces; if the plan
// was saved from somewhere else meanwhile, it is refused (409) and the newer plan is returned.

import { configuredPasscode, passcodeMatches, planStore } from '@/lib/cloudStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 4_000_000; // Vercel functions accept bodies up to ~4.5 MB
const noStore = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

async function gate(req: Request) {
  const expected = configuredPasscode();
  const store = planStore();
  if (!expected || !store) {
    // Say which setting is missing (never its value) so setup problems are easy to spot.
    const missing = [...(expected ? [] : ['PLAN_PASSCODE']), ...(store ? [] : ['Blob store (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID)'])];
    return { error: json({ error: 'not-configured', missing }, 503) };
  }
  if (!passcodeMatches(req.headers.get('x-plan-passcode'), expected)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { error: json({ error: 'wrong-passcode' }, 401) };
  }
  return { store };
}

export async function GET(req: Request) {
  const g = await gate(req);
  if ('error' in g) return g.error;
  try {
    if (new URL(req.url).searchParams.has('version')) return json({ etag: await g.store.version() });
    const cur = await g.store.read();
    return json(cur ? { plan: cur.text, etag: cur.etag } : { plan: null, etag: null });
  } catch {
    return json({ error: 'storage-unavailable' }, 502);
  }
}

export async function PUT(req: Request) {
  const g = await gate(req);
  if ('error' in g) return g.error;
  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ error: 'too-large' }, 413);
  let body: { plan?: unknown; etag?: unknown; force?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  if (typeof body.plan !== 'string') return json({ error: 'bad-request' }, 400);
  try {
    JSON.parse(body.plan);
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  try {
    const r = await g.store.write(body.plan, typeof body.etag === 'string' ? body.etag : null, body.force === true);
    if (r.ok) return json({ etag: r.etag });
    const cur = await g.store.read();
    return json({ error: 'conflict', plan: cur?.text ?? null, etag: cur?.etag ?? null }, 409);
  } catch {
    return json({ error: 'storage-unavailable' }, 502);
  }
}
