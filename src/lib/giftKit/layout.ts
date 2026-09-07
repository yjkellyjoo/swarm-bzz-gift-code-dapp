const MM = 72 / 25.4;
const PAGE_W = 595.276; // A4 in PDF points, matching pdf-lib's PageSizes.A4
const PAGE_H = 841.89;
const MARGIN = 10 * MM;
const MIN_QR = 25 * MM;

export class GridTooDenseError extends Error {}

export interface CardLayout {
  cols: number;
  rows: number;
  perPage: number;
  cellW: number;
  cellH: number;
  qr: number;
  qrMm: number;
  fIdx: number;
  fAddr: number;
  fCap: number;
  margin: number;
  pageW: number;
  pageH: number;
}

/** All lengths in PDF points. Origin is bottom-left, y increasing upwards. */
export function computeCardLayout(cols: number, rows: number): CardLayout {
  const cellW = (PAGE_W - 2 * MARGIN) / cols;
  const cellH = (PAGE_H - 2 * MARGIN) / rows;
  // Reserve room for the index above the QR and two label lines below it.
  const qr = Math.min(cellW - 12 * MM, cellH - 20 * MM);
  if (qr < MIN_QR) {
    throw new GridTooDenseError(
      `${cols}x${rows} leaves only ${(qr / MM).toFixed(0)} mm for the QR - the card labels ` +
        'will not fit and the print will not scan. Use a coarser grid.',
    );
  }
  const scale = qr / (46 * MM);
  return {
    cols,
    rows,
    perPage: cols * rows,
    cellW,
    cellH,
    qr,
    qrMm: qr / MM,
    fIdx: Math.max(7.0, 11 * scale),
    fAddr: Math.max(5.5, 7.5 * scale),
    fCap: Math.max(5.0, 6.5 * scale),
    margin: MARGIN,
    pageW: PAGE_W,
    pageH: PAGE_H,
  };
}

/** Slot 0 is the top-left card; slots advance left to right, then down. */
export function cardRect(l: CardLayout, slot: number) {
  const col = slot % l.cols;
  const row = Math.floor(slot / l.cols);
  const x0 = l.margin + col * l.cellW;
  const y0 = l.pageH - l.margin - (row + 1) * l.cellH;
  return { x0, y0, cx: x0 + l.cellW / 2, qy: y0 + (l.cellH - l.qr) / 2 + 3.5 * MM };
}

export function guideLines(l: CardLayout) {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 1; i < l.cols; i++) {
    const x = l.margin + i * l.cellW;
    lines.push({ x1: x, y1: l.margin, x2: x, y2: l.pageH - l.margin });
  }
  for (let j = 1; j < l.rows; j++) {
    const y = l.margin + j * l.cellH;
    lines.push({ x1: l.margin, y1: y, x2: l.pageW - l.margin, y2: y });
  }
  return lines;
}
