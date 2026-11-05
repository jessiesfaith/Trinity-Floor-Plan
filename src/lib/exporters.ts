// PNG / SVG / PDF export built on renderSvg(), so exports always match the model.

import type { Project } from '@/types/plan';
import { activeScenario } from '@/store/usePlanStore';
import { computeCapacity } from './capacity';
import { downloadBlob, safeFileName } from './persistence';
import { renderSvg, type SvgOptions } from './svgRender';
import { validate, PROFESSIONAL_REVIEW_NOTICE } from './validation';
import { formatArea } from './units';
import { contentBounds } from './svgRender';

export interface ExportOptions {
  view: '2d' | 'presentation';
  showDimensions: boolean;
  showFurnitureLabels: boolean;
  showRoomAreas: boolean;
  showSeatCounts: boolean;
  showLegend: boolean;
  showInventory: boolean;
  showVersionAndDate: boolean;
  includeBackground: boolean;
  /** Paper inches per real foot (e.g. 0.25 = 1/4" = 1'-0"); null = fit to page. */
  printScale: number | null;
}

export const DEFAULT_EXPORT: ExportOptions = {
  view: '2d',
  showDimensions: true,
  showFurnitureLabels: true,
  showRoomAreas: true,
  showSeatCounts: true,
  showLegend: true,
  showInventory: true,
  showVersionAndDate: true,
  includeBackground: false,
  printScale: null,
};

export function canPrintToScale(p: Project): { ok: boolean; reason?: string } {
  if (p.background && !p.background.calibrated && p.background.visible) {
    return { ok: false, reason: 'Calibrate the imported floor plan (or hide it) before printing to scale.' };
  }
  return { ok: true };
}

function titleLines(p: Project, o: ExportOptions): string[] {
  const s = activeScenario(p);
  const v = validate(s.objects, p.settings, { background: p.background });
  const c = computeCapacity(s.objects, v);
  const lines = [`${p.name}${p.address ? ` · ${p.address}` : ''} — ${s.name}`];
  if (o.showVersionAndDate) lines.push(`Layout version r${s.revision} · Exported ${new Date().toLocaleString()} · ${o.printScale ? `Scale ${scaleLabel(o.printScale)}` : 'Not to scale'}`);
  if (o.showSeatCounts) lines.push(`Workstations ${c.totalWorkstations} · Seats ${c.totalSeats} (feasible ${c.feasibleSeats}) · Conflicts ${c.conflicts}`);
  if (o.showRoomAreas)
    lines.push(c.cubicleAreas.map((a) => `${a.name.split('—')[0].trim()}: ${a.areaSqft.toFixed(0)} sq ft, ${a.seats} seats`).join(' · '));
  lines.push('Planning document — not verified for ADA, fire/egress or building code. Professional review required.');
  return lines;
}

export const scaleLabel = (paperInPerFt: number) => {
  const map: Record<string, string> = { '0.125': '1/8" = 1\'-0"', '0.1875': '3/16" = 1\'-0"', '0.25': '1/4" = 1\'-0"', '0.5': '1/2" = 1\'-0"' };
  return map[String(paperInPerFt)] ?? `${paperInPerFt}" = 1'-0"`;
};

export function buildSvg(p: Project, o: ExportOptions, extra: Partial<SvgOptions> = {}) {
  const s = activeScenario(p);
  return renderSvg(s.objects, p.settings, {
    view: o.view,
    showDimensions: o.showDimensions,
    showFurnitureLabels: o.showFurnitureLabels,
    showRoomAreas: o.showRoomAreas,
    showSeatCounts: o.showSeatCounts,
    showLegend: o.showLegend,
    background: o.includeBackground ? p.background : undefined,
    layers: p.layers,
    titleBlock: titleLines(p, o),
    header: p.address || undefined,
    inventory: o.showInventory ? p.inventory : undefined,
    ...extra,
  });
}

export function exportSvg(p: Project, o: ExportOptions) {
  const { svg } = buildSvg(p, o);
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${safeFileName(p.name)}_${safeFileName(activeScenario(p).name)}.svg`);
}

export async function svgToPngDataUrl(svg: string, width: number, height: number, scale = 1): Promise<string> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not rasterize the SVG.'));
      img.src = url;
    });
    const maxSide = 12000;
    const k = Math.min(scale, maxSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * k);
    canvas.height = Math.round(height * k);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(p: Project, o: ExportOptions) {
  const { svg, width, height } = buildSvg(p, o, { pxPerInch: 2 });
  const data = await svgToPngDataUrl(svg, width, height, 2.5);
  const blob = await (await fetch(data)).blob();
  downloadBlob(blob, `${safeFileName(p.name)}_${safeFileName(activeScenario(p).name)}.png`);
}

const PAPERS: [string, number, number][] = [
  ['letter', 11, 8.5],
  ['tabloid', 17, 11],
  ['arch c', 24, 18],
  ['arch d', 36, 24],
  ['arch e', 48, 36],
];

export async function exportPdf(p: Project, o: ExportOptions, mode: 'download' | 'print' = 'download') {
  const { jsPDF } = await import('jspdf');
  const s = activeScenario(p);
  const { svg, width, height } = buildSvg(p, o, { pxPerInch: 2 });
  const png = await svgToPngDataUrl(svg, width, height, 2);
  const margin = 0.5;
  let paper = PAPERS[1];
  let imgW: number;
  let imgH: number;
  if (o.printScale) {
    // The SVG viewBox is in plan inches (content + padding + title/legend).
    const vbW = width / 2;
    const vbH = height / 2;
    imgW = (vbW / 12) * o.printScale;
    imgH = (vbH / 12) * o.printScale;
    paper = PAPERS.find(([, w, h]) => w - 2 * margin >= imgW && h - 2 * margin >= imgH) ?? PAPERS[PAPERS.length - 1];
  } else {
    const ar = width / height;
    imgW = paper[1] - 2 * margin;
    imgH = imgW / ar;
    if (imgH > paper[2] - 2 * margin - 0.6) {
      imgH = paper[2] - 2 * margin - 0.6;
      imgW = imgH * ar;
    }
  }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [paper[1], paper[2]] });
  doc.setProperties({ title: `${p.name} — ${s.name}`, subject: 'Office floor plan', creator: 'Trinity Floor Plan' });
  doc.addImage(png, 'PNG', margin, margin, imgW, imgH, undefined, 'FAST');
  doc.setFontSize(7);
  doc.setTextColor(214, 40, 40);
  doc.text(PROFESSIONAL_REVIEW_NOTICE, margin, paper[2] - 0.25, { maxWidth: paper[1] - 2 * margin });
  if (o.printScale) {
    doc.setTextColor(20, 33, 61);
    doc.text(`Printed at ${scaleLabel(o.printScale)} on ${paper[0].toUpperCase()} (${paper[1]}" x ${paper[2]}"). Print at 100% / "actual size". Verify with the scale bar.`, margin, paper[2] - 0.4);
    // Scale bar: 10 ft.
    const bar = (10 * o.printScale);
    const y = paper[2] - 0.6;
    doc.setDrawColor(20, 33, 61);
    doc.setLineWidth(0.01);
    doc.rect(paper[1] - margin - bar, y - 0.06, bar, 0.06);
    doc.text("0", paper[1] - margin - bar, y - 0.1);
    doc.text("10'", paper[1] - margin - 0.1, y - 0.1);
  }
  // Page 2: area + capacity table.
  if (o.showRoomAreas || o.showSeatCounts) {
    const v = validate(s.objects, p.settings, { background: p.background });
    const c = computeCapacity(s.objects, v);
    doc.addPage([paper[1], paper[2]], 'landscape');
    doc.setTextColor(20, 33, 61);
    doc.setFontSize(14);
    doc.text(`${s.name} — area & capacity`, margin, margin + 0.2);
    doc.setFontSize(9);
    let y = margin + 0.6;
    doc.text('Room', margin, y);
    doc.text('Area', margin + 3.2, y);
    doc.text('Workstations', margin + 4.4, y);
    doc.text('Seats (feasible)', margin + 5.6, y);
    doc.text('Target', margin + 7, y);
    doc.text('Conflicts', margin + 8, y);
    y += 0.08;
    doc.line(margin, y, Math.min(paper[1] - margin, margin + 9), y);
    for (const r of c.rooms) {
      y += 0.22;
      if (y > paper[2] - margin) break;
      doc.text(r.name.slice(0, 48), margin, y);
      doc.text(formatArea(r.areaSqft * 144, p.settings.units), margin + 3.2, y);
      doc.text(String(r.workstations), margin + 4.4, y);
      doc.text(`${r.seats} (${r.feasibleSeats})`, margin + 5.6, y);
      doc.text(r.targetMin ? `${r.targetMin}–${r.targetMax}` : '', margin + 7, y);
      doc.text(String(r.conflicts), margin + 8, y);
    }
    y += 0.4;
    doc.text(`Total: ${c.totalWorkstations} workstations, ${c.totalSeats} seats (${c.feasibleSeats} without conflicts), ${c.assigned} assigned, ${c.unassigned} unassigned.`, margin, y);
    y += 0.25;
    doc.text(`Minimum measured aisle clearance: ${c.minAisleMeasured === null ? 'n/a' : `${c.minAisleMeasured.toFixed(1)}"`} · Layout conflicts: ${c.conflicts}`, margin, y);
    y += 0.25;
    if (p.background && !p.background.calibrated) doc.text('WARNING: the imported floor plan is not calibrated.', margin, y);
  }
  const name = `${safeFileName(p.name)}_${safeFileName(s.name)}.pdf`;
  if (mode === 'print') {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else {
    doc.save(name);
  }
}

export { contentBounds };
