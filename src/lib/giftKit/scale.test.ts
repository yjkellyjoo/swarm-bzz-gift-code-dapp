import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { unzipSync } from 'fflate';
import { buildGiftKit } from './buildGiftKit';
import { rasterisePagesNode } from './rasteriseNode';

describe('300-key batch', () => {
  it('builds, verifies and packs the real worst case', async () => {
    // Batches on disk run to 300, well past the dapp's own 100-wallet
    // generation cap, so the paste path has to survive this.
    const keys = Array.from({ length: 300 }, () => ethers.Wallet.createRandom().privateKey);

    const phases = new Set<string>();
    const { zipBytes, report } = await buildGiftKit(
      keys,
      { name: 'Swarm BZZ Gift Codes', __rasterise: rasterisePagesNode },
      p => phases.add(p.phase),
    );

    expect(report.count).toBe(300);
    expect(report.pages).toBe(15);
    expect(report.mmPerModule).toBeGreaterThan(0.6);
    expect(phases).toEqual(new Set(['build', 'verify']));

    const entries = unzipSync(zipBytes);
    expect(Object.keys(entries).filter(n => n.startsWith('qr/'))).toHaveLength(300);
    expect(entries['Swarm BZZ Gift Codes.xlsx'].length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(
      entries['Swarm BZZ Gift Codes - printable.pdf'].slice(0, 5),
    )).toBe('%PDF-');
  }, 600_000);
});
