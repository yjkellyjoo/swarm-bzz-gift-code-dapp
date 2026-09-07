import { zlibSync } from 'fflate';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * 8-bit greyscale, non-interlaced PNG. `gray` is width*height bytes, row-major,
 * 0 = black and 255 = white.
 *
 * Hand-rolled rather than routed through a canvas so QR generation stays pure:
 * that is what lets the QR -> PNG -> decode round-trip run as a node test
 * instead of a manual check in a browser.
 */
export function encodeGreyscalePng(gray: Uint8Array, width: number, height: number): Uint8Array {
  if (gray.length !== width * height) {
    throw new Error(`expected ${width * height} pixels, got ${gray.length}`);
  }

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 0;  // colour type: greyscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // One filter byte (0 = None) per scanline.
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(gray.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];

  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}
