import { describe, it, expect } from 'vitest';
import { sortIntoCardOrder } from './readingOrder';
import type { DecodedMark } from './types';

// A 4x5 page: 100pt cells, 60pt QRs, laid out in reading order.
function page(): DecodedMark[] {
  const marks: DecodedMark[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      marks.push({
        text: `card-${row * 4 + col + 1}`,
        cx: 50 + col * 100,
        // A little jitter, so the sorter must cluster rather than match exact y.
        cy: 50 + row * 100 + (col % 2 ? 3 : -3),
        height: 60,
      });
    }
  }
  return marks;
}

const expected = Array.from({ length: 20 }, (_, i) => `card-${i + 1}`);

describe('sortIntoCardOrder', () => {
  it('returns cards left-to-right, top-to-bottom', () => {
    expect(sortIntoCardOrder(page())).toEqual(expected);
  });

  it('recovers reading order from shuffled decoder output', () => {
    // The decoder does NOT promise raster order. Shuffle deterministically so a
    // regression cannot pass by luck.
    const shuffled = page().sort((a, b) => a.text.localeCompare(b.text));
    expect(sortIntoCardOrder(shuffled)).toEqual(expected);
  });

  it('recovers reading order from reversed decoder output', () => {
    expect(sortIntoCardOrder(page().reverse())).toEqual(expected);
  });

  it('handles a partial final row', () => {
    expect(sortIntoCardOrder(page().slice(0, 18))).toEqual(expected.slice(0, 18));
  });

  it('returns an empty array for no marks', () => {
    expect(sortIntoCardOrder([])).toEqual([]);
  });

  it('handles a single mark', () => {
    expect(sortIntoCardOrder([{ text: 'only', cx: 10, cy: 10, height: 60 }])).toEqual(['only']);
  });
});
