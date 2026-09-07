import type { PDFFont, PDFPage } from 'pdf-lib';
import type { CardLayout } from './layout';
import { cardRect, guideLines } from './layout';
import { truncateAddress } from './naming';
import type { GiftKitItem, QrArtifact } from './types';

export const CAPTION = 'Gift code - scan to import';
const MM = 72 / 25.4;

export async function buildPdf(
  items: GiftKitItem[],
  qrs: QrArtifact[],
  layout: CardLayout,
  title: string,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(title);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const sans = await doc.embedFont(StandardFonts.Helvetica);

  let page: PDFPage | null = null;

  const centred = (
    target: PDFPage,
    text: string,
    font: PDFFont,
    size: number,
    cx: number,
    y: number,
    grey: number,
  ) => {
    // pdf-lib has no drawCentredString, so centre on the measured width.
    target.drawText(text, {
      x: cx - font.widthOfTextAtSize(text, size) / 2,
      y,
      size,
      font,
      color: rgb(grey, grey, grey),
    });
  };

  for (const [idx, item] of items.entries()) {
    const slot = idx % layout.perPage;

    if (slot === 0) {
      page = doc.addPage([layout.pageW, layout.pageH]);
      for (const line of guideLines(layout)) {
        page.drawLine({
          start: { x: line.x1, y: line.y1 },
          end: { x: line.x2, y: line.y2 },
          thickness: 0.4,
          color: rgb(0.78, 0.78, 0.78),
          dashArray: [2, 3],
        });
      }
      // Both color and borderColor omitted would fill the page black.
      page.drawRectangle({
        x: layout.margin,
        y: layout.margin,
        width: layout.pageW - 2 * layout.margin,
        height: layout.pageH - 2 * layout.margin,
        borderColor: rgb(0.88, 0.88, 0.88),
        borderWidth: 0.4,
      });
    }

    const target = page!;
    const { cx, qy } = cardRect(layout, slot);

    const png = await doc.embedPng(qrs[idx].bytes);
    target.drawImage(png, {
      x: cx - layout.qr / 2,
      y: qy,
      width: layout.qr,
      height: layout.qr,
    });

    centred(target, `#${item.num}`, bold, layout.fIdx, cx, qy + layout.qr + 2.5 * MM, 0);
    // Truncated address only. The key lives in the QR and is never printed as
    // text -- a stack of cards on a table must not be readable over a shoulder.
    centred(target, truncateAddress(item.address), mono, layout.fAddr, cx, qy - 4 * MM, 0.35);
    centred(target, CAPTION, sans, layout.fCap, cx, qy - 7.4 * MM, 0.55);
  }

  return doc.save();
}
