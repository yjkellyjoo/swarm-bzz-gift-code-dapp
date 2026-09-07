import { describe, it, expect } from 'vitest';
import { computeCardLayout, cardRect, guideLines, GridTooDenseError } from './layout';
import { mmPerModule, assessScannability } from './modulePitch';

const MM = 72 / 25.4;

describe('computeCardLayout', () => {
  // Pinned against the print-layout table the Python reference documents.
  it.each([
    [3, 4, 49.3],
    [4, 5, 35.4],
    [5, 6, 26.0],
  ])('%ix%i gives a %f mm QR', (cols, rows, mm) => {
    expect(computeCardLayout(cols, rows).qrMm).toBeCloseTo(mm, 1);
  });

  it('reports 20 cards per page at the fixed 4x5 grid', () => {
    expect(computeCardLayout(4, 5).perPage).toBe(20);
  });

  it('refuses a grid whose cards cannot hold their labels', () => {
    expect(() => computeCardLayout(8, 9)).toThrow(GridTooDenseError);
  });
});

describe('cardRect', () => {
  const layout = computeCardLayout(4, 5);

  it('places slot 0 in the top-left cell', () => {
    const a = cardRect(layout, 0);
    expect(a.x0).toBeCloseTo(layout.margin, 5);
    expect(a.y0).toBeCloseTo(layout.pageH - layout.margin - layout.cellH, 5);
  });

  it('advances left to right, then top to bottom', () => {
    expect(cardRect(layout, 1).x0).toBeGreaterThan(cardRect(layout, 0).x0);
    expect(cardRect(layout, 4).y0).toBeLessThan(cardRect(layout, 0).y0);
    expect(cardRect(layout, 4).x0).toBeCloseTo(cardRect(layout, 0).x0, 5);
  });

  it('keeps every card inside the page margins', () => {
    for (let slot = 0; slot < layout.perPage; slot++) {
      const r = cardRect(layout, slot);
      expect(r.x0).toBeGreaterThanOrEqual(layout.margin - 1e-6);
      expect(r.y0).toBeGreaterThanOrEqual(layout.margin - 1e-6);
      expect(r.x0 + layout.cellW).toBeLessThanOrEqual(layout.pageW - layout.margin + 1e-6);
    }
  });
});

describe('guideLines', () => {
  it('draws cols-1 verticals and rows-1 horizontals', () => {
    expect(guideLines(computeCardLayout(4, 5))).toHaveLength(3 + 4);
  });
});

describe('module pitch', () => {
  it('is comfortable at the fixed 4x5 grid', () => {
    const v = mmPerModule(computeCardLayout(4, 5).qrMm, 37);
    expect(v).toBeCloseTo(0.957, 2);
    expect(assessScannability(v).ok).toBe(true);
  });

  it('still passes at the densest documented grid', () => {
    const v = mmPerModule(computeCardLayout(5, 6).qrMm, 37);
    expect(v).toBeCloseTo(0.703, 2);
    expect(assessScannability(v).ok).toBe(true);
  });

  it('fails below the 0.6 mm floor', () => {
    expect(assessScannability(0.59).ok).toBe(false);
    expect(assessScannability(0.59).message).toMatch(/0\.6/);
  });
});

describe('units', () => {
  it('uses PDF points internally', () => {
    const layout = computeCardLayout(4, 5);
    expect(layout.qr / MM).toBeCloseTo(layout.qrMm, 5);
  });
});
