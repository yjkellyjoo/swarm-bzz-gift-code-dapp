import { strFromU8, unzipSync } from 'fflate';

/**
 * Read a built workbook back for verification.
 *
 * Images are mapped through their anchor row, not counted: counting would pass
 * a sheet whose row 3 carried row 7's QR.
 */
export async function readXlsx(bytes: Uint8Array) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  // Copy: load() may take ownership of the buffer it is handed.
  await wb.xlsx.load(new Uint8Array(bytes).buffer as ArrayBuffer);
  const ws = wb.worksheets[0];

  const imagesByRow = new Map<number, Uint8Array>();
  for (const image of ws.getImages()) {
    const media = wb.getImage(Number(image.imageId));
    imagesByRow.set(image.range.tl.nativeRow + 1, new Uint8Array(media.buffer as Uint8Array));
  }

  const rowValues = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    rowValues.push({
      row: r,
      address: row.getCell(2).value,
      privateKey: row.getCell(3).value,
      used: row.getCell(5).value,
    });
  }

  // Straight off the raw XML, so the no-dropdown check does not depend on the
  // library that wrote the file.
  const sheetXml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml'] ?? new Uint8Array());

  return {
    imagesByRow,
    rowValues,
    hasDataValidations: /<dataValidations/.test(sheetXml),
    rowCount: ws.rowCount - 1,
  };
}
