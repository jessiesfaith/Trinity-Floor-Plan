// Pure SVG rendering of a layout from the same data the editor uses. Powers SVG
// export, the PDF export raster, scenario thumbnails and generator previews, so
// every output reflects the editable model (no flattened images).

import type { InventoryItem, Background, Dimension, Door, Furniture, LayerState, PlanObject, PlanSettings, Pt, Room, TextLabel, Wall, Aisle } from '@/types/plan';
import { bbox, centroid, rotatePt, add, sub, len, norm, perp, scale } from './geometry';
import { doorLatch, footprint, pointsOf, roomArea, roomAt, wallPolygon } from './objects';
import { formatArea, formatLength } from './units';
import { groupInventory } from './inventory';
import { cubeWallColor } from './cubicleParts';

export interface SvgOptions {
  view: '2d' | 'presentation';
  showDimensions: boolean;
  showFurnitureLabels: boolean;
  showRoomAreas: boolean;
  showSeatCounts: boolean;
  showLegend: boolean;
  highlightIds?: Set<string>;
  background?: Background;
  layers?: LayerState[];
  padding?: number;
  /** Footer / title block lines. */
  titleBlock?: string[];
  /** Header across the top (e.g. the street address). */
  header?: string;
  /** Furniture inventory, listed under the plan. */
  inventory?: InventoryItem[];
  pxPerInch?: number;
  /** Override the drawing bounds (e.g. crop a preview to one room). */
  bounds?: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pts = (p: Pt[]) => p.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');

export function contentBounds(objects: PlanObject[], background?: Background) {
  const all: Pt[] = objects.flatMap(pointsOf);
  if (background && background.visible && background.imageDataUrl) {
    const w = (background.crop?.width ?? background.imageWidth) * background.scale;
    const h = (background.crop?.height ?? background.imageHeight) * background.scale;
    const o = { x: background.x, y: background.y };
    [o, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].forEach((p, i) => all.push(i === 0 ? o : add(o, rotatePt(p, background.rotation))));
  }
  if (!all.length) return { minX: 0, minY: 0, maxX: 480, maxY: 360, width: 480, height: 360 };
  return bbox(all);
}

function visible(layers: LayerState[] | undefined, id: string) {
  return !layers || layers.find((l) => l.id === id)?.visible !== false;
}

export function furnitureSymbol(f: Furniture, view: '2d' | 'presentation', stroke: string): string {
  // Drawn in the furniture's local frame (centered, front = +y).
  const w = f.width;
  const d = f.depth;
  const hw = w / 2;
  const hd = d / 2;
  const fill = view === 'presentation' ? f.color : '#ffffff';
  const sw = view === 'presentation' ? 0.8 : 1;
  const parts: string[] = [];
  const chair = (cx: number, cy: number, rot: number) =>
    `<g transform="translate(${cx},${cy}) rotate(${rot})"><rect x="-9" y="-8" width="18" height="16" rx="4" fill="${view === 'presentation' ? '#3d4b66' : '#fff'}" stroke="${stroke}" stroke-width="0.8"/><rect x="-9" y="5" width="18" height="4" rx="2" fill="${view === 'presentation' ? '#2a3550' : '#fff'}" stroke="${stroke}" stroke-width="0.6"/></g>`;
  switch (f.type) {
    case 'cubicle': {
      const t = 2.5;
      // Panels on back and both sides; open front (+y).
      parts.push(`<rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" fill="${view === 'presentation' ? '#f7fbfb' : '#fff'}" stroke="none"/>`);
      parts.push(`<path d="M${-hw},${hd} L${-hw},${-hd} L${hw},${-hd} L${hw},${hd}" fill="none" stroke="${stroke}" stroke-width="${t}"/>`);
      // Work surface along the back and one side (L).
      const ds = Math.min(24, d * 0.5);
      parts.push(`<path d="M${-hw + t},${-hd + t} H${hw - t} V${-hd + ds} H${-hw + ds} V${hd - 4} H${-hw + t} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 0.6}"/>`);
      if (view === 'presentation') parts.push(chair(hw * 0.25, hd * 0.35, 0));
      break;
    }
    case 'chair':
      parts.push(chair(0, 0, 0).replace('translate(0,0)', 'translate(0,0) scale(' + (w / 22).toFixed(2) + ')'));
      break;
    case 'shared-desk':
    case 'bench': {
      parts.push(`<rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
      parts.push(`<line x1="${-hw}" y1="0" x2="${hw}" y2="0" stroke="${stroke}" stroke-width="1.6"/>`);
      const per = Math.max(1, Math.round(f.seats / 2));
      for (let i = 0; i < per; i++) {
        const cx = -hw + (w / per) * (i + 0.5);
        parts.push(`<line x1="${-hw + (w / per) * i}" y1="${-hd}" x2="${-hw + (w / per) * i}" y2="${hd}" stroke="${stroke}" stroke-width="0.4"/>`);
        if (view === 'presentation') {
          parts.push(chair(cx, hd + 10, 0));
          parts.push(chair(cx, -hd - 10, 180));
        }
      }
      break;
    }
    case 'l-desk': {
      const ds = Math.min(30, d * 0.5);
      parts.push(`<path d="M${-hw},${-hd} H${hw} V${-hd + ds} H${-hw + ds} V${hd} H${-hw} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
      break;
    }
    case 'conference-table':
      parts.push(`<rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="${Math.min(hd, 18)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
      break;
    case 'plant':
      parts.push(`<circle r="${Math.min(hw, hd)}" fill="${view === 'presentation' ? '#7fb77e' : '#fff'}" stroke="${stroke}" stroke-width="${sw}"/>`);
      parts.push(`<circle r="${Math.min(hw, hd) * 0.45}" fill="none" stroke="${stroke}" stroke-width="0.5"/>`);
      break;
    case 'phone-booth': {
      const t = 3;
      parts.push(`<rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" fill="${fill}" stroke="none"/>`);
      parts.push(`<path d="M${-hw + t / 2},${hd} V${-hd + t / 2} H${hw - t / 2} V${hd}" fill="none" stroke="${stroke}" stroke-width="${t}"/>`);
      parts.push(`<line x1="${-hw + t}" y1="${hd - 0.8}" x2="${hw - t}" y2="${hd - 0.8}" stroke="#5aa9c9" stroke-width="1.6"/>`);
      parts.push(`<rect x="${-hw + t}" y="${-hd + t}" width="${w - 2 * t}" height="${Math.min(12, d * 0.3)}" fill="none" stroke="${stroke}" stroke-width="0.6"/><circle cy="${hd * 0.25}" r="${Math.min(7, w * 0.18)}" fill="none" stroke="${stroke}" stroke-width="0.6"/>`);
      break;
    }
    case 'printer':
      parts.push(`<rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/><rect x="${-hw * 0.6}" y="${-hd * 0.6}" width="${w * 0.6}" height="${d * 0.4}" fill="none" stroke="${stroke}" stroke-width="0.5"/>`);
      break;
    case 'filing-cabinet':
    case 'storage-cabinet':
    case 'shelving':
      parts.push(`<rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/><line x1="${-hw}" y1="${-hd}" x2="${hw}" y2="${hd}" stroke="${stroke}" stroke-width="0.4"/><line x1="${hw}" y1="${-hd}" x2="${-hw}" y2="${hd}" stroke="${stroke}" stroke-width="0.4"/>`);
      break;
    case 'partition': {
      const c = cubeWallColor(f) ?? stroke;
      parts.push(`<rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" fill="${c}" stroke="${c}" stroke-width="0.5"/>`);
      break;
    }
    default:
      parts.push(`<rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
      if (f.isWorkstation && view === 'presentation') parts.push(chair(0, hd + 10, 0));
  }
  return parts.join('');
}

export function dimensionGeometry(d: Dimension) {
  const dir = norm(sub(d.b, d.a));
  const n = perp(dir);
  const off = scale(n, d.offset);
  const a2 = add(d.a, off);
  const b2 = add(d.b, off);
  const mid = scale(add(a2, b2), 0.5);
  let ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  return { a2, b2, mid, ang, length: len(sub(d.b, d.a)), n };
}

export function renderSvg(objects: PlanObject[], settings: PlanSettings, opts: SvgOptions): { svg: string; width: number; height: number } {
  const pad = opts.padding ?? 36;
  const b = opts.bounds ?? contentBounds(objects, opts.background);
  const titleH = opts.titleBlock?.length ? 18 * opts.titleBlock.length + 24 : 0;
  const legendH = opts.showLegend ? 70 : 0;
  const headerH = opts.header ? 34 : 0;
  // Inventory: whole groups (heading + rows) flow into columns about 300" wide.
  type InvLine = { text: string; qty?: string; size?: string; heading?: boolean };
  const invGroups: InvLine[][] = groupInventory(opts.inventory ?? []).map((g) => [
    { text: g.area, heading: true },
    ...g.items.map((x) => ({ text: x.item, qty: x.qty == null ? '?' : String(x.qty), size: x.size })),
  ]);
  const invCols = Math.max(1, Math.min(4, Math.floor(b.width / 300)));
  const invTotal = invGroups.reduce((n, g) => n + g.length, 0);
  const invTarget = Math.ceil(invTotal / invCols);
  const invColumns: InvLine[][] = [[]];
  for (const g of invGroups) {
    const col = invColumns[invColumns.length - 1];
    if (col.length && col.length + g.length > invTarget + 2 && invColumns.length < invCols) invColumns.push([...g]);
    else col.push(...g);
  }
  const invRows = Math.max(0, ...invColumns.map((c) => c.length));
  const invH = invTotal ? 26 + invRows * 12 + 14 : 0;
  const vw = b.width + pad * 2;
  const vh = b.height + pad * 2 + titleH + legendH + headerH + invH;
  const k = opts.pxPerInch ?? 2;
  const pres = opts.view === 'presentation';
  const stroke = '#14213d';
  const red = '#d62828';
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" overflow="hidden" width="${(vw * k).toFixed(0)}" height="${(vh * k).toFixed(0)}" viewBox="${b.minX - pad} ${b.minY - pad - headerH} ${vw} ${vh}" font-family="Inter, Helvetica, Arial, sans-serif">`,
  );
  out.push(`<rect x="${b.minX - pad}" y="${b.minY - pad - headerH}" width="${vw}" height="${vh}" fill="#ffffff"/>`);
  if (opts.header) out.push(`<text x="${b.minX + b.width / 2}" y="${b.minY - pad - headerH + 26}" font-size="18" font-weight="bold" text-anchor="middle" fill="#14213d">${esc(opts.header)}</text>`);

  const bg = opts.background;
  if (bg && bg.visible && bg.imageDataUrl && visible(opts.layers, 'background')) {
    const c = bg.crop ?? { x: 0, y: 0, width: bg.imageWidth, height: bg.imageHeight };
    out.push(
      `<g transform="translate(${bg.x},${bg.y}) rotate(${bg.rotation}) scale(${bg.scale})" opacity="${bg.opacity}"><svg x="0" y="0" width="${c.width}" height="${c.height}" viewBox="${c.x} ${c.y} ${c.width} ${c.height}"><image href="${bg.imageDataUrl}" width="${bg.imageWidth}" height="${bg.imageHeight}"/></svg></g>`,
    );
  }

  const rooms = objects.filter((o): o is Room => o.kind === 'room');
  const hi = opts.highlightIds ?? new Set<string>();
  if (visible(opts.layers, 'rooms')) {
    for (const r of rooms) {
      out.push(`<polygon points="${pts(r.points)}" fill="${pres ? r.fill : '#ffffff'}" fill-opacity="${pres ? 1 : 0}" stroke="${pres ? '#c4ccd8' : '#9aa5b8'}" stroke-width="${pres ? 0.8 : 0.6}" stroke-dasharray="${pres ? '' : '4 3'}"/>`);
    }
  }
  if (visible(opts.layers, 'aisles')) {
    for (const a of objects.filter((o): o is Aisle => o.kind === 'aisle')) {
      out.push(`<polygon points="${pts(footprint(a))}" fill="${a.color}" fill-opacity="0.25" stroke="${a.color}" stroke-dasharray="6 4" stroke-width="1"/>`);
    }
  }
  if (visible(opts.layers, 'walls')) {
    for (const w of objects.filter((o): o is Wall => o.kind === 'wall')) {
      out.push(`<polygon points="${pts(wallPolygon(w))}" fill="${pres ? '#2b3550' : w.color}" stroke="none"/>`);
    }
  }
  if (visible(opts.layers, 'doors')) {
    for (const d of objects.filter((o): o is Door => o.kind === 'door')) {
      const latch = doorLatch(d);
      const open = add({ x: d.x, y: d.y }, rotatePt({ x: d.width, y: 0 }, d.rotation + 90 * d.swing));
      const sweep = d.swing === 1 ? 1 : 0;
      out.push(`<line x1="${d.x}" y1="${d.y}" x2="${open.x}" y2="${open.y}" stroke="${stroke}" stroke-width="1.4"/>`);
      out.push(`<path d="M${latch.x},${latch.y} A${d.width},${d.width} 0 0 ${sweep} ${open.x},${open.y}" fill="none" stroke="${stroke}" stroke-width="0.6" stroke-dasharray="3 2"/>`);
    }
  }
  if (visible(opts.layers, 'furniture')) {
    for (const f of objects.filter((o): o is Furniture => o.kind === 'furniture')) {
      const st = hi.has(f.id) ? red : stroke;
      out.push(`<g transform="translate(${f.x},${f.y}) rotate(${f.rotation})">${furnitureSymbol(f, opts.view, st)}</g>`);
      if (opts.showFurnitureLabels && f.type !== 'chair' && f.width >= 30) {
        const who = f.assignedTo.filter(Boolean).join(', ');
        const fs = Math.min(7, f.width / 7);
        out.push(`<text x="${f.x}" y="${f.y + 2}" font-size="${fs}" text-anchor="middle" fill="${st}">${esc(f.name)}</text>`);
        if (who) out.push(`<text x="${f.x}" y="${f.y + 2 + fs * 1.2}" font-size="${fs * 0.85}" text-anchor="middle" fill="#0b7f7c">${esc(who)}</text>`);
      }
    }
  }
  if (visible(opts.layers, 'annotations')) {
    for (const r of rooms) {
      if (r.hideLabel) continue;
      const c = add(centroid(r.points), r.label.offset);
      const fs = r.label.fontSize;
      const wsCount = opts.showSeatCounts
        ? objects.filter((o): o is Furniture => o.kind === 'furniture' && o.isWorkstation && roomAt(objects, { x: o.x, y: o.y })?.id === r.id).reduce((a, f) => a + f.seats, 0)
        : 0;
      const lines = [r.name];
      if (opts.showRoomAreas && r.showArea) lines.push(formatArea(roomArea(r), settings.units));
      if (opts.showSeatCounts && wsCount) lines.push(`${wsCount} seat${wsCount === 1 ? '' : 's'}`);
      const anchor = r.label.align === 'left' ? 'start' : r.label.align === 'right' ? 'end' : 'middle';
      out.push(`<g transform="translate(${c.x},${c.y}) rotate(${r.label.rotation})">`);
      if (r.label.background) out.push(`<rect x="${-r.name.length * fs * 0.3}" y="${-fs}" width="${r.name.length * fs * 0.6}" height="${fs * 1.3 * lines.length}" fill="${r.label.background}" rx="2"/>`);
      lines.forEach((t, i) =>
        out.push(`<text y="${i * fs * 1.15}" font-size="${i === 0 ? fs : fs * 0.75}" font-weight="${i === 0 ? r.label.fontWeight : 'normal'}" text-anchor="${anchor}" fill="${i === 0 ? r.label.color : '#4a5670'}">${esc(t)}</text>`),
      );
      out.push('</g>');
    }
    for (const l of objects.filter((o): o is TextLabel => o.kind === 'label')) {
      if (l.callout) out.push(`<line x1="${l.x}" y1="${l.y}" x2="${l.callout.x}" y2="${l.callout.y}" stroke="${l.style.color}" stroke-width="0.8"/><circle cx="${l.callout.x}" cy="${l.callout.y}" r="2" fill="${l.style.color}"/>`);
      const anchor = l.style.align === 'left' ? 'start' : l.style.align === 'right' ? 'end' : 'middle';
      out.push(`<g transform="translate(${l.x},${l.y}) rotate(${l.style.rotation})">`);
      const lines = l.text.split('\n');
      if (l.style.background) {
        const wmax = Math.max(...lines.map((t) => t.length)) * l.style.fontSize * 0.55;
        const x0 = anchor === 'middle' ? -wmax / 2 : anchor === 'end' ? -wmax : 0;
        out.push(`<rect x="${x0 - 3}" y="${-l.style.fontSize}" width="${wmax + 6}" height="${l.style.fontSize * 1.25 * lines.length + 2}" fill="${l.style.background}" rx="2"/>`);
      }
      lines.forEach((t, i) => out.push(`<text y="${i * l.style.fontSize * 1.2}" font-size="${l.style.fontSize}" font-weight="${l.style.fontWeight}" text-anchor="${anchor}" fill="${l.style.color}">${esc(t)}</text>`));
      out.push('</g>');
    }
    if (opts.showDimensions) {
      for (const d of objects.filter((o): o is Dimension => o.kind === 'dimension')) {
        const g = dimensionGeometry(d);
        const text = d.labelOverride?.trim() ? `${d.labelOverride}*` : formatLength(g.length, settings.units);
        const ext1 = add(d.a, scale(g.n, d.offset + Math.sign(d.offset || 1) * 4));
        const ext2 = add(d.b, scale(g.n, d.offset + Math.sign(d.offset || 1) * 4));
        out.push(`<g stroke="${d.color}" stroke-width="0.7" fill="none"><line x1="${d.a.x}" y1="${d.a.y}" x2="${ext1.x}" y2="${ext1.y}"/><line x1="${d.b.x}" y1="${d.b.y}" x2="${ext2.x}" y2="${ext2.y}"/><line x1="${g.a2.x}" y1="${g.a2.y}" x2="${g.b2.x}" y2="${g.b2.y}"/></g>`);
        for (const p of [g.a2, g.b2]) out.push(`<line x1="${p.x - 3}" y1="${p.y + 3}" x2="${p.x + 3}" y2="${p.y - 3}" stroke="${d.color}" stroke-width="1.2" transform="rotate(${g.ang} ${p.x} ${p.y})"/>`);
        out.push(`<g transform="translate(${g.mid.x},${g.mid.y}) rotate(${g.ang})"><rect x="${-text.length * 2.6}" y="-11" width="${text.length * 5.2}" height="9" fill="#fff"/><text y="-4" font-size="8" text-anchor="middle" fill="${d.color}" font-weight="600">${esc(text)}</text></g>`);
      }
    }
  }
  let y = b.maxY + pad;
  if (opts.showLegend) {
    const x0 = b.minX;
    const items: [string, string][] = [
      ['#14213d', 'Wall'],
      ['#cfe8e7', 'Workstation'],
      ['#f6d365', 'Aisle zone'],
      [red, 'Dimension / conflict'],
    ];
    out.push(`<text x="${x0}" y="${y}" font-size="10" font-weight="bold" fill="${stroke}">Legend</text>`);
    items.forEach(([c, t], i) => {
      const x = x0 + i * 130;
      out.push(`<rect x="${x}" y="${y + 8}" width="16" height="10" fill="${c}" stroke="${stroke}" stroke-width="0.5"/><text x="${x + 22}" y="${y + 17}" font-size="9" fill="${stroke}">${t}</text>`);
    });
    out.push(`<path d="M${x0 + 4},${y + 50} a12,12 0 0 1 12,-12" fill="none" stroke="${stroke}" stroke-dasharray="3 2" stroke-width="0.7"/><line x1="${x0 + 4}" y1="${y + 50}" x2="${x0 + 4}" y2="${y + 38}" stroke="${stroke}"/><text x="${x0 + 22}" y="${y + 48}" font-size="9" fill="${stroke}">Door swing</text>`);
    y += legendH;
  }
  if (invTotal) {
    const colW = b.width / invCols;
    out.push(`<text x="${b.minX}" y="${y}" font-size="11" font-weight="bold" fill="${stroke}">Furniture inventory</text>`);
    invColumns.forEach((col, ci) =>
      col.forEach((l, i) => {
        const x = b.minX + ci * colW;
        const ly = y + 22 + i * 12;
        if (l.heading) out.push(`<text x="${x}" y="${ly}" font-size="8.5" font-weight="bold" fill="#0f766e">${esc(l.text.toUpperCase())}</text>`);
        else
          out.push(
            `<text x="${x + 16}" y="${ly}" font-size="9" font-weight="bold" text-anchor="end" fill="${stroke}">${esc(l.qty ?? '')}</text><text x="${x + 22}" y="${ly}" font-size="9" fill="${stroke}">${esc(l.text)}${l.size ? `<tspan fill="#64748b">  ${esc(l.size)}</tspan>` : ''}</text>`,
          );
      }),
    );
    y += invH;
  }
  if (opts.titleBlock?.length) {
    out.push(`<rect x="${b.minX}" y="${y}" width="${b.width}" height="${titleH - 8}" fill="#14213d"/>`);
    opts.titleBlock.forEach((t, i) => out.push(`<text x="${b.minX + 10}" y="${y + 18 + i * 18}" font-size="${i === 0 ? 12 : 9}" font-weight="${i === 0 ? 'bold' : 'normal'}" fill="#ffffff">${esc(t)}</text>`));
  }
  out.push('</svg>');
  return { svg: out.join(''), width: vw * k, height: vh * k };
}
