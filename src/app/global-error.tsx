'use client';

import { useEffect } from 'react';
import { isStaleAssetError, reloadOnce } from '@/lib/freshVersion';

// Last-resort screen if even the page shell fails (replaces Next.js's blank "Application error").
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (isStaleAssetError(error)) reloadOnce('stale-assets');
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#334155' }}>
        <p style={{ fontWeight: 600, color: '#14213d' }}>The floor planner needs a reload.</p>
        <button style={{ background: '#14213d', color: '#fff', border: 0, borderRadius: 6, padding: '6px 12px' }} onClick={() => window.location.reload()}>
          Reload
        </button>
      </body>
    </html>
  );
}
