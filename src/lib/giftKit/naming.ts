import type { GiftKitItem } from './types';

/**
 * The only form of the address that reaches a printed card. The key itself
 * lives in the QR and is never printed as text -- a stack of cards on a table
 * must not be readable over someone's shoulder.
 */
export function truncateAddress(address: string): string {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

/**
 * Pad to the batch's own width so the files sort correctly in a file browser.
 * A fixed two-digit pad would list a 300-key batch as 01, 10, 100, 101, 11.
 */
export function qrEntryPath(item: GiftKitItem, total: number): string {
  const width = String(total).length;
  return `qr/${String(item.num).padStart(width, '0')}_${item.address}.png`;
}

/**
 * Excel rejects * ? : \ / [ ] in a worksheet name, and a slash in a filename
 * would nest the zip entry in a phantom folder. The batch name is free text
 * from an event organiser, so "ETHRome 2026: batch 1/2" is entirely plausible
 * and must not abort the export.
 */
export function sanitiseBatchName(base: string): string {
  const cleaned = base.replace(/[*?:\\/[\]]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned || 'Gift codes';
}

export const xlsxName = (base: string) => `${base}.xlsx`;
export const pdfName = (base: string) => `${base} - printable.pdf`;
