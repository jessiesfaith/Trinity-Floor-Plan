'use client';

// Interactive 2D editor built on react-konva.
// Coordinates: the Stage is scaled so that 1 unit = 1 plan inch.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Arc, Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Aisle, Dimension, Door, Furniture, LayerId, PlanObject, Pt, Room, TextLabel, Wall } from '@/types/plan';
import { activeScenario, usePlanStore } from '@/store/usePlanStore';
import { add, bbox, centroid, closestPointOnSegment, dist, norm, rayPolygon, rotatePt, scale as vscale, snap, sub, distPointSegment } from '@/lib/geometry';
import { anchorOf, footprint, makeAisle, makeDimension, makeDoor, makeLabel, makeRoom, makeWall, roomArea, translateObject, wallPolygon } from '@/lib/objects';
import { formatArea, formatLength } from '@/lib/units';
import { contentBounds, dimensionGeometry } from '@/lib/svgRender';
import type { ValidationResult } from '@/lib/validation';
import { drawFurniture } from './drawFurniture';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { faceObjects, facingOf, rotateObjects, type Facing } from '@/lib/orientation';

const TEAL = '#0f9d9a';
const RED = '#d62828';
const NAVY = '#14213d';

interface Props {
  validation: ValidationResult;
  onDropTemplate?: (templateId: string, p: Pt) => void;
  /** Receives a function returning the plan-space point at the center of the visible canvas. */
  registerViewCenter?: (fn: () => Pt) => void;
}

function useImage(src: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return setImg(null);
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
    return () => {
      i.onload = null;
    };
  }, [src]);
  return img;
}

export default function PlanCanvas({ validation, onDropTemplate, registerViewCenter }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setViewState] = useState({ x: 40, y: 40, k: 1 });
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [measure, setMeasure] = useState<{ a: Pt; b: Pt } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: 'room' | 'label' } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  /** Live geometry of the furniture/aisle being dragged or resized (before it is committed). */
  const [live, setLive] = useState<(Furniture | Aisle) | null>(null);
  const dragStart = useRef<{ id: string; start: Map<string, Pt> } | null>(null);
  const panStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  /** Set once a pan drag moves past a few pixels, so releasing it doesn't count as a click. */
  const panMoved = useRef(false);

  const project = usePlanStore((s) => s.project);
  const selectedIds = usePlanStore((s) => s.selectedIds);
  const tool = usePlanStore((s) => s.tool);
  const viewMode = usePlanStore((s) => s.view);
  const fitNonce = usePlanStore((s) => s.fitNonce);
  const store = usePlanStore;

  const scenario = activeScenario(project);
  const objects = scenario.objects;
  const settings = project.settings;
  const bg = project.background;
  const bgImg = useImage(bg?.imageDataUrl);
  const pres = viewMode === 'presentation';
  const layerOf = useCallback((id: LayerId) => project.layers.find((l) => l.id === id)!, [project.layers]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ---- Resize + fit
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Never 0 x 0: Konva throws when it draws a zero-sized canvas (e.g. a narrow phone screen).
    const measure = () => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const b = contentBounds(objects, bg?.visible ? bg : undefined);
    const pad = 40;
    const k = Math.min((size.w - pad * 2) / Math.max(1, b.width), (size.h - pad * 2) / Math.max(1, b.height));
    setViewState({ k, x: pad - b.minX * k + (size.w - pad * 2 - b.width * k) / 2, y: pad - b.minY * k + (size.h - pad * 2 - b.height * k) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, scenario.id, bg?.imageDataUrl]);

  useEffect(() => {
    if (size.w > 100) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce, size.w > 100]);

  useEffect(() => {
    registerViewCenter?.(() => ({ x: (size.w / 2 - view.x) / view.k, y: (size.h / 2 - view.y) / view.k }));
  }, [registerViewCenter, size, view]);

  const zoomBy = (factor: number, center?: Pt) => {
    const c = center ?? { x: size.w / 2, y: size.h / 2 };
    setViewState((v) => {
      const k = Math.min(40, Math.max(0.05, v.k * factor));
      const wx = (c.x - v.x) / v.k;
      const wy = (c.y - v.y) / v.k;
      return { k, x: c.x - wx * k, y: c.y - wy * k };
    });
  };

  // ---- Pointer helpers
  const pointer = (): Pt | null => {
    const p = stageRef.current?.getPointerPosition();
    if (!p) return null;
    return { x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k };
  };

  /** Snap to geometry (vertices, wall/room edges), then grid. */
  const snapPoint = useCallback(
    (p: Pt, opts: { geometry?: boolean } = { geometry: true }): Pt => {
      const thr = 10 / view.k;
      if (opts.geometry) {
        let best: Pt | null = null;
        let bd = thr;
        for (const o of objects) {
          const verts = o.kind === 'room' ? o.points : o.kind === 'wall' ? [o.a, o.b] : o.kind === 'furniture' ? footprint(o) : [];
          for (const v of verts) {
            const d = dist(p, v);
            if (d < bd) {
              bd = d;
              best = v;
            }
          }
        }
        if (best) return best;
        bd = thr;
        for (const o of objects) {
          const segs: [Pt, Pt][] = [];
          if (o.kind === 'room') o.points.forEach((a, i) => segs.push([a, o.points[(i + 1) % o.points.length]]));
          if (o.kind === 'wall') {
            const q = wallPolygon(o);
            segs.push([q[0], q[1]], [q[2], q[3]]);
          }
          if (o.kind === 'furniture') {
            const q = footprint(o);
            q.forEach((a, i) => segs.push([a, q[(i + 1) % 4]]));
          }
          for (const [a, b] of segs) {
            const c = closestPointOnSegment(p, a, b);
            const d = dist(p, c);
            if (d < bd) {
              bd = d;
              best = c;
            }
          }
        }
        if (best) return best;
      }
      if (settings.snapToGrid) return { x: snap(p.x, settings.gridSize), y: snap(p.y, settings.gridSize) };
      return p;
    },
    [objects, settings.snapToGrid, settings.gridSize, view.k],
  );

  const canEdit = (o: PlanObject) => {
    const l = o.kind === 'room' ? 'rooms' : o.kind === 'wall' ? 'walls' : o.kind === 'door' ? 'doors' : o.kind === 'furniture' ? 'furniture' : o.kind === 'aisle' ? 'aisles' : 'annotations';
    return !o.locked && !layerOf(l).locked && tool === 'select';
  };

  // End a pan even if the mouse is released outside the canvas.
  useEffect(() => {
    const up = () => (panStart.current = null);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // ---- Keyboard: space-pan, escape
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (e.code === 'Space') setSpaceDown(true);
      if (e.key === 'Escape') {
        if (draft.length >= 3 && tool === 'room') finishRoom();
        setDraft([]);
        setMeasure(null);
        store.getState().setTool('select');
      }
      if (e.key === 'Enter' && tool === 'room' && draft.length >= 3) finishRoom();
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, tool]);

  useEffect(() => {
    setDraft([]);
    if (tool !== 'measure') setMeasure(null);
  }, [tool]);

  const finishRoom = () => {
    if (draft.length < 3) return;
    const n = objects.filter((o) => o.kind === 'room').length + 1;
    const r = makeRoom(`Room ${n}`, 'other', draft, '#eef2f7');
    store.getState().addObjects([r]);
    setDraft([]);
    store.getState().setTool('select');
  };

  // ---- Transformer binding
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selectedIds
      .map((id) => objects.find((o) => o.id === id))
      .filter((o): o is Furniture | Aisle | TextLabel => !!o && (o.kind === 'furniture' || o.kind === 'aisle' || o.kind === 'label') && canEdit(o))
      .map((o) => stage.findOne(`#${o.id}`))
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, objects, tool, project.layers]);

  // ---- Stage events
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const { deltaX, deltaY, shiftKey, ctrlKey, metaKey } = e.evt;
    // Horizontal trackpad swipe or Shift+wheel scrolls the view sideways.
    if (!ctrlKey && !metaKey && (shiftKey || Math.abs(deltaX) > Math.abs(deltaY))) {
      const dx = shiftKey && deltaX === 0 ? deltaY : deltaX;
      const dy = shiftKey ? 0 : deltaY;
      setViewState((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      return;
    }
    const p = stageRef.current?.getPointerPosition();
    zoomBy(deltaY > 0 ? 1 / 1.12 : 1.12, p ?? undefined);
  };

  const isBackground = (e: KonvaEventObject<MouseEvent>) => {
    const t = e.target;
    return t === t.getStage() || t.name() === 'bg' || t.name() === 'grid';
  };

  /** True when the pressed node (or an ancestor) handles its own drag: draggable objects, vertex handles, transformer anchors. */
  const grabsDrag = (n: Konva.Node | null) => {
    for (let x = n; x && x !== x.getStage(); x = x.getParent()) {
      if (x.draggable() || x.getClassName() === 'Transformer') return true;
    }
    return false;
  };

  const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    panMoved.current = false;
    const p = pointer();
    if (!p) return;
    const middle = e.evt.button === 1;
    if (tool === 'pan' || spaceDown || middle) {
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (tool === 'select' && isBackground(e) && e.evt.shiftKey) {
      // Shift+drag on empty space box-selects.
      setMarquee({ a: p, b: p });
      return;
    }
    if (tool === 'select' && e.evt.button === 0 && !grabsDrag(e.target)) {
      // A plain drag on empty space or on anything that can't itself be dragged pans the view.
      if (isBackground(e)) store.getState().select([]);
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (tool === 'aisle') {
      setMarquee({ a: snapPoint(p, { geometry: false }), b: snapPoint(p, { geometry: false }) });
    }
  };

  // ---- Touch: one finger drags the view (unless it grabs something draggable), two fingers pinch-zoom.
  const pinch = useRef<{ d: number; k: number } | null>(null);
  const touchPair = (t: TouchList) => {
    const rect = stageRef.current!.container().getBoundingClientRect();
    const a = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
    const b = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
    return { d: dist(a, b), c: vscale(add(a, b), 0.5) };
  };
  const onTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length === 2) {
      panStart.current = null;
      pinch.current = { d: touchPair(t).d, k: view.k };
    } else if (t.length === 1 && (tool === 'select' || tool === 'pan') && !grabsDrag(e.target)) {
      if (isBackground(e as unknown as KonvaEventObject<MouseEvent>)) store.getState().select([]);
      panStart.current = { x: t[0].clientX, y: t[0].clientY, vx: view.x, vy: view.y };
    }
  };
  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (pinch.current && t.length === 2) {
      e.evt.preventDefault();
      const { d, c } = touchPair(t);
      const target = Math.min(40, Math.max(0.05, pinch.current.k * (d / Math.max(1, pinch.current.d))));
      zoomBy(target / view.k, c);
    } else if (panStart.current && t.length === 1) {
      e.evt.preventDefault();
      const s = panStart.current;
      setViewState((v) => ({ ...v, x: s.vx + (t[0].clientX - s.x), y: s.vy + (t[0].clientY - s.y) }));
    }
  };
  const onTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) pinch.current = null;
    if (e.evt.touches.length === 0) panStart.current = null;
  };

  const onMouseMove = () => {
    const p = pointer();
    if (!p) return;
    if (panStart.current) {
      const s = stageRef.current!.getPointerPosition()!;
      const rect = stageRef.current!.container().getBoundingClientRect();
      if (Math.hypot(s.x + rect.left - panStart.current.x, s.y + rect.top - panStart.current.y) > 3) panMoved.current = true;
      setViewState((v) => ({ ...v, x: panStart.current!.vx + (s.x + rect.left - panStart.current!.x), y: panStart.current!.vy + (s.y + rect.top - panStart.current!.y) }));
      return;
    }
    const sp = tool === 'select' || tool === 'pan' ? p : snapPoint(p);
    setCursor(sp);
    if (marquee) setMarquee({ a: marquee.a, b: tool === 'aisle' ? snapPoint(p, { geometry: false }) : p });
    if (tool === 'measure' && measure && draft.length === 1) setMeasure({ a: draft[0], b: sp });
  };

  const onMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (panStart.current) {
      panStart.current = null;
      return;
    }
    if (marquee) {
      const { a, b } = marquee;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      if (tool === 'aisle') {
        if (maxX - minX > 6 && maxY - minY > 6) {
          const w = maxX - minX;
          const d = maxY - minY;
          const aisle = w >= d ? makeAisle((minX + maxX) / 2, (minY + maxY) / 2, w, d) : makeAisle((minX + maxX) / 2, (minY + maxY) / 2, d, w, 90);
          store.getState().addObjects([aisle]);
          store.getState().setTool('select');
        }
      } else if (maxX - minX > 2 / view.k && maxY - minY > 2 / view.k) {
        const ids = objects
          .filter((o) => {
            if (o.kind === 'room') return false;
            const c = anchorOf(o);
            return c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY;
          })
          .map((o) => o.id);
        store.getState().select(ids, e.evt.shiftKey);
      }
      setMarquee(null);
    }
  };

  const onClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0 || spaceDown) return;
    const raw = pointer();
    if (!raw) return;
    const p = snapPoint(raw);
    const st = store.getState();
    switch (tool) {
      case 'measure':
      case 'calibrate':
      case 'dimension': {
        if (draft.length === 0) {
          setDraft([p]);
          setMeasure({ a: p, b: p });
        } else {
          const a = draft[0];
          setDraft([]);
          if (tool === 'measure') setMeasure({ a, b: p });
          if (tool === 'dimension') {
            setMeasure(null);
            if (dist(a, p) > 1) st.addObjects([makeDimension(a, p, -18)]);
          }
          if (tool === 'calibrate') {
            setMeasure(null);
            st.setCalibrationPoints({ a, b: p });
            st.openDialog('calibrate');
          }
        }
        break;
      }
      case 'wall': {
        if (draft.length === 0) setDraft([p]);
        else {
          const a = draft[draft.length - 1];
          if (dist(a, p) > 1) st.addObjects([makeWall(a, p, 'interior')], false);
          setDraft([p]);
        }
        break;
      }
      case 'room': {
        if (draft.length >= 3 && dist(p, draft[0]) < 12 / view.k) finishRoom();
        else setDraft([...draft, p]);
        break;
      }
      case 'door': {
        // Snap to the nearest wall centerline and align with it.
        let best: { w: Wall; c: Pt; d: number } | null = null;
        for (const w of objects) {
          if (w.kind !== 'wall') continue;
          const c = closestPointOnSegment(raw, w.a, w.b);
          const d = dist(raw, c);
          if (!best || d < best.d) best = { w, c, d };
        }
        if (best && best.d < 36) {
          const dir = norm(sub(best.w.b, best.w.a));
          const rot = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
          const hinge = sub(best.c, vscale(dir, 18));
          st.addObjects([makeDoor(hinge.x, hinge.y, rot, 36, 1, 'Door')]);
        } else st.addObjects([makeDoor(p.x, p.y, 0, 36, 1, 'Door')]);
        st.setTool('select');
        break;
      }
      case 'label': {
        const l = makeLabel(p.x, p.y, 'New label');
        st.addObjects([l]);
        st.setTool('select');
        setEditing({ id: l.id, field: 'label' });
        break;
      }
      default:
        break;
    }
  };

  const onDblClick = () => {
    if (tool === 'room' && draft.length >= 3) finishRoom();
    if (tool === 'wall') {
      setDraft([]);
      store.getState().setTool('select');
    }
  };

  // ---- Object drag (multi-select aware)
  const handleDragStart = (o: PlanObject) => (e: KonvaEventObject<DragEvent>) => {
    const st = store.getState();
    let ids = st.selectedIds;
    if (!ids.includes(o.id)) {
      st.select([o.id], e.evt.shiftKey);
      ids = store.getState().selectedIds;
    }
    const start = new Map<string, Pt>();
    const stage = stageRef.current!;
    for (const id of ids) {
      const n = stage.findOne(`#${id}`);
      if (n) start.set(id, { x: n.x(), y: n.y() });
    }
    dragStart.current = { id: o.id, start };
  };

  const handleDragMove = (o: PlanObject) => (e: KonvaEventObject<DragEvent>) => {
    const ds = dragStart.current;
    if (!ds) return;
    const node = e.target;
    const s0 = ds.start.get(o.id)!;
    let dx = node.x() - s0.x;
    let dy = node.y() - s0.y;
    if (settings.snapToGrid && !e.evt.altKey) {
      // Snap the anchor point of the dragged object to the grid.
      const anchor = anchorOf(o);
      const ax = o.kind === 'room' || o.kind === 'wall' || o.kind === 'dimension' ? anchor.x : 0;
      const ay = o.kind === 'room' || o.kind === 'wall' || o.kind === 'dimension' ? anchor.y : 0;
      const bx = o.kind === 'room' || o.kind === 'wall' || o.kind === 'dimension' ? 0 : s0.x;
      const by = o.kind === 'room' || o.kind === 'wall' || o.kind === 'dimension' ? 0 : s0.y;
      dx = snap(ax + bx + dx, settings.gridSize) - (ax + bx);
      dy = snap(ay + by + dy, settings.gridSize) - (ay + by);
      node.position({ x: s0.x + dx, y: s0.y + dy });
    }
    if ((o.kind === 'furniture' || o.kind === 'aisle') && ds.start.size === 1) setLive({ ...o, x: node.x(), y: node.y() });
    const stage = stageRef.current!;
    ds.start.forEach((p, id) => {
      if (id === o.id) return;
      stage.findOne(`#${id}`)?.position({ x: p.x + dx, y: p.y + dy });
    });
  };

  const handleDragEnd = (o: PlanObject) => (e: KonvaEventObject<DragEvent>) => {
    const ds = dragStart.current;
    dragStart.current = null;
    setLive(null);
    if (!ds) return;
    const s0 = ds.start.get(o.id)!;
    const dx = e.target.x() - s0.x;
    const dy = e.target.y() - s0.y;
    // Reset point-based nodes (they are rendered at 0,0 with absolute points).
    const stage = stageRef.current!;
    ds.start.forEach((p, id) => stage.findOne(`#${id}`)?.position(p));
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    const ids = new Set(ds.start.keys());
    store.getState().setObjects((objs) =>
      objs.map((x) => {
        if (!ids.has(x.id) || x.locked) return x;
        let moved = translateObject(x, dx, dy);
        if (moved.kind === 'door') moved = snapDoorToWall(moved, objs);
        return moved;
      }),
    );
  };

  const snapDoorToWall = (d: Door, objs: PlanObject[]): Door => {
    let best: { w: Wall; c: Pt; dd: number } | null = null;
    for (const w of objs) {
      if (w.kind !== 'wall') continue;
      const c = closestPointOnSegment({ x: d.x, y: d.y }, w.a, w.b);
      const dd = dist(c, d);
      if (!best || dd < best.dd) best = { w, c, dd };
    }
    if (!best || best.dd > 12) return d;
    const dir = norm(sub(best.w.b, best.w.a));
    const wallAng = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const diff = (((d.rotation - wallAng) % 360) + 360) % 360;
    const rot = diff > 90 && diff < 270 ? wallAng + 180 : wallAng;
    return { ...d, x: best.c.x, y: best.c.y, rotation: rot };
  };

  const handleTransform = (o: Furniture | Aisle | TextLabel) => (e: KonvaEventObject<Event>) => {
    if (o.kind === 'label') return;
    const n = e.target;
    setLive({ ...o, x: n.x(), y: n.y(), rotation: n.rotation(), width: o.width * n.scaleX(), depth: o.depth * n.scaleY() });
  };

  const handleTransformEnd = (o: Furniture | Aisle | TextLabel) => (e: KonvaEventObject<Event>) => {
    setLive(null);
    const n = e.target;
    const sx = n.scaleX();
    const sy = n.scaleY();
    n.scale({ x: 1, y: 1 });
    const patch: Record<string, unknown> = { x: n.x(), y: n.y() };
    const rot = Math.round(n.rotation() * 100) / 100;
    if (o.kind === 'label') {
      patch.style = { ...o.style, rotation: rot, fontSize: Math.max(4, Math.round(o.style.fontSize * Math.max(sx, sy) * 10) / 10) };
    } else {
      const g = settings.snapToGrid ? Math.min(settings.gridSize, 3) : 0;
      patch.width = Math.max(6, g ? snap(o.width * sx, g) : o.width * sx);
      patch.depth = Math.max(2, g ? snap(o.depth * sy, g) : o.depth * sy);
      patch.rotation = rot;
    }
    store.getState().updateObject(o.id, patch as Partial<PlanObject>);
  };

  const onSelect = (o: PlanObject) => (e: KonvaEventObject<MouseEvent>) => {
    if (tool !== 'select') return;
    e.cancelBubble = true;
    if (panMoved.current) return; // the press was a pan, not a click
    store.getState().select([o.id], e.evt.shiftKey);
  };

  // ---- Vertex handles
  const updatePoint = (id: string, apply: (o: PlanObject, p: Pt) => PlanObject) => (e: KonvaEventObject<DragEvent>) => {
    let p = { x: e.target.x(), y: e.target.y() };
    if (!e.evt.altKey) p = snapPoint(p, { geometry: false });
    e.target.position(p);
    store.getState().setObjects((objs) => objs.map((o) => (o.id === id ? apply(o, p) : o)), `vertex:${id}`);
  };

  // ---- Inline text editing overlay
  const editingObj = editing ? objects.find((o) => o.id === editing.id) : undefined;
  const editPos = (() => {
    if (!editingObj) return null;
    const p = editingObj.kind === 'room' ? add(centroid(editingObj.points), editingObj.label.offset) : editingObj.kind === 'label' ? { x: editingObj.x, y: editingObj.y } : null;
    if (!p) return null;
    return { left: p.x * view.k + view.x, top: p.y * view.k + view.y };
  })();

  // ---- Render helpers
  const visibleLayer = (id: LayerId) => layerOf(id).visible;
  const rooms = objects.filter((o): o is Room => o.kind === 'room');
  const walls = objects.filter((o): o is Wall => o.kind === 'wall');
  const doors = objects.filter((o): o is Door => o.kind === 'door');
  const furniture = objects.filter((o): o is Furniture => o.kind === 'furniture');
  const labels = objects.filter((o): o is TextLabel => o.kind === 'label');
  const dims = objects.filter((o): o is Dimension => o.kind === 'dimension');
  const aisles = objects.filter((o): o is Aisle => o.kind === 'aisle');
  const px = 1 / view.k; // one screen pixel in plan inches
  const fmt = (v: number) => formatLength(v, settings.units);

  const selectedFurniture = selectedIds.length === 1 ? furniture.find((f) => f.id === selectedIds[0]) : undefined;
  // While dragging/resizing, guides follow the live (uncommitted) geometry.
  const guideTarget: Furniture | Aisle | undefined = live ?? selectedFurniture ?? (selectedIds.length === 1 ? aisles.find((a) => a.id === selectedIds[0]) : undefined);
  const guideRays = useMemo(() => {
    const selectedFurniture = guideTarget;
    if (!selectedFurniture || !settings.showGuides) return [];
    const obstacles = [
      ...furniture.filter((g) => g.id !== selectedFurniture.id && !g.overlapsAllowed).map(footprint),
      ...walls.map(wallPolygon),
    ];
    const f = selectedFurniture;
    const dirs: [Pt, number][] = [
      [{ x: 0, y: 1 }, f.depth / 2],
      [{ x: 0, y: -1 }, f.depth / 2],
      [{ x: 1, y: 0 }, f.width / 2],
      [{ x: -1, y: 0 }, f.width / 2],
    ];
    return dirs
      .map(([dl, half]) => {
        const dir = rotatePt(dl, f.rotation);
        const o = add({ x: f.x, y: f.y }, vscale(dir, half));
        let t = 480;
        for (const poly of obstacles) {
          const h = rayPolygon(add(o, vscale(dir, 0.01)), dir, poly);
          if (h !== null && h < t) t = h;
        }
        return { o, b: add(o, vscale(dir, t)), t };
      })
      .filter((r) => r.t < 480 && r.t > 0.05);
  }, [guideTarget, furniture, walls, settings.showGuides]);

  const gridShape = (
    <Shape
      name="grid"
      listening={false}
      sceneFunc={(ctx) => {
        if (!settings.showGrid || pres) return;
        const c = ctx._context;
        const x0 = -view.x / view.k;
        const y0 = -view.y / view.k;
        const x1 = x0 + size.w / view.k;
        const y1 = y0 + size.h / view.k;
        const draw = (step: number, color: string, w: number) => {
          if (step * view.k < 6) return;
          c.beginPath();
          for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
            c.moveTo(x, y0);
            c.lineTo(x, y1);
          }
          for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
            c.moveTo(x0, y);
            c.lineTo(x1, y);
          }
          c.strokeStyle = color;
          c.lineWidth = w / view.k;
          c.stroke();
        };
        draw(settings.gridSize, '#e4e8ee', 1);
        draw(12, '#d3d9e2', 1);
        draw(120, '#bcc5d3', 1);
      }}
    />
  );

  const cursorStyle = tool === 'pan' || spaceDown ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  // Floating turn bar under the selected, unlocked furniture / aisles (hidden while dragging).
  const turnBar = (() => {
    if (tool !== 'select' || live || pres) return null;
    const sel = objects.filter((o): o is Furniture | Aisle => selected.has(o.id) && (o.kind === 'furniture' || o.kind === 'aisle') && canEdit(o));
    if (!sel.length) return null;
    const pts = sel.flatMap((o) => footprint(o));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const furn = sel.filter((o): o is Furniture => o.kind === 'furniture');
    const facings = new Set(furn.map((o) => facingOf(o.rotation)));
    return {
      left: Math.min(Math.max(view.x + ((minX + maxX) / 2) * view.k, 150), size.w - 150),
      // Below the selection, clear of the rotate handle above it; above it if there's no room below.
      top: view.y + maxY * view.k + 14 + 30 <= size.h ? view.y + maxY * view.k + 14 : Math.max(view.y + minY * view.k - 74, 6),
      furniture: furn.length > 0,
      facing: facings.size === 1 ? [...facings][0] : null,
    };
  })();
  const roomEditable = (r: Room) => selected.has(r.id) && canEdit(r);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-white"
      style={{ cursor: cursorStyle, touchAction: 'none' }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-fp-template')) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('application/x-fp-template');
        if (!id) return;
        e.preventDefault();
        const rect = wrapRef.current!.getBoundingClientRect();
        const p = { x: (e.clientX - rect.left - view.x) / view.k, y: (e.clientY - rect.top - view.y) / view.k };
        onDropTemplate?.(id, settings.snapToGrid ? { x: snap(p.x, settings.gridSize), y: snap(p.y, settings.gridSize) } : p);
      }}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={view.x}
        y={view.y}
        scaleX={view.k}
        scaleY={view.k}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onClick}
        onDblClick={onDblClick}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        {/* Static layer: background + grid (not listening = cheap) */}
        <Layer listening={!!bg && !bg.locked && !layerOf('background').locked && tool === 'select'}>
          <Rect name="bg" x={-1e5} y={-1e5} width={2e5} height={2e5} fill={pres ? '#f4f5f7' : '#ffffff'} />
          {gridShape}
          {bg && bgImg && bg.visible && visibleLayer('background') && (
            <Group
              x={bg.x}
              y={bg.y}
              rotation={bg.rotation}
              scaleX={bg.scale}
              scaleY={bg.scale}
              opacity={bg.opacity}
              draggable={!bg.locked}
              onDragEnd={(e) => store.getState().patchBackground({ x: e.target.x(), y: e.target.y() })}
            >
              <KImage image={bgImg} crop={bg.crop} width={bg.crop?.width ?? bg.imageWidth} height={bg.crop?.height ?? bg.imageHeight} />
            </Group>
          )}
        </Layer>

        <Layer>
          {/* Rooms */}
          {visibleLayer('rooms') &&
            rooms.map((r) => (
              <Group
                key={r.id}
                id={r.id}
                draggable={roomEditable(r)}
                onDragStart={handleDragStart(r)}
                onDragMove={handleDragMove(r)}
                onDragEnd={handleDragEnd(r)}
                onClick={onSelect(r)}
                onTap={onSelect(r) as never}
                onDblClick={() => tool === 'select' && setEditing({ id: r.id, field: 'room' })}
              >
                <Line
                  points={r.points.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={r.fill}
                  opacity={pres ? 1 : 0.55}
                  stroke={selected.has(r.id) ? TEAL : pres ? '#c4ccd8' : '#9aa5b8'}
                  strokeWidth={(selected.has(r.id) ? 2.5 : 1) * px}
                  dash={pres || selected.has(r.id) ? undefined : [5 * px, 4 * px]}
                  listening={tool === 'select'}
                />
              </Group>
            ))}

          {/* Aisle zones */}
          {visibleLayer('aisles') &&
            aisles.map((a) => (
              <Group
                key={a.id}
                id={a.id}
                x={a.x}
                y={a.y}
                rotation={a.rotation}
                draggable={canEdit(a)}
                onDragStart={handleDragStart(a)}
                onDragMove={handleDragMove(a)}
                onDragEnd={handleDragEnd(a)}
                onTransform={handleTransform(a)}
                onTransformEnd={handleTransformEnd(a)}
                onClick={onSelect(a)}
              >
                <Rect x={-a.width / 2} y={-a.depth / 2} width={a.width} height={a.depth} fill={a.color} opacity={0.28} stroke={selected.has(a.id) ? TEAL : a.color} strokeWidth={1.5 * px} dash={[8 * px, 5 * px]} />
                {!pres && <Text x={-a.width / 2} y={-6} width={a.width} align="center" text={`${a.name} · ${fmt(a.depth)} clear`} fontSize={Math.min(9, a.depth / 3)} fill="#8a6d00" listening={false} />}
              </Group>
            ))}

          {/* Walls */}
          {visibleLayer('walls') &&
            walls.map((w) => (
              <Group
                key={w.id}
                id={w.id}
                draggable={selected.has(w.id) && canEdit(w)}
                onDragStart={handleDragStart(w)}
                onDragMove={handleDragMove(w)}
                onDragEnd={handleDragEnd(w)}
                onClick={onSelect(w)}
              >
                <Line
                  points={wallPolygon(w).flatMap((p) => [p.x, p.y])}
                  closed
                  fill={selected.has(w.id) ? TEAL : pres ? '#2b3550' : w.color}
                  hitStrokeWidth={Math.max(6 * px, 0)}
                  stroke={selected.has(w.id) ? TEAL : undefined}
                  strokeWidth={selected.has(w.id) ? px : 0}
                />
              </Group>
            ))}

          {/* Doors */}
          {visibleLayer('doors') &&
            doors.map((d) => (
              <Group
                key={d.id}
                id={d.id}
                x={d.x}
                y={d.y}
                rotation={d.rotation}
                draggable={canEdit(d)}
                onDragStart={handleDragStart(d)}
                onDragMove={handleDragMove(d)}
                onDragEnd={handleDragEnd(d)}
                onClick={onSelect(d)}
              >
                <Rect x={0} y={-3} width={d.width} height={6} fill="#ffffff" />
                <Arc
                  x={0}
                  y={0}
                  innerRadius={0}
                  outerRadius={d.width}
                  angle={90}
                  rotation={d.swing === 1 ? 0 : -90}
                  fill={selected.has(d.id) ? 'rgba(15,157,154,0.15)' : 'rgba(20,33,61,0.04)'}
                  stroke={selected.has(d.id) ? TEAL : NAVY}
                  strokeWidth={0.6 * px}
                  dash={[3 * px, 2 * px]}
                />
                <Line points={[0, 0, 0, d.swing * d.width]} stroke={selected.has(d.id) ? TEAL : NAVY} strokeWidth={2 * px} rotation={0} />
              </Group>
            ))}

          {/* Furniture */}
          {visibleLayer('furniture') &&
            furniture.map((f) => {
              const conflict = validation.conflictIds.has(f.id);
              const sel = selected.has(f.id);
              const showText = !pres && f.type !== 'chair' && f.width * view.k > 40;
              const who = f.assignedTo.filter(Boolean).join(', ');
              return (
                <Group
                  key={f.id}
                  id={f.id}
                  x={f.x}
                  y={f.y}
                  rotation={f.rotation}
                  draggable={canEdit(f)}
                  onDragStart={handleDragStart(f)}
                  onDragMove={handleDragMove(f)}
                  onDragEnd={handleDragEnd(f)}
                  onTransform={handleTransform(f)}
                  onTransformEnd={handleTransformEnd(f)}
                  onMouseDown={(e) => {
                    if (tool !== 'select') return;
                    e.cancelBubble = true;
                    if (!selected.has(f.id)) store.getState().select([f.id], e.evt.shiftKey);
                  }}
                  onTouchStart={(e) => {
                    if (tool !== 'select') return;
                    e.cancelBubble = true;
                    if (!selected.has(f.id)) store.getState().select([f.id]);
                  }}
                >
                  <Shape
                    sceneFunc={(ctx, shape) => {
                      drawFurniture(ctx._context, f, pres, sel ? TEAL : NAVY, conflict);
                      ctx.fillStrokeShape(shape);
                    }}
                    hitFunc={(ctx, shape) => {
                      ctx.beginPath();
                      ctx.rect(-f.width / 2, -f.depth / 2, f.width, f.depth);
                      ctx.closePath();
                      ctx.fillStrokeShape(shape);
                    }}
                  />
                  {sel && <Rect x={-f.width / 2} y={-f.depth / 2} width={f.width} height={f.depth} stroke={TEAL} strokeWidth={2 * px} listening={false} />}
                  {f.locked && <Text x={f.width / 2 - 10} y={-f.depth / 2 + 1} text="🔒" fontSize={7} listening={false} />}
                  {showText && (
                    <Group rotation={-f.rotation} listening={false}>
                      <Text x={-f.width / 2} y={-5} width={f.width} align="center" text={f.name} fontSize={Math.min(7, f.width / 7)} fill={conflict ? RED : NAVY} fontStyle="bold" />
                      {who && <Text x={-f.width / 2} y={4} width={f.width} align="center" text={who} fontSize={Math.min(6, f.width / 8)} fill="#0b7f7c" />}
                    </Group>
                  )}
                </Group>
              );
            })}

          {/* Room labels */}
          {visibleLayer('annotations') &&
            rooms.map((r) => {
              const c = add(centroid(r.points), r.label.offset);
              const fs = r.label.fontSize * (pres ? 1.15 : 1);
              const sub2 = r.showArea ? formatArea(roomArea(r), settings.units) : '';
              const rb = bbox(r.points);
              const w = Math.min(Math.max(r.name.length * fs * 0.6, 60), Math.max(60, rb.width * 0.92));
              const lines = Math.ceil((r.name.length * fs * 0.6) / w);
              return (
                <Group
                  key={`lbl-${r.id}`}
                  x={c.x}
                  y={c.y}
                  rotation={r.label.rotation}
                  draggable={selected.has(r.id) && canEdit(r)}
                  // Only the selected room's label takes clicks (to drag it). Otherwise clicks pass
                  // through to cubicles and furniture under the label; double-clicking the room
                  // itself still edits its name.
                  listening={selected.has(r.id)}
                  onDragEnd={(e) => {
                    const np = { x: e.target.x(), y: e.target.y() };
                    const cen = centroid(r.points);
                    e.target.position(c);
                    store.getState().updateObject(r.id, { label: { ...r.label, offset: sub(np, cen) } } as Partial<PlanObject>);
                  }}
                  onClick={onSelect(r)}
                  onDblClick={() => tool === 'select' && setEditing({ id: r.id, field: 'room' })}
                  visible={!(editing && editing.id === r.id)}
                >
                  {r.label.background && <Rect x={r.label.align === 'center' ? -w / 2 - 4 : r.label.align === 'right' ? -w - 4 : -4} y={-fs} width={w + 8} height={fs * (lines * 1.2 + (sub2 ? 0.9 : 0.3))} fill={r.label.background} cornerRadius={2} />}
                  <Text
                    x={r.label.align === 'center' ? -w / 2 : r.label.align === 'right' ? -w : 0}
                    y={-fs * 0.85}
                    width={w}
                    align={r.label.align}
                    text={r.name}
                    fontSize={fs}
                    fontStyle={r.label.fontWeight === 'bold' ? 'bold' : 'normal'}
                    fill={r.label.color}
                    wrap="word"
                  />
                  {sub2 && <Text x={r.label.align === 'center' ? -w / 2 : r.label.align === 'right' ? -w : 0} y={fs * 0.35 + (lines - 1) * fs * 1.2} width={w} align={r.label.align} text={sub2} fontSize={fs * 0.7} fill="#4a5670" />}
                </Group>
              );
            })}

          {/* Free text labels / callouts */}
          {visibleLayer('annotations') &&
            labels.map((l) => (
              <Group key={l.id}>
                {l.callout && <Line points={[l.x, l.y, l.callout.x, l.callout.y]} stroke={l.style.color} strokeWidth={0.8 * px * 1.5} listening={false} />}
                {l.callout && <Circle x={l.callout.x} y={l.callout.y} radius={2.5} fill={l.style.color} listening={false} />}
                <Group
                  id={l.id}
                  x={l.x}
                  y={l.y}
                  rotation={l.style.rotation}
                  draggable={canEdit(l)}
                  onDragStart={handleDragStart(l)}
                  onDragMove={handleDragMove(l)}
                  onDragEnd={handleDragEnd(l)}
                  onTransformEnd={handleTransformEnd(l)}
                  onClick={onSelect(l)}
                  onDblClick={() => tool === 'select' && setEditing({ id: l.id, field: 'label' })}
                  visible={!(editing && editing.id === l.id)}
                >
                  {(() => {
                    const lines = l.text.split('\n');
                    const w = Math.max(...lines.map((t) => t.length)) * l.style.fontSize * 0.56 + 6;
                    const h = lines.length * l.style.fontSize * 1.2 + 4;
                    const x0 = l.style.align === 'center' ? -w / 2 : l.style.align === 'right' ? -w : 0;
                    return (
                      <>
                        <Rect x={x0} y={-l.style.fontSize} width={w} height={h} fill={l.style.background || 'rgba(255,255,255,0.001)'} stroke={selected.has(l.id) ? TEAL : undefined} strokeWidth={px} cornerRadius={2} />
                        <Text x={x0 + 3} y={-l.style.fontSize + 2} width={w - 6} align={l.style.align} text={l.text} fontSize={l.style.fontSize} fontStyle={l.style.fontWeight} fill={l.style.color} lineHeight={1.2} />
                      </>
                    );
                  })()}
                </Group>
              </Group>
            ))}

          {/* Dimensions */}
          {visibleLayer('annotations') &&
            (!pres || settings.showGuides) &&
            dims.map((d) => {
              const g = dimensionGeometry(d);
              const override = d.labelOverride?.trim();
              const text = override ? `${override} *` : fmt(g.length);
              const color = selected.has(d.id) ? TEAL : d.color;
              const ext = (p: Pt) => add(p, vscale(g.n, d.offset + Math.sign(d.offset || 1) * 4));
              const e1 = ext(d.a);
              const e2 = ext(d.b);
              const fs = Math.max(7, 10 * px * 1.1);
              return (
                <Group
                  key={d.id}
                  id={d.id}
                  draggable={selected.has(d.id) && canEdit(d) && !d.attach}
                  onDragStart={handleDragStart(d)}
                  onDragMove={handleDragMove(d)}
                  onDragEnd={handleDragEnd(d)}
                  onClick={onSelect(d)}
                >
                  <Line points={[d.a.x, d.a.y, e1.x, e1.y]} stroke={color} strokeWidth={0.8 * px} />
                  <Line points={[d.b.x, d.b.y, e2.x, e2.y]} stroke={color} strokeWidth={0.8 * px} />
                  <Line points={[g.a2.x, g.a2.y, g.b2.x, g.b2.y]} stroke={color} strokeWidth={1.1 * px} hitStrokeWidth={10 * px} />
                  {[g.a2, g.b2].map((p, i) => (
                    <Line key={i} x={p.x} y={p.y} rotation={g.ang} points={[-3, 3, 3, -3]} stroke={color} strokeWidth={1.6 * px} />
                  ))}
                  <Group x={g.mid.x} y={g.mid.y} rotation={g.ang}>
                    <Rect x={-text.length * fs * 0.3} y={-fs * 1.35} width={text.length * fs * 0.6} height={fs * 1.15} fill="#ffffff" opacity={0.9} />
                    <Text x={-text.length * fs * 0.3} y={-fs * 1.25} width={text.length * fs * 0.6} align="center" text={text} fontSize={fs} fontStyle="bold" fill={override ? '#b45309' : color} />
                  </Group>
                </Group>
              );
            })}

          {/* Room edge length guides */}
          {settings.showGuides &&
            !pres &&
            visibleLayer('annotations') &&
            rooms
              .filter((r) => selected.has(r.id))
              .flatMap((r) =>
                r.points.map((a, i) => {
                  const b = r.points[(i + 1) % r.points.length];
                  const m = vscale(add(a, b), 0.5);
                  const L = dist(a, b);
                  const fs = 9 * px * 1.2;
                  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
                  if (ang > 90 || ang < -90) ang += 180;
                  return <Text key={`${r.id}-e${i}`} x={m.x} y={m.y} rotation={ang} offsetX={30 * fs * 0.3} offsetY={-fs * 0.4} width={60 * fs * 0.3} align="center" text={fmt(L)} fontSize={fs} fill={RED} listening={false} />;
                }),
              )}

          {/* Clearance guides for the selected furniture */}
          {guideRays.map((r, i) => (
            <Group key={`ray-${i}`} listening={false}>
              <Line points={[r.o.x, r.o.y, r.b.x, r.b.y]} stroke={RED} strokeWidth={px} dash={[4 * px, 3 * px]} />
              <Circle x={r.b.x} y={r.b.y} radius={2 * px} fill={RED} />
              <Text x={(r.o.x + r.b.x) / 2 + 3 * px} y={(r.o.y + r.b.y) / 2 - 10 * px} text={fmt(r.t)} fontSize={10 * px} fill={RED} fontStyle="bold" />
            </Group>
          ))}

          {/* Live size tag for the selected / moving object (updates during drag and resize) */}
          {guideTarget && (() => {
            const g = guideTarget;
            const corners = footprint(g);
            const top = corners.reduce((m, p) => (p.y < m.y ? p : m), corners[0]);
            const fs = 11 * px;
            const text = `${fmt(g.width)} × ${fmt(g.depth)}${Math.round(g.rotation) % 360 ? `  ·  ${Math.round(((g.rotation % 360) + 360) % 360)}°` : ''}`;
            const w = text.length * fs * 0.58 + 10 * px;
            return (
              <Group x={g.x} y={top.y - 8 * px} listening={false}>
                <Rect x={-w / 2} y={-fs * 1.5} width={w} height={fs * 1.5} fill={live ? RED : NAVY} cornerRadius={3 * px} />
                <Text x={-w / 2} y={-fs * 1.22} width={w} align="center" text={text} fontSize={fs} fill="#fff" fontStyle="bold" />
              </Group>
            );
          })()}

          {/* Wall lengths (selected walls always; all walls when guides are on and zoomed in) */}
          {visibleLayer('walls') &&
            walls
              .filter((w) => selected.has(w.id) || (settings.showGuides && !pres && dist(w.a, w.b) * view.k > 90))
              .map((w) => {
                const m = vscale(add(w.a, w.b), 0.5);
                let ang = (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI;
                if (ang > 90 || ang < -90) ang += 180;
                const sel = selected.has(w.id);
                const fs = (sel ? 11 : 8.5) * px;
                const n = rotatePt({ x: 0, y: -1 }, ang);
                const pos = add(m, vscale(n, w.thickness / 2 + fs * 0.4));
                return (
                  <Text key={`wl-${w.id}`} x={pos.x} y={pos.y} rotation={ang} offsetX={60 * px} offsetY={fs} width={120 * px} align="center" text={fmt(dist(w.a, w.b))} fontSize={fs} fill={sel ? RED : '#c04848'} fontStyle={sel ? 'bold' : 'normal'} listening={false} />
                );
              })}

          {/* Vertex handles for selected room / wall / dimension / label callout */}
          {tool === 'select' &&
            objects
              .filter((o) => selected.has(o.id) && canEdit(o) && selectedIds.length === 1)
              .flatMap((o) => {
                const H = (key: string, p: Pt, onMove: (e: KonvaEventObject<DragEvent>) => void, extra: Partial<Konva.CircleConfig> = {}) => (
                  <Circle key={key} x={p.x} y={p.y} radius={5 * px} fill="#ffffff" stroke={TEAL} strokeWidth={2 * px} draggable onDragMove={onMove} onDragEnd={() => store.setState({ lastKey: null })} {...extra} />
                );
                if (o.kind === 'room') {
                  const vh = o.points.map((p, i) =>
                    H(`${o.id}-v${i}`, p, updatePoint(o.id, (x, np) => ({ ...(x as Room), points: (x as Room).points.map((q, j) => (j === i ? np : q)) })), {
                      onDblClick: (e: KonvaEventObject<MouseEvent>) => {
                        e.cancelBubble = true;
                        if (o.points.length > 3) store.getState().updateObject(o.id, { points: o.points.filter((_, j) => j !== i) } as Partial<PlanObject>);
                      },
                    }),
                  );
                  const mids = o.points.map((p, i) => {
                    const q = o.points[(i + 1) % o.points.length];
                    const m = vscale(add(p, q), 0.5);
                    return (
                      <Rect
                        key={`${o.id}-m${i}`}
                        x={m.x - 3 * px}
                        y={m.y - 3 * px}
                        width={6 * px}
                        height={6 * px}
                        fill={TEAL}
                        opacity={0.7}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          const pts = [...o.points];
                          pts.splice(i + 1, 0, m);
                          store.getState().updateObject(o.id, { points: pts } as Partial<PlanObject>);
                        }}
                      />
                    );
                  });
                  return [...mids, ...vh];
                }
                if (o.kind === 'wall' || o.kind === 'dimension') {
                  return [
                    H(`${o.id}-a`, o.a, updatePoint(o.id, (x, np) => ({ ...(x as Wall), a: np }) as PlanObject)),
                    H(`${o.id}-b`, o.b, updatePoint(o.id, (x, np) => ({ ...(x as Wall), b: np }) as PlanObject)),
                  ];
                }
                if (o.kind === 'label' && o.callout) {
                  return [H(`${o.id}-c`, o.callout, updatePoint(o.id, (x, np) => ({ ...(x as TextLabel), callout: np })))];
                }
                return [];
              })}

          <Transformer
            ref={trRef}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
            anchorSize={8}
            borderStroke={TEAL}
            anchorStroke={TEAL}
            anchorFill="#ffffff"
            keepRatio={false}
            ignoreStroke
            flipEnabled={false}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 4 || newBox.height < 2 ? oldBox : newBox)}
          />
        </Layer>

        {/* Overlay: drafts, measurement, marquee */}
        <Layer listening={false}>
          {marquee && (
            <Rect
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.b.x - marquee.a.x)}
              height={Math.abs(marquee.b.y - marquee.a.y)}
              fill={tool === 'aisle' ? 'rgba(246,211,101,0.3)' : 'rgba(15,157,154,0.08)'}
              stroke={tool === 'aisle' ? '#c49b00' : TEAL}
              strokeWidth={px}
              dash={[4 * px, 3 * px]}
            />
          )}
          {marquee && tool === 'aisle' && (
            <Text x={Math.max(marquee.a.x, marquee.b.x) + 4 * px} y={Math.max(marquee.a.y, marquee.b.y)} text={`${fmt(Math.abs(marquee.b.x - marquee.a.x))} × ${fmt(Math.abs(marquee.b.y - marquee.a.y))}`} fontSize={11 * px} fill={RED} />
          )}
          {(tool === 'wall' || tool === 'room') && draft.length > 0 && cursor && (
            <>
              <Line points={[...draft, cursor].flatMap((p) => [p.x, p.y])} stroke={TEAL} strokeWidth={tool === 'wall' ? 5 : 1.5 * px} opacity={tool === 'wall' ? 0.6 : 1} closed={false} />
              {draft.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={4 * px} fill={i === 0 ? TEAL : '#fff'} stroke={TEAL} strokeWidth={1.5 * px} />
              ))}
              <Text x={cursor.x + 8 * px} y={cursor.y + 8 * px} text={fmt(dist(draft[draft.length - 1], cursor))} fontSize={11 * px} fill={RED} fontStyle="bold" />
            </>
          )}
          {measure && (tool === 'measure' || tool === 'calibrate' || tool === 'dimension') && (
            <>
              <Line points={[measure.a.x, measure.a.y, measure.b.x, measure.b.y]} stroke={tool === 'calibrate' ? '#7c3aed' : RED} strokeWidth={1.5 * px} dash={[6 * px, 3 * px]} />
              <Circle x={measure.a.x} y={measure.a.y} radius={3.5 * px} fill={RED} />
              <Circle x={measure.b.x} y={measure.b.y} radius={3.5 * px} fill={RED} />
              <Group x={(measure.a.x + measure.b.x) / 2} y={(measure.a.y + measure.b.y) / 2}>
                <Rect x={4 * px} y={-18 * px} width={92 * px} height={16 * px} fill="#fff" stroke={RED} strokeWidth={px} cornerRadius={3 * px} />
                <Text x={8 * px} y={-15 * px} text={`${fmt(dist(measure.a, measure.b))}`} fontSize={11 * px} fill={RED} fontStyle="bold" />
              </Group>
            </>
          )}
          {cursor && tool !== 'select' && tool !== 'pan' && <Circle x={cursor.x} y={cursor.y} radius={3 * px} stroke={TEAL} strokeWidth={px} />}
        </Layer>
      </Stage>

      {/* Inline text editor */}
      {editing && editingObj && editPos && (
        <textarea
          autoFocus
          defaultValue={editingObj.kind === 'room' ? editingObj.name : editingObj.kind === 'label' ? editingObj.text : ''}
          className="absolute z-20 min-w-[160px] -translate-x-1/2 -translate-y-1/2 rounded border-2 border-teal bg-white px-2 py-1 text-center text-sm font-semibold text-navy shadow-lg outline-none"
          style={{ left: editPos.left, top: editPos.top }}
          rows={editingObj.kind === 'label' ? Math.max(2, editingObj.text.split('\n').length) : 1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(null);
            if (e.key === 'Enter' && (editingObj.kind === 'room' || !e.shiftKey)) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          onBlur={(e) => {
            const v = e.target.value;
            if (editingObj.kind === 'room' && v.trim()) store.getState().updateObject(editingObj.id, { name: v.trim() } as Partial<PlanObject>);
            if (editingObj.kind === 'label') store.getState().updateObject(editingObj.id, { text: v, name: v.slice(0, 24) || 'Label' } as Partial<PlanObject>);
            setEditing(null);
          }}
        />
      )}

      {/* Scale bar: always shows true length at the current zoom */}
      {(() => {
        const nice = [1, 2, 5, 10, 20, 50, 100];
        const ft = [...nice].reverse().find((n) => n * 12 * view.k <= 170) ?? 1;
        const wpx = ft * 12 * view.k;
        return (
          <div className="pointer-events-none absolute bottom-12 left-3 z-10 rounded bg-white/95 px-2 py-1 shadow" aria-label="Scale bar">
            <div className="flex" style={{ width: wpx }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={i % 2 ? 'h-2 flex-1 border border-navy bg-white' : 'h-2 flex-1 border border-navy bg-navy'} />
              ))}
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] font-semibold text-navy" style={{ width: wpx }}>
              <span>0</span>
              <span>{formatLength(ft * 6, settings.units)}</span>
              <span>{formatLength(ft * 12, settings.units)}</span>
            </div>
          </div>
        );
      })()}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow">
        <button className="rounded p-1 hover:bg-slate-100" onClick={() => zoomBy(1 / 1.25)} title="Zoom out" aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-14 text-center text-xs tabular-nums text-slate-600">{Math.round(view.k * 100)}%</span>
        <button className="rounded p-1 hover:bg-slate-100" onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </button>
        <button className="rounded p-1 hover:bg-slate-100" onClick={fit} title="Fit to screen" aria-label="Fit to screen">
          <Maximize className="h-4 w-4" />
        </button>
      </div>

      {/* Status / hints */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded bg-navy/85 sm:block px-2 py-1 text-[11px] text-white shadow">
        {cursor ? `${fmt(cursor.x)}, ${fmt(cursor.y)}` : '—'} · {TOOL_HINT[tool]}
      </div>
      {/* Turn bar for the selected cubicles / desks */}
      {turnBar && (
        <div
          className="absolute z-10 flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600 shadow"
          style={{ left: turnBar.left, top: turnBar.top, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button className="rounded p-1 hover:bg-slate-100" title="Rotate 90° counter-clockwise (Shift+R)" onClick={() => store.getState().setObjects((o) => rotateObjects(o, selectedIds, -90))}>
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-1 hover:bg-slate-100" title="Rotate 90° clockwise (R)" onClick={() => store.getState().setObjects((o) => rotateObjects(o, selectedIds, 90))}>
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          {turnBar.furniture && (
            <>
              <span className="ml-1.5 mr-0.5 whitespace-nowrap">Opening faces</span>
              {([['up', ArrowUp], ['right', ArrowRight], ['down', ArrowDown], ['left', ArrowLeft]] as [Facing, typeof ArrowUp][]).map(([dir, Icon]) => (
                <button
                  key={dir}
                  className={`rounded p-1 hover:bg-slate-100 ${turnBar.facing === dir ? 'bg-teal-100 text-teal-600' : ''}`}
                  title={`Turn so the opening / front faces ${dir}`}
                  onClick={() => store.getState().setObjects((o) => faceObjects(o, selectedIds, dir))}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {measure && tool === 'measure' && draft.length === 0 && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs shadow">
          <span className="font-semibold text-measure">Measured {fmt(dist(measure.a, measure.b))}</span>
          <button className="rounded bg-measure px-2 py-0.5 text-white" onClick={() => {
            store.getState().addObjects([makeDimension(measure.a, measure.b, -18)]);
            setMeasure(null);
          }}>
            Keep as dimension
          </button>
          <button className="text-slate-500" onClick={() => setMeasure(null)}>Clear</button>
        </div>
      )}
      {bg && !bg.calibrated && bg.visible && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 shadow">⚠ Imported plan not calibrated</div>
      )}
    </div>
  );
}

const TOOL_HINT: Record<string, string> = {
  select: 'Click to select · Shift-click to add · Drag empty space to pan · Shift+drag to box-select · R rotates the selection · Double-click a name to edit',
  pan: 'Drag to pan · Scroll to zoom',
  measure: 'Click two points to measure (snaps to walls/corners; hold Alt to disable)',
  calibrate: 'Click two points on a known dimension of the imported plan',
  wall: 'Click to start, click to add segments · Double-click or Esc to finish',
  room: 'Click corners · Click the first point, double-click or Enter to close',
  door: 'Click near a wall to place a door',
  label: 'Click to place a label',
  dimension: 'Click two points to add a dimension line',
  aisle: 'Drag a rectangle to define a walking aisle',
};

export { distPointSegment };
