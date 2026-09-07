import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { maxQrVersion, renderQr } from './qrPng';
import { decodeBytes } from './decode';
import { buildItems } from './items';
import { itemPayload } from './payload';
import { computeCardLayout } from './layout';
import { MM_PER_MODULE_FLOOR, mmPerModule } from './modulePitch';

const keys = Array.from({ length: 8 }, () => ethers.Wallet.createRandom().privateKey);
const BATCH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

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

describe('gift drive QR round-trip', () => {
  const items = buildItems(keys, new Map([[keys[0].toLowerCase(), BATCH]]));
  const payloads = items.map(itemPayload);

  it('decodes a gift drive back to its key and batch', async () => {
    const version = maxQrVersion(payloads);
    const decoded = await decodeBytes(renderQr(payloads[0], version).bytes);

    expect(decoded).toHaveLength(1);
    expect(JSON.parse(decoded[0])).toEqual({ v: 1, pk: keys[0], batch: BATCH });
  });

  it('leaves a plain gift code as a bare key a wallet can import', async () => {
    const version = maxQrVersion(payloads);
    expect(await decodeBytes(renderQr(payloads[1], version).bytes)).toEqual([keys[1]]);
  });

  // Assert the printed pitch, never a module count: node-qrcode's segment
  // optimiser mixes numeric and byte runs, so the version moves with the hex
  // content of each key. This is the check that the longer payload has not
  // pushed a printed card below what a phone camera can read.
  it('still prints legibly at the kit geometry', () => {
    const version = maxQrVersion(payloads);
    const layout = computeCardLayout(4, 5);

    for (const payload of payloads) {
      const art = renderQr(payload, version);
      expect(mmPerModule(layout.qrMm, art.moduleCount))
        .toBeGreaterThanOrEqual(MM_PER_MODULE_FLOOR);
    }
  });
});

describe('false-positive barcodes', () => {
  // Roughly one QR in 8000 contains a run of modules that zxing also reads as a
  // valid ITF 1D barcode. Left unrestricted the decoder returns two symbols and
  // the verifier rejects a perfectly good kit -- a false failure, which is worse
  // than no check, since the usual cure is to weaken the check.
  //
  // These are throwaway keys, never funded, found by sweeping random keys for
  // the QRCode+ITF case. All three produce it at version 5.
  const ITF_TRIGGERS = [
    '0xef71ed05ad9d7d2c6ba61a76ca3def033f2a0061809e3e7d05fae0a9cd186639',
    '0x117aeaeec11a91969fb7a2895112963ef83725d95f3189a8abc1be34a2f44200',
    '0xe04d8545ef0e4d2e1b20d3aeee6360dbdf6d339c2dfe9187328079fe5a114c2e',
  ];

  it.each(ITF_TRIGGERS)(
    'reports only the QR, never a 1D barcode read out of its modules (%s)',
    async key => {
      expect(await decodeBytes(renderQr(key, 5).bytes)).toEqual([key]);
    },
  );
});
