import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { drawnPixels, MIN_DRAWN_PIXELS } from '../../src/lib/oneshots/pixels';

const flat = (color: string) => sharp({ create: { width: 320, height: 200, channels: 3, background: color } });
const withSquare = async (side: number, color = '#ffffff') =>
  flat('#101010')
    .composite([{ input: await flat(color).resize(side, side).png().toBuffer(), left: 40, top: 40 }])
    .png()
    .toBuffer();

describe('drawnPixels', () => {
  it('counts nothing on a flat frame, of any color', async () => {
    expect(await drawnPixels(await flat('#000000').png().toBuffer())).toBe(0);
    expect(await drawnPixels(await flat('#f4efe6').png().toBuffer())).toBe(0);
  });
  it('counts the pixels that differ from the background', async () => {
    expect(await drawnPixels(await withSquare(20))).toBe(400);
  });
  it('ignores near-identical colors such as dithering', async () => {
    expect(await drawnPixels(await withSquare(20, '#141414'))).toBe(0);
  });
  it('a small drawing clears the threshold, a few stray pixels do not', async () => {
    expect(await drawnPixels(await withSquare(12))).toBeGreaterThanOrEqual(MIN_DRAWN_PIXELS);
    expect(await drawnPixels(await withSquare(3))).toBeLessThan(MIN_DRAWN_PIXELS);
  });
  it('counts only the visible cells of a grid, and takes the background from them', async () => {
    // 320x200 with a 20px square at (40,40), inside cell (0,0) of a 2x2 grid.
    const png = await withSquare(20);
    expect(await drawnPixels(png, { size: 2, cells: [[0, 0]] })).toBe(400);
    expect(await drawnPixels(png, { size: 2, cells: [[1, 0], [0, 1], [1, 1]] })).toBe(0);
    expect(await drawnPixels(png, { size: 2, cells: [] })).toBe(0);
  });
});
