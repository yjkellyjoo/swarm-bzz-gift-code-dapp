import type { GiftKitItem, QrArtifact } from './types';
import {
  COLUMN_WIDTHS,
  HEADERS,
  HEADER_FILL,
  HEADER_FONT_COLOR,
  QR_PX,
  rowHeightForQrPx,
} from './xlsxSpec';

export async function buildXlsx(
  items: GiftKitItem[],
  qrs: QrArtifact[],
  sheetTitle: string,
): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetTitle.slice(0, 31));

  ws.columns = COLUMN_WIDTHS.map(width => ({ width }));

  const header = ws.getRow(1);
  HEADERS.forEach((h, i) => {
    const cell = header.getCell(i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, size: 11, color: { argb: HEADER_FONT_COLOR } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  header.height = 24;
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  items.forEach((item, i) => {
    const r = i + 2;
    const row = ws.getRow(r);
    row.height = rowHeightForQrPx(QR_PX);

    row.getCell(1).value = item.num;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    row.getCell(2).value = item.address;
    row.getCell(3).value = item.privateKey;
    for (const c of [2, 3]) {
      row.getCell(c).font = { name: 'Menlo', size: 10 };
      row.getCell(c).alignment = { vertical: 'middle' };
    }

    // A boolean, deliberately NOT a data-validation dropdown. The native
    // checkbox is a display format the manager applies once on open; it is not
    // storable in xlsx, so the file carries the values and the app supplies the
    // widget. A checkbox-looking dropdown survives into no app as a real one.
    row.getCell(5).value = false;
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

    // The gift drive's batch id, blank for a plain gift code. This is where
    // the operator's record of it lives; the QR carries it for the recipient.
    row.getCell(6).value = item.batchId ?? '';
    row.getCell(6).font = { name: 'Menlo', size: 10 };
    row.getCell(6).alignment = { vertical: 'middle' };

    const imageId = wb.addImage({
      buffer: qrs[i].bytes as unknown as ArrayBuffer,
      extension: 'png',
    });
    ws.addImage(imageId, {
      tl: { col: 3, row: r - 1 },
      ext: { width: QR_PX, height: QR_PX },
    });
  });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
