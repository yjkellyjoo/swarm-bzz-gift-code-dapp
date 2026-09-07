import { encodeGiftPayload } from '../giftPayload';
import type { GiftKitItem } from './types';

/**
 * The one place the kit turns an item into QR text.
 *
 * Every artifact and the verification pass go through here, so the PNG, the
 * spreadsheet and the printed card can never disagree about what a QR holds.
 *
 * A plain gift code encodes as the bare key, unchanged, so a wallet scanning
 * the card imports it directly. Only a gift drive needs the structured form,
 * because the batch id has to travel with the key.
 */
export function itemPayload(item: GiftKitItem): string {
  return encodeGiftPayload({
    privateKey: item.privateKey,
    address: item.address,
    batchId: item.batchId,
  });
}
