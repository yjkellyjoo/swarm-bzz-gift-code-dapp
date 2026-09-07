// Shared data shapes used across pages, components and lib helpers.
//
// These live here rather than in a component file so that pages can import them
// without pulling in a component (and so they survive that component being
// removed).

/**
 * Operator-supplied settings for the Generate Codes flow.
 *
 * The `batch*` fields describe the postage batch each gift wallet will buy for
 * itself. `batchAmount` is the per-chunk amount in PLUR, kept as a string
 * because it routinely exceeds `Number.MAX_SAFE_INTEGER`.
 */
export interface WalletFormData {
  xdaiAmount: number;
  xbzzAmount: number;
  walletCount: number;
  batchDepth: number;
  batchAmount: string;
  batchEncrypted: boolean;
  batchImmutable: boolean;
}

/**
 * One generated gift wallet, plus whatever we know about it so far.
 *
 * Everything past `address` is filled in by later steps in the flow, so a code
 * that has been generated but not yet funded or stamped is still a valid
 * `GiftCode`.
 */
export interface GiftCode {
  privateKey: string;
  address: string;
  xdaiBalance?: string;
  xbzzBalance?: string;
  /** Postage batch owned by this wallet, once created. */
  batchId?: string;
  batchDepth?: number;
  /** Per-chunk amount in PLUR, as a decimal string. */
  batchAmount?: string;
  /** Whether the batch was sized for encrypted uploads. Not an on-chain property. */
  encrypted?: boolean;
  /** The batch's on-chain immutable flag. */
  immutable?: boolean;
  /** Why batch creation failed for this wallet, if it did. */
  batchError?: string;
}
