import sharp from 'sharp';

export const MIN_DRAWN_PIXELS = 100;
// WHY: Channel difference below which two colors count as the same (dithering,
// compression of gradients).
const TOLERANCE = 8;

export type VisibleCells = { size: number; cells: Array<[number, number]> };

export async function drawnPixels(png: Buffer, visible?: VisibleCells): Promise<number> {
  // WHY: Canvas captures can be transparent; flatten them onto black like an empty frame.
  const { data, info } = await sharp(png).flatten({ background: '#000000' }).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const open = visible && new Set(visible.cells.map(([i, j]) => `${i},${j}`));
  const kept = (x: number, y: number) => !open || open.has(`${Math.floor((x * visible.size) / w)},${Math.floor((y * visible.size) / h)}`);
  const counts = new Map<number, number>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!kept(x, y)) continue;
    const i = y * w + x;
    const c = (data[i * 3] << 16) | (data[i * 3 + 1] << 8) | data[i * 3 + 2];
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let mode = 0;
  let best = -1;
  for (const [c, k] of counts) if (k > best) [mode, best] = [c, k];
  const [r, g, b] = [mode >> 16, (mode >> 8) & 255, mode & 255];
  let drawn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!kept(x, y)) continue;
    const i = y * w + x;
    const d = Math.max(Math.abs(data[i * 3] - r), Math.abs(data[i * 3 + 1] - g), Math.abs(data[i * 3 + 2] - b));
    if (d > TOLERANCE) drawn++;
  }
  return drawn;
}
