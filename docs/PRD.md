# Trinity Floor Plan — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Trinity Floor Plan (interactive office space planner) |
| **Owner** | Jessica Dougherty |
| **Repo** | `jessiesfaith/trinity-floor-plan` (public) |
| **Live site** | Vercel project linked to `main` (target address: `trinity-floorplan.vercel.app`) |
| **Status** | v0.1 built and deployed; PRD written after the first build to record intent and open questions |
| **Last updated** | 2026-11-04 |
| **Source document** | `reference/Floor_Plan.pdf`. Local only, never committed, because the repo is public |

---

## 1. Background

Trinity is moving into an office suite on Juliette Lane. The only source document is
`Floor_Plan.pdf`. It is a two-page marketing and leasing plan of the suite, shown rotated about
40° on the page, with a key-plan inset showing where the suite sits in the building:

- **Page 2** is the clean base drawing with red dimension marks: conference room 24' × 14',
  12' from the left corner to the conference room, a 22' left wall, and a 16' × 12' open area
  along the top wall.
- **Page 1** is the same drawing with hand-written planning notes. These include room
  numbers 1–4 on the offices, a "13×15" note on Office 1, "10–12 Cubes / 12×16" with "(6–8)" on
  the top open area, a "22×12" note on the left open area, and a margin question: *"1–4 offices —
  how big should conference room be."*
- The leasing feature list reads: 1 Conference Room · 2 Private Offices · Kitchenette · Open
  Area · Market Ready · IT/Storage Room · Dedicated Tenant HVAC.

A static PDF can't answer the planning questions: how many people fit, where they sit, whether
aisles and door swings stay clear, and how different options compare. This product turns the
plan into an editable, measurable model so those questions can be answered with real geometry
instead of guesswork.

## 2. Goals

1. **Faithful digital twin of the suite.** The starter plan is traced from `Floor_Plan.pdf` to
   about ±6", and the PDF can be overlaid under it to check the trace.
2. **Answer "how many people fit, and how."** Capacity comes from validated geometry
   (collisions, clearances, path to a door), never from area ÷ seats.
3. **Compare options side by side.** Up to five independent scenarios with a comparison table.
4. **Shareable output.** PNG, SVG, PDF (with title block and scale) and JSON for the landlord,
   contractor and team.
5. **Fast, low-friction iteration.** Edit in the browser, publish by pushing to `main`, and run
   locally with a low-CPU dev workflow (`FAST_DEV.md`).

### Non-goals

- **Not** a code-compliance tool. Clearance thresholds are user-set planning inputs. Layouts
  are **not** verified for ADA, fire/egress or building code, and are not construction-ready.
- **Not** CAD. No construction documents, MEP or structural detail.
- **No layout or furniture recommendations in this document.** Layout decisions are the
  owner's and are made in the app's scenarios.
- No multi-user or cloud sync yet (see §9).

## 3. Users

| User | Needs |
|---|---|
| **Owner / planner** (Jessica) | Build and compare seating scenarios, assign people, export for decisions |
| **Contractor / landlord** | Clear, dimensioned drawings where fixed rooms are unambiguous |
| **Team members** (viewers) | See where they sit; presentation view and exports |

## 4. Fixed constraints from the floor plan

These come from the PDF and are treated as facts. In the app they are **locked** and tagged
**Contractor-fixed**. Unlocking one requires confirmation and shows a warning banner.

| Space | Constraint | Source |
|---|---|---|
| Conference Room | 24' × 14' clear, on the window (Juliette Lane) wall, 12' from the left corner, 2 doors | Red marks, both pages |
| Office 1 | Triangular office on the 45° wall ("13×15" note) | Page 1 markup |
| Office 2 | Window wall at the far tip, angled corridor wall | Base drawing |
| Office 3 | About 12' × 11'-9" on the window wall | Traced |
| Office 4 | About 11' × 11'-9" on the window wall, next to the conference room | Traced |

**Existing (not fixed, but present):** IT/Storage room (~8' × 10'), kitchenette (top-left;
sink and refrigerator), four tenant HVAC units on the window wall (locked), main entry (pair of
3' leaves) at the top of the 45° wall, and a second suite door at the corridor jog.

**Open planning areas (zones, not rooms):** Cubicle Area A, 16' × 12' along the top wall
(target 6–8), and Cubicle Area B, between the left wall and the conference room (target 6–8).

**Requirement:** none of the contractor-fixed geometry may change in any scenario unless the
owner explicitly unlocks it. Tests (`tests/tracedPlan.test.ts`) guard the traced dimensions.

## 5. Functional requirements

Status key: ✅ built in v0.1 · 🔲 not yet built.

### 5.1 Import and calibration
- ✅ Import a PDF (multi-page) or PNG/JPG as a lockable background layer, keeping the original bytes.
- ✅ Move, rotate, scale, crop, set opacity and show/hide the background.
- ✅ Two-point calibration against a known dimension. Uncalibrated plans are flagged
  everywhere (canvas badge, warnings, PDF export).
- ✅ "Align to traced plan" (Layers tab) places `Floor_Plan.pdf` exactly under the traced walls
  and marks it calibrated.

### 5.2 Editing
- ✅ Every room, wall, door, workstation, label and dimension is an independent object.
- ✅ Select, multi-select, drag, resize, rotate, duplicate, delete, lock, group, and undo/redo
  (150 steps).
- ✅ Zoom and pan, grid snapping (default 6"), snap to wall and corner, arrow-key nudge.
- ✅ Drawing tools: walls, polygon rooms (including angled), doors (swing and hinge flip),
  aisle zones, text and callouts, dimension lines, measure tool.
- ✅ Properties panel with exact length entry (`4'-6"`, `4.5ft`, `54"`, `1.37m`).
- ✅ Dimension modes: *change geometry* or *label only*. Label overrides are marked `*` and
  raise a warning.

### 5.3 Live measurement
- ✅ Scale bar, live W × D and rotation while dragging, live distances to the nearest
  wall or furniture on four sides, wall and room edge lengths, and dimensions that follow geometry.

### 5.4 Library
- ✅ Cubicles (4×4, 4×5, 5×5, 6×6), desks (single, shared, bench 4/6, L), chairs, conference
  tables, storage, shelving, printers, partitions, plants, custom sizes, saved templates.

### 5.5 Validation (geometry-based)
- ✅ SAT collision detection, wall intersections, door-swing obstructions, room boundaries.
- ✅ Aisle zones, plus ray-cast aisle and chair clearance per workstation.
- ✅ Path-to-doorway check (grid flood fill).
- ✅ Conflicting objects turn red, with warnings for label overrides and calibration.
- Default thresholds (user-editable): minimum aisle 48", chair clearance 36", door clearance 36".

### 5.6 Layout options generator
- ✅ For an existing room or a custom W×L or L-shape, generates Comfort, Balanced, Maximum
  Density and Shared Workstations candidates. Each candidate is placed, then pruned by the
  validator.
- ✅ Shows workstations, seats, desk size, aisle widths, occupied/remaining area, conflicts,
  door obstructions and assumptions.
- The generator only *proposes*. Nothing is applied to a scenario without the user choosing it.

### 5.7 Capacity dashboard
- ✅ Planning inputs vs. current geometry (192 / 168 / 360 sq ft; 6–8 targets per area),
  feasible seats, assigned/unassigned people, occupied/remaining area, minimum measured aisle,
  conflict count.

### 5.8 Scenarios
- ✅ Five starter scenarios (Six per Area, Eight per Area, Shared Desks, Maximum Seating, Future
  Expansion). All start as the plan exactly as drawn, with cubicle areas empty.
- ✅ Duplicate, rename and delete; fully independent; side-by-side comparison with thumbnails.

### 5.9 Views, save and export
- ✅ 2D architectural view and Presentation view (same data).
- ✅ Autosave and manual save to the browser's local storage (IndexedDB).
- ✅ JSON project import/export (optionally embedding the PDF), PNG, SVG, PDF with title block,
  legend, areas, seat counts, version and date.
- ✅ Print to scale (1/8", 3/16", 1/4", 1/2" = 1'-0") once calibrated.

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| **Accuracy** | Model stored in inches. Trace within ±6" of the PDF. Fixed-room dimensions covered by tests. |
| **Privacy** | Repo is public: `Floor_Plan.pdf` and other originals stay in the git-ignored `reference/` folder. No employee names in committed sample data. Projects are saved only in the user's browser. |
| **Quality gate** | `npm run typecheck`, `npm test` (34 tests at v0.1) and `npm run build` must pass before pushing to `main`. CI runs on GitHub Actions. |
| **Performance** | Smooth dragging on a typical laptop. Low-CPU dev via `npm run dev:fast` (see `FAST_DEV.md`). |
| **Browser** | Current Chrome and Edge on Windows (primary), and Safari and Firefox. |
| **Disclaimer** | "Planning tool only, not code-verified" shown in the app and on PDF exports. |

## 7. Release and workflow

1. Work locally in `C:\dev\Trinity-Floor plan` (a clone of the repo) through a Local Claude Code session.
2. Run `npm run dev:fast` and review at `http://localhost:3000`.
3. Commit, then push to `main`. Vercel builds and publishes automatically (`vercel.json`
   pins the Next.js framework). Other branches get preview URLs.
4. Use only the GitHub account **jessiesfaith**.

## 8. Success measures

- The owner can produce a comparable set of scenarios and export them for a decision without
  touching the source PDF.
- Every seat count shown is backed by zero validation conflicts.
- Contractor-fixed rooms are byte-for-byte unchanged across all scenarios unless explicitly unlocked.

## 9. Open questions (for the owner)

These come from the PDF and the build. They are questions, not recommendations.

1. **Conference room size.** The page 1 margin note asks *"how big should conference room be."*
   The app treats 24' × 14' as contractor-fixed. Is that final?
2. **Office count.** The leasing list says *2 private offices*, but the plan shows four
   (numbered 1–4). Is it four?
3. **Left open area dimensions.** Page 1 notes "22×12" for the area left of the conference room;
   the app's Cubicle Area B zone is 12' × 14'. Which dimension is right?
4. **Top open area target.** Page 1 says "10–12 Cubes" and separately "(6–8)" for the 12' × 16' area.
   Which target should the dashboard use? It currently uses 6–8.
5. **Hand-written initials** on the offices on page 1 are not used in the app. Should offices be
   assigned to people, and should names be kept out of the public repo?
6. **Persistence.** Should projects stay in the browser only, or move to a cloud backend (for
   example Supabase) so they can be shared across devices?
7. **Access.** Should the live site be public, or behind a login like the Fast Insights Gantt?

## 10. Glossary

- **Contractor-fixed:** geometry set by the build-out that the planner must not change.
- **Zone:** a planning area inside the open space (not a walled room).
- **Scenario:** an independent copy of the plan with its own furniture and assignments.
- **Calibration:** mapping drawing units to real-world length using a known dimension.
