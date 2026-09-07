// Configuration constants for the Swarm BZZ Gift Code Dapp

export const APP_NAME = 'Swarm BZZ Gift Code Dapp';
export const APP_TAGLINE = 'Generate and recover Swarm BZZ gift wallets on Gnosis Chain';

export const CONFIG = {
    // Gnosis Chain configuration
    CHAIN_ID: 100,
    CHAIN_NAME: 'Gnosis Chain',

    // Contract addresses
    FUND_CONTRACT_ADDRESS: '0xf268827Ef03CCCBEcf1d305b5B7DeD50D5ea4298',

    // Swarm PostageStamp contract on Gnosis Chain.
    // Source: ethersphere/storage-incentives -> mainnet_deployed.json (chainId 100)
    POSTAGE_STAMP_ADDRESS: '0x45a1502382541Cd610CC9068e88727426b696293',

    // Token addresses on Gnosis Chain
    XDAI_TOKEN_ADDRESS: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // xDAI
    XBZZ_TOKEN_ADDRESS: '0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da', // xBZZ
    UNISWAP_ROUTER_V2_ADDRESS: '0x1C232F01118CB8B424793ae03F870aa7D0ac7f77',

    // Default RPC URL (can be overridden by user)
    DEFAULT_RPC_URL: 'https://rpc.gnosischain.com',

    DEFAULT_XDAI_AMOUNT: 0.1,
    DEFAULT_XBZZ_AMOUNT: 1,
    DEFAULT_WALLET_COUNT: 1,

    BZZ_DECIMALS: 16,

    // Gas settings
    GAS_LIMIT: 300000,
    GAS_PRICE: '20000000000', // 20 gwei

    // Postage batch settings.
    //
    // Bee always stamps with a bucket depth of 16, and PostageStamp.createBatch
    // requires bucketDepth < depth, which is what puts the floor at depth 17.
    // MAX_BATCH_DEPTH is the last row of the effective-capacity table below.
    POSTAGE_BUCKET_DEPTH: 16,
    MIN_BATCH_DEPTH: 17,
    MAX_BATCH_DEPTH: 41,

    // Gnosis Chain targets 5s blocks. Batch TTL is amount/price measured in
    // blocks, so this is what converts that into wall-clock time.
    GNOSIS_BLOCK_TIME_SECONDS: 5,

    // Erasure coding is deliberately fixed at "none" for gift batches.
    ERASURE_CODING_LEVEL: 'none',

    DEFAULT_BATCH_DEPTH: 17,
    // Seed value only, and it goes stale: the real floor is
    // minimumInitialBalancePerChunk() (minimumValidityBlocks * lastPrice, ~24h),
    // which rises with the storage price. The form reads the live minimum and
    // raises this if it has fallen behind, so this only has to be a sane
    // starting point before the chain has been read.
    // Measured at 1474640640 PLUR (~24h) when this was written.
    DEFAULT_BATCH_AMOUNT: '1474640640',
    DEFAULT_BATCH_ENCRYPTED: false,
    DEFAULT_BATCH_IMMUTABLE: false,

    // QR Code settings
    QR_CODE_SIZE: 200,
    QR_CODE_MARGIN: 2,

    // UI settings
    MAX_WALLETS_PER_GENERATION: 100,
    MIN_XDAI_AMOUNT: 0.01,
    MIN_XBZZ_AMOUNT: 0,
    DAI_RESCUE_VALUE: 0.1,
    DAI_SAFE_SUB_VALUE: 0.008,
} as const;

// Fund contract ABI for the fund function
export const FUND_CONTRACT_ABI = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "token",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "tokenAmount",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "nativeAmount",
                "type": "uint256"
            },
            {
                "internalType": "address[]",
                "name": "addresses",
                "type": "address[]"
            }
        ],
        "name": "fund",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    }
] as const;

// ERC20 token ABI for balance and transfer functions
export const ERC20_ABI = [
    {
        "constant": true,
        "inputs": [{ "name": "_owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "balance", "type": "uint256" }],
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            { "name": "_to", "type": "address" },
            { "name": "_value", "type": "uint256" }
        ],
        "name": "transfer",
        "outputs": [{ "name": "", "type": "bool" }],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "name": "", "type": "uint8" }],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{ "name": "", "type": "string" }],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            { "name": "_owner", "type": "address" },
            { "name": "_spender", "type": "address" }
        ],
        "name": "allowance",
        "outputs": [{ "name": "", "type": "uint256" }],
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            { "name": "_spender", "type": "address" },
            { "name": "_value", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "type": "function"
    }
] as const;

// Swarm PostageStamp contract - only the pieces this app needs.
// Source: ethersphere/storage-incentives -> src/PostageStamp.sol
export const POSTAGE_STAMP_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "_owner", "type": "address" },
            { "internalType": "uint256", "name": "_initialBalancePerChunk", "type": "uint256" },
            { "internalType": "uint8", "name": "_depth", "type": "uint8" },
            { "internalType": "uint8", "name": "_bucketDepth", "type": "uint8" },
            { "internalType": "bytes32", "name": "_nonce", "type": "bytes32" },
            { "internalType": "bool", "name": "_immutable", "type": "bool" }
        ],
        "name": "createBatch",
        "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "batchId", "type": "bytes32" },
            { "indexed": false, "internalType": "uint256", "name": "totalAmount", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "normalisedBalance", "type": "uint256" },
            { "indexed": false, "internalType": "address", "name": "owner", "type": "address" },
            { "indexed": false, "internalType": "uint8", "name": "depth", "type": "uint8" },
            { "indexed": false, "internalType": "uint8", "name": "bucketDepth", "type": "uint8" },
            { "indexed": false, "internalType": "bool", "name": "immutableFlag", "type": "bool" }
        ],
        "name": "BatchCreated",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "lastPrice",
        "outputs": [{ "internalType": "uint64", "name": "", "type": "uint64" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "minimumBucketDepth",
        "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "minimumInitialBalancePerChunk",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

/**
 * Usable bytes per batch depth, with erasure coding set to none.
 *
 * A batch fills up well before its theoretical 4096 * 2^depth capacity, so
 * these are the numbers to show an operator. Encryption costs a little
 * capacity because encrypted content expands into more chunks.
 *
 * Source: ethersphere/bee-js -> src/types/index.ts, capacityBreakpoints,
 * RedundancyLevel.OFF. Values are decimal (kB = 1000 bytes) to match bee-js.
 */
export const EFFECTIVE_CAPACITY_BYTES: Record<number, { plain: number; encrypted: number }> = {
    17: { plain: 44700, encrypted: 44350 }, // 536.87 MB theoretical -> 44.70 kB plain / 44.35 kB encrypted
    18: { plain: 6660000, encrypted: 6610000 }, // 1.07 GB theoretical -> 6.66 MB plain / 6.61 MB encrypted
    19: { plain: 112060000, encrypted: 111180000 }, // 2.15 GB theoretical -> 112.06 MB plain / 111.18 MB encrypted
    20: { plain: 687620000, encrypted: 682210000 }, // 4.29 GB theoretical -> 687.62 MB plain / 682.21 MB encrypted
    21: { plain: 2600000000, encrypted: 2580000000 }, // 8.59 GB theoretical -> 2.60 GB plain / 2.58 GB encrypted
    22: { plain: 7730000000, encrypted: 7670000000 }, // 17.18 GB theoretical -> 7.73 GB plain / 7.67 GB encrypted
    23: { plain: 19940000000, encrypted: 19780000000 }, // 34.36 GB theoretical -> 19.94 GB plain / 19.78 GB encrypted
    24: { plain: 47060000000, encrypted: 46690000000 }, // 68.72 GB theoretical -> 47.06 GB plain / 46.69 GB encrypted
    25: { plain: 105510000000, encrypted: 104680000000 }, // 137.44 GB theoretical -> 105.51 GB plain / 104.68 GB encrypted
    26: { plain: 227980000000, encrypted: 226190000000 }, // 274.88 GB theoretical -> 227.98 GB plain / 226.19 GB encrypted
    27: { plain: 476680000000, encrypted: 472930000000 }, // 549.76 GB theoretical -> 476.68 GB plain / 472.93 GB encrypted
    28: { plain: 993650000000, encrypted: 985830000000 }, // 1.10 TB theoretical -> 993.65 GB plain / 985.83 GB encrypted
    29: { plain: 2040000000000, encrypted: 2030000000000 }, // 2.20 TB theoretical -> 2.04 TB plain / 2.03 TB encrypted
    30: { plain: 4170000000000, encrypted: 4140000000000 }, // 4.40 TB theoretical -> 4.17 TB plain / 4.14 TB encrypted
    31: { plain: 8450000000000, encrypted: 8390000000000 }, // 8.80 TB theoretical -> 8.45 TB plain / 8.39 TB encrypted
    32: { plain: 17070000000000, encrypted: 16930000000000 }, // 17.59 TB theoretical -> 17.07 TB plain / 16.93 TB encrypted
    33: { plain: 34360000000000, encrypted: 34090000000000 }, // 35.18 TB theoretical -> 34.36 TB plain / 34.09 TB encrypted
    34: { plain: 69040000000000, encrypted: 68500000000000 }, // 70.37 TB theoretical -> 69.04 TB plain / 68.50 TB encrypted
    35: { plain: 138540000000000, encrypted: 137450000000000 }, // 140.74 TB theoretical -> 138.54 TB plain / 137.45 TB encrypted
    36: { plain: 277720000000000, encrypted: 275530000000000 }, // 281.47 TB theoretical -> 277.72 TB plain / 275.53 TB encrypted
    37: { plain: 556350000000000, encrypted: 551970000000000 }, // 562.95 TB theoretical -> 556.35 TB plain / 551.97 TB encrypted
    38: { plain: 1110000000000000, encrypted: 1110000000000000 }, // 1.13 PB theoretical -> 1.11 PB plain / 1.11 PB encrypted
    39: { plain: 2230000000000000, encrypted: 2210000000000000 }, // 2.25 PB theoretical -> 2.23 PB plain / 2.21 PB encrypted
    40: { plain: 4460000000000000, encrypted: 4430000000000000 }, // 4.50 PB theoretical -> 4.46 PB plain / 4.43 PB encrypted
    41: { plain: 8930000000000000, encrypted: 8860000000000000 }, // 9.01 PB theoretical -> 8.93 PB plain / 8.86 PB encrypted
};
