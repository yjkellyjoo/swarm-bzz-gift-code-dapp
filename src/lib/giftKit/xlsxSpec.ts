// Gift drive is appended rather than slotted next to the key, so Used stays
// column 5 and the QR image anchor stays column 3 (0-indexed). Both are
// asserted against read-back, and moving them would rewrite that mapping for
// no gain to the reader.
export const HEADERS = [
  '#',
  'Public address',
  'Private key',
  'QR code',
  'Used',
  'Gift drive',
] as const;
export const COLUMN_WIDTHS = [5, 46, 70, 22, 9, 70];
export const QR_PX = 120;
export const HEADER_FILL = 'FF1E1E1E';
export const HEADER_FONT_COLOR = 'FFFFFFFF';

/** Row height is points, image size is pixels. */
export const rowHeightForQrPx = (px: number) => px * 0.78;
