# FAST_DEV — running Trinity Floor Planner cheaply on a laptop

This app is a **single Next.js process** with no database, no Docker and no
background services. Everything (editor, validation, layout generator, PDF
rendering, exports) runs in the browser. That keeps local CPU low by design.

## Fastest way to start

```bash
npm ci            # first time only (uses package-lock.json exactly)
npm run dev:fast  # Next.js dev server with Turbopack → http://localhost:3000
```

`dev:fast` uses Turbopack (incremental, Rust-based bundler). It starts in a few
seconds and rebuilds only the modules you touch. Use `npm run dev` (webpack) only
if you hit a Turbopack-specific issue.

## Processes

| Process | Required? | Notes |
|---|---|---|
| `next dev` (via `dev` or `dev:fast`) | **Yes** | The only process needed to use and develop the app. |
| `vitest` watch (`npm run test:watch`) | No | Leave off by default. Run `npm test` once before pushing instead. |
| `tsc --noEmit` (`npm run typecheck`) | No | Your editor already typechecks. CI runs it on every push. |
| `next build` | No | Only to reproduce a production issue. CI builds every push. |
| Database / Docker / Supabase | Not used | Projects save to the browser's IndexedDB and export to `.json`. |

## What to skip locally

- **Watch-mode tests.** They re-run on every save; the geometry suites take ~3–5 s.
  Run `npm test` on demand.
- **Production builds.** `next build` is the most CPU-heavy task in this repo
  (typecheck + minification). Let CI do it.
- **Multiple dev servers.** One `next dev` serves everything; close stale ones
  (`npx kill-port 3000` or check Activity Monitor/Task Manager for `node`).

## Run heavy tasks remotely

`.github/workflows/ci.yml` runs **typecheck → unit tests → production build** on
GitHub Actions for every push and pull request, with npm and `.next/cache`
caching. Push your branch and check the Actions tab instead of building locally.
Vercel (if connected) also builds preview deployments remotely.

## Caching that is already set up

| Cache | Where | Effect |
|---|---|---|
| npm download cache | `actions/setup-node` `cache: npm` | CI installs reuse `~/.npm`. Locally, `npm ci --prefer-offline` reuses your global cache. |
| Next.js build cache | `.next/cache` (local) + `actions/cache` (CI) | Incremental rebuilds; CI restores it between runs. |
| TypeScript incremental | `tsBuildInfoFile` → `.next/cache/tsconfig.tsbuildinfo` | Repeat `npm run typecheck` runs are much faster. |
| Turbopack | in-memory during `dev:fast` | Only changed modules are rebuilt. |
| Vitest | `pool: threads`, `isolate: false` | Pure-function suites skip per-file isolation overhead. |

Not used (and why): **Turborepo** — single package, nothing to orchestrate;
**pnpm** — npm with a lockfile is sufficient for one package (switching is
possible but changes the lockfile and CI, so it's left as an explicit decision);
**Docker layer caching** — there is no Dockerfile.

## File-watching hygiene

- Tailwind scans only `src/**/*.{ts,tsx}` (see `tailwind.config.ts`), never
  `node_modules` or `.next`.
- `.next/`, `node_modules/`, `coverage/` are git-ignored; if the repo lives in a
  synced folder (OneDrive/Dropbox/iCloud), exclude those folders from syncing —
  syncing `.next/` during rebuilds causes heavy CPU and file-lock errors.
- The editor renders the grid/background on a separate non-interactive canvas
  layer and validates on a deferred copy of the layout, so dragging stays smooth
  without extra work on every mouse move.

## Clean up

```bash
npm run clean        # removes .next, out, coverage and tool caches
npm run clean -- --all   # also removes node_modules (then run npm ci)
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server (webpack) |
| `npm run dev:fast` | Next.js dev server with Turbopack (recommended) |
| `npm run build` | Production build (typecheck + bundle) |
| `npm start` | Serve the production build |
| `npm test` | Run all unit tests once |
| `npm run test:watch` | Tests in watch mode (opt-in) |
| `npm run typecheck` | `tsc --noEmit` (incremental) |
| `npm run clean` | Delete build output and caches |
