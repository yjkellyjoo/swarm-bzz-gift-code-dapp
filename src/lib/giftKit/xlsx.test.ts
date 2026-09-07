import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { buildItems } from './items';
import { maxQrVersion, renderQr } from './qrPng';
import { decodeBytes } from './decode';
import { buildXlsx } from './xlsxWrite';
import { readXlsx } from './xlsxRead';
import type { QrArtifact } from './types';

const keys = Array.from({ length: 3 }, () => ethers.Wallet.createRandom().privateKey);

function qrsFor(ks: string[]): QrArtifact[] {
  const version = maxQrVersion(ks);
  return ks.map(k => renderQr(k, version));
}

async function build() {
  const items = buildItems(keys);
  return { items, bytes: await buildXlsx(items, qrsFor(keys), 'Test batch') };
}

describe('xlsx', () => {
  it('writes one data row per key', async () => {
    const { bytes } = await build();
    expect((await readXlsx(bytes)).rowCount).toBe(3);
  });

  it('writes the address and key into each row', async () => {
    const { items, bytes } = await build();
    const { rowValues } = await readXlsx(bytes);
    for (const [i, item] of items.entries()) {
      expect(rowValues[i].address).toBe(item.address);
      expect(rowValues[i].privateKey).toBe(item.privateKey);
    }
  });

  it('writes Used as a boolean false, not a string', async () => {
    const { bytes } = await build();
    for (const row of (await readXlsx(bytes)).rowValues) expect(row.used).toBe(false);
  });

  it('carries no data validation on the sheet', async () => {
    // Read straight off the raw sheet XML rather than asking the writer to
    // confirm its own work. A dropdown survives into no app as a checkbox.
    const { bytes } = await build();
    expect((await readXlsx(bytes)).hasDataValidations).toBe(false);
  });

  it('anchors each QR to its own row', async () => {
    const { items, bytes } = await build();
    const { imagesByRow } = await readXlsx(bytes);
    expect(imagesByRow.size).toBe(items.length);
    for (const [i, item] of items.entries()) {
      const image = imagesByRow.get(i + 2); // row 1 is the header
      expect(image, `no QR anchored to row ${i + 2}`).toBeDefined();
      expect(await decodeBytes(image!)).toEqual([item.privateKey]);
    }
  });

  it('reads back what is actually embedded, not the order it was given', async () => {
    // Counting images would pass a sheet whose row 2 carried row 4's QR.
    // Deliberately mis-anchor by reversing the artifacts and confirm the
    // read-back reports the swap rather than the intended mapping.
    const items = buildItems(keys);
    const bytes = await buildXlsx(items, qrsFor(keys).reverse(), 'Mis-anchored');
    const { imagesByRow } = await readXlsx(bytes);
    expect(await decodeBytes(imagesByRow.get(2)!)).toEqual([keys[2]]);
    expect(await decodeBytes(imagesByRow.get(4)!)).toEqual([keys[0]]);
  });
});
