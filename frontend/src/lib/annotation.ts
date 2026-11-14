/** Shapes and canvas drawing for the photo annotation editor. Coordinates are image pixels. */

export type Tool = 'pen' | 'ellipse' | 'rect' | 'arrow' | 'text';

export interface Point {
  x: number;
  y: number;
}

export type Shape =
  | { kind: 'pen'; color: string; width: number; points: Point[] }
  | { kind: 'ellipse' | 'rect' | 'arrow'; color: string; width: number; from: Point; to: Point }
  | { kind: 'text'; color: string; size: number; at: Point; text: string };

export const COLORS = [
  { name: 'Rot', value: '#e3141b' },
  { name: 'Gelb', value: '#ffd400' },
  { name: 'Blau', value: '#1a5cff' },
  { name: 'Weiß', value: '#ffffff' },
];

/** Stroke widths relative to the long image edge, so they look the same on every resolution. */
export const WIDTHS = [
  { name: 'Dünn', factor: 0.004 },
  { name: 'Mittel', factor: 0.008 },
  { name: 'Dick', factor: 0.015 },
];

/** Line width in px for an image of the given size. */
export function strokeWidth(factor: number, imageWidth: number, imageHeight: number): number {
  return Math.max(2, Math.round(Math.max(imageWidth, imageHeight) * factor));
}

/** Draws one shape. A soft dark shadow keeps light colors visible on bright backgrounds. */
export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';

  switch (shape.kind) {
    case 'pen': {
      ctx.lineWidth = shape.width;
      ctx.shadowBlur = shape.width;
      ctx.beginPath();
      shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (shape.points.length === 1) ctx.lineTo(shape.points[0].x + 0.1, shape.points[0].y);
      ctx.stroke();
      break;
    }
    case 'rect': {
      ctx.lineWidth = shape.width;
      ctx.shadowBlur = shape.width;
      ctx.strokeRect(shape.from.x, shape.from.y, shape.to.x - shape.from.x, shape.to.y - shape.from.y);
      break;
    }
    case 'ellipse': {
      ctx.lineWidth = shape.width;
      ctx.shadowBlur = shape.width;
      ctx.beginPath();
      ctx.ellipse(
        (shape.from.x + shape.to.x) / 2, (shape.from.y + shape.to.y) / 2,
        Math.abs(shape.to.x - shape.from.x) / 2, Math.abs(shape.to.y - shape.from.y) / 2,
        0, 0, Math.PI * 2,
      );
      ctx.stroke();
      break;
    }
    case 'arrow': {
      ctx.lineWidth = shape.width;
      ctx.shadowBlur = shape.width;
      const angle = Math.atan2(shape.to.y - shape.from.y, shape.to.x - shape.from.x);
      const head = Math.max(shape.width * 4, 16);
      ctx.beginPath();
      ctx.moveTo(shape.from.x, shape.from.y);
      ctx.lineTo(shape.to.x, shape.to.y);
      ctx.moveTo(shape.to.x, shape.to.y);
      ctx.lineTo(shape.to.x - head * Math.cos(angle - Math.PI / 6), shape.to.y - head * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(shape.to.x, shape.to.y);
      ctx.lineTo(shape.to.x - head * Math.cos(angle + Math.PI / 6), shape.to.y - head * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
      break;
    }
    case 'text': {
      ctx.font = `bold ${shape.size}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(2, shape.size / 7);
      ctx.strokeStyle = shape.color === '#ffffff' || shape.color === '#ffd400' ? '#000000' : '#ffffff';
      ctx.shadowBlur = 0;
      ctx.strokeText(shape.text, shape.at.x, shape.at.y);
      ctx.fillText(shape.text, shape.at.x, shape.at.y);
      break;
    }
  }
  ctx.restore();
}

/** Draws the base image and all shapes. */
export function renderAnnotations(ctx: CanvasRenderingContext2D, image: CanvasImageSource, shapes: Shape[]): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
  shapes.forEach((s) => drawShape(ctx, s));
}

/** True if a shape is big enough to keep (ignores accidental taps for rect/ellipse/arrow). */
export function isMeaningful(shape: Shape): boolean {
  if (shape.kind === 'pen' || shape.kind === 'text') return true;
  return Math.hypot(shape.to.x - shape.from.x, shape.to.y - shape.from.y) > 8;
}
