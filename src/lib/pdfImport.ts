// PDF.js import. The PDF is rasterized page-by-page for display; the original
// bytes are kept untouched (base64) so the source drawing is preserved and any
// page can be re-rendered later. No vector geometry is assumed or extracted.

import type { Background } from '@/types/plan';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return m;
    });
  }
  return pdfjsPromise;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function renderPdfPage(bytes: Uint8Array, page: number, targetLongSide = 3000) {
  const pdfjs = await loadPdfJs();
  // pdf.js transfers the buffer to its worker; give it a copy so the original stays intact.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
  const base = p.getViewport({ scale: 1 });
  const scale = targetLongSide / Math.max(base.width, base.height);
  const vp = p.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport: vp }).promise;
  const result = { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, pageCount: doc.numPages, pointsPerPixel: 1 / scale };
  await doc.destroy();
  return result;
}

/**
 * Import a PDF or image as the background layer. Initial scale assumes the PDF's
 * page is in points at 1/8" = 1'-0" — explicitly UNCALIBRATED until the user
 * calibrates against a known dimension.
 */
export async function importBackgroundFile(file: File, page = 1): Promise<Background> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const r = await renderPdfPage(bytes, page);
    // 72 pt per paper inch; at 1/8" = 1' one paper inch = 96 real inches.
    const planInchesPerPixel = (r.pointsPerPixel / 72) * 96;
    return {
      fileName: file.name,
      sourceType: 'pdf',
      originalBase64: bytesToBase64(bytes),
      page,
      pageCount: r.pageCount,
      imageDataUrl: r.dataUrl,
      imageWidth: r.width,
      imageHeight: r.height,
      x: 0,
      y: 0,
      scale: planInchesPerPixel,
      rotation: 0,
      opacity: 0.55,
      visible: true,
      locked: true,
      calibrated: false,
    };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Unsupported image.'));
    img.src = dataUrl;
  });
  return {
    fileName: file.name,
    sourceType: 'image',
    originalBase64: undefined,
    page: 1,
    pageCount: 1,
    imageDataUrl: dataUrl,
    imageWidth: dims.w,
    imageHeight: dims.h,
    x: 0,
    y: 0,
    scale: 1000 / Math.max(dims.w, dims.h),
    rotation: 0,
    opacity: 0.55,
    visible: true,
    locked: true,
    calibrated: false,
  };
}

/** Re-render a different page of the stored original PDF, keeping placement. */
export async function changePdfPage(bg: Background, page: number): Promise<Background> {
  if (bg.sourceType !== 'pdf' || !bg.originalBase64) return bg;
  const r = await renderPdfPage(base64ToBytes(bg.originalBase64), page);
  const k = bg.imageWidth / r.width; // keep physical scale if raster size differs
  return { ...bg, page, imageDataUrl: r.dataUrl, imageWidth: r.width, imageHeight: r.height, scale: bg.scale * k, crop: undefined, calibrated: bg.calibrated };
}

/** Calibrate from two points measured on the background and the user's known real distance. */
export function calibrate(bg: Background, measuredPlanInches: number, realInches: number): Background {
  if (measuredPlanInches <= 0 || realInches <= 0) return bg;
  const k = realInches / measuredPlanInches;
  return {
    ...bg,
    scale: bg.scale * k,
    calibrated: true,
    calibration: { measuredInches: measuredPlanInches, realInches, date: new Date().toISOString() },
  };
}
