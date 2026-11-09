// Browser side of online saving: talks to /api/plan with the team passcode, which is remembered
// in this browser (localStorage) once entered.

const PASS_KEY = 'trinity-plan-passcode';
const SYNC_KEY = 'trinity-plan-online-synced';

const ls = {
  get(k: string): string | null {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v == null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch {
      /* storage blocked: online saving still works for this visit */
    }
  },
};

export const savedPasscode = () => ls.get(PASS_KEY);
export const rememberPasscode = (p: string | null) => ls.set(PASS_KEY, p);

/** What this browser last synced with the online plan: its version tag and a fingerprint of the plan. */
export interface SyncMark {
  etag: string;
  fp: string;
}
export function lastSync(): SyncMark | null {
  const raw = ls.get(SYNC_KEY);
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as SyncMark;
    return typeof m.etag === 'string' && typeof m.fp === 'string' ? m : null;
  } catch {
    return null;
  }
}
export const markSynced = (m: SyncMark | null) => ls.set(SYNC_KEY, m ? JSON.stringify(m) : null);

export type CloudError = 'not-configured' | 'wrong-passcode' | 'offline' | 'too-large' | 'error';
export type GetResult = { ok: true; plan: string | null; etag: string | null } | { ok: false; error: CloudError };
export type PutResult = { ok: true; etag: string } | { ok: false; error: 'conflict'; plan: string | null; etag: string | null } | { ok: false; error: CloudError };

async function call(passcode: string, init?: RequestInit, query = ''): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    const res = await fetch(`/api/plan${query}`, { ...init, cache: 'no-store', headers: { 'x-plan-passcode': passcode, 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  } catch {
    return null;
  }
}

function errorOf(r: { status: number; body: Record<string, unknown> } | null): CloudError {
  if (!r) return 'offline';
  if (r.status === 401) return 'wrong-passcode';
  if (r.status === 503) return 'not-configured';
  if (r.status === 413) return 'too-large';
  return 'error';
}

export async function cloudGet(passcode: string): Promise<GetResult> {
  const r = await call(passcode);
  if (r?.status === 200) return { ok: true, plan: (r.body.plan as string | null) ?? null, etag: (r.body.etag as string | null) ?? null };
  return { ok: false, error: errorOf(r) };
}

export async function cloudVersion(passcode: string): Promise<{ ok: true; etag: string | null } | { ok: false; error: CloudError }> {
  const r = await call(passcode, undefined, '?version');
  if (r?.status === 200) return { ok: true, etag: (r.body.etag as string | null) ?? null };
  return { ok: false, error: errorOf(r) };
}

export async function cloudPut(passcode: string, plan: string, etag: string | null, force = false): Promise<PutResult> {
  const r = await call(passcode, { method: 'PUT', body: JSON.stringify({ plan, etag, force }) });
  if (r?.status === 200) return { ok: true, etag: r.body.etag as string };
  if (r?.status === 409) return { ok: false, error: 'conflict', plan: (r.body.plan as string | null) ?? null, etag: (r.body.etag as string | null) ?? null };
  return { ok: false, error: errorOf(r) };
}

export type ConnectDecision = 'upload' | 'adopt' | 'in-sync' | 'choose';

/**
 * What to do when this browser connects to the online plan:
 * - nothing online yet: put this browser's plan online;
 * - online plan unchanged since this browser last synced: upload local edits, if any;
 * - online plan changed elsewhere and nothing changed here since the last sync (or this browser
 *   only has the untouched starter plan): load the online plan;
 * - both changed (or never synced and they differ): the user chooses.
 */
export function decideOnConnect(o: { cloudPlanFp: string | null; cloudEtag: string | null; mark: SyncMark | null; localFp: string; localIsStarter: boolean }): ConnectDecision {
  if (!o.cloudPlanFp) return 'upload';
  if (o.localFp === o.cloudPlanFp) return 'in-sync';
  if (o.mark && o.mark.etag === o.cloudEtag) return o.localFp === o.mark.fp ? 'in-sync' : 'upload';
  if (o.mark && o.localFp === o.mark.fp) return 'adopt';
  if (!o.mark && o.localIsStarter) return 'adopt';
  return 'choose';
}
