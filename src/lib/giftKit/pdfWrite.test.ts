import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { buildItems } from './items';
import { maxQrVersion, renderQr } from './qrPng';
import { computeCardLayout } from './layout';
import { buildPdf } from './pdfWrite';

async function build(count: number) {
  const keys = Array.from({ length: count }, () => ethers.Wallet.createRandom().privateKey);
  const items = buildItems(keys);
  const version = maxQrVersion(keys);
  const qrs = items.map(i => renderQr(i.privateKey, version));
  return { keys, items, bytes: await buildPdf(items, qrs, computeCardLayout(4, 5), 'Test batch') };
}

describe('buildPdf', () => {
  it('emits a PDF', async () => {
    const { bytes } = await build(3);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('fits 20 cards on one page', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { bytes } = await build(20);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('spills onto a second page at 21', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { bytes } = await build(21);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it('uses A4 pages', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { bytes } = await build(1);
    const page = (await PDFDocument.load(bytes)).getPage(0);
    expect(page.getWidth()).toBeCloseTo(595.276, 2);
    expect(page.getHeight()).toBeCloseTo(841.89, 2);
  });

  it('sets the document title', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { bytes } = await build(1);
    expect((await PDFDocument.load(bytes)).getTitle()).toBe('Test batch');
  });

  it('never writes a private key into the page content', async () => {
    // A weak guard, not a proof: it would miss a compressed content stream.
    // The real guarantee is that buildPdf never passes a key to drawText.
    const { keys, bytes } = await build(1);
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain(keys[0].slice(2, 34));
  });
});
