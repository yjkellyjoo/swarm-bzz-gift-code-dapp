// Shared data shapes used across pages, components and lib helpers.
//
// These live here rather than in a component file so that pages can import them
// without pulling in a component (and so they survive that component being
// removed).

/**
 * Operator-supplied settings for generating and funding gift codes.
 *
 * Gift drive settings live with the gift drive step, not here - that step runs
 * on a pasted key list as readily as on this session's codes, so its settings
 * are not part of the generate form.
 */
export interface WalletFormData {
  xdaiAmount: number;
  xbzzAmount: number;
  walletCount: number;
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
