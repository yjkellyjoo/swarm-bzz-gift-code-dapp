import { describe, it, expect } from 'vitest';
import { unzlibSync } from 'fflate';
import { encodeGreyscalePng } from './png';

const MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function chunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Array<{ type: string; data: Uint8Array }> = [];
  let p = 8;
  while (p < png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...png.slice(p + 4, p + 8));
    out.push({ type, data: png.slice(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

describe('encodeGreyscalePng', () => {
  const gray = new Uint8Array([0, 255, 255, 0]); // 2x2 checker

  it('emits the PNG signature', () => {
    expect([...encodeGreyscalePng(gray, 2, 2).slice(0, 8)]).toEqual(MAGIC);
  });

  it('emits IHDR, IDAT and IEND in order', () => {
    expect(chunks(encodeGreyscalePng(gray, 2, 2)).map(c => c.type))
      .toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('declares 8-bit greyscale, non-interlaced', () => {
    const ihdr = chunks(encodeGreyscalePng(gray, 2, 2))[0].data;
    const v = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect(v.getUint32(0)).toBe(2);  // width
    expect(v.getUint32(4)).toBe(2);  // height
    expect(ihdr[8]).toBe(8);         // bit depth
    expect(ihdr[9]).toBe(0);         // colour type: greyscale
    expect(ihdr[12]).toBe(0);        // interlace: none
  });

  it('round-trips the pixels through the IDAT stream', () => {
    const idat = chunks(encodeGreyscalePng(gray, 2, 2))[1].data;
    // Each scanline is prefixed with filter byte 0.
    expect([...unzlibSync(idat)]).toEqual([0, 0, 255, 0, 255, 0]);
  });

  it('rejects a pixel count that does not match the dimensions', () => {
    expect(() => encodeGreyscalePng(gray, 3, 2)).toThrow(/expected 6 pixels/);
  });
});
