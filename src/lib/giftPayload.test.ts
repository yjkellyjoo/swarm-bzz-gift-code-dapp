import { describe, it, expect } from 'vitest';
import { encodeGiftPayload, decodeGiftPayload, isValidPrivateKey } from './giftPayload';
import { generateQRCodeSVG } from './qrUtils';
import type { GiftCode } from './types';

// Well-known test key; never used for real funds.
const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const BATCH_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function code(overrides: Partial<GiftCode> = {}): GiftCode {
    return { privateKey: PRIVATE_KEY, address: ADDRESS, ...overrides };
}

describe('isValidPrivateKey', () => {
    it('accepts a 32-byte key', () => {
        expect(isValidPrivateKey(PRIVATE_KEY)).toBe(true);
    });

    it('rejects a batch ID, an address and junk', () => {
        // A batch ID is 32 bytes of hex, same as a key - but it is not one.
        expect(isValidPrivateKey(ADDRESS)).toBe(false);
        expect(isValidPrivateKey('nonsense')).toBe(false);
        expect(isValidPrivateKey('')).toBe(false);
    });
});

describe('encodeGiftPayload', () => {
    it('returns the bare private key when there is no batch', () => {
        expect(encodeGiftPayload(code())).toBe(PRIVATE_KEY);
    });

    it('encodes only version, key and batch', () => {
        const payload = encodeGiftPayload(
            code({ batchId: BATCH_ID, batchDepth: 20, encrypted: true, immutable: false })
        );

        // depth/enc/imm are deliberately absent: they cost two QR versions,
        // which is the difference between a card that scans off print and one
        // that does not. They live in the xlsx instead.
        expect(JSON.parse(payload)).toEqual({ v: 1, pk: PRIVATE_KEY, batch: BATCH_ID });
    });

    it('stays inside the QR budget that keeps a printed card scannable', () => {
        const payload = encodeGiftPayload(
            code({ batchId: BATCH_ID, batchDepth: 20, encrypted: true, immutable: false })
        );
        expect(payload.length).toBeLessThanOrEqual(160);
    });
});

describe('decodeGiftPayload', () => {
    it('reads a bare private key', () => {
        expect(decodeGiftPayload(PRIVATE_KEY)).toEqual({ privateKey: PRIVATE_KEY });
    });

    it('tolerates surrounding whitespace', () => {
        expect(decodeGiftPayload(`  ${PRIVATE_KEY}\n`)).toEqual({ privateKey: PRIVATE_KEY });
    });

    it('round-trips the key and batch', () => {
        const original = code({ batchId: BATCH_ID, batchDepth: 20, encrypted: true });

        expect(decodeGiftPayload(encodeGiftPayload(original))).toEqual({
            privateKey: PRIVATE_KEY,
            batchId: BATCH_ID,
        });
    });

    it('still reads a payload that carries the older extra fields', () => {
        const legacy = JSON.stringify({
            v: 1, pk: PRIVATE_KEY, batch: BATCH_ID, depth: 20, enc: true, imm: false,
        });

        expect(decodeGiftPayload(legacy)).toEqual({
            privateKey: PRIVATE_KEY,
            batchId: BATCH_ID,
            batchDepth: 20,
            encrypted: true,
            immutable: false,
        });
    });

    it('round-trips a bare payload', () => {
        expect(decodeGiftPayload(encodeGiftPayload(code()))).toEqual({
            privateKey: PRIVATE_KEY,
        });
    });

    it('returns null for junk, empty input and malformed JSON', () => {
        expect(decodeGiftPayload('nonsense')).toBeNull();
        expect(decodeGiftPayload('')).toBeNull();
        expect(decodeGiftPayload('   ')).toBeNull();
        expect(decodeGiftPayload('{not json')).toBeNull();
    });

    it('returns null when the payload carries no usable key', () => {
        expect(decodeGiftPayload(JSON.stringify({ v: 1, batch: BATCH_ID }))).toBeNull();
        expect(
            decodeGiftPayload(JSON.stringify({ v: 1, pk: 'nope', batch: BATCH_ID }))
        ).toBeNull();
    });

    it('drops a malformed batch ID but keeps the key', () => {
        const decoded = decodeGiftPayload(
            JSON.stringify({ v: 1, pk: PRIVATE_KEY, batch: 'not-a-batch' })
        );

        expect(decoded).toEqual({ privateKey: PRIVATE_KEY });
    });

    it('never mistakes an address for a private key', () => {
        expect(decodeGiftPayload(ADDRESS)).toBeNull();
    });
});

describe('QR encoding of a payload', () => {
    // The structured payload is over twice the length of a bare key, so it is
    // worth proving it still fits in a QR code and survives a round trip.
    const full = code({
        batchId: BATCH_ID,
        batchDepth: 20,
        encrypted: true,
        immutable: false,
    });

    it('stays a reasonable size', () => {
        expect(encodeGiftPayload(full).length).toBeLessThanOrEqual(160);
    });

    it('encodes as an SVG QR code', async () => {
        const svg = await generateQRCodeSVG(encodeGiftPayload(full));
        expect(svg).toContain('<svg');
        expect(svg.length).toBeGreaterThan(500);
    });

    it('still encodes a bare key, as before', async () => {
        const svg = await generateQRCodeSVG(encodeGiftPayload(code()));
        expect(svg).toContain('<svg');
    });

    it('decodes back to the key and batch it was built from', () => {
        expect(decodeGiftPayload(encodeGiftPayload(full))).toEqual({
            privateKey: PRIVATE_KEY,
            batchId: BATCH_ID,
        });
    });
});
