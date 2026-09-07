import { describe, it, expect } from 'vitest';
import { truncateAddress, qrEntryPath, xlsxName, pdfName } from './naming';

describe('naming', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('truncates an address to head and tail', () => {
    expect(truncateAddress(address)).toBe('0x12345678...12345678');
  });

  it('zero-pads the QR entry path', () => {
    expect(qrEntryPath({ num: 7, address, privateKey: '' })).toBe(`qr/07_${address}.png`);
  });

  it('does not truncate the number past two digits', () => {
    expect(qrEntryPath({ num: 300, address, privateKey: '' })).toBe(`qr/300_${address}.png`);
  });

  it('builds the artifact filenames', () => {
    expect(xlsxName('Swarm BZZ Gift Codes')).toBe('Swarm BZZ Gift Codes.xlsx');
    expect(pdfName('Swarm BZZ Gift Codes')).toBe('Swarm BZZ Gift Codes - printable.pdf');
  });
});
