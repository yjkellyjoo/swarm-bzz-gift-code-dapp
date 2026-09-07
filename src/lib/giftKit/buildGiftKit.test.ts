import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';
import { unzipSync } from 'fflate';
import { buildGiftKit } from './buildGiftKit';
import { rasterisePagesNode } from './rasteriseNode';
import { decodeBytes } from './decode';

const keys = (n: number) =>
  Array.from({ length: n }, () => ethers.Wallet.createRandom().privateKey);

const BATCHES = [
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
];

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

  it('survives a batch name with characters Excel rejects', async () => {
    // An event organiser typing "ETHRome 2026: batch 1/2" must not abort the
    // export, and a slash must not nest the zip entries in a phantom folder.
    const { zipBytes } = await buildGiftKit(keys(2), { name: 'ETHRome 2026: batch 1/2' });
    const names = Object.keys(unzipSync(zipBytes));
    expect(names).toContain('ETHRome 2026- batch 1-2.xlsx');
    expect(names).toContain('ETHRome 2026- batch 1-2 - printable.pdf');
    expect(names.every(n => !n.includes('/') || n.startsWith('qr/'))).toBe(true);
  });

  it('returns the sanitised name so the caller can name the download', async () => {
    const { name } = await buildGiftKit(keys(1), { name: 'Devcon [main]' });
    expect(name).toBe('Devcon -main-');
  });

  it('rejects a hex-shaped key that is not a valid secp256k1 key, naming its position', async () => {
    const good = keys(1)[0];
    const zero = '0x' + '0'.repeat(64);
    await expect(buildGiftKit([good, zero], { name: 'Batch A' })).rejects.toThrow(/key 2/);
  });

  it('rejects a duplicate key before building anything', async () => {
    const k = keys(1)[0];
    await expect(buildGiftKit([k, k], { name: 'Batch A' })).rejects.toThrow(/duplicate/i);
  });

  it('encodes gift drives into the packed QRs, and verifies them', async () => {
    const ks = keys(3);
    const drives = new Map(ks.slice(0, 2).map((k, i) => [k.toLowerCase(), BATCHES[i]]));

    const { zipBytes, report } = await buildGiftKit(ks, { name: 'Drives', driveByKey: drives });
    expect(report.count).toBe(3);

    const entries = unzipSync(zipBytes);
    const qrNames = Object.keys(entries).filter(n => n.startsWith('qr/')).sort();

    // The two with a drive carry key and batch; the third stays a bare key so
    // a wallet can still scan and import it directly.
    const decoded = await Promise.all(qrNames.map(n => decodeBytes(entries[n])));
    const texts = decoded.map(d => d[0]);

    const structured = texts.filter(t => t.startsWith('{')).map(t => JSON.parse(t));
    expect(structured).toHaveLength(2);
    expect(structured.map(s => s.batch).sort()).toEqual([...BATCHES].sort());
    expect(texts.filter(t => !t.startsWith('{'))).toEqual([ks[2]]);
  }, 60_000);

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
