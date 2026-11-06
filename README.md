# Trinity Floor Plan

An interactive, browser-based **office space-planning tool**: import an
architectural PDF, calibrate it, trace or edit rooms/walls/doors, drag and drop
cubicles and furniture, and check — with real geometry — whether a layout
actually fits.

Every room, wall, door, workstation, label and dimension is an independent,
editable object. Nothing is flattened into an image.

> **Planning tool only.** Clearance thresholds are user-configured inputs. Layouts
> are **not** verified for ADA, fire/egress or building-code compliance and are
> not construction-ready. Professional review is required.

## Quick start

```bash
npm ci
npm run dev:fast     # http://localhost:3000
```

See [FAST_DEV.md](FAST_DEV.md) for the low-CPU workflow, caching and CI.

## What it does

| Area | Features |
|---|---|
| **Import** | PDF (multi-page, via PDF.js) or PNG/JPG as a lockable background layer; original bytes kept unmodified; move/rotate/scale/crop; opacity; show/hide. |
| **Calibration** | Click two points on a known dimension, enter the real length. Uncalibrated plans are flagged everywhere (canvas badge, warnings, PDF export). |
| **Editor** | Select, multi-select (shift / box), drag, resize & rotate handles, duplicate, delete, lock, group/ungroup, undo/redo (150 steps), zoom/pan, grid snapping, snap-to-wall/corner, arrow-key nudges. |
| **Live measurements** | Scale bar; live width × depth/rotation tag while dragging or resizing; live distance lines to the nearest wall/furniture on all four sides; wall lengths; room edge lengths; dimension lines attached to room edges follow the geometry. |
| **Drawing tools** | Walls, rooms (polygons, any shape incl. angled), doors (snap to walls, flip swing/hinge), walking-aisle zones, text labels with callouts, dimension lines, two-point measure tool. |
| **Properties panel** | Every object: name, exact dimensions (type `4'-6"`, `4.5ft`, `54"`, `1.37m`), rotation, color, notes. Cubicles: assigned employee(s), department, desk type, partition height, equipment list. Rooms: type, per-edge lengths, area, verified flag, targets, label style. |
| **Dimension modes** | *Change geometry* (resizes the actual object) vs. *Change label only* (marked `*` and listed as a warning so the drawing can't silently mislead). |
| **Library** | 4×4, 4×5, 5×5, 6×6 cubicles; single, shared 2-person, bench 4/6, L-desks; chairs; conference tables; storage/filing cabinets; shelving; printers; partitions; plants; custom sizes; save your own templates. |
| **Validation** | SAT collision detection, wall intersections, door-swing obstructions, room-boundary checks, explicit aisle zones, ray-cast aisle/chair clearance per workstation, grid flood-fill path-to-doorway check, label-override and calibration warnings. Conflicting objects turn red. |
| **Generate Layout Options** | For an existing room (any shape/angle, real walls & doors) or custom W×L / L-shape: Comfort, Balanced, Maximum Density, Shared Workstations. Each candidate is placed then pruned by the validator — capacity comes from geometry, never area ÷ seat. Shows workstations, seats, desk size, aisle widths, occupied/remaining area, conflicts, door obstructions and assumptions. |
| **Capacity dashboard** | Planning inputs vs. current geometry (192 / 168 / 360 sq ft, 6–8 targets), feasible seats, assigned/unassigned, occupied/remaining, minimum measured aisle, conflicts. |
| **Scenarios** | Five starter layouts (6/area, 8/area, shared desks, max density, future expansion); duplicate/rename/delete; fully independent; side-by-side comparison table with thumbnails. |
| **Views** | 2D architectural (dimensioned, grid, red annotations) and Presentation (furnished, filled rooms) — same data. |
| **Save / export** | Autosave + manual save (IndexedDB), editable `.json` project import/export (optionally embedding the PDF), high-res PNG, SVG, PDF with title block/legend/areas/seat counts/version/date, print-to-scale (1/8", 3/16", 1/4", 1/2" = 1'-0") with scale bar once calibrated. |

## Cubicle walls tab and the inventory

The tabs above the plan switch between **Floor plan** (whole cubicles, as laid out) and
**Cubicle walls**: a layout of its own where the floor plan's cubicles become loose cube walls -
long 4' walls in blue, short 2' walls in amber - laid once where two cubicles share a side and
left out where a building wall already stands. Only Area A and Area B are shown, as two sections.
Walls can be moved, turned, deleted or added from **Library -> Cube walls**; the bar shows
*placed / owned* for long and short walls, and **Lay walls out again from the floor plan** (in the
inventory card) starts the walls over. The **Furniture inventory** card lists what the office owns.

## The starter layout (traced from Floor_Plan.pdf)

The bundled plan is traced from **Floor_Plan.pdf** (page 2, clean copy; page 1
has the same base drawing with hand notes). The scale comes from the plan's own
dimension marks (24' conference room, 12' to the conference room, 16' cube
area); traced positions are accurate to roughly ±6".

The PDF shows the suite turned about 40.7°. In the app the **Juliette Lane
window wall runs along the bottom** so walls line up with the snapping grid; the
layout itself is unchanged. To check it against the drawing: **Import PDF →
Floor_Plan.pdf → Layers tab → "Align to traced plan"**. This places the PDF
exactly under the traced walls and marks it calibrated.

| Space | As traced | Status |
|---|---|---|
| Conference Room | 24' × 14' clear, on the window wall 12' from the left corner, 2 doors | **Contractor-fixed** |
| Office 1 | Right triangle by the main entry, labelled 15' × 12': door wall runs straight up to the main entry (13' measured, bottom wall then pushed 3' toward the window wall), level bottom wall out to the angled wall | **Contractor-fixed** |
| Office 2 | 17' clear along the window wall at the far tip, 12' deep; its top wall (with the door) runs straight out to the angled wall, in line with Offices 3 and 4 | **Contractor-fixed** |
| Office 3 | 12' × 12' clear on the window wall | **Contractor-fixed** |
| Office 4 | 12' × 12' clear on the window wall, next to the conference room; top wall in line with Office 3's | **Contractor-fixed** |
| IT / Storage ("Stor") | 8'-6" along the top wall × 12' deep, right after Cubicle Area A | Existing |
| Walkway | 5'-0" from the conference room to Cubicle Area A (marked walking aisle) | Planned |
| Kitchen | Top-left corner, 10'-3" wide × 11'-8" deep along the left wall; its right wall (with the door) is 9'-6" up to the angled corner wall; sink + refrigerator | Walls planned |
| Area A (cubicles) | 16' × 12' between the corridor-door wall and IT / Storage, right after the 5' walkway (2'-8" spare behind it) ("12x16", 6–8) | Zone in the open area |
| Area B (cubicles) | 12' × 22' from the window wall up to the kitchenette wall, between the left wall and the conference room ("22x12") | Zone in the open area |
| Doors | Main entry (pair of 3' leaves) at the top of the 45° wall; second suite door at the corridor jog | As drawn |
| Dedicated tenant HVAC | One unit by the window wall in Cubicle Area B | Existing, locked |

Contractor-fixed rooms, walls and doors start **locked** and are tagged
*Contractor-fixed*; unlocking one asks for confirmation, and the properties panel
shows a banner while it is unlocked. All five starter layouts begin as the plan
exactly as drawn, with the cubicle areas empty.

## Keyboard

`V` select · `H` pan · `M` measure · `W` wall · `R` room (or rotate selection 90°) · `D` door · `A` aisle · `T` text · `L` dimension ·
`Ctrl+Z / Ctrl+Shift+Z` undo/redo · `Ctrl+D` duplicate · `Ctrl+G / Ctrl+Shift+G` group/ungroup · `Del` delete · arrows nudge (Shift = 1 ft) · `Ctrl+S` save · drag empty space (or `Space`+drag) to pan · `Shift`+drag to box-select · scroll to zoom · `Shift`+scroll or trackpad swipe to scroll sideways.

## Architecture

```
src/
  types/plan.ts           strongly-typed data model (all lengths in inches)
  lib/geometry.ts         vectors, rotated rects, SAT overlap, polygons, rays
  lib/validation.ts       collisions, clearances, door swings, circulation
  lib/generator.ts        layout option generator (geometry + validator pruning)
  lib/capacity.ts         dashboard metrics
  lib/svgRender.ts        pure SVG renderer (exports, thumbnails, previews)
  lib/exporters.ts        PNG / SVG / PDF (jsPDF), print-to-scale
  lib/pdfImport.ts        PDF.js import, page switching, calibration
  lib/persistence.ts      IndexedDB autosave, JSON import/export + validation
  lib/sampleProject.ts    starter suite + scenarios
  store/usePlanStore.ts   Zustand store, undo/redo, scenarios
  components/canvas/      react-konva editor
  components/…            toolbar, sidebars, properties, dashboard, dialogs (shadcn-style UI)
tests/                    vitest: geometry, units, validation, generator, persistence/store
```

Stack: Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS ·
shadcn/ui-style components (Radix) · react-konva · Zustand · PDF.js · jsPDF · Vitest.

Supabase is not wired in yet. Persistence goes through `src/lib/persistence.ts`, so a cloud backend can be added there without touching the editor.
