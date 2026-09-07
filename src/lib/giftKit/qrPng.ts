import QRCode from 'qrcode';
import { encodeGreyscalePng } from './png';
import type { QrArtifact } from './types';

const EC = 'M' as const;
const MARGIN = 2; // node-qrcode defaults to 4; the Python reference uses 2
const SCALE = 6;

/**
 * Highest QR version any text in the batch needs.
 *
 * node-qrcode's segment optimiser does not pick the same version for every
 * 32-byte key -- some fit version 4, most need version 5 -- so pinning one
 * version across the batch is what makes every PNG identically sized and the
 * printed mm-per-module figure exact rather than worst-case.
 */
export function maxQrVersion(texts: string[]): number {
  return Math.max(...texts.map(t => QRCode.create(t, { errorCorrectionLevel: EC }).version));
}

export function renderQr(text: string, version: number): QrArtifact {
  const qr = QRCode.create(text, { errorCorrectionLevel: EC, version });
  const n = qr.modules.size;
  const pixelSize = (n + MARGIN * 2) * SCALE;

  const gray = new Uint8Array(pixelSize * pixelSize).fill(255);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!qr.modules.get(row, col)) continue;
      const x0 = (col + MARGIN) * SCALE;
      const y0 = (row + MARGIN) * SCALE;
      for (let dy = 0; dy < SCALE; dy++) {
        const start = (y0 + dy) * pixelSize + x0;
        gray.fill(0, start, start + SCALE);
      }
    }
  }

  return { bytes: encodeGreyscalePng(gray, pixelSize, pixelSize), moduleCount: n, pixelSize };
}
