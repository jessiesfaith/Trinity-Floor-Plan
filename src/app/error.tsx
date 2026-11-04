'use client';

import { useEffect } from 'react';
import { isStaleAssetError, reloadOnce } from '@/lib/freshVersion';

// Shown instead of a blank "Application error" page if the planner fails to load.
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleAssetError(error);
  useEffect(() => {
    if (stale) reloadOnce('stale-assets');
  }, [stale]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-600">
      <p className="text-base font-semibold text-navy">{stale ? 'Loading the latest version…' : 'Something went wrong loading the floor planner.'}</p>
      {!stale && <p>Your saved plan is kept in this browser. Reloading usually fixes this.</p>}
      <div className="flex gap-2">
        <button className="rounded bg-navy px-3 py-1.5 text-white" onClick={() => window.location.reload()}>
          Reload
        </button>
        {!stale && (
          <button className="rounded border border-slate-300 px-3 py-1.5" onClick={() => reset()}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
