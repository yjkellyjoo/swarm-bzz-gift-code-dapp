import type { ReaderOptions } from 'zxing-wasm/reader';
import type { DecodedMark } from './types';

// formats is the load-bearing option: left unrestricted, zxing hunts for 1D
// barcodes too and roughly one QR in 8000 contains a run of modules it reads as
// a valid ITF code. That phantom second symbol made the verifier reject a
// perfectly good kit -- a false failure, which is worse than no check at all,
// since the cure is usually to weaken the check. We only ever generate QR
// codes, so only QR codes are looked for.
//
// textMode 'Plain' so a hex string can never be reinterpreted as structured
// content.
const QR_ONLY: ReaderOptions = { textMode: 'Plain', formats: ['QRCode'] };

/** A single PNG holds exactly one QR; stop after it. */
const SINGLE_OPTS: ReaderOptions = { ...QR_ONLY, maxNumberOfSymbols: 1 };

/** A printed page holds a full grid of them. */
const PAGE_OPTS: ReaderOptions = { ...QR_ONLY, maxNumberOfSymbols: 64 };

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
  if (!ready) {
    // Clear on failure, so a transient fetch error does not poison the tab for
    // its lifetime -- the only recovery would be a reload, which discards the
    // generated wallets held in React state.
    ready = load().catch(err => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** Decode raw image bytes -- a PNG file, not pixels. */
export async function decodeBytes(image: Uint8Array): Promise<string[]> {
  const zx = await reader();
  const results = await zx.readBarcodes(image, SINGLE_OPTS);
  return results.map(r => r.text);
}

/** Decode rasterised pixels, keeping each mark's position for card ordering. */
export async function decodeImageData(image: ImageData): Promise<DecodedMark[]> {
  const zx = await reader();
  const results = await zx.readBarcodes(image, PAGE_OPTS);
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
