// Build a 5-photo collage on canvas and return as a Blob.
// Canvas + cells are sized for typical phone-portrait photos (~3:4 or 9:16).

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Canvas is 1080×1920 (9:16 — Instagram Story / phone-screen ratio).
// Each cell aims at portrait proportions so phone shots fit with minimal cropping.
const CANVAS_W = 1080;
const CANVAS_H = 1920;

const TEMPLATES: Record<number, [number, number, number, number][]> = {
  // [x, y, w, h]
  1: [
    [0, 0, 1080, 1920],
  ],
  2: [
    [0, 0, 1080, 960],
    [0, 960, 1080, 960],
  ],
  3: [
    [0, 0, 1080, 800],
    [0, 800, 540, 1120],
    [540, 800, 540, 1120],
  ],
  4: [
    [0, 0, 540, 960],
    [540, 0, 540, 960],
    [0, 960, 540, 960],
    [540, 960, 540, 960],
  ],
  5: [
    [0, 0, 1080, 800],
    [0, 800, 540, 560],
    [540, 800, 540, 560],
    [0, 1360, 540, 560],
    [540, 1360, 540, 560],
  ],
};

export async function makeCollage(urls: string[], themeColor = '#5a3a4a'): Promise<Blob | null> {
  const filled = urls.filter(Boolean).slice(0, 5);
  if (filled.length === 0) return null;
  const template = TEMPLATES[filled.length] ?? TEMPLATES[5];

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = themeColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gap = 12;
  const radius = 24;
  const images = await Promise.all(filled.map(loadImage));
  for (let i = 0; i < images.length; i++) {
    const [x, y, w, h] = template[i];
    const cx = x + gap;
    const cy = y + gap;
    const cw = w - gap * 2;
    const ch = h - gap * 2;
    ctx.save();
    // Rounded corners on each cell
    const r = Math.min(radius, cw / 2, ch / 2);
    ctx.beginPath();
    ctx.moveTo(cx + r, cy);
    ctx.lineTo(cx + cw - r, cy);
    ctx.arcTo(cx + cw, cy, cx + cw, cy + r, r);
    ctx.lineTo(cx + cw, cy + ch - r);
    ctx.arcTo(cx + cw, cy + ch, cx + cw - r, cy + ch, r);
    ctx.lineTo(cx + r, cy + ch);
    ctx.arcTo(cx, cy + ch, cx, cy + ch - r, r);
    ctx.lineTo(cx, cy + r);
    ctx.arcTo(cx, cy, cx + r, cy, r);
    ctx.closePath();
    ctx.clip();
    drawCover(ctx, images[i], cx, cy, cw, ch);
    ctx.restore();
  }

  // small watermark
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText("cupid · Andreia's Vinyl", canvas.width - 28, canvas.height - 22);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

export function makeTestColorBlob(index: number, count: number): Promise<Blob | null> {
  // Mimic a phone-portrait photo (3:4) so collage cells crop naturally
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  const hue = (index / Math.max(1, count)) * 360;
  // gradient background for a less flat look
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, `hsl(${hue}, 70%, 60%)`);
  grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 65%, 45%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 280px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), canvas.width / 2, canvas.height / 2);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}
