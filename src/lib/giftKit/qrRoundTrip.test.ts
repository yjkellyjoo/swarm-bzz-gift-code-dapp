import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { maxQrVersion, renderQr } from './qrPng';
import { decodeBytes } from './decode';

const keys = Array.from({ length: 8 }, () => ethers.Wallet.createRandom().privateKey);

describe('QR round-trip', () => {
  it('decodes each PNG back to exactly its own key', async () => {
    const version = maxQrVersion(keys);
    for (const key of keys) {
      expect(await decodeBytes(renderQr(key, version).bytes)).toEqual([key]);
    }
  });

  it('pins one version across the batch so every PNG is the same size', () => {
    const version = maxQrVersion(keys);
    const sizes = new Set(keys.map(k => renderQr(k, version).pixelSize));
    expect(sizes.size).toBe(1);
  });

  it('matches the reference PNG geometry at version 5', () => {
    const art = renderQr(keys[0], 5);
    expect(art.moduleCount).toBe(37);      // 4 * 5 + 17
    expect(art.pixelSize).toBe(246);       // (37 + 2*2) * 6
  });

  it('never decodes to something other than the key it was built from', async () => {
    const version = maxQrVersion(keys);
    const decoded = await decodeBytes(renderQr(keys[0], version).bytes);
    expect(decoded).not.toEqual([keys[1]]);
  });
});
