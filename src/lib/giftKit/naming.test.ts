import { describe, it, expect } from 'vitest';
import { truncateAddress, qrEntryPath, sanitiseBatchName, xlsxName, pdfName } from './naming';

describe('naming', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('truncates an address to head and tail', () => {
    expect(truncateAddress(address)).toBe('0x12345678...12345678');
  });

  it('zero-pads the QR entry path to the batch width', () => {
    expect(qrEntryPath({ num: 7, address, privateKey: '' }, 70)).toBe(`qr/07_${address}.png`);
  });

  it('pads to three digits for a batch of hundreds, so files sort correctly', () => {
    // A fixed two-digit pad lists a 300-key batch as 01, 10, 100, 101, 11.
    const path = (num: number) => qrEntryPath({ num, address, privateKey: '' }, 300);
    expect(path(7)).toBe(`qr/007_${address}.png`);
    expect(path(11)).toBe(`qr/011_${address}.png`);
    expect(path(100)).toBe(`qr/100_${address}.png`);
    expect([path(100), path(11)].sort()).toEqual([path(11), path(100)]);
  });

  it('strips characters Excel rejects in a worksheet name', () => {
    // "ETHRome 2026: batch 1/2" would otherwise abort the whole export.
    expect(sanitiseBatchName('ETHRome 2026: batch 1/2')).toBe('ETHRome 2026- batch 1-2');
    expect(sanitiseBatchName('Devcon [main]')).toBe('Devcon -main-');
    expect(sanitiseBatchName('Normal name')).toBe('Normal name');
  });

  it('falls back to a default when nothing usable is left', () => {
    expect(sanitiseBatchName('   ')).toBe('Gift codes');
  });

  it('builds the artifact filenames', () => {
    expect(xlsxName('Swarm BZZ Gift Codes')).toBe('Swarm BZZ Gift Codes.xlsx');
    expect(pdfName('Swarm BZZ Gift Codes')).toBe('Swarm BZZ Gift Codes - printable.pdf');
  });
});
