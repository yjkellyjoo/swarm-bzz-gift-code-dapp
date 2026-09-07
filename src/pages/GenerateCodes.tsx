import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { generateWallets } from '../lib/walletUtils';
import { useWalletConnection } from '../hooks/useWalletConnection';
import { getConnectedWalletSigner } from '../lib/signerUtils';
import { fundWalletsWithSigner, checkFundingBalanceWithSigner, validateFundParams, checkTokenAllowance } from '../lib/gnosisContract';
import { QRCodeGrid } from '../components/QRCodeGrid';
import { GiftKitExport } from '../components/GiftKitExport';
import { getGlobalRpcUrl } from '../components/WalletBalanceCard';
import type { GiftCode, WalletFormData } from '../lib/types';
import {
  createBatchesForWallets,
  formatBytes,
  formatBzz,
  formatTtl,
  getBatchCostPlur,
  getBatchTtlSeconds,
  getEffectiveCapacityBytes,
  readChainBatchLimits,
  validateBatchParams,
} from '../lib/postageBatch';
import type { BatchParams, BatchProgress, ChainBatchLimits } from '../lib/postageBatch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ethers } from 'ethers';
import { CONFIG } from '../config';

const GENERATE_FORM_STORAGE_KEY = 'swarm-bzz-gift-code-dapp:generate-form';

function getDefaultFormData(): WalletFormData {
  return {
    xdaiAmount: CONFIG.DEFAULT_XDAI_AMOUNT,
    xbzzAmount: CONFIG.DEFAULT_XBZZ_AMOUNT,
    walletCount: CONFIG.DEFAULT_WALLET_COUNT,
    batchDepth: CONFIG.DEFAULT_BATCH_DEPTH,
    batchAmount: CONFIG.DEFAULT_BATCH_AMOUNT,
    batchEncrypted: CONFIG.DEFAULT_BATCH_ENCRYPTED,
    batchImmutable: CONFIG.DEFAULT_BATCH_IMMUTABLE,
  };
}

function loadFormFromStorage(): WalletFormData {
  const defaults = getDefaultFormData();

  try {
    const stored = localStorage.getItem(GENERATE_FORM_STORAGE_KEY);
    if (!stored) return defaults;

    const parsed = JSON.parse(stored) as Partial<WalletFormData>;
    return {
      xdaiAmount:
        typeof parsed.xdaiAmount === 'number'
          ? parsed.xdaiAmount
          : defaults.xdaiAmount,
      xbzzAmount:
        typeof parsed.xbzzAmount === 'number'
          ? parsed.xbzzAmount
          : defaults.xbzzAmount,
      walletCount:
        typeof parsed.walletCount === 'number'
          ? parsed.walletCount
          : defaults.walletCount,
      batchDepth:
        typeof parsed.batchDepth === 'number'
          ? parsed.batchDepth
          : defaults.batchDepth,
      batchAmount:
        typeof parsed.batchAmount === 'string'
          ? parsed.batchAmount
          : defaults.batchAmount,
      batchEncrypted:
        typeof parsed.batchEncrypted === 'boolean'
          ? parsed.batchEncrypted
          : defaults.batchEncrypted,
      batchImmutable:
        typeof parsed.batchImmutable === 'boolean'
          ? parsed.batchImmutable
          : defaults.batchImmutable,
    };
  } catch {
    return defaults;
  }
}

/** Parse the per-chunk amount, which is too large for a number input. */
function parseBatchAmount(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

function getGenerateButtonLabel(walletCount: number, isLoading: boolean): string {
  if (isLoading) return 'Generating...';
  return walletCount === 1
    ? 'Generate 1 code'
    : `Generate ${walletCount} codes`;
}

export function GenerateCodes() {
  const { isConnected, isCorrectNetwork } = useWalletConnection();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [giftCodes, setGiftCodes] = useState<GiftCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<{
    hasSufficientBalance: boolean;
    currentBalance: bigint;
    requiredBalance: bigint;
    shortfall: bigint;
    xbzzBalance: bigint;
    xbzzRequired: bigint;
    xbzzShortfall: bigint;
    hasSufficientXBZZ: boolean;
  } | null>(null);
  const [form, setForm] = useState<WalletFormData>(loadFormFromStorage);
  const [isCreatingBatches, setIsCreatingBatches] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [hasFunded, setHasFunded] = useState(false);
  const [chainLimits, setChainLimits] = useState<ChainBatchLimits | null>(null);
  const balanceCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem(GENERATE_FORM_STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  // The contract's price and minimums move over time, so validation and the
  // cost readout both need the live values.
  useEffect(() => {
    if (!isMounted || !isConnected || !isCorrectNetwork) return;

    let cancelled = false;
    (async () => {
      try {
        const provider = new ethers.JsonRpcProvider(getGlobalRpcUrl(), CONFIG.CHAIN_ID);
        const limits = await readChainBatchLimits(provider);
        if (cancelled) return;

        setChainLimits(limits);

        // The contract's minimum tracks the storage price, so both the built-in
        // default and a value saved from a previous session can fall below it.
        // Raise it rather than leaving the form in a state that can only fail.
        // Never lowers a value the operator deliberately set higher.
        setForm(prev => {
          const current = parseBatchAmount(prev.batchAmount);
          if (current !== null && current >= limits.minimumInitialBalancePerChunk) {
            return prev;
          }
          return { ...prev, batchAmount: limits.minimumInitialBalancePerChunk.toString() };
        });
      } catch (err) {
        console.error('Failed to read postage batch limits:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isMounted, isConnected, isCorrectNetwork]);

  const batchAmountPlur = useMemo(() => parseBatchAmount(form.batchAmount), [form.batchAmount]);

  const batchParams = useMemo<BatchParams | null>(() => {
    if (batchAmountPlur === null) return null;
    return {
      depth: form.batchDepth,
      amountPerChunk: batchAmountPlur,
      encrypted: form.batchEncrypted,
      immutable: form.batchImmutable,
    };
  }, [batchAmountPlur, form.batchDepth, form.batchEncrypted, form.batchImmutable]);

  const batchSummary = useMemo(() => {
    if (!batchParams) {
      return {
        errors: ['Batch amount must be a whole number of PLUR'] as string[],
        costPlur: null as bigint | null,
        totalCostPlur: null as bigint | null,
        capacityBytes: 0,
        ttlSeconds: 0,
        xbzzPerWalletPlur: null as bigint | null,
        xbzzCoversBatch: false,
      };
    }

    const costPlur = getBatchCostPlur(batchParams.depth, batchParams.amountPerChunk);
    const errors = validateBatchParams(batchParams, chainLimits);

    // How much xBZZ each wallet is being given, vs what its batch will cost.
    let xbzzPerWalletPlur: bigint | null = null;
    try {
      if (Number.isFinite(form.xbzzAmount)) {
        xbzzPerWalletPlur = ethers.parseUnits(String(form.xbzzAmount), CONFIG.BZZ_DECIMALS);
      }
    } catch {
      xbzzPerWalletPlur = null;
    }

    return {
      errors,
      costPlur: costPlur as bigint | null,
      totalCostPlur: (costPlur * BigInt(Math.max(Math.trunc(form.walletCount) || 0, 0))) as bigint | null,
      capacityBytes: getEffectiveCapacityBytes(batchParams.depth, batchParams.encrypted),
      ttlSeconds: chainLimits ? getBatchTtlSeconds(batchParams.amountPerChunk, chainLimits.lastPrice) : 0,
      xbzzPerWalletPlur,
      xbzzCoversBatch: xbzzPerWalletPlur !== null && xbzzPerWalletPlur >= costPlur,
    };
  }, [batchParams, chainLimits, form.walletCount, form.xbzzAmount]);

  const canCreateBatches =
    giftCodes.length > 0 &&
    hasFunded &&
    !isCreatingBatches &&
    batchSummary.errors.length === 0 &&
    batchSummary.xbzzCoversBatch;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    const newValue =
      type === 'checkbox' ? checked : type === 'number' ? Number(value) : value;

    setForm((prev) => {
      const updatedForm = {
        ...prev,
        [name]: newValue,
      };

      // Only check balance when user is connected and on correct network
      // and when the form values that affect balance change
      if (isMounted && isConnected && isCorrectNetwork && ['xdaiAmount', 'xbzzAmount', 'walletCount'].includes(name)) {
        // Clear any existing timeout
        if (balanceCheckTimeoutRef.current) {
          clearTimeout(balanceCheckTimeoutRef.current);
        }
        // Set new timeout with the updated form values
        balanceCheckTimeoutRef.current = setTimeout(() => {
          checkBalanceOnFormChange(updatedForm);
        }, 500);
      }

      return updatedForm;
    });
  }

  const checkBalanceOnFormChange = useCallback(async (currentForm: WalletFormData) => {
    console.log('checkBalanceOnFormChange called with:', currentForm);
    try {
      const signer = await getConnectedWalletSigner();
      if (!signer) return;

      const balanceCheck = await checkFundingBalanceWithSigner(
        signer,
        currentForm.xdaiAmount,
        currentForm.xbzzAmount,
        currentForm.walletCount
      );

      setBalanceInfo({
        hasSufficientBalance: balanceCheck.hasSufficientBalance,
        currentBalance: balanceCheck.currentBalance,
        requiredBalance: balanceCheck.requiredBalance,
        shortfall: balanceCheck.shortfall,
        xbzzBalance: balanceCheck.xbzzBalance,
        xbzzRequired: balanceCheck.xbzzRequired,
        xbzzShortfall: balanceCheck.xbzzShortfall,
        hasSufficientXBZZ: balanceCheck.hasSufficientXBZZ,
      });
    } catch (error) {
      console.error('Failed to check balance on form change:', error);
      // Don't show error to user for background balance checks
    }
  }, [isConnected, isCorrectNetwork]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBalanceInfo(null);
    setIsLoading(true);
    try {
      if (!isConnected) throw new Error('Please connect your wallet first');
      if (!isCorrectNetwork) throw new Error('Please switch to Gnosis Chain');
      if (form.walletCount < 1) throw new Error('Must generate at least 1 wallet');
      if (form.xdaiAmount < 0.01) throw new Error('xDAI amount must be at least 0.01');

      // Check balance BEFORE generating wallets
      const signer = await getConnectedWalletSigner();
      if (!signer) {
        throw new Error('Failed to get wallet signer');
      }

      const balanceCheck = await checkFundingBalanceWithSigner(
        signer,
        form.xdaiAmount,
        form.xbzzAmount,
        form.walletCount
      );

      setBalanceInfo({
        hasSufficientBalance: balanceCheck.hasSufficientBalance,
        currentBalance: balanceCheck.currentBalance,
        requiredBalance: balanceCheck.requiredBalance,
        shortfall: balanceCheck.shortfall,
        xbzzBalance: balanceCheck.xbzzBalance,
        xbzzRequired: balanceCheck.xbzzRequired,
        xbzzShortfall: balanceCheck.xbzzShortfall,
        hasSufficientXBZZ: balanceCheck.hasSufficientXBZZ,
      });

      // Only generate wallets if there are sufficient funds
      if (!balanceCheck.hasSufficientBalance || !balanceCheck.hasSufficientXBZZ) {
        const errors = [];
        if (!balanceCheck.hasSufficientBalance) {
          errors.push(`xDAI: You need ${ethers.formatEther(balanceCheck.requiredBalance)} xDAI but have ${ethers.formatEther(balanceCheck.currentBalance)} xDAI. Shortfall: ${ethers.formatEther(balanceCheck.shortfall)} xDAI`);
        }
        if (!balanceCheck.hasSufficientXBZZ) {
          errors.push(`xBZZ: You need ${ethers.formatUnits(balanceCheck.xbzzRequired, 16)} xBZZ but have ${ethers.formatUnits(balanceCheck.xbzzBalance, 16)} xBZZ. Shortfall: ${ethers.formatUnits(balanceCheck.xbzzShortfall, 16)} xBZZ`);
        }
        throw new Error(`Insufficient balance to fund wallets. ${errors.join('; ')}`);
      }

      // Generate wallets only if balance is sufficient
      const wallets = generateWallets(form.walletCount);
      setHasFunded(false);
      setGiftCodes(wallets.map(w => ({ privateKey: w.privateKey, address: w.address })));
      setSuccess(`Generated ${form.walletCount} gift wallet${form.walletCount !== 1 ? 's' : ''} - Ready to fund with ${form.xdaiAmount} xDAI and ${form.xbzzAmount} xBZZ each`);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate codes');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFundWallets() {
    if (giftCodes.length === 0) {
      setError('No wallets to fund. Please generate codes first.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsFunding(true);

    try {
      if (!isConnected) throw new Error('Please connect your wallet first');
      if (!isCorrectNetwork) throw new Error('Please switch to Gnosis Chain');

      const signer = await getConnectedWalletSigner();
      if (!signer) {
        throw new Error('Failed to get wallet signer');
      }

      // Check balance again before funding
      const balanceCheck = await checkFundingBalanceWithSigner(
        signer,
        form.xdaiAmount,
        form.xbzzAmount,
        form.walletCount
      );

      if (!balanceCheck.hasSufficientBalance || !balanceCheck.hasSufficientXBZZ) {
        const errors = [];
        if (!balanceCheck.hasSufficientBalance) {
          errors.push(`xDAI: You need ${ethers.formatEther(balanceCheck.requiredBalance)} xDAI but have ${ethers.formatEther(balanceCheck.currentBalance)} xDAI. Shortfall: ${ethers.formatEther(balanceCheck.shortfall)} xDAI`);
        }
        if (!balanceCheck.hasSufficientXBZZ) {
          errors.push(`xBZZ: You need ${ethers.formatUnits(balanceCheck.xbzzRequired, 16)} xBZZ but have ${ethers.formatUnits(balanceCheck.xbzzBalance, 16)} xBZZ. Shortfall: ${ethers.formatUnits(balanceCheck.xbzzShortfall, 16)} xBZZ`);
        }
        throw new Error(`Insufficient balance. ${errors.join('; ')}`);
      }

      // Prepare funding parameters
      const addresses = giftCodes.map(code => code.address);
      const xdaiAmountWei = ethers.parseEther(form.xdaiAmount.toString());
      const xbzzAmountWei = ethers.parseUnits(form.xbzzAmount.toString(), CONFIG.BZZ_DECIMALS);

      const fundParams = {
        tokenAddress: CONFIG.XBZZ_TOKEN_ADDRESS,
        tokenAmount: xbzzAmountWei,
        nativeAmount: xdaiAmountWei,
        addresses: addresses,
      };

      // Validate parameters
      const validationErrors = validateFundParams(fundParams);
      if (validationErrors.length > 0) {
        throw new Error(`Validation errors: ${validationErrors.join(', ')}`);
      }

      // Check token allowance before funding
      const totalTokenAmount = xbzzAmountWei * BigInt(addresses.length);
      const currentAllowance = await checkTokenAllowance(signer, CONFIG.XBZZ_TOKEN_ADDRESS, CONFIG.FUND_CONTRACT_ADDRESS);

      if (currentAllowance < totalTokenAmount) {
        setSuccess(`Approving xBZZ tokens for the fund contract... This may require a separate transaction.`);
      }

      // Execute funding transaction
      const transaction = await fundWalletsWithSigner(signer, fundParams);

      setSuccess(`Funding transaction submitted! Transaction hash: ${transaction.hash}. Please wait for confirmation.`);

      // Wait for transaction confirmation
      const receipt = await transaction.wait();

      // The wallets pay for their own postage batches, so batch creation can
      // only start once the funding transaction is actually mined.
      setHasFunded(true);

      if (receipt) {
        setSuccess(`Successfully funded ${form.walletCount} wallet${form.walletCount !== 1 ? 's' : ''} with ${form.xdaiAmount} xDAI and ${form.xbzzAmount} xBZZ each. Transaction hash: ${receipt.hash}`);
      } else {
        setSuccess(`Successfully funded ${form.walletCount} wallet${form.walletCount !== 1 ? 's' : ''} with ${form.xdaiAmount} xDAI and ${form.xbzzAmount} xBZZ each. Transaction hash: ${transaction.hash}`);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fund wallets');
    } finally {
      setIsFunding(false);
    }
  }

  async function handleCreateBatches() {
    if (giftCodes.length === 0) {
      setError('No wallets to stamp. Please generate codes first.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsCreatingBatches(true);
    setBatchProgress({ current: 0, total: giftCodes.length, processing: '' });

    try {
      if (!isConnected) throw new Error('Please connect your wallet first');
      if (!isCorrectNetwork) throw new Error('Please switch to Gnosis Chain');
      if (!batchParams) throw new Error('Batch amount must be a whole number of PLUR');

      const rpcUrl = getGlobalRpcUrl();

      // Re-read the limits: price moves, and a stale minimum would only show
      // up as a revert part-way through the run.
      const provider = new ethers.JsonRpcProvider(rpcUrl, CONFIG.CHAIN_ID);
      const limits = await readChainBatchLimits(provider);
      setChainLimits(limits);

      const validationErrors = validateBatchParams(batchParams, limits);
      if (validationErrors.length > 0) {
        throw new Error(`Invalid batch settings: ${validationErrors.join('; ')}`);
      }

      const results = await createBatchesForWallets(
        giftCodes,
        batchParams,
        rpcUrl,
        setBatchProgress
      );

      const resultsByAddress = new Map(
        results.map(result => [result.address.toLowerCase(), result])
      );

      setGiftCodes(prev =>
        prev.map(code => {
          const result = resultsByAddress.get(code.address.toLowerCase());
          if (!result) return code;

          return {
            ...code,
            batchId: result.batchId,
            batchDepth: result.batchId ? batchParams.depth : undefined,
            batchAmount: result.batchId ? batchParams.amountPerChunk.toString() : undefined,
            encrypted: result.batchId ? batchParams.encrypted : undefined,
            immutable: result.batchId ? batchParams.immutable : undefined,
            batchError: result.error,
          };
        })
      );

      const created = results.filter(result => result.batchId).length;
      const failed = results.length - created;

      if (failed === 0) {
        setSuccess(`Created ${created} postage batch${created !== 1 ? 'es' : ''}.`);
      } else {
        setError(
          `${created} batch${created !== 1 ? 'es' : ''} created, ${failed} failed. ` +
          `See the individual codes below for details.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create postage batches');
    } finally {
      setIsCreatingBatches(false);
      setBatchProgress(null);
    }
  }

  function handleCopyCodes() {
    if (giftCodes.length === 0) return;

    // Once batches exist a bare key list would lose the batch ID, so switch to
    // a tab-separated table. parsePrivateKeys understands this shape, so the
    // export can still be pasted into Recover Funds.
    const hasBatches = giftCodes.some(code => code.batchId);

    const codesText = hasBatches
      ? [
          ['privateKey', 'address', 'batchId'].join('\t'),
          ...giftCodes.map(code =>
            [code.privateKey, code.address, code.batchId ?? ''].join('\t')
          ),
        ].join('\n')
      : giftCodes.map(code => code.privateKey).join('\n');

    navigator.clipboard.writeText(codesText);
    setSuccess(
      hasBatches
        ? 'Gift codes copied to clipboard (private key, address, batch ID)'
        : 'Gift codes copied to clipboard'
    );
  }

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (balanceCheckTimeoutRef.current) {
        clearTimeout(balanceCheckTimeoutRef.current);
      }
    };
  }, []);

  // Remove the automatic balance check on mount to avoid setState during render
  // Balance checks will only happen when user interacts with form inputs

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="walletCount">Number of QR codes (gift wallets) to generate</Label>
          <Input
            id="walletCount"
            name="walletCount"
            type="number"
            min={1}
            max={100}
            value={form.walletCount}
            onChange={handleChange}
            disabled={isLoading}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="xdaiAmount">xDAI per gift wallet</Label>
          <Input
            id="xdaiAmount"
            name="xdaiAmount"
            type="number"
            min={0.01}
            step={0.01}
            value={form.xdaiAmount}
            onChange={handleChange}
            disabled={isLoading}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="xbzzAmount">xBZZ per gift wallet</Label>
          <Input
            id="xbzzAmount"
            name="xbzzAmount"
            type="number"
            min={0}
            step={0.01}
            value={form.xbzzAmount}
            onChange={handleChange}
            disabled={isLoading}
            required
          />
        </div>

        <div className="space-y-4 rounded-lg border border-slate-300 bg-white/50 p-4">
          <div>
            <div className="font-semibold">Postage batch</div>
            <p className="text-sm text-slate-600">
              Each gift wallet buys its own batch after funding, using the xBZZ it was
              given. The recipient's Bee node can stamp with it as soon as they import
              the key.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="batchDepth">Batch depth</Label>
            <Input
              id="batchDepth"
              name="batchDepth"
              type="number"
              min={CONFIG.MIN_BATCH_DEPTH}
              max={CONFIG.MAX_BATCH_DEPTH}
              value={form.batchDepth}
              onChange={handleChange}
              disabled={isLoading || isCreatingBatches}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="batchAmount">Amount per chunk (PLUR)</Label>
            <Input
              id="batchAmount"
              name="batchAmount"
              type="text"
              inputMode="numeric"
              value={form.batchAmount}
              onChange={handleChange}
              disabled={isLoading || isCreatingBatches}
              required
            />
            {chainLimits && (
              <p className="text-xs text-slate-600">
                Contract minimum is {chainLimits.minimumInitialBalancePerChunk.toString()} PLUR
                (about 24 hours at the current price of {chainLimits.lastPrice.toString()} PLUR
                per chunk per block).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                id="batchEncrypted"
                name="batchEncrypted"
                type="checkbox"
                className="h-4 w-4"
                checked={form.batchEncrypted}
                onChange={handleChange}
                disabled={isLoading || isCreatingBatches}
              />
              <Label htmlFor="batchEncrypted" className="font-normal">
                Size for encrypted uploads
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="batchImmutable"
                name="batchImmutable"
                type="checkbox"
                className="h-4 w-4"
                checked={form.batchImmutable}
                onChange={handleChange}
                disabled={isLoading || isCreatingBatches}
              />
              <Label htmlFor="batchImmutable" className="font-normal">
                Immutable batch (rejects overwrites once full)
              </Label>
            </div>

            <p className="text-xs text-slate-600">Erasure coding: None (fixed)</p>
          </div>

          <div className="space-y-1 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-medium">Per batch</div>
            <div>Effective capacity: {formatBytes(batchSummary.capacityBytes)}</div>
            <div>
              Estimated lifetime:{' '}
              {chainLimits ? formatTtl(batchSummary.ttlSeconds) : 'connect to estimate'}
            </div>
            <div>
              Cost: {batchSummary.costPlur !== null ? `${formatBzz(batchSummary.costPlur)} xBZZ` : '-'}
            </div>
            <div className="pt-1 font-medium">
              Total for {form.walletCount} wallet{form.walletCount !== 1 ? 's' : ''}:{' '}
              {batchSummary.totalCostPlur !== null
                ? `${formatBzz(batchSummary.totalCostPlur)} xBZZ`
                : '-'}
            </div>
          </div>

          {batchSummary.errors.length > 0 && (
            <Alert>
              <AlertTitle>Batch settings need attention</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {batchSummary.errors.map(message => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {batchSummary.errors.length === 0 &&
            batchSummary.costPlur !== null &&
            !batchSummary.xbzzCoversBatch && (
              <Alert>
                <AlertTitle>Not enough xBZZ per wallet</AlertTitle>
                <AlertDescription>
                  Each batch costs {formatBzz(batchSummary.costPlur)} xBZZ, but each wallet
                  is only being funded with {form.xbzzAmount} xBZZ. Raise the xBZZ per
                  wallet, or lower the batch depth or amount.
                </AlertDescription>
              </Alert>
            )}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {getGenerateButtonLabel(form.walletCount, isLoading)}
        </Button>
      </form>

      {error && (
        <Alert>
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-green-500 bg-green-50 text-green-800">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {balanceInfo && (
        <Alert className={balanceInfo.hasSufficientBalance && balanceInfo.hasSufficientXBZZ ? "border-green-500 bg-green-50 text-green-800" : "border-red-500 bg-red-50 text-red-800"}>
          <AlertTitle>
            {balanceInfo.hasSufficientBalance && balanceInfo.hasSufficientXBZZ ? 'Sufficient Balance' : 'Insufficient Balance'}
          </AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="font-medium">xDAI Balance:</div>
                <div>Current Balance: {ethers.formatEther(balanceInfo.currentBalance)} xDAI</div>
                <div>Required for Funding: {ethers.formatEther(balanceInfo.requiredBalance)} xDAI</div>
                {!balanceInfo.hasSufficientBalance && (
                  <div>Shortfall: {ethers.formatEther(balanceInfo.shortfall)} xDAI</div>
                )}
              </div>

              <div className="space-y-1">
                <div className="font-medium">xBZZ Balance:</div>
                <div>Current Balance: {ethers.formatUnits(balanceInfo.xbzzBalance, 16)} xBZZ</div>
                <div>Required for Funding: {ethers.formatUnits(balanceInfo.xbzzRequired, 16)} xBZZ</div>
                {!balanceInfo.hasSufficientXBZZ && (
                  <div>Shortfall: {ethers.formatUnits(balanceInfo.xbzzShortfall, 16)} xBZZ</div>
                )}
              </div>

              {(!balanceInfo.hasSufficientBalance || !balanceInfo.hasSufficientXBZZ) && (
                <div className="mt-2 text-sm">
                  Please add more {!balanceInfo.hasSufficientBalance ? 'xDAI' : ''}{!balanceInfo.hasSufficientBalance && !balanceInfo.hasSufficientXBZZ ? ' and ' : ''}{!balanceInfo.hasSufficientXBZZ ? 'xBZZ' : ''} to your wallet before generating gift wallets.
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {giftCodes.length > 0 && (
        <Card className="mt-8">
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="font-semibold text-lg">Generated Gift Codes</div>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  type="button"
                  onClick={handleFundWallets}
                  disabled={isFunding || !balanceInfo?.hasSufficientBalance || !balanceInfo?.hasSufficientXBZZ || giftCodes.length === 0}
                >
                  {isFunding ? 'Funding...' : 'Fund Wallets'}
                </Button>
                <Button
                  variant="default"
                  type="button"
                  onClick={handleCreateBatches}
                  disabled={!canCreateBatches}
                  title={
                    !hasFunded
                      ? 'Fund the wallets first - they pay for their own batches'
                      : undefined
                  }
                >
                  {isCreatingBatches ? 'Creating batches...' : 'Create Postage Batches'}
                </Button>
                <Button variant="secondary" type="button" onClick={handleCopyCodes}>
                  Copy Codes
                </Button>
              </div>
            </div>

            {!hasFunded && (
              <p className="text-sm text-slate-600">
                Fund the wallets before creating batches - each wallet pays for its own
                batch, so the funding transaction has to be mined first.
              </p>
            )}

            {batchProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    Creating batch {batchProgress.current} of {batchProgress.total}
                  </span>
                  <span className="font-mono text-xs">{batchProgress.processing}</span>
                </div>
                <div className="h-2 w-full rounded bg-slate-200">
                  <div
                    className="h-2 rounded bg-green-600 transition-all"
                    style={{
                      width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-600">
                  Two transactions per wallet (approve, then create). Leave this tab open.
                </p>
              </div>
            )}

            <QRCodeGrid giftCodes={giftCodes} />
          </CardContent>
        </Card>
      )}

      <Card className="mt-8">
        <CardContent className="p-6">
          <GiftKitExport giftCodes={giftCodes} />
        </CardContent>
      </Card>
    </div>
  );
}
