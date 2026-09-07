import { ethers } from 'ethers';
import type { GiftKitItem } from './types';

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Validate a batch and number it from 1.
 *
 * Numbering always starts at 1 so card #N is the sheet row whose # column
 * reads N -- the correspondence a manager relies on at the table.
 *
 * parsePrivateKeys in walletUtils validates each key but does not reject
 * repeats, so the duplicate check belongs here: two cards carrying the same
 * key means one gift is handed out twice and another not at all.
 */
export function buildItems(
  keys: string[],
  driveByKey?: ReadonlyMap<string, string>,
): GiftKitItem[] {
  if (keys.length === 0) throw new Error('no keys selected');

  const seen = new Set<string>();
  return keys.map((privateKey, i) => {
    if (!KEY_RE.test(privateKey)) {
      throw new Error(`key ${i + 1}: not a 32-byte hex private key`);
    }
    const lower = privateKey.toLowerCase();
    if (seen.has(lower)) throw new Error(`key ${i + 1}: duplicate key in batch`);
    seen.add(lower);

    let address: string;
    try {
      address = new ethers.Wallet(privateKey).address;
    } catch {
      // Hex-shaped but not a valid secp256k1 key (zero, or above the curve
      // order). Keep the position, or a 300-line paste gives no clue which
      // line is bad.
      throw new Error(`key ${i + 1}: not a valid private key`);
    }

    const item: GiftKitItem = { num: i + 1, address, privateKey };

    // Keyed on the lower-cased key, matching the duplicate check above, so a
    // key given in a different case still finds its gift drive.
    const batchId = driveByKey?.get(lower);
    if (batchId) item.batchId = batchId;

    return item;
  });
}
