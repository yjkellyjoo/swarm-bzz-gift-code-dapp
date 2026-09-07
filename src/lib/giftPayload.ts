import { ethers } from 'ethers';
import type { GiftCode } from './types';

/**
 * Encoding of what a gift QR code actually carries.
 *
 * Historically a QR held nothing but the bare private key. Now that a gift can
 * also come with a postage batch, the code needs to carry the batch ID too, so
 * codes that have a batch use a compact JSON form instead.
 *
 * Both forms are supported on the way in, forever: cards printed before this
 * change still scan, and so do keys a user pastes in by hand.
 */

export const GIFT_PAYLOAD_VERSION = 1;

interface StructuredGiftPayload {
    v: number;
    pk: string;
    batch: string;
    depth?: number;
    enc?: boolean;
    imm?: boolean;
}

export interface DecodedGiftPayload {
    privateKey: string;
    batchId?: string;
    batchDepth?: number;
    encrypted?: boolean;
    immutable?: boolean;
}

/**
 * Validate a private key.
 *
 * This lives here, rather than in walletUtils, because decoding a payload has
 * to validate before it can trust it - and walletUtils imports this module, so
 * the dependency has to point this way to avoid a cycle.
 */
export function isValidPrivateKey(privateKey: string): boolean {
    try {
        new ethers.Wallet(privateKey);
        return true;
    } catch {
        return false;
    }
}

function isBatchId(value: unknown): value is string {
    return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Build the string to encode into a gift QR code.
 *
 * With no batch, this returns the bare private key exactly as before, so
 * nothing about the existing flow changes until batches are actually used.
 */
export function encodeGiftPayload(code: GiftCode): string {
    if (!code.batchId) {
        return code.privateKey;
    }

    const payload: StructuredGiftPayload = {
        v: GIFT_PAYLOAD_VERSION,
        pk: code.privateKey,
        batch: code.batchId,
    };

    if (typeof code.batchDepth === 'number') payload.depth = code.batchDepth;
    if (typeof code.encrypted === 'boolean') payload.enc = code.encrypted;
    if (typeof code.immutable === 'boolean') payload.imm = code.immutable;

    return JSON.stringify(payload);
}

/**
 * Read either payload form back.
 *
 * Returns null for anything that does not contain a usable private key, so
 * callers can filter rather than having to guard every field themselves.
 */
export function decodeGiftPayload(text: string): DecodedGiftPayload | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('{')) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            return null;
        }

        if (typeof parsed !== 'object' || parsed === null) return null;
        const candidate = parsed as Partial<StructuredGiftPayload>;

        if (typeof candidate.pk !== 'string' || !isValidPrivateKey(candidate.pk)) {
            return null;
        }

        const decoded: DecodedGiftPayload = { privateKey: candidate.pk };
        if (isBatchId(candidate.batch)) decoded.batchId = candidate.batch;
        if (typeof candidate.depth === 'number') decoded.batchDepth = candidate.depth;
        if (typeof candidate.enc === 'boolean') decoded.encrypted = candidate.enc;
        if (typeof candidate.imm === 'boolean') decoded.immutable = candidate.imm;

        return decoded;
    }

    return isValidPrivateKey(trimmed) ? { privateKey: trimmed } : null;
}
