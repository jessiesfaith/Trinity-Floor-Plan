// Keep open tabs on the newest deployment.
//
// 1. When a tab becomes visible or gets focus again, ask /api/version which build is live. If it
//    differs from the build this page was loaded from, save the plan and reload into it.
// 2. If the page can't load one of its own script files (an old cached page whose files were
//    replaced by a newer deploy), reload once instead of showing an error.

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

const RELOAD_KEY = 'trinity-reloaded-for';

/** Reload at most once per target (so a lagging cache can't cause a reload loop). */
export function reloadOnce(target: string): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === target) return false;
    sessionStorage.setItem(RELOAD_KEY, target);
  } catch {
    /* private mode: still reload once */
  }
  window.location.reload();
  return true;
}

/** True for the errors browsers raise when a page's script file is gone. */
export function isStaleAssetError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ''} ${e?.message ?? String(err ?? '')}`;
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text);
}

/** Ask the server which build is live; null when unknown (offline, dev). */
export async function liveBuild(): Promise<string | null> {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    if (!r.ok) return null;
    const { build } = (await r.json()) as { build?: string };
    return build && build !== 'dev' ? build : null;
  } catch {
    return null;
  }
}
