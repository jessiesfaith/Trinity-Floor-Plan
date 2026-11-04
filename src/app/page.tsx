'use client';

import dynamic from 'next/dynamic';

// The editor relies on canvas/window APIs (Konva, PDF.js, IndexedDB), so it is
// rendered client-side only.
const Planner = dynamic(() => import('@/components/Planner'), {
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center text-sm text-slate-500">Loading floor planner…</div>,
});

export default function Page() {
  return <Planner />;
}
