import type { GiftKitItem } from './types';

// Moved to lib/batchName: the batch name now names the two downloads as well
// as the kit. Re-exported so the kit's own callers and tests are unaffected.
export { sanitiseBatchName } from '../batchName';

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

export const xlsxName = (base: string) => `${base}.xlsx`;
export const pdfName = (base: string) => `${base} - printable.pdf`;
