import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { buildItems } from './items';

const key = () => ethers.Wallet.createRandom().privateKey;

describe('buildItems', () => {
  it('numbers from 1 so card #N is always sheet row N', () => {
    expect(buildItems([key(), key(), key()]).map(i => i.num)).toEqual([1, 2, 3]);
  });

  it('derives the checksummed address for each key', () => {
    const k = key();
    expect(buildItems([k])[0].address).toBe(new ethers.Wallet(k).address);
  });

  it('rejects a malformed key, naming its position', () => {
    expect(() => buildItems([key(), '0xnope'])).toThrow(/key 2/);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => buildItems(['0x' + 'a'.repeat(63)])).toThrow(/key 1/);
  });

  it('rejects a duplicate key', () => {
    const k = key();
    expect(() => buildItems([k, k])).toThrow(/duplicate/i);
  });

  it('rejects a duplicate that differs only in case', () => {
    const k = key();
    expect(() => buildItems([k, k.toUpperCase().replace('0X', '0x')])).toThrow(/duplicate/i);
  });

  it('rejects an empty batch', () => {
    expect(() => buildItems([])).toThrow(/no keys/i);
  });
});
