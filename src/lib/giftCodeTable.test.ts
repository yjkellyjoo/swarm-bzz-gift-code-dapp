import { describe, it, expect } from 'vitest';
import { buildKeyList, buildGiftCodeTable, GIFT_CODE_TABLE_HEADERS } from './giftCodeTable';
import { parseGiftDriveList } from './giftDriveList';
import type { ExportableCode } from './giftCodeTable';

// Well-known test keys; never used for real funds.
const KEY_A = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const KEY_B = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const ADDRESS_B = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const BATCH_A = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

const codes: ExportableCode[] = [
  { privateKey: KEY_A, address: ADDRESS_A, batchId: BATCH_A },
  { privateKey: KEY_B, address: ADDRESS_B },
];

describe('buildKeyList', () => {
  it('is one bare key per line, and nothing else', () => {
    expect(buildKeyList(codes)).toBe(`${KEY_A}\n${KEY_B}`);
  });

  // The gift-codes download is this text. An address column or a "- " bullet
  // would stop it pasting back into either paste box.
  it('never includes the address or the batch id', () => {
    const text = buildKeyList(codes);
    expect(text).not.toContain(ADDRESS_A);
    expect(text).not.toContain(BATCH_A);
  });

  it('handles an empty list', () => {
    expect(buildKeyList([])).toBe('');
  });
});

describe('buildGiftCodeTable', () => {
  it('writes a header and one tab-separated row per code', () => {
    expect(buildGiftCodeTable(codes)).toBe(
      [
        GIFT_CODE_TABLE_HEADERS.join('\t'),
        [KEY_A, ADDRESS_A, BATCH_A].join('\t'),
        [KEY_B, ADDRESS_B, ''].join('\t'),
      ].join('\n'),
    );
  });

  it('leaves the batch column empty rather than writing undefined', () => {
    expect(buildGiftCodeTable([codes[1]])).not.toContain('undefined');
  });

  it('handles an empty list, keeping the header', () => {
    expect(buildGiftCodeTable([])).toBe(GIFT_CODE_TABLE_HEADERS.join('\t'));
  });
});

// The invariant that keeps both paste boxes working. A silent failure here
// once returned 1 key of 3 from a tab-separated line, leaving wallets
// undrained with nothing to say so.
describe('round-trips through parseGiftDriveList', () => {
  it('a key list comes back as the same keys, with no batches', () => {
    expect(parseGiftDriveList(buildKeyList(codes))).toEqual([
      { privateKey: KEY_A },
      { privateKey: KEY_B },
    ]);
  });

  it('a table comes back with its batches attached to the right keys', () => {
    expect(parseGiftDriveList(buildGiftCodeTable(codes))).toEqual([
      { privateKey: KEY_A, batchId: BATCH_A },
      { privateKey: KEY_B },
    ]);
  });

  it('never yields a batch id as if it were a key', () => {
    const keys = parseGiftDriveList(buildGiftCodeTable(codes)).map(e => e.privateKey);
    expect(keys).toEqual([KEY_A, KEY_B]);
    expect(keys).not.toContain(BATCH_A);
  });
});
