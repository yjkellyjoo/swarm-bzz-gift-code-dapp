import type { DecodedMark } from './types';

/**
 * Decode a printed page in card order: left-to-right, top-to-bottom.
 *
 * zxing does not return barcodes in raster order -- on a dense page it hands
 * back a row out of sequence. Sorting by each QR's own centre is what
 * establishes card order; trusting the decoder's return order raises false
 * "the cards are misordered" failures on a page that is in fact correct.
 */
export function sortIntoCardOrder(marks: DecodedMark[]): string[] {
  if (marks.length === 0) return [];

  const byY = [...marks].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  // A vertical gap wider than half a QR's height starts a new print row.
  const heights = [...marks].map(m => m.height).sort((a, b) => a - b);
  const gap = heights[Math.floor(heights.length / 2)] / 2;

  const rows: DecodedMark[][] = [];
  let current: DecodedMark[] = [byY[0]];
  for (const mark of byY.slice(1)) {
    if (mark.cy - current[current.length - 1].cy > gap) {
      rows.push(current);
      current = [];
    }
    current.push(mark);
  }
  rows.push(current);

  return rows.flatMap(row => [...row].sort((a, b) => a.cx - b.cx).map(m => m.text));
}
