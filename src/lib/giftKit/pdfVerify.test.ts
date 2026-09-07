import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { buildItems } from './items';
import { computeCardLayout } from './layout';
import { maxQrVersion, renderQr } from './qrPng';
import { buildPdf } from './pdfWrite';
import { buildXlsx } from './xlsxWrite';
import { rasterisePagesNode } from './rasteriseNode';
import { decodeImageData } from './decode';
import { sortIntoCardOrder } from './readingOrder';
import { verifyKit } from './verify';
import type { QrArtifact } from './types';

const layout = computeCardLayout(4, 5);

async function kit(count: number) {
  const keys = Array.from({ length: count }, () => ethers.Wallet.createRandom().privateKey);
  const items = buildItems(keys);
  const version = maxQrVersion(keys);
  const qrs: QrArtifact[] = items.map(i => renderQr(i.privateKey, version));
  return {
    keys,
    items,
    qrs,
    pdfBytes: await buildPdf(items, qrs, layout, 'E2E batch'),
    xlsxBytes: await buildXlsx(items, qrs, 'E2E batch'),
  };
}

describe('PDF decode-back', () => {
  it('decodes every card off a rendered page, in card order', async () => {
    const { keys, pdfBytes } = await kit(20);
    const found: string[] = [];
    for await (const page of rasterisePagesNode(pdfBytes)) {
      found.push(...sortIntoCardOrder(await decodeImageData(page)));
    }
    expect(found).toEqual(keys);
  }, 120_000);

  it('keeps card order across a page boundary', async () => {
    const { keys, pdfBytes } = await kit(21);
    const found: string[] = [];
    for await (const page of rasterisePagesNode(pdfBytes)) {
      found.push(...sortIntoCardOrder(await decodeImageData(page)));
    }
    expect(found).toEqual(keys);
    expect(found).toHaveLength(21);
  }, 120_000);

  it('passes full verification with the PDF pass enabled', async () => {
    const { items, qrs, pdfBytes, xlsxBytes } = await kit(20);
    const problems = await verifyKit({
      items, qrs, xlsxBytes, pdfBytes, rasterise: rasterisePagesNode,
    });
    expect(problems).toEqual([]);
  }, 120_000);

  it('catches a PDF built from the wrong QRs', async () => {
    const { items, qrs, xlsxBytes } = await kit(20);
    const other = await kit(20);
    const problems = await verifyKit({
      items, qrs, xlsxBytes, pdfBytes: other.pdfBytes, rasterise: rasterisePagesNode,
    });
    expect(problems.some(p => p.where === 'PDF')).toBe(true);
  }, 180_000);

  it('catches a PDF whose cards are in the wrong order', async () => {
    const { items, qrs, xlsxBytes } = await kit(20);
    // Same keys, shuffled onto the page: the sorted decode must notice.
    const shuffled = [...items].reverse();
    const shuffledQrs = shuffled.map(i => qrs[items.indexOf(i)]);
    const pdfBytes = await buildPdf(shuffled, shuffledQrs, layout, 'Shuffled');
    const problems = await verifyKit({
      items, qrs, xlsxBytes, pdfBytes, rasterise: rasterisePagesNode,
    });
    expect(problems.some(p => p.where === 'PDF' && /card order/.test(p.detail))).toBe(true);
  }, 180_000);
});
