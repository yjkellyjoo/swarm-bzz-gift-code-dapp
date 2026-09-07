import { decodeBytes, decodeImageData } from './decode';
import { sortIntoCardOrder } from './readingOrder';
import { readXlsx } from './xlsxRead';
import type { GiftKitItem, QrArtifact, VerificationProblem } from './types';

export type Rasteriser = (pdf: Uint8Array) => AsyncGenerator<ImageData>;

/**
 * Decode every QR back out of all three artifacts.
 *
 * The rasteriser is injected so the orchestration is testable in node with a
 * stub, and so the PDF check can be skipped where pdf.js has no canvas.
 */
export async function verifyKit(args: {
  items: GiftKitItem[];
  qrs: QrArtifact[];
  xlsxBytes: Uint8Array;
  pdfBytes: Uint8Array;
  rasterise: Rasteriser | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<VerificationProblem[]> {
  const { items, qrs, xlsxBytes, pdfBytes, rasterise, onProgress } = args;
  const problems: VerificationProblem[] = [];
  const total = items.length * 2 + 1;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  for (const [i, item] of items.entries()) {
    const got = await decodeBytes(qrs[i].bytes);
    if (got.length !== 1 || got[0] !== item.privateKey) {
      problems.push({
        where: `PNG ${item.num}`,
        detail: `decoded to ${got.length} code(s), not its key`,
      });
    }
    tick();
  }

  const sheet = await readXlsx(xlsxBytes);
  if (sheet.rowCount !== items.length) {
    problems.push({
      where: 'xlsx',
      detail: `${sheet.rowCount} data rows, expected ${items.length}`,
    });
  }
  if (sheet.hasDataValidations) {
    problems.push({
      where: 'xlsx',
      detail: 'Used column carries data validation - it must be plain booleans',
    });
  }

  for (const [i, item] of items.entries()) {
    const row = i + 2;
    const values = sheet.rowValues[i];
    if (values?.address !== item.address || values?.privateKey !== item.privateKey) {
      problems.push({ where: `xlsx row ${row}`, detail: 'address/key mismatch' });
    }
    if (values?.used !== false) {
      problems.push({
        where: `xlsx row ${row}`,
        detail: `Used is ${String(values?.used)}, expected boolean false`,
      });
    }
    const image = sheet.imagesByRow.get(row);
    if (!image) {
      problems.push({ where: `xlsx row ${row}`, detail: 'no embedded QR' });
    } else {
      const got = await decodeBytes(image);
      if (got.length !== 1 || got[0] !== item.privateKey) {
        problems.push({ where: `xlsx row ${row}`, detail: 'embeds a QR for a different key' });
      }
    }
    tick();
  }

  if (rasterise) {
    const found: string[] = [];
    for await (const page of rasterise(pdfBytes)) {
      found.push(...sortIntoCardOrder(await decodeImageData(page)));
    }
    const expected = items.map(i => i.privateKey);
    if (found.join('\n') !== expected.join('\n')) {
      problems.push({
        where: 'PDF',
        detail:
          [...found].sort().join() === [...expected].sort().join()
            ? 'holds the right keys but not in card order'
            : `decoded ${found.length} QRs, expected ${expected.length} matching keys`,
      });
    }
  }
  tick();

  return problems;
}
