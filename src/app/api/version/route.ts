// Which build is deployed right now. Open tabs compare this with the build they were loaded
// from, and reload into the new version when someone comes back to the tab.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } });
}
