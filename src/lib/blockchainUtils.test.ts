import { describe, it, expect } from 'vitest';
import { sweepableAmount } from './blockchainUtils';

describe('sweepableAmount', () => {
    it('sends the balance minus the exact fee, leaving nothing behind', () => {
        const balance = 10_000_000_000_000_000n; // 0.01 xDAI
        const amount = sweepableAmount(balance, 21_000n, 2n);
        expect(amount).toBe(balance - 42_000n);
        expect(balance - amount - 21_000n * 2n).toBe(0n);
    });

    it('returns 0 when the balance only just covers the fee', () => {
        expect(sweepableAmount(42_000n, 21_000n, 2n)).toBe(0n);
    });

    it('returns 0 when the balance cannot cover the fee', () => {
        expect(sweepableAmount(1n, 21_000n, 2n)).toBe(0n);
        expect(sweepableAmount(0n, 21_000n, 2n)).toBe(0n);
    });
});
