import { describe, it, expect } from 'vitest';
import { itemPayload } from './payload';
import type { GiftKitItem } from './types';

const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const BATCH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

const item = (over: Partial<GiftKitItem> = {}): GiftKitItem => ({
  num: 1, address: ADDRESS, privateKey: PK, ...over,
});

describe('itemPayload', () => {
  // A plain gift code must stay a bare key so a wallet app can scan it and
  // import directly. Only a gift drive needs the structured form.
  it('is the bare key with no gift drive', () => {
    expect(itemPayload(item())).toBe(PK);
  });

  it('carries key and batch once there is a gift drive', () => {
    expect(JSON.parse(itemPayload(item({ batchId: BATCH })))).toEqual({
      v: 1, pk: PK, batch: BATCH,
    });
  });

  it('is deterministic, so every artifact encodes the same text', () => {
    const withDrive = item({ batchId: BATCH });
    expect(itemPayload(withDrive)).toBe(itemPayload(withDrive));
  });
});
