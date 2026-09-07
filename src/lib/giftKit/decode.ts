import type { DecodedMark } from './types';

// textMode 'Plain' so a hex string can never be reinterpreted as structured content.
const READER_OPTS = { textMode: 'Plain', maxNumberOfSymbols: 64 } as const;

let ready: Promise<typeof import('zxing-wasm/reader')> | null = null;

// Built once and reused. zxing-wasm shallow-compares the overrides object to
// decide whether to re-instantiate, so handing it a fresh literal per call
// re-fetches and re-compiles the 1 MB wasm every time.
let browserOverrides: { locateFile: (path: string, prefix: string) => string } | null = null;

async function load() {
  const zx = await import('zxing-wasm/reader');

  if (typeof window === 'undefined') {
    // Node (tests): read the wasm off disk.
    const { readFile } = await import('node:fs/promises');
    const { createRequire } = await import('node:module');
    const wasmPath = createRequire(import.meta.url)
      .resolve('zxing-wasm/reader/zxing_reader.wasm');
    const binary = await readFile(wasmPath);
    zx.prepareZXingModule({ overrides: { wasmBinary: binary.buffer as ArrayBuffer } });
  } else {
    const { default: wasmUrl } = await import('zxing-wasm/reader/zxing_reader.wasm?url');
    if (!browserOverrides) {
      browserOverrides = {
        locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
      };
    }
    zx.prepareZXingModule({ overrides: browserOverrides });
  }

  return zx;
}

/**
 * Self-host the wasm in both environments. Left to itself the library fetches
 * it from the jsDelivr CDN, and a tool handling live funded private keys must
 * not make an unannounced third-party request on every export.
 */
function reader() {
  if (!ready) ready = load();
  return ready;
}

/** Decode raw image bytes -- a PNG file, not pixels. */
export async function decodeBytes(image: Uint8Array): Promise<string[]> {
  const zx = await reader();
  const results = await zx.readBarcodes(image, READER_OPTS);
  return results.map(r => r.text);
}

/** Decode rasterised pixels, keeping each mark's position for card ordering. */
export async function decodeImageData(image: ImageData): Promise<DecodedMark[]> {
  const zx = await reader();
  const results = await zx.readBarcodes(image, READER_OPTS);
  return results.map(r => {
    const corners = [
      r.position.topLeft,
      r.position.topRight,
      r.position.bottomRight,
      r.position.bottomLeft,
    ];
    const ys = corners.map(p => p.y);
    return {
      text: r.text,
      cx: corners.reduce((sum, p) => sum + p.x, 0) / 4,
      cy: ys.reduce((sum, y) => sum + y, 0) / 4,
      height: Math.max(...ys) - Math.min(...ys),
    };
  });
}
