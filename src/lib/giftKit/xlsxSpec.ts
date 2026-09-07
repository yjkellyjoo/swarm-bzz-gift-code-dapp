export const HEADERS = ['#', 'Public address', 'Private key', 'QR code', 'Used'] as const;
export const COLUMN_WIDTHS = [5, 46, 70, 22, 9];
export const QR_PX = 120;
export const HEADER_FILL = 'FF1E1E1E';
export const HEADER_FONT_COLOR = 'FFFFFFFF';

/** Row height is points, image size is pixels. */
export const rowHeightForQrPx = (px: number) => px * 0.78;
