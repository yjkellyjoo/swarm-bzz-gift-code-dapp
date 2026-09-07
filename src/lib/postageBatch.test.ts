import { describe, it, expect } from 'vitest';
import {
    formatBytes,
    formatBzz,
    formatTtl,
    getBatchCostPlur,
    getBatchTtlSeconds,
    getEffectiveCapacityBytes,
    getTheoreticalCapacityBytes,
    summariseAffordability,
    validateBatchParams,
} from './postageBatch';
import type { BatchParams, ChainBatchLimits, WalletAffordability } from './postageBatch';
import { CONFIG } from '../config';

const limits: ChainBatchLimits = {
    // 17280 blocks * 24000 PLUR, i.e. the shape of the contract's 24h minimum.
    lastPrice: 24000n,
    minimumBucketDepth: 16,
    minimumInitialBalancePerChunk: 414720000n,
};

function params(overrides: Partial<BatchParams> = {}): BatchParams {
    return {
        depth: 17,
        amountPerChunk: 414720000n,
        encrypted: false,
        immutable: false,
        ...overrides,
    };
}

describe('getBatchCostPlur', () => {
    it('multiplies the per-chunk amount by the chunk count', () => {
        expect(getBatchCostPlur(17, 414720000n)).toBe(414720000n * 131072n);
    });

    it('stays exact at large depths where floats would lose precision', () => {
        // 2^34 * 414720000 far exceeds Number.MAX_SAFE_INTEGER, so this is only
        // exact because the maths is done in BigInt throughout.
        expect(getBatchCostPlur(34, 414720000n)).toBe(7124835347988480000n);
        expect(getBatchCostPlur(34, 414720000n)).toBeGreaterThan(
            BigInt(Number.MAX_SAFE_INTEGER)
        );
    });

    it('scales by exactly 2x per depth increment', () => {
        expect(getBatchCostPlur(21, 1n) / getBatchCostPlur(20, 1n)).toBe(2n);
    });
});

describe('formatBzz', () => {
    it('formats PLUR using the token\'s 16 decimals', () => {
        expect(CONFIG.BZZ_DECIMALS).toBe(16);
        expect(formatBzz(10n ** 16n)).toBe('1.0');
    });

    it('formats a depth-17 minimum batch cost', () => {
        // 414720000 * 2^17 PLUR = 54358179840000 PLUR = 0.005435817984 xBZZ
        expect(formatBzz(getBatchCostPlur(17, 414720000n))).toBe('0.005435817984');
    });
});

describe('getTheoreticalCapacityBytes', () => {
    it('is 4096 bytes per chunk', () => {
        expect(getTheoreticalCapacityBytes(17)).toBe(536870912);
    });
});

describe('getEffectiveCapacityBytes', () => {
    it('returns the measured value for a depth in the table', () => {
        expect(getEffectiveCapacityBytes(17, false)).toBe(44700);
        expect(getEffectiveCapacityBytes(20, false)).toBe(687620000);
    });

    it('returns slightly less capacity for encrypted uploads', () => {
        expect(getEffectiveCapacityBytes(17, true)).toBe(44350);
        expect(getEffectiveCapacityBytes(20, true)).toBe(682210000);
        expect(getEffectiveCapacityBytes(20, true)).toBeLessThan(
            getEffectiveCapacityBytes(20, false)
        );
    });

    it('is always well below the theoretical capacity at low depths', () => {
        expect(getEffectiveCapacityBytes(17, false)).toBeLessThan(
            getTheoreticalCapacityBytes(17)
        );
    });

    it('returns 0 below the minimum depth', () => {
        expect(getEffectiveCapacityBytes(16, false)).toBe(0);
        expect(getEffectiveCapacityBytes(0, false)).toBe(0);
    });

    it('returns 0 for a non-integer depth', () => {
        expect(getEffectiveCapacityBytes(17.5, false)).toBe(0);
    });

    it('falls back to 90% utilisation past the end of the table', () => {
        const depth = CONFIG.MAX_BATCH_DEPTH + 1;
        expect(getEffectiveCapacityBytes(depth, false)).toBe(
            Math.ceil(getTheoreticalCapacityBytes(depth) * 0.9)
        );
    });
});

describe('getBatchTtlSeconds', () => {
    it('converts amount/price into seconds using the block time', () => {
        // 17280 blocks at 5s per block is 86400s, i.e. 24 hours.
        expect(getBatchTtlSeconds(414720000n, 24000n)).toBe(86400);
    });

    it('doubles when the amount doubles', () => {
        expect(getBatchTtlSeconds(829440000n, 24000n)).toBe(172800);
    });

    it('returns 0 rather than dividing by a zero price', () => {
        expect(getBatchTtlSeconds(414720000n, 0n)).toBe(0);
    });
});

describe('formatBytes', () => {
    it('uses decimal units to match the bee-js capacity table', () => {
        // 1000-based, so a depth-17 batch reads as kB rather than KiB.
        expect(formatBytes(44700)).toBe('44.7 kB');
        expect(formatBytes(687620000)).toBe('688 MB');
        expect(formatBytes(7730000000)).toBe('7.73 GB');
    });

    it('handles zero and negatives', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(-1)).toBe('0 B');
    });
});

describe('formatTtl', () => {
    it('describes a sub-day batch in hours', () => {
        expect(formatTtl(86399)).toBe('~23 hours');
    });

    it('rolls over to days at exactly 24h', () => {
        expect(formatTtl(86400)).toBe('~1.0 days');
    });

    it('describes longer batches in days', () => {
        expect(formatTtl(86400 * 30)).toBe('~30 days');
    });

    it('reports unknown for a zero TTL', () => {
        expect(formatTtl(0)).toBe('unknown');
    });
});

describe('validateBatchParams', () => {
    it('accepts valid params', () => {
        expect(validateBatchParams(params(), limits)).toEqual([]);
    });

    it('rejects a depth below the bucket-depth floor', () => {
        const errors = validateBatchParams(params({ depth: 16 }), limits);
        expect(errors.join(' ')).toMatch(/at least 17/);
    });

    it('rejects a depth above the supported maximum', () => {
        const errors = validateBatchParams(params({ depth: 99 }), limits);
        expect(errors.join(' ')).toMatch(/at most 41/);
    });

    it('rejects a non-integer depth', () => {
        const errors = validateBatchParams(params({ depth: 17.5 }), limits);
        expect(errors.join(' ')).toMatch(/whole number/);
    });

    it('rejects a zero amount', () => {
        const errors = validateBatchParams(params({ amountPerChunk: 0n }), limits);
        expect(errors.join(' ')).toMatch(/greater than 0/);
    });

    it('rejects an amount below the contract minimum', () => {
        const errors = validateBatchParams(params({ amountPerChunk: 1n }), limits);
        expect(errors.join(' ')).toMatch(/at least 414720000 PLUR/);
    });

    it('rejects a depth at or below the contract bucket depth', () => {
        const highBucket: ChainBatchLimits = { ...limits, minimumBucketDepth: 20 };
        const errors = validateBatchParams(params({ depth: 18 }), highBucket);
        expect(errors.join(' ')).toMatch(/minimum bucket depth \(20\)/);
    });

    it('still checks static rules with no chain limits available', () => {
        expect(validateBatchParams(params({ depth: 5 }), null).length).toBeGreaterThan(0);
        expect(validateBatchParams(params({ amountPerChunk: 1n }), null)).toEqual([]);
    });
});

describe('summariseAffordability', () => {
    const row = (over: Partial<WalletAffordability> = {}): WalletAffordability => ({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        bzzBalance: 10n ** 16n,
        nativeBalance: 10n ** 18n,
        costPlur: 10n ** 14n,
        canAfford: true,
        ...over,
    });

    it('counts an all-clear run', () => {
        expect(summariseAffordability([row(), row()])).toEqual({ affordable: 2, blocked: 0 });
    });

    it('counts blocked wallets and surfaces the first reason', () => {
        const summary = summariseAffordability([
            row(),
            row({ canAfford: false, reason: 'holds 0.0 xBZZ, needs 0.01 xBZZ' }),
        ]);

        expect(summary.affordable).toBe(1);
        expect(summary.blocked).toBe(1);
        expect(summary.firstReason).toMatch(/needs 0.01 xBZZ/);
    });

    it('handles an empty run', () => {
        expect(summariseAffordability([])).toEqual({ affordable: 0, blocked: 0 });
    });
});
