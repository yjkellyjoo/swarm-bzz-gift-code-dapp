import { describe, it, expect } from 'vitest';
import { parsePrivateKeys } from './walletUtils';
import { encodeGiftPayload } from './giftPayload';
import type { GiftCode } from './types';

// Well-known test keys; never used for real funds.
const KEY_A = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const KEY_B = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const ADDRESS_B = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const BATCH_A = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const BATCH_B = '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321';

describe('parsePrivateKeys', () => {
    it('returns nothing for empty input', () => {
        expect(parsePrivateKeys('')).toEqual([]);
        expect(parsePrivateKeys('   \n  ')).toEqual([]);
    });

    it('parses newline-separated keys', () => {
        expect(parsePrivateKeys(`${KEY_A}\n${KEY_B}`)).toEqual([KEY_A, KEY_B]);
    });

    it('parses comma-separated keys', () => {
        expect(parsePrivateKeys(`${KEY_A}, ${KEY_B}`)).toEqual([KEY_A, KEY_B]);
    });

    it('throws listing the invalid entries', () => {
        expect(() => parsePrivateKeys(`${KEY_A}\nnonsense`)).toThrow(/Invalid private keys/);
    });

    // The regression this guards: a batch ID is 32 bytes of hex, so a naive
    // comma split would treat it as a second private key.
    it('extracts exactly one key from a structured payload', () => {
        const payload = encodeGiftPayload({
            privateKey: KEY_A,
            address: ADDRESS_A,
            batchId: BATCH_A,
            batchDepth: 20,
            encrypted: true,
        } satisfies GiftCode);

        expect(parsePrivateKeys(payload)).toEqual([KEY_A]);
    });

    it('handles several structured payloads, one per line', () => {
        const lines = [
            encodeGiftPayload({ privateKey: KEY_A, address: ADDRESS_A, batchId: BATCH_A }),
            encodeGiftPayload({ privateKey: KEY_B, address: ADDRESS_B, batchId: BATCH_B }),
        ].join('\n');

        expect(parsePrivateKeys(lines)).toEqual([KEY_A, KEY_B]);
    });

    it('mixes bare keys and structured payloads', () => {
        const payload = encodeGiftPayload({
            privateKey: KEY_B,
            address: ADDRESS_B,
            batchId: BATCH_B,
        });

        expect(parsePrivateKeys(`${KEY_A}\n${payload}`)).toEqual([KEY_A, KEY_B]);
    });

    it('reads back the tab-separated Copy Codes export, header and all', () => {
        const exported = [
            ['privateKey', 'address', 'batchId'].join('\t'),
            [KEY_A, ADDRESS_A, BATCH_A].join('\t'),
            [KEY_B, ADDRESS_B, BATCH_B].join('\t'),
        ].join('\n');

        expect(parsePrivateKeys(exported)).toEqual([KEY_A, KEY_B]);
    });

    it('reads back the export from before batches existed', () => {
        expect(parsePrivateKeys(`${KEY_A}\n${KEY_B}\n`)).toEqual([KEY_A, KEY_B]);
    });

    it('deduplicates a wallet listed twice, so it is not drained twice', () => {
        const payload = encodeGiftPayload({
            privateKey: KEY_A,
            address: ADDRESS_A,
            batchId: BATCH_A,
        });

        expect(parsePrivateKeys(`${KEY_A}\n${payload}`)).toEqual([KEY_A]);
    });

    // A batch ID is 32 bytes of hex, which is indistinguishable from a private
    // key - any 32-byte value in range is a valid secp256k1 key. So validation
    // cannot catch a stray batch ID, and structure is the only defence: batch
    // IDs must never be split out as separate tokens in the first place.
    it('never emits a batch ID as a key, even though one would validate', () => {
        const payload = encodeGiftPayload({
            privateKey: KEY_A,
            address: ADDRESS_A,
            batchId: BATCH_A,
        });

        expect(parsePrivateKeys(payload)).not.toContain(BATCH_A);

        const exported = [
            ['privateKey', 'address', 'batchId'].join('\t'),
            [KEY_A, ADDRESS_A, BATCH_A].join('\t'),
        ].join('\n');

        expect(parsePrivateKeys(exported)).not.toContain(BATCH_A);
        expect(parsePrivateKeys(exported)).toEqual([KEY_A]);
    });
});
