import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BATCH_NAME,
  giftCodesFileName,
  giftDrivesFileName,
  sanitiseBatchName,
} from './batchName';

describe('sanitiseBatchName', () => {
  it('keeps an ordinary name', () => {
    expect(sanitiseBatchName('Devcon 2026')).toBe('Devcon 2026');
  });

  // An organiser typing this must not produce a broken filename, and a slash
  // would nest a zip entry in a phantom folder.
  it('replaces characters that break filenames and Excel sheet names', () => {
    expect(sanitiseBatchName('ETHRome 2026: batch 1/2')).toBe('ETHRome 2026- batch 1-2');
  });

  it('falls back when the name is empty or only separators', () => {
    expect(sanitiseBatchName('')).toBe('Gift codes');
    expect(sanitiseBatchName('   ')).toBe('Gift codes');
  });
});

describe('filenames', () => {
  it('names the two downloads after the batch', () => {
    expect(giftCodesFileName('Devcon 2026')).toBe('Devcon 2026 - gift codes.txt');
    expect(giftDrivesFileName('Devcon 2026')).toBe('Devcon 2026 - gift drives.tsv');
  });

  it('sanitises before naming', () => {
    expect(giftCodesFileName('ETHRome: 1/2')).toBe('ETHRome- 1-2 - gift codes.txt');
  });

  it('still produces a usable name from an empty batch name', () => {
    expect(giftCodesFileName('')).toBe('Gift codes - gift codes.txt');
    expect(giftDrivesFileName('')).toBe('Gift codes - gift drives.tsv');
  });

  it('has a default matching what the handout kit used', () => {
    expect(DEFAULT_BATCH_NAME).toBe('Swarm BZZ Gift Codes');
  });
});
