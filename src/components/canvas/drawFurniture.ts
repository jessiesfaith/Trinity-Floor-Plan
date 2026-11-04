// Canvas-2D furniture symbols (Konva sceneFunc). Mirrors lib/svgRender.ts
// furnitureSymbol() so the editor, presentation view and exports agree.

import type { Furniture } from '@/types/plan';

type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function chair(ctx: Ctx, cx: number, cy: number, rot: number, pres: boolean, stroke: string, k = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(k, k);
  rr(ctx, -9, -8, 18, 16, 4);
  ctx.fillStyle = pres ? '#3d4b66' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  rr(ctx, -9, 5, 18, 4, 2);
  ctx.fillStyle = pres ? '#2a3550' : '#ffffff';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawFurniture(ctx: Ctx, f: Furniture, pres: boolean, stroke: string, conflict: boolean) {
  const w = f.width;
  const d = f.depth;
  const hw = w / 2;
  const hd = d / 2;
  const fill = pres ? f.color : '#ffffff';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = 1;
  const box = () => {
    ctx.beginPath();
    ctx.rect(-hw, -hd, w, d);
    ctx.fill();
    ctx.stroke();
  };
  switch (f.type) {
    case 'cubicle': {
      ctx.fillStyle = pres ? '#f7fbfb' : '#ffffff';
      ctx.fillRect(-hw, -hd, w, d);
      const t = 2.5;
      const ds = Math.min(24, d * 0.5);
      ctx.beginPath();
      ctx.moveTo(-hw + t, -hd + t);
      ctx.lineTo(hw - t, -hd + t);
      ctx.lineTo(hw - t, -hd + ds);
      ctx.lineTo(-hw + ds, -hd + ds);
      ctx.lineTo(-hw + ds, hd - 4);
      ctx.lineTo(-hw + t, hd - 4);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.lineWidth = 0.6;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-hw, hd);
      ctx.lineTo(-hw, -hd);
      ctx.lineTo(hw, -hd);
      ctx.lineTo(hw, hd);
      ctx.lineWidth = t;
      ctx.stroke();
      if (pres) chair(ctx, hw * 0.25, hd * 0.35, 0, pres, stroke);
      // Opening marker (front)
      if (!pres) {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-hw, hd);
        ctx.lineTo(hw, hd);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      break;
    }
    case 'chair':
      chair(ctx, 0, 0, 0, pres, stroke, w / 22);
      break;
    case 'shared-desk':
    case 'bench': {
      box();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-hw, 0);
      ctx.lineTo(hw, 0);
      ctx.stroke();
      const per = Math.max(1, Math.round(f.seats / 2));
      ctx.lineWidth = 0.4;
      for (let i = 0; i < per; i++) {
        const x = -hw + (w / per) * i;
        if (i) {
          ctx.beginPath();
          ctx.moveTo(x, -hd);
          ctx.lineTo(x, hd);
          ctx.stroke();
        }
        if (pres) {
          const cx = x + w / per / 2;
          chair(ctx, cx, hd + 10, 0, pres, stroke);
          chair(ctx, cx, -hd - 10, 180, pres, stroke);
        }
      }
      break;
    }
    case 'l-desk': {
      const ds = Math.min(30, d * 0.5);
      ctx.beginPath();
      ctx.moveTo(-hw, -hd);
      ctx.lineTo(hw, -hd);
      ctx.lineTo(hw, -hd + ds);
      ctx.lineTo(-hw + ds, -hd + ds);
      ctx.lineTo(-hw + ds, hd);
      ctx.lineTo(-hw, hd);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'conference-table':
      rr(ctx, -hw, -hd, w, d, Math.min(hd, 18));
      ctx.fill();
      ctx.stroke();
      break;
    case 'plant': {
      const r = Math.min(hw, hd);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = pres ? '#7fb77e' : '#ffffff';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }
    case 'filing-cabinet':
    case 'storage-cabinet':
    case 'shelving':
      box();
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(-hw, -hd);
      ctx.lineTo(hw, hd);
      ctx.moveTo(hw, -hd);
      ctx.lineTo(-hw, hd);
      ctx.stroke();
      break;
    case 'partition':
      ctx.fillStyle = stroke;
      ctx.fillRect(-hw, -hd, w, d);
      break;
    case 'printer':
      box();
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-hw * 0.6, -hd * 0.6, w * 0.6, d * 0.4);
      break;
    default:
      box();
      if (f.isWorkstation && pres) chair(ctx, 0, hd + 10, 0, pres, stroke);
  }
  if (conflict) {
    ctx.fillStyle = 'rgba(214,40,40,0.18)';
    ctx.fillRect(-hw, -hd, w, d);
    ctx.strokeStyle = '#d62828';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-hw, -hd, w, d);
    ctx.setLineDash([]);
  }
}
