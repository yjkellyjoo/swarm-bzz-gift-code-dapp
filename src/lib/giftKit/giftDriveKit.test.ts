import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { unzipSync } from 'fflate';
import { buildGiftKit } from './buildGiftKit';
import { decodeBytes } from './decode';
import { readXlsx } from './xlsxRead';
import { parseGiftDriveList } from '../giftDriveList';

/**
 * The cross-session path, end to end.
 *
 * An operator creates gift drives one day, copies the export, and comes back
 * later to build the handout kit from that text alone. Nothing but the
 * clipboard carries the drives between the two, so this is the seam worth
 * proving: paste in, and the drives have to come out the other side of the kit.
 */

const BATCHES = [
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
];

describe('gift drive export -> handout kit', () => {
  it('carries drives from a pasted export into the QRs and the sheet', async () => {
    const wallets = [
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
    ];

    // Exactly what the gift drive step's Copy gift drives button produces:
    // two codes with a drive, one without.
    const exported = [
      ['privateKey', 'address', 'batchId'].join('\t'),
      [wallets[0].privateKey, wallets[0].address, BATCHES[0]].join('\t'),
      [wallets[1].privateKey, wallets[1].address, BATCHES[1]].join('\t'),
      [wallets[2].privateKey, wallets[2].address, ''].join('\t'),
    ].join('\n');

    const entries = parseGiftDriveList(exported);
    expect(entries).toHaveLength(3);

    const driveByKey = new Map(
      entries
        .filter(e => e.batchId)
        .map(e => [e.privateKey.toLowerCase(), e.batchId as string]),
    );
    expect(driveByKey.size).toBe(2);

    const { zipBytes } = await buildGiftKit(
      entries.map(e => e.privateKey),
      { name: 'Cross session', driveByKey },
    );

    const files = unzipSync(zipBytes);

    // The QRs: two structured, one bare key.
    const qrNames = Object.keys(files).filter(n => n.startsWith('qr/')).sort();
    const texts = (await Promise.all(qrNames.map(n => decodeBytes(files[n])))).map(d => d[0]);

    const structured = texts.filter(t => t.startsWith('{')).map(t => JSON.parse(t));
    expect(structured.map(s => s.batch).sort()).toEqual([...BATCHES].sort());
    expect(structured.map(s => s.pk).sort()).toEqual(
      [wallets[0].privateKey, wallets[1].privateKey].sort(),
    );
    expect(texts.filter(t => !t.startsWith('{'))).toEqual([wallets[2].privateKey]);

    // The sheet: the drive recorded against the right row, blank for the third.
    const sheet = await readXlsx(files['Cross session.xlsx']);
    expect(sheet.rowValues.map(r => r.batchId ?? '')).toEqual([
      BATCHES[0],
      BATCHES[1],
      '',
    ]);
  }, 60_000);

  it('a plain key list still produces bare key QRs, unchanged', async () => {
    const wallets = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];
    const entries = parseGiftDriveList(wallets.map(w => w.privateKey).join('\n'));

    const { zipBytes } = await buildGiftKit(
      entries.map(e => e.privateKey),
      { name: 'Plain' },
    );

    const files = unzipSync(zipBytes);
    const qrNames = Object.keys(files).filter(n => n.startsWith('qr/')).sort();
    const texts = (await Promise.all(qrNames.map(n => decodeBytes(files[n])))).map(d => d[0]);

    expect(texts.sort()).toEqual(wallets.map(w => w.privateKey).sort());
    expect(texts.every(t => !t.startsWith('{'))).toBe(true);
  }, 60_000);
});
