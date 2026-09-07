import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';
import { unzipSync } from 'fflate';
import { buildGiftKit } from './buildGiftKit';
import { rasterisePagesNode } from './rasteriseNode';

const keys = (n: number) =>
  Array.from({ length: n }, () => ethers.Wallet.createRandom().privateKey);

describe('buildGiftKit', () => {
  it('packs the QRs, the xlsx and the PDF', async () => {
    const { zipBytes } = await buildGiftKit(keys(3), { name: 'Batch A' });
    const names = Object.keys(unzipSync(zipBytes));
    expect(names.filter(n => n.startsWith('qr/'))).toHaveLength(3);
    expect(names).toContain('Batch A.xlsx');
    expect(names).toContain('Batch A - printable.pdf');
  });

  it('leaves the PDF intact in the zip', async () => {
    // Regression guard: getDocument detaches the buffer it is handed, so a
    // rasteriser given the original array would empty this entry.
    const { zipBytes } = await buildGiftKit(keys(2), { name: 'Batch A' });
    const pdf = unzipSync(zipBytes)['Batch A - printable.pdf'];
    expect(pdf.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('leaves the xlsx intact in the zip', async () => {
    const { zipBytes } = await buildGiftKit(keys(2), { name: 'Batch A' });
    const xlsx = unzipSync(zipBytes)['Batch A.xlsx'];
    expect(xlsx.length).toBeGreaterThan(1000);
    expect([...xlsx.slice(0, 2)]).toEqual([0x50, 0x4b]); // PK zip magic
  });

  it('reports the batch geometry', async () => {
    const { report } = await buildGiftKit(keys(21), { name: 'Batch A' });
    expect(report.count).toBe(21);
    expect(report.pages).toBe(2);
    expect(report.mmPerModule).toBeGreaterThan(0.6);
  });

  it('reports progress for both phases', async () => {
    const onProgress = vi.fn();
    await buildGiftKit(keys(3), { name: 'Batch A' }, onProgress);
    const phases = new Set(onProgress.mock.calls.map(c => c[0].phase));
    expect(phases).toEqual(new Set(['build', 'verify']));
  });

  it('refuses to return a kit when a QR does not match its key', async () => {
    await expect(
      buildGiftKit(keys(2), { name: 'Batch A', __corruptFirstQr: true }),
    ).rejects.toThrow(/verification/i);
  });

  it('rejects a duplicate key before building anything', async () => {
    const k = keys(1)[0];
    await expect(buildGiftKit([k, k], { name: 'Batch A' })).rejects.toThrow(/duplicate/i);
  });

  it('builds and fully verifies a kit including the PDF pass', async () => {
    // The whole pipeline with nothing stubbed out: every QR decoded back from
    // the PNGs, the sheet, and rendered PDF pages.
    const { zipBytes, report } = await buildGiftKit(
      keys(20),
      { name: 'Batch A', __rasterise: rasterisePagesNode },
    );
    expect(report.count).toBe(20);
    expect(report.pages).toBe(1);
    expect(Object.keys(unzipSync(zipBytes))).toHaveLength(22); // 20 QRs + xlsx + pdf
  }, 120_000);
});
