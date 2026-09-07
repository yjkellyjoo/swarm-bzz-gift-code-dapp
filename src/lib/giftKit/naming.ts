import type { GiftKitItem } from './types';

/**
 * The only form of the address that reaches a printed card. The key itself
 * lives in the QR and is never printed as text -- a stack of cards on a table
 * must not be readable over someone's shoulder.
 */
export function truncateAddress(address: string): string {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export function qrEntryPath(item: GiftKitItem): string {
  return `qr/${String(item.num).padStart(2, '0')}_${item.address}.png`;
}

export const xlsxName = (base: string) => `${base}.xlsx`;
export const pdfName = (base: string) => `${base} - printable.pdf`;
