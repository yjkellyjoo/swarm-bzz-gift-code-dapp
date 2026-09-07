import { describe, it, expect } from 'vitest';
import { parseGiftDriveList } from './giftDriveList';
import { encodeGiftPayload } from './giftPayload';

// Well-known test keys; never used for real funds.
const KEY_A = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const KEY_B = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const ADDRESS_B = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const BATCH_A = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

describe('parseGiftDriveList', () => {
    it('returns nothing for empty input', () => {
        expect(parseGiftDriveList('')).toEqual([]);
        expect(parseGiftDriveList('  \n ')).toEqual([]);
    });

    it('reads newline- and comma-separated bare keys', () => {
        expect(parseGiftDriveList(`${KEY_A}\n${KEY_B}`)).toEqual([
            { privateKey: KEY_A },
            { privateKey: KEY_B },
        ]);
        expect(parseGiftDriveList(`${KEY_A}, ${KEY_B}`)).toEqual([
            { privateKey: KEY_A },
            { privateKey: KEY_B },
        ]);
    });

    it('recovers the batch from a JSON payload line', () => {
        const payload = encodeGiftPayload({
            privateKey: KEY_A, address: ADDRESS_A, batchId: BATCH_A,
        });

        expect(parseGiftDriveList(payload)).toEqual([
            { privateKey: KEY_A, batchId: BATCH_A },
        ]);
    });

    it('recovers keys and batches from the tab-separated export', () => {
        const exported = [
            ['privateKey', 'address', 'batchId'].join('\t'),
            [KEY_A, ADDRESS_A, BATCH_A].join('\t'),
            [KEY_B, ADDRESS_B, ''].join('\t'),
        ].join('\n');

        expect(parseGiftDriveList(exported)).toEqual([
            { privateKey: KEY_A, batchId: BATCH_A },
            { privateKey: KEY_B },
        ]);
    });

    // A batch ID is 32 bytes of hex, and any 32-byte value in range is a valid
    // secp256k1 key -- so validation cannot tell one from a private key.
    // Never splitting it out as its own token is the only defence.
    it('never emits a batch ID as a key', () => {
        const exported = [KEY_A, ADDRESS_A, BATCH_A].join('\t');
        const keys = parseGiftDriveList(exported).map(e => e.privateKey);

        expect(keys).toEqual([KEY_A]);
        expect(keys).not.toContain(BATCH_A);
    });

    // giftKit/items.ts treats a duplicate as a hard error: two cards with the
    // same key means one gift handed out twice. Dropping it here would hide
    // that and silently produce one card fewer than asked for.
    it('keeps duplicates so the caller can reject them', () => {
        expect(parseGiftDriveList(`${KEY_A}\n${KEY_A}`)).toEqual([
            { privateKey: KEY_A },
            { privateKey: KEY_A },
        ]);
    });

    it('throws listing the invalid entries', () => {
        expect(() => parseGiftDriveList(`${KEY_A}\nnonsense`)).toThrow(/Invalid private keys/);
    });

    it('preserves input order', () => {
        expect(parseGiftDriveList(`${KEY_B}\n${KEY_A}`).map(e => e.privateKey)).toEqual([
            KEY_B,
            KEY_A,
        ]);
    });
});
