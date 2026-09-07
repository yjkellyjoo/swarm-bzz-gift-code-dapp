import { ethers } from 'ethers';
import { CONFIG, ERC20_ABI, POSTAGE_STAMP_ABI, EFFECTIVE_CAPACITY_BYTES } from '../config';
import type { GiftCode } from './types';

/**
 * Postage batch creation for gift wallets.
 *
 * Each gift wallet buys its own batch: it approves xBZZ to the PostageStamp
 * contract and then calls createBatch with itself as the owner. Owning the
 * batch is the point - a Bee node can only sign stamps for batches its own key
 * owns, so the recipient imports the gift key and the batch works immediately.
 *
 * Contract reference: ethersphere/storage-incentives -> src/PostageStamp.sol
 *   createBatch(address _owner, uint256 _initialBalancePerChunk, uint8 _depth,
 *               uint8 _bucketDepth, bytes32 _nonce, bool _immutable)
 *   - pulls _initialBalancePerChunk * 2^_depth xBZZ from msg.sender
 *   - requires _bucketDepth >= minimumBucketDepth and _bucketDepth < _depth
 *   - requires _initialBalancePerChunk >= minimumInitialBalancePerChunk()
 */

/** Bytes per chunk in Swarm. */
const CHUNK_SIZE_BYTES = 4096;

/** bee-js caps utilisation at 90% for depths outside the measured table. */
const MAX_UTILIZATION = 0.9;

export interface BatchParams {
    depth: number;
    /** Per-chunk amount in PLUR. */
    amountPerChunk: bigint;
    /** Sizing hint only - encryption is never sent on-chain. */
    encrypted: boolean;
    /** The on-chain _immutable flag. */
    immutable: boolean;
}

/** Live constraints read from the PostageStamp contract. */
export interface ChainBatchLimits {
    lastPrice: bigint;
    minimumBucketDepth: number;
    minimumInitialBalancePerChunk: bigint;
}

export interface BatchResult {
    address: string;
    privateKey: string;
    batchId?: string;
    approveTxHash?: string;
    createTxHash?: string;
    error?: string;
}

export interface BatchProgress {
    current: number;
    total: number;
    processing: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Total xBZZ a batch costs, in PLUR: amount per chunk times chunk count. */
export function getBatchCostPlur(depth: number, amountPerChunk: bigint): bigint {
    return 2n ** BigInt(depth) * amountPerChunk;
}

/** Format a PLUR amount as xBZZ, using the token's 16 decimals. */
export function formatBzz(plur: bigint): string {
    return ethers.formatUnits(plur, CONFIG.BZZ_DECIMALS);
}

/** Theoretical capacity: every chunk the batch could ever stamp. */
export function getTheoreticalCapacityBytes(depth: number): number {
    return CHUNK_SIZE_BYTES * 2 ** depth;
}

/**
 * Usable capacity, which is what an operator actually cares about - batches
 * fill up well short of their theoretical size. Erasure coding is none.
 */
export function getEffectiveCapacityBytes(depth: number, encrypted: boolean): number {
    if (!Number.isInteger(depth) || depth < CONFIG.MIN_BATCH_DEPTH) {
        return 0;
    }

    const entry = EFFECTIVE_CAPACITY_BYTES[depth];
    if (entry) {
        return encrypted ? entry.encrypted : entry.plain;
    }

    // Past the measured table utilisation is always >99%; approximate.
    return Math.ceil(getTheoreticalCapacityBytes(depth) * MAX_UTILIZATION);
}

/**
 * How long the batch stays alive.
 *
 * Storage is paid per chunk per block, so amount/price is a block count, which
 * the chain's block time turns into seconds.
 */
export function getBatchTtlSeconds(amountPerChunk: bigint, lastPrice: bigint): number {
    if (lastPrice <= 0n) return 0;
    return Number((amountPerChunk * BigInt(CONFIG.GNOSIS_BLOCK_TIME_SECONDS)) / lastPrice);
}

/** Decimal byte sizes, matching the units bee-js publishes capacity in. */
export function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';

    const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
    let value = bytes;
    let unit = 0;

    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit += 1;
    }

    const decimals = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(decimals)} ${units[unit]}`;
}

/** Round TTL down to a readable unit. */
export function formatTtl(seconds: number): string {
    if (seconds <= 0) return 'unknown';
    if (seconds < 3600) return `~${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `~${Math.floor(seconds / 3600)} hours`;

    const days = seconds / 86400;
    if (days < 365) return `~${days < 10 ? days.toFixed(1) : Math.floor(days)} days`;
    return `~${(days / 365).toFixed(1)} years`;
}

/**
 * Check batch settings, returning every problem found.
 *
 * `limits` is optional so the form can validate the statically-knowable rules
 * before the chain has been read.
 */
export function validateBatchParams(
    params: BatchParams,
    limits: ChainBatchLimits | null = null
): string[] {
    const errors: string[] = [];

    if (!Number.isInteger(params.depth)) {
        errors.push('Batch depth must be a whole number');
    } else if (params.depth < CONFIG.MIN_BATCH_DEPTH) {
        errors.push(
            `Batch depth must be at least ${CONFIG.MIN_BATCH_DEPTH} (bucket depth is ${CONFIG.POSTAGE_BUCKET_DEPTH})`
        );
    } else if (params.depth > CONFIG.MAX_BATCH_DEPTH) {
        errors.push(`Batch depth must be at most ${CONFIG.MAX_BATCH_DEPTH}`);
    }

    if (params.amountPerChunk <= 0n) {
        errors.push('Batch amount must be greater than 0');
    }

    if (limits) {
        if (Number.isInteger(params.depth) && params.depth <= limits.minimumBucketDepth) {
            errors.push(
                `Batch depth must be greater than the contract's minimum bucket depth (${limits.minimumBucketDepth})`
            );
        }

        if (
            params.amountPerChunk > 0n &&
            params.amountPerChunk < limits.minimumInitialBalancePerChunk
        ) {
            errors.push(
                `Batch amount must be at least ${limits.minimumInitialBalancePerChunk.toString()} PLUR ` +
                `(the contract's current 24h minimum)`
            );
        }
    }

    return errors;
}

// ---------------------------------------------------------------------------
// Chain reads
// ---------------------------------------------------------------------------

/** Read the constraints and price the contract is currently enforcing. */
export async function readChainBatchLimits(
    provider: ethers.Provider
): Promise<ChainBatchLimits> {
    const contract = new ethers.Contract(
        CONFIG.POSTAGE_STAMP_ADDRESS,
        POSTAGE_STAMP_ABI,
        provider
    );

    const [lastPrice, minimumBucketDepth, minimumInitialBalancePerChunk] = await Promise.all([
        contract.lastPrice(),
        contract.minimumBucketDepth(),
        contract.minimumInitialBalancePerChunk(),
    ]);

    return {
        lastPrice: BigInt(lastPrice),
        minimumBucketDepth: Number(minimumBucketDepth),
        minimumInitialBalancePerChunk: BigInt(minimumInitialBalancePerChunk),
    };
}

/**
 * Pull the batch ID out of a createBatch receipt.
 *
 * The BatchCreated event is authoritative. The keccak fallback only matters if
 * the log cannot be parsed, and is correct here because the gift wallet is
 * msg.sender: batchId = keccak256(abi.encode(msg.sender, nonce)).
 */
export function extractBatchId(
    receipt: ethers.TransactionReceipt,
    walletAddress: string,
    nonce: string
): string {
    const iface = new ethers.Interface(POSTAGE_STAMP_ABI);

    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== CONFIG.POSTAGE_STAMP_ADDRESS.toLowerCase()) {
            continue;
        }

        try {
            const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed?.name === 'BatchCreated') {
                return parsed.args.batchId as string;
            }
        } catch {
            // Not an event this ABI knows about - keep looking.
        }
    }

    console.warn('BatchCreated log not found; deriving batch ID from nonce');
    return ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'bytes32'],
            [walletAddress, nonce]
        )
    );
}

// ---------------------------------------------------------------------------
// Batch creation
// ---------------------------------------------------------------------------

/**
 * Buy one postage batch, paid for and owned by the gift wallet itself.
 *
 * Balances are checked up front so an underfunded wallet produces a readable
 * message instead of an opaque revert.
 */
export async function createBatchForWallet(
    privateKey: string,
    params: BatchParams,
    rpcUrl: string
): Promise<BatchResult> {
    const provider = new ethers.JsonRpcProvider(rpcUrl, CONFIG.CHAIN_ID);
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = wallet.address;

    const result: BatchResult = { address, privateKey };

    const totalCost = getBatchCostPlur(params.depth, params.amountPerChunk);
    const bzz = new ethers.Contract(CONFIG.XBZZ_TOKEN_ADDRESS, ERC20_ABI, wallet);

    // Preflight: the two ways this reverts unhelpfully.
    const [bzzBalance, nativeBalance] = await Promise.all([
        bzz.balanceOf(address) as Promise<bigint>,
        provider.getBalance(address),
    ]);

    if (bzzBalance < totalCost) {
        throw new Error(
            `${address} holds ${formatBzz(bzzBalance)} xBZZ but the batch costs ` +
            `${formatBzz(totalCost)} xBZZ. Fund the wallet with more xBZZ first.`
        );
    }

    if (nativeBalance === 0n) {
        throw new Error(`${address} has no xDAI for gas. Fund the wallet first.`);
    }

    // Approve exactly what the batch costs.
    const currentAllowance = (await bzz.allowance(
        address,
        CONFIG.POSTAGE_STAMP_ADDRESS
    )) as bigint;

    if (currentAllowance < totalCost) {
        console.log(`🔄 ${address}: approving ${formatBzz(totalCost)} xBZZ`);
        const approveTx = await bzz.approve(CONFIG.POSTAGE_STAMP_ADDRESS, totalCost);
        result.approveTxHash = approveTx.hash;
        await approveTx.wait(1);
    }

    const postageStamp = new ethers.Contract(
        CONFIG.POSTAGE_STAMP_ADDRESS,
        POSTAGE_STAMP_ABI,
        wallet
    );

    const nonce = ethers.hexlify(ethers.randomBytes(32));

    console.log(`💰 ${address}: creating batch depth=${params.depth} amount=${params.amountPerChunk}`);
    const createTx = await postageStamp.createBatch(
        address,
        params.amountPerChunk,
        params.depth,
        CONFIG.POSTAGE_BUCKET_DEPTH,
        nonce,
        params.immutable
    );
    result.createTxHash = createTx.hash;

    const receipt = await createTx.wait(1);
    if (!receipt) {
        throw new Error(`Batch transaction ${createTx.hash} produced no receipt`);
    }

    result.batchId = extractBatchId(receipt, address, nonce);
    console.log(`✅ ${address}: batch ${result.batchId}`);

    return result;
}

/**
 * Create a batch for each gift wallet, one at a time.
 *
 * A wallet that fails is recorded and the run continues, so one underfunded
 * wallet in a print run of fifty does not throw away the other forty-nine.
 */
export async function createBatchesForWallets(
    codes: GiftCode[],
    params: BatchParams,
    rpcUrl: string,
    onProgress?: (progress: BatchProgress) => void
): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        onProgress?.({ current: i + 1, total: codes.length, processing: code.address });

        try {
            results.push(await createBatchForWallet(code.privateKey, params, rpcUrl));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create batch';
            console.error(`❌ ${code.address}: ${message}`);
            results.push({
                address: code.address,
                privateKey: code.privateKey,
                error: message,
            });
        }
    }

    return results;
}
